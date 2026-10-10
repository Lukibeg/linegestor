/**
 * OS AJUSTES DO MÓDULO DE CHAMADOS (Patch 1.10, decisão 0047): os painéis, as etapas de cada painel,
 * a árvore de assuntos, os prazos e os avisos (o WhatsApp dos chamados). É de quem cuida dos chamados
 * (`tickets.manage`). As respostas prontas e os agendados moram em outro arquivo (a rotina).
 *
 * As regras são as do `@gestor/shared` (as mesmas da prévia): o que um painel e uma etapa aceitam vem
 * dos schemas; a profundidade do assunto, de `nivelDoAssunto`; a lista colada, de `lerListaDeAssuntos`.
 * Aqui fica o que é do servidor: conferir o pedido contra o banco (a sigla que já existe, as pessoas,
 * o assunto irmão com o mesmo nome) e gravar junto o que precisa andar junto (a etapa que sai e os
 * chamados que estavam nela).
 *
 * Como no resto do módulo, quem grava a auditoria é a rota (é ela que sabe quem pediu e de onde):
 * cada função devolve o resultado e a frase da auditoria. A chave do WhatsApp nunca vai na frase nem
 * no "antes/depois".
 */
import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { newId, ticketPanels, ticketStages, ticketSubjects, tickets, users, type Db } from '@gestor/db';
import {
  assuntoEDescendentes, caminhoDoAssunto, etiquetasUnicas, lerListaDeAssuntos, MAX_NIVEL_ASSUNTO, nivelDoAssunto, paraBusca, situacaoDaEtapa,
  type AjustesPrazos, type Assunto, type AssuntoGravarSchema, type AvisosChamadosGravar, type AvisosChamadosTela, type EtapasGravarSchema,
  type Painel, type PainelGravarSchema, type TipoEtapa,
} from '@gestor/shared';
import { BadRequest, Conflict, NotFound } from '../../plugins/errors.js';
import * as integ from '../integracoes.js';
import { assuntoDaLinha, carregarPaineis, lerPrazos, painelDaLinha, registrarEvento, type Ator } from './contexto.js';
import { gravarTeste, lerAvisos, mandarWhatsApp, type AvisosGuardados } from './whatsapp.js';

type PainelGravar = z.infer<typeof PainelGravarSchema>;
type EtapasGravar = z.infer<typeof EtapasGravarSchema>;
type AssuntoGravar = z.infer<typeof AssuntoGravarSchema>;

/** O resultado de uma mudança e o que vai para a auditoria. */
export type Gravado<T> = { valor: T; resumo: string; antes?: unknown; depois?: unknown };

/** As etapas com que um painel novo nasce: o mínimo para funcionar (a equipe ajusta depois). */
export const ETAPAS_DO_PAINEL_NOVO: Array<{ nome: string; tipo: TipoEtapa }> = [
  { nome: 'Novo', tipo: 'entrada' },
  { nome: 'Em andamento', tipo: 'andamento' },
  { nome: 'Resolvido', tipo: 'resolvido' },
  { nome: 'Fechado', tipo: 'fechado' },
];

/** A mensagem do teste do WhatsApp (a mesma da prévia). */
export const TEXTO_DO_TESTE = 'Teste do Ingline Gestão: os avisos dos chamados vão chegar por aqui.';

const unicos = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

// =====================================================================
//  O QUE TODOS USAM
// =====================================================================

/** O painel (fora da lixeira), ou 404. */
async function linhaDoPainel(db: Db, id: string) {
  const [p] = await db.select().from(ticketPanels).where(and(eq(ticketPanels.id, id), isNull(ticketPanels.deletedAt))).limit(1);
  if (!p) throw new NotFound('Painel');
  return p;
}

/** O painel pronto para a tela, com as etapas e quantos chamados abertos ele tem. */
async function painelPronto(db: Db, id: string): Promise<Painel> {
  const { paineis } = await carregarPaineis(db);
  const p = paineis.find((x) => x.id === id);
  if (!p) throw new NotFound('Painel');
  return p;
}

/** As pessoas citadas (supervisores, quem vê o painel, quem a etapa avisa) precisam existir. */
async function conferirPessoas(db: Db, ids: string[]) {
  const pedidas = unicos(ids);
  if (!pedidas.length) return;
  const achadas = await db.select({ id: users.id }).from(users).where(inArray(users.id, pedidas));
  if (achadas.length !== pedidas.length) throw new BadRequest('Uma das pessoas escolhidas não existe mais. Recarregue a tela e escolha de novo.');
}

