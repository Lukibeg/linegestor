/**
 * Sincronização dos chamados de suporte com o LineChat.
 *
 * Os chamados são abertos e trabalhados no LineChat (o Kanban da equipe). O Gestor mantém uma
 * cópia só de leitura de um painel de lá, nas tabelas `linechat_*`, e a tela de Chamados lê
 * dessa cópia. Foi o que o DataWaiter + Grafana faziam, com três diferenças que importam:
 *
 *  1. **A cópia não é jogada fora a cada reinício.** Ela fica no PostgreSQL, entra no backup.
 *  2. **Guardamos cada mudança de etapa**, com a hora. A API do LineChat não entrega o histórico
 *     do card, então comparamos a etapa que ele tem agora com a que tinha na leitura anterior.
 *     É daqui que sai "quanto tempo ficou no N1" — a partir do dia em que a sincronização começou.
 *  3. **Card que sumiu de lá fica marcado**, em vez de continuar contando para sempre.
 *
 * O ritmo:
 *  - a cada minuto, a leitura **recente**: pede ao LineChat só o que mudou desde a última vez;
 *  - de madrugada (e na primeira vez), a **completa**: lê o painel inteiro, de 100 em 100 (é o
 *    máximo que a API devolve por vez), confere etapas, campos e etiquetas, e marca o que sumiu.
 *
 * A API do LineChat é a da Helena (a plataforma por trás dele). Referência: helena.readme.io.
 */
import { and, desc, eq, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  linechatCardMoves, linechatCards, linechatFields, linechatSteps, linechatSyncRuns, linechatTags, newId, type Db,
} from '@gestor/db';
import { diaEmBrasilia, horaEmBrasilia } from '@gestor/shared';
import * as integ from './integracoes.js';
import type { SecretsVault } from './secrets.js';

// ---------- o que a API do LineChat devolve (só o que usamos) ----------

type CardApi = {
  id: string;
  panelId?: string;
  number?: number | null;
  key?: string | null;
  title?: string | null;
  description?: string | null;
  stepId?: string | null;
  stepTitle?: string | null;
  stepPhase?: string | null;
  status?: string | null;
  createdAt: string;
  updatedAt: string;
  dueDate?: string | null;
  isOverdue?: boolean | null;
  tagIds?: string[] | null;
  responsibleUserId?: string | null;
  responsibleUser?: { id?: string; name?: string } | null;
  customFields?: Record<string, unknown> | null;
};
type PaginaApi<T> = { items: T[]; hasMorePages?: boolean; totalItems?: number; pageNumber?: number };
type PainelApi = {
  id: string; title: string; key?: string; type?: string; archived?: boolean;
  steps?: Array<{ id: string; title: string; position?: number; isInitial?: boolean; isFinal?: boolean; archived?: boolean }> | null;
  tags?: Array<{ id: string; name: string; bgColor?: string | null; archived?: boolean }> | null;
};
type CampoApi = { key: string; name?: string; type?: string; position?: number; options?: Array<{ name: string }> | null };

/** Tudo que a API diz que existe num card (incluir menos que isso faz o card vir sem os campos). */
const DETALHES = ['CustomFields', 'StepTitle', 'StepPhase', 'ResponsibleUser'];
/** Painel de "gestão" só tem OPEN e ARCHIVED; os outros dois são de painel de vendas. Pedimos todos. */
const SITUACOES = ['OPEN', 'ARCHIVED', 'WON', 'LOST'];
const POR_PAGINA = 100; // o máximo da API: 200 dá erro 500

// ---------- o cliente da API ----------

export class LineChatApi {
  constructor(private base: string, private token: string, private fetchFn: typeof fetch = fetch) {}

