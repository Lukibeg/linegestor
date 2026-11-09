/**
 * O envio automático (Patch 1.7, decisão 0038): os relatórios e gráficos dos Chamados marcados
 * vão todo dia, num PDF, pelo WhatsApp (API da FlwChat).
 *
 *  - Administração › Envio automático: a lista de envios (2.4.5: cada um de um painel, com o horário, os dias
 *    e os números) e a ligação com a FlwChat, uma só — o número que envia e o token (`admin.manage`; tudo na
 *    auditoria, o token no cofre);
 *  - marcar o que vai no PDF: nos próprios gráficos e relatórios de cada painel (`admin.manage`);
 *  - a página do PDF busca o pacote com uma chave de uso único (o robô; a chave abre um envio só) ou com a sessão;
 *  - o link público do PDF, que a FlwChat baixa, vence em 7 dias.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AjustesEnvioSchema, nomeDoPdf, numeroLegivel, ORIGEM_LEGADO, schemaDosMarcados } from '@gestor/shared';
import { AppError, Forbidden, Unauthorized } from '../plugins/errors.js';
import * as envio from '../services/envio.js';

const routes: FastifyPluginAsyncZod = async (app) => {
  const admin = { preHandler: app.requirePermission('admin.manage') };
  const ver = { preHandler: app.requirePermission('support.read') };

  app.get('/ajustes', { ...admin, schema: { tags: ['Envio automático'], summary: 'Como está o envio automático (sem o token)' } }, async () => envio.paraTela(app));

  app.put('/ajustes', {
    ...admin,
    schema: { tags: ['Envio automático'], summary: 'Salvar a lista de envios (o painel, o horário, os dias e os números de cada um), o número que envia e o token', body: AjustesEnvioSchema },
  }, async (req) => {
    const { antes, depois, trocouToken, origens } = await envio.gravarAjustes(app, req.body, req.user!);
    const lista = (v: typeof antes) => v.envios.map((e) => ({
      painel: origens.find((o) => o.id === e.origem)?.nome ?? e.origem, ativo: e.ativo, horario: e.horario, dias: e.dias,
      destinatarios: e.destinatarios.map((d) => `${d.nome} ${numeroLegivel(d.numero)}${d.ativo ? '' : ' (pausado)'}`),
    }));
    await app.audit(req, {
      action: 'envio_automatico_ajustes', entityType: 'settings', entityId: 'envio-automatico',
      summary: `${req.user!.name} salvou o envio automático (${envio.resumoDosEnvios(depois, origens)})${trocouToken ? ' e trocou o token' : ''}`,
      before: { url: antes.url, remetente: antes.remetente, envios: lista(antes) },
      after: { url: depois.url, remetente: depois.remetente, envios: lista(depois) },
    });
    return envio.paraTela(app);
  });

  // o que vai no PDF de uma origem (um painel, ou o Legado): quem vê os chamados vê o que está marcado; só a administração marca
  const Origem = z.object({ origem: z.string().trim().min(1).max(100).default(ORIGEM_LEGADO) });
  app.get('/marcados', { ...ver, schema: { tags: ['Envio automático'], summary: 'Os gráficos e relatórios que vão no PDF do envio de um painel', querystring: Origem } }, async (req) => {
    const m = await envio.lerMarcados(app.db, req.query.origem);
    return { origem: req.query.origem, relatorios: m.relatorios, graficos: m.graficos, atualizadoEm: m.atualizadoEm, atualizadoPor: m.atualizadoPor };
  });

  app.put('/marcados', {
    ...admin,
    schema: { tags: ['Envio automático'], summary: 'Marcar o que vai no PDF do envio de um painel (para a equipe toda)', querystring: Origem, body: z.object({ relatorios: z.array(z.string()).default([]), graficos: z.array(z.string()).default([]) }) },
  }, async (req) => {
    const { origem } = req.query;
    const corpo = schemaDosMarcados(origem).safeParse(req.body);
    if (!corpo.success) throw new AppError(400, corpo.error.issues[0]?.message ?? 'Marcação inválida');
    const os = await envio.origens(app);
    const painel = os.find((o) => o.id === origem);
    if (!painel) throw new AppError(404, 'Esse painel não existe (ou é de vendas).');
    const antes = await envio.lerMarcados(app.db, origem);
    const m = await envio.gravarMarcados(app.db, origem, corpo.data, req.user!);
    const entrou = [...m.relatorios, ...m.graficos].filter((x) => ![...antes.relatorios, ...antes.graficos].includes(x));
    const saiu = [...antes.relatorios, ...antes.graficos].filter((x) => ![...m.relatorios, ...m.graficos].includes(x));
    const deOnde = origem === ORIGEM_LEGADO ? 'do Legado do Helena' : `do painel ${painel.nome}`;
    await app.audit(req, {
      action: 'envio_automatico_marcados', entityType: 'settings', entityId: 'envio-automatico-marcados',
      summary: `${req.user!.name} mudou o que vai no envio automático ${deOnde} (${[entrou.length ? `entrou ${entrou.join(', ')}` : '', saiu.length ? `saiu ${saiu.join(', ')}` : ''].filter(Boolean).join('; ') || 'sem mudança'}; agora ${m.relatorios.length + m.graficos.length} no PDF)`,
      before: { origem, relatorios: antes.relatorios, graficos: antes.graficos }, after: { origem, relatorios: m.relatorios, graficos: m.graficos },
    });
    return { origem, relatorios: m.relatorios, graficos: m.graficos, atualizadoEm: m.atualizadoEm, atualizadoPor: m.atualizadoPor };
  });

  // a página do PDF: o robô entra com a chave de uso único (que abre um envio só); uma pessoa, com a sessão ("Ver como fica")
  app.get('/pacote', {
    preHandler: async (req) => {
      const { chave } = req.query as { chave?: string };
      if (envio.chaveValida(chave)) return;
      if (!req.user) throw new Unauthorized();
      if (!req.user.permissions.includes('support.read')) throw new Forbidden('Esta ação exige a permissão "support.read"');
    },
    schema: {
      tags: ['Envio automático'], summary: 'O que a página do PDF de um envio desenha (os números de hoje, os gráficos e os relatórios marcados)',
      querystring: z.object({ chave: z.string().max(100).optional(), envio: z.string().max(40).optional(), origem: z.string().max(100).optional() }),
    },
  }, async (req) => {
    const { chave, envio: envioId, origem } = req.query;
    if (chave && envio.chaveValida(chave)) return envio.pacote(app, { envioId: envio.envioDaChave(chave) });
    return envio.pacote(app, { envioId, origem });
  });

  // o PDF de agora de um envio, para conferir antes de ligar (não manda nada)
  app.get('/pdf', {
    ...admin, schema: { tags: ['Envio automático'], summary: 'Baixar o PDF de agora de um envio (sem mandar)', querystring: z.object({ envio: z.string().max(40).optional() }) },
  }, async (req, reply) => {
    const p = await envio.pacote(app, { envioId: req.query.envio });
    const pdf = await envio.montarPdf(app, req.query.envio ?? null);
    const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const nome = p.tipo === 'painel' ? nomeDoPdf(dia, p.painel.sigla) : nomeDoPdf(dia);
    await app.audit(req, { action: 'envio_automatico_pdf', entityType: 'settings', entityId: 'envio-automatico', summary: `${req.user!.name} baixou o PDF do envio automático ${p.tipo === 'painel' ? `do painel ${p.painel.nome}` : 'do Legado do Helena'} (sem mandar)` });
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `attachment; filename="${nome}"`).send(pdf);
  });

  const Para = z.object({ envio: z.string().max(40).optional(), destinatarioId: z.string().max(40).optional() }).default({});
  app.post('/enviar', {
    ...admin,
    schema: { tags: ['Envio automático'], summary: 'Mandar agora o PDF de um envio (para a lista dele, ou só para um número)', body: Para },
  }, async (req) => envio.enviar(app, { gatilho: 'manual', quem: req.user!, envioId: req.body.envio, destinatarioId: req.body.destinatarioId }));

  app.post('/testar', {
    ...admin,
    schema: { tags: ['Envio automático'], summary: 'Mandar uma mensagem de teste (só texto) para a lista de um envio, ou para um número dela', body: Para },
  }, async (req) => envio.enviar(app, { gatilho: 'teste', quem: req.user!, envioId: req.body.envio, destinatarioId: req.body.destinatarioId }));

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
