/**
 * Administração: usuários, papéis, catálogos e lixeira.
 *
 * Regras:
 *  - usuário nunca é apagado, só desativado (a auditoria precisa continuar apontando para ele)
 *  - o papel "administrador" sempre tem todas as permissões; ninguém remove o último administrador ativo
 *  - papéis do sistema (os 4 iniciais) não podem ser apagados; os criados pela tela podem, se não tiverem usuários
 *  - catálogos: nunca se apaga um item em uso — desativa
 *  - produto excluído vai para a lixeira (some das telas; as assinaturas ficam guardadas).
 *    LinePBX, VoiceNet e Equipamentos não podem ser excluídos: o sistema depende deles.
 */
import argon2 from 'argon2';
import { and, asc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { carriers, circuits, clients, deviceCategories, deviceModels, devices, dids, hostingProviders, newId, productModules, products, projects, releaseNotes, roles, subscriptions, users, type Db } from '@gestor/db';
import { ALL_PERMISSIONS, macFormatado, PERMISSIONS, type ModuloCatalogo, type ProdutoCriar, type UsuarioCriar } from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';

// ---------- Usuários ----------

export async function listUsers(db: Db) {
  return db.select({ id: users.id, name: users.name, email: users.email, active: users.active, roleId: users.roleId, roleName: roles.name, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt })
    .from(users).innerJoin(roles, eq(roles.id, users.roleId)).orderBy(asc(users.name));
}

export async function createUser(db: Db, data: UsuarioCriar) {
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
  if (dup) throw new BadRequest('Já existe um usuário com este e-mail');
  const [role] = await db.select().from(roles).where(eq(roles.id, data.roleId));
  if (!role) throw new NotFound('Papel');
  const [row] = await db.insert(users).values({ id: newId(), name: data.name, email: data.email, passwordHash: await argon2.hash(data.password), roleId: data.roleId, active: data.active }).returning({ id: users.id, name: users.name, email: users.email, active: users.active, roleId: users.roleId });
  return row!;
}

export async function updateUser(db: Db, id: string, data: Partial<UsuarioCriar>, actorId: string) {
  const [before] = await db.select().from(users).where(eq(users.id, id));
  if (!before) throw new NotFound('Usuário');
  if (data.email && data.email !== before.email) {
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
    if (dup) throw new BadRequest('Já existe um usuário com este e-mail');
  }
  // proteção: não deixar o sistema sem administrador ativo
  if ((data.active === false || (data.roleId && data.roleId !== before.roleId)) ) {
    const [adminRole] = await db.select().from(roles).where(eq(roles.key, 'administrador'));
    if (adminRole && before.roleId === adminRole.id) {
      const [others] = await db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.roleId, adminRole.id), eq(users.active, true), ne(users.id, id)));
      if (Number(others?.n ?? 0) === 0) throw new BadRequest('Este é o único administrador ativo. Crie outro antes de rebaixar ou desativar.');
    }
  }
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name) set.name = data.name;
  if (data.email) set.email = data.email;
  if (data.roleId) set.roleId = data.roleId;
  if (data.active !== undefined) set.active = data.active;
  if (data.password) set.passwordHash = await argon2.hash(data.password);
  const [after] = await db.update(users).set(set).where(eq(users.id, id)).returning({ id: users.id, name: users.name, email: users.email, active: users.active, roleId: users.roleId });
  void actorId;
  return { before: { id: before.id, name: before.name, email: before.email, active: before.active, roleId: before.roleId }, after: after! };
}

// ---------- Papéis ----------

export async function listRoles(db: Db) {
  const rows = await db.select({ r: roles, userCount: sql<number>`(select count(*) from users u where u.role_id = ${roles.id})` }).from(roles).orderBy(asc(roles.isSystem), asc(roles.name));
  return rows.map((x) => ({ ...x.r, userCount: Number(x.userCount) }));
}

export function permissionCatalog() {
  return ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key] }));
}

function validatePermissions(list: string[]) {
  const bad = list.filter((p) => !(ALL_PERMISSIONS as string[]).includes(p));
  if (bad.length) throw new BadRequest(`Permissões desconhecidas: ${bad.join(', ')}`);
}

export async function createRole(db: Db, data: { name: string; description?: string | null; permissions: string[] }) {
  validatePermissions(data.permissions);
  const [row] = await db.insert(roles).values({ id: newId(), name: data.name, description: data.description ?? null, permissions: data.permissions, isSystem: false }).returning();
  return row!;
}

export async function updateRole(db: Db, id: string, data: { name?: string; description?: string | null; permissions?: string[] }) {
  const [before] = await db.select().from(roles).where(eq(roles.id, id));
  if (!before) throw new NotFound('Papel');
  if (data.permissions) validatePermissions(data.permissions);
  if (before.key === 'administrador' && data.permissions && data.permissions.length !== ALL_PERMISSIONS.length) throw new BadRequest('O papel Administrador sempre tem todas as permissões');
  const set: Record<string, unknown> = {};
  if (data.name && !before.isSystem) set.name = data.name;
  if (data.description !== undefined) set.description = data.description;
  if (data.permissions) set.permissions = data.permissions;
  const [after] = await db.update(roles).set(set).where(eq(roles.id, id)).returning();
  return { before, after: after! };
}

