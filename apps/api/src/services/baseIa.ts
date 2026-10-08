/**
 * A IA da Base de conhecimento (Patch 1.8, decisão 0039): o "Perguntar à IA" e o rascunho do artigo
 * a partir do card — com o provedor que quem administra escolher em Ajustes (pedido do Luan, 08/10):
 * **Anthropic** (Claude), **OpenAI** (ChatGPT), **Google** (Gemini) ou **outro compatível** com a
 * OpenAI (OpenRouter, DeepSeek, Groq, Mistral, Maritaca, xAI…). Sem biblioteca: cada provedor é um
 * POST com a chave no cabeçalho.
 *
 * Regras que vivem aqui:
 *  - fica **desligada** até alguém escolher o provedor, pôr a chave (no cofre) e ligar; a chave
 *    guardada fica presa ao provedor e, no compatível, ao nome do serviço: trocar um ou outro pede a
 *    chave do novo (a chave de um nunca vai para outro)
 *  - o compatível só conversa com serviço da internet: `https://`, nome que não aponta para a rede de
 *    dentro (conferido antes de cada pedido) e sem seguir redirecionamento
 *  - a resposta sai **só dos artigos publicados**. A busca é a do Gestor (a mesma da tela, no modo
 *    "alguma palavra"): a IA sugere as palavras (1ª conversa) e responde só com os artigos achados,
 *    citando [BC-12] (2ª conversa). Citação de artigo que não foi para ela não vale
 *  - não achou nada na base? diz isso sem a 2ª conversa (não gasta à toa)
 *  - **30 usos por pessoa por hora** (custa dinheiro; um clique repetido não vira conta alta)
 *  - o mês soma os usos e os tokens; o custo só aparece se o preço do modelo for informado
 *  - o texto dos artigos (e, no rascunho, o do card) sai do servidor para o provedor escolhido —
 *    combinado com o Luan. Rascunho de artigo e lixeira nunca vão
 *
 * As regras que a prévia usa igual (instruções, o que vai, como ler o que volta) estão em
 * `@gestor/shared/ia.ts`.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { asc, eq, inArray } from 'drizzle-orm';
import { linechatCardMoves, linechatFields, linechatSteps, linechatTags, settings, type Db } from '@gestor/db';
import {
  buscarArtigos, codigoDoArtigo, cortarTexto, custoEstimado, diaEmBrasilia, enderecoValido, hostDoEndereco, INFO_PROVEDORES, INSTRUCOES_PERGUNTA, INSTRUCOES_RASCUNHO,
  INSTRUCOES_TERMOS, jsonDaResposta, juntarAchados, lerRespostaComCitacoes, limparResposta, modeloDeConversa, montarPerguntaParaIa,
  normalizarEndereco, rascunhoDaIa, termosDaResposta, textoDoCard, type AjustesIaGravar, type ProvedorIa, type TrechoIa,
} from '@gestor/shared';
import { AppError, BadRequest } from '../plugins/errors.js';
import * as integ from './integracoes.js';
import type { SecretsVault } from './secrets.js';
import { acharCard, publicadosParaBusca, type Quem } from './base.js';

type AjustesIa = integ.AjustesIa;
type UsoIa = integ.UsoIa;
const ONDE = 'Administração › Ajustes › IA da base';

// ---------- as ferramentas (os testes trocam: sem chamar provedor de verdade) ----------

type Ferramentas = {
  fetchFn: typeof fetch;
  /** para onde um nome aponta (os IPs): o compatível só conversa com serviço da internet */
  resolver: (host: string) => Promise<string[]>;
};
let ferramentas: Ferramentas = {
  fetchFn: (...a) => fetch(...a),
  resolver: async (host) => (await lookup(host, { all: true, verbatim: true })).map((x) => x.address),
};
export function trocarFerramentasIa(f: Partial<Ferramentas>) { ferramentas = { ...ferramentas, ...f }; }

const LIMITE_POR_HORA = 30;
const chamadas = new Map<string, number[]>();
/** Para os testes começarem do zero. */
export function esquecerLimitesIa() { chamadas.clear(); }

function conferirLimite(userId: string) {
  const agora = Date.now();
  const recentes = (chamadas.get(userId) ?? []).filter((t) => agora - t < 3_600_000);
  if (recentes.length >= LIMITE_POR_HORA) throw new AppError(429, `Você já usou a IA ${LIMITE_POR_HORA} vezes na última hora. Espere um pouco, ou procure na base.`);
  recentes.push(agora);
  chamadas.set(userId, recentes);
}

// ---------- ler e gravar os ajustes ----------

