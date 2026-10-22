/**
 * A planilha do Excel da simulação (Patch 2.0.2, a ideia "excel" do Luan): o zip e os XMLs do .xlsx, os nomes
 * das folhas, as fórmulas (as faixas da Helena viram fórmula) e os valores guardados — os mesmos da tela.
 * (A conferência no LibreOffice, que refaz cada fórmula e compara com a tela, está na decisão 0052.)
 */
import { describe, expect, it } from 'vitest';
import {
  AJUSTES_DO_SIMULADOR_PADRAO, MODELO_DA_HELENA, cenarioNovo, contasDoCenario, textoDoSePagaEm,
  type CenarioDaSimulacao, type LinhaDoCenario,
} from './simulador.js';
import { formulaDasFaixas, nomeDaPlanilhaDaSimulacao, planilhaDaSimulacao } from './simulador-planilha.js';
import { crc32, letraDaColuna, lerZipSemCompressao, montarXlsx, nomesDasFolhas } from './xlsx.js';

const A = AJUSTES_DO_SIMULADOR_PADRAO;
const QUANDO = new Date('2026-10-20T17:10:00Z');
let seq = 0;
const linha = (o: Partial<LinhaDoCenario> & Pick<LinhaDoCenario, 'nome' | 'tipo'>): LinhaDoCenario => ({
  id: `l${++seq}`, custoId: null, qtd: 1, valor: null, modalidade: null, preco: null, faixas: null, unidade: null, ...o,
});
function pbx(): CenarioDaSimulacao {
  return {
    ...cenarioNovo(A, { id: 'a', nome: 'Comodato, 24 meses' }),
    mensalidade: 125_000, ativacao: 190_000, parcelas: 3, prazo: 24,
    linhas: [
      linha({ nome: 'Telefone T31P', tipo: 'aparelho', modalidade: 'comodato', qtd: 20, valor: 39_000 }),
      linha({ nome: 'Headset', tipo: 'aparelho', modalidade: 'venda', qtd: 5, valor: 12_000, preco: 18_000 }),
      linha({ nome: 'Telefone sem fio', tipo: 'aparelho', modalidade: 'locacao', qtd: 4, valor: 25_000, preco: 1_500 }),
      linha({ nome: 'Nuvem', tipo: 'mensal', qtd: 40, valor: 890 }),
      linha({ nome: 'Comissão recorrente', tipo: 'pct_mensalidade', valor: 5 }),
      linha({ nome: 'Comissão da venda', tipo: 'pct_ativacao', valor: 10 }),
    ],
  };
}
const simulacao = (cenarios: CenarioDaSimulacao[], nome = 'Padaria Estrela — 40 ramais') => ({
  nome, negociacaoId: 'n1', negociacao: { id: 'n1', codigo: 'COM-12', titulo: 'PABX em nuvem', empresa: 'Padaria Estrela', resultado: null }, cenarios, principal: cenarios[0]!.id,
});

/** As células de uma folha: a referência → a fórmula e o valor guardado. */
function celulas(xml: string): Map<string, { f: string | null; v: string }> {
  const r = new Map<string, { f: string | null; v: string }>();
  const desfaz = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?:\/>|>(.*?)<\/c>)/g)) {
    const corpo = m[2] ?? '';
    const f = /<f>(.*?)<\/f>/.exec(corpo)?.[1];
    const v = /<v>(.*?)<\/v>/.exec(corpo)?.[1] ?? /<t[^>]*>(.*?)<\/t>/.exec(corpo)?.[1] ?? '';
    r.set(m[1]!, { f: f == null ? null : desfaz(f), v: desfaz(v) });
  }
  return r;
}
/** O valor ao lado (B) do rótulo (A). */
function aoLado(c: Map<string, { f: string | null; v: string }>, rotulo: string | RegExp) {
  for (const [ref, x] of c) {
    if (!ref.startsWith('A') || !/^A\d+$/.test(ref)) continue;
    if (typeof rotulo === 'string' ? x.v === rotulo : rotulo.test(x.v)) return c.get(`B${ref.slice(1)}`);
  }
  return undefined;
}

