/**
 * Clientes e suas assinaturas de produto.
 *
 * Regras que vivem aqui:
 *  - listar aceita busca por nome/CNPJ, filtro de produtos em modo OR ("tem qualquer um") ou AND ("tem todos"),
 *    e esconde arquivados e internos por padrão
 *  - os atalhos de acesso (web, SSH, FOP2) são montados a partir da configuração do LinePBX e do módulo FOP2 —
 *    nunca carregam senha na URL
 *  - marcar um produto cria a assinatura; desmarcar NÃO apaga: preenche `deactivatedAt` (histórico)
 *  - módulos (Omniboard, FOP2, NPS…) só podem ser ligados dentro de um produto que o cliente assina
 *  - senhas nunca entram nas tabelas: vão para o cofre e a tabela guarda só o id do segredo
 *  - produto na lixeira some da ficha e da lista (a assinatura fica guardada)
 *  - todo cliente tem a unidade "Matriz"; as outras se cadastram na ficha (com endereço e IP fixo de saída)
 *  - o cliente tem uma configuração de rede padrão para os aparelhos e um login e senha padrão
 *    por modelo de aparelho; toda senha vai para o cofre
 */
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  clientDeviceLogins, clientLogos, clientNetworkSettings, clients, clientUnits, deviceModels, dids, devices, fop2Settings, hostingProviders, linepbxSettings, newId, omniboardSettings, productModules, products, subscriptionModules, subscriptions, szchatSettings, type Db,
} from '@gestor/db';
import type { AssinaturaGravar, ClienteAtualizar, ClienteCriar, ClienteListar, LoginModeloGravar, ModuloGravar, RedePadrao, UnidadeGravar } from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';
import type { SecretsVault } from './secrets.js';

/**
 * Um cliente na lista. Carrega os detalhes que a tela pode mostrar como coluna
 * (data de ativação de cada produto, módulos ligados, servidor do LinePBX, contagens).
 */
export type ClientListItem = {
  id: string; tradeName: string; legalName: string; cnpj: string; archived: boolean; isInternal: boolean;
  /** Caminho da logo RELATIVO à API ("clients/<id>/logo?v=…"), ou nulo quando não há logo */
  logoUrl: string | null;
  notes: string | null; createdAt: Date; updatedAt: Date;
  products: Array<{ code: string; name: string; color: string; activatedAt: Date | null; modules: Array<{ code: string; name: string; activatedAt: Date | null }> }>;
  server: { hostingName: string | null; serverIp: string | null; domain: string | null; sshPort: number | null } | null;
  links: { web: string | null; ssh: string | null; fop2: string | null };
  didCount: number; deviceCount: number; deviceValueCents: number;
};

/**
 * Monta os atalhos de acesso. Sem senha na URL — decisão de segurança S2.
 * O atalho SSH sai SEM usuário: cada técnico tem o seu (Minha conta), e a tela o encaixa
 * na hora de abrir — "ssh://servidor:22" vira "ssh://lucas@servidor:22".
 */
export function buildLinks(lp?: { domain: string | null; serverIp: string | null; sshPort: number | null } | null, hasFop2 = false) {
  if (!lp) return { web: null, ssh: null, fop2: null };
  const host = lp.domain || lp.serverIp;
  if (!host) return { web: null, ssh: null, fop2: null };
  const sshHost = lp.serverIp || lp.domain;
  return {
    web: `https://${host}`,
    ssh: `ssh://${sshHost}:${lp.sshPort ?? 22}`,
    fop2: hasFop2 ? `https://${host}/fop2/` : null,
  };
}

/** Valor que soma no cliente: o do aparelho, se ele tiver um próprio; senão o do modelo. */
export const valorDoAparelho = sql<number>`coalesce(${devices.valueCents}, ${deviceModels.valueCents})`;

/**
 * Traduz "ordenar por esta coluna" em ORDER BY.
 * O nome da coluna é o mesmo id que a tela usa, inclusive os criados na hora
 * ("ativacao:linepbx", "modulo:linepbx:fop2"). O que não for reconhecido cai no nome fantasia.
 * Vazio vai sempre para o fim (NULLS LAST), em qualquer sentido.
 */
