/**
 * Novidades (notas de versão): o "o que mudou" que aparece para a equipe depois de cada publicação.
 *
 * Regras que vivem aqui:
 *  - a nota só existe para a equipe quando é **publicada** (`publishedAt`); antes disso é rascunho
 *  - **só a mais recente aparece no login**, e só enquanto a pessoa não marcar "Li e entendi".
 *    Quem entra pela primeira vez não leva as notas antigas na cara: as anteriores ficam na página.
 *  - fechar sem marcar não conta: volta no próximo login
 *  - cada item é um cartão (rótulo, título, texto e um print opcional), na ordem escolhida
 *  - a imagem mora no banco, como a logo do cliente e a foto do modelo
 *  - **o vídeo do patch** (1.9, decisão 0046): a nota com vídeo abre no login com ele, no lugar dos
 *    cartões (que continuam na página). O vídeo fica em disco (`PORTAL_DIR/novidades`), como os do
 *    portal; sobe sozinho, sem nota, e passa a ser dela ao salvar; trocar ou tirar só o tira da nota
 */
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { newId, releaseNoteImages, releaseNoteItems, releaseNoteReads, releaseNotes, releaseNoteVideos, users, type Db } from '@gestor/db';
import type { NovidadeGravar, NovidadeItem } from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';
import { pastaDoPortal } from './portal.js';
import { copiarVideoParaODisco, gravarVideoNoDisco } from './videoEmDisco.js';

/** Onde mora o vídeo do patch: no mesmo volume dos vídeos do portal (em produção, /portal/novidades). */
export const pastaDosVideosDasNovidades = () => join(pastaDoPortal(), 'novidades');

type LinhaVideo = typeof releaseNoteVideos.$inferSelect;

/** O vídeo como as telas veem. O endereço é relativo à API e muda quando o vídeo muda (o id é outro). */
function shapeVideo(v: LinhaVideo) {
  return { id: v.id, url: `release-notes/videos/${v.id}`, nome: v.fileName, tamanho: v.sizeBytes, tipo: v.mimeType };
}

/** O vídeo que vale de cada nota (no máximo um por nota). */
async function videosDe(db: Db, noteIds: string[]) {
  if (!noteIds.length) return new Map<string, LinhaVideo>();
  const rows = await db.select().from(releaseNoteVideos)
    .where(and(inArray(releaseNoteVideos.noteId, noteIds), isNull(releaseNoteVideos.deletedAt)));
  return new Map(rows.map((r) => [r.noteId!, r]));
}

/** Endereço do print, relativo à API. O `v` muda a cada troca, para não vir o antigo do cache. */
function imagemPath(itemId: string, updatedAt?: Date | null) {
  return updatedAt ? `release-notes/items/${itemId}/image?v=${updatedAt.getTime()}` : null;
}

type LinhaItem = { i: typeof releaseNoteItems.$inferSelect; imagemEm: Date | null };

function shapeItem(r: LinhaItem) {
  return { id: r.i.id, kind: r.i.kind, title: r.i.title, text: r.i.text, sortOrder: r.i.sortOrder, imageUrl: imagemPath(r.i.id, r.imagemEm) };
}

/** Os itens de várias notas de uma vez (para a lista não fazer uma consulta por nota). */
async function itensDe(db: Db, noteIds: string[]) {
  if (!noteIds.length) return [] as Array<LinhaItem & { noteId: string }>;
  const rows = await db
    .select({ i: releaseNoteItems, imagemEm: releaseNoteImages.updatedAt })
    .from(releaseNoteItems)
    .leftJoin(releaseNoteImages, eq(releaseNoteImages.itemId, releaseNoteItems.id))
    .where(inArray(releaseNoteItems.noteId, noteIds))
    .orderBy(asc(releaseNoteItems.sortOrder));
  return rows.map((r) => ({ ...r, noteId: r.i.noteId }));
}

