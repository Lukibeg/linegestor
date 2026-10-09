/**
 * Base de conhecimento (Patch 1.8, decisão 0039): o que alguém descobriu resolvendo um chamado vira
 * um artigo (BC-12) que o próximo acha procurando — ou vê aparecer na ficha e no chamado.
 *
 * Regras que vivem aqui:
 *  - escreve quem tem `knowledge.write` (Operador, Técnico, Administrador); lê todo mundo
 *  - **rascunho** só aparece para quem escreveu e para quem cuida da base (`knowledge.manage`);
 *    **publicar** exige o "Como resolver"; publicado continua publicado (corrige-se editando)
 *  - **qualquer um que escreve melhora o artigo de qualquer um** (decisão do Luan): se outra pessoa
 *    salvou enquanto você editava, o servidor recusa e avisa, em vez de passar por cima
 *  - **toda mudança no texto vira uma versão**; voltar a uma versão antiga também é versão nova
 *  - as **ligações** apontam para o que existe (o servidor confere); o assunto guarda o nome da opção
 *  - **print** só pode ser imagem PNG, JPG, WEBP ou GIF (nunca SVG, que roda código); anexo da lista
 *    é qualquer arquivo até 10 MB, e baixa sempre como arquivo
 *  - **leitura obrigatória**: vale a leitura feita depois de o artigo ser marcado (marcar de novo
 *    pede a leitura de todos de novo). Quem cuida da base pede pelo botão do artigo ou já no
 *    formulário, junto com o publicar (`pedirLeitura`, pedido do Luan na prévia)
 *  - **comentários** (pedido do Luan na prévia): quem escreve comenta; fica registrado quem e
 *    quando; apagar é só o seu (ou quem cuida da base), e a auditoria guarda o texto apagado
 *  - nada se apaga de verdade: vai para a lixeira (quem escreveu, ou quem cuida da base)
 *  - para a IA (`baseIa.ts`) vão só os **publicados**: rascunho e lixeira nunca saem do servidor
 *
 * As contas (busca, texto simples, versões, o livrinho do chamado) estão em `@gestor/shared/base.ts`,
 * as mesmas da prévia clicável.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  carriers, clients, deviceModels, knowledgeArticles, knowledgeAttachments, knowledgeComments, knowledgeLinks, knowledgeReads, knowledgeVersions,
  linechatCards, linechatFields, newId, productModules, products, projects, users,
  type Db,
} from '@gestor/db';
import {
  artigosDoChamado, buscarArtigos, camposDosRelatorios, codigoDoArtigo, faltaParaPublicar, ligarClientes, montarIndiceParaChamados,
  nomeComparavel, printsDoTexto, textoDoCard, textoPuro, trocarMarcadores, type AnexoNovoArtigo, type ArtigoCurto, type ArtigoGravar,
  type ArtigoParaBusca, type BaseListarQuery, type LigacaoArtigo, type PedacoTrecho, type TipoLigacao,
} from '@gestor/shared';
import { BadRequest, Conflict, Forbidden, NotFound } from '../plugins/errors.js';
import { lerAjustesRelatorios } from './chamados.js';
import { lerAjustes as lerAjustesLineChat } from './linechat.js';
import { lerConteudo } from './projects.js';

type Transacao = Parameters<Parameters<Db['transaction']>[0]>[0];
type LinhaArtigo = typeof knowledgeArticles.$inferSelect;

/** Quem está pedindo (o `req.user` da rota). */
export type Quem = { id: string; name: string; permissions: string[] };
export const podeCuidar = (q: Quem) => q.permissions.includes('knowledge.manage');
export const podeEscrever = (q: Quem) => q.permissions.includes('knowledge.write');

/** Imagem que pode aparecer no meio do texto: as que o navegador desenha sem rodar nada. */
const IMAGENS_DO_TEXTO = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** "12" ou "BC-12" → 12. */
export function numeroDoParametro(p: string): number {
  const m = /^(?:bc-?)?(\d{1,7})$/i.exec(p.trim());
  if (!m) throw new NotFound('Artigo');
  return Number(m[1]);
}

/** O texto como fica guardado: quebras de linha do jeito Unix, sem espaço sobrando no fim; vazio = nada. */
function limpo(t: string | null | undefined): string | null {
  const s = (t ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+|\s+$/g, '');
  return s ? s : null;
}
const unicos = (xs: string[]) => [...new Map(xs.map((x) => x.trim()).filter(Boolean).map((x) => [x.toLowerCase(), x])).values()];

const visivel = (a: LinhaArtigo, q: Quem) => a.status === 'publicado' || a.authorId === q.id || podeCuidar(q);

async function artigoOu404(db: Db | Transacao, numero: number, quem: Quem) {
  const [a] = await db.select().from(knowledgeArticles).where(and(eq(knowledgeArticles.number, numero), isNull(knowledgeArticles.deletedAt))).limit(1);
  if (!a || !visivel(a, quem)) throw new NotFound('Artigo');
  return a;
}

async function ligacoesDe(db: Db | Transacao, ids: string[]): Promise<Map<string, LigacaoArtigo[]>> {
  const mapa = new Map<string, LigacaoArtigo[]>();
  if (!ids.length) return mapa;
  const rows = await db.select().from(knowledgeLinks).where(inArray(knowledgeLinks.articleId, ids)).orderBy(asc(knowledgeLinks.createdAt));
  for (const r of rows) {
    const l = mapa.get(r.articleId) ?? [];
    l.push({ tipo: r.kind as TipoLigacao, alvo: r.target });
    mapa.set(r.articleId, l);
  }
  return mapa;
}

// ---------------------------------------------------------------------
// Os nomes do que está ligado
// ---------------------------------------------------------------------

export type LigacaoMostrada = LigacaoArtigo & {
  nome: string;
  /** o título do chamado, o produto do módulo… */
  extra: string | null;
  /** endereço para abrir (o card no LineChat, a ficha no Gestor) */
  href: string | null;
  /** false = o que estava ligado foi para a lixeira (ou o card foi excluído no LineChat) */
  existe: boolean;
};

const chave = (l: LigacaoArtigo) => `${l.tipo}:${l.alvo}`;

