/**
 * Patch 1.7 — o envio automático do PDF dos Chamados pelo WhatsApp (decisão 0038).
 *
 * As regras de horário, números e do que pode ser marcado estão testadas em
 * `packages/shared/src/envio.test.ts`. Aqui fica o que é do servidor:
 *  - os ajustes: o token vai para o cofre e nunca volta (nem na auditoria);
 *  - marcar o que vai no PDF: só a administração; quem vê chamados vê o que está marcado;
 *  - a página do PDF só abre com a chave de uso único ou com a sessão;
 *  - o envio: monta o PDF, guarda, manda o link público para a FlwChat (que baixa de lá) e anota
 *    no histórico e na auditoria; o link vence em 7 dias, o arquivo fica para a administração;
 *  - o teste manda só texto; erro da FlwChat aparece na resposta.
 *
 * Sem Chromium e sem FlwChat de verdade: as duas ferramentas são trocadas por imitações.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, linechatCardMoves, linechatCards, linechatFields, linechatSteps, newId, secrets, settings } from '@gestor/db';
import { makeApp, Session, type App } from './helpers.js';
import { esquecerLeitura } from '../src/services/chamados.js';
import * as envio from '../src/services/envio.js';

let app: App;
let s: Session;
/** inventado na hora: nenhum token de verdade fica escrito em arquivo */
const TOKEN = `teste-${randomUUID()}`;
const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000);
/** O que a "FlwChat" recebeu. */
let recebidos: Array<{ url: string; auth: string; corpo: any }> = [];
let respostaDaFlwChat = 200;

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const db = app.db;
  await db.insert(settings).values({ id: 'linechat', value: JSON.stringify({ ativo: true, painelId: 'p1', painelNome: 'Ingline - Suporte', inicioEm: horasAtras(24 * 30).toISOString() }) });
  await db.insert(linechatSteps).values([
    { id: 'novo', title: 'Novos Suporte', position: 1, isInitial: true },
    { id: 'n1', title: 'Chamado Em Tratativa N1', position: 2 },
    { id: 'tratado', title: 'Chamado Tratado Suporte', position: 3, isFinal: true },
  ]);
  await db.insert(linechatFields).values([{ key: 'assunto', name: 'Assunto', type: 'SINGLESELECT', position: 9, options: ['URA', 'Ramal'] }]);
  for (const [n, assunto, fechado] of [[1, 'URA', true], [2, 'Ramal', false], [3, 'Ramal', false]] as const) {
    await db.insert(linechatCards).values({
      id: `card-${n}`, panelId: 'p1', number: n, key: `IS-${n}`, title: `Chamado ${n}`,
      stepId: fechado ? 'tratado' : 'n1', stepTitle: fechado ? 'Chamado Tratado Suporte' : 'Chamado Em Tratativa N1', stepPhase: fechado ? 'FINAL' : 'INTERMEDIATE',
      responsibleName: 'Lucio', customFields: { assunto }, createdAt: horasAtras(0.5 + n * 0.1), updatedAt: horasAtras(0.2), closedAt: fechado ? horasAtras(0.2) : null,
    });
    await db.insert(linechatCardMoves).values({ id: newId(), cardId: `card-${n}`, fromStepId: null, toStepId: 'novo', at: horasAtras(0.5 + n * 0.1), estimated: false });
  }
  esquecerLeitura();
  envio.trocarFerramentas({
    pasta: mkdtempSync(join(tmpdir(), 'envios-')),
    gerarPdf: async (_app, chave) => {
      // a imitação do Chromium confere que a chave abre a página
      if (!envio.chaveValida(chave)) throw new Error('chave inválida');
      return Buffer.from('%PDF-1.4 PDF de teste');
    },
    fetchFn: (async (url: string, init: RequestInit) => {
      recebidos.push({ url, auth: String((init.headers as Record<string, string>).Authorization), corpo: JSON.parse(String(init.body)) });
      return new Response(respostaDaFlwChat === 200 ? '{"id":"msg-1"}' : '{"error":"recusado"}', { status: respostaDaFlwChat });
    }) as typeof fetch,
  });
});
afterAll(async () => { await app.close(); });

const AJUSTES = {
  ativo: true, url: 'https://api.exemplo.com/chat/v1/message/send', remetente: '(71) 3512-0000', horario: '18:00', dias: [0, 1, 2, 3, 4, 5, 6],
  destinatarios: [
    { id: 'd1', nome: 'Luan', numero: '(71) 99999-0001', ativo: true },
    { id: 'd2', nome: 'Suporte', numero: '71 99999-0002', ativo: true },
    { id: 'd3', nome: 'De férias', numero: '71 99999-0003', ativo: false },
  ],
};

