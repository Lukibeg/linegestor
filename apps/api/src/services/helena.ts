/**
 * TRAZER DO HELENA (Patch 2.0.3, decisão 0054) — o servidor: ler o painel de vendas do Helena pela chave do
 * LineChat (a do cofre), mostrar a prévia e gravar. As regras (o histórico, os valores, as etapas, os campos,
 * a prévia) moram no `@gestor/shared` (helena.ts): as mesmas da prévia clicável.
 *
 * A leitura demora — um pedido por card, para o histórico —, então roda por fora do pedido da tela, e a tela
 * acompanha ("lendo 23 de 55"). Ela fica guardada aqui por duas horas: a prévia e o "Trazer" usam o que foi
 * lido, sem ler o Helena de novo (o que a pessoa viu é o que é gravado).
 *
 * O que o "Trazer" grava, numa transação só: o painel (o novo, quando nenhum painel de Vendas foi escolhido),
 * as etapas, os campos, os motivos de perda, as etiquetas no catálogo e cada negociação com o histórico. A
 * negociação guarda o card de lá (`tickets.external_ref`): trazendo de novo, ela é atualizada e o histórico
 * que veio do Helena é refeito (o que a equipe fez no Gestor fica). Nada vai para os webhooks nem para os
 * avisos: são as negociações de antes, não novidades.
 */
