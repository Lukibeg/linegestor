/**
 * A simulação numa planilha do Excel, com as fórmulas (Patch 2.0.2, o Simulador do Comercial, a ideia "excel"
 * que o Luan marcou "agora"): uma folha por cenário — o que o cliente paga (as células amarelas, que a pessoa
 * muda), os custos linha a linha, os números (a sobra, a margem, o sinal, o que sai antes, quando se paga, o
 * que fica no contrato), o preço (a mensalidade mínima e o desconto máximo) e a linha do tempo, mês a mês — e,
 * com dois cenários ou mais, a folha "Lado a lado", que puxa os números de cada um.
 *
 * Cada conta é uma fórmula do Excel que faz o mesmo que o `contasDoCenario` (a mesma regra da tela e do
 * servidor): mudar a mensalidade na planilha refaz a sobra, a margem, o sinal e a linha do tempo. A fórmula vai
 * com o valor que a tela mostra, e o Excel confere ao abrir. O preço por faixas (os usuários, os canais e os
 * contatos do LineChat da Helena) vira uma fórmula com as faixas dentro.
 */
import { diaLocal, horaLocal } from './atendimento-prazos.js';
import {
  GRUPOS_DE_CUSTO, GRUPO_DO_TIPO, MAX_PARCELAS_DA_COMPRA, MAX_PRAZO, NOME_DA_MODALIDADE, NOME_DO_GRUPO, NOME_DO_SINAL, NOME_DO_TIPO_DE_CUSTO, contasDoCenario, textoDasFaixas,
  textoDasFaixasDePreco, textoDoSePagaEm,
  type CenarioDaSimulacao, type ContasDoCenario, type FaixaDePreco, type FaixasDoSinal, type LinhaDoCenario, type Simulacao,
} from './simulador.js';
import { montarXlsx, nomesDasFolhas, refDaFolha, type CelulaDaPlanilha, type FolhaDaPlanilha } from './xlsx.js';

/** O que a planilha precisa: a simulação, as faixas do sinal (dos Ajustes), quem exporta e quando. */
export type PedidoDaPlanilha = {
  simulacao: Pick<Simulacao, 'nome' | 'negociacaoId' | 'negociacao' | 'cenarios' | 'principal'>;
  faixas: FaixasDoSinal;
  quem: string | null;
  quando: Date;
  /** os nomes dos produtos do catálogo, pelo código (o preço por produto escreve o nome; sem ele, o código) */
  nomesDosProdutos?: Record<string, string>;
};

/** O preço por produto cabe ao lado do que o cliente paga (da linha 8 à 15): até 8 produtos. */
const MAX_PRODUTOS_NA_PLANILHA = 8;

/** O nome do arquivo: "simulacao-padaria-estrela-40-ramais-2026-10-20.xlsx". */
export function nomeDaPlanilhaDaSimulacao(nome: string, quando: Date): string {
  const base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  return `simulacao-${base || 'sem-nome'}-${diaLocal(quando)}.xlsx`;
}

/** As colunas da folha do cenário (A a M). */
const LARGURAS = [50, 18, 16, 12, 14, 18, 18, 14, 16, 16, 16, 16, 56];

// as linhas fixas do alto: o que o cliente paga
const L_MENSALIDADE = 7;
const L_ATIVACAO = 8;
const L_VEZES = 9;
const L_PRAZO = 10;
const L_RAMAIS = 11;
const L_IMPOSTO = 12;
const L_ALVO = 13;
const L_CABECALHO_DOS_CUSTOS = 16;
const L_PRIMEIRO_CUSTO = 17;

/** Uma grade de células, a partir da linha 1 e da coluna A (0). */
class Grade {
  linhas: Array<Array<CelulaDaPlanilha | null> | null> = [];
  por(linha: number, coluna: number, c: CelulaDaPlanilha | null) {
    const l = (this.linhas[linha - 1] ??= []);
    while (l.length < coluna) l.push(null);
    l[coluna] = c;
  }
  /** Uma linha de rótulo (A), valor (B) e nota (C). */
  item(linha: number, rotulo: string | CelulaDaPlanilha, valor: CelulaDaPlanilha, nota?: string) {
    this.por(linha, 0, typeof rotulo === 'string' ? { v: rotulo } : rotulo);
    this.por(linha, 1, valor);
    if (nota) this.por(linha, 2, { v: nota, s: 'nota' });
  }
  completar(): Array<Array<CelulaDaPlanilha | null> | null> {
    for (let i = 0; i < this.linhas.length; i++) this.linhas[i] ??= null;
    return this.linhas;
  }
}

