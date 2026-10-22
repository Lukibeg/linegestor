/**
 * As etiquetas com cor (2.0, o pedido do Luan na prévia: "na hora de criar as etiquetas, seria legal
 * poder escolher a cor também") — e, desde o 2.0.3, de cada painel (o pedido do Luan: "as etiquetas tem q ser
 * por painel, cada painel vai ter suas etiquetas").
 *
 * O catálogo (`ticket_tags`) guarda o painel, o nome e a cor de cada etiqueta; o chamado guarda os nomes
 * (`tickets.tags`), sempre escritos como no catálogo do painel dele — "cliente VIP" escrito de novo vira a
 * "Cliente VIP" que já existe ali. O mesmo nome pode estar em dois painéis, cada um com a sua cor. A etiqueta
 * nova nasce no painel do chamado, com a cor escolhida na tela (no Abrir chamado e na ficha), ou cinza quando
 * ninguém escolheu (o robô, a IA). Quem cuida dos chamados cria, edita (o nome e a cor, no seletor de etiquetas
 * e em Ajustes › Etiquetas: o pedido do Luan, "parecido com o Helena") e tira a que nenhum chamado do painel
 * usa. O nome novo vale nos chamados do painel; o histórico dos chamados fica como foi. O chamado que passa
 * para outro painel leva as etiquetas: as que faltam lá entram no catálogo de lá, com a mesma cor.
 *
 * O que cada pessoa vê para sugerir: as etiquetas dos painéis que ela vê (as do catálogo e as usadas nos
 * chamados deles); a de um painel que ela não vê não aparece.
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { newId, ticketPanels, ticketTags, tickets, type Db } from '@gestor/db';
import {
  CORES_ETIQUETA, NOME_COR_ETIQUETA, chaveDaEtiqueta, etiquetasUnicas, renomearEtiqueta,
  type CorEtiqueta, type EtiquetaDoCatalogo, type EtiquetaEditar, type EtiquetaGravar, type EtiquetaNoPainel,
} from '@gestor/shared';
import { AppError, BadRequest, Conflict } from '../../plugins/errors.js';
import type { Gravado } from './ajustes.js';

const corValida = (c: string): CorEtiqueta => ((CORES_ETIQUETA as readonly string[]).includes(c) ? (c as CorEtiqueta) : 'neutral');
const naoAchada = () => new AppError(404, 'Etiqueta não encontrada');
const ordemDoNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
/** O nome do painel (para a auditoria e as mensagens); nulo se ele não existe. */
async function nomeDoPainel(db: Db, id: string): Promise<string | null> {
  const [p] = await db.select({ nome: ticketPanels.name }).from(ticketPanels).where(eq(ticketPanels.id, id)).limit(1);
  return p?.nome ?? null;
}

/**
 * Os nomes como estão no catálogo do painel, sem repetir; a que falta entra nele, com a cor escolhida na tela
 * (`cores`, pelo nome) ou cinza. Duas pessoas criando a mesma ao mesmo tempo: vale a que entrou primeiro.
 */
export async function etiquetasDoCatalogo(db: Db, painelId: string, nomes: string[], cores: Record<string, CorEtiqueta> = {}, pessoa: string | null = null): Promise<string[]> {
  const pedidas = etiquetasUnicas(nomes);
  if (!pedidas.length) return [];
  const chaves = pedidas.map(chaveDaEtiqueta);
  const nomeDa = new Map<string, string>();
  const lerCatalogo = async (ks: string[]) => {
    const linhas = await db.select({ nome: ticketTags.name, chave: ticketTags.nameKey }).from(ticketTags)
      .where(and(eq(ticketTags.panelId, painelId), inArray(ticketTags.nameKey, ks)));
    for (const e of linhas) nomeDa.set(e.chave, e.nome);
  };
  await lerCatalogo(chaves);
  const faltam = pedidas.filter((n) => !nomeDa.has(chaveDaEtiqueta(n)));
  if (faltam.length) {
    const corDa = new Map(Object.entries(cores).map(([n, c]) => [chaveDaEtiqueta(n), c]));
    const agora = new Date();
    await db.insert(ticketTags)
      .values(faltam.map((n) => ({ id: newId(), panelId: painelId, name: n, nameKey: chaveDaEtiqueta(n), color: corDa.get(chaveDaEtiqueta(n)) ?? 'neutral', createdById: pessoa, createdAt: agora, updatedAt: agora })))
      .onConflictDoNothing({ target: [ticketTags.panelId, ticketTags.nameKey] });
    await lerCatalogo(faltam.map(chaveDaEtiqueta));
  }
  return etiquetasUnicas(pedidas.map((n) => nomeDa.get(chaveDaEtiqueta(n)) ?? n));
}

