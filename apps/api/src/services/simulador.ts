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
 *
 * A principal da negociação (2.3, o Luan: "quando eu colocar os valores na simulação ele já deve ir para o card do
 * cliente já preenchendo nos campos de valores"; e, de duas simulações, "continua a marcada com principal"): cada
 * negociação com simulações tem uma principal — a primeira ligada, até a pessoa marcar outra (`tornarPrincipal`);
 * sem ela (foi para a lixeira ou desligou), a mexida por último. A cada salvamento da principal, o cenário principal
 * dela vai para o card (`levarParaANegociacao`: o que era o "Levar para a COM-x"), sem a linha no histórico da
 * negociação ("n precisa registrar as mudanças"). A negociação ganha ou perdida não muda.
 */
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { clients, newId, products, salesSimulations, ticketStages, tickets, users, type Db } from '@gestor/db';
import {
  AjustesDoSimuladorSchema, SimulacaoGravarSchema, ajustesDoSimulador, campoLigado, cenarioPrincipal, mesmoValorPorProduto, mudancasDaSimulacao, mudancasDosAjustes, planilhaDaSimulacao,
  resumoDoCenario, semOQueSaiu, valoresParaANegociacao,
  type AjustesDoSimulador, type CenarioDaSimulacao, type MargemDaNegociacao, type NegociacaoDaSimulacao, type ProdutoDoSimulador, type Simulacao,
  type SimulacaoDaNegociacao, type SimulacaoGravar, type SimulacaoGravarEntrada, type SimulacaoNaLista, type SimuladorOpcoes,
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

/** Os produtos do catálogo (ativos, fora da lixeira): o código liga o modelo e o cenário ao produto da negociação. */
export async function produtosDoCatalogo(db: Db): Promise<ProdutoDoSimulador[]> {
  const ps = await db.select({ id: products.id, codigo: products.code, nome: products.name }).from(products)
    .where(and(eq(products.active, true), isNull(products.deletedAt))).orderBy(asc(products.sortOrder), asc(products.name));
  return ps;
}

export async function opcoes(db: Db, ator: Ator): Promise<SimuladorOpcoes> {
  const [ajustes, produtos] = await Promise.all([lerAjustes(db), produtosDoCatalogo(db)]);
  return { ajustes, podeEditar: podeEditar(ator), podeCuidar: podeCuidar(ator) && podeVerVendas(ator), produtos };
}

/**
 * As simulações das negociações, para o relatório do Comercial (a margem das ganhas): de cada negociação, a
 * principal (2.3; antes, a mexida por último), com o cenário principal resumido.
 */
export async function margensDasNegociacoes(db: Db, negociacoes: string[]): Promise<{ margens: Map<string, MargemDaNegociacao>; ajustes: AjustesDoSimulador }> {
  const ajustes = await lerAjustes(db);
  const margens = new Map<string, MargemDaNegociacao>();
  if (!negociacoes.length) return { margens, ajustes };
  const linhas = await db.select().from(salesSimulations)
    .where(and(inArray(salesSimulations.ticketId, negociacoes), isNull(salesSimulations.deletedAt)))
    .orderBy(desc(salesSimulations.isMain), desc(salesSimulations.updatedAt));
  for (const l of linhas) {
    if (!l.ticketId || margens.has(l.ticketId)) continue;
    const r = resumoDoCenario(cenarioPrincipal({ cenarios: cenariosDaLinha(l), principal: l.principal }), ajustes);
    margens.set(l.ticketId, { simulacaoId: l.id, simulacao: l.name, mensalTotal: r.mensalTotal, sobraMensal: r.sobraMensal });
  }
  return { margens, ajustes };
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

/** Os cenários guardados, do jeito de hoje (os de antes de 21/10: a linha "por ramal" com a quantidade dos ramais, e sem a margem que se queria). */
const cenariosDaLinha = (l: Linha) => (Array.isArray(l.scenarios) ? l.scenarios.map(semOQueSaiu) : []) as CenarioDaSimulacao[];
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
    cenarios: cenariosDaLinha(l), principal: l.principal, principalDaNegociacao: !!l.ticketId && l.isMain,
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

/**
 * A simulação numa planilha do Excel, com as fórmulas (a ideia "excel" do Luan): uma folha por cenário e, com
 * dois ou mais, a "Lado a lado". A planilha é a do `@gestor/shared` (a prévia monta a mesma). Quem vê a
 * simulação exporta; a rota registra na auditoria.
 */
export async function planilha(db: Db, ator: Ator, id: string): Promise<{ bytes: Uint8Array; nome: string; simulacao: string }> {
  const [s, ajustes, produtos] = await Promise.all([ler(db, ator, id), lerAjustes(db), produtosDoCatalogo(db)]);
  const nomesDosProdutos = Object.fromEntries(produtos.map((x) => [x.codigo, x.nome]));
  return { ...planilhaDaSimulacao({ simulacao: s, faixas: ajustes, quem: ator.nome, quando: new Date(), nomesDosProdutos }), simulacao: s.nome };
}

/** As simulações ligadas a uma negociação (a ficha dela). Quem não vê a negociação não vê nada. */
export async function daNegociacao(db: Db, ator: Ator, ticketId: string): Promise<SimulacaoDaNegociacao[]> {
  if (!(await negociacoesVisiveis(db, ator, [ticketId])).has(ticketId)) return [];
  const [linhas, ajustes] = await Promise.all([
    // a principal primeiro (2.3), depois da mexida mais recente para a mais antiga
    db.select().from(salesSimulations).where(and(eq(salesSimulations.ticketId, ticketId), isNull(salesSimulations.deletedAt)))
      .orderBy(desc(salesSimulations.isMain), desc(salesSimulations.updatedAt)),
    lerAjustes(db),
  ]);
  return linhas.map((l) => {
    const cenarios = cenariosDaLinha(l);
    return { id: l.id, nome: l.name, cenarios: cenarios.length, principal: resumoDoCenario(cenarioPrincipal({ cenarios, principal: l.principal }), ajustes), principalDaNegociacao: l.isMain };
  });
}

// =====================================================================
//  A PRINCIPAL DA NEGOCIAÇÃO E OS VALORES NO CARD (2.3)
// =====================================================================

/**
 * A negociação com simulações tem sempre uma principal: sem nenhuma marcada (a primeira que liga, ou a principal
 * foi para a lixeira ou desligou), fica a mexida por último. Marcar não muda o card (só o salvamento da principal).
 */
async function garantirPrincipal(db: Db, ticketId: string | null | undefined): Promise<void> {
  if (!ticketId) return;
  const linhas = await db.select({ id: salesSimulations.id, isMain: salesSimulations.isMain }).from(salesSimulations)
    .where(and(eq(salesSimulations.ticketId, ticketId), isNull(salesSimulations.deletedAt)))
    .orderBy(desc(salesSimulations.updatedAt), desc(salesSimulations.createdAt));
  if (!linhas.length || linhas.some((l) => l.isMain)) return;
  await db.update(salesSimulations).set({ isMain: true }).where(eq(salesSimulations.id, linhas[0]!.id));
}

/**
 * Os valores do cenário principal da simulação principal vão para o card da negociação (o que era o "Levar para a
 * COM-x"): a mensalidade, a ativação, o valor de cada produto e os produtos. Sem a linha no histórico da negociação
 * (o Luan: "n precisa registrar as mudanças"); a simulação salva vai para a auditoria, como sempre. Não muda: a
 * simulação que não é a principal, a negociação ganha, perdida ou na lixeira, e a de um painel que a pessoa não vê.
 * Devolve se o card mudou.
 */
async function levarParaANegociacao(db: Db, ator: Ator, simulacaoId: string): Promise<boolean> {
  const [l] = await db.select().from(salesSimulations).where(eq(salesSimulations.id, simulacaoId)).limit(1);
  if (!l || l.deletedAt || !l.ticketId || !l.isMain) return false;
  const [t] = await db.select({
    id: tickets.id, painelId: tickets.panelId, deletedAt: tickets.deletedAt, produtos: tickets.productIds,
    valor: tickets.valueCents, valores: tickets.productValues, ativacao: tickets.setupCents, ativacoes: tickets.productSetup, resultado: ticketStages.outcome,
  }).from(tickets).leftJoin(ticketStages, eq(ticketStages.id, tickets.stageId)).where(eq(tickets.id, l.ticketId)).limit(1);
  if (!t || t.deletedAt || t.resultado === 'ganho' || t.resultado === 'perdido') return false;
  const { paineis } = await carregarPaineis(db);
  const p = paineis.find((x) => x.id === t.painelId);
  if (!p || p.tipo !== 'vendas' || !podeVerPainel(p, ator)) return false;
  const [ajustes, catalogo] = await Promise.all([lerAjustes(db), produtosDoCatalogo(db)]);
  const v = valoresParaANegociacao(cenarioPrincipal({ cenarios: cenariosDaLinha(l), principal: l.principal }), ajustes, catalogo, campoLigado(p.ajustes, 'produtos'));
  const produtos = v.produtos ?? t.produtos;
  const mesmosProdutos = produtos.length === t.produtos.length && produtos.every((x) => t.produtos.includes(x));
  if (v.valor === t.valor && v.ativacao === t.ativacao && mesmosProdutos
    && mesmoValorPorProduto(v.valoresDosProdutos, t.valores) && mesmoValorPorProduto(v.ativacoesDosProdutos, t.ativacoes)) return false;
  await db.update(tickets).set({
    valueCents: v.valor, productValues: v.valoresDosProdutos, setupCents: v.ativacao, productSetup: v.ativacoesDosProdutos, productIds: produtos, updatedAt: new Date(),
  }).where(eq(tickets.id, t.id));
  return true;
}

/**
 * Marca a simulação como a principal da negociação dela (a ficha da negociação, em Simulações, e o editor): a de
 * antes deixa de ser, e os valores desta vão para o card na hora.
 */
export async function tornarPrincipal(db: Db, ator: Ator, id: string): Promise<{ simulacao: Simulacao; resumo: string }> {
  if (!podeEditar(ator)) throw new Forbidden('Esta ação exige as permissões "sales.read" e "tickets.work"');
  const l = await linhaOu404(db, id);
  if (!l.ticketId) throw new BadRequest('A simulação não está ligada a uma negociação: ligue antes (o código, como COM-12).');
  const n = (await negociacoesVisiveis(db, ator, [l.ticketId])).get(l.ticketId);
  if (!n) throw new BadRequest('A negociação desta simulação é de um painel que você não vê.');
  if (!l.isMain) {
    await db.update(salesSimulations).set({ isMain: false })
      .where(and(eq(salesSimulations.ticketId, l.ticketId), ne(salesSimulations.id, id)));
    await db.update(salesSimulations).set({ isMain: true }).where(eq(salesSimulations.id, id));
  }
  const levou = await levarParaANegociacao(db, ator, id);
  const simulacao = { ...(await ler(db, ator, id)), levouParaANegociacao: levou };
  return { simulacao, resumo: `Marcou a simulação "${l.name}" como a principal da ${n.codigo}` };
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
  // a primeira da negociação é a principal, e os valores dela vão para o card (2.3)
  await garantirPrincipal(db, s.negociacaoId);
  const levou = await levarParaANegociacao(db, ator, l!.id);
  const simulacao = { ...(await ler(db, ator, l!.id)), levouParaANegociacao: levou };
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
  // trocou de negociação: deixa de ser a principal da de antes (que fica com outra) e, na nova, só é se não houver outra
  const trocou = atual.ticketId !== s.negociacaoId;
  await db.update(salesSimulations).set({
    name: s.nome, ticketId: s.negociacaoId, scenarios: s.cenarios, principal: s.principal,
    ...(trocou ? { isMain: false } : {}),
    updatedById: ator.tipo === 'pessoa' ? ator.id : null, updatedAt: new Date(),
  }).where(eq(salesSimulations.id, id));
  if (trocou) { await garantirPrincipal(db, atual.ticketId); await garantirPrincipal(db, s.negociacaoId); }
  // a principal leva os valores para o card (2.3)
  const levou = await levarParaANegociacao(db, ator, id);
  const simulacao = { ...(await ler(db, ator, id)), levouParaANegociacao: levou };
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
    id: newId(), name: nome, ticketId: o.ticketId, scenarios: o.scenarios, principal: o.principal, isMain: false, createdById: quem, updatedById: quem,
  }).returning();
  // a cópia não é a principal da negociação (2.3): a outra continua preenchendo o card
  await garantirPrincipal(db, o.ticketId);
  const simulacao = await ler(db, ator, l!.id);
  return { simulacao, depois: gravarDaLinha(l!), resumo: `Duplicou a simulação "${o.name}" em "${nome}"` };
}

export async function mandarParaLixeira(db: Db, ator: Ator, id: string): Promise<{ id: string; resumo: string }> {
  if (!podeEditar(ator)) throw new Forbidden('Esta ação exige as permissões "sales.read" e "tickets.work"');
  const l = await linhaOu404(db, id);
  await db.update(salesSimulations).set({ deletedAt: new Date(), isMain: false, updatedById: ator.tipo === 'pessoa' ? ator.id : null }).where(eq(salesSimulations.id, id));
  // a principal foi para a lixeira: outra fica no lugar (o card continua com os valores que tem)
  await garantirPrincipal(db, l.ticketId);
  return { id, resumo: `Mandou a simulação "${l.name}" para a lixeira` };
}

/** Volta da lixeira (Administração › Lixeira). */
export async function restaurar(db: Db, id: string): Promise<Linha> {
  const l = await linhaOu404(db, id, { lixeira: true });
  if (!l.deletedAt) throw new BadRequest('Essa simulação não está na lixeira.');
  const [volta] = await db.update(salesSimulations).set({ deletedAt: null, isMain: false }).where(eq(salesSimulations.id, id)).returning();
  // volta sem ser a principal, a não ser que a negociação esteja sem nenhuma
  await garantirPrincipal(db, volta!.ticketId);
  return volta!;
}
