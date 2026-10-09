/**
 * Inventário: modelos, aparelhos e movimentações.
 *
 * Regras que vivem aqui:
 *  - **cada unidade é uma linha** em `devices`, sempre. O aparelho se identifica pelo MAC; quem
 *    não tem MAC pode ter número de série (N/S); quem não tem nenhum dos dois (headset, cabo)
 *    aparece como "não aplicável". Não existe contagem por quantidade.
 *  - **o valor mora no modelo.** O aparelho só tem valor próprio quando é diferente do modelo;
 *    vazio = vale o do modelo. É essa conta (`valorDoAparelho`) que soma no cliente.
 *  - "atribuído a" = `clientId` (nulo = está no nosso estoque)
 *  - `unit` é a unidade do cliente (Matriz, filial, loja) onde o aparelho está; as unidades
 *    são cadastradas no cliente, e a Matriz é a padrão. Volta a ficar vazia no estoque.
 *  - **condição é só ativo ou inativo.** "Vendido" não é condição: é quem tem a última
 *    movimentação em `venda` (`currentModality = 'venda'`) — o aparelho pode estar ativo,
 *    só que já não é nosso
 *  - só se movimenta aparelho PARA um cliente que assina o produto Equipamentos (regra R22)
 *  - devolução: destino é sempre o estoque — é assim que o aparelho volta do cliente
 *  - toda movimentação (e todo cadastro em massa) é uma transação: ou grava tudo ou nada
 *  - a movimentação para um cliente pode levar o **recibo de entrega** (PDF ou foto, até 5 arquivos),
 *    na hora ou depois; a regra mora em `@gestor/shared/recibo.ts` (Patch 1.9, decisão 0042)
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { clientDeviceLogins, clientNetworkSettings, clients, deviceCategories, deviceModelImages, deviceModels, deviceMovementItems, deviceMovementReceipts, deviceMovements, devices, newId, products, subscriptions, users, type Db } from '@gestor/db';
import {
  identificacaoAparelho, macFormatado, macLimpo, macValido, MODALIDADES, problemaDoRecibo, problemaParaAnexar, relatoriosInventario, serieLimpa, tipoDoRecibo,
  type AparelhoGravar, type AparelhosEmMassa, type BaseInventario, type ModeloAtualizar, type ModeloGravar, type MovimentacaoCriar, type ReciboAnexar,
} from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';
import { idsWithProduct, unidadeDoCliente, valorDoAparelho } from './clients.js';
import { lerConteudo } from './projects.js';

// ---------- Modelos ----------

/** Endereço da foto, relativo à API. O `v` muda a cada troca, para o navegador não mostrar a antiga. */
function fotoPath(modelId: string, updatedAt?: Date | null) {
  return updatedAt ? `inventory/models/${modelId}/image?v=${updatedAt.getTime()}` : null;
}

export async function listModels(db: Db, q: { q?: string; categoryId?: string; includeDeleted?: boolean } = {}) {
  const conds: SQL[] = [];
  if (!q.includeDeleted) conds.push(isNull(deviceModels.deletedAt));
  if (q.categoryId) conds.push(eq(deviceModels.categoryId, q.categoryId));
  if (q.q) conds.push(or(ilike(deviceModels.name, `%${q.q}%`), ilike(deviceModels.code, `%${q.q}%`))!);
  const rows = await db
    .select({ m: deviceModels, categoryName: deviceCategories.name, fotoEm: deviceModelImages.updatedAt })
    .from(deviceModels)
    .leftJoin(deviceCategories, eq(deviceCategories.id, deviceModels.categoryId))
    .leftJoin(deviceModelImages, eq(deviceModelImages.modelId, deviceModels.id))
    .where(conds.length ? and(...conds) : undefined).orderBy(asc(deviceModels.name));
  const ids = rows.map((r) => r.m.id).concat(['-']);
  const devAgg = await db
    .select({
      modelId: devices.modelId,
      inStock: sql<number>`count(*) filter (where ${devices.clientId} is null)`,
      withClients: sql<number>`count(*) filter (where ${devices.clientId} is not null and coalesce(${devices.currentModality}, '') <> 'venda')`,
      sold: sql<number>`count(*) filter (where ${devices.currentModality} = 'venda')`,
      inactive: sql<number>`count(*) filter (where ${devices.condition} = 'inativo')`,
      ownValue: sql<number>`count(*) filter (where ${devices.valueCents} is not null)`,
    })
    .from(devices).where(and(inArray(devices.modelId, ids), isNull(devices.deletedAt))).groupBy(devices.modelId);
  return rows.map((r) => {
    const d = devAgg.find((x) => x.modelId === r.m.id);
    const inStock = Number(d?.inStock ?? 0);
    const withClients = Number(d?.withClients ?? 0);
    return {
      ...r.m, categoryName: r.categoryName,
      imageUrl: fotoPath(r.m.id, r.fotoEm),
      counts: { total: inStock + withClients, inStock, withClients, sold: Number(d?.sold ?? 0), inactive: Number(d?.inactive ?? 0), ownValue: Number(d?.ownValue ?? 0) },
    };
  });
}

