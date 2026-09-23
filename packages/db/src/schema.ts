/**
 * =====================================================================
 *  Ingline Gestão — definição do banco de dados
 *
 *  Como ler: cada `pgTable` é uma tabela. Cada linha dentro dela é uma coluna.
 *  O comentário logo acima explica o que aquilo guarda — em português, para quem não programa.
 *
 *  Grupos: 1. Clientes e produtos · 2. Numeração · 3. Inventário · 4. Segurança e histórico · 5. Novidades
 *          6. Projetos · 7. Chamados do LineChat (cópia só de leitura, alimentada pela sincronização)
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

/**
 * A logo do cliente, guardada no próprio banco (uma linha por cliente que tem logo).
 * Fica em tabela separada para não pesar as consultas de lista: a imagem só é lida quando alguém a exibe.
 * A interface reduz a imagem antes de enviar; o servidor recusa acima de 512 KB.
 */
export const clientLogos = pgTable('client_logos', {
  clientId: text('client_id').primaryKey().references(() => clients.id, { onDelete: 'cascade' }),
  /** Tipo da imagem: image/png, image/jpeg, image/webp, image/svg+xml */
  mimeType: text('mime_type').notNull(),
  /** A imagem em base64 (sem o prefixo "data:") */
  dataBase64: text('data_base64').notNull(),
  /** Tamanho aproximado em bytes, para exibir e limitar */
  sizeBytes: integer('size_bytes').notNull().default(0),
  updatedAt: updatedAt(),
});

/**
 * As UNIDADES de um cliente: matriz, filiais, lojas, andares. Todo cliente tem a "Matriz",
 * criada sozinha; as outras se cadastram na ficha do cliente. É daqui que sai a lista de
 * unidades na hora de movimentar aparelhos.
 * O aparelho guarda o NOME da unidade (`devices.unit`); renomear aqui renomeia nos aparelhos.
 */
export const clientUnits = pgTable(
  'client_units',
  {
    id: id(),
    clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    /** Nome da unidade: "Matriz", "Loja Simões Filho" */
    name: text('name').notNull(),
    /** A matriz: existe em todo cliente, é a unidade padrão e não pode ser removida */
    isMain: boolean('is_main').notNull().default(false),
    /** Endereço da unidade (rua, número, bairro, cidade) */
    address: text('address'),
    /** IP fixo de saída da rede desta unidade — o IP que chega ao servidor quando os ramais registram */
    egressIp: text('egress_ip'),
    /** Observação ou referência, opcional */
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('client_units_client_idx').on(t.clientId)],
);

/**
 * LOGIN E SENHA PADRÃO DOS APARELHOS do cliente, POR MODELO: todos os GXP1610 de um cliente
 * entram com o mesmo login e senha; os DP722, com outro. Uma linha por cliente × modelo.
 * A senha nunca fica aqui — vai para o cofre (`secrets`). Faz par com a rede padrão.
 */
export const clientDeviceLogins = pgTable(
  'client_device_logins',
  {
    id: id(),
    clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    /** O modelo de aparelho a que este login se aplica */
    modelId: text('model_id').notNull().references(() => deviceModels.id),
    /** Usuário/login padrão (admin, user…) */
    username: text('username'),
    /** Senha padrão — no cofre */
    passwordSecretId: text('password_secret_id').references(() => secrets.id),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('client_device_logins_client_idx').on(t.clientId)],
);

/**
 * CONFIGURAÇÃO DE REDE PADRÃO dos aparelhos do cliente: o que a equipe digita nos telefones
 * na hora de configurar (IP, máscara, gateway, DNS) e a senha do ramal sem fio. Uma linha por cliente.
 */
