/**
 * Patch 1.7 — Chamados › Relatórios (decisão 0037).
 *
 * As contas em si estão testadas em `packages/shared/src/relatorios.test.ts`. Aqui fica o que é do
 * servidor:
 *  - os relatórios leem a cópia do LineChat **com o histórico de etapas** (a escada depende dele);
 *  - a peça clicada devolve os mesmos chamados da conta, com o link do card no LineChat;
 *  - os ajustes: o Cliente do card é ligado sozinho ao cadastro quando o nome bate; a administração
 *    corrige, e fica na auditoria; campo ou cliente que não existe é recusado;
 *  - o Raio-X junta os chamados do cliente com o que ele tem no Gestor;
 *  - quem vê chamados vê os relatórios; só a administração mexe nos ajustes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { linechatCardMoves, linechatCards, linechatFields, linechatSteps, newId, settings } from '@gestor/db';
import { makeApp, Session, type App } from './helpers.js';
import { esquecerLeitura } from '../src/services/chamados.js';

let app: App;
let s: Session;
let labId = '';
let gradoId = '';

const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000);

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  labId = (await s.post('/clients', { tradeName: 'Labchecap', legalName: 'Labchecap Laboratório LTDA', cnpj: '11.222.333/0001-81' })).json().id;
  gradoId = (await s.post('/clients', { tradeName: 'Grado Engenharia', legalName: 'Grado Engenharia LTDA', cnpj: '22.333.444/0001-81' })).json().id;
  await s.put(`/clients/${labId}/subscriptions`, { productCode: 'linepbx', activatedAt: '2024-01-10' });

  const db = app.db;
  await db.insert(settings).values({ id: 'linechat', value: JSON.stringify({ ativo: true, painelId: 'p1', painelNome: 'Ingline - Suporte', inicioEm: horasAtras(24 * 60).toISOString() }) });
  await db.insert(linechatSteps).values([
    { id: 'novo', title: 'Novos Suporte', position: 1, isInitial: true },
    { id: 'n1', title: 'Chamado Em Tratativa N1', position: 2 },
    { id: 'n2', title: 'Chamado Em Tratativa N2', position: 3 },
    { id: 'tratado', title: 'Chamado Tratado Suporte', position: 4, isFinal: true },
  ]);
  await db.insert(linechatFields).values([
    { key: 'cliente-71', name: 'Cliente', type: 'SINGLESELECT', position: 2, options: ['Labchecap', 'Grado', 'Interno'] },
    { key: 'assunto', name: 'Assunto', type: 'SINGLESELECT', position: 9, options: ['URA', 'Ramal'] },
  ]);
  /** Um card e o caminho dele pelas etapas (a primeira linha é a abertura, com hora exata). */
  const card = async (n: number, cf: Record<string, string>, abertoHa: number, caminho: string[], fechouHa: number | null, resp: string | null = 'Lucio') => {
    const ultima = caminho[caminho.length - 1]!;
    const fechado = fechouHa !== null;
    await db.insert(linechatCards).values({
      id: `card-${n}`, panelId: 'p1', number: n, key: `IS-${n}`, title: `Chamado ${n}`,
      stepId: ultima, stepTitle: ultima, stepPhase: fechado ? 'FINAL' : 'INTERMEDIATE', responsibleName: resp,
      customFields: cf, createdAt: horasAtras(abertoHa), updatedAt: horasAtras(fechouHa ?? abertoHa / 2), closedAt: fechado ? horasAtras(fechouHa) : null,
    });
    const passo = ((abertoHa - (fechouHa ?? 0)) / Math.max(1, caminho.length - 1));
    await db.insert(linechatCardMoves).values(caminho.map((to, i) => ({
      id: newId(), cardId: `card-${n}`, fromStepId: i ? caminho[i - 1]! : null, toStepId: to,
      at: i === caminho.length - 1 && fechado ? horasAtras(fechouHa) : horasAtras(abertoHa - passo * i), estimated: false,
    })));
  };
  await card(1, { 'cliente-71': 'Labchecap', assunto: 'URA' }, 50, ['novo', 'n1', 'tratado'], 48);
  await card(2, { 'cliente-71': 'Labchecap', assunto: 'URA' }, 30, ['novo', 'n1', 'n2', 'tratado'], 20);
  await card(3, { 'cliente-71': 'Grado', assunto: 'Ramal' }, 10, ['novo', 'n1'], null, 'Marina');
  await card(4, { 'cliente-71': 'Interno', assunto: 'Ramal' }, 5, ['novo'], null, null);
  esquecerLeitura();
});
afterAll(async () => { await app.close(); });

