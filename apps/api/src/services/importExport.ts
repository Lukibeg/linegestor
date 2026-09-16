/**
 * Importar e exportar CSV.
 *
 * Importação em dois passos: PRÉ-VISUALIZAR (mostra o que vai acontecer com cada linha: criar, atualizar, erro)
 * e APLICAR (grava tudo numa transação, ou nada). A mesma função `plan()` decide as duas coisas, então o que
 * a pessoa viu na prévia é exatamente o que será feito.
 *
 * Cabeçalhos aceitos em português ou inglês (ex.: "nome_fantasia" ou "trade_name"). Acentos e maiúsculas não importam.
 * Senhas: coluna vazia mantém a senha atual. Na exportação, senhas só saem com a opção "com senhas" (permissão própria,
 * arquivo ZIP protegido) — decisão V5 / S6.
 */
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import archiver from 'archiver';
import { randomBytes } from 'node:crypto';
import { carriers, circuits, clients, dids, hostingProviders, linepbxSettings, newId, productModules, products, subscriptionModules, subscriptions, type Db } from '@gestor/db';
import { cnpjLimpo, cnpjValido, didLimpo, didValido, paraCentavos } from '@gestor/shared';
import { BadRequest } from '../plugins/errors.js';
import type { SecretsVault } from './secrets.js';
import * as clientsSvc from './clients.js';

export type Entity = 'clients' | 'circuits' | 'dids';

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[\s-]+/g, '_');

const ALIASES: Record<Entity, Record<string, string[]>> = {
  clients: {
    id: ['id'], cnpj: ['cnpj'], tradeName: ['nome_fantasia', 'trade_name', 'nome', 'fantasia'], legalName: ['razao_social', 'legal_name', 'razao'],
    archived: ['arquivado', 'archived', 'oculto', 'is_occult'], products: ['produtos', 'products'], modules: ['modulos', 'modules'], notes: ['observacoes', 'notes', 'anotacoes'],
    domain: ['dominio', 'domain', 'endereco'], serverIp: ['ip_servidor', 'server_ip', 'ip'], sshUser: ['usuario_ssh', 'ssh_user'], sshPort: ['porta_ssh', 'ssh_port'],
    sshPassword: ['senha_ssh', 'ssh_password'], hosting: ['hospedagem', 'hosting', 'pbx_hosting'],
  },
  circuits: {
    id: ['id'], name: ['nome', 'name'], code: ['n_circuito', 'numero_circuito', 'codigo', 'code', 'circuito', 'circuit'], carrier: ['operadora', 'carrier'], channels: ['canais', 'channels'],
    signalingIp: ['ip', 'signaling_ip', 'ip_operadora'], authIp: ['ip_pbx', 'auth_ip', 'ip_autenticacao'], authUsername: ['usuario_auth', 'auth_username', 'usuario'],
    authPassword: ['senha_auth', 'auth_password', 'senha'], monthlyValue: ['valor', 'monthly_value', 'valor_mensal'], owner: ['titular', 'dono', 'owner', 'proprietario'], notes: ['observacoes', 'notes'],
    keyNumber: ['numero_chave', 'num_chave', 'key_number', 'numero_piloto'],
  },
  dids: {
    number: ['numero', 'number', 'did', 'linha'], circuit: ['circuito', 'circuit', 'circuit_code', 'codigo_circuito'], client: ['cliente', 'client', 'locacao', 'cnpj_cliente', 'client_cnpj'],
    owner: ['titular', 'dono', 'owner', 'proprietario'], note: ['observacao', 'note', 'obs'],
  },
};