function ordenacaoClientes(db: Db, q: ClienteListar) {
  const dir = q.dir === 'desc' ? sql`desc` : sql`asc`;
  const k = q.sort ?? 'tradeName';

  /** Um pedaço do LinePBX ativo do cliente (hospedagem, domínio, IP, usuário SSH). */
  const doLinePbx = (campo: SQL) => sql`(${db
    .select({ v: campo })
    .from(subscriptions)
    .innerJoin(products, eq(products.id, subscriptions.productId))
    .leftJoin(linepbxSettings, eq(linepbxSettings.subscriptionId, subscriptions.id))
    .leftJoin(hostingProviders, eq(hostingProviders.id, linepbxSettings.hostingId))
    .where(and(eq(subscriptions.clientId, clients.id), eq(products.code, 'linepbx'), isNull(subscriptions.deactivatedAt)))
    .limit(1)})`;

  const contar = (tabela: 'dids' | 'devices') => (tabela === 'dids'
    ? sql`(${db.select({ v: sql<number>`count(*)` }).from(dids).where(and(eq(dids.clientId, clients.id), isNull(dids.deletedAt)))})`
    : sql`(${db.select({ v: sql<number>`count(*)` }).from(devices).where(and(eq(devices.clientId, clients.id), isNull(devices.deletedAt)))})`);

  let campo: SQL;
  if (k === 'legalName') campo = sql`lower(${clients.legalName})`;
  else if (k === 'cnpj') campo = sql`${clients.cnpj}`;
  else if (k === 'notes') campo = sql`lower(${clients.notes})`;
  else if (k === 'createdAt') campo = sql`${clients.createdAt}`;
  else if (k === 'updatedAt') campo = sql`${clients.updatedAt}`;
  else if (k === 'didCount') campo = contar('dids');
  else if (k === 'deviceCount') campo = contar('devices');
  else if (k === 'products') campo = sql`(${db.select({ v: sql<number>`count(*)` }).from(subscriptions).where(and(eq(subscriptions.clientId, clients.id), isNull(subscriptions.deactivatedAt)))})`;
  else if (k === 'modules') campo = sql`(${db
    .select({ v: sql<number>`count(*)` })
    .from(subscriptionModules)
    .innerJoin(subscriptions, eq(subscriptions.id, subscriptionModules.subscriptionId))
    .where(and(eq(subscriptions.clientId, clients.id), isNull(subscriptions.deactivatedAt), isNull(subscriptionModules.deactivatedAt)))})`;
  else if (k === 'hosting') campo = doLinePbx(sql`lower(${hostingProviders.name})`);
  else if (k === 'domain') campo = doLinePbx(sql`lower(${linepbxSettings.domain})`);
  else if (k === 'serverIp') campo = doLinePbx(sql`${linepbxSettings.serverIp}`);
  else if (k === 'ssh') campo = doLinePbx(sql`${linepbxSettings.sshPort}`);
  else if (k.startsWith('ativacao:')) {
    const code = k.slice('ativacao:'.length);
    campo = sql`(${db
      .select({ v: subscriptions.activatedAt })
      .from(subscriptions)
      .innerJoin(products, eq(products.id, subscriptions.productId))
      .where(and(eq(subscriptions.clientId, clients.id), eq(products.code, code), isNull(subscriptions.deactivatedAt)))
      .limit(1)})`;
  } else if (k.startsWith('modulo:')) {
    const [, pCode = '', mCode = ''] = k.split(':');
    campo = sql`(${db
      .select({ v: subscriptionModules.activatedAt })
      .from(subscriptionModules)
      .innerJoin(subscriptions, eq(subscriptions.id, subscriptionModules.subscriptionId))
      .innerJoin(products, eq(products.id, subscriptions.productId))
      .innerJoin(productModules, eq(productModules.id, subscriptionModules.moduleId))
      .where(and(eq(subscriptions.clientId, clients.id), eq(products.code, pCode), eq(productModules.code, mCode), isNull(subscriptions.deactivatedAt), isNull(subscriptionModules.deactivatedAt)))
      .limit(1)})`;
  } else campo = sql`lower(${clients.tradeName})`;

  // desempate sempre pelo nome fantasia, para a ordem não "dançar" entre páginas
  return sql`${campo} ${dir} nulls last, lower(${clients.tradeName}) asc`;
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
  if (q.modules.length) {
    // "produto:modulo" → clientes com o módulo ligado dentro de assinatura ativa do produto
    const pairs = q.modules.map((m) => m.split(':')).filter((p) => p.length === 2) as Array<[string, string]>;
    const pairCond = or(...pairs.map(([p, m]) => and(eq(products.code, p), eq(productModules.code, m))!))!;
    const sub = db
      .select({ clientId: subscriptions.clientId, n: sql<number>`count(distinct ${productModules.id})`.as('n') })
      .from(subscriptionModules)
      .innerJoin(subscriptions, eq(subscriptions.id, subscriptionModules.subscriptionId))
      .innerJoin(products, eq(products.id, subscriptions.productId))
      .innerJoin(productModules, eq(productModules.id, subscriptionModules.moduleId))
      .where(and(pairCond, isNull(subscriptions.deactivatedAt), isNull(subscriptionModules.deactivatedAt)))
      .groupBy(subscriptions.clientId)
      .as('submod');
    const matched = db.select({ id: sub.clientId }).from(sub).where(q.mode === 'and' ? sql`${sub.n} >= ${pairs.length}` : sql`${sub.n} >= 1`);
    conds.push(inArray(clients.id, matched));
  }
  const where = and(...conds);
  const rows = await db.select().from(clients).where(where).orderBy(ordenacaoClientes(db, q)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(clients).where(where);
  const items = await enrich(db, rows);
  return { items, total: Number(c?.n ?? 0), page: q.page, pageSize: q.pageSize };
}

/** Acrescenta produtos, módulos, servidor, atalhos e contagens a uma lista de clientes (em poucas consultas, não uma por cliente). */
async function enrich(db: Db, rows: (typeof clients.$inferSelect)[]): Promise<ClientListItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const subs = await db
    .select({ clientId: subscriptions.clientId, subId: subscriptions.id, code: products.code, name: products.name, color: products.color, sort: products.sortOrder, activatedAt: subscriptions.activatedAt })
    .from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId))
    .where(and(inArray(subscriptions.clientId, ids), isNull(subscriptions.deactivatedAt), isNull(products.deletedAt)))
    .orderBy(asc(products.sortOrder));
  const subIds = subs.map((s) => s.subId).concat(['-']);
  const mods = await db
    .select({ subId: subscriptionModules.subscriptionId, code: productModules.code, name: productModules.name, activatedAt: subscriptionModules.activatedAt, sort: productModules.sortOrder })
    .from(subscriptionModules).innerJoin(productModules, eq(productModules.id, subscriptionModules.moduleId))
    .where(and(inArray(subscriptionModules.subscriptionId, subIds), isNull(subscriptionModules.deactivatedAt)))
    .orderBy(asc(productModules.sortOrder));
  const lps = await db.select({ s: linepbxSettings, hostingName: hostingProviders.name }).from(linepbxSettings).leftJoin(hostingProviders, eq(hostingProviders.id, linepbxSettings.hostingId))
    .where(inArray(linepbxSettings.subscriptionId, subs.filter((s) => s.code === 'linepbx').map((s) => s.subId).concat(['-'])));
  const logos = await db.select({ clientId: clientLogos.clientId, updatedAt: clientLogos.updatedAt }).from(clientLogos).where(inArray(clientLogos.clientId, ids));
  const didCounts = await db.select({ clientId: dids.clientId, n: sql<number>`count(*)` }).from(dids).where(and(inArray(dids.clientId, ids), isNull(dids.deletedAt))).groupBy(dids.clientId);
  // contagem e valor dos aparelhos com cada cliente (valor próprio do aparelho, ou o do modelo)
  const devCounts = await db.select({ clientId: devices.clientId, n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${valorDoAparelho}), 0)` })
    .from(devices).innerJoin(deviceModels, eq(deviceModels.id, devices.modelId))
    .where(and(inArray(devices.clientId, ids), isNull(devices.deletedAt), sql`coalesce(${devices.currentModality}, '') <> 'venda'`)).groupBy(devices.clientId);
  return rows.map((r) => {
    const mine = subs.filter((s) => s.clientId === r.id);
    const lpSub = mine.find((s) => s.code === 'linepbx');
    const lp = lpSub ? lps.find((l) => l.s.subscriptionId === lpSub.subId) ?? null : null;
    const productsOut = mine.map((s) => ({ code: s.code, name: s.name, color: s.color, activatedAt: s.activatedAt, modules: mods.filter((m) => m.subId === s.subId).map((m) => ({ code: m.code, name: m.name, activatedAt: m.activatedAt })) }));
    const hasFop2 = productsOut.some((p) => p.code === 'linepbx' && p.modules.some((m) => m.code === 'fop2'));
    return {
      id: r.id, tradeName: r.tradeName, legalName: r.legalName, cnpj: r.cnpj, archived: r.archived, isInternal: r.isInternal,
      logoUrl: logoPath(r.id, logos.find((l) => l.clientId === r.id)?.updatedAt),
      notes: r.notes, createdAt: r.createdAt, updatedAt: r.updatedAt,
      products: productsOut,
      server: lp ? { hostingName: lp.hostingName ?? null, serverIp: lp.s.serverIp, domain: lp.s.domain, sshPort: lp.s.sshPort } : null,
      links: buildLinks(lp?.s ?? null, hasFop2),
      didCount: Number(didCounts.find((d) => d.clientId === r.id)?.n ?? 0),
      deviceCount: Number(devCounts.find((d) => d.clientId === r.id)?.n ?? 0),
      deviceValueCents: Number(devCounts.find((d) => d.clientId === r.id)?.v ?? 0),
    };
  });
}

/** Ficha completa: dados + todas as assinaturas (ativas e encerradas) com a configuração de cada produto e os módulos de cada uma. */
export async function get(db: Db, id: string) {
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!row) throw new NotFound('Cliente');
  const subs = await db
    .select({
      id: subscriptions.id, productCode: products.code, productName: products.name, color: products.color, hasSettings: products.hasSettings,
      activatedAt: subscriptions.activatedAt, deactivatedAt: subscriptions.deactivatedAt, notes: subscriptions.notes, sort: products.sortOrder,
    })
    .from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId))
    .where(and(eq(subscriptions.clientId, id), isNull(products.deletedAt))).orderBy(asc(products.sortOrder));
  const subIds = subs.map((s) => s.id).concat(['-']);
  const mods = await db
    .select({
      id: subscriptionModules.id, subId: subscriptionModules.subscriptionId, moduleCode: productModules.code, moduleName: productModules.name, hasSettings: productModules.hasSettings,
      activatedAt: subscriptionModules.activatedAt, deactivatedAt: subscriptionModules.deactivatedAt, notes: subscriptionModules.notes, sort: productModules.sortOrder,
    })
    .from(subscriptionModules).innerJoin(productModules, eq(productModules.id, subscriptionModules.moduleId))
    .where(inArray(subscriptionModules.subscriptionId, subIds)).orderBy(asc(productModules.sortOrder));
  const modIds = mods.map((m) => m.id).concat(['-']);
  const [lps, szs, f2s, oms] = await Promise.all([
    db.select({ s: linepbxSettings, hostingName: hostingProviders.name }).from(linepbxSettings).leftJoin(hostingProviders, eq(hostingProviders.id, linepbxSettings.hostingId)).where(inArray(linepbxSettings.subscriptionId, subIds)),
    db.select().from(szchatSettings).where(inArray(szchatSettings.subscriptionId, subIds)),
    db.select().from(fop2Settings).where(inArray(fop2Settings.subscriptionModuleId, modIds)),
    db.select().from(omniboardSettings).where(inArray(omniboardSettings.subscriptionModuleId, modIds)),
  ]);
  const enriched = subs.map((s) => {
    let settings: Record<string, unknown> | null = null;
    if (s.productCode === 'linepbx') {
      const lp = lps.find((l) => l.s.subscriptionId === s.id);
      if (lp) settings = { hostingId: lp.s.hostingId, hostingName: lp.hostingName, serverIp: lp.s.serverIp, domain: lp.s.domain, sshUser: lp.s.sshUser, sshPort: lp.s.sshPort, sshPassword: secretRef(lp.s.sshPasswordSecretId) };
    } else if (s.productCode === 'szchat') {
      const z = szs.find((x) => x.subscriptionId === s.id);
      if (z) settings = { adminLogin: z.adminLogin, adminPassword: secretRef(z.adminPasswordSecretId) };
    }
    const modules = mods.filter((m) => m.subId === s.id).map((m) => {
      let ms: Record<string, unknown> | null = null;
      if (m.moduleCode === 'fop2') {
        const f = f2s.find((x) => x.subscriptionModuleId === m.id);
        if (f) ms = { adminExtension: f.adminExtension, defaultUserPassword: secretRef(f.defaultUserPasswordSecretId) };
      } else if (m.moduleCode === 'omniboard') {
        const o = oms.find((x) => x.subscriptionModuleId === m.id);
        if (o) ms = { adminLogin: o.adminLogin, adminPassword: secretRef(o.adminPasswordSecretId), userDefaultPassword: secretRef(o.userDefaultPasswordSecretId) };
      }
      return { id: m.id, moduleCode: m.moduleCode, moduleName: m.moduleName, hasSettings: m.hasSettings, active: !m.deactivatedAt, activatedAt: m.activatedAt, deactivatedAt: m.deactivatedAt, notes: m.notes, settings: ms };
    });
    return { ...s, active: !s.deactivatedAt, settings, modules };
  });
  const lpActive = enriched.find((s) => s.productCode === 'linepbx' && s.active);
  const lpRow = lpActive ? lps.find((l) => l.s.subscriptionId === lpActive.id)?.s ?? null : null;
  const hasFop2 = !!lpActive?.modules.some((m) => m.moduleCode === 'fop2' && m.active);
  const [didC] = await db.select({ n: sql<number>`count(*)` }).from(dids).where(and(eq(dids.clientId, id), isNull(dids.deletedAt)));
  const [devC] = await db.select({ n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${valorDoAparelho}), 0)` })
    .from(devices).innerJoin(deviceModels, eq(deviceModels.id, devices.modelId))
    .where(and(eq(devices.clientId, id), isNull(devices.deletedAt), sql`coalesce(${devices.currentModality}, '') <> 'venda'`));
  const [unC] = await db.select({ n: sql<number>`count(*)` }).from(clientUnits).where(and(eq(clientUnits.clientId, id), isNull(clientUnits.deletedAt)));
  const [logo] = await db.select({ updatedAt: clientLogos.updatedAt }).from(clientLogos).where(eq(clientLogos.clientId, id));
  const [rede] = await db.select().from(clientNetworkSettings).where(eq(clientNetworkSettings.clientId, id));
  const logins = await listDeviceLogins(db, id);
  return {
    ...row,
    logoUrl: logoPath(id, logo?.updatedAt),
    subscriptions: enriched,
    // a configuração de rede padrão dos aparelhos (aba Equipamentos); a senha só diz se existe
    network: rede ? { ipAddress: rede.ipAddress, subnetMask: rede.subnetMask, defaultRouter: rede.defaultRouter, dns1: rede.dns1, dns2: rede.dns2, note: rede.note, wirelessPassword: secretRef(rede.wirelessPasswordSecretId), updatedAt: rede.updatedAt } : null,
    // login e senha padrão por modelo de aparelho (mesma seção da rede padrão)
    deviceLogins: logins,
    links: buildLinks(lpRow, hasFop2),
    didCount: Number(didC?.n ?? 0),
    deviceCount: Number(devC?.n ?? 0),
    deviceValueCents: Number(devC?.v ?? 0),
    // todo cliente tem ao menos a Matriz (criada na primeira vez que alguém olha as unidades)
    unitCount: Math.max(1, Number(unC?.n ?? 0)),
  };
}

