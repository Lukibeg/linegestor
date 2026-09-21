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
  consertarAcentos, diaAoMeioDia, diaParaIso, identificacaoAparelho, lerLista, serieLimpa,
  formatarIp,
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
  });
  it('conserta acento embaralhado e deixa o resto em paz', () => {
    const embaralhar = (s: string) => Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join('');
    expect(consertarAcentos(embaralhar('Gefpel-Auto Peças'))).toBe('Gefpel-Auto Peças');
    expect(consertarAcentos(embaralhar('Clínica Olhar Bem'))).toBe('Clínica Olhar Bem');
    expect(consertarAcentos(embaralhar('Consef Ábaco'))).toBe('Consef Ábaco');
    expect(consertarAcentos('SÃO PAULO')).toBe('SÃO PAULO');
    expect(consertarAcentos('Clínica normal')).toBe('Clínica normal');
  });
  it('data de calendário vai para o meio-dia; horário de verdade fica', () => {
    expect(diaAoMeioDia(new Date('2025-11-03')).toISOString()).toBe('2025-11-03T12:00:00.000Z');
    expect(diaAoMeioDia(new Date('2025-11-03T14:22:10Z')).toISOString()).toBe('2025-11-03T14:22:10.000Z');
    expect(diaAoMeioDia(null)).toBeNull();
    expect(diaParaIso('2025-11-03')).toBe('2025-11-03T12:00:00.000Z');
    expect(diaParaIso('')).toBeNull();
  });
  it('lê lista colada e identifica o aparelho', () => {
    expect(lerLista('AA:BB\n cc-dd ; ee,ff\t\n')).toEqual(['AA:BB', 'cc-dd', 'ee', 'ff']);
    expect(identificacaoAparelho({ mac: '000B82A1B2C3' })).toEqual({ tipo: 'mac', texto: '00:0B:82:A1:B2:C3' });
    expect(identificacaoAparelho({ mac: null, serialNumber: 'SN123' })).toEqual({ tipo: 'serie', texto: 'SN123' });
    expect(identificacaoAparelho({})).toEqual({ tipo: 'nenhum', texto: 'não aplicável' });
    expect(serieLimpa(' ab12 cd ')).toBe('AB12CD');
    expect(reais(123456).replace(/ /g, ' ')).toBe('R$ 1.234,56');
  });
});

describe('máscara de IP', () => {
  it('põe os pontos sozinha enquanto se digita', () => {
    expect(formatarIp('19216801')).toBe('192.168.0.1');
    expect(formatarIp('1921681')).toBe('192.168.1');
    expect(formatarIp('2552552550')).toBe('255.255.255.0');
    expect(formatarIp('8.8.8.8')).toBe('8.8.8.8');
    expect(formatarIp('10.20.0.77')).toBe('10.20.0.77');
    expect(formatarIp('263')).toBe('26.3');
    expect(formatarIp('1001')).toBe('100.1');
    expect(formatarIp('192.168.0.1.5')).toBe('192.168.0.1');
    expect(formatarIp('abc')).toBe('');
    // ponto digitado à mão fica, para dar para escrever 10.1.1.0 dígito a dígito
    expect(formatarIp('10.')).toBe('10.');
    expect(formatarIp('10.1.')).toBe('10.1.');
    expect(formatarIp('10.1.1.')).toBe('10.1.1.');
    expect(formatarIp('10.1.1.0')).toBe('10.1.1.0');
    expect(formatarIp('10.1.1.0.')).toBe('10.1.1.0');
    expect(formatarIp('.')).toBe('');
  });
});
