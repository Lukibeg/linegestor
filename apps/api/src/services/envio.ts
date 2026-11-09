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
 *
 * Depois de mandar, o Gestor **conclui a conversa** que a mensagem abriu na FlwChat (2.0.1, o pedido do
 * Luan: "ele envia e conclui… ele é só um aviso"), com a opção ligada (vem ligada). Se a FlwChat não
 * deixar, a mensagem continua entregue, e o histórico diz que a conversa ficou aberta e por quê.
 *
 * **Desde o 2.4.5 (decisão 0061), cada envio é de um painel** (*"o envio automático tá saindo do antigo… ele
 * tem que ficar modular… para eu poder enviar de qualquer painel"*): a lista de envios, cada um com a origem
 * (um painel de chamados, ou o Legado do Helena), o horário, os dias, os números e o que vai no PDF. A
 * ligação com a FlwChat é uma só. O envio que existia (do Legado) passou para o painel Suporte; o que estava
 * marcado no Legado foi junto, onde tem par. O relógio confere cada envio; um envio de cada vez.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { ticketPanels, type Db } from '@gestor/db';
import {
  agendadoDeHoje, CATALOGO_RELATORIOS, envioDeHoje, enviosDoGuardado, FiltrosChamadosSchema, FiltrosRelatoriosSchema, horaDeEnviar, ID_DO_ENVIO_DE_ANTES,
  MarcadosDoPainelSchema, MarcadosEnvioSchema, marcadosDoLegadoNoPainel, marcadosDoPainelComTitulo, momentoEmBrasilia, montarPainel, NOME_DO_LEGADO,
  nomeDoPdf, numeroLegivel, ORIGEM_LEGADO, pacoteDoPainel, proximoEnvio, schemaDosMarcados, textoDoEnvio,
  type AjustesEnvio, type Destinatario, type Envio, type ItemPainel, type MarcadosEnvio, type PacoteDoPainel, type ResumoChamados, type UltimoEnvioAgendado,
} from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';
import * as audit from './audit.js';
import * as chamados from './chamados.js';
import * as integ from './integracoes.js';
import * as relatoriosDosPaineis from './atendimento/relatorios.js';
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
  /** `conversa`: concluída depois de mandar, ou aberta (a FlwChat não deixou); sem ela, a opção estava desligada */
  destinatarios: Array<{ nome: string; numero: string; ok: boolean; mensagem: string; conversa?: 'concluida' | 'aberta' }>;
  /** de qual envio e de onde saiu (2.4.5); os de antes não têm: eram do envio único, do Legado */
  envioId?: string | null;
  origem?: string | null;
  origemNome?: string | null;
};

/** Um envio da lista (2.4.5), com como foi o agendado de hoje. */
export type EnvioGuardado = Envio & { ultimoAgendado: UltimoEnvioAgendado };
export type AjustesEnvioGuardados = Omit<AjustesEnvio, 'token' | 'envios'> & {
  envios: EnvioGuardado[];
  configuradoEm: string | null;
  configuradoPor: string | null;
  /** os últimos envios (de todos), do mais novo para o mais velho */
  historico: RegistroEnvio[];
};
type Marcacao = MarcadosEnvio & { atualizadoEm: string | null; atualizadoPor: string | null };
/** O do Legado em cima (como até o 2.4.4) e o de cada painel em `paineis` (2.4.5). */
type MarcadosGuardados = Marcacao & { paineis?: Record<string, Marcacao> };

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
  /** a espera entre uma pergunta e outra à FlwChat (os testes não esperam) */
  esperar: (ms: number) => Promise<void>;
};
let ferramentas: Ferramentas = {
  gerarPdf: gerarPdfComChromium,
  fetchFn: (...a) => fetch(...a),
  agora: () => new Date(),
  pasta: process.env.ENVIOS_DIR ?? join(integ.CONFIG_DIR, 'envios'),
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
};
export function trocarFerramentas(f: Partial<Ferramentas>) { ferramentas = { ...ferramentas, ...f }; }

// ---------- ler e gravar ----------

/** O painel que substituiu o Legado do Helena: recebe o envio de antes do 2.4.5. */
export const PAINEL_QUE_SUBSTITUIU_O_LEGADO = 'painel-suporte';

/** Para onde vai o envio de antes do 2.4.5: o Suporte; sem ele, o primeiro painel de chamados; sem nenhum, o Legado. */
async function painelPadrao(db: Db): Promise<string> {
  const ps = await db.select({ id: ticketPanels.id }).from(ticketPanels)
    .where(and(isNull(ticketPanels.deletedAt), ne(ticketPanels.kind, 'vendas'))).orderBy(ticketPanels.sortOrder);
  return ps.find((p) => p.id === PAINEL_QUE_SUBSTITUIU_O_LEGADO)?.id ?? ps[0]?.id ?? ORIGEM_LEGADO;
}

