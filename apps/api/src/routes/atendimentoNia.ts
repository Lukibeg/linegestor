/**
 * O /nia no card (Patch 2.4, decisão 0058): o catálogo dos comandos da NIA, a proposta e o Aplicar, todos COM a sessão
 * da pessoa — o navegador fala só com o Gestor, e a chave de serviço da NIA nunca sai do servidor. E, em Painéis ›
 * Ajustes › Integrações, o endereço da NIA, a chave (no cofre) e o Testar (a administração, `admin.manage`).
 *
 * Quem pode: o mesmo de mexer no card (`tickets.work` e o painel que a pessoa vê). Cuidado com o nome: o
 * POST /chamados/:id/nia é o botão NIA da ficha (o 2.1, que põe a etiqueta para o n8n) e continua como está; o /nia
 * usa os caminhos /nia/acoes, /chamados/:id/nia/propor e /chamados/:id/nia/aplicar.
 *
 * A proposta não grava nada nem vai para o Histórico (proposta não é mudança), mas vai para a auditoria — o texto do
 * card saiu do servidor para a NIA, e fica dito quem pediu. O Aplicar vai para a auditoria e para o Histórico.
 */
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AjustesDaNiaAcoesSchema, NiaAplicarSchema, NiaProporSchema } from '@gestor/shared';
import { atorDaPessoa } from '../services/atendimento/contexto.js';
import * as svc from '../services/atendimento/chamados.js';
import * as nia from '../services/atendimento/niaAcoes.js';

const tags = ['Chamados do Gestor › O /nia'];
const Id = z.object({ id: z.string().min(1) });

const routes: FastifyPluginAsyncZod = async (app) => {
  const trabalhar = { preHandler: app.requirePermission('tickets.work') };
  const integrar = { preHandler: app.requirePermission('admin.manage') };
  const ator = (req: FastifyRequest) => atorDaPessoa(req.user!);

  // ---------- no card ----------

  app.get('/nia/acoes', {
    ...trabalhar,
    schema: { tags, summary: 'Os comandos da NIA (o menu do /nia: o nome e a explicação de cada um), guardados 5 minutos. Sem a NIA configurada, vem vazio e o /nia não aparece.' },
  }, async () => nia.catalogoDaNia(app));

  app.post('/chamados/:id/nia/propor', {
    ...trabalhar,
    schema: {
      tags, params: Id, body: NiaProporSchema,
      summary: 'Pedir a proposta da NIA para o card: o Gestor manda o card inteiro (lido do banco) e devolve a resposta dela como veio. Não grava nada e não vai para o Histórico.',
    },
  }, async (req) => {
    const r = await nia.proporANia(app, ator(req), req.params.id, req.body);
    await app.audit(req, {
      action: 'chamado_nia_proposta', entityType: 'ticket', entityId: r.chamado.id,
      summary: `Pediu à NIA (${r.nome}) uma proposta para ${r.chamado.codigo}${req.body.campo ? `, do campo ${req.body.campo}` : ''}${r.proposta.ok ? '' : ` — não veio: ${r.proposta.erro}`}`,
    });
    return r.proposta;
  });

  app.post('/chamados/:id/nia/aplicar', {
    ...trabalhar,
    schema: {
      tags, params: Id, body: NiaAplicarSchema,
      summary: 'Aplicar o que a pessoa marcou da proposta da NIA: grava pelo caminho de sempre da ficha (as mesmas regras e limites) e registra no Histórico a linha da NIA, com os campos gravados',
    },
  }, async (req) => {
    const r = await nia.aplicarANia(app, ator(req), req.params.id, req.body);
    if (r.resumo) await app.audit(req, { action: 'update', entityType: 'ticket', entityId: r.id, summary: r.resumo, before: r.antes, after: r.depois });
    return svc.fichaDoChamado(app, ator(req), r.id);
  });

  // ---------- os ajustes (Painéis › Ajustes › Integrações › NIA (/nia)) ----------

  app.get('/integracoes/nia-acoes', {
    ...integrar,
    schema: { tags, summary: 'O endereço da NIA e se já existe uma chave guardada (a chave nunca volta para a tela) e o último teste' },
  }, async () => nia.telaDaNia(app));

  app.put('/integracoes/nia-acoes', {
    ...integrar,
    schema: { tags, body: AjustesDaNiaAcoesSchema, summary: 'Gravar o endereço da NIA e, quando vem, a chave nova (vai para o cofre). Vazio desliga o /nia.' },
  }, async (req) => {
    const r = await nia.gravarAjustesDaNia(app, req.body, { id: req.user!.id, nome: req.user!.name });
    await app.audit(req, {
      action: 'settings_atendimento_nia_acoes', entityType: 'settings', entityId: 'atendimento-nia-acoes',
      summary: r.depois ? `Mudou o endereço da NIA (/nia): ${r.depois}${r.trocouChave ? ', com a chave nova' : ''}` : 'Desligou o /nia (tirou o endereço da NIA)',
      // a chave nunca vai para a auditoria
      before: { endereco: r.antes }, after: { endereco: r.depois, trocouChave: r.trocouChave },
    });
    return nia.telaDaNia(app);
  });

  app.post('/integracoes/nia-acoes/testar', {
    ...integrar,
    schema: { tags, summary: 'Testar a NIA agora: lê o catálogo e diz quantos comandos vieram' },
  }, async (req) => {
    const r = await nia.testarANia(app);
    await app.audit(req, { action: 'settings_atendimento_nia_acoes_teste', entityType: 'settings', entityId: 'atendimento-nia-acoes', summary: `Testou a NIA (/nia): ${r.mensagem}` });
    return r;
  });
};

export default routes;
