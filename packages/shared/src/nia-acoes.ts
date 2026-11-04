/**
 * O /NIA NO CARD (Patch 2.4.2, decisão 0060): as "ações" da NIA — a IA do suporte da Ingline, um serviço de fora, já no
 * ar — dentro de qualquer campo de texto do card, em todos os painéis. O pedido do Luan (30/10): digitar "/nia" num
 * campo abre um menu com TODOS os comandos (o nome e uma explicação curta de cada um, para quem nunca leu
 * documentação); "/nia corrigir o relato, a solução e a causa" trabalha só os campos citados; "/nia corrigir" sem
 * citar trabalha o card inteiro. Quem decide quais campos é a NIA, pela frase da pessoa: o Gestor manda o card
 * inteiro e mostra o que voltar.
 *
 * A regra de ouro: a NIA PROPÕE, a pessoa aplica. Nada é gravado na proposta; o Aplicar grava só o que a pessoa
 * deixou marcado, pelo caminho de sempre da ficha (o `alterar`, com a sessão dela), e o Histórico ganha a linha
 * `nia` com a frase do que foi gravado.
 *
 * Aqui mora o que a tela, o servidor e a prévia usam igual: o contrato da NIA (o catálogo, o pedido e a resposta,
 * como ela manda — não mudamos nada dele), o "/nia" sendo digitado (`lerComandoDaNia`), os campos de texto que cada
 * painel usa (`camposDeTextoDoCard`), as folhas do assunto (`folhasDoAssunto`), o nome → id das listas ao aplicar
 * (`idsDasListasDaNia`), a frase do Histórico (`resumoDoQueAplicou`), o limite de cada campo (`problemaDoTamanho`) e o
 * destaque do que mudou (`diferencaPorPalavras`).
 */
import { z } from 'zod';
import { GRAVIDADES, NOME_GRAVIDADE, type Gravidade } from './atendimento-prazos.js';
import { caminhoDoAssunto, campoLigado, emLista, type Assunto, type Painel, type TipoChamado } from './atendimento.js';
import { paraBusca } from './formatos.js';

// =====================================================================
//  O CONTRATO DA NIA (como ela manda; só consumimos)
// =====================================================================

/** Um comando do catálogo da NIA (GET /api/nia/acoes). O menu mostra o `nome` e a `descricao`. */
export type AcaoDaNia = {
  comando: string;
  nome: string;
  descricao: string;
  /** "texto": corrigir, formalizar e resumir; "campos": criar-chamado e preencher-card-vazio */
  entrega: 'texto' | 'campos';
  /** hoje vazio em todas: o comando serve em qualquer campo */
  camposOrigem: string[];
  exigeTexto: boolean;
};

/** O catálogo como a NIA manda (o que não vier fica com o padrão; o comando sem nome nem comando fica de fora). */
const AcaoDaNiaSchema = z.object({
  comando: z.string().trim().min(1).max(60),
  nome: z.string().trim().max(120).optional(),
  descricao: z.string().trim().max(1000).optional(),
  entrega: z.enum(['texto', 'campos']).catch('texto'),
  camposOrigem: z.array(z.string()).max(50).catch([]).optional(),
  exigeTexto: z.boolean().catch(false).optional(),
}).passthrough();
export const CatalogoDaNiaSchema = z.object({ acoes: z.array(z.unknown()).max(200) });

/** O catálogo lido, limpo: o comando que vier quebrado sai, e não o catálogo inteiro. */
export function acoesDoCatalogo(v: unknown): AcaoDaNia[] | null {
  const c = CatalogoDaNiaSchema.safeParse(v);
  if (!c.success) return null;
  const acoes: AcaoDaNia[] = [];
  for (const x of c.data.acoes) {
    const a = AcaoDaNiaSchema.safeParse(x);
    if (!a.success || acoes.some((y) => y.comando === a.data.comando)) continue;
    acoes.push({
      comando: a.data.comando, nome: a.data.nome || a.data.comando, descricao: a.data.descricao ?? '', entrega: a.data.entrega,
      camposOrigem: a.data.camposOrigem ?? [], exigeTexto: a.data.exigeTexto ?? false,
    });
  }
  return acoes;
}

/** O que o Gestor devolve à tela no lugar do catálogo: sem a NIA configurada, o /nia não aparece nos cards. */
export type CatalogoDaNia = { configurada: boolean; acoes: AcaoDaNia[]; erro: string | null };