function readRows(csv: string, delimiter: string): Record<string, string>[] {
  try {
    return parse(csv, { delimiter, columns: (h: string[]) => h.map(norm), bom: true, trim: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
  } catch (e: any) {
    throw new BadRequest(`Não consegui ler o CSV: ${e.message}. Confira o separador.`);
  }
}

function pick(row: Record<string, string>, entity: Entity, field: string): string | undefined {
  for (const a of ALIASES[entity][field] ?? []) if (row[a] !== undefined && row[a] !== '') return row[a];
  return undefined;
}

/**
 * Datas de ativação por produto/módulo, em colunas próprias: `ativacao_linepbx`, `ativacao_voicenet`,
 * `ativacao_linepbx:fop2`. É assim que a linha do tempo da implantação vem do Nexus.
 * Aceita 31/12/2025 e 2025-12-31.
 */
function dataBr(v: string): Date | null {
  const t = v.trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) { const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])); return isNaN(+d) || d.getMonth() !== Number(m[2]) - 1 ? null : d; }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) { const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return isNaN(+d) || d.getMonth() !== Number(m[2]) - 1 ? null : d; }
  return null;
}

function datasDeAtivacao(row: Record<string, string>): { datas: Record<string, Date>; invalidas: string[]; codigos: string[] } {
  const datas: Record<string, Date> = {}, invalidas: string[] = [], codigos: string[] = [];
  for (const [k, v] of Object.entries(row)) {
    const m = /^(?:ativacao|ativado_em|activation)_(.+)$/.exec(k);
    if (!m || !v || !v.trim()) continue;
    const codigo = m[1]!;
    codigos.push(codigo);
    const d = dataBr(v);
    if (d) datas[codigo] = d; else invalidas.push(`${k} ("${v}")`);
  }
  return { datas, invalidas, codigos };
}

export type PlanRow = { line: number; action: 'create' | 'update' | 'error' | 'skip'; key: string; errors: string[]; data: Record<string, unknown> };
export type Plan = { entity: Entity; rows: PlanRow[]; summary: { create: number; update: number; error: number; skip: number; total: number } };

function summarize(entity: Entity, rows: PlanRow[]): Plan {
  const s = { create: 0, update: 0, error: 0, skip: 0, total: rows.length };
  for (const r of rows) s[r.action]++;
  return { entity, rows, summary: s };
}

// ---------- planejamento ----------

export async function plan(db: Db, entity: Entity, csv: string, delimiter: string): Promise<Plan> {
  const raw = readRows(csv, delimiter);
  if (!raw.length) throw new BadRequest('O arquivo não tem linhas de dados');
  if (entity === 'clients') return planClients(db, raw);
  if (entity === 'circuits') return planCircuits(db, raw);
  return planDids(db, raw);
}

