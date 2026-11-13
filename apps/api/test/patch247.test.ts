/**
 * O 2.4.7 (os pedidos do Luan em 11/11):
 *  - a largura do campo no grupo do meio da ficha: metade ou a linha inteira ("escolher na hora de cadastrar um campo se ele vai
 *    ocupar metade do espaço como o de operadora doadora ou vai ser todo como esse da faixa numérica");
 *  - o painel pessoal de cada pessoa ("quero que nativamente todos os usuários tenham um painel pessoal de atividades, ele vai vir
 *    seco e o usuário vai habilitando os campos"): nasce sozinho; o dono e o administrador veem e configuram ("quem tem perfil de
 *    administrador tem q ver todos", 12/11), quem só cuida dos chamados não; o "… - Pessoal" que a pessoa já usava passa a ser o
 *    dela, sem mudar nada ("eu já tenho um pessoal e n quero que altere nada nele").
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ticketPanels } from '@gestor/db';
import { AJUSTES_DO_PAINEL_PESSOAL, datasDaRepeticao, diaDaSemana, somarDias, larguraDoCampo, nomeDoPainelPessoal, siglasDoPainelPessoal, type CampoPersonalizado, type EventoDoCalendario, type OpcoesAtendimento, type Painel } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;       // o administrador: cuida dos chamados
let marina: Session;  // operadora: trabalha nos chamados, não cuida
let carla: Session;   // operadora que já tinha o "Carla - Pessoal"
let paulo: Session;   // cuida dos chamados, mas não tem o perfil de administrador
let adminId = '';
let marinaId = '';
let carlaId = '';
let antigoDaCarla = '';

const SUP = 'painel-suporte';
const opcoes = async (ss: Session): Promise<OpcoesAtendimento> => {
  const r = await ss.get('/atendimento/opcoes');
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const pessoalDe = (o: OpcoesAtendimento, id: string) => o.paineis.find((p) => p.donoId === id);
const gravavel = (p: Painel, mudar: Record<string, unknown> = {}) => ({
  nome: p.nome, sigla: p.sigla, descricao: p.descricao, cor: p.cor, tipo: p.tipo, acesso: p.acesso, pessoas: p.pessoas, ativo: p.ativo, ajustes: p.ajustes, ...mudar,
});

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  adminId = (await s.login()).id;
  const papeis = (await s.get('/admin/roles')).json() as Array<{ id: string; key: string }>;
  const operador = papeis.find((r) => r.key === 'operador')!.id;
  marinaId = (await s.post('/admin/users', { name: 'Marina Costa', email: 'marina247@gestor.local', password: 'SenhaDeTeste!123', roleId: operador })).json().id;
  carlaId = (await s.post('/admin/users', { name: 'Carla Dias', email: 'carla247@gestor.local', password: 'SenhaDeTeste!123', roleId: operador })).json().id;
  // o painel que a Carla já usava como pessoal, com as etapas dela e um chamado (antes de o 2.4.7 existir)
  const r = await s.post('/atendimento/paineis', {
    nome: 'Carla - Pessoal', sigla: 'CDX', descricao: null, cor: 'roxo', acesso: 'escolhidos', pessoas: [carlaId], ajustes: {},
    etapas: [
      { nome: 'A fazer', tipo: 'entrada', nivel: null, obrigatorios: [], avisar: [] },
      { nome: 'Fazendo', tipo: 'andamento', nivel: null, obrigatorios: [], avisar: [] },
      { nome: 'Feito', tipo: 'fechado', nivel: null, obrigatorios: [], avisar: [] },
    ],
  });
  expect(r.statusCode, r.body).toBe(201);
  antigoDaCarla = r.json().id;
  const supervisor = (await s.post('/admin/roles', { name: 'Supervisor 2.4.7', description: 'cuida dos chamados, sem administrar',
    permissions: ['records.read', 'support.read', 'tickets.work', 'tickets.manage'] })).json().id;
  await s.post('/admin/users', { name: 'Paulo Lima', email: 'paulo247@gestor.local', password: 'SenhaDeTeste!123', roleId: supervisor });
  paulo = new Session(app); await paulo.login('paulo247@gestor.local', 'SenhaDeTeste!123');
  marina = new Session(app); await marina.login('marina247@gestor.local', 'SenhaDeTeste!123');
  carla = new Session(app); await carla.login('carla247@gestor.local', 'SenhaDeTeste!123');
});
afterAll(async () => { await esperarSegundoPlano(); await app.close(); });

describe('a largura do campo (2.4.7)', () => {
  it('sem escolha, a do tipo; a escolhida fica guardada e volta; valor estranho é recusado', () => {
    expect(larguraDoCampo({ tipo: 'lista', largura: null })).toBe('metade');
    expect(larguraDoCampo({ tipo: 'texto_longo', largura: null })).toBe('inteiro');
    expect(larguraDoCampo({ tipo: 'documento' })).toBe('inteiro');
    expect(larguraDoCampo({ tipo: 'texto_longo', largura: 'metade' })).toBe('metade');
    expect(larguraDoCampo({ tipo: 'lista', largura: 'inteiro' })).toBe('inteiro');
  });

  it('o campo guarda a largura (metade, inteiro ou nenhuma) e a auditoria conta', async () => {
    const r = await s.post(`/atendimento/paineis/${SUP}/campos`, { nome: 'Faixa Numérica', tipo: 'texto_longo', largura: 'metade' });
    expect(r.statusCode, r.body).toBe(201);
    const c: CampoPersonalizado = r.json();
    expect(c.largura).toBe('metade');
    const alterado = await s.put(`/atendimento/campos/${c.id}`, { nome: 'Faixa Numérica', tipo: 'texto_longo', largura: 'inteiro' });
    expect(alterado.statusCode, alterado.body).toBe(200);
    expect((alterado.json() as CampoPersonalizado).largura).toBe('inteiro');
    const semEscolha = await s.put(`/atendimento/campos/${c.id}`, { nome: 'Faixa Numérica', tipo: 'texto_longo' });
    expect((semEscolha.json() as CampoPersonalizado).largura).toBeNull();
    expect((await opcoes(s)).campos.find((x) => x.id === c.id)!.largura).toBeNull();
    expect((await s.post(`/atendimento/paineis/${SUP}/campos`, { nome: 'Outro', tipo: 'texto', largura: 'um terço' })).statusCode).toBe(400);
  });
});

describe('o painel pessoal (2.4.7)', () => {
  it('nasce sozinho ao entrar nos Painéis: seco, com as cinco etapas, só o dono vê; não repete', async () => {
    expect(nomeDoPainelPessoal('Marina Costa')).toBe('Marina - Pessoal');
    expect(siglasDoPainelPessoal('Marina Costa')[0]).toBe('MCP');
    const o = await opcoes(marina);
    const p = pessoalDe(o, marinaId)!;
    expect(p).toBeTruthy();
    expect(p).toMatchObject({ nome: 'Marina - Pessoal', sigla: 'MCP', tipo: 'gestao', acesso: 'escolhidos', pessoas: [marinaId], ativo: true });
    expect(p.etapas.map((e) => `${e.nome}:${e.tipo}`)).toEqual(['Stand By:andamento', 'Novos:entrada', 'Em andamento:andamento', 'Concluído:resolvido', 'Validado:fechado']);
    expect([...p.ajustes.camposDesligados].sort()).toEqual([...AJUSTES_DO_PAINEL_PESSOAL.camposDesligados].sort());
    expect(p.ajustes.contaPrazo).toBe(false);
    // a segunda leitura (e a tela dos Painéis) não cria outro
    await marina.get('/atendimento/paineis/resumo');
    await opcoes(marina);
    expect((await app.db.select().from(ticketPanels).where(eq(ticketPanels.ownerId, marinaId))).length).toBe(1);
  });

  it('o "… - Pessoal" que a pessoa já usava vira o dela, sem mudar nada (o nome, a sigla, as etapas)', async () => {
    const o = await opcoes(carla);
    const p = pessoalDe(o, carlaId)!;
    expect(p.id).toBe(antigoDaCarla);
    expect(p).toMatchObject({ nome: 'Carla - Pessoal', sigla: 'CDX', cor: 'roxo' });
    expect(p.etapas.map((e) => e.nome)).toEqual(['A fazer', 'Fazendo', 'Feito']);
    expect((await app.db.select().from(ticketPanels).where(eq(ticketPanels.ownerId, carlaId))).length).toBe(1);
  });

  it('o dono e o administrador veem; quem só cuida dos chamados e os colegas, não; os chamados do pessoal também', async () => {
    const doAdmin = await opcoes(s);
    expect(pessoalDe(doAdmin, adminId)).toBeTruthy();
    // o administrador vê os de todos (12/11)
    expect(pessoalDe(doAdmin, marinaId)).toBeTruthy();
    expect(doAdmin.paineis.some((p) => p.id === antigoDaCarla)).toBe(true);
    // a colega não vê o dos outros; quem cuida dos chamados sem o perfil de administrador também não
    expect((await opcoes(marina)).paineis.some((p) => p.donoId && p.donoId !== marinaId)).toBe(false);
    const doPaulo = await opcoes(paulo);
    expect(doPaulo.paineis.filter((p) => p.donoId).map((p) => p.nome)).toEqual(['Paulo - Pessoal']);
    const daMarina = pessoalDe(await opcoes(marina), marinaId)!;
    const aberto = await marina.post('/atendimento/chamados', { painelId: daMarina.id, titulo: 'Revisar a planilha de DIDs' });
    expect(aberto.statusCode, aberto.body).toBe(201);
    const { id } = aberto.json() as { id: string };
    expect((await marina.get(`/atendimento/chamados/${id}`)).statusCode).toBe(200);
    expect((await s.get(`/atendimento/chamados/${id}`)).statusCode).toBe(200);
    expect((await paulo.get(`/atendimento/chamados/${id}`)).statusCode).toBe(404);
    expect((await carla.get(`/atendimento/chamados/${id}`)).statusCode).toBe(404);
    // o envio automático não lista os pessoais
    expect(((await s.get('/envio/ajustes')).json() as { origens: Array<{ id: string }> }).origens.some((x) => x.id === daMarina.id)).toBe(false);
  });

  it('o dono configura o dele sem cuidar dos chamados: o painel, os campos, os assuntos e as etiquetas; quem vê não muda', async () => {
    const p = pessoalDe(await opcoes(marina), marinaId)!;
    const r = await marina.put(`/atendimento/paineis/${p.id}`, gravavel(p, { nome: 'Minhas atividades', acesso: 'todos', pessoas: [] }));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ nome: 'Minhas atividades', acesso: 'escolhidos', pessoas: [marinaId], donoId: marinaId });
    const liga = await marina.put(`/atendimento/paineis/${p.id}/campos-do-sistema`, { desligados: AJUSTES_DO_PAINEL_PESSOAL.camposDesligados.filter((c) => c !== 'prioridade' && c !== 'assunto'), tipos: p.ajustes.tipos });
    expect(liga.statusCode, liga.body).toBe(200);
    const campo = await marina.post(`/atendimento/paineis/${p.id}/campos`, { nome: 'Prazo combinado', tipo: 'data' });
    expect(campo.statusCode, campo.body).toBe(201);
    expect((await marina.post(`/atendimento/paineis/${p.id}/assuntos`, { nome: 'Relatórios' })).statusCode).toBe(201);
    const et = await marina.post('/atendimento/etiquetas', { painelId: p.id, nome: 'Urgente', cor: 'signal' });
    expect(et.statusCode, et.body).toBe(201);
    const lista = (await marina.get('/atendimento/etiquetas')).json() as Array<{ painelId: string }>;
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((e) => e.painelId === p.id)).toBe(true);
    // o dela continua dela: a ordem e o resto do painel da equipe não
    expect((await marina.put(`/atendimento/paineis/${SUP}/campos-do-sistema`, { desligados: [], tipos: [] })).statusCode).toBe(403);
    expect((await marina.post(`/atendimento/paineis/${SUP}/campos`, { nome: 'Não pode', tipo: 'texto' })).statusCode).toBe(403);
  });

  it('o pessoal de outra pessoa não existe para quem só cuida dos chamados (404); o administrador configura, mas não tira', async () => {
    const p = pessoalDe(await opcoes(marina), marinaId)!;
    expect((await paulo.put(`/atendimento/paineis/${p.id}`, gravavel(p, { nome: 'Do Paulo' }))).statusCode).toBe(404);
    expect((await paulo.post(`/atendimento/paineis/${p.id}/campos`, { nome: 'Do Paulo', tipo: 'texto' })).statusCode).toBe(404);
    expect((await paulo.get('/atendimento/etiquetas')).json().some((e: { painelId: string }) => e.painelId === p.id)).toBe(false);
    // o administrador: configura (quem vê continua o dono)
    const r = await s.put(`/atendimento/paineis/${p.id}`, gravavel(p, { nome: 'Marina - Atividades' }));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ nome: 'Marina - Atividades', pessoas: [marinaId], donoId: marinaId });
    expect((await s.post(`/atendimento/paineis/${p.id}/campos`, { nome: 'Do admin', tipo: 'texto' })).statusCode).toBe(201);
    expect((await s.get('/atendimento/etiquetas')).json().some((e: { painelId: string }) => e.painelId === p.id)).toBe(true);
    // e não tira: o painel é da pessoa
    const tirar = await s.del(`/atendimento/paineis/${p.id}`);
    expect(tirar.statusCode).toBe(400);
    expect(tirar.body).toContain('painel pessoal');
  });
});

describe('repetir em dias da semana no calendário (2.4.7: "toda terça e quinta")', () => {
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const terca = (() => { let d = somarDias(hoje, 1); while (diaDaSemana(d) !== 1) d = somarDias(d, 1); return d; })();
  const ate = somarDias(terca, 16); // a terça, a quinta e mais duas semanas
  const evento = { titulo: 'Ronda de terça e quinta', tipoId: 'reuniao', paineis: [SUP], pessoas: [], inicio: terca, fim: terca, diaInteiro: false, horaInicio: '09:00', horaFim: '09:30' };
  const daSerie = async (serieId: string) => ((await s.get(`/calendario/eventos?de=${terca}&ate=${somarDias(terca, 60)}`)).json() as EventoDoCalendario[])
    .filter((e) => e.repeticao?.serieId === serieId).sort((a, b) => a.inicio.localeCompare(b.inicio));

  it('a série cai em cada dia escolhido e guarda os dias; mais de um dia de duração é recusado', async () => {
    const r = await s.post('/calendario/eventos', { ...evento, repetir: { frequencia: 'semanal', ate, dias: [1, 3] } });
    expect(r.statusCode, r.body).toBe(201);
    const e = r.json() as EventoDoCalendario;
    expect(e.repeticao).toMatchObject({ frequencia: 'semanal', dias: [1, 3], ate, ancora: terca });
    const datas = (await daSerie(e.repeticao!.serieId)).map((x) => x.inicio);
    expect(datas).toEqual(datasDaRepeticao(terca, { frequencia: 'semanal', dias: [1, 3] }, ate));
    expect(datas.map(diaDaSemana)).toEqual([1, 3, 1, 3, 1, 3]);
    const longo = await s.post('/calendario/eventos', { ...evento, fim: somarDias(terca, 1), diaInteiro: true, horaInicio: null, horaFim: null, repetir: { frequencia: 'semanal', ate, dias: [1, 3] } });
    expect(longo.statusCode).toBe(400);
    expect(longo.body).toContain('mais de um dia da semana');
  });

  it('este e os próximos: tirar a quinta deixa só as terças daqui para frente', async () => {
    const r = await s.post('/calendario/eventos', { ...evento, titulo: 'Plantão', repetir: { frequencia: 'semanal', ate, dias: [1, 3] } });
    const serieId = (r.json() as EventoDoCalendario).repeticao!.serieId;
    const terceira = (await daSerie(serieId))[2]!; // a segunda terça
    const m = await s.put(`/calendario/eventos/${terceira.id}`, { ...evento, titulo: 'Plantão', inicio: terceira.inicio, fim: terceira.fim, escopo: 'proximos', repetir: { frequencia: 'semanal', ate, dias: [1] } });
    expect(m.statusCode, m.body).toBe(200);
    const agora = await daSerie(serieId);
    expect(agora.map((x) => diaDaSemana(x.inicio))).toEqual([1, 3, 1, 1]);
    expect(agora.at(-1)!.repeticao!.dias ?? null).toBeNull();
  });
});
