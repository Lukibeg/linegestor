/**
 * O RELÓGIO DOS CHAMADOS (Patch 1.10, decisão 0047): o que o Gestor faz sozinho, a cada minuto — como o
 * relógio do envio automático (ligado no `server.ts`, antes do `listen`; os testes não ligam o relógio:
 * chamam `voltaDoRelogioDosChamados` com a hora que quiserem).
 *
 *  1. os agendados que chegaram na hora nascem (origem "agendado", com o checklist do agendado), e a
 *     próxima vez é calculada ("uma vez" desliga);
 *  2. os alertas de prazo: perto de vencer avisa o responsável; vencido avisa o responsável e os
 *     supervisores do painel — uma vez cada (o chamado guarda o que já foi em `alerts_sent`) e com uma
 *     linha no histórico. A conta é a mesma da tela (`estadoDosPrazos`, pelo cartão);
 *  3. o chamado que ficou na entrada sem responsável além do tempo combinado avisa os supervisores (uma
 *     vez). O tempo conta no horário de atendimento: o que chega no sábado à noite avisa na terça às
 *     8h15 (com a segunda feriado), quando há alguém para pegar — e não às 20h15 do sábado;
 *  4. o Resolvido sem resposta do cliente por N dias úteis (os ajustes do painel) fecha sozinho.
 *
 * Uma volta de cada vez (se uma demorar mais de um minuto, a seguinte não começa por cima). Um chamado
 * (ou um agendado) que dá erro não para os outros: vai para o log e a volta segue.
 */
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { ticketSchedules, ticketStages, tickets } from '@gestor/db';
import {
  alertasDevidos, duracaoDoPrazo, filhosQueTravam, minutosUteisEntre, proximaExecucao, somarDiasUteis, textoDoPrazo,
  type AlertaPrazo, type EstadoPrazo, type EtapaPainel,
} from '@gestor/shared';
import { AppError } from '../../plugins/errors.js';
import * as audit from '../audit.js';
import { avisarEquipe, avisarObservadores } from './avisos.js';
import { carregarContexto, cartaoDaLinha, lerPrazos, registrarEvento, type Ator, type Contexto, type LinhaChamado, type Parentes } from './contexto.js';
import { filhosDoChamado } from './leitura.js';
import { criarDoAgendado, lerRegra } from './rotina.js';
import { emitir } from './webhooks.js';

/** Quem abre o chamado do agendado na hora marcada: o próprio Gestor (sem pessoa; o histórico mostra "Gestor"). */
const GESTOR: Ator = { tipo: 'integracao', id: 'relogio-dos-chamados', nome: 'Gestor' };

/** O que uma volta fez (para o log e para os testes). */
export type VoltaDoRelogio = {
  /** os códigos dos chamados que os agendados abriram */
  agendados: string[];
  /** quantos alertas de prazo saíram */
  alertas: number;
  /** quantos "sem responsável" saíram */
  semDono: number;
  /** os códigos dos que fecharam sozinhos */
  fechados: string[];
  /** quantas coisas deram erro (cada uma foi para o log) */
  erros: number;
};

/** As horas dos eventos de uma volta: cada uma um milésimo depois da outra (o histórico fica na ordem). */
function horas(agora: Date) {
  let n = 0;
  return () => new Date(agora.getTime() + n++);
}
const etapaCurta = (e: EtapaPainel | null) => (e ? { id: e.id, nome: e.nome, nivel: e.nivel } : null);

let ocupado = false;

/**
 * Uma volta do relógio. Devolve o que fez, ou `null` quando a volta anterior ainda não terminou.
 * `agora`: a hora da volta (os testes adiantam o relógio; o servidor usa a de verdade).
 */
export async function voltaDoRelogioDosChamados(app: FastifyInstance, agora: Date = new Date()): Promise<VoltaDoRelogio | null> {
  if (ocupado) return null;
  ocupado = true;
  const volta: VoltaDoRelogio = { agendados: [], alertas: 0, semDono: 0, fechados: [], erros: 0 };
  try {
    // cada tarefa por conta própria: a que falhar inteira (o banco piscou) não segura as outras
    const tarefas: Array<[string, (app: FastifyInstance, agora: Date, volta: VoltaDoRelogio) => Promise<void>]> = [
      ['agendados', nascerAgendados], ['prazos e sem responsável', vigiarAbertos], ['fechar sozinho', fecharResolvidos],
    ];
    for (const [nome, tarefa] of tarefas) {
      try { await tarefa(app, agora, volta); } catch (err) { volta.erros++; app.log.error({ err }, `chamados: o relógio falhou (${nome})`); }
    }
    if (volta.agendados.length || volta.alertas || volta.semDono || volta.fechados.length || volta.erros) app.log.info({ ...volta }, 'chamados: volta do relógio');
    return volta;
  } finally {
    ocupado = false;
  }
}

