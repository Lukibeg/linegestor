/**
 * Ponto de entrada do pacote de banco: cria a conexão e expõe o schema.
 *
 * Uso: `const db = createDb(process.env.DATABASE_URL)`; depois `db.select().from(schema.clients)`.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export * as schema from './schema.js';
export * from './schema.js';
export { newId } from './id.js';

export type Db = ReturnType<typeof createDb>['db'];

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