const mesDeAgora = () => diaEmBrasilia(new Date()).slice(0, 7);
const nomeDoModelo = (v: Pick<AjustesIa, 'modelo' | 'modeloNome'>) => v.modeloNome || v.modelo;
const usoDoMes = (v: AjustesIa): UsoIa => (v.uso?.mes === mesDeAgora() ? { ...integ.IA_PADRAO.uso, ...v.uso } : { ...integ.IA_PADRAO.uso, mes: mesDeAgora() });

async function lerAjustesIa(db: Db) {
  const { valor, temSegredo } = await integ.ler<AjustesIa>(db, 'base-ia');
  // (uma chave guardada antes de existir a escolha do provedor era da Anthropic)
  return { valor: { ...valor, chaveDe: temSegredo ? (valor.chaveDe ?? 'anthropic') : null } as AjustesIa, temChave: temSegredo };
}

/**
 * A chave guardada serve para este provedor (e, no compatível, para este endereço)? Ela fica presa
 * ao provedor e, no compatível, ao nome do serviço: a chave de um nunca vai para outro, nem por
 * engano nem de propósito (trocar o endereço pede a chave do novo serviço).
 */
const chaveServePara = (v: AjustesIa, temChave: boolean, provedor: ProvedorIa, endereco: string | null | undefined) =>
  temChave && v.chaveDe === provedor && (provedor !== 'compativel' || (!!v.chaveEndereco && v.chaveEndereco === hostDoEndereco(endereco)));
const chaveServe = (v: AjustesIa, temChave: boolean) => chaveServePara(v, temChave, v.provedor, v.endereco);
/** "da Anthropic", "de api.deepseek.com": de quem é a chave guardada, para as mensagens */
const deQuemEaChave = (v: AjustesIa) => (v.chaveDe === 'compativel' && v.chaveEndereco ? `de ${v.chaveEndereco}` : INFO_PROVEDORES[v.chaveDe ?? 'anthropic'].de);

/** O que a tela de Ajustes mostra (a chave nunca volta). */
export async function statusIa(db: Db) {
  const { valor, temChave } = await lerAjustesIa(db);
  const uso = usoDoMes(valor);
  return {
    ativo: valor.ativo, provedor: valor.provedor, modelo: valor.modelo, modeloNome: valor.modeloNome, endereco: valor.endereco,
    precoEntrada: valor.precoEntrada, precoSaida: valor.precoSaida,
    temChave, chaveDe: valor.chaveDe, chaveEndereco: valor.chaveDe === 'compativel' ? valor.chaveEndereco : null,
    ultimoTesteEm: valor.ultimoTesteEm, ultimoTesteOk: valor.ultimoTesteOk, ultimoTesteMsg: valor.ultimoTesteMsg,
    uso: { ...uso, custo: custoEstimado(uso, valor) },
  };
}

/** Para as telas da base: a IA está pronta para usar? */
export async function situacaoIa(db: Db) {
  const { valor, temChave } = await lerAjustesIa(db);
  return { ativa: valor.ativo && chaveServe(valor, temChave) && !!valor.modelo, modelo: nomeDoModelo(valor), provedor: INFO_PROVEDORES[valor.provedor].nome };
}

export async function gravarAjustesIa(db: Db, vault: SecretsVault, a: AjustesIaGravar, userId: string) {
  const { valor, temChave } = await lerAjustesIa(db);
  const provedor = a.provedor;
  const info = INFO_PROVEDORES[provedor];
  const chave = a.chave?.trim() || null;
  const endereco = provedor === 'compativel' ? normalizarEndereco(a.endereco) || null : null;
  const host = provedor === 'compativel' ? hostDoEndereco(endereco) : '';
  if (a.ativo && !chave && !chaveServePara(valor, temChave, provedor, endereco)) {
    if (temChave && valor.chaveDe === 'compativel' && provedor === 'compativel') {
      throw new BadRequest(`A chave guardada é ${deQuemEaChave(valor)}. Cole a chave de ${host || 'o novo serviço'} para usar este endereço.`);
    }
    if (temChave && valor.chaveDe) throw new BadRequest(`A chave guardada é ${deQuemEaChave(valor)}. Cole a chave ${provedor === 'compativel' && host ? `de ${host}` : info.de} para usar este provedor.`);
    throw new BadRequest(`Cole a chave da API ${info.de} para ligar a IA.`);
  }
  const modelo = a.modelo.trim();
  let secretId: string | undefined;
  if (chave) {
    const [atual] = await db.select({ secretId: settings.secretId }).from(settings).where(eq(settings.id, 'base-ia')).limit(1);
    secretId = await vault.save(db, { existingId: atual?.secretId ?? null, label: `Chave da API ${info.de} (IA da Base de conhecimento)`, plain: chave, userId });
  }
  await gravarComTrava(db, (atual) => {
    // o último teste valia para outra combinação: some, para ninguém achar que esta foi testada
    const mudouOTestado = !!chave || provedor !== atual.provedor || modelo !== atual.modelo || endereco !== atual.endereco;
    return {
      ativo: a.ativo, provedor, modelo,
      // o nome bonito só vale junto com o modelo que veio da lista
      modeloNome: modelo && a.modeloNome?.trim() ? a.modeloNome.trim() : null,
      endereco, precoEntrada: a.precoEntrada ?? null, precoSaida: a.precoSaida ?? null,
      ...(chave ? { chaveDe: provedor, chaveEndereco: provedor === 'compativel' ? host : null } : {}),
      ...(mudouOTestado ? { ultimoTesteEm: null, ultimoTesteOk: null, ultimoTesteMsg: null } : {}),
    };
  }, { secretId, userId });
  return statusIa(db);
}

