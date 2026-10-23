/**
 * Patch 2.1 — A ORDEM À MÃO NO QUADRO. O pedido do Luan (23/10), no quadro do Comercial: "quero poder
 * trocar a ordem aqui, pra cima ou pra baixo da mesma forma que mudo de fase arrastando".
 *
 *  - no painel de Vendas, nas etapas abertas: arrastar muda o lugar (logo abaixo de outra, ou no alto); a etapa
 *    inteira fica numerada, e o quadro mostra nessa ordem para todo mundo
 *  - a que chega na etapa (mudar de etapa apaga o lugar) aparece no alto, pela regra de sempre (a de maior valor)
 *  - o arrasto para outra coluna cai no lugar (o mover com `depoisDe`); a de cima que saiu da etapa não impede o mover
 *  - não mexe na última atividade nem no histórico da negociação; vai para a auditoria, só quando o lugar muda
 *  - no Suporte (o mais urgente primeiro) e no Ganho e no Perdido (o mais recente): 400
 *  - a de cima que saiu da etapa: 409; quem não trabalha nos chamados: 403; quem não vê o painel: 404
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { tickets } from '@gestor/db';
import type { EtapaPainel, Painel, QuadroAtendimento } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;       // a administração
let leitor: Session;  // vê o Comercial, sem trabalhar nos chamados
let diego: Session;   // Comercial, fora da lista do painel
let com: Painel;
const n: Record<string, { id: string; codigo: string }> = {};

const etapa = (nome: string): EtapaPainel => {
  const e = com.etapas.find((x) => x.nome === nome);
  if (!e) throw new Error(`sem a etapa ${nome}`);
  return e;
};
async function pessoa(nome: string, email: string, papel: string) {
  const papeis = (await s.get('/admin/roles')).json();
  const r = await s.post('/admin/users', { name: nome, email, password: 'SenhaDeTeste!123', roleId: papeis.find((x: any) => x.key === papel || x.name === papel).id });
  expect(r.statusCode, r.body).toBe(201);
  const sessao = new Session(app);
  await sessao.login(email, 'SenhaDeTeste!123');
  return { id: r.json().id as string, sessao };
}
async function abrir(chave: string, valor: number | null, emEtapa?: string) {
  const r = await s.post('/atendimento/chamados', { painelId: com.id, titulo: `Negociação ${chave}`, empresa: `Empresa ${chave}`, ...(valor != null ? { valor } : {}) });
  expect(r.statusCode, r.body).toBe(201);
  n[chave] = r.json();
  if (emEtapa) expect((await mover(chave, emEtapa)).statusCode).toBe(200);
}
const mover = (chave: string, nome: string, extra: Record<string, unknown> = {}) => s.post(`/atendimento/chamados/${n[chave]!.id}/mover`, { etapaId: etapa(nome).id, ...extra });
const posicao = (chave: string, depoisDe: string | null, quem: Session = s) =>
  quem.post(`/atendimento/chamados/${n[chave]!.id}/posicao`, { depoisDe: depoisDe ? n[depoisDe]!.id : null });
/** A coluna como o quadro mostra, pelas chaves das negociações (A, B…). */
async function coluna(nome: string): Promise<string[]> {
  const r = await s.get(`/atendimento/quadro?painel=${com.id}`);
  expect(r.statusCode, r.body).toBe(200);
  const codigos = (r.json() as QuadroAtendimento).colunas.find((c) => c.etapa.nome === nome)!.chamados.map((c) => c.codigo);
  return codigos.map((c) => Object.keys(n).find((k) => n[k]!.codigo === c) ?? c);
}
const auditoria = async () => ((await s.get('/admin/audit?pageSize=200')).json().items as Array<{ summary: string }>).map((a) => a.summary);

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const papel = await s.post('/admin/roles', { name: 'Leitor do Comercial', description: 'só lê', permissions: ['records.read', 'support.read', 'sales.read'] });
  expect(papel.statusCode, papel.body).toBe(201);
  const l = await pessoa('Lia Rocha', 'lia@gestor.local', 'Leitor do Comercial');
  const d = await pessoa('Diego Farias', 'diego@gestor.local', 'comercial');
  leitor = l.sessao; diego = d.sessao;
  const r = await s.post('/atendimento/paineis', { nome: 'Comercial', sigla: 'com', descricao: 'As negociações', cor: 'ok', tipo: 'vendas', acesso: 'escolhidos', pessoas: [l.id], ajustes: {} });
  expect(r.statusCode, r.body).toBe(201);
  com = r.json();
  // no Lead: a de maior valor primeiro (a sem valor no fim)
  await abrir('A', 100_000);
  await abrir('B', 300_000);
  await abrir('C', null);
  await abrir('D', 200_000);
  // na Qualificação
  await abrir('G', 50_000, 'Qualificação');
  await abrir('H', 70_000, 'Qualificação');
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

