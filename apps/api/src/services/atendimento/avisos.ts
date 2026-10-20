/**
 * Os avisos da equipe (Patch 2.0): na tela (o sininho, `ticket_notifications`) e no WhatsApp da
 * equipe, conforme os Ajustes do módulo (quem recebe o quê, e por onde). Quem fez a ação não recebe
 * aviso do que ele mesmo fez.
 *
 * O WhatsApp sai em segundo plano: a tela não espera a API do LineChat responder. Os testes esperam
 * com `esperarSegundoPlano()`.
 */
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { clients, newId, ticketNotifications, ticketPanels, ticketStages, ticketSubjects, tickets, users } from '@gestor/db';
import {
  EVENTOS_AVISO_PADRAO, NOME_PRIORIDADE, caminhoDoAssunto, modeloDoAviso, preencherAviso,
  type EventoAviso, type Prioridade, type TipoAviso, type ValoresDoAviso,
} from '@gestor/shared';
import { enderecoPublico } from '../envio.js';
import { registrarEvento } from './contexto.js';
import { lerAvisos, mandarWhatsApp, whatsAppPronto } from './whatsapp.js';

const pendentes = new Set<Promise<unknown>>();

/** Roda sem a tela esperar; o erro vai para o log (nunca derruba o pedido). */
export function emSegundoPlano(app: Pick<FastifyInstance, 'log'>, tarefa: () => Promise<unknown>) {
  const p = tarefa().catch((e) => app.log.error({ err: e }, 'chamados: tarefa em segundo plano falhou'));
  pendentes.add(p);
  void p.finally(() => pendentes.delete(p));
}
/** Para os testes: espera tudo o que está em segundo plano terminar. */
export async function esperarSegundoPlano() {
  while (pendentes.size) await Promise.allSettled([...pendentes]);
}

/** O começo de um texto, para caber num aviso ("…" no fim quando corta). */
export const trecho = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

/** O endereço do chamado no Gestor (vai no aviso do WhatsApp). */
export const linkDoChamado = (app: FastifyInstance, codigo: string) => `${enderecoPublico(app)}/atendimento/${encodeURIComponent(codigo)}`;

/**
 * O que a ação conta para a mensagem do WhatsApp (2.0.2: a mensagem de cada aviso, em Avisos e WhatsApp):
 * `quem` fez, a `nota` (a anotação inteira), a `novidade` (no do observador: o que mudou, sem quem fez;
 * na anotação, vazia) e o `aviso` (a frase do sininho sem o trecho da nota, que vai na {nota}).
 */
export type DoAviso = { quem?: string | null; nota?: string | null; novidade?: string | null; aviso?: string | null };

/** A nota no WhatsApp: inteira até 1.500 letras (o resto fica no chamado). */
const MAX_NOTA_NO_WHATSAPP = 1500;

/** As variáveis do chamado na mensagem do WhatsApp, lidas na hora de mandar (o painel, a etapa, o cliente…). */
async function valoresDoChamado(app: FastifyInstance, id: string): Promise<ValoresDoAviso> {
  const [t] = await app.db.select({
    codigo: tickets.code, titulo: tickets.title, prioridade: tickets.priority, relato: tickets.customerReport, contato: tickets.contactName,
    painelId: tickets.panelId, assuntoId: tickets.subjectId,
    painel: ticketPanels.name, etapa: ticketStages.name, cliente: clients.tradeName, responsavel: users.name,
  }).from(tickets)
    .leftJoin(ticketPanels, eq(ticketPanels.id, tickets.panelId))
    .leftJoin(ticketStages, eq(ticketStages.id, tickets.stageId))
    .leftJoin(clients, eq(clients.id, tickets.clientId))
    .leftJoin(users, eq(users.id, tickets.assigneeId))
    .where(eq(tickets.id, id)).limit(1);
  if (!t) return {};
  const assuntos = t.assuntoId
    ? await app.db.select({ id: ticketSubjects.id, paiId: ticketSubjects.parentId, nome: ticketSubjects.name }).from(ticketSubjects).where(eq(ticketSubjects.panelId, t.painelId))
    : [];
  return {
    painel: t.painel, etapa: t.etapa, codigo: t.codigo, titulo: t.titulo,
    prioridade: t.prioridade ? (NOME_PRIORIDADE[t.prioridade as Prioridade] ?? t.prioridade) : '',
    cliente: t.cliente, contato: t.contato, responsavel: t.responsavel,
    assunto: t.assuntoId ? caminhoDoAssunto(t.assuntoId, assuntos) : '',
    relato: t.relato ? trecho(t.relato.replace(/\s+/g, ' ').trim(), 300) : '',
    link: linkDoChamado(app, t.codigo),
  };
}