/**
 * Os ajustes, sempre no jeito do 2.4.5 (a lista de envios). O guardado até o 2.4.4 (um envio só, do Legado) é lido
 * como a lista na hora (`enviosDoGuardado`) e fica gravado assim na próxima gravação (o relógio, a tela).
 */
export async function lerAjustes(db: Db): Promise<{ valor: AjustesEnvioGuardados; temToken: boolean }> {
  const { valor: v, temSegredo } = await integ.ler<Record<string, any>>(db, 'envio-automatico');
  const envios = enviosDoGuardado(v, Array.isArray(v.envios) ? ORIGEM_LEGADO : await painelPadrao(db));
  const valor: AjustesEnvioGuardados = {
    url: v.url ?? '', remetente: v.remetente ?? '', concluirConversa: v.concluirConversa !== false,
    envios: envios.map((e) => ({ ...e, ultimoAgendado: e.ultimoAgendado ?? null })),
    configuradoEm: v.configuradoEm ?? null, configuradoPor: v.configuradoPor ?? null, historico: v.historico ?? [],
  };
  return { valor, temToken: temSegredo };
}

/** O que vai no PDF de uma origem: o Legado (os ids dele) ou um painel (2.4.5). */
export async function lerMarcados(db: Db, origem: string = ORIGEM_LEGADO): Promise<Marcacao> {
  const { valor } = await integ.ler<MarcadosGuardados>(db, 'envio-automatico-marcados');
  // guardado com um relatório que saiu do catálogo não derruba nada: some
  const p = MarcadosEnvioSchema.safeParse({ relatorios: valor.relatorios ?? [], graficos: valor.graficos ?? [] });
  const doLegado = p.success ? p.data : { relatorios: (valor.relatorios ?? []).filter((id) => CATALOGO_RELATORIOS.some((r) => r.id === id && r.id !== 'raiox')), graficos: [] };
  if (origem === ORIGEM_LEGADO) return { ...doLegado, atualizadoEm: valor.atualizadoEm ?? null, atualizadoPor: valor.atualizadoPor ?? null };
  const g = valor.paineis?.[origem];
  if (g) {
    const q = MarcadosDoPainelSchema.safeParse({ relatorios: g.relatorios ?? [], graficos: g.graficos ?? [] });
    return { ...(q.success ? q.data : { relatorios: [], graficos: [] }), atualizadoEm: g.atualizadoEm ?? null, atualizadoPor: g.atualizadoPor ?? null };
  }
  // ninguém marcou nada num painel ainda (o primeiro dia do 2.4.5): o painel que recebeu o envio de antes fica com o do Legado
  if (!valor.paineis && origem === (await painelPadrao(db))) {
    return { ...marcadosDoLegadoNoPainel(doLegado), atualizadoEm: valor.atualizadoEm ?? null, atualizadoPor: valor.atualizadoPor ?? null };
  }
  return { relatorios: [], graficos: [], atualizadoEm: null, atualizadoPor: null };
}

export async function gravarMarcados(db: Db, origem: string, m: MarcadosEnvio, quem: { id: string; name: string }) {
  const { valor } = await integ.ler<MarcadosGuardados>(db, 'envio-automatico-marcados');
  const marca = { ...schemaDosMarcados(origem).parse(m), atualizadoEm: new Date().toISOString(), atualizadoPor: quem.name };
  // a primeira marcação num painel guarda também o que o painel do envio de antes herdou do Legado (senão some)
  let paineis = valor.paineis;
  if (!paineis && origem !== ORIGEM_LEGADO) {
    const padrao = await painelPadrao(db);
    paineis = padrao !== ORIGEM_LEGADO && padrao !== origem ? { [padrao]: await lerMarcados(db, padrao) } : {};
  }
  const novo: MarcadosGuardados = origem === ORIGEM_LEGADO
    ? { ...valor, ...marca }
    : { ...valor, paineis: { ...(paineis ?? {}), [origem]: marca } };
  await integ.gravar(db, 'envio-automatico-marcados', novo, { userId: quem.id });
  return lerMarcados(db, origem);
}

/** As origens que um envio pode ter: os painéis de chamados (os de Vendas têm o relatório deles) e o Legado. */
export async function origens(app: FastifyInstance): Promise<Array<{ id: string; nome: string; sigla: string | null; ativo: boolean }>> {
  const ps = await relatoriosDosPaineis.paineisDoEnvio(app);
  return [...ps.map((p) => ({ id: p.id, nome: p.nome, sigla: p.sigla, ativo: p.ativo })), { id: ORIGEM_LEGADO, nome: NOME_DO_LEGADO, sigla: null, ativo: true }];
}

