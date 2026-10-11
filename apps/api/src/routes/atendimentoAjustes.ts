/**
 * Chamados do Gestor (Patch 1.10, decisão 0047): os ajustes do módulo e as integrações.
 *
 *  - Ajustes (quem cuida dos chamados, `tickets.manage`): os painéis, as etapas de cada um, a árvore
 *    de assuntos (e a lista colada), os prazos e os avisos (o WhatsApp dos chamados e o teste).
 *  - Integrações (a administração, `admin.manage`): os webhooks, as chaves de API, os sites que podem
 *    abrir o Gestor dentro deles (o menu do LineChat) e o link da conversa.
 *
 * As respostas prontas e os agendados ficam em `atendimentoRotina.ts`. Tudo o que muda vai para a
 * auditoria — e segredo nenhum vai junto: a chave do WhatsApp, o segredo do webhook e a chave de API
 * aparecem (quando aparecem) só na resposta de quem pediu, uma vez.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AjustesPrazosSchema, AssuntoGravarSchema, AssuntosColarSchema, AvisosChamadosSchema, ChaveCriarSchema, EtapasGravarSchema, LinkConversaSchema,
  PainelGravarSchema, SitesIframeSchema, WebhookGravarSchema,
} from '@gestor/shared';
import { atorDaPessoa } from '../services/atendimento/contexto.js';
import * as ajustes from '../services/atendimento/ajustes.js';
import * as integracoes from '../services/atendimento/integracoes.js';

const tags = ['Chamados do Gestor › Ajustes'];
const tagsIntegracoes = ['Chamados do Gestor › Integrações'];
const Id = z.object({ id: z.string().min(1) });
const TestarAvisosSchema = z.object({
  /** o número que manda: o da equipe (padrão) ou o oficial, do cliente */
  de: z.enum(['cliente', 'equipe']).optional(),
  /** para o WhatsApp guardado desta pessoa (sem pessoa nem número: o de quem pediu) */
  userId: z.string().min(1).optional(),
  numero: z.string().trim().max(30).optional(),
}).default({});