/**
 * A lista de notas. Para a equipe, só as publicadas; para quem edita (`includeDrafts`),
 * os rascunhos também. Cada nota diz se ESTA pessoa já leu e quantas leram.
 */
export async function list(db: Db, userId: string, opts: { includeDrafts?: boolean } = {}) {
  const conds = [isNull(releaseNotes.deletedAt)];
  if (!opts.includeDrafts) conds.push(sql`${releaseNotes.publishedAt} is not null`);
  const notas = await db.select().from(releaseNotes).where(and(...conds))
    .orderBy(desc(sql`coalesce(${releaseNotes.publishedAt}, ${releaseNotes.createdAt})`));
  const ids = notas.map((n) => n.id);
  const [itens, leituras, [total], videos] = await Promise.all([
    itensDe(db, ids),
    ids.length ? db.select({ noteId: releaseNoteReads.noteId, userId: releaseNoteReads.userId }).from(releaseNoteReads).where(inArray(releaseNoteReads.noteId, ids)) : [],
    db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.active, true)),
    videosDe(db, ids),
  ]);
  return notas.map((n) => {
    const minhas = leituras.filter((l) => l.noteId === n.id);
    const video = videos.get(n.id);
    return {
      id: n.id, version: n.version, title: n.title, summary: n.summary,
      publishedAt: n.publishedAt, createdAt: n.createdAt, updatedAt: n.updatedAt,
      lida: minhas.some((l) => l.userId === userId),
      leituras: minhas.length,
      /** quantas pessoas ativas existem hoje — o "4 de 6" da tela de acompanhamento */
      pessoas: Number(total?.n ?? 0),
      items: itens.filter((i) => i.noteId === n.id).map(shapeItem),
      /** com vídeo, é ele que abre no login (os cartões ficam na página) */
      video: video ? shapeVideo(video) : null,
    };
  });
}

/**
 * A nota que deve abrir no login desta pessoa: **a mais recente publicada**, e só se ela
 * ainda não marcou "Li e entendi". Nota antiga nunca volta a abrir sozinha.
 */
export async function pending(db: Db, userId: string) {
  const [nota] = await db.select().from(releaseNotes)
    .where(and(isNull(releaseNotes.deletedAt), sql`${releaseNotes.publishedAt} is not null`))
    .orderBy(desc(releaseNotes.publishedAt)).limit(1);
  if (!nota) return null;
  const [leu] = await db.select({ id: releaseNoteReads.id }).from(releaseNoteReads)
    .where(and(eq(releaseNoteReads.noteId, nota.id), eq(releaseNoteReads.userId, userId))).limit(1);
  if (leu) return null;
  const [itens, videos] = await Promise.all([itensDe(db, [nota.id]), videosDe(db, [nota.id])]);
  const video = videos.get(nota.id);
  return {
    id: nota.id, version: nota.version, title: nota.title, summary: nota.summary, publishedAt: nota.publishedAt, items: itens.map(shapeItem),
    video: video ? shapeVideo(video) : null,
  };
}

/** Quantas notas publicadas esta pessoa ainda não leu (o número do sininho). */
export async function unreadCount(db: Db, userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(releaseNotes)
    .where(and(
      isNull(releaseNotes.deletedAt),
      sql`${releaseNotes.publishedAt} is not null`,
      sql`not exists (select 1 from ${releaseNoteReads} where ${releaseNoteReads.noteId} = ${releaseNotes.id} and ${releaseNoteReads.userId} = ${userId})`,
    ));
  return Number(r?.n ?? 0);
}

/** Marca a nota como lida por esta pessoa. Marcar de novo não duplica nem muda a data. */
export async function markRead(db: Db, noteId: string, userId: string) {
  const [nota] = await db.select().from(releaseNotes).where(and(eq(releaseNotes.id, noteId), isNull(releaseNotes.deletedAt)));
  if (!nota) throw new NotFound('Nota');
  if (!nota.publishedAt) throw new BadRequest('Esta nota ainda é um rascunho');
  await db.insert(releaseNoteReads).values({ id: newId(), noteId, userId }).onConflictDoNothing();
  return nota;
}

