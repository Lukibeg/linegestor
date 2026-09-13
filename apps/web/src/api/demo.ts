/**
 * API DE DEMONSTRAÇÃO — tudo em memória, com dados fictícios.
 *
 * Serve para publicar uma prévia clicável da interface sem servidor nem banco.
 * Implementa as mesmas regras principais do servidor (contagem de afetados na edição em massa,
 * só movimenta aparelho para cliente com Equipamentos, senha só sai com confirmação e vai para a auditoria…),
 * mas de forma simplificada. Recarregar a página volta ao estado inicial.
 *
 * Entrar: qualquer um destes e-mails com a senha "demo":
 *   admin@gestor.local (Administrador) · tecnico@gestor.local (Técnico) · operador@gestor.local (Operador) · leitor@gestor.local (Leitor)
 */
import { ALL_PERMISSIONS, DEFAULT_ROLES, MODULOS_INICIAIS, PERMISSIONS, PRODUTOS_INICIAIS, cnpjLimpo, cnpjValido, didFormatado, didLimpo, gerarFaixaDids, macFormatado, macLimpo, MODALIDADES } from '@gestor/shared';
import type { Api } from './index.js';
import { ApiError, type AuditItem, type Circuit, type ClientFull, type ClientListItem, type Device, type Did, type DeviceModel, type InventorySummary, type Me, type Movement, type Product, type ProductModule, type Subscription, type SubscriptionModule } from './types.js';

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
let seq = 1000;
const id = () => 'demo' + (seq++).toString(36);
const now = () => new Date().toISOString();
const daysAgo = (d: number, h = 10) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };

// ---------------- estado ----------------
type Client = { id: string; tradeName: string; legalName: string; cnpj: string; logoUrl: string | null; archived: boolean; isInternal: boolean; internalCode: string | null; notes: string | null; deletedAt: string | null; createdAt: string; updatedAt: string };
type Sub = { id: string; clientId: string; productCode: string; activatedAt: string | null; deactivatedAt: string | null; notes: string | null; settings: Record<string, any> };
/** Um módulo ligado numa assinatura (ex.: FOP2 dentro do LinePBX do cliente X). */
type SubMod = { id: string; subscriptionId: string; moduleId: string; activatedAt: string | null; deactivatedAt: string | null; notes: string | null; settings: Record<string, any> };
type ModRow = ProductModule & { productId: string };
type CircuitRow = { id: string; name: string; code: string; keyNumber: string | null; carrierId: string | null; channels: number; ownerClientId: string | null; monthlyValueCents: number | null; signalingIp: string | null; authIp: string | null; authUsername: string | null; authPasswordSecretId: string | null; notes: string | null; deletedAt: string | null };
type DidRow = { id: string; number: string; circuitId: string | null; clientId: string | null; ownerClientId: string | null; note: string | null; deletedAt: string | null };
type ModelRow = { id: string; code: string; name: string; categoryId: string | null; tracking: 'serializado' | 'granel'; imageUrl: string | null; deletedAt: string | null };
type DeviceRow = { id: string; modelId: string; mac: string; macSecondary: string | null; tag: string | null; clientId: string | null; currentModality: string | null; condition: string; valueCents: number | null; ip: string | null; location: string | null; note: string | null; deletedAt: string | null; createdAt: string };
type Bulk = { id: string; modelId: string; clientId: string | null; modality: string; quantity: number };
type MovRow = { id: string; modality: string; fromClientId: string | null; toClientId: string | null; newCondition: string | null; valueCents: number | null; note: string | null; userId: string; createdAt: string; items: Array<{ modelId: string; deviceId: string | null; quantity: number }> };
type UserRow = { id: string; name: string; email: string; password: string; roleId: string; active: boolean; lastLoginAt: string | null };
type RoleRow = { id: string; key: string | null; name: string; description: string | null; permissions: string[]; isSystem: boolean };

const S = {
  clients: [] as Client[], subs: [] as Sub[], circuits: [] as CircuitRow[], dids: [] as DidRow[], models: [] as ModelRow[], devices: [] as DeviceRow[], bulk: [] as Bulk[], movements: [] as MovRow[],
  users: [] as UserRow[], roles: [] as RoleRow[], secrets: new Map<string, { label: string; value: string }>(),
  carriers: [] as { id: string; name: string; active: boolean }[], hostings: [] as { id: string; name: string; active: boolean }[], categories: [] as { id: string; name: string; active: boolean }[],
  products: PRODUTOS_INICIAIS.map((p, i) => ({ id: 'p' + p.code, ...p, description: p.description as string | null, sortOrder: i, active: true })),
  modules: MODULOS_INICIAIS.map((m, i) => ({ id: 'm' + m.product + '_' + m.code, productId: 'p' + m.product, code: m.code, name: m.name, description: m.description as string | null, hasSettings: m.hasSettings, sortOrder: i, active: true })) as ModRow[],
  subMods: [] as SubMod[],
  audit: [] as (AuditItem & { userId: string | null })[],
  me: null as UserRow | null,
};

function audit(action: string, entityType: string, summary: string, entityId: string | null = null) {
  S.audit.unshift({ id: id(), action, entityType, entityId, summary, before: null, after: null, userName: S.me?.name ?? null, userId: S.me?.id ?? null, createdAt: now() });
}
const notFound = (w = 'Registro') => new ApiError(404, `${w} não encontrado`);
const bad = (m: string) => new ApiError(400, m);
function requirePerm(p: string) { if (!S.me) throw new ApiError(401, 'Faça login para continuar'); const r = S.roles.find((x) => x.id === S.me!.roleId)!; if (!r.permissions.includes(p)) throw new ApiError(403, `Esta ação exige a permissão "${p}"`); }

