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
    /** Quem entrou com a senha certa mas ainda deve o código de 6 dígitos. */
    pendingUserId: string | null;
  }
  interface FastifyInstance {
    requirePermission: (perm: Permission) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireLogin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** `embutido`: a tela de entrada está dentro de outro site (o Gestor no menu do LineChat, num iframe). */
    createSession: (req: FastifyRequest, reply: FastifyReply, userId: string, opts?: { pendingTotp?: boolean; embutido?: boolean }) => Promise<void>;
    /** Promove a sessão que estava esperando o código de 6 dígitos a sessão de verdade. */
    confirmSession: (req: FastifyRequest) => Promise<void>;
    destroySession: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const COOKIE = 'gestor_session';

export default fp(async function authPlugin(app: FastifyInstance) {
  const days = app.config.SESSION_DAYS;
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    // 'strict': o cookie não viaja em pedido que venha de outro site — trava CSRF na raiz.
    // Efeito colateral: clicar num link externo para o sistema abre deslogado na primeira vez.
    sameSite: 'strict' as const,
    secure: app.config.NODE_ENV === 'production',
    signed: true,
    maxAge: days * 24 * 60 * 60,
  };
  /**
   * O cookie da sessão aberta DENTRO de outro site (o Gestor no menu do LineChat, num iframe; 1.10).
   * Com 'strict' o navegador nem manda o cookie de dentro do iframe (o site de cima é outro) e o login
   * não funcionaria. Então: 'none' + secure (o navegador só aceita os dois juntos) + partitioned (CHIPS):
   * o cookie fica preso ao site de fora — vale só dentro dele, e não serve para o Gestor aberto direto
   * nem para outro site que tente abrir o Gestor. Fora do iframe nada muda: continua 'strict'. Sem o
   * 'strict', quem segura o pedido forjado é a conferência da origem (`plugins/seguranca.ts`).
   */
  const cookieEmbutido = { ...cookieOpts, sameSite: 'none' as const, secure: true, partitioned: true };

  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);
  app.decorateRequest('pendingUserId', null);

  app.addHook('onRequest', async (req) => {
    req.user = null;
    req.sessionId = null;
    req.pendingUserId = null;
    const raw = req.cookies[COOKIE];
    if (!raw) return;
    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;
    const sid = unsigned.value;
    const [row] = await app.db
      .select({
        sid: sessions.id, expiresAt: sessions.expiresAt, pendingTotp: sessions.pendingTotp,
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
    // sessão à espera do segundo fator: existe, mas ainda não vale como login
    if (row.pendingTotp) { req.pendingUserId = row.id; return; }
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

  app.decorate('createSession', async (req: FastifyRequest, reply: FastifyReply, userId: string, opts?: { pendingTotp?: boolean; embutido?: boolean }) => {
    const id = randomBytes(32).toString('base64url');
    const pendente = opts?.pendingTotp === true;
    await app.db.insert(sessions).values({
      id, userId, pendingTotp: pendente,
      // a sessão à espera do código dura 10 minutos, não os dias de uma sessão normal
      expiresAt: new Date(Date.now() + (pendente ? 10 * 60 * 1000 : days * 86400000)),
      ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
    });
    // Os 10 minutos da sessão pendente valem no banco (é lá que a validade é conferida). O cookie já nasce
    // com a validade inteira porque, confirmado o código, é ele mesmo que continua valendo: com 10 minutos
    // no cookie, o navegador deslogava quem usa as duas etapas 10 minutos depois de entrar. E a sessão
    // pendente aberta dentro de outro site recebe o cookie do iframe, como a normal.
    reply.setCookie(COOKIE, id, opts?.embutido ? cookieEmbutido : cookieOpts);
  });

  app.decorate('confirmSession', async (req: FastifyRequest) => {
    if (!req.sessionId) return;
    await app.db.update(sessions)
      .set({ pendingTotp: false, expiresAt: new Date(Date.now() + days * 86400000) })
      .where(eq(sessions.id, req.sessionId));
  });

  app.decorate('destroySession', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.sessionId) await app.db.delete(sessions).where(eq(sessions.id, req.sessionId));
    // o pedido não diz se o cookie é o normal ou o do iframe: apaga os dois (o do iframe só se apaga com
    // os mesmos atributos dele; fora do iframe, esse segundo não acha nada e não faz mal)
    reply.header('Set-Cookie', app.serializeCookie(COOKIE, '', { path: '/', httpOnly: true, sameSite: 'none', secure: true, partitioned: true, maxAge: 0, expires: new Date(0) }));
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
