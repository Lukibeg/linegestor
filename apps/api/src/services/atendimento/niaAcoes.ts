/**
 * O /NIA NO CARD (Patch 2.4.2, decisão 0060): o Gestor é o intermediário entre a ficha e a NIA — a IA do suporte da
 * Ingline, um serviço de fora, já no ar, com as "ações" sobre um chamado (corrigir, formalizar, resumir, criar o
 * chamado a partir de uma descrição livre e preencher um card vazio).
 *
 * O navegador fala só com o Gestor: a chave de serviço da NIA é de SERVIDOR e nunca chega à tela. Ela fica no cofre
 * cifrado e só vai para o servidor onde foi colada (`chaveDe`): trocar o endereço para outro servidor pede a chave de
 * novo — senão bastaria mudar o endereço para a chave ir parar em outro lugar. O pedido não segue redirecionamento
 * (pelo mesmo motivo) e espera até 120 s — o mesmo que a NIA espera o modelo: com menos, um PDF grande fazia o Gestor
 * desistir enquanto a NIA ainda trabalhava (a pessoa via "não respondeu" e o uso era cobrado mesmo assim).
 *
 * A regra de ouro: a NIA PROPÕE, a pessoa aplica. `propor` manda o card inteiro, lido do banco (só os campos de texto
 * que o painel usa), e devolve a resposta da NIA como veio — nada é gravado e nada vai para o Histórico (proposta não é
 * mudança; a auditoria guarda que a pessoa pediu). `aplicar` grava só o que a pessoa marcou, pelo `alterar` de sempre
 * (as mesmas regras e limites da ficha, com a sessão dela) e, na mesma transação, a linha `nia` do Histórico.
 *
 * A ficha nunca quebra por causa da NIA: toda falha vira `{ ok: false, erro }`, com a frase pronta para a tela.
 */
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { products, ticketAttachments } from '@gestor/db';
import {
  acoesDoCatalogo, base64DoConteudo, bytesDoBase64, problemaDosAnexosDaNia, camposDeTextoDoCard, campoDoTipo, campoLigado, enderecoDaNia, folhasDoAssunto, idsDasListasDaNia,
  NOME_DO_CAMPO_DA_NIA, NOMES_DAS_GRAVIDADES, problemaDoTamanho, RespostaDaNiaSchema,
  type AcaoDaNia, type AnexoParaANia, type AjustesDaNiaAcoesEntrada, type CampoDeTextoDaNia, type CatalogoDaNia, type ChamadoAlterar, type ChamadoParaANia, type NiaAcoesTela,
  type NiaAplicar, type OpcoesComIds, type OpcoesParaANia, type PedidoParaANia, type PropostaDaNia, type TesteDaNia, type TipoChamado,
} from '@gestor/shared';
import { BadRequest } from '../../plugins/errors.js';
import { options as clientesAtivos } from '../clients.js';
import * as integ from '../integracoes.js';
import { alterar, type Feito } from './chamados.js';
import { camposDoPainel, carregarContexto, chamadoVisivel, exigirTrabalhar, type Ator, type LinhaChamado } from './contexto.js';
import { acharAssunto } from './entrada.js';

// =====================================================================
//  AS FRASES (as mesmas que a tela mostra)
// =====================================================================

export const NIA_NAO_RESPONDEU = 'A NIA não respondeu agora. Tente de novo.';
export const NIA_CHAVE_RECUSADA = 'A chave da NIA foi recusada; confira em Painéis › Ajustes › Integrações.';
export const NIA_NAO_CONFIGURADA = 'A NIA ainda não está ligada: o endereço e a chave ficam em Painéis › Ajustes › Integrações.';
export const NIA_CERTIFICADO = 'O Gestor não confiou no certificado da NIA (o sistema não leu o nia-ca.crt que vem com ele, ou a NIA trocou de certificado). Avise a administração.';
export const NIA_NAO_ENTENDEU = 'A NIA respondeu de um jeito que o Gestor não entendeu. Tente de novo; se continuar, avise a administração.';

/** Os erros de certificado do Node (o HTTPS da NIA é da CA interna do Caddy até ela ter domínio). */
const ERROS_DE_CERTIFICADO = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_GET_ISSUER_CERT', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_UNTRUSTED',
]);