/** Os nomes de tudo que está ligado, de uma vez (uma consulta por tipo, não por ligação). */
async function nomesDasLigacoes(db: Db | Transacao, ligacoes: LigacaoArtigo[]): Promise<Map<string, Omit<LigacaoMostrada, 'tipo' | 'alvo'>>> {
  const por = (t: TipoLigacao) => [...new Set(ligacoes.filter((l) => l.tipo === t).map((l) => l.alvo))];
  const [prods, mods, clis, mods2, ops, projs, cards, lc] = await Promise.all([
    por('produto').length ? db.select({ id: products.id, nome: products.name, del: products.deletedAt }).from(products).where(inArray(products.id, por('produto'))) : [],
    por('modulo').length ? db.select({ id: productModules.id, nome: productModules.name, produto: products.name, del: productModules.deletedAt }).from(productModules).innerJoin(products, eq(products.id, productModules.productId)).where(inArray(productModules.id, por('modulo'))) : [],
    por('cliente').length ? db.select({ id: clients.id, nome: clients.tradeName, del: clients.deletedAt }).from(clients).where(inArray(clients.id, por('cliente'))) : [],
    por('modelo').length ? db.select({ id: deviceModels.id, nome: deviceModels.name, del: deviceModels.deletedAt }).from(deviceModels).where(inArray(deviceModels.id, por('modelo'))) : [],
    por('operadora').length ? db.select({ id: carriers.id, nome: carriers.name }).from(carriers).where(inArray(carriers.id, por('operadora'))) : [],
    por('projeto').length ? db.select({ id: projects.id, nome: projects.name, del: projects.deletedAt }).from(projects).where(inArray(projects.id, por('projeto'))) : [],
    por('chamado').length ? db.select({ id: linechatCards.id, key: linechatCards.key, titulo: linechatCards.title, panelId: linechatCards.panelId, del: linechatCards.removedAt }).from(linechatCards).where(inArray(linechatCards.id, por('chamado'))) : [],
    por('chamado').length ? lerAjustesLineChat(db as Db) : null,
  ]);
  const appUrl = (lc?.valor.appUrl || 'https://inglinechat.com.br').replace(/\/+$/, '');
  const out = new Map<string, Omit<LigacaoMostrada, 'tipo' | 'alvo'>>();
  for (const p of prods) out.set(`produto:${p.id}`, { nome: p.nome, extra: null, href: null, existe: !p.del });
  for (const m of mods) out.set(`modulo:${m.id}`, { nome: m.nome, extra: m.produto, href: null, existe: !m.del });
  for (const c of clis) out.set(`cliente:${c.id}`, { nome: c.nome, extra: null, href: `/clientes/${c.id}`, existe: !c.del });
  for (const m of mods2) out.set(`modelo:${m.id}`, { nome: m.nome, extra: null, href: null, existe: !m.del });
  for (const o of ops) out.set(`operadora:${o.id}`, { nome: o.nome, extra: null, href: null, existe: true });
  for (const p of projs) out.set(`projeto:${p.id}`, { nome: p.nome, extra: null, href: `/projetos/${p.id}`, existe: !p.del });
  for (const c of cards) {
    out.set(`chamado:${c.id}`, {
      nome: c.key ?? 'Chamado', extra: c.titulo || null,
      href: c.key ? `${appUrl}/panels/${c.panelId}/card/${encodeURIComponent(c.key)}` : null, existe: !c.del,
    });
  }
  for (const l of ligacoes) if (l.tipo === 'assunto') out.set(chave(l), { nome: l.alvo, extra: null, href: null, existe: true });
  return out;
}

function mostrar(ligacoes: LigacaoArtigo[], nomes: Map<string, Omit<LigacaoMostrada, 'tipo' | 'alvo'>>): LigacaoMostrada[] {
  return ligacoes.map((l) => ({ ...l, ...(nomes.get(chave(l)) ?? { nome: '(não existe mais)', extra: null, href: null, existe: false }) }));
}

/**
 * Confere as ligações antes de gravar: cada uma precisa apontar para algo que existe. O chamado
 * pode vir pelo código (IS-3607): vira o id do card. Repetidas são juntadas.
 */
async function conferirLigacoes(db: Db, ligacoes: LigacaoArtigo[]): Promise<LigacaoArtigo[]> {
  const out = new Map<string, LigacaoArtigo>();
  const por = (t: TipoLigacao) => [...new Set(ligacoes.filter((l) => l.tipo === t).map((l) => l.alvo.trim()))];
  const existe = async (t: TipoLigacao, ids: string[], buscar: (ids: string[]) => Promise<Array<{ id: string }>>, nome: string) => {
    if (!ids.length) return;
    const achados = new Set((await buscar(ids)).map((r) => r.id));
    const falta = ids.filter((i) => !achados.has(i));
    if (falta.length) throw new BadRequest(`${nome} ligado ao artigo não existe (ou está na lixeira).`);
    for (const i of ids) out.set(`${t}:${i}`, { tipo: t, alvo: i });
  };
  await existe('produto', por('produto'), (ids) => db.select({ id: products.id }).from(products).where(and(inArray(products.id, ids), isNull(products.deletedAt))), 'Um produto');
  await existe('modulo', por('modulo'), (ids) => db.select({ id: productModules.id }).from(productModules).where(and(inArray(productModules.id, ids), isNull(productModules.deletedAt))), 'Um módulo');
  await existe('cliente', por('cliente'), (ids) => db.select({ id: clients.id }).from(clients).where(and(inArray(clients.id, ids), isNull(clients.deletedAt))), 'Um cliente');
  await existe('modelo', por('modelo'), (ids) => db.select({ id: deviceModels.id }).from(deviceModels).where(and(inArray(deviceModels.id, ids), isNull(deviceModels.deletedAt))), 'Um modelo');
  await existe('operadora', por('operadora'), (ids) => db.select({ id: carriers.id }).from(carriers).where(inArray(carriers.id, ids)), 'Uma operadora');
  await existe('projeto', por('projeto'), (ids) => db.select({ id: projects.id }).from(projects).where(and(inArray(projects.id, ids), isNull(projects.deletedAt))), 'Um projeto');
  // chamado: pelo id do card, ou pelo código que a equipe fala (IS-3607)
  for (const ref of por('chamado')) {
    const c = await acharCard(db, ref);
    if (!c) throw new BadRequest(`O chamado ${ref} não está na cópia do LineChat.`);
    out.set(`chamado:${c.id}`, { tipo: 'chamado', alvo: c.id });
  }
  for (const a of por('assunto')) out.set(`assunto:${a}`, { tipo: 'assunto', alvo: a });
  return [...out.values()];
}

/** Um card da cópia do LineChat, pelo id ou pelo código (IS-3607, sem ligar para maiúscula). */
export async function acharCard(db: Db, ref: string) {
  const r = ref.trim();
  const [porId] = await db.select().from(linechatCards).where(and(eq(linechatCards.id, r), isNull(linechatCards.removedAt))).limit(1);
  if (porId) return porId;
  const [porChave] = await db.select().from(linechatCards).where(and(sql`upper(${linechatCards.key}) = ${r.toUpperCase()}`, isNull(linechatCards.removedAt))).limit(1);
  return porChave ?? null;
}