/** Quem já leu e quem ainda não (só pessoas ativas). É o "4 de 6" da Administração. */
export async function reads(db: Db, noteId: string) {
  const [nota] = await db.select().from(releaseNotes).where(eq(releaseNotes.id, noteId));
  if (!nota) throw new NotFound('Nota');
  const pessoas = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.active, true)).orderBy(asc(users.name));
  const lidas = await db.select({ userId: releaseNoteReads.userId, readAt: releaseNoteReads.readAt }).from(releaseNoteReads).where(eq(releaseNoteReads.noteId, noteId));
  return {
    version: nota.version, title: nota.title, publishedAt: nota.publishedAt,
    pessoas: pessoas.map((p) => ({ ...p, readAt: lidas.find((l) => l.userId === p.id)?.readAt ?? null })),
  };
}

// ---------- Edição ----------

/** Grava os itens da nota: o que veio com id é atualizado, o que não veio é apagado, o resto entra. */
async function gravarItens(tx: Db, noteId: string, itens: NovidadeItem[]) {
  const atuais = await tx.select({ id: releaseNoteItems.id }).from(releaseNoteItems).where(eq(releaseNoteItems.noteId, noteId));
  const mantidos = new Set(itens.map((i) => i.id).filter(Boolean) as string[]);
  const sobrando = atuais.filter((a) => !mantidos.has(a.id)).map((a) => a.id);
  if (sobrando.length) await tx.delete(releaseNoteItems).where(inArray(releaseNoteItems.id, sobrando));

  for (const [ordem, item] of itens.entries()) {
    const campos = { kind: item.kind, title: item.title, text: item.text ?? null, sortOrder: ordem };
    let itemId = item.id;
    if (itemId && atuais.some((a) => a.id === itemId)) await tx.update(releaseNoteItems).set(campos).where(eq(releaseNoteItems.id, itemId));
    else { itemId = newId(); await tx.insert(releaseNoteItems).values({ id: itemId, noteId, ...campos }); }

    // imagem: ausente = mantém · null = tira · texto = troca
    if (item.imagem === null) await tx.delete(releaseNoteImages).where(eq(releaseNoteImages.itemId, itemId));
    else if (typeof item.imagem === 'string') {
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(item.imagem);
      if (!m) throw new BadRequest('Imagem em formato inesperado');
      const [, mimeType, base64] = m as unknown as [string, string, string];
      const sizeBytes = Math.floor((base64.length * 3) / 4);
      if (sizeBytes > 2 * 1024 * 1024) throw new BadRequest('Imagem muito grande (máximo 2 MB)');
      const vals = { mimeType, dataBase64: base64, sizeBytes, updatedAt: new Date() };
      await tx.insert(releaseNoteImages).values({ itemId, ...vals }).onConflictDoUpdate({ target: releaseNoteImages.itemId, set: vals });
    }
  }
}

/** O que aconteceu com o vídeo ao salvar (vai para a auditoria). */
export type MudancaDoVideo = 'pos' | 'trocou' | 'tirou' | null;

/**
 * O vídeo da nota: ausente = mantém · null = tira · o id = o vídeo que acabou de subir. O que saía
 * da nota só ganha `deleted_at` (o arquivo fica no disco: nada se apaga de verdade).
 */
