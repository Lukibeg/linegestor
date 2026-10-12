/**
 * OS CHAMADOS DO GESTOR — o trabalho num chamado (Patch 1.10, decisão 0047): abrir, alterar, mover
 * (e escalonar), assumir, esperar, reabrir, trocar de painel, anotar com anexos, ligar a outro
 * chamado, o pai e o problema, o checklist, o tempo, a operadora, avisar o cliente, a resposta pronta,
 * acompanhar e a lixeira.
 *
 * As regras moram no `@gestor/shared` (as mesmas da prévia); aqui fica o que é do servidor: conferir
 * o pedido contra o banco, gravar o chamado e o histórico juntos (numa transação quando o número ou
 * várias linhas precisam andar juntos) e, depois de gravado, avisar a equipe (o sininho e o WhatsApp)
 * e os webhooks — fora da transação, para um aviso lento nunca segurar o banco.
 *
 * Quem age é um `Ator`: a pessoa (pela sessão) ou a integração (a chave de API do robô e do n8n). As
 * regras valem igual para os dois. Cada mudança devolve um `Feito` com a frase da auditoria: quem grava
 * a auditoria é a rota, porque é ela que sabe quem pediu e de onde.
 *
 * Para a entrada das integrações, o agendado e o relógio, o contrato combinado é `criarChamado`,
 * `alterarChamado`, `moverChamado`, `anotarChamado`, `reabrirChamado` e `fichaDoChamado` (no fim do
 * arquivo): as mesmas regras, sem o `Feito` (quem chama escreve a própria auditoria).
 */
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  clients, newId, products, ticketAttachments, ticketCarrierCases, ticketContacts, ticketLinks, ticketMacros, ticketNotes, ticketPanels,
  ticketTimeEntries, tickets,
  type Db,
} from '@gestor/db';
import {
  caminhoDoAssunto, campoLigado, chaveDoCampo, codigoDoChamado, diaLocal, duracaoDoPrazo, etapaAoAssumir, etapaAoReabrir, etapaDeEntrada, etiquetasUnicas,
  faltaParaAbrir, faltaParaEtapa, filhosQueTravam, lerCamposDoPedido, mensagemDoQueFalta, mesmoValorDoCampo, movimentoDeNivel, NOME_ALCANCE, NOME_CAMPO,
  NOME_ESPERA, NOME_GRAVIDADE, NOME_LIGACAO, numeroWhatsApp, paraBusca, preencherModelo, prioridadeSugeridaDoPainel, situacaoDaEtapa, textoDoValor,
  type Alcance, type CampoDoSistema, type ChamadoAlterar, type ChamadoCriar, type DadosObrigatorios, type Espera, type EtapaPainel, type Gravidade,
  type ItemChecklist, type Origem, type Painel, type Prioridade, type SituacaoDoChamado, type TipoEspera, type TipoEvento, type TipoLigacaoChamado,
  type ValoresDosCampos,
} from '@gestor/shared';
import { BadRequest, Conflict, Forbidden, NotFound } from '../../plugins/errors.js';
import { lerConteudo } from '../projects.js';
import { tipoDaImagem } from '../portal.js';
import { avisarEquipe, avisarObservadores, trecho } from './avisos.js';
import {
  camposDoPainel, carregarContexto, chamadoVisivel, esperaAberta, exigirTrabalhar, integracaoDoAtor, pessoaCurta, pessoaDoAtor, podeCuidar, podeVerPainel,
  registrarEvento, tocar, type Ator, type Contexto, type LinhaChamado,
} from './contexto.js';
import { dadosDaLinha, filhosDoChamado, IMAGENS_NA_TELA, lerAcao, minutosGastos } from './leitura.js';
import { emitir } from './webhooks.js';
import { lerAvisos, mandarWhatsApp } from './whatsapp.js';

export { fichaDoChamado } from './leitura.js';

/** O que uma mudança devolve à rota: o chamado e a frase da auditoria. */
export type Feito = {
  id: string;
  codigo: string;
  titulo: string;
  /** a frase da auditoria ("Escalonou SUP-12 de N1 para N2: …"); nula quando nada mudou (nada a registrar) */
  resumo: string | null;
  antes?: unknown;
  depois?: unknown;
  /** a ação ficou registrada, mas não deu certo (o WhatsApp recusou): a rota audita e devolve 400 com isto */
  erro?: string;
};

type SetChamado = Partial<typeof tickets.$inferInsert>;

/** O chamado carregado para uma ação: o contexto (nomes, prazos), a linha, o painel e a etapa de agora. */
type Estado = { ctx: Contexto; t: LinhaChamado; painel: Painel; etapa: EtapaPainel | null; agora: Date; quando: () => Date };

/**
 * As horas dos eventos de uma ação: a primeira é `agora` e cada uma das seguintes vem um milésimo
 * depois. Dentro de uma transação o `now()` do banco é o mesmo para todas as linhas; assim o
 * histórico fica na ordem em que as coisas aconteceram (a etapa antes do "reabriu", por exemplo).
 */
function relogio(agora: Date) {
  let n = 0;
  return () => new Date(agora.getTime() + n++);
}

async function carregar(app: FastifyInstance, ator: Ator, ref: string, opts: { lixeira?: boolean } = {}): Promise<Estado> {
  const agora = new Date();
  const ctx = await carregarContexto(app.db, agora);
  const t = await chamadoVisivel(app.db, ref, ator, ctx, opts);
  const painel = ctx.paineis.find((p) => p.id === t.panelId)!;
  return { ctx, t, painel, etapa: ctx.etapas.get(t.stageId)?.etapa ?? null, agora, quando: relogio(agora) };
}

const nada = (t: Pick<LinhaChamado, 'id' | 'code' | 'title'>): Feito => ({ id: t.id, codigo: t.code, titulo: t.title, resumo: null });
const curto = (t: Pick<LinhaChamado, 'id' | 'code' | 'title'>) => ({ id: t.id, codigo: t.code, titulo: t.title });

type ParaObservar = Pick<LinhaChamado, 'id' | 'code' | 'title' | 'watcherIds'>;
/** Os observadores recebem o que aconteceu (quem fez, não). */
const contarAosObservadores = (app: FastifyInstance, ator: Ator, t: ParaObservar, texto: string) =>
  avisarObservadores(app, { chamado: curto(t), observadores: t.watcherIds, texto, menos: pessoaDoAtor(ator) });
/** ...e o que mudou nele (num aviso só, enquanto não for lido). */
const camposAosObservadores = (app: FastifyInstance, ator: Ator, t: ParaObservar, nomes: string[]) =>
  avisarObservadores(app, { chamado: curto(t), observadores: t.watcherIds, menos: pessoaDoAtor(ator), campos: { quem: ator.nome, nomes } });
const etapaCurta = (e: EtapaPainel | null) => (e ? { id: e.id, nome: e.nome, nivel: e.nivel } : null);

// ---------- os nomes legíveis (o histórico mostra o que a pessoa vê na tela, não o id) ----------

const NOME_TITULO = 'Título';
const NOME_CONTORNO = 'Solução de contorno';
const NOME_TELEFONE = 'WhatsApp do contato';
const NOME_ETIQUETAS = 'Etiquetas';
const NOME_OBSERVADORES = 'Observadores';

const juntar = (xs: Array<string | null | undefined>) => xs.filter(Boolean).join(', ') || null;
const nomeCliente = (ctx: Contexto, id: string | null) => (id ? ctx.clientes.get(id) ?? '(cliente removido)' : null);
const nomesProdutos = (ctx: Contexto, ids: string[]) => juntar(ids.map((id) => ctx.produtos.get(id)?.nome ?? '?'));
const nomesOperadoras = (ctx: Contexto, ids: string[]) => juntar(ids.map((id) => ctx.operadoras.get(id) ?? '?'));
const nomesPessoas = (ctx: Contexto, ids: string[]) => juntar(ids.map((id) => pessoaCurta(ctx, id)!.nome));
const caminho = (ctx: Contexto, id: string | null) => (id ? caminhoDoAssunto(id, ctx.assuntos) || null : null);
const unicos = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
const mesmoConjunto = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ---------- conferir o que o pedido cita ----------

async function conferirCliente(db: Db, id: string) {
  const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, id), isNull(clients.deletedAt))).limit(1);
  if (!c) throw new BadRequest('O cliente escolhido não existe (ou está na lixeira).');
}
async function clienteExiste(db: Db, id: string) {
  const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, id), isNull(clients.deletedAt))).limit(1);
  return !!c;
}
async function conferirProdutos(db: Db, ids: string[]) {
  if (!ids.length) return;
  const achados = await db.select({ id: products.id }).from(products).where(and(inArray(products.id, ids), isNull(products.deletedAt)));
  if (achados.length !== ids.length) throw new BadRequest('Um dos produtos escolhidos não existe (ou está na lixeira).');
}
function conferirOperadoras(ctx: Contexto, ids: string[]) {
  if (ids.some((id) => !ctx.operadoras.has(id))) throw new BadRequest('Uma das operadoras escolhidas não está no cadastro.');
}
function conferirPessoa(ctx: Contexto, id: string, quem = 'O responsável escolhido') {
  const p = ctx.pessoas.get(id);
  if (!p || !p.ativo) throw new BadRequest(`${quem} não existe ou está desativado.`);
}
function conferirAssunto(ctx: Contexto, id: string, painel: Painel) {
  const a = ctx.assuntos.find((x) => x.id === id);
  if (!a || a.painelId !== painel.id || !a.ativo) throw new BadRequest(`Esse assunto não é do painel ${painel.nome} (ou foi desativado).`);
  return a;
}
/** O Tipo é uma das opções do painel (sem ligar para maiúscula e acento: grava como está nos Ajustes). */
function conferirTipo(tipo: string | null | undefined, painel: Painel): string | null {
  if (!tipo) return null;
  if (!painel.ajustes.tipos.length) return tipo;
  const achado = painel.ajustes.tipos.find((x) => paraBusca(x) === paraBusca(tipo));
  if (!achado) throw new BadRequest(`"${tipo}" não é um dos tipos do painel ${painel.nome} (${painel.ajustes.tipos.join(', ')}).`);
  return achado;
}
/** Outro chamado citado no pedido (o pai, o problema, a ligação), pelo código ou pelo id — se a pessoa o vê. */
async function outroChamado(db: Db, ref: string, ator: Ator, ctx: Contexto): Promise<LinhaChamado> {
  try {
    return await chamadoVisivel(db, ref, ator, ctx);
  } catch (e) {
    if (e instanceof NotFound) throw new BadRequest(`Não achei o chamado ${ref.trim()}.`);
    throw e;
  }
}
const itemNovo = (texto: string, doAssunto: boolean): ItemChecklist => ({ id: newId(), texto, feito: false, porId: null, em: null, doAssunto });

/** Os campos do painel que vieram no pedido, conferidos (as mesmas mensagens da prévia). */
function lerCampos(ctx: Contexto, painel: Painel, pedidos: Record<string, unknown>, atuais: ValoresDosCampos = {}) {
  const r = lerCamposDoPedido(camposDoPainel(ctx, painel.id), painel.nome, pedidos, atuais);
  if (!r.ok) throw new BadRequest(r.erro);
  return r.itens;
}

