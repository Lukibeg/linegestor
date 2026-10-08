/**
 * BASE DE CONHECIMENTO (Patch 1.8, decisão 0039) — as regras que o servidor e a prévia usam iguais.
 *
 *  - o artigo (modelo do KCS: o que acontece, como resolver, por que acontece) e as ligações
 *  - o "texto simples": passos numerados, comandos entre crases e prints colados, lidos em blocos
 *    para a tela desenhar (sem editor de Word e sem biblioteca nova — decisão do Luan)
 *  - a busca: sem acento, por pedaço de palavra, no título, nos textos, nas palavras do cliente,
 *    nos nomes ligados e nos códigos, com o pedaço do texto onde achou
 *  - a diferença entre duas versões (o que saiu, o que entrou)
 *  - os artigos que valem para um chamado (o livrinho da tabela de Chamados)
 *  - o que se grava: o artigo (com o "pedir a leitura da equipe" junto) e o comentário
 */
import { z } from 'zod';
import { IdSchema, PaginacaoSchema } from './schemas.js';

// ---------- o código do artigo ----------

/** BC-12: o código curto, para citar no card do LineChat e no WhatsApp (como o IS-3607 dos chamados). */
export const codigoDoArtigo = (numero: number) => `BC-${numero}`;

/** "BC-12", "bc12", "BC 12" → 12. Qualquer outra coisa → null. */
export function numeroDoCodigo(t: string | null | undefined): number | null {
  const m = /^\s*bc[\s-]*(\d{1,7})\s*$/i.exec(t ?? '');
  return m ? Number(m[1]) : null;
}

export const SITUACOES_ARTIGO = ['rascunho', 'publicado'] as const;
export type SituacaoArtigo = (typeof SITUACOES_ARTIGO)[number];

// ---------- as ligações ----------

/**
 * Com o que o artigo se liga. Assunto guarda o NOME da opção do campo Assunto do LineChat (é como
 * o card guarda); os outros guardam o id do Gestor (o chamado, o id do card do LineChat).
 */
export const TIPOS_LIGACAO = ['produto', 'modulo', 'assunto', 'cliente', 'modelo', 'operadora', 'chamado', 'projeto'] as const;
export type TipoLigacao = (typeof TIPOS_LIGACAO)[number];
export const NOMES_LIGACAO: Record<TipoLigacao, string> = {
  produto: 'Produto', modulo: 'Módulo', assunto: 'Assunto do LineChat', cliente: 'Cliente', modelo: 'Modelo',
  operadora: 'Operadora', chamado: 'Chamado', projeto: 'Projeto',
};

export const LigacaoArtigoSchema = z.object({
  tipo: z.enum(TIPOS_LIGACAO),
  alvo: z.string().trim().min(1).max(300),
});
export type LigacaoArtigo = z.infer<typeof LigacaoArtigoSchema>;

// ---------- gravar e listar ----------

/** O "data:<tipo>;base64,…" que a tela manda (o mesmo dos anexos de projeto). */
const ConteudoArquivo = z
  .string()
  .min(1)
  .max(14_000_000, 'Arquivo muito grande (máximo 10 MB)')
  .regex(/^data:[-\w.+]+\/[-\w.+]+(;[-\w.=]+)*;base64,[A-Za-z0-9+/=]+$/, 'Não consegui ler esse arquivo');

/**
 * Um arquivo que chega junto com o artigo. `ref` é o marcador provisório que a tela pôs no texto
 * (`[print:ref]`): o servidor grava o arquivo e troca o marcador pelo id de verdade.
 */
export const AnexoNovoArtigoSchema = z.object({
  ref: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Marcador de anexo inválido'),
  fileName: z.string().trim().min(1, 'O arquivo precisa de um nome').max(200),
  conteudo: ConteudoArquivo,
  /** true = print no meio do texto; false = anexo da lista */
  inline: z.boolean().default(false),
});
export type AnexoNovoArtigo = z.infer<typeof AnexoNovoArtigoSchema>;