/**
 * O chamado que passa de um painel para outro leva as etiquetas: as que o painel novo não tem entram nele com a
 * cor que tinham no antigo. Devolve os nomes como ficam no painel novo (lá a etiqueta pode estar escrita de outro jeito).
 */
export async function levarEtiquetas(db: Db, nomes: string[], de: string, para: string, pessoa: string | null): Promise<string[]> {
  if (!nomes.length) return [];
  const antigas = await db.select({ chave: ticketTags.nameKey, cor: ticketTags.color }).from(ticketTags)
    .where(and(eq(ticketTags.panelId, de), inArray(ticketTags.nameKey, nomes.map(chaveDaEtiqueta))));
  const corDa = new Map(antigas.map((e) => [e.chave, corValida(e.cor)]));
  const cores = Object.fromEntries(nomes.filter((n) => corDa.has(chaveDaEtiqueta(n))).map((n) => [n, corDa.get(chaveDaEtiqueta(n))!]));
  return etiquetasDoCatalogo(db, para, nomes, cores, pessoa);
}

/** As etiquetas usadas nos chamados de um painel (fora da lixeira), pela chave: o nome e em quantos chamados está. */
async function usos(db: Db, painelId: string): Promise<Map<string, { nome: string; chamados: number }>> {
  const n = new Map<string, { nome: string; chamados: number }>();
  const linhas = await db.select({ tags: tickets.tags }).from(tickets)
    .where(and(eq(tickets.panelId, painelId), isNull(tickets.deletedAt), sql`cardinality(${tickets.tags}) > 0`));
  for (const l of linhas) {
    for (const nome of etiquetasUnicas(l.tags)) {
      const k = chaveDaEtiqueta(nome);
      const u = n.get(k);
      if (u) u.chamados += 1; else n.set(k, { nome, chamados: 1 });
    }
  }
  return n;
}

/**
 * As etiquetas que a pessoa vê, com a cor, painel por painel (as opções da tela): as do catálogo de cada painel
 * dela e as usadas nos chamados dele que não estão no catálogo (escritas antes dele: vêm cinza).
 */
export async function etiquetasParaAPessoa(db: Db, paineis: string[]): Promise<EtiquetaNoPainel[]> {
  if (!paineis.length) return [];
  const [catalogo, usadas] = await Promise.all([
    db.select({ painelId: ticketTags.panelId, nome: ticketTags.name, chave: ticketTags.nameKey, cor: ticketTags.color }).from(ticketTags).where(inArray(ticketTags.panelId, paineis)),
    db.selectDistinct({ painelId: tickets.panelId, e: sql<string>`unnest(${tickets.tags})` }).from(tickets)
      .where(and(isNull(tickets.deletedAt), inArray(tickets.panelId, paineis))),
  ]);
  const lista: EtiquetaNoPainel[] = catalogo.map((e) => ({ painelId: e.painelId, nome: e.nome, cor: corValida(e.cor) }));
  const noCatalogo = new Set(catalogo.map((e) => `${e.painelId}\n${e.chave}`));
  for (const u of usadas) {
    if (!u.e) continue;
    const k = `${u.painelId}\n${chaveDaEtiqueta(u.e)}`;
    if (noCatalogo.has(k)) continue;
    noCatalogo.add(k);
    lista.push({ painelId: u.painelId, nome: u.e, cor: 'neutral' });
  }
  return lista.sort((a, b) => paineis.indexOf(a.painelId) - paineis.indexOf(b.painelId) || ordemDoNome(a, b));
}

