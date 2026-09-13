/** Sessão: entrar, sair, quem sou eu. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { roles, users } from '@gestor/db';
import { LoginSchema } from '@gestor/shared';
import { Unauthorized } from '../plugins/errors.js';

const MeSchema = z.object({
  id: z.string(), name: z.string(), email: z.string(), roleId: z.string(), roleName: z.string(), roleKey: z.string().nullable(), permissions: z.array(z.string()),
});

const routes: FastifyPluginAsyncZod = async (app) => {
  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { tags: ['Sessão'], summary: 'Entrar com e-mail e senha', body: LoginSchema, response: { 200: MeSchema } },
  }, async (req, reply) => {
    const [u] = await app.db
      .select({ id: users.id, name: users.name, email: users.email, passwordHash: users.passwordHash, active: users.active, roleId: users.roleId, roleName: roles.name, roleKey: roles.key, permissions: roles.permissions })
      .from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.email, req.body.email)).limit(1);
    // mesma mensagem para "não existe" e "senha errada": não revelar quais e-mails existem
    if (!u || !u.active || !(await argon2.verify(u.passwordHash, req.body.password))) {
      await app.audit(req, { action: 'login_failed', entityType: 'user', summary: `Tentativa de login falhou para ${req.body.email}` });
      throw new Unauthorized('E-mail ou senha incorretos');
    }
    await app.createSession(req, reply, u.id);
    await app.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
    await app.audit({ user: { id: u.id }, ip: req.ip }, { action: 'login', entityType: 'user', entityId: u.id, summary: `${u.name} entrou` });
    return { id: u.id, name: u.name, email: u.email, roleId: u.roleId, roleName: u.roleName, roleKey: u.roleKey, permissions: u.permissions };
  });

  app.post('/logout', { schema: { tags: ['Sessão'], summary: 'Sair', response: { 200: z.object({ ok: z.boolean() }) } } }, async (req, reply) => {
    if (req.user) await app.audit(req, { action: 'logout', entityType: 'user', entityId: req.user.id, summary: `${req.user.name} saiu` });
    await app.destroySession(req, reply);
    return { ok: true };
  });

  app.get('/me', { schema: { tags: ['Sessão'], summary: 'Quem está logado e o que pode fazer', response: { 200: MeSchema } } }, async (req) => {
    if (!req.user) throw new Unauthorized();
    return req.user;
  });

  app.post('/change-password', {
    preHandler: app.requireLogin,
    schema: {
      tags: ['Sessão'], summary: 'Trocar a própria senha',
      body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10, 'A nova senha precisa ter pelo menos 10 caracteres') }),
      response: { 200: z.object({ ok: z.boolean() }) },
    },
  }, async (req) => {
    const [u] = await app.db.select().from(users).where(eq(users.id, req.user!.id));
    if (!u || !(await argon2.verify(u.passwordHash, req.body.currentPassword))) throw new Unauthorized('Senha atual incorreta');
    await app.db.update(users).set({ passwordHash: await argon2.hash(req.body.newPassword), updatedAt: new Date() }).where(eq(users.id, u.id));
    await app.audit(req, { action: 'change_password', entityType: 'user', entityId: u.id, summary: `${u.name} trocou a própria senha` });
    return { ok: true };
  });
};

export default routes;