export const ArtigoGravarSchema = z.object({
  titulo: z.string().trim().min(3, 'Escreva um título (do jeito que alguém procuraria)').max(200),
  oQueAcontece: z.string().max(20_000).nullable().optional(),
  comoResolver: z.string().max(50_000).nullable().optional(),
  porQueAcontece: z.string().max(20_000).nullable().optional(),
  palavrasDoCliente: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  ligacoes: z.array(LigacaoArtigoSchema).max(80).default([]),
  /** true = publicar (precisa do Como resolver); false = fica rascunho */
  publicar: z.boolean().default(false),
  anexosNovos: z.array(AnexoNovoArtigoSchema).max(20).default([]),
  anexosRemovidos: z.array(IdSchema).max(50).default([]),
  /**
   * A versão que a pessoa abriu para editar. Qualquer um melhora o artigo de qualquer um (decisão
   * do Luan): se outra pessoa salvou no meio, o servidor avisa em vez de passar por cima.
   */
  versao: z.number().int().min(0).optional(),
  /**
   * Pedir a leitura obrigatória da equipe junto com o publicar (só quem cuida da base). Pedido do
   * Luan na prévia: marcar já no formulário, na hora de escrever. Num artigo que já era de leitura
   * obrigatória, pede de novo (todo mundo lê outra vez).
   */
  pedirLeitura: z.boolean().default(false),
});
export type ArtigoGravar = z.infer<typeof ArtigoGravarSchema>;

/** Um comentário no artigo (pedido do Luan na prévia, 07/10): fica registrado quem e quando. */
export const ComentarioArtigoSchema = z.object({
  texto: z.string().trim().min(1, 'Escreva o comentário').max(4000, 'Comentário muito longo (máximo 4.000 letras)'),
});
export type ComentarioArtigo = z.infer<typeof ComentarioArtigoSchema>;

export const FILTROS_SITUACAO_BASE = ['publicados', 'rascunhos', 'obrigatorios', 'todos'] as const;
export const ORDENS_BASE = ['relevancia', 'recentes', 'titulo', 'numero'] as const;

export const BaseListarSchema = PaginacaoSchema.extend({
  q: z.string().trim().max(200).optional(),
  produto: z.string().optional(),
  modulo: z.string().optional(),
  assunto: z.string().optional(),
  cliente: z.string().optional(),
  modelo: z.string().optional(),
  operadora: z.string().optional(),
  projeto: z.string().optional(),
  chamado: z.string().optional(),
  autor: z.string().optional(),
  /** publicados (o padrão) · rascunhos (os seus; quem cuida da base vê todos) · obrigatórios · todos */
  situacao: z.enum(FILTROS_SITUACAO_BASE).default('publicados'),
  ordem: z.enum(ORDENS_BASE).default('relevancia'),
});
export type BaseListarQuery = z.infer<typeof BaseListarSchema>;

/** O que falta para publicar (null = pode). Rascunho grava só com o título. */
export function faltaParaPublicar(a: { titulo: string; comoResolver?: string | null }): string | null {
  if (!a.titulo.trim()) return 'Escreva o título antes de publicar.';
  if (!textoPuro(a.comoResolver).trim()) return 'Para publicar, preencha o "Como resolver": é a parte que o próximo vai procurar.';
  return null;
}

// ---------- o texto simples ----------

/**
 * Um pedaço do texto, já entendido:
 *  - `passo`: linha que começa com número ("1." ou "1)"); comando, print e frase logo abaixo
 *    (sem linha em branco no meio) ficam dentro do passo
 *  - `item`: linha que começa com "-", "•" ou "*"
 *  - `comando`: linha inteira entre crases (`asterisk -r`), ou várias entre ``` e ```: ganha Copiar
 *  - `imagem`: `[print:<id>]` numa linha sozinha
 *  - `video` e `arquivo` (só no portal do cliente, com `midia: true`): `[video:<id>]` e
 *    `[arquivo:<id>]` numa linha sozinha — o player do vídeo e o botão de baixar
 *  - `paragrafo`: o resto (linhas seguidas viram um parágrafo; linha em branco separa)
 */
