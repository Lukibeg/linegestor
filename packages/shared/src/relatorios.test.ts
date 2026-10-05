import { describe, expect, it } from 'vitest';
import { type Chamado, type MovimentoChamado } from './chamados.js';
import {
  AjustesRelatoriosSchema, ajustesParaTela, ArrumacaoRelatoriosSchema, caminhoDoChamado, CATALOGO_RELATORIOS, causaPeloNome, montarArrumacao, camposDosRelatorios, chamadosDaPeca, ChamadosDaPecaSchema, duracaoLegivel, FiltrosRelatoriosSchema,
  ligarClientes, mediana, mesDoFechamento, nivelDaEtapa, nomeComparavel, opcoesDoCliente, percentil, raioXChamados, relatoriosChamados,
  type ContextoRelatorios,
} from './relatorios.js';

const etapas = [
  { id: 'novo', title: 'Novos Suporte', position: 1, isInitial: true, isFinal: false, archived: false },
  { id: 'n1', title: 'Chamado Em Tratativa N1', position: 2, isInitial: false, isFinal: false, archived: false },
  { id: 'n2', title: 'Chamado Em Tratativa N2', position: 3, isInitial: false, isFinal: false, archived: false },
  { id: 'n3', title: 'Chamado Em Tratativa N3', position: 4, isInitial: false, isFinal: false, archived: false },
  { id: 'tratado', title: 'Chamado Tratado Suporte', position: 5, isInitial: false, isFinal: true, archived: false },
];
const campos = [
  { key: 'cliente-71', name: 'Cliente', type: 'SINGLESELECT', position: 2, options: ['Alfa', 'Beta Ltda'], archived: false },
  { key: 'tipo-de-chamado-24', name: 'Tipo de chamado', type: 'SINGLESELECT', position: 3, options: ['Configuração', 'Correção'], archived: false },
  { key: 'plataforma', name: 'Produto', type: 'SINGLESELECT', position: 5, options: ['LinePBX', 'LineChat'], archived: false },
  { key: 'assunto', name: 'Assunto', type: 'SINGLESELECT', position: 9, options: ['Ramal - Criação', 'Ramal - Configuração', 'URA'], archived: false },
  { key: 'assunto-novo-29', name: 'Assunto - novo', type: 'MULTISELECT', position: 10, options: ['Ramal'], archived: false },
];
// sábado, 03/10/2026, 12h em Brasília
const agora = new Date('2026-10-03T15:00:00Z');

let n = 0;
function card(p: Partial<Chamado>): Chamado {
  n++;
  return {
    id: `c${n}`, key: `IS-${n}`, number: n, title: `Chamado ${n}`, description: null,
    stepId: 'novo', stepTitle: 'Novos Suporte', stepPhase: 'INITIAL', status: 'OPEN', responsavel: 'Lucio',
    createdAt: '2026-09-28T13:00:00Z', updatedAt: '2026-09-28T13:00:00Z', closedAt: null, closedEstimated: false,
    dueDate: null, isOverdue: false, tagIds: [], campos: {}, ...p,
  };
}
/** Um chamado fechado: aberto em `aberto`, fechado `horas` depois, passando pelas etapas dadas. */
function fechado(aberto: string, horas: number, p: Partial<Chamado> = {}): Chamado {
  const fim = new Date(Date.parse(aberto) + horas * 3_600_000).toISOString();
  return card({ stepId: 'tratado', stepTitle: 'Chamado Tratado Suporte', stepPhase: 'FINAL', createdAt: aberto, updatedAt: fim, closedAt: fim, ...p });
}
function ctxCom(historico = new Map<string, MovimentoChamado[]>(), extra: Partial<ContextoRelatorios> = {}): ContextoRelatorios {
  return { etapas, campos, etiquetas: [], agora, historico, historicoDesde: '2026-09-23T03:00:00Z', ajustes: AjustesRelatoriosSchema.parse({}), ...extra };
}
/** O caminho de um card pelas etapas, uma hora em cada (a primeira linha é a abertura, exata). */
function caminho(c: Chamado, etapasDoCaminho: string[], estimado = false): MovimentoChamado[] {
  let t = Date.parse(c.createdAt);
  return etapasDoCaminho.map((to, i) => {
    const m = { fromStepId: i ? etapasDoCaminho[i - 1]! : null, toStepId: to, at: new Date(t).toISOString(), estimated: i === 0 && estimado };
    t += 3_600_000;
    return m;
  });
}
const filtros = (q: Record<string, unknown> = {}) => FiltrosRelatoriosSchema.parse({ de: '2026-09-04', ate: '2026-10-03', ...q });
const semLink = () => '';

describe('as contas pequenas', () => {
  it('mediana e percentil 90', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 0.9)).toBe(9);
  });
  it('o tempo escrito do jeito que a equipe fala', () => {
    expect(duracaoLegivel(0.4)).toBe('24 min');
    expect(duracaoLegivel(3 + 40 / 60)).toBe('3h 40min');
    expect(duracaoLegivel(5)).toBe('5h');
    expect(duracaoLegivel(30)).toBe('1d 6h');
    expect(duracaoLegivel(23.999)).toBe('1d');
    expect(duracaoLegivel(null)).toBe('—');
  });
  it('o nível pelo nome da etapa', () => {
    expect(nivelDaEtapa('Chamado Em Tratativa N2')).toBe(2);
    expect(nivelDaEtapa('Novos Suporte')).toBeNull();
    expect(nivelDaEtapa('N3')).toBe(3);
  });
});

