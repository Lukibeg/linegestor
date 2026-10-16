/**
 * O CALENDÁRIO (Patch 2.0.1, decisão 0049): as visitas, as viradas de sistema e para a nuvem, as folgas,
 * os home offices e as ações no cliente de cada equipe.
 *
 * Quem vê um evento é quem vê um dos painéis dele — a mesma regra dos chamados (`podeVerPainel`: o "Quem
 * vê" do painel; quem cuida dos chamados vê todos). O evento que a pessoa não vê não existe para ela (404,
 * nunca 403), como o chamado. Quem edita não tira o evento de um painel que não vê, nem põe num; as
 * pessoas do evento são as que veem um dos painéis dele. As regras de tela (os tipos, a janela, os dias)
 * estão em `@gestor/shared/calendario.ts` — as mesmas da prévia.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { calendarEvents, clients, newId, roles, tickets, users, type Db } from '@gestor/db';
import {
  eventoVisivel, hojeNoCalendario, NOME_SITUACAO_DO_EVENTO, paineisDepoisDaEdicao, textoDoPeriodo, tipoDoEvento, tiposDoCalendario,
  TiposDoCalendarioSchema,
  type CalendarioOpcoes, type EventoDoCalendario, type EventoGravar, type Painel, type SituacaoDoEvento, type TipoDeEvento, type TiposDoCalendario,
} from '@gestor/shared';
import { BadRequest, Forbidden, NotFound } from '../plugins/errors.js';
import { atorDaPessoa, carregarPaineis, podeCuidar, podeTrabalhar, podeVerPainel, type Ator } from './atendimento/contexto.js';
import * as integ from './integracoes.js';

type Linha = typeof calendarEvents.$inferSelect;

// =====================================================================
//  OS TIPOS
// =====================================================================

export async function lerTipos(db: Db): Promise<TipoDeEvento[]> {
  const { valor } = await integ.ler<Partial<TiposDoCalendario>>(db, 'calendario');
  return tiposDoCalendario(valor);
}

/**
 * Grava os tipos (quem cuida dos chamados). O tipo que tem evento não sai da lista: desativa (os eventos
 * dele continuam com o nome e a cor).
 */
export async function gravarTipos(db: Db, ator: Ator, entrada: TiposDoCalendario): Promise<{ tipos: TipoDeEvento[]; resumo: string; antes: TipoDeEvento[] }> {
  if (!podeCuidar(ator)) throw new Forbidden('Esta ação exige a permissão "tickets.manage"');
  const { tipos } = TiposDoCalendarioSchema.parse(entrada);
  const antes = await lerTipos(db);
  const sairam = antes.filter((t) => !tipos.some((x) => x.id === t.id));
  if (sairam.length) {
    const usados = await db.selectDistinct({ tipo: calendarEvents.typeId }).from(calendarEvents)
      .where(and(inArray(calendarEvents.typeId, sairam.map((t) => t.id)), isNull(calendarEvents.deletedAt)));
    const comEvento = sairam.filter((t) => usados.some((u) => u.tipo === t.id));
    if (comEvento.length) throw new BadRequest(`${comEvento.map((t) => t.nome).join(', ')} já ${comEvento.length === 1 ? 'tem' : 'têm'} eventos: desative em vez de tirar.`);
  }
  await integ.gravar(db, 'calendario', { tipos }, { userId: ator.tipo === 'pessoa' ? ator.id : null });
  const mudou: string[] = [];
  for (const t of tipos) {
    const a = antes.find((x) => x.id === t.id);
    if (!a) mudou.push(`incluiu ${t.nome}`);
    else if (a.nome !== t.nome || a.cor !== t.cor || a.daEquipe !== t.daEquipe || a.ativo !== t.ativo) {
      mudou.push(a.ativo !== t.ativo ? `${t.ativo ? 'reativou' : 'desativou'} ${t.nome}` : `mudou ${a.nome === t.nome ? t.nome : `${a.nome} (agora ${t.nome})`}`);
    }
  }
  for (const t of sairam) mudou.push(`tirou ${t.nome}`);
  return { tipos, antes, resumo: `Mudou os tipos do calendário: ${mudou.join(', ') || 'a ordem'}` };
}

