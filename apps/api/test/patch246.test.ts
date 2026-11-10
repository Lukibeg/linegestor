/**
 * Patch 2.4.6 — os dois pedidos do Luan em 10/11:
 *
 *  1. REPETIR no calendário ("quero q tenha um opção no agendamento se é recorrente diário semanal ou mensal para fixas nas
 *     agendas"): todo dia, todo dia útil, toda semana e todo mês, com data para acabar ou sem; cada data é um evento de verdade;
 *     mudar e excluir "só este" ou "este e os próximos"; a lixeira guarda as datas juntas numa linha; o relógio estende a série
 *     sem data.
 *  2. CANCELAR O LINK ("as vezes fazemos cancelamento de links quero que tenha uma opção de marcar como cancelado, onde ele é meio
 *     que excluído porém fica um registro que ele foi na verdade cancelado"): sai das listas, dos cartões, da Numeração e do
 *     painel; fica guardado com o dia, o motivo e quem; entra nas movimentações; reativar traz de volta.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { calendarSeries } from '@gestor/db';
import { datasDaRepeticao, diaDaSemana, somarDias, type EventoDoCalendario } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { estenderRepeticoes } from '../src/services/calendario.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;
const SUP = 'painel-suporte';
const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
/** a próxima terça a partir de amanhã */
const terca = (() => { let d = somarDias(hoje, 1); while (diaDaSemana(d) !== 1) d = somarDias(d, 1); return d; })();

