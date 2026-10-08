/**
 * A IA DA BASE DE CONHECIMENTO (Patch 1.8, decisão 0039) — com o provedor que a empresa escolher.
 *
 * Em 08/10 o Luan pediu a IA de volta e perguntou se dava para usar outros provedores. Dá: quem
 * administra escolhe em Administração › Ajustes, e troca quando quiser —
 *  - **Anthropic** (Claude), **OpenAI** (ChatGPT) ou **Google** (Gemini), cada um com a sua API;
 *  - **outro compatível**: qualquer serviço que fala a língua da OpenAI (OpenRouter, DeepSeek, Groq,
 *    Mistral, Maritaca, xAI…) — basta o endereço da API.
 *
 * Para valer com todos, a IA não usa nada que só um provedor tem: a **busca é a do Gestor** (a mesma
 * da tela, no modo "alguma palavra"), a IA recebe os artigos já achados, cada um com o código, e cita
 * [BC-12] no próprio texto. O Gestor confere as citações: só vale artigo que foi para ela.
 *
 * Aqui ficam as regras que o servidor e a prévia usam iguais: os provedores, o que se grava nos
 * Ajustes, as instruções, o que vai para a IA e como ler o que volta. A conversa com cada API fica
 * no servidor (`apps/api/src/services/baseIa.ts`).
 */
import { z } from 'zod';
import { codigoDoArtigo, textoPuro, type Achado, type ArtigoParaBusca } from './base.js';

// ---------- os provedores ----------

export const PROVEDORES_IA = ['anthropic', 'openai', 'google', 'compativel'] as const;
export type ProvedorIa = (typeof PROVEDORES_IA)[number];

export const INFO_PROVEDORES: Record<ProvedorIa, {
  /** o nome na tela de Ajustes */
  nome: string;
  /** "da Anthropic", "do Google": para as frases ("a chave guardada é da Anthropic") */
  de: string;
  /** como a chave começa (só a dica, o Gestor não confere) */
  chave: string;
  /** onde a chave se cria */
  ondeCriar: string;
  /** um nome de modelo, para o exemplo do campo */
  exemploModelo: string;
}> = {
  anthropic: { nome: 'Anthropic (Claude)', de: 'da Anthropic', chave: 'começa com sk-ant-', ondeCriar: 'platform.claude.com › API Keys', exemploModelo: 'claude-sonnet-5-5' },
  openai: { nome: 'OpenAI (ChatGPT)', de: 'da OpenAI', chave: 'começa com sk-', ondeCriar: 'platform.openai.com › API keys', exemploModelo: 'gpt-5.4-mini' },
  google: { nome: 'Google (Gemini)', de: 'do Google', chave: 'começa com AIza', ondeCriar: 'aistudio.google.com › Get API key', exemploModelo: 'gemini-3.5-flash' },
  compativel: { nome: 'Outro compatível (OpenRouter, DeepSeek, Groq…)', de: 'do serviço compatível', chave: 'a chave que o serviço deu', ondeCriar: 'no painel do serviço escolhido', exemploModelo: 'deepseek-chat' },
};

/** Os serviços compatíveis mais usados, para ninguém precisar caçar o endereço (dá para escrever outro). */
export const ENDERECOS_COMPATIVEIS: ReadonlyArray<{ nome: string; endereco: string; dica: string }> = [
  { nome: 'OpenRouter', endereco: 'https://openrouter.ai/api/v1', dica: 'muitos modelos com uma chave só' },
  { nome: 'DeepSeek', endereco: 'https://api.deepseek.com', dica: '' },
  { nome: 'Groq', endereco: 'https://api.groq.com/openai/v1', dica: '' },
  { nome: 'Mistral', endereco: 'https://api.mistral.ai/v1', dica: '' },
  { nome: 'Maritaca (Sabiá)', endereco: 'https://chat.maritaca.ai/api', dica: 'brasileira' },
  { nome: 'xAI (Grok)', endereco: 'https://api.x.ai/v1', dica: '' },
];

/** O endereço como a API espera: sem barra no fim e sem o "/chat/completions" que muita gente cola junto. */
export function normalizarEndereco(e: string | null | undefined): string {
  return (e ?? '').trim().replace(/\/+$/, '').replace(/\/(chat\/completions|completions|models)$/i, '').replace(/\/+$/, '');
}

/**
 * O nome do serviço no endereço ("api.deepseek.com"), em minúsculas e sem o ponto do fim; vazio se
 * o endereço não presta. A chave guardada do compatível fica **presa a esse nome**: mudar o
 * endereço para outro serviço pede a chave dele (a chave de um nunca vai para o outro).
 */
