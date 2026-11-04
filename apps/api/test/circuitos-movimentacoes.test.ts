/**
 * Patch 2.4.1 — as movimentações dos circuitos e dos DIDs (o Luan, em 03/11: "eu quero q dentro de circuitos tenha uma aba,
 * movimentações onde qualquer alteração nos circuitos, dids novos, alterados, circuito novo, etc fique registrada").
 *  - cada mudança vira uma linha: o circuito novo, alterado (só quando muda), na lixeira e restaurado; os DIDs novos, o DID
 *    alterado, a edição em massa (cada número com o antes e o depois), a lixeira, o restaurar (também pela Lixeira) e a
 *    importação da planilha;
 *  - a senha do tronco nunca aparece: só "definida" ou "trocada";
 *  - os filtros (o circuito, o tipo, quem, o período e a busca pelo número ou pela frase);
 *  - a migração 0033 traz o que a auditoria já guardava.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { circuitMovements } from '@gestor/db';
import type { MovimentacaoDoCircuito, PaginaDeMovimentacoes } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let carrierId = '';
let aurora = '';
let valeVerde = '';
let circuito = '';
let outro = '';
let adminId = '';

const movs = async (q: Record<string, string> = {}): Promise<PaginaDeMovimentacoes> => {
  const r = await s.get(`/circuits/movimentacoes?${new URLSearchParams({ pageSize: '200', ...q })}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const ultima = async (): Promise<MovimentacaoDoCircuito> => (await movs()).items[0]!;
const didsDo = async (id: string) => (await s.get(`/circuits/${id}/dids?pageSize=100`)).json().items as Array<{ id: string; number: string }>;
const hojeEmBrasilia = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  adminId = (await s.login()).id;
  carrierId = (await s.get('/admin/catalogs/carriers')).json()[0].id;
  aurora = (await s.post('/clients', { tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora LTDA', cnpj: '11.222.333/0001-81' })).json().id;
  valeVerde = (await s.post('/clients', { tradeName: 'Hospital Vale Verde', legalName: 'Hospital Vale Verde SA', cnpj: '22.333.444/0001-81' })).json().id;
});
afterAll(async () => { await app.close(); });

describe('as movimentações dos circuitos (2.4.1)', () => {
  it('o circuito novo e o alterado (só quando muda); a senha só como definida ou trocada', async () => {
    const c = await s.post('/circuits', { name: 'Algar SIP 01', code: '70001', carrierId, channels: 10, authType: 'login', signalingIp: 'sip.algar.com.br', authUsername: 'tr70001', authPassword: 'senha-de-teste-1' });
    expect(c.statusCode, c.body).toBe(201);
    circuito = c.json().id;
    const criado = await ultima();
    expect(criado).toMatchObject({ tipo: 'circuito_criado', tipoNome: 'Circuito novo', resumo: 'Criou o circuito Algar SIP 01', quem: { id: adminId }, circuitos: [{ id: circuito, nome: 'Algar SIP 01', existe: true }] });
    expect(criado.campos).toEqual(expect.arrayContaining([{ campo: 'Canais', antes: null, depois: '10' }, { campo: 'Senha do tronco', antes: null, depois: 'definida' }]));
    expect(JSON.stringify(criado)).not.toContain('senha-de-teste');

    await s.patch(`/circuits/${circuito}`, { channels: 30, authPassword: 'senha-de-teste-2' });
    const alterado = await ultima();
    expect(alterado).toMatchObject({ tipo: 'circuito_editado', resumo: 'Alterou o circuito Algar SIP 01: canais e senha do tronco' });
    expect(alterado.campos).toEqual([{ campo: 'Canais', antes: '10', depois: '30' }, { campo: 'Senha do tronco', antes: null, depois: 'trocada' }]);
    expect(JSON.stringify(await movs())).not.toContain('senha-de-teste');
    // salvar sem mexer em nada não vira movimentação
    const antes = (await movs()).total;
    await s.patch(`/circuits/${circuito}`, { channels: 30 });
    expect((await movs()).total).toBe(antes);
  });

  it('os DIDs: a faixa, o DID alterado, a edição em massa, a lixeira e o restaurar', async () => {
    const r = await s.post(`/circuits/${circuito}/dids/range`, { baseNumber: '(71) 2101-2500', quantity: 5 });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toEqual({ created: 5, first: '7121012500', last: '7121012504' });
    const faixa = await ultima();
    expect(faixa).toMatchObject({ tipo: 'dids_criados', resumo: 'Criou 5 DIDs ((71) 2101-2500 a (71) 2101-2504) no circuito Algar SIP 01', totalDeNumeros: 5 });
    expect(faixa.numeros[0]).toBe('(71) 2101-2500');
    const ds = await didsDo(circuito);

    await s.patch(`/dids/${ds[0]!.id}`, { clientId: aurora });
    const um = await ultima();
    expect(um).toMatchObject({ tipo: 'did_editado', resumo: 'Atribuiu o DID (71) 2101-2500 a Clínica Aurora', numeros: ['(71) 2101-2500'] });
    expect(um.porDid).toEqual([{ numero: '(71) 2101-2500', campos: [{ campo: 'Cliente', antes: 'livre', depois: 'Clínica Aurora' }] }]);

    // em massa: os três primeiros para o Vale Verde (o da Aurora passa; os livres são atribuídos)
    await s.post('/dids/bulk', { ids: ds.slice(0, 3).map((d) => d.id), set: { clientId: valeVerde } });
    const massa = await ultima();
    expect(massa.tipo).toBe('dids_editados');
    expect(massa.resumo).toBe('Alterou 3 DID(s): cliente → Hospital Vale Verde');
    expect(massa.porDid.map((d) => [d.numero, d.campos.map((c) => `${c.campo}: ${c.antes} → ${c.depois}`)])).toEqual([
      ['(71) 2101-2500', ['Cliente: Clínica Aurora → Hospital Vale Verde']],
      ['(71) 2101-2501', ['Cliente: livre → Hospital Vale Verde']],
      ['(71) 2101-2502', ['Cliente: livre → Hospital Vale Verde']],
    ]);

    await s.post('/dids/bulk-delete', { ids: [ds[3]!.id, ds[4]!.id] });
    expect(await ultima()).toMatchObject({ tipo: 'dids_lixeira', resumo: 'Mandou 2 DIDs para a lixeira', numeros: ['(71) 2101-2503', '(71) 2101-2504'], circuitos: [{ id: circuito }] });
    // o restaurar pela Lixeira da Administração também conta
    expect((await s.post(`/admin/trash/did/${ds[4]!.id}/restore`, {})).statusCode).toBe(200);
    expect(await ultima()).toMatchObject({ tipo: 'did_restaurado', resumo: 'Restaurou o DID (71) 2101-2504' });
  });

  it('o DID que troca de circuito aparece nos dois; os filtros e a busca', async () => {
    outro = (await s.post('/circuits', { name: 'Vivo E1 02', code: '70002', carrierId, channels: 30 })).json().id;
    const ds = await didsDo(circuito);
    await s.patch(`/dids/${ds[1]!.id}`, { circuitId: outro });
    const troca = await ultima();
    expect(troca.resumo).toBe('Levou o DID (71) 2101-2501 para o circuito Vivo E1 02');
    expect(troca.circuitos.map((c) => c.nome)).toEqual(['Algar SIP 01', 'Vivo E1 02']);

    const doOutro = await movs({ circuitId: outro });
    expect(doOutro.items.map((m) => m.tipo)).toEqual(['did_editado', 'circuito_criado']);
    expect((await movs({ circuitId: circuito })).items.map((m) => m.tipo)).toEqual([
      'did_editado', 'did_restaurado', 'dids_lixeira', 'dids_editados', 'did_editado', 'dids_criados', 'circuito_editado', 'circuito_criado',
    ]);
    expect((await movs({ tipo: 'circuitos' })).items.every((m) => m.tipo.startsWith('circuito_'))).toBe(true);
    expect((await movs({ tipo: 'dids_lixeira' })).total).toBe(1);
    // o número: com ou sem a máscara, um pedaço basta
    expect((await movs({ q: '2101-2500' })).items.map((m) => m.tipo)).toEqual(['dids_editados', 'did_editado', 'dids_criados']);
    expect((await movs({ q: '(71) 2101-2504' })).items.map((m) => m.tipo)).toEqual(['did_restaurado', 'dids_lixeira', 'dids_criados']);
    // a frase, sem acento
    expect((await movs({ q: 'clinica aurora' })).items.map((m) => m.tipo)).toEqual(['did_editado']);
    expect((await movs({ userId: adminId })).total).toBe((await movs()).total);
    expect((await movs()).pessoas).toEqual([{ id: adminId, nome: expect.any(String) }]);
    const hoje = hojeEmBrasilia();
    expect((await movs({ de: hoje, ate: hoje })).total).toBe((await movs()).total);
    expect((await movs({ ate: '2026-01-01' })).total).toBe(0);
    // o link de terceiro fica de fora sem o interruptor (decisão 0020); com ele, ou pelo circuito, aparece
    const terceiro = (await s.post('/circuits', { name: 'Vivo do cliente', code: '70009', carrierId, channels: 2, thirdParty: true })).json().id;
    expect((await movs()).items.some((m) => m.circuitos.some((c) => c.id === terceiro))).toBe(false);
    expect((await movs({ incluirTerceiros: 'true' })).items[0]!.circuitos[0]!.id).toBe(terceiro);
    expect((await movs({ circuitId: terceiro })).total).toBe(1);
    // a página e o "Ver tudo"
    const p = await movs({ pageSize: '3', page: '2' });
    expect(p.items).toHaveLength(3);
    expect(p.total).toBe((await movs()).total);
  });

  it('a importação da planilha, e o circuito na lixeira', async () => {
    const csv = 'numero,circuito,cliente,observacao\n(71) 3172-1150,70002,11.222.333/0001-81,principal\n7131721151,70002,livre,';
    const r = await s.post('/data/import/apply', { entity: 'dids', csv, delimiter: ',' });
    expect(r.statusCode, r.body).toBe(200);
    expect(await ultima()).toMatchObject({ tipo: 'importacao', resumo: 'Importou a planilha de DIDs: 2 novo(s), 0 alterado(s)', numeros: ['(71) 3172-1150', '(71) 3172-1151'], circuitos: [{ id: outro }] });

    const vazio = (await s.post('/circuits', { name: 'Sobra', code: '70003', carrierId, channels: 1 })).json().id;
    await s.del(`/circuits/${vazio}`);
    expect(await ultima()).toMatchObject({ tipo: 'circuito_lixeira', resumo: 'Mandou o circuito Sobra para a lixeira', circuitos: [{ id: vazio, existe: false }] });
    await s.post(`/circuits/${vazio}/restore`, {});
    expect(await ultima()).toMatchObject({ tipo: 'circuito_restaurado', circuitos: [{ id: vazio, existe: true }] });
  });

  it('a migração 0033 traz o que a auditoria já guardava', async () => {
    const insercao = readFileSync(new URL('../../../packages/db/drizzle/0033_movimentacoes_dos_circuitos.sql', import.meta.url), 'utf8')
      .split('--> statement-breakpoint').map((x) => x.trim()).find((x) => x.includes('INSERT INTO "circuit_movements"'))!;
    const total = (await movs()).total;
    await app.db.delete(circuitMovements);
    await app.db.execute(sql.raw(insercao));
    const veio = await movs();
    // a auditoria tem uma linha a mais: o salvar sem mudança do circuito (que hoje não vira movimentação)
    expect(veio.total).toBe(total + 1);
    const tipos = veio.items.map((m) => m.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['circuito_criado', 'circuito_editado', 'dids_criados', 'did_editado', 'dids_editados', 'dids_lixeira', 'did_restaurado', 'importacao', 'circuito_lixeira', 'circuito_restaurado']));
    const faixa = veio.items.find((m) => m.tipo === 'dids_criados')!;
    expect(faixa).toMatchObject({ resumo: 'Criou 5 DIDs ((71) 2101-2500 a (71) 2101-2504) no circuito Algar SIP 01', totalDeNumeros: 5, circuitos: [{ id: circuito }] });
    const atribuiu = veio.items.filter((m) => m.tipo === 'did_editado').at(-1)!;
    expect(atribuiu.campos).toEqual([{ campo: 'Cliente', antes: 'livre', depois: 'Clínica Aurora' }]);
    expect(atribuiu.numeros).toEqual(['(71) 2101-2500']);
    const canais = veio.items.filter((m) => m.tipo === 'circuito_editado').at(-1)!;
    expect(canais.campos).toEqual([{ campo: 'Canais', antes: '10', depois: '30' }]);
    expect(veio.items.find((m) => m.tipo === 'importacao')!.resumo).toBe('Importou a planilha de DIDs: 2 novo(s), 0 alterado(s)');
    // de novo, nada se repete
    await app.db.execute(sql.raw(insercao));
    expect((await movs()).total).toBe(veio.total);
  });
});
