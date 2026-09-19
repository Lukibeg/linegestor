/**
 * Projetos: uma tarefa que percorre VÁRIOS clientes até acabar
 * ("trocar o áudio da URA de todos os clientes com PBX").
 *
 * Regras que vivem aqui:
 *  - as **etapas são as mesmas para todo cliente** da lista; o andamento é a conta das resolvidas
 *  - uma etapa é uma **caixinha** (feito/não feito) ou uma **lista de opções** coloridas; na lista,
 *    só as opções marcadas como "resolve a etapa" fecham aquela coluna (é o "Sem necessidade" e o
 *    "Configuração realizada" da planilha contando como resolvido, e o "Pendente" não)
 *  - a situação de cada cliente **anda sozinha**: marcou a primeira etapa → em andamento;
 *    marcou todas → concluído; desmarcou alguma → volta para em andamento (ou pendente)
 *  - **travado** e **não se aplica** são escolhas de gente: o sistema não tira nem põe sozinho,
 *    e "travado" só existe com o motivo escrito
 *  - **não se aplica** fecha a linha sem contar como trabalho feito (não entra no "concluídos")
 *  - tirar uma etapa do projeto apaga as marcas dela; renomear (mesmo `id`) preserva tudo
 *  - anexo é qualquer arquivo, guardado no próprio banco (entra no backup junto com o resto)
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  clients, newId, projectAttachments, projectChecks, projectClients, projectComments, projectSteps, projects, users,
  type Db,
} from '@gestor/db';
import type { EtapaProjeto, ProjetoAtualizar, ProjetoGravar, ProjetoLinha, SituacaoProjeto } from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';

/** O tamanho máximo de um anexo, já em bytes do arquivo (não do texto base64). */
export const LIMITE_ANEXO_BYTES = 10 * 1024 * 1024;

/** Situações que fecham a linha: ela sai do "falta fazer". */
const FECHADAS: SituacaoProjeto[] = ['concluido', 'nao_se_aplica'];
/** Situações que a pessoa escolhe e o sistema não desfaz sozinho. */
const MANUAIS: SituacaoProjeto[] = ['travado', 'nao_se_aplica'];

type LinhaEtapa = typeof projectSteps.$inferSelect;

/**
 * Aquela etapa, naquele cliente, está resolvida?
 * Caixinha: basta existir a marca. Lista: a opção escolhida precisa ser uma que "resolve".
 */
export function etapaResolvida(etapa: Pick<LinhaEtapa, 'kind' | 'options'>, marca?: { value: string | null } | null) {
  if (!marca) return false;
  if (etapa.kind !== 'escolha') return true;
  return (etapa.options ?? []).some((o) => o.id === marca.value && o.conclui);
}

async function projetoOu404(db: Db, id: string) {
  const [row] = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.deletedAt)));
  if (!row) throw new NotFound('Projeto');
  return row;
}

async function linhaOu404(db: Db, projectId: string, projectClientId: string) {
  const [row] = await db.select().from(projectClients).where(and(eq(projectClients.id, projectClientId), eq(projectClients.projectId, projectId)));
  if (!row) throw new BadRequest('Este cliente não está no projeto');
  return row;
}

/**
 * A situação que a linha deve ter depois de marcar/desmarcar uma etapa.
 * Só mexe em quem está no fluxo automático: travado e "não se aplica" ficam como a pessoa deixou.
 */
function situacaoPelasMarcas(atual: SituacaoProjeto, marcadas: number, totalEtapas: number): SituacaoProjeto {
  if (MANUAIS.includes(atual)) return atual;
  if (totalEtapas > 0 && marcadas >= totalEtapas) return 'concluido';
  if (marcadas > 0) return 'andamento';
  return 'pendente';
}