/** O Gestor aprende de quem é o telefone (o próximo chamado desse WhatsApp já vem com o cliente). */
async function aprenderTelefone(db: Db, telefone: string | null, clienteId: string | null, nome: string | null, agora: Date) {
  const fone = numeroWhatsApp(telefone);
  if (!fone || !clienteId) return;
  await db.insert(ticketContacts).values({ id: newId(), phone: fone, clientId: clienteId, name: nome, updatedAt: agora })
    .onConflictDoUpdate({ target: ticketContacts.phone, set: { clientId: clienteId, ...(nome ? { name: nome } : {}), updatedAt: agora } });
}

/**
 * Manda ao contato pelo WhatsApp oficial (o modelo da mensagem é o dos Ajustes) e registra no
 * histórico — mesmo quando não vai, para ficar o porquê.
 */
async function mandarAoCliente(app: FastifyInstance, ator: Ator, t: Pick<LinhaChamado, 'id' | 'code' | 'title' | 'contactName' | 'contactPhone'>, texto: string, em: Date) {
  let r: { ok: boolean; mensagem: string; modelo?: boolean };
  if (!t.contactPhone) r = { ok: false, mensagem: 'O chamado não tem o WhatsApp do contato.' };
  else {
    const { valor } = await lerAvisos(app.db);
    const mensagem = preencherModelo(valor.modeloCliente, { contato: t.contactName, codigo: t.code, titulo: t.title, texto });
    r = await mandarWhatsApp(app.db, app.vault, { de: 'cliente', para: t.contactPhone, texto: mensagem, modelo: { codigo: t.code, contato: t.contactName, texto } });
  }
  await registrarEvento(app.db, t.id, 'aviso_cliente', ator, { texto, ok: r.ok, ...(r.ok ? (r.modelo ? { modelo: true } : {}) : { erro: r.mensagem }) }, em);
  return { ok: r.ok, mensagem: r.mensagem };
}

// =====================================================================
//  ABRIR
// =====================================================================

/**
 * Abre um chamado (a tela, o robô do LineChat, o n8n e o agendado passam todos por aqui). O número
 * sai do painel numa transação: nunca repete, nem depois da lixeira.
 */
export async function criarChamado(
  app: FastifyInstance, ator: Ator, d: ChamadoCriar,
  opts: { origem?: Origem; agendadoId?: string | null; checklistExtra?: string[] } = {},
): Promise<{ id: string; codigo: string; aviso?: { ok: boolean; mensagem: string } }> {
  exigirTrabalhar(ator);
  const db = app.db;
  const agora = new Date();
  const quando = relogio(agora);
  const ctx = await carregarContexto(db, agora);

  // 1. o painel existe, está ativo e a pessoa o vê; o chamado nasce na entrada
  const painel = ctx.paineis.find((p) => p.id === d.painelId) ?? ctx.paineis.find((p) => p.sigla === d.painelId.trim().toUpperCase());
  if (!painel || !podeVerPainel(painel, ator)) throw new NotFound('Painel');
  if (!painel.ativo) throw new BadRequest(`O painel ${painel.nome} está desativado: escolha outro.`);
  const etapa = etapaDeEntrada(painel.etapas);
  if (!etapa) throw new BadRequest(`O painel ${painel.nome} não tem etapas. Peça a quem cuida dos chamados para montar as etapas.`);
  const origem: Origem = opts.origem ?? d.origem ?? 'manual';
  const tipoChamado = d.tipoChamado ?? 'chamado';

  // 2. o telefone que o Gestor já conhece preenche o cliente (e o nome do contato, se faltou)
  const telefone = d.contatoTelefone ? numeroWhatsApp(d.contatoTelefone) ?? d.contatoTelefone.trim() : null;
  let clienteId = d.clienteId ?? null;
  let contatoNome = d.contatoNome ?? null;
  if (telefone) {
    const [conhecido] = await db.select().from(ticketContacts).where(eq(ticketContacts.phone, telefone)).limit(1);
    if (conhecido) {
      if (!clienteId && conhecido.clientId && (await clienteExiste(db, conhecido.clientId))) clienteId = conhecido.clientId;
      if (!contatoNome && conhecido.name) contatoNome = conhecido.name;
    }
  }

  // os campos do sistema que o painel desligou: o que vier para eles fica de fora (o robô, o n8n e o
  // agendado não travam por isso); os campos do painel são conferidos um a um
  const usa = (c: CampoDoSistema) => campoLigado(painel.ajustes, c);
  // o assunto (do mesmo painel, ativo) traz o checklist dele; o tipo é uma opção do painel
  const assunto = d.assuntoId && usa('assunto') ? conferirAssunto(ctx, d.assuntoId, painel) : null;
  const tipo = usa('tipo') ? conferirTipo(d.tipo, painel) : null;
  const gravidade = usa('gravidade') ? d.gravidade ?? null : null;
  const alcance = usa('alcance') ? d.alcance ?? null : null;
  const checklist = [...(assunto?.checklist ?? []).map((x) => itemNovo(x, true)), ...(opts.checklistExtra ?? []).map((x) => itemNovo(x, false))];
  const campos: ValoresDosCampos = {};
  for (const i of lerCampos(ctx, painel, d.campos ?? {})) if (i.valor !== null) campos[i.campo.id] = i.valor;

  // 4. a prioridade: sem escolha, a sugerida (gravidade × alcance; no painel sem o alcance, só a
  // gravidade); trocar a sugerida pede o motivo
  const sugerida = prioridadeSugeridaDoPainel(painel.ajustes, gravidade, alcance, ctx.prazos);
  const prioridade = d.prioridade ?? sugerida;
  const produtos = usa('produtos') ? unicos(d.produtos ?? []) : [];
  const operadoras = usa('operadoras') ? unicos(d.operadoras ?? []) : [];

  // 3. o que o painel pede para abrir
  const dados: DadosObrigatorios = {
    tipoChamado, clienteId, contatoNome, contatoTelefone: telefone, relato: d.relato ?? null, descricao: d.descricao ?? null,
    assuntoId: assunto?.id ?? null, tipo, gravidade, alcance, prioridade,
    produtos, operadoras, responsavelId: d.responsavelId ?? null,
    solucao: null, causa: null, validacao: null, checklist, tempoMinutos: 0, campos,
  };
  // o que o painel pede para abrir vale para quem abre na tela (e pelo botão da conversa); o robô e o
  // agendado abrem sempre — o pedido do cliente não se perde por falta de um campo, e o que faltar é
  // pedido para o chamado andar de etapa
  const faltam = origem === 'manual' || origem === 'botao' ? faltaParaAbrir(dados, painel.ajustes) : [];
  if (faltam.length) throw new BadRequest(mensagemDoQueFalta(faltam, undefined, ctx.campos), { faltam });
  if (d.prioridade && sugerida && d.prioridade !== sugerida && !d.motivoPrioridade) throw new BadRequest('Trocar a prioridade sugerida pede o motivo.');

  // 5. o que foi citado existe
  if (clienteId) await conferirCliente(db, clienteId);
  await conferirProdutos(db, produtos);
  conferirOperadoras(ctx, operadoras);
  if (d.responsavelId) conferirPessoa(ctx, d.responsavelId);
  const observadores = unicos(d.observadores ?? []);
  for (const id of observadores) conferirPessoa(ctx, id, 'Um dos observadores escolhidos');
  const pai = d.paiId ? await outroChamado(db, d.paiId, ator, ctx) : null;
  const problema = d.problemaId ? await outroChamado(db, d.problemaId, ator, ctx) : null;
  if (problema && problema.kind !== 'problema') throw new BadRequest(`${problema.code} não é um problema.`);
  if ((d.incidentes ?? []).length && tipoChamado !== 'problema') throw new BadRequest('Só um problema junta incidentes.');
  const incidentes: LinhaChamado[] = [];
  for (const ref of unicos(d.incidentes ?? [])) {
    const inc = await outroChamado(db, ref, ator, ctx);
    if (inc.kind !== 'chamado') throw new BadRequest(`${inc.code} é um problema: o incidente precisa ser um chamado.`);
    if (!incidentes.some((i) => i.id === inc.id)) incidentes.push(inc);
  }

  const pessoa = pessoaDoAtor(ator);
  const motivoPrioridade = prioridade && sugerida && prioridade !== sugerida ? d.motivoPrioridade ?? null : null;

  // 6 a 10: o número, o chamado e o histórico, juntos
  const criado = await db.transaction(async (tx) => {
    // a linha do painel fica travada até o fim da transação: dois chamados ao mesmo tempo nunca pegam o mesmo número
    const [n] = await tx.update(ticketPanels).set({ nextNumber: sql`${ticketPanels.nextNumber} + 1` })
      .where(eq(ticketPanels.id, painel.id)).returning({ numero: sql<number>`${ticketPanels.nextNumber} - 1` });
    const numero = Number(n!.numero);
    const codigo = codigoDoChamado(painel.sigla, numero);
    const id = newId();
    await tx.insert(tickets).values({
      id, panelId: painel.id, stageId: etapa.id, number: numero, code: codigo, kind: tipoChamado, title: d.titulo,
      customerReport: dados.relato, description: dados.descricao, clientId: clienteId, contactName: contatoNome, contactPhone: telefone,
      sessionId: d.sessaoId ?? null, origin: origem, assigneeId: d.responsavelId ?? null, subjectId: assunto?.id ?? null, type: tipo,
      severity: gravidade, reach: alcance, priority: prioridade, priorityReason: motivoPrioridade,
      productIds: produtos, carrierIds: operadoras, tags: etiquetasUnicas(d.etiquetas ?? []), customFields: campos,
      parentId: pai?.id ?? null, problemId: problema?.id ?? null, checklist, watcherIds: observadores,
      // a pessoa que abre na tela já está falando com o cliente: a abertura é a primeira resposta
      firstResponseAt: ator.tipo === 'pessoa' && (origem === 'manual' || origem === 'botao') ? agora : null,
      lastActivityAt: agora, scheduleId: opts.agendadoId ?? null, createdById: pessoa, createdAt: agora, updatedAt: agora,
    });
    await registrarEvento(tx, id, 'criado', ator, { origem, etapa: etapa.nome, etapaId: etapa.id, painel: painel.nome }, quando());
    if (pai) {
      await registrarEvento(tx, id, 'pai', ator, { acao: 'ligou', pai: pai.code }, quando());
      await registrarEvento(tx, pai.id, 'filho', ator, { acao: 'ligou', filho: codigo, painel: painel.nome }, quando());
      await tocar(tx, pai.id, agora);
    }
    if (problema) {
      await registrarEvento(tx, id, 'problema', ator, { acao: 'ligou', problema: problema.code }, quando());
      await registrarEvento(tx, problema.id, 'incidente', ator, { acao: 'ligou', incidente: codigo }, quando());
      await tocar(tx, problema.id, agora);
    }
    for (const inc of incidentes) {
      await tx.update(tickets).set({ problemId: id, updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, inc.id));
      // o incidente que já era de outro problema muda de problema: o antigo fica sabendo
      if (inc.problemId) await registrarEvento(tx, inc.problemId, 'incidente', ator, { acao: 'tirou', incidente: inc.code }, quando());
      await registrarEvento(tx, id, 'incidente', ator, { acao: 'ligou', incidente: inc.code }, quando());
      await registrarEvento(tx, inc.id, 'problema', ator, { acao: 'ligou', problema: codigo }, quando());
    }
    await aprenderTelefone(tx, telefone, clienteId, contatoNome, agora);
    return { id, codigo };
  });

  // 11. os avisos: quem recebeu (menos quem abriu) e, se chegou Crítico, os supervisores do painel
  const chamado = { id: criado.id, codigo: criado.codigo, titulo: d.titulo };
  if (d.responsavelId) await avisarEquipe(app, { evento: 'recebeu', para: [d.responsavelId], chamado, texto: `Você recebeu o chamado ${criado.codigo}`, menos: pessoa });
  if (prioridade === 'critica') await avisarEquipe(app, { evento: 'critico', para: painel.ajustes.supervisores, chamado, texto: `Chegou um chamado Crítico: ${criado.codigo}`, menos: pessoa });
  // quem foi posto como observador fica sabendo (e, dali em diante, recebe toda atualização)
  await avisarObservadores(app, { chamado, observadores, texto: `${ator.nome} pôs você como observador do ${criado.codigo}`, menos: pessoa, jaAvisados: [d.responsavelId] });

  // 12. o número do chamado ao cliente (o chamado fica criado mesmo se o WhatsApp não for)
  let aviso: { ok: boolean; mensagem: string } | undefined;
  if (d.avisarCliente) {
    aviso = await mandarAoCliente(app, ator, { id: criado.id, code: criado.codigo, title: d.titulo, contactName: contatoNome, contactPhone: telefone },
      'Abrimos este chamado para o seu atendimento. Qualquer novidade, avisamos por aqui.', quando());
  }

  // 13. para fora
  emitir(app, 'chamado.criado', criado.id);
  return { id: criado.id, codigo: criado.codigo, ...(aviso ? { aviso } : {}) };
}

