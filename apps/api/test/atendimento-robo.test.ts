/**
 * Patch 2.0.1 — o robô do LineChat abre o chamado com o JSON dele, pelo MAPA (o pedido do Luan: "Eu
 * quero que a gente possa alterar esse JSON… para que não tenha que ser algo bem fixo").
 *
 *  - o pedido como o bloco Webhook do LineChat manda ([{…}], o formato do Helena) abre o chamado com o
 *    mapa de fábrica; a mesma conversa aberta vira anotação; o último pedido fica guardado
 *  - o mapa muda pela tela (só a administração), com a auditoria; o texto com a variável aberta é recusado
 *  - o mapa novo: o cliente pela resposta da pergunta, o assunto pelo de-para, a opção do campo pela
 *    resposta enfeitada do menu; o que não bate fica de fora, e a resposta (e a auditoria) diz
 *  - "Como fica" mostra o chamado sem abrir; a chave vem antes do corpo; o corpo grande é recusado
 *  - a entrada no formato do Gestor (o n8n) ganhou a descrição e o assunto pelo de-para
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { clients, newId, ticketApiKeys, ticketPanels, ticketSubjects, tickets } from '@gestor/db';
import { MAPA_DO_ROBO_PADRAO } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';
import { trocarFerramentasWhatsApp } from '../src/services/atendimento/whatsapp.js';
import { trocarFerramentasWebhook } from '../src/services/atendimento/webhooks.js';

let app: App;
let s: Session;         // administrador
let operador: Session;  // Marina (trabalha nos chamados, mas não é da administração)
let aurora = '';
let geral = '';
let sistema = { id: '', pbx: '', chat: '' };
/** a chave do robô (o valor só existe aqui, gerado na hora: nunca vai para arquivo) */
let chave = '';

const SUP = 'painel-suporte';
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** O pedido do bloco Webhook do LineChat (o formato do teste do Luan, com um contato de mentira). */
function doLineChat(o: { sessao: string; nome?: string; telefone?: string; empresa?: string; motivo?: string; setor?: string; solucao?: string }) {
  const motivo = o.motivo ?? 'Ramal 204 sem áudio desde cedo';
  return [{
    responseKeys: [], companyId: 'empresa-de-teste', sessionId: o.sessao, callbackUrl: null, callbackId: null,
    session: { id: o.sessao, createdAt: '2026-10-16T14:21:18.901089Z', departmentId: 'd-1', userId: '00000000-0000-0000-0000-000000000000', number: '2026101600015', utm: null },
    channel: { id: 'ch-1', key: '557130348350', platform: 'WhatsApp', displayName: '(71) 3034-8350' },
    contact: {
      id: 'ct-1', name: o.nome ?? 'João Teste', 'first-name': 'João', phonenumber: o.telefone ?? '+55|71999990123', 'display-phonenumber': '(71) 99999-0123',
      email: null, instagram: null, tags: null, annotation: null, metadata: {}, origin: 'CREATED_FROM_HUB', empresa: '', 'motivo-de-contato': motivo,
    },
    questions: {
      'cb-a35e88f1-qst-b9e89e4b': { text: 'Por favor, nos informe a empresa que você faz parte, para que possamos salvar em seu cadastro:', answer: o.empresa ?? 'Clínica Aurora', answerFile: null },
      'cb-8b2a1bcb-qst-81fe01bd': { text: 'Por favor nos informe brevemente o motivo do seu contato', answer: motivo, answerFile: null },
    },
    menus: {
      'cb-a35e88f1-mn-bfb06331': { text: 'Para facilitar seu atendimento, listei algumas opções...', answer: o.setor ?? 'Suporte Técnico', answerFile: null },
      'cb-a35e88f1-mn-8d2de45b': { text: 'Certo!\nPor favor, escolha para qual solução você deseja atendimento:', answer: o.solucao ?? '☎️ LinePBX: Plataforma de Voz', answerFile: null },
    },
    templates: {}, metadata: {}, lastContactMessage: motivo,
    lastMessage: { type: 'TEXT', text: motivo }, lastMessagesAggregated: { text: motivo, files: [] }, senderId: null,
  }];
}

