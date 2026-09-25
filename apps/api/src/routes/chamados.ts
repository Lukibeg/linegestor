/**
 * Chamados de suporte: a cópia do painel do LineChat, contada e filtrada.
 * Só leitura — os chamados são abertos e trabalhados no próprio LineChat.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { FiltrosChamadosSchema, ItemPainelSchema, ListaChamadosSchema, PainelChamadosSchema } from '@gestor/shared';
import * as svc from '../services/chamados.js';

const Painel = z.object({
  versao: z.number(),
  itens: z.array(ItemPainelSchema),
  etapasFechadas: z.array(z.string()).nullable(),
  atualizadoEm: z.string().nullable(),
  atualizadoPor: z.string().nullable(),
});

const routes: FastifyPluginAsyncZod = async (app) => {
  const ver = { preHandler: app.requirePermission('support.read') };

  app.get('/opcoes', { ...ver, schema: { tags: ['Chamados'], summary: 'Etapas, campos, etiquetas e responsáveis (para os filtros), e se a sincronização está de pé' } }, async () => svc.opcoes(app.db));

  app.get('/resumo', {
    ...ver,
    schema: { tags: ['Chamados'], summary: 'Os números da aba (Hoje · Período), com os filtros e o "só em aberto" aplicados', querystring: FiltrosChamadosSchema },
  }, async (req) => svc.resumo(app.db, req.query));

  app.get('/lista', {
    ...ver,
    schema: { tags: ['Chamados'], summary: 'A tabela de chamados da aba, ordenada e paginada', querystring: ListaChamadosSchema },
  }, async (req) => svc.lista(app.db, req.query));

  // A arrumação da tela vale para a equipe toda: todo mundo que vê chamados lê; só a
  // administração arruma (e fica na auditoria, com o antes e o depois).
  app.get('/painel', {
    ...ver,
    schema: { tags: ['Chamados'], summary: 'A arrumação da tela: ordem, largura, escondidos, pizza ou barras, grupos de cada gráfico e as etapas que fecham o chamado', response: { 200: Painel } },
  }, async () => svc.lerPainel(app.db));

  app.put('/painel', {
    preHandler: app.requirePermission('admin.manage'),
    schema: { tags: ['Chamados'], summary: 'Arrumar a tela de Chamados para a equipe toda', body: PainelChamadosSchema, response: { 200: Painel } },
  }, async (req) => {
    const antes = await svc.lerPainel(app.db);
    const depois = await svc.gravarPainel(app.db, req.body, req.user!.id);
    const escondidos = req.body.itens.filter((x) => x.oculto).length;
    const grupos = req.body.itens.reduce((a, x) => a + (x.grupos?.length ?? 0), 0);
    const partes = [`${req.body.itens.length - escondidos} gráficos à vista${escondidos ? `, ${escondidos} escondido${escondidos > 1 ? 's' : ''}` : ''}`];
    if (grupos) partes.push(`${grupos} grupo${grupos > 1 ? 's' : ''}`);
    if (JSON.stringify(antes.etapasFechadas) !== JSON.stringify(depois.etapasFechadas)) {
      partes.push(depois.etapasFechadas ? 'mudou as etapas que fecham o chamado' : 'voltou às etapas finais do LineChat');
    }
    await app.audit(req, {
      action: 'chamados_painel', entityType: 'settings', entityId: 'chamados-painel',
      summary: `${req.user!.name} arrumou a tela de Chamados para a equipe (${partes.join('; ')})`,
      before: { itens: antes.itens, etapasFechadas: antes.etapasFechadas },
      after: { itens: depois.itens, etapasFechadas: depois.etapasFechadas },
    });
    return depois;
  });
};

export default routes;
