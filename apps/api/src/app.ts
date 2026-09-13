/**
 * Monta o servidor: banco, cofre, cookies, CORS, autenticação, documentação e todas as rotas.
 * `server.ts` chama isto e liga na porta; os testes chamam isto e usam sem porta.
 */
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { createDb, type Db } from '@gestor/db';
import { loadConfig, type Config } from './config.js';
import { SecretsVault } from './services/secrets.js';
import * as audit from './services/audit.js';
import { registerErrorHandler } from './plugins/errors.js';
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

  app.get('/health', { schema: { hide: true } }, async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(secretRoutes, { prefix: '/secrets' });
  await app.register(clientRoutes, { prefix: '/clients' });
  await app.register(circuitRoutes, { prefix: '/circuits' });
  await app.register(didRoutes, { prefix: '/dids' });
  await app.register(inventoryRoutes, { prefix: '/inventory' });
  await app.register(dashboardRoutes, { prefix: '/dashboard' });
  await app.register(dataRoutes, { prefix: '/data' });
  await app.register(adminRoutes, { prefix: '/admin' });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
