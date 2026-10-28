/**
 * Chamados do Gestor (Patch 2.0, decisão 0047): o quadro, a lista, o Meu dia, a ficha e tudo o que
 * se faz num chamado.
 *
 * Ver é de todos que veem chamados (`support.read`, inclusive o Leitor) — e, nos painéis de Vendas, de
 * quem tem a permissão do Comercial (`sales.read`, 2.0.1); trabalhar (abrir, mover, anotar…) é
 * `tickets.work`; a lixeira dos chamados é de quem cuida deles (`tickets.manage`). O painel que a pessoa
 * não vê ("escolhidos", ou de Vendas sem a permissão) não existe para ela: o chamado dele dá 404, nunca 403.
 *
 * Toda mudança vai para a auditoria e devolve a ficha inteira, já atualizada (menos o abrir, que
 * devolve o código, e o mandar para a lixeira).
 */
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AnotacaoSchema, ArrumacaoDosRelatoriosSchema, AvisarClienteSchema, ChamadoAlterarSchema, ChamadoCriarSchema, ChecklistSchema, EsperarSchema, FiltroDoRelatorioDeVendasSchema,
  FiltroDaVisaoSchema, FiltroDosRelatoriosSchema, LigarChamadoSchema,
  ListarChamadosSchema, MoverSchema, ObservarSchema, OpcaoIncluirSchema, OperadoraAndamentoSchema, OperadoraCasoSchema, PaiSchema, PosicaoNoQuadroSchema, PRIORIDADES, ProblemaSchema, ReabrirSchema,
  TempoSchema, TrocarPainelSchema,
} from '@gestor/shared';
import { BadRequest } from '../plugins/errors.js';
import { incluirOpcao } from '../services/atendimento/ajustes.js';
import { atorDaPessoa, carregarContexto, podeVerPainel } from '../services/atendimento/contexto.js';
import * as svc from '../services/atendimento/chamados.js';
import * as leitura from '../services/atendimento/leitura.js';
import { relatorioDoPainelDeVendas } from '../services/atendimento/vendas.js';
import * as relatorios from '../services/atendimento/relatorios.js';

const tags = ['Chamados do Gestor'];
const Id = z.object({ id: z.string().min(1) });
const QuadroSchema = z.object({
  painel: z.string().min(1, 'Escolha o painel'),
  responsavel: z.string().optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  q: z.string().trim().max(200).optional(),
  cliente: z.string().optional(),
  assunto: z.string().optional(),
  etiqueta: z.string().optional(),
  espera: z.enum(['cliente', 'operadora']).optional(),
});

