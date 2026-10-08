/**
 * Base de conhecimento (Patch 1.8): os artigos, a busca, as versões, a leitura obrigatória, os
 * comentários, a base nas outras telas (fichas, chamados, projetos) e a IA. Ler é de todo mundo
 * (`records.read`); escrever e comentar é `knowledge.write`; cuidar da base (leitura obrigatória,
 * rascunhos de todos) é `knowledge.manage`; os ajustes da IA (o provedor, o modelo e a chave) são da
 * administração. Tudo o que muda vai para a auditoria.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AjustesIaSchema, ArtigoGravarSchema, BaseListarSchema, codigoDoArtigo, ComentarioArtigoSchema, hostDoEndereco, INFO_PROVEDORES, LigacaoArtigoSchema, ModelosIaSchema,
  PerguntarSchema, RascunhoIaSchema, TIPOS_LIGACAO,
} from '@gestor/shared';
import * as svc from '../services/base.js';
import * as ia from '../services/baseIa.js';

const Numero = z.object({ numero: z.string() });
const NumeroVersao = z.object({ numero: z.string(), versao: z.coerce.number().int().min(1) });
const NumeroComentario = z.object({ numero: z.string(), id: z.string() });

/** O nome do arquivo no cabeçalho de download, sem quebrar em nome com acento ou aspas. */
function contentDisposition(tipo: 'inline' | 'attachment', fileName: string) {
  const simples = fileName.replace(/[^\w.\- ]/g, '_');
  return `${tipo}; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

const routes: FastifyPluginAsyncZod = async (app) => {
  const ler = { preHandler: app.requirePermission('records.read') };
  const escrever = { preHandler: app.requirePermission('knowledge.write') };
  const cuidar = { preHandler: app.requirePermission('knowledge.manage') };
  const quem = (req: { user: { id: string; name: string; permissions: string[] } | null }) => req.user!;
  const n = (p: { numero: string }) => svc.numeroDoParametro(p.numero);
  const pediuLeitura = (a: { number: number; title: string }) => `Pediu a leitura obrigatória de ${codigoDoArtigo(a.number)} "${a.title}"`;

  // ---------- ler ----------

  app.get('/', { ...ler, schema: { tags: ['Base de conhecimento'], summary: 'A lista da base: busca (sem acento, por pedaço de palavra), filtros, ordem e página', querystring: BaseListarSchema } },
    async (req) => svc.listar(app.db, req.query, quem(req)));

  app.get('/opcoes', { ...ler, schema: { tags: ['Base de conhecimento'], summary: 'Produtos, módulos, assuntos do LineChat, clientes, modelos, operadoras, projetos e autores (filtros e formulário)' } },
    async () => svc.opcoes(app.db));

  app.get('/obrigatorias', { ...ler, schema: { tags: ['Base de conhecimento'], summary: 'Os artigos de leitura obrigatória que esta pessoa ainda não leu (o número do menu)' } },
    async (req) => svc.pendentes(app.db, quem(req)));

  app.get('/ligados', {
    ...ler,
    schema: { tags: ['Base de conhecimento'], summary: 'Os artigos publicados ligados a um cliente, modelo, operadora, projeto…', querystring: z.object({ tipo: z.enum(TIPOS_LIGACAO), alvo: z.string().min(1) }) },
  }, async (req) => svc.ligadosA(app.db, req.query.tipo, req.query.alvo));

  app.post('/para-chamados', {
    preHandler: app.requirePermission('support.read'),
    schema: { tags: ['Base de conhecimento'], summary: 'O livrinho da tabela de Chamados: os artigos que valem para cada card', body: z.object({ ids: z.array(z.string()).max(5000) }) },
  }, async (req) => svc.paraChamados(app.db, req.body.ids));

  app.get('/do-chamado/:ref', {
    ...escrever,
    schema: { tags: ['Base de conhecimento'], summary: 'Registrar a partir do chamado: título, descrição e ligações já preenchidos (pelo id do card ou pelo IS-3607)', params: z.object({ ref: z.string() }) },
  }, async (req) => svc.doChamado(app.db, req.params.ref));

  app.get('/anexos/:id', { ...ler, schema: { tags: ['Base de conhecimento'], summary: 'Um print (abre na tela) ou um anexo (baixa como arquivo)', params: z.object({ id: z.string() }) } },
    async (req, reply) => {
      const a = await svc.lerAnexo(app.db, req.params.id, quem(req));
      reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=86400');
      // o print é imagem que o próprio navegador reduziu (nunca SVG); o resto sempre baixa
      if (a.imagem) return reply.header('Content-Type', a.mimeType).header('Content-Disposition', contentDisposition('inline', a.fileName)).send(a.buffer);
      return reply.header('Content-Type', 'application/octet-stream').header('Content-Disposition', contentDisposition('attachment', a.fileName)).send(a.buffer);
    });

  // ---------- a IA (com o provedor que a administração escolher) ----------

  app.get('/ia', { ...ler, schema: { tags: ['Base de conhecimento'], summary: 'A IA está ligada? (para mostrar o "Perguntar à IA")' } },
    async () => ia.situacaoIa(app.db));

  app.post('/ia/perguntar', {
    ...ler,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { tags: ['Base de conhecimento'], summary: 'Perguntar à base: a IA responde só com os artigos publicados que a busca achar, citando de onde tirou', body: PerguntarSchema },
  }, async (req) => {
    const r = await ia.perguntar(app.db, app.vault, req.body.pergunta, quem(req));
    await app.audit(req, {
      action: 'base_ia_pergunta', entityType: 'knowledge', entityId: null,
      summary: `${req.user!.name} perguntou à base (IA, ${r.provedor}): "${req.body.pergunta.slice(0, 120)}"${r.achou ? ` — respondeu com ${r.artigos.filter((a) => a.citado).map((a) => a.codigo).join(', ')}` : ' — a base não tinha a resposta'}`,
    });
    return r;
  });

  app.post('/ia/rascunho', {
    ...escrever,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { tags: ['Base de conhecimento'], summary: 'O rascunho do artigo, escrito pela IA a partir do card (a pessoa revisa antes de publicar)', body: RascunhoIaSchema },
  }, async (req) => {
    const r = await ia.rascunho(app.db, app.vault, req.body.chamado, quem(req));
    await app.audit(req, { action: 'base_ia_rascunho', entityType: 'knowledge', entityId: null, summary: `${req.user!.name} pediu à IA (${r.provedor}) o rascunho de um artigo a partir do chamado ${req.body.chamado}` });
    return r;
  });

  const administrar = { preHandler: app.requirePermission('admin.manage') };

  app.get('/ia/ajustes', { ...administrar, schema: { tags: ['Base de conhecimento'], summary: 'Os ajustes da IA: provedor, modelo, último teste e o uso do mês (a chave nunca volta)' } },
    async () => ia.statusIa(app.db));

  app.put('/ia/ajustes', {
    ...administrar,
    schema: { tags: ['Base de conhecimento'], summary: 'Ligar a IA, escolher o provedor e o modelo, e trocar a chave (que vai para o cofre)', body: AjustesIaSchema },
  }, async (req) => {
    const r = await ia.gravarAjustesIa(app.db, app.vault, req.body, req.user!.id);
    await app.audit(req, {
      action: 'settings_base_ia', entityType: 'settings', entityId: 'base-ia',
      summary: `${req.user!.name} ${req.body.ativo ? 'ligou' : 'desligou'} a IA da base (${INFO_PROVEDORES[r.provedor].nome}${r.modelo ? ` · ${r.modeloNome || r.modelo}` : ''})${req.body.chave ? ' e trocou a chave' : ''}`,
    });
    return r;
  });

  app.post('/ia/modelos', {
    ...administrar,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { tags: ['Base de conhecimento'], summary: 'Os modelos que a chave pode usar (a chave digitada, ou a guardada se for do mesmo provedor)', body: ModelosIaSchema },
  }, async (req) => {
    const r = await ia.modelosDoProvedor(app.db, app.vault, req.body);
    // a lista sai com a chave digitada ou com a guardada (que só vai para o provedor e o serviço dela)
    const onde = req.body.provedor === 'compativel' ? ` · ${hostDoEndereco(req.body.endereco)}` : '';
    await app.audit(req, {
      action: 'settings_base_ia_modelos', entityType: 'settings', entityId: 'base-ia',
      summary: `${req.user!.name} buscou os modelos da IA (${INFO_PROVEDORES[req.body.provedor].nome}${onde}) com a chave ${r.chaveGuardada ? 'guardada' : 'digitada'}: ${r.modelos.length} ${r.modelos.length === 1 ? 'modelo' : 'modelos'}`,
    });
    return { modelos: r.modelos };
  });

  app.post('/ia/testar', { ...administrar, schema: { tags: ['Base de conhecimento'], summary: 'Testar a chave, o modelo e o endereço guardados' } },
    async (req) => {
      const r = await ia.testarIa(app.db, app.vault);
      await app.audit(req, { action: 'settings_base_ia_test', entityType: 'settings', entityId: 'base-ia', summary: `${req.user!.name} testou a IA da base (${r.ok ? 'funcionou' : 'falhou'})` });
      return r;
    });

  // ---------- um artigo ----------

  app.get('/:numero', { ...ler, schema: { tags: ['Base de conhecimento'], summary: 'Um artigo inteiro (pelo número: 12 ou BC-12)', params: Numero } },
    async (req) => svc.ler(app.db, n(req.params), quem(req)));

  app.post('/', { ...escrever, schema: { tags: ['Base de conhecimento'], summary: 'Escrever um artigo (rascunho, ou já publicado; quem cuida da base pode pedir a leitura da equipe junto)', body: ArtigoGravarSchema } },
    async (req, reply) => {
      const a = await svc.criar(app.db, req.body, quem(req));
      await app.audit(req, {
        action: 'create', entityType: 'knowledge', entityId: a.id,
        summary: `${req.body.publicar ? 'Publicou' : 'Escreveu o rascunho de'} ${codigoDoArtigo(a.number)} "${a.title}"`,
      });
      if (req.body.pedirLeitura) await app.audit(req, { action: 'update', entityType: 'knowledge', entityId: a.id, summary: pediuLeitura(a) });
      return reply.status(201).send({ numero: a.number, codigo: codigoDoArtigo(a.number), situacao: a.status, versao: a.version });
    });

  app.put('/:numero', { ...escrever, schema: { tags: ['Base de conhecimento'], summary: 'Melhorar um artigo (qualquer um que escreve; a versão anterior fica guardada)', params: Numero, body: ArtigoGravarSchema } },
    async (req) => {
      const { antes, depois, mudouAlgo, mudouTexto, publicouAgora, pediuLeitura: pediu } = await svc.atualizar(app.db, n(req.params), req.body, quem(req));
      if (mudouAlgo) {
        await app.audit(req, {
          action: 'update', entityType: 'knowledge', entityId: depois.id,
          summary: `${publicouAgora ? 'Publicou' : 'Editou'} ${codigoDoArtigo(depois.number)} "${depois.title}"${mudouTexto ? ` (versão ${depois.version})` : ''}`,
          before: { title: antes.title, status: antes.status, version: antes.version },
          after: { title: depois.title, status: depois.status, version: depois.version },
        });
      }
      if (pediu) await app.audit(req, { action: 'update', entityType: 'knowledge', entityId: depois.id, summary: pediuLeitura(depois) });
      return { numero: depois.number, codigo: codigoDoArtigo(depois.number), situacao: depois.status, versao: depois.version };
    });

  app.delete('/:numero', { ...escrever, schema: { tags: ['Base de conhecimento'], summary: 'Mandar o artigo para a lixeira (quem escreveu, ou quem cuida da base)', params: Numero } },
    async (req) => {
      const a = await svc.apagar(app.db, n(req.params), quem(req));
      await app.audit(req, { action: 'delete', entityType: 'knowledge', entityId: a.id, summary: `Mandou ${codigoDoArtigo(a.number)} "${a.title}" para a lixeira` });
      return { ok: true };
    });

  app.post('/:numero/ligacoes', {
    ...escrever,
    schema: { tags: ['Base de conhecimento'], summary: 'Ligar ou tirar uma coisa do artigo (o "Ligar um artigo" do projeto)', params: Numero, body: LigacaoArtigoSchema.extend({ ligar: z.boolean().default(true) }) },
  }, async (req) => {
    const a = await svc.ligarUma(app.db, n(req.params), { tipo: req.body.tipo, alvo: req.body.alvo }, req.body.ligar, quem(req));
    await app.audit(req, { action: 'update', entityType: 'knowledge', entityId: a.id, summary: `${req.body.ligar ? 'Ligou' : 'Desligou'} ${codigoDoArtigo(a.number)} ${req.body.ligar ? 'a' : 'de'} um ${req.body.tipo}` });
    return { ok: true };
  });

  // ---------- versões ----------

  app.get('/:numero/versoes', { ...ler, schema: { tags: ['Base de conhecimento'], summary: 'As versões do texto, da mais nova para a mais antiga', params: Numero } },
    async (req) => svc.versoes(app.db, n(req.params), quem(req)));

  app.get('/:numero/comparar', {
    ...ler,
    schema: { tags: ['Base de conhecimento'], summary: 'Duas versões inteiras (a tela mostra o que saiu e o que entrou)', params: Numero, querystring: z.object({ de: z.coerce.number().int().min(1), para: z.coerce.number().int().min(1) }) },
  }, async (req) => svc.duasVersoes(app.db, n(req.params), req.query.de, req.query.para, quem(req)));

  app.post('/:numero/versoes/:versao/voltar', { ...escrever, schema: { tags: ['Base de conhecimento'], summary: 'Voltar a uma versão (vira uma versão nova; nada se perde)', params: NumeroVersao } },
    async (req) => {
      const a = await svc.voltarVersao(app.db, n(req.params), req.params.versao, quem(req));
      await app.audit(req, { action: 'update', entityType: 'knowledge', entityId: a.id, summary: `Voltou ${codigoDoArtigo(a.number)} à versão ${req.params.versao} (agora versão ${a.version})` });
      return { numero: a.number, versao: a.version };
    });

  // ---------- leitura obrigatória ----------

  app.post('/:numero/obrigatoria', { ...cuidar, schema: { tags: ['Base de conhecimento'], summary: 'Pedir (ou tirar) a leitura obrigatória da equipe', params: Numero, body: z.object({ ligar: z.boolean() }) } },
    async (req) => {
      const a = await svc.marcarObrigatoria(app.db, n(req.params), req.body.ligar, quem(req));
      await app.audit(req, { action: 'update', entityType: 'knowledge', entityId: a.id, summary: req.body.ligar ? pediuLeitura(a) : `Tirou a leitura obrigatória de ${codigoDoArtigo(a.number)}` });
      return { ok: true };
    });

  app.post('/:numero/lida', { ...ler, schema: { tags: ['Base de conhecimento'], summary: '"Li e entendi"', params: Numero } },
    async (req) => {
      const a = await svc.marcarLida(app.db, n(req.params), quem(req));
      await app.audit(req, { action: 'update', entityType: 'knowledge', entityId: a.id, summary: `${req.user!.name} leu ${codigoDoArtigo(a.number)} "${a.title}"` });
      return { ok: true };
    });

  app.get('/:numero/leituras', { ...cuidar, schema: { tags: ['Base de conhecimento'], summary: 'Quem já leu e quem falta (leitura obrigatória)', params: Numero } },
    async (req) => svc.leituras(app.db, n(req.params), quem(req)));

  // ---------- comentários ----------

  app.post('/:numero/comentarios', { ...escrever, schema: { tags: ['Base de conhecimento'], summary: 'Comentar no artigo (fica registrado quem e quando; o texto do artigo não muda)', params: Numero, body: ComentarioArtigoSchema } },
    async (req, reply) => {
      const { a, c } = await svc.comentar(app.db, n(req.params), req.body.texto, quem(req));
      await app.audit(req, { action: 'create', entityType: 'knowledge', entityId: a.id, summary: `Comentou em ${codigoDoArtigo(a.number)} "${a.title}"`, after: { comentario: c.body } });
      return reply.status(201).send({ id: c.id });
    });

  app.delete('/:numero/comentarios/:id', { ...escrever, schema: { tags: ['Base de conhecimento'], summary: 'Apagar um comentário (o seu, ou qualquer um se você cuida da base); a auditoria guarda o texto', params: NumeroComentario } },
    async (req) => {
      const { a, c, autor } = await svc.apagarComentario(app.db, n(req.params), req.params.id, quem(req));
      await app.audit(req, {
        action: 'delete', entityType: 'knowledge', entityId: a.id,
        summary: `Apagou um comentário${autor && autor !== req.user!.name ? ` de ${autor}` : ''} em ${codigoDoArtigo(a.number)}`,
        before: { comentario: c.body, escritoEm: c.createdAt.toISOString(), por: autor },
      });
      return { ok: true };
    });
};

export default routes;
