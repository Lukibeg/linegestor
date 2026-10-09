/**
 * Portal do cliente (Patch 1.8, decisão 0040): o autoatendimento.
 *
 * Regras que vivem aqui (as contas estão em `@gestor/shared/portal.ts`, as mesmas da prévia):
 *  - **quem entra**: a pessoa ativa, que já criou a senha pelo convite, de um cliente que está na
 *    base (produto ativo, fora do arquivo e da lixeira). Conferido no login **e em todo pedido**:
 *    saiu da base, a sessão aberta cai na hora
 *  - **a senha é da pessoa**: a equipe gera um convite (o código vale 7 dias e uma vez só; no banco
 *    só o hash dele) e a pessoa cria a senha. Ninguém da equipe digita senha de cliente
 *  - **o que cada cliente vê**: os tutoriais publicados "Geral" e os dos produtos (e módulos) que ele
 *    tem ativos; arquivo só de tutorial que ele pode ver
 *  - **os arquivos**: imagem e arquivo no banco (entram no backup diário); vídeo em disco
 *    (`PORTAL_DIR/videos`), pelo tamanho; imagem só raster (nunca SVG); arquivo baixa sempre
 *  - nada se apaga de verdade: o tutorial vai para a lixeira; o acesso é bloqueado, não apagado
 */
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import argon2 from 'argon2';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  clientLogos, clients, newId, portalArticles, portalFiles, portalSessions, portalUsers, productModules, products, settings,
  subscriptionModules, subscriptions, users, type Db,
} from '@gestor/db';
import {
  AJUSTES_PORTAL_PADRAO, arquivosDoTexto, buscarArtigos, caminhoDoTutorial, clienteNaBase, DIAS_DO_CONVITE, faltaParaPublicarTutorial,
  motivoForaDaBase, PortalAjustesSchema, problemaDoArquivo, situacaoDoAcesso, textoPuro, tutorialValePara,
  type AcessoCriar, type PortalAjustes, type TipoArquivoPortal, type TutorialGravar, type TutoriaisListarQuery,
} from '@gestor/shared';
import { BadRequest, Conflict, Forbidden, NotFound, Unauthorized } from '../plugins/errors.js';
import { CONFIG_DIR } from './integracoes.js';

type Transacao = Parameters<Parameters<Db['transaction']>[0]>[0];
type LinhaTutorial = typeof portalArticles.$inferSelect;
type LinhaArquivo = typeof portalFiles.$inferSelect;
type LinhaAcesso = typeof portalUsers.$inferSelect;
export type Quem = { id: string; name: string; permissions: string[] };

/** Onde moram os vídeos (o resto fica no banco). Em produção, o volume `portal` em /portal. */
export const pastaDoPortal = () => process.env.PORTAL_DIR ?? join(CONFIG_DIR, 'portal');
const pastaDosVideos = () => join(pastaDoPortal(), 'videos');

/** O código do convite vai no link; no banco, só o hash dele. */
const hashDoConvite = (codigo: string) => createHash('sha256').update(codigo).digest('hex');
const novoCodigo = () => randomBytes(32).toString('base64url');

// ---------------------------------------------------------------------
// O cliente: está na base? o que ele tem?
// ---------------------------------------------------------------------

const ativaAgora = (coluna: typeof subscriptions.deactivatedAt | typeof subscriptionModules.deactivatedAt) => or(isNull(coluna), gt(coluna, new Date()));

/** Os produtos e módulos que o cliente tem ativos hoje. */
export async function ativosDoCliente(db: Db | Transacao, clientId: string) {
  const subs = await db.select({ id: subscriptions.id, productId: subscriptions.productId }).from(subscriptions)
    .where(and(eq(subscriptions.clientId, clientId), ativaAgora(subscriptions.deactivatedAt)));
  const mods = subs.length
    ? await db.select({ moduleId: subscriptionModules.moduleId }).from(subscriptionModules)
      .where(and(inArray(subscriptionModules.subscriptionId, subs.map((s) => s.id)), ativaAgora(subscriptionModules.deactivatedAt)))
    : [];
  return { produtos: subs.map((s) => s.productId), modulos: mods.map((m) => m.moduleId) };
}

/** Situação de vários clientes de uma vez (a lista de acessos). */
async function clientesNaBase(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, { nome: string; naBase: boolean; motivo: string | null }>();
  const [rows, ativas] = await Promise.all([
    db.select({ id: clients.id, nome: clients.tradeName, arquivado: clients.archived, deletedAt: clients.deletedAt }).from(clients).where(inArray(clients.id, ids)),
    db.select({ clientId: subscriptions.clientId, n: sql<number>`count(*)::int` }).from(subscriptions)
      .where(and(inArray(subscriptions.clientId, ids), ativaAgora(subscriptions.deactivatedAt))).groupBy(subscriptions.clientId),
  ]);
  const quantas = new Map(ativas.map((a) => [a.clientId, Number(a.n)]));
  return new Map(rows.map((r) => {
    const c = { arquivado: r.arquivado, naLixeira: !!r.deletedAt, produtosAtivos: quantas.get(r.id) ?? 0 };
    return [r.id, { nome: r.nome, naBase: clienteNaBase(c), motivo: motivoForaDaBase(c) }];
  }));
}

