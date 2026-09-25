import { describe, expect, it } from 'vitest';
import {
  agruparItens, aplicarFiltros, atualizarPainelGuardado, comFechamento, diaEmBrasilia, etapasDaEquipe, FiltrosChamadosSchema, horaEmBrasilia,
  ItemPainelSchema, listarChamados, ListaChamadosSchema, montarPainel, PainelChamadosSchema, painelPadrao, PREFIXO_GRUPO, resumirChamados,
  rotuloQuando, sugerirGrupos, textoDoCard, VAZIO, type Chamado, type ContextoChamados, type ItemPainel, type ItemRanking, type MovimentoChamado,
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

  it('"só em aberto" com o período inteiro é o que a antiga aba Em aberto mostrava', () => {
    // o atalho Tudo começa no dia do chamado mais antigo
    expect(resumirChamados(cards, f({ aba: 'periodo' }), ctx).primeiroDia).toBe('2026-09-20');
    const r = resumirChamados(cards, f({ aba: 'periodo', de: '2026-09-20', ate: '2026-09-23', emAberto: 'true' }), ctx);
    expect(r.total).toBe(3);
    expect(r.kpis.map((k) => k.id)).toEqual(['em-aberto', 'vencidos', 'parados', 'sem-responsavel']);
    expect(r.kpis[0]).toMatchObject({ valor: '3', sub: 'de qualquer data', total: true });
    expect(r.serie.titulo).toBe('Em aberto, pelo dia em que foram abertos');
    expect(r.serie.pontos.find((p) => p.id === '2026-09-22')!.n).toBe(1); // o das 22h de ontem
    expect(r.serie.pontos.find((p) => p.id === '2026-09-23')!.n).toBe(2);
    // com um período menor, o número diz que é só daquele pedaço
    expect(resumirChamados(cards, f({ aba: 'periodo', de: '2026-09-23', ate: '2026-09-23', emAberto: 'true' }), ctx).kpis[0]!.sub).toBe('dos abertos no período');
  });

  it('na aba Hoje, o "só em aberto" deixa de fora o que já fechou e troca os números de cima', () => {
    const hoje = [...cards, card({ stepId: 'tratado', stepPhase: 'FINAL', closedAt: '2026-09-23T14:30:00Z' })];
    expect(resumirChamados(hoje, f({ aba: 'hoje' }), ctx).total).toBe(3);
    const r = resumirChamados(hoje, f({ aba: 'hoje', emAberto: 'true' }), ctx);
    expect(r.total).toBe(2);
    expect(r.kpis.map((k) => k.id)).toEqual(['abertos-hoje', 'sem-responsavel', 'vencidos', 'em-aberto']);
    expect(r.serie.titulo).toBe('Abertos hoje e ainda em aberto, por hora');
    // "em aberto agora" de qualquer dia leva para o Período inteiro, com o interruptor ligado
    expect(r.kpis.find((k) => k.id === 'em-aberto')!.filtro).toEqual({ aba: 'periodo', tudo: true, emAberto: true });
  });

  it('endereço antigo com a aba "abertos" cai na aba Hoje, sem erro', () => {
    expect(f({ aba: 'abertos' }).aba).toBe('hoje');
    expect(f({ situacao: 'abertos' }).situacao).toBeUndefined();
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

  it('só em aberto: o dia clicado, e os números de cima clicados', () => {
    const emAberto = { aba: 'periodo', de: '2026-09-01', ate: '2026-09-23', emAberto: 'true' };
    const dia = resumirChamados(cards, f({ ...emAberto, quando: '2026-09-10' }), ctx);
    expect(dia.total).toBe(1);
    expect(dia.serie.pontos.find((p) => p.id === '2026-09-23')).toMatchObject({ n: 3 });
    expect(dia.serie.pontos.find((p) => p.id === '2026-09-10')).toMatchObject({ n: 1, selecionado: true });
    const parados = resumirChamados(cards, f({ ...emAberto, situacao: 'parados' }), ctx);
    expect(parados.total).toBe(1);
    expect(parados.kpis.find((k) => k.id === 'parados')).toMatchObject({ valor: '1', ativo: true });
    // os números de cima não mudam com a própria escolha
    expect(parados.kpis.find((k) => k.id === 'em-aberto')).toMatchObject({ valor: '4', total: true });
    expect(resumirChamados(cards, f({ ...emAberto, situacao: 'sem-responsavel' }), ctx).total).toBe(1);
    expect(resumirChamados(cards, f({ ...emAberto, situacao: 'vencidos' }), ctx).total).toBe(1);
    // situação que não existe (endereço antigo) é ignorada
    expect(resumirChamados(cards, f({ ...emAberto, situacao: 'qualquer' }), ctx).total).toBe(4);
    // sem o interruptor, "Ainda em aberto" é o número que o liga
    const periodo = resumirChamados(cards, f({ aba: 'periodo', de: '2026-09-01', ate: '2026-09-23' }), ctx);
    expect(periodo.kpis.find((k) => k.id === 'ainda-abertos')).toMatchObject({ valor: '4', filtro: { emAberto: true } });
  });

  it('"Fechados hoje" troca a pergunta: o que foi fechado hoje, pela hora do fechamento', () => {
    const r = resumirChamados(cards, f({ aba: 'hoje', situacao: 'fechados' }), ctx);
    expect(r.total).toBe(1);
    expect(r.serie.titulo).toMatch(/fechados/);
    expect(r.serie.pontos[13]!.n).toBe(1);
    expect(r.kpis.find((k) => k.id === 'fechados-hoje')).toMatchObject({ valor: '1', ativo: true });
    expect(r.kpis.find((k) => k.id === 'abertos-hoje')!.valor).toBe('3');
    // o "Vencidos" de qualquer dia leva para o Período inteiro, só em aberto, só os vencidos
    expect(r.kpis.find((k) => k.id === 'vencidos')!.filtro).toEqual({ aba: 'periodo', tudo: true, emAberto: true, situacao: 'vencidos' });
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

  it('de fábrica: o do tempo na linha inteira, os campos na ordem, todos os de lista em pizza', () => {
    expect(painelPadrao(campos).map((x) => [x.id, x.largura, x.forma ?? '-'])).toEqual([
      ['serie', 'inteira', '-'], ['etapa', 'metade', 'pizza'], ['responsavel', 'metade', 'pizza'],
      ['campo:cliente-71', 'metade', 'pizza'], ['campo:plataforma', 'metade', 'pizza'], ['etiqueta', 'metade', 'pizza'],
    ]);
  });

  it('a arrumação guardada no 1.3 (barras era o padrão) passa a abrir em pizza; a do 1.4 fica como está', () => {
    const antiga: { versao?: number; itens: ItemPainel[] } = { itens: [{ id: 'serie', largura: 'inteira', oculto: false }, { id: 'etapa', largura: 'metade', oculto: false, forma: 'barras' }] };
    const nova = atualizarPainelGuardado(antiga);
    expect(nova.versao).toBe(2);
    expect(nova.itens.map((x) => x.forma ?? '-')).toEqual(['-', 'pizza']);
    const doUmQuatro = { versao: 2, itens: [{ id: 'etapa', largura: 'metade' as const, oculto: false, forma: 'barras' as const }] };
    expect(atualizarPainelGuardado(doUmQuatro).itens[0]!.forma).toBe('barras');
  });

  it('grupos: uma opção num grupo só, nomes diferentes, e ao menos duas opções por grupo', () => {
    const base = { id: 'campo:assunto', largura: 'metade' };
    const ramal = { id: 'g1', nome: 'Ramal', valores: ['Ramal - Criação', 'Ramal - Configuração'] };
    expect(ItemPainelSchema.safeParse({ ...base, grupos: [ramal] }).success).toBe(true);
    expect(ItemPainelSchema.safeParse({ ...base, grupos: [ramal, { id: 'g2', nome: 'Outro', valores: ['Ramal - Criação', 'URA'] }] }).success).toBe(false);
    expect(ItemPainelSchema.safeParse({ ...base, grupos: [ramal, { id: 'g2', nome: 'ramal', valores: ['URA', 'Fila'] }] }).success).toBe(false);
    expect(ItemPainelSchema.safeParse({ ...base, grupos: [{ id: 'g3', nome: 'Só um', valores: ['URA'] }] }).success).toBe(false);
    // o gráfico do tempo não leva grupos nem forma
    expect(montarPainel([{ id: 'serie', largura: 'metade', oculto: false, forma: 'pizza', grupos: [ramal] }], campos)[0]).toEqual({ id: 'serie', largura: 'metade', oculto: false });
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
    // sem forma guardada, vale a de fábrica (pizza, desde o 1.4)
    expect(p[1]).toMatchObject({ oculto: true, forma: 'pizza' });
  });

  it('a arrumação recusa gráfico repetido e gráfico que não existe', () => {
    expect(PainelChamadosSchema.safeParse({ itens: [{ id: 'etapa', largura: 'metade' }, { id: 'etapa', largura: 'inteira' }] }).success).toBe(false);
    expect(PainelChamadosSchema.safeParse({ itens: [{ id: 'qualquer', largura: 'metade' }] }).success).toBe(false);
    expect(PainelChamadosSchema.parse({ itens: [{ id: 'campo:cliente-71', largura: 'metade' }] }).itens[0]!.oculto).toBe(false);
  });
});

describe('as etapas que fecham o chamado (escolhidas pela equipe)', () => {
  const obs = { id: 'obs', title: 'Em Observação', position: 3, isInitial: false, isFinal: false, archived: false };
  const todas = [...etapas.slice(0, 2), obs, etapas[2]!];
  const mov = (fromStepId: string | null, toStepId: string, at: string, estimated = false): MovimentoChamado => ({ fromStepId, toStepId, at, estimated });

  it('sem escolha valem as finais do LineChat; com escolha, as marcadas; lista sem etapa que exista é ignorada', () => {
    expect(etapasDaEquipe(todas, null).filter((e) => e.isFinal).map((e) => e.id)).toEqual(['tratado']);
    expect(etapasDaEquipe(todas, ['obs', 'tratado']).filter((e) => e.isFinal).map((e) => e.id)).toEqual(['obs', 'tratado']);
    expect(etapasDaEquipe(todas, ['apagada']).filter((e) => e.isFinal).map((e) => e.id)).toEqual(['tratado']);
  });

  it('a hora do fechamento sai do histórico: o começo da última sequência em etapas que fecham', () => {
    const eq = etapasDaEquipe(todas, ['obs', 'tratado']);
    const historico = new Map<string, MovimentoChamado[]>([
      // N1 → Observação (10h) → Tratado (12h): fechado desde as 10h
      ['a', [mov(null, 'n1', '2026-09-20T12:00:00Z', true), mov('n1', 'obs', '2026-09-22T13:00:00Z'), mov('obs', 'tratado', '2026-09-22T15:00:00Z')]],
      // foi para Observação, voltou para o N1 e fechou de novo: vale a última vez
      ['b', [mov(null, 'n1', '2026-09-20T12:00:00Z'), mov('n1', 'obs', '2026-09-21T12:00:00Z'), mov('obs', 'n1', '2026-09-21T15:00:00Z'), mov('n1', 'tratado', '2026-09-23T11:00:00Z')]],
      // já estava na Observação antes da primeira leitura: hora estimada
      ['c', [mov(null, 'obs', '2026-09-19T12:00:00Z', true)]],
    ]);
    const [a, b, c, d] = comFechamento([
      card({ id: 'a', stepId: 'tratado', closedAt: '2026-09-22T15:00:00Z' }),
      card({ id: 'b', stepId: 'tratado', closedAt: '2026-09-23T11:00:00Z' }),
      card({ id: 'c', stepId: 'obs' }),
      // na prévia não há histórico: fechado por etapa que o LineChat não chama de final usa a última alteração
      card({ id: 'd', stepId: 'obs', updatedAt: '2026-09-18T10:00:00Z' }),
    ], eq, historico);
    expect([a!.closedAt, a!.closedEstimated]).toEqual(['2026-09-22T13:00:00Z', false]);
    expect(b!.closedAt).toBe('2026-09-23T11:00:00Z');
    expect([c!.closedAt, c!.closedEstimated]).toEqual(['2026-09-19T12:00:00Z', true]);
    expect([d!.closedAt, d!.closedEstimated]).toEqual(['2026-09-18T10:00:00Z', true]);
    // e as contas passam a considerar Observação como fechado
    const r = resumirChamados([a!, b!, c!, d!], FiltrosChamadosSchema.parse({ aba: 'periodo', de: '2026-09-01', ate: '2026-09-23' }), { ...ctx, etapas: eq });
    expect(r.kpis.find((k) => k.id === 'ainda-abertos')!.valor).toBe('0');
    expect(r.kpis.find((k) => k.id === 'fechados')!.valor).toBe('4');
  });

  it('card que nasceu e fechou entre duas leituras fica com a hora que a sincronização gravou', () => {
    const [x] = comFechamento(
      [card({ id: 'x', stepId: 'tratado', createdAt: '2026-09-23T13:00:00Z', closedAt: '2026-09-23T13:00:40Z' })],
      etapas, new Map([['x', [mov(null, 'tratado', '2026-09-23T13:00:00Z')]]]),
    );
    expect(x!.closedAt).toBe('2026-09-23T13:00:40Z');
  });
});

describe('a descrição do card', () => {
  it('sai sem as marcas do editor, com as quebras de linha, e cortada na tabela', () => {
    expect(textoDoCard('<p>Ramal 9871 <b>sem áudio</b></p><p>Cliente &amp; filial&nbsp;2</p>')).toBe('Ramal 9871 sem áudio\nCliente & filial 2');
    expect(textoDoCard('<ul><li>um</li><li>dois</li></ul>')).toBe('• um\n• dois');
    expect(textoDoCard('valor < 10 e > 5')).toBe('valor < 10 e > 5');
    expect(textoDoCard(null)).toBe('');
    expect(textoDoCard('abcdefghij', 4)).toBe('abcd…');
    const l = listarChamados([card({ description: '<p>Troca de <i>aparelho</i></p>' })], ListaChamadosSchema.parse({ aba: 'hoje' }), ctx, () => '');
    expect(l.items[0]!.descricao).toBe('Troca de aparelho');
    // a busca olha o texto, não as marcas
    expect(aplicarFiltros([card({ description: '<p>x</p>' })], FiltrosChamadosSchema.parse({ busca: 'p' })).length).toBe(0);
  });
});

describe('grupos num gráfico', () => {
  const itens: ItemRanking[] = [
    { valor: 'Ramal - Configuração', rotulo: 'Ramal - Configuração', n: 55 },
    { valor: 'Ramal - Telefone Sem Serviço', rotulo: 'Ramal - Telefone Sem Serviço', n: 29 },
    { valor: 'Tronco - Rota', rotulo: 'Tronco - Rota', n: 40 },
    { valor: 'Ramal - Criação', rotulo: 'Ramal - Criação', n: 24, selecionado: true },
    { valor: VAZIO, rotulo: 'Não preenchido', n: 3 },
  ];
  const ramal = { id: 'g1', nome: 'Ramal', valores: ['Ramal - Configuração', 'Ramal - Telefone Sem Serviço', 'Ramal - Criação', 'Ramal - Outro'] };

  it('os valores do grupo viram um ponto só, com a soma; o grupo fica em destaque se algum estiver no filtro', () => {
    const r = agruparItens(itens, [ramal]);
    expect(r.map((x) => [x.valor, x.n])).toEqual([[`${PREFIXO_GRUPO}g1`, 108], ['Tronco - Rota', 40], [VAZIO, 3]]);
    expect(r[0]!.selecionado).toBe(true);
    expect(r[0]!.grupo!.membros.map((m) => m.n)).toEqual([55, 29, 24]);
    // o grupo lembra todos os valores dele, mesmo o que não apareceu agora (clicar filtra por todos)
    expect(r[0]!.grupo!.valores).toHaveLength(4);
    // sem grupos, nada muda
    expect(agruparItens(itens, [])).toBe(itens);
  });

  it('sugestão pelo começo do nome: junta dois ou mais, ignora maiúscula e acento, pula quem já tem grupo', () => {
    const opcoes = ['Ramal - Configuração', 'Ramal - Criação', 'LineChat - Ajuste', 'Linechat - Criação Login', 'Linechat - Disparos', 'Wi-Fi fora', 'Armazenamento Lotado', 'URA - Ajuste']
      .map((v) => ({ valor: v, rotulo: v }));
    expect(sugerirGrupos(opcoes)).toEqual([
      { nome: 'Linechat', valores: ['LineChat - Ajuste', 'Linechat - Criação Login', 'Linechat - Disparos'] },
      { nome: 'Ramal', valores: ['Ramal - Configuração', 'Ramal - Criação'] },
    ]);
    expect(sugerirGrupos(opcoes, new Set(['Ramal - Criação'])).map((g) => g.nome)).toEqual(['Linechat']);
  });
});
