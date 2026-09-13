/**
 * Administração › Ajustes: backup no Google Drive e avisos (WhatsApp pelo LineChat).
 * Só quem gerencia o sistema mexe aqui, e tudo o que é feito fica na auditoria.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AjustesAvisosSchema, AjustesBackupSchema } from '@gestor/shared';
import { BadRequest } from '../plugins/errors.js';
import * as integ from '../services/integracoes.js';

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
};

export default routes;