/** Reavalia a linha depois de qualquer mudança nas marcas. Devolve a linha já atualizada. */
async function recalcular(db: Db, linhaId: string) {
  const [linha] = await db.select().from(projectClients).where(eq(projectClients.id, linhaId));
  if (!linha) throw new BadRequest('Este cliente não está no projeto');
  const [etapas, marcas] = await Promise.all([
    db.select().from(projectSteps).where(eq(projectSteps.projectId, linha.projectId)),
    db.select().from(projectChecks).where(eq(projectChecks.projectClientId, linhaId)),
  ]);
  const resolvidas = etapas.filter((e) => etapaResolvida(e, marcas.find((m) => m.stepId === e.id))).length;
  const status = situacaoPelasMarcas(linha.status as SituacaoProjeto, resolvidas, etapas.length);
  if (status === linha.status) return linha;
  const [nova] = await db.update(projectClients)
    .set({ status, doneAt: FECHADAS.includes(status) ? new Date() : null, updatedAt: new Date() })
    .where(eq(projectClients.id, linhaId)).returning();
  return nova!;
}

// ---------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------

type Contagem = { pendente: number; andamento: number; travado: number; concluido: number; nao_se_aplica: number };
const zerado = (): Contagem => ({ pendente: 0, andamento: 0, travado: 0, concluido: 0, nao_se_aplica: 0 });

/** Ficou para trás? Só faz sentido em projeto aberto com data-alvo já passada e gente devendo. */
function atrasado(p: { status: string; dueDate: string | null }, faltam: number) {
  if (p.status !== 'aberto' || !p.dueDate || faltam === 0) return false;
  return p.dueDate < new Date().toISOString().slice(0, 10);
}

/** A lista de projetos, cada um com o quanto já andou. */
export async function list(db: Db, opts: { status?: string; q?: string } = {}) {
  const conds = [isNull(projects.deletedAt)];
  if (opts.status && opts.status !== 'todos') conds.push(eq(projects.status, opts.status));
  if (opts.q) conds.push(sql`(${projects.name} ilike ${'%' + opts.q + '%'} or coalesce(${projects.goal}, '') ilike ${'%' + opts.q + '%'})`);

  const rows = await db.select({ p: projects, ownerName: users.name })
    .from(projects).leftJoin(users, eq(users.id, projects.ownerId))
    .where(and(...conds))
    .orderBy(desc(sql`coalesce(${projects.closedAt}, ${projects.updatedAt})`));
  const ids = rows.map((r) => r.p.id);
  if (!ids.length) return [];

  const [linhas, etapas] = await Promise.all([
    db.select({ projectId: projectClients.projectId, status: projectClients.status }).from(projectClients).where(inArray(projectClients.projectId, ids)),
    db.select({ projectId: projectSteps.projectId, n: sql<number>`count(*)::int` }).from(projectSteps).where(inArray(projectSteps.projectId, ids)).groupBy(projectSteps.projectId),
  ]);

  return rows.map(({ p, ownerName }) => {
    const minhas = linhas.filter((l) => l.projectId === p.id);
    const contagem = zerado();
    for (const l of minhas) contagem[l.status as keyof Contagem] = (contagem[l.status as keyof Contagem] ?? 0) + 1;
    const total = minhas.length;
    const fechadas = contagem.concluido + contagem.nao_se_aplica;
    const faltam = total - fechadas;
    return {
      id: p.id, name: p.name, goal: p.goal, status: p.status, dueDate: p.dueDate,
      ownerId: p.ownerId, ownerName: ownerName ?? null, closedAt: p.closedAt,
      createdAt: p.createdAt, updatedAt: p.updatedAt,
      etapas: etapas.find((e) => e.projectId === p.id)?.n ?? 0,
      total, faltam, contagem,
      andamento: total ? Math.round((fechadas / total) * 100) : 0,
      atrasado: atrasado(p, faltam),
    };
  });
}

