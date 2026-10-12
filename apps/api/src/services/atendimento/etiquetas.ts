/**
 * As etiquetas com cor (1.10, o pedido do Luan na prévia: "na hora de criar as etiquetas, seria legal
 * poder escolher a cor também").
 *
 * O catálogo (`ticket_tags`) guarda o nome e a cor de cada etiqueta; o chamado guarda os nomes
 * (`tickets.tags`), sempre escritos como no catálogo — "cliente VIP" escrito de novo vira a "Cliente VIP"
 * que já existe. A etiqueta nova nasce com a cor escolhida na tela (no Abrir chamado e na ficha), ou
 * cinza quando ninguém escolheu (o robô, a IA, a resposta pronta). Quem cuida dos chamados cria, troca a
 * cor e tira a que nenhum chamado usa (Ajustes › Etiquetas).
 *
 * O que cada pessoa vê para sugerir: as etiquetas usadas nos painéis que ela vê e as que nenhum chamado
 * usa ainda — a etiqueta de um painel que ela não vê não aparece (como antes do catálogo).
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { newId, ticketTags, tickets, type Db } from '@gestor/db';
import {
  CORES_ETIQUETA, NOME_COR_ETIQUETA, chaveDaEtiqueta, etiquetasUnicas,
  type CorEtiqueta, type EtiquetaComCor, type EtiquetaDoCatalogo, type EtiquetaGravar,
} from '@gestor/shared';
import { AppError, Conflict } from '../../plugins/errors.js';
import type { Gravado } from './ajustes.js';

const corValida = (c: string): CorEtiqueta => ((CORES_ETIQUETA as readonly string[]).includes(c) ? (c as CorEtiqueta) : 'neutral');
const naoAchada = () => new AppError(404, 'Etiqueta não encontrada');
const ordemDoNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

/**
 * Os nomes como estão no catálogo, sem repetir; a que falta entra nele, com a cor escolhida na tela
 * (`cores`, pelo nome) ou cinza. Duas pessoas criando a mesma ao mesmo tempo: vale a que entrou primeiro.
 */
export async function etiquetasDoCatalogo(db: Db, nomes: string[], cores: Record<string, CorEtiqueta> = {}, pessoa: string | null = null): Promise<string[]> {
  const pedidas = etiquetasUnicas(nomes);
  if (!pedidas.length) return [];
  const chaves = pedidas.map(chaveDaEtiqueta);
  const nomeDa = new Map<string, string>();
  const lerCatalogo = async (ks: string[]) => {
    for (const e of await db.select({ nome: ticketTags.name, chave: ticketTags.nameKey }).from(ticketTags).where(inArray(ticketTags.nameKey, ks))) nomeDa.set(e.chave, e.nome);
  };
  await lerCatalogo(chaves);
  const faltam = pedidas.filter((n) => !nomeDa.has(chaveDaEtiqueta(n)));
  if (faltam.length) {
    const corDa = new Map(Object.entries(cores).map(([n, c]) => [chaveDaEtiqueta(n), c]));
    const agora = new Date();
    await db.insert(ticketTags)
      .values(faltam.map((n) => ({ id: newId(), name: n, nameKey: chaveDaEtiqueta(n), color: corDa.get(chaveDaEtiqueta(n)) ?? 'neutral', createdById: pessoa, createdAt: agora, updatedAt: agora })))
      .onConflictDoNothing({ target: ticketTags.nameKey });
    await lerCatalogo(faltam.map(chaveDaEtiqueta));
  }
  return etiquetasUnicas(pedidas.map((n) => nomeDa.get(chaveDaEtiqueta(n)) ?? n));
}

/** As etiquetas usadas nos chamados (fora da lixeira), pela chave: o nome e em quantos chamados está. */
async function usos(db: Db): Promise<Map<string, { nome: string; chamados: number }>> {
  const n = new Map<string, { nome: string; chamados: number }>();
  const linhas = await db.select({ tags: tickets.tags }).from(tickets).where(and(isNull(tickets.deletedAt), sql`cardinality(${tickets.tags}) > 0`));
  for (const l of linhas) {
    for (const nome of etiquetasUnicas(l.tags)) {
      const k = chaveDaEtiqueta(nome);
      const u = n.get(k);
      if (u) u.chamados += 1; else n.set(k, { nome, chamados: 1 });
    }
  }
  return n;
}

/** Os nomes usados nos chamados (fora da lixeira), sem repetir: só o que a tela precisa (sem contar). */
async function nomesUsados(db: Db, paineis?: string[]): Promise<string[]> {
  if (paineis && !paineis.length) return [];
  const linhas = await db.selectDistinct({ e: sql<string>`unnest(${tickets.tags})` }).from(tickets)
    .where(and(isNull(tickets.deletedAt), paineis ? inArray(tickets.panelId, paineis) : undefined));
  return linhas.map((l) => l.e).filter(Boolean);
}