// ---------------- carga inicial ----------------
function seed() {
  S.roles = DEFAULT_ROLES.map((r) => ({ id: 'r' + r.key, key: r.key, name: r.name, description: r.description, permissions: [...r.permissions], isSystem: true }));
  S.users = [
    { id: 'u1', name: 'Luan França', email: 'admin@gestor.local', password: 'demo', roleId: 'radministrador', active: true, lastLoginAt: daysAgo(0, 8) },
    { id: 'u2', name: 'Lúcio Andrade', email: 'tecnico@gestor.local', password: 'demo', roleId: 'rtecnico', active: true, lastLoginAt: daysAgo(1) },
    { id: 'u3', name: 'Marina Costa', email: 'operador@gestor.local', password: 'demo', roleId: 'roperador', active: true, lastLoginAt: daysAgo(2) },
    { id: 'u4', name: 'Paulo Reis', email: 'leitor@gestor.local', password: 'demo', roleId: 'rleitor', active: true, lastLoginAt: null },
  ];
  S.carriers = ['ALGAR', 'VC1'].map((n) => ({ id: 'car' + n, name: n, active: true }));
  S.hostings = ['Local', 'Nuvem (Local)', 'Vultr', 'AWS', 'Contabo', 'Hetzner', 'Outro'].map((n) => ({ id: 'h' + n.replace(/\W/g, ''), name: n, active: true }));
  S.categories = ['Telefone IP', 'Periférico', 'ATA', 'Gateway', 'Switch', 'Outro'].map((n) => ({ id: 'cat' + n.replace(/\W/g, ''), name: n, active: true }));
  /** Logos fictícias da demonstração: um quadrado com as iniciais, desenhado em SVG. */
  const logoFake = (iniciais: string, cor: string) =>
    'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="18" fill="${cor}"/><text x="48" y="62" font-family="Verdana,sans-serif" font-size="38" font-weight="bold" fill="#fff" text-anchor="middle">${iniciais}</text></svg>`);
  const logos: Record<string, string> = {
    'Clínica Aurora': logoFake('CA', '#0E7490'),
    'Hospital Vale Verde': logoFake('VV', '#15803D'),
    'Supermercado Bom Preço': logoFake('BP', '#B91C1C'),
    'Distribuidora Norte': logoFake('DN', '#1D4ED8'),
  };
  const mk = (t: string, l: string, cnpj: string, extra: Partial<Client> = {}): Client => ({ id: id(), tradeName: t, legalName: l, cnpj, logoUrl: null, archived: false, isInternal: false, internalCode: null, notes: null, deletedAt: null, createdAt: daysAgo(400), updatedAt: daysAgo(10), ...extra });
  const ingline = mk('Ingline Systems', 'Ingline Systems', '00000000000191', { isInternal: true, internalCode: 'ingline' });
  const voicenet = mk('VoiceNet', 'VoiceNet Telecom', '00000000000272', { isInternal: true, internalCode: 'voicenet' });
  // [nome, razão social, cnpj, produtos, módulos (produto:modulo), hospedagem, domínio, ip]
  const defs: Array<[string, string, string, string[], string[], string | null, string | null, string | null]> = [
    ['Clínica Aurora', 'Clínica Aurora Serviços Médicos LTDA', '11222333000181', ['linepbx', 'voicenet'], ['linepbx:fop2'], 'Vultr', 'aurora.linepbx.com.br', '203.0.113.10'],
    ['Distribuidora Norte', 'Norte Comércio e Distribuição LTDA', '22333444000181', ['linepbx', 'voicenet', 'linechat', 'equipamentos'], ['linechat:dashboard_filas'], 'Local', null, '192.0.2.50'],
    ['Hospital Vale Verde', 'Associação Hospitalar Vale Verde', '33444555000181', ['linepbx', 'linereports', 'voicenet', 'equipamentos'], ['linepbx:fop2', 'linepbx:omniboard', 'linepbx:nps'], 'Hetzner', 'valeverde.linepbx.com.br', '198.51.100.7'],
    ['Escritório Prado & Lima', 'Prado e Lima Advogados Associados', '44555666000181', ['voicenet', 'linechat'], ['linechat:nps'], null, null, null],
    ['Supermercado Bom Preço', 'Bom Preço Supermercados LTDA', '55666777000181', ['linepbx', 'voicenet', 'equipamentos'], ['linepbx:fop2'], 'Nuvem (Local)', 'bompreco.linepbx.com.br', '203.0.113.88'],
    ['Laboratório Exame Certo', 'Exame Certo Análises Clínicas LTDA', '66777888000181', ['linepbx', 'voicenet'], [], 'AWS', 'exame.linepbx.com.br', '203.0.113.121'],
    ['Construtora Horizonte', 'Horizonte Engenharia e Construções S.A.', '77888999000181', ['voicenet'], [], null, null, null],
    ['Home Care Viver Bem', 'Viver Bem Atenção Domiciliar LTDA', '88999000000198', ['linepbx', 'voicenet', 'linechat', 'equipamentos'], ['linepbx:omniboard', 'linechat:dashboard_filas', 'linechat:nps'], 'Vultr', 'viverbem.linepbx.com.br', '203.0.113.200'],
    ['Farmácia Central (arquivada)', 'Central Farma LTDA', '99000111000105', ['voicenet'], [], null, null, null],
  ];
  S.clients = [ingline, voicenet];
  const byName: Record<string, string> = {};
  defs.forEach(([t, l, cnpj, prods, mods, host, dom, ip], i) => {
    const c = mk(t, l, cnpj, { archived: i === 8, logoUrl: logos[t] ?? null });
    S.clients.push(c); byName[t] = c.id;
    prods.forEach((code, j) => {
      const settings: Record<string, any> = {};
      if (code === 'linepbx') { const sec = id(); S.secrets.set(sec, { label: `Senha SSH do LinePBX — ${t}`, value: 'Ssh#' + cnpj.slice(0, 5) }); Object.assign(settings, { hostingId: host ? 'h' + host.replace(/\W/g, '') : null, hostingName: host, serverIp: ip, domain: dom, sshUser: 'root', sshPort: 22, sshPasswordSecretId: sec }); }
      const sub: Sub = { id: id(), clientId: c.id, productCode: code, activatedAt: daysAgo(500 - i * 30 - j * 7), deactivatedAt: null, notes: code === 'linepbx' && i === 2 ? 'Gravação de chamadas contratada' : null, settings };
      S.subs.push(sub);
      mods.filter((m) => m.startsWith(code + ':')).forEach((pm, k) => {
        const mcode = pm.split(':')[1]!; const mod = S.modules.find((m) => m.productId === 'p' + code && m.code === mcode)!;
        const ms: Record<string, any> = {};
        if (mcode === 'fop2') ms.adminExtension = '1000';
        if (mcode === 'omniboard') { const a = id(), d = id(); S.secrets.set(a, { label: `Senha admin do Omniboard — ${t}`, value: 'Omni#2026' }); S.secrets.set(d, { label: `Senha padrão de usuário do Omniboard — ${t}`, value: 'Bemvindo1' }); Object.assign(ms, { adminLogin: `admin@${t.toLowerCase().replace(/\W+/g, '')}.com.br`, adminPasswordSecretId: a, userDefaultPasswordSecretId: d }); }
        S.subMods.push({ id: id(), subscriptionId: sub.id, moduleId: mod.id, activatedAt: daysAgo(400 - i * 20 - k * 30), deactivatedAt: null, notes: null, settings: ms });
      });
    });
  });
  const circ = [
    ['071 Principal', '09802603', 'ALGAR', 30, '7130200000', 120, 60338, [['Supermercado Bom Preço', 0, 40], ['Laboratório Exame Certo', 40, 70]]],
    ['071 Hospitalar', '010241793', 'ALGAR', 60, '7132170000', 200, 120000, [['Hospital Vale Verde', 0, 150]]],
    ['Link - Distribuidora Norte', '73169', 'VC1', 5, '7131720000', 12, 25000, [['Distribuidora Norte', 0, 12]]],
    ['Link - Aurora', '94234', 'VC1', 2, '7130396100', 4, 9900, [['Clínica Aurora', 0, 4]]],
    ['Feixe Reserva', '88001', 'VC1', 0, '7135550000', 10, 5000, []],
  ] as const;
  for (const [name, code, car, ch, base, qty, value, assign] of circ) {
    const sec = id(); S.secrets.set(sec, { label: `Senha do tronco — ${name}`, value: 'Trk#' + code });
    const cid = id();
    S.circuits.push({ id: cid, name, code, keyNumber: base, carrierId: 'car' + car, channels: ch, ownerClientId: voicenet.id, monthlyValueCents: value, signalingIp: '203.0.113.1', authIp: '198.51.100.1', authUsername: 'tr' + code, authPasswordSecretId: sec, notes: null, deletedAt: null });
    gerarFaixaDids(base, qty).forEach((n, i) => {
      const a = (assign as readonly (readonly [string, number, number])[]).find((x) => i >= x[1] && i < x[2]);
      S.dids.push({ id: id(), number: n, circuitId: cid, clientId: a ? byName[a[0]]! : null, ownerClientId: voicenet.id, note: a && i % 9 === 0 ? 'principal' : null, deletedAt: null });
    });
  }
  const mGx: ModelRow = { id: id(), code: 'gxp1610', name: 'Grandstream GXP1610', categoryId: 'catTelefoneIP', tracking: 'serializado', imageUrl: null, deletedAt: null };
  const mHs: ModelRow = { id: id(), code: 'headset', name: 'Headset Genérico', categoryId: 'catPeriferico', tracking: 'granel', imageUrl: null, deletedAt: null };
  const mTip: ModelRow = { id: id(), code: 'tip125i', name: 'Intelbras TIP 125i', categoryId: 'catTelefoneIP', tracking: 'serializado', imageUrl: null, deletedAt: null };
  S.models = [mGx, mHs, mTip];
  let n = 0;
  const locados: Array<[string, number, number]> = [['Hospital Vale Verde', 20, 30], ['Distribuidora Norte', 8, 20], ['Supermercado Bom Preço', 6, 12], ['Home Care Viver Bem', 4, 5]];
  for (const [cli, q, d] of locados) {
    const mid = id();
    const items: MovRow['items'] = [];
    for (let i = 0; i < q; i++, n++) { const dev: DeviceRow = { id: id(), modelId: mGx.id, mac: '000B82' + (0x100000 + n).toString(16).toUpperCase().slice(-6), macSecondary: null, tag: 'N' + String(n + 1).padStart(3, '0'), clientId: byName[cli]!, currentModality: 'locacao', condition: 'ativo', valueCents: 45000, ip: `10.0.${n % 4}.${20 + n}`, location: null, note: null, deletedAt: null, createdAt: daysAgo(d + 3) }; S.devices.push(dev); items.push({ modelId: mGx.id, deviceId: dev.id, quantity: 1 }); }
    S.movements.push({ id: mid, modality: 'locacao', fromClientId: null, toClientId: byName[cli]!, newCondition: 'ativo', valueCents: null, note: null, userId: 'u2', createdAt: daysAgo(d), items });
  }
  for (let i = 0; i < 12; i++, n++) S.devices.push({ id: id(), modelId: mGx.id, mac: '000B82' + (0x100000 + n).toString(16).toUpperCase().slice(-6), macSecondary: null, tag: 'N' + String(n + 1).padStart(3, '0'), clientId: null, currentModality: null, condition: i === 11 ? 'manutencao' : 'ativo', valueCents: 45000, ip: null, location: 'Estoque · Prateleira B', note: i === 11 ? 'Tela piscando; aguardando peça' : null, deletedAt: null, createdAt: daysAgo(60) });
  for (let i = 0; i < 3; i++, n++) S.devices.push({ id: id(), modelId: mTip.id, mac: '1C61B4' + (0x200000 + n).toString(16).toUpperCase().slice(-6), macSecondary: null, tag: null, clientId: null, currentModality: null, condition: 'ativo', valueCents: 38000, ip: null, location: 'Estoque · Prateleira A', note: null, deletedAt: null, createdAt: daysAgo(20) });
  S.bulk = [{ id: id(), modelId: mHs.id, clientId: null, modality: 'estoque', quantity: 28 }, { id: id(), modelId: mHs.id, clientId: byName['Hospital Vale Verde']!, modality: 'locacao', quantity: 4 }];
  S.movements.push({ id: id(), modality: 'locacao', fromClientId: null, toClientId: byName['Hospital Vale Verde']!, newCondition: null, valueCents: null, note: 'Headsets para o call center', userId: 'u3', createdAt: daysAgo(2, 14), items: [{ modelId: mHs.id, deviceId: null, quantity: 4 }] });
  S.audit = [
    { id: id(), action: 'bulk_update', entityType: 'did', entityId: null, summary: 'Alterou 40 DID(s): cliente → Supermercado Bom Preço', before: null, after: null, userName: 'Lúcio Andrade', userId: 'u2', createdAt: daysAgo(1, 16) },
    { id: id(), action: 'reveal_secret', entityType: 'secret', entityId: null, summary: 'Lúcio Andrade revelou "Senha SSH do LinePBX — Clínica Aurora"', before: null, after: null, userName: 'Lúcio Andrade', userId: 'u2', createdAt: daysAgo(1, 11) },
    { id: id(), action: 'movement', entityType: 'deviceMovement', entityId: null, summary: 'Locação de 4 aparelho(s) para cliente', before: null, after: null, userName: 'Marina Costa', userId: 'u3', createdAt: daysAgo(2, 14) },
    { id: id(), action: 'update', entityType: 'client', entityId: null, summary: 'Luan França editou o cliente Clínica Aurora', before: null, after: null, userName: 'Luan França', userId: 'u1', createdAt: daysAgo(3) },
  ];
}
seed();