/** O projeto inteiro: etapas, a lista de clientes com as marcas, comentários e anexos. */
export async function get(db: Db, id: string) {
  const p = await projetoOu404(db, id);
  const [etapas, linhas, marcas, comentarios, anexos, owner] = await Promise.all([
    db.select().from(projectSteps).where(eq(projectSteps.projectId, id)).orderBy(asc(projectSteps.sortOrder)),
    db.select({ l: projectClients, clientName: clients.tradeName, arquivado: clients.archived, assigneeName: users.name })
      .from(projectClients)
      .innerJoin(clients, eq(clients.id, projectClients.clientId))
      .leftJoin(users, eq(users.id, projectClients.assigneeId))
      .where(eq(projectClients.projectId, id))
      .orderBy(asc(clients.tradeName)),
    db.select({ c: projectChecks, quem: users.name }).from(projectChecks)
      .leftJoin(users, eq(users.id, projectChecks.doneById))
      .where(sql`${projectChecks.projectClientId} in (select id from project_clients where project_id = ${id})`),
    db.select({ c: projectComments, autor: users.name }).from(projectComments)
      .leftJoin(users, eq(users.id, projectComments.userId))
      .where(and(eq(projectComments.projectId, id), isNull(projectComments.deletedAt)))
      .orderBy(desc(projectComments.createdAt)),
    db.select({
      id: projectAttachments.id, projectClientId: projectAttachments.projectClientId, fileName: projectAttachments.fileName,
      mimeType: projectAttachments.mimeType, sizeBytes: projectAttachments.sizeBytes, createdAt: projectAttachments.createdAt,
      quem: users.name,
    }).from(projectAttachments)
      .leftJoin(users, eq(users.id, projectAttachments.uploadedById))
      .where(and(eq(projectAttachments.projectId, id), isNull(projectAttachments.deletedAt)))
      .orderBy(desc(projectAttachments.createdAt)),
    p.ownerId ? db.select({ name: users.name }).from(users).where(eq(users.id, p.ownerId)) : Promise.resolve([]),
  ]);

  const contagem = zerado();
  for (const { l } of linhas) contagem[l.status as keyof Contagem] = (contagem[l.status as keyof Contagem] ?? 0) + 1;
  const total = linhas.length;
  const fechadas = contagem.concluido + contagem.nao_se_aplica;
  const faltam = total - fechadas;

  /**
   * Como está cada passo: quantos clientes em cada opção (ou feito/falta, na caixinha).
   * É o "quantas mensagens enviadas, quantos confirmaram" — a leitura por coluna, não por cliente.
   */
  const porEtapa = etapas.map((e) => {
    const marcas0 = linhas.map(({ l }) => marcas.find((m) => m.c.projectClientId === l.id && m.c.stepId === e.id)?.c);
    const resolvidas = marcas0.filter((m) => etapaResolvida(e, m)).length;
    return {
      stepId: e.id, title: e.title, kind: e.kind,
      total, resolvidas, faltam: total - resolvidas,
      faixas: e.kind === 'escolha'
        ? [
            ...(e.options ?? []).map((o) => ({ valor: o.id, label: o.label, tone: o.tone, conclui: o.conclui, n: marcas0.filter((m) => m?.value === o.id).length })),
            { valor: '', label: 'Em branco', tone: 'muted', conclui: false, n: marcas0.filter((m) => !m).length },
          ]
        : [
            { valor: 'feito', label: 'Feito', tone: 'ok', conclui: true, n: resolvidas },
            { valor: '', label: 'Falta', tone: 'muted', conclui: false, n: total - resolvidas },
          ],
    };
  });

  return {
    id: p.id, name: p.name, goal: p.goal, status: p.status, dueDate: p.dueDate,
    ownerId: p.ownerId, ownerName: owner[0]?.name ?? null, closedAt: p.closedAt,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    etapas: etapas.map((e) => ({ id: e.id, title: e.title, kind: e.kind, options: e.options ?? [], sortOrder: e.sortOrder })),
    clientes: linhas.map(({ l, clientName, arquivado, assigneeName }) => ({
      id: l.id, clientId: l.clientId, clientName, arquivado,
      assigneeId: l.assigneeId, assigneeName: assigneeName ?? null,
      status: l.status, blockedReason: l.blockedReason, doneAt: l.doneAt,
      feitas: marcas.filter((m) => m.c.projectClientId === l.id).map((m) => ({ stepId: m.c.stepId, valor: m.c.value, doneAt: m.c.doneAt, quem: m.quem ?? null })),
    })),
    comentarios: comentarios.map(({ c, autor }) => ({
      id: c.id, projectClientId: c.projectClientId, body: c.body, autor: autor ?? 'sistema', userId: c.userId, createdAt: c.createdAt,
    })),
    anexos: anexos.map((a) => ({ ...a, quem: a.quem ?? 'sistema' })),
    resumo: {
      total, faltam, contagem,
      andamento: total ? Math.round((fechadas / total) * 100) : 0,
      etapasFeitas: linhas.reduce((a, { l }) => a + etapas.filter((e) => etapaResolvida(e, marcas.find((m) => m.c.projectClientId === l.id && m.c.stepId === e.id)?.c)).length, 0),
      etapasTotais: total * etapas.length,
      atrasado: atrasado(p, faltam),
      porEtapa,
    },
  };
}

