/**
 * O Simulador do Comercial (2.0.2, decisão 0052): as contas, o sinal, as parcelas, os aparelhos (comodato,
 * venda, locação), o cenário de antes de 21/10 (com os ramais e a margem que se queria), a validação e o que
 * mudou.
 */
import { describe, expect, it } from 'vitest';
import {
  AJUSTES_DO_SIMULADOR_PADRAO, AjustesDoSimuladorSchema, CUSTOS_DA_HELENA, MODELO_DA_HELENA, SimulacaoGravarSchema, ajustesDoSimulador, cenarioNovo, contasDoCenario,
  comPrecoPorProduto, custoPorFaixas, dividirEmParcelas, duplicarCenario, linhaDaTabela, linhasDoModelo, mudancasDaSimulacao, mudancasDosAjustes, normalizarPorProduto,
  TIPOS_DO_GRUPO, TIPO_NOVO_DO_GRUPO, tiposParaEscolher, pagamentoPorProduto, precoDaUnidade, proximoNomeDeCenario, repartir, resumoDoCenario, semOQueSaiu,
  LINECHAT_DO_SIMULADOR, ehLinhaDoLineChat, linhasParaOLineChat, linhasSemOLineChat, mudarQuantidadeDoLineChat, quadroDoLineChat, textoDosInclusos,
  sinalDaMargem, textoDasFaixasDePreco, textoDoSePagaEm, lerValorUnitario, margemDasGanhas, textoDoValorUnitario, lerPercentual, textoDoPercentual,
  type AjustesDoSimulador, type CenarioDaSimulacao, type CustoDaTabela, type LinhaDoCenario,
} from './simulador.js';

const FAIXAS = { verde: 35, vermelho: 20 };
const linha = (l: Partial<LinhaDoCenario> & Pick<LinhaDoCenario, 'id' | 'tipo'>): LinhaDoCenario => ({
  nome: l.id, custoId: null, qtd: 1, valor: 0, modalidade: l.tipo === 'aparelho' ? 'comodato' : null, preco: null, faixas: null, unidade: null, ...l,
}) as LinhaDoCenario;
const custo = (c: Partial<CustoDaTabela> & Pick<CustoDaTabela, 'id' | 'nome' | 'tipo'>): CustoDaTabela => ({ valor: null, modalidade: null, faixas: null, unidade: null, ...c }) as CustoDaTabela;

/** O exemplo da página de opções (20/10): R$ 990 por mês, R$ 1.500 de ativação, 24 meses. */
function exemplo(): CenarioDaSimulacao {
  return {
    id: 'a', nome: 'Cenário A', mensalidade: 99_000, ativacao: 150_000, parcelas: 1, prazo: 24, imposto: 6, produtos: ['linepbx'],
    linhas: [
      linha({ id: 'tel', nome: 'Telefone IP', tipo: 'aparelho', qtd: 10, valor: 39_000 }),
      linha({ id: 'head', nome: 'Headset USB', tipo: 'aparelho', qtd: 4, valor: 18_000 }),
      linha({ id: 'inst', nome: 'Instalação', tipo: 'unica', qtd: 4, valor: 9_000 }),
      linha({ id: 'nuvem', nome: 'Nuvem do PABX', tipo: 'mensal', qtd: 10, valor: 900 }),
      linha({ id: 'dids', nome: 'Números', tipo: 'mensal', qtd: 3, valor: 1_500 }),
      linha({ id: 'sup', nome: 'Suporte', tipo: 'mensal', qtd: 3, valor: 6_000 }),
      linha({ id: 'com', nome: 'Comissão do vendedor', tipo: 'pct_ativacao', valor: 10 }),
      linha({ id: 'rec', nome: 'Comissão recorrente', tipo: 'pct_mensalidade', valor: 2 }),
    ],
  };
}

