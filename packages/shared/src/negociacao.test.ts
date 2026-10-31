import { describe, expect, it } from 'vitest';
import { CondicoesDaNegociacaoSchema, cobrancaMesAMes, condicoesGuardadas, mesmasCondicoes, mesDeHoje, mesMais, textoDasCondicoes } from './negociacao.js';

describe('as condições da negociação (2.4)', () => {
  // o exemplo do Luan: "um desconto de 200 reais até março do ano que vem, além disso a ativação só vai ser paga a partir de
  // março tbm e dividida em 6 vezes"
  const combinado = CondicoesDaNegociacaoSchema.parse({ descontos: [{ valor: 20_000, ate: '2027-03' }], ativacao: { aPartirDe: '2027-03', vezes: 6 } });

  it('confere o que foi escrito', () => {
    expect(combinado.observacao).toBeNull();
    expect(CondicoesDaNegociacaoSchema.safeParse({ descontos: [{ valor: 100, de: '2027-04', ate: '2027-03' }] }).success).toBe(false);
    expect(CondicoesDaNegociacaoSchema.safeParse({ descontos: [{ valor: 100, ate: '2027-13' }] }).success).toBe(false);
    expect(CondicoesDaNegociacaoSchema.safeParse({ ativacao: { aPartirDe: '2027-03', vezes: 0 } }).success).toBe(false);
    expect(condicoesGuardadas({ descontos: [], ativacao: null, observacao: '' })).toBeNull();
    expect(condicoesGuardadas('lixo')).toBeNull();
  });

  it('numa linha, para o histórico', () => {
    expect(textoDasCondicoes(combinado)?.replace(/\u00a0/g, ' ')).toBe('Desconto de R$ 200,00/mês até mar/2027 · Ativação a partir de mar/2027, em 6 vezes');
    expect(textoDasCondicoes(null)).toBeNull();
    expect(mesmasCondicoes(combinado, { ...combinado })).toBe(true);
    expect(mesmasCondicoes(combinado, null)).toBe(false);
    expect(mesmasCondicoes(null, { descontos: [], ativacao: null, observacao: null })).toBe(true);
  });

  it('a cobrança mês a mês: o desconto até março, as 6 parcelas a partir de março, e a mensalidade cheia depois', () => {
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

  it('o desconto não passa da mensalidade e os meses vão de 3 a 24', () => {
    const c = CondicoesDaNegociacaoSchema.parse({ descontos: [{ valor: 50_000, ate: '2026-11' }] });
    const m = cobrancaMesAMes({ mensalidade: 30_000, ativacao: null, condicoes: c, desde: '2026-11' });
    expect(m).toHaveLength(3);
    expect(m[0]).toMatchObject({ desconto: 30_000, aPagar: 0 });
    const longe = CondicoesDaNegociacaoSchema.parse({ descontos: [{ valor: 1, ate: '2030-01' }] });
    expect(cobrancaMesAMes({ mensalidade: 100, ativacao: null, condicoes: longe, desde: '2026-11' })).toHaveLength(24);
  });

  it('os meses: somar e o de hoje em Brasília', () => {
    expect(mesMais('2026-11', 4)).toBe('2027-03');
    expect(mesMais('2027-01', -1)).toBe('2026-12');
    // 31/10 às 23h em Brasília já é 01/11 em UTC
    expect(mesDeHoje(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10');
  });
});