/** Os projetos em que este cliente está (para a aba da ficha dele). */
export async function doCliente(db: Db, clientId: string) {
  const rows = await db.select({ l: projectClients, p: projects, assigneeName: users.name })
    .from(projectClients)
    .innerJoin(projects, eq(projects.id, projectClients.projectId))
    .leftJoin(users, eq(users.id, projectClients.assigneeId))
    .where(and(eq(projectClients.clientId, clientId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.updatedAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.l.id);
  const [etapas, marcas] = await Promise.all([
    db.select({ projectId: projectSteps.projectId, n: sql<number>`count(*)::int` }).from(projectSteps)
      .where(inArray(projectSteps.projectId, rows.map((r) => r.p.id))).groupBy(projectSteps.projectId),
    db.select({ projectClientId: projectChecks.projectClientId, n: sql<number>`count(*)::int` }).from(projectChecks)
      .where(inArray(projectChecks.projectClientId, ids)).groupBy(projectChecks.projectClientId),
  ]);
  return rows.map(({ l, p, assigneeName }) => ({
    projectClientId: l.id, projectId: p.id, name: p.name, projectStatus: p.status, dueDate: p.dueDate,
    status: l.status, blockedReason: l.blockedReason, assigneeId: l.assigneeId, assigneeName: assigneeName ?? null,
    feitas: marcas.find((m) => m.projectClientId === l.id)?.n ?? 0,
    etapas: etapas.find((e) => e.projectId === p.id)?.n ?? 0,
  }));
}

/** Quem pode ser responsável: as pessoas ativas do sistema, só nome (não é dado sensível). */
export async function pessoas(db: Db) {
  return db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name));
}

/** Para o Painel inicial: os projetos abertos e o quanto falta em cada um. */
export async function resumoDoPainel(db: Db, limite = 4) {
  const abertos = (await list(db, { status: 'aberto' })).filter((p) => p.total > 0);
  return {
    abertos: abertos.length,
    atrasados: abertos.filter((p) => p.atrasado).length,
    travados: abertos.reduce((a, p) => a + p.contagem.travado, 0),
    items: abertos.slice(0, limite).map((p) => ({ id: p.id, name: p.name, andamento: p.andamento, faltam: p.faltam, total: p.total, atrasado: p.atrasado })),
  };
}

// ---------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------

/**
 * Opções com id estável. A opção que chega sem `id` ganha um; a que já tinha mantém o dele,
 * para o rótulo poder mudar sem perder o que os clientes já tinham escolhido.
 */