export type BlocoTexto =
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'passo'; numero: number; texto: string; dentro: BlocoTexto[] }
  | { tipo: 'item'; texto: string }
  | { tipo: 'comando'; texto: string }
  | { tipo: 'imagem'; anexoId: string }
  | { tipo: 'video'; arquivoId: string }
  | { tipo: 'arquivo'; arquivoId: string };

const RE_PASSO = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const RE_ITEM = /^\s*[-•*]\s+(.*)$/;
const RE_COMANDO = /^\s*`([^`]+)`\s*$/;
const RE_IMAGEM = /^\s*\[print:([A-Za-z0-9_-]{1,64})\]\s*$/;
const RE_VIDEO = /^\s*\[video:([A-Za-z0-9_-]{1,64})\]\s*$/;
const RE_ARQUIVO = /^\s*\[arquivo:([A-Za-z0-9_-]{1,64})\]\s*$/;
const RE_CERCA = /^\s*```/;

/** `midia: true` (o portal do cliente) entende também `[video:id]` e `[arquivo:id]`; a base não. */
export function blocosDoTexto(texto: string | null | undefined, opcoes: { midia?: boolean } = {}): BlocoTexto[] {
  const linhas = (texto ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: BlocoTexto[] = [];
  let passo: Extract<BlocoTexto, { tipo: 'passo' }> | null = null;
  let paragrafo: string[] = [];
  const destino = () => (passo ? passo.dentro : out);
  const fecharParagrafo = () => {
    if (paragrafo.length) destino().push({ tipo: 'paragrafo', texto: paragrafo.join('\n') });
    paragrafo = [];
  };
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]!;
    if (RE_CERCA.test(linha)) {
      // bloco de comandos entre ``` e ``` (o jeito do WhatsApp de escrever "código")
      fecharParagrafo();
      const dentroDaCerca: string[] = [];
      i++;
      while (i < linhas.length && !RE_CERCA.test(linhas[i]!)) dentroDaCerca.push(linhas[i++]!);
      if (dentroDaCerca.some((l) => l.trim())) destino().push({ tipo: 'comando', texto: dentroDaCerca.join('\n').replace(/^\n+|\n+$/g, '') });
      continue;
    }
    if (!linha.trim()) { fecharParagrafo(); passo = null; continue; }
    let m: RegExpExecArray | null;
    if ((m = RE_PASSO.exec(linha))) {
      fecharParagrafo();
      passo = { tipo: 'passo', numero: Number(m[1]), texto: m[2]!.trim(), dentro: [] };
      out.push(passo);
      continue;
    }
    if ((m = RE_ITEM.exec(linha))) { fecharParagrafo(); passo = null; out.push({ tipo: 'item', texto: m[1]!.trim() }); continue; }
    if ((m = RE_IMAGEM.exec(linha))) { fecharParagrafo(); destino().push({ tipo: 'imagem', anexoId: m[1]! }); continue; }
    if (opcoes.midia && (m = RE_VIDEO.exec(linha))) { fecharParagrafo(); destino().push({ tipo: 'video', arquivoId: m[1]! }); continue; }
    if (opcoes.midia && (m = RE_ARQUIVO.exec(linha))) { fecharParagrafo(); destino().push({ tipo: 'arquivo', arquivoId: m[1]! }); continue; }
    if ((m = RE_COMANDO.exec(linha))) { fecharParagrafo(); destino().push({ tipo: 'comando', texto: m[1]!.trim() }); continue; }
    paragrafo.push(linha.trim());
  }
  fecharParagrafo();
  return out;
}

/** Todos os arquivos citados no texto — prints, vídeos e arquivos (`[print:id]`, `[video:id]`, `[arquivo:id]`), na ordem. */
export function arquivosDoTexto(texto: string | null | undefined): string[] {
  const out: string[] = [];
  for (const l of (texto ?? '').split(/\r?\n/)) { const m = RE_IMAGEM.exec(l) ?? RE_VIDEO.exec(l) ?? RE_ARQUIVO.exec(l); if (m && !out.includes(m[1]!)) out.push(m[1]!); }
  return out;
}

