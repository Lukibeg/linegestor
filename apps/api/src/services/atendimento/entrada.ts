/**
 * A ENTRADA DAS INTEGRAÇÕES (Patch 2.0, decisão 0047): o robô do LineChat e o n8n abrem e mexem nos
 * chamados com uma chave de API, sem sessão.
 *
 *  - a chave vem no cabeçalho `Authorization: Bearer <chave>` ou em `?chave=` (o bloco de webhook do
 *    robô pode não aceitar cabeçalho). No banco fica só o sha256 dela: confere pelo resumo, fora as
 *    revogadas, e anota quando foi usada;
 *  - quem age é a integração (`Ator` do tipo integração, com o nome da chave): o histórico e as
 *    anotações mostram "n8n", "Robô do LineChat"…; ela trabalha em todos os painéis;
 *  - as regras são as da tela: tudo passa por `criarChamado`, `alterarChamado`, `moverChamado`,
 *    `anotarChamado` e `reabrirChamado` (chamados.ts).
 *
 * O que é só da entrada: a mesma conversa (sessão) aberta não vira outro chamado — o relato novo vira
 * anotação no que já existe; e a mensagem do cliente reabre o Resolvido, menos o "obrigado".
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { ticketApiKeys, ticketStages, tickets, type Db } from '@gestor/db';
import {
  caminhoDoAssunto, campoLigado, ChamadoCriarSchema, EntradaChamadoSchema, EntradaMensagemSchema, etapaAoReabrir, IntegracaoAlterarSchema, NOME_CAMPO,
  numeroWhatsApp, pareceAgradecimento, paraBusca, situacaoDaEtapa, textoDoValor,
  type Assunto, type CartaoChamado, type ChamadoAlterar, type Painel, type SituacaoDoChamado, type TipoCampo, type ValorDoCampo,
} from '@gestor/shared';
import { BadRequest, Unauthorized } from '../../plugins/errors.js';
import { avisarEquipe, avisarObservadores, linkDoChamado, trecho } from './avisos.js';
import { alterarChamado, anotarChamado, criarChamado, moverChamado, reabrirChamado } from './chamados.js';
import { camposDoPainel, carregarContexto, carregarPaineis, cartoesDe, chamadoOu404, registrarEvento, tocar, type Ator, type Contexto, type LinhaChamado } from './contexto.js';

export type EntradaChamado = z.infer<typeof EntradaChamadoSchema>;
export type EntradaMensagem = z.infer<typeof EntradaMensagemSchema>;
export type IntegracaoAlterar = z.infer<typeof IntegracaoAlterarSchema>;

/** Como a integração aparece na auditoria (a auditoria não tem pessoa: o nome da chave diz quem foi). */
export const nomeNaAuditoria = (a: Ator) => `${a.nome} (chave de API)`;

// =====================================================================
//  A CHAVE DE API
// =====================================================================

/** O resumo guardado no banco: o sha256 (hex) da chave inteira. */
export const resumoDaChave = (chave: string) => createHash('sha256').update(chave, 'utf8').digest('hex');

/** A chave do pedido: o cabeçalho `Authorization: Bearer …` vale mais que o `?chave=`. */
export function chaveDoPedido(req: Pick<FastifyRequest, 'headers' | 'query'>): string | null {
  const auth = req.headers.authorization;
  const m = typeof auth === 'string' ? /^\s*Bearer\s+(\S+)\s*$/i.exec(auth) : null;
  if (m) return m[1]!;
  const q = (req.query as Record<string, unknown> | null | undefined)?.chave;
  return typeof q === 'string' && q.trim() ? q.trim() : null;
}