function comIds(options: EtapaProjeto['options']) {
  return (options ?? []).map((o) => ({ id: o.id ?? newId(), label: o.label, tone: o.tone, conclui: o.conclui }));
}

/** Grava as etapas na ordem recebida. Etapa sem `id` nasce; a que sumiu da lista é apagada (com as marcas). */
async function gravarEtapas(db: Db, projectId: string, etapas: EtapaProjeto[]) {
  const atuais = await db.select().from(projectSteps).where(eq(projectSteps.projectId, projectId));
  const mantidos = new Set(etapas.map((e) => e.id).filter(Boolean) as string[]);
  const sumiram = atuais.filter((a) => !mantidos.has(a.id)).map((a) => a.id);
  if (sumiram.length) await db.delete(projectSteps).where(inArray(projectSteps.id, sumiram));
  for (const [i, e] of etapas.entries()) {
    const options = e.kind === 'escolha' ? comIds(e.options) : [];
    if (e.id && atuais.some((a) => a.id === e.id)) {
      await db.update(projectSteps).set({ title: e.title, kind: e.kind, options, sortOrder: i }).where(eq(projectSteps.id, e.id));
      // opção que deixou de existir: a escolha de quem a usava vira "sem escolha"
      if (e.kind === 'escolha') {
        const vivas = new Set(options.map((o) => o.id));
        const marcas = await db.select({ id: projectChecks.id, value: projectChecks.value }).from(projectChecks).where(eq(projectChecks.stepId, e.id));
        const orfas = marcas.filter((m) => !m.value || !vivas.has(m.value)).map((m) => m.id);
        if (orfas.length) await db.delete(projectChecks).where(inArray(projectChecks.id, orfas));
      } else {
        // virou caixinha: o que estava escolhido some (não há opção para guardar)
        if (atuais.find((a) => a.id === e.id)?.kind === 'escolha') await db.delete(projectChecks).where(eq(projectChecks.stepId, e.id));
      }
    } else {
      await db.insert(projectSteps).values({ id: newId(), projectId, title: e.title, kind: e.kind, options, sortOrder: i });
    }
  }
}

/** Põe clientes na lista. Quem já está é ignorado (não duplica, não zera o que já foi feito). */
async function entrarNaLista(db: Db, projectId: string, clientIds: string[], assigneeId?: string | null) {
  const unicos = [...new Set(clientIds)];
  if (!unicos.length) return 0;
  const existem = await db.select({ id: clients.id }).from(clients).where(and(inArray(clients.id, unicos), isNull(clients.deletedAt)));
  const validos = existem.map((c) => c.id);
  if (!validos.length) throw new BadRequest('Nenhum dos clientes escolhidos existe');
  const jaEstao = await db.select({ clientId: projectClients.clientId }).from(projectClients)
    .where(and(eq(projectClients.projectId, projectId), inArray(projectClients.clientId, validos)));
  const novos = validos.filter((c) => !jaEstao.some((j) => j.clientId === c));
  if (!novos.length) return 0;
  await db.insert(projectClients).values(novos.map((clientId) => ({
    id: newId(), projectId, clientId, assigneeId: assigneeId ?? null, status: 'pendente' as const,
  })));
  return novos.length;
}

export async function create(db: Db, d: ProjetoGravar) {
  const [row] = await db.insert(projects).values({
    id: newId(), name: d.name, goal: d.goal ?? null, dueDate: d.dueDate ?? null, ownerId: d.ownerId ?? null, status: 'aberto',
  }).returning();
  await gravarEtapas(db, row!.id, d.etapas ?? []);
  if (d.clientIds?.length) await entrarNaLista(db, row!.id, d.clientIds);
  return get(db, row!.id);
}