// ---------------------------------------------------------------------
// Os ajustes (o nome do portal, as boas-vindas, o contato do suporte)
// ---------------------------------------------------------------------

export async function lerAjustes(db: Db): Promise<PortalAjustes> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 'portal')).limit(1);
  if (!row) return AJUSTES_PORTAL_PADRAO;
  try { return { ...AJUSTES_PORTAL_PADRAO, ...(JSON.parse(row.value) as Partial<PortalAjustes>) }; } catch { return AJUSTES_PORTAL_PADRAO; }
}

export async function gravarAjustes(db: Db, a: PortalAjustes, userId: string) {
  const valor = PortalAjustesSchema.parse(a);
  const linha = { id: 'portal', value: JSON.stringify({ ...valor, email: valor.email || null }), updatedAt: new Date(), updatedBy: userId };
  const [existe] = await db.select({ id: settings.id }).from(settings).where(eq(settings.id, 'portal')).limit(1);
  if (existe) await db.update(settings).set(linha).where(eq(settings.id, 'portal'));
  else await db.insert(settings).values(linha);
  return lerAjustes(db);
}

// ---------------------------------------------------------------------
// Os tutoriais (a equipe)
// ---------------------------------------------------------------------

/** Os produtos e módulos do catálogo (o formulário e os filtros). */
export async function opcoes(db: Db) {
  const [ps, ms] = await Promise.all([
    db.select({ id: products.id, nome: products.name, cor: products.color, ordem: products.sortOrder }).from(products).where(isNull(products.deletedAt)),
    db.select({ id: productModules.id, nome: productModules.name, productId: productModules.productId, ordem: productModules.sortOrder }).from(productModules).where(isNull(productModules.deletedAt)),
  ]);
  return {
    produtos: ps.sort((a, b) => a.ordem - b.ordem).map((p) => ({
      id: p.id, nome: p.nome, cor: p.cor,
      modulos: ms.filter((m) => m.productId === p.id).sort((a, b) => a.ordem - b.ordem).map((m) => ({ id: m.id, nome: m.nome })),
    })),
  };
}

async function nomesDoCatalogo(db: Db | Transacao) {
  const [ps, ms] = await Promise.all([
    db.select({ id: products.id, nome: products.name, cor: products.color }).from(products),
    db.select({ id: productModules.id, nome: productModules.name }).from(productModules),
  ]);
  return { produtos: new Map(ps.map((p) => [p.id, p])), modulos: new Map(ms.map((m) => [m.id, m.nome])) };
}

async function nomesDePessoas(db: Db, ids: Array<string | null>) {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map<string, string>();
  const rows = await db.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, unicos));
  return new Map(rows.map((r) => [r.id, r.nome]));
}

type Catalogo = Awaited<ReturnType<typeof nomesDoCatalogo>>;

/** O cartão do tutorial (a lista da equipe e a do cliente). */
function cartao(t: LinhaTutorial, cat: Catalogo) {
  const p = t.productId ? cat.produtos.get(t.productId) : null;
  return {
    id: t.id, numero: t.number, titulo: t.title, resumo: t.summary,
    produto: p ? { id: p.id, nome: p.nome, cor: p.cor } : null,
    modulo: t.moduleId ? { id: t.moduleId, nome: cat.modulos.get(t.moduleId) ?? '—' } : null,
    destaque: t.featured, atualizadoEm: t.updatedAt.toISOString(), caminho: caminhoDoTutorial(t.number, t.title),
  };
}

const paraBusca = (t: LinhaTutorial, cat: Catalogo) => ({
  t, numero: t.number, titulo: t.title, oQueAcontece: t.summary, comoResolver: textoPuro(t.body), porQueAcontece: null,
  palavrasDoCliente: [] as string[],
  nomesLigados: [t.productId ? cat.produtos.get(t.productId)?.nome ?? '' : 'Geral', t.moduleId ? cat.modulos.get(t.moduleId) ?? '' : ''].filter(Boolean),
});

