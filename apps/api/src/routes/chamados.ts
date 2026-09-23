/**
 * Chamados de suporte: a cópia do painel do LineChat, contada e filtrada.
 * Só leitura — os chamados são abertos e trabalhados no próprio LineChat.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { FiltrosChamadosSchema, ItemPainelSchema, ListaChamadosSchema, PainelChamadosSchema } from '@gestor/shared';
import * as svc from '../services/chamados.js';

const Painel = z.object({ itens: z.array(ItemPainelSchema), atualizadoEm: z.string().nullable(), atualizadoPor: z.string().nullable() });

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

  // A arrumação da tela vale para a equipe toda: todo mundo que vê chamados lê; só a
  // administração arruma (e fica na auditoria, com o antes e o depois).
  app.get('/painel', {
    ...ver,
    schema: { tags: ['Chamados'], summary: 'A arrumação da tela: ordem, largura, escondidos e barras ou pizza de cada gráfico', response: { 200: Painel } },
  }, async () => svc.lerPainel(app.db));

  app.put('/painel', {
    preHandler: app.requirePermission('admin.manage'),
    schema: { tags: ['Chamados'], summary: 'Arrumar a tela de Chamados para a equipe toda', body: PainelChamadosSchema, response: { 200: Painel } },
  }, async (req) => {
    const antes = await svc.lerPainel(app.db);
    const depois = await svc.gravarPainel(app.db, req.body.itens, req.user!.id);
    const escondidos = req.body.itens.filter((x) => x.oculto).length;
    await app.audit(req, {
      action: 'chamados_painel', entityType: 'settings', entityId: 'chamados-painel',
      summary: `${req.user!.name} arrumou a tela de Chamados para a equipe (${req.body.itens.length - escondidos} gráficos à vista${escondidos ? `, ${escondidos} escondido${escondidos > 1 ? 's' : ''}` : ''})`,
      before: antes.itens, after: req.body.itens,
    });
    return depois;
  });
};

export default routes;
