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
    login: (email, password, embutido) => http('POST', '/auth/login', embutido ? { email, password, embutido: true } : { email, password }),
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
    contatos: (id) => http('GET', `/clients/${id}/contatos`),
    cargos: () => http('GET', '/clients/cargos'),
    salvarContato: (id, contatoId, d) => (contatoId ? http('PUT', `/clients/${id}/contatos/${contatoId}`, d) : http('POST', `/clients/${id}/contatos`, d)),
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
    anexarRecibo: (movementId, d) => http('POST', `/inventory/movements/${movementId}/recibos`, d),
    tirarRecibo: (id) => http('DELETE', `/inventory/recibos/${id}`),
    units: (clientId) => http('GET', `/inventory/units${qs({ clientId })}`),
    relatorios: () => http('GET', '/inventory/relatorios'),
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
    marcarLida: (id, assistiu) => http('POST', `/release-notes/${id}/read`, assistiu ? { assistiu: true } : undefined),
    leituras: (id) => http('GET', `/release-notes/${id}/reads`),
    subirVideo: (arquivo, progresso) => subirArquivo('/release-notes/videos', arquivo, progresso),
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
    ia: () => http('GET', '/base/ia'),
    perguntar: (pergunta) => http('POST', '/base/ia/perguntar', { pergunta }),
    rascunhoIa: (chamado) => http('POST', '/base/ia/rascunho', { chamado }),
    iaAjustes: () => http('GET', '/base/ia/ajustes'),
    salvarIaAjustes: (a) => http('PUT', '/base/ia/ajustes', a),
    testarIa: () => http('POST', '/base/ia/testar'),
    iaModelos: (p) => http('POST', '/base/ia/modelos', p),
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
    trocarSenhaDoAcesso: (id, senha) => http('POST', `/portal-admin/acessos/${id}/senha`, { senha }),
    verSenhaDoAcesso: (id) => http('POST', `/portal-admin/acessos/${id}/ver-senha`),
    bloquear: (id, bloquear) => http('POST', `/portal-admin/acessos/${id}/bloqueio`, { bloquear }),
    corrigirAcesso: (id, d) => http('PUT', `/portal-admin/acessos/${id}`, d),
    ajustes: () => http('GET', '/portal-admin/ajustes'),
    salvarAjustes: (d) => http('PUT', '/portal-admin/ajustes', d),
  },
  portal: {
    sobre: () => http('GET', '/portal/sobre'),
    eu: () => http('GET', '/portal/eu'),
    entrar: (login, senha) => http('POST', '/portal/entrar', { login, senha }),
    entrarComCodigo: (login, senha, codigo) => http('POST', '/portal/entrar/codigo', { login, senha, codigo }),
    sair: () => http('POST', '/portal/sair'),
    trocarSenha: (atual, nova) => http('POST', '/portal/senha', { atual, nova }),
    inicio: () => http('GET', '/portal/inicio'),
    tutoriais: (q) => http('GET', `/portal/tutoriais${qs(q)}`),
    tutorial: (numero) => http('GET', `/portal/tutoriais/${encodeURIComponent(numero)}`),
  },
  atendimento: {
    opcoes: () => http('GET', '/atendimento/opcoes'),
    quadro: (q) => http('GET', `/atendimento/quadro${qs(q)}`),
    lista: (q) => http('GET', `/atendimento/chamados${qs(q)}`),
    exportarUrl: (q) => `${BASE}/atendimento/chamados/exportar${qs(q)}`,
    meuDia: () => http('GET', '/atendimento/meu-dia'),
    resumoDosPaineis: () => http('GET', '/atendimento/paineis/resumo'),
    relatorioDeVendas: (q) => http('GET', `/atendimento/vendas${qs(q)}`),
    avisos: () => http('GET', '/atendimento/avisos'),
    marcarAvisosLidos: (ids) => http('POST', '/atendimento/avisos/lidos', ids ? { ids } : {}),
    cadastroDoCliente: (id) => http('GET', `/atendimento/cadastro/${encodeURIComponent(id)}`),
    chamado: (ref) => http('GET', `/atendimento/chamados/${encodeURIComponent(ref)}`),
    anexoUrl: (id) => `${BASE}/atendimento/anexos/${encodeURIComponent(id)}`,
    anexoBytes: async (id) => (await http<Response>('GET', `/atendimento/anexos/${encodeURIComponent(id)}`, undefined, true)).arrayBuffer(),
    criar: (d) => http('POST', '/atendimento/chamados', d),
    alterar: (id, d) => http('PATCH', `/atendimento/chamados/${id}`, d),
    mover: (id, d) => http('POST', `/atendimento/chamados/${id}/mover`, d),
    assumir: (id) => http('POST', `/atendimento/chamados/${id}/assumir`, {}),
    esperar: (id, d) => http('POST', `/atendimento/chamados/${id}/esperar`, d),
    reabrir: (id, d) => http('POST', `/atendimento/chamados/${id}/reabrir`, d),
    trocarPainel: (id, d) => http('POST', `/atendimento/chamados/${id}/painel`, d),
    anotar: (id, d) => http('POST', `/atendimento/chamados/${id}/anotacoes`, d),
    apagarAnotacao: (id, notaId) => http('DELETE', `/atendimento/chamados/${id}/anotacoes/${notaId}`),
    ligar: (id, d) => http('POST', `/atendimento/chamados/${id}/ligacoes`, d),
    desligar: (id, ligacaoId) => http('DELETE', `/atendimento/chamados/${id}/ligacoes/${ligacaoId}`),
    definirPai: (id, pai) => http('POST', `/atendimento/chamados/${id}/pai`, { pai }),
    definirProblema: (id, problema) => http('POST', `/atendimento/chamados/${id}/problema`, { problema }),
    checklist: (id, d) => http('POST', `/atendimento/chamados/${id}/checklist`, d),
    registrarTempo: (id, d) => http('POST', `/atendimento/chamados/${id}/tempo`, d),
    apagarTempo: (id, itemId) => http('DELETE', `/atendimento/chamados/${id}/tempo/${itemId}`),
    abrirNaOperadora: (id, d) => http('POST', `/atendimento/chamados/${id}/operadora`, d),
    andamentoOperadora: (id, casoId, d) => http('POST', `/atendimento/chamados/${id}/operadora/${casoId}`, d),
    avisarCliente: (id, texto) => http('POST', `/atendimento/chamados/${id}/avisar-cliente`, { texto }),
    observar: (id, observar) => http('POST', `/atendimento/chamados/${id}/observar`, { observar }),
    preencherComIa: (id) => http('POST', `/atendimento/chamados/${id}/ia`, {}),
    remover: (id) => http('DELETE', `/atendimento/chamados/${id}`),
    restaurar: (id) => http('POST', `/atendimento/chamados/${id}/restaurar`, {}),
    salvarPainel: (id, d) => (id ? http('PUT', `/atendimento/paineis/${id}`, d) : http('POST', '/atendimento/paineis', d)),
    salvarEtapas: (id, d) => http('PUT', `/atendimento/paineis/${id}/etapas`, d),
    salvarAssunto: (painelId, id, d) => (id ? http('PUT', `/atendimento/assuntos/${id}`, d) : http('POST', `/atendimento/paineis/${painelId}/assuntos`, d)),
    colarAssuntos: (painelId, texto) => http('POST', `/atendimento/paineis/${painelId}/assuntos/colar`, { texto }),
    salvarCamposDoSistema: (painelId, d) => http('PUT', `/atendimento/paineis/${painelId}/campos-do-sistema`, d),
    salvarCampo: (painelId, id, d) => (id ? http('PUT', `/atendimento/campos/${id}`, d) : http('POST', `/atendimento/paineis/${painelId}/campos`, d)),
    ordenarCampos: (painelId, ids) => http('PUT', `/atendimento/paineis/${painelId}/campos/ordem`, { ids }),
    incluirOpcaoDoCampo: (campoId, d) => http('POST', `/atendimento/campos/${campoId}/opcoes`, d),
    etiquetas: () => http('GET', '/atendimento/etiquetas'),
    criarEtiqueta: (d) => http('POST', '/atendimento/etiquetas', d),
    editarEtiqueta: (id, d) => http('PUT', `/atendimento/etiquetas/${id}`, d),
    editarEtiquetaPeloNome: (d) => http('PUT', '/atendimento/etiquetas', d),
    removerEtiqueta: (id) => http('DELETE', `/atendimento/etiquetas/${id}`),
    ajustesPrazos: () => http('GET', '/atendimento/ajustes/prazos'),
    salvarPrazos: (a) => http('PUT', '/atendimento/ajustes/prazos', a),
    ajustesAvisos: () => http('GET', '/atendimento/ajustes/avisos'),
    salvarAvisos: (a) => http('PUT', '/atendimento/ajustes/avisos', a),
    modelosDoLineChat: () => http('GET', '/atendimento/ajustes/avisos/modelos'),
    testarAvisos: (d) => http('POST', '/atendimento/ajustes/avisos/testar', d),
    agendados: () => http('GET', '/atendimento/agendados'),
    salvarAgendado: (id, d) => (id ? http('PUT', `/atendimento/agendados/${id}`, d) : http('POST', '/atendimento/agendados', d)),
    removerAgendado: (id) => http('DELETE', `/atendimento/agendados/${id}`),
    rodarAgendado: (id) => http('POST', `/atendimento/agendados/${id}/agora`, {}),
    integracoes: () => http('GET', '/atendimento/integracoes'),
    salvarWebhook: (id, d) => (id ? http('PUT', `/atendimento/integracoes/webhooks/${id}`, d) : http('POST', '/atendimento/integracoes/webhooks', d)),
    removerWebhook: (id) => http('DELETE', `/atendimento/integracoes/webhooks/${id}`),
    testarWebhook: (id) => http('POST', `/atendimento/integracoes/webhooks/${id}/testar`, {}),
    criarChave: (nome) => http('POST', '/atendimento/integracoes/chaves', { nome }),
    revogarChave: (id) => http('DELETE', `/atendimento/integracoes/chaves/${id}`),
    salvarSites: (sites) => http('PUT', '/atendimento/integracoes/sites', { sites }),
    salvarLinkConversa: (linkConversa) => http('PUT', '/atendimento/integracoes/link-conversa', { linkConversa }),
    robo: () => http('GET', '/atendimento/integracoes/robo'),
    salvarMapaDoRobo: (mapa) => http('PUT', '/atendimento/integracoes/robo', mapa),
    experimentarRobo: (mapa, corpo, endereco = {}) => http('POST', '/atendimento/integracoes/robo/experimentar', { mapa, corpo, endereco }),
  },
  calendario: {
    opcoes: () => http('GET', '/calendario/opcoes'),
    eventos: (de, ate) => http('GET', `/calendario/eventos${qs({ de, ate })}`),
    doChamado: (chamadoId) => http('GET', `/calendario/do-chamado/${encodeURIComponent(chamadoId)}`),
    criar: (d) => http('POST', '/calendario/eventos', d),
    alterar: (id, d) => http('PUT', `/calendario/eventos/${encodeURIComponent(id)}`, d),
    situacao: (id, situacao) => http('POST', `/calendario/eventos/${encodeURIComponent(id)}/situacao`, { situacao }),
    remover: (id) => http('DELETE', `/calendario/eventos/${encodeURIComponent(id)}`),
    salvarTipos: (tipos) => http('PUT', '/calendario/tipos', { tipos }),
  },
  simulador: {
    opcoes: () => http('GET', '/comercial/simulador/opcoes'),
    listar: () => http('GET', '/comercial/simulador/simulacoes'),
    ler: (id) => http('GET', `/comercial/simulador/simulacoes/${encodeURIComponent(id)}`),
    daNegociacao: (negociacaoId) => http('GET', `/comercial/simulador/da-negociacao/${encodeURIComponent(negociacaoId)}`),
    criar: (d) => http('POST', '/comercial/simulador/simulacoes', d),
    alterar: (id, d) => http('PUT', `/comercial/simulador/simulacoes/${encodeURIComponent(id)}`, d),
    duplicar: (id) => http('POST', `/comercial/simulador/simulacoes/${encodeURIComponent(id)}/duplicar`),
    remover: (id) => http('DELETE', `/comercial/simulador/simulacoes/${encodeURIComponent(id)}`),
    planilha: async (id) => {
      const r = await http<Response>('GET', `/comercial/simulador/simulacoes/${encodeURIComponent(id)}/planilha`, undefined, true);
      const nome = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? 'simulacao.xlsx';
      return { bytes: new Uint8Array(await r.arrayBuffer()), nome };
    },
    salvarAjustes: (a) => http('PUT', '/comercial/simulador/ajustes', a),
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