/** O robô chamando: a chave no cabeçalho (ou no endereço, com `naQuery`); `chave: null` = sem chave. */
function doRobo(payload: unknown, o: { chave?: string | null; naQuery?: boolean } = {}) {
  const k = o.chave === undefined ? chave : o.chave;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let url = '/api/atendimento/entrada/robo';
  if (k && o.naQuery) url += `?chave=${encodeURIComponent(k)}`;
  else if (k) headers.authorization = `Bearer ${k}`;
  return app.inject({ method: 'POST', url, payload: typeof payload === 'string' ? payload : JSON.stringify(payload), headers });
}
async function ficha(ref: string) {
  const r = await s.get(`/atendimento/chamados/${encodeURIComponent(ref)}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
async function auditoriaDe(id: string) {
  return ((await s.get(`/admin/audit?entityId=${id}&pageSize=200`)).json().items as any[]);
}
const quantos = async () => (await app.db.select({ id: tickets.id }).from(tickets)).length;

/** O mapa do teste: o cliente pela pergunta da empresa, o assunto pelo menu, o Sistema pelo menu da solução. */
const MAPA = () => ({
  ...MAPA_DO_ROBO_PADRAO,
  painel: SUP,
  relato: '{{questions.cb-8b2a1bcb-qst-81fe01bd.answer || lastContactMessage}}',
  descricao: 'Pelo robô: {{menus.cb-a35e88f1-mn-bfb06331.answer}} › {{menus.cb-a35e88f1-mn-8d2de45b.answer}}',
  cliente: '{{questions.cb-a35e88f1-qst-b9e89e4b.answer}}',
  assunto: '{{menus.cb-a35e88f1-mn-bfb06331.answer}}',
  prioridade: 'Alta',
  etiquetas: 'robô, whatsapp',
  campos: { [sistema.id]: '{{menus.cb-a35e88f1-mn-8d2de45b.answer}}' },
});

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const papeis = (await s.get('/admin/roles')).json();
  await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: papeis.find((r: any) => r.key === 'operador').id });
  operador = new Session(app); await operador.login('marina@gestor.local', 'SenhaDeTeste!123');

  aurora = newId();
  await app.db.insert(clients).values({ id: aurora, tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora Serviços Médicos LTDA', cnpj: '11222333000181' });
  // o de-para: a resposta do menu ("Suporte Técnico") vira o assunto
  geral = newId();
  await app.db.insert(ticketSubjects).values([
    { id: geral, panelId: SUP, name: 'Atendimento geral', aliases: ['Suporte Técnico'] },
    { id: newId(), panelId: SUP, name: 'Ramal' },
  ]);
  const campo = await s.post(`/atendimento/paineis/${SUP}/campos`, { nome: 'Sistema', tipo: 'lista', opcoes: [{ nome: 'LinePBX' }, { nome: 'LineChat' }] });
  expect(campo.statusCode, campo.body).toBe(201);
  const c = campo.json();
  sistema = { id: c.id, pbx: c.opcoes.find((x: any) => x.nome === 'LinePBX').id, chat: c.opcoes.find((x: any) => x.nome === 'LineChat').id };

  chave = `chave-falsa-${Math.random()}`;
  await app.db.insert(ticketApiKeys).values({ id: newId(), name: 'Robô do LineChat', prefix: chave.slice(0, 8), hash: sha256(chave) });

  const recusar = (async () => { throw new Error('rede desligada nos testes'); }) as unknown as typeof fetch;
  trocarFerramentasWhatsApp({ fetchFn: recusar });
  trocarFerramentasWebhook({ fetchFn: recusar, resolver: async () => ['203.0.113.10'], esperar: async () => {} });
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

// =====================================================================

describe('o robô manda o JSON do LineChat', () => {
  it('abre pelo mapa de fábrica: o nome no título, a última mensagem no relato, o WhatsApp com o 55', async () => {
    const r = await doRobo(doLineChat({ sessao: 'sessao-a' }));
    expect(r.statusCode, r.body).toBe(201);
    const b = r.json();
    expect(b).toEqual({ criado: true, id: expect.any(String), codigo: 'SUP-1', numero: 1, link: expect.stringMatching(/\/atendimento\/SUP-1$/), ignorados: [] });
    expect(await ficha('SUP-1')).toMatchObject({
      origem: 'robo', titulo: 'Atendimento de João Teste', relato: 'Ramal 204 sem áudio desde cedo', contato: { nome: 'João Teste', telefone: '5571999990123' },
      sessaoId: 'sessao-a', etiquetas: ['robô'], cliente: null, assunto: null, descricao: null,
    });
    expect((await auditoriaDe(b.id))[0]).toMatchObject({ userId: null, action: 'create', summary: 'Robô do LineChat (chave de API) abriu SUP-1 "Atendimento de João Teste" pelo mapa do robô' });
  });

  it('o último pedido fica guardado, com o que aconteceu (para montar o mapa com as variáveis de verdade)', async () => {
    const r = await s.get('/atendimento/integracoes/robo');
    expect(r.statusCode, r.body).toBe(200);
    const t = r.json();
    expect(t.mapa).toEqual({ ...MAPA_DO_ROBO_PADRAO });
    expect(t.ultimo).toMatchObject({ chave: 'Robô do LineChat', em: expect.any(String), resultado: { ok: true, criado: true, anotou: false, codigo: 'SUP-1', ignorados: [] } });
    expect(t.ultimo.corpo[0].contact.name).toBe('João Teste');
    expect(t.ultimo.corpo[0].questions['cb-8b2a1bcb-qst-81fe01bd'].answer).toBe('Ramal 204 sem áudio desde cedo');
  });

  it('a mesma conversa aberta não abre outro: o relato novo vira anotação', async () => {
    const r = await doRobo(doLineChat({ sessao: 'sessao-a', motivo: 'Agora o 205 também' }), { naQuery: true });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ criado: false, codigo: 'SUP-1', ignorados: [] });
    const f = await ficha('SUP-1');
    expect(f.anotacoesLista.map((n: any) => [n.texto, n.porNome])).toEqual([['Agora o 205 também', 'Robô do LineChat']]);
    expect((await s.get('/atendimento/integracoes/robo')).json().ultimo.resultado).toMatchObject({ ok: true, criado: false, anotou: true, codigo: 'SUP-1' });
    expect(await quantos()).toBe(1);
  });

  it('sem nada que o mapa leia: 400 com o porquê, e o último pedido guarda o erro', async () => {
    const r = await doRobo({ outro: 'formato' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/^O mapa do robô não tirou nada deste pedido/);
    expect((await s.get('/atendimento/integracoes/robo')).json().ultimo).toMatchObject({ corpo: { outro: 'formato' }, resultado: { ok: false, erro: expect.stringMatching(/não tirou nada/) } });
    // o corpo vazio também não abre nada
    expect((await doRobo('')).statusCode).toBe(400);
    expect(await quantos()).toBe(1);
  });

  it('a chave vem antes do corpo (401 sem olhar o pedido); o corpo grande demais é recusado', async () => {
    for (const k of [null, 'chave-que-nao-existe']) {
      const r = await doRobo(doLineChat({ sessao: 'sessao-x' }), { chave: k });
      expect(r.statusCode).toBe(401);
      expect(r.json().error).toBe('Chave de API inválida.');
    }
    const grande = await doRobo({ relato: 'x'.repeat(600 * 1024) });
    expect(grande.statusCode).toBe(413);
    expect(await quantos()).toBe(1);
  });
});

// =====================================================================

describe('o mapa pela tela', () => {
  it('só a administração vê e muda o mapa (e o "Como fica")', async () => {
    expect((await operador.get('/atendimento/integracoes/robo')).statusCode).toBe(403);
    expect((await operador.put('/atendimento/integracoes/robo', MAPA())).statusCode).toBe(403);
    expect((await operador.post('/atendimento/integracoes/robo/experimentar', { mapa: MAPA(), corpo: {} })).statusCode).toBe(403);
  });

  it('o texto com a variável aberta é recusado, com a mensagem', async () => {
    const r = await s.put('/atendimento/integracoes/robo', { ...MAPA(), titulo: 'Atendimento de {{contact.name' });
    expect(r.statusCode).toBe(400);
    expect(JSON.stringify(r.json())).toContain('Feche cada variável');
  });

  it('"Como fica" mostra o chamado que o pedido abriria, sem abrir nada e sem salvar o mapa', async () => {
    const r = await s.post('/atendimento/integracoes/robo/experimentar', { mapa: MAPA(), corpo: doLineChat({ sessao: 'sessao-a' }) });
    expect(r.statusCode, r.body).toBe(200);
    const p = r.json();
    expect(p.resolvido).toMatchObject({
      ok: true,
      chamado: {
        painel: { id: SUP, sigla: 'SUP' }, titulo: 'Atendimento de João Teste', cliente: { id: aurora, nome: 'Clínica Aurora' },
        assunto: { id: geral, caminho: 'Atendimento geral' }, prioridade: 'alta', etiquetas: ['robô', 'whatsapp'],
        descricao: 'Pelo robô: Suporte Técnico › ☎️ LinePBX: Plataforma de Voz',
        campos: [{ id: sistema.id, nome: 'Sistema', valor: sistema.pbx, texto: 'LinePBX' }], ignorados: [],
      },
    });
    // a conversa do SUP-1 ainda está aberta: um pedido dela agora viraria anotação
    expect(p.aberto).toEqual({ codigo: 'SUP-1', titulo: 'Atendimento de João Teste' });
    expect(await quantos()).toBe(1);
    expect((await s.get('/atendimento/integracoes/robo')).json().mapa.cliente).toBe('');
    // o pedido sem nada que o mapa leia: o porquê
    const nada = (await s.post('/atendimento/integracoes/robo/experimentar', { mapa: MAPA(), corpo: { outro: 'formato' } })).json();
    expect(nada).toEqual({ resolvido: { ok: false, erro: expect.stringMatching(/não tirou nada/) }, aberto: null });
  });

  it('grava o mapa, com a auditoria do que mudou', async () => {
    const r = await s.put('/atendimento/integracoes/robo', { ...MAPA(), campos: { ...MAPA().campos, 'campo-sem-texto': '  ' } });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual(MAPA());
    expect((await s.get('/atendimento/integracoes/robo')).json().mapa).toEqual(MAPA());
    const [a] = await auditoriaDe('atendimento-robo');
    expect(a).toMatchObject({
      action: 'settings_atendimento_robo',
      summary: 'Mudou o mapa do robô do LineChat: Painel, Relato do cliente, Etiquetas, Descrição, Cliente, Assunto, Prioridade, Campos do painel',
    });
    // salvar igual não enche a auditoria
    await s.put('/atendimento/integracoes/robo', MAPA());
    expect(await auditoriaDe('atendimento-robo')).toHaveLength(1);
  });
});

// =====================================================================

describe('o robô com o mapa novo', () => {
  it('o cliente pela resposta da pergunta, o assunto pelo de-para, o Sistema pela resposta enfeitada do menu', async () => {
    const r = await doRobo(doLineChat({ sessao: 'sessao-b', nome: 'Maria Souza', telefone: '+55|71999992010' }));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ criado: true, codigo: 'SUP-2', ignorados: [] });
    expect(await ficha('SUP-2')).toMatchObject({
      titulo: 'Atendimento de Maria Souza', relato: 'Ramal 204 sem áudio desde cedo', descricao: 'Pelo robô: Suporte Técnico › ☎️ LinePBX: Plataforma de Voz',
      cliente: { id: aurora, nome: 'Clínica Aurora' }, assunto: { id: geral }, prioridade: 'alta', etiquetas: ['robô', 'whatsapp'],
      campos: { [sistema.id]: sistema.pbx }, contato: { nome: 'Maria Souza', telefone: '5571999992010' },
    });
  });

  it('o que não bate fica de fora, e a resposta (e a auditoria) diz o quê: o chamado abre do mesmo jeito', async () => {
    const r = await doRobo(doLineChat({ sessao: 'sessao-c', empresa: 'Padaria Que Não Existe', setor: 'Financeiro', solucao: 'Outra coisa', telefone: 'sem número' }));
    expect(r.statusCode, r.body).toBe(201);
    const b = r.json();
    expect(b.ignorados).toEqual([
      'O WhatsApp "sem número" não é um número de telefone (DDD + número): ficou de fora.',
      'Não achei o cliente "Padaria Que Não Existe": o Gestor procura o cliente pelo WhatsApp do contato.',
      'Não achei o assunto "Financeiro" no painel Suporte: ficou de fora.',
      'Sistema: "Outra coisa" não é uma das opções (LinePBX, LineChat) — ficou de fora.',
    ]);
    expect(await ficha(b.codigo)).toMatchObject({ cliente: null, assunto: null, campos: {}, contato: { nome: 'João Teste', telefone: null }, prioridade: 'alta' });
    expect((await auditoriaDe(b.id))[0]).toMatchObject({
      summary: `Robô do LineChat (chave de API) abriu ${b.codigo} "Atendimento de João Teste" pelo mapa do robô (ficaram 4 coisas de fora)`,
      after: { ignorados: b.ignorados },
    });
    expect((await s.get('/atendimento/integracoes/robo')).json().ultimo.resultado).toMatchObject({ ok: true, codigo: b.codigo, ignorados: b.ignorados });
  });

  it('o mapa apontando para um painel desativado: o chamado vai para o primeiro ativo, e a resposta diz', async () => {
    // (desativado direto no banco: o caminho pela tela está testado nos Ajustes)
    const dev = { id: 'painel-desenvolvimento', nome: 'Desenvolvimento' };
    await app.db.update(ticketPanels).set({ active: false }).where(eq(ticketPanels.id, dev.id));
    expect((await s.put('/atendimento/integracoes/robo', { ...MAPA_DO_ROBO_PADRAO, painel: dev.id })).statusCode).toBe(200);
    const r = await doRobo(doLineChat({ sessao: 'sessao-d' }));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ codigo: expect.stringMatching(/^SUP-/), ignorados: [`O painel ${dev.nome} está desativado: o chamado vai para o Suporte.`] });
  });
});

// =====================================================================

describe('a entrada no formato do Gestor (o n8n)', () => {
  it('ganhou a descrição e o assunto pelo de-para', async () => {
    const r = await app.inject({
      method: 'POST', url: '/api/atendimento/entrada/chamado', headers: { authorization: `Bearer ${chave}` },
      payload: { titulo: 'Pelo n8n', relato: 'O cliente escreveu', descricao: 'A NIA resumiu', assunto: 'suporte tecnico' },
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(await ficha(r.json().codigo)).toMatchObject({ descricao: 'A NIA resumiu', assunto: { id: geral } });
    const [t] = await app.db.select().from(tickets).where(eq(tickets.id, r.json().id));
    expect(t!.origin).toBe('robo');
  });
});