export async function createModel(db: Db, data: ModeloGravar) {
  const [dup] = await db.select({ id: deviceModels.id }).from(deviceModels).where(eq(deviceModels.code, data.code));
  if (dup) throw new BadRequest('Já existe um modelo com este código');
  const [row] = await db.insert(deviceModels).values({ id: newId(), ...data, imageUrl: null }).returning();
  return row!;
}

/**
 * Edita o modelo. Com `aplicarValorATodos`, os aparelhos deste modelo que tinham valor próprio
 * passam a usar o valor do modelo — é o jeito de "corrigir o preço de todos de uma vez".
 */
export async function updateModel(db: Db, id: string, data: ModeloAtualizar) {
  const [before] = await db.select().from(deviceModels).where(eq(deviceModels.id, id));
  if (!before) throw new NotFound('Modelo');
  const { aplicarValorATodos, imageUrl: _ignorado, ...campos } = data;
  if (campos.code && campos.code !== before.code) {
    const [dup] = await db.select({ id: deviceModels.id }).from(deviceModels).where(eq(deviceModels.code, campos.code));
    if (dup) throw new BadRequest('Já existe um modelo com este código');
  }
  return db.transaction(async (tx) => {
    const [after] = await tx.update(deviceModels).set({ ...campos, updatedAt: new Date() }).where(eq(deviceModels.id, id)).returning();
    let igualados = 0;
    if (aplicarValorATodos) {
      const r = await tx.update(devices).set({ valueCents: null, updatedAt: new Date() })
        .where(and(eq(devices.modelId, id), sql`${devices.valueCents} is not null`)).returning({ id: devices.id });
      igualados = r.length;
    }
    return { before, after: after!, igualados };
  });
}

export async function deleteModel(db: Db, id: string) {
  const [n] = await db.select({ n: sql<number>`count(*)` }).from(devices).where(and(eq(devices.modelId, id), isNull(devices.deletedAt)));
  if (Number(n?.n ?? 0) > 0) throw new BadRequest('Este modelo ainda tem aparelhos cadastrados');
  const [row] = await db.update(deviceModels).set({ deletedAt: new Date() }).where(eq(deviceModels.id, id)).returning();
  if (!row) throw new NotFound('Modelo');
  return row;
}

export async function restoreModel(db: Db, id: string) {
  const [row] = await db.update(deviceModels).set({ deletedAt: null }).where(eq(deviceModels.id, id)).returning();
  if (!row) throw new NotFound('Modelo');
  return row;
}

/** Guarda (ou troca) a foto do modelo. Recebe a imagem embutida como "data:...;base64,...". */
export async function saveModelImage(db: Db, modelId: string, dataUrl: string) {
  const [model] = await db.select({ id: deviceModels.id, name: deviceModels.name }).from(deviceModels).where(eq(deviceModels.id, modelId));
  if (!model) throw new NotFound('Modelo');
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new BadRequest('Imagem em formato inesperado');
  const [, mimeType, base64] = m as unknown as [string, string, string];
  const sizeBytes = Math.floor((base64.length * 3) / 4);
  if (sizeBytes > 512 * 1024) throw new BadRequest('Imagem muito grande (máximo 512 KB)');
  const vals = { mimeType, dataBase64: base64, sizeBytes, updatedAt: new Date() };
  await db.insert(deviceModelImages).values({ modelId, ...vals }).onConflictDoUpdate({ target: deviceModelImages.modelId, set: vals });
  return { modelName: model.name, sizeBytes };
}

export async function readModelImage(db: Db, modelId: string) {
  const [row] = await db.select().from(deviceModelImages).where(eq(deviceModelImages.modelId, modelId));
  if (!row) throw new NotFound('Foto');
  return { mimeType: row.mimeType, buffer: Buffer.from(row.dataBase64, 'base64'), updatedAt: row.updatedAt };
}

export async function removeModelImage(db: Db, modelId: string) {
  const [row] = await db.delete(deviceModelImages).where(eq(deviceModelImages.modelId, modelId)).returning();
  if (!row) throw new NotFound('Foto');
  const [model] = await db.select({ name: deviceModels.name }).from(deviceModels).where(eq(deviceModels.id, modelId));
  return { modelName: model?.name ?? modelId };
}

// ---------- Aparelhos ----------

/**
 * `clientId`: vazio = todos · `stock` = só o estoque · `clients` = só os que estão com algum
 * cliente · um id = só os daquele cliente.
 */
