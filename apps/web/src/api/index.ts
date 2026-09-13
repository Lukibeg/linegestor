/**
 * A "ponte" entre as telas e os dados. As telas só conhecem esta interface `Api`.
 * Em produção ela aponta para o servidor (client.ts); na prévia publicada aponta para a versão de mentira (demo.ts).
 */
import type * as T from './types.js';

export type Api = {
  auth: {
    me(): Promise<T.Me>;
    login(email: string, password: string): Promise<T.Me>;
    logout(): Promise<{ ok: boolean }>;
    changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }>;
  };
  dashboard: { summary(): Promise<T.Dashboard>; search(q: string): Promise<T.SearchResult> };
  clients: {
    list(q: Record<string, unknown>): Promise<T.Page<T.ClientListItem>>;
    options(q?: { includeInternal?: boolean; productCode?: string }): Promise<T.Option[]>;
    get(id: string): Promise<T.ClientFull>;
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
    devices(id: string): Promise<{ devices: T.Page<T.Device>; bulk: T.BulkStock[] }>;
    history(id: string): Promise<T.Page<T.AuditItem>>;
  };
  secrets: { reveal(id: string, password: string): Promise<{ label: string; value: string; visibleForSeconds: number }> };
  circuits: {
    list(q: Record<string, unknown>): Promise<T.Page<T.Circuit>>;
    summary(q?: Record<string, unknown>): Promise<T.CircuitSummary>;
    options(): Promise<Array<{ id: string; name: string; code: string; carrierName: string | null }>>;
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
    devices(q: Record<string, unknown>): Promise<T.Page<T.Device>>;
    device(id: string): Promise<T.Device>;
    createDevice(d: Record<string, unknown>): Promise<T.Device>;
    updateDevice(id: string, d: Record<string, unknown>): Promise<T.Device>;
    removeDevice(id: string): Promise<{ ok: boolean }>;
    stock(modelId?: string): Promise<T.BulkStock[]>;
    adjustStock(d: { modelId: string; delta: number; note?: string }): Promise<T.BulkStock[]>;
    movements(q: Record<string, unknown>): Promise<T.Page<T.Movement>>;
    move(d: Record<string, unknown>): Promise<{ id: string; items: number; quantity: number }>;
    /** Unidades já usadas (para sugerir no formulário). */
    units(clientId?: string): Promise<string[]>;
  };
  data: {
    preview(d: { entity: string; csv: string; delimiter: string }): Promise<T.ImportPlan>;
    apply(d: { entity: string; csv: string; delimiter: string }): Promise<{ created: number; updated: number }>;
    exportUrl(entity: string): string;
    exportWithSecrets(entity: string, password: string): Promise<{ blob: Blob; zipPassword: string; filename: string }>;
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
    updateProduct(id: string, d: Record<string, unknown>): Promise<T.Product>;
    upsertModule(productId: string, d: Record<string, unknown>): Promise<T.ProductModule>;
    audit(q: Record<string, unknown>): Promise<T.Page<T.AuditItem>>;
    trash(): Promise<T.TrashItem[]>;
    restore(type: string, id: string): Promise<{ ok: boolean }>;
  };
};

export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

/** Onde a API vive. Em produção é o mesmo endereço do site, sob /api. */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

/**
 * Monta o endereço da imagem da logo: o servidor devolve um caminho relativo à API
 * ("clients/<id>/logo?v=…"); a demonstração devolve a imagem embutida ("data:…").
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