export function hostDoEndereco(e: string | null | undefined): string {
  try { return new URL(normalizarEndereco(e)).hostname.toLowerCase().replace(/\.+$/, ''); } catch { return ''; }
}

/**
 * O endereço de um serviço compatível: `https://` e um nome da internet. Nada da rede de dentro
 * (localhost, IP solto, .local, nem com o ponto no fim): o servidor do Gestor só conversa com
 * serviço de fora — e, antes de conversar, ainda confere para onde o nome aponta (`baseIa.ts`).
 */
export function enderecoValido(e: string | null | undefined): boolean {
  const t = normalizarEndereco(e);
  if (!t) return false;
  let u: URL;
  try { u = new URL(t); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return false;
  const host = hostDoEndereco(t);
  if (!host.includes('.') || /(^|\.)(local|localhost|internal|lan|home|arpa|intranet|corp)$/.test(host)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || host.includes(':')) return false;
  return true;
}

/** O que não é modelo de conversa (as listas dos provedores trazem de tudo: voz, imagem, embeddings…). */
const NAO_E_CONVERSA = /(embed|whisper|tts|dall-?e|davinci|babbage|moderation|transcri|audio|realtime|image|imagen|veo|sora|aqa|rerank|speech|guard|computer-use|codex|deep-research|search)/i;
export const modeloDeConversa = (id: string) => !NAO_E_CONVERSA.test(id);

// ---------- o que se grava e o que se pede ----------

const ModeloSchema = z.string().trim().max(150).refine((v) => v === '' || /^[\w.:/@+-]+$/.test(v), 'O nome do modelo não leva espaço (ex.: claude-sonnet-5-5, gpt-5.4-mini)');

export const AjustesIaSchema = z.object({
  ativo: z.boolean(),
  provedor: z.enum(PROVEDORES_IA).default('anthropic'),
  /** o nome do modelo como a API do provedor chama (claude-sonnet-5-5, gpt-5.4-mini, gemini-3.5-flash…) */
  modelo: ModeloSchema.default(''),
  /** o nome bonito, quando o modelo veio da lista do provedor (só para mostrar) */
  modeloNome: z.string().trim().max(150).nullish(),
  /** só no "compatível": o endereço da API (https://…) */
  endereco: z.string().trim().max(300).nullish(),
  /** a chave da API: vai para o cofre e nunca volta para a tela; em branco = manter a guardada */
  chave: z.string().trim().max(500).optional(),
  /** o preço do modelo, em dólar por milhão de tokens: opcional, só para a tela mostrar quanto custou */
  precoEntrada: z.number().min(0).max(10_000).nullish(),
  precoSaida: z.number().min(0).max(10_000).nullish(),
}).superRefine((a, ctx) => {
  if (a.ativo && !a.modelo) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['modelo'], message: 'Para ligar a IA, escolha o modelo (ou escreva o nome dele).' });
  if (a.provedor === 'compativel' && (a.ativo || a.endereco?.trim()) && !enderecoValido(a.endereco)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endereco'], message: 'O endereço da API começa com https:// — por exemplo, https://openrouter.ai/api/v1' });
  }
});
export type AjustesIaGravar = z.infer<typeof AjustesIaSchema>;

/** "Buscar modelos": a lista que a chave pode usar (a chave digitada, ou a guardada se for do mesmo provedor). */
export const ModelosIaSchema = z.object({
  provedor: z.enum(PROVEDORES_IA),
  endereco: z.string().trim().max(300).nullish(),
  chave: z.string().trim().max(500).optional(),
});

export const PerguntarSchema = z.object({ pergunta: z.string().trim().min(3, 'Escreva a pergunta').max(600, 'Pergunta longa demais (máximo 600 letras)') });
export const RascunhoIaSchema = z.object({ chamado: z.string().trim().min(1).max(80) });

/** Quanto custou, em dólar — só quando quem administra informou o preço do modelo (o Gestor não chuta preço). */
export function custoEstimado(uso: { entrada: number; saida: number }, preco: { precoEntrada?: number | null; precoSaida?: number | null }): number | null {
  if (preco.precoEntrada == null || preco.precoSaida == null) return null;
  return Math.round(((uso.entrada * preco.precoEntrada + uso.saida * preco.precoSaida) / 1_000_000) * 10_000) / 10_000;
}

// ---------- as instruções (as mesmas para todos os provedores) ----------

const QUEM_SOMOS = 'a equipe de suporte da Ingline Systems (PABX e telefonia IP: LinePBX, LineChat, VoiceNet, aparelhos e operadoras)';

