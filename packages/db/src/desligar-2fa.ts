/**
 * Saída de emergência: desliga a verificação em duas etapas de alguém que perdeu o celular
 * E os códigos de recuperação. Só roda no servidor, por quem tem acesso SSH — por isso é seguro.
 *
 *   docker compose -f docker-compose.prod.yml exec app pnpm db:2fa-off fulano@ingline.com.br
 */
import './env.js';
import { eq } from 'drizzle-orm';
import { createDb } from './index.js';
import { users } from './schema.js';

const email = (process.argv[2] ?? '').trim().toLowerCase();
if (!email) { console.error('Uso: pnpm db:2fa-off <e-mail>'); process.exit(1); }

const { db, pool } = createDb(process.env.DATABASE_URL!);
const [u] = await db.select({ id: users.id, name: users.name, on: users.totpEnabledAt }).from(users).where(eq(users.email, email)).limit(1);
if (!u) { console.error(`Não existe usuário com o e-mail ${email}`); await pool.end(); process.exit(1); }
if (!u.on) { console.log(`${u.name} já estava sem verificação em duas etapas.`); await pool.end(); process.exit(0); }

await db.update(users).set({ totpSecret: null, totpEnabledAt: null, totpRecovery: null, updatedAt: new Date() }).where(eq(users.id, u.id));
console.log(`Verificação em duas etapas desligada para ${u.name} (${email}). Peça para ligar de novo assim que puder.`);
await pool.end();
