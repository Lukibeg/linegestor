/**
 * OS CHAMADOS DO GESTOR — a rotina (Patch 2.0, decisão 0047): as respostas prontas e os chamados
 * agendados, que quem cuida dos chamados cadastra em Chamados › Ajustes.
 *
 * A resposta pronta é um texto com uma ação junto (mandar ao cliente, esperar, pôr etiqueta, assumir,
 * mover): aqui só se cadastra; quem usa num chamado é `usarResposta` (chamados.ts). O agendado é o
 * chamado que nasce sozinho na hora marcada (a verificação dos DIDs todo dia 15): aqui se cadastra e
 * se cria "agora"; na hora marcada, quem cria é o relógio (`relogio.ts`) — os dois pela mesma
 * `criarDoAgendado`, que passa por `criarChamado` (as mesmas regras da tela).
 *
 * Nada se apaga de verdade: a resposta e o agendado removidos ganham `deleted_at`.
 */
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { clients, newId, ticketMacros, ticketSchedules, users, type Db } from '@gestor/db';
import {
  AgendadoGravarSchema, ChamadoCriarSchema, proximaExecucao, RegraAgendadoSchema, RespostaProntaGravarSchema, textoDaRegra,
  type Agendado, type Painel, type Prioridade, type RegraAgendado, type RespostaPronta,
} from '@gestor/shared';
import { BadRequest, NotFound } from '../../plugins/errors.js';
import { criarChamado } from './chamados.js';
import { carregarContexto, carregarPaineis, type Ator } from './contexto.js';
import { lerAcao } from './leitura.js';

export type RespostaGravar = z.infer<typeof RespostaProntaGravarSchema>;
export type AgendadoGravar = z.infer<typeof AgendadoGravarSchema>;
type LinhaResposta = typeof ticketMacros.$inferSelect;
export type LinhaAgendado = typeof ticketSchedules.$inferSelect;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// =====================================================================
//  AS RESPOSTAS PRONTAS
// =====================================================================

export function respostaDaLinha(m: LinhaResposta): RespostaPronta {
  return { id: m.id, nome: m.name, texto: m.body, painelId: m.panelId, acao: lerAcao(m.action), ordem: m.sortOrder, ativa: m.active };
}

/** Todas (inclusive as desativadas): é a lista da tela de Ajustes. A tela de trabalho lê as ativas em `/opcoes`. */
export async function listarRespostas(db: Db): Promise<RespostaPronta[]> {
  const linhas = await db.select().from(ticketMacros).where(isNull(ticketMacros.deletedAt)).orderBy(asc(ticketMacros.sortOrder), asc(ticketMacros.name));
  return linhas.map(respostaDaLinha);
}

/**
 * O painel da resposta existe; e a etapa para onde ela leva o chamado é desse painel — a etapa é de
 * um painel só, então a resposta que move precisa dizer qual (a que vale em todos não pode mover).
 */
async function conferirResposta(db: Db, d: RespostaGravar): Promise<Painel | null> {
  const { paineis } = await carregarPaineis(db);
  const painel = d.painelId ? paineis.find((p) => p.id === d.painelId) ?? null : null;
  if (d.painelId && !painel) throw new BadRequest('O painel escolhido não existe (ou foi removido).');
  if (d.acao.etapaId) {
    if (!painel) throw new BadRequest('Para mover o chamado, escolha o painel da resposta: a etapa é de um painel.');
    if (!painel.etapas.some((e) => e.id === d.acao.etapaId)) throw new BadRequest(`Essa etapa não é do painel ${painel.nome}.`);
  }
  return painel;
}

async function respostaOu404(db: Db, id: string): Promise<LinhaResposta> {
  const [m] = await db.select().from(ticketMacros).where(and(eq(ticketMacros.id, id), isNull(ticketMacros.deletedAt))).limit(1);
  if (!m) throw new NotFound('Resposta pronta');
  return m;
}

/** A nova entra no fim da lista. */
export async function criarResposta(db: Db, d: RespostaGravar, userId: string | null): Promise<{ resposta: RespostaPronta; painel: Painel | null }> {
  const painel = await conferirResposta(db, d);
  const [ultima] = await db.select({ n: sql<number>`coalesce(max(${ticketMacros.sortOrder}), -1)::int` }).from(ticketMacros).where(isNull(ticketMacros.deletedAt));
  const [m] = await db.insert(ticketMacros).values({
    id: newId(), panelId: d.painelId, name: d.nome, body: d.texto, action: d.acao, sortOrder: Number(ultima?.n ?? -1) + 1, active: d.ativa, createdById: userId,
  }).returning();
  return { resposta: respostaDaLinha(m!), painel };
}