/** O painel no "antes/depois" da auditoria (sem as etapas, que têm a sua própria mudança). */
const painelParaAuditoria = (p: Painel) => ({
  nome: p.nome, sigla: p.sigla, descricao: p.descricao, cor: p.cor, acesso: p.acesso, pessoas: p.pessoas, ajustes: p.ajustes, ativo: p.ativo,
});

// =====================================================================
//  OS PAINÉIS
// =====================================================================

/**
 * Cria (sem `id`) ou muda um painel. A sigla é única para sempre — um painel que saiu continua dono
 * dos códigos dos chamados dele (SUP-12 não pode passar a ser de outro) — e não muda depois do
 * primeiro chamado. O painel novo nasce com as quatro etapas básicas.
 */
export async function gravarPainel(app: FastifyInstance, id: string | null, d: PainelGravar): Promise<Gravado<Painel>> {
  const db = app.db;
  const atual = id ? await linhaDoPainel(db, id) : null;
  const sigla = d.sigla;
  if (atual && atual.key !== sigla && atual.nextNumber > 1) {
    throw new BadRequest(`A sigla ${atual.key} não muda mais: o painel já tem chamados (${atual.key}-1 em diante).`);
  }
  const [dono] = await db.select({ id: ticketPanels.id, nome: ticketPanels.name, saiu: ticketPanels.deletedAt }).from(ticketPanels)
    .where(eq(ticketPanels.key, sigla)).limit(1);
  if (dono && dono.id !== atual?.id) {
    throw new Conflict(dono.saiu
      ? `A sigla ${sigla} foi do painel ${dono.nome}, que saiu: os chamados dele ainda usam esses códigos. Escolha outra.`
      : `A sigla ${sigla} já é de outro painel.`);
  }
  const pessoas = unicos(d.pessoas);
  const ajustes = {
    ...d.ajustes,
    // as opções do Tipo sem repetir (sem ligar para maiúscula e acento)
    tipos: etiquetasUnicas(d.ajustes.tipos),
    supervisores: unicos(d.ajustes.supervisores),
    obrigatoriosAoAbrir: [...new Set(d.ajustes.obrigatoriosAoAbrir)],
  };
  await conferirPessoas(db, [...pessoas, ...ajustes.supervisores]);
  const campos = { name: d.nome, key: sigla, description: d.descricao, color: d.cor, access: d.acesso, memberIds: pessoas, settings: ajustes, active: d.ativo };

  if (!atual) {
    const novoId = newId();
    await db.transaction(async (tx) => {
      const [ultimo] = await tx.select({ n: sql<number>`coalesce(max(${ticketPanels.sortOrder}), -1)::int` }).from(ticketPanels);
      await tx.insert(ticketPanels).values({ id: novoId, ...campos, sortOrder: Number(ultimo?.n ?? -1) + 1 });
      await tx.insert(ticketStages).values(ETAPAS_DO_PAINEL_NOVO.map((e, i) => ({ id: newId(), panelId: novoId, name: e.nome, kind: e.tipo, level: null, sortOrder: i })));
    });
    const painel = await painelPronto(db, novoId);
    return { valor: painel, resumo: `Criou o painel ${painel.nome} (${painel.sigla})`, depois: painelParaAuditoria(painel) };
  }

  const antes = painelParaAuditoria(painelDaLinha(atual, []));
  await db.update(ticketPanels).set({ ...campos, updatedAt: new Date() }).where(eq(ticketPanels.id, atual.id));
  const painel = await painelPronto(db, atual.id);
  const mudancas = [
    antes.nome !== painel.nome ? `antes se chamava ${antes.nome}` : '',
    antes.sigla !== painel.sigla ? `a sigla era ${antes.sigla}` : '',
    antes.ativo !== painel.ativo ? (painel.ativo ? 'reativou' : 'desativou') : '',
  ].filter(Boolean);
  return {
    valor: painel,
    resumo: `Alterou o painel ${painel.nome} (${painel.sigla})${mudancas.length ? `: ${mudancas.join(', ')}` : ''}`,
    antes, depois: painelParaAuditoria(painel),
  };
}

/**
 * Tira o painel (vai para a lixeira, `deletedAt`). Só sem chamados por fechar: o resolvido também
 * conta, porque ainda espera o cliente (e o "fecha sozinho") — num painel que saiu, ele ficaria
 * esquecido. E o módulo não fica sem painel nenhum (o robô abre no primeiro painel ativo).
 */
