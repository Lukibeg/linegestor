/**
 * Inventário: modelos, aparelhos serializados (por MAC), estoque a granel e movimentações.
 *
 * Regras que vivem aqui:
 *  - serializado: cada unidade é uma linha em `devices`, com MAC único; "atribuído a" = clientId (nulo = estoque)
 *  - `unit` é a unidade do cliente (filial/loja) onde o aparelho está; volta a ficar vazia quando ele retorna ao estoque
 *  - granel: saldo por (modelo, lugar, modalidade) em `bulk_stock`
 *  - só se movimenta aparelho PARA um cliente que assina o produto Equipamentos (regra R22, confirmada)
 *  - venda: o aparelho fica com condição "vendido" — sai das contagens de estoque/locado, mas o histórico permanece
 *  - devolução: destino é sempre o estoque
 *  - toda movimentação é uma transação: ou grava tudo (cabeçalho, itens, saldos) ou nada
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { bulkStock, clients, deviceCategories, deviceModels, deviceMovementItems, deviceMovements, devices, newId, users, type Db } from '@gestor/db';
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
      total: sql<number>`count(*) filter (where ${devices.condition} <> 'vendido')`,
      inStock: sql<number>`count(*) filter (where ${devices.clientId} is null and ${devices.condition} in ('ativo','manutencao'))`,
      withClients: sql<number>`count(*) filter (where ${devices.clientId} is not null and ${devices.condition} <> 'vendido' and ${devices.condition} <> 'baixado')`,
      sold: sql<number>`count(*) filter (where ${devices.condition} = 'vendido')`,
      maintenance: sql<number>`count(*) filter (where ${devices.condition} = 'manutencao')`,
      retired: sql<number>`count(*) filter (where ${devices.condition} = 'baixado')`,
    })
    .from(devices).where(and(inArray(devices.modelId, ids), isNull(devices.deletedAt))).groupBy(devices.modelId);
  const bulkAgg = await db
    .select({ modelId: bulkStock.modelId, inStock: sql<number>`sum(${bulkStock.quantity}) filter (where ${bulkStock.clientId} is null)`, withClients: sql<number>`sum(${bulkStock.quantity}) filter (where ${bulkStock.clientId} is not null)` })
    .from(bulkStock).where(inArray(bulkStock.modelId, ids)).groupBy(bulkStock.modelId);
  return rows.map((r) => {
    const d = devAgg.find((x) => x.modelId === r.m.id);
    const b = bulkAgg.find((x) => x.modelId === r.m.id);
    const inStock = Number(r.m.tracking === 'granel' ? b?.inStock ?? 0 : d?.inStock ?? 0);
    const withClients = Number(r.m.tracking === 'granel' ? b?.withClients ?? 0 : d?.withClients ?? 0);
    return {
      ...r.m, categoryName: r.categoryName,
      counts: { total: inStock + withClients, inStock, withClients, sold: Number(d?.sold ?? 0), maintenance: Number(d?.maintenance ?? 0), retired: Number(d?.retired ?? 0) },
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
  if (data.tracking && data.tracking !== before.tracking) {
    const [n] = await db.select({ n: sql<number>`count(*)` }).from(devices).where(and(eq(devices.modelId, id), isNull(devices.deletedAt)));
    const [b] = await db.select({ n: sql<number>`coalesce(sum(${bulkStock.quantity}),0)` }).from(bulkStock).where(eq(bulkStock.modelId, id));
    if (Number(n?.n ?? 0) > 0 || Number(b?.n ?? 0) > 0) throw new BadRequest('Não dá para mudar a contabilização de um modelo que já tem aparelhos');
  }
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

// ---------- Aparelhos serializados ----------

export type FiltroAparelhos = { q?: string; modelId?: string; clientId?: string | 'stock'; condition?: string; includeRetired?: boolean };

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
  else if (!q.includeRetired) conds.push(sql`${devices.condition} not in ('baixado','vendido')`);
  if (q.q) {
    const mac = q.q.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
    conds.push(or(mac ? ilike(devices.mac, `%${mac}%`) : sql`false`, ilike(devices.ip, `%${q.q}%`), ilike(devices.unit, `%${q.q}%`), ilike(devices.location, `%${q.q}%`))!);
  }
  return conds;
}

/**
 * Resumo do inventário para os cartões do topo: em estoque, com clientes, em manutenção e
 * o valor dos aparelhos que estão com clientes. Respeita os mesmos filtros da lista.
 * Itens a granel só entram quando não há filtro de aparelho específico (eles não têm MAC nem condição).
 */
