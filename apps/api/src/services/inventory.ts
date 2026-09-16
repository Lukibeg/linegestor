/**
 * Inventário: modelos, aparelhos e movimentações.
 *
 * Regras que vivem aqui:
 *  - **cada unidade é uma linha** em `devices`, sempre. Quem tem MAC é identificado por ele;
 *    quem não tem (headset, cabo) fica com o MAC vazio e a tela mostra "não aplicável".
 *    Não existe contagem por quantidade.
 *  - "atribuído a" = `clientId` (nulo = está no nosso estoque)
 *  - `unit` é a unidade do cliente (filial/loja) onde o aparelho está; volta a ficar vazia
 *    quando ele retorna ao estoque
 *  - **condição é só ativo ou inativo.** "Vendido" não é condição: é quem tem a última
 *    movimentação em `venda` (`currentModality = 'venda'`) — o aparelho pode estar ativo,
 *    só que já não é nosso
 *  - só se movimenta aparelho PARA um cliente que assina o produto Equipamentos (regra R22)
 *  - devolução: destino é sempre o estoque — é assim que o aparelho volta do cliente
 *  - toda movimentação é uma transação: ou grava tudo (cabeçalho e itens) ou nada
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { clients, deviceCategories, deviceModels, deviceMovementItems, deviceMovements, devices, newId, users, type Db } from '@gestor/db';
import { macFormatado, MODALIDADES, type AparelhoGravar, type ModeloGravar, type MovimentacaoCriar } from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';
import { idsWithProduct } from './clients.js';

// ---------- Modelos ----------

export async function listModels(db: Db, q: { q?: string; categoryId?: string; includeDeleted?: boolean } = {}) {
  const conds: SQL[] = [];
  if (!q.includeDeleted) conds.push(isNull(deviceModels.deletedAt));
  if (q.categoryId) conds.push(eq(deviceModels.categoryId, q.categoryId));
  if (q.q) conds.push(or(ilike(deviceModels.name, `%${q.q}%`), ilike(deviceModels.code, `%${q.q}%`))!);
  const rows = await db
    .select({ m: deviceModels, categoryName: deviceCategories.name })
    .from(deviceModels).leftJoin(deviceCategories, eq(deviceCategories.id, deviceModels.categoryId))
    .where(conds.length ? and(...conds) : undefined).orderBy(asc(deviceModels.name));
  const ids = rows.map((r) => r.m.id).concat(['-']);
  const devAgg = await db
    .select({
      modelId: devices.modelId,
      inStock: sql<number>`count(*) filter (where ${devices.clientId} is null)`,
      withClients: sql<number>`count(*) filter (where ${devices.clientId} is not null and coalesce(${devices.currentModality}, '') <> 'venda')`,
      sold: sql<number>`count(*) filter (where ${devices.currentModality} = 'venda')`,
      inactive: sql<number>`count(*) filter (where ${devices.condition} = 'inativo')`,
    })
    .from(devices).where(and(inArray(devices.modelId, ids), isNull(devices.deletedAt))).groupBy(devices.modelId);
  return rows.map((r) => {
    const d = devAgg.find((x) => x.modelId === r.m.id);
    const inStock = Number(d?.inStock ?? 0);
    const withClients = Number(d?.withClients ?? 0);
    return {
      ...r.m, categoryName: r.categoryName,
      counts: { total: inStock + withClients, inStock, withClients, sold: Number(d?.sold ?? 0), inactive: Number(d?.inactive ?? 0) },
    };
  });
}

export async function createModel(db: Db, data: ModeloGravar) {
  const [dup] = await db.select({ id: deviceModels.id }).from(deviceModels).where(eq(deviceModels.code, data.code));
  if (dup) throw new BadRequest('Já existe um modelo com este código');
  const [row] = await db.insert(deviceModels).values({ id: newId(), ...data }).returning();
  return row!;
}
export async function updateModel(db: Db, id: string, data: Partial<ModeloGravar>) {
  const [before] = await db.select().from(deviceModels).where(eq(deviceModels.id, id));
  if (!before) throw new NotFound('Modelo');
  const [after] = await db.update(deviceModels).set({ ...data, updatedAt: new Date() }).where(eq(deviceModels.id, id)).returning();
  return { before, after: after! };
}
export async function deleteModel(db: Db, id: string) {
  const [n] = await db.select({ n: sql<number>`count(*)` }).from(devices).where(and(eq(devices.modelId, id), isNull(devices.deletedAt)));
  if (Number(n?.n ?? 0) > 0) throw new BadRequest('Este modelo ainda tem aparelhos cadastrados');
  const [row] = await db.update(deviceModels).set({ deletedAt: new Date() }).where(eq(deviceModels.id, id)).returning();
  if (!row) throw new NotFound('Modelo');
  return row;
}

// ---------- Aparelhos ----------

export type FiltroAparelhos = { q?: string; modelId?: string; clientId?: string | 'stock'; condition?: string; includeSold?: boolean };

/**
 * Os filtros da aba Aparelhos viram condições de SQL. A MESMA função alimenta a lista e os
 * cartões de resumo do topo — filtrou por modelo ou cliente, os números acompanham.
 */