const evento = (x: Record<string, unknown> = {}) => ({
  titulo: 'Reunião do suporte', tipoId: 'reuniao', paineis: [SUP], pessoas: [], inicio: terca, fim: terca, diaInteiro: false, horaInicio: '09:00', horaFim: '09:30', ...x,
});
const doPeriodo = async (de: string, ate: string) => {
  const r = await s.get(`/calendario/eventos?de=${de}&ate=${ate}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as EventoDoCalendario[];
};
/** os eventos da série, de 30 dias atrás a 2 anos à frente (a tela pede no máximo 400 dias de cada vez) */
const daSerie = async (serieId: string) => {
  const metade = somarDias(hoje, 370);
  const juntos = [...await doPeriodo(somarDias(hoje, -30), metade), ...await doPeriodo(somarDias(metade, 1), somarDias(hoje, 760))];
  const unicos = new Map(juntos.filter((e) => e.repeticao?.serieId === serieId).map((e) => [e.id, e]));
  return [...unicos.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
};

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

describe('repetir: as datas', () => {
  it('as contas do @gestor/shared: todo mês no dia 31 cai no último dia do mês; o dia útil pula o fim de semana', () => {
    expect(datasDaRepeticao('2027-01-31', 'mensal', '2027-05-31')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
    // sexta 11/06/2027 → segunda 14
    expect(datasDaRepeticao('2027-06-11', 'dias_uteis', '2027-06-15')).toEqual(['2027-06-11', '2027-06-14', '2027-06-15']);
    expect(datasDaRepeticao('2027-06-01', 'semanal', '2027-06-30')).toEqual(['2027-06-01', '2027-06-08', '2027-06-15', '2027-06-22', '2027-06-29']);
    expect(datasDaRepeticao('2027-06-01', 'semanal', '2027-06-30', '2027-06-15')).toEqual(['2027-06-22', '2027-06-29']);
  });

  it('toda semana, até uma data: cada terça vira um evento de verdade, com a regra', async () => {
    const ate = somarDias(terca, 7 * 9);
    const r = await s.post('/calendario/eventos', evento({ repetir: { frequencia: 'semanal', ate } }));
    expect(r.statusCode, r.body).toBe(201);
    const primeiro = r.json() as EventoDoCalendario;
    expect(primeiro.repeticao).toMatchObject({ frequencia: 'semanal', ate, ancora: terca });
    const todos = await daSerie(primeiro.repeticao!.serieId);
    expect(todos).toHaveLength(10);
    expect(todos.map((e) => e.inicio)).toEqual(Array.from({ length: 10 }, (_, k) => somarDias(terca, 7 * k)));
    expect(new Set(todos.map((e) => e.horaInicio))).toEqual(new Set(['09:00']));
    // a auditoria diz a regra e quantas datas
    const aud = (await s.get(`/admin/audit?entityId=${primeiro.id}&pageSize=5`)).json().items[0].summary as string;
    expect(aud).toContain('toda terça');
    expect(aud).toContain('10 datas');
  });

  it('sem data para acabar: 12 meses à frente, e o relógio estende um pouco por dia', async () => {
    const r = await s.post('/calendario/eventos', evento({ titulo: 'Backup do servidor', inicio: hoje, fim: hoje, diaInteiro: true, horaInicio: null, horaFim: null, repetir: { frequencia: 'diaria', ate: null } }));
    expect(r.statusCode, r.body).toBe(201);
    const serieId = (r.json() as EventoDoCalendario).repeticao!.serieId;
    const todos = await daSerie(serieId);
    expect(todos).toHaveLength(366);
    expect(todos.at(-1)!.inicio).toBe(somarDias(hoje, 365));
    // dez dias depois, o relógio põe as dez datas que faltam (e uma segunda volta no mesmo dia não dobra)
    const daqui10 = new Date(Date.now() + 10 * 86_400_000);
    expect(await estenderRepeticoes(app.db, daqui10)).toBeGreaterThanOrEqual(10);
    expect(await estenderRepeticoes(app.db, daqui10)).toBe(0);
    const [serie] = await app.db.select().from(calendarSeries).where(eq(calendarSeries.id, serieId));
    expect(serie!.generatedUntil).toBe(somarDias(hoje, 375));
    expect(await daSerie(serieId)).toHaveLength(376);
  });

  it('as regras: o evento que se repete todo dia dura um dia só; a data para acabar vem depois e vai até 2 anos', async () => {
    const dois = await s.post('/calendario/eventos', evento({ fim: somarDias(terca, 1), repetir: { frequencia: 'diaria', ate: null } }));
    expect(dois.statusCode).toBe(400);
    expect(dois.body).toContain('dura um dia só');
    const antes = await s.post('/calendario/eventos', evento({ repetir: { frequencia: 'semanal', ate: somarDias(terca, -1) } }));
    expect(antes.body).toContain('acaba depois do primeiro dia');
    const longe = await s.post('/calendario/eventos', evento({ repetir: { frequencia: 'mensal', ate: somarDias(terca, 800) } }));
    expect(longe.body).toContain('até 2 anos');
  });
});

describe('repetir: mudar e excluir', () => {
  let serieId = '';
  let todos: EventoDoCalendario[] = [];
  beforeAll(async () => {
    const r = await s.post('/calendario/eventos', evento({ titulo: 'Ronda dos ramais', repetir: { frequencia: 'semanal', ate: somarDias(terca, 7 * 7) } }));
    serieId = (r.json() as EventoDoCalendario).repeticao!.serieId;
    todos = await daSerie(serieId);
    expect(todos).toHaveLength(8);
  });

  it('só este: muda um, os outros ficam', async () => {
    const e = todos[2]!;
    const r = await s.put(`/calendario/eventos/${e.id}`, { ...evento({ titulo: 'Ronda dos ramais (com o cliente)', inicio: e.inicio, fim: e.fim }), escopo: 'este', repetir: { frequencia: 'semanal', ate: null } });
    expect(r.statusCode, r.body).toBe(200);
    const agora = await daSerie(serieId);
    expect(agora.map((x) => x.titulo).filter((t) => t.includes('com o cliente'))).toHaveLength(1);
    // a regra não mudou ("só este" não mexe na repetição)
    expect(agora[0]!.repeticao!.ate).toBe(somarDias(terca, 7 * 7));
  });

  it('Feito e Cancelar valem um por um', async () => {
    const r = await s.post(`/calendario/eventos/${todos[1]!.id}/situacao`, { situacao: 'cancelado' });
    expect(r.json().situacao).toBe('cancelado');
    expect((await daSerie(serieId)).filter((x) => x.situacao === 'cancelado').map((x) => x.id)).toEqual([todos[1]!.id]);
  });

  it('este e os próximos: muda a hora daqui para frente; os de antes ficam', async () => {
    const e = todos[4]!;
    const r = await s.put(`/calendario/eventos/${e.id}`, {
      ...evento({ titulo: 'Ronda dos ramais', inicio: e.inicio, fim: e.fim, horaInicio: '14:00', horaFim: '15:00' }), escopo: 'proximos', repetir: { frequencia: 'semanal', ate: somarDias(terca, 7 * 7) },
    });
    expect(r.statusCode, r.body).toBe(200);
    const agora = await daSerie(serieId);
    expect(agora.map((x) => x.horaInicio)).toEqual(['09:00', '09:00', '09:00', '09:00', '14:00', '14:00', '14:00', '14:00']);
    // o cancelado continua cancelado
    expect(agora[1]!.situacao).toBe('cancelado');
  });

  it('este e os próximos com outra regra: as datas andam (toda semana → todo dia útil, até a mesma data)', async () => {
    const e = (await daSerie(serieId))[6]!;
    const ate = somarDias(e.inicio, 7);
    const r = await s.put(`/calendario/eventos/${e.id}`, { ...evento({ titulo: 'Ronda dos ramais', inicio: e.inicio, fim: e.fim, horaInicio: '14:00', horaFim: '15:00' }), escopo: 'proximos', repetir: { frequencia: 'dias_uteis', ate } });
    expect(r.statusCode, r.body).toBe(200);
    const agora = await daSerie(serieId);
    // os seis de antes, e de terça a terça em dias úteis: 6 datas
    expect(agora).toHaveLength(6 + 6);
    expect(agora.slice(6).map((x) => x.inicio)).toEqual(datasDaRepeticao(e.inicio, 'dias_uteis', ate));
    expect(agora.at(-1)!.repeticao).toMatchObject({ frequencia: 'dias_uteis', ancora: e.inicio, ate });
  });

  it('excluir este e os próximos: uma linha só na lixeira, e restaurar traz todas', async () => {
    const antes = await daSerie(serieId);
    const corte = antes[8]!;
    const r = await s.del(`/calendario/eventos/${corte.id}?escopo=proximos`);
    expect(r.statusCode, r.body).toBe(200);
    expect(await daSerie(serieId)).toHaveLength(8);
    const lixeira = ((await s.get('/admin/trash')).json() as Array<{ type: string; id: string; label: string }>).filter((x) => x.type === 'calendarEvent');
    const linha = lixeira.find((x) => x.label.includes('Ronda dos ramais'))!;
    expect(linha.label).toContain('(4 datas da repetição)');
    const volta = await s.post(`/admin/trash/calendarEvent/${linha.id}/restore`);
    expect(volta.statusCode, volta.body).toBe(200);
    expect(await daSerie(serieId)).toHaveLength(12);
  });

  it('este e os próximos sem repetir: a série para nele', async () => {
    const antes = await daSerie(serieId);
    const e = antes[3]!;
    const r = await s.put(`/calendario/eventos/${e.id}`, { ...evento({ titulo: e.titulo, inicio: e.inicio, fim: e.fim }), escopo: 'proximos', repetir: null });
    expect(r.statusCode, r.body).toBe(200);
    expect(await daSerie(serieId)).toHaveLength(4);
    expect(r.json().repeticao.ate).toBe(e.inicio);
  });

  it('o evento avulso que passa a se repetir', async () => {
    const r = await s.post('/calendario/eventos', evento({ titulo: 'Fechamento do mês', inicio: '2027-01-31', fim: '2027-01-31' }));
    const id = r.json().id as string;
    const m = await s.put(`/calendario/eventos/${id}`, { ...evento({ titulo: 'Fechamento do mês', inicio: '2027-01-31', fim: '2027-01-31' }), repetir: { frequencia: 'mensal', ate: '2027-06-30' } });
    expect(m.statusCode, m.body).toBe(200);
    const datas = (await daSerie(m.json().repeticao.serieId)).map((x) => x.inicio);
    expect(datas).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30']);
  });
});

describe('cancelar o link', () => {
  let carrierId = '';
  let link = '';
  let outro = '';
  beforeAll(async () => {
    carrierId = (await s.get('/admin/catalogs/carriers')).json()[0].id;
    link = (await s.post('/circuits', { name: 'Link - Clínica Aurora', code: '94234', carrierId, channels: 2 })).json().id;
    outro = (await s.post('/circuits', { name: '071 Principal', code: '09802603', carrierId, channels: 30 })).json().id;
    expect((await s.post(`/circuits/${link}/dids/range`, { baseNumber: '(71) 3039-6100', quantity: 4 })).statusCode).toBe(201);
    expect((await s.post(`/circuits/${outro}/dids/range`, { baseNumber: '(71) 3020-0000', quantity: 10 })).statusCode).toBe(201);
  });

  it('cancelar: o dia e o motivo; sai da lista, dos cartões, da Numeração e do painel', async () => {
    const antesPainel = (await s.get('/dashboard')).json();
    const r = await s.post(`/circuits/${link}/cancelar`, { dia: '2026-11-10', motivo: 'O cliente migrou para a nuvem' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().cancelamento).toMatchObject({ dia: '2026-11-10', motivo: 'O cliente migrou para a nuvem', por: 'Administrador' });

    const lista = (await s.get('/circuits')).json().items as Array<{ id: string }>;
    expect(lista.map((c) => c.id)).toEqual([outro]);
    expect((await s.get('/circuits/summary')).json()).toMatchObject({ circuits: 1, dids: { total: 10 } });
    expect((await s.get('/dids?pageSize=100')).json().total).toBe(10);
    const painel = (await s.get('/dashboard')).json();
    expect(painel.circuits.map((c: { id: string }) => c.id)).not.toContain(link);
    expect(antesPainel.circuits.map((c: { id: string }) => c.id)).toContain(link);
    // "Mostrar cancelados" traz de volta, com a marca
    const todos = (await s.get('/circuits?includeCancelled=true')).json().items as Array<{ id: string; cancelamento: unknown }>;
    expect(todos.find((c) => c.id === link)!.cancelamento).toBeTruthy();
    expect((await s.get('/dids?pageSize=100&includeCancelled=true')).json().items.filter((d: { cancelled: boolean }) => d.cancelled)).toHaveLength(4);
    // a ficha do link continua com os números dele
    expect((await s.get(`/circuits/${link}/dids?pageSize=100`)).json().total).toBe(4);
    // fora da escolha do circuito (os seletores) e sem números novos
    expect((await s.get('/circuits/options')).json().map((c: { id: string }) => c.id)).not.toContain(link);
    const faixa = await s.post(`/circuits/${link}/dids/range`, { baseNumber: '(71) 3039-6200', quantity: 2 });
    expect(faixa.statusCode).toBe(400);
    expect(faixa.body).toContain('foi cancelado');
  });

  it('fica nas movimentações (e na auditoria), com o dia e o motivo', async () => {
    const m = (await s.get(`/circuits/movimentacoes?circuitId=${link}&pageSize=10`)).json().items[0];
    expect(m.tipo).toBe('circuito_cancelado');
    expect(m.resumo).toBe('Cancelou o link Link - Clínica Aurora (desde 10/11/2026: O cliente migrou para a nuvem)');
    expect(m.campos).toEqual(expect.arrayContaining([{ campo: 'Cancelado em', antes: 'ativo', depois: '10/11/2026' }]));
  });

  it('não cancela duas vezes; reativar traz de volta e fica registrado', async () => {
    expect((await s.post(`/circuits/${link}/cancelar`, { dia: '2026-11-11' })).body).toContain('já está cancelado');
    const r = await s.post(`/circuits/${link}/reativar`, {});
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().cancelamento).toBeNull();
    expect((await s.get('/circuits')).json().items).toHaveLength(2);
    const m = (await s.get(`/circuits/movimentacoes?circuitId=${link}&pageSize=10`)).json().items[0];
    expect(m.resumo).toBe('Reativou o link Link - Clínica Aurora (estava cancelado desde 10/11/2026)');
    expect((await s.post(`/circuits/${link}/reativar`, {})).body).toContain('não está cancelado');
  });

  it('cancelar pede a permissão de editar', async () => {
    const papeis = (await s.get('/admin/roles')).json();
    await s.post('/admin/users', { name: 'Lia Rocha', email: 'lia@gestor.local', password: 'SenhaDeTeste!123', roleId: papeis.find((x: any) => x.key === 'leitor').id });
    const lia = new Session(app);
    await lia.login('lia@gestor.local', 'SenhaDeTeste!123');
    expect((await lia.post(`/circuits/${link}/cancelar`, { dia: '2026-11-10' })).statusCode).toBe(403);
  });
});