export async function removerPainel(app: FastifyInstance, id: string): Promise<Gravado<{ ok: true }>> {
  const db = app.db;
  const p = await linhaDoPainel(db, id);
  const [abertos] = await db.select({ n: sql<number>`count(*)::int` }).from(tickets)
    .innerJoin(ticketStages, eq(ticketStages.id, tickets.stageId))
    .where(and(eq(tickets.panelId, id), isNull(tickets.deletedAt), inArray(ticketStages.kind, ['entrada', 'andamento', 'resolvido'])));
  const n = Number(abertos?.n ?? 0);
  if (n) {
    throw new BadRequest(
      `O painel ${p.name} ainda tem ${plural(n, 'chamado que não foi fechado', 'chamados que não foram fechados')}. Feche ou passe para outro painel antes de tirar o painel.`,
      { naoFechados: n },
    );
  }
  const [outros] = await db.select({ n: sql<number>`count(*)::int` }).from(ticketPanels).where(and(isNull(ticketPanels.deletedAt), ne(ticketPanels.id, id)));
  if (!Number(outros?.n ?? 0)) throw new BadRequest('O módulo precisa de pelo menos um painel: crie outro antes de tirar este.');
  const agora = new Date();
  await db.update(ticketPanels).set({ deletedAt: agora, updatedAt: agora }).where(eq(ticketPanels.id, id));
  return { valor: { ok: true }, resumo: `Tirou o painel ${p.name} (${p.key})` };
}

// =====================================================================
//  AS ETAPAS
// =====================================================================

/**
 * As datas que acompanham a situação nova do chamado (as mesmas contas do mover): resolvido ganha a
 * data de resolvido; fechado, a de fechado; voltar a ficar aberto limpa as duas. Sem isso, um chamado
 * "Em andamento" com data de resolvido teria o prazo de solução cumprido, e um "Resolvido" sem data
 * nunca fecharia sozinho.
 */
function datasDaSituacao(tipo: TipoEtapa, agora: Date) {
  const s = situacaoDaEtapa(tipo);
  if (s === 'resolvido') return { resolvedAt: sql`coalesce(${tickets.resolvedAt}, ${agora})`, closedAt: null };
  if (s === 'fechado') return { closedAt: agora, resolvedAt: sql`coalesce(${tickets.resolvedAt}, ${agora})` };
  return { resolvedAt: null, closedAt: null };
}

/**
 * Grava as etapas do painel, na ordem da lista: as que vêm com id ficam (nome, tipo, nível, ordem,
 * obrigatórios, quem avisar), as sem id entram e as que não vieram saem (`deletedAt`). A etapa que
 * sai com chamados precisa de um destino (uma das que ficam): os chamados vão para lá, com o
 * histórico dizendo por quê. Tudo numa transação: nenhum chamado fica numa etapa que não existe.
 *
 * O que NÃO acontece nesse movimento (é arrumação do painel, não trabalho no chamado): não confere os
 * obrigatórios do destino, não conta como primeira resposta nem como "reaberto", não avisa a equipe
 * e não dispara webhook — mudar 300 fechados de etapa não pode virar 300 mensagens.
 */
