import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let circuitId: string;
let clientId: string;
beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const carriers = (await s.get('/admin/catalogs/carriers')).json();
  const c = await s.post('/circuits', { name: '071 Principal', code: '09802603', carrierId: carriers[0].id, channels: 30, monthlyValueCents: 60338, authUsername: 'tronco01', authPassword: 'senha-do-tronco' });
  circuitId = c.json().id;
  const cl = await s.post('/clients', { tradeName: 'Supermercado Bom Preço', legalName: 'Bom Preço LTDA', cnpj: '55.666.777/0001-81' });
  clientId = cl.json().id;
});
afterAll(async () => { await app.close(); });

describe('circuitos', () => {
  it('guarda a senha do tronco no cofre e mostra ocupação', async () => {
    const c = (await s.get(`/circuits/${circuitId}`)).json();
    expect(c.authPassword.hasSecret).toBe(true);
    expect(c.dids).toEqual({ total: 0, assigned: 0, free: 0 });
    expect(JSON.stringify(c)).not.toContain('senha-do-tronco');
  });

  it('guarda o número chave só com dígitos', async () => {
    await s.patch(`/circuits/${circuitId}`, { keyNumber: '(71) 3020-1200' });
    expect((await s.get(`/circuits/${circuitId}`)).json().keyNumber).toBe('7130201200');
  });

  it('o resumo do topo obedece aos mesmos filtros da lista (operadora e titular)', async () => {
    const carriers = (await s.get('/admin/catalogs/carriers')).json();
    const voicenet = (await s.get('/clients/options?includeInternal=true')).json().find((c: any) => c.internalCode === 'voicenet');
    await s.post('/circuits', { name: 'Feixe VC1', code: '77777', carrierId: carriers[1].id, channels: 5, monthlyValueCents: 10000, ownerClientId: voicenet.id });

    const tudo = (await s.get('/circuits/summary')).json();
    expect(tudo.circuits).toBe(2);
    expect(tudo.channels).toBe(35);

    const soVc1 = (await s.get(`/circuits/summary?carrierId=${carriers[1].id}`)).json();
    expect(soVc1.circuits).toBe(1);
    expect(soVc1.channels).toBe(5);
    expect(soVc1.monthlyValueCents).toBe(10000);
    expect(soVc1.dids.total).toBe(0); // o feixe novo ainda não tem numeração

    const porTitular = (await s.get(`/circuits/summary?ownerClientId=${voicenet.id}`)).json();
    expect(porTitular.circuits).toBe(1);
    expect((await s.get(`/circuits?ownerClientId=${voicenet.id}`)).json().total).toBe(1);
  });
});

describe('DIDs', () => {
  it('cria uma faixa e recusa repetir números', async () => {
    const r = await s.post(`/circuits/${circuitId}/dids/range`, { baseNumber: '(71) 3020-1200', quantity: 50 });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ created: 50, first: '7130201200', last: '7130201249' });
    const dup = await s.post('/dids/range', { baseNumber: '7130201240', quantity: 20 });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error).toMatch(/já existem/);
    expect((await s.get('/dids')).json().total).toBe(50);
  });

  it('edição em massa exige lista de ids e devolve o número exato de afetados', async () => {
    const ids = (await s.get(`/dids/ids?circuitId=${circuitId}`)).json().ids;
    expect(ids.length).toBe(50);
    const r = await s.post('/dids/bulk', { ids: ids.slice(0, 12), set: { clientId } });
    expect(r.statusCode).toBe(200);
    expect(r.json().affected).toBe(12);
    const audit = (await s.get('/admin/audit?action=bulk_update')).json();
    expect(audit.items[0].summary).toBe('Alterou 12 DID(s): cliente → Supermercado Bom Preço');
    const c = (await s.get(`/circuits/${circuitId}`)).json();
    expect(c.dids).toEqual({ total: 50, assigned: 12, free: 38 });
    expect((await s.get('/dids?clientId=free')).json().total).toBe(38);
    expect((await s.get(`/clients/${clientId}/dids`)).json().total).toBe(12);
  });

  it('recusa edição em massa sem nada para alterar', async () => {
    const ids = (await s.get('/dids/ids')).json().ids;
    const r = await s.post('/dids/bulk', { ids: ids.slice(0, 3), set: {} });
    expect(r.statusCode).toBe(400);
  });

  it('libera DIDs (cliente → nulo) e mostra o número formatado', async () => {
    const ids = (await s.get(`/dids/ids?clientId=${clientId}`)).json().ids;
    const r = await s.post('/dids/bulk', { ids, set: { clientId: null } });
    expect(r.json().affected).toBe(12);
    const first = (await s.get('/dids?pageSize=1')).json().items[0];
    expect(first.numberFormatted).toBe('(71) 3020-1200');
    expect(first.free).toBe(true);
  });

  it('não exclui circuito com DIDs; exclui depois de esvaziar', async () => {
    expect((await s.del(`/circuits/${circuitId}`)).statusCode).toBe(400);
    const ids = (await s.get(`/dids/ids?circuitId=${circuitId}`)).json().ids;
    await s.post('/dids/bulk', { ids, set: { circuitId: null } });
    expect((await s.get('/dids?circuitId=none')).json().total).toBe(50);
    expect((await s.del(`/circuits/${circuitId}`)).statusCode).toBe(200);
  });
});