const nomeDaOrigem = (os: Awaited<ReturnType<typeof origens>>, origem: string) => os.find((o) => o.id === origem)?.nome ?? 'um painel que saiu';

/**
 * Grava os ajustes da tela, sem tocar no histórico (que o relógio pode estar escrevendo).
 * Salvar depois de uma falha do envio agendado libera o dia de novo, com 3 tentativas novas: quem
 * salva quase sempre acabou de corrigir o que faltava (1.7.1). Trocar o horário também vale já
 * para hoje (veja `agendadoDeHoje`).
 */
export async function gravarAjustes(app: FastifyInstance, a: AjustesEnvio, quem: { id: string; name: string }) {
  const db = app.db;
  const { valor } = await lerAjustes(db);
  // a origem tem de ser um painel de chamados (ou o Legado); o desativado fica (o envio diz por que não manda)
  const os = await origens(app);
  const desconhecida = a.envios.find((e) => !os.some((o) => o.id === e.origem));
  if (desconhecida) throw new BadRequest('Um envio está num painel que não existe (ou que é de vendas). Escolha outro painel.');
  let secretId: string | null | undefined;
  if (a.token) {
    const atual = await db.query.settings.findFirst({ where: (t, { eq: igual }) => igual(t.id, 'envio-automatico') });
    secretId = await app.vault.save(db, { existingId: atual?.secretId ?? null, label: 'Token da API da FlwChat (envio automático)', plain: a.token, userId: quem.id });
  }
  const { token: _fora, envios, ...resto } = a;
  const novo: AjustesEnvioGuardados = {
    ...valor, ...resto,
    // como foi o de hoje, de cada envio; salvar depois de uma falha libera o dia de novo (1.7.1)
    envios: envios.map((e) => {
      const u = valor.envios.find((x) => x.id === e.id)?.ultimoAgendado ?? null;
      return { ...e, ultimoAgendado: u && !u.ok ? null : u };
    }),
    configuradoEm: new Date().toISOString(), configuradoPor: quem.name,
  };
  await integ.gravar(db, 'envio-automatico', novo, { secretId, userId: quem.id });
  return { antes: valor, depois: novo, trocouToken: !!a.token, origens: os };
}

/** Como a auditoria escreve a lista: "Suporte, ligado às 18:00, para 2 números; Desenvolvimento, desligado". */
export function resumoDosEnvios(v: Pick<AjustesEnvioGuardados, 'envios'>, os: Awaited<ReturnType<typeof origens>>): string {
  if (!v.envios.length) return 'nenhum envio';
  return v.envios.map((e) => {
    const n = e.destinatarios.filter((d) => d.ativo).length;
    return `${nomeDaOrigem(os, e.origem)}, ${e.ativo ? `ligado às ${e.horario}, para ${n} ${n === 1 ? 'número' : 'números'}` : 'desligado'}`;
  }).join('; ');
}

/** Muda só o que o envio escreve (histórico e o agendado do dia), relendo o resto na hora. */
async function anotar(db: Db, fn: (v: AjustesEnvioGuardados) => Partial<AjustesEnvioGuardados>) {
  const { valor } = await lerAjustes(db);
  await integ.gravar(db, 'envio-automatico', { ...valor, ...fn(valor) });
}

/** O histórico de um envio (os de antes do 2.4.5 são do envio que havia). */
const doEnvio = (h: RegistroEnvio[], envioId: string) => h.filter((x) => (x.envioId ?? ID_DO_ENVIO_DE_ANTES) === envioId);

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

/** O que está marcado no Legado, com o nome de cada um e na ordem do PDF (a das telas). */
export async function marcadosComTitulo(db: Db) {
  const m = await lerMarcados(db, ORIGEM_LEGADO);
  const op = await chamados.opcoes(db);
  const painel = await chamados.lerPainel(db);
  const resumo = await chamados.resumo(db, FiltrosChamadosSchema.parse({ aba: 'hoje' }));
  const itens = montarPainel(painel.itens, op.campos);
  const graficos = itens.filter((x) => m.graficos.includes(x.id)).map((x) => ({ id: x.id, titulo: tituloDoGrafico(x.id, resumo) })).filter((x): x is { id: string; titulo: string } => !!x.titulo);
  const arr = await chamados.lerArrumacao(db);
  const relatorios = arr.ordem.filter((id) => m.relatorios.includes(id)).map((id) => ({ id, titulo: CATALOGO_RELATORIOS.find((r) => r.id === id)!.titulo }));
  return { graficos, relatorios, atualizadoEm: m.atualizadoEm, atualizadoPor: m.atualizadoPor, painelItens: itens, resumo, op };
}

