/**
 * O SIMULADOR DO COMERCIAL (Patch 2.0.2, decisão 0052): a conta de uma venda antes de fechar. Cada
 * simulação tem um nome, de um a três cenários e, se a pessoa quiser, a negociação ligada (um chamado de
 * um painel de Vendas). A tabela de custos, os modelos por produto, o imposto e as faixas do sinal são os
 * Ajustes do Simulador (`settings.comercial-simulador`). As contas e a validação moram em
 * `@gestor/shared/simulador.ts` — as mesmas da prévia.
 *
 * Quem vê: quem tem o Comercial (`sales.read`) vê tudo, com os custos e a margem (a escolha do Luan).
 * Criar, mudar, duplicar e mandar para a lixeira: quem também trabalha nas negociações (`tickets.work`, como
 * nas negociações). Os Ajustes: quem cuida dos painéis (`tickets.manage`, como os ajustes do Comercial).
 * A negociação ligada só aparece para quem vê o painel dela; ligar uma pede que a pessoa a veja.
 */
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { clients, newId, salesSimulations, ticketStages, tickets, users, type Db } from '@gestor/db';
import {
  AjustesDoSimuladorSchema, SimulacaoGravarSchema, ajustesDoSimulador, cenarioPrincipal, mudancasDaSimulacao, mudancasDosAjustes, resumoDoCenario,
  type AjustesDoSimulador, type CenarioDaSimulacao, type NegociacaoDaSimulacao, type Simulacao, type SimulacaoDaNegociacao, type SimulacaoGravar,
  type SimulacaoGravarEntrada, type SimulacaoNaLista, type SimuladorOpcoes,
} from '@gestor/shared';
import { BadRequest, Forbidden, NotFound } from '../plugins/errors.js';
import { carregarPaineis, podeCuidar, podeTrabalhar, podeVerPainel, podeVerVendas, type Ator } from './atendimento/contexto.js';
import * as integ from './integracoes.js';

type Linha = typeof salesSimulations.$inferSelect;

// =====================================================================
//  OS AJUSTES (a tabela de custos, os modelos, o imposto, o sinal, o prazo)
// =====================================================================

export async function lerAjustes(db: Db): Promise<AjustesDoSimulador> {
  const { valor } = await integ.ler<unknown>(db, 'comercial-simulador');
  return ajustesDoSimulador(valor);
}

export async function opcoes(db: Db, ator: Ator): Promise<SimuladorOpcoes> {
  return { ajustes: await lerAjustes(db), podeEditar: podeEditar(ator), podeCuidar: podeCuidar(ator) && podeVerVendas(ator) };
}

const podeEditar = (a: Ator) => podeVerVendas(a) && podeTrabalhar(a);

/** Grava os Ajustes (quem cuida dos painéis). As simulações já feitas não mudam: as linhas guardam o valor de quando entraram. */
export async function gravarAjustes(db: Db, ator: Ator, entrada: unknown): Promise<{ ajustes: AjustesDoSimulador; resumo: string; antes: AjustesDoSimulador }> {
  if (!podeCuidar(ator)) throw new Forbidden('Esta ação exige a permissão "tickets.manage"');
  const ajustes = AjustesDoSimuladorSchema.parse(entrada);
  const antes = await lerAjustes(db);
  await integ.gravar(db, 'comercial-simulador', ajustes, { userId: ator.tipo === 'pessoa' ? ator.id : null });
  const mudou = mudancasDosAjustes(antes, ajustes);
  return { ajustes, antes, resumo: mudou.length ? `Mudou nos Ajustes do Simulador: ${mudou.join('; ')}` : 'Salvou os Ajustes do Simulador (sem mudança)' };
}

// =====================================================================
//  A NEGOCIAÇÃO LIGADA
// =====================================================================

/** As negociações (pelo id), como a pessoa vê: só as de painéis de Vendas que ela vê. */
async function negociacoesVisiveis(db: Db, ator: Ator, ids: string[]): Promise<Map<string, NegociacaoDaSimulacao>> {
  const fora = new Map<string, NegociacaoDaSimulacao>();
  const unicos = [...new Set(ids)];
  if (!unicos.length) return fora;
  const { paineis } = await carregarPaineis(db);
  const linhas = await db.select({
    id: tickets.id, codigo: tickets.code, titulo: tickets.title, painelId: tickets.panelId, cliente: clients.tradeName, prospect: tickets.prospect, resultado: ticketStages.outcome,
  }).from(tickets)
    .leftJoin(clients, eq(clients.id, tickets.clientId))
    .leftJoin(ticketStages, eq(ticketStages.id, tickets.stageId))
    .where(and(inArray(tickets.id, unicos), isNull(tickets.deletedAt)));
  for (const t of linhas) {
    const p = paineis.find((x) => x.id === t.painelId);
    if (!p || p.tipo !== 'vendas' || !podeVerPainel(p, ator)) continue;
    fora.set(t.id, {
      id: t.id, codigo: t.codigo, titulo: t.titulo, empresa: t.cliente ?? t.prospect ?? null,
      resultado: t.resultado === 'ganho' || t.resultado === 'perdido' ? t.resultado : null,
    });
  }
  return fora;
}