// =====================================================================
//  OS PAINÉIS E AS PESSOAS (quem vê o quê)
// =====================================================================

type PessoaAtiva = { id: string; nome: string; permissoes: string[] };

async function pessoasAtivas(db: Db): Promise<PessoaAtiva[]> {
  const us = await db.select({ id: users.id, name: users.name, permissions: roles.permissions }).from(users)
    .innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.active, true)).orderBy(asc(users.name));
  return us.map((u) => ({ id: u.id, nome: u.name, permissoes: u.permissions }));
}

/** Os painéis que a pessoa vê (inclusive os desativados: os eventos deles continuam lá). */
async function paineisDe(db: Db, ator: Ator): Promise<{ todos: Painel[]; visiveis: Painel[] }> {
  const { paineis } = await carregarPaineis(db);
  return { todos: paineis, visiveis: paineis.filter((p) => podeVerPainel(p, ator)) };
}

/** Quem (das pessoas ativas) vê o painel. */
const quemVe = (p: Painel, pessoas: PessoaAtiva[]) =>
  pessoas.filter((u) => podeVerPainel(p, atorDaPessoa({ id: u.id, name: u.nome, permissions: u.permissoes }))).map((u) => u.id);

export async function opcoes(db: Db, ator: Ator, agora = new Date()): Promise<CalendarioOpcoes> {
  const [{ visiveis }, pessoas, tipos] = await Promise.all([paineisDe(db, ator), pessoasAtivas(db), lerTipos(db)]);
  return {
    tipos,
    paineis: visiveis.map((p) => ({ id: p.id, nome: p.nome, sigla: p.sigla, cor: p.cor, ativo: p.ativo, pessoas: quemVe(p, pessoas) })),
    pessoas: pessoas.map((p) => ({ id: p.id, nome: p.nome })),
    podeEditar: podeTrabalhar(ator),
    podeCuidar: podeCuidar(ator),
    hoje: hojeNoCalendario(agora),
  };
}

// =====================================================================
//  LER
// =====================================================================

/** As linhas viram eventos da tela: com o nome do cliente, o código do chamado e quem criou e mudou. */
async function paraTela(db: Db, linhas: Linha[]): Promise<EventoDoCalendario[]> {
  if (!linhas.length) return [];
  const clientesIds = [...new Set(linhas.map((l) => l.clientId).filter((x): x is string => !!x))];
  const chamadosIds = [...new Set(linhas.map((l) => l.ticketId).filter((x): x is string => !!x))];
  const pessoasIds = [...new Set(linhas.flatMap((l) => [l.createdById, l.updatedById]).filter((x): x is string => !!x))];
  const [cs, ts, us] = await Promise.all([
    clientesIds.length ? db.select({ id: clients.id, nome: clients.tradeName }).from(clients).where(inArray(clients.id, clientesIds)) : [],
    chamadosIds.length ? db.select({ id: tickets.id, codigo: tickets.code }).from(tickets).where(inArray(tickets.id, chamadosIds)) : [],
    pessoasIds.length ? db.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, pessoasIds)) : [],
  ]);
  const cliente = new Map(cs.map((c) => [c.id, c.nome]));
  const chamado = new Map(ts.map((t) => [t.id, t.codigo]));
  const pessoa = new Map(us.map((u) => [u.id, u.nome]));
  return linhas.map((l) => ({
    id: l.id, titulo: l.title, tipoId: l.typeId, paineis: l.panelIds, pessoas: l.participantIds,
    clienteId: l.clientId, clienteNome: l.clientId ? cliente.get(l.clientId) ?? null : null,
    chamadoId: l.ticketId, chamadoCodigo: l.ticketId ? chamado.get(l.ticketId) ?? null : null,
    inicio: l.startsOn, fim: l.endsOn, diaInteiro: l.allDay, horaInicio: l.startTime, horaFim: l.endTime,
    local: l.location ?? '', observacao: l.notes ?? '', situacao: l.status as SituacaoDoEvento,
    criadoPor: l.createdById ? pessoa.get(l.createdById) ?? null : null, criadoEm: l.createdAt.toISOString(),
    alteradoPor: l.updatedById ? pessoa.get(l.updatedById) ?? null : null, alteradoEm: l.updatedAt.toISOString(),
  }));
}

