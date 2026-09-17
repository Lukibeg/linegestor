/**
 * Os pedidos da rodada de mudanças 22: datas que voltavam um dia, produto novo e excluído,
 * unidades do cliente, valor no modelo, foto do modelo, cadastro em massa, número de série,
 * filtro "só em clientes", titulares com circuito, "ver tudo" sem limite e o usuário SSH de cada um.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let clientId: string;
beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  clientId = (await s.post('/clients', { tradeName: 'Pronto Saúde', legalName: 'Clinica Bela Vista LTDA', cnpj: '17.642.486/0001-64' })).json().id;
});
afterAll(async () => { await app.close(); });

/** Texto em UTF-8 lido como Latin-1: "Peças" vira "PeÃ§as" (o defeito que chegou do Nexus). */
const embaralhar = (t: string) => Array.from(new TextEncoder().encode(t), (b) => String.fromCharCode(b)).join('');

describe('datas de ativação', () => {
  it('o dia escolhido é o dia gravado (não volta um dia no Brasil)', async () => {
    const r = await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'linepbx', activatedAt: '2025-11-03' });
    expect(r.statusCode).toBe(200);
    const lp = r.json().subscriptions.find((x: any) => x.productCode === 'linepbx');
    expect(lp.activatedAt).toBe('2025-11-03T12:00:00.000Z');
    // módulo sem configuração própria também aceita data
    const m = await s.put(`/clients/${clientId}/modules`, { productCode: 'linepbx', moduleCode: 'nps', activatedAt: '2025-12-01' });
    expect(m.json().subscriptions.find((x: any) => x.productCode === 'linepbx').modules.find((x: any) => x.moduleCode === 'nps').activatedAt).toBe('2025-12-01T12:00:00.000Z');
  });

  it('a importação grava a data ao meio-dia e conserta acentos embaralhados', async () => {
    const csv = [
      'cnpj;nome_fantasia;razao_social;produtos;ativacao_voicenet',
      `22.333.444/0001-81;${embaralhar('Gefpel-Auto Peças')};${embaralhar('Clínica Olhar Bem LTDA')};voicenet;03/11/2025`,
    ].join('\n');
    const ok = await s.post('/data/import/apply', { entity: 'clients', csv, delimiter: ';' });
    expect(ok.statusCode).toBe(200);
    const c = (await s.get('/clients?q=gefpel')).json().items[0];
    expect(c.tradeName).toBe('Gefpel-Auto Peças');
    expect(c.legalName).toBe('Clínica Olhar Bem LTDA');
    expect(c.products[0].activatedAt).toBe('2025-11-03T12:00:00.000Z');
  });
});

describe('produtos', () => {
  it('cria produto novo, exclui (lixeira) e restaura; os do sistema não saem', async () => {
    const novo = await s.post('/admin/products', { code: 'gravacao', name: 'Gravação', color: '#7C3AED', description: 'Gravação de chamadas' });
    expect(novo.statusCode).toBe(201);
    const pid = novo.json().id;
    expect((await s.get('/admin/products')).json().map((p: any) => p.code)).toContain('gravacao');
    const dup = await s.post('/admin/products', { code: 'gravacao', name: 'Outro' });
    expect(dup.statusCode).toBe(400);

    await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'gravacao' });
    expect((await s.get(`/clients/${clientId}`)).json().subscriptions.map((x: any) => x.productCode)).toContain('gravacao');

    const del = await s.del(`/admin/products/${pid}`);
    expect(del.statusCode).toBe(200);
    expect((await s.get('/admin/products')).json().map((p: any) => p.code)).not.toContain('gravacao');
    expect((await s.get(`/clients/${clientId}`)).json().subscriptions.map((x: any) => x.productCode)).not.toContain('gravacao');
    const lixo = (await s.get('/admin/trash')).json();
    expect(lixo.find((t: any) => t.type === 'product' && t.id === pid)?.label).toBe('Gravação');

    const volta = await s.post(`/admin/trash/product/${pid}/restore`);
    expect(volta.statusCode).toBe(200);
    // a assinatura volta junto, porque nunca saiu do banco
    expect((await s.get(`/clients/${clientId}`)).json().subscriptions.map((x: any) => x.productCode)).toContain('gravacao');

    const lp = (await s.get('/admin/products')).json().find((p: any) => p.code === 'linepbx');
    expect(lp.protegido).toBe(true);
    const nao = await s.del(`/admin/products/${lp.id}`);
    expect(nao.statusCode).toBe(400);
    expect(nao.json().error).toMatch(/depende/);
  });
});