describe('os campos usados', () => {
  it('acha Cliente, Assunto (o de escolha única), Tipo e Produto sozinho', () => {
    const c = camposDosRelatorios(campos);
    expect(c.cliente?.key).toBe('cliente-71');
    expect(c.assunto?.key).toBe('assunto');
    expect(c.tipo?.key).toBe('tipo-de-chamado-24');
    expect(c.produto?.key).toBe('plataforma');
  });
  it('vale a escolha guardada; null = nenhum; escolha de campo que sumiu volta a achar sozinho', () => {
    const c = camposDosRelatorios(campos, { assunto: 'assunto-novo-29', tipo: null, produto: 'nao-existe' });
    expect(c.assunto?.key).toBe('assunto-novo-29');
    expect(c.tipo).toBeNull();
    expect(c.produto?.key).toBe('plataforma');
  });
});

describe('ligar o Cliente do card ao cadastro', () => {
  const clientes = [
    { id: 'k1', nomes: ['Labchecap', 'Labchecap Laboratório Ltda'] },
    { id: 'k2', nomes: ['Clínica de Brotas'] },
    { id: 'k3', nomes: ['Clínica Vida'] },
    { id: 'k4', nomes: ['Clínica Vida Nova'] },
  ];
  it('liga pelo nome sem acento, maiúscula e "Ltda"', () => {
    expect(nomeComparavel('Labchecap Laboratório LTDA.')).toBe('labchecap laboratorio');
    const l = ligarClientes(['LABCHECAP', 'Clinica de Brotas', 'Ninguém'], clientes);
    expect(l.LABCHECAP).toEqual({ clienteId: 'k1', como: 'automatico' });
    expect(l['Clinica de Brotas']).toEqual({ clienteId: 'k2', como: 'automatico' });
    expect(l['Ninguém']).toEqual({ clienteId: null, como: 'nenhum' });
  });
  it('nome contido em outro liga só quando há um candidato', () => {
    const l = ligarClientes(['Brotas', 'Clínica Vida Nova Filial'], clientes);
    expect(l.Brotas?.clienteId).toBe('k2');
    // "Clínica Vida Nova Filial" contém "Clínica Vida" e "Clínica Vida Nova": dois candidatos, não liga
    expect(l['Clínica Vida Nova Filial']?.clienteId).toBeNull();
  });
  it('a ligação guardada vale sempre; cliente que sumiu volta a procurar sozinho', () => {
    const l = ligarClientes(['Labchecap', 'Interno', 'Brotas'], clientes, { Labchecap: 'k2', Interno: null, Brotas: 'apagado' });
    expect(l.Labchecap).toEqual({ clienteId: 'k2', como: 'manual' });
    expect(l.Interno).toEqual({ clienteId: null, como: 'nenhum' });
    expect(l.Brotas).toEqual({ clienteId: 'k2', como: 'automatico' });
    expect(opcoesDoCliente(l, 'k2').sort()).toEqual(['Brotas', 'Labchecap']);
  });
});

describe('Relógio do chamado', () => {
  it('faixas, mediana e "9 em 10", sem os de hora estimada', () => {
    const cards = [
      fechado('2026-09-28T13:00:00Z', 0.5), fechado('2026-09-28T13:00:00Z', 2), fechado('2026-09-28T13:00:00Z', 3),
      fechado('2026-09-29T13:00:00Z', 30), fechado('2026-09-20T13:00:00Z', 200),
      fechado('2026-09-20T13:00:00Z', 5, { closedEstimated: true }),
      card({}), // em aberto: fora
    ];
    const r = relatoriosChamados(cards, filtros(), ctxCom(), semLink).relogio;
    expect(r.n).toBe(5);
    expect(r.estimados).toBe(1);
    expect(r.mediana).toBe(3);
    expect(r.p90).toBe(200);
    expect(r.faixas.map((f) => f.n)).toEqual([1, 2, 0, 1, 0, 1]);
  });
  it('compara com o período anterior do mesmo tamanho', () => {
    const cards = [fechado('2026-09-28T13:00:00Z', 2), fechado('2026-08-20T13:00:00Z', 10)];
    const r = relatoriosChamados(cards, filtros(), ctxCom(), semLink).relogio;
    expect(r.anterior).toEqual({ de: '2026-08-05', ate: '2026-09-03', n: 1, mediana: 10 });
  });
  it('separa por tipo, com o não preenchido no fim', () => {
    const cards = [
      fechado('2026-09-28T13:00:00Z', 1, { campos: { 'tipo-de-chamado-24': 'Correção' } }),
      fechado('2026-09-28T13:00:00Z', 3, { campos: { 'tipo-de-chamado-24': 'Correção' } }),
      fechado('2026-09-28T13:00:00Z', 9, { campos: {} }),
    ];
    const s = relatoriosChamados(cards, filtros({ separar: 'tipo' }), ctxCom(), semLink).relogio.separado!;
    expect(s.nome).toBe('Tipo de chamado');
    expect(s.linhas.map((l) => [l.rotulo, l.n, l.mediana])).toEqual([['Correção', 2, 2], ['Não preenchido', 1, 9]]);
  });
  it('a faixa clicada mostra os mesmos chamados que a conta', () => {
    const cards = [fechado('2026-09-28T13:00:00Z', 2), fechado('2026-09-28T13:00:00Z', 3), fechado('2026-09-28T13:00:00Z', 30)];
    const p = chamadosDaPeca(cards, ChamadosDaPecaSchema.parse({ de: '2026-09-04', ate: '2026-10-03', peca: 'relogio:f1' }), ctxCom(), semLink);
    expect(p.total).toBe(2);
    expect(p.titulo).toBe('Fecharam em 1h a 4h');
  });
});

