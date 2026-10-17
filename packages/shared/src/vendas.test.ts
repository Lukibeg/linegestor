import { describe, expect, it } from 'vitest';
import { instanteLocal } from './atendimento-prazos.js';
import {
  AJUSTES_DO_PAINEL_DE_VENDAS, campoDoTipo, ETAPAS_DO_PAINEL_DE_VENDAS, faltaParaEtapa, mensagemDoQueFalta, problemaNasEtapasDoTipo, textoDoEvento,
  type DadosObrigatorios, type EtapaPainel,
} from './atendimento.js';
import { reais } from './formatos.js';
import {
  FiltroDoRelatorioDeVendasSchema, passagensDosEventos, passagensNoPainel, periodosDoRelatorio, relatorioDeVendas, type NegociacaoParaRelatorio,
} from './vendas.js';

const etapas: EtapaPainel[] = ETAPAS_DO_PAINEL_DE_VENDAS.map((e, i) => ({ ...e, id: ['lead', 'qual', 'prop', 'neg', 'ganho', 'perdido'][i]!, avisar: [] }));
const painel = { id: 'com', etapas, ajustes: { ...AJUSTES_DO_PAINEL_DE_VENDAS, metaMensal: 5_000_000 } };
const em = (dia: string, hora = '10:00') => instanteLocal(dia, hora).toISOString();

describe('as etapas do painel de Vendas', () => {
  it('as de fábrica servem; falta o Perdido, dois Ganhos, o Resolvido e o nível, não', () => {
    expect(problemaNasEtapasDoTipo('vendas', etapas)).toBeNull();
    expect(problemaNasEtapasDoTipo('vendas', etapas.filter((e) => e.resultado !== 'perdido'))).toBe('O painel de Vendas precisa da etapa Perdido.');
    expect(problemaNasEtapasDoTipo('vendas', [...etapas, { ...etapas[4]!, id: 'g2', nome: 'Ganho 2' }])).toBe('O painel de Vendas tem uma etapa Ganho só (a lista tem 2).');
    expect(problemaNasEtapasDoTipo('vendas', etapas.map((e) => (e.resultado === 'ganho' ? { ...e, tipo: 'andamento' as const } : e)))).toContain('o tipo dela é Fechado');
    expect(problemaNasEtapasDoTipo('vendas', [...etapas, { ...etapas[1]!, id: 'arq', nome: 'Arquivado', tipo: 'fechado' as const }])).toContain('Arquivado não pode fechar');
    expect(problemaNasEtapasDoTipo('vendas', [...etapas, { ...etapas[1]!, id: 'ass', nome: 'Assinado', tipo: 'resolvido' as const }])).toContain('não tem a etapa Resolvido');
    expect(problemaNasEtapasDoTipo('vendas', etapas.map((e) => (e.id === 'qual' ? { ...e, nivel: 1 as const } : e)))).toContain('não tem níveis');
    expect(problemaNasEtapasDoTipo('gestao', etapas)).toBe('Ganho e Perdido são etapas do painel de Vendas.');
  });
  it('cada tipo de painel com os seus campos: o valor é da venda; a gravidade, do chamado', () => {
    expect(campoDoTipo('vendas', 'valor')).toBe(true);
    expect(campoDoTipo('vendas', 'gravidade')).toBe(false);
    expect(campoDoTipo('gestao', 'valor')).toBe(false);
    expect(campoDoTipo('gestao', 'relato')).toBe(true);
  });
});