describe('Os ajustes do envio', () => {
  it('começa desligado; o token vai para o cofre e nunca volta', async () => {
    const a0 = (await s.get('/envio/ajustes')).json();
    expect([a0.ativo, a0.temToken, a0.destinatarios]).toEqual([false, false, []]);
    const r = await s.put('/envio/ajustes', { ...AJUSTES, token: TOKEN });
    expect(r.statusCode).toBe(200);
    const a = r.json();
    expect(a.temToken).toBe(true);
    expect(a.remetente).toBe('557135120000');
    expect(a.destinatarios.map((d: any) => d.numero)).toEqual(['5571999990001', '5571999990002', '5571999990003']);
    expect(a.proximo).toBeTruthy();
    expect(r.body).not.toContain(TOKEN);
    const [seg] = await app.db.select().from(secrets);
    expect(seg?.label).toContain('FlwChat');
    const log = await app.db.select().from(auditLog);
    expect(JSON.stringify(log)).toContain('ligou o envio automático (18:00, 2 números)');
    expect(JSON.stringify(log)).not.toContain(TOKEN);
    // salvar de novo sem token mantém o guardado
    expect((await s.put('/envio/ajustes', AJUSTES)).json().temToken).toBe(true);
  });
  it('recusa ligar pela metade', async () => {
    const r = await s.put('/envio/ajustes', { ...AJUSTES, destinatarios: [] });
    expect(r.statusCode).toBe(400);
  });
});

describe('O que vai no PDF', () => {
  it('a administração marca; o Raio-X não pode ir', async () => {
    expect((await s.put('/envio/marcados', { relatorios: ['raiox'], graficos: [] })).statusCode).toBe(400);
    const r = await s.put('/envio/marcados', { relatorios: ['pareto', 'relogio'], graficos: ['serie', 'campo:assunto'] });
    expect(r.statusCode).toBe(200);
    expect(r.json().relatorios).toEqual(['pareto', 'relogio']);
    const a = (await s.get('/envio/ajustes')).json();
    // na ordem das telas: a dos Relatórios (relógio antes do 80/20) e a dos gráficos dos Chamados
    expect(a.marcados.relatorios.map((x: any) => x.titulo)).toEqual(['Relógio do chamado', 'Os poucos que pesam muito']);
    expect(a.marcados.graficos.map((x: any) => x.titulo)).toEqual(['Chamados abertos hoje, por hora', 'Por assunto']);
    expect(a.marcados.graficos.map((x: any) => x.id)).toEqual(['serie', 'campo:assunto']);
  });
  it('quem só vê chamados vê o que está marcado, mas não marca', async () => {
    const leitor = (await s.get('/admin/roles')).json().find((p: any) => p.key === 'leitor');
    await s.post('/admin/users', { name: 'Leitor do Envio', email: 'leitorenvio@gestor.local', password: 'SenhaDeTeste!123', roleId: leitor.id });
    const outro = new Session(app);
    await outro.login('leitorenvio@gestor.local', 'SenhaDeTeste!123');
    expect((await outro.get('/envio/marcados')).json().relatorios).toEqual(['pareto', 'relogio']);
    expect((await outro.put('/envio/marcados', { relatorios: [], graficos: [] })).statusCode).toBe(403);
    expect((await outro.get('/envio/ajustes')).statusCode).toBe(403);
  });
});

describe('A página do PDF', () => {
  it('só abre com a chave de uso único ou com a sessão', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/envio/pacote' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/envio/pacote?chave=inventada' })).statusCode).toBe(401);
    const chave = envio.novaChave();
    const r = await app.inject({ method: 'GET', url: `/api/envio/pacote?chave=${chave}` });
    expect(r.statusCode).toBe(200);
    const p = r.json();
    expect(p.relatorioIds).toEqual(['relogio', 'pareto']);
    expect(p.graficos.map((g: any) => g.id)).toEqual(['serie', 'campo:assunto']);
    expect(p.resumo.kpis[0].label).toBe('Abertos hoje');
    // o período dos relatórios é o dia de hoje
    expect([p.relatorios.de, p.relatorios.ate]).toEqual([p.dia, p.dia]);
    expect(p.relatorios.pareto.itens.map((x: any) => [x.rotulo, x.n])).toEqual([['Ramal', 2], ['URA', 1]]);
    envio.esquecerChave(chave);
    expect((await app.inject({ method: 'GET', url: `/api/envio/pacote?chave=${chave}` })).statusCode).toBe(401);
    expect((await s.get('/envio/pacote')).statusCode).toBe(200);
  });
});

