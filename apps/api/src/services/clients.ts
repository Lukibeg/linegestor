/**
 * Clientes e suas assinaturas de produto.
 *
 * Regras que vivem aqui:
 *  - listar aceita busca por nome/CNPJ, filtro de produtos em modo OR ("tem qualquer um") ou AND ("tem todos"),
 *    e esconde arquivados e internos por padrão
 *  - os atalhos de acesso (web, SSH, FOP2) são montados a partir da configuração do LinePBX/FOP2 —
 *    nunca carregam senha na URL
 *  - marcar um produto cria a assinatura; desmarcar NÃO apaga: preenche `deactivatedAt` (histórico)
 *  - senhas nunca entram nas tabelas: vão para o cofre e a tabela guarda só o id do segredo
 */
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  clients, dids, devices, fop2Settings, hostingProviders, linepbxSettings, newId, omniboardSettings, products, subscriptions, szchatSettings, type Db,
} from '@gestor/db';
import type { AssinaturaGravar, ClienteAtualizar, ClienteCriar, ClienteListar } from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';
import type { SecretsVault } from './secrets.js';

export type ClientListItem = {
  id: string; tradeName: string; legalName: string; cnpj: string; logoUrl: string | null; archived: boolean; isInternal: boolean;
  products: Array<{ code: string; name: string; color: string }>;
  links: { web: string | null; ssh: string | null; fop2: string | null };
  didCount: number; deviceCount: number;
};

/** Monta os atalhos de acesso. Sem senha na URL — decisão de segurança S2. */
export function buildLinks(lp?: { domain: string | null; serverIp: string | null; sshUser: string | null; sshPort: number | null } | null, hasFop2 = false) {
  if (!lp) return { web: null, ssh: null, fop2: null };
  const host = lp.domain || lp.serverIp;
  if (!host) return { web: null, ssh: null, fop2: null };
  const sshHost = lp.serverIp || lp.domain;
  return {
    web: `https://${host}`,
    ssh: lp.sshUser ? `ssh://${lp.sshUser}@${sshHost}:${lp.sshPort ?? 22}` : null,
    fop2: hasFop2 ? `https://${host}/fop2/` : null,
  };
}

export async function list(db: Db, q: ClienteListar & { includeInternal?: boolean }) {
  const conds: SQL[] = [isNull(clients.deletedAt)];
  if (!q.includeArchived) conds.push(eq(clients.archived, false));
  if (!q.includeInternal) conds.push(eq(clients.isInternal, false));
  if (q.q) {
    const term = `%${q.q}%`;
    const digits = q.q.replace(/\D/g, '');
    conds.push(or(ilike(clients.tradeName, term), ilike(clients.legalName, term), digits ? ilike(clients.cnpj, `%${digits}%`) : sql`false`)!);
  }
  if (q.products.length) {
    // subconsulta: clientes que têm assinatura ativa dos produtos pedidos
    const sub = db
      .select({ clientId: subscriptions.clientId, n: sql<number>`count(distinct ${products.code})`.as('n') })
      .from(subscriptions)
      .innerJoin(products, eq(products.id, subscriptions.productId))
      .where(and(inArray(products.code, q.products), isNull(subscriptions.deactivatedAt)))
      .groupBy(subscriptions.clientId)
      .as('sub');
    const matched = db.select({ id: sub.clientId }).from(sub).where(q.mode === 'and' ? sql`${sub.n} >= ${q.products.length}` : sql`${sub.n} >= 1`);
    conds.push(inArray(clients.id, matched));
  }
  const where = and(...conds);
  const rows = await db.select().from(clients).where(where).orderBy(asc(clients.tradeName)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(clients).where(where);
  const items = await enrich(db, rows);
  return { items, total: Number(c?.n ?? 0), page: q.page, pageSize: q.pageSize };
}

/** Acrescenta produtos, atalhos e contagens a uma lista de clientes (em poucas consultas, não uma por cliente). */
async function enrich(db: Db, rows: (typeof clients.$inferSelect)[]): Promise<ClientListItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const subs = await db
    .select({ clientId: subscriptions.clientId, subId: subscriptions.id, code: products.code, name: products.name, color: products.color, sort: products.sortOrder })
    .from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId))
    .where(and(inArray(subscriptions.clientId, ids), isNull(subscriptions.deactivatedAt)))
    .orderBy(asc(products.sortOrder));
  const lps = await db.select().from(linepbxSettings).where(inArray(linepbxSettings.subscriptionId, subs.filter((s) => s.code === 'linepbx').map((s) => s.subId).concat(['-'])));
  const didCounts = await db.select({ clientId: dids.clientId, n: sql<number>`count(*)` }).from(dids).where(and(inArray(dids.clientId, ids), isNull(dids.deletedAt))).groupBy(dids.clientId);
  const devCounts = await db.select({ clientId: devices.clientId, n: sql<number>`count(*)` }).from(devices).where(and(inArray(devices.clientId, ids), isNull(devices.deletedAt))).groupBy(devices.clientId);
  return rows.map((r) => {
    const mine = subs.filter((s) => s.clientId === r.id);
    const lpSub = mine.find((s) => s.code === 'linepbx');
    const lp = lpSub ? lps.find((l) => l.subscriptionId === lpSub.subId) ?? null : null;
    return {
      id: r.id, tradeName: r.tradeName, legalName: r.legalName, cnpj: r.cnpj, logoUrl: r.logoUrl, archived: r.archived, isInternal: r.isInternal,
      products: mine.map((s) => ({ code: s.code, name: s.name, color: s.color })),
      links: buildLinks(lp, mine.some((s) => s.code === 'fop2')),
      didCount: Number(didCounts.find((d) => d.clientId === r.id)?.n ?? 0),
      deviceCount: Number(devCounts.find((d) => d.clientId === r.id)?.n ?? 0),
    };
  });
}