/** Os campos de texto do card que vão para a NIA, como estão gravados (a ordem da ficha). */
export const CAMPOS_DE_TEXTO_DA_NIA = ['titulo', 'relato', 'descricao', 'solucao', 'causa', 'contorno', 'validacao'] as const;
export type CampoDeTextoDaNia = (typeof CAMPOS_DE_TEXTO_DA_NIA)[number];
/** Os nomes que a pessoa lê (os mesmos do histórico). */
export const NOME_DO_CAMPO_DA_NIA: Record<CampoDeTextoDaNia | 'anotacao', string> = {
  titulo: 'Título', relato: 'Relato do cliente', descricao: 'Descrição', solucao: 'Solução', causa: 'Causa', contorno: 'Solução de contorno',
  validacao: 'Validação', anotacao: 'Anotação',
};
/** O tamanho máximo de cada um (os mesmos da ficha): o que passar é recusado, nunca cortado. */
export const LIMITE_DO_CAMPO_DA_NIA: Record<CampoDeTextoDaNia, number> = {
  titulo: 200, relato: 20_000, descricao: 20_000, solucao: 20_000, causa: 5_000, contorno: 10_000, validacao: 5_000,
};
/** Os campos de lista que a entrega "campos" propõe (os nomes, como a pessoa lê). */
export const LISTAS_DA_NIA = ['cliente', 'produto', 'tipo', 'assunto', 'gravidade'] as const;
export type ListaDaNia = (typeof LISTAS_DA_NIA)[number];
export const NOME_DA_LISTA_DA_NIA: Record<ListaDaNia, string> = { cliente: 'Cliente', produto: 'Produto', tipo: 'Tipo', assunto: 'Assunto', gravidade: 'Gravidade' };

/** O "chamado" que vai para a NIA: os campos de texto que o painel usa, como estão gravados ("" = vazio). */
export type ChamadoParaANia = Partial<Record<CampoDeTextoDaNia, string>> & { anotacao?: string };
/** As opções de lista (só para a entrega "campos"): os nomes, só do que o painel usa e está ativo; o assunto, só as folhas. */
export type OpcoesParaANia = Partial<Record<ListaDaNia, string[]>>;

/** Um anexo como a NIA recebe: o nome e o conteúdo em base64, sem o prefixo "data:…;base64,". */
export type AnexoParaANia = { nome: string; base64: string };
/** O que a NIA diz que leu de cada anexo ("imagem", "lido inteiro"; "Word", "texto extraído"). */
export type AnexoLidoDaNia = { nome: string; tipo: string; como: string };

/** O corpo do POST /api/nia/executar. */
export type PedidoParaANia = {
  comando: string;
  instrucao: string;
  /** onde o /nia foi digitado (só registro: não decide nada) */
  campo: string;
  /** o código do card, para a auditoria da NIA */
  referencia: string;
  chamado: ChamadoParaANia;
  opcoes?: OpcoesParaANia;
  /** os arquivos do lugar onde o /nia foi digitado (o rascunho da anotação, ou os anexos do campo): contexto para a NIA */
  anexos?: AnexoParaANia[];
};

/** Uma linha do corrigir e do formalizar: o campo, o antes e o depois. */
export type AlteracaoDaNia = { campo: string; nome: string; antes: string; depois: string; mudou: boolean };

/** A resposta do POST /api/nia/executar (SEMPRE 200: quem diz se deu certo é o `ok`). */
export type RespostaDaNia = {
  ok: boolean;
  comando?: string;
  entrega?: 'texto' | 'campos';
  alcance?: string;
  alteracoes?: AlteracaoDaNia[];
  texto?: string | null;
  campos?: Partial<Record<'titulo' | 'relato' | 'descricao', string | null>> & Partial<Record<ListaDaNia, string | string[] | null>>;
  naoPropostos?: string[];
  /** o que a NIA leu de cada anexo */
  anexosLidos?: AnexoLidoDaNia[];
  resumo?: string | null;
  observacao?: string | null;
  erro?: string | null;
  custo?: unknown;
  duracaoMs?: number;
};

