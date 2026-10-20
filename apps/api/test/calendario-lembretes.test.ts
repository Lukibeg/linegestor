/**
 * Patch 2.0.2 — os LEMBRETES DO CALENDÁRIO (decisão 0049, revista). O pedido do Luan (20/10): "o nosso
 * sistema de calendário tem que ter lembretes e avisos configuráveis, para eu alertar quando for acontecer
 * algo e em quanto tempo antes".
 *
 *  - cada evento diz quanto tempo antes lembrar (até 5 lembretes, até 4 semanas antes) e quem recebe: as
 *    pessoas do evento (sem pessoas, quem pôs) ou todos que veem o evento — sempre entre quem vê o painel
 *  - o relógio dos chamados manda na hora, uma vez, pelo sininho e pelo WhatsApp de cada pessoa (o aviso
 *    "Lembrete de um evento do calendário" dos Ajustes decide os canais)
 *  - o que já tinha passado quando o evento foi gravado não sai; mudar o dia vale de novo; o cancelado, o
 *    feito e o da lixeira não lembram
 *  - cada tipo traz os lembretes dele (o evento novo já vem com eles, na tela)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { calendarEvents, clients, newId, ticketPanels } from '@gestor/db';
import { AVISOS_CHAMADOS_PADRAO, EVENTOS_AVISO_PADRAO, hojeNoCalendario, somarDias, TIPOS_DE_EVENTO_PADRAO } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';
import { voltaDoRelogioDosChamados } from '../src/services/atendimento/relogio.js';
import { linkDoEvento } from '../src/services/calendario.js';
import { trocarFerramentasWhatsApp } from '../src/services/atendimento/whatsapp.js';

let app: App;
let s: Session;        // a administração (cuida dos chamados: vê todos os painéis)
let marina: Session;   // Suporte e Comercial; tem WhatsApp
let carlos: Session;   // Suporte
let lia: Session;      // só o Comercial
const ids = { admin: '', marina: '', carlos: '', lia: '' };
let aurora = '';
let COM = '';
const SUP = 'painel-suporte';
const enviados: Array<{ para: string; texto: string }> = [];
const recusar = (async () => { throw new Error('sem rede no teste'); }) as unknown as typeof fetch;

const evento = (x: Record<string, unknown> = {}) => ({
  titulo: 'Visita — Clínica Aurora', tipoId: 'visita', paineis: [SUP], pessoas: [ids.marina], clienteId: aurora,
  inicio: '2030-03-15', fim: '2030-03-15', diaInteiro: false, horaInicio: '09:00', horaFim: '10:00', local: 'Av. Tancredo Neves, 1632',
  lembretes: [1440, 60], lembrarQuem: 'pessoas', ...x,
});
async function criar(x: Record<string, unknown> = {}, quem: Session = s) {
  const r = await quem.post('/calendario/eventos', evento(x));
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string; lembretes: number[]; lembrarQuem: string };
}
/** Uma volta do relógio na hora dada (e o WhatsApp, que sai em segundo plano). */
async function volta(iso: string) {
  const v = await voltaDoRelogioDosChamados(app, new Date(iso));
  await esperarSegundoPlano();
  return v!;
}
/** Os lembretes no sininho de cada um. */
async function lembretes(quem: Session) {
  const r = await quem.get('/atendimento/avisos');
  expect(r.statusCode, r.body).toBe(200);
  return (r.json().itens as Array<{ tipo: string; texto: string; chamado: unknown; evento: { id: string; titulo: string; inicio: string } | null }>)
    .filter((a) => a.tipo === 'lembrete');
}
const auditoriaDe = async (id: string) => ((await s.get(`/admin/audit?entityId=${id}&pageSize=50`)).json().items as Array<{ summary: string }>).map((a) => a.summary);