import { and, asc, eq, inArray, isNull, like, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { clients, newId, products, ticketEvents, ticketFields, ticketPanels, ticketStages, ticketTags, tickets, users, type Db } from '@gestor/db';
import {
  AJUSTES_DO_PAINEL_DE_VENDAS, CAMPOS_DO_PAINEL_DE_VENDAS, ajustesDoPainelCompletos, chaveDaEtiqueta, chaveDoNome, codigoDoChamado, ehLista, ligarEtapasDoEvento,
  obrigatoriosDoPainel, planoDaImportacao, resumoDaImportacao, siglaDoPainelNovo, textoDoCard, valorDoCampoNoGestor,
  type AjustesDoPainel, type CardDoHelena, type EstadoDoGestorParaHelena, type LeituraDoHelena, type LeituraDoHelenaNaTela, type Obrigatorio,
  type OpcaoDoCampo, type OpcoesDoTrazerDoHelena, type PainelDoGestorParaHelena, type PlanoDaImportacao, type PreviaDoHelena,
  type ResultadoDaVenda, type ResultadoDoTrazerDoHelena, type TipoEtapa, type ValoresDosCampos,
} from '@gestor/shared';
import { AppError, BadRequest, NotFound } from '../plugins/errors.js';
import { clienteDaApi, type CardApi, type CardComHistoricoApi, type LineChatApi } from './linechat.js';
import type { SecretsVault } from './secrets.js';
import { aplicarEtapas, planejarEtapas, type EtapaGravar, type Tx } from './atendimento/ajustes.js';
import { carregarCampos, pessoaDoAtor, type Ator } from './atendimento/contexto.js';
import { etiquetasDoCatalogo } from './atendimento/etiquetas.js';

// ---------- o que os testes trocam ----------

type Ferramentas = { fetchFn: typeof fetch };
let ferramentas: Ferramentas = { fetchFn: (...a) => fetch(...a) };
/** Os testes trocam o `fetch` por um Helena de mentira. */
export function trocarFerramentasHelena(f: Partial<Ferramentas>) { ferramentas = { ...ferramentas, ...f }; }

const REF = (cardId: string) => `helena:${cardId}`;
const GUARDAR_POR_MS = 2 * 60 * 60_000;
const MAX_LEITURAS = 10;
/** Sem o histórico nos primeiros cards, a chave não lê o histórico: não adianta pedir de todos. */
const DESISTE_DEPOIS_DE = 5;

// =====================================================================
//  OS PAINÉIS PARA ESCOLHER
// =====================================================================

/** Os painéis do Helena (os de vendas primeiro) e os painéis de Vendas do Gestor que podem receber. */
export async function opcoes(db: Db, vault: SecretsVault): Promise<OpcoesDoTrazerDoHelena> {
  const destinos = await destinosDoGestor(db);
  try {
    const { api } = await clienteDaApi(db, vault, ferramentas.fetchFn);
    const lista = await api.paineis();
    const helena = lista.map((p) => ({ id: p.id, nome: p.title, sigla: p.key, vendas: /^sale/i.test(p.type ?? '') }))
      .sort((a, b) => Number(b.vendas) - Number(a.vendas) || a.nome.localeCompare(b.nome, 'pt-BR'));
    return { conectado: true, erro: null, helena, destinos };
  } catch (e) {
    return { conectado: false, erro: e instanceof Error ? e.message : String(e), helena: [], destinos };
  }
}

async function destinosDoGestor(db: Db) {
  const paineis = await db.select({ id: ticketPanels.id, nome: ticketPanels.name, sigla: ticketPanels.key }).from(ticketPanels)
    .where(and(eq(ticketPanels.kind, 'vendas'), isNull(ticketPanels.deletedAt))).orderBy(asc(ticketPanels.sortOrder));
  const contagem = paineis.length
    ? await db.select({ panelId: tickets.panelId, n: sql<number>`count(*)::int` }).from(tickets)
      .where(and(inArray(tickets.panelId, paineis.map((p) => p.id)), isNull(tickets.deletedAt))).groupBy(tickets.panelId)
    : [];
  const n = new Map(contagem.map((c) => [c.panelId, Number(c.n)]));
  return paineis.map((p) => ({ ...p, negociacoes: n.get(p.id) ?? 0 }));
}

// =====================================================================
//  A LEITURA (por fora do pedido da tela)
// =====================================================================

type Leitura = LeituraDoHelenaNaTela & { porId: string | null; leitura: LeituraDoHelena | null; criadaEm: number };
const leituras = new Map<string, Leitura>();

const naTela = (l: Leitura): LeituraDoHelenaNaTela => ({
  id: l.id, painelId: l.painelId, painelNome: l.painelNome, estado: l.estado, lidos: l.lidos, total: l.total, erro: l.erro, comecouEm: l.comecouEm, acabouEm: l.acabouEm,
});

function limparLeituras(agora = Date.now()) {
  for (const [id, l] of leituras) if (agora - l.criadaEm > GUARDAR_POR_MS && l.estado !== 'lendo') leituras.delete(id);
  const velhas = [...leituras.values()].filter((l) => l.estado !== 'lendo').sort((a, b) => a.criadaEm - b.criadaEm);
  while (leituras.size >= MAX_LEITURAS && velhas.length) leituras.delete(velhas.shift()!.id);
}

/** Começa a ler um painel do Helena; a tela acompanha pelo `verLeitura`. Uma leitura do mesmo painel por vez. */
export function comecarLeitura(app: FastifyInstance, ator: Ator, painelId: string): LeituraDoHelenaNaTela {
  limparLeituras();
  const lendo = [...leituras.values()].find((l) => l.painelId === painelId && l.estado === 'lendo');
  if (lendo) return naTela(lendo);
  const agora = new Date();
  const l: Leitura = {
    id: newId(), painelId, painelNome: null, estado: 'lendo', lidos: 0, total: null, erro: null,
    comecouEm: agora.toISOString(), acabouEm: null, porId: pessoaDoAtor(ator), leitura: null, criadaEm: agora.getTime(),
  };
  leituras.set(l.id, l);
  void lerOHelena(app.db, app.vault, l).then((leitura) => {
    l.leitura = leitura; l.estado = 'pronta';
  }).catch((e: unknown) => {
    l.erro = e instanceof Error ? e.message : String(e); l.estado = 'erro';
    app.log.warn({ err: e, painelId }, 'Trazer do Helena: a leitura falhou');
  }).finally(() => { l.acabouEm = new Date().toISOString(); });
  return naTela(l);
}

/** Espera a leitura acabar (os testes e quem chama de dentro do servidor). */
export async function esperarLeitura(id: string, limiteMs = 60_000): Promise<LeituraDoHelenaNaTela> {
  const fim = Date.now() + limiteMs;
  for (;;) {
    const l = leituras.get(id);
    if (!l) throw new NotFound('Leitura do Helena');
    if (l.estado !== 'lendo' || Date.now() > fim) return naTela(l);
    await new Promise((r) => setTimeout(r, 20));
  }
}

function pegar(id: string): Leitura {
  const l = leituras.get(id);
  if (!l) throw new AppError(410, 'Essa leitura do Helena não está mais guardada (ela fica duas horas). Leia o Helena de novo.');
  return l;
}

export function verLeitura(id: string): LeituraDoHelenaNaTela { return naTela(pegar(id)); }

/** A leitura pronta (ou o erro dela). */
function pronta(id: string): LeituraDoHelena {
  const l = pegar(id);
  if (l.estado === 'lendo') throw new AppError(409, `Ainda lendo o Helena (${l.lidos} de ${l.total ?? '…'}). Espere acabar.`);
  if (l.estado === 'erro' || !l.leitura) throw new BadRequest(l.erro ?? 'A leitura do Helena não deu certo. Leia de novo.');
  return l.leitura;
}

/** O card do Helena no jeito das regras: a lista (v2: os campos com o nome das opções) e o histórico (v1). */
export function cardDoHelena(c: CardApi, d: CardComHistoricoApi | null): CardDoHelena {
  const valor = d?.monetaryAmount ?? c.monetaryAmount ?? null;
  return {
    id: c.id,
    numero: c.number ?? d?.number ?? null,
    codigo: c.key ?? d?.key ?? null,
    titulo: (c.title ?? d?.title ?? '').trim() || '(sem título)',
    descricao: textoDoCard(c.description ?? d?.description ?? null).slice(0, 5000) || null,
    etapa: c.stepTitle ?? d?.stepTitle ?? null,
    situacao: (c.status ?? d?.status ?? 'OPEN').toUpperCase(),
    criadoEm: c.createdAt ?? d?.createdAt,
    alteradoEm: c.updatedAt ?? d?.updatedAt ?? c.createdAt,
    concluidoEm: d?.resultChangedAt ?? c.resultChangedAt ?? null,
    motivo: d?.resultDescription ?? c.resultDescription ?? null,
    valor: typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) : null,
    responsavelId: c.responsibleUserId ?? d?.responsibleUserId ?? null,
    criadoPorId: d?.createdByUserId ?? c.createdByUserId ?? null,
    etiquetas: c.tagIds ?? d?.tagIds ?? [],
    campos: c.customFields ?? d?.customFieldValues ?? {},
    // nulo: o card não veio, ou veio sem o histórico (o LineChat não aceitou o detalhe Logs)
    logs: d && Array.isArray(d.logs) ? d.logs.filter((l) => l && l.id && typeof l.text === 'string').map((l) => ({ id: l.id, em: l.createdAt, texto: l.text, usuarioId: l.userId ?? null })) : null,
  };
}

