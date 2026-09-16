/**
 * Configuração do servidor, lida das variáveis de ambiente (.env).
 * Se algo essencial faltar, o servidor nem sobe — melhor falhar cedo do que descobrir em produção.
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Lê o .env da raiz do projeto (e o da pasta atual, se existir)
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../../.env') });
loadEnv();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  /** 32 bytes em base64. Cifra todas as senhas guardadas. */
  SECRETS_MASTER_KEY: z
    .string()
    .min(1, 'SECRETS_MASTER_KEY é obrigatória')
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'SECRETS_MASTER_KEY precisa ter 32 bytes em base64'),
  /** Assina o cookie de sessão. */
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET precisa ter pelo menos 16 caracteres'),
  /** Endereço do site, para liberar o CORS e o cookie. */
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  /** Dias até uma sessão expirar sem uso. */
  SESSION_DAYS: z.coerce.number().int().default(7),
  /** Segundos que uma senha revelada fica visível na tela (só informativo para a interface). */
  REVEAL_SECONDS: z.coerce.number().int().default(30),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(overrides: Partial<Record<keyof Config, string>> = {}): Config {
  const parsed = EnvSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const msgs = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida:\n${msgs}\n\nCopie .env.example para .env e preencha.`);
  }
  return parsed.data;
}
