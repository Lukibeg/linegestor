/**
 * Patch 2.0 — os chamados do Gestor (decisão 0047): a rotina, o relógio e a IA no chamado.
 *
 *  - os agendados: o cadastro, a próxima vez e a regra em palavras, o "criar agora"; o relógio cria o
 *    que venceu e calcula a próxima vez, "uma vez" desliga, e um agendado com problema não segura os outros
 *  - o relógio: o alerta de prazo (perto e vencido, uma vez cada), o sem responsável (os supervisores,
 *    no horário de atendimento) e o Resolvido que fecha sozinho (e o pai que espera os filhos)
 *  - a IA no chamado, com um provedor falso: só entra o que existe nas opções; a conversa do LineChat;
 *    sem a IA ligada, 400 com a mensagem
 *
 * O relógio de verdade não liga nos testes: cada teste chama a volta com a hora que quiser.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { clients, newId, ticketNotifications, ticketPanels, ticketSchedules, ticketSubjects, tickets } from '@gestor/db';
import {
  AJUSTES_PRAZOS_PADRAO, ChamadoCriarSchema, diaLocal, INSTRUCOES_IA_CHAMADO, instanteLocal, proximaExecucao, RegraAgendadoSchema, somarDiasUteis,
  somarMinutosUteis, type AjustesPrazos, type Calendario, type HorarioDoDia,
} from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import * as integ from '../src/services/integracoes.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';
import { trocarFerramentasWhatsApp } from '../src/services/atendimento/whatsapp.js';
import { trocarFerramentasWebhook } from '../src/services/atendimento/webhooks.js';
import { criarChamado } from '../src/services/atendimento/chamados.js';
import type { Ator } from '../src/services/atendimento/contexto.js';
import { voltaDoRelogioDosChamados } from '../src/services/atendimento/relogio.js';
import { esquecerLimitesIa, trocarFerramentasIa } from '../src/services/baseIa.js';

let app: App;
let s: Session;         // administrador: cuida dos chamados
let operador: Session;  // Marina: trabalha
let tecnico: Session;   // Bruno: trabalha (não cuida)
let leitor: Session;    // Rita: só lê
let marinaId = '';
let brunoId = '';
let aurora = '';
let linepbx = '';
let ramal = '';
let semAudio = '';
let assuntoDev = '';

const SUP = 'painel-suporte';
const DEV = 'painel-desenvolvimento';
const E = {
  novo: 'etapa-suporte-novo', n1: 'etapa-suporte-n1', n2: 'etapa-suporte-n2', resolvido: 'etapa-suporte-resolvido', fechado: 'etapa-suporte-fechado',
  devNovo: 'etapa-desenvolvimento-novo', devFechado: 'etapa-desenvolvimento-fechado',
};
const MINUTO = 60_000;
const DIA = 86_400_000;

// os calendários dos testes (a conta fica a mesma, rode o teste no sábado à noite ou na terça de manhã)
const ABERTO: HorarioDoDia = { abre: true, inicio: '08:00', fim: '18:00' };
const FECHADO: HorarioDoDia = { abre: false, inicio: '08:00', fim: '18:00' };
/** Segunda a sexta, das 8h às 18h, sem feriados. */
const SEMANA: Calendario = { horario: [FECHADO, ABERTO, ABERTO, ABERTO, ABERTO, ABERTO, FECHADO], feriados: [] };
/** Nenhum dia aberto: o Gestor conta corrido. */
const CORRIDO: Calendario = { horario: [FECHADO, FECHADO, FECHADO, FECHADO, FECHADO, FECHADO, FECHADO], feriados: [] };

