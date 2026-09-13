/**
 * DIDs (numeração).
 *
 * A regra mais importante: toda alteração em massa recebe uma LISTA EXPLÍCITA de ids,
 * conta quantos foram afetados e registra na auditoria com esse número. Não existe "aplica em tudo que está filtrado".
 */
import { and, asc, desc, eq, ilike, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';
import { carriers, circuits, clients, dids, newId, type Db } from '@gestor/db';
import { didFormatado, gerarFaixaDids, type DidCriarFaixa, type DidEditarEmMassa, type DidListar } from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';

const owner = alias(clients, 'owner');

function baseSelect(db: Db) {
  return db
    .select({
      id: dids.id, number: dids.number, circuitId: dids.circuitId, circuitName: circuits.name, circuitCode: circuits.code, carrierName: carriers.name,
      clientId: dids.clientId, clientName: clients.tradeName, ownerClientId: dids.ownerClientId, ownerName: owner.tradeName, note: dids.note,
      createdAt: dids.createdAt, updatedAt: dids.updatedAt,
    })
    .from(dids)
    .leftJoin(circuits, eq(circuits.id, dids.circuitId))
    .leftJoin(carriers, eq(carriers.id, circuits.carrierId))
    .leftJoin(clients, eq(clients.id, dids.clientId))
    .leftJoin(owner, eq(owner.id, dids.ownerClientId));
}

function shape(r: any) {
  return { ...r, numberFormatted: didFormatado(r.number), free: !r.clientId };
}

export async function list(db: Db, q: DidListar) {
  const conds: SQL[] = [isNull(dids.deletedAt)];
  if (q.q) conds.push(ilike(dids.number, `%${q.q.replace(/\D/g, '')}%`));
  if (q.circuitId === 'none') conds.push(isNull(dids.circuitId));
  else if (q.circuitId) conds.push(eq(dids.circuitId, q.circuitId));
  if (q.clientId === 'free') conds.push(isNull(dids.clientId));
  else if (q.clientId) conds.push(eq(dids.clientId, q.clientId));
  if (q.ownerClientId) conds.push(eq(dids.ownerClientId, q.ownerClientId));
  const where = and(...conds);
  // ordenar por qualquer coluna da tabela; o que não for reconhecido cai no número
  const colunas: Record<string, SQL | PgColumn> = {
    number: dids.number, circuit: circuits.name, carrier: carriers.name, client: clients.tradeName, owner: owner.tradeName, note: dids.note,
  };
  const sortCol = colunas[q.sort ?? 'number'] ?? dids.number;
  const rows = await baseSelect(db).where(where).orderBy(sql`${sortCol} ${q.dir === 'desc' ? sql`desc` : sql`asc`} nulls last`, asc(dids.number)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const [c] = await db.select({ n: sql<number>`count(*)`, free: sql<number>`count(*) filter (where ${dids.clientId} is null)` }).from(dids).where(where);
  return { items: rows.map(shape), total: Number(c?.n ?? 0), free: Number(c?.free ?? 0), page: q.page, pageSize: q.pageSize };
}

/** Todos os ids que batem com um filtro — usado pela interface para "selecionar todos os filtrados" com número exato. */
export async function idsMatching(db: Db, q: Omit<DidListar, 'page' | 'pageSize' | 'sort' | 'dir'>) {
  const conds: SQL[] = [isNull(dids.deletedAt)];
  if (q.q) conds.push(ilike(dids.number, `%${q.q.replace(/\D/g, '')}%`));
  if (q.circuitId === 'none') conds.push(isNull(dids.circuitId));
  else if (q.circuitId) conds.push(eq(dids.circuitId, q.circuitId));
  if (q.clientId === 'free') conds.push(isNull(dids.clientId));
  else if (q.clientId) conds.push(eq(dids.clientId, q.clientId));
  if (q.ownerClientId) conds.push(eq(dids.ownerClientId, q.ownerClientId));
  const rows = await db.select({ id: dids.id }).from(dids).where(and(...conds)).limit(5000);
  return rows.map((r) => r.id);
}

export async function get(db: Db, id: string) {
  const [row] = await baseSelect(db).where(eq(dids.id, id)).limit(1);
  if (!row) throw new NotFound('DID');
  return shape(row);
}

/** Cria uma faixa sequencial. Se algum número já existir, não cria nenhum e diz quais são. */
export async function createRange(db: Db, data: DidCriarFaixa) {
  const numbers = gerarFaixaDids(data.baseNumber, data.quantity);
  const existing = await db.select({ number: dids.number }).from(dids).where(inArray(dids.number, numbers));
  if (existing.length) {
    throw new BadRequest(`${existing.length} número(s) já existem: ${existing.slice(0, 5).map((e) => didFormatado(e.number)).join(', ')}${existing.length > 5 ? '…' : ''}`, { existing: existing.map((e) => e.number) });
  }
  const rows = numbers.map((n) => ({ id: newId(), number: n, circuitId: data.circuitId ?? null, clientId: data.clientId ?? null, ownerClientId: data.ownerClientId ?? null, note: data.note ?? null }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(dids).values(rows.slice(i, i + 500));
  return { created: rows.length, first: numbers[0]!, last: numbers[numbers.length - 1]! };
}

export async function update(db: Db, id: string, data: { circuitId?: string | null; clientId?: string | null; ownerClientId?: string | null; note?: string | null }) {
  const [before] = await db.select().from(dids).where(eq(dids.id, id));
  if (!before) throw new NotFound('DID');
  const [after] = await db.update(dids).set({ ...data, updatedAt: new Date() }).where(eq(dids.id, id)).returning();
  return { before, after: after! };
}

/** Edição em massa por lista de ids. Devolve quantos foram afetados de fato. */
export async function bulkUpdate(db: Db, data: DidEditarEmMassa) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if ('circuitId' in data.set) set.circuitId = data.set.circuitId;
  if ('clientId' in data.set) set.clientId = data.set.clientId;
  if ('note' in data.set) set.note = data.set.note;
  const rows = await db.update(dids).set(set).where(and(inArray(dids.id, data.ids), isNull(dids.deletedAt))).returning({ id: dids.id });
  return { affected: rows.length };
}

export async function bulkDelete(db: Db, ids: string[]) {
  const rows = await db.update(dids).set({ deletedAt: new Date() }).where(and(inArray(dids.id, ids), isNull(dids.deletedAt))).returning({ id: dids.id });
  return { affected: rows.length };
}

export async function restore(db: Db, id: string) {
  const [row] = await db.update(dids).set({ deletedAt: null }).where(eq(dids.id, id)).returning();
  if (!row) throw new NotFound('DID');
  return row;
}

/** Descreve uma alteração em massa em uma frase, para a auditoria. */
export async function describeBulk(db: Db, data: DidEditarEmMassa, affected: number) {
  const parts: string[] = [];
  if ('circuitId' in data.set) {
    if (data.set.circuitId) { const [c] = await db.select({ name: circuits.name }).from(circuits).where(eq(circuits.id, data.set.circuitId)); parts.push(`circuito → ${c?.name ?? '?'}`); }
    else parts.push('circuito → sem circuito');
  }
  if ('clientId' in data.set) {
    if (data.set.clientId) { const [c] = await db.select({ name: clients.tradeName }).from(clients).where(eq(clients.id, data.set.clientId)); parts.push(`cliente → ${c?.name ?? '?'}`); }
    else parts.push('liberados (sem cliente)');
  }
  if ('note' in data.set) parts.push(data.set.note ? `observação → "${data.set.note}"` : 'observação limpa');
  return `Alterou ${affected} DID(s): ${parts.join(', ')}`;
}
