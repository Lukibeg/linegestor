/**
 * OS CHAMADOS DO GESTOR (Patch 1.10, decisão 0047) — o que todo o módulo usa: quem está agindo (uma
 * pessoa ou uma integração), os painéis e quem vê cada um, os nomes (pessoas, clientes, produtos,
 * operadoras, assuntos), os prazos, o chamado montado para a tela (o cartão) e o histórico.
 *
 * A lista e o quadro carregam os chamados para a memória e filtram com as funções do
 * `@gestor/shared/atendimento.ts` — as mesmas da prévia. São alguns milhares de chamados por ano (o
 * painel antigo tinha 3.200 em três anos): cabe com folga, e a regra fica escrita uma vez só.
 */
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  carriers, clients, newId, products, ticketEvents, ticketFields, ticketNotes, ticketPanels, ticketStages, ticketSubjects, tickets, users,
  type Db,
} from '@gestor/db';
import {
  ajustesDoPainelCompletos, ajustesPrazosCompletos, caminhoDoAssunto, campoLigado, estadoDosPrazos, situacaoDaEtapa, textoDeBusca, textoDoEvento, textosDosCampos,
  valoresVisiveis,
  type AjustesPrazos, type Assunto, type CampoPersonalizado, type CartaoChamado, type CartaoParaLista, type CorPainel, type Espera, type EtapaPainel,
  type EventoChamado, type Nivel, type Obrigatorio, type OpcaoDoCampo, type Origem, type Painel, type TipoCampo, type TipoEvento, type Gravidade, type Alcance,
  type Prioridade, type TipoChamado, type ValoresDosCampos,
} from '@gestor/shared';
import { NotFound, Forbidden } from '../../plugins/errors.js';
import * as integ from '../integracoes.js';

// =====================================================================
//  QUEM ESTÁ AGINDO
// =====================================================================

/**
 * Uma pessoa da equipe (pela sessão) ou uma integração (o robô do LineChat, o n8n, pela chave de
 * API). A integração não tem usuário: o histórico guarda o nome da chave (`actor_name`).
 */
export type Ator =
  | { tipo: 'pessoa'; id: string; nome: string; permissoes: string[] }
  | { tipo: 'integracao'; id: string; nome: string };

export const atorDaPessoa = (u: { id: string; name: string; permissions: string[] }): Ator => ({ tipo: 'pessoa', id: u.id, nome: u.name, permissoes: u.permissions });
export const podeVerChamados = (a: Ator) => a.tipo === 'integracao' || a.permissoes.includes('support.read');
export const podeTrabalhar = (a: Ator) => a.tipo === 'integracao' || a.permissoes.includes('tickets.work');
export const podeCuidar = (a: Ator) => a.tipo === 'pessoa' && a.permissoes.includes('tickets.manage');
/** O id da pessoa (para as colunas `user_id`); a integração não tem. */
export const pessoaDoAtor = (a: Ator) => (a.tipo === 'pessoa' ? a.id : null);
/** O nome da integração (para as colunas `actor_name`); a pessoa tem o id. */
export const integracaoDoAtor = (a: Ator) => (a.tipo === 'integracao' ? a.nome : null);

export function exigirTrabalhar(a: Ator) {
  if (!podeTrabalhar(a)) throw new Forbidden('Esta ação exige a permissão "tickets.work"');
}

// =====================================================================
//  OS PAINÉIS
// =====================================================================

type LinhaPainel = typeof ticketPanels.$inferSelect;
type LinhaEtapa = typeof ticketStages.$inferSelect;
export type LinhaChamado = typeof tickets.$inferSelect;

export function etapaDaLinha(e: LinhaEtapa): EtapaPainel {
  return {
    id: e.id, nome: e.name, tipo: e.kind as EtapaPainel['tipo'], nivel: (e.level as Nivel | null) ?? null,
    obrigatorios: e.requiredFields as Obrigatorio[], avisar: e.notifyUserIds,
  };
}

export function painelDaLinha(p: LinhaPainel, etapas: LinhaEtapa[], abertos = 0): Painel {
  return {
    id: p.id, nome: p.name, sigla: p.key, descricao: p.description, cor: p.color as CorPainel, ordem: p.sortOrder,
    acesso: p.access === 'escolhidos' ? 'escolhidos' : 'todos', pessoas: p.memberIds,
    ajustes: ajustesDoPainelCompletos(p.settings as Partial<Painel['ajustes']>),
    etapas: etapas.filter((e) => e.panelId === p.id && !e.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder).map(etapaDaLinha),
    ativo: p.active, abertos,
  };
}

