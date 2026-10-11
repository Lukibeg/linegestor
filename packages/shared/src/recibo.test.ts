import { describe, expect, it } from 'vitest';
import { problemaDoRecibo, problemaParaAnexar, ReciboAnexarSchema, tipoDeclaradoDoRecibo, tipoDoRecibo } from './recibo.js';

const bytes = (...xs: Array<number | string>) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe('o tipo de verdade do recibo', () => {
  it('PDF, JPG, PNG e WEBP pelos primeiros bytes', () => {
    expect(tipoDoRecibo(bytes('%PDF-1.7\n'))).toBe('application/pdf');
    expect(tipoDoRecibo(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(tipoDoRecibo(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(tipoDoRecibo(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp');
  });
  it('o resto não passa, nem com o nome trocado', () => {
    expect(tipoDoRecibo(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(tipoDoRecibo(bytes('MZ', 0x90, 0))).toBeNull(); // um .exe renomeado para .pdf
    expect(tipoDoRecibo(bytes('GIF89a'))).toBeNull();
    expect(tipoDoRecibo(bytes())).toBeNull();
  });
});

describe('antes de subir', () => {
  it('confere tipo e tamanho, com o nome do arquivo na mensagem', () => {
    expect(problemaDoRecibo({ nome: 'recibo.pdf', tipo: 'application/pdf', bytes: 300_000 })).toBeNull();
    expect(problemaDoRecibo({ nome: 'planilha.xlsx', tipo: 'application/vnd.ms-excel', bytes: 1000 })).toBe('"planilha.xlsx" não é PDF nem foto (JPG, PNG ou WEBP).');
    expect(problemaDoRecibo({ nome: 'grande.pdf', tipo: 'application/pdf', bytes: 11 * 1024 * 1024 })).toMatch(/passa de 10 MB/);
    expect(problemaDoRecibo({ nome: 'vazio.jpg', tipo: 'image/jpeg', bytes: 0 })).toMatch(/vazio/);
  });
  it('sem o tipo do navegador, vale a extensão', () => {
    expect(tipoDeclaradoDoRecibo({ nome: 'Recibo Hospital.PDF', tipo: '' })).toBe('application/pdf');
    expect(tipoDeclaradoDoRecibo({ nome: 'foto.jpeg', tipo: '' })).toBe('image/jpeg');
    expect(tipoDeclaradoDoRecibo({ nome: 'foto.heic', tipo: '' })).toBe('');
    expect(tipoDeclaradoDoRecibo({ nome: 'x.pdf', tipo: 'image/PNG' })).toBe('image/png');
  });
  it('só a movimentação para cliente tem recibo, e até 5 arquivos', () => {
    expect(problemaParaAnexar({ toClientId: 'c1' }, 0)).toBeNull();
    expect(problemaParaAnexar({ toClientId: 'c1' }, 4)).toBeNull();
    expect(problemaParaAnexar({ toClientId: 'c1' }, 5)).toMatch(/já tem 5/);
    expect(problemaParaAnexar({ toClientId: null }, 0)).toMatch(/devolução não tem/);
  });
  it('o conteúdo vem embutido em base64', () => {
    expect(ReciboAnexarSchema.safeParse({ fileName: 'r.pdf', conteudo: 'data:application/pdf;base64,JVBERi0xLjcK' }).success).toBe(true);
    expect(ReciboAnexarSchema.safeParse({ fileName: 'r.pdf', conteudo: 'JVBERi0xLjcK' }).success).toBe(false);
    expect(ReciboAnexarSchema.safeParse({ fileName: ' ', conteudo: 'data:application/pdf;base64,JVBERi0xLjcK' }).success).toBe(false);
  });
});
