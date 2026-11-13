/**
 * O 2.4.8 (os pedidos do Luan em 13/11):
 *  - o checklist do card: um campo em que cada card monta a sua lista ("uma implantação varia muito o que tem q fazer… uma
 *    lista de ramais que tenho que configurar no telefone e outra no soft phone isso varia ent n pode ser um check list fixo");
 *  - (o andamento de todas as partes no cartão da implantação é da tela: as regras estão nos testes do @gestor/shared.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CampoPersonalizado, FichaChamado, OpcoesAtendimento } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;      // o administrador
let leitor: Session; // só lê
let adminId = '';
let telefone: CampoPersonalizado;
let softphone: CampoPersonalizado;
let etapaQuePede = '';
let configuracao = '';
let card = '';
// um painel como o da implantação: a Curadoria (a entrada), a Configuração e o Implantado (que pede os ramais do telefone)
let IMP = '';
const ficha = async (id: string): Promise<FichaChamado> => {
  const r = await s.get(`/atendimento/chamados/${id}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const lista = (id: string, campoId: string, corpo: Record<string, unknown>, sess = s) => sess.post(`/atendimento/chamados/${id}/campos/${campoId}/lista`, corpo);

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  adminId = (await s.login()).id;
  const papeis = (await s.get('/admin/roles')).json() as Array<{ id: string; key: string }>;
  await s.post('/admin/users', { name: 'Lia Leitora', email: 'lia248@gestor.local', password: 'SenhaDeTeste!123', roleId: papeis.find((r) => r.key === 'leitor')!.id });
  leitor = new Session(app); await leitor.login('lia248@gestor.local', 'SenhaDeTeste!123');
  const p = await s.post('/atendimento/paineis', {
    nome: 'Implantação 248', sigla: 'IMQ', descricao: null, cor: 'roxo', acesso: 'todos', pessoas: [], ajustes: {},
    etapas: [
      { nome: 'Curadoria', tipo: 'entrada', nivel: null, obrigatorios: [], avisar: [] },
      { nome: 'Configuração', tipo: 'andamento', nivel: null, obrigatorios: [], avisar: [] },
      { nome: 'Implantado', tipo: 'andamento', nivel: null, obrigatorios: [], avisar: [] },
      { nome: 'Concluído', tipo: 'fechado', nivel: null, obrigatorios: [], avisar: [] },
    ],
  });
  expect(p.statusCode, p.body).toBe(201);
  IMP = p.json().id;
  const o: OpcoesAtendimento = (await s.get('/atendimento/opcoes')).json();
  const imp = o.paineis.find((x) => x.id === IMP)!;
  configuracao = imp.etapas.find((e) => e.nome === 'Configuração')!.id;
  etapaQuePede = imp.etapas.find((e) => e.nome === 'Implantado')!.id;
  const r1 = await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Ramais no telefone', tipo: 'checklist', parte: 'Configuração', etapas: [etapaQuePede], opcoes: [{ nome: 'ignorada', ativa: true }] });
  expect(r1.statusCode, r1.body).toBe(201);
  telefone = r1.json();
  const r2 = await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Ramais no softphone', tipo: 'checklist', parte: 'Configuração' });
  expect(r2.statusCode, r2.body).toBe(201);
  softphone = r2.json();
  const c = await s.post('/atendimento/chamados', { painelId: IMP, titulo: 'Implantação do Hotel Beira Mar' });
  expect(c.statusCode, c.body).toBe(201);
  card = c.json().id;
});
afterAll(async () => { await esperarSegundoPlano(); await app.close(); });

describe('o checklist do card (2.4.8)', () => {
  it('o campo nasce sem opções; não pode ser pedido na abertura', async () => {
    expect(telefone).toMatchObject({ tipo: 'checklist', opcoes: [], parte: 'Configuração' });
    const r = await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Ramais na abertura', tipo: 'checklist', obrigatorioAoAbrir: true });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('peça-o numa etapa');
  });

  it('cada card começa com a lista vazia, que conta um item por fazer na parte', async () => {
    const f = await ficha(card);
    expect(f.listas).toEqual({});
    // os dois checklists vazios: um item cada, por fazer
    expect(f.partes.find((p) => p.parte === 'Configuração')).toEqual({ parte: 'Configuração', feitos: 0, total: 2 });
  });

  it('colar várias linhas inclui um item por linha; o histórico diz o campo', async () => {
    const r = await lista(card, telefone.id, { acao: 'incluir', textos: ['200 Recepção\n- 201 Reservas\n\n202 Governança'] });
    expect(r.statusCode, r.body).toBe(200);
    const f: FichaChamado = r.json();
    expect(f.listas[telefone.id]!.map((i) => [i.texto, i.feito])).toEqual([['200 Recepção', false], ['201 Reservas', false], ['202 Governança', false]]);
    expect(f.historico.map((e) => e.texto)).toContain('incluiu em Ramais no telefone: 200 Recepção, 201 Reservas, 202 Governança');
    expect(f.partes.find((p) => p.parte === 'Configuração')).toEqual({ parte: 'Configuração', feitos: 0, total: 4 });
    // o que já está na lista não entra de novo (sem ligar para maiúscula e acento)
    const de = await lista(card, telefone.id, { acao: 'incluir', textos: ['200 recepcao'] });
    expect(de.statusCode).toBe(400);
    expect(de.json().error).toBe('Esses itens já estão na lista.');
    // a auditoria conta
    const aud = (await s.get(`/admin/audit?entityId=${card}&pageSize=50`)).json().items as Array<{ summary: string }>;
    expect(aud.map((a) => a.summary)).toContain(`Incluiu 3 itens em Ramais no telefone (${f.codigo})`);
  });

  it('marcar guarda quem e quando; corrigir e tirar; o cartão conta', async () => {
    const itens = (await ficha(card)).listas[telefone.id]!;
    const m = await lista(card, telefone.id, { acao: 'marcar', itemId: itens[0]!.id, feito: true });
    expect(m.statusCode, m.body).toBe(200);
    const marcado = (m.json() as FichaChamado).listas[telefone.id]![0]!;
    expect(marcado.feito).toBe(true);
    expect(marcado.porId).toBe(adminId);
    expect(marcado.em).toBeTruthy();
    const ed = await lista(card, telefone.id, { acao: 'editar', itemId: itens[2]!.id, texto: '202 Governança (sem fio)' });
    expect(ed.statusCode, ed.body).toBe(200);
    expect((ed.json() as FichaChamado).historico.map((e) => e.texto)).toContain('corrigiu em Ramais no telefone: "202 Governança" para "202 Governança (sem fio)"');
    const t = await lista(card, telefone.id, { acao: 'tirar', itemId: itens[1]!.id });
    expect(t.statusCode, t.body).toBe(200);
    const f: FichaChamado = t.json();
    expect(f.listas[telefone.id]!.map((i) => i.texto)).toEqual(['200 Recepção', '202 Governança (sem fio)']);
    // 1 de 2 no telefone e o softphone ainda vazio (um por fazer)
    expect(f.partes.find((p) => p.parte === 'Configuração')).toEqual({ parte: 'Configuração', feitos: 1, total: 3 });
    // o cartão do quadro (a lista) traz a mesma conta
    const cartoes = (await s.get(`/atendimento/chamados?painel=${IMP}&situacao=todos`)).json().items as Array<{ id: string; partes: unknown[] }>;
    expect(cartoes.find((c) => c.id === card)?.partes).toContainEqual({ parte: 'Configuração', feitos: 1, total: 3 });
  });

  it('a etapa que pede o campo: só passa com itens, todos marcados', async () => {
    expect((await s.post(`/atendimento/chamados/${card}/mover`, { etapaId: configuracao, responsavelId: adminId })).statusCode).toBe(200);
    const tenta = await s.post(`/atendimento/chamados/${card}/mover`, { etapaId: etapaQuePede });
    expect(tenta.statusCode).toBe(400);
    expect(tenta.body).toContain('Ramais no telefone');
    const itens = (await ficha(card)).listas[telefone.id]!;
    expect((await lista(card, telefone.id, { acao: 'marcar', itemId: itens[1]!.id, feito: true })).statusCode).toBe(200);
    const vai = await s.post(`/atendimento/chamados/${card}/mover`, { etapaId: etapaQuePede });
    expect(vai.statusCode, vai.body).toBe(200);
  });

  it('cada card tem a sua lista', async () => {
    const outro = (await s.post('/atendimento/chamados', { painelId: IMP, titulo: 'Implantação da Ótica' })).json().id;
    expect((await lista(outro, softphone.id, { acao: 'incluir', textos: ['300 Loja'] })).statusCode).toBe(200);
    expect((await ficha(outro)).listas).toEqual({ [softphone.id]: [expect.objectContaining({ texto: '300 Loja' })] });
    expect((await ficha(card)).listas[softphone.id]).toBeUndefined();
  });

  it('o valor não entra pelo alterar; outro tipo de campo, o campo que não existe e quem só lê são recusados', async () => {
    const alt = await s.patch(`/atendimento/chamados/${card}`, { campos: { [telefone.id]: ['200'] } });
    expect(alt.statusCode).toBe(400);
    expect(alt.body).toContain('inclua os itens pela ficha');
    const texto = (await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Protocolo 248', tipo: 'texto' })).json();
    expect((await lista(card, texto.id, { acao: 'incluir', textos: ['x'] })).statusCode).toBe(400);
    expect((await lista(card, 'campo-que-nao-existe', { acao: 'incluir', textos: ['x'] })).statusCode).toBe(404);
    expect((await lista(card, telefone.id, { acao: 'incluir', textos: ['x'] }, leitor)).statusCode).toBe(403);
    const itens = (await ficha(card)).listas[telefone.id]!;
    expect((await lista(card, telefone.id, { acao: 'marcar', itemId: 'sumiu', feito: true })).statusCode).toBe(400);
    expect(itens).toHaveLength(2);
  });
});