export async function create(db: Db, data: ClienteCriar) {
  const [exists] = await db.select({ id: clients.id }).from(clients).where(eq(clients.cnpj, data.cnpj)).limit(1);
  if (exists) throw new BadRequest('Já existe um cliente com este CNPJ');
  const id = newId();
  const [row] = await db.insert(clients).values({ id, ...data }).returning();
  await garantirMatriz(db, id);
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
  // `null` explícito = "não sabemos a data" (vem da importação do Nexus, que nem sempre a tinha);
  // ausente = mantém a que já existia, ou hoje na primeira vez.
  const common = { activatedAt: data.activatedAt === null ? null : data.activatedAt ?? existing?.activatedAt ?? new Date(), deactivatedAt: data.deactivatedAt === undefined ? null : data.deactivatedAt, notes: data.notes ?? existing?.notes ?? null };
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
  } else if (product.code === 'szchat') {
    const [cur] = await db.select().from(szchatSettings).where(eq(szchatSettings.subscriptionId, sid));
    const adminSecret = st.adminPassword ? await vault.save(db, { existingId: cur?.adminPasswordSecretId, label: label('Senha admin do SZChat'), plain: st.adminPassword, userId }) : cur?.adminPasswordSecretId ?? null;
    const vals = { adminLogin: st.adminLogin ?? cur?.adminLogin ?? null, adminPasswordSecretId: adminSecret };
    if (cur) await db.update(szchatSettings).set(vals).where(eq(szchatSettings.subscriptionId, sid));
    else await db.insert(szchatSettings).values({ subscriptionId: sid, ...vals });
  }
  return { subscriptionId: sid, created: !existing };
}