/** Lê o painel inteiro: as etapas, os campos, as etiquetas, os cards (todos) e o histórico de cada um. */
async function lerOHelena(db: Db, vault: SecretsVault, l: Leitura): Promise<LeituraDoHelena> {
  const { api } = await clienteDaApi(db, vault, ferramentas.fetchFn);
  const [painel, campos] = await Promise.all([api.painel(l.painelId), api.campos(l.painelId)]);
  l.painelNome = painel.title;
  const cards = await api.cards(l.painelId);
  l.total = cards.length;
  const { detalhes, falha } = await historicos(api, cards, l);
  // quem é quem: a lista da conta (quando a chave pode ler) e o que os cards dizem
  const usuarios = new Map<string, string>();
  try { for (const u of await api.usuarios()) usuarios.set(u.id, u.nome); } catch { /* sem a lista, ficam os nomes dos cards */ }
  for (const c of cards) if (c.responsibleUser?.id && c.responsibleUser.name && !usuarios.has(c.responsibleUser.id)) usuarios.set(c.responsibleUser.id, c.responsibleUser.name);
  const semHistorico = cards.filter((c) => !detalhes.get(c.id)).length;
  const avisos: string[] = [];
  if (semHistorico && falha) avisos.push(`O Helena não devolveu o histórico de ${semHistorico === 1 ? '1 card' : `${semHistorico} cards`}: ${falha}`);
  // o que o LineChat recusou no pedido do card (2.0.4.1): o detalhe sai e o resto vem
  if (api.recusasDoCard.length) {
    const recusas = [...new Set(api.recusasDoCard)].map((r) => `"${r}"`).join(', ');
    avisos.push(api.cardComHistorico === false
      ? `O LineChat não aceitou pedir o histórico junto do card (recusou ${recusas}): as negociações vêm sem o histórico, com a Conclusão de cada card.`
      : api.cardComHistorico ? `O LineChat recusou ${recusas} no pedido do card; o resto veio.` : `O LineChat recusou ${recusas} no pedido do card.`);
  }
  return {
    lidaEm: new Date().toISOString(),
    avisos,
    usuarios: [...usuarios].map(([id, nome]) => ({ id, nome })),
    painel: {
      id: painel.id, nome: painel.title, sigla: painel.key ?? null,
      etapas: (painel.steps ?? []).map((e, i) => ({ id: e.id, nome: e.title, posicao: e.position ?? i + 1, inicial: !!e.isInitial, arquivada: !!e.archived })),
      campos: (Array.isArray(campos) ? campos : []).filter((c) => c && c.key)
        .map((c) => ({ chave: c.key, nome: c.name || c.key, tipo: c.type ?? 'TEXT', posicao: c.position ?? 0, opcoes: (c.options ?? []).map((o) => o?.name).filter((x): x is string => !!x) })),
      etiquetas: (painel.tags ?? []).map((t) => ({ id: t.id, nome: t.name, cor: t.bgColor ?? null })),
    },
    cards: cards.map((c) => cardDoHelena(c, detalhes.get(c.id) ?? null)),
  };
}

