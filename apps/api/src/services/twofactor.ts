/**
 * A verificação em duas etapas do ponto de vista do sistema: ligar, conferir, desligar.
 *
 * Onde ficam as coisas:
 *  - o segredo mora em `users.totp_secret`, CIFRADO com a mesma chave-mestra do cofre de senhas
 *    (quem abrir o banco não vê o segredo)
 *  - `users.totp_enabled_at` nulo = ainda é rascunho; o login segue só com senha
 *  - os códigos de recuperação ficam como hash Argon2, e cada um some depois de usado
 */
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { users, type Db } from '@gestor/db';
import type { SecretsVault } from './secrets.js';
import { conferir, endereco, gerarCodigosDeRecuperacao, gerarSegredo } from './totp.js';

const embrulhar = (v: SecretsVault, plain: string) => {
  const e = v.encrypt(plain);
  return `${e.iv}:${e.authTag}:${e.ciphertext}`;
};
const desembrulhar = (v: SecretsVault, guardado: string) => {
  const [iv = '', authTag = '', ciphertext = ''] = guardado.split(':');
  return v.decrypt({ iv, authTag, ciphertext });
};

/** Gera um segredo novo (rascunho) e devolve o endereço que vira QR Code. */
export async function preparar(db: Db, vault: SecretsVault, user: { id: string; email: string }) {
  const segredo = gerarSegredo();
  await db.update(users).set({ totpSecret: embrulhar(vault, segredo), totpEnabledAt: null, totpRecovery: null, updatedAt: new Date() }).where(eq(users.id, user.id));
  return { secret: segredo, uri: endereco(segredo, user.email) };
}

/** Confere o primeiro código e liga de verdade. Devolve os códigos de recuperação — só desta vez. */
export async function ligar(db: Db, vault: SecretsVault, userId: string, codigoDigitado: string) {
  const [u] = await db.select({ totpSecret: users.totpSecret }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.totpSecret) return { ok: false as const, motivo: 'sem-rascunho' as const };
  if (!conferir(desembrulhar(vault, u.totpSecret), codigoDigitado)) return { ok: false as const, motivo: 'codigo' as const };
  const recuperacao = gerarCodigosDeRecuperacao();
  const hashes = await Promise.all(recuperacao.map((c) => argon2.hash(c)));
  await db.update(users).set({ totpEnabledAt: new Date(), totpRecovery: JSON.stringify(hashes), updatedAt: new Date() }).where(eq(users.id, userId));
  return { ok: true as const, recuperacao };
}

/** Desliga tudo: segredo, data e códigos de recuperação. */
export async function desligar(db: Db, userId: string) {
  await db.update(users).set({ totpSecret: null, totpEnabledAt: null, totpRecovery: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Confere o que a pessoa digitou na hora de entrar: primeiro como código do aplicativo,
 * depois como código de recuperação (que, se servir, é gasto e não serve mais).
 */
export async function conferirEntrada(db: Db, vault: SecretsVault, userId: string, digitado: string): Promise<'ok' | 'recuperacao' | 'nao'> {
  const [u] = await db.select({ totpSecret: users.totpSecret, totpRecovery: users.totpRecovery }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.totpSecret) return 'nao';
  if (conferir(desembrulhar(vault, u.totpSecret), digitado)) return 'ok';

  const limpo = (digitado ?? '').trim().toUpperCase();
  if (!u.totpRecovery || limpo.length < 8) return 'nao';
  let hashes: string[] = [];
  try { hashes = JSON.parse(u.totpRecovery) as string[]; } catch { return 'nao'; }
  for (const h of hashes) {
    if (await argon2.verify(h, limpo).catch(() => false)) {
      const sobraram = hashes.filter((x) => x !== h);
      await db.update(users).set({ totpRecovery: JSON.stringify(sobraram), updatedAt: new Date() }).where(eq(users.id, userId));
      return 'recuperacao';
    }
  }
  return 'nao';
}

/** Quantos códigos de recuperação ainda sobraram (para avisar quando estiver acabando). */
export function quantosRestam(totpRecovery: string | null): number {
  if (!totpRecovery) return 0;
  try { return (JSON.parse(totpRecovery) as string[]).length; } catch { return 0; }
}