/** A cada minuto (o primeiro, 40 segundos depois de ligar, para não disputar com a subida do servidor). */
export function iniciarRelogioDosChamados(app: FastifyInstance) {
  app.log.info('chamados: relógio ligado (agendados, prazos, sem responsável e fechar sozinho, a cada minuto)');
  setTimeout(() => void voltaDoRelogioDosChamados(app), 40_000);
  setInterval(() => void voltaDoRelogioDosChamados(app), 60_000);
}

// =====================================================================
//  1. OS AGENDADOS
// =====================================================================

async function nascerAgendados(app: FastifyInstance, agora: Date, volta: VoltaDoRelogio) {
  const vencidos = await app.db.select().from(ticketSchedules)
    .where(and(isNull(ticketSchedules.deletedAt), eq(ticketSchedules.active, true), isNotNull(ticketSchedules.nextRunAt), lte(ticketSchedules.nextRunAt, agora)))
    .orderBy(asc(ticketSchedules.nextRunAt));
  if (!vencidos.length) return;
  const { calendario } = await lerPrazos(app.db);
  for (const a of vencidos) {
    const regra = lerRegra(a.rule);
    // a próxima vez sai de agora (e não da vez que venceu): com o sistema fora do ar por três dias, o
    // agendado diário abre um chamado na volta, e não três
    const depois = regra.frequencia === 'uma_vez' ? { nextRunAt: null, active: false } : { nextRunAt: proximaExecucao(regra, agora, calendario) };
    try {
      // a vez é reservada antes de criar: se algo falhasse depois do chamado criado, a volta seguinte
      // não abriria outro. Se alguém salvou (ou desligou) o agendado no meio da volta, vale o que ficou.
      const [reservado] = await app.db.update(ticketSchedules).set(depois)
        .where(and(eq(ticketSchedules.id, a.id), isNull(ticketSchedules.deletedAt), eq(ticketSchedules.active, true), lte(ticketSchedules.nextRunAt, agora)))
        .returning({ id: ticketSchedules.id });
      if (!reservado) continue;
      let r: { id: string; codigo: string };
      try {
        r = await criarDoAgendado(app, a, GESTOR);
      } catch (err) {
        volta.erros++;
        if (err instanceof AppError && err.status < 500) {
          // um problema do cadastro (o painel desativado, o assunto que saiu, o responsável desativado):
          // tentar de novo a cada minuto não resolve — fica para a próxima vez, e a auditoria conta por quê
          app.log.warn({ agendado: a.id, motivo: err.message }, 'chamados: o agendado não abriu o chamado');
          await audit.record(app.db, { userId: null, action: 'update', entityType: 'ticket_schedule', entityId: a.id, summary: `O agendado "${a.title}" não abriu o chamado: ${err.message}` }, app.log);
        } else {
          // um erro de passagem (o banco piscou) antes de o chamado nascer: devolve a vez, a próxima volta tenta de novo
          await app.db.update(ticketSchedules).set({ nextRunAt: a.nextRunAt, active: a.active }).where(eq(ticketSchedules.id, a.id)).catch(() => undefined);
          app.log.error({ err, agendado: a.id }, 'chamados: o agendado falhou (tenta de novo na próxima volta)');
        }
        continue;
      }
      // o chamado nasceu: daqui em diante nada devolve a vez (devolver abriria outro chamado na volta seguinte)
      volta.agendados.push(r.codigo);
      await app.db.update(ticketSchedules).set({ lastRunAt: agora, lastTicketCode: r.codigo }).where(eq(ticketSchedules.id, a.id))
        .catch((err) => app.log.error({ err, agendado: a.id }, 'chamados: não gravou a última vez do agendado'));
      await audit.record(app.db, { userId: null, action: 'create', entityType: 'ticket', entityId: r.id, summary: `O agendado "${a.title}" abriu ${r.codigo}` }, app.log);
    } catch (err) {
      volta.erros++;
      app.log.error({ err, agendado: a.id }, 'chamados: o agendado falhou');
    }
  }
}

// =====================================================================
//  2 e 3. OS PRAZOS E O SEM RESPONSÁVEL
// =====================================================================

