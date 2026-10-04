/**
 * O envio automático (Patch 1.7, decisão 0038): os relatórios e gráficos dos Chamados marcados
 * vão todo dia, num PDF, pelo WhatsApp (API da FlwChat).
 *
 *  - Administração › Envio automático: horário, dias, números, o número que envia e o token
 *    (`admin.manage`; tudo na auditoria, o token no cofre);
 *  - marcar o que vai no PDF: nos próprios gráficos e relatórios (`admin.manage`);
 *  - a página do PDF busca o pacote com uma chave de uso único (o robô) ou com a sessão;
 *  - o link público do PDF, que a FlwChat baixa, vence em 7 dias.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AjustesEnvioSchema, MarcadosEnvioSchema, nomeDoPdf, numeroLegivel } from '@gestor/shared';
import { AppError, Forbidden, Unauthorized } from '../plugins/errors.js';
import * as envio from '../services/envio.js';

const routes: FastifyPluginAsyncZod = async (app) => {
  const admin = { preHandler: app.requirePermission('admin.manage') };
  const ver = { preHandler: app.requirePermission('support.read') };

  app.get('/ajustes', { ...admin, schema: { tags: ['Envio automático'], summary: 'Como está o envio automático (sem o token)' } }, async () => envio.paraTela(app));

  app.put('/ajustes', {
    ...admin,
    schema: { tags: ['Envio automático'], summary: 'Salvar horário, dias, números, o número que envia e o token', body: AjustesEnvioSchema },
  }, async (req) => {
    const { antes, depois, trocouToken } = await envio.gravarAjustes(app.db, app.vault, req.body, req.user!);
    const ativos = depois.destinatarios.filter((d) => d.ativo).length;
    await app.audit(req, {
      action: 'envio_automatico_ajustes', entityType: 'settings', entityId: 'envio-automatico',
      summary: `${req.user!.name} ${depois.ativo ? 'ligou' : 'desligou'} o envio automático (${depois.horario}, ${ativos} ${ativos === 1 ? 'número' : 'números'})${trocouToken ? ' e trocou o token' : ''}`,
      before: { ativo: antes.ativo, url: antes.url, remetente: antes.remetente, horario: antes.horario, dias: antes.dias, destinatarios: antes.destinatarios.map((d) => `${d.nome} ${numeroLegivel(d.numero)}${d.ativo ? '' : ' (pausado)'}`) },
      after: { ativo: depois.ativo, url: depois.url, remetente: depois.remetente, horario: depois.horario, dias: depois.dias, destinatarios: depois.destinatarios.map((d) => `${d.nome} ${numeroLegivel(d.numero)}${d.ativo ? '' : ' (pausado)'}`) },
    });
    return envio.paraTela(app);
  });

  // o que vai no PDF: todo mundo que vê os chamados vê o que está marcado; só a administração marca
  app.get('/marcados', { ...ver, schema: { tags: ['Envio automático'], summary: 'Os gráficos e relatórios que vão no PDF do envio' } }, async () => {
    const m = await envio.lerMarcados(app.db);
    return { relatorios: m.relatorios, graficos: m.graficos, atualizadoEm: m.atualizadoEm, atualizadoPor: m.atualizadoPor };
  });

  app.put('/marcados', {
    ...admin,
    schema: { tags: ['Envio automático'], summary: 'Marcar o que vai no PDF do envio (para a equipe toda)', body: MarcadosEnvioSchema },
  }, async (req) => {
    const antes = await envio.lerMarcados(app.db);
    const m = await envio.gravarMarcados(app.db, req.body, req.user!);
    const entrou = [...m.relatorios, ...m.graficos].filter((x) => ![...antes.relatorios, ...antes.graficos].includes(x));
    const saiu = [...antes.relatorios, ...antes.graficos].filter((x) => ![...m.relatorios, ...m.graficos].includes(x));
    await app.audit(req, {
      action: 'envio_automatico_marcados', entityType: 'settings', entityId: 'envio-automatico-marcados',
      summary: `${req.user!.name} mudou o que vai no envio automático (${[entrou.length ? `entrou ${entrou.join(', ')}` : '', saiu.length ? `saiu ${saiu.join(', ')}` : ''].filter(Boolean).join('; ') || 'sem mudança'}; agora ${m.relatorios.length + m.graficos.length} no PDF)`,
      before: { relatorios: antes.relatorios, graficos: antes.graficos }, after: { relatorios: m.relatorios, graficos: m.graficos },
    });
    return { relatorios: m.relatorios, graficos: m.graficos, atualizadoEm: m.atualizadoEm, atualizadoPor: m.atualizadoPor };
  });

  // a página do PDF: o robô entra com a chave de uso único; uma pessoa, com a sessão ("Ver como fica")
  app.get('/pacote', {
    preHandler: async (req) => {
      const { chave } = req.query as { chave?: string };
      if (envio.chaveValida(chave)) return;
      if (!req.user) throw new Unauthorized();
      if (!req.user.permissions.includes('support.read')) throw new Forbidden('Esta ação exige a permissão "support.read"');
    },
    schema: { tags: ['Envio automático'], summary: 'O que a página do PDF desenha (os números de hoje, os gráficos e os relatórios marcados)', querystring: z.object({ chave: z.string().max(100).optional() }) },
  }, async () => envio.pacote(app.db));

  // o PDF de agora, para conferir antes de ligar (não manda nada)
  app.get('/pdf', { ...admin, schema: { tags: ['Envio automático'], summary: 'Baixar o PDF de agora (sem mandar)' } }, async (req, reply) => {
    const pdf = await envio.montarPdf(app);
    const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    await app.audit(req, { action: 'envio_automatico_pdf', entityType: 'settings', entityId: 'envio-automatico', summary: `${req.user!.name} baixou o PDF do envio automático (sem mandar)` });
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `attachment; filename="${nomeDoPdf(dia)}"`).send(pdf);
  });

  app.post('/enviar', {
    ...admin,
    schema: { tags: ['Envio automático'], summary: 'Mandar agora o PDF (para a lista, ou só para um número)', body: z.object({ destinatarioId: z.string().max(40).optional() }).default({}) },
  }, async (req) => envio.enviar(app, { gatilho: 'manual', quem: req.user!, destinatarioId: req.body.destinatarioId }));

  app.post('/testar', {
    ...admin,
    schema: { tags: ['Envio automático'], summary: 'Mandar uma mensagem de teste (só texto)', body: z.object({ destinatarioId: z.string().max(40).optional() }).default({}) },
  }, async (req) => envio.enviar(app, { gatilho: 'teste', quem: req.user!, destinatarioId: req.body.destinatarioId }));

  // um PDF já mandado, para a administração (não vence)
  app.get('/historico/:id/pdf', {
    ...admin, schema: { tags: ['Envio automático'], summary: 'Baixar o PDF de um envio do histórico', params: z.object({ id: z.string().max(40) }) },
  }, async (req, reply) => {
    const { valor } = await envio.lerAjustes(app.db);
    const r = (valor.historico ?? []).find((x) => x.id === req.params.id);
    const pdf = r?.pdf ? await envio.lerPdf(r.pdf.id, false) : null;
    if (!r?.pdf || !pdf) throw new AppError(404, 'Esse PDF não está mais guardado.');
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `attachment; filename="${r.pdf.nome}"`).send(pdf);
  });

  // o link que vai para a FlwChat: público (a API baixa sem login), difícil de adivinhar, vence em 7 dias
  app.get('/arquivo/:id/:nome', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { hide: true, params: z.object({ id: z.string().max(60), nome: z.string().max(80) }) },
  }, async (req, reply) => {
    const pdf = await envio.lerPdf(req.params.id, true);
    if (!pdf) throw new AppError(404, 'Este link venceu ou não existe.');
    return reply.header('Content-Type', 'application/pdf').header('Cache-Control', 'private, no-store')
      .header('Content-Disposition', `inline; filename="${req.params.nome.replace(/[^\w.-]/g, '')}"`).send(pdf);
  });
};

export default routes;
