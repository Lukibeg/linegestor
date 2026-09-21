/**
 * Como a interface fala com o servidor de verdade.
 * Todas as chamadas passam por `http()`: manda o cookie de sessão, converte a resposta, e transforma
 * qualquer erro numa `ApiError` com a mensagem em português que o servidor devolveu.
 */
import { ApiError } from './types.js';
import { API_BASE as BASE } from './base.js';
import type { Api } from './index.js';

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
    if (v === undefined || v === null || v === '' || v === false) continue;
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
    loginCode: (code) => http('POST', '/auth/login/code', { code }),
    logout: () => http('POST', '/auth/logout'),
    changePassword: (currentPassword, newPassword) => http('POST', '/auth/change-password', { currentPassword, newPassword }),
    twoFactorSetup: () => http('POST', '/auth/two-factor/setup'),
    twoFactorEnable: (code) => http('POST', '/auth/two-factor/enable', { code }),
    twoFactorDisable: (password) => http('POST', '/auth/two-factor/disable', { password }),
    updateMe: (d) => http('PATCH', '/auth/me', d),
  },
  dashboard: { summary: () => http('GET', '/dashboard'), search: (q) => http('GET', `/dashboard/search${qs({ q })}`) },
  clients: {
    list: (q) => http('GET', `/clients${qs(q)}`),
    options: (q) => http('GET', `/clients/options${qs(q ?? {})}`),
    get: (id) => http('GET', `/clients/${id}`),
    projetos: (id) => http('GET', `/clients/${id}/projetos`),
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
    units: (id) => http('GET', `/clients/${id}/units`),
    createUnit: (id, d) => http('POST', `/clients/${id}/units`, d),
    updateUnit: (id, unitId, d) => http('PATCH', `/clients/${id}/units/${unitId}`, d),
    removeUnit: (id, unitId) => http('DELETE', `/clients/${id}/units/${unitId}`),
    saveDeviceLogin: (id, d) => http('PUT', `/clients/${id}/device-logins`, d),
    removeDeviceLogin: (id, loginId) => http('DELETE', `/clients/${id}/device-logins/${loginId}`),
    saveNetwork: (id, d) => http('PUT', `/clients/${id}/network`, d),
  },
  secrets: { reveal: (id, password) => http('POST', `/secrets/${id}/reveal`, { password }) },
  circuits: {
    list: (q) => http('GET', `/circuits${qs(q)}`),
    summary: (q) => http('GET', `/circuits/summary${qs(q ?? {})}`),
    options: () => http('GET', '/circuits/options'),
    owners: (includeThirdParty) => http('GET', `/circuits/owners${qs({ includeThirdParty: includeThirdParty ? 'true' : undefined })}`),
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
    saveModelImage: (id, dataUrl) => http('PUT', `/inventory/models/${id}/image`, { dataUrl }),
    removeModelImage: (id) => http('DELETE', `/inventory/models/${id}/image`),
    devices: (q) => http('GET', `/inventory/devices${qs(q)}`),
    device: (id) => http('GET', `/inventory/devices/${id}`),
    createDevice: (d) => http('POST', '/inventory/devices', d),
    createDevices: (d) => http('POST', '/inventory/devices/bulk', d),
    updateDevice: (id, d) => http('PATCH', `/inventory/devices/${id}`, d),
    removeDevice: (id) => http('DELETE', `/inventory/devices/${id}`),
    movements: (q) => http('GET', `/inventory/movements${qs(q)}`),
    move: (d) => http('POST', '/inventory/movements', d),
    units: (clientId) => http('GET', `/inventory/units${qs({ clientId })}`),
  },
  settings: {
    backup: () => http('GET', '/settings/backup'),
    saveBackup: (d) => http('PUT', '/settings/backup', d),
    testBackup: () => http('POST', '/settings/backup/test'),
    alerts: () => http('GET', '/settings/alerts'),
    saveAlerts: (d) => http('PUT', '/settings/alerts', d),
    testAlerts: () => http('POST', '/settings/alerts/test'),
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
  novidades: {
    pendente: () => http('GET', '/release-notes/pending'),
    lista: () => http('GET', '/release-notes'),
    marcarLida: (id) => http('POST', `/release-notes/${id}/read`),
    leituras: (id) => http('GET', `/release-notes/${id}/reads`),
    criar: (d) => http('POST', '/release-notes', d),
    atualizar: (id, d) => http('PATCH', `/release-notes/${id}`, d),
    publicar: (id, publicar) => http('POST', `/release-notes/${id}/publish`, { publicar }),
    remover: (id) => http('DELETE', `/release-notes/${id}`),
  },
  projetos: {
    lista: (q) => http('GET', `/projects${qs(q ?? {})}`),
    get: (id) => http('GET', `/projects/${id}`),
    pessoas: () => http('GET', '/projects/pessoas'),
    criar: (d) => http('POST', '/projects', d),
    atualizar: (id, d) => http('PATCH', `/projects/${id}`, d),
    remover: (id) => http('DELETE', `/projects/${id}`),
    addClientes: (id, clientIds, assigneeId) => http('POST', `/projects/${id}/clientes`, { clientIds, assigneeId: assigneeId ?? null }),
    removerCliente: (id, linhaId) => http('DELETE', `/projects/${id}/clientes/${linhaId}`),
    linha: (id, linhaId, d) => http('PATCH', `/projects/${id}/clientes/${linhaId}`, d),
    marcar: (id, linhaId, stepId, d) => http('POST', `/projects/${id}/clientes/${linhaId}/etapas/${stepId}`, d),
    duplicar: (id, name) => http('POST', `/projects/${id}/duplicar`, name ? { name } : {}),
    comentar: (id, body, projectClientId) => http('POST', `/projects/${id}/comentarios`, { body, projectClientId: projectClientId ?? null }),
    apagarComentario: (id, commentId) => http('DELETE', `/projects/${id}/comentarios/${commentId}`),
    anexar: (id, d) => http('POST', `/projects/${id}/anexos`, d),
    apagarAnexo: (id, anexoId) => http('DELETE', `/projects/${id}/anexos/${anexoId}`),
    anexoUrl: (anexoId) => `${BASE}/projects/anexos/${anexoId}`,
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
    createProduct: (d) => http('POST', '/admin/products', d),
    updateProduct: (id, d) => http('PATCH', `/admin/products/${id}`, d),
    removeProduct: (id) => http('DELETE', `/admin/products/${id}`),
    upsertModule: (productId, d) => http('PUT', `/admin/products/${productId}/modules`, d),
    audit: (q) => http('GET', `/admin/audit${qs(q)}`),
    trash: () => http('GET', '/admin/trash'),
    restore: (type, id) => http('POST', `/admin/trash/${type}/${id}/restore`),
  },
};