/**
 * O histórico card a card (um por vez, para não apertar a API). O card que não vem fica sem o histórico (a
 * prévia diz quantos e por quê); se os primeiros não vêm, a chave não lê o histórico: não adianta pedir o resto.
 */
async function historicos(api: LineChatApi, cards: CardApi[], l: Leitura): Promise<{ detalhes: Map<string, CardComHistoricoApi | null>; falha: string | null }> {
  const detalhes = new Map<string, CardComHistoricoApi | null>();
  let falhas = 0;
  let falha: string | null = null;
  for (const c of cards) {
    if (falhas >= DESISTE_DEPOIS_DE && falhas === detalhes.size) { detalhes.set(c.id, null); l.lidos++; continue; }
    try {
      detalhes.set(c.id, await api.card(c.id));
    } catch (e) {
      falha ??= e instanceof Error ? e.message : String(e);
      detalhes.set(c.id, null);
      falhas++;
    }
    l.lidos++;
  }
  return { detalhes, falha };
}

// =====================================================================
//  O GESTOR COMO ESTÁ (o estado para o plano)
// =====================================================================

/** O painel de Vendas que recebe, como as regras querem (as etapas com quantas negociações têm). */
async function painelQueRecebe(db: Db, id: string): Promise<PainelDoGestorParaHelena> {
  const [p] = await db.select().from(ticketPanels).where(and(eq(ticketPanels.id, id), isNull(ticketPanels.deletedAt))).limit(1);
  if (!p) throw new NotFound('Painel');
  if (p.kind !== 'vendas') throw new BadRequest(`O painel ${p.name} não é de Vendas: as negociações do Helena vão para um painel de Vendas.`);
  const ajustes = ajustesDoPainelCompletos(p.settings as Partial<AjustesDoPainel>);
  const etapas = await db.select().from(ticketStages).where(and(eq(ticketStages.panelId, p.id), isNull(ticketStages.deletedAt))).orderBy(asc(ticketStages.sortOrder));
  const contagem = await db.select({ stageId: tickets.stageId, n: sql<number>`count(*)::int` }).from(tickets)
    .where(and(eq(tickets.panelId, p.id), isNull(tickets.deletedAt))).groupBy(tickets.stageId);
  const n = new Map(contagem.map((c) => [c.stageId, Number(c.n)]));
  return {
    id: p.id, nome: p.name, sigla: p.key,
    etapas: etapas.map((e) => ({
      id: e.id, nome: e.name, tipo: e.kind as TipoEtapa, resultado: (e.outcome as ResultadoDaVenda | null) ?? null,
      obrigatorios: e.requiredFields as Obrigatorio[], avisar: e.notifyUserIds, negociacoes: n.get(e.id) ?? 0,
    })),
    campos: await carregarCampos(db, p.id),
    motivosDePerda: ajustes.motivosDePerda,
    camposDesligados: ajustes.camposDesligados,
  };
}

