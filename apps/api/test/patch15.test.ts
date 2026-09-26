/**
 * Patch 1.5 — os pedidos de 26/09 ("Ter a opção de cruzar dados.docx", segunda leva).
 *
 * O que estes testes seguram (a senha do usuário padrão do FOP2 está em rodada23; a conferência
 * dos excluídos no LineChat, em chamados):
 *  - a data de desativação de produto e de módulo se corrige sem reativar nada, e não aceita dia
 *    antes da ativação nem no futuro
 *  - o DID troca de cliente numa linha só, e a marca de uso cai (entra "não usado" no novo)
 *  - o módulo se edita (nome e descrição) e vai para a lixeira: some da Administração e da ficha do
 *    cliente, a ligação fica guardada e volta com ele; FOP2 e Omniboard não vão; código de módulo na
 *    lixeira não se reaproveita sem querer
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let clientId: string;
let outroId: string;
beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  clientId = (await s.post('/clients', { tradeName: 'Clínica Olhar Bem', legalName: 'Clínica Olhar Bem LTDA', cnpj: '11.222.333/0001-81' })).json().id;
  outroId = (await s.post('/clients', { tradeName: 'Consef Ábaco', legalName: 'Consef Ábaco LTDA', cnpj: '22.333.444/0001-81' })).json().id;
});
afterAll(async () => { await app.close(); });

const dia = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const linepbx = (ficha: any) => ficha.subscriptions.find((x: any) => x.productCode === 'linepbx');

describe('data de desativação de produto e módulo', () => {
  it('o produto encerrado tem a data corrigida e continua encerrado', async () => {
    await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'voicenet', activatedAt: '2025-03-10' });
    await s.del(`/clients/${clientId}/subscriptions/voicenet`);
    const r = await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'voicenet', deactivatedAt: '2026-08-31' });
    expect(r.statusCode).toBe(200);
    const vn = r.json().subscriptions.find((x: any) => x.productCode === 'voicenet');
    expect(vn.active).toBe(false);
    expect(dia(vn.deactivatedAt)).toBe('2026-08-31');
    // a ativação não mudou
    expect(dia(vn.activatedAt)).toBe('2025-03-10');
  });

  it('não aceita desativação antes da ativação nem no futuro', async () => {
    const antes = await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'voicenet', deactivatedAt: '2025-01-01' });
    expect(antes.statusCode).toBe(400);
    expect(antes.json().error).toContain('antes da ativação');
    const futuro = await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'voicenet', deactivatedAt: '2099-01-01' });
    expect(futuro.statusCode).toBe(400);
    expect(futuro.json().error).toContain('futuro');
  });

  it('o módulo desativado tem a data corrigida, dentro de um produto ativo', async () => {
    await s.put(`/clients/${clientId}/subscriptions`, { productCode: 'linepbx', activatedAt: '2025-02-01' });
    await s.put(`/clients/${clientId}/modules`, { productCode: 'linepbx', moduleCode: 'nps', activatedAt: '2025-04-01' });
    await s.del(`/clients/${clientId}/modules/linepbx/nps`);
    const r = await s.put(`/clients/${clientId}/modules`, { productCode: 'linepbx', moduleCode: 'nps', deactivatedAt: '2026-01-15' });
    expect(r.statusCode).toBe(200);
    const nps = linepbx(r.json()).modules.find((m: any) => m.moduleCode === 'nps');
    expect(nps.active).toBe(false);
    expect(dia(nps.deactivatedAt)).toBe('2026-01-15');
    expect(dia(nps.activatedAt)).toBe('2025-04-01');
  });
});

describe('DID: trocar o cliente numa linha só', () => {
  it('passar para outro cliente derruba a marca de uso; liberar também', async () => {
    const carriers = (await s.get('/admin/catalogs/carriers')).json();
    const circ = (await s.post('/circuits', { name: 'Feixe 1.5', code: 'P15-1', carrierId: carriers[0].id, channels: 10 })).json();
    await s.post(`/circuits/${circ.id}/dids/range`, { baseNumber: '(71) 3333-1500', quantity: 2, clientId });
    const lista = (await s.get(`/dids?circuitId=${circ.id}`)).json().items;
    const did = lista[0];
    await s.patch(`/dids/${did.id}`, { inUse: true });
    const trocado = (await s.patch(`/dids/${did.id}`, { clientId: outroId })).json();
    expect(trocado.clientId).toBe(outroId);
    expect(trocado.inUse).toBe(false);
    const livre = (await s.patch(`/dids/${did.id}`, { clientId: null })).json();
    expect(livre.clientId).toBeNull();
    const auditoria = (await s.get('/admin/audit?entityType=did')).json();
    expect(auditoria.items.length).toBeGreaterThan(0);
  });
});

describe('módulos: editar e mandar para a lixeira', () => {
  const produto = async () => (await s.get('/admin/products')).json().find((p: any) => p.code === 'linepbx');

  it('edita nome e descrição sem mudar o código, e diz quantos clientes usam', async () => {
    await s.put(`/clients/${clientId}/modules`, { productCode: 'linepbx', moduleCode: 'nps' });
    const p = await produto();
    const r = await s.put(`/admin/products/${p.id}/modules`, { code: 'nps', name: 'Pesquisa NPS', description: 'Nota de 0 a 10 no fim da ligação.' });
    expect(r.statusCode).toBe(200);
    const nps = (await produto()).modules.find((m: any) => m.code === 'nps');
    expect(nps).toMatchObject({ name: 'Pesquisa NPS', description: 'Nota de 0 a 10 no fim da ligação.', activeClients: 1, protegido: false });
    expect((await produto()).modules.find((m: any) => m.code === 'fop2').protegido).toBe(true);
  });

  it('FOP2 e Omniboard não vão para a lixeira', async () => {
    const p = await produto();
    const fop2 = p.modules.find((m: any) => m.code === 'fop2');
    const r = await s.del(`/admin/products/${p.id}/modules/${fop2.id}`);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toContain('não pode ir para a lixeira');
  });

  it('na lixeira, some da Administração e da ficha; o código não se reaproveita; restaurar traz a ligação de volta', async () => {
    const p = await produto();
    const nps = p.modules.find((m: any) => m.code === 'nps');
    const r = await s.del(`/admin/products/${p.id}/modules/${nps.id}`);
    expect(r.statusCode).toBe(200);
    expect((await produto()).modules.some((m: any) => m.code === 'nps')).toBe(false);
    expect(linepbx((await s.get(`/clients/${clientId}`)).json()).modules.some((m: any) => m.moduleCode === 'nps')).toBe(false);
    expect((await s.get('/admin/audit?action=delete')).body).toContain('Pesquisa NPS');

    // criar outro com o mesmo código avisa que ele está na lixeira
    const dup = await s.put(`/admin/products/${p.id}/modules`, { code: 'nps', name: 'NPS de novo' });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error).toContain('está na lixeira');
    // e ligar no cliente também não dá
    expect((await s.put(`/clients/${clientId}/modules`, { productCode: 'linepbx', moduleCode: 'nps' })).statusCode).toBe(404);

    const lixeira = (await s.get('/admin/trash')).json();
    const item = lixeira.find((x: any) => x.type === 'productModule');
    expect(item.label).toBe('LinePBX › Pesquisa NPS');
    expect((await s.post(`/admin/trash/productModule/${item.id}/restore`)).statusCode).toBe(200);
    const volta = linepbx((await s.get(`/clients/${clientId}`)).json()).modules.find((m: any) => m.moduleCode === 'nps');
    expect(volta.active).toBe(true);
  });
});
