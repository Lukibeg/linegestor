/** Sessão: entrar, sair, quem sou eu. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import argon2 from 'argon2';
import qrcode from 'qrcode';
import { eq } from 'drizzle-orm';
import { roles, users } from '@gestor/db';
import { CodigoSegundaEtapaSchema, DesligarSegundaEtapaSchema, LoginSchema, MinhaContaSchema } from '@gestor/shared';
import { BadRequest, Unauthorized } from '../plugins/errors.js';
import * as duasEtapas from '../services/twofactor.js';

const MeSchema = z.object({
  id: z.string(), name: z.string(), email: z.string(), roleId: z.string(), roleName: z.string(), roleKey: z.string().nullable(), permissions: z.array(z.string()),
  /** Se esta conta usa o código de 6 dígitos, e quantos códigos de recuperação sobraram */
  twoFactor: z.boolean().default(false),
  recoveryLeft: z.number().default(0),
  /** O usuário SSH desta pessoa, que entra no atalho "SSH" das fichas */
  sshUser: z.string().nullable().default(null),
});

/**
 * A entrada tem duas respostas possíveis:
 *  - `needsCode: false` + `user` → entrou, acabou
 *  - `needsCode: true` + `user: null` → senha certa, agora falta o código de 6 dígitos
 */
const EntradaSchema = z.object({ needsCode: z.boolean(), user: MeSchema.nullable() });

const comoMe = (u: { id: string; name: string; email: string; roleId: string; roleName: string; roleKey: string | null; permissions: string[]; totpEnabledAt?: Date | null; totpRecovery?: string | null; sshUser?: string | null }) => ({
  id: u.id, name: u.name, email: u.email, roleId: u.roleId, roleName: u.roleName, roleKey: u.roleKey, permissions: u.permissions,
  twoFactor: !!u.totpEnabledAt, recoveryLeft: duasEtapas.quantosRestam(u.totpRecovery ?? null),
  sshUser: u.sshUser ?? null,
});