const reais = (centavos: number) => centavos / 100;
const ehPct = (l: LinhaDoCenario) => l.tipo === 'pct_mensalidade' || l.tipo === 'pct_ativacao';
const faixasDaLinha = (l: LinhaDoCenario): FaixaDePreco[] | null => ((l.tipo === 'mensal' || l.tipo === 'unica') && l.faixas?.length ? l.faixas : null);
/** O número dentro da fórmula (com ponto; o preço por unidade tem até 4 casas). */
const n = (v: number) => String(Math.round(v * 1_000_000) / 1_000_000);

/** O custo por faixas como fórmula: cada unidade paga o preço da faixa em que cai (a regra do `custoPorFaixas`). */
export function formulaDasFaixas(qtd: string, faixas: readonly FaixaDePreco[]): string {
  let antes = 0;
  const partes: string[] = [];
  for (const f of faixas) {
    if (f.valor !== 0) partes.push(f.ate == null ? `MAX(0,${qtd}-${antes})*${n(reais(f.valor))}` : `MAX(0,MIN(${qtd},${f.ate})-${antes})*${n(reais(f.valor))}`);
    if (f.ate == null) break;
    antes = f.ate;
  }
  return partes.length ? partes.join('+') : '0';
}

/** Onde ficaram os números de um cenário (a folha "Lado a lado" puxa daqui). */
type NumerosDaFolha = { mensal: string; ativacao: string; prazo: string; custoDoMes: string; sobra: string; margem: string; sinal: string; saiAntes: string; sePaga: string; contrato: string };