/** Os prints citados no texto (`[print:<id>]`), na ordem. */
export function printsDoTexto(texto: string | null | undefined): string[] {
  const out: string[] = [];
  for (const l of (texto ?? '').split(/\r?\n/)) { const m = RE_IMAGEM.exec(l); if (m) out.push(m[1]!); }
  return out;
}

/** Troca os marcadores provisórios (`[print:ref]`) pelos ids de verdade, depois de gravar os arquivos. */
export function trocarMarcadores(texto: string | null | undefined, ids: Record<string, string>): string | null {
  if (texto == null) return null;
  return texto.replace(/\[print:([A-Za-z0-9_-]{1,64})\]/g, (inteiro, ref: string) => (ids[ref] ? `[print:${ids[ref]}]` : inteiro));
}

/** O texto sem marcas: para a busca, o trecho achado e o resumo da lista. */
export function textoPuro(texto: string | null | undefined): string {
  return (texto ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !RE_IMAGEM.test(l) && !RE_VIDEO.test(l) && !RE_ARQUIVO.test(l) && !RE_CERCA.test(l))
    .map((l) => l.replace(/`/g, '').trim())
    .filter(Boolean)
    .join('\n');
}

/** Os pedaços de uma linha: texto, `código` entre crases, endereço da internet e código de artigo (BC-12). */
export type PedacoLinha =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'codigo'; texto: string }
  | { tipo: 'link'; texto: string; href: string }
  | { tipo: 'artigo'; texto: string; numero: number };

export function pedacosDaLinha(linha: string): PedacoLinha[] {
  const out: PedacoLinha[] = [];
  // endereço: precisa de um ponto no nome (http://IP-DO-TELEFONE é exemplo de texto, não endereço)
  const re = /`([^`]+)`|(https?:\/\/[\w-]+(?:\.[\w-]+)+(?::\d+)?(?:[/?#][^\s<>"')]*)?)|\b(BC-(\d{1,7}))\b/gi;
  let ultimo = 0;
  for (let m = re.exec(linha); m; m = re.exec(linha)) {
    if (m.index > ultimo) out.push({ tipo: 'texto', texto: linha.slice(ultimo, m.index) });
    if (m[1] != null) out.push({ tipo: 'codigo', texto: m[1] });
    else if (m[2] != null) {
      // ponto ou vírgula no fim é pontuação da frase, não do endereço
      const href = m[2].replace(/[.,;:!?]+$/, '');
      out.push({ tipo: 'link', texto: href, href });
      if (href.length < m[2].length) out.push({ tipo: 'texto', texto: m[2].slice(href.length) });
    } else out.push({ tipo: 'artigo', texto: m[3]!.toUpperCase(), numero: Number(m[4]) });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < linha.length) out.push({ tipo: 'texto', texto: linha.slice(ultimo) });
  return out;
}

// ---------- a busca ----------

/**
 * Sem acento e em minúscula, **um caractere para um**: a posição no texto normalizado é a mesma do
 * original, e é assim que o trecho achado marca o lugar certo.
 */
export function normalizar1a1(s: string): string {
  let out = '';
  for (const ch of s) {
    const n = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    out += n.length === ch.length ? n : (n[0] ?? ' ').padEnd(ch.length, ' ');
  }
  return out;
}

const PALAVRAS_VAZIAS = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'uns', 'umas', 'para', 'pra', 'por', 'com', 'que', 'se', 'ao', 'aos', 'ou', 'é', 'e']);

/** As palavras que contam numa busca ("o ramal não toca" → ramal, nao, toca). */
export function termosDaBusca(q: string | null | undefined): string[] {
  const termos = normalizar1a1(q ?? '').split(/[^a-z0-9/._-]+/).map((t) => t.replace(/^[._/-]+|[._/-]+$/g, '')).filter(Boolean);
  const uteis = termos.filter((t) => !PALAVRAS_VAZIAS.has(t) && (t.length > 1 || /\d/.test(t)));
  return [...new Set(uteis.length ? uteis : termos)];
}

/** O que a busca precisa de um artigo. */
export type ArtigoParaBusca = {
  numero: number;
  titulo: string;
  oQueAcontece: string | null;
  comoResolver: string | null;
  porQueAcontece: string | null;
  palavrasDoCliente: string[];
  /** os nomes do que está ligado (o cliente, o assunto, o modelo…): achar "Clínica Aurora" acha os artigos dela */
  nomesLigados?: string[];
};

/** Um pedaço do trecho achado: `achado` = é o que a pessoa procurou (vai em destaque). */
export type PedacoTrecho = { texto: string; achado: boolean };
export type Achado<T> = { artigo: T; pontos: number; trecho: PedacoTrecho[] | null };

type Campo = { nome: 'titulo' | 'palavras' | 'ligados' | 'oQueAcontece' | 'comoResolver' | 'porQueAcontece'; original: string; normal: string; peso: number };

function camposDoArtigo(a: ArtigoParaBusca): Campo[] {
  const c = (nome: Campo['nome'], original: string, peso: number): Campo => ({ nome, original, normal: normalizar1a1(original), peso });
  return [
    c('titulo', a.titulo, 6),
    c('palavras', a.palavrasDoCliente.join(' · '), 5),
    c('ligados', (a.nomesLigados ?? []).join(' · '), 3),
    c('oQueAcontece', textoPuro(a.oQueAcontece), 3),
    c('comoResolver', textoPuro(a.comoResolver), 2),
    c('porQueAcontece', textoPuro(a.porQueAcontece), 2),
  ];
}

const comecaPalavra = (texto: string, i: number) => i === 0 || !/[a-z0-9]/.test(texto[i - 1]!);

/**
 * Procura nos artigos: cada palavra precisa aparecer em algum lugar do artigo (título, textos,
 * palavras do cliente ou nomes ligados), e os que têm as palavras nos lugares que pesam mais vêm
 * antes. O código BC-12 acha só aquele artigo. Sem busca, vêm todos, sem pontos.
 */
export function buscarArtigos<T extends ArtigoParaBusca>(artigos: T[], q: string | null | undefined): Achado<T>[] {
  const bruto = (q ?? '').trim();
  if (!bruto) return artigos.map((artigo) => ({ artigo, pontos: 0, trecho: null }));
  const codigo = numeroDoCodigo(bruto);
  if (codigo != null) return artigos.filter((a) => a.numero === codigo).map((artigo) => ({ artigo, pontos: 1000, trecho: null }));

  const termos = termosDaBusca(bruto);
  if (!termos.length) return artigos.map((artigo) => ({ artigo, pontos: 0, trecho: null }));
  const frase = normalizar1a1(bruto).replace(/\s+/g, ' ').trim();
  const soNumero = /^\d{1,7}$/.test(bruto) ? Number(bruto) : null;

  const out: Achado<T>[] = [];
  for (const artigo of artigos) {
    const campos = camposDoArtigo(artigo);
    let pontos = 0;
    let achadas = 0;
    for (const t of termos) {
      let melhor = 0;
      let lugares = 0;
      for (const c of campos) {
        const i = c.normal.indexOf(t);
        if (i < 0) continue;
        lugares++;
        melhor = Math.max(melhor, c.peso + (comecaPalavra(c.normal, i) ? 1 : 0));
      }
      if (melhor > 0) { achadas++; pontos += melhor + Math.min(lugares - 1, 2) * 0.5; }
    }
    if (soNumero != null && artigo.numero === soNumero) { pontos += 50; achadas = termos.length; }
    if (achadas < termos.length) continue;
    // a frase inteira, do jeito que foi escrita, vale mais que as palavras soltas
    if (frase.includes(' ')) {
      if (campos[0]!.normal.includes(frase)) pontos += 10;
      else if (campos[1]!.normal.includes(frase)) pontos += 8;
      else if (campos.slice(3).some((c) => c.normal.includes(frase))) pontos += 5;
    }
    out.push({ artigo, pontos, trecho: trechoAchado(campos, termos) });
  }
  return out.sort((a, b) => b.pontos - a.pontos);
}

/**
 * O pedaço do texto onde a busca achou, com as palavras em destaque. Vem do lugar que tem mais
 * palavras procuradas — o título não entra (ele já aparece em cima).
 */
function trechoAchado(campos: Campo[], termos: string[], tamanho = 170): PedacoTrecho[] | null {
  const candidatos = campos.filter((c) => c.nome !== 'titulo' && c.nome !== 'ligados' && c.normal.trim());
  let melhor: Campo | null = null;
  let quantas = 0;
  for (const c of candidatos) {
    const n = termos.filter((t) => c.normal.includes(t)).length;
    if (n > quantas) { quantas = n; melhor = c; }
  }
  if (!melhor) return null;
  const texto = melhor.original.replace(/\n/g, ' ');
  const normal = melhor.normal.replace(/\n/g, ' ');
  const primeiro = Math.min(...termos.map((t) => normal.indexOf(t)).filter((i) => i >= 0));
  let inicio = Math.max(0, primeiro - 50);
  if (inicio > 0) { const espaco = texto.indexOf(' ', inicio); if (espaco >= 0 && espaco < primeiro) inicio = espaco + 1; }
  let fim = Math.min(texto.length, inicio + tamanho);
  if (fim < texto.length) { const espaco = texto.lastIndexOf(' ', fim); if (espaco > primeiro) fim = espaco; }
  // as marcas: toda ocorrência de toda palavra procurada dentro da janela
  const marcas: Array<[number, number]> = [];
  for (const t of termos) {
    for (let i = normal.indexOf(t, inicio); i >= 0 && i < fim; i = normal.indexOf(t, i + 1)) marcas.push([i, Math.min(fim, i + t.length)]);
  }
  marcas.sort((a, b) => a[0] - b[0]);
  const juntas: Array<[number, number]> = [];
  for (const m of marcas) {
    const u = juntas[juntas.length - 1];
    if (u && m[0] <= u[1]) u[1] = Math.max(u[1], m[1]); else juntas.push([m[0], m[1]]);
  }
  const pedacos: PedacoTrecho[] = [];
  let pos = inicio;
  if (inicio > 0) pedacos.push({ texto: '…', achado: false });
  for (const [a, b] of juntas) {
    if (a > pos) pedacos.push({ texto: texto.slice(pos, a), achado: false });
    pedacos.push({ texto: texto.slice(a, b), achado: true });
    pos = b;
  }
  if (pos < fim) pedacos.push({ texto: texto.slice(pos, fim), achado: false });
  if (fim < texto.length) pedacos.push({ texto: '…', achado: false });
  return pedacos;
}

// ---------- as versões ----------

export type LinhaDiferenca = { tipo: 'igual' | 'saiu' | 'entrou'; texto: string };

/** O que mudou de um texto para outro, linha a linha (a maior sequência em comum fica como "igual"). */
export function diferencaDeLinhas(antes: string | null | undefined, depois: string | null | undefined): LinhaDiferenca[] {
  const a = (antes ?? '').replace(/\r\n?/g, '\n').split('\n');
  const b = (depois ?? '').replace(/\r\n?/g, '\n').split('\n');
  if (antes == null || antes === '') a.length = 0;
  if (depois == null || depois === '') b.length = 0;
  // texto muito grande: a conta inteira pesaria; mostra tudo saindo e tudo entrando
  if (a.length * b.length > 400_000) return [...a.map((texto) => ({ tipo: 'saiu' as const, texto })), ...b.map((texto) => ({ tipo: 'entrou' as const, texto }))];
  const n = a.length, m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: LinhaDiferenca[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ tipo: 'igual', texto: a[i]! }); i++; j++; }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ tipo: 'saiu', texto: a[i++]! });
    else out.push({ tipo: 'entrou', texto: b[j++]! });
  }
  while (i < n) out.push({ tipo: 'saiu', texto: a[i++]! });
  while (j < m) out.push({ tipo: 'entrou', texto: b[j++]! });
  return out;
}

