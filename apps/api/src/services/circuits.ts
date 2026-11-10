/**
 * Circuitos (feixes). Cada um traz a ocupação: quantos DIDs tem, quantos estão com cliente,
 * quantos estão livres, e quantos canais suporta.
 */
import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { carriers, circuits, clients, dids, newId, users, type Db } from '@gestor/db';
import type { CancelarCircuito, CircuitoGravar, CircuitoListar } from '@gestor/shared';
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
    id: r.id, name: r.name, code: r.code, keyNumber: r.keyNumber ?? null, carrierId: r.carrierId, carrierName: r.carrierName ?? null, channels: r.channels, thirdParty: !!r.thirdParty,
    ownerClientId: r.ownerClientId, ownerName: r.ownerName ?? null, monthlyValueCents: r.monthlyValueCents,
    authType: r.authType === 'login' ? 'login' : 'ip', signalingIp: r.signalingIp, authIp: r.authIp, authUsername: r.authUsername,
    authPassword: { hasSecret: !!r.authPasswordSecretId, secretId: r.authPasswordSecretId ?? null },
    notes: r.notes, createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt,
    dids: { total, assigned, free: total - assigned },
    // o link cancelado (2.4.6): desde quando, por quê, quem registrou e quando
    cancelamento: r.cancelledOn
      ? { dia: r.cancelledOn as string, motivo: (r.cancelReason as string | null) ?? null, por: (r.cancelledByName as string | null) ?? null, em: (r.cancelledAt as Date | null) ?? null }
      : null,
  };
}

/**
 * Resumo para os cartões no topo da tela: quantos circuitos, canais, valor mensal somado e a numeração.
 * Aceita os mesmos filtros da lista: filtrou por operadora ou titular, os cartões acompanham.
 */
export async function summary(db: Db, q: Partial<CircuitoListar> = {}) {
  const where = and(...filtros(q));
  const [c] = await db
    .select({ circuits: sql<number>`count(*)`, channels: sql<number>`coalesce(sum(${circuits.channels}), 0)`, monthlyValueCents: sql<number>`coalesce(sum(${circuits.monthlyValueCents}), 0)` })
    .from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).where(where);
  // a numeração acompanha o mesmo filtro: só os DIDs dos circuitos que sobraram
  // (os de terceiros já ficaram fora, porque saíram de `idsFiltrados`)
  const idsFiltrados = db.select({ id: circuits.id }).from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).where(where);
  const [d] = await db
    .select({ total: sql<number>`count(*)`, assigned: sql<number>`count(${dids.clientId})` })
    .from(dids).where(and(isNull(dids.deletedAt), inArray(dids.circuitId, idsFiltrados)));
  const total = Number(d?.total ?? 0), assigned = Number(d?.assigned ?? 0);
  return {
    circuits: Number(c?.circuits ?? 0),
    channels: Number(c?.channels ?? 0),
    monthlyValueCents: Number(c?.monthlyValueCents ?? 0),
    dids: { total, assigned, free: total - assigned },
  };
}

/**
 * Os filtros da tela (busca, operadora, titular) viram condições de SQL.
 * A MESMA função alimenta a lista e os cartões de resumo — por isso os números do topo
 * sempre batem com o que está na tabela abaixo.
 */
function filtros(q: Partial<CircuitoListar>): SQL[] {
  const conds: SQL[] = [isNull(circuits.deletedAt)];
  // o que não é da VoiceNet só entra quando alguém liga o interruptor
  if (!q.includeThirdParty) conds.push(eq(circuits.thirdParty, false));
  // o link cancelado (2.4.6) também: é história, não controle de agora
  if (!q.includeCancelled) conds.push(isNull(circuits.cancelledOn));
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
      ownerClientId: circuits.ownerClientId, ownerName: clients.tradeName, monthlyValueCents: circuits.monthlyValueCents, authType: circuits.authType, signalingIp: circuits.signalingIp,
      authIp: circuits.authIp, authUsername: circuits.authUsername, authPasswordSecretId: circuits.authPasswordSecretId, notes: circuits.notes, thirdParty: circuits.thirdParty,
      cancelledOn: circuits.cancelledOn, cancelReason: circuits.cancelReason, cancelledAt: circuits.cancelledAt, cancelledByName: users.name,
      createdAt: circuits.createdAt, updatedAt: circuits.updatedAt, deletedAt: circuits.deletedAt, total: occ.total, assigned: occ.assigned,
    })
    .from(circuits)
    .leftJoin(carriers, eq(carriers.id, circuits.carrierId))
    .leftJoin(clients, eq(clients.id, circuits.ownerClientId))
    .leftJoin(users, eq(users.id, circuits.cancelledById))
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
      ownerClientId: circuits.ownerClientId, ownerName: clients.tradeName, monthlyValueCents: circuits.monthlyValueCents, authType: circuits.authType, signalingIp: circuits.signalingIp,
      authIp: circuits.authIp, authUsername: circuits.authUsername, authPasswordSecretId: circuits.authPasswordSecretId, notes: circuits.notes, thirdParty: circuits.thirdParty,
      cancelledOn: circuits.cancelledOn, cancelReason: circuits.cancelReason, cancelledAt: circuits.cancelledAt, cancelledByName: users.name,
      createdAt: circuits.createdAt, updatedAt: circuits.updatedAt, deletedAt: circuits.deletedAt, total: occ.total, assigned: occ.assigned,
    })
    .from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).leftJoin(clients, eq(clients.id, circuits.ownerClientId))
    .leftJoin(users, eq(users.id, circuits.cancelledById)).leftJoin(occ, eq(occ.circuitId, circuits.id))
    .where(eq(circuits.id, id)).limit(1);
  if (!row) throw new NotFound('Circuito');
  return shape(row);
}

