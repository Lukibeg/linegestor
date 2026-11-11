/**
 * O 2.4.7 (os pedidos do Luan em 11/11):
 *  - a largura do campo no grupo do meio da ficha: metade ou a linha inteira ("escolher na hora de cadastrar um campo se ele vai
 *    ocupar metade do espaço como o de operadora doadora ou vai ser todo como esse da faixa numérica");
 *  - o painel pessoal de cada pessoa ("quero que nativamente todos os usuários tenham um painel pessoal de atividades, ele vai vir
 *    seco e o usuário vai habilitando os campos"): nasce sozinho, só o dono vê e configura; o "… - Pessoal" que a pessoa já usava
 *    passa a ser o dela, sem mudar nada ("eu já tenho um pessoal e n quero que altere nada nele").
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ticketPanels } from '@gestor/db';
import { AJUSTES_DO_PAINEL_PESSOAL, larguraDoCampo, nomeDoPainelPessoal, siglasDoPainelPessoal, type CampoPersonalizado, type OpcoesAtendimento, type Painel } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;       // o administrador: cuida dos chamados
let marina: Session;  // operadora: trabalha nos chamados, não cuida
let carla: Session;   // operadora que já tinha o "Carla - Pessoal"
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

  it('só o dono vê: nem quem cuida dos chamados; os chamados do pessoal também não', async () => {
    const doAdmin = await opcoes(s);
    const meu = pessoalDe(doAdmin, adminId)!;
    expect(meu).toBeTruthy();
    expect(doAdmin.paineis.some((p) => p.donoId === marinaId || p.id === antigoDaCarla)).toBe(false);
    expect((await opcoes(marina)).paineis.some((p) => p.donoId && p.donoId !== marinaId)).toBe(false);
    const daMarina = pessoalDe(await opcoes(marina), marinaId)!;
    const aberto = await marina.post('/atendimento/chamados', { painelId: daMarina.id, titulo: 'Revisar a planilha de DIDs' });
    expect(aberto.statusCode, aberto.body).toBe(201);
    const { id } = aberto.json() as { id: string };
    expect((await s.get(`/atendimento/chamados/${id}`)).statusCode).toBe(404);
    expect((await marina.get(`/atendimento/chamados/${id}`)).statusCode).toBe(200);
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

  it('o pessoal de outra pessoa não existe para quem cuida dos chamados (404), nem para tirar', async () => {
    const p = pessoalDe(await opcoes(marina), marinaId)!;
    expect((await s.put(`/atendimento/paineis/${p.id}`, gravavel(p, { nome: 'Do admin' }))).statusCode).toBe(404);
    expect((await s.post(`/atendimento/paineis/${p.id}/campos`, { nome: 'Do admin', tipo: 'texto' })).statusCode).toBe(404);
    expect((await s.del(`/atendimento/paineis/${p.id}`)).statusCode).toBe(404);
    expect((await s.get('/atendimento/etiquetas')).json().some((e: { painelId: string }) => e.painelId === p.id)).toBe(false);
  });
});