// =====================================================================
//  ALTERAR
// =====================================================================

/**
 * Muda só os campos que vieram. Cada campo que mudou vira uma linha do histórico com os nomes que a
 * pessoa vê na tela (o texto longo diz só "editou a Solução": o texto está no chamado).
 */
export async function alterar(app: FastifyInstance, ator: Ator, ref: string, pedido: ChamadoAlterar): Promise<Feito> {
  exigirTrabalhar(ator);
  const db = app.db;
  const e = await carregar(app, ator, ref);
  const { ctx, t, painel, agora } = e;
  // o que vier para um campo que o painel desligou fica de fora (o n8n pode mandar o assunto para qualquer painel)
  const usa = (c: CampoDoSistema) => campoLigado(painel.ajustes, c);
  const d: ChamadoAlterar = {
    ...pedido,
    ...(usa('assunto') ? {} : { assuntoId: undefined }), ...(usa('tipo') ? {} : { tipo: undefined }),
    ...(usa('gravidade') ? {} : { gravidade: undefined }), ...(usa('alcance') ? {} : { alcance: undefined }),
    ...(usa('produtos') ? {} : { produtos: undefined }), ...(usa('operadoras') ? {} : { operadoras: undefined }),
  };
  const set: SetChamado = {};
  const antes: Record<string, unknown> = {};
  const eventos: Array<[TipoEvento, Record<string, unknown>]> = [];
  const mudancas: string[] = [];
  const nomes: string[] = [];
  const mudou = (chave: string, nome: string, valorAntes: unknown) => { mudancas.push(chave); nomes.push(nome); antes[chave] = valorAntes; };
  const campo = (chave: string, nome: string, de: string | null, para: string | null, valorAntes: unknown) => {
    eventos.push(['campo', { campo: nome, de, para }]);
    mudou(chave, nome, valorAntes);
  };
  const longo = (chave: string, nome: string, valorAntes: unknown) => {
    eventos.push(['campo', { campo: nome, longo: true }]);
    mudou(chave, nome, valorAntes);
  };

  // (na ordem do formulário: o histórico e a auditoria leem como a ficha)
  if (d.titulo !== undefined && d.titulo !== t.title) { set.title = d.titulo; campo('titulo', NOME_TITULO, t.title, d.titulo, t.title); }

  // o cliente e o contato
  if (d.clienteId !== undefined && d.clienteId !== t.clientId) {
    if (d.clienteId) await conferirCliente(db, d.clienteId);
    set.clientId = d.clienteId;
    campo('clienteId', NOME_CAMPO.cliente, nomeCliente(ctx, t.clientId), nomeCliente(ctx, d.clienteId), t.clientId);
  }
  if (d.contatoNome !== undefined && d.contatoNome !== t.contactName) {
    set.contactName = d.contatoNome;
    campo('contatoNome', NOME_CAMPO.contato, t.contactName, d.contatoNome, t.contactName);
  }
  if (d.contatoTelefone !== undefined) {
    const fone = d.contatoTelefone ? numeroWhatsApp(d.contatoTelefone) ?? d.contatoTelefone : null;
    if (fone !== t.contactPhone) { set.contactPhone = fone; campo('contatoTelefone', NOME_TELEFONE, t.contactPhone, fone, t.contactPhone); }
  }

  // o assunto novo traz os itens do checklist dele que ainda não estão
  if (d.assuntoId !== undefined && d.assuntoId !== t.subjectId) {
    const a = d.assuntoId ? conferirAssunto(ctx, d.assuntoId, painel) : null;
    set.subjectId = a?.id ?? null;
    campo('assuntoId', NOME_CAMPO.assunto, caminho(ctx, t.subjectId), a ? caminho(ctx, a.id) : null, t.subjectId);
    if (a) {
      const atual = (t.checklist as ItemChecklist[] | null) ?? [];
      const ja = new Set(atual.map((i) => paraBusca(i.texto)));
      const novos = a.checklist.filter((x) => !ja.has(paraBusca(x))).map((x) => itemNovo(x, true));
      if (novos.length) set.checklist = [...atual, ...novos];
    }
  }
  if (d.tipo !== undefined) {
    const novo = conferirTipo(d.tipo, painel);
    if (novo !== t.type) { set.type = novo; campo('tipo', NOME_CAMPO.tipo, t.type, novo, t.type); }
  }

  // a gravidade, o alcance e a prioridade (que pode seguir a sugestão); o campo que o painel não usa não
  // conta na sugestão (o que ficou guardado de antes não vale): sem o alcance, a sugestão é só a da gravidade
  const g0 = usa('gravidade') ? (t.severity as Gravidade | null) ?? null : null;
  const a0 = usa('alcance') ? (t.reach as Alcance | null) ?? null : null;
  const p0 = (t.priority as Prioridade | null) ?? null;
  const g1 = d.gravidade !== undefined ? d.gravidade : g0;
  const a1 = d.alcance !== undefined ? d.alcance : a0;
  if (g1 !== g0) { set.severity = g1; campo('gravidade', NOME_CAMPO.gravidade, g0 ? NOME_GRAVIDADE[g0] : null, g1 ? NOME_GRAVIDADE[g1] : null, g0); }
  if (a1 !== a0) { set.reach = a1; campo('alcance', NOME_CAMPO.alcance, a0 ? NOME_ALCANCE[a0] : null, a1 ? NOME_ALCANCE[a1] : null, a0); }
  const sug0 = prioridadeSugeridaDoPainel(painel.ajustes, g0, a0, ctx.prazos);
  const sug1 = prioridadeSugeridaDoPainel(painel.ajustes, g1, a1, ctx.prazos);
  let p1 = p0;
  let motivo: string | null = t.priorityReason;
  if (d.prioridade !== undefined && d.prioridade !== p0) {
    p1 = d.prioridade;
    if (p1 && sug1 && p1 !== sug1 && !d.motivoPrioridade) throw new BadRequest('Trocar a prioridade sugerida pede o motivo.');
    motivo = p1 && sug1 && p1 !== sug1 ? d.motivoPrioridade ?? null : null;
  } else if ((g1 !== g0 || a1 !== a0) && (p0 === null || p0 === sug0) && sug1 && sug1 !== p0) {
    // a prioridade seguia a sugestão: vai junto para a nova (a escolhida à mão fica como está)
    p1 = sug1;
    motivo = null;
  } else if (p0 && sug1 === p0) {
    // a sugestão nova bateu com a prioridade escolhida: o motivo da troca já não vale
    motivo = null;
  }
  if (p1 !== p0) {
    set.priority = p1;
    eventos.push(['prioridade', { de: p0, para: p1, sugerida: sug1, motivo }]);
    mudou('prioridade', NOME_CAMPO.prioridade, p0);
  }
  if (motivo !== t.priorityReason) set.priorityReason = motivo;

  // produtos, operadoras, etiquetas, observadores
  if (d.produtos !== undefined) {
    const novos = unicos(d.produtos);
    if (!mesmoConjunto(novos, t.productIds)) {
      await conferirProdutos(db, novos);
      set.productIds = novos;
      campo('produtos', NOME_CAMPO.produto, nomesProdutos(ctx, t.productIds), nomesProdutos(ctx, novos), t.productIds);
    }
  }
  if (d.operadoras !== undefined) {
    const novas = unicos(d.operadoras);
    if (!mesmoConjunto(novas, t.carrierIds)) {
      conferirOperadoras(ctx, novas);
      set.carrierIds = novas;
      campo('operadoras', NOME_CAMPO.operadora, nomesOperadoras(ctx, t.carrierIds), nomesOperadoras(ctx, novas), t.carrierIds);
    }
  }

  // os campos do painel: cada um que mudou vira uma linha do histórico (o texto longo diz só que mudou)
  if (d.campos !== undefined) {
    const atuais = (t.customFields as ValoresDosCampos | null) ?? {};
    const novos: ValoresDosCampos = { ...atuais };
    let mexeu = false;
    for (const { campo: c, valor } of lerCampos(ctx, painel, d.campos, atuais)) {
      const antes = atuais[c.id] ?? null;
      if (mesmoValorDoCampo(antes, valor)) continue;
      mexeu = true;
      if (valor === null) delete novos[c.id]; else novos[c.id] = valor;
      if (c.tipo === 'texto_longo') longo(chaveDoCampo(c.id), c.nome, antes);
      else campo(chaveDoCampo(c.id), c.nome, textoDoValor(c, antes) || null, textoDoValor(c, valor) || null, antes);
    }
    if (mexeu) set.customFields = novos;
  }

  // os textos longos: o histórico diz só que mudou (o texto está no chamado; a auditoria guarda o de antes)
  const textos: Array<[keyof ChamadoAlterar, 'customerReport' | 'description' | 'solution' | 'cause' | 'workaround' | 'validation', string]> = [
    ['relato', 'customerReport', NOME_CAMPO.relato], ['descricao', 'description', NOME_CAMPO.descricao], ['solucao', 'solution', NOME_CAMPO.solucao],
    ['causa', 'cause', NOME_CAMPO.causa], ['contorno', 'workaround', NOME_CONTORNO], ['validacao', 'validation', NOME_CAMPO.validacao],
  ];
  for (const [chave, coluna, nome] of textos) {
    const v = d[chave] as string | null | undefined;
    if (v === undefined || (v ?? null) === (t[coluna] ?? null)) continue;
    set[coluna] = v ?? null;
    longo(chave, nome, t[coluna]);
  }
  if (d.etiquetas !== undefined) {
    const novas = etiquetasUnicas(d.etiquetas);
    if (novas.join('\n') !== t.tags.join('\n')) { set.tags = novas; campo('etiquetas', NOME_ETIQUETAS, juntar(t.tags), juntar(novas), t.tags); }
  }
  let observadoresNovos: string[] = [];
  if (d.observadores !== undefined) {
    const novos = unicos(d.observadores);
    for (const id of novos.filter((x) => !t.watcherIds.includes(x))) conferirPessoa(ctx, id, 'Um dos observadores escolhidos');
    if (!mesmoConjunto(novos, t.watcherIds)) {
      set.watcherIds = novos;
      observadoresNovos = novos.filter((x) => !t.watcherIds.includes(x));
      campo('observadores', NOME_OBSERVADORES, nomesPessoas(ctx, t.watcherIds), nomesPessoas(ctx, novos), t.watcherIds);
    }
  }

  // o responsável: avisa quem recebeu; passar o chamado a alguém é a primeira resposta de uma pessoa
  let recebeu: string | null = null;
  if (d.responsavelId !== undefined && d.responsavelId !== t.assigneeId) {
    if (d.responsavelId) conferirPessoa(ctx, d.responsavelId);
    set.assigneeId = d.responsavelId;
    eventos.push(['responsavel', { de: pessoaCurta(ctx, t.assigneeId), para: pessoaCurta(ctx, d.responsavelId) }]);
    mudou('responsavelId', NOME_CAMPO.responsavel, t.assigneeId);
    if (ator.tipo === 'pessoa' && !t.firstResponseAt) set.firstResponseAt = agora;
    recebeu = d.responsavelId;
  }

  if (!eventos.length) return nada(t);
  set.updatedAt = agora;
  set.lastActivityAt = agora;
  const clienteFinal = set.clientId !== undefined ? set.clientId : t.clientId;
  const foneFinal = set.contactPhone !== undefined ? set.contactPhone : t.contactPhone;
  const nomeFinal = set.contactName !== undefined ? set.contactName : t.contactName;
  await db.transaction(async (tx) => {
    await tx.update(tickets).set(set).where(eq(tickets.id, t.id));
    for (const [tipo, dados] of eventos) await registrarEvento(tx, t.id, tipo, ator, dados, e.quando());
    if (set.clientId !== undefined || set.contactPhone !== undefined) await aprenderTelefone(tx, foneFinal ?? null, clienteFinal ?? null, nomeFinal ?? null, agora);
  });

  const titulo = set.title ?? t.title;
  const chamado = { id: t.id, codigo: t.code, titulo };
  const menos = pessoaDoAtor(ator);
  if (recebeu) await avisarEquipe(app, { evento: 'recebeu', para: [recebeu], chamado, texto: `Você recebeu o chamado ${t.code}`, menos });
  // os observadores: quem entrou fica sabendo; os outros recebem o que mudou (o responsável, num aviso
  // próprio; os campos, juntos num aviso só enquanto não for lido)
  if (observadoresNovos.length) await avisarObservadores(app, { chamado, observadores: observadoresNovos, texto: `${ator.nome} pôs você como observador do ${t.code}`, menos, jaAvisados: [recebeu] });
  const observadores = (set.watcherIds ?? t.watcherIds).filter((x) => !observadoresNovos.includes(x));
  if (set.assigneeId !== undefined) {
    const texto = set.assigneeId ? `${ator.nome} passou o ${t.code} para ${pessoaCurta(ctx, set.assigneeId)?.nome ?? 'outra pessoa'}` : `${ator.nome} deixou o ${t.code} sem responsável`;
    await avisarObservadores(app, { chamado, observadores, texto, menos, jaAvisados: [recebeu] });
  }
  const camposMudados = nomes.filter((n) => n !== NOME_OBSERVADORES && n !== NOME_CAMPO.responsavel);
  if (camposMudados.length) await avisarObservadores(app, { chamado, observadores, menos, campos: { quem: ator.nome, nomes: camposMudados } });
  emitir(app, 'chamado.alterado', t.id, { mudancas });
  const { updatedAt: _u, lastActivityAt: _l, ...depois } = set;
  return { id: t.id, codigo: t.code, titulo, resumo: `Alterou ${t.code} "${titulo}": ${nomes.join(', ')}`, antes, depois };
}