/** A resposta conferida (o que veio de um jeito que a tela não entende vira o erro, e não uma tela quebrada). */
const AlteracaoSchema = z.object({
  campo: z.string().min(1).max(80), nome: z.string().max(120).catch(''), antes: z.string().nullish().transform((v) => v ?? ''),
  depois: z.string().nullish().transform((v) => v ?? ''), mudou: z.boolean().catch(true),
});
const ValorDeLista = z.union([z.string(), z.array(z.string()).max(50), z.null()]).catch(null);
export const RespostaDaNiaSchema = z.object({
  ok: z.boolean(),
  comando: z.string().optional(),
  entrega: z.enum(['texto', 'campos']).optional().catch(undefined),
  alcance: z.string().max(60).nullish().transform((v) => v ?? undefined),
  alteracoes: z.array(AlteracaoSchema).max(20).nullish().transform((v) => v ?? undefined),
  texto: z.string().nullish(),
  campos: z.object({
    titulo: z.string().nullish(), relato: z.string().nullish(), descricao: z.string().nullish(),
    cliente: ValorDeLista.optional(), produto: ValorDeLista.optional(), tipo: ValorDeLista.optional(), assunto: ValorDeLista.optional(), gravidade: ValorDeLista.optional(),
  }).passthrough().nullish().transform((v) => v ?? undefined),
  naoPropostos: z.array(z.string()).max(20).nullish().transform((v) => v ?? undefined),
  anexosLidos: z.array(z.object({ nome: z.string().max(255), tipo: z.string().max(60).catch(''), como: z.string().max(120).catch('') })).max(20).nullish().catch(undefined)
    .transform((v) => v ?? undefined),
  resumo: z.string().max(2000).nullish(),
  observacao: z.string().max(2000).nullish(),
  erro: z.string().max(2000).nullish(),
  custo: z.unknown().optional(),
  duracaoMs: z.number().optional(),
}).passthrough();

/**
 * As listas da entrega "campos" já com o id do Gestor (o servidor acha pelo nome, na hora da proposta): o cliente vira
 * o id do cadastro, cada produto o id dele, o assunto o caminho (o valor que o PATCH aceita), a gravidade a chave
 * (inoperancia, disfuncional…). O nome que não estiver nas opções do painel fica nulo: a tela mostra e não deixa aplicar.
 */
export type IdsDasListasDaNia = {
  clienteId?: string | null;
  produtos?: string[] | null;
  tipo?: string | null;
  assunto?: string | null;
  gravidade?: Gravidade | null;
};

/** O que o Gestor devolve à tela no /nia/propor: a resposta da NIA como veio e, na entrega "campos", os ids. */
export type PropostaDaNia = RespostaDaNia & { idsDasListas?: IdsDasListasDaNia };

// =====================================================================
//  OS PEDIDOS DA TELA AO GESTOR
// =====================================================================

/** O comando como a NIA escreve ("corrigir", "criar-chamado"). */
const ComandoSchema = z.string().trim().min(1, 'Escolha um comando da NIA').max(60).regex(/^[\p{L}\p{N}_.-]+$/u, 'Esse comando não existe na NIA');
/** Onde o /nia foi digitado: um campo de texto do card, a anotação ou um campo do painel ("campo:<id>"). */
export const CampoOndeANiaFoiChamadaSchema = z.string().trim().max(80).regex(/^(titulo|relato|descricao|solucao|causa|contorno|validacao|anotacao|campo:[\w-]{1,60})$/, 'Esse campo não existe no card');

export const NiaProporSchema = z.object({
  comando: ComandoSchema,
  /** o que a pessoa escreveu depois do comando ("" se nada) */
  instrucao: z.string().max(2000, 'O pedido para a NIA vai até 2.000 letras').optional().transform((v) => (v ?? '').trim()),
  campo: CampoOndeANiaFoiChamadaSchema.optional(),
  /** o rascunho da anotação, quando o /nia foi digitado nela */
  anotacao: z.string().max(20_000, 'A anotação vai até 20.000 letras').optional(),
  /**
   * os arquivos do rascunho da anotação (ainda no navegador), no formato que a anotação já manda: o nome e o conteúdo
   * em data URL ou base64; até 5, como a anotação
   */
  anexos: z.array(z.object({ fileName: z.string().trim().min(1).max(200), conteudo: z.string().min(1).max(15_000_000) }))
    .max(5, 'A anotação leva até 5 arquivos.').optional(),
});
export type NiaProporEntrada = z.input<typeof NiaProporSchema>;