/**
 * Liga (ou ajusta) um módulo dentro de um produto que o cliente assina.
 * Regra: o produto precisa estar ativo no cliente — módulo não existe solto.
 */
export async function upsertModule(db: Db, vault: SecretsVault, clientId: string, data: ModuloGravar, userId: string) {
  const [client] = await db.select({ id: clients.id, name: clients.tradeName }).from(clients).where(eq(clients.id, clientId));
  if (!client) throw new NotFound('Cliente');
  const [product] = await db.select().from(products).where(eq(products.code, data.productCode));
  if (!product) throw new NotFound(`Produto "${data.productCode}"`);
  const [mod] = await db.select().from(productModules).where(and(eq(productModules.productId, product.id), eq(productModules.code, data.moduleCode)));
  if (!mod) throw new NotFound(`Módulo "${data.moduleCode}" do produto ${product.name}`);
  const [sub] = await db.select().from(subscriptions).where(and(eq(subscriptions.clientId, clientId), eq(subscriptions.productId, product.id), isNull(subscriptions.deactivatedAt)));
  if (!sub) throw new BadRequest(`Marque o produto ${product.name} no cliente antes de ligar o módulo ${mod.name}`);

  const [existing] = await db.select().from(subscriptionModules).where(and(eq(subscriptionModules.subscriptionId, sub.id), eq(subscriptionModules.moduleId, mod.id)));
  const common = { activatedAt: data.activatedAt === null ? null : data.activatedAt ?? existing?.activatedAt ?? new Date(), deactivatedAt: data.deactivatedAt === undefined ? null : data.deactivatedAt, notes: data.notes ?? existing?.notes ?? null };
  let smId = existing?.id;
  if (existing) await db.update(subscriptionModules).set({ ...common, updatedAt: new Date() }).where(eq(subscriptionModules.id, existing.id));
  else { smId = newId(); await db.insert(subscriptionModules).values({ id: smId, subscriptionId: sub.id, moduleId: mod.id, ...common }); }
  const id = smId!;
  const st = (data.settings ?? {}) as Record<string, any>;
  const label = (what: string) => `${what} — ${client.name}`;

  if (mod.code === 'fop2') {
    const [cur] = await db.select().from(fop2Settings).where(eq(fop2Settings.subscriptionModuleId, id));
    const defSecret = st.defaultUserPassword ? await vault.save(db, { existingId: cur?.defaultUserPasswordSecretId, label: label('Senha do usuário padrão do FOP2'), plain: st.defaultUserPassword, userId }) : cur?.defaultUserPasswordSecretId ?? null;
    const vals = { adminExtension: st.adminExtension ?? cur?.adminExtension ?? null, defaultUserPasswordSecretId: defSecret };
    if (cur) await db.update(fop2Settings).set(vals).where(eq(fop2Settings.subscriptionModuleId, id));
    else await db.insert(fop2Settings).values({ subscriptionModuleId: id, ...vals });
  } else if (mod.code === 'omniboard') {
    const [cur] = await db.select().from(omniboardSettings).where(eq(omniboardSettings.subscriptionModuleId, id));
    const adminSecret = st.adminPassword ? await vault.save(db, { existingId: cur?.adminPasswordSecretId, label: label('Senha admin do Omniboard'), plain: st.adminPassword, userId }) : cur?.adminPasswordSecretId ?? null;
    const defSecret = st.userDefaultPassword ? await vault.save(db, { existingId: cur?.userDefaultPasswordSecretId, label: label('Senha padrão de usuário do Omniboard'), plain: st.userDefaultPassword, userId }) : cur?.userDefaultPasswordSecretId ?? null;
    const vals = { adminLogin: st.adminLogin ?? cur?.adminLogin ?? null, adminPasswordSecretId: adminSecret, userDefaultPasswordSecretId: defSecret };
    if (cur) await db.update(omniboardSettings).set(vals).where(eq(omniboardSettings.subscriptionModuleId, id));
    else await db.insert(omniboardSettings).values({ subscriptionModuleId: id, ...vals });
  }
  return { subscriptionModuleId: id, created: !existing, moduleName: mod.name, productName: product.name };
}