export async function deleteRole(db: Db, id: string) {
  const [r] = await db.select().from(roles).where(eq(roles.id, id));
  if (!r) throw new NotFound('Papel');
  if (r.isSystem) throw new BadRequest('Papéis do sistema não podem ser apagados');
  const [n] = await db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.roleId, id));
  if (Number(n?.n ?? 0) > 0) throw new BadRequest('Há usuários com este papel. Mude o papel deles antes.');
  await db.delete(roles).where(eq(roles.id, id));
  return r;
}

// ---------- Catálogos ----------

const CATALOGS = { carriers, hostings: hostingProviders, categories: deviceCategories } as const;
export type CatalogType = keyof typeof CATALOGS;

export async function listCatalog(db: Db, type: CatalogType) {
  const t = CATALOGS[type];
  return db.select().from(t).orderBy(asc(t.name));
}
/** Nome de item de catálogo não se repete (sem diferenciar maiúsculas). */
async function nomeDeCatalogoLivre(db: Db, type: CatalogType, name: string, exceto?: string) {
  const t = CATALOGS[type];
  const [dup] = await db.select({ id: t.id }).from(t).where(sql`lower(${t.name}) = lower(${name})`).limit(1);
  if (dup && dup.id !== exceto) throw new BadRequest(`Já existe "${name}" neste catálogo`);
}
export async function createCatalogItem(db: Db, type: CatalogType, name: string) {
  const t = CATALOGS[type];
  await nomeDeCatalogoLivre(db, type, name);
  const [row] = await db.insert(t).values({ id: newId(), name }).returning();
  return row!;
}
/** Renomear vale para quem já usa o item: operadora, hospedagem e categoria são ligadas por id, então o nome novo aparece em todo lugar. */
export async function updateCatalogItem(db: Db, type: CatalogType, id: string, data: { name?: string; active?: boolean }) {
  const t = CATALOGS[type];
  if (data.name) await nomeDeCatalogoLivre(db, type, data.name, id);
  const [row] = await db.update(t).set(data).where(eq(t.id, id)).returning();
  if (!row) throw new NotFound('Item');
  return row;
}

/** Produtos com seus módulos (o catálogo inteiro, para a Administração e para a ficha do cliente). Os da lixeira ficam de fora. */
export async function listProducts(db: Db) {
  const rows = await db.select().from(products).where(isNull(products.deletedAt)).orderBy(asc(products.sortOrder), asc(products.name));
  const mods = await db.select().from(productModules).orderBy(asc(productModules.sortOrder));
  // quantos clientes assinam hoje — a tela usa isso para avisar antes de excluir
  const assinantes = await db.select({ productId: subscriptions.productId, n: sql<number>`count(distinct ${subscriptions.clientId})` })
    .from(subscriptions).innerJoin(clients, eq(clients.id, subscriptions.clientId))
    .where(and(isNull(subscriptions.deactivatedAt), isNull(clients.deletedAt))).groupBy(subscriptions.productId);
  return rows.map(({ deletedAt: _d, ...p }) => ({
    ...p,
    protegido: PRODUTOS_PROTEGIDOS.includes(p.code),
    activeClients: Number(assinantes.find((a) => a.productId === p.id)?.n ?? 0),
    modules: mods.filter((m) => m.productId === p.id).map(({ productId: _p, ...m }) => m),
  }));
}

/** Produtos que o próprio sistema usa por dentro (servidor e atalhos, alerta de DIDs, movimentação de aparelhos). */
export const PRODUTOS_PROTEGIDOS: string[] = ['linepbx', 'voicenet', 'equipamentos'];

export async function createProduct(db: Db, data: ProdutoCriar) {
  const [dup] = await db.select({ id: products.id, deletedAt: products.deletedAt, name: products.name }).from(products).where(eq(products.code, data.code));
  if (dup) throw new BadRequest(dup.deletedAt ? `O código "${data.code}" é do produto ${dup.name}, que está na lixeira. Restaure-o em Lixeira ou use outro código.` : `Já existe um produto com o código "${data.code}"`);
  const [max] = await db.select({ n: sql<number>`coalesce(max(${products.sortOrder}), 0)` }).from(products);
  const [row] = await db.insert(products).values({ id: newId(), code: data.code, name: data.name, color: data.color, description: data.description ?? null, hasSettings: false, sortOrder: Number(max?.n ?? 0) + 1, active: true }).returning();
  return row!;
}