async function planClients(db: Db, raw: Record<string, string>[]): Promise<Plan> {
  const existing = await db.select({ id: clients.id, cnpj: clients.cnpj, tradeName: clients.tradeName }).from(clients).where(isNull(clients.deletedAt));
  const byId = new Map(existing.map((c) => [c.id, c])), byCnpj = new Map(existing.map((c) => [c.cnpj, c]));
  // CNPJ é único no banco INCLUSIVE na lixeira: sem este aviso a gravação estouraria com erro de chave
  const naLixeira = new Map((await db.select({ cnpj: clients.cnpj, tradeName: clients.tradeName }).from(clients).where(isNotNull(clients.deletedAt))).map((c) => [c.cnpj, c.tradeName]));
  const hostings = (await db.select({ name: hostingProviders.name }).from(hostingProviders)).map((h) => h.name);
  const hostingByNorm = new Map(hostings.map((n) => [norm(n), n]));
  const prodCodes = new Set((await db.select({ code: products.code }).from(products)).map((p) => p.code));
  const modPairs = new Set((await db.select({ p: products.code, m: productModules.code }).from(productModules).innerJoin(products, eq(products.id, productModules.productId))).map((x) => `${x.p}:${x.m}`));
  // Compatibilidade com o Nexus: lá FOP2 e Omniboard eram "produtos"; aqui são módulos do LinePBX
  const LEGADO: Record<string, string> = { fop2: 'linepbx:fop2', omniboard: 'linepbx:omniboard' };
  const seen = new Set<string>();
  const rows: PlanRow[] = raw.map((r, i) => {
    const line = i + 2;
    const errors: string[] = [];
    const id = pick(r, 'clients', 'id');
    const cnpj = cnpjLimpo(pick(r, 'clients', 'cnpj') ?? '');
    const tradeName = pick(r, 'clients', 'tradeName');
    const legalName = pick(r, 'clients', 'legalName');
    if (!cnpj) errors.push('CNPJ vazio');
    else if (!cnpjValido(cnpj)) errors.push(`CNPJ inválido: ${cnpj}`);
    if (seen.has(cnpj)) errors.push('CNPJ repetido no arquivo');
    seen.add(cnpj);
    const target = id ? byId.get(id) : byCnpj.get(cnpj);
    if (id && !byId.get(id)) errors.push(`id "${id}" não existe`);
    if (!target && naLixeira.has(cnpj)) errors.push(`Este CNPJ já existe na lixeira ("${naLixeira.get(cnpj)}"). Restaure o cliente em Administração → Lixeira e importe de novo`);
    if (!target && !tradeName) errors.push('Nome fantasia vazio (obrigatório para criar)');
    if (!target && !legalName) errors.push('Razão social vazia (obrigatória para criar)');
    const rawProds = (pick(r, 'clients', 'products') ?? '').split(/[|,]/).map((p) => norm(p)).filter(Boolean);
    const modList = (pick(r, 'clients', 'modules') ?? '').split(/[|,]/).map((p) => norm(p)).filter(Boolean);
    // na coluna "produtos" também aceitamos "produto:modulo" (ex.: linechat:nps) e os nomes legados do Nexus
    for (const p of rawProds) { if (LEGADO[p]) modList.push(LEGADO[p]!); else if (p.includes(':')) modList.push(p); }
    const prodList = [...new Set(rawProds.filter((p) => !LEGADO[p] && !p.includes(':')))];
    for (const m of modList) { const prodOfMod = m.split(':')[0]!; if (!prodList.includes(prodOfMod)) prodList.push(prodOfMod); }
    const badProd = prodList.filter((p) => !prodCodes.has(p));
    if (badProd.length) errors.push(`Produtos desconhecidos: ${badProd.join(', ')}`);
    const badMod = modList.filter((m) => !modPairs.has(m));
    if (badMod.length) errors.push(`Módulos desconhecidos: ${badMod.join(', ')} (formato produto:modulo, ex.: linepbx:fop2)`);
    const hostingRaw = pick(r, 'clients', 'hosting');
    const hosting = hostingRaw ? hostingByNorm.get(norm(hostingRaw)) : undefined;
    if (hostingRaw && !hosting) errors.push(`Hospedagem desconhecida: ${hostingRaw} (cadastre em Administração → Catálogos, ou use uma destas: ${hostings.join(', ')})`);
    const { datas, invalidas, codigos } = datasDeAtivacao(r);
    if (invalidas.length) errors.push(`Data de ativação inválida em ${invalidas.join(', ')} — use 31/12/2025 ou 2025-12-31`);
    const semMarca = codigos.filter((c) => !prodList.includes(c) && !modList.includes(c));
    if (semMarca.length) errors.push(`Data de ativação de ${semMarca.join(', ')}, mas o produto/módulo não está nas colunas produtos/modulos`);
    const archivedRaw = pick(r, 'clients', 'archived');
    const data = {
      targetId: target?.id, cnpj, tradeName, legalName, notes: pick(r, 'clients', 'notes'),
      archived: archivedRaw === undefined ? undefined : /^(1|sim|true|s|yes)$/i.test(archivedRaw),
      products: prodList, modules: [...new Set(modList)], domain: pick(r, 'clients', 'domain'), serverIp: pick(r, 'clients', 'serverIp'), sshUser: pick(r, 'clients', 'sshUser'),
      sshPort: pick(r, 'clients', 'sshPort'), sshPassword: pick(r, 'clients', 'sshPassword'), hosting,
      datas,
    };
    return { line, action: errors.length ? 'error' : target ? 'update' : 'create', key: tradeName ?? target?.tradeName ?? cnpj, errors, data };
  });
  return summarize('clients', rows);
}

