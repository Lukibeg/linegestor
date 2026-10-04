/**
 * O envio automático (Patch 1.7, decisão 0038): todo dia, no horário escolhido, o Gestor monta um
 * PDF com os gráficos e os relatórios dos Chamados que a administração marcou e manda pelo
 * WhatsApp, pela API da FlwChat, para os números da lista. Os números são **do dia atual**.
 *
 * Como o PDF é feito: o Gestor abre a própria página `/envio-diario` num Chromium sem janela (o
 * mesmo navegador de sempre, só que dentro do servidor) e manda imprimir em A4. Assim o PDF é
 * exatamente a tela — os mesmos gráficos, as mesmas contas —, sem um segundo jeito de desenhar.
 * A página entra com uma **chave de uso único** que vale 5 minutos (não há login no robô).
 *
 * Como chega no WhatsApp: a API recebe o endereço do arquivo e baixa de lá. Por isso o PDF fica
 * num endereço público difícil de adivinhar (`/api/envio/arquivo/<id>/<nome>.pdf`), que **vence em
 * 7 dias**. O arquivo continua guardado (em `CONFIG_DIR/envios`) e a administração baixa pelo
 * histórico quando quiser — nada é apagado.
 *
 * O token da FlwChat fica no cofre cifrado, como o do LineChat; nunca volta para a tela.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Db } from '@gestor/db';
import {
  CATALOGO_RELATORIOS, FiltrosChamadosSchema, FiltrosRelatoriosSchema, horaDeEnviar, MarcadosEnvioSchema, momentoEmBrasilia, montarPainel,
  nomeDoPdf, numeroLegivel, proximoEnvio, textoDoEnvio,
  type AjustesEnvio, type Destinatario, type ItemPainel, type MarcadosEnvio, type ResumoChamados, type UltimoEnvioAgendado,
} from '@gestor/shared';
import * as audit from './audit.js';
import * as chamados from './chamados.js';
import * as integ from './integracoes.js';
import type { SecretsVault } from './secrets.js';

// ---------- o que fica guardado ----------

export type RegistroEnvio = {
  id: string;
  em: string;
  /** o dia (Brasília) dos números do PDF */
  dia: string;
  gatilho: 'agendado' | 'manual' | 'teste';
  /** quem mandou (manual ou teste); null = o relógio */
  quem: string | null;
  ok: boolean;
  mensagem: string;
  pdf: { id: string; nome: string; bytes: number } | null;
  /** os títulos do que foi no PDF */
  itens: string[];
  destinatarios: Array<{ nome: string; numero: string; ok: boolean; mensagem: string }>;
};

export type AjustesEnvioGuardados = Omit<AjustesEnvio, 'token'> & {
  configuradoEm: string | null;
  configuradoPor: string | null;
  ultimoAgendado: UltimoEnvioAgendado;
  /** os últimos envios, do mais novo para o mais velho */
  historico: RegistroEnvio[];
};
type MarcadosGuardados = MarcadosEnvio & { atualizadoEm: string | null; atualizadoPor: string | null };

/** Quantos envios o histórico guarda (a auditoria guarda todos). */
const HISTORICO = 60;
/** O link público do PDF vale tantos dias (o arquivo continua guardado depois). */
export const LINK_VALE_DIAS = 7;

// ---------- as ferramentas (os testes trocam: sem Chromium e sem FlwChat de verdade) ----------

export type Ferramentas = {
  gerarPdf: (app: FastifyInstance, chave: string) => Promise<Buffer>;
  fetchFn: typeof fetch;
  agora: () => Date;
  /** onde os PDFs ficam guardados */
  pasta: string;
};
let ferramentas: Ferramentas = {
  gerarPdf: gerarPdfComChromium,
  fetchFn: (...a) => fetch(...a),
  agora: () => new Date(),
  pasta: process.env.ENVIOS_DIR ?? join(integ.CONFIG_DIR, 'envios'),
};
export function trocarFerramentas(f: Partial<Ferramentas>) { ferramentas = { ...ferramentas, ...f }; }

