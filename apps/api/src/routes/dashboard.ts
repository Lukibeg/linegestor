/** Painel e busca global. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import * as svc from '../services/dashboard.js';

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Painel'], summary: 'Indicadores, alertas de consistência e últimas movimentações' } }, async () => svc.summary(app.db));
  app.get('/search', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Painel'], summary: 'Busca global (clientes, DIDs, circuitos, aparelhos)', querystring: z.object({ q: z.string().max(80) }) } }, async (req) => svc.search(app.db, req.query.q));
};

export default routes;