describe('links de terceiros', () => {
  it('circuito de terceiro e seus DIDs somem das listas até alguém ligar o interruptor', async () => {
    const cliente = (await s.post('/clients', { tradeName: 'Padaria do Zé', legalName: 'Zé Panificadora ME', cnpj: '12.345.678/0001-95' })).json().id;
    const proprio = (await s.post('/circuits', { name: 'Vivo - Padaria', code: '99001', channels: 4, ownerClientId: cliente, thirdParty: true })).json();
    expect(proprio.thirdParty).toBe(true);
    await s.post('/dids/range', { baseNumber: '(71) 4000-0000', quantity: 5, circuitId: proprio.id, clientId: cliente });

    // lista de circuitos: fora por padrão, dentro com o interruptor
    const semTerceiros = (await s.get('/circuits')).json();
    expect(semTerceiros.items.map((c: any) => c.id)).not.toContain(proprio.id);
    expect((await s.get('/circuits?includeThirdParty=true')).json().items.map((c: any) => c.id)).toContain(proprio.id);

    // numeração: idem, e o "selecionar todos os filtrados" segue a mesma regra
    const numeros = (await s.get('/dids?pageSize=500')).json();
    expect(numeros.items.some((d: any) => d.circuitId === proprio.id)).toBe(false);
    const comTerceiros = (await s.get('/dids?pageSize=500&includeThirdParty=true')).json();
    expect(comTerceiros.items.filter((d: any) => d.circuitId === proprio.id)).toHaveLength(5);
    expect(comTerceiros.items.find((d: any) => d.circuitId === proprio.id).thirdParty).toBe(true);
    expect((await s.get('/dids/ids')).json().ids.length).toBeLessThan((await s.get('/dids/ids?includeThirdParty=true')).json().ids.length);

    // os cartões do topo acompanham
    expect((await s.get('/circuits/summary')).json().dids.total).toBe(numeros.total);

    // o painel é o controle da VoiceNet: nem os números nem a inconsistência "DID sem VoiceNet"
    const painel = (await s.get('/dashboard')).json();
    expect(painel.dids.total).toBe(numeros.total);
    expect(painel.circuits.map((c: any) => c.id)).not.toContain(proprio.id);
    expect(painel.alerts.find((a: any) => a.kind === 'did_sem_voicenet')).toBeUndefined();

    // mas na ficha do cliente os números dele aparecem, marcados
    const doCliente = (await s.get(`/clients/${cliente}/dids`)).json();
    expect(doCliente.items).toHaveLength(5);
    expect(doCliente.items[0].thirdParty).toBe(true);
    // e dentro do próprio circuito também
    expect((await s.get(`/circuits/${proprio.id}/dids`)).json().items).toHaveLength(5);
  });
});