/** Desliga um módulo (mantém a linha e a configuração, com data de desligamento). */
export async function deactivateModule(db: Db, clientId: string, productCode: string, moduleCode: string) {
  const [product] = await db.select().from(products).where(eq(products.code, productCode));
  if (!product) throw new NotFound('Produto');
  const [mod] = await db.select().from(productModules).where(and(eq(productModules.productId, product.id), eq(productModules.code, moduleCode)));
  if (!mod) throw new NotFound('Módulo');
  const [sub] = await db.select().from(subscriptions).where(and(eq(subscriptions.clientId, clientId), eq(subscriptions.productId, product.id)));
  if (!sub) throw new NotFound('Assinatura');
  const [row] = await db.update(subscriptionModules).set({ deactivatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(subscriptionModules.subscriptionId, sub.id), eq(subscriptionModules.moduleId, mod.id), isNull(subscriptionModules.deactivatedAt))).returning();
  if (!row) throw new NotFound('Módulo ligado');
  return { ...row, moduleName: mod.name, productName: product.name };
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

/**
 * Clientes que hoje estão com pelo menos um aparelho nosso (usado na devolução: não adianta
 * oferecer quem não tem nada para devolver). Vendido não conta — já não é nosso.
 */
export async function idsWithDevices(db: Db): Promise<Set<string>> {
  const rows = await db.selectDistinct({ id: devices.clientId }).from(devices)
    .where(and(isNull(devices.deletedAt), sql`${devices.clientId} is not null`, sql`coalesce(${devices.currentModality}, '') <> 'venda'`));
  return new Set(rows.map((r) => r.id!).filter(Boolean));
}

/** Lista curta (id + nome) para preencher seletores. */
export async function options(db: Db, opts: { includeInternal?: boolean; productCode?: string; withDevices?: boolean } = {}) {
  const conds: SQL[] = [isNull(clients.deletedAt), eq(clients.archived, false)];
  if (!opts.includeInternal) conds.push(eq(clients.isInternal, false));
  let rows = await db.select({ id: clients.id, name: clients.tradeName, isInternal: clients.isInternal, internalCode: clients.internalCode }).from(clients).where(and(...conds)).orderBy(desc(clients.isInternal), asc(clients.tradeName));
  if (opts.productCode) {
    const allowed = await idsWithProduct(db, opts.productCode);
    rows = rows.filter((r) => allowed.has(r.id));
  }
  if (opts.withDevices) {
    const comAparelho = await idsWithDevices(db);
    rows = rows.filter((r) => comAparelho.has(r.id));
  }
  return rows;
}

// ---------- Unidades ----------

/** Nome padrão da unidade principal, que todo cliente tem. */
export const MATRIZ = 'Matriz';

/** Cria a Matriz do cliente, se ainda não existir. */
export async function garantirMatriz(db: Db, clientId: string) {
  const [tem] = await db.select({ id: clientUnits.id }).from(clientUnits).where(and(eq(clientUnits.clientId, clientId), eq(clientUnits.isMain, true), isNull(clientUnits.deletedAt))).limit(1);
  if (!tem) await db.insert(clientUnits).values({ id: newId(), clientId, name: MATRIZ, isMain: true });
}

/** As unidades do cliente, com a Matriz primeiro e quantos aparelhos cada uma tem. */
export async function listUnits(db: Db, clientId: string) {
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId));
  if (!client) throw new NotFound('Cliente');
  await garantirMatriz(db, clientId);
  const rows = await db.select().from(clientUnits).where(and(eq(clientUnits.clientId, clientId), isNull(clientUnits.deletedAt)))
    .orderBy(desc(clientUnits.isMain), sql`lower(${clientUnits.name})`);
  const cont = await db.select({ unit: devices.unit, n: sql<number>`count(*)` }).from(devices)
    .where(and(eq(devices.clientId, clientId), isNull(devices.deletedAt))).groupBy(devices.unit);
  const porNome = new Map(cont.map((c) => [(c.unit ?? '').trim().toLowerCase(), Number(c.n)]));
  // aparelho com o cliente mas sem unidade marcada conta na Matriz, que é a padrão
  const semUnidade = porNome.get('') ?? 0;
  return rows.map((u) => ({
    id: u.id, name: u.name, isMain: u.isMain, address: u.address, egressIp: u.egressIp, note: u.note, createdAt: u.createdAt,
    deviceCount: (porNome.get(u.name.trim().toLowerCase()) ?? 0) + (u.isMain ? semUnidade : 0),
  }));
}

