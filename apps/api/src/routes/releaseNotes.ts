/** Novidades: o que mudou em cada versão, quem já leu, e a edição das notas. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NovidadeAtualizarSchema, NovidadeGravarSchema } from '@gestor/shared';
import * as svc from '../services/releaseNotes.js';

const Id = z.object({ id: z.string() });

const routes: FastifyPluginAsyncZod = async (app) => {
  // ---- para toda a equipe (qualquer pessoa logada, inclusive o Leitor) ----
  app.get('/pending', { preHandler: app.requireLogin, schema: { tags: ['Novidades'], summary: 'A nota que deve abrir no login desta pessoa (a mais recente ainda não lida), ou nada' } },
    async (req) => svc.pending(app.db, req.user!.id));

  app.get('/', { preHandler: app.requireLogin, schema: { tags: ['Novidades'], summary: 'Histórico de novidades (rascunhos só para quem pode editar)' } },
    async (req) => {
      const podeEditar = req.user!.permissions.includes('admin.manage');
      return { items: await svc.list(app.db, req.user!.id, { includeDrafts: podeEditar }), podeEditar, naoLidas: await svc.unreadCount(app.db, req.user!.id) };
    });

  app.post('/:id/read', { preHandler: app.requireLogin, schema: { tags: ['Novidades'], summary: 'Marcar como lida ("Li e entendi")', params: Id } },
    async (req) => {
      const nota = await svc.markRead(app.db, req.params.id, req.user!.id);
      await app.audit(req, { action: 'update', entityType: 'releaseNote', entityId: nota.id, summary: `${req.user!.name} leu as novidades de ${nota.version}` });
      return { ok: true };
    });

  app.get('/items/:id/image', { preHandler: app.requireLogin, schema: { tags: ['Novidades'], summary: 'O print de um item', params: Id } },
    async (req, reply) => {
      const { mimeType, buffer, updatedAt } = await svc.readImage(app.db, req.params.id);
      return reply.header('Content-Type', mimeType).header('Cache-Control', 'private, max-age=86400').header('Last-Modified', updatedAt.toUTCString()).send(buffer);
    });

  // ---- edição (Administração › Novidades) ----
  app.get('/:id/reads', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Novidades'], summary: 'Quem já leu e quem ainda não', params: Id } },
    async (req) => svc.reads(app.db, req.params.id));

  app.post('/', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Novidades'], summary: 'Criar uma nota (nasce como rascunho)', body: NovidadeGravarSchema } },
    async (req, reply) => {
      const row = await svc.create(app.db, req.body);
      await app.audit(req, { action: 'create', entityType: 'releaseNote', entityId: row.id, summary: `Criou a nota de novidades ${row.version}` });
      return reply.status(201).send(row);
    });

  app.patch('/:id', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Novidades'], summary: 'Editar a nota e seus itens', params: Id, body: NovidadeAtualizarSchema } },
    async (req) => {
      const { before, after } = await svc.update(app.db, req.params.id, req.body);
      await app.audit(req, { action: 'update', entityType: 'releaseNote', entityId: after.id, summary: `Editou a nota de novidades ${after.version}`, before: { title: before.title }, after: { title: after.title } });
      return after;
    });

  app.post('/:id/publish', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Novidades'], summary: 'Publicar (passa a aparecer no login de todos) ou voltar para rascunho', params: Id, body: z.object({ publicar: z.boolean().default(true) }) } },
    async (req) => {
      const row = await svc.publish(app.db, req.params.id, req.body.publicar);
      await app.audit(req, { action: 'update', entityType: 'releaseNote', entityId: row.id, summary: req.body.publicar ? `Publicou as novidades de ${row.version} para toda a equipe` : `Voltou as novidades de ${row.version} para rascunho` });
      return row;
    });

  app.delete('/:id', { preHandler: app.requirePermission('admin.manage'), schema: { tags: ['Novidades'], summary: 'Mandar a nota para a lixeira', params: Id } },
    async (req) => {
      const row = await svc.softDelete(app.db, req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'releaseNote', entityId: row.id, summary: `Mandou a nota de novidades ${row.version} para a lixeira` });
      return { ok: true };
    });
};

export default routes;
