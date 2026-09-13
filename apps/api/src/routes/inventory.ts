/** Inventário: modelos, aparelhos, estoque a granel, movimentações. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AparelhoAtualizarSchema, AparelhoGravarSchema, EstoqueGranelAjustarSchema, MODALIDADES, ModeloGravarSchema, MovimentacaoCriarSchema, OrdenacaoSchema, PaginacaoSchema } from '@gestor/shared';
import * as svc from '../services/inventory.js';

const Id = z.object({ id: z.string() });

const routes: FastifyPluginAsyncZod = async (app) => {
  // ---- modelos ----
  app.get('/models', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Modelos com contagens (estoque, com clientes, manutenção, vendidos)', querystring: z.object({ q: z.string().optional(), categoryId: z.string().optional() }) } },
    async (req) => svc.listModels(app.db, req.query));
  app.post('/models', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Cadastrar modelo', body: ModeloGravarSchema } },
    async (req, reply) => { const row = await svc.createModel(app.db, req.body); await app.audit(req, { action: 'create', entityType: 'deviceModel', entityId: row.id, summary: `Cadastrou o modelo ${row.name}`, after: row }); return reply.status(201).send(row); });
  app.patch('/models/:id', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Editar modelo', params: Id, body: ModeloGravarSchema.partial() } },
    async (req) => { const { before, after } = await svc.updateModel(app.db, req.params.id, req.body); await app.audit(req, { action: 'update', entityType: 'deviceModel', entityId: after.id, summary: `Editou o modelo ${after.name}`, before, after }); return after; });
  app.delete('/models/:id', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Inventário'], summary: 'Mandar modelo para a lixeira', params: Id } },
    async (req) => { const row = await svc.deleteModel(app.db, req.params.id); await app.audit(req, { action: 'delete', entityType: 'deviceModel', entityId: row.id, summary: `Mandou o modelo ${row.name} para a lixeira` }); return { ok: true }; });

  // ---- resumo (os cartões do topo, com os mesmos filtros da lista) ----
  app.get('/summary', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Resumo do inventário (em estoque, com clientes, em manutenção, valor locado) com os MESMOS filtros da lista', querystring: z.object({ q: z.string().optional(), modelId: z.string().optional(), clientId: z.string().optional(), condition: z.string().optional() }) } },
    async (req) => svc.summary(app.db, req.query as any));

  // ---- aparelhos ----
  app.get('/devices', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Aparelhos serializados (por MAC)', querystring: PaginacaoSchema.merge(OrdenacaoSchema).extend({ q: z.string().optional(), modelId: z.string().optional(), clientId: z.string().optional(), condition: z.string().optional(), includeRetired: z.coerce.boolean().default(false) }) } },
    async (req) => svc.listDevices(app.db, req.query as any));
  app.get('/devices/:id', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Um aparelho com o histórico de movimentações', params: Id } }, async (req) => svc.getDevice(app.db, req.params.id));
  app.post('/devices', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Cadastrar aparelho (entra no estoque)', body: AparelhoGravarSchema } },
    async (req, reply) => { const row = await svc.createDevice(app.db, req.body); await app.audit(req, { action: 'create', entityType: 'device', entityId: row.id, summary: `Cadastrou o aparelho ${row.mac}`, after: row }); return reply.status(201).send(row); });
  app.patch('/devices/:id', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Editar aparelho (condição, valor, IP, local, anotação)', params: Id, body: AparelhoAtualizarSchema } },
    async (req) => { const { before, after } = await svc.updateDevice(app.db, req.params.id, req.body); await app.audit(req, { action: 'update', entityType: 'device', entityId: after.id, summary: `Editou o aparelho ${after.mac}`, before, after }); return svc.getDevice(app.db, after.id); });
  app.delete('/devices/:id', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Inventário'], summary: 'Mandar aparelho para a lixeira', params: Id } },
    async (req) => { const row = await svc.deleteDevice(app.db, req.params.id); await app.audit(req, { action: 'delete', entityType: 'device', entityId: row.id, summary: `Mandou o aparelho ${row.mac} para a lixeira` }); return { ok: true }; });
  app.post('/devices/:id/restore', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Inventário'], summary: 'Restaurar aparelho', params: Id } },
    async (req) => { const row = await svc.restoreDevice(app.db, req.params.id); await app.audit(req, { action: 'restore', entityType: 'device', entityId: row.id, summary: `Restaurou o aparelho ${row.mac}` }); return svc.getDevice(app.db, row.id); });

  // ---- granel ----
  app.get('/stock', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Saldos a granel por modelo e lugar', querystring: z.object({ modelId: z.string().optional() }) } }, async (req) => svc.listBulk(app.db, req.query.modelId));
  app.post('/stock/adjust', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Entrada (+) ou baixa (−) de itens a granel no estoque', body: EstoqueGranelAjustarSchema } },
    async (req) => { const r = await svc.adjustStock(app.db, req.body.modelId, req.body.delta); await app.audit(req, { action: 'stock_adjust', entityType: 'deviceModel', entityId: req.body.modelId, summary: `${req.body.delta > 0 ? 'Entrada' : 'Baixa'} de ${Math.abs(req.body.delta)} no estoque a granel${req.body.note ? ` (${req.body.note})` : ''}` }); return r; });

  // ---- movimentações ----
  app.get('/movements', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Histórico de movimentações', querystring: PaginacaoSchema.merge(OrdenacaoSchema).extend({ modality: z.string().optional(), clientId: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }) } },
    async (req) => svc.listMovements(app.db, req.query));
  app.post('/movements', { preHandler: app.requirePermission('devices.move'), schema: { tags: ['Inventário'], summary: 'Movimentar aparelhos (locação, venda, comodato, devolução)', body: MovimentacaoCriarSchema } },
    async (req, reply) => {
      const r = await svc.createMovement(app.db, req.body, req.user!.id);
      await app.audit(req, { action: 'movement', entityType: 'deviceMovement', entityId: r.id, summary: `${MODALIDADES[req.body.modality]} de ${r.quantity} aparelho(s)${req.body.toClientId ? ' para cliente' : ' para o estoque'}`, after: req.body });
      return reply.status(201).send(r);
    });
};

export default routes;
