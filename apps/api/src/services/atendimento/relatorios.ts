/**
 * OS RELATÓRIOS DOS PAINÉIS DE CHAMADOS (Patch 2.0.5, decisão 0055): o módulo novo de relatórios, sobre os
 * chamados do Gestor (os do Helena ficam no Legado, em `services/chamados.ts`). As contas moram no
 * `@gestor/shared` (as mesmas da prévia); aqui fica o que é do servidor: montar a base de cada chamado do
 * painel (a trajetória pelas etapas e as subidas de nível, dos eventos; os protocolos na operadora; o tempo
 * lançado; o "repete"), o tamanho dos clientes no Gestor e a arrumação da página (por painel).
 */
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { devices, dids, products, subscriptions, ticketCarrierCases, ticketEvents, ticketLinks, ticketTimeEntries, tickets } from '@gestor/db';
import {
  ArrumacaoDosRelatoriosSchema, CATALOGO_DOS_RELATORIOS, arrumacaoCompleta, campoLigado, passagensDosEventos, passagensNoPainel, relatoriosDoPainel, situacaoDaEtapa,
  type ArrumacaoDosRelatorios, type ArrumacaoDosRelatoriosLida, type ChamadoParaRelatorios, type ClienteParaRelatorio, type ContextoDosRelatorios, type Espera, type FiltroDosRelatorios,
  type Gravidade, type Alcance, type Nivel, type Origem, type Painel, type Prioridade, type RelatoriosDoPainel, type TipoChamado, type ValoresDosCampos,
} from '@gestor/shared';
import { BadRequest, NotFound } from '../../plugins/errors.js';
import * as integ from '../integracoes.js';
import { carregarContexto, podeVerPainel, type Ator, type Contexto } from './contexto.js';

