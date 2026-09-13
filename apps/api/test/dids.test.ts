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
