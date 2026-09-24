/**
 * Os pedidos da rodada de mudanças 23: login e senha de equipamentos (vários por cliente),
 * endereço e IP fixo de saída da unidade, autenticação do tronco por IP ou por login e senha,
 * DID sempre com circuito e a marca "em uso", rede padrão dos aparelhos, senha do usuário
 * padrão do FOP2 (desde o 1.4, a senha do ramal admin), filtros de movimentação por modelo e por MAC/N/S e catálogo renomeável.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let clientId: string;
beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  clientId = (await s.post('/clients', { tradeName: 'Coutrim Distribuidora', legalName: 'Coutrim Distribuidora LTDA', cnpj: '17.642.486/0001-64' })).json().id;
});
afterAll(async () => { await app.close(); });

describe('login e senha padrão dos aparelhos, por modelo', () => {
  it('um login por modelo no cliente; a senha fica no cofre e se revela com a senha de quem pede', async () => {
    const cats = (await s.get('/admin/catalogs/categories')).json();
    const gxp = (await s.post('/inventory/models', { code: 'gxp1610-login', name: 'Grandstream GXP1610', categoryId: cats[0].id })).json().id;
    const dp = (await s.post('/inventory/models', { code: 'dp722-login', name: 'Grandstream DP722', categoryId: cats[0].id })).json().id;
    const a = await s.put(`/clients/${clientId}/device-logins`, { modelId: gxp, username: 'admin', password: 'Gxp#2026' });
    expect(a.statusCode).toBe(200);
    const l1 = a.json().deviceLogins;
    expect(l1).toHaveLength(1);
    expect(l1[0].modelName).toBe('Grandstream GXP1610');
    expect(l1[0].password.hasSecret).toBe(true);
    expect(JSON.stringify(a.json())).not.toContain('Gxp#2026');
    expect((await s.post(`/secrets/${l1[0].password.secretId}/reveal`, { password: 'SenhaDeTeste!123' })).json().value).toBe('Gxp#2026');

    // segundo modelo entra como outra linha; gravar o mesmo modelo deNovo só atualiza (não duplica)
    await s.put(`/clients/${clientId}/device-logins`, { modelId: dp, username: 'user' });
    const deNovo = await s.put(`/clients/${clientId}/device-logins`, { modelId: gxp, username: 'root' });
    const l2 = deNovo.json().deviceLogins;
    expect(l2).toHaveLength(2);
    const g = l2.find((x: any) => x.modelId === gxp);
    expect(g.username).toBe('root');
    expect(g.password.secretId).toBe(l1[0].password.secretId); // sem mandar senha, mantém
    expect(l2.find((x: any) => x.modelId === dp).password.hasSecret).toBe(false);

    const r = await s.del(`/clients/${clientId}/device-logins/${g.id}`);
    expect(r.json().deviceLogins).toHaveLength(1);
    expect((await s.put(`/clients/${clientId}/device-logins`, { modelId: 'nao-existe', username: 'x' })).statusCode).toBe(404);
  });
});

describe('unidades com endereço e IP fixo de saída', () => {
  it('guarda endereço e IP de saída e recusa IP inválido', async () => {
    const u = await s.post(`/clients/${clientId}/units`, { name: 'Loja Centro', address: 'Rua Chile, 10 — Salvador', egressIp: '200.180.10.5' });
    expect(u.statusCode).toBe(201);
    const lista = (await s.get(`/clients/${clientId}/units`)).json();
    const loja = lista.find((x: any) => x.name === 'Loja Centro');
    expect(loja.address).toBe('Rua Chile, 10 — Salvador');
    expect(loja.egressIp).toBe('200.180.10.5');
    expect((await s.patch(`/clients/${clientId}/units/${loja.id}`, { name: 'Loja Centro', egressIp: 'não é ip' })).statusCode).toBe(400);
    // editar só o nome não apaga o endereço
    await s.patch(`/clients/${clientId}/units/${loja.id}`, { name: 'Loja Centro Histórico' });
    const depois = (await s.get(`/clients/${clientId}/units`)).json().find((x: any) => x.id === loja.id);
    expect(depois.address).toBe('Rua Chile, 10 — Salvador');
    expect(depois.egressIp).toBe('200.180.10.5');
  });
});

describe('rede padrão dos aparelhos', () => {
  it('grava IP, máscara, gateway, DNS e a senha do ramal sem fio no cofre', async () => {
    const r = await s.put(`/clients/${clientId}/network`, { ipAddress: '10.20.0.77', subnetMask: '255.255.255.0', defaultRouter: '10.20.0.1', dns1: '8.8.8.8', dns2: '8.8.4.4', wirelessPassword: 'ramal#sem-fio' });
    expect(r.statusCode).toBe(200);
    const net = r.json().network;
    expect(net.ipAddress).toBe('10.20.0.77');
    expect(net.defaultRouter).toBe('10.20.0.1');
    expect(net.wirelessPassword.hasSecret).toBe(true);
    expect(JSON.stringify(r.json())).not.toContain('ramal#sem-fio');
    // salvar de novo sem a senha mantém a senha
    const r2 = await s.put(`/clients/${clientId}/network`, { ipAddress: '10.20.0.78', subnetMask: '255.255.255.0', defaultRouter: '10.20.0.1', dns1: '8.8.8.8', dns2: '8.8.4.4' });
    expect(r2.json().network.wirelessPassword.secretId).toBe(net.wirelessPassword.secretId);
    expect(r2.json().network.ipAddress).toBe('10.20.0.78');
    expect((await s.put(`/clients/${clientId}/network`, { defaultRouter: 'abc' })).statusCode).toBe(400);
  });
});

describe('FOP2: senha do ramal admin (1.4, decisão 0032, revendo a 0025)', () => {
  it('guarda a senha do ramal admin no cofre e a ficha só diz que ela existe', async () => {
    await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'linepbx' });
    const r = await s.put(`/clients/${clientId}/modules`, { productCode: 'linepbx', moduleCode: 'fop2', settings: { adminExtension: '1000', adminPassword: 'fop2#admin' } });
    expect(r.statusCode).toBe(200);
    const f2 = r.json().subscriptions.find((x: any) => x.productCode === 'linepbx').modules.find((x: any) => x.moduleCode === 'fop2');
    expect(f2.settings.adminExtension).toBe('1000');
    expect(f2.settings.adminPassword.hasSecret).toBe(true);
    expect(f2.settings).not.toHaveProperty('defaultUserPassword');
    expect(JSON.stringify(r.json())).not.toContain('fop2#admin');
    const revelada = await s.post(`/secrets/${f2.settings.adminPassword.secretId}/reveal`, { password: 'SenhaDeTeste!123' });
    expect(revelada.json().value).toBe('fop2#admin');
  });

  it('a senha do usuário padrão não é mais aceita, e a que já estava guardada continua no cofre', async () => {
    const ficha = (await s.get(`/clients/${clientId}`)).json();
    const f2 = ficha.subscriptions.find((x: any) => x.productCode === 'linepbx').modules.find((x: any) => x.moduleCode === 'fop2');
    // simula a senha de antes do 1.4: a coluna antiga apontando para um segredo do cofre
    const antiga = f2.settings.adminPassword.secretId;
    await app.db.execute(sql`update fop2_settings set default_user_password_secret_id = ${antiga} where subscription_module_id = ${f2.id}`);
    const r = await s.put(`/clients/${clientId}/modules`, { productCode: 'linepbx', moduleCode: 'fop2', settings: { adminExtension: '2000', defaultUserPassword: 'nao-deve-entrar' } });
    expect(r.statusCode).toBe(200);
    const depois = r.json().subscriptions.find((x: any) => x.productCode === 'linepbx').modules.find((x: any) => x.moduleCode === 'fop2');
    expect(depois.settings.adminExtension).toBe('2000');
    expect(depois.settings).not.toHaveProperty('defaultUserPassword');
    const linha = (await app.db.execute(sql`select default_user_password_secret_id as d from fop2_settings where subscription_module_id = ${f2.id}`)) as any;
    expect((linha.rows ?? linha)[0].d).toBe(antiga);
    const segredos = (await app.db.execute(sql`select count(*)::int as n from secrets where label like 'Senha do usuário padrão do FOP2%'`)) as any;
    expect((segredos.rows ?? segredos)[0].n).toBe(0);
  });
});

describe('Omniboard e SZChat gravam login e senhas (corrigido no 1.4)', () => {
  it('o Omniboard guarda o admin e as duas senhas', async () => {
    const r = await s.put(`/clients/${clientId}/modules`, { productCode: 'linepbx', moduleCode: 'omniboard', settings: { adminLogin: 'admin@coutrim.com.br', adminPassword: 'omni#admin', userDefaultPassword: 'omni#padrao' } });
    expect(r.statusCode).toBe(200);
    const om = r.json().subscriptions.find((x: any) => x.productCode === 'linepbx').modules.find((x: any) => x.moduleCode === 'omniboard');
    expect(om.settings.adminLogin).toBe('admin@coutrim.com.br');
    expect(om.settings.adminPassword.hasSecret).toBe(true);
    expect(om.settings.userDefaultPassword.hasSecret).toBe(true);
    expect(JSON.stringify(r.json())).not.toContain('omni#');
  });

  it('o SZChat guarda o admin e a senha', async () => {
    const r = await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'szchat', settings: { adminLogin: 'admin@coutrim', adminPassword: 'sz#admin' } });
    expect(r.statusCode).toBe(200);
    const sz = (await s.get(`/clients/${clientId}`)).json().subscriptions.find((x: any) => x.productCode === 'szchat');
    expect(sz.settings.adminLogin).toBe('admin@coutrim');
    expect(sz.settings.adminPassword.hasSecret).toBe(true);
  });

  it('o LinePBX continua gravando o servidor', async () => {
    const r = await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'linepbx', settings: { domain: 'coutrim.linepbx.com.br', sshPort: 2201 } });
    expect(r.statusCode).toBe(200);
    const lp = (await s.get(`/clients/${clientId}`)).json().subscriptions.find((x: any) => x.productCode === 'linepbx');
    expect(lp.settings.domain).toBe('coutrim.linepbx.com.br');
    expect(lp.settings.sshPort).toBe(2201);
  });
});

describe('tronco: autenticação por IP ou por login e senha', () => {
  it('por IP guarda os IPs e limpa o login; por login guarda login e senha e limpa o IP do PBX', async () => {
    const carriers = (await s.get('/admin/catalogs/carriers')).json();
    const porIp = await s.post('/circuits', { name: 'Feixe IP', code: 'IP-1', carrierId: carriers[0].id, channels: 10, authType: 'ip', signalingIp: '200.1.1.1', authIp: '200.2.2.2', authUsername: 'nao-deveria-ficar' });
    expect(porIp.statusCode).toBe(201);
    expect(porIp.json().authType).toBe('ip');
    expect(porIp.json().authIp).toBe('200.2.2.2');
    expect(porIp.json().authUsername).toBeNull();

    const porLogin = await s.post('/circuits', { name: 'Feixe Login', code: 'LG-1', carrierId: carriers[0].id, channels: 10, authType: 'login', signalingIp: '200.1.1.1', authIp: '200.2.2.2', authUsername: 'tronco01', authPassword: 'senha-tronco' });
    expect(porLogin.json().authType).toBe('login');
    expect(porLogin.json().authUsername).toBe('tronco01');
    expect(porLogin.json().authIp).toBeNull();
    expect(porLogin.json().authPassword.hasSecret).toBe(true);

    // sem dizer o tipo, o padrão é por IP; e trocar o tipo depois limpa o que não pertence a ele
    const semTipo = await s.post('/circuits', { name: 'Feixe Padrão', code: 'PD-1', channels: 1 });
    expect(semTipo.json().authType).toBe('ip');
    const trocado = await s.patch(`/circuits/${porLogin.json().id}`, { authType: 'ip', authIp: '200.3.3.3' });
    expect(trocado.json().authType).toBe('ip');
    expect(trocado.json().authUsername).toBeNull();
    expect(trocado.json().authIp).toBe('200.3.3.3');
  });
});

describe('DIDs: sempre com circuito, com a marca "em uso"', () => {
  let circuitId: string;
  let outroCircuito: string;
  beforeAll(async () => {
    const carriers = (await s.get('/admin/catalogs/carriers')).json();
    circuitId = (await s.post('/circuits', { name: 'Feixe DIDs', code: 'DD-1', carrierId: carriers[0].id, channels: 10 })).json().id;
    outroCircuito = (await s.post('/circuits', { name: 'Feixe DIDs 2', code: 'DD-2', carrierId: carriers[0].id, channels: 10 })).json().id;
  });

  it('a faixa exige circuito; o resumo de circuitos não fala mais em "sem circuito"', async () => {
    expect((await s.post('/dids/range', { baseNumber: '7130301200', quantity: 10 })).statusCode).toBe(400);
    expect((await s.post('/dids/range', { baseNumber: '7130301200', quantity: 10, circuitId })).statusCode).toBe(201);
    const resumo = (await s.get('/circuits/summary')).json();
    expect(resumo.dids.total).toBe(10);
    expect(resumo.dids).not.toHaveProperty('noCircuit');
    expect((await s.get('/dashboard')).json().alerts.some((a: any) => a.kind === 'did_sem_circuito')).toBe(false);
  });

  it('número livre não está em uso; alocar não é usar: entra como não usado até alguém marcar', async () => {
    const livres = (await s.get('/dids?clientId=free')).json();
    expect(livres.items.every((d: any) => d.inUse === false)).toBe(true);
    const ids = livres.items.slice(0, 4).map((d: any) => d.id);
    await s.post('/dids/bulk', { ids, set: { clientId } });
    const doCliente = (await s.get(`/clients/${clientId}/dids`)).json().items;
    expect(doCliente).toHaveLength(4);
    expect(doCliente.every((d: any) => d.inUse === false)).toBe(true);

    // marca um como em uso
    const um = await s.patch(`/dids/${ids[0]}`, { inUse: true });
    expect(um.json().inUse).toBe(true);
    expect((await s.get(`/dids?clientId=${clientId}&inUse=true`)).json().total).toBe(1);
    expect((await s.get(`/dids?clientId=${clientId}&inUse=false`)).json().total).toBe(3);

    // em massa: marcar todos como em uso; número livre não entra na conta
    const r = await s.post('/dids/bulk', { ids: [...ids, livres.items[5].id], set: { inUse: true } });
    expect(r.json().affected).toBe(4);
    // mover para outro cliente derruba a marca (o cliente novo ainda não usa)
    const outro = (await s.post('/clients', { tradeName: 'Outro Cliente', legalName: 'Outro Cliente LTDA', cnpj: '22.333.444/0001-81' })).json().id;
    await s.post('/dids/bulk', { ids: [ids[2]], set: { clientId: outro } });
    expect((await s.get(`/dids/${ids[2]}`)).json().inUse).toBe(false);
    // liberar derruba a marca
    await s.post('/dids/bulk', { ids: [ids[1]], set: { clientId: null } });
    expect((await s.get(`/dids/${ids[1]}`)).json().inUse).toBe(false);
    // número livre não pode ser marcado como em uso
    expect((await s.patch(`/dids/${ids[1]}`, { inUse: true })).statusCode).toBe(400);
  });

  it('mudar de circuito em massa exige um circuito de destino', async () => {
    const ids = (await s.get(`/dids/ids?circuitId=${circuitId}`)).json().ids;
    expect((await s.post('/dids/bulk', { ids, set: { circuitId: null } })).statusCode).toBe(400);
    expect((await s.post('/dids/bulk', { ids, set: { circuitId: outroCircuito } })).json().affected).toBe(10);
    expect((await s.get(`/dids?circuitId=${outroCircuito}`)).json().total).toBe(10);
  });

  it('a importação recusa número novo sem circuito', async () => {
    const csv = ['numero;circuito;cliente', '(71) 3030-9000;;livre'].join('\n');
    const r = await s.post('/data/import/preview', { entity: 'dids', csv, delimiter: ';' });
    expect(r.statusCode).toBe(200);
    expect(r.json().rows[0].errors.join(' ')).toMatch(/circuito/i);
  });
});

describe('movimentações: filtro por modelo e busca por MAC ou N/S', () => {
  it('encontra as movimentações do modelo e as de um aparelho específico', async () => {
    await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'equipamentos' });
    const cats = (await s.get('/admin/catalogs/categories')).json();
    const gxp = (await s.post('/inventory/models', { code: 'gxp1610-r23', name: 'Grandstream GXP1610', categoryId: cats[0].id, valueCents: 45000 })).json().id;
    const hs = (await s.post('/inventory/models', { code: 'headset-r23', name: 'Headset', categoryId: cats[0].id })).json().id;
    const tel = (await s.post('/inventory/devices', { modelId: gxp, mac: 'EC:74:D7:68:58:9E' })).json().id;
    const fone = (await s.post('/inventory/devices', { modelId: hs, serialNumber: 'HS-2026-0001' })).json().id;
    await s.post('/inventory/movements', { modality: 'locacao', toClientId: clientId, items: [{ deviceId: tel }] });
    await s.post('/inventory/movements', { modality: 'comodato', toClientId: clientId, items: [{ deviceId: fone }] });
    await s.post('/inventory/movements', { modality: 'devolucao', toClientId: null, items: [{ deviceId: tel }] });

    expect((await s.get('/inventory/movements')).json().total).toBe(3);
    expect((await s.get(`/inventory/movements?modelId=${gxp}`)).json().total).toBe(2);
    expect((await s.get(`/inventory/movements?modelId=${hs}`)).json().total).toBe(1);
    // por MAC (com ou sem separador, pedaço a partir de 4 caracteres) e por N/S
    expect((await s.get('/inventory/movements?q=EC:74:D7:68:58:9E')).json().total).toBe(2);
    expect((await s.get('/inventory/movements?q=589e')).json().total).toBe(2);
    expect((await s.get('/inventory/movements?q=HS-2026-0001')).json().total).toBe(1);
    expect((await s.get('/inventory/movements?q=nada-disso')).json().total).toBe(0);
  });
});

describe('catálogos', () => {
  it('renomeia um item do catálogo', async () => {
    const novo = await s.post('/admin/catalogs/hostings', { name: 'Nuvem Temporária' });
    expect(novo.statusCode).toBe(201);
    const r = await s.patch(`/admin/catalogs/hostings/${novo.json().id}`, { name: 'Nuvem Ingline' });
    expect(r.statusCode).toBe(200);
    expect(r.json().name).toBe('Nuvem Ingline');
    expect((await s.get('/admin/catalogs/hostings')).json().some((h: any) => h.name === 'Nuvem Ingline')).toBe(true);
    // nome repetido (mesmo com maiúsculas diferentes) é recusado com aviso claro
    const dup = await s.patch(`/admin/catalogs/hostings/${novo.json().id}`, { name: 'local' });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error).toMatch(/Já existe/);
  });
});