export type FiltroAparelhos = { q?: string; modelId?: string; clientId?: string | 'stock' | 'clients'; condition?: string; includeSold?: boolean };

/**
 * Os filtros da aba Aparelhos viram condições de SQL. A MESMA função alimenta a lista e os
 * cartões de resumo do topo — filtrou por modelo ou cliente, os números acompanham.
 */
function filtrosAparelhos(q: FiltroAparelhos): SQL[] {
  const conds: SQL[] = [isNull(devices.deletedAt)];
  if (q.modelId) conds.push(eq(devices.modelId, q.modelId));
  if (q.clientId === 'stock') conds.push(isNull(devices.clientId));
  else if (q.clientId === 'clients') conds.push(sql`${devices.clientId} is not null`);
  else if (q.clientId) conds.push(eq(devices.clientId, q.clientId));
  if (q.condition) conds.push(eq(devices.condition, q.condition));
  // vendido já não é nosso: fica fora da lista, a menos que se peça
  if (!q.includeSold) conds.push(sql`coalesce(${devices.currentModality}, '') <> 'venda'`);
  if (q.q) {
    const mac = q.q.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
    const serie = serieLimpa(q.q);
    conds.push(or(
      // pedaço de MAC só a partir de 4 caracteres: "HS-002" não deve achar todo MAC com "002"
      mac.length >= 4 ? ilike(devices.mac, `%${mac}%`) : sql`false`,
      serie ? ilike(devices.serialNumber, `%${serie}%`) : sql`false`,
      ilike(devices.ip, `%${q.q}%`), ilike(devices.unit, `%${q.q}%`), ilike(devices.note, `%${q.q}%`),
    )!);
  }
  return conds;
}

/**
 * Resumo do inventário para os cartões do topo: em estoque, com clientes, inativos e o valor
 * dos aparelhos que estão com clientes. Respeita os mesmos filtros da lista.
 */
export async function summary(db: Db, q: FiltroAparelhos = {}) {
  const semFiltro = !q.q && !q.modelId && !q.clientId && !q.condition;
  const base = filtrosAparelhos({ ...q, condition: undefined });
  const [d] = await db
    .select({
      inStock: sql<number>`count(*) filter (where ${devices.clientId} is null)`,
      withClients: sql<number>`count(*) filter (where ${devices.clientId} is not null)`,
      inactive: sql<number>`count(*) filter (where ${devices.condition} = 'inativo')`,
      valueWithClients: sql<number>`coalesce(sum(${valorDoAparelho}) filter (where ${devices.clientId} is not null and ${devices.currentModality} in ('locacao','comodato')),0)`,
    })
    .from(devices).innerJoin(deviceModels, eq(deviceModels.id, devices.modelId)).where(and(...base));
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
    // MAC / N/S: quem tem MAC, pelo MAC; quem não tem, pelo número de série
    mac: sql`coalesce(${devices.mac}, ${devices.serialNumber})`,
    modelName: sql`lower(${deviceModels.name})`,
    clientName: sql`lower(${clients.tradeName})`,
    currentModality: sql`${devices.currentModality}`,
    condition: sql`${devices.condition}`,
    ip: sql`${devices.ip}`,
    unit: sql`lower(${devices.unit})`,
    note: sql`lower(${devices.note})`,
    valueCents: sql`${valorDoAparelho}`,
    createdAt: sql`${devices.createdAt}`,
  };
  const campo = colunas[q.sort ?? 'modelName'] ?? colunas.modelName!;
  return sql`${campo} ${dir} nulls last, ${devices.mac} asc nulls last, ${devices.serialNumber} asc nulls last, ${devices.createdAt} asc`;
}

const camposAparelho = {
  d: devices, modelName: deviceModels.name, modelCode: deviceModels.code, modelValueCents: deviceModels.valueCents,
  clientName: clients.tradeName, fotoEm: deviceModelImages.updatedAt,
};

type LinhaAparelho = { d: typeof devices.$inferSelect; modelName: string; modelCode: string; modelValueCents: number | null; clientName: string | null; fotoEm: Date | null };

/**
 * O aparelho como a tela o recebe. `valueCents` é o valor que VALE (próprio ou do modelo);
 * `ownValueCents` é só o próprio, para o formulário de edição.
 */
function formatarAparelho(r: LinhaAparelho) {
  const id = identificacaoAparelho({ mac: r.d.mac, serialNumber: r.d.serialNumber });
  return {
    ...r.d,
    macFormatted: macFormatado(r.d.mac),
    identificacao: id.texto,
    identificacaoTipo: id.tipo,
    valueCents: r.d.valueCents ?? r.modelValueCents,
    ownValueCents: r.d.valueCents,
    modelValueCents: r.modelValueCents,
    modelName: r.modelName, modelCode: r.modelCode, modelImageUrl: fotoPath(r.d.modelId, r.fotoEm),
    clientName: r.clientName,
  };
}

