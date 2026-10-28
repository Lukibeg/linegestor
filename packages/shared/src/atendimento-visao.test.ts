import { describe, expect, it } from 'vitest';
import { AJUSTES_PRAZOS_PADRAO, instanteLocal } from './atendimento-prazos.js';
import { chamadoParaRelatorios, type ChamadoParaRelatorios, type ContextoDosRelatorios } from './atendimento-relatorios.js';
import { VAZIO } from './chamados.js';
import { FiltroDaVisaoSchema, montarVisao, visaoDoPainel, type FiltroDaVisao } from './atendimento-visao.js';

const em = (dia: string, hora = '10:00') => instanteLocal(dia, hora).toISOString();
// "agora" é quinta, 22/10/2026, 15h (Brasília)
const AGORA = instanteLocal('2026-10-22', '15:00');

const ctx: ContextoDosRelatorios = {
  painel: { id: 'sup', nome: 'Suporte', sigla: 'SUP', contaPrazo: true, usa: { assunto: true, tipo: true, gravidade: true, produtos: true, operadoras: false } },
  etapas: [
    { id: 'novo', nome: 'Novos', tipo: 'entrada', nivel: null, ordem: 0, ativa: true },
    { id: 'n1', nome: 'N1', tipo: 'andamento', nivel: 1, ordem: 1, ativa: true },
    { id: 'resolvido', nome: 'Resolvido', tipo: 'resolvido', nivel: null, ordem: 2, ativa: true },
  ],
  assuntos: [
    { id: 'ramal', paiId: null, nome: 'Ramal', ordem: 0, ativo: true },
    { id: 'ramal-conf', paiId: 'ramal', nome: 'Configuração', ordem: 0, ativo: true },
    { id: 'ramal-mudo', paiId: 'ramal', nome: 'Sem áudio', ordem: 1, ativo: true },
    { id: 'fin', paiId: null, nome: 'Financeiro', ordem: 1, ativo: true },
  ],
  campos: [{ id: 'canal', nome: 'Canal', opcoes: [{ id: 'zap', nome: 'WhatsApp' }, { id: 'tel', nome: 'Telefone' }], ativo: true }],
  pessoas: new Map([['luan', 'Luan'], ['marina', 'Marina']]),
  clientes: new Map([['aurora', { nome: 'Clínica Aurora', dids: 0, aparelhos: 0, produtos: [] }], ['norte', { nome: 'Distribuidora Norte', dids: 0, aparelhos: 0, produtos: [] }]]),
  produtos: new Map([['pbx', 'PBX em nuvem']]),
  operadoras: new Map(),
  prazos: AJUSTES_PRAZOS_PADRAO,
  campoDaFalha: null,
};

const CHAMADOS: ChamadoParaRelatorios[] = [
  // hoje, 9h: em aberto no N1, com a Marina, Ramal › Configuração, pelo robô
  chamadoParaRelatorios({ id: 'h1', codigo: 'SUP-1', etapaId: 'n1', criadoEm: em('2026-10-22', '09:00'), ultimaAtividadeEm: em('2026-10-22', '09:30'), responsavelId: 'marina', clienteId: 'aurora', assuntoId: 'ramal-conf', tipo: 'Configuração', prioridade: 'media', origem: 'robo', campos: { canal: 'zap' } }),
  // hoje, 10h: em aberto no Novo, sem dono, sem assunto, crítico (a resposta de 15 min já venceu)
  chamadoParaRelatorios({ id: 'h2', codigo: 'SUP-2', etapaId: 'novo', criadoEm: em('2026-10-22', '10:00'), ultimaAtividadeEm: em('2026-10-22', '10:00'), clienteId: 'norte', prioridade: 'critica', produtos: ['pbx'] }),
  // hoje, 11h: resolvido às 14h, Ramal › Sem áudio
  chamadoParaRelatorios({ id: 'h3', codigo: 'SUP-3', etapaId: 'resolvido', situacao: 'resolvido', criadoEm: em('2026-10-22', '11:00'), respondidoEm: em('2026-10-22', '11:05'), resolvidoEm: em('2026-10-22', '14:00'), ultimaAtividadeEm: em('2026-10-22', '14:00'), responsavelId: 'luan', clienteId: 'aurora', assuntoId: 'ramal-mudo', prioridade: 'baixa', campos: { canal: 'tel' } }),
  // 10/10: em aberto, parado (nada desde então), Financeiro
  chamadoParaRelatorios({ id: 'v1', codigo: 'SUP-4', etapaId: 'n1', criadoEm: em('2026-10-10', '09:00'), ultimaAtividadeEm: em('2026-10-10', '09:00'), responsavelId: 'luan', clienteId: 'norte', assuntoId: 'fin', prioridade: 'baixa' }),
  // 05/10: chegou e foi resolvido hoje
  chamadoParaRelatorios({ id: 'v2', codigo: 'SUP-5', etapaId: 'resolvido', situacao: 'resolvido', criadoEm: em('2026-10-05', '09:00'), respondidoEm: em('2026-10-05', '09:10'), resolvidoEm: em('2026-10-22', '12:00'), ultimaAtividadeEm: em('2026-10-22', '12:00'), responsavelId: 'luan', clienteId: 'aurora', assuntoId: 'ramal-conf', prioridade: 'media' }),
  // um problema (fica de fora)
  chamadoParaRelatorios({ id: 'pb', codigo: 'SUP-6', tipoChamado: 'problema', etapaId: 'n1', criadoEm: em('2026-10-22', '08:00') }),
];

