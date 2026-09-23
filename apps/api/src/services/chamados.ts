/**
 * A tela de Chamados: lê a cópia do LineChat e entrega os números.
 *
 * As contas em si (filtros, rankings, série por dia) estão em `@gestor/shared/chamados.ts` — as
 * mesmas que a prévia clicável usa. Aqui só se lê do banco e se monta o contexto.
 *
 * A leitura é guardada por até 1 minuto e jogada fora assim que uma sincronização grava algo:
 * a tela chama resumo e lista a cada clique de filtro, e não há por que ler 3 mil cards duas vezes.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { linechatCardMoves, linechatCards, linechatFields, linechatSteps, linechatTags, type Db } from '@gestor/db';
import {
  camposDeLista, listarChamados, resumirChamados, VAZIO,
  type Chamado, type ContextoChamados, type FiltrosChamados, type ListaChamadosQuery,
} from '@gestor/shared';
import { lerAjustes, versaoDosDados } from './linechat.js';

type Leitura = { cards: Chamado[]; ctx: Omit<ContextoChamados, 'agora'>; painelId: string; appUrl: string };
let guardada: { versao: number; em: number; painelId: string; dados: Leitura } | null = null;

/** Joga fora a leitura guardada (ao trocar o painel, por exemplo). */
export function esquecerLeitura() { guardada = null; }

async function ler(db: Db): Promise<Leitura> {
  const { valor } = await lerAjustes(db);
  const painelId = valor.painelId;
  const v = versaoDosDados();
  if (guardada && guardada.versao === v && guardada.painelId === painelId && Date.now() - guardada.em < 60_000) return guardada.dados;

  const [linhas, etapas, campos, etiquetas] = await Promise.all([
    painelId
      ? db.select().from(linechatCards).where(and(eq(linechatCards.panelId, painelId), isNull(linechatCards.removedAt)))
      : Promise.resolve([] as Array<typeof linechatCards.$inferSelect>),
    db.select().from(linechatSteps),
    db.select().from(linechatFields),
    db.select().from(linechatTags),
  ]);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const cards: Chamado[] = linhas.map((c) => ({
    id: c.id, key: c.key, number: c.number, title: c.title, description: c.description,
    stepId: c.stepId, stepTitle: c.stepTitle, stepPhase: c.stepPhase, status: c.status,
    responsavel: c.responsibleName,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    closedAt: iso(c.closedAt), closedEstimated: c.closedEstimated,
    dueDate: iso(c.dueDate), isOverdue: c.isOverdue, tagIds: c.tagIds, campos: c.customFields ?? {},
  }));
  const dados: Leitura = {
    cards,
    ctx: {
      etapas: etapas.map((e) => ({ id: e.id, title: e.title, position: e.position, isInitial: e.isInitial, isFinal: e.isFinal, archived: e.archived })),
      campos: campos.map((f) => ({ key: f.key, name: f.name, type: f.type, position: f.position, options: f.options ?? [], archived: f.archived })),
      etiquetas: etiquetas.map((t) => ({ id: t.id, name: t.name, color: t.color, archived: t.archived })),
    },
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
    etapas: l.ctx.etapas.filter((e) => !e.archived).sort((a, b) => a.position - b.position),
    campos: camposDeLista(l.ctx.campos).map((c) => ({ key: c.key, name: c.name, multiplo: c.type === 'MULTISELECT', options: c.options })),
    etiquetas: l.ctx.etiquetas.filter((t) => !t.archived).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    responsaveis,
    vazio: VAZIO,
  };
}
