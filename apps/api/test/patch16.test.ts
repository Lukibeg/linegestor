/**
 * Patch 1.6 — os pedidos de 30/09 (1009.docx, decisão 0035).
 *
 * O que estes testes seguram:
 *  - o IP da operadora aceita URL (tem operadora que só libera o endereço), e o IP do PBX também
 *  - a busca dos DIDs acha o número OU um pedaço da observação, sem ligar para acento, e o
 *    "selecionar todos os filtrados" conta exatamente os mesmos — é o que a ficha do circuito usa
 *    agora, com o circuito fixo
 *  - a lista de clientes ordena pela ativação do 1º módulo (o mais antigo entre os ligados hoje)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let carrierId: string;
beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  carrierId = (await s.get('/admin/catalogs/carriers')).json()[0].id;
});
afterAll(async () => { await app.close(); });

describe('IP ou URL da operadora', () => {
  it('grava a URL no lugar do IP, ao criar e ao editar', async () => {
    const c = await s.post('/circuits', { name: 'Grupo Vitta', code: '97653', carrierId, channels: 1, authType: 'login', signalingIp: 'sip.operadora.com.br', authUsername: '75097653' });
    expect(c.statusCode).toBe(201);
    expect(c.json().signalingIp).toBe('sip.operadora.com.br');
    const longa = 'https://tronco-voz-empresarial.operadora-de-telefonia.com.br/sip/cliente/97653/registro';
    expect(longa.length).toBeGreaterThan(64);
    const r = await s.patch(`/circuits/${c.json().id}`, { signalingIp: longa });
    expect(r.statusCode).toBe(200);
    expect((await s.get(`/circuits/${c.json().id}`)).json().signalingIp).toBe(longa);
  });

  it('o IP do PBX também aceita endereço', async () => {
    const c = await s.post('/circuits', { name: '071 Antigo', code: '9802603', carrierId, channels: 30, authType: 'ip', signalingIp: '187.72.45.244', authIp: 'sbc.inglinesystems.com.br' });
    expect(c.statusCode).toBe(201);
    expect(c.json().authIp).toBe('sbc.inglinesystems.com.br');
  });
});

describe('busca dos DIDs: número ou observação', () => {
  let circuitId: string;
  let outroCircuito: string;
  beforeAll(async () => {
    circuitId = (await s.post('/circuits', { name: 'Feixe busca', code: '55501', carrierId, channels: 10 })).json().id;
    outroCircuito = (await s.post('/circuits', { name: 'Feixe vizinho', code: '55502', carrierId, channels: 10 })).json().id;
    await s.post(`/circuits/${circuitId}/dids/range`, { baseNumber: '(71) 2101-2500', quantity: 10 });
    await s.post(`/circuits/${outroCircuito}/dids/range`, { baseNumber: '(71) 3014-8500', quantity: 5 });
    const doCircuito = (await s.get(`/dids?circuitId=${circuitId}&pageSize=100`)).json().items;
    const vizinhos = (await s.get(`/dids?circuitId=${outroCircuito}&pageSize=100`)).json().items;
    await s.post('/dids/bulk', { ids: doCircuito.slice(0, 3).map((d: any) => d.id), set: { note: 'Recepção — ramal 200' } });
    await s.post('/dids/bulk', { ids: [vizinhos[0].id], set: { note: 'recepcao do vizinho' } });
  });

  it('acha pela observação sem ligar para acento nem maiúscula', async () => {
    const r = (await s.get(`/dids?q=${encodeURIComponent('RECEPCAO')}&pageSize=100`)).json();
    expect(r.total).toBe(4);
    const noCircuito = (await s.get(`/dids?circuitId=${circuitId}&q=${encodeURIComponent('recepção')}&pageSize=100`)).json();
    expect(noCircuito.total).toBe(3);
    expect(noCircuito.items.every((d: any) => d.note === 'Recepção — ramal 200')).toBe(true);
  });

  it('continua achando pelo número, com ou sem DDD e traço', async () => {
    expect((await s.get(`/dids?circuitId=${circuitId}&q=${encodeURIComponent('(71) 2101-2503')}`)).json().total).toBe(1);
    expect((await s.get(`/dids?circuitId=${circuitId}&q=2101-250`)).json().total).toBe(10);
    // o número do outro circuito não aparece com o circuito fixo
    expect((await s.get(`/dids?circuitId=${circuitId}&q=30148500`)).json().total).toBe(0);
  });

  it('% digitado é texto, não curinga', async () => {
    expect((await s.get(`/dids?q=${encodeURIComponent('%')}`)).json().total).toBe(0);
  });

  it('"selecionar todos os filtrados" conta os mesmos da lista', async () => {
    const ids = (await s.get(`/dids/ids?circuitId=${circuitId}&q=ramal`)).json().ids;
    expect(ids).toHaveLength(3);
  });
});

describe('coluna "1º módulo — ativado em"', () => {
  it('ordena pela ativação do módulo mais antigo, qualquer que seja o produto', async () => {
    const novo = async (nome: string, cnpj: string) => (await s.post('/clients', { tradeName: nome, legalName: `${nome} LTDA`, cnpj })).json().id as string;
    const a = await novo('Alfa Primeiro', '11.222.333/0001-81');
    const b = await novo('Beta Primeiro', '22.333.444/0001-81');
    const c = await novo('Gama Sem Módulo', '55.666.777/0001-81');
    // Alfa: FOP2 em 2025-06 e NPS em 2024-03 → o 1º é o NPS (2024-03)
    await s.put(`/clients/${a}/subscriptions`, { productCode: 'linepbx', activatedAt: '2024-01-10' });
    await s.put(`/clients/${a}/modules`, { productCode: 'linepbx', moduleCode: 'fop2', activatedAt: '2025-06-01' });
    await s.put(`/clients/${a}/modules`, { productCode: 'linepbx', moduleCode: 'nps', activatedAt: '2024-03-01' });
    // Beta: um módulo de 2023 que foi desligado (não conta) e um de 2024-08 ligado
    await s.put(`/clients/${b}/subscriptions`, { productCode: 'linepbx', activatedAt: '2023-01-10' });
    await s.put(`/clients/${b}/modules`, { productCode: 'linepbx', moduleCode: 'fop2', activatedAt: '2023-02-01' });
    await s.del(`/clients/${b}/modules/linepbx/fop2`);
    await s.put(`/clients/${b}/modules`, { productCode: 'linepbx', moduleCode: 'omniboard', activatedAt: '2024-08-01' });
    await s.put(`/clients/${c}/subscriptions`, { productCode: 'linepbx', activatedAt: '2022-01-10' });

    const nomes = async (dir: string) => (await s.get(`/clients?pageSize=100&sort=primeiroModulo&dir=${dir}`)).json().items.map((x: any) => x.tradeName).filter((n: string) => n.includes('Primeiro') || n.includes('Sem Módulo'));
    expect(await nomes('asc')).toEqual(['Alfa Primeiro', 'Beta Primeiro', 'Gama Sem Módulo']);
    // sem módulo vai para o fim nos dois sentidos
    expect(await nomes('desc')).toEqual(['Beta Primeiro', 'Alfa Primeiro', 'Gama Sem Módulo']);
  });
});