export async function update(db: Db, id: string, d: ProjetoAtualizar) {
  const antes = await projetoOu404(db, id);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (d.name !== undefined) set.name = d.name;
  if (d.goal !== undefined) set.goal = d.goal ?? null;
  if (d.dueDate !== undefined) set.dueDate = d.dueDate ?? null;
  if (d.ownerId !== undefined) set.ownerId = d.ownerId ?? null;
  if (d.status !== undefined) {
    set.status = d.status;
    set.closedAt = d.status === 'aberto' ? null : new Date();
  }
  await db.update(projects).set(set).where(eq(projects.id, id));
  if (d.etapas) await gravarEtapas(db, id, d.etapas);
  if (d.clientIds) await entrarNaLista(db, id, d.clientIds);
  // mexer nas etapas muda o "já acabou?" de cada linha
  if (d.etapas) {
    const linhas = await db.select({ id: projectClients.id }).from(projectClients).where(eq(projectClients.projectId, id));
    for (const l of linhas) await recalcular(db, l.id);
  }
  return { antes, depois: await get(db, id) };
}

export async function addClients(db: Db, id: string, clientIds: string[], assigneeId?: string | null) {
  await projetoOu404(db, id);
  const n = await entrarNaLista(db, id, clientIds, assigneeId);
  return { entraram: n, projeto: await get(db, id) };
}

export async function removeClient(db: Db, id: string, projectClientId: string) {
  const linha = await linhaOu404(db, id, projectClientId);
  const [cliente] = await db.select({ name: clients.tradeName }).from(clients).where(eq(clients.id, linha.clientId));
  await db.delete(projectClients).where(eq(projectClients.id, projectClientId));
  return { clientName: cliente?.name ?? 'cliente' };
}

/**
 * Trocar responsável e/ou situação de uma linha.
 *
 * "Travado" exige motivo; sair de travado limpa o motivo. Escolher **concluído** à mão quer dizer
 * "está tudo feito": as etapas que faltavam ficam marcadas, para os números baterem com a tabela.
 * Escolher pendente/em andamento devolve a linha ao automático — sem apagar o que já foi marcado.
 */
export async function setLinha(db: Db, id: string, projectClientId: string, d: ProjetoLinha, userId?: string) {
  const linha = await linhaOu404(db, id, projectClientId);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (d.assigneeId !== undefined) set.assigneeId = d.assigneeId ?? null;
  if (d.status !== undefined) {
    if (d.status === 'travado' && !d.blockedReason?.trim()) throw new BadRequest('Diga por que está travado');
    set.status = d.status;
    set.blockedReason = d.status === 'travado' ? d.blockedReason!.trim() : null;
    set.doneAt = FECHADAS.includes(d.status) ? new Date() : null;
  } else if (d.blockedReason !== undefined && linha.status === 'travado') {
    set.blockedReason = d.blockedReason?.trim() || null;
  }
  const [nova] = await db.update(projectClients).set(set).where(eq(projectClients.id, projectClientId)).returning();
  if (d.status === 'concluido') {
    // "concluído" à mão = tudo feito: completa as etapas que faltavam
    const [etapas, marcadas] = await Promise.all([
      db.select().from(projectSteps).where(eq(projectSteps.projectId, id)),
      db.select().from(projectChecks).where(eq(projectChecks.projectClientId, projectClientId)),
    ]);
    for (const e of etapas) {
      const marca = marcadas.find((m) => m.stepId === e.id);
      if (etapaResolvida(e, marca)) continue;
      // na lista, "concluído" escolhe a primeira opção que resolve a etapa
      const value = e.kind === 'escolha' ? ((e.options ?? []).find((o) => o.conclui)?.id ?? null) : null;
      if (e.kind === 'escolha' && !value) continue;
      if (marca) await db.update(projectChecks).set({ value, doneById: userId ?? null, doneAt: new Date() }).where(eq(projectChecks.id, marca.id));
      else await db.insert(projectChecks).values({ id: newId(), projectClientId, stepId: e.id, value, doneById: userId ?? null })
        .onConflictDoNothing({ target: [projectChecks.projectClientId, projectChecks.stepId] });
    }
  }
  // voltou para o fluxo automático: a situação passa a ser o que as marcas dizem
  const final = d.status !== undefined && !MANUAIS.includes(d.status) ? await recalcular(db, projectClientId) : nova!;
  const [cliente] = await db.select({ name: clients.tradeName }).from(clients).where(eq(clients.id, linha.clientId));
  return { linha: final, clientName: cliente?.name ?? 'cliente' };
}

