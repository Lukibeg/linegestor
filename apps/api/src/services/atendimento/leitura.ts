/**
 * OS CHAMADOS DO GESTOR — a leitura (Patch 1.10, decisão 0047): as opções da tela, o quadro, a lista
 * (e o CSV), o Meu dia, o sininho, o cadastro do cliente para o formulário de abrir e a ficha inteira.
 *
 * Tudo sai das funções do `@gestor/shared` (as mesmas da prévia): o que o quadro mostra, a ordem da
 * lista, o que falta para cada etapa e o desenho das ligações são contas escritas uma vez só. Aqui
 * fica só o que é do servidor: ler do banco e respeitar quem vê o quê (o painel "escolhidos" não
 * existe para quem não está nele — nem na lista, nem no quadro, nem nas ligações de outro chamado).
 *
 * Também moram aqui os pedaços que a escrita (`chamados.ts`) usa para conferir um movimento: o
 * chamado na forma que a regra dos obrigatórios entende, o tempo gasto e os filhos.
 */
import type { FastifyInstance } from 'fastify';
import { and, arrayContains, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  carriers, circuits, clientUnits, clients, deviceModels, devices, dids, linechatCards, products, subscriptions, ticketAttachments, ticketCarrierCases,
  ticketEvents, ticketLinks, ticketMacros, ticketNotes, ticketNotifications, ticketSchedules, ticketTimeEntries, tickets, users,
  type Db,
} from '@gestor/db';
import {
  AcaoRespostaSchema, campoLigado, compararUrgencia, csvDosChamados, dentroDoHorario, diaLocal, didFormatado, emOrdemDeArvore, etiquetasUnicas, faltaParaEtapa,
  filhosQueTravam, filtrarCartoes, grafoDeLigacoes, horaLocal, linkDaConversa, macFormatado, NOME_LIGACAO, ordenarCartoes, prioridadeSugeridaDoPainel,
  referenciasNoTexto, resumoDosPaineis, situacaoDaEtapa, trajetoria,
  type AcaoResposta, type Alcance, type AnotacaoChamado, type Assunto, type AvisosNaTela, type CadastroDoCliente, type CartaoChamado,
  type CartaoParaLista, type CasoOperadora, type DadosObrigatorios, type FichaChamado, type FiltrosAtendimento, type Gravidade, type ItemChecklist,
  type MeuDia, type Nivel, type NoParaGrafo, type OpcoesAtendimento, type Prioridade, type QuadroAtendimento, type RespostaPronta, type ResumoDoPainel,
  type ReferenciaMostrada, type SituacaoDoChamado, type TipoAviso, type TipoChamado, type TipoLigacaoChamado, type ValoresDosCampos,
} from '@gestor/shared';
import { NotFound } from '../../plugins/errors.js';
import * as integ from '../integracoes.js';
import { situacaoIa } from '../baseIa.js';
import { lerAjustes as lerAjustesLineChat } from '../linechat.js';
import { tipoDaImagem } from '../portal.js';
import {
  carregarCartoes, carregarContexto, carregarPaineis, cartoesDe, chamadoVisivel, eventoParaTela, pessoaCurta, podeCuidar, podeTrabalhar, podeVerPainel,
  type Ator, type Contexto, type LinhaChamado,
} from './contexto.js';
import { whatsAppPronto } from './whatsapp.js';

/** Quantos chamados fechados o quadro mostra (o resto fica na lista, com o "ver todos"). */
export const FECHADOS_NO_QUADRO = 30;
/** As imagens que abrem na tela (conferidas pelos primeiros bytes; SVG nunca). */
export const IMAGENS_NA_TELA = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// =====================================================================
//  OS PEDAÇOS QUE A ESCRITA TAMBÉM USA
// =====================================================================

/** O chamado na forma que a regra dos obrigatórios (`faltaParaEtapa`) entende. */
export function dadosDaLinha(t: LinhaChamado, tempoMinutos: number): DadosObrigatorios {
  return {
    tipoChamado: t.kind as TipoChamado,
    clienteId: t.clientId, contatoNome: t.contactName, contatoTelefone: t.contactPhone,
    relato: t.customerReport, descricao: t.description,
    assuntoId: t.subjectId, tipo: t.type,
    gravidade: (t.severity as Gravidade | null) ?? null, alcance: (t.reach as Alcance | null) ?? null, prioridade: (t.priority as Prioridade | null) ?? null,
    produtos: t.productIds, operadoras: t.carrierIds,
    responsavelId: t.assigneeId,
    solucao: t.solution, causa: t.cause, validacao: t.validation,
    checklist: (t.checklist as ItemChecklist[] | null) ?? [],
    tempoMinutos,
    campos: (t.customFields as ValoresDosCampos | null) ?? {},
  };
}

