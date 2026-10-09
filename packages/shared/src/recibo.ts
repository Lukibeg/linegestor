/**
 * O recibo de entrega da movimentação (Patch 1.9, decisão 0042). O pedido (09/10): "na hora de
 * fazer uma movimentação para um cliente, quero também poder anexar um arquivo, que no caso seria o
 * recibo de entrega". As mesmas regras no servidor, na prévia e na tela (que avisa antes de subir):
 *
 *  - só a movimentação **para um cliente** (locação, comodato, venda) tem recibo — a devolução não;
 *  - **PDF ou foto** (JPG, PNG ou WEBP), conferido pelos primeiros bytes do arquivo, e não pelo
 *    nome nem pelo que o navegador disse;
 *  - até **10 MB** por arquivo e até **5 arquivos** por movimentação (o recibo de duas páginas
 *    fotografado são duas fotos). A foto do celular é reduzida no navegador antes de subir;
 *  - dá para anexar na hora de movimentar ou depois, quando o recibo assinado voltar;
 *  - fica no próprio banco (entra no backup), como os anexos dos projetos. Tirar um recibo só o
 *    esconde (nada se apaga de verdade), e fica na auditoria.
 */
import { z } from 'zod';

const MB = 1024 * 1024;

export const RECIBO = {
  /** por arquivo, depois de a foto ser reduzida */
  maxBytes: 10 * MB,
  /** arquivos ativos por movimentação */
  maxArquivos: 5,
  /** a foto é reduzida no navegador até este lado maior: o recibo continua legível e o banco agradece */
  ladoMaximoDaFoto: 2000,
} as const;

/** Os tipos aceitos, com o nome de gente. */
export const TIPOS_DO_RECIBO: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
};

/** Para o `accept` do campo de arquivo. */
export const ACEITA_RECIBO = Object.keys(TIPOS_DO_RECIBO).join(',');

/** Um arquivo do recibo. O conteúdo vem embutido ("data:<tipo>;base64,…"), como nos anexos dos projetos. */
export const ReciboAnexarSchema = z.object({
  fileName: z.string().trim().min(1, 'O arquivo precisa de um nome').max(200),
  conteudo: z
    .string()
    .min(1)
    .max(14_000_000, 'Arquivo muito grande (máximo 10 MB)')
    .regex(/^data:[-\w.+]+\/[-\w.+]+(;[-\w.=]+)*;base64,[A-Za-z0-9+/=]+$/, 'Não consegui ler esse arquivo'),
});
export type ReciboAnexar = z.infer<typeof ReciboAnexarSchema>;

/** O tipo de verdade do arquivo, pelos primeiros bytes: PDF, JPG, PNG ou WEBP; senão, vazio. */
export function tipoDoRecibo(b: Uint8Array): string | null {
  const texto = (de: number, ate: number) => String.fromCharCode(...b.subarray(de, ate));
  if (b.length >= 5 && texto(0, 5) === '%PDF-') return 'application/pdf';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'image/png';
  if (b.length >= 12 && texto(0, 4) === 'RIFF' && texto(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** O tipo pelo que o navegador disse, ou pela extensão (alguns computadores não dizem o do PDF). */
export function tipoDeclaradoDoRecibo(a: { nome: string; tipo: string }): string {
  if (a.tipo) return a.tipo.toLowerCase();
  if (/\.pdf$/i.test(a.nome)) return 'application/pdf';
  if (/\.jpe?g$/i.test(a.nome)) return 'image/jpeg';
  if (/\.png$/i.test(a.nome)) return 'image/png';
  if (/\.webp$/i.test(a.nome)) return 'image/webp';
  return '';
}

/** O que impede o arquivo de subir (vazio = pode). A tela confere antes; o servidor, de novo. */
export function problemaDoRecibo(a: { nome: string; tipo: string; bytes: number }): string | null {
  if (!TIPOS_DO_RECIBO[a.tipo]) return `"${a.nome}" não é PDF nem foto (JPG, PNG ou WEBP).`;
  if (a.bytes <= 0) return `"${a.nome}" está vazio.`;
  if (a.bytes > RECIBO.maxBytes) return `"${a.nome}" passa de 10 MB, o limite de cada arquivo do recibo.`;
  return null;
}

/** A movimentação aceita recibo? Só a que leva para um cliente — e até 5 arquivos. */
export function problemaParaAnexar(m: { toClientId: string | null }, jaTem: number): string | null {
  if (!m.toClientId) return 'O recibo de entrega vai na movimentação para um cliente (a devolução não tem).';
  if (jaTem >= RECIBO.maxArquivos) return `Esta movimentação já tem ${RECIBO.maxArquivos} arquivos de recibo. Tire um antes de anexar outro.`;
  return null;
}
