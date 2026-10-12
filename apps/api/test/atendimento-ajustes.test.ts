/**
 * Patch 1.10 — os chamados do Gestor (decisão 0047): os ajustes do módulo e as integrações.
 *
 *  - painéis: o painel novo com as 4 etapas básicas, a sigla única (409) que não muda depois do
 *    primeiro chamado, as pessoas que precisam existir, tirar o painel só sem chamados por fechar
 *  - etapas: tirar a etapa com chamados pede o destino; com destino, os chamados mudam (os da lixeira
 *    também) e o histórico conta por quê; a etapa que muda de tipo leva as datas junto
 *  - assuntos: até 3 níveis, sem círculo, sem irmão repetido (sem acento e maiúscula), a lista colada
 *  - prazos; avisos: a chave vai para o cofre e nunca volta (nem na auditoria); o teste do WhatsApp
 *  - integrações: webhook só da internet, o segredo só ao criar (ou ao pedir um novo), o teste com a
 *    assinatura; a chave de API aparece uma vez (no banco, o sha256 e o começo) e é revogada
 *  - quem pode: o Operador não mexe nos ajustes; o Técnico não mexe nas integrações
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLog, settings, ticketApiKeys, ticketStages, ticketSubjects, ticketWebhooks, tickets } from '@gestor/db';
import { AJUSTES_PRAZOS_PADRAO, AVISOS_CHAMADOS_PADRAO, EVENTOS_AVISO_PADRAO } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import * as integ from '../src/services/integracoes.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';
import { trocarFerramentasWhatsApp } from '../src/services/atendimento/whatsapp.js';
import { assinatura, trocarFerramentasWebhook } from '../src/services/atendimento/webhooks.js';

let app: App;
let s: Session;         // administrador: cuida dos chamados e das integrações
let operador: Session;  // Marina: trabalha nos chamados
let tecnico: Session;   // Bruno: trabalha nos chamados (não cuida, não administra)
let adminId = '';
let marinaId = '';
let brunoId = '';

const SUP = 'painel-suporte';
const DEV = 'painel-desenvolvimento';
const painel = (o: Record<string, unknown> = {}) => ({
  nome: 'Interno', sigla: 'INT', descricao: 'Os pedidos da própria equipe', cor: 'turquesa', acesso: 'todos', pessoas: [], ajustes: {}, ...o,
});
const recusar = (async () => { throw new Error('rede desligada nos testes'); }) as unknown as typeof fetch;

async function abrir(painelId: string, titulo = 'Trocar o teclado') {
  const r = await s.post('/atendimento/chamados', { painelId, titulo });
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string; codigo: string };
}
async function ficha(ref: string) {
  const r = await s.get(`/atendimento/chamados/${encodeURIComponent(ref)}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
const auditoria = async () => JSON.stringify(await app.db.select().from(auditLog));
const eventos = (f: any, tipo: string) => (f.historico as any[]).filter((e) => e.tipo === tipo);

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  adminId = (await s.login()).id;
  const papeis = (await s.get('/admin/roles')).json();
  const idDe = (key: string) => papeis.find((r: any) => r.key === key).id;
  marinaId = (await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('operador') })).json().id;
  brunoId = (await s.post('/admin/users', { name: 'Bruno Técnico', email: 'bruno@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('tecnico') })).json().id;
  operador = new Session(app); await operador.login('marina@gestor.local', 'SenhaDeTeste!123');
  tecnico = new Session(app); await tecnico.login('bruno@gestor.local', 'SenhaDeTeste!123');
  // nada sai do servidor nos testes
  trocarFerramentasWhatsApp({ fetchFn: recusar });
  trocarFerramentasWebhook({ fetchFn: recusar, resolver: async () => ['203.0.113.10'], esperar: async () => {} });
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

// =====================================================================

describe('os painéis', () => {
  let interno = '';

  it('o painel novo nasce com Novo, Em andamento, Resolvido e Fechado', async () => {
    const r = await s.post('/atendimento/paineis', painel({ sigla: 'int', pessoas: [marinaId], ajustes: { tipos: ['Pedido', 'pedido', 'Dúvida'], supervisores: [adminId] } }));
    expect(r.statusCode, r.body).toBe(201);
    const p = r.json();
    interno = p.id;
    expect(p).toMatchObject({ nome: 'Interno', sigla: 'INT', cor: 'turquesa', ativo: true, abertos: 0, pessoas: [marinaId] });
    expect(p.etapas.map((e: any) => [e.nome, e.tipo, e.nivel])).toEqual([
      ['Novo', 'entrada', null], ['Em andamento', 'andamento', null], ['Resolvido', 'resolvido', null], ['Fechado', 'fechado', null],
    ]);
    // as opções do Tipo sem repetir (sem ligar para maiúscula); o resto dos ajustes vem com o padrão
    expect(p.ajustes).toMatchObject({ tipos: ['Pedido', 'Dúvida'], supervisores: [adminId], contaPrazo: true, paiEsperaFilhos: true });
    expect(await auditoria()).toContain('Criou o painel Interno (INT)');
  });

  it('a sigla é única: 409', async () => {
    const r = await s.post('/atendimento/paineis', painel({ nome: 'Suporte 2', sigla: 'sup' }));
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('A sigla SUP já é de outro painel.');
    expect((await s.put(`/atendimento/paineis/${interno}`, painel({ sigla: 'DEV' }))).statusCode).toBe(409);
  });

  it('as pessoas e os supervisores precisam existir', async () => {
    expect((await s.post('/atendimento/paineis', painel({ sigla: 'XYZ', pessoas: ['nao-existe'] }))).statusCode).toBe(400);
    expect((await s.post('/atendimento/paineis', painel({ sigla: 'XYZ', ajustes: { supervisores: ['nao-existe'] } }))).statusCode).toBe(400);
  });

  it('a sigla não muda depois do primeiro chamado (o resto muda)', async () => {
    // sem chamado, a sigla ainda muda
    expect((await s.put(`/atendimento/paineis/${interno}`, painel({ sigla: 'INX' }))).json().sigla).toBe('INX');
    expect((await s.put(`/atendimento/paineis/${interno}`, painel({ sigla: 'INT' }))).json().sigla).toBe('INT');
    expect((await abrir(interno)).codigo).toBe('INT-1');
    const r = await s.put(`/atendimento/paineis/${interno}`, painel({ sigla: 'INX' }));
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/A sigla INT não muda mais/);
    const ok = await s.put(`/atendimento/paineis/${interno}`, painel({ nome: 'Interno da equipe', acesso: 'escolhidos', pessoas: [marinaId] }));
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({ nome: 'Interno da equipe', sigla: 'INT', acesso: 'escolhidos', abertos: 1 });
    expect(await auditoria()).toContain('Alterou o painel Interno da equipe (INT): antes se chamava Interno');
  });

  it('tirar o painel: só sem chamados por fechar; a sigla dele não volta a ser usada', async () => {
    const r = await s.del(`/atendimento/paineis/${interno}`);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/ainda tem 1 chamado que não foi fechado/);

    const tmp = (await s.post('/atendimento/paineis', painel({ nome: 'Temporário', sigla: 'TMP' }))).json();
    expect((await s.del(`/atendimento/paineis/${tmp.id}`)).statusCode).toBe(200);
    const opcoes = (await s.get('/atendimento/opcoes')).json();
    expect(opcoes.paineis.map((p: any) => p.sigla)).not.toContain('TMP');
    expect((await s.put(`/atendimento/paineis/${tmp.id}`, painel({ sigla: 'TMP' }))).statusCode).toBe(404);
    const denovo = await s.post('/atendimento/paineis', painel({ nome: 'Outro', sigla: 'TMP' }));
    expect(denovo.statusCode).toBe(409);
    expect(denovo.json().error).toMatch(/foi do painel Temporário, que saiu/);
  });
});

// =====================================================================

describe('as etapas', () => {
  let painelId = '';
  let etapas: any[] = [];
  let a = { id: '', codigo: '' };
  let b = { id: '', codigo: '' };
  let naLixeira = { id: '', codigo: '' };

  beforeAll(async () => {
    const p = (await s.post('/atendimento/paineis', painel({ nome: 'Compras', sigla: 'CMP' }))).json();
    painelId = p.id;
    etapas = p.etapas;
    a = await abrir(painelId, 'Comprar headset');
    b = await abrir(painelId, 'Comprar cabo');
    naLixeira = await abrir(painelId, 'Comprar mesa');
    expect((await s.del(`/atendimento/chamados/${naLixeira.id}`)).statusCode).toBe(200);
  });

  const semId = (e: any) => ({ nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: e.obrigatorios, avisar: e.avisar });
  const comId = (e: any) => ({ id: e.id, ...semId(e) });

  it('tirar a etapa que tem chamados sem dizer para onde eles vão: 400 (a lixeira não conta)', async () => {
    const [novo, andamento, resolvido, fechado] = etapas;
    const r = await s.put(`/atendimento/paineis/${painelId}/etapas`, { etapas: [comId(andamento), comId(resolvido), comId(fechado)], destino: {} });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('A etapa Novo tem 2 chamados: escolha para onde eles vão.');
    expect(r.json().details.etapas).toEqual([{ id: novo.id, nome: 'Novo', chamados: 2 }]);
    // o destino precisa ser uma etapa que fica
    const r2 = await s.put(`/atendimento/paineis/${painelId}/etapas`, { etapas: [comId(andamento), comId(resolvido), comId(fechado)], destino: { [novo.id]: novo.id } });
    expect(r2.statusCode).toBe(400);
  });

  it('com destino, os chamados mudam de etapa e o histórico conta por quê', async () => {
    const [novo, andamento, resolvido, fechado] = etapas;
    const r = await s.put(`/atendimento/paineis/${painelId}/etapas`, {
      etapas: [{ ...comId(andamento), nome: 'Em atendimento', avisar: [marinaId] }, { nome: 'Aguardando peça', tipo: 'andamento' }, comId(resolvido), comId(fechado)],
      destino: { [novo.id]: andamento.id },
    });
    expect(r.statusCode, r.body).toBe(200);
    const p = r.json();
    expect(p.etapas.map((e: any) => e.nome)).toEqual(['Em atendimento', 'Aguardando peça', 'Resolvido', 'Fechado']);
    expect(p.etapas[0]).toMatchObject({ id: andamento.id, avisar: [marinaId] });
    expect(p.abertos).toBe(2);
    etapas = p.etapas;

    // a etapa que saiu não é apagada: ganha a data de saída
    const [saiu] = await app.db.select().from(ticketStages).where(eq(ticketStages.id, novo.id));
    expect(saiu!.deletedAt).not.toBeNull();
    // os chamados (inclusive o da lixeira) estão no destino
    for (const t of [a, b, naLixeira]) {
      const [linha] = await app.db.select({ stageId: tickets.stageId }).from(tickets).where(eq(tickets.id, t.id));
      expect(linha!.stageId).toBe(andamento.id);
    }
    const f = await ficha(a.codigo);
    expect(f.etapaId).toBe(andamento.id);
    const mov = (f.historico as any[]).filter((e) => e.tipo === 'etapa');
    expect(mov).toHaveLength(1);
    expect(mov[0]).toMatchObject({ por: { id: adminId }, dados: { motivo: 'a etapa Novo saiu do painel', de: { nome: 'Novo' }, para: { nome: 'Em atendimento' } } });
    expect(mov[0].texto).toBe('moveu de Novo para Em atendimento: a etapa Novo saiu do painel');
    expect(await auditoria()).toContain('Mudou as etapas do painel Compras: entrou Aguardando peça; saiu Novo; renomeou Em andamento → Em atendimento; 2 chamados foram de Novo para Em atendimento');
  });

  it('a etapa que muda de tipo leva as datas dos chamados junto', async () => {
    const [atendimento, aguardando, resolvido, fechado] = etapas;
    const r = await s.put(`/atendimento/paineis/${painelId}/etapas`, { etapas: [{ ...comId(atendimento), tipo: 'resolvido' }, comId(aguardando), comId(resolvido), comId(fechado)] });
    expect(r.statusCode, r.body).toBe(200);
    expect((await ficha(a.codigo))).toMatchObject({ situacao: 'resolvido', resolvidoEm: expect.any(String) });
    const volta = await s.put(`/atendimento/paineis/${painelId}/etapas`, { etapas: [comId(atendimento), comId(aguardando), comId(resolvido), comId(fechado)] });
    expect(volta.statusCode, volta.body).toBe(200);
    expect((await ficha(a.codigo))).toMatchObject({ situacao: 'aberto', resolvidoEm: null, fechadoEm: null });
  });

  it('a etapa de outro painel não entra; a lista precisa de uma etapa que fecha', async () => {
    const r = await s.put(`/atendimento/paineis/${painelId}/etapas`, { etapas: [...etapas.map(comId), { id: 'etapa-suporte-n1', nome: 'N1', tipo: 'andamento' }] });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/não é deste painel/);
    expect((await s.put(`/atendimento/paineis/${painelId}/etapas`, { etapas: etapas.slice(0, 2).map(comId) })).statusCode).toBe(400);
  });
});

// =====================================================================

describe('a janela do painel: as etapas junto, ao criar e ao editar', () => {
  const semId = (e: any) => ({ nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: e.obrigatorios, avisar: e.avisar });
  const comId = (e: any) => ({ id: e.id, ...semId(e) });
  const nomes = (p: any) => p.etapas.map((e: any) => e.nome);
  const doServidor = async (id: string) => (await s.get('/atendimento/opcoes')).json().paineis.find((p: any) => p.id === id);

  it('o painel novo nasce com as etapas da janela: a ordem, o tipo, o nível, o que pede e quem avisa', async () => {
    const r = await s.post('/atendimento/paineis', painel({
      nome: 'Ativações', sigla: 'ATV', etapas: [
        { nome: 'Pedido', tipo: 'entrada' },
        { nome: 'Instalação', tipo: 'andamento', nivel: 1, obrigatorios: ['cliente'], avisar: [marinaId] },
        { nome: 'Ativado', tipo: 'resolvido', obrigatorios: ['cliente', 'solucao'] },
        { nome: 'Encerrado', tipo: 'fechado' },
      ],
    }));
    expect(r.statusCode, r.body).toBe(201);
    const p = r.json();
    expect(p.etapas.map((e: any) => [e.nome, e.tipo, e.nivel])).toEqual([
      ['Pedido', 'entrada', null], ['Instalação', 'andamento', 1], ['Ativado', 'resolvido', null], ['Encerrado', 'fechado', null],
    ]);
    expect(p.etapas[1]).toMatchObject({ obrigatorios: ['cliente'], avisar: [marinaId] });
    expect(p.etapas[2].obrigatorios).toEqual(['cliente', 'solucao']);
    // o chamado novo cai na etapa de entrada da lista
    const t = await abrir(p.id, 'Ativar o ramal novo');
    expect(t.codigo).toBe('ATV-1');
    expect((await ficha(t.codigo)).etapaId).toBe(p.etapas[0].id);
    expect(await auditoria()).toContain('Criou o painel Ativações (ATV), com as etapas Pedido, Instalação, Ativado e Encerrado');
  });

  it('a lista do painel novo segue as regras de sempre, e o recusado não deixa nada pela metade', async () => {
    const tentar = (etapas: unknown[], o: Record<string, unknown> = {}) => s.post('/atendimento/paineis', painel({ nome: 'Compras 2', sigla: 'CPR', etapas, ...o }));
    // num painel novo não existe etapa nenhuma: etapa com id (de outro painel) é recusada
    const comIdDeOutro = await tentar([{ id: 'etapa-suporte-n1', nome: 'N1', tipo: 'andamento' }, { nome: 'Fim', tipo: 'fechado' }]);
    expect(comIdDeOutro.statusCode).toBe(400);
    expect(comIdDeOutro.json().error).toMatch(/não é deste painel/);
    const semFechar = await tentar([{ nome: 'Novo', tipo: 'entrada' }, { nome: 'Fazendo', tipo: 'andamento' }]);
    expect(semFechar.statusCode).toBe(400);
    expect(semFechar.json().details[0].message).toBe('Pelo menos uma etapa precisa fechar o chamado');
    const repetida = await tentar([{ nome: 'Novo', tipo: 'entrada' }, { nome: 'novo ', tipo: 'fechado' }]);
    expect(repetida.statusCode).toBe(400);
    expect(repetida.json().details[0].message).toBe('Duas etapas com o nome novo');
    expect((await tentar([{ nome: 'Só uma', tipo: 'fechado' }])).statusCode).toBe(400);
    const quemNaoExiste = await tentar([{ nome: 'Novo', tipo: 'entrada', avisar: ['nao-existe'] }, { nome: 'Fim', tipo: 'fechado' }]);
    expect(quemNaoExiste.statusCode).toBe(400);
    // nenhuma tentativa criou o painel: a sigla continua livre
    expect((await s.get('/atendimento/opcoes')).json().paineis.map((p: any) => p.sigla)).not.toContain('CPR');
    const ok = await tentar([{ nome: 'Novo', tipo: 'entrada' }, { nome: 'Fim', tipo: 'fechado' }]);
    expect(ok.statusCode, ok.body).toBe(201);
    expect(nomes(ok.json())).toEqual(['Novo', 'Fim']);
  });

  it('editar o painel e as etapas numa vez só: a etapa com chamados pede o destino e, sem ele, nada muda (nem o nome)', async () => {
    const p = (await s.post('/atendimento/paineis', painel({ nome: 'Logística', sigla: 'LOG' }))).json();
    const t = await abrir(p.id, 'Enviar o aparelho');
    const [novo, andamento, resolvido, fechado] = p.etapas;
    const pedido = painel({
      nome: 'Logística e envios', sigla: 'LOG',
      etapas: [{ ...comId(andamento), nivel: 1 }, { nome: 'Em trânsito', tipo: 'andamento' }, comId(resolvido), comId(fechado)],
    });

    const r = await s.put(`/atendimento/paineis/${p.id}`, pedido);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('A etapa Novo tem 1 chamado: escolha para onde ele vai.');
    expect(r.json().details.etapas).toEqual([{ id: novo.id, nome: 'Novo', chamados: 1 }]);
    const igual = await doServidor(p.id);
    expect(igual.nome).toBe('Logística');
    expect(nomes(igual)).toEqual(['Novo', 'Em andamento', 'Resolvido', 'Fechado']);

    const ok = await s.put(`/atendimento/paineis/${p.id}`, { ...pedido, destino: { [novo.id]: andamento.id } });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().nome).toBe('Logística e envios');
    expect(nomes(ok.json())).toEqual(['Em andamento', 'Em trânsito', 'Resolvido', 'Fechado']);
    expect(ok.json().etapas[0]).toMatchObject({ id: andamento.id, nivel: 1 });
    expect((await ficha(t.codigo)).etapaId).toBe(andamento.id);
    expect(await auditoria()).toContain(
      'Alterou o painel Logística e envios (LOG): antes se chamava Logística; nas etapas, entrou Em trânsito; saiu Novo; 1 chamado foi de Novo para Em andamento; ajustou Em andamento',
    );

    // sem a lista, o painel muda e as etapas ficam como estão
    const so = await s.put(`/atendimento/paineis/${p.id}`, painel({ nome: 'Logística', sigla: 'LOG' }));
    expect(so.statusCode, so.body).toBe(200);
    expect(nomes(so.json())).toEqual(['Em andamento', 'Em trânsito', 'Resolvido', 'Fechado']);

    // mudar só a ordem também fica dito na auditoria
    const [a, b, c, d] = so.json().etapas;
    const ordem = await s.put(`/atendimento/paineis/${p.id}`, painel({ nome: 'Logística', sigla: 'LOG', etapas: [comId(b), comId(a), comId(c), comId(d)] }));
    expect(nomes(ordem.json())).toEqual(['Em trânsito', 'Em andamento', 'Resolvido', 'Fechado']);
    expect(await auditoria()).toContain('Alterou o painel Logística (LOG): nas etapas, mudou a ordem');
  });

  it('o Operador não cria painel com etapas nem muda as etapas pela janela: 403', async () => {
    expect((await operador.post('/atendimento/paineis', painel({ sigla: 'OPX', etapas: [{ nome: 'A', tipo: 'entrada' }, { nome: 'B', tipo: 'fechado' }] }))).statusCode).toBe(403);
    expect((await operador.put(`/atendimento/paineis/${SUP}`, painel({ nome: 'Suporte', sigla: 'SUP', etapas: [{ nome: 'A', tipo: 'entrada' }, { nome: 'B', tipo: 'fechado' }] }))).statusCode).toBe(403);
  });
});

// =====================================================================

describe('os campos de cada painel (o painel sem assuntos, com os campos dele)', () => {
  let p: any;
  let sistema: any;
  let versao: any;
  let prazo: any;
  const opcoesDoServidor = async () => (await s.get('/atendimento/opcoes')).json();
  const painelAgora = async () => (await opcoesDoServidor()).paineis.find((x: any) => x.id === p.id);
  const abrirCom = (d: Record<string, unknown>) => s.post('/atendimento/chamados', { painelId: p.id, titulo: 'Exportação travando', ...d });
  const linha = async (codigo: string) => (await app.db.select().from(tickets).where(eq(tickets.code, codigo)))[0]!;

  it('desligar o Assunto e as Operadoras: somem das regras (para abrir e das etapas) e do chamado', async () => {
    p = (await s.post('/atendimento/paineis', painel({
      nome: 'Projetos', sigla: 'PRJ', ajustes: { obrigatoriosAoAbrir: ['assunto', 'relato'] },
      etapas: [
        { nome: 'Pedido', tipo: 'entrada' }, { nome: 'Fazendo', tipo: 'andamento', obrigatorios: ['operadora', 'assunto', 'cliente'] },
        { nome: 'Entregue', tipo: 'resolvido' }, { nome: 'Fechado', tipo: 'fechado' },
      ],
    }))).json();
    // o painel novo nasce sem o alcance ("não precisa desse alcance por enquanto")
    expect(p.ajustes.camposDesligados).toEqual(['alcance']);
    const r = await s.put(`/atendimento/paineis/${p.id}/campos-do-sistema`, { desligados: ['operadoras', 'alcance', 'assunto'], tipos: ['Correção', 'Melhoria', 'correção'] });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().ajustes).toMatchObject({ camposDesligados: ['assunto', 'alcance', 'operadoras'], tipos: ['Correção', 'Melhoria'], obrigatoriosAoAbrir: ['relato'] });
    expect(r.json().etapas[1].obrigatorios).toEqual(['cliente']);
    expect(await auditoria()).toContain('Mudou os campos do painel Projetos: desligou Assunto e Operadoras (deixou de ser pedido em: para abrir e Fazendo); as opções do Tipo ficaram Correção, Melhoria');
    // a janela do painel (sem a lista dos desligados) não liga de novo, nem devolve o que não vale às regras
    const janela = await s.put(`/atendimento/paineis/${p.id}`, painel({ nome: 'Projetos', sigla: 'PRJ', ajustes: { tipos: ['Correção', 'Melhoria'], obrigatoriosAoAbrir: ['assunto', 'relato'] } }));
    expect(janela.json().ajustes).toMatchObject({ camposDesligados: ['assunto', 'alcance', 'operadoras'], obrigatoriosAoAbrir: ['relato'] });
    // o assunto e a operadora que vierem ficam de fora (o robô e o n8n não travam por isso)
    const [assuntoDoSup] = await app.db.select().from(ticketSubjects).limit(1);
    const t = await abrirCom({ relato: 'Trava acima de 10 mil linhas', assuntoId: assuntoDoSup?.id ?? null, operadoras: ['qualquer'] });
    expect(t.statusCode, t.body).toBe(201);
    const f = await ficha(t.json().codigo);
    expect(f).toMatchObject({ assunto: null, operadoras: [], campos: {} });
  });

  it('criar os campos: lista (obrigatória para abrir), texto (pedido numa etapa) e data; o nome não repete nem o de um campo que todo chamado tem', async () => {
    const criar = (d: Record<string, unknown>) => s.post(`/atendimento/paineis/${p.id}/campos`, d);
    const r1 = await criar({ nome: 'Sistema', tipo: 'lista', dica: 'Onde está o problema', opcoes: [{ nome: 'LinePBX' }, { nome: 'LineReports' }], obrigatorioAoAbrir: true });
    expect(r1.statusCode, r1.body).toBe(201);
    sistema = r1.json();
    expect(sistema).toMatchObject({ painelId: p.id, nome: 'Sistema', tipo: 'lista', dica: 'Onde está o problema', ativo: true, ordem: 0 });
    expect(sistema.opcoes.map((o: any) => [o.nome, o.ativa])).toEqual([['LinePBX', true], ['LineReports', true]]);
    const entregue = p.etapas[2];
    versao = (await criar({ nome: 'Versão publicada', tipo: 'texto', etapas: [entregue.id] })).json();
    prazo = (await criar({ nome: 'Previsão de entrega', tipo: 'data' })).json();
    expect([versao.ordem, prazo.ordem]).toEqual([1, 2]);
    const agora = await painelAgora();
    expect(agora.ajustes.obrigatoriosAoAbrir).toEqual(['relato', `campo:${sistema.id}`]);
    expect(agora.etapas.find((e: any) => e.id === entregue.id).obrigatorios).toEqual([`campo:${versao.id}`]);
    expect((await opcoesDoServidor()).campos.filter((c: any) => c.painelId === p.id).map((c: any) => c.nome)).toEqual(['Sistema', 'Versão publicada', 'Previsão de entrega']);
    expect(await auditoria()).toContain('Criou o campo Sistema (Lista (escolhe uma opção)) no painel Projetos, obrigatório para abrir');
    expect(await auditoria()).toContain('Criou o campo Versão publicada (Texto curto) no painel Projetos, obrigatório em Entregue');

    expect((await criar({ nome: 'sistema', tipo: 'texto' })).json().error).toBe('O painel Projetos já tem o campo Sistema.');
    expect((await criar({ nome: 'Cliente', tipo: 'texto' })).json().error).toBe('Todo chamado do painel Projetos já tem o campo Cliente: escolha outro nome.');
    expect((await criar({ nome: 'Lista vazia', tipo: 'lista' })).json().details[0].message).toBe('A lista precisa de pelo menos uma opção');
    // com o Assunto desligado, "Assunto" pode ser um campo do painel
    expect((await criar({ nome: 'Assunto', tipo: 'texto', ativo: false })).statusCode).toBe(201);
    const ligar = await s.put(`/atendimento/paineis/${p.id}/campos-do-sistema`, { desligados: ['operadoras'], tipos: ['Correção', 'Melhoria'] });
    expect(ligar.statusCode).toBe(200);
    // ...mas o campo ativo com o mesmo nome impede de ligar o do sistema (seriam dois "Assunto" na ficha)
    await s.put(`/atendimento/paineis/${p.id}/campos-do-sistema`, { desligados: ['operadoras', 'assunto'], tipos: ['Correção', 'Melhoria'] });
    const assuntoDoPainel = (await opcoesDoServidor()).campos.find((c: any) => c.painelId === p.id && c.nome === 'Assunto');
    await s.put(`/atendimento/campos/${assuntoDoPainel.id}`, { nome: 'Assunto', tipo: 'texto', ativo: true });
    const recusado = await s.put(`/atendimento/paineis/${p.id}/campos-do-sistema`, { desligados: ['operadoras'], tipos: ['Correção', 'Melhoria'] });
    expect(recusado.statusCode).toBe(409);
    expect(recusado.json().error).toBe('O painel Projetos tem o campo Assunto: renomeie ou desative esse campo antes de ligar o Assunto do sistema.');
    await s.put(`/atendimento/campos/${assuntoDoPainel.id}`, { nome: 'Assunto antigo', tipo: 'texto', ativo: false });
  });

  it('abrir: o campo obrigatório falta pelo nome; o valor vem pelo id ou pelo nome (e a opção pelo nome); o valor ruim diz o porquê', async () => {
    const sem = await abrirCom({ relato: 'Trava' });
    expect(sem.statusCode).toBe(400);
    expect(sem.json()).toMatchObject({ error: 'Falta preencher: Sistema.', details: { faltam: [`campo:${sistema.id}`] } });
    const ruim = await abrirCom({ relato: 'Trava', campos: { Sistema: 'Asterisk' } });
    expect(ruim.json().error).toBe('Sistema: "Asterisk" não é uma das opções (LinePBX, LineReports)');
    expect((await abrirCom({ relato: 'Trava', campos: { [sistema.id]: 'LineReports', 'Previsão de entrega': '31/02/2027' } })).json().error).toBe('Previsão de entrega: escreva a data (dia/mês/ano)');
    expect((await abrirCom({ relato: 'Trava', campos: { Sistema: 'LineReports', Prioridade: 'alta' } })).json().error).toBe('O painel Projetos não tem o campo "Prioridade".');
    const ok = await abrirCom({ relato: 'Trava', campos: { sistema: 'linereports', [prazo.id]: '15/12/2026' } });
    expect(ok.statusCode, ok.body).toBe(201);
    const f = await ficha(ok.json().codigo);
    const reports = sistema.opcoes.find((o: any) => o.nome === 'LineReports').id;
    expect(f.campos).toEqual({ [sistema.id]: reports, [prazo.id]: '2026-12-15' });
    // a etapa Entregue pede a versão: a ficha diz, e mover sem ela é recusado com o nome do campo
    const entregue = p.etapas[2];
    expect(f.faltam[entregue.id]).toEqual([`campo:${versao.id}`]);
    const mover = await s.post(`/atendimento/chamados/${f.id}/mover`, { etapaId: entregue.id });
    expect(mover.json()).toMatchObject({ error: 'Para ir para Entregue, falta preencher: Versão publicada.', details: { faltam: [`campo:${versao.id}`] } });
  });

  it('mudar os campos no chamado: o histórico diz o de antes e o de agora; vazio tira; a busca acha', async () => {
    const t = (await abrirCom({ titulo: 'Relatório de filas', relato: 'Zerado', campos: { Sistema: 'LinePBX' } })).json();
    const r = await s.patch(`/atendimento/chamados/${t.id}`, { campos: { [versao.id]: ' 2026.10.2 ', Sistema: 'LineReports' } });
    expect(r.statusCode, r.body).toBe(200);
    const f = r.json();
    expect(f.campos[versao.id]).toBe('2026.10.2');
    const textos = eventos(f, 'campo').map((e: any) => e.texto);
    expect(textos).toContain('mudou Sistema de "LinePBX" para "LineReports"');
    expect(textos).toContain('mudou Versão publicada para "2026.10.2"');
    // mandar o mesmo valor não vira histórico
    const igual = await s.patch(`/atendimento/chamados/${t.id}`, { campos: { [versao.id]: '2026.10.2' } });
    expect(eventos(igual.json(), 'campo')).toHaveLength(textos.length);
    // agora a etapa que pede a versão aceita
    expect((await s.post(`/atendimento/chamados/${t.id}/mover`, { etapaId: p.etapas[2].id })).statusCode).toBe(200);
    const lista = (await s.get(`/atendimento/chamados?painel=${p.id}&situacao=todos&q=2026.10.2`)).json();
    expect(lista.items.map((c: any) => c.codigo)).toEqual([t.codigo]);
    const tirou = await s.patch(`/atendimento/chamados/${t.id}`, { campos: { [prazo.id]: null, [versao.id]: '' } });
    expect(tirou.json().campos[versao.id]).toBeUndefined();
    expect(eventos(tirou.json(), 'campo').at(-1).texto).toBe('mudou Versão publicada de "2026.10.2" para (vazio)');
    expect((await s.patch(`/atendimento/chamados/${t.id}`, { campos: { [prazo.id]: 'amanhã' } })).json().error).toBe('Previsão de entrega: escreva a data (dia/mês/ano)');
  });

  it('a opção que sai fica desativada: o chamado que a tem continua com ela; o novo não pode escolher', async () => {
    const t = (await abrirCom({ relato: 'PBX', campos: { Sistema: 'LinePBX' } })).json();
    const pbx = sistema.opcoes.find((o: any) => o.nome === 'LinePBX').id;
    const r = await s.put(`/atendimento/campos/${sistema.id}`, { nome: 'Sistema', tipo: 'lista', opcoes: [{ id: sistema.opcoes[1].id, nome: 'LineReports' }, { nome: 'LineChat' }], obrigatorioAoAbrir: true });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().opcoes.map((o: any) => [o.nome, o.ativa])).toEqual([['LineReports', true], ['LineChat', true], ['LinePBX', false]]);
    sistema = r.json();
    expect((await ficha(t.codigo)).campos[sistema.id]).toBe(pbx);
    expect((await abrirCom({ relato: 'PBX', campos: { Sistema: 'LinePBX' } })).json().error).toBe('Sistema: "LinePBX" não é uma das opções (LineReports, LineChat)');
    // o tipo não muda depois de criado
    const tipo = await s.put(`/atendimento/campos/${sistema.id}`, { nome: 'Sistema', tipo: 'texto' });
    expect(tipo.json().error).toBe('O tipo do campo não muda depois de criado (Sistema é Lista (escolhe uma opção)). Crie outro campo e desative este.');
  });

  it('desativar o campo: sai das regras e da ficha; o valor fica guardado (e volta se reativar)', async () => {
    const t = (await abrirCom({ relato: 'Com versão', campos: { Sistema: 'LineChat', [versao.id]: '1.0' } })).json();
    const r = await s.put(`/atendimento/campos/${versao.id}`, { nome: 'Versão publicada', tipo: 'texto', ativo: false, etapas: [p.etapas[2].id] });
    expect(r.statusCode, r.body).toBe(200);
    expect((await painelAgora()).etapas[2].obrigatorios).toEqual([]);
    const f = await ficha(t.codigo);
    expect(f.campos[versao.id]).toBeUndefined();
    expect(((await linha(t.codigo)).customFields as Record<string, unknown>)[versao.id]).toBe('1.0');
    expect((await s.patch(`/atendimento/chamados/${t.id}`, { campos: { [versao.id]: '2.0' } })).json().error).toBe('O campo Versão publicada foi desativado no painel Projetos.');
    await s.put(`/atendimento/campos/${versao.id}`, { nome: 'Versão publicada', tipo: 'texto', ativo: true, etapas: [p.etapas[2].id] });
    expect((await ficha(t.codigo)).campos[versao.id]).toBe('1.0');
    expect((await painelAgora()).etapas[2].obrigatorios).toEqual([`campo:${versao.id}`]);
    expect(await auditoria()).toContain('Desativou o campo Versão publicada no painel Projetos');
  });

  it('a ordem dos campos; o CSV ganha uma coluna por campo; quem não cuida dos chamados não mexe', async () => {
    const todos = (await opcoesDoServidor()).campos.filter((c: any) => c.painelId === p.id);
    const nova = [...todos].reverse().map((c: any) => c.id);
    const r = await s.put(`/atendimento/paineis/${p.id}/campos/ordem`, { ids: nova });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().map((c: any) => c.id)).toEqual(nova);
    expect((await s.put(`/atendimento/paineis/${p.id}/campos/ordem`, { ids: nova.slice(1) })).statusCode).toBe(400);
    const csv = await s.get(`/atendimento/chamados/exportar?painel=${p.id}&situacao=todos`);
    expect(csv.statusCode).toBe(200);
    const cab = csv.body.replace(/^﻿/, '').split('\r\n')[0]!.split(';');
    expect(cab.slice(-3)).toEqual(['Previsão de entrega', 'Versão publicada', 'Sistema']);
    expect((await operador.post(`/atendimento/paineis/${p.id}/campos`, { nome: 'X', tipo: 'texto' })).statusCode).toBe(403);
    expect((await operador.put(`/atendimento/campos/${sistema.id}`, { nome: 'X', tipo: 'lista', opcoes: [{ nome: 'A' }] })).statusCode).toBe(403);
    expect((await operador.put(`/atendimento/paineis/${p.id}/campos-do-sistema`, { desligados: [], tipos: [] })).statusCode).toBe(403);
  });
});

// =====================================================================

describe('os assuntos', () => {
  let ramal = '';
  let config = '';
  let identidade = '';
  let ura = '';
  let horario = '';
  const criar = (d: Record<string, unknown>, painelId = SUP) => s.post(`/atendimento/paineis/${painelId}/assuntos`, d);

  it('até 3 níveis: o quarto é recusado', async () => {
    const r1 = await criar({ nome: 'Ramal', checklist: ['Testar o ramal', 'Testar o ramal'] });
    expect(r1.statusCode, r1.body).toBe(201);
    ramal = r1.json().id;
    expect(r1.json()).toMatchObject({ painelId: SUP, paiId: null, nome: 'Ramal', ativo: true, checklist: ['Testar o ramal'] });
    config = (await criar({ nome: 'Configuração', paiId: ramal })).json().id;
    const r3 = await criar({ nome: 'Identidade', paiId: config, descricao: 'O nome que aparece na ligação' });
    expect(r3.statusCode).toBe(201);
    identidade = r3.json().id;
    const r4 = await criar({ nome: 'Nome curto', paiId: identidade });
    expect(r4.statusCode).toBe(400);
    expect(r4.json().error).toMatch(/até 3 níveis/);
  });

  it('nome repetido entre irmãos (sem acento e sem maiúscula): 409; em outro lugar da árvore pode', async () => {
    const r = await criar({ nome: 'configuracao', paiId: ramal });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('Já existe o assunto Ramal › Configuração neste painel.');
    expect((await criar({ nome: 'RAMAL' })).statusCode).toBe(409);
    expect((await criar({ nome: 'Configuração' })).statusCode).toBe(201);
    // o mesmo nome em outro painel também pode
    expect((await criar({ nome: 'Ramal' }, DEV)).statusCode).toBe(201);
  });

  it('sem círculo, e mover leva os de baixo junto (respeitando os 3 níveis)', async () => {
    const circulo = await s.put(`/atendimento/assuntos/${ramal}`, { nome: 'Ramal', paiId: identidade });
    expect(circulo.statusCode).toBe(400);
    expect(circulo.json().error).toMatch(/círculo/);
    expect((await s.put(`/atendimento/assuntos/${ramal}`, { nome: 'Ramal', paiId: ramal })).json().error).toBe('Um assunto não pode ficar dentro dele mesmo.');

    ura = (await criar({ nome: 'URA' })).json().id;
    horario = (await criar({ nome: 'Horário', paiId: ura })).json().id;
    // Configuração (com a Identidade embaixo) dentro de URA › Horário daria 4 níveis
    const fundo = await s.put(`/atendimento/assuntos/${config}`, { nome: 'Configuração', paiId: horario });
    expect(fundo.statusCode).toBe(400);
    expect(fundo.json().error).toMatch(/e Configuração tem assuntos embaixo dele/);
    // o pai de outro painel não serve
    const devRamal = (await s.get('/atendimento/opcoes')).json().assuntos.find((x: any) => x.painelId === DEV).id;
    expect((await s.put(`/atendimento/assuntos/${config}`, { nome: 'Configuração', paiId: devRamal })).statusCode).toBe(400);
  });

  it('desativar é ativo: false (o assunto continua na árvore)', async () => {
    const r = await s.put(`/atendimento/assuntos/${identidade}`, { nome: 'Identidade', paiId: config, ativo: false, dePara: ['Ramal - Identidade'] });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ ativo: false, dePara: ['Ramal - Identidade'], descricao: null });
    expect(await auditoria()).toContain('Desativou o assunto Ramal › Configuração › Identidade no painel Suporte');
  });

  it('colar a lista: cria o que falta e acha o que já existe pelo caminho (sem acento e maiúscula)', async () => {
    const texto = [
      'ramal - configuracao - IDENTIDADE',
      'Ramal - Configuração - Senha do ramal',
      'URA > Horário > Feriado',
      'Fila — o que fazer com a fila de espera',
    ].join('\n');
    const r = await s.post(`/atendimento/paineis/${SUP}/assuntos/colar`, { texto });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ criados: 3, jaExistiam: 5 });
    const todos = await app.db.select().from(ticketSubjects).where(eq(ticketSubjects.panelId, SUP));
    const achar = (nome: string) => todos.find((x) => x.name === nome)!;
    expect(achar('Senha do ramal').parentId).toBe(config);
    expect(achar('Feriado').parentId).toBe(horario);
    expect(achar('Fila')).toMatchObject({ parentId: null, description: 'o que fazer com a fila de espera' });
    // colar de novo não cria nada
    expect((await s.post(`/atendimento/paineis/${SUP}/assuntos/colar`, { texto })).json()).toEqual({ criados: 0, jaExistiam: 8 });
    expect((await s.post(`/atendimento/paineis/${SUP}/assuntos/colar`, { texto: '  \n\n' })).statusCode).toBe(400);
    expect(await auditoria()).toContain('Colou a lista de assuntos no painel Suporte: 3 criados, 5 já existiam');
  });
});

// =====================================================================

describe('os prazos', () => {
  it('grava e volta (os feriados em ordem de data)', async () => {
    const atual = (await s.get('/atendimento/ajustes/prazos')).json();
    expect(atual).toMatchObject({ alertaPercentual: 80, semDonoMinutos: 15 });
    expect(atual.calendario.horario).toHaveLength(7);
    const novo = {
      ...atual, alertaPercentual: 70, semDonoMinutos: 30,
      prazos: { ...atual.prazos, critica: { resposta: 10, solucao: 120, conta: 'corridas' } },
      calendario: { ...atual.calendario, feriados: [{ data: '2026-12-31', nome: 'Véspera de Ano Novo', atende: true }, { data: '2026-10-12', nome: 'Nossa Senhora Aparecida', atende: false }] },
    };
    const r = await s.put('/atendimento/ajustes/prazos', novo);
    expect(r.statusCode, r.body).toBe(200);
    const volta = (await s.get('/atendimento/ajustes/prazos')).json();
    expect(volta).toMatchObject({ alertaPercentual: 70, semDonoMinutos: 30, prazos: { critica: { resposta: 10, solucao: 120, conta: 'corridas' } } });
    expect(volta.calendario.feriados.map((f: any) => f.data)).toEqual(['2026-10-12', '2026-12-31']);
    expect(await auditoria()).toContain('Mudou os prazos dos chamados: os feriados, os prazos por prioridade, o aviso de prazo (70%) e o aviso de sem responsável (30 min)');
  });

  it('horário com o fim antes do começo: 400', async () => {
    const atual = (await s.get('/atendimento/ajustes/prazos')).json();
    const horario = [...atual.calendario.horario];
    horario[1] = { abre: true, inicio: '18:00', fim: '08:00' };
    expect((await s.put('/atendimento/ajustes/prazos', { ...atual, calendario: { ...atual.calendario, horario } })).statusCode).toBe(400);
  });
});

// =====================================================================

describe('os avisos (o WhatsApp dos chamados)', () => {
  const chave = `chave-falsa-${Math.random()}`;
  const enviados: Array<{ url: string; corpo: any; auth: string }> = [];
  let falhar = false;
  const avisos = (o: Record<string, unknown> = {}) => ({
    ativo: true, url: 'https://api.exemplo.com.br/chat/v1/message/send', usarChaveDoLineChat: false,
    numeroCliente: '(71) 3034-8350', numeroEquipe: '71 99999-0000', envioCliente: 'texto', modeloCliente: AVISOS_CHAMADOS_PADRAO.modeloCliente, template: null,
    pessoas: [{ userId: marinaId, numero: '(71) 98888-7777', ativo: true }], eventos: EVENTOS_AVISO_PADRAO, ...o,
  });

  beforeAll(() => {
    trocarFerramentasWhatsApp({
      fetchFn: (async (url: string, init: RequestInit) => {
        enviados.push({ url, corpo: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).Authorization) });
        return falhar ? new Response('erro interno', { status: 500 }) : new Response('{"ok":true}', { status: 200 });
      }) as unknown as typeof fetch,
    });
  });
  afterAll(() => { trocarFerramentasWhatsApp({ fetchFn: recusar }); });

  it('a chave vai para o cofre e nunca volta (nem na auditoria)', async () => {
    const vazio = (await s.get('/atendimento/ajustes/avisos')).json();
    expect(vazio).toMatchObject({ ativo: false, temChavePropria: false, temChaveLineChat: false });

    const r = await s.put('/atendimento/ajustes/avisos', avisos({ chave }));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ ativo: true, temChavePropria: true, numeroCliente: '557130348350', numeroEquipe: '5571999990000' });
    expect(r.body).not.toContain(chave);
    expect(r.json()).not.toHaveProperty('chave');

    const tela = (await s.get('/atendimento/ajustes/avisos')).json();
    expect(JSON.stringify(tela)).not.toContain(chave);
    // as pessoas: todos os usuários ativos, com o número guardado ou vazio
    expect(tela.pessoas).toEqual(expect.arrayContaining([
      { userId: adminId, nome: 'Administrador', numero: '', ativo: true },
      { userId: marinaId, nome: 'Marina Costa', numero: '5571988887777', ativo: true },
      { userId: brunoId, nome: 'Bruno Técnico', numero: '', ativo: true },
    ]));
    expect(tela.pessoas).toHaveLength(3);

    const [linha] = await app.db.select().from(settings).where(eq(settings.id, 'atendimento-avisos'));
    expect(linha!.value).not.toContain(chave);
    expect(linha!.secretId).toBeTruthy();
    expect(await integ.segredo(app.db, app.vault, 'atendimento-avisos')).toBe(chave);
    const audit = await auditoria();
    expect(audit).not.toContain(chave);
    expect(audit).toContain('Ligou o WhatsApp dos chamados e trocou a chave da API');
  });

  it('salvar sem a chave mantém a que está guardada', async () => {
    const r = await s.put('/atendimento/ajustes/avisos', avisos({ modeloCliente: 'Olá, {contato}! {texto}' }));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ temChavePropria: true, modeloCliente: 'Olá, {contato}! {texto}' });
    expect(await integ.segredo(app.db, app.vault, 'atendimento-avisos')).toBe(chave);
  });

  it('a pessoa da lista precisa existir', async () => {
    expect((await s.put('/atendimento/ajustes/avisos', avisos({ pessoas: [{ userId: 'nao-existe', numero: '71988887777', ativo: true }] }))).statusCode).toBe(400);
  });

  it('testar manda a mensagem para a pessoa e guarda o resultado', async () => {
    const r = await s.post('/atendimento/ajustes/avisos/testar', { userId: marinaId });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ ok: true });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({
      url: 'https://api.exemplo.com.br/chat/v1/message/send', auth: `Bearer ${chave}`,
      corpo: { from: '5571999990000', to: '5571988887777', body: { text: 'Teste do Ingline Gestão: os avisos dos chamados vão chegar por aqui.' }, options: { hiddenSession: true } },
    });
    expect((await s.get('/atendimento/ajustes/avisos')).json()).toMatchObject({ ultimoTesteOk: true, ultimoTesteEm: expect.any(String) });

    // pelo número oficial (o do cliente), para um número digitado
    expect((await s.post('/atendimento/ajustes/avisos/testar', { de: 'cliente', numero: '(71) 97777-6666' })).json().ok).toBe(true);
    expect(enviados[1]!.corpo).toMatchObject({ from: '557130348350', to: '5571977776666' });

    // a API recusou: o resultado (e o motivo) ficam guardados
    falhar = true;
    const ruim = await s.post('/atendimento/ajustes/avisos/testar', { userId: marinaId });
    expect(ruim.json()).toMatchObject({ ok: false, mensagem: expect.stringMatching(/respondeu 500/) });
    expect((await s.get('/atendimento/ajustes/avisos')).json()).toMatchObject({ ultimoTesteOk: false, ultimoTesteMsg: expect.stringMatching(/500/) });
    falhar = false;

    // quem não tem número guardado: 400 (nada sai)
    expect((await s.post('/atendimento/ajustes/avisos/testar', { userId: brunoId })).statusCode).toBe(400);
    expect(enviados).toHaveLength(3);
  });

  it('o modelo aprovado: as variáveis, o arquivo e quem fica com a conversa são conferidos ao salvar', async () => {
    const modelo = { id: 'b6a1f0c2-1111-4c2d-9e3f-0a1b2c3d4e5f', nome: 'ticket_atualizacao', variaveis: [{ nome: '1', valor: '{contato}' }, { nome: '2', valor: '{codigo}' }] };
    const r = await s.put('/atendimento/ajustes/avisos', avisos({ envioCliente: 'modelo', template: modelo, equipeLineChat: 'Suporte', atribuirAQuemManda: true }));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ envioCliente: 'modelo', template: { ...modelo, texto: '', tipoArquivo: 'UNDEFINED', arquivo: '' }, equipeLineChat: 'Suporte', atribuirAQuemManda: true });
    expect(await auditoria()).toContain('ticket_atualizacao');
    const ruim = (o: Record<string, unknown>) => s.put('/atendimento/ajustes/avisos', avisos({ envioCliente: 'modelo', template: { ...modelo, ...o } }));
    expect((await ruim({ variaveis: [{ nome: '1', valor: '{contato}' }, { nome: '1', valor: '{codigo}' }] })).json().details[0].message).toBe('Uma variável repetida no modelo');
    expect((await ruim({ tipoArquivo: 'IMAGE', arquivo: 'http://exemplo.com.br/a.png' })).json().details[0].message).toBe('O arquivo do cabeçalho precisa de um endereço com https://');
    expect((await ruim({ id: '' })).statusCode).toBe(400);
  });

  it('busca os modelos aprovados do número oficial no LineChat (o canal pelo número; só os aprovados)', async () => {
    const pedidos: string[] = [];
    trocarFerramentasWhatsApp({
      fetchFn: (async (url: string) => {
        pedidos.push(url);
        if (url.includes('/chat/v1/channel')) {
          return new Response(JSON.stringify([
            { id: 'canal-equipe', type: 'ZAPI_WhatsApp', number: '5571999990000' },
            { id: 'canal-oficial', type: 'CloudAPI_WhatsApp', number: '557130348350' },
          ]), { status: 200 });
        }
        return new Response(JSON.stringify({
          hasMorePages: false,
          items: [
            { id: 'm2', name: 'ticket_atualizacao', text: 'Olá, {{nome}}! Novidade no {{chamado}}: {{mensagem}}', status: 'Approved', active: true, fileType: 'UNDEFINED', params: [{ name: 'nome' }, { name: 'chamado' }, { name: 'mensagem' }], categoryName: 'Utilidade' },
            { id: 'm1', name: 'boas_vindas', text: 'Bem-vindo!', status: 'Approved', active: true, fileType: 'IMAGE', params: [], footerText: 'Ingline' },
            { id: 'm3', name: 'rascunho', text: 'x', status: 'Draft', active: true, params: [] },
          ],
        }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    try {
      const r = await s.get('/atendimento/ajustes/avisos/modelos');
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json()).toEqual({
        canal: { id: 'canal-oficial', numero: '557130348350', oficial: true },
        modelos: [
          { id: 'm1', nome: 'boas_vindas', texto: 'Bem-vindo!', rodape: 'Ingline', variaveis: [], tipoArquivo: 'IMAGE', categoria: null },
          { id: 'm2', nome: 'ticket_atualizacao', texto: 'Olá, {{nome}}! Novidade no {{chamado}}: {{mensagem}}', rodape: null, variaveis: ['nome', 'chamado', 'mensagem'], tipoArquivo: 'UNDEFINED', categoria: 'Utilidade' },
        ],
      });
      expect(pedidos[0]).toBe('https://api.exemplo.com.br/chat/v1/channel?ChannelType=Whatsapp');
      expect(pedidos[1]).toContain('https://api.exemplo.com.br/chat/v1/template?ChannelId=canal-oficial&ApprovedOnly=true');
      expect(pedidos[1]).toContain('IncludeDetails=Params');
      // o número que não é canal do LineChat
      await s.put('/atendimento/ajustes/avisos', avisos({ numeroCliente: '(71) 3333-4444' }));
      const fora = await s.get('/atendimento/ajustes/avisos/modelos');
      expect(fora.statusCode).toBe(400);
      expect(fora.json().error).toBe('O número (71) 3333-4444 não está entre os canais de WhatsApp do LineChat. Confira o número para o cliente.');
      expect((await operador.get('/atendimento/ajustes/avisos/modelos')).statusCode).toBe(403);
    } finally {
      trocarFerramentasWhatsApp({ fetchFn: recusar });
    }
  });
});

// =====================================================================

describe('as integrações', () => {
  it('webhook para a rede de dentro (ou sem https) é recusado', async () => {
    trocarFerramentasWebhook({ resolver: async () => ['10.0.0.8'] });
    const r = await s.post('/atendimento/integracoes/webhooks', { nome: 'n8n', url: 'https://n8n.interno.exemplo.com.br/webhook', eventos: ['chamado.criado'] });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/rede de dentro/);
    expect((await s.post('/atendimento/integracoes/webhooks', { nome: 'n8n', url: 'https://localhost/webhook', eventos: ['chamado.criado'] })).statusCode).toBe(400);
    expect((await s.post('/atendimento/integracoes/webhooks', { nome: 'n8n', url: 'http://n8n.exemplo.com.br/webhook', eventos: ['chamado.criado'] })).statusCode).toBe(400);
    trocarFerramentasWebhook({ resolver: async () => ['203.0.113.10'] });
  });

  it('o segredo da assinatura volta só ao criar (ou ao pedir um novo); o teste vai assinado', async () => {
    const r = await s.post('/atendimento/integracoes/webhooks', { nome: 'n8n', url: 'https://n8n.exemplo.com.br/webhook/chamados', eventos: ['chamado.criado', 'chamado.movido'] });
    expect(r.statusCode, r.body).toBe(201);
    const { webhook, segredo } = r.json();
    expect(segredo).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(webhook).toMatchObject({ nome: 'n8n', ativo: true, temSegredo: true, eventos: ['chamado.criado', 'chamado.movido'], ultimoEm: null });

    const tela = (await s.get('/atendimento/integracoes')).json();
    expect(tela.webhooks).toHaveLength(1);
    expect(JSON.stringify(tela)).not.toContain(segredo);
    expect(await auditoria()).not.toContain(segredo);
    const [linha] = await app.db.select().from(ticketWebhooks).where(eq(ticketWebhooks.id, webhook.id));
    expect((await app.vault.read(app.db, linha!.secretId!))!.value).toBe(segredo);

    // mudar sem pedir assinatura nova: o segredo não volta (e não muda)
    const mudar = await s.put(`/atendimento/integracoes/webhooks/${webhook.id}`, { nome: 'n8n (NIA)', url: 'https://n8n.exemplo.com.br/webhook/chamados', eventos: ['chamado.criado'], ativo: false });
    expect(mudar.statusCode, mudar.body).toBe(200);
    expect(mudar.json()).toMatchObject({ segredo: null, webhook: { nome: 'n8n (NIA)', ativo: false, eventos: ['chamado.criado'] } });
    expect((await app.vault.read(app.db, linha!.secretId!))!.value).toBe(segredo);

    // assinatura nova: volta uma vez, no mesmo lugar do cofre
    const novo = (await s.put(`/atendimento/integracoes/webhooks/${webhook.id}`, { nome: 'n8n (NIA)', url: 'https://n8n.exemplo.com.br/webhook/chamados', eventos: ['chamado.criado'], ativo: true, novoSegredo: true })).json();
    expect(novo.segredo).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(novo.segredo).not.toBe(segredo);
    expect((await app.vault.read(app.db, linha!.secretId!))!.value).toBe(novo.segredo);

    // o teste: o evento "teste", assinado com o segredo de agora
    const recebidos: Array<{ url: string; headers: Record<string, string>; corpo: string }> = [];
    trocarFerramentasWebhook({
      fetchFn: (async (url: string, init: RequestInit) => {
        recebidos.push({ url, headers: init.headers as Record<string, string>, corpo: String(init.body) });
        return new Response('ok', { status: 200 });
      }) as unknown as typeof fetch,
    });
    const teste = await s.post(`/atendimento/integracoes/webhooks/${webhook.id}/testar`, {});
    trocarFerramentasWebhook({ fetchFn: recusar });
    expect(teste.statusCode, teste.body).toBe(200);
    expect(teste.json()).toMatchObject({ ok: true, mensagem: 'teste: recebido (200)' });
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]!.headers['X-Gestor-Evento']).toBe('teste');
    expect(recebidos[0]!.headers['X-Gestor-Assinatura']).toBe(assinatura(novo.segredo, recebidos[0]!.corpo));
    expect(JSON.parse(recebidos[0]!.corpo)).toMatchObject({ evento: 'teste', chamado: null });
    expect((await s.get('/atendimento/integracoes')).json().webhooks[0]).toMatchObject({ ultimoOk: true, ultimaMsg: 'teste: recebido (200)' });

    // tirar: sai da lista (e do banco não se apaga)
    expect((await s.del(`/atendimento/integracoes/webhooks/${webhook.id}`)).statusCode).toBe(200);
    expect((await s.get('/atendimento/integracoes')).json().webhooks).toEqual([]);
    const [tirado] = await app.db.select().from(ticketWebhooks).where(eq(ticketWebhooks.id, webhook.id));
    expect(tirado!.deletedAt).not.toBeNull();
    expect((await s.post(`/atendimento/integracoes/webhooks/${webhook.id}/testar`, {})).statusCode).toBe(404);
  });

  it('a chave de API aparece uma vez: no banco ficam só o sha256 e o começo; revogar', async () => {
    const r = await s.post('/atendimento/integracoes/chaves', { nome: 'Robô do LineChat' });
    expect(r.statusCode, r.body).toBe(201);
    const { chave, valor } = r.json();
    expect(valor).toMatch(/^gst_[A-Za-z0-9_-]{43}$/);
    expect(chave).toMatchObject({ nome: 'Robô do LineChat', inicio: valor.slice(0, 8), criadaPor: 'Administrador', usadaEm: null, revogadaEm: null });

    const [linha] = await app.db.select().from(ticketApiKeys).where(eq(ticketApiKeys.id, chave.id));
    expect(linha!.hash).toBe(createHash('sha256').update(valor).digest('hex'));
    expect(linha!.prefix).toBe(valor.slice(0, 8));
    expect(JSON.stringify(linha)).not.toContain(valor);
    const tela = (await s.get('/atendimento/integracoes')).json();
    expect(tela.chaves).toHaveLength(1);
    expect(JSON.stringify(tela)).not.toContain(valor);
    const audit = await auditoria();
    expect(audit).not.toContain(valor);
    expect(audit).toContain(`Criou a chave de API Robô do LineChat (${valor.slice(0, 8)}…)`);

    // a chave criada aqui abre chamado pela entrada das integrações (servidor para servidor)
    const entrada = (k: string) => app.inject({ method: 'POST', url: '/api/atendimento/entrada/chamado', headers: { authorization: `Bearer ${k}` }, payload: { titulo: 'Aberto pelo robô' } });
    expect((await entrada(valor)).statusCode).toBe(201);
    expect((await s.get('/atendimento/integracoes')).json().chaves[0].usadaEm).toEqual(expect.any(String));

    // revogada, para de entrar na hora
    expect((await s.del(`/atendimento/integracoes/chaves/${chave.id}`)).statusCode).toBe(200);
    const [revogada] = await app.db.select().from(ticketApiKeys).where(eq(ticketApiKeys.id, chave.id));
    expect(revogada!.revokedAt).not.toBeNull();
    expect((await s.get('/atendimento/integracoes')).json().chaves[0].revogadaEm).toEqual(expect.any(String));
    expect((await entrada(valor)).statusCode).toBe(401);
    expect((await s.del('/atendimento/integracoes/chaves/nao-existe')).statusCode).toBe(404);
  });

  it('os sites do iframe e o link da conversa', async () => {
    const r = await s.put('/atendimento/integracoes/sites', { sites: ['https://App.Exemplo.com.br/', 'https://app.exemplo.com.br', 'https://outro.exemplo.com.br:8443'] });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ sites: ['https://app.exemplo.com.br', 'https://outro.exemplo.com.br:8443'] });
    expect((await s.put('/atendimento/integracoes/sites', { sites: ['http://app.exemplo.com.br'] })).statusCode).toBe(400);
    expect((await s.put('/atendimento/integracoes/sites', { sites: ['https://app.exemplo.com.br/menu'] })).statusCode).toBe(400);

    expect((await s.put('/atendimento/integracoes/link-conversa', { linkConversa: 'https://app.inglinechat.com.br/chat' })).statusCode).toBe(400);
    const link = await s.put('/atendimento/integracoes/link-conversa', { linkConversa: 'https://app.inglinechat.com.br/chat/{sessao}' });
    expect(link.json()).toEqual({ linkConversa: 'https://app.inglinechat.com.br/chat/{sessao}' });

    const tela = (await s.get('/atendimento/integracoes')).json();
    expect(tela).toMatchObject({
      sites: ['https://app.exemplo.com.br', 'https://outro.exemplo.com.br:8443'],
      linkConversa: 'https://app.inglinechat.com.br/chat/{sessao}',
      endereco: 'http://localhost:5173',
    });
  });
});

// =====================================================================

describe('quem pode', () => {
  // pedidos válidos: o formato é conferido antes da permissão (um pedido torto daria 400, não 403)
  const duasEtapas = { etapas: [{ nome: 'Novo', tipo: 'entrada' }, { nome: 'Fechado', tipo: 'fechado' }] };

  it('o Operador trabalha nos chamados, mas não mexe nos ajustes do módulo: 403', async () => {
    expect((await operador.post('/atendimento/paineis', painel({ sigla: 'OPR' }))).statusCode).toBe(403);
    expect((await operador.put(`/atendimento/paineis/${SUP}/etapas`, duasEtapas)).statusCode).toBe(403);
    expect((await operador.post(`/atendimento/paineis/${SUP}/assuntos`, { nome: 'Fila' })).statusCode).toBe(403);
    expect((await operador.post(`/atendimento/paineis/${SUP}/assuntos/colar`, { texto: 'Fila' })).statusCode).toBe(403);
    expect((await operador.get('/atendimento/ajustes/prazos')).statusCode).toBe(403);
    expect((await operador.get('/atendimento/ajustes/avisos')).statusCode).toBe(403);
    expect((await operador.post('/atendimento/ajustes/avisos/testar', {})).statusCode).toBe(403);
    expect((await operador.del(`/atendimento/paineis/${DEV}`)).statusCode).toBe(403);
  });

  it('o Técnico não mexe nas integrações (nem nos ajustes): 403', async () => {
    expect((await tecnico.get('/atendimento/integracoes')).statusCode).toBe(403);
    expect((await tecnico.post('/atendimento/integracoes/chaves', { nome: 'minha' })).statusCode).toBe(403);
    expect((await tecnico.post('/atendimento/integracoes/webhooks', { nome: 'x', url: 'https://x.exemplo.com.br', eventos: ['chamado.criado'] })).statusCode).toBe(403);
    expect((await tecnico.put('/atendimento/integracoes/sites', { sites: [] })).statusCode).toBe(403);
    expect((await tecnico.put('/atendimento/integracoes/link-conversa', { linkConversa: '' })).statusCode).toBe(403);
    expect((await tecnico.put('/atendimento/ajustes/prazos', AJUSTES_PRAZOS_PADRAO)).statusCode).toBe(403);
    expect((await tecnico.put(`/atendimento/paineis/${SUP}/etapas`, duasEtapas)).statusCode).toBe(403);
    // e nada mudou
    expect((await s.get('/atendimento/integracoes')).json().chaves.map((c: any) => c.nome)).not.toContain('minha');
  });
});