/** Os painéis (fora da lixeira), em ordem, com quantos chamados abertos cada um tem. */
export async function carregarPaineis(db: Db): Promise<{ paineis: Painel[]; todasAsEtapas: LinhaEtapa[] }> {
  const [ps, es, abertos] = await Promise.all([
    db.select().from(ticketPanels).where(isNull(ticketPanels.deletedAt)),
    // as etapas que saíram também vêm: um chamado antigo pode citar uma (no histórico)
    db.select().from(ticketStages),
    db.select({ panelId: tickets.panelId, n: sql<number>`count(*)::int` })
      .from(tickets).innerJoin(ticketStages, eq(ticketStages.id, tickets.stageId))
      .where(and(isNull(tickets.deletedAt), inArray(ticketStages.kind, ['entrada', 'andamento'])))
      .groupBy(tickets.panelId),
  ]);
  const porPainel = new Map(abertos.map((a) => [a.panelId, Number(a.n)]));
  return {
    paineis: ps.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR')).map((p) => painelDaLinha(p, es, porPainel.get(p.id) ?? 0)),
    todasAsEtapas: es,
  };
}

/**
 * Quem vê o painel: quem cuida dos chamados vê todos; num painel "escolhidos", só as pessoas da
 * lista; nos outros, quem vê chamados. A integração (robô, n8n) vê todos.
 */
export function podeVerPainel(p: Pick<Painel, 'acesso' | 'pessoas'>, a: Ator): boolean {
  if (a.tipo === 'integracao' || podeCuidar(a)) return true;
  if (!podeVerChamados(a)) return false;
  return p.acesso === 'todos' || p.pessoas.includes(a.id);
}

// =====================================================================
//  O CONTEXTO DE UMA LEITURA (nomes, prazos, etapas)
// =====================================================================

export type Contexto = {
  agora: Date;
  paineis: Painel[];
  /** os campos de todos os painéis (os desativados também), na ordem de cada painel */
  campos: CampoPersonalizado[];
  /** todas as etapas (inclusive as que saíram), pelo id, com o painel */
  etapas: Map<string, { etapa: EtapaPainel; painelId: string; ordem: number; saiu: boolean }>;
  pessoas: Map<string, { nome: string; ativo: boolean }>;
  clientes: Map<string, string>;
  produtos: Map<string, { nome: string; cor: string }>;
  operadoras: Map<string, string>;
  assuntos: Assunto[];
  prazos: AjustesPrazos;
};

export async function lerPrazos(db: Db): Promise<AjustesPrazos> {
  const { valor } = await integ.ler<AjustesPrazos>(db, 'atendimento-prazos');
  return ajustesPrazosCompletos(valor);
}

export function assuntoDaLinha(s: typeof ticketSubjects.$inferSelect): Assunto {
  return { id: s.id, painelId: s.panelId, paiId: s.parentId, nome: s.name, descricao: s.description, ativo: s.active, ordem: s.sortOrder, checklist: s.checklist, dePara: s.aliases };
}

export function campoDaLinha(c: typeof ticketFields.$inferSelect): CampoPersonalizado {
  return {
    id: c.id, painelId: c.panelId, nome: c.name, tipo: c.kind as TipoCampo, dica: c.help,
    opcoes: ((c.options as OpcaoDoCampo[] | null) ?? []).map((o) => ({ id: o.id, nome: o.nome, ativa: o.ativa !== false })),
    ativo: c.active, ordem: c.sortOrder,
  };
}
/** Os campos dos painéis, na ordem de cada painel (o painel que saiu leva os dele). */
export async function carregarCampos(db: Db, painelId?: string): Promise<CampoPersonalizado[]> {
  const linhas = await db.select().from(ticketFields).where(painelId ? eq(ticketFields.panelId, painelId) : sql`true`);
  return linhas.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR')).map(campoDaLinha);
}
/** Os campos de um painel (todos, ou só os ativos). */
export const camposDoPainel = (ctx: Pick<Contexto, 'campos'>, painelId: string, soAtivos = false) =>
  ctx.campos.filter((c) => c.painelId === painelId && (!soAtivos || c.ativo));