// ---------- ler e gravar ----------

export async function lerAjustes(db: Db) {
  const { valor, temSegredo } = await integ.ler<AjustesEnvioGuardados>(db, 'envio-automatico');
  return { valor, temToken: temSegredo };
}

export async function lerMarcados(db: Db): Promise<MarcadosGuardados> {
  const { valor } = await integ.ler<MarcadosGuardados>(db, 'envio-automatico-marcados');
  // guardado com um relatório que saiu do catálogo não derruba nada: some
  const p = MarcadosEnvioSchema.safeParse({ relatorios: valor.relatorios ?? [], graficos: valor.graficos ?? [] });
  const m = p.success ? p.data : { relatorios: (valor.relatorios ?? []).filter((id) => CATALOGO_RELATORIOS.some((r) => r.id === id && r.id !== 'raiox')), graficos: [] };
  return { ...m, atualizadoEm: valor.atualizadoEm ?? null, atualizadoPor: valor.atualizadoPor ?? null };
}

export async function gravarMarcados(db: Db, m: MarcadosEnvio, quem: { id: string; name: string }) {
  await integ.gravar(db, 'envio-automatico-marcados', { ...m, atualizadoEm: new Date().toISOString(), atualizadoPor: quem.name }, { userId: quem.id });
  return lerMarcados(db);
}

/** Grava os ajustes da tela, sem tocar no histórico (que o relógio pode estar escrevendo). */
export async function gravarAjustes(db: Db, vault: SecretsVault, a: AjustesEnvio, quem: { id: string; name: string }) {
  const { valor } = await lerAjustes(db);
  let secretId: string | null | undefined;
  if (a.token) {
    const atual = await db.query.settings.findFirst({ where: (t, { eq: igual }) => igual(t.id, 'envio-automatico') });
    secretId = await vault.save(db, { existingId: atual?.secretId ?? null, label: 'Token da API da FlwChat (envio automático)', plain: a.token, userId: quem.id });
  }
  const { token: _fora, ...resto } = a;
  const novo: AjustesEnvioGuardados = { ...valor, ...resto, configuradoEm: new Date().toISOString(), configuradoPor: quem.name };
  await integ.gravar(db, 'envio-automatico', novo, { secretId, userId: quem.id });
  return { antes: valor, depois: novo, trocouToken: !!a.token };
}

/** Muda só o que o envio escreve (histórico e o agendado do dia), relendo o resto na hora. */
async function anotar(db: Db, fn: (v: AjustesEnvioGuardados) => Partial<AjustesEnvioGuardados>) {
  const { valor } = await lerAjustes(db);
  await integ.gravar(db, 'envio-automatico', { ...valor, ...fn(valor) });
}

// ---------- os títulos do que está marcado ----------

/** O nome de cada gráfico da tela de Chamados, como aparece nela. */
function tituloDoGrafico(id: string, resumo: ResumoChamados): string | null {
  if (id === 'serie') return resumo.serie.titulo;
  if (id === 'etapa') return 'Por etapa';
  if (id === 'responsavel') return 'Por responsável';
  if (id === 'etiqueta') return 'Por etiqueta';
  const c = resumo.porCampo.find((x) => `campo:${x.key}` === id);
  return c ? `Por ${c.name.toLowerCase()}` : null;
}

/** O que está marcado, com o nome de cada um e na ordem do PDF (a das telas). */
export async function marcadosComTitulo(db: Db) {
  const m = await lerMarcados(db);
  const op = await chamados.opcoes(db);
  const painel = await chamados.lerPainel(db);
  const resumo = await chamados.resumo(db, FiltrosChamadosSchema.parse({ aba: 'hoje' }));
  const itens = montarPainel(painel.itens, op.campos);
  const graficos = itens.filter((x) => m.graficos.includes(x.id)).map((x) => ({ id: x.id, titulo: tituloDoGrafico(x.id, resumo) })).filter((x): x is { id: string; titulo: string } => !!x.titulo);
  const arr = await chamados.lerArrumacao(db);
  const relatorios = arr.ordem.filter((id) => m.relatorios.includes(id)).map((id) => ({ id, titulo: CATALOGO_RELATORIOS.find((r) => r.id === id)!.titulo }));
  return { graficos, relatorios, atualizadoEm: m.atualizadoEm, atualizadoPor: m.atualizadoPor, painelItens: itens, resumo, op };
}

