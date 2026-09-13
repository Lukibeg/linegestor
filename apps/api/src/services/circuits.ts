/**
 * Circuitos (feixes). Cada um traz a ocupação: quantos DIDs tem, quantos estão com cliente,
 * quantos estão livres, e quantos canais suporta.
 */
import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { carriers, circuits, clients, dids, newId, type Db } from '@gestor/db';
import type { CircuitoGravar, CircuitoListar } from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';
import type { SecretsVault } from './secrets.js';

const occupancy = (db: Db) =>
  db
    .select({
      circuitId: dids.circuitId,
      total: sql<number>`count(*)`.as('total'),
      assigned: sql<number>`count(${dids.clientId})`.as('assigned'),
    })
    .from(dids)
    .where(isNull(dids.deletedAt))
    .groupBy(dids.circuitId)
    .as('occ');

function shape(r: any) {
  const total = Number(r.total ?? 0), assigned = Number(r.assigned ?? 0);
  return {
    id: r.id, name: r.name, code: r.code, keyNumber: r.keyNumber ?? null, carrierId: r.carrierId, carrierName: r.carrierName ?? null, channels: r.channels,
    ownerClientId: r.ownerClientId, ownerName: r.ownerName ?? null, monthlyValueCents: r.monthlyValueCents,
    signalingIp: r.signalingIp, authIp: r.authIp, authUsername: r.authUsername,
    authPassword: { hasSecret: !!r.authPasswordSecretId, secretId: r.authPasswordSecretId ?? null },
    notes: r.notes, createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt,
    dids: { total, assigned, free: total - assigned },
  };
}

/**
 * Resumo para os cartões no topo da tela: quantos circuitos, canais, valor mensal somado e a numeração.
 * Aceita os mesmos filtros da lista: filtrou por operadora ou titular, os cartões acompanham.
 */
export async function summary(db: Db, q: Partial<CircuitoListar> = {}) {
  const filtrado = !!(q.q || q.carrierId || q.ownerClientId);
  const where = and(...filtros(q));
  const [c] = await db
    .select({ circuits: sql<number>`count(*)`, channels: sql<number>`coalesce(sum(${circuits.channels}), 0)`, monthlyValueCents: sql<number>`coalesce(sum(${circuits.monthlyValueCents}), 0)` })
    .from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).where(where);
  // a numeração acompanha o mesmo filtro: só os DIDs dos circuitos que sobraram
  const idsFiltrados = db.select({ id: circuits.id }).from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).where(where);
  const didWhere = filtrado
    ? and(isNull(dids.deletedAt), inArray(dids.circuitId, idsFiltrados))
    : isNull(dids.deletedAt);
  const [d] = await db
    .select({ total: sql<number>`count(*)`, assigned: sql<number>`count(${dids.clientId})`, noCircuit: sql<number>`count(*) filter (where ${dids.circuitId} is null)` })
    .from(dids).where(didWhere);
  const total = Number(d?.total ?? 0), assigned = Number(d?.assigned ?? 0);
  return {
    circuits: Number(c?.circuits ?? 0),
    channels: Number(c?.channels ?? 0),
    monthlyValueCents: Number(c?.monthlyValueCents ?? 0),
    dids: { total, assigned, free: total - assigned, noCircuit: Number(d?.noCircuit ?? 0) },
  };
}

/**
 * Os filtros da tela (busca, operadora, titular) viram condições de SQL.
 * A MESMA função alimenta a lista e os cartões de resumo — por isso os números do topo
 * sempre batem com o que está na tabela abaixo.
 */
function filtros(q: Partial<CircuitoListar>): SQL[] {
  const conds: SQL[] = [isNull(circuits.deletedAt)];
  if (q.carrierId) conds.push(eq(circuits.carrierId, q.carrierId));
  if (q.ownerClientId) conds.push(eq(circuits.ownerClientId, q.ownerClientId));
  if (q.q) conds.push(or(ilike(circuits.name, `%${q.q}%`), ilike(circuits.code, `%${q.q}%`), ilike(circuits.keyNumber, `%${q.q}%`), ilike(carriers.name, `%${q.q}%`))!);
  return conds;
}

/** Ordenação da tabela de circuitos — o id da coluna na tela vira ORDER BY aqui. */
function ordenacaoCircuitos(q: CircuitoListar, occ: ReturnType<typeof occupancy>) {
  const dir = q.dir === 'desc' ? sql`desc` : sql`asc`;
  const colunas: Record<string, SQL> = {
    name: sql`lower(${circuits.name})`,
    code: sql`${circuits.code}`,
    keyNumber: sql`${circuits.keyNumber}`,
    carrierName: sql`lower(${carriers.name})`,
    ownerName: sql`lower(${clients.tradeName})`,
    channels: sql`${circuits.channels}`,
    total: sql`coalesce(${occ.total}, 0)`,
    free: sql`coalesce(${occ.total}, 0) - coalesce(${occ.assigned}, 0)`,
    uso: sql`case when coalesce(${occ.total}, 0) = 0 then -1 else coalesce(${occ.assigned}, 0)::float / ${occ.total} end`,
    monthlyValueCents: sql`${circuits.monthlyValueCents}`,
  };
  const campo = colunas[q.sort ?? 'name'] ?? colunas.name!;
  return sql`${campo} ${dir} nulls last, lower(${circuits.name}) asc`;
}