/** Manda o produto para a lixeira. As assinaturas continuam no banco e voltam se ele for restaurado. */
export async function deleteProduct(db: Db, id: string) {
  const [p] = await db.select().from(products).where(and(eq(products.id, id), isNull(products.deletedAt)));
  if (!p) throw new NotFound('Produto');
  if (PRODUTOS_PROTEGIDOS.includes(p.code)) throw new BadRequest(`O ${p.name} não pode ser excluído: o sistema depende dele. Se não quiser vê-lo, desligue o "ativo".`);
  const [n] = await db.select({ n: sql<number>`count(distinct ${subscriptions.clientId})` }).from(subscriptions).where(and(eq(subscriptions.productId, id), isNull(subscriptions.deactivatedAt)));
  const [row] = await db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, id)).returning();
  return { ...row!, activeClients: Number(n?.n ?? 0) };
}

export async function restoreProduct(db: Db, id: string) {
  const [row] = await db.update(products).set({ deletedAt: null }).where(eq(products.id, id)).returning();
  if (!row) throw new NotFound('Produto');
  return row;
}

/** Cria ou atualiza um módulo dentro de um produto (o código identifica o módulo dentro do produto). */
export async function upsertModule(db: Db, productId: string, data: ModuloCatalogo) {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) throw new NotFound('Produto');
  const [cur] = await db.select().from(productModules).where(and(eq(productModules.productId, productId), eq(productModules.code, data.code)));
  if (cur) {
    const [row] = await db.update(productModules).set({ name: data.name, description: data.description ?? cur.description, hasSettings: data.hasSettings ?? cur.hasSettings, active: data.active ?? cur.active, sortOrder: data.sortOrder ?? cur.sortOrder }).where(eq(productModules.id, cur.id)).returning();
    return { ...row!, productName: product.name, created: false };
  }
  const [row] = await db.insert(productModules).values({ id: newId(), productId, code: data.code, name: data.name, description: data.description ?? null, hasSettings: data.hasSettings ?? false, active: data.active ?? true, sortOrder: data.sortOrder ?? 99 }).returning();
  return { ...row!, productName: product.name, created: true };
}
export async function updateProduct(db: Db, id: string, data: { name?: string; color?: string; description?: string | null; active?: boolean; sortOrder?: number }) {
  const [row] = await db.update(products).set(data).where(eq(products.id, id)).returning();
  if (!row) throw new NotFound('Produto');
  return row;
}

/** Tira o projeto da lixeira. */
export async function restoreProject(db: Db, id: string) {
  const [row] = await db.update(projects).set({ deletedAt: null, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
  if (!row) throw new NotFound('Projeto');
  return row;
}

// ---------- Lixeira ----------

export async function listTrash(db: Db) {
  const [c, ci, d, dm, dv, pr, rn, pj] = await Promise.all([
    db.select({ id: clients.id, label: clients.tradeName, deletedAt: clients.deletedAt }).from(clients).where(isNotNull(clients.deletedAt)),
    db.select({ id: circuits.id, label: circuits.name, deletedAt: circuits.deletedAt }).from(circuits).where(isNotNull(circuits.deletedAt)),
    db.select({ id: dids.id, label: dids.number, deletedAt: dids.deletedAt }).from(dids).where(isNotNull(dids.deletedAt)),
    db.select({ id: deviceModels.id, label: deviceModels.name, deletedAt: deviceModels.deletedAt }).from(deviceModels).where(isNotNull(deviceModels.deletedAt)),
    db.select({ id: devices.id, mac: devices.mac, serial: devices.serialNumber, modelo: deviceModels.name, deletedAt: devices.deletedAt }).from(devices).innerJoin(deviceModels, eq(deviceModels.id, devices.modelId)).where(isNotNull(devices.deletedAt)),
    db.select({ id: products.id, label: products.name, deletedAt: products.deletedAt }).from(products).where(isNotNull(products.deletedAt)),
    db.select({ id: releaseNotes.id, label: releaseNotes.title, deletedAt: releaseNotes.deletedAt }).from(releaseNotes).where(isNotNull(releaseNotes.deletedAt)),
    db.select({ id: projects.id, label: projects.name, deletedAt: projects.deletedAt }).from(projects).where(isNotNull(projects.deletedAt)),
  ]);
  return [
    ...c.map((x) => ({ type: 'client', ...x })), ...ci.map((x) => ({ type: 'circuit', ...x })), ...d.map((x) => ({ type: 'did', ...x })),
    ...dm.map((x) => ({ type: 'deviceModel', ...x })),
    ...dv.map((x) => ({ type: 'device', id: x.id, label: `${x.modelo} · ${x.mac ? macFormatado(x.mac) : x.serial ? `N/S ${x.serial}` : 'sem identificação'}`, deletedAt: x.deletedAt })),
    ...pr.map((x) => ({ type: 'product', ...x })),
    ...rn.map((x) => ({ type: 'releaseNote', ...x })),
    ...pj.map((x) => ({ type: 'project', ...x })),
  ].sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0));
}
