/**
 * Portal do cliente — o lado da equipe (Patch 1.8, decisão 0040): os tutoriais, os arquivos
 * (vídeo, print, arquivo para baixar), os acessos das pessoas dos clientes e os ajustes.
 * Ver é de todo mundo da equipe (`records.read`); escrever tutorial é `portal.write`; dar e tirar
 * acesso é `portal.access`; os ajustes (nome do portal, contato do suporte) são `admin.manage`.
 * Tudo o que muda vai para a auditoria (`entityType = portal`) — nunca o código do convite.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { AcessoCriarSchema, caminhoDoTutorial, LIMITES_PORTAL, PortalAjustesSchema, TIPOS_ARQUIVO_PORTAL, TutorialGravarSchema, TutoriaisListarSchema } from '@gestor/shared';
import { BadRequest } from '../plugins/errors.js';
import * as svc from '../services/portal.js';
import { mandarArquivo } from './portalArquivo.js';

const Numero = z.object({ numero: z.coerce.number().int().min(1) });
const Id = z.object({ id: z.string().min(1) });
const caminhoDoConvite = (codigo: string) => `/portal/convite/${codigo}`;

const routes: FastifyPluginAsyncZod = async (app) => {
  // um arquivo por vez; o tamanho de cada tipo é conferido no pedido (o vídeo vai até 300 MB)
  await app.register(multipart, { limits: { files: 1, fields: 5, fileSize: LIMITES_PORTAL.video } });

  const ver = { preHandler: app.requirePermission('records.read') };
  const escrever = { preHandler: app.requirePermission('portal.write') };
  const acessos = { preHandler: app.requirePermission('portal.access') };
  const quem = (req: { user: { id: string; name: string; permissions: string[] } | null }) => req.user!;
  const tag = { tags: ['Portal do cliente (equipe)'] };

  app.get('/opcoes', { ...ver, schema: { ...tag, summary: 'Os produtos e módulos (o formulário e os filtros)' } }, async () => svc.opcoes(app.db));

  // ---------- os tutoriais ----------

  app.get('/tutoriais', { ...ver, schema: { ...tag, summary: 'Os tutoriais: busca, produto e situação', querystring: TutoriaisListarSchema } },
    async (req) => svc.listarTutoriais(app.db, req.query));

  app.get('/tutoriais/:numero', { ...ver, schema: { ...tag, summary: 'Um tutorial inteiro (inclusive o rascunho)', params: Numero } },
    async (req) => svc.lerTutorial(app.db, req.params.numero));

  app.post('/tutoriais', { ...escrever, schema: { ...tag, summary: 'Escrever um tutorial (rascunho, ou já publicado)', body: TutorialGravarSchema } },
    async (req, reply) => {
      const t = await svc.criarTutorial(app.db, req.body, quem(req));
      await app.audit(req, { action: 'create', entityType: 'portal', entityId: t.id, summary: `${t.status === 'publicado' ? 'Publicou' : 'Escreveu o rascunho do'} tutorial ${t.number} "${t.title}" no portal` });
      return reply.status(201).send({ numero: t.number, versao: t.version, situacao: t.status, caminho: caminhoDoTutorial(t.number, t.title) });
    });

  app.put('/tutoriais/:numero', { ...escrever, schema: { ...tag, summary: 'Melhorar um tutorial (quem salvou no meio não é atropelado)', params: Numero, body: TutorialGravarSchema } },
    async (req) => {
      const { antes, depois } = await svc.atualizarTutorial(app.db, req.params.numero, req.body, quem(req));
      const acao = antes.status !== depois.status ? (depois.status === 'publicado' ? 'Publicou' : 'Tirou do portal (voltou a rascunho)') : 'Editou';
      await app.audit(req, {
        action: 'update', entityType: 'portal', entityId: depois.id, summary: `${acao} o tutorial ${depois.number} "${depois.title}"`,
        before: { title: antes.title, status: antes.status, productId: antes.productId }, after: { title: depois.title, status: depois.status, productId: depois.productId },
      });
      return { numero: depois.number, versao: depois.version, situacao: depois.status, caminho: caminhoDoTutorial(depois.number, depois.title) };
    });

  app.delete('/tutoriais/:numero', { ...escrever, schema: { ...tag, summary: 'Mandar o tutorial para a lixeira (sai do portal na hora)', params: Numero } },
    async (req) => {
      const t = await svc.apagarTutorial(app.db, req.params.numero);
      await app.audit(req, { action: 'delete', entityType: 'portal', entityId: t.id, summary: `Mandou o tutorial ${t.number} "${t.title}" para a lixeira` });
      return { ok: true };
    });

  // ---------- os arquivos ----------

  app.post('/arquivos', {
    ...escrever,
    schema: { ...tag, summary: 'Subir um arquivo: imagem (print), vídeo (até 300 MB, fica em disco) ou arquivo para baixar', querystring: z.object({ tipo: z.enum(TIPOS_ARQUIVO_PORTAL) }), consumes: ['multipart/form-data'] },
  }, async (req, reply) => {
    const { tipo } = req.query;
    const parte = await req.file({ limits: { fileSize: LIMITES_PORTAL[tipo] + 1 } });
    if (!parte) throw new BadRequest('Escolha um arquivo.');
    const f = tipo === 'video'
      ? await svc.guardarVideo(app.db, parte.filename, parte.mimetype, parte.file, () => parte.file.truncated, quem(req))
      : await (async () => {
        let conteudo: Buffer;
        try { conteudo = await parte.toBuffer(); } catch { throw new BadRequest(`Arquivo grande demais: o limite é ${Math.round(LIMITES_PORTAL[tipo] / 1024 / 1024)} MB.`); }
        return svc.guardarNoBanco(app.db, tipo, parte.filename, parte.mimetype, conteudo, quem(req));
      })();
    await app.audit(req, { action: 'create', entityType: 'portal', entityId: f.id, summary: `Subiu ${tipo === 'video' ? 'o vídeo' : tipo === 'imagem' ? 'a imagem' : 'o arquivo'} "${f.nome}" (${Math.max(1, Math.round(f.tamanho / 1024))} KB) para o portal` });
    return reply.status(201).send(f);
  });

  app.get('/espaco', { ...ver, schema: { ...tag, summary: 'Quanto o portal ocupa (os vídeos no disco do servidor e o resto no banco)' } }, async () => svc.espaco(app.db));

  app.get('/arquivos/:id', { ...ver, schema: { ...tag, summary: 'Um arquivo (a equipe vê também o de rascunho)', params: Id } },
    async (req, reply) => mandarArquivo(req, reply, await svc.arquivoParaEquipe(app.db, req.params.id)));

  // ---------- os acessos ----------

  app.get('/acessos', { ...ver, schema: { ...tag, summary: 'Quem tem acesso ao portal, de todos os clientes', querystring: z.object({ q: z.string().trim().max(120).optional(), cliente: z.string().optional() }) } },
    async (req) => svc.listarAcessos(app.db, { q: req.query.q, clienteId: req.query.cliente }));

  app.get('/clientes/:id/acessos', { ...ver, schema: { ...tag, summary: 'Os acessos de um cliente, e se ele está na base (a aba Portal da ficha)', params: Id } },
    async (req) => svc.acessosDoCliente(app.db, req.params.id));

  app.post('/clientes/:id/acessos', { ...acessos, schema: { ...tag, summary: 'Dar acesso a uma pessoa do cliente: devolve o link do convite (a pessoa cria a senha)', params: Id, body: AcessoCriarSchema } },
    async (req, reply) => {
      const { acesso, cliente, codigo } = await svc.criarAcesso(app.db, req.params.id, req.body, quem(req));
      await app.audit(req, { action: 'create', entityType: 'portal', entityId: acesso.id, summary: `Deu acesso ao portal a ${acesso.name} (${acesso.email}), de ${cliente}` });
      return reply.status(201).send({ id: acesso.id, convite: caminhoDoConvite(codigo) });
    });

  app.post('/acessos/:id/convite', { ...acessos, schema: { ...tag, summary: 'Um convite novo (o primeiro venceu, ou a pessoa esqueceu a senha)', params: Id } },
    async (req) => {
      const { acesso, codigo } = await svc.novoConvite(app.db, req.params.id);
      await app.audit(req, { action: 'update', entityType: 'portal', entityId: acesso.id, summary: `Gerou um convite novo para ${acesso.name} (${acesso.email}) entrar no portal` });
      return { id: acesso.id, convite: caminhoDoConvite(codigo) };
    });

  app.post('/acessos/:id/bloqueio', { ...acessos, schema: { ...tag, summary: 'Bloquear (a sessão aberta cai na hora) ou desbloquear o acesso', params: Id, body: z.object({ bloquear: z.boolean() }) } },
    async (req) => {
      const u = await svc.bloquearAcesso(app.db, req.params.id, req.body.bloquear);
      await app.audit(req, { action: 'update', entityType: 'portal', entityId: u.id, summary: `${req.body.bloquear ? 'Bloqueou' : 'Desbloqueou'} o acesso de ${u.name} (${u.email}) ao portal` });
      return { ok: true };
    });

  app.put('/acessos/:id', { ...acessos, schema: { ...tag, summary: 'Corrigir o nome ou o e-mail', params: Id, body: AcessoCriarSchema } },
    async (req) => {
      const { antes, depois } = await svc.atualizarAcesso(app.db, req.params.id, req.body);
      await app.audit(req, { action: 'update', entityType: 'portal', entityId: depois.id, summary: `Corrigiu o acesso de ${depois.name} ao portal`, before: { nome: antes.name, email: antes.email }, after: { nome: depois.name, email: depois.email } });
      return { ok: true };
    });

  // ---------- os ajustes ----------

  app.get('/ajustes', { ...ver, schema: { ...tag, summary: 'O nome do portal, as boas-vindas e o contato do suporte' } }, async () => svc.lerAjustes(app.db));

  app.put('/ajustes', { preHandler: app.requirePermission('admin.manage'), schema: { ...tag, summary: 'Mudar os ajustes do portal', body: PortalAjustesSchema } },
    async (req) => {
      const antes = await svc.lerAjustes(app.db);
      const depois = await svc.gravarAjustes(app.db, req.body, req.user!.id);
      await app.audit(req, { action: 'update', entityType: 'portal', summary: 'Mudou os ajustes do portal do cliente', before: antes, after: depois });
      return depois;
    });
};

export default routes;