async function planCircuits(db: Db, raw: Record<string, string>[]): Promise<Plan> {
  const existing = await db.select({ id: circuits.id, code: circuits.code, carrierId: circuits.carrierId, name: circuits.name }).from(circuits).where(isNull(circuits.deletedAt));
  const carrierRows = await db.select().from(carriers);
  const carrierByName = new Map(carrierRows.map((c) => [norm(c.name), c]));
  const owners = await db.select({ id: clients.id, name: clients.tradeName, code: clients.internalCode, cnpj: clients.cnpj }).from(clients).where(isNull(clients.deletedAt));
  const rows: PlanRow[] = raw.map((r, i) => {
    const errors: string[] = [];
    const id = pick(r, 'circuits', 'id');
    const name = pick(r, 'circuits', 'name'), code = pick(r, 'circuits', 'code');
    const carrierName = pick(r, 'circuits', 'carrier');
    const carrier = carrierName ? carrierByName.get(norm(carrierName)) : undefined;
    if (carrierName && !carrier) errors.push(`Operadora desconhecida: ${carrierName} (cadastre em Administração → Catálogos)`);
    if (!code) errors.push('Código do circuito vazio');
    const target = id ? existing.find((e) => e.id === id) : existing.find((e) => e.code === code && (e.carrierId ?? null) === (carrier?.id ?? null));
    if (id && !target) errors.push(`id "${id}" não existe`);
    if (!target && !name) errors.push('Nome vazio (obrigatório para criar)');
    const channelsRaw = pick(r, 'circuits', 'channels');
    const channels = channelsRaw === undefined ? undefined : Number(channelsRaw);
    if (channels !== undefined && (!Number.isInteger(channels) || channels < 0)) errors.push(`Canais inválido: ${channelsRaw}`);
    const ownerRaw = pick(r, 'circuits', 'owner');
    const owner = ownerRaw ? owners.find((o) => norm(o.name) === norm(ownerRaw) || o.code === norm(ownerRaw) || o.cnpj === cnpjLimpo(ownerRaw)) : undefined;
    if (ownerRaw && !owner) errors.push(`Titular desconhecido: ${ownerRaw}`);
    const valueRaw = pick(r, 'circuits', 'monthlyValue');
    const data = {
      targetId: target?.id, name, code, carrierId: carrier?.id, channels, signalingIp: pick(r, 'circuits', 'signalingIp'), authIp: pick(r, 'circuits', 'authIp'),
      authUsername: pick(r, 'circuits', 'authUsername'), authPassword: pick(r, 'circuits', 'authPassword'), monthlyValueCents: valueRaw ? paraCentavos(valueRaw) : undefined,
      keyNumber: pick(r, 'circuits', 'keyNumber'),
      ownerClientId: owner?.id, notes: pick(r, 'circuits', 'notes'),
    };
    return { line: i + 2, action: errors.length ? 'error' : target ? 'update' : 'create', key: name ?? target?.name ?? code ?? '?', errors, data };
  });
  return summarize('circuits', rows);
}