/**
 * As etiquetas que a pessoa vê, com a cor (as opções da tela): as usadas nos painéis dela e as que nenhum
 * chamado usa. A usada que não está no catálogo (escrita antes dele) vem cinza.
 */
export async function etiquetasParaAPessoa(db: Db, paineis: string[]): Promise<EtiquetaComCor[]> {
  const [catalogo, aqui, emTodos] = await Promise.all([
    db.select({ nome: ticketTags.name, chave: ticketTags.nameKey, cor: ticketTags.color }).from(ticketTags),
    nomesUsados(db, paineis),
    nomesUsados(db),
  ]);
  const usadasAqui = new Map(etiquetasUnicas(aqui).map((n) => [chaveDaEtiqueta(n), n]));
  const usadasEmTodos = new Set(emTodos.map(chaveDaEtiqueta));
  const lista: EtiquetaComCor[] = catalogo.filter((e) => usadasAqui.has(e.chave) || !usadasEmTodos.has(e.chave)).map((e) => ({ nome: e.nome, cor: corValida(e.cor) }));
  const noCatalogo = new Set(catalogo.map((e) => e.chave));
  for (const [k, nome] of usadasAqui) if (!noCatalogo.has(k)) lista.push({ nome, cor: 'neutral' });
  return lista.sort(ordemDoNome);
}

function daLinha(l: typeof ticketTags.$inferSelect, chamados: number): EtiquetaDoCatalogo {
  return { id: l.id, nome: l.name, cor: corValida(l.color), chamados, criadaEm: l.createdAt.toISOString() };
}

/** Ajustes › Etiquetas: todas, com quantos chamados cada uma tem. */
export async function listarEtiquetas(db: Db): Promise<EtiquetaDoCatalogo[]> {
  const [catalogo, n] = await Promise.all([db.select().from(ticketTags).orderBy(asc(ticketTags.name)), usos(db)]);
  return catalogo.map((l) => daLinha(l, n.get(l.nameKey)?.chamados ?? 0)).sort(ordemDoNome);
}

/** Criar uma etiqueta (o nome não se repete, sem ligar para maiúscula e acento). */
export async function criarEtiqueta(db: Db, d: EtiquetaGravar, pessoa: string | null): Promise<Gravado<EtiquetaDoCatalogo>> {
  const chave = chaveDaEtiqueta(d.nome);
  const [igual] = await db.select().from(ticketTags).where(eq(ticketTags.nameKey, chave)).limit(1);
  if (igual) throw new Conflict(`A etiqueta ${igual.name} já existe.`);
  const agora = new Date();
  const [l] = await db.insert(ticketTags).values({ id: newId(), name: d.nome, nameKey: chave, color: d.cor, createdById: pessoa, createdAt: agora, updatedAt: agora })
    .onConflictDoNothing({ target: ticketTags.nameKey }).returning();
  if (!l) throw new Conflict(`A etiqueta ${d.nome} já existe.`);
  const e = daLinha(l, (await usos(db)).get(chave)?.chamados ?? 0);
  return { valor: e, resumo: `Criou a etiqueta ${e.nome} (${NOME_COR_ETIQUETA[e.cor]})`, depois: { nome: e.nome, cor: e.cor } };
}

/** Trocar a cor de uma etiqueta: vale para todos os chamados que a têm. */
export async function trocarCorDaEtiqueta(db: Db, id: string, cor: CorEtiqueta): Promise<Gravado<EtiquetaDoCatalogo>> {
  const [antes] = await db.select().from(ticketTags).where(eq(ticketTags.id, id)).limit(1);
  if (!antes) throw naoAchada();
  const [l] = await db.update(ticketTags).set({ color: cor, updatedAt: new Date() }).where(eq(ticketTags.id, id)).returning();
  const e = daLinha(l!, (await usos(db)).get(l!.nameKey)?.chamados ?? 0);
  const de = corValida(antes.color);
  return {
    valor: e,
    resumo: de === cor ? `Salvou a etiqueta ${e.nome} sem mudanças` : `Trocou a cor da etiqueta ${e.nome}: ${NOME_COR_ETIQUETA[de]} → ${NOME_COR_ETIQUETA[cor]}`,
    antes: { cor: de }, depois: { cor },
  };
}

/** Tirar uma etiqueta das sugestões: só a que nenhum chamado usa (a usada sai dos chamados primeiro). */
export async function removerEtiqueta(db: Db, id: string): Promise<Gravado<{ ok: true }>> {
  const [l] = await db.select().from(ticketTags).where(eq(ticketTags.id, id)).limit(1);
  if (!l) throw naoAchada();
  const n = (await usos(db)).get(l.nameKey)?.chamados ?? 0;
  if (n) throw new Conflict(`A etiqueta ${l.name} está em ${n} ${n === 1 ? 'chamado' : 'chamados'}: tire dos chamados antes.`);
  await db.delete(ticketTags).where(eq(ticketTags.id, id));
  return { valor: { ok: true }, resumo: `Tirou a etiqueta ${l.name} das sugestões`, antes: { nome: l.name, cor: corValida(l.color) } };
}