/**
 * Grava os ajustes com a linha travada, mudando só o que `mudar` devolve: o uso do mês que entrou
 * enquanto a administração salvava (ou o último teste) não se perde, e dois usos ao mesmo tempo
 * somam os dois. Sem `userId` (o uso, o teste), quem configurou continua sendo quem configurou.
 */
async function gravarComTrava(db: Db, mudar: (v: AjustesIa) => Partial<AjustesIa>, opts: { secretId?: string; userId?: string } = {}) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ value: settings.value }).from(settings).where(eq(settings.id, 'base-ia')).for('update');
    let atual: AjustesIa = { ...integ.IA_PADRAO };
    if (row) { try { atual = { ...integ.IA_PADRAO, ...(JSON.parse(row.value) as Partial<AjustesIa>) }; } catch { /* fica o padrão */ } }
    const value = JSON.stringify({ ...atual, ...mudar(atual) });
    const quem = opts.userId !== undefined ? { updatedAt: new Date(), updatedBy: opts.userId } : {};
    const segredo = opts.secretId !== undefined ? { secretId: opts.secretId } : {};
    if (row) await tx.update(settings).set({ value, ...quem, ...segredo }).where(eq(settings.id, 'base-ia'));
    else await tx.insert(settings).values({ id: 'base-ia', value, ...quem, ...segredo });
  });
}

async function registrarUso(db: Db, tipo: 'perguntas' | 'rascunhos', uso: { entrada: number; saida: number }) {
  await gravarComTrava(db, (v) => {
    const u = usoDoMes(v);
    return { uso: { ...u, [tipo]: u[tipo] + 1, entrada: u.entrada + uso.entrada, saida: u.saida + uso.saida } };
  });
}

type ConfigIa = { provedor: ProvedorIa; modelo: string; endereco: string | null; chave: string };

/** A configuração guardada, conferida (o teste usa mesmo com a IA desligada). */
async function configOuErro(db: Db, vault: SecretsVault): Promise<{ valor: AjustesIa; cfg: ConfigIa }> {
  const { valor, temChave } = await lerAjustesIa(db);
  const chave = temChave ? await integ.segredo(db, vault, 'base-ia') : null;
  if (!chave) throw new BadRequest(`A IA ainda não tem a chave. Quem administra escolhe o provedor e cola a chave em ${ONDE}.`);
  if (valor.provedor === 'compativel' && !enderecoValido(valor.endereco)) throw new BadRequest(`Falta o endereço da API do serviço compatível em ${ONDE}.`);
  if (!chaveServe(valor, temChave)) {
    const agora = valor.provedor === 'compativel' ? hostDoEndereco(valor.endereco) : INFO_PROVEDORES[valor.provedor].nome;
    throw new BadRequest(`A chave guardada é ${deQuemEaChave(valor)}, e o escolhido agora é ${agora}. Cole a chave dele em ${ONDE}.`);
  }
  if (!valor.modelo) throw new BadRequest(`Falta escolher o modelo da IA em ${ONDE}.`);
  return { valor, cfg: { provedor: valor.provedor, modelo: valor.modelo, endereco: valor.endereco, chave } };
}

async function prontaOuErro(db: Db, vault: SecretsVault) {
  const r = await configOuErro(db, vault);
  if (!r.valor.ativo) throw new BadRequest(`A IA da base está desligada. Quem administra liga em ${ONDE}.`);
  return r;
}

// ---------- a conversa com cada provedor ----------

