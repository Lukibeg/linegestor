/** Circuitos. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CircuitoAtualizarSchema, CircuitoGravarSchema, DidCriarFaixaSchema, PaginacaoSchema } from '@gestor/shared';
import * as svc from '../services/circuits.js';
import * as didsSvc from '../services/dids.js';

const Id = z.object({ id: z.string() });

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'Listar circuitos com ocupação (DIDs, livres, canais)', querystring: PaginacaoSchema.extend({ q: z.string().optional(), carrierId: z.string().optional() }) } },
    async (req) => svc.list(app.db, req.query));

  app.get('/summary', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'Resumo: circuitos, canais, valor mensal somado e numeração (total, em uso, livre, sem circuito)' } }, async () => svc.summary(app.db));

  app.get('/options', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'Lista curta para seletores' } }, async () => svc.options(app.db));

  app.get('/:id', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'Detalhe do circuito', params: Id } }, async (req) => svc.get(app.db, req.params.id));

  app.get('/:id/dids', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'DIDs do circuito', params: Id, querystring: PaginacaoSchema } },
    async (req) => didsSvc.list(app.db, { ...req.query, circuitId: req.params.id, sort: 'number', dir: 'asc' }));

  app.post('/', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Circuitos'], summary: 'Criar circuito', body: CircuitoGravarSchema } },
    async (req, reply) => {
      const row = await svc.create(app.db, app.vault, req.body, req.user!.id);
      await app.audit(req, { action: 'create', entityType: 'circuit', entityId: row.id, summary: `Criou o circuito ${row.name}`, after: row });
      return reply.status(201).send(await svc.get(app.db, row.id));
    });

  app.patch('/:id', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Circuitos'], summary: 'Editar circuito', params: Id, body: CircuitoAtualizarSchema } },
    async (req) => {
      const { before, after } = await svc.update(app.db, app.vault, req.params.id, req.body, req.user!.id);
      await app.audit(req, { action: 'update', entityType: 'circuit', entityId: after.id, summary: `Editou o circuito ${after.name}`, before, after });
      return svc.get(app.db, after.id);
    });

  app.delete('/:id', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Circuitos'], summary: 'Mandar para a lixeira (só sem DIDs)', params: Id } },
    async (req) => {
      const row = await svc.softDelete(app.db, req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'circuit', entityId: row.id, summary: `Mandou o circuito ${row.name} para a lixeira` });
      return { ok: true };
    });

  app.post('/:id/restore', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Circuitos'], summary: 'Restaurar da lixeira', params: Id } },
    async (req) => {
      const row = await svc.restore(app.db, req.params.id);
      await app.audit(req, { action: 'restore', entityType: 'circuit', entityId: row.id, summary: `Restaurou o circuito ${row.name}` });
      return svc.get(app.db, row.id);
    });

  app.post('/:id/dids/range', { preHandler: app.requirePermission('dids.assign'), schema: { tags: ['Circuitos'], summary: 'Criar uma faixa de DIDs dentro do circuito', params: Id, body: DidCriarFaixaSchema.omit({ circuitId: true }) } },
    async (req, reply) => {
      const r = await didsSvc.createRange(app.db, { ...req.body, circuitId: req.params.id });
      await app.audit(req, { action: 'bulk_create', entityType: 'did', entityId: req.params.id, summary: `Criou ${r.created} DIDs (${r.first}–${r.last}) no circuito ${req.params.id}` });
      return reply.status(201).send(r);
    });
};

export default routes;
