/**
 * Chamados do Gestor (Patch 2.0, decisão 0047): a entrada das integrações — o robô do LineChat e o
 * n8n abrem e mexem nos chamados com uma chave de API (criada em Painéis › Ajustes › Integrações), sem sessão.
 *
 * A chave vem em `Authorization: Bearer <chave>` ou em `?chave=` (o bloco de webhook do robô pode não
 * aceitar cabeçalho; quando der, prefira o cabeçalho: o endereço com a chave pode ir parar em log).
 * Ela é conferida antes de olhar o corpo do pedido (sem chave válida, 401 — nunca "dados inválidos"),
 * e depois do limite de pedidos (60 por minuto), para quem tenta chaves também esbarrar no limite.
 *
 * A auditoria registra o nome da chave (não há pessoa: o usuário fica vazio).
 *
 * O robô do LineChat chama `/entrada/robo` com o JSON dele, do jeito que o bloco Webhook manda (2.0.1):
 * o mapa (Painéis › Ajustes › Integrações) diz de onde vem cada campo. A resposta é a que o bloco
 * "Enviar webhook" entende: sempre 200 (ele conta o 201 como falha), com `{"response":"CHAMADO_ABERTO",
 * "messages":[{"text":…}]}` ou `{"response":"CHAMADO_FALHOU"}`. A chave errada continua 401: não é o
 * robô falando. A `/entrada/chamado` recebe o formato do Gestor (o n8n, outros sistemas).
 *
 * A NIA (a IA do suporte, pelo n8n) lê o chamado com a sessão do LineChat (`sessaoId`, para achar a
 * conversa) e as opções de verdade (`/integracao/opcoes`), monta com elas o que a IA pode escolher e grava
 * de volta pelo PATCH e pelas anotações. Ler não vai para a auditoria.
 */
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EntradaChamadoSchema, IntegracaoAlterarSchema, parametrosDoEndereco, respostaDoRoboQueFalhou } from '@gestor/shared';
import { AppError } from '../plugins/errors.js';
import type { Ator } from '../services/atendimento/contexto.js';
import * as entrada from '../services/atendimento/entrada.js';

const tags = ['Chamados do Gestor: integrações (chave de API)'];
const Ref = z.object({ ref: z.string().min(1).max(60) });
/** A chave também pode vir no endereço (`?chave=`). */
const ChaveNoEndereco = z.object({ chave: z.string().max(300).optional() });
/** No robô, o endereço também traz os parâmetros que o mapa lê ({{endereço: setor}}, de `&setor=…`). */
const EnderecoDoRobo = ChaveNoEndereco.catchall(z.union([z.string().max(2_000), z.array(z.string().max(2_000)).max(20)]));
const AnotarSchema = z.object({ texto: z.string().trim().min(1, 'Escreva a anotação').max(20_000) });
const MoverPorNomeSchema = z.object({
  /** o id da etapa, ou o nome dela (sem ligar para acento e maiúscula) */
  etapa: z.string().trim().min(1, 'Diga a etapa (o nome ou o id)').max(60),
  motivo: z.string().trim().max(500).nullish(),
});