describe('unidades do cliente', () => {
  it('todo cliente tem a Matriz; cadastra, renomeia levando os aparelhos e protege a remoção', async () => {
    const lista = (await s.get(`/clients/${clientId}/units`)).json();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ name: 'Matriz', isMain: true });

    const loja = await s.post(`/clients/${clientId}/units`, { name: 'Loja Simões Filho' });
    expect(loja.statusCode).toBe(201);
    expect((await s.post(`/clients/${clientId}/units`, { name: 'loja simões filho' })).statusCode).toBe(400);

    // aparelho indo para a loja
    await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'equipamentos' });
    const modelo = (await s.post('/inventory/models', { code: 'gxp1610', name: 'Grandstream GXP1610', valueCents: 30000 })).json().id;
    const a = (await s.post('/inventory/devices', { modelId: modelo, mac: 'EC:74:D7:68:58:A4' })).json().id;
    const b = (await s.post('/inventory/devices', { modelId: modelo, mac: 'EC:74:D7:77:D4:71' })).json().id;
    await s.post('/inventory/movements', { modality: 'comodato', toClientId: clientId, unit: 'Loja Simões Filho', items: [{ deviceId: a }] });
    // sem unidade escolhida, vai para a Matriz
    const semUnidade = await s.post('/inventory/movements', { modality: 'comodato', toClientId: clientId, items: [{ deviceId: b }] });
    expect(semUnidade.json().unit).toBe('Matriz');
    expect((await s.get(`/inventory/devices/${b}`)).json().unit).toBe('Matriz');

    const unidades = (await s.get(`/clients/${clientId}/units`)).json();
    expect(unidades.find((u: any) => u.name === 'Loja Simões Filho').deviceCount).toBe(1);
    expect(unidades.find((u: any) => u.isMain).deviceCount).toBe(1);

    const ren = await s.patch(`/clients/${clientId}/units/${loja.json().id}`, { name: 'Loja Centro' });
    expect(ren.statusCode).toBe(200);
    expect((await s.get(`/inventory/devices/${a}`)).json().unit).toBe('Loja Centro');

    const comAparelho = await s.del(`/clients/${clientId}/units/${loja.json().id}`);
    expect(comAparelho.statusCode).toBe(400);
    const matriz = unidades.find((u: any) => u.isMain).id;
    expect((await s.del(`/clients/${clientId}/units/${matriz}`)).statusCode).toBe(400);

    // unidade digitada na movimentação entra na lista do cliente
    const c = (await s.post('/inventory/devices', { modelId: modelo, mac: 'EC:74:D7:77:D4:93' })).json().id;
    await s.post('/inventory/movements', { modality: 'locacao', toClientId: clientId, unit: 'Ambulatório', items: [{ deviceId: c }] });
    expect((await s.get(`/clients/${clientId}/units`)).json().map((u: any) => u.name)).toContain('Ambulatório');

    // as movimentações do cliente trazem a unidade e os aparelhos
    const movs = (await s.get(`/inventory/movements?clientId=${clientId}`)).json();
    expect(movs.items[0].unit).toBe('Ambulatório');
    expect(movs.items[0].devices[0].identificacao).toBe('EC:74:D7:77:D4:93');

    // o valor que soma no cliente é o do modelo
    const ficha = (await s.get(`/clients/${clientId}`)).json();
    expect(ficha.deviceValueCents).toBe(90000);
    expect(ficha.unitCount).toBe(3);
  });
});

describe('modelos: valor, foto e aparelhos', () => {
  let modelo: string;
  it('o aparelho sem valor próprio vale o do modelo; aplicar a todos zera o valor próprio', async () => {
    modelo = (await s.post('/inventory/models', { code: 'dp752', name: 'Base Grandstream DP752', valueCents: 35880 })).json().id;
    const x = (await s.post('/inventory/devices', { modelId: modelo, mac: 'EC:74:D7:F5:79:99' })).json().id;
    const y = (await s.post('/inventory/devices', { modelId: modelo, mac: 'EC:74:D7:F5:79:9A', valueCents: 10000 })).json().id;
    expect((await s.get(`/inventory/devices/${x}`)).json()).toMatchObject({ valueCents: 35880, ownValueCents: null });
    expect((await s.get(`/inventory/devices/${y}`)).json()).toMatchObject({ valueCents: 10000, ownValueCents: 10000 });
    expect((await s.get('/inventory/models')).json().find((m: any) => m.id === modelo).counts.ownValue).toBe(1);

    const upd = await s.patch(`/inventory/models/${modelo}`, { valueCents: 40000, aplicarValorATodos: true });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().igualados).toBe(1);
    expect((await s.get(`/inventory/devices/${y}`)).json()).toMatchObject({ valueCents: 40000, ownValueCents: null });
  });

  it('guarda e devolve a foto do modelo', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    expect((await s.put(`/inventory/models/${modelo}/image`, { dataUrl: png })).statusCode).toBe(200);
    const m = (await s.get('/inventory/models')).json().find((x: any) => x.id === modelo);
    expect(m.imageUrl).toMatch(new RegExp(`^inventory/models/${modelo}/image\\?v=`));
    const img = await s.get(`/inventory/models/${modelo}/image`);
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect((await s.del(`/inventory/models/${modelo}/image`)).statusCode).toBe(200);
    expect((await s.get('/inventory/models')).json().find((x: any) => x.id === modelo).imageUrl).toBeNull();
  });
});

