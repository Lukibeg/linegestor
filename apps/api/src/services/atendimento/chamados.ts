/**
 * OS CHAMADOS DO GESTOR — o trabalho num chamado (Patch 2.0, decisão 0047): abrir, alterar, mover
 * (e escalonar), assumir, esperar, reabrir, trocar de painel, anotar com anexos, ligar a outro
 * chamado, o pai e o problema, o checklist, o tempo, a operadora, avisar o cliente, acompanhar e a
 * lixeira. (A resposta pronta saiu no 2.0.1.)
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
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  clientContacts, clients, newId, products, ticketAttachments, ticketCarrierCases, ticketContacts, ticketEvents, ticketLinks, ticketNotes, ticketPanels,
  ticketTimeEntries, tickets, users,
  type Db,
} from '@gestor/db';
import {
  caminhoDoAssunto, campoLigado, chaveDoCampo, citadosNoTexto, codigoDoChamado, diaComAno, diaLocal, emLista, duracaoDoPrazo, etapaAoAssumir, etapaAoReabrir, etapaDeEntrada,
  faltaParaAbrir, faltaParaEtapa, filhosQueTravam, lerCamposDoPedido, mensagemDoQueFalta, mesmoValorDoCampo, movimentoDeNivel, NOME_ALCANCE, NOME_CAMPO,
  instanteLocal, NOME_ESPERA, NOME_GRAVIDADE, NOME_LIGACAO, numeroWhatsApp, paraBusca, prioridadeSugeridaDoPainel, reais, situacaoDaEtapa, textoDoValor,
  trocaEntreTiposDePainel, TROCA_ENTRA_NO_FUNIL, NEGOCIACAO_SEM_PAI, NEGOCIACAO_SEM_PROBLEMA, negociacaoNaoEPai, negociacaoNaoEIncidente,
  NEGOCIACAO_SEM_LIGACAO, negociacaoNaoSeLiga,
  valorPorProduto, mesmoValorPorProduto, textoDoValorPorProduto, NOME_VALOR_POR_PRODUTO, NOME_ATIVACAO_POR_PRODUTO, NOME_MENSALIDADE, NOME_ATIVACAO,
  VALOR_E_A_SOMA, ATIVACAO_E_A_SOMA, tituloQueFica, mensagemDoTitulo, acharCampo, compararNoQuadroDeVendas, ordemAMao, ordemDepoisDeArrastar,
  CAMPO_DAS_ETIQUETAS, chaveDaEtiqueta, etiquetasAoPedirANia, horaLocal, NIA_PEDIR_DE_NOVO_MINUTOS, resumoDaNia, temAEtiqueta,
  NOME_CONVERSA, sessaoDaConversa,
  type Alcance, type CampoDoSistema, type ChamadoAlterar, type ChamadoCriar, type DadosObrigatorios, type Espera, type EtapaPainel, type Gravidade,
  type ItemChecklist, type Origem, type Painel, type Prioridade, type SituacaoDoChamado, type TipoEspera, type TipoEvento, type TipoLigacaoChamado,
  type ValoresDosCampos,
} from '@gestor/shared';
import { BadRequest, Conflict, Forbidden, NotFound } from '../../plugins/errors.js';
import { lerConteudo } from '../projects.js';
import { tipoDaImagem } from '../portal.js';
import { incluirOpcao } from './ajustes.js';
import { avisarEquipe, avisarObservadores, trecho } from './avisos.js';
import { etiquetasDoCatalogo, levarEtiquetas } from './etiquetas.js';
import {
  camposDoPainel, carregarContexto, chamadoVisivel, esperaAberta, eventoParaTela, exigirTrabalhar, integracaoDoAtor, lerAjustesDaNia, lerModeloDaConversa, pessoaCurta, pessoaDoAtor,
  podeCuidar, podeVerPainel, quemVeOPainel, registrarEvento, tocar, type Ator, type Contexto, type LinhaChamado,
} from './contexto.js';
import { dadosDaLinha, filhosDoChamado, IMAGENS_NA_TELA, minutosGastos } from './leitura.js';
import { emitir } from './webhooks.js';
import { mandarWhatsApp } from './whatsapp.js';

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
/**
 * Os observadores recebem o que aconteceu (quem fez, não). `texto`: a frase do sininho; `novidade`: o que
 * mudou, sem quem fez, para a mensagem do WhatsApp ("Mandou para a lixeira").
 */
const contarAosObservadores = (app: FastifyInstance, ator: Ator, t: ParaObservar, texto: string, novidade: string) =>
  avisarObservadores(app, { chamado: curto(t), observadores: t.watcherIds, texto, menos: pessoaDoAtor(ator), quem: ator.nome, novidade });
/** ...e o que mudou nele (num aviso só, enquanto não for lido). */
const camposAosObservadores = (app: FastifyInstance, ator: Ator, t: ParaObservar, nomes: string[]) =>
  avisarObservadores(app, { chamado: curto(t), observadores: t.watcherIds, menos: pessoaDoAtor(ator), campos: { quem: ator.nome, nomes } });
const etapaCurta = (e: EtapaPainel | null) => (e ? { id: e.id, nome: e.nome, nivel: e.nivel } : null);

// ---------- os nomes legíveis (o histórico mostra o que a pessoa vê na tela, não o id) ----------

const NOME_TITULO = 'Título';
const NOME_CONTORNO = 'Solução de contorno';
const NOME_TELEFONE = 'WhatsApp do contato';
// o nome que o histórico usa para a troca de etiquetas (o resumo da NIA, 2.1, procura por ele)
const NOME_ETIQUETAS = CAMPO_DAS_ETIQUETAS;
const NOME_OBSERVADORES = 'Observadores';
const NOME_EMPRESA = 'Empresa';
const NOME_MOTIVO_PERDA = 'Motivo da perda';

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
/**
 * A opção escrita que ainda não existe numa lista que inclui na hora (a Indicação, 2.0.3) entra nela antes de os
 * campos serem lidos: o n8n, o robô e a API mandam o nome (a tela inclui pelo "Incluir" da caixa). Muda o contexto
 * desta leitura, para o `lerCampos` achar a opção nova.
 */
async function incluirOpcoesEscritas(db: Db, ctx: Contexto, painel: Painel, pedidos: Record<string, unknown>) {
  for (const [chave, v] of Object.entries(pedidos)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const campo = acharCampo(camposDoPainel(ctx, painel.id), chave);
    if (!campo?.ativo || !campo.incluirNaHora) continue;
    const nome = v.trim().replace(/\s+/g, ' ');
    if (nome.length > 60 || campo.opcoes.some((o) => o.id === nome || (o.ativa && paraBusca(o.nome) === paraBusca(nome)))) continue;
    const r = await incluirOpcao(db, campo.id, nome);
    campo.opcoes = [...campo.opcoes.filter((o) => o.id !== r.valor.id), r.valor];
  }
}

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
 * Manda ao contato pelo WhatsApp oficial (pelo modelo aprovado, ou no texto livre dos Ajustes) e
 * registra no histórico — mesmo quando não vai, para ficar o porquê.
 */
