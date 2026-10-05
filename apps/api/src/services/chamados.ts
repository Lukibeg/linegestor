/**
 * A tela de Chamados: lê a cópia do LineChat e entrega os números.
 *
 * As contas em si (filtros, rankings, série por dia) estão em `@gestor/shared/chamados.ts` — as
 * mesmas que a prévia clicável usa. Aqui só se lê do banco e se monta o contexto.
 *
 * A leitura é guardada por até 1 minuto e jogada fora assim que uma sincronização grava algo:
 * a tela chama resumo e lista a cada clique de filtro, e não há por que ler 3 mil cards duas vezes.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  clients, deviceModels, devices, dids, linechatCardMoves, linechatCards, linechatFields, linechatSteps, linechatTags, products, settings, subscriptions, users,
  type Db,
} from '@gestor/db';
import {
  AjustesRelatoriosSchema, ajustesParaTela, ArrumacaoRelatoriosSchema, montarArrumacao, type ArrumacaoRelatorios, atualizarPainelGuardado, camposDeLista, camposDosRelatorios, chamadosDaPeca, comFechamento, conferirAjustes,
  etapasDaEquipe, listarChamados, opcoesLigadasAo, PainelChamadosSchema, primeiroDiaDe, raioXChamados, relatoriosChamados, resumirChamados, VAZIO,
  VERSAO_PAINEL, type AjustesRelatorios, type Chamado, type ChamadosDaPecaQuery, type ContextoChamados, type ContextoRelatorios, type FiltrosChamados,
  type FiltrosRelatorios, type ItemPainel, type ListaChamadosQuery, type MovimentoChamado,
} from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';
import { gravar } from './integracoes.js';
import { lerAjustes, versaoDosDados } from './linechat.js';

/**
 * O que a tela lê, já com a escolha da equipe aplicada: as etapas trazem o "fecha o chamado" de
 * Organizar (`isFinal`) e o do LineChat guardado à parte (`finalNoLineChat`, para a tela mostrar o
 * padrão), e cada card traz a hora do fechamento refeita pelo histórico (`comFechamento`).
 */
type Leitura = {
  cards: Chamado[];
  ctx: Omit<ContextoChamados, 'agora'>;
  finaisDoLineChat: Set<string>;
  painelId: string;
  appUrl: string;
  /** as mudanças de etapa de cada card (os Relatórios usam: a escada N1 → N2 → N3 e os reabertos) */
  historico: Map<string, MovimentoChamado[]>;
  /** desde quando o histórico tem hora exata (a primeira sincronização) */
  historicoDesde: string | null;
  /** os grupos que a equipe montou em Organizar, por gráfico (os Relatórios usam os do Assunto) */
  grupos: Map<string, NonNullable<ItemPainel['grupos']>>;
};
let guardada: { versao: number; em: number; painelId: string; dados: Leitura } | null = null;

/** Joga fora a leitura guardada (ao trocar o painel, por exemplo). */
export function esquecerLeitura() { guardada = null; }