/** Os minutos de trabalho registrados no chamado (o "tempo gasto" dos obrigatórios). */
export async function minutosGastos(db: Db, ticketId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${ticketTimeEntries.minutes}), 0)::int` }).from(ticketTimeEntries)
    .where(and(eq(ticketTimeEntries.ticketId, ticketId), isNull(ticketTimeEntries.deletedAt)));
  return Number(r?.n ?? 0);
}

/**
 * Os filhos do chamado (fora da lixeira), com a situação de cada um. Vale para a regra do pai que
 * espera os filhos mesmo quando o filho está num painel que a pessoa não vê: a regra é do chamado.
 */
export async function filhosDoChamado(db: Db, ctx: Contexto, ticketId: string): Promise<Array<{ id: string; codigo: string; painelId: string; situacao: SituacaoDoChamado }>> {
  const linhas = await db.select({ id: tickets.id, code: tickets.code, stageId: tickets.stageId, panelId: tickets.panelId }).from(tickets)
    .where(and(eq(tickets.parentId, ticketId), isNull(tickets.deletedAt))).orderBy(asc(tickets.createdAt));
  return linhas.map((f) => ({ id: f.id, codigo: f.code, painelId: f.panelId, situacao: situacaoDaEtapa(ctx.etapas.get(f.stageId)?.etapa.tipo ?? 'andamento') }));
}

/** A ação da resposta pronta, como foi guardada (o que faltar vem com o padrão). */
export function lerAcao(v: unknown): AcaoResposta {
  const r = AcaoRespostaSchema.safeParse(v ?? {});
  return r.success ? r.data : { avisarCliente: false, etapaId: null, esperar: null, etiqueta: null, assumir: false };
}

/** O cartão sem o texto de busca (que só serve para filtrar e é grande: leva o relato inteiro). */
export function semBusca(c: CartaoParaLista): CartaoChamado {
  const { busca: _busca, ...cartao } = c;
  return cartao;
}

/** A ordem das etapas para ordenar a lista "por etapa": a ordem dos painéis, e dentro deles a das colunas. */
function ordemDasEtapas(ctx: Contexto): Map<string, number> {
  const m = new Map<string, number>();
  ctx.paineis.forEach((p, i) => p.etapas.forEach((e, j) => m.set(e.id, i * 100 + j)));
  return m;
}

const painelVisivelOu404 = (ctx: Contexto, ator: Ator, ref: string) => {
  const painel = ctx.paineis.find((p) => p.id === ref) ?? ctx.paineis.find((p) => p.sigla === ref.trim().toUpperCase());
  if (!painel || !podeVerPainel(painel, ator)) throw new NotFound('Painel');
  return painel;
};

// =====================================================================
//  AS OPÇÕES DA TELA
// =====================================================================

export async function opcoes(app: FastifyInstance, ator: Ator): Promise<OpcoesAtendimento> {
  const db = app.db;
  const ctx = await carregarContexto(db);
  const paineis = ctx.paineis.filter((p) => podeVerPainel(p, ator));
  const ids = paineis.map((p) => p.id);
  const [pessoas, prods, ops, usadas, macros, whatsapp, ia, lc] = await Promise.all([
    db.select({ id: users.id, nome: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name)),
    db.select({ id: products.id, nome: products.name, cor: products.color }).from(products)
      .where(and(isNull(products.deletedAt), eq(products.active, true))).orderBy(asc(products.sortOrder), asc(products.name)),
    db.select({ id: carriers.id, nome: carriers.name }).from(carriers).where(eq(carriers.active, true)).orderBy(asc(carriers.name)),
    ids.length
      ? db.selectDistinct({ e: sql<string>`unnest(${tickets.tags})` }).from(tickets).where(and(isNull(tickets.deletedAt), inArray(tickets.panelId, ids)))
      : Promise.resolve([] as Array<{ e: string }>),
    db.select().from(ticketMacros).where(and(isNull(ticketMacros.deletedAt), eq(ticketMacros.active, true))).orderBy(asc(ticketMacros.sortOrder), asc(ticketMacros.name)),
    whatsAppPronto(db),
    situacaoIa(db),
    lerAjustesLineChat(db),
  ]);
  // os assuntos em ordem de árvore, painel por painel (a tela monta o "Ramal › Configuração")
  const assuntos: Assunto[] = paineis.flatMap((p) => emOrdemDeArvore(ctx.assuntos.filter((a) => a.painelId === p.id)).map(({ profundidade: _p, ...a }) => a));
  const respostas: RespostaPronta[] = macros
    .filter((m) => !m.panelId || ids.includes(m.panelId))
    .map((m) => ({ id: m.id, nome: m.name, texto: m.body, painelId: m.panelId, acao: lerAcao(m.action), ordem: m.sortOrder, ativa: m.active }));
  return {
    paineis,
    pessoas: pessoas.map((p) => ({ ...p, ativo: true })),
    assuntos,
    // os campos na ordem dos painéis e, dentro de cada um, na ordem dos Ajustes
    campos: paineis.flatMap((p) => ctx.campos.filter((c) => c.painelId === p.id)),
    produtos: prods,
    operadoras: ops,
    etiquetas: etiquetasUnicas(usadas.map((u) => u.e).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    prazos: ctx.prazos,
    respostas,
    whatsapp,
    ia: { ativa: ia.ativa, modelo: ia.modelo || null },
    linechatUrl: lc.valor.ativo && lc.valor.appUrl ? lc.valor.appUrl.replace(/\/+$/, '') : null,
    pode: { trabalhar: podeTrabalhar(ator), cuidar: podeCuidar(ator), integrar: ator.tipo === 'pessoa' && ator.permissoes.includes('admin.manage') },
  };
}

// =====================================================================
//  O QUADRO, A LISTA E O CSV
// =====================================================================

/** O que o quadro aceita de filtro (o painel é obrigatório: o quadro é de um painel). */
export type FiltrosQuadro = Pick<Partial<FiltrosAtendimento>, 'responsavel' | 'prioridade' | 'q' | 'cliente' | 'assunto' | 'etiqueta' | 'espera'> & { painel: string };

const maisRecente = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');

/**
 * Uma coluna por etapa, na ordem do painel. Na entrada e no andamento, o mais urgente primeiro; no
 * Resolvido, o mais recente; no Fechado, só os 30 fechados mais recentes (o resto conta como
 * "escondidos": a tela leva para a lista).
 */
export async function quadro(app: FastifyInstance, ator: Ator, f: FiltrosQuadro): Promise<QuadroAtendimento> {
  const ctx = await carregarContexto(app.db);
  const painel = painelVisivelOu404(ctx, ator, f.painel);
  const doPainel = (await carregarCartoes(app.db, ator, ctx)).filter((c) => c.painelId === painel.id);
  const lista = filtrarCartoes(doPainel, { ...f, painel: painel.id, situacao: 'todos' }, { euId: ator.id, assuntos: ctx.assuntos });
  const colunas = painel.etapas.map((etapa) => {
    const daqui = lista.filter((c) => c.etapaId === etapa.id);
    const ordenados = etapa.tipo === 'resolvido'
      ? [...daqui].sort((a, b) => maisRecente(a.resolvidoEm ?? a.ultimaAtividadeEm, b.resolvidoEm ?? b.ultimaAtividadeEm))
      : etapa.tipo === 'fechado'
        ? [...daqui].sort((a, b) => maisRecente(a.fechadoEm ?? a.ultimaAtividadeEm, b.fechadoEm ?? b.ultimaAtividadeEm))
        : [...daqui].sort(compararUrgencia);
    const mostrados = etapa.tipo === 'fechado' ? ordenados.slice(0, FECHADOS_NO_QUADRO) : ordenados;
    return { etapa, chamados: mostrados.map(semBusca), total: daqui.length, escondidos: daqui.length - mostrados.length };
  });
  return { painelId: painel.id, colunas, foraDoHorario: !dentroDoHorario(ctx.agora, ctx.prazos.calendario), agora: ctx.agora.toISOString() };
}

async function filtrados(app: FastifyInstance, ator: Ator, f: FiltrosAtendimento) {
  const ctx = await carregarContexto(app.db);
  const todos = await carregarCartoes(app.db, ator, ctx);
  const lista = filtrarCartoes(todos, f, { euId: ator.id, assuntos: ctx.assuntos });
  return { ctx, lista: ordenarCartoes(lista, f.sort, f.dir, ordemDasEtapas(ctx)) };
}

/** A lista com os filtros, a ordem e a página (um `pageSize` grande é o "Ver tudo"). */
export async function lista(app: FastifyInstance, ator: Ator, f: FiltrosAtendimento) {
  const { lista: todos } = await filtrados(app, ator, f);
  const inicio = (f.page - 1) * f.pageSize;
  return { items: todos.slice(inicio, inicio + f.pageSize).map(semBusca), total: todos.length, page: f.page, pageSize: f.pageSize };
}

/** O CSV da lista com os mesmos filtros e a mesma ordem (abre no Excel do Brasil: BOM e ponto e vírgula). */
export async function exportar(app: FastifyInstance, ator: Ator, f: FiltrosAtendimento): Promise<{ csv: string; nome: string; total: number }> {
  const { ctx, lista: todos } = await filtrados(app, ator, f);
  const csv = csvDosChamados(todos, {
    painel: (id) => ctx.paineis.find((p) => p.id === id)?.nome ?? '',
    etapa: (id) => ctx.etapas.get(id)?.etapa.nome ?? '',
  }, ctx.campos);
  return { csv, nome: `chamados-${diaLocal(ctx.agora)}.csv`, total: todos.length };
}

// =====================================================================
//  O MEU DIA
// =====================================================================

const apertado = (c: CartaoChamado) =>
  c.prazos.resposta.situacao === 'perto' || c.prazos.resposta.situacao === 'vencido' || c.prazos.solucao.situacao === 'perto' || c.prazos.solucao.situacao === 'vencido';

/** A tela inicial (os painéis): os números de cada painel que a pessoa vê, contados pela regra do shared. */
export async function resumoDosPaineisVisiveis(app: FastifyInstance, ator: Ator): Promise<ResumoDoPainel[]> {
  const ctx = await carregarContexto(app.db);
  const todos = await carregarCartoes(app.db, ator, ctx);
  return resumoDosPaineis(ctx.paineis.filter((p) => podeVerPainel(p, ator)), todos, ator.tipo === 'pessoa' ? ator.id : null);
}

export async function meuDia(app: FastifyInstance, ator: Ator): Promise<MeuDia> {
  const db = app.db;
  const ctx = await carregarContexto(db);
  const todos = await carregarCartoes(db, ator, ctx);
  const eu = ator.id;
  const visiveis = ctx.paineis.filter((p) => podeVerPainel(p, ator)).map((p) => p.id);
  const [observados, agendados] = await Promise.all([
    ator.tipo === 'pessoa'
      ? db.select({ id: tickets.id }).from(tickets).where(and(isNull(tickets.deletedAt), arrayContains(tickets.watcherIds, [eu])))
      : Promise.resolve([] as Array<{ id: string }>),
    visiveis.length
      ? db.select().from(ticketSchedules).where(and(isNull(ticketSchedules.deletedAt), eq(ticketSchedules.active, true), inArray(ticketSchedules.panelId, visiveis)))
      : Promise.resolve([] as Array<typeof ticketSchedules.$inferSelect>),
  ]);
  const observo = new Set(observados.map((o) => o.id));
  const hoje = diaLocal(ctx.agora);
  const abertos = todos.filter((c) => c.situacao === 'aberto');
  const porUrgencia = (l: CartaoParaLista[]) => [...l].sort(compararUrgencia).map(semBusca);
  return {
    meus: porUrgencia(abertos.filter((c) => c.responsavel?.id === eu)),
    vencendo: porUrgencia(abertos.filter((c) => (!c.responsavel || c.responsavel.id === eu) && apertado(c))),
    semDono: porUrgencia(abertos.filter((c) => !c.responsavel)),
    esperandoCliente: porUrgencia(abertos.filter((c) => c.responsavel?.id === eu && c.espera?.tipo === 'cliente')),
    observando: porUrgencia(abertos.filter((c) => observo.has(c.id))),
    agendadosHoje: agendados
      .filter((a) => a.nextRunAt && diaLocal(a.nextRunAt) === hoje)
      .sort((a, b) => a.nextRunAt!.getTime() - b.nextRunAt!.getTime())
      .map((a) => ({ id: a.id, titulo: a.title, hora: horaLocal(a.nextRunAt!), painelId: a.panelId })),
    abertosHoje: todos.filter((c) => diaLocal(c.criadoEm) === hoje).length,
    fechadosHoje: todos.filter((c) => !!c.fechadoEm && diaLocal(c.fechadoEm) === hoje).length,
  };
}

// =====================================================================
//  O SININHO
// =====================================================================

export async function avisosNaTela(db: Db, userId: string): Promise<AvisosNaTela> {
  const [linhas, [n]] = await Promise.all([
    db.select({ a: ticketNotifications, codigo: tickets.code, titulo: tickets.title }).from(ticketNotifications)
      .leftJoin(tickets, eq(tickets.id, ticketNotifications.ticketId))
      .where(eq(ticketNotifications.userId, userId))
      .orderBy(desc(ticketNotifications.createdAt), desc(ticketNotifications.id))
      .limit(30),
    db.select({ n: sql<number>`count(*)::int` }).from(ticketNotifications).where(and(eq(ticketNotifications.userId, userId), isNull(ticketNotifications.readAt))),
  ]);
  return {
    naoLidos: Number(n?.n ?? 0),
    itens: linhas.map(({ a, codigo, titulo }) => ({
      id: a.id, tipo: a.kind as TipoAviso, texto: a.body,
      chamado: a.ticketId && codigo ? { id: a.ticketId, codigo, titulo: titulo ?? '' } : null,
      em: a.createdAt.toISOString(), lido: !!a.readAt,
    })),
  };
}

/** Marca como lidos (sem ids = todos). Só os da própria pessoa. */
export async function marcarAvisosLidos(db: Db, userId: string, ids?: string[]) {
  if (ids && !ids.length) return;
  await db.update(ticketNotifications).set({ readAt: new Date() })
    .where(and(eq(ticketNotifications.userId, userId), isNull(ticketNotifications.readAt), ids ? inArray(ticketNotifications.id, ids) : undefined));
}

// =====================================================================
//  O CADASTRO DO CLIENTE (o formulário de abrir e o cartão da empresa na ficha)
// =====================================================================

export async function cadastroDoCliente(app: FastifyInstance, ator: Ator, clienteId: string): Promise<CadastroDoCliente> {
  const db = app.db;
  const [cli] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clienteId), isNull(clients.deletedAt))).limit(1);
  if (!cli) throw new NotFound('Cliente');
  const [prods, titular, numeros, aparelhos, unidades] = await Promise.all([
    db.select({ id: products.id, nome: products.name, cor: products.color }).from(subscriptions)
      .innerJoin(products, eq(products.id, subscriptions.productId))
      .where(and(eq(subscriptions.clientId, clienteId), isNull(subscriptions.deactivatedAt), isNull(products.deletedAt), eq(products.active, true)))
      .orderBy(asc(products.sortOrder), asc(products.name)),
    db.select({ id: circuits.id, nome: circuits.name, carrierId: circuits.carrierId }).from(circuits)
      .where(and(eq(circuits.ownerClientId, clienteId), isNull(circuits.deletedAt))),
    db.select({ id: dids.id, number: dids.number, circuitId: dids.circuitId }).from(dids)
      .where(and(eq(dids.clientId, clienteId), isNull(dids.deletedAt))).orderBy(asc(dids.number)),
    db.select({ id: devices.id, mac: devices.mac, serial: devices.serialNumber, modelo: deviceModels.name }).from(devices)
      .innerJoin(deviceModels, eq(deviceModels.id, devices.modelId))
      .where(and(eq(devices.clientId, clienteId), isNull(devices.deletedAt))).orderBy(asc(deviceModels.name), asc(devices.mac)),
    db.select({ id: clientUnits.id, nome: clientUnits.name }).from(clientUnits)
      .where(and(eq(clientUnits.clientId, clienteId), isNull(clientUnits.deletedAt))).orderBy(desc(clientUnits.isMain), asc(clientUnits.name)),
  ]);
  // os circuitos dos DIDs dele (o DID do cliente pode estar num feixe que é da VoiceNet)
  const dosDids = [...new Set(numeros.map((d) => d.circuitId).filter((x): x is string => !!x))].filter((id) => !titular.some((c) => c.id === id));
  const outros = dosDids.length
    ? await db.select({ id: circuits.id, nome: circuits.name, carrierId: circuits.carrierId }).from(circuits).where(and(inArray(circuits.id, dosDids), isNull(circuits.deletedAt)))
    : [];
  const todosCircuitos = [...titular, ...outros].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const idsOperadoras = [...new Set(todosCircuitos.map((c) => c.carrierId).filter((x): x is string => !!x))];
  const ops = idsOperadoras.length
    ? await db.select({ id: carriers.id, nome: carriers.name }).from(carriers).where(inArray(carriers.id, idsOperadoras)).orderBy(asc(carriers.name))
    : [];
  const nomeOperadora = new Map(ops.map((o) => [o.id, o.nome]));
  const nomeCircuito = new Map(todosCircuitos.map((c) => [c.id, c.nome]));

  // "Reabrir este": os do cliente ainda abertos ou abertos nos últimos 7 dias (o mesmo ramal à tarde reabre o da manhã)
  const ctx = await carregarContexto(db);
  const desde = ctx.agora.getTime() - 7 * 86_400_000;
  const recentes = (await carregarCartoes(db, ator, ctx))
    .filter((c) => c.cliente?.id === clienteId && (c.situacao === 'aberto' || Date.parse(c.criadoEm) >= desde))
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .slice(0, 10)
    .map(semBusca);

  return {
    produtos: prods,
    operadoras: ops,
    circuitos: todosCircuitos.map((c) => ({ id: c.id, nome: c.nome, operadora: c.carrierId ? nomeOperadora.get(c.carrierId) ?? null : null })),
    dids: numeros.map((d) => ({ id: d.id, numero: didFormatado(d.number), circuito: d.circuitId ? nomeCircuito.get(d.circuitId) ?? null : null })),
    aparelhos: aparelhos.map((a) => ({ id: a.id, nome: `${a.modelo} · ${a.mac ? macFormatado(a.mac) : a.serial ? `N/S ${a.serial}` : 'sem identificação'}` })),
    unidades,
    recentes,
  };
}

// =====================================================================
//  O ANEXO
// =====================================================================

/** Um anexo de anotação, se a pessoa vê o chamado. A imagem (conferida pelos bytes) abre na tela; o resto baixa. */
export async function lerAnexo(app: FastifyInstance, ator: Ator, id: string) {
  const [row] = await app.db.select({ a: ticketAttachments, notaApagada: ticketNotes.deletedAt, painel: tickets.panelId, chamadoApagado: tickets.deletedAt })
    .from(ticketAttachments)
    .innerJoin(tickets, eq(tickets.id, ticketAttachments.ticketId))
    .leftJoin(ticketNotes, eq(ticketNotes.id, ticketAttachments.noteId))
    .where(eq(ticketAttachments.id, id)).limit(1);
  if (!row || row.a.deletedAt || row.notaApagada || row.chamadoApagado) throw new NotFound('Anexo');
  const { paineis } = await carregarPaineis(app.db);
  const p = paineis.find((x) => x.id === row.painel);
  if (!p || !podeVerPainel(p, ator)) throw new NotFound('Anexo');
  const buffer = Buffer.from(row.a.dataBase64, 'base64');
  const real = tipoDaImagem(buffer);
  return { fileName: row.a.fileName, mimeType: real ?? row.a.mimeType, buffer, imagem: !!real && IMAGENS_NA_TELA.includes(real) };
}

// =====================================================================
//  A FICHA
// =====================================================================

type Caso = { em: string; porId: string | null; porNome?: string | null; acao: 'abriu' | 'cobrou' | 'fechou'; texto: string | null };

/** O chamado inteiro: o cartão, os textos, as ligações, o histórico, a trajetória e o que falta para cada etapa. */
export async function fichaDoChamado(app: FastifyInstance, ator: Ator, ref: string): Promise<FichaChamado> {
  const db = app.db;
  const ctx = await carregarContexto(db);
  const t = await chamadoVisivel(db, ref, ator, ctx);
  const painel = ctx.paineis.find((p) => p.id === t.panelId)!;
  const visiveis = new Set(ctx.paineis.filter((p) => podeVerPainel(p, ator)).map((p) => p.id));

  const [eventos, notas, anexos, tempo, casos, filhos, todasLigacoes, nos, integracoes, lc] = await Promise.all([
    db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, t.id)).orderBy(asc(ticketEvents.createdAt), asc(ticketEvents.id)),
    db.select().from(ticketNotes).where(and(eq(ticketNotes.ticketId, t.id), isNull(ticketNotes.deletedAt))).orderBy(asc(ticketNotes.createdAt), asc(ticketNotes.id)),
    db.select({ id: ticketAttachments.id, noteId: ticketAttachments.noteId, fileName: ticketAttachments.fileName, mimeType: ticketAttachments.mimeType, sizeBytes: ticketAttachments.sizeBytes })
      .from(ticketAttachments).where(and(eq(ticketAttachments.ticketId, t.id), isNull(ticketAttachments.deletedAt))).orderBy(asc(ticketAttachments.createdAt)),
    db.select().from(ticketTimeEntries).where(and(eq(ticketTimeEntries.ticketId, t.id), isNull(ticketTimeEntries.deletedAt)))
      .orderBy(asc(ticketTimeEntries.workedOn), asc(ticketTimeEntries.createdAt)),
    db.select().from(ticketCarrierCases).where(eq(ticketCarrierCases.ticketId, t.id)).orderBy(asc(ticketCarrierCases.openedAt)),
    filhosDoChamado(db, ctx, t.id),
    db.select({ id: ticketLinks.id, de: ticketLinks.fromId, para: ticketLinks.toId, tipo: ticketLinks.kind, createdAt: ticketLinks.createdAt })
      .from(ticketLinks).where(isNull(ticketLinks.deletedAt)).orderBy(asc(ticketLinks.createdAt)),
    // os chamados que a pessoa vê, em forma de nó (para o desenho e para saber quem pode aparecer)
    db.select({ id: tickets.id, code: tickets.code, title: tickets.title, kind: tickets.kind, stageId: tickets.stageId, panelId: tickets.panelId, parentId: tickets.parentId, problemId: tickets.problemId })
      .from(tickets).where(isNull(tickets.deletedAt)),
    integ.ler<{ sites: string[]; linkConversa: string }>(db, 'atendimento-integracoes'),
    lerAjustesLineChat(db),
  ]);

  const mapa = new Map<string, NoParaGrafo>();
  for (const n of nos) {
    if (!visiveis.has(n.panelId)) continue;
    mapa.set(n.id, {
      id: n.id, codigo: n.code, titulo: n.title, tipoChamado: n.kind as TipoChamado, paiId: n.parentId, problemaId: n.problemId,
      situacao: situacaoDaEtapa(ctx.etapas.get(n.stageId)?.etapa.tipo ?? 'andamento'),
    });
  }
  const minhasLigacoes = todasLigacoes.filter((l) => (l.de === t.id || l.para === t.id) && mapa.has(l.de === t.id ? l.para : l.de));
  const idsFilhos = nos.filter((n) => n.parentId === t.id && mapa.has(n.id)).map((n) => n.id);
  const idsIncidentes = nos.filter((n) => n.problemId === t.id && mapa.has(n.id)).map((n) => n.id);
  const idsLigados = minhasLigacoes.map((l) => (l.de === t.id ? l.para : l.de));
  const cartoes = await cartoesDe(db, ctx, [...new Set([t.id, ...idsFilhos, ...idsIncidentes, ...idsLigados])]);
  const cartao = cartoes.get(t.id)!;

  // as referências escritas no texto: do Gestor (se a pessoa vê), senão um card do LineChat antigo
  const codigos = referenciasNoTexto(t.customerReport, t.description, t.solution, t.cause, ...notas.map((n) => n.body)).filter((c) => c !== t.code);
  const [doGestor, doLineChat] = codigos.length
    ? await Promise.all([
      db.select({ id: tickets.id, code: tickets.code }).from(tickets).where(and(inArray(tickets.code, codigos), isNull(tickets.deletedAt))),
      db.select({ key: linechatCards.key, title: linechatCards.title, panelId: linechatCards.panelId, stepTitle: linechatCards.stepTitle }).from(linechatCards)
        .where(and(inArray(sql<string>`upper(${linechatCards.key})`, codigos), isNull(linechatCards.removedAt))),
    ])
    : [[], []];
  const appUrl = (lc.valor.appUrl || 'https://inglinechat.com.br').replace(/\/+$/, '');
  const referencias: ReferenciaMostrada[] = codigos.map((codigo) => {
    const g = doGestor.find((x) => x.code === codigo);
    const no = g ? mapa.get(g.id) : undefined;
    if (no) return { codigo, existe: true, titulo: no.titulo, situacao: no.situacao, id: no.id, url: null };
    const card = doLineChat.find((x) => (x.key ?? '').toUpperCase() === codigo);
    if (card?.key) return { codigo, existe: true, titulo: card.title || null, situacao: card.stepTitle, id: null, url: `${appUrl}/panels/${card.panelId}/card/${encodeURIComponent(card.key)}` };
    return { codigo, existe: false, titulo: null, situacao: null, id: null, url: null };
  });

  // as citações para o desenho: o que este chamado cita, e quem cita este chamado (no texto ou numa anotação)
  const padrao = `\\m${t.code}\\M`;
  const [citamNoTexto, citamNaAnotacao] = await Promise.all([
    db.select({ id: tickets.id }).from(tickets).where(and(isNull(tickets.deletedAt), ne(tickets.id, t.id),
      sql`concat_ws(' ', ${tickets.customerReport}, ${tickets.description}, ${tickets.solution}, ${tickets.cause}) ~ ${padrao}`)),
    db.selectDistinct({ id: ticketNotes.ticketId }).from(ticketNotes).where(and(isNull(ticketNotes.deletedAt), ne(ticketNotes.ticketId, t.id), sql`${ticketNotes.body} ~ ${padrao}`)),
  ]);
  const citacoes = [
    ...referencias.filter((r) => r.id).map((r) => ({ de: t.id, para: r.id! })),
    ...[...new Set([...citamNoTexto, ...citamNaAnotacao].map((c) => c.id))].map((id) => ({ de: id, para: t.id })),
  ];
  const grafo = grafoDeLigacoes(t.id, mapa, todasLigacoes.map((l) => ({ de: l.de, para: l.para, tipo: l.tipo as TipoLigacaoChamado })), citacoes);

  // a trajetória: a etapa em que nasceu (o evento "criado") e cada movimento depois
  const criado = eventos.find((e) => e.kind === 'criado');
  const dc = (criado?.data ?? {}) as Record<string, any>;
  const movimentos = eventos.filter((e) => e.kind === 'etapa');
  const primeiro = (movimentos[0]?.data ?? {}) as Record<string, any>;
  const etapaInicial = {
    nome: (dc.etapa as string | undefined) ?? (primeiro.de?.nome as string | undefined) ?? ctx.etapas.get(t.stageId)?.etapa.nome ?? '?',
    nivel: ((dc.etapaId ? ctx.etapas.get(dc.etapaId as string)?.etapa.nivel : primeiro.de?.nivel) ?? null) as Nivel | null,
  };
  const nomeDeQuem = (userId: string | null, actorName: string | null) => (userId ? pessoaCurta(ctx, userId)!.nome : actorName);
  const passos = trajetoria(t.createdAt.toISOString(), etapaInicial, movimentos.map((e) => {
    const d = (e.data ?? {}) as Record<string, any>;
    return { em: e.createdAt.toISOString(), para: { nome: d.para?.nome ?? '?', nivel: (d.para?.nivel ?? null) as Nivel | null }, motivo: d.motivo ?? null, por: nomeDeQuem(e.userId, e.actorName), sentido: d.sentido ?? null };
  }), ctx.agora);

  // o que falta para cada etapa e os filhos que travam
  const totalMinutos = tempo.reduce((s, i) => s + i.minutes, 0);
  const dados = dadosDaLinha(t, totalMinutos);
  const faltam = Object.fromEntries(painel.etapas.map((e) => [e.id, faltaParaEtapa(dados, e)]));
  const filhosTravam = Object.fromEntries(painel.etapas.map((e) => [e.id, filhosQueTravam(filhos, e, painel.ajustes.paiEsperaFilhos)]));

  const cuida = podeCuidar(ator);
  const meu = (userId: string | null) => ator.tipo === 'pessoa' && userId === ator.id;
  const anotacoesLista: AnotacaoChamado[] = notas.map((n) => ({
    id: n.id, texto: n.body, por: pessoaCurta(ctx, n.userId), porNome: n.actorName, em: n.createdAt.toISOString(),
    anexos: anexos.filter((a) => a.noteId === n.id).map((a) => ({
      id: a.id, nome: a.fileName, tipo: a.mimeType, tamanho: a.sizeBytes, imagem: IMAGENS_NA_TELA.includes(a.mimeType), url: `atendimento/anexos/${a.id}`,
    })),
    podeApagar: cuida || meu(n.userId),
  }));

  const operadora: CasoOperadora[] = casos.map((c) => {
    const hist = ((c.history as Caso[] | null) ?? []);
    const ultimaCobranca = [...hist].reverse().find((h) => h.acao === 'cobrou');
    const base = ultimaCobranca?.em ?? c.openedAt.toISOString();
    return {
      id: c.id, operadora: { id: c.carrierId, nome: c.carrierName }, protocolo: c.protocol, abertoEm: c.openedAt.toISOString(),
      prometidoPara: iso(c.promisedAt), cobrarACadaHoras: c.followUpHours,
      proximaCobrancaEm: c.status === 'aberto' && c.followUpHours ? new Date(Date.parse(base) + c.followUpHours * 3_600_000).toISOString() : null,
      situacao: c.status === 'fechado' ? 'fechado' : 'aberto', fechadoEm: iso(c.closedAt),
      andamentos: hist.map((h) => ({ em: h.em, por: h.porId ? pessoaCurta(ctx, h.porId)!.nome : h.porNome ?? null, texto: h.texto ?? '', acao: h.acao })),
    };
  });

  return {
    ...cartao,
    relato: t.customerReport, descricao: t.description, solucao: t.solution, causa: t.cause, contorno: t.workaround, validacao: t.validation,
    motivoPrioridade: t.priorityReason,
    // pelos campos que o painel usa: sem o alcance, só a gravidade; sem a gravidade, nenhuma (o que ficou guardado de antes não conta)
    prioridadeSugerida: prioridadeSugeridaDoPainel(painel.ajustes, t.severity as Gravidade | null, t.reach as Alcance | null, ctx.prazos),
    sessaoId: t.sessionId,
    conversaUrl: linkDaConversa(integracoes.valor.linkConversa, t.sessionId),
    checklist: (t.checklist as ItemChecklist[] | null) ?? [],
    observadores: t.watcherIds.map((id) => pessoaCurta(ctx, id)!),
    criadoPor: pessoaCurta(ctx, t.createdById),
    esperas: (t.waits as FichaChamado['esperas'] | null) ?? [],
    filhosLista: idsFilhos.map((id) => cartoes.get(id)).filter((c): c is CartaoChamado => !!c),
    incidentesLista: idsIncidentes.map((id) => cartoes.get(id)).filter((c): c is CartaoChamado => !!c),
    ligacoes: minhasLigacoes.flatMap((l) => {
      const deste = l.de === t.id;
      const outro = cartoes.get(deste ? l.para : l.de);
      const tipo = l.tipo as TipoLigacaoChamado;
      return outro ? [{ id: l.id, tipo, texto: deste ? NOME_LIGACAO[tipo].de : NOME_LIGACAO[tipo].para, chamado: outro }] : [];
    }),
    referencias,
    anotacoesLista,
    historico: eventos.map((e) => eventoParaTela(e, ctx)),
    tempo: {
      total: totalMinutos,
      itens: tempo.map((i) => ({ id: i.id, minutos: i.minutes, nota: i.note, dia: i.workedOn, por: pessoaCurta(ctx, i.userId), em: i.createdAt.toISOString(), podeApagar: cuida || meu(i.userId) })),
    },
    operadora,
    trajetoria: passos,
    faltam,
    filhosTravam,
    grafo,
    observando: ator.tipo === 'pessoa' && t.watcherIds.includes(ator.id),
    pode: { trabalhar: podeTrabalhar(ator), cuidar: cuida },
  };
}