describe('O envio', () => {
  it('monta o PDF, manda o link para cada número ativo e anota tudo', async () => {
    recebidos = [];
    const r = await s.post('/envio/enviar', {});
    expect(r.statusCode).toBe(200);
    const e = r.json();
    expect(e.ok).toBe(true);
    expect(e.mensagem).toBe('Enviado para 2 números.');
    expect(e.itens).toEqual(['Chamados abertos hoje, por hora', 'Por assunto', 'Relógio do chamado', 'Os poucos que pesam muito']);
    expect(recebidos).toHaveLength(2);
    const [m] = recebidos;
    expect(m!.url).toBe(AJUSTES.url);
    expect(m!.auth).toBe(`Bearer ${TOKEN}`);
    expect(m!.corpo.from).toBe('557135120000');
    expect(m!.corpo.to).toBe('5571999990001');
    expect(m!.corpo.body.text).toContain('*Chamados de hoje*');
    expect(m!.corpo.body.text).toContain('• Abertos hoje: 3');
    expect(m!.corpo.body.fileUrl).toMatch(/^http:\/\/localhost:5173\/api\/envio\/arquivo\/[a-f0-9]{36}\/chamados-\d{2}-\d{2}-\d{4}\.pdf$/);
    // o link é público (a FlwChat baixa sem login)
    const caminho = new URL(m!.corpo.body.fileUrl).pathname;
    const arq = await app.inject({ method: 'GET', url: caminho });
    expect(arq.statusCode).toBe(200);
    expect(arq.headers['content-type']).toBe('application/pdf');
    expect(arq.body).toContain('%PDF-1.4');
    // no histórico, com o PDF para baixar
    const a = (await s.get('/envio/ajustes')).json();
    expect(a.historico[0].gatilho).toBe('manual');
    expect(a.historico[0].quem).toBeTruthy();
    expect((await s.get(`/envio/historico/${a.historico[0].id}/pdf`)).statusCode).toBe(200);
    const log = await app.db.select().from(auditLog);
    expect(JSON.stringify(log)).toContain('mandou PDF dos Chamados');
  });
  it('o link vence em 7 dias, o arquivo continua para a administração', async () => {
    const a = (await s.get('/envio/ajustes')).json();
    const id = a.historico[0].pdf.id;
    envio.trocarFerramentas({ agora: () => new Date(Date.now() + 8 * 86_400_000) });
    expect((await app.inject({ method: 'GET', url: `/api/envio/arquivo/${id}/x.pdf` })).statusCode).toBe(404);
    expect((await s.get(`/envio/historico/${a.historico[0].id}/pdf`)).statusCode).toBe(200);
    envio.trocarFerramentas({ agora: () => new Date() });
    expect((await app.inject({ method: 'GET', url: '/api/envio/arquivo/../../etc/x.pdf' })).statusCode).toBe(404);
  });
  it('o teste manda só texto, para um número', async () => {
    recebidos = [];
    const e = (await s.post('/envio/testar', { destinatarioId: 'd2' })).json();
    expect(e.ok).toBe(true);
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]!.corpo.to).toBe('5571999990002');
    expect(recebidos[0]!.corpo.body.fileUrl).toBeUndefined();
    expect(recebidos[0]!.corpo.body.text).toContain('Teste do Ingline Gestão');
  });
  it('a FlwChat recusou: aparece o motivo, e o agendado conta a tentativa', async () => {
    respostaDaFlwChat = 401;
    const e = await envio.enviar(app, { gatilho: 'agendado' });
    respostaDaFlwChat = 200;
    expect(e.ok).toBe(false);
    expect(e.mensagem).toContain('recusou o token');
    const { valor } = await envio.lerAjustes(app.db);
    expect(valor.ultimoAgendado).toMatchObject({ ok: false, tentativas: 1 });
    expect(valor.historico[0]!.gatilho).toBe('agendado');
  });
  it('sem token: não tenta e diz o que falta', async () => {
    await app.db.update(settings).set({ secretId: null });
    const e = (await s.post('/envio/enviar', {})).json();
    expect(e.ok).toBe(false);
    expect(e.mensagem).toContain('Falta o token');
  });
});

/**
 * 1.7.1 — o relógio. Em 05/10 o envio no horário não saiu: o dia tinha sido "gasto" com 3 falhas
 * no horário antigo, e trocar o horário (18:40) não liberava. Agora trocar o horário vale já para
 * hoje, salvar depois de uma falha dá 3 tentativas novas, e a tela mostra como foi o de hoje.
 */
