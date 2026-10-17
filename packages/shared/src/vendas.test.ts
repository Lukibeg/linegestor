import { describe, expect, it } from 'vitest';
import { instanteLocal } from './atendimento-prazos.js';
import {
  AJUSTES_DO_PAINEL_DE_VENDAS, campoDoTipo, ETAPAS_DO_PAINEL_DE_VENDAS, faltaParaEtapa, linhasDoValorPorProduto, mensagemDoQueFalta, mesmoValorPorProduto,
  problemaNasEtapasDoTipo, somaDosProdutos, textoDoEvento, textoDoValorPorProduto, VALOR_E_A_SOMA, VALOR_SO_DOS_PRODUTOS, valorPorProduto,
  type DadosObrigatorios, type EtapaPainel,
} from './atendimento.js';
import { reais } from './formatos.js';
import {
  FiltroDoRelatorioDeVendasSchema, passagensDosEventos, passagensNoPainel, periodoDeComparacao, periodosDoRelatorio, relatorioDeVendas, type NegociacaoParaRelatorio,
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

describe('o valor por produto (o pedido do Luan: "dividir o valor por produtos e no final tenha o total")', () => {
  const sem = { produtos: ['pbx', 'tronco'], valores: {}, valor: 1_000_000 };
  const dividida = { produtos: ['pbx', 'tronco'], valores: { pbx: 980_000, tronco: 270_000 }, valor: 1_250_000 };

  it('o total é a soma; sem nenhum produto com valor, não há total', () => {
    expect(somaDosProdutos({ pbx: 980_000, tronco: 270_000 })).toBe(1_250_000);
    expect(somaDosProdutos({ cortesia: 0 })).toBe(0);
    expect(somaDosProdutos({})).toBeNull();
    expect(somaDosProdutos(null)).toBeNull();
  });

  it('com valor por produto, o valor da negociação é o total', () => {
    expect(valorPorProduto(sem, { valores: { pbx: 980_000, tronco: 270_000 } })).toEqual({ ok: true, ...dividida });
    // um produto sem valor fica de fora da soma
    expect(valorPorProduto(sem, { valores: { pbx: 980_000 } })).toMatchObject({ ok: true, valor: 980_000, valores: { pbx: 980_000 } });
    // o mesmo total junto não atrapalha; outro valor é recusado
    expect(valorPorProduto(sem, { valores: { pbx: 980_000, tronco: 270_000 }, valor: 1_250_000 })).toMatchObject({ ok: true, valor: 1_250_000 });
    expect(valorPorProduto(dividida, { valor: 1_000_000 })).toEqual({ ok: false, erro: VALOR_E_A_SOMA });
    // só dos produtos da negociação (os que vêm no mesmo pedido contam)
    expect(valorPorProduto(sem, { valores: { ura: 100 } })).toEqual({ ok: false, erro: VALOR_SO_DOS_PRODUTOS });
    expect(valorPorProduto(sem, { produtos: ['pbx', 'tronco', 'ura'], valores: { ura: 100 } })).toMatchObject({ ok: true, valor: 100 });
  });

  it('o produto que sai leva o valor dele; sem nenhum, a negociação fica sem valor', () => {
    expect(valorPorProduto(dividida, { produtos: ['pbx'] })).toEqual({ ok: true, produtos: ['pbx'], valores: { pbx: 980_000 }, valor: 980_000 });
    expect(valorPorProduto(dividida, { produtos: [] })).toEqual({ ok: true, produtos: [], valores: {}, valor: null });
    // o produto que entra (sem valor) não muda o total
    expect(valorPorProduto(dividida, { produtos: ['pbx', 'tronco', 'ura'] })).toMatchObject({ ok: true, valor: 1_250_000 });
  });

  it('de volta a um valor só: o valor que vier (o total, na tela); sem divisão, o valor único de sempre', () => {
    expect(valorPorProduto(dividida, { valores: {}, valor: 1_250_000 })).toEqual({ ok: true, produtos: ['pbx', 'tronco'], valores: {}, valor: 1_250_000 });
    expect(valorPorProduto(dividida, { valores: null })).toMatchObject({ ok: true, valores: {}, valor: 1_250_000 });
    expect(valorPorProduto(sem, { valor: 2_000_000 })).toMatchObject({ ok: true, valor: 2_000_000 });
    expect(valorPorProduto(sem, { produtos: ['pbx'] })).toMatchObject({ ok: true, valor: 1_000_000 });
  });

  it('o texto do histórico e a comparação', () => {
    const nomes = [{ id: 'pbx', nome: 'LinePBX' }, { id: 'tronco', nome: 'VoiceNet' }, { id: 'chat', nome: 'LineChat' }];
    expect(textoDoValorPorProduto(nomes, dividida.valores)).toBe(`LinePBX ${reais(980_000)} · VoiceNet ${reais(270_000)}`);
    expect(textoDoValorPorProduto(nomes, {})).toBeNull();
    expect(linhasDoValorPorProduto(nomes, dividida.valores).map((l) => l.nome)).toEqual(['LinePBX', 'VoiceNet']);
    expect(mesmoValorPorProduto({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(mesmoValorPorProduto({ a: 1 }, { a: 2 })).toBe(false);
    expect(mesmoValorPorProduto({}, null)).toBe(true);
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
  const n = (d: Partial<NegociacaoParaRelatorio> & Pick<NegociacaoParaRelatorio, 'id' | 'etapaId'>): NegociacaoParaRelatorio => {
    const etapa = etapas.find((e) => e.id === d.etapaId)!;
    return {
      codigo: `COM-${d.id}`, titulo: `Negociação ${d.id}`, empresa: null, responsavel: 'Camila Souza', valor: null, criadoEm: em('2026-10-01'), fechadoEm: null,
      resultado: etapa.resultado, motivoPerda: null, passagens: [{ etapaId: d.etapaId, desde: d.criadoEm ?? em('2026-10-01'), ate: null }], ...d,
    };
  };
  const passou = (...xs: Array<[string, string]>) => xs.map(([etapaId, dia], i) => ({ etapaId, desde: em(dia), ate: xs[i + 1] ? em(xs[i + 1]![1]) : null }));
  const todas = [
    // ganha em 10 dias, passando pelo funil todo
    n({ id: 'a', etapaId: 'ganho', valor: 1_000_000, fechadoEm: em('2026-10-11'), empresa: 'Padaria Estrela',
      passagens: passou(['lead', '2026-10-01'], ['qual', '2026-10-02'], ['prop', '2026-10-04'], ['neg', '2026-10-08'], ['ganho', '2026-10-11']) }),
    // ganha em 4 dias, pulando a Qualificação e a Negociação
    n({ id: 'b', etapaId: 'ganho', valor: 500_000, criadoEm: em('2026-10-05'), fechadoEm: em('2026-10-09'),
      passagens: passou(['lead', '2026-10-05'], ['prop', '2026-10-06'], ['ganho', '2026-10-09']) }),
    // perdida na Proposta
    n({ id: 'c', etapaId: 'perdido', valor: 300_000, fechadoEm: em('2026-10-12'), motivoPerda: 'Preço',
      passagens: passou(['lead', '2026-10-01'], ['qual', '2026-10-03'], ['prop', '2026-10-06'], ['perdido', '2026-10-12']) }),
    // abertas: uma grande que pulou a Proposta, uma sem valor
    n({ id: 'd', etapaId: 'neg', valor: 2_000_000, criadoEm: em('2026-10-02'), passagens: passou(['lead', '2026-10-02'], ['qual', '2026-10-06'], ['neg', '2026-10-13']) }),
    n({ id: 'e', etapaId: 'lead', criadoEm: em('2026-10-14') }),
    // de setembro: uma aberta (do dia 20) e uma ganha (do mesmo período de setembro, a comparação)
    n({ id: 'f', etapaId: 'qual', valor: 200_000, criadoEm: em('2026-09-20'), passagens: passou(['lead', '2026-09-20'], ['qual', '2026-09-25']) }),
    n({ id: 'g', etapaId: 'ganho', valor: 700_000, criadoEm: em('2026-09-01'), fechadoEm: em('2026-09-15'), passagens: passou(['lead', '2026-09-01'], ['ganho', '2026-09-15']) }),
  ];
  const r = relatorioDeVendas(painel, todas, { de: '2026-10-01', ate: '2026-10-16' });

  it('os números do período, com as negociações por trás', () => {
    expect(r.numeros).toEqual({
      novos: { qtd: 5, valor: 1_000_000 + 500_000 + 300_000 + 2_000_000, ids: ['a', 'b', 'c', 'd', 'e'] },
      ganhos: { qtd: 2, valor: 1_500_000, ids: ['a', 'b'] },
      perdidos: { qtd: 1, valor: 300_000, ids: ['c'] },
      conversao: 66.7,
      ticketMedio: 750_000,
    });
    // a janela: as que entraram, as ganhas e as perdidas (e as ganhas de cada mês: a de setembro), as mais novas primeiro;
    // o motivo só na perdida
    expect(r.negociacoes.map((x) => x.codigo)).toEqual(['COM-e', 'COM-b', 'COM-d', 'COM-a', 'COM-c', 'COM-g']);
    expect(r.negociacoes.find((x) => x.id === 'c')).toMatchObject({ etapa: 'Perdido', resultado: 'perdido', motivoPerda: 'Preço', valor: 300_000 });
    expect(r.negociacoes.find((x) => x.id === 'd')).toMatchObject({ etapa: 'Negociação', resultado: null, motivoPerda: null });
  });
  it('comparado com o mesmo pedaço de setembro', () => {
    expect(r.anterior).toMatchObject({ de: '2026-09-01', ate: '2026-09-16', nome: 'o mesmo período de setembro' });
    expect(r.anterior.numeros).toMatchObject({ novos: { qtd: 1, valor: 700_000 }, ganhos: { qtd: 1, valor: 700_000 }, perdidos: { qtd: 0 }, conversao: 100 });
  });
  it('o mês que já passou: comparado com o mês anterior inteiro', () => {
    const setembro = relatorioDeVendas(painel, todas, { de: '2026-09-01', ate: '2026-09-30' });
    expect(setembro.anterior).toMatchObject({ de: '2026-08-01', ate: '2026-08-31', nome: 'agosto' });
    expect(setembro.numeros.ganhos).toMatchObject({ qtd: 1, valor: 700_000 });
  });
  it('os ganhos mês a mês: os 12 meses até o do fim do período, o último até o fim dele', () => {
    expect(r.meses.map((m) => m.mes)).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ]);
    expect(r.meses.at(-1)).toEqual({
      mes: '2026-10', nome: 'outubro de 2026', curto: 'out/26', ganho: 1_500_000, qtd: 2, ids: ['a', 'b'],
      // outubro até o dia 16, comparado com setembro até o dia 16 (a do dia 15)
      parcial: true, ate: '2026-10-16', antes: 700_000,
    });
    expect(r.meses.at(-2)).toMatchObject({ mes: '2026-09', ganho: 700_000, qtd: 1, parcial: false, ate: '2026-09-30', antes: 0 });
    // a janela do mês mostra as ganhas dele, mesmo as que não são do período (a de setembro)
    expect(r.negociacoes.map((x) => x.id)).toContain('g');
  });
  it('o funil: até onde chegaram as que entraram no período, onde se perderam e quantas foram ganhas', () => {
    expect(r.funil.map((f) => [f.nome, f.chegaram, f.perdidas])).toEqual([
      ['Lead', ['a', 'b', 'c', 'd', 'e'], []],
      ['Qualificação', ['a', 'b', 'c', 'd'], []],
      // a que pulou a Proposta (d) chegou até ela: o funil conta a etapa mais adiante; a perdida (c) estava nela
      ['Proposta enviada', ['a', 'b', 'c', 'd'], ['c']],
      // a ganha chegou ao fim, por onde quer que tenha passado (b)
      ['Negociação', ['a', 'b', 'd'], []],
    ]);
    expect(r.funilGanhas).toEqual(['a', 'b']);
  });
  it('sem nada que acabou, a conversão e o ticket ficam vazios (não zero)', () => {
    const vazio = relatorioDeVendas(painel, [], { de: '2026-10-01', ate: '2026-10-16' });
    expect(vazio.numeros).toMatchObject({ conversao: null, ticketMedio: null, novos: { qtd: 0, valor: 0, ids: [] } });
    expect(vazio.funil.map((f) => f.chegaram.length)).toEqual([0, 0, 0, 0]);
  });
  it('o período: os atalhos, a comparação e o filtro', () => {
    const agora = new Date(em('2026-10-16', '15:00'));
    expect(periodosDoRelatorio(agora).map((p) => [p.id, p.de, p.ate])).toEqual([
      ['mes', '2026-10-01', '2026-10-16'], ['anterior', '2026-09-01', '2026-09-30'], ['trimestre', '2026-10-01', '2026-10-16'],
      ['90', '2026-07-19', '2026-10-16'], ['ano', '2026-01-01', '2026-10-16'],
    ]);
    expect(periodoDeComparacao('2026-03-01', '2026-03-31')).toEqual({ de: '2026-02-01', ate: '2026-02-28', nome: 'fevereiro' });
    // o dia que o mês de antes não tem fica no último dia dele
    expect(periodoDeComparacao('2026-03-01', '2026-03-30')).toEqual({ de: '2026-02-01', ate: '2026-02-28', nome: 'o mesmo período de fevereiro' });
    expect(periodoDeComparacao('2026-07-19', '2026-10-16')).toEqual({ de: '2026-04-20', ate: '2026-07-18', nome: 'o período anterior' });
    expect(FiltroDoRelatorioDeVendasSchema.safeParse({ painel: 'COM', de: '2026-10-16', ate: '2026-10-01' }).success).toBe(false);
    expect(FiltroDoRelatorioDeVendasSchema.safeParse({ painel: 'COM', de: '2020-01-01', ate: '2026-10-01' }).success).toBe(false);
    expect(FiltroDoRelatorioDeVendasSchema.parse({ painel: 'COM', de: '2026-10-01', ate: '2026-10-16' })).toEqual({ painel: 'COM', de: '2026-10-01', ate: '2026-10-16' });
  });
});
