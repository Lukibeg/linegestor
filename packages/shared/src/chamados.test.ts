import { describe, expect, it } from 'vitest';
import {
  aplicarFiltros, diaEmBrasilia, FiltrosChamadosSchema, horaEmBrasilia, listarChamados, ListaChamadosSchema, montarPainel,
  PainelChamadosSchema, painelPadrao, resumirChamados, rotuloQuando, VAZIO, type Chamado, type ContextoChamados,
} from './chamados.js';

const etapas = [
  { id: 'novo', title: 'Novos Suporte', position: 1, isInitial: true, isFinal: false, archived: false },
  { id: 'n1', title: 'Em Tratativa N1', position: 2, isInitial: false, isFinal: false, archived: false },
  { id: 'tratado', title: 'Chamado Tratado', position: 3, isInitial: false, isFinal: true, archived: false },
];
const campos = [
  { key: 'cliente-71', name: 'Cliente', type: 'SINGLESELECT', position: 2, options: ['Alfa', 'Beta'], archived: false },
  { key: 'observador', name: 'Observadores', type: 'MULTISELECT', position: 8, options: ['Ana', 'Rui'], archived: false },
  { key: 'livre', name: 'Texto', type: 'TEXT', position: 9, options: [], archived: false },
];
const etiquetas = [{ id: 'alta', name: 'P/ Alta', color: 'rgb(255,0,0)', archived: false }];
// quarta-feira, 23/09/2026, 15h em Brasília
const agora = new Date('2026-09-23T18:00:00Z');
const ctx: ContextoChamados = { etapas, campos, etiquetas, agora };

let n = 0;
function card(p: Partial<Chamado>): Chamado {
  n++;
  return {
    id: `c${n}`, key: `IS-${n}`, number: n, title: `Chamado ${n}`, description: null,
    stepId: 'novo', stepTitle: 'Novos Suporte', stepPhase: 'INITIAL', status: 'OPEN', responsavel: 'Lucio',
    createdAt: '2026-09-23T13:00:00Z', updatedAt: '2026-09-23T13:00:00Z', closedAt: null, closedEstimated: false,
    dueDate: null, isOverdue: false, tagIds: [], campos: {}, ...p,
  };
}

describe('datas no horário de Brasília', () => {
  it('um chamado das 22h30 de terça é de terça, mesmo já sendo quarta em UTC', () => {
    expect(diaEmBrasilia('2026-09-23T01:30:00Z')).toBe('2026-09-22');
    expect(horaEmBrasilia('2026-09-23T01:30:00Z')).toBe(22);
  });
});