async function estadoDoGestor(db: Db, destino: string | null, leitura: LeituraDoHelena, agora = new Date()): Promise<EstadoDoGestorParaHelena> {
  const painel = destino ? await painelQueRecebe(db, destino) : null;
  const siglas = (await db.select({ key: ticketPanels.key }).from(ticketPanels)).map((x) => x.key);
  const painelNovo = { nome: 'Comercial', sigla: siglaDoPainelNovo(leitura.painel.sigla, siglas) };
  const sigla = painel?.sigla ?? painelNovo.sigla;
  // um pedido depois do outro: dentro da transação, a conexão é uma só
  const pessoas = await db.select({ id: users.id, nome: users.name, ativo: users.active }).from(users);
  const cls = await db.select({ id: clients.id, fantasia: clients.tradeName, razao: clients.legalName, cnpj: clients.cnpj }).from(clients)
    .where(and(isNull(clients.deletedAt), eq(clients.isInternal, false)));
  const prods = await db.select({ id: products.id, nome: products.name }).from(products).where(isNull(products.deletedAt));
  // as etiquetas são de cada painel (2.0.3): só as do painel que recebe; o painel novo começa sem nenhuma
  const tags = painel ? await db.select({ nome: ticketTags.name }).from(ticketTags).where(eq(ticketTags.panelId, painel.id)) : [];
  const vieram = await db.select({ id: tickets.id, ref: tickets.externalRef, numero: tickets.number, lixeira: tickets.deletedAt }).from(tickets).where(like(tickets.externalRef, 'helena:%'));
  const codigos = await db.select({ code: tickets.code }).from(tickets).where(like(tickets.code, `${sigla}-%`));
  const vivas = vieram.filter((v) => !v.lixeira).map((v) => v.id);
  // mexida no Gestor: tem histórico que não veio do Helena (alguém moveu, mudou um campo)
  const mexidas = new Set(vivas.length
    ? (await db.selectDistinct({ id: ticketEvents.ticketId }).from(ticketEvents)
      .where(and(inArray(ticketEvents.ticketId, vivas), sql`not (${ticketEvents.data} ? 'helena')`))).map((x) => x.id)
    : []);
  const importadas: EstadoDoGestorParaHelena['importadas'] = {};
  for (const v of vieram) {
    if (!v.ref) continue;
    importadas[v.ref.slice('helena:'.length)] = { id: v.id, numero: v.numero, mexidaNoGestor: mexidas.has(v.id), naLixeira: !!v.lixeira };
  }
  const prefixo = new RegExp(`^${sigla}-(\\d+)$`);
  return {
    painel, painelNovo,
    pessoas: pessoas.map((p) => ({ id: p.id, nome: p.nome, ativo: p.ativo })),
    clientes: cls.map((c) => ({ id: c.id, nomes: [c.fantasia, c.razao].filter(Boolean), cnpj: c.cnpj })),
    produtos: prods,
    etiquetas: tags.map((t) => t.nome),
    importadas,
    numerosOcupados: codigos.map((c) => Number(prefixo.exec(c.code)?.[1] ?? 0)).filter((x) => x > 0),
    hoje: diaDeHoje(agora),
  };
}