const routes: FastifyPluginAsyncZod = async (app) => {
  const cuidar = { preHandler: app.requirePermission('tickets.manage') };
  const integrar = { preHandler: app.requirePermission('admin.manage') };

  // =====================================================================
  //  OS PAINÉIS E AS ETAPAS
  // =====================================================================

  app.post('/paineis', {
    ...cuidar,
    schema: { tags, summary: 'Criar um painel, já com as etapas da lista (sem a lista, nasce com Novo, Em andamento, Resolvido e Fechado; a sigla é única)', body: PainelGravarSchema },
  }, async (req, reply) => {
    const r = await ajustes.gravarPainel(app, atorDaPessoa(req.user!), null, req.body);
    await app.audit(req, { action: 'create', entityType: 'ticket_panel', entityId: r.valor.id, summary: r.resumo, after: r.depois });
    return reply.status(201).send(r.valor);
  });

  app.put('/paineis/:id', {
    ...cuidar,
    schema: { tags, summary: 'Mudar um painel e, se vierem, as etapas (as regras do PUT /etapas, tudo junto: ou grava tudo, ou nada; a sigla não muda depois do primeiro chamado)', params: Id, body: PainelGravarSchema },
  }, async (req) => {
    const r = await ajustes.gravarPainel(app, atorDaPessoa(req.user!), req.params.id, req.body);
    await app.audit(req, { action: 'update', entityType: 'ticket_panel', entityId: r.valor.id, summary: r.resumo, before: r.antes, after: r.depois });
    return r.valor;
  });

  app.delete('/paineis/:id', { ...cuidar, schema: { tags, summary: 'Tirar um painel (só sem chamados por fechar)', params: Id } },
    async (req) => {
      const r = await ajustes.removerPainel(app, req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'ticket_panel', entityId: req.params.id, summary: r.resumo });
      return r.valor;
    });

  app.put('/paineis/:id/etapas', {
    ...cuidar,
    schema: { tags, summary: 'As etapas do painel, na ordem (sem id = nova; a que não vier sai, e os chamados dela vão para o destino)', params: Id, body: EtapasGravarSchema },
  }, async (req) => {
    const r = await ajustes.salvarEtapas(app, atorDaPessoa(req.user!), req.params.id, req.body);
    await app.audit(req, { action: 'update', entityType: 'ticket_panel', entityId: req.params.id, summary: r.resumo, before: r.antes, after: r.depois });
    return r.valor;
  });

  // =====================================================================
  //  OS ASSUNTOS
  // =====================================================================

  app.post('/paineis/:id/assuntos', { ...cuidar, schema: { tags, summary: 'Criar um assunto (até 3 níveis; sem nome repetido entre irmãos)', params: Id, body: AssuntoGravarSchema } },
    async (req, reply) => {
      const r = await ajustes.criarAssunto(app, req.params.id, req.body);
      await app.audit(req, { action: 'create', entityType: 'ticket_subject', entityId: r.valor.id, summary: r.resumo, after: r.depois });
      return reply.status(201).send(r.valor);
    });

  app.put('/assuntos/:id', { ...cuidar, schema: { tags, summary: 'Mudar um assunto (o nome, o lugar na árvore, o checklist; desativar = ativo: false)', params: Id, body: AssuntoGravarSchema } },
    async (req) => {
      const r = await ajustes.alterarAssunto(app, req.params.id, req.body);
      await app.audit(req, { action: 'update', entityType: 'ticket_subject', entityId: r.valor.id, summary: r.resumo, before: r.antes, after: r.depois });
      return r.valor;
    });

  app.post('/paineis/:id/assuntos/colar', {
    ...cuidar,
    schema: { tags, summary: 'Colar a lista de assuntos ("Ramal - Configuração - Identidade", um por linha): cria só o que falta', params: Id, body: AssuntosColarSchema },
  }, async (req) => {
    const r = await ajustes.colarAssuntos(app, req.params.id, req.body.texto);
    await app.audit(req, { action: 'create', entityType: 'ticket_subject', entityId: null, summary: r.resumo, after: r.depois });
    return r.valor;
  });

  // =====================================================================
  //  OS PRAZOS E OS AVISOS
  // =====================================================================

  app.get('/ajustes/prazos', { ...cuidar, schema: { tags, summary: 'O horário de atendimento, os feriados, os prazos por prioridade e a prioridade sugerida' } },
    async () => ajustes.lerPrazos(app.db));

  app.put('/ajustes/prazos', { ...cuidar, schema: { tags, summary: 'Gravar o horário, os feriados, os prazos e a prioridade sugerida', body: AjustesPrazosSchema } },
    async (req) => {
      const r = await ajustes.gravarPrazos(app, req.body, req.user!.id);
      await app.audit(req, { action: 'settings_atendimento_prazos', entityType: 'settings', entityId: 'atendimento-prazos', summary: r.resumo, before: r.antes, after: r.depois });
      return r.valor;
    });

  app.get('/ajustes/avisos', { ...cuidar, schema: { tags, summary: 'O WhatsApp dos chamados: os números, o modelo, quem recebe o quê (a chave nunca volta)' } },
    async () => ajustes.avisosParaTela(app));

  app.put('/ajustes/avisos', { ...cuidar, schema: { tags, summary: 'Gravar o WhatsApp dos chamados (a chave, quando vem, vai para o cofre)', body: AvisosChamadosSchema } },
    async (req) => {
      const r = await ajustes.gravarAvisos(app, req.body, req.user!.id);
      await app.audit(req, { action: 'settings_atendimento_avisos', entityType: 'settings', entityId: 'atendimento-avisos', summary: r.resumo, before: r.antes, after: r.depois });
      return r.valor;
    });

  app.post('/ajustes/avisos/testar', {
    ...cuidar,
    // cada teste é uma mensagem de verdade no WhatsApp
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { tags, summary: 'Mandar a mensagem de teste para uma pessoa da equipe (ou um número)', body: TestarAvisosSchema },
  }, async (req) => {
    const r = await ajustes.testarAvisos(app, req.body, req.user!);
    await app.audit(req, {
      action: 'settings_atendimento_avisos_test', entityType: 'settings', entityId: 'atendimento-avisos',
      summary: `Testou o WhatsApp dos chamados (${req.body.de === 'cliente' ? 'número do cliente' : 'número da equipe'} para ${r.para}): ${r.ok ? 'funcionou' : `falhou — ${r.mensagem}`}`,
    });
    return { ok: r.ok, mensagem: r.mensagem };
  });

  // =====================================================================
  //  AS INTEGRAÇÕES (a administração)
  // =====================================================================

  app.get('/integracoes', { ...integrar, schema: { tags: tagsIntegracoes, summary: 'Os webhooks, as chaves de API, os sites do iframe, o link da conversa e o endereço do Gestor' } },
    async () => integracoes.telaDasIntegracoes(app));

  app.post('/integracoes/webhooks', {
    ...integrar,
    schema: { tags: tagsIntegracoes, summary: 'Criar um webhook (só https da internet; o segredo da assinatura volta só agora)', body: WebhookGravarSchema },
  }, async (req, reply) => {
    const r = await integracoes.criarWebhook(app, req.body, req.user!.id);
    await app.audit(req, {
      action: 'create', entityType: 'ticket_webhook', entityId: r.webhook.id,
      summary: `Criou o webhook ${r.webhook.nome} (${r.webhook.url}) para ${r.webhook.eventos.join(', ')}`,
      after: r.webhook,
    });
    return reply.status(201).send(r);
  });

  app.put('/integracoes/webhooks/:id', {
    ...integrar,
    schema: { tags: tagsIntegracoes, summary: 'Mudar um webhook (novoSegredo: troca a assinatura; o segredo novo volta só agora)', params: Id, body: WebhookGravarSchema },
  }, async (req) => {
    const r = await integracoes.alterarWebhook(app, req.params.id, req.body, req.user!.id);
    await app.audit(req, {
      action: 'update', entityType: 'ticket_webhook', entityId: r.webhook.id,
      summary: `Alterou o webhook ${r.webhook.nome}${r.webhook.ativo !== r.antes.ativo ? (r.webhook.ativo ? ' e o ligou' : ' e o desligou') : ''}${r.segredo ? ' e gerou uma assinatura nova' : ''}`,
      before: r.antes, after: r.webhook,
    });
    return { webhook: r.webhook, segredo: r.segredo };
  });

  app.delete('/integracoes/webhooks/:id', { ...integrar, schema: { tags: tagsIntegracoes, summary: 'Tirar um webhook (para de receber os eventos)', params: Id } },
    async (req) => {
      const w = await integracoes.removerWebhook(app, req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'ticket_webhook', entityId: w.id, summary: `Tirou o webhook ${w.nome} (${w.url})`, before: w });
      return { ok: true };
    });

  app.post('/integracoes/webhooks/:id/testar', {
    ...integrar,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { tags: tagsIntegracoes, summary: 'Mandar o evento "teste" agora, com a assinatura', params: Id },
  }, async (req) => {
    const r = await integracoes.testarWebhook(app, req.params.id);
    await app.audit(req, { action: 'ticket_webhook_test', entityType: 'ticket_webhook', entityId: req.params.id, summary: `Testou o webhook ${r.nome}: ${r.ok ? 'funcionou' : `falhou — ${r.mensagem}`}` });
    return { ok: r.ok, mensagem: r.mensagem };
  });

  app.post('/integracoes/chaves', {
    ...integrar,
    schema: { tags: tagsIntegracoes, summary: 'Criar uma chave de API (para o robô do LineChat e o n8n; a chave aparece só agora)', body: ChaveCriarSchema },
  }, async (req, reply) => {
    const r = await integracoes.criarChave(app, req.body.nome, req.user!.id);
    await app.audit(req, { action: 'create', entityType: 'ticket_api_key', entityId: r.chave.id, summary: `Criou a chave de API ${r.chave.nome} (${r.chave.inicio}…)` });
    return reply.status(201).send(r);
  });

  app.delete('/integracoes/chaves/:id', { ...integrar, schema: { tags: tagsIntegracoes, summary: 'Revogar uma chave de API (quem a usa para de entrar na hora)', params: Id } },
    async (req) => {
      const r = await integracoes.revogarChave(app, req.params.id);
      if (!r.jaEstava) await app.audit(req, { action: 'revoke', entityType: 'ticket_api_key', entityId: r.chave.id, summary: `Revogou a chave de API ${r.chave.nome} (${r.chave.inicio}…)` });
      return { ok: true };
    });

  app.put('/integracoes/sites', {
    ...integrar,
    schema: { tags: tagsIntegracoes, summary: 'Os sites que podem abrir o Gestor dentro deles (o menu do LineChat, outros programas)', body: SitesIframeSchema },
  }, async (req) => {
    const r = await integracoes.gravarSites(app, req.body.sites, req.user!.id);
    await app.audit(req, {
      action: 'settings_atendimento_sites', entityType: 'settings', entityId: 'atendimento-integracoes',
      summary: `Mudou os sites que podem abrir o Gestor dentro deles: ${r.sites.join(', ') || 'nenhum (só o próprio Gestor)'}`,
      before: { sites: r.antes }, after: { sites: r.sites },
    });
    return { sites: r.sites };
  });

  app.put('/integracoes/link-conversa', {
    ...integrar,
    schema: { tags: tagsIntegracoes, summary: 'O modelo do link da conversa no LineChat (com {sessao}; vazio = sem link)', body: LinkConversaSchema },
  }, async (req) => {
    const r = await integracoes.gravarLinkConversa(app, req.body.linkConversa, req.user!.id);
    await app.audit(req, {
      action: 'settings_atendimento_link', entityType: 'settings', entityId: 'atendimento-integracoes',
      summary: r.linkConversa ? `Mudou o link da conversa no LineChat: ${r.linkConversa}` : 'Tirou o link da conversa no LineChat',
      before: { linkConversa: r.antes }, after: { linkConversa: r.linkConversa },
    });
    return { linkConversa: r.linkConversa };
  });
};

export default routes;