const ver = (f: Partial<FiltroDaVisao> = {}) => visaoDoPainel(CHAMADOS, ctx, FiltroDaVisaoSchema.parse({ painel: 'sup', ...f }), AGORA);
const grafico = (v: ReturnType<typeof ver>, id: string) => v.graficos.find((g) => g.id === id)!;
const n = (v: ReturnType<typeof ver>, id: string, valor: string) => grafico(v, id).itens.find((x) => x.valor === valor)?.n ?? 0;

describe('a Visão geral: Hoje', () => {
  it('conta os números de cima (o problema fica de fora)', () => {
    const v = ver();
    const k = Object.fromEntries(v.kpis.map((x) => [x.id, x.valor]));
    expect(k['chegaram-hoje']).toBe('3');
    // o h3 e o v2 foram para o Resolvido hoje
    expect(k['resolvidos-hoje']).toBe('2');
    // em aberto de qualquer dia: h1, h2 e v1
    expect(k['em-aberto']).toBe('3');
    // ninguém respondeu o h1 (média, desde as 9h) nem o h2 (crítico, desde as 10h); o v1 passou do prazo de solução
    expect(k['vencidos']).toBe('3');
    expect(v.total).toBe(3);
    expect(v.lista.itens.map((x) => x.codigo)).toEqual(['SUP-3', 'SUP-2', 'SUP-1']);
  });

  it('o tempo é por hora, com a hora de agora em destaque', () => {
    const v = ver();
    expect(v.serie.pontos).toHaveLength(24);
    expect(v.serie.pontos[9]!.n).toBe(1);
    expect(v.serie.pontos[15]!.destaque).toBe(true);
  });

  it('cada gráfico é contado sem o próprio filtro, e o escolhido fica em destaque', () => {
    const v = ver({ cliente: 'aurora' });
    expect(v.total).toBe(2);
    const cli = grafico(v, 'cliente');
    // o do cliente continua com os dois clientes de hoje
    expect(cli.itens.map((x) => [x.valor, x.n, !!x.selecionado])).toEqual([['aurora', 2, true], ['norte', 1, false]]);
    // o do responsável obedece ao cliente
    expect(n(v, 'responsavel', 'marina')).toBe(1);
    expect(n(v, 'responsavel', VAZIO)).toBe(0);
  });

  it('o "não preenchido" é clicável: sem assunto, sem dono, o campo vazio', () => {
    expect(n(ver(), 'assunto', VAZIO)).toBe(1);
    expect(ver({ assunto: 'sem' }).lista.itens.map((x) => x.codigo)).toEqual(['SUP-2']);
    expect(ver({ responsavel: 'ninguem' }).total).toBe(1);
    expect(ver({ campo: 'canal:' }).lista.itens.map((x) => x.codigo)).toEqual(['SUP-2']);
    expect(ver({ campo: 'canal:zap' }).lista.itens.map((x) => x.codigo)).toEqual(['SUP-1']);
  });

  it('o assunto: a pasta filtra ela e o que está dentro, e os grupos são as pastas do 1º nível', () => {
    const v = ver({ assunto: 'ramal' });
    expect(v.total).toBe(2);
    const a = grafico(v, 'assunto');
    expect(a.grupos).toEqual([{ id: 'ramal', nome: 'Ramal', valores: ['ramal', 'ramal-conf', 'ramal-mudo'] }]);
    expect(a.itens.filter((x) => x.selecionado).map((x) => x.valor).sort()).toEqual(['ramal-conf', 'ramal-mudo']);
    expect(a.itens.find((x) => x.valor === 'ramal-conf')!.rotulo).toBe('Ramal › Configuração');
  });

  it('"Resolvidos" troca a régua: o dia em que foi resolvido', () => {
    const v = ver({ situacao: 'resolvidos' });
    expect(v.lista.itens.map((x) => x.codigo)).toEqual(['SUP-3', 'SUP-5']);
    expect(v.serie.titulo).toContain('resolvidos');
    expect(v.kpis.find((x) => x.id === 'resolvidos-hoje')!.ativo).toBe(true);
  });

  it('a coluna clicada recorta a tela, e o gráfico do tempo continua inteiro', () => {
    const v = ver({ quando: '9' });
    expect(v.total).toBe(1);
    expect(v.serie.pontos.filter((x) => x.n).length).toBe(3);
    expect(v.serie.pontos[9]!.selecionado).toBe(true);
  });
});