// ---------------- ajudantes ----------------
const prodMeta = (code: string) => S.products.find((p) => p.code === code)!;
const activeSubs = (cid: string) => S.subs.filter((s) => s.clientId === cid && !s.deactivatedAt);
const modMeta = (mid: string) => S.modules.find((m) => m.id === mid)!;
/** Módulos ligados numa assinatura (ordenados como no catálogo). */
const activeMods = (subId: string) => S.subMods.filter((m) => m.subscriptionId === subId && !m.deactivatedAt).sort((a, b) => modMeta(a.moduleId).sortOrder - modMeta(b.moduleId).sortOrder);
const hasMod = (cid: string, product: string, mod: string) => { const s = activeSubs(cid).find((x) => x.productCode === product); return !!s && activeMods(s.id).some((m) => modMeta(m.moduleId).code === mod); };
const links = (cid: string) => {
  const lp = activeSubs(cid).find((s) => s.productCode === 'linepbx')?.settings;
  const host = lp?.domain || lp?.serverIp;
  if (!lp || !host) return { web: null, ssh: null, fop2: null };
  return { web: `https://${host}`, ssh: lp.sshUser ? `ssh://${lp.sshUser}@${lp.serverIp || lp.domain}:${lp.sshPort ?? 22}` : null, fop2: hasMod(cid, 'linepbx', 'fop2') ? `https://${host}/fop2/` : null };
};
const secretRef = (sid: string | null | undefined) => ({ hasSecret: !!sid, secretId: sid ?? null });
const listItem = (c: Client): ClientListItem => {
  const lp = activeSubs(c.id).find((s) => s.productCode === 'linepbx')?.settings;
  return {
    id: c.id, tradeName: c.tradeName, legalName: c.legalName, cnpj: c.cnpj, logoUrl: c.logoUrl, archived: c.archived, isInternal: c.isInternal,
    notes: c.notes, createdAt: c.createdAt, updatedAt: c.updatedAt,
    products: activeSubs(c.id).sort((a, b) => prodMeta(a.productCode).sortOrder - prodMeta(b.productCode).sortOrder).map((s) => { const p = prodMeta(s.productCode); return { code: p.code, name: p.name, color: p.color, activatedAt: s.activatedAt, modules: activeMods(s.id).map((m) => ({ code: modMeta(m.moduleId).code, name: modMeta(m.moduleId).name, activatedAt: m.activatedAt })) }; }),
    server: lp ? { hostingName: S.hostings.find((h) => h.id === lp.hostingId)?.name ?? null, serverIp: lp.serverIp ?? null, domain: lp.domain ?? null, sshUser: lp.sshUser ?? null, sshPort: lp.sshPort ?? null } : null,
    links: links(c.id), didCount: S.dids.filter((d) => d.clientId === c.id && !d.deletedAt).length, deviceCount: S.devices.filter((d) => d.clientId === c.id && !d.deletedAt && d.condition !== 'vendido').length,
  };
};
const shapeSubMod = (m: SubMod): SubscriptionModule => {
  const meta = modMeta(m.moduleId); const st = m.settings; let settings: Record<string, any> | null = null;
  if (meta.code === 'fop2') settings = { adminExtension: st.adminExtension ?? null };
  else if (meta.code === 'omniboard') settings = { adminLogin: st.adminLogin ?? null, adminPassword: secretRef(st.adminPasswordSecretId), userDefaultPassword: secretRef(st.userDefaultPasswordSecretId) };
  return { id: m.id, moduleCode: meta.code, moduleName: meta.name, hasSettings: meta.hasSettings, active: !m.deactivatedAt, activatedAt: m.activatedAt, deactivatedAt: m.deactivatedAt, notes: m.notes, settings };
};
const fullClient = (idc: string): ClientFull => {
  const c = S.clients.find((x) => x.id === idc && !x.deletedAt); if (!c) throw notFound('Cliente');
  const subs: Subscription[] = S.subs.filter((s) => s.clientId === idc).map((s) => {
    const p = prodMeta(s.productCode); const st = s.settings; let settings: Record<string, any> | null = null;
    if (s.productCode === 'linepbx') settings = { hostingId: st.hostingId, hostingName: S.hostings.find((h) => h.id === st.hostingId)?.name ?? null, serverIp: st.serverIp, domain: st.domain, sshUser: st.sshUser, sshPort: st.sshPort, sshPassword: secretRef(st.sshPasswordSecretId) };
    else if (s.productCode === 'szchat') settings = { adminLogin: st.adminLogin ?? null, adminPassword: secretRef(st.adminPasswordSecretId) };
    const modules = S.subMods.filter((m) => m.subscriptionId === s.id).sort((a, b) => modMeta(a.moduleId).sortOrder - modMeta(b.moduleId).sortOrder).map(shapeSubMod);
    return { id: s.id, productCode: s.productCode, productName: p.name, color: p.color, hasSettings: p.hasSettings, active: !s.deactivatedAt, activatedAt: s.activatedAt, deactivatedAt: s.deactivatedAt, notes: s.notes, settings, modules, sortOrder: p.sortOrder };
  }).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  return { ...listItem(c), subscriptions: subs };
};
const shapeCircuit = (c: CircuitRow): Circuit => {
  const ds = S.dids.filter((d) => d.circuitId === c.id && !d.deletedAt); const assigned = ds.filter((d) => d.clientId).length;
  return { id: c.id, name: c.name, code: c.code, keyNumber: c.keyNumber, carrierId: c.carrierId, carrierName: S.carriers.find((x) => x.id === c.carrierId)?.name ?? null, channels: c.channels, ownerClientId: c.ownerClientId, ownerName: S.clients.find((x) => x.id === c.ownerClientId)?.tradeName ?? null, monthlyValueCents: c.monthlyValueCents, signalingIp: c.signalingIp, authIp: c.authIp, authUsername: c.authUsername, authPassword: secretRef(c.authPasswordSecretId), notes: c.notes, dids: { total: ds.length, assigned, free: ds.length - assigned } };
};
const shapeDid = (d: DidRow): Did => { const c = S.circuits.find((x) => x.id === d.circuitId); return { id: d.id, number: d.number, numberFormatted: didFormatado(d.number), free: !d.clientId, circuitId: d.circuitId, circuitName: c?.name ?? null, circuitCode: c?.code ?? null, carrierName: S.carriers.find((x) => x.id === c?.carrierId)?.name ?? null, clientId: d.clientId, clientName: S.clients.find((x) => x.id === d.clientId)?.tradeName ?? null, ownerClientId: d.ownerClientId, ownerName: S.clients.find((x) => x.id === d.ownerClientId)?.tradeName ?? null, note: d.note }; };
const shapeModel = (m: ModelRow): DeviceModel => {
  const ds = S.devices.filter((d) => d.modelId === m.id && !d.deletedAt);
  const inStock = m.tracking === 'granel' ? S.bulk.filter((b) => b.modelId === m.id && !b.clientId).reduce((a, b) => a + b.quantity, 0) : ds.filter((d) => !d.clientId && ['ativo', 'manutencao'].includes(d.condition)).length;
  const withClients = m.tracking === 'granel' ? S.bulk.filter((b) => b.modelId === m.id && b.clientId).reduce((a, b) => a + b.quantity, 0) : ds.filter((d) => d.clientId && !['vendido', 'baixado'].includes(d.condition)).length;
  return { ...m, categoryName: S.categories.find((c) => c.id === m.categoryId)?.name ?? null, counts: { total: inStock + withClients, inStock, withClients, sold: ds.filter((d) => d.condition === 'vendido').length, maintenance: ds.filter((d) => d.condition === 'manutencao').length, retired: ds.filter((d) => d.condition === 'baixado').length } };
};
const shapeDevice = (d: DeviceRow, withHistory = false): Device => {
  const m = S.models.find((x) => x.id === d.modelId)!;
  const base: Device = { ...d, macFormatted: macFormatado(d.mac), modelName: m.name, modelCode: m.code, clientName: S.clients.find((x) => x.id === d.clientId)?.tradeName ?? null };
  if (withHistory) base.history = S.movements.filter((mv) => mv.items.some((i) => i.deviceId === d.id)).map((mv) => ({ id: mv.id, modality: mv.modality, modalityName: (MODALIDADES as any)[mv.modality], fromName: S.clients.find((x) => x.id === mv.fromClientId)?.tradeName ?? null, toName: S.clients.find((x) => x.id === mv.toClientId)?.tradeName ?? null, newCondition: mv.newCondition, note: mv.note, userName: S.users.find((u) => u.id === mv.userId)?.name ?? '?', createdAt: mv.createdAt })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return base;
};
const shapeMov = (mv: MovRow): Movement => ({ id: mv.id, modality: mv.modality, modalityName: (MODALIDADES as any)[mv.modality], fromClientId: mv.fromClientId, fromName: S.clients.find((x) => x.id === mv.fromClientId)?.tradeName ?? null, toClientId: mv.toClientId, toName: S.clients.find((x) => x.id === mv.toClientId)?.tradeName ?? null, newCondition: mv.newCondition, valueCents: mv.valueCents, note: mv.note, userName: S.users.find((u) => u.id === mv.userId)?.name ?? '?', createdAt: mv.createdAt, items: Object.values(mv.items.reduce((acc, i) => { const k = i.modelId; acc[k] = acc[k] ?? { modelName: S.models.find((m) => m.id === k)?.name ?? '?', quantity: 0 }; acc[k]!.quantity += i.quantity; return acc; }, {} as Record<string, { modelName: string; quantity: number }>)) });
const shapeProduct = (p: (typeof S.products)[number]): Product => ({ id: p.id, code: p.code, name: p.name, color: p.color, description: p.description, hasSettings: p.hasSettings, sortOrder: p.sortOrder, active: p.active, modules: S.modules.filter((m) => m.productId === p.id).sort((a, b) => a.sortOrder - b.sortOrder).map(({ productId: _p, ...m }) => m) });
/**
 * Ordenação da demonstração: mesma ideia do servidor — vazio sempre no fim,
 * texto comparado em português e o que não for reconhecido cai na coluna padrão.
 */
function ordenar<T>(itens: T[], q: Record<string, unknown>, padrao: string, valores: Record<string, (x: T) => any>, dirPadrao: 'asc' | 'desc' = 'asc') {
  const chave = String(q.sort ?? padrao);
  const pegar = valores[chave] ?? valores[padrao]!;
  const sinal = (q.dir ?? dirPadrao) === 'desc' ? -1 : 1;
  return [...itens].sort((a, b) => {
    const va = pegar(a), vb = pegar(b);
    const vazioA = va === null || va === undefined || va === '';
    const vazioB = vb === null || vb === undefined || vb === '';
    if (vazioA && vazioB) return 0;
    if (vazioA) return 1;
    if (vazioB) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * sinal;
  });
}

const paginate = <T,>(items: T[], q: Record<string, unknown>) => { const page = Number(q.page ?? 1), pageSize = Number(q.pageSize ?? 50); return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize }; };
const me = (u: UserRow): Me => { const r = S.roles.find((x) => x.id === u.roleId)!; return { id: u.id, name: u.name, email: u.email, roleId: u.roleId, roleName: r.name, roleKey: r.key, permissions: r.permissions }; };
const hasEquip = (cid: string) => activeSubs(cid).some((s) => s.productCode === 'equipamentos');
/** Os filtros da tela de Circuitos — os mesmos para a lista e para os cartões do topo. */
const filtrarCircuitos = (q: Record<string, unknown>) => {
  const t = String(q.q ?? '').toLowerCase();
  return S.circuits.filter((c) => !c.deletedAt
    && (!q.carrierId || c.carrierId === q.carrierId)
    && (!q.ownerClientId || c.ownerClientId === q.ownerClientId)
    && (!t || c.name.toLowerCase().includes(t) || c.code.includes(t) || (c.keyNumber ?? '').includes(t)));
};
const filterDids = (q: Record<string, unknown>) => S.dids.filter((d) => !d.deletedAt).filter((d) => (!q.q || d.number.includes(String(q.q).replace(/\D/g, ''))) && (!q.circuitId || (q.circuitId === 'none' ? !d.circuitId : d.circuitId === q.circuitId)) && (!q.clientId || (q.clientId === 'free' ? !d.clientId : d.clientId === q.clientId)) && (!q.ownerClientId || d.ownerClientId === q.ownerClientId));

