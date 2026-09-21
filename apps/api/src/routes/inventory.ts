/** Inventário: modelos, aparelhos e movimentações. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AparelhoAtualizarSchema, AparelhoGravarSchema, AparelhosEmMassaSchema, Booleano, LogoGravarSchema, MODALIDADES,
  ModeloAtualizarSchema, ModeloGravarSchema, MovimentacaoCriarSchema, OrdenacaoSchema, PaginacaoSchema, reais,
} from '@gestor/shared';
import * as svc from '../services/inventory.js';

const Id = z.object({ id: z.string() });

const routes: FastifyPluginAsyncZod = async (app) => {
  // ---- modelos ----
  app.get('/models', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Modelos com foto, valor e contagens (em estoque, com clientes, inativos, vendidos)', querystring: z.object({ q: z.string().optional(), categoryId: z.string().optional() }) } },
    async (req) => svc.listModels(app.db, req.query));
  app.post('/models', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Cadastrar modelo (com o valor de cada unidade)', body: ModeloGravarSchema } },
    async (req, reply) => { const row = await svc.createModel(app.db, req.body); await app.audit(req, { action: 'create', entityType: 'deviceModel', entityId: row.id, summary: `Cadastrou o modelo ${row.name}${row.valueCents != null ? ` (${reais(row.valueCents)})` : ''}`, after: row }); return reply.status(201).send(row); });
  app.patch('/models/:id', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Editar modelo (nome, categoria, valor; opcionalmente aplica o valor a todos os aparelhos)', params: Id, body: ModeloAtualizarSchema } },
    async (req) => {
      const { before, after, igualados } = await svc.updateModel(app.db, req.params.id, req.body);
      const valor = before.valueCents !== after.valueCents ? `: valor ${reais(before.valueCents)} → ${reais(after.valueCents)}` : '';
      const todos = igualados ? ` (${igualados} aparelho(s) passaram a usar o valor do modelo)` : '';
      await app.audit(req, { action: 'update', entityType: 'deviceModel', entityId: after.id, summary: `Editou o modelo ${after.name}${valor}${todos}`, before, after });
      return { ...after, igualados };
    });
  app.delete('/models/:id', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Inventário'], summary: 'Mandar modelo para a lixeira', params: Id } },
    async (req) => { const row = await svc.deleteModel(app.db, req.params.id); await app.audit(req, { action: 'delete', entityType: 'deviceModel', entityId: row.id, summary: `Mandou o modelo ${row.name} para a lixeira` }); return { ok: true }; });

  // ---- foto do modelo ----
  app.get('/models/:id/image', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'A foto do modelo', params: Id } },
    async (req, reply) => {
      const { mimeType, buffer, updatedAt } = await svc.readModelImage(app.db, req.params.id);
      return reply.header('Content-Type', mimeType).header('Cache-Control', 'private, max-age=86400').header('Last-Modified', updatedAt.toUTCString()).send(buffer);
    });
  app.put('/models/:id/image', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Enviar/trocar a foto do modelo (imagem embutida em base64, até 512 KB)', params: Id, body: LogoGravarSchema } },
    async (req) => { const r = await svc.saveModelImage(app.db, req.params.id, req.body.dataUrl); await app.audit(req, { action: 'update', entityType: 'deviceModel', entityId: req.params.id, summary: `Trocou a foto do modelo ${r.modelName}` }); return { ok: true }; });
  app.delete('/models/:id/image', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Remover a foto do modelo', params: Id } },
    async (req) => { const r = await svc.removeModelImage(app.db, req.params.id); await app.audit(req, { action: 'update', entityType: 'deviceModel', entityId: req.params.id, summary: `Removeu a foto do modelo ${r.modelName}` }); return { ok: true }; });

  // ---- resumo (os cartões do topo, com os mesmos filtros da lista) ----
  app.get('/summary', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Resumo do inventário (em estoque, com clientes, inativos, valor locado) com os MESMOS filtros da lista', querystring: z.object({ q: z.string().optional(), modelId: z.string().optional(), clientId: z.string().optional(), condition: z.string().optional() }) } },
    async (req) => svc.summary(app.db, req.query as any));

  // ---- aparelhos ----
  app.get('/devices', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Aparelhos (um por unidade). clientId: vazio = todos, "stock" = estoque, "clients" = com clientes, ou um id', querystring: PaginacaoSchema.merge(OrdenacaoSchema).extend({ q: z.string().optional(), modelId: z.string().optional(), clientId: z.string().optional(), condition: z.string().optional(), includeSold: Booleano.default(false) }) } },
    async (req) => svc.listDevices(app.db, req.query as any));
  app.get('/devices/:id', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Um aparelho com o histórico de movimentações', params: Id } }, async (req) => svc.getDevice(app.db, req.params.id));
  app.post('/devices', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Cadastrar aparelho (entra no estoque)', body: AparelhoGravarSchema } },
    async (req, reply) => { const row = await svc.createDevice(app.db, req.body); await app.audit(req, { action: 'create', entityType: 'device', entityId: row.id, summary: `Cadastrou o aparelho ${svc.nomeAparelho(row, row.modelId)}`, after: row }); return reply.status(201).send(row); });
  app.post('/devices/bulk', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Cadastrar vários aparelhos de uma vez (lista de MACs, de N/S, ou uma quantidade sem identificação)', body: AparelhosEmMassaSchema } },
    async (req, reply) => {
      const r = await svc.createDevicesBulk(app.db, req.body);
      const como = r.tipo === 'mac' ? 'por MAC' : r.tipo === 'serie' ? 'por número de série' : 'sem identificação';
      await app.audit(req, { action: 'bulk_create', entityType: 'device', entityId: req.body.modelId, summary: `Cadastrou ${r.created} aparelho(s) ${r.modelName} ${como}` });
      return reply.status(201).send(r);
    });
  app.patch('/devices/:id', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Inventário'], summary: 'Editar aparelho (MAC/N/S, condição, valor próprio, IP, anotação)', params: Id, body: AparelhoAtualizarSchema } },
    async (req) => { const { before, after } = await svc.updateDevice(app.db, req.params.id, req.body); await app.audit(req, { action: 'update', entityType: 'device', entityId: after.id, summary: `Editou o aparelho ${svc.nomeAparelho(after, after.id)}`, before, after }); return svc.getDevice(app.db, after.id); });
  app.delete('/devices/:id', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Inventário'], summary: 'Mandar aparelho para a lixeira', params: Id } },
    async (req) => { const row = await svc.deleteDevice(app.db, req.params.id); await app.audit(req, { action: 'delete', entityType: 'device', entityId: row.id, summary: `Mandou o aparelho ${svc.nomeAparelho(row, row.id)} para a lixeira` }); return { ok: true }; });
  app.post('/devices/:id/restore', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Inventário'], summary: 'Restaurar aparelho', params: Id } },
    async (req) => { const row = await svc.restoreDevice(app.db, req.params.id); await app.audit(req, { action: 'restore', entityType: 'device', entityId: row.id, summary: `Restaurou o aparelho ${svc.nomeAparelho(row, row.id)}` }); return svc.getDevice(app.db, row.id); });

  app.get('/units', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Unidades (filiais/lojas) já usadas nos aparelhos', querystring: z.object({ clientId: z.string().optional() }) } },
    async (req) => svc.listUnits(app.db, req.query.clientId));

  // ---- movimentações ----
  app.get('/movements', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Inventário'], summary: 'Histórico de movimentações (com os aparelhos de cada uma). modelId = só as que levaram aquele modelo; q = MAC ou N/S de um aparelho', querystring: PaginacaoSchema.merge(OrdenacaoSchema).extend({ modality: z.string().optional(), clientId: z.string().optional(), modelId: z.string().optional(), q: z.string().trim().max(80).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }) } },
    async (req) => svc.listMovements(app.db, req.query));
  app.post('/movements', { preHandler: app.requirePermission('devices.move'), schema: { tags: ['Inventário'], summary: 'Movimentar aparelhos (locação, venda, comodato, devolução)', body: MovimentacaoCriarSchema } },
    async (req, reply) => {
      const r = await svc.createMovement(app.db, req.body, req.user!.id);
      await app.audit(req, { action: 'movement', entityType: 'deviceMovement', entityId: r.id, summary: `${MODALIDADES[req.body.modality]} de ${r.quantity} aparelho(s)${req.body.toClientId ? ` para cliente${r.unit ? ` (unidade ${r.unit})` : ''}` : ' para o estoque'}`, after: req.body });
      return reply.status(201).send(r);
    });
};

export default routes;
