/**
 * Revelar uma senha guardada. É a única porta pela qual um segredo sai do cofre.
 * Exige: estar logado, ter `secrets.reveal`, e confirmar a própria senha de novo.
 * Sempre registra na auditoria quem revelou o quê.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { users } from '@gestor/db';
import { NotFound, Unauthorized } from '../plugins/errors.js';

const routes: FastifyPluginAsyncZod = async (app) => {
  app.post('/:id/reveal', {
    preHandler: app.requirePermission('secrets.reveal'),
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: {
      tags: ['Segredos'], summary: 'Revelar uma senha (exige confirmar a própria senha; fica registrado)',
      params: z.object({ id: z.string() }),
      body: z.object({ password: z.string().min(1, 'Confirme sua senha') }),
      response: { 200: z.object({ label: z.string(), value: z.string(), visibleForSeconds: z.number() }) },
    },
  }, async (req) => {
    const [u] = await app.db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, req.user!.id));
    if (!u || !(await argon2.verify(u.hash, req.body.password))) throw new Unauthorized('Senha incorreta');
    const s = await app.vault.read(app.db, req.params.id);
    if (!s) throw new NotFound('Segredo');
    await app.audit(req, { action: 'reveal_secret', entityType: 'secret', entityId: req.params.id, summary: `${req.user!.name} revelou "${s.label}"` });
    return { label: s.label, value: s.value, visibleForSeconds: app.config.REVEAL_SECONDS };
  });
};

export default routes;