  async get<T>(caminho: string, params: Record<string, string | number | string[] | undefined> = {}): Promise<T> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => q.append(k, x)); else q.set(k, String(v));
    }
    const busca = q.toString();
    const url = `${this.base.replace(/\/+$/, '')}/${caminho.replace(/^\/+/, '')}${busca ? `?${busca}` : ''}`;
    // a chave do LineChat vem como "pn_…"; se alguém colar já com "Bearer ", respeitamos
    const auth = /^bearer\s/i.test(this.token) ? this.token : `Bearer ${this.token}`;
    let r: Response;
    try {
      r = await this.fetchFn(url, { headers: { accept: 'application/json', Authorization: auth }, signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      const motivo = e instanceof Error ? (e.name === 'TimeoutError' ? 'não respondeu em 30 segundos' : e.message) : String(e);
      throw new Error(`Não consegui falar com o LineChat (${motivo}). Confira o endereço da API.`);
    }
    if (r.status === 401 || r.status === 403) throw new Error(`O LineChat recusou o token (${r.status}). Gere um novo em LineChat › Integrações e salve aqui.`);
    if (r.status === 404) throw new Error('O LineChat não encontrou esse painel (404). Escolha o painel de novo.');
    if (!r.ok) {
      const texto = (await r.text().catch(() => '')).slice(0, 200);
      throw new Error(`O LineChat respondeu ${r.status}${texto ? `: ${texto}` : ''}`);
    }
    return (await r.json()) as T;
  }

  /** Todos os painéis da conta, para escolher na tela de Ajustes. */
  async paineis(): Promise<Array<{ id: string; title: string; key: string | null; type: string | null }>> {
    const todos: PainelApi[] = [];
    for (let pagina = 1; pagina <= 20; pagina++) {
      const r = await this.get<PaginaApi<PainelApi>>('crm/v2/panel', { PageNumber: pagina, PageSize: POR_PAGINA });
      todos.push(...r.items);
      if (!r.hasMorePages) break;
    }
    return todos.filter((p) => !p.archived).map((p) => ({ id: p.id, title: p.title, key: p.key ?? null, type: p.type ?? null }));
  }

  painel(id: string) {
    return this.get<PainelApi>(`crm/v1/panel/${encodeURIComponent(id)}`, { IncludeDetails: ['Steps', 'Tags'] });
  }

  campos(id: string) {
    return this.get<CampoApi[]>(`crm/v1/panel/${encodeURIComponent(id)}/custom-fields`);
  }

  /** Lê cards página a página até acabar. `desde` = só os alterados depois dessa hora. */
  async cards(painelId: string, desde?: Date): Promise<CardApi[]> {
    const todos: CardApi[] = [];
    for (let pagina = 1; ; pagina++) {
      const r = await this.get<PaginaApi<CardApi>>('crm/v2/panel/card', {
        PanelId: painelId,
        PageNumber: pagina,
        PageSize: POR_PAGINA,
        // ordem pela abertura: card novo entra no fim, então nenhuma página "escorrega" durante a leitura
        OrderBy: desde ? 'UpdatedAt' : 'CreatedAt',
        OrderDirection: 'ASCENDING',
        IncludeDetails: DETALHES,
        Statuses: SITUACOES,
        'UpdatedAt.After': desde?.toISOString(),
      });
      todos.push(...r.items);
      if (!r.hasMorePages || !r.items.length) break;
      if (pagina >= 2000) throw new Error('O LineChat devolveu páginas demais (mais de 200 mil cards?). Leitura interrompida.');
    }
    return todos;
  }
}

// ---------- ajustes e token ----------

export async function lerAjustes(db: Db) {
  return integ.ler<integ.AjustesLineChat>(db, 'linechat');
}

export async function clienteDaApi(db: Db, vault: SecretsVault, fetchFn?: typeof fetch): Promise<{ api: LineChatApi; ajustes: integ.AjustesLineChat }> {
  const { valor } = await lerAjustes(db);
  const token = await integ.segredo(db, vault, 'linechat');
  if (!token) throw new Error('Falta o token do LineChat. Cole a chave de API em Administração › Ajustes.');
  return { api: new LineChatApi(valor.url || integ.LINECHAT_PADRAO.url, token, fetchFn), ajustes: valor };
}