describe('A escada N1 → N2 → N3', () => {
  it('conta pelo nível mais alto por onde o chamado passou', () => {
    const direto = fechado('2026-09-28T13:00:00Z', 1);
    const noN1 = fechado('2026-09-28T13:00:00Z', 2);
    const noN2 = fechado('2026-09-28T13:00:00Z', 5);
    const noN3 = fechado('2026-09-28T13:00:00Z', 9);
    const antigo = fechado('2026-09-20T13:00:00Z', 9); // aberto antes do histórico
    const h = new Map([
      [direto.id, caminho(direto, ['novo', 'tratado'])],
      [noN1.id, caminho(noN1, ['novo', 'n1', 'tratado'])],
      [noN2.id, caminho(noN2, ['novo', 'n1', 'n2', 'tratado'])],
      [noN3.id, caminho(noN3, ['novo', 'n1', 'n2', 'n3', 'tratado'])],
      [antigo.id, caminho(antigo, ['n2', 'tratado'], true)],
    ]);
    const e = relatoriosChamados([direto, noN1, noN2, noN3, antigo], filtros(), ctxCom(h), semLink).escada;
    expect(e.achouNiveis).toBe(true);
    expect([e.direto, e.n1, e.n2, e.n3, e.n, e.semHistorico]).toEqual([1, 1, 1, 1, 4, 1]);
    expect(e.medianas).toEqual({ n1: 1.5, n2: 5, n3: 9 });
  });
  it('reaberto: saiu de uma etapa que fecha e voltou para o trabalho', () => {
    const c = card({ stepId: 'n2', stepTitle: 'Chamado Em Tratativa N2', createdAt: '2026-09-28T13:00:00Z' });
    const h = new Map([[c.id, caminho(c, ['novo', 'n1', 'tratado', 'n2'])]]);
    const cam = caminhoDoChamado(c, ctxCom(h));
    expect(cam.reabertoEm).toHaveLength(1);
    expect(cam.nivel).toBe(2);
    expect(relatoriosChamados([c], filtros(), ctxCom(h), semLink).escada.reabertos).toBe(1);
  });
});

describe('Mapa de calor', () => {
  it('dia da semana e hora em Brasília, com o pico e o fora do horário', () => {
    const cards = [
      card({ createdAt: '2026-09-28T13:10:00Z' }), // segunda, 10h
      card({ createdAt: '2026-09-28T13:50:00Z' }), // segunda, 10h
      card({ createdAt: '2026-09-29T01:30:00Z' }), // segunda, 22h30 (já terça em UTC)
      card({ createdAt: '2026-10-03T12:00:00Z' }), // sábado, 9h
    ];
    const c = relatoriosChamados(cards, filtros(), ctxCom(), semLink).calor;
    expect(c.celulas[0]![10]).toBe(2);
    expect(c.celulas[0]![22]).toBe(1);
    expect(c.celulas[5]![9]).toBe(1);
    expect(c.pico).toMatchObject({ dia: 0, hora: 10, n: 2 });
    expect(c.foraDoHorario).toBe(2);
    // 04/09 a 03/10: cinco sextas e cinco sábados, quatro segundas
    expect(c.ocorrencias).toEqual([4, 4, 4, 4, 5, 5, 4]);
    expect(c.pico!.media).toBe(0.5);
  });
});

describe('Entrada × saída', () => {
  it('por semana: chegou, saiu e a fila no fim de cada semana', () => {
    const cards = [
      card({ createdAt: '2026-09-21T13:00:00Z' }), // segunda 21/09, ainda aberto
      fechado('2026-09-22T13:00:00Z', 30), // chega 22, fecha 23
      fechado('2026-09-25T13:00:00Z', 24 * 4), // chega sex 25, fecha ter 29
      card({ createdAt: '2026-09-30T13:00:00Z' }),
    ];
    const f = relatoriosChamados(cards, filtros({ de: '2026-09-21', ate: '2026-10-03' }), ctxCom(), semLink).fila;
    expect(f.por).toBe('semana');
    expect(f.pontos.map((p) => [p.id, p.entrou, p.saiu, p.fila])).toEqual([['2026-09-21', 3, 1, 2], ['2026-09-28', 1, 1, 2]]);
    expect(f.filaHoje).toBe(2);
    expect(f.saldoRecente.n).toBe(2);
    expect(f.pontos[1]!.parcial).toBe(true); // a semana de 28/09 vai até 04/10, depois de hoje
  });
  it('período longo vira mês', () => {
    const f = relatoriosChamados([], filtros({ de: '2026-01-01', ate: '2026-10-03' }), ctxCom(), semLink).fila;
    expect(f.por).toBe('mes');
    expect(f.pontos[0]!.id).toBe('2026-01');
    expect(f.pontos.length).toBe(10);
  });
});