const ANTHROPIC = 'https://api.anthropic.com/v1';
const OPENAI = 'https://api.openai.com/v1';
const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * O limite de tokens de cada conversa. Folgado de propósito: os modelos que "pensam" antes de
 * responder gastam parte dele pensando (e só se paga o que se usa). Nos compatíveis, 4.096 — tem
 * serviço que recusa limite maior.
 */
const TOKENS = { termos: 2048, resposta: 8192, rascunho: 8192 };
const limite = (cfg: ConfigIa, n: number) => (cfg.provedor === 'compativel' ? Math.min(n, 4096) : n);

type Pedido = { sistema: string; mensagens: Array<{ papel: 'user' | 'assistant'; texto: string }>; maxTokens: number; json?: boolean };
type Resposta = { texto: string; uso: { entrada: number; saida: number }; cortada: boolean };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const modeloDoGoogle = (m: string) => m.replace(/^models\//, '');
const baseDaOpenAi = (cfg: Pick<ConfigIa, 'provedor' | 'endereco'>) => (cfg.provedor === 'openai' ? OPENAI : normalizarEndereco(cfg.endereco));

/** A chave vai no cabeçalho (nunca no endereço, que aparece em log). */
function cabecalhos(cfg: Pick<ConfigIa, 'provedor' | 'chave'>): Record<string, string> {
  if (cfg.provedor === 'anthropic') return { 'x-api-key': cfg.chave, 'anthropic-version': '2023-06-01' };
  if (cfg.provedor === 'google') return { 'x-goog-api-key': cfg.chave };
  return { authorization: `Bearer ${cfg.chave}` };
}

/** Nada de chave na mensagem de erro (alguns provedores repetem um pedaço dela). */
function semChave(t: string, chave: string) {
  return (chave ? t.split(chave).join('…') : t).replace(/\b(sk-(?:ant-|proj-|or-)?|gsk_|xai-|AIza)[\w*.-]{6,}/g, '$1…');
}

/** O erro do provedor, em português, sem jargão. */
function mensagemDoErro(cfg: Pick<ConfigIa, 'provedor' | 'modelo' | 'chave'>, status: number, j: unknown, bruto: string): string {
  const info = INFO_PROVEDORES[cfg.provedor];
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>;
  const err = o.error as Record<string, unknown> | string | undefined;
  const msg = String((typeof err === 'string' ? err : err?.message) ?? o.message ?? o.detail ?? '').trim();
  const tudo = `${msg} ${JSON.stringify(j ?? '')} ${bruto.slice(0, 2000)}`;
  if (status === 401 || status === 403 || /API_KEY_INVALID|api key not valid|invalid[ _]api[ _]key|incorrect api key/i.test(tudo)) {
    return `A chave da IA foi recusada (${info.nome}). Confira em ${ONDE}.`;
  }
  if (status >= 500) return `A IA ${info.de} está sobrecarregada ou fora do ar agora. Tente de novo em instantes.`;
  // sem crédito é o que o provedor diz com todas as letras; o "passou da cota" do Google no plano grátis é limite por minuto
  if (status === 402 || /insufficient_quota|insufficient[ _](balance|credits?|funds)|credit balance|payment required/i.test(tudo)) {
    return `A conta ${info.de} está sem crédito: quem administra a conta confere o plano e o crédito.`;
  }
  if (status === 404) {
    return cfg.modelo
      ? `A IA ${info.de} não reconheceu o modelo "${cfg.modelo}"${cfg.provedor === 'compativel' ? ' (ou o endereço da API)' : ''}. Troque em ${ONDE}.`
      : 'O serviço não mostrou a lista de modelos (ou o endereço está errado). Confira o endereço, ou escreva o nome do modelo.';
  }
  if (status === 429) return `A conta ${info.de} chegou ao limite de pedidos agora. Tente de novo em um minuto; se continuar, confira o plano da conta no provedor.`;
  return `A IA recusou o pedido (${status})${msg ? `: ${semChave(msg, cfg.chave).slice(0, 220)}` : ''}.`;
}

/** IP da rede de dentro (o próprio servidor, a rede local, a nuvem por dentro): o compatível não vai lá. */
function ipInterno(ip: string): boolean {
  const v4 = ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a = 0, b = 0] = v4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19));
  }
  const s = ip.toLowerCase();
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s);
}

/**
 * Antes de conversar com um serviço compatível: o nome precisa apontar para a internet. O endereço
 * já passou por `enderecoValido` (https, nada de localhost), mas um nome qualquer pode apontar para
 * dentro (127.0.0.1.nip.io): o Gestor confere para onde ele aponta.
 */
