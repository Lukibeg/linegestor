/**
 * =====================================================================
 *  Ingline Systems Gestor — definição do banco de dados
 *
 *  Como ler: cada `pgTable` é uma tabela. Cada linha dentro dela é uma coluna.
 *  O comentário logo acima explica o que aquilo guarda — em português, para quem não programa.
 *
 *  Grupos: 1. Clientes e produtos · 2. Numeração · 3. Inventário · 4. Segurança e histórico
 *
 *  Convenções:
 *   - dinheiro é guardado em CENTAVOS inteiros (R$ 603,38 → 60338), sem arredondamento
 *   - textos "limpos": CNPJ só dígitos, DID só dígitos, MAC 12 hexadecimais sem separador
 *   - `deletedAt` preenchido = está na lixeira (nunca apagamos de verdade)
 *   - senhas NUNCA ficam nas tabelas de negócio: ficam cifradas na tabela `secrets`
 *   - toda tabela tem `id` em texto (cuid), gerado pela aplicação
 * =====================================================================
 */
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

const id = () => text('id').primaryKey();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const deletedAt = () => timestamp('deleted_at', { withTimezone: true });

// ---------------------------------------------------------------------
// 1. CLIENTES E PRODUTOS
// ---------------------------------------------------------------------

/**
 * Uma linha por empresa. Inclui também as organizações internas do grupo (Ingline Systems, VoiceNet),
 * marcadas com `isInternal`, porque elas aparecem como "titular" de DIDs, circuitos e aparelhos.
 */
export const clients = pgTable(
  'clients',
  {
    id: id(),
    /** Nome fantasia — o nome pelo qual a equipe chama o cliente */
    tradeName: text('trade_name').notNull(),
    /** Razão social — o nome jurídico */
    legalName: text('legal_name').notNull(),
    /** CNPJ com 14 dígitos, sem pontuação. Único no sistema. */
    cnpj: text('cnpj').notNull(),
    /** Caminho da imagem do logo (arquivo guardado fora do banco) */
    logoUrl: text('logo_url'),
    /** Arquivado = some da lista padrão, mas não é apagado (era "ocultar" no Nexus) */
    archived: boolean('archived').notNull().default(false),
    /** Organização do próprio grupo (Ingline, VoiceNet). Não conta como cliente nos indicadores. */
    isInternal: boolean('is_internal').notNull().default(false),
    /** Código curto para as internas ("ingline", "voicenet"); nulo para clientes */
    internalCode: text('internal_code'),
    /** Anotações gerais sobre o cliente */
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Preenchido quando foi mandado para a lixeira */
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('clients_cnpj_uq').on(t.cnpj),
    uniqueIndex('clients_internal_code_uq').on(t.internalCode),
    index('clients_trade_name_idx').on(t.tradeName),
  ],
);

/** Catálogo dos produtos vendidos (LinePBX, LineChat, LineReports, SZChat, VoiceNet, Equipamentos — gerenciável pela Administração). */
export const products = pgTable('products', {
  id: id(),
  /** Identificador estável usado no código ("linepbx", "fop2"...) */
  code: text('code').notNull().unique(),
  /** Nome exibido */
  name: text('name').notNull(),
  /** Cor do chip na interface (hex) */
  color: text('color').notNull().default('#2457D6'),
  /** Uma frase explicando o produto */
  description: text('description'),
  /** Tem uma tabela de configuração própria? (LinePBX, SZChat) */
  hasSettings: boolean('has_settings').notNull().default(false),
  /** Ordem nos chips e menus */
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

/**
 * Catálogo de MÓDULOS: partes opcionais dentro de um produto.
 * LinePBX tem Omniboard, FOP2 e NPS; LineChat tem Dashboard de filas e NPS. Gerenciável pela Administração.
 */
export const productModules = pgTable(
  'product_modules',
  {
    id: id(),
    productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    /** Identificador estável dentro do produto ("fop2", "nps"…) */
    code: text('code').notNull(),
    /** Nome exibido */
    name: text('name').notNull(),
    /** Uma frase explicando o módulo */
    description: text('description'),
    /** Tem configuração própria? (FOP2: ramal admin · Omniboard: login e senhas) */
    hasSettings: boolean('has_settings').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('product_modules_product_code_uq').on(t.productId, t.code)],
);

/**
 * "O cliente X assina o produto Y." Uma linha por par cliente × produto.
 * Guarda quando começou e — diferente do Nexus — quando terminou.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull().references(() => products.id),
    /** Data em que o produto foi ativado para o cliente */
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    /** Preenchido quando o cliente deixou de assinar. Nulo = ativa. */
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    /** Anotações do produto para este cliente (regras internas, contratos...) */
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('subscriptions_client_product_uq').on(t.clientId, t.productId)],
);

