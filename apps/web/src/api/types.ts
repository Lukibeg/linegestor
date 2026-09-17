/**
 * Formatos dos dados que a interface recebe do servidor.
 * Espelham as respostas de apps/api. Se a API mudar, muda aqui — e o TypeScript aponta cada tela afetada.
 */
export type Me = {
  id: string; name: string; email: string; roleId: string; roleName: string; roleKey: string | null; permissions: string[]; twoFactor: boolean; recoveryLeft: number;
  /** O usuário SSH desta pessoa: entra no atalho "SSH" das fichas */
  sshUser: string | null;
};
/** Resposta da entrada: ou entrou, ou falta o código de 6 dígitos. */
export type Entrada = { needsCode: boolean; user: Me | null };

/** Administração › Ajustes */
export type AjustesBackup = {
  ativo: boolean; pasta: string; pastaId: string; contaDeServico: string;
  ultimoEnvioEm: string | null; ultimoEnvioOk: boolean | null; ultimoEnvioMsg: string | null; temChave: boolean;
};
export type AjustesAvisos = {
  ativo: boolean; url: string; metodo: 'POST' | 'GET'; cabecalhos: string; corpo: string;
  ultimoTesteEm: string | null; ultimoTesteOk: boolean | null; ultimoTesteMsg: string | null; temToken: boolean;
};

export type ProductChip = { code: string; name: string; color: string };
export type Links = { web: string | null; ssh: string | null; fop2: string | null };

/** Um produto do cliente como aparece na lista: com data de ativação e os módulos ligados. */
export type ClientProduct = ProductChip & { activatedAt: string | null; modules: Array<{ code: string; name: string; activatedAt: string | null }> };
/** Servidor do LinePBX (só os dados que podem virar coluna; senha nunca vem aqui). */
export type ClientServer = { hostingName: string | null; serverIp: string | null; domain: string | null; sshPort: number | null };

export type ClientListItem = {
  id: string; tradeName: string; legalName: string; cnpj: string; archived: boolean; isInternal: boolean;
  /** Endereço da logo: caminho relativo à API, ou nulo. Use `logoSrc()` para montar o src da imagem. */
  logoUrl: string | null;
  notes: string | null; createdAt: string; updatedAt: string;
  products: ClientProduct[]; server: ClientServer | null; links: Links; didCount: number; deviceCount: number; deviceValueCents: number;
};
export type SecretRef = { hasSecret: boolean; secretId: string | null };
/** Um módulo ligado dentro de um produto do cliente (ex.: FOP2 dentro do LinePBX). */
export type SubscriptionModule = {
  id: string; moduleCode: string; moduleName: string; hasSettings: boolean; active: boolean;
  activatedAt: string | null; deactivatedAt: string | null; notes: string | null; settings: Record<string, any> | null;
};
export type Subscription = {
  id: string; productCode: string; productName: string; color: string; hasSettings: boolean; active: boolean;
  activatedAt: string | null; deactivatedAt: string | null; notes: string | null;
  settings: Record<string, any> | null; modules: SubscriptionModule[];
};
export type ClientFull = ClientListItem & { subscriptions: Subscription[]; unitCount: number };
/** Uma unidade do cliente (Matriz, filial, loja). */
export type ClientUnit = { id: string; name: string; isMain: boolean; note: string | null; createdAt: string; deviceCount: number };

export type Circuit = {
  id: string; name: string; code: string; keyNumber: string | null; carrierId: string | null; carrierName: string | null; channels: number;
  ownerClientId: string | null; ownerName: string | null; monthlyValueCents: number | null; signalingIp: string | null; authIp: string | null;
  authUsername: string | null; authPassword: SecretRef; notes: string | null; dids: { total: number; assigned: number; free: number };
  /** true = tronco do próprio cliente, com outra operadora. Só aparece com "links de terceiros" ligado. */
  thirdParty: boolean;
};
/** Os cartões no topo da tela de Circuitos (obedecem aos mesmos filtros da lista). */
export type CircuitSummary = { circuits: number; channels: number; monthlyValueCents: number; dids: { total: number; assigned: number; free: number; noCircuit: number } };
/** Os cartões no topo do Inventário (obedecem aos mesmos filtros da lista). */
export type InventorySummary = { inStock: number; withClients: number; inactive: number; valueWithClientsCents: number; filtrado: boolean };

export type Did = {
  id: string; number: string; numberFormatted: string; free: boolean; circuitId: string | null; circuitName: string | null; circuitCode: string | null; carrierName: string | null;
  clientId: string | null; clientName: string | null; ownerClientId: string | null; ownerName: string | null; note: string | null;
  /** o circuito deste número não é da VoiceNet */
  thirdParty?: boolean;
};

