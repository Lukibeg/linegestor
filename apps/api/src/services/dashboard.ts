/**
 * Painel inicial e busca global.
 *
 * O painel responde "o que precisa de atenção hoje?": números-chave, circuitos perto do limite,
 * inconsistências de cadastro e as últimas movimentações.
 */
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { auditLog, carriers, circuits, clients, deviceModels, deviceMovements, devices, dids, linepbxSettings, products, subscriptions, users, type Db } from '@gestor/db';
import { didFormatado, macFormatado, MODALIDADES } from '@gestor/shared';

export async function summary(db: Db) {
  const activeClient = and(isNull(clients.deletedAt), eq(clients.archived, false), eq(clients.isInternal, false));
  // O painel é o controle da VoiceNet: link de terceiro (tronco que o cliente contratou de outra
  // operadora) fica de fora de tudo aqui, senão polui os números e inventa inconsistência.
  const semTerceiro = sql`(${dids.circuitId} is null or ${dids.circuitId} not in (select ${circuits.id} from ${circuits} where ${circuits.thirdParty} = true))`;

  const [cl] = await db.select({ n: sql<number>`count(*)` }).from(clients).where(activeClient);
  const byProduct = await db
    .select({ code: products.code, name: products.name, color: products.color, n: sql<number>`count(distinct ${subscriptions.clientId})` })
    .from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId)).innerJoin(clients, eq(clients.id, subscriptions.clientId))
    .where(and(isNull(subscriptions.deactivatedAt), activeClient, isNull(products.deletedAt))).groupBy(products.code, products.name, products.color, products.sortOrder).orderBy(products.sortOrder);

  const [d] = await db.select({ total: sql<number>`count(*)`, assigned: sql<number>`count(${dids.clientId})` }).from(dids).where(and(isNull(dids.deletedAt), semTerceiro));

  const occ = await db
    .select({ id: circuits.id, name: circuits.name, carrierName: carriers.name, channels: circuits.channels, total: sql<number>`count(${dids.id})`, assigned: sql<number>`count(${dids.clientId})` })
    .from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).leftJoin(dids, and(eq(dids.circuitId, circuits.id), isNull(dids.deletedAt)))
    .where(and(isNull(circuits.deletedAt), eq(circuits.thirdParty, false))).groupBy(circuits.id, carriers.name);
  const circuitsView = occ.map((c) => ({ ...c, total: Number(c.total), assigned: Number(c.assigned), free: Number(c.total) - Number(c.assigned) }));

  // vendido não conta: já não é nosso
  const [dev] = await db.select({
    inStock: sql<number>`count(*) filter (where ${devices.clientId} is null)`,
    withClients: sql<number>`count(*) filter (where ${devices.clientId} is not null and coalesce(${devices.currentModality}, '') <> 'venda')`,
    inactive: sql<number>`count(*) filter (where ${devices.condition} = 'inativo')`,
    valueWithClients: sql<number>`coalesce(sum(coalesce(${devices.valueCents}, ${deviceModels.valueCents})) filter (where ${devices.clientId} is not null and ${devices.currentModality} in ('locacao','comodato')),0)`,
  }).from(devices).innerJoin(deviceModels, eq(deviceModels.id, devices.modelId)).where(isNull(devices.deletedAt));

  // ---- alertas de consistência ----
  const alerts: Array<{ kind: string; severity: 'warning' | 'critical'; message: string; count: number; link: string }> = [];
  const lpNoAddr = await db
    .select({ n: sql<number>`count(*)` })
    .from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId)).innerJoin(clients, eq(clients.id, subscriptions.clientId))
    .leftJoin(linepbxSettings, eq(linepbxSettings.subscriptionId, subscriptions.id))
    .where(and(eq(products.code, 'linepbx'), isNull(subscriptions.deactivatedAt), activeClient, sql`coalesce(${linepbxSettings.domain}, ${linepbxSettings.serverIp}) is null`));
  if (Number(lpNoAddr[0]?.n ?? 0)) alerts.push({ kind: 'linepbx_sem_endereco', severity: 'warning', message: 'Clientes com LinePBX sem endereço do servidor', count: Number(lpNoAddr[0]!.n), link: '/clientes?produtos=linepbx' });

  const voiceIds = db.select({ id: subscriptions.clientId }).from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId)).where(and(eq(products.code, 'voicenet'), isNull(subscriptions.deactivatedAt)));
  // o cliente com tronco próprio não é inconsistência: por isso o filtro de terceiro entra aqui também
  const [didNoVoice] = await db.select({ n: sql<number>`count(distinct ${dids.clientId})` }).from(dids).where(and(isNull(dids.deletedAt), semTerceiro, sql`${dids.clientId} is not null`, sql`${dids.clientId} not in ${voiceIds}`));
  if (Number(didNoVoice?.n ?? 0)) alerts.push({ kind: 'did_sem_voicenet', severity: 'warning', message: 'Clientes com DIDs alocados mas sem o produto VoiceNet', count: Number(didNoVoice!.n), link: '/circuitos?aba=numeracao' });

  const equipIds = db.select({ id: subscriptions.clientId }).from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId)).where(and(eq(products.code, 'equipamentos'), isNull(subscriptions.deactivatedAt)));
  const [devNoEquip] = await db.select({ n: sql<number>`count(distinct ${devices.clientId})` }).from(devices).where(and(isNull(devices.deletedAt), sql`${devices.clientId} is not null`, sql`${devices.clientId} not in ${equipIds}`));
  if (Number(devNoEquip?.n ?? 0)) alerts.push({ kind: 'aparelho_sem_equipamentos', severity: 'warning', message: 'Clientes com aparelhos mas sem o produto Equipamentos', count: Number(devNoEquip!.n), link: '/inventario' });

  const zeroChannels = circuitsView.filter((c) => c.channels === 0 && c.total > 0);
  if (zeroChannels.length) alerts.push({ kind: 'circuito_sem_canais', severity: 'critical', message: 'Circuitos com DIDs mas 0 canais cadastrados', count: zeroChannels.length, link: '/circuitos' });
  if (Number(dev?.inactive ?? 0)) alerts.push({ kind: 'aparelho_inativo', severity: 'warning', message: 'Aparelhos inativos', count: Number(dev!.inactive), link: '/inventario?condicao=inativo' });

  const fromC = alias(clients, 'from'), toC = alias(clients, 'to');
  const recentMovements = await db
    .select({ id: deviceMovements.id, modality: deviceMovements.modality, fromName: fromC.tradeName, toName: toC.tradeName, userName: users.name, createdAt: deviceMovements.createdAt })
    .from(deviceMovements).leftJoin(fromC, eq(fromC.id, deviceMovements.fromClientId)).leftJoin(toC, eq(toC.id, deviceMovements.toClientId)).innerJoin(users, eq(users.id, deviceMovements.userId))
    .orderBy(desc(deviceMovements.createdAt)).limit(6);
  const recentAudit = await db
    .select({ id: auditLog.id, action: auditLog.action, summary: auditLog.summary, userName: users.name, createdAt: auditLog.createdAt })
    .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).where(sql`${auditLog.action} not in ('login','logout','login_failed')`).orderBy(desc(auditLog.createdAt)).limit(8);

  return {
    clients: { active: Number(cl?.n ?? 0), byProduct: byProduct.map((p) => ({ ...p, n: Number(p.n) })) },
    dids: { total: Number(d?.total ?? 0), assigned: Number(d?.assigned ?? 0), free: Number(d?.total ?? 0) - Number(d?.assigned ?? 0) },
    circuits: circuitsView.sort((a, b) => b.total - a.total),
    devices: {
      inStock: Number(dev?.inStock ?? 0), withClients: Number(dev?.withClients ?? 0),
      inactive: Number(dev?.inactive ?? 0), valueWithClientsCents: Number(dev?.valueWithClients ?? 0),
    },
    alerts,
    recentMovements: recentMovements.map((m) => ({ ...m, modalityName: (MODALIDADES as any)[m.modality] ?? m.modality })),
    recentAudit,
  };
}