/** Configuração própria do LinePBX: onde está o servidor e como acessá-lo. */
export const linepbxSettings = pgTable('linepbx_settings', {
  subscriptionId: text('subscription_id').primaryKey().references(() => subscriptions.id, { onDelete: 'cascade' }),
  /** Onde o servidor roda (catálogo: Local, Vultr, AWS...) */
  hostingId: text('hosting_id').references(() => hostingProviders.id),
  /** IP do servidor */
  serverIp: text('server_ip'),
  /** Endereço web (domínio) — alimenta o atalho "abrir" e o link do FOP2 */
  domain: text('domain'),
  /** Usuário do SSH */
  sshUser: text('ssh_user'),
  /** Porta do SSH (22 por padrão) */
  sshPort: integer('ssh_port').default(22),
  /** Senha do SSH — aponta para o cofre, nunca fica aqui */
  sshPasswordSecretId: text('ssh_password_secret_id').references(() => secrets.id),
});

/**
 * "Na assinatura X, o módulo Y está ligado." Uma linha por par assinatura × módulo.
 * Só faz sentido dentro de um produto que o cliente assina (o servidor confere).
 */
export const subscriptionModules = pgTable(
  'subscription_modules',
  {
    id: id(),
    subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
    moduleId: text('module_id').notNull().references(() => productModules.id),
    /** Quando o módulo foi ligado para o cliente */
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    /** Preenchido quando foi desligado. Nulo = ligado. */
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    /** Anotações do módulo para este cliente */
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('subscription_modules_sub_module_uq').on(t.subscriptionId, t.moduleId)],
);

/** Configuração própria do módulo FOP2 (dentro do LinePBX). */
export const fop2Settings = pgTable('fop2_settings', {
  subscriptionModuleId: text('subscription_module_id').primaryKey().references(() => subscriptionModules.id, { onDelete: 'cascade' }),
  /** Ramal/usuário do FOP2 usado para o acesso rápido */
  adminExtension: text('admin_extension'),
});

/** Configuração própria do módulo Omniboard (call center, dentro do LinePBX). */
export const omniboardSettings = pgTable('omniboard_settings', {
  subscriptionModuleId: text('subscription_module_id').primaryKey().references(() => subscriptionModules.id, { onDelete: 'cascade' }),
  /** E-mail do administrador */
  adminLogin: text('admin_login'),
  /** Senha do administrador — no cofre */
  adminPasswordSecretId: text('admin_password_secret_id').references(() => secrets.id),
  /** Senha padrão dos usuários novos — no cofre */
  userDefaultPasswordSecretId: text('user_default_password_secret_id').references(() => secrets.id),
});

/** Configuração própria do SZChat (legado Fortics). */
export const szchatSettings = pgTable('szchat_settings', {
  subscriptionId: text('subscription_id').primaryKey().references(() => subscriptions.id, { onDelete: 'cascade' }),
  /** E-mail do administrador */
  adminLogin: text('admin_login'),
  /** Senha do administrador — no cofre */
  adminPasswordSecretId: text('admin_password_secret_id').references(() => secrets.id),
});

/** Catálogo: onde um servidor pode estar hospedado (Local, Vultr, AWS, Contabo, Hetzner...). */
export const hostingProviders = pgTable('hosting_providers', {
  id: id(),
  name: text('name').notNull().unique(),
  active: boolean('active').notNull().default(true),
});

// ---------------------------------------------------------------------
// 2. NUMERAÇÃO (circuitos e DIDs)
// ---------------------------------------------------------------------

/** Catálogo: operadoras que fornecem circuitos (ALGAR, VC1...). */
export const carriers = pgTable('carriers', {
  id: id(),
  name: text('name').notNull().unique(),
  active: boolean('active').notNull().default(true),
});