function daLinha(l: typeof ticketTags.$inferSelect, chamados: number): EtiquetaDoCatalogo {
  return { id: l.id, painelId: l.panelId, nome: l.name, cor: corValida(l.color), chamados, criadaEm: l.createdAt.toISOString() };
}

/** Ajustes › Etiquetas: todas, de todos os painéis, com quantos chamados do painel cada uma tem. */
export async function listarEtiquetas(db: Db): Promise<EtiquetaDoCatalogo[]> {
  const catalogo = await db.select().from(ticketTags).orderBy(asc(ticketTags.name));
  const paineis = [...new Set(catalogo.map((l) => l.panelId))];
  const usoDe = new Map(await Promise.all(paineis.map(async (p) => [p, await usos(db, p)] as const)));
  return catalogo.map((l) => daLinha(l, usoDe.get(l.panelId)?.get(l.nameKey)?.chamados ?? 0)).sort(ordemDoNome);
}

/** Criar uma etiqueta num painel (o nome não se repete no painel, sem ligar para maiúscula e acento). */
export async function criarEtiqueta(db: Db, d: EtiquetaGravar, pessoa: string | null): Promise<Gravado<EtiquetaDoCatalogo>> {
  const nome = await nomeDoPainel(db, d.painelId);
  if (!nome) throw new BadRequest('Esse painel não existe.');
  const painel = { nome };
  const chave = chaveDaEtiqueta(d.nome);
  const [igual] = await db.select().from(ticketTags).where(and(eq(ticketTags.panelId, d.painelId), eq(ticketTags.nameKey, chave))).limit(1);
  if (igual) throw new Conflict(`A etiqueta ${igual.name} já existe no ${painel.nome}.`);
  const agora = new Date();
  const [l] = await db.insert(ticketTags).values({ id: newId(), panelId: d.painelId, name: d.nome, nameKey: chave, color: d.cor, createdById: pessoa, createdAt: agora, updatedAt: agora })
    .onConflictDoNothing({ target: [ticketTags.panelId, ticketTags.nameKey] }).returning();
  if (!l) throw new Conflict(`A etiqueta ${d.nome} já existe no ${painel.nome}.`);
  const e = daLinha(l, (await usos(db, d.painelId)).get(chave)?.chamados ?? 0);
  return { valor: e, resumo: `Criou a etiqueta ${e.nome} (${NOME_COR_ETIQUETA[e.cor]}) no painel ${painel.nome}`, depois: { painel: painel.nome, nome: e.nome, cor: e.cor } };
}

/**
 * Editar uma etiqueta — o nome e a cor —, pelo id (Ajustes › Etiquetas) ou pelo painel e o nome de agora (o
 * seletor de etiquetas). A que só está nos chamados do painel (escrita antes do catálogo) entra nele agora. O nome
 * novo não pode ser o de outra etiqueta do painel (sem ligar para maiúscula e acento) e passa a valer nos chamados
 * do painel que têm a etiqueta (os da lixeira também), tudo junto.
 */
