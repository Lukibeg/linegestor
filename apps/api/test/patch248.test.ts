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

// 2.4.8: o checklist da aba Implantação gerado dos campos das outras abas (o Luan: "quero que os campos de outras etapas que eu
// selecionar em algum lugar gere esse checklist na implantação")
describe('o checklist do card gerado de outros campos (2.4.8)', () => {
  let ramais: CampoPersonalizado;
  let filas: CampoPersonalizado;
  let implantar: CampoPersonalizado;
  let cartao = '';

  beforeAll(async () => {
    ramais = (await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Lista de ramais', tipo: 'texto_longo', parte: 'Curadoria' })).json();
    filas = (await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Filas', tipo: 'lista_varios', parte: 'Curadoria', opcoes: [{ nome: 'Vendas', ativa: true }, { nome: 'Suporte', ativa: true }] })).json();
    const r = await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'O que fazer na implantação', tipo: 'checklist', parte: 'Implantação', origens: [ramais.id, filas.id, ramais.id] });
    expect(r.statusCode, r.body).toBe(201);
    implantar = r.json();
    cartao = (await s.post('/atendimento/chamados', { painelId: IMP, titulo: 'Implantação da Padaria' })).json().id;
  });

  it('o campo guarda de onde vêm os itens (sem repetir); só campos que geram itens, deste painel', async () => {
    expect(implantar.origens).toEqual([ramais.id, filas.id]);
    const data = (await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Data da visita', tipo: 'data', parte: 'Curadoria' })).json();
    const ruim = await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Outro checklist', tipo: 'checklist', origens: [data.id] });
    expect(ruim.statusCode).toBe(400);
    expect(ruim.body).toContain('não gera itens');
    expect((await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Mais um', tipo: 'checklist', origens: ['campo-de-outro-painel'] })).statusCode).toBe(400);
    // a auditoria registra as origens
    const aud = (await s.get(`/admin/audit?entityId=${implantar.id}&pageSize=5`)).json().items as Array<{ after: Record<string, unknown> | null }>;
    expect(aud[0]?.after).toMatchObject({ origens: [ramais.id, filas.id] });
  });

  it('o que a Curadoria escreve vira item na Implantação; a conta da aba vem com eles', async () => {
    const alt = await s.patch(`/atendimento/chamados/${cartao}`, { campos: { [ramais.id]: '200 Recepção\n201 Reservas', [filas.id]: [filas.opcoes[1]!.id] } });
    expect(alt.statusCode, alt.body).toBe(200);
    const f: FichaChamado = alt.json();
    expect(f.listas[implantar.id]!.map((i) => [i.texto, i.origem])).toEqual([['200 Recepção', ramais.id], ['201 Reservas', ramais.id], ['Suporte', filas.id]]);
    expect(f.partes.find((p) => p.parte === 'Implantação')).toEqual({ parte: 'Implantação', feitos: 0, total: 3 });
  });

  it('marcar o que veio fica guardado; a Curadoria muda a lista e o checklist acompanha', async () => {
    let f = await ficha(cartao);
    const r200 = f.listas[implantar.id]![0]!;
    expect((await lista(cartao, implantar.id, { acao: 'marcar', itemId: r200.id, feito: true })).statusCode).toBe(200);
    expect((await lista(cartao, implantar.id, { acao: 'incluir', textos: ['Treinar a recepção'] })).statusCode).toBe(200);
    f = (await s.patch(`/atendimento/chamados/${cartao}`, { campos: { [ramais.id]: '200 Recepção\n202 Governança' } })).json();
    expect(f.listas[implantar.id]!.map((i) => [i.texto, i.feito])).toEqual([['200 Recepção', true], ['202 Governança', false], ['Suporte', false], ['Treinar a recepção', false]]);
    // a etapa mostra o mesmo
    const cartoes = (await s.get(`/atendimento/chamados?painel=${IMP}&situacao=todos`)).json().items as Array<{ id: string; partes: unknown[] }>;
    expect(cartoes.find((c) => c.id === cartao)?.partes).toContainEqual({ parte: 'Implantação', feitos: 1, total: 4 });
  });

  it('o que veio de outro campo não se corrige nem se tira aqui', async () => {
    const f = await ficha(cartao);
    const item = f.listas[implantar.id]!.find((i) => i.texto === '202 Governança')!;
    const t = await lista(cartao, implantar.id, { acao: 'tirar', itemId: item.id });
    expect(t.statusCode).toBe(400);
    expect(t.json().error).toBe('Esse item vem de Lista de ramais (Curadoria): para tirar, mude lá.');
    expect((await lista(cartao, implantar.id, { acao: 'editar', itemId: item.id, texto: 'x' })).statusCode).toBe(400);
    // o incluído à mão, sim
    const mao = f.listas[implantar.id]!.find((i) => i.texto === 'Treinar a recepção')!;
    expect((await lista(cartao, implantar.id, { acao: 'tirar', itemId: mao.id })).statusCode).toBe(200);
  });

  it('sem as origens, ficam só os incluídos à mão', async () => {
    const r = await s.put(`/atendimento/campos/${implantar.id}`, { nome: implantar.nome, tipo: 'checklist', parte: 'Implantação', origens: [] });
    expect(r.statusCode, r.body).toBe(200);
    expect((await ficha(cartao)).listas[implantar.id]).toBeUndefined();
  });
});

// 2.4.8: a caixinha "Checklist na Implantação" ao lado do campo (o Luan: "quero que crie sozinho, quero que tenha um checkbox …
// ao lado de um campo de configuração que quando eu clicar automaticamente ele já abra um campo na parte de implantação")
describe('o checklist na Implantação ligado pelo campo (2.4.8)', () => {
  let usuarios: CampoPersonalizado;
  let cartao = '';
  const ligar = (id: string, ligar: boolean) => s.post(`/atendimento/campos/${id}/checklist-na-implantacao`, { ligar });
  const camposDoPainel = async () => ((await s.get('/atendimento/opcoes')).json() as OpcoesAtendimento).campos.filter((c) => c.painelId === IMP);

  beforeAll(async () => {
    usuarios = (await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Usuários', tipo: 'texto_longo', parte: 'Configuração' })).json();
    cartao = (await s.post('/atendimento/chamados', { painelId: IMP, titulo: 'Implantação do Mercado' })).json().id;
  });

  it('ligar cria, no grupo Implantação, o checklist com os itens vindos do campo (e o grupo, se não existe)', async () => {
    const r = await ligar(usuarios.id, true);
    expect(r.statusCode, r.body).toBe(200);
    const novo = r.json().campo as CampoPersonalizado;
    expect(novo).toMatchObject({ nome: 'Usuários (implantação)', tipo: 'checklist', parte: 'Implantação', origens: [usuarios.id], produtoId: null });
    expect(novo.dica).toBe('Os itens vêm de Usuários (Configuração): marque conforme fizer na implantação.');
    const o: OpcoesAtendimento = (await s.get('/atendimento/opcoes')).json();
    expect(o.paineis.find((p) => p.id === IMP)!.ajustes.partes).toContainEqual({ nome: 'Implantação', lugar: 'meio' });
    const aud = (await s.get(`/admin/audit?entityId=${novo.id}&pageSize=5`)).json().items as Array<{ summary: string }>;
    expect(aud[0]!.summary).toMatch(/^Ligou o checklist na Implantação de Usuários: criou o campo Usuários \(implantação\)/);
    // de novo: nada muda
    const de = await ligar(usuarios.id, true);
    expect(de.json().campo.id).toBe(novo.id);
    expect((await camposDoPainel()).filter((c) => c.nome.startsWith('Usuários (implantação)'))).toHaveLength(1);
    // o card: o que se escreve no campo vira item
    const f: FichaChamado = (await s.patch(`/atendimento/chamados/${cartao}`, { campos: { [usuarios.id]: 'Ana\nBeto' } })).json();
    expect(f.listas[novo.id]!.map((i) => i.texto)).toEqual(['Ana', 'Beto']);
    expect(f.partes.find((p) => p.parte === 'Implantação')).toBeTruthy();
  });

  it('desligar manda o checklist para os Excluídos; ligar de novo traz de volta, com as marcas', async () => {
    let f = await ficha(cartao);
    const chk = (await camposDoPainel()).find((c) => c.nome === 'Usuários (implantação)')!;
    expect((await lista(cartao, chk.id, { acao: 'marcar', itemId: f.listas[chk.id]![0]!.id, feito: true })).statusCode).toBe(200);
    const d = await ligar(usuarios.id, false);
    expect(d.statusCode, d.body).toBe(200);
    expect(d.json().campo).toBeNull();
    expect((await camposDoPainel()).some((c) => c.id === chk.id)).toBe(false);
    expect((await s.get(`/atendimento/paineis/${IMP}/campos/excluidos`)).json().map((c: CampoPersonalizado) => c.id)).toContain(chk.id);
    const volta = await ligar(usuarios.id, true);
    expect(volta.json().campo.id).toBe(chk.id);
    f = await ficha(cartao);
    expect(f.listas[chk.id]!.map((i) => [i.texto, i.feito])).toEqual([['Ana', true], ['Beto', false]]);
    // desligar o que não está ligado: nada muda
    const outro = (await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Observação 248', tipo: 'texto', parte: 'Curadoria' })).json();
    expect((await ligar(outro.id, false)).json()).toEqual({ campo: null });
  });

  it('o nome em uso ganha um número; o checklist que tira de outros campos só deixa de tirar deste', async () => {
    const equipe = (await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Equipe', tipo: 'lista_varios', parte: 'Curadoria', opcoes: [{ nome: 'Ana', ativa: true }] })).json();
    await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Equipe (implantação)', tipo: 'texto', parte: 'Curadoria' });
    const chk = (await ligar(equipe.id, true)).json().campo as CampoPersonalizado;
    expect(chk.nome).toBe('Equipe (implantação) 2');
    // o checklist passa a tirar também dos Usuários: desligar a Equipe só tira a Equipe dele
    await s.put(`/atendimento/campos/${chk.id}`, { nome: chk.nome, tipo: 'checklist', parte: 'Implantação', origens: [equipe.id, usuarios.id] });
    expect((await ligar(equipe.id, false)).statusCode).toBe(200);
    expect((await camposDoPainel()).find((c) => c.id === chk.id)?.origens).toEqual([usuarios.id]);
  });

  it('só um texto ou uma lista, fora da Implantação', async () => {
    const data = (await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Data da ativação', tipo: 'data', parte: 'Configuração' })).json();
    const r = await ligar(data.id, true);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('Data da ativação (Data) não gera itens: o checklist vem de um texto, um texto longo ou uma lista.');
    const naImplantacao = (await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Notas da implantação', tipo: 'texto_longo', parte: 'Implantação' })).json();
    expect((await ligar(naImplantacao.id, true)).json().error).toBe('Notas da implantação já está na Implantação.');
    expect((await ligar('campo-que-nao-existe', true)).statusCode).toBe(404);
  });
});
