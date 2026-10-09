/**
 * Patch 1.9 (decisão 0041): os Relatórios do Inventário. As contas em si estão testadas em
 * `packages/shared/src/inventario.test.ts`; aqui se confere que o servidor lê o banco do jeito que
 * elas esperam — cliente arquivado, na lixeira, sem o Equipamentos, a devolução inativa, a rede e o
 * login padrão — e que quem vê o inventário vê os relatórios.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
const id: Record<string, string> = {};

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const cats = (await s.get('/admin/catalogs/categories')).json();
  const cat = (nome: string) => cats.find((c: any) => c.name === nome).id;
  id.gx = (await s.post('/inventory/models', { code: 'gxp1610', name: 'Grandstream GXP1610', categoryId: cat('Telefone IP'), valueCents: 45000 })).json().id;
  id.hs = (await s.post('/inventory/models', { code: 'headset', name: 'Headset Genérico', categoryId: cat('Periférico'), valueCents: 9000 })).json().id;
  id.dp = (await s.post('/inventory/models', { code: 'dp722', name: 'Grandstream DP722', categoryId: cat('Telefone IP') })).json().id;

  const cliente = async (chave: string, tradeName: string, cnpj: string, produtos: string[]) => {
    id[chave] = (await s.post('/clients', { tradeName, legalName: `${tradeName} Ltda`, cnpj })).json().id;
    for (const p of produtos) expect((await s.put(`/clients/${id[chave]}/subscriptions`, { productCode: p })).statusCode).toBe(200);
  };
  await cliente('hosp', 'Hospital Vale Verde', '11.222.333/0001-81', ['equipamentos', 'linepbx']);
  await cliente('clin', 'Clínica Aurora', '22.333.444/0001-81', ['equipamentos']);
  await cliente('lixo', 'Lixo Telecom', '55.666.777/0001-81', ['equipamentos']);
  await cliente('semeq', 'Sem Equipamentos', '33.444.555/0001-81', ['equipamentos', 'linepbx']);

  const aparelho = async (chave: string, d: Record<string, unknown>) => { id[chave] = (await s.post('/inventory/devices', d)).json().id; };
  await aparelho('gA', { modelId: id.gx, mac: '00:0B:82:00:00:01' });
  await aparelho('gB', { modelId: id.gx, mac: '00:0B:82:00:00:02' });
  await aparelho('gC', { modelId: id.gx, mac: '00:0B:82:00:00:03' });
  await aparelho('gD', { modelId: id.gx, mac: '00:0B:82:00:00:04' });
  await aparelho('gE', { modelId: id.gx, mac: '00:0B:82:00:00:05' });
  await aparelho('gSem', { modelId: id.gx, note: 'código antigo: N/S N004' });
  await aparelho('h1', { modelId: id.hs });
  await aparelho('h2', { modelId: id.hs });
  await aparelho('d1', { modelId: id.dp, serialNumber: '36103G782A' });

  const mover = async (d: Record<string, unknown>) => expect((await s.post('/inventory/movements', d)).statusCode).toBe(201);
  await mover({ modality: 'locacao', toClientId: id.hosp, items: [{ deviceId: id.gA }, { deviceId: id.gB }, { deviceId: id.gC }] });
  await mover({ modality: 'devolucao', toClientId: null, newCondition: 'inativo', items: [{ deviceId: id.gC }] });
  await mover({ modality: 'comodato', toClientId: id.clin, items: [{ deviceId: id.gD }, { deviceId: id.h1 }] });
  await mover({ modality: 'comodato', toClientId: id.lixo, items: [{ deviceId: id.d1 }] });
  await mover({ modality: 'locacao', toClientId: id.semeq, items: [{ deviceId: id.gE }] });

  // o Hospital tem o "como configurar" completo; os outros saem da base de três jeitos
  expect((await s.put(`/clients/${id.hosp}/network`, { ipAddress: '10.0.0.10', subnetMask: '255.255.255.0', defaultRouter: '10.0.0.1' })).statusCode).toBe(200);
  expect((await s.put(`/clients/${id.hosp}/device-logins`, { modelId: id.gx, username: 'admin' })).statusCode).toBe(200);
  expect((await s.patch(`/clients/${id.clin}`, { archived: true })).statusCode).toBe(200);
  expect((await s.del(`/clients/${id.lixo}`)).statusCode).toBe(200);
  expect((await s.del(`/clients/${id.semeq}/subscriptions/equipamentos`)).statusCode).toBe(200);
});
afterAll(async () => { await app.close(); });

describe('Inventário › Relatórios', () => {
  it('lê o banco: quem tem o quê (com a marca de quem saiu da base), a prateleira e o valor', async () => {
    const res = await s.get('/inventory/relatorios');
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.aparelhos).toHaveLength(9);
    // empate no total: em ordem de nome
    expect(r.quemTem.linhas.map((l: any) => [l.nome, l.total])).toEqual([['Clínica Aurora', 2], ['Hospital Vale Verde', 2], ['Lixo Telecom', 1], ['Sem Equipamentos', 1]]);
    expect(r.quemTem.linhas[1]).toMatchObject({ locacao: 2, valorCents: 90000, foraDaBase: null });
    expect(r.quemTem.linhas[0]).toMatchObject({ comodato: 2, foraDaBase: 'arquivado' });
    expect(r.quemTem.estoque.total).toBe(3);

    // quem saiu da base fica marcado: na lixeira, arquivado, sem o Equipamentos
    expect(r.quemTem.linhas.map((l: any) => [l.nome, l.foraDaBase])).toEqual([['Clínica Aurora', 'arquivado'], ['Hospital Vale Verde', null], ['Lixo Telecom', 'lixeira'], ['Sem Equipamentos', 'sem_equipamentos']]);
    expect(r.recolher).toBeUndefined(); // o "Para recolher" saiu na prévia (09/10)

    expect(r.prateleira.totais).toMatchObject({ ativos: 2, inativos: 1 });
    expect(r.prateleira.ritmoConfiavel).toBe(false); // o histórico começou hoje
    const parte = (p: string) => r.valor.partes.find((x: any) => x.id === p);
    expect(parte('locacao')).toMatchObject({ n: 3, valorCents: 135000 });
    expect(parte('comodato')).toMatchObject({ n: 3, valorCents: 54000 });
    expect(parte('estoque_inativo')).toMatchObject({ n: 1, valorCents: 45000 });
    expect(r.valor.semValor).toBe(1); // o DP722, sem valor no modelo
  });

  it('a devolução inativa, o N/S na anotação e o "como configurar" do cliente', async () => {
    const r = (await s.get('/inventory/relatorios')).json();
    expect(r.vaiEVolta.totais).toEqual({ saidas: 7, devolucoes: 1, voltaramInativos: 1, transferencias: 0 });
    expect(r.vaiEVolta.ultimas[0]).toMatchObject({ cliente: 'Hospital Vale Verde', n: 1, inativos: 1 });
    const item = (i: string) => r.cadastro.itens.find((x: any) => x.id === i);
    expect(item('id_na_anotacao').aparelhos).toEqual([{ id: id.gSem, dica: 'N/S na anotação: N004' }]);
    expect(item('modelo_sem_valor').modelos).toEqual([{ id: id.dp, nome: 'Grandstream DP722', aparelhos: 1 }]);
    // o Hospital tem rede e login; os outros saíram da base e não contam aqui
    expect(item('sem_login').n).toBe(0);
    expect(item('sem_rede').n).toBe(0);
    // a relação do cliente usa a lista de clientes que vem junto, com as unidades
    const hosp = r.clientes.find((c: any) => c.id === id.hosp);
    expect(hosp).toMatchObject({ nome: 'Hospital Vale Verde', cnpj: '11222333000181', naLixeira: false });
    expect(hosp.unidades.map((u: any) => u.nome)).toEqual(['Matriz']);
    expect(r.clientes.find((c: any) => c.id === id.lixo).naLixeira).toBe(true);
  });

  it('quem vê o inventário vê os relatórios; sem sessão, não', async () => {
    const leitor = (await s.get('/admin/roles')).json().find((p: any) => p.key === 'leitor');
    expect((await s.post('/admin/users', { name: 'Leitor do Inventário', email: 'leitorinv@gestor.local', password: 'SenhaDeTeste!123', roleId: leitor.id })).statusCode).toBe(201);
    const outro = new Session(app);
    await outro.login('leitorinv@gestor.local', 'SenhaDeTeste!123');
    expect((await outro.get('/inventory/relatorios')).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/inventory/relatorios' })).statusCode).toBe(401);
  });
});