// ---------------- a API ----------------
export const demoApi: Api = {
  auth: {
    async me() { await wait(50); if (!S.me) throw new ApiError(401, 'Faça login para continuar'); return me(S.me); },
    async login(email, password) { await wait(300); const u = S.users.find((x) => x.email === email.toLowerCase() && x.active); if (!u || password !== u.password) throw new ApiError(401, 'E-mail ou senha incorretos (na demonstração, a senha é "demo")'); S.me = u; u.lastLoginAt = now(); audit('login', 'user', `${u.name} entrou`, u.id); return me(u); },
    async logout() { if (S.me) audit('logout', 'user', `${S.me.name} saiu`, S.me.id); S.me = null; return { ok: true }; },
    async changePassword(cur, nw) { if (!S.me) throw new ApiError(401, 'Faça login'); if (cur !== S.me.password) throw new ApiError(401, 'Senha atual incorreta'); S.me.password = nw; return { ok: true }; },
  },
  dashboard: {
    async summary() {
      await wait(); requirePerm('records.read');
      const active = S.clients.filter((c) => !c.deletedAt && !c.archived && !c.isInternal);
      const ds = S.dids.filter((d) => !d.deletedAt);
      const circuits = S.circuits.filter((c) => !c.deletedAt).map(shapeCircuit).map((c) => ({ id: c.id, name: c.name, carrierName: c.carrierName, channels: c.channels, total: c.dids.total, assigned: c.dids.assigned, free: c.dids.free })).sort((a, b) => b.total - a.total);
      const dev = S.devices.filter((d) => !d.deletedAt);
      const alerts: any[] = [];
      const lpNo = active.filter((c) => activeSubs(c.id).some((s) => s.productCode === 'linepbx' && !(s.settings.domain || s.settings.serverIp))).length; if (lpNo) alerts.push({ kind: 'linepbx_sem_endereco', severity: 'warning', message: 'Clientes com LinePBX sem endereço do servidor', count: lpNo, link: '/clientes?produtos=linepbx' });
      const didNo = new Set(ds.filter((d) => d.clientId && !activeSubs(d.clientId).some((s) => s.productCode === 'voicenet')).map((d) => d.clientId)).size; if (didNo) alerts.push({ kind: 'did_sem_voicenet', severity: 'warning', message: 'Clientes com DIDs alocados mas sem o produto VoiceNet', count: didNo, link: '/circuitos?aba=numeracao' });
      const zero = circuits.filter((c) => c.channels === 0 && c.total > 0).length; if (zero) alerts.push({ kind: 'circuito_sem_canais', severity: 'critical', message: 'Circuitos com DIDs mas 0 canais cadastrados', count: zero, link: '/circuitos' });
      const noC = ds.filter((d) => !d.circuitId).length; if (noC) alerts.push({ kind: 'did_sem_circuito', severity: 'warning', message: 'DIDs sem circuito', count: noC, link: '/circuitos?aba=numeracao&circuito=none' });
      const man = dev.filter((d) => d.condition === 'manutencao').length; if (man) alerts.push({ kind: 'aparelho_manutencao', severity: 'warning', message: 'Aparelhos em manutenção', count: man, link: '/inventario?condicao=manutencao' });
      return {
        clients: { active: active.length, byProduct: S.products.map((p) => ({ code: p.code, name: p.name, color: p.color, n: active.filter((c) => activeSubs(c.id).some((s) => s.productCode === p.code)).length })) },
        dids: { total: ds.length, assigned: ds.filter((d) => d.clientId).length, free: ds.filter((d) => !d.clientId).length, noCircuit: noC },
        circuits,
        devices: { inStock: dev.filter((d) => !d.clientId && ['ativo', 'manutencao'].includes(d.condition)).length + S.bulk.filter((b) => !b.clientId).reduce((a, b) => a + b.quantity, 0), withClients: dev.filter((d) => d.clientId && !['vendido', 'baixado'].includes(d.condition)).length + S.bulk.filter((b) => b.clientId).reduce((a, b) => a + b.quantity, 0), maintenance: man, valueWithClientsCents: dev.filter((d) => d.clientId && ['locacao', 'comodato'].includes(d.currentModality ?? '') && !['vendido', 'baixado'].includes(d.condition)).reduce((a, d) => a + (d.valueCents ?? 0), 0) },
        alerts,
        recentMovements: [...S.movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((m) => ({ id: m.id, modality: m.modality, modalityName: (MODALIDADES as any)[m.modality], fromName: S.clients.find((x) => x.id === m.fromClientId)?.tradeName ?? null, toName: S.clients.find((x) => x.id === m.toClientId)?.tradeName ?? null, userName: S.users.find((u) => u.id === m.userId)?.name ?? '?', createdAt: m.createdAt })),
        recentAudit: S.audit.filter((a) => !['login', 'logout'].includes(a.action)).slice(0, 8),
      };
    },
    async search(q) {
      await wait(80); requirePerm('records.read'); const t = q.trim().toLowerCase(); const digits = t.replace(/\D/g, ''); const hex = t.replace(/[^0-9a-f]/g, '').toUpperCase();
      if (!t) return { clients: [], dids: [], circuits: [], devices: [] };
      return {
        clients: S.clients.filter((c) => !c.deletedAt && !c.isInternal && (c.tradeName.toLowerCase().includes(t) || c.legalName.toLowerCase().includes(t) || (digits && c.cnpj.includes(digits)))).slice(0, 8).map((c) => ({ id: c.id, name: c.tradeName, legalName: c.legalName, cnpj: c.cnpj })),
        dids: digits.length >= 3 ? S.dids.filter((d) => !d.deletedAt && d.number.includes(digits)).slice(0, 8).map((d) => { const s = shapeDid(d); return { id: d.id, number: d.number, numberFormatted: s.numberFormatted, clientName: s.clientName, circuitName: s.circuitName }; }) : [],
        circuits: S.circuits.filter((c) => !c.deletedAt && (c.name.toLowerCase().includes(t) || c.code.includes(t))).slice(0, 8).map((c) => ({ id: c.id, name: c.name, code: c.code, carrierName: S.carriers.find((x) => x.id === c.carrierId)?.name ?? null })),
        devices: S.devices.filter((d) => !d.deletedAt && ((hex.length >= 4 && d.mac.includes(hex)) || (d.tag ?? '').toLowerCase().includes(t))).slice(0, 8).map((d) => ({ id: d.id, mac: d.mac, macFormatted: macFormatado(d.mac), tag: d.tag, modelName: S.models.find((m) => m.id === d.modelId)?.name ?? '?', clientName: S.clients.find((x) => x.id === d.clientId)?.tradeName ?? null })),
      };
    },
  },
  clients: {
    async list(q) {
      await wait(); requirePerm('records.read');
      const term = String(q.q ?? '').toLowerCase(); const digits = term.replace(/\D/g, '');
      const prods = ([] as string[]).concat((q.products as any) ?? []); const mods = ([] as string[]).concat((q.modules as any) ?? []); const mode = q.mode ?? 'or';
      const items = S.clients.filter((c) => !c.deletedAt && !c.isInternal && (q.includeArchived === true || q.includeArchived === 'true' || !c.archived))
        .filter((c) => !term || c.tradeName.toLowerCase().includes(term) || c.legalName.toLowerCase().includes(term) || (digits && c.cnpj.includes(digits)))
        .filter((c) => { if (!prods.length) return true; const have = activeSubs(c.id).map((s) => s.productCode); return mode === 'and' ? prods.every((p) => have.includes(p)) : prods.some((p) => have.includes(p)); })
        .filter((c) => { if (!mods.length) return true; const test = (pm: string) => { const [p, m] = pm.split(':'); return hasMod(c.id, p!, m!); }; return mode === 'and' ? mods.every(test) : mods.some(test); })
        .map(listItem);
      const doProduto = (c: ClientListItem, code: string) => c.products.find((p) => p.code === code);
      const valores: Record<string, (c: ClientListItem) => any> = {
        tradeName: (c) => c.tradeName, legalName: (c) => c.legalName, cnpj: (c) => c.cnpj, notes: (c) => c.notes,
        createdAt: (c) => c.createdAt, updatedAt: (c) => c.updatedAt,
        didCount: (c) => c.didCount, deviceCount: (c) => c.deviceCount,
        products: (c) => c.products.length, modules: (c) => c.products.reduce((a, p) => a + p.modules.length, 0),
        hosting: (c) => c.server?.hostingName, domain: (c) => c.server?.domain, serverIp: (c) => c.server?.serverIp, ssh: (c) => c.server?.sshUser,
      };
      const chave = String(q.sort ?? 'tradeName');
      if (chave.startsWith('ativacao:')) valores[chave] = (c) => doProduto(c, chave.slice(9))?.activatedAt;
      if (chave.startsWith('modulo:')) { const [, pc = '', mc = ''] = chave.split(':'); valores[chave] = (c) => doProduto(c, pc)?.modules.find((m) => m.code === mc)?.activatedAt; }
      return paginate(ordenar(items, q, 'tradeName', valores), q);
    },
    async options(q) { await wait(50); return S.clients.filter((c) => !c.deletedAt && !c.archived && (q?.includeInternal || !c.isInternal) && (!q?.productCode || activeSubs(c.id).some((s) => s.productCode === q.productCode))).sort((a, b) => Number(b.isInternal) - Number(a.isInternal) || a.tradeName.localeCompare(b.tradeName)).map((c) => ({ id: c.id, name: c.tradeName, isInternal: c.isInternal, internalCode: c.internalCode })); },
    async get(idc) { await wait(); requirePerm('records.read'); return fullClient(idc); },
    async create(d) { await wait(); requirePerm('records.write'); const cnpj = cnpjLimpo(String(d.cnpj ?? '')); if (!cnpjValido(cnpj)) throw new ApiError(400, 'Dados inválidos', [{ field: 'cnpj', message: 'CNPJ inválido (dígito verificador não confere)' }]); if (S.clients.some((c) => c.cnpj === cnpj)) throw bad('Já existe um cliente com este CNPJ'); const c: Client = { id: id(), tradeName: String(d.tradeName), legalName: String(d.legalName), cnpj, logoUrl: null, archived: false, isInternal: false, internalCode: null, notes: (d.notes as string) ?? null, deletedAt: null, createdAt: now(), updatedAt: now() }; S.clients.push(c); audit('create', 'client', `Criou o cliente ${c.tradeName}`, c.id); return fullClient(c.id); },
    async update(idc, d) { await wait(); requirePerm('records.write'); const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente'); if (d.cnpj) { const cn = cnpjLimpo(String(d.cnpj)); if (!cnpjValido(cn)) throw new ApiError(400, 'Dados inválidos', [{ field: 'cnpj', message: 'CNPJ inválido' }]); c.cnpj = cn; } for (const k of ['tradeName', 'legalName', 'notes', 'archived'] as const) if (d[k] !== undefined) (c as any)[k] = d[k]; c.updatedAt = now(); audit('update', 'client', `${S.me!.name} ${d.archived === true ? 'arquivou' : d.archived === false ? 'desarquivou' : 'editou'} o cliente ${c.tradeName}`, c.id); return fullClient(c.id); },
    async remove(idc) { await wait(); requirePerm('records.delete'); const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente'); c.deletedAt = now(); audit('delete', 'client', `Mandou o cliente ${c.tradeName} para a lixeira`, c.id); return { ok: true }; },
    async upsertSubscription(idc, d) {
      await wait(); requirePerm('records.write'); const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      const st = (d.settings as Record<string, any>) ?? {};
      if (['serverIp', 'domain', 'sshUser', 'sshPort', 'sshPassword', 'hostingId'].some((k) => k in st)) requirePerm('servers.write');
      let s = S.subs.find((x) => x.clientId === idc && x.productCode === d.productCode);
      if (!S.products.some((p) => p.code === d.productCode)) throw notFound(`Produto "${d.productCode}"`);
      if (!s) { s = { id: id(), clientId: idc, productCode: String(d.productCode), activatedAt: now(), deactivatedAt: null, notes: null, settings: {} }; S.subs.push(s); }
      s.deactivatedAt = null; if (d.activatedAt !== undefined) s.activatedAt = d.activatedAt as string; if (d.notes !== undefined) s.notes = d.notes as string;
      const saveSecret = (key: string, label: string) => { if (st[key]) { const sid = s!.settings[key + 'SecretId'] ?? id(); S.secrets.set(sid, { label: `${label} — ${c.tradeName}`, value: st[key] }); s!.settings[key + 'SecretId'] = sid; } };
      for (const [k, v] of Object.entries(st)) if (!/password/i.test(k)) s.settings[k] = v;
      saveSecret('sshPassword', 'Senha SSH do LinePBX'); saveSecret('adminPassword', 'Senha admin do SZChat');
      audit('update', 'subscription', `Atualizou o produto ${d.productCode} no cliente ${c.tradeName}`, s.id); return fullClient(idc);
    },
    async upsertModule(idc, d) {
      await wait(); requirePerm('records.write'); const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      const p = S.products.find((x) => x.code === d.productCode); if (!p) throw notFound(`Produto "${d.productCode}"`);
      const mod = S.modules.find((m) => m.productId === p.id && m.code === d.moduleCode); if (!mod) throw notFound(`Módulo "${d.moduleCode}" do produto ${p.name}`);
      const sub = activeSubs(idc).find((x) => x.productCode === p.code); if (!sub) throw bad(`Marque o produto ${p.name} no cliente antes de ligar o módulo ${mod.name}`);
      let m = S.subMods.find((x) => x.subscriptionId === sub.id && x.moduleId === mod.id);
      if (!m) { m = { id: id(), subscriptionId: sub.id, moduleId: mod.id, activatedAt: now(), deactivatedAt: null, notes: null, settings: {} }; S.subMods.push(m); }
      m.deactivatedAt = null; if (d.activatedAt !== undefined) m.activatedAt = d.activatedAt as string; if (d.notes !== undefined) m.notes = d.notes as string;
      const st = (d.settings as Record<string, any>) ?? {};
      for (const [k, v] of Object.entries(st)) if (!/password/i.test(k)) m.settings[k] = v;
      const saveSecret = (key: string, label: string) => { if (st[key]) { const sid = m!.settings[key + 'SecretId'] ?? id(); S.secrets.set(sid, { label: `${label} — ${c.tradeName}`, value: st[key] }); m!.settings[key + 'SecretId'] = sid; } };
      saveSecret('adminPassword', 'Senha admin do Omniboard'); saveSecret('userDefaultPassword', 'Senha padrão de usuário do Omniboard');
      audit('update', 'subscription_module', `Ligou/ajustou o módulo ${mod.name} (${p.name}) no cliente ${c.tradeName}`, m.id); return fullClient(idc);
    },
    async endModule(idc, productCode, moduleCode) {
      await wait(); requirePerm('records.write'); const sub = S.subs.find((x) => x.clientId === idc && x.productCode === productCode); if (!sub) throw notFound('Assinatura');
      const mod = S.modules.find((x) => x.productId === 'p' + productCode && x.code === moduleCode); if (!mod) throw notFound('Módulo');
      const m = S.subMods.find((x) => x.subscriptionId === sub.id && x.moduleId === mod.id && !x.deactivatedAt); if (!m) throw notFound('Módulo ligado');
      m.deactivatedAt = now(); audit('unsubscribe', 'subscription_module', `Desligou o módulo ${mod.name} (${prodMeta(productCode).name}) no cliente ${idc}`, m.id); return fullClient(idc);
    },
    async endSubscription(idc, code) { await wait(); requirePerm('records.write'); const s = S.subs.find((x) => x.clientId === idc && x.productCode === code && !x.deactivatedAt); if (!s) throw notFound('Assinatura ativa'); s.deactivatedAt = now(); audit('unsubscribe', 'subscription', `Encerrou o produto ${code} no cliente ${idc}`, s.id); return fullClient(idc); },
    async dids(idc) { await wait(); return paginate(S.dids.filter((d) => d.clientId === idc && !d.deletedAt).map(shapeDid), { pageSize: 500 }); },
    async devices(idc) { await wait(); return { devices: paginate(S.devices.filter((d) => d.clientId === idc && !d.deletedAt).map((d) => shapeDevice(d)), { pageSize: 500 }), bulk: S.bulk.filter((b) => b.clientId === idc && b.quantity > 0).map((b) => ({ ...b, modelName: S.models.find((m) => m.id === b.modelId)?.name ?? '?', clientName: S.clients.find((x) => x.id === idc)?.tradeName ?? null })) }; },
    async history(idc) { await wait(); requirePerm('audit.read'); return paginate(S.audit.filter((a) => a.entityId === idc), { pageSize: 100 }); },
    async saveLogo(idc, dataUrl) {
      await wait(200); requirePerm('records.write');
      const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      if (!/^data:image\//.test(dataUrl)) throw bad('Formato não suportado. Use PNG, JPG, WEBP ou SVG.');
      if (dataUrl.length > 700_000) throw bad('Imagem muito grande (máximo 512 KB).');
      c.logoUrl = dataUrl; c.updatedAt = now();
      audit('update', 'client', `Trocou a logo de ${c.tradeName}`, c.id);
      return fullClient(idc);
    },
    async removeLogo(idc) {
      await wait(); requirePerm('records.write');
      const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      if (!c.logoUrl) throw notFound('Logo');
      c.logoUrl = null; c.updatedAt = now();
      audit('update', 'client', `Removeu a logo de ${c.tradeName}`, c.id);
      return fullClient(idc);
    },
  },
  secrets: {
    async reveal(sid, password) { await wait(250); requirePerm('secrets.reveal'); if (password !== S.me!.password) throw new ApiError(401, 'Senha incorreta'); const s = S.secrets.get(sid); if (!s) throw notFound('Segredo'); audit('reveal_secret', 'secret', `${S.me!.name} revelou "${s.label}"`, sid); return { label: s.label, value: s.value, visibleForSeconds: 30 }; },
  },
  circuits: {
    async list(q) {
      await wait(); requirePerm('records.read');
      const items = filtrarCircuitos(q).map(shapeCircuit);
      return paginate(ordenar(items, q, 'name', {
        name: (c) => c.name, code: (c) => c.code, keyNumber: (c) => c.keyNumber, carrierName: (c) => c.carrierName, ownerName: (c) => c.ownerName,
        channels: (c) => c.channels, total: (c) => c.dids.total, free: (c) => c.dids.free,
        uso: (c) => (c.dids.total ? c.dids.assigned / c.dids.total : -1), monthlyValueCents: (c) => c.monthlyValueCents,
      }), q);
    },
    async summary(q = {}) {
      await wait(60); requirePerm('records.read');
      const cs = filtrarCircuitos(q);
      const filtrado = !!(q.q || q.carrierId || q.ownerClientId);
      const ids = new Set(cs.map((c) => c.id));
      const ds = S.dids.filter((d) => !d.deletedAt && (!filtrado || (d.circuitId && ids.has(d.circuitId))));
      const assigned = ds.filter((d) => d.clientId).length;
      return { circuits: cs.length, channels: cs.reduce((a, c) => a + c.channels, 0), monthlyValueCents: cs.reduce((a, c) => a + (c.monthlyValueCents ?? 0), 0), dids: { total: ds.length, assigned, free: ds.length - assigned, noCircuit: ds.filter((d) => !d.circuitId).length } };
    },
    async options() { await wait(50); return S.circuits.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, name: c.name, code: c.code, carrierName: S.carriers.find((x) => x.id === c.carrierId)?.name ?? null })); },
    async get(idc) { await wait(); requirePerm('records.read'); const c = S.circuits.find((x) => x.id === idc && !x.deletedAt); if (!c) throw notFound('Circuito'); return shapeCircuit(c); },
    async create(d) { await wait(); requirePerm('records.write'); if (S.circuits.some((c) => !c.deletedAt && c.code === d.code && (c.carrierId ?? null) === ((d.carrierId as string) ?? null))) throw bad('Já existe um circuito com este código nesta operadora'); const c: CircuitRow = { id: id(), name: String(d.name), code: String(d.code), keyNumber: (d.keyNumber as string) ?? null, carrierId: (d.carrierId as string) ?? null, channels: Number(d.channels ?? 0), ownerClientId: (d.ownerClientId as string) ?? null, monthlyValueCents: (d.monthlyValueCents as number) ?? null, signalingIp: (d.signalingIp as string) ?? null, authIp: (d.authIp as string) ?? null, authUsername: (d.authUsername as string) ?? null, authPasswordSecretId: null, notes: (d.notes as string) ?? null, deletedAt: null }; if (d.authPassword) { const sid = id(); S.secrets.set(sid, { label: `Senha do tronco — ${c.name}`, value: String(d.authPassword) }); c.authPasswordSecretId = sid; } S.circuits.push(c); audit('create', 'circuit', `Criou o circuito ${c.name}`, c.id); return shapeCircuit(c); },
    async update(idc, d) { await wait(); requirePerm('records.write'); const c = S.circuits.find((x) => x.id === idc); if (!c) throw notFound('Circuito'); for (const k of ['name', 'code', 'keyNumber', 'carrierId', 'channels', 'ownerClientId', 'monthlyValueCents', 'signalingIp', 'authIp', 'authUsername', 'notes'] as const) if (d[k] !== undefined) (c as any)[k] = d[k]; if (d.authPassword) { const sid = c.authPasswordSecretId ?? id(); S.secrets.set(sid, { label: `Senha do tronco — ${c.name}`, value: String(d.authPassword) }); c.authPasswordSecretId = sid; } audit('update', 'circuit', `Editou o circuito ${c.name}`, c.id); return shapeCircuit(c); },
    async remove(idc) { await wait(); requirePerm('records.delete'); const c = S.circuits.find((x) => x.id === idc); if (!c) throw notFound('Circuito'); const n = S.dids.filter((d) => d.circuitId === idc && !d.deletedAt).length; if (n) throw bad(`Este circuito ainda tem ${n} DIDs. Mova-os para outro circuito antes de excluir.`); c.deletedAt = now(); audit('delete', 'circuit', `Mandou o circuito ${c.name} para a lixeira`, c.id); return { ok: true }; },
    async createRange(idc, d) { return demoApi.dids.createRange({ ...d, circuitId: idc }); },
  },
  dids: {
    async list(q) {
      await wait(); requirePerm('records.read');
      const items = ordenar(filterDids(q).map(shapeDid), q, 'number', {
        number: (d) => d.number, carrier: (d) => d.carrierName, circuit: (d) => d.circuitName, client: (d) => d.clientName, owner: (d) => d.ownerName, note: (d) => d.note,
      });
      const p = paginate(items, q);
      return { ...p, free: items.filter((d) => d.free).length };
    },
    async ids(q) { await wait(50); return { ids: filterDids(q).slice(0, 5000).map((d) => d.id) }; },
    async createRange(d) { await wait(); requirePerm('dids.assign'); const nums = gerarFaixaDids(didLimpo(String(d.baseNumber)), Number(d.quantity)); const ex = nums.filter((n) => S.dids.some((x) => x.number === n)); if (ex.length) throw bad(`${ex.length} número(s) já existem: ${ex.slice(0, 5).map(didFormatado).join(', ')}`); nums.forEach((n) => S.dids.push({ id: id(), number: n, circuitId: (d.circuitId as string) ?? null, clientId: (d.clientId as string) ?? null, ownerClientId: (d.ownerClientId as string) ?? S.clients.find((c) => c.internalCode === 'voicenet')!.id, note: (d.note as string) ?? null, deletedAt: null })); audit('bulk_create', 'did', `Criou ${nums.length} DIDs (${nums[0]}–${nums[nums.length - 1]})`); return { created: nums.length, first: nums[0]!, last: nums[nums.length - 1]! }; },
    async update(idd, d) { await wait(); requirePerm('dids.assign'); const x = S.dids.find((r) => r.id === idd); if (!x) throw notFound('DID'); for (const k of ['circuitId', 'clientId', 'ownerClientId', 'note'] as const) if (d[k] !== undefined) (x as any)[k] = d[k]; audit('update', 'did', `Editou o DID ${x.number}`, x.id); return shapeDid(x); },
    async bulk(ids, set) { await wait(200); requirePerm('dids.assign'); if (!Object.keys(set).length) throw bad('Escolha pelo menos um campo para alterar'); let n = 0; for (const x of S.dids) if (ids.includes(x.id) && !x.deletedAt) { n++; for (const k of ['circuitId', 'clientId', 'note'] as const) if (k in set) (x as any)[k] = set[k]; } const parts: string[] = []; if ('circuitId' in set) parts.push(set.circuitId ? `circuito → ${S.circuits.find((c) => c.id === set.circuitId)?.name}` : 'circuito → sem circuito'); if ('clientId' in set) parts.push(set.clientId ? `cliente → ${S.clients.find((c) => c.id === set.clientId)?.tradeName}` : 'liberados (sem cliente)'); if ('note' in set) parts.push(set.note ? `observação → "${set.note}"` : 'observação limpa'); audit('bulk_update', 'did', `Alterou ${n} DID(s): ${parts.join(', ')}`); return { affected: n }; },
    async bulkDelete(ids) { await wait(); requirePerm('records.delete'); let n = 0; for (const x of S.dids) if (ids.includes(x.id) && !x.deletedAt) { x.deletedAt = now(); n++; } audit('bulk_delete', 'did', `Mandou ${n} DID(s) para a lixeira`); return { affected: n }; },
  },
  inventory: {
    async summary(q = {}): Promise<InventorySummary> {
      await wait(60); requirePerm('records.read');
      const t = String(q.q ?? '').toLowerCase(); const hex = t.replace(/[^0-9a-f]/g, '').toUpperCase();
      const filtrado = !!(q.q || q.modelId || q.clientId || q.condition);
      const devs = S.devices.filter((d) => !d.deletedAt
        && (!q.modelId || d.modelId === q.modelId)
        && (!q.clientId || (q.clientId === 'stock' ? !d.clientId : d.clientId === q.clientId))
        && (!q.condition || d.condition === q.condition)
        && (!t || (hex && d.mac.includes(hex)) || (d.tag ?? '').toLowerCase().includes(t) || (d.ip ?? '').includes(t) || (d.location ?? '').toLowerCase().includes(t)));
      const granel = q.q || q.condition ? [] : S.bulk.filter((b) => (!q.modelId || b.modelId === q.modelId) && (!q.clientId || (q.clientId === 'stock' ? !b.clientId : b.clientId === q.clientId)));
      return {
        inStock: devs.filter((d) => !d.clientId && ['ativo', 'manutencao'].includes(d.condition)).length + granel.filter((b) => !b.clientId).reduce((a, b) => a + b.quantity, 0),
        withClients: devs.filter((d) => d.clientId && !['vendido', 'baixado'].includes(d.condition)).length + granel.filter((b) => b.clientId).reduce((a, b) => a + b.quantity, 0),
        maintenance: devs.filter((d) => d.condition === 'manutencao').length,
        valueWithClientsCents: devs.filter((d) => d.clientId && ['locacao', 'comodato'].includes(d.currentModality ?? '') && !['vendido', 'baixado'].includes(d.condition)).reduce((a, d) => a + (d.valueCents ?? 0), 0),
        filtrado,
      };
    },
    async models(q) { await wait(); requirePerm('records.read'); const t = String(q?.q ?? '').toLowerCase(); return S.models.filter((m) => !m.deletedAt && (!t || m.name.toLowerCase().includes(t) || m.code.includes(t)) && (!q?.categoryId || m.categoryId === q.categoryId)).map(shapeModel); },
    async createModel(d) { await wait(); requirePerm('records.write'); if (S.models.some((m) => m.code === d.code)) throw bad('Já existe um modelo com este código'); const m: ModelRow = { id: id(), code: String(d.code), name: String(d.name), categoryId: (d.categoryId as string) ?? null, tracking: d.tracking as any, imageUrl: null, deletedAt: null }; S.models.push(m); audit('create', 'deviceModel', `Cadastrou o modelo ${m.name}`, m.id); return shapeModel(m); },
    async updateModel(idm, d) { await wait(); requirePerm('records.write'); const m = S.models.find((x) => x.id === idm); if (!m) throw notFound('Modelo'); for (const k of ['code', 'name', 'categoryId'] as const) if (d[k] !== undefined) (m as any)[k] = d[k]; audit('update', 'deviceModel', `Editou o modelo ${m.name}`, m.id); return shapeModel(m); },
    async removeModel(idm) { await wait(); requirePerm('records.delete'); const m = S.models.find((x) => x.id === idm); if (!m) throw notFound('Modelo'); if (S.devices.some((d) => d.modelId === idm && !d.deletedAt)) throw bad('Este modelo ainda tem aparelhos cadastrados'); m.deletedAt = now(); return { ok: true }; },
    async devices(q) { await wait(); requirePerm('records.read'); const t = String(q.q ?? '').toLowerCase(); const hex = t.replace(/[^0-9a-f]/g, '').toUpperCase(); const items = S.devices.filter((d) => !d.deletedAt && (!q.modelId || d.modelId === q.modelId) && (!q.clientId || (q.clientId === 'stock' ? !d.clientId : d.clientId === q.clientId)) && (q.condition ? d.condition === q.condition : (q.includeRetired ? true : !['baixado', 'vendido'].includes(d.condition))) && (!t || (hex && d.mac.includes(hex)) || (d.tag ?? '').toLowerCase().includes(t) || (d.ip ?? '').includes(t) || (d.location ?? '').toLowerCase().includes(t))).map((d) => shapeDevice(d));
      return paginate(ordenar(items, q, 'modelName', {
        mac: (d) => d.mac, tag: (d) => d.tag, modelName: (d) => d.modelName, clientName: (d) => d.clientName,
        currentModality: (d) => d.currentModality, condition: (d) => d.condition, ip: (d) => d.ip, location: (d) => d.location, valueCents: (d) => d.valueCents,
      }), q);
    },
    async device(idd) { await wait(); requirePerm('records.read'); const d = S.devices.find((x) => x.id === idd); if (!d) throw notFound('Aparelho'); return shapeDevice(d, true); },
    async createDevice(d) { await wait(); requirePerm('records.write'); const m = S.models.find((x) => x.id === d.modelId); if (!m) throw notFound('Modelo'); if (m.tracking !== 'serializado') throw bad('Este modelo é contado a granel; use "ajustar estoque"'); const mac = macLimpo(String(d.mac)); if (mac.length !== 12) throw new ApiError(400, 'Dados inválidos', [{ field: 'mac', message: 'MAC precisa ter 12 caracteres hexadecimais' }]); if (S.devices.some((x) => x.mac === mac)) throw bad(`Já existe um aparelho com o MAC ${macFormatado(mac)}`); const row: DeviceRow = { id: id(), modelId: m.id, mac, macSecondary: d.macSecondary ? macLimpo(String(d.macSecondary)) : null, tag: (d.tag as string) ?? null, clientId: null, currentModality: null, condition: String(d.condition ?? 'ativo'), valueCents: (d.valueCents as number) ?? null, ip: (d.ip as string) ?? null, location: (d.location as string) ?? null, note: (d.note as string) ?? null, deletedAt: null, createdAt: now() }; S.devices.push(row); audit('create', 'device', `Cadastrou o aparelho ${macFormatado(mac)}`, row.id); return shapeDevice(row, true); },
    async updateDevice(idd, d) { await wait(); requirePerm('records.write'); const x = S.devices.find((r) => r.id === idd); if (!x) throw notFound('Aparelho'); for (const k of ['tag', 'condition', 'valueCents', 'ip', 'location', 'note'] as const) if (d[k] !== undefined) (x as any)[k] = d[k]; if (d.mac) x.mac = macLimpo(String(d.mac)); audit('update', 'device', `Editou o aparelho ${macFormatado(x.mac)}`, x.id); return shapeDevice(x, true); },
    async removeDevice(idd) { await wait(); requirePerm('records.delete'); const x = S.devices.find((r) => r.id === idd); if (!x) throw notFound('Aparelho'); x.deletedAt = now(); audit('delete', 'device', `Mandou o aparelho ${macFormatado(x.mac)} para a lixeira`, x.id); return { ok: true }; },
    async stock(modelId) { await wait(); return S.bulk.filter((b) => b.quantity !== 0 && (!modelId || b.modelId === modelId)).map((b) => ({ ...b, modelName: S.models.find((m) => m.id === b.modelId)?.name ?? '?', clientName: S.clients.find((c) => c.id === b.clientId)?.tradeName ?? null })); },
    async adjustStock(d) { await wait(); requirePerm('records.write'); const m = S.models.find((x) => x.id === d.modelId); if (!m) throw notFound('Modelo'); if (m.tracking !== 'granel') throw bad('Este modelo é serializado; cadastre cada unidade pelo MAC'); let row = S.bulk.find((b) => b.modelId === d.modelId && !b.clientId); if (!row) { row = { id: id(), modelId: d.modelId, clientId: null, modality: 'estoque', quantity: 0 }; S.bulk.push(row); } if (row.quantity + d.delta < 0) throw bad(`Saldo insuficiente: tem ${row.quantity}`); row.quantity += d.delta; audit('stock_adjust', 'deviceModel', `${d.delta > 0 ? 'Entrada' : 'Baixa'} de ${Math.abs(d.delta)} no estoque a granel`, m.id); return demoApi.inventory.stock(d.modelId); },
    async movements(q) { await wait(); requirePerm('records.read'); const items = [...S.movements].filter((m) => (!q.modality || m.modality === q.modality) && (!q.clientId || m.fromClientId === q.clientId || m.toClientId === q.clientId) && (!q.from || m.createdAt >= String(q.from)) && (!q.to || m.createdAt <= String(q.to) + 'T23:59:59')).map(shapeMov);
      return paginate(ordenar(items, q, 'createdAt', {
        createdAt: (m) => m.createdAt, modality: (m) => m.modalityName, fromName: (m) => m.fromName, toName: (m) => m.toName, userName: (m) => m.userName,
      }, 'desc'), q);
    },
    async move(d) {
      await wait(250); requirePerm('devices.move');
      const modality = String(d.modality); const to = (d.toClientId as string | null) ?? null;
      if (modality === 'devolucao' && to) throw bad('Devolução vai sempre para o estoque (destino vazio)');
      if (modality !== 'devolucao' && !to) throw bad('Informe o cliente de destino');
      if (to && !hasEquip(to)) throw bad(`"${S.clients.find((c) => c.id === to)?.tradeName}" não assina o produto Equipamentos. Marque o produto na ficha do cliente antes de movimentar aparelhos.`);
      const items = d.items as Array<any>; if (!items?.length) throw bad('Adicione pelo menos um aparelho');
      let from: string | null | undefined; const out: MovRow['items'] = []; let qty = 0;
      // primeiro valida tudo, depois aplica (imita a transação do servidor)
      for (const it of items) {
        if (it.deviceId) { const dev = S.devices.find((x) => x.id === it.deviceId && !x.deletedAt); if (!dev) throw notFound('Aparelho'); if (dev.condition === 'vendido') throw bad(`O aparelho ${macFormatado(dev.mac)} já foi vendido`); if (modality === 'devolucao' && !dev.clientId) throw bad(`O aparelho ${macFormatado(dev.mac)} já está no estoque`); }
        else { const m = S.models.find((x) => x.id === it.modelId); if (!m) throw notFound('Modelo'); if (m.tracking !== 'granel') throw bad(`"${m.name}" é serializado: escolha os aparelhos pelo MAC`); const origin = it.fromClientId ?? null; const have = S.bulk.filter((b) => b.modelId === m.id && (b.clientId ?? null) === origin).reduce((a, b) => a + b.quantity, 0); if (have < it.quantity) throw bad(`Saldo insuficiente de "${m.name}" ${origin ? 'com o cliente' : 'no estoque'}: tem ${have}, pediu ${it.quantity}`); }
      }
      for (const it of items) {
        if (it.deviceId) { const dev = S.devices.find((x) => x.id === it.deviceId)!; if (from === undefined) from = dev.clientId; dev.clientId = to; dev.currentModality = to ? modality : null; dev.condition = (d.newCondition as string) ?? (modality === 'venda' ? 'vendido' : dev.condition); out.push({ modelId: dev.modelId, deviceId: dev.id, quantity: 1 }); qty++; }
        else { const origin = it.fromClientId ?? null; if (from === undefined) from = origin; let rem = it.quantity; for (const b of S.bulk.filter((b) => b.modelId === it.modelId && (b.clientId ?? null) === origin && b.quantity > 0)) { const take = Math.min(b.quantity, rem); b.quantity -= take; rem -= take; if (!rem) break; } const destMod = to ? modality : 'estoque'; let dest = S.bulk.find((b) => b.modelId === it.modelId && (b.clientId ?? null) === to && b.modality === destMod); if (!dest) { dest = { id: id(), modelId: it.modelId, clientId: to, modality: destMod, quantity: 0 }; S.bulk.push(dest); } dest.quantity += it.quantity; out.push({ modelId: it.modelId, deviceId: null, quantity: it.quantity }); qty += it.quantity; }
      }
      const mv: MovRow = { id: id(), modality, fromClientId: from ?? null, toClientId: to, newCondition: (d.newCondition as string) ?? null, valueCents: (d.valueCents as number) ?? null, note: (d.note as string) ?? null, userId: S.me!.id, createdAt: now(), items: out };
      S.movements.push(mv); audit('movement', 'deviceMovement', `${(MODALIDADES as any)[modality]} de ${qty} aparelho(s)${to ? ' para ' + S.clients.find((c) => c.id === to)?.tradeName : ' para o estoque'}`, mv.id);
      return { id: mv.id, items: out.length, quantity: qty };
    },
  },
  data: {
    async preview(d) { await wait(300); requirePerm('data.import'); const lines = d.csv.split(/\r?\n/).filter((l) => l.trim()); if (lines.length < 2) throw bad('O arquivo não tem linhas de dados'); const header = lines[0]!.split(d.delimiter === '\t' ? '\t' : d.delimiter).map((h) => h.trim().toLowerCase()); const rows = lines.slice(1).map((l, i) => { const cells = l.split(d.delimiter === '\t' ? '\t' : d.delimiter); const row: Record<string, string> = {}; header.forEach((h, j) => (row[h] = (cells[j] ?? '').trim())); const errors: string[] = []; let key = ''; let action: 'create' | 'update' | 'error' = 'create'; if (d.entity === 'clients') { const cnpj = cnpjLimpo(row.cnpj ?? ''); key = row.nome_fantasia || row.trade_name || cnpj; if (!cnpjValido(cnpj)) errors.push(`CNPJ inválido: ${row.cnpj || '(vazio)'}`); if (S.clients.some((c) => c.cnpj === cnpj)) action = 'update'; else if (!key) errors.push('Nome fantasia vazio'); } else if (d.entity === 'dids') { const n = didLimpo(row.numero || row.number || ''); key = n; if (n.length < 10) errors.push(`Número inválido: ${row.numero || row.number || '(vazio)'}`); if (row.circuito && !S.circuits.some((c) => c.code === row.circuito || c.name.toLowerCase() === row.circuito!.toLowerCase())) errors.push(`Circuito desconhecido: ${row.circuito}`); if (S.dids.some((x) => x.number === n)) action = 'update'; } else { key = row.nome || row.name || row.codigo || ''; if (!(row.codigo || row.code)) errors.push('Código do circuito vazio'); if (S.circuits.some((c) => c.code === (row.codigo || row.code))) action = 'update'; } return { line: i + 2, action: errors.length ? 'error' as const : action, key, errors }; }); const summary = { create: rows.filter((r) => r.action === 'create').length, update: rows.filter((r) => r.action === 'update').length, error: rows.filter((r) => r.action === 'error').length, skip: 0, total: rows.length }; return { entity: d.entity, rows, summary }; },
    async apply(d) { await wait(500); requirePerm('data.import'); const p = await demoApi.data.preview(d); if (p.summary.error) throw bad(`Há ${p.summary.error} linha(s) com erro. Corrija o arquivo e envie de novo — nada foi gravado.`); audit('import', d.entity, `Importou ${d.entity}: ${p.summary.create} criado(s), ${p.summary.update} atualizado(s) (demonstração: não aplicado)`); return { created: p.summary.create, updated: p.summary.update }; },
    exportUrl: (entity) => `data:text/csv;charset=utf-8,` + encodeURIComponent(entity === 'dids' ? 'numero;circuito;cliente\n' + S.dids.filter((x) => !x.deletedAt).slice(0, 50).map((x) => `${x.number};${S.circuits.find((c) => c.id === x.circuitId)?.code ?? ''};${S.clients.find((c) => c.id === x.clientId)?.cnpj ?? 'livre'}`).join('\n') : entity === 'circuits' ? 'nome;codigo;operadora;canais\n' + S.circuits.map((c) => `${c.name};${c.code};${S.carriers.find((x) => x.id === c.carrierId)?.name ?? ''};${c.channels}`).join('\n') : 'cnpj;nome_fantasia;razao_social;produtos\n' + S.clients.filter((c) => !c.isInternal && !c.deletedAt).map((c) => `${c.cnpj};${c.tradeName};${c.legalName};${activeSubs(c.id).map((s) => s.productCode).join('|')}`).join('\n')),
    async exportWithSecrets(entity, password) { await wait(400); requirePerm('data.export_secrets'); if (password !== S.me!.password) throw new ApiError(403, 'Senha incorreta'); audit('export_secrets', entity, `${S.me!.name} exportou ${entity} COM SENHAS (ZIP protegido)`); return { blob: new Blob(['(demonstração: aqui viria o ZIP protegido)'], { type: 'text/plain' }), zipPassword: 'demo-' + Math.random().toString(36).slice(2, 10), filename: `${entity}-com-senhas.zip` }; },
  },
  admin: {
    async users() { await wait(); requirePerm('admin.manage'); return S.users.map((u) => ({ id: u.id, name: u.name, email: u.email, active: u.active, roleId: u.roleId, roleName: S.roles.find((r) => r.id === u.roleId)?.name ?? '?', lastLoginAt: u.lastLoginAt })); },
    async createUser(d) { await wait(); requirePerm('admin.manage'); if (S.users.some((u) => u.email === String(d.email).toLowerCase())) throw bad('Já existe um usuário com este e-mail'); const u: UserRow = { id: id(), name: String(d.name), email: String(d.email).toLowerCase(), password: String(d.password), roleId: String(d.roleId), active: d.active !== false, lastLoginAt: null }; S.users.push(u); audit('create', 'user', `Criou o usuário ${u.name} (${u.email})`, u.id); return (await demoApi.admin.users()).find((x) => x.id === u.id)!; },
    async updateUser(idu, d) { await wait(); requirePerm('admin.manage'); const u = S.users.find((x) => x.id === idu); if (!u) throw notFound('Usuário'); if ((d.active === false || (d.roleId && d.roleId !== u.roleId)) && u.roleId === 'radministrador' && !S.users.some((o) => o.id !== idu && o.roleId === 'radministrador' && o.active)) throw bad('Este é o único administrador ativo. Crie outro antes de rebaixar ou desativar.'); for (const k of ['name', 'email', 'roleId', 'active'] as const) if (d[k] !== undefined) (u as any)[k] = d[k]; if (d.password) u.password = String(d.password); audit('update', 'user', `Editou o usuário ${u.name}`, u.id); return (await demoApi.admin.users()).find((x) => x.id === u.id)!; },
    async roles() { await wait(); requirePerm('admin.manage'); return S.roles.map((r) => ({ ...r, userCount: S.users.filter((u) => u.roleId === r.id).length })); },
    async permissions() { await wait(30); return ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key] })); },
    async createRole(d) { await wait(); requirePerm('admin.manage'); const r: RoleRow = { id: id(), key: null, name: String(d.name), description: (d.description as string) ?? null, permissions: (d.permissions as string[]) ?? [], isSystem: false }; S.roles.push(r); audit('create', 'role', `Criou o papel ${r.name}`, r.id); return { ...r, userCount: 0 }; },
    async updateRole(idr, d) { await wait(); requirePerm('admin.manage'); const r = S.roles.find((x) => x.id === idr); if (!r) throw notFound('Papel'); if (r.key === 'administrador' && d.permissions && (d.permissions as string[]).length !== ALL_PERMISSIONS.length) throw bad('O papel Administrador sempre tem todas as permissões'); if (d.name && !r.isSystem) r.name = String(d.name); if (d.description !== undefined) r.description = d.description as string; if (d.permissions) r.permissions = d.permissions as string[]; audit('update', 'role', `Editou o papel ${r.name}`, r.id); return { ...r, userCount: S.users.filter((u) => u.roleId === r.id).length }; },
    async removeRole(idr) { await wait(); requirePerm('admin.manage'); const r = S.roles.find((x) => x.id === idr); if (!r) throw notFound('Papel'); if (r.isSystem) throw bad('Papéis do sistema não podem ser apagados'); if (S.users.some((u) => u.roleId === idr)) throw bad('Há usuários com este papel. Mude o papel deles antes.'); S.roles = S.roles.filter((x) => x.id !== idr); return { ok: true }; },
    async catalog(type) { await wait(40); return (type === 'carriers' ? S.carriers : type === 'hostings' ? S.hostings : S.categories).slice().sort((a, b) => a.name.localeCompare(b.name)); },
    async createCatalogItem(type, name) { await wait(); requirePerm('admin.manage'); const list = type === 'carriers' ? S.carriers : type === 'hostings' ? S.hostings : S.categories; if (list.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw bad('Já existe um item com esse nome'); const it = { id: id(), name, active: true }; list.push(it); audit('create', `catalog:${type}`, `Adicionou "${name}" ao catálogo ${type}`, it.id); return it; },
    async updateCatalogItem(type, idi, d) { await wait(); requirePerm('admin.manage'); const list = type === 'carriers' ? S.carriers : type === 'hostings' ? S.hostings : S.categories; const it = list.find((x) => x.id === idi); if (!it) throw notFound('Item'); if (d.name !== undefined) it.name = String(d.name); if (d.active !== undefined) it.active = Boolean(d.active); return it; },
    async products() { await wait(40); return S.products.map(shapeProduct); },
    async updateProduct(idp, d) { await wait(); requirePerm('admin.manage'); const p = S.products.find((x) => x.id === idp); if (!p) throw notFound('Produto'); for (const k of ['name', 'color', 'description', 'active', 'sortOrder'] as const) if (d[k] !== undefined) (p as any)[k] = d[k]; return shapeProduct(p); },
    async upsertModule(idp, d) { await wait(); requirePerm('admin.manage'); const p = S.products.find((x) => x.id === idp); if (!p) throw notFound('Produto'); const code = String(d.code); if (!/^[a-z0-9_]+$/.test(code)) throw new ApiError(400, 'Dados inválidos', [{ field: 'code', message: 'Use só letras minúsculas, números e _' }]); let m = S.modules.find((x) => x.productId === p.id && x.code === code); if (!m) { m = { id: id(), productId: p.id, code, name: String(d.name), description: (d.description as string) ?? null, hasSettings: false, sortOrder: 99, active: true }; S.modules.push(m); audit('create', 'product_module', `Criou o módulo ${m.name} em ${p.name}`, m.id); } else { for (const k of ['name', 'description', 'active', 'sortOrder'] as const) if (d[k] !== undefined) (m as any)[k] = d[k]; audit('update', 'product_module', `Editou o módulo ${m.name} em ${p.name}`, m.id); } const { productId: _p, ...out } = m; return out; },
    async audit(q) {
      await wait(); requirePerm('audit.read');
      const items = S.audit.filter((a) => (!q.action || a.action === q.action) && (!q.entityType || a.entityType === q.entityType) && (!q.userId || a.userId === q.userId));
      return paginate(ordenar(items, q, 'createdAt', {
        createdAt: (a) => a.createdAt, action: (a) => a.action, entityType: (a) => a.entityType, summary: (a) => a.summary, userName: (a) => a.userName,
      }, 'desc'), q);
    },
    async trash() { await wait(); requirePerm('records.delete'); return [...S.clients.filter((c) => c.deletedAt).map((c) => ({ type: 'client', id: c.id, label: c.tradeName, deletedAt: c.deletedAt! })), ...S.circuits.filter((c) => c.deletedAt).map((c) => ({ type: 'circuit', id: c.id, label: c.name, deletedAt: c.deletedAt! })), ...S.dids.filter((c) => c.deletedAt).map((c) => ({ type: 'did', id: c.id, label: didFormatado(c.number), deletedAt: c.deletedAt! })), ...S.devices.filter((c) => c.deletedAt).map((c) => ({ type: 'device', id: c.id, label: macFormatado(c.mac), deletedAt: c.deletedAt! }))].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)); },
    async restore(type, idr) { await wait(); requirePerm('records.delete'); const list: any[] = type === 'client' ? S.clients : type === 'circuit' ? S.circuits : type === 'did' ? S.dids : S.devices; const it = list.find((x) => x.id === idr); if (!it) throw notFound(); it.deletedAt = null; audit('restore', type, `Restaurou ${it.tradeName ?? it.name ?? it.number ?? it.mac} da lixeira`, idr); return { ok: true }; },
  },
};
