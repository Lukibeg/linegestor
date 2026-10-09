/**
 * Portal do cliente (Patch 1.8, decisão 0040): o autoatendimento.
 *
 * Regras que vivem aqui (as contas estão em `@gestor/shared/portal.ts`, as mesmas da prévia):
 *  - **quem entra**: a pessoa ativa, com senha, de um cliente que está na base (produto ativo, fora
 *    do arquivo e da lixeira). Conferido no login **e em todo pedido**: saiu da base, a sessão aberta
 *    cai na hora
 *  - **o suporte cria o login e a senha** (decisão 0045, Patch 1.9 — no 1.8 era a pessoa, por
 *    convite): o login é o e-mail ou um nome; a senha vai para o hash (a entrada) e para o cofre
 *    (`secrets`), para a equipe ver (fica na auditoria) e trocar quando a pessoa esquecer
 *  - **a equipe entra com o login do Gestor** (decisão 0044, Patch 1.9): o mesmo e-mail, a mesma
 *    senha e o código de 6 dígitos de quem usa; nada a criar. Vê todos os tutoriais publicados; a
 *    visita dela não conta; desativado no Gestor (ou com a senha trocada lá), a sessão cai
 *  - **o que cada cliente vê**: os tutoriais publicados "Geral" e os dos produtos (e módulos) que ele
 *    tem ativos; arquivo só de tutorial que ele pode ver
 *  - **os arquivos**: imagem e arquivo no banco (entram no backup diário); vídeo em disco
 *    (`PORTAL_DIR/videos`), pelo tamanho; imagem só raster (nunca SVG); arquivo baixa sempre
 *  - nada se apaga de verdade: o tutorial vai para a lixeira; o acesso é bloqueado, não apagado
 */
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import argon2 from 'argon2';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  clientLogos, clients, newId, portalArticles, portalFiles, portalSessions, portalUsers, productModules, products, secrets, settings,
  subscriptionModules, subscriptions, users, type Db,
} from '@gestor/db';
import {
  AJUSTES_PORTAL_PADRAO, arquivosDoTexto, buscarArtigos, caminhoDoTutorial, clienteNaBase, faltaParaPublicarTutorial,
  motivoForaDaBase, NOME_DA_EQUIPE_NO_PORTAL, PortalAjustesSchema, problemaDoArquivo, situacaoDoAcesso, textoPuro, tutorialValePara,
  type AcessoCorrigir, type AcessoCriar, type PortalAjustes, type TipoArquivoPortal, type TutorialGravar, type TutoriaisListarQuery,
} from '@gestor/shared';
import { BadRequest, Conflict, Forbidden, NotFound, Unauthorized } from '../plugins/errors.js';
import { CONFIG_DIR } from './integracoes.js';
import type { SecretsVault } from './secrets.js';

type Transacao = Parameters<Parameters<Db['transaction']>[0]>[0];
type LinhaTutorial = typeof portalArticles.$inferSelect;
type LinhaArquivo = typeof portalFiles.$inferSelect;
type LinhaAcesso = typeof portalUsers.$inferSelect;
export type Quem = { id: string; name: string; permissions: string[] };

/** Onde moram os vídeos (o resto fica no banco). Em produção, o volume `portal` em /portal. */
export const pastaDoPortal = () => process.env.PORTAL_DIR ?? join(CONFIG_DIR, 'portal');
const pastaDosVideos = () => join(pastaDoPortal(), 'videos');

/** O código da sessão: 32 bytes ao acaso (vai no cookie assinado). */
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
    /** tem o vídeo principal (1.9): a lista mostra o "vídeo" */
    temVideo: !!t.mainVideoId,
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

/** O vídeo principal, entre os arquivos do tutorial (ele é sempre deste tutorial). */
const videoPrincipalDe = (t: LinhaTutorial, arquivos: ReturnType<typeof descricaoDoArquivo>[]) => (t.mainVideoId ? arquivos.find((a) => a.id === t.mainVideoId) ?? null : null);