describe('Sobe e desce dos assuntos', () => {
  const ab = (assunto: string, quando: string) => card({ createdAt: quando, campos: { assunto } });
  it('compara com o período anterior do mesmo tamanho; juntando pelos grupos, por padrão', () => {
    const cards = [
      // período: 04/09 a 03/10 · anterior: 05/08 a 03/09
      ab('Ramal - Criação', '2026-09-10T13:00:00Z'), ab('Ramal - Configuração', '2026-09-12T13:00:00Z'), ab('Ramal - Criação', '2026-09-20T13:00:00Z'),
      ab('URA', '2026-08-10T13:00:00Z'), ab('URA', '2026-08-11T13:00:00Z'), ab('URA', '2026-09-15T13:00:00Z'),
      ab('Ramal - Criação', '2026-08-20T13:00:00Z'),
    ];
    const grupos = [{ id: 'g1', nome: 'Ramal', valores: ['Ramal - Criação', 'Ramal - Configuração'] }];
    const ctx = ctxCom(undefined, { gruposAssunto: grupos });
    const s = relatoriosChamados(cards, filtros(), ctx, semLink).sobeDesce;
    expect(s.anterior).toEqual({ de: '2026-08-05', ate: '2026-09-03' });
    expect([s.agora, s.antes, s.juntado]).toEqual([4, 3, true]);
    expect(s.subiram).toEqual([{ rotulo: 'Ramal', agora: 3, antes: 1, delta: 2 }]);
    expect(s.cairam).toEqual([{ rotulo: 'URA', agora: 1, antes: 2, delta: -1 }]);
    // separado: "Ramal - Configuração" é novo
    const sep = relatoriosChamados(cards, filtros({ sobeSeparado: 'true' }), ctx, semLink).sobeDesce;
    expect(sep.juntado).toBe(false);
    expect(sep.subiram.map((x) => x.rotulo)).toEqual(['Ramal - Criação', 'Ramal - Configuração']); // empate de +1: o maior agora primeiro
    expect(sep.novos).toBe(1);
    // a peça clicada traz os abertos no período daquele assunto (com o mesmo jeito de juntar)
    const pc = chamadosDaPeca(cards, ChamadosDaPecaSchema.parse({ de: '2026-09-04', ate: '2026-10-03', peca: 'sobe:Ramal' }), ctx, semLink);
    expect(pc.total).toBe(3);
  });
});

describe('Voltou com o mesmo problema', () => {
  const doCliente = (cliente: string, assunto: string, quando: string) => card({ createdAt: quando, campos: { 'cliente-71': cliente, assunto } });
  it('cliente + assunto de novo em até 30 dias', () => {
    const cards = [
      doCliente('Alfa', 'URA', '2026-09-05T13:00:00Z'), doCliente('Alfa', 'URA', '2026-09-20T13:00:00Z'), doCliente('Alfa', 'URA', '2026-10-01T13:00:00Z'),
      doCliente('Beta Ltda', 'URA', '2026-09-05T13:00:00Z'),
      doCliente('Alfa', 'Ramal - Criação', '2026-09-28T13:00:00Z'),
      card({ campos: { 'cliente-71': 'Alfa' } }), // sem assunto: fica de fora
    ];
    const r = relatoriosChamados(cards, filtros(), ctxCom(), semLink).reincidencia;
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ cliente: 'Alfa', assunto: 'URA', n: 3, menorIntervalo: 11 });
    expect([r.total, r.semCampo, r.pares, r.chamados]).toEqual([5, 1, 1, 3]);
  });
  it('dois chamados com mais de 30 dias de distância não são reincidência', () => {
    const cards = [doCliente('Alfa', 'URA', '2026-08-01T13:00:00Z'), doCliente('Alfa', 'URA', '2026-09-15T13:00:00Z')];
    expect(relatoriosChamados(cards, filtros({ de: '2026-08-01' }), ctxCom(), semLink).reincidencia.linhas).toHaveLength(0);
  });
  it('com os grupos da equipe, "Ramal - Criação" e "Ramal - Configuração" são o mesmo problema', () => {
    const cards = [doCliente('Alfa', 'Ramal - Criação', '2026-09-20T13:00:00Z'), doCliente('Alfa', 'Ramal - Configuração', '2026-09-25T13:00:00Z')];
    const grupos = [{ id: 'g1', nome: 'Ramal', valores: ['Ramal - Criação', 'Ramal - Configuração'] }];
    const ctx = ctxCom(undefined, { gruposAssunto: grupos });
    expect(relatoriosChamados(cards, filtros(), ctx, semLink).reincidencia.linhas).toHaveLength(0);
    const j = relatoriosChamados(cards, filtros({ juntarAssuntos: 'true' }), ctx, semLink).reincidencia;
    expect(j.juntado).toBe(true);
    expect(j.linhas[0]).toMatchObject({ assunto: 'Ramal', n: 2 });
  });
});

describe('Quadro da equipe', () => {
  it('em aberto, parados, vencidos e fechados por pessoa, em ordem de nome', () => {
    const cards = [
      card({ responsavel: 'Marina', updatedAt: '2026-09-20T13:00:00Z', createdAt: '2026-09-20T13:00:00Z' }), // parada
      card({ responsavel: 'Marina', isOverdue: true }),
      card({ responsavel: null }),
      fechado('2026-09-28T13:00:00Z', 4, { responsavel: 'Bruno' }),
      fechado('2026-10-01T13:00:00Z', 2, { responsavel: 'Bruno' }),
    ];
    const e = relatoriosChamados(cards, filtros(), ctxCom(), semLink).equipe;
    expect(e.linhas.map((l) => l.nome)).toEqual(['Bruno', 'Marina', null]);
    expect(e.linhas[0]).toMatchObject({ fechados: 2, mediana: 3, emAberto: 0 });
    expect(e.linhas[0]!.tendencia.slice(-2)).toEqual([0, 2]); // os dois fecharam na semana atual (de 28/09)
    expect(e.linhas[1]).toMatchObject({ emAberto: 2, parados: 1, vencidos: 1 });
    expect(e.totais.emAberto).toBe(3);
    expect(e.semanas).toHaveLength(8);
  });
});

