/**
 * O RELATÓRIO DE VENDAS (Patch 2.0.1, decisão 0050): os números de um painel de Vendas no período. As
 * contas moram no `@gestor/shared` (as mesmas da prévia); aqui fica o que é do servidor: as negociações
 * do painel (fora da lixeira) e a trajetória de cada uma pelas etapas, montada dos eventos.
 */
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { ticketEvents, tickets } from '@gestor/db';
import {
  passagensDosEventos, passagensNoPainel, relatorioDeVendas,
  type FiltroDoRelatorioDeVendas, type NegociacaoParaRelatorio, type RelatorioDeVendas,
} from '@gestor/shared';
import { BadRequest, NotFound } from '../../plugins/errors.js';
import { carregarContexto, podeVerPainel, type Ator } from './contexto.js';

export async function relatorioDoPainelDeVendas(app: FastifyInstance, ator: Ator, filtro: FiltroDoRelatorioDeVendas): Promise<RelatorioDeVendas> {
  const db = app.db;
  const ctx = await carregarContexto(db);
  const painel = ctx.paineis.find((p) => p.id === filtro.painel) ?? ctx.paineis.find((p) => p.sigla === filtro.painel.trim().toUpperCase());
  if (!painel || !podeVerPainel(painel, ator)) throw new NotFound('Painel');
  if (painel.tipo !== 'vendas') throw new BadRequest(`O painel ${painel.nome} não é de vendas: o relatório de vendas é dos painéis de Vendas.`);

  const linhas = await db.select().from(tickets).where(and(eq(tickets.panelId, painel.id), isNull(tickets.deletedAt)));
  const eventos = linhas.length
    ? await db.select({ ticketId: ticketEvents.ticketId, kind: ticketEvents.kind, data: ticketEvents.data, createdAt: ticketEvents.createdAt }).from(ticketEvents)
      .where(and(inArray(ticketEvents.ticketId, linhas.map((t) => t.id)), inArray(ticketEvents.kind, ['criado', 'etapa'])))
    : [];
  const porChamado = new Map<string, Array<{ tipo: string; em: string; dados: Record<string, any> }>>();
  for (const ev of eventos) {
    const lista = porChamado.get(ev.ticketId) ?? [];
    lista.push({ tipo: ev.kind, em: ev.createdAt.toISOString(), dados: (ev.data as Record<string, any> | null) ?? {} });
    porChamado.set(ev.ticketId, lista);
  }

  // todas as etapas do painel, inclusive as que saíram (a negociação que passou por uma delas continua aqui)
  const doPainel = new Set([...ctx.etapas].filter(([, v]) => v.painelId === painel.id).map(([id]) => id));
  const negociacoes: NegociacaoParaRelatorio[] = linhas.map((t) => {
    const etapa = ctx.etapas.get(t.stageId)?.etapa ?? null;
    const passagens = passagensNoPainel(passagensDosEventos(t.createdAt.toISOString(), t.stageId, porChamado.get(t.id) ?? []), doPainel);
    return {
      id: t.id, codigo: t.code, titulo: t.title,
      empresa: t.clientId ? ctx.clientes.get(t.clientId) ?? null : t.prospect ?? null,
      responsavel: t.assigneeId ? ctx.pessoas.get(t.assigneeId)?.nome ?? null : null,
      valor: t.valueCents ?? null, etapaId: t.stageId,
      // a que veio de outro painel conta de quando entrou neste
      criadoEm: passagens[0]?.desde ?? t.createdAt.toISOString(),
      fechadoEm: t.closedAt?.toISOString() ?? null,
      resultado: etapa?.resultado ?? null,
      motivoPerda: t.lostReason ?? null,
      passagens,
    };
  });
  return relatorioDeVendas(painel, negociacoes, filtro);
}
