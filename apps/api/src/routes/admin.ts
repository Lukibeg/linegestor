/** Administração: usuários, papéis, catálogos, produtos, auditoria, lixeira. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuditoriaListarSchema, CatalogoItemSchema, PapelGravarSchema, UsuarioAtualizarSchema, UsuarioCriarSchema } from '@gestor/shared';
import * as svc from '../services/admin.js';
import * as audit from '../services/audit.js';
import * as clientsSvc from '../services/clients.js';
import * as circuitsSvc from '../services/circuits.js';
import * as didsSvc from '../services/dids.js';
import * as inv from '../services/inventory.js';
import { BadRequest } from '../plugins/errors.js';

const Id = z.object({ id: z.string() });
const CatalogType = z.enum(['carriers', 'hostings', 'categories']);

const routes: FastifyPluginAsyncZod = async (app) => {
  // ---- usuários ----
  app.get('/users', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Administração'], summary: 'Listar usuários' } }, async () => svc.listUsers(app.db));
  app.post('/users', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Administração'], summary: 'Criar usuário', body: UsuarioCriarSchema } },
    async (req, reply) => { const row = await svc.createUser(app.db, req.body); await app.audit(req, { action: 'create', entityType: 'user', entityId: row.id, summary: `Criou o usuário ${row.name} (${row.email})` }); return reply.status(201).send(row); });
  app.patch('/users/:id', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Administração'], summary: 'Editar usuário (nome, e-mail, papel, ativo, senha)', params: Id, body: UsuarioAtualizarSchema } },
    async (req) => { const { before, after } = await svc.updateUser(app.db, req.params.id, req.body, req.user!.id); await app.audit(req, { action: 'update', entityType: 'user', entityId: after.id, summary: `Editou o usuário ${after.name}${req.body.password ? ' (senha redefinida)' : ''}`, before, after }); return after; });

  // ---- papéis ----
  app.get('/roles', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Administração'], summary: 'Listar papéis' } }, async () => svc.listRoles(app.db));
  app.get('/permissions', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Administração'], summary: 'Catálogo de permissões com descrição' } }, async () => svc.permissionCatalog());
  app.post('/roles', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Administração'], summary: 'Criar papel', body: PapelGravarSchema } },
    async (req, reply) => { const row = await svc.createRole(app.db, req.body); await app.audit(req, { action: 'create', entityType: 'role', entityId: row.id, summary: `Criou o papel ${row.name}`, after: row }); return reply.status(201).send(row); });
  app.patch('/roles/:id', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Administração'], summary: 'Editar papel (permissões)', params: Id, body: PapelGravarSchema.partial() } },
    async (req) => { const { before, after } = await svc.updateRole(app.db, req.params.id, req.body); await app.audit(req, { action: 'update', entityType: 'role', entityId: after.id, summary: `Editou o papel ${after.name}`, before, after }); return after; });
  app.delete('/roles/:id', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Administração'], summary: 'Apagar papel (só os criados pela tela, sem usuários)', params: Id } },
    async (req) => { const row = await svc.deleteRole(app.db, req.params.id); await app.audit(req, { action: 'delete', entityType: 'role', entityId: row.id, summary: `Apagou o papel ${row.name}` }); return { ok: true }; });

  // ---- catálogos ----
  app.get('/catalogs/:type', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Administração'], summary: 'Itens de um catálogo (operadoras, hospedagens, categorias)', params: z.object({ type: CatalogType }) } }, async (req) => svc.listCatalog(app.db, req.params.type));
  app.post('/catalogs/:type', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Administração'], summary: 'Adicionar item ao catálogo', params: z.object({ type: CatalogType }), body: CatalogoItemSchema } },
    async (req, reply) => { const row = await svc.createCatalogItem(app.db, req.params.type, req.body.name); await app.audit(req, { action: 'create', entityType: `catalog:${req.params.type}`, entityId: row.id, summary: `Adicionou "${row.name}" ao catálogo ${req.params.type}` }); return reply.status(201).send(row); });
  app.patch('/catalogs/:type/:id', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Administração'], summary: 'Renomear/ativar/desativar item', params: z.object({ type: CatalogType, id: z.string() }), body: CatalogoItemSchema.partial() } },
    async (req) => { const row = await svc.updateCatalogItem(app.db, req.params.type, req.params.id, req.body); await app.audit(req, { action: 'update', entityType: `catalog:${req.params.type}`, entityId: row.id, summary: `Alterou "${row.name}" no catálogo ${req.params.type}` }); return row; });
  app.get('/products', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Administração'], summary: 'Produtos do portfólio' } }, async () => svc.listProducts(app.db));
  app.patch('/products/:id', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Administração'], summary: 'Editar produto (nome, cor, descrição, ativo, ordem)', params: Id, body: z.object({ name: z.string().min(1).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), description: z.string().nullable().optional(), active: z.boolean().optional(), sortOrder: z.number().int().optional() }) } },
    async (req) => { const row = await svc.updateProduct(app.db, req.params.id, req.body); await app.audit(req, { action: 'update', entityType: 'product', entityId: row.id, summary: `Editou o produto ${row.name}` }); return row; });

  // ---- auditoria ----
  app.get('/audit', { preHandler: app.requirePermission('audit.read'), schema: { tags: ['Administração'], summary: 'Auditoria: quem fez o quê', querystring: AuditoriaListarSchema } }, async (req) => audit.list(app.db, req.query));

  // ---- lixeira ----
  app.get('/trash', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Administração'], summary: 'O que está na lixeira' } }, async () => svc.listTrash(app.db));
  app.post('/trash/:type/:id/restore', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Administração'], summary: 'Restaurar um item da lixeira', params: z.object({ type: z.enum(['client', 'circuit', 'did', 'deviceModel', 'device']), id: z.string() }) } },
    async (req) => {
      const { type, id } = req.params;
      let label = id;
      if (type === 'client') label = (await clientsSvc.restore(app.db, id)).tradeName;
      else if (type === 'circuit') label = (await circuitsSvc.restore(app.db, id)).name;
      else if (type === 'did') label = (await didsSvc.restore(app.db, id)).number;
      else if (type === 'device') label = (await inv.restoreDevice(app.db, id)).mac;
      else throw new BadRequest('Restauração de modelo ainda não disponível');
      await app.audit(req, { action: 'restore', entityType: type, entityId: id, summary: `Restaurou ${label} da lixeira` });
      return { ok: true };
    });
};

export default routes;