/**
 * Mexer numa etapa de um cliente: `feito` na caixinha, `valor` (o id da opção) na lista.
 * A situação da linha se ajusta sozinha depois.
 */
export async function marcar(db: Db, id: string, projectClientId: string, stepId: string, d: { feito?: boolean; valor?: string | null }, userId: string) {
  const linha = await linhaOu404(db, id, projectClientId);
  const [etapa] = await db.select().from(projectSteps).where(and(eq(projectSteps.id, stepId), eq(projectSteps.projectId, id)));
  if (!etapa) throw new BadRequest('Etapa não encontrada neste projeto');
  if (linha.status === 'nao_se_aplica') throw new BadRequest('Este cliente está marcado como "não se aplica". Tire essa marca para trabalhar nele.');

  const escolha = etapa.kind === 'escolha';
  if (escolha && d.valor === undefined) throw new BadRequest(`"${etapa.title}" é uma lista de opções: escolha uma.`);
  if (!escolha && d.feito === undefined) throw new BadRequest(`"${etapa.title}" é uma caixinha: diga se está feito.`);

  const limpar = escolha ? d.valor === null : d.feito === false;
  if (limpar) {
    await db.delete(projectChecks).where(and(eq(projectChecks.projectClientId, projectClientId), eq(projectChecks.stepId, stepId)));
  } else {
    let value: string | null = null;
    if (escolha) {
      const opcao = (etapa.options ?? []).find((o) => o.id === d.valor);
      if (!opcao) throw new BadRequest('Essa opção não existe nesta etapa');
      value = opcao.id;
    }
    const [atual] = await db.select({ id: projectChecks.id }).from(projectChecks)
      .where(and(eq(projectChecks.projectClientId, projectClientId), eq(projectChecks.stepId, stepId)));
    if (atual) await db.update(projectChecks).set({ value, doneById: userId, doneAt: new Date() }).where(eq(projectChecks.id, atual.id));
    else await db.insert(projectChecks).values({ id: newId(), projectClientId, stepId, value, doneById: userId })
      .onConflictDoNothing({ target: [projectChecks.projectClientId, projectChecks.stepId] });
  }
  const [cliente] = await db.select({ name: clients.tradeName }).from(clients).where(eq(clients.id, linha.clientId));
  return { linha: await recalcular(db, projectClientId), etapa, clientName: cliente?.name ?? 'cliente' };
}

export async function comentar(db: Db, id: string, userId: string, body: string, projectClientId?: string | null) {
  await projetoOu404(db, id);
  if (projectClientId) await linhaOu404(db, id, projectClientId);
  const [row] = await db.insert(projectComments).values({
    id: newId(), projectId: id, projectClientId: projectClientId ?? null, userId, body,
  }).returning();
  return row!;
}

/** Apagar comentário: o dono apaga o seu; quem gerencia apaga qualquer um. */
export async function apagarComentario(db: Db, id: string, commentId: string, userId: string, podeGerenciar: boolean) {
  const [row] = await db.select().from(projectComments).where(and(eq(projectComments.id, commentId), eq(projectComments.projectId, id), isNull(projectComments.deletedAt)));
  if (!row) throw new NotFound('Comentário');
  if (row.userId !== userId && !podeGerenciar) throw new BadRequest('Só quem escreveu (ou quem gerencia o projeto) pode apagar este comentário');
  await db.update(projectComments).set({ deletedAt: new Date() }).where(eq(projectComments.id, commentId));
  return row;
}

