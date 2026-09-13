import { defineConfig } from 'drizzle-kit';

/** Configuração da ferramenta que gera e aplica as migrações do banco. */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgresql://postgres:gestor_dev@localhost:5432/gestor_dev' },
  verbose: true,
  strict: true,
});
