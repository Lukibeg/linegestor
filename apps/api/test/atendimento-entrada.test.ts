/**
 * Patch 1.10 — os chamados do Gestor (decisão 0047): a entrada das integrações (o robô do LineChat e
 * o n8n, com a chave de API).
 *
 *  - a chave: sem chave, errada ou revogada, 401 (antes de olhar o corpo); no cabeçalho ou no endereço;
 *    o uso fica anotado; a sessão de uma pessoa não serve
 *  - o robô abre: origem "robo", o código e o link de volta, o título de reserva, o painel pela sigla, o
 *    assunto pelo nome; a mesma conversa aberta não abre outro (nem com dois pedidos ao mesmo tempo)
 *  - o cliente escreveu: o "obrigado" não reabre o Resolvido, o "ainda está caindo" reabre e avisa o
 *    responsável; no aberto, fica no histórico
 *  - o n8n: lê o chamado, muda o assunto pelo caminho (ou pelo nome), move pelo nome da etapa e anota —
 *    pelas regras da tela, com a auditoria no nome da chave
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { clients, newId, ticketApiKeys, ticketSubjects, tickets } from '@gestor/db';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';
import { trocarFerramentasWhatsApp } from '../src/services/atendimento/whatsapp.js';
import { trocarFerramentasWebhook } from '../src/services/atendimento/webhooks.js';

let app: App;
let s: Session;         // administrador
let operador: Session;  // Marina
let marinaId = '';
let aurora = '';
let ramal = '';
let semAudio = '';
let antigo = '';
/** as chaves (o valor só existe aqui, gerado na hora: nunca vai para arquivo) */
let robo = { id: '', valor: '' };
let n8n = { id: '', valor: '' };
let revogada = { id: '', valor: '' };