export async function listarTutoriais(db: Db, q: TutoriaisListarQuery) {
  const cat = await nomesDoCatalogo(db);
  const rows = (await db.select().from(portalArticles).where(isNull(portalArticles.deletedAt)).orderBy(desc(portalArticles.updatedAt)))
    .filter((t) => q.situacao === 'publicados' ? t.status === 'publicado' : q.situacao === 'rascunhos' ? t.status === 'rascunho' : true)
    .filter((t) => !q.produto || (q.produto === 'geral' ? !t.productId : t.productId === q.produto));
  const achados = buscarArtigos(rows.map((t) => paraBusca(t, cat)), q.q);
  if (q.q?.trim()) achados.sort((a, b) => b.pontos - a.pontos);
  const inicio = (q.page - 1) * q.pageSize;
  const pagina = achados.slice(inicio, inicio + q.pageSize);
  const pessoas = await nomesDePessoas(db, pagina.flatMap(({ artigo: { t } }) => [t.authorId, t.updatedById]));
  return {
    // o trecho achado: onde a busca bateu (o mesmo jeito da base)
    items: pagina.map(({ artigo: { t }, trecho }) => ({
      ...cartao(t, cat), situacao: t.status as 'rascunho' | 'publicado', visualizacoes: t.views,
      autor: t.authorId ? pessoas.get(t.authorId) ?? null : null, atualizadoPor: t.updatedById ? pessoas.get(t.updatedById) ?? null : null,
      trecho,
    })),
    total: achados.length, page: q.page, pageSize: q.pageSize,
  };
}

async function tutorialOu404(db: Db | Transacao, numero: number) {
  const [t] = await db.select().from(portalArticles).where(and(eq(portalArticles.number, numero), isNull(portalArticles.deletedAt))).limit(1);
  if (!t) throw new NotFound('Tutorial');
  return t;
}

const descricaoDoArquivo = (f: Pick<LinhaArquivo, 'id' | 'kind' | 'fileName' | 'mimeType' | 'sizeBytes'>, base: 'portal-admin' | 'portal') => ({
  id: f.id, tipo: f.kind as TipoArquivoPortal, nome: f.fileName, mimeType: f.mimeType, tamanho: f.sizeBytes, url: `${base}/arquivos/${f.id}`,
});

async function arquivosDoTutorial(db: Db, articleId: string) {
  return db.select({ id: portalFiles.id, kind: portalFiles.kind, fileName: portalFiles.fileName, mimeType: portalFiles.mimeType, sizeBytes: portalFiles.sizeBytes })
    .from(portalFiles).where(and(eq(portalFiles.articleId, articleId), isNull(portalFiles.deletedAt)));
}

/** O tutorial inteiro, para a equipe (inclusive o rascunho). */
export async function lerTutorial(db: Db, numero: number) {
  const t = await tutorialOu404(db, numero);
  const [cat, arquivos, pessoas] = await Promise.all([nomesDoCatalogo(db), arquivosDoTutorial(db, t.id), nomesDePessoas(db, [t.authorId, t.updatedById])]);
  return {
    ...cartao(t, cat), texto: t.body, situacao: t.status as 'rascunho' | 'publicado', versao: t.version, visualizacoes: t.views,
    autor: t.authorId ? pessoas.get(t.authorId) ?? null : null, atualizadoPor: t.updatedById ? pessoas.get(t.updatedById) ?? null : null,
    criadoEm: t.createdAt.toISOString(), publicadoEm: t.publishedAt?.toISOString() ?? null,
    arquivos: arquivos.map((f) => descricaoDoArquivo(f, 'portal-admin')),
  };
}

/** Produto e módulo existem, e o módulo é do produto. */
async function conferirProduto(db: Db, d: TutorialGravar) {
  const produtoId = d.produtoId ?? null;
  const moduloId = d.moduloId ?? null;
  if (moduloId && !produtoId) throw new BadRequest('Escolha o produto do módulo.');
  if (produtoId) {
    const [p] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, produtoId), isNull(products.deletedAt))).limit(1);
    if (!p) throw new BadRequest('O produto escolhido não existe (ou está na lixeira).');
  }
  if (moduloId) {
    const [m] = await db.select({ productId: productModules.productId }).from(productModules).where(and(eq(productModules.id, moduloId), isNull(productModules.deletedAt))).limit(1);
    if (!m || m.productId !== produtoId) throw new BadRequest('O módulo escolhido não é deste produto.');
  }
  return { produtoId, moduloId };
}

/** Os arquivos citados no texto existem; os que ainda não são de ninguém passam a ser deste tutorial. */
async function ligarArquivos(tx: Transacao, articleId: string, texto: string | null) {
  const citados = arquivosDoTexto(texto);
  if (!citados.length) return;
  const rows = await tx.select({ id: portalFiles.id, articleId: portalFiles.articleId }).from(portalFiles)
    .where(and(inArray(portalFiles.id, citados), isNull(portalFiles.deletedAt)));
  if (rows.length < citados.length) throw new BadRequest('O texto cita um arquivo que não chegou ao servidor. Suba o arquivo de novo.');
  const soltos = rows.filter((r) => !r.articleId).map((r) => r.id);
  if (soltos.length) await tx.update(portalFiles).set({ articleId }).where(inArray(portalFiles.id, soltos));
}