/** Lê o "data:<tipo>;base64,…" e devolve o tipo e o conteúdo, já conferindo o tamanho. */
export function lerConteudo(conteudo: string) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(conteudo);
  if (!m) throw new BadRequest('Não consegui ler esse arquivo');
  const dataBase64 = m[2]!;
  const sizeBytes = Math.floor((dataBase64.length * 3) / 4);
  if (sizeBytes > LIMITE_ANEXO_BYTES) throw new BadRequest('Arquivo muito grande (máximo 10 MB)');
  return { mimeType: m[1]!.toLowerCase(), dataBase64, sizeBytes };
}

export async function anexar(db: Db, id: string, userId: string, d: { fileName: string; conteudo: string; projectClientId?: string | null }) {
  await projetoOu404(db, id);
  if (d.projectClientId) await linhaOu404(db, id, d.projectClientId);
  const { mimeType, dataBase64, sizeBytes } = lerConteudo(d.conteudo);
  const [row] = await db.insert(projectAttachments).values({
    id: newId(), projectId: id, projectClientId: d.projectClientId ?? null,
    fileName: d.fileName, mimeType, sizeBytes, dataBase64, uploadedById: userId,
  }).returning();
  return row!;
}

export async function lerAnexo(db: Db, attachmentId: string) {
  const [row] = await db.select().from(projectAttachments).where(and(eq(projectAttachments.id, attachmentId), isNull(projectAttachments.deletedAt)));
  if (!row) throw new NotFound('Anexo');
  return { ...row, buffer: Buffer.from(row.dataBase64, 'base64') };
}

export async function apagarAnexo(db: Db, id: string, attachmentId: string, userId: string, podeGerenciar: boolean) {
  const [row] = await db.select().from(projectAttachments).where(and(eq(projectAttachments.id, attachmentId), eq(projectAttachments.projectId, id), isNull(projectAttachments.deletedAt)));
  if (!row) throw new NotFound('Anexo');
  if (row.uploadedById !== userId && !podeGerenciar) throw new BadRequest('Só quem anexou (ou quem gerencia o projeto) pode tirar este anexo');
  await db.update(projectAttachments).set({ deletedAt: new Date() }).where(eq(projectAttachments.id, attachmentId));
  return row;
}

/**
 * Duplicar: mesmas etapas (com as opções) e a mesma lista de clientes, tudo zerado.
 * É o que salva o que se repete — o feriado do mês que vem é o feriado deste mês, em branco.
 */
export async function duplicar(db: Db, id: string, nome?: string) {
  const antigo = await projetoOu404(db, id);
  const [etapas, linhas] = await Promise.all([
    db.select().from(projectSteps).where(eq(projectSteps.projectId, id)).orderBy(asc(projectSteps.sortOrder)),
    db.select().from(projectClients).where(eq(projectClients.projectId, id)),
  ]);
  const [novo] = await db.insert(projects).values({
    id: newId(), name: nome?.trim() || `${antigo.name} (cópia)`, goal: antigo.goal,
    dueDate: null, ownerId: antigo.ownerId, status: 'aberto',
  }).returning();
  if (etapas.length) {
    await db.insert(projectSteps).values(etapas.map((e) => ({ id: newId(), projectId: novo!.id, title: e.title, kind: e.kind, options: e.options, sortOrder: e.sortOrder })));
  }
  if (linhas.length) {
    // os clientes voltam pendentes, com o mesmo responsável — o trabalho é que recomeça
    await db.insert(projectClients).values(linhas.map((l) => ({ id: newId(), projectId: novo!.id, clientId: l.clientId, assigneeId: l.assigneeId, status: 'pendente' as const })));
  }
  return get(db, novo!.id);
}

export async function softDelete(db: Db, id: string) {
  const p = await projetoOu404(db, id);
  await db.update(projects).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(projects.id, id));
  return p;
}