async function nomeLivre(db: Db, clientId: string, name: string, exceto?: string) {
  const [dup] = await db.select({ id: clientUnits.id }).from(clientUnits)
    .where(and(eq(clientUnits.clientId, clientId), isNull(clientUnits.deletedAt), sql`lower(${clientUnits.name}) = lower(${name})`)).limit(1);
  if (dup && dup.id !== exceto) throw new BadRequest(`Já existe a unidade "${name}" neste cliente`);
}

export async function createUnit(db: Db, clientId: string, data: UnidadeGravar) {
  const [client] = await db.select({ id: clients.id, name: clients.tradeName }).from(clients).where(eq(clients.id, clientId));
  if (!client) throw new NotFound('Cliente');
  await garantirMatriz(db, clientId);
  await nomeLivre(db, clientId, data.name);
  const [row] = await db.insert(clientUnits).values({ id: newId(), clientId, name: data.name, address: data.address ?? null, egressIp: data.egressIp ?? null, note: data.note ?? null }).returning();
  return { ...row!, clientName: client.name };
}

/**
 * Garante que a unidade exista no cliente (usada na movimentação: o que se escolhe ali entra
 * na lista do cliente). Devolve o nome como está cadastrado.
 */
export async function unidadeDoCliente(db: Db, clientId: string, name: string | null | undefined): Promise<string> {
  await garantirMatriz(db, clientId);
  const nome = (name ?? '').trim();
  if (!nome) return MATRIZ;
  const [achou] = await db.select({ name: clientUnits.name }).from(clientUnits)
    .where(and(eq(clientUnits.clientId, clientId), isNull(clientUnits.deletedAt), sql`lower(${clientUnits.name}) = lower(${nome})`)).limit(1);
  if (achou) return achou.name;
  await db.insert(clientUnits).values({ id: newId(), clientId, name: nome });
  return nome;
}