/** Busca global: um termo, resultados agrupados por tipo. */
export async function search(db: Db, term: string) {
  const t = term.trim();
  if (!t) return { clients: [], dids: [], circuits: [], devices: [] };
  const like = `%${t}%`;
  const digits = t.replace(/\D/g, '');
  const hex = t.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  const [cl, dd, cc, dv] = await Promise.all([
    db.select({ id: clients.id, name: clients.tradeName, legalName: clients.legalName, cnpj: clients.cnpj }).from(clients)
      .where(and(isNull(clients.deletedAt), eq(clients.isInternal, false), or(ilike(clients.tradeName, like), ilike(clients.legalName, like), digits ? ilike(clients.cnpj, `%${digits}%`) : sql`false`))).limit(8),
    digits.length >= 3
      ? db.select({ id: dids.id, number: dids.number, clientName: clients.tradeName, circuitName: circuits.name }).from(dids).leftJoin(clients, eq(clients.id, dids.clientId)).leftJoin(circuits, eq(circuits.id, dids.circuitId))
          .where(and(isNull(dids.deletedAt), ilike(dids.number, `%${digits}%`))).limit(8)
      : Promise.resolve([]),
    db.select({ id: circuits.id, name: circuits.name, code: circuits.code, carrierName: carriers.name }).from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId))
      .where(and(isNull(circuits.deletedAt), or(ilike(circuits.name, like), ilike(circuits.code, like)))).limit(8),
    hex.length >= 4 || t.length >= 2
      ? db.select({ id: devices.id, mac: devices.mac, serialNumber: devices.serialNumber, unit: devices.unit, modelName: deviceModels.name, clientName: clients.tradeName }).from(devices).innerJoin(deviceModels, eq(deviceModels.id, devices.modelId)).leftJoin(clients, eq(clients.id, devices.clientId))
          .where(and(isNull(devices.deletedAt), or(hex.length >= 4 ? ilike(devices.mac, `%${hex}%`) : sql`false`, ilike(devices.serialNumber, like), ilike(devices.unit, like)))).limit(8)
      : Promise.resolve([]),
  ]);
  return {
    clients: cl,
    dids: dd.map((x) => ({ ...x, numberFormatted: didFormatado(x.number) })),
    circuits: cc,
    devices: dv.map((x) => ({ ...x, macFormatted: x.mac ? macFormatado(x.mac) : x.serialNumber ? `N/S ${x.serialNumber}` : 'sem identificação' })),
  };
}