/** O cartão só é usado pelos prazos: as contagens de filhos e anotações não importam aqui. */
const SEM_PARENTES: Parentes = { filhos: new Map(), incidentes: new Map(), anotacoes: new Map(), codigos: new Map() };
const NOME_DO_PRAZO = { resposta: 'resposta', solucao: 'solução' } as const;
const qualPrazo = (a: AlertaPrazo) => (a.startsWith('resposta') ? 'resposta' : 'solucao') as 'resposta' | 'solucao';
const uteis = (e: EstadoPrazo) => (e.conta === 'uteis' ? ' úteis' : '');
const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** A linha do histórico: "o prazo de resposta chegou a 80%: faltam 6 min úteis (vence às 10:36)". */
function textoNoHistorico(a: AlertaPrazo, prazos: Record<'resposta' | 'solucao', EstadoPrazo>, agora: Date): string {
  const qual = qualPrazo(a);
  const e = prazos[qual];
  return a.endsWith('_perto')
    ? `o prazo de ${NOME_DO_PRAZO[qual]} chegou a ${e.percentual}%: ${minuscula(textoDoPrazo(e, agora))}`
    : `o prazo de ${NOME_DO_PRAZO[qual]} venceu (era de ${duracaoDoPrazo(e.limite)}${uteis(e)})`;
}
/** O aviso (o sininho e o WhatsApp da equipe): "O prazo de solução do SUP-12 venceu". */
function textoNoAviso(a: AlertaPrazo, codigo: string, prazos: Record<'resposta' | 'solucao', EstadoPrazo>, agora: Date): string {
  const qual = qualPrazo(a);
  return a.endsWith('_perto')
    ? `O prazo de ${NOME_DO_PRAZO[qual]} do ${codigo} está perto de vencer: ${minuscula(textoDoPrazo(prazos[qual], agora))}`
    : `O prazo de ${NOME_DO_PRAZO[qual]} do ${codigo} venceu`;
}

async function vigiarAbertos(app: FastifyInstance, agora: Date, volta: VoltaDoRelogio) {
  const ctx = await carregarContexto(app.db, agora);
  const abertos = await app.db.select({ t: tickets }).from(tickets).innerJoin(ticketStages, eq(ticketStages.id, tickets.stageId))
    .where(and(isNull(tickets.deletedAt), inArray(ticketStages.kind, ['entrada', 'andamento'])));
  for (const { t } of abertos) {
    try {
      const r = await vigiarUm(app, ctx, t, agora);
      volta.alertas += r.alertas;
      if (r.semDono) volta.semDono++;
    } catch (err) {
      volta.erros++;
      app.log.error({ err, chamado: t.code }, 'chamados: o alerta do chamado falhou');
    }
  }
}

/**
 * Os alertas de um chamado aberto. Grava primeiro (o que foi mandado e a linha do histórico) e avisa
 * depois: se o aviso falhar, ele não sai de novo a cada minuto.
 */
async function vigiarUm(app: FastifyInstance, ctx: Contexto, t: LinhaChamado, agora: Date): Promise<{ alertas: number; semDono: boolean }> {
  const painel = ctx.paineis.find((p) => p.id === t.panelId);
  const etapa = ctx.etapas.get(t.stageId)?.etapa;
  if (!painel || !etapa) return { alertas: 0, semDono: false };
  const ja = { ...((t.alertsSent as Record<string, string> | null) ?? {}) };
  const { prazos } = cartaoDaLinha(t, ctx, SEM_PARENTES);
  const devidos = alertasDevidos(prazos, ja);
  const semDono = etapa.tipo === 'entrada' && !t.assigneeId && !ja.sem_dono
    && minutosUteisEntre(t.createdAt, agora, ctx.prazos.calendario) > ctx.prazos.semDonoMinutos;
  if (!devidos.length && !semDono) return { alertas: 0, semDono: false };

  const marca = agora.toISOString();
  const mandados = { ...ja, ...Object.fromEntries(devidos.map((a) => [a, marca])), ...(semDono ? { sem_dono: marca } : {}) };
  const quando = horas(agora);
  await app.db.transaction(async (tx) => {
    await tx.update(tickets).set({ alertsSent: mandados }).where(eq(tickets.id, t.id));
    for (const a of devidos) await registrarEvento(tx, t.id, 'prazo', null, { alerta: a, texto: textoNoHistorico(a, prazos, agora) }, quando());
  });

  const chamado = { id: t.id, codigo: t.code, titulo: t.title };
  for (const a of devidos) {
    const vencido = a.endsWith('_vencida');
    await avisarEquipe(app, {
      evento: vencido ? 'prazo_vencido' : 'prazo_perto',
      para: vencido ? [t.assigneeId, ...painel.ajustes.supervisores] : [t.assigneeId],
      chamado, texto: textoNoAviso(a, t.code, prazos, agora),
    });
  }
  if (semDono) {
    await avisarEquipe(app, { evento: 'sem_dono', para: painel.ajustes.supervisores, chamado, texto: `O ${t.code} está sem responsável há mais de ${duracaoDoPrazo(ctx.prazos.semDonoMinutos)}` });
  }
  return { alertas: devidos.length, semDono };
}