/** Quem é a integração, pela chave (não revogada). Sem chave válida: 401, sem dizer o porquê. */
export async function atorDaChave(db: Db, chave: string | null): Promise<Ator> {
  if (!chave || chave.length > 300) throw new Unauthorized('Chave de API inválida.');
  const [k] = await db.select({ id: ticketApiKeys.id, name: ticketApiKeys.name }).from(ticketApiKeys)
    .where(and(eq(ticketApiKeys.hash, resumoDaChave(chave)), isNull(ticketApiKeys.revokedAt))).limit(1);
  if (!k) throw new Unauthorized('Chave de API inválida.');
  await db.update(ticketApiKeys).set({ lastUsedAt: new Date() }).where(eq(ticketApiKeys.id, k.id));
  return { tipo: 'integracao', id: k.id, nome: k.name };
}

// =====================================================================
//  O CHAMADO COMO A INTEGRAÇÃO VÊ
// =====================================================================

export type ChamadoParaIntegracao = CartaoChamado & {
  painel: { id: string; nome: string; sigla: string } | null;
  etapa: { id: string; nome: string; tipo: string; nivel: number | null } | null;
  relato: string | null;
  descricao: string | null;
  solucao: string | null;
  /** os campos do painel com valor, pelo nome (o `campos` do cartão vem pelo id do campo e da opção) */
  camposDoPainel: Array<{ id: string; nome: string; tipo: TipoCampo; valor: ValorDoCampo; texto: string }>;
  /** o endereço do chamado no Gestor (o robô pode mandar ao cliente, o n8n pode pôr no aviso) */
  link: string;
};

export async function paraIntegracao(app: FastifyInstance, t: LinhaChamado, ctx?: Contexto): Promise<ChamadoParaIntegracao> {
  const c = ctx ?? (await carregarContexto(app.db));
  const cartao = (await cartoesDe(app.db, c, [t.id])).get(t.id)!;
  const painel = c.paineis.find((p) => p.id === t.panelId);
  const etapa = c.etapas.get(t.stageId)?.etapa;
  return {
    ...cartao,
    painel: painel ? { id: painel.id, nome: painel.nome, sigla: painel.sigla } : null,
    etapa: etapa ? { id: etapa.id, nome: etapa.nome, tipo: etapa.tipo, nivel: etapa.nivel } : null,
    relato: t.customerReport, descricao: t.description, solucao: t.solution,
    camposDoPainel: camposDoPainel(c, t.panelId, true).filter((x) => cartao.campos[x.id] !== undefined)
      .map((x) => ({ id: x.id, nome: x.nome, tipo: x.tipo, valor: cartao.campos[x.id]!, texto: textoDoValor(x, cartao.campos[x.id]) })),
    link: linkDoChamado(app, t.code),
  };
}

/** O chamado pelo código (SUP-12) ou pelo id; a integração vê todos os painéis. */
export async function lerChamado(app: FastifyInstance, ref: string): Promise<ChamadoParaIntegracao> {
  return paraIntegracao(app, await chamadoOu404(app.db, ref));
}

// =====================================================================
//  O ASSUNTO PELO NOME OU PELO CAMINHO
// =====================================================================

/** "Ramal › Configuração", "ramal > configuracao", "Ramal - Configuração": o mesmo caminho. */
const SEPARADOR = /\s*[>›»]\s*|\s+-\s+/;
const caminhoNormalizado = (s: string) => s.split(SEPARADOR).map((p) => paraBusca(p).replace(/\s+/g, ' ')).filter(Boolean).join(' › ');

/**
 * O assunto do painel pelo caminho inteiro ou só pelo nome (sem ligar para acento e maiúscula). O
 * nome que aparece em dois lugares da árvore pede o caminho; o que não existe (ou foi desativado) é
 * recusado — gravar outro assunto no lugar seria pior que avisar.
 */