// ---------------------------------------------------------------------
// Ler
// ---------------------------------------------------------------------

/** O que os filtros e o formulário precisam: produtos e módulos, assuntos, clientes, modelos, operadoras, projetos e autores. */
export async function opcoes(db: Db) {
  const [prods, mods, clis, mods2, ops, projs, campos, ajustes, autores] = await Promise.all([
    db.select({ id: products.id, nome: products.name, cor: products.color, ordem: products.sortOrder }).from(products).where(isNull(products.deletedAt)).orderBy(asc(products.sortOrder)),
    db.select({ id: productModules.id, nome: productModules.name, productId: productModules.productId, ordem: productModules.sortOrder }).from(productModules).where(isNull(productModules.deletedAt)).orderBy(asc(productModules.sortOrder)),
    db.select({ id: clients.id, nome: clients.tradeName }).from(clients).where(and(isNull(clients.deletedAt), eq(clients.isInternal, false))).orderBy(asc(clients.tradeName)),
    db.select({ id: deviceModels.id, nome: deviceModels.name }).from(deviceModels).where(isNull(deviceModels.deletedAt)).orderBy(asc(deviceModels.name)),
    db.select({ id: carriers.id, nome: carriers.name }).from(carriers).orderBy(asc(carriers.name)),
    db.select({ id: projects.id, nome: projects.name, situacao: projects.status }).from(projects).where(isNull(projects.deletedAt)).orderBy(desc(projects.updatedAt)),
    db.select().from(linechatFields),
    lerAjustesRelatorios(db),
    db.selectDistinct({ id: users.id, nome: users.name }).from(knowledgeArticles).innerJoin(users, eq(users.id, knowledgeArticles.authorId)).where(isNull(knowledgeArticles.deletedAt)),
  ]);
  // o Assunto é o mesmo campo que os Relatórios usam (escolhido em Ligar clientes › Campos)
  const assunto = camposDosRelatorios(campos.map((f) => ({ key: f.key, name: f.name, type: f.type, position: f.position, options: f.options ?? [], archived: f.archived })), ajustes.campos).assunto;
  return {
    produtos: prods.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor, modulos: mods.filter((m) => m.productId === p.id).map((m) => ({ id: m.id, nome: m.nome })) })),
    campoAssunto: assunto?.name ?? null,
    assuntos: [...(assunto?.options ?? [])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    clientes: clis,
    modelos: mods2,
    operadoras: ops,
    projetos: projs,
    autores: autores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}

type Carregado = { a: LinhaArtigo; ligacoes: LigacaoArtigo[] };

/** Os artigos que esta pessoa pode ver (fora da lixeira), cada um com as ligações. */
async function carregar(db: Db, quem: Quem): Promise<Carregado[]> {
  const rows = (await db.select().from(knowledgeArticles).where(isNull(knowledgeArticles.deletedAt))).filter((a) => visivel(a, quem));
  const ligs = await ligacoesDe(db, rows.map((a) => a.id));
  return rows.map((a) => ({ a, ligacoes: ligs.get(a.id) ?? [] }));
}

const paraBusca = (c: Carregado, nomes: Map<string, { nome: string; extra: string | null }>): ArtigoParaBusca & { c: Carregado } => ({
  c,
  numero: c.a.number, titulo: c.a.title, oQueAcontece: c.a.symptom, comoResolver: c.a.resolution, porQueAcontece: c.a.cause,
  palavrasDoCliente: c.a.customerTerms,
  nomesLigados: c.ligacoes.map((l) => { const n = nomes.get(chave(l)); return n ? [n.nome, n.extra].filter(Boolean).join(' ') : l.alvo; }),
});

/** As leituras desta pessoa nos artigos de leitura obrigatória (vale a feita depois da marcação). */
async function lidasPor(db: Db, userId: string, artigos: LinhaArtigo[]) {
  const obrig = artigos.filter((a) => a.mandatorySince);
  if (!obrig.length) return new Map<string, boolean>();
  const rows = await db.select().from(knowledgeReads).where(and(eq(knowledgeReads.userId, userId), inArray(knowledgeReads.articleId, obrig.map((a) => a.id))));
  return new Map(obrig.map((a) => [a.id, rows.some((r) => r.articleId === a.id && r.readAt >= a.mandatorySince!)]));
}

/** A lista da base: a busca, os filtros, a ordem e a página. */
export async function listar(db: Db, q: BaseListarQuery, quem: Quem) {
  const todos = await carregar(db, quem);
  const filtro = (tipo: TipoLigacao, alvo?: string) => (c: Carregado) => !alvo || c.ligacoes.some((l) => l.tipo === tipo && (tipo === 'assunto' ? nomeComparavel(l.alvo) === nomeComparavel(alvo) : l.alvo === alvo));
  let lista = todos
    .filter((c) => {
      if (q.situacao === 'publicados') return c.a.status === 'publicado';
      if (q.situacao === 'rascunhos') return c.a.status === 'rascunho';
      if (q.situacao === 'obrigatorios') return c.a.status === 'publicado' && !!c.a.mandatorySince;
      return true;
    })
    .filter(filtro('produto', q.produto)).filter(filtro('modulo', q.modulo)).filter(filtro('assunto', q.assunto)).filter(filtro('cliente', q.cliente))
    .filter(filtro('modelo', q.modelo)).filter(filtro('operadora', q.operadora)).filter(filtro('projeto', q.projeto)).filter(filtro('chamado', q.chamado))
    .filter((c) => !q.autor || c.a.authorId === q.autor);

  const nomes = await nomesDasLigacoes(db, lista.flatMap((c) => c.ligacoes));
  const achados = buscarArtigos(lista.map((c) => paraBusca(c, nomes)), q.q);
  const porData = (a: Carregado, b: Carregado) => b.a.updatedAt.getTime() - a.a.updatedAt.getTime();
  const ordenados = [...achados].sort((x, y) => {
    if (q.ordem === 'titulo') return x.artigo.titulo.localeCompare(y.artigo.titulo, 'pt-BR');
    if (q.ordem === 'numero') return y.artigo.numero - x.artigo.numero;
    if (q.ordem === 'relevancia' && q.q?.trim()) return y.pontos - x.pontos || porData(x.artigo.c, y.artigo.c);
    return porData(x.artigo.c, y.artigo.c);
  });
  lista = ordenados.map((x) => x.artigo.c);
  const trechos = new Map(ordenados.map((x) => [x.artigo.c.a.id, x.trecho]));

  const inicio = (q.page - 1) * q.pageSize;
  const pagina = lista.slice(inicio, inicio + q.pageSize);
  const [lidas, pessoas, comentarios] = await Promise.all([
    lidasPor(db, quem.id, pagina.map((c) => c.a)),
    nomesDePessoas(db, pagina.flatMap((c) => [c.a.authorId, c.a.updatedById])),
    quantosComentarios(db, pagina.map((c) => c.a.id)),
  ]);
  return {
    items: pagina.map((c) => itemDaLista(c, mostrar(c.ligacoes, nomes), trechos.get(c.a.id) ?? null, lidas.get(c.a.id) ?? null, pessoas, comentarios.get(c.a.id) ?? 0)),
    total: lista.length,
    page: q.page,
    pageSize: q.pageSize,
    podeEscrever: podeEscrever(quem),
    podeCuidar: podeCuidar(quem),
  };
}

