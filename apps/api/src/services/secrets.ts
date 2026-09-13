/**
 * O COFRE de senhas.
 *
 * Cifra: AES-256-GCM. A chave-mestra vem do ambiente (SECRETS_MASTER_KEY) e NUNCA vai para o banco.
 * Cada segredo tem seu próprio IV (vetor de inicialização) e uma etiqueta de autenticação —
 * se alguém alterar o texto cifrado, a decifragem falha em vez de devolver lixo.
 *
 * Regras:
 *  - gravar: recebe texto puro, guarda cifrado, devolve o id do segredo
 *  - revelar: só quem tem permissão `secrets.reveal`, e SEMPRE registra na auditoria
 *  - nunca devolvemos o valor em listagens; as tabelas de negócio só sabem "existe um segredo nº X"
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { newId, secrets, type Db } from '@gestor/db';

const ALGO = 'aes-256-gcm';
const KEY_VERSION = 1;

export class SecretsVault {
  private key: Buffer;
  constructor(masterKeyBase64: string) {
    this.key = Buffer.from(masterKeyBase64, 'base64');
    if (this.key.length !== 32) throw new Error('Chave-mestra inválida');
  }

  encrypt(plain: string): { ciphertext: string; iv: string; authTag: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return { ciphertext: enc.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
  }

  decrypt(row: { ciphertext: string; iv: string; authTag: string }): string {
    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(row.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  /**
   * Grava ou atualiza um segredo. Se `existingId` vier, substitui o valor no mesmo id
   * (assim as tabelas que apontam para ele não precisam mudar).
   */
  async save(db: Db, opts: { existingId?: string | null; label: string; plain: string; userId?: string | null }): Promise<string> {
    const enc = this.encrypt(opts.plain);
    if (opts.existingId) {
      await db.update(secrets).set({ ...enc, label: opts.label, keyVersion: KEY_VERSION, updatedBy: opts.userId ?? null, updatedAt: new Date() }).where(eq(secrets.id, opts.existingId));
      return opts.existingId;
    }
    const id = newId();
    await db.insert(secrets).values({ id, label: opts.label, ...enc, keyVersion: KEY_VERSION, updatedBy: opts.userId ?? null });
    return id;
  }

  /** Lê e decifra. Quem chama é responsável por checar permissão e auditar (ver rota /secrets/:id/reveal). */
  async read(db: Db, id: string): Promise<{ label: string; value: string } | null> {
    const [row] = await db.select().from(secrets).where(eq(secrets.id, id)).limit(1);
    if (!row) return null;
    return { label: row.label, value: this.decrypt(row) };
  }

  async remove(db: Db, id: string): Promise<void> {
    await db.delete(secrets).where(eq(secrets.id, id));
  }
}
