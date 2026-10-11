/**
 * Manda um arquivo do portal: imagem e vídeo abrem na tela (o vídeo com "Range", para o player
 * pular para o meio sem baixar tudo); o resto baixa sempre como arquivo. Usado pela equipe e pelo
 * cliente — quem pode ver é conferido antes, no serviço. O vídeo do patch, nas Novidades (1.9),
 * usa o mesmo `mandarVideo`.
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
  return mandarVideo(req, reply, { caminho: a.caminho, mimeType: row.mimeType, fileName: row.fileName });
}

/**
 * O vídeo: do disco, com "Range" — o player pula para o meio sem baixar tudo, e o Safari (o do
 * iPhone, principalmente) só toca vídeo de quem responde assim.
 */
export async function mandarVideo(req: FastifyRequest, reply: FastifyReply, v: { caminho: string | null; mimeType: string; fileName: string }) {
  if (!v.caminho) throw new NotFound('Vídeo');
  let tamanho: number;
  try { tamanho = (await stat(v.caminho)).size; } catch { throw new NotFound('Vídeo'); }
  reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=3600')
    .header('Content-Type', v.mimeType).header('Accept-Ranges', 'bytes').header('Content-Disposition', contentDisposition('inline', v.fileName));
  const range = lerRange(req.headers.range, tamanho);
  if (range === 'invalido') return reply.code(416).header('Content-Range', `bytes */${tamanho}`).send();
  if (!range) return reply.header('Content-Length', tamanho).send(createReadStream(v.caminho));
  return reply.code(206)
    .header('Content-Range', `bytes ${range.inicio}-${range.fim}/${tamanho}`)
    .header('Content-Length', range.fim - range.inicio + 1)
    .send(createReadStream(v.caminho, { start: range.inicio, end: range.fim }));
}