export async function alterarResposta(db: Db, id: string, d: RespostaGravar): Promise<{ antes: RespostaPronta; depois: RespostaPronta }> {
  const antes = await respostaOu404(db, id);
  await conferirResposta(db, d);
  const [m] = await db.update(ticketMacros).set({ panelId: d.painelId, name: d.nome, body: d.texto, action: d.acao, active: d.ativa, updatedAt: new Date() })
    .where(eq(ticketMacros.id, id)).returning();
  return { antes: respostaDaLinha(antes), depois: respostaDaLinha(m!) };
}

export async function removerResposta(db: Db, id: string): Promise<RespostaPronta> {
  const m = await respostaOu404(db, id);
  await db.update(ticketMacros).set({ deletedAt: new Date() }).where(eq(ticketMacros.id, id));
  return respostaDaLinha(m);
}

// =====================================================================
//  OS AGENDADOS
// =====================================================================

/** A regra como foi guardada (uma regra estragada vira "uma vez", sem data: nunca nasce, em vez de quebrar a tela). */
export function lerRegra(v: unknown): RegraAgendado {
  const r = RegraAgendadoSchema.safeParse(v ?? {});
  return r.success ? r.data : { frequencia: 'uma_vez', hora: '08:00', dias: [], diaDoMes: null, data: null, soDiasDeAtendimento: false };
}

/** Os agendados para a tela, com os nomes do cliente e do responsável e a regra em palavras. */
async function paraTela(db: Db, linhas: LinhaAgendado[]): Promise<Agendado[]> {
  const idsClientes = [...new Set(linhas.map((a) => a.clientId).filter((x): x is string => !!x))];
  const idsPessoas = [...new Set(linhas.map((a) => a.assigneeId).filter((x): x is string => !!x))];
  const [cs, ps] = await Promise.all([
    idsClientes.length ? db.select({ id: clients.id, nome: clients.tradeName }).from(clients).where(inArray(clients.id, idsClientes)) : Promise.resolve([]),
    idsPessoas.length ? db.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, idsPessoas)) : Promise.resolve([]),
  ]);
  const cliente = new Map(cs.map((c) => [c.id, c.nome]));
  const pessoa = new Map(ps.map((p) => [p.id, p.nome]));
  return linhas.map((a) => {
    const regra = lerRegra(a.rule);
    return {
      id: a.id, painelId: a.panelId, titulo: a.title, relato: a.customerReport,
      clienteId: a.clientId, clienteNome: a.clientId ? cliente.get(a.clientId) ?? '(cliente removido)' : null,
      responsavelId: a.assigneeId, responsavelNome: a.assigneeId ? pessoa.get(a.assigneeId) ?? '(pessoa removida)' : null,
      assuntoId: a.subjectId, prioridade: (a.priority as Prioridade | null) ?? null, checklist: a.checklist,
      regra, textoRegra: textoDaRegra(regra), ativo: a.active,
      proximaEm: iso(a.nextRunAt), ultimaEm: iso(a.lastRunAt), ultimoCodigo: a.lastTicketCode,
    };
  });
}

export async function listarAgendados(db: Db): Promise<Agendado[]> {
  const linhas = await db.select().from(ticketSchedules).where(isNull(ticketSchedules.deletedAt)).orderBy(asc(ticketSchedules.nextRunAt), asc(ticketSchedules.title));
  return paraTela(db, linhas);
}

async function agendadoOu404(db: Db, id: string): Promise<LinhaAgendado> {
  const [a] = await db.select().from(ticketSchedules).where(and(eq(ticketSchedules.id, id), isNull(ticketSchedules.deletedAt))).limit(1);
  if (!a) throw new NotFound('Agendado');
  return a;
}

/**
 * Confere o agendado como o "abrir" confere o chamado (o painel, o cliente, o responsável, o assunto do
 * mesmo painel) — o que estiver errado aparece ao salvar, e não às 8 da manhã do dia 15, quando o
 * relógio for criar. Devolve o painel e a próxima vez em que ele nasce.
 */
