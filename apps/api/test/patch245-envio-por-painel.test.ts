/**
 * Patch 2.4.5 — o envio automático de cada painel (decisão 0061). O Luan, em 04/11: *"o envio automático tá saindo do
 * antigo… ele tem que ficar modular… para eu poder enviar de qualquer painel"*.
 *
 *  - o guardado até o 2.4.4 (um envio só, do Legado) vira o envio do painel Suporte, com o mesmo horário, os mesmos
 *    números e o que estava marcado no Legado, onde tem par;
 *  - a lista: um envio por painel, cada um com o horário, os dias e os números; a ligação com a FlwChat é uma só;
 *  - o PDF do painel: os números e os gráficos da Visão geral de hoje e os relatórios marcados (período = hoje); a
 *    chave de uso único abre a página de um envio só;
 *  - o aviãozinho marca para o painel (o do Legado não se mistura); o painel de Vendas não entra;
 *  - o relógio manda cada envio na hora dele; o histórico e a auditoria dizem de qual painel saiu;
 *  - o painel desativado não manda, e a tela diz por quê.
 *
 * Sem Chromium e sem FlwChat de verdade: as duas ferramentas são trocadas por imitações (como no 1.7).
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLog, settings, ticketPanels } from '@gestor/db';
import { makeApp, Session, type App } from './helpers.js';
import * as envio from '../src/services/envio.js';

let app: App;
let s: Session;
let adminId = '';
/** inventado na hora: nenhum token de verdade fica escrito em arquivo */
const TOKEN = `teste-${randomUUID()}`;
const URL_DA_API = 'https://api.exemplo.com/chat/v1/message/send';
const SUP = 'painel-suporte';
const DEV = 'painel-desenvolvimento';
/** O que a "FlwChat" recebeu (só os envios de mensagem; as conclusões das conversas ficam de fora). */
let recebidos: Array<{ para: string; texto: string; arquivo?: string }> = [];
/** De qual envio era cada página que o "Chromium" abriu. */
let paginas: Array<string | null> = [];

const LUAN = { id: 'd1', nome: 'Luan', numero: '(71) 99999-0001', ativo: true };
const DEVS = { id: 'd2', nome: 'Devs', numero: '(71) 99999-0002', ativo: true };
const suporte = (e: Record<string, unknown> = {}) => ({ id: 'principal', origem: SUP, ativo: true, horario: '18:00', dias: [0, 1, 2, 3, 4, 5, 6], destinatarios: [LUAN], ...e });
const desenvolvimento = (e: Record<string, unknown> = {}) => ({ id: 'dev', origem: DEV, ativo: true, horario: '18:30', dias: [0, 1, 2, 3, 4, 5, 6], destinatarios: [DEVS], ...e });
const ajustes = (envios: unknown[], r: Record<string, unknown> = {}) => ({ url: URL_DA_API, remetente: '(71) 3512-0000', ...r, envios });

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  adminId = (await s.login()).id;
  // três chamados no Suporte e um no Desenvolvimento, todos de hoje
  for (const titulo of ['Ramal mudo', 'URA não toca', 'Fila parada']) {
    const r = await s.post('/atendimento/chamados', { painelId: SUP, titulo, relato: 'Aconteceu agora', responsavelId: adminId });
    expect(r.statusCode, r.body).toBe(201);
  }
  expect((await s.post('/atendimento/chamados', { painelId: DEV, titulo: 'Erro no relatório', relato: 'Botão não responde', responsavelId: adminId })).statusCode).toBe(201);

  // como ficou guardado até o 2.4.4: um envio só, do Legado, e o que estava marcado lá
  await app.db.insert(settings).values([
    {
      id: 'envio-automatico',
      value: JSON.stringify({
        ativo: true, url: URL_DA_API, remetente: '557135120000', horario: '18:00', dias: [0, 1, 2, 3, 4, 5, 6],
        destinatarios: [{ ...LUAN, numero: '5571999990001' }], concluirConversa: false, ultimoAgendado: null,
        configuradoEm: '2026-10-05T21:00:00.000Z', configuradoPor: 'Luan',
        historico: [{ id: 'h0', em: '2026-11-03T21:00:00.000Z', dia: '2026-11-03', gatilho: 'agendado', quem: null, ok: true, mensagem: 'Enviado para 1 número.', pdf: null, itens: [], destinatarios: [] }],
      }),
    },
    { id: 'envio-automatico-marcados', value: JSON.stringify({ relatorios: ['relogio', 'mes', 'primeira'], graficos: ['serie', 'etapa', 'campo:assunto'], atualizadoEm: null, atualizadoPor: null }) },
  ]);

  envio.trocarFerramentas({
    pasta: mkdtempSync(join(tmpdir(), 'envios-')),
    gerarPdf: async (_app, chave) => {
      if (!envio.chaveValida(chave)) throw new Error('chave inválida');
      paginas.push(envio.envioDaChave(chave));
      return Buffer.from('%PDF-1.4 PDF de teste');
    },
    fetchFn: (async (_url: string, init: RequestInit) => {
      if ((init.method ?? 'GET') === 'POST') {
        const c = JSON.parse(String(init.body));
        recebidos.push({ para: c.to, texto: c.body.text, arquivo: c.body.fileUrl });
      }
      return new Response(JSON.stringify({ id: 'msg-1', sessionId: 'sessao-1' }), { status: 200 });
    }) as typeof fetch,
    esperar: async () => {},
  });
});
afterAll(async () => { envio.trocarFerramentas({ agora: () => new Date() }); await app.close(); });