export async function carregarContexto(db: Db, agora: Date = new Date()): Promise<Contexto> {
  const [{ paineis, todasAsEtapas }, campos, ps, cs, prs, ops, as, prazos] = await Promise.all([
    carregarPaineis(db),
    carregarCampos(db),
    db.select({ id: users.id, name: users.name, active: users.active }).from(users),
    db.select({ id: clients.id, nome: clients.tradeName }).from(clients),
    db.select({ id: products.id, nome: products.name, cor: products.color }).from(products),
    db.select({ id: carriers.id, nome: carriers.name }).from(carriers),
    db.select().from(ticketSubjects),
    lerPrazos(db),
  ]);
  return {
    agora, paineis, campos,
    etapas: new Map(todasAsEtapas.map((e) => [e.id, { etapa: etapaDaLinha(e), painelId: e.panelId, ordem: e.sortOrder, saiu: !!e.deletedAt }])),
    pessoas: new Map(ps.map((p) => [p.id, { nome: p.name, ativo: p.active }])),
    clientes: new Map(cs.map((c) => [c.id, c.nome])),
    produtos: new Map(prs.map((p) => [p.id, { nome: p.nome, cor: p.cor }])),
    operadoras: new Map(ops.map((o) => [o.id, o.nome])),
    assuntos: as.map(assuntoDaLinha),
    prazos,
  };
}

export const pessoaCurta = (ctx: Contexto, id: string | null | undefined) => {
  if (!id) return null;
  const p = ctx.pessoas.get(id);
  return { id, nome: p?.nome ?? '(pessoa removida)' };
};

// =====================================================================
//  O CHAMADO PARA A TELA (o cartão do quadro e da lista)
// =====================================================================

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** A espera aberta (a marca que está valendo agora), se houver. */
export function esperaAberta(waits: Espera[]): Espera | null {
  return [...waits].reverse().find((w) => !w.fim) ?? null;
}

/** As contagens que dependem dos outros chamados (filhos, incidentes, anotações) e os códigos do pai e do problema. */
export type Parentes = {
  filhos: Map<string, Array<{ situacao: CartaoChamado['situacao'] }>>;
  incidentes: Map<string, number>;
  anotacoes: Map<string, number>;
  codigos: Map<string, string>;
};

/**
 * O chamado no quadro e na lista. Os campos do sistema que o painel desligou não aparecem (o valor fica
 * guardado: volta se o campo for ligado de novo), e dos campos do painel só os ativos.
 */