describe('os relatórios', () => {
  it('relógio, escada, equipe e reincidência com os dados guardados', async () => {
    const r = await s.get('/chamados/relatorios');
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.campos.cliente).toEqual({ key: 'cliente-71', name: 'Cliente' });
    expect(b.relogio).toMatchObject({ n: 2, estimados: 0 });
    expect(b.relogio.mediana).toBeCloseTo(6, 3); // as horas são contadas a partir de agora: sobra uma fração de segundo
    expect(b.escada).toMatchObject({ achouNiveis: true, n: 2, n1: 1, n2: 1, n3: 0, semHistorico: 0 });
    expect(b.calor.n).toBe(4);
    expect(b.fila.filaHoje).toBe(2);
    const marina = b.equipe.linhas.find((l: any) => l.nome === 'Marina');
    expect(marina).toMatchObject({ emAberto: 1, fechados: 0 });
    expect(b.equipe.linhas[b.equipe.linhas.length - 1].nome).toBeNull();
    expect(b.reincidencia.linhas[0]).toMatchObject({ cliente: 'Labchecap', assunto: 'URA', n: 2 });
    expect(b.sobeDesce).toMatchObject({ assunto: { key: 'assunto', name: 'Assunto' }, agora: 4, antes: 0, novos: 2 });
    expect(b.idade).toMatchObject({ n: 2, maisDe7: 0 });
    expect(b.foraDaCurva.picos).toEqual([]);
    // o tamanho do cliente vem do cadastro: Labchecap e Grado ligados pelo nome, sem DIDs nem aparelhos
    expect(b.tamanho).toMatchObject({ disponivel: true, semLigacao: 1 });
    expect(b.tamanho.linhas.map((l: any) => [l.nome, l.n, l.porDids])).toEqual([['Labchecap', 2, null], ['Grado Engenharia', 1, null]]);
    // sem campo de tipo no painel, o "de quem é a falha" vem vazio
    expect(b.falha.tipo).toBeNull();
    expect(b.reincidencia.linhas[0].chamados[0].link).toBe('https://inglinechat.com.br/panels/p1/card/IS-1');
  });

  it('os filtros e o "separar por" vêm do endereço, como na tela de Chamados', async () => {
    const b = (await s.get('/chamados/relatorios?separar=responsavel&campo=cliente-71%3DLabchecap&campo=cliente-71%3DGrado&mes=2026-01')).json();
    expect(b.relogio.separado).toMatchObject({ por: 'responsavel', nome: 'Responsável' });
    expect(b.relogio.separado.linhas.map((l: any) => [l.rotulo, l.n])).toEqual([['Lucio', 2]]);
    expect(b.calor.n).toBe(3); // o Interno ficou de fora pelo filtro de Cliente
    expect(b.mes.mes).toBe('2026-01');
    expect((await s.get('/chamados/relatorios?separar=qualquer')).json().relogio.separado).toBeNull();
  });

  it('a peça clicada traz os mesmos chamados da conta; peça desconhecida é recusada', async () => {
    const p = (await s.get('/chamados/relatorios/chamados?peca=escada:n2')).json();
    expect(p.total).toBe(1);
    expect(p.itens[0]).toMatchObject({ key: 'IS-2', link: 'https://inglinechat.com.br/panels/p1/card/IS-2' });
    expect(p.titulo).toBe('Fecharam depois de chegar ao N2');
    expect((await s.get('/chamados/relatorios/chamados?peca=qualquer:1')).statusCode).toBe(400);
  });
});