describe('O envio de antes do 2.4.5', () => {
  it('vira o envio do painel Suporte, com o mesmo horário, os mesmos números e o histórico', async () => {
    const a = (await s.get('/envio/ajustes')).json();
    expect(a.envios).toHaveLength(1);
    expect(a.envios[0]).toMatchObject({ id: 'principal', origem: SUP, origemNome: 'Suporte', origemSigla: 'SUP', ativo: true, horario: '18:00', origemProblema: null });
    expect(a.envios[0].destinatarios.map((d: any) => d.numero)).toEqual(['5571999990001']);
    expect(a).toMatchObject({ url: URL_DA_API, remetente: '557135120000', concluirConversa: false });
    // o histórico de antes é do Legado
    expect(a.historico[0]).toMatchObject({ id: 'h0', envioId: 'principal', origemNome: 'Legado do Helena' });
    // as origens: os painéis de chamados e o Legado (o de Vendas não)
    expect(a.origens.map((o: any) => o.id)).toEqual(expect.arrayContaining([SUP, DEV, 'legado']));
  });
  it('o que estava marcado no Legado foi junto para o Suporte, onde tem par; o do Legado continua lá', async () => {
    const a = (await s.get('/envio/ajustes')).json();
    expect(a.envios[0].marcados.graficos.map((g: any) => g.titulo)).toEqual(['Chamados que chegaram hoje, por hora', 'Por assunto', 'Por etapa']);
    expect(a.envios[0].marcados.relatorios.map((r: any) => r.titulo)).toEqual(['Relógio do chamado', 'Primeira resposta', 'Fechamento do mês']);
    expect((await s.get('/envio/marcados?origem=painel-suporte')).json()).toMatchObject({ relatorios: ['relogio', 'fechamento', 'resposta'], graficos: ['serie', 'etapa', 'assunto'] });
    expect((await s.get('/envio/marcados')).json()).toMatchObject({ origem: 'legado', relatorios: ['relogio', 'mes', 'primeira'] });
  });
});

