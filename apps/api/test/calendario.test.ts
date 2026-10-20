/**
 * Patch 2.0.1 — o CALENDÁRIO (decisão 0049): as visitas, as viradas, as folgas e os home offices de cada
 * equipe, nos painéis dos chamados. O pedido do Luan: "se eu só sou participante do painel do suporte eu só
 * vou ver a do suporte, se eu sou do painel do adm e do suporte e do dev eu vou ver atividades de datas de
 * todos, se eu sou do comercial, e assim por diante".
 *
 *  - quem vê o evento é quem vê um dos painéis dele (o "Quem vê" do painel); quem cuida dos chamados vê tudo
 *  - o evento que a pessoa não vê não existe para ela (404); quem edita não tira o evento de um painel que
 *    não vê; as pessoas do evento são as que veem um dos painéis
 *  - criar e mudar é de quem trabalha nos chamados; os tipos, de quem cuida (o tipo com evento desativa)
 *  - feito e cancelado; a lixeira (e o restaurar da Administração); a auditoria; os eventos do chamado
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { clients, newId, ticketPanels } from '@gestor/db';
import { TIPOS_DE_EVENTO_PADRAO } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;        // a administração (cuida dos chamados: vê todos os painéis)
let marina: Session;   // Suporte, Desenvolvimento e Administrativo
let carlos: Session;   // Suporte e Comercial
let lia: Session;      // Leitor: vê o Suporte, não cria
const ids = { marina: '', carlos: '', lia: '' };
let aurora = '';

const SUP = 'painel-suporte';
const DEV = 'painel-desenvolvimento';
let ADM = '';
let COM = '';

const evento = (x: Record<string, unknown> = {}) => ({
  titulo: 'Virada para nuvem — Clínica Aurora', tipoId: 'virada-nuvem', paineis: [SUP], pessoas: [], inicio: '2026-10-24', fim: '2026-10-25', ...x,
});
const titulos = async (quem: Session) => {
  const r = await quem.get('/calendario/eventos?de=2026-09-28&ate=2026-11-08');
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as Array<{ titulo: string }>).map((e) => e.titulo).sort();
};
const auditoriaDe = async (id: string) => ((await s.get(`/admin/audit?entityId=${id}&pageSize=50`)).json().items as Array<{ summary: string }>).map((a) => a.summary);

async function pessoa(nome: string, email: string, papel: string) {
  const papeis = (await s.get('/admin/roles')).json();
  const r = await s.post('/admin/users', { name: nome, email, password: 'SenhaDeTeste!123', roleId: papeis.find((x: any) => x.key === papel).id });
  expect(r.statusCode, r.body).toBe(201);
  const sessao = new Session(app);
  await sessao.login(email, 'SenhaDeTeste!123');
  return { id: r.json().id as string, sessao };
}
async function painel(nome: string, sigla: string, posicao: number, pessoas: string[]) {
  const id = newId();
  await app.db.insert(ticketPanels).values({ id, name: nome, key: sigla, sortOrder: posicao, access: 'escolhidos', memberIds: pessoas });
  return id;
}

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const m = await pessoa('Marina Costa', 'marina@gestor.local', 'operador');
  const c = await pessoa('Carlos Lima', 'carlos@gestor.local', 'operador');
  const l = await pessoa('Lia Rocha', 'lia@gestor.local', 'leitor');
  marina = m.sessao; carlos = c.sessao; lia = l.sessao;
  Object.assign(ids, { marina: m.id, carlos: c.id, lia: l.id });
  // cada equipe com as pessoas dela ("Só as pessoas escolhidas")
  await app.db.update(ticketPanels).set({ access: 'escolhidos', memberIds: [m.id, c.id, l.id] }).where(eq(ticketPanels.id, SUP));
  await app.db.update(ticketPanels).set({ access: 'escolhidos', memberIds: [m.id] }).where(eq(ticketPanels.id, DEV));
  ADM = await painel('Administrativo', 'ADM', 2, [m.id]);
  COM = await painel('Comercial', 'COM', 3, [c.id]);
  aurora = newId();
  await app.db.insert(clients).values({ id: aurora, tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora Serviços Médicos LTDA', cnpj: '11222333000181' });
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

describe('quem vê: a regra dos painéis', () => {
  it('as opções: os painéis que cada um vê, quem vê cada painel, os tipos e o que pode fazer', async () => {
    const om = (await marina.get('/calendario/opcoes')).json();
    expect(om.paineis.map((p: any) => p.nome)).toEqual(['Suporte', 'Desenvolvimento', 'Administrativo']);
    // quem vê o Administrativo: a Marina (escolhida) e a administração (cuida dos chamados)
    expect(om.paineis.find((p: any) => p.id === ADM).pessoas.sort()).toEqual([ids.marina, (await s.get('/auth/me')).json().id].sort());
    expect(om.tipos.map((t: any) => t.nome)).toEqual(TIPOS_DE_EVENTO_PADRAO.map((t) => t.nome));
    expect([om.podeEditar, om.podeCuidar]).toEqual([true, false]);
    expect(om.hoje).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const oc = (await carlos.get('/calendario/opcoes')).json();
    expect(oc.paineis.map((p: any) => p.nome)).toEqual(['Suporte', 'Comercial']);
    const ol = (await lia.get('/calendario/opcoes')).json();
    expect([ol.paineis.map((p: any) => p.nome), ol.podeEditar]).toEqual([['Suporte'], false]);
    expect((await s.get('/calendario/opcoes')).json().paineis.length).toBe(4);
  });

  it('cada um vê os eventos dos painéis que vê; a administração vê todos', async () => {
    const virada = await marina.post('/calendario/eventos', evento({ pessoas: [ids.carlos], clienteId: aurora, local: 'Rua das Flores, 100' }));
    expect(virada.statusCode, virada.body).toBe(201);
    expect(virada.json()).toMatchObject({ paineis: [SUP], pessoas: [ids.carlos], clienteNome: 'Clínica Aurora', criadoPor: 'Marina Costa', situacao: 'agendado', diaInteiro: true });
    expect((await marina.post('/calendario/eventos', evento({ titulo: 'Folga — Marina', tipoId: 'folga', paineis: [ADM], pessoas: [ids.marina], inicio: '2026-10-20', fim: '2026-10-20' }))).statusCode).toBe(201);
    expect((await carlos.post('/calendario/eventos', evento({ titulo: 'Visita comercial — Clínica Aurora', tipoId: 'visita', paineis: [COM], clienteId: aurora, inicio: '2026-10-22', fim: '2026-10-22', diaInteiro: false, horaInicio: '14:00', horaFim: '15:30' }))).statusCode).toBe(201);

    expect(await titulos(marina)).toEqual(['Folga — Marina', 'Virada para nuvem — Clínica Aurora']);
    expect(await titulos(carlos)).toEqual(['Virada para nuvem — Clínica Aurora', 'Visita comercial — Clínica Aurora']);
    expect(await titulos(lia)).toEqual(['Virada para nuvem — Clínica Aurora']);
    expect(await titulos(s)).toEqual(['Folga — Marina', 'Virada para nuvem — Clínica Aurora', 'Visita comercial — Clínica Aurora']);
    // fora do período não vem
    expect((await s.get('/calendario/eventos?de=2026-11-01&ate=2026-11-30')).json()).toEqual([]);
    // o auditoria diz o quê, de que equipe e quando
    expect(await auditoriaDe(virada.json().id)).toEqual(['Pôs no calendário: "Virada para nuvem — Clínica Aurora" (Virada para nuvem, 24 a 25/10, Suporte, Clínica Aurora)']);
  });

  it('o evento que a pessoa não vê não existe para ela (404); o painel que não é dela é recusado', async () => {
    const folga = (await s.get('/calendario/eventos?de=2026-10-20&ate=2026-10-20')).json().find((e: any) => e.titulo === 'Folga — Marina');
    expect((await carlos.put(`/calendario/eventos/${folga.id}`, evento({ titulo: 'x', paineis: [SUP] }))).statusCode).toBe(404);
    expect((await carlos.del(`/calendario/eventos/${folga.id}`)).statusCode).toBe(404);
    expect((await carlos.post(`/calendario/eventos/${folga.id}/situacao`, { situacao: 'feito' })).statusCode).toBe(404);
    const r = await marina.post('/calendario/eventos', evento({ paineis: [COM] }));
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('O painel Comercial não é seu: escolha um dos painéis que você vê.');
  });

  it('as pessoas do evento: quem vê um dos painéis dele', async () => {
    const r = await marina.post('/calendario/eventos', evento({ titulo: 'Reunião do ADM', tipoId: 'reuniao', paineis: [ADM], pessoas: [ids.carlos] }));
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('Carlos Lima não vê nenhum dos painéis do evento: inclua o painel dela ou tire a pessoa.');
    expect((await marina.post('/calendario/eventos', evento({ titulo: 'Reunião do ADM', tipoId: 'reuniao', paineis: [ADM, SUP], pessoas: [ids.carlos] }))).statusCode).toBe(201);
  });

  it('quem edita não tira o evento de um painel que não vê, nem põe num', async () => {
    const virada = (await s.get('/calendario/eventos?de=2026-10-24&ate=2026-10-24')).json().find((e: any) => e.titulo.startsWith('Virada'));
    // a administração põe a virada também no Comercial
    expect((await s.put(`/calendario/eventos/${virada.id}`, evento({ ...virada, paineis: [SUP, COM] }))).json().paineis).toEqual([SUP, COM]);
    // a Marina (não vê o Comercial) troca o Suporte pelo Desenvolvimento: o Comercial fica
    const r = await marina.put(`/calendario/eventos/${virada.id}`, evento({ ...virada, paineis: [DEV, COM], local: 'Remoto' }));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ paineis: [DEV, COM], local: 'Remoto', alteradoPor: 'Marina Costa' });
    // o Carlos ainda vê (pelo Comercial), mesmo sem estar mais no Suporte do evento; continua nele porque já estava
    expect(await titulos(carlos)).toContain('Virada para nuvem — Clínica Aurora');
    expect((await auditoriaDe(virada.id))[0]).toBe('Mudou no calendário "Virada para nuvem — Clínica Aurora": Painéis, Local');
  });
});

describe('o trabalho no calendário', () => {
  it('feito, cancelado e de volta a agendado; o Leitor não muda nada', async () => {
    const virada = (await s.get('/calendario/eventos?de=2026-10-24&ate=2026-10-24')).json().find((e: any) => e.titulo.startsWith('Virada'));
    expect((await marina.post(`/calendario/eventos/${virada.id}/situacao`, { situacao: 'feito' })).json().situacao).toBe('feito');
    expect((await marina.post(`/calendario/eventos/${virada.id}/situacao`, { situacao: 'agendado' })).json().situacao).toBe('agendado');
    expect((await auditoriaDe(virada.id))[1]).toBe('Marcou como feito no calendário: "Virada para nuvem — Clínica Aurora" (24 a 25/10)');
    expect((await lia.post('/calendario/eventos', evento())).statusCode).toBe(403);
    expect((await lia.post(`/calendario/eventos/${virada.id}/situacao`, { situacao: 'cancelado' })).statusCode).toBe(403);
  });

  it('a janela recusa o que não serve, com a frase certa', async () => {
    const r = await marina.post('/calendario/eventos', evento({ fim: '2026-10-23' }));
    expect(r.statusCode).toBe(400);
    expect(JSON.stringify(r.json())).toContain('O último dia vem depois do primeiro.');
    expect(JSON.stringify((await marina.post('/calendario/eventos', evento({ diaInteiro: false }))).json())).toContain('Diga a hora de começar');
    expect((await marina.post('/calendario/eventos', evento({ clienteId: 'nao-existe' }))).json().error).toBe('Cliente não encontrado.');
    expect((await marina.post('/calendario/eventos', evento({ tipoId: 'nao-existe' }))).json().error).toBe('Esse tipo não existe mais: escolha outro.');
  });

  it('a lixeira: sai do calendário e volta pela Administração', async () => {
    const reuniao = (await s.get('/calendario/eventos?de=2026-10-24&ate=2026-10-24')).json().find((e: any) => e.titulo === 'Reunião do ADM');
    expect((await carlos.del(`/calendario/eventos/${reuniao.id}`)).statusCode).toBe(200);
    expect(await titulos(marina)).not.toContain('Reunião do ADM');
    const lixo = (await s.get('/admin/trash')).json().find((x: any) => x.id === reuniao.id);
    expect(lixo).toMatchObject({ type: 'calendarEvent', label: '24 a 25/10 · Reunião do ADM' });
    expect((await s.post(`/admin/trash/calendarEvent/${reuniao.id}/restore`)).statusCode).toBe(200);
    expect(await titulos(marina)).toContain('Reunião do ADM');
    expect(await auditoriaDe(reuniao.id)).toEqual([
      'Restaurou o evento do calendário "Reunião do ADM" (24 a 25/10) da lixeira',
      'Mandou para a lixeira do calendário: "Reunião do ADM" (Reunião, 24 a 25/10)',
      'Pôs no calendário: "Reunião do ADM" (Reunião, 24 a 25/10, Administrativo, Suporte)',
    ]);
    // na auditoria, o restaurar fica com o mesmo nome das outras ações do evento (o filtro por tipo acha tudo)
    expect((await s.get('/admin/audit?entityType=calendar_event&action=restore')).json().items.map((a: any) => a.entityId)).toEqual([reuniao.id]);
  });

  it('os eventos do chamado (a ficha): só de quem vê o chamado', async () => {
    const c = await marina.post('/atendimento/chamados', { painelId: SUP, titulo: 'Migrar a Clínica Aurora para a nuvem', clienteId: aurora });
    expect(c.statusCode, c.body).toBe(201);
    const chamadoId = c.json().id as string;
    const r = await marina.post('/calendario/eventos', evento({ titulo: 'Virada — SUP', chamadoId, inicio: '2026-10-28', fim: '2026-10-28' }));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().chamadoCodigo).toMatch(/^SUP-\d+$/);
    expect((await carlos.get(`/calendario/do-chamado/${chamadoId}`)).json().map((e: any) => e.titulo)).toEqual(['Virada — SUP']);
    // o chamado de um painel que a pessoa não vê não existe
    const d = await marina.post('/atendimento/chamados', { painelId: DEV, titulo: 'Ajuste no relatório' });
    expect((await carlos.get(`/calendario/do-chamado/${d.json().id}`)).statusCode).toBe(404);
    expect((await carlos.post('/calendario/eventos', evento({ chamadoId: d.json().id }))).json().error).toBe('Chamado não encontrado.');
  });
});

describe('os tipos (quem cuida dos chamados)', () => {
  it('quem cuida muda; o tipo com evento não sai — desativa; o desativado não entra em evento novo', async () => {
    const tipos = TIPOS_DE_EVENTO_PADRAO.map((t) => ({ ...t }));
    expect((await marina.put('/calendario/tipos', { tipos })).statusCode).toBe(403);
    const semVirada = await s.put('/calendario/tipos', { tipos: tipos.filter((t) => t.id !== 'virada-nuvem') });
    expect(semVirada.statusCode).toBe(400);
    expect(semVirada.json().error).toBe('Virada para nuvem já tem eventos: desative em vez de tirar.');
    const novos = [...tipos.map((t) => (t.id === 'virada-nuvem' ? { ...t, ativo: false } : t)), { id: 'treinamento', nome: 'Treinamento', cor: 'roxo', daEquipe: false, ativo: true }];
    const r = await s.put('/calendario/tipos', { tipos: novos });
    expect(r.statusCode, r.body).toBe(200);
    expect((await marina.get('/calendario/opcoes')).json().tipos.map((t: any) => `${t.nome}${t.ativo ? '' : ' (desativado)'}`)).toContain('Virada para nuvem (desativado)');
    expect((await marina.post('/calendario/eventos', evento())).json().error).toBe('O tipo Virada para nuvem foi desativado: escolha outro.');
    // o evento que já era do tipo continua editável
    const virada = (await s.get('/calendario/eventos?de=2026-10-24&ate=2026-10-24')).json().find((e: any) => e.titulo.startsWith('Virada para'));
    expect((await s.put(`/calendario/eventos/${virada.id}`, evento({ ...virada, observacao: 'Levar o roteador novo' }))).statusCode).toBe(200);
    expect((await s.get('/admin/audit?entityType=settings&pageSize=1')).json().items[0]).toMatchObject({ summary: 'Mudou os tipos do calendário: desativou Virada para nuvem, incluiu Treinamento' });
  });
});