/** O nome do arquivo no cabeçalho de download, sem quebrar em nome com acento ou aspas. */
function contentDisposition(tipo: 'inline' | 'attachment', fileName: string) {
  const simples = fileName.replace(/[^\w.\- ]/g, '_');
  return `${tipo}; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

const routes: FastifyPluginAsyncZod = async (app) => {
  // ver: quem vê os chamados (os painéis de Gestão) ou o Comercial (os de Vendas, 2.0.1); cada painel confere o resto
  const ler = { preHandler: app.requireAnyPermission('support.read', 'sales.read') };
  const trabalhar = { preHandler: app.requirePermission('tickets.work') };
  const cuidar = { preHandler: app.requirePermission('tickets.manage') };
  const ator = (req: FastifyRequest) => atorDaPessoa(req.user!);

  /** Registra na auditoria (quando algo mudou) e devolve a ficha atualizada. */
  const fichaDepois = async (req: FastifyRequest, r: svc.Feito, acao: 'update' | 'delete' | 'restore' = 'update') => {
    if (r.resumo) await app.audit(req, { action: acao, entityType: 'ticket', entityId: r.id, summary: r.resumo, before: r.antes, after: r.depois });
    if (r.erro) throw new BadRequest(r.erro);
    return svc.fichaDoChamado(app, ator(req), r.id);
  };

  // ---------- ler ----------

  app.get('/opcoes', { ...ler, schema: { tags, summary: 'Os painéis que a pessoa vê, as pessoas, os assuntos, os produtos, as operadoras, as etiquetas e os prazos' } },
    async (req) => leitura.opcoes(app, ator(req)));

  app.get('/quadro', { ...ler, schema: { tags, summary: 'O quadro de um painel: uma coluna por etapa (o Fechado mostra só os 30 mais recentes)', querystring: QuadroSchema } },
    async (req) => leitura.quadro(app, ator(req), req.query));

  app.get('/chamados', { ...ler, schema: { tags, summary: 'A lista: filtros, busca sem acento, ordem e página', querystring: ListarChamadosSchema } },
    async (req) => leitura.lista(app, ator(req), req.query));

  app.get('/chamados/exportar', { ...ler, schema: { tags, summary: 'A lista com os mesmos filtros, em CSV (abre no Excel)', querystring: ListarChamadosSchema } },
    async (req, reply) => {
      const r = await leitura.exportar(app, ator(req), req.query);
      await app.audit(req, { action: 'export', entityType: 'ticket', entityId: null, summary: `Exportou ${r.total} ${r.total === 1 ? 'chamado' : 'chamados'} para CSV` });
      return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${r.nome}"`).send(r.csv);
    });

  app.get('/paineis/resumo', { ...ler, schema: { tags, summary: 'A tela inicial: os números de cada painel (em aberto, meus, sem dono, vencidos, perto, esperando e por etapa)' } },
    async (req) => leitura.resumoDosPaineisVisiveis(app, ator(req)));

  app.get('/vendas', {
    ...ler,
    schema: {
      tags, querystring: FiltroDoRelatorioDeVendasSchema,
      summary: 'O relatório de um painel de Vendas no período: os números, o funil, o tempo em cada etapa, os meses × a meta, os vendedores e os motivos de perda',
    },
  }, async (req) => relatorioDoPainelDeVendas(app, ator(req), req.query));

  // os Relatórios dos painéis de chamados (2.1): os 25 relatórios de uma vez e a arrumação de cada painel
  app.get('/relatorios', {
    ...ler,
    schema: {
      tags, querystring: FiltroDosRelatoriosSchema,
      summary: 'Os relatórios de um painel de chamados no período (tempo, volume, assuntos, clientes, equipe e o mês), com os filtros; cada número traz os chamados por trás dele',
    },
  }, async (req) => relatorios.relatoriosDoPainelDeChamados(app, ator(req), req.query));

  // a Visão geral (2.2): Hoje e Período, como no Legado do Helena, sobre os chamados do Gestor
  app.get('/relatorios/visao', {
    ...ler,
    schema: {
      tags, querystring: FiltroDaVisaoSchema,
      summary: 'A Visão geral de um painel de chamados (hoje ou no período): os números de cima, os chamados no tempo, os gráficos por etapa, assunto, cliente, tipo… e a tabela; cada gráfico é contado sem o próprio filtro',
    },
  }, async (req) => relatorios.visaoDoPainelDeChamados(app, ator(req), req.query));

  const PainelDaArrumacao = z.object({ painel: z.string().trim().min(1, 'Escolha o painel').max(100) });
  app.get('/relatorios/arrumacao', {
    ...ler,
    schema: { tags, querystring: PainelDaArrumacao, summary: 'A arrumação dos Relatórios de um painel: a ordem, os escondidos, os favoritos e o campo da falha (a mesma para a equipe toda)' },
  }, async (req) => relatorios.lerArrumacao(app, ator(req), req.query.painel));

  app.put('/relatorios/arrumacao', {
    ...cuidar,
    schema: { tags, querystring: PainelDaArrumacao, body: ArrumacaoDosRelatoriosSchema, summary: 'Arrumar os Relatórios de um painel para a equipe toda (quem cuida dos chamados)' },
  }, async (req) => {
    const a = ator(req);
    if (a.tipo !== 'pessoa') throw new BadRequest('Só uma pessoa arruma os relatórios.');
    const r = await relatorios.gravarArrumacao(app, a, req.query.painel, req.body);
    await app.audit(req, {
      action: 'atendimento_relatorios_arrumacao', entityType: 'settings', entityId: 'atendimento-relatorios', summary: r.resumo,
      before: { ordem: r.antes.ordem, ocultos: r.antes.ocultos, favoritos: r.antes.favoritos, campoDaFalha: r.antes.campoDaFalha, visao: r.antes.visao ?? null },
      after: { ordem: r.depois.ordem, ocultos: r.depois.ocultos, favoritos: r.depois.favoritos, campoDaFalha: r.depois.campoDaFalha, visao: r.depois.visao ?? null },
    });
    return r.depois;
  });

  app.get('/meu-dia', { ...ler, schema: { tags, summary: 'Os meus, os que vencem, os sem dono, os esperando o cliente, os que acompanho e os agendados de hoje' } },
    async (req) => leitura.meuDia(app, ator(req)));

  app.get('/avisos', { ...ler, schema: { tags, summary: 'O sininho: os 30 avisos mais recentes da pessoa e quantos não foram lidos' } },
    async (req) => leitura.avisosNaTela(app.db, req.user!.id));

  app.post('/avisos/lidos', { ...ler, schema: { tags, summary: 'Marcar avisos como lidos (sem ids = todos)', body: z.object({ ids: z.array(z.string()).max(500).optional() }).nullish() } },
    async (req) => {
      await leitura.marcarAvisosLidos(app.db, req.user!.id, req.body?.ids);
      return { ok: true };
    });

  app.get('/cadastro/:clienteId', { ...ler, schema: { tags, summary: 'O cadastro do cliente para o chamado: produtos, operadoras, circuitos, DIDs, aparelhos, unidades, os contatos e os chamados recentes', params: z.object({ clienteId: z.string().min(1) }) } },
    async (req) => leitura.cadastroDoCliente(app, ator(req), req.params.clienteId));

  app.get('/chamados/:ref', { ...ler, schema: { tags, summary: 'A ficha do chamado (pelo código, como SUP-12, ou pelo id)', params: z.object({ ref: z.string().min(1) }) } },
    async (req) => svc.fichaDoChamado(app, ator(req), req.params.ref));

  app.get('/anexos/:id', { ...ler, schema: { tags, summary: 'Um anexo de anotação: a imagem abre na tela; o resto baixa como arquivo', params: Id } },
    async (req, reply) => {
      const a = await leitura.lerAnexo(app, ator(req), req.params.id);
      reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=86400');
      // só imagem de verdade (conferida pelos bytes, nunca SVG) abre na tela; o resto sempre baixa
      if (a.imagem) return reply.header('Content-Type', a.mimeType).header('Content-Disposition', contentDisposition('inline', a.fileName)).send(a.buffer);
      return reply.header('Content-Type', 'application/octet-stream').header('Content-Disposition', contentDisposition('attachment', a.fileName)).send(a.buffer);
    });

  // ---------- abrir e mexer ----------

  app.post('/chamados', { ...trabalhar, schema: { tags, summary: 'Abrir um chamado (nasce na entrada do painel, com o número seguinte da sigla)', body: ChamadoCriarSchema } },
    async (req, reply) => {
      const r = await svc.criarChamado(app, ator(req), req.body);
      await app.audit(req, {
        action: 'create', entityType: 'ticket', entityId: r.id,
        summary: `Abriu ${r.codigo} "${r.titulo}"${r.aviso ? (r.aviso.ok ? ' e avisou o cliente pelo WhatsApp' : ' (o aviso ao cliente não foi)') : ''}`,
      });
      return reply.status(201).send(r);
    });

  // a opção nova numa lista do painel, ali mesmo (2.0.3, a Indicação): só nas listas marcadas, por quem trabalha no painel
  app.post('/campos/:id/opcoes', { ...trabalhar, schema: { tags, summary: 'Incluir uma opção numa lista do painel ali mesmo (só nas listas que permitem; a que já existe volta, a desativada é reativada)', params: Id, body: OpcaoIncluirSchema } },
    async (req) => {
      const quem = ator(req);
      const ctx = await carregarContexto(app.db);
      const r = await incluirOpcao(app.db, req.params.id, req.body.nome, (painelId) => {
        const p = ctx.paineis.find((x) => x.id === painelId);
        return !!p && podeVerPainel(p, quem);
      });
      if (r.depois) await app.audit(req, { action: 'update', entityType: 'ticket_field', entityId: req.params.id, summary: r.resumo, after: r.depois });
      return r.valor;
    });

  app.patch('/chamados/:id', { ...trabalhar, schema: { tags, summary: 'Mudar o chamado (só os campos que vierem; trocar a prioridade sugerida pede o motivo)', params: Id, body: ChamadoAlterarSchema } },
    async (req) => fichaDepois(req, await svc.alterar(app, ator(req), req.params.id, req.body)));

  app.post('/chamados/:id/mover', { ...trabalhar, schema: { tags, summary: 'Mover para outra etapa (escalonar e voltar de nível pedem o motivo)', params: Id, body: MoverSchema } },
    async (req) => fichaDepois(req, await svc.mover(app, ator(req), req.params.id, req.body)));

  // a NIA (2.1): o botão da ficha pede à IA do n8n para preencher — põe a etiqueta de pedir, como a equipe fazia à mão
  app.post('/chamados/:id/nia', {
    ...trabalhar,
    schema: { tags, summary: 'Pedir à NIA (a IA do suporte, no n8n) para preencher: a etiqueta de pedir entra (a de pronto e a de erro saem), e o aviso do chamado alterado vai para o n8n', params: Id },
  }, async (req) => fichaDepois(req, await svc.pedirANia(app, ator(req), req.params.id)));

  // a ordem à mão no quadro (2.1): devolve só o lugar (a tela já arrumou a coluna; o quadro relê depois)
  app.post('/chamados/:id/posicao', {
    ...trabalhar,
    schema: { tags, summary: 'Mudar o lugar na coluna do quadro, arrastando (painel de Vendas e de Gestão sem prazo, etapas abertas): logo abaixo de depoisDe (nulo: no alto); 409 se depoisDe saiu da etapa', params: Id, body: PosicaoNoQuadroSchema },
  }, async (req) => {
    const r = await svc.posicionar(app, ator(req), req.params.id, req.body);
    if (r.resumo) await app.audit(req, { action: 'update', entityType: 'ticket', entityId: r.id, summary: r.resumo });
    return { codigo: r.codigo, posicao: r.posicao };
  });

  app.post('/chamados/:id/assumir', { ...trabalhar, schema: { tags, summary: 'Ficar com o chamado (na entrada, ele vai para a primeira etapa de andamento)', params: Id } },
    async (req) => fichaDepois(req, await svc.assumir(app, ator(req), req.params.id)));

  app.post('/chamados/:id/esperar', { ...trabalhar, schema: { tags, summary: 'Marcar (ou tirar) a espera: o cliente ou a operadora', params: Id, body: EsperarSchema } },
    async (req) => fichaDepois(req, await svc.esperar(app, ator(req), req.params.id, req.body)));

  app.post('/chamados/:id/reabrir', { ...trabalhar, schema: { tags, summary: 'Reabrir o chamado resolvido ou fechado', params: Id, body: ReabrirSchema } },
    async (req) => fichaDepois(req, await svc.reabrir(app, ator(req), req.params.id, req.body)));

  app.post('/chamados/:id/painel', { ...trabalhar, schema: { tags, summary: 'Passar o chamado para outro painel (o código não muda)', params: Id, body: TrocarPainelSchema } },
    async (req) => fichaDepois(req, await svc.trocarPainel(app, ator(req), req.params.id, req.body)));

  app.post('/chamados/:id/anotacoes', { ...trabalhar, schema: { tags, summary: 'Anotar (até 5 anexos de até 10 MB cada)', params: Id, body: AnotacaoSchema } },
    async (req) => fichaDepois(req, await svc.anotar(app, ator(req), req.params.id, req.body)));

  app.delete('/chamados/:id/anotacoes/:notaId', { ...trabalhar, schema: { tags, summary: 'Apagar uma anotação (a sua, ou qualquer uma se você cuida dos chamados)', params: Id.extend({ notaId: z.string().min(1) }) } },
    async (req) => fichaDepois(req, await svc.apagarAnotacao(app, ator(req), req.params.id, req.params.notaId), 'delete'));

  app.post('/chamados/:id/ligacoes', { ...trabalhar, schema: { tags, summary: 'Ligar a outro chamado (relacionado, duplicado, repete)', params: Id, body: LigarChamadoSchema } },
    async (req) => fichaDepois(req, await svc.ligar(app, ator(req), req.params.id, req.body)));

  app.delete('/chamados/:id/ligacoes/:ligId', { ...trabalhar, schema: { tags, summary: 'Desfazer uma ligação', params: Id.extend({ ligId: z.string().min(1) }) } },
    async (req) => fichaDepois(req, await svc.desligar(app, ator(req), req.params.id, req.params.ligId)));

  app.post('/chamados/:id/pai', { ...trabalhar, schema: { tags, summary: 'O chamado pai, pelo código (nulo tira); pode ser de outro painel', params: Id, body: PaiSchema } },
    async (req) => fichaDepois(req, await svc.definirPai(app, ator(req), req.params.id, req.body.pai)));

  app.post('/chamados/:id/problema', { ...trabalhar, schema: { tags, summary: 'O problema de que este chamado é incidente, pelo código (nulo tira)', params: Id, body: ProblemaSchema } },
    async (req) => fichaDepois(req, await svc.definirProblema(app, ator(req), req.params.id, req.body.problema)));

  app.post('/chamados/:id/checklist', { ...trabalhar, schema: { tags, summary: 'Marcar, incluir ou tirar um item do checklist', params: Id, body: ChecklistSchema } },
    async (req) => fichaDepois(req, await svc.mexerNoChecklist(app, ator(req), req.params.id, req.body)));

  app.post('/chamados/:id/tempo', { ...trabalhar, schema: { tags, summary: 'Registrar o tempo de trabalho', params: Id, body: TempoSchema } },
    async (req) => fichaDepois(req, await svc.registrarTempo(app, ator(req), req.params.id, req.body)));

  app.delete('/chamados/:id/tempo/:itemId', { ...trabalhar, schema: { tags, summary: 'Apagar um registro de tempo (o seu, ou qualquer um se você cuida dos chamados)', params: Id.extend({ itemId: z.string().min(1) }) } },
    async (req) => fichaDepois(req, await svc.apagarTempo(app, ator(req), req.params.id, req.params.itemId), 'delete'));

  app.post('/chamados/:id/operadora', { ...trabalhar, schema: { tags, summary: 'Registrar o chamado aberto na operadora (marca "esperando a operadora")', params: Id, body: OperadoraCasoSchema } },
    async (req) => fichaDepois(req, await svc.abrirNaOperadora(app, ator(req), req.params.id, req.body)));

  app.post('/chamados/:id/operadora/:casoId', { ...trabalhar, schema: { tags, summary: 'Cobrar a operadora ou fechar o protocolo', params: Id.extend({ casoId: z.string().min(1) }), body: OperadoraAndamentoSchema } },
    async (req) => fichaDepois(req, await svc.andamentoNaOperadora(app, ator(req), req.params.id, req.params.casoId, req.body)));

  app.post('/chamados/:id/avisar-cliente', { ...trabalhar, schema: { tags, summary: 'Mandar uma mensagem ao contato pelo WhatsApp oficial (fica no histórico, mesmo se não for)', params: Id, body: AvisarClienteSchema } },
    async (req) => fichaDepois(req, await svc.avisarCliente(app, ator(req), req.params.id, req.body.texto)));

  app.post('/chamados/:id/observar', { ...trabalhar, schema: { tags, summary: 'Observar (ou deixar de observar) o chamado: quem observa recebe os avisos de toda atualização', params: Id, body: ObservarSchema } },
    async (req) => fichaDepois(req, await svc.observar(app, ator(req), req.params.id, req.body.observar)));

  // ---------- a lixeira (quem cuida dos chamados) ----------

  app.delete('/chamados/:id', { ...cuidar, schema: { tags, summary: 'Mandar o chamado para a lixeira (o número nunca volta a ser usado)', params: Id } },
    async (req) => {
      const r = await svc.mandarParaLixeira(app, ator(req), req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'ticket', entityId: r.id, summary: r.resumo! });
      return { ok: true };
    });

  app.post('/chamados/:id/restaurar', { ...cuidar, schema: { tags, summary: 'Tirar o chamado da lixeira', params: Id } },
    async (req) => fichaDepois(req, await svc.restaurar(app, ator(req), req.params.id), 'restore'));
};

export default routes;