export async function list(db: Db, q: CircuitoListar) {
  const occ = occupancy(db);
  const where = and(...filtros(q));
  const base = db
    .select({
      id: circuits.id, name: circuits.name, code: circuits.code, keyNumber: circuits.keyNumber, carrierId: circuits.carrierId, carrierName: carriers.name, channels: circuits.channels,
      ownerClientId: circuits.ownerClientId, ownerName: clients.tradeName, monthlyValueCents: circuits.monthlyValueCents, signalingIp: circuits.signalingIp,
      authIp: circuits.authIp, authUsername: circuits.authUsername, authPasswordSecretId: circuits.authPasswordSecretId, notes: circuits.notes,
      createdAt: circuits.createdAt, updatedAt: circuits.updatedAt, deletedAt: circuits.deletedAt, total: occ.total, assigned: occ.assigned,
    })
    .from(circuits)
    .leftJoin(carriers, eq(carriers.id, circuits.carrierId))
    .leftJoin(clients, eq(clients.id, circuits.ownerClientId))
    .leftJoin(occ, eq(occ.circuitId, circuits.id))
    .where(where);
  const rows = await base.orderBy(ordenacaoCircuitos(q, occ)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).where(where);
  return { items: rows.map(shape), total: Number(c?.n ?? 0), page: q.page, pageSize: q.pageSize };
}

export async function get(db: Db, id: string) {
  const occ = occupancy(db);
  const [row] = await db
    .select({
      id: circuits.id, name: circuits.name, code: circuits.code, keyNumber: circuits.keyNumber, carrierId: circuits.carrierId, carrierName: carriers.name, channels: circuits.channels,
      ownerClientId: circuits.ownerClientId, ownerName: clients.tradeName, monthlyValueCents: circuits.monthlyValueCents, signalingIp: circuits.signalingIp,
      authIp: circuits.authIp, authUsername: circuits.authUsername, authPasswordSecretId: circuits.authPasswordSecretId, notes: circuits.notes,
      createdAt: circuits.createdAt, updatedAt: circuits.updatedAt, deletedAt: circuits.deletedAt, total: occ.total, assigned: occ.assigned,
    })
    .from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).leftJoin(clients, eq(clients.id, circuits.ownerClientId)).leftJoin(occ, eq(occ.circuitId, circuits.id))
    .where(eq(circuits.id, id)).limit(1);
  if (!row) throw new NotFound('Circuito');
  return shape(row);
}

export async function create(db: Db, vault: SecretsVault, data: CircuitoGravar, userId: string) {
  const { authPassword, ...rest } = data;
  const [dup] = await db.select({ id: circuits.id }).from(circuits).where(and(eq(circuits.code, data.code), data.carrierId ? eq(circuits.carrierId, data.carrierId) : isNull(circuits.carrierId), isNull(circuits.deletedAt)));
  if (dup) throw new BadRequest('Já existe um circuito com este código nesta operadora');
  const id = newId();
  const secretId = authPassword ? await vault.save(db, { label: `Senha do tronco — ${data.name}`, plain: authPassword, userId }) : null;
  const [row] = await db.insert(circuits).values({ id, ...rest, authPasswordSecretId: secretId }).returning();
  return row!;
}

export async function update(db: Db, vault: SecretsVault, id: string, data: Partial<CircuitoGravar>, userId: string) {
  const [before] = await db.select().from(circuits).where(eq(circuits.id, id));
  if (!before) throw new NotFound('Circuito');
  const { authPassword, ...rest } = data;
  const secretId = authPassword ? await vault.save(db, { existingId: before.authPasswordSecretId, label: `Senha do tronco — ${data.name ?? before.name}`, plain: authPassword, userId }) : before.authPasswordSecretId;
  const [after] = await db.update(circuits).set({ ...rest, authPasswordSecretId: secretId, updatedAt: new Date() }).where(eq(circuits.id, id)).returning();
  return { before, after: after! };
}

export async function softDelete(db: Db, id: string) {
  const [n] = await db.select({ n: sql<number>`count(*)` }).from(dids).where(and(eq(dids.circuitId, id), isNull(dids.deletedAt)));
  if (Number(n?.n ?? 0) > 0) throw new BadRequest(`Este circuito ainda tem ${n!.n} DIDs. Mova-os para outro circuito (ou para "sem circuito") antes de excluir.`);
  const [row] = await db.update(circuits).set({ deletedAt: new Date() }).where(and(eq(circuits.id, id), isNull(circuits.deletedAt))).returning();
  if (!row) throw new NotFound('Circuito');
  return row;
}
export async function restore(db: Db, id: string) {
  const [row] = await db.update(circuits).set({ deletedAt: null }).where(eq(circuits.id, id)).returning();
  if (!row) throw new NotFound('Circuito');
  return row;
}

export async function options(db: Db) {
  return db.select({ id: circuits.id, name: circuits.name, code: circuits.code, carrierName: carriers.name }).from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).where(isNull(circuits.deletedAt)).orderBy(asc(circuits.name));
}
