/**
 * A prévia do Simulador do Comercial (demo-simulador.ts, 2.0.2) vale igual ao servidor: estes testes passam
 * pela mesma `demoApi` que a página publicada usa, entrando como as pessoas da prévia. A Camila e o Diego são
 * o Comercial (veem e mexem); o Luan cuida dos painéis (os Ajustes); a Marina (Operador) e o Paulo (Leitor)
 * não veem o Comercial.
 */
import { describe, expect, it } from 'vitest';
import { contasDoCenario, duplicarCenario, linhaDaTabela, textoDoSePagaEm, type CenarioDaSimulacao } from '@gestor/shared';
import { demoApi } from './demo.js';
import { ApiError } from './types.js';
import { AJUSTES_DO_SIMULADOR_DEMO } from './demo-simulador.js';

const api = demoApi.simulador;
type Quem = 'admin' | 'operador' | 'leitor' | 'camila' | 'diego';
async function entrar(quem: Quem) {
  await demoApi.auth.logout();
  return (await demoApi.auth.login(`${quem}@gestor.local`, 'demo')).user!;
}
async function erroDe(p: Promise<unknown>): Promise<ApiError> {
  try { await p; } catch (e) { if (e instanceof ApiError) return e; throw e; }
  throw new Error('Era para dar erro, e passou.');
}
/** A auditoria (só quem tem a permissão dela lê: entra como o Luan e volta para quem estava). */
async function auditoria(voltar: Quem = 'camila') {
  await entrar('admin');
  // só as do Simulador (a entrada de cada pessoa também vai para a auditoria)
  const a = ((await demoApi.admin.audit({ pageSize: 50 })).items as Array<{ summary: string; entityType: string }>).filter((x) => x.entityType === 'sales_simulation' || x.entityType === 'settings');
  await entrar(voltar);
  return a;
}

describe('os exemplos e quem vê', () => {
  it('quem não tem o Comercial não vê; o Comercial vê e mexe; os Ajustes são de quem cuida', async () => {
    await entrar('operador');
    expect((await erroDe(api.listar())).status).toBe(403);
    await entrar('leitor');
    expect((await erroDe(api.opcoes())).status).toBe(403);
    await entrar('camila');
    expect(await api.opcoes()).toMatchObject({ podeEditar: true, podeCuidar: false, ajustes: { imposto: 6, verde: 35, vermelho: 20, prazo: 24 } });
    await entrar('admin');
    expect(await api.opcoes()).toMatchObject({ podeEditar: true, podeCuidar: true });
  });

  it('as quatro simulações de exemplo, com o sinal de cada uma; os aparelhos da tabela vêm sem valor', async () => {
    await entrar('camila');
    const lista = await api.listar();
    expect(lista.map((s) => [s.nome, s.cenarios, s.principal.sinal, s.negociacao?.codigo ?? null])).toEqual([
      ['Padaria Estrela — 40 ramais', 3, 'verde', expect.stringMatching(/^COM-\d+$/)],
      ['Hotel Beira Mar — URA, filas e LineChat', 1, 'verde', expect.stringMatching(/^COM-\d+$/)],
      ['Clínica Vida — LineChat, 5 atendentes', 1, 'amarelo', null],
      ['Escola Mundo Kids — contraproposta', 1, 'vermelho', expect.stringMatching(/^COM-\d+$/)],
    ]);
    expect(lista.find((s) => s.nome.startsWith('Escola'))!.negociacao!.resultado).toBe('perdido');
    expect(lista.every((s) => s.principal.faltam === 0)).toBe(true);
    const tabela = (await api.opcoes()).ajustes.custos;
    expect(tabela.filter((c) => c.tipo === 'aparelho').every((c) => c.valor === null)).toBe(true);
    // a tabela da Helena (o LineChat) vem de fábrica, com os usuários por faixas
    expect(tabela.find((c) => c.id === 'helena-usuarios')!.faixas).toEqual([{ ate: 3, valor: 0 }, { ate: 20, valor: 1_990 }, { ate: 100, valor: 1_490 }, { ate: null, valor: 1_290 }]);
    // a Clínica Vida: a licença, 5 usuários, 2 canais e 1 conexão Z-API = R$ 289,50 da Helena por mês
    const vida = await api.ler(lista.find((s) => s.nome.startsWith('Clínica Vida'))!.id);
    expect(contasDoCenario(vida.cenarios[0]!, AJUSTES_DO_SIMULADOR_DEMO).custoMensalFixo).toBe(28_950);
    // a Padaria Estrela: os três cenários lado a lado contam diferente
    const estrela = await api.ler(lista[0]!.id);
    const contas = estrela.cenarios.map((c) => contasDoCenario(c, AJUSTES_DO_SIMULADOR_DEMO));
    expect(estrela.cenarios.map((c) => c.nome)).toEqual(['Comodato, 24 meses', 'Telefones vendidos, 12 meses', '10% de desconto, 36 meses']);
    expect(contas[1]!.vendaDeAparelhos).toBe(40 * 45_000);
    expect(contas[1]!.parcelas).toHaveLength(3);
    expect(textoDoSePagaEm(contas[0]!.sePagaEm)).toMatch(/^em \d+ meses$/);
  });

  it('a negociação ligada aparece na ficha dela; quem não tem o Comercial não vê nada', async () => {
    await entrar('diego');
    const hotel = (await api.listar()).find((s) => s.nome.startsWith('Hotel'))!;
    const daFicha = await api.daNegociacao(hotel.negociacao!.id);
    expect(daFicha).toMatchObject([{ id: hotel.id, nome: hotel.nome, cenarios: 1, principal: { sinal: 'verde' } }]);
  });
});