/** Um campo que o Aplicar grava: os de texto do card, ou um campo de texto longo do painel ("campo:<id>", o resumir num campo dele). */
const ChaveDoAplicar = z.string().regex(/^(titulo|relato|descricao|solucao|causa|contorno|validacao|campo:[\w-]{1,60})$/, 'Esse campo não existe no card');

export const NiaAplicarSchema = z.object({
  comando: ComandoSchema,
  /** a frase que a NIA mandou (o servidor monta a do Histórico de novo, só com o que gravou) */
  resumo: z.string().max(2000).nullish(),
  /** os nomes dos anexos que a NIA leu (o `anexosLidos` da proposta): vão para o Histórico */
  anexosLidos: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
  /** só os MARCADOS: o texto novo de cada um (vazio tira) */
  campos: z.record(ChaveDoAplicar, z.string().nullable()).default({}),
  /** a entrega "campos": os ids das listas marcadas */
  listas: z.object({
    clienteId: z.string().min(1).max(60).nullable().optional(),
    produtos: z.array(z.string().min(1).max(60)).max(50).optional(),
    tipo: z.string().trim().min(1).max(40).nullable().optional(),
    /** pelo caminho (o valor que o PATCH aceita) */
    assunto: z.string().trim().min(1).max(400).nullable().optional(),
    gravidade: z.enum(GRAVIDADES).nullable().optional(),
  }).optional(),
}).superRefine((d, ctx) => {
  // o tamanho de cada campo o servidor confere com o nome dele (a mensagem clara de `problemaDoTamanho`); aqui, só o
  // limite que nenhum campo passa, para um corpo enorme não chegar até lá
  for (const [chave, texto] of Object.entries(d.campos)) {
    if (texto && texto.length > 100_000) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Esse texto é grande demais para qualquer campo do card.', path: ['campos', chave] });
  }
  const temLista = !!d.listas && Object.values(d.listas).some((v) => v !== undefined);
  if (!Object.keys(d.campos).length && !temLista) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Marque pelo menos um campo para aplicar.', path: ['campos'] });
});
export type NiaAplicarEntrada = z.input<typeof NiaAplicarSchema>;
export type NiaAplicar = z.infer<typeof NiaAplicarSchema>;

/** Os campos de texto longo do painel (o resumir num deles) vão até 20 mil letras, como na ficha. */
const LIMITE_DO_CAMPO_DO_PAINEL = 20_000;

/**
 * O texto passa do tamanho do campo? A mensagem diz qual, quanto tem e quanto cabe (o Gestor recusa em vez de
 * cortar: cortar no meio de uma frase seria pior). `nome`: o nome que a pessoa vê (o do campo do painel).
 */
export function problemaDoTamanho(chave: string, texto: string | null | undefined, nome?: string): string | null {
  if (!texto) return null;
  const max = (LIMITE_DO_CAMPO_DA_NIA as Record<string, number>)[chave] ?? (chave.startsWith('campo:') ? LIMITE_DO_CAMPO_DO_PAINEL : null);
  if (max === null || texto.length <= max) return null;
  const n = (x: number) => x.toLocaleString('pt-BR');
  const quem = nome ?? (NOME_DO_CAMPO_DA_NIA as Record<string, string>)[chave] ?? 'O campo';
  return `${quem} ficaria com ${n(texto.length)} letras, e o máximo é ${n(max)}. Nada foi gravado: encurte antes de aplicar.`;
}

// =====================================================================
//  OS CAMPOS QUE O CARD USA
// =====================================================================

/**
 * Os campos de texto do card que o painel usa, na ordem da ficha (a mesma conta da tela, `Textos.tsx`): o título
 * sempre; a negociação tem a "Sobre a negociação" (a descrição) e o relato só se chegou (o robô); o problema (ITIL),
 * os seis; o chamado, o relato, a solução e a causa quando o painel não os desligou (2.1.2).
 */
