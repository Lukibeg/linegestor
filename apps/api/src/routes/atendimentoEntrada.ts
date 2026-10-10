/**
 * Chamados do Gestor (Patch 1.10, decisão 0047): a entrada das integrações — o robô do LineChat e o
 * n8n abrem e mexem nos chamados com uma chave de API (criada em Chamados › Integrações), sem sessão.
 *
 * A chave vem em `Authorization: Bearer <chave>` ou em `?chave=` (o bloco de webhook do robô pode não
 * aceitar cabeçalho; quando der, prefira o cabeçalho: o endereço com a chave pode ir parar em log).
 * Ela é conferida antes de olhar o corpo do pedido (sem chave válida, 401 — nunca "dados inválidos"),
 * e depois do limite de pedidos (60 por minuto), para quem tenta chaves também esbarrar no limite.
 *
 * A auditoria registra o nome da chave (não há pessoa: o usuário fica vazio).
 */
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EntradaChamadoSchema, EntradaMensagemSchema, IntegracaoAlterarSchema } from '@gestor/shared';
import type { Ator } from '../services/atendimento/contexto.js';
import * as entrada from '../services/atendimento/entrada.js';

const tags = ['Chamados do Gestor: integrações (chave de API)'];
const Ref = z.object({ ref: z.string().min(1).max(60) });
/** A chave também pode vir no endereço (`?chave=`). */
const ChaveNoEndereco = z.object({ chave: z.string().max(300).optional() });
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

  // ---------- o robô do LineChat ----------

  app.post('/entrada/chamado', {
    ...comChave,
    schema: {
      tags, querystring: ChaveNoEndereco, body: EntradaChamadoSchema,
      summary: 'Abrir um chamado pelo robô (a mesma conversa aberta não abre outro: o relato vira anotação nele). Devolve o código, para o robô mandar ao cliente',
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

  app.post('/entrada/mensagem', {
    ...comChave,
    schema: {
      tags, querystring: ChaveNoEndereco, body: EntradaMensagemSchema,
      summary: 'O cliente escreveu: reabre o chamado Resolvido (menos o "obrigado") ou registra no aberto, e avisa o responsável',
    },
  }, async (req) => {
    const r = await entrada.mensagemDoCliente(app, ator(req), req.body);
    if (r.acao !== 'ignorado') {
      await app.audit(req, {
        action: 'update', entityType: 'ticket', entityId: r.id ?? null,
        summary: r.acao === 'reaberto' ? `${quem(req)}: o cliente respondeu e ${r.codigo} reabriu` : `${quem(req)}: o cliente respondeu em ${r.codigo}`,
      });
    }
    return { acao: r.acao, ...(r.codigo ? { codigo: r.codigo } : {}) };
  });

  // ---------- o n8n mexendo num chamado ----------

  app.get('/integracao/chamados/:ref', {
    ...comChave,
    schema: { tags, querystring: ChaveNoEndereco, params: Ref, summary: 'O chamado (pelo código, como SUP-12, ou pelo id): o cartão, o relato, a descrição e a solução' },
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