/** O que está marcado numa origem, com o nome de cada um (a tela de Administração › Envio automático). */
async function marcadosDaOrigem(app: FastifyInstance, origem: string) {
  if (origem === ORIGEM_LEGADO) {
    const t = await marcadosComTitulo(app.db);
    return { graficos: t.graficos, relatorios: t.relatorios, atualizadoEm: t.atualizadoEm, atualizadoPor: t.atualizadoPor, problema: null as string | null };
  }
  const m = await lerMarcados(app.db, origem);
  try {
    // os títulos dos gráficos vêm da Visão geral do painel (o nome de cada campo); sem nada marcado, nem precisa ler
    let t: { graficos: Array<{ id: string; titulo: string }>; relatorios: Array<{ id: string; titulo: string }> } = { graficos: [], relatorios: [] };
    if (m.graficos.length || m.relatorios.length) {
      const r = await relatoriosDosPaineis.paraOEnvio(app, origem, false, ferramentas.agora());
      t = marcadosDoPainelComTitulo(r.visao, r.arrumacao, m);
    }
    return { graficos: t.graficos.map((g) => ({ id: g.id, titulo: g.titulo })), relatorios: t.relatorios, atualizadoEm: m.atualizadoEm, atualizadoPor: m.atualizadoPor, problema: null as string | null };
  } catch (e) {
    return { graficos: m.graficos.map((id) => ({ id, titulo: id })), relatorios: m.relatorios.map((id) => ({ id, titulo: id })), atualizadoEm: m.atualizadoEm, atualizadoPor: m.atualizadoPor, problema: e instanceof Error ? e.message : 'O painel não abriu.' };
  }
}

// ---------- o pacote da página do PDF ----------

/** O pacote do Legado (até o 2.4.4, o único). */
export type PacoteDoLegado = Awaited<ReturnType<typeof pacoteDoLegado>>;
export type Pacote = PacoteDoLegado | PacoteDoPainel;

/**
 * Tudo o que a página `/envio-diario` precisa para se desenhar sozinha, de um envio: de um painel (2.4.5), os
 * números e os gráficos da Visão geral de hoje e os relatórios com o período = hoje; do Legado, os da aba Hoje
 * dos tickets do LineChat. Sem o envio, a origem pedida (o "Ver como fica" de um painel) ou o primeiro envio.
 */
export async function pacote(app: FastifyInstance, o: { envioId?: string | null; origem?: string | null } = {}): Promise<Pacote> {
  const { valor } = await lerAjustes(app.db);
  const e = o.envioId ? valor.envios.find((x) => x.id === o.envioId) : null;
  if (o.envioId && !e) throw new NotFound('Envio');
  const origem = e?.origem ?? o.origem ?? valor.envios[0]?.origem ?? ORIGEM_LEGADO;
  if (origem === ORIGEM_LEGADO) return pacoteDoLegado(app.db);
  const agora = ferramentas.agora();
  const m = await lerMarcados(app.db, origem);
  const r = await relatoriosDosPaineis.paraOEnvio(app, origem, m.relatorios.length > 0, agora);
  return pacoteDoPainel({ agora, visao: r.visao, relatorios: r.relatorios, arrumacao: r.arrumacao, marcados: m });
}