export function camposDeTextoDoCard(painel: Pick<Painel, 'tipo' | 'ajustes'>, tipoChamado: TipoChamado, temRelato: boolean): CampoDeTextoDaNia[] {
  if (painel.tipo === 'vendas') return ['titulo', ...(temRelato ? (['relato'] as const) : []), 'descricao'];
  if (tipoChamado === 'problema') return ['titulo', 'relato', 'descricao', 'causa', 'contorno', 'solucao', 'validacao'];
  return [
    'titulo',
    ...(campoLigado(painel.ajustes, 'relato') ? (['relato'] as const) : []),
    'descricao',
    ...(campoLigado(painel.ajustes, 'solucao') ? (['solucao', 'causa'] as const) : []),
  ];
}

/**
 * As folhas da árvore de assuntos do painel: o caminho que nenhum outro continua (só os ativos). "Linechat" e
 * "Linechat › Configuração" são pastas e ficam de fora; "Linechat › Configuração › Equipes" vai. Com as pastas na
 * lista, a IA escolhia a pasta na dúvida (o SUP-82 e o SUP-103 ficaram com "Linechat").
 */
export function folhasDoAssunto(assuntos: Pick<Assunto, 'id' | 'paiId' | 'nome' | 'ativo' | 'painelId'>[], painelId: string): string[] {
  const doPainel = assuntos.filter((a) => a.painelId === painelId);
  const ativos = new Map(doPainel.map((a) => [a.id, a]));
  // um assunto só vale se ele e todos os de cima estão ativos (o desativado esconde o galho inteiro)
  const vale = (id: string | null): boolean => {
    for (let a = id ? ativos.get(id) : undefined, n = 0; a && n < 20; a = a.paiId ? ativos.get(a.paiId) : undefined, n++) {
      if (!a.ativo) return false;
      if (!a.paiId) return true;
    }
    return false;
  };
  const validos = doPainel.filter((a) => vale(a.id));
  const temFilho = new Set(validos.map((a) => a.paiId).filter((x): x is string => !!x));
  return validos.filter((a) => !temFilho.has(a.id)).map((a) => caminhoDoAssunto(a.id, doPainel)).sort((x, y) => x.localeCompare(y, 'pt-BR'));
}

// =====================================================================
//  O NOME → ID (a entrega "campos")
// =====================================================================

/** As opções do painel do card, com o id de cada uma (a fonte do nome → id). */
export type OpcoesComIds = {
  clientes?: Array<{ id: string; nome: string }>;
  produtos?: Array<{ id: string; nome: string }>;
  tipos?: string[];
  /** os caminhos das folhas */
  assuntos?: string[];
};

const igual = (a: string, b: string) => paraBusca(a).trim() === paraBusca(b).trim();
const umValor = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : Array.isArray(v) && typeof v[0] === 'string' && v[0].trim() ? v[0].trim() : null);
const variosValores = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\s*[,;]\s*/) : []).filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim());

/**
 * O nome que a NIA mandou → o id do Gestor (só o que existe nas opções que foram para ela: a NIA só devolve valor da
 * lista, mas o Gestor confere de novo). O que não veio fica de fora; o que veio em branco (a NIA não achou evidência)
 * fica nulo; o que veio e não existe também fica nulo — e a tela diz qual.
 */
export function idsDasListasDaNia(campos: RespostaDaNia['campos'] | undefined, o: OpcoesComIds): IdsDasListasDaNia {
  const r: IdsDasListasDaNia = {};
  if (!campos) return r;
  if ('cliente' in campos && o.clientes) {
    const nome = umValor(campos.cliente);
    r.clienteId = nome ? o.clientes.find((c) => igual(c.nome, nome))?.id ?? null : null;
  }
  if ('produto' in campos && o.produtos) {
    const nomes = variosValores(campos.produto);
    const ids = nomes.map((n) => o.produtos!.find((p) => igual(p.nome, n))?.id ?? null);
    r.produtos = nomes.length && ids.every((x): x is string => !!x) ? [...new Set(ids)] : null;
  }
  if ('tipo' in campos && o.tipos) {
    const nome = umValor(campos.tipo);
    r.tipo = nome ? o.tipos.find((t) => igual(t, nome)) ?? null : null;
  }
  if ('assunto' in campos && o.assuntos) {
    const nome = umValor(campos.assunto);
    // o caminho escrito com outro separador (">", "/") também vale
    const normal = (s: string) => paraBusca(s).replace(/\s*(›|>|\/)\s*/g, ' › ').trim();
    r.assunto = nome ? o.assuntos.find((c) => normal(c) === normal(nome)) ?? null : null;
  }
  if ('gravidade' in campos) {
    const nome = umValor(campos.gravidade);
    r.gravidade = nome ? GRAVIDADES.find((g) => igual(NOME_GRAVIDADE[g], nome) || igual(g, nome)) ?? null : null;
  }
  return r;
}