async function pessoa(nome: string, email: string, papel: string) {
  const papeis = (await s.get('/admin/roles')).json();
  const r = await s.post('/admin/users', { name: nome, email, password: 'SenhaDeTeste!123', roleId: papeis.find((x: any) => x.key === papel).id });
  expect(r.statusCode, r.body).toBe(201);
  const sessao = new Session(app);
  await sessao.login(email, 'SenhaDeTeste!123');
  return { id: r.json().id as string, sessao };
}

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  ids.admin = (await s.get('/auth/me')).json().id;
  const m = await pessoa('Marina Costa', 'marina@gestor.local', 'operador');
  const c = await pessoa('Carlos Lima', 'carlos@gestor.local', 'operador');
  const l = await pessoa('Lia Rocha', 'lia@gestor.local', 'operador');
  marina = m.sessao; carlos = c.sessao; lia = l.sessao;
  Object.assign(ids, { marina: m.id, carlos: c.id, lia: l.id });
  await app.db.update(ticketPanels).set({ access: 'escolhidos', memberIds: [m.id, c.id] }).where(eq(ticketPanels.id, SUP));
  COM = newId();
  await app.db.insert(ticketPanels).values({ id: COM, name: 'Comercial', key: 'COM', sortOrder: 3, access: 'escolhidos', memberIds: [m.id, l.id] });
  aurora = newId();
  await app.db.insert(clients).values({ id: aurora, tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora Serviços Médicos LTDA', cnpj: '11222333000181' });

  // o WhatsApp da equipe ligado, e o da Marina em Administração › Usuários
  trocarFerramentasWhatsApp({
    fetchFn: (async (_url: string, init: RequestInit) => {
      const corpo = JSON.parse(String(init.body));
      enviados.push({ para: corpo.to, texto: corpo.body?.text ?? '' });
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch,
  });
  const r = await s.put('/atendimento/ajustes/avisos', {
    ativo: true, url: 'https://api.exemplo.com.br/chat/v1/message/send', usarChaveDoLineChat: false, chave: `chave-falsa-${Math.random()}`,
    numeroCliente: '(71) 3034-8350', numeroEquipe: '71 99999-0000', envioCliente: 'texto', modeloCliente: AVISOS_CHAMADOS_PADRAO.modeloCliente, template: null,
    eventos: EVENTOS_AVISO_PADRAO,
  });
  expect(r.statusCode, r.body).toBe(200);
  expect((await s.patch(`/admin/users/${m.id}`, { whatsapp: '(71) 98888-7777' })).statusCode).toBe(200);
});
afterAll(async () => {
  await esperarSegundoPlano();
  trocarFerramentasWhatsApp({ fetchFn: recusar });
  await app.close();
});

describe('os lembretes do calendário', () => {
  it('o evento guarda os lembretes e quem recebe; os tipos trazem os deles', async () => {
    const e = await criar();
    expect(e).toMatchObject({ lembretes: [1440, 60], lembrarQuem: 'pessoas' });
    const op = (await s.get('/calendario/opcoes')).json();
    expect(op.tipos.find((t: { id: string }) => t.id === 'visita').lembretes).toEqual([1440, 60]);
    expect(op.tipos.find((t: { id: string }) => t.id === 'folga').lembretes).toEqual([]);
    // a janela recusa o que não serve
    const ruim = await s.post('/calendario/eventos', evento({ lembretes: [1, 2, 3, 4, 5, 6] }));
    expect(ruim.statusCode).toBe(400);
    expect(JSON.stringify(ruim.json())).toContain('Até 5 lembretes.');
    await app.db.delete(calendarEvents).where(eq(calendarEvents.id, e.id));
  });

  it('o relógio manda na hora, uma vez: o sininho e o WhatsApp de quem é do evento', async () => {
    const e = await criar();
    enviados.length = 0;
    // 1 dia antes: 14/03/2030 às 09:00 de Brasília (12:00 em UTC); um minuto antes, nada
    expect((await volta('2030-03-14T11:59:00Z')).lembretes).toBe(0);
    expect((await volta('2030-03-14T12:00:00Z')).lembretes).toBe(1);
    const [l] = await lembretes(marina);
    expect(l).toMatchObject({
      texto: 'Lembrete: Visita — Clínica Aurora, amanhã, 15/03, às 09:00', chamado: null,
      evento: { id: e.id, titulo: 'Visita — Clínica Aurora', inicio: '2030-03-15' },
    });
    // o WhatsApp pela mensagem do lembrete (a padrão, 2.0.2): uma informação por linha; sem chamado nem
    // observação, as linhas deles não vão
    expect(enviados).toEqual([{ para: '5571988887777', texto: expect.any(String) }]);
    expect(enviados[0]!.texto.split('\n')).toEqual([
      '⏰ *Lembrete:* Visita — Clínica Aurora',
      expect.stringMatching(/ \*Quando:\* amanhã, 15\/03, às 09:00$/),
      '📍 *Local:* Av. Tancredo Neves, 1632',
      expect.stringMatching(/ \*Cliente:\* Clínica Aurora$/),
      `🔗 *Link:* ${linkDoEvento(app, { id: e.id, inicio: '2030-03-15' })}`,
    ]);
    // quem não é do evento não recebe
    expect(await lembretes(carlos)).toEqual([]);
    expect(await lembretes(s)).toEqual([]);
    // uma vez só
    expect((await volta('2030-03-14T12:01:00Z')).lembretes).toBe(0);
    expect(await lembretes(marina)).toHaveLength(1);
    // 1 hora antes: 15/03 às 08:00
    expect((await volta('2030-03-15T11:00:00Z')).lembretes).toBe(1);
    expect((await lembretes(marina)).map((x) => x.texto)).toContain('Lembrete: Visita — Clínica Aurora, hoje, 15/03, às 09:00');
    await app.db.delete(calendarEvents).where(eq(calendarEvents.id, e.id));
  });

  it('quem recebe: sem pessoas, quem pôs o evento; "todos que veem", quem vê um dos painéis', async () => {
    const semPessoas = await criar({ titulo: 'Ação no cliente — sem ninguém', inicio: '2030-04-02', fim: '2030-04-02', pessoas: [], lembretes: [60] });
    const todos = await criar({ titulo: 'Virada para nuvem — todos', tipoId: 'virada-nuvem', inicio: '2030-04-02', fim: '2030-04-02', paineis: [COM], pessoas: [], lembrarQuem: 'paineis', lembretes: [60] });
    // 02/04 às 08:00 (1 hora antes das 09:00)
    expect((await volta('2030-04-02T11:00:00Z')).lembretes).toBe(2);
    // a administração: o sem pessoas (foi ela que pôs) e o do Comercial (quem cuida dos chamados vê todos os painéis)
    expect((await lembretes(s)).map((x) => x.evento?.id).sort()).toEqual([semPessoas.id, todos.id].sort());
    // o Comercial: a Marina e a Lia veem; o Carlos, não
    expect((await lembretes(lia)).map((x) => x.evento?.id)).toEqual([todos.id]);
    expect((await lembretes(marina)).some((x) => x.evento?.id === todos.id)).toBe(true);
    expect((await lembretes(carlos)).some((x) => x.evento?.id === todos.id)).toBe(false);
    expect((await lembretes(s)).some((x) => x.evento?.id === semPessoas.id)).toBe(true);
    expect((await lembretes(marina)).some((x) => x.evento?.id === semPessoas.id)).toBe(false);
  });

  it('o que já tinha passado ao gravar não sai; mudar o dia vale de novo; a auditoria diz "Lembretes"', async () => {
    // amanhã, com o lembrete de 4 semanas: quando o evento foi gravado, o momento já tinha passado
    const amanha = somarDias(hojeNoCalendario(), 1);
    const e = await criar({ titulo: 'Reunião — amanhã', tipoId: 'reuniao', inicio: amanha, fim: amanha, pessoas: [ids.carlos], lembretes: [40320] });
    const momento = new Date(new Date(`${amanha}T09:00:00-03:00`).getTime() - 40320 * 60_000 + 60_000).toISOString();
    expect((await volta(momento)).lembretes).toBe(0);
    expect(await lembretes(carlos)).toEqual([]);

    // para outro dia (e só os lembretes mudaram, depois): vale de novo
    const r = await s.put(`/calendario/eventos/${e.id}`, evento({ titulo: 'Reunião — amanhã', tipoId: 'reuniao', inicio: '2030-05-10', fim: '2030-05-10', pessoas: [ids.carlos], lembretes: [40320] }));
    expect(r.statusCode, r.body).toBe(200);
    const so = await s.put(`/calendario/eventos/${e.id}`, evento({ titulo: 'Reunião — amanhã', tipoId: 'reuniao', inicio: '2030-05-10', fim: '2030-05-10', pessoas: [ids.carlos], lembretes: [1440] }));
    expect(so.statusCode, so.body).toBe(200);
    expect(await auditoriaDe(e.id)).toContain('Mudou no calendário "Reunião — amanhã": Lembretes');
    expect((await volta('2030-05-09T12:00:00Z')).lembretes).toBe(1);
    expect((await lembretes(carlos)).map((x) => x.texto)).toEqual(['Lembrete: Reunião — amanhã, amanhã, 10/05, às 09:00']);
  });

  it('a mensagem do lembrete escrita nos Ajustes (2.0.2): as variáveis do evento; a linha vazia não vai', async () => {
    const avisos = (await s.get('/atendimento/ajustes/avisos')).json();
    const minha = '{aviso}\n{tipo} · {pessoas} · {paineis}\n📝 {observacao}\n📌 {chamado}';
    expect((await s.put('/atendimento/ajustes/avisos', { ...avisos, modelos: { lembrete: minha } })).statusCode).toBe(200);
    const e = await criar({ titulo: 'Visita com observação', inicio: '2030-05-06', fim: '2030-05-06', observacao: 'Levar o aparelho reserva.', lembretes: [60] });
    enviados.length = 0;
    expect((await volta('2030-05-06T11:00:00Z')).lembretes).toBe(1);
    // sem chamado ligado, a linha do 📌 não vai
    expect(enviados).toEqual([{ para: '5571988887777', texto: 'Lembrete: Visita com observação, hoje, 06/05, às 09:00\nVisita · Marina Costa · Suporte\n📝 Levar o aparelho reserva.' }]);
    expect((await s.put('/atendimento/ajustes/avisos', { ...avisos, modelos: {} })).json().modelos).toEqual({});
    await app.db.delete(calendarEvents).where(eq(calendarEvents.id, e.id));
  });

  it('o aviso de que o evento entrou (2.0.2, opcional): na hora, para quem a pessoa escolheu, menos ela', async () => {
    const doAviso = async (quem: Session) => ((await quem.get('/atendimento/avisos')).json().itens as Array<{ tipo: string; texto: string; evento: { id: string } | null }>)
      .filter((a) => a.tipo === 'evento_novo');
    // sem pedir o aviso, ninguém recebe nada
    const calado = await criar({ titulo: 'Sem aviso', inicio: '2030-07-01', fim: '2030-07-01', lembretes: [] });
    expect(await doAviso(marina)).toEqual([]);

    // as pessoas do evento: a Marina recebe no sininho e no WhatsApp; quem pôs não recebe
    enviados.length = 0;
    const r = await s.post('/calendario/eventos', evento({ titulo: 'Visita avisada', inicio: '2030-07-02', fim: '2030-07-03', lembretes: [], avisar: 'pessoas', observacao: 'Levar o reserva.' }));
    expect(r.statusCode, r.body).toBe(201);
    const id = r.json().id as string;
    await esperarSegundoPlano();
    const [aviso] = await doAviso(marina);
    expect(aviso).toMatchObject({ texto: 'Administrador pôs no calendário: Visita avisada, terça, 02/07, às 09:00, até 03/07', evento: { id } });
    expect(await doAviso(s)).toEqual([]);
    expect(await doAviso(carlos)).toEqual([]);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.para).toBe('5571988887777');
    expect(enviados[0]!.texto.split('\n')).toEqual([
      expect.stringMatching(/ \*Novo no calendário:\* Visita avisada$/),
      expect.stringMatching(/ \*Quando:\* terça, 02\/07, às 09:00, até 03\/07$/),
      '📍 *Local:* Av. Tancredo Neves, 1632',
      expect.stringMatching(/ \*Cliente:\* Clínica Aurora$/),
      expect.stringMatching(/ \*Pessoas:\* Marina Costa$/),
      '📝 *Observação:* Levar o reserva.',
      '👤 *Quem pôs:* Administrador',
      `🔗 *Link:* ${linkDoEvento(app, { id, inicio: '2030-07-02' })}`,
    ]);
    expect(await auditoriaDe(id)).toContain('Pôs no calendário: "Visita avisada" (Visita, 02 a 03/07, Suporte, Clínica Aurora) e avisou 1 pessoa (as pessoas do evento)');

    // todos que veem o evento: quem vê o Suporte (a Marina e o Carlos); a Lia, só do Comercial, não
    const todos = await s.post('/calendario/eventos', evento({ titulo: 'Reunião da equipe', tipoId: 'reuniao', inicio: '2030-07-04', fim: '2030-07-04', pessoas: [], clienteId: null, lembretes: [], avisar: 'paineis' }));
    expect(todos.statusCode, todos.body).toBe(201);
    await esperarSegundoPlano();
    expect((await doAviso(carlos)).map((a) => a.evento?.id)).toEqual([todos.json().id]);
    expect((await doAviso(marina)).map((a) => a.evento?.id)).toContain(todos.json().id);
    expect(await doAviso(lia)).toEqual([]);

    // ninguém a avisar (as pessoas do evento, sem pessoas): diz na auditoria
    const sozinho = await s.post('/calendario/eventos', evento({ titulo: 'Só eu', inicio: '2030-07-05', fim: '2030-07-05', pessoas: [], lembretes: [], avisar: 'pessoas' }));
    expect(await auditoriaDe(sozinho.json().id)).toContain('Pôs no calendário: "Só eu" (Visita, 05/07, Suporte, Clínica Aurora) e pediu o aviso, mas não havia quem avisar (as pessoas do evento)');
    for (const x of [calado.id, id, todos.json().id, sozinho.json().id]) await app.db.delete(calendarEvents).where(eq(calendarEvents.id, x));
  });

  it('o cancelado e o da lixeira não lembram; o desligado nos Ajustes não vai pelo WhatsApp', async () => {
    const cancelado = await criar({ titulo: 'Cancelado', inicio: '2030-06-03', fim: '2030-06-03', pessoas: [ids.marina], lembretes: [60] });
    const lixeira = await criar({ titulo: 'Na lixeira', inicio: '2030-06-03', fim: '2030-06-03', pessoas: [ids.marina], lembretes: [60] });
    const desligado = await criar({ titulo: 'Só no sininho', inicio: '2030-06-03', fim: '2030-06-03', pessoas: [ids.marina], lembretes: [60] });
    expect((await s.post(`/calendario/eventos/${cancelado.id}/situacao`, { situacao: 'cancelado' })).statusCode).toBe(200);
    expect((await s.del(`/calendario/eventos/${lixeira.id}`)).statusCode).toBe(200);
    const avisos = (await s.get('/atendimento/ajustes/avisos')).json();
    const r = await s.put('/atendimento/ajustes/avisos', { ...avisos, eventos: { ...avisos.eventos, lembrete: { tela: true, whatsapp: false } } });
    expect(r.statusCode, r.body).toBe(200);
    enviados.length = 0;
    expect((await volta('2030-06-03T11:00:00Z')).lembretes).toBe(1);
    expect((await lembretes(marina)).filter((x) => x.evento?.inicio === '2030-06-03').map((x) => x.evento?.id)).toEqual([desligado.id]);
    expect(enviados).toEqual([]);
  });

  it('os lembretes do tipo: quem cuida muda, e a auditoria conta', async () => {
    const tipos = TIPOS_DE_EVENTO_PADRAO.map((t) => (t.id === 'visita' ? { ...t, lembretes: [2880] } : t));
    const r = await s.put('/calendario/tipos', { tipos });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().tipos.find((t: { id: string }) => t.id === 'visita').lembretes).toEqual([2880]);
    expect(await auditoriaDe('calendario')).toContain('Mudou os tipos do calendário: mudou os lembretes de Visita (2 dias antes)');
  });
});