describe('A lista de envios', () => {
  it('um envio por painel; o de Vendas e o que não existe não entram', async () => {
    await app.db.insert(ticketPanels).values({ id: 'painel-vendas-teste', name: 'Vendas', key: 'VEN', kind: 'vendas' });
    expect((await s.put('/envio/ajustes', ajustes([suporte(), suporte({ id: 'outro' })]))).statusCode).toBe(400);
    expect((await s.put('/envio/ajustes', ajustes([suporte({ origem: 'painel-vendas-teste' })]))).statusCode).toBe(400);
    expect((await s.get('/envio/ajustes')).json().origens.map((o: any) => o.id)).not.toContain('painel-vendas-teste');
  });
  it('dois envios, cada um com o seu horário e os seus números; a FlwChat é uma só', async () => {
    const r = await s.put('/envio/ajustes', { ...ajustes([suporte(), desenvolvimento()]), token: TOKEN });
    expect(r.statusCode, r.body).toBe(200);
    const a = r.json();
    expect(a.envios.map((e: any) => [e.origemNome, e.horario, e.destinatarios.length])).toEqual([['Suporte', '18:00', 1], ['Desenvolvimento', '18:30', 1]]);
    expect(a.temToken).toBe(true);
    expect(r.body).not.toContain(TOKEN);
    const log = JSON.stringify(await app.db.select().from(auditLog));
    expect(log).toContain('salvou o envio automático (Suporte, ligado às 18:00, para 1 número; Desenvolvimento, ligado às 18:30, para 1 número) e trocou o token');
    expect(log).not.toContain(TOKEN);
    // agora gravado no jeito novo, sem os campos do envio único
    const [linha] = await app.db.select().from(settings).where(eq(settings.id, 'envio-automatico'));
    const guardado = JSON.parse(linha!.value);
    expect(guardado.envios).toHaveLength(2);
    expect(guardado.destinatarios).toBeUndefined();
  });
});

describe('O aviãozinho de cada painel', () => {
  it('marca para o painel, sem mexer nos outros (nem no que o Suporte herdou do Legado)', async () => {
    const r = await s.put('/envio/marcados?origem=painel-desenvolvimento', { graficos: ['serie', 'responsavel'], relatorios: ['equipe'] });
    expect(r.statusCode, r.body).toBe(200);
    expect((await s.get('/envio/marcados?origem=painel-desenvolvimento')).json()).toMatchObject({ graficos: ['serie', 'responsavel'], relatorios: ['equipe'] });
    expect((await s.get('/envio/marcados?origem=painel-suporte')).json()).toMatchObject({ relatorios: ['relogio', 'fechamento', 'resposta'] });
    expect(JSON.stringify(await app.db.select().from(auditLog))).toContain('mudou o que vai no envio automático do painel Desenvolvimento');
  });
  it('recusa o que não é do painel: os ids do Legado, o Raio-X, o painel de Vendas', async () => {
    expect((await s.put('/envio/marcados?origem=painel-suporte', { relatorios: ['mes'] })).statusCode).toBe(400);
    expect((await s.put('/envio/marcados?origem=painel-suporte', { relatorios: ['raiox'] })).statusCode).toBe(400);
    expect((await s.put('/envio/marcados?origem=painel-vendas-teste', { relatorios: [] })).statusCode).toBe(404);
  });
});

describe('O PDF de um painel', () => {
  it('a chave abre a página de um envio: os números e os gráficos da Visão de hoje e os relatórios do dia', async () => {
    const chave = envio.novaChave('principal');
    const r = await app.inject({ method: 'GET', url: `/api/envio/pacote?chave=${chave}` });
    expect(r.statusCode, r.body).toBe(200);
    const p = r.json();
    expect(p).toMatchObject({ tipo: 'painel', painel: { id: SUP, sigla: 'SUP' } });
    expect(p.kpis.find((k: any) => k.id === 'chegaram-hoje')).toMatchObject({ label: 'Chegaram hoje', valor: '3' });
    expect(p.graficos.map((g: any) => g.id)).toEqual(['serie', 'assunto', 'etapa']);
    expect(p.graficos.find((g: any) => g.id === 'etapa').grafico.itens.reduce((n: number, x: any) => n + x.n, 0)).toBe(3);
    expect(p.relatorioIds).toEqual(['relogio', 'resposta', 'fechamento']);
    expect([p.relatorios.periodo.de, p.relatorios.periodo.ate]).toEqual([p.dia, p.dia]);
    // a outra chave, o outro painel
    const dev = (await app.inject({ method: 'GET', url: `/api/envio/pacote?chave=${envio.novaChave('dev')}` })).json();
    expect(dev).toMatchObject({ tipo: 'painel', painel: { sigla: 'DEV' }, relatorioIds: ['equipe'] });
    expect(dev.kpis.find((k: any) => k.id === 'chegaram-hoje').valor).toBe('1');
    // com a sessão (o "Ver como fica"): pelo envio
    expect((await s.get('/envio/pacote?envio=dev')).json().painel.sigla).toBe('DEV');
    expect((await s.get('/envio/pacote?envio=nao-existe')).statusCode).toBe(404);
  });
});