export function cartaoDaLinha(t: LinhaChamado, ctx: Contexto, par: Parentes): CartaoChamado {
  const e = ctx.etapas.get(t.stageId);
  const painel = ctx.paineis.find((p) => p.id === t.panelId);
  const usa = (c: Parameters<typeof campoLigado>[1]) => !painel || campoLigado(painel.ajustes, c);
  const situacao = situacaoDaEtapa(e?.etapa.tipo ?? 'andamento');
  const waits = (t.waits as Espera[]) ?? [];
  const aberta = esperaAberta(waits);
  const assunto = t.subjectId ? ctx.assuntos.find((a) => a.id === t.subjectId) : undefined;
  const filhos = par.filhos.get(t.id) ?? [];
  const prazos = estadoDosPrazos({
    criadoEm: t.createdAt.toISOString(), prioridade: (t.priority as Prioridade | null) ?? null,
    respondidoEm: iso(t.firstResponseAt), resolvidoEm: iso(t.resolvedAt ?? t.closedAt), esperas: waits,
    contaPrazo: painel?.ajustes.contaPrazo ?? true,
  }, ctx.prazos, ctx.agora);
  return {
    id: t.id, codigo: t.code, numero: t.number, tipoChamado: t.kind as TipoChamado, titulo: t.title,
    painelId: t.panelId, etapaId: t.stageId, situacao, nivel: e?.etapa.nivel ?? null,
    cliente: t.clientId ? { id: t.clientId, nome: ctx.clientes.get(t.clientId) ?? '(cliente removido)' } : null,
    contato: t.contactName || t.contactPhone ? { nome: t.contactName, telefone: t.contactPhone } : null,
    responsavel: pessoaCurta(ctx, t.assigneeId),
    prioridade: (t.priority as Prioridade | null) ?? null,
    gravidade: usa('gravidade') ? (t.severity as Gravidade | null) ?? null : null,
    alcance: usa('alcance') ? (t.reach as Alcance | null) ?? null : null,
    tipo: usa('tipo') ? t.type : null,
    assunto: assunto && usa('assunto') ? { id: assunto.id, nome: assunto.nome, caminho: caminhoDoAssunto(assunto.id, ctx.assuntos), ativo: assunto.ativo } : null,
    produtos: usa('produtos') ? t.productIds.map((id) => ({ id, nome: ctx.produtos.get(id)?.nome ?? '?', cor: ctx.produtos.get(id)?.cor ?? '#888888' })) : [],
    operadoras: usa('operadoras') ? t.carrierIds.map((id) => ({ id, nome: ctx.operadoras.get(id) ?? '?' })) : [],
    etiquetas: t.tags,
    campos: valoresVisiveis(ctx.campos, t.panelId, t.customFields as ValoresDosCampos | null),
    espera: aberta ? { tipo: aberta.tipo, motivo: aberta.motivo, desde: aberta.inicio } : null,
    prazos,
    pai: t.parentId ? { id: t.parentId, codigo: par.codigos.get(t.parentId) ?? '?' } : null,
    problema: t.problemId ? { id: t.problemId, codigo: par.codigos.get(t.problemId) ?? '?' } : null,
    filhos: { total: filhos.length, abertos: filhos.filter((f) => f.situacao === 'aberto').length },
    incidentes: par.incidentes.get(t.id) ?? 0,
    anotacoes: par.anotacoes.get(t.id) ?? 0,
    origem: t.origin as Origem, reaberto: t.reopenCount,
    criadoEm: t.createdAt.toISOString(), atualizadoEm: t.updatedAt.toISOString(), ultimaAtividadeEm: t.lastActivityAt.toISOString(),
    resolvidoEm: iso(t.resolvedAt), fechadoEm: iso(t.closedAt),
  };
}

/**
 * Todos os chamados (fora da lixeira) dos painéis que a pessoa vê, prontos para a lista, o quadro e
 * o Meu dia: o cartão e o texto de busca (com o relato, a descrição e a solução).
 */
export async function carregarCartoes(db: Db, ator: Ator, ctx: Contexto, opts: { incluirLixeira?: boolean } = {}): Promise<CartaoParaLista[]> {
  const visiveis = ctx.paineis.filter((p) => podeVerPainel(p, ator)).map((p) => p.id);
  if (!visiveis.length) return [];
  const [linhas, notas] = await Promise.all([
    db.select().from(tickets).where(opts.incluirLixeira ? sql`true` : isNull(tickets.deletedAt)),
    db.select({ ticketId: ticketNotes.ticketId, n: sql<number>`count(*)::int` }).from(ticketNotes).where(isNull(ticketNotes.deletedAt)).groupBy(ticketNotes.ticketId),
  ]);
  const par = parentesDe(linhas, ctx, new Map(notas.map((n) => [n.ticketId, Number(n.n)])));
  return linhas
    .filter((t) => visiveis.includes(t.panelId))
    .map((t) => {
      const c = cartaoDaLinha(t, ctx, par);
      return { ...c, busca: textoDeBusca(c, [t.customerReport, t.description, t.solution, t.cause, ...textosDosCampos(camposDoPainel(ctx, t.panelId, true), c.campos)]) };
    });
}

/** Monta as contagens de filhos, incidentes e anotações a partir das linhas carregadas. */
export function parentesDe(linhas: LinhaChamado[], ctx: Contexto, anotacoes: Map<string, number>): Parentes {
  const filhos = new Map<string, Array<{ situacao: CartaoChamado['situacao'] }>>();
  const incidentes = new Map<string, number>();
  for (const t of linhas) {
    if (t.deletedAt) continue;
    const situacao = situacaoDaEtapa(ctx.etapas.get(t.stageId)?.etapa.tipo ?? 'andamento');
    if (t.parentId) filhos.set(t.parentId, [...(filhos.get(t.parentId) ?? []), { situacao }]);
    if (t.problemId) incidentes.set(t.problemId, (incidentes.get(t.problemId) ?? 0) + 1);
  }
  return { filhos, incidentes, anotacoes, codigos: new Map(linhas.map((t) => [t.id, t.code])) };
}

