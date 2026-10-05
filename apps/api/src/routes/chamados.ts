/**
 * Chamados de suporte: a cópia do painel do LineChat, contada e filtrada.
 * Só leitura — os chamados são abertos e trabalhados no próprio LineChat.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AjustesRelatoriosSchema, ArrumacaoRelatoriosSchema, CATALOGO_RELATORIOS, ChamadosDaPecaSchema, FiltrosChamadosSchema, FiltrosRelatoriosSchema, ItemPainelSchema, ListaChamadosSchema, PainelChamadosSchema } from '@gestor/shared';
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

  // ---------- Relatórios (Patch 1.7) ----------
  // Quem vê chamados vê os relatórios. Os ajustes (os campos usados e a ligação do Cliente do card
  // com o cadastro) valem para a equipe toda: só a administração mexe, e fica na auditoria.

  app.get('/relatorios', {
    ...ver,
    schema: { tags: ['Chamados'], summary: 'Os relatórios (relógio, escada, mapa de calor, entrada × saída, sobe e desce, idade da fila, dias fora da curva, reincidência, tamanho do cliente, de quem é a falha, equipe, mês) no período e com os filtros', querystring: FiltrosRelatoriosSchema },
  }, async (req) => svc.relatorios(app.db, req.query));

  app.get('/relatorios/chamados', {
    ...ver,
    schema: { tags: ['Chamados'], summary: 'Os chamados de uma peça clicada num relatório (uma faixa, um quadrado do mapa, uma coluna)', querystring: ChamadosDaPecaSchema },
  }, async (req) => svc.pecaDoRelatorio(app.db, req.query));

  app.get('/relatorios/ajustes', {
    ...ver,
    schema: { tags: ['Chamados'], summary: 'Os campos usados pelos relatórios e a ligação de cada Cliente do card com o cadastro' },
  }, async () => svc.ajustesRelatorios(app.db));

  app.put('/relatorios/ajustes', {
    preHandler: app.requirePermission('admin.manage'),
    schema: { tags: ['Chamados'], summary: 'Escolher os campos dos relatórios, ligar os clientes do LineChat ao cadastro e o grupo de cada tipo de chamado (para a equipe toda)', body: AjustesRelatoriosSchema },
  }, async (req) => {
    const antes = await svc.lerAjustesRelatorios(app.db);
    const depois = await svc.gravarAjustesRelatorios(app.db, req.body, req.user!.id);
    const partes: string[] = [];
    const papeis = ['cliente', 'assunto', 'tipo', 'produto'] as const;
    const mudouCampo = papeis.filter((p) => (antes.campos[p] ?? undefined) !== (depois.campos[p] ?? undefined));
    if (mudouCampo.length) partes.push(`mudou o campo ${mudouCampo.join(', ')}`);
    const chaves = new Set([...Object.keys(antes.clientes), ...Object.keys(depois.clientes)]);
    let ligou = 0, desligou = 0;
    for (const k of chaves) {
      const a = Object.prototype.hasOwnProperty.call(antes.clientes, k) ? antes.clientes[k] : undefined;
      const d = Object.prototype.hasOwnProperty.call(depois.clientes, k) ? depois.clientes[k] : undefined;
      if (a === d) continue;
      if (d === undefined) desligou++; else ligou++;
    }
    if (ligou) partes.push(`ligou ${ligou} cliente${ligou > 1 ? 's' : ''} do LineChat ao cadastro`);
    if (desligou) partes.push(`devolveu ${desligou} à ligação automática`);
    const tiposMudados = new Set([...Object.keys(antes.causas), ...Object.keys(depois.causas)]);
    const causas = [...tiposMudados].filter((k) => antes.causas[k] !== depois.causas[k]).length;
    if (causas) partes.push(`mudou o grupo de ${causas} tipo${causas > 1 ? 's' : ''} em "De quem é a falha"`);
    await app.audit(req, {
      action: 'chamados_relatorios', entityType: 'settings', entityId: 'chamados-relatorios',
      summary: `${req.user!.name} ajustou os Relatórios dos Chamados (${partes.join('; ') || 'sem mudança'})`,
      before: { campos: antes.campos, clientes: antes.clientes, causas: antes.causas },
      after: { campos: depois.campos, clientes: depois.clientes, causas: depois.causas },
    });
    return depois;
  });

  // a arrumação da página: a ordem, os escondidos e os favoritos — igual para a equipe toda
  app.get('/relatorios/arrumacao', {
    ...ver,
    schema: { tags: ['Chamados'], summary: 'A arrumação da página de Relatórios: a ordem, os escondidos e os favoritos' },
  }, async () => svc.lerArrumacao(app.db));

  app.put('/relatorios/arrumacao', {
    preHandler: app.requirePermission('admin.manage'),
    schema: { tags: ['Chamados'], summary: 'Arrumar a página de Relatórios para a equipe toda (ordem, escondidos, favoritos)', body: ArrumacaoRelatoriosSchema },
  }, async (req) => {
    const antes = await svc.lerArrumacao(app.db);
    const depois = await svc.gravarArrumacao(app.db, req.body, req.user!.id);
    const total = CATALOGO_RELATORIOS.length;
    await app.audit(req, {
      action: 'chamados_relatorios_arrumacao', entityType: 'settings', entityId: 'chamados-relatorios-arrumacao',
      summary: `${req.user!.name} arrumou os Relatórios dos Chamados para a equipe (${total - depois.ocultos.length} à vista, ${depois.ocultos.length} escondido${depois.ocultos.length === 1 ? '' : 's'}, ${depois.favoritos.length} favorito${depois.favoritos.length === 1 ? '' : 's'})`,
      before: { ordem: antes.ordem, ocultos: antes.ocultos, favoritos: antes.favoritos },
      after: { ordem: depois.ordem, ocultos: depois.ocultos, favoritos: depois.favoritos },
    });
    return depois;
  });

  app.get('/relatorios/cliente/:id', {
    ...ver,
    schema: { tags: ['Chamados'], summary: 'Raio-X de um cliente: os chamados dele no período e o que ele tem no Gestor', params: z.object({ id: z.string().min(1).max(60) }), querystring: FiltrosRelatoriosSchema },
  }, async (req) => svc.raioX(app.db, req.params.id, req.query));
};

export default routes;