/** O dia de hoje em Brasília (AAAA-MM-DD). */
const diaDeHoje = (agora: Date) => new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

// =====================================================================
//  A PRÉVIA E O TRAZER
// =====================================================================

/** A prévia do que vai acontecer: nada é gravado. `destino` nulo = um painel de Vendas novo. */
export async function previa(db: Db, leituraId: string, destino: string | null): Promise<PreviaDoHelena> {
  const leitura = pronta(leituraId);
  return planoDaImportacao(leitura, await estadoDoGestor(db, destino, leitura)).previa;
}

/**
 * Grava o que a prévia mostrou, numa transação: o painel novo (se for o caso), as etapas, os campos, os
 * motivos de perda, as etiquetas e as negociações com o histórico. Devolve a frase da auditoria.
 */
export async function trazer(app: FastifyInstance, ator: Ator, leituraId: string, destino: string | null): Promise<ResultadoDoTrazerDoHelena> {
  const leitura = pronta(leituraId);
  const agora = new Date();
  const pessoa = pessoaDoAtor(ator);
  return app.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    let painelId = destino;
    if (!painelId) painelId = await criarPainel(db, leitura, agora);
    const estado = await estadoDoGestor(db, painelId, leitura, agora);
    const plano = planoDaImportacao(leitura, estado);
    if (plano.previa.erro) throw new BadRequest(plano.previa.erro);
    const painel = estado.painel!;
    // a prévia de quem vê: o painel novo aparece como novo
    const previaFinal: PreviaDoHelena = destino ? plano.previa : { ...plano.previa, destino: { ...plano.previa.destino, novo: true } };

    const idDaEtapa = await gravarEtapas(db, ator, painel, plano, agora);
    const campoDaChave = await gravarCampos(db, painel, plano, agora);
    // os motivos de perda do Helena entram na lista do painel
    const [linha] = await db.select({ settings: ticketPanels.settings }).from(ticketPanels).where(eq(ticketPanels.id, painel.id)).limit(1);
    await db.update(ticketPanels).set({ settings: { ...(linha?.settings as object ?? {}), motivosDePerda: plano.motivosDePerda }, updatedAt: agora }).where(eq(ticketPanels.id, painel.id));
    // as etiquetas como estão no catálogo (a nova entra com a cor de lá)
    const etiquetas = new Map<string, string>();
    const todas = [...new Set(plano.negociacoes.flatMap((n) => n.etiquetas))];
    const doCatalogo = await etiquetasDoCatalogo(db, painelId, todas, plano.coresDasEtiquetas, pessoa);
    for (const nome of todas) etiquetas.set(chaveDaEtiqueta(nome), doCatalogo.find((x) => chaveDaEtiqueta(x) === chaveDaEtiqueta(nome)) ?? nome);

    let maior = 0;
    for (const n of plano.negociacoes) {
      maior = Math.max(maior, n.numero);
      const stageId = idDaEtapa(n.etapa);
      if (!stageId) throw new AppError(500, `A etapa ${n.etapa} não foi criada no painel ${painel.nome}.`);
      const valores: ValoresDosCampos = {};
      for (const [chave, pre] of Object.entries(n.campos)) {
        const campo = campoDaChave.get(chave);
        if (!campo) continue;
        const v = valorDoCampoNoGestor(campo, pre);
        if (v !== null) valores[campo.id] = v;
      }
      const ultimo = n.eventos.reduce((m, e) => (e.em > m ? e.em : m), n.alteradoEm);
      const fechado = n.fechadoEm ? new Date(n.fechadoEm) : null;
      const linhaDoChamado = {
        panelId: painel.id, stageId, title: n.titulo, description: n.descricao, kind: 'chamado',
        clientId: n.clienteId, prospect: n.empresa, origin: 'helena', assigneeId: n.responsavelId, watcherIds: n.observadores,
        productIds: n.produtos, tags: n.etiquetas.map((t) => etiquetas.get(chaveDaEtiqueta(t)) ?? t),
        valueCents: n.valor, productValues: n.valoresDosProdutos, setupCents: n.ativacao, productSetup: n.ativacoesDosProdutos,
        lostReason: n.motivoPerda, resolvedAt: fechado, closedAt: fechado, reopenCount: n.reaberturas,
        lastActivityAt: new Date(ultimo), createdAt: new Date(n.criadoEm), updatedAt: agora, externalRef: REF(n.helenaId),
      };
      let ticketId = n.chamadoId;
      if (ticketId) {
        const [antes] = await db.select({ campos: tickets.customFields, etapa: tickets.stageId }).from(tickets).where(eq(tickets.id, ticketId)).limit(1);
        await db.update(tickets).set({
          ...linhaDoChamado, customFields: { ...((antes?.campos as ValoresDosCampos | null) ?? {}), ...valores },
          // a que mudou de etapa no Helena perde o lugar que tinha no quadro de cá (2.0.4.1); a que ficou, fica nele
          ...(antes?.etapa !== stageId ? { boardPosition: null } : {}),
        }).where(eq(tickets.id, ticketId));
        // o histórico que veio do Helena é refeito; o que a equipe fez no Gestor fica
        await db.delete(ticketEvents).where(and(eq(ticketEvents.ticketId, ticketId), sql`${ticketEvents.data} ? 'helena'`));
      } else {
        ticketId = newId();
        await db.insert(tickets).values({
          id: ticketId, number: n.numero, code: codigoDoChamado(painel.sigla, n.numero), customFields: valores,
          createdById: n.criadoPorId, ...linhaDoChamado,
        });
      }
      const eventos = n.eventos.map((e) => {
        const autor = e.usuarioId ? plano.autores[e.usuarioId] : undefined;
        return {
          id: newId(), ticketId: ticketId!, kind: e.tipo,
          userId: autor?.pessoaId ?? null,
          actorName: autor?.pessoaId ? null : autor ? `${autor.nome} (no Helena)` : 'Helena',
          data: ligarEtapasDoEvento(e.tipo, e.dados, idDaEtapa),
          createdAt: new Date(e.em),
        };
      });
      for (let i = 0; i < eventos.length; i += 500) await db.insert(ticketEvents).values(eventos.slice(i, i + 500));
    }
    // a numeração do painel continua depois do maior número
    await db.update(ticketPanels).set({ nextNumber: sql`greatest(${ticketPanels.nextNumber}, ${maior + 1})` }).where(eq(ticketPanels.id, painel.id));
    return { resumo: resumoDaImportacao(previaFinal), painelId: painel.id, painelNome: painel.nome, sigla: painel.sigla, previa: previaFinal };
  });
}

