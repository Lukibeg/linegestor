/**
 * Patch 2.4.1 — a Ativação dos módulos volta (o Luan, em 03/11: "gostaria de retroceder uma questão" — "Que ela volte").
 *  - o modelo Implantação volta a criar o checklist dos módulos na Configuração, de cada produto (os 19 campos);
 *  - a migração 0032 traz de volta os checklists que a 0031 excluiu, mas não o que alguém excluiu pela tela, nem o que teria o
 *    nome de um campo que já existe no painel.
 *
 * E as Condições especiais (o nome novo das condições combinadas): sem o "de", o desconto sem prazo, o desconto na ativação e o
 * que foi guardado no formato do 2.4 lido do mesmo jeito.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { products, tickets } from '@gestor/db';
import type { CampoPersonalizado, FichaChamado, OpcoesAtendimento, Painel } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;
const produto: Record<string, string> = {};

const migracao = (nome: string) =>
  readFileSync(new URL(`../../../packages/db/drizzle/${nome}`, import.meta.url), 'utf8').split('--> statement-breakpoint').map((x) => x.trim()).filter(Boolean);
/** O que a 0031 fez com os checklists (sem o ALTER, que o banco de teste já tem). */
const a0031 = () => migracao('0031_excluir_campos_e_condicoes.sql').filter((x) => x.includes('follows_field_id') && !x.startsWith('ALTER'));
const rodar = async (comandos: string[]) => { for (const c of comandos) await app.db.execute(sql.raw(c)); };

const novoPainel = async (nome: string, sigla: string): Promise<Painel> => {
  const r = await s.post('/atendimento/paineis', { nome, sigla, descricao: '', cor: 'turquesa', tipo: 'gestao', ajustes: {}, modelo: 'implantacao' });
  expect(r.statusCode, r.body).toBe(201);
  return r.json();
};
const camposDe = async (p: Painel): Promise<CampoPersonalizado[]> => ((await s.get('/atendimento/opcoes')).json() as OpcoesAtendimento).campos.filter((c) => c.painelId === p.id);
const checklists = async (p: Painel) => (await camposDe(p)).filter((c) => c.nome === 'Ativação dos módulos').map((c) => [c.produtoId, c.parte, !!c.escolhidosEm]);

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  for (const p of await app.db.select({ id: products.id, code: products.code }).from(products)) produto[p.code] = p.id;
});
afterAll(async () => { await esperarSegundoPlano(); await app.close(); });

describe('a Ativação dos módulos de volta (2.4.1)', () => {
  it('o modelo cria de novo o checklist de cada produto, na Configuração, seguindo o Módulos a ativar', async () => {
    const p = await novoPainel('Implantação', 'imp');
    expect(await camposDe(p)).toHaveLength(19);
    expect(await checklists(p)).toEqual([[produto.linechat, 'Configuração', true], [produto.linepbx, 'Configuração', true]]);
  });

  it('a migração 0032 traz de volta o que a 0031 excluiu, mas não o excluído pela tela nem o nome repetido', async () => {
    const a = await novoPainel('Implantação A', 'ima');
    const b = await novoPainel('Implantação B', 'imb');
    const c = await novoPainel('Implantação C', 'imc');
    // no B, alguém excluiu pela tela o checklist do LinePBX (antes do 2.4.1)
    const doPbx = (await camposDe(b)).find((x) => x.nome === 'Ativação dos módulos' && x.produtoId === produto.linepbx)!;
    expect((await s.del(`/atendimento/campos/${doPbx.id}`)).statusCode).toBe(200);
    // o 2.4 (a 0031) exclui os checklists de todos
    await rodar(a0031());
    for (const p of [a, b, c]) expect(await checklists(p)).toEqual([]);
    // no C, depois disso, alguém criou um campo com o mesmo nome no LineChat
    const mesmoNome = await s.post(`/atendimento/paineis/${c.id}/campos`, { nome: 'Ativação dos módulos', tipo: 'texto', parte: 'Configuração', produtoId: produto.linechat });
    expect(mesmoNome.statusCode, mesmoNome.body).toBe(201);
    // o 2.4.1 (a 0032)
    await rodar(migracao('0032_ativacao_dos_modulos_de_volta.sql'));
    expect(await checklists(a)).toEqual([[produto.linechat, 'Configuração', true], [produto.linepbx, 'Configuração', true]]);
    expect(await checklists(b)).toEqual([[produto.linechat, 'Configuração', true]]);
    const doC = (await camposDe(c)).filter((x) => x.nome === 'Ativação dos módulos').map((x) => [x.produtoId, x.tipo]);
    expect(doC).toHaveLength(2);
    expect(doC).toEqual(expect.arrayContaining([[produto.linechat, 'texto'], [produto.linepbx, 'modulos']]));
    // de novo, nada muda
    await rodar(migracao('0032_ativacao_dos_modulos_de_volta.sql'));
    expect(await checklists(b)).toEqual([[produto.linechat, 'Configuração', true]]);
  });
});