export async function salvarEtapas(app: FastifyInstance, ator: Ator, painelId: string, d: EtapasGravar): Promise<Gravado<Painel>> {
  const db = app.db;
  const p = await linhaDoPainel(db, painelId);
  const atuais = await db.select().from(ticketStages)
    .where(and(eq(ticketStages.panelId, painelId), isNull(ticketStages.deletedAt))).orderBy(asc(ticketStages.sortOrder));
  const porId = new Map(atuais.map((e) => [e.id, e]));

  // as que vêm com id são deste painel, uma vez só
  const ficam = new Set<string>();
  for (const e of d.etapas) {
    if (!e.id) continue;
    if (!porId.has(e.id)) throw new BadRequest(`A etapa ${e.nome} não é deste painel (ou já saiu). Recarregue a tela e tente de novo.`);
    if (ficam.has(e.id)) throw new BadRequest(`A etapa ${e.nome} apareceu duas vezes na lista.`);
    ficam.add(e.id);
  }
  // as novas ganham o id já aqui (para a resposta e para o destino dos chamados da lixeira)
  const novas = d.etapas.map((e, ordem) => ({
    id: e.id ?? newId(), nova: !e.id, ordem, nome: e.nome, tipo: e.tipo, nivel: e.nivel,
    obrigatorios: [...new Set(e.obrigatorios)], avisar: unicos(e.avisar),
  }));
  await conferirPessoas(db, novas.flatMap((e) => e.avisar));

  // as que saem: com chamados (fora da lixeira, que é o que a equipe vê), precisam de destino
  const saem = atuais.filter((e) => !ficam.has(e.id));
  const contagem = saem.length
    ? await db.select({ stageId: tickets.stageId, n: sql<number>`count(*)::int` }).from(tickets)
      .where(and(inArray(tickets.stageId, saem.map((e) => e.id)), isNull(tickets.deletedAt))).groupBy(tickets.stageId)
    : [];
  const chamadosEm = new Map(contagem.map((c) => [c.stageId, Number(c.n)]));
  const semDestino = saem
    .map((e) => ({ id: e.id, nome: e.name, chamados: chamadosEm.get(e.id) ?? 0 }))
    .filter((e) => e.chamados > 0 && !ficam.has(d.destino[e.id] ?? ''));
  if (semDestino.length) {
    throw new BadRequest(
      semDestino.map((e) => `A etapa ${e.nome} tem ${plural(e.chamados, 'chamado', 'chamados')}: escolha para onde ${e.chamados === 1 ? 'ele vai' : 'eles vão'}.`).join(' '),
      { etapas: semDestino },
    );
  }

  const agora = new Date();
  const finais = new Map(novas.map((e) => [e.id, e]));
  /** Sem destino escolhido (a etapa só tinha chamados na lixeira): uma do mesmo tipo, senão a de entrada. */
  const destinoDe = (e: (typeof saem)[number]) =>
    finais.get(d.destino[e.id] ?? '') ?? novas.find((x) => x.tipo === e.kind) ?? novas.find((x) => x.tipo === 'entrada') ?? novas[0]!;
  const movidos: Array<{ de: string; para: string; n: number }> = [];

  await db.transaction(async (tx) => {
    for (const e of novas) {
      const campos = { name: e.nome, kind: e.tipo, level: e.nivel, sortOrder: e.ordem, requiredFields: e.obrigatorios, notifyUserIds: e.avisar };
      if (e.nova) await tx.insert(ticketStages).values({ id: e.id, panelId: painelId, ...campos });
      else await tx.update(ticketStages).set(campos).where(eq(ticketStages.id, e.id));
    }
    // a etapa que mudou de tipo muda o que os chamados dela são (aberto, resolvido, fechado): as datas acompanham
    for (const e of novas) {
      const antes = porId.get(e.id);
      if (antes && situacaoDaEtapa(antes.kind as TipoEtapa) !== situacaoDaEtapa(e.tipo)) {
        await tx.update(tickets).set({ ...datasDaSituacao(e.tipo, agora), updatedAt: agora }).where(eq(tickets.stageId, e.id));
      }
    }
    // os chamados das que saem vão para o destino (os da lixeira também: restaurados, voltam para uma etapa que existe)
    for (const e of saem) {
      const para = destinoDe(e);
      const linhas = await tx.select({ id: tickets.id, deletedAt: tickets.deletedAt }).from(tickets).where(eq(tickets.stageId, e.id));
      if (linhas.length) {
        const mudaSituacao = situacaoDaEtapa(e.kind as TipoEtapa) !== situacaoDaEtapa(para.tipo);
        await tx.update(tickets).set({ stageId: para.id, updatedAt: agora, ...(mudaSituacao ? datasDaSituacao(para.tipo, agora) : {}) })
          .where(eq(tickets.stageId, e.id));
        for (const t of linhas) {
          await registrarEvento(tx, t.id, 'etapa', ator, {
            de: { id: e.id, nome: e.name, nivel: e.level }, para: { id: para.id, nome: para.nome, nivel: para.nivel },
            motivo: `a etapa ${e.name} saiu do painel`, sentido: null,
          }, agora);
        }
        const vivos = linhas.filter((t) => !t.deletedAt).length;
        if (vivos) movidos.push({ de: e.name, para: para.nome, n: vivos });
      }
      await tx.update(ticketStages).set({ deletedAt: agora }).where(eq(ticketStages.id, e.id));
    }
    await tx.update(ticketPanels).set({ updatedAt: agora }).where(eq(ticketPanels.id, painelId));
  });

  const entraram = novas.filter((e) => e.nova).map((e) => e.nome);
  const renomeadas = novas.filter((e) => !e.nova && porId.get(e.id)!.name !== e.nome).map((e) => `${porId.get(e.id)!.name} → ${e.nome}`);
  const partes = [
    entraram.length ? `entrou ${lista(entraram)}` : '',
    saem.length ? `saiu ${lista(saem.map((e) => e.name))}` : '',
    renomeadas.length ? `renomeou ${lista(renomeadas)}` : '',
    ...movidos.map((m) => `${plural(m.n, 'chamado foi', 'chamados foram')} de ${m.de} para ${m.para}`),
  ].filter(Boolean);
  const etapaParaAuditoria = (e: { nome: string; tipo: string; nivel: number | null; obrigatorios: string[]; avisar: string[] }) =>
    ({ nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: e.obrigatorios, avisar: e.avisar });
  return {
    valor: await painelPronto(db, painelId),
    resumo: `Mudou as etapas do painel ${p.name}${partes.length ? `: ${partes.join('; ')}` : ''}`,
    antes: atuais.map((e) => etapaParaAuditoria({ nome: e.name, tipo: e.kind, nivel: e.level, obrigatorios: e.requiredFields, avisar: e.notifyUserIds })),
    depois: novas.map(etapaParaAuditoria),
  };
}