/** O painel de Gestão pelo id ou pela sigla, conferindo se a pessoa o vê. */
function painelDosRelatorios(ctx: Contexto, ator: Ator, ref: string): Painel {
  const painel = ctx.paineis.find((p) => p.id === ref) ?? ctx.paineis.find((p) => p.sigla === ref.trim().toUpperCase());
  if (!painel || !podeVerPainel(painel, ator)) throw new NotFound('Painel');
  if (painel.tipo === 'vendas') throw new BadRequest(`O painel ${painel.nome} é de vendas: ele tem o relatório de vendas.`);
  return painel;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * A base dos relatórios de um painel: cada chamado (fora da lixeira) do jeito que a conta precisa, e o
 * contexto (as etapas, os assuntos, os campos de lista, os nomes, o tamanho dos clientes e os prazos).
 */
export async function baseDosRelatorios(app: FastifyInstance, ctx: Contexto, painel: Painel, campoDaFalha: string | null): Promise<{ chamados: ChamadoParaRelatorios[]; contexto: ContextoDosRelatorios }> {
  const db = app.db;
  const linhas = await db.select().from(tickets).where(and(eq(tickets.panelId, painel.id), isNull(tickets.deletedAt)));
  const ids = linhas.map((t) => t.id);
  const [eventos, casos, tempos, repete] = ids.length ? await Promise.all([
    db.select({ ticketId: ticketEvents.ticketId, kind: ticketEvents.kind, data: ticketEvents.data, userId: ticketEvents.userId, createdAt: ticketEvents.createdAt }).from(ticketEvents)
      .where(and(inArray(ticketEvents.ticketId, ids), inArray(ticketEvents.kind, ['criado', 'etapa']))),
    db.select().from(ticketCarrierCases).where(inArray(ticketCarrierCases.ticketId, ids)),
    db.select().from(ticketTimeEntries).where(and(inArray(ticketTimeEntries.ticketId, ids), isNull(ticketTimeEntries.deletedAt))),
    db.select({ fromId: ticketLinks.fromId, toId: ticketLinks.toId }).from(ticketLinks)
      .where(and(inArray(ticketLinks.fromId, ids), eq(ticketLinks.kind, 'repete'), isNull(ticketLinks.deletedAt))),
  ]) : [[], [], [], []];

  const agrupar = <T extends { ticketId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(x.ticketId, [...(m.get(x.ticketId) ?? []), x]);
    return m;
  };
  const eventosDe = agrupar(eventos);
  const casosDe = agrupar(casos);
  const temposDe = agrupar(tempos);
  const repeteDe = new Map<string, string[]>();
  for (const l of repete) repeteDe.set(l.fromId, [...(repeteDe.get(l.fromId) ?? []), l.toId]);

  // todas as etapas do painel, inclusive as que saíram (o chamado que passou por uma delas continua aqui)
  const etapasDoPainel = [...ctx.etapas].filter(([, v]) => v.painelId === painel.id);
  const doPainel = new Set(etapasDoPainel.map(([id]) => id));
  const usa = (c: Parameters<typeof campoLigado>[1]) => campoLigado(painel.ajustes, c);
  const camposDeLista = ctx.campos.filter((c) => c.painelId === painel.id && (c.tipo === 'lista' || c.tipo === 'lista_varios'));

  const chamados: ChamadoParaRelatorios[] = linhas.map((t) => {
    const evs = (eventosDe.get(t.id) ?? []).map((e) => ({ tipo: e.kind, em: e.createdAt.toISOString(), dados: (e.data as Record<string, any> | null) ?? {}, porId: e.userId }));
    const passagens = passagensNoPainel(passagensDosEventos(t.createdAt.toISOString(), t.stageId, evs), doPainel);
    const subidas = evs.filter((e) => e.tipo === 'etapa' && (e.dados.sentido === 'sobe' || e.dados.sentido === 'desce'))
      .sort((a, b) => a.em.localeCompare(b.em))
      .map((e) => ({
        em: e.em, de: (e.dados.de?.nivel as Nivel | null | undefined) ?? null, para: (e.dados.para?.nivel as Nivel | null | undefined) ?? null,
        sentido: e.dados.sentido as 'sobe' | 'desce', motivo: (e.dados.motivo as string | null | undefined) ?? null, porId: e.porId,
      }));
    const valores = (t.customFields as ValoresDosCampos | null) ?? {};
    return {
      id: t.id, codigo: t.code, titulo: t.title, tipoChamado: t.kind as TipoChamado,
      etapaId: t.stageId, situacao: situacaoDaEtapa(ctx.etapas.get(t.stageId)?.etapa.tipo ?? 'andamento'),
      criadoEm: t.createdAt.toISOString(), respondidoEm: iso(t.firstResponseAt), resolvidoEm: iso(t.resolvedAt ?? t.closedAt), fechadoEm: iso(t.closedAt),
      ultimaAtividadeEm: t.lastActivityAt.toISOString(),
      responsavelId: t.assigneeId, clienteId: t.clientId,
      // o campo do sistema que o painel desligou não entra (o valor fica guardado no chamado, como na tela)
      assuntoId: usa('assunto') ? t.subjectId : null,
      tipo: usa('tipo') ? t.type : null,
      gravidade: usa('gravidade') ? (t.severity as Gravidade | null) ?? null : null,
      alcance: usa('alcance') ? (t.reach as Alcance | null) ?? null : null,
      prioridade: (t.priority as Prioridade | null) ?? null,
      prioridadeTrocada: !!t.priorityReason,
      produtos: usa('produtos') ? t.productIds : [],
      operadoras: usa('operadoras') ? t.carrierIds : [],
      etiquetas: t.tags,
      campos: Object.fromEntries(camposDeLista.filter((c) => valores[c.id] !== undefined).map((c) => [c.id, valores[c.id]!])),
      temSolucao: !!t.solution?.trim(), temCausa: !!t.cause?.trim(),
      esperas: (t.waits as Espera[] | null) ?? [],
      passagens, subidas,
      reaberto: t.reopenCount, origem: t.origin as Origem,
      problemaId: t.problemId,
      repete: repeteDe.get(t.id) ?? [],
      casos: (casosDe.get(t.id) ?? []).map((c) => ({
        operadora: (c.carrierId ? ctx.operadoras.get(c.carrierId) : null) ?? c.carrierName,
        abertoEm: c.openedAt.toISOString(), prometidoPara: iso(c.promisedAt), fechadoEm: iso(c.closedAt),
      })),
      tempos: (temposDe.get(t.id) ?? []).map((x) => ({ minutos: x.minutes, dia: x.workedOn, pessoaId: x.userId })),
    };
  });

  return { chamados, contexto: { ...(await nomesEClientes(app, ctx, linhas.map((t) => t.clientId))), ...contextoDoPainel(ctx, painel, campoDaFalha) } };
}

/** O que o contexto tem do painel e do módulo (sem tocar no banco). */
function contextoDoPainel(ctx: Contexto, painel: Painel, campoDaFalha: string | null): Omit<ContextoDosRelatorios, 'clientes'> {
  const usa = (c: Parameters<typeof campoLigado>[1]) => campoLigado(painel.ajustes, c);
  return {
    painel: {
      id: painel.id, nome: painel.nome, sigla: painel.sigla, contaPrazo: painel.ajustes.contaPrazo,
      usa: { assunto: usa('assunto'), tipo: usa('tipo'), gravidade: usa('gravidade'), produtos: usa('produtos'), operadoras: usa('operadoras') },
    },
    etapas: [...ctx.etapas].filter(([, v]) => v.painelId === painel.id).map(([id, v]) => ({ id, nome: v.etapa.nome, tipo: v.etapa.tipo, nivel: v.etapa.nivel, ordem: v.ordem, ativa: !v.saiu })),
    assuntos: ctx.assuntos.filter((a) => a.painelId === painel.id).map((a) => ({ id: a.id, paiId: a.paiId, nome: a.nome, ordem: a.ordem, ativo: a.ativo })),
    campos: ctx.campos.filter((c) => c.painelId === painel.id && (c.tipo === 'lista' || c.tipo === 'lista_varios'))
      .map((c) => ({ id: c.id, nome: c.nome, opcoes: c.opcoes.map((o) => ({ id: o.id, nome: o.nome })), ativo: c.ativo })),
    pessoas: new Map([...ctx.pessoas].map(([id, p]) => [id, p.nome])),
    produtos: new Map([...ctx.produtos].map(([id, p]) => [id, p.nome])),
    operadoras: ctx.operadoras,
    prazos: ctx.prazos,
    campoDaFalha,
  };
}

/**
 * O tamanho de cada cliente dos chamados no Gestor, como na ficha e no Legado: os DIDs, os aparelhos com
 * ele (os vendidos não contam) e os produtos que ele assina.
 */
async function nomesEClientes(app: FastifyInstance, ctx: Contexto, clientesDosChamados: Array<string | null>): Promise<Pick<ContextoDosRelatorios, 'clientes'>> {
  const ids = [...new Set(clientesDosChamados.filter((x): x is string => !!x))];
  if (!ids.length) return { clientes: new Map() };
  const db = app.db;
  const [porDids, porAparelhos, assinaturas] = await Promise.all([
    db.select({ id: dids.clientId, n: sql<number>`count(*)::int` }).from(dids)
      .where(and(inArray(dids.clientId, ids), isNull(dids.deletedAt))).groupBy(dids.clientId),
    db.select({ id: devices.clientId, n: sql<number>`count(*)::int` }).from(devices)
      .where(and(inArray(devices.clientId, ids), isNull(devices.deletedAt), sql`coalesce(${devices.currentModality}, '') <> 'venda'`)).groupBy(devices.clientId),
    db.selectDistinct({ clienteId: subscriptions.clientId, nome: products.name, ordem: products.sortOrder })
      .from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId))
      .where(and(inArray(subscriptions.clientId, ids), isNull(subscriptions.deactivatedAt), isNull(products.deletedAt)))
      .orderBy(asc(products.sortOrder)),
  ]);
  const nDids = new Map(porDids.map((x) => [x.id!, Number(x.n)]));
  const nAparelhos = new Map(porAparelhos.map((x) => [x.id!, Number(x.n)]));
  const produtos = new Map<string, string[]>();
  for (const a of assinaturas) produtos.set(a.clienteId, [...(produtos.get(a.clienteId) ?? []), a.nome]);
  return {
    clientes: new Map(ids.map((id): [string, ClienteParaRelatorio] => [id, {
      nome: ctx.clientes.get(id) ?? '(cliente removido)', dids: nDids.get(id) ?? 0, aparelhos: nAparelhos.get(id) ?? 0, produtos: produtos.get(id) ?? [],
    }])),
  };
}

