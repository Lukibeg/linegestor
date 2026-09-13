/**
 * Registrador da auditoria: "quem fez o quê, em qual registro, quando".
 * Toda escrita relevante do sistema chama `record()`. Nunca falha o pedido principal
 * por causa da auditoria — se der erro ao registrar, avisa no log e segue.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { auditLog, newId, users, type Db } from '@gestor/db';

export type AuditEntry = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

/** Remove campos sensíveis antes de guardar o "antes/depois". */
function sanitize(v: unknown): unknown {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (/password|senha|secret|token|hash/i.test(k) && typeof val === 'string') out[k] = '[oculto]';
    else out[k] = sanitize(val);
  }
  return out;
}

export async function record(db: Db, e: AuditEntry, log?: { error: (o: unknown, m?: string) => void }) {
  try {
    await db.insert(auditLog).values({
      id: newId(),
      userId: e.userId ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      summary: e.summary,
      before: e.before == null ? null : (sanitize(e.before) as object),
      after: e.after == null ? null : (sanitize(e.after) as object),
      ip: e.ip ?? null,
    });
  } catch (err) {
    log?.error(err, 'Falha ao gravar auditoria');
  }
}

export async function list(db: Db, q: { page: number; pageSize: number; entityType?: string; entityId?: string; userId?: string; action?: string }) {
  const where = and(
    q.entityType ? eq(auditLog.entityType, q.entityType) : undefined,
    q.entityId ? eq(auditLog.entityId, q.entityId) : undefined,
    q.userId ? eq(auditLog.userId, q.userId) : undefined,
    q.action ? eq(auditLog.action, q.action) : undefined,
  );
  const rows = await db
    .select({
      id: auditLog.id, action: auditLog.action, entityType: auditLog.entityType, entityId: auditLog.entityId,
      summary: auditLog.summary, before: auditLog.before, after: auditLog.after, ip: auditLog.ip, createdAt: auditLog.createdAt,
      userId: auditLog.userId, userName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(auditLog).where(where);
  return { items: rows, total: Number(c?.n ?? 0), page: q.page, pageSize: q.pageSize };
}