/** Grava só o "como foi", sem mexer no que a pessoa configurou. */
async function gravarSituacao(db: Db, mudar: Partial<integ.AjustesLineChat>) {
  const { valor } = await lerAjustes(db);
  await integ.gravar(db, 'linechat', { ...valor, ...mudar });
}

// ---------- a estrutura do painel: etapas, campos, etiquetas ----------

async function atualizarEstrutura(db: Db, api: LineChatApi, painelId: string, agora: Date) {
  const [painel, campos] = await Promise.all([api.painel(painelId), api.campos(painelId)]);

  const etapas = (painel.steps ?? []).map((e, i) => ({
    id: e.id, title: e.title, position: e.position ?? i + 1,
    isInitial: !!e.isInitial, isFinal: !!e.isFinal, archived: !!e.archived, syncedAt: agora,
  }));
  const etiquetas = (painel.tags ?? []).map((t) => ({ id: t.id, name: t.name, color: t.bgColor ?? null, archived: !!t.archived, syncedAt: agora }));
  // "GROUP" é só um agrupador visual no formulário do card, não guarda valor
  const listaCampos = (Array.isArray(campos) ? campos : [])
    .filter((c) => c && c.key && c.type !== 'GROUP')
    .map((c) => ({ key: c.key, name: c.name || c.key, type: c.type ?? 'TEXT', position: c.position ?? 0, options: (c.options ?? []).map((o) => o.name), archived: false, syncedAt: agora }));

  await db.transaction(async (tx) => {
    for (const e of etapas) await tx.insert(linechatSteps).values(e).onConflictDoUpdate({ target: linechatSteps.id, set: e });
    for (const t of etiquetas) await tx.insert(linechatTags).values(t).onConflictDoUpdate({ target: linechatTags.id, set: t });
    for (const c of listaCampos) await tx.insert(linechatFields).values(c).onConflictDoUpdate({ target: linechatFields.key, set: c });
    // o que não veio mais foi apagado lá: fica guardado (os cards antigos ainda citam), mas arquivado
    const semEtapas = etapas.length ? notInArray(linechatSteps.id, etapas.map((e) => e.id)) : sql`true`;
    await tx.update(linechatSteps).set({ archived: true }).where(semEtapas);
    const semEtiquetas = etiquetas.length ? notInArray(linechatTags.id, etiquetas.map((t) => t.id)) : sql`true`;
    await tx.update(linechatTags).set({ archived: true }).where(semEtiquetas);
    const semCampos = listaCampos.length ? notInArray(linechatFields.key, listaCampos.map((c) => c.key)) : sql`true`;
    await tx.update(linechatFields).set({ archived: true }).where(semCampos);
  });
  return { painelNome: painel.title, etapas };
}

// ---------- a sincronização ----------

export type ResultadoSincronizacao = {
  ok: boolean;
  tipo: 'completa' | 'recente';
  mensagem: string;
  lidos: number;
  novos: number;
  movimentos: number;
  removidos: number;
};

/** Uma sincronização por vez: a automática e o botão não podem se atropelar. */
let emAndamento: Promise<ResultadoSincronizacao> | null = null;
/** Muda a cada sincronização que gravou algo: a tela de Chamados usa para saber se pode reaproveitar a leitura. */
let versao = 0;
export const versaoDosDados = () => versao;

type Antigo = { id: string; stepId: string | null; stepTitle: string | null; status: string; closedAt: Date | null; closedEstimated: boolean; archivedAt: Date | null; removedAt: Date | null };

const dataOuNula = (v: string | null | undefined) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