async function nomesDePessoas(db: Db, ids: Array<string | null>) {
  const unicosIds = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicosIds.length) return new Map<string, string>();
  const rows = await db.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, unicosIds));
  return new Map(rows.map((r) => [r.id, r.nome]));
}

/** O começo do texto, para a lista mostrar quando não há busca. */
function resumo(a: LinhaArtigo): string | null {
  const t = textoPuro(a.symptom) || textoPuro(a.resolution);
  if (!t) return null;
  const linha = t.replace(/\s+/g, ' ').trim();
  return linha.length > 200 ? `${linha.slice(0, 200).replace(/\s+\S*$/, '')}…` : linha;
}

function itemDaLista(c: Carregado, ligacoes: LigacaoMostrada[], trecho: PedacoTrecho[] | null, lida: boolean | null, pessoas: Map<string, string>, comentarios: number) {
  const a = c.a;
  return {
    id: a.id, numero: a.number, codigo: codigoDoArtigo(a.number), titulo: a.title, situacao: a.status,
    obrigatoria: !!a.mandatorySince, lidaPorMim: a.mandatorySince ? lida === true : null,
    autor: a.authorId ? pessoas.get(a.authorId) ?? null : null,
    atualizadoPor: a.updatedById ? pessoas.get(a.updatedById) ?? null : null,
    atualizadoEm: a.updatedAt.toISOString(), publicadoEm: a.publishedAt?.toISOString() ?? null,
    ligacoes, trecho, resumo: resumo(a), comentarios,
  };
}

/** Um artigo inteiro, para a página dele. */
export async function ler(db: Db, numero: number, quem: Quem) {
  const a = await artigoOu404(db, numero, quem);
  const ligacoes = (await ligacoesDe(db, [a.id])).get(a.id) ?? [];
  const [nomes, anexos, pessoas, lidas, obrig, comentarios] = await Promise.all([
    nomesDasLigacoes(db, ligacoes),
    db.select({ id: knowledgeAttachments.id, fileName: knowledgeAttachments.fileName, mimeType: knowledgeAttachments.mimeType, sizeBytes: knowledgeAttachments.sizeBytes, inline: knowledgeAttachments.inline, createdAt: knowledgeAttachments.createdAt })
      .from(knowledgeAttachments).where(and(eq(knowledgeAttachments.articleId, a.id), isNull(knowledgeAttachments.deletedAt))).orderBy(asc(knowledgeAttachments.createdAt)),
    nomesDePessoas(db, [a.authorId, a.updatedById, a.mandatoryById]),
    lidasPor(db, quem.id, [a]),
    a.mandatorySince ? contagemDeLeituras(db, a) : null,
    comentariosDe(db, a.id, quem),
  ]);
  return {
    id: a.id, numero: a.number, codigo: codigoDoArtigo(a.number), titulo: a.title,
    oQueAcontece: a.symptom, comoResolver: a.resolution, porQueAcontece: a.cause, palavrasDoCliente: a.customerTerms,
    situacao: a.status, versao: a.version,
    autor: a.authorId ? { id: a.authorId, nome: pessoas.get(a.authorId) ?? '—' } : null,
    atualizadoPor: a.updatedById ? pessoas.get(a.updatedById) ?? null : null,
    criadoEm: a.createdAt.toISOString(), atualizadoEm: a.updatedAt.toISOString(), publicadoEm: a.publishedAt?.toISOString() ?? null,
    ligacoes: mostrar(ligacoes, nomes),
    // o print só aparece se o texto o cita; os outros anexos vão para a lista
    anexos: anexos.map((x) => ({ ...x, createdAt: x.createdAt.toISOString(), url: `base/anexos/${x.id}` })),
    obrigatoria: a.mandatorySince
      ? { desde: a.mandatorySince.toISOString(), por: a.mandatoryById ? pessoas.get(a.mandatoryById) ?? null : null, lidaPorMim: lidas.get(a.id) === true, lidos: obrig!.lidos, pessoas: obrig!.pessoas }
      : null,
    comentarios,
    podeEditar: podeEscrever(quem),
    podeApagar: podeEscrever(quem) && (a.authorId === quem.id || podeCuidar(quem)),
    podeCuidar: podeCuidar(quem),
    podeComentar: podeEscrever(quem),
  };
}

async function contagemDeLeituras(db: Db, a: LinhaArtigo) {
  const [pessoas] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.active, true));
  const [lidos] = await db.select({ n: sql<number>`count(*)::int` }).from(knowledgeReads)
    .innerJoin(users, eq(users.id, knowledgeReads.userId))
    .where(and(eq(knowledgeReads.articleId, a.id), eq(users.active, true), sql`${knowledgeReads.readAt} >= ${a.mandatorySince!.toISOString()}`));
  return { lidos: Number(lidos?.n ?? 0), pessoas: Number(pessoas?.n ?? 0) };
}

// ---------------------------------------------------------------------
// Gravar
// ---------------------------------------------------------------------

/** Grava os arquivos novos. Devolve o marcador provisório → o id de verdade. */
async function gravarAnexos(tx: Transacao, articleId: string, novos: AnexoNovoArtigo[], userId: string) {
  const ids: Record<string, string> = {};
  for (const n of novos) {
    const { mimeType, dataBase64, sizeBytes } = lerConteudo(n.conteudo);
    if (n.inline && !IMAGENS_DO_TEXTO.includes(mimeType)) throw new BadRequest('No meio do texto só entra imagem PNG, JPG, WEBP ou GIF. Mande outros arquivos como anexo.');
    const id = newId();
    await tx.insert(knowledgeAttachments).values({ id, articleId, fileName: n.fileName, mimeType, sizeBytes, dataBase64, inline: n.inline, uploadedById: userId });
    ids[n.ref] = id;
  }
  return ids;
}

