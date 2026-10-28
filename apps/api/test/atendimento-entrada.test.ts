/**
 * Patch 2.0 — os chamados do Gestor (decisão 0047): a entrada das integrações (o robô do LineChat e
 * o n8n, com a chave de API).
 *
 *  - a chave: sem chave, errada ou revogada, 401 (antes de olhar o corpo); no cabeçalho ou no endereço;
 *    o uso fica anotado; a sessão de uma pessoa não serve
 *  - o robô abre: origem "robo", o código e o link de volta, o título de reserva, o painel pela sigla, o
 *    assunto pelo nome; a mesma conversa aberta não abre outro (nem com dois pedidos ao mesmo tempo)
 *  - a mensagem do cliente (o n8n repassando) saiu no 2.0.1: o endereço não existe mais
 *  - o n8n: lê o chamado (com a sessão do LineChat), muda o assunto pelo caminho (ou pelo nome), move pelo
 *    nome da etapa e anota — pelas regras da tela, com a auditoria no nome da chave
 *  - a NIA (pelo n8n): as opções de verdade, só as ativas (`/integracao/opcoes`), com a chave
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { clients, newId, products, ticketApiKeys, ticketSubjects, tickets } from '@gestor/db';
import { GRAVIDADES, PRIORIDADES, TIPOS_PADRAO } from '@gestor/shared';
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
    expect((await pedido('POST', '/integracao/chamados/SUP-1/anotacoes', { texto: 'oi' }, { chave: null })).statusCode).toBe(401);
    // a sessão de uma pessoa não serve: a entrada é só pela chave
    expect((await s.post('/atendimento/entrada/chamado', { relato: 'Meu ramal parou' })).statusCode).toBe(401);
    expect(await app.db.select().from(tickets)).toHaveLength(0);
    const [r] = await app.db.select().from(ticketApiKeys).where(eq(ticketApiKeys.id, revogada.id));
    expect(r!.lastUsedAt).toBeNull();
  });

  it('a chave criada em Painéis › Ajustes › Integrações entra; revogada, para na hora', async () => {
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
    // (um chamado que não existe: o pedido passou do site e da chave, e só não achou o chamado)
    const r = await app.inject({
      method: 'POST', url: '/api/atendimento/integracao/chamados/SUP-999/anotacoes', payload: { texto: 'oi' },
      headers: { authorization: `Bearer ${n8n.valor}`, origin: 'https://app.inglinechat.com.br' },
    });
    expect(r.statusCode, r.body).toBe(404);
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

  it('as outras conversas do chamado (2.2): o robô acha o chamado aberto por qualquer uma delas', async () => {
    const f0 = await ficha('SUP-1');
    // a tela liga mais uma conversa (o código, ou o link) ao SUP-1; a principal e a repetida ficam de fora
    const r = await s.patch(`/atendimento/chamados/${f0.id}`, { outrasConversas: ['sessao-extra', 'sessao-1', 'sessao-extra'] });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().outrasConversas).toEqual([{ sessaoId: 'sessao-extra', url: null }]);
    const pelaOutra = await doRobo({ relato: 'Escrevi pelo outro número', sessaoId: 'sessao-extra' });
    expect(pelaOutra.statusCode, pelaOutra.body).toBe(200);
    expect(pelaOutra.json()).toMatchObject({ criado: false, codigo: 'SUP-1' });
    expect((await ficha('SUP-1')).anotacoesLista.at(-1).texto).toBe('Escrevi pelo outro número');
    // tirar todas: a lista vazia
    expect((await s.patch(`/atendimento/chamados/${f0.id}`, { outrasConversas: [] })).json().outrasConversas).toEqual([]);
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

describe('o n8n mexe no chamado', () => {
  beforeAll(async () => {
    // o SUP-1 (o do robô) está no N1, com a Marina de responsável (direto no banco: o caminho até lá está testado no núcleo)
    await app.db.update(tickets).set({ stageId: E.n1, assigneeId: marinaId }).where(eq(tickets.code, 'SUP-1'));
  });

  it('lê o chamado pelo código: o cartão, o relato, a descrição e a solução', async () => {
    const r = await pedido('GET', '/integracao/chamados/sup-1');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      codigo: 'SUP-1', titulo: 'Atendimento de Joana', relato: 'Meu ramal parou', descricao: null, solucao: null,
      painel: { id: SUP, sigla: 'SUP' }, etapa: { id: E.n1, nome: 'N1' }, link: expect.stringMatching(/\/atendimento\/SUP-1$/),
      // a sessão do LineChat (a conversa de onde veio): com ela, o n8n acha a conversa e lê o que o cliente disse
      sessaoId: 'sessao-1',
    });
    expect((await pedido('GET', '/integracao/chamados/SUP-999')).statusCode).toBe(404);
    // o chamado sem conversa: a sessão vem nula
    const semConversa = await doRobo({ relato: 'Liguei e ninguém atendeu', telefone: '(71) 98888-1212' });
    expect(semConversa.statusCode, semConversa.body).toBe(201);
    expect((await pedido('GET', `/integracao/chamados/${semConversa.json().codigo}`)).json().sessaoId).toBeNull();
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
    // as regras da tela: trocar a prioridade sugerida não pede mais o motivo (2.2)
    r = await pedido('PATCH', '/integracao/chamados/SUP-1', { gravidade: 'inoperancia', alcance: 'empresa', prioridade: 'baixa' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ prioridade: 'baixa' });
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
    expect(r.json().error).toBe('Não achei a etapa "Lugar nenhum" no painel Suporte (as etapas: Novo, N1, N2, N3, DEV, Em observação, Resolvido, Fechado).');
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

// =====================================================================

describe('as opções para a NIA (/integracao/opcoes): só o que está ativo, do jeito que o PATCH aceita', () => {
  it('com a chave: os assuntos com o caminho e a sigla, os produtos, os clientes, os tipos de cada painel, as gravidades e as prioridades', async () => {
    // um cliente arquivado e um produto desativado não entram
    const arquivado = newId();
    await app.db.insert(clients).values({ id: arquivado, tradeName: 'Cliente Arquivado', legalName: 'Cliente Arquivado LTDA', cnpj: '44555666000177', archived: true });
    const [desativado] = await app.db.update(products).set({ active: false }).where(eq(products.code, 'voicenet')).returning({ id: products.id });
    const ultimaDaAuditoria = async () => (await s.get('/admin/audit?pageSize=1')).json().items[0]?.id;
    const antes = await ultimaDaAuditoria();

    const r = await pedido('GET', '/integracao/opcoes');
    expect(r.statusCode, r.body).toBe(200);
    // ler não vai para a auditoria
    expect(await ultimaDaAuditoria()).toBe(antes);
    const o = r.json();
    expect(Object.keys(o).sort()).toEqual(['assuntos', 'clientes', 'gravidades', 'prioridades', 'produtos', 'tipos']);
    // os assuntos: o caminho inteiro e a sigla do painel; o desativado fica de fora, e o painel que desligou o
    // assunto (o Desenvolvimento, no teste de cima) não tem o que escolher
    expect(o.assuntos).toEqual(expect.arrayContaining([
      { id: ramal, nome: 'Ramal', caminho: 'Ramal', painelSigla: 'SUP' },
      { id: semAudio, nome: 'Sem áudio', caminho: 'Ramal › Sem áudio', painelSigla: 'SUP' },
      expect.objectContaining({ nome: 'Configuração', caminho: 'Ramal › Configuração', painelSigla: 'SUP' }),
      expect.objectContaining({ nome: 'Configuração', caminho: 'Fila › Configuração', painelSigla: 'SUP' }),
    ]));
    expect(o.assuntos.find((a: any) => a.id === antigo)).toBeUndefined();
    expect(o.assuntos.filter((a: any) => a.painelSigla === 'DEV')).toEqual([]);
    // o caminho da lista é o que o PATCH aceita: a IA escolhe da lista, e o n8n grava sem traduzir
    const escolhido = o.assuntos.find((a: any) => a.caminho === 'Fila › Configuração');
    const gravado = await pedido('PATCH', '/integracao/chamados/SUP-1', { assunto: escolhido.caminho, tipo: o.tipos.find((t: any) => t.painelSigla === 'SUP').nome });
    expect(gravado.statusCode, gravado.body).toBe(200);
    expect(gravado.json()).toMatchObject({ assunto: { id: escolhido.id }, tipo: TIPOS_PADRAO[0] });

    // os produtos e os clientes pelo id (como o PATCH guarda), sem o desativado e o arquivado
    expect(o.produtos.length).toBeGreaterThan(0);
    expect(o.produtos.every((p: any) => Object.keys(p).sort().join() === 'id,nome')).toBe(true);
    expect(o.produtos.find((p: any) => p.id === desativado!.id)).toBeUndefined();
    expect(o.clientes).toContainEqual({ id: aurora, nome: 'Clínica Aurora' });
    expect(o.clientes.find((c: any) => c.id === arquivado)).toBeUndefined();
    // os tipos: as opções do Tipo de cada painel que usa o Tipo
    expect(o.tipos).toEqual(expect.arrayContaining(TIPOS_PADRAO.map((nome) => ({ nome, painelSigla: 'SUP' }))));
    // a gravidade e a prioridade pela chave, com o nome e o "quando usar" da tela
    expect(o.gravidades.map((g: any) => g.id)).toEqual([...GRAVIDADES]);
    expect(o.gravidades[0]).toEqual({ id: 'inoperancia', nome: 'Inoperância', dica: 'Não funciona de jeito nenhum' });
    expect(o.prioridades.map((p: any) => p.id)).toEqual([...PRIORIDADES]);
    expect(o.prioridades[0]).toEqual({ id: 'critica', nome: 'Crítica', dica: 'Parou tudo, ou quase tudo, na empresa' });
    await app.db.update(products).set({ active: true }).where(eq(products.id, desativado!.id));
  });

  it('sem chave, com a chave errada ou revogada: 401; a chave no endereço também vale', async () => {
    for (const chave of [null, 'chave-que-nao-existe', revogada.valor]) {
      const r = await pedido('GET', '/integracao/opcoes', undefined, { chave });
      expect(r.statusCode).toBe(401);
      expect(r.json().error).toBe('Chave de API inválida.');
    }
    // a sessão de uma pessoa não serve: é só pela chave
    expect((await s.get('/atendimento/integracao/opcoes')).statusCode).toBe(401);
    expect((await pedido('GET', '/integracao/opcoes', undefined, { naQuery: true })).statusCode).toBe(200);
  });
});
