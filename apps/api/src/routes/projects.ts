/** Projetos: a tarefa que percorre vários clientes, as etapas, os comentários e os anexos. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ProjetoAnexoSchema, ProjetoAtualizarSchema, ProjetoClientesSchema, ProjetoComentarioSchema,
  ProjetoGravarSchema, ProjetoLinhaSchema, ProjetoListarSchema, ProjetoMarcarSchema,
} from '@gestor/shared';
import * as svc from '../services/projects.js';

const Id = z.object({ id: z.string() });
const Linha = z.object({ id: z.string(), linhaId: z.string() });
const Marca = z.object({ id: z.string(), linhaId: z.string(), stepId: z.string() });

/** O nome do arquivo no cabeçalho de download, sem quebrar em nome com acento ou aspas. */
function contentDisposition(fileName: string) {
  const simples = fileName.replace(/[^\w.\- ]/g, '_');
  return `attachment; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

const routes: FastifyPluginAsyncZod = async (app) => {
  // ---- ler: qualquer pessoa que já vê os cadastros ----
  app.get('/', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Projetos'], summary: 'Lista de projetos com o andamento de cada um', querystring: ProjetoListarSchema } },
    async (req) => {
      const items = await svc.list(app.db, req.query);
      return {
        items,
        podeTrabalhar: req.user!.permissions.includes('projects.work'),
        podeGerenciar: req.user!.permissions.includes('projects.manage'),
      };
    });

  app.get('/pessoas', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Projetos'], summary: 'Quem pode ser responsável por um cliente do projeto' } },
    async () => svc.pessoas(app.db));

  app.get('/:id', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Projetos'], summary: 'Um projeto inteiro: etapas, clientes, comentários e anexos', params: Id } },
    async (req) => ({
      ...(await svc.get(app.db, req.params.id)),
      podeTrabalhar: req.user!.permissions.includes('projects.work'),
      podeGerenciar: req.user!.permissions.includes('projects.manage'),
    }));

  app.get('/anexos/:id', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Projetos'], summary: 'Baixar um anexo', params: Id } },
    async (req, reply) => {
      const a = await svc.lerAnexo(app.db, req.params.id);
      // sempre como download: um HTML ou SVG anexado não pode abrir dentro do sistema
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', contentDisposition(a.fileName))
        .header('X-Content-Type-Options', 'nosniff')
        .send(a.buffer);
    });

  // ---- trabalhar no projeto: marcar etapas, situação, comentar, anexar ----
  app.post('/:id/clientes/:linhaId/etapas/:stepId', { preHandler: app.requirePermission('projects.work'), schema: { tags: ['Projetos'], summary: 'Marcar ou desmarcar uma etapa de um cliente', params: Marca, body: ProjetoMarcarSchema } },
    async (req) => {
      const r = await svc.marcar(app.db, req.params.id, req.params.linhaId, req.params.stepId, req.body.feito, req.user!.id);
      await app.audit(req, {
        action: 'update', entityType: 'project', entityId: req.params.id,
        summary: `${req.body.feito ? 'Marcou' : 'Desmarcou'} "${r.etapa.title}" de ${r.clientName}`,
      });
      return r.linha;
    });

  app.patch('/:id/clientes/:linhaId', { preHandler: app.requirePermission('projects.work'), schema: { tags: ['Projetos'], summary: 'Trocar o responsável ou a situação de um cliente no projeto', params: Linha, body: ProjetoLinhaSchema } },
    async (req) => {
      const { linha, clientName } = await svc.setLinha(app.db, req.params.id, req.params.linhaId, req.body, req.user!.id);
      await app.audit(req, {
        action: 'update', entityType: 'project', entityId: req.params.id,
        summary: `${clientName}: ${req.body.status ? `situação → ${linha.status}` : 'trocou o responsável'}${linha.blockedReason ? ` (${linha.blockedReason})` : ''}`,
      });
      return linha;
    });

  app.post('/:id/comentarios', { preHandler: app.requirePermission('projects.work'), schema: { tags: ['Projetos'], summary: 'Comentar no projeto ou num cliente dele', params: Id, body: ProjetoComentarioSchema } },
    async (req, reply) => {
      const row = await svc.comentar(app.db, req.params.id, req.user!.id, req.body.body, req.body.projectClientId);
      await app.audit(req, { action: 'create', entityType: 'project', entityId: req.params.id, summary: `Comentou no projeto` });
      return reply.status(201).send(row);
    });

  app.delete('/:id/comentarios/:linhaId', { preHandler: app.requirePermission('projects.work'), schema: { tags: ['Projetos'], summary: 'Apagar um comentário (o seu, ou qualquer um se você gerencia)', params: Linha } },
    async (req) => {
      await svc.apagarComentario(app.db, req.params.id, req.params.linhaId, req.user!.id, req.user!.permissions.includes('projects.manage'));
      await app.audit(req, { action: 'delete', entityType: 'project', entityId: req.params.id, summary: 'Apagou um comentário do projeto' });
      return { ok: true };
    });

  app.post('/:id/anexos', { preHandler: app.requirePermission('projects.work'), schema: { tags: ['Projetos'], summary: 'Anexar um arquivo (qualquer formato, até 10 MB)', params: Id, body: ProjetoAnexoSchema } },
    async (req, reply) => {
      const row = await svc.anexar(app.db, req.params.id, req.user!.id, req.body);
      await app.audit(req, { action: 'create', entityType: 'project', entityId: req.params.id, summary: `Anexou "${row.fileName}" ao projeto` });
      return reply.status(201).send({ id: row.id, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes, projectClientId: row.projectClientId, createdAt: row.createdAt });
    });

  app.delete('/:id/anexos/:linhaId', { preHandler: app.requirePermission('projects.work'), schema: { tags: ['Projetos'], summary: 'Tirar um anexo', params: Linha } },
    async (req) => {
      const row = await svc.apagarAnexo(app.db, req.params.id, req.params.linhaId, req.user!.id, req.user!.permissions.includes('projects.manage'));
      await app.audit(req, { action: 'delete', entityType: 'project', entityId: req.params.id, summary: `Tirou o anexo "${row.fileName}"` });
      return { ok: true };
    });

  // ---- gerenciar: criar o projeto, as etapas e a lista ----
  app.post('/', { preHandler: app.requirePermission('projects.manage'), schema: { tags: ['Projetos'], summary: 'Criar um projeto', body: ProjetoGravarSchema } },
    async (req, reply) => {
      const p = await svc.create(app.db, req.body);
      await app.audit(req, { action: 'create', entityType: 'project', entityId: p.id, summary: `Criou o projeto "${p.name}" com ${p.clientes.length} cliente(s)` });
      return reply.status(201).send(p);
    });

  app.patch('/:id', { preHandler: app.requirePermission('projects.manage'), schema: { tags: ['Projetos'], summary: 'Editar o projeto, as etapas e a lista', params: Id, body: ProjetoAtualizarSchema } },
    async (req) => {
      const { antes, depois } = await svc.update(app.db, req.params.id, req.body);
      await app.audit(req, {
        action: 'update', entityType: 'project', entityId: depois.id,
        summary: req.body.status && req.body.status !== antes.status ? `Projeto "${depois.name}": ${req.body.status}` : `Editou o projeto "${depois.name}"`,
        before: { name: antes.name, status: antes.status, dueDate: antes.dueDate },
        after: { name: depois.name, status: depois.status, dueDate: depois.dueDate },
      });
      return depois;
    });

  app.post('/:id/clientes', { preHandler: app.requirePermission('projects.manage'), schema: { tags: ['Projetos'], summary: 'Acrescentar clientes à lista', params: Id, body: ProjetoClientesSchema } },
    async (req) => {
      const { entraram, projeto } = await svc.addClients(app.db, req.params.id, req.body.clientIds, req.body.assigneeId);
      await app.audit(req, { action: 'update', entityType: 'project', entityId: req.params.id, summary: `Acrescentou ${entraram} cliente(s) ao projeto "${projeto.name}"` });
      return projeto;
    });

  app.delete('/:id/clientes/:linhaId', { preHandler: app.requirePermission('projects.manage'), schema: { tags: ['Projetos'], summary: 'Tirar um cliente da lista (apaga o que já foi marcado nele)', params: Linha } },
    async (req) => {
      const { clientName } = await svc.removeClient(app.db, req.params.id, req.params.linhaId);
      await app.audit(req, { action: 'delete', entityType: 'project', entityId: req.params.id, summary: `Tirou ${clientName} do projeto` });
      return { ok: true };
    });

  app.delete('/:id', { preHandler: app.requirePermission('projects.manage'), schema: { tags: ['Projetos'], summary: 'Mandar o projeto para a lixeira', params: Id } },
    async (req) => {
      const p = await svc.softDelete(app.db, req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'project', entityId: p.id, summary: `Mandou o projeto "${p.name}" para a lixeira` });
      return { ok: true };
    });
};

export default routes;