export async function listDevices(db: Db, q: FiltroAparelhos & { page: number; pageSize: number; sort?: string; dir?: string }) {
  const where = and(...filtrosAparelhos(q));
  const rows = await db
    .select(camposAparelho)
    .from(devices).innerJoin(deviceModels, eq(deviceModels.id, devices.modelId)).leftJoin(clients, eq(clients.id, devices.clientId))
    .leftJoin(deviceModelImages, eq(deviceModelImages.modelId, devices.modelId))
    .where(where).orderBy(ordenacaoAparelhos(q)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(devices).where(where);
  return { items: rows.map(formatarAparelho), total: Number(c?.n ?? 0), page: q.page, pageSize: q.pageSize };
}

export async function getDevice(db: Db, id: string) {
  const [r] = await db
    .select(camposAparelho)
    .from(devices).innerJoin(deviceModels, eq(deviceModels.id, devices.modelId)).leftJoin(clients, eq(clients.id, devices.clientId))
    .leftJoin(deviceModelImages, eq(deviceModelImages.modelId, devices.modelId))
    .where(eq(devices.id, id));
  if (!r) throw new NotFound('Aparelho');
  const from = alias(clients, 'from'), to = alias(clients, 'to');
  const history = await db
    .select({ id: deviceMovements.id, modality: deviceMovements.modality, fromName: from.tradeName, toName: to.tradeName, unit: deviceMovements.unit, newCondition: deviceMovements.newCondition, note: deviceMovements.note, userName: users.name, createdAt: deviceMovements.createdAt })
    .from(deviceMovementItems).innerJoin(deviceMovements, eq(deviceMovements.id, deviceMovementItems.movementId))
    .leftJoin(from, eq(from.id, deviceMovements.fromClientId)).leftJoin(to, eq(to.id, deviceMovements.toClientId)).innerJoin(users, eq(users.id, deviceMovements.userId))
    .where(eq(deviceMovementItems.deviceId, id)).orderBy(desc(deviceMovements.createdAt));
  const recibos = await recibosDe(db, history.map((h) => h.id));
  return { ...formatarAparelho(r), history: history.map((h) => ({ ...h, modalityName: (MODALIDADES as any)[h.modality] ?? h.modality, recibos: recibos.get(h.id) ?? [] })) };
}

/** Número de série não se repete dentro do mesmo modelo. */
async function serieLivre(db: Db, modelId: string, serie: string, exceto?: string) {
  const [dup] = await db.select({ id: devices.id }).from(devices)
    .where(and(eq(devices.modelId, modelId), eq(devices.serialNumber, serie), isNull(devices.deletedAt))).limit(1);
  if (dup && dup.id !== exceto) throw new BadRequest(`Já existe um aparelho deste modelo com o N/S ${serie}`);
}

export async function createDevice(db: Db, data: AparelhoGravar) {
  const [model] = await db.select().from(deviceModels).where(eq(deviceModels.id, data.modelId));
  if (!model) throw new NotFound('Modelo');
  // sem MAC é caso normal (headset, cabo): só checa duplicidade quando há MAC
  if (data.mac) {
    const [dup] = await db.select({ id: devices.id }).from(devices).where(eq(devices.mac, data.mac));
    if (dup) throw new BadRequest(`Já existe um aparelho com o MAC ${macFormatado(data.mac)}`);
  }
  if (data.serialNumber) await serieLivre(db, data.modelId, data.serialNumber);
  const [row] = await db.insert(devices).values({ id: newId(), ...data, mac: data.mac ?? null, serialNumber: data.serialNumber ?? null }).returning();
  return row!;
}

/**
 * Cadastro em massa. Confere a lista inteira ANTES de gravar: item inválido, repetido na
 * própria lista ou já cadastrado faz a operação toda ser recusada, com a lista do que barrou.
 */
export async function createDevicesBulk(db: Db, data: AparelhosEmMassa) {
  const [model] = await db.select().from(deviceModels).where(and(eq(deviceModels.id, data.modelId), isNull(deviceModels.deletedAt)));
  if (!model) throw new NotFound('Modelo');
  const base = { modelId: model.id, condition: data.condition, note: data.note ?? null };

  if (data.tipo === 'nenhum') {
    const n = data.quantidade ?? 0;
    if (n < 1) throw new BadRequest('Informe quantos aparelhos cadastrar');
    const linhas = Array.from({ length: n }, () => ({ id: newId(), ...base }));
    await db.insert(devices).values(linhas);
    return { created: n, modelName: model.name, tipo: data.tipo };
  }

  const limpos = data.valores.map((v) => (data.tipo === 'mac' ? macLimpo(v) : serieLimpa(v)));
  if (!limpos.length) throw new BadRequest(data.tipo === 'mac' ? 'Cole pelo menos um MAC' : 'Cole pelo menos um número de série');
  const problemas: string[] = [];
  const vistos = new Set<string>();
  limpos.forEach((v, i) => {
    const original = data.valores[i]!;
    if (data.tipo === 'mac' && !macValido(v)) problemas.push(`${original}: MAC inválido (precisa ter 12 caracteres hexadecimais)`);
    else if (data.tipo === 'serie' && (v.length < 2 || v.length > 80)) problemas.push(`${original}: número de série inválido`);
    else if (vistos.has(v)) problemas.push(`${original}: repetido na lista`);
    vistos.add(v);
  });
  const unicos = [...vistos];
  const ja = data.tipo === 'mac'
    ? await db.select({ v: devices.mac }).from(devices).where(inArray(devices.mac, unicos.concat(['-'])))
    : await db.select({ v: devices.serialNumber }).from(devices).where(and(eq(devices.modelId, model.id), isNull(devices.deletedAt), inArray(devices.serialNumber, unicos.concat(['-']))));
  for (const j of ja) problemas.push(`${data.tipo === 'mac' ? macFormatado(j.v) : j.v}: já está cadastrado`);
  if (problemas.length) {
    throw new BadRequest(`Nada foi cadastrado: ${problemas.length} item(ns) com problema. Corrija e envie de novo.`, problemas.slice(0, 50).join('\n'));
  }
  const linhas = unicos.map((v) => ({ id: newId(), ...base, mac: data.tipo === 'mac' ? v : null, serialNumber: data.tipo === 'serie' ? v : null }));
  await db.transaction(async (tx) => {
    // em lotes, para não passar do limite de parâmetros do banco numa lista muito grande
    for (let i = 0; i < linhas.length; i += 500) await tx.insert(devices).values(linhas.slice(i, i + 500));
  });
  return { created: linhas.length, modelName: model.name, tipo: data.tipo };
}

export async function updateDevice(db: Db, id: string, data: Partial<AparelhoGravar>) {
  const [before] = await db.select().from(devices).where(eq(devices.id, id));
  if (!before) throw new NotFound('Aparelho');
  if (data.mac && data.mac !== before.mac) {
    const [dup] = await db.select({ id: devices.id }).from(devices).where(eq(devices.mac, data.mac));
    if (dup) throw new BadRequest('Já existe um aparelho com este MAC');
  }
  if (data.serialNumber && data.serialNumber !== before.serialNumber) await serieLivre(db, before.modelId, data.serialNumber, id);
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

/** Nome curto do aparelho para mensagens e auditoria: MAC, N/S, ou o modelo. */
export function nomeAparelho(d: { mac: string | null; serialNumber?: string | null }, modelo = 'aparelho sem identificação') {
  if (d.mac) return macFormatado(d.mac);
  if (d.serialNumber) return `N/S ${d.serialNumber}`;
  return modelo;
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
    // a unidade escolhida entra na lista do cliente; sem escolha, vai para a Matriz
    const unidade = data.toClientId ? await unidadeDoCliente(tx, data.toClientId, data.unit) : null;
    const movementId = newId();
    let fromClientId: string | null | undefined = undefined;
    const items: (typeof deviceMovementItems.$inferInsert)[] = [];

    for (const it of data.items) {
      const [d] = await tx.select().from(devices).where(and(eq(devices.id, it.deviceId), isNull(devices.deletedAt)));
      if (!d) throw new NotFound('Aparelho');
      const nome = nomeAparelho(d, 'sem identificação');
      if (d.currentModality === 'venda') throw new BadRequest(`O aparelho ${nome} já foi vendido`);
      if (data.modality === 'devolucao' && !d.clientId) throw new BadRequest(`O aparelho ${nome} já está no estoque`);
      if (fromClientId === undefined) fromClientId = d.clientId;
      await tx.update(devices).set({
        clientId: data.toClientId,
        currentModality: data.toClientId ? data.modality : null,
        condition: data.newCondition ?? d.condition,
        // unidade só faz sentido com cliente; voltando ao estoque, limpa
        unit: unidade,
        updatedAt: new Date(),
      }).where(eq(devices.id, d.id));
      items.push({ id: newId(), movementId, modelId: d.modelId, deviceId: d.id });
    }

    await tx.insert(deviceMovements).values({ id: movementId, modality: data.modality, fromClientId: fromClientId ?? null, toClientId: data.toClientId, unit: unidade, newCondition: data.newCondition ?? null, note: data.note ?? null, userId });
    await tx.insert(deviceMovementItems).values(items);
    return { id: movementId, items: items.length, quantity: items.length, fromClientId: fromClientId ?? null, unit: unidade };
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
    unit: sql`lower(${deviceMovements.unit})`,
    userName: sql`lower(${users.name})`,
  };
  const campo = colunas[q.sort ?? 'createdAt'] ?? colunas.createdAt!;
  return sql`${campo} ${dir} nulls last, ${deviceMovements.createdAt} desc`;
}

/**
 * `modelId` = só as movimentações que levaram pelo menos um aparelho daquele modelo.
 * `q` = MAC ou N/S: as movimentações por onde aquele aparelho passou (a vida dele, em ordem).
 */
export async function listMovements(db: Db, q: { modality?: string; clientId?: string; modelId?: string; q?: string; from?: Date; to?: Date; page: number; pageSize: number; sort?: string; dir?: string }) {
  const fromC = alias(clients, 'from'), toC = alias(clients, 'to');
  const conds: SQL[] = [];
  if (q.modality) conds.push(eq(deviceMovements.modality, q.modality));
  if (q.clientId) conds.push(or(eq(deviceMovements.fromClientId, q.clientId), eq(deviceMovements.toClientId, q.clientId))!);
  if (q.modelId) conds.push(inArray(deviceMovements.id, db.select({ id: deviceMovementItems.movementId }).from(deviceMovementItems).where(eq(deviceMovementItems.modelId, q.modelId))));
  if (q.q) {
    const mac = q.q.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
    const serie = serieLimpa(q.q);
    const bate = or(
      // o mesmo critério da busca de aparelhos: pedaço de MAC só a partir de 4 caracteres
      mac.length >= 4 ? ilike(devices.mac, `%${mac}%`) : sql`false`,
      serie ? ilike(devices.serialNumber, `%${serie}%`) : sql`false`,
    )!;
    conds.push(inArray(deviceMovements.id, db.select({ id: deviceMovementItems.movementId }).from(deviceMovementItems).innerJoin(devices, eq(devices.id, deviceMovementItems.deviceId)).where(bate)));
  }
  if (q.from) conds.push(gte(deviceMovements.createdAt, q.from));
  if (q.to) conds.push(lte(deviceMovements.createdAt, q.to));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({ id: deviceMovements.id, modality: deviceMovements.modality, fromClientId: deviceMovements.fromClientId, fromName: fromC.tradeName, toClientId: deviceMovements.toClientId, toName: toC.tradeName, unit: deviceMovements.unit, newCondition: deviceMovements.newCondition, note: deviceMovements.note, userName: users.name, createdAt: deviceMovements.createdAt })
    .from(deviceMovements).leftJoin(fromC, eq(fromC.id, deviceMovements.fromClientId)).leftJoin(toC, eq(toC.id, deviceMovements.toClientId)).innerJoin(users, eq(users.id, deviceMovements.userId))
    .where(where).orderBy(ordenacaoMovimentacoes(q, fromC, toC)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const ids = rows.map((r) => r.id).concat(['-']);
  // cada aparelho de cada movimentação, para a tela poder abrir e mostrar quais foram
  const itens = await db
    .select({ movementId: deviceMovementItems.movementId, deviceId: devices.id, mac: devices.mac, serialNumber: devices.serialNumber, modelName: deviceModels.name })
    .from(deviceMovementItems)
    .innerJoin(deviceModels, eq(deviceModels.id, deviceMovementItems.modelId))
    .innerJoin(devices, eq(devices.id, deviceMovementItems.deviceId))
    .where(inArray(deviceMovementItems.movementId, ids))
    .orderBy(asc(deviceModels.name), asc(devices.mac), asc(devices.serialNumber));
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(deviceMovements).where(where);
  const recibos = await recibosDe(db, rows.map((r) => r.id));
  return {
    items: rows.map((r) => {
      const meus = itens.filter((i) => i.movementId === r.id);
      const porModelo = new Map<string, number>();
      for (const i of meus) porModelo.set(i.modelName, (porModelo.get(i.modelName) ?? 0) + 1);
      return {
        ...r,
        modalityName: (MODALIDADES as any)[r.modality] ?? r.modality,
        items: [...porModelo.entries()].map(([modelName, quantity]) => ({ modelName, quantity })),
        devices: meus.map((i) => ({ id: i.deviceId, modelName: i.modelName, identificacao: identificacaoAparelho(i).texto })),
        recibos: recibos.get(r.id) ?? [],
      };
    }),
    total: Number(c?.n ?? 0), page: q.page, pageSize: q.pageSize,
  };
}

// ---------- Recibo de entrega (Patch 1.9, decisão 0042) ----------

/** "à locação para Hospital Vale Verde" — para a auditoria dizer de qual movimentação. */
export function aMovimentacao(m: { modality: string; toName: string | null }, de = false) {
  const artigo: Record<string, [string, string]> = { locacao: ['à', 'da'], venda: ['à', 'da'], comodato: ['ao', 'do'] };
  const [a, da] = artigo[m.modality] ?? ['à', 'da'];
  return `${de ? da : a} ${((MODALIDADES as Record<string, string>)[m.modality] ?? m.modality).toLowerCase()} para ${m.toName ?? 'o cliente'}`;
}

/** Os dados de um recibo para a tela (nunca o arquivo): o endereço baixa ou abre. */
function formatarRecibo(r: { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: Date; quem: string | null }) {
  return { id: r.id, fileName: r.fileName, mimeType: r.mimeType, sizeBytes: r.sizeBytes, createdAt: r.createdAt.toISOString(), url: `inventory/recibos/${r.id}`, quem: r.quem };
}
export type ReciboDaMovimentacao = ReturnType<typeof formatarRecibo>;

/** Os recibos de cada movimentação (sem o conteúdo, que pesa), na ordem em que foram anexados. */
async function recibosDe(db: Db, movementIds: string[]) {
  const porMovimentacao = new Map<string, ReciboDaMovimentacao[]>();
  if (!movementIds.length) return porMovimentacao;
  const rows = await db
    .select({ id: deviceMovementReceipts.id, movementId: deviceMovementReceipts.movementId, fileName: deviceMovementReceipts.fileName, mimeType: deviceMovementReceipts.mimeType, sizeBytes: deviceMovementReceipts.sizeBytes, createdAt: deviceMovementReceipts.createdAt, quem: users.name })
    .from(deviceMovementReceipts).leftJoin(users, eq(users.id, deviceMovementReceipts.uploadedById))
    .where(and(inArray(deviceMovementReceipts.movementId, movementIds), isNull(deviceMovementReceipts.deletedAt)))
    .orderBy(asc(deviceMovementReceipts.createdAt));
  for (const r of rows) {
    const l = porMovimentacao.get(r.movementId);
    if (l) l.push(formatarRecibo(r)); else porMovimentacao.set(r.movementId, [formatarRecibo(r)]);
  }
  return porMovimentacao;
}

/**
 * Anexa um arquivo do recibo de entrega. Só na movimentação para um cliente, até 5 arquivos, PDF
 * ou foto de verdade (pelos primeiros bytes: o tipo que fica guardado é o de verdade, não o que o
 * navegador disse).
 */
export async function anexarRecibo(db: Db, movementId: string, userId: string, d: ReciboAnexar) {
  const [mov] = await db.select({ id: deviceMovements.id, modality: deviceMovements.modality, toClientId: deviceMovements.toClientId, toName: clients.tradeName })
    .from(deviceMovements).leftJoin(clients, eq(clients.id, deviceMovements.toClientId)).where(eq(deviceMovements.id, movementId));
  if (!mov) throw new NotFound('Movimentação');
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(deviceMovementReceipts).where(and(eq(deviceMovementReceipts.movementId, movementId), isNull(deviceMovementReceipts.deletedAt)));
  const naoPode = problemaParaAnexar(mov, Number(c?.n ?? 0));
  if (naoPode) throw new BadRequest(naoPode);
  const { dataBase64 } = lerConteudo(d.conteudo);
  const buffer = Buffer.from(dataBase64, 'base64');
  const mimeType = tipoDoRecibo(buffer);
  const problema = problemaDoRecibo({ nome: d.fileName, tipo: mimeType ?? '', bytes: buffer.length });
  if (problema || !mimeType) throw new BadRequest(problema ?? 'Não consegui ler esse arquivo');
  const [row] = await db.insert(deviceMovementReceipts).values({
    id: newId(), movementId, fileName: d.fileName, mimeType, sizeBytes: buffer.length, dataBase64, uploadedById: userId,
  }).returning();
  const [quem] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return { recibo: formatarRecibo({ ...row!, quem: quem?.name ?? null }), movimentacao: mov };
}

/** O arquivo de um recibo (o tirado não abre mais). */
export async function lerRecibo(db: Db, id: string) {
  const [row] = await db.select().from(deviceMovementReceipts).where(and(eq(deviceMovementReceipts.id, id), isNull(deviceMovementReceipts.deletedAt)));
  if (!row) throw new NotFound('Recibo');
  return { ...row, buffer: Buffer.from(row.dataBase64, 'base64'), imagem: row.mimeType.startsWith('image/') };
}

/** Tira o recibo da tela: ele fica guardado (nada se apaga de verdade) e o motivo vai para a auditoria. */
export async function tirarRecibo(db: Db, id: string) {
  const [row] = await db.select({ id: deviceMovementReceipts.id, movementId: deviceMovementReceipts.movementId, fileName: deviceMovementReceipts.fileName, modality: deviceMovements.modality, toName: clients.tradeName })
    .from(deviceMovementReceipts).innerJoin(deviceMovements, eq(deviceMovements.id, deviceMovementReceipts.movementId)).leftJoin(clients, eq(clients.id, deviceMovements.toClientId))
    .where(and(eq(deviceMovementReceipts.id, id), isNull(deviceMovementReceipts.deletedAt)));
  if (!row) throw new NotFound('Recibo');
  await db.update(deviceMovementReceipts).set({ deletedAt: new Date() }).where(eq(deviceMovementReceipts.id, id));
  return row;
}

// ---------- Relatórios (Patch 1.9, decisão 0041) ----------

/**
 * Os relatórios do Inventário. Lê do banco o que as contas precisam e chama as MESMAS contas da
 * prévia (`relatoriosInventario`, em @gestor/shared) — assim o número da prévia é o do sistema.
 * Lê tudo de uma vez: o inventário é pequeno (centenas de aparelhos) e a conta em memória é a mesma
 * nos dois lugares. Os da lixeira (aparelho, login) ficam de fora; o cliente na lixeira
 * entra, marcado, porque aparelho nosso pode ter ficado com ele.
 */
export async function relatorios(db: Db, agora = new Date()) {
  const [aps, mods, cls, subs, redes, logins, movs, itens] = await Promise.all([
    db.select({
      id: devices.id, modelId: devices.modelId, mac: devices.mac, serialNumber: devices.serialNumber, clientId: devices.clientId, unit: devices.unit,
      currentModality: devices.currentModality, condition: devices.condition, valueCents: devices.valueCents, ip: devices.ip, note: devices.note, createdAt: devices.createdAt,
    }).from(devices).where(isNull(devices.deletedAt)),
    db.select({ id: deviceModels.id, name: deviceModels.name, valueCents: deviceModels.valueCents, categoryName: deviceCategories.name, fotoEm: deviceModelImages.updatedAt })
      .from(deviceModels).leftJoin(deviceCategories, eq(deviceCategories.id, deviceModels.categoryId)).leftJoin(deviceModelImages, eq(deviceModelImages.modelId, deviceModels.id)),
    db.select({ id: clients.id, nome: clients.tradeName, interno: clients.isInternal, arquivado: clients.archived, deletedAt: clients.deletedAt }).from(clients),
    db.select({ clientId: subscriptions.clientId, code: products.code, deactivatedAt: subscriptions.deactivatedAt }).from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId)),
    db.select({ clientId: clientNetworkSettings.clientId, ip: clientNetworkSettings.ipAddress, mascara: clientNetworkSettings.subnetMask, roteador: clientNetworkSettings.defaultRouter, dns: clientNetworkSettings.dns1 }).from(clientNetworkSettings),
    db.select({ clientId: clientDeviceLogins.clientId, modelId: clientDeviceLogins.modelId }).from(clientDeviceLogins).where(isNull(clientDeviceLogins.deletedAt)),
    db.select({ id: deviceMovements.id, modality: deviceMovements.modality, fromClientId: deviceMovements.fromClientId, toClientId: deviceMovements.toClientId, unit: deviceMovements.unit, newCondition: deviceMovements.newCondition, createdAt: deviceMovements.createdAt }).from(deviceMovements),
    db.select({ movementId: deviceMovementItems.movementId, deviceId: deviceMovementItems.deviceId }).from(deviceMovementItems),
  ]);

  // a mesma regra do portal do cliente: ativa = sem encerramento, ou encerramento ainda por vir
  const ativa = (d: Date | null) => !d || d > agora;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const doCliente = <T extends { clientId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) { const l = m.get(x.clientId); if (l) l.push(x); else m.set(x.clientId, [x]); }
    return m;
  };
  const subsDe = doCliente(subs), loginsDe = doCliente(logins);
  const redeDe = new Map(redes.map((r) => [r.clientId, !!(r.ip || r.mascara || r.roteador || r.dns)]));
  const itensDe = new Map<string, string[]>();
  for (const i of itens) { const l = itensDe.get(i.movementId); if (l) l.push(i.deviceId); else itensDe.set(i.movementId, [i.deviceId]); }

  const base: BaseInventario = {
    agora,
    aparelhos: aps.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    modelos: mods.map((m) => ({ id: m.id, name: m.name, valueCents: m.valueCents, categoryName: m.categoryName, temFoto: !!m.fotoEm })),
    clientes: cls.map((c) => {
      const s = subsDe.get(c.id) ?? [];
      return {
        id: c.id, nome: c.nome, interno: c.interno, arquivado: c.arquivado,
        naLixeiraDesde: iso(c.deletedAt),
        temEquipamentos: s.some((x) => x.code === 'equipamentos' && ativa(x.deactivatedAt)),
        produtosAtivos: s.filter((x) => ativa(x.deactivatedAt)).length,
        temRedePadrao: redeDe.get(c.id) ?? false,
        modelosComLogin: (loginsDe.get(c.id) ?? []).map((l) => l.modelId),
      };
    }),
    movimentacoes: movs.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), deviceIds: itensDe.get(m.id) ?? [] })),
  };
  return relatoriosInventario(base);
}