describe('ajustes e Raio-X', () => {
  it('o Cliente do card é ligado sozinho quando o nome bate', async () => {
    const a = (await s.get('/chamados/relatorios/ajustes')).json();
    const op = (nome: string) => a.opcoes.find((o: any) => o.opcao === nome);
    expect(op('Labchecap')).toMatchObject({ n: 2, clienteId: labId, como: 'automatico', guardada: false });
    expect(op('Grado')).toMatchObject({ n: 1, clienteId: gradoId, como: 'automatico' });
    expect(op('Interno')).toMatchObject({ clienteId: null, como: 'nenhum' });
    expect(a.ligados.map((x: any) => x.nome)).toEqual(['Labchecap', 'Grado Engenharia']);
    expect(a.campos.usados.assunto).toEqual({ key: 'assunto', name: 'Assunto' });
  });

  it('a administração corrige a ligação, e fica na auditoria; campo ou cliente que não existe é recusado', async () => {
    const r = await s.put('/chamados/relatorios/ajustes', { campos: {}, clientes: { Grado: null, Interno: labId }, causas: { Correção: 'pedido' } });
    expect(r.statusCode).toBe(200);
    const a = (await s.get('/chamados/relatorios/ajustes')).json();
    expect(a.opcoes.find((o: any) => o.opcao === 'Grado')).toMatchObject({ clienteId: null, como: 'nenhum', guardada: true });
    expect(a.opcoes.find((o: any) => o.opcao === 'Interno')).toMatchObject({ clienteId: labId, como: 'manual' });
    expect(a.atualizadoPor).toBeTruthy();
    const log = (await s.get('/admin/audit?action=chamados_relatorios')).json();
    expect(JSON.stringify(log)).toContain('ligou 2 clientes do LineChat ao cadastro');
    expect(JSON.stringify(log)).toContain('mudou o grupo de 1 tipo em \\"De quem é a falha\\"');
    expect((await s.put('/chamados/relatorios/ajustes', { campos: {}, clientes: {}, causas: { Correção: 'culpa-de-alguem' } })).statusCode).toBe(400);

    expect((await s.put('/chamados/relatorios/ajustes', { campos: { assunto: 'nao-existe' }, clientes: {} })).statusCode).toBe(400);
    expect((await s.put('/chamados/relatorios/ajustes', { campos: {}, clientes: { Grado: 'cliente-que-nao-existe' } })).statusCode).toBe(400);
  });

  it('Raio-X: os chamados das opções ligadas e o que o cliente tem no Gestor', async () => {
    const r = (await s.get(`/chamados/relatorios/cliente/${labId}`)).json();
    expect(r.cliente).toEqual({ id: labId, nome: 'Labchecap' });
    expect(r.opcoes.sort()).toEqual(['Interno', 'Labchecap']);
    expect([r.abertos, r.fechados, r.emAberto.length]).toEqual([3, 2, 1]);
    expect(r.mediana).toBeCloseTo(6, 3);
    expect(r.gestor).toEqual({ produtos: ['LinePBX'], dids: 0, aparelhos: 0 });
    expect((await s.get('/chamados/relatorios/cliente/nao-existe')).statusCode).toBe(404);
  });

  it('quem vê chamados vê os relatórios; só a administração mexe nos ajustes', async () => {
    const leitor = (await s.get('/admin/roles')).json().find((p: any) => p.key === 'leitor');
    await s.post('/admin/users', { name: 'Leitor dos Relatórios', email: 'leitorrel@gestor.local', password: 'SenhaDeTeste!123', roleId: leitor.id });
    const outro = new Session(app);
    await outro.login('leitorrel@gestor.local', 'SenhaDeTeste!123');
    expect((await outro.get('/chamados/relatorios')).statusCode).toBe(200);
    expect((await outro.get('/chamados/relatorios/ajustes')).statusCode).toBe(200);
    expect((await outro.put('/chamados/relatorios/ajustes', { campos: {}, clientes: {} })).statusCode).toBe(403);
  });
});

describe('a arrumação da página de Relatórios', () => {
  it('começa de fábrica; a administração esconde, reordena e escolhe os favoritos para todos, na auditoria', async () => {
    const a0 = (await s.get('/chamados/relatorios/arrumacao')).json();
    expect(a0.ordem).toHaveLength(20);
    expect([a0.ocultos, a0.favoritos, a0.atualizadoEm]).toEqual([[], [], null]);
    const r = await s.put('/chamados/relatorios/arrumacao', { ordem: ['escada', 'relogio'], ocultos: ['prazo', 'previsao'], favoritos: ['mes', 'relogio'] });
    expect(r.statusCode).toBe(200);
    const a = r.json();
    expect(a.ordem.slice(0, 3)).toEqual(['escada', 'relogio', 'gargalo']);
    expect(a.ocultos).toEqual(['prazo', 'previsao']);
    expect(a.favoritos).toEqual(['mes', 'relogio']); // na ordem da aba Favoritos
    expect(a.atualizadoPor).toBeTruthy();
    const log = (await s.get('/admin/audit?action=chamados_relatorios_arrumacao')).json();
    expect(JSON.stringify(log)).toContain('18 à vista, 2 escondidos, 2 favoritos');
    expect((await s.put('/chamados/relatorios/arrumacao', { ordem: ['nao-existe'] })).statusCode).toBe(400);
  });
  it('os 7 que completaram as sugestões vêm junto', async () => {
    const b = (await s.get('/chamados/relatorios')).json();
    for (const k of ['gargalo', 'prazo', 'primeira', 'prioridade', 'pareto', 'previsao', 'preenchimento']) expect(b[k]).toBeTruthy();
    expect(b.primeira.inicial).toEqual({ id: 'novo', titulo: 'Novos Suporte' });
    expect(b.pareto.itens.map((x: any) => [x.rotulo, x.n])).toEqual([['Ramal', 2], ['URA', 2]]);
  });
});