// =====================================================================
//  MOVER (o coração: escalonar, resolver, fechar, reabrir)
// =====================================================================

type Movimento = {
  de: EtapaPainel | null;
  para: EtapaPainel;
  antes: SituacaoDoChamado;
  depois: SituacaoDoChamado;
  reabriu: boolean;
  /** quem passou a ser o responsável neste movimento (para o aviso "recebeu") */
  novoResponsavel: string | null;
  /** o nome dele (para o aviso dos observadores) */
  nomeDoNovoResponsavel: string | null;
};

/**
 * Confere se o chamado pode entrar na etapa: o que falta preencher, os filhos que travam (o pai só
 * resolve e fecha com os filhos fechados) e, quando é escalonar ou voltar de nível, o motivo.
 */
async function conferirMovimento(
  db: Db, e: Estado, para: EtapaPainel,
  o: { painel?: Painel; motivo: string | null; responsavelId?: string | null; nivel: boolean },
): Promise<'sobe' | 'desce' | null> {
  const painel = o.painel ?? e.painel;
  const dados = { ...dadosDaLinha(e.t, await minutosGastos(db, e.t.id)), ...(o.responsavelId !== undefined ? { responsavelId: o.responsavelId } : {}) };
  const faltam = faltaParaEtapa(dados, para);
  if (faltam.length) throw new BadRequest(mensagemDoQueFalta(faltam, para.nome, e.ctx.campos), { faltam });
  const travam = filhosQueTravam(await filhosDoChamado(db, e.ctx, e.t.id), para, painel.ajustes.paiEsperaFilhos);
  if (travam.length) throw new BadRequest(`O ${e.t.code} tem filhos em aberto: ${travam.join(', ')}. Feche os filhos antes.`, { filhos: travam });
  if (!o.nivel) return null;
  const sentido = movimentoDeNivel(e.etapa, para);
  if (sentido && !o.motivo) throw new BadRequest(sentido === 'sobe' ? 'Escalonar pede o motivo.' : 'Voltar de nível pede o motivo.');
  return sentido;
}

/**
 * Grava o movimento (dentro da transação de quem chama): a etapa, as datas de resolvido e fechado, o
 * reabrir (voltar de resolvido ou fechado para a entrada ou o andamento conta como reaberto), a
 * primeira resposta (sair da entrada por uma pessoa) e o responsável, com o histórico de cada coisa.
 */
async function gravarMovimento(
  tx: Db, e: Estado, ator: Ator, para: EtapaPainel,
  o: { motivo: string | null; sentido: 'sobe' | 'desce' | null; responsavelId?: string | null; motivoReabriu?: string | null; extra?: SetChamado },
): Promise<Movimento> {
  const { t, agora } = e;
  const deTipo = e.etapa?.tipo ?? 'andamento';
  const antes = situacaoDaEtapa(deTipo);
  const depois = situacaoDaEtapa(para.tipo);
  const reabriu = antes !== 'aberto' && depois === 'aberto';
  const set: SetChamado = { ...(o.extra ?? {}), stageId: para.id, updatedAt: agora, lastActivityAt: agora };
  if (para.tipo === 'resolvido') { set.resolvedAt = t.resolvedAt ?? agora; set.closedAt = null; }
  if (para.tipo === 'fechado') { set.closedAt = antes === 'fechado' ? t.closedAt ?? agora : agora; set.resolvedAt = t.resolvedAt ?? agora; }
  if (reabriu) { set.resolvedAt = null; set.closedAt = null; set.reopenCount = t.reopenCount + 1; }
  if (deTipo === 'entrada' && para.tipo !== 'entrada' && ator.tipo === 'pessoa' && !t.firstResponseAt && set.firstResponseAt === undefined) set.firstResponseAt = agora;
  const trocaResponsavel = o.responsavelId !== undefined && o.responsavelId !== t.assigneeId;
  if (trocaResponsavel) set.assigneeId = o.responsavelId ?? null;
  await tx.update(tickets).set(set).where(eq(tickets.id, t.id));
  await registrarEvento(tx, t.id, 'etapa', ator, { de: etapaCurta(e.etapa), para: etapaCurta(para), motivo: o.motivo, sentido: o.sentido }, e.quando());
  if (reabriu) await registrarEvento(tx, t.id, 'reaberto', ator, { motivo: o.motivoReabriu !== undefined ? o.motivoReabriu : o.motivo }, e.quando());
  if (trocaResponsavel) await registrarEvento(tx, t.id, 'responsavel', ator, { de: pessoaCurta(e.ctx, t.assigneeId), para: pessoaCurta(e.ctx, o.responsavelId) }, e.quando());
  return {
    de: e.etapa, para, antes, depois, reabriu, novoResponsavel: trocaResponsavel ? o.responsavelId ?? null : null,
    nomeDoNovoResponsavel: trocaResponsavel && o.responsavelId ? pessoaCurta(e.ctx, o.responsavelId)?.nome ?? null : null,
  };
}

/** Depois de gravado: quem a etapa avisa, quem recebeu, os observadores, o pai (quando um filho fecha) e os webhooks. */
async function depoisDoMovimento(app: FastifyInstance, ator: Ator, t: LinhaChamado, m: Movimento, extra: Record<string, unknown> = {}, opts: { observadores?: boolean } = {}) {
  const menos = pessoaDoAtor(ator);
  const chamado = curto(t);
  if (m.para.avisar.length) await avisarEquipe(app, { evento: 'etapa', para: m.para.avisar, chamado, texto: `${t.code} chegou em ${m.para.nome}`, menos });
  if (m.novoResponsavel) await avisarEquipe(app, { evento: 'recebeu', para: [m.novoResponsavel], chamado, texto: `Você recebeu o chamado ${t.code}`, menos });
  const painel = extra.painel as { para?: { nome: string } } | undefined;
  const onde = painel?.para ? `para o painel ${painel.para.nome} (${m.para.nome})` : `para ${m.para.nome}`;
  const texto = `${ator.nome} ${m.reabriu ? `reabriu o ${t.code} (${m.para.nome})` : `${painel?.para ? 'passou' : 'moveu'} o ${t.code} ${onde}`}${m.nomeDoNovoResponsavel ? `, com ${m.nomeDoNovoResponsavel}` : ''}`;
  if (opts.observadores !== false) await avisarObservadores(app, { chamado, observadores: t.watcherIds, texto, menos, jaAvisados: [...m.para.avisar, m.novoResponsavel] });
  if (m.depois === 'fechado' && m.antes !== 'fechado' && t.parentId) {
    const [pai] = await app.db.select({ id: tickets.id, code: tickets.code, title: tickets.title, assigneeId: tickets.assigneeId }).from(tickets)
      .where(and(eq(tickets.id, t.parentId), isNull(tickets.deletedAt))).limit(1);
    if (pai?.assigneeId) {
      await avisarEquipe(app, { evento: 'etapa', tipo: 'pai', para: [pai.assigneeId], chamado: curto(pai), texto: `O filho ${t.code} do ${pai.code} foi fechado`, menos });
    }
  }
  emitir(app, 'chamado.movido', t.id, { de: m.de ? { id: m.de.id, nome: m.de.nome } : null, para: { id: m.para.id, nome: m.para.nome }, ...extra });
  if (m.depois === 'resolvido' && m.antes !== 'resolvido') emitir(app, 'chamado.resolvido', t.id);
  if (m.depois === 'fechado' && m.antes !== 'fechado') emitir(app, 'chamado.fechado', t.id);
}