/** Um circuito (feixe) contratado junto a uma operadora. Agrupa DIDs e tem um limite de canais. */
export const circuits = pgTable(
  'circuits',
  {
    id: id(),
    /** Nome interno ("071 Antigo", "Link - Cliente A") */
    name: text('name').notNull(),
    /** Código do circuito na operadora */
    code: text('code').notNull(),
    carrierId: text('carrier_id').references(() => carriers.id),
    /** Canais = chamadas simultâneas que o feixe suporta */
    channels: integer('channels').notNull().default(0),
    /** Titular do circuito: quem detém o contrato com a operadora (normalmente VoiceNet) */
    ownerClientId: text('owner_client_id').references(() => clients.id),
    /** Custo/valor mensal do feixe, em centavos */
    monthlyValueCents: integer('monthly_value_cents'),
    /** IP da operadora (sinalização) */
    signalingIp: text('signaling_ip'),
    /** IP de autenticação ("IP PBX" no Nexus) */
    authIp: text('auth_ip'),
    /** Usuário de autenticação do tronco */
    authUsername: text('auth_username'),
    /** Senha de autenticação do tronco — no cofre */
    authPasswordSecretId: text('auth_password_secret_id').references(() => secrets.id),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex('circuits_code_carrier_uq').on(t.code, t.carrierId), index('circuits_name_idx').on(t.name)],
);

/** Um número telefônico. "Linha" no Nexus; DID aqui (decisão V2). */
export const dids = pgTable(
  'dids',
  {
    id: id(),
    /** Número só com dígitos (DDD + 8 ou 9). Único. */
    number: text('number').notNull(),
    /** Circuito ao qual pertence. Nulo = "sem circuito". */
    circuitId: text('circuit_id').references(() => circuits.id),
    /** Cliente que USA o número. Nulo = livre. */
    clientId: text('client_id').references(() => clients.id),
    /** Titular: quem DETÉM o número junto à operadora (normalmente VoiceNet) */
    ownerClientId: text('owner_client_id').references(() => clients.id),
    /** Observação curta */
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('dids_number_uq').on(t.number),
    index('dids_circuit_idx').on(t.circuitId),
    index('dids_client_idx').on(t.clientId),
    index('dids_deleted_idx').on(t.deletedAt),
  ],
);

// ---------------------------------------------------------------------
// 3. INVENTÁRIO (modelos, aparelhos, movimentações)
// ---------------------------------------------------------------------

/** Catálogo: categoria de aparelho (Telefone IP, Periférico, ATA...). */
export const deviceCategories = pgTable('device_categories', {
  id: id(),
  name: text('name').notNull().unique(),
  active: boolean('active').notNull().default(true),
});

