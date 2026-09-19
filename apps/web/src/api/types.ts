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
/** Configuração de rede padrão dos aparelhos do cliente (aba Equipamentos). A senha do ramal sem fio só diz se existe. */
export type ClientNetwork = { ipAddress: string | null; subnetMask: string | null; defaultRouter: string | null; dns1: string | null; dns2: string | null; note: string | null; wirelessPassword: SecretRef; updatedAt: string };
/** Login e senha padrão dos aparelhos de um MODELO no cliente (todos os GXP1610 dele usam o mesmo). A senha só diz se existe. */
export type ClientDeviceLogin = { id: string; modelId: string; modelName: string; username: string | null; password: SecretRef; note: string | null; updatedAt: string };
export type ClientFull = ClientListItem & { subscriptions: Subscription[]; unitCount: number; network: ClientNetwork | null; deviceLogins: ClientDeviceLogin[] };
/** Uma unidade do cliente (Matriz, filial, loja), com endereço e o IP fixo de saída da rede dela. */
export type ClientUnit = { id: string; name: string; isMain: boolean; address: string | null; egressIp: string | null; note: string | null; createdAt: string; deviceCount: number };

export type Circuit = {
  id: string; name: string; code: string; keyNumber: string | null; carrierId: string | null; carrierName: string | null; channels: number;
  ownerClientId: string | null; ownerName: string | null; monthlyValueCents: number | null;
  /** por IP (IP da operadora + IP do PBX) ou por login e senha do tronco */
  authType: 'ip' | 'login';
  signalingIp: string | null; authIp: string | null;
  authUsername: string | null; authPassword: SecretRef; notes: string | null; dids: { total: number; assigned: number; free: number };
  /** true = tronco do próprio cliente, com outra operadora. Só aparece com "links de terceiros" ligado. */
  thirdParty: boolean;
};
/** Os cartões no topo da tela de Circuitos (obedecem aos mesmos filtros da lista). */
export type CircuitSummary = { circuits: number; channels: number; monthlyValueCents: number; dids: { total: number; assigned: number; free: number } };
/** Os cartões no topo do Inventário (obedecem aos mesmos filtros da lista). */
export type InventorySummary = { inStock: number; withClients: number; inactive: number; valueWithClientsCents: number; filtrado: boolean };

