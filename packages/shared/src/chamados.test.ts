import { describe, expect, it } from 'vitest';
import {
  aplicarFiltros, diaEmBrasilia, FiltrosChamadosSchema, horaEmBrasilia, listarChamados, ListaChamadosSchema, resumirChamados,
  VAZIO, type Chamado, type ContextoChamados,
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