// =====================================================================
//  4. O RESOLVIDO QUE FECHA SOZINHO
// =====================================================================

async function fecharResolvidos(app: FastifyInstance, agora: Date, volta: VoltaDoRelogio) {
  const ctx = await carregarContexto(app.db, agora);
  const resolvidos = await app.db.select({ t: tickets }).from(tickets).innerJoin(ticketStages, eq(ticketStages.id, tickets.stageId))
    .where(and(isNull(tickets.deletedAt), eq(ticketStages.kind, 'resolvido'), isNotNull(tickets.resolvedAt)));
  for (const { t } of resolvidos) {
    try {
      if (await fecharUm(app, ctx, t, agora)) volta.fechados.push(t.code);
    } catch (err) {
      volta.erros++;
      app.log.error({ err, chamado: t.code }, 'chamados: fechar sozinho falhou');
    }
  }
}

/**
 * Leva para a primeira etapa "fechado" do painel o Resolvido que passou dos dias úteis combinados. O
 * Gestor fecha sem conferir os obrigatórios (ninguém vai preencher: o cliente não respondeu), mas
 * respeita o pai que espera os filhos — fecha numa volta seguinte, quando os filhos fecharem.
 */
async function fecharUm(app: FastifyInstance, ctx: Contexto, t: LinhaChamado, agora: Date): Promise<boolean> {
  const painel = ctx.paineis.find((p) => p.id === t.panelId);
  const dias = painel?.ajustes.fecharSozinhoDias;
  if (!painel || !dias || !t.resolvedAt) return false;
  if (somarDiasUteis(t.resolvedAt, dias, ctx.prazos.calendario).getTime() > agora.getTime()) return false;
  const para = painel.etapas.find((e) => e.tipo === 'fechado');
  if (!para) return false;
  if (filhosQueTravam(await filhosDoChamado(app.db, ctx, t.id), para, painel.ajustes.paiEsperaFilhos).length) return false;
  const de = ctx.etapas.get(t.stageId)?.etapa ?? null;
  const quando = horas(agora);
  const fechou = await app.db.transaction(async (tx) => {
    // só se continua onde estava: alguém pode ter mexido no chamado no meio da volta
    const r = await tx.update(tickets).set({ stageId: para.id, closedAt: agora, updatedAt: agora, lastActivityAt: agora })
      .where(and(eq(tickets.id, t.id), eq(tickets.stageId, t.stageId), isNull(tickets.deletedAt))).returning({ id: tickets.id });
    if (!r.length) return false;
    // o movimento também vai como "etapa": a trajetória (e os relatórios) leem a mudança de etapa daí
    await registrarEvento(tx, t.id, 'etapa', null, { de: etapaCurta(de), para: etapaCurta(para), motivo: null, sentido: null }, quando());
    await registrarEvento(tx, t.id, 'fechou_sozinho', null, { dias, etapa: de?.nome ?? 'Resolvido' }, quando());
    return true;
  });
  if (!fechou) return false;

  // depois de gravado, o que o mover também faz: quem a etapa avisa, o pai (quando um filho fecha) e os webhooks
  const chamado = { id: t.id, codigo: t.code, titulo: t.title };
  if (para.avisar.length) await avisarEquipe(app, { evento: 'etapa', para: para.avisar, chamado, texto: `${t.code} chegou em ${para.nome}` });
  await avisarObservadores(app, {
    chamado, observadores: t.watcherIds, jaAvisados: para.avisar,
    texto: `O ${t.code} fechou sozinho: ${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'} no ${de?.nome ?? 'Resolvido'} sem resposta do cliente`,
  });
  if (t.parentId) {
    const [pai] = await app.db.select({ id: tickets.id, code: tickets.code, title: tickets.title, assigneeId: tickets.assigneeId }).from(tickets)
      .where(and(eq(tickets.id, t.parentId), isNull(tickets.deletedAt))).limit(1);
    if (pai?.assigneeId) {
      await avisarEquipe(app, { evento: 'etapa', tipo: 'pai', para: [pai.assigneeId], chamado: { id: pai.id, codigo: pai.code, titulo: pai.title }, texto: `O filho ${t.code} do ${pai.code} foi fechado` });
    }
  }
  emitir(app, 'chamado.movido', t.id, { de: de ? { id: de.id, nome: de.nome } : null, para: { id: para.id, nome: para.nome } });
  emitir(app, 'chamado.fechado', t.id);
  await audit.record(app.db, {
    userId: null, action: 'update', entityType: 'ticket', entityId: t.id,
    summary: `${t.code} fechou sozinho: ${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'} no ${de?.nome ?? 'Resolvido'} sem resposta do cliente`,
  }, app.log);
  return true;
}