const limpo = (t: string | null | undefined) => {
  const s = (t ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+|\s+$/g, '');
  return s || null;
};
const doFormulario = (d: TutorialGravar) => ({ title: d.titulo.trim(), summary: limpo(d.resumo), body: limpo(d.texto), featured: d.destaque });

export async function criarTutorial(db: Db, d: TutorialGravar, quem: Quem) {
  const campos = doFormulario(d);
  if (d.publicar) { const falta = faltaParaPublicarTutorial({ titulo: campos.title, texto: campos.body, resumo: campos.summary }); if (falta) throw new BadRequest(falta); }
  const { produtoId, moduloId } = await conferirProduto(db, d);
  return db.transaction(async (tx) => {
    const id = newId();
    const [t] = await tx.insert(portalArticles).values({
      id, ...campos, productId: produtoId, moduleId: moduloId, status: d.publicar ? 'publicado' : 'rascunho',
      publishedAt: d.publicar ? new Date() : null, authorId: quem.id, updatedById: quem.id,
    }).returning();
    await ligarArquivos(tx, id, campos.body);
    return t!;
  });
}

export async function atualizarTutorial(db: Db, numero: number, d: TutorialGravar, quem: Quem) {
  const atual = await tutorialOu404(db, numero);
  if (d.versao != null && d.versao !== atual.version) {
    const [quemMexeu] = atual.updatedById ? await db.select({ nome: users.name }).from(users).where(eq(users.id, atual.updatedById)) : [];
    throw new Conflict(`${quemMexeu?.nome ?? 'Outra pessoa'} salvou este tutorial enquanto você editava. Copie o que você escreveu, abra o tutorial de novo e junte as duas mudanças.`);
  }
  // publicado continua publicado (para tirar do portal: voltar para rascunho é pelo botão, ou a lixeira)
  const publicar = d.publicar;
  const campos = doFormulario(d);
  if (publicar) { const falta = faltaParaPublicarTutorial({ titulo: campos.title, texto: campos.body, resumo: campos.summary }); if (falta) throw new BadRequest(falta); }
  const { produtoId, moduloId } = await conferirProduto(db, d);
  return db.transaction(async (tx) => {
    await ligarArquivos(tx, atual.id, campos.body);
    const [t] = await tx.update(portalArticles).set({
      ...campos, productId: produtoId, moduleId: moduloId, status: publicar ? 'publicado' : 'rascunho',
      publishedAt: atual.publishedAt ?? (publicar ? new Date() : null),
      version: atual.version + 1, updatedById: quem.id, updatedAt: new Date(),
    }).where(eq(portalArticles.id, atual.id)).returning();
    return { antes: atual, depois: t! };
  });
}

export async function apagarTutorial(db: Db, numero: number) {
  const t = await tutorialOu404(db, numero);
  await db.update(portalArticles).set({ deletedAt: new Date() }).where(eq(portalArticles.id, t.id));
  return t;
}

export async function restaurarTutorial(db: Db, id: string) {
  const [row] = await db.update(portalArticles).set({ deletedAt: null, updatedAt: new Date() }).where(eq(portalArticles.id, id)).returning();
  if (!row) throw new NotFound('Tutorial');
  return row;
}

// ---------------------------------------------------------------------
// Os arquivos
// ---------------------------------------------------------------------

const EXTENSAO_DO_VIDEO: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