/** Confere a negociação que a pessoa quer ligar: existe, é de um painel de Vendas e ela vê. */
async function conferirNegociacao(db: Db, ator: Ator, id: string): Promise<NegociacaoDaSimulacao> {
  const n = (await negociacoesVisiveis(db, ator, [id])).get(id);
  if (!n) throw new BadRequest('Essa negociação não existe ou é de um painel que você não vê: confira o código (COM-12).');
  return n;
}

// =====================================================================
//  LER
// =====================================================================

const cenariosDaLinha = (l: Linha) => (Array.isArray(l.scenarios) ? l.scenarios : []) as CenarioDaSimulacao[];
const gravarDaLinha = (l: Linha): SimulacaoGravar => ({ nome: l.name, negociacaoId: l.ticketId, cenarios: cenariosDaLinha(l), principal: l.principal });

async function nomesDasPessoas(db: Db, ids: Array<string | null>): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map();
  const us = await db.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, unicos));
  return new Map(us.map((u) => [u.id, u.nome]));
}

function paraTela(l: Linha, negociacoes: Map<string, NegociacaoDaSimulacao>, nomes: Map<string, string>): Simulacao {
  return {
    id: l.id, nome: l.name, negociacaoId: l.ticketId, negociacao: l.ticketId ? negociacoes.get(l.ticketId) ?? null : null,
    cenarios: cenariosDaLinha(l), principal: l.principal,
    criadoPor: l.createdById ? nomes.get(l.createdById) ?? null : null, criadoEm: l.createdAt.toISOString(),
    alteradoPor: l.updatedById ? nomes.get(l.updatedById) ?? null : null, alteradoEm: l.updatedAt.toISOString(),
  };
}

async function linhaOu404(db: Db, id: string, opts: { lixeira?: boolean } = {}): Promise<Linha> {
  const [l] = await db.select().from(salesSimulations).where(eq(salesSimulations.id, id)).limit(1);
  if (!l || (l.deletedAt && !opts.lixeira)) throw new NotFound('Simulação');
  return l;
}

/** As simulações (as que não estão na lixeira), da mexida mais recente para a mais antiga. */
export async function listar(db: Db, ator: Ator): Promise<SimulacaoNaLista[]> {
  const [linhas, ajustes] = await Promise.all([
    db.select().from(salesSimulations).where(isNull(salesSimulations.deletedAt)).orderBy(desc(salesSimulations.updatedAt)),
    lerAjustes(db),
  ]);
  const negociacoes = await negociacoesVisiveis(db, ator, linhas.map((l) => l.ticketId).filter((x): x is string => !!x));
  const nomes = await nomesDasPessoas(db, linhas.flatMap((l) => [l.createdById, l.updatedById]));
  return linhas.map((l) => {
    const s = paraTela(l, negociacoes, nomes);
    return {
      id: s.id, nome: s.nome, negociacao: s.negociacao, negociacaoOculta: !!l.ticketId && !s.negociacao, cenarios: s.cenarios.length,
      principal: resumoDoCenario(cenarioPrincipal(s), ajustes), criadoPor: s.criadoPor, alteradoPor: s.alteradoPor, alteradoEm: s.alteradoEm,
    };
  });
}

export async function ler(db: Db, ator: Ator, id: string): Promise<Simulacao> {
  const l = await linhaOu404(db, id);
  const negociacoes = await negociacoesVisiveis(db, ator, l.ticketId ? [l.ticketId] : []);
  return paraTela(l, negociacoes, await nomesDasPessoas(db, [l.createdById, l.updatedById]));
}

/** As simulações ligadas a uma negociação (a ficha dela). Quem não vê a negociação não vê nada. */
export async function daNegociacao(db: Db, ator: Ator, ticketId: string): Promise<SimulacaoDaNegociacao[]> {
  if (!(await negociacoesVisiveis(db, ator, [ticketId])).has(ticketId)) return [];
  const [linhas, ajustes] = await Promise.all([
    db.select().from(salesSimulations).where(and(eq(salesSimulations.ticketId, ticketId), isNull(salesSimulations.deletedAt))).orderBy(desc(salesSimulations.updatedAt)),
    lerAjustes(db),
  ]);
  return linhas.map((l) => {
    const cenarios = cenariosDaLinha(l);
    return { id: l.id, nome: l.name, cenarios: cenarios.length, principal: resumoDoCenario(cenarioPrincipal({ cenarios, principal: l.principal }), ajustes) };
  });
}

// =====================================================================
//  GRAVAR
// =====================================================================

type Gravado = { simulacao: Simulacao; resumo: string; antes?: SimulacaoGravar; depois: SimulacaoGravar };

