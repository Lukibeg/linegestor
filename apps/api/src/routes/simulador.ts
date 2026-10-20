/**
 * O Simulador do Comercial (Patch 2.0.2, decisão 0052): a conta de uma venda antes de fechar.
 *
 * Ver (a lista, a simulação, as da negociação) é de quem tem o Comercial (`sales.read`), com os custos e a
 * margem; criar, mudar, duplicar e mandar para a lixeira, de quem também trabalha nas negociações
 * (`tickets.work`); os Ajustes do Simulador (a tabela de custos, os modelos, o imposto, o sinal), de quem
 * cuida dos painéis (`tickets.manage`). Tudo o que muda vai para a auditoria (`sales_simulation`; os
 * Ajustes, `settings`).
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AjustesDoSimuladorSchema, SimulacaoGravarSchema } from '@gestor/shared';
import { atorDaPessoa } from '../services/atendimento/contexto.js';
import * as svc from '../services/simulador.js';

const tags = ['Simulador do Comercial'];
const Id = z.object({ id: z.string().min(1) });

const routes: FastifyPluginAsyncZod = async (app) => {
  const ver = { preHandler: app.requirePermission('sales.read') };
  const trabalhar = { preHandler: [app.requirePermission('sales.read'), app.requirePermission('tickets.work')] };
  const cuidar = { preHandler: [app.requirePermission('sales.read'), app.requirePermission('tickets.manage')] };
  const ator = (req: { user: Parameters<typeof atorDaPessoa>[0] | null }) => atorDaPessoa(req.user!);

  app.get('/opcoes', { ...ver, schema: { tags, summary: 'Os Ajustes do Simulador (a tabela de custos, os modelos, o imposto, o sinal, o prazo) e o que a pessoa pode fazer' } },
    async (req) => svc.opcoes(app.db, ator(req)));

  app.get('/simulacoes', { ...ver, schema: { tags, summary: 'As simulações, com o cenário principal resumido (a margem, o sinal, quando se paga)' } },
    async (req) => svc.listar(app.db, ator(req)));

  app.get('/simulacoes/:id', { ...ver, schema: { tags, summary: 'Uma simulação, com os cenários inteiros', params: Id } },
    async (req) => svc.ler(app.db, ator(req), req.params.id));

  app.get('/da-negociacao/:id', { ...ver, schema: { tags, summary: 'As simulações ligadas a uma negociação (a ficha dela)', params: Id } },
    async (req) => svc.daNegociacao(app.db, ator(req), req.params.id));

  app.post('/simulacoes', { ...trabalhar, schema: { tags, summary: 'Criar uma simulação (com o nome, os cenários e, se quiser, a negociação ligada)', body: SimulacaoGravarSchema } },
    async (req, reply) => {
      const r = await svc.criar(app.db, ator(req), req.body);
      await app.audit(req, { action: 'create', entityType: 'sales_simulation', entityId: r.simulacao.id, summary: r.resumo, after: r.depois });
      return reply.status(201).send(r.simulacao);
    });

  app.put('/simulacoes/:id', { ...trabalhar, schema: { tags, summary: 'Mudar uma simulação (a negociação que a pessoa não vê fica como estava)', params: Id, body: SimulacaoGravarSchema } },
    async (req) => {
      const r = await svc.alterar(app.db, ator(req), req.params.id, req.body);
      await app.audit(req, { action: 'update', entityType: 'sales_simulation', entityId: req.params.id, summary: r.resumo, before: r.antes, after: r.depois });
      return r.simulacao;
    });

  app.post('/simulacoes/:id/duplicar', { ...trabalhar, schema: { tags, summary: 'Duplicar uma simulação (a cópia, com os mesmos cenários)', params: Id } },
    async (req, reply) => {
      const r = await svc.duplicar(app.db, ator(req), req.params.id);
      await app.audit(req, { action: 'create', entityType: 'sales_simulation', entityId: r.simulacao.id, summary: r.resumo, after: r.depois });
      return reply.status(201).send(r.simulacao);
    });

  app.delete('/simulacoes/:id', { ...trabalhar, schema: { tags, summary: 'Mandar a simulação para a lixeira (volta pela Administração › Lixeira)', params: Id } },
    async (req) => {
      const r = await svc.mandarParaLixeira(app.db, ator(req), req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'sales_simulation', entityId: r.id, summary: r.resumo });
      return { ok: true };
    });

  app.put('/ajustes', { ...cuidar, schema: { tags, summary: 'Os Ajustes do Simulador; as simulações já feitas não mudam', body: AjustesDoSimuladorSchema } },
    async (req) => {
      const r = await svc.gravarAjustes(app.db, ator(req), req.body);
      await app.audit(req, { action: 'settings_simulador', entityType: 'settings', entityId: 'comercial-simulador', summary: r.resumo, before: r.antes, after: r.ajustes });
      return r.ajustes;
    });
};

export default routes;