// =====================================================================
//  OS ASSUNTOS (a árvore de até 3 níveis)
// =====================================================================

async function assuntosDoPainel(db: Db, painelId: string): Promise<Assunto[]> {
  return (await db.select().from(ticketSubjects).where(eq(ticketSubjects.panelId, painelId))).map(assuntoDaLinha);
}

/** Quantos níveis a árvore de um assunto ocupa (1 = ele sozinho). */
function alturaDoAssunto(id: string, todos: Assunto[], n = 0): number {
  if (n > 10) return 1;
  const filhos = todos.filter((a) => a.paiId === id);
  return 1 + Math.max(0, ...filhos.map((f) => alturaDoAssunto(f.id, todos, n + 1)));
}

/** O caminho do assunto em pedaços ("Ramal", "Configuração"), do de cima para baixo. */
function partesDoCaminho(id: string, porId: Map<string, Assunto>): string[] {
  const partes: string[] = [];
  for (let a = porId.get(id), n = 0; a && n < 10; n++) { partes.unshift(a.nome); a = a.paiId ? porId.get(a.paiId) : undefined; }
  return partes;
}

/**
 * Confere o lugar do assunto na árvore: o de cima é do mesmo painel, não faz círculo, a árvore não
 * passa de 3 níveis (contando os que já estão embaixo dele) e não há irmão com o mesmo nome (sem
 * ligar para maiúscula e acento: "Configuracao" e "Configuração" são o mesmo assunto).
 */
function conferirLugar(todos: Assunto[], id: string | null, d: AssuntoGravar) {
  if (d.paiId) {
    if (d.paiId === id) throw new BadRequest('Um assunto não pode ficar dentro dele mesmo.');
    if (!todos.some((a) => a.id === d.paiId)) throw new BadRequest('O assunto de cima precisa ser deste mesmo painel.');
    if (id && assuntoEDescendentes(id, todos).has(d.paiId)) {
      throw new BadRequest(`Isso faria um círculo: ${caminhoDoAssunto(d.paiId, todos)} está dentro deste assunto.`);
    }
  }
  const altura = id ? alturaDoAssunto(id, todos) : 1;
  if (nivelDoAssunto(d.paiId, todos) + altura > MAX_NIVEL_ASSUNTO) {
    throw new BadRequest(`Os assuntos vão até ${MAX_NIVEL_ASSUNTO} níveis (como Ramal › Configuração › Identidade)${altura > 1 ? `, e ${d.nome} tem assuntos embaixo dele` : ''}.`);
  }
  const igual = todos.find((a) => a.id !== id && a.paiId === d.paiId && paraBusca(a.nome) === paraBusca(d.nome));
  if (igual) throw new Conflict(`Já existe o assunto ${caminhoDoAssunto(igual.id, todos)} neste painel.`);
}

const proximaOrdem = (irmaos: Assunto[]) => Math.max(-1, ...irmaos.map((a) => a.ordem)) + 1;
const assuntoParaAuditoria = (a: Assunto) => ({ nome: a.nome, paiId: a.paiId, descricao: a.descricao, ativo: a.ativo, checklist: a.checklist, dePara: a.dePara });