/** Um modelo de aparelho (ex.: Grandstream GXP1610). Diz se é contado um a um ou por quantidade. */
export const deviceModels = pgTable('device_models', {
  id: id(),
  /** Código curto ("gxp1610") */
  code: text('code').notNull().unique(),
  /** Nome exibido */
  name: text('name').notNull(),
  categoryId: text('category_id').references(() => deviceCategories.id),
  /** "serializado" = cada unidade tem MAC e linha própria · "granel" = contado por quantidade */
  tracking: text('tracking').notNull(),
  imageUrl: text('image_url'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

/** Um aparelho serializado, identificado pelo MAC (decisão V7). */
export const devices = pgTable(
  'devices',
  {
    id: id(),
    modelId: text('model_id').notNull().references(() => deviceModels.id),
    /** MAC principal, 12 hexadecimais maiúsculos sem separador. Único. */
    mac: text('mac').notNull(),
    /** Segundo MAC (Wi-Fi, por exemplo), se houver */
    macSecondary: text('mac_secondary'),
    /** Etiqueta/patrimônio interno opcional (o "N001" do Nexus) */
    tag: text('tag'),
    /** Onde está: nulo = no estoque; preenchido = com este cliente */
    clientId: text('client_id').references(() => clients.id),
    /** Como chegou ao cliente atual: locacao | venda | comodato (nulo se em estoque) */
    currentModality: text('current_modality'),
    /** ativo | manutencao | baixado | vendido (decisão V6: sem "indeterminado") */
    condition: text('condition').notNull().default('ativo'),
    /** Valor do aparelho em centavos (alimenta "valor total locado") */
    valueCents: integer('value_cents'),
    /** IP configurado no aparelho, se houver */
    ip: text('ip'),
    /** Onde fisicamente está ("Rack 3 · Sala 2") */
    location: text('location'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex('devices_mac_uq').on(t.mac), index('devices_model_idx').on(t.modelId), index('devices_client_idx').on(t.clientId)],
);

/** Saldo de itens a granel por lugar: "Headset Genérico · Estoque · 28", "Headset Genérico · Cliente A · 4". */
export const bulkStock = pgTable(
  'bulk_stock',
  {
    id: id(),
    modelId: text('model_id').notNull().references(() => deviceModels.id),
    /** Nulo = estoque; preenchido = com o cliente */
    clientId: text('client_id').references(() => clients.id),
    /** Como chegou ao cliente (locacao | venda | comodato); "estoque" quando no estoque */
    modality: text('modality').notNull().default('estoque'),
    quantity: integer('quantity').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('bulk_stock_uq').on(t.modelId, t.clientId, t.modality)],
);

/** Cabeçalho de uma movimentação: de onde, para onde, por quê, quem, quando. Nunca é editada. */
export const deviceMovements = pgTable(
  'device_movements',
  {
    id: id(),
    /** locacao | venda | comodato | devolucao */
    modality: text('modality').notNull(),
    /** Origem: nulo = estoque */
    fromClientId: text('from_client_id').references(() => clients.id),
    /** Destino: nulo = estoque */
    toClientId: text('to_client_id').references(() => clients.id),
    /** Condição aplicada aos aparelhos nesta movimentação (nulo = manteve) */
    newCondition: text('new_condition'),
    /** Valor total da movimentação em centavos (venda, por exemplo) */
    valueCents: integer('value_cents'),
    note: text('note'),
    /** Quem executou */
    userId: text('user_id').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('device_movements_created_idx').on(t.createdAt)],
);

/** Um item da movimentação: ou um aparelho serializado (deviceId) ou uma quantidade de um modelo a granel. */
export const deviceMovementItems = pgTable('device_movement_items', {
  id: id(),
  movementId: text('movement_id').notNull().references(() => deviceMovements.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull().references(() => deviceModels.id),
  /** Preenchido para serializado */
  deviceId: text('device_id').references(() => devices.id),
  /** 1 para serializado; N para granel */
  quantity: integer('quantity').notNull().default(1),
});

// ---------------------------------------------------------------------
// 4. SEGURANÇA E HISTÓRICO
// ---------------------------------------------------------------------

/** Um papel = um nome + uma lista de permissões (ver packages/shared/src/permissoes.ts). */
export const roles = pgTable('roles', {
  id: id(),
  /** Chave estável ("administrador"); nula para papéis criados pela tela */
  key: text('key').unique(),
  name: text('name').notNull().unique(),
  description: text('description'),
  /** Lista de chaves de permissão, ex.: ["records.read","dids.assign"] */
  permissions: text('permissions').array().notNull().default([]),
  /** Papéis do sistema não podem ser apagados */
  isSystem: boolean('is_system').notNull().default(false),
});

/** Quem entra no sistema. */
export const users = pgTable('users', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  /** Senha de entrada, com hash Argon2 (nunca a senha em si) */
  passwordHash: text('password_hash').notNull(),
  roleId: text('role_id').notNull().references(() => roles.id),
  active: boolean('active').notNull().default(true),
  /** Última vez que entrou */
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Sessão de login (cookie). Expira sozinha. */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/**
 * O COFRE. Toda senha do sistema mora aqui, cifrada (AES-256-GCM) com a chave-mestra
 * que fica FORA do banco. Sem a chave, esta tabela é ruído.
 */
export const secrets = pgTable('secrets', {
  id: id(),
  /** Rótulo legível: "Senha SSH do LinePBX", "Senha do tronco" */
  label: text('label').notNull(),
  /** Valor cifrado (base64) */
  ciphertext: text('ciphertext').notNull(),
  /** Vetor de inicialização da cifra (base64) */
  iv: text('iv').notNull(),
  /** Etiqueta de autenticação da cifra (base64) */
  authTag: text('auth_tag').notNull(),
  /** Versão da chave usada (permite rotação) */
  keyVersion: integer('key_version').notNull().default(1),
  updatedBy: text('updated_by'),
  updatedAt: updatedAt(),
  createdAt: createdAt(),
});

/**
 * Quem fez o quê, em qual registro, quando — com o antes e o depois.
 * Inclui ações sensíveis: revelar senha, exportar com senhas, edição em massa, importação.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    userId: text('user_id').references(() => users.id),
    /** create | update | delete | restore | reveal_secret | bulk_update | import | export | login | logout */
    action: text('action').notNull(),
    /** Tipo do registro: client | did | circuit | device | secret | user... */
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    /** Resumo legível: "Alterou circuito de 312 DIDs" */
    summary: text('summary').notNull(),
    /** Estado anterior, quando faz sentido */
    before: jsonb('before'),
    /** Estado posterior */
    after: jsonb('after'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_entity_idx').on(t.entityType, t.entityId), index('audit_user_idx').on(t.userId), index('audit_created_idx').on(t.createdAt)],
);

// ---------------------------------------------------------------------
// RELAÇÕES (para consultas com "traga junto")
// ---------------------------------------------------------------------

export const clientsRelations = relations(clients, ({ many }) => ({
  subscriptions: many(subscriptions),
  didsInUse: many(dids, { relationName: 'didClient' }),
  devices: many(devices),
}));

export const productsRelations = relations(products, ({ many }) => ({
  modules: many(productModules),
  subscriptions: many(subscriptions),
}));
export const productModulesRelations = relations(productModules, ({ one }) => ({
  product: one(products, { fields: [productModules.productId], references: [products.id] }),
}));
export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  client: one(clients, { fields: [subscriptions.clientId], references: [clients.id] }),
  product: one(products, { fields: [subscriptions.productId], references: [products.id] }),
  linepbx: one(linepbxSettings, { fields: [subscriptions.id], references: [linepbxSettings.subscriptionId] }),
  szchat: one(szchatSettings, { fields: [subscriptions.id], references: [szchatSettings.subscriptionId] }),
  modules: many(subscriptionModules),
}));
export const subscriptionModulesRelations = relations(subscriptionModules, ({ one }) => ({
  subscription: one(subscriptions, { fields: [subscriptionModules.subscriptionId], references: [subscriptions.id] }),
  module: one(productModules, { fields: [subscriptionModules.moduleId], references: [productModules.id] }),
  fop2: one(fop2Settings, { fields: [subscriptionModules.id], references: [fop2Settings.subscriptionModuleId] }),
  omniboard: one(omniboardSettings, { fields: [subscriptionModules.id], references: [omniboardSettings.subscriptionModuleId] }),
}));

export const linepbxRelations = relations(linepbxSettings, ({ one }) => ({
  hosting: one(hostingProviders, { fields: [linepbxSettings.hostingId], references: [hostingProviders.id] }),
}));

export const circuitsRelations = relations(circuits, ({ one, many }) => ({
  carrier: one(carriers, { fields: [circuits.carrierId], references: [carriers.id] }),
  owner: one(clients, { fields: [circuits.ownerClientId], references: [clients.id] }),
  dids: many(dids),
}));

export const didsRelations = relations(dids, ({ one }) => ({
  circuit: one(circuits, { fields: [dids.circuitId], references: [circuits.id] }),
  client: one(clients, { fields: [dids.clientId], references: [clients.id], relationName: 'didClient' }),
  owner: one(clients, { fields: [dids.ownerClientId], references: [clients.id], relationName: 'didOwner' }),
}));

export const deviceModelsRelations = relations(deviceModels, ({ one, many }) => ({
  category: one(deviceCategories, { fields: [deviceModels.categoryId], references: [deviceCategories.id] }),
  devices: many(devices),
  bulk: many(bulkStock),
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  model: one(deviceModels, { fields: [devices.modelId], references: [deviceModels.id] }),
  client: one(clients, { fields: [devices.clientId], references: [clients.id] }),
}));

export const bulkStockRelations = relations(bulkStock, ({ one }) => ({
  model: one(deviceModels, { fields: [bulkStock.modelId], references: [deviceModels.id] }),
  client: one(clients, { fields: [bulkStock.clientId], references: [clients.id] }),
}));

export const deviceMovementsRelations = relations(deviceMovements, ({ one, many }) => ({
  from: one(clients, { fields: [deviceMovements.fromClientId], references: [clients.id], relationName: 'movFrom' }),
  to: one(clients, { fields: [deviceMovements.toClientId], references: [clients.id], relationName: 'movTo' }),
  user: one(users, { fields: [deviceMovements.userId], references: [users.id] }),
  items: many(deviceMovementItems),
}));

export const deviceMovementItemsRelations = relations(deviceMovementItems, ({ one }) => ({
  movement: one(deviceMovements, { fields: [deviceMovementItems.movementId], references: [deviceMovements.id] }),
  model: one(deviceModels, { fields: [deviceMovementItems.modelId], references: [deviceModels.id] }),
  device: one(devices, { fields: [deviceMovementItems.deviceId], references: [devices.id] }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, { fields: [auditLog.userId], references: [users.id] }),
}));