describe('a Visão geral: Período', () => {
  it('conta pelo período e, com "só em aberto", os parados e os sem dono', () => {
    const v = ver({ parte: 'periodo', de: '2026-10-01', ate: '2026-10-22' });
    const k = Object.fromEntries(v.kpis.map((x) => [x.id, x.valor]));
    expect(k['chegaram']).toBe('5');
    expect(k['resolvidos']).toBe('2');
    expect(k['ainda-abertos']).toBe('3');
    expect(v.serie.pontos).toHaveLength(22);
    const a = ver({ parte: 'periodo', de: '2026-10-01', ate: '2026-10-22', emaberto: '1' });
    const ka = Object.fromEntries(a.kpis.map((x) => [x.id, x.valor]));
    expect(ka['em-aberto']).toBe('3');
    expect(ka['parados']).toBe('1');
    expect(ka['sem-responsavel']).toBe('1');
    expect(ver({ parte: 'periodo', de: '2026-10-01', ate: '2026-10-22', emaberto: '1', situacao: 'parados' }).lista.itens.map((x) => x.codigo)).toEqual(['SUP-4']);
  });

  it('o painel sem prazo não tem o vencido: no lugar, quem está sem responsável', () => {
    const semPrazo = { ...ctx, painel: { ...ctx.painel, contaPrazo: false } };
    const v = visaoDoPainel(CHAMADOS, semPrazo, FiltroDaVisaoSchema.parse({ painel: 'sup' }), AGORA);
    expect(v.kpis.map((x) => x.id)).toEqual(['chegaram-hoje', 'resolvidos-hoje', 'em-aberto', 'sem-responsavel']);
  });

  it('o gráfico só aparece quando o painel usa o campo', () => {
    const ids = ver().graficos.map((g) => g.id);
    expect(ids).toContain('assunto');
    expect(ids).toContain('campo:canal');
    expect(ids).not.toContain('operadora');
    expect(ids).not.toContain('etiqueta');
  });
});

describe('a arrumação da Visão', () => {
  it('de fábrica: o tempo em cima, a linha toda; os outros em pizza; o assunto agrupado', () => {
    const a = montarVisao(undefined, ['serie', 'etapa', 'assunto', 'cliente', 'campo:canal']);
    expect(a.map((x) => x.id)).toEqual(['serie', 'assunto', 'cliente', 'etapa', 'campo:canal']);
    expect(a[0]).toEqual({ id: 'serie', largura: 'inteira', oculto: false });
    expect(a.find((x) => x.id === 'assunto')!.agrupar).toBe(true);
  });

  it('a guardada fica na ordem dela; o que saiu some e o novo entra no fim', () => {
    const a = montarVisao([{ id: 'cliente', largura: 'inteira', oculto: false, forma: 'barras' }, { id: 'campo:velho', largura: 'metade', oculto: false }, { id: 'serie', largura: 'inteira', oculto: true }], ['serie', 'cliente', 'etapa']);
    expect(a.map((x) => x.id)).toEqual(['cliente', 'serie', 'etapa']);
    expect(a[0]!.forma).toBe('barras');
    expect(a[1]!.oculto).toBe(true);
  });
});