function filtrosAparelhos(q: FiltroAparelhos): SQL[] {
  const conds: SQL[] = [isNull(devices.deletedAt)];
  if (q.modelId) conds.push(eq(devices.modelId, q.modelId));
  if (q.clientId === 'stock') conds.push(isNull(devices.clientId));
  else if (q.clientId) conds.push(eq(devices.clientId, q.clientId));
  if (q.condition) conds.push(eq(devices.condition, q.condition));
  // vendido já não é nosso: fica fora da lista, a menos que se peça
  if (!q.includeSold) conds.push(sql`coalesce(${devices.currentModality}, '') <> 'venda'`);
  if (q.q) {
    const mac = q.q.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
    conds.push(or(mac ? ilike(devices.mac, `%${mac}%`) : sql`false`, ilike(devices.ip, `%${q.q}%`), ilike(devices.unit, `%${q.q}%`), ilike(devices.location, `%${q.q}%`))!);
  }
  return conds;
}

/**
 * Resumo do inventário para os cartões do topo: em estoque, com clientes, inativos e o valor
 * dos aparelhos que estão com clientes. Respeita os mesmos filtros da lista — filtrou por
 * modelo ou cliente, os números acompanham.
 */
export async function summary(db: Db, q: FiltroAparelhos = {}) {
  const semFiltro = !q.q && !q.modelId && !q.clientId && !q.condition;
  const base = filtrosAparelhos({ ...q, condition: undefined });
  const [d] = await db
    .select({
      inStock: sql<number>`count(*) filter (where ${devices.clientId} is null)`,
      withClients: sql<number>`count(*) filter (where ${devices.clientId} is not null)`,
      inactive: sql<number>`count(*) filter (where ${devices.condition} = 'inativo')`,
      valueWithClients: sql<number>`coalesce(sum(${devices.valueCents}) filter (where ${devices.clientId} is not null and ${devices.currentModality} in ('locacao','comodato')),0)`,
    })
    .from(devices).where(and(...base));
  return {
    inStock: Number(d?.inStock ?? 0),
    withClients: Number(d?.withClients ?? 0),
    inactive: Number(d?.inactive ?? 0),
    valueWithClientsCents: Number(d?.valueWithClients ?? 0),
    filtrado: !semFiltro,
  };
}

/** Ordenação da tabela de aparelhos. */
function ordenacaoAparelhos(q: { sort?: string; dir?: string }) {
  const dir = q.dir === 'desc' ? sql`desc` : sql`asc`;
  const colunas: Record<string, SQL> = {
    mac: sql`${devices.mac}`,
    modelName: sql`lower(${deviceModels.name})`,
    clientName: sql`lower(${clients.tradeName})`,
    currentModality: sql`${devices.currentModality}`,
    condition: sql`${devices.condition}`,
    ip: sql`${devices.ip}`,
    unit: sql`lower(${devices.unit})`,
    location: sql`lower(${devices.location})`,
    valueCents: sql`${devices.valueCents}`,
    createdAt: sql`${devices.createdAt}`,
  };
  const campo = colunas[q.sort ?? 'modelName'] ?? colunas.modelName!;
  return sql`${campo} ${dir} nulls last, ${devices.mac} asc`;
}