describe('o .xlsx', () => {
  it('é um zip com as partes do Excel, e o CRC de cada uma confere', () => {
    const bytes = montarXlsx([{ nome: 'Uma', linhas: [[{ v: 'Olá & <tchau>' }, { v: 2.5, s: 'reais' }, { f: 'B1*2', v: 5 }]] }], { titulo: 'T', quando: QUANDO });
    const z = lerZipSemCompressao(bytes);
    expect([...z.keys()]).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml',
    ]);
    // o CRC do zip é o do conteúdo (o Excel recusa o arquivo se não for)
    const d = new DataView(bytes.buffer, bytes.byteOffset);
    expect(d.getUint32(14, true)).toBe(crc32(z.get('[Content_Types].xml')!));
    const folha = new TextDecoder().decode(z.get('xl/worksheets/sheet1.xml'));
    expect(folha).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Olá &amp; &lt;tchau&gt;</t></is></c>');
    expect(folha).toContain('<c r="C1"><f>B1*2</f><v>5</v></c>');
    expect(new TextDecoder().decode(z.get('xl/workbook.xml'))).toContain('fullCalcOnLoad="1"');
  });

  it('as colunas e os nomes das folhas como o Excel aceita', () => {
    expect([0, 11, 25, 26, 27, 701, 702].map(letraDaColuna)).toEqual(['A', 'L', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    expect(nomesDasFolhas(['Cenário A', 'cenário a', 'A/B: 50%?', '', "'aspas'", 'x'.repeat(40)]))
      .toEqual(['Cenário A', 'cenário a (2)', 'A B 50%', 'Folha', 'aspas', 'x'.repeat(31)]);
  });
});