export async function summary(db: Db, q: FiltroAparelhos = {}) {
  const semFiltro = !q.q && !q.modelId && !q.clientId && !q.condition;
  const base = filtrosAparelhos({ ...q, condition: undefined, includeRetired: true });
  const [d] = await db
    .select({
      inStock: sql<number>`count(*) filter (where ${devices.clientId} is null and ${devices.condition} in ('ativo','manutencao'))`,
      withClients: sql<number>`count(*) filter (where ${devices.clientId} is not null and ${devices.condition} not in ('vendido','baixado'))`,
      maintenance: sql<number>`count(*) filter (where ${devices.condition} = 'manutencao')`,
      valueWithClients: sql<number>`coalesce(sum(${devices.valueCents}) filter (where ${devices.clientId} is not null and ${devices.currentModality} in ('locacao','comodato') and ${devices.condition} not in ('vendido','baixado')),0)`,
    })
    .from(devices).where(and(...base));
  const bulkConds: SQL[] = [];
  if (q.modelId) bulkConds.push(eq(bulkStock.modelId, q.modelId));
  if (q.clientId === 'stock') bulkConds.push(isNull(bulkStock.clientId));
  else if (q.clientId) bulkConds.push(eq(bulkStock.clientId, q.clientId));
  const [b] = q.q || q.condition
    ? [undefined]
    : await db
        .select({ inStock: sql<number>`coalesce(sum(${bulkStock.quantity}) filter (where ${bulkStock.clientId} is null),0)`, withClients: sql<number>`coalesce(sum(${bulkStock.quantity}) filter (where ${bulkStock.clientId} is not null),0)` })
        .from(bulkStock).where(bulkConds.length ? and(...bulkConds) : undefined);
  return {
    inStock: Number(d?.inStock ?? 0) + Number(b?.inStock ?? 0),
    withClients: Number(d?.withClients ?? 0) + Number(b?.withClients ?? 0),
    maintenance: Number(d?.maintenance ?? 0),
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
    .select({ d: devices, modelName: deviceModels.name, modelCode: deviceModels.code, tracking: deviceModels.tracking, clientName: clients.tradeName })
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
  if (model.tracking !== 'serializado') throw new BadRequest('Este modelo é contado a granel; use "ajustar estoque" em vez de cadastrar unidade');
  const [dup] = await db.select({ id: devices.id }).from(devices).where(eq(devices.mac, data.mac));
  if (dup) throw new BadRequest(`Já existe um aparelho com o MAC ${macFormatado(data.mac)}`);
  const [row] = await db.insert(devices).values({ id: newId(), ...data }).returning();
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

// ---------- Estoque a granel ----------

export async function listBulk(db: Db, modelId?: string) {
  return db
    .select({ id: bulkStock.id, modelId: bulkStock.modelId, modelName: deviceModels.name, clientId: bulkStock.clientId, clientName: clients.tradeName, modality: bulkStock.modality, quantity: bulkStock.quantity, updatedAt: bulkStock.updatedAt })
    .from(bulkStock).innerJoin(deviceModels, eq(deviceModels.id, bulkStock.modelId)).leftJoin(clients, eq(clients.id, bulkStock.clientId))
    .where(and(modelId ? eq(bulkStock.modelId, modelId) : undefined, sql`${bulkStock.quantity} <> 0`))
    .orderBy(asc(deviceModels.name), asc(clients.tradeName));
}

/** Soma `delta` ao saldo de (modelo, cliente, modalidade). Cria a linha se não existir. Nunca deixa negativo. */
async function adjustBulk(db: Db, modelId: string, clientId: string | null, modality: string, delta: number) {
  const [row] = await db.select().from(bulkStock).where(and(eq(bulkStock.modelId, modelId), clientId ? eq(bulkStock.clientId, clientId) : isNull(bulkStock.clientId), eq(bulkStock.modality, modality)));
  const next = (row?.quantity ?? 0) + delta;
  if (next < 0) {
    const [m] = await db.select({ name: deviceModels.name }).from(deviceModels).where(eq(deviceModels.id, modelId));
    throw new BadRequest(`Saldo insuficiente de "${m?.name}" ${clientId ? 'com o cliente' : 'no estoque'}: tem ${row?.quantity ?? 0}, pediu ${-delta}`);
  }
  if (row) await db.update(bulkStock).set({ quantity: next, updatedAt: new Date() }).where(eq(bulkStock.id, row.id));
  else await db.insert(bulkStock).values({ id: newId(), modelId, clientId, modality, quantity: next });
}

export async function adjustStock(db: Db, modelId: string, delta: number) {
  const [model] = await db.select().from(deviceModels).where(eq(deviceModels.id, modelId));
  if (!model) throw new NotFound('Modelo');
  if (model.tracking !== 'granel') throw new BadRequest('Este modelo é serializado; cadastre cada unidade pelo MAC');
  await adjustBulk(db, modelId, null, 'estoque', delta);
  return listBulk(db, modelId);
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
      if ('deviceId' in it) {
        const [d] = await tx.select().from(devices).where(and(eq(devices.id, it.deviceId), isNull(devices.deletedAt)));
        if (!d) throw new NotFound('Aparelho');
        if (d.condition === 'vendido') throw new BadRequest(`O aparelho ${macFormatado(d.mac)} já foi vendido`);
        if (data.modality === 'devolucao' && !d.clientId) throw new BadRequest(`O aparelho ${macFormatado(d.mac)} já está no estoque`);
        if (fromClientId === undefined) fromClientId = d.clientId;
        const condition = data.newCondition ?? (data.modality === 'venda' ? 'vendido' : d.condition);
        await tx.update(devices).set({
          clientId: data.toClientId, currentModality: data.toClientId ? data.modality : null, condition,
          // a unidade só faz sentido quando o aparelho está com um cliente; voltando ao estoque, limpa
          unit: data.toClientId ? data.unit ?? d.unit ?? null : null,
          updatedAt: new Date(),
        }).where(eq(devices.id, d.id));
        items.push({ id: newId(), movementId, modelId: d.modelId, deviceId: d.id, quantity: 1 });
      } else {
        const [m] = await tx.select().from(deviceModels).where(eq(deviceModels.id, it.modelId));
        if (!m) throw new NotFound('Modelo');
        if (m.tracking !== 'granel') throw new BadRequest(`"${m.name}" é serializado: escolha os aparelhos pelo MAC`);
        const origin = it.fromClientId ?? null;
        if (fromClientId === undefined) fromClientId = origin;
        // sai da origem
        if (origin) {
          // com cliente: saldo pode estar sob qualquer modalidade; tiramos da que tiver saldo
          const rows = await tx.select().from(bulkStock).where(and(eq(bulkStock.modelId, m.id), eq(bulkStock.clientId, origin), sql`${bulkStock.quantity} > 0`)).orderBy(desc(bulkStock.quantity));
          let remaining = it.quantity;
          for (const r of rows) { if (remaining <= 0) break; const take = Math.min(r.quantity, remaining); await adjustBulk(tx, m.id, origin, r.modality, -take); remaining -= take; }
          if (remaining > 0) throw new BadRequest(`Saldo insuficiente de "${m.name}" com o cliente: faltam ${remaining}`);
        } else {
          await adjustBulk(tx, m.id, null, 'estoque', -it.quantity);
        }
        // entra no destino
        await adjustBulk(tx, m.id, data.toClientId, data.toClientId ? data.modality : 'estoque', it.quantity);
        items.push({ id: newId(), movementId, modelId: m.id, deviceId: null, quantity: it.quantity });
      }
    }

    await tx.insert(deviceMovements).values({ id: movementId, modality: data.modality, fromClientId: fromClientId ?? null, toClientId: data.toClientId, newCondition: data.newCondition ?? null, valueCents: data.valueCents ?? null, note: data.note ?? null, userId });
    await tx.insert(deviceMovementItems).values(items);
    const qty = items.reduce((a, i) => a + (i.quantity ?? 1), 0);
    return { id: movementId, items: items.length, quantity: qty, fromClientId: fromClientId ?? null };
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
    .select({ id: deviceMovements.id, modality: deviceMovements.modality, fromClientId: deviceMovements.fromClientId, fromName: fromC.tradeName, toClientId: deviceMovements.toClientId, toName: toC.tradeName, newCondition: deviceMovements.newCondition, valueCents: deviceMovements.valueCents, note: deviceMovements.note, userName: users.name, createdAt: deviceMovements.createdAt })
    .from(deviceMovements).leftJoin(fromC, eq(fromC.id, deviceMovements.fromClientId)).leftJoin(toC, eq(toC.id, deviceMovements.toClientId)).innerJoin(users, eq(users.id, deviceMovements.userId))
    .where(where).orderBy(ordenacaoMovimentacoes(q, fromC, toC)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const ids = rows.map((r) => r.id).concat(['-']);
  const items = await db
    .select({ movementId: deviceMovementItems.movementId, modelName: deviceModels.name, quantity: sql<number>`sum(${deviceMovementItems.quantity})` })
    .from(deviceMovementItems).innerJoin(deviceModels, eq(deviceModels.id, deviceMovementItems.modelId)).where(inArray(deviceMovementItems.movementId, ids)).groupBy(deviceMovementItems.movementId, deviceModels.name);
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(deviceMovements).where(where);
  return {
    items: rows.map((r) => ({ ...r, modalityName: (MODALIDADES as any)[r.modality] ?? r.modality, items: items.filter((i) => i.movementId === r.id).map((i) => ({ modelName: i.modelName, quantity: Number(i.quantity) })) })),
    total: Number(c?.n ?? 0), page: q.page, pageSize: q.pageSize,
  };
}