export async function listDevices(db: Db, q: FiltroAparelhos & { page: number; pageSize: number; sort?: string; dir?: string }) {
  const where = and(...filtrosAparelhos(q));
  const rows = await db
    .select({ d: devices, modelName: deviceModels.name, modelCode: deviceModels.code, clientName: clients.tradeName })
    .from(devices).innerJoin(deviceModels, eq(deviceModels.id, devices.modelId)).leftJoin(clients, eq(clients.id, devices.clientId))
    .where(where).orderBy(ordenacaoAparelhos(q)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(devices).where(where);
  return { items: rows.map((r) => ({ ...r.d, macFormatted: macFormatado(r.d.mac), modelName: r.modelName, modelCode: r.modelCode, clientName: r.clientName })), total: Number(c?.n ?? 0), page: q.page, pageSize: q.pageSize };
}

export async function getDevice(db: Db, id: string) {
  const [r] = await db
    .select({ d: devices, modelName: deviceModels.name, modelCode: deviceModels.code, clientName: clients.tradeName })
    .from(devices).innerJoin(deviceModels, eq(deviceModels.id, devices.modelId)).leftJoin(clients, eq(clients.id, devices.clientId)).where(eq(devices.id, id));
  if (!r) throw new NotFound('Aparelho');
  const from = alias(clients, 'from'), to = alias(clients, 'to');
  const history = await db
    .select({ id: deviceMovements.id, modality: deviceMovements.modality, fromName: from.tradeName, toName: to.tradeName, newCondition: deviceMovements.newCondition, note: deviceMovements.note, userName: users.name, createdAt: deviceMovements.createdAt })
    .from(deviceMovementItems).innerJoin(deviceMovements, eq(deviceMovements.id, deviceMovementItems.movementId))
    .leftJoin(from, eq(from.id, deviceMovements.fromClientId)).leftJoin(to, eq(to.id, deviceMovements.toClientId)).innerJoin(users, eq(users.id, deviceMovements.userId))
    .where(eq(deviceMovementItems.deviceId, id)).orderBy(desc(deviceMovements.createdAt));
  return { ...r.d, macFormatted: macFormatado(r.d.mac), modelName: r.modelName, modelCode: r.modelCode, clientName: r.clientName, history: history.map((h) => ({ ...h, modalityName: (MODALIDADES as any)[h.modality] ?? h.modality })) };
}

export async function createDevice(db: Db, data: AparelhoGravar) {
  const [model] = await db.select().from(deviceModels).where(eq(deviceModels.id, data.modelId));
  if (!model) throw new NotFound('Modelo');
  // sem MAC é caso normal (headset, cabo): só checa duplicidade quando há MAC
  if (data.mac) {
    const [dup] = await db.select({ id: devices.id }).from(devices).where(eq(devices.mac, data.mac));
    if (dup) throw new BadRequest(`Já existe um aparelho com o MAC ${macFormatado(data.mac)}`);
  }
  const [row] = await db.insert(devices).values({ id: newId(), ...data, mac: data.mac ?? null }).returning();
  return row!;
}
export async function updateDevice(db: Db, id: string, data: Partial<AparelhoGravar>) {
  const [before] = await db.select().from(devices).where(eq(devices.id, id));
  if (!before) throw new NotFound('Aparelho');
  if (data.mac && data.mac !== before.mac) {
    const [dup] = await db.select({ id: devices.id }).from(devices).where(eq(devices.mac, data.mac));
    if (dup) throw new BadRequest('Já existe um aparelho com este MAC');
  }
  const [after] = await db.update(devices).set({ ...data, updatedAt: new Date() }).where(eq(devices.id, id)).returning();
  return { before, after: after! };
}
export async function deleteDevice(db: Db, id: string) {
  const [row] = await db.update(devices).set({ deletedAt: new Date() }).where(and(eq(devices.id, id), isNull(devices.deletedAt))).returning();
  if (!row) throw new NotFound('Aparelho');
  return row;
}
export async function restoreDevice(db: Db, id: string) {
  const [row] = await db.update(devices).set({ deletedAt: null }).where(eq(devices.id, id)).returning();
  if (!row) throw new NotFound('Aparelho');
  return row;
}

/** As unidades (filiais) já digitadas — a interface sugere estas para não haver dez grafias da mesma loja. */
export async function listUnits(db: Db, clientId?: string) {
  const rows = await db
    .selectDistinct({ unit: devices.unit })
    .from(devices)
    .where(and(isNull(devices.deletedAt), sql`${devices.unit} is not null and ${devices.unit} <> ''`, clientId ? eq(devices.clientId, clientId) : undefined))
    .orderBy(asc(devices.unit));
  return rows.map((r) => r.unit!).filter(Boolean);
}

// ---------- Movimentações ----------

export async function createMovement(db: Db, data: MovimentacaoCriar, userId: string) {
  if (data.modality === 'devolucao' && data.toClientId) throw new BadRequest('Devolução vai sempre para o estoque (destino vazio)');
  if (data.modality !== 'devolucao' && !data.toClientId) throw new BadRequest('Informe o cliente de destino');
  if (data.toClientId) {
    const allowed = await idsWithProduct(db, 'equipamentos');
    if (!allowed.has(data.toClientId)) {
      const [c] = await db.select({ name: clients.tradeName }).from(clients).where(eq(clients.id, data.toClientId));
      throw new BadRequest(`"${c?.name ?? 'Cliente'}" não assina o produto Equipamentos. Marque o produto na ficha do cliente antes de movimentar aparelhos.`);
    }
  }

  return db.transaction(async (tx) => {
    const movementId = newId();
    let fromClientId: string | null | undefined = undefined;
    const items: (typeof deviceMovementItems.$inferInsert)[] = [];

    for (const it of data.items) {
      const [d] = await tx.select().from(devices).where(and(eq(devices.id, it.deviceId), isNull(devices.deletedAt)));
      if (!d) throw new NotFound('Aparelho');
      const nome = d.mac ? macFormatado(d.mac) : 'sem MAC';
      if (d.currentModality === 'venda') throw new BadRequest(`O aparelho ${nome} já foi vendido`);
      if (data.modality === 'devolucao' && !d.clientId) throw new BadRequest(`O aparelho ${nome} já está no estoque`);
      if (fromClientId === undefined) fromClientId = d.clientId;
      await tx.update(devices).set({
        clientId: data.toClientId,
        currentModality: data.toClientId ? data.modality : null,
        condition: data.newCondition ?? d.condition,
        // a unidade só faz sentido quando o aparelho está com um cliente; voltando ao estoque, limpa
        unit: data.toClientId ? data.unit ?? d.unit ?? null : null,
        updatedAt: new Date(),
      }).where(eq(devices.id, d.id));
      items.push({ id: newId(), movementId, modelId: d.modelId, deviceId: d.id });
    }

    await tx.insert(deviceMovements).values({ id: movementId, modality: data.modality, fromClientId: fromClientId ?? null, toClientId: data.toClientId, newCondition: data.newCondition ?? null, note: data.note ?? null, userId });
    await tx.insert(deviceMovementItems).values(items);
    return { id: movementId, items: items.length, quantity: items.length, fromClientId: fromClientId ?? null };
  });
}

/** Ordenação do histórico de movimentações (padrão: mais recentes primeiro). */
function ordenacaoMovimentacoes(q: { sort?: string; dir?: string }, fromC: ReturnType<typeof alias<typeof clients, string>>, toC: ReturnType<typeof alias<typeof clients, string>>) {
  const dir = q.dir === 'asc' ? sql`asc` : sql`desc`;
  const colunas: Record<string, SQL> = {
    createdAt: sql`${deviceMovements.createdAt}`,
    modality: sql`${deviceMovements.modality}`,
    fromName: sql`lower(${fromC.tradeName})`,
    toName: sql`lower(${toC.tradeName})`,
    userName: sql`lower(${users.name})`,
  };
  const campo = colunas[q.sort ?? 'createdAt'] ?? colunas.createdAt!;
  return sql`${campo} ${dir} nulls last, ${deviceMovements.createdAt} desc`;
}

export async function listMovements(db: Db, q: { modality?: string; clientId?: string; from?: Date; to?: Date; page: number; pageSize: number; sort?: string; dir?: string }) {
  const fromC = alias(clients, 'from'), toC = alias(clients, 'to');
  const conds: SQL[] = [];
  if (q.modality) conds.push(eq(deviceMovements.modality, q.modality));
  if (q.clientId) conds.push(or(eq(deviceMovements.fromClientId, q.clientId), eq(deviceMovements.toClientId, q.clientId))!);
  if (q.from) conds.push(gte(deviceMovements.createdAt, q.from));
  if (q.to) conds.push(lte(deviceMovements.createdAt, q.to));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({ id: deviceMovements.id, modality: deviceMovements.modality, fromClientId: deviceMovements.fromClientId, fromName: fromC.tradeName, toClientId: deviceMovements.toClientId, toName: toC.tradeName, newCondition: deviceMovements.newCondition, note: deviceMovements.note, userName: users.name, createdAt: deviceMovements.createdAt })
    .from(deviceMovements).leftJoin(fromC, eq(fromC.id, deviceMovements.fromClientId)).leftJoin(toC, eq(toC.id, deviceMovements.toClientId)).innerJoin(users, eq(users.id, deviceMovements.userId))
    .where(where).orderBy(ordenacaoMovimentacoes(q, fromC, toC)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const ids = rows.map((r) => r.id).concat(['-']);
  const items = await db
    .select({ movementId: deviceMovementItems.movementId, modelName: deviceModels.name, quantity: sql<number>`count(*)` })
    .from(deviceMovementItems).innerJoin(deviceModels, eq(deviceModels.id, deviceMovementItems.modelId)).where(inArray(deviceMovementItems.movementId, ids)).groupBy(deviceMovementItems.movementId, deviceModels.name);
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(deviceMovements).where(where);
  return {
    items: rows.map((r) => ({ ...r, modalityName: (MODALIDADES as any)[r.modality] ?? r.modality, items: items.filter((i) => i.movementId === r.id).map((i) => ({ modelName: i.modelName, quantity: Number(i.quantity) })) })),
    total: Number(c?.n ?? 0), page: q.page, pageSize: q.pageSize,
  };
}