function folhaDoCenario(p: PedidoDaPlanilha, c: CenarioDaSimulacao, k: ContasDoCenario, nomeDaFolha: string): { folha: FolhaDaPlanilha; numeros: NumerosDaFolha } {
  const g = new Grade();
  const s = p.simulacao;
  const verde = p.faixas.verde;
  const vermelho = p.faixas.vermelho;

  // o alto: a simulação, o cenário, a negociação e de quando é
  g.por(1, 0, { v: s.nome, s: 'titulo' });
  g.por(2, 0, { v: `Cenário: ${c.nome}${s.cenarios.length > 1 && s.principal === c.id ? ' (o principal)' : ''}`, s: 'sub' });
  const neg = s.negociacao;
  g.por(3, 0, {
    v: neg ? `Negociação ${neg.codigo} · ${neg.titulo}${neg.empresa ? ` · ${neg.empresa}` : ''}${neg.resultado ? ` (${neg.resultado})` : ''}`
      : s.negociacaoId ? 'Ligada a uma negociação de um painel que você não vê' : 'Sem negociação ligada',
    s: 'sub',
  });
  const dia = diaLocal(p.quando).split('-').reverse().join('/');
  g.por(4, 0, { v: `Exportada do Gestor em ${dia} às ${horaLocal(p.quando)}${p.quem ? `, por ${p.quem}` : ''}. Mude as células amarelas: o resto da conta se refaz sozinho.`, s: 'nota' });

  // o que o cliente paga; com o preço por produto, a mensalidade e a ativação são as somas da tabela ao lado
  // (H a J: as notas da coluna C cabem até a G)
  g.por(6, 0, { v: 'O QUE O CLIENTE PAGA', s: 'secao' });
  const precos = c.porProduto && c.porProduto.length >= 2 && c.porProduto.length <= MAX_PRODUTOS_NA_PLANILHA ? c.porProduto : null;
  if (precos) {
    const fim = 7 + precos.length;
    g.por(6, 7, { v: 'O preço de cada produto', s: 'forte' });
    ['Produto', 'Mensalidade', 'Ativação'].forEach((x, i) => g.por(7, 7 + i, { v: x, s: 'cabecalho' }));
    precos.forEach((x, i) => {
      g.por(8 + i, 7, { v: p.nomesDosProdutos?.[x.produto] ?? x.produto });
      g.por(8 + i, 8, { v: reais(x.mensalidade), s: 'reaisEntrada' });
      g.por(8 + i, 9, { v: reais(x.ativacao), s: 'reaisEntrada' });
    });
    g.item(L_MENSALIDADE, 'Mensalidade', { f: `SUM(I8:I${fim})`, v: reais(c.mensalidade), s: 'reais' }, 'a soma dos produtos (ao lado)');
    g.item(L_ATIVACAO, 'Ativação', { f: `SUM(J8:J${fim})`, v: reais(c.ativacao), s: 'reais' }, 'a soma dos produtos (ao lado)');
  } else {
    g.item(L_MENSALIDADE, 'Mensalidade', { v: reais(c.mensalidade), s: 'reaisEntrada' });
    g.item(L_ATIVACAO, 'Ativação', { v: reais(c.ativacao), s: 'reaisEntrada' });
  }
  g.item(L_VEZES, 'A ativação em (vezes)', { v: c.parcelas, s: 'inteiroEntrada' }, 'à vista = 1; a primeira parcela entra na assinatura');
  g.item(L_PRAZO, 'O prazo do contrato (meses)', { v: c.prazo, s: 'inteiroEntrada' }, `até ${MAX_PRAZO} meses`);
  g.item(L_RAMAIS, 'Ramais', { v: c.ramais, s: 'inteiroEntrada' }, 'as linhas "por ramal" acompanham');
  g.item(L_IMPOSTO, 'Imposto', { v: c.imposto / 100, s: 'pctEntrada' }, 'sobre tudo o que o cliente paga: a mensalidade, a ativação e os aparelhos');
  g.item(L_ALVO, 'A margem que você quer', { v: c.margemAlvo / 100, s: 'pctEntrada' }, 'para a mensalidade mínima, em O PREÇO');

  // os custos, linha a linha
  g.por(15, 0, { v: 'OS CUSTOS', s: 'secao' });
  ['Custo', 'Como entra', 'O aparelho vai em', 'Por ramal', 'Quantidade', 'Valor de cada', 'Preço ou aluguel de cada', 'A compra em (vezes)', 'Sai uma vez', 'Sai por mês', 'Entra uma vez', 'Entra por mês', 'Observação']
    .forEach((t, i) => g.por(L_CABECALHO_DOS_CUSTOS, i, { v: t, s: 'cabecalho' }));
  // em dois grupos, como a tela: os custos fixos (pagos uma vez) e os mensais, cada um com o nome numa linha
  const linhaDoCusto = new Map<number, number>();
  const nomesDosGrupos: Array<[number, string]> = [];
  let proxima = L_PRIMEIRO_CUSTO;
  for (const grupo of GRUPOS_DE_CUSTO) {
    const doGrupo = c.linhas.map((l, i) => ({ l, i })).filter(({ l }) => GRUPO_DO_TIPO[l.tipo] === grupo);
    if (!doGrupo.length) continue;
    nomesDosGrupos.push([proxima++, `${NOME_DO_GRUPO[grupo]} · ${grupo === 'fixo' ? 'pagos uma vez, na assinatura' : 'todo mês'}`]);
    for (const { i } of doGrupo) linhaDoCusto.set(i, proxima++);
  }
  const total = c.linhas.length ? proxima : L_PRIMEIRO_CUSTO + 1;
  const numeros = total + 2;
  const L = {
    mensal: numeros + 1, ativacao: numeros + 2, fixosEComissao: numeros + 3, imposto: numeros + 4, custoDoMes: numeros + 5, sobra: numeros + 6,
    margem: numeros + 7, sinal: numeros + 8, umaVez: numeros + 9, comissaoDaAtivacao: numeros + 10, vezes: numeros + 11, saiAntes: numeros + 12,
    sePaga: numeros + 13, contrato: numeros + 14,
  };
  const preco = numeros + 16;
  const P = { fixos: preco + 1, comissaoDaMensalidade: preco + 2, minima: preco + 3, minimaVerde: preco + 4, desconto: preco + 5 };
  const tempo = preco + 7;
  const T0 = tempo + 2;
  const TN = T0 + MAX_PRAZO;

  const refsMensais: string[] = [];
  const linhasDosAparelhos: number[] = [];
  const refsPctMensalidade: string[] = [];
  const refsPctAtivacao: string[] = [];
  let pctMensalidade = 0;
  let pctAtivacao = 0;
  if (!c.linhas.length) g.por(L_PRIMEIRO_CUSTO, 0, { v: 'Nenhum custo neste cenário.', s: 'nota' });
  for (const [r, nome] of nomesDosGrupos) g.por(r, 0, { v: nome, s: 'forte' });
  c.linhas.forEach((l, i) => {
    const r = linhaDoCusto.get(i)!;
    const conta = k.linhas[i]!;
    const faixas = faixasDaLinha(l);
    const notas: string[] = [];
    g.por(r, 0, { v: l.nome });
    g.por(r, 1, { v: NOME_DO_TIPO_DE_CUSTO[l.tipo] });
    if (l.tipo === 'aparelho') g.por(r, 2, { v: NOME_DA_MODALIDADE[l.modalidade ?? 'comodato'] });
    if (!ehPct(l) && l.porRamal) g.por(r, 3, { v: 'sim' });
    if (!ehPct(l)) g.por(r, 4, l.porRamal ? { f: `$B$${L_RAMAIS}`, v: conta.qtd, s: 'inteiro' } : { v: l.qtd, s: 'inteiroEntrada' });
    if (ehPct(l)) g.por(r, 5, { v: (l.valor ?? 0) / 100, s: 'pctEntrada' });
    else if (faixas) g.por(r, 5, { v: 'por faixas' });
    else g.por(r, 5, { v: l.valor == null ? null : reais(l.valor), s: 'reaisUnidadeEntrada' });
    const qtd = `E${r}`;
    if (l.tipo === 'aparelho') {
      // a compra em (vezes): a célula amarela; a linha do tempo dilui o custo nas parcelas
      g.por(r, 7, { v: l.parcelas ?? 1, s: 'inteiroEntrada' });
      g.por(r, 8, { f: `${qtd}*F${r}`, v: reais(conta.custo), s: 'reais' });
      linhasDosAparelhos.push(r);
      if (conta.parcelas > 1) notas.push(`a compra em ${conta.parcelas} vezes: o custo se dilui (a primeira parcela na assinatura)`);
      if (l.modalidade === 'venda' || l.modalidade === 'locacao') {
        g.por(r, 6, { v: l.preco == null ? null : reais(l.preco), s: 'reaisUnidadeEntrada' });
        g.por(r, l.modalidade === 'venda' ? 10 : 11, { f: `${qtd}*G${r}`, v: reais(conta.receita), s: 'reais' });
        notas.push(l.modalidade === 'venda' ? 'o preço de cada um entra na ativação' : 'o aluguel de cada um entra na mensalidade');
      }
    } else if (l.tipo === 'unica') {
      g.por(r, 8, { f: faixas ? formulaDasFaixas(qtd, faixas) : `${qtd}*F${r}`, v: reais(conta.custo), s: 'reais' });
    } else if (l.tipo === 'mensal') {
      g.por(r, 9, { f: faixas ? formulaDasFaixas(qtd, faixas) : `${qtd}*F${r}`, v: reais(conta.custo), s: 'reais' });
      refsMensais.push(`J${r}`);
    } else if (l.tipo === 'pct_mensalidade') {
      g.por(r, 9, { f: `F${r}*$B$${L.mensal}`, v: reais(conta.custo), s: 'reais' });
      refsPctMensalidade.push(`F${r}`);
      pctMensalidade += (l.valor ?? 0) / 100;
      notas.push('sobre o que o cliente paga por mês');
    } else {
      refsPctAtivacao.push(`F${r}`);
      pctAtivacao += (l.valor ?? 0) / 100;
      notas.push('tirada de cada parcela da ativação, como o imposto (em OS NÚMEROS)');
    }
    if (faixas) notas.push(`por faixas: ${textoDasFaixasDePreco(faixas)}`);
    if (conta.falta) notas.push('falta o valor: preencha a célula amarela');
    if (notas.length) g.por(r, 12, { v: notas.join('; '), s: 'nota' });
  });
  const ultimo = total - 1;
  g.por(total, 0, { v: 'Total', s: 'rotuloTotal' });
  for (let col = 1; col <= 12; col++) g.por(total, col, { s: 'rotuloTotal' });
  const soma = (col: string, v: number) => ({ f: `SUM(${col}${L_PRIMEIRO_CUSTO}:${col}${ultimo})`, v, s: 'reaisTotal' as const });
  g.por(total, 8, soma('I', reais(k.custoUnico)));
  g.por(total, 9, soma('J', reais(k.custoMensalFixo + k.comissaoMensal)));
  g.por(total, 10, soma('K', reais(k.vendaDeAparelhos)));
  g.por(total, 11, soma('L', reais(k.aluguel)));

  // os números
  const B = (linha: number) => `$B$${linha}`;
  g.por(numeros, 0, { v: 'OS NÚMEROS', s: 'secao' });
  g.item(L.mensal, 'O cliente paga por mês', { f: `B${L_MENSALIDADE}+L${total}`, v: reais(k.mensalTotal), s: 'reais' }, 'a mensalidade e o aluguel dos aparelhos');
  g.item(L.ativacao, 'A ativação', { f: `B${L_ATIVACAO}+K${total}`, v: reais(k.entradaTotal), s: 'reais' }, 'com os aparelhos vendidos');
  g.item(L.fixosEComissao, 'Os custos do mês', { f: `J${total}`, v: reais(k.custoMensalFixo + k.comissaoMensal), s: 'reais' }, 'os fixos e a comissão da mensalidade');
  g.item(L.imposto, 'O imposto do mês', { f: `B${L_IMPOSTO}*B${L.mensal}`, v: reais(k.impostoMensal), s: 'reais' });
  g.item(L.custoDoMes, 'O custo do mês', { f: `B${L.fixosEComissao}+B${L.imposto}`, v: reais(k.custoMensal), s: 'reais' });
  g.item(L.sobra, { v: 'Sobra por mês', s: 'forte' }, { f: `B${L.mensal}-B${L.custoDoMes}`, v: reais(k.sobraMensal), s: 'reaisForte' });
  g.item(L.margem, { v: 'A margem', s: 'forte' }, { f: `IF(B${L.mensal}>0,B${L.sobra}/B${L.mensal},"")`, v: k.margem ?? '', s: 'pctForte' }, 'a sobra sobre o que o cliente paga por mês');
  g.item(L.sinal, { v: 'O sinal', s: 'forte' }, {
    f: `IF(B${L.mensal}>0,IF(ROUND(B${L.margem}*100,2)>=${n(verde)},"${NOME_DO_SINAL.verde}",IF(ROUND(B${L.margem}*100,2)>=${n(vermelho)},"${NOME_DO_SINAL.amarelo}","${NOME_DO_SINAL.vermelho}")),"")`,
    v: k.sinal ? NOME_DO_SINAL[k.sinal] : '', s: 'forte',
  }, `${textoDasFaixas(p.faixas)} (os Ajustes do Simulador)`);
  g.item(L.umaVez, 'Sai uma vez', { f: `I${total}`, v: reais(k.custoUnico), s: 'reais' }, 'os aparelhos e o resto (o aparelho comprado parcelado sai nas parcelas, na linha do tempo)');
  g.item(L.comissaoDaAtivacao, 'A comissão da ativação', refsPctAtivacao.length ? { f: refsPctAtivacao.join('+'), v: pctAtivacao, s: 'pct' } : { v: 0, s: 'pct' }, 'tirada de cada parcela, como o imposto');
  g.item(L.vezes, 'A ativação em (vezes)', { f: `MIN(MAX(1,B${L_VEZES}),MAX(1,B${L_PRAZO}))`, v: k.parcelas.length, s: 'inteiro' }, 'não mais que o prazo');
  g.item(L.saiAntes, { v: 'Sai antes', s: 'forte' }, { f: `MAX(0,-ROUND(MIN(F${T0}:F${TN}),2))`, v: reais(k.investimento), s: 'reaisForte' }, 'o pior momento do contrato, antes de a venda se pagar (na linha do tempo)');
  const negativo = `MAX($G$${T0}:$G$${TN})`;
  const fimDoPrazo = `INDEX($F$${T0}:$F$${TN},${B(L_PRAZO)}+1)`;
  g.item(L.sePaga, { v: 'Se paga', s: 'forte' }, {
    f: `IF(${negativo}=-1,IF(AND($I$${total}=0,${B(L.ativacao)}=0),"desde o 1º mês","já na ativação"),`
      + `IF(${negativo}<${B(L_PRAZO)},"em "&(${negativo}+1)&IF(${negativo}+1=1," mês"," meses"),`
      + `IF(ROUND(${B(L.sobra)},2)>0,"em "&(${B(L_PRAZO)}+ROUNDUP(-ROUND(${fimDoPrazo},2)/ROUND(${B(L.sobra)},2),0))&" meses (depois do prazo)","não se paga")))`,
    v: textoDoSePagaEm(k.sePagaEm), s: 'forte',
  });
  g.item(L.contrato,
    { f: `"No contrato ("&B${L_PRAZO}&IF(B${L_PRAZO}=1," mês)"," meses)")`, v: `No contrato (${c.prazo} ${c.prazo === 1 ? 'mês' : 'meses'})`, s: 'forte' },
    { f: fimDoPrazo, v: reais(k.resultado), s: 'reaisForte' }, 'o que fica no fim do prazo');

  // o preço
  g.por(preco, 0, { v: 'O PREÇO', s: 'secao' });
  g.item(P.fixos, 'Os custos fixos do mês', refsMensais.length ? { f: refsMensais.join('+'), v: reais(k.custoMensalFixo), s: 'reais' } : { v: 0, s: 'reais' }, 'sem o imposto e a comissão');
  g.item(P.comissaoDaMensalidade, 'A comissão da mensalidade', refsPctMensalidade.length ? { f: refsPctMensalidade.join('+'), v: pctMensalidade, s: 'pct' } : { v: 0, s: 'pct' });
  const minima = (alvo: string) => `IF(1-B${L_IMPOSTO}-B${P.comissaoDaMensalidade}-${alvo}<=0,"nenhuma dá",MAX(0,ROUNDUP(B${P.fixos}/(1-B${L_IMPOSTO}-B${P.comissaoDaMensalidade}-${alvo})-L${total}-0.00000001,2)))`;
  g.item(P.minima, { v: 'A mensalidade mínima para a margem que você quer', s: 'forte' }, { f: minima(`B${L_ALVO}`), v: k.minima == null ? 'nenhuma dá' : reais(k.minima), s: 'reaisForte' });
  g.item(P.minimaVerde, `A mensalidade mínima para o verde (${n(verde).replace('.', ',')}%)`, { f: minima(n(verde / 100)), v: k.minimaVerde == null ? 'nenhuma dá' : reais(k.minimaVerde), s: 'reais' });
  g.item(P.desconto, 'Desconto máximo sem sair do verde', {
    f: `IF(ISNUMBER(B${P.minimaVerde}),MAX(0,B${L_MENSALIDADE}-B${P.minimaVerde}),"—")`, v: k.descontoMaximo == null ? '—' : reais(k.descontoMaximo), s: 'reais',
  }, 'a resposta para "dá para fazer mais barato?"');

  // a linha do tempo: o mês 0 é a assinatura; as linhas depois do prazo ficam vazias (até o prazo máximo)
  g.por(tempo, 0, { v: 'A LINHA DO TEMPO', s: 'secao' });
  g.por(tempo, 2, { v: 'O mês 0 é a assinatura. O acumulado é o que a venda deu até o mês: abaixo de zero, ela ainda não se pagou.', s: 'nota' });
  ['Mês', 'A ativação (o que entra, sem o imposto e a comissão)', 'A sobra do mês', 'Sai (uma vez e as parcelas da compra)', 'No mês', 'Acumulado', '(o mês, se negativo)']
    .forEach((t, i) => g.por(tempo + 1, i, { v: t, s: 'cabecalho' }));
  const imposto = c.imposto / 100;
  const ativacaoEmCentavos = `ROUND(${B(L.ativacao)}*100,0)`;
  // o que sai pelos custos de uma vez: tudo na assinatura, menos o que os aparelhos comprados parcelado deixam
  // para os meses seguintes (cada um em até 24 vezes e não mais que o prazo; a primeira leva o resto, como na ativação)
  const vezes = (r: number) => `MIN(MAX(1,$H$${r}),${MAX_PARCELAS_DA_COMPRA},MAX(1,${B(L_PRAZO)}))`;
  const emCentavos = (r: number) => `ROUND($I$${r}*100,0)`;
  const parcelaDoAparelho = (r: number, m: number) => `IF(${m}<${vezes(r)},(${m === 0
    ? `${emCentavos(r)}-INT(${emCentavos(r)}/${vezes(r)})*(${vezes(r)}-1)`
    : `INT(${emCentavos(r)}/${vezes(r)})`})/100,0)`;
  const saiNoMes = (m: number) => {
    if (!linhasDosAparelhos.length) return m === 0 ? `$I$${total}` : '0';
    const parcelas = linhasDosAparelhos.map((r) => parcelaDoAparelho(r, m)).join('+');
    return m === 0 ? `$I$${total}-(${linhasDosAparelhos.map((r) => `$I$${r}`).join('+')})+${parcelas}` : parcelas;
  };
  for (let m = 0; m <= MAX_PRAZO; m++) {
    const r = T0 + m;
    const dentro = m <= c.prazo;
    const se = (formula: string) => `IF(${m}>${B(L_PRAZO)},"",${formula})`;
    const parcela = m === 0
      ? `${ativacaoEmCentavos}-INT(${ativacaoEmCentavos}/${B(L.vezes)})*(${B(L.vezes)}-1)`
      : `INT(${ativacaoEmCentavos}/${B(L.vezes)})`;
    const entra = dentro ? (m < k.parcelas.length ? (k.parcelas[m]! * (1 - imposto - pctAtivacao)) / 100 : 0) : '';
    const sobra = dentro ? (m === 0 ? 0 : k.sobraMensal / 100) : '';
    const sai = dentro ? k.saidas[m]! / 100 : '';
    const noMes = dentro ? (entra as number) + (sobra as number) - (sai as number) : '';
    g.por(r, 0, { f: se(String(m)), v: dentro ? m : '', s: 'inteiro' });
    g.por(r, 1, { f: se(`IF(${m}<${B(L.vezes)},(${parcela})/100*(1-${B(L_IMPOSTO)}-${B(L.comissaoDaAtivacao)}),0)`), v: entra, s: 'reais' });
    g.por(r, 2, { f: se(m === 0 ? '0' : B(L.sobra)), v: sobra, s: 'reais' });
    g.por(r, 3, { f: se(saiNoMes(m)), v: sai, s: 'reais' });
    g.por(r, 4, { f: se(`B${r}+C${r}-D${r}`), v: noMes, s: 'reais' });
    g.por(r, 5, { f: m === 0 ? `E${r}` : se(`F${r - 1}+E${r}`), v: dentro ? k.serie[m]! / 100 : '', s: 'reaisForte' });
    g.por(r, 6, { f: se(`IF(ROUND(F${r},2)<0,${m},-1)`), v: dentro ? (k.serie[m]! < 0 ? m : -1) : '', s: 'sub' });
  }

  const ref = (linha: number) => refDaFolha(nomeDaFolha, `$B$${linha}`);
  return {
    folha: { nome: nomeDaFolha, larguras: LARGURAS, linhas: g.completar(), paisagem: true },
    numeros: {
      mensal: ref(L.mensal), ativacao: ref(L.ativacao), prazo: ref(L_PRAZO), custoDoMes: ref(L.custoDoMes), sobra: ref(L.sobra),
      margem: ref(L.margem), sinal: ref(L.sinal), saiAntes: ref(L.saiAntes), sePaga: ref(L.sePaga), contrato: ref(L.contrato),
    },
  };
}

