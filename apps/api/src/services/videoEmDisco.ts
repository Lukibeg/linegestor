/**
 * Vídeo em disco: o do portal do cliente (1.8) e o do patch, nas Novidades (1.9, decisão 0046).
 * Grande demais para o banco, fica numa pasta do volume `portal` (`PORTAL_DIR`) — fora do backup
 * diário do banco: guarde o original. Escreve em `<id>.<ext>.parte` e só renomeia no fim, para um
 * envio que caiu no meio nunca virar um vídeo pela metade.
 */
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { newId } from '@gestor/db';
import { problemaDoArquivo } from '@gestor/shared';
import { BadRequest } from '../plugins/errors.js';

/** MP4 toca em todo lugar; WebM e o .mov do iPhone também são aceitos. */
export const EXTENSAO_DO_VIDEO: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

export type VideoGravado = { id: string; diskName: string; size: number };

const recusar = (mime: string) => new BadRequest(problemaDoArquivo('video', mime, 1) ?? 'Vídeo em MP4 (o melhor), WebM ou MOV.');

/**
 * Grava o vídeo que veio no envio, sem carregar na memória. `truncado()` diz se passou do limite
 * no meio do caminho (o multipart corta o arquivo): aí nada fica guardado.
 */
export async function gravarVideoNoDisco(pasta: string, mime: string, corpo: Readable, truncado: () => boolean): Promise<VideoGravado> {
  const ext = EXTENSAO_DO_VIDEO[mime];
  if (!ext) { corpo.resume(); throw recusar(mime); }
  const id = newId();
  await mkdir(pasta, { recursive: true });
  const final = join(pasta, `${id}.${ext}`);
  const parcial = `${final}.parte`;
  try {
    await pipeline(corpo, createWriteStream(parcial, { mode: 0o600 }));
  } catch (e) {
    await rm(parcial, { force: true });
    throw e;
  }
  const { size } = await stat(parcial);
  const problema = truncado() ? problemaDoArquivo('video', mime, Number.MAX_SAFE_INTEGER) : problemaDoArquivo('video', mime, size);
  if (problema) { await rm(parcial, { force: true }); throw new BadRequest(problema); }
  await rename(parcial, final);
  return { id, diskName: `${id}.${ext}`, size };
}

/** Copia para a pasta um vídeo que já está no disco (o da nota que vem pronta em `docs/novidades/`). */
export async function copiarVideoParaODisco(pasta: string, origem: string, mime: string): Promise<VideoGravado> {
  const ext = EXTENSAO_DO_VIDEO[mime];
  if (!ext) throw recusar(mime);
  const { size } = await stat(origem);
  const problema = problemaDoArquivo('video', mime, size);
  if (problema) throw new BadRequest(problema);
  const id = newId();
  await mkdir(pasta, { recursive: true });
  const final = join(pasta, `${id}.${ext}`);
  const parcial = `${final}.parte`;
  try {
    await copyFile(origem, parcial);
  } catch (e) {
    await rm(parcial, { force: true });
    throw e;
  }
  await rename(parcial, final);
  return { id, diskName: `${id}.${ext}`, size };
}