async function gravarLigacoes(tx: Transacao, articleId: string, ligacoes: LigacaoArtigo[]) {
  await tx.delete(knowledgeLinks).where(eq(knowledgeLinks.articleId, articleId));
  if (ligacoes.length) await tx.insert(knowledgeLinks).values(ligacoes.map((l) => ({ id: newId(), articleId, kind: l.tipo, target: l.alvo })));
}

async function gravarVersao(tx: Transacao, a: LinhaArtigo, userId: string, note: string | null = null) {
  await tx.insert(knowledgeVersions).values({
    id: newId(), articleId: a.id, version: a.version, title: a.title, symptom: a.symptom, resolution: a.resolution, cause: a.cause,
    customerTerms: a.customerTerms, note, editedById: userId,
  });
}

const textoIgual = (a: LinhaArtigo, t: { title: string; symptom: string | null; resolution: string | null; cause: string | null; customerTerms: string[] }) =>
  a.title === t.title && a.symptom === t.symptom && a.resolution === t.resolution && a.cause === t.cause && JSON.stringify(a.customerTerms) === JSON.stringify(t.customerTerms);

const textoDoFormulario = (d: ArtigoGravar) => ({
  title: d.titulo.trim(), symptom: limpo(d.oQueAcontece), resolution: limpo(d.comoResolver), cause: limpo(d.porQueAcontece), customerTerms: unicos(d.palavrasDoCliente),
});

/** Os marcadores dos prints novos viram os ids de verdade, nas três partes do texto. */
const comIds = <T extends { symptom: string | null; resolution: string | null; cause: string | null }>(t: T, ids: Record<string, string>): T => ({
  ...t, symptom: trocarMarcadores(t.symptom, ids), resolution: trocarMarcadores(t.resolution, ids), cause: trocarMarcadores(t.cause, ids),
});

/** Print citado no texto precisa ser deste artigo (ou ter acabado de chegar junto). */
async function conferirPrints(tx: Transacao, articleId: string, t: { symptom: string | null; resolution: string | null; cause: string | null }) {
  const citados = [...new Set([t.symptom, t.resolution, t.cause].flatMap((x) => printsDoTexto(x)))];
  if (!citados.length) return;
  const rows = await tx.select({ id: knowledgeAttachments.id }).from(knowledgeAttachments)
    .where(and(eq(knowledgeAttachments.articleId, articleId), inArray(knowledgeAttachments.id, citados)));
  const existem = new Set(rows.map((r) => r.id));
  const faltam = citados.filter((c) => !existem.has(c));
  if (faltam.length) throw new BadRequest('O texto cita um print que não chegou. Cole a imagem de novo.');
}

/** O "pedir a leitura da equipe" do formulário: só quem cuida da base, e só junto com o publicar. */
function conferirPedidoDeLeitura(d: ArtigoGravar, publicado: boolean, quem: Quem) {
  if (!d.pedirLeitura) return;
  if (!podeCuidar(quem)) throw new Forbidden('Só quem cuida da base pode pedir a leitura obrigatória da equipe.');
  if (!publicado) throw new BadRequest('A leitura da equipe é pedida ao publicar: o rascunho só você vê.');
}

export async function criar(db: Db, d: ArtigoGravar, quem: Quem) {
  const texto = textoDoFormulario(d);
  if (d.publicar) { const falta = faltaParaPublicar({ titulo: texto.title, comoResolver: texto.resolution }); if (falta) throw new BadRequest(falta); }
  conferirPedidoDeLeitura(d, d.publicar, quem);
  const ligacoes = await conferirLigacoes(db, d.ligacoes);
  return db.transaction(async (tx) => {
    const id = newId();
    const agora = new Date();
    await tx.insert(knowledgeArticles).values({
      id, ...texto, status: d.publicar ? 'publicado' : 'rascunho', publishedAt: d.publicar ? agora : null,
      version: 1, authorId: quem.id, updatedById: quem.id,
      ...(d.pedirLeitura ? { mandatorySince: agora, mandatoryById: quem.id } : {}),
    });
    const ids = await gravarAnexos(tx, id, d.anexosNovos, quem.id);
    const final = comIds(texto, ids);
    await conferirPrints(tx, id, final);
    const [a] = await tx.update(knowledgeArticles).set(final).where(eq(knowledgeArticles.id, id)).returning();
    await gravarLigacoes(tx, id, ligacoes);
    await gravarVersao(tx, a!, quem.id);
    return a!;
  });
}

export async function atualizar(db: Db, numero: number, d: ArtigoGravar, quem: Quem) {
  const atual = await artigoOu404(db, numero, quem);
  if (d.versao != null && d.versao !== atual.version) {
    const [quemMexeu] = atual.updatedById ? await db.select({ nome: users.name }).from(users).where(eq(users.id, atual.updatedById)) : [];
    throw new Conflict(`${quemMexeu?.nome ?? 'Outra pessoa'} salvou este artigo enquanto você editava. Copie o que você escreveu, abra o artigo de novo e junte as duas mudanças.`);
  }
  // publicado continua publicado: corrige-se editando (para tirar da equipe, a lixeira)
  const publicar = d.publicar || atual.status === 'publicado';
  const texto = textoDoFormulario(d);
  if (publicar) { const falta = faltaParaPublicar({ titulo: texto.title, comoResolver: texto.resolution }); if (falta) throw new BadRequest(falta); }
  conferirPedidoDeLeitura(d, publicar, quem);
  const ligacoes = await conferirLigacoes(db, d.ligacoes);
  const ligacoesAntes = (await ligacoesDe(db, [atual.id])).get(atual.id) ?? [];
  return db.transaction(async (tx) => {
    const ids = await gravarAnexos(tx, atual.id, d.anexosNovos, quem.id);
    if (d.anexosRemovidos.length) {
      await tx.update(knowledgeAttachments).set({ deletedAt: new Date() })
        .where(and(eq(knowledgeAttachments.articleId, atual.id), inArray(knowledgeAttachments.id, d.anexosRemovidos), isNull(knowledgeAttachments.deletedAt)));
    }
    const final = comIds(texto, ids);
    await conferirPrints(tx, atual.id, final);
    const mudouTexto = !textoIgual(atual, final);
    const mudouLigacoes = JSON.stringify(ligacoesAntes.map(chave).sort()) !== JSON.stringify(ligacoes.map(chave).sort());
    const publicouAgora = publicar && atual.status !== 'publicado';
    const mudouAlgo = mudouTexto || mudouLigacoes || publicouAgora || Object.keys(ids).length > 0 || d.anexosRemovidos.length > 0;
    let a = atual;
    if (mudouAlgo) {
      [a] = (await tx.update(knowledgeArticles).set({
        ...final,
        status: publicar ? 'publicado' : 'rascunho',
        publishedAt: atual.publishedAt ?? (publicar ? new Date() : null),
        version: mudouTexto ? atual.version + 1 : atual.version,
        updatedById: quem.id, updatedAt: new Date(),
      }).where(eq(knowledgeArticles.id, atual.id)).returning()) as [LinhaArtigo];
      if (mudouTexto) await gravarVersao(tx, a, quem.id);
    }
    if (mudouLigacoes) await gravarLigacoes(tx, atual.id, ligacoes);
    // pedir (de novo) a leitura não é mudança no texto: não mexe na versão nem em "quem mexeu por último"
    if (d.pedirLeitura) {
      [a] = (await tx.update(knowledgeArticles).set({ mandatorySince: new Date(), mandatoryById: quem.id })
        .where(eq(knowledgeArticles.id, atual.id)).returning()) as [LinhaArtigo];
    }
    return { antes: atual, depois: a, mudouAlgo, mudouTexto, publicouAgora, pediuLeitura: d.pedirLeitura };
  });
}

