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
import { newId, ticketNotifications, users } from '@gestor/db';
import { EVENTOS_AVISO_PADRAO, type EventoAviso, type TipoAviso } from '@gestor/shared';
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
 * Avisa a equipe. `evento` decide os canais (os Ajustes); `tipo` é o que aparece no sininho.
 * `menos` = quem fez a ação (não recebe).
 */
export async function avisarEquipe(
  app: FastifyInstance,
  a: { evento: EventoAviso; tipo?: TipoAviso; para: Array<string | null | undefined>; chamado: { id: string; codigo: string; titulo: string }; texto: string; menos?: string | null },
) {
  const para = [...new Set(a.para.filter((x): x is string => !!x && x !== a.menos))];
  if (!para.length) return;
  const { valor: v } = await lerAvisos(app.db);
  const canais = v.eventos[a.evento] ?? { tela: true, whatsapp: false };
  // só quem está ativo recebe
  const ativos = await app.db.select({ id: users.id, name: users.name, active: users.active }).from(users).where(inArray(users.id, para));
  const quem = ativos.filter((u) => u.active);
  if (!quem.length) return;
  if (canais.tela) {
    await app.db.insert(ticketNotifications).values(quem.map((u) => ({ id: newId(), userId: u.id, ticketId: a.chamado.id, kind: a.tipo ?? a.evento, body: a.texto })));
  }
  if (!canais.whatsapp || !v.ativo || !v.numeroEquipe) return;
  const numeros = quem.map((u) => ({ u, p: v.pessoas.find((x) => x.userId === u.id && x.ativo && x.numero) })).filter((x) => !!x.p);
  if (!numeros.length) return;
  // Sem a chave, nem tenta: enquanto a configuração não termina, cada aviso deixaria um "não foi: falta
  // a chave" no histórico do chamado. A tela de Avisos já mostra o que falta.
  if (!(await whatsAppPronto(app.db)).equipe) return;
  const texto = `${a.texto}\n${a.chamado.codigo} · ${a.chamado.titulo}\n${linkDoChamado(app, a.chamado.codigo)}`;
  emSegundoPlano(app, async () => {
    for (const { u, p } of numeros) {
      const r = await mandarWhatsApp(app.db, app.vault, { de: 'equipe', para: p!.numero, texto });
      await registrarEvento(app.db, a.chamado.id, 'aviso_equipe', null, { para: u.name, ok: r.ok, ...(r.ok ? {} : { erro: r.mensagem }) });
    }
  });
}

/** Os campos que mudaram, no aviso do observador: "Marina mudou no SUP-12: Descrição · Solução". */
export const SEPARADOR_DE_CAMPOS = ' · ';
/** Por quanto tempo as mudanças de campo de uma pessoa juntam no mesmo aviso (enquanto ele não foi lido). */
const JUNTA_POR_MINUTOS = 30;

/**
 * Avisa quem observa o chamado (o pedido do Luan na prévia: como no Helena, o observador recebe toda
 * atualização — a anotação, a mudança de etapa, o responsável, a espera, o cliente que respondeu…).
 * Quem fez não recebe, nem quem já recebeu outro aviso da mesma ação (o responsável que recebeu o
 * chamado, quem a etapa avisa).
 *
 * `campos`: as mudanças de campo (o relato, a solução, a classificação…) de uma pessoa juntam num
 * aviso só, na tela, enquanto ele não foi lido (por 30 minutos): editar cinco campos seguidos não vira
 * cinco avisos — nem cinco WhatsApps (a mudança de campo só avisa na tela).
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
  },
) {
  const fora = new Set([a.menos, ...(a.jaAvisados ?? [])].filter((x): x is string => !!x));
  const para = [...new Set(a.observadores)].filter((x) => !fora.has(x));
  if (!para.length) return;
  if (!a.campos) {
    if (a.texto) await avisarEquipe(app, { evento: 'observador', para, chamado: a.chamado, texto: a.texto });
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