function frasesDoMovimento(codigo: string, m: Movimento, sentido: 'sobe' | 'desce' | null, motivo: string | null) {
  const verbo = sentido === 'sobe' ? 'Escalonou' : sentido === 'desce' ? 'Voltou' : 'Moveu';
  return `${verbo} ${codigo} de ${m.de?.nome ?? '?'} para ${m.para.nome}${m.reabriu ? ' (reabriu)' : ''}${motivo ? `: ${motivo}` : ''}`;
}

/**
 * Leva o chamado para outra etapa do mesmo painel. `responsavelId`: ausente mantém, nulo tira (fica na
 * fila da etapa), um id passa para a pessoa.
 */
export async function mover(
  app: FastifyInstance, ator: Ator, ref: string,
  d: { etapaId: string; motivo?: string | null; responsavelId?: string | null },
): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const para = e.painel.etapas.find((x) => x.id === d.etapaId);
  if (!para) throw new BadRequest('Essa etapa não é do painel deste chamado.');
  if (para.id === e.t.stageId) return nada(e.t);
  const motivo = d.motivo?.trim() || null;
  const responsavelId = d.responsavelId === undefined ? undefined : d.responsavelId || null;
  if (responsavelId) conferirPessoa(e.ctx, responsavelId);
  const sentido = await conferirMovimento(app.db, e, para, { motivo, responsavelId, nivel: true });
  const m = await app.db.transaction((tx) => gravarMovimento(tx, e, ator, para, { motivo, sentido, responsavelId }));
  await depoisDoMovimento(app, ator, e.t, m);
  return { ...nada(e.t), resumo: frasesDoMovimento(e.t.code, m, sentido, motivo) };
}

// =====================================================================
//  ASSUMIR, ESPERAR, REABRIR, TROCAR DE PAINEL
// =====================================================================

/**
 * Fica com o chamado. Na entrada, ele vai para a primeira etapa de andamento — se não faltar nada para
 * entrar nela; faltando, fica na entrada (a ficha mostra o que falta). `mover: false` só troca o
 * responsável (a resposta pronta que já leva o chamado para uma etapa).
 */
export async function assumir(app: FastifyInstance, ator: Ator, ref: string, opts: { mover?: boolean } = {}): Promise<Feito> {
  exigirTrabalhar(ator);
  if (ator.tipo !== 'pessoa') throw new BadRequest('Só uma pessoa assume um chamado.');
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  let para: EtapaPainel | null = null;
  if (opts.mover !== false && e.etapa?.tipo === 'entrada') {
    const alvo = etapaAoAssumir(e.painel.etapas, t.stageId);
    if (alvo) {
      const dados = { ...dadosDaLinha(t, await minutosGastos(app.db, t.id)), responsavelId: ator.id };
      if (!faltaParaEtapa(dados, alvo).length) para = alvo;
    }
  }
  const trocaResponsavel = t.assigneeId !== ator.id;
  if (!trocaResponsavel && !para) return nada(t);
  const m = await app.db.transaction(async (tx) => {
    if (para) return gravarMovimento(tx, e, ator, para, { motivo: null, sentido: null, responsavelId: ator.id, extra: { firstResponseAt: t.firstResponseAt ?? agora } });
    await tx.update(tickets).set({ assigneeId: ator.id, firstResponseAt: t.firstResponseAt ?? agora, updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, t.id));
    await registrarEvento(tx, t.id, 'responsavel', ator, { de: pessoaCurta(e.ctx, t.assigneeId), para: pessoaCurta(e.ctx, ator.id) }, e.quando());
    return null;
  });
  if (m) await depoisDoMovimento(app, ator, t, m);
  else await avisarObservadores(app, { chamado: curto(t), observadores: t.watcherIds, texto: `${ator.nome} assumiu o ${t.code}`, menos: ator.id });
  if (trocaResponsavel) emitir(app, 'chamado.alterado', t.id, { mudancas: ['responsavelId'] });
  return { ...nada(t), resumo: `Assumiu ${t.code}${para ? ` (foi para ${para.nome})` : ''}` };
}

/**
 * A marca de espera, sem mudar de etapa. Esperando o cliente, o prazo para (a conta é a do
 * `estadoDosPrazos`); esperando a operadora, continua. `tipo: null` tira a marca.
 */
export async function esperar(app: FastifyInstance, ator: Ator, ref: string, d: { tipo: TipoEspera | null; motivo?: string | null }): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  const esperas = (t.waits as Espera[] | null) ?? [];
  const aberta = esperaAberta(esperas);
  const motivo = d.motivo?.trim() || null;
  const fechar = (w: Espera) => (w === aberta ? { ...w, fim: agora.toISOString() } : w);
  let lista: Espera[];
  let dados: Record<string, unknown>;
  let resumo: string;
  if (d.tipo) {
    if (!motivo) throw new BadRequest('Diga o motivo da espera.');
    lista = [...esperas.map(fechar), { tipo: d.tipo, motivo, inicio: agora.toISOString(), fim: null, porId: pessoaDoAtor(ator) }];
    dados = { tipo: d.tipo, motivo };
    resumo = `Marcou ${t.code}: ${NOME_ESPERA[d.tipo]} (${motivo})`;
  } else {
    if (!aberta) return nada(t);
    const minutos = Math.max(0, Math.round((agora.getTime() - Date.parse(aberta.inicio)) / 60_000));
    lista = esperas.map(fechar);
    dados = { tipo: null, antes: aberta.tipo, minutos, duracao: duracaoDoPrazo(minutos) };
    resumo = `Tirou a marca de espera de ${t.code} (${NOME_ESPERA[aberta.tipo]}, ${duracaoDoPrazo(minutos)})`;
  }
  await app.db.transaction(async (tx) => {
    await tx.update(tickets).set({ waits: lista, updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, t.id));
    await registrarEvento(tx, t.id, 'espera', ator, dados, e.quando());
  });
  const texto = d.tipo ? `${ator.nome} marcou o ${t.code}: ${NOME_ESPERA[d.tipo].toLocaleLowerCase('pt-BR')} (${motivo})` : `${ator.nome} tirou a marca de espera do ${t.code}`;
  await avisarObservadores(app, { chamado: curto(t), observadores: t.watcherIds, texto, menos: pessoaDoAtor(ator) });
  return { ...nada(t), resumo };
}

/** Só o resolvido ou fechado reabre: vai para a etapa escolhida (de entrada ou andamento) ou a primeira de andamento. */
/** `observadores: false`: quem chama avisa os observadores do jeito dele (o cliente que respondeu e reabriu). */
export async function reabrir(app: FastifyInstance, ator: Ator, ref: string, d: { motivo?: string | null; etapaId?: string | null }, opts: { observadores?: boolean } = {}): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, painel } = e;
  if (situacaoDaEtapa(e.etapa?.tipo ?? 'andamento') === 'aberto') throw new BadRequest('O chamado já está aberto.');
  let para: EtapaPainel | null;
  if (d.etapaId) {
    para = painel.etapas.find((x) => x.id === d.etapaId && (x.tipo === 'entrada' || x.tipo === 'andamento')) ?? null;
    if (!para) throw new BadRequest('Para reabrir, escolha uma etapa de entrada ou de andamento deste painel.');
  } else {
    para = etapaAoReabrir(painel.etapas);
    if (!para || (para.tipo !== 'entrada' && para.tipo !== 'andamento')) throw new BadRequest(`O painel ${painel.nome} não tem etapa de entrada nem de andamento para reabrir.`);
  }
  const motivo = d.motivo?.trim() || null;
  const destino = para;
  const m = await app.db.transaction((tx) => gravarMovimento(tx, e, ator, destino, { motivo: null, sentido: null, motivoReabriu: motivo }));
  await depoisDoMovimento(app, ator, t, m, {}, opts);
  if (t.assigneeId) await avisarEquipe(app, { evento: 'recebeu', para: [t.assigneeId], chamado: curto(t), texto: `O ${t.code} foi reaberto`, menos: pessoaDoAtor(ator) });
  return { ...nada(t), resumo: `Reabriu ${t.code} (foi para ${destino.nome})${motivo ? `: ${motivo}` : ''}` };
}

/**
 * Passa o chamado para outro painel. O código não muda (SUP-12 continua SUP-12 no Desenvolvimento); o
 * assunto (que é de cada painel) sai, e o tipo sai se não for uma opção do painel novo.
 */
export async function trocarPainel(app: FastifyInstance, ator: Ator, ref: string, d: { painelId: string; etapaId?: string | null }): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { ctx, t, painel } = e;
  const novo = ctx.paineis.find((p) => p.id === d.painelId) ?? ctx.paineis.find((p) => p.sigla === d.painelId.trim().toUpperCase());
  if (!novo || !podeVerPainel(novo, ator)) throw new NotFound('Painel');
  if (novo.id === painel.id) return nada(t);
  if (!novo.ativo) throw new BadRequest(`O painel ${novo.nome} está desativado: escolha outro.`);
  const para = d.etapaId ? novo.etapas.find((x) => x.id === d.etapaId) : etapaDeEntrada(novo.etapas);
  if (!para) throw new BadRequest(d.etapaId ? `Essa etapa não é do painel ${novo.nome}.` : `O painel ${novo.nome} não tem etapas.`);
  const tipoNovo = t.type ? novo.ajustes.tipos.find((x) => paraBusca(x) === paraBusca(t.type!)) ?? (novo.ajustes.tipos.length ? null : t.type) : null;
  // o destino é conferido com o chamado já sem o que sai (o assunto e o tipo do painel antigo)
  const semOQueSai: Estado = { ...e, t: { ...t, subjectId: null, type: tipoNovo } };
  await conferirMovimento(app.db, semOQueSai, para, { painel: novo, motivo: null, nivel: false });
  const m = await app.db.transaction(async (tx) => {
    await registrarEvento(tx, t.id, 'painel', ator, { de: painel.nome, para: novo.nome }, e.quando());
    if (t.subjectId) await registrarEvento(tx, t.id, 'campo', ator, { campo: NOME_CAMPO.assunto, de: caminho(ctx, t.subjectId), para: null }, e.quando());
    if (t.type && tipoNovo !== t.type) await registrarEvento(tx, t.id, 'campo', ator, { campo: NOME_CAMPO.tipo, de: t.type, para: tipoNovo }, e.quando());
    return gravarMovimento(tx, e, ator, para, { motivo: null, sentido: null, extra: { panelId: novo.id, subjectId: null, type: tipoNovo } });
  });
  await depoisDoMovimento(app, ator, t, m, { painel: { de: { id: painel.id, nome: painel.nome }, para: { id: novo.id, nome: novo.nome } } });
  return { ...nada(t), resumo: `Passou ${t.code} do painel ${painel.nome} para ${novo.nome} (${para.nome})` };
}

// =====================================================================
//  ANOTAÇÕES
// =====================================================================

