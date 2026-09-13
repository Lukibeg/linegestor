import { describe, expect, it } from 'vitest';
import { cnpjFormatado, cnpjValido, didFormatado, gerarFaixaDids, macFormatado, macValido, paraCentavos, reais } from './formatos.js';

describe('CNPJ', () => {
  it('formata 14 dígitos', () => {
    expect(cnpjFormatado('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('valida dígito verificador', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
  });
});

describe('DID', () => {
  it('formata fixo, móvel e 0800', () => {
    expect(didFormatado('7130201234')).toBe('(71) 3020-1234');
    expect(didFormatado('71930201234')).toBe('(71) 93020-1234');
    expect(didFormatado('08001234567')).toBe('0800 123 4567');
  });
  it('gera faixa preservando zeros à esquerda', () => {
    expect(gerarFaixaDids('7130201298', 3)).toEqual(['7130201298', '7130201299', '7130201300']);
    expect(gerarFaixaDids('0800123456', 2)).toEqual(['0800123456', '0800123457']);
  });
});

describe('MAC', () => {
  it('normaliza e formata', () => {
    expect(macFormatado('00-0b-82-a1-b2-c3')).toBe('00:0B:82:A1:B2:C3');
    expect(macValido('000B82A1B2C3')).toBe(true);
    expect(macValido('000B82A1B2')).toBe(false);
  });
});

describe('Dinheiro', () => {
  it('converte texto brasileiro para centavos e volta', () => {
    expect(paraCentavos('1.234,56')).toBe(123456);
    expect(paraCentavos('603.38')).toBe(60338);
    expect(reais(60338)).toMatch(/603,38/);
  });
});