async function pacoteDoLegado(db: Db) {
  const agora = ferramentas.agora();
  const momento = momentoEmBrasilia(agora);
  const t = await marcadosComTitulo(db);
  const ids = t.relatorios.map((r) => r.id);
  const relatorios = ids.length
    ? await chamados.relatorios(db, FiltrosRelatoriosSchema.parse({ de: momento.dia, ate: momento.dia, mes: momento.dia.slice(0, 7) }))
    : null;
  const graficos: ItemPainel[] = t.painelItens.filter((x) => t.graficos.some((g) => g.id === x.id));
  return {
    tipo: 'legado' as const,
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

/** Cada chave abre a página de um envio só (2.4.5): o robô não escolhe o que imprime. */
const chaves = new Map<string, { vence: number; envioId: string | null }>();
export function novaChave(envioId: string | null = null): string {
  const agora = Date.now();
  for (const [c, x] of chaves) if (x.vence < agora) chaves.delete(c);
  const c = randomBytes(24).toString('base64url');
  chaves.set(c, { vence: agora + 5 * 60_000, envioId });
  return c;
}
export function chaveValida(c: string | undefined): boolean {
  if (!c) return false;
  const x = chaves.get(c);
  return !!x && x.vence > Date.now();
}
/** O envio da página que a chave abre (null: o primeiro). */
export const envioDaChave = (c: string) => chaves.get(c)?.envioId ?? null;
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

/** Monta o PDF de agora de um envio (abre a página com uma chave nova e joga a chave fora no fim). */
export async function montarPdf(app: FastifyInstance, envioId: string | null = null): Promise<Buffer> {
  const chave = novaChave(envioId);
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

const autorizacao = (token: string) => (/^bearer\s/i.test(token) ? token : `Bearer ${token}`);

/** O JSON de uma resposta (vazio quando não é JSON). */
function lerJson(texto: string): Record<string, unknown> {
  try { const j = JSON.parse(texto) as unknown; return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {}; } catch { return {}; }
}

/**
 * Manda uma mensagem pela API da FlwChat: o número que envia (o canal conectado lá), o destino, o
 * texto e, se houver, o endereço do arquivo (a API baixa de lá e entrega como documento, com o
 * texto de legenda). O formato é o da API da plataforma por trás dela (a mesma do LineChat).
 * Devolve a frase para o histórico e o que a FlwChat respondeu (a mensagem, com a conversa dela).
 */
export async function mandarMensagem(
  a: Pick<AjustesEnvioGuardados, 'url' | 'remetente'>, token: string, para: string, texto: string, arquivo?: string,
): Promise<{ mensagem: string; resposta: Record<string, unknown> }> {
  const corpo = { from: a.remetente, to: para, body: { text: texto, ...(arquivo ? { fileUrl: arquivo } : {}) } };
  let r: Response;
  try {
    r = await ferramentas.fetchFn(a.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: autorizacao(token) },
      body: JSON.stringify(corpo), signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const motivo = e instanceof Error ? (e.name === 'TimeoutError' ? 'não respondeu em 30 segundos' : e.message) : String(e);
    throw new Error(`Não consegui falar com a FlwChat (${motivo}). Confira o endereço da API.`);
  }
  const resposta = (await r.text().catch(() => '')).slice(0, 4000);
  if (r.status === 401 || r.status === 403) throw new Error(`A FlwChat recusou o token (${r.status}). Gere um novo lá e salve aqui.`);
  if (!r.ok) throw new Error(`A FlwChat respondeu ${r.status}${resposta ? `: ${resposta.slice(0, 300)}` : ''}`);
  return { mensagem: `Aceito pela FlwChat (${r.status}).`, resposta: lerJson(resposta) };
}

// ---------- concluir a conversa (2.0.1) ----------

/** O começo do endereço da API: o de envio sem o "/chat/v1/message/send" (o resto da API mora ao lado). */
export function baseDaApi(url: string): string {
  const m = /^(.*?)\/chat\/v\d+\/message\/send(?:-sync)?\/?(?:\?.*)?$/i.exec(url.trim());
  if (m) return m[1]!;
  try { return new URL(url).origin; } catch { return url.trim().replace(/\/+$/, ''); }
}

/** A conversa (a sessão) em que a mensagem entrou, do jeito que a FlwChat responder: `sessionId` ou `session.id`. */
export function conversaDaResposta(j: Record<string, unknown>): string | null {
  const sessao = j.session && typeof j.session === 'object' ? (j.session as Record<string, unknown>).id : undefined;
  const id = j.sessionId ?? sessao;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/** Quantas vezes pergunta à FlwChat pela conversa da mensagem (ela entra na fila e ganha a conversa num instante). */
const PERGUNTAS_PELA_CONVERSA = 4;

async function chamarApi(url: string, metodo: 'GET' | 'PUT', token: string, corpo?: unknown) {
  try {
    const r = await ferramentas.fetchFn(url, {
      method: metodo, headers: { Accept: 'application/json', Authorization: autorizacao(token), ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}), signal: AbortSignal.timeout(15_000),
    });
    const texto = (await r.text().catch(() => '')).slice(0, 4000);
    return { ok: r.ok, status: r.status, texto, json: lerJson(texto) };
  } catch (e) {
    return { ok: false, status: 0, texto: e instanceof Error ? (e.name === 'TimeoutError' ? 'não respondeu em 15 segundos' : e.message) : String(e), json: {} };
  }
}

/**
 * Conclui a conversa que a mensagem abriu (ou em que entrou) na FlwChat — o relatório é só um aviso e não
 * fica pendente esperando alguém. A conversa vem na resposta do envio; quando não vem (a mensagem ainda
 * está na fila), pergunta pela mensagem algumas vezes. Concluída do jeito de sempre: sem reabrir sozinha
 * e sem parar robô (`PUT /chat/v1/session/{id}/complete`). Nunca lança: devolve o que aconteceu.
 */
export async function concluirConversa(
  a: Pick<AjustesEnvioGuardados, 'url'>, token: string, resposta: Record<string, unknown>,
): Promise<{ ok: boolean; mensagem: string }> {
  const base = baseDaApi(a.url);
  let conversa = conversaDaResposta(resposta);
  const idMensagem = typeof resposta.id === 'string' && resposta.id.trim() ? resposta.id.trim() : null;
  for (let i = 0; !conversa && idMensagem && i < PERGUNTAS_PELA_CONVERSA; i++) {
    if (i) await ferramentas.esperar(1_500);
    const r = await chamarApi(`${base}/chat/v1/message/${encodeURIComponent(idMensagem)}`, 'GET', token);
    if (r.ok) conversa = conversaDaResposta(r.json);
  }
  if (!conversa) return { ok: false, mensagem: 'a conversa ficou aberta: a FlwChat não disse qual é a conversa' };
  const r = await chamarApi(`${base}/chat/v1/session/${encodeURIComponent(conversa)}/complete`, 'PUT', token, { reactivateOnNewMessage: false, stopBotInExecution: false });
  if (r.ok) return { ok: true, mensagem: 'conversa concluída' };
  const porque = r.status === 0 ? `não consegui falar com a FlwChat (${r.texto})` : `a FlwChat respondeu ${r.status}${r.texto ? `: ${r.texto.slice(0, 200)}` : ''}`;
  return { ok: false, mensagem: `a conversa ficou aberta: ${porque}` };
}

/** Manda para uma pessoa da lista e, com a opção ligada, conclui a conversa (a falha ao concluir não desfaz o envio). */
async function mandarPara(
  a: AjustesEnvioGuardados, token: string, d: Destinatario, texto: string, arquivo?: string,
): Promise<RegistroEnvio['destinatarios'][number]> {
  try {
    const enviado = await mandarMensagem(a, token, d.numero, texto, arquivo);
    if (a.concluirConversa === false) return { nome: d.nome, numero: d.numero, ok: true, mensagem: enviado.mensagem };
    const c = await concluirConversa(a, token, enviado.resposta);
    return { nome: d.nome, numero: d.numero, ok: true, mensagem: `${enviado.mensagem.replace(/\.$/, '')}; ${c.mensagem}.`, conversa: c.ok ? 'concluida' : 'aberta' };
  } catch (e) {
    return { nome: d.nome, numero: d.numero, ok: false, mensagem: e instanceof Error ? e.message : 'Falhou' };
  }
}

/** O que o histórico diz das conversas: concluídas, ou quais ficaram abertas e por quê. */
function sobreAsConversas(ds: RegistroEnvio['destinatarios']): string {
  const certos = ds.filter((d) => d.ok && d.conversa);
  if (!certos.length) return '';
  const abertas = certos.filter((d) => d.conversa === 'aberta');
  if (!abertas.length) return certos.length === 1 ? ' (a conversa foi concluída)' : ' (as conversas foram concluídas)';
  const porque = abertas.map((d) => `${d.nome}: ${d.mensagem.replace(/^.*?a conversa ficou aberta: /, '').replace(/\.$/, '')}`).join(' · ');
  return `; ${abertas.length === 1 ? '1 conversa ficou aberta' : `${abertas.length} conversas ficaram abertas`} (${porque})`;
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

/** O que cada envio recebe de quem pede: o gatilho, quem e qual envio (sem: o primeiro), e só um número, se for o caso. */
type PedidoDeEnvio = { gatilho: 'agendado' | 'manual' | 'teste'; quem?: { id: string; name: string } | null; envioId?: string | null; destinatarioId?: string };

/**
 * Monta o PDF de agora de um envio e manda para a lista dele (ou só para um número). Um envio de cada vez: se o
 * relógio e um clique chegarem juntos (ou dois envios no mesmo minuto), o segundo espera o primeiro.
 */
export async function enviar(app: FastifyInstance, o: PedidoDeEnvio): Promise<ResultadoEnvio> {
  while (emAndamento) await emAndamento.catch(() => null);
  const p = enviarAgora(app, o);
  emAndamento = p;
  try { return await p; } finally { emAndamento = null; }
}

async function enviarAgora(app: FastifyInstance, o: PedidoDeEnvio): Promise<ResultadoEnvio> {
  const db = app.db;
  const agora = ferramentas.agora();
  const momento = momentoEmBrasilia(agora);
  const { valor, temToken } = await lerAjustes(db);
  const e = o.envioId ? valor.envios.find((x) => x.id === o.envioId) ?? null : valor.envios[0] ?? null;
  const os = await origens(app);
  const origemNome = e ? nomeDaOrigem(os, e.origem) : null;
  const lista = (e?.destinatarios ?? []).filter((d) => (o.destinatarioId ? d.id === o.destinatarioId : d.ativo));
  const registro: RegistroEnvio = {
    id: randomBytes(8).toString('hex'), em: agora.toISOString(), dia: momento.dia, gatilho: o.gatilho, quem: o.quem?.name ?? null,
    ok: false, mensagem: '', pdf: null, itens: [], destinatarios: [],
    envioId: e?.id ?? null, origem: e?.origem ?? null, origemNome,
  };
  const token = temToken ? await integ.segredo(db, app.vault, 'envio-automatico') : null;
  const motivo = !e ? (o.envioId ? 'Esse envio não está mais na lista.' : 'Nenhum envio na lista (Administração › Envio automático).')
    : falta(valor, !!token, lista) ?? (o.destinatarioId && !lista.length ? 'Esse número não está na lista.' : null);

  if (motivo) {
    registro.mensagem = motivo;
  } else if (o.gatilho === 'teste') {
    // o teste: só um texto, para conferir o token, o número que envia e o destino
    const texto = `Teste do Ingline Gestão: o envio automático dos relatórios${e!.origem === ORIGEM_LEGADO ? ' dos Chamados' : ` do painel ${origemNome}`} está funcionando. Pode ignorar esta mensagem.`;
    registro.destinatarios = await Promise.all(lista.map((d) => mandarPara(valor, token!, d, texto)));
  } else {
    try {
      const p = await pacote(app, { envioId: e!.id });
      registro.itens = p.titulos;
      const pdf = await montarPdf(app, e!.id);
      const id = await guardarPdf(pdf);
      const nome = p.tipo === 'painel' ? nomeDoPdf(momento.dia, p.painel.sigla) : nomeDoPdf(momento.dia);
      registro.pdf = { id, nome, bytes: pdf.length };
      const link = `${enderecoPublico(app)}/api/envio/arquivo/${id}/${nome}`;
      const kpis = p.tipo === 'painel' ? p.kpis : p.resumo.kpis;
      const texto = textoDoEnvio({ dia: momento.dia, hhmm: momento.hhmm, painel: p.tipo === 'painel' ? p.painel.nome : p.painelNome, numeros: kpis.map((k) => ({ label: k.label, valor: k.valor })), titulos: p.titulos });
      for (const d of lista) registro.destinatarios.push(await mandarPara(valor, token!, d, texto, link));
    } catch (err) {
      registro.mensagem = err instanceof Error ? err.message : 'Falhou ao montar o PDF';
    }
  }

  const certos = registro.destinatarios.filter((d) => d.ok).length;
  registro.ok = !registro.mensagem && certos > 0 && certos === registro.destinatarios.length;
  if (!registro.mensagem) {
    const conversas = sobreAsConversas(registro.destinatarios);
    registro.mensagem = certos === registro.destinatarios.length
      ? `${o.gatilho === 'teste' ? 'Teste enviado' : 'Enviado'} para ${certos} ${certos === 1 ? 'número' : 'números'}${conversas}.`
      : `${certos} de ${registro.destinatarios.length} receberam; ${registro.destinatarios.filter((d) => !d.ok).map((d) => `${d.nome}: ${d.mensagem}`).join(' · ')}${conversas}`;
  }

  await anotar(db, (v) => ({
    historico: [registro, ...(v.historico ?? [])].slice(0, HISTORICO),
    ...(o.gatilho === 'agendado' && e ? {
      envios: v.envios.map((x) => (x.id !== e.id ? x : {
        ...x,
        ultimoAgendado: {
          dia: momento.dia, horario: x.horario, ok: registro.ok, em: agora.toISOString(),
          tentativas: (agendadoDeHoje(x, agora, x.ultimoAgendado ?? null)?.tentativas ?? 0) + 1,
        },
      })),
    } : {}),
  }));
  const deOnde = !e ? '' : e.origem === ORIGEM_LEGADO ? ' do Legado do Helena' : ` do painel ${origemNome}`;
  const oque = o.gatilho === 'teste' ? `mensagem de teste${deOnde}` : `PDF dos Chamados${deOnde}${registro.itens.length ? ` (${registro.itens.length} ${registro.itens.length === 1 ? 'item' : 'itens'})` : ''}`;
  const quem = o.quem ? `${o.quem.name} mandou` : 'Envio automático:';
  await audit.record(db, {
    userId: o.quem?.id ?? null, action: o.gatilho === 'teste' ? 'envio_automatico_teste' : 'envio_automatico', entityType: 'settings', entityId: 'envio-automatico',
    summary: `${quem} ${oque} pelo WhatsApp — ${registro.ok ? registro.mensagem : `falhou: ${registro.mensagem}`}`,
    after: { gatilho: o.gatilho, dia: registro.dia, envio: e?.id ?? null, origem: e?.origem ?? null, itens: registro.itens, destinatarios: registro.destinatarios.map((d) => ({ nome: d.nome, numero: numeroLegivel(d.numero), ok: d.ok })) },
  }, app.log);
  return registro;
}

// ---------- o relógio ----------

/**
 * Uma volta do relógio: manda cada envio que está na hora, um depois do outro (relendo a lista antes de cada um).
 * Uma volta de cada vez — se um envio demorar mais de um minuto, a volta seguinte não manda de novo (1.7.1).
 * Devolve o que mandou (nada: a lista vazia). Exportada para os testes.
 */
let relogioOcupado = false;
export async function voltaDoRelogio(app: FastifyInstance): Promise<ResultadoEnvio[]> {
  if (relogioOcupado) return [];
  relogioOcupado = true;
  const feitos: ResultadoEnvio[] = [];
  try {
    const { valor } = await lerAjustes(app.db);
    for (const { id } of valor.envios) {
      const agora = ferramentas.agora();
      const e = (await lerAjustes(app.db)).valor.envios.find((x) => x.id === id);
      if (!e || !horaDeEnviar(e, agora, e.ultimoAgendado ?? null)) continue;
      const tentativa = (agendadoDeHoje(e, agora, e.ultimoAgendado ?? null)?.tentativas ?? 0) + 1;
      app.log.info({ envio: e.id, origem: e.origem, horario: e.horario, tentativa }, 'envio automático: hora de mandar');
      try {
        const r = await enviar(app, { gatilho: 'agendado', envioId: e.id });
        if (r.ok) app.log.info({ envio: e.id, mensagem: r.mensagem }, 'envio automático: enviado');
        else app.log.warn({ envio: e.id, motivo: r.mensagem, tentativa }, 'envio automático falhou');
        feitos.push(r);
      } catch (err) {
        app.log.error({ err, envio: e.id }, 'envio automático: erro inesperado');
      }
    }
    return feitos;
  } catch (err) {
    app.log.error({ err }, 'envio automático: erro inesperado');
    return feitos;
  } finally {
    relogioOcupado = false;
  }
}

/** A cada minuto, confere se está na hora de algum envio do dia (só os ligados). */
export function iniciarEnvioAutomatico(app: FastifyInstance) {
  app.log.info('envio automático: relógio ligado (confere o horário a cada minuto)');
  setTimeout(() => void voltaDoRelogio(app), 30_000);
  setInterval(() => void voltaDoRelogio(app), 60_000);
}

/** O que a tela de Administração › Envio automático mostra: a ligação com a FlwChat, cada envio e o histórico. */
export async function paraTela(app: FastifyInstance) {
  const { valor, temToken } = await lerAjustes(app.db);
  const os = await origens(app);
  const agora = ferramentas.agora();
  const envios = [];
  for (const e of valor.envios) {
    const o = os.find((x) => x.id === e.origem);
    const marcados = await marcadosDaOrigem(app, e.origem);
    envios.push({
      id: e.id, origem: e.origem, origemNome: o?.nome ?? 'um painel que saiu', origemSigla: o?.sigla ?? null,
      // o que impede de mandar, escrito (o painel que foi desativado ou que saiu)
      origemProblema: !o ? 'O painel deste envio saiu do Gestor: escolha outro painel ou tire o envio.' : !o.ativo ? `O painel ${o.nome} está desativado: o envio não sai até ele voltar.` : null,
      ativo: e.ativo, horario: e.horario, dias: e.dias, destinatarios: e.destinatarios,
      proximo: proximoEnvio(e, agora, e.ultimoAgendado ?? null),
      hoje: envioDeHoje(e, agora, e.ultimoAgendado ?? null, doEnvio(valor.historico ?? [], e.id)),
      marcados,
    });
  }
  return {
    url: valor.url, remetente: valor.remetente, concluirConversa: valor.concluirConversa !== false,
    temToken,
    configuradoEm: valor.configuradoEm ?? null, configuradoPor: valor.configuradoPor ?? null,
    envios,
    origens: os,
    historico: (valor.historico ?? []).slice(0, 20).map((h) => ({ ...h, envioId: h.envioId ?? ID_DO_ENVIO_DE_ANTES, origemNome: h.origemNome ?? NOME_DO_LEGADO })),
    enderecoPublico: enderecoPublico(app),
    linkValeDias: LINK_VALE_DIAS,
  };
}