// ---------- o pacote da página do PDF ----------

/**
 * Tudo o que a página `/envio-diario` precisa para se desenhar sozinha: os números e os gráficos
 * da aba Hoje, e os relatórios com o período = hoje (o Fechamento do mês, com o mês de agora).
 */
export async function pacote(db: Db) {
  const agora = ferramentas.agora();
  const momento = momentoEmBrasilia(agora);
  const t = await marcadosComTitulo(db);
  const ids = t.relatorios.map((r) => r.id);
  const relatorios = ids.length
    ? await chamados.relatorios(db, FiltrosRelatoriosSchema.parse({ de: momento.dia, ate: momento.dia, mes: momento.dia.slice(0, 7) }))
    : null;
  const graficos: ItemPainel[] = t.painelItens.filter((x) => t.graficos.some((g) => g.id === x.id));
  return {
    geradoEm: agora.toISOString(),
    dia: momento.dia,
    hhmm: momento.hhmm,
    painelNome: t.op.painelNome,
    primeiroDia: t.op.primeiroDia,
    resumo: t.resumo,
    graficos,
    relatorioIds: ids,
    relatorios,
    titulos: [...t.graficos.map((g) => g.titulo), ...t.relatorios.map((r) => r.titulo)],
  };
}

// ---------- a chave de uso único da página ----------

const chaves = new Map<string, number>();
export function novaChave(): string {
  const agora = Date.now();
  for (const [c, vence] of chaves) if (vence < agora) chaves.delete(c);
  const c = randomBytes(24).toString('base64url');
  chaves.set(c, agora + 5 * 60_000);
  return c;
}
export function chaveValida(c: string | undefined): boolean {
  if (!c) return false;
  const vence = chaves.get(c);
  return !!vence && vence > Date.now();
}
export function esquecerChave(c: string) { chaves.delete(c); }

// ---------- o PDF ----------

/** Onde o Chromium abre a página: no próprio servidor (produção) ou na interface de desenvolvimento. */
function enderecoDaPagina(app: FastifyInstance): string {
  if (process.env.ENVIO_PAGINA_URL) return process.env.ENVIO_PAGINA_URL.replace(/\/+$/, '');
  return app.config.NODE_ENV === 'production' ? `http://127.0.0.1:${app.config.PORT}` : app.config.WEB_ORIGIN.split(',')[0]!.trim();
}

/** O endereço público do Gestor, para a FlwChat baixar o PDF (o do .env: https://DOMINIO). */
export function enderecoPublico(app: FastifyInstance): string {
  return (process.env.ENVIO_ENDERECO_PUBLICO ?? app.config.WEB_ORIGIN.split(',')[0]!).trim().replace(/\/+$/, '');
}