export async function editarEtiqueta(db: Db, alvo: { id: string } | { painelId: string; nome: string }, d: EtiquetaEditar, pessoa: string | null): Promise<Gravado<EtiquetaDoCatalogo>> {
  const r = await db.transaction(async (tx) => {
    let [antes] = 'id' in alvo
      ? await tx.select().from(ticketTags).where(eq(ticketTags.id, alvo.id)).limit(1)
      : await tx.select().from(ticketTags).where(and(eq(ticketTags.panelId, alvo.painelId), eq(ticketTags.nameKey, chaveDaEtiqueta(alvo.nome)))).limit(1);
    if (!antes && 'nome' in alvo) {
      const usada = (await usos(tx as unknown as Db, alvo.painelId)).get(chaveDaEtiqueta(alvo.nome));
      if (usada) {
        const agora = new Date();
        [antes] = await tx.insert(ticketTags).values({ id: newId(), panelId: alvo.painelId, name: usada.nome, nameKey: chaveDaEtiqueta(usada.nome), color: 'neutral', createdById: pessoa, createdAt: agora, updatedAt: agora }).returning();
      }
    }
    if (!antes) throw naoAchada();
    const nome = d.nome ?? antes.name;
    const chave = chaveDaEtiqueta(nome);
    if (chave !== antes.nameKey) {
      const [outra] = await tx.select({ nome: ticketTags.name }).from(ticketTags).where(and(eq(ticketTags.panelId, antes.panelId), eq(ticketTags.nameKey, chave))).limit(1);
      if (outra) throw new Conflict(`A etiqueta ${outra.nome} já existe neste painel: escolha outro nome.`);
    }
    const [l] = await tx.update(ticketTags).set({ name: nome, nameKey: chave, color: d.cor, updatedAt: new Date() }).where(eq(ticketTags.id, antes.id)).returning();
    // o nome novo nos chamados do painel (até a mudança só de maiúscula: "vip" vira "VIP")
    let chamados = 0;
    if (nome !== antes.name) {
      const linhas = await tx.select({ id: tickets.id, tags: tickets.tags }).from(tickets)
        .where(and(eq(tickets.panelId, antes.panelId), sql`cardinality(${tickets.tags}) > 0`));
      for (const t of linhas) {
        const nova = renomearEtiqueta(t.tags, antes.nameKey, nome);
        if (nova) { await tx.update(tickets).set({ tags: nova }).where(eq(tickets.id, t.id)); chamados += 1; }
      }
    }
    return { antes, l: l!, chamados };
  });
  const e = daLinha(r.l, (await usos(db, r.l.panelId)).get(r.l.nameKey)?.chamados ?? 0);
  const de = corValida(r.antes.color);
  const renomeou = r.l.name !== r.antes.name;
  const painel = (await nomeDoPainel(db, r.l.panelId)) ?? 'que saiu';
  const nos = r.chamados ? ` (em ${r.chamados} ${r.chamados === 1 ? 'chamado' : 'chamados'})` : '';
  const resumo = renomeou && de !== d.cor ? `Editou a etiqueta ${r.antes.name} do painel ${painel}: agora ${e.nome}, ${NOME_COR_ETIQUETA[d.cor].toLowerCase()}${nos}`
    : renomeou ? `Renomeou a etiqueta ${r.antes.name} do painel ${painel} para ${e.nome}${nos}`
      : de !== d.cor ? `Trocou a cor da etiqueta ${e.nome} do painel ${painel}: ${NOME_COR_ETIQUETA[de]} → ${NOME_COR_ETIQUETA[d.cor]}`
        : `Salvou a etiqueta ${e.nome} do painel ${painel} sem mudanças`;
  return { valor: e, resumo, antes: { painel, nome: r.antes.name, cor: de }, depois: { painel, nome: e.nome, cor: d.cor } };
}

/** Tirar uma etiqueta das sugestões do painel: só a que nenhum chamado dele usa (a usada sai dos chamados primeiro). */
export async function removerEtiqueta(db: Db, id: string): Promise<Gravado<{ ok: true }>> {
  const [l] = await db.select().from(ticketTags).where(eq(ticketTags.id, id)).limit(1);
  if (!l) throw naoAchada();
  const n = (await usos(db, l.panelId)).get(l.nameKey)?.chamados ?? 0;
  if (n) throw new Conflict(`A etiqueta ${l.name} está em ${n} ${n === 1 ? 'chamado' : 'chamados'}: tire dos chamados antes.`);
  await db.delete(ticketTags).where(eq(ticketTags.id, id));
  const painel = (await nomeDoPainel(db, l.panelId)) ?? 'que saiu';
  return { valor: { ok: true }, resumo: `Tirou a etiqueta ${l.name} das sugestões do painel ${painel}`, antes: { painel, nome: l.name, cor: corValida(l.color) } };
}