describe('Fechamento do mês', () => {
  it('o mês passado por padrão, comparado com o anterior, e os destaques escritos', () => {
    expect(mesDoFechamento({}, agora)).toBe('2026-09');
    expect(mesDoFechamento({ mes: '2026-12' }, agora)).toBe('2026-09'); // mês que ainda não chegou
    const set = (dia: string, assunto: string, cliente = 'Alfa') => card({ createdAt: `2026-09-${dia}T13:00:00Z`, campos: { assunto, 'cliente-71': cliente } });
    const cards = [
      ...['10', '10', '10', '10', '11'].map((d) => set(d, 'URA')),
      set('12', 'Ramal - Criação', 'Beta Ltda'),
      card({ createdAt: '2026-08-10T13:00:00Z', campos: { assunto: 'URA', 'cliente-71': 'Alfa' } }),
    ];
    const m = relatoriosChamados(cards, filtros(), ctxCom(), semLink).mes;
    expect(m.nome).toBe('setembro de 2026');
    expect(m.abertos).toEqual({ n: 6, antes: 1 });
    expect(m.assuntos[0]).toEqual({ rotulo: 'URA', n: 5, antes: 1 });
    expect(m.porDia).toHaveLength(30);
    expect(m.destaques[0]).toBe('URA subiu de 1 para 5 chamados em relação a agosto.');
    expect(m.destaques[1]).toBe('Alfa foi o cliente que mais abriu chamados: 5 (eram 1 em agosto).');
    expect(m.destaques[2]).toBe('O dia mais cheio foi qui, 10/09, com 4 chamados, 4 deles de URA.');
  });
});

describe('Raio-X do cliente', () => {
  it('só os chamados das opções ligadas, mesmo com o filtro de Cliente na página', () => {
    const cards = [
      card({ campos: { 'cliente-71': 'Alfa', assunto: 'URA' }, createdAt: '2026-09-10T13:00:00Z' }),
      fechado('2026-09-11T13:00:00Z', 2, { campos: { 'cliente-71': 'ALFA S/A', assunto: 'URA' } }),
      card({ campos: { 'cliente-71': 'Beta Ltda' } }),
    ];
    const r = raioXChamados(cards, ['Alfa', 'ALFA S/A'], filtros({ campo: 'cliente-71=Beta Ltda' }), ctxCom(), semLink);
    expect([r.abertos, r.fechados, r.mediana, r.emAberto.length, r.total, r.repetidos]).toEqual([2, 1, 2, 1, 2, 1]);
    expect(r.assuntos).toEqual([{ rotulo: 'URA', n: 2 }]);
    expect(r.porMes).toHaveLength(12);
    expect(r.porMes[11]).toMatchObject({ id: '2026-10', n: 0 });
  });
});

describe('Idade da fila', () => {
  it('os em aberto por idade e por etapa, com o mais antigo', () => {
    const cards = [
      card({ createdAt: '2026-10-03T10:00:00Z' }), // 5 h
      card({ createdAt: '2026-09-29T12:00:00Z', stepId: 'n1', stepTitle: 'Chamado Em Tratativa N1' }), // ~4 dias
      card({ createdAt: '2026-09-01T12:00:00Z', stepId: 'n2', stepTitle: 'Chamado Em Tratativa N2', key: 'IS-VELHO' }), // ~32 dias
      fechado('2026-09-01T12:00:00Z', 3), // fechado: fora
    ];
    const i = relatoriosChamados(cards, filtros(), ctxCom(), semLink).idade;
    expect([i.n, i.maisDe7]).toEqual([3, 1]);
    expect(i.faixas.map((f) => f.n)).toEqual([1, 0, 1, 0, 0, 1]);
    expect(i.maisAntigo?.key).toBe('IS-VELHO');
    expect(i.porEtapa.map((e) => [e.titulo, e.n])).toEqual([['Novos Suporte', 1], ['Chamado Em Tratativa N1', 1], ['Chamado Em Tratativa N2', 1]]);
    const pc = chamadosDaPeca(cards, ChamadosDaPecaSchema.parse({ peca: 'idade:i5' }), ctxCom(), semLink);
    expect(pc.total).toBe(1);
    expect(pc.titulo).toBe('Em aberto há mais de 30 dias');
  });
});

describe('Dias fora da curva', () => {
  it('bem acima do normal daquele dia da semana, com o assunto que dominou', () => {
    const cards: Chamado[] = [];
    // 8 segundas-feiras antes, com 3 chamados cada (o normal de segunda é 3)
    for (let k = 1; k <= 8; k++) {
      const d = new Date(Date.parse('2026-09-28T13:00:00Z') - k * 7 * 86_400_000).toISOString();
      for (let j = 0; j < 3; j++) cards.push(card({ createdAt: d, campos: { assunto: 'URA' } }));
    }
    // segunda 28/09: 12 chamados, 9 deles de "Tronco - Queda"
    for (let j = 0; j < 12; j++) cards.push(card({ createdAt: '2026-09-28T13:00:00Z', campos: { assunto: j < 9 ? 'Tronco - Queda' : 'URA', 'cliente-71': 'Alfa' } }));
    // segunda 21/09: 6 (o dobro de 3, mas só 3 a mais): não é fora da curva
    for (let j = 0; j < 3; j++) cards.push(card({ createdAt: '2026-09-21T13:00:00Z' }));
    const f = relatoriosChamados(cards, filtros({ de: '2026-09-14' }), ctxCom(), semLink).foraDaCurva;
    expect(f.picos).toHaveLength(1);
    expect(f.picos[0]).toMatchObject({ dia: '2026-09-28', n: 12, normal: 3, assunto: { rotulo: 'Tronco - Queda', n: 9 }, cliente: { rotulo: 'Alfa', n: 12 } });
    expect(f.pontos.find((x) => x.id === '2026-09-21')).toMatchObject({ n: 6, pico: false });
    expect(chamadosDaPeca(cards, ChamadosDaPecaSchema.parse({ peca: 'picos:2026-09-28' }), ctxCom(), semLink).total).toBe(12);
  });
});