export async function sincronizar(
  db: Db,
  vault: SecretsVault,
  opts: { completa?: boolean; gatilho?: 'agendada' | 'manual'; userId?: string | null; fetchFn?: typeof fetch; log?: { warn: (o: unknown, m?: string) => void } } = {},
): Promise<ResultadoSincronizacao> {
  if (emAndamento) return emAndamento;
  emAndamento = rodar(db, vault, opts).finally(() => { emAndamento = null; });
  return emAndamento;
}

async function rodar(
  db: Db,
  vault: SecretsVault,
  opts: { completa?: boolean; gatilho?: 'agendada' | 'manual'; userId?: string | null; fetchFn?: typeof fetch; log?: { warn: (o: unknown, m?: string) => void } },
): Promise<ResultadoSincronizacao> {
  const inicio = new Date();
  const gatilho = opts.gatilho ?? 'agendada';
  const { valor: ajustes } = await lerAjustes(db);
  // sem nenhuma completa ainda, a recente não tem de onde partir
  const tipo: 'completa' | 'recente' = opts.completa || !ajustes.inicioEm || !ajustes.marcoEm ? 'completa' : 'recente';
  const r: ResultadoSincronizacao = { ok: false, tipo, mensagem: '', lidos: 0, novos: 0, movimentos: 0, removidos: 0 };

  try {
    if (!ajustes.painelId) throw new Error('Escolha o painel do LineChat em Administração › Ajustes.');
    const { api } = await clienteDaApi(db, vault, opts.fetchFn);

    const { painelNome, etapas } = await atualizarEstrutura(db, api, ajustes.painelId, inicio);
    const finais = new Set(etapas.filter((e) => e.isFinal).map((e) => e.id));
    const tituloDaEtapa = new Map(etapas.map((e) => [e.id, e.title]));

    // a recente volta 2 minutos antes do marco: o relógio de lá e o daqui não batem no segundo
    const desde = tipo === 'recente' ? new Date(Date.parse(ajustes.marcoEm!) - 2 * 60_000) : undefined;
    const lidos = await api.cards(ajustes.painelId, desde);
    // a mesma leitura pode trazer um card duas vezes se ele mudou no meio: fica a versão mais nova
    const porId = new Map<string, CardApi>();
    for (const c of lidos) { const j = porId.get(c.id); if (!j || Date.parse(c.updatedAt) >= Date.parse(j.updatedAt)) porId.set(c.id, c); }
    r.lidos = porId.size;

    const ids = [...porId.keys()];
    const antigos = new Map<string, Antigo>();
    const colunas = {
      id: linechatCards.id, stepId: linechatCards.stepId, stepTitle: linechatCards.stepTitle, status: linechatCards.status,
      closedAt: linechatCards.closedAt, closedEstimated: linechatCards.closedEstimated, archivedAt: linechatCards.archivedAt, removedAt: linechatCards.removedAt,
    };
    for (let i = 0; i < ids.length; i += 1000) {
      const lote = await db.select(colunas).from(linechatCards).where(inArray(linechatCards.id, ids.slice(i, i + 1000)));
      for (const a of lote) antigos.set(a.id, a);
    }

    // a primeira completa é o marco do histórico: o que já existia antes dela tem hora estimada
    const inicioDoHistorico = ajustes.inicioEm ? new Date(ajustes.inicioEm) : inicio;
    const linhas: Array<typeof linechatCards.$inferInsert> = [];
    const movimentos: Array<typeof linechatCardMoves.$inferInsert> = [];

    for (const c of porId.values()) {
      const criado = dataOuNula(c.createdAt) ?? inicio;
      const alterado = dataOuNula(c.updatedAt) ?? criado;
      const stepId = c.stepId ?? null;
      const stepTitle = c.stepTitle ?? (stepId ? tituloDaEtapa.get(stepId) ?? null : null);
      const fechado = stepId ? finais.has(stepId) : c.stepPhase === 'FINAL';
      const status = c.status ?? 'OPEN';
      const antigo = antigos.get(c.id);
      // aberto depois que começamos a olhar = sabemos a hora exata de tudo que acontecer com ele
      const nasceuDepois = criado.getTime() >= inicioDoHistorico.getTime() - 60_000;

      let closedAt: Date | null; let closedEstimated: boolean; let archivedAt: Date | null;
      if (!antigo) {
        r.novos++;
        movimentos.push({
          id: newId(), cardId: c.id, fromStepId: null, fromStepTitle: null, toStepId: stepId, toStepTitle: stepTitle,
          at: nasceuDepois ? criado : alterado, estimated: !nasceuDepois,
        });
        closedAt = fechado ? alterado : null;
        closedEstimated = fechado && !nasceuDepois;
        archivedAt = status === 'ARCHIVED' ? alterado : null;
      } else {
        if (stepId && stepId !== antigo.stepId) {
          movimentos.push({
            id: newId(), cardId: c.id, fromStepId: antigo.stepId, fromStepTitle: antigo.stepTitle, toStepId: stepId, toStepTitle: stepTitle,
            at: alterado, estimated: false,
          });
        }
        // chegou agora numa etapa final: fechou nesta hora. Saiu dela: reaberto
        if (!fechado) { closedAt = null; closedEstimated = false; }
        else if (antigo.closedAt && antigo.stepId && finais.has(antigo.stepId)) { closedAt = antigo.closedAt; closedEstimated = antigo.closedEstimated; }
        else { closedAt = alterado; closedEstimated = false; }
        archivedAt = status === 'ARCHIVED' ? (antigo.status === 'ARCHIVED' && antigo.archivedAt ? antigo.archivedAt : alterado) : null;
      }

      linhas.push({
        id: c.id,
        panelId: c.panelId ?? ajustes.painelId,
        number: c.number ?? null,
        key: c.key ?? null,
        title: (c.title ?? '').trim(),
        description: c.description ?? null,
        stepId, stepTitle, stepPhase: c.stepPhase ?? null,
        status,
        responsibleId: c.responsibleUserId ?? c.responsibleUser?.id ?? null,
        responsibleName: c.responsibleUser?.name ?? null,
        dueDate: dataOuNula(c.dueDate),
        isOverdue: !!c.isOverdue,
        tagIds: c.tagIds ?? [],
        customFields: c.customFields ?? {},
        createdAt: criado,
        updatedAt: alterado,
        closedAt, closedEstimated, archivedAt,
        removedAt: null,
        firstSeenAt: inicio,
        lastSeenAt: inicio,
      });
    }
    r.movimentos = movimentos.filter((m) => m.fromStepId).length;

    await db.transaction(async (tx) => {
      for (let i = 0; i < linhas.length; i += 200) {
        await tx.insert(linechatCards).values(linhas.slice(i, i + 200)).onConflictDoUpdate({
          target: linechatCards.id,
          // `firstSeenAt` fica o da primeira vez; todo o resto é o que o LineChat diz agora
          set: {
            panelId: sql`excluded.panel_id`, number: sql`excluded.number`, key: sql`excluded.key`, title: sql`excluded.title`,
            description: sql`excluded.description`, stepId: sql`excluded.step_id`, stepTitle: sql`excluded.step_title`,
            stepPhase: sql`excluded.step_phase`, status: sql`excluded.status`, responsibleId: sql`excluded.responsible_id`,
            responsibleName: sql`excluded.responsible_name`, dueDate: sql`excluded.due_date`, isOverdue: sql`excluded.is_overdue`,
            tagIds: sql`excluded.tag_ids`, customFields: sql`excluded.custom_fields`, createdAt: sql`excluded.created_at`,
            updatedAt: sql`excluded.updated_at`, closedAt: sql`excluded.closed_at`, closedEstimated: sql`excluded.closed_estimated`,
            archivedAt: sql`excluded.archived_at`, removedAt: sql`null`, lastSeenAt: sql`excluded.last_seen_at`,
          },
        });
      }
      for (let i = 0; i < movimentos.length; i += 500) await tx.insert(linechatCardMoves).values(movimentos.slice(i, i + 500));

      if (tipo === 'completa') {
        // o que a completa não encontrou foi excluído lá. Mas se veio muito menos do que temos,
        // o mais provável é token ou painel errado — não saímos marcando metade da base
        const [contagem] = await tx.select({ n: sql<number>`count(*)::int` }).from(linechatCards)
          .where(and(eq(linechatCards.panelId, ajustes.painelId), isNull(linechatCards.removedAt)));
        const ativos = Number(contagem?.n ?? 0);
        const sumidos = Number(ativos) - linhas.length;
        if (sumidos > 0 && sumidos > Number(ativos) / 2 && Number(ativos) > 20) {
          r.mensagem = `Atenção: o LineChat devolveu ${linhas.length} cards, e aqui há ${ativos}. Nada foi marcado como excluído — confira o painel e o token.`;
        } else if (sumidos > 0) {
          const marcados = await tx.update(linechatCards).set({ removedAt: inicio })
            .where(and(eq(linechatCards.panelId, ajustes.painelId), isNull(linechatCards.removedAt), lt(linechatCards.lastSeenAt, inicio)))
            .returning({ id: linechatCards.id });
          r.removidos = marcados.length;
        }
      }
    });
    if (linhas.length || r.removidos) versao++;

    r.ok = true;
    const partes = [
      `${r.lidos.toLocaleString('pt-BR')} ${r.lidos === 1 ? 'card lido' : 'cards lidos'}`,
      r.novos ? `${r.novos.toLocaleString('pt-BR')} novos` : '',
      r.movimentos ? `${r.movimentos.toLocaleString('pt-BR')} mudanças de etapa` : '',
      r.removidos ? `${r.removidos.toLocaleString('pt-BR')} excluídos no LineChat` : '',
    ].filter(Boolean);
    r.mensagem = r.mensagem || `${tipo === 'completa' ? 'Leitura completa' : 'Atualização'}: ${partes.join(', ')}.`;

    await gravarSituacao(db, {
      painelNome,
      inicioEm: ajustes.inicioEm ?? inicio.toISOString(),
      marcoEm: inicio.toISOString(),
      ultimaEm: new Date().toISOString(), ultimaOk: true, ultimaMsg: r.mensagem,
      ultimaCompletaEm: tipo === 'completa' ? inicio.toISOString() : ajustes.ultimaCompletaEm,
      falhasSeguidas: 0,
    });
  } catch (e) {
    r.ok = false;
    r.mensagem = e instanceof Error ? e.message : String(e);
    const falhas = (ajustes.falhasSeguidas ?? 0) + 1;
    await gravarSituacao(db, { ultimaEm: new Date().toISOString(), ultimaOk: false, ultimaMsg: r.mensagem, falhasSeguidas: falhas });
    // um aviso só, depois de 15 minutos seguidos falhando — um soluço de rede não merece WhatsApp
    if (falhas === 15) await avisarFalha(db, vault, r.mensagem).catch((err) => opts.log?.warn({ err }, 'não deu para mandar o aviso da sincronização'));
  }

  // o registro: completa, manual e erro sempre; a de minuto em minuto só quando mudou algo
  if (tipo === 'completa' || gatilho === 'manual' || !r.ok || r.novos || r.movimentos) {
    await db.insert(linechatSyncRuns).values({
      id: newId(), kind: tipo, trigger: gatilho, startedAt: inicio, finishedAt: new Date(), ok: r.ok, message: r.mensagem,
      cardsRead: r.lidos, cardsNew: r.novos, moves: r.movimentos, cardsRemoved: r.removidos, userId: opts.userId ?? null,
    });
  }
  if (tipo === 'completa') await db.delete(linechatSyncRuns).where(lt(linechatSyncRuns.startedAt, new Date(Date.now() - 90 * 86_400_000)));
  return r;
}