/** 1ª conversa da pergunta: as palavras para procurar na base (o jeito do cliente e o nome técnico). */
export const INSTRUCOES_TERMOS = [
  `Você ajuda ${QUEM_SOMOS} a procurar artigos na base de conhecimento interna.`,
  'Com a pergunta que vier, escreva de 3 a 8 termos de busca curtos, em português: as palavras importantes da pergunta, sinônimos, o jeito de o cliente falar e o nome técnico (exemplos: "cai sozinha", "queda de ligação", "SIP ALG", "RTP").',
  'Responda só com JSON, assim: {"termos": ["...", "..."]}',
].join('\n');

/** 2ª conversa: a resposta, só com os artigos achados, citando o código de cada um. */
export const INSTRUCOES_PERGUNTA = [
  `Você responde perguntas d${QUEM_SOMOS} usando SOMENTE os artigos da base de conhecimento que vêm junto com a pergunta.`,
  'Cada artigo começa com o código entre colchetes, como [BC-12]. Logo depois de cada frase ou passo que usa um artigo, escreva o código dele entre colchetes, assim: [BC-12]. Se usar dois, [BC-12] [BC-7].',
  'Responda em português do Brasil, curto e direto: primeiro o que fazer, em passos numerados, um por linha ("1. …"); depois, se ajudar, por que acontece. Texto simples, sem markdown: nada de asterisco, # ou tabela.',
  'Se os artigos não respondem a pergunta, diga isso em uma frase, sem código nenhum, e sugira registrar um artigo quando o problema for resolvido. Não invente procedimento, comando, endereço, senha ou configuração que não esteja nos artigos.',
  'Nunca escreva senhas.',
].join('\n');

/** O rascunho do artigo a partir do card do chamado (a pessoa revisa antes de publicar). */
export const INSTRUCOES_RASCUNHO = [
  'Você ajuda a equipe de suporte da Ingline Systems a registrar na base de conhecimento o que aprendeu num chamado.',
  'Com o chamado que vier (título, descrição, campos e etapas por onde passou), escreva o rascunho do artigo.',
  'Responda só com JSON, com estas chaves: {"titulo": "...", "oQueAcontece": "...", "comoResolver": "...", "porQueAcontece": "...", "palavrasDoCliente": ["...", "..."]}',
  'Regras: o título é curto, do jeito que alguém procuraria o problema; "oQueAcontece" fica nas palavras do cliente; "comoResolver" vem em passos numerados, um por linha ("1. …"), com cada comando sozinho numa linha, entre crases; "porQueAcontece" só se o chamado disser (senão, vazio); "palavrasDoCliente" são de 2 a 6 jeitos de o cliente descrever o mesmo problema.',
  'Use só o que está no chamado. Se faltar informação para um passo, escreva [completar: o que falta] no lugar, em vez de inventar.',
  'Nunca escreva senhas. Escreva em português do Brasil.',
].join('\n');

// ---------- o que vai para a IA ----------

/** Um artigo do jeito que vai para a IA: as partes, em texto puro (sem as marcas de print e arquivo). */
export function partesParaIa(a: ArtigoParaBusca): string[] {
  const partes: string[] = [];
  if (a.oQueAcontece?.trim()) partes.push(`O que acontece: ${textoPuro(a.oQueAcontece)}`);
  if (a.comoResolver?.trim()) partes.push(`Como resolver:\n${textoPuro(a.comoResolver)}`);
  if (a.porQueAcontece?.trim()) partes.push(`Por que acontece: ${textoPuro(a.porQueAcontece)}`);
  if (a.palavrasDoCliente.length) partes.push(`Como o cliente costuma dizer: ${a.palavrasDoCliente.join('; ')}`);
  if (a.nomesLigados?.length) partes.push(`Ligado a: ${a.nomesLigados.join('; ')}`);
  return partes.length ? partes : ['(artigo sem texto)'];
}

/** Até quanto de cada artigo vai para a IA (uns 1.500 tokens): artigo enorme não faz a conta disparar. */
export const LIMITE_DO_ARTIGO_PARA_IA = 6000;

/** Corta no fim de uma linha (ou de uma palavra), com o aviso de que continua. */
export function cortarTexto(t: string, max: number, aviso = '(… continua)'): string {
  if (t.length <= max) return t;
  const pedaco = t.slice(0, max);
  const fim = Math.max(pedaco.lastIndexOf('\n'), pedaco.lastIndexOf(' '));
  return `${(fim > max * 0.6 ? pedaco.slice(0, fim) : pedaco).trimEnd()}\n${aviso}`;
}