async function prazos(mudar: Partial<AjustesPrazos>) {
  await integ.gravar(app.db, 'atendimento-prazos', { ...AJUSTES_PRAZOS_PADRAO, ...mudar });
}
async function abrir(sess: Session, d: Record<string, unknown> = {}) {
  const r = await sess.post('/atendimento/chamados', { painelId: SUP, titulo: 'Ramal mudo', relato: 'O ramal 203 não toca', ...d });
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string; codigo: string };
}
async function ficha(ref: string) {
  const r = await s.get(`/atendimento/chamados/${encodeURIComponent(ref)}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
const eventos = (f: any, tipo: string) => (f.historico as any[]).filter((e) => e.tipo === tipo);
async function ajustarPainel(id: string, mudar: Record<string, unknown>) {
  const [p] = await app.db.select().from(ticketPanels).where(eq(ticketPanels.id, id));
  await app.db.update(ticketPanels).set({ settings: { ...(p!.settings as object), ...mudar } }).where(eq(ticketPanels.id, id));
}
/** Os avisos (o sininho) de uma pessoa sobre um chamado, de um tipo. */
async function avisos(userId: string, ticketId: string, tipo: string) {
  const linhas = await app.db.select().from(ticketNotifications)
    .where(and(eq(ticketNotifications.userId, userId), eq(ticketNotifications.ticketId, ticketId), eq(ticketNotifications.kind, tipo)));
  return linhas.map((l) => l.body);
}
async function linhaDoChamado(id: string) {
  const [t] = await app.db.select().from(tickets).where(eq(tickets.id, id));
  return t!;
}
async function auditoria(filtro: string) {
  return ((await s.get(`/admin/audit?${filtro}&pageSize=500`)).json().items as any[]).map((i) => i.summary as string);
}
const volta = (agora: Date) => voltaDoRelogioDosChamados(app, agora);
/** A integração (como o n8n): abre sem contar como primeira resposta, então o prazo de resposta corre. */
const n8n: Ator = { tipo: 'integracao', id: 'chave-de-teste', nome: 'n8n' };
const abrirComoN8n = (d: Record<string, unknown>) => criarChamado(app, n8n, ChamadoCriarSchema.parse({ painelId: SUP, ...d }), { origem: 'api' });

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const papeis = (await s.get('/admin/roles')).json();
  const idDe = (key: string) => papeis.find((r: any) => r.key === key).id;
  marinaId = (await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('operador') })).json().id;
  brunoId = (await s.post('/admin/users', { name: 'Bruno Técnico', email: 'bruno@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('tecnico') })).json().id;
  await s.post('/admin/users', { name: 'Rita Leitora', email: 'rita@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('leitor') });
  operador = new Session(app); await operador.login('marina@gestor.local', 'SenhaDeTeste!123');
  tecnico = new Session(app); await tecnico.login('bruno@gestor.local', 'SenhaDeTeste!123');
  leitor = new Session(app); await leitor.login('rita@gestor.local', 'SenhaDeTeste!123');

  aurora = newId();
  await app.db.insert(clients).values({ id: aurora, tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora LTDA', cnpj: '11222333000181' });
  linepbx = (await s.get('/admin/products')).json().find((p: any) => p.code === 'linepbx').id;
  ramal = newId(); semAudio = newId(); assuntoDev = newId();
  await app.db.insert(ticketSubjects).values([
    { id: ramal, panelId: SUP, name: 'Ramal', checklist: ['Testar o ramal', 'Conferir o registro'] },
    { id: semAudio, panelId: SUP, parentId: ramal, name: 'Sem áudio' },
    { id: assuntoDev, panelId: DEV, name: 'Correção de tela' },
  ]);

  // nada sai do servidor nos testes
  const recusar = (async () => { throw new Error('rede desligada nos testes'); }) as unknown as typeof fetch;
  trocarFerramentasWhatsApp({ fetchFn: recusar });
  trocarFerramentasWebhook({ fetchFn: recusar, resolver: async () => ['203.0.113.10'], esperar: async () => {} });
  trocarFerramentasIa({ fetchFn: recusar });
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

// =====================================================================

describe('os agendados', () => {
  const MENSAL = { frequencia: 'mensal', hora: '08:00', diaDoMes: 15 };
  beforeAll(async () => { await prazos({ calendario: SEMANA }); });
  // os agendados de um teste não nascem no relógio do outro
  beforeEach(async () => { await app.db.update(ticketSchedules).set({ active: false }); });
  afterAll(async () => { await app.db.update(ticketSchedules).set({ active: false }); });

  it('cria com a próxima vez certa e a regra em palavras; lista; muda (recalcula); remove', async () => {
    const antes = new Date();
    const r = await s.post('/atendimento/agendados', {
      painelId: SUP, titulo: 'Verificar os DIDs', relato: 'A verificação de todo mês', clienteId: aurora, responsavelId: marinaId,
      assuntoId: ramal, prioridade: 'baixa', checklist: ['Conferir os DIDs ativos'], regra: MENSAL,
    });
    expect(r.statusCode, r.body).toBe(201);
    const a = r.json();
    expect(a).toMatchObject({
      painelId: SUP, titulo: 'Verificar os DIDs', relato: 'A verificação de todo mês', clienteId: aurora, clienteNome: 'Clínica Aurora',
      responsavelId: marinaId, responsavelNome: 'Marina Costa', assuntoId: ramal, prioridade: 'baixa', checklist: ['Conferir os DIDs ativos'],
      textoRegra: 'Todo dia 15 às 08:00', ativo: true, ultimaEm: null, ultimoCodigo: null,
      proximaEm: proximaExecucao(RegraAgendadoSchema.parse(MENSAL), antes, SEMANA)!.toISOString(),
    });
    expect((await s.get('/atendimento/agendados')).json().map((x: any) => x.id)).toContain(a.id);

    const semanal = { frequencia: 'semanal', hora: '09:30', dias: [4, 1] };
    const mudou = await s.put(`/atendimento/agendados/${a.id}`, { painelId: SUP, titulo: 'Verificar os DIDs', regra: semanal, ativo: false });
    expect(mudou.statusCode, mudou.body).toBe(200);
    expect(mudou.json()).toMatchObject({
      textoRegra: 'Toda segunda e quinta às 09:30', ativo: false, clienteId: null, responsavelId: null, checklist: [],
      proximaEm: proximaExecucao(RegraAgendadoSchema.parse(semanal), new Date(), SEMANA)!.toISOString(),
    });

    expect((await s.del(`/atendimento/agendados/${a.id}`)).json()).toEqual({ ok: true });
    expect((await s.get('/atendimento/agendados')).json().map((x: any) => x.id)).not.toContain(a.id);
    expect((await s.del(`/atendimento/agendados/${a.id}`)).statusCode).toBe(404);
    expect(await auditoria('entityType=ticket_schedule')).toEqual(expect.arrayContaining([
      'Agendou o chamado "Verificar os DIDs" no painel Suporte: Todo dia 15 às 08:00',
      'Alterou o agendado "Verificar os DIDs": Toda segunda e quinta às 09:30 (desligou)',
      'Removeu o agendado "Verificar os DIDs"',
    ]));
  });

  it('confere o cadastro ao salvar (e não na hora de nascer)', async () => {
    const base = { painelId: SUP, titulo: 'Rotina', regra: MENSAL };
    const erro = async (d: Record<string, unknown>) => {
      const r = await s.post('/atendimento/agendados', { ...base, ...d });
      expect(r.statusCode).toBe(400);
      return r.json().error;
    };
    expect(await erro({ assuntoId: assuntoDev })).toBe('Esse assunto não é do painel Suporte (ou foi desativado).');
    expect(await erro({ responsavelId: 'nao-existe' })).toBe('O responsável escolhido não existe ou está desativado.');
    expect(await erro({ clienteId: 'nao-existe' })).toBe('O cliente escolhido não existe (ou está na lixeira).');
    expect(await erro({ painelId: 'nao-existe' })).toBe('O painel escolhido não existe (ou foi removido).');
    expect(await erro({ regra: { frequencia: 'uma_vez', hora: '08:00', data: '2020-01-01' } })).toBe('Essa data e hora já passaram: escolha um momento que ainda vai chegar.');
    expect(await erro({ regra: { frequencia: 'semanal', hora: '08:00', dias: [] } })).toBe('Dados inválidos');
    // só quem cuida
    expect((await operador.get('/atendimento/agendados')).statusCode).toBe(403);
    expect((await operador.post('/atendimento/agendados', base)).statusCode).toBe(403);
  });

  it('"criar agora" abre o chamado já (origem agendado, com o checklist) sem mudar a próxima vez', async () => {
    const a = (await s.post('/atendimento/agendados', {
      painelId: SUP, titulo: 'Verificar os DIDs', clienteId: aurora, responsavelId: marinaId, assuntoId: ramal, prioridade: 'baixa',
      checklist: ['Conferir os DIDs ativos'], regra: MENSAL,
    })).json();
    expect((await operador.post(`/atendimento/agendados/${a.id}/agora`, {})).statusCode).toBe(403);
    const r = await s.post(`/atendimento/agendados/${a.id}/agora`, {});
    expect(r.statusCode, r.body).toBe(201);
    const { codigo } = r.json();
    expect(codigo).toMatch(/^SUP-\d+$/);
    const f = await ficha(codigo);
    expect(f).toMatchObject({ origem: 'agendado', titulo: 'Verificar os DIDs', cliente: { id: aurora }, responsavel: { id: marinaId }, assunto: { id: ramal }, prioridade: 'baixa' });
    expect(f.checklist.map((i: any) => [i.texto, i.doAssunto])).toEqual([['Testar o ramal', true], ['Conferir o registro', true], ['Conferir os DIDs ativos', false]]);
    expect((await linhaDoChamado(f.id)).scheduleId).toBe(a.id);
    const depois = (await s.get('/atendimento/agendados')).json().find((x: any) => x.id === a.id);
    expect(depois).toMatchObject({ proximaEm: a.proximaEm, ultimoCodigo: codigo });
    expect(depois.ultimaEm).not.toBeNull();
    // a Marina (a responsável) recebeu o aviso
    expect(await avisos(marinaId, f.id, 'recebeu')).toEqual([`Você recebeu o chamado ${codigo}`]);
    expect(await auditoria('entityType=ticket')).toContain(`Abriu ${codigo} "Verificar os DIDs" pelo agendado (criar agora)`);
  });

  it('o relógio cria o que venceu (uma vez só) e calcula a próxima vez', async () => {
    const regra = { frequencia: 'diaria', hora: '07:30' };
    const a = (await s.post('/atendimento/agendados', { painelId: SUP, titulo: 'Conferir os backups', checklist: ['Abrir o painel do backup'], regra })).json();
    const vez = new Date(a.proximaEm);
    expect((await volta(new Date(vez.getTime() - MINUTO)))!.agendados).toEqual([]);

    const quando = new Date(vez.getTime() + MINUTO);
    const v = await volta(quando);
    expect(v!.agendados).toHaveLength(1);
    const codigo = v!.agendados[0]!;
    const [linha] = await app.db.select().from(ticketSchedules).where(eq(ticketSchedules.id, a.id));
    expect(linha).toMatchObject({ active: true, lastTicketCode: codigo });
    expect(linha!.lastRunAt!.toISOString()).toBe(quando.toISOString());
    expect(linha!.nextRunAt!.toISOString()).toBe(proximaExecucao(RegraAgendadoSchema.parse(regra), quando, SEMANA)!.toISOString());
    expect(linha!.nextRunAt!.getTime()).toBe(vez.getTime() + DIA);

    const f = await ficha(codigo);
    expect(f).toMatchObject({ origem: 'agendado', titulo: 'Conferir os backups', criadoPor: null });
    expect(f.checklist.map((i: any) => i.texto)).toEqual(['Abrir o painel do backup']);
    expect(f.historico[0]).toMatchObject({ tipo: 'criado', por: null, porNome: 'Gestor', texto: 'abriu o chamado (Chamado agendado) em Novo' });
    // a mesma vez não nasce de novo
    expect((await volta(new Date(vez.getTime() + 2 * MINUTO)))!.agendados).toEqual([]);
    expect(await auditoria('entityType=ticket')).toContain(`O agendado "Conferir os backups" abriu ${codigo}`);
  });

  it('"uma vez" nasce e desliga; o desligado não nasce', async () => {
    const amanha = diaLocal(new Date(Date.now() + DIA));
    const a = (await s.post('/atendimento/agendados', { painelId: SUP, titulo: 'Trocar o certificado', regra: { frequencia: 'uma_vez', hora: '10:00', data: amanha } })).json();
    expect(a).toMatchObject({ textoRegra: `Em ${amanha.slice(8, 10)}/${amanha.slice(5, 7)}/${amanha.slice(0, 4)} às 10:00`, proximaEm: instanteLocal(amanha, '10:00').toISOString() });
    const desligado = (await s.post('/atendimento/agendados', { painelId: SUP, titulo: 'Desligado', regra: { frequencia: 'uma_vez', hora: '10:00', data: amanha }, ativo: false })).json();
    const v = await volta(new Date(Date.parse(a.proximaEm) + 30_000));
    expect(v!.agendados).toHaveLength(1);
    const lista = (await s.get('/atendimento/agendados')).json();
    expect(lista.find((x: any) => x.id === a.id)).toMatchObject({ ativo: false, proximaEm: null, ultimoCodigo: v!.agendados[0] });
    expect(lista.find((x: any) => x.id === desligado.id)).toMatchObject({ ativo: false, ultimoCodigo: null });
  });

  it('um agendado com problema não segura os outros: vai para a próxima vez, e a auditoria conta por quê', async () => {
    const regra = { frequencia: 'diaria', hora: '06:00' };
    const bom = (await s.post('/atendimento/agendados', { painelId: SUP, titulo: 'Rotina boa', regra })).json();
    const ruim = (await s.post('/atendimento/agendados', { painelId: DEV, titulo: 'Rotina do painel desligado', regra })).json();
    await app.db.update(ticketPanels).set({ active: false }).where(eq(ticketPanels.id, DEV));
    const v = await volta(new Date(Date.parse(bom.proximaEm) + MINUTO));
    await app.db.update(ticketPanels).set({ active: true }).where(eq(ticketPanels.id, DEV));
    expect(v!.agendados).toHaveLength(1);
    expect(v!.agendados[0]).toMatch(/^SUP-/);
    expect(v!.erros).toBe(1);
    const [r] = await app.db.select().from(ticketSchedules).where(eq(ticketSchedules.id, ruim.id));
    expect(r!.lastTicketCode).toBeNull();
    expect(r!.nextRunAt!.getTime()).toBe(Date.parse(ruim.proximaEm) + DIA);
    expect(await auditoria('entityType=ticket_schedule')).toContain('O agendado "Rotina do painel desligado" não abriu o chamado: O painel Desenvolvimento está desativado: escolha outro.');
  });
});

// =====================================================================

describe('o relógio: os prazos, o sem responsável e o fechar sozinho', () => {
  beforeAll(async () => { await ajustarPainel(SUP, { supervisores: [brunoId] }); });
  afterAll(async () => {
    await ajustarPainel(SUP, { supervisores: [] });
    await prazos({});
  });

  it('perto de vencer avisa o responsável; vencido, o responsável e os supervisores — uma vez cada', async () => {
    // conta corrida, para o teste não depender da hora em que roda
    await prazos({ calendario: CORRIDO, prazos: { ...AJUSTES_PRAZOS_PADRAO.prazos, alta: { resposta: 10, solucao: 100, conta: 'corridas' } }, alertaPercentual: 80 });
    const r = await abrirComoN8n({ titulo: 'Fila parada', prioridade: 'alta', responsavelId: marinaId });
    const t0 = (await linhaDoChamado(r.id)).createdAt.getTime();

    await volta(new Date(t0 + 7 * MINUTO)); // 70%: nada
    expect(await avisos(marinaId, r.id, 'prazo_perto')).toEqual([]);
    const v = await volta(new Date(t0 + 8.5 * MINUTO)); // 85%: perto
    expect(v!.alertas).toBeGreaterThanOrEqual(1);
    const perto = await avisos(marinaId, r.id, 'prazo_perto');
    expect(perto).toHaveLength(1);
    expect(perto[0]).toMatch(new RegExp(`^O prazo de resposta do ${r.codigo} está perto de vencer: faltam 1 min \\(vence `));
    expect(await avisos(brunoId, r.id, 'prazo_perto')).toEqual([]);
    await volta(new Date(t0 + 9 * MINUTO)); // ainda perto: nada de novo
    expect(await avisos(marinaId, r.id, 'prazo_perto')).toHaveLength(1);

    await volta(new Date(t0 + 11 * MINUTO)); // vencido
    expect(await avisos(marinaId, r.id, 'prazo_vencido')).toEqual([`O prazo de resposta do ${r.codigo} venceu`]);
    expect(await avisos(brunoId, r.id, 'prazo_vencido')).toEqual([`O prazo de resposta do ${r.codigo} venceu`]);
    await volta(new Date(t0 + 12 * MINUTO));
    expect(await avisos(marinaId, r.id, 'prazo_vencido')).toHaveLength(1);

    expect(Object.keys((await linhaDoChamado(r.id)).alertsSent as object).sort()).toEqual(['resposta_perto', 'resposta_vencida']);
    const f = await ficha(r.codigo);
    expect(eventos(f, 'prazo').map((e: any) => [e.por, e.texto])).toEqual([
      [null, expect.stringMatching(/^o prazo de resposta chegou a 85%: faltam 1 min \(vence /)],
      [null, 'o prazo de resposta venceu (era de 10 min)'],
    ]);
  });

  it('o chamado sem prazo (sem prioridade, ou num painel que não conta prazo) não gera alerta', async () => {
    const semPrioridade = await abrirComoN8n({ titulo: 'Sem prioridade', responsavelId: marinaId });
    const doDev = await criarChamado(app, n8n, ChamadoCriarSchema.parse({ painelId: DEV, titulo: 'No Desenvolvimento', prioridade: 'alta', responsavelId: marinaId }), { origem: 'api' });
    const t0 = (await linhaDoChamado(doDev.id)).createdAt.getTime();
    await volta(new Date(t0 + 60 * MINUTO));
    for (const id of [semPrioridade.id, doDev.id]) {
      expect(await avisos(marinaId, id, 'prazo_perto')).toEqual([]);
      expect(await avisos(marinaId, id, 'prazo_vencido')).toEqual([]);
    }
  });

  it('sem responsável na entrada além do tempo combinado (no horário de atendimento): avisa os supervisores, uma vez', async () => {
    await prazos({ calendario: SEMANA, semDonoMinutos: 15 });
    const r = await abrirComoN8n({ titulo: 'Ninguém pegou' });
    const comDono = await abrirComoN8n({ titulo: 'Já tem dono', responsavelId: marinaId });
    const criado = (await linhaDoChamado(r.id)).createdAt;
    // os minutos contam no horário de atendimento (aberto no sábado à noite, os 15 minutos acabam na segunda às 8h15)
    const depoisDe = (minutos: number) => somarMinutosUteis(criado, minutos, SEMANA);
    await volta(depoisDe(14));
    expect(await avisos(brunoId, r.id, 'sem_dono')).toEqual([]);
    const v = await volta(depoisDe(16));
    expect(v!.semDono).toBeGreaterThanOrEqual(1);
    expect(await avisos(brunoId, r.id, 'sem_dono')).toEqual([`O ${r.codigo} está sem responsável há mais de 15 min`]);
    await volta(depoisDe(45));
    expect(await avisos(brunoId, r.id, 'sem_dono')).toHaveLength(1);
    expect(await avisos(brunoId, comDono.id, 'sem_dono')).toEqual([]);
    expect(((await linhaDoChamado(r.id)).alertsSent as Record<string, string>).sem_dono).toBeTruthy();
  });

  it('o Resolvido sem resposta por 3 dias úteis fecha sozinho (com "fechou sozinho" no histórico)', async () => {
    await prazos({ calendario: SEMANA });
    const r = await abrirComoN8n({ titulo: 'Áudio voltou', responsavelId: marinaId });
    // resolvido numa quarta, às 10h (direto no banco: o caminho até o Resolvido está testado no núcleo)
    const resolvido = instanteLocal('2026-10-14', '10:00');
    await app.db.update(tickets).set({ stageId: E.resolvido, resolvedAt: resolvido }).where(eq(tickets.id, r.id));
    const limite = somarDiasUteis(resolvido, 3, SEMANA).getTime();

    expect((await volta(new Date(limite - MINUTO)))!.fechados).not.toContain(r.codigo);
    const quando = new Date(limite + MINUTO);
    expect((await volta(quando))!.fechados).toContain(r.codigo);
    const f = await ficha(r.codigo);
    expect(f).toMatchObject({ etapaId: E.fechado, situacao: 'fechado', fechadoEm: quando.toISOString(), resolvidoEm: resolvido.toISOString() });
    const [etapa, fechou] = f.historico.slice(-2);
    expect(etapa).toMatchObject({ tipo: 'etapa', por: null, porNome: null, dados: { de: { nome: 'Resolvido' }, para: { nome: 'Fechado' } } });
    expect(fechou).toMatchObject({ tipo: 'fechou_sozinho', por: null, porNome: null, dados: { dias: 3, etapa: 'Resolvido' }, texto: 'fechou sozinho: 3 dias úteis no Resolvido sem resposta do cliente' });
    expect(f.trajetoria.at(-1)).toMatchObject({ etapa: 'Fechado', por: null });
    expect(await auditoria('entityType=ticket')).toContain(`${r.codigo} fechou sozinho: 3 dias úteis no Resolvido sem resposta do cliente`);
    // fechado não fecha de novo
    expect((await volta(new Date(limite + 2 * MINUTO)))!.fechados).not.toContain(r.codigo);
  });

  it('o pai que espera os filhos só fecha sozinho depois que os filhos fecham', async () => {
    const pai = await abrirComoN8n({ titulo: 'Queda geral', responsavelId: marinaId });
    const filho = await criarChamado(app, n8n, ChamadoCriarSchema.parse({ painelId: DEV, titulo: 'Corrigir a rota', paiId: pai.id }), { origem: 'api' });
    const resolvido = instanteLocal('2026-10-14', '10:00');
    await app.db.update(tickets).set({ stageId: E.resolvido, resolvedAt: resolvido }).where(eq(tickets.id, pai.id));
    const depois = new Date(somarDiasUteis(resolvido, 3, SEMANA).getTime() + MINUTO);
    expect((await volta(depois))!.fechados).not.toContain(pai.codigo);
    await app.db.update(tickets).set({ stageId: E.devFechado, closedAt: new Date() }).where(eq(tickets.id, filho.id));
    expect((await volta(depois))!.fechados).toContain(pai.codigo);
  });

  it('o painel sem "fechar sozinho" (o Desenvolvimento) não fecha', async () => {
    const r = await criarChamado(app, n8n, ChamadoCriarSchema.parse({ painelId: DEV, titulo: 'Entregue' }), { origem: 'api' });
    await app.db.update(tickets).set({ stageId: 'etapa-desenvolvimento-entregue', resolvedAt: instanteLocal('2026-10-14', '10:00') }).where(eq(tickets.id, r.id));
    expect((await volta(new Date(Date.parse('2027-01-30T12:00:00Z'))))!.fechados).not.toContain(r.codigo);
  });
});

// =====================================================================

describe('a IA no chamado', () => {
  let chamadas: Array<{ url: string; corpo: any }> = [];
  /** o que a IA falsa responde (o JSON vai como texto, como os provedores devolvem) */
  let resposta: unknown = null;
  beforeAll(() => {
    trocarFerramentasIa({
      fetchFn: (async (url: string, init: RequestInit) => {
        chamadas.push({ url: String(url), corpo: init.body ? JSON.parse(String(init.body)) : null });
        const texto = typeof resposta === 'string' ? resposta : JSON.stringify(resposta);
        return new Response(JSON.stringify({ content: [{ type: 'text', text: texto }], stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 150 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch,
    });
  });
  beforeEach(() => { chamadas = []; esquecerLimitesIa(); });
  const pedir = (sess: Session, id: string) => sess.post(`/atendimento/chamados/${id}/ia`, {});

  it('sem a IA ligada: 400 com a mensagem (e nada sai para o provedor)', async () => {
    const { id } = await abrir(operador);
    let r = await pedir(operador, id);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('A IA ainda não tem a chave. Quem administra escolhe o provedor e cola a chave em Administração › Ajustes › IA da base.');
    const salvar = await s.put('/base/ia/ajustes', { ativo: false, provedor: 'anthropic', modelo: 'claude-de-teste', modeloNome: 'Claude de Teste', chave: `chave-falsa-${Math.random()}`, precoEntrada: null, precoSaida: null });
    expect(salvar.statusCode, salvar.body).toBe(200);
    r = await pedir(operador, id);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('A IA da base está desligada. Quem administra liga em Administração › Ajustes › IA da base.');
    expect(chamadas).toHaveLength(0);
  });

  it('lê o chamado (com as anotações) e as opções do painel; só entra o que existe nelas; nada é gravado', async () => {
    expect((await s.put('/base/ia/ajustes', { ativo: true, provedor: 'anthropic', modelo: 'claude-de-teste', modeloNome: 'Claude de Teste', precoEntrada: null, precoSaida: null })).statusCode).toBe(200);
    const { id, codigo } = await abrir(operador, { titulo: 'Ramal mudo', relato: 'O ramal 203 não toca desde ontem' });
    await operador.post(`/atendimento/chamados/${id}/anotacoes`, { texto: 'Testei o cabo: está bom' });
    resposta = {
      titulo: 'Ramal 203 sem áudio', relato: 'O cliente diz que o ramal 203 não toca.', descricao: '- cabo testado', assunto: 'Ramal › Sem áudio',
      tipo: 'incidente', gravidade: 'inoperancia', alcance: 'pessoa', produtos: ['LinePBX', 'Produto Inventado'],
      etiquetas: ['ramal', 'audio', 'cabo', 'quarta'], resumo: 'O cabo foi testado; falta conferir o registro.',
    };
    const r = await pedir(operador, id);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      titulo: 'Ramal 203 sem áudio', relato: 'O cliente diz que o ramal 203 não toca.', descricao: '- cabo testado', assuntoId: semAudio, tipo: 'Incidente',
      // o Suporte não usa o alcance ("por enquanto"): o que a IA mandar para ele fica de fora
      gravidade: 'inoperancia', alcance: null, produtos: [linepbx], etiquetas: ['ramal', 'audio', 'cabo'], resumo: 'O cabo foi testado; falta conferir o registro.',
      fonte: 'chamado', modelo: 'Claude de Teste', provedor: 'Anthropic (Claude)', custo: null,
    });

    // o que foi para a IA: as instruções do chamado, o chamado (com a anotação) e as opções do painel
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(chamadas[0]!.corpo.system).toBe(INSTRUCOES_IA_CHAMADO);
    const msg: string = chamadas[0]!.corpo.messages[0].content;
    expect(msg).toContain(`Chamado ${codigo}: Ramal mudo`);
    expect(msg).toContain('Relato do cliente:\nO ramal 203 não toca desde ontem');
    expect(msg).toContain('- Marina Costa: Testei o cabo: está bom');
    expect(msg).toContain('- Ramal\n- Ramal › Sem áudio');
    expect(msg).toContain('Opções de tipo: Incidente, Requisição, Dúvida, Mudança');
    expect(msg).toContain('Este painel não usa: alcance (devolva "" nesse campo).');
    expect(msg).toContain('LinePBX');
    expect(msg).not.toContain('Correção de tela'); // o assunto do Desenvolvimento

    // nada mudou no chamado; o uso entra na conta do mês; a auditoria registra
    expect(await ficha(codigo)).toMatchObject({ titulo: 'Ramal mudo', assunto: null, tipo: null });
    expect((await s.get('/base/ia/ajustes')).json().uso).toMatchObject({ rascunhos: 1, entrada: 1200, saida: 150 });
    expect(await auditoria('action=chamado_ia')).toContain(`Marina Costa pediu à IA (Anthropic (Claude)) uma sugestão para ${codigo}, lendo o próprio chamado`);
  });

  it('o que a IA inventar fica de fora', async () => {
    const { id } = await abrir(operador);
    resposta = { titulo: '', assunto: 'Impressora › Sem papel', tipo: 'Catástrofe', gravidade: 'catastrofica', alcance: 'galaxia', produtos: ['Nada disso'], etiquetas: 'não é lista' };
    const r = await pedir(operador, id);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ titulo: null, assuntoId: null, tipo: null, gravidade: null, alcance: null, produtos: [], etiquetas: [] });
  });

  it('com a sessão e o LineChat ligado, lê a conversa; com o LineChat fora do ar, o próprio chamado', async () => {
    const secretId = await app.vault.save(app.db, { label: 'Chave do LineChat (teste)', plain: `chave-falsa-${Math.random()}` });
    await integ.gravar(app.db, 'linechat', { ...integ.LINECHAT_PADRAO, ativo: true, url: 'https://api.linechat.exemplo' }, { secretId });
    const pedidos: string[] = [];
    let foraDoAr = false;
    trocarFerramentasWhatsApp({
      fetchFn: (async (url: string) => {
        pedidos.push(String(url));
        if (foraDoAr) throw new Error('fora do ar');
        return new Response(JSON.stringify({ items: [{ text: 'Meu ramal 203 parou', direction: 'TO_HUB' }, { text: 'Vamos olhar agora', direction: 'FROM_HUB' }], hasMorePages: false }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    try {
      const { id } = await abrir(operador, { sessaoId: 'sessao-123' });
      resposta = { titulo: 'Ramal 203 parado' };
      let r = await pedir(operador, id);
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json()).toMatchObject({ fonte: 'conversa', titulo: 'Ramal 203 parado' });
      expect(pedidos[0]).toContain('https://api.linechat.exemplo/chat/v1/message?SessionId=sessao-123');
      expect(chamadas[0]!.corpo.messages[0].content).toContain('Cliente: Meu ramal 203 parou\nEquipe: Vamos olhar agora');

      foraDoAr = true;
      r = await pedir(operador, id);
      expect(r.json().fonte).toBe('chamado');
      expect(chamadas[1]!.corpo.messages[0].content).toContain('O que já está no chamado:');
    } finally {
      trocarFerramentasWhatsApp({ fetchFn: (async () => { throw new Error('rede desligada nos testes'); }) as unknown as typeof fetch });
      await integ.gravar(app.db, 'linechat', { ...integ.LINECHAT_PADRAO, ativo: false });
    }
  });

  it('o Leitor não usa (403); chamado que não existe: 404', async () => {
    const { id } = await abrir(operador);
    expect((await pedir(leitor, id)).statusCode).toBe(403);
    expect((await pedir(operador, 'SUP-9999')).statusCode).toBe(404);
    expect(chamadas).toHaveLength(0);
  });
});
