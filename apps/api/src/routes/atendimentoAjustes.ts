/**
 * Chamados do Gestor (Patch 2.0, decisão 0047): os ajustes do módulo e as integrações.
 *
 *  - Ajustes (quem cuida dos chamados, `tickets.manage`): os painéis, as etapas de cada um, os campos
 *    de cada painel (os do sistema ligados ou não, e os criados pela equipe), as etiquetas e a cor de
 *    cada uma, a árvore de assuntos (e a lista colada), os prazos e os avisos (o WhatsApp dos chamados e
 *    o teste).
 *  - Integrações (a administração, `admin.manage`): os webhooks, as chaves de API, o mapa do robô do
 *    LineChat (2.0.1), os sites que podem abrir o Gestor dentro deles (o menu do LineChat) e o link da
 *    conversa.
 *
 * Os agendados ficam em `atendimentoRotina.ts`. Tudo o que muda vai para a
 * auditoria — e segredo nenhum vai junto: a chave do WhatsApp, o segredo do webhook e a chave de API
 * aparecem (quando aparecem) só na resposta de quem pediu, uma vez.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AjustesDaNiaSchema, AjustesPrazosSchema, AssuntoGravarSchema, AssuntosColarSchema, AvisosChamadosSchema, CampoGravarSchema, CamposDoSistemaSchema, ChaveCriarSchema, EtapasGravarSchema,
  EtiquetaEditarPeloNomeSchema, EtiquetaEditarSchema, EtiquetaGravarSchema, ExperimentarRoboSchema,
  LinkConversaSchema, MapaDoRoboSchema, OrdemDosCamposSchema, PainelGravarSchema, parametrosDoEndereco, SitesIframeSchema, WebhookGravarSchema,
  EVENTOS_AVISO, MAX_MODELO_DO_AVISO, NOME_EVENTO_AVISO,
} from '@gestor/shared';
import { atorDaPessoa } from '../services/atendimento/contexto.js';
import * as ajustes from '../services/atendimento/ajustes.js';
import { experimentarRobo } from '../services/atendimento/entrada.js';
import * as etiquetas from '../services/atendimento/etiquetas.js';
import * as integracoes from '../services/atendimento/integracoes.js';
import { modelosDoLineChat } from '../services/atendimento/whatsapp.js';

const tags = ['Chamados do Gestor › Ajustes'];
const tagsIntegracoes = ['Chamados do Gestor › Integrações'];
const Id = z.object({ id: z.string().min(1) });
const TestarAvisosSchema = z.object({
  /** o número que manda: o da equipe (padrão) ou o oficial, do cliente */
  de: z.enum(['cliente', 'equipe']).optional(),
  /** para o WhatsApp guardado desta pessoa (sem pessoa nem número: o de quem pediu) */
  userId: z.string().min(1).optional(),
  numero: z.string().trim().max(30).optional(),
  /** o exemplo da mensagem de um aviso (2.0.2), pelo número da equipe */
  evento: z.enum(EVENTOS_AVISO).optional(),
  /** a mensagem como está na tela (sem ela, a salva): vai com os valores de exemplo */
  modelo: z.string().max(MAX_MODELO_DO_AVISO).optional(),
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
  //  OS CAMPOS DE CADA PAINEL
  // =====================================================================

  app.put('/paineis/:id/campos-do-sistema', {
    ...cuidar,
    schema: { tags, summary: 'Ligar e desligar os campos do sistema no painel (assunto, tipo, gravidade e alcance, produtos, operadoras) e as opções do Tipo', params: Id, body: CamposDoSistemaSchema },
  }, async (req) => {
    const r = await ajustes.salvarCamposDoSistema(app, req.params.id, req.body);
    await app.audit(req, { action: 'update', entityType: 'ticket_panel', entityId: req.params.id, summary: r.resumo, before: r.antes, after: r.depois });
    return r.valor;
  });

  app.post('/paineis/:id/campos', {
    ...cuidar,
    schema: { tags, summary: 'Criar um campo no painel (texto, texto longo, número, data, sim ou não, lista); obrigatório para abrir ou nas etapas escolhidas', params: Id, body: CampoGravarSchema },
  }, async (req, reply) => {
    const r = await ajustes.criarCampo(app, req.params.id, req.body);
    await app.audit(req, { action: 'create', entityType: 'ticket_field', entityId: r.valor.id, summary: r.resumo, after: r.depois });
    return reply.status(201).send(r.valor);
  });

  app.put('/campos/:id', {
    ...cuidar,
    schema: { tags, summary: 'Mudar um campo do painel (o tipo não muda; desativar = ativo: false; a opção que não vier fica desativada)', params: Id, body: CampoGravarSchema },
  }, async (req) => {
    const r = await ajustes.alterarCampo(app, req.params.id, req.body);
    await app.audit(req, { action: 'update', entityType: 'ticket_field', entityId: r.valor.id, summary: r.resumo, before: r.antes, after: r.depois });
    return r.valor;
  });

  app.put('/paineis/:id/campos/ordem', {
    ...cuidar,
    schema: { tags, summary: 'A ordem dos campos do painel (todos os ids, na ordem nova)', params: Id, body: OrdemDosCamposSchema },
  }, async (req) => {
    const r = await ajustes.ordenarCampos(app, req.params.id, req.body.ids);
    await app.audit(req, { action: 'update', entityType: 'ticket_panel', entityId: req.params.id, summary: r.resumo });
    return r.valor;
  });

  // =====================================================================
  //  AS ETIQUETAS (com a cor; cada painel tem as suas, desde o 2.0.3)
  // =====================================================================

  app.get('/etiquetas', { ...cuidar, schema: { tags, summary: 'As etiquetas de todos os painéis, com o painel, a cor e em quantos chamados dele cada uma está (Ajustes › Etiquetas)' } },
    async () => etiquetas.listarEtiquetas(app.db));

  app.post('/etiquetas', { ...cuidar, schema: { tags, summary: 'Criar uma etiqueta num painel, com a cor (o nome não se repete no painel, sem ligar para maiúscula e acento)', body: EtiquetaGravarSchema } },
    async (req, reply) => {
      const r = await etiquetas.criarEtiqueta(app.db, req.body, req.user!.id);
      await app.audit(req, { action: 'create', entityType: 'ticket_tag', entityId: r.valor.id, summary: r.resumo, after: r.depois });
      return reply.status(201).send(r.valor);
    });

  app.put('/etiquetas/:id', { ...cuidar, schema: { tags, summary: 'Editar uma etiqueta: o nome e a cor (valem nos chamados do painel que a têm)', params: Id, body: EtiquetaEditarSchema } },
    async (req) => {
      const r = await etiquetas.editarEtiqueta(app.db, { id: req.params.id }, req.body, req.user!.id);
      await app.audit(req, { action: 'update', entityType: 'ticket_tag', entityId: r.valor.id, summary: r.resumo, before: r.antes, after: r.depois });
      return r.valor;
    });

  // o seletor de etiquetas (no Abrir chamado e na ficha) edita pelo nome: as opções da tela não levam o id
  app.put('/etiquetas', { ...cuidar, schema: { tags, summary: 'Editar uma etiqueta pelo painel e o nome de agora (`de`): o nome e a cor', body: EtiquetaEditarPeloNomeSchema } },
    async (req) => {
      const { de, painelId, ...d } = req.body;
      const r = await etiquetas.editarEtiqueta(app.db, { painelId, nome: de }, d, req.user!.id);
      await app.audit(req, { action: 'update', entityType: 'ticket_tag', entityId: r.valor.id, summary: r.resumo, before: r.antes, after: r.depois });
      return r.valor;
    });

  app.delete('/etiquetas/:id', { ...cuidar, schema: { tags, summary: 'Tirar uma etiqueta das sugestões (só a que nenhum chamado usa)', params: Id } },
    async (req) => {
      const r = await etiquetas.removerEtiqueta(app.db, req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'ticket_tag', entityId: req.params.id, summary: r.resumo, before: r.antes });
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

  app.get('/ajustes/avisos/modelos', {
    ...cuidar,
    // cada leitura é uma ida ao LineChat
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: { tags, summary: 'Os modelos aprovados (templates) do número oficial, lidos do LineChat com a chave guardada: o id, o texto e as variáveis de cada um' },
  }, async () => modelosDoLineChat(app.db, app.vault));

  app.post('/ajustes/avisos/testar', {
    ...cuidar,
    // cada teste é uma mensagem de verdade no WhatsApp
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { tags, summary: 'Mandar a mensagem de teste para uma pessoa da equipe (ou um número)', body: TestarAvisosSchema },
  }, async (req) => {
    const r = await ajustes.testarAvisos(app, req.body, req.user!);
    await app.audit(req, {
      action: 'settings_atendimento_avisos_test', entityType: 'settings', entityId: 'atendimento-avisos',
      summary: `Testou o WhatsApp dos chamados (${req.body.evento ? `o exemplo do aviso "${NOME_EVENTO_AVISO[req.body.evento].titulo}", pelo número da equipe` : req.body.de === 'cliente' ? 'número do cliente' : 'número da equipe'} para ${r.para}): ${r.ok ? 'funcionou' : `falhou — ${r.mensagem}`}`,
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

  // ---------- o mapa do robô do LineChat (2.0.1) ----------

  app.get('/integracoes/robo', {
    ...integrar,
    schema: { tags: tagsIntegracoes, summary: 'O mapa do robô do LineChat (de onde vem cada campo do chamado no JSON que o robô manda) e o último pedido dele, com o que aconteceu' },
  }, async () => integracoes.roboDaTela(app));

  app.put('/integracoes/robo', {
    ...integrar,
    schema: { tags: tagsIntegracoes, summary: 'Gravar o mapa do robô: cada campo é um texto com as variáveis do pedido entre {{ }}, como "Atendimento de {{contact.name}}"', body: MapaDoRoboSchema },
  }, async (req) => {
    const r = await integracoes.gravarMapaDoRobo(app, req.body, req.user!.id);
    if (r.mudou.length) {
      await app.audit(req, {
        action: 'settings_atendimento_robo', entityType: 'settings', entityId: 'atendimento-robo',
        summary: `Mudou o mapa do robô do LineChat: ${r.mudou.join(', ')}`, before: r.antes, after: r.mapa,
      });
    }
    return r.mapa;
  });

  app.post('/integracoes/robo/experimentar', {
    ...integrar,
    // "Como fica" pergunta a cada pausa na digitação
    config: { rateLimit: { max: 240, timeWindow: '1 minute' } },
    bodyLimit: 1024 * 1024,
    schema: { tags: tagsIntegracoes, summary: 'Como fica: o chamado que um pedido do robô abriria com este mapa (sem abrir nada e sem salvar o mapa)', body: ExperimentarRoboSchema },
  }, async (req) => experimentarRobo(app, req.body.mapa, req.body.corpo, parametrosDoEndereco(req.body.endereco)));

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

  // ---------- a NIA (2.0.4.1): o botão da ficha e as etiquetas do combinado com o fluxo do n8n ----------

  app.get('/integracoes/nia', {
    ...integrar,
    schema: { tags: tagsIntegracoes, summary: 'Os ajustes da NIA: o botão na ficha e as etiquetas de pedir, de pronto e de erro (as do fluxo do n8n)' },
  }, async () => (await integracoes.lerConfig(app.db)).nia);

  app.put('/integracoes/nia', {
    ...integrar,
    schema: { tags: tagsIntegracoes, summary: 'Muda os ajustes da NIA (o botão na ficha e as três etiquetas, diferentes entre si)', body: AjustesDaNiaSchema },
  }, async (req) => {
    const r = await integracoes.gravarNia(app, req.body, req.user!.id);
    await app.audit(req, {
      action: 'settings_atendimento_nia', entityType: 'settings', entityId: 'atendimento-integracoes',
      summary: r.nia.ligada
        ? `Mudou o botão da NIA na ficha: ligado, com as etiquetas ${r.nia.pedir} (pedir), ${r.nia.pronto} (pronto) e ${r.nia.erro} (erro)`
        : 'Desligou o botão da NIA na ficha',
      before: { nia: r.antes }, after: { nia: r.nia },
    });
    return r.nia;
  });
};

export default routes;