export async function criarAssunto(app: FastifyInstance, painelId: string, d: AssuntoGravar): Promise<Gravado<Assunto>> {
  const db = app.db;
  const p = await linhaDoPainel(db, painelId);
  const todos = await assuntosDoPainel(db, painelId);
  conferirLugar(todos, null, d);
  const [linha] = await db.insert(ticketSubjects).values({
    id: newId(), panelId: painelId, parentId: d.paiId, name: d.nome, description: d.descricao, active: d.ativo,
    sortOrder: proximaOrdem(todos.filter((a) => a.paiId === d.paiId)), checklist: unicos(d.checklist), aliases: unicos(d.dePara),
  }).returning();
  const a = assuntoDaLinha(linha!);
  return { valor: a, resumo: `Criou o assunto ${caminhoDoAssunto(a.id, [...todos, a])} no painel ${p.name}`, depois: assuntoParaAuditoria(a) };
}

export async function alterarAssunto(app: FastifyInstance, id: string, d: AssuntoGravar): Promise<Gravado<Assunto>> {
  const db = app.db;
  const [linha] = await db.select().from(ticketSubjects).where(eq(ticketSubjects.id, id)).limit(1);
  if (!linha) throw new NotFound('Assunto');
  // o assunto de um painel que saiu saiu junto
  const p = await linhaDoPainel(db, linha.panelId).catch(() => { throw new NotFound('Assunto'); });
  const todos = await assuntosDoPainel(db, linha.panelId);
  conferirLugar(todos, id, d);
  const antes = assuntoDaLinha(linha);
  const mudouDeLugar = antes.paiId !== d.paiId;
  const [nova] = await db.update(ticketSubjects).set({
    parentId: d.paiId, name: d.nome, description: d.descricao, active: d.ativo, checklist: unicos(d.checklist), aliases: unicos(d.dePara),
    // mudou de lugar na árvore: vai para o fim da lista dos irmãos novos
    ...(mudouDeLugar ? { sortOrder: proximaOrdem(todos.filter((a) => a.paiId === d.paiId && a.id !== id)) } : {}),
    updatedAt: new Date(),
  }).where(eq(ticketSubjects.id, id)).returning();
  const a = assuntoDaLinha(nova!);
  const depoisDaArvore = todos.map((x) => (x.id === id ? a : x));
  const caminhoAntes = caminhoDoAssunto(id, todos);
  const caminhoDepois = caminhoDoAssunto(id, depoisDaArvore);
  const como = antes.ativo !== a.ativo ? (a.ativo ? 'Reativou' : 'Desativou') : 'Alterou';
  return {
    valor: a,
    resumo: `${como} o assunto ${caminhoDepois} no painel ${p.name}${caminhoAntes !== caminhoDepois ? ` (antes: ${caminhoAntes})` : ''}`,
    antes: assuntoParaAuditoria(antes), depois: assuntoParaAuditoria(a),
  };
}

/**
 * A lista colada vira a árvore de uma vez (quando a lista nova da equipe fechar): `lerListaDeAssuntos`
 * lê o texto ("Ramal - Configuração - Identidade", um por linha); aqui cada assunto é achado pelo
 * caminho (sem ligar para maiúscula e acento) e só o que falta é criado. Os que já existem não mudam.
 */
export async function colarAssuntos(app: FastifyInstance, painelId: string, texto: string): Promise<Gravado<{ criados: number; jaExistiam: number }>> {
  const db = app.db;
  const p = await linhaDoPainel(db, painelId);
  // um nome do caminho longo demais (mais de 80 letras) não vira assunto: a linha inteira fica de fora
  const itens = lerListaDeAssuntos(texto).filter((i) => i.caminho.every((x) => x.length <= 80));
  if (!itens.length) throw new BadRequest('Não achei nenhum assunto no texto. Cole um por linha, como "Ramal - Configuração - Identidade".');
  let criados = 0;
  let jaExistiam = 0;
  const novos: string[] = [];
  await db.transaction(async (tx) => {
    const todos = (await tx.select().from(ticketSubjects).where(eq(ticketSubjects.panelId, painelId))).map(assuntoDaLinha);
    const porId = new Map(todos.map((a) => [a.id, a]));
    const chave = (partes: string[]) => partes.map((x) => paraBusca(x)).join('\n');
    const porCaminho = new Map<string, string>();
    for (const a of todos) {
      const c = chave(partesDoCaminho(a.id, porId));
      if (!porCaminho.has(c)) porCaminho.set(c, a.id);
    }
    const ordens = new Map<string | null, number>();
    const proxima = (pai: string | null) => {
      const n = ordens.get(pai) ?? proximaOrdem(todos.filter((a) => a.paiId === pai));
      ordens.set(pai, n + 1);
      return n;
    };
    const criar = async (partes: string[], paiId: string | null, descricao: string | null) => {
      const id = newId();
      await tx.insert(ticketSubjects).values({ id, panelId: painelId, parentId: paiId, name: partes[partes.length - 1]!, description: descricao, sortOrder: proxima(paiId) });
      porCaminho.set(chave(partes), id);
      novos.push(partes.join(' › '));
      criados++;
      return id;
    };
    for (const item of itens) {
      // os pais vêm antes dos filhos na lista; se algum faltar, é criado aqui (nada se perde)
      let paiId: string | null = null;
      for (let i = 1; i <= item.caminho.length; i++) {
        const partes = item.caminho.slice(0, i);
        paiId = porCaminho.get(chave(partes)) ?? await criar(partes, paiId, null);
      }
      const partes = [...item.caminho, item.nome];
      if (porCaminho.has(chave(partes))) { jaExistiam++; continue; }
      await criar(partes, paiId, item.descricao);
    }
  });
  return {
    valor: { criados, jaExistiam },
    resumo: `Colou a lista de assuntos no painel ${p.name}: ${plural(criados, 'criado', 'criados')}, ${plural(jaExistiam, 'já existia', 'já existiam')}`,
    depois: { criados: novos },
  };
}