/** A mensagem do aviso no WhatsApp: a dos Ajustes (ou a padrão), com o chamado e o que a ação contou. */
export async function mensagemDoAvisoDoChamado(
  app: FastifyInstance, modelos: Partial<Record<EventoAviso, string>> | undefined, evento: EventoAviso, chamadoId: string, texto: string, d: DoAviso,
): Promise<string> {
  const nota = d.nota?.replace(/\r\n?/g, '\n').trim() ?? '';
  return preencherAviso(evento, modeloDoAviso(modelos, evento), {
    ...(await valoresDoChamado(app, chamadoId)),
    aviso: d.aviso ?? texto, quem: d.quem ?? '', nota: trecho(nota, MAX_NOTA_NO_WHATSAPP), novidade: d.novidade ?? '',
  });
}

/**
 * Avisa a equipe. `evento` decide os canais (os Ajustes); `tipo` é o que aparece no sininho.
 * `menos` = quem fez a ação (não recebe). `texto` é a frase do sininho; o WhatsApp sai pela mensagem do
 * aviso (os Ajustes), com o que a ação contou (`quem`, `nota`, `novidade`, `aviso`).
 */
export async function avisarEquipe(
  app: FastifyInstance,
  a: { evento: EventoAviso; tipo?: TipoAviso; para: Array<string | null | undefined>; chamado: { id: string; codigo: string; titulo: string }; texto: string; menos?: string | null } & DoAviso,
) {
  const para = [...new Set(a.para.filter((x): x is string => !!x && x !== a.menos))];
  if (!para.length) return;
  const { valor: v } = await lerAvisos(app.db);
  const canais = v.eventos[a.evento] ?? { tela: true, whatsapp: false };
  // só quem está ativo recebe; o WhatsApp de cada um mora no usuário (Administração › Usuários, 2.0.1)
  const ativos = await app.db.select({ id: users.id, name: users.name, active: users.active, whatsapp: users.whatsapp, recebe: users.whatsappAvisos })
    .from(users).where(inArray(users.id, para));
  const quem = ativos.filter((u) => u.active);
  if (!quem.length) return;
  if (canais.tela) {
    await app.db.insert(ticketNotifications).values(quem.map((u) => ({ id: newId(), userId: u.id, ticketId: a.chamado.id, kind: a.tipo ?? a.evento, body: a.texto })));
  }
  if (!canais.whatsapp || !v.ativo || !v.numeroEquipe) return;
  // com o número e sem a pausa
  const numeros = quem.filter((u) => u.recebe && u.whatsapp).map((u) => ({ u, numero: u.whatsapp! }));
  if (!numeros.length) return;
  // Sem a chave, nem tenta: enquanto a configuração não termina, cada aviso deixaria um "não foi: falta
  // a chave" no histórico do chamado. A tela de Avisos já mostra o que falta.
  if (!(await whatsAppPronto(app.db)).equipe) return;
  emSegundoPlano(app, async () => {
    // lida já em segundo plano: a tela não espera
    const texto = await mensagemDoAvisoDoChamado(app, v.modelos, a.evento, a.chamado.id, a.texto, a);
    for (const { u, numero } of numeros) {
      const r = await mandarWhatsApp(app.db, app.vault, { de: 'equipe', para: numero, texto });
      await registrarEvento(app.db, a.chamado.id, 'aviso_equipe', null, { para: u.name, ok: r.ok, ...(r.ok ? {} : { erro: r.mensagem }) });
    }
  });
}

/**
 * Os avisos do calendário (2.0.2): o lembrete de um evento e o aviso de que um evento entrou (`qual`), no
 * sininho e no WhatsApp de cada pessoa, conforme os Ajustes (os avisos "Lembrete de um evento do
 * calendário" e "Um evento entrou no calendário", em Painéis › Ajustes › Avisos e WhatsApp). Não é de um
 * chamado: o aviso guarda o evento, e o WhatsApp que falhar vai para o registro do servidor (não há
 * histórico de chamado onde contar). O WhatsApp sai pela mensagem do aviso (os Ajustes), com os `valores`
 * do evento (`valoresDoLembrete`, `valoresDaInclusao`). Devolve quantas pessoas receberam.
 */