async function planDids(db: Db, raw: Record<string, string>[]): Promise<Plan> {
  const existing = new Map((await db.select({ id: dids.id, number: dids.number }).from(dids).where(isNull(dids.deletedAt))).map((d) => [d.number, d.id]));
  const circ = await db.select({ id: circuits.id, code: circuits.code, name: circuits.name }).from(circuits).where(isNull(circuits.deletedAt));
  const cls = await db.select({ id: clients.id, name: clients.tradeName, cnpj: clients.cnpj, code: clients.internalCode }).from(clients).where(isNull(clients.deletedAt));
  const findClient = (v: string) => cls.find((c) => c.cnpj === cnpjLimpo(v) && cnpjLimpo(v).length === 14) ?? cls.find((c) => norm(c.name) === norm(v) || c.code === norm(v));
  const seen = new Set<string>();
  const rows: PlanRow[] = raw.map((r, i) => {
    const errors: string[] = [];
    const number = didLimpo(pick(r, 'dids', 'number') ?? '');
    if (!number || !didValido(number)) errors.push(`Número inválido: ${pick(r, 'dids', 'number') ?? '(vazio)'}`);
    if (seen.has(number)) errors.push('Número repetido no arquivo');
    seen.add(number);
    const circuitRaw = pick(r, 'dids', 'circuit');
    const circuit = circuitRaw ? circ.find((c) => c.code === circuitRaw.trim() || norm(c.name) === norm(circuitRaw)) : undefined;
    if (circuitRaw && !circuit) errors.push(`Circuito desconhecido: ${circuitRaw}`);
    const clientRaw = pick(r, 'dids', 'client');
    const isFree = !clientRaw || /^(livre|free|-)$/i.test(clientRaw);
    const client = !isFree ? findClient(clientRaw!) : undefined;
    if (!isFree && !client) errors.push(`Cliente desconhecido: ${clientRaw}`);
    const ownerRaw = pick(r, 'dids', 'owner');
    const owner = ownerRaw ? findClient(ownerRaw) : undefined;
    if (ownerRaw && !owner) errors.push(`Titular desconhecido: ${ownerRaw}`);
    const targetId = existing.get(number);
    const data = { targetId, number, circuitId: circuitRaw === undefined ? undefined : circuit?.id ?? null, clientId: clientRaw === undefined ? undefined : client?.id ?? null, ownerClientId: owner?.id, note: pick(r, 'dids', 'note') };
    return { line: i + 2, action: errors.length ? 'error' : targetId ? 'update' : 'create', key: number, errors, data };
  });
  return summarize('dids', rows);
}

// ---------- aplicação ----------

export async function apply(db: Db, vault: SecretsVault, p: Plan, userId: string) {
  if (p.summary.error > 0) throw new BadRequest(`Há ${p.summary.error} linha(s) com erro. Corrija o arquivo e envie de novo — nada foi gravado.`);
  return db.transaction(async (tx) => {
    let created = 0, updated = 0;
    if (p.entity === 'clients') {
      const hostings = await tx.select().from(hostingProviders);
      for (const r of p.rows) {
        const d = r.data as any;
        let id = d.targetId as string | undefined;
        const criando = !id;
        if (id) {
          const set: Record<string, unknown> = { updatedAt: new Date() };
          if (d.tradeName) set.tradeName = d.tradeName;
          if (d.legalName) set.legalName = d.legalName;
          if (d.notes !== undefined) set.notes = d.notes;
          if (d.archived !== undefined) set.archived = d.archived;
          await tx.update(clients).set(set).where(eq(clients.id, id));
          updated++;
        } else {
          id = newId();
          await tx.insert(clients).values({ id, cnpj: d.cnpj, tradeName: d.tradeName, legalName: d.legalName, notes: d.notes ?? null, archived: d.archived ?? false });
          created++;
        }
        const datas = (d.datas ?? {}) as Record<string, Date>;
        // Cliente novo sem data no arquivo: fica SEM data (o Nexus nem sempre tinha), em vez de
        // carimbar o dia da importação. Cliente que já existia mantém a data que já estava lá.
        const semData = criando ? null : undefined;
        for (const code of d.products as string[]) {
          const settings: Record<string, unknown> = {};
          if (code === 'linepbx') {
            const h = d.hosting ? hostings.find((x) => norm(x.name) === norm(d.hosting)) : undefined;
            Object.assign(settings, { hostingId: h?.id, domain: d.domain, serverIp: d.serverIp, sshUser: d.sshUser, sshPort: d.sshPort ? Number(d.sshPort) : undefined, sshPassword: d.sshPassword || undefined });
          }
          await clientsSvc.upsertSubscription(tx, vault, id, { productCode: code, settings, activatedAt: datas[code] ?? semData }, userId);
        }
        for (const pm of (d.modules ?? []) as string[]) {
          const [productCode, moduleCode] = pm.split(':') as [string, string];
          await clientsSvc.upsertModule(tx, vault, id, { productCode, moduleCode, activatedAt: datas[pm] ?? semData }, userId);
        }
      }
    } else if (p.entity === 'circuits') {
      for (const r of p.rows) {
        const d = r.data as any;
        const secret = async (existingId: string | null | undefined) => (d.authPassword ? vault.save(tx, { existingId, label: `Senha do tronco — ${d.name ?? d.code}`, plain: d.authPassword, userId }) : existingId ?? null);
        if (d.targetId) {
          const [cur] = await tx.select().from(circuits).where(eq(circuits.id, d.targetId));
          const set: Record<string, unknown> = { updatedAt: new Date(), authPasswordSecretId: await secret(cur?.authPasswordSecretId) };
          for (const k of ['name', 'carrierId', 'channels', 'signalingIp', 'authIp', 'authUsername', 'monthlyValueCents', 'ownerClientId', 'notes', 'keyNumber']) if (d[k] !== undefined) set[k] = d[k];
          await tx.update(circuits).set(set).where(eq(circuits.id, d.targetId));
          updated++;
        } else {
          await tx.insert(circuits).values({ id: newId(), name: d.name, code: d.code, keyNumber: d.keyNumber ?? null, carrierId: d.carrierId ?? null, channels: d.channels ?? 0, signalingIp: d.signalingIp ?? null, authIp: d.authIp ?? null, authUsername: d.authUsername ?? null, monthlyValueCents: d.monthlyValueCents ?? null, ownerClientId: d.ownerClientId ?? null, notes: d.notes ?? null, authPasswordSecretId: await secret(null) });
          created++;
        }
      }
    } else {
      const inserts: (typeof dids.$inferInsert)[] = [];
      for (const r of p.rows) {
        const d = r.data as any;
        if (d.targetId) {
          const set: Record<string, unknown> = { updatedAt: new Date() };
          if (d.circuitId !== undefined) set.circuitId = d.circuitId;
          if (d.clientId !== undefined) set.clientId = d.clientId;
          if (d.ownerClientId !== undefined) set.ownerClientId = d.ownerClientId;
          if (d.note !== undefined) set.note = d.note;
          await tx.update(dids).set(set).where(eq(dids.id, d.targetId));
          updated++;
        } else {
          inserts.push({ id: newId(), number: d.number, circuitId: d.circuitId ?? null, clientId: d.clientId ?? null, ownerClientId: d.ownerClientId ?? null, note: d.note ?? null });
          created++;
        }
      }
      for (let i = 0; i < inserts.length; i += 500) await tx.insert(dids).values(inserts.slice(i, i + 500));
    }
    return { created, updated };
  });
}