/** As gravidades pelo nome, como a pessoa lê (a lista que vai para a NIA). */
export const NOMES_DAS_GRAVIDADES = GRAVIDADES.map((g) => NOME_GRAVIDADE[g]);

// =====================================================================
//  A FRASE DO HISTÓRICO
// =====================================================================

/**
 * A frase do Histórico, montada de novo só com o que foi gravado (a pessoa pode ter desmarcado campos):
 * "NIA (Corrigir o português): mudou Relato do cliente e Causa". A entrega "campos" preenche; o resto muda.
 */
export function resumoDoQueAplicou(nomeDoComando: string, gravados: string[], entrega: 'texto' | 'campos', anexos: string[] = []): string {
  const verbo = entrega === 'campos' ? 'preencheu' : 'mudou';
  // os anexos que a NIA leu: "(com base em: print do erro.png, contrato.pdf)"
  const base = anexos.length ? ` (com base em: ${anexos.join(', ')})` : '';
  return `NIA (${nomeDoComando}): ${gravados.length ? `${verbo} ${emLista(gravados)}` : 'nada mudou'}${base}`;
}

// =====================================================================
//  OS ANEXOS (o Gestor junta e manda; quem lê é a NIA)
// =====================================================================

/** Os limites da NIA para uma leitura (os do "Novo chamado" dela): até 10 arquivos e 14 MB somando todos. */
export const LIMITES_DOS_ANEXOS_DA_NIA = { arquivos: 10, bytes: 14 * 1024 * 1024 } as const;

/** O conteúdo em base64, sem o prefixo "data:…;base64," (o jeito que a NIA recebe). */
export function base64DoConteudo(conteudo: string): string {
  const virgula = conteudo.startsWith('data:') ? conteudo.indexOf(',') : -1;
  return (virgula >= 0 ? conteudo.slice(virgula + 1) : conteudo).replace(/\s+/g, '');
}

/** Quantos bytes o base64 tem (sem decodificar). */
export function bytesDoBase64(b64: string): number {
  const limpo = base64DoConteudo(b64);
  const sobra = limpo.endsWith('==') ? 2 : limpo.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((limpo.length * 3) / 4) - sobra);
}

const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

/**
 * Os anexos passam do que a NIA lê de uma vez? A mensagem diz o que fazer (o Gestor confere antes de chamar a NIA,
 * para a pessoa saber na hora; a NIA confere de novo).
 */
export function problemaDosAnexosDaNia(anexos: Array<{ bytes: number }>): string | null {
  const { arquivos, bytes } = LIMITES_DOS_ANEXOS_DA_NIA;
  if (anexos.length > arquivos) return `A NIA lê até ${arquivos} arquivos de uma vez, e aqui há ${anexos.length}. Tire alguns e chame a NIA de novo.`;
  const soma = anexos.reduce((s, a) => s + a.bytes, 0);
  if (soma > bytes) return `Os anexos somam ${mb(soma)}, e a NIA lê até ${mb(bytes)} de uma vez. Tire algum e chame a NIA de novo.`;
  return null;
}

/** "print do erro.png (imagem), relato.docx (texto extraído)": o que a NIA leu, como a janela da proposta mostra. */
export function textoDosAnexosLidos(lidos: AnexoLidoDaNia[]): string {
  return lidos.map((a) => `${a.nome} (${a.como && a.como !== 'lido inteiro' ? a.como : a.tipo || a.como || 'lido'})`).join(', ');
}

// =====================================================================
//  O "/NIA" SENDO DIGITADO
// =====================================================================

/** O "/nia" que a pessoa está escrevendo no campo, e o que o menu mostra. */
export type ComandoDigitando = {
  /** onde o "/nia" começa e onde a linha dele acaba (o pedido vai até o fim da linha) */
  inicio: number;
  fim: number;
  /** a primeira palavra depois do "/nia" (o filtro do menu: "/nia cor") */
  palavra: string;
  /** já passou da primeira palavra (escreveu o espaço depois dela): agora é o pedido */
  passouDaPalavra: boolean;
  /** o comando escolhido (a palavra é um comando do catálogo, pelo `comando` ou pelo começo do `nome`) */
  acao: AcaoDaNia | null;
  /** o que vem depois do comando: vai em "instrucao" */
  instrucao: string;
  /** os comandos que o menu mostra (todos, com o filtro da palavra) */
  sugestoes: AcaoDaNia[];
};

