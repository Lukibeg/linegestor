/**
 * Carga inicial do banco ("seed").
 *
 * Idempotente: pode rodar quantas vezes quiser — o que já existe não é duplicado.
 * Cria: os 8 produtos, operadoras, hospedagens, categorias, os 4 papéis, as organizações
 * internas (Ingline Systems e VoiceNet) e o primeiro administrador.
 *
 * Com `--demo`, cria também clientes, circuitos, DIDs e aparelhos FICTÍCIOS para testar a interface.
 *
 * Variáveis opcionais: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */
import 'dotenv/config';
import argon2 from 'argon2';
import { eq, sql } from 'drizzle-orm';
import {
  CATEGORIAS_APARELHO_INICIAIS, DEFAULT_ROLES, HOSPEDAGENS_INICIAIS, OPERADORAS_INICIAIS, ORGANIZACOES_INTERNAS, PRODUTOS_INICIAIS,
  gerarFaixaDids,
} from '@gestor/shared';
import { createDb } from './index.js';
import { newId } from './id.js';
import * as s from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida.');
  process.exit(1);
}
const demo = process.argv.includes('--demo');
const { db, pool } = createDb(url);

type CatalogTable = typeof s.carriers | typeof s.hostingProviders | typeof s.deviceCategories;
async function upsertByName(table: CatalogTable, name: string): Promise<{ id: string }> {
  const rows = (await db.select({ id: table.id }).from(table).where(eq(table.name, name)).limit(1)) as Array<{ id: string }>;
  if (rows[0]) return rows[0];
  const created = (await db.insert(table).values({ id: newId(), name }).returning({ id: table.id })) as Array<{ id: string }>;
  return created[0]!;
}

// ---- catálogos ----
for (const [i, p] of PRODUTOS_INICIAIS.entries()) {
  await db
    .insert(s.products)
    .values({ id: newId(), code: p.code, name: p.name, color: p.color, description: p.description, hasSettings: p.hasSettings, sortOrder: i })
    .onConflictDoUpdate({ target: s.products.code, set: { name: p.name, color: p.color, description: p.description, hasSettings: p.hasSettings, sortOrder: i } });
}
for (const n of OPERADORAS_INICIAIS) await upsertByName(s.carriers, n);
for (const n of HOSPEDAGENS_INICIAIS) await upsertByName(s.hostingProviders, n);
for (const n of CATEGORIAS_APARELHO_INICIAIS) await upsertByName(s.deviceCategories, n);

// ---- papéis ----
for (const r of DEFAULT_ROLES) {
  await db
    .insert(s.roles)
    .values({ id: newId(), key: r.key, name: r.name, description: r.description, permissions: [...r.permissions], isSystem: true })
    .onConflictDoUpdate({ target: s.roles.key, set: { name: r.name, description: r.description, permissions: [...r.permissions], isSystem: true } });
}

// ---- organizações internas ----
for (const o of ORGANIZACOES_INTERNAS) {
  const [row] = await db.select().from(s.clients).where(eq(s.clients.internalCode, o.code)).limit(1);
  if (!row) {
    await db.insert(s.clients).values({
      id: newId(), tradeName: o.name, legalName: o.legalName, cnpj: o.code === 'ingline' ? '00000000000191' : '00000000000272',
      isInternal: true, internalCode: o.code,
    });
  }
}

// ---- administrador inicial ----
const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@gestor.local').toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'TroqueEstaSenha!2026';
const adminName = process.env.SEED_ADMIN_NAME ?? 'Administrador';
const [adminRole] = await db.select().from(s.roles).where(eq(s.roles.key, 'administrador'));
const [existingAdmin] = await db.select().from(s.users).where(eq(s.users.email, adminEmail));
if (!existingAdmin) {
  await db.insert(s.users).values({ id: newId(), name: adminName, email: adminEmail, passwordHash: await argon2.hash(adminPassword), roleId: adminRole!.id });
  console.log(`Administrador criado: ${adminEmail}${process.env.SEED_ADMIN_PASSWORD ? '' : '  (senha padrão — troque no primeiro acesso)'}`);
}

