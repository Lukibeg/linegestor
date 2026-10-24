/**
 * Trazer do Helena (Patch 2.0.3, decisão 0054): o painel de vendas do Helena vem para um painel de Vendas do
 * Gestor, com o histórico de cada negociação. Mora em Administração › Importar / Exportar.
 *
 * É de quem importa (`data.import`) e cuida dos painéis (`tickets.manage`): o Trazer cria etapas, campos e o
 * painel. Ler e ver a prévia não grava nada; o "Trazer" grava numa transação só e vai para a auditoria.
 * A planilha do Helena (2.1.1) completa a leitura com a Conclusão que a chave de API não lê: também não grava.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { LIMITES_DA_PLANILHA_DO_HELENA } from '@gestor/shared';
import { atorDaPessoa } from '../services/atendimento/contexto.js';
import * as svc from '../services/helena.js';

const tags = ['Trazer do Helena'];
const Id = z.object({ id: z.string().min(1).max(60) });

const routes: FastifyPluginAsyncZod = async (app) => {
  const pode = { preHandler: [app.requirePermission('data.import'), app.requirePermission('tickets.manage')] };
  const ator = (req: { user: Parameters<typeof atorDaPessoa>[0] | null }) => atorDaPessoa(req.user!);

  app.get('/opcoes', { ...pode, schema: { tags, summary: 'Os painéis do Helena (pela chave do LineChat) e os painéis de Vendas do Gestor que podem receber' } },
    async () => svc.opcoes(app.db, app.vault));

  app.post('/leituras', {
    ...pode,
    schema: { tags, summary: 'Começar a ler um painel do Helena (os cards e o histórico de cada um): a leitura roda por fora, e a tela acompanha', body: z.object({ painelId: z.string().trim().min(1).max(100) }) },
  }, async (req, reply) => reply.status(202).send(svc.comecarLeitura(app, ator(req), req.body.painelId)));

  app.get('/leituras/:id', { ...pode, schema: { tags, summary: 'Como vai a leitura: quantos cards já vieram, de quantos', params: Id } },
    async (req) => svc.verLeitura(req.params.id));

  app.post('/leituras/:id/planilha', {
    ...pode,
    schema: {
      tags, params: Id,
      summary: 'Completar a leitura com a planilha do Helena (o Exportar da Lista do painel): a Conclusão e o motivo que a chave de API não lê. O link do Google Planilhas ou o texto do .csv. Nada é gravado.',
      body: z.object({
        link: z.string().trim().max(2000).nullish(),
        csv: z.string().max(LIMITES_DA_PLANILHA_DO_HELENA.letras).nullish(),
        nome: z.string().trim().max(200).nullish(),
      }),
    },
  }, async (req) => svc.usarPlanilha(req.params.id, req.body));

  app.get('/leituras/:id/previa', {
    ...pode,
    schema: { tags, summary: 'A prévia: o que vai entrar no painel escolhido (sem `destino`, num painel de Vendas novo). Nada é gravado.', params: Id, querystring: z.object({ destino: z.string().max(60).optional() }) },
  }, async (req) => svc.previa(app.db, req.params.id, req.query.destino || null));

  app.post('/leituras/:id/trazer', {
    ...pode,
    schema: { tags, summary: 'Trazer o que a prévia mostrou (numa transação só); de novo, atualiza o que já veio', params: Id, body: z.object({ destino: z.string().max(60).nullable().default(null) }) },
  }, async (req) => {
    const r = await svc.trazer(app, ator(req), req.params.id, req.body.destino || null);
    const p = r.previa;
    await app.audit(req, {
      action: 'import', entityType: 'ticket_panel', entityId: r.painelId, summary: r.resumo,
      after: {
        painel: `${r.painelNome} (${r.sigla})`, doHelena: p.painelHelena.nome, negociacoes: p.negociacoes,
        etapas: p.etapas.ordem, camposCriados: p.campos.cria.map((c) => c.nome), motivosNovos: p.motivosNovos, avisos: p.avisos,
      },
    });
    return r;
  });
};

export default routes;