async function conferirDestino(url: string, info: { de: string }) {
  const host = new URL(url).hostname.replace(/\.+$/, '');
  let ips: string[];
  try { ips = await ferramentas.resolver(host); } catch { throw new BadRequest(`Não achei o endereço da IA (${host}). Confira em ${ONDE}.`); }
  if (!ips.length) throw new BadRequest(`Não achei o endereço da IA (${host}). Confira em ${ONDE}.`);
  if (ips.some(ipInterno)) throw new BadRequest(`O endereço ${host} aponta para a rede de dentro: a IA ${info.de} precisa ser um serviço da internet.`);
}

async function pedir(cfg: Pick<ConfigIa, 'provedor' | 'modelo' | 'chave'>, url: string, corpo: unknown, tempo: number): Promise<Record<string, any>> {
  const info = INFO_PROVEDORES[cfg.provedor];
  if (cfg.provedor === 'compativel') await conferirDestino(url, info);
  let r: Response;
  try {
    r = await ferramentas.fetchFn(url, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: { ...(corpo === undefined ? {} : { 'content-type': 'application/json' }), ...cabecalhos(cfg) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      // a API responde no próprio endereço: redirecionar seria mandar a chave e os artigos para outro lugar
      redirect: 'error',
      signal: AbortSignal.timeout(tempo),
    });
  } catch (e) {
    const nome = e instanceof Error ? e.name : '';
    if (nome === 'TimeoutError' || nome === 'AbortError') throw new BadRequest(`A IA ${info.de} demorou demais para responder. Tente de novo.`);
    const causa = (e as { cause?: { code?: string; message?: string } })?.cause;
    if (causa?.code === 'ENOTFOUND') throw new BadRequest(`Não achei o endereço da IA ${info.de}. Confira em ${ONDE}.`);
    if (/redirect/i.test(String(causa?.message ?? ''))) throw new BadRequest(`O endereço da IA ${info.de} mandou o pedido para outro lugar (redirecionou), e o Gestor não segue. Confira o endereço em ${ONDE}.`);
    throw new BadRequest(`Não deu para falar com a IA ${info.de}: ${semChave(e instanceof Error ? e.message : 'sem resposta', cfg.chave)}.`);
  }
  const bruto = await r.text().catch(() => '');
  let j: unknown = null;
  try { j = bruto ? JSON.parse(bruto) : null; } catch { j = null; }
  if (!r.ok) throw new BadRequest(mensagemDoErro(cfg, r.status, j, bruto));
  if (!j || typeof j !== 'object') throw new BadRequest(`A IA ${info.de} respondeu num formato que o Gestor não entendeu.`);
  return j as Record<string, any>;
}