/** O texto de uma versão (o mesmo do artigo). */
export type TextoDoArtigo = { titulo: string; oQueAcontece: string | null; comoResolver: string | null; porQueAcontece: string | null; palavrasDoCliente: string[] };
export const PARTES_DO_ARTIGO: Array<{ id: keyof TextoDoArtigo; nome: string }> = [
  { id: 'titulo', nome: 'Título' },
  { id: 'oQueAcontece', nome: 'O que acontece' },
  { id: 'comoResolver', nome: 'Como resolver' },
  { id: 'porQueAcontece', nome: 'Por que acontece' },
  { id: 'palavrasDoCliente', nome: 'Palavras do cliente' },
];

/** O que mudou entre duas versões, parte a parte (só as partes que mudaram). */
export function diferencaDasVersoes(antes: TextoDoArtigo, depois: TextoDoArtigo): Array<{ parte: string; nome: string; linhas: LinhaDiferenca[] }> {
  const comoTexto = (v: TextoDoArtigo[keyof TextoDoArtigo]) => (Array.isArray(v) ? v.join('\n') : v ?? '');
  return PARTES_DO_ARTIGO
    .map((p) => ({ parte: p.id as string, nome: p.nome, a: comoTexto(antes[p.id]), b: comoTexto(depois[p.id]) }))
    .filter((p) => p.a !== p.b)
    .map((p) => ({ parte: p.parte, nome: p.nome, linhas: diferencaDeLinhas(p.a, p.b) }));
}

