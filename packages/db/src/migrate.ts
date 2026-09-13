/**
 * Aplica no banco todas as migrações da pasta `drizzle/` que ainda não foram aplicadas.
 * É o comando que roda em toda publicação (homologação e produção) antes de subir a API.
 */
import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDb } from './index.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida. Copie .env.example para .env e preencha.');
  process.exit(1);
}

const { db, pool } = createDb(url);
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
await migrate(db, { migrationsFolder: dir });
await pool.end();
console.log('Migrações aplicadas.');