describe('Chamados pelo tamanho do cliente', () => {
  it('chamados do período por 10 DIDs e por 10 aparelhos, com o cliente ligado pelo nome', () => {
    const cards = [
      ...Array.from({ length: 4 }, () => card({ campos: { 'cliente-71': 'Alfa' } })),
      card({ campos: { 'cliente-71': 'Beta Ltda' } }),
      card({ campos: { 'cliente-71': 'Gama' } }), // não liga a ninguém
    ];
    const ctx = ctxCom(undefined, {
      cadastro: [{ id: 'a', nomes: ['Alfa'] }, { id: 'b', nomes: ['Beta'] }],
      tamanhos: new Map([['a', { nome: 'Alfa', dids: 5, aparelhos: 0 }], ['b', { nome: 'Beta', dids: 100, aparelhos: 20 }]]),
    });
    const t = relatoriosChamados(cards, filtros(), ctx, semLink).tamanho;
    expect(t.disponivel).toBe(true);
    expect(t.semLigacao).toBe(1);
    expect(t.linhas).toEqual([
      { clienteId: 'a', nome: 'Alfa', n: 4, dids: 5, aparelhos: 0, porDids: 8, porAparelhos: null },
      { clienteId: 'b', nome: 'Beta', n: 1, dids: 100, aparelhos: 20, porDids: 0.1, porAparelhos: 0.5 },
    ]);
    expect(chamadosDaPeca(cards, ChamadosDaPecaSchema.parse({ peca: 'tamanho:a' }), ctx, semLink).total).toBe(4);
    // sem o cadastro (a prévia antiga, um teste), o relatório só diz que não está disponível
    expect(relatoriosChamados(cards, filtros(), ctxCom(), semLink).tamanho.disponivel).toBe(false);
  });
});