// ---------- o livrinho no chamado ----------

export type ArtigoCurto = { id: string; numero: number; titulo: string };

/** Os artigos publicados, arrumados pelo que eles ligam: o chamado, o assunto e o cliente. */
export type IndiceParaChamados = {
  porChamado: Record<string, ArtigoCurto[]>;
  /** a chave é o nome da opção do Assunto, sem acento */
  porAssunto: Record<string, ArtigoCurto[]>;
  /** a chave é o id do cliente no Gestor */
  porCliente: Record<string, ArtigoCurto[]>;
};

export function montarIndiceParaChamados(artigos: Array<ArtigoCurto & { ligacoes: LigacaoArtigo[] }>): IndiceParaChamados {
  const indice: IndiceParaChamados = { porChamado: {}, porAssunto: {}, porCliente: {} };
  const por = (mapa: Record<string, ArtigoCurto[]>, chave: string, a: ArtigoCurto) => { (mapa[chave] ??= []).push(a); };
  for (const a of artigos) {
    const curto = { id: a.id, numero: a.numero, titulo: a.titulo };
    for (const l of a.ligacoes) {
      if (l.tipo === 'chamado') por(indice.porChamado, l.alvo, curto);
      else if (l.tipo === 'assunto') por(indice.porAssunto, normalizar1a1(l.alvo).trim(), curto);
      else if (l.tipo === 'cliente') por(indice.porCliente, l.alvo, curto);
    }
  }
  return indice;
}