export type DeviceModel = {
  id: string; code: string; name: string; categoryId: string | null; categoryName: string | null;
  /** Caminho da foto relativo à API (use `logoSrc()`), ou nulo */
  imageUrl: string | null;
  /** Valor de cada unidade deste modelo, em centavos */
  valueCents: number | null;
  /** `ownValue` = quantos aparelhos têm valor próprio, diferente do modelo */
  counts: { total: number; inStock: number; withClients: number; sold: number; inactive: number; ownValue: number };
};
export type Device = {
  /** `mac` é nulo em aparelho sem MAC; `identificacao` já vem pronta: MAC, N/S ou "não aplicável" */
  id: string; modelId: string; modelName: string; modelCode: string; mac: string | null; macFormatted: string; macSecondary: string | null;
  serialNumber: string | null; identificacao: string; identificacaoTipo: 'mac' | 'serie' | 'nenhum';
  clientId: string | null; clientName: string | null; unit: string | null; currentModality: string | null; condition: string;
  /** o valor que vale: o próprio, ou o do modelo */
  valueCents: number | null;
  /** só o valor próprio (vazio = usa o do modelo) */
  ownValueCents: number | null;
  modelValueCents: number | null;
  modelImageUrl: string | null;
  ip: string | null; location: string | null; note: string | null;
  history?: Array<{ id: string; modality: string; modalityName: string; fromName: string | null; toName: string | null; unit: string | null; newCondition: string | null; note: string | null; userName: string; createdAt: string }>;
};
export type Movement = {
  id: string; modality: string; modalityName: string; fromClientId: string | null; fromName: string | null; toClientId: string | null; toName: string | null;
  /** unidade do cliente de destino */
  unit: string | null;
  newCondition: string | null; note: string | null; userName: string; createdAt: string; items: Array<{ modelName: string; quantity: number }>;
  /** cada aparelho desta movimentação */
  devices: Array<{ id: string; modelName: string; identificacao: string }>;
};

export type Dashboard = {
  clients: { active: number; byProduct: Array<ProductChip & { n: number }> };
  dids: { total: number; assigned: number; free: number; noCircuit: number };
  circuits: Array<{ id: string; name: string; carrierName: string | null; channels: number; total: number; assigned: number; free: number }>;
  devices: { inStock: number; withClients: number; inactive: number; valueWithClientsCents: number };
  alerts: Array<{ kind: string; severity: 'warning' | 'critical'; message: string; count: number; link: string }>;
  recentMovements: Array<{ id: string; modality: string; modalityName: string; fromName: string | null; toName: string | null; userName: string; createdAt: string }>;
  recentAudit: Array<{ id: string; action: string; summary: string; userName: string | null; createdAt: string }>;
};

export type SearchResult = {
  clients: Array<{ id: string; name: string; legalName: string; cnpj: string }>;
  dids: Array<{ id: string; number: string; numberFormatted: string; clientName: string | null; circuitName: string | null }>;
  circuits: Array<{ id: string; name: string; code: string; carrierName: string | null }>;
  devices: Array<{ id: string; mac: string | null; serialNumber?: string | null; macFormatted: string; unit: string | null; modelName: string; clientName: string | null }>;
};

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number; free?: number };
export type Option = { id: string; name: string; isInternal?: boolean; internalCode?: string | null };
/** Resposta do cadastro em massa */
export type CadastroEmMassa = { created: number; modelName: string; tipo: 'mac' | 'serie' | 'nenhum' };
export type CatalogItem = { id: string; name: string; active: boolean };
export type ProductModule = { id: string; code: string; name: string; description: string | null; hasSettings: boolean; sortOrder: number; active: boolean };
export type Product = {
  id: string; code: string; name: string; color: string; description: string | null; hasSettings: boolean; sortOrder: number; active: boolean; modules: ProductModule[];
  /** o sistema depende dele (LinePBX, VoiceNet, Equipamentos): não pode ser excluído */
  protegido?: boolean;
  /** quantos clientes assinam hoje */
  activeClients?: number;
};
export type User = { id: string; name: string; email: string; active: boolean; roleId: string; roleName: string; lastLoginAt: string | null };
export type Role = { id: string; key: string | null; name: string; description: string | null; permissions: string[]; isSystem: boolean; userCount: number };
export type AuditItem = { id: string; action: string; entityType: string; entityId: string | null; summary: string; before: unknown; after: unknown; userName: string | null; createdAt: string };
export type TrashItem = { type: string; id: string; label: string; deletedAt: string };
export type ImportPlan = { entity: string; rows: Array<{ line: number; action: 'create' | 'update' | 'error' | 'skip'; key: string; errors: string[] }>; summary: { create: number; update: number; error: number; skip: number; total: number } };

export class ApiError extends Error {
  /** `details` costuma ser a lista de campos inválidos, mas alguns erros do banco mandam um texto. */
  constructor(public status: number, message: string, public details: Array<{ field: string; message: string }> | string | null = null) { super(message); }
}