/** Ligar (ou tirar) uma coisa só — o "Ligar um artigo" da ficha do projeto. Não muda o texto. */
export async function ligarUma(db: Db, numero: number, l: LigacaoArtigo, ligar: boolean, quem: Quem) {
  const a = await artigoOu404(db, numero, quem);
  if (ligar) {
    const [ok] = await conferirLigacoes(db, [l]);
    await db.insert(knowledgeLinks).values({ id: newId(), articleId: a.id, kind: ok!.tipo, target: ok!.alvo }).onConflictDoNothing();
  } else {
    await db.delete(knowledgeLinks).where(and(eq(knowledgeLinks.articleId, a.id), eq(knowledgeLinks.kind, l.tipo), eq(knowledgeLinks.target, l.alvo)));
  }
  await db.update(knowledgeArticles).set({ updatedAt: new Date(), updatedById: quem.id }).where(eq(knowledgeArticles.id, a.id));
  return a;
}

/** Lixeira: quem escreveu, ou quem cuida da base. */
export async function apagar(db: Db, numero: number, quem: Quem) {
  const a = await artigoOu404(db, numero, quem);
  if (a.authorId !== quem.id && !podeCuidar(quem)) throw new Forbidden('Só quem escreveu o artigo (ou quem cuida da base) pode mandá-lo para a lixeira.');
  await db.update(knowledgeArticles).set({ deletedAt: new Date() }).where(eq(knowledgeArticles.id, a.id));
  return a;
}

export async function restaurar(db: Db, id: string) {
  const [row] = await db.update(knowledgeArticles).set({ deletedAt: null, updatedAt: new Date() }).where(eq(knowledgeArticles.id, id)).returning();
  if (!row) throw new NotFound('Artigo');
  return row;
}

// ---------------------------------------------------------------------
// Versões
// ---------------------------------------------------------------------

export async function versoes(db: Db, numero: number, quem: Quem) {
  const a = await artigoOu404(db, numero, quem);
  const rows = await db.select({ v: knowledgeVersions, nome: users.name }).from(knowledgeVersions)
    .leftJoin(users, eq(users.id, knowledgeVersions.editedById))
    .where(eq(knowledgeVersions.articleId, a.id)).orderBy(desc(knowledgeVersions.version));
  return {
    atual: a.version,
    versoes: rows.map((r) => ({ versao: r.v.version, por: r.nome ?? null, em: r.v.editedAt.toISOString(), nota: r.v.note })),
  };
}

const textoDaVersao = (v: typeof knowledgeVersions.$inferSelect) => ({
  versao: v.version, titulo: v.title, oQueAcontece: v.symptom, comoResolver: v.resolution, porQueAcontece: v.cause, palavrasDoCliente: v.customerTerms,
});

/** Duas versões, inteiras (a tela mostra a diferença com a conta do `@gestor/shared`). */
export async function duasVersoes(db: Db, numero: number, de: number, para: number, quem: Quem) {
  const a = await artigoOu404(db, numero, quem);
  const rows = await db.select().from(knowledgeVersions).where(and(eq(knowledgeVersions.articleId, a.id), inArray(knowledgeVersions.version, [de, para])));
  const vDe = rows.find((r) => r.version === de);
  const vPara = rows.find((r) => r.version === para);
  if (!vDe || !vPara) throw new NotFound('Versão');
  return { de: textoDaVersao(vDe), para: textoDaVersao(vPara) };
}

/** Voltar a uma versão: grava uma versão nova com aquele texto (as do meio continuam guardadas). */
export async function voltarVersao(db: Db, numero: number, v: number, quem: Quem) {
  const a = await artigoOu404(db, numero, quem);
  const [antiga] = await db.select().from(knowledgeVersions).where(and(eq(knowledgeVersions.articleId, a.id), eq(knowledgeVersions.version, v))).limit(1);
  if (!antiga) throw new NotFound('Versão');
  if (v === a.version) throw new BadRequest('Esta já é a versão atual.');
  if (a.status === 'publicado') { const falta = faltaParaPublicar({ titulo: antiga.title, comoResolver: antiga.resolution }); if (falta) throw new BadRequest(`Não dá para voltar a essa versão com o artigo publicado: ${falta}`); }
  return db.transaction(async (tx) => {
    const [novo] = await tx.update(knowledgeArticles).set({
      title: antiga.title, symptom: antiga.symptom, resolution: antiga.resolution, cause: antiga.cause, customerTerms: antiga.customerTerms,
      version: a.version + 1, updatedById: quem.id, updatedAt: new Date(),
    }).where(eq(knowledgeArticles.id, a.id)).returning();
    await gravarVersao(tx, novo!, quem.id, `Voltou à versão ${v}`);
    return novo!;
  });
}

// ---------------------------------------------------------------------
// Leitura obrigatória
// ---------------------------------------------------------------------

/** Marcar (ou tirar) a leitura obrigatória. Marcar de novo pede a leitura de todos outra vez. */
export async function marcarObrigatoria(db: Db, numero: number, ligar: boolean, quem: Quem) {
  const a = await artigoOu404(db, numero, quem);
  if (ligar && a.status !== 'publicado') throw new BadRequest('Publique o artigo antes de pedir a leitura da equipe.');
  const [row] = await db.update(knowledgeArticles)
    .set(ligar ? { mandatorySince: new Date(), mandatoryById: quem.id } : { mandatorySince: null, mandatoryById: null })
    .where(eq(knowledgeArticles.id, a.id)).returning();
  return row!;
}