// ---- dados de demonstração ----
if (demo) {
  const [count] = await db.select({ n: sql<number>`count(*)` }).from(s.clients).where(eq(s.clients.isInternal, false));
  if (Number(count?.n ?? 0) > 0) {
    console.log('Já existem clientes; demo não recarregada.');
  } else {
    console.log('Carregando dados de demonstração…');
    const prod = Object.fromEntries((await db.select().from(s.products)).map((p) => [p.code, p.id]));
    const carriers = Object.fromEntries((await db.select().from(s.carriers)).map((c) => [c.name, c.id]));
    const hostings = Object.fromEntries((await db.select().from(s.hostingProviders)).map((h) => [h.name, h.id]));
    const cats = Object.fromEntries((await db.select().from(s.deviceCategories)).map((c) => [c.name, c.id]));
    const [voicenet] = await db.select().from(s.clients).where(eq(s.clients.internalCode, 'voicenet'));
    const admin = (await db.select().from(s.users).where(eq(s.users.email, adminEmail)))[0]!;

    const demoClients = [
      { t: 'Clínica Aurora', l: 'Clínica Aurora Serviços Médicos LTDA', cnpj: '11222333000181', p: ['linepbx', 'fop2', 'voicenet'], host: 'Vultr', dom: 'aurora.linepbx.com.br', ip: '203.0.113.10' },
      { t: 'Distribuidora Norte', l: 'Norte Comércio e Distribuição LTDA', cnpj: '22333444000105', p: ['linepbx', 'voicenet', 'linechat', 'equipamentos'], host: 'Local', dom: null, ip: '192.0.2.50' },
      { t: 'Hospital Vale Verde', l: 'Associação Hospitalar Vale Verde', cnpj: '33444555000120', p: ['linepbx', 'fop2', 'omniboard', 'linereports', 'voicenet', 'equipamentos'], host: 'Hetzner', dom: 'valeverde.linepbx.com.br', ip: '198.51.100.7' },
      { t: 'Escritório Prado & Lima', l: 'Prado e Lima Advogados Associados', cnpj: '44555666000148', p: ['voicenet', 'linechat'], host: null, dom: null, ip: null },
      { t: 'Supermercado Bom Preço', l: 'Bom Preço Supermercados LTDA', cnpj: '55666777000162', p: ['linepbx', 'fop2', 'voicenet', 'equipamentos'], host: 'Nuvem (Local)', dom: 'bompreco.linepbx.com.br', ip: '203.0.113.88' },
      { t: 'Laboratório Exame Certo', l: 'Exame Certo Análises Clínicas LTDA', cnpj: '66777888000187', p: ['linepbx', 'voicenet'], host: 'AWS', dom: 'exame.linepbx.com.br', ip: '203.0.113.121' },
      { t: 'Construtora Horizonte', l: 'Horizonte Engenharia e Construções S.A.', cnpj: '77888999000101', p: ['voicenet'], host: null, dom: null, ip: null },
      { t: 'Home Care Viver Bem', l: 'Viver Bem Atenção Domiciliar LTDA', cnpj: '88999000000116', p: ['linepbx', 'omniboard', 'voicenet', 'linechat', 'equipamentos'], host: 'Vultr', dom: 'viverbem.linepbx.com.br', ip: '203.0.113.200' },
    ];

    const clientIds: Record<string, string> = {};
    for (const c of demoClients) {
      const cid = newId();
      clientIds[c.t] = cid;
      await db.insert(s.clients).values({ id: cid, tradeName: c.t, legalName: c.l, cnpj: c.cnpj });
      for (const code of c.p) {
        const sid = newId();
        await db.insert(s.subscriptions).values({ id: sid, clientId: cid, productId: prod[code]!, activatedAt: new Date(2024, 2 + c.p.indexOf(code), 15) });
        if (code === 'linepbx') {
          await db.insert(s.linepbxSettings).values({ subscriptionId: sid, hostingId: c.host ? hostings[c.host]! : null, serverIp: c.ip, domain: c.dom, sshUser: 'root', sshPort: 22 });
        }
        if (code === 'fop2') await db.insert(s.fop2Settings).values({ subscriptionId: sid, adminExtension: '1000' });
        if (code === 'omniboard') await db.insert(s.omniboardSettings).values({ subscriptionId: sid, adminLogin: 'admin@' + c.t.toLowerCase().replace(/\W+/g, '') + '.com.br' });
      }
    }

    // circuitos e DIDs
    const circuitDefs = [
      { name: '071 Principal', code: '09802603', carrier: 'ALGAR', channels: 30, base: '7130200000', qty: 120, value: 60338 },
      { name: '071 Hospitalar', code: '010241793', carrier: 'ALGAR', channels: 60, base: '7132170000', qty: 200, value: 120000 },
      { name: 'Link - Distribuidora Norte', code: '73169', carrier: 'VC1', channels: 5, base: '7131720000', qty: 12, value: 25000 },
      { name: 'Link - Aurora', code: '94234', carrier: 'VC1', channels: 2, base: '7130396100', qty: 4, value: 9900 },
    ];
    const assign = [
      ['071 Principal', 'Supermercado Bom Preço', 0, 40],
      ['071 Principal', 'Laboratório Exame Certo', 40, 70],
      ['071 Hospitalar', 'Hospital Vale Verde', 0, 150],
      ['Link - Distribuidora Norte', 'Distribuidora Norte', 0, 12],
      ['Link - Aurora', 'Clínica Aurora', 0, 4],
    ] as const;
    for (const c of circuitDefs) {
      const cid = newId();
      await db.insert(s.circuits).values({ id: cid, name: c.name, code: c.code, carrierId: carriers[c.carrier]!, channels: c.channels, ownerClientId: voicenet!.id, monthlyValueCents: c.value, signalingIp: '203.0.113.1', authIp: '198.51.100.1' });
      const nums = gerarFaixaDids(c.base, c.qty);
      const rows = nums.map((n, i) => {
        const a = assign.find((x) => x[0] === c.name && i >= x[2] && i < x[3]);
        return { id: newId(), number: n, circuitId: cid, ownerClientId: voicenet!.id, clientId: a ? clientIds[a[1]]! : null, note: a && i % 7 === 0 ? 'principal' : null };
      });
      for (let i = 0; i < rows.length; i += 200) await db.insert(s.dids).values(rows.slice(i, i + 200));
    }

    // inventário
    const mGx = newId(), mHs = newId(), mTip = newId();
    await db.insert(s.deviceModels).values([
      { id: mGx, code: 'gxp1610', name: 'Grandstream GXP1610', categoryId: cats['Telefone IP']!, tracking: 'serializado' },
      { id: mHs, code: 'headset', name: 'Headset Genérico', categoryId: cats['Periférico']!, tracking: 'granel' },
      { id: mTip, code: 'tip125i', name: 'Intelbras TIP 125i', categoryId: cats['Telefone IP']!, tracking: 'serializado' },
    ]);
    const devs: (typeof s.devices.$inferInsert)[] = [];
    const locados: Array<[string, number]> = [['Hospital Vale Verde', 20], ['Distribuidora Norte', 8], ['Supermercado Bom Preço', 6], ['Home Care Viver Bem', 4]];
    let n = 0;
    for (const [cli, q] of locados) for (let i = 0; i < q; i++, n++) devs.push({ id: newId(), modelId: mGx, mac: ('000B82' + (0x100000 + n).toString(16).toUpperCase().slice(-6)), tag: 'N' + String(n + 1).padStart(3, '0'), clientId: clientIds[cli]!, currentModality: 'locacao', condition: 'ativo', valueCents: 45000 });
    for (let i = 0; i < 12; i++, n++) devs.push({ id: newId(), modelId: mGx, mac: ('000B82' + (0x100000 + n).toString(16).toUpperCase().slice(-6)), tag: 'N' + String(n + 1).padStart(3, '0'), condition: i === 11 ? 'manutencao' : 'ativo', valueCents: 45000 });
    for (let i = 0; i < 3; i++, n++) devs.push({ id: newId(), modelId: mTip, mac: ('1C61B4' + (0x200000 + n).toString(16).toUpperCase().slice(-6)), condition: 'ativo', valueCents: 38000 });
    await db.insert(s.devices).values(devs);
    await db.insert(s.bulkStock).values([
      { id: newId(), modelId: mHs, clientId: null, modality: 'estoque', quantity: 28 },
      { id: newId(), modelId: mHs, clientId: clientIds['Hospital Vale Verde']!, modality: 'locacao', quantity: 4 },
    ]);
    // movimentações de exemplo (uma por cliente com aparelho)
    for (const [cli, q] of locados) {
      const mid = newId();
      await db.insert(s.deviceMovements).values({ id: mid, modality: 'locacao', fromClientId: null, toClientId: clientIds[cli]!, newCondition: 'ativo', userId: admin.id, createdAt: new Date(2026, 7, 10 + locados.findIndex((x) => x[0] === cli)) });
      const items = devs.filter((d) => d.clientId === clientIds[cli]).map((d) => ({ id: newId(), movementId: mid, modelId: mGx, deviceId: d.id!, quantity: 1 }));
      await db.insert(s.deviceMovementItems).values(items);
    }
    console.log(`Demo: ${demoClients.length} clientes, ${circuitDefs.length} circuitos, ${circuitDefs.reduce((a, c) => a + c.qty, 0)} DIDs, ${devs.length} aparelhos.`);
  }
}

await pool.end();
console.log('Seed concluído.');