/** Ficha completa: dados + todas as assinaturas (ativas e encerradas) com a configuração de cada produto. */
export async function get(db: Db, id: string) {
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!row) throw new NotFound('Cliente');
  const subs = await db
    .select({
      id: subscriptions.id, productCode: products.code, productName: products.name, color: products.color, hasSettings: products.hasSettings,
      activatedAt: subscriptions.activatedAt, deactivatedAt: subscriptions.deactivatedAt, monthlyValueCents: subscriptions.monthlyValueCents, notes: subscriptions.notes, sort: products.sortOrder,
    })
    .from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId))
    .where(eq(subscriptions.clientId, id)).orderBy(asc(products.sortOrder));
  const subIds = subs.map((s) => s.id).concat(['-']);
  const [lps, f2s, oms, szs] = await Promise.all([
    db.select({ s: linepbxSettings, hostingName: hostingProviders.name }).from(linepbxSettings).leftJoin(hostingProviders, eq(hostingProviders.id, linepbxSettings.hostingId)).where(inArray(linepbxSettings.subscriptionId, subIds)),
    db.select().from(fop2Settings).where(inArray(fop2Settings.subscriptionId, subIds)),
    db.select().from(omniboardSettings).where(inArray(omniboardSettings.subscriptionId, subIds)),
    db.select().from(szchatSettings).where(inArray(szchatSettings.subscriptionId, subIds)),
  ]);
  const secretRef = (sid: string | null) => ({ hasSecret: !!sid, secretId: sid });
  const enriched = subs.map((s) => {
    let settings: Record<string, unknown> | null = null;
    if (s.productCode === 'linepbx') {
      const lp = lps.find((l) => l.s.subscriptionId === s.id);
      if (lp) settings = { hostingId: lp.s.hostingId, hostingName: lp.hostingName, serverIp: lp.s.serverIp, domain: lp.s.domain, sshUser: lp.s.sshUser, sshPort: lp.s.sshPort, sshPassword: secretRef(lp.s.sshPasswordSecretId) };
    } else if (s.productCode === 'fop2') {
      const f = f2s.find((x) => x.subscriptionId === s.id);
      if (f) settings = { adminExtension: f.adminExtension };
    } else if (s.productCode === 'omniboard') {
      const o = oms.find((x) => x.subscriptionId === s.id);
      if (o) settings = { adminLogin: o.adminLogin, adminPassword: secretRef(o.adminPasswordSecretId), userDefaultPassword: secretRef(o.userDefaultPasswordSecretId) };
    } else if (s.productCode === 'szchat') {
      const z = szs.find((x) => x.subscriptionId === s.id);
      if (z) settings = { adminLogin: z.adminLogin, adminPassword: secretRef(z.adminPasswordSecretId) };
    }
    return { ...s, active: !s.deactivatedAt, settings };
  });
  const lpActive = enriched.find((s) => s.productCode === 'linepbx' && s.active);
  const lpRow = lpActive ? lps.find((l) => l.s.subscriptionId === lpActive.id)?.s ?? null : null;
  const [didC] = await db.select({ n: sql<number>`count(*)` }).from(dids).where(and(eq(dids.clientId, id), isNull(dids.deletedAt)));
  const [devC] = await db.select({ n: sql<number>`count(*)` }).from(devices).where(and(eq(devices.clientId, id), isNull(devices.deletedAt)));
  return {
    ...row,
    subscriptions: enriched,
    links: buildLinks(lpRow, enriched.some((s) => s.productCode === 'fop2' && s.active)),
    didCount: Number(didC?.n ?? 0),
    deviceCount: Number(devC?.n ?? 0),
  };
}