export async function avisarDoCalendario(
  app: FastifyInstance,
  a: { qual?: 'lembrete' | 'evento_novo'; para: string[]; evento: { id: string; titulo: string }; texto: string; valores: ValoresDoAviso },
): Promise<number> {
  const qual = a.qual ?? 'lembrete';
  const para = [...new Set(a.para)];
  if (!para.length) return 0;
  const { valor: v } = await lerAvisos(app.db);
  const canais = v.eventos[qual] ?? EVENTOS_AVISO_PADRAO[qual];
  const ativos = await app.db.select({ id: users.id, name: users.name, active: users.active, whatsapp: users.whatsapp, recebe: users.whatsappAvisos })
    .from(users).where(inArray(users.id, para));
  const quem = ativos.filter((u) => u.active);
  if (!quem.length) return 0;
  if (canais.tela) {
    await app.db.insert(ticketNotifications).values(quem.map((u) => ({ id: newId(), userId: u.id, calendarEventId: a.evento.id, kind: qual, body: a.texto })));
  }
  if (!canais.whatsapp || !v.ativo || !v.numeroEquipe) return quem.length;
  const numeros = quem.filter((u) => u.recebe && u.whatsapp).map((u) => ({ u, numero: u.whatsapp! }));
  if (!numeros.length || !(await whatsAppPronto(app.db)).equipe) return quem.length;
  const texto = preencherAviso(qual, modeloDoAviso(v.modelos, qual), a.valores);
  emSegundoPlano(app, async () => {
    for (const { u, numero } of numeros) {
      const r = await mandarWhatsApp(app.db, app.vault, { de: 'equipe', para: numero, texto });
      if (!r.ok) app.log.warn({ evento: a.evento.id, para: u.name, erro: r.mensagem }, `calendário: o ${qual === 'lembrete' ? 'lembrete' : 'aviso do evento novo'} não foi pelo WhatsApp`);
    }
  });
  return quem.length;
}

/** Os campos que mudaram, no aviso do observador: "Marina mudou no SUP-12: Descrição · Solução". */
export const SEPARADOR_DE_CAMPOS = ' · ';
/** Por quanto tempo as mudanças de campo de uma pessoa juntam no mesmo aviso (enquanto ele não foi lido). */
const JUNTA_POR_MINUTOS = 30;

/**
 * Avisa quem observa o chamado (o pedido do Luan na prévia: como no Helena, o observador recebe toda
 * atualização — a anotação, a mudança de etapa, o responsável, a espera, os campos…).
 * Quem fez não recebe, nem quem já recebeu outro aviso da mesma ação (o responsável que recebeu o
 * chamado, quem a etapa avisa).
 *
 * `campos`: as mudanças de campo (o relato, a solução, a classificação…) de uma pessoa juntam num
 * aviso só, na tela, enquanto ele não foi lido (por 30 minutos): editar cinco campos seguidos não vira
 * cinco avisos — nem cinco WhatsApps (a mudança de campo só avisa na tela).
 *
 * No WhatsApp, a mensagem do observador (os Ajustes) usa o que a ação contou: `novidade` (o que mudou,
 * sem quem fez: "Moveu para N2"; na anotação, vazia), `quem` e a `nota`.
 */
export async function avisarObservadores(
  app: FastifyInstance,
  a: {
    chamado: { id: string; codigo: string; titulo: string };
    observadores: string[];
    texto?: string;
    menos?: string | null;
    jaAvisados?: Array<string | null | undefined>;
    campos?: { quem: string; nomes: string[] };
  } & DoAviso,
) {
  const fora = new Set([a.menos, ...(a.jaAvisados ?? [])].filter((x): x is string => !!x));
  const para = [...new Set(a.observadores)].filter((x) => !fora.has(x));
  if (!para.length) return;
  if (!a.campos) {
    if (a.texto) {
      await avisarEquipe(app, { evento: 'observador', para, chamado: a.chamado, texto: a.texto, quem: a.quem, nota: a.nota, novidade: a.novidade, aviso: a.aviso });
    }
    return;
  }
  const nomes = [...new Set(a.campos.nomes.filter(Boolean))];
  if (!nomes.length) return;
  const { valor: v } = await lerAvisos(app.db);
  if (!(v.eventos.observador ?? EVENTOS_AVISO_PADRAO.observador).tela) return;
  const ativos = await app.db.select({ id: users.id, active: users.active }).from(users).where(inArray(users.id, para));
  const inicio = `${a.campos.quem} mudou no ${a.chamado.codigo}: `;
  const desde = new Date(Date.now() - JUNTA_POR_MINUTOS * 60_000);
  for (const u of ativos.filter((x) => x.active)) {
    const recentes = await app.db.select().from(ticketNotifications)
      .where(and(eq(ticketNotifications.userId, u.id), eq(ticketNotifications.ticketId, a.chamado.id), eq(ticketNotifications.kind, 'observador'),
        isNull(ticketNotifications.readAt), gt(ticketNotifications.createdAt, desde)))
      .orderBy(desc(ticketNotifications.createdAt)).limit(5);
    const junta = recentes.find((n) => n.body.startsWith(inicio));
    if (junta) {
      const todos = [...new Set([...junta.body.slice(inicio.length).split(SEPARADOR_DE_CAMPOS), ...nomes])];
      // o aviso sobe para o alto da lista, com o que mudou de novo
      await app.db.update(ticketNotifications).set({ body: inicio + todos.join(SEPARADOR_DE_CAMPOS), createdAt: new Date() }).where(eq(ticketNotifications.id, junta.id));
    } else {
      await app.db.insert(ticketNotifications).values({ id: newId(), userId: u.id, ticketId: a.chamado.id, kind: 'observador', body: inicio + nomes.join(SEPARADOR_DE_CAMPOS) });
    }
  }
}
