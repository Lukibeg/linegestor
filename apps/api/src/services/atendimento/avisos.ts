/**
 * Os avisos da equipe (Patch 1.10): na tela (o sininho, `ticket_notifications`) e no WhatsApp da
 * equipe, conforme os Ajustes do módulo (quem recebe o quê, e por onde). Quem fez a ação não recebe
 * aviso do que ele mesmo fez.
 *
 * O WhatsApp sai em segundo plano: a tela não espera a API do LineChat responder. Os testes esperam
 * com `esperarSegundoPlano()`.
 */
import type { FastifyInstance } from 'fastify';
import { inArray } from 'drizzle-orm';
import { newId, ticketNotifications, users } from '@gestor/db';
import { type EventoAviso, type TipoAviso } from '@gestor/shared';
import { enderecoPublico } from '../envio.js';
import { registrarEvento } from './contexto.js';
import { lerAvisos, mandarWhatsApp } from './whatsapp.js';

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
  const texto = `${a.texto}\n${a.chamado.codigo} · ${a.chamado.titulo}\n${linkDoChamado(app, a.chamado.codigo)}`;
  emSegundoPlano(app, async () => {
    for (const { u, p } of numeros) {
      const r = await mandarWhatsApp(app.db, app.vault, { de: 'equipe', para: p!.numero, texto });
      await registrarEvento(app.db, a.chamado.id, 'aviso_equipe', null, { para: u.name, ok: r.ok, ...(r.ok ? {} : { erro: r.mensagem }) });
    }
  });
}