/** "Li e entendi". Ler de novo atualiza a data (vale para a marcação mais nova). */
export async function marcarLida(db: Db, numero: number, quem: Quem) {
  const a = await artigoOu404(db, numero, quem);
  await db.insert(knowledgeReads).values({ id: newId(), articleId: a.id, userId: quem.id, readAt: new Date() })
    .onConflictDoUpdate({ target: [knowledgeReads.articleId, knowledgeReads.userId], set: { readAt: new Date() } });
  return a;
}

/** Quem leu e quem falta (só as pessoas ativas). */
export async function leituras(db: Db, numero: number, quem: Quem) {
  const a = await artigoOu404(db, numero, quem);
  if (!a.mandatorySince) return { desde: null, lidos: [], faltam: [] };
  const [pessoas, lidas] = await Promise.all([
    db.select({ id: users.id, nome: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name)),
    db.select().from(knowledgeReads).where(eq(knowledgeReads.articleId, a.id)),
  ]);
  const quando = new Map(lidas.filter((r) => r.readAt >= a.mandatorySince!).map((r) => [r.userId, r.readAt]));
  return {
    desde: a.mandatorySince.toISOString(),
    lidos: pessoas.filter((p) => quando.has(p.id)).map((p) => ({ nome: p.nome, em: quando.get(p.id)!.toISOString() })),
    faltam: pessoas.filter((p) => !quando.has(p.id)).map((p) => ({ nome: p.nome })),
  };
}

/** Os artigos de leitura obrigatória que esta pessoa ainda não leu (o número no menu). */
export async function pendentes(db: Db, quem: Quem) {
  const obrig = await db.select().from(knowledgeArticles)
    .where(and(isNull(knowledgeArticles.deletedAt), eq(knowledgeArticles.status, 'publicado'), sql`${knowledgeArticles.mandatorySince} is not null`))
    .orderBy(desc(knowledgeArticles.mandatorySince));
  const lidas = await lidasPor(db, quem.id, obrig);
  const faltam = obrig.filter((a) => !lidas.get(a.id));
  return { naoLidas: faltam.length, artigos: faltam.map((a) => ({ numero: a.number, codigo: codigoDoArtigo(a.number), titulo: a.title, desde: a.mandatorySince!.toISOString() })) };
}

// ---------------------------------------------------------------------
// Comentários (pedido do Luan na prévia do 1.8): o que a equipe viu depois, sem mexer no texto
// ---------------------------------------------------------------------

/** Os comentários de um artigo, do mais novo para o mais antigo (como os dos projetos). */
async function comentariosDe(db: Db, articleId: string, quem: Quem) {
  const rows = await db.select({ c: knowledgeComments, nome: users.name }).from(knowledgeComments)
    .leftJoin(users, eq(users.id, knowledgeComments.userId))
    .where(and(eq(knowledgeComments.articleId, articleId), isNull(knowledgeComments.deletedAt)))
    .orderBy(desc(knowledgeComments.createdAt));
  return rows.map(({ c, nome }) => ({
    id: c.id, texto: c.body, autor: nome ?? '—', em: c.createdAt.toISOString(),
    podeApagar: podeEscrever(quem) && (c.userId === quem.id || podeCuidar(quem)),
  }));
}