async function ligarVideo(tx: Db, noteId: string, videoId: string | null | undefined): Promise<MudancaDoVideo> {
  if (videoId === undefined) return null;
  const [atual] = await tx.select().from(releaseNoteVideos).where(and(eq(releaseNoteVideos.noteId, noteId), isNull(releaseNoteVideos.deletedAt)));
  if (videoId === null) {
    if (!atual) return null;
    await tx.update(releaseNoteVideos).set({ deletedAt: new Date() }).where(eq(releaseNoteVideos.id, atual.id));
    return 'tirou';
  }
  if (atual?.id === videoId) return null;
  const [novo] = await tx.select().from(releaseNoteVideos).where(and(eq(releaseNoteVideos.id, videoId), isNull(releaseNoteVideos.deletedAt)));
  // só o vídeo que subiu sem nota (ou já é desta); o de outra nota, não
  if (!novo || (novo.noteId && novo.noteId !== noteId)) throw new BadRequest('Este vídeo não está mais disponível. Suba o vídeo de novo.');
  if (atual) await tx.update(releaseNoteVideos).set({ deletedAt: new Date() }).where(eq(releaseNoteVideos.id, atual.id));
  await tx.update(releaseNoteVideos).set({ noteId }).where(eq(releaseNoteVideos.id, videoId));
  return atual ? 'trocou' : 'pos';
}

export async function create(db: Db, data: NovidadeGravar) {
  const [dup] = await db.select({ id: releaseNotes.id }).from(releaseNotes).where(eq(releaseNotes.version, data.version));
  if (dup) throw new BadRequest(`Já existe uma nota com a versão "${data.version}"`);
  const id = newId();
  return db.transaction(async (tx) => {
    await tx.insert(releaseNotes).values({ id, version: data.version, title: data.title, summary: data.summary ?? null });
    await gravarItens(tx as Db, id, data.items ?? []);
    const mudancaDoVideo = await ligarVideo(tx as Db, id, data.videoId);
    const [row] = await tx.select().from(releaseNotes).where(eq(releaseNotes.id, id));
    return { ...row!, mudancaDoVideo };
  });
}

export async function update(db: Db, id: string, data: Partial<NovidadeGravar>) {
  const [before] = await db.select().from(releaseNotes).where(and(eq(releaseNotes.id, id), isNull(releaseNotes.deletedAt)));
  if (!before) throw new NotFound('Nota');
  if (data.version && data.version !== before.version) {
    const [dup] = await db.select({ id: releaseNotes.id }).from(releaseNotes).where(eq(releaseNotes.version, data.version));
    if (dup) throw new BadRequest(`Já existe uma nota com a versão "${data.version}"`);
  }
  return db.transaction(async (tx) => {
    await tx.update(releaseNotes).set({
      version: data.version ?? before.version,
      title: data.title ?? before.title,
      summary: data.summary === undefined ? before.summary : data.summary,
      updatedAt: new Date(),
    }).where(eq(releaseNotes.id, id));
    if (data.items) await gravarItens(tx as Db, id, data.items);
    const video = await ligarVideo(tx as Db, id, data.videoId);
    const [row] = await tx.select().from(releaseNotes).where(eq(releaseNotes.id, id));
    return { before, after: row!, video };
  });
}

/**
 * Publica (ou volta para rascunho). Publicar é o que faz a nota aparecer no login de todo mundo —
 * por isso é um botão à parte, e não um efeito colateral de salvar.
 */
export async function publish(db: Db, id: string, publicar: boolean) {
  const [nota] = await db.select().from(releaseNotes).where(and(eq(releaseNotes.id, id), isNull(releaseNotes.deletedAt)));
  if (!nota) throw new NotFound('Nota');
  if (publicar) {
    const [n] = await db.select({ n: sql<number>`count(*)` }).from(releaseNoteItems).where(eq(releaseNoteItems.noteId, id));
    if (Number(n?.n ?? 0) === 0) throw new BadRequest('A nota não tem nenhum item para mostrar. Acrescente ao menos um antes de publicar.');
  }
  const [row] = await db.update(releaseNotes).set({ publishedAt: publicar ? nota.publishedAt ?? new Date() : null, updatedAt: new Date() }).where(eq(releaseNotes.id, id)).returning();
  return row!;
}

