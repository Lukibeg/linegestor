/**
 * Manda um arquivo do portal: imagem e vídeo abrem na tela (o vídeo com "Range", para o player
 * pular para o meio sem baixar tudo); o resto baixa sempre como arquivo. Usado pela equipe e pelo
 * cliente — quem pode ver é conferido antes, no serviço.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { NotFound } from '../plugins/errors.js';
import type { ArquivoParaMandar } from '../services/portal.js';

/** O nome do arquivo no cabeçalho, sem quebrar com acento ou aspas. */
export function contentDisposition(tipo: 'inline' | 'attachment', fileName: string) {
  const simples = fileName.replace(/[^\w.\- ]/g, '_');
  return `${tipo}; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** "bytes=100-199" → { inicio: 100, fim: 199 }; pedido que não dá para atender → null. */
export function lerRange(cabecalho: string | undefined, tamanho: number): { inicio: number; fim: number } | null | 'invalido' {
  if (!cabecalho) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecalho.trim());
  if (!m || (!m[1] && !m[2])) return 'invalido';
  let inicio: number; let fim: number;
  if (!m[1]) { const ultimos = Number(m[2]); inicio = Math.max(0, tamanho - ultimos); fim = tamanho - 1; }
  else { inicio = Number(m[1]); fim = m[2] ? Math.min(Number(m[2]), tamanho - 1) : tamanho - 1; }
  if (inicio > fim || inicio >= tamanho) return 'invalido';
  return { inicio, fim };
}

export async function mandarArquivo(req: FastifyRequest, reply: FastifyReply, a: ArquivoParaMandar) {
  const { row } = a;
  reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=3600');
  if (row.kind === 'arquivo') {
    return reply.header('Content-Type', 'application/octet-stream').header('Content-Disposition', contentDisposition('attachment', row.fileName)).send(a.buffer);
  }
  if (row.kind === 'imagem') {
    return reply.header('Content-Type', row.mimeType).header('Content-Disposition', contentDisposition('inline', row.fileName)).send(a.buffer);
  }
  // o vídeo: do disco, com Range
  if (!a.caminho) throw new NotFound('Vídeo');
  let tamanho: number;
  try { tamanho = (await stat(a.caminho)).size; } catch { throw new NotFound('Vídeo'); }
  reply.header('Content-Type', row.mimeType).header('Accept-Ranges', 'bytes').header('Content-Disposition', contentDisposition('inline', row.fileName));
  const range = lerRange(req.headers.range, tamanho);
  if (range === 'invalido') return reply.code(416).header('Content-Range', `bytes */${tamanho}`).send();
  if (!range) return reply.header('Content-Length', tamanho).send(createReadStream(a.caminho));
  return reply.code(206)
    .header('Content-Range', `bytes ${range.inicio}-${range.fim}/${tamanho}`)
    .header('Content-Length', range.fim - range.inicio + 1)
    .send(createReadStream(a.caminho, { start: range.inicio, end: range.fim }));
}