/** Os eventos que a pessoa vê e que tocam o período (o mês da tela, com as pontas da grade). */
export async function listar(db: Db, ator: Ator, de: string, ate: string): Promise<EventoDoCalendario[]> {
  const [{ visiveis }, linhas] = await Promise.all([
    paineisDe(db, ator),
    db.select().from(calendarEvents).where(and(isNull(calendarEvents.deletedAt), lte(calendarEvents.startsOn, ate), gte(calendarEvents.endsOn, de))),
  ]);
  const ids = new Set(visiveis.map((p) => p.id));
  return paraTela(db, linhas.filter((l) => eventoVisivel({ paineis: l.panelIds }, ids)));
}

/** Os eventos ligados a um chamado (a ficha do chamado): o chamado que a pessoa não vê não existe. */
export async function doChamado(db: Db, ator: Ator, chamadoId: string): Promise<EventoDoCalendario[]> {
  const [{ todos, visiveis }, [t]] = await Promise.all([
    paineisDe(db, ator),
    db.select({ id: tickets.id, panelId: tickets.panelId }).from(tickets).where(and(eq(tickets.id, chamadoId), isNull(tickets.deletedAt))).limit(1),
  ]);
  const painel = t ? todos.find((p) => p.id === t.panelId) : undefined;
  if (!t || !painel || !podeVerPainel(painel, ator)) throw new NotFound('Chamado não encontrado');
  const ids = new Set(visiveis.map((p) => p.id));
  const linhas = await db.select().from(calendarEvents)
    .where(and(eq(calendarEvents.ticketId, chamadoId), isNull(calendarEvents.deletedAt))).orderBy(asc(calendarEvents.startsOn));
  return paraTela(db, linhas.filter((l) => eventoVisivel({ paineis: l.panelIds }, ids)));
}

/** O evento (que a pessoa vê); o que ela não vê dá 404. */
async function linhaVisivel(db: Db, ator: Ator, id: string, visiveis: Painel[]): Promise<Linha> {
  const [l] = await db.select().from(calendarEvents).where(and(eq(calendarEvents.id, id), isNull(calendarEvents.deletedAt))).limit(1);
  if (!l || !eventoVisivel({ paineis: l.panelIds }, new Set(visiveis.map((p) => p.id)))) throw new NotFound('Evento não encontrado');
  return l;
}

// =====================================================================
//  GRAVAR
// =====================================================================

/**
 * Confere o evento antes de gravar: o tipo (ativo, ou o mesmo de antes), os painéis (que a pessoa vê;
 * no novo, ativos), as pessoas (ativas e que veem um dos painéis — quem já estava e saiu da empresa
 * fica), o cliente e o chamado (que a pessoa vê). Devolve os nomes, para o resumo da auditoria.
 */