/** Renomeia a unidade — e leva o nome novo para os aparelhos que estão nela. */
export async function updateUnit(db: Db, clientId: string, unitId: string, data: UnidadeGravar) {
  const [cur] = await db.select().from(clientUnits).where(and(eq(clientUnits.id, unitId), eq(clientUnits.clientId, clientId), isNull(clientUnits.deletedAt)));
  if (!cur) throw new NotFound('Unidade');
  await nomeLivre(db, clientId, data.name, unitId);
  return db.transaction(async (tx) => {
    const [row] = await tx.update(clientUnits).set({
      name: data.name,
      address: data.address === undefined ? cur.address : data.address,
      egressIp: data.egressIp === undefined ? cur.egressIp : data.egressIp,
      note: data.note === undefined ? cur.note : data.note,
      updatedAt: new Date(),
    }).where(eq(clientUnits.id, unitId)).returning();
    let movidos = 0;
    if (data.name !== cur.name) {
      const r = await tx.update(devices).set({ unit: data.name, updatedAt: new Date() })
        .where(and(eq(devices.clientId, clientId), sql`lower(trim(${devices.unit})) = lower(${cur.name})`)).returning({ id: devices.id });
      movidos = r.length;
    }
    return { before: cur, after: row!, movidos };
  });
}

/** Tira a unidade da lista. A Matriz não sai, e unidade com aparelho também não. */
export async function removeUnit(db: Db, clientId: string, unitId: string) {
  const [cur] = await db.select().from(clientUnits).where(and(eq(clientUnits.id, unitId), eq(clientUnits.clientId, clientId), isNull(clientUnits.deletedAt)));
  if (!cur) throw new NotFound('Unidade');
  if (cur.isMain) throw new BadRequest('A Matriz é a unidade padrão do cliente e não pode ser removida. Se quiser, renomeie.');
  const [n] = await db.select({ n: sql<number>`count(*)` }).from(devices)
    .where(and(eq(devices.clientId, clientId), isNull(devices.deletedAt), sql`lower(trim(${devices.unit})) = lower(${cur.name})`));
  if (Number(n?.n ?? 0) > 0) throw new BadRequest(`A unidade "${cur.name}" ainda tem ${n!.n} aparelho(s). Mova-os para outra unidade antes de remover.`);
  const [row] = await db.update(clientUnits).set({ deletedAt: new Date() }).where(eq(clientUnits.id, unitId)).returning();
  return row!;
}

// ---------- Login e senha padrão por modelo de aparelho ----------

const secretRef = (sid: string | null) => ({ hasSecret: !!sid, secretId: sid });

async function clienteOu404(db: Db, clientId: string) {
  const [client] = await db.select({ id: clients.id, name: clients.tradeName }).from(clients).where(eq(clients.id, clientId));
  if (!client) throw new NotFound('Cliente');
  return client;
}

/** Os logins padrão do cliente, um por modelo, em ordem de nome do modelo. A senha só diz se existe. */
export async function listDeviceLogins(db: Db, clientId: string) {
  const rows = await db.select({ l: clientDeviceLogins, modelName: deviceModels.name })
    .from(clientDeviceLogins).innerJoin(deviceModels, eq(deviceModels.id, clientDeviceLogins.modelId))
    .where(and(eq(clientDeviceLogins.clientId, clientId), isNull(clientDeviceLogins.deletedAt))).orderBy(sql`lower(${deviceModels.name})`);
  return rows.map((r) => ({ id: r.l.id, modelId: r.l.modelId, modelName: r.modelName, username: r.l.username, password: secretRef(r.l.passwordSecretId), note: r.l.note, updatedAt: r.l.updatedAt }));
}

/** Grava (cria ou atualiza) o login padrão de um modelo no cliente: um só por modelo. */
export async function saveDeviceLogin(db: Db, vault: SecretsVault, clientId: string, data: LoginModeloGravar, userId: string) {
  const client = await clienteOu404(db, clientId);
  const [model] = await db.select({ id: deviceModels.id, name: deviceModels.name }).from(deviceModels).where(and(eq(deviceModels.id, data.modelId), isNull(deviceModels.deletedAt)));
  if (!model) throw new NotFound('Modelo');
  const [cur] = await db.select().from(clientDeviceLogins).where(and(eq(clientDeviceLogins.clientId, clientId), eq(clientDeviceLogins.modelId, model.id), isNull(clientDeviceLogins.deletedAt)));
  const { password, ...rest } = data;
  const secretId = password ? await vault.save(db, { existingId: cur?.passwordSecretId, label: `Senha padrão ${model.name} — ${client.name}`, plain: password, userId }) : cur?.passwordSecretId ?? null;
  const vals = { username: rest.username === undefined ? cur?.username ?? null : rest.username, note: rest.note === undefined ? cur?.note ?? null : rest.note, passwordSecretId: secretId, updatedAt: new Date() };
  if (cur) await db.update(clientDeviceLogins).set(vals).where(eq(clientDeviceLogins.id, cur.id));
  else await db.insert(clientDeviceLogins).values({ id: newId(), clientId, modelId: model.id, ...vals });
  return { clientName: client.name, modelName: model.name, created: !cur, senhaTrocada: !!password };
}

