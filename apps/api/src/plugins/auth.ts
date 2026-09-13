/**
 * Autenticação e autorização.
 *
 * - Sessão: ao entrar, criamos uma linha em `sessions` e mandamos o id num cookie assinado e httpOnly
 *   (o navegador guarda, mas o JavaScript da página não consegue ler). Expira em SESSION_DAYS sem uso.
 * - Em toda requisição: lemos o cookie, buscamos sessão + usuário + papel e colocamos em `request.user`.
 * - `requirePermission('x')` é a "porta": a rota só roda se o usuário tiver aquela permissão.
 */
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { newId, roles, sessions, users } from '@gestor/db';
import type { Permission } from '@gestor/shared';
import { Forbidden, Unauthorized } from './errors.js';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  roleKey: string | null;
  permissions: string[];
};

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
  }
  interface FastifyInstance {
    requirePermission: (perm: Permission) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireLogin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    createSession: (req: FastifyRequest, reply: FastifyReply, userId: string) => Promise<void>;
    destroySession: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const COOKIE = 'gestor_session';

export default fp(async function authPlugin(app: FastifyInstance) {
  const days = app.config.SESSION_DAYS;
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: app.config.NODE_ENV === 'production',
    signed: true,
    maxAge: days * 24 * 60 * 60,
  };

  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (req) => {
    req.user = null;
    req.sessionId = null;
    const raw = req.cookies[COOKIE];
    if (!raw) return;
    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;
    const sid = unsigned.value;
    const [row] = await app.db
      .select({
        sid: sessions.id, expiresAt: sessions.expiresAt,
        id: users.id, name: users.name, email: users.email, active: users.active, roleId: users.roleId,
        roleName: roles.name, roleKey: roles.key, permissions: roles.permissions,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (!row || !row.active) return;
    req.sessionId = row.sid;
    req.user = { id: row.id, name: row.name, email: row.email, roleId: row.roleId, roleName: row.roleName, roleKey: row.roleKey, permissions: row.permissions };
    // sessão "deslizante": a cada uso, renova a validade (no máximo uma vez por hora para não escrever à toa)
    if (row.expiresAt.getTime() - Date.now() < (days * 24 - 1) * 60 * 60 * 1000) {
      await app.db.update(sessions).set({ expiresAt: new Date(Date.now() + days * 86400000) }).where(eq(sessions.id, sid));
    }
  });

  app.decorate('requireLogin', async (req: FastifyRequest) => {
    if (!req.user) throw new Unauthorized();
  });

  app.decorate('requirePermission', (perm: Permission) => async (req: FastifyRequest) => {
    if (!req.user) throw new Unauthorized();
    if (!req.user.permissions.includes(perm)) throw new Forbidden(`Esta ação exige a permissão "${perm}"`);
  });

  app.decorate('createSession', async (req: FastifyRequest, reply: FastifyReply, userId: string) => {
    const id = randomBytes(32).toString('base64url');
    await app.db.insert(sessions).values({
      id, userId, expiresAt: new Date(Date.now() + days * 86400000), ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
    });
    reply.setCookie(COOKIE, id, cookieOpts);
  });

  app.decorate('destroySession', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.sessionId) await app.db.delete(sessions).where(eq(sessions.id, req.sessionId));
    reply.clearCookie(COOKIE, { path: '/' });
  });

  // limpeza de sessões vencidas de vez em quando (não bloqueia nada)
  const timer = setInterval(() => {
    app.db.delete(sessions).where(lt(sessions.expiresAt, new Date())).catch(() => {});
  }, 60 * 60 * 1000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
});

// pequeno utilitário usado pelos testes e pelo seed
export { newId };