async function conferir(db: Db, ator: Ator, e: EventoGravar & { paineis: string[] }, antes: Linha | null, todos: Painel[], visiveis: Painel[]) {
  const tipos = await lerTipos(db);
  const tipo = tipos.find((t) => t.id === e.tipoId);
  if (!tipo) throw new BadRequest('Esse tipo não existe mais: escolha outro.');
  if (!tipo.ativo && antes?.typeId !== tipo.id) throw new BadRequest(`O tipo ${tipo.nome} foi desativado: escolha outro.`);

  const idsVisiveis = new Set(visiveis.map((p) => p.id));
  const paineis = e.paineis.map((id) => todos.find((p) => p.id === id));
  if (paineis.some((p) => !p)) throw new BadRequest('Um dos painéis não existe mais: escolha outro.');
  for (const p of paineis as Painel[]) {
    const jaEstava = !!antes?.panelIds.includes(p.id);
    if (!idsVisiveis.has(p.id) && !jaEstava) throw new BadRequest(`O painel ${p.nome} não é seu: escolha um dos painéis que você vê.`);
    if (!p.ativo && !jaEstava) throw new BadRequest(`O painel ${p.nome} foi desativado: escolha outro.`);
  }
  if (!paineis.some((p) => idsVisiveis.has(p!.id))) throw new BadRequest('Deixe pelo menos um painel que você vê.');

  const ativas = await pessoasAtivas(db);
  const podem = new Set((paineis as Painel[]).flatMap((p) => quemVe(p, ativas)));
  const nomes: string[] = [];
  for (const id of e.pessoas) {
    const ativa = ativas.find((u) => u.id === id);
    const jaEstava = !!antes?.participantIds.includes(id);
    if (!ativa) {
      if (jaEstava) continue;
      throw new BadRequest('Uma das pessoas não está mais ativa: tire-a do evento.');
    }
    if (!podem.has(id) && !jaEstava) throw new BadRequest(`${ativa.nome} não vê nenhum dos painéis do evento: inclua o painel dela ou tire a pessoa.`);
    nomes.push(ativa.nome);
  }

  let clienteNome: string | null = null;
  if (e.clienteId) {
    const [c] = await db.select({ nome: clients.tradeName }).from(clients).where(and(eq(clients.id, e.clienteId), isNull(clients.deletedAt))).limit(1);
    if (!c && antes?.clientId !== e.clienteId) throw new BadRequest('Cliente não encontrado.');
    clienteNome = c?.nome ?? null;
  }
  let chamadoCodigo: string | null = null;
  if (e.chamadoId) {
    const [t] = await db.select({ code: tickets.code, panelId: tickets.panelId }).from(tickets).where(and(eq(tickets.id, e.chamadoId), isNull(tickets.deletedAt))).limit(1);
    const painel = t ? todos.find((p) => p.id === t.panelId) : undefined;
    if ((!t || !painel || !podeVerPainel(painel, ator)) && antes?.ticketId !== e.chamadoId) throw new BadRequest('Chamado não encontrado.');
    chamadoCodigo = t?.code ?? null;
  }
  return { tipo, paineis: paineis as Painel[], nomes, clienteNome, chamadoCodigo };
}

const valores = (e: EventoGravar & { paineis: string[] }) => ({
  title: e.titulo, typeId: e.tipoId, panelIds: e.paineis, participantIds: e.pessoas, clientId: e.clienteId, ticketId: e.chamadoId,
  startsOn: e.inicio, endsOn: e.fim, allDay: e.diaInteiro, startTime: e.horaInicio, endTime: e.horaFim,
  location: e.local || null, notes: e.observacao || null, status: e.situacao,
});

export type Gravado = { evento: EventoDoCalendario; resumo: string; antes?: unknown; depois: unknown };

export async function criar(db: Db, ator: Ator, e: EventoGravar): Promise<Gravado> {
  if (!podeTrabalhar(ator)) throw new Forbidden('Esta ação exige a permissão "tickets.work"');
  const { todos, visiveis } = await paineisDe(db, ator);
  const c = await conferir(db, ator, e, null, todos, visiveis);
  const id = newId();
  const quem = ator.tipo === 'pessoa' ? ator.id : null;
  await db.insert(calendarEvents).values({ id, ...valores(e), createdById: quem, updatedById: quem });
  const [linha] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
  const [evento] = await paraTela(db, [linha!]);
  const onde = [textoDoPeriodo(e), c.paineis.map((p) => p.nome).join(', '), c.clienteNome].filter(Boolean).join(', ');
  return { evento: evento!, depois: valores(e), resumo: `Pôs no calendário: "${e.titulo}" (${c.tipo.nome}, ${onde})` };
}

/** O que mudou, nas palavras da tela (para a auditoria). */
function oQueMudou(a: Linha, d: ReturnType<typeof valores>): string[] {
  const out: string[] = [];
  if (a.title !== d.title) out.push('Título');
  if (a.typeId !== d.typeId) out.push('Tipo');
  if ([...a.panelIds].sort().join() !== [...d.panelIds].sort().join()) out.push('Painéis');
  if ([...a.participantIds].sort().join() !== [...d.participantIds].sort().join()) out.push('Pessoas');
  if (a.clientId !== d.clientId) out.push('Cliente');
  if (a.ticketId !== d.ticketId) out.push('Chamado');
  if (a.startsOn !== d.startsOn || a.endsOn !== d.endsOn || a.allDay !== d.allDay || a.startTime !== d.startTime || a.endTime !== d.endTime) out.push('Quando');
  if ((a.location ?? null) !== d.location) out.push('Local');
  if ((a.notes ?? null) !== d.notes) out.push('Observação');
  if (a.status !== d.status) out.push(`Situação (${NOME_SITUACAO_DO_EVENTO[d.status as SituacaoDoEvento]})`);
  return out;
}

