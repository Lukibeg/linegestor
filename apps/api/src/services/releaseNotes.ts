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
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { newId, releaseNoteImages, releaseNoteItems, releaseNoteReads, releaseNotes, users, type Db } from '@gestor/db';
import type { NovidadeGravar, NovidadeItem } from '@gestor/shared';
import { BadRequest, NotFound } from '../plugins/errors.js';

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
  const [itens, leituras, [total]] = await Promise.all([
    itensDe(db, ids),
    ids.length ? db.select({ noteId: releaseNoteReads.noteId, userId: releaseNoteReads.userId }).from(releaseNoteReads).where(inArray(releaseNoteReads.noteId, ids)) : [],
    db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.active, true)),
  ]);
  return notas.map((n) => {
    const minhas = leituras.filter((l) => l.noteId === n.id);
    return {
      id: n.id, version: n.version, title: n.title, summary: n.summary,
      publishedAt: n.publishedAt, createdAt: n.createdAt, updatedAt: n.updatedAt,
      lida: minhas.some((l) => l.userId === userId),
      leituras: minhas.length,
      /** quantas pessoas ativas existem hoje — o "4 de 6" da tela de acompanhamento */
      pessoas: Number(total?.n ?? 0),
      items: itens.filter((i) => i.noteId === n.id).map(shapeItem),
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
  const itens = await itensDe(db, [nota.id]);
  return { id: nota.id, version: nota.version, title: nota.title, summary: nota.summary, publishedAt: nota.publishedAt, items: itens.map(shapeItem) };
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

export async function create(db: Db, data: NovidadeGravar) {
  const [dup] = await db.select({ id: releaseNotes.id }).from(releaseNotes).where(eq(releaseNotes.version, data.version));
  if (dup) throw new BadRequest(`Já existe uma nota com a versão "${data.version}"`);
  const id = newId();
  return db.transaction(async (tx) => {
    await tx.insert(releaseNotes).values({ id, version: data.version, title: data.title, summary: data.summary ?? null });
    await gravarItens(tx as Db, id, data.items ?? []);
    const [row] = await tx.select().from(releaseNotes).where(eq(releaseNotes.id, id));
    return row!;
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
    const [row] = await tx.select().from(releaseNotes).where(eq(releaseNotes.id, id));
    return { before, after: row! };
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

/**
 * Importação de uma nota escrita em arquivo (é assim que a nota de cada rodada chega já pronta
 * na publicação). Se a versão já existir, não faz nada — o `publicar.sh` pode rodar quantas vezes quiser.
 */
export async function importar(db: Db, data: NovidadeGravar, opts: { publicar?: boolean } = {}) {
  const [existe] = await db.select({ id: releaseNotes.id }).from(releaseNotes).where(eq(releaseNotes.version, data.version));
  if (existe) return { criada: false, id: existe.id, version: data.version };
  const row = await create(db, data);
  if (opts.publicar !== false) await publish(db, row.id, true);
  return { criada: true, id: row.id, version: data.version };
}