const routes: FastifyPluginAsyncZod = async (app) => {
  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { tags: ['Sessão'], summary: 'Entrar com e-mail e senha', body: LoginSchema, response: { 200: EntradaSchema } },
  }, async (req, reply) => {
    const [u] = await app.db
      .select({ id: users.id, name: users.name, email: users.email, passwordHash: users.passwordHash, active: users.active, roleId: users.roleId, roleName: roles.name, roleKey: roles.key, permissions: roles.permissions, totpEnabledAt: users.totpEnabledAt, totpRecovery: users.totpRecovery, sshUser: users.sshUser })
      .from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.email, req.body.email)).limit(1);
    // mesma mensagem para "não existe" e "senha errada": não revelar quais e-mails existem
    if (!u || !u.active || !(await argon2.verify(u.passwordHash, req.body.password))) {
      await app.audit(req, { action: 'login_failed', entityType: 'user', summary: `Tentativa de login falhou para ${req.body.email}` });
      throw new Unauthorized('E-mail ou senha incorretos');
    }
    // com duas etapas ligadas, a senha certa só abre meia porta: a sessão nasce pendente
    if (u.totpEnabledAt) {
      await app.createSession(req, reply, u.id, { pendingTotp: true });
      return { needsCode: true, user: null };
    }
    await app.createSession(req, reply, u.id);
    await app.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
    await app.audit({ user: { id: u.id }, ip: req.ip }, { action: 'login', entityType: 'user', entityId: u.id, summary: `${u.name} entrou` });
    return { needsCode: false, user: comoMe(u) };
  });

  app.post('/login/code', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    schema: { tags: ['Sessão'], summary: 'Segunda etapa: o código de 6 dígitos (ou um de recuperação)', body: CodigoSegundaEtapaSchema, response: { 200: MeSchema } },
  }, async (req, reply) => {
    const pendente = req.pendingUserId;
    if (!pendente) throw new Unauthorized('Entre com e-mail e senha primeiro');
    const resultado = await duasEtapas.conferirEntrada(app.db, app.vault, pendente, req.body.code);
    if (resultado === 'nao') {
      await app.audit({ user: { id: pendente }, ip: req.ip }, { action: 'login_failed', entityType: 'user', entityId: pendente, summary: 'Código de verificação incorreto' });
      throw new Unauthorized('Código incorreto. Confira o aplicativo e tente de novo.');
    }
    await app.confirmSession(req);
    const [u] = await app.db
      .select({ id: users.id, name: users.name, email: users.email, roleId: users.roleId, roleName: roles.name, roleKey: roles.key, permissions: roles.permissions, totpEnabledAt: users.totpEnabledAt, totpRecovery: users.totpRecovery, sshUser: users.sshUser })
      .from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, pendente)).limit(1);
    if (!u) throw new Unauthorized();
    await app.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
    await app.audit({ user: { id: u.id }, ip: req.ip }, {
      action: 'login', entityType: 'user', entityId: u.id,
      summary: resultado === 'recuperacao' ? `${u.name} entrou usando um código de recuperação` : `${u.name} entrou (com verificação em duas etapas)`,
    });
    void reply;
    return comoMe(u);
  });

  app.post('/logout', { schema: { tags: ['Sessão'], summary: 'Sair', response: { 200: z.object({ ok: z.boolean() }) } } }, async (req, reply) => {
    if (req.user) await app.audit(req, { action: 'logout', entityType: 'user', entityId: req.user.id, summary: `${req.user.name} saiu` });
    await app.destroySession(req, reply);
    return { ok: true };
  });

  app.get('/me', { schema: { tags: ['Sessão'], summary: 'Quem está logado e o que pode fazer', response: { 200: MeSchema } } }, async (req) => {
    if (!req.user) throw new Unauthorized();
    const [u] = await app.db.select({ totpEnabledAt: users.totpEnabledAt, totpRecovery: users.totpRecovery, sshUser: users.sshUser }).from(users).where(eq(users.id, req.user.id)).limit(1);
    return comoMe({ ...req.user, ...u });
  });

  app.patch('/me', {
    preHandler: app.requireLogin,
    schema: { tags: ['Sessão'], summary: 'Ajustar a própria conta (usuário SSH)', body: MinhaContaSchema, response: { 200: MeSchema } },
  }, async (req) => {
    const sshUser = req.body.sshUser?.trim() || null;
    await app.db.update(users).set({ sshUser, updatedAt: new Date() }).where(eq(users.id, req.user!.id));
    await app.audit(req, { action: 'update', entityType: 'user', entityId: req.user!.id, summary: `${req.user!.name} ${sshUser ? `definiu o próprio usuário SSH (${sshUser})` : 'tirou o próprio usuário SSH'}` });
    const [u] = await app.db.select({ totpEnabledAt: users.totpEnabledAt, totpRecovery: users.totpRecovery, sshUser: users.sshUser }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    return comoMe({ ...req.user!, ...u });
  });

  // ---------- verificação em duas etapas, na própria conta ----------

  app.post('/two-factor/setup', {
    preHandler: app.requireLogin,
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    schema: {
      tags: ['Sessão'], summary: 'Começar a ligar a verificação em duas etapas (gera o QR Code)',
      response: { 200: z.object({ secret: z.string(), uri: z.string(), qrSvg: z.string() }) },
    },
  }, async (req) => {
    const { secret, uri } = await duasEtapas.preparar(app.db, app.vault, req.user!);
    const qrSvg = await qrcode.toString(uri, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
    await app.audit(req, { action: 'two_factor_setup', entityType: 'user', entityId: req.user!.id, summary: `${req.user!.name} começou a ligar a verificação em duas etapas` });
    return { secret, uri, qrSvg };
  });

  app.post('/two-factor/enable', {
    preHandler: app.requireLogin,
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    schema: {
      tags: ['Sessão'], summary: 'Confirmar o primeiro código e ligar de vez',
      body: CodigoSegundaEtapaSchema, response: { 200: z.object({ recovery: z.array(z.string()) }) },
    },
  }, async (req) => {
    const r = await duasEtapas.ligar(app.db, app.vault, req.user!.id, req.body.code);
    if (!r.ok) throw new BadRequest(r.motivo === 'sem-rascunho' ? 'Gere o QR Code antes de confirmar' : 'Código incorreto. O relógio do celular está certo?');
    await app.audit(req, { action: 'two_factor_on', entityType: 'user', entityId: req.user!.id, summary: `${req.user!.name} ligou a verificação em duas etapas` });
    return { recovery: r.recuperacao };
  });

  app.post('/two-factor/disable', {
    preHandler: app.requireLogin,
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    schema: {
      tags: ['Sessão'], summary: 'Desligar a verificação em duas etapas (pede a senha)',
      body: DesligarSegundaEtapaSchema, response: { 200: z.object({ ok: z.boolean() }) },
    },
  }, async (req) => {
    const [u] = await app.db.select().from(users).where(eq(users.id, req.user!.id));
    if (!u || !(await argon2.verify(u.passwordHash, req.body.password))) throw new Unauthorized('Senha incorreta');
    await duasEtapas.desligar(app.db, req.user!.id);
    await app.audit(req, { action: 'two_factor_off', entityType: 'user', entityId: req.user!.id, summary: `${req.user!.name} desligou a verificação em duas etapas` });
    return { ok: true };
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
