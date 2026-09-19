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
import releaseNoteRoutes from './routes/releaseNotes.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    vault: SecretsVault;
    audit: (req: { user: { id: string } | null; ip: string }, e: Omit<audit.AuditEntry, 'userId' | 'ip'>) => Promise<void>;
  }
}

export async function buildApp(overrides: Partial<Record<keyof Config, string>> = {}) {
  const config = loadConfig(overrides);
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: config.NODE_ENV === 'production' ? 'info' : 'debug', transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined },
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const { db, pool } = createDb(config.DATABASE_URL);
  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('vault', new SecretsVault(config.SECRETS_MASTER_KEY));
  app.decorate('audit', (req, e) => audit.record(db, { ...e, userId: req.user?.id ?? null, ip: req.ip }, app.log));
  app.addHook('onClose', async () => { await pool.end(); });

  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(cors, { origin: config.WEB_ORIGIN.split(',').map((s) => s.trim()), credentials: true });
  await app.register(rateLimit, { global: false });
  registerErrorHandler(app);
  await app.register(authPlugin);
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