/** Uma conversa: as instruções, a mensagem e o limite. Devolve o texto, o que gastou e se foi cortada. */
async function conversar(cfg: ConfigIa, p: Pedido): Promise<Resposta> {
  const tempo = 90_000;
  if (cfg.provedor === 'anthropic') {
    const j = await pedir(cfg, `${ANTHROPIC}/messages`, {
      model: cfg.modelo, max_tokens: p.maxTokens, system: p.sistema,
      messages: p.mensagens.map((m) => ({ role: m.papel, content: m.texto })),
    }, tempo);
    if (j.stop_reason === 'refusal') throw new BadRequest('A IA se recusou a responder essa. Tente com outras palavras.');
    const u = j.usage ?? {};
    return {
      texto: (Array.isArray(j.content) ? j.content : []).filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? '')).join(''),
      uso: { entrada: num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens), saida: num(u.output_tokens) },
      cortada: j.stop_reason === 'max_tokens',
    };
  }
  if (cfg.provedor === 'google') {
    const j = await pedir(cfg, `${GOOGLE}/models/${encodeURIComponent(modeloDoGoogle(cfg.modelo))}:generateContent`, {
      systemInstruction: { parts: [{ text: p.sistema }] },
      contents: p.mensagens.map((m) => ({ role: m.papel === 'assistant' ? 'model' : 'user', parts: [{ text: m.texto }] })),
      generationConfig: { maxOutputTokens: p.maxTokens, ...(p.json ? { responseMimeType: 'application/json' } : {}) },
    }, tempo);
    if (j.promptFeedback?.blockReason) throw new BadRequest(`O Google bloqueou a pergunta (${String(j.promptFeedback.blockReason)}). Tente com outras palavras.`);
    const c = Array.isArray(j.candidates) ? j.candidates[0] : null;
    if (!c) throw new BadRequest('A IA do Google não devolveu resposta. Tente de novo.');
    const u = j.usageMetadata ?? {};
    return {
      // o "pensamento" do modelo (thought) não é resposta
      texto: (Array.isArray(c.content?.parts) ? c.content.parts : []).filter((x: any) => !x?.thought && typeof x?.text === 'string').map((x: any) => x.text).join(''),
      uso: { entrada: num(u.promptTokenCount), saida: num(u.candidatesTokenCount) + num(u.thoughtsTokenCount) },
      cortada: c.finishReason === 'MAX_TOKENS',
    };
  }
  // a OpenAI e os compatíveis: a mesma conversa (chat/completions)
  const openai = cfg.provedor === 'openai';
  const j = await pedir(cfg, `${baseDaOpenAi(cfg)}/chat/completions`, {
    model: cfg.modelo,
    messages: [{ role: 'system', content: p.sistema }, ...p.mensagens.map((m) => ({ role: m.papel, content: m.texto }))],
    // a OpenAI trocou o nome do limite (os modelos que pensam não aceitam o antigo); os compatíveis seguem com o antigo
    ...(openai ? { max_completion_tokens: p.maxTokens } : { max_tokens: p.maxTokens }),
    ...(openai && p.json ? { response_format: { type: 'json_object' } } : {}),
  }, tempo);
  const c = Array.isArray(j.choices) ? j.choices[0] : null;
  if (!c) throw new BadRequest(`A IA ${INFO_PROVEDORES[cfg.provedor].de} não devolveu resposta. Tente de novo.`);
  if (c.message?.refusal) throw new BadRequest('A IA se recusou a responder essa. Tente com outras palavras.');
  const u = j.usage ?? {};
  // a resposta vem em texto ou, em alguns compatíveis, em partes (o "pensamento" numa, o texto noutra)
  const conteudo = c.message?.content;
  const texto = typeof conteudo === 'string' ? conteudo
    : Array.isArray(conteudo) ? conteudo.filter((x: any) => x?.type === 'text' && typeof x.text === 'string').map((x: any) => x.text).join('') : '';
  return { texto, uso: { entrada: num(u.prompt_tokens), saida: num(u.completion_tokens) }, cortada: c.finish_reason === 'length' };
}

// ---------- os modelos que a chave pode usar ----------

export type ModeloIa = { id: string; nome: string };

/** "Buscar modelos": a lista do provedor, com a chave digitada (ou a guardada, se for do mesmo provedor). */
export async function modelosDoProvedor(db: Db, vault: SecretsVault, p: { provedor: ProvedorIa; endereco?: string | null; chave?: string }): Promise<{ modelos: ModeloIa[]; chaveGuardada: boolean }> {
  const info = INFO_PROVEDORES[p.provedor];
  const endereco = p.provedor === 'compativel' ? normalizarEndereco(p.endereco) : null;
  if (p.provedor === 'compativel' && !enderecoValido(endereco)) throw new BadRequest('Informe o endereço da API do serviço (começa com https://) para buscar os modelos.');
  const { valor, temChave } = await lerAjustesIa(db);
  let chave = p.chave?.trim() || null;
  // a guardada só vai para o provedor dela (e, no compatível, só para o serviço dela)
  const chaveGuardada = !chave && chaveServePara(valor, temChave, p.provedor, endereco);
  if (chaveGuardada) chave = await integ.segredo(db, vault, 'base-ia');
  if (!chave) throw new BadRequest(`Cole a chave da API ${p.provedor === 'compativel' ? `de ${hostDoEndereco(endereco)}` : info.de} para buscar os modelos.`);
  const cfg = { provedor: p.provedor, modelo: '', chave };
  const tempo = 20_000;
  let modelos: ModeloIa[] = [];
  if (p.provedor === 'anthropic') {
    const j = await pedir(cfg, `${ANTHROPIC}/models?limit=1000`, undefined, tempo);
    modelos = (Array.isArray(j.data) ? j.data : []).map((m: any) => ({ id: String(m?.id ?? ''), nome: String(m?.display_name || m?.id || '') }));
  } else if (p.provedor === 'google') {
    const j = await pedir(cfg, `${GOOGLE}/models?pageSize=1000`, undefined, tempo);
    modelos = (Array.isArray(j.models) ? j.models : [])
      .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m: any) => { const id = modeloDoGoogle(String(m?.name ?? '')); return { id, nome: String(m?.displayName || id) }; });
  } else {
    const j = await pedir(cfg, `${baseDaOpenAi({ provedor: p.provedor, endereco })}/models`, undefined, tempo);
    const lista: any[] = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : Array.isArray(j) ? j : [];
    // os mais novos primeiro (a OpenAI diz quando cada um saiu); o nome bonito, quando o serviço manda (OpenRouter)
    modelos = [...lista].sort((a, b) => num(b?.created) - num(a?.created))
      .map((m: any) => ({ id: String(m?.id ?? ''), nome: String(m?.name || m?.id || '') }));
  }
  const vistos = new Set<string>();
  modelos = modelos.filter((m) => m.id && modeloDeConversa(m.id) && !vistos.has(m.id) && vistos.add(m.id));
  return { modelos: modelos.slice(0, 500), chaveGuardada };
}

