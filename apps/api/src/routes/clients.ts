/** Clientes e assinaturas de produto. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AssinaturaGravarSchema, ClienteAtualizarSchema, ClienteCriarSchema, ClienteListarSchema, LogoGravarSchema, ModuloGravarSchema, SEM_LIMITE, UnidadeGravarSchema, Booleano } from '@gestor/shared';
import * as clientsSvc from '../services/clients.js';
import * as didsSvc from '../services/dids.js';
import * as inv from '../services/inventory.js';
import * as audit from '../services/audit.js';

const Id = z.object({ id: z.string() });

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Clientes'], summary: 'Listar clientes (busca, filtro por produtos AND/OR, arquivados)', querystring: ClienteListarSchema.extend({ includeInternal: Booleano.default(false) }) } },
    async (req) => clientsSvc.list(app.db, req.query));

  app.get('/options', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Clientes'], summary: 'Lista curta (id + nome) para seletores; withDevices=true traz só quem está com aparelho nosso', querystring: z.object({ includeInternal: Booleano.default(false), productCode: z.string().optional(), withDevices: Booleano.default(false) }) } },
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

  // ---- logo (aparece no cartão do cliente) ----
  app.get('/:id/logo', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Clientes'], summary: 'A imagem da logo do cliente', params: Id } },
    async (req, reply) => {
      const { mimeType, buffer, updatedAt } = await clientsSvc.readLogo(app.db, req.params.id);
      return reply.header('Content-Type', mimeType).header('Cache-Control', 'private, max-age=86400').header('Last-Modified', updatedAt.toUTCString()).send(buffer);
    });

  app.put('/:id/logo', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Clientes'], summary: 'Enviar/trocar a logo (imagem embutida em base64, até 512 KB)', params: Id, body: LogoGravarSchema } },
    async (req) => {
      const r = await clientsSvc.saveLogo(app.db, req.params.id, req.body.dataUrl);
      await app.audit(req, { action: 'update', entityType: 'client', entityId: req.params.id, summary: `Trocou a logo de ${r.clientName}` });
      return clientsSvc.get(app.db, req.params.id);
    });

  app.delete('/:id/logo', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Clientes'], summary: 'Remover a logo', params: Id } },
    async (req) => {
      const r = await clientsSvc.removeLogo(app.db, req.params.id);
      await app.audit(req, { action: 'update', entityType: 'client', entityId: req.params.id, summary: `Removeu a logo de ${r.clientName}` });
      return clientsSvc.get(app.db, req.params.id);
    });

  // a ficha mostra TODOS os números do cliente (a tela pagina, mas sempre deixa ver tudo)
  app.get('/:id/dids', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Clientes'], summary: 'DIDs do cliente (todos)', params: Id, querystring: z.object({ page: z.coerce.number().default(1), pageSize: z.coerce.number().max(SEM_LIMITE).default(SEM_LIMITE) }) } },
    // na ficha do cliente a pergunta é "o que este cliente tem": o tronco dele com outra operadora entra
    async (req) => didsSvc.list(app.db, { ...req.query, clientId: req.params.id, includeThirdParty: true, sort: 'number', dir: 'asc' }));

  app.get('/:id/devices', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Clientes'], summary: 'Aparelhos com o cliente (todos)', params: Id } },
    async (req) => ({ devices: await inv.listDevices(app.db, { clientId: req.params.id, page: 1, pageSize: SEM_LIMITE }) }));

  // ---- unidades (matriz, filiais, lojas) ----
  app.get('/:id/units', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Clientes'], summary: 'Unidades do cliente (a Matriz sempre existe)', params: Id } },
    async (req) => clientsSvc.listUnits(app.db, req.params.id));

  app.post('/:id/units', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Clientes'], summary: 'Cadastrar unidade', params: Id, body: UnidadeGravarSchema } },
    async (req, reply) => {
      const row = await clientsSvc.createUnit(app.db, req.params.id, req.body);
      await app.audit(req, { action: 'create', entityType: 'client', entityId: req.params.id, summary: `Cadastrou a unidade "${row.name}" em ${row.clientName}`, after: row });
      return reply.status(201).send(row);
    });

  app.patch('/:id/units/:unitId', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Clientes'], summary: 'Renomear unidade (os aparelhos dela acompanham)', params: Id.extend({ unitId: z.string() }), body: UnidadeGravarSchema } },
    async (req) => {
      const r = await clientsSvc.updateUnit(app.db, req.params.id, req.params.unitId, req.body);
      const extra = r.movidos ? ` (${r.movidos} aparelho(s) acompanharam)` : '';
      await app.audit(req, { action: 'update', entityType: 'client', entityId: req.params.id, summary: r.before.name === r.after.name ? `Editou a unidade "${r.after.name}"` : `Renomeou a unidade "${r.before.name}" para "${r.after.name}"${extra}`, before: r.before, after: r.after });
      return r.after;
    });

  app.delete('/:id/units/:unitId', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Clientes'], summary: 'Remover unidade (só sem aparelhos; a Matriz não sai)', params: Id.extend({ unitId: z.string() }) } },
    async (req) => {
      const row = await clientsSvc.removeUnit(app.db, req.params.id, req.params.unitId);
      await app.audit(req, { action: 'delete', entityType: 'client', entityId: req.params.id, summary: `Removeu a unidade "${row.name}"` });
      return { ok: true };
    });

  app.get('/:id/history', { preHandler: app.requirePermission('audit.read'), schema: { tags: ['Clientes'], summary: 'Histórico (auditoria) do cliente', params: Id } },
    async (req) => audit.list(app.db, { page: 1, pageSize: 100, entityId: req.params.id }));
};

export default routes;