async function avisarFalha(db: Db, vault: SecretsVault, motivo: string) {
  const { valor } = await integ.ler<integ.AjustesAvisos>(db, 'avisos');
  if (!valor.ativo || !valor.url) return;
  const token = await integ.segredo(db, vault, 'avisos');
  await integ.enviarAviso(valor, token, `Ingline Gestão: os chamados do LineChat não sincronizam há 15 minutos. Motivo: ${motivo}`);
}

/** As últimas execuções, para a tela de Ajustes. */
export async function ultimasExecucoes(db: Db, n = 8) {
  return db.select({
    id: linechatSyncRuns.id, kind: linechatSyncRuns.kind, trigger: linechatSyncRuns.trigger, startedAt: linechatSyncRuns.startedAt,
    finishedAt: linechatSyncRuns.finishedAt, ok: linechatSyncRuns.ok, message: linechatSyncRuns.message,
  }).from(linechatSyncRuns).orderBy(desc(linechatSyncRuns.startedAt)).limit(n);
}

/** Quanto já temos guardado do painel escolhido. */
export async function totais(db: Db, painelId: string) {
  if (!painelId) return { cards: 0, ativos: 0, arquivados: 0, movimentos: 0 };
  const [c] = await db.select({
    cards: sql<number>`count(*)::int`,
    ativos: sql<number>`count(*) filter (where ${linechatCards.status} <> 'ARCHIVED')::int`,
    arquivados: sql<number>`count(*) filter (where ${linechatCards.status} = 'ARCHIVED')::int`,
  }).from(linechatCards).where(and(eq(linechatCards.panelId, painelId), isNull(linechatCards.removedAt)));
  const [m] = await db.select({ n: sql<number>`count(*)::int` }).from(linechatCardMoves).where(sql`${linechatCardMoves.fromStepId} is not null`);
  return { cards: Number(c?.cards ?? 0), ativos: Number(c?.ativos ?? 0), arquivados: Number(c?.arquivados ?? 0), movimentos: Number(m?.n ?? 0) };
}