describe('cadastro em massa e número de série', () => {
  let headset: string;
  beforeAll(async () => {
    headset = (await s.post('/inventory/models', { code: 'headset-hs', name: 'Headset HS', valueCents: 9000 })).json().id;
  });

  it('lista de MACs: um inválido ou repetido barra tudo; a lista certa entra inteira', async () => {
    const modelo = (await s.post('/inventory/models', { code: 'gxp1625', name: 'Grandstream GXP1625' })).json().id;
    const ruim = await s.post('/inventory/devices/bulk', { modelId: modelo, tipo: 'mac', valores: ['00:0B:82:00:00:01', 'XYZ', '000b82000001'] });
    expect(ruim.statusCode).toBe(400);
    expect(ruim.json().details).toMatch(/XYZ/);
    expect(ruim.json().details).toMatch(/repetido/);
    expect((await s.get(`/inventory/devices?modelId=${modelo}`)).json().total).toBe(0);

    const bom = await s.post('/inventory/devices/bulk', { modelId: modelo, tipo: 'mac', valores: ['00:0B:82:00:00:01', '00-0b-82-00-00-02', '000B82000003'] });
    expect(bom.statusCode).toBe(201);
    expect(bom.json().created).toBe(3);
    const denovo = await s.post('/inventory/devices/bulk', { modelId: modelo, tipo: 'mac', valores: ['000B82000003'] });
    expect(denovo.statusCode).toBe(400);
    expect(denovo.json().details).toMatch(/já está cadastrado/);
  });

  it('números de série e aparelhos sem identificação', async () => {
    const r = await s.post('/inventory/devices/bulk', { modelId: headset, tipo: 'serie', valores: ['hs-001', 'HS-002'] });
    expect(r.statusCode).toBe(201);
    const dup = await s.post('/inventory/devices', { modelId: headset, serialNumber: 'HS-001' });
    expect(dup.statusCode).toBe(400);
    const sem = await s.post('/inventory/devices/bulk', { modelId: headset, tipo: 'nenhum', quantidade: 3 });
    expect(sem.json().created).toBe(3);

    const busca = (await s.get('/inventory/devices?q=hs-002')).json();
    expect(busca.items).toHaveLength(1);
    expect(busca.items[0]).toMatchObject({ serialNumber: 'HS-002', identificacao: 'HS-002', identificacaoTipo: 'serie', mac: null });
    const todos = (await s.get(`/inventory/devices?modelId=${headset}`)).json();
    expect(todos.total).toBe(5);
    expect(todos.items.filter((d: any) => d.identificacaoTipo === 'nenhum')).toHaveLength(3);
  });

  it('filtro "só em clientes" e "ver tudo" sem limite de 500', async () => {
    const soClientes = (await s.get('/inventory/devices?clientId=clients')).json();
    expect(soClientes.total).toBeGreaterThan(0);
    expect(soClientes.items.every((d: any) => d.clientId)).toBe(true);
    const tudo = await s.get('/inventory/devices?pageSize=100000');
    expect(tudo.statusCode).toBe(200);
    expect(tudo.json().items.length).toBe(tudo.json().total);
    expect((await s.get('/dids?pageSize=100000')).statusCode).toBe(200);
  });
});

describe('titulares, sim/não no endereço e usuário SSH', () => {
  it('o filtro de titular só traz quem tem circuito; "false" no endereço é não', async () => {
    const semLink = (await s.post('/clients', { tradeName: 'Sem Link', legalName: 'Sem Link LTDA', cnpj: '11.444.777/0001-61' })).json().id;
    const comLink = (await s.post('/clients', { tradeName: 'Com Link', legalName: 'Com Link LTDA', cnpj: '45.997.418/0001-53' })).json().id;
    await s.post('/circuits', { name: 'Vivo - Com Link', code: '77001', channels: 2, ownerClientId: comLink, thirdParty: true });
    const voicenet = (await s.get('/clients/options?includeInternal=true')).json().find((c: any) => c.internalCode === 'voicenet').id;
    await s.post('/circuits', { name: '071 Teste', code: '77002', channels: 10, ownerClientId: voicenet });

    const titulares = (await s.get('/circuits/owners')).json().map((c: any) => c.id);
    expect(titulares).toEqual([voicenet]);
    const comTerceiros = (await s.get('/circuits/owners?includeThirdParty=true')).json().map((c: any) => c.id);
    expect(comTerceiros).toContain(comLink);
    expect(comTerceiros).not.toContain(semLink);

    // antes, "includeThirdParty=false" virava verdadeiro e o link de terceiro aparecia
    const lista = (await s.get('/circuits?includeThirdParty=false')).json();
    expect(lista.items.map((c: any) => c.name)).not.toContain('Vivo - Com Link');
  });

  it('cada pessoa guarda o próprio usuário SSH', async () => {
    const r = await s.patch('/auth/me', { sshUser: 'lucas' });
    expect(r.statusCode).toBe(200);
    expect(r.json().sshUser).toBe('lucas');
    expect((await s.get('/auth/me')).json().sshUser).toBe('lucas');
    expect((await s.patch('/auth/me', { sshUser: 'com espaço' })).statusCode).toBe(400);
    expect((await s.patch('/auth/me', { sshUser: null })).json().sshUser).toBeNull();
  });
});