/** O painel de Vendas novo (como o "Novo painel" de Ajustes faz): os ajustes e os campos de fábrica; as etapas vêm do plano. */
async function criarPainel(db: Db, leitura: LeituraDoHelena, agora: Date): Promise<string> {
  const siglas = (await db.select({ key: ticketPanels.key }).from(ticketPanels)).map((x) => x.key);
  const sigla = siglaDoPainelNovo(leitura.painel.sigla, siglas);
  const id = newId();
  const [ultimo] = await db.select({ n: sql<number>`coalesce(max(${ticketPanels.sortOrder}), -1)::int` }).from(ticketPanels);
  await db.insert(ticketPanels).values({
    id, name: 'Comercial', key: sigla, description: `As negociações do Comercial (trazidas do painel ${leitura.painel.nome}, do Helena).`,
    color: 'signal', kind: 'vendas', access: 'todos', memberIds: [], settings: { ...AJUSTES_DO_PAINEL_DE_VENDAS }, active: true,
    sortOrder: Number(ultimo?.n ?? -1) + 1, createdAt: agora, updatedAt: agora,
  });
  await db.insert(ticketFields).values(CAMPOS_DO_PAINEL_DE_VENDAS.map((c, ordem) => ({
    id: newId(), panelId: id, name: c.nome, kind: c.tipo, help: c.dica, active: true, sortOrder: ordem,
    options: c.opcoes.map((nome) => ({ id: newId(), nome, ativa: true })), inlineOptions: c.tipo === 'lista' && !!c.incluirNaHora,
  })));
  return id;
}