export async function create(db: Db, data: ClienteCriar) {
  const [exists] = await db.select({ id: clients.id }).from(clients).where(eq(clients.cnpj, data.cnpj)).limit(1);
  if (exists) throw new BadRequest('Já existe um cliente com este CNPJ');
  const id = newId();
  const [row] = await db.insert(clients).values({ id, ...data }).returning();
  return row!;
}

export async function update(db: Db, id: string, data: ClienteAtualizar) {
  const [before] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!before) throw new NotFound('Cliente');
  if (data.cnpj && data.cnpj !== before.cnpj) {
    const [dup] = await db.select({ id: clients.id }).from(clients).where(eq(clients.cnpj, data.cnpj)).limit(1);
    if (dup) throw new BadRequest('Já existe um cliente com este CNPJ');
  }
  const [after] = await db.update(clients).set({ ...data, updatedAt: new Date() }).where(eq(clients.id, id)).returning();
  return { before, after: after! };
}

/** Lixeira: não apaga, marca. Restaurar limpa a marca. */
export async function softDelete(db: Db, id: string) {
  const [row] = await db.update(clients).set({ deletedAt: new Date() }).where(and(eq(clients.id, id), isNull(clients.deletedAt))).returning();
  if (!row) throw new NotFound('Cliente');
  return row;
}
export async function restore(db: Db, id: string) {
  const [row] = await db.update(clients).set({ deletedAt: null }).where(eq(clients.id, id)).returning();
  if (!row) throw new NotFound('Cliente');
  return row;
}

/**
 * Grava (cria ou atualiza) a assinatura de um produto e a configuração própria dele.
 * Senhas vindas em texto vão para o cofre; texto vazio/ausente mantém a senha atual.
 */