// =====================================================================
//  OS PRAZOS
// =====================================================================

export { lerPrazos };

/** Grava o horário, os feriados (em ordem de data), os prazos por prioridade e a matriz da prioridade sugerida. */
export async function gravarPrazos(app: FastifyInstance, d: AjustesPrazos, userId: string): Promise<Gravado<AjustesPrazos>> {
  const antes = await lerPrazos(app.db);
  const novo: AjustesPrazos = { ...d, calendario: { ...d.calendario, feriados: [...d.calendario.feriados].sort((a, b) => a.data.localeCompare(b.data)) } };
  await integ.gravar(app.db, 'atendimento-prazos', novo, { userId });
  const depois = await lerPrazos(app.db);
  const mudou = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  const partes = [
    mudou(antes.calendario.horario, depois.calendario.horario) ? 'o horário de atendimento' : '',
    mudou(antes.calendario.feriados, depois.calendario.feriados) ? 'os feriados' : '',
    mudou(antes.prazos, depois.prazos) ? 'os prazos por prioridade' : '',
    mudou(antes.matriz, depois.matriz) ? 'a prioridade sugerida' : '',
    antes.alertaPercentual !== depois.alertaPercentual ? `o aviso de prazo (${depois.alertaPercentual}%)` : '',
    antes.semDonoMinutos !== depois.semDonoMinutos ? `o aviso de sem responsável (${depois.semDonoMinutos} min)` : '',
  ].filter(Boolean);
  return {
    valor: depois,
    resumo: partes.length ? `Mudou os prazos dos chamados: ${lista(partes)}` : 'Salvou os prazos dos chamados sem mudanças',
    antes, depois,
  };
}

// =====================================================================
//  OS AVISOS (o WhatsApp dos chamados)
// =====================================================================

/** Os ajustes do WhatsApp para a tela: as pessoas são todos os usuários ativos, com o número guardado (ou vazio). */
export async function avisosParaTela(app: FastifyInstance): Promise<AvisosChamadosTela> {
  const db = app.db;
  const [{ valor: v, temChavePropria }, linechat, ativos] = await Promise.all([
    lerAvisos(db),
    integ.ler(db, 'linechat'),
    db.select({ id: users.id, nome: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name)),
  ]);
  // campo a campo, de propósito: o que estiver guardado a mais nunca chega à tela
  return {
    ativo: v.ativo, url: v.url, usarChaveDoLineChat: v.usarChaveDoLineChat, numeroCliente: v.numeroCliente, numeroEquipe: v.numeroEquipe,
    modeloCliente: v.modeloCliente, template: v.template, eventos: v.eventos,
    temChavePropria, temChaveLineChat: linechat.temSegredo,
    pessoas: ativos.map((u) => {
      const p = v.pessoas.find((x) => x.userId === u.id);
      // sem número guardado, a pessoa já vem marcada: pôr o número é querer receber
      return { userId: u.id, nome: u.nome, numero: p?.numero ?? '', ativo: p?.ativo ?? true };
    }),
    ultimoTesteEm: v.ultimoTesteEm, ultimoTesteOk: v.ultimoTesteOk, ultimoTesteMsg: v.ultimoTesteMsg,
  };
}