// ---------- testar ----------

/** Testar a chave, o modelo (e o endereço) guardados com uma pergunta de uma palavra. */
export async function testarIa(db: Db, vault: SecretsVault) {
  const { valor, cfg } = await configOuErro(db, vault);
  let ok = true;
  let mensagem: string;
  try {
    // o mesmo limite de tokens das respostas: modelo que não aceita esse limite falha já no teste (e só se paga o que se usa)
    const r = await conversar(cfg, { sistema: 'Teste de conexão do Ingline Gestão.', mensagens: [{ papel: 'user', texto: 'Responda só com a palavra: funcionando' }], maxTokens: limite(cfg, TOKENS.resposta) });
    const texto = limparResposta(r.texto).replace(/\s+/g, ' ').trim();
    if (texto) mensagem = `A IA respondeu (${nomeDoModelo(valor)}, ${INFO_PROVEDORES[valor.provedor].nome}): "${texto.slice(0, 60)}". Pode usar.`;
    else { ok = false; mensagem = `A IA (${nomeDoModelo(valor)}) respondeu sem texto${r.cortada ? ' (passou do limite pensando)' : ''}. Tente de novo ou escolha outro modelo.`; }
  } catch (e) { ok = false; mensagem = e instanceof Error ? e.message : 'Falhou'; }
  await gravarComTrava(db, () => ({ ultimoTesteEm: new Date().toISOString(), ultimoTesteOk: ok, ultimoTesteMsg: mensagem }));
  return { ok, mensagem };
}

// ---------- perguntar à base ----------

export type RespostaDaBase = {
  /** a resposta, linha a linha; cada linha com os artigos (números) de onde saiu */
  trechos: TrechoIa[];
  /** os artigos citados primeiro, depois os outros que foram para a IA */
  artigos: Array<{ numero: number; codigo: string; titulo: string; citado: boolean }>;
  /** false = a base não tinha a resposta (nenhum artigo citado) */
  achou: boolean;
  modelo: string;
  provedor: string;
  /** em dólar; null = o preço do modelo não foi informado em Ajustes */
  custo: number | null;
};

const SEM_ARTIGO = 'Procurei na base e não achei nenhum artigo sobre isso. Quando alguém resolver, vale registrar: a próxima pergunta já acha.';

/** Perguntar à base: a IA sugere as palavras, o Gestor procura, e ela responde só com o que achou, citando. */
export async function perguntar(db: Db, vault: SecretsVault, pergunta: string, quem: Quem): Promise<RespostaDaBase> {
  const { valor, cfg } = await prontaOuErro(db, vault);
  conferirLimite(quem.id);
  const quemRespondeu = { modelo: nomeDoModelo(valor), provedor: INFO_PROVEDORES[valor.provedor].nome };
  const uso = { entrada: 0, saida: 0 };
  let conversou = false;
  const somar = (r: Resposta) => { conversou = true; uso.entrada += r.uso.entrada; uso.saida += r.uso.saida; return r; };
  const nada = (texto: string): RespostaDaBase => ({ trechos: [{ texto, fontes: [] }], artigos: [], achou: false, ...quemRespondeu, custo: custoEstimado(uso, valor) });

  const artigos = await publicadosParaBusca(db);
  if (!artigos.length) return nada('A base ainda não tem nenhum artigo publicado. Quando alguém resolver um chamado que deu trabalho, vale registrar: a próxima pergunta já acha.');

  try {
    // 1ª conversa: as palavras para procurar — o jeito do cliente falar e o nome técnico
    const r1 = somar(await conversar(cfg, { sistema: INSTRUCOES_TERMOS, mensagens: [{ papel: 'user', texto: pergunta }], maxTokens: limite(cfg, TOKENS.termos), json: true }));
    const termos = termosDaResposta(r1.texto);

    // a busca é a do Gestor: a pergunta e cada palavra, no modo "alguma"; os melhores vão para a IA
    const achados = juntarAchados([pergunta, ...termos].map((t) => buscarArtigos(artigos, t, 'alguma')), 6);
    if (!achados.length) return nada(SEM_ARTIGO);

    // 2ª conversa: a resposta, só com esses artigos, citando [BC-12]
    const r2 = somar(await conversar(cfg, { sistema: INSTRUCOES_PERGUNTA, mensagens: [{ papel: 'user', texto: montarPerguntaParaIa(pergunta, achados) }], maxTokens: limite(cfg, TOKENS.resposta) }));
    const { trechos, citados } = lerRespostaComCitacoes(r2.texto, achados.map((a) => a.numero));
    if (!trechos.length) {
      throw new BadRequest(r2.cortada ? 'A IA não terminou a resposta (passou do limite pensando). Tente de novo, ou troque o modelo em Ajustes.' : 'A IA não devolveu resposta. Tente de novo.');
    }
    if (r2.cortada) trechos.push({ texto: '… (a resposta foi cortada: ficou longa demais)', fontes: [] });
    const titulos = new Map(achados.map((a) => [a.numero, a.titulo]));
    return {
      trechos,
      artigos: [
        ...citados.map((n) => ({ numero: n, codigo: codigoDoArtigo(n), titulo: titulos.get(n) ?? '', citado: true })),
        ...achados.filter((a) => !citados.includes(a.numero)).map((a) => ({ numero: a.numero, codigo: codigoDoArtigo(a.numero), titulo: a.titulo, citado: false })),
      ],
      achou: citados.length > 0,
      ...quemRespondeu,
      custo: custoEstimado(uso, valor),
    };
  } finally {
    // o que gastou entra na conta do mês mesmo se a 2ª conversa falhar (a conta do mês não derruba a resposta)
    if (conversou) await registrarUso(db, 'perguntas', uso).catch(() => undefined);
  }
}