/**
 * Acha o "/nia" na linha do cursor (no começo do campo ou depois de um espaço: "http://x/nia" não conta). O menu lista
 * os comandos que começam pela palavra (pelo comando ou por alguma palavra do nome, sem acento: "/nia cor" deixa só
 * "Corrigir o português"); sem palavra, todos. Fora de um "/nia", devolve nulo.
 */
export function lerComandoDaNia(texto: string, cursor: number, acoes: AcaoDaNia[]): ComandoDigitando | null {
  const c = Math.max(0, Math.min(cursor, texto.length));
  const comecoDaLinha = texto.lastIndexOf('\n', c - 1) + 1;
  const fimDaLinha = (() => { const i = texto.indexOf('\n', c); return i < 0 ? texto.length : i; })();
  const linha = texto.slice(comecoDaLinha, fimDaLinha);
  const ate = c - comecoDaLinha;
  // o último "/nia" da linha antes do cursor, com espaço (ou nada) antes e espaço (ou nada) depois
  const re = /(^|\s)\/nia(?=\s|$)/gi;
  let achado: number | null = null;
  for (let m = re.exec(linha); m; m = re.exec(linha)) {
    const pos = m.index + m[1]!.length;
    if (pos + 4 <= ate) achado = pos;
  }
  if (achado === null) return null;
  const depois = linha.slice(achado + 4);
  const semEspaco = depois.replace(/^\s+/, '');
  const palavra = (semEspaco.match(/^\S*/) ?? [''])[0];
  const passouDaPalavra = palavra.length > 0 && semEspaco.length > palavra.length;
  const b = paraBusca(palavra);
  const casa = (a: AcaoDaNia) => !b || paraBusca(a.comando).startsWith(b) || paraBusca(a.nome).split(/\s+/).some((p) => p.startsWith(b));
  const acao = palavra ? acoes.find((a) => paraBusca(a.comando) === b) ?? null : null;
  return {
    inicio: comecoDaLinha + achado,
    fim: fimDaLinha,
    palavra,
    passouDaPalavra,
    acao,
    instrucao: acao ? semEspaco.slice(palavra.length).trim() : '',
    sugestoes: acoes.filter(casa),
  };
}

/**
 * O campo sem a linha do "/nia" (o comando e o pedido não ficam no texto). Se o "/nia" estava sozinho numa linha, a
 * linha some junto.
 */
export function textoSemOComando(texto: string, d: Pick<ComandoDigitando, 'inicio' | 'fim'>): string {
  let antes = texto.slice(0, d.inicio).replace(/[ \t]+$/, '');
  const depois = texto.slice(d.fim);
  if (antes.endsWith('\n') && (depois.startsWith('\n') || depois === '')) antes = antes.slice(0, -1);
  return antes + depois;
}

/** O texto com o comando escolhido no menu: "/nia cor" vira "/nia corrigir " (o cursor vai para depois do espaço). */
export function comComandoEscolhido(texto: string, d: Pick<ComandoDigitando, 'inicio' | 'fim'>, a: Pick<AcaoDaNia, 'comando'>): { texto: string; cursor: number } {
  const linha = texto.slice(d.inicio, d.fim);
  // o que já estava escrito depois da palavra (o pedido) fica
  const resto = linha.slice(4).replace(/^\s*\S*/, '').replace(/^\s+/, '');
  const novo = `/nia ${a.comando} `;
  return { texto: texto.slice(0, d.inicio) + novo + resto + texto.slice(d.fim), cursor: d.inicio + novo.length };
}

// =====================================================================
//  O DESTAQUE DO QUE MUDOU
// =====================================================================

export type PedacoDaDiferenca = { texto: string; tipo: 'igual' | 'saiu' | 'entrou' };

/**
 * O antes e o depois palavra por palavra (a maior sequência em comum), para a janela destacar o que mudou. Texto
 * grande demais para comparar (mais de uns 1.500 palavras de um lado) volta sem destaque: a janela mostra só o texto.
 */