/** O que vai para a auditoria: tudo, menos a chave (que nem fica guardada aqui: está no cofre). */
const avisosParaAuditoria = (v: Omit<AvisosGuardados, 'ultimoTesteEm' | 'ultimoTesteOk' | 'ultimoTesteMsg'>) => ({
  ativo: v.ativo, url: v.url, usarChaveDoLineChat: v.usarChaveDoLineChat, numeroCliente: v.numeroCliente, numeroEquipe: v.numeroEquipe,
  modeloCliente: v.modeloCliente, template: v.template, eventos: v.eventos, pessoas: v.pessoas,
});

/**
 * Grava os ajustes do WhatsApp. A chave própria, quando vem, vai para o cofre (na linha
 * `atendimento-avisos`); sem chave, fica a que já estava guardada.
 */
export async function gravarAvisos(app: FastifyInstance, d: AvisosChamadosGravar, userId: string): Promise<Gravado<AvisosChamadosTela>> {
  const db = app.db;
  const { valor } = await lerAvisos(db);
  const ids = unicos(d.pessoas.map((p) => p.userId));
  const [existentes, ativos] = await Promise.all([
    ids.length ? db.select({ id: users.id }).from(users).where(inArray(users.id, ids)) : Promise.resolve([]),
    db.select({ id: users.id }).from(users).where(eq(users.active, true)),
  ]);
  if (existentes.length !== ids.length) throw new BadRequest('Uma das pessoas da lista não existe mais. Recarregue a tela e tente de novo.');
  const naTela = new Set(ativos.map((u) => u.id));
  const pessoas = [
    ...[...new Map(d.pessoas.map((p) => [p.userId, { userId: p.userId, numero: p.numero, ativo: p.ativo }])).values()],
    // quem está desativado não aparece na tela: o número que tinha fica guardado (se voltar, volta com ele)
    ...valor.pessoas.filter((p) => !naTela.has(p.userId) && !ids.includes(p.userId)),
  ];
  let secretId: string | undefined;
  if (d.chave) {
    const { secretId: atual } = await integ.ler(db, 'atendimento-avisos');
    secretId = await app.vault.save(db, { existingId: atual, label: 'Chave da API do WhatsApp dos chamados', plain: d.chave, userId });
  }
  const novo: AvisosGuardados = {
    ...valor,
    ativo: d.ativo, url: d.url, usarChaveDoLineChat: d.usarChaveDoLineChat, numeroCliente: d.numeroCliente, numeroEquipe: d.numeroEquipe,
    modeloCliente: d.modeloCliente, template: d.template?.id ? d.template : null, eventos: d.eventos, pessoas,
  };
  await integ.gravar(db, 'atendimento-avisos', novo, { secretId, userId });
  return {
    valor: await avisosParaTela(app),
    resumo: `${d.ativo ? 'Ligou' : 'Desligou'} o WhatsApp dos chamados${d.chave ? ' e trocou a chave da API' : ''}`,
    antes: avisosParaAuditoria(valor), depois: avisosParaAuditoria(novo),
  };
}

/**
 * Manda a mensagem de teste: para o número digitado, ou para o WhatsApp guardado de uma pessoa (sem
 * ninguém escolhido, o de quem pediu). `de`: o número da equipe (padrão) ou o oficial, do cliente. O
 * resultado fica guardado para a tela mostrar ("último teste").
 */
export async function testarAvisos(
  app: FastifyInstance, d: { de?: 'cliente' | 'equipe'; userId?: string; numero?: string }, quem: { id: string },
): Promise<{ ok: boolean; mensagem: string; para: string }> {
  const { valor } = await lerAvisos(app.db);
  let para = d.numero?.trim() ?? '';
  if (!para) {
    const p = valor.pessoas.find((x) => x.userId === (d.userId || quem.id) && x.numero);
    if (!p) {
      throw new BadRequest(d.userId
        ? 'Essa pessoa não tem WhatsApp nos avisos. Salve o número dela antes de testar.'
        : 'Escolha uma pessoa com WhatsApp nos avisos (ou digite um número) para o teste.');
    }
    para = p.numero;
  }
  const r = await mandarWhatsApp(app.db, app.vault, { de: d.de ?? 'equipe', para, texto: TEXTO_DO_TESTE });
  await gravarTeste(app.db, r.ok, r.mensagem);
  return { ok: r.ok, mensagem: r.mensagem, para };
}