/** O tipo de verdade da imagem, pelos primeiros bytes (não pelo nome nem pelo que o navegador disse). */
export function tipoDaImagem(b: Buffer): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && (b.subarray(0, 6).toString('ascii') === 'GIF87a' || b.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'image/gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/** Guarda uma imagem ou um arquivo (no banco). */
export async function guardarNoBanco(db: Db, tipo: 'imagem' | 'arquivo', nome: string, mime: string, conteudo: Buffer, quem: Quem) {
  const mimeDeVerdade = tipo === 'imagem' ? tipoDaImagem(conteudo) : (mime || 'application/octet-stream');
  if (tipo === 'imagem' && !mimeDeVerdade) throw new BadRequest('No meio do texto só entra imagem PNG, JPG, WEBP ou GIF.');
  const problema = problemaDoArquivo(tipo, mimeDeVerdade!, conteudo.length);
  if (problema) throw new BadRequest(problema);
  const [f] = await db.insert(portalFiles).values({
    id: newId(), kind: tipo, fileName: nome.slice(0, 200) || (tipo === 'imagem' ? 'print' : 'arquivo'), mimeType: mimeDeVerdade!,
    sizeBytes: conteudo.length, dataBase64: conteudo.toString('base64'), uploadedById: quem.id,
  }).returning();
  return descricaoDoArquivo(f!, 'portal-admin');
}

/**
 * Guarda um vídeo em disco, sem carregar na memória. `truncado()` diz se passou do limite no meio
 * do caminho (o multipart corta o arquivo): aí nada fica guardado.
 */
export async function guardarVideo(db: Db, nome: string, mime: string, corpo: Readable, truncado: () => boolean, quem: Quem) {
  const ext = EXTENSAO_DO_VIDEO[mime];
  if (!ext) { corpo.resume(); throw new BadRequest(problemaDoArquivo('video', mime, 1) ?? 'Vídeo em MP4, WebM ou MOV.'); }
  const id = newId();
  const pasta = pastaDosVideos();
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
  const [f] = await db.insert(portalFiles).values({
    id, kind: 'video', fileName: nome.slice(0, 200) || 'video', mimeType: mime, sizeBytes: size, diskName: `${id}.${ext}`, uploadedById: quem.id,
  }).returning();
  return descricaoDoArquivo(f!, 'portal-admin');
}

/** Quanto o portal ocupa: os vídeos no disco do servidor (não entram no backup diário) e o resto no banco. */
export async function espaco(db: Db) {
  const rows = await db.select({ kind: portalFiles.kind, n: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${portalFiles.sizeBytes}), 0)::bigint` })
    .from(portalFiles).where(isNull(portalFiles.deletedAt)).groupBy(portalFiles.kind);
  const de = (k: string) => rows.find((r) => r.kind === k);
  return {
    videos: Number(de('video')?.n ?? 0), bytesVideos: Number(de('video')?.bytes ?? 0),
    arquivos: Number(de('imagem')?.n ?? 0) + Number(de('arquivo')?.n ?? 0), bytesArquivos: Number(de('imagem')?.bytes ?? 0) + Number(de('arquivo')?.bytes ?? 0),
  };
}

/** O arquivo para mandar: de onde ler (banco ou disco), o tipo e se baixa. */
export type ArquivoParaMandar = { row: LinhaArquivo; caminho: string | null; buffer: Buffer | null };
function paraMandar(row: LinhaArquivo): ArquivoParaMandar {
  if (row.kind === 'video') return { row, caminho: row.diskName ? join(pastaDosVideos(), row.diskName) : null, buffer: null };
  return { row, caminho: null, buffer: Buffer.from(row.dataBase64 ?? '', 'base64') };
}

/** A equipe vê qualquer arquivo (inclusive o de rascunho e o que ainda não está em tutorial). */
export async function arquivoParaEquipe(db: Db, id: string): Promise<ArquivoParaMandar> {
  const [row] = await db.select().from(portalFiles).where(and(eq(portalFiles.id, id), isNull(portalFiles.deletedAt))).limit(1);
  if (!row) throw new NotFound('Arquivo');
  return paraMandar(row);
}

// ---------------------------------------------------------------------
// Os acessos (a equipe dá, o cliente usa)
// ---------------------------------------------------------------------

function comoAcesso(u: LinhaAcesso, cliente: { nome: string; naBase: boolean; motivo: string | null } | undefined, pessoas: Map<string, string>) {
  return {
    id: u.id, nome: u.name, email: u.email, clienteId: u.clientId, cliente: cliente?.nome ?? '—',
    situacao: situacaoDoAcesso({ ativo: u.active, temSenha: !!u.passwordHash, conviteVenceEm: u.inviteExpiresAt }, cliente?.naBase ?? false),
    motivo: cliente?.naBase ? null : cliente?.motivo ?? null,
    conviteVenceEm: u.inviteTokenHash ? u.inviteExpiresAt?.toISOString() ?? null : null,
    ultimoAcesso: u.lastLoginAt?.toISOString() ?? null, acessos: u.loginCount,
    criadoPor: u.createdById ? pessoas.get(u.createdById) ?? null : null, criadoEm: u.createdAt.toISOString(),
  };
}

export async function listarAcessos(db: Db, f: { clienteId?: string; q?: string }) {
  let rows = await db.select().from(portalUsers).where(f.clienteId ? eq(portalUsers.clientId, f.clienteId) : undefined).orderBy(portalUsers.name);
  const [clientesInfo, pessoas] = await Promise.all([clientesNaBase(db, [...new Set(rows.map((r) => r.clientId))]), nomesDePessoas(db, rows.map((r) => r.createdById))]);
  const termo = (f.q ?? '').trim().toLowerCase();
  if (termo) rows = rows.filter((r) => `${r.name} ${r.email} ${clientesInfo.get(r.clientId)?.nome ?? ''}`.toLowerCase().includes(termo));
  return rows.map((u) => comoAcesso(u, clientesInfo.get(u.clientId), pessoas));
}

/** Os acessos de um cliente, e se ele está na base (a aba Portal da ficha). */
export async function acessosDoCliente(db: Db, clientId: string) {
  const info = (await clientesNaBase(db, [clientId])).get(clientId);
  if (!info) throw new NotFound('Cliente');
  return { naBase: info.naBase, motivo: info.motivo, acessos: await listarAcessos(db, { clienteId: clientId }) };
}

async function acessoOu404(db: Db, id: string) {
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.id, id)).limit(1);
  if (!u) throw new NotFound('Acesso');
  return u;
}

async function emailLivre(db: Db, email: string, menosId?: string) {
  const [outro] = await db.select({ id: portalUsers.id, clientId: portalUsers.clientId }).from(portalUsers).where(eq(portalUsers.email, email)).limit(1);
  if (outro && outro.id !== menosId) {
    const [c] = await db.select({ nome: clients.tradeName }).from(clients).where(eq(clients.id, outro.clientId));
    throw new Conflict(`Este e-mail já tem acesso ao portal${c ? ` (${c.nome})` : ''}.`);
  }
}

const conviteNovo = () => { const codigo = novoCodigo(); return { codigo, hash: hashDoConvite(codigo), vence: new Date(Date.now() + DIAS_DO_CONVITE * 86_400_000) }; };

/** Dá acesso a uma pessoa do cliente. Devolve o código do convite (só agora: no banco fica o hash). */
export async function criarAcesso(db: Db, clientId: string, d: AcessoCriar, quem: Quem) {
  const [c] = await db.select({ id: clients.id, nome: clients.tradeName, deletedAt: clients.deletedAt }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!c || c.deletedAt) throw new NotFound('Cliente');
  await emailLivre(db, d.email);
  const convite = conviteNovo();
  const [u] = await db.insert(portalUsers).values({
    id: newId(), clientId, name: d.nome.trim(), email: d.email, inviteTokenHash: convite.hash, inviteExpiresAt: convite.vence, createdById: quem.id,
  }).returning();
  return { acesso: u!, cliente: c.nome, codigo: convite.codigo };
}

/** Um convite novo: para quem não usou o primeiro a tempo, ou esqueceu a senha. A senha antiga vale até a nova ser criada. */
export async function novoConvite(db: Db, id: string) {
  const u = await acessoOu404(db, id);
  if (!u.active) throw new BadRequest('O acesso está bloqueado. Desbloqueie antes de mandar um convite.');
  const convite = conviteNovo();
  await db.update(portalUsers).set({ inviteTokenHash: convite.hash, inviteExpiresAt: convite.vence, updatedAt: new Date() }).where(eq(portalUsers.id, id));
  return { acesso: u, codigo: convite.codigo };
}

/** Bloquear derruba a sessão aberta na hora; desbloquear devolve o acesso com a mesma senha. */
export async function bloquearAcesso(db: Db, id: string, bloquear: boolean) {
  const u = await acessoOu404(db, id);
  await db.update(portalUsers).set({ active: !bloquear, updatedAt: new Date() }).where(eq(portalUsers.id, id));
  if (bloquear) await db.delete(portalSessions).where(eq(portalSessions.portalUserId, id));
  return u;
}

export async function atualizarAcesso(db: Db, id: string, d: AcessoCriar) {
  const u = await acessoOu404(db, id);
  await emailLivre(db, d.email, id);
  const [novo] = await db.update(portalUsers).set({ name: d.nome.trim(), email: d.email, updatedAt: new Date() }).where(eq(portalUsers.id, id)).returning();
  return { antes: u, depois: novo! };
}

// ---------------------------------------------------------------------
// O lado do cliente: entrar, a sessão, o convite
// ---------------------------------------------------------------------

/** Quem está no portal agora: a pessoa, o cliente e o que ele tem. */
export type SessaoPortal = { sid: string; usuario: { id: string; nome: string; email: string }; cliente: { id: string; nome: string; temLogo: boolean }; ativos: { produtos: string[]; modulos: string[] } };
/** Por que a sessão não vale (para a tela dizer). */
export type MotivoSemSessao = 'bloqueado' | 'fora_da_base' | null;

export const DIAS_DA_SESSAO = 30;

export async function criarSessao(db: Db, portalUserId: string, ip: string, userAgent: string | undefined) {
  const id = novoCodigo();
  await db.insert(portalSessions).values({ id, portalUserId, expiresAt: new Date(Date.now() + DIAS_DA_SESSAO * 86_400_000), ip, userAgent: userAgent?.slice(0, 300) ?? null });
  await db.update(portalUsers).set({ lastLoginAt: new Date(), loginCount: sql`${portalUsers.loginCount} + 1` }).where(eq(portalUsers.id, portalUserId));
  return id;
}

export async function destruirSessao(db: Db, sid: string) {
  await db.delete(portalSessions).where(eq(portalSessions.id, sid));
}

/** Lê a sessão e confere, a cada pedido, que a pessoa e o cliente ainda podem entrar. */
export async function lerSessao(db: Db, sid: string): Promise<{ sessao: SessaoPortal | null; motivo: MotivoSemSessao }> {
  const [row] = await db.select({
    sid: portalSessions.id, expiresAt: portalSessions.expiresAt,
    uid: portalUsers.id, nome: portalUsers.name, email: portalUsers.email, ativo: portalUsers.active,
    cid: clients.id, cliente: clients.tradeName, arquivado: clients.archived, deletedAt: clients.deletedAt,
  }).from(portalSessions)
    .innerJoin(portalUsers, eq(portalUsers.id, portalSessions.portalUserId))
    .innerJoin(clients, eq(clients.id, portalUsers.clientId))
    .where(and(eq(portalSessions.id, sid), gt(portalSessions.expiresAt, new Date()))).limit(1);
  if (!row) return { sessao: null, motivo: null };
  if (!row.ativo) return { sessao: null, motivo: 'bloqueado' };
  const [ativos, [logo]] = await Promise.all([
    ativosDoCliente(db, row.cid),
    db.select({ id: clientLogos.clientId }).from(clientLogos).where(eq(clientLogos.clientId, row.cid)).limit(1),
  ]);
  if (!clienteNaBase({ arquivado: row.arquivado, naLixeira: !!row.deletedAt, produtosAtivos: ativos.produtos.length })) return { sessao: null, motivo: 'fora_da_base' };
  // a sessão "desliza": cada uso renova os 30 dias (no máximo uma vez por dia, para não escrever à toa)
  if (row.expiresAt.getTime() - Date.now() < (DIAS_DA_SESSAO - 1) * 86_400_000) {
    await db.update(portalSessions).set({ expiresAt: new Date(Date.now() + DIAS_DA_SESSAO * 86_400_000) }).where(eq(portalSessions.id, sid));
  }
  return {
    sessao: { sid: row.sid, usuario: { id: row.uid, nome: row.nome, email: row.email }, cliente: { id: row.cid, nome: row.cliente, temLogo: !!logo }, ativos },
    motivo: null,
  };
}

const SEM_ACESSO = 'Seu acesso ao portal está suspenso. Fale com o suporte da Ingline.';

/** Entrar: a mesma mensagem para e-mail que não existe e senha errada (não revelar quem tem acesso). */
export async function entrar(db: Db, email: string, senha: string) {
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.email, email)).limit(1);
  if (!u || !u.passwordHash || !(await argon2.verify(u.passwordHash, senha))) throw new Unauthorized('E-mail ou senha incorretos');
  if (!u.active) throw new Forbidden(SEM_ACESSO);
  const info = (await clientesNaBase(db, [u.clientId])).get(u.clientId);
  if (!info?.naBase) throw new Forbidden(SEM_ACESSO);
  return u;
}

/** O convite ainda vale? (a tela de criar a senha) */
export async function lerConvite(db: Db, codigo: string) {
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.inviteTokenHash, hashDoConvite(codigo))).limit(1);
  if (!u || !u.inviteExpiresAt || u.inviteExpiresAt.getTime() < Date.now()) throw new NotFound('Convite');
  if (!u.active) throw new Forbidden(SEM_ACESSO);
  const info = (await clientesNaBase(db, [u.clientId])).get(u.clientId);
  if (!info?.naBase) throw new Forbidden(SEM_ACESSO);
  return { u, cliente: info.nome, trocando: !!u.passwordHash };
}

/** Cria (ou troca) a senha pelo convite. O convite morre aqui: vale uma vez só. */
export async function criarSenha(db: Db, codigo: string, senha: string) {
  const { u } = await lerConvite(db, codigo);
  const hash = await argon2.hash(senha, { type: argon2.argon2id });
  await db.update(portalUsers).set({ passwordHash: hash, inviteTokenHash: null, inviteExpiresAt: null, updatedAt: new Date() }).where(eq(portalUsers.id, u.id));
  // trocar a senha derruba as outras sessões (o celular perdido, quem sabia a antiga)
  await db.delete(portalSessions).where(eq(portalSessions.portalUserId, u.id));
  return u;
}

export async function trocarSenha(db: Db, s: SessaoPortal, atual: string, nova: string) {
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.id, s.usuario.id)).limit(1);
  if (!u?.passwordHash || !(await argon2.verify(u.passwordHash, atual))) throw new BadRequest('A senha atual não confere.');
  await db.update(portalUsers).set({ passwordHash: await argon2.hash(nova, { type: argon2.argon2id }), updatedAt: new Date() }).where(eq(portalUsers.id, u.id));
  // as outras sessões caem; esta continua
  await db.delete(portalSessions).where(and(eq(portalSessions.portalUserId, u.id), sql`${portalSessions.id} <> ${s.sid}`));
}

// ---------------------------------------------------------------------
// O lado do cliente: o que ele vê
// ---------------------------------------------------------------------

async function tutoriaisVisiveis(db: Db, s: SessaoPortal) {
  const rows = await db.select().from(portalArticles).where(and(isNull(portalArticles.deletedAt), eq(portalArticles.status, 'publicado')));
  return rows.filter((t) => tutorialValePara({ produtoId: t.productId, moduloId: t.moduleId }, s.ativos));
}

/** A página inicial: os produtos dele (com quantos tutoriais), os destaques, os novos e o suporte. */
export async function inicio(db: Db, s: SessaoPortal) {
  const [rows, cat, ajustes] = await Promise.all([tutoriaisVisiveis(db, s), nomesDoCatalogo(db), lerAjustes(db)]);
  const produtos = (await opcoes(db)).produtos.filter((p) => s.ativos.produtos.includes(p.id));
  const recentes = [...rows].sort((a, b) => (b.publishedAt ?? b.updatedAt).getTime() - (a.publishedAt ?? a.updatedAt).getTime()).slice(0, 6);
  return {
    portal: ajustes,
    produtos: produtos.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor, tutoriais: rows.filter((t) => t.productId === p.id).length })),
    geral: rows.filter((t) => !t.productId).length,
    destaques: rows.filter((t) => t.featured).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 6).map((t) => cartao(t, cat)),
    recentes: recentes.map((t) => cartao(t, cat)),
    total: rows.length,
  };
}

export async function tutoriaisDoCliente(db: Db, s: SessaoPortal, f: { q?: string; produto?: string }) {
  const [rows, cat] = await Promise.all([tutoriaisVisiveis(db, s), nomesDoCatalogo(db)]);
  const doProduto = rows.filter((t) => !f.produto || (f.produto === 'geral' ? !t.productId : t.productId === f.produto));
  const achados = buscarArtigos(doProduto.map((t) => paraBusca(t, cat)), f.q);
  if (f.q?.trim()) achados.sort((a, b) => b.pontos - a.pontos);
  else achados.sort((a, b) => Number(b.artigo.t.featured) - Number(a.artigo.t.featured) || a.artigo.t.title.localeCompare(b.artigo.t.title, 'pt-BR'));
  return { items: achados.map((x) => ({ ...cartao(x.artigo.t, cat), trecho: x.trecho })), total: achados.length };
}

/** Um tutorial, se este cliente pode ver. Conta a visita. */
export async function tutorialDoCliente(db: Db, s: SessaoPortal, numero: number) {
  const [t] = await db.select().from(portalArticles)
    .where(and(eq(portalArticles.number, numero), isNull(portalArticles.deletedAt), eq(portalArticles.status, 'publicado'))).limit(1);
  if (!t || !tutorialValePara({ produtoId: t.productId, moduloId: t.moduleId }, s.ativos)) throw new NotFound('Tutorial');
  await db.update(portalArticles).set({ views: sql`${portalArticles.views} + 1` }).where(eq(portalArticles.id, t.id));
  const [cat, arquivos] = await Promise.all([nomesDoCatalogo(db), arquivosDoTutorial(db, t.id)]);
  return { ...cartao(t, cat), texto: t.body, publicadoEm: t.publishedAt?.toISOString() ?? null, arquivos: arquivos.map((f) => descricaoDoArquivo(f, 'portal')) };
}

/** Um arquivo, se for de um tutorial que este cliente pode ver. */
export async function arquivoParaCliente(db: Db, s: SessaoPortal, id: string): Promise<ArquivoParaMandar> {
  const [row] = await db.select({ f: portalFiles, t: portalArticles }).from(portalFiles)
    .innerJoin(portalArticles, eq(portalArticles.id, portalFiles.articleId))
    .where(and(eq(portalFiles.id, id), isNull(portalFiles.deletedAt), isNull(portalArticles.deletedAt), eq(portalArticles.status, 'publicado'))).limit(1);
  if (!row || !tutorialValePara({ produtoId: row.t.productId, moduloId: row.t.moduleId }, s.ativos)) throw new NotFound('Arquivo');
  return paraMandar(row.f);
}

/** A logo do cliente (o topo do portal fica com a cara dele). */
export async function logoDoCliente(db: Db, clientId: string) {
  const [l] = await db.select().from(clientLogos).where(eq(clientLogos.clientId, clientId)).limit(1);
  if (!l) throw new NotFound('Logo');
  return { mimeType: l.mimeType, buffer: Buffer.from(l.dataBase64, 'base64') };
}