export const clientNetworkSettings = pgTable('client_network_settings', {
  clientId: text('client_id').primaryKey().references(() => clients.id, { onDelete: 'cascade' }),
  /** IP padrão (ou o primeiro da faixa usada nos aparelhos) */
  ipAddress: text('ip_address'),
  /** Máscara de sub-rede (255.255.255.0) */
  subnetMask: text('subnet_mask'),
  /** Roteador padrão (gateway) */
  defaultRouter: text('default_router'),
  /** DNS primário */
  dns1: text('dns1'),
  /** DNS secundário */
  dns2: text('dns2'),
  /** Senha do ramal sem fio (DECT/Wi-Fi) — no cofre */
  wirelessPasswordSecretId: text('wireless_password_secret_id').references(() => secrets.id),
  note: text('note'),
  updatedAt: updatedAt(),
});

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
  /**
   * Preenchido quando o produto foi para a lixeira. Some das fichas, dos filtros e dos cartões,
   * mas as assinaturas ficam guardadas e voltam se o produto for restaurado.
   */
  deletedAt: deletedAt(),
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
  /**
   * Usuário do SSH — NÃO É MAIS USADO pela tela: cada técnico entra com o próprio usuário
   * (ver `users.sshUser`). Fica guardado para não perder o que veio do Nexus.
   */
  sshUser: text('ssh_user'),
  /** Porta do SSH (22 por padrão) */
  sshPort: integer('ssh_port').default(22),
  /** Senha do SSH (no cofre) — também fora da tela, pelo mesmo motivo do usuário */
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
  /** Senha do usuário padrão do FOP2 — no cofre */
  defaultUserPasswordSecretId: text('default_user_password_secret_id').references(() => secrets.id),
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
    /** Número chave (número piloto): o número principal do feixe junto à operadora */
    keyNumber: text('key_number'),
    /** Titular do circuito: quem detém o contrato com a operadora (normalmente VoiceNet) */
    ownerClientId: text('owner_client_id').references(() => clients.id),
    /**
     * Circuito que NÃO é da VoiceNet: o tronco que o próprio cliente contratou de outra operadora.
     * Guardar é útil (dá para saber a numeração dele), mas polui o controle da VoiceNet — por isso
     * fica fora das listas, dos cartões e do painel até alguém ligar "links de terceiros".
     */
    thirdParty: boolean('third_party').notNull().default(false),
    /** Custo/valor mensal do feixe, em centavos */
    monthlyValueCents: integer('monthly_value_cents'),
    /**
     * Como o tronco se autentica na operadora:
     *  - `ip`: pelo IP — basta o IP da operadora e o IP do PBX
     *  - `login`: por login e senha do tronco
     */
    authType: text('auth_type').notNull().default('ip'),
    /** IP da operadora (sinalização) */
    signalingIp: text('signaling_ip'),
    /** IP do PBX que a operadora autoriza (só na autenticação por IP; "IP PBX" no Nexus) */
    authIp: text('auth_ip'),
    /** Login do tronco (só na autenticação por login e senha) */
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
    /**
     * Circuito ao qual pertence. Todo DID nasce dentro de um circuito (o servidor exige);
     * a coluna continua aceitando nulo só por causa de registros antigos.
     */
    circuitId: text('circuit_id').references(() => circuits.id),
    /** Cliente que USA o número. Nulo = livre. */
    clientId: text('client_id').references(() => clients.id),
    /** Titular: quem DETÉM o número junto à operadora (normalmente VoiceNet) */
    ownerClientId: text('owner_client_id').references(() => clients.id),
    /**
     * O número está EM USO no cliente? Alocar não é usar: o DID entra no cliente como "não usado"
     * e alguém marca "em uso" quando ele passa a atender. Só faz sentido com cliente (livre = false).
     */
    inUse: boolean('in_use').notNull().default(false),
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
  /** Endereço de imagem externa (não usado: a foto fica em `device_model_images`) */
  imageUrl: text('image_url'),
  /**
   * Valor de cada unidade deste modelo, em centavos. É o valor que soma no cliente — o
   * aparelho só tem valor próprio quando foi cadastrado diferente do modelo.
   */
  valueCents: integer('value_cents'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

/** A foto do modelo, no próprio banco (como a logo do cliente). Reduzida no navegador antes de subir. */
export const deviceModelImages = pgTable('device_model_images', {
  modelId: text('model_id').primaryKey().references(() => deviceModels.id, { onDelete: 'cascade' }),
  mimeType: text('mime_type').notNull(),
  dataBase64: text('data_base64').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  updatedAt: updatedAt(),
});

/**
 * Um aparelho. Cada unidade é uma linha, sempre — inclusive as que não têm MAC
 * (headset, cabo). O MAC identifica quem tem; quem não tem fica nulo e a tela mostra
 * "não aplicável". Não existe contagem por quantidade: é um por linha, sem exceção.
 */
export const devices = pgTable(
  'devices',
  {
    id: id(),
    modelId: text('model_id').notNull().references(() => deviceModels.id),
    /** MAC principal, 12 hexadecimais maiúsculos sem separador. Único quando existe; nulo em quem não tem MAC. */
    mac: text('mac'),
    /** Segundo MAC (Wi-Fi, por exemplo), se houver */
    macSecondary: text('mac_secondary'),
    /**
     * Número de série (N/S), para o aparelho que não tem MAC mas tem etiqueta de série.
     * Não se repete dentro do mesmo modelo.
     */
    serialNumber: text('serial_number'),
    /** Atribuído a: nulo = no estoque; preenchido = com este cliente */
    clientId: text('client_id').references(() => clients.id),
    /** Unidade do cliente onde o aparelho está (filial, loja, andar): "Loja Simões Filho" */
    unit: text('unit'),
    /** Como chegou ao cliente atual: locacao | venda | comodato (nulo se em estoque) */
    currentModality: text('current_modality'),
    /** ativo | inativo. Vendido não é condição: sai da modalidade da última movimentação. */
    condition: text('condition').notNull().default('ativo'),
    /** Valor PRÓPRIO do aparelho em centavos. Vazio = vale o valor do modelo (o caso normal). */
    valueCents: integer('value_cents'),
    /** IP configurado no aparelho, se houver */
    ip: text('ip'),
    /** Onde fisicamente estava ("Prateleira B"). Saiu da tela; fica guardado para não perder o que já foi digitado. */
    location: text('location'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex('devices_mac_uq').on(t.mac), index('devices_model_idx').on(t.modelId), index('devices_client_idx').on(t.clientId), index('devices_serial_idx').on(t.serialNumber)],
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
    /** Unidade do cliente de destino para onde os aparelhos foram (nulo na devolução) */
    unit: text('unit'),
    /** Valor total da movimentação em centavos (venda, por exemplo) */
    valueCents: integer('value_cents'),
    note: text('note'),
    /** Quem executou */
    userId: text('user_id').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('device_movements_created_idx').on(t.createdAt)],
);

/** Um aparelho dentro de uma movimentação. Uma linha por aparelho — a quantidade é o número de linhas. */
export const deviceMovementItems = pgTable('device_movement_items', {
  id: id(),
  movementId: text('movement_id').notNull().references(() => deviceMovements.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull().references(() => deviceModels.id),
  deviceId: text('device_id').notNull().references(() => devices.id),
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
  /**
   * O usuário SSH desta pessoa. Cada técnico tem o seu, e é o mesmo em todos os servidores —
   * por isso mora aqui, e não no cliente. O atalho "SSH" da ficha usa este usuário.
   */
  sshUser: text('ssh_user'),
  /** Última vez que entrou */
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  /**
   * Verificação em duas etapas (o código de 6 dígitos do celular).
   * `totpSecret` guarda o segredo CIFRADO com a chave-mestra, no formato "iv:tag:texto".
   * Enquanto `totpEnabledAt` for nulo, o segredo é só um rascunho: foi gerado, mas a pessoa
   * ainda não confirmou com um código, então o login continua só com senha.
   */
  totpSecret: text('totp_secret'),
  totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
  /** Códigos de recuperação ainda não usados, guardados como hash (JSON de strings) */
  totpRecovery: text('totp_recovery'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * AJUSTES DO SISTEMA que a pessoa preenche na tela (Administração › Ajustes), em vez de
 * mexer em arquivo no servidor. Uma linha por assunto: 'backup' e 'avisos'.
 *
 *  - `value` guarda o que NÃO é segredo (pasta do Drive, endereço do aviso, se está ligado,
 *    e o resultado do último envio), em JSON
 *  - `secretId` aponta para o cofre, onde mora o que é segredo: a chave da conta de serviço
 *    do Google e o token da API de avisos
 */
export const settings = pgTable('settings', {
  /** 'backup' | 'avisos' | 'linechat' | 'chamados-painel' (a arrumação da tela de Chamados) */
  id: text('id').primaryKey(),
  value: text('value').notNull().default('{}'),
  secretId: text('secret_id').references(() => secrets.id),
  updatedAt: updatedAt(),
  updatedBy: text('updated_by').references(() => users.id),
});

/** Sessão de login (cookie). Expira sozinha. */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** true = entrou com a senha certa, mas ainda falta o código de 6 dígitos. Não vale como login. */
    pendingTotp: boolean('pending_totp').notNull().default(false),
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
// 5. NOVIDADES (notas de versão)
// ---------------------------------------------------------------------

/**
 * Uma NOTA DE VERSÃO ("o que mudou na rodada 23"). Quando publicada, aparece uma vez para
 * cada pessoa no login e só para de aparecer quando ela marca "Li e entendi".
 * Rascunho = `publishedAt` nulo: ninguém vê até publicar.
 */
export const releaseNotes = pgTable(
  'release_notes',
  {
    id: id(),
    /** Identificador curto e estável da versão ("rodada-23"); é por ele que a importação evita repetir */
    version: text('version').notNull(),
    /** O que aparece no topo da nota */
    title: text('title').notNull(),
    /** Uma frase resumindo a rodada */
    summary: text('summary'),
    /** Quando foi publicada. Nulo = rascunho (só quem edita enxerga). */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex('release_notes_version_uq').on(t.version)],
);

/**
 * Um item da nota: o cartão que a pessoa vê, um por vez.
 * `kind` diz a cor e o rótulo: novo | melhorou | corrigido | atencao
 * ("atenção" é mudança de regra, o que muda o jeito de trabalhar).
 */
export const releaseNoteItems = pgTable(
  'release_note_items',
  {
    id: id(),
    noteId: text('note_id').notNull().references(() => releaseNotes.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('novo'),
    title: text('title').notNull(),
    /** Duas ou três linhas explicando, em português de gente */
    text: text('text'),
    /** Ordem em que os cartões aparecem */
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('release_note_items_note_idx').on(t.noteId)],
);

/** O print de um item, no próprio banco (como a logo do cliente e a foto do modelo). */
export const releaseNoteImages = pgTable('release_note_images', {
  itemId: text('item_id').primaryKey().references(() => releaseNoteItems.id, { onDelete: 'cascade' }),
  mimeType: text('mime_type').notNull(),
  dataBase64: text('data_base64').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  updatedAt: updatedAt(),
});

/** "Fulano leu a nota da rodada 23 em tal dia." Uma linha por pessoa × nota. */
export const releaseNoteReads = pgTable(
  'release_note_reads',
  {
    id: id(),
    noteId: text('note_id').notNull().references(() => releaseNotes.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('release_note_reads_note_user_uq').on(t.noteId, t.userId)],
);

// ---------------------------------------------------------------------
// 6. PROJETOS
// ---------------------------------------------------------------------

/**
 * Um projeto é uma tarefa que percorre VÁRIOS clientes até acabar
 * ("trocar o áudio da URA de todos os clientes com PBX").
 *
 * O que define o projeto: o objetivo, o prazo e as ETAPAS — as mesmas para todo cliente da lista.
 * Quem faz o trabalho vai marcando etapa por etapa; o andamento é contado a partir dessas marcas.
 */
export const projects = pgTable(
  'projects',
  {
    id: id(),
    /** Como a equipe chama o projeto ("Áudio novo das URAs") */
    name: text('name').notNull(),
    /** O que se quer alcançar e por quê — o que a pessoa lê antes de começar */
    goal: text('goal'),
    /** aberto = em andamento · concluido = acabou · cancelado = não vai acontecer */
    status: text('status').notNull().default('aberto'),
    /** Data-alvo do projeto inteiro (AAAA-MM-DD). Passou e ainda tem cliente aberto = atrasado. */
    dueDate: text('due_date'),
    /** Responsável pelo projeto como um todo (quem cobra) */
    ownerId: text('owner_id').references(() => users.id),
    /** Quando foi dado por encerrado */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('projects_status_idx').on(t.status)],
);

/**
 * Uma etapa (coluna) do projeto. Vale para todos os clientes da lista, na mesma ordem.
 *
 * São dois tipos:
 *  - **caixinha** (`check`): feito ou não feito, o caso mais comum;
 *  - **lista de opções** (`escolha`): a pessoa escolhe um rótulo colorido
 *    ("Sem necessidade · Pendente · Mensagem enviada · Configuração realizada"),
 *    como as colunas de situação que a equipe já usava na planilha.
 *
 * As opções ficam em `options`: `[{ id, label, tone, conclui }]`. `tone` é a cor
 * (as mesmas do sistema) e `conclui` diz se aquela opção **fecha** a etapa — é o que
 * faz "Sem necessidade" e "Configuração realizada" contarem como resolvido, e
 * "Pendente" não. O `id` é estável: trocar o rótulo não perde o que já foi escolhido.
 */
export const projectSteps = pgTable(
  'project_steps',
  {
    id: id(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    /** O que fazer ("Gravar o áudio") ou o nome da coluna ("Situação do contato") */
    title: text('title').notNull(),
    /** check = caixinha · escolha = lista de opções */
    kind: text('kind').notNull().default('check'),
    /** As opções, quando `kind` é "escolha" */
    options: jsonb('options').$type<Array<{ id: string; label: string; tone: string; conclui: boolean }>>().notNull().default([]),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('project_steps_project_idx').on(t.projectId)],
);

/**
 * Um cliente dentro do projeto: a linha que o técnico trabalha.
 *
 * `status` é a situação daquele cliente no projeto:
 *   pendente · andamento · travado · concluido · nao_se_aplica
 * Ela anda sozinha conforme as etapas são marcadas (primeira marca → andamento, todas → concluído);
 * "travado" e "não se aplica" são escolhas de gente, e "travado" exige dizer o motivo.
 */
export const projectClients = pgTable(
  'project_clients',
  {
    id: id(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    /** Quem ficou de fazer este cliente */
    assigneeId: text('assignee_id').references(() => users.id),
    status: text('status').notNull().default('pendente'),
    /** Por que está parado — obrigatório quando o status é "travado" */
    blockedReason: text('blocked_reason'),
    /** Quando fechou (concluído ou não se aplica) */
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('project_clients_uq').on(t.projectId, t.clientId),
    index('project_clients_client_idx').on(t.clientId),
    index('project_clients_assignee_idx').on(t.assigneeId),
  ],
);

/**
 * O que foi marcado numa etapa, para um cliente: "fulano marcou, em tal dia".
 * Sem linha = ainda não mexeram naquela etapa.
 *
 * Em etapa de **caixinha**, a linha existir já quer dizer "feito" e `value` fica nulo.
 * Em **lista de opções**, `value` guarda o id da opção escolhida.
 */
export const projectChecks = pgTable(
  'project_checks',
  {
    id: id(),
    projectClientId: text('project_client_id').notNull().references(() => projectClients.id, { onDelete: 'cascade' }),
    stepId: text('step_id').notNull().references(() => projectSteps.id, { onDelete: 'cascade' }),
    /** O id da opção escolhida (só em etapa de lista); nulo na caixinha */
    value: text('value'),
    doneById: text('done_by_id').references(() => users.id),
    doneAt: timestamp('done_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('project_checks_uq').on(t.projectClientId, t.stepId)],
);

/**
 * Um comentário. Sem `projectClientId` é um recado do projeto inteiro;
 * com ele, é conversa sobre aquele cliente ("liguei, pediram para voltar semana que vem").
 */
export const projectComments = pgTable(
  'project_comments',
  {
    id: id(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    projectClientId: text('project_client_id').references(() => projectClients.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id),
    body: text('body').notNull(),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('project_comments_project_idx').on(t.projectId), index('project_comments_client_idx').on(t.projectClientId)],
);

/**
 * Um anexo: planilha, documento, print, áudio da URA — qualquer formato, até o limite da tela.
 * Fica no próprio banco (como a logo do cliente), então entra no backup junto com o resto;
 * por isso o limite de tamanho é baixo de propósito. `fileName` é o nome com que a pessoa baixa.
 */
export const projectAttachments = pgTable(
  'project_attachments',
  {
    id: id(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    projectClientId: text('project_client_id').references(() => projectClients.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    dataBase64: text('data_base64').notNull(),
    uploadedById: text('uploaded_by_id').references(() => users.id),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('project_attachments_project_idx').on(t.projectId), index('project_attachments_client_idx').on(t.projectClientId)],
);

// ---------------------------------------------------------------------
// 7. CHAMADOS DO LINECHAT
// ---------------------------------------------------------------------
//
// Os chamados de suporte são abertos e trabalhados no LineChat (o Kanban da equipe). Estas
// tabelas são uma CÓPIA SÓ DE LEITURA de um painel de lá, mantida pela sincronização
// (`apps/api/src/services/linechat.ts`): a tela de Chamados lê daqui, nunca da API do LineChat
// — a API devolve no máximo 100 cards por vez, e contar 3 mil cards a cada clique seria lento.
//
// Ninguém edita estas linhas pela tela. Os ids são os do próprio LineChat, para a sincronização
// saber qual card é qual sem tabela de equivalência.

/** As etapas (colunas) do painel, na ordem em que aparecem no Kanban. */
export const linechatSteps = pgTable('linechat_steps', {
  /** O id da etapa no LineChat */
  id: text('id').primaryKey(),
  /** O nome da coluna ("Chamado Em Tratativa N1") */
  title: text('title').notNull(),
  /** A ordem da coluna no Kanban, da esquerda para a direita */
  position: integer('position').notNull().default(0),
  /** Etapa onde o chamado nasce ("Novos Suporte") */
  isInitial: boolean('is_initial').notNull().default(false),
  /** Etapa que encerra o chamado ("Chamado Tratado", "Chamado Validado"): chegar nela = fechado */
  isFinal: boolean('is_final').notNull().default(false),
  /** A etapa foi arquivada ou apagada lá: continua aqui para os chamados antigos não perderem o nome */
  archived: boolean('archived').notNull().default(false),
  /** Última vez que a sincronização leu esta etapa */
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Os campos personalizados do painel (Cliente, Produto, Assunto, Tipo de chamado…).
 * A tela monta um filtro e um gráfico para cada campo de lista, lendo daqui — campo novo no
 * LineChat aparece sozinho, sem mexer no código.
 */
export const linechatFields = pgTable('linechat_fields', {
  /** A chave do campo no LineChat ("cliente-71", "plataforma") — é o nome dele dentro de `customFields` */
  key: text('key').primaryKey(),
  /** O nome que aparece na tela ("Cliente", "Produto") */
  name: text('name').notNull(),
  /** SINGLESELECT · MULTISELECT · TEXT · DATETIME… (o tipo que o LineChat informa) */
  type: text('type').notNull(),
  /** A ordem do campo no formulário do card */
  position: integer('position').notNull().default(0),
  /** As opções da lista, na ordem de lá (só nos campos de lista) */
  options: jsonb('options').$type<string[]>().notNull().default([]),
  /** O campo sumiu do painel: some dos filtros, mas o valor antigo continua nos cards */
  archived: boolean('archived').notNull().default(false),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

/** As etiquetas do painel (P/ Alta, NIA - ERRO, StandBy…), com a cor de lá. */
export const linechatTags = pgTable('linechat_tags', {
  /** O id da etiqueta no LineChat */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** A cor de fundo que o LineChat usa (ex.: "rgb(255, 153, 255)") */
  color: text('color'),
  archived: boolean('archived').notNull().default(false),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Um chamado (card do LineChat), do jeito que ele estava na última sincronização.
 *
 * Três momentos que a tela usa:
 *  - `createdAt` — quando o chamado foi aberto (o que o Grafana contava);
 *  - `closedAt` — quando ele chegou numa etapa final. Nos chamados que já estavam fechados antes
 *    da primeira sincronização não dá para saber a hora exata (a API não entrega o histórico):
 *    usamos a última alteração do card e marcamos `closedEstimated`;
 *  - `removedAt` — o card sumiu do LineChat (excluído lá). Some das contas, mas não é apagado.
 */
export const linechatCards = pgTable(
  'linechat_cards',
  {
    /** O id do card no LineChat */
    id: text('id').primaryKey(),
    /** O painel de onde o card veio */
    panelId: text('panel_id').notNull(),
    /** O número sequencial do card (3607) */
    number: integer('number'),
    /** O código que a equipe fala ("IS-3607") */
    key: text('key'),
    title: text('title').notNull().default(''),
    description: text('description'),
    /** A etapa atual (nula quando o card está arquivado: o LineChat não informa) */
    stepId: text('step_id'),
    /** O nome da etapa atual, guardado junto para a etapa apagada não virar "?" */
    stepTitle: text('step_title'),
    /** INITIAL · INTERMEDIATE · FINAL — em que ponto do fluxo a etapa está */
    stepPhase: text('step_phase'),
    /** OPEN = ativo no Kanban · ARCHIVED = arquivado lá (WON/LOST só existem em painel de vendas) */
    status: text('status').notNull().default('OPEN'),
    /** O responsável no LineChat (id e nome; nulo = sem responsável) */
    responsibleId: text('responsible_id'),
    responsibleName: text('responsible_name'),
    /** O vencimento que a equipe pôs no card */
    dueDate: timestamp('due_date', { withTimezone: true }),
    /** O LineChat diz se o card está vencido */
    isOverdue: boolean('is_overdue').notNull().default(false),
    /** As etiquetas do card (ids de `linechat_tags`) */
    tagIds: text('tag_ids').array().notNull().default([]),
    /**
     * Os campos personalizados, do jeito que o LineChat manda: a chave do campo → o valor
     * (texto nos campos de escolha única, lista de textos nos de múltipla escolha).
     */
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
    /** Quando o chamado foi aberto no LineChat */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** A última alteração do card no LineChat */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    /** Quando chegou numa etapa final (nulo = ainda aberto, ou reaberto depois) */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** true = `closedAt` é a última alteração do card, não a hora exata (fechado antes de sincronizarmos) */
    closedEstimated: boolean('closed_estimated').notNull().default(false),
    /** Quando o card foi arquivado no LineChat (a hora em que percebemos) */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    /** O card sumiu do LineChat na conferência completa */
    removedAt: timestamp('removed_at', { withTimezone: true }),
    /** Quando a sincronização viu este card pela primeira vez */
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Última vez que uma conferência completa encontrou o card lá */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('linechat_cards_panel_idx').on(t.panelId),
    index('linechat_cards_created_idx').on(t.createdAt),
    index('linechat_cards_step_idx').on(t.stepId),
  ],
);

/**
 * Cada vez que um chamado mudou de etapa. É o que a API do LineChat não entrega, então nós
 * guardamos: a sincronização compara a etapa que o card tem agora com a que tinha antes.
 * É daqui que sai o "quanto tempo ficou no N1".
 *
 * A primeira vez que um card aparece também vira uma linha (sem etapa de origem):
 *  - card aberto depois que a sincronização começou → a hora é a da abertura, exata;
 *  - card que já existia → não se sabe desde quando está naquela etapa: `estimated` = true.
 */
export const linechatCardMoves = pgTable(
  'linechat_card_moves',
  {
    id: id(),
    cardId: text('card_id').notNull().references(() => linechatCards.id, { onDelete: 'cascade' }),
    /** A etapa de onde saiu (nula na primeira vez que o card foi visto) */
    fromStepId: text('from_step_id'),
    fromStepTitle: text('from_step_title'),
    /** A etapa para onde foi */
    toStepId: text('to_step_id'),
    toStepTitle: text('to_step_title'),
    /** Quando a mudança aconteceu: a hora da alteração do card no LineChat */
    at: timestamp('at', { withTimezone: true }).notNull(),
    /** true = não sabemos a hora exata (card que já existia antes da primeira sincronização) */
    estimated: boolean('estimated').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('linechat_card_moves_card_idx').on(t.cardId, t.at)],
);

/**
 * O registro das sincronizações: quando rodou, o que leu, o que mudou e se deu erro.
 * A de minuto em minuto só vira linha quando mudou alguma coisa ou deu erro — senão seriam
 * 1.440 linhas por dia dizendo "nada novo". Linhas com mais de 90 dias são apagadas sozinhas.
 */
export const linechatSyncRuns = pgTable(
  'linechat_sync_runs',
  {
    id: id(),
    /** completa = leu o painel inteiro · recente = só o que mudou desde a última */
    kind: text('kind').notNull(),
    /** agendada (automática) · manual (botão "Sincronizar agora") */
    trigger: text('trigger').notNull().default('agendada'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ok: boolean('ok').notNull().default(false),
    /** O resultado em uma frase, ou o erro */
    message: text('message'),
    /** Quantos cards vieram do LineChat */
    cardsRead: integer('cards_read').notNull().default(0),
    /** Quantos eram novos */
    cardsNew: integer('cards_new').notNull().default(0),
    /** Quantos mudaram de etapa */
    moves: integer('moves').notNull().default(0),
    /** Quantos sumiram do LineChat (só na completa) */
    cardsRemoved: integer('cards_removed').notNull().default(0),
    /** Quem apertou o botão (nulo na automática) */
    userId: text('user_id').references(() => users.id),
  },
  (t) => [index('linechat_sync_runs_started_idx').on(t.startedAt)],
);

// ---------------------------------------------------------------------
// RELAÇÕES (para consultas com "traga junto")
// ---------------------------------------------------------------------

export const clientLogosRelations = relations(clientLogos, ({ one }) => ({
  client: one(clients, { fields: [clientLogos.clientId], references: [clients.id] }),
}));
export const clientUnitsRelations = relations(clientUnits, ({ one }) => ({
  client: one(clients, { fields: [clientUnits.clientId], references: [clients.id] }),
}));
export const clientDeviceLoginsRelations = relations(clientDeviceLogins, ({ one }) => ({
  client: one(clients, { fields: [clientDeviceLogins.clientId], references: [clients.id] }),
  model: one(deviceModels, { fields: [clientDeviceLogins.modelId], references: [deviceModels.id] }),
}));
export const clientNetworkSettingsRelations = relations(clientNetworkSettings, ({ one }) => ({
  client: one(clients, { fields: [clientNetworkSettings.clientId], references: [clients.id] }),
}));
export const clientsRelations = relations(clients, ({ many, one }) => ({
  subscriptions: many(subscriptions),
  units: many(clientUnits),
  deviceLogins: many(clientDeviceLogins),
  network: one(clientNetworkSettings, { fields: [clients.id], references: [clientNetworkSettings.clientId] }),
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
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  model: one(deviceModels, { fields: [devices.modelId], references: [deviceModels.id] }),
  client: one(clients, { fields: [devices.clientId], references: [clients.id] }),
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

export const releaseNotesRelations = relations(releaseNotes, ({ many }) => ({
  items: many(releaseNoteItems),
  reads: many(releaseNoteReads),
}));
export const releaseNoteItemsRelations = relations(releaseNoteItems, ({ one }) => ({
  note: one(releaseNotes, { fields: [releaseNoteItems.noteId], references: [releaseNotes.id] }),
  image: one(releaseNoteImages, { fields: [releaseNoteItems.id], references: [releaseNoteImages.itemId] }),
}));
export const releaseNoteReadsRelations = relations(releaseNoteReads, ({ one }) => ({
  note: one(releaseNotes, { fields: [releaseNoteReads.noteId], references: [releaseNotes.id] }),
  user: one(users, { fields: [releaseNoteReads.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  steps: many(projectSteps),
  clients: many(projectClients),
}));
export const projectStepsRelations = relations(projectSteps, ({ one }) => ({
  project: one(projects, { fields: [projectSteps.projectId], references: [projects.id] }),
}));
export const projectClientsRelations = relations(projectClients, ({ one, many }) => ({
  project: one(projects, { fields: [projectClients.projectId], references: [projects.id] }),
  client: one(clients, { fields: [projectClients.clientId], references: [clients.id] }),
  assignee: one(users, { fields: [projectClients.assigneeId], references: [users.id] }),
  checks: many(projectChecks),
}));
export const projectChecksRelations = relations(projectChecks, ({ one }) => ({
  linha: one(projectClients, { fields: [projectChecks.projectClientId], references: [projectClients.id] }),
  step: one(projectSteps, { fields: [projectChecks.stepId], references: [projectSteps.id] }),
}));