export async function softDelete(db: Db, id: string) {
  const [row] = await db.update(releaseNotes).set({ deletedAt: new Date() }).where(and(eq(releaseNotes.id, id), isNull(releaseNotes.deletedAt))).returning();
  if (!row) throw new NotFound('Nota');
  return row;
}
export async function restore(db: Db, id: string) {
  const [row] = await db.update(releaseNotes).set({ deletedAt: null }).where(eq(releaseNotes.id, id)).returning();
  if (!row) throw new NotFound('Nota');
  return row;
}

/** Lê o print para o servidor devolvê-lo como imagem. */
export async function readImage(db: Db, itemId: string) {
  const [row] = await db.select().from(releaseNoteImages).where(eq(releaseNoteImages.itemId, itemId));
  if (!row) throw new NotFound('Imagem');
  return { mimeType: row.mimeType, buffer: Buffer.from(row.dataBase64, 'base64'), updatedAt: row.updatedAt };
}

// ---------- O vídeo do patch ----------

/** Sobe o vídeo para o disco (sem carregar na memória). Nasce sem nota: passa a ser dela ao salvar. */
export async function guardarVideo(db: Db, nome: string, mime: string, corpo: Readable, truncado: () => boolean, quemId: string) {
  const v = await gravarVideoNoDisco(pastaDosVideosDasNovidades(), mime, corpo, truncado);
  const [row] = await db.insert(releaseNoteVideos).values({
    id: v.id, fileName: nome.slice(0, 200) || 'video', mimeType: mime, sizeBytes: v.size, diskName: v.diskName, uploadedById: quemId,
  }).returning();
  return shapeVideo(row!);
}

/**
 * O vídeo para mandar. O da nota publicada, qualquer pessoa logada vê; o de rascunho, o que acabou
 * de subir e o que saiu da nota, só quem edita as novidades.
 */
export async function videoParaMandar(db: Db, id: string, podeEditar: boolean) {
  const [r] = await db.select({ v: releaseNoteVideos, publicada: releaseNotes.publishedAt, notaApagada: releaseNotes.deletedAt })
    .from(releaseNoteVideos).leftJoin(releaseNotes, eq(releaseNotes.id, releaseNoteVideos.noteId))
    .where(eq(releaseNoteVideos.id, id)).limit(1);
  if (!r) throw new NotFound('Vídeo');
  const aberto = !!r.publicada && !r.notaApagada && !r.v.deletedAt;
  if (!aberto && !podeEditar) throw new NotFound('Vídeo');
  return { caminho: join(pastaDosVideosDasNovidades(), r.v.diskName), mimeType: r.v.mimeType, fileName: r.v.fileName };
}

/** A nota como vem do arquivo: a mesma da tela, mais o vídeo que está ao lado dela (`video:` no cabeçalho). */
export type NotaDoArquivo = NovidadeGravar & { video?: { arquivo: string; nome: string; mime: string } };

/**
 * Importação de uma nota escrita em arquivo (é assim que a nota de cada rodada chega já pronta
 * na publicação). Se a versão já existir, não faz nada — o `publicar.sh` pode rodar quantas vezes quiser.
 * Com vídeo, ele é copiado para o disco antes: se o arquivo não abrir, a nota nem entra (e o erro avisa).
 */
export async function importar(db: Db, data: NotaDoArquivo, opts: { publicar?: boolean } = {}) {
  const [existe] = await db.select({ id: releaseNotes.id }).from(releaseNotes).where(eq(releaseNotes.version, data.version));
  if (existe) return { criada: false, id: existe.id, version: data.version, video: false };
  const { video, ...nota } = data;
  let videoId: string | undefined;
  if (video) {
    const v = await copiarVideoParaODisco(pastaDosVideosDasNovidades(), video.arquivo, video.mime);
    await db.insert(releaseNoteVideos).values({ id: v.id, fileName: video.nome, mimeType: video.mime, sizeBytes: v.size, diskName: v.diskName });
    videoId = v.id;
  }
  const row = await create(db, { ...nota, ...(videoId ? { videoId } : {}) });
  if (opts.publicar !== false) await publish(db, row.id, true);
  return { criada: true, id: row.id, version: data.version, video: !!videoId };
}