/** O anexo como fica guardado: o tipo de verdade da imagem (pelos bytes); a imagem que não é imagem baixa como arquivo. */
function anexoParaGuardar(a: { fileName: string; conteudo: string }) {
  const { mimeType, dataBase64 } = lerConteudo(a.conteudo);
  const buffer = Buffer.from(dataBase64, 'base64');
  const real = tipoDaImagem(buffer);
  return {
    fileName: a.fileName.trim().slice(0, 200) || 'arquivo',
    mimeType: real ?? (IMAGENS_NA_TELA.includes(mimeType) ? 'application/octet-stream' : mimeType),
    sizeBytes: buffer.length,
    dataBase64: buffer.toString('base64'),
  };
}

/** Uma anotação (com até 5 anexos de até 10 MB cada). A anotação de uma pessoa conta como primeira resposta. */
export async function anotar(app: FastifyInstance, ator: Ator, ref: string, d: { texto: string; anexos: Array<{ fileName: string; conteudo: string }> }): Promise<Feito> {
  exigirTrabalhar(ator);
  const texto = (d.texto ?? '').replace(/\r\n?/g, '\n').trim();
  const anexos = d.anexos ?? [];
  if (!texto && !anexos.length) throw new BadRequest('Escreva a anotação ou anexe um arquivo.');
  if (anexos.length > 5) throw new BadRequest('No máximo 5 anexos por anotação.');
  const guardar = anexos.map(anexoParaGuardar);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  const pessoa = pessoaDoAtor(ator);
  const notaId = newId();
  await app.db.transaction(async (tx) => {
    await tx.insert(ticketNotes).values({ id: notaId, ticketId: t.id, userId: pessoa, actorName: integracaoDoAtor(ator), body: texto, createdAt: agora });
    // um milésimo entre um anexo e o outro: a ficha mostra na ordem em que foram escolhidos
    if (guardar.length) await tx.insert(ticketAttachments).values(guardar.map((a, i) => ({ id: newId(), ticketId: t.id, noteId: notaId, ...a, uploadedById: pessoa, createdAt: new Date(agora.getTime() + i) })));
    await tx.update(tickets).set({ updatedAt: agora, lastActivityAt: agora, ...(ator.tipo === 'pessoa' && !t.firstResponseAt ? { firstResponseAt: agora } : {}) }).where(eq(tickets.id, t.id));
  });
  emitir(app, 'chamado.anotacao', t.id, { anotacao: { texto, por: ator.nome } });
  const comAnexo = guardar.length ? ` (com ${plural(guardar.length, 'anexo', 'anexos')})` : '';
  await avisarObservadores(app, {
    chamado: curto(t), observadores: t.watcherIds, menos: pessoa,
    texto: texto ? `${ator.nome} anotou no ${t.code}${comAnexo}: "${trecho(texto.replace(/\s+/g, ' '), 140)}"` : `${ator.nome} anexou ${plural(guardar.length, 'arquivo', 'arquivos')} no ${t.code}`,
  });
  return {
    ...nada(t),
    resumo: `Anotou em ${t.code}${guardar.length ? ` (com ${plural(guardar.length, 'anexo', 'anexos')})` : ''}`,
    depois: { texto, anexos: guardar.map((a) => a.fileName) },
  };
}

/** Apagar: a sua, ou qualquer uma se cuida dos chamados (a auditoria guarda o texto apagado). */
export async function apagarAnotacao(app: FastifyInstance, ator: Ator, ref: string, notaId: string): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  const [n] = await app.db.select().from(ticketNotes).where(and(eq(ticketNotes.id, notaId), eq(ticketNotes.ticketId, t.id), isNull(ticketNotes.deletedAt))).limit(1);
  if (!n) throw new NotFound('Anotação');
  const minha = ator.tipo === 'pessoa' && n.userId === ator.id;
  if (!minha && !podeCuidar(ator)) throw new Forbidden('Só quem escreveu (ou quem cuida dos chamados) pode apagar esta anotação.');
  await app.db.transaction(async (tx) => {
    await tx.update(ticketNotes).set({ deletedAt: agora }).where(eq(ticketNotes.id, n.id));
    // os anexos vão junto: a anotação apagada não deixa arquivo aberto para quem tem o endereço
    await tx.update(ticketAttachments).set({ deletedAt: agora }).where(and(eq(ticketAttachments.noteId, n.id), isNull(ticketAttachments.deletedAt)));
  });
  const autor = n.userId ? pessoaCurta(e.ctx, n.userId)!.nome : n.actorName;
  return {
    ...nada(t),
    resumo: `Apagou uma anotação${autor && !minha ? ` de ${autor}` : ''} em ${t.code}`,
    antes: { texto: n.body, escritaEm: n.createdAt.toISOString(), por: autor },
  };
}

// =====================================================================
//  LIGAÇÕES, PAI E PROBLEMA
// =====================================================================

/** Liga dois chamados à mão (relacionado, duplicado, repete). O histórico registra nos dois, cada um do seu lado. */
export async function ligar(app: FastifyInstance, ator: Ator, ref: string, d: { para: string; tipo: TipoLigacaoChamado }): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  const outro = await outroChamado(app.db, d.para, ator, e.ctx);
  if (outro.id === t.id) throw new BadRequest('Um chamado não se liga a ele mesmo.');
  const [ja] = await app.db.select({ id: ticketLinks.id }).from(ticketLinks).where(and(isNull(ticketLinks.deletedAt), or(
    and(eq(ticketLinks.fromId, t.id), eq(ticketLinks.toId, outro.id)),
    and(eq(ticketLinks.fromId, outro.id), eq(ticketLinks.toId, t.id)),
  ))).limit(1);
  if (ja) throw new Conflict('Esses chamados já estão ligados.');
  const nome = NOME_LIGACAO[d.tipo];
  await app.db.transaction(async (tx) => {
    await tx.insert(ticketLinks).values({ id: newId(), fromId: t.id, toId: outro.id, kind: d.tipo, createdById: pessoaDoAtor(ator), createdAt: agora });
    await registrarEvento(tx, t.id, 'ligacao', ator, { acao: 'ligou', tipo: d.tipo, com: outro.code, texto: nome.de }, e.quando());
    await registrarEvento(tx, outro.id, 'ligacao', ator, { acao: 'ligou', tipo: d.tipo, com: t.code, texto: nome.para }, e.quando());
    await tx.update(tickets).set({ updatedAt: agora, lastActivityAt: agora }).where(inArray(tickets.id, [t.id, outro.id]));
  });
  await camposAosObservadores(app, ator, t, ['Ligações']);
  await camposAosObservadores(app, ator, outro, ['Ligações']);
  return { ...nada(t), resumo: `Ligou ${t.code} a ${outro.code} (${nome.de} ${outro.code})` };
}

export async function desligar(app: FastifyInstance, ator: Ator, ref: string, ligacaoId: string): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  const [l] = await app.db.select().from(ticketLinks).where(and(eq(ticketLinks.id, ligacaoId), isNull(ticketLinks.deletedAt), or(eq(ticketLinks.fromId, t.id), eq(ticketLinks.toId, t.id)))).limit(1);
  if (!l) throw new NotFound('Ligação');
  const deste = l.fromId === t.id;
  const outroId = deste ? l.toId : l.fromId;
  const [outro] = await app.db.select({ id: tickets.id, code: tickets.code }).from(tickets).where(eq(tickets.id, outroId)).limit(1);
  const tipo = l.kind as TipoLigacaoChamado;
  const nome = NOME_LIGACAO[tipo] ?? { de: tipo, para: tipo };
  await app.db.transaction(async (tx) => {
    await tx.update(ticketLinks).set({ deletedAt: agora }).where(eq(ticketLinks.id, l.id));
    await registrarEvento(tx, t.id, 'ligacao', ator, { acao: 'desligou', tipo, com: outro?.code ?? '?', texto: deste ? nome.de : nome.para }, e.quando());
    if (outro) await registrarEvento(tx, outro.id, 'ligacao', ator, { acao: 'desligou', tipo, com: t.code, texto: deste ? nome.para : nome.de }, e.quando());
    await tx.update(tickets).set({ updatedAt: agora, lastActivityAt: agora }).where(inArray(tickets.id, [t.id, outroId]));
  });
  await camposAosObservadores(app, ator, t, ['Ligações']);
  return { ...nada(t), resumo: `Desligou ${t.code} de ${outro?.code ?? '?'}` };
}

/**
 * O caminho do chamado até um descendente dele (filho, neto…), ou nada. É o que impede o círculo:
 * o pai não pode ser alguém que já está abaixo do chamado. Olha também a lixeira (um restaurado não
 * pode fechar um círculo).
 */
async function caminhoAteDescendente(db: Db, de: string, ate: string): Promise<string[] | null> {
  const todos = await db.select({ id: tickets.id, code: tickets.code, parentId: tickets.parentId }).from(tickets);
  const filhos = new Map<string, string[]>();
  for (const x of todos) if (x.parentId) filhos.set(x.parentId, [...(filhos.get(x.parentId) ?? []), x.id]);
  const codigo = new Map(todos.map((x) => [x.id, x.code]));
  const veioDe = new Map<string, string>();
  const fila = [de];
  const vistos = new Set([de]);
  while (fila.length) {
    const atual = fila.shift()!;
    if (atual === ate) {
      const caminhoIds = [atual];
      for (let p = veioDe.get(atual); p; p = veioDe.get(p)) caminhoIds.unshift(p);
      return caminhoIds.map((id) => codigo.get(id) ?? '?');
    }
    for (const f of filhos.get(atual) ?? []) if (!vistos.has(f)) { vistos.add(f); veioDe.set(f, atual); fila.push(f); }
  }
  return null;
}

/** O pai pelo código (nulo tira). O pai pode ser de outro painel; nunca um descendente (seria um círculo). */
export async function definirPai(app: FastifyInstance, ator: Ator, ref: string, paiRef: string | null): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  const antigo = t.parentId ? await app.db.select({ id: tickets.id, code: tickets.code }).from(tickets).where(eq(tickets.id, t.parentId)).limit(1).then((r) => r[0] ?? null) : null;
  if (!paiRef?.trim()) {
    if (!t.parentId) return nada(t);
    await app.db.transaction(async (tx) => {
      await tx.update(tickets).set({ parentId: null, updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, t.id));
      await registrarEvento(tx, t.id, 'pai', ator, { acao: 'tirou', pai: antigo?.code ?? '?' }, e.quando());
      if (antigo) await registrarEvento(tx, antigo.id, 'filho', ator, { acao: 'tirou', filho: t.code }, e.quando());
    });
    await camposAosObservadores(app, ator, t, ['Pai']);
    return { ...nada(t), resumo: `Tirou ${t.code} de filho de ${antigo?.code ?? '?'}` };
  }
  const pai = await outroChamado(app.db, paiRef, ator, e.ctx);
  if (pai.id === t.parentId) return nada(t);
  if (pai.id === t.id) throw new BadRequest(`Isso faria um círculo: ${t.code} não pode ser pai dele mesmo.`);
  const ciclo = await caminhoAteDescendente(app.db, t.id, pai.id);
  if (ciclo) throw new BadRequest(`Isso faria um círculo: ${pai.code} já está abaixo de ${t.code} (${ciclo.join(' › ')}).`);
  await app.db.transaction(async (tx) => {
    await tx.update(tickets).set({ parentId: pai.id, updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, t.id));
    if (antigo) await registrarEvento(tx, antigo.id, 'filho', ator, { acao: 'tirou', filho: t.code }, e.quando());
    await registrarEvento(tx, t.id, 'pai', ator, { acao: 'ligou', pai: pai.code }, e.quando());
    await registrarEvento(tx, pai.id, 'filho', ator, { acao: 'ligou', filho: t.code, painel: e.painel.nome }, e.quando());
    await tx.update(tickets).set({ updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, pai.id));
  });
  await camposAosObservadores(app, ator, t, ['Pai']);
  await camposAosObservadores(app, ator, pai, ['Filhos']);
  return { ...nada(t), resumo: `Pôs ${t.code} como filho de ${pai.code}` };
}