describe('o que falta para a negociação andar', () => {
  const dados = (d: Partial<DadosObrigatorios> = {}): DadosObrigatorios => ({
    tipoChamado: 'chamado', clienteId: null, contatoNome: null, contatoTelefone: null, relato: null, descricao: null, assuntoId: null, tipo: null, gravidade: null,
    alcance: null, prioridade: null, produtos: [], operadoras: [], responsavelId: null, solucao: null, causa: null, validacao: null, checklist: [], tempoMinutos: 0,
    campos: {}, valor: null, empresa: null, motivoPerda: null, ...d,
  });
  const etapa = (id: string) => etapas.find((e) => e.id === id)!;
  it('a Proposta pede o valor; o Perdido, sempre, o motivo', () => {
    expect(faltaParaEtapa(dados(), etapa('prop'))).toEqual(['valor']);
    expect(faltaParaEtapa(dados({ valor: 0 }), etapa('prop'))).toEqual([]);
    expect(faltaParaEtapa(dados(), etapa('perdido'))).toEqual(['motivoPerda']);
    expect(mensagemDoQueFalta(['motivoPerda'], 'Perdido')).toBe('Para ir para Perdido, falta preencher: O motivo da perda.');
    expect(faltaParaEtapa(dados({ motivoPerda: 'Preço' }), etapa('perdido'))).toEqual([]);
  });
  it('a empresa que ainda não é cliente conta como o cliente', () => {
    const pedeCliente = { ...etapa('qual'), obrigatorios: ['cliente' as const] };
    expect(faltaParaEtapa(dados(), pedeCliente)).toEqual(['cliente']);
    expect(faltaParaEtapa(dados({ empresa: 'Padaria Estrela' }), pedeCliente)).toEqual([]);
  });
  it('o histórico fala de venda', () => {
    expect(textoDoEvento('criado', { origem: 'manual', etapa: 'Lead', venda: true })).toBe('criou a negociação em Lead');
    expect(textoDoEvento('criado', { origem: 'manual', etapa: 'Novo' })).toBe('abriu o chamado em Novo');
    expect(textoDoEvento('etapa', { de: { nome: 'Negociação' }, para: { nome: 'Ganho' }, resultado: 'ganho', valor: 1_250_000 }))
      .toBe(`marcou como ganho (${reais(1_250_000)}), estava em Negociação`);
    expect(textoDoEvento('etapa', { de: { nome: 'Proposta enviada' }, para: { nome: 'Perdido' }, resultado: 'perdido', motivoPerda: 'Preço', concluidoEm: '2026-10-09' }))
      .toBe('marcou como perdido: Preço (estava em Proposta enviada) — em 09/10/2026');
  });
});

describe('a trajetória pelas etapas', () => {
  it('dos eventos: a etapa em que nasceu e cada mudança', () => {
    const p = passagensDosEventos(em('2026-10-01'), 'neg', [
      { tipo: 'etapa', em: em('2026-10-05'), dados: { de: { id: 'qual' }, para: { id: 'neg' } } },
      { tipo: 'criado', em: em('2026-10-01'), dados: { etapaId: 'lead' } },
      { tipo: 'etapa', em: em('2026-10-03'), dados: { de: { id: 'lead' }, para: { id: 'qual' } } },
      { tipo: 'campo', em: em('2026-10-04'), dados: {} },
    ]);
    expect(p).toEqual([
      { etapaId: 'lead', desde: em('2026-10-01'), ate: em('2026-10-03') },
      { etapaId: 'qual', desde: em('2026-10-03'), ate: em('2026-10-05') },
      { etapaId: 'neg', desde: em('2026-10-05'), ate: null },
    ]);
    // sem eventos (um cartão antigo): a etapa de agora desde a criação
    expect(passagensDosEventos(em('2026-10-01'), 'prop', [])).toEqual([{ etapaId: 'prop', desde: em('2026-10-01'), ate: null }]);
  });
  it('a que veio do Suporte começa quando entrou no Comercial', () => {
    const p = [{ etapaId: 'sup-n1', desde: em('2026-08-01'), ate: em('2026-10-10') }, { etapaId: 'lead', desde: em('2026-10-10'), ate: null }];
    expect(passagensNoPainel(p, new Set(etapas.map((e) => e.id)))).toEqual([p[1]]);
  });
});

