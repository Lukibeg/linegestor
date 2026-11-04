import { describe, expect, it } from 'vitest';
import {
  CondicoesDaNegociacaoSchema, ativacaoAPagar, cobrancaMesAMes, condicoesGuardadas, mesesDosDescontos, mesesEntre, mesmasCondicoes,
  mesDeHoje, mesMais, primeiroMesDeFaturamento, textoDasCondicoes, NOME_CONDICOES,
} from './negociacao.js';

const semEspaco = (s: string | null) => s?.replace(/ /g, ' ') ?? null;

describe('as condições especiais da negociação (2.4, refeitas no 2.4.1)', () => {
  // o exemplo do Luan: "um desconto de 200 reais até março do ano que vem, além disso a ativação só vai ser paga a partir de
  // março tbm e dividida em 6 vezes"
  const combinado = CondicoesDaNegociacaoSchema.parse({ descontos: [{ valor: 20_000, ate: '2027-03' }], ativacao: { aPartirDe: '2027-03', vezes: 6 } });

  it('o nome é Condições especiais', () => {
    expect(NOME_CONDICOES).toBe('Condições especiais');
  });

  it('confere o que foi escrito: sem o "de", o sem prazo só no último, cada desconto depois do anterior', () => {
    expect(combinado).toEqual({ descontos: [{ valor: 20_000, ate: '2027-03' }], ativacao: { desconto: null, vezes: 6, aPartirDe: '2027-03' }, observacao: null });
    // o "de" do 2.4 fica de fora (o desconto começa no 1º mês de faturamento)
    expect(CondicoesDaNegociacaoSchema.parse({ descontos: [{ valor: 100, de: '2027-01', ate: '2027-03' }] }).descontos).toEqual([{ valor: 100, ate: '2027-03' }]);
    // sem prazo
    expect(CondicoesDaNegociacaoSchema.parse({ descontos: [{ valor: 100, ate: null }] }).descontos).toEqual([{ valor: 100, ate: null }]);
    expect(CondicoesDaNegociacaoSchema.parse({ descontos: [{ valor: 200, ate: '2027-03' }, { valor: 100 }] }).descontos[1]).toEqual({ valor: 100, ate: null });
    expect(CondicoesDaNegociacaoSchema.safeParse({ descontos: [{ valor: 100, ate: null }, { valor: 50, ate: '2027-03' }] }).success).toBe(false);
    expect(CondicoesDaNegociacaoSchema.safeParse({ descontos: [{ valor: 100, ate: '2027-03' }, { valor: 50, ate: '2027-03' }] }).success).toBe(false);
    expect(CondicoesDaNegociacaoSchema.safeParse({ descontos: [{ valor: 100, ate: '2027-13' }] }).success).toBe(false);
    expect(CondicoesDaNegociacaoSchema.safeParse({ ativacao: { aPartirDe: '2027-03', vezes: 0 } }).success).toBe(false);
    expect(CondicoesDaNegociacaoSchema.safeParse({ ativacao: { desconto: -1 } }).success).toBe(false);
    // a ativação sem nada diferente (sem desconto, 1 vez, no 1º mês) não é combinada
    expect(CondicoesDaNegociacaoSchema.parse({ ativacao: { desconto: 0, vezes: 1, aPartirDe: null } }).ativacao).toBeNull();
    expect(CondicoesDaNegociacaoSchema.parse({ ativacao: { desconto: 50_000 } }).ativacao).toEqual({ desconto: 50_000, vezes: 1, aPartirDe: null });
    expect(condicoesGuardadas({ descontos: [], ativacao: null, observacao: '' })).toBeNull();
    expect(condicoesGuardadas('lixo')).toBeNull();
  });

  it('o que foi guardado no 2.4 continua valendo', () => {
    expect(condicoesGuardadas({ descontos: [{ valor: 20_000, de: null, ate: '2027-03' }], ativacao: { aPartirDe: '2027-03', vezes: 6 }, observacao: null }))
      .toEqual({ descontos: [{ valor: 20_000, ate: '2027-03' }], ativacao: { desconto: null, vezes: 6, aPartirDe: '2027-03' }, observacao: null });
    // os descontos que se sobrepunham vão na ordem do mês em que acabam
    expect(condicoesGuardadas({ descontos: [{ valor: 5_000, de: '2027-01', ate: '2027-06' }, { valor: 20_000, de: null, ate: '2027-03' }] })?.descontos)
      .toEqual([{ valor: 20_000, ate: '2027-03' }, { valor: 5_000, ate: '2027-06' }]);
  });

  it('numa linha, para o histórico', () => {
    expect(semEspaco(textoDasCondicoes(combinado))).toBe('Desconto de R$ 200,00/mês até mar/2027 · Ativação em 6 vezes, a partir de mar/2027');
    const outras = CondicoesDaNegociacaoSchema.parse({
      descontos: [{ valor: 20_000, ate: '2027-03' }, { valor: 10_000, ate: null }], ativacao: { desconto: 50_000, vezes: 3 }, observacao: 'Enquanto pagar em dia',
    });
    expect(semEspaco(textoDasCondicoes(outras))).toBe('Desconto de R$ 200,00/mês até mar/2027, depois R$ 100,00/mês sem prazo · Ativação com R$ 500,00 de desconto, em 3 vezes, a partir do 1º mês · Enquanto pagar em dia');
    expect(semEspaco(textoDasCondicoes(CondicoesDaNegociacaoSchema.parse({ ativacao: { aPartirDe: '2027-02' } })))).toBe('Ativação paga em fev/2027');
    expect(textoDasCondicoes(null)).toBeNull();
    expect(mesmasCondicoes(combinado, { ...combinado })).toBe(true);
    expect(mesmasCondicoes(combinado, null)).toBe(false);
    expect(mesmasCondicoes(combinado, { ...combinado, ativacao: { ...combinado.ativacao!, desconto: 100 } })).toBe(false);
    expect(mesmasCondicoes(null, { descontos: [], ativacao: null, observacao: null })).toBe(true);
  });

  it('o 1º mês de faturamento é o mês do Ganho (antes dele, o de hoje)', () => {
    const agora = new Date('2026-11-03T15:00:00Z');
    expect(primeiroMesDeFaturamento({ resultado: 'ganho', fechadoEm: '2026-12-01T02:00:00Z' }, agora)).toEqual({ mes: '2026-11', doGanho: true });
    expect(primeiroMesDeFaturamento({ resultado: null, fechadoEm: null }, agora)).toEqual({ mes: '2026-11', doGanho: false });
    expect(primeiroMesDeFaturamento({ resultado: 'perdido', fechadoEm: '2026-09-10T12:00:00Z' }, agora)).toEqual({ mes: '2026-11', doGanho: false });
  });

  it('os descontos em sequência: cada um começa no mês depois do anterior', () => {
    expect(mesesDosDescontos([{ valor: 1, ate: '2027-03' }, { valor: 1, ate: '2027-06' }, { valor: 1, ate: null }], '2026-11')).toEqual([
      { de: '2026-11', ate: '2027-03', meses: 5 }, { de: '2027-04', ate: '2027-06', meses: 3 }, { de: '2027-07', ate: null, meses: null },
    ]);
    // o que acaba no 1º mês ocupa só ele; o que acabou antes do Ganho não ocupa mês nenhum
    expect(mesesDosDescontos([{ valor: 1, ate: '2026-11' }, { valor: 1, ate: null }], '2026-11')[1]).toMatchObject({ de: '2026-12' });
    expect(mesesDosDescontos([{ valor: 1, ate: '2026-09' }, { valor: 1, ate: null }], '2026-11')).toEqual([{ de: '2026-11', ate: '2026-09', meses: 0 }, { de: '2026-11', ate: null, meses: null }]);
  });

  it('a ativação: o desconto, o que fica e a parcela (a 1ª com os centavos que sobram)', () => {
    expect(ativacaoAPagar(150_001, { desconto: 50_000, vezes: 4, aPartirDe: null })).toEqual({ valor: 150_001, desconto: 50_000, aPagar: 100_001, parcela: 25_000, primeira: 25_001, vezes: 4 });
    // o desconto não passa do valor
    expect(ativacaoAPagar(30_000, { desconto: 50_000, vezes: 1, aPartirDe: null })).toMatchObject({ desconto: 30_000, aPagar: 0 });
    expect(ativacaoAPagar(null, null)).toMatchObject({ valor: 0, aPagar: 0, vezes: 1 });
  });

  it('a cobrança mês a mês, do 1º mês: o desconto até março, as 6 parcelas a partir de março, e a mensalidade cheia depois', () => {
    const meses = cobrancaMesAMes({ mensalidade: 99_000, ativacao: 300_001, condicoes: combinado, desde: '2026-11' });
    // de nov/2026 até ago/2027 (a 6ª parcela) e mais um
    expect(meses.map((m) => m.mes)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09']);
    expect(meses[0]).toMatchObject({ mensalidade: 99_000, desconto: 20_000, aPagar: 79_000, ativacao: 0, parcela: null, total: 79_000 });
    // março: o último mês com o desconto e a 1ª parcela (com o centavo que sobra da divisão)
    expect(meses[4]).toMatchObject({ desconto: 20_000, parcela: 1, ativacao: 50_001, total: 79_000 + 50_001 });
    expect(meses[5]).toMatchObject({ desconto: 0, parcela: 2, ativacao: 50_000, total: 99_000 + 50_000 });
    expect(meses[10]).toMatchObject({ parcela: null, total: 99_000 });
    expect(meses.reduce((s, m) => s + m.ativacao, 0)).toBe(300_001);
  });

  it('a cobrança com o desconto em degraus, o sem prazo e o desconto na ativação', () => {
    const c = CondicoesDaNegociacaoSchema.parse({ descontos: [{ valor: 20_000, ate: '2027-01' }, { valor: 10_000, ate: null }], ativacao: { desconto: 50_000, vezes: 2 } });
    const m = cobrancaMesAMes({ mensalidade: 99_000, ativacao: 150_000, condicoes: c, desde: '2026-11' });
    // o sem prazo começa em fev/2027: aparece ele e mais dois meses
    expect(m.map((x) => x.mes)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
    expect(m.map((x) => x.desconto)).toEqual([20_000, 20_000, 20_000, 10_000, 10_000, 10_000]);
    // a ativação: R$ 1.500 − R$ 500 = R$ 1.000, em 2 vezes desde o 1º mês
    expect(m.map((x) => x.ativacao)).toEqual([50_000, 50_000, 0, 0, 0, 0]);
  });

  it('sem a ativação combinada, ela vai inteira no 1º mês; a marcada antes do 1º mês começa nele', () => {
    const c = CondicoesDaNegociacaoSchema.parse({ descontos: [{ valor: 10_000, ate: '2026-12' }] });
    const m = cobrancaMesAMes({ mensalidade: 50_000, ativacao: 80_000, condicoes: c, desde: '2026-11' });
    expect(m[0]).toMatchObject({ ativacao: 80_000, parcela: 1, total: 40_000 + 80_000 });
    expect(m[1]).toMatchObject({ ativacao: 0, parcela: null });
    const antes = CondicoesDaNegociacaoSchema.parse({ ativacao: { aPartirDe: '2026-09', vezes: 2 } });
    expect(cobrancaMesAMes({ mensalidade: 50_000, ativacao: 80_000, condicoes: antes, desde: '2026-11' }).slice(0, 3).map((x) => x.parcela)).toEqual([1, 2, null]);
  });

  it('o desconto não passa da mensalidade e os meses vão de 3 a 24', () => {
    const c = CondicoesDaNegociacaoSchema.parse({ descontos: [{ valor: 50_000, ate: '2026-11' }] });
    const m = cobrancaMesAMes({ mensalidade: 30_000, ativacao: null, condicoes: c, desde: '2026-11' });
    expect(m).toHaveLength(3);
    expect(m[0]).toMatchObject({ desconto: 30_000, aPagar: 0 });
    const longe = CondicoesDaNegociacaoSchema.parse({ descontos: [{ valor: 1, ate: '2030-01' }] });
    expect(cobrancaMesAMes({ mensalidade: 100, ativacao: null, condicoes: longe, desde: '2026-11' })).toHaveLength(24);
  });

  it('os meses: somar, a distância e o de hoje em Brasília', () => {
    expect(mesMais('2026-11', 4)).toBe('2027-03');
    expect(mesMais('2027-01', -1)).toBe('2026-12');
    expect(mesesEntre('2026-11', '2027-03')).toBe(4);
    // 31/10 às 23h em Brasília já é 01/11 em UTC
    expect(mesDeHoje(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10');
  });
});