describe('filtros e contas', () => {
  const cards = [
    card({ campos: { 'cliente-71': 'Alfa', observador: ['Ana', 'Rui'] }, tagIds: ['alta'] }),
    card({ campos: { 'cliente-71': 'Beta' }, stepId: 'n1', stepTitle: 'Em Tratativa N1', responsavel: null }),
    card({ campos: {}, createdAt: '2026-09-20T12:00:00Z', stepId: 'tratado', stepPhase: 'FINAL', closedAt: '2026-09-23T14:00:00Z' }),
    card({ status: 'ARCHIVED', campos: { 'cliente-71': 'Alfa' } }),
    // aberto às 22h de ontem (em UTC já é hoje): não é de hoje
    card({ createdAt: '2026-09-23T01:00:00Z', isOverdue: true }),
  ];
  const f = (q: Record<string, unknown>) => FiltrosChamadosSchema.parse(q);

  it('Hoje conta só os abertos hoje (em Brasília) e deixa os arquivados de fora', () => {
    const r = resumirChamados(cards, f({ aba: 'hoje' }), ctx);
    expect(r.total).toBe(2);
    expect(r.kpis.find((k) => k.id === 'fechados-hoje')!.valor).toBe('1');
    expect(r.kpis.find((k) => k.id === 'em-aberto')!.valor).toBe('3');
    expect(r.kpis.find((k) => k.id === 'vencidos')!.valor).toBe('1');
    expect(r.serie.pontos[10]!.n).toBe(2); // 13h UTC = 10h em Brasília
  });

  it('campo de lista vira ranking; o não preenchido fica no fim; múltipla escolha conta cada valor', () => {
    const r = resumirChamados(cards, f({ aba: 'periodo', de: '2026-09-01', ate: '2026-09-30' }), ctx);
    const cliente = r.porCampo.find((c) => c.key === 'cliente-71')!;
    expect(cliente.itens.map((i) => [i.rotulo, i.n])).toEqual([['Alfa', 1], ['Beta', 1], ['Não preenchido', 2]]);
    const obs = r.porCampo.find((c) => c.key === 'observador')!;
    expect(obs.multiplo).toBe(true);
    expect(obs.itens.filter((i) => i.valor !== VAZIO).map((i) => i.n)).toEqual([1, 1]);
    expect(r.porCampo.some((c) => c.key === 'livre')).toBe(false);
    // etapa fica na ordem do Kanban
    expect(r.porEtapa.map((e) => e.valor)).toEqual(['novo', 'n1', 'tratado']);
  });

  it('filtro de campo (E entre campos, OU dentro do campo), vazio e arquivados', () => {
    expect(aplicarFiltros(cards, f({ campo: ['cliente-71=Alfa'] })).length).toBe(1);
    expect(aplicarFiltros(cards, f({ campo: ['cliente-71=Alfa', 'cliente-71=Beta'] })).length).toBe(2);
    expect(aplicarFiltros(cards, f({ campo: ['cliente-71=Alfa'], arquivados: 'true' })).length).toBe(2);
    expect(aplicarFiltros(cards, f({ campo: `cliente-71=${VAZIO}` })).length).toBe(2);
    expect(aplicarFiltros(cards, f({ responsavel: VAZIO })).length).toBe(1);
    expect(aplicarFiltros(cards, f({ busca: 'chamado 2' })).length).toBe(1);
  });

  it('Em aberto: tudo fora das etapas finais, e a série diz há quanto tempo', () => {
    const r = resumirChamados(cards, f({ aba: 'abertos' }), ctx);
    expect(r.total).toBe(3);
    expect(r.serie.pontos.find((p) => p.id === 'hoje')!.n).toBe(2);
    expect(r.serie.pontos.find((p) => p.id === '1')!.n).toBe(1);
  });

  it('a tabela ordena, pagina e leva o link do card', () => {
    const q = ListaChamadosSchema.parse({ aba: 'periodo', de: '2026-09-01', ate: '2026-09-30', sort: 'numero', dir: 'asc', pageSize: '2' });
    const l = listarChamados(cards, q, ctx, (c) => `https://x/card/${c.key}`);
    expect(l.total).toBe(4);
    expect(l.items.length).toBe(2);
    expect(l.items[0]!.key).toBe('IS-1');
    expect(l.items[0]!.link).toBe('https://x/card/IS-1');
    expect(l.items[0]!.campos.observador).toBe('Ana, Rui');
    expect(l.items[0]!.etiquetas[0]!.name).toBe('P/ Alta');
  });

  it('período longo passa a somar por mês', () => {
    const r = resumirChamados(cards, f({ aba: 'periodo', de: '2026-01-01', ate: '2026-09-30' }), ctx);
    expect(r.serie.pontos.length).toBe(9);
    expect(r.serie.pontos.at(-1)!.rotulo).toBe('set/26');
  });
});

