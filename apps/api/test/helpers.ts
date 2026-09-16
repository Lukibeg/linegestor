/**
 * Apoio aos testes: sobe o servidor contra o banco de TESTE, limpa as tabelas,
 * roda o seed e oferece um "cliente" já logado como administrador.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { buildApp, type App } from '../src/app.js';
export type { App };

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPkg = path.resolve(here, '../../../packages/db');

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:gestor_dev@localhost:5432/gestor_test';

const ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DB_URL,
  SECRETS_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
  SESSION_SECRET: 'segredo-de-teste-bem-longo-1234567890',
  WEB_ORIGIN: 'http://localhost:5173',
};

let migrated = false;

export async function makeApp(): Promise<App> {
  if (!migrated) {
    execSync('pnpm exec tsx src/migrate.ts', { cwd: dbPkg, env: { ...process.env, DATABASE_URL: TEST_DB_URL }, stdio: 'ignore' });
    migrated = true;
  }
  const app = await buildApp(ENV);
  await resetDb(app);
  execSync('pnpm exec tsx src/seed.ts', { cwd: dbPkg, env: { ...process.env, DATABASE_URL: TEST_DB_URL, SEED_ADMIN_PASSWORD: 'SenhaDeTeste!123' }, stdio: 'ignore' });
  await app.ready();
  return app;
}

export async function resetDb(app: App) {
  await app.db.execute(sql`
    TRUNCATE TABLE audit_log, sessions, device_movement_items, device_movements, devices, device_models, device_categories,
      dids, circuits, carriers, linepbx_settings, fop2_settings, omniboard_settings, szchat_settings, subscription_modules, subscriptions, product_modules, products,
      hosting_providers, settings, secrets, users, roles, client_logos, clients RESTART IDENTITY CASCADE
  `);
}

/** Um "navegador" de teste: guarda o cookie de sessão e manda em toda chamada. */
export class Session {
  cookie = '';
  constructor(private app: App) {}
  async login(email = 'admin@gestor.local', password = 'SenhaDeTeste!123') {
    const res = await this.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
    if (res.statusCode !== 200) throw new Error(`login falhou: ${res.body}`);
    const set = res.headers['set-cookie'];
    const raw = Array.isArray(set) ? set[0] : set;
    this.cookie = raw!.split(';')[0]!;
    const body = res.json();
    // com verificação em duas etapas, o login devolve { needsCode: true } e a sessão fica pendente
    return body.user ?? body;
  }

  /** Segunda etapa: manda o código de 6 dígitos (ou um de recuperação). */
  async codigo(code: string) {
    const res = await this.app.inject({ method: 'POST', url: '/api/auth/login/code', payload: { code }, headers: { cookie: this.cookie } });
    if (res.statusCode === 200) {
      const set = res.headers['set-cookie'];
      const raw = Array.isArray(set) ? set[0] : set;
      if (raw) this.cookie = raw.split(';')[0]!;
    }
    return res;
  }
  req(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
    return this.app.inject({ method, url: '/api' + url, payload: payload as any, headers: { cookie: this.cookie } });
  }
  get(url: string) { return this.req('GET', url); }
  post(url: string, payload?: unknown) { return this.req('POST', url, payload); }
  patch(url: string, payload?: unknown) { return this.req('PATCH', url, payload); }
  put(url: string, payload?: unknown) { return this.req('PUT', url, payload); }
  del(url: string, payload?: unknown) { return this.req('DELETE', url, payload); }
}