describe('a conta do cenário', () => {
  it('o exemplo da página de opções: sobram R$ 595,80 por mês (60,2%), saem R$ 3.124,20 antes, se paga em 7 meses, o contrato dá R$ 10.579,20', () => {
    const k = contasDoCenario(exemplo(), FAIXAS);
    expect(k.mensalTotal).toBe(99_000);
    expect(k.custoMensalFixo).toBe(31_500); // a nuvem (10 × R$ 9) + os números + o suporte
    expect(k.impostoMensal).toBe(5_940);
    expect(k.comissaoMensal).toBe(1_980);
    expect(k.sobraMensal).toBe(59_580);
    expect(Math.round(k.margem! * 1000) / 10).toBe(60.2);
    expect(k.sinal).toBe('verde');
    expect(k.custoUnico).toBe(498_000);
    expect(k.impostoDaEntrada).toBe(9_000);
    expect(k.comissaoDaEntrada).toBe(15_000);
    // o 1º mês é o da assinatura: a ativação líquida (R$ 1.260) e a 1ª sobra (R$ 595,80) menos o que é pago de uma vez (R$ 4.980)
    expect(k.serie[0]).toBe(-372_000 + 59_580);
    expect(k.investimento).toBe(312_420);
    expect(k.sePagaEm).toEqual({ tipo: 'mes', mes: 7, depoisDoPrazo: false });
    expect(textoDoSePagaEm(k.sePagaEm)).toBe('em 7 meses');
    expect(k.resultado).toBe(1_057_920);
    expect(k.serie).toHaveLength(24);
    expect(k.totalInvestido).toBe(498_000 + 15_000); // os aparelhos, a instalação e a comissão da venda
    expect(k.faltam).toEqual([]);
    // cada linha na conta: a nuvem, 10 × R$ 9; a comissão recorrente, 2% da mensalidade
    expect(k.linhas.find((l) => l.id === 'nuvem')).toMatchObject({ qtd: 10, custo: 9_000, quando: 'por-mes' });
    expect(k.linhas.find((l) => l.id === 'rec')).toMatchObject({ custo: 1_980, quando: 'por-mes' });
    expect(k.linhas.find((l) => l.id === 'com')).toMatchObject({ custo: 15_000, quando: 'uma-vez' });
  });


  it('o sinal pelas faixas: verde a partir de 35%, vermelho abaixo de 20%', () => {
    expect(sinalDaMargem(0.35, FAIXAS)).toBe('verde');
    expect(sinalDaMargem(0.3499, FAIXAS)).toBe('amarelo');
    expect(sinalDaMargem(0.2, FAIXAS)).toBe('amarelo');
    expect(sinalDaMargem(0.1999, FAIXAS)).toBe('vermelho');
    expect(sinalDaMargem(-0.5, FAIXAS)).toBe('vermelho');
    // sem mensalidade, sem margem e sem sinal
    const k = contasDoCenario({ ...exemplo(), mensalidade: 0 }, FAIXAS);
    expect(k.margem).toBeNull();
    expect(k.sinal).toBeNull();
  });

  it('os aparelhos: o vendido entra na ativação; o alugado, na mensalidade; os três custam uma vez', () => {
    const c = exemplo();
    c.linhas[0] = { ...c.linhas[0]!, modalidade: 'venda', preco: 50_000 }; // 10 telefones vendidos a R$ 500
    c.linhas[1] = { ...c.linhas[1]!, modalidade: 'locacao', preco: 2_500 }; // 4 headsets alugados a R$ 25 por mês
    const k = contasDoCenario(c, FAIXAS);
    expect(k.vendaDeAparelhos).toBe(500_000);
    expect(k.entradaTotal).toBe(650_000);
    expect(k.aluguel).toBe(10_000);
    expect(k.mensalTotal).toBe(109_000);
    expect(k.custoUnico).toBe(498_000);
    // o imposto e a comissão recorrente valem sobre o aluguel também (é o que o cliente paga por mês)
    expect(k.impostoMensal).toBe(6_540);
    expect(k.linhas.find((l) => l.id === 'tel')).toMatchObject({ receita: 500_000, custo: 390_000 });
    // o preço do vendido que falta entra no "faltam"
    c.linhas[0] = { ...c.linhas[0]!, preco: null };
    expect(contasDoCenario(c, FAIXAS).faltam).toEqual(['Telefone IP']);
  });

  it('a ativação parcelada: a primeira na assinatura, as outras com as mensalidades', () => {
    expect(dividirEmParcelas(150_000, 3)).toEqual([50_000, 50_000, 50_000]);
    expect(dividirEmParcelas(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
    const k = contasDoCenario({ ...exemplo(), parcelas: 3 }, FAIXAS);
    // 1º mês: R$ 500 − 16% (imposto e comissão) − R$ 4.980 + a 1ª sobra (R$ 595,80)
    expect(k.serie[0]).toBe(-456_000 + 59_580);
    // 2º mês: + a sobra (R$ 595,80) + a 2ª parcela líquida (R$ 420)
    expect(k.serie[1]).toBe(k.serie[0]! + 59_580 + 42_000);
    expect(k.serie[3]).toBe(k.serie[2]! + 59_580);
    expect(k.investimento).toBe(396_420);
    // o fim do contrato é o mesmo de à vista (a ativação chega toda, só mais tarde)
    expect(k.resultado).toBe(1_057_920);
    expect(k.sePagaEm).toEqual({ tipo: 'mes', mes: 7, depoisDoPrazo: false });
    // a ativação não vai em mais vezes que o prazo
    expect(contasDoCenario({ ...exemplo(), prazo: 2, parcelas: 6 }, FAIXAS).parcelas).toHaveLength(2);
  });

  it('quando a venda se paga: na ativação, depois do prazo ou nunca', () => {
    // a ativação cobre os aparelhos: já na ativação
    const k1 = contasDoCenario({ ...exemplo(), ativacao: 700_000 }, FAIXAS);
    expect(k1.sePagaEm).toEqual({ tipo: 'entrada' });
    expect(k1.investimento).toBe(0);
    expect(textoDoSePagaEm(k1.sePagaEm)).toBe('já na ativação');
    // 6 meses de contrato não pagam os R$ 3.720: se paga no 7º, depois do prazo
    const k2 = contasDoCenario({ ...exemplo(), prazo: 6 }, FAIXAS);
    expect(k2.sePagaEm).toEqual({ tipo: 'mes', mes: 7, depoisDoPrazo: true });
    expect(textoDoSePagaEm(k2.sePagaEm)).toBe('em 7 meses (depois do prazo)');
    // a mensalidade não cobre o custo do mês: nunca
    const k3 = contasDoCenario({ ...exemplo(), mensalidade: 30_000 }, FAIXAS);
    expect(k3.sobraMensal).toBeLessThan(0);
    expect(k3.sePagaEm).toEqual({ tipo: 'nunca' });
    expect(k3.sinal).toBe('vermelho');
    // nada sai antes e não há ativação: a sobra já é lucro desde o 1º mês (e não "já na ativação")
    const sem = exemplo();
    const k4 = contasDoCenario({ ...sem, ativacao: 0, linhas: sem.linhas.filter((l) => l.tipo !== 'aparelho' && l.tipo !== 'unica') }, FAIXAS);
    expect(k4.investimento).toBe(0);
    expect(k4.sePagaEm).toEqual({ tipo: 'sem-custo' });
    expect(textoDoSePagaEm(k4.sePagaEm)).toBe('desde o 1º mês');
    // com ativação e nada antes: a ativação entra como lucro, já na ativação
    expect(contasDoCenario({ ...sem, linhas: sem.linhas.filter((l) => l.tipo !== 'aparelho' && l.tipo !== 'unica') }, FAIXAS).sePagaEm).toEqual({ tipo: 'entrada' });
    // sem ativação, a instalação (R$ 360) sai no 1º mês, e a 1ª sobra (R$ 595,80) já cobre: em 1 mês, nunca no vermelho
    const k5 = contasDoCenario({ ...sem, ativacao: 0, linhas: sem.linhas.filter((l) => l.tipo !== 'aparelho') }, FAIXAS);
    expect(k5.serie[0]).toBe(59_580 - 36_000);
    expect(k5.investimento).toBe(0);
    expect(k5.sePagaEm).toEqual({ tipo: 'mes', mes: 1, depoisDoPrazo: false });
    expect(textoDoSePagaEm(k5.sePagaEm)).toBe('em 1 mês');
  });

  it('o mês a mês: o 1º mês é o da assinatura, com a 1ª mensalidade; o faturamento menos os custos é o lucro, e o detalhe fecha', () => {
    const k = contasDoCenario({ ...exemplo(), parcelas: 3 }, FAIXAS);
    expect(k.meses).toHaveLength(24);
    const [m1, m2, , m4] = k.meses;
    expect(m1).toEqual({
      mes: 1,
      entra: [{ rotulo: 'Mensalidade', valor: 99_000 }, { rotulo: 'Ativação (parcela 1 de 3)', valor: 50_000 }],
      faturamento: 149_000,
      sai: [
        { rotulo: 'Telefone IP', valor: 390_000 }, { rotulo: 'Headset USB', valor: 72_000 }, { rotulo: 'Instalação', valor: 36_000 },
        // cada custo por mês pelo nome, sem agrupar (2.0.3: "eu quero q ele sempre coloque detalhado todos os custos")
        { rotulo: 'Nuvem do PABX', valor: 9_000 }, { rotulo: 'Números', valor: 4_500 }, { rotulo: 'Suporte', valor: 18_000 }, { rotulo: 'Imposto', valor: 8_940 }, { rotulo: 'Comissão do vendedor', valor: 5_000 }, { rotulo: 'Comissão recorrente', valor: 1_980 },
      ],
      custos: 545_420,
      lucro: 149_000 - 545_420,
      acumulado: k.serie[0],
    });
    expect(m2).toMatchObject({ mes: 2, faturamento: 149_000, custos: 47_420, lucro: 101_580, acumulado: k.serie[1] });
    // depois das parcelas da ativação: a mensalidade e os custos do mês
    expect(m4).toMatchObject({ entra: [{ rotulo: 'Mensalidade', valor: 99_000 }], faturamento: 99_000, custos: 39_420, lucro: 59_580 });
    for (const m of k.meses) {
      expect(m.faturamento - m.custos).toBe(m.lucro);
      expect(m.sai.reduce((s, x) => s + x.valor, 0)).toBe(m.custos);
      expect(m.entra.reduce((s, x) => s + x.valor, 0)).toBe(m.faturamento);
    }
    expect(k.meses.reduce((s, m) => s + m.lucro, 0)).toBe(k.resultado);
    // o aparelho comprado parcelado aparece em cada parcela; o vendido, na ativação
    const c = exemplo();
    c.linhas = c.linhas.map((l) => (l.id === 'tel' ? { ...l, parcelas: 10 } : l.id === 'head' ? { ...l, modalidade: 'venda' as const, preco: 30_000 } : l));
    const kp = contasDoCenario(c, FAIXAS);
    expect(kp.meses[0]!.entra).toEqual([{ rotulo: 'Mensalidade', valor: 99_000 }, { rotulo: 'Ativação', valor: 150_000 }, { rotulo: 'Aparelhos vendidos', valor: 120_000 }]);
    expect(kp.meses[0]!.sai.slice(0, 3)).toEqual([{ rotulo: 'Telefone IP (parcela 1 de 10)', valor: 39_000 }, { rotulo: 'Headset USB', valor: 72_000 }, { rotulo: 'Instalação', valor: 36_000 }]);
    expect(kp.meses[9]!.sai[0]).toEqual({ rotulo: 'Telefone IP (parcela 10 de 10)', valor: 39_000 });
    expect(kp.meses[10]!.sai.map((x) => x.rotulo)).toEqual(['Nuvem do PABX', 'Números', 'Suporte', 'Imposto', 'Comissão recorrente']);
    // o custo do mês, parte a parte: cada custo por mês, o imposto e a comissão recorrente, somando o custo do mês
    expect(k.partesDoCustoMensal).toEqual([
      { rotulo: 'Nuvem do PABX', valor: 9_000 }, { rotulo: 'Números', valor: 4_500 }, { rotulo: 'Suporte', valor: 18_000 },
      { rotulo: 'Imposto', valor: 5_940 }, { rotulo: 'Comissão recorrente', valor: 1_980 },
    ]);
    expect(k.partesDoCustoMensal.reduce((s, p) => s + p.valor, 0)).toBe(k.custoMensal);
  });

  it('o "Uma vez" não é mais oferecido (2.0.3); a linha gravada assim continua valendo e mostra o tipo dela', () => {
    expect(TIPOS_DO_GRUPO.fixo).toEqual(['aparelho', 'pct_ativacao']);
    expect(TIPO_NOVO_DO_GRUPO.fixo).toBe('aparelho');
    expect(tiposParaEscolher('fixo', 'aparelho')).toEqual(['aparelho', 'pct_ativacao']);
    expect(tiposParaEscolher('fixo', 'unica')).toEqual(['aparelho', 'pct_ativacao', 'unica']);
    expect(contasDoCenario(exemplo(), FAIXAS).totalInvestido).toBeGreaterThan(0);
  });

  it('repartir: as partes arredondadas somam o total (o centavo vai para quem mais perdeu no arredondamento)', () => {
    expect(repartir(100, [33.4, 33.3, 33.3])).toEqual([34, 33, 33]);
    expect(repartir(99, [33.4, 33.3, 33.3])).toEqual([33, 33, 33]);
    expect(repartir(10, [2.5, 2.5, 5])).toEqual([3, 2, 5]);
    expect(repartir(0, [])).toEqual([]);
  });

  it('o aparelho comprado parcelado: o custo se dilui (a primeira parcela na assinatura); a sobra e o fim do contrato não mudam', () => {
    const base = contasDoCenario(exemplo(), FAIXAS);
    const c = exemplo();
    c.linhas = c.linhas.map((l) => (l.id === 'tel' ? { ...l, parcelas: 10 } : l));
    const k = contasDoCenario(c, FAIXAS);
    // os telefones (R$ 3.900) em 10x de R$ 390: na assinatura saem os headsets, a instalação e a 1ª parcela
    expect(k.linhas.find((l) => l.id === 'tel')).toMatchObject({ custo: 390_000, parcelas: 10 });
    expect(k.saidas.slice(0, 11)).toEqual([108_000 + 39_000, 39_000, 39_000, 39_000, 39_000, 39_000, 39_000, 39_000, 39_000, 39_000, 0]);
    expect(k.custoUnico).toBe(498_000);
    expect(k.sobraMensal).toBe(base.sobraMensal);
    expect(k.serie[0]).toBe(base.serie[0]! + 351_000);
    // no 1º mês, a ativação e a 1ª sobra já cobrem os headsets, a instalação e a 1ª parcela: nunca no vermelho
    expect(k.investimento).toBe(0);
    expect(k.sePagaEm).toEqual({ tipo: 'mes', mes: 1, depoisDoPrazo: false });
    expect(k.resultado).toBe(base.resultado);
    // à vista, nada muda: as saídas são o custo de uma vez na assinatura
    expect(base.saidas[0]).toBe(498_000);
    expect(base.saidas.slice(1).every((v) => v === 0)).toBe(true);
    // nunca mais que o prazo: em 6 meses de contrato, a compra em 10x vira 6x
    expect(contasDoCenario({ ...c, prazo: 6 }, FAIXAS).linhas.find((l) => l.id === 'tel')!.parcelas).toBe(6);
  });

  it('o preço por produto ("uma proposta separada, porém uma negociação única"): um preço para cada produto, e o cenário soma', () => {
    const c = { ...exemplo(), produtos: ['linepbx', 'voicenet'] };
    // passar para o preço por produto: o valor de agora fica no primeiro, os outros começam com zero
    const p = comPrecoPorProduto(c);
    expect(p.porProduto).toEqual([{ produto: 'linepbx', mensalidade: 99_000, ativacao: 150_000 }, { produto: 'voicenet', mensalidade: 0, ativacao: 0 }]);
    expect([p.mensalidade, p.ativacao]).toEqual([99_000, 150_000]);
    // a gravação refaz as somas, põe na ordem dos produtos e completa o que falta
    const s = SimulacaoGravarSchema.parse({ nome: 'Colégio', negociacaoId: null, principal: 'a', cenarios: [{
      ...c, produtos: ['linepbx', 'voicenet', 'linechat'], mensalidade: 1, ativacao: 2,
      porProduto: [{ produto: 'voicenet', mensalidade: 42_000, ativacao: 0 }, { produto: 'linepbx', mensalidade: 125_000, ativacao: 190_000 }, { produto: 'saiu', mensalidade: 5_000, ativacao: 0 }],
    }] });
    expect(s.cenarios[0]!.porProduto).toEqual([
      { produto: 'linepbx', mensalidade: 125_000, ativacao: 190_000 }, { produto: 'voicenet', mensalidade: 42_000, ativacao: 0 }, { produto: 'linechat', mensalidade: 0, ativacao: 0 },
    ]);
    expect([s.cenarios[0]!.mensalidade, s.cenarios[0]!.ativacao]).toEqual([167_000, 190_000]);
    // com um produto só, volta a um valor só: o preço do produto que ficou (o que saiu leva o dele)
    const um = normalizarPorProduto({ ...s.cenarios[0]!, produtos: ['linepbx'] });
    expect(um.porProduto).toBeNull();
    expect([um.mensalidade, um.ativacao]).toEqual([125_000, 190_000]);
    // um valor só, sem o preço por produto: nada muda
    expect(normalizarPorProduto({ ...exemplo(), porProduto: undefined })).toMatchObject({ porProduto: null, mensalidade: 99_000 });
    // a simulação de antes (sem o campo) grava com um valor só
    expect(SimulacaoGravarSchema.parse({ nome: 'X', negociacaoId: null, principal: 'a', cenarios: [exemplo()] }).cenarios[0]!.porProduto).toBeNull();
  });

  it('o que o cliente paga em cada produto: o aparelho vendido ou alugado entra no produto da linha (a sem produto, no primeiro)', () => {
    const c: CenarioDaSimulacao = {
      ...exemplo(), produtos: ['linepbx', 'linechat'],
      porProduto: [{ produto: 'linepbx', mensalidade: 80_000, ativacao: 100_000 }, { produto: 'linechat', mensalidade: 19_000, ativacao: 50_000 }],
      linhas: [
        linha({ id: 'tel', tipo: 'aparelho', qtd: 10, valor: 39_000, modalidade: 'venda', preco: 45_000, produto: 'linepbx' }),
        linha({ id: 'fone', tipo: 'aparelho', qtd: 2, valor: 18_000, modalidade: 'locacao', preco: 1_500, produto: 'linechat' }),
        linha({ id: 'head', tipo: 'aparelho', qtd: 4, valor: 10_000, modalidade: 'locacao', preco: 1_000 }),
      ],
    };
    const k = contasDoCenario(c, FAIXAS);
    const r = pagamentoPorProduto(c, k)!;
    expect(r).toEqual([
      { produto: 'linepbx', mensalidade: 80_000, ativacao: 100_000, aluguel: 4_000, venda: 450_000 },
      { produto: 'linechat', mensalidade: 19_000, ativacao: 50_000, aluguel: 3_000, venda: 0 },
    ]);
    // as somas são o que o cliente paga no cenário
    expect(r.reduce((s, x) => s + x.mensalidade + x.aluguel, 0)).toBe(k.mensalTotal);
    expect(r.reduce((s, x) => s + x.ativacao + x.venda, 0)).toBe(k.entradaTotal);
    expect(pagamentoPorProduto({ ...c, porProduto: null }, k)).toBeNull();
  });

  it('a compra parcelada só no aparelho: à vista não guarda nada; até 24 vezes', () => {
    const c = exemplo();
    const comParcelas = (o: Record<string, number>) => ({ ...c, linhas: c.linhas.map((l) => (o[l.id] ? { ...l, parcelas: o[l.id] } : l)) });
    const s = SimulacaoGravarSchema.parse({ nome: 'Clínica', negociacaoId: null, cenarios: [comParcelas({ tel: 10, head: 1, inst: 3 })], principal: 'a' });
    const ls = s.cenarios[0]!.linhas;
    expect(ls.find((l) => l.id === 'tel')!.parcelas).toBe(10);
    expect('parcelas' in ls.find((l) => l.id === 'head')!).toBe(false);
    expect('parcelas' in ls.find((l) => l.id === 'inst')!).toBe(false);
    const r = SimulacaoGravarSchema.safeParse({ nome: 'Clínica', negociacaoId: null, cenarios: [comParcelas({ tel: 25 })], principal: 'a' });
    expect(r.success ? '' : r.error.issues[0]!.message).toBe('A compra do aparelho vai em até 24 vezes.');
  });

  it('o cenário de antes de 21/10, com os ramais e a margem que se queria: a linha "por ramal" fica com a quantidade dos ramais, e a conta não muda', () => {
    const antes = { ...exemplo(), ramais: 15, margemAlvo: 30, linhas: exemplo().linhas.map((l) => (l.id === 'nuvem' ? { ...l, qtd: 1, porRamal: true } : l.id === 'rec' ? { ...l, porRamal: true } : { ...l, porRamal: false })) };
    // o servidor lê o guardado assim, sem passar pelo schema
    const lido = semOQueSaiu(antes) as CenarioDaSimulacao;
    expect('ramais' in lido || 'margemAlvo' in lido).toBe(false);
    expect(lido.linhas.find((l) => l.id === 'nuvem')!.qtd).toBe(15);
    const s = SimulacaoGravarSchema.parse({ nome: 'Antes', negociacaoId: null, principal: 'a', cenarios: [antes] });
    const c = s.cenarios[0]!;
    expect('ramais' in c).toBe(false);
    expect('margemAlvo' in c).toBe(false);
    expect(c.linhas.some((l) => 'porRamal' in l)).toBe(false);
    expect(c.linhas.find((l) => l.id === 'nuvem')!.qtd).toBe(15);
    expect(c.linhas.find((l) => l.id === 'tel')!.qtd).toBe(10);
    expect(c.linhas.find((l) => l.id === 'rec')!.qtd).toBe(1); // o percentual não tem quantidade
    expect(contasDoCenario(c, FAIXAS).linhas.find((l) => l.id === 'nuvem')).toMatchObject({ qtd: 15, custo: 13_500 });
    // o que não é cenário passa como está
    expect(semOQueSaiu(null)).toBeNull();
    expect(semOQueSaiu({ id: 'x', ramais: 3, margemAlvo: 30 })).toEqual({ id: 'x' });
  });

  it('o resumo do cenário (a lista e a negociação)', () => {
    expect(resumoDoCenario(exemplo(), FAIXAS)).toEqual({
      nome: 'Cenário A', prazo: 24, mensalTotal: 99_000, entradaTotal: 150_000, sobraMensal: 59_580, margem: 59_580 / 99_000, sinal: 'verde',
      investimento: 312_420, sePagaEm: { tipo: 'mes', mes: 7, depoisDoPrazo: false }, resultado: 1_057_920, faltam: 0,
    });
  });
});

describe('montar o cenário', () => {
  const ajustes: AjustesDoSimulador = {
    ...AJUSTES_DO_SIMULADOR_PADRAO, imposto: 8, prazo: 36,
    custos: [
      custo({ id: 'yealink', nome: 'Yealink T31P', tipo: 'aparelho', valor: null, modalidade: 'comodato' }),
      custo({ id: 'nuvem', nome: 'Nuvem do PABX', tipo: 'mensal', valor: 900 }),
      custo({ id: 'rec', nome: 'Comissão recorrente', tipo: 'pct_mensalidade', valor: 2 }),
    ],
    modelos: [{ id: 'pbx', nome: 'LinePBX em nuvem', produto: 'linepbx', linhas: [{ custoId: 'yealink', qtd: 10 }, { custoId: 'nuvem', qtd: 10 }, { custoId: 'rec', qtd: 1 }] }],
  };

  it('o cenário novo traz o imposto e o prazo dos Ajustes; do modelo, as linhas da tabela', () => {
    const c = cenarioNovo(ajustes, { modelo: ajustes.modelos[0] });
    expect(c).toMatchObject({ nome: 'Cenário A', imposto: 8, prazo: 36, parcelas: 1, mensalidade: 0, produtos: ['linepbx'] });
    // de vários modelos (a simulação a partir da negociação): as linhas de todos, e os produtos
    const dois = cenarioNovo({ ...ajustes, custos: [...ajustes.custos, ...CUSTOS_DA_HELENA] }, { modelos: [ajustes.modelos[0]!, MODELO_DA_HELENA] });
    expect(dois.produtos).toEqual(['linepbx', 'linechat']);
    expect(dois.linhas).toHaveLength(3 + MODELO_DA_HELENA.linhas.length);
    // o mesmo modelo duas vezes: as linhas não repetem
    expect(cenarioNovo(ajustes, { modelos: [ajustes.modelos[0]!, ajustes.modelos[0]!] }).linhas).toHaveLength(3);
    // dois produtos com o mesmo custo: cada um traz o seu (uma proposta por produto); a comissão, sobre o preço inteiro, uma vez só
    // e sem produto
    const voicenet = { id: 'vn', nome: 'VoiceNet', produto: 'voicenet', linhas: [{ custoId: 'nuvem', qtd: 4 }, { custoId: 'rec', qtd: 1 }] };
    const juntos = cenarioNovo(ajustes, { modelos: [ajustes.modelos[0]!, voicenet] });
    expect(juntos.linhas.map((l) => [l.custoId, l.produto, l.qtd])).toEqual([
      ['yealink', 'linepbx', 10], ['nuvem', 'linepbx', 10], ['rec', null, 1], ['nuvem', 'voicenet', 4],
    ]);
    // com um produto só, a comissão fica com o produto do modelo
    expect(c.linhas.find((l) => l.custoId === 'rec')!.produto).toBe('linepbx');
    expect(juntos.produtos).toEqual(['linepbx', 'voicenet']);
    expect(c.linhas.map((l) => [l.nome, l.tipo, l.custoId, l.qtd, l.valor])).toEqual([
      ['Yealink T31P', 'aparelho', 'yealink', 10, null], // o aparelho sem valor: preenche em cada simulação
      ['Nuvem do PABX', 'mensal', 'nuvem', 10, 900],
      ['Comissão recorrente', 'pct_mensalidade', 'rec', 1, 2],
    ]);
    expect(c.linhas[0]!.modalidade).toBe('comodato');
    expect(contasDoCenario(c, FAIXAS).faltam).toEqual(['Yealink T31P']);
    expect(cenarioNovo(ajustes).linhas).toEqual([]);
  });

  it('a linha da tabela e o cenário duplicado (com ids novos nas linhas)', () => {
    const l = linhaDaTabela(ajustes.custos[1]!, { qtd: 3 });
    expect(l).toMatchObject({ nome: 'Nuvem do PABX', qtd: 3, valor: 900, custoId: 'nuvem' });
    expect('porRamal' in l).toBe(false);
    const a = cenarioNovo(ajustes, { modelo: ajustes.modelos[0], id: 'a' });
    const b = duplicarCenario(a, { id: 'b', nome: proximoNomeDeCenario([a]) });
    expect(b.nome).toBe('Cenário B');
    expect(b.linhas.map((x) => x.nome)).toEqual(a.linhas.map((x) => x.nome));
    expect(b.linhas.some((x) => a.linhas.some((y) => y.id === x.id))).toBe(false);
    expect(proximoNomeDeCenario([{ nome: 'Cenário A' }, { nome: 'Cenário C' }])).toBe('Cenário B');
  });
});

describe('a validação', () => {
  const gravar = (mudar: (c: CenarioDaSimulacao) => CenarioDaSimulacao = (c) => c) => ({ nome: 'Clínica Aurora', negociacaoId: null, cenarios: [mudar(exemplo())], principal: 'a' });

  it('a simulação boa passa (e as linhas saem limpas)', () => {
    const r = SimulacaoGravarSchema.parse(gravar((c) => ({ ...c, linhas: [...c.linhas, linha({ id: 'x', tipo: 'pct_mensalidade', qtd: 7, valor: 1.234 })] })));
    expect(r.cenarios[0]!.linhas.at(-1)).toMatchObject({ qtd: 1, valor: 1.23 });
  });

  it('recusa o que não fecha', () => {
    const erro = (x: unknown) => { const r = SimulacaoGravarSchema.safeParse(x); return r.success ? null : r.error.issues[0]!.message; };
    expect(erro({ ...gravar(), nome: '  ' })).toBe('Dê um nome à simulação (o cliente, a proposta).');
    expect(erro(gravar((c) => ({ ...c, parcelas: 4, prazo: 3 })))).toBe('Cenário A: a ativação vai em até 3 vezes (o prazo do contrato).');
    expect(erro(gravar((c) => ({ ...c, mensalidade: 10.5 })))).toBe('A mensalidade vai em centavos.');
    expect(erro(gravar((c) => ({ ...c, linhas: [linha({ id: 'p', nome: 'Comissão', tipo: 'pct_ativacao', valor: 120 })] })))).toBe('Comissão: o percentual vai até 100%.');
    expect(erro(gravar((c) => ({ ...c, linhas: [linha({ id: 't', nome: 'Telefone', tipo: 'aparelho', modalidade: null })] })))).toBe('Telefone: diga se o aparelho vai em comodato, venda ou locação.');
    expect(erro({ ...gravar(), principal: 'z' })).toBe('O cenário principal não está na simulação.');
    expect(erro({ ...gravar(), cenarios: [exemplo(), { ...exemplo(), id: 'b' }] })).toBe('Dois cenários com o nome "Cenário A": mude um deles.');
    expect(erro({ ...gravar(), cenarios: [] })).toBe('A simulação tem pelo menos um cenário.');
    expect(erro({ ...gravar(), cenarios: ['a', 'b', 'c', 'd'].map((id, i) => ({ ...exemplo(), id, nome: `C${i}` })) })).toBe('Até 3 cenários.');
  });

  it('os Ajustes: o vermelho abaixo do verde, sem custo repetido, e o modelo só com custos da tabela', () => {
    const erro = (x: unknown) => { const r = AjustesDoSimuladorSchema.safeParse(x); return r.success ? null : r.error.issues[0]!.message; };
    const base = { ...AJUSTES_DO_SIMULADOR_PADRAO, custos: [{ id: 'n', nome: 'Nuvem', tipo: 'mensal', valor: 900, modalidade: null }], modelos: [] };
    expect(erro(base)).toBeNull();
    expect(erro({ ...base, verde: 20, vermelho: 30 })).toBe('O vermelho começa abaixo do verde: o amarelo fica entre os dois.');
    expect(erro({ ...base, custos: [...base.custos, { ...base.custos[0], id: 'n2', nome: 'nuvem' }] })).toBe('"nuvem" está duas vezes na tabela.');
    expect(erro({ ...base, modelos: [{ id: 'm', nome: 'LinePBX', linhas: [{ custoId: 'x', qtd: 1 }] }] })).toBe('O modelo "LinePBX" usa um custo que não está na tabela.');
  });

  it('os Ajustes guardados: o padrão no que falta; o que não vale sai', () => {
    // nada guardado: os de fábrica, com a tabela da Helena e o modelo do LineChat
    expect(ajustesDoSimulador(undefined)).toEqual(AJUSTES_DO_SIMULADOR_PADRAO);
    expect(AjustesDoSimuladorSchema.parse(AJUSTES_DO_SIMULADOR_PADRAO)).toEqual(AJUSTES_DO_SIMULADOR_PADRAO);
    // guardado sem nada na tabela: vazia (a pessoa tirou tudo)
    expect(ajustesDoSimulador({ custos: [], modelos: [] }).custos).toEqual([]);
    const a = ajustesDoSimulador({
      imposto: 'x', verde: 40, vermelho: 50, prazo: 36,
      custos: [{ id: 'n', nome: 'Nuvem', tipo: 'mensal', valor: 900 }, { id: 'ruim', nome: '', tipo: 'mensal' }],
      modelos: [{ id: 'm', nome: 'LinePBX', linhas: [{ custoId: 'n', qtd: 2 }, { custoId: 'sumiu', qtd: 1 }] }],
    });
    expect(a.imposto).toBe(6);
    expect([a.verde, a.vermelho]).toEqual([35, 20]); // o vermelho acima do verde não vale: o padrão
    expect(a.prazo).toBe(36);
    expect(a.custos.map((c) => c.id)).toEqual(['n']);
    expect(a.modelos[0]!.linhas).toEqual([{ custoId: 'n', qtd: 2 }]);
    // os Ajustes de antes, com o "por ramal": sai, e a quantidade fica
    const antes = ajustesDoSimulador({ custos: [{ id: 'n', nome: 'Nuvem', tipo: 'mensal', valor: 900, porRamal: true }], modelos: [{ id: 'm', nome: 'LinePBX', linhas: [{ custoId: 'n', qtd: 1, porRamal: true }] }] });
    expect('porRamal' in antes.custos[0]!).toBe(false);
    expect(antes.modelos[0]!.linhas).toEqual([{ custoId: 'n', qtd: 1 }]);
  });
});

describe('o que mudou (a auditoria)', () => {
  it('na simulação', () => {
    const antes = { nome: 'Clínica', negociacaoId: null, cenarios: [exemplo()], principal: 'a' };
    const b = { ...duplicarCenario(exemplo(), { id: 'b', nome: 'Cenário B' }), mensalidade: 120_000 };
    const depois = { nome: 'Clínica Aurora', negociacaoId: null, cenarios: [{ ...exemplo(), mensalidade: 109_000, prazo: 36 }, b], principal: 'b' };
    // o R$ do Intl vem com o espaço que não quebra
    expect(mudancasDaSimulacao(antes, depois).map((s) => s.replace(/\u00a0/g, ' '))).toEqual([
      'o nome de "Clínica" para "Clínica Aurora"',
      'no Cenário A, a mensalidade de R$ 990,00 para R$ 1.090,00, o prazo de 24 meses para 36 meses',
      'incluiu o Cenário B',
      'o principal passou a ser o Cenário B',
    ]);
    expect(mudancasDaSimulacao(depois, { ...depois, cenarios: [depois.cenarios[0]!], principal: 'a' })).toEqual(['tirou o Cenário B', 'o principal passou a ser o Cenário A']);
    // o preço por produto: passou a ser, mudou, voltou a ser um só
    const dois = { ...exemplo(), produtos: ['linepbx', 'voicenet'] };
    const porProduto = comPrecoPorProduto(dois);
    const s = (c: CenarioDaSimulacao) => ({ nome: 'Clínica', negociacaoId: null, cenarios: [c], principal: 'a' });
    expect(mudancasDaSimulacao(s(dois), s(porProduto))).toEqual(['no Cenário A, o preço passou a ser por produto']);
    const mudou = normalizarPorProduto({ ...porProduto, porProduto: [{ produto: 'linepbx', mensalidade: 99_000, ativacao: 150_000 }, { produto: 'voicenet', mensalidade: 42_000, ativacao: 0 }] });
    expect(mudancasDaSimulacao(s(porProduto), s(mudou)).map((x) => x.replace(/\u00a0/g, ' '))).toEqual(['no Cenário A, a mensalidade de R$ 990,00 para R$ 1.410,00, o preço de cada produto']);
    expect(mudancasDaSimulacao(s(mudou), s({ ...mudou, porProduto: null }))).toEqual(['no Cenário A, o preço voltou a ser um só']);
  });

  it('o modelo põe o produto dele em cada linha (o aparelho vendido ou alugado entra nele, no preço por produto)', () => {
    const linhas = linhasDoModelo(AJUSTES_DO_SIMULADOR_PADRAO, MODELO_DA_HELENA);
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((l) => l.produto === MODELO_DA_HELENA.produto)).toBe(true);
    expect('produto' in linhasDoModelo(AJUSTES_DO_SIMULADOR_PADRAO, { ...MODELO_DA_HELENA, produto: null })[0]!).toBe(false);
  });

  it('nos Ajustes', () => {
    const antes = { ...AJUSTES_DO_SIMULADOR_PADRAO, custos: [custo({ id: 'n', nome: 'Nuvem', tipo: 'mensal', valor: 900 })], modelos: [] };
    const depois = { ...antes, imposto: 8, verde: 40, custos: [{ ...antes.custos[0]!, valor: 1_000 }, custo({ id: 'y', nome: 'Yealink', tipo: 'aparelho', modalidade: 'comodato' })] };
    expect(mudancasDosAjustes(antes, depois)).toEqual([
      'o imposto de 6% para 8%', 'o sinal (verde a partir de 40%, vermelho abaixo de 20%)', 'incluiu na tabela Yealink', 'mudou na tabela Nuvem',
    ]);
  });
});

describe('o custo por faixas e a tabela da Helena (20/10)', () => {
  const usuarios = CUSTOS_DA_HELENA.find((c) => c.id === 'helena-usuarios')!.faixas!;
  const contatos = CUSTOS_DA_HELENA.find((c) => c.id === 'helena-contatos')!.faixas!;

  it('cada unidade paga o preço da faixa em que cai; a faixa de preço 0 é o incluso', () => {
    expect(custoPorFaixas(3, usuarios)).toBe(0);
    expect(custoPorFaixas(5, usuarios)).toBe(3_980); // 2 × R$ 19,90
    expect(custoPorFaixas(20, usuarios)).toBe(33_830); // R$ 338,30, como na planilha
    expect(custoPorFaixas(21, usuarios)).toBe(33_830 + 1_490);
    expect(custoPorFaixas(100, usuarios)).toBe(153_030); // R$ 1.530,30, como na planilha
    expect(custoPorFaixas(101, usuarios)).toBe(153_030 + 1_290);
    expect(custoPorFaixas(20_000, contatos)).toBe(67_500); // R$ 675,00
    expect(custoPorFaixas(100_000, contatos)).toBe(347_500); // R$ 3.475,00
    expect(custoPorFaixas(5_200, contatos)).toBe(900); // 200 × R$ 0,045
  });

  it('as faixas numa frase, e o preço com as casas que ele tiver', () => {
    expect(textoDasFaixasDePreco(usuarios).replace(/\u00a0/g, ' ')).toBe('até 3, incluso; de 4 a 20, R$ 19,90 cada; de 21 a 100, R$ 14,90 cada; acima de 100, R$ 12,90 cada');
    expect(precoDaUnidade(4.5).replace(/\u00a0/g, ' ')).toBe('R$ 0,045');
    expect(textoDasFaixasDePreco([{ ate: null, valor: 900 }]).replace(/\u00a0/g, ' ')).toBe('cada um, R$ 9,00 cada');
  });

  it('o exemplo da planilha: a licença, 5 usuários e 5 conexões Z-API dão R$ 539,20 por mês', () => {
    const a = AJUSTES_DO_SIMULADOR_PADRAO;
    const c = cenarioNovo(a, { modelo: MODELO_DA_HELENA });
    c.linhas = c.linhas.map((l) => (l.custoId === 'helena-usuarios' ? { ...l, qtd: 5 } : l.custoId === 'helena-zapi' ? { ...l, qtd: 5 } : l));
    const k = contasDoCenario(c, a);
    expect(k.custoMensalFixo).toBe(53_920);
    expect(k.faltam).toEqual([]);
    // o modelo (21/10): a licença, os usuários, os canais oficiais, os não oficiais (a Z-API) e os agentes de IA
    expect(k.linhas.map((l) => l.custo)).toEqual([14_990, 3_980, 0, 34_950, 0]);
    // com 8.000 contatos ativos (o custo da tabela, fora do modelo desde 21/10): 3.000 × R$ 0,045 = R$ 135,00 a mais
    c.linhas = [...c.linhas, linhaDaTabela(a.custos.find((x) => x.id === 'helena-contatos')!, { qtd: 8_000 })];
    expect(contasDoCenario(c, a).custoMensalFixo).toBe(53_920 + 13_500);
    // a linha que entra da tabela leva as faixas e a unidade
    expect(c.linhas.find((l) => l.custoId === 'helena-usuarios')).toMatchObject({ faixas: usuarios, unidade: 'usuário', valor: null });
  });

  it('a validação das faixas', () => {
    const erro = (x: unknown) => { const r = AjustesDoSimuladorSchema.safeParse(x); return r.success ? null : r.error.issues[0]!.message; };
    const com = (c: Partial<CustoDaTabela>) => ({ ...AJUSTES_DO_SIMULADOR_PADRAO, custos: [{ ...custo({ id: 'x', nome: 'Usuários', tipo: 'mensal' }), ...c }], modelos: [] });
    expect(erro(com({ faixas: [{ ate: 3, valor: 0 }, { ate: null, valor: 1_990 }] }))).toBeNull();
    expect(erro(com({ faixas: [{ ate: 3, valor: 0 }, { ate: 10, valor: 1_990 }] }))).toBe('Usuários: a última faixa vai "daí para cima" (sem fim).');
    expect(erro(com({ faixas: [{ ate: 10, valor: 0 }, { ate: 5, valor: 1 }, { ate: null, valor: 2 }] }))).toBe('Usuários: cada faixa termina depois da de antes (depois de 10).');
    expect(erro(com({ tipo: 'aparelho', modalidade: 'comodato', faixas: [{ ate: null, valor: 1 }] }))).toBe('Usuários: o preço por faixas é só dos custos "por mês" e "uma vez".');
    expect(erro(com({ faixas: [{ ate: null, valor: 4.567 }] }))).toBe('Usuários: na faixa 1, o valor vai em reais com até 4 casas depois da vírgula (R$ 0,0450), até R$ 100 milhões.');
    expect(erro(com({ valor: 4.5 }))).toBeNull();
    // com as faixas, o valor fica nulo
    expect(AjustesDoSimuladorSchema.parse(com({ valor: 900, faixas: [{ ate: null, valor: 1 }] })).custos[0]).toMatchObject({ valor: null, faixas: [{ ate: null, valor: 1 }] });
  });
});

describe('o que a pessoa escreve', () => {
  it('o valor de cada um: até 4 casas em reais (R$ 0,045)', () => {
    expect(lerValorUnitario('19,90')).toBe(1_990);
    expect(lerValorUnitario('0,045')).toBe(4.5);
    expect(lerValorUnitario('R$ 1.250')).toBe(125_000);
    expect(lerValorUnitario('390')).toBe(39_000);
    expect(lerValorUnitario('0,04567')).toBeNull();
    expect(lerValorUnitario('abc')).toBeNull();
    expect(lerValorUnitario('')).toBeNull();
    expect(textoDoValorUnitario(1_990)).toBe('19,90');
    expect(textoDoValorUnitario(4.5)).toBe('0,045');
    expect(textoDoValorUnitario(39_000)).toBe('390,00');
  });
  it('o percentual', () => {
    expect(lerPercentual('6')).toBe(6);
    expect(lerPercentual('6,5%')).toBe(6.5);
    expect(lerPercentual('2,255')).toBeNull();
    expect(textoDoPercentual(6.5)).toBe('6,5');
  });
});

describe('a margem das ganhas (o relatório do Comercial)', () => {
  it('a sobra de todas sobre a mensalidade de todas, no total e por produto; só as ganhas com simulação', () => {
    const margens = new Map([
      ['n1', { simulacaoId: 's1', simulacao: 'A', mensalTotal: 100_000, sobraMensal: 60_000 }],
      ['n2', { simulacaoId: 's2', simulacao: 'B', mensalTotal: 50_000, sobraMensal: 10_000 }],
      ['n3', { simulacaoId: 's3', simulacao: 'C', mensalTotal: 30_000, sobraMensal: 12_000 }],
    ]);
    const ganhas = [
      { id: 'n1', responsavel: 'Camila', produtos: ['LinePBX', 'VoiceNet'] },
      { id: 'n2', responsavel: 'Diego', produtos: ['LineChat'] },
      { id: 'n3', responsavel: 'Camila', produtos: ['LinePBX'] },
      { id: 'n4', responsavel: 'Diego', produtos: ['LinePBX'] }, // sem simulação: não entra na margem
    ];
    const m = margemDasGanhas(ganhas, margens, FAIXAS);
    expect([m.ganhas, m.comSimulacao]).toEqual([4, 3]);
    expect(m.geral).toMatchObject({ qtd: 3, mensalidade: 180_000, sobra: 82_000, sinal: 'verde' });
    expect(Math.round(m.geral.margem! * 1000) / 10).toBe(45.6);
    // sem o "por vendedor" (o Luan, 21/10: "não precisa por vendedor")
    expect('porVendedor' in m).toBe(false);
    expect(m.porProduto.map((g) => [g.nome, g.qtd])).toEqual([['LinePBX', 2], ['VoiceNet', 1], ['LineChat', 1]]);
  });
});

describe('o LineChat simples: as quatro quantidades e o total (21/10)', () => {
  const a = AJUSTES_DO_SIMULADOR_PADRAO;
  const qtd = (c: CenarioDaSimulacao, q: Record<string, number>) => ({ ...c, linhas: c.linhas.map((l) => (l.custoId && q[l.custoId] !== undefined ? { ...l, qtd: q[l.custoId]! } : l)) });

  it('o quadro: a licença entra sozinha, cada quantidade com o custo dela e o total como na planilha (R$ 539,20)', () => {
    const c = qtd({ ...cenarioNovo(a, { modelo: MODELO_DA_HELENA }), mensalidade: 99_000 }, { 'helena-usuarios': 5, 'helena-zapi': 5 });
    const k = contasDoCenario(c, a);
    const q = quadroDoLineChat(c, k, a)!;
    expect(q.licenca?.custo).toBe(14_990);
    expect(q.campos.map((x) => [x.rotulo, x.qtd, x.custo, x.incluso])).toEqual([
      ['Usuários', 5, 3_980, false], ['Canais oficiais', 1, 0, true], ['Canais não oficiais', 5, 34_950, false], ['Agentes de IA', 0, 0, false],
    ]);
    expect(q.total).toBe(53_920);
    // o total do quadro é o que ele soma nos custos mensais
    expect(q.total).toBe(k.custoMensalFixo);
    expect(q.linhas).toHaveLength(5);
    expect(q.outros).toEqual([]);
  });

  it('sem o produto LineChat, não há quadro; os outros da Helena só aparecem quando custam algo', () => {
    const c = cenarioNovo(a, { modelo: MODELO_DA_HELENA });
    expect(quadroDoLineChat({ ...c, produtos: [] }, contasDoCenario(c, a))).toBeNull();
    // a simulação de antes de 21/10: os contatos (5.000, inclusos) e a transcrição (nenhuma) não aparecem…
    const contatos = linhaDaTabela(a.custos.find((x) => x.id === 'helena-contatos')!, { qtd: 5_000 });
    const transcricao = linhaDaTabela(a.custos.find((x) => x.id === 'helena-transcricao')!, { qtd: 0 });
    const antes = { ...c, linhas: [...c.linhas, contatos, transcricao] };
    let q = quadroDoLineChat(antes, contasDoCenario(antes, a))!;
    expect(q.outros).toEqual([]);
    expect(q.linhas).toHaveLength(7);
    // …e com 8.000 contatos, sim (R$ 135,00), somando no total
    const mais = { ...antes, linhas: antes.linhas.map((l) => (l.id === contatos.id ? { ...l, qtd: 8_000 } : l)) };
    q = quadroDoLineChat(mais, contasDoCenario(mais, a))!;
    expect(q.outros.map((x) => [x.qtd, x.custo])).toEqual([[8_000, 13_500]]);
    expect(q.total).toBe(14_990 + 13_500);
  });

  it('a quantidade que ainda não tem linha; o custo que saiu da tabela', () => {
    const c = { ...cenarioNovo(a, {}), produtos: ['linechat'] };
    const q = quadroDoLineChat(c, contasDoCenario(c, a), a)!;
    expect(q.licenca).toBeNull();
    expect(q.campos.every((x) => x.linhaId === null && !x.foraDaTabela)).toBe(true);
    const semAgentes = { ...a, custos: a.custos.filter((x) => x.id !== 'helena-agentes') };
    expect(quadroDoLineChat(c, contasDoCenario(c, a), semAgentes)!.campos.find((x) => x.custoId === 'helena-agentes')!.foraDaTabela).toBe(true);
  });

  it('pôr o LineChat põe as linhas do modelo dele (sem repetir); tirar tira as do quadro', () => {
    const vazio = cenarioNovo(a, {});
    const linhas = linhasParaOLineChat(a, vazio);
    expect(linhas.map((l) => [l.custoId, l.qtd, l.produto])).toEqual([
      ['helena-licenca', 1, 'linechat'], ['helena-usuarios', 3, 'linechat'], ['helena-canais', 1, 'linechat'], ['helena-zapi', 0, 'linechat'], ['helena-agentes', 0, 'linechat'],
    ]);
    // já com o LineChat: nada repete
    expect(linhasParaOLineChat(a, { linhas })).toEqual([]);
    // o modelo do LineChat dos Ajustes manda (com a instalação e a comissão); a comissão que já está não repete
    const inst = custo({ id: 'inst', nome: 'Instalação', tipo: 'unica', valor: 30_000 });
    const com = custo({ id: 'com', nome: 'Comissão', tipo: 'pct_ativacao', valor: 10 });
    const ajustes: AjustesDoSimulador = { ...a, custos: [...a.custos, inst, com], modelos: [{ ...MODELO_DA_HELENA, linhas: [...MODELO_DA_HELENA.linhas, { custoId: 'inst', qtd: 1 }, { custoId: 'com', qtd: 1 }] }] };
    const jaTem = [linhaDaTabela(inst), linhaDaTabela(com)];
    expect(linhasParaOLineChat(ajustes, { linhas: jaTem }).map((l) => l.custoId)).toEqual(['helena-licenca', 'helena-usuarios', 'helena-canais', 'helena-zapi', 'helena-agentes', 'inst']);
    // tirar: só as do quadro saem
    expect(linhasSemOLineChat({ linhas: [...linhas, ...jaTem] }).map((l) => l.custoId)).toEqual(['inst', 'com']);
    expect(LINECHAT_DO_SIMULADOR.campos.every((x) => ehLinhaDoLineChat({ custoId: x.custoId }))).toBe(true);
    expect(ehLinhaDoLineChat({ custoId: null })).toBe(false);
  });
});

describe('o LineChat simples: mudar as quantidades (21/10)', () => {
  const a = AJUSTES_DO_SIMULADOR_PADRAO;
  it('a quantidade muda na linha; a repetida sai; sem linha, entra da tabela com a licença', () => {
    const c = cenarioNovo(a, { modelo: MODELO_DA_HELENA });
    const usuarios = c.linhas.find((l) => l.custoId === 'helena-usuarios')!;
    let linhas = mudarQuantidadeDoLineChat(c, a, 'helena-usuarios', 12);
    expect(linhas.find((l) => l.id === usuarios.id)!.qtd).toBe(12);
    expect(linhas).toHaveLength(c.linhas.length);
    // posta duas vezes da tabela: fica uma, com a quantidade
    const dupla = { ...c, linhas: [...c.linhas, linhaDaTabela(a.custos.find((x) => x.id === 'helena-usuarios')!, { qtd: 4 })] };
    linhas = mudarQuantidadeDoLineChat(dupla, a, 'helena-usuarios', 7);
    expect(linhas.filter((l) => l.custoId === 'helena-usuarios').map((l) => l.qtd)).toEqual([7]);
    // o cenário sem as linhas: entra a do custo e a licença, com o produto LineChat
    const vazio = { ...cenarioNovo(a, {}), produtos: ['linechat'] };
    linhas = mudarQuantidadeDoLineChat(vazio, a, 'helena-agentes', 2);
    expect(linhas.map((l) => [l.custoId, l.qtd, l.produto])).toEqual([['helena-licenca', 1, 'linechat'], ['helena-agentes', 2, 'linechat']]);
    // zero sem linha: nada muda
    expect(mudarQuantidadeDoLineChat(vazio, a, 'helena-agentes', 0)).toBe(vazio.linhas);
    // o que vem na licença, numa frase
    const q = quadroDoLineChat(c, contasDoCenario(c, a), a)!;
    expect(textoDosInclusos(q)).toBe('3 usuários e 1 canal oficial');
  });
});