/** Os 25 relatórios de um painel de chamados, com os filtros da tela. */
export async function relatoriosDoPainelDeChamados(app: FastifyInstance, ator: Ator, filtro: FiltroDosRelatorios): Promise<RelatoriosDoPainel> {
  const ctx = await carregarContexto(app.db);
  const painel = painelDosRelatorios(ctx, ator, filtro.painel);
  const arrumacao = await lerArrumacaoGuardada(app, painel.id);
  const { chamados, contexto } = await baseDosRelatorios(app, ctx, painel, arrumacao.campoDaFalha);
  return relatoriosDoPainel(chamados, contexto, filtro, ctx.agora);
}

// =====================================================================
//  A ARRUMAÇÃO (o Organizar): por painel, a mesma para a equipe toda
// =====================================================================

type ArrumacaoGuardada = ArrumacaoDosRelatorios & { atualizadoEm?: string | null; atualizadoPor?: string | null };
type AjustesDosRelatorios = { paineis: Record<string, ArrumacaoGuardada> };

export type ArrumacaoLida = ArrumacaoDosRelatoriosLida;

async function lerArrumacaoGuardada(app: FastifyInstance, painelId: string): Promise<ArrumacaoGuardada> {
  const { valor } = await integ.ler<AjustesDosRelatorios>(app.db, 'atendimento-relatorios');
  const guardada = valor?.paineis?.[painelId];
  // guardada estragada (ou com um relatório que saiu do catálogo) não derruba a página
  const ok = ArrumacaoDosRelatoriosSchema.safeParse(guardada ?? {});
  return { ...arrumacaoCompleta(ok.success ? ok.data : null), atualizadoEm: guardada?.atualizadoEm ?? null, atualizadoPor: guardada?.atualizadoPor ?? null };
}