/** As etapas do plano no painel (as que saem só se vazias) e as do histórico, já fora; devolve o nome → id. */
async function gravarEtapas(db: Db, ator: Ator, painel: PainelDoGestorParaHelena, plano: PlanoDaImportacao, agora: Date): Promise<(nome: string) => string | null> {
  const validos = obrigatoriosDoPainel({ camposDesligados: painel.camposDesligados }, painel.campos, 'vendas');
  const etapas: EtapaGravar[] = plano.etapas.etapas.map((e) => ({
    ...(e.id ? { id: e.id } : {}), nome: e.nome, tipo: e.tipo, nivel: null, obrigatorios: e.obrigatorios, avisar: e.avisar, resultado: e.resultado,
  }));
  const planoDasEtapas = await planejarEtapas(db, painel.id, etapas, {}, validos, 'vendas');
  await aplicarEtapas(db as unknown as Tx, ator, planoDasEtapas, agora);
  const existentes = await db.select({ id: ticketStages.id, nome: ticketStages.name, saiu: ticketStages.deletedAt }).from(ticketStages).where(eq(ticketStages.panelId, painel.id));
  // as etapas que só o histórico cita (saíram do Helena): entram já fora do painel (a trajetória precisa delas)
  const faltam = plano.etapas.historicas.filter((n) => !existentes.some((e) => chaveDoNome(e.nome) === chaveDoNome(n)));
  if (faltam.length) {
    await db.insert(ticketStages).values(faltam.map((nome, i) => ({ id: newId(), panelId: painel.id, name: nome, kind: 'andamento', sortOrder: 100 + i, createdAt: agora, deletedAt: agora })));
  }
  const todas = await db.select({ id: ticketStages.id, nome: ticketStages.name, saiu: ticketStages.deletedAt }).from(ticketStages).where(eq(ticketStages.panelId, painel.id));
  return (nome: string) => {
    const k = chaveDoNome(nome);
    return (todas.find((e) => !e.saiu && e.nome === nome) ?? todas.find((e) => !e.saiu && chaveDoNome(e.nome) === k) ?? todas.find((e) => chaveDoNome(e.nome) === k))?.id ?? null;
  };
}

/** Os campos do plano no painel (os novos e as opções que faltavam); devolve a chave do Helena → o campo. */
async function gravarCampos(db: Db, painel: PainelDoGestorParaHelena, plano: PlanoDaImportacao, agora: Date) {
  let ordem = painel.campos.reduce((m, c) => Math.max(m, c.ordem), -1) + 1;
  for (const c of plano.campos) {
    if (c.acao === 'cria') {
      await db.insert(ticketFields).values({
        id: newId(), panelId: painel.id, name: c.nome, kind: c.tipo, help: 'Trazido do Helena.', active: true, sortOrder: ordem++,
        options: c.opcoesNovas.map((nome) => ({ id: newId(), nome, ativa: true })), createdAt: agora, updatedAt: agora,
      });
    } else if (c.acao === 'usa' && c.gestorId && c.opcoesNovas.length && ehLista(c.tipo)) {
      const atual = painel.campos.find((x) => x.id === c.gestorId);
      const opcoes: OpcaoDoCampo[] = [...(atual?.opcoes ?? []), ...c.opcoesNovas.map((nome) => ({ id: newId(), nome, ativa: true }))];
      await db.update(ticketFields).set({ options: opcoes, updatedAt: agora }).where(eq(ticketFields.id, c.gestorId));
    }
  }
  const campos = await carregarCampos(db, painel.id);
  const porChave = new Map<string, (typeof campos)[number]>();
  for (const c of plano.campos) {
    if (c.acao === 'fora') continue;
    const campo = c.gestorId ? campos.find((x) => x.id === c.gestorId) : campos.find((x) => chaveDoNome(x.nome) === chaveDoNome(c.nome));
    if (campo) porChave.set(c.chave, campo);
  }
  return porChave;
}
