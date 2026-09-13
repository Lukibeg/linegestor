/** Clientes e assinaturas de produto. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AssinaturaGravarSchema, ClienteAtualizarSchema, ClienteCriarSchema, ClienteListarSchema, ModuloGravarSchema } from '@gestor/shared';
import * as clientsSvc from '../services/clients.js';
import * as didsSvc from '../services/dids.js';
import * as inv from '../services/inventory.js';
import * as audit from '../services/audit.js';

const Id = z.object({ id: z.string() });

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Clientes'], summary: 'Listar clientes (busca, filtro por produtos AND/OR, arquivados)', querystring: ClienteListarSchema.extend({ includeInternal: z.coerce.boolean().default(false) }) } },
    async (req) => clientsSvc.list(app.db, req.query));

  app.get('/options', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Clientes'], summary: 'Lista curta (id + nome) para seletores', querystring: z.object({ includeInternal: z.coerce.boolean().default(false), productCode: z.string().optional() }) } },
    async (req) => clientsSvc.options(app.db, req.query));

  app.get('/:id', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Clientes'], summary: 'Ficha completa do cliente', params: Id } },
    async (req) => clientsSvc.get(app.db, req.params.id));

  app.post('/', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Clientes'], summary: 'Criar cliente', body: ClienteCriarSchema } },
    async (req, reply) => {
      const row = await clientsSvc.create(app.db, req.body);
      await app.audit(req, { action: 'create', entityType: 'client', entityId: row.id, summary: `Criou o cliente ${row.tradeName}`, after: row });
      return reply.status(201).send(row);
    });

  app.patch('/:id', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Clientes'], summary: 'Editar cliente (inclui arquivar/desarquivar)', params: Id, body: ClienteAtualizarSchema } },
    async (req) => {
      const { before, after } = await clientsSvc.update(app.db, req.params.id, req.body);
      const what = req.body.archived === true ? 'arquivou' : req.body.archived === false ? 'desarquivou' : 'editou';
      await app.audit(req, { action: 'update', entityType: 'client', entityId: after.id, summary: `${req.user!.name} ${what} o cliente ${after.tradeName}`, before, after });
      return after;
    });

  app.delete('/:id', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Clientes'], summary: 'Mandar para a lixeira', params: Id } },
    async (req) => {
      const row = await clientsSvc.softDelete(app.db, req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'client', entityId: row.id, summary: `Mandou o cliente ${row.tradeName} para a lixeira` });
      return { ok: true };
    });

  app.post('/:id/restore', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Clientes'], summary: 'Restaurar da lixeira', params: Id } },
    async (req) => {
      const row = await clientsSvc.restore(app.db, req.params.id);
      await app.audit(req, { action: 'restore', entityType: 'client', entityId: row.id, summary: `Restaurou o cliente ${row.tradeName}` });
      return row;
    });

  app.put('/:id/subscriptions', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Clientes'], summary: 'Marcar/atualizar um produto do cliente (com a configuração própria dele)', params: Id, body: AssinaturaGravarSchema } },
    async (req) => {
      // dados de servidor exigem permissão extra
      const st = (req.body.settings ?? {}) as Record<string, unknown>;
      const touchesServer = ['serverIp', 'domain', 'sshUser', 'sshPort', 'sshPassword', 'hostingId'].some((k) => k in st);
      if (touchesServer && !req.user!.permissions.includes('servers.write')) {
        return app.requirePermission('servers.write')(req, undefined as any);
      }
      const r = await clientsSvc.upsertSubscription(app.db, app.vault, req.params.id, req.body, req.user!.id);
      await app.audit(req, { action: r.created ? 'subscribe' : 'update', entityType: 'subscription', entityId: r.subscriptionId, summary: `${r.created ? 'Marcou' : 'Atualizou'} o produto ${req.body.productCode} no cliente ${req.params.id}`, after: { ...req.body, settings: st } });
      return clientsSvc.get(app.db, req.params.id);
    });

  app.delete('/:id/subscriptions/:productCode', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Clientes'], summary: 'Encerrar um produto do cliente (mantém histórico)', params: Id.extend({ productCode: z.string() }) } },
    async (req) => {
      const row = await clientsSvc.deactivateSubscription(app.db, req.params.id, req.params.productCode);
      await app.audit(req, { action: 'unsubscribe', entityType: 'subscription', entityId: row.id, summary: `Encerrou o produto ${req.params.productCode} no cliente ${req.params.id}` });
      return clientsSvc.get(app.db, req.params.id);
    });

  app.put('/:id/modules', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Clientes'], summary: 'Ligar/ajustar um módulo de um produto do cliente (ex.: FOP2 dentro do LinePBX)', params: Id, body: ModuloGravarSchema } },
    async (req) => {
      const r = await clientsSvc.upsertModule(app.db, app.vault, req.params.id, req.body, req.user!.id);
      await app.audit(req, { action: r.created ? 'subscribe' : 'update', entityType: 'subscription_module', entityId: r.subscriptionModuleId, summary: `${r.created ? 'Ligou' : 'Ajustou'} o módulo ${r.moduleName} (${r.productName}) no cliente ${req.params.id}`, after: { ...req.body, settings: req.body.settings ?? {} } });
      return clientsSvc.get(app.db, req.params.id);
    });

  app.delete('/:id/modules/:productCode/:moduleCode', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Clientes'], summary: 'Desligar um módulo (mantém histórico)', params: Id.extend({ productCode: z.string(), moduleCode: z.string() }) } },
    async (req) => {
      const row = await clientsSvc.deactivateModule(app.db, req.params.id, req.params.productCode, req.params.moduleCode);
      await app.audit(req, { action: 'unsubscribe', entityType: 'subscription_module', entityId: row.id, summary: `Desligou o módulo ${row.moduleName} (${row.productName}) no cliente ${req.params.id}` });
      return clientsSvc.get(app.db, req.params.id);
    });

  app.get('/:id/dids', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Clientes'], summary: 'DIDs do cliente', params: Id, querystring: z.object({ page: z.coerce.number().default(1), pageSize: z.coerce.number().default(100) }) } },
    async (req) => didsSvc.list(app.db, { ...req.query, clientId: req.params.id, sort: 'number', dir: 'asc' }));

  app.get('/:id/devices', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Clientes'], summary: 'Aparelhos com o cliente', params: Id } },
    async (req) => ({ devices: await inv.listDevices(app.db, { clientId: req.params.id, page: 1, pageSize: 500 }), bulk: (await inv.listBulk(app.db)).filter((b) => b.clientId === req.params.id) }));

  app.get('/:id/history', { preHandler: app.requirePermission('audit.read'), schema: { tags: ['Clientes'], summary: 'Histórico (auditoria) do cliente', params: Id } },
    async (req) => audit.list(app.db, { page: 1, pageSize: 100, entityId: req.params.id }));
};

export default routes;
