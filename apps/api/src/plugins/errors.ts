/**
 * Erros do sistema, com nome e código HTTP. As rotas e serviços lançam estes erros;
 * o tratador no fim do arquivo transforma qualquer um deles numa resposta em português.
 */
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

export class AppError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export class NotFound extends AppError { constructor(what = 'Registro') { super(404, `${what} não encontrado`); } }
export class Forbidden extends AppError { constructor(msg = 'Você não tem permissão para isso') { super(403, msg); } }
export class Unauthorized extends AppError { constructor(msg = 'Faça login para continuar') { super(401, msg); } }
export class BadRequest extends AppError { constructor(msg: string, details?: unknown) { super(400, msg, details); } }
export class Conflict extends AppError { constructor(msg: string) { super(409, msg); } }

/** Traduz mensagens de validação para uma lista "campo: problema". */
function zodIssues(err: { issues: Array<{ path: (string | number)[]; message: string }> }) {
  return err.issues.map((i) => ({ field: i.path.join('.') || '(geral)', message: i.message }));
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: err.message, details: err.details ?? null });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({ error: 'Dados inválidos', details: ((err as any).validation as any[]).map((v: any) => ({ field: v.instancePath?.replace(/^\//, '').replace(/\//g, '.') || v.params?.issue?.path?.join('.') || '(geral)', message: v.params?.issue?.message ?? v.message })) });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'Dados inválidos', details: zodIssues(err) });
    }
    // erro de chave única do PostgreSQL
    if ((err as any)?.code === '23505') {
      return reply.status(409).send({ error: 'Já existe um registro com esse valor (precisa ser único)', details: (err as any).detail ?? null });
    }
    if ((err as any)?.code === '23503') {
      return reply.status(409).send({ error: 'Não é possível: existem registros ligados a este', details: (err as any).detail ?? null });
    }
    if ((err as any)?.statusCode && (err as any).statusCode < 500) {
      return reply.status((err as any).statusCode).send({ error: err.message, details: null });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'Erro interno. Já foi registrado; tente de novo em instantes.', details: null });
  });

  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'Endereço não existe', details: null }));
}
