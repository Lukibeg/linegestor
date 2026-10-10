/**
 * Chamados do Gestor (Patch 1.10, decisão 0047): a rotina — as respostas prontas e os agendados (quem
 * cuida dos chamados, `tickets.manage`) e a IA no chamado (quem trabalha, `tickets.work`).
 *
 * Toda mudança vai para a auditoria. A IA não muda nada no chamado: devolve a sugestão, a tela mostra
 * e a pessoa aplica com o PATCH de sempre (que registra o histórico).
 */
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AgendadoGravarSchema, RespostaProntaGravarSchema } from '@gestor/shared';
import { atorDaPessoa } from '../services/atendimento/contexto.js';
import * as ia from '../services/atendimento/ia.js';
import * as rotina from '../services/atendimento/rotina.js';

const tags = ['Chamados do Gestor'];
const Id = z.object({ id: z.string().min(1) });

const routes: FastifyPluginAsyncZod = async (app) => {
  const trabalhar = { preHandler: app.requirePermission('tickets.work') };
  const cuidar = { preHandler: app.requirePermission('tickets.manage') };
  const ator = (req: FastifyRequest) => atorDaPessoa(req.user!);

  // ---------- as respostas prontas ----------

  app.get('/respostas', { ...cuidar, schema: { tags, summary: 'As respostas prontas, inclusive as desativadas (a tela de Ajustes)' } },
    async () => rotina.listarRespostas(app.db));

  app.post('/respostas', { ...cuidar, schema: { tags, summary: 'Criar uma resposta pronta (a que move o chamado precisa do painel: a etapa é dele)', body: RespostaProntaGravarSchema } },
    async (req, reply) => {
      const { resposta, painel } = await rotina.criarResposta(app.db, req.body, req.user!.id);
      await app.audit(req, {
        action: 'create', entityType: 'ticket_macro', entityId: resposta.id,
        summary: `Criou a resposta pronta "${resposta.nome}" (${painel ? `painel ${painel.nome}` : 'todos os painéis'})`, after: resposta,
      });
      return reply.status(201).send(resposta);
    });

  app.put('/respostas/:id', { ...cuidar, schema: { tags, summary: 'Mudar uma resposta pronta (ativa: false a tira da tela de trabalho)', params: Id, body: RespostaProntaGravarSchema } },
    async (req) => {
      const { antes, depois } = await rotina.alterarResposta(app.db, req.params.id, req.body);
      const ligou = antes.ativa !== depois.ativa ? (depois.ativa ? ' (reativou)' : ' (desativou)') : '';
      await app.audit(req, { action: 'update', entityType: 'ticket_macro', entityId: depois.id, summary: `Alterou a resposta pronta "${depois.nome}"${ligou}`, before: antes, after: depois });
      return depois;
    });

  app.delete('/respostas/:id', { ...cuidar, schema: { tags, summary: 'Remover uma resposta pronta', params: Id } },
    async (req) => {
      const r = await rotina.removerResposta(app.db, req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'ticket_macro', entityId: r.id, summary: `Removeu a resposta pronta "${r.nome}"`, before: r });
      return { ok: true };
    });

  // ---------- os agendados ----------

  app.get('/agendados', { ...cuidar, schema: { tags, summary: 'Os chamados agendados, com a regra em palavras e a próxima vez' } },
    async () => rotina.listarAgendados(app.db));

  app.post('/agendados', { ...cuidar, schema: { tags, summary: 'Agendar um chamado (todo dia, toda semana, todo mês ou uma vez)', body: AgendadoGravarSchema } },
    async (req, reply) => {
      const { agendado, painel } = await rotina.criarAgendado(app.db, req.body, req.user!.id);
      await app.audit(req, {
        action: 'create', entityType: 'ticket_schedule', entityId: agendado.id,
        summary: `Agendou o chamado "${agendado.titulo}" no painel ${painel.nome}: ${agendado.textoRegra}${agendado.ativo ? '' : ' (desligado)'}`, after: agendado,
      });
      return reply.status(201).send(agendado);
    });

  app.put('/agendados/:id', { ...cuidar, schema: { tags, summary: 'Mudar um agendado (a próxima vez é recalculada a partir de agora)', params: Id, body: AgendadoGravarSchema } },
    async (req) => {
      const { antes, depois } = await rotina.alterarAgendado(app.db, req.params.id, req.body);
      const ligou = antes.ativo !== depois.ativo ? (depois.ativo ? ' (ligou)' : ' (desligou)') : '';
      await app.audit(req, { action: 'update', entityType: 'ticket_schedule', entityId: depois.id, summary: `Alterou o agendado "${depois.titulo}": ${depois.textoRegra}${ligou}`, before: antes, after: depois });
      return depois;
    });

  app.delete('/agendados/:id', { ...cuidar, schema: { tags, summary: 'Remover um agendado (os chamados que ele já abriu ficam)', params: Id } },
    async (req) => {
      const r = await rotina.removerAgendado(app.db, req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'ticket_schedule', entityId: r.id, summary: `Removeu o agendado "${r.titulo}"`, before: r });
      return { ok: true };
    });

  app.post('/agendados/:id/agora', { ...cuidar, schema: { tags, summary: 'Criar já o chamado do agendado (a próxima vez continua a mesma)', params: Id } },
    async (req, reply) => {
      const r = await rotina.rodarAgora(app, ator(req), req.params.id);
      await app.audit(req, { action: 'create', entityType: 'ticket', entityId: r.id, summary: `Abriu ${r.codigo} "${r.titulo}" pelo agendado (criar agora)` });
      return reply.status(201).send({ id: r.id, codigo: r.codigo });
    });

  // ---------- a IA no chamado ----------

  app.post('/chamados/:id/ia', {
    ...trabalhar,
    // cada pedido custa dinheiro (e a pessoa ainda tem o limite de 30 por hora da IA)
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { tags, summary: 'A IA lê a conversa do LineChat (ou o próprio chamado) e sugere o preenchimento; nada é gravado', params: Id },
  }, async (req) => {
    const r = await ia.sugestaoDaIa(app, ator(req), req.params.id);
    const s = r.sugestao;
    await app.audit(req, {
      action: 'chamado_ia', entityType: 'ticket', entityId: r.chamado.id,
      summary: `${req.user!.name} pediu à IA (${s.provedor}) uma sugestão para ${r.chamado.codigo}, lendo ${s.fonte === 'conversa' ? 'a conversa do LineChat' : 'o próprio chamado'}`,
    });
    return s;
  });
};

export default routes;