/** O problema de que este chamado é incidente, pelo código (nulo tira). O alvo tem de ser um problema. */
export async function definirProblema(app: FastifyInstance, ator: Ator, ref: string, problemaRef: string | null): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  const antigo = t.problemId ? await app.db.select({ id: tickets.id, code: tickets.code }).from(tickets).where(eq(tickets.id, t.problemId)).limit(1).then((r) => r[0] ?? null) : null;
  if (!problemaRef?.trim()) {
    if (!t.problemId) return nada(t);
    await app.db.transaction(async (tx) => {
      await tx.update(tickets).set({ problemId: null, updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, t.id));
      await registrarEvento(tx, t.id, 'problema', ator, { acao: 'tirou', problema: antigo?.code ?? '?' }, e.quando());
      if (antigo) await registrarEvento(tx, antigo.id, 'incidente', ator, { acao: 'tirou', incidente: t.code }, e.quando());
    });
    await camposAosObservadores(app, ator, t, ['Problema']);
    return { ...nada(t), resumo: `Tirou ${t.code} do problema ${antigo?.code ?? '?'}` };
  }
  const problema = await outroChamado(app.db, problemaRef, ator, e.ctx);
  if (problema.id === t.id) throw new BadRequest(`Um chamado não é incidente dele mesmo.`);
  if (problema.kind !== 'problema') throw new BadRequest(`${problema.code} não é um problema.`);
  if (problema.id === t.problemId) return nada(t);
  await app.db.transaction(async (tx) => {
    await tx.update(tickets).set({ problemId: problema.id, updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, t.id));
    if (antigo) await registrarEvento(tx, antigo.id, 'incidente', ator, { acao: 'tirou', incidente: t.code }, e.quando());
    await registrarEvento(tx, t.id, 'problema', ator, { acao: 'ligou', problema: problema.code }, e.quando());
    await registrarEvento(tx, problema.id, 'incidente', ator, { acao: 'ligou', incidente: t.code }, e.quando());
    await tx.update(tickets).set({ updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, problema.id));
  });
  await camposAosObservadores(app, ator, t, ['Problema']);
  await camposAosObservadores(app, ator, problema, ['Incidentes']);
  return { ...nada(t), resumo: `Ligou ${t.code} ao problema ${problema.code}` };
}

// =====================================================================
//  CHECKLIST, TEMPO, OPERADORA, ACOMPANHAR
// =====================================================================

export type AcaoChecklist = { acao: 'marcar'; itemId: string; feito: boolean } | { acao: 'incluir'; texto: string } | { acao: 'tirar'; itemId: string };

export async function mexerNoChecklist(app: FastifyInstance, ator: Ator, ref: string, d: AcaoChecklist): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  const lista = [...((t.checklist as ItemChecklist[] | null) ?? [])];
  let dados: Record<string, unknown>;
  let resumo: string;
  if (d.acao === 'incluir') {
    const texto = d.texto.trim();
    lista.push(itemNovo(texto, false));
    dados = { acao: 'incluiu', item: texto };
    resumo = `Incluiu "${texto}" no checklist de ${t.code}`;
  } else {
    const i = lista.findIndex((x) => x.id === d.itemId);
    if (i < 0) throw new BadRequest('Esse item não está no checklist do chamado.');
    const item = lista[i]!;
    if (d.acao === 'tirar') {
      lista.splice(i, 1);
      dados = { acao: 'tirou', item: item.texto };
      resumo = `Tirou "${item.texto}" do checklist de ${t.code}`;
    } else {
      if (item.feito === d.feito) return nada(t);
      lista[i] = { ...item, feito: d.feito, porId: d.feito ? pessoaDoAtor(ator) : null, em: d.feito ? agora.toISOString() : null };
      dados = { acao: 'marcou', item: item.texto, feito: d.feito };
      resumo = `${d.feito ? 'Marcou' : 'Desmarcou'} "${item.texto}" no checklist de ${t.code}`;
    }
  }
  await app.db.transaction(async (tx) => {
    await tx.update(tickets).set({ checklist: lista, updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, t.id));
    await registrarEvento(tx, t.id, 'checklist', ator, dados, e.quando());
  });
  await camposAosObservadores(app, ator, t, ['Checklist']);
  return { ...nada(t), resumo };
}

/** O tempo de trabalho (o dia é o de Brasília, se não vier). */
export async function registrarTempo(app: FastifyInstance, ator: Ator, ref: string, d: { minutos: number; nota?: string | null; dia?: string | null }): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  const nota = d.nota?.trim() || null;
  const dia = d.dia || diaLocal(agora);
  await app.db.transaction(async (tx) => {
    await tx.insert(ticketTimeEntries).values({ id: newId(), ticketId: t.id, userId: pessoaDoAtor(ator), minutes: d.minutos, note: nota, workedOn: dia, createdAt: agora });
    await registrarEvento(tx, t.id, 'tempo', ator, { minutos: d.minutos, duracao: duracaoDoPrazo(d.minutos), nota }, e.quando());
    await tx.update(tickets).set({ updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, t.id));
  });
  await camposAosObservadores(app, ator, t, ['Tempo gasto']);
  return { ...nada(t), resumo: `Registrou ${duracaoDoPrazo(d.minutos)} de trabalho em ${t.code}${dia !== diaLocal(agora) ? ` (no dia ${dia})` : ''}` };
}

/** Apagar o tempo: o seu, ou qualquer um se cuida dos chamados. */
export async function apagarTempo(app: FastifyInstance, ator: Ator, ref: string, itemId: string): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  const [i] = await app.db.select().from(ticketTimeEntries).where(and(eq(ticketTimeEntries.id, itemId), eq(ticketTimeEntries.ticketId, t.id), isNull(ticketTimeEntries.deletedAt))).limit(1);
  if (!i) throw new NotFound('Registro de tempo');
  const meu = ator.tipo === 'pessoa' && i.userId === ator.id;
  if (!meu && !podeCuidar(ator)) throw new Forbidden('Só quem registrou (ou quem cuida dos chamados) pode apagar este tempo.');
  await app.db.update(ticketTimeEntries).set({ deletedAt: agora }).where(eq(ticketTimeEntries.id, i.id));
  const quem = i.userId ? pessoaCurta(e.ctx, i.userId)!.nome : null;
  return {
    ...nada(t),
    resumo: `Apagou ${duracaoDoPrazo(i.minutes)} de trabalho${quem && !meu ? ` de ${quem}` : ''} em ${t.code}`,
    antes: { minutos: i.minutes, nota: i.note, dia: i.workedOn, por: quem },
  };
}

type AndamentoOperadora = { em: string; porId: string | null; porNome?: string | null; acao: 'abriu' | 'cobrou' | 'fechou'; texto: string | null };

/**
 * O chamado aberto na operadora: o protocolo num lugar só, com relógio próprio. Abrir marca sozinho
 * "esperando a operadora" (se não houver outra espera aberta).
 */
export async function abrirNaOperadora(
  app: FastifyInstance, ator: Ator, ref: string,
  d: { operadoraId?: string | null; operadoraNome?: string | null; protocolo: string; prometidoPara?: string | null; cobrarACadaHoras?: number | null; nota?: string | null },
): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora, ctx } = e;
  let nome: string;
  if (d.operadoraId) {
    const achada = ctx.operadoras.get(d.operadoraId);
    if (!achada) throw new BadRequest('Essa operadora não está no cadastro.');
    nome = achada;
  } else {
    if (!d.operadoraNome?.trim()) throw new BadRequest('Escolha a operadora do cadastro ou escreva o nome dela.');
    nome = d.operadoraNome.trim();
  }
  const protocolo = d.protocolo.trim();
  const esperas = (t.waits as Espera[] | null) ?? [];
  const marcarEspera = !esperaAberta(esperas);
  const motivoEspera = `Protocolo ${protocolo}`;
  const andamento: AndamentoOperadora = { em: agora.toISOString(), porId: pessoaDoAtor(ator), porNome: integracaoDoAtor(ator), acao: 'abriu', texto: d.nota?.trim() || null };
  await app.db.transaction(async (tx) => {
    await tx.insert(ticketCarrierCases).values({
      id: newId(), ticketId: t.id, carrierId: d.operadoraId || null, carrierName: nome, protocol: protocolo, openedAt: agora,
      promisedAt: d.prometidoPara ? new Date(d.prometidoPara) : null, followUpHours: d.cobrarACadaHoras ?? null, status: 'aberto',
      history: [andamento], createdById: pessoaDoAtor(ator), createdAt: agora,
    });
    await registrarEvento(tx, t.id, 'operadora', ator, { acao: 'abriu', operadora: nome, protocolo }, e.quando());
    if (marcarEspera) {
      const lista: Espera[] = [...esperas, { tipo: 'operadora', motivo: motivoEspera, inicio: agora.toISOString(), fim: null, porId: pessoaDoAtor(ator) }];
      await registrarEvento(tx, t.id, 'espera', ator, { tipo: 'operadora', motivo: motivoEspera }, e.quando());
      await tx.update(tickets).set({ waits: lista, updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, t.id));
    } else {
      await tx.update(tickets).set({ updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, t.id));
    }
  });
  await contarAosObservadores(app, ator, t, `${ator.nome} abriu o protocolo ${protocolo} na ${nome} para o ${t.code}`);
  return { ...nada(t), resumo: `Abriu o protocolo ${protocolo} na ${nome} para ${t.code}` };
}