describe('a ordem à mão no quadro de Vendas', () => {
  it('sem ninguém arrumar, a regra de sempre: a de maior valor primeiro', async () => {
    expect(await coluna('Lead')).toEqual(['B', 'D', 'A', 'C']);
    expect(await coluna('Qualificação')).toEqual(['H', 'G']);
  });

  it('arrastar para o alto e para logo abaixo de outra: o quadro mostra nessa ordem, e a etapa fica numerada', async () => {
    const r = await posicao('A', null);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ codigo: n.A!.codigo, posicao: 1 });
    expect(await coluna('Lead')).toEqual(['A', 'B', 'D', 'C']);
    const lugares = await app.db.select({ id: tickets.id, ordem: tickets.boardPosition }).from(tickets).where(eq(tickets.stageId, etapa('Lead').id));
    expect(Object.fromEntries(lugares.map((l) => [Object.keys(n).find((k) => n[k]!.id === l.id), l.ordem]))).toEqual({ A: 1, B: 2, D: 3, C: 4 });

    expect((await posicao('C', 'B')).json()).toMatchObject({ posicao: 3 });
    expect(await coluna('Lead')).toEqual(['A', 'B', 'C', 'D']);
    // quem lê o Comercial vê a mesma ordem
    const q = (await leitor.get(`/atendimento/quadro?painel=${com.id}`)).json() as QuadroAtendimento;
    expect(q.colunas.find((c) => c.etapa.nome === 'Lead')!.chamados.map((c) => c.codigo)).toEqual(['A', 'B', 'C', 'D'].map((k) => n[k]!.codigo));
  });

  it('não mexe na última atividade nem no histórico; a auditoria diz o lugar (e nada quando ele não muda)', async () => {
    const antes = (await s.get(`/atendimento/chamados/${n.D!.id}`)).json();
    const auditAntes = await auditoria();
    expect((await posicao('D', null)).statusCode).toBe(200);
    const depois = (await s.get(`/atendimento/chamados/${n.D!.id}`)).json();
    expect(depois.ultimaAtividadeEm).toBe(antes.ultimaAtividadeEm);
    expect(depois.atualizadoEm).toBe(antes.atualizadoEm);
    expect(depois.historico).toHaveLength(antes.historico.length);
    expect(depois.ordemNoQuadro).toBe(1);
    const audit = await auditoria();
    expect(audit.length).toBe(auditAntes.length + 1);
    expect(audit[0]).toBe(`Pôs ${n.D!.codigo} em 1º lugar em Lead (a ordem do quadro)`);
    expect(await coluna('Lead')).toEqual(['D', 'A', 'B', 'C']);
    // no mesmo lugar: nada muda, nada na auditoria
    expect((await posicao('A', 'D')).json()).toMatchObject({ posicao: 2 });
    expect(await auditoria()).toHaveLength(audit.length);
  });

  it('a que chega na etapa aparece no alto (pela regra de sempre), e mudar de etapa apaga o lugar', async () => {
    await abrir('E', 500_000);
    expect(await coluna('Lead')).toEqual(['E', 'D', 'A', 'B', 'C']);
    expect((await posicao('E', 'C')).json()).toMatchObject({ posicao: 5 });
    expect(await coluna('Lead')).toEqual(['D', 'A', 'B', 'C', 'E']);
    // a D vai e volta: perde o lugar e chega no alto
    expect((await mover('D', 'Qualificação')).statusCode).toBe(200);
    expect(await coluna('Lead')).toEqual(['A', 'B', 'C', 'E']);
    expect(await coluna('Qualificação')).toEqual(['D', 'H', 'G']);
    expect((await mover('D', 'Lead')).statusCode).toBe(200);
    expect(await coluna('Lead')).toEqual(['D', 'A', 'B', 'C', 'E']);
    const [d] = await app.db.select({ ordem: tickets.boardPosition }).from(tickets).where(eq(tickets.id, n.D!.id));
    expect(d!.ordem).toBeNull();
  });

  it('arrastar para outra coluna cai no lugar; a de cima que saiu de lá não impede o mover', async () => {
    let r = await mover('A', 'Qualificação', { depoisDe: n.H!.id });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().ordemNoQuadro).toBe(2);
    expect(await coluna('Qualificação')).toEqual(['H', 'A', 'G']);
    r = await mover('B', 'Qualificação', { depoisDe: null });
    expect(r.statusCode, r.body).toBe(200);
    expect(await coluna('Qualificação')).toEqual(['B', 'H', 'A', 'G']);
    // a de cima (a E) está no Lead: a C chega sem lugar, no alto
    r = await mover('C', 'Qualificação', { depoisDe: n.E!.id });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().ordemNoQuadro).toBeNull();
    expect(await coluna('Qualificação')).toEqual(['C', 'B', 'H', 'A', 'G']);
  });

  it('a de cima que saiu da etapa: 409; ela mesma: 400', async () => {
    const r = await posicao('G', 'E');
    expect(r.statusCode).toBe(409);
    expect(r.json().message ?? r.json().error).toMatch(/O quadro mudou/);
    expect((await posicao('G', 'G')).statusCode).toBe(400);
    expect(await coluna('Qualificação')).toEqual(['C', 'B', 'H', 'A', 'G']);
  });

  it('no Ganho e no Perdido, a ordem é a do mais recente: 400', async () => {
    expect((await mover('E', 'Ganho')).statusCode).toBe(200);
    const r = await posicao('E', null);
    expect(r.statusCode).toBe(400);
    expect(r.json().message ?? r.json().error).toMatch(/Em Ganho, a ordem é a do mais recente/);
  });

  it('no Suporte, o mais urgente primeiro: 400', async () => {
    const t = await s.post('/atendimento/chamados', { painelId: 'painel-suporte', titulo: 'Ramal mudo', relato: 'O ramal 203 não toca' });
    expect(t.statusCode, t.body).toBe(201);
    const r = await s.post(`/atendimento/chamados/${t.json().id}/posicao`, { depoisDe: null });
    expect(r.statusCode).toBe(400);
    expect(r.json().message ?? r.json().error).toMatch(/painel de Vendas/);
  });

  it('quem não trabalha nos chamados: 403; quem não vê o painel: 404', async () => {
    expect((await posicao('G', null, leitor)).statusCode).toBe(403);
    expect((await posicao('G', null, diego)).statusCode).toBe(404);
    expect(await coluna('Qualificação')).toEqual(['C', 'B', 'H', 'A', 'G']);
  });
});