/** O tutorial inteiro, para a equipe (inclusive o rascunho). */
export async function lerTutorial(db: Db, numero: number) {
  const t = await tutorialOu404(db, numero);
  const [cat, arquivos, pessoas] = await Promise.all([nomesDoCatalogo(db), arquivosDoTutorial(db, t.id), nomesDePessoas(db, [t.authorId, t.updatedById])]);
  const descritos = arquivos.map((f) => descricaoDoArquivo(f, 'portal-admin'));
  return {
    ...cartao(t, cat), texto: t.body, situacao: t.status as 'rascunho' | 'publicado', versao: t.version, visualizacoes: t.views,
    autor: t.authorId ? pessoas.get(t.authorId) ?? null : null, atualizadoPor: t.updatedById ? pessoas.get(t.updatedById) ?? null : null,
    criadoEm: t.createdAt.toISOString(), publicadoEm: t.publishedAt?.toISOString() ?? null,
    arquivos: descritos, videoPrincipal: videoPrincipalDe(t, descritos),
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

/**
 * O vídeo principal (1.9): tem de ser um vídeo que subiu e ainda não é de outro tutorial. Passa a
 * ser deste (como os arquivos citados no texto) — é assim que o cliente consegue abrir.
 */
async function ligarVideoPrincipal(tx: Transacao, articleId: string, videoId: string | null) {
  if (!videoId) return null;
  const [v] = await tx.select({ id: portalFiles.id, kind: portalFiles.kind, articleId: portalFiles.articleId }).from(portalFiles)
    .where(and(eq(portalFiles.id, videoId), isNull(portalFiles.deletedAt))).limit(1);
  if (!v || v.kind !== 'video' || (v.articleId && v.articleId !== articleId)) throw new BadRequest('O vídeo principal não chegou ao servidor (ou é de outro tutorial). Suba o vídeo de novo.');
  if (!v.articleId) await tx.update(portalFiles).set({ articleId }).where(eq(portalFiles.id, v.id));
  return v.id;
}

const limpo = (t: string | null | undefined) => {
  const s = (t ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+|\s+$/g, '');
  return s || null;
};
const doFormulario = (d: TutorialGravar) => ({ title: d.titulo.trim(), summary: limpo(d.resumo), body: limpo(d.texto), featured: d.destaque });

export async function criarTutorial(db: Db, d: TutorialGravar, quem: Quem) {
  const campos = doFormulario(d);
  const video = d.videoPrincipalId ?? null;
  if (d.publicar) { const falta = faltaParaPublicarTutorial({ titulo: campos.title, texto: campos.body, resumo: campos.summary, videoPrincipal: video }); if (falta) throw new BadRequest(falta); }
  const { produtoId, moduloId } = await conferirProduto(db, d);
  return db.transaction(async (tx) => {
    const id = newId();
    const [t] = await tx.insert(portalArticles).values({
      id, ...campos, productId: produtoId, moduleId: moduloId, status: d.publicar ? 'publicado' : 'rascunho',
      publishedAt: d.publicar ? new Date() : null, authorId: quem.id, updatedById: quem.id,
    }).returning();
    await ligarArquivos(tx, id, campos.body);
    const mainVideoId = await ligarVideoPrincipal(tx, id, video);
    if (!mainVideoId) return t!;
    const [comVideo] = await tx.update(portalArticles).set({ mainVideoId }).where(eq(portalArticles.id, id)).returning();
    return comVideo!;
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
  // sem o campo (tela antiga), o vídeo principal fica como estava; nulo tira
  const video = d.videoPrincipalId === undefined ? atual.mainVideoId : d.videoPrincipalId;
  if (publicar) { const falta = faltaParaPublicarTutorial({ titulo: campos.title, texto: campos.body, resumo: campos.summary, videoPrincipal: video }); if (falta) throw new BadRequest(falta); }
  const { produtoId, moduloId } = await conferirProduto(db, d);
  return db.transaction(async (tx) => {
    await ligarArquivos(tx, atual.id, campos.body);
    const mainVideoId = await ligarVideoPrincipal(tx, atual.id, video);
    const [t] = await tx.update(portalArticles).set({
      ...campos, mainVideoId, productId: produtoId, moduleId: moduloId, status: publicar ? 'publicado' : 'rascunho',
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
// Os acessos: o suporte cria o login e a senha, o cliente usa (decisão 0045, Patch 1.9)
// ---------------------------------------------------------------------

function comoAcesso(u: LinhaAcesso, cliente: { nome: string; naBase: boolean; motivo: string | null } | undefined, pessoas: Map<string, string>) {
  return {
    id: u.id, nome: u.name, login: u.login, clienteId: u.clientId, cliente: cliente?.nome ?? '—',
    situacao: situacaoDoAcesso({ ativo: u.active, temSenha: !!u.passwordHash }, cliente?.naBase ?? false),
    motivo: cliente?.naBase ? null : cliente?.motivo ?? null,
    /** a senha está no cofre: a equipe pode ver (o olho). Não está: foi criada pela pessoa, no convite do 1.8 */
    senhaGuardada: !!u.passwordSecretId,
    ultimoAcesso: u.lastLoginAt?.toISOString() ?? null, acessos: u.loginCount,
    criadoPor: u.createdById ? pessoas.get(u.createdById) ?? null : null, criadoEm: u.createdAt.toISOString(),
  };
}

export async function listarAcessos(db: Db, f: { clienteId?: string; q?: string }) {
  let rows = await db.select().from(portalUsers).where(f.clienteId ? eq(portalUsers.clientId, f.clienteId) : undefined).orderBy(portalUsers.name);
  const [clientesInfo, pessoas] = await Promise.all([clientesNaBase(db, [...new Set(rows.map((r) => r.clientId))]), nomesDePessoas(db, rows.map((r) => r.createdById))]);
  const termo = (f.q ?? '').trim().toLowerCase();
  if (termo) rows = rows.filter((r) => `${r.name} ${r.login} ${clientesInfo.get(r.clientId)?.nome ?? ''}`.toLowerCase().includes(termo));
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

async function nomeDoCliente(db: Db, clientId: string) {
  const [c] = await db.select({ nome: clients.tradeName }).from(clients).where(eq(clients.id, clientId)).limit(1);
  return c?.nome ?? '—';
}

/** O login é único no portal inteiro (de qualquer cliente). */
async function loginLivre(db: Db, login: string, menosId?: string) {
  const [outro] = await db.select({ id: portalUsers.id, clientId: portalUsers.clientId }).from(portalUsers).where(eq(portalUsers.login, login)).limit(1);
  if (outro && outro.id !== menosId) throw new Conflict(`Este login já é de outra pessoa (${await nomeDoCliente(db, outro.clientId)}). Escolha outro.`);
}

const rotuloDaSenha = (nome: string, cliente: string) => `Senha do portal do cliente — ${nome} (${cliente})`;

/**
 * Grava a senha nos dois lugares: o hash (é com ele que a entrada confere) e a cópia cifrada no
 * cofre, para a equipe ver quando a pessoa esquecer. O convite antigo, se havia, deixa de valer.
 */
async function gravarSenha(db: Db, vault: SecretsVault, u: Pick<LinhaAcesso, 'id' | 'name' | 'clientId' | 'passwordSecretId'>, senha: string, quemId: string | null) {
  const passwordHash = await argon2.hash(senha, { type: argon2.argon2id });
  const passwordSecretId = await vault.save(db, { existingId: u.passwordSecretId, label: rotuloDaSenha(u.name, await nomeDoCliente(db, u.clientId)), plain: senha, userId: quemId });
  await db.update(portalUsers).set({ passwordHash, passwordSecretId, inviteTokenHash: null, inviteExpiresAt: null, updatedAt: new Date() }).where(eq(portalUsers.id, u.id));
}

/** Dá acesso a uma pessoa do cliente, com o login e a senha que o suporte escolheu. */
export async function criarAcesso(db: Db, vault: SecretsVault, clientId: string, d: AcessoCriar, quem: Quem) {
  const [c] = await db.select({ id: clients.id, nome: clients.tradeName, deletedAt: clients.deletedAt }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!c || c.deletedAt) throw new NotFound('Cliente');
  await loginLivre(db, d.login);
  const [u] = await db.insert(portalUsers).values({ id: newId(), clientId, name: d.nome.trim(), login: d.login, createdById: quem.id }).returning();
  await gravarSenha(db, vault, u!, d.senha, quem.id);
  return { acesso: u!, cliente: c.nome };
}

/** O suporte troca a senha (a pessoa esqueceu, ou o acesso do 1.8 ainda não tinha). As sessões abertas caem. */
export async function definirSenha(db: Db, vault: SecretsVault, id: string, senha: string, quem: Quem) {
  const u = await acessoOu404(db, id);
  if (!u.active) throw new BadRequest('O acesso está bloqueado. Desbloqueie antes de trocar a senha.');
  await gravarSenha(db, vault, u, senha, quem.id);
  await db.delete(portalSessions).where(eq(portalSessions.portalUserId, id));
  return { acesso: u, cliente: await nomeDoCliente(db, u.clientId) };
}

/** A senha guardada, para a equipe passar de novo à pessoa (quem pede é a rota, que registra na auditoria). */
export async function verSenha(db: Db, vault: SecretsVault, id: string) {
  const u = await acessoOu404(db, id);
  const cliente = await nomeDoCliente(db, u.clientId);
  if (!u.passwordSecretId) throw new BadRequest('Esta senha foi criada pela própria pessoa, pelo convite: ela não fica guardada. Troque a senha para passar uma nova.');
  const s = await vault.read(db, u.passwordSecretId);
  if (!s) throw new NotFound('Senha');
  return { acesso: u, cliente, senha: s.value };
}

/** Bloquear derruba a sessão aberta na hora; desbloquear devolve o acesso com a mesma senha. */
export async function bloquearAcesso(db: Db, id: string, bloquear: boolean) {
  const u = await acessoOu404(db, id);
  await db.update(portalUsers).set({ active: !bloquear, updatedAt: new Date() }).where(eq(portalUsers.id, id));
  if (bloquear) await db.delete(portalSessions).where(eq(portalSessions.portalUserId, id));
  return u;
}

/** Corrige o nome ou o login (a senha fica a mesma; o nome novo vai também para o rótulo do cofre). */
export async function atualizarAcesso(db: Db, id: string, d: AcessoCorrigir) {
  const u = await acessoOu404(db, id);
  await loginLivre(db, d.login, id);
  const [novo] = await db.update(portalUsers).set({ name: d.nome.trim(), login: d.login, updatedAt: new Date() }).where(eq(portalUsers.id, id)).returning();
  if (u.passwordSecretId && u.name !== novo!.name) {
    await db.update(secrets).set({ label: rotuloDaSenha(novo!.name, await nomeDoCliente(db, u.clientId)) }).where(eq(secrets.id, u.passwordSecretId));
  }
  return { antes: u, depois: novo! };
}

// ---------------------------------------------------------------------
// O lado do cliente: entrar, a sessão, o convite
// ---------------------------------------------------------------------

/**
 * Quem está no portal agora: a pessoa, o cliente e o que ele tem. Quando é alguém da equipe
 * (`equipe`, decisão 0044), o "cliente" é a Equipe Ingline e vale o catálogo inteiro: vê todos os
 * tutoriais publicados.
 */
export type SessaoPortal = {
  sid: string;
  equipe: boolean;
  /** o login: o da pessoa do cliente, ou o e-mail de quem é da equipe */
  usuario: { id: string; nome: string; login: string };
  cliente: { id: string; nome: string; temLogo: boolean };
  ativos: { produtos: string[]; modulos: string[] };
};
/** Por que a sessão não vale (para a tela dizer). */
export type MotivoSemSessao = 'bloqueado' | 'fora_da_base' | null;
/** De quem é a sessão: uma pessoa do cliente ou alguém da equipe (com o login do Gestor). */
export type DonoDaSessao = { portalUserId: string } | { staffUserId: string };

export const DIAS_DA_SESSAO = 30;

export async function criarSessao(db: Db, dono: DonoDaSessao, ip: string, userAgent: string | undefined) {
  const id = novoCodigo();
  const expiresAt = new Date(Date.now() + DIAS_DA_SESSAO * 86_400_000);
  const quem = 'portalUserId' in dono ? { portalUserId: dono.portalUserId } : { staffUserId: dono.staffUserId };
  await db.insert(portalSessions).values({ id, ...quem, expiresAt, ip, userAgent: userAgent?.slice(0, 300) ?? null });
  // as entradas da pessoa do cliente contam no acesso dela; as da equipe ficam na auditoria
  if ('portalUserId' in dono) {
    await db.update(portalUsers).set({ lastLoginAt: new Date(), loginCount: sql`${portalUsers.loginCount} + 1` }).where(eq(portalUsers.id, dono.portalUserId));
  }
  return id;
}

export async function destruirSessao(db: Db, sid: string) {
  await db.delete(portalSessions).where(eq(portalSessions.id, sid));
}

/** Derruba as sessões do portal de alguém da equipe (a senha mudou no Gestor, ou o usuário foi desativado). */
export async function derrubarSessoesDaEquipe(db: Db | Transacao, userId: string) {
  await db.delete(portalSessions).where(eq(portalSessions.staffUserId, userId));
}

/** O catálogo inteiro: a equipe vê os tutoriais de todos os produtos e módulos. */
async function catalogoInteiro(db: Db) {
  const [ps, ms] = await Promise.all([db.select({ id: products.id }).from(products), db.select({ id: productModules.id }).from(productModules)]);
  return { produtos: ps.map((p) => p.id), modulos: ms.map((m) => m.id) };
}

/**
 * Lê a sessão e confere, a cada pedido, que quem entrou ainda pode: a pessoa do cliente ativa e o
 * cliente na base; o usuário da equipe ativo no Gestor.
 */
export async function lerSessao(db: Db, sid: string): Promise<{ sessao: SessaoPortal | null; motivo: MotivoSemSessao }> {
  const [row] = await db.select({
    sid: portalSessions.id, expiresAt: portalSessions.expiresAt, daEquipe: portalSessions.staffUserId,
    uid: portalUsers.id, nome: portalUsers.name, login: portalUsers.login, ativo: portalUsers.active,
    cid: clients.id, cliente: clients.tradeName, arquivado: clients.archived, deletedAt: clients.deletedAt,
    eid: users.id, eNome: users.name, eEmail: users.email, eAtivo: users.active,
  }).from(portalSessions)
    .leftJoin(portalUsers, eq(portalUsers.id, portalSessions.portalUserId))
    .leftJoin(clients, eq(clients.id, portalUsers.clientId))
    .leftJoin(users, eq(users.id, portalSessions.staffUserId))
    .where(and(eq(portalSessions.id, sid), gt(portalSessions.expiresAt, new Date()))).limit(1);
  if (!row) return { sessao: null, motivo: null };

  let sessao: SessaoPortal;
  if (row.daEquipe) {
    if (!row.eid || !row.eAtivo) return { sessao: null, motivo: 'bloqueado' };
    sessao = {
      sid: row.sid, equipe: true, usuario: { id: row.eid, nome: row.eNome!, login: row.eEmail! },
      cliente: { id: '', nome: NOME_DA_EQUIPE_NO_PORTAL, temLogo: false }, ativos: await catalogoInteiro(db),
    };
  } else {
    if (!row.uid || !row.cid) return { sessao: null, motivo: null };
    if (!row.ativo) return { sessao: null, motivo: 'bloqueado' };
    const [ativos, [logo]] = await Promise.all([
      ativosDoCliente(db, row.cid),
      db.select({ id: clientLogos.clientId }).from(clientLogos).where(eq(clientLogos.clientId, row.cid)).limit(1),
    ]);
    if (!clienteNaBase({ arquivado: !!row.arquivado, naLixeira: !!row.deletedAt, produtosAtivos: ativos.produtos.length })) return { sessao: null, motivo: 'fora_da_base' };
    sessao = { sid: row.sid, equipe: false, usuario: { id: row.uid, nome: row.nome!, login: row.login! }, cliente: { id: row.cid, nome: row.cliente!, temLogo: !!logo }, ativos };
  }
  // a sessão "desliza": cada uso renova os 30 dias (no máximo uma vez por dia, para não escrever à toa)
  if (row.expiresAt.getTime() - Date.now() < (DIAS_DA_SESSAO - 1) * 86_400_000) {
    await db.update(portalSessions).set({ expiresAt: new Date(Date.now() + DIAS_DA_SESSAO * 86_400_000) }).where(eq(portalSessions.id, sid));
  }
  return { sessao, motivo: null };
}

const SEM_ACESSO = 'Seu acesso ao portal está suspenso. Fale com o suporte da Ingline.';

/** Quem a senha abriu: a pessoa do cliente, ou alguém da equipe (que talvez ainda deva o código de 6 dígitos). */
export type Entrada =
  | { tipo: 'cliente'; id: string }
  | { tipo: 'equipe'; id: string; nome: string; precisaCodigo: boolean };

/**
 * Entrar. Primeiro o acesso de cliente com este login; se não houver (ou a senha não for a dele), o
 * usuário da equipe com este e-mail — a mesma senha do Gestor (decisão 0044). A mesma mensagem para
 * login que não existe e senha errada (não revelar quem tem acesso); o usuário desativado no Gestor
 * também não entra aqui.
 */
export async function entrar(db: Db, login: string, senha: string): Promise<Entrada> {
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.login, login)).limit(1);
  if (u?.passwordHash && (await argon2.verify(u.passwordHash, senha))) {
    if (!u.active) throw new Forbidden(SEM_ACESSO);
    const info = (await clientesNaBase(db, [u.clientId])).get(u.clientId);
    if (!info?.naBase) throw new Forbidden(SEM_ACESSO);
    return { tipo: 'cliente', id: u.id };
  }
  const [e] = await db.select({ id: users.id, nome: users.name, hash: users.passwordHash, ativo: users.active, duasEtapas: users.totpEnabledAt })
    .from(users).where(eq(users.email, login)).limit(1);
  if (e?.ativo && (await argon2.verify(e.hash, senha))) return { tipo: 'equipe', id: e.id, nome: e.nome, precisaCodigo: !!e.duasEtapas };
  throw new Unauthorized('Login ou senha incorretos');
}

/**
 * A pessoa troca a própria senha (Minha conta). A cópia do cofre acompanha: a equipe continua vendo
 * a senha certa para ajudar quando ela esquecer (a tela avisa a pessoa disso). As outras sessões caem.
 */
export async function trocarSenha(db: Db, vault: SecretsVault, s: SessaoPortal, atual: string, nova: string) {
  // a senha de quem é da equipe é a do Gestor: troca lá, em Minha conta (e o portal acompanha)
  if (s.equipe) throw new BadRequest('Sua senha é a do Ingline Gestão: troque por lá, em Minha conta.');
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.id, s.usuario.id)).limit(1);
  if (!u?.passwordHash || !(await argon2.verify(u.passwordHash, atual))) throw new BadRequest('A senha atual não confere.');
  await gravarSenha(db, vault, u, nova, null);
  // as outras sessões caem; esta continua
  await db.delete(portalSessions).where(and(eq(portalSessions.portalUserId, u.id), sql`${portalSessions.id} <> ${s.sid}`));
  return u;
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

/** Um tutorial, se este cliente pode ver. Conta a visita (a da equipe não conta: o número é o dos clientes). */
export async function tutorialDoCliente(db: Db, s: SessaoPortal, numero: number) {
  const [t] = await db.select().from(portalArticles)
    .where(and(eq(portalArticles.number, numero), isNull(portalArticles.deletedAt), eq(portalArticles.status, 'publicado'))).limit(1);
  if (!t || !tutorialValePara({ produtoId: t.productId, moduloId: t.moduleId }, s.ativos)) throw new NotFound('Tutorial');
  if (!s.equipe) await db.update(portalArticles).set({ views: sql`${portalArticles.views} + 1` }).where(eq(portalArticles.id, t.id));
  const [cat, arquivos] = await Promise.all([nomesDoCatalogo(db), arquivosDoTutorial(db, t.id)]);
  const descritos = arquivos.map((f) => descricaoDoArquivo(f, 'portal'));
  return { ...cartao(t, cat), texto: t.body, publicadoEm: t.publishedAt?.toISOString() ?? null, arquivos: descritos, videoPrincipal: videoPrincipalDe(t, descritos) };
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