/** O Chromium do sistema (no contêiner, o pacote "chromium" do Debian). */
function caminhoDoChromium(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  for (const c of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']) if (existsSync(c)) return c;
  return undefined;
}

async function gerarPdfComChromium(app: FastifyInstance, chave: string): Promise<Buffer> {
  const { chromium } = await import('playwright-core');
  const executablePath = caminhoDoChromium();
  if (!executablePath) throw new Error('O Chromium não está instalado no servidor (ele monta o PDF). Atualize a imagem do sistema.');
  const navegador = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
  try {
    const pagina = await navegador.newPage({ viewport: { width: 820, height: 1160 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });
    // não espera o "load" inteiro: se as fontes do Google não abrirem, o PDF sai com as do sistema
    await pagina.goto(`${enderecoDaPagina(app)}/envio-diario?chave=${encodeURIComponent(chave)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await pagina.waitForSelector('[data-envio-pronto], [data-envio-erro]', { timeout: 60_000 });
    const erro = await pagina.locator('[data-envio-erro]').first().getAttribute('data-envio-erro', { timeout: 1_000 }).catch(() => null);
    if (erro) throw new Error(`A página do PDF não abriu: ${erro}`);
    await pagina.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 6_000))]));
    await pagina.waitForTimeout(300); // os gráficos terminam de se desenhar
    const pdf = await pagina.pdf({
      format: 'A4', printBackground: true,
      margin: { top: '12mm', bottom: '14mm', left: '11mm', right: '11mm' },
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#6b7a8c;font-family:sans-serif">Ingline Gestão · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
    });
    return Buffer.from(pdf);
  } finally {
    await navegador.close().catch(() => {});
  }
}

/** Monta o PDF de agora (abre a página com uma chave nova e joga a chave fora no fim). */
export async function montarPdf(app: FastifyInstance): Promise<Buffer> {
  const chave = novaChave();
  try { return await ferramentas.gerarPdf(app, chave); } finally { esquecerChave(chave); }
}

const ID_PDF = /^[a-f0-9]{36}$/;
async function guardarPdf(pdf: Buffer): Promise<string> {
  await mkdir(ferramentas.pasta, { recursive: true, mode: 0o700 });
  const id = randomBytes(18).toString('hex');
  await writeFile(join(ferramentas.pasta, `${id}.pdf`), pdf, { mode: 0o600 });
  return id;
}

/** Um PDF guardado. `soNoPrazo`: o link público, que vence em 7 dias. */
export async function lerPdf(id: string, soNoPrazo: boolean): Promise<Buffer | null> {
  if (!ID_PDF.test(id)) return null;
  const arq = join(ferramentas.pasta, `${id}.pdf`);
  try {
    if (soNoPrazo) {
      const s = await stat(arq);
      if (ferramentas.agora().getTime() - s.mtimeMs > LINK_VALE_DIAS * 86_400_000) return null;
    }
    return await readFile(arq);
  } catch { return null; }
}

// ---------- a FlwChat ----------

/**
 * Manda uma mensagem pela API da FlwChat: o número que envia (o canal conectado lá), o destino, o
 * texto e, se houver, o endereço do arquivo (a API baixa de lá e entrega como documento, com o
 * texto de legenda). O formato é o da API da plataforma por trás dela (a mesma do LineChat).
 */
export async function mandarMensagem(
  a: Pick<AjustesEnvioGuardados, 'url' | 'remetente'>, token: string, para: string, texto: string, arquivo?: string,
): Promise<string> {
  const auth = /^bearer\s/i.test(token) ? token : `Bearer ${token}`;
  const corpo = { from: a.remetente, to: para, body: { text: texto, ...(arquivo ? { fileUrl: arquivo } : {}) } };
  let r: Response;
  try {
    r = await ferramentas.fetchFn(a.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
      body: JSON.stringify(corpo), signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const motivo = e instanceof Error ? (e.name === 'TimeoutError' ? 'não respondeu em 30 segundos' : e.message) : String(e);
    throw new Error(`Não consegui falar com a FlwChat (${motivo}). Confira o endereço da API.`);
  }
  const resposta = (await r.text().catch(() => '')).slice(0, 300);
  if (r.status === 401 || r.status === 403) throw new Error(`A FlwChat recusou o token (${r.status}). Gere um novo lá e salve aqui.`);
  if (!r.ok) throw new Error(`A FlwChat respondeu ${r.status}${resposta ? `: ${resposta}` : ''}`);
  return `Aceito pela FlwChat (${r.status}).`;
}

// ---------- o envio ----------

export type ResultadoEnvio = RegistroEnvio;
let emAndamento: Promise<ResultadoEnvio> | null = null;

/** Confere o que falta para mandar. Devolve a frase do que falta, ou null se está tudo certo. */
function falta(a: AjustesEnvioGuardados, temToken: boolean, para: Destinatario[]): string | null {
  if (!a.url) return 'Falta o endereço da API da FlwChat (Administração › Envio automático).';
  if (!temToken) return 'Falta o token da API da FlwChat (Administração › Envio automático).';
  if (!a.remetente) return 'Falta o número que envia (Administração › Envio automático).';
  if (!para.length) return 'Nenhum número ativo na lista.';
  return null;
}

/**
 * Monta o PDF de agora e manda para a lista (ou só para um número). Um envio de cada vez: se o
 * relógio e um clique chegarem juntos, o segundo espera o primeiro.
 */
export async function enviar(
  app: FastifyInstance,
  o: { gatilho: 'agendado' | 'manual' | 'teste'; quem?: { id: string; name: string } | null; destinatarioId?: string },
): Promise<ResultadoEnvio> {
  while (emAndamento) await emAndamento.catch(() => null);
  const p = enviarAgora(app, o);
  emAndamento = p;
  try { return await p; } finally { emAndamento = null; }
}

async function enviarAgora(
  app: FastifyInstance,
  o: { gatilho: 'agendado' | 'manual' | 'teste'; quem?: { id: string; name: string } | null; destinatarioId?: string },
): Promise<ResultadoEnvio> {
  const db = app.db;
  const agora = ferramentas.agora();
  const momento = momentoEmBrasilia(agora);
  const { valor, temToken } = await lerAjustes(db);
  const lista = valor.destinatarios.filter((d) => (o.destinatarioId ? d.id === o.destinatarioId : d.ativo));
  const registro: RegistroEnvio = {
    id: randomBytes(8).toString('hex'), em: agora.toISOString(), dia: momento.dia, gatilho: o.gatilho, quem: o.quem?.name ?? null,
    ok: false, mensagem: '', pdf: null, itens: [], destinatarios: [],
  };
  const token = temToken ? await integ.segredo(db, app.vault, 'envio-automatico') : null;
  const motivo = falta(valor, !!token, lista) ?? (o.destinatarioId && !lista.length ? 'Esse número não está na lista.' : null);

  if (motivo) {
    registro.mensagem = motivo;
  } else if (o.gatilho === 'teste') {
    // o teste: só um texto, para conferir o token, o número que envia e o destino
    const texto = 'Teste do Ingline Gestão: o envio automático dos relatórios dos Chamados está funcionando. Pode ignorar esta mensagem.';
    registro.destinatarios = await Promise.all(lista.map(async (d) => {
      try { return { nome: d.nome, numero: d.numero, ok: true, mensagem: await mandarMensagem(valor, token!, d.numero, texto) }; }
      catch (e) { return { nome: d.nome, numero: d.numero, ok: false, mensagem: e instanceof Error ? e.message : 'Falhou' }; }
    }));
  } else {
    try {
      const p = await pacote(db);
      registro.itens = p.titulos;
      const pdf = await montarPdf(app);
      const id = await guardarPdf(pdf);
      const nome = nomeDoPdf(momento.dia);
      registro.pdf = { id, nome, bytes: pdf.length };
      const link = `${enderecoPublico(app)}/api/envio/arquivo/${id}/${nome}`;
      const texto = textoDoEnvio({ dia: momento.dia, hhmm: momento.hhmm, painel: p.painelNome, numeros: p.resumo.kpis.map((k) => ({ label: k.label, valor: k.valor })), titulos: p.titulos });
      for (const d of lista) {
        try { registro.destinatarios.push({ nome: d.nome, numero: d.numero, ok: true, mensagem: await mandarMensagem(valor, token!, d.numero, texto, link) }); }
        catch (e) { registro.destinatarios.push({ nome: d.nome, numero: d.numero, ok: false, mensagem: e instanceof Error ? e.message : 'Falhou' }); }
      }
    } catch (e) {
      registro.mensagem = e instanceof Error ? e.message : 'Falhou ao montar o PDF';
    }
  }

  const certos = registro.destinatarios.filter((d) => d.ok).length;
  registro.ok = !registro.mensagem && certos > 0 && certos === registro.destinatarios.length;
  if (!registro.mensagem) {
    registro.mensagem = certos === registro.destinatarios.length
      ? `${o.gatilho === 'teste' ? 'Teste enviado' : 'Enviado'} para ${certos} ${certos === 1 ? 'número' : 'números'}.`
      : `${certos} de ${registro.destinatarios.length} receberam; ${registro.destinatarios.filter((d) => !d.ok).map((d) => `${d.nome}: ${d.mensagem}`).join(' · ')}`;
  }

  await anotar(db, (v) => ({
    historico: [registro, ...(v.historico ?? [])].slice(0, HISTORICO),
    ...(o.gatilho === 'agendado' ? {
      ultimoAgendado: {
        dia: momento.dia, ok: registro.ok, em: agora.toISOString(),
        tentativas: (v.ultimoAgendado?.dia === momento.dia ? v.ultimoAgendado.tentativas : 0) + 1,
      },
    } : {}),
  }));
  const oque = o.gatilho === 'teste' ? 'mensagem de teste' : `PDF dos Chamados${registro.itens.length ? ` (${registro.itens.length} ${registro.itens.length === 1 ? 'item' : 'itens'})` : ''}`;
  const quem = o.quem ? `${o.quem.name} mandou` : 'Envio automático:';
  await audit.record(db, {
    userId: o.quem?.id ?? null, action: o.gatilho === 'teste' ? 'envio_automatico_teste' : 'envio_automatico', entityType: 'settings', entityId: 'envio-automatico',
    summary: `${quem} ${oque} pelo WhatsApp — ${registro.ok ? registro.mensagem : `falhou: ${registro.mensagem}`}`,
    after: { gatilho: o.gatilho, dia: registro.dia, itens: registro.itens, destinatarios: registro.destinatarios.map((d) => ({ nome: d.nome, numero: numeroLegivel(d.numero), ok: d.ok })) },
  }, app.log);
  return registro;
}

// ---------- o relógio ----------

/** A cada minuto, confere se está na hora do envio do dia (só quando ligado). */
export function iniciarEnvioAutomatico(app: FastifyInstance) {
  const tick = async () => {
    try {
      const { valor } = await lerAjustes(app.db);
      if (!horaDeEnviar(valor, ferramentas.agora(), valor.ultimoAgendado ?? null)) return;
      const r = await enviar(app, { gatilho: 'agendado' });
      if (!r.ok) app.log.warn({ motivo: r.mensagem }, 'envio automático falhou');
    } catch (err) {
      app.log.error({ err }, 'envio automático: erro inesperado');
    }
  };
  setTimeout(() => void tick(), 30_000);
  setInterval(() => void tick(), 60_000);
}

/** O que a tela de Administração › Envio automático mostra. */
export async function paraTela(app: FastifyInstance) {
  const { valor, temToken } = await lerAjustes(app.db);
  const t = await marcadosComTitulo(app.db);
  return {
    ativo: valor.ativo, url: valor.url, remetente: valor.remetente, horario: valor.horario, dias: valor.dias, destinatarios: valor.destinatarios,
    temToken,
    configuradoEm: valor.configuradoEm ?? null, configuradoPor: valor.configuradoPor ?? null,
    proximo: proximoEnvio(valor, ferramentas.agora(), valor.ultimoAgendado ?? null),
    historico: (valor.historico ?? []).slice(0, 20),
    marcados: { graficos: t.graficos, relatorios: t.relatorios, atualizadoEm: t.atualizadoEm, atualizadoPor: t.atualizadoPor },
    enderecoPublico: enderecoPublico(app),
    linkValeDias: LINK_VALE_DIAS,
  };
}