describe('clicar filtra, e o gráfico clicado continua inteiro', () => {
  const cards = [
    card({ campos: { 'cliente-71': 'Alfa' }, createdAt: '2026-09-23T12:10:00Z' }), // 09h de hoje
    card({ campos: { 'cliente-71': 'Alfa' }, createdAt: '2026-09-23T13:20:00Z', responsavel: null }), // 10h
    card({ campos: { 'cliente-71': 'Beta' }, createdAt: '2026-09-23T13:40:00Z', stepId: 'n1', stepTitle: 'Em Tratativa N1' }), // 10h
    // aberto há 13 dias, ninguém mexeu, vencido
    card({ campos: { 'cliente-71': 'Beta' }, createdAt: '2026-09-10T15:00:00Z', updatedAt: '2026-09-10T15:00:00Z', isOverdue: true }),
    // aberto no dia 21 e fechado hoje às 13h30
    card({ campos: { 'cliente-71': 'Alfa' }, createdAt: '2026-09-21T15:00:00Z', stepId: 'tratado', stepPhase: 'FINAL', closedAt: '2026-09-23T16:30:00Z' }),
  ];
  const f = (q: Record<string, unknown>) => FiltrosChamadosSchema.parse(q);

  it('clicou num cliente: o gráfico de cliente continua com todos, o escolhido marcado; o resto obedece', () => {
    const r = resumirChamados(cards, f({ aba: 'hoje', campo: 'cliente-71=Alfa' }), ctx);
    const cli = r.porCampo.find((c) => c.key === 'cliente-71')!.itens;
    expect(cli.map((i) => [i.valor, i.n, !!i.selecionado])).toEqual([['Alfa', 2, true], ['Beta', 1, false]]);
    expect(r.total).toBe(2);
    expect(r.porResponsavel.reduce((a, x) => a + x.n, 0)).toBe(2);
    expect(r.kpis.find((k) => k.id === 'abertos-hoje')!.valor).toBe('2');
  });

  it('a hora clicada filtra a tela; o gráfico do tempo continua com o dia inteiro', () => {
    const r = resumirChamados(cards, f({ aba: 'hoje', quando: '10' }), ctx);
    expect(r.total).toBe(2);
    expect(r.serie.pontos[9]).toMatchObject({ n: 1 });
    expect(r.serie.pontos[9]!.selecionado).toBeUndefined();
    expect(r.serie.pontos[10]).toMatchObject({ n: 2, selecionado: true });
    expect(r.porCampo.find((c) => c.key === 'cliente-71')!.itens.map((i) => [i.valor, i.n])).toEqual([['Alfa', 1], ['Beta', 1]]);
    expect(rotuloQuando('9', f({ aba: 'hoje' }))).toEqual({ nome: 'Hora', valor: '09h' });
  });

  it('Em aberto: a faixa de idade clicada, e os números de cima clicados', () => {
    const idade = resumirChamados(cards, f({ aba: 'abertos', quando: '8-15' }), ctx);
    expect(idade.total).toBe(1);
    expect(idade.serie.pontos.find((p) => p.id === 'hoje')).toMatchObject({ n: 3 });
    expect(idade.serie.pontos.find((p) => p.id === '8-15')).toMatchObject({ n: 1, selecionado: true });
    const parados = resumirChamados(cards, f({ aba: 'abertos', situacao: 'parados' }), ctx);
    expect(parados.total).toBe(1);
    expect(parados.kpis.find((k) => k.id === 'parados')).toMatchObject({ valor: '1', ativo: true });
    // os números de cima não mudam com a própria escolha
    expect(parados.kpis.find((k) => k.id === 'em-aberto')).toMatchObject({ valor: '4', total: true });
    expect(resumirChamados(cards, f({ aba: 'abertos', situacao: 'sem-responsavel' }), ctx).total).toBe(1);
    expect(resumirChamados(cards, f({ aba: 'abertos', situacao: 'vencidos' }), ctx).total).toBe(1);
    // situação que não existe (endereço antigo) é ignorada
    expect(resumirChamados(cards, f({ aba: 'abertos', situacao: 'qualquer' }), ctx).total).toBe(4);
  });

  it('"Fechados hoje" troca a pergunta: o que foi fechado hoje, pela hora do fechamento', () => {
    const r = resumirChamados(cards, f({ aba: 'hoje', situacao: 'fechados' }), ctx);
    expect(r.total).toBe(1);
    expect(r.serie.titulo).toMatch(/fechados/);
    expect(r.serie.pontos[13]!.n).toBe(1);
    expect(r.kpis.find((k) => k.id === 'fechados-hoje')).toMatchObject({ valor: '1', ativo: true });
    expect(r.kpis.find((k) => k.id === 'abertos-hoje')!.valor).toBe('3');
    // o "Em aberto agora" de qualquer dia leva para a outra aba
    expect(r.kpis.find((k) => k.id === 'vencidos')!.filtro).toEqual({ aba: 'abertos', situacao: 'vencidos' });
    // aqui, a hora clicada é a do fechamento
    expect(resumirChamados(cards, f({ aba: 'hoje', situacao: 'fechados', quando: '13' }), ctx).total).toBe(1);
    expect(resumirChamados(cards, f({ aba: 'hoje', situacao: 'fechados', quando: '10' }), ctx).total).toBe(0);
    expect(rotuloQuando('13', f({ aba: 'hoje', situacao: 'fechados' }))).toEqual({ nome: 'Fechado às', valor: '13h' });
  });

  it('no Período, o dia e o mês clicados; o que não serve para a aba é ignorado', () => {
    const setembro = { aba: 'periodo', de: '2026-09-01', ate: '2026-09-30' };
    const dia = resumirChamados(cards, f({ ...setembro, quando: '2026-09-10' }), ctx);
    expect(dia.total).toBe(1);
    expect(dia.serie.pontos.find((p) => p.id === '2026-09-10')).toMatchObject({ n: 1, selecionado: true });
    expect(dia.serie.pontos.find((p) => p.id === '2026-09-23')!.n).toBe(3);
    const mes = resumirChamados(cards, f({ aba: 'periodo', de: '2026-01-01', ate: '2026-09-30', quando: '2026-09' }), ctx);
    expect(mes.total).toBe(5);
    expect(mes.serie.pontos.at(-1)).toMatchObject({ id: '2026-09', selecionado: true });
    expect(resumirChamados(cards, f({ ...setembro, quando: '10' }), ctx).total).toBe(5);
    // a tabela obedece ao que foi clicado
    const l = listarChamados(cards, ListaChamadosSchema.parse({ ...setembro, quando: '2026-09-10' }), ctx, () => '');
    expect(l.items.map((x) => x.isOverdue)).toEqual([true]);
  });

  it('o escolhido que zerou com os outros filtros continua à vista, com 0', () => {
    const r = resumirChamados(cards, f({ aba: 'hoje', campo: 'cliente-71=Beta', responsavel: VAZIO }), ctx);
    expect(r.total).toBe(0);
    expect(r.porResponsavel.map((i) => [i.valor, i.n, !!i.selecionado])).toEqual([['Lucio', 1, false], [VAZIO, 0, true]]);
  });
});