describe('O relógio (1.7.1)', () => {
  /** um momento em Brasília */
  const as = (dia: string, hhmm: string) => () => new Date(`${dia}T${hhmm}:00-03:00`);
  const volta = async (dia: string, hhmm: string) => { envio.trocarFerramentas({ agora: as(dia, hhmm) }); return envio.voltaDoRelogio(app); };
  const tela = async () => (await s.get('/envio/ajustes')).json();
  afterAll(() => { envio.trocarFerramentas({ agora: () => new Date() }); });
  // começa limpo: salvar zera a falha do agendado que o teste da FlwChat deixou (com a data de verdade)
  beforeAll(async () => { expect((await s.put('/envio/ajustes', AJUSTES)).json().temToken).toBe(false); });

  it('o caso de 05/10: 3 falhas às 18:00, trocou para 18:40 às 18:35 — sai às 18:40, uma vez', async () => {
    // sem token (o teste anterior tirou): as 3 tentativas das 18:00 falham dizendo o que falta
    expect((await volta('2026-10-05', '17:59'))).toBeNull();
    for (const h of ['18:00', '18:15', '18:30']) expect((await volta('2026-10-05', h))?.mensagem).toContain('Falta o token');
    expect(await volta('2026-10-05', '18:31')).toBeNull();
    expect(await volta('2026-10-05', '18:46')).toBeNull(); // gastou as 3
    envio.trocarFerramentas({ agora: as('2026-10-05', '18:35') });
    const antes = await tela();
    expect(antes.proximo).toBe('amanhã às 18:00');
    expect(antes.hoje).toMatchObject({ horario: '18:00', ok: false, tentativas: 3, novaTentativa: null });
    expect(antes.hoje.mensagem).toContain('Falta o token');

    // às 18:35: põe o token e troca para 18:40
    const depois = (await s.put('/envio/ajustes', { ...AJUSTES, horario: '18:40', token: TOKEN })).json();
    expect(depois.proximo).toBe('hoje às 18:40');
    expect(depois.hoje).toBeNull();
    recebidos = [];
    expect(await volta('2026-10-05', '18:39')).toBeNull();
    expect((await volta('2026-10-05', '18:40'))?.ok).toBe(true);
    expect(recebidos.map((r) => r.corpo.to)).toEqual(['5571999990001', '5571999990002']);
    expect(await volta('2026-10-05', '18:41')).toBeNull(); // uma vez só
    envio.trocarFerramentas({ agora: as('2026-10-05', '18:42') });
    const fim = await tela();
    expect(fim.proximo).toBe('amanhã às 18:40');
    expect(fim.hoje).toMatchObject({ horario: '18:40', ok: true, tentativas: 1 });
    expect(fim.historico[0]).toMatchObject({ gatilho: 'agendado', ok: true, quem: null });
  });

  it('salvar depois de uma falha libera 3 tentativas novas, no mesmo horário', async () => {
    respostaDaFlwChat = 500;
    for (const h of ['18:40', '18:55', '19:10']) expect((await volta('2026-10-06', h))?.ok).toBe(false);
    expect(await volta('2026-10-06', '19:30')).toBeNull();
    respostaDaFlwChat = 200;
    envio.trocarFerramentas({ agora: as('2026-10-06', '19:31') });
    expect((await tela()).proximo).toBe('amanhã às 18:40');
    // salvou (por exemplo, depois de reconectar o número na FlwChat): tenta de novo
    expect((await s.put('/envio/ajustes', { ...AJUSTES, horario: '18:40' })).json().proximo).toBe('agora (na próxima volta do relógio)');
    expect((await volta('2026-10-06', '19:32'))?.ok).toBe(true);
    // e um envio que deu certo não volta a sair só porque alguém salvou
    await s.put('/envio/ajustes', { ...AJUSTES, horario: '18:40' });
    expect(await volta('2026-10-06', '19:33')).toBeNull();
  });

  it('uma volta de cada vez: um envio demorado não sai duas vezes', async () => {
    let soltar!: () => void;
    const segura = new Promise<void>((r) => { soltar = r; });
    envio.trocarFerramentas({
      gerarPdf: async (_app, chave) => { await segura; if (!envio.chaveValida(chave)) throw new Error('chave inválida'); return Buffer.from('%PDF-1.4 PDF de teste'); },
    });
    recebidos = [];
    const primeira = volta('2026-10-07', '18:40');
    await new Promise((r) => setTimeout(r, 50));
    expect(await volta('2026-10-07', '18:41')).toBeNull(); // a primeira ainda está mandando
    soltar();
    expect((await primeira)?.ok).toBe(true);
    expect(await volta('2026-10-07', '18:42')).toBeNull();
    expect(recebidos).toHaveLength(2); // um para cada número ativo, uma vez
  });
});
