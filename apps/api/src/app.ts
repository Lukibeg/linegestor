/**
 * Monta o servidor: banco, cofre, cookies, CORS, autenticação, documentação e todas as rotas.
 * `server.ts` chama isto e liga na porta; os testes chamam isto e usam sem porta.
 */
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, type Db } from '@gestor/db';
import { loadConfig, type Config } from './config.js';
import { SecretsVault } from './services/secrets.js';
import * as audit from './services/audit.js';
import { notFoundJson, registerErrorHandler } from './plugins/errors.js';
import authPlugin from './plugins/auth.js';
import segurancaPlugin from './plugins/seguranca.js';
import openapiPlugin from './plugins/openapi.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import circuitRoutes from './routes/circuits.js';
import didRoutes from './routes/dids.js';
import inventoryRoutes from './routes/inventory.js';
import adminRoutes from './routes/admin.js';
import dataRoutes from './routes/data.js';
import dashboardRoutes from './routes/dashboard.js';
import secretRoutes from './routes/secrets.js';
import settingsRoutes from './routes/settings.js';
import projectRoutes from './routes/projects.js';
import releaseNoteRoutes from './routes/releaseNotes.js';
import chamadoRoutes from './routes/chamados.js';
import envioRoutes from './routes/envio.js';
import baseRoutes from './routes/base.js';
import portalAdminRoutes from './routes/portalAdmin.js';
import portalRoutes from './routes/portal.js';
import atendimentoRoutes from './routes/atendimento.js';
import atendimentoAjustesRoutes from './routes/atendimentoAjustes.js';
import atendimentoEntradaRoutes from './routes/atendimentoEntrada.js';
import atendimentoRotinaRoutes from './routes/atendimentoRotina.js';
import calendarioRoutes from './routes/calendario.js';
import simuladorRoutes from './routes/simulador.js';
import helenaRoutes from './routes/helena.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    vault: SecretsVault;
    audit: (req: { user: { id: string } | null; ip: string }, e: Omit<audit.AuditEntry, 'userId' | 'ip'>) => Promise<void>;
  }
}

/** A partir de quanto um pedido vai para o log como lento (2.1.2). */
const PEDIDO_LENTO_MS = 1500;

export async function buildApp(overrides: Partial<Record<keyof Config, string>> = {}) {
  const config = loadConfig(overrides);
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug', transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      // a chave de API do robô do LineChat pode vir no endereço (?chave=…): ela nunca vai para o log
      serializers: { req: (req) => ({ method: req.method, url: String(req.url ?? '').replace(/([?&]chave=)[^&#]*/gi, '$1…'), hostname: req.hostname, remoteAddress: req.ip }) },
    },
    trustProxy: true,
    // o padrão do Fastify é 1 MB: pequeno demais para o CSV de importação e para um anexo de
    // projeto (10 MB viram ~14 MB em base64). Os schemas é que limitam cada caso.
    bodyLimit: 30 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const { db, pool } = createDb(config.DATABASE_URL);
  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('vault', new SecretsVault(config.SECRETS_MASTER_KEY));
  app.decorate('audit', (req, e) => audit.record(db, { ...e, userId: req.user?.id ?? null, ip: req.ip }, app.log));
  app.addHook('onClose', async () => { await pool.end(); });

  // Quanto o servidor levou em cada pedido (2.1.2, "ta demorando muito pra abrir os cards"): o navegador mostra no
  // Server-Timing (separa a demora do servidor da demora da rede e da tela), e o pedido lento fica no log. No log vai
  // a rota (o molde, sem o que vem depois do "?": a chave do robô nunca aparece) e não o endereço.
  app.addHook('onSend', async (_req, reply, payload) => {
    if (!reply.sent) reply.header('Server-Timing', `app;dur=${reply.elapsedTime.toFixed(1)}`);
    return payload;
  });
  app.addHook('onResponse', async (req, reply) => {
    if (reply.elapsedTime >= PEDIDO_LENTO_MS) req.log.warn({ metodo: req.method, rota: req.routeOptions.url ?? null, status: reply.statusCode, ms: Math.round(reply.elapsedTime) }, 'pedido lento');
  });

  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(cors, { origin: config.WEB_ORIGIN.split(',').map((s) => s.trim()), credentials: true });
  await app.register(rateLimit, { global: false });
  registerErrorHandler(app);
  await app.register(authPlugin);
  // o CSP de toda resposta (quem pode abrir o Gestor num iframe) e a recusa do pedido que vem de outro site
  await app.register(segurancaPlugin);
  await app.register(openapiPlugin);

  // Toda a API vive sob /api — assim a interface pode ser servida na raiz pelo mesmo servidor.
  await app.register(async (api) => {
    api.get('/health', { schema: { hide: true } }, async () => ({ ok: true }));
    await api.register(authRoutes, { prefix: '/auth' });
    await api.register(secretRoutes, { prefix: '/secrets' });
    await api.register(clientRoutes, { prefix: '/clients' });
    await api.register(circuitRoutes, { prefix: '/circuits' });
    await api.register(didRoutes, { prefix: '/dids' });
    await api.register(inventoryRoutes, { prefix: '/inventory' });
    await api.register(dashboardRoutes, { prefix: '/dashboard' });
    await api.register(dataRoutes, { prefix: '/data' });
    await api.register(adminRoutes, { prefix: '/admin' });
    await api.register(settingsRoutes, { prefix: '/settings' });
    await api.register(releaseNoteRoutes, { prefix: '/release-notes' });
    await api.register(projectRoutes, { prefix: '/projects' });
    await api.register(chamadoRoutes, { prefix: '/chamados' });
    await api.register(envioRoutes, { prefix: '/envio' });
    await api.register(baseRoutes, { prefix: '/base' });
    // o portal do cliente (1.8): a equipe cuida em /portal-admin; o cliente usa /portal, com login próprio
    await api.register(portalAdminRoutes, { prefix: '/portal-admin' });
    await api.register(portalRoutes, { prefix: '/portal' });
    // os chamados do Gestor (2.0): o trabalho, os ajustes do módulo e a entrada das integrações (chave de API)
    await api.register(atendimentoRoutes, { prefix: '/atendimento' });
    await api.register(atendimentoAjustesRoutes, { prefix: '/atendimento' });
    await api.register(atendimentoEntradaRoutes, { prefix: '/atendimento' });
    await api.register(atendimentoRotinaRoutes, { prefix: '/atendimento' });
    // o calendário (2.0.1): os eventos de cada equipe, nos painéis dos chamados
    await api.register(calendarioRoutes, { prefix: '/calendario' });
    // o Simulador do Comercial (2.0.2): a conta de uma venda antes de fechar
    await api.register(simuladorRoutes, { prefix: '/comercial/simulador' });
    // o Trazer do Helena (2.0.3): o painel de vendas do Helena, com o histórico, num painel de Vendas
    await api.register(helenaRoutes, { prefix: '/comercial/helena' });
  }, { prefix: '/api' });

  // Em produção, a própria API serve a interface (apps/web/dist) e devolve o index.html para qualquer rota que não seja /api
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  const serveWeb = config.NODE_ENV === 'production' && fs.existsSync(webDist);
  if (serveWeb) await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (!serveWeb || req.url.startsWith('/api')) return notFoundJson(reply);
    return reply.sendFile('index.html');
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