describe('as Condições especiais (2.4.1)', () => {
  const texto = (f: FichaChamado) => f.historico.at(-1)!.texto.replace(/\u00a0/g, ' ');
  it('o desconto em sequência, o sem prazo e o desconto na ativação; o histórico com o nome novo; o guardado no 2.4 continua lido', async () => {
    const v = await s.post('/atendimento/paineis', { nome: 'Vendas 2.4.1', sigla: 'vqu', descricao: '', cor: 'ok', tipo: 'vendas', ajustes: {} });
    expect(v.statusCode, v.body).toBe(201);
    const neg = (await s.post('/atendimento/chamados', { painelId: v.json().id, titulo: '', empresa: 'Pousada Mar Azul', valor: 99_000, ativacao: 150_000 })).json();
    const condicoes = { descontos: [{ valor: 20_000, ate: '2027-03' }, { valor: 10_000, ate: null }], ativacao: { desconto: 50_000, vezes: 4 } };
    const r = await s.patch(`/atendimento/chamados/${neg.id}`, { condicoes });
    expect(r.statusCode, r.body).toBe(200);
    const f: FichaChamado = r.json();
    expect(f.condicoes).toEqual({ descontos: condicoes.descontos, ativacao: { desconto: 50_000, vezes: 4, aPartirDe: null }, observacao: null });
    expect(texto(f)).toContain('Condições especiais');
    expect(texto(f)).toContain('Desconto de R$ 200,00/mês até mar/2027, depois R$ 100,00/mês sem prazo · Ativação com R$ 500,00 de desconto, em 4 vezes, a partir do 1º mês');
    // o valor da negociação não muda
    expect([f.valor, f.ativacao]).toEqual([99_000, 150_000]);
    // só o último pode ser sem prazo
    expect((await s.patch(`/atendimento/chamados/${neg.id}`, { condicoes: { descontos: [{ valor: 100, ate: null }, { valor: 50, ate: '2027-03' }] } })).statusCode).toBe(400);
    // o que foi guardado no 2.4 (com o "de" e a ativação sem o desconto): a ficha lê no formato novo
    await app.db.update(tickets).set({ negotiationTerms: { descontos: [{ valor: 20_000, de: null, ate: '2027-03' }], ativacao: { aPartirDe: '2027-03', vezes: 6 }, observacao: null } }).where(eq(tickets.id, neg.id));
    const antiga = (await s.get(`/atendimento/chamados/${neg.codigo}`)).json() as FichaChamado;
    expect(antiga.condicoes).toEqual({ descontos: [{ valor: 20_000, ate: '2027-03' }], ativacao: { desconto: null, vezes: 6, aPartirDe: '2027-03' }, observacao: null });
    // e salvar o mesmo, no formato novo, não vai para o histórico
    const n = antiga.historico.length;
    await s.patch(`/atendimento/chamados/${neg.id}`, { condicoes: { descontos: [{ valor: 20_000, ate: '2027-03' }], ativacao: { vezes: 6, aPartirDe: '2027-03' } } });
    expect(((await s.get(`/atendimento/chamados/${neg.codigo}`)).json() as FichaChamado).historico).toHaveLength(n);
  });
});
