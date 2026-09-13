import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let modelId: string, headsetId: string, clientId: string, devA: string, devB: string;
beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const cats = (await s.get('/admin/catalogs/categories')).json();
  modelId = (await s.post('/inventory/models', { code: 'gxp1610', name: 'Grandstream GXP1610', categoryId: cats.find((c: any) => c.name === 'Telefone IP').id, tracking: 'serializado' })).json().id;
  headsetId = (await s.post('/inventory/models', { code: 'headset', name: 'Headset Genérico', categoryId: cats.find((c: any) => c.name === 'Periférico').id, tracking: 'granel' })).json().id;
  clientId = (await s.post('/clients', { tradeName: 'Hospital Vale Verde', legalName: 'Assoc. Vale Verde', cnpj: '33.444.555/0001-81' })).json().id;
  devA = (await s.post('/inventory/devices', { modelId, mac: '00:0b:82:a1:b2:c3', tag: 'N001', valueCents: 45000 })).json().id;
  devB = (await s.post('/inventory/devices', { modelId, mac: '00-0B-82-A1-B2-C4', tag: 'N002', valueCents: 45000 })).json().id;
});
afterAll(async () => { await app.close(); });

describe('inventário', () => {
  it('normaliza o MAC e recusa duplicado', async () => {
    const d = (await s.get(`/inventory/devices/${devA}`)).json();
    expect(d.mac).toBe('000B82A1B2C3');
    expect(d.macFormatted).toBe('00:0B:82:A1:B2:C3');
    const dup = await s.post('/inventory/devices', { modelId, mac: '000B82A1B2C3' });
    expect(dup.statusCode).toBe(400);
  });

  it('não movimenta para cliente sem o produto Equipamentos', async () => {
    const r = await s.post('/inventory/movements', { modality: 'locacao', toClientId: clientId, items: [{ deviceId: devA }] });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/Equipamentos/);
  });

  it('loca, registra o autor, devolve e vende', async () => {
    await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'equipamentos' });
    const loc = await s.post('/inventory/movements', { modality: 'locacao', toClientId: clientId, unit: 'Loja Simões Filho', items: [{ deviceId: devA }, { deviceId: devB }] });
    expect(loc.statusCode).toBe(201);
    expect(loc.json().quantity).toBe(2);
    const d = (await s.get(`/inventory/devices/${devA}`)).json();
    expect(d.clientId).toBe(clientId);
    expect(d.currentModality).toBe('locacao');
    expect(d.unit).toBe('Loja Simões Filho');
    expect((await s.get('/inventory/units')).json()).toContain('Loja Simões Filho');
    expect(d.history[0].userName).toBe('Administrador');
    const models = (await s.get('/inventory/models')).json();
    expect(models.find((m: any) => m.id === modelId).counts).toMatchObject({ inStock: 0, withClients: 2 });

    const dev = await s.post('/inventory/movements', { modality: 'devolucao', toClientId: null, items: [{ deviceId: devA }] });
    expect(dev.statusCode).toBe(201);
    const devolvido = (await s.get(`/inventory/devices/${devA}`)).json();
    expect(devolvido.clientId).toBeNull();
    expect(devolvido.unit).toBeNull(); // volta pro estoque: a unidade some

    const venda = await s.post('/inventory/movements', { modality: 'venda', toClientId: clientId, items: [{ deviceId: devA }], valueCents: 39000 });
    expect(venda.statusCode).toBe(201);
    const sold = (await s.get(`/inventory/devices/${devA}`)).json();
    expect(sold.condition).toBe('vendido');
    expect(sold.clientId).toBe(clientId);
    const again = await s.post('/inventory/movements', { modality: 'devolucao', toClientId: null, items: [{ deviceId: devA }] });
    expect(again.statusCode).toBe(400);
    const painel = (await s.get('/dashboard')).json();
    expect(painel.devices.withClients).toBe(1);
    expect(painel.devices.valueWithClientsCents).toBe(45000);

    // os cartões do topo do Inventário seguem os filtros da lista
    const geral = (await s.get('/inventory/summary')).json();
    expect(geral).toMatchObject({ withClients: 1, filtrado: false });
    const soEstoque = (await s.get('/inventory/summary?clientId=stock')).json();
    expect(soEstoque).toMatchObject({ withClients: 0, filtrado: true });
    const porModelo = (await s.get(`/inventory/summary?modelId=${modelId}`)).json();
    expect(porModelo.withClients).toBe(1);
  });

  it('granel: entrada no estoque, saída para cliente, saldo insuficiente', async () => {
    const r = await s.post('/inventory/stock/adjust', { modelId: headsetId, delta: 10 });
    expect(r.statusCode).toBe(200);
    const mov = await s.post('/inventory/movements', { modality: 'comodato', toClientId: clientId, items: [{ modelId: headsetId, quantity: 4 }] });
    expect(mov.statusCode).toBe(201);
    const stock = (await s.get('/inventory/stock')).json();
    expect(stock.find((x: any) => x.clientId === null).quantity).toBe(6);
    expect(stock.find((x: any) => x.clientId === clientId).quantity).toBe(4);
    const too = await s.post('/inventory/movements', { modality: 'locacao', toClientId: clientId, items: [{ modelId: headsetId, quantity: 7 }] });
    expect(too.statusCode).toBe(400);
    expect(too.json().error).toMatch(/Saldo insuficiente/);
    const back = await s.post('/inventory/movements', { modality: 'devolucao', toClientId: null, items: [{ modelId: headsetId, quantity: 3, fromClientId: clientId }] });
    expect(back.statusCode).toBe(201);
    const list = (await s.get('/inventory/movements')).json();
    expect(list.total).toBe(5);
    expect(list.items[0].modalityName).toBe('Devolução');
  });
});