const textoDaLigacao = (n: NegociacaoDaSimulacao | null | undefined) => (n ? ` (ligada à ${n.codigo})` : '');

export async function criar(db: Db, ator: Ator, entrada: SimulacaoGravarEntrada): Promise<Gravado> {
  if (!podeEditar(ator)) throw new Forbidden('Esta ação exige as permissões "sales.read" e "tickets.work"');
  const s = SimulacaoGravarSchema.parse(entrada);
  const negociacao = s.negociacaoId ? await conferirNegociacao(db, ator, s.negociacaoId) : null;
  const quem = ator.tipo === 'pessoa' ? ator.id : null;
  const [l] = await db.insert(salesSimulations).values({
    id: newId(), name: s.nome, ticketId: s.negociacaoId, scenarios: s.cenarios, principal: s.principal, createdById: quem, updatedById: quem,
  }).returning();
  const simulacao = await ler(db, ator, l!.id);
  const n = s.cenarios.length;
  return { simulacao, depois: s, resumo: `Criou a simulação "${s.nome}"${n > 1 ? ` (${n} cenários)` : ''}${textoDaLigacao(negociacao)}` };
}

/**
 * Muda a simulação. A negociação ligada que a pessoa não vê (de um painel que não é dela) fica como estava:
 * ela manda o mesmo id que leu; trocar ou ligar uma nova pede que veja a nova.
 */
export async function alterar(db: Db, ator: Ator, id: string, entrada: SimulacaoGravarEntrada): Promise<Gravado> {
  if (!podeEditar(ator)) throw new Forbidden('Esta ação exige as permissões "sales.read" e "tickets.work"');
  const atual = await linhaOu404(db, id);
  const s = SimulacaoGravarSchema.parse(entrada);
  let negociacao: NegociacaoDaSimulacao | null = null;
  if (s.negociacaoId && s.negociacaoId !== atual.ticketId) negociacao = await conferirNegociacao(db, ator, s.negociacaoId);
  const antes = gravarDaLinha(atual);
  await db.update(salesSimulations).set({
    name: s.nome, ticketId: s.negociacaoId, scenarios: s.cenarios, principal: s.principal,
    updatedById: ator.tipo === 'pessoa' ? ator.id : null, updatedAt: new Date(),
  }).where(eq(salesSimulations.id, id));
  const simulacao = await ler(db, ator, id);
  const mudou = mudancasDaSimulacao(antes, s);
  if (antes.negociacaoId !== s.negociacaoId) {
    mudou.push(s.negociacaoId ? `ligou à ${negociacao?.codigo ?? simulacao.negociacao?.codigo ?? 'negociação'}` : 'desligou da negociação');
  }
  return { simulacao, antes, depois: s, resumo: mudou.length ? `Mudou a simulação "${s.nome}": ${mudou.join('; ')}` : `Salvou a simulação "${s.nome}" (sem mudança)` };
}

/** A cópia ("… (cópia)"), com os mesmos cenários e a mesma negociação, para fazer outra proposta a partir dela. */
export async function duplicar(db: Db, ator: Ator, id: string): Promise<Gravado> {
  if (!podeEditar(ator)) throw new Forbidden('Esta ação exige as permissões "sales.read" e "tickets.work"');
  const o = await linhaOu404(db, id);
  const nome = `${o.name} (cópia)`.slice(0, 120);
  const quem = ator.tipo === 'pessoa' ? ator.id : null;
  const [l] = await db.insert(salesSimulations).values({
    id: newId(), name: nome, ticketId: o.ticketId, scenarios: o.scenarios, principal: o.principal, createdById: quem, updatedById: quem,
  }).returning();
  const simulacao = await ler(db, ator, l!.id);
  return { simulacao, depois: gravarDaLinha(l!), resumo: `Duplicou a simulação "${o.name}" em "${nome}"` };
}

export async function mandarParaLixeira(db: Db, ator: Ator, id: string): Promise<{ id: string; resumo: string }> {
  if (!podeEditar(ator)) throw new Forbidden('Esta ação exige as permissões "sales.read" e "tickets.work"');
  const l = await linhaOu404(db, id);
  await db.update(salesSimulations).set({ deletedAt: new Date(), updatedById: ator.tipo === 'pessoa' ? ator.id : null }).where(eq(salesSimulations.id, id));
  return { id, resumo: `Mandou a simulação "${l.name}" para a lixeira` };
}

/** Volta da lixeira (Administração › Lixeira). */
export async function restaurar(db: Db, id: string): Promise<Linha> {
  const l = await linhaOu404(db, id, { lixeira: true });
  if (!l.deletedAt) throw new BadRequest('Essa simulação não está na lixeira.');
  const [volta] = await db.update(salesSimulations).set({ deletedAt: null }).where(eq(salesSimulations.id, id)).returning();
  return volta!;
}