const routes: FastifyPluginAsyncZod = async (app) => {
  const limite = { rateLimit: { max: 60, timeWindow: '1 minute' } };
  const atores = new WeakMap<FastifyRequest, Ator>();
  /** Confere a chave antes de validar o corpo (o `onRequest` do limite de pedidos já rodou). */
  const comChave = {
    config: limite,
    preValidation: async (req: FastifyRequest) => { atores.set(req, await entrada.atorDaChave(app.db, entrada.chaveDoPedido(req))); },
  };
  const ator = (req: FastifyRequest) => atores.get(req)!;
  const quem = (req: FastifyRequest) => entrada.nomeNaAuditoria(ator(req));

  // ---------- o robô do LineChat, com o JSON dele (o mapa diz de onde vem cada campo) ----------

  app.post('/entrada/robo', {
    ...comChave,
    // o pedido do robô é pequeno: o limite do servidor (30 MB, para os anexos) não serve aqui
    bodyLimit: 512 * 1024,
    schema: {
      tags, querystring: EnderecoDoRobo, body: z.unknown(),
      summary: 'Abrir um chamado pelo robô do LineChat, com o JSON que o bloco Webhook manda: o mapa (Painéis › Ajustes › Integrações) diz de onde vem cada campo, e o que não bate fica de fora (a auditoria e o último pedido dizem o quê). A mesma conversa aberta não abre outro (o relato vira anotação nele). Responde sempre 200, no formato do bloco "Enviar webhook": {"response":"CHAMADO_ABERTO","messages":[{"text":"…"}]} ou {"response":"CHAMADO_FALHOU"}',
    },
  }, async (req, reply) => {
    let r: entrada.ResultadoDoRobo;
    try {
      // os parâmetros do endereço (sem a chave) também são do pedido: o mapa lê como {{endereço: setor}}
      r = await entrada.abrirPeloRobo(app, ator(req), req.body, parametrosDoEndereco(req.query));
    } catch (e) {
      // o bloco do LineChat só segue com 200: o "response" é que diz que falhou. O porquê fica no último
      // pedido (a tela do mapa mostra) e no registro do servidor — sem a chave
      const esperado = e instanceof AppError && e.status < 500;
      req.log[esperado ? 'warn' : 'error']({ err: e }, 'o robô do LineChat não abriu o chamado');
      return reply.status(200).send(respostaDoRoboQueFalhou());
    }
    const fora = r.ignorados.length + r.faltaram.length;
    const detalhes = fora ? { ...(r.ignorados.length ? { ignorados: r.ignorados } : {}), ...(r.faltaram.length ? { faltaram: r.faltaram } : {}) } : undefined;
    if (r.criado) {
      await app.audit(req, {
        action: 'create', entityType: 'ticket', entityId: r.id,
        summary: `${quem(req)} abriu ${r.codigo} "${r.titulo}" pelo mapa do robô${r.ignorados.length ? ` (${r.ignorados.length === 1 ? 'ficou 1 coisa de fora' : `ficaram ${r.ignorados.length} coisas de fora`})` : ''}${r.faltaram.length ? ` (${r.faltaram.length === 1 ? '1 variável do mapa não veio' : `${r.faltaram.length} variáveis do mapa não vieram`})` : ''}`,
        after: detalhes,
      });
    } else if (r.anotou) {
      await app.audit(req, { action: 'update', entityType: 'ticket', entityId: r.id, summary: `${quem(req)} anotou em ${r.codigo} o relato novo da mesma conversa` });
    }
    return reply.status(200).send(r.resposta);
  });

  // ---------- no formato do Gestor (o n8n, outros sistemas) ----------

  app.post('/entrada/chamado', {
    ...comChave,
    schema: {
      tags, querystring: ChaveNoEndereco, body: EntradaChamadoSchema,
      summary: 'Abrir um chamado no formato do Gestor (o n8n, outros sistemas; a mesma conversa aberta não abre outro: o relato vira anotação nele). Devolve o código, para mandar ao cliente',
    },
  }, async (req, reply) => {
    const r = await entrada.abrirPelaEntrada(app, ator(req), req.body);
    if (r.criado) {
      await app.audit(req, { action: 'create', entityType: 'ticket', entityId: r.id, summary: `${quem(req)} abriu ${r.codigo} "${r.titulo}"` });
    } else if (r.anotou) {
      await app.audit(req, { action: 'update', entityType: 'ticket', entityId: r.id, summary: `${quem(req)} anotou em ${r.codigo} o relato novo da mesma conversa` });
    }
    return reply.status(r.criado ? 201 : 200).send({ criado: r.criado, id: r.id, codigo: r.codigo, numero: r.numero, link: r.link });
  });

  // ---------- as opções (a NIA, pelo n8n, monta com elas o que a IA pode escolher) ----------

  app.get('/integracao/opcoes', {
    ...comChave,
    schema: {
      tags, querystring: ChaveNoEndereco,
      summary: 'As opções de verdade, só as ativas, para quem preenche o chamado de fora (a NIA, pelo n8n): os assuntos (com o caminho, como "Ramal › Configuração", e a sigla do painel), os produtos, os clientes, as opções do Tipo de cada painel, as gravidades e as prioridades — cada uma do jeito que o PATCH do chamado aceita',
    },
  }, async (req) => entrada.opcoesParaIntegracao(app, ator(req)));

  // ---------- o n8n mexendo num chamado ----------

  app.get('/integracao/chamados/:ref', {
    ...comChave,
    schema: { tags, querystring: ChaveNoEndereco, params: Ref, summary: 'O chamado (pelo código, como SUP-12, ou pelo id): o cartão, o relato, a descrição, a solução e a sessão do LineChat (sessaoId: a conversa de onde ele veio)' },
  }, async (req) => entrada.lerChamado(app, req.params.ref));

  app.patch('/integracao/chamados/:ref', {
    ...comChave,
    schema: {
      tags, querystring: ChaveNoEndereco, params: Ref, body: IntegracaoAlterarSchema,
      summary: 'Mudar o chamado (só os campos que vierem; o assunto pode vir pelo nome ou pelo caminho, como "Ramal › Configuração")',
    },
  }, async (req) => {
    const r = await entrada.alterarPelaIntegracao(app, ator(req), req.params.ref, req.body);
    const m = entrada.mudancas(r.antes, r.depois);
    if (m.nomes.length) {
      await app.audit(req, {
        action: 'update', entityType: 'ticket', entityId: r.depois.id,
        summary: `${quem(req)} alterou ${r.depois.code} "${r.depois.title}": ${m.nomes.join(', ')}`, before: m.antes, after: m.depois,
      });
    }
    return entrada.paraIntegracao(app, r.depois);
  });

  app.post('/integracao/chamados/:ref/anotacoes', {
    ...comChave,
    schema: { tags, querystring: ChaveNoEndereco, params: Ref, body: AnotarSchema, summary: 'Anotar no chamado (a anotação aparece com o nome da chave)' },
  }, async (req) => {
    const t = await entrada.anotarPelaIntegracao(app, ator(req), req.params.ref, req.body.texto);
    await app.audit(req, { action: 'update', entityType: 'ticket', entityId: t.id, summary: `${quem(req)} anotou em ${t.code}`, after: { texto: req.body.texto } });
    return entrada.lerChamado(app, t.id);
  });

  app.post('/integracao/chamados/:ref/mover', {
    ...comChave,
    schema: {
      tags, querystring: ChaveNoEndereco, params: Ref, body: MoverPorNomeSchema,
      summary: 'Mover para outra etapa do painel (o id ou o nome da etapa), com as regras da tela: o que falta, os filhos, o motivo de escalonar',
    },
  }, async (req) => {
    const r = await entrada.moverPelaIntegracao(app, ator(req), req.params.ref, req.body);
    if (r.mudou) {
      await app.audit(req, {
        action: 'update', entityType: 'ticket', entityId: r.t.id,
        summary: `${quem(req)} moveu ${r.t.code} de ${r.de ?? '?'} para ${r.para}${req.body.motivo ? `: ${req.body.motivo}` : ''}`,
      });
    }
    return entrada.lerChamado(app, r.t.id);
  });
};

export default routes;