// ---------- o rascunho a partir do card ----------

/** O rascunho do artigo, escrito pela IA a partir do card (o que a pessoa revisa antes de publicar). */
export async function rascunho(db: Db, vault: SecretsVault, ref: string, quem: Quem) {
  const { valor, cfg } = await prontaOuErro(db, vault);
  const card = await acharCard(db, ref);
  if (!card) throw new BadRequest(`O chamado ${ref} não está na cópia do LineChat.`);
  conferirLimite(quem.id);
  const [campos, etiquetas, etapas, movimentos] = await Promise.all([
    db.select().from(linechatFields),
    card.tagIds.length ? db.select().from(linechatTags).where(inArray(linechatTags.id, card.tagIds)) : Promise.resolve([] as Array<typeof linechatTags.$inferSelect>),
    db.select().from(linechatSteps),
    db.select().from(linechatCardMoves).where(eq(linechatCardMoves.cardId, card.id)).orderBy(asc(linechatCardMoves.at)),
  ]);
  const nomeEtapa = (id: string | null) => etapas.find((e) => e.id === id)?.title ?? '?';
  const quando = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const valores = Object.entries(card.customFields ?? {})
    .map(([k, v]) => { const f = campos.find((c) => c.key === k); const t = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v); return t ? `${f?.name ?? k}: ${t}` : null; })
    .filter(Boolean);
  const texto = [
    `Chamado ${card.key ?? ''}: ${card.title}`,
    // a descrição do card pode ser enorme (conversa colada): vai até um ponto
    `Descrição:\n${cortarTexto(textoDoCard(card.description) || '(sem descrição)', 12_000)}`,
    valores.length ? `Campos do card:\n${valores.join('\n')}` : null,
    etiquetas.length ? `Etiquetas: ${etiquetas.map((t) => t.name).join(', ')}` : null,
    movimentos.length ? `Etapas por onde passou: ${movimentos.map((m) => `${nomeEtapa(m.toStepId)} (${quando(m.at)})`).join(' → ')}` : null,
    `Etapa atual: ${card.stepTitle ?? '?'}`,
  ].filter(Boolean).join('\n\n');
  const r = await conversar(cfg, { sistema: INSTRUCOES_RASCUNHO, mensagens: [{ papel: 'user', texto }], maxTokens: limite(cfg, TOKENS.rascunho), json: true });
  await registrarUso(db, 'rascunhos', r.uso).catch(() => undefined);
  const escrito = rascunhoDaIa(jsonDaResposta(r.texto));
  if (!escrito.titulo && !escrito.oQueAcontece && !escrito.comoResolver) {
    throw new BadRequest(r.cortada ? 'A IA não terminou o rascunho (passou do limite). Tente de novo.' : 'A IA não devolveu o rascunho no formato combinado. Tente de novo.');
  }
  return { ...escrito, custo: custoEstimado(r.uso, valor), modelo: nomeDoModelo(valor), provedor: INFO_PROVEDORES[valor.provedor].nome };
}
