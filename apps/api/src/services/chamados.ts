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
import { linechatCardMoves, linechatCards, linechatFields, linechatSteps, linechatTags, settings, users, type Db } from '@gestor/db';
import {
  atualizarPainelGuardado, camposDeLista, comFechamento, etapasDaEquipe, listarChamados, PainelChamadosSchema, primeiroDiaDe, resumirChamados, VAZIO,
  VERSAO_PAINEL, type Chamado, type ContextoChamados, type FiltrosChamados, type ItemPainel, type ListaChamadosQuery, type MovimentoChamado,
} from '@gestor/shared';
import { BadRequest } from '../plugins/errors.js';
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