/**
 * O que não pertence ao tipo de autenticação escolhido é limpo: por IP não tem login;
 * por login não tem "IP do PBX". A senha do cofre fica guardada (não se apaga segredo à toa).
 */
function porTipo<T extends { authType?: 'ip' | 'login'; authIp?: string | null; authUsername?: string | null }>(data: T): T {
  if (data.authType === 'ip') return { ...data, authUsername: null };
  if (data.authType === 'login') return { ...data, authIp: null };
  return data;
}

export async function create(db: Db, vault: SecretsVault, data: CircuitoGravar, userId: string) {
  const { authPassword, ...rest } = porTipo(data);
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
  const { authPassword, ...rest } = porTipo(data);
  const secretId = authPassword ? await vault.save(db, { existingId: before.authPasswordSecretId, label: `Senha do tronco — ${data.name ?? before.name}`, plain: authPassword, userId }) : before.authPasswordSecretId;
  const [after] = await db.update(circuits).set({ ...rest, authPasswordSecretId: secretId, updatedAt: new Date() }).where(eq(circuits.id, id)).returning();
  return { before, after: after! };
}

export async function softDelete(db: Db, id: string) {
  const [n] = await db.select({ n: sql<number>`count(*)` }).from(dids).where(and(eq(dids.circuitId, id), isNull(dids.deletedAt)));
  if (Number(n?.n ?? 0) > 0) throw new BadRequest(`Este circuito ainda tem ${n!.n} DIDs. Mova-os para outro circuito antes de excluir.`);
  const [row] = await db.update(circuits).set({ deletedAt: new Date() }).where(and(eq(circuits.id, id), isNull(circuits.deletedAt))).returning();
  if (!row) throw new NotFound('Circuito');
  return row;
}
/**
 * Cancelar o link (2.4.6): ele fica guardado, com o dia, o motivo e quem registrou, e sai das listas, dos cartões e do painel (os
 * números dele também) até alguém ligar "Mostrar cancelados". Os números continuam nele, como estavam: são a história do link.
 */
export async function cancelar(db: Db, id: string, f: CancelarCircuito, userId: string) {
  const [antes] = await db.select().from(circuits).where(and(eq(circuits.id, id), isNull(circuits.deletedAt)));
  if (!antes) throw new NotFound('Circuito');
  if (antes.cancelledOn) throw new BadRequest(`O link ${antes.name} já está cancelado (desde ${antes.cancelledOn.split('-').reverse().join('/')}).`);
  const [row] = await db.update(circuits).set({ cancelledOn: f.dia, cancelReason: f.motivo || null, cancelledById: userId, cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(circuits.id, id)).returning();
  return row!;
}

/** Reativar o link cancelado (foi engano, ou o cliente voltou): ele volta às listas; a movimentação guarda o cancelamento. */
export async function reativar(db: Db, id: string) {
  const [antes] = await db.select().from(circuits).where(and(eq(circuits.id, id), isNull(circuits.deletedAt)));
  if (!antes) throw new NotFound('Circuito');
  if (!antes.cancelledOn) throw new BadRequest(`O link ${antes.name} não está cancelado.`);
  await db.update(circuits).set({ cancelledOn: null, cancelReason: null, cancelledById: null, cancelledAt: null, updatedAt: new Date() }).where(eq(circuits.id, id));
  return antes;
}

export async function restore(db: Db, id: string) {
  const [row] = await db.update(circuits).set({ deletedAt: null }).where(eq(circuits.id, id)).returning();
  if (!row) throw new NotFound('Circuito');
  return row;
}

/**
 * Quem aparece no filtro "Titular": só quem é titular de pelo menos um circuito que está na
 * lista. Sem o interruptor dos links de terceiros, o titular de um link de terceiro não entra.
 */
export async function owners(db: Db, includeThirdParty = false) {
  const conds: SQL[] = [isNull(circuits.deletedAt), sql`${circuits.ownerClientId} is not null`];
  if (!includeThirdParty) conds.push(eq(circuits.thirdParty, false));
  conds.push(isNull(circuits.cancelledOn));
  const rows = await db
    .selectDistinct({ id: clients.id, name: clients.tradeName, isInternal: clients.isInternal, internalCode: clients.internalCode })
    .from(circuits).innerJoin(clients, eq(clients.id, circuits.ownerClientId))
    .where(and(...conds));
  return rows.sort((a, b) => Number(b.isInternal) - Number(a.isInternal) || a.name.localeCompare(b.name, 'pt-BR'));
}

export async function options(db: Db) {
  // o link cancelado (2.4.6) não recebe números novos: fica fora da escolha
  return db.select({ id: circuits.id, name: circuits.name, code: circuits.code, carrierName: carriers.name }).from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).where(and(isNull(circuits.deletedAt), isNull(circuits.cancelledOn))).orderBy(asc(circuits.name));
}