describe('arrumação da tela', () => {
  const campos = [{ key: 'cliente-71' }, { key: 'plataforma' }];

  it('de fábrica: o do tempo na linha inteira, os campos na ordem, Produto em pizza', () => {
    expect(painelPadrao(campos).map((x) => [x.id, x.largura, x.forma ?? '-'])).toEqual([
      ['serie', 'inteira', '-'], ['etapa', 'metade', 'barras'], ['responsavel', 'metade', 'barras'],
      ['campo:cliente-71', 'metade', 'barras'], ['campo:plataforma', 'metade', 'pizza'], ['etiqueta', 'metade', 'barras'],
    ]);
  });

  it('o guardado manda; o que saiu do LineChat some; o que é novo entra no fim; repetido conta uma vez', () => {
    const p = montarPainel([
      { id: 'campo:plataforma', largura: 'inteira', oculto: false, forma: 'barras' },
      { id: 'campo:antigo', largura: 'metade', oculto: false },
      { id: 'etiqueta', largura: 'metade', oculto: true },
      { id: 'campo:plataforma', largura: 'metade', oculto: true },
    ], campos);
    expect(p.map((x) => x.id)).toEqual(['campo:plataforma', 'etiqueta', 'serie', 'etapa', 'responsavel', 'campo:cliente-71']);
    expect(p[0]).toMatchObject({ largura: 'inteira', forma: 'barras', oculto: false });
    expect(p[1]).toMatchObject({ oculto: true, forma: 'barras' });
  });

  it('a arrumação recusa gráfico repetido e gráfico que não existe', () => {
    expect(PainelChamadosSchema.safeParse({ itens: [{ id: 'etapa', largura: 'metade' }, { id: 'etapa', largura: 'inteira' }] }).success).toBe(false);
    expect(PainelChamadosSchema.safeParse({ itens: [{ id: 'qualquer', largura: 'metade' }] }).success).toBe(false);
    expect(PainelChamadosSchema.parse({ itens: [{ id: 'campo:cliente-71', largura: 'metade' }] }).itens[0]!.oculto).toBe(false);
  });
});