export function acharAssunto(assuntos: Assunto[], painel: Painel, texto: string): Assunto {
  const alvo = caminhoNormalizado(texto);
  const doPainel = assuntos.filter((a) => a.painelId === painel.id);
  const porCaminho = (a: Assunto) => caminhoNormalizado(caminhoDoAssunto(a.id, assuntos)) === alvo;
  const porNome = (a: Assunto) => caminhoNormalizado(a.nome) === alvo;
  const ativos = doPainel.filter((a) => a.ativo);
  const peloCaminho = ativos.filter(porCaminho);
  if (peloCaminho.length === 1) return peloCaminho[0]!;
  const peloNome = ativos.filter(porNome);
  if (peloNome.length === 1) return peloNome[0]!;
  if (peloNome.length > 1) {
    throw new BadRequest(`Há mais de um assunto "${texto}" no painel ${painel.nome}: mande o caminho inteiro (${peloNome.map((a) => caminhoDoAssunto(a.id, assuntos)).join(' ou ')}).`);
  }
  if (doPainel.some((a) => !a.ativo && (porCaminho(a) || porNome(a)))) throw new BadRequest(`O assunto "${texto}" foi desativado no painel ${painel.nome}.`);
  throw new BadRequest(`Não achei o assunto "${texto}" no painel ${painel.nome}.`);
}

// =====================================================================
//  ABRIR (o robô do LineChat)
// =====================================================================

/**
 * Uma conversa de cada vez: dois pedidos da mesma sessão ao mesmo tempo (o robô e o n8n, um clique
 * repetido) esperam um ao outro — senão os dois veriam "não há chamado aberto" e abririam dois.
 */
const filas = new Map<string, Promise<unknown>>();
async function umDeCadaVez<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
  const antes = filas.get(chave) ?? Promise.resolve();
  const agora = antes.catch(() => undefined).then(tarefa);
  filas.set(chave, agora);
  try { return await agora; } finally { if (filas.get(chave) === agora) filas.delete(chave); }
}

const ABERTAS = ['entrada', 'andamento'];

/** O chamado aberto (entrada ou andamento) desta conversa, o mais novo. */
async function abertoDaSessao(db: Db, sessaoId: string): Promise<LinhaChamado | null> {
  const [r] = await db.select({ t: tickets }).from(tickets).innerJoin(ticketStages, eq(ticketStages.id, tickets.stageId))
    .where(and(eq(tickets.sessionId, sessaoId), isNull(tickets.deletedAt), inArray(ticketStages.kind, ABERTAS)))
    .orderBy(desc(tickets.createdAt)).limit(1);
  return r?.t ?? null;
}

export type ResultadoEntrada = { criado: boolean; id: string; codigo: string; numero: number; link: string; titulo: string; anotou: boolean };

/**
 * O robô abre o chamado. O painel pela sigla ou pelo id (sem painel, o primeiro ativo: o Suporte). Se
 * a mesma conversa já tem um chamado aberto, não abre outro: o relato vira anotação nele.
 */
export async function abrirPelaEntrada(app: FastifyInstance, ator: Ator, e: EntradaChamado): Promise<ResultadoEntrada> {
  const abrir = () => abrirAgora(app, ator, e);
  return e.sessaoId ? umDeCadaVez(`sessao:${e.sessaoId}`, abrir) : abrir();
}

