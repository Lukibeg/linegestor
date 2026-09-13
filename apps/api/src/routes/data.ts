/** Importar e exportar CSV. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ImportacaoSchema } from '@gestor/shared';
import * as svc from '../services/importExport.js';
import { Forbidden } from '../plugins/errors.js';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { users } from '@gestor/db';

const routes: FastifyPluginAsyncZod = async (app) => {
  app.post('/import/preview', { preHandler: app.requirePermission('data.import'), schema: { tags: ['Dados'], summary: 'Pré-visualizar importação: o que cada linha vai fazer (criar, atualizar, erro). Nada é gravado.', body: ImportacaoSchema } },
    async (req) => {
      const p = await svc.plan(app.db, req.body.entity, req.body.csv, req.body.delimiter);
      return { ...p, rows: p.rows.map((r) => ({ ...r, data: { ...r.data, sshPassword: undefined, authPassword: undefined } })) };
    });

  app.post('/import/apply', { preHandler: app.requirePermission('data.import'), schema: { tags: ['Dados'], summary: 'Aplicar a importação (transação: tudo ou nada). Recusa se houver linhas com erro.', body: ImportacaoSchema } },
    async (req) => {
      const p = await svc.plan(app.db, req.body.entity, req.body.csv, req.body.delimiter);
      const r = await svc.apply(app.db, app.vault, p, req.user!.id);
      await app.audit(req, { action: 'import', entityType: req.body.entity, summary: `Importou ${req.body.entity}: ${r.created} criado(s), ${r.updated} atualizado(s)` });
      return { ...r, summary: p.summary };
    });

  app.get('/export/:entity', { preHandler: app.requirePermission('data.export'), schema: { tags: ['Dados'], summary: 'Exportar CSV (sem senhas)', params: z.object({ entity: z.enum(['clients', 'circuits', 'dids']) }) } },
    async (req, reply) => {
      const { filename, csv } = await svc.exportCsv(app.db, app.vault, req.params.entity, false);
      await app.audit(req, { action: 'export', entityType: req.params.entity, summary: `Exportou ${req.params.entity} (sem senhas)` });
      return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${filename}"`).send(csv);
    });

  app.post('/export/:entity/with-secrets', {
    preHandler: app.requirePermission('data.export_secrets'),
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    schema: { tags: ['Dados'], summary: 'Exportar COM senhas: exige confirmar a própria senha; sai como ZIP protegido; fica registrado', params: z.object({ entity: z.enum(['clients', 'circuits']) }), body: z.object({ password: z.string().min(1) }) },
  }, async (req, reply) => {
    const [u] = await app.db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, req.user!.id));
    if (!u || !(await argon2.verify(u.hash, req.body.password))) throw new Forbidden('Senha incorreta');
    const { filename, csv } = await svc.exportCsv(app.db, app.vault, req.params.entity, true);
    const { zip, password } = await svc.zipWithPassword(filename, csv);
    await app.audit(req, { action: 'export_secrets', entityType: req.params.entity, summary: `${req.user!.name} exportou ${req.params.entity} COM SENHAS (ZIP protegido)` });
    return reply.header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="${filename.replace('.csv', '')}-com-senhas.zip"`).header('X-Zip-Password', password).send(zip);
  });
};

export default routes;