async function conferirAgendado(db: Db, d: AgendadoGravar, agora: Date): Promise<{ painel: Painel; proxima: Date | null }> {
  const ctx = await carregarContexto(db, agora);
  const painel = ctx.paineis.find((p) => p.id === d.painelId) ?? ctx.paineis.find((p) => p.sigla === d.painelId.trim().toUpperCase());
  if (!painel) throw new BadRequest('O painel escolhido não existe (ou foi removido).');
  if (d.ativo && !painel.ativo) throw new BadRequest(`O painel ${painel.nome} está desativado: escolha outro.`);
  if (d.clienteId) {
    const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, d.clienteId), isNull(clients.deletedAt))).limit(1);
    if (!c) throw new BadRequest('O cliente escolhido não existe (ou está na lixeira).');
  }
  if (d.responsavelId) {
    const p = ctx.pessoas.get(d.responsavelId);
    if (!p || !p.ativo) throw new BadRequest('O responsável escolhido não existe ou está desativado.');
  }
  if (d.assuntoId) {
    const a = ctx.assuntos.find((x) => x.id === d.assuntoId);
    if (!a || a.painelId !== painel.id || !a.ativo) throw new BadRequest(`Esse assunto não é do painel ${painel.nome} (ou foi desativado).`);
  }
  const regra = d.regra as RegraAgendado;
  const proxima = proximaExecucao(regra, agora, ctx.prazos.calendario);
  // "uma vez" numa hora que já passou nunca nasceria: melhor dizer agora do que ficar esperando à toa
  if (d.ativo && regra.frequencia === 'uma_vez' && !proxima) throw new BadRequest('Essa data e hora já passaram: escolha um momento que ainda vai chegar.');
  return { painel, proxima };
}

const colunas = (d: AgendadoGravar, painel: Painel, proxima: Date | null) => ({
  panelId: painel.id, title: d.titulo, customerReport: d.relato ?? null, clientId: d.clienteId, assigneeId: d.responsavelId, subjectId: d.assuntoId,
  priority: d.prioridade, checklist: d.checklist, rule: d.regra, active: d.ativo, nextRunAt: proxima,
});

export async function criarAgendado(db: Db, d: AgendadoGravar, userId: string | null): Promise<{ agendado: Agendado; painel: Painel }> {
  const agora = new Date();
  const { painel, proxima } = await conferirAgendado(db, d, agora);
  const [a] = await db.insert(ticketSchedules).values({ id: newId(), ...colunas(d, painel, proxima), createdById: userId, createdAt: agora, updatedAt: agora }).returning();
  return { agendado: (await paraTela(db, [a!]))[0]!, painel };
}

/** Salvar recalcula a próxima vez a partir de agora (com a regra e o calendário de agora). */
export async function alterarAgendado(db: Db, id: string, d: AgendadoGravar): Promise<{ antes: Agendado; depois: Agendado }> {
  const agora = new Date();
  const linha = await agendadoOu404(db, id);
  const { painel, proxima } = await conferirAgendado(db, d, agora);
  const [a] = await db.update(ticketSchedules).set({ ...colunas(d, painel, proxima), updatedAt: agora }).where(eq(ticketSchedules.id, id)).returning();
  const [antes, depois] = await paraTela(db, [linha, a!]);
  return { antes: antes!, depois: depois! };
}

export async function removerAgendado(db: Db, id: string): Promise<Agendado> {
  const a = await agendadoOu404(db, id);
  await db.update(ticketSchedules).set({ deletedAt: new Date() }).where(eq(ticketSchedules.id, id));
  return (await paraTela(db, [a]))[0]!;
}

/**
 * O chamado do agendado, pelas regras do "abrir" (o painel ativo, o assunto do painel, o responsável
 * ativo…): origem "agendado", com os itens do agendado no checklist (além dos do assunto). Quem chama
 * escreve a auditoria e grava a última vez.
 */
export async function criarDoAgendado(app: FastifyInstance, a: LinhaAgendado, ator: Ator): Promise<{ id: string; codigo: string }> {
  const lido = ChamadoCriarSchema.safeParse({
    painelId: a.panelId, titulo: a.title, relato: a.customerReport, clienteId: a.clientId, responsavelId: a.assigneeId,
    assuntoId: a.subjectId, prioridade: a.priority,
  });
  if (!lido.success) throw new BadRequest(`O agendado "${a.title}" tem um dado inválido: ${lido.error.issues[0]?.message ?? 'confira o cadastro'}.`);
  const r = await criarChamado(app, ator, lido.data, { origem: 'agendado', agendadoId: a.id, checklistExtra: a.checklist });
  return { id: r.id, codigo: r.codigo };
}

/** "Criar agora": o chamado nasce já, e a próxima vez continua a mesma (a última vez e o último código mudam). */
export async function rodarAgora(app: FastifyInstance, ator: Ator, id: string): Promise<{ id: string; codigo: string; titulo: string }> {
  const a = await agendadoOu404(app.db, id);
  const r = await criarDoAgendado(app, a, ator);
  await app.db.update(ticketSchedules).set({ lastRunAt: new Date(), lastTicketCode: r.codigo }).where(eq(ticketSchedules.id, a.id));
  return { ...r, titulo: a.title };
}