/** Quantos comentários cada artigo tem (a lista mostra o número). */
async function quantosComentarios(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db.select({ id: knowledgeComments.articleId, n: sql<number>`count(*)::int` }).from(knowledgeComments)
    .where(and(inArray(knowledgeComments.articleId, ids), isNull(knowledgeComments.deletedAt)))
    .groupBy(knowledgeComments.articleId);
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

export async function comentar(db: Db, numero: number, texto: string, quem: Quem) {
  const a = await artigoOu404(db, numero, quem);
  const body = limpo(texto);
  if (!body) throw new BadRequest('Escreva o comentário.');
  const [c] = await db.insert(knowledgeComments).values({ id: newId(), articleId: a.id, userId: quem.id, body }).returning();
  return { a, c: c! };
}

/** Apagar: o seu, ou qualquer um se você cuida da base. Só marca; a auditoria guarda o texto. */
export async function apagarComentario(db: Db, numero: number, id: string, quem: Quem) {
  const a = await artigoOu404(db, numero, quem);
  const [c] = await db.select().from(knowledgeComments)
    .where(and(eq(knowledgeComments.id, id), eq(knowledgeComments.articleId, a.id), isNull(knowledgeComments.deletedAt))).limit(1);
  if (!c) throw new NotFound('Comentário');
  if (c.userId !== quem.id && !podeCuidar(quem)) throw new Forbidden('Só quem escreveu o comentário (ou quem cuida da base) pode apagá-lo.');
  await db.update(knowledgeComments).set({ deletedAt: new Date() }).where(eq(knowledgeComments.id, c.id));
  const [autor] = c.userId ? await db.select({ nome: users.name }).from(users).where(eq(users.id, c.userId)) : [];
  return { a, c, autor: autor?.nome ?? null };
}

// ---------------------------------------------------------------------
// A base nas outras telas
// ---------------------------------------------------------------------

/** Os artigos publicados ligados a uma coisa (a ficha do cliente, o pop-up do modelo, o circuito, o projeto). */
export async function ligadosA(db: Db, tipo: TipoLigacao, alvo: string) {
  const rows = await db.select({ id: knowledgeArticles.id, numero: knowledgeArticles.number, titulo: knowledgeArticles.title, em: knowledgeArticles.updatedAt })
    .from(knowledgeLinks).innerJoin(knowledgeArticles, eq(knowledgeArticles.id, knowledgeLinks.articleId))
    .where(and(eq(knowledgeLinks.kind, tipo), eq(knowledgeLinks.target, alvo), isNull(knowledgeArticles.deletedAt), eq(knowledgeArticles.status, 'publicado')))
    .orderBy(desc(knowledgeArticles.updatedAt));
  return { total: rows.length, artigos: rows.slice(0, 30).map((r) => ({ id: r.id, numero: r.numero, codigo: codigoDoArtigo(r.numero), titulo: r.titulo })) };
}

/**
 * O livrinho da tabela de Chamados: para cada card pedido, os artigos que valem para ele (ligados
 * ao card, ao assunto ou ao cliente dele — a conta é `artigosDoChamado`, a mesma da prévia).
 */
export async function paraChamados(db: Db, ids: string[]): Promise<Record<string, ArtigoCurto[]>> {
  if (!ids.length) return {};
  const [cards, publicados, campos, ajustes, cadastro] = await Promise.all([
    db.select({ id: linechatCards.id, campos: linechatCards.customFields }).from(linechatCards).where(inArray(linechatCards.id, ids)),
    db.select({ id: knowledgeArticles.id, numero: knowledgeArticles.number, titulo: knowledgeArticles.title }).from(knowledgeArticles)
      .where(and(isNull(knowledgeArticles.deletedAt), eq(knowledgeArticles.status, 'publicado'))),
    db.select().from(linechatFields),
    lerAjustesRelatorios(db),
    db.select({ id: clients.id, tradeName: clients.tradeName, legalName: clients.legalName }).from(clients).where(and(isNull(clients.deletedAt), eq(clients.isInternal, false))),
  ]);
  if (!publicados.length) return {};
  const ligs = await ligacoesDe(db, publicados.map((a) => a.id));
  const indice = montarIndiceParaChamados(publicados.map((a) => ({ ...a, ligacoes: ligs.get(a.id) ?? [] })));
  const papeis = camposDosRelatorios(campos.map((f) => ({ key: f.key, name: f.name, type: f.type, position: f.position, options: f.options ?? [], archived: f.archived })), ajustes.campos);
  const chaveCliente = papeis.cliente?.key ?? null;
  const opcoesCliente = chaveCliente ? [...new Set(cards.flatMap((c) => { const v = (c.campos ?? {})[chaveCliente]; return Array.isArray(v) ? v.map(String) : v ? [String(v)] : []; }))] : [];
  const ligacaoClientes = ligarClientes(opcoesCliente, cadastro.map((r) => ({ id: r.id, nomes: [r.tradeName, r.legalName].filter(Boolean) })), ajustes.clientes);
  const out: Record<string, ArtigoCurto[]> = {};
  for (const c of cards) {
    const lista = artigosDoChamado({ id: c.id, campos: c.campos ?? {} }, indice, { assunto: papeis.assunto?.key ?? null, cliente: chaveCliente }, (op) => ligacaoClientes[op]?.clienteId ?? null);
    if (lista.length) out[c.id] = lista;
  }
  return out;
}

/**
 * "Registrar na base" a partir de um chamado: o que já dá para preencher. O Gestor só lê o card —
 * nada é escrito no LineChat.
 */
export async function doChamado(db: Db, ref: string) {
  const card = await acharCard(db, ref);
  if (!card) throw new NotFound('Chamado');
  const [campos, ajustes, cadastro, prods, lc] = await Promise.all([
    db.select().from(linechatFields),
    lerAjustesRelatorios(db),
    db.select({ id: clients.id, tradeName: clients.tradeName, legalName: clients.legalName }).from(clients).where(and(isNull(clients.deletedAt), eq(clients.isInternal, false))),
    db.select({ id: products.id, nome: products.name }).from(products).where(isNull(products.deletedAt)),
    lerAjustesLineChat(db),
  ]);
  const papeis = camposDosRelatorios(campos.map((f) => ({ key: f.key, name: f.name, type: f.type, position: f.position, options: f.options ?? [], archived: f.archived })), ajustes.campos);
  const valores = (k: string | null | undefined) => { if (!k) return [] as string[]; const v = (card.customFields ?? {})[k]; return (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []).filter(Boolean); };
  const ligacoes: LigacaoArtigo[] = [{ tipo: 'chamado', alvo: card.id }];
  for (const a of valores(papeis.assunto?.key)) ligacoes.push({ tipo: 'assunto', alvo: a });
  const opcoesCliente = valores(papeis.cliente?.key);
  const lig = ligarClientes(opcoesCliente, cadastro.map((r) => ({ id: r.id, nomes: [r.tradeName, r.legalName].filter(Boolean) })), ajustes.clientes);
  for (const op of opcoesCliente) { const id = lig[op]?.clienteId; if (id) ligacoes.push({ tipo: 'cliente', alvo: id }); }
  // o Produto do card (LinePBX, LineChat…) liga ao produto do Gestor com o mesmo nome
  for (const p of valores(papeis.produto?.key)) { const achado = prods.find((x) => nomeComparavel(x.nome) === nomeComparavel(p)); if (achado) ligacoes.push({ tipo: 'produto', alvo: achado.id }); }
  const unicasLig = [...new Map(ligacoes.map((l) => [chave(l), l])).values()];
  const nomes = await nomesDasLigacoes(db, unicasLig);
  const appUrl = (lc.valor.appUrl || 'https://inglinechat.com.br').replace(/\/+$/, '');
  return {
    chamado: { id: card.id, key: card.key, titulo: card.title, link: card.key ? `${appUrl}/panels/${card.panelId}/card/${encodeURIComponent(card.key)}` : null },
    titulo: card.title.trim(),
    oQueAcontece: textoDoCard(card.description) || null,
    ligacoes: mostrar(unicasLig, nomes),
  };
}

// ---------------------------------------------------------------------
// Anexos
// ---------------------------------------------------------------------

export async function lerAnexo(db: Db, id: string, quem: Quem) {
  const [row] = await db.select({ x: knowledgeAttachments, a: knowledgeArticles }).from(knowledgeAttachments)
    .innerJoin(knowledgeArticles, eq(knowledgeArticles.id, knowledgeAttachments.articleId))
    .where(eq(knowledgeAttachments.id, id)).limit(1);
  // o print de uma versão antiga continua abrindo (por isso não olhamos o deletedAt do anexo inline)
  if (!row || row.a.deletedAt || !visivel(row.a, quem) || (row.x.deletedAt && !row.x.inline)) throw new NotFound('Anexo');
  return { ...row.x, buffer: Buffer.from(row.x.dataBase64, 'base64'), imagem: row.x.inline && IMAGENS_DO_TEXTO.includes(row.x.mimeType) };
}

// ---------------------------------------------------------------------
// Para a IA: os artigos publicados, do jeito que a busca precisa
// ---------------------------------------------------------------------

/** Os publicados (nunca rascunho, nunca da lixeira), com os nomes do que está ligado: é só isso que vai para a IA. */
export async function publicadosParaBusca(db: Db) {
  const rows = await db.select().from(knowledgeArticles).where(and(isNull(knowledgeArticles.deletedAt), eq(knowledgeArticles.status, 'publicado')));
  const ligs = await ligacoesDe(db, rows.map((a) => a.id));
  const carregados = rows.map((a) => ({ a, ligacoes: ligs.get(a.id) ?? [] }));
  const nomes = await nomesDasLigacoes(db, carregados.flatMap((c) => c.ligacoes));
  return carregados.map((c) => ({ ...paraBusca(c, nomes), id: c.a.id }));
}

export { codigoDoArtigo };