async function ler(db: Db): Promise<Leitura> {
  const { valor } = await lerAjustes(db);
  const painelId = valor.painelId;
  const v = versaoDosDados();
  if (guardada && guardada.versao === v && guardada.painelId === painelId && Date.now() - guardada.em < 60_000) return guardada.dados;

  const [linhas, etapas, campos, etiquetas, movimentos, arrumacao] = await Promise.all([
    painelId
      ? db.select().from(linechatCards).where(and(eq(linechatCards.panelId, painelId), isNull(linechatCards.removedAt)))
      : Promise.resolve([] as Array<typeof linechatCards.$inferSelect>),
    db.select().from(linechatSteps),
    db.select().from(linechatFields),
    db.select().from(linechatTags),
    // o histórico de etapas: é dele que sai a hora do fechamento com as etapas da equipe
    db.select({ cardId: linechatCardMoves.cardId, fromStepId: linechatCardMoves.fromStepId, toStepId: linechatCardMoves.toStepId, at: linechatCardMoves.at, estimated: linechatCardMoves.estimated })
      .from(linechatCardMoves).orderBy(asc(linechatCardMoves.at)),
    lerPainel(db),
  ]);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const todasEtapas = etapas.map((e) => ({ id: e.id, title: e.title, position: e.position, isInitial: e.isInitial, isFinal: e.isFinal, archived: e.archived }));
  const daEquipe = etapasDaEquipe(todasEtapas, arrumacao.etapasFechadas);
  const historico = new Map<string, MovimentoChamado[]>();
  for (const m of movimentos) {
    const lista = historico.get(m.cardId) ?? [];
    lista.push({ fromStepId: m.fromStepId, toStepId: m.toStepId, at: m.at.toISOString(), estimated: m.estimated });
    historico.set(m.cardId, lista);
  }
  const cards: Chamado[] = linhas.map((c) => ({
    id: c.id, key: c.key, number: c.number, title: c.title, description: c.description,
    stepId: c.stepId, stepTitle: c.stepTitle, stepPhase: c.stepPhase, status: c.status,
    responsavel: c.responsibleName,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    closedAt: iso(c.closedAt), closedEstimated: c.closedEstimated,
    dueDate: iso(c.dueDate), isOverdue: c.isOverdue, tagIds: c.tagIds, campos: c.customFields ?? {},
  }));
  const dados: Leitura = {
    cards: comFechamento(cards, daEquipe, historico),
    ctx: {
      etapas: daEquipe,
      campos: campos.map((f) => ({ key: f.key, name: f.name, type: f.type, position: f.position, options: f.options ?? [], archived: f.archived })),
      etiquetas: etiquetas.map((t) => ({ id: t.id, name: t.name, color: t.color, archived: t.archived })),
    },
    finaisDoLineChat: new Set(todasEtapas.filter((e) => e.isFinal).map((e) => e.id)),
    painelId,
    appUrl: (valor.appUrl || 'https://inglinechat.com.br').replace(/\/+$/, ''),
    historico,
    historicoDesde: valor.inicioEm ?? null,
    grupos: new Map(arrumacao.itens.filter((x) => x.grupos?.length).map((x) => [x.id, x.grupos!])),
  };
  guardada = { versao: v, em: Date.now(), painelId, dados };
  return dados;
}

/** Na tela, o card abre direto no LineChat (o mesmo endereço que a equipe já usa). */
const linkDe = (l: Leitura) => (c: Chamado) => (l.painelId && c.key ? `${l.appUrl}/panels/${l.painelId}/card/${encodeURIComponent(c.key)}` : '');

export async function resumo(db: Db, f: FiltrosChamados) {
  const l = await ler(db);
  return resumirChamados(l.cards, f, { ...l.ctx, agora: new Date() });
}

export async function lista(db: Db, q: ListaChamadosQuery) {
  const l = await ler(db);
  return listarChamados(l.cards, q, { ...l.ctx, agora: new Date() }, linkDe(l));
}