/** Os cartões de uns chamados só (pelos ids), sem carregar a lista inteira. */
export async function cartoesDe(db: Db, ctx: Contexto, ids: string[]): Promise<Map<string, CartaoChamado>> {
  if (!ids.length) return new Map();
  const linhas = await db.select().from(tickets).where(inArray(tickets.id, ids));
  // os filhos e os incidentes destes (para as contagens), e os códigos do pai e do problema
  const [filhosEIncidentes, notas] = await Promise.all([
    db.select().from(tickets).where(and(isNull(tickets.deletedAt), or(inArray(tickets.parentId, ids), inArray(tickets.problemId, ids)))),
    db.select({ ticketId: ticketNotes.ticketId, n: sql<number>`count(*)::int` }).from(ticketNotes).where(and(isNull(ticketNotes.deletedAt), inArray(ticketNotes.ticketId, ids))).groupBy(ticketNotes.ticketId),
  ]);
  const refs = [...new Set(linhas.flatMap((t) => [t.parentId, t.problemId]).filter((x): x is string => !!x))];
  const outros = refs.length ? await db.select({ id: tickets.id, code: tickets.code }).from(tickets).where(inArray(tickets.id, refs)) : [];
  // um chamado pedido pode ser também filho (ou incidente) de outro pedido: entra uma vez só na conta
  const semRepetir = [...new Map([...linhas, ...filhosEIncidentes].map((t) => [t.id, t])).values()];
  const par = parentesDe(semRepetir, ctx, new Map(notas.map((n) => [n.ticketId, Number(n.n)])));
  for (const o of outros) par.codigos.set(o.id, o.code);
  return new Map(linhas.map((t) => [t.id, cartaoDaLinha(t, ctx, par)]));
}

// =====================================================================
//  ACHAR O CHAMADO
// =====================================================================

/** Pelo id ou pelo código (SUP-12, "sup 12"). Fora da lixeira, a não ser que `lixeira` peça. */
export async function chamadoOu404(db: Db, ref: string, opts: { lixeira?: boolean } = {}): Promise<LinhaChamado> {
  const codigo = /^\s*([A-Za-z]{2,5})[\s-]*(\d{1,7})\s*$/.exec(ref);
  const onde = codigo ? eq(tickets.code, `${codigo[1]!.toUpperCase()}-${Number(codigo[2])}`) : eq(tickets.id, ref);
  const [t] = await db.select().from(tickets).where(onde).limit(1);
  if (!t || (t.deletedAt && !opts.lixeira)) throw new NotFound('Chamado');
  return t;
}

/** O chamado, conferindo se a pessoa vê o painel dele. */
export async function chamadoVisivel(db: Db, ref: string, ator: Ator, ctx: Contexto, opts: { lixeira?: boolean } = {}): Promise<LinhaChamado> {
  const t = await chamadoOu404(db, ref, opts);
  const p = ctx.paineis.find((x) => x.id === t.panelId);
  if (!p || !podeVerPainel(p, ator)) throw new NotFound('Chamado');
  return t;
}

// =====================================================================
//  O HISTÓRICO
// =====================================================================

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Banco = Db | Tx;

/** Registra uma linha do histórico (o texto é montado na leitura, com `textoDoEvento`). */
export async function registrarEvento(db: Banco, ticketId: string, tipo: TipoEvento, ator: Ator | null, dados: Record<string, unknown> = {}, em?: Date) {
  await db.insert(ticketEvents).values({
    id: newId(), ticketId, kind: tipo,
    userId: ator ? pessoaDoAtor(ator) : null, actorName: ator ? integracaoDoAtor(ator) : null,
    data: dados, ...(em ? { createdAt: em } : {}),
  });
}

/** A última atividade do chamado (para achar o parado) e o "alterado em". */
export async function tocar(db: Banco, ticketId: string, quando: Date = new Date()) {
  await db.update(tickets).set({ lastActivityAt: quando, updatedAt: quando }).where(eq(tickets.id, ticketId));
}

export function eventoParaTela(e: typeof ticketEvents.$inferSelect, ctx: Contexto): EventoChamado {
  const dados = (e.data as Record<string, any>) ?? {};
  return {
    id: e.id, tipo: e.kind as TipoEvento, em: e.createdAt.toISOString(),
    por: pessoaCurta(ctx, e.userId), porNome: e.actorName, dados, texto: textoDoEvento(e.kind as TipoEvento, dados),
  };
}