// =====================================================================
//  AS FERRAMENTAS (os testes trocam: a NIA de mentira e o prazo curto)
// =====================================================================

/** Quanto o Gestor espera a proposta da NIA: os mesmos 120 s que a NIA espera o modelo (antes, 90 s). */
export const PRAZO_DA_NIA_MS = 120_000;

type Ferramentas = { fetchFn: typeof fetch; prazoMs: number; agora: () => number };
let ferramentas: Ferramentas = { fetchFn: (...a) => fetch(...a), prazoMs: PRAZO_DA_NIA_MS, agora: () => Date.now() };
/** O prazo de agora (os testes trocam por um curto; fora deles, o `PRAZO_DA_NIA_MS`). */
export const prazoDaNiaMs = () => ferramentas.prazoMs;
export function trocarFerramentasNia(f: Partial<Ferramentas>) { ferramentas = { ...ferramentas, ...f }; }

// =====================================================================
//  OS AJUSTES (o endereço; a chave, no cofre)
// =====================================================================

type Guardado = {
  endereco: string;
  /** o servidor (host:porta) onde a chave foi colada: ela só vai para ele */
  chaveDe: string | null;
  configuradoEm: string | null;
  configuradoPor: string | null;
  ultimoTeste: NiaAcoesTela['ultimoTeste'];
};

async function lerGuardado(app: FastifyInstance) {
  return integ.ler<Guardado>(app.db, 'atendimento-nia-acoes');
}

/** O que a tela de Integrações vê. A chave nunca volta: só se existe uma guardada. */
export async function telaDaNia(app: FastifyInstance): Promise<NiaAcoesTela> {
  const { valor, temSegredo } = await lerGuardado(app);
  return { endereco: valor.endereco, temChave: temSegredo, configuradoEm: valor.configuradoEm, configuradoPor: valor.configuradoPor, ultimoTeste: valor.ultimoTeste ?? null };
}

/**
 * Grava o endereço e, quando vem, a chave nova (no cofre). Mudar o endereço para outro servidor sem colar a chave de
 * novo é recusado: a chave guardada só vai para o servidor onde foi colada. Vazio desliga o /nia (a chave fica no
 * cofre, sem uso, até alguém pôr o endereço de novo).
 */
export async function gravarAjustesDaNia(app: FastifyInstance, d: AjustesDaNiaAcoesEntrada & { endereco: string }, quem: { id: string; nome: string }) {
  const { valor: antes, secretId, temSegredo } = await lerGuardado(app);
  const lido = d.endereco ? enderecoDaNia(d.endereco) : null;
  if (lido && !lido.ok) throw new BadRequest(lido.erro);
  const servidor = lido?.ok ? lido.servidor : null;
  let novoSecretId: string | null | undefined;
  let chaveDe = antes.chaveDe;
  if (d.chave) {
    if (!servidor) throw new BadRequest('Escreva o endereço da NIA junto com a chave.');
    novoSecretId = await app.vault.save(app.db, { existingId: secretId, label: 'Chave de serviço da NIA (o /nia no card)', plain: d.chave, userId: quem.id });
    chaveDe = servidor;
  } else if (servidor && temSegredo && chaveDe && servidor !== chaveDe) {
    throw new BadRequest(`O endereço agora é de outro servidor (${servidor}): cole a chave de novo. A chave guardada só vai para ${chaveDe}, onde foi colada.`);
  } else if (servidor && !temSegredo) {
    throw new BadRequest('Cole a chave de serviço da NIA: sem ela, a NIA recusa o Gestor.');
  }
  const depois: Guardado = {
    ...antes, endereco: lido?.ok ? lido.endereco : '', chaveDe, configuradoEm: new Date().toISOString(), configuradoPor: quem.nome,
    // o teste de antes era de outra configuração
    ultimoTeste: (d.chave || (lido?.ok ? lido.endereco : '') !== antes.endereco) ? null : antes.ultimoTeste,
  };
  await integ.gravar(app.db, 'atendimento-nia-acoes', depois, { ...(novoSecretId !== undefined ? { secretId: novoSecretId } : {}), userId: quem.id });
  esquecerCatalogoDaNia();
  return { antes: antes.endereco, depois: depois.endereco, trocouChave: !!d.chave };
}

