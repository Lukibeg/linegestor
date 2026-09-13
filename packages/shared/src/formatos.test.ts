/**
 * Testes dos formatos de dado. Cada bloco confere uma regra que a tela e o servidor usam:
 * se alguém mudar o jeito de limpar um CNPJ ou gerar uma faixa de DIDs, isto avisa.
 */
import { describe, expect, it } from 'vitest';
import {
  cnpjFormatado, cnpjLimpo, cnpjValido,
  didFormatado, didLimpo, didValido, gerarFaixaDids,
  macFormatado, macLimpo, macValido,
  paraCentavos, reais,
} from './formatos.js';

describe('CNPJ', () => {
  it('limpa e formata', () => {
    expect(cnpjLimpo('22.333.444/0001-81')).toBe('22333444000181');
    expect(cnpjFormatado('22333444000181')).toBe('22.333.444/0001-81');
  });
  it('valida os dígitos verificadores', () => {
    expect(cnpjValido('22.333.444/0001-81')).toBe(true);
    expect(cnpjValido('22333444000182')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
    expect(cnpjValido('123')).toBe(false);
  });
});

describe('DID', () => {
  it('limpa, formata e valida', () => {
    expect(didLimpo('(71) 3020-1234')).toBe('7130201234');
    expect(didFormatado('7130201234')).toBe('(71) 3020-1234');
    expect(didFormatado('71930201234')).toBe('(71) 93020-1234');
    expect(didFormatado('08001234567')).toBe('0800 123 4567');
    expect(didValido('7130201234')).toBe(true);
    expect(didValido('713020')).toBe(false);
  });
  it('gera faixas preservando zeros à esquerda', () => {
    expect(gerarFaixaDids('7130201200', 3)).toEqual(['7130201200', '7130201201', '7130201202']);
    expect(gerarFaixaDids('08000000098', 3)).toEqual(['08000000098', '08000000099', '08000000100']);
    expect(gerarFaixaDids('7130201200', 0)).toEqual([]);
  });
});

describe('MAC', () => {
  it('guarda em 12 hexadecimais maiúsculos e exibe com dois-pontos', () => {
    expect(macLimpo('00:0b:82-a1_b2 c3')).toBe('000B82A1B2C3');
    expect(macFormatado('000B82A1B2C3')).toBe('00:0B:82:A1:B2:C3');
    expect(macValido('00:0B:82:A1:B2:C3')).toBe(true);
    expect(macValido('00:0B:82')).toBe(false);
  });
});

describe('Dinheiro', () => {
  it('converte entre centavos e texto', () => {
    expect(paraCentavos('1.234,56')).toBe(123456);
    expect(paraCentavos('1234.56')).toBe(123456);
    expect(paraCentavos('R$ 99,90')).toBe(9990);
    expect(paraCentavos(12.34)).toBe(1234);
    expect(paraCentavos('abc')).toBe(0);
    expect(reais(null)).toBe('—');
    expect(reais(123456).replace(/ /g, ' ')).toBe('R$ 1.234,56');
  });
});
