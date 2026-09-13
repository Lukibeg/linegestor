/**
 * Como a interface fala com o servidor de verdade.
 * Todas as chamadas passam por `http()`: manda o cookie de sessão, converte a resposta, e transforma
 * qualquer erro numa `ApiError` com a mensagem em português que o servidor devolveu.
 */
import { ApiError } from './types.js';
import { API_BASE as BASE, type Api } from './index.js';

async function http<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
  const res = await fetch(BASE + path, {
    method, credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`; let details = null;
    try { const j = await res.json(); msg = j.error ?? msg; details = j.details ?? null; } catch { /* sem corpo */ }
    throw new ApiError(res.status, msg, details);
  }
  if (raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const realApi: Api = {
  auth: {
    me: () => http('GET', '/auth/me'),
    login: (email, password) => http('POST', '/auth/login', { email, password }),
    logout: () => http('POST', '/auth/logout'),
    changePassword: (currentPassword, newPassword) => http('POST', '/auth/change-password', { currentPassword, newPassword }),
  },
  dashboard: { summary: () => http('GET', '/dashboard'), search: (q) => http('GET', `/dashboard/search${qs({ q })}`) },
  clients: {
    list: (q) => http('GET', `/clients${qs(q)}`),
    options: (q) => http('GET', `/clients/options${qs(q ?? {})}`),
    get: (id) => http('GET', `/clients/${id}`),
    create: (d) => http('POST', '/clients', d),
    update: (id, d) => http('PATCH', `/clients/${id}`, d),
    remove: (id) => http('DELETE', `/clients/${id}`),
    upsertSubscription: (id, d) => http('PUT', `/clients/${id}/subscriptions`, d),
    endSubscription: (id, code) => http('DELETE', `/clients/${id}/subscriptions/${code}`),
    upsertModule: (id, d) => http('PUT', `/clients/${id}/modules`, d),
    saveLogo: (id, dataUrl) => http('PUT', `/clients/${id}/logo`, { dataUrl }),
    removeLogo: (id) => http('DELETE', `/clients/${id}/logo`),
    endModule: (id, productCode, moduleCode) => http('DELETE', `/clients/${id}/modules/${productCode}/${moduleCode}`),
    dids: (id) => http('GET', `/clients/${id}/dids`),
    devices: (id) => http('GET', `/clients/${id}/devices`),
    history: (id) => http('GET', `/clients/${id}/history`),
  },
  secrets: { reveal: (id, password) => http('POST', `/secrets/${id}/reveal`, { password }) },
  circuits: {
    list: (q) => http('GET', `/circuits${qs(q)}`),
    summary: (q) => http('GET', `/circuits/summary${qs(q ?? {})}`),
    options: () => http('GET', '/circuits/options'),
    get: (id) => http('GET', `/circuits/${id}`),
    create: (d) => http('POST', '/circuits', d),
    update: (id, d) => http('PATCH', `/circuits/${id}`, d),
    remove: (id) => http('DELETE', `/circuits/${id}`),
    createRange: (id, d) => http('POST', `/circuits/${id}/dids/range`, d),
  },
  dids: {
    list: (q) => http('GET', `/dids${qs(q)}`),
    ids: (q) => http('GET', `/dids/ids${qs(q)}`),
    createRange: (d) => http('POST', '/dids/range', d),
    update: (id, d) => http('PATCH', `/dids/${id}`, d),
    bulk: (ids, set) => http('POST', '/dids/bulk', { ids, set }),
    bulkDelete: (ids) => http('POST', '/dids/bulk-delete', { ids }),
  },
  inventory: {
    summary: (q) => http('GET', `/inventory/summary${qs(q ?? {})}`),
    models: (q) => http('GET', `/inventory/models${qs(q ?? {})}`),
    createModel: (d) => http('POST', '/inventory/models', d),
    updateModel: (id, d) => http('PATCH', `/inventory/models/${id}`, d),
    removeModel: (id) => http('DELETE', `/inventory/models/${id}`),
    devices: (q) => http('GET', `/inventory/devices${qs(q)}`),
    device: (id) => http('GET', `/inventory/devices/${id}`),
    createDevice: (d) => http('POST', '/inventory/devices', d),
    updateDevice: (id, d) => http('PATCH', `/inventory/devices/${id}`, d),
    removeDevice: (id) => http('DELETE', `/inventory/devices/${id}`),
    stock: (modelId) => http('GET', `/inventory/stock${qs({ modelId })}`),
    adjustStock: (d) => http('POST', '/inventory/stock/adjust', d),
    movements: (q) => http('GET', `/inventory/movements${qs(q)}`),
    move: (d) => http('POST', '/inventory/movements', d),
  },
  data: {
    preview: (d) => http('POST', '/data/import/preview', d),
    apply: (d) => http('POST', '/data/import/apply', d),
    exportUrl: (entity) => `${BASE}/data/export/${entity}`,
    exportWithSecrets: async (entity, password) => {
      const res = await http<Response>('POST', `/data/export/${entity}/with-secrets`, { password }, true);
      return { blob: await res.blob(), zipPassword: res.headers.get('X-Zip-Password') ?? '', filename: (res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]) ?? `${entity}.zip` };
    },
  },
  admin: {
    users: () => http('GET', '/admin/users'),
    createUser: (d) => http('POST', '/admin/users', d),
    updateUser: (id, d) => http('PATCH', `/admin/users/${id}`, d),
    roles: () => http('GET', '/admin/roles'),
    permissions: () => http('GET', '/admin/permissions'),
    createRole: (d) => http('POST', '/admin/roles', d),
    updateRole: (id, d) => http('PATCH', `/admin/roles/${id}`, d),
    removeRole: (id) => http('DELETE', `/admin/roles/${id}`),
    catalog: (type) => http('GET', `/admin/catalogs/${type}`),
    createCatalogItem: (type, name) => http('POST', `/admin/catalogs/${type}`, { name }),
    updateCatalogItem: (type, id, d) => http('PATCH', `/admin/catalogs/${type}/${id}`, d),
    products: () => http('GET', '/admin/products'),
    updateProduct: (id, d) => http('PATCH', `/admin/products/${id}`, d),
    upsertModule: (productId, d) => http('PUT', `/admin/products/${productId}/modules`, d),
    audit: (q) => http('GET', `/admin/audit${qs(q)}`),
    trash: () => http('GET', '/admin/trash'),
    restore: (type, id) => http('POST', `/admin/trash/${type}/${id}/restore`),
  },
};