/** O endereço e a chave de agora (nulo: sem os dois, ou a chave é de outro servidor). */
async function configuracao(app: FastifyInstance): Promise<{ endereco: string; chave: string } | null> {
  const { valor, temSegredo } = await lerGuardado(app);
  if (!valor.endereco || !temSegredo) return null;
  const lido = enderecoDaNia(valor.endereco);
  if (!lido.ok || !valor.chaveDe || lido.servidor !== valor.chaveDe) return null;
  const chave = await integ.segredo(app.db, app.vault, 'atendimento-nia-acoes');
  return chave ? { endereco: lido.endereco, chave } : null;
}

// =====================================================================
//  CONVERSAR COM A NIA
// =====================================================================

type Resultado = { ok: true; json: unknown } | { ok: false; erro: string; status?: number };

function mensagemDaFalha(e: unknown): string {
  const err = e as { name?: string; cause?: { code?: string; name?: string } };
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || err?.cause?.name === 'TimeoutError') return NIA_NAO_RESPONDEU;
  if (err?.cause?.code && ERROS_DE_CERTIFICADO.has(err.cause.code)) return NIA_CERTIFICADO;
  return NIA_NAO_RESPONDEU;
}

/**
 * Um pedido à NIA, com a chave no cabeçalho (X-NIA-API-KEY). Sem seguir redirecionamento e com o prazo de 120 s
 * (o corpo da resposta também conta). A mensagem de cada falha já vem pronta para a tela.
 */