async function abrirAgora(app: FastifyInstance, ator: Ator, e: EntradaChamado): Promise<ResultadoEntrada> {
  const resposta = (t: Pick<LinhaChamado, 'id' | 'code' | 'number' | 'title'>, criado: boolean, anotou: boolean): ResultadoEntrada =>
    ({ criado, id: t.id, codigo: t.code, numero: t.number, link: linkDoChamado(app, t.code), titulo: t.title, anotou });

  if (e.sessaoId) {
    const aberto = await abertoDaSessao(app.db, e.sessaoId);
    if (aberto) {
      const relato = (e.relato ?? '').replace(/\r\n?/g, '\n').trim();
      if (relato) await anotarChamado(app, ator, aberto.id, { texto: relato.slice(0, 20_000), anexos: [] });
      return resposta(aberto, false, !!relato);
    }
  }

  const { paineis } = await carregarPaineis(app.db);
  const pedido = e.painel?.trim();
  const painel = pedido ? paineis.find((p) => p.id === pedido) ?? paineis.find((p) => p.sigla === pedido.toUpperCase()) : paineis.find((p) => p.ativo);
  if (!painel) throw new BadRequest(pedido ? `Não achei o painel "${pedido}". Use a sigla (como SUP) ou o id do painel.` : 'Não há nenhum painel ativo para abrir o chamado.');

  const titulo = e.titulo && e.titulo.trim().length >= 3 ? e.titulo.trim()
    : e.nome?.trim() ? `Atendimento de ${e.nome.trim()}` : 'Chamado pelo WhatsApp';
  // o painel sem assunto (a aba Campos desligou) ignora o assunto que vier
  const assuntoId = e.assunto && campoLigado(painel.ajustes, 'assunto') ? acharAssunto((await carregarContexto(app.db)).assuntos, painel, e.assunto).id : null;
  const lido = ChamadoCriarSchema.safeParse({
    painelId: painel.id, titulo, relato: e.relato, contatoNome: e.nome, contatoTelefone: e.telefone, sessaoId: e.sessaoId,
    clienteId: e.clienteId, assuntoId, prioridade: e.prioridade, etiquetas: e.etiquetas ?? [], campos: e.campos ?? {},
  });
  if (!lido.success) throw new BadRequest(lido.error.issues[0]?.message ?? 'Dados inválidos', { campos: lido.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })) });
  const r = await criarChamado(app, ator, lido.data, { origem: 'robo' });
  const [t] = await app.db.select({ id: tickets.id, code: tickets.code, number: tickets.number, title: tickets.title }).from(tickets).where(eq(tickets.id, r.id)).limit(1);
  return resposta(t!, true, false);
}

// =====================================================================
//  O CLIENTE ESCREVEU (o webhook de mensagem recebida, pelo n8n)
// =====================================================================

/** O chamado do contato que ainda não fechou (o mais novo): pela conversa e, sem ela, pelo telefone. */
async function chamadoDoContato(db: Db, m: { sessaoId?: string; fone: string | null }): Promise<LinhaChamado | null> {
  const procurar = async (onde: ReturnType<typeof eq>) => {
    const [r] = await db.select({ t: tickets }).from(tickets).innerJoin(ticketStages, eq(ticketStages.id, tickets.stageId))
      .where(and(onde, isNull(tickets.deletedAt), ne(ticketStages.kind, 'fechado')))
      .orderBy(desc(tickets.createdAt)).limit(1);
    return r?.t ?? null;
  };
  return (m.sessaoId ? await procurar(eq(tickets.sessionId, m.sessaoId)) : null) ?? (m.fone ? await procurar(eq(tickets.contactPhone, m.fone)) : null);
}

/** Até onde o texto do cliente vai para o histórico e para o aviso (a conversa inteira está no LineChat). */
const NO_HISTORICO = 1000;
const NO_AVISO = 120;

export type ResultadoMensagem = { acao: 'reaberto' | 'registrado' | 'ignorado'; codigo?: string; id?: string };

/**
 * O cliente escreveu. No chamado Resolvido, a mensagem reabre — menos o "obrigado", o "ok, funcionou",
 * a figurinha (`pareceAgradecimento`); no aberto, fica no histórico. Nos dois casos, o responsável é
 * avisado. Sem chamado do contato (ou só fechados), nada acontece.
 */
export async function mensagemDoCliente(app: FastifyInstance, ator: Ator, m: EntradaMensagem): Promise<ResultadoMensagem> {
  const achado = await chamadoDoContato(app.db, { sessaoId: m.sessaoId, fone: numeroWhatsApp(m.telefone) });
  if (!achado) return { acao: 'ignorado' };
  // duas mensagens seguidas no mesmo Resolvido ("ainda está caindo", "e o 204 também"): uma de cada vez,
  // e lendo o chamado de novo — a segunda já o encontra aberto e só fica registrada
  return umDeCadaVez(`chamado:${achado.id}`, async () => responderNoChamado(app, ator, await chamadoOu404(app.db, achado.id), m));
}