/** Tira o login padrão daquele modelo (marca como excluído; a senha continua no cofre, sem ninguém apontar para ela). */
export async function removeDeviceLogin(db: Db, clientId: string, loginId: string) {
  const client = await clienteOu404(db, clientId);
  const [row] = await db.update(clientDeviceLogins).set({ deletedAt: new Date() }).where(and(eq(clientDeviceLogins.id, loginId), eq(clientDeviceLogins.clientId, clientId), isNull(clientDeviceLogins.deletedAt))).returning();
  if (!row) throw new NotFound('Login padrão');
  const [model] = await db.select({ name: deviceModels.name }).from(deviceModels).where(eq(deviceModels.id, row.modelId));
  return { clientName: client.name, modelName: model?.name ?? row.modelId };
}

// ---------- Configuração de rede padrão ----------

/** Grava (cria ou atualiza) a rede padrão dos aparelhos do cliente. A senha do ramal sem fio vai para o cofre. */
export async function saveNetwork(db: Db, vault: SecretsVault, clientId: string, data: RedePadrao, userId: string) {
  const client = await clienteOu404(db, clientId);
  const [cur] = await db.select().from(clientNetworkSettings).where(eq(clientNetworkSettings.clientId, clientId));
  const { wirelessPassword, ...rest } = data;
  const secretId = wirelessPassword ? await vault.save(db, { existingId: cur?.wirelessPasswordSecretId, label: `Senha do ramal sem fio — ${client.name}`, plain: wirelessPassword, userId }) : cur?.wirelessPasswordSecretId ?? null;
  const vals = {
    ipAddress: rest.ipAddress === undefined ? cur?.ipAddress ?? null : rest.ipAddress,
    subnetMask: rest.subnetMask === undefined ? cur?.subnetMask ?? null : rest.subnetMask,
    defaultRouter: rest.defaultRouter === undefined ? cur?.defaultRouter ?? null : rest.defaultRouter,
    dns1: rest.dns1 === undefined ? cur?.dns1 ?? null : rest.dns1,
    dns2: rest.dns2 === undefined ? cur?.dns2 ?? null : rest.dns2,
    note: rest.note === undefined ? cur?.note ?? null : rest.note,
    wirelessPasswordSecretId: secretId, updatedAt: new Date(),
  };
  await db.insert(clientNetworkSettings).values({ clientId, ...vals }).onConflictDoUpdate({ target: clientNetworkSettings.clientId, set: vals });
  return { clientName: client.name, before: cur ?? null };
}

// ---------- Logo ----------

/**
 * O endereço da logo, relativo à API ("clients/<id>/logo?v=…").
 * O `v` muda a cada troca de imagem, para o navegador não mostrar a antiga do cache.
 */
function logoPath(clientId: string, updatedAt?: Date | null) {
  return updatedAt ? `clients/${clientId}/logo?v=${updatedAt.getTime()}` : null;
}

/** Guarda (ou substitui) a logo do cliente. Recebe a imagem embutida como "data:...;base64,...". */
export async function saveLogo(db: Db, clientId: string, dataUrl: string) {
  const [client] = await db.select({ id: clients.id, name: clients.tradeName }).from(clients).where(eq(clients.id, clientId));
  if (!client) throw new NotFound('Cliente');
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new BadRequest('Imagem em formato inesperado');
  const [, mimeType, base64] = m as unknown as [string, string, string];
  const sizeBytes = Math.floor((base64.length * 3) / 4);
  if (sizeBytes > 512 * 1024) throw new BadRequest('Imagem muito grande (máximo 512 KB)');
  const vals = { mimeType, dataBase64: base64, sizeBytes, updatedAt: new Date() };
  await db.insert(clientLogos).values({ clientId, ...vals }).onConflictDoUpdate({ target: clientLogos.clientId, set: vals });
  return { clientName: client.name, sizeBytes };
}

/** Lê a logo para o servidor devolvê-la como imagem. */
export async function readLogo(db: Db, clientId: string) {
  const [row] = await db.select().from(clientLogos).where(eq(clientLogos.clientId, clientId));
  if (!row) throw new NotFound('Logo');
  return { mimeType: row.mimeType, buffer: Buffer.from(row.dataBase64, 'base64'), updatedAt: row.updatedAt };
}

/** Remove a logo (o cliente volta a aparecer com as iniciais). */
export async function removeLogo(db: Db, clientId: string) {
  const [row] = await db.delete(clientLogos).where(eq(clientLogos.clientId, clientId)).returning();
  if (!row) throw new NotFound('Logo');
  const [client] = await db.select({ name: clients.tradeName }).from(clients).where(eq(clients.id, clientId));
  return { clientName: client?.name ?? clientId };
}