export async function upsertSubscription(db: Db, vault: SecretsVault, clientId: string, data: AssinaturaGravar, userId: string) {
  const [client] = await db.select({ id: clients.id, name: clients.tradeName }).from(clients).where(eq(clients.id, clientId));
  if (!client) throw new NotFound('Cliente');
  const [product] = await db.select().from(products).where(eq(products.code, data.productCode));
  if (!product) throw new NotFound(`Produto "${data.productCode}"`);

  const [existing] = await db.select().from(subscriptions).where(and(eq(subscriptions.clientId, clientId), eq(subscriptions.productId, product.id)));
  const common = { activatedAt: data.activatedAt ?? existing?.activatedAt ?? new Date(), deactivatedAt: data.deactivatedAt === undefined ? null : data.deactivatedAt, notes: data.notes ?? existing?.notes ?? null, monthlyValueCents: data.monthlyValueCents ?? existing?.monthlyValueCents ?? null };
  let subId = existing?.id;
  if (existing) {
    await db.update(subscriptions).set({ ...common, updatedAt: new Date() }).where(eq(subscriptions.id, existing.id));
  } else {
    subId = newId();
    await db.insert(subscriptions).values({ id: subId, clientId, productId: product.id, ...common });
  }
  const sid = subId!;
  const st = (data.settings ?? {}) as Record<string, any>;
  const label = (what: string) => `${what} — ${client.name}`;

  if (product.code === 'linepbx') {
    const [cur] = await db.select().from(linepbxSettings).where(eq(linepbxSettings.subscriptionId, sid));
    const secretId = st.sshPassword ? await vault.save(db, { existingId: cur?.sshPasswordSecretId, label: label('Senha SSH do LinePBX'), plain: st.sshPassword, userId }) : cur?.sshPasswordSecretId ?? null;
    const vals = { hostingId: st.hostingId ?? cur?.hostingId ?? null, serverIp: st.serverIp ?? cur?.serverIp ?? null, domain: st.domain ?? cur?.domain ?? null, sshUser: st.sshUser ?? cur?.sshUser ?? null, sshPort: st.sshPort ?? cur?.sshPort ?? 22, sshPasswordSecretId: secretId };
    if (cur) await db.update(linepbxSettings).set(vals).where(eq(linepbxSettings.subscriptionId, sid));
    else await db.insert(linepbxSettings).values({ subscriptionId: sid, ...vals });
  } else if (product.code === 'fop2') {
    const [cur] = await db.select().from(fop2Settings).where(eq(fop2Settings.subscriptionId, sid));
    const vals = { adminExtension: st.adminExtension ?? cur?.adminExtension ?? null };
    if (cur) await db.update(fop2Settings).set(vals).where(eq(fop2Settings.subscriptionId, sid));
    else await db.insert(fop2Settings).values({ subscriptionId: sid, ...vals });
  } else if (product.code === 'omniboard') {
    const [cur] = await db.select().from(omniboardSettings).where(eq(omniboardSettings.subscriptionId, sid));
    const adminSecret = st.adminPassword ? await vault.save(db, { existingId: cur?.adminPasswordSecretId, label: label('Senha admin do Omniboard'), plain: st.adminPassword, userId }) : cur?.adminPasswordSecretId ?? null;
    const defSecret = st.userDefaultPassword ? await vault.save(db, { existingId: cur?.userDefaultPasswordSecretId, label: label('Senha padrão de usuário do Omniboard'), plain: st.userDefaultPassword, userId }) : cur?.userDefaultPasswordSecretId ?? null;
    const vals = { adminLogin: st.adminLogin ?? cur?.adminLogin ?? null, adminPasswordSecretId: adminSecret, userDefaultPasswordSecretId: defSecret };
    if (cur) await db.update(omniboardSettings).set(vals).where(eq(omniboardSettings.subscriptionId, sid));
    else await db.insert(omniboardSettings).values({ subscriptionId: sid, ...vals });
  } else if (product.code === 'szchat') {
    const [cur] = await db.select().from(szchatSettings).where(eq(szchatSettings.subscriptionId, sid));
    const adminSecret = st.adminPassword ? await vault.save(db, { existingId: cur?.adminPasswordSecretId, label: label('Senha admin do SZChat'), plain: st.adminPassword, userId }) : cur?.adminPasswordSecretId ?? null;
    const vals = { adminLogin: st.adminLogin ?? cur?.adminLogin ?? null, adminPasswordSecretId: adminSecret };
    if (cur) await db.update(szchatSettings).set(vals).where(eq(szchatSettings.subscriptionId, sid));
    else await db.insert(szchatSettings).values({ subscriptionId: sid, ...vals });
  }
  return { subscriptionId: sid, created: !existing };
}

/** Encerra a assinatura (mantém a linha e a configuração, com data de encerramento). */
export async function deactivateSubscription(db: Db, clientId: string, productCode: string) {
  const [product] = await db.select().from(products).where(eq(products.code, productCode));
  if (!product) throw new NotFound('Produto');
  const [row] = await db.update(subscriptions).set({ deactivatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(subscriptions.clientId, clientId), eq(subscriptions.productId, product.id), isNull(subscriptions.deactivatedAt))).returning();
  if (!row) throw new NotFound('Assinatura ativa');
  return row;
}

/** Clientes que assinam um produto (usado para "só transfere aparelho para quem tem Equipamentos"). */
export async function idsWithProduct(db: Db, productCode: string): Promise<Set<string>> {
  const rows = await db.select({ id: subscriptions.clientId }).from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId))
    .where(and(eq(products.code, productCode), isNull(subscriptions.deactivatedAt)));
  return new Set(rows.map((r) => r.id));
}

/** Lista curta (id + nome) para preencher seletores. */
export async function options(db: Db, opts: { includeInternal?: boolean; productCode?: string } = {}) {
  const conds: SQL[] = [isNull(clients.deletedAt), eq(clients.archived, false)];
  if (!opts.includeInternal) conds.push(eq(clients.isInternal, false));
  let rows = await db.select({ id: clients.id, name: clients.tradeName, isInternal: clients.isInternal, internalCode: clients.internalCode }).from(clients).where(and(...conds)).orderBy(desc(clients.isInternal), asc(clients.tradeName));
  if (opts.productCode) {
    const allowed = await idsWithProduct(db, opts.productCode);
    rows = rows.filter((r) => allowed.has(r.id));
  }
  return rows;
}
