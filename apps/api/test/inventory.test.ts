import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let modelId: string, headsetId: string, clientId: string, devA: string, devB: string, headA: string;
beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const cats = (await s.get('/admin/catalogs/categories')).json();
  modelId = (await s.post('/inventory/models', { code: 'gxp1610', name: 'Grandstream GXP1610', categoryId: cats.find((c: any) => c.name === 'Telefone IP').id })).json().id;
  headsetId = (await s.post('/inventory/models', { code: 'headset', name: 'Headset Genérico', categoryId: cats.find((c: any) => c.name === 'Periférico').id })).json().id;
  clientId = (await s.post('/clients', { tradeName: 'Hospital Vale Verde', legalName: 'Assoc. Vale Verde', cnpj: '33.444.555/0001-81' })).json().id;
  devA = (await s.post('/inventory/devices', { modelId, mac: '00:0b:82:a1:b2:c3', valueCents: 45000 })).json().id;
  devB = (await s.post('/inventory/devices', { modelId, mac: '00-0B-82-A1-B2-C4', valueCents: 45000 })).json().id;
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

  it('aparelho sem MAC: cadastra, não colide com outro sem MAC e aparece como "não aplicável"', async () => {
    headA = (await s.post('/inventory/devices', { modelId: headsetId, valueCents: 9000 })).json().id;
    const outro = await s.post('/inventory/devices', { modelId: headsetId, valueCents: 9000 });
    expect(outro.statusCode).toBe(201); // dois sem MAC convivem
    const d = (await s.get(`/inventory/devices/${headA}`)).json();
    expect(d.mac).toBeNull();
    expect(d.macFormatted).toBe('não aplicável');
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
    expect(devolvido.currentModality).toBeNull();

    const venda = await s.post('/inventory/movements', { modality: 'venda', toClientId: clientId, items: [{ deviceId: devA }] });
    expect(venda.statusCode).toBe(201);
    const sold = (await s.get(`/inventory/devices/${devA}`)).json();
    expect(sold.currentModality).toBe('venda'); // vendido é a modalidade, não a condição
    expect(sold.condition).toBe('ativo');
    expect(sold.clientId).toBe(clientId);
    const again = await s.post('/inventory/movements', { modality: 'devolucao', toClientId: null, items: [{ deviceId: devA }] });
    expect(again.statusCode).toBe(400);
    // vendido sai da lista e das contagens, salvo se pedirem
    const lista = (await s.get(`/inventory/devices?modelId=${modelId}`)).json();
    expect(lista.items.map((x: any) => x.id)).not.toContain(devA);
    expect((await s.get(`/inventory/devices?modelId=${modelId}&includeSold=true`)).json().items.map((x: any) => x.id)).toContain(devA);
    expect((await s.get('/inventory/models')).json().find((m: any) => m.id === modelId).counts).toMatchObject({ inStock: 0, withClients: 1, sold: 1 });

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

  it('a lista de "devolvido por" só traz quem está com aparelho nosso', async () => {
    const outro = (await s.post('/clients', { tradeName: 'Padaria do Zé', legalName: 'Zé Panificadora ME', cnpj: '12.345.678/0001-95' })).json().id;
    const nomes = (await s.get('/clients/options?withDevices=true')).json().map((c: any) => c.id);
    expect(nomes).toContain(clientId);      // está com aparelhos
    expect(nomes).not.toContain(outro);     // não tem nada nosso
  });

  it('devolve do cliente para o estoque também sem MAC, e marca inativo', async () => {
    const ida = await s.post('/inventory/movements', { modality: 'comodato', toClientId: clientId, unit: 'Matriz', items: [{ deviceId: headA }] });
    expect(ida.statusCode).toBe(201);
    expect((await s.get(`/inventory/devices/${headA}`)).json()).toMatchObject({ clientId, currentModality: 'comodato', unit: 'Matriz' });

    const volta = await s.post('/inventory/movements', { modality: 'devolucao', toClientId: null, newCondition: 'inativo', items: [{ deviceId: headA }] });
    expect(volta.statusCode).toBe(201);
    const h = (await s.get(`/inventory/devices/${headA}`)).json();
    expect(h).toMatchObject({ clientId: null, currentModality: null, condition: 'inativo', unit: null });

    const ja = await s.post('/inventory/movements', { modality: 'devolucao', toClientId: null, items: [{ deviceId: headA }] });
    expect(ja.statusCode).toBe(400);
    expect(ja.json().error).toMatch(/já está no estoque/);

    const list = (await s.get('/inventory/movements')).json();
    expect(list.items[0].modalityName).toBe('Devolução');
    expect((await s.get('/inventory/summary')).json().inactive).toBe(1);
  });
});
