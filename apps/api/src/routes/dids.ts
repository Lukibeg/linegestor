/** DIDs: listar, criar faixa, editar um, editar/excluir em massa por lista de ids. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DidAtualizarSchema, DidCriarFaixaSchema, DidEditarEmMassaSchema, DidListarSchema } from '@gestor/shared';
import * as svc from '../services/dids.js';
import * as mov from '../services/movimentacoesCircuitos.js';

const Id = z.object({ id: z.string() });

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { preHandler: app.requirePermission('records.read'), schema: { tags: ['DIDs'], summary: 'Listar DIDs (filtros, ordenação, paginação)', querystring: DidListarSchema } },
    async (req) => svc.list(app.db, req.query));

  app.get('/ids', { preHandler: app.requirePermission('records.read'), schema: { tags: ['DIDs'], summary: 'Ids de todos os DIDs que batem com o filtro (para "selecionar todos os filtrados")', querystring: DidListarSchema.omit({ page: true, pageSize: true, sort: true, dir: true }) } },
    async (req) => ({ ids: await svc.idsMatching(app.db, req.query) }));

  app.get('/:id', { preHandler: app.requirePermission('records.read'), schema: { tags: ['DIDs'], summary: 'Um DID', params: Id } }, async (req) => svc.get(app.db, req.params.id));

  app.post('/range', { preHandler: app.requirePermission('dids.assign'), schema: { tags: ['DIDs'], summary: 'Criar faixa sequencial (número-base + quantidade)', body: DidCriarFaixaSchema } },
    async (req, reply) => {
      const { numbers, ...r } = await svc.createRange(app.db, req.body);
      await app.audit(req, { action: 'bulk_create', entityType: 'did', summary: `Criou ${r.created} DIDs (${r.first}–${r.last})`, after: req.body });
      await mov.aoCriarDids(app.db, req.user!.id, { numeros: numbers, circuitId: req.body.circuitId, clientId: req.body.clientId, note: req.body.note });
      return reply.status(201).send(r);
    });

  app.patch('/:id', { preHandler: app.requirePermission('dids.assign'), schema: { tags: ['DIDs'], summary: 'Editar um DID (circuito, cliente, titular, observação)', params: Id, body: DidAtualizarSchema } },
    async (req) => {
      const { before, after } = await svc.update(app.db, req.params.id, req.body);
      await app.audit(req, { action: 'update', entityType: 'did', entityId: after.id, summary: `Editou o DID ${after.number}`, before, after });
      await mov.aoEditarDids(app.db, req.user!.id, [{ antes: before, depois: after }]);
      return svc.get(app.db, after.id);
    });

  app.post('/bulk', { preHandler: app.requirePermission('dids.assign'), schema: { tags: ['DIDs'], summary: 'Editar em massa: lista explícita de ids + o que mudar. Devolve quantos foram afetados.', body: DidEditarEmMassaSchema } },
    async (req) => {
      const antes = (await mov.didsPorId(app.db, req.body.ids)).filter((d) => !d.deletedAt);
      const r = await svc.bulkUpdate(app.db, req.body);
      const summary = await svc.describeBulk(app.db, req.body, r.affected);
      await app.audit(req, { action: 'bulk_update', entityType: 'did', summary, after: { ids: req.body.ids.length, set: req.body.set } });
      const depois = new Map((await mov.didsPorId(app.db, antes.map((d) => d.id))).map((d) => [d.id, d]));
      await mov.aoEditarDids(app.db, req.user!.id, antes.map((a) => ({ antes: a, depois: depois.get(a.id) ?? a })), summary);
      return r;
    });

  app.post('/bulk-delete', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['DIDs'], summary: 'Mandar vários DIDs para a lixeira', body: z.object({ ids: z.array(z.string()).min(1).max(5000) }) } },
    async (req) => {
      const { ids, ...r } = await svc.bulkDelete(app.db, req.body.ids);
      await app.audit(req, { action: 'bulk_delete', entityType: 'did', summary: `Mandou ${r.affected} DID(s) para a lixeira` });
      await mov.aoMexerNaLixeiraDosDids(app.db, req.user!.id, await mov.didsPorId(app.db, ids), 'dids_lixeira');
      return r;
    });

  app.post('/:id/restore', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['DIDs'], summary: 'Restaurar da lixeira', params: Id } },
    async (req) => {
      const row = await svc.restore(app.db, req.params.id);
      await app.audit(req, { action: 'restore', entityType: 'did', entityId: row.id, summary: `Restaurou o DID ${row.number}` });
      await mov.aoMexerNaLixeiraDosDids(app.db, req.user!.id, [row], 'did_restaurado');
      return svc.get(app.db, row.id);
    });
};

export default routes;