export function diferencaPorPalavras(antes: string, depois: string): { antes: PedacoDaDiferenca[]; depois: PedacoDaDiferenca[] } | null {
  const a = antes.match(/\s+|[^\s]+/g) ?? [];
  const b = depois.match(/\s+|[^\s]+/g) ?? [];
  if (a.length > 3000 || b.length > 3000) return null;
  const n = a.length;
  const m = b.length;
  // a tabela da maior sequência em comum, de trás para a frente (uma linha por vez: cabe em memória)
  const tabela: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) tabela[i]![j] = a[i] === b[j] ? tabela[i + 1]![j + 1]! + 1 : Math.max(tabela[i + 1]![j]!, tabela[i]![j + 1]!);
  }
  const ra: PedacoDaDiferenca[] = [];
  const rb: PedacoDaDiferenca[] = [];
  const por = (lista: PedacoDaDiferenca[], texto: string, tipo: PedacoDaDiferenca['tipo']) => {
    const ultimo = lista[lista.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.texto += texto;
    else lista.push({ texto, tipo });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { por(ra, a[i]!, 'igual'); por(rb, b[j]!, 'igual'); i++; j++; }
    else if (tabela[i + 1]![j]! >= tabela[i]![j + 1]!) { por(ra, a[i]!, 'saiu'); i++; }
    else { por(rb, b[j]!, 'entrou'); j++; }
  }
  for (; i < n; i++) por(ra, a[i]!, 'saiu');
  for (; j < m; j++) por(rb, b[j]!, 'entrou');
  return { antes: ra, depois: rb };
}

// =====================================================================
//  ONDE A CHAVE MORA (Painéis › Ajustes › Integrações › NIA (/nia))
// =====================================================================

/**
 * O endereço da NIA: https, sem usuário e senha no endereço, sem "?" nem "#" (o Gestor põe o /api/nia/… depois). A
 * barra do fim sai. Hoje é o IP com a porta (https://2.24.93.36:8443); vira domínio depois.
 */
export function enderecoDaNia(v: string): { ok: true; endereco: string; servidor: string } | { ok: false; erro: string } {
  const t = v.trim().replace(/\/+$/, '');
  let u: URL;
  try { u = new URL(t); } catch { return { ok: false, erro: 'Escreva o endereço inteiro, começando com https://' }; }
  if (u.protocol !== 'https:') return { ok: false, erro: 'O endereço da NIA precisa começar com https:// (a chave não pode ir sem o cadeado).' };
  if (u.username || u.password) return { ok: false, erro: 'O endereço não leva usuário nem senha: a chave vai no campo de baixo.' };
  if (u.search || u.hash) return { ok: false, erro: 'O endereço não leva "?" nem "#": só o servidor (e o caminho, se houver).' };
  return { ok: true, endereco: `${u.origin}${u.pathname.replace(/\/+$/, '')}`, servidor: u.host.toLowerCase() };
}

export const AjustesDaNiaAcoesSchema = z.object({
  endereco: z.string().trim().max(300).superRefine((v, ctx) => {
    if (!v) return;
    const r = enderecoDaNia(v);
    if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.erro });
  }),
  /** a chave de serviço: só quando é para trocar (a guardada nunca volta para a tela) */
  chave: z.string().trim().max(500, 'A chave vai até 500 letras').optional().transform((v) => v || undefined)
    .refine((v) => !v || v.length >= 8, 'A chave parece curta demais: confira se colou inteira.')
    .refine((v) => !v || !/\s/.test(v), 'A chave não tem espaço: confira se colou só ela.'),
});
export type AjustesDaNiaAcoesEntrada = z.input<typeof AjustesDaNiaAcoesSchema>;

/** O que a tela de Integrações vê (a chave, nunca: só se já existe uma guardada). */
export type NiaAcoesTela = {
  endereco: string;
  temChave: boolean;
  configuradoEm: string | null;
  configuradoPor: string | null;
  ultimoTeste: { em: string; ok: boolean; mensagem: string; quantos: number | null } | null;
};

/** O resultado do botão Testar: quantos comandos vieram (ou o porquê de não virem). */
export type TesteDaNia = { ok: boolean; mensagem: string; quantos: number | null; acoes: AcaoDaNia[] };
