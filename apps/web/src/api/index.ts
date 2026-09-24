/**
 * A "ponte" entre as telas e os dados. As telas só conhecem esta interface `Api`.
 * Em produção ela aponta para o servidor (client.ts); na prévia publicada aponta para a versão de mentira (demo.ts).
 */
import type * as T from './types.js';
import { API_BASE } from './base.js';

export type Api = {
  auth: {
    me(): Promise<T.Me>;
    login(email: string, password: string): Promise<T.Entrada>;
    /** Segunda etapa: o código do aplicativo, ou um código de recuperação. */
    loginCode(code: string): Promise<T.Me>;
    logout(): Promise<{ ok: boolean }>;
    changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }>;
    twoFactorSetup(): Promise<{ secret: string; uri: string; qrSvg: string }>;
    twoFactorEnable(code: string): Promise<{ recovery: string[] }>;
    twoFactorDisable(password: string): Promise<{ ok: boolean }>;
    /** Ajustar a própria conta (o usuário SSH) */
    updateMe(d: { sshUser: string | null }): Promise<T.Me>;
  };
  dashboard: { summary(): Promise<T.Dashboard>; search(q: string): Promise<T.SearchResult> };
  clients: {
    list(q: Record<string, unknown>): Promise<T.Page<T.ClientListItem>>;
    options(q?: { includeInternal?: boolean; productCode?: string; withDevices?: boolean }): Promise<T.Option[]>;
    get(id: string): Promise<T.ClientFull>;
    /** Projetos de que este cliente participa (a aba da ficha) */
    projetos(id: string): Promise<T.ProjetoDoCliente[]>;
    create(d: Record<string, unknown>): Promise<T.ClientFull>;
    update(id: string, d: Record<string, unknown>): Promise<T.ClientFull>;
    remove(id: string): Promise<{ ok: boolean }>;
    upsertSubscription(id: string, d: Record<string, unknown>): Promise<T.ClientFull>;
    endSubscription(id: string, code: string): Promise<T.ClientFull>;
    upsertModule(id: string, d: Record<string, unknown>): Promise<T.ClientFull>;
    saveLogo(id: string, dataUrl: string): Promise<T.ClientFull>;
    removeLogo(id: string): Promise<T.ClientFull>;
    endModule(id: string, productCode: string, moduleCode: string): Promise<T.ClientFull>;
    dids(id: string): Promise<T.Page<T.Did>>;
    devices(id: string): Promise<{ devices: T.Page<T.Device> }>;
    history(id: string): Promise<T.Page<T.AuditItem>>;
    units(id: string): Promise<T.ClientUnit[]>;
    createUnit(id: string, d: { name: string; address?: string | null; egressIp?: string | null; note?: string | null }): Promise<T.ClientUnit>;
    updateUnit(id: string, unitId: string, d: { name: string; address?: string | null; egressIp?: string | null; note?: string | null }): Promise<T.ClientUnit>;
    removeUnit(id: string, unitId: string): Promise<{ ok: boolean }>;
    /** Login e senha padrão dos aparelhos, por modelo (um por modelo; gravar de novo atualiza) */
    saveDeviceLogin(id: string, d: Record<string, unknown>): Promise<T.ClientFull>;
    removeDeviceLogin(id: string, loginId: string): Promise<T.ClientFull>;
    /** Rede padrão dos aparelhos (IP, máscara, gateway, DNS, senha do ramal sem fio) */
    saveNetwork(id: string, d: Record<string, unknown>): Promise<T.ClientFull>;
  };
  secrets: { reveal(id: string, password: string): Promise<{ label: string; value: string; visibleForSeconds: number }> };
  circuits: {
    list(q: Record<string, unknown>): Promise<T.Page<T.Circuit>>;
    summary(q?: Record<string, unknown>): Promise<T.CircuitSummary>;
    options(): Promise<Array<{ id: string; name: string; code: string; carrierName: string | null }>>;
    /** Quem é titular de pelo menos um circuito (para o filtro "Titular") */
    owners(includeThirdParty: boolean): Promise<T.Option[]>;
    get(id: string): Promise<T.Circuit>;
    create(d: Record<string, unknown>): Promise<T.Circuit>;
    update(id: string, d: Record<string, unknown>): Promise<T.Circuit>;
    remove(id: string): Promise<{ ok: boolean }>;
    createRange(id: string, d: Record<string, unknown>): Promise<{ created: number; first: string; last: string }>;
  };
  dids: {
    list(q: Record<string, unknown>): Promise<T.Page<T.Did>>;
    ids(q: Record<string, unknown>): Promise<{ ids: string[] }>;
    createRange(d: Record<string, unknown>): Promise<{ created: number; first: string; last: string }>;
    update(id: string, d: Record<string, unknown>): Promise<T.Did>;
    bulk(ids: string[], set: Record<string, unknown>): Promise<{ affected: number }>;
    bulkDelete(ids: string[]): Promise<{ affected: number }>;
  };
  inventory: {
    summary(q?: Record<string, unknown>): Promise<T.InventorySummary>;
    models(q?: Record<string, unknown>): Promise<T.DeviceModel[]>;
    createModel(d: Record<string, unknown>): Promise<T.DeviceModel>;
    updateModel(id: string, d: Record<string, unknown>): Promise<T.DeviceModel>;
    removeModel(id: string): Promise<{ ok: boolean }>;
    saveModelImage(id: string, dataUrl: string): Promise<{ ok: boolean }>;
    removeModelImage(id: string): Promise<{ ok: boolean }>;
    devices(q: Record<string, unknown>): Promise<T.Page<T.Device>>;
    device(id: string): Promise<T.Device>;
    createDevice(d: Record<string, unknown>): Promise<T.Device>;
    /** Vários de uma vez: lista de MACs, de números de série, ou uma quantidade sem identificação */
    createDevices(d: { modelId: string; tipo: 'mac' | 'serie' | 'nenhum'; valores?: string[]; quantidade?: number; condition?: string; note?: string | null }): Promise<T.CadastroEmMassa>;
    updateDevice(id: string, d: Record<string, unknown>): Promise<T.Device>;
    removeDevice(id: string): Promise<{ ok: boolean }>;
    movements(q: Record<string, unknown>): Promise<T.Page<T.Movement>>;
    move(d: Record<string, unknown>): Promise<{ id: string; items: number; quantity: number }>;
    /** Unidades já usadas (para sugerir no formulário). */
    units(clientId?: string): Promise<string[]>;
  };
  settings: {
    backup(): Promise<T.AjustesBackup>;
    saveBackup(d: { ativo: boolean; pasta: string; pastaId: string; chaveJson?: string }): Promise<T.AjustesBackup>;
    testBackup(): Promise<{ ok: boolean; mensagem: string }>;
    alerts(): Promise<T.AjustesAvisos>;
    saveAlerts(d: { ativo: boolean; url: string; metodo: 'POST' | 'GET'; cabecalhos: string; corpo: string; token?: string }): Promise<T.AjustesAvisos>;
    testAlerts(): Promise<{ ok: boolean; mensagem: string }>;
    linechat(): Promise<T.AjustesLineChat>;
    saveLinechat(d: { ativo: boolean; url: string; appUrl: string; painelId: string; painelNome: string; token?: string }): Promise<T.AjustesLineChat>;
    testLinechat(): Promise<{ ok: boolean; mensagem: string }>;
    paineisLinechat(): Promise<T.PainelLineChat[]>;
    /** `completa` relê o painel inteiro; senão, só o que mudou desde a última vez */
    syncLinechat(completa: boolean): Promise<T.ResultadoSincronizacao>;
  };
  /** Chamados de suporte: a cópia do painel do LineChat (só leitura) */
  chamados: {
    opcoes(): Promise<T.OpcoesChamados>;
    resumo(q: Record<string, unknown>): Promise<T.ResumoChamados>;
    lista(q: Record<string, unknown>): Promise<T.Page<T.LinhaChamado>>;
    /** A arrumação da tela (ordem, largura, escondidos, pizza ou barras, grupos, etapas que fecham), igual para a equipe toda */
    painel(): Promise<T.PainelChamados>;
    /** Só a administração: arruma a tela para todos */
    salvarPainel(p: { itens: T.ItemPainel[]; etapasFechadas: string[] | null }): Promise<T.PainelChamados>;
  };
  data: {
    preview(d: { entity: string; csv: string; delimiter: string }): Promise<T.ImportPlan>;
    apply(d: { entity: string; csv: string; delimiter: string }): Promise<{ created: number; updated: number }>;
    exportUrl(entity: string): string;
    exportWithSecrets(entity: string, password: string): Promise<{ blob: Blob; zipPassword: string; filename: string }>;
  };
  novidades: {
    /** A nota que deve abrir no login desta pessoa (ou nada) */
    pendente(): Promise<T.NovidadePendente | null>;
    /** Histórico + se esta pessoa pode editar + quantas ela ainda não leu */
    lista(): Promise<{ items: T.Novidade[]; podeEditar: boolean; naoLidas: number }>;
    marcarLida(id: string): Promise<{ ok: boolean }>;
    leituras(id: string): Promise<T.LeiturasNovidade>;
    criar(d: Record<string, unknown>): Promise<{ id: string }>;
    atualizar(id: string, d: Record<string, unknown>): Promise<{ id: string }>;
    publicar(id: string, publicar: boolean): Promise<{ id: string; publishedAt: string | null }>;
    remover(id: string): Promise<{ ok: boolean }>;
  };
  projetos: {
    lista(q?: { status?: string; q?: string }): Promise<{ items: T.ProjetoResumo[]; podeTrabalhar: boolean; podeGerenciar: boolean }>;
    get(id: string): Promise<T.Projeto>;
    /** Quem pode ser responsável (as pessoas ativas) */
    pessoas(): Promise<Array<{ id: string; name: string }>>;
    criar(d: Record<string, unknown>): Promise<T.Projeto>;
    atualizar(id: string, d: Record<string, unknown>): Promise<T.Projeto>;
    remover(id: string): Promise<{ ok: boolean }>;
    addClientes(id: string, clientIds: string[], assigneeId?: string | null): Promise<T.Projeto>;
    removerCliente(id: string, linhaId: string): Promise<{ ok: boolean }>;
    /** Trocar responsável ou situação de um cliente no projeto */
    linha(id: string, linhaId: string, d: Record<string, unknown>): Promise<unknown>;
    /** caixinha: `{ feito }`; lista: `{ valor }` (o id da opção, ou null para limpar) */
    marcar(id: string, linhaId: string, stepId: string, d: { feito?: boolean; valor?: string | null }): Promise<unknown>;
    duplicar(id: string, name?: string): Promise<T.Projeto>;
    comentar(id: string, body: string, projectClientId?: string | null): Promise<unknown>;
    apagarComentario(id: string, commentId: string): Promise<{ ok: boolean }>;
    anexar(id: string, d: { fileName: string; conteudo: string; projectClientId?: string | null }): Promise<T.AnexoProjeto>;
    apagarAnexo(id: string, anexoId: string): Promise<{ ok: boolean }>;
    /** Endereço para baixar o anexo (abre direto no navegador) */
    anexoUrl(anexoId: string): string;
  };
  admin: {
    users(): Promise<T.User[]>;
    createUser(d: Record<string, unknown>): Promise<T.User>;
    updateUser(id: string, d: Record<string, unknown>): Promise<T.User>;
    roles(): Promise<T.Role[]>;
    permissions(): Promise<Array<{ key: string; label: string }>>;
    createRole(d: Record<string, unknown>): Promise<T.Role>;
    updateRole(id: string, d: Record<string, unknown>): Promise<T.Role>;
    removeRole(id: string): Promise<{ ok: boolean }>;
    catalog(type: string): Promise<T.CatalogItem[]>;
    createCatalogItem(type: string, name: string): Promise<T.CatalogItem>;
    updateCatalogItem(type: string, id: string, d: Record<string, unknown>): Promise<T.CatalogItem>;
    products(): Promise<T.Product[]>;
    createProduct(d: { code: string; name: string; color: string; description?: string | null }): Promise<T.Product>;
    updateProduct(id: string, d: Record<string, unknown>): Promise<T.Product>;
    removeProduct(id: string): Promise<{ ok: boolean }>;
    upsertModule(productId: string, d: Record<string, unknown>): Promise<T.ProductModule>;
    audit(q: Record<string, unknown>): Promise<T.Page<T.AuditItem>>;
    trash(): Promise<T.TrashItem[]>;
    restore(type: string, id: string): Promise<{ ok: boolean }>;
  };
};

export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

export { API_BASE };

/**
 * Monta o endereço de uma imagem (logo do cliente, foto do modelo): o servidor devolve um
 * caminho relativo à API ("clients/<id>/logo?v=…"); a demonstração devolve a imagem embutida ("data:…").
 */
export function logoSrc(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (/^(data:|blob:|https?:)/.test(logoUrl)) return logoUrl;
  return `${API_BASE}/${logoUrl.replace(/^\//, '')}`;
}

let apiImpl: Api;
if (IS_DEMO) {
  const { demoApi } = await import('./demo.js');
  apiImpl = demoApi;
} else {
  const { realApi } = await import('./client.js');
  apiImpl = realApi;
}
export const api: Api = apiImpl;
