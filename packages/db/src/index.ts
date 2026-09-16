/**
 * Ponto de entrada do pacote de banco: cria a conexão e expõe o schema.
 *
 * Uso: `const db = createDb(process.env.DATABASE_URL)`; depois `db.select().from(schema.clients)`.
 */
import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema.js';

export * as schema from './schema.js';
export * from './schema.js';
export { newId } from './id.js';

/** Tipo do banco usado pelos serviços. Aceita tanto a conexão normal quanto uma transação (`db.transaction`). */
export type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
