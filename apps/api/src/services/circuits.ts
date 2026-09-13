/**
 * Circuitos (feixes). Cada um traz a ocupação: quantos DIDs tem, quantos estão com cliente,
 * quantos estão livres, e quantos canais suporta.
 */
import { and, asc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { carriers, circuits, clients, dids, newId, type Db } from '@gestor/db';
import type { CircuitoGravar } from '@gestor/shared';
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
    id: r.id, name: r.name, code: r.code, carrierId: r.carrierId, carrierName: r.carrierName ?? null, channels: r.channels,
    ownerClientId: r.ownerClientId, ownerName: r.ownerName ?? null, monthlyValueCents: r.monthlyValueCents,
    signalingIp: r.signalingIp, authIp: r.authIp, authUsername: r.authUsername,
    authPassword: { hasSecret: !!r.authPasswordSecretId, secretId: r.authPasswordSecretId ?? null },
    notes: r.notes, createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt,
    dids: { total, assigned, free: total - assigned },
    /** DIDs por canal — acima de ~10 costuma indicar feixe saturado; 0 canais com DIDs é inconsistência */
    ratio: r.channels > 0 ? Math.round((total / r.channels) * 10) / 10 : null,
  };
}

export async function list(db: Db, q: { q?: string; carrierId?: string; page: number; pageSize: number }) {
  const occ = occupancy(db);
  const conds: SQL[] = [isNull(circuits.deletedAt)];
  if (q.carrierId) conds.push(eq(circuits.carrierId, q.carrierId));
  if (q.q) conds.push(or(ilike(circuits.name, `%${q.q}%`), ilike(circuits.code, `%${q.q}%`), ilike(carriers.name, `%${q.q}%`))!);
  const where = and(...conds);
  const base = db
    .select({
      id: circuits.id, name: circuits.name, code: circuits.code, carrierId: circuits.carrierId, carrierName: carriers.name, channels: circuits.channels,
      ownerClientId: circuits.ownerClientId, ownerName: clients.tradeName, monthlyValueCents: circuits.monthlyValueCents, signalingIp: circuits.signalingIp,
      authIp: circuits.authIp, authUsername: circuits.authUsername, authPasswordSecretId: circuits.authPasswordSecretId, notes: circuits.notes,
      createdAt: circuits.createdAt, updatedAt: circuits.updatedAt, deletedAt: circuits.deletedAt, total: occ.total, assigned: occ.assigned,
    })
    .from(circuits)
    .leftJoin(carriers, eq(carriers.id, circuits.carrierId))
    .leftJoin(clients, eq(clients.id, circuits.ownerClientId))
    .leftJoin(occ, eq(occ.circuitId, circuits.id))
    .where(where);
  const rows = await base.orderBy(asc(circuits.name)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).where(where);
  return { items: rows.map(shape), total: Number(c?.n ?? 0), page: q.page, pageSize: q.pageSize };
}

export async function get(db: Db, id: string) {
  const occ = occupancy(db);
  const [row] = await db
    .select({
      id: circuits.id, name: circuits.name, code: circuits.code, carrierId: circuits.carrierId, carrierName: carriers.name, channels: circuits.channels,
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