export type Did = {
  id: string; number: string; numberFormatted: string; free: boolean; circuitId: string | null; circuitName: string | null; circuitCode: string | null; carrierName: string | null;
  clientId: string | null; clientName: string | null; ownerClientId: string | null; ownerName: string | null; note: string | null;
  /** o número está em uso no cliente (só faz sentido com cliente; livre é sempre false) */
  inUse: boolean;
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
  /** Quem está com mais valor nosso na mão (locação + comodato), para o gráfico do Painel */
  valorPorCliente: Array<{ clientId: string; nome: string; n: number; valorCents: number }>;
  clients: { active: number; byProduct: Array<ProductChip & { n: number }> };
  dids: { total: number; assigned: number; free: number };
  circuits: Array<{ id: string; name: string; carrierName: string | null; channels: number; total: number; assigned: number; free: number }>;
  devices: { inStock: number; withClients: number; inactive: number; valueWithClientsCents: number };
  alerts: Array<{ kind: string; severity: 'warning' | 'critical'; message: string; count: number; link: string }>;
  recentMovements: Array<{ id: string; modality: string; modalityName: string; fromName: string | null; toName: string | null; userName: string; createdAt: string }>;
  recentAudit: Array<{ id: string; action: string; summary: string; userName: string | null; createdAt: string }>;
  /** Como andam os projetos abertos (a faixa do Painel) */
  projetos: {
    abertos: number; atrasados: number; travados: number;
    items: Array<{ id: string; name: string; andamento: number; faltam: number; total: number; atrasado: boolean }>;
  };
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

/** Um item (cartão) de uma nota de novidades. `imageUrl` é caminho relativo à API (use `logoSrc()`). */
export type NovidadeItem = { id: string; kind: 'novo' | 'melhorou' | 'corrigido' | 'atencao'; title: string; text: string | null; sortOrder: number; imageUrl: string | null };
/** Uma nota de versão. `publishedAt` nulo = rascunho (só quem administra enxerga). */
export type Novidade = {
  id: string; version: string; title: string; summary: string | null;
  publishedAt: string | null; createdAt: string; updatedAt: string;
  /** esta pessoa já marcou "Li e entendi" */
  lida: boolean;
  /** quantas pessoas já leram, de quantas pessoas ativas existem */
  leituras: number; pessoas: number;
  items: NovidadeItem[];
};
/** A nota que abre no login: só o necessário para o pop-up. */
export type NovidadePendente = { id: string; version: string; title: string; summary: string | null; publishedAt: string | null; items: NovidadeItem[] };
/** Quem já leu uma nota e quem ainda não. */
export type LeiturasNovidade = { version: string; title: string; publishedAt: string | null; pessoas: Array<{ id: string; name: string; email: string; readAt: string | null }> };

/** As situações de um cliente dentro de um projeto. */
export type SituacaoProjeto = 'pendente' | 'andamento' | 'travado' | 'concluido' | 'nao_se_aplica';
export type ContagemProjeto = Record<SituacaoProjeto, number>;

/** Uma cor de opção, as mesmas do resto do sistema. */
export type CorOpcao = 'neutral' | 'accent' | 'ok' | 'signal' | 'bad' | 'muted';
/** Uma opção de etapa em lista. `conclui` = escolher esta opção resolve a etapa. */
export type OpcaoEtapa = { id: string; label: string; tone: CorOpcao; conclui: boolean };
/** Uma etapa (coluna): caixinha (feito/não feito) ou lista de opções coloridas. */
export type EtapaProjeto = { id: string; title: string; kind: 'check' | 'escolha'; options: OpcaoEtapa[]; sortOrder: number };
/** Uma linha da lista: o cliente dentro do projeto, com as etapas que já marcaram nele. */
export type ClienteDoProjeto = {
  id: string; clientId: string; clientName: string; arquivado: boolean;
  assigneeId: string | null; assigneeName: string | null;
  status: SituacaoProjeto; blockedReason: string | null; doneAt: string | null;
  /** o que está marcado em cada etapa; `valor` é o id da opção, nas etapas de lista */
  feitas: Array<{ stepId: string; valor: string | null; doneAt: string; quem: string | null }>;
};
export type ComentarioProjeto = { id: string; projectClientId: string | null; body: string; autor: string; userId: string | null; createdAt: string };
export type AnexoProjeto = { id: string; projectClientId: string | null; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; quem: string };

/** O projeto na lista: só o cabeçalho e o quanto já andou. */
export type ProjetoResumo = {
  id: string; name: string; goal: string | null; status: 'aberto' | 'concluido' | 'cancelado';
  dueDate: string | null; ownerId: string | null; ownerName: string | null;
  closedAt: string | null; createdAt: string; updatedAt: string;
  etapas: number; total: number; faltam: number; contagem: ContagemProjeto;
  andamento: number; atrasado: boolean;
};

/**
 * O projeto aberto: tudo o que a ficha mostra.
 * Os números vêm em `resumo` (na lista eles ficam soltos no cabeçalho, porque lá não há detalhe).
 */
export type Projeto = {
  id: string; name: string; goal: string | null; status: 'aberto' | 'concluido' | 'cancelado';
  dueDate: string | null; ownerId: string | null; ownerName: string | null;
  closedAt: string | null; createdAt: string; updatedAt: string;
  etapas: EtapaProjeto[];
  clientes: ClienteDoProjeto[];
  comentarios: ComentarioProjeto[];
  anexos: AnexoProjeto[];
  resumo: {
    total: number; faltam: number; contagem: ContagemProjeto; andamento: number;
    etapasFeitas: number; etapasTotais: number; atrasado: boolean;
    /** Como está cada passo: quantos clientes em cada opção (ou feito/falta, na caixinha) */
    porEtapa: Array<{
      stepId: string; title: string; kind: 'check' | 'escolha';
      total: number; resolvidas: number; faltam: number;
      faixas: Array<{ valor: string; label: string; tone: CorOpcao; conclui: boolean; n: number }>;
    }>;
  };
  podeTrabalhar: boolean; podeGerenciar: boolean;
};

/** O projeto visto da ficha do cliente: onde ele está e como. */
export type ProjetoDoCliente = {
  projectClientId: string; projectId: string; name: string; projectStatus: string; dueDate: string | null;
  status: SituacaoProjeto; blockedReason: string | null; assigneeId: string | null; assigneeName: string | null;
  feitas: number; etapas: number;
};

export class ApiError extends Error {
  /** `details` costuma ser a lista de campos inválidos, mas alguns erros do banco mandam um texto. */
  constructor(public status: number, message: string, public details: Array<{ field: string; message: string }> | string | null = null) { super(message); }
}