/** A mensagem da 2ª conversa: os artigos achados, cada um com o código, e a pergunta no fim. */
export function montarPerguntaParaIa(pergunta: string, artigos: ArtigoParaBusca[]): string {
  const blocos = artigos.map((a) => `[${codigoDoArtigo(a.numero)}] ${a.titulo}\n${cortarTexto(partesParaIa(a).join('\n'), LIMITE_DO_ARTIGO_PARA_IA, '(… o artigo continua)')}`);
  return [`Os artigos que a busca achou na base (${artigos.length}):`, ...blocos, `Pergunta da equipe: ${pergunta}`].join('\n\n');
}

/**
 * Junta as buscas (a pergunta e cada termo que a IA sugeriu): os pontos de cada artigo se somam e
 * os melhores vão para a IA — no máximo `max`, para a conta não crescer com o tamanho da base.
 */
export function juntarAchados<T extends ArtigoParaBusca>(listas: Achado<T>[][], max = 6): T[] {
  const soma = new Map<number, { artigo: T; pontos: number; vezes: number }>();
  for (const lista of listas) {
    for (const a of lista) {
      // busca sem palavra que conte ("???") devolve tudo com zero ponto: isso não é achar
      if (!(a.pontos > 0)) continue;
      const s = soma.get(a.artigo.numero) ?? { artigo: a.artigo, pontos: 0, vezes: 0 };
      s.pontos += a.pontos; s.vezes++;
      soma.set(a.artigo.numero, s);
    }
  }
  return [...soma.values()]
    .sort((x, y) => y.pontos - x.pontos || y.vezes - x.vezes || x.artigo.numero - y.artigo.numero)
    .slice(0, max)
    .map((s) => s.artigo);
}

// ---------- o que volta da IA ----------