export async function lerArrumacao(app: FastifyInstance, ator: Ator, painelRef: string): Promise<ArrumacaoLida> {
  const ctx = await carregarContexto(app.db);
  const painel = painelDosRelatorios(ctx, ator, painelRef);
  const a = await lerArrumacaoGuardada(app, painel.id);
  return {
    ordem: a.ordem, ocultos: a.ocultos, favoritos: a.favoritos, campoDaFalha: a.campoDaFalha,
    atualizadoEm: a.atualizadoEm ?? null, atualizadoPor: a.atualizadoPor ?? null,
    campos: ctx.campos.filter((c) => c.painelId === painel.id && (c.tipo === 'lista' || c.tipo === 'lista_varios')).map((c) => ({ id: c.id, nome: c.nome, ativo: c.ativo })),
  };
}

export async function gravarArrumacao(app: FastifyInstance, ator: Ator & { tipo: 'pessoa' }, painelRef: string, nova: ArrumacaoDosRelatorios): Promise<{ antes: ArrumacaoLida; depois: ArrumacaoLida; resumo: string }> {
  const ctx = await carregarContexto(app.db);
  const painel = painelDosRelatorios(ctx, ator, painelRef);
  const limpa = arrumacaoCompleta(nova);
  if (limpa.campoDaFalha && !ctx.campos.some((c) => c.id === limpa.campoDaFalha && c.painelId === painel.id && (c.tipo === 'lista' || c.tipo === 'lista_varios'))) {
    throw new BadRequest('O campo escolhido para "De quem é a falha?" não é um campo de lista deste painel.');
  }
  const antes = await lerArrumacao(app, ator, painel.id);
  const { valor } = await integ.ler<AjustesDosRelatorios>(app.db, 'atendimento-relatorios');
  const paineis = { ...(valor?.paineis ?? {}), [painel.id]: { ...limpa, atualizadoEm: new Date().toISOString(), atualizadoPor: ator.nome } };
  await integ.gravar(app.db, 'atendimento-relatorios', { paineis }, { userId: ator.id });
  const depois = await lerArrumacao(app, ator, painel.id);
  const total = CATALOGO_DOS_RELATORIOS.length;
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const campo = depois.campoDaFalha ? depois.campos.find((c) => c.id === depois.campoDaFalha)?.nome ?? null : null;
  const resumo = `${ator.nome} arrumou os Relatórios do painel ${painel.nome} para a equipe (${total - depois.ocultos.length} à vista, ${plural(depois.ocultos.length, 'escondido', 'escondidos')}, ${plural(depois.favoritos.length, 'favorito', 'favoritos')}${campo ? `; a falha sai do campo ${campo}` : ''})`;
  return { antes, depois, resumo };
}