describe('o relatório de vendas', () => {
  const n = (d: Partial<NegociacaoParaRelatorio> & Pick<NegociacaoParaRelatorio, 'id'> & { etapaId: string }): NegociacaoParaRelatorio => {
    const { etapaId, ...resto } = d;
    const etapa = etapas.find((e) => e.id === etapaId)!;
    return {
      valor: null, criadoEm: em('2026-10-01'), fechadoEm: null, resultado: etapa.resultado,
      passagens: [{ etapaId, desde: d.criadoEm ?? em('2026-10-01'), ate: null }], ...resto,
    };
  };
  const passou = (...xs: Array<[string, string]>) => xs.map(([etapaId, dia], i) => ({ etapaId, desde: em(dia), ate: xs[i + 1] ? em(xs[i + 1]![1]) : null }));
  const todas = [
    // ganha em 10 dias, passando pelo funil todo
    n({ id: 'a', etapaId: 'ganho', valor: 1_000_000, fechadoEm: em('2026-10-11'),
      passagens: passou(['lead', '2026-10-01'], ['qual', '2026-10-02'], ['prop', '2026-10-04'], ['neg', '2026-10-08'], ['ganho', '2026-10-11']) }),
    // ganha em 4 dias, pulando a Qualificação e a Negociação
    n({ id: 'b', etapaId: 'ganho', valor: 500_000, criadoEm: em('2026-10-05'), fechadoEm: em('2026-10-09'),
      passagens: passou(['lead', '2026-10-05'], ['prop', '2026-10-06'], ['ganho', '2026-10-09']) }),
    // perdida na Proposta
    n({ id: 'c', etapaId: 'perdido', valor: 300_000, fechadoEm: em('2026-10-12'),
      passagens: passou(['lead', '2026-10-01'], ['qual', '2026-10-03'], ['prop', '2026-10-06'], ['perdido', '2026-10-12']) }),
    // abertas: uma grande que pulou a Proposta, uma sem valor
    n({ id: 'd', etapaId: 'neg', valor: 2_000_000, criadoEm: em('2026-10-02'), passagens: passou(['lead', '2026-10-02'], ['qual', '2026-10-06'], ['neg', '2026-10-13']) }),
    n({ id: 'e', etapaId: 'lead', criadoEm: em('2026-10-14') }),
    // de setembro (fora do período): uma aberta e uma ganha
    n({ id: 'f', etapaId: 'qual', valor: 200_000, criadoEm: em('2026-09-20'), passagens: passou(['lead', '2026-09-20'], ['qual', '2026-09-25']) }),
    n({ id: 'g', etapaId: 'ganho', valor: 700_000, criadoEm: em('2026-09-01'), fechadoEm: em('2026-09-15'), passagens: passou(['lead', '2026-09-01'], ['ganho', '2026-09-15']) }),
  ];
  const r = relatorioDeVendas(painel, todas, { de: '2026-10-01', ate: '2026-10-16' });

  it('os números do período', () => {
    expect(r.numeros).toEqual({
      novos: { qtd: 5, valor: 1_000_000 + 500_000 + 300_000 + 2_000_000 },
      ganhos: { qtd: 2, valor: 1_500_000 },
      perdidos: { qtd: 1, valor: 300_000 },
      conversao: 66.7,
      ticketMedio: 750_000,
    });
  });
  it('o funil: até onde chegaram as criadas no período, onde se perderam e quantas foram ganhas', () => {
    expect(r.funil.map((f) => [f.nome, f.chegaram, f.perdidas])).toEqual([
      ['Lead', 5, 0],
      ['Qualificação', 4, 0],
      // a que pulou a Proposta (d) chegou até ela: o funil conta a etapa mais adiante; a perdida (c) estava nela
      ['Proposta enviada', 4, 1],
      // a ganha chegou ao fim, por onde quer que tenha passado (b)
      ['Negociação', 3, 0],
    ]);
    expect(r.funilGanhas).toBe(2);
  });
  it('sem nada que acabou, a conversão e o ticket ficam vazios (não zero)', () => {
    const vazio = relatorioDeVendas(painel, [], { de: '2026-10-01', ate: '2026-10-16' });
    expect(vazio.numeros).toMatchObject({ conversao: null, ticketMedio: null, novos: { qtd: 0, valor: 0 } });
    expect(vazio.funil.map((f) => f.chegaram)).toEqual([0, 0, 0, 0]);
  });
  it('o período: os atalhos e o filtro', () => {
    const agora = new Date(em('2026-10-16', '15:00'));
    expect(periodosDoRelatorio(agora).map((p) => [p.id, p.de, p.ate])).toEqual([
      ['mes', '2026-10-01', '2026-10-16'], ['anterior', '2026-09-01', '2026-09-30'], ['trimestre', '2026-10-01', '2026-10-16'],
      ['90', '2026-07-19', '2026-10-16'], ['ano', '2026-01-01', '2026-10-16'],
    ]);
    expect(FiltroDoRelatorioDeVendasSchema.safeParse({ painel: 'COM', de: '2026-10-16', ate: '2026-10-01' }).success).toBe(false);
    expect(FiltroDoRelatorioDeVendasSchema.safeParse({ painel: 'COM', de: '2020-01-01', ate: '2026-10-01' }).success).toBe(false);
    expect(FiltroDoRelatorioDeVendasSchema.parse({ painel: 'COM', de: '2026-10-01', ate: '2026-10-16' })).toEqual({ painel: 'COM', de: '2026-10-01', ate: '2026-10-16' });
  });
});
