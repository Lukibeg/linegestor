/**
 * As movimentações dos circuitos e dos DIDs (2.4.1): cada mudança vira uma linha em `circuit_movements`, e a aba
 * Movimentações (Circuitos e DIDs) e a ficha do circuito leem daqui. Quem muda (as rotas, a lixeira e a importação) chama
 * a função do que aconteceu. A frase e os fatos saem das mesmas contas da prévia (@gestor/shared/circuitos-movimentacoes);
 * aqui só se buscam os nomes de agora e se guarda.
 */
import { and, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { carriers, circuitMovements, circuits, clients, dids, newId, users, type Db } from '@gestor/db';
import {
  didLimpo, idsDosNomesDaMovimentacao, linhaDaMovimentacao, movimentacaoDaImportacao, movimentacaoDaLixeiraDoCircuito,
  movimentacaoDaLixeiraDosDids, movimentacaoDoCircuitoCriado, movimentacaoDoCircuitoEditado, movimentacaoDosDidsCriados,
  movimentacaoDosDidsEditados, paraBusca, periodoDasMovimentacoes, tiposDoFiltro,
  type DetalhesDaMovimentacao, type MovimentacoesDosCircuitosFiltro, type NomesDaMovimentacao, type NovaMovimentacao,
  type PaginaDeMovimentacoes,
} from '@gestor/shared';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Exec = Db | Tx;
type LinhaDoCircuito = typeof circuits.$inferSelect;
type LinhaDoDid = typeof dids.$inferSelect;

const ACENTOS = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
const SEM_ACENTOS = 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc';
const unicos = (xs: ReadonlyArray<string | null | undefined>) => [...new Set(xs.filter((x): x is string => !!x))];

/** Os nomes de agora dos clientes, circuitos e operadoras citados (os da lixeira também: o histórico não perde o nome). */
async function nomesDe(db: Exec, ids: { clientes: string[]; circuitos: string[]; operadoras: string[] }): Promise<NomesDaMovimentacao> {
  const [cs, ks, os] = await Promise.all([
    ids.clientes.length ? db.select({ id: clients.id, nome: clients.tradeName }).from(clients).where(inArray(clients.id, ids.clientes)) : [],
    ids.circuitos.length ? db.select({ id: circuits.id, nome: circuits.name }).from(circuits).where(inArray(circuits.id, ids.circuitos)) : [],
    ids.operadoras.length ? db.select({ id: carriers.id, nome: carriers.name }).from(carriers).where(inArray(carriers.id, ids.operadoras)) : [],
  ]);
  const mapa = (xs: Array<{ id: string; nome: string }>) => Object.fromEntries(xs.map((x) => [x.id, x.nome]));
  return { clientes: mapa(cs), circuitos: mapa(ks), operadoras: mapa(os) };
}

async function guardar(db: Exec, quem: string | null, m: NovaMovimentacao | null) {
  if (!m) return;
  await db.insert(circuitMovements).values({
    id: newId(), userId: quem, kind: m.tipo, circuitIds: m.circuitos, didNumbers: m.numeros, summary: m.resumo, details: m.detalhes,
  });
}

// ---------------------------------------------------------------- os circuitos

export async function aoCriarCircuito(db: Exec, quem: string | null, row: LinhaDoCircuito) {
  await guardar(db, quem, movimentacaoDoCircuitoCriado(row));
}

/** O circuito alterado: só registra quando algo mudou de fato. */
export async function aoEditarCircuito(db: Exec, quem: string | null, antes: LinhaDoCircuito, depois: LinhaDoCircuito, senhaNova: boolean) {
  const ids = idsDosNomesDaMovimentacao({ antes: { carrierId: antes.carrierId, ownerClientId: antes.ownerClientId }, depois: { carrierId: depois.carrierId, ownerClientId: depois.ownerClientId } });
  await guardar(db, quem, movimentacaoDoCircuitoEditado(antes, depois, senhaNova, await nomesDe(db, ids)));
}

export async function aoMexerNaLixeiraDoCircuito(db: Exec, quem: string | null, row: LinhaDoCircuito, tipo: 'circuito_lixeira' | 'circuito_restaurado') {
  await guardar(db, quem, movimentacaoDaLixeiraDoCircuito(row, tipo));
}

// ---------------------------------------------------------------- os DIDs

/** Os DIDs como estão agora (para o antes de uma alteração em massa e o depois dela). */
export async function didsPorId(db: Exec, ids: readonly string[]): Promise<LinhaDoDid[]> {
  if (!ids.length) return [];
  const out: LinhaDoDid[] = [];
  for (let i = 0; i < ids.length; i += 1000) out.push(...await db.select().from(dids).where(inArray(dids.id, ids.slice(i, i + 1000))));
  return out;
}

export async function aoCriarDids(db: Exec, quem: string | null, f: { numeros: readonly string[]; circuitId: string; clientId?: string | null; note?: string | null }) {
  const nomes = await nomesDe(db, { clientes: unicos([f.clientId]), circuitos: [f.circuitId], operadoras: [] });
  await guardar(db, quem, movimentacaoDosDidsCriados(f, nomes));
}

/** Os DIDs alterados (um, pela linha; vários, pela edição em massa). */
export async function aoEditarDids(db: Exec, quem: string | null, pares: Array<{ antes: LinhaDoDid; depois: LinhaDoDid }>, resumoDaMassa?: string) {
  const ids = idsDosNomesDaMovimentacao({ dids: pares.map((p) => ({ numero: p.depois.number, antes: p.antes, depois: p.depois })) });
  await guardar(db, quem, movimentacaoDosDidsEditados(pares, await nomesDe(db, ids), resumoDaMassa));
}

export async function aoMexerNaLixeiraDosDids(db: Exec, quem: string | null, rows: readonly LinhaDoDid[], tipo: 'dids_lixeira' | 'did_restaurado') {
  await guardar(db, quem, movimentacaoDaLixeiraDosDids(rows, tipo));
}

/** A importação da planilha (dentro da transação dela): uma linha, com os números e os circuitos que entraram ou mudaram. */
export async function aoImportar(db: Exec, quem: string | null, f: { entidade: 'circuitos' | 'dids'; criados: number; alterados: number; circuitos: ReadonlyArray<string | null | undefined>; numeros: readonly string[] }) {
  await guardar(db, quem, movimentacaoDaImportacao(f));
}

// ---------------------------------------------------------------- a lista

export async function listar(db: Db, q: MovimentacoesDosCircuitosFiltro): Promise<PaginaDeMovimentacoes> {
  const conds: SQL[] = [];
  if (q.circuitId) conds.push(sql`${q.circuitId} = ANY(${circuitMovements.circuitIds})`);
  // sem o interruptor, some a movimentação só de links de terceiros (decisão 0020)
  else if (!q.incluirTerceiros) conds.push(sql`(cardinality(${circuitMovements.circuitIds}) = 0 or exists (select 1 from ${circuits} where ${circuits.id} = any(${circuitMovements.circuitIds}) and not ${circuits.thirdParty}))`);
  const tipos = tiposDoFiltro(q.tipo);
  if (tipos) conds.push(inArray(circuitMovements.kind, tipos));
  if (q.userId) conds.push(eq(circuitMovements.userId, q.userId));
  const { desde, antesDe } = periodoDasMovimentacoes(q.de, q.ate);
  if (desde) conds.push(gte(circuitMovements.createdAt, desde));
  if (antesDe) conds.push(lt(circuitMovements.createdAt, antesDe));
  if (q.q) {
    const t = paraBusca(q.q).replace(/[\\%_]/g, (c) => `\\${c}`);
    const digitos = didLimpo(q.q);
    const naFrase = sql`translate(lower(${circuitMovements.summary}), ${ACENTOS}, ${SEM_ACENTOS}) like ${`%${t}%`}`;
    conds.push(digitos.length >= 3 ? sql`(${naFrase} or array_to_string(${circuitMovements.didNumbers}, ' ') like ${`%${digitos}%`})` : naFrase);
  }
  const where = conds.length ? and(...conds) : undefined;
  const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(circuitMovements).where(where);
  const linhas = await db.select().from(circuitMovements).where(where)
    .orderBy(desc(circuitMovements.createdAt), desc(circuitMovements.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);

  // os nomes de tudo o que a página cita, de uma vez
  const ids = { clientes: new Set<string>(), circuitos: new Set<string>(), operadoras: new Set<string>() };
  for (const l of linhas) {
    for (const c of l.circuitIds) ids.circuitos.add(c);
    const d = idsDosNomesDaMovimentacao(l.details as DetalhesDaMovimentacao | null);
    d.clientes.forEach((x) => ids.clientes.add(x)); d.circuitos.forEach((x) => ids.circuitos.add(x)); d.operadoras.forEach((x) => ids.operadoras.add(x));
  }
  const nomes = await nomesDe(db, { clientes: [...ids.clientes], circuitos: [...ids.circuitos], operadoras: [...ids.operadoras] });
  const vivos = new Set(ids.circuitos.size
    ? (await db.select({ id: circuits.id }).from(circuits).where(and(inArray(circuits.id, [...ids.circuitos]), isNull(circuits.deletedAt)))).map((c) => c.id)
    : []);
  const quemIds = unicos(linhas.map((l) => l.userId));
  const pessoasDaPagina = Object.fromEntries((quemIds.length ? await db.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, quemIds)) : []).map((u) => [u.id, u.nome]));

  const items = linhas.map((l) => linhaDaMovimentacao({
    id: l.id, quando: l.createdAt.toISOString(), userId: l.userId, tipo: l.kind, circuitos: l.circuitIds, numeros: l.didNumbers,
    resumo: l.summary, detalhes: l.details as DetalhesDaMovimentacao | null,
  }, nomes, pessoasDaPagina, vivos));

  const pessoas = await db.selectDistinct({ id: users.id, nome: users.name }).from(circuitMovements).innerJoin(users, eq(users.id, circuitMovements.userId)).orderBy(users.name);
  return { items, total: Number(total), page: q.page, pageSize: q.pageSize, pessoas };
}