/** O que a tela precisa para montar os filtros, e se a sincronização está de pé. */
export async function opcoes(db: Db) {
  const { valor } = await lerAjustes(db);
  const l = await ler(db);
  const responsaveis = [...new Set(l.cards.map((c) => c.responsavel).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const [mov] = await db.select({ n: sql<number>`count(*)::int` }).from(linechatCardMoves).where(sql`${linechatCardMoves.fromStepId} is not null`);
  return {
    configurado: !!(valor.ativo && valor.painelId),
    painelId: valor.painelId,
    painelNome: valor.painelNome,
    appUrl: l.appUrl,
    linkDoPainel: valor.painelId ? `${l.appUrl}/panels/${valor.painelId}` : null,
    sincronizadoEm: valor.ultimaEm,
    ultimaOk: valor.ultimaOk,
    ultimaMsg: valor.ultimaMsg,
    /** a partir de quando temos o histórico de etapas com hora exata */
    historicoDesde: valor.inicioEm,
    totalCards: l.cards.length,
    movimentosRegistrados: Number(mov?.n ?? 0),
    // `isFinal` = fecha o chamado na tela (a escolha da equipe); `finalNoLineChat` = o padrão de lá
    etapas: l.ctx.etapas.filter((e) => !e.archived).sort((a, b) => a.position - b.position)
      .map((e) => ({ ...e, finalNoLineChat: l.finaisDoLineChat.has(e.id) })),
    /** o dia do chamado mais antigo: o começo do atalho "Tudo" do Período */
    primeiroDia: primeiroDiaDe(l.cards, new Date()),
    campos: camposDeLista(l.ctx.campos).map((c) => ({ key: c.key, name: c.name, multiplo: c.type === 'MULTISELECT', options: c.options })),
    etiquetas: l.ctx.etiquetas.filter((t) => !t.archived).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    responsaveis,
    vazio: VAZIO,
  };
}

// ---------- a arrumação da tela (igual para a equipe toda) ----------

export type PainelLido = {
  versao: number;
  itens: ItemPainel[];
  /** as etapas que fecham o chamado; null = as finais do LineChat */
  etapasFechadas: string[] | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

/**
 * A arrumação guardada e quem mexeu por último. Vazia = a de fábrica: quem junta com os gráficos
 * que existem hoje é a tela (`montarPainel`), porque campo novo no LineChat aparece sem ninguém
 * precisar arrumar de novo. A guardada no 1.3 volta convertida (`atualizarPainelGuardado`).
 */
export async function lerPainel(db: Db): Promise<PainelLido> {
  const [row] = await db
    .select({ value: settings.value, updatedAt: settings.updatedAt, nome: users.name })
    .from(settings).leftJoin(users, eq(users.id, settings.updatedBy))
    .where(eq(settings.id, 'chamados-painel')).limit(1);
  let lido: { versao?: number; itens: ItemPainel[]; etapasFechadas?: string[] | null } = { versao: VERSAO_PAINEL, itens: [] };
  if (row) {
    // guardado estragado não derruba a tela: ela volta à arrumação de fábrica
    try { const p = PainelChamadosSchema.safeParse(JSON.parse(row.value)); if (p.success) lido = atualizarPainelGuardado(p.data); } catch { /* fica a de fábrica */ }
  }
  return {
    versao: lido.versao ?? VERSAO_PAINEL,
    itens: lido.itens,
    etapasFechadas: lido.etapasFechadas?.length ? lido.etapasFechadas : null,
    atualizadoEm: row ? row.updatedAt.toISOString() : null,
    atualizadoPor: row?.nome ?? null,
  };
}

/**
 * Grava a arrumação. As etapas que fecham precisam existir no painel (uma lista só de etapas que
 * sumiram deixaria a tela sem nenhum fechado); a igual à do LineChat é guardada como "padrão"
 * (null), para acompanhar se o LineChat mudar as finais dele.
 */
export async function gravarPainel(db: Db, p: { itens: ItemPainel[]; etapasFechadas?: string[] | null }, userId: string): Promise<PainelLido> {
  let fechadas: string[] | null = null;
  if (p.etapasFechadas?.length) {
    const etapas = await db.select({ id: linechatSteps.id, isFinal: linechatSteps.isFinal, archived: linechatSteps.archived }).from(linechatSteps);
    const existentes = new Set(etapas.filter((e) => !e.archived).map((e) => e.id));
    const validas = [...new Set(p.etapasFechadas)].filter((id) => existentes.has(id));
    if (!validas.length) throw new BadRequest('Marque ao menos uma etapa que fecha o chamado.');
    const finais = etapas.filter((e) => e.isFinal && !e.archived).map((e) => e.id);
    const igualAoLineChat = finais.length === validas.length && finais.every((id) => validas.includes(id));
    fechadas = igualAoLineChat ? null : validas;
  }
  await gravar(db, 'chamados-painel', { versao: VERSAO_PAINEL, itens: p.itens, etapasFechadas: fechadas }, { userId });
  // as contas dependem das etapas fechadas: a próxima leitura refaz tudo
  esquecerLeitura();
  return lerPainel(db);
}

// ---------- os Relatórios (Patch 1.7) ----------
//
// As contas estão em `@gestor/shared/relatorios.ts` (as mesmas da prévia). Aqui: a leitura de
// sempre, mais o histórico de etapas, os ajustes dos relatórios e, no Raio-X, o que o cliente tem
// no Gestor.

export type AjustesRelatoriosLidos = AjustesRelatorios & { atualizadoEm: string | null; atualizadoPor: string | null };

/** Os ajustes dos relatórios (os campos usados e a ligação dos clientes). Guardado estragado = de fábrica. */
export async function lerAjustesRelatorios(db: Db): Promise<AjustesRelatoriosLidos> {
  const [row] = await db
    .select({ value: settings.value, updatedAt: settings.updatedAt, nome: users.name })
    .from(settings).leftJoin(users, eq(users.id, settings.updatedBy))
    .where(eq(settings.id, 'chamados-relatorios')).limit(1);
  let a: AjustesRelatorios = { campos: {}, clientes: {}, causas: {} };
  if (row) {
    try { const p = AjustesRelatoriosSchema.safeParse(JSON.parse(row.value)); if (p.success) a = p.data; } catch { /* fica o de fábrica */ }
  }
  return { ...a, atualizadoEm: row ? row.updatedAt.toISOString() : null, atualizadoPor: row?.nome ?? null };
}

async function contextoRelatorios(db: Db, l: Leitura): Promise<ContextoRelatorios> {
  const ajustes = await lerAjustesRelatorios(db);
  const campos = camposDosRelatorios(l.ctx.campos, ajustes.campos);
  return {
    ...l.ctx, agora: new Date(), historico: l.historico, historicoDesde: l.historicoDesde,
    ajustes: { campos: ajustes.campos, clientes: ajustes.clientes, causas: ajustes.causas },
    gruposAssunto: campos.assunto ? l.grupos.get(`campo:${campos.assunto.key}`) : undefined,
    ...(await cadastroComTamanho(db)),
  };
}

/**
 * O cadastro (para ligar o Cliente do card) e o tamanho de cada cliente no Gestor: DIDs e aparelhos
 * com ele (os vendidos não contam, como na ficha). É o que o "Chamados pelo tamanho do cliente" usa.
 */
async function cadastroComTamanho(db: Db) {
  const [cadastro, porDids, porAparelhos] = await Promise.all([
    db.select({ id: clients.id, tradeName: clients.tradeName, legalName: clients.legalName })
      .from(clients).where(and(isNull(clients.deletedAt), eq(clients.isInternal, false))),
    db.select({ id: dids.clientId, n: sql<number>`count(*)::int` }).from(dids)
      .where(and(isNull(dids.deletedAt), sql`${dids.clientId} is not null`)).groupBy(dids.clientId),
    db.select({ id: devices.clientId, n: sql<number>`count(*)::int` }).from(devices)
      .where(and(isNull(devices.deletedAt), sql`${devices.clientId} is not null`, sql`coalesce(${devices.currentModality}, '') <> 'venda'`)).groupBy(devices.clientId),
  ]);
  const nDids = new Map(porDids.map((x) => [x.id, Number(x.n)]));
  const nAparelhos = new Map(porAparelhos.map((x) => [x.id, Number(x.n)]));
  return {
    cadastro: cadastro.map((r) => ({ id: r.id, nomes: [r.tradeName, r.legalName].filter(Boolean) })),
    tamanhos: new Map(cadastro.map((r) => [r.id, { nome: r.tradeName, dids: nDids.get(r.id) ?? 0, aparelhos: nAparelhos.get(r.id) ?? 0 }])),
  };
}

export async function relatorios(db: Db, f: FiltrosRelatorios) {
  const l = await ler(db);
  return relatoriosChamados(l.cards, f, await contextoRelatorios(db, l), linkDe(l));
}

/** Os chamados por trás de uma peça clicada num relatório (uma faixa, um quadrado, uma coluna). */
export async function pecaDoRelatorio(db: Db, q: ChamadosDaPecaQuery) {
  const l = await ler(db);
  return chamadosDaPeca(l.cards, q, await contextoRelatorios(db, l), linkDe(l));
}

/** Os clientes do cadastro que podem aparecer no LineChat: fora os internos e os da lixeira. */
async function clientesParaLigar(db: Db) {
  const rows = await db.select({ id: clients.id, tradeName: clients.tradeName, legalName: clients.legalName })
    .from(clients).where(and(isNull(clients.deletedAt), eq(clients.isInternal, false)));
  return rows.map((r) => ({ id: r.id, nomes: [r.tradeName, r.legalName].filter(Boolean) }));
}

/** O que a janela "Ajustar" dos Relatórios mostra (a conta é a mesma da prévia: `ajustesParaTela`). */
export async function ajustesRelatorios(db: Db) {
  const l = await ler(db);
  const a = await lerAjustesRelatorios(db);
  return {
    ...ajustesParaTela(l.cards, l.ctx.campos, a, await clientesParaLigar(db)),
    atualizadoEm: a.atualizadoEm,
    atualizadoPor: a.atualizadoPor,
  };
}

/**
 * Grava os ajustes dos relatórios. O campo escolhido precisa existir (e ser de lista); o cliente
 * ligado precisa existir no cadastro, fora da lixeira. Ligação "automática" não é guardada: só a
 * que alguém escolheu (um cliente, ou "não é cliente do cadastro").
 */
export async function gravarAjustesRelatorios(db: Db, novo: AjustesRelatorios, userId: string) {
  const l = await ler(db);
  const erro = conferirAjustes(novo, l.ctx.campos, new Set((await clientesParaLigar(db)).map((c) => c.id)));
  if (erro) throw new BadRequest(erro);
  await gravar(db, 'chamados-relatorios', { campos: novo.campos, clientes: novo.clientes, causas: novo.causas }, { userId });
  return lerAjustesRelatorios(db);
}

/** O Raio-X de um cliente do Gestor: os chamados dele e, junto, o que ele tem no Gestor. */
export async function raioX(db: Db, clienteId: string, f: FiltrosRelatorios) {
  const [cli] = await db.select({ id: clients.id, nome: clients.tradeName, deletedAt: clients.deletedAt }).from(clients).where(eq(clients.id, clienteId)).limit(1);
  if (!cli || cli.deletedAt) throw new NotFound('Cliente');
  const l = await ler(db);
  const ctx = await contextoRelatorios(db, l);
  const campos = camposDosRelatorios(l.ctx.campos, ctx.ajustes.campos);
  const opcoes = opcoesLigadasAo(clienteId, l.cards, l.ctx.campos, ctx.ajustes, await clientesParaLigar(db));
  const r = raioXChamados(l.cards, opcoes, f, ctx, linkDe(l));
  const prods = await db.selectDistinct({ nome: products.name, ordem: products.sortOrder })
    .from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId))
    .where(and(eq(subscriptions.clientId, clienteId), isNull(subscriptions.deactivatedAt), isNull(products.deletedAt)))
    .orderBy(asc(products.sortOrder));
  const [didC] = await db.select({ n: sql<number>`count(*)` }).from(dids).where(and(eq(dids.clientId, clienteId), isNull(dids.deletedAt)));
  // como na ficha: os aparelhos que estão com ele (comodato, locação…), fora os vendidos
  const [devC] = await db.select({ n: sql<number>`count(*)` }).from(devices).innerJoin(deviceModels, eq(deviceModels.id, devices.modelId))
    .where(and(eq(devices.clientId, clienteId), isNull(devices.deletedAt), sql`coalesce(${devices.currentModality}, '') <> 'venda'`));
  return {
    cliente: { id: cli.id, nome: cli.nome },
    campoCliente: campos.cliente ? campos.cliente.name : null,
    gestor: { produtos: prods.map((p) => p.nome), dids: Number(didC?.n ?? 0), aparelhos: Number(devC?.n ?? 0) },
    ...r,
  };
}

// ---------- a arrumação da página de Relatórios (igual para a equipe toda) ----------

export type ArrumacaoLida = { ordem: string[]; ocultos: string[]; favoritos: string[]; atualizadoEm: string | null; atualizadoPor: string | null };

/** A ordem, os escondidos e os favoritos, juntos com o catálogo de hoje (relatório novo entra no fim). */
export async function lerArrumacao(db: Db): Promise<ArrumacaoLida> {
  const [row] = await db
    .select({ value: settings.value, updatedAt: settings.updatedAt, nome: users.name })
    .from(settings).leftJoin(users, eq(users.id, settings.updatedBy))
    .where(eq(settings.id, 'chamados-relatorios-arrumacao')).limit(1);
  let salva: Partial<ArrumacaoRelatorios> | null = null;
  if (row) {
    // guardada estragada (ou com um relatório que saiu do catálogo) não derruba a página
    try { const j = JSON.parse(row.value) as Partial<ArrumacaoRelatorios>; salva = { ordem: j.ordem ?? [], ocultos: j.ocultos ?? [], favoritos: j.favoritos ?? [] }; } catch { /* fica a de fábrica */ }
  }
  return { ...montarArrumacao(salva), atualizadoEm: row ? row.updatedAt.toISOString() : null, atualizadoPor: row?.nome ?? null };
}

export async function gravarArrumacao(db: Db, a: ArrumacaoRelatorios, userId: string): Promise<ArrumacaoLida> {
  const p = ArrumacaoRelatoriosSchema.parse(a);
  await gravar(db, 'chamados-relatorios-arrumacao', p, { userId });
  return lerArrumacao(db);
}