const SUP = 'painel-suporte';
const DEV = 'painel-desenvolvimento';
const E = { novo: 'etapa-suporte-novo', n1: 'etapa-suporte-n1', n2: 'etapa-suporte-n2', resolvido: 'etapa-suporte-resolvido' };
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** A chave como o outro agente cria: `prefix` = os 8 primeiros caracteres, `hash` = o sha256 (hex) da chave inteira. */
async function novaChave(nome: string, revogar = false) {
  const valor = `chave-falsa-${Math.random()}`;
  const id = newId();
  await app.db.insert(ticketApiKeys).values({ id, name: nome, prefix: valor.slice(0, 8), hash: sha256(valor), revokedAt: revogar ? new Date() : null });
  return { id, valor };
}
/** Um pedido da integração: a chave no cabeçalho (ou no endereço, com `naQuery`); `chave: null` = sem chave. */
function pedido(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, o: { chave?: string | null; naQuery?: boolean } = {}) {
  const chave = o.chave === undefined ? n8n.valor : o.chave;
  let endereco = `/api/atendimento${url}`;
  const headers: Record<string, string> = {};
  if (chave && o.naQuery) endereco += `${endereco.includes('?') ? '&' : '?'}chave=${encodeURIComponent(chave)}`;
  else if (chave) headers.authorization = `Bearer ${chave}`;
  return app.inject({ method, url: endereco, payload: payload as any, headers });
}
const doRobo = (payload: unknown, o: { naQuery?: boolean } = {}) => pedido('POST', '/entrada/chamado', payload, { chave: robo.valor, ...o });
async function ficha(ref: string) {
  const r = await s.get(`/atendimento/chamados/${encodeURIComponent(ref)}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
const eventos = (f: any, tipo: string) => (f.historico as any[]).filter((e) => e.tipo === tipo);
async function auditoriaDe(id: string) {
  return ((await s.get(`/admin/audit?entityId=${id}&pageSize=200`)).json().items as any[]);
}

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const papeis = (await s.get('/admin/roles')).json();
  marinaId = (await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: papeis.find((r: any) => r.key === 'operador').id })).json().id;
  operador = new Session(app); await operador.login('marina@gestor.local', 'SenhaDeTeste!123');
  aurora = newId();
  await app.db.insert(clients).values({ id: aurora, tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora LTDA', cnpj: '11222333000181' });

  // a árvore: "Configuração" aparece em dois lugares (o nome sozinho não basta); "Antigo" foi desativado
  ramal = newId(); semAudio = newId(); antigo = newId();
  const fila = newId();
  await app.db.insert(ticketSubjects).values([
    { id: ramal, panelId: SUP, name: 'Ramal' },
    { id: semAudio, panelId: SUP, parentId: ramal, name: 'Sem áudio' },
    { id: newId(), panelId: SUP, parentId: ramal, name: 'Configuração' },
    { id: fila, panelId: SUP, name: 'Fila' },
    { id: newId(), panelId: SUP, parentId: fila, name: 'Configuração' },
    { id: antigo, panelId: SUP, name: 'Antigo', active: false },
    { id: newId(), panelId: DEV, name: 'Correção de tela' },
  ]);

  robo = await novaChave('Robô do LineChat');
  n8n = await novaChave('n8n');
  revogada = await novaChave('Chave antiga', true);

  const recusar = (async () => { throw new Error('rede desligada nos testes'); }) as unknown as typeof fetch;
  trocarFerramentasWhatsApp({ fetchFn: recusar });
  trocarFerramentasWebhook({ fetchFn: recusar, resolver: async () => ['203.0.113.10'], esperar: async () => {} });
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

// =====================================================================

describe('a chave de API', () => {
  it('sem chave, com chave errada ou revogada: 401 — antes de olhar o corpo do pedido', async () => {
    for (const chave of [null, 'chave-que-nao-existe', revogada.valor]) {
      const r = await pedido('POST', '/entrada/chamado', { relato: 'Meu ramal parou' }, { chave });
      expect(r.statusCode).toBe(401);
      expect(r.json().error).toBe('Chave de API inválida.');
      expect((await pedido('POST', '/entrada/chamado', { relato: 'x' }, { chave, naQuery: true })).statusCode).toBe(401);
    }
    // o corpo inválido com a chave errada continua 401 (não diz nada a quem não tem a chave)
    expect((await pedido('POST', '/entrada/chamado', {}, { chave: 'errada' })).statusCode).toBe(401);
    expect((await pedido('GET', '/integracao/chamados/SUP-1', undefined, { chave: null })).statusCode).toBe(401);
    expect((await pedido('POST', '/entrada/mensagem', { telefone: '71999990000', texto: 'oi' }, { chave: null })).statusCode).toBe(401);
    // a sessão de uma pessoa não serve: a entrada é só pela chave
    expect((await s.post('/atendimento/entrada/chamado', { relato: 'Meu ramal parou' })).statusCode).toBe(401);
    expect(await app.db.select().from(tickets)).toHaveLength(0);
    const [r] = await app.db.select().from(ticketApiKeys).where(eq(ticketApiKeys.id, revogada.id));
    expect(r!.lastUsedAt).toBeNull();
  });

  it('a chave criada em Chamados › Integrações entra; revogada, para na hora', async () => {
    const criada = await s.post('/atendimento/integracoes/chaves', { nome: 'n8n de produção' });
    expect(criada.statusCode, criada.body).toBe(201);
    const { chave, valor } = criada.json();
    expect((await pedido('GET', '/integracao/chamados/SUP-999', undefined, { chave: valor })).statusCode).toBe(404); // passou da chave
    expect((await s.del(`/atendimento/integracoes/chaves/${chave.id}`)).statusCode).toBe(200);
    const r = await pedido('GET', '/integracao/chamados/SUP-999', undefined, { chave: valor });
    expect(r.statusCode).toBe(401);
    expect(r.json().error).toBe('Chave de API inválida.');
  });

  it('o pedido que vem de outro site (o LineChat, o n8n) passa: a entrada é de servidor para servidor, com a chave', async () => {
    const r = await app.inject({
      method: 'POST', url: '/api/atendimento/entrada/mensagem', payload: { telefone: '(11) 90000-0000', texto: 'oi' },
      headers: { authorization: `Bearer ${n8n.valor}`, origin: 'https://app.inglinechat.com.br' },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ acao: 'ignorado' });
  });

  it('a chave no endereço (?chave=) também vale, e o uso fica anotado', async () => {
    const r = await pedido('GET', '/integracao/chamados/SUP-999', undefined, { naQuery: true });
    expect(r.statusCode).toBe(404); // passou da chave: o chamado é que não existe
    const [k] = await app.db.select().from(ticketApiKeys).where(eq(ticketApiKeys.id, n8n.id));
    expect(k!.lastUsedAt).not.toBeNull();
  });
});

// =====================================================================

describe('o robô abre o chamado', () => {
  it('cria com origem robô e devolve o código e o link (o robô manda ao cliente)', async () => {
    const r = await doRobo({ relato: 'Meu ramal parou', telefone: '(71) 99999-0000', nome: 'Joana', sessaoId: 'sessao-1' });
    expect(r.statusCode, r.body).toBe(201);
    const b = r.json();
    expect(b).toEqual({ criado: true, id: expect.any(String), codigo: 'SUP-1', numero: 1, link: expect.stringMatching(/\/atendimento\/SUP-1$/) });
    const f = await ficha('SUP-1');
    expect(f).toMatchObject({
      id: b.id, origem: 'robo', titulo: 'Atendimento de Joana', relato: 'Meu ramal parou', contato: { nome: 'Joana', telefone: '5571999990000' },
      sessaoId: 'sessao-1', etapaId: E.novo, criadoPor: null,
    });
    expect(f.historico[0]).toMatchObject({ tipo: 'criado', por: null, porNome: 'Robô do LineChat', texto: 'abriu o chamado (O robô do LineChat) em Novo' });
    const [t] = await app.db.select().from(tickets).where(eq(tickets.id, b.id));
    expect(t!.firstResponseAt).toBeNull();
    // a auditoria: o nome da chave, sem pessoa
    expect((await auditoriaDe(b.id))[0]).toMatchObject({ userId: null, action: 'create', summary: 'Robô do LineChat (chave de API) abriu SUP-1 "Atendimento de Joana"' });
    const [k] = await app.db.select().from(ticketApiKeys).where(eq(ticketApiKeys.id, robo.id));
    expect(k!.lastUsedAt).not.toBeNull();
  });

  it('a mesma conversa aberta não abre outro: o relato novo vira anotação', async () => {
    const r = await doRobo({ relato: 'Agora o 204 também', sessaoId: 'sessao-1' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ criado: false, codigo: 'SUP-1', numero: 1 });
    let f = await ficha('SUP-1');
    expect(f.anotacoesLista.map((n: any) => [n.texto, n.por, n.porNome])).toEqual([['Agora o 204 também', null, 'Robô do LineChat']]);
    expect((await auditoriaDe(f.id)).map((a) => a.summary)).toContain('Robô do LineChat (chave de API) anotou em SUP-1 o relato novo da mesma conversa');
    // sem relato novo: só devolve o código
    expect((await doRobo({ sessaoId: 'sessao-1' })).json()).toMatchObject({ criado: false, codigo: 'SUP-1' });
    f = await ficha('SUP-1');
    expect(f.anotacoesLista).toHaveLength(1);
    expect((await s.get('/atendimento/chamados?situacao=todos')).json().total).toBe(1);
  });

  it('dois pedidos da mesma conversa ao mesmo tempo: um chamado só', async () => {
    const [a, b] = await Promise.all([doRobo({ relato: 'Primeira mensagem', sessaoId: 'sessao-2' }), doRobo({ relato: 'Segunda mensagem', sessaoId: 'sessao-2' })]);
    expect([a.json().criado, b.json().criado].sort()).toEqual([false, true]);
    expect(a.json().codigo).toBe(b.json().codigo);
    expect(await app.db.select().from(tickets).where(eq(tickets.sessionId, 'sessao-2'))).toHaveLength(1);
  });

  it('o título: o enviado, "Atendimento de <nome>" ou "Chamado pelo WhatsApp"; o painel pela sigla; o assunto pelo nome', async () => {
    const a = (await doRobo({ titulo: 'Fila de espera parada', relato: 'Ninguém atende' })).json();
    expect((await ficha(a.codigo)).titulo).toBe('Fila de espera parada');
    const b = await doRobo({ telefone: '71 98888-7777' }, { naQuery: true });
    expect(b.statusCode, b.body).toBe(201);
    expect((await ficha(b.json().codigo)).titulo).toBe('Chamado pelo WhatsApp');
    const c = await doRobo({ painel: 'dev', titulo: 'Erro na tela de ramais', relato: 'A tela não abre', assunto: 'correcao de tela', prioridade: 'alta', etiquetas: ['robô'] });
    expect(c.json()).toMatchObject({ criado: true, codigo: 'DEV-1' });
    expect(await ficha('DEV-1')).toMatchObject({ assunto: { nome: 'Correção de tela' }, prioridade: 'alta', etiquetas: ['robô'], origem: 'robo' });
  });

  it('o telefone que o Gestor já conhece preenche o cliente', async () => {
    await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Aberto na tela', clienteId: aurora, contatoNome: 'Pedro', contatoTelefone: '(71) 97777-6666' });
    const r = (await doRobo({ relato: 'Voltou a cair', telefone: '5571977776666' })).json();
    expect(await ficha(r.codigo)).toMatchObject({ cliente: { id: aurora, nome: 'Clínica Aurora' }, contato: { nome: 'Pedro', telefone: '5571977776666' } });
  });

  it('o que não existe volta com a mensagem (400)', async () => {
    const erro = async (d: Record<string, unknown>) => {
      const r = await doRobo(d);
      expect(r.statusCode).toBe(400);
      return r.json().error;
    };
    expect(await erro({ painel: 'XYZ', relato: 'x' })).toBe('Não achei o painel "XYZ". Use a sigla (como SUP) ou o id do painel.');
    expect(await erro({ relato: 'x', telefone: '123' })).toBe('Telefone inválido: use DDD + número, como (71) 99999-0000.');
    expect(await erro({ relato: 'x', assunto: 'Impressora' })).toBe('Não achei o assunto "Impressora" no painel Suporte.');
    expect(await erro({ relato: 'x', clienteId: 'nao-existe' })).toBe('O cliente escolhido não existe (ou está na lixeira).');
    expect(await erro({ nome: 'Só o nome' })).toBe('Dados inválidos'); // nada que diga do que se trata
  });
});

// =====================================================================

describe('o cliente escreveu (o n8n repassa a mensagem)', () => {
  let id = '';
  beforeAll(async () => {
    // o SUP-1 foi resolvido, com a Marina de responsável (direto no banco: o caminho até o Resolvido está testado no núcleo)
    const [t] = await app.db.select({ id: tickets.id }).from(tickets).where(eq(tickets.code, 'SUP-1'));
    id = t!.id;
    await app.db.update(tickets).set({ stageId: E.resolvido, resolvedAt: new Date(), assigneeId: marinaId }).where(eq(tickets.id, id));
  });

  it('"obrigado" não reabre o Resolvido', async () => {
    for (const texto of ['Obrigado! Funcionou 👍', 'ok, valeu', '']) {
      const r = await pedido('POST', '/entrada/mensagem', { telefone: '(71) 99999-0000', texto });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json()).toEqual({ acao: 'ignorado', codigo: 'SUP-1' });
    }
    const f = await ficha('SUP-1');
    expect(f.situacao).toBe('resolvido');
    expect(eventos(f, 'cliente_respondeu')).toHaveLength(0);
  });

  it('"ainda está caindo" reabre e avisa o responsável', async () => {
    const r = await pedido('POST', '/entrada/mensagem', { telefone: '5571999990000', sessaoId: 'sessao-1', texto: 'Ainda está caindo' });
    expect(r.json()).toEqual({ acao: 'reaberto', codigo: 'SUP-1' });
    const f = await ficha('SUP-1');
    expect(f).toMatchObject({ situacao: 'aberto', etapaId: E.n1, reaberto: 1, resolvidoEm: null });
    const [respondeu, etapa, reaberto] = f.historico.slice(-3);
    expect(respondeu).toMatchObject({ tipo: 'cliente_respondeu', porNome: 'n8n', dados: { reabriu: true }, texto: 'o cliente respondeu e o chamado reabriu: "Ainda está caindo"' });
    expect(etapa).toMatchObject({ tipo: 'etapa', dados: { de: { nome: 'Resolvido' }, para: { nome: 'N1' } } });
    expect(reaberto).toMatchObject({ tipo: 'reaberto', texto: 'reabriu o chamado: o cliente respondeu' });
    const avisos = (await operador.get('/atendimento/avisos')).json().itens.map((a: any) => [a.tipo, a.texto]);
    expect(avisos).toEqual(expect.arrayContaining([['cliente_respondeu', 'O cliente respondeu no SUP-1 e o chamado reabriu: "Ainda está caindo"'], ['recebeu', 'O SUP-1 foi reaberto']]));
    expect((await auditoriaDe(id)).map((a) => a.summary)).toContain('n8n (chave de API): o cliente respondeu e SUP-1 reabriu');
  });

  it('no chamado aberto, a mensagem fica no histórico e avisa o responsável', async () => {
    const r = await pedido('POST', '/entrada/mensagem', { telefone: '71 99999-0000', texto: 'Mandei o print' });
    expect(r.json()).toEqual({ acao: 'registrado', codigo: 'SUP-1' });
    const f = await ficha('SUP-1');
    expect(f.situacao).toBe('aberto');
    expect(f.historico.at(-1)).toMatchObject({ tipo: 'cliente_respondeu', texto: 'o cliente respondeu: "Mandei o print"' });
    expect((await operador.get('/atendimento/avisos')).json().itens[0]).toMatchObject({ tipo: 'cliente_respondeu', texto: 'O cliente respondeu no SUP-1: "Mandei o print"' });
  });

  it('duas mensagens seguidas no Resolvido: a primeira reabre, a segunda fica registrada', async () => {
    const { id: outro, codigo } = (await doRobo({ relato: 'A fila não toca', telefone: '(71) 96666-5555', nome: 'Caio' })).json();
    await app.db.update(tickets).set({ stageId: E.resolvido, resolvedAt: new Date() }).where(eq(tickets.id, outro));
    const [a, b] = await Promise.all([
      pedido('POST', '/entrada/mensagem', { telefone: '71966665555', texto: 'Ainda está caindo' }),
      pedido('POST', '/entrada/mensagem', { telefone: '71966665555', texto: 'E agora o 204 também' }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect([a.json().acao, b.json().acao].sort()).toEqual(['reaberto', 'registrado']);
    const f = await ficha(codigo);
    expect(f.reaberto).toBe(1);
    expect(eventos(f, 'cliente_respondeu').map((e: any) => e.dados.reabriu).sort()).toEqual([false, true]);
  });

  it('sem chamado do contato (ou só fechados): ignorado', async () => {
    expect((await pedido('POST', '/entrada/mensagem', { telefone: '(11) 91234-5678', texto: 'Oi, tudo bem?' })).json()).toEqual({ acao: 'ignorado' });
  });
});

// =====================================================================

describe('o n8n mexe no chamado', () => {
  it('lê o chamado pelo código: o cartão, o relato, a descrição e a solução', async () => {
    const r = await pedido('GET', '/integracao/chamados/sup-1');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      codigo: 'SUP-1', titulo: 'Atendimento de Joana', relato: 'Meu ramal parou', descricao: null, solucao: null,
      painel: { id: SUP, sigla: 'SUP' }, etapa: { id: E.n1, nome: 'N1' }, link: expect.stringMatching(/\/atendimento\/SUP-1$/),
    });
    expect((await pedido('GET', '/integracao/chamados/SUP-999')).statusCode).toBe(404);
  });

  it('muda o assunto pelo caminho (ou pelo nome), e o resto pelas regras da tela', async () => {
    let r = await pedido('PATCH', '/integracao/chamados/SUP-1', { assunto: 'ramal > sem audio', descricao: 'Trocamos o cabo' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ assunto: { id: semAudio, caminho: 'Ramal › Sem áudio' }, descricao: 'Trocamos o cabo' });
    const f = await ficha('SUP-1');
    expect(eventos(f, 'campo').map((e: any) => [e.porNome, e.texto])).toEqual(expect.arrayContaining([
      ['n8n', 'mudou Assunto para "Ramal › Sem áudio"'], ['n8n', 'editou Descrição'],
    ]));
    expect((await auditoriaDe(f.id)).map((a) => a.summary)).toContain('n8n (chave de API) alterou SUP-1 "Atendimento de Joana": Descrição, Assunto');

    r = await pedido('PATCH', '/integracao/chamados/SUP-1', { assunto: 'Ramal' });
    expect(r.json().assunto.id).toBe(ramal);
    // o nome que aparece em dois lugares pede o caminho
    r = await pedido('PATCH', '/integracao/chamados/SUP-1', { assunto: 'configuração' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/^Há mais de um assunto "configuração" no painel Suporte: mande o caminho inteiro \(/);
    r = await pedido('PATCH', '/integracao/chamados/SUP-1', { assunto: 'Fila › Configuração' });
    expect(r.json().assunto).toMatchObject({ caminho: 'Fila › Configuração' });
    expect((await pedido('PATCH', '/integracao/chamados/SUP-1', { assunto: 'Antigo' })).json().error).toBe('O assunto "Antigo" foi desativado no painel Suporte.');
    expect((await pedido('PATCH', '/integracao/chamados/SUP-1', { assunto: 'Correção de tela' })).json().error).toBe('Não achei o assunto "Correção de tela" no painel Suporte.');
    // as regras da tela: trocar a prioridade sugerida pede o motivo
    r = await pedido('PATCH', '/integracao/chamados/SUP-1', { gravidade: 'inoperancia', alcance: 'empresa', prioridade: 'baixa' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('Trocar a prioridade sugerida pede o motivo.');
    // o assunto vazio tira o assunto
    expect((await pedido('PATCH', '/integracao/chamados/SUP-1', { assunto: '' })).json().assunto).toBeNull();
    await pedido('PATCH', '/integracao/chamados/SUP-1', { assunto: 'Ramal' });
  });

  it('move pelo nome da etapa, com as regras da tela (o que falta, o motivo de escalonar)', async () => {
    let r = await pedido('POST', '/integracao/chamados/SUP-1/mover', { etapa: 'n2', motivo: 'precisa do SBC' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ error: 'Para ir para N2, falta preencher: Cliente.', details: { faltam: ['cliente'] } });
    expect((await pedido('PATCH', '/integracao/chamados/SUP-1', { clienteId: aurora })).statusCode).toBe(200);
    r = await pedido('POST', '/integracao/chamados/SUP-1/mover', { etapa: 'N2' });
    expect(r.json().error).toBe('Escalonar pede o motivo.');
    r = await pedido('POST', '/integracao/chamados/SUP-1/mover', { etapa: 'n2', motivo: 'precisa do SBC' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ etapa: { id: E.n2, nome: 'N2' } });
    const f = await ficha('SUP-1');
    expect(eventos(f, 'etapa').at(-1)).toMatchObject({ porNome: 'n8n', texto: 'escalonou de N1 (N1) para N2 (N2): precisa do SBC' });
    expect((await auditoriaDe(f.id)).map((a) => a.summary)).toContain('n8n (chave de API) moveu SUP-1 de N1 para N2: precisa do SBC');
    r = await pedido('POST', '/integracao/chamados/SUP-1/mover', { etapa: 'Lugar nenhum' });
    expect(r.json().error).toBe('Não achei a etapa "Lugar nenhum" no painel Suporte (as etapas: Novo, N1, N2, N3, Em observação, Resolvido, Fechado).');
    // pelo id também
    expect((await pedido('POST', '/integracao/chamados/SUP-1/mover', { etapa: E.n1, motivo: 'voltou para o N1' })).json().etapa.nome).toBe('N1');
  });

  it('anota com o nome da chave', async () => {
    const r = await pedido('POST', '/integracao/chamados/SUP-1/anotacoes', { texto: 'A NIA leu a conversa' }, { naQuery: true });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().codigo).toBe('SUP-1');
    const f = await ficha('SUP-1');
    expect(f.anotacoesLista.at(-1)).toMatchObject({ texto: 'A NIA leu a conversa', por: null, porNome: 'n8n' });
    expect((await pedido('POST', '/integracao/chamados/SUP-1/anotacoes', { texto: '   ' })).statusCode).toBe(400);
  });
});

// =====================================================================

describe('os campos de cada painel pela integração', () => {
  it('o robô abre mesmo sem o que o painel pede para abrir; os campos vêm pelo nome; o painel sem assunto ignora o assunto', async () => {
    const campo = (await s.post(`/atendimento/paineis/${DEV}/campos`, { nome: 'Sistema', tipo: 'lista', opcoes: [{ nome: 'LinePBX' }, { nome: 'LineChat' }], obrigatorioAoAbrir: true })).json();
    expect(campo.id).toBeTruthy();
    const opcoes = (await s.get('/atendimento/opcoes')).json();
    const dev = opcoes.paineis.find((p: any) => p.id === DEV);
    await s.put(`/atendimento/paineis/${DEV}/campos-do-sistema`, { desligados: ['assunto'], tipos: dev.ajustes.tipos });

    // na tela, falta o Sistema; pelo robô, o chamado abre (o que faltar é pedido para andar)
    expect((await s.post('/atendimento/chamados', { painelId: DEV, titulo: 'Botão novo' })).json().error).toBe('Falta preencher: Sistema.');
    const sem = await doRobo({ painel: 'DEV', titulo: 'Pedido sem sistema', relato: 'Pelo WhatsApp' });
    expect(sem.statusCode, sem.body).toBe(201);

    const com = await doRobo({ painel: 'DEV', titulo: 'Pedido do robô', relato: 'Pelo WhatsApp', assunto: 'Correção de tela', campos: { sistema: 'linechat' } });
    expect(com.statusCode, com.body).toBe(201);
    const f = await ficha(com.json().codigo);
    const linechat = campo.opcoes.find((o: any) => o.nome === 'LineChat').id;
    expect(f.campos).toEqual({ [campo.id]: linechat });
    expect(f.assunto).toBeNull();
    expect((await doRobo({ painel: 'DEV', titulo: 'Pedido ruim', campos: { Versão: '1.0' } })).json().error).toBe('O painel Desenvolvimento não tem o campo "Versão".');

    // o n8n lê o valor pelo nome e muda pelo nome
    const lido = (await pedido('GET', `/integracao/chamados/${com.json().codigo}`)).json();
    expect(lido.camposDoPainel).toEqual([{ id: campo.id, nome: 'Sistema', tipo: 'lista', valor: linechat, texto: 'LineChat' }]);
    const mudou = await pedido('PATCH', `/integracao/chamados/${com.json().codigo}`, { campos: { Sistema: 'LinePBX' }, assunto: 'Correção de tela' });
    expect(mudou.statusCode, mudou.body).toBe(200);
    const depois = await ficha(com.json().codigo);
    expect(depois.campos[campo.id]).toBe(campo.opcoes.find((o: any) => o.nome === 'LinePBX').id);
    expect(eventos(depois, 'campo').at(-1)).toMatchObject({ texto: 'mudou Sistema de "LineChat" para "LinePBX"', porNome: 'n8n' });
    const auditoria = await auditoriaDe(depois.id);
    expect(auditoria.map((a: any) => a.summary).join('\n')).toContain('Campos do painel');
  });
});
