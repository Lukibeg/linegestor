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

/**
 * Sobe um arquivo com a barra de progresso (o vídeo pode ter centenas de MB: o fetch não conta
 * quanto já foi). Mesmo jeito de erro do `http()`.
 */
function subirArquivo<T>(path: string, arquivo: File, progresso?: (p: number) => void): Promise<T> {
  return new Promise<T>((ok, falhou) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE + path);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) progresso?.(e.loaded / e.total); };
    xhr.onload = () => {
      let corpo: any = null;
      try { corpo = JSON.parse(xhr.responseText); } catch { /* sem corpo */ }
      if (xhr.status >= 200 && xhr.status < 300) ok(corpo as T);
      else falhou(new ApiError(xhr.status, corpo?.error ?? `Erro ${xhr.status}`, corpo?.details ?? null));
    };
    xhr.onerror = () => falhou(new ApiError(0, 'A conexão caiu no meio do envio. Tente de novo.'));
    const form = new FormData();
    form.append('arquivo', arquivo, arquivo.name);
    xhr.send(form);
  });
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
    linechat: () => http('GET', '/settings/linechat'),
    saveLinechat: (d) => http('PUT', '/settings/linechat', d),
    testLinechat: () => http('POST', '/settings/linechat/test'),
    paineisLinechat: () => http('GET', '/settings/linechat/paineis'),
    syncLinechat: (completa) => http('POST', '/settings/linechat/sync', { completa }),
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
  chamados: {
    opcoes: () => http('GET', '/chamados/opcoes'),
    resumo: (q) => http('GET', `/chamados/resumo${qs(q)}`),
    lista: (q) => http('GET', `/chamados/lista${qs(q)}`),
    painel: () => http('GET', '/chamados/painel'),
    salvarPainel: (p) => http('PUT', '/chamados/painel', { versao: 2, ...p }),
    relatorios: (q) => http('GET', `/chamados/relatorios${qs(q)}`),
    pecaRelatorio: (q) => http('GET', `/chamados/relatorios/chamados${qs(q)}`),
    ajustesRelatorios: () => http('GET', '/chamados/relatorios/ajustes'),
    salvarAjustesRelatorios: (a) => http('PUT', '/chamados/relatorios/ajustes', a),
    raioX: (id, q) => http('GET', `/chamados/relatorios/cliente/${encodeURIComponent(id)}${qs(q)}`),
    arrumacaoRelatorios: () => http('GET', '/chamados/relatorios/arrumacao'),
    salvarArrumacaoRelatorios: (a) => http('PUT', '/chamados/relatorios/arrumacao', a),
  },
  envio: {
    ajustes: () => http('GET', '/envio/ajustes'),
    salvarAjustes: (a) => http('PUT', '/envio/ajustes', a),
    marcados: () => http('GET', '/envio/marcados'),
    salvarMarcados: (m) => http('PUT', '/envio/marcados', m),
    pacote: (chave) => http('GET', `/envio/pacote${qs({ chave })}`),
    enviar: (destinatarioId) => http('POST', '/envio/enviar', { destinatarioId }),
    testar: (destinatarioId) => http('POST', '/envio/testar', { destinatarioId }),
    pdfUrl: () => `${BASE}/envio/pdf`,
    historicoPdfUrl: (id) => `${BASE}/envio/historico/${encodeURIComponent(id)}/pdf`,
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
  base: {
    lista: (q) => http('GET', `/base${qs(q)}`),
    opcoes: () => http('GET', '/base/opcoes'),
    get: (numero) => http('GET', `/base/${encodeURIComponent(String(numero))}`),
    criar: (d) => http('POST', '/base', d),
    atualizar: (numero, d) => http('PUT', `/base/${numero}`, d),
    remover: (numero) => http('DELETE', `/base/${numero}`),
    ligar: (numero, l) => http('POST', `/base/${numero}/ligacoes`, l),
    versoes: (numero) => http('GET', `/base/${numero}/versoes`),
    comparar: (numero, de, para) => http('GET', `/base/${numero}/comparar${qs({ de, para })}`),
    voltarVersao: (numero, versao) => http('POST', `/base/${numero}/versoes/${versao}/voltar`),
    obrigatoria: (numero, ligar) => http('POST', `/base/${numero}/obrigatoria`, { ligar }),
    marcarLida: (numero) => http('POST', `/base/${numero}/lida`),
    leituras: (numero) => http('GET', `/base/${numero}/leituras`),
    comentar: (numero, texto) => http('POST', `/base/${numero}/comentarios`, { texto }),
    apagarComentario: (numero, id) => http('DELETE', `/base/${numero}/comentarios/${id}`),
    pendentes: () => http('GET', '/base/obrigatorias'),
    ligados: (tipo, alvo) => http('GET', `/base/ligados${qs({ tipo, alvo })}`),
    paraChamados: (ids) => http('POST', '/base/para-chamados', { ids }),
    doChamado: (ref) => http('GET', `/base/do-chamado/${encodeURIComponent(ref)}`),
  },
  portalAdmin: {
    opcoes: () => http('GET', '/portal-admin/opcoes'),
    tutoriais: (q) => http('GET', `/portal-admin/tutoriais${qs(q)}`),
    tutorial: (numero) => http('GET', `/portal-admin/tutoriais/${numero}`),
    criar: (d) => http('POST', '/portal-admin/tutoriais', d),
    atualizar: (numero, d) => http('PUT', `/portal-admin/tutoriais/${numero}`, d),
    remover: (numero) => http('DELETE', `/portal-admin/tutoriais/${numero}`),
    subir: (tipo, arquivo, progresso) => subirArquivo(`/portal-admin/arquivos?tipo=${tipo}`, arquivo, progresso),
    espaco: () => http('GET', '/portal-admin/espaco'),
    acessos: (q) => http('GET', `/portal-admin/acessos${qs(q ?? {})}`),
    acessosDoCliente: (id) => http('GET', `/portal-admin/clientes/${id}/acessos`),
    darAcesso: (id, d) => http('POST', `/portal-admin/clientes/${id}/acessos`, d),
    novoConvite: (id) => http('POST', `/portal-admin/acessos/${id}/convite`),
    bloquear: (id, bloquear) => http('POST', `/portal-admin/acessos/${id}/bloqueio`, { bloquear }),
    corrigirAcesso: (id, d) => http('PUT', `/portal-admin/acessos/${id}`, d),
    ajustes: () => http('GET', '/portal-admin/ajustes'),
    salvarAjustes: (d) => http('PUT', '/portal-admin/ajustes', d),
  },
  portal: {
    sobre: () => http('GET', '/portal/sobre'),
    eu: () => http('GET', '/portal/eu'),
    entrar: (email, senha) => http('POST', '/portal/entrar', { email, senha }),
    sair: () => http('POST', '/portal/sair'),
    convite: (codigo) => http('GET', `/portal/convite/${encodeURIComponent(codigo)}`),
    criarSenha: (codigo, senha) => http('POST', `/portal/convite/${encodeURIComponent(codigo)}`, { senha }),
    trocarSenha: (atual, nova) => http('POST', '/portal/senha', { atual, nova }),
    inicio: () => http('GET', '/portal/inicio'),
    tutoriais: (q) => http('GET', `/portal/tutoriais${qs(q)}`),
    tutorial: (numero) => http('GET', `/portal/tutoriais/${encodeURIComponent(numero)}`),
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
    removeModule: (productId, moduleId) => http('DELETE', `/admin/products/${productId}/modules/${moduleId}`),
    audit: (q) => http('GET', `/admin/audit${qs(q)}`),
    trash: () => http('GET', '/admin/trash'),
    restore: (type, id) => http('POST', `/admin/trash/${type}/${id}/restore`),
  },
};