async function responderNoChamado(app: FastifyInstance, ator: Ator, t: LinhaChamado, m: EntradaMensagem): Promise<ResultadoMensagem> {
  const ctx = await carregarContexto(app.db);
  const painel = ctx.paineis.find((p) => p.id === t.panelId);
  const situacao: SituacaoDoChamado = situacaoDaEtapa(ctx.etapas.get(t.stageId)?.etapa.tipo ?? 'andamento');
  const bruto = (m.texto ?? '').replace(/\r\n?/g, '\n').trim();
  const texto = trecho(bruto || '(mensagem sem texto: figurinha, foto, áudio ou arquivo)', NO_HISTORICO);
  const chamado = { id: t.id, codigo: t.code, titulo: t.title };
  const feito = { codigo: t.code, id: t.id };

  if (situacao === 'resolvido') {
    if (pareceAgradecimento(bruto)) return { acao: 'ignorado', ...feito };
    const para = painel ? etapaAoReabrir(painel.etapas) : null;
    if (para && (para.tipo === 'entrada' || para.tipo === 'andamento')) {
      // primeiro o que o cliente disse, depois o "reabriu" (o histórico lê na ordem em que aconteceu): um
      // milésimo antes, porque o reabrir marca a hora dele em seguida e o mesmo milésimo embaralharia a ordem
      await registrarEvento(app.db, t.id, 'cliente_respondeu', ator, { texto, reabriu: true }, new Date(Date.now() - 1));
      // (os observadores recebem um aviso só: o do cliente que respondeu, não o do "reabriu")
      await reabrirChamado(app, ator, t.id, { motivo: 'o cliente respondeu' }, { observadores: false });
      const aviso = `O cliente respondeu no ${t.code} e o chamado reabriu: "${trecho(texto, NO_AVISO)}"`;
      await avisarEquipe(app, { evento: 'cliente_respondeu', para: [t.assigneeId], chamado, texto: aviso });
      await avisarObservadores(app, { chamado, observadores: t.watcherIds, texto: aviso, jaAvisados: [t.assigneeId] });
      return { acao: 'reaberto', ...feito };
    }
    // (um painel sem etapa para reabrir: a resposta fica registrada, como num aberto)
  }
  await registrarEvento(app.db, t.id, 'cliente_respondeu', ator, { texto, reabriu: false });
  await tocar(app.db, t.id);
  const aviso = `O cliente respondeu no ${t.code}: "${trecho(texto, NO_AVISO)}"`;
  await avisarEquipe(app, { evento: 'cliente_respondeu', para: [t.assigneeId], chamado, texto: aviso });
  await avisarObservadores(app, { chamado, observadores: t.watcherIds, texto: aviso, jaAvisados: [t.assigneeId] });
  return { acao: 'registrado', ...feito };
}

// =====================================================================
//  O N8N MEXENDO NUM CHAMADO
// =====================================================================

/** As colunas que a integração pode mudar, com o nome que a auditoria mostra. */
const CAMPOS_NA_AUDITORIA: Array<[keyof LinhaChamado, string]> = [
  ['title', 'Título'], ['customerReport', NOME_CAMPO.relato], ['description', NOME_CAMPO.descricao], ['clientId', NOME_CAMPO.cliente],
  ['contactName', NOME_CAMPO.contato], ['contactPhone', 'WhatsApp do contato'], ['subjectId', NOME_CAMPO.assunto], ['type', NOME_CAMPO.tipo],
  ['severity', NOME_CAMPO.gravidade], ['reach', NOME_CAMPO.alcance], ['priority', NOME_CAMPO.prioridade], ['priorityReason', 'Motivo da prioridade'],
  ['productIds', NOME_CAMPO.produto], ['carrierIds', NOME_CAMPO.operadora], ['tags', 'Etiquetas'],
  ['solution', NOME_CAMPO.solucao], ['cause', NOME_CAMPO.causa], ['workaround', 'Solução de contorno'], ['validation', NOME_CAMPO.validacao],
  ['watcherIds', 'Observadores'], ['assigneeId', NOME_CAMPO.responsavel], ['customFields', 'Campos do painel'],
];