async function pedir(cfg: { endereco: string; chave: string }, metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<Resultado> {
  // o catálogo é leve: 15 s bastam (a tela desiste de uma leitura em 30 s); a proposta espera os 120 s
  const sinal = AbortSignal.timeout(metodo === 'GET' ? Math.min(15_000, ferramentas.prazoMs) : ferramentas.prazoMs);
  let r: Response;
  try {
    r = await ferramentas.fetchFn(`${cfg.endereco}${caminho}`, {
      method: metodo,
      redirect: 'error',
      headers: { 'X-NIA-API-KEY': cfg.chave, Accept: 'application/json', ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      signal: sinal,
    });
  } catch (e) {
    return { ok: false, erro: mensagemDaFalha(e) };
  }
  if (r.status === 401 || r.status === 403) return { ok: false, erro: NIA_CHAVE_RECUSADA, status: r.status };
  if (!r.ok) return { ok: false, erro: `A NIA não respondeu agora (ela devolveu o erro ${r.status}). Tente de novo.`, status: r.status };
  try {
    return { ok: true, json: await r.json() };
  } catch (e) {
    return { ok: false, erro: sinal.aborted ? NIA_NAO_RESPONDEU : (e as { name?: string })?.name === 'SyntaxError' ? NIA_NAO_ENTENDEU : mensagemDaFalha(e) };
  }
}

// =====================================================================
//  O CATÁLOGO (o menu do /nia), guardado 5 minutos
// =====================================================================

let guardado: { chave: string; em: number; acoes: AcaoDaNia[] } | null = null;
const CINCO_MINUTOS = 5 * 60_000;
/** Os ajustes mudaram (ou os testes começam): o próximo pedido lê o catálogo de novo. */
export function esquecerCatalogoDaNia() { guardado = null; }

/**
 * Os comandos da NIA, como ela manda (o menu vem DAQUI: comando novo é cadastro do lado da NIA, não um patch do
 * Gestor). Só o catálogo que veio inteiro fica guardado; a falha não é guardada (o próximo pedido tenta de novo).
 */
export async function catalogoDaNia(app: FastifyInstance): Promise<CatalogoDaNia> {
  const cfg = await configuracao(app);
  if (!cfg) return { configurada: false, acoes: [], erro: null };
  const chave = `${cfg.endereco}\n${cfg.chave.length}:${cfg.chave.slice(-4)}`;
  if (guardado && guardado.chave === chave && ferramentas.agora() - guardado.em < CINCO_MINUTOS) return { configurada: true, acoes: guardado.acoes, erro: null };
  const r = await pedir(cfg, 'GET', '/api/nia/acoes');
  if (!r.ok) return { configurada: true, acoes: [], erro: r.erro };
  const acoes = acoesDoCatalogo(r.json);
  if (!acoes) return { configurada: true, acoes: [], erro: NIA_NAO_ENTENDEU };
  guardado = { chave, em: ferramentas.agora(), acoes };
  return { configurada: true, acoes, erro: null };
}

/** O botão Testar (Ajustes › Integrações): lê o catálogo agora, sem o guardado, e diz quantos comandos vieram. */
export async function testarANia(app: FastifyInstance): Promise<TesteDaNia> {
  const cfg = await configuracao(app);
  let teste: TesteDaNia;
  if (!cfg) teste = { ok: false, mensagem: 'Salve o endereço e a chave da NIA antes de testar.', quantos: null, acoes: [] };
  else {
    const r = await pedir(cfg, 'GET', '/api/nia/acoes');
    const acoes = r.ok ? acoesDoCatalogo(r.json) : null;
    teste = !r.ok ? { ok: false, mensagem: r.erro, quantos: null, acoes: [] }
      : !acoes ? { ok: false, mensagem: NIA_NAO_ENTENDEU, quantos: null, acoes: [] }
        : { ok: true, mensagem: `A NIA respondeu: ${acoes.length} ${acoes.length === 1 ? 'comando' : 'comandos'}.`, quantos: acoes.length, acoes };
    if (r.ok && acoes) guardado = null;
  }
  const { valor } = await lerGuardado(app);
  if (cfg) await integ.gravar(app.db, 'atendimento-nia-acoes', { ...valor, ultimoTeste: { em: new Date().toISOString(), ok: teste.ok, mensagem: teste.mensagem, quantos: teste.quantos } });
  return teste;
}

// =====================================================================
//  PROPOR (nada é gravado)
// =====================================================================

const COLUNA: Record<CampoDeTextoDaNia, keyof LinhaChamado> = {
  titulo: 'title', relato: 'customerReport', descricao: 'description', solucao: 'solution', causa: 'cause', contorno: 'workaround', validacao: 'validation',
};

/** Os produtos que se pode escolher (os ativos, na ordem do cadastro). */
async function produtosAtivos(app: FastifyInstance) {
  return app.db.select({ id: products.id, nome: products.name }).from(products)
    .where(and(isNull(products.deletedAt), eq(products.active, true))).orderBy(asc(products.sortOrder), asc(products.name));
}

/**
 * Pede a proposta à NIA para o card: o card inteiro lido do banco — os campos de texto que o painel do card usa, como
 * estão gravados agora —, mais o rascunho da anotação quando o /nia foi digitado nela. Na entrega "campos", as opções
 * de lista do painel do card (só o que ele usa e o que está ativo; o assunto, só as folhas), pelos nomes; o que a NIA
 * escolher volta também com o id do Gestor (`idsDasListas`), para o Aplicar.
 */
/** Um arquivo passa de 10 MB (o limite da anotação e da NIA, por arquivo). */
const DEZ_MB = 10 * 1024 * 1024;

/**
 * Os anexos do lugar onde o /nia foi digitado (o Gestor só junta e manda; quem lê é a NIA): na anotação, os do
 * rascunho (ainda no navegador, vêm no pedido); num campo do card, os daquele campo e das caixinhas dele, lidos do
 * banco (fora os apagados); nos outros campos, nenhum.
 */
async function anexosDoLugar(app: FastifyInstance, ticketId: string, d: { campo?: string; anexos?: Array<{ fileName: string; conteudo: string }> }): Promise<AnexoParaANia[]> {
  if (d.campo === 'anotacao') return (d.anexos ?? []).map((a) => ({ nome: a.fileName, base64: base64DoConteudo(a.conteudo) }));
  if (d.campo?.startsWith('campo:')) {
    const linhas = await app.db.select({ nome: ticketAttachments.fileName, base64: ticketAttachments.dataBase64 }).from(ticketAttachments)
      .where(and(eq(ticketAttachments.ticketId, ticketId), eq(ticketAttachments.fieldId, d.campo.slice(6)), isNull(ticketAttachments.deletedAt)))
      .orderBy(asc(ticketAttachments.createdAt), asc(ticketAttachments.id));
    return linhas.map((a) => ({ nome: a.nome, base64: base64DoConteudo(a.base64) }));
  }
  return [];
}

export async function proporANia(
  app: FastifyInstance, ator: Ator, ref: string, d: { comando: string; instrucao: string; campo?: string; anotacao?: string; anexos?: Array<{ fileName: string; conteudo: string }> },
): Promise<{ proposta: PropostaDaNia; chamado: { id: string; codigo: string }; nome: string; anexos: number }> {
  exigirTrabalhar(ator);
  const ctx = await carregarContexto(app.db);
  const t = await chamadoVisivel(app.db, ref, ator, ctx);
  const painel = ctx.paineis.find((p) => p.id === t.panelId)!;
  const chamado = { id: t.id, codigo: t.code };
  let quantos = 0;
  const falhou = (erro: string, nome = d.comando) => ({ proposta: { ok: false, comando: d.comando, erro }, chamado, nome, anexos: quantos });

  // os anexos: conferidos ANTES de chamar a NIA (a pessoa sabe na hora; a NIA confere de novo)
  const anexos = await anexosDoLugar(app, t.id, d);
  quantos = anexos.length;
  const grande = anexos.find((a) => bytesDoBase64(a.base64) > DEZ_MB);
  if (grande) return falhou(`O anexo "${grande.nome}" passa de 10 MB: a NIA lê até 10 MB por arquivo. Tire ele e chame a NIA de novo.`);
  const problema = problemaDosAnexosDaNia(anexos.map((a) => ({ bytes: bytesDoBase64(a.base64) })));
  if (problema) return falhou(problema);

  const cfg = await configuracao(app);
  if (!cfg) return falhou(NIA_NAO_CONFIGURADA);
  const cat = await catalogoDaNia(app);
  if (cat.erro) return falhou(cat.erro);
  const acao = cat.acoes.find((a) => a.comando === d.comando);
  if (!acao) return falhou(`A NIA não tem o comando "${d.comando}". Escolha um da lista do /nia.`);

  const campos = camposDeTextoDoCard(painel, t.kind as TipoChamado, !!t.customerReport?.trim());
  const doCard: ChamadoParaANia = Object.fromEntries(campos.map((c) => [c, (t[COLUNA[c]] as string | null) ?? '']));
  if (d.campo === 'anotacao') doCard.anotacao = d.anotacao ?? '';

  let opcoes: OpcoesParaANia | undefined;
  let comIds: OpcoesComIds = {};
  if (acao.entrega === 'campos') {
    const usa = (c: Parameters<typeof campoLigado>[1]) => campoLigado(painel.ajustes, c);
    const [clientes, prods] = await Promise.all([
      usa('cliente') ? clientesAtivos(app.db, { includeInternal: true }) : Promise.resolve([]),
      usa('produtos') ? produtosAtivos(app) : Promise.resolve([]),
    ]);
    comIds = {
      ...(usa('cliente') && clientes.length ? { clientes: clientes.map((c) => ({ id: c.id, nome: c.name })) } : {}),
      ...(usa('produtos') && prods.length ? { produtos: prods } : {}),
      ...(usa('tipo') && painel.ajustes.tipos.length ? { tipos: painel.ajustes.tipos } : {}),
      ...(usa('assunto') ? { assuntos: folhasDoAssunto(ctx.assuntos, painel.id) } : {}),
    };
    if (comIds.assuntos && !comIds.assuntos.length) delete comIds.assuntos;
    opcoes = {
      ...(comIds.clientes ? { cliente: comIds.clientes.map((c) => c.nome) } : {}),
      ...(comIds.produtos ? { produto: comIds.produtos.map((p) => p.nome) } : {}),
      ...(comIds.tipos ? { tipo: comIds.tipos } : {}),
      ...(comIds.assuntos ? { assunto: comIds.assuntos } : {}),
      ...(usa('gravidade') && campoDoTipo(painel.tipo, 'gravidade') ? { gravidade: NOMES_DAS_GRAVIDADES } : {}),
    };
  }

  const pedido: PedidoParaANia = {
    comando: acao.comando, instrucao: d.instrucao, campo: d.campo ?? '', referencia: t.code, chamado: doCard, ...(opcoes ? { opcoes } : {}),
    ...(anexos.length ? { anexos } : {}),
  };
  const r = await pedir(cfg, 'POST', '/api/nia/executar', pedido);
  if (!r.ok) return falhou(r.erro, acao.nome);
  const lida = RespostaDaNiaSchema.safeParse(r.json);
  if (!lida.success) return falhou(NIA_NAO_ENTENDEU, acao.nome);
  const resposta = lida.data as PropostaDaNia;
  if (!resposta.ok) return { proposta: { ...resposta, erro: resposta.erro?.trim() || NIA_NAO_RESPONDEU }, chamado, nome: acao.nome, anexos: quantos };
  // a entrega "campos": o nome → id, conferido contra as opções que foram (a NIA só devolve o que estava na lista)
  if ((resposta.entrega ?? acao.entrega) === 'campos' && resposta.campos) resposta.idsDasListas = idsDasListasDaNia(resposta.campos, comIds);
  return { proposta: resposta, chamado, nome: acao.nome, anexos: quantos };
}

// =====================================================================
//  APLICAR (só o que a pessoa marcou, pelo caminho de sempre)
// =====================================================================

/**
 * Grava o que a pessoa marcou da proposta, pelo `alterar` da ficha (as mesmas regras e limites, com a sessão dela) e
 * registra a linha `nia` do Histórico com a frase só dos gravados. O texto que passa do tamanho do campo é recusado
 * com a mensagem clara (nunca cortado). A anotação não passa por aqui: ela volta ao rascunho, na tela.
 */
export async function aplicarANia(app: FastifyInstance, ator: Ator, ref: string, d: NiaAplicar): Promise<Feito> {
  exigirTrabalhar(ator);
  const ctx = await carregarContexto(app.db);
  const t = await chamadoVisivel(app.db, ref, ator, ctx);
  const painel = ctx.paineis.find((p) => p.id === t.panelId)!;
  const usados = new Set<string>(camposDeTextoDoCard(painel, t.kind as TipoChamado, true));
  const pedido: ChamadoAlterar = {};
  const camposDoPedido: Record<string, string | null> = {};
  let entrega: 'texto' | 'campos' = 'texto';
  for (const [chave, bruto] of Object.entries(d.campos)) {
    const texto = bruto?.replace(/\r\n?/g, '\n') ?? null;
    if (chave.startsWith('campo:')) {
      // o resumir num campo de texto longo do painel
      const c = camposDoPainel(ctx, painel.id).find((x) => x.id === chave.slice(6));
      if (!c || !c.ativo || c.tipo !== 'texto_longo') throw new BadRequest('Esse campo não é um campo de texto deste card.');
      const problema = problemaDoTamanho(chave, texto, c.nome);
      if (problema) throw new BadRequest(problema);
      camposDoPedido[c.id] = texto?.trim() ? texto : null;
      continue;
    }
    const campo = chave as CampoDeTextoDaNia;
    if (!usados.has(campo)) throw new BadRequest(`${NOME_DO_CAMPO_DA_NIA[campo]} não é um campo deste card.`);
    const problema = problemaDoTamanho(campo, texto);
    if (problema) throw new BadRequest(problema);
    if (campo === 'titulo') pedido.titulo = (texto ?? '').trim();
    else pedido[campo] = texto?.trim() ? texto : null;
  }
  if (Object.keys(camposDoPedido).length) pedido.campos = camposDoPedido;
  const l = d.listas;
  if (l) {
    entrega = 'campos';
    if (l.clienteId !== undefined) pedido.clienteId = l.clienteId;
    if (l.produtos !== undefined) pedido.produtos = l.produtos;
    if (l.tipo !== undefined) pedido.tipo = l.tipo;
    if (l.gravidade !== undefined) pedido.gravidade = l.gravidade;
    // o assunto vai pelo caminho (o valor canônico do PATCH): o que não existe (ou saiu) é recusado
    if (l.assunto !== undefined) pedido.assuntoId = l.assunto ? acharAssunto(ctx.assuntos, painel, l.assunto).id : null;
  }
  // o nome do comando (a frase do Histórico) vem do catálogo; sem ele (a NIA fora do ar na hora), o próprio comando
  const cat = await catalogoDaNia(app).catch(() => null);
  const acao = cat?.acoes.find((a) => a.comando === d.comando);
  if (acao?.entrega === 'campos') entrega = 'campos';
  const r = await alterar(app, ator, t.id, pedido, { nia: { comando: d.comando, nome: acao?.nome ?? d.comando, entrega, anexos: d.anexosLidos ?? [] } });
  if (!r.resumo) throw new BadRequest('Nada mudou: o que foi marcado já estava assim no card.');
  return r;
}