async function mandarAoCliente(
  app: FastifyInstance, ator: Ator, t: Pick<LinhaChamado, 'id' | 'code' | 'title' | 'contactName' | 'contactPhone' | 'clientId' | 'assigneeId'>, texto: string, em: Date,
) {
  let r: { ok: boolean; mensagem: string; modelo?: boolean };
  if (!t.contactPhone) r = { ok: false, mensagem: 'O chamado não tem o WhatsApp do contato.' };
  else {
    // os valores do chamado (as variáveis do modelo e os marcadores do texto livre) e quem manda
    const [cliente, pessoas] = await Promise.all([
      t.clientId ? app.db.select({ nome: clients.tradeName }).from(clients).where(eq(clients.id, t.clientId)).limit(1) : Promise.resolve([]),
      app.db.select({ id: users.id, nome: users.name, email: users.email }).from(users)
        .where(inArray(users.id, [t.assigneeId, ator.tipo === 'pessoa' ? ator.id : null].filter((x): x is string => !!x).concat('-'))),
    ]);
    const quem = ator.tipo === 'pessoa' ? pessoas.find((p) => p.id === ator.id) ?? null : null;
    r = await mandarWhatsApp(app.db, app.vault, {
      de: 'cliente', para: t.contactPhone, texto,
      valores: {
        contato: t.contactName, codigo: t.code, titulo: t.title, cliente: cliente[0]?.nome ?? null, texto,
        responsavel: pessoas.find((p) => p.id === t.assigneeId)?.nome ?? null, eu: ator.nome,
      },
      quem: quem ? { email: quem.email } : null,
    });
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
): Promise<{ id: string; codigo: string; titulo: string; aviso?: { ok: boolean; mensagem: string } }> {
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
  const naTela = origem === 'manual' || origem === 'botao';

  // a conversa do LineChat: na tela, o link colado (o chamado ativo, 2.1) ou o código que o botão da
  // conversa trouxe — o que não dá para ler é recusado; o robô, o n8n e o agendado mandam o código da sessão
  // como o LineChat deu, e ele fica como veio (o robô acha por ele o chamado aberto da mesma conversa)
  let sessaoId = d.sessaoId ?? null;
  if (sessaoId && naTela) {
    const lida = sessaoDaConversa(sessaoId, await lerModeloDaConversa(db));
    if (!lida.ok) throw new BadRequest(lida.erro);
    sessaoId = lida.sessaoId;
  }

  // 2. o telefone que o Gestor já conhece preenche o cliente (e o nome do contato, se faltou): primeiro os
  // contatos cadastrados dos clientes (a aba Contatos); depois, o que ele aprendeu dos chamados
  let telefone = d.contatoTelefone ? numeroWhatsApp(d.contatoTelefone) ?? d.contatoTelefone.trim() : null;
  let clienteId = d.clienteId ?? null;
  let contatoNome = d.contatoNome ?? null;
  if (telefone) {
    const cadastrados = await db.select({ clientId: clientContacts.clientId, nome: clientContacts.name }).from(clientContacts)
      .innerJoin(clients, eq(clients.id, clientContacts.clientId))
      .where(and(eq(clientContacts.phone, telefone), eq(clientContacts.active, true), isNull(clients.deletedAt)));
    // o mesmo número em dois clientes: o cliente não é adivinhado (vale o aprendido, ou a pessoa escolhe)
    const doCadastro = clienteId ? cadastrados.find((c) => c.clientId === clienteId) : cadastrados.length === 1 ? cadastrados[0] : undefined;
    if (doCadastro) {
      if (!clienteId) clienteId = doCadastro.clientId;
      if (!contatoNome) contatoNome = doCadastro.nome;
    }
    const [conhecido] = await db.select().from(ticketContacts).where(eq(ticketContacts.phone, telefone)).limit(1);
    if (conhecido) {
      if (!clienteId && conhecido.clientId && (await clienteExiste(db, conhecido.clientId))) clienteId = conhecido.clientId;
      if (!contatoNome && conhecido.name) contatoNome = conhecido.name;
    }
  }

  // os campos do sistema que o painel desligou: o que vier para eles fica de fora (o robô, o n8n e o
  // agendado não travam por isso); os campos do painel são conferidos um a um
  const usa = (c: CampoDoSistema) => campoLigado(painel.ajustes, c);
  // o painel sem o cliente e o contato (2.1.2, um painel de atividades internas): o chamado é interno
  if (!usa('cliente')) { clienteId = null; contatoNome = null; telefone = null; }
  // o assunto (do mesmo painel, ativo) traz o checklist dele; o tipo é uma opção do painel
  const assunto = d.assuntoId && usa('assunto') ? conferirAssunto(ctx, d.assuntoId, painel) : null;
  const tipo = usa('tipo') ? conferirTipo(d.tipo, painel) : null;
  const gravidade = usa('gravidade') ? d.gravidade ?? null : null;
  const alcance = usa('alcance') ? d.alcance ?? null : null;
  const checklist = [...(assunto?.checklist ?? []).map((x) => itemNovo(x, true)), ...(opts.checklistExtra ?? []).map((x) => itemNovo(x, false))];
  const campos: ValoresDosCampos = {};
  await incluirOpcoesEscritas(db, ctx, painel, d.campos ?? {});
  for (const i of lerCampos(ctx, painel, d.campos ?? {})) if (i.valor !== null) campos[i.campo.id] = i.valor;

  // a negociação (só no painel de Vendas): o valor e a empresa que ainda não é cliente; a venda não tem
  // prioridade (nem o aviso do Crítico)
  const vendas = painel.tipo === 'vendas';

  // 4. a prioridade: sem escolha, a sugerida (gravidade × alcance; no painel sem o alcance, só a
  // gravidade); trocar a sugerida pede o motivo
  const sugerida = vendas ? null : prioridadeSugeridaDoPainel(painel.ajustes, gravidade, alcance, ctx.prazos);
  const prioridade = vendas || !usa('prioridade') ? null : d.prioridade ?? sugerida;
  const produtos = usa('produtos') ? unicos(d.produtos ?? []) : [];
  const operadoras = usa('operadoras') ? unicos(d.operadoras ?? []) : [];
  // o valor (a mensalidade) e a ativação: cada um único, ou o total por produto (a soma de cada produto)
  const conta = vendas
    ? valorPorProduto({ produtos, valores: {}, valor: null }, { valores: usa('produtos') ? d.valoresDosProdutos ?? {} : {}, ...(d.valor !== null ? { valor: d.valor } : {}) })
    : null;
  if (conta && !conta.ok) throw new BadRequest(conta.erro);
  const contaAtivacao = vendas
    ? valorPorProduto({ produtos, valores: {}, valor: null }, { valores: usa('produtos') ? d.ativacoesDosProdutos ?? {} : {}, ...(d.ativacao !== null ? { valor: d.ativacao } : {}) }, ATIVACAO_E_A_SOMA)
    : null;
  if (contaAtivacao && !contaAtivacao.ok) throw new BadRequest(contaAtivacao.erro);
  const valor = conta?.ok ? conta.valor : null;
  const valoresDosProdutos = conta?.ok ? conta.valores : {};
  const ativacao = contaAtivacao?.ok ? contaAtivacao.valor : null;
  const ativacoesDosProdutos = contaAtivacao?.ok ? contaAtivacao.valores : {};
  const empresa = vendas && !clienteId ? d.empresa ?? null : null;
  // o título: o chamado pede pelo menos 3 letras; a negociação sem título fica com o nome da empresa (2.0.3)
  const titulo = tituloQueFica(d.titulo ?? '', { vendas, empresa: vendas ? (clienteId ? ctx.clientes.get(clienteId) ?? null : empresa) : null });
  if (!titulo) throw new BadRequest(mensagemDoTitulo(d.titulo ?? '', vendas));

  // 3. o que o painel pede para abrir
  const dados: DadosObrigatorios = {
    tipoChamado, clienteId, contatoNome, contatoTelefone: telefone, relato: usa('relato') ? d.relato ?? null : null, descricao: d.descricao ?? null,
    assuntoId: assunto?.id ?? null, tipo, gravidade, alcance, prioridade,
    produtos, operadoras, responsavelId: d.responsavelId ?? null,
    solucao: null, causa: null, validacao: null, checklist, tempoMinutos: 0, campos, valor, ativacao, empresa,
  };
  // o que o painel pede para abrir vale para quem abre na tela (e pelo botão da conversa); o robô e o
  // agendado abrem sempre — o pedido do cliente não se perde por falta de um campo, e o que faltar é
  // pedido para o chamado andar de etapa
  const faltam = naTela ? faltaParaAbrir(dados, painel.ajustes) : [];
  if (faltam.length) throw new BadRequest(mensagemDoQueFalta(faltam, undefined, ctx.campos), { faltam });
  if (prioridade && sugerida && prioridade !== sugerida && !d.motivoPrioridade) throw new BadRequest('Trocar a prioridade sugerida pede o motivo.');

  // 5. o que foi citado existe
  if (clienteId) await conferirCliente(db, clienteId);
  await conferirProdutos(db, produtos);
  conferirOperadoras(ctx, operadoras);
  if (d.responsavelId) conferirPessoa(ctx, d.responsavelId);
  const observadores = unicos(d.observadores ?? []);
  for (const id of observadores) conferirPessoa(ctx, id, 'Um dos observadores escolhidos');
  // a negociação não tem pai nem filhos, nem problema (2.0.1, decisão 0050): fica sozinha no painel de Vendas
  if (vendas && d.paiId) throw new BadRequest(NEGOCIACAO_SEM_PAI);
  if (vendas && (tipoChamado === 'problema' || d.problemaId)) throw new BadRequest(NEGOCIACAO_SEM_PROBLEMA);
  const ehNegociacao = (c: LinhaChamado) => ctx.paineis.find((p) => p.id === c.panelId)?.tipo === 'vendas';
  const pai = d.paiId ? await outroChamado(db, d.paiId, ator, ctx) : null;
  if (pai && ehNegociacao(pai)) throw new BadRequest(negociacaoNaoEPai(pai.code));
  const problema = d.problemaId ? await outroChamado(db, d.problemaId, ator, ctx) : null;
  if (problema && problema.kind !== 'problema') throw new BadRequest(`${problema.code} não é um problema.`);
  if ((d.incidentes ?? []).length && tipoChamado !== 'problema') throw new BadRequest('Só um problema junta incidentes.');
  const incidentes: LinhaChamado[] = [];
  for (const ref of unicos(d.incidentes ?? [])) {
    const inc = await outroChamado(db, ref, ator, ctx);
    if (inc.kind !== 'chamado') throw new BadRequest(`${inc.code} é um problema: o incidente precisa ser um chamado.`);
    if (ehNegociacao(inc)) throw new BadRequest(negociacaoNaoEIncidente(inc.code));
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
    // as etiquetas como estão no catálogo; a nova entra nele com a cor escolhida na tela (ou cinza)
    const etiquetas = await etiquetasDoCatalogo(tx, painel.id, d.etiquetas ?? [], d.coresDasEtiquetas ?? {}, pessoa);
    await tx.insert(tickets).values({
      id, panelId: painel.id, stageId: etapa.id, number: numero, code: codigo, kind: tipoChamado, title: titulo,
      customerReport: dados.relato, description: dados.descricao, clientId: clienteId, contactName: contatoNome, contactPhone: telefone,
      sessionId: sessaoId, origin: origem, assigneeId: d.responsavelId ?? null, subjectId: assunto?.id ?? null, type: tipo,
      severity: gravidade, reach: alcance, priority: prioridade, priorityReason: motivoPrioridade,
      productIds: produtos, carrierIds: operadoras, tags: etiquetas, customFields: campos,
      valueCents: valor, productValues: valoresDosProdutos, setupCents: ativacao, productSetup: ativacoesDosProdutos, prospect: empresa,
      parentId: pai?.id ?? null, problemId: problema?.id ?? null, checklist, watcherIds: observadores,
      // a pessoa que abre na tela já está falando com o cliente: a abertura é a primeira resposta
      firstResponseAt: ator.tipo === 'pessoa' && naTela ? agora : null,
      lastActivityAt: agora, scheduleId: opts.agendadoId ?? null, createdById: pessoa, createdAt: agora, updatedAt: agora,
    });
    await registrarEvento(tx, id, 'criado', ator, { origem, etapa: etapa.nome, etapaId: etapa.id, painel: painel.nome, ...(vendas ? { venda: true } : {}) }, quando());
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
  const chamado = { id: criado.id, codigo: criado.codigo, titulo };
  if (d.responsavelId) await avisarEquipe(app, { evento: 'recebeu', para: [d.responsavelId], chamado, texto: `Você recebeu o chamado ${criado.codigo}`, menos: pessoa, quem: ator.nome });
  if (prioridade === 'critica') await avisarEquipe(app, { evento: 'critico', para: painel.ajustes.supervisores, chamado, texto: `Chegou um chamado Crítico: ${criado.codigo}`, menos: pessoa, quem: ator.nome });
  // quem foi posto como observador fica sabendo (e, dali em diante, recebe toda atualização)
  await avisarObservadores(app, {
    chamado, observadores, texto: `${ator.nome} pôs você como observador do ${criado.codigo}`, menos: pessoa, jaAvisados: [d.responsavelId],
    quem: ator.nome, novidade: 'Pôs você como observador',
  });

  // 12. o número do chamado ao cliente (o chamado fica criado mesmo se o WhatsApp não for)
  let aviso: { ok: boolean; mensagem: string } | undefined;
  if (d.avisarCliente) {
    aviso = await mandarAoCliente(app, ator, { id: criado.id, code: criado.codigo, title: titulo, contactName: contatoNome, contactPhone: telefone, clientId: clienteId, assigneeId: d.responsavelId ?? null },
      'Abrimos este chamado para o seu atendimento. Qualquer novidade, avisamos por aqui.', quando());
  }

  // 13. para fora
  emitir(app, 'chamado.criado', criado.id);
  return { id: criado.id, codigo: criado.codigo, titulo, ...(aviso ? { aviso } : {}) };
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
    // a negociação não tem prioridade; o painel de Gestão pode não ter (2.1.2), nem o cliente, o relato, a solução e a causa
    ...(painel.tipo === 'vendas' || !usa('prioridade') ? { prioridade: undefined, motivoPrioridade: undefined } : {}),
    ...(usa('cliente') ? {} : { clienteId: undefined, contatoNome: undefined, contatoTelefone: undefined }),
    ...(usa('relato') ? {} : { relato: undefined }),
    // o problema (ITIL) sempre tem a solução e a causa
    ...(usa('solucao') || t.kind === 'problema' ? {} : { solucao: undefined, causa: undefined }),
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
  // o título: o chamado pede pelo menos 3 letras; a negociação sem título fica com o nome da empresa, e o título que
  // era o nome da empresa acompanha a empresa quando ela muda (2.0.3: "se eu n colocar nada vai ser o nome do
  // cliente") — o nome da empresa de depois é conhecido só depois do cliente e da empresa, mais abaixo
  const vendas = painel.tipo === 'vendas';
  const empresaDe = (clienteId: string | null, prospect: string | null) => (clienteId ? ctx.clientes.get(clienteId) ?? null : prospect);
  const empresaAntes = vendas ? empresaDe(t.clientId, t.prospect) : null;
  const posTitulo = eventos.length;

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
  // a conversa do LineChat (2.1, o chamado ativo): o link colado ou o código da sessão; vazio tira. Com
  // ela, a ficha mostra o link e a NIA (e o Preencher com IA) lê o que foi dito
  if (d.sessaoId !== undefined) {
    const lida = sessaoDaConversa(d.sessaoId, await lerModeloDaConversa(db));
    if (!lida.ok) throw new BadRequest(lida.erro);
    if (lida.sessaoId !== t.sessionId) { set.sessionId = lida.sessaoId; campo('sessaoId', NOME_CONVERSA, t.sessionId, lida.sessaoId, t.sessionId); }
  }

  // a negociação (só no painel de Vendas): a empresa que ainda não é cliente, o valor e o motivo da perda
  // (que só a perdida tem)
  if (painel.tipo === 'vendas') {
    if (d.empresa !== undefined && d.empresa !== t.prospect) { set.prospect = d.empresa; campo('empresa', NOME_EMPRESA, t.prospect, d.empresa, t.prospect); }
  }
  {
    const empresaDepois = vendas ? empresaDe(set.clientId !== undefined ? set.clientId : t.clientId, set.prospect !== undefined ? set.prospect : t.prospect) : null;
    let novo: string | undefined;
    if (d.titulo !== undefined) {
      const tf = tituloQueFica(d.titulo, { vendas, empresa: empresaDepois });
      if (!tf) throw new BadRequest(mensagemDoTitulo(d.titulo, vendas));
      novo = tf;
    } else if (vendas && empresaAntes && empresaDepois && empresaDepois !== empresaAntes && paraBusca(t.title) === paraBusca(empresaAntes)) {
      novo = empresaDepois.slice(0, 200);
    }
    if (novo !== undefined && novo !== t.title) {
      set.title = novo;
      // no histórico, o título vem primeiro (a ordem da ficha)
      eventos.splice(posTitulo, 0, ['campo', { campo: NOME_TITULO, de: t.title, para: novo }]);
      mudancas.unshift('titulo'); nomes.unshift(NOME_TITULO); antes.titulo = t.title;
    }
  }
  if (painel.tipo === 'vendas') {
    if (d.motivoPerda !== undefined && d.motivoPerda !== t.lostReason) {
      if (e.etapa?.resultado !== 'perdido') throw new BadRequest('O motivo da perda é só da negociação perdida.');
      if (!d.motivoPerda) throw new BadRequest('A negociação perdida precisa do motivo.');
      set.lostReason = d.motivoPerda;
      campo('motivoPerda', NOME_MOTIVO_PERDA, t.lostReason, d.motivoPerda, t.lostReason);
    }
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
  // o valor da negociação, depois dos produtos: a mensalidade (o que conta) e a ativação (à parte), cada
  // uma única ou o total por produto (o produto que saiu leva os valores dele junto)
  if (painel.tipo === 'vendas') {
    const produtosAgora = set.productIds ?? t.productIds;
    const nomes = (ids: string[]) => ids.map((id) => ({ id, nome: ctx.produtos.get(id)?.nome ?? '?' }));
    const partes = [
      { valorAntes: t.valueCents, valoresAntes: t.productValues ?? {}, pedidoValor: d.valor, pedidoValores: d.valoresDosProdutos, erro: VALOR_E_A_SOMA,
        nome: NOME_MENSALIDADE, nomePorProduto: NOME_VALOR_POR_PRODUTO, chave: 'valor', chavePorProduto: 'valoresDosProdutos', colunas: ['valueCents', 'productValues'] },
      { valorAntes: t.setupCents, valoresAntes: t.productSetup ?? {}, pedidoValor: d.ativacao, pedidoValores: d.ativacoesDosProdutos, erro: ATIVACAO_E_A_SOMA,
        nome: NOME_ATIVACAO, nomePorProduto: NOME_ATIVACAO_POR_PRODUTO, chave: 'ativacao', chavePorProduto: 'ativacoesDosProdutos', colunas: ['setupCents', 'productSetup'] },
    ] as const;
    for (const x of partes) {
      const conta = valorPorProduto(
        { produtos: t.productIds, valores: x.valoresAntes, valor: x.valorAntes },
        { produtos: produtosAgora, ...(x.pedidoValores !== undefined && usa('produtos') ? { valores: x.pedidoValores } : {}), ...(x.pedidoValor !== undefined ? { valor: x.pedidoValor } : {}) },
        x.erro,
      );
      if (!conta.ok) throw new BadRequest(conta.erro);
      if (!mesmoValorPorProduto(conta.valores, x.valoresAntes)) {
        set[x.colunas[1]] = conta.valores;
        campo(x.chavePorProduto, x.nomePorProduto, textoDoValorPorProduto(nomes(t.productIds), x.valoresAntes), textoDoValorPorProduto(nomes(produtosAgora), conta.valores), x.valoresAntes);
      }
      if (conta.valor !== x.valorAntes) {
        set[x.colunas[0]] = conta.valor;
        campo(x.chave, x.nome, x.valorAntes === null ? null : reais(x.valorAntes), conta.valor === null ? null : reais(conta.valor), x.valorAntes);
      }
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
    await incluirOpcoesEscritas(db, ctx, painel, d.campos);
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
    // como estão no catálogo; a nova entra nele com a cor escolhida na tela (ou cinza)
    const novas = await etiquetasDoCatalogo(db, t.panelId, d.etiquetas, d.coresDasEtiquetas ?? {}, pessoaDoAtor(ator));
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
  if (recebeu) await avisarEquipe(app, { evento: 'recebeu', para: [recebeu], chamado, texto: `Você recebeu o chamado ${t.code}`, menos, quem: ator.nome });
  // os observadores: quem entrou fica sabendo; os outros recebem o que mudou (o responsável, num aviso
  // próprio; os campos, juntos num aviso só enquanto não for lido)
  if (observadoresNovos.length) {
    await avisarObservadores(app, {
      chamado, observadores: observadoresNovos, texto: `${ator.nome} pôs você como observador do ${t.code}`, menos, jaAvisados: [recebeu],
      quem: ator.nome, novidade: 'Pôs você como observador',
    });
  }
  const observadores = (set.watcherIds ?? t.watcherIds).filter((x) => !observadoresNovos.includes(x));
  if (set.assigneeId !== undefined) {
    const novo = set.assigneeId ? pessoaCurta(ctx, set.assigneeId)?.nome ?? 'outra pessoa' : null;
    const texto = novo ? `${ator.nome} passou o ${t.code} para ${novo}` : `${ator.nome} deixou o ${t.code} sem responsável`;
    await avisarObservadores(app, { chamado, observadores, texto, menos, jaAvisados: [recebeu], quem: ator.nome, novidade: novo ? `Passou para ${novo}` : 'Deixou sem responsável' });
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

/** Marcar a negociação como ganha ou perdida: o motivo da perda e o dia em que ela acabou (nulo = agora). */
type Resultado = { motivoPerda: string | null; concluidoEm: string | null };

/**
 * O Ganho e o Perdido (o painel de Vendas): o dia em que a negociação acabou é hoje ou antes (sem ele,
 * agora); o Perdido pede o motivo (o `conferirMovimento` cobra). Nos outros movimentos, nada disso vale.
 */
function conferirResultado(e: Estado, para: EtapaPainel, d: { motivoPerda?: string | null; concluidoEm?: string | null }): Resultado | null {
  if (!para.resultado) return null;
  const concluidoEm = d.concluidoEm || null;
  if (concluidoEm && concluidoEm > diaLocal(e.agora)) throw new BadRequest('O dia em que a negociação acabou é hoje ou um dia que já passou.');
  return { motivoPerda: para.resultado === 'perdido' ? d.motivoPerda?.trim() || null : null, concluidoEm };
}
/** O instante do dia em que a negociação acabou: hoje é agora; um dia que passou, o meio-dia dele (Brasília). */
const momentoDoDia = (dia: string, agora: Date) => (dia === diaLocal(agora) ? agora : instanteLocal(dia, '12:00'));

/**
 * Confere se o chamado pode entrar na etapa: o que falta preencher, os filhos que travam (o pai só
 * resolve e fecha com os filhos fechados) e, quando é escalonar ou voltar de nível, o motivo.
 */
async function conferirMovimento(
  db: Db, e: Estado, para: EtapaPainel,
  o: { painel?: Painel; motivo: string | null; responsavelId?: string | null; nivel: boolean; venda?: Resultado | null },
): Promise<'sobe' | 'desce' | null> {
  const painel = o.painel ?? e.painel;
  const dados = {
    ...dadosDaLinha(e.t, await minutosGastos(db, e.t.id)),
    ...(o.responsavelId !== undefined ? { responsavelId: o.responsavelId } : {}),
    // o motivo da perda vem junto com o marcar como perdido (o de antes, de uma perda desfeita, não vale)
    ...(para.resultado === 'perdido' ? { motivoPerda: o.venda?.motivoPerda ?? null } : {}),
  };
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
  o: { motivo: string | null; sentido: 'sobe' | 'desce' | null; responsavelId?: string | null; motivoReabriu?: string | null; extra?: SetChamado; venda?: Resultado | null },
): Promise<Movimento> {
  const { t, agora } = e;
  const deTipo = e.etapa?.tipo ?? 'andamento';
  const antes = situacaoDaEtapa(deTipo);
  const depois = situacaoDaEtapa(para.tipo);
  const reabriu = antes !== 'aberto' && depois === 'aberto';
  // mudar de etapa apaga o lugar que a equipe tinha escolhido no quadro (2.1): chega no alto da etapa nova
  const set: SetChamado = { ...(o.extra ?? {}), stageId: para.id, boardPosition: null, updatedAt: agora, lastActivityAt: agora };
  if (para.tipo === 'resolvido') { set.resolvedAt = t.resolvedAt ?? agora; set.closedAt = null; }
  if (para.tipo === 'fechado') { set.closedAt = antes === 'fechado' ? t.closedAt ?? agora : agora; set.resolvedAt = t.resolvedAt ?? agora; }
  if (reabriu) { set.resolvedAt = null; set.closedAt = null; set.reopenCount = t.reopenCount + 1; }
  // a negociação: o Ganho e o Perdido acabam no dia dito (ou agora, quando o resultado muda); o motivo da
  // perda fica só enquanto ela está perdida (o histórico guarda o de antes)
  if (para.resultado) {
    const quando = o.venda?.concluidoEm ? momentoDoDia(o.venda.concluidoEm, agora) : para.resultado !== (e.etapa?.resultado ?? null) ? agora : null;
    if (quando) { set.closedAt = quando; set.resolvedAt = quando; }
  }
  if (para.resultado === 'perdido') set.lostReason = o.venda?.motivoPerda ?? t.lostReason;
  else if (t.lostReason) set.lostReason = null;
  if (deTipo === 'entrada' && para.tipo !== 'entrada' && ator.tipo === 'pessoa' && !t.firstResponseAt && set.firstResponseAt === undefined) set.firstResponseAt = agora;
  const trocaResponsavel = o.responsavelId !== undefined && o.responsavelId !== t.assigneeId;
  if (trocaResponsavel) set.assigneeId = o.responsavelId ?? null;
  await tx.update(tickets).set(set).where(eq(tickets.id, t.id));
  const venda = para.resultado ? {
    resultado: para.resultado, valor: t.valueCents ?? null,
    ...(para.resultado === 'perdido' ? { motivoPerda: set.lostReason ?? null } : {}),
    ...(o.venda?.concluidoEm && o.venda.concluidoEm !== diaLocal(agora) ? { concluidoEm: o.venda.concluidoEm } : {}),
  } : {};
  await registrarEvento(tx, t.id, 'etapa', ator, { de: etapaCurta(e.etapa), para: etapaCurta(para), motivo: o.motivo, sentido: o.sentido, ...venda }, e.quando());
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
  if (m.para.avisar.length) await avisarEquipe(app, { evento: 'etapa', para: m.para.avisar, chamado, texto: `${t.code} chegou em ${m.para.nome}`, menos, quem: ator.nome });
  if (m.novoResponsavel) await avisarEquipe(app, { evento: 'recebeu', para: [m.novoResponsavel], chamado, texto: `Você recebeu o chamado ${t.code}`, menos, quem: ator.nome });
  const painel = extra.painel as { para?: { nome: string } } | undefined;
  const onde = painel?.para ? `para o painel ${painel.para.nome} (${m.para.nome})` : `para ${m.para.nome}`;
  const com = m.nomeDoNovoResponsavel ? `, com ${m.nomeDoNovoResponsavel}` : '';
  const texto = `${ator.nome} ${m.reabriu ? `reabriu o ${t.code} (${m.para.nome})` : `${painel?.para ? 'passou' : 'moveu'} o ${t.code} ${onde}`}${com}`;
  // no WhatsApp, sem quem fez (vai na linha dele): "Moveu para N2, com Lúcio Andrade"
  const novidade = `${m.reabriu ? `Reabriu (${m.para.nome})` : `${painel?.para ? 'Passou' : 'Moveu'} ${onde}`}${com}`;
  if (opts.observadores !== false) {
    await avisarObservadores(app, { chamado, observadores: t.watcherIds, texto, menos, jaAvisados: [...m.para.avisar, m.novoResponsavel], quem: ator.nome, novidade });
  }
  if (m.depois === 'fechado' && m.antes !== 'fechado' && t.parentId) {
    const [pai] = await app.db.select({ id: tickets.id, code: tickets.code, title: tickets.title, assigneeId: tickets.assigneeId }).from(tickets)
      .where(and(eq(tickets.id, t.parentId), isNull(tickets.deletedAt))).limit(1);
    if (pai?.assigneeId) {
      await avisarEquipe(app, { evento: 'etapa', tipo: 'pai', para: [pai.assigneeId], chamado: curto(pai), texto: `O filho ${t.code} do ${pai.code} foi fechado`, menos, quem: ator.nome });
    }
  }
  emitir(app, 'chamado.movido', t.id, { de: m.de ? { id: m.de.id, nome: m.de.nome } : null, para: { id: m.para.id, nome: m.para.nome }, ...extra });
  if (m.depois === 'resolvido' && m.antes !== 'resolvido') emitir(app, 'chamado.resolvido', t.id);
  if (m.depois === 'fechado' && m.antes !== 'fechado') emitir(app, 'chamado.fechado', t.id);
}

function frasesDoMovimento(codigo: string, m: Movimento, sentido: 'sobe' | 'desce' | null, motivo: string | null, venda?: { valor: number | null; motivoPerda: string | null } | null) {
  if (m.para.resultado === 'ganho') return `Marcou ${codigo} como ganho${venda?.valor != null ? ` (${reais(venda.valor)}/mês)` : ''}, estava em ${m.de?.nome ?? '?'}`;
  if (m.para.resultado === 'perdido') return `Marcou ${codigo} como perdido${venda?.motivoPerda ? `: ${venda.motivoPerda}` : ''} (estava em ${m.de?.nome ?? '?'})`;
  const verbo = sentido === 'sobe' ? 'Escalonou' : sentido === 'desce' ? 'Voltou' : 'Moveu';
  return `${verbo} ${codigo} de ${m.de?.nome ?? '?'} para ${m.para.nome}${m.reabriu ? ' (reabriu)' : ''}${motivo ? `: ${motivo}` : ''}`;
}

/**
 * Leva o chamado para outra etapa do mesmo painel. `responsavelId`: ausente mantém, nulo tira (fica na
 * fila da etapa), um id passa para a pessoa.
 */
export async function mover(
  app: FastifyInstance, ator: Ator, ref: string,
  d: { etapaId: string; motivo?: string | null; responsavelId?: string | null; motivoPerda?: string | null; concluidoEm?: string | null; depoisDe?: string | null },
): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const para = e.painel.etapas.find((x) => x.id === d.etapaId);
  if (!para) throw new BadRequest('Essa etapa não é do painel deste chamado.');
  if (para.id === e.t.stageId) return nada(e.t);
  const motivo = d.motivo?.trim() || null;
  const responsavelId = d.responsavelId === undefined ? undefined : d.responsavelId || null;
  if (responsavelId) conferirPessoa(e.ctx, responsavelId);
  const venda = conferirResultado(e, para, d);
  const sentido = await conferirMovimento(app.db, e, para, { motivo, responsavelId, nivel: true, venda });
  const m = await app.db.transaction(async (tx) => {
    const feito = await gravarMovimento(tx, e, ator, para, { motivo, sentido, responsavelId, venda });
    // arrastada para um lugar da coluna (2.1): a etapa se arruma com ela ali (se a de cima saiu da etapa
    // enquanto a pessoa arrastava, ela fica no alto, como quem chega sem lugar)
    if (d.depoisDe !== undefined && ordemAMao(e.painel, para)) await arrumarNaEtapa(tx, para.id, e.t.id, d.depoisDe);
    return feito;
  });
  await depoisDoMovimento(app, ator, e.t, m);
  return { ...nada(e.t), resumo: frasesDoMovimento(e.t.code, m, sentido, motivo, venda && { valor: e.t.valueCents, motivoPerda: venda.motivoPerda }) };
}

// =====================================================================
//  A ORDEM À MÃO NO QUADRO (2.1)
// =====================================================================

/**
 * Arruma a etapa com o chamado logo abaixo de `depoisDe` (nulo: no alto), dentro da transação de quem chama: a
 * etapa inteira fica numerada (1, 2, 3…) na ordem que o quadro mostra — a que chegou sem lugar também ganha o
 * dela. As linhas da etapa ficam presas até o fim (dois arrastos ao mesmo tempo, um depois do outro). Devolve o
 * lugar (1 é o primeiro) e se algo mudou; nulo quando `depoisDe` não está na etapa.
 */
async function arrumarNaEtapa(tx: Db, etapaId: string, id: string, depoisDe: string | null): Promise<{ posicao: number; mudou: boolean } | null> {
  const linhas = await tx.select({ id: tickets.id, valor: tickets.valueCents, criadoEm: tickets.createdAt, ordem: tickets.boardPosition })
    .from(tickets).where(and(eq(tickets.stageId, etapaId), isNull(tickets.deletedAt))).for('update');
  const agora = linhas.map((l) => ({ id: l.id, valor: l.valor ?? null, criadoEm: l.criadoEm.toISOString(), ordemNoQuadro: l.ordem ?? null }))
    .sort(compararNoQuadroDeVendas);
  const ids = agora.map((c) => c.id);
  const nova = ordemDepoisDeArrastar(ids, id, depoisDe);
  if (!nova) return null;
  const antes = new Map(agora.map((c) => [c.id, c.ordemNoQuadro]));
  for (const [i, x] of nova.entries()) {
    if (antes.get(x) !== i + 1) await tx.update(tickets).set({ boardPosition: i + 1 }).where(eq(tickets.id, x));
  }
  // mudou para quem olha o quadro: o arrastado trocou de lugar (numerar a etapa sem mexer na ordem não conta)
  return { posicao: nova.indexOf(id) + 1, mudou: nova.indexOf(id) !== ids.indexOf(id) };
}

/**
 * Muda o lugar da negociação na coluna do quadro, arrastando (2.1, o pedido do Luan: "quero poder trocar a
 * ordem aqui, pra cima ou pra baixo da mesma forma que mudo de fase arrastando"): logo abaixo de `depoisDe`
 * (nulo: no alto). Só no painel de Vendas, nas etapas abertas (no Suporte, o quadro põe o mais urgente primeiro;
 * no Ganho e no Perdido, o mais recente). É a arrumação do quadro, não uma mudança na negociação: não mexe na
 * última atividade nem no histórico; vai para a auditoria.
 */
export async function posicionar(app: FastifyInstance, ator: Ator, ref: string, d: { depoisDe: string | null }): Promise<Feito & { posicao: number }> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const etapa = e.etapa;
  if (!etapa || !ordemAMao(e.painel, etapa)) {
    throw new BadRequest(e.painel.tipo !== 'vendas'
      ? 'Arrumar a ordem à mão é no painel de Vendas: neste, o quadro põe o mais urgente primeiro.'
      : `Em ${etapa?.nome ?? 'esta etapa'}, a ordem é a do mais recente: arrumar à mão é nas etapas abertas.`);
  }
  if (d.depoisDe === e.t.id) throw new BadRequest('A negociação não fica abaixo dela mesma.');
  const r = await app.db.transaction((tx) => arrumarNaEtapa(tx, etapa.id, e.t.id, d.depoisDe));
  if (!r) throw new Conflict('O quadro mudou enquanto você arrastava (a negociação de cima saiu desta etapa). Veja de novo e arraste outra vez.');
  return { ...nada(e.t), posicao: r.posicao, resumo: r.mudou ? `Pôs ${e.t.code} em ${r.posicao}º lugar em ${etapa.nome} (a ordem do quadro)` : null };
}

// =====================================================================
//  A NIA (2.1): o botão da ficha pede à IA do n8n para preencher
// =====================================================================

/**
 * Pede à NIA (a IA do suporte, no n8n) para preencher o chamado — o botão da ficha, no lugar de pôr a etiqueta à mão
 * (o Luan: "hoje eu tenho que etiquetar, só que isso eu acho meio gambiarra"). O combinado com o fluxo do n8n
 * continua sendo a etiqueta: a de pedir entra (a de pronto e a de erro saem), e o aviso do chamado alterado vai para o
 * n8n como ia quando a equipe etiquetava; o fluxo não muda. O pedido que ainda espera a resposta só se repete depois
 * de uns minutos (`resumoDaNia`); repetido, a etiqueta sai e volta, para o n8n receber o aviso de novo.
 */
export async function pedirANia(app: FastifyInstance, ator: Ator, ref: string): Promise<Feito> {
  exigirTrabalhar(ator);
  const nia = await lerAjustesDaNia(app.db);
  if (!nia.ligada) throw new BadRequest('O botão da NIA está desligado (Painéis › Ajustes › IA).');
  const e = await carregar(app, ator, ref);
  if (e.painel.tipo === 'vendas') throw new BadRequest('A NIA preenche os chamados: a negociação não tem a NIA.');
  const eventos = await app.db.select().from(ticketEvents)
    .where(and(eq(ticketEvents.ticketId, e.t.id), eq(ticketEvents.kind, 'campo'))).orderBy(asc(ticketEvents.createdAt));
  const r = resumoDaNia({ etiquetas: e.t.tags, historico: eventos.map((x) => eventoParaTela(x, e.ctx)) }, nia, e.agora);
  if (!r.podePedir) {
    throw new BadRequest(`A NIA foi chamada às ${horaLocal(r.pedidaEm!)} e ainda está preenchendo. Se ela não responder em ${NIA_PEDIR_DE_NOVO_MINUTOS} minutos, dá para pedir de novo.`);
  }
  // o pedido parado (a etiqueta de pedir já está): ela sai e volta, para o n8n receber o aviso de novo
  let etiquetas = e.t.tags;
  if (temAEtiqueta(etiquetas, nia.pedir)) {
    etiquetas = etiquetas.filter((x) => chaveDaEtiqueta(x) !== chaveDaEtiqueta(nia.pedir));
    await alterar(app, ator, e.t.id, { etiquetas });
  }
  const feito = await alterar(app, ator, e.t.id, { etiquetas: etiquetasAoPedirANia(etiquetas, nia) });
  return { ...feito, resumo: `Pediu à NIA para preencher ${e.t.code}${r.situacao === 'nunca' ? '' : ' de novo'}` };
}

// =====================================================================
//  ASSUMIR, ESPERAR, REABRIR, TROCAR DE PAINEL
// =====================================================================

/**
 * Fica com o chamado. Na entrada, ele vai para a primeira etapa de andamento — se não faltar nada para
 * entrar nela; faltando, fica na entrada (a ficha mostra o que falta). `mover: false` só troca o
 * responsável.
 */
export async function assumir(app: FastifyInstance, ator: Ator, ref: string, opts: { mover?: boolean } = {}): Promise<Feito> {
  exigirTrabalhar(ator);
  if (ator.tipo !== 'pessoa') throw new BadRequest('Só uma pessoa assume um chamado.');
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  let para: EtapaPainel | null = null;
  // na negociação, assumir é só ficar com ela: o lead não passa sozinho para a etapa seguinte
  if (opts.mover !== false && e.painel.tipo !== 'vendas' && e.etapa?.tipo === 'entrada') {
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
  else await avisarObservadores(app, { chamado: curto(t), observadores: t.watcherIds, texto: `${ator.nome} assumiu o ${t.code}`, menos: ator.id, quem: ator.nome, novidade: 'Assumiu o chamado' });
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
  const espera = d.tipo ? `${NOME_ESPERA[d.tipo].toLocaleLowerCase('pt-BR')} (${motivo})` : null;
  const texto = espera ? `${ator.nome} marcou o ${t.code}: ${espera}` : `${ator.nome} tirou a marca de espera do ${t.code}`;
  await avisarObservadores(app, {
    chamado: curto(t), observadores: t.watcherIds, texto, menos: pessoaDoAtor(ator), quem: ator.nome, novidade: espera ? `Marcou: ${espera}` : 'Tirou a marca de espera',
  });
  return { ...nada(t), resumo };
}

/** A etapa aberta de onde a negociação saiu para o Ganho ou o Perdido (a última mudança de etapa que a levou para onde está). */
async function etapaAntesDoResultado(db: Db, e: Estado): Promise<EtapaPainel | null> {
  const [ultima] = await db.select({ dados: ticketEvents.data }).from(ticketEvents)
    .where(and(eq(ticketEvents.ticketId, e.t.id), eq(ticketEvents.kind, 'etapa'))).orderBy(desc(ticketEvents.createdAt)).limit(1);
  const de = (ultima?.dados as { de?: { id?: string } | null } | undefined)?.de?.id;
  const etapa = de ? e.painel.etapas.find((x) => x.id === de) : undefined;
  return etapa && (etapa.tipo === 'entrada' || etapa.tipo === 'andamento') ? etapa : null;
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
    // a negociação volta para a etapa em que estava antes do ganho ou da perda (se ela ainda existe)
    para = (painel.tipo === 'vendas' ? await etapaAntesDoResultado(app.db, e) : null) ?? etapaAoReabrir(painel.etapas);
    if (!para || (para.tipo !== 'entrada' && para.tipo !== 'andamento')) throw new BadRequest(`O painel ${painel.nome} não tem etapa de entrada nem de andamento para reabrir.`);
  }
  const motivo = d.motivo?.trim() || null;
  const destino = para;
  const m = await app.db.transaction((tx) => gravarMovimento(tx, e, ator, destino, { motivo: null, sentido: null, motivoReabriu: motivo }));
  await depoisDoMovimento(app, ator, t, m, {}, opts);
  if (t.assigneeId) await avisarEquipe(app, { evento: 'recebeu', para: [t.assigneeId], chamado: curto(t), texto: `O ${t.code} foi reaberto`, menos: pessoaDoAtor(ator), quem: ator.nome });
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
  // a negociação fica entre os painéis de Vendas, e o chamado entre os de Gestão (entre eles, abre-se o outro lá)
  if (novo.tipo !== painel.tipo) throw new BadRequest(trocaEntreTiposDePainel(t.code, painel, novo));
  const para = d.etapaId ? novo.etapas.find((x) => x.id === d.etapaId) : etapaDeEntrada(novo.etapas);
  if (!para) throw new BadRequest(d.etapaId ? `Essa etapa não é do painel ${novo.nome}.` : `O painel ${novo.nome} não tem etapas.`);
  if (para.resultado) throw new BadRequest(TROCA_ENTRA_NO_FUNIL);
  const tipoNovo = t.type ? novo.ajustes.tipos.find((x) => paraBusca(x) === paraBusca(t.type!)) ?? (novo.ajustes.tipos.length ? null : t.type) : null;
  // o destino é conferido com o chamado já sem o que sai (o assunto e o tipo do painel antigo)
  const semOQueSai: Estado = { ...e, t: { ...t, subjectId: null, type: tipoNovo } };
  await conferirMovimento(app.db, semOQueSai, para, { painel: novo, motivo: null, nivel: false });
  const m = await app.db.transaction(async (tx) => {
    await registrarEvento(tx, t.id, 'painel', ator, { de: painel.nome, para: novo.nome }, e.quando());
    // as etiquetas vão junto (2.0.3: cada painel tem as suas): as que faltam no painel novo entram lá com a mesma cor
    const etiquetas = await levarEtiquetas(tx as unknown as Db, t.tags, painel.id, novo.id, pessoaDoAtor(ator));
    if (t.subjectId) await registrarEvento(tx, t.id, 'campo', ator, { campo: NOME_CAMPO.assunto, de: caminho(ctx, t.subjectId), para: null }, e.quando());
    if (t.type && tipoNovo !== t.type) await registrarEvento(tx, t.id, 'campo', ator, { campo: NOME_CAMPO.tipo, de: t.type, para: tipoNovo }, e.quando());
    return gravarMovimento(tx, e, ator, para, { motivo: null, sentido: null, extra: { panelId: novo.id, subjectId: null, type: tipoNovo, ...(etiquetas.join('\n') !== t.tags.join('\n') ? { tags: etiquetas } : {}) } });
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

/**
 * Uma anotação (com até 5 anexos de até 10 MB cada). A anotação de uma pessoa conta como primeira resposta.
 * Quem ela cita com @ (e vê o painel) recebe o aviso na hora, mesmo sem observar o chamado (13/10, o
 * pedido do Luan); o observador citado recebe só esse aviso, e quem escreveu não recebe nada.
 */
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
  const citados = texto.includes('@') ? citadosNoTexto(texto, await quemVeOPainel(app.db, e.painel)).filter((c) => c.id !== pessoa) : [];
  const notaId = newId();
  await app.db.transaction(async (tx) => {
    await tx.insert(ticketNotes).values({ id: notaId, ticketId: t.id, userId: pessoa, actorName: integracaoDoAtor(ator), body: texto, mentionedUserIds: citados.map((c) => c.id), createdAt: agora });
    // um milésimo entre um anexo e o outro: a ficha mostra na ordem em que foram escolhidos
    if (guardar.length) await tx.insert(ticketAttachments).values(guardar.map((a, i) => ({ id: newId(), ticketId: t.id, noteId: notaId, ...a, uploadedById: pessoa, createdAt: new Date(agora.getTime() + i) })));
    await tx.update(tickets).set({ updatedAt: agora, lastActivityAt: agora, ...(ator.tipo === 'pessoa' && !t.firstResponseAt ? { firstResponseAt: agora } : {}) }).where(eq(tickets.id, t.id));
  });
  emitir(app, 'chamado.anotacao', t.id, { anotacao: { texto, por: ator.nome, citados: citados.map((c) => c.nome) } });
  const comAnexo = guardar.length ? ` (com ${plural(guardar.length, 'anexo', 'anexos')})` : '';
  const oQueDisse = trecho(texto.replace(/\s+/g, ' '), 140);
  // no WhatsApp, a nota vai inteira na {nota}; o {aviso} fica sem o trecho dela
  if (citados.length) {
    await avisarEquipe(app, {
      evento: 'citado', para: citados.map((c) => c.id), menos: pessoa, chamado: curto(t), texto: `${ator.nome} citou você no ${t.code}: "${oQueDisse}"`,
      quem: ator.nome, nota: texto, aviso: `${ator.nome} citou você no ${t.code}`,
    });
  }
  const anexou = `${plural(guardar.length, 'arquivo', 'arquivos')}`;
  await avisarObservadores(app, {
    chamado: curto(t), observadores: t.watcherIds, menos: pessoa, jaAvisados: citados.map((c) => c.id),
    texto: texto ? `${ator.nome} anotou no ${t.code}${comAnexo}: "${oQueDisse}"` : `${ator.nome} anexou ${anexou} no ${t.code}`,
    // a anotação é a própria novidade (vai na {nota}); o anexo, não
    quem: ator.nome, nota: texto, novidade: guardar.length ? `Anexou ${anexou}` : '',
    aviso: texto ? `${ator.nome} anotou no ${t.code}${comAnexo}` : undefined,
  });
  return {
    ...nada(t),
    resumo: `Anotou em ${t.code}${guardar.length ? ` (com ${plural(guardar.length, 'anexo', 'anexos')})` : ''}${citados.length ? `, citando ${emLista(citados.map((c) => c.nome))}` : ''}`,
    depois: { texto, anexos: guardar.map((a) => a.fileName), ...(citados.length ? { citados: citados.map((c) => c.nome) } : {}) },
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

/**
 * Liga dois chamados à mão (relacionado, duplicado, repete). O histórico registra nos dois, cada um do seu
 * lado. A negociação não se liga a nada (2.0.1, decisão 0050: "n precisa ligações").
 */
export async function ligar(app: FastifyInstance, ator: Ator, ref: string, d: { para: string; tipo: TipoLigacaoChamado }): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  if (e.painel.tipo === 'vendas') throw new BadRequest(NEGOCIACAO_SEM_LIGACAO);
  const outro = await outroChamado(app.db, d.para, ator, e.ctx);
  if (outro.id === t.id) throw new BadRequest('Um chamado não se liga a ele mesmo.');
  if (e.ctx.paineis.find((p) => p.id === outro.panelId)?.tipo === 'vendas') throw new BadRequest(negociacaoNaoSeLiga(outro.code));
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

/**
 * O pai pelo código (nulo tira). O pai pode ser de outro painel; nunca um descendente (seria um círculo)
 * nem uma negociação — a negociação não tem pai nem filhos (2.0.1): tirar o pai que ela já tinha, pode.
 */
export async function definirPai(app: FastifyInstance, ator: Ator, ref: string, paiRef: string | null): Promise<Feito> {
  exigirTrabalhar(ator);
  const e = await carregar(app, ator, ref);
  const { t, agora } = e;
  if (paiRef?.trim() && e.painel.tipo === 'vendas') throw new BadRequest(NEGOCIACAO_SEM_PAI);
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
  if (e.ctx.paineis.find((p) => p.id === pai.panelId)?.tipo === 'vendas') throw new BadRequest(negociacaoNaoEPai(pai.code));
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
  if (e.painel.tipo === 'vendas') throw new BadRequest(NEGOCIACAO_SEM_PROBLEMA);
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
  await contarAosObservadores(app, ator, t, `${ator.nome} abriu o protocolo ${protocolo} na ${nome} para o ${t.code}`, `Abriu o protocolo ${protocolo} na ${nome}`);
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
    : `${ator.nome} cobrou a ${c.carrierName} (protocolo ${c.protocol}) no ${t.code}`,
  acao === 'fechou' ? `Fechou o protocolo ${c.protocol} da ${c.carrierName}` : `Cobrou a ${c.carrierName} (protocolo ${c.protocol})`);
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
  const oQueMandou = trecho(texto.trim().replace(/\s+/g, ' '), 140);
  await contarAosObservadores(app, ator, t, `${ator.nome} mandou ao cliente, no ${t.code}: "${oQueMandou}"`, `Mandou ao cliente: "${oQueMandou}"`);
  return { ...nada(t), resumo: `Avisou o cliente de ${t.code} pelo WhatsApp`, depois: { texto } };
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
  await contarAosObservadores(app, ator, t, `${ator.nome} mandou o ${t.code} para a lixeira`, 'Mandou para a lixeira');
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
  await contarAosObservadores(app, ator, t, `${ator.nome} tirou o ${t.code} da lixeira`, 'Tirou da lixeira');
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