/** A folha "Lado a lado" (dois cenários ou mais): cada número puxa da folha do cenário. */
function folhaLadoALado(p: PedidoDaPlanilha, cenarios: Array<{ c: CenarioDaSimulacao; k: ContasDoCenario; numeros: NumerosDaFolha }>, nome: string): FolhaDaPlanilha {
  const g = new Grade();
  g.por(1, 0, { v: p.simulacao.nome, s: 'titulo' });
  g.por(2, 0, { v: 'Os cenários lado a lado', s: 'sub' });
  g.por(3, 0, { v: 'Os números vêm das folhas de cada cenário: mude lá, e aqui acompanha.', s: 'nota' });
  g.por(5, 0, { v: '', s: 'cabecalho' });
  cenarios.forEach(({ c }, i) => g.por(5, i + 1, { v: `${c.nome}${p.simulacao.principal === c.id ? ' (o principal)' : ''}`, s: 'cabecalho' }));
  const linhas: Array<[string, keyof NumerosDaFolha, (x: { c: CenarioDaSimulacao; k: ContasDoCenario }) => string | number, CelulaDaPlanilha['s']]> = [
    ['O cliente paga por mês', 'mensal', ({ k }) => reais(k.mensalTotal), 'reais'],
    ['A ativação', 'ativacao', ({ k }) => reais(k.entradaTotal), 'reais'],
    ['O prazo (meses)', 'prazo', ({ c }) => c.prazo, 'inteiro'],
    ['O custo do mês', 'custoDoMes', ({ k }) => reais(k.custoMensal), 'reais'],
    ['Sobra por mês', 'sobra', ({ k }) => reais(k.sobraMensal), 'reaisForte'],
    ['A margem', 'margem', ({ k }) => k.margem ?? '', 'pctForte'],
    ['O sinal', 'sinal', ({ k }) => (k.sinal ? NOME_DO_SINAL[k.sinal] : ''), 'forte'],
    ['Sai antes', 'saiAntes', ({ k }) => reais(k.investimento), 'reais'],
    ['Se paga', 'sePaga', ({ k }) => textoDoSePagaEm(k.sePagaEm), 'normal'],
    ['No contrato', 'contrato', ({ k }) => reais(k.resultado), 'reaisForte'],
  ];
  linhas.forEach(([rotulo, chave, valor, s], i) => {
    g.por(6 + i, 0, { v: rotulo, s: chave === 'sobra' || chave === 'margem' || chave === 'contrato' ? 'forte' : 'normal' });
    cenarios.forEach((x, j) => g.por(6 + i, j + 1, { f: x.numeros[chave], v: valor(x), s }));
  });
  return { nome, larguras: [30, ...cenarios.map(() => 26)], linhas: g.completar(), paisagem: true };
}

/** A planilha da simulação: os bytes do .xlsx e o nome do arquivo. */
export function planilhaDaSimulacao(p: PedidoDaPlanilha): { bytes: Uint8Array; nome: string } {
  const cenarios = p.simulacao.cenarios;
  const varios = cenarios.length > 1;
  const nomes = nomesDasFolhas([...(varios ? ['Lado a lado'] : []), ...cenarios.map((c) => c.nome || 'Cenário')]);
  const nomesDosCenarios = varios ? nomes.slice(1) : nomes;
  const feitas = cenarios.map((c, i) => {
    const k = contasDoCenario(c, p.faixas);
    return { c, k, ...folhaDoCenario(p, c, k, nomesDosCenarios[i]!) };
  });
  const folhas = [...(varios ? [folhaLadoALado(p, feitas, nomes[0]!)] : []), ...feitas.map((x) => x.folha)];
  return {
    bytes: montarXlsx(folhas, { titulo: p.simulacao.nome, autor: p.quem, quando: p.quando }),
    nome: nomeDaPlanilhaDaSimulacao(p.simulacao.nome, p.quando),
  };
}