// ---------- o relógio ----------

/**
 * Liga a sincronização automática. Chamado só pelo `server.ts` (os testes não ligam relógio).
 * A cada minuto: se estiver ligada e configurada, roda. A completa acontece na primeira vez,
 * às 4h (depois do backup das 3h e da conferência das 3h30) e, se o servidor ficou fora do ar
 * na madrugada, assim que passar de 26 horas sem ela.
 */
export function iniciarSincronizacaoAutomatica(app: FastifyInstance) {
  const tick = async () => {
    try {
      const { valor, temSegredo } = await lerAjustes(app.db);
      if (!valor.ativo || !valor.painelId || !temSegredo) return;
      const agora = new Date();
      const ultima = valor.ultimaCompletaEm ? Date.parse(valor.ultimaCompletaEm) : 0;
      const horas = (agora.getTime() - ultima) / 3_600_000;
      const madrugada = horaEmBrasilia(agora) === 4 && (!valor.ultimaCompletaEm || diaEmBrasilia(valor.ultimaCompletaEm) !== diaEmBrasilia(agora));
      const completa = !valor.ultimaCompletaEm || madrugada || horas > 26;
      const r = await sincronizar(app.db, app.vault, { completa, gatilho: 'agendada', log: app.log });
      if (!r.ok) app.log.warn({ motivo: r.mensagem }, 'sincronização do LineChat falhou');
    } catch (err) {
      app.log.error({ err }, 'sincronização do LineChat: erro inesperado');
    }
  };
  const primeira = setTimeout(() => void tick(), 20_000);
  const relogio = setInterval(() => void tick(), 60_000);
  app.addHook('onClose', async () => { clearTimeout(primeira); clearInterval(relogio); });
}
