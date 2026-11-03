/** Circuitos. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CircuitoAtualizarSchema, CircuitoGravarSchema, CircuitoListarSchema, DidCriarFaixaSchema, MovimentacoesDosCircuitosSchema, PaginacaoSchema, Booleano } from '@gestor/shared';
import * as svc from '../services/circuits.js';
import * as didsSvc from '../services/dids.js';
import * as mov from '../services/movimentacoesCircuitos.js';

const Id = z.object({ id: z.string() });

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'Listar circuitos com ocupação (busca, operadora, titular)', querystring: CircuitoListarSchema } },
    async (req) => svc.list(app.db, req.query));

  app.get('/summary', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'Resumo (circuitos, canais, valor mensal, numeração) com os MESMOS filtros da lista', querystring: CircuitoListarSchema.partial() } },
    async (req) => svc.summary(app.db, req.query));

  app.get('/owners', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'Titulares que têm pelo menos um circuito (para o filtro)', querystring: z.object({ includeThirdParty: Booleano.default(false) }) } },
    async (req) => svc.owners(app.db, req.query.includeThirdParty));

  app.get('/movimentacoes', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'As movimentações dos circuitos e dos DIDs (2.4.1): o que mudou, quem e quando', querystring: MovimentacoesDosCircuitosSchema } },
    async (req) => mov.listar(app.db, req.query));

  app.get('/options', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'Lista curta para seletores' } }, async () => svc.options(app.db));

  app.get('/:id', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'Detalhe do circuito', params: Id } }, async (req) => svc.get(app.db, req.params.id));

  app.get('/:id/dids', { preHandler: app.requirePermission('records.read'), schema: { tags: ['Circuitos'], summary: 'DIDs do circuito', params: Id, querystring: PaginacaoSchema } },
    // dentro de um circuito, mostra os números dele — inclusive se for um link de terceiro
    async (req) => didsSvc.list(app.db, { ...req.query, circuitId: req.params.id, includeThirdParty: true, sort: 'number', dir: 'asc' }));

  app.post('/', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Circuitos'], summary: 'Criar circuito', body: CircuitoGravarSchema } },
    async (req, reply) => {
      const row = await svc.create(app.db, app.vault, req.body, req.user!.id);
      await app.audit(req, { action: 'create', entityType: 'circuit', entityId: row.id, summary: `Criou o circuito ${row.name}`, after: row });
      await mov.aoCriarCircuito(app.db, req.user!.id, row);
      return reply.status(201).send(await svc.get(app.db, row.id));
    });

  app.patch('/:id', { preHandler: app.requirePermission('records.write'), schema: { tags: ['Circuitos'], summary: 'Editar circuito', params: Id, body: CircuitoAtualizarSchema } },
    async (req) => {
      const { before, after } = await svc.update(app.db, app.vault, req.params.id, req.body, req.user!.id);
      await app.audit(req, { action: 'update', entityType: 'circuit', entityId: after.id, summary: `Editou o circuito ${after.name}`, before, after });
      await mov.aoEditarCircuito(app.db, req.user!.id, before, after, !!req.body.authPassword);
      return svc.get(app.db, after.id);
    });

  app.delete('/:id', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Circuitos'], summary: 'Mandar para a lixeira (só sem DIDs)', params: Id } },
    async (req) => {
      const row = await svc.softDelete(app.db, req.params.id);
      await app.audit(req, { action: 'delete', entityType: 'circuit', entityId: row.id, summary: `Mandou o circuito ${row.name} para a lixeira` });
      await mov.aoMexerNaLixeiraDoCircuito(app.db, req.user!.id, row, 'circuito_lixeira');
      return { ok: true };
    });

  app.post('/:id/restore', { preHandler: app.requirePermission('records.delete'), schema: { tags: ['Circuitos'], summary: 'Restaurar da lixeira', params: Id } },
    async (req) => {
      const row = await svc.restore(app.db, req.params.id);
      await app.audit(req, { action: 'restore', entityType: 'circuit', entityId: row.id, summary: `Restaurou o circuito ${row.name}` });
      await mov.aoMexerNaLixeiraDoCircuito(app.db, req.user!.id, row, 'circuito_restaurado');
      return svc.get(app.db, row.id);
    });

  app.post('/:id/dids/range', { preHandler: app.requirePermission('dids.assign'), schema: { tags: ['Circuitos'], summary: 'Criar uma faixa de DIDs dentro do circuito', params: Id, body: DidCriarFaixaSchema.omit({ circuitId: true }) } },
    async (req, reply) => {
      const { numbers, ...r } = await didsSvc.createRange(app.db, { ...req.body, circuitId: req.params.id });
      await app.audit(req, { action: 'bulk_create', entityType: 'did', entityId: req.params.id, summary: `Criou ${r.created} DIDs (${r.first}–${r.last}) no circuito ${req.params.id}` });
      await mov.aoCriarDids(app.db, req.user!.id, { numeros: numbers, circuitId: req.params.id, clientId: req.body.clientId, note: req.body.note });
      return reply.status(201).send(r);
    });
};

export default routes;