describe('a planilha da simulação', () => {
  it('o nome do arquivo: sem acento e sem símbolo, com o dia', () => {
    expect(nomeDaPlanilhaDaSimulacao('Padaria Estrela — 40 ramais', QUANDO)).toBe('simulacao-padaria-estrela-40-ramais-2026-10-20.xlsx');
    expect(nomeDaPlanilhaDaSimulacao('Ótica: Visão & Cia.', QUANDO)).toBe('simulacao-otica-visao-cia-2026-10-20.xlsx');
    expect(nomeDaPlanilhaDaSimulacao('!!!', QUANDO)).toBe('simulacao-sem-nome-2026-10-20.xlsx');
  });

  it('as faixas da Helena viram fórmula: cada unidade paga o preço da faixa em que cai', () => {
    const usuarios = A.custos.find((c) => c.id === 'helena-usuarios')!.faixas!;
    expect(formulaDasFaixas('E20', usuarios)).toBe('MAX(0,MIN(E20,20)-3)*19.9+MAX(0,MIN(E20,100)-20)*14.9+MAX(0,E20-100)*12.9');
    const contatos = A.custos.find((c) => c.id === 'helena-contatos')!.faixas!;
    expect(formulaDasFaixas('E9', contatos)).toBe('MAX(0,MIN(E9,20000)-5000)*0.045+MAX(0,MIN(E9,100000)-20000)*0.035+MAX(0,E9-100000)*0.025');
    expect(formulaDasFaixas('E1', [{ ate: 3, valor: 0 }])).toBe('0');
  });

  it('uma folha por cenário, com a conta em fórmula e os valores da tela; a "Lado a lado" puxa de cada um', () => {
    const a = pbx();
    const b = { ...pbx(), id: 'b', nome: '12 meses', prazo: 12 };
    const r = planilhaDaSimulacao({ simulacao: simulacao([a, b]), faixas: A, quem: 'Camila Duarte', quando: QUANDO });
    expect(r.nome).toBe('simulacao-padaria-estrela-40-ramais-2026-10-20.xlsx');
    const z = lerZipSemCompressao(r.bytes);
    const texto = (n: string) => new TextDecoder().decode(z.get(n));
    expect([...texto('xl/workbook.xml').matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1])).toEqual(['Lado a lado', 'Comodato, 24 meses', '12 meses']);

    const c = celulas(texto('xl/worksheets/sheet2.xml'));
    const k = contasDoCenario(a, A);
    expect(c.get('A1')!.v).toBe('Padaria Estrela — 40 ramais');
    expect(c.get('A2')!.v).toBe('Cenário: Comodato, 24 meses (o principal)');
    expect(c.get('A3')!.v).toBe('Negociação COM-12 · PABX em nuvem · Padaria Estrela');
    expect(c.get('A4')!.v).toMatch(/^Exportada do Gestor em 20\/10\/2026 às 14:10, por Camila Duarte\./);
    // o que o cliente paga: os valores (as células amarelas)
    expect([c.get('B7')!.v, c.get('B8')!.v, c.get('B9')!.v, c.get('B10')!.v, c.get('B11')!.v]).toEqual(['1250', '1900', '3', '24', '0.06']);
    expect(c.get('A11')!.v).toBe('Imposto');
    // sem os ramais (o Luan, 21/10: "é melhor eu sempre selecionar a quantidade"): nem a linha nem a coluna;
    // e sem "O preço" (21/10: "isso não precisa ter"): nem a margem que se queria, nem a mensalidade mínima
    expect([...c].some(([, x]) => x.v === 'Ramais' || x.v === 'Por ramal')).toBe(false);
    expect(c.get('A12')).toBeUndefined();
    expect([...c].some(([, x]) => /O PREÇO|mínima|margem que você quer|Desconto máximo/.test(x.v))).toBe(false);
    expect(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map((x) => c.get(`${x}16`)!.v)).toEqual([
      'Custo', 'Tipo', 'O aparelho vai em', 'Quantidade', 'Valor de cada', 'Preço ou aluguel de cada', 'A compra em (vezes)',
      'Sai uma vez', 'Sai por mês', 'Entra uma vez', 'Entra por mês', 'Observação',
    ]);
    // os custos em dois grupos, o investimento primeiro: o nome do grupo numa linha, e as linhas dele
    expect([17, 18, 19, 20, 21, 22, 23, 24, 25].map((r) => c.get(`A${r}`)!.v)).toEqual([
      'Investimento · pago uma vez, na assinatura', 'Telefone T31P', 'Headset', 'Telefone sem fio', 'Comissão da venda',
      'Custos mensais · todo mês', 'Nuvem', 'Comissão recorrente', 'Total',
    ]);
    // a quantidade é a célula amarela; o vendido entra na ativação; o alugado, na mensalidade; a comissão sobre o mês
    expect(c.get('D23')!.v).toBe('40');
    expect(c.get('D23')!.f ?? null).toBeNull();
    expect(c.get('J19')).toEqual({ f: 'D19*F19', v: '900' });
    expect(c.get('K20')).toEqual({ f: 'D20*F20', v: '60' });
    expect(c.get('I24')!.f).toMatch(/^E24\*\$B\$\d+$/);
    expect(c.get('H25')!.f).toBe('SUM(H17:H24)');
    // a compra em (vezes): a célula amarela de cada aparelho (à vista = 1)
    expect([c.get('G18')!.v, c.get('G19')!.v, c.get('G20')!.v, c.get('G23')]).toEqual(['1', '1', '1', undefined]);
    // os números: os mesmos da tela
    expect(Number(aoLado(c, 'O cliente paga por mês')!.v)).toBe(k.mensalTotal / 100);
    expect(Number(aoLado(c, 'O investimento')!.v)).toBe(k.totalInvestido / 100);
    expect(Number(aoLado(c, 'O custo fixo do mês')!.v)).toBe(k.custoMensalFixo / 100);
    expect(Number(aoLado(c, 'O custo variável do mês')!.v)).toBe((k.impostoMensal + k.comissaoMensal) / 100);
    expect(Number(aoLado(c, 'Sobra por mês')!.v)).toBeCloseTo(k.sobraMensal / 100, 2);
    expect(Number(aoLado(c, 'A margem')!.v)).toBeCloseTo(k.margem!, 6);
    expect(aoLado(c, 'O sinal')!.v).toBe('Verde');
    expect(Number(aoLado(c, 'Sai antes')!.v)).toBe(k.investimento / 100);
    expect(aoLado(c, 'Se paga')!.v).toBe(textoDoSePagaEm(k.sePagaEm));
    expect(Number(aoLado(c, /^No contrato/)!.v)).toBeCloseTo(k.resultado / 100, 2);
    // o mês a mês: do 1º mês (o da assinatura) ao prazo, o faturamento, os custos, o lucro e o acumulado; depois, vazio
    const t0 = [...c].find(([ref, x]) => ref.startsWith('A') && x.v === 'Mês')![0];
    const primeiro = Number(t0.slice(1)) + 1;
    expect(['B', 'C', 'D', 'E'].map((x) => c.get(`${x}${Number(t0.slice(1))}`)!.v)).toEqual(['Faturamento', 'Custos', 'Lucro do mês', 'Acumulado']);
    expect(c.get(`A${primeiro}`)!.v).toBe('1');
    const m1 = k.meses[0]!;
    expect([`B${primeiro}`, `C${primeiro}`, `D${primeiro}`, `E${primeiro}`].map((x) => Number(c.get(x)!.v))).toEqual([m1.faturamento / 100, m1.custos / 100, m1.lucro / 100, k.serie[0]! / 100]);
    expect(c.get(`E${primeiro}`)!.f).toBe(`D${primeiro}`);
    expect(Number(c.get(`E${primeiro + 23}`)!.v)).toBe(k.serie[23]! / 100);
    expect(c.get(`E${primeiro + 24}`)!.v).toBe('');
    // a Lado a lado: a fórmula aponta a folha do cenário
    const l = celulas(texto('xl/worksheets/sheet1.xml'));
    expect(l.get('B5')!.v).toBe('Comodato, 24 meses (o principal)');
    expect(l.get('A13')!.v).toBe('Sobra por mês');
    expect(l.get('C13')!.f).toMatch(/^'12 meses'!\$B\$\d+$/);
    expect(Number(l.get('C13')!.v)).toBeCloseTo(contasDoCenario(b, A).sobraMensal / 100, 2);
    // a diferença de cada cenário para o principal: os números; o sinal e o "se paga" (texto), sem
    expect(l.get('D5')!.v).toBe('Diferença: 12 meses − Comodato, 24 meses');
    expect(l.get('D8')).toEqual({ f: 'IF(AND(ISNUMBER(C8),ISNUMBER(B8)),C8-B8,"")', v: '-12' });
    expect(l.get('A15')!.v).toBe('O sinal');
    expect(l.get('D15')).toBeUndefined();
  });

  it('o preço por produto: a tabela ao lado, e a mensalidade e a ativação são as somas', () => {
    const c = { ...pbx(), produtos: ['linepbx', 'voicenet'], porProduto: [{ produto: 'linepbx', mensalidade: 125_000, ativacao: 190_000 }, { produto: 'voicenet', mensalidade: 42_000, ativacao: 0 }], mensalidade: 167_000 };
    const r = planilhaDaSimulacao({ simulacao: simulacao([c]), faixas: A, quem: null, quando: QUANDO, nomesDosProdutos: { linepbx: 'LinePBX', voicenet: 'VoiceNet' } });
    const cel = celulas(new TextDecoder().decode(lerZipSemCompressao(r.bytes).get('xl/worksheets/sheet1.xml')));
    expect([cel.get('H6')!.v, cel.get('H7')!.v, cel.get('H8')!.v, cel.get('I8')!.v, cel.get('J8')!.v, cel.get('H9')!.v, cel.get('I9')!.v]).toEqual(['O preço de cada produto', 'Produto', 'LinePBX', '1250', '1900', 'VoiceNet', '420']);
    expect(cel.get('B7')).toEqual({ f: 'SUM(I8:I9)', v: '1670' });
    expect(cel.get('B8')).toEqual({ f: 'SUM(J8:J9)', v: '1900' });
  });

  it('um cenário só: sem a "Lado a lado"; a negociação de outro painel não aparece', () => {
    const c = { ...cenarioNovo(A, { id: 'h', nome: 'LineChat', modelo: MODELO_DA_HELENA }), mensalidade: 99_000 };
    const r = planilhaDaSimulacao({ simulacao: { ...simulacao([c], 'Clínica'), negociacao: null }, faixas: A, quem: null, quando: QUANDO });
    const z = lerZipSemCompressao(r.bytes);
    const workbook = new TextDecoder().decode(z.get('xl/workbook.xml'));
    expect([...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1])).toEqual(['LineChat']);
    const cel = celulas(new TextDecoder().decode(z.get('xl/worksheets/sheet1.xml')));
    expect(cel.get('A2')!.v).toBe('Cenário: LineChat');
    expect(cel.get('A3')!.v).toBe('Ligada a uma negociação de um painel que você não vê');
    expect(cel.get('A4')!.v).not.toContain(', por');
    // o custo por faixas: a fórmula com as faixas, e a observação conta quais são
    const usuarios = [...cel].find(([ref, x]) => ref.startsWith('A') && x.v === 'Usuários do LineChat (Helena)')![0].slice(1);
    expect(cel.get(`E${usuarios}`)!.v).toBe('por faixas');
    expect(cel.get(`I${usuarios}`)!.f).toBe(`MAX(0,MIN(D${usuarios},20)-3)*19.9+MAX(0,MIN(D${usuarios},100)-20)*14.9+MAX(0,D${usuarios}-100)*12.9`);
    expect(cel.get(`L${usuarios}`)!.v).toMatch(/^por faixas: até 3, incluso; de 4 a 20, R\$\s19,90 cada/);
  });
});