const valoresDe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]).filter(Boolean);

/**
 * Os artigos que valem para um chamado: os ligados ao próprio card, ao assunto dele e ao cliente
 * dele (o Cliente do card ligado ao cadastro, como nos Relatórios). O produto não entra: com quase
 * todo chamado sendo de LinePBX, o livrinho acenderia em tudo e deixaria de dizer alguma coisa.
 */
export function artigosDoChamado(
  card: { id: string; campos: Record<string, unknown> },
  indice: IndiceParaChamados,
  chaves: { assunto: string | null; cliente: string | null },
  clienteDaOpcao: (opcao: string) => string | null,
): ArtigoCurto[] {
  const vistos = new Set<string>();
  const out: ArtigoCurto[] = [];
  const somar = (lista?: ArtigoCurto[]) => { for (const a of lista ?? []) if (!vistos.has(a.id)) { vistos.add(a.id); out.push(a); } };
  somar(indice.porChamado[card.id]);
  if (chaves.assunto) for (const v of valoresDe(card.campos[chaves.assunto])) somar(indice.porAssunto[normalizar1a1(v).trim()]);
  if (chaves.cliente) for (const v of valoresDe(card.campos[chaves.cliente])) { const id = clienteDaOpcao(v); if (id) somar(indice.porCliente[id]); }
  return out;
}