/** Cobrar a operadora, ou fechar o protocolo (que tira a marca "esperando a operadora", se for ela a aberta). */
export async function andamentoNaOperadora(app: FastifyInstance, ator: Ator, ref: string, casoId: string, d: { acao: 'cobrar' | 'fechar'; texto?: string | null }): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  const [c] = await app.db.select().from(ticketCarrierCases).where(and(eq(ticketCarrierCases.id, casoId), eq(ticketCarrierCases.ticketId, t.id))).limit(1);
  if (!c) throw new NotFound('Protocolo da operadora');
  if (c.status === 'fechado') throw new BadRequest(`O protocolo ${c.protocol} já foi fechado.`);
  const acao = d.acao === 'fechar' ? 'fechou' : 'cobrou';
  const texto = d.texto?.trim() || null;
  const historico = [...((c.history as AndamentoOperadora[] | null) ?? []), { em: agora.toISOString(), porId: pessoaDoAtor(ator), porNome: integracaoDoAtor(ator), acao, texto } satisfies AndamentoOperadora];
  const esperas = (t.waits as Espera[] | null) ?? [];
  const aberta = esperaAberta(esperas);
  const tiraEspera = acao === 'fechou' && aberta?.tipo === 'operadora';
  await app.db.transaction(async (tx) => {
    await tx.update(ticketCarrierCases).set({ history: historico, ...(acao === 'fechou' ? { status: 'fechado', closedAt: agora } : {}) }).where(eq(ticketCarrierCases.id, c.id));
    await registrarEvento(tx, t.id, 'operadora', ator, { acao, operadora: c.carrierName, protocolo: c.protocol, texto }, e.quando());
    const set: SetChamado = { updatedAt: agora, lastActivityAt: agora };
    if (tiraEspera && aberta) {
      const minutos = Math.max(0, Math.round((agora.getTime() - Date.parse(aberta.inicio)) / 60_000));
      set.waits = esperas.map((w) => (w === aberta ? { ...w, fim: agora.toISOString() } : w));
      await registrarEvento(tx, t.id, 'espera', ator, { tipo: null, antes: 'operadora', minutos, duracao: duracaoDoPrazo(minutos) }, e.quando());
    }
    await tx.update(tickets).set(set).where(eq(tickets.id, t.id));
  });
  await contarAosObservadores(app, ator, t, acao === 'fechou'
    ? `${ator.nome} fechou o protocolo ${c.protocol} da ${c.carrierName} no ${t.code}`
    : `${ator.nome} cobrou a ${c.carrierName} (protocolo ${c.protocol}) no ${t.code}`);
  return {
    ...nada(t),
    resumo: acao === 'fechou' ? `Fechou o protocolo ${c.protocol} da ${c.carrierName} em ${t.code}` : `Cobrou a ${c.carrierName} (protocolo ${c.protocol}) em ${t.code}`,
  };
}

/** Observar o chamado sem ser o responsável: os avisos de toda atualização chegam para quem observa (como no Helena). */
export async function observar(app: FastifyInstance, ator: Ator, ref: string, acompanhar: boolean): Promise<Feito> {
  exigirTrabalhar(ator);
  if (ator.tipo !== 'pessoa') throw new BadRequest('Só uma pessoa observa um chamado.');
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  if (t.watcherIds.includes(ator.id) === acompanhar) return nada(t);
  const lista = acompanhar ? [...t.watcherIds, ator.id] : t.watcherIds.filter((x) => x !== ator.id);
  await app.db.transaction(async (tx) => {
    await tx.update(tickets).set({ watcherIds: lista, updatedAt: agora }).where(eq(tickets.id, t.id));
    await registrarEvento(tx, t.id, 'observador', ator, { acao: acompanhar ? 'entrou' : 'saiu' }, e.quando());
  });
  return { ...nada(t), resumo: `${acompanhar ? 'Passou a observar' : 'Deixou de observar'} ${t.code}` };
}

// =====================================================================
//  AVISAR O CLIENTE E A RESPOSTA PRONTA
// =====================================================================

/**
 * Manda uma mensagem ao contato pelo WhatsApp oficial. O histórico registra mesmo quando não vai;
 * nesse caso o `Feito` traz o `erro` (a rota audita e devolve 400 com a mensagem).
 */
export async function avisarCliente(app: FastifyInstance, ator: Ator, ref: string, texto: string): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  if (!t.contactPhone) throw new BadRequest('O chamado não tem o WhatsApp do contato.');
  const r = await mandarAoCliente(app, ator, t, texto.trim(), e.quando());
  if (!r.ok) return { ...nada(t), resumo: `Tentou avisar o cliente de ${t.code} pelo WhatsApp, mas não foi: ${r.mensagem}`, erro: r.mensagem };
  await app.db.update(tickets).set({ updatedAt: agora, lastActivityAt: agora, ...(ator.tipo === 'pessoa' && !t.firstResponseAt ? { firstResponseAt: agora } : {}) }).where(eq(tickets.id, t.id));
  await contarAosObservadores(app, ator, t, `${ator.nome} mandou ao cliente, no ${t.code}: "${trecho(texto.trim().replace(/\s+/g, ' '), 140)}"`);
  return { ...nada(t), resumo: `Avisou o cliente de ${t.code} pelo WhatsApp`, depois: { texto } };
}

/**
 * A resposta pronta: um clique manda o texto e muda o chamado. Antes de tudo, confere o movimento (se
 * a resposta leva o chamado para uma etapa): faltando algo, nada acontece. Depois, na ordem: o aviso
 * ao cliente (se falhar, para aí) ou a anotação; a espera; a etiqueta; assumir; a etapa.
 */
export async function usarResposta(app: FastifyInstance, ator: Ator, ref: string, d: { respostaId: string; texto?: string | null }): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { ctx, t, painel } = e;
  const [m] = await app.db.select().from(ticketMacros).where(and(eq(ticketMacros.id, d.respostaId), isNull(ticketMacros.deletedAt))).limit(1);
  if (!m || !m.active || (m.panelId && m.panelId !== t.panelId)) throw new BadRequest('Essa resposta pronta não existe (ou não vale neste painel).');
  const acao = lerAcao(m.action);
  const texto = d.texto?.trim() || preencherModelo(m.body, {
    contato: t.contactName, codigo: t.code, cliente: nomeCliente(ctx, t.clientId), titulo: t.title,
    responsavel: pessoaCurta(ctx, t.assigneeId)?.nome ?? null, eu: ator.nome,
  });
  const assume = acao.assumir && ator.tipo === 'pessoa';

  // antes de tudo, o movimento: faltando algo para a etapa, nada acontece
  let para: EtapaPainel | null = null;
  if (acao.etapaId) {
    para = painel.etapas.find((x) => x.id === acao.etapaId) ?? null;
    if (!para) throw new BadRequest(`A resposta pronta "${m.name}" leva para uma etapa que não é do painel ${painel.nome}.`);
    if (para.id === t.stageId) para = null;
  }
  if (para) await conferirMovimento(app.db, e, para, { motivo: m.name, responsavelId: assume ? ator.id : undefined, nivel: true });

  if (acao.avisarCliente) {
    if (!t.contactPhone) throw new BadRequest('O chamado não tem o WhatsApp do contato.');
    if (!texto) throw new BadRequest(`A resposta pronta "${m.name}" está sem texto para mandar ao cliente.`);
    const r = await mandarAoCliente(app, ator, t, texto, e.quando());
    if (!r.ok) return { ...nada(t), resumo: `Tentou usar a resposta pronta "${m.name}" em ${t.code}, mas o WhatsApp não foi: ${r.mensagem}`, erro: r.mensagem };
    await app.db.update(tickets).set({ updatedAt: e.agora, lastActivityAt: e.agora, ...(ator.tipo === 'pessoa' && !t.firstResponseAt ? { firstResponseAt: e.agora } : {}) }).where(eq(tickets.id, t.id));
    await contarAosObservadores(app, ator, t, `${ator.nome} mandou ao cliente, no ${t.code}: "${trecho(texto.replace(/\s+/g, ' '), 140)}"`);
  }
  await registrarEvento(app.db, t.id, 'resposta_pronta', ator, { nome: m.name }, e.quando());
  if (!acao.avisarCliente && texto) await anotar(app, ator, t.id, { texto, anexos: [] });
  if (acao.esperar === 'cliente' || acao.esperar === 'operadora') await esperar(app, ator, t.id, { tipo: acao.esperar, motivo: m.name });
  else if (acao.esperar === 'nada') await esperar(app, ator, t.id, { tipo: null });
  if (acao.etiqueta && !t.tags.some((x) => paraBusca(x) === paraBusca(acao.etiqueta!))) await alterar(app, ator, t.id, { etiquetas: [...t.tags, acao.etiqueta] });
  if (assume) await assumir(app, ator, t.id, { mover: !para });
  if (para) {
    // o motivo só vai quando o movimento é de nível (escalonar ou voltar): o nome da resposta explica
    const [linha] = await app.db.select({ stageId: tickets.stageId }).from(tickets).where(eq(tickets.id, t.id)).limit(1);
    const de = linha ? ctx.etapas.get(linha.stageId)?.etapa ?? null : null;
    await mover(app, ator, t.id, { etapaId: para.id, motivo: movimentoDeNivel(de, para) ? m.name : null });
  }
  return { ...nada(t), resumo: `Usou a resposta pronta "${m.name}" em ${t.code}`, depois: { texto } };
}

// =====================================================================
//  A LIXEIRA (quem cuida dos chamados)
// =====================================================================

export async function mandarParaLixeira(app: FastifyInstance, ator: Ator, ref: string): Promise<Feito> {
  if (!podeCuidar(ator)) throw new Forbidden('Esta ação exige a permissão "tickets.manage"');
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  await app.db.transaction(async (tx) => {
    await tx.update(tickets).set({ deletedAt: agora, updatedAt: agora }).where(eq(tickets.id, t.id));
    await registrarEvento(tx, t.id, 'lixeira', ator, { acao: 'mandou' }, e.quando());
  });
  await contarAosObservadores(app, ator, t, `${ator.nome} mandou o ${t.code} para a lixeira`);
  return { ...nada(t), resumo: `Mandou ${t.code} "${t.title}" para a lixeira` };
}

export async function restaurar(app: FastifyInstance, ator: Ator, ref: string): Promise<Feito> {
  if (!podeCuidar(ator)) throw new Forbidden('Esta ação exige a permissão "tickets.manage"');
  const e = await carregar(app, ator, ref, { lixeira: true });
  const { t, agora } = e;
  if (!t.deletedAt) throw new BadRequest(`O ${t.code} não está na lixeira.`);
  await app.db.transaction(async (tx) => {
    await tx.update(tickets).set({ deletedAt: null, updatedAt: agora }).where(eq(tickets.id, t.id));
    await registrarEvento(tx, t.id, 'lixeira', ator, { acao: 'restaurou' }, e.quando());
  });
  await contarAosObservadores(app, ator, t, `${ator.nome} tirou o ${t.code} da lixeira`);
  return { ...nada(t), resumo: `Restaurou ${t.code} "${t.title}" da lixeira` };
}

// =====================================================================
//  O CONTRATO PARA AS INTEGRAÇÕES, O AGENDADO E O RELÓGIO
// =====================================================================
// As mesmas regras da tela (é a mesma função por baixo); quem chama escreve a própria auditoria e
// lê a ficha depois com `fichaDoChamado`.

export async function alterarChamado(app: FastifyInstance, ator: Ator, ref: string, d: ChamadoAlterar): Promise<void> {
  await alterar(app, ator, ref, d);
}
export async function moverChamado(app: FastifyInstance, ator: Ator, ref: string, d: { etapaId: string; motivo?: string | null; responsavelId?: string | null }): Promise<void> {
  await mover(app, ator, ref, d);
}
export async function anotarChamado(app: FastifyInstance, ator: Ator, ref: string, d: { texto: string; anexos: Array<{ fileName: string; conteudo: string }> }): Promise<void> {
  await anotar(app, ator, ref, d);
}
export async function reabrirChamado(app: FastifyInstance, ator: Ator, ref: string, d: { motivo?: string | null; etapaId?: string | null }, opts: { observadores?: boolean } = {}): Promise<void> {
  await reabrir(app, ator, ref, d, opts);
}