export async function alterar(db: Db, ator: Ator, id: string, e: EventoGravar): Promise<Gravado> {
  if (!podeTrabalhar(ator)) throw new Forbidden('Esta ação exige a permissão "tickets.work"');
  const { todos, visiveis } = await paineisDe(db, ator);
  const antes = await linhaVisivel(db, ator, id, visiveis);
  const comPaineis = { ...e, paineis: paineisDepoisDaEdicao(antes.panelIds, e.paineis, new Set(visiveis.map((p) => p.id))) };
  await conferir(db, ator, comPaineis, antes, todos, visiveis);
  const d = valores(comPaineis);
  const mudou = oQueMudou(antes, d);
  await db.update(calendarEvents).set({ ...d, updatedById: ator.tipo === 'pessoa' ? ator.id : null, updatedAt: new Date() }).where(eq(calendarEvents.id, id));
  const [linha] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
  const [evento] = await paraTela(db, [linha!]);
  return { evento: evento!, antes, depois: d, resumo: `Mudou no calendário "${d.title}": ${mudou.join(', ') || 'nada'}` };
}

/** O Feito e o Cancelado (e o voltar a Agendado), sem abrir a janela. */
export async function mudarSituacao(db: Db, ator: Ator, id: string, situacao: SituacaoDoEvento): Promise<Gravado> {
  if (!podeTrabalhar(ator)) throw new Forbidden('Esta ação exige a permissão "tickets.work"');
  const { visiveis } = await paineisDe(db, ator);
  const antes = await linhaVisivel(db, ator, id, visiveis);
  await db.update(calendarEvents).set({ status: situacao, updatedById: ator.tipo === 'pessoa' ? ator.id : null, updatedAt: new Date() }).where(eq(calendarEvents.id, id));
  const [linha] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
  const [evento] = await paraTela(db, [linha!]);
  const verbo = situacao === 'feito' ? 'Marcou como feito' : situacao === 'cancelado' ? 'Cancelou' : 'Voltou a agendado';
  return { evento: evento!, antes: { status: antes.status }, depois: { status: situacao }, resumo: `${verbo} no calendário: "${antes.title}" (${textoDoPeriodo({ inicio: antes.startsOn, fim: antes.endsOn })})` };
}

/** A lixeira: o evento sai do calendário e volta pela Administração › Lixeira. */
export async function mandarParaLixeira(db: Db, ator: Ator, id: string): Promise<{ id: string; resumo: string }> {
  if (!podeTrabalhar(ator)) throw new Forbidden('Esta ação exige a permissão "tickets.work"');
  const { visiveis } = await paineisDe(db, ator);
  const l = await linhaVisivel(db, ator, id, visiveis);
  await db.update(calendarEvents).set({ deletedAt: new Date(), updatedById: ator.tipo === 'pessoa' ? ator.id : null }).where(eq(calendarEvents.id, id));
  const tipos = await lerTipos(db);
  return { id, resumo: `Mandou para a lixeira do calendário: "${l.title}" (${tipoDoEvento(tipos, l.typeId).nome}, ${textoDoPeriodo({ inicio: l.startsOn, fim: l.endsOn })})` };
}

/** Tirar da lixeira (Administração › Lixeira). */
export async function restaurar(db: Db, id: string): Promise<Linha> {
  const [l] = await db.select().from(calendarEvents).where(and(eq(calendarEvents.id, id), isNotNull(calendarEvents.deletedAt))).limit(1);
  if (!l) throw new NotFound('Evento não encontrado na lixeira');
  await db.update(calendarEvents).set({ deletedAt: null, updatedAt: new Date() }).where(eq(calendarEvents.id, id));
  return l;
}
