/**
 * O Calendário (Patch 2.0.1, decisão 0049): as visitas, as viradas, as folgas e os home offices de cada
 * equipe, nos painéis dos chamados.
 *
 * Ver é de quem vê chamados (`support.read`) — e só os eventos dos painéis que a pessoa vê; criar, mudar,
 * marcar como feito ou cancelado e mandar para a lixeira é de quem trabalha nos chamados (`tickets.work`);
 * os tipos (Visita, Folga…) são de quem cuida dos chamados (`tickets.manage`). Tudo o que muda vai para a
 * auditoria (`calendar_event`; os tipos, `settings`).
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EventoGravarSchema, EventosDoPeriodoSchema, SituacaoDoEventoSchema, TiposDoCalendarioSchema } from '@gestor/shared';
import { atorDaPessoa } from '../services/atendimento/contexto.js';
import * as svc from '../services/calendario.js';

const tags = ['Calendário'];
const Id = z.object({ id: z.string().min(1) });

const routes: FastifyPluginAsyncZod = async (app) => {
  const ver = { preHandler: app.requirePermission('support.read') };
  const trabalhar = { preHandler: app.requirePermission('tickets.work') };
  const cuidar = { preHandler: app.requirePermission('tickets.manage') };
  const ator = (req: { user: Parameters<typeof atorDaPessoa>[0] | null }) => atorDaPessoa(req.user!);

  app.get('/opcoes', { ...ver, schema: { tags, summary: 'Os tipos, os painéis que a pessoa vê (com quem vê cada um), as pessoas e o que ela pode fazer' } },
    async (req) => svc.opcoes(app.db, ator(req)));

  app.get('/eventos', { ...ver, schema: { tags, summary: 'Os eventos que a pessoa vê e que tocam o período (de … até, AAAA-MM-DD)', querystring: EventosDoPeriodoSchema } },
    async (req) => svc.listar(app.db, ator(req), req.query.de, req.query.ate));

  app.get('/do-chamado/:id', { ...ver, schema: { tags, summary: 'Os eventos ligados a um chamado (a ficha do chamado)', params: Id } },
    async (req) => svc.doChamado(app.db, ator(req), req.params.id));

  app.post('/eventos', { ...trabalhar, schema: { tags, summary: 'Pôr um evento no calendário (de um ou mais painéis que a pessoa vê)', body: EventoGravarSchema } },
    async (req, reply) => {
      const r = await svc.criar(app.db, ator(req), req.body);
      await app.audit(req, { action: 'create', entityType: 'calendar_event', entityId: r.evento.id, summary: r.resumo, after: r.depois });
      return reply.status(201).send(r.evento);
    });

  app.put('/eventos/:id', { ...trabalhar, schema: { tags, summary: 'Mudar um evento (os painéis que a pessoa não vê ficam como estavam)', params: Id, body: EventoGravarSchema } },
    async (req) => {
      const r = await svc.alterar(app.db, ator(req), req.params.id, req.body);
      await app.audit(req, { action: 'update', entityType: 'calendar_event', entityId: r.evento.id, summary: r.resumo, before: r.antes, after: r.depois });
      return r.evento;
    });

  app.post('/eventos/:id/situacao', { ...trabalhar, schema: { tags, summary: 'Marcar como feito, cancelar ou voltar a agendado', params: Id, body: SituacaoDoEventoSchema } },
    async (req) => {
      const r = await svc.mudarSituacao(app.db, ator(req), req.params.id, req.body.situacao);
      await app.audit(req, { action: 'update', entityType: 'calendar_event', entityId: r.evento.id, summary: r.resumo, before: r.antes, after: r.depois });
      return r.evento;
    });

  app.delete('/eventos/:id', { ...trabalhar, schema: { tags, summary: 'Mandar o evento para a lixeira (volta pela Administração › Lixeira)', params: Id } },
    async (req) => {
      const r = await svc.mandarParaLixeira(app.db, ator(req), req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'calendar_event', entityId: r.id, summary: r.resumo });
      return { ok: true };
    });

  app.put('/tipos', { ...cuidar, schema: { tags, summary: 'Os tipos de evento (nome, cor, se é da equipe e se está ativo); o tipo com evento não sai: desativa', body: TiposDoCalendarioSchema } },
    async (req) => {
      const r = await svc.gravarTipos(app.db, ator(req), req.body);
      await app.audit(req, { action: 'settings_calendario', entityType: 'settings', entityId: 'calendario', summary: r.resumo, before: { tipos: r.antes }, after: { tipos: r.tipos } });
      return { tipos: r.tipos };
    });
};

export default routes;