describe('Mandar', () => {
  it('o PDF do painel, com a sigla no nome do arquivo e os números da Visão na mensagem', async () => {
    recebidos = []; paginas = [];
    const e = (await s.post('/envio/enviar', { envio: 'principal' })).json();
    expect(e).toMatchObject({ ok: true, envioId: 'principal', origem: SUP, origemNome: 'Suporte' });
    expect(e.itens).toEqual(['Chamados que chegaram hoje, por hora', 'Por assunto', 'Por etapa', 'Relógio do chamado', 'Primeira resposta', 'Fechamento do mês']);
    expect(paginas).toEqual(['principal']);
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]!.para).toBe('5571999990001');
    expect(recebidos[0]!.texto).toContain('*Chamados de hoje*');
    expect(recebidos[0]!.texto).toContain('Painel Suporte');
    expect(recebidos[0]!.texto).toContain('• Chegaram hoje: 3');
    expect(recebidos[0]!.arquivo).toMatch(/\/api\/envio\/arquivo\/[a-f0-9]{36}\/chamados-sup-\d{2}-\d{2}-\d{4}\.pdf$/);
    const a = (await s.get('/envio/ajustes')).json();
    expect(a.historico[0]).toMatchObject({ envioId: 'principal', origemNome: 'Suporte', gatilho: 'manual' });
    expect(JSON.stringify(await app.db.select().from(auditLog))).toContain('mandou PDF dos Chamados do painel Suporte (6 itens)');
  });
  it('o teste diz de qual painel é, e vai só para a lista daquele envio', async () => {
    recebidos = [];
    const e = (await s.post('/envio/testar', { envio: 'dev' })).json();
    expect(e.ok).toBe(true);
    expect(recebidos.map((r) => r.para)).toEqual(['5571999990002']);
    expect(recebidos[0]!.texto).toContain('do painel Desenvolvimento');
    expect(recebidos[0]!.arquivo).toBeUndefined();
  });
});

describe('O relógio, com dois envios', () => {
  const as = (hhmm: string) => () => new Date(`2026-11-05T${hhmm}:00-03:00`);
  const volta = async (hhmm: string) => { envio.trocarFerramentas({ agora: as(hhmm) }); return (await envio.voltaDoRelogio(app)).map((r) => r.origemNome); };

  it('cada um sai na hora dele, uma vez', async () => {
    recebidos = []; paginas = [];
    expect(await volta('17:59')).toEqual([]);
    expect(await volta('18:00')).toEqual(['Suporte']);
    expect(await volta('18:01')).toEqual([]);
    expect(await volta('18:30')).toEqual(['Desenvolvimento']);
    expect(await volta('18:31')).toEqual([]);
    expect(paginas).toEqual(['principal', 'dev']);
    expect(recebidos.map((r) => r.para)).toEqual(['5571999990001', '5571999990002']);
    envio.trocarFerramentas({ agora: as('18:32') });
    const a = (await s.get('/envio/ajustes')).json();
    expect(a.envios.map((e: any) => [e.hoje?.ok, e.proximo])).toEqual([[true, 'amanhã às 18:00'], [true, 'amanhã às 18:30']]);
  });
});

describe('O painel desativado', () => {
  afterAll(async () => { await app.db.update(ticketPanels).set({ active: true }).where(eq(ticketPanels.id, DEV)); });
  it('não manda, e a tela diz por quê', async () => {
    envio.trocarFerramentas({ agora: () => new Date() });
    await app.db.update(ticketPanels).set({ active: false }).where(eq(ticketPanels.id, DEV));
    recebidos = [];
    const e = (await s.post('/envio/enviar', { envio: 'dev' })).json();
    expect(e.ok).toBe(false);
    expect(e.mensagem).toContain('O painel Desenvolvimento está desativado');
    expect(recebidos).toHaveLength(0);
    const a = (await s.get('/envio/ajustes')).json();
    expect(a.envios[1].origemProblema).toContain('está desativado');
  });
});