describe('criar, mudar, duplicar e a lixeira (como o servidor)', () => {
  it('a Camila cria a partir de um modelo, liga a uma negociação e muda; a auditoria conta', async () => {
    await entrar('camila');
    const op = await api.opcoes();
    const modelo = op.ajustes.modelos.find((m) => m.nome === 'LineChat (Helena)')!;
    const estrela = (await api.listar()).find((s) => s.nome.startsWith('Padaria'))!;
    const linhas = modelo.linhas.map((l, i) => linhaDaTabela(op.ajustes.custos.find((x) => x.id === l.custoId)!, { id: `l${i}`, qtd: l.qtd, porRamal: l.porRamal }));
    const a: CenarioDaSimulacao = { id: 'a', nome: 'Cenário A', mensalidade: 50_000, ativacao: 45_000, parcelas: 1, prazo: 12, ramais: 0, imposto: 6, margemAlvo: 35, linhas };
    const nova = await api.criar({ nome: 'Pousada Sol Nascente', negociacaoId: estrela.negociacao!.id, cenarios: [a], principal: 'a' });
    expect(nova).toMatchObject({ nome: 'Pousada Sol Nascente', criadoPor: 'Camila Duarte', negociacao: { codigo: estrela.negociacao!.codigo } });
    expect((await auditoria())[0]!.summary).toBe(`Criou a simulação "Pousada Sol Nascente" (ligada à ${estrela.negociacao!.codigo})`);
    // um segundo cenário, 10% mais barato, e o principal passa a ser ele
    const b = { ...duplicarCenario(a, { id: 'b', nome: 'Cenário B' }), mensalidade: 45_000 };
    const mudada = await api.alterar(nova.id, { nome: 'Pousada Sol Nascente', negociacaoId: null, cenarios: [a, b], principal: 'b' });
    expect(mudada).toMatchObject({ principal: 'b', negociacao: null });
    expect((await auditoria())[0]!.summary).toBe('Mudou a simulação "Pousada Sol Nascente": incluiu o Cenário B; o principal passou a ser o Cenário B; desligou da negociação');
    // o que não fecha: a mesma frase do servidor
    const e = await erroDe(api.alterar(nova.id, { nome: 'Pousada Sol Nascente', negociacaoId: null, cenarios: [{ ...a, prazo: 2, parcelas: 6 }], principal: 'a' }));
    expect(e.status).toBe(400);
    expect((e.details as Array<{ message: string }>)[0]!.message).toBe('Cenário A: a ativação vai em até 2 vezes (o prazo do contrato).');
    // duplicar e mandar para a lixeira; volta pela Administração › Lixeira
    const copia = await api.duplicar(nova.id);
    expect(copia.nome).toBe('Pousada Sol Nascente (cópia)');
    await api.remover(copia.id);
    expect((await api.listar()).some((s) => s.id === copia.id)).toBe(false);
    expect((await erroDe(api.ler(copia.id))).status).toBe(404);
    await entrar('admin');
    const lixo = (await demoApi.admin.trash()).find((x) => x.id === copia.id);
    expect(lixo).toMatchObject({ type: 'salesSimulation', label: 'Simulação · Pousada Sol Nascente (cópia)' });
    await demoApi.admin.restore('salesSimulation', copia.id);
    expect((await api.ler(copia.id)).nome).toBe('Pousada Sol Nascente (cópia)');
    expect((await auditoria('admin'))[0]!.summary).toBe('Restaurou a simulação "Pousada Sol Nascente (cópia)" do Comercial da lixeira');
  });

  it('ligar uma negociação que a pessoa não vê, ou um chamado do Suporte, não dá', async () => {
    await entrar('camila');
    const s = (await api.listar()).find((x) => x.nome.startsWith('Clínica Vida'))!;
    const vida = await api.ler(s.id);
    const corpo = (negociacaoId: string) => ({ nome: vida.nome, negociacaoId, cenarios: vida.cenarios, principal: vida.principal });
    const e = await erroDe(api.alterar(vida.id, corpo('nao-existe')));
    expect(e.message).toBe('Essa negociação não existe ou é de um painel que você não vê: confira o código (COM-12).');
    const sup = await demoApi.atendimento.chamado('SUP-12');
    expect((await erroDe(api.alterar(vida.id, corpo(sup.id)))).status).toBe(400);
    // o Diego não vê o painel de escolhidos de outra pessoa; a Camila vê o Comercial: a negociação do Hotel (do Diego) ela vê
    const hotel = (await api.listar()).find((x) => x.nome.startsWith('Hotel'))!;
    expect(hotel.negociacao).not.toBeNull();
  });

  it('o Leitor do Comercial não existe na prévia; quem só vê o Comercial (sem trabalhar) não cria', async () => {
    await entrar('admin');
    const papeis = await demoApi.admin.roles();
    const so = await demoApi.admin.createRole({ name: 'Só o Comercial', description: 'lê', permissions: ['records.read', 'sales.read'] });
    await demoApi.admin.createUser({ name: 'Rita Lima', email: 'rita@gestor.local', password: 'demo', roleId: so.id });
    expect(papeis.length).toBeGreaterThan(0);
    await demoApi.auth.logout();
    await demoApi.auth.login('rita@gestor.local', 'demo');
    expect((await api.opcoes()).podeEditar).toBe(false);
    expect((await api.listar()).length).toBeGreaterThan(0);
    const e = await erroDe(api.duplicar((await api.listar())[0]!.id));
    expect([e.status, e.message]).toEqual([403, 'Esta ação exige a permissão "tickets.work"']);
  });

  it('os Ajustes: quem cuida grava; a validação e a auditoria do servidor', async () => {
    await entrar('camila');
    const op = await api.opcoes();
    expect((await erroDe(api.salvarAjustes(op.ajustes))).status).toBe(403);
    await entrar('admin');
    const e = await erroDe(api.salvarAjustes({ ...op.ajustes, verde: 10, vermelho: 30 }));
    expect((e.details as Array<{ message: string }>)[0]!.message).toBe('O vermelho começa abaixo do verde: o amarelo fica entre os dois.');
    const r = await api.salvarAjustes({ ...op.ajustes, imposto: 8 });
    expect(r.imposto).toBe(8);
    expect((await auditoria('admin'))[0]!.summary).toBe('Mudou nos Ajustes do Simulador: o imposto de 6% para 8%');
    await api.salvarAjustes({ ...op.ajustes, imposto: 6 });
  });
});
