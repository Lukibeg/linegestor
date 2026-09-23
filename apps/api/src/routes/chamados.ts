/**
 * Chamados de suporte: a cópia do painel do LineChat, contada e filtrada.
 * Só leitura — os chamados são abertos e trabalhados no próprio LineChat.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { FiltrosChamadosSchema, ListaChamadosSchema } from '@gestor/shared';
import * as svc from '../services/chamados.js';

const routes: FastifyPluginAsyncZod = async (app) => {
  const ver = { preHandler: app.requirePermission('support.read') };

  app.get('/opcoes', { ...ver, schema: { tags: ['Chamados'], summary: 'Etapas, campos, etiquetas e responsáveis (para os filtros), e se a sincronização está de pé' } }, async () => svc.opcoes(app.db));

  app.get('/resumo', {
    ...ver,
    schema: { tags: ['Chamados'], summary: 'Os números da aba (Hoje · Em aberto · Período) com os filtros aplicados', querystring: FiltrosChamadosSchema },
  }, async (req) => svc.resumo(app.db, req.query));

  app.get('/lista', {
    ...ver,
    schema: { tags: ['Chamados'], summary: 'A tabela de chamados da aba, ordenada e paginada', querystring: ListaChamadosSchema },
  }, async (req) => svc.lista(app.db, req.query));
};

export default routes;
