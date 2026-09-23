/**
 * Administração › Ajustes: backup no Google Drive, avisos (WhatsApp pelo LineChat) e a leitura
 * dos chamados do LineChat. Só quem gerencia o sistema mexe aqui, e tudo fica na auditoria.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AjustesAvisosSchema, AjustesBackupSchema, AjustesLineChatSchema, Booleano } from '@gestor/shared';
import { BadRequest } from '../plugins/errors.js';
import * as integ from '../services/integracoes.js';
import * as linechat from '../services/linechat.js';
import { esquecerLeitura } from '../services/chamados.js';

const StatusBackup = z.object({
  ativo: z.boolean(), pasta: z.string(), pastaId: z.string(), contaDeServico: z.string(),
  ultimoEnvioEm: z.string().nullable(), ultimoEnvioOk: z.boolean().nullable(), ultimoEnvioMsg: z.string().nullable(),
  temChave: z.boolean(),
});
const StatusAvisos = z.object({
  ativo: z.boolean(), url: z.string(), metodo: z.enum(['POST', 'GET']), cabecalhos: z.string(), corpo: z.string(),
  ultimoTesteEm: z.string().nullable(), ultimoTesteOk: z.boolean().nullable(), ultimoTesteMsg: z.string().nullable(),
  temToken: z.boolean(),
});
const Resultado = z.object({ ok: z.boolean(), mensagem: z.string() });
const StatusLineChat = z.object({
  ativo: z.boolean(), url: z.string(), appUrl: z.string(), painelId: z.string(), painelNome: z.string(), temToken: z.boolean(),
  inicioEm: z.string().nullable(), ultimaEm: z.string().nullable(), ultimaOk: z.boolean().nullable(), ultimaMsg: z.string().nullable(),
  ultimaCompletaEm: z.string().nullable(),
  totais: z.object({ cards: z.number(), ativos: z.number(), arquivados: z.number(), movimentos: z.number() }),
  execucoes: z.array(z.object({
    id: z.string(), kind: z.string(), trigger: z.string(), startedAt: z.date(), finishedAt: z.date().nullable(), ok: z.boolean(), message: z.string().nullable(),
  })),
});

const routes: FastifyPluginAsyncZod = async (app) => {
  const so = { preHandler: app.requirePermission('admin.manage') };

  // ---------- backup no Google Drive ----------

  app.get('/backup', { ...so, schema: { tags: ['Ajustes'], summary: 'Como está o backup no Google Drive', response: { 200: StatusBackup } } }, async () => {
    const { valor, temSegredo } = await integ.ler<integ.AjustesBackup>(app.db, 'backup');
    return { ...valor, temChave: temSegredo };
  });

  app.put('/backup', {
    ...so,
    schema: { tags: ['Ajustes'], summary: 'Salvar os ajustes do backup', body: AjustesBackupSchema, response: { 200: StatusBackup } },
  }, async (req) => {
    const { valor } = await integ.ler<integ.AjustesBackup>(app.db, 'backup');
    let secretId: string | null | undefined;
    let contaDeServico = valor.contaDeServico;

    // a chave só vem quando a pessoa envia um arquivo novo; em branco = manter a que já está lá
    if (req.body.chaveJson) {
      const chave = integ.lerChaveDeServico(req.body.chaveJson);
      contaDeServico = chave.client_email;
      const atual = await app.db.query.settings.findFirst({ where: (t, { eq }) => eq(t.id, 'backup') });
      secretId = await app.vault.save(app.db, { existingId: atual?.secretId ?? null, label: 'Chave da conta de serviço do Google Drive', plain: req.body.chaveJson, userId: req.user!.id });
    }
    const novo: integ.AjustesBackup = { ...valor, ativo: req.body.ativo, pasta: req.body.pasta, pastaId: req.body.pastaId.trim(), contaDeServico };
    await integ.gravar(app.db, 'backup', novo, { secretId, userId: req.user!.id });
    await app.audit(req, { action: 'settings_backup', entityType: 'settings', entityId: 'backup', summary: `${req.user!.name} ${req.body.ativo ? 'ligou' : 'desligou'} o envio do backup para o Google Drive` });
    const depois = await integ.ler<integ.AjustesBackup>(app.db, 'backup');
    return { ...depois.valor, temChave: depois.temSegredo };
  });

  app.post('/backup/test', { ...so, schema: { tags: ['Ajustes'], summary: 'Testar a conexão com o Google Drive', response: { 200: Resultado } } }, async (req) => {
    const { valor } = await integ.ler<integ.AjustesBackup>(app.db, 'backup');
    const chave = await integ.segredo(app.db, app.vault, 'backup');
    if (!chave) throw new BadRequest('Envie primeiro o arquivo de chave da conta de serviço.');
    if (!valor.pastaId) throw new BadRequest('Informe o id da pasta do Drive.');
    try {
      const mensagem = await integ.testarDrive(chave, valor.pastaId);
      await app.audit(req, { action: 'settings_backup_test', entityType: 'settings', entityId: 'backup', summary: `${req.user!.name} testou o envio para o Google Drive` });
      return { ok: true, mensagem };
    } catch (e) {
      return { ok: false, mensagem: e instanceof Error ? e.message : 'Falhou' };
    }
  });

  // ---------- avisos ----------

  app.get('/alerts', { ...so, schema: { tags: ['Ajustes'], summary: 'Como estão os avisos', response: { 200: StatusAvisos } } }, async () => {
    const { valor, temSegredo } = await integ.ler<integ.AjustesAvisos>(app.db, 'avisos');
    return { ...valor, temToken: temSegredo };
  });

  app.put('/alerts', {
    ...so,
    schema: { tags: ['Ajustes'], summary: 'Salvar os ajustes de aviso', body: AjustesAvisosSchema, response: { 200: StatusAvisos } },
  }, async (req) => {
    const { valor } = await integ.ler<integ.AjustesAvisos>(app.db, 'avisos');
    let secretId: string | null | undefined;
    if (req.body.token !== undefined && req.body.token !== '') {
      const atual = await app.db.query.settings.findFirst({ where: (t, { eq }) => eq(t.id, 'avisos') });
      secretId = await app.vault.save(app.db, { existingId: atual?.secretId ?? null, label: 'Token da API de avisos', plain: req.body.token, userId: req.user!.id });
    }
    const novo: integ.AjustesAvisos = {
      ...valor, ativo: req.body.ativo, url: req.body.url.trim(), metodo: req.body.metodo,
      cabecalhos: req.body.cabecalhos, corpo: req.body.corpo,
    };
    await integ.gravar(app.db, 'avisos', novo, { secretId, userId: req.user!.id });
    await integ.escreverArquivosDeRuntime(app.db, app.vault).catch((e) => app.log.warn({ e }, 'não deu para escrever a cópia dos avisos em disco'));
    await app.audit(req, { action: 'settings_alerts', entityType: 'settings', entityId: 'avisos', summary: `${req.user!.name} ${req.body.ativo ? 'ligou' : 'desligou'} os avisos automáticos` });
    const depois = await integ.ler<integ.AjustesAvisos>(app.db, 'avisos');
    return { ...depois.valor, temToken: depois.temSegredo };
  });

  app.post('/alerts/test', { ...so, schema: { tags: ['Ajustes'], summary: 'Mandar uma mensagem de teste', response: { 200: Resultado } } }, async (req) => {
    const { valor } = await integ.ler<integ.AjustesAvisos>(app.db, 'avisos');
    const token = await integ.segredo(app.db, app.vault, 'avisos');
    let ok = true; let mensagem = '';
    try {
      mensagem = await integ.enviarAviso(valor, token, 'Teste do Ingline Gestão: os avisos estão funcionando. Pode ignorar esta mensagem.');
    } catch (e) { ok = false; mensagem = e instanceof Error ? e.message : 'Falhou'; }
    await integ.gravar(app.db, 'avisos', { ...valor, ultimoTesteEm: new Date().toISOString(), ultimoTesteOk: ok, ultimoTesteMsg: mensagem }, { userId: req.user!.id });
    await app.audit(req, { action: 'settings_alerts_test', entityType: 'settings', entityId: 'avisos', summary: `${req.user!.name} mandou uma mensagem de teste (${ok ? 'funcionou' : 'falhou'})` });
    return { ok, mensagem };
  });

  // ---------- chamados do LineChat ----------

  const statusLineChat = async () => {
    const { valor, temSegredo } = await linechat.lerAjustes(app.db);
    return {
      ativo: valor.ativo, url: valor.url, appUrl: valor.appUrl, painelId: valor.painelId, painelNome: valor.painelNome, temToken: temSegredo,
      inicioEm: valor.inicioEm, ultimaEm: valor.ultimaEm, ultimaOk: valor.ultimaOk, ultimaMsg: valor.ultimaMsg, ultimaCompletaEm: valor.ultimaCompletaEm,
      totais: await linechat.totais(app.db, valor.painelId),
      execucoes: await linechat.ultimasExecucoes(app.db),
    };
  };

  app.get('/linechat', { ...so, schema: { tags: ['Ajustes'], summary: 'Como está a leitura dos chamados do LineChat', response: { 200: StatusLineChat } } }, statusLineChat);

  app.put('/linechat', {
    ...so,
    schema: { tags: ['Ajustes'], summary: 'Salvar de onde ler os chamados (token, painel)', body: AjustesLineChatSchema, response: { 200: StatusLineChat } },
  }, async (req) => {
    const { valor } = await linechat.lerAjustes(app.db);
    let secretId: string | null | undefined;
    if (req.body.token) {
      const atual = await app.db.query.settings.findFirst({ where: (t, { eq }) => eq(t.id, 'linechat') });
      secretId = await app.vault.save(app.db, { existingId: atual?.secretId ?? null, label: 'Token da API do LineChat (chamados)', plain: req.body.token, userId: req.user!.id });
    }
    const trocouPainel = req.body.painelId !== valor.painelId;
    const novo: integ.AjustesLineChat = {
      ...valor, ativo: req.body.ativo, url: req.body.url.replace(/\/+$/, ''), appUrl: req.body.appUrl.replace(/\/+$/, ''),
      painelId: req.body.painelId, painelNome: req.body.painelNome || (trocouPainel ? '' : valor.painelNome),
      // painel novo começa do zero: a primeira leitura dele é completa e o histórico conta dali
      ...(trocouPainel ? { inicioEm: null, marcoEm: null, ultimaCompletaEm: null } : {}),
    };
    await integ.gravar(app.db, 'linechat', novo, { secretId, userId: req.user!.id });
    esquecerLeitura();
    await app.audit(req, {
      action: 'settings_linechat', entityType: 'settings', entityId: 'linechat',
      summary: `${req.user!.name} ${req.body.ativo ? 'ligou' : 'desligou'} a leitura dos chamados do LineChat${novo.painelNome ? ` (painel ${novo.painelNome})` : ''}${req.body.token ? ' e trocou o token' : ''}`,
    });
    return statusLineChat();
  });

  app.get('/linechat/paineis', {
    ...so,
    schema: { tags: ['Ajustes'], summary: 'Os painéis da conta no LineChat, para escolher de qual ler', response: { 200: z.array(z.object({ id: z.string(), title: z.string(), key: z.string().nullable(), type: z.string().nullable() })) } },
  }, async () => {
    try {
      const { api } = await linechat.clienteDaApi(app.db, app.vault);
      return await api.paineis();
    } catch (e) {
      throw new BadRequest(e instanceof Error ? e.message : 'Não deu para ler os painéis');
    }
  });

  app.post('/linechat/test', { ...so, schema: { tags: ['Ajustes'], summary: 'Testar o token e o painel do LineChat', response: { 200: Resultado } } }, async (req) => {
    let ok = true; let mensagem: string;
    try {
      const { api, ajustes } = await linechat.clienteDaApi(app.db, app.vault);
      if (!ajustes.painelId) {
        const paineis = await api.paineis();
        mensagem = `Token aceito. A conta tem ${paineis.length} painéis — escolha abaixo de qual ler os chamados.`;
      } else {
        const p = await api.painel(ajustes.painelId);
        const etapas = (p.steps ?? []).filter((e) => !e.archived);
        const cards = etapas.reduce((a, e) => a + Number((e as { cardCount?: number }).cardCount ?? 0), 0);
        mensagem = `Token aceito. Painel "${p.title}": ${etapas.length} etapas, ${(p.tags ?? []).length} etiquetas${cards ? ` e ${cards.toLocaleString('pt-BR')} cards ativos` : ''}.`;
      }
    } catch (e) { ok = false; mensagem = e instanceof Error ? e.message : 'Falhou'; }
    await app.audit(req, { action: 'settings_linechat_test', entityType: 'settings', entityId: 'linechat', summary: `${req.user!.name} testou a conexão com o LineChat (${ok ? 'funcionou' : 'falhou'})` });
    return { ok, mensagem };
  });

  app.post('/linechat/sync', {
    ...so,
    schema: {
      tags: ['Ajustes'], summary: 'Sincronizar agora (completa = relê o painel inteiro)',
      body: z.object({ completa: Booleano.default(false) }).default({}),
      response: { 200: z.object({ ok: z.boolean(), mensagem: z.string(), tipo: z.string(), lidos: z.number(), novos: z.number(), movimentos: z.number(), removidos: z.number() }) },
    },
  }, async (req) => {
    const r = await linechat.sincronizar(app.db, app.vault, { completa: req.body.completa, gatilho: 'manual', userId: req.user!.id, log: app.log });
    await app.audit(req, { action: 'settings_linechat_sync', entityType: 'settings', entityId: 'linechat', summary: `${req.user!.name} sincronizou os chamados do LineChat agora (${r.ok ? r.mensagem : `falhou: ${r.mensagem}`})` });
    return r;
  });
};

export default routes;