/** O que mudou entre duas leituras do chamado (para a auditoria dizer o quê, com o antes e o depois). */
export function mudancas(antes: LinhaChamado, depois: LinhaChamado) {
  const nomes: string[] = [];
  const de: Record<string, unknown> = {};
  const para: Record<string, unknown> = {};
  for (const [coluna, nome] of CAMPOS_NA_AUDITORIA) {
    if (JSON.stringify(antes[coluna] ?? null) === JSON.stringify(depois[coluna] ?? null)) continue;
    nomes.push(nome);
    de[coluna] = antes[coluna];
    para[coluna] = depois[coluna];
  }
  return { nomes, antes: de, depois: para };
}

/**
 * Mudar o chamado pelas regras da tela; o assunto pode vir pelo nome ou pelo caminho (no painel do
 * chamado) — `assunto: ""` tira o assunto. Devolve o chamado antes e depois (a rota audita o que mudou).
 */
export async function alterarPelaIntegracao(app: FastifyInstance, ator: Ator, ref: string, d: IntegracaoAlterar): Promise<{ antes: LinhaChamado; depois: LinhaChamado }> {
  const antes = await chamadoOu404(app.db, ref);
  const { assunto, ...resto } = d;
  const dados: ChamadoAlterar = { ...resto };
  if (assunto !== undefined) {
    const ctx = await carregarContexto(app.db);
    const painel = ctx.paineis.find((p) => p.id === antes.panelId);
    if (!painel) throw new BadRequest('O painel deste chamado não existe mais.');
    // o painel sem assunto ignora o assunto que vier (o n8n pode mandar para qualquer painel)
    if (campoLigado(painel.ajustes, 'assunto')) dados.assuntoId = assunto ? acharAssunto(ctx.assuntos, painel, assunto).id : null;
  }
  await alterarChamado(app, ator, antes.id, dados);
  return { antes, depois: await chamadoOu404(app.db, antes.id) };
}

export async function anotarPelaIntegracao(app: FastifyInstance, ator: Ator, ref: string, texto: string): Promise<LinhaChamado> {
  const t = await chamadoOu404(app.db, ref);
  await anotarChamado(app, ator, t.id, { texto, anexos: [] });
  return t;
}

/**
 * Mover pela etapa (o id, ou o nome sem ligar para acento e maiúscula), no painel do chamado, com as
 * regras da tela: o que falta preencher, os filhos que travam, o motivo de escalonar.
 */
export async function moverPelaIntegracao(
  app: FastifyInstance, ator: Ator, ref: string, d: { etapa: string; motivo?: string | null },
): Promise<{ t: LinhaChamado; de: string | null; para: string; mudou: boolean }> {
  const t = await chamadoOu404(app.db, ref);
  const ctx = await carregarContexto(app.db);
  const painel = ctx.paineis.find((p) => p.id === t.panelId);
  if (!painel) throw new BadRequest('O painel deste chamado não existe mais.');
  const alvo = d.etapa.trim();
  const etapa = painel.etapas.find((e) => e.id === alvo) ?? painel.etapas.find((e) => paraBusca(e.nome) === paraBusca(alvo));
  if (!etapa) throw new BadRequest(`Não achei a etapa "${alvo}" no painel ${painel.nome} (as etapas: ${painel.etapas.map((e) => e.nome).join(', ')}).`);
  await moverChamado(app, ator, t.id, { etapaId: etapa.id, motivo: d.motivo?.trim() || null });
  return { t, de: ctx.etapas.get(t.stageId)?.etapa.nome ?? null, para: etapa.nome, mudou: etapa.id !== t.stageId };
}
