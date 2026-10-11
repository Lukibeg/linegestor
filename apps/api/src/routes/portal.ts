/**
 * Portal do cliente — o lado do cliente (Patch 1.8, decisão 0040).
 *
 * Login separado do da equipe: outra tabela (`portal_users`), outra sessão (`portal_sessions`) e
 * outro cookie (`gestor_portal`). Nada daqui abre o Gestor, e a sessão da equipe não vale aqui.
 * O cookie é `lax` (o da equipe é `strict`): o link do tutorial chega pelo WhatsApp e precisa
 * abrir já logado. Quem pode entrar é conferido a cada pedido — saiu da base, caiu.
 * O login e a senha da pessoa são os que o suporte criou (decisão 0045, 1.9); o convite do 1.8 saiu.
 *
 * A equipe também entra aqui (decisão 0044), com o e-mail e a senha do Gestor — e o código de 6
 * dígitos, para quem usa (`/entrar` responde `precisaCodigo` e a tela manda tudo de novo, com o
 * código, para `/entrar/codigo`). É outra sessão, a do portal: entrar aqui não abre o Gestor.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { numeroDoCaminho, PortalEntrarComCodigoSchema, PortalEntrarSchema, PortalTrocarSenhaSchema } from '@gestor/shared';
import { NotFound, Unauthorized } from '../plugins/errors.js';
import * as svc from '../services/portal.js';
import * as duasEtapas from '../services/twofactor.js';
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
  const abrirSessao = async (req: FastifyRequest, reply: FastifyReply, dono: svc.DonoDaSessao) => {
    const sid = await svc.criarSessao(app.db, dono, req.ip, req.headers['user-agent']);
    reply.setCookie(COOKIE_PORTAL, sid, cookieOpts);
    return sid;
  };
  const tag = { tags: ['Portal do cliente'] };
  // contra quem tenta adivinhar a senha ou o código; nos testes, que entram muitas vezes seguidas, o limite é folgado
  const limite = (max: number, janela = '1 minute') => ({ rateLimit: { max: app.config.NODE_ENV === 'test' ? 1000 : max, timeWindow: janela } });

  /** Quem sou eu, para a tela (o nome, o login, o cliente — ou a equipe — e o nome do portal). */
  const eu = async (sessao: svc.SessaoPortal) => ({
    nome: sessao.usuario.nome, login: sessao.usuario.login, equipe: sessao.equipe,
    cliente: { nome: sessao.cliente.nome, logo: sessao.cliente.temLogo ? 'portal/logo' : null },
    portal: await svc.lerAjustes(app.db),
  });

  // ---------- entrar e sair ----------

  /** Login e senha conferidos; a falha vai para a auditoria (sem a senha, claro). */
  const conferirSenha = async (req: FastifyRequest, d: { login: string; senha: string }) => {
    try { return await svc.entrar(app.db, d.login, d.senha); } catch (e) {
      await app.audit(req, { action: 'login_failed', entityType: 'portal', summary: `Tentativa de entrar no portal falhou para ${d.login}` });
      throw e;
    }
  };

  /** Abre a sessão e responde quem entrou. A entrada da equipe fica na auditoria. */
  const abrirEResponder = async (req: FastifyRequest, reply: FastifyReply, r: svc.Entrada, como?: 'codigo' | 'recuperacao') => {
    if (r.tipo === 'equipe') {
      await app.audit({ user: { id: r.id }, ip: req.ip }, {
        action: 'login', entityType: 'portal', entityId: r.id,
        summary: `${r.nome} entrou no portal do cliente com o login da equipe${como === 'recuperacao' ? ', usando um código de recuperação' : como === 'codigo' ? ' (com verificação em duas etapas)' : ''}`,
      });
    }
    const sid = await abrirSessao(req, reply, r.tipo === 'equipe' ? { staffUserId: r.id } : { portalUserId: r.id });
    const { sessao } = await svc.lerSessao(app.db, sid);
    return eu(sessao!);
  };

  app.post('/entrar', {
    config: limite(10),
    schema: {
      ...tag, body: PortalEntrarSchema,
      summary: 'Entrar com login e senha (o acesso do cliente, ou o e-mail e a senha do Gestor para a equipe). Quem da equipe usa o código de 6 dígitos recebe { precisaCodigo: true }',
    },
  }, async (req, reply) => {
    const r = await conferirSenha(req, req.body);
    // com duas etapas ligadas no Gestor, a senha certa ainda não abre: falta o código (POST /entrar/codigo)
    if (r.tipo === 'equipe' && r.precisaCodigo) return { precisaCodigo: true as const };
    return abrirEResponder(req, reply, r);
  });

  app.post('/entrar/codigo', {
    // o mesmo limite da segunda etapa do Gestor: 10 tentativas a cada 5 minutos
    config: limite(10, '5 minutes'),
    schema: { ...tag, summary: 'Segunda etapa da equipe: e-mail, senha e o código de 6 dígitos (ou um de recuperação)', body: PortalEntrarComCodigoSchema },
  }, async (req, reply) => {
    const r = await conferirSenha(req, req.body);
    if (r.tipo !== 'equipe' || !r.precisaCodigo) return abrirEResponder(req, reply, r);
    const resultado = await duasEtapas.conferirEntrada(app.db, app.vault, r.id, req.body.codigo);
    if (resultado === 'nao') {
      await app.audit({ user: { id: r.id }, ip: req.ip }, { action: 'login_failed', entityType: 'portal', entityId: r.id, summary: 'Código de verificação incorreto ao entrar no portal do cliente' });
      throw new Unauthorized('Código incorreto. Confira o aplicativo e tente de novo.');
    }
    return abrirEResponder(req, reply, r, resultado === 'recuperacao' ? 'recuperacao' : 'codigo');
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

  app.post('/senha', { preHandler: logado, config: limite(10), schema: { ...tag, summary: 'Trocar a senha (as outras sessões caem; a equipe continua vendo a senha certa)', body: PortalTrocarSenhaSchema } },
    async (req) => {
      const u = await svc.trocarSenha(app.db, app.vault, s(req), req.body.atual, req.body.nova);
      await app.audit(req, { action: 'update', entityType: 'portal', entityId: u.id, summary: `${u.name} (login ${u.login}) trocou a própria senha do portal` });
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