/** Muda só o que está fora do `código` (comando não se mexe: `**201` e `__CALLERID` são do Asterisk). */
function foraDoCodigo(linha: string, mudar: (t: string) => string): string {
  return linha.split(/(`[^`]*`)/).map((p, i) => (i % 2 ? p : mudar(p))).join('');
}

/**
 * O texto que volta, limpo: sem o "pensamento" que alguns modelos mandam junto (<think>…</think>),
 * com os traços esquisitos (‑ – —) do código BC virando hífen, e sem as marcas de markdown que
 * escapam mesmo pedindo texto simples — só o negrito de verdade (**palavra**), nunca o `**201` de
 * um código de discagem.
 */
export function limparResposta(texto: string | null | undefined): string {
  return (texto ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\b(BC)[\u2010-\u2015\u2212\uFE63\uFF0D](\d)/gi, '$1-$2')
    .split('\n')
    .map((l) => foraDoCodigo(
      l.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^(\s*)[*-]\s+/, '$1• '),
      // (sem "olhar para trás" na expressão: o Safari dos iPhones mais antigos não entende)
      (t) => t.replace(/(^|[\s(])\*\*(\S(?:.*?\S)?)\*\*(?=[\s.,;:!?)]|$)/g, '$1$2'),
    ).trimEnd())
    .join('\n')
    .trim();
}

/** Do `{` (ou `[`) em `i` até o que fecha ele, pulando o que está dentro de "texto"; -1 se não fecha. */
function fimDoBloco(t: string, i: number): number {
  const pilha: string[] = [];
  let emTexto = false;
  for (let k = i; k < t.length; k++) {
    const c = t[k]!;
    if (emTexto) { if (c === '\\') k++; else if (c === '"') emTexto = false; continue; }
    if (c === '"') emTexto = true;
    else if (c === '{' || c === '[') pilha.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') { if (pilha.pop() !== c) return -1; if (!pilha.length) return k; }
  }
  return -1;
}

/**
 * O primeiro JSON que vier no texto (com ou sem a cerca ```json em volta, com ou sem conversa antes
 * e depois); null se não tiver. A cerca de dentro dos textos (um comando entre ```) fica.
 */
export function jsonDaResposta(texto: string | null | undefined): unknown {
  const t = (texto ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    .replace(/^```[\w-]*[ \t]*\n?/, '').replace(/\n?[ \t]*```$/, '').trim();
  const tentar = (s: string) => { try { return JSON.parse(s) as unknown; } catch { return undefined; } };
  const inteiro = tentar(t);
  if (inteiro !== undefined) return inteiro;
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{' && t[i] !== '[') continue;
    const f = fimDoBloco(t, i);
    if (f < 0) continue;
    const j = tentar(t.slice(i, f + 1));
    if (j !== undefined && typeof j === 'object') return j;
  }
  return null;
}

/** Os termos da 1ª conversa. Se o JSON vier torto, aproveita as linhas; se não vier nada, a busca usa só a pergunta. */
export function termosDaResposta(texto: string | null | undefined): string[] {
  const j = jsonDaResposta(texto);
  // {"termos": [...]}, uma lista solta, ou o primeiro campo que for lista (quando a IA troca o nome da chave)
  const campos = j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  const doJson = campos ? (Array.isArray(campos.termos) ? campos.termos : Object.values(campos).find(Array.isArray)) : undefined;
  let lista: unknown[] = Array.isArray(j) ? j : (doJson as unknown[] | undefined) ?? [];
  if (!lista.length && j == null) {
    lista = limparResposta(texto).split(/[\n,;]+/).map((s) => s.replace(/^\s*(?:[•*-]|\d{1,2}[.)])\s+/, '').replace(/^["'\s]+|["'\s.]+$/g, ''));
  }
  const termos = lista.filter((t): t is string => typeof t === 'string').map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 80 && /[\p{L}\p{N}]/u.test(t));
  const vistos = new Set<string>();
  return termos.filter((t) => { const k = t.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 8);
}

/** Um pedaço da resposta (uma linha) com os artigos de onde saiu. `texto` vazio = linha em branco. */
export type TrechoIa = { texto: string; fontes: number[] };

/** [BC-12], (BC-12), 【BC-12】, [BC-12, BC-7], [BC-12; BC-7], [BC-12 e BC-7] — com os espaços em volta. */
const RE_CITACAO = /[ \t]*[[(【（]\s*(BC[\s-]?\d{1,7}(?:\s*(?:[,;]|\be\b)\s*BC[\s-]?\d{1,7})*)\s*[\])】）]([ \t]*)/gi;

/**
 * Lê a resposta com as citações: cada linha vira um trecho com os artigos citados nela. A citação
 * entre colchetes sai do texto e vira fonte — só se o artigo foi para a IA (`conhecidos`); a de
 * artigo que não foi some sem virar fonte. O código solto na frase ("siga o BC-3") fica no texto (pode
 * ser um artigo citado dentro de outro) e só conta como fonte se o artigo foi para ela.
 */
export function lerRespostaComCitacoes(texto: string | null | undefined, conhecidos: Iterable<number>): { trechos: TrechoIa[]; citados: number[] } {
  const validos = new Set(conhecidos);
  const trechos: TrechoIa[] = [];
  const citados: number[] = [];
  for (const bruta of limparResposta(texto).split('\n')) {
    const fontes: number[] = [];
    const somar = (n: number) => {
      if (!validos.has(n)) return;
      if (!fontes.includes(n)) fontes.push(n);
      if (!citados.includes(n)) citados.push(n);
    };
    let linha = bruta.replace(RE_CITACAO, (inteiro: string, dentro: string, depois: string, onde: number, toda: string) => {
      for (const m of dentro.matchAll(/BC[\s-]?(\d{1,7})/gi)) somar(Number(m[1]));
      // no começo da linha, ou antes de pontuação (ou de outra citação), não sobra espaço nenhum
      const seguinte = toda[onde + inteiro.length];
      if (!toda.slice(0, onde).trim() || seguinte === undefined || /[.,;:!?)\]】（[(【]/.test(seguinte)) return '';
      return depois ? ' ' : '';
    });
    for (const m of linha.matchAll(/\bBC-(\d{1,7})\b/gi)) somar(Number(m[1]));
    linha = linha.trimEnd();
    // linhas em branco: uma só entre parágrafos, nenhuma no começo
    if (!linha.trim() && (!trechos.length || !trechos[trechos.length - 1]!.texto)) continue;
    trechos.push({ texto: linha.trim() ? linha : '', fontes });
  }
  while (trechos.length && !trechos[trechos.length - 1]!.texto) trechos.pop();
  return { trechos, citados };
}

/** O rascunho que volta da IA, já conferido (o que não for texto vira vazio). */
export function rascunhoDaIa(entrada: unknown): { titulo: string; oQueAcontece: string; comoResolver: string; porQueAcontece: string; palavrasDoCliente: string[] } {
  const o = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>;
  const t = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    titulo: t(o.titulo, 200),
    oQueAcontece: t(o.oQueAcontece, 20_000),
    comoResolver: t(o.comoResolver, 50_000),
    porQueAcontece: t(o.porQueAcontece, 20_000),
    palavrasDoCliente: Array.isArray(o.palavrasDoCliente)
      ? o.palavrasDoCliente.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 80)).slice(0, 10)
      : [],
  };
}