// ---------- exportação ----------

const BOM = '\uFEFF';

export async function exportCsv(db: Db, vault: SecretsVault, entity: Entity, withSecrets: boolean): Promise<{ filename: string; csv: string }> {
  const stamp = new Date().toISOString().slice(0, 10);
  if (entity === 'clients') {
    const rows = await db.select().from(clients).where(and(isNull(clients.deletedAt), eq(clients.isInternal, false))).orderBy(clients.tradeName);
    const subs = await db.select({ clientId: subscriptions.clientId, code: products.code, subId: subscriptions.id }).from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId)).where(isNull(subscriptions.deactivatedAt));
    const mods = await db.select({ subId: subscriptionModules.subscriptionId, p: products.code, m: productModules.code }).from(subscriptionModules)
      .innerJoin(productModules, eq(productModules.id, subscriptionModules.moduleId)).innerJoin(subscriptions, eq(subscriptions.id, subscriptionModules.subscriptionId)).innerJoin(products, eq(products.id, subscriptions.productId))
      .where(isNull(subscriptionModules.deactivatedAt));
    const lps = await db.select({ s: linepbxSettings, hostingName: hostingProviders.name }).from(linepbxSettings).leftJoin(hostingProviders, eq(hostingProviders.id, linepbxSettings.hostingId));
    const out = [];
    for (const c of rows) {
      const mine = subs.filter((s) => s.clientId === c.id);
      const myMods = mods.filter((m) => mine.some((s) => s.subId === m.subId)).map((m) => `${m.p}:${m.m}`);
      const lpSub = mine.find((s) => s.code === 'linepbx');
      const lp = lpSub ? lps.find((l) => l.s.subscriptionId === lpSub.subId) : undefined;
      out.push({
        id: c.id, cnpj: c.cnpj, nome_fantasia: c.tradeName, razao_social: c.legalName, arquivado: c.archived ? 'sim' : 'nao', produtos: mine.map((s) => s.code).join('|'), modulos: myMods.join('|'),
        hospedagem: lp?.hostingName ?? '', dominio: lp?.s.domain ?? '', ip_servidor: lp?.s.serverIp ?? '', usuario_ssh: lp?.s.sshUser ?? '', porta_ssh: lp?.s.sshPort ?? '',
        ...(withSecrets ? { senha_ssh: lp?.s.sshPasswordSecretId ? (await vault.read(db, lp.s.sshPasswordSecretId))?.value ?? '' : '' } : {}),
        observacoes: c.notes ?? '',
      });
    }
    return { filename: `clientes-${stamp}.csv`, csv: BOM + stringify(out, { header: true, delimiter: ';' }) };
  }
  if (entity === 'circuits') {
    const rows = await db.select({ c: circuits, carrierName: carriers.name, ownerName: clients.tradeName }).from(circuits).leftJoin(carriers, eq(carriers.id, circuits.carrierId)).leftJoin(clients, eq(clients.id, circuits.ownerClientId)).where(isNull(circuits.deletedAt)).orderBy(circuits.name);
    const out = [];
    for (const r of rows) {
      out.push({
        id: r.c.id, nome: r.c.name, n_circuito: r.c.code, numero_chave: r.c.keyNumber ?? '', operadora: r.carrierName ?? '', canais: r.c.channels, ip: r.c.signalingIp ?? '', ip_pbx: r.c.authIp ?? '', usuario_auth: r.c.authUsername ?? '',
        ...(withSecrets ? { senha_auth: r.c.authPasswordSecretId ? (await vault.read(db, r.c.authPasswordSecretId))?.value ?? '' : '' } : {}),
        valor: r.c.monthlyValueCents != null ? (r.c.monthlyValueCents / 100).toFixed(2).replace('.', ',') : '', titular: r.ownerName ?? '', observacoes: r.c.notes ?? '',
      });
    }
    return { filename: `circuitos-${stamp}.csv`, csv: BOM + stringify(out, { header: true, delimiter: ';' }) };
  }
  const rows = await db
    .select({ number: dids.number, circuitCode: circuits.code, circuitName: circuits.name, clientCnpj: clients.cnpj, clientName: clients.tradeName, ownerId: dids.ownerClientId, note: dids.note })
    .from(dids).leftJoin(circuits, eq(circuits.id, dids.circuitId)).leftJoin(clients, eq(clients.id, dids.clientId)).where(isNull(dids.deletedAt)).orderBy(dids.number);
  const owners = new Map((await db.select({ id: clients.id, name: clients.tradeName }).from(clients)).map((o) => [o.id, o.name]));
  const out = rows.map((r) => ({ numero: r.number, circuito: r.circuitCode ?? '', circuito_nome: r.circuitName ?? '', cliente: r.clientCnpj ?? '', cliente_nome: r.clientName ?? 'livre', titular: r.ownerId ? owners.get(r.ownerId) ?? '' : '', observacao: r.note ?? '' }));
  return { filename: `dids-${stamp}.csv`, csv: BOM + stringify(out, { header: true, delimiter: ';' }) };
}

/** Empacota um CSV num ZIP protegido por senha (AES-256). Devolve o arquivo e a senha gerada. */
export async function zipWithPassword(filename: string, content: string): Promise<{ zip: Buffer; password: string }> {
  const password = randomBytes(12).toString('base64url');
  const zipEncrypted = (await import('archiver-zip-encrypted')).default;
  try { archiver.registerFormat('zip-encrypted', zipEncrypted); } catch { /* já registrado */ }
  const archive = archiver.create('zip-encrypted' as any, { zlib: { level: 8 }, encryptionMethod: 'aes256', password } as any);
  const chunks: Buffer[] = [];
  archive.on('data', (c: Buffer) => chunks.push(c));
  archive.append(content, { name: filename });
  await archive.finalize();
  return { zip: Buffer.concat(chunks), password };
}