describe('De quem é a falha?', () => {
  it('o grupo pelo nome do tipo, quando a equipe não escolheu', () => {
    expect(causaPeloNome('Falha Sistêmica Ingline')).toBe('nossa');
    expect(causaPeloNome('Correção')).toBe('nossa');
    expect(causaPeloNome('Falha usuário')).toBe('cliente');
    expect(causaPeloNome('Dificuldade Infraestrutura Cliente')).toBe('cliente');
    expect(causaPeloNome('Falha Operadora')).toBe('operadora');
    expect(causaPeloNome('Dúvida Usuário')).toBe('pedido');
    expect(causaPeloNome('Configuração')).toBe('pedido');
  });
  it('mês a mês e no período; a escolha da equipe vale mais que o nome', () => {
    const tipo = (t: string | null, quando: string) => card({ createdAt: quando, campos: t ? { 'tipo-de-chamado-24': t } : {} });
    const cards = [
      tipo('Correção', '2026-09-10T13:00:00Z'), tipo('Configuração', '2026-09-11T13:00:00Z'), tipo(null, '2026-09-12T13:00:00Z'),
      tipo('Correção', '2026-08-10T13:00:00Z'),
    ];
    const f = relatoriosChamados(cards, filtros(), ctxCom(), semLink).falha;
    expect(f.tipo?.name).toBe('Tipo de chamado');
    expect(f.meses.map((m) => m.id)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(f.meses[4]).toMatchObject({ total: 3, porCausa: { nossa: 1, cliente: 0, operadora: 0, pedido: 1 }, semTipo: 1 });
    expect(f.periodo).toMatchObject({ total: 3, semTipo: 1 });
    // a equipe diz que Correção é pedido
    const ctx = ctxCom(undefined, { ajustes: AjustesRelatoriosSchema.parse({ causas: { Correção: 'pedido' } }) });
    const g = relatoriosChamados(cards, filtros(), ctx, semLink).falha;
    expect(g.meses[4]!.porCausa).toMatchObject({ nossa: 0, pedido: 2 });
    expect(g.tipos.find((x) => x.tipo === 'Correção')).toMatchObject({ causa: 'pedido', escolhida: true, n: 1 });
    expect(chamadosDaPeca(cards, ChamadosDaPecaSchema.parse({ peca: 'falha:2026-09:semtipo' }), ctx, semLink).total).toBe(1);
  });
  it('a janela de ajustes lista os tipos com o grupo sugerido e o escolhido', () => {
    const cards = [card({ campos: { 'tipo-de-chamado-24': 'Correção' } })];
    const a = ajustesParaTela(cards, campos, AjustesRelatoriosSchema.parse({ causas: { Configuração: 'nossa' } }), []);
    expect(a.tipos).toEqual([
      { tipo: 'Correção', n: 1, causa: 'nossa', sugerida: 'nossa', escolhida: false },
      { tipo: 'Configuração', n: 0, causa: 'nossa', sugerida: 'pedido', escolhida: true },
    ]);
  });
});

describe('Onde o chamado empaca', () => {
  it('o tempo de cada passagem por etapa, a mais lenta e quantos estão parados nela agora', () => {
    const cs: Chamado[] = []; const h = new Map<string, MovimentoChamado[]>();
    for (const horasNoN2 of [10, 20, 30]) {
      const c = fechado('2026-09-20T12:00:00Z', 40);
      // novo 1h → n1 1h → n2 (horasNoN2) → tratado
      const t0 = Date.parse(c.createdAt);
      const at = (hh: number) => new Date(t0 + hh * 3_600_000).toISOString();
      h.set(c.id, [
        { fromStepId: null, toStepId: 'novo', at: at(0), estimated: false },
        { fromStepId: 'novo', toStepId: 'n1', at: at(1), estimated: false },
        { fromStepId: 'n1', toStepId: 'n2', at: at(2), estimated: false },
        { fromStepId: 'n2', toStepId: 'tratado', at: at(2 + horasNoN2), estimated: false },
      ]);
      cs.push(c);
    }
    cs.push(card({ stepId: 'n2', stepTitle: 'Chamado Em Tratativa N2' }));
    const g = relatoriosChamados(cs, filtros(), ctxCom(h), semLink).gargalo;
    expect(g.etapas.map((e) => [e.id, e.n, e.mediana, e.agora])).toEqual([['novo', 3, 1, 0], ['n1', 3, 1, 0], ['n2', 3, 20, 1]]);
    expect(g.maisLenta).toBe('n2');
    expect(chamadosDaPeca(cs, ChamadosDaPecaSchema.parse({ peca: 'gargalo:n2' }), ctxCom(h), semLink).total).toBe(3);
    expect(chamadosDaPeca(cs, ChamadosDaPecaSchema.parse({ peca: 'gargalo:n2:agora' }), ctxCom(h), semLink).total).toBe(1);
  });
});

describe('Prazo cumprido', () => {
  it('fechou até o dia do vencimento, por tipo, sem os de hora estimada', () => {
    const cs = [
      fechado('2026-09-20T12:00:00Z', 20, { dueDate: '2026-09-21T23:00:00Z', campos: { 'tipo-de-chamado-24': 'Correção' } }), // fecha 21/09: no prazo
      fechado('2026-09-20T12:00:00Z', 60, { dueDate: '2026-09-21T12:00:00Z', campos: { 'tipo-de-chamado-24': 'Correção' } }), // fecha 22/09: fora
      fechado('2026-09-20T12:00:00Z', 5), // sem vencimento
      fechado('2026-09-20T12:00:00Z', 5, { dueDate: '2026-09-25T12:00:00Z', closedEstimated: true }), // estimado: fora da conta
      card({ isOverdue: true, dueDate: '2026-09-25T12:00:00Z' }),
    ];
    const x = relatoriosChamados(cs, filtros(), ctxCom(), semLink).prazo;
    expect([x.comPrazo, x.dentro, x.fora, x.semPrazo, x.pct, x.vencidosAgora]).toEqual([2, 1, 1, 1, 50, 1]);
    expect(x.porTipo).toEqual([{ rotulo: 'Correção', n: 2, dentro: 1, pct: 50 }]);
    expect(chamadosDaPeca(cs, ChamadosDaPecaSchema.parse({ peca: 'prazo:fora' }), ctxCom(), semLink).total).toBe(1);
  });
});

describe('Primeira resposta', () => {
  it('da abertura até sair de Novos Suporte; fora do horário comercial à parte; quem ainda espera', () => {
    const mk = (aberto: string, saiEmHoras: number | null, nasceEm = 'novo') => {
      const c = card({ createdAt: aberto, stepId: saiEmHoras === null ? 'novo' : 'n1', stepTitle: 'x' });
      const movs: MovimentoChamado[] = [{ fromStepId: null, toStepId: nasceEm, at: aberto, estimated: false }];
      if (saiEmHoras !== null && nasceEm === 'novo') movs.push({ fromStepId: 'novo', toStepId: 'n1', at: new Date(Date.parse(aberto) + saiEmHoras * 3_600_000).toISOString(), estimated: false });
      return { c, movs };
    };
    const casos = [
      mk('2026-09-28T13:00:00Z', 0.1), // segunda 10h: 6 min
      mk('2026-09-28T14:00:00Z', 2), // segunda 11h: 2h
      mk('2026-09-28T15:00:00Z', 0, 'n1'), // nasceu já no N1: 0
      mk('2026-09-29T02:00:00Z', 7), // segunda 23h: fora do horário
      mk('2026-10-01T13:00:00Z', null), // ainda em Novos Suporte
    ];
    const h = new Map(casos.map((x) => [x.c.id, x.movs]));
    const r = relatoriosChamados(casos.map((x) => x.c), filtros(), ctxCom(h), semLink).primeira;
    expect(r.inicial?.titulo).toBe('Novos Suporte');
    expect([r.n, r.ate1h, r.mediana]).toEqual([3, 2, 0.1]);
    expect(r.faixas.map((f) => f.n)).toEqual([2, 0, 0, 1, 0, 0]);
    expect(r.fora).toEqual({ n: 1, mediana: 7 });
    expect(r.esperando).toBe(1);
    expect(chamadosDaPeca(casos.map((x) => x.c), ChamadosDaPecaSchema.parse({ peca: 'primeira:r0' }), ctxCom(h), semLink).total).toBe(2);
  });
});

describe('A prioridade faz diferença?', () => {
  it('mediana por prioridade e o aviso quando a mais alta demora mais', () => {
    const etiquetas = [
      { id: 't-alta', name: 'P/ Alta', color: 'rgb(1,1,1)', archived: false },
      { id: 't-media', name: 'P/ Média', color: 'rgb(2,2,2)', archived: false },
      { id: 'outra', name: 'StandBy', color: null, archived: false },
    ];
    const cs = [
      ...[10, 12, 14].map((h) => fechado('2026-09-20T12:00:00Z', h, { tagIds: ['t-alta'] })),
      ...[2, 3, 4].map((h) => fechado('2026-09-20T12:00:00Z', h, { tagIds: ['t-media', 't-alta'] })), // a mais alta vale: Alta
      ...[5, 6, 7].map((h) => fechado('2026-09-20T12:00:00Z', h, { tagIds: ['t-media'] })),
      fechado('2026-09-20T12:00:00Z', 1),
    ];
    const x = relatoriosChamados(cs, filtros(), ctxCom(undefined, { etiquetas }), semLink).prioridade;
    expect(x.temEtiquetas).toBe(true);
    expect(x.linhas.map((l) => [l.rotulo, l.fechados, l.mediana])).toEqual([['P/ Alta', 6, 7], ['P/ Média', 3, 6], ['Sem prioridade', 1, 1]]);
    expect(x.invertidas).toEqual([{ mais: 'P/ Alta', menos: 'P/ Média' }]);
    expect(x.semPrioridadePct).toBe(10);
  });
});

describe('Os poucos que pesam muito', () => {
  it('do maior para o menor, com a soma acumulada e quantos fazem 80%', () => {
    const cs = [...Array(6).fill('URA'), ...Array(3).fill('Ramal - Criação'), 'Ramal - Configuração'].map((a) => card({ campos: { assunto: a, 'cliente-71': 'Alfa' } }));
    const x = relatoriosChamados(cs, filtros(), ctxCom(), semLink).pareto;
    expect(x.itens).toEqual([{ rotulo: 'URA', n: 6, acumulado: 60 }, { rotulo: 'Ramal - Criação', n: 3, acumulado: 90 }, { rotulo: 'Ramal - Configuração', n: 1, acumulado: 100 }]);
    expect(x.para80).toBe(2);
    const porCliente = relatoriosChamados(cs, filtros({ pareto: 'cliente' }), ctxCom(), semLink).pareto;
    expect(porCliente.itens).toEqual([{ rotulo: 'Alfa', n: 10, acumulado: 100 }]);
    expect(chamadosDaPeca(cs, ChamadosDaPecaSchema.parse({ peca: 'pareto:URA' }), ctxCom(), semLink).total).toBe(6);
  });
});

describe('Previsão da semana', () => {
  it('a média do mesmo dia da semana nas semanas completas antes da atual', () => {
    const cs: Chamado[] = [];
    // segundas 21/09 e 14/09: 4 e 2 chamados; terças: 1 e 1 — o primeiro chamado é de 14/09
    for (const [dia, n] of [['2026-09-14', 2], ['2026-09-21', 4], ['2026-09-15', 1], ['2026-09-22', 1], ['2026-09-28', 3]] as const) {
      for (let i = 0; i < n; i++) cs.push(card({ createdAt: `${dia}T13:00:00Z` }));
    }
    const x = relatoriosChamados(cs, filtros(), ctxCom(), semLink).previsao;
    expect(x.semana).toEqual({ de: '2026-10-05', ate: '2026-10-11' });
    expect(x.semanas).toBe(2);
    expect(x.dias[0]).toMatchObject({ dia: '2026-10-05', media: 3, min: 2, max: 4 });
    expect(x.dias[1]).toMatchObject({ media: 1, min: 1, max: 1 });
    expect(x.total).toBe(4);
    expect(x.faixa).toEqual({ min: 3, max: 5 });
    expect(x.semanaAtual).toEqual({ de: '2026-09-28', ateHoje: 3, esperadoAteHoje: 4 });
  });
});

describe('Card bem preenchido', () => {
  it('o % dos fechados com cada campo, e por responsável', () => {
    const cheio = { 'cliente-71': 'Alfa', assunto: 'URA', 'tipo-de-chamado-24': 'Correção', plataforma: 'LinePBX' };
    const cs = [
      fechado('2026-09-20T12:00:00Z', 2, { campos: cheio, responsavel: 'Bruno' }),
      fechado('2026-09-20T12:00:00Z', 2, { campos: { ...cheio, assunto: null }, responsavel: 'Bruno' }),
      fechado('2026-09-20T12:00:00Z', 2, { campos: cheio, responsavel: 'Ana' }),
    ];
    const x = relatoriosChamados(cs, filtros(), ctxCom(), semLink).preenchimento;
    expect([x.n, x.completos]).toEqual([3, 2]);
    expect(x.campos.find((c) => c.key === 'assunto')).toMatchObject({ preenchidos: 2, pct: 67 });
    expect(x.porResponsavel).toEqual([{ nome: 'Ana', n: 1, completos: 1, pct: 100 }, { nome: 'Bruno', n: 2, completos: 1, pct: 50 }]);
    expect(chamadosDaPeca(cs, ChamadosDaPecaSchema.parse({ peca: 'preenchimento:campo:assunto' }), ctxCom(), semLink).total).toBe(1);
    expect(chamadosDaPeca(cs, ChamadosDaPecaSchema.parse({ peca: 'preenchimento:resp:Bruno' }), ctxCom(), semLink).total).toBe(1);
  });
});

describe('A arrumação da página', () => {
  it('a ordem guardada primeiro, o que é novo no fim; os favoritos na ordem deles, sem os escondidos', () => {
    expect(CATALOGO_RELATORIOS).toHaveLength(20);
    const a = montarArrumacao({ ordem: ['escada', 'relogio', 'sumiu'], ocultos: ['prazo', 'calor'], favoritos: ['mes', 'relogio', 'prazo', 'sumiu', 'mes'] });
    expect(a.ordem.slice(0, 3)).toEqual(['escada', 'relogio', 'gargalo']);
    expect(a.ordem).toHaveLength(20);
    expect(a.ocultos).toEqual(['prazo', 'calor']);
    expect(a.favoritos).toEqual(['mes', 'relogio']);
    expect(montarArrumacao(null).ordem).toEqual(CATALOGO_RELATORIOS.map((r) => r.id));
  });
  it('relatório desconhecido ou repetido é recusado', () => {
    expect(ArrumacaoRelatoriosSchema.safeParse({ ordem: ['relogio', 'qualquer'] }).success).toBe(false);
    expect(ArrumacaoRelatoriosSchema.safeParse({ favoritos: ['relogio', 'relogio'] }).success).toBe(false);
    expect(ArrumacaoRelatoriosSchema.parse({})).toEqual({ ordem: [], ocultos: [], favoritos: [] });
  });
});
