/**
 * Portal do cliente — o lado do cliente (Patch 1.8, decisão 0040).
 *
 * Login separado do da equipe: outra tabela (`portal_users`), outra sessão (`portal_sessions`) e
 * outro cookie (`gestor_portal`). Nada daqui abre o Gestor, e a sessão da equipe não vale aqui.
 * O cookie é `lax` (o da equipe é `strict`): o link do tutorial chega pelo WhatsApp e precisa
 * abrir já logado. Quem pode entrar é conferido a cada pedido — saiu da base, caiu.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { numeroDoCaminho, PortalCriarSenhaSchema, PortalEntrarSchema, PortalTrocarSenhaSchema } from '@gestor/shared';
import { NotFound, Unauthorized } from '../plugins/errors.js';
import * as svc from '../services/portal.js';
import { mandarArquivo } from './portalArquivo.js';

export const COOKIE_PORTAL = 'gestor_portal';

declare module 'fastify' {
  interface FastifyRequest {
    portal: svc.SessaoPortal | null;
    portalMotivo: svc.MotivoSemSessao;
  }
}

const routes: FastifyPluginAsyncZod = async (app) => {
  const cookieOpts = {
    path: '/', httpOnly: true, sameSite: 'lax' as const, secure: app.config.NODE_ENV === 'production', signed: true,
    maxAge: svc.DIAS_DA_SESSAO * 24 * 60 * 60,
  };
  app.decorateRequest('portal', null);
  app.decorateRequest('portalMotivo', null);

  app.addHook('onRequest', async (req) => {
    req.portal = null;
    req.portalMotivo = null;
    const raw = req.cookies[COOKIE_PORTAL];
    if (!raw) return;
    const assinado = req.unsignCookie(raw);
    if (!assinado.valid || !assinado.value) return;
    const { sessao, motivo } = await svc.lerSessao(app.db, assinado.value);
    req.portal = sessao;
    req.portalMotivo = motivo;
  });

  const logado = async (req: FastifyRequest) => {
    if (req.portal) return;
    throw new Unauthorized(req.portalMotivo ? 'Seu acesso ao portal está suspenso. Fale com o suporte da Ingline.' : 'Entre para ver');
  };
  const s = (req: FastifyRequest) => req.portal!;
  const abrirSessao = async (req: FastifyRequest, reply: FastifyReply, portalUserId: string) => {
    const sid = await svc.criarSessao(app.db, portalUserId, req.ip, req.headers['user-agent']);
    reply.setCookie(COOKIE_PORTAL, sid, cookieOpts);
    return sid;
  };
  const tag = { tags: ['Portal do cliente'] };
  // contra quem tenta adivinhar senha ou convite; nos testes, que entram muitas vezes seguidas, o limite é folgado
  const limite = (max: number) => ({ rateLimit: { max: app.config.NODE_ENV === 'test' ? 1000 : max, timeWindow: '1 minute' } });

  /** Quem sou eu, para a tela (o nome, o cliente e o nome do portal). */
  const eu = async (sessao: svc.SessaoPortal) => ({
    nome: sessao.usuario.nome, email: sessao.usuario.email,
    cliente: { nome: sessao.cliente.nome, logo: sessao.cliente.temLogo ? 'portal/logo' : null },
    portal: await svc.lerAjustes(app.db),
  });

  // ---------- entrar e sair ----------

  app.post('/entrar', {
    config: limite(10),
    schema: { ...tag, summary: 'Entrar com e-mail e senha', body: PortalEntrarSchema },
  }, async (req, reply) => {
    let u;
    try { u = await svc.entrar(app.db, req.body.email, req.body.senha); } catch (e) {
      await app.audit(req, { action: 'login_failed', entityType: 'portal', summary: `Tentativa de entrar no portal falhou para ${req.body.email}` });
      throw e;
    }
    const { sessao } = await svc.lerSessao(app.db, await abrirSessao(req, reply, u.id));
    return eu(sessao!);
  });

  app.post('/sair', { schema: { ...tag, summary: 'Sair' } }, async (req, reply) => {
    if (req.portal) await svc.destruirSessao(app.db, req.portal.sid);
    reply.clearCookie(COOKIE_PORTAL, { path: '/' });
    return { ok: true };
  });

  app.get('/eu', { preHandler: logado, schema: { ...tag, summary: 'Quem está no portal' } }, async (req) => eu(s(req)));

  /** O que a tela de entrar mostra antes do login (o nome do portal e o contato do suporte). */
  app.get('/sobre', { schema: { ...tag, summary: 'O nome do portal e o contato do suporte (antes de entrar)' } }, async () => {
    const a = await svc.lerAjustes(app.db);
    return { titulo: a.titulo, whatsapp: a.whatsapp ?? null, email: a.email || null, horario: a.horario ?? null };
  });

  // ---------- o convite ----------

  const Codigo = z.object({ codigo: z.string().min(20).max(100) });

  app.get('/convite/:codigo', { config: limite(30), schema: { ...tag, summary: 'O convite ainda vale? (quem é e de qual cliente)', params: Codigo } },
    async (req) => {
      const { u, cliente, trocando } = await svc.lerConvite(app.db, req.params.codigo);
      return { nome: u.name, email: u.email, cliente, trocando };
    });

  app.post('/convite/:codigo', {
    config: limite(10),
    schema: { ...tag, summary: 'Criar (ou trocar) a senha pelo convite; já entra', params: Codigo, body: PortalCriarSenhaSchema },
  }, async (req, reply) => {
    const u = await svc.criarSenha(app.db, req.params.codigo, req.body.senha);
    await app.audit(req, { action: 'update', entityType: 'portal', entityId: u.id, summary: `${u.name} (${u.email}) ${u.passwordHash ? 'trocou a senha' : 'criou a senha'} do portal pelo convite` });
    await abrirSessao(req, reply, u.id);
    return { ok: true };
  });

  app.post('/senha', { preHandler: logado, schema: { ...tag, summary: 'Trocar a senha (as outras sessões caem)', body: PortalTrocarSenhaSchema } },
    async (req) => {
      await svc.trocarSenha(app.db, s(req), req.body.atual, req.body.nova);
      return { ok: true };
    });

  // ---------- o conteúdo ----------

  app.get('/inicio', { preHandler: logado, schema: { ...tag, summary: 'A página inicial: os produtos, os destaques e os novos' } },
    async (req) => svc.inicio(app.db, s(req)));

  app.get('/tutoriais', { preHandler: logado, schema: { ...tag, summary: 'Os tutoriais que este cliente vê (busca e produto)', querystring: z.object({ q: z.string().trim().max(200).optional(), produto: z.string().optional() }) } },
    async (req) => svc.tutoriaisDoCliente(app.db, s(req), req.query));

  app.get('/tutoriais/:numero', { preHandler: logado, schema: { ...tag, summary: 'Um tutorial (pelo número, ou "12-como-transferir…")', params: z.object({ numero: z.string() }) } },
    async (req) => {
      const n = numeroDoCaminho(req.params.numero);
      if (n == null) throw new NotFound('Tutorial');
      return svc.tutorialDoCliente(app.db, s(req), n);
    });

  app.get('/arquivos/:id', { preHandler: logado, schema: { ...tag, summary: 'Um arquivo de um tutorial que este cliente vê (o vídeo com Range)', params: z.object({ id: z.string() }) } },
    async (req, reply) => mandarArquivo(req, reply, await svc.arquivoParaCliente(app.db, s(req), req.params.id)));

  app.get('/logo', { preHandler: logado, schema: { ...tag, summary: 'A logo do cliente' } }, async (req, reply) => {
    const l = await svc.logoDoCliente(app.db, s(req).cliente.id);
    // a logo pode ser SVG: aberta sozinha, não roda nada
    return reply.header('Content-Type', l.mimeType).header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'").header('Cache-Control', 'private, max-age=3600').send(l.buffer);
  });
};


export default routes;
