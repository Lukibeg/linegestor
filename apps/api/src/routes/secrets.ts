/**
 * Revelar uma senha guardada. É a única porta pela qual um segredo sai do cofre.
 * Exige: estar logado e ter `secrets.reveal`. Sempre registra na auditoria quem revelou o quê.
 * Até o 2.2 pedia também a confirmação da própria senha; saiu a pedido do Luan (28/10, "pode fazer", revendo a 0003),
 * como já era no Ver a senha do portal. O `password` ainda é aceito (e ignorado) para quem mandar.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotFound } from '../plugins/errors.js';

const routes: FastifyPluginAsyncZod = async (app) => {
  app.post('/:id/reveal', {
    preHandler: app.requirePermission('secrets.reveal'),
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: {
      tags: ['Segredos'], summary: 'Revelar uma senha (fica registrado)',
      params: z.object({ id: z.string() }),
      body: z.object({ password: z.string().optional() }).optional(),
      response: { 200: z.object({ label: z.string(), value: z.string(), visibleForSeconds: z.number() }) },
    },
  }, async (req) => {
    const s = await app.vault.read(app.db, req.params.id);
    if (!s) throw new NotFound('Segredo');
    await app.audit(req, { action: 'reveal_secret', entityType: 'secret', entityId: req.params.id, summary: `${req.user!.name} revelou "${s.label}"` });
    return { label: s.label, value: s.value, visibleForSeconds: app.config.REVEAL_SECONDS };
  });
};

export default routes;
