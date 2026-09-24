/**
 * Chamados de suporte: as contas da tela de Chamados.
 *
 * Os chamados vivem no LineChat; o Gestor guarda uma cópia (tabelas `linechat_*`). Estas funções
 * recebem os chamados já lidos e devolvem os números da tela — filtrar, contar por etapa, por
 * cliente, por dia, ordenar a tabela.
 *
 * Por que aqui, e não em SQL no servidor: a prévia clicável (demo) precisa dar exatamente os
 * mesmos números que o sistema de verdade. Com a conta escrita uma vez só, servidor e prévia usam
 * a mesma função e não têm como divergir. O volume permite: são poucos milhares de chamados.
 *
 * Tudo que é "dia" ou "hora" é no horário de Brasília — é o dia que a equipe vive. Um chamado
 * aberto às 22h de segunda é de segunda, mesmo que em UTC já seja terça.
 *
 * **Clicar filtra, e o gráfico clicado continua inteiro.** Qualquer pedaço da tela filtra ao ser
 * clicado (uma barra, uma fatia, uma coluna do tempo, um número de cima). O resto da tela passa a
 * mostrar só aquilo — mas o gráfico onde se clicou continua mostrando todos os seus valores, com o
 * escolhido em destaque, para dar para clicar de novo e desfazer (ou escolher outro). Na conta,
 * isso é: cada gráfico é contado com todos os filtros **menos o dele mesmo** (`recortar(..., sem)`).
 *
 * **Fechado é o que a equipe diz que é** (Patch 1.4). O LineChat marca duas etapas como finais
 * (Tratado e Validado); a administração pode escolher outras em Organizar. A escolha chega aqui já
 * aplicada nas etapas (`etapasDaEquipe`) e na hora do fechamento de cada card (`comFechamento`),
 * então as contas abaixo só perguntam `estaFechado`.
 */
import { z } from 'zod';
import { Booleano, SEM_LIMITE } from './schemas.js';

// ---------- o que entra ----------

/** Um chamado, do jeito que a conta precisa (datas em ISO). */
export type Chamado = {
  id: string;
  key: string | null;
  number: number | null;
  title: string;
  description: string | null;
  stepId: string | null;
  stepTitle: string | null;
  /** INITIAL · INTERMEDIATE · FINAL */
  stepPhase: string | null;
  /** OPEN · ARCHIVED */
  status: string;
  responsavel: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedEstimated: boolean;
  dueDate: string | null;
  isOverdue: boolean;
  tagIds: string[];
  /** chave do campo → valor (texto, lista de textos ou nada) */
  campos: Record<string, unknown>;
};

export type EtapaChamado = { id: string; title: string; position: number; isInitial: boolean; isFinal: boolean; archived: boolean };
export type CampoChamado = { key: string; name: string; type: string; position: number; options: string[]; archived: boolean };
export type EtiquetaChamado = { id: string; name: string; color: string | null; archived: boolean };

export type ContextoChamados = {
  etapas: EtapaChamado[];
  campos: CampoChamado[];
  etiquetas: EtiquetaChamado[];
  /** "agora" vem de fora para os testes e a prévia poderem fixar a data */
  agora: Date;
};

/** Valor que representa "não preenchido" nos filtros (campo vazio, sem responsável, sem etiqueta). */
export const VAZIO = '__vazio__';

/** Campos que viram filtro e gráfico: os de lista (escolha única ou múltipla). */
export const TIPOS_DE_LISTA = ['SINGLESELECT', 'MULTISELECT'];
export const camposDeLista = (campos: CampoChamado[]) =>
  campos.filter((c) => !c.archived && TIPOS_DE_LISTA.includes(c.type)).sort((a, b) => a.position - b.position);

// ---------- os filtros (vêm do endereço da tela) ----------

/**
 * As abas. A "Em aberto" do 1.3 saiu no 1.4 (pedido do Luan): virou o interruptor **só em aberto**
 * (`emAberto`), que vale em Hoje e em Período — e o Período ganhou o atalho "Tudo", que com o
 * interruptor ligado é exatamente o que a aba mostrava.
 */
export const ABAS_CHAMADOS = ['hoje', 'periodo'] as const;
export type AbaChamados = (typeof ABAS_CHAMADOS)[number];

/**
 * Os números de cima que filtram ao serem clicados. `fechados` é diferente dos outros: ele troca a
 * pergunta — em vez de "o que chegou", passa a ser "o que foi fechado" (é o que o número "Fechados
 * hoje" conta, e clicar nele tem de mostrar os mesmos chamados).
 */
export const SITUACOES = ['vencidos', 'parados', 'sem-responsavel', 'fechados'] as const;
export type SituacaoChamado = (typeof SITUACOES)[number];

const Dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD');
/** No endereço, um filtro pode vir uma vez (texto) ou repetido (lista): aqui sempre vira lista. */
const Lista = z.preprocess(
  (v) => (v === undefined || v === '' ? undefined : Array.isArray(v) ? v : [v]),
  z.array(z.string().max(300)).max(300).optional(),
);

export const FiltrosChamadosSchema = z.object({
  /** Aba que não existe mais (um endereço antigo com "abertos") cai na de hoje, sem erro. */
  aba: z.preprocess((v) => ((ABAS_CHAMADOS as readonly unknown[]).includes(v) ? v : undefined), z.enum(ABAS_CHAMADOS).default('hoje')),
  /** Só na aba Período: o primeiro e o último dia (horário de Brasília), inclusive */
  de: Dia.optional(),
  ate: Dia.optional(),
  /** ids de etapa */
  etapa: Lista,
  /** nomes de responsável; `__vazio__` = sem responsável */
  responsavel: Lista,
  /** ids de etiqueta; `__vazio__` = sem etiqueta */
  etiqueta: Lista,
  /** "chave=valor" de um campo personalizado ("cliente-71=Labchecap"); valor `__vazio__` = não preenchido */
  campo: Lista,
  /**
   * Colunas do gráfico do tempo, clicadas: a hora na aba Hoje ("10"), o dia ou o mês no Período
   * ("2026-09-10", "2026-08"). O que não servir para a aba é ignorado.
   */
  quando: Lista,
  /** Um dos números de cima, clicado. Valor desconhecido é ignorado (o endereço pode ser antigo). */
  situacao: z.preprocess((v) => ((SITUACOES as readonly unknown[]).includes(v) ? v : undefined), z.enum(SITUACOES).optional()),
  /** procura no código (IS-3607), no título e na descrição */
  busca: z.string().trim().max(120).optional(),
  /** incluir os cards arquivados no LineChat */
  arquivados: Booleano.default(false),
  /** só os que ainda estão em aberto (fora das etapas que fecham o chamado) */
  emAberto: Booleano.default(false),
});
export type FiltrosChamados = z.infer<typeof FiltrosChamadosSchema>;

export const ListaChamadosSchema = FiltrosChamadosSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(SEM_LIMITE).default(50),
  sort: z.string().trim().max(80).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});
export type ListaChamadosQuery = z.infer<typeof ListaChamadosSchema>;

// ---------- datas no horário de Brasília ----------

const FUSO = 'America/Sao_Paulo';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' });

/** O dia (AAAA-MM-DD) em Brasília. */
export function diaEmBrasilia(d: Date | string): string {
  return fmtDia.format(typeof d === 'string' ? new Date(d) : d);
}
/** A hora cheia (0–23) em Brasília. */
export function horaEmBrasilia(d: Date | string): number {
  return Number(fmtHora.format(typeof d === 'string' ? new Date(d) : d)) % 24;
}
/** Soma dias a um AAAA-MM-DD sem passar por fuso (meio-dia UTC nunca vira outro dia). */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Quantos dias de `a` até `b` (AAAA-MM-DD). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const mesCurto = (mes: string) => `${NOMES_MES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

/** O período padrão da aba Período: os últimos 30 dias, até hoje. */
export function periodoPadrao(agora: Date): { de: string; ate: string } {
  const ate = diaEmBrasilia(agora);
  return { de: somarDias(ate, -29), ate };
}

// ---------- regras de cada chamado ----------

/**
 * Fechado = está numa etapa que fecha o chamado (as da equipe, ou as finais do LineChat).
 * Arquivado sem etapa conta pelo que estava antes (closedAt).
 */
export function estaFechado(c: Chamado, ctx: Pick<ContextoChamados, 'etapas'>): boolean {
  if (c.stepId) {
    const e = ctx.etapas.find((x) => x.id === c.stepId);
    if (e) return e.isFinal;
  }
  if (c.stepPhase) return c.stepPhase === 'FINAL';
  return !!c.closedAt;
}

/**
 * As etapas com o "fecha o chamado" que vale na tela. Sem escolha da equipe, valem as finais do
 * LineChat (Tratado e Validado). Com escolha, valem as marcadas — e uma lista que não aponta para
 * nenhuma etapa que existe (todas apagadas lá) é ignorada, para a tela nunca ficar sem fechados.
 */
export function etapasDaEquipe(etapas: EtapaChamado[], fechadas: string[] | null | undefined): EtapaChamado[] {
  if (!fechadas?.length) return etapas;
  const s = new Set(fechadas);
  if (!etapas.some((e) => !e.archived && s.has(e.id))) return etapas;
  return etapas.map((e) => ({ ...e, isFinal: s.has(e.id) }));
}

/** Uma mudança de etapa guardada pela sincronização (`linechat_card_moves`). */
export type MovimentoChamado = { fromStepId: string | null; toStepId: string | null; at: string; estimated: boolean };

/**
 * A hora em que cada chamado fechou, pelas etapas que fecham agora: o começo da última sequência
 * dele em etapas fechadas (Tratado → Validado continua fechado desde o Tratado; voltar para o N2
 * recomeça). Por isso, trocar as etapas em Organizar não exige reler nada: a conta é refeita a
 * partir do histórico que a sincronização já guarda.
 *
 * Dois cuidados:
 *  - card que nasceu e fechou entre duas leituras aparece pela primeira vez já fechado; a primeira
 *    linha do histórico dele tem a hora da abertura, não a do fechamento — ali vale o que a
 *    sincronização gravou (`closedAt`, a hora da última alteração);
 *  - sem histórico (a prévia), fica o `closedAt` que veio; fechado por uma etapa que o LineChat
 *    não chama de final, a última alteração do card é a melhor estimativa.
 */
export function comFechamento(cards: Chamado[], etapas: EtapaChamado[], historico?: Map<string, MovimentoChamado[]>): Chamado[] {
  const fecha = new Set(etapas.filter((e) => e.isFinal).map((e) => e.id));
  const ctx = { etapas };
  return cards.map((c) => {
    if (!estaFechado(c, ctx)) return c;
    let inicio: MovimentoChamado | null = null;
    for (const m of historico?.get(c.id) ?? []) {
      if (m.toStepId && fecha.has(m.toStepId)) { if (!inicio) inicio = m; } else inicio = null;
    }
    const nasceuFechado = !!inicio && inicio.fromStepId === null && !inicio.estimated && !!c.closedAt;
    if (inicio && !nasceuFechado) {
      if (inicio.at === c.closedAt && inicio.estimated === c.closedEstimated) return c;
      return { ...c, closedAt: inicio.at, closedEstimated: inicio.estimated };
    }
    if (c.closedAt) return c;
    return { ...c, closedAt: c.updatedAt, closedEstimated: true };
  });
}

/**
 * O texto da descrição do card, sem as marcas do editor do LineChat (que pode mandar HTML):
 * parágrafo e quebra viram linha, item de lista vira "•", o resto das marcas some. `limite` corta
 * com reticências — a tabela mostra o começo; o card inteiro abre no LineChat.
 */
export function textoDoCard(html: string | null | undefined, limite = Infinity): string {
  if (!html) return '';
  let t = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    // só marca de verdade (começa com letra): "valor < 10 e > 5" continua inteiro
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => { const cp = Number(n); return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : ''; })
    .replace(/&amp;/g, '&')
    .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim();
  if (t.length > limite) t = `${t.slice(0, limite).trimEnd()}…`;
  return t;
}

/** Os valores de um campo no card, sempre como lista de textos (vazio = não preenchido). */
export function valoresDoCampo(c: Chamado, chave: string): string[] {
  const v = c.campos[chave];
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const t = String(v).trim();
  return t ? [t] : [];
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- filtrar ----------

/** Os filtros de valor (etapa, responsável, etiqueta, campos), a busca e os arquivados. */
export function aplicarFiltros(cards: Chamado[], f: FiltrosChamados): Chamado[] {
  const porCampo = new Map<string, string[]>();
  for (const par of f.campo ?? []) {
    const i = par.indexOf('=');
    if (i <= 0) continue;
    const k = par.slice(0, i); const v = par.slice(i + 1);
    porCampo.set(k, [...(porCampo.get(k) ?? []), v]);
  }
  const busca = f.busca ? semAcento(f.busca) : '';
  return cards.filter((c) => {
    if (!f.arquivados && c.status === 'ARCHIVED') return false;
    if (f.etapa?.length && !f.etapa.includes(c.stepId ?? VAZIO)) return false;
    if (f.responsavel?.length && !f.responsavel.includes(c.responsavel ?? VAZIO)) return false;
    if (f.etiqueta?.length) {
      const tags = c.tagIds.length ? c.tagIds : [VAZIO];
      if (!tags.some((t) => f.etiqueta!.includes(t))) return false;
    }
    // entre campos diferentes vale "E"; dentro do mesmo campo, "OU"
    for (const [k, quer] of porCampo) {
      const tem = valoresDoCampo(c, k);
      const lista = tem.length ? tem : [VAZIO];
      if (!lista.some((v) => quer.includes(v))) return false;
    }
    if (busca) {
      // a descrição sem as marcas do editor: procurar "p" não pode achar todo card que tem <p>
      const alvo = semAcento(`${c.key ?? ''} ${c.title} ${textoDoCard(c.description)}`);
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

/**
 * "Fechados": a tela passa a olhar a data em que o chamado foi fechado, e não a data em que
 * chegou (o recorte, o gráfico do tempo e as colunas clicadas).
 */
export const porFechamento = (f: Pick<FiltrosChamados, 'situacao'>) => f.situacao === 'fechados';

/** O momento que conta para a aba: quando chegou — ou quando foi fechado (nada, se não foi). */
function momento(c: Chamado, f: FiltrosChamados, ctx: ContextoChamados): string | null {
  if (porFechamento(f)) return c.closedAt && estaFechado(c, ctx) ? c.closedAt : null;
  return c.createdAt;
}

/** As colunas do tempo escolhidas que fazem sentido na aba (o resto é ignorado). */
export function quandoValidos(f: Pick<FiltrosChamados, 'aba' | 'quando'>): string[] {
  const v = f.quando ?? [];
  if (f.aba === 'hoje') return [...new Set(v.filter((x) => /^\d{1,2}$/.test(x) && Number(x) < 24).map((x) => String(Number(x))))];
  return [...new Set(v.filter((x) => /^\d{4}-\d{2}(-\d{2})?$/.test(x)))];
}

function filtroQuando(f: FiltrosChamados, ctx: ContextoChamados): ((c: Chamado) => boolean) | null {
  const vals = quandoValidos(f);
  if (!vals.length) return null;
  const hoje = diaEmBrasilia(ctx.agora);
  if (f.aba === 'hoje') {
    const horas = new Set(vals.map(Number));
    return (c) => { const m = momento(c, f, ctx); return !!m && diaEmBrasilia(m) === hoje && horas.has(horaEmBrasilia(m)); };
  }
  const escolhidos = new Set(vals);
  return (c) => { const m = momento(c, f, ctx); if (!m) return false; const d = diaEmBrasilia(m); return escolhidos.has(d) || escolhidos.has(d.slice(0, 7)); };
}

function filtroSituacao(f: FiltrosChamados, ctx: ContextoChamados): ((c: Chamado) => boolean) | null {
  const limite = ctx.agora.getTime() - 7 * 86_400_000;
  switch (f.situacao) {
    case 'vencidos': return (c) => c.isOverdue && !estaFechado(c, ctx);
    case 'parados': return (c) => !estaFechado(c, ctx) && Date.parse(c.updatedAt) < limite;
    case 'sem-responsavel': return (c) => !c.responsavel;
    case 'fechados': return (c) => estaFechado(c, ctx);
    default: return null;
  }
}

/** O recorte de cada aba, em cima do que já passou pelos filtros. */
export function recortarAba(base: Chamado[], f: FiltrosChamados, ctx: ContextoChamados): Chamado[] {
  const hoje = diaEmBrasilia(ctx.agora);
  if (f.aba === 'hoje') return base.filter((c) => { const m = momento(c, f, ctx); return !!m && diaEmBrasilia(m) === hoje; });
  const { de, ate } = periodoDe(f, ctx.agora);
  return base.filter((c) => { const m = momento(c, f, ctx); if (!m) return false; const d = diaEmBrasilia(m); return d >= de && d <= ate; });
}

export function periodoDe(f: Pick<FiltrosChamados, 'de' | 'ate'>, agora: Date): { de: string; ate: string } {
  const padrao = periodoPadrao(agora);
  let de = f.de ?? padrao.de; let ate = f.ate ?? padrao.ate;
  if (de > ate) [de, ate] = [ate, de];
  return { de, ate };
}

/** A dimensão de um gráfico de lista. */
export type Dimensao = 'etapa' | 'responsavel' | 'etiqueta' | `campo:${string}`;

function semDimensao(f: FiltrosChamados, d: Dimensao): FiltrosChamados {
  if (d === 'etapa') return { ...f, etapa: undefined };
  if (d === 'responsavel') return { ...f, responsavel: undefined };
  if (d === 'etiqueta') return { ...f, etiqueta: undefined };
  const k = `${d.slice(6)}=`;
  return { ...f, campo: f.campo?.filter((x) => !x.startsWith(k)) };
}

/** Os valores escolhidos numa dimensão (o que fica em destaque no gráfico dela). */
export function escolhidosEm(f: FiltrosChamados, d: Dimensao): Set<string> {
  if (d === 'etapa') return new Set(f.etapa ?? []);
  if (d === 'responsavel') return new Set(f.responsavel ?? []);
  if (d === 'etiqueta') return new Set(f.etiqueta ?? []);
  const k = `${d.slice(6)}=`;
  return new Set((f.campo ?? []).filter((x) => x.startsWith(k)).map((x) => x.slice(k.length)));
}

/**
 * O recorte da tela: filtros, "só em aberto", aba, situação e colunas do tempo clicadas. `sem`
 * deixa um deles de fora — é assim que cada gráfico continua mostrando todos os seus valores
 * enquanto o resto da tela obedece ao que foi clicado nele. `base` é o mesmo sem a aba (para os
 * números "de qualquer dia", como "Em aberto agora").
 */
export function recortar(
  cards: Chamado[], f: FiltrosChamados, ctx: ContextoChamados,
  sem: { dimensao?: Dimensao; quando?: boolean; situacao?: boolean } = {},
): { base: Chamado[]; recorte: Chamado[] } {
  const q = sem.quando ? null : filtroQuando(f, ctx);
  const base = aplicarFiltros(cards, sem.dimensao ? semDimensao(f, sem.dimensao) : f)
    .filter((c) => (!q || q(c)) && (!f.emAberto || !estaFechado(c, ctx)));
  const s = sem.situacao ? null : filtroSituacao(f, ctx);
  const recorte = recortarAba(base, sem.situacao ? { ...f, situacao: undefined } : f, ctx).filter((c) => !s || s(c));
  return { base, recorte };
}

// ---------- os nomes do que foi clicado (para os filtros escritos na tela) ----------

export function rotuloSituacao(s: SituacaoChamado, aba: AbaChamados): string {
  switch (s) {
    case 'vencidos': return 'vencidos';
    case 'parados': return 'parados há 7 dias ou mais';
    case 'sem-responsavel': return 'sem responsável';
    case 'fechados': return aba === 'hoje' ? 'fechados hoje' : 'fechados no período';
  }
}

/** "Hora: 10h", "Dia: 10/09", "Fechado em: ago/26". */
export function rotuloQuando(v: string, f: Pick<FiltrosChamados, 'aba' | 'situacao'>): { nome: string; valor: string } {
  const fech = porFechamento(f);
  if (f.aba === 'hoje') return { nome: fech ? 'Fechado às' : 'Hora', valor: `${v.padStart(2, '0')}h` };
  if (v.length === 7) return { nome: fech ? 'Fechado em' : 'Mês', valor: mesCurto(v) };
  return { nome: fech ? 'Fechado em' : 'Dia', valor: diaCurto(v) };
}

// ---------- contar ----------

/**
 * Um valor de um gráfico de lista. `selecionado`: está no filtro (fica em destaque; clicar tira).
 * `grupo`: é um grupo montado pela equipe (vários valores somados num ponto só) — `valores` são
 * os que ele junta, e `membros`, os que apareceram agora, com quanto cada um contou.
 */
export type ItemRanking = {
  valor: string; rotulo: string; n: number; cor?: string | null; selecionado?: boolean;
  grupo?: { id: string; valores: string[]; membros: Array<{ valor: string; rotulo: string; n: number }> };
};
export type Kpi = {
  id: string; label: string; valor: string; sub?: string; tom: 'neutral' | 'accent' | 'signal' | 'ok' | 'bad';
  /**
   * O que clicar faz: filtra por esta situação. Com `aba`, leva para aquela aba; com `tudo`, o
   * período vira o inteiro (desde o primeiro chamado); com `emAberto`, liga o "só em aberto".
   */
  filtro?: { situacao?: SituacaoChamado; aba?: AbaChamados; tudo?: boolean; emAberto?: boolean };
  /** O número "de tudo" da aba: clicar nele tira a situação escolhida */
  total?: boolean;
  /** A situação dele é a que está filtrando a tela agora */
  ativo?: boolean;
};
export type PontoSerie = { id: string; rotulo: string; n: number; destaque?: boolean; selecionado?: boolean };

export type ResumoChamados = {
  aba: AbaChamados;
  /** O período efetivamente usado na aba Período (com o padrão aplicado) */
  de: string;
  ate: string;
  hoje: string;
  /** O dia do chamado mais antigo guardado: é o começo do atalho "Tudo" do Período */
  primeiroDia: string;
  /** Quantos chamados há no recorte (com tudo o que foi clicado) — é a conta da tabela */
  total: number;
  kpis: Kpi[];
  serie: { titulo: string; sub: string; pontos: PontoSerie[] };
  porEtapa: ItemRanking[];
  porResponsavel: ItemRanking[];
  porEtiqueta: ItemRanking[];
  porCampo: Array<{ key: string; name: string; multiplo: boolean; itens: ItemRanking[] }>;
};

const nf = (n: number) => n.toLocaleString('pt-BR');

function contarPor(cards: Chamado[], chaves: (c: Chamado) => string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) {
    const ks = chaves(c);
    for (const k of ks.length ? ks : [VAZIO]) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Maior primeiro; o "não preenchido" sempre no fim. */
const compararItens = (a: ItemRanking, b: ItemRanking) =>
  (a.valor === VAZIO ? 1 : b.valor === VAZIO ? -1 : b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

function emOrdem(m: Map<string, number>, rotulo: (k: string) => string, cor?: (k: string) => string | null): ItemRanking[] {
  return [...m.entries()]
    .map(([valor, n]) => ({ valor, rotulo: rotulo(valor), n, cor: cor?.(valor) ?? null }))
    .sort(compararItens);
}

/**
 * Um gráfico de lista. O escolhido que não aparece mais (zero com os outros filtros) entra com 0,
 * para continuar à vista — e dar para clicar nele e desfazer.
 */
function ranking(recorte: Chamado[], chaves: (c: Chamado) => string[], escolhidos: Set<string>, rotulo: (k: string) => string, cor?: (k: string) => string | null): ItemRanking[] {
  const m = contarPor(recorte, chaves);
  for (const v of escolhidos) if (!m.has(v)) m.set(v, 0);
  return emOrdem(m, rotulo, cor).map((x) => (escolhidos.has(x.valor) ? { ...x, selecionado: true } : x));
}

function serieDaAba(recorte: Chamado[], f: FiltrosChamados, ctx: ContextoChamados, de: string, ate: string): ResumoChamados['serie'] {
  const hoje = diaEmBrasilia(ctx.agora);
  const escolhidas = new Set(quandoValidos(f));
  const marcar = (pontos: PontoSerie[]) => (escolhidas.size ? pontos.map((p) => (escolhidas.has(p.id) ? { ...p, selecionado: true } : p)) : pontos);
  const fech = porFechamento(f);
  // "só em aberto" não muda a régua (continua sendo o dia em que chegou): muda só o que se conta
  const soAbertos = f.emAberto && !fech;
  if (f.aba === 'hoje') {
    const porHora = new Array(24).fill(0) as number[];
    for (const c of recorte) { const m = momento(c, f, ctx); if (m) porHora[horaEmBrasilia(m)]!++; }
    const agoraH = horaEmBrasilia(ctx.agora);
    return {
      titulo: fech ? 'Chamados fechados hoje, por hora' : soAbertos ? 'Abertos hoje e ainda em aberto, por hora' : 'Chamados abertos hoje, por hora',
      // com uma hora escolhida, o destaque passa a ser ela (e não mais a hora atual)
      sub: fech ? 'A que horas os chamados foram fechados.' : `A que horas os chamados chegaram.${escolhidas.size ? '' : ' A hora atual fica destacada.'}`,
      pontos: marcar(porHora.map((n, h) => ({ id: String(h), rotulo: `${String(h).padStart(2, '0')}h`, n, destaque: h === agoraH }))),
    };
  }
  // Período: por dia até ~3 meses; acima disso, por mês (mais de 90 colunas não se lê)
  const verbo = fech ? 'fechados' : 'abertos';
  const dias = diasEntre(de, ate) + 1;
  if (dias <= 92) {
    const m = new Map<string, number>();
    for (const c of recorte) { const mo = momento(c, f, ctx); if (!mo) continue; const d = diaEmBrasilia(mo); m.set(d, (m.get(d) ?? 0) + 1); }
    const pontos: PontoSerie[] = [];
    for (let d = de; d <= ate; d = somarDias(d, 1)) pontos.push({ id: d, rotulo: diaCurto(d), n: m.get(d) ?? 0, destaque: d === hoje });
    return {
      titulo: soAbertos ? 'Em aberto, pelo dia em que foram abertos' : `Chamados ${verbo} por dia`,
      sub: `De ${diaCurto(de)} a ${diaCurto(ate)}.${soAbertos ? ' Quanto mais à esquerda, mais tempo parado na mesa.' : ''}`,
      pontos: marcar(pontos),
    };
  }
  const m = new Map<string, number>();
  for (const c of recorte) { const mo = momento(c, f, ctx); if (!mo) continue; const mes = diaEmBrasilia(mo).slice(0, 7); m.set(mes, (m.get(mes) ?? 0) + 1); }
  const pontos: PontoSerie[] = [];
  for (let mes = de.slice(0, 7); mes <= ate.slice(0, 7); ) {
    const [a, mm] = mes.split('-').map(Number) as [number, number];
    pontos.push({ id: mes, rotulo: mesCurto(mes), n: m.get(mes) ?? 0, destaque: mes === hoje.slice(0, 7) });
    mes = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`;
  }
  return {
    titulo: soAbertos ? 'Em aberto, pelo mês em que foram abertos' : `Chamados ${verbo} por mês`,
    sub: `Período longo: de ${diaCurto(de)}/${de.slice(0, 4)} a ${diaCurto(ate)}/${ate.slice(0, 4)}, somado por mês.`,
    pontos: marcar(pontos),
  };
}

/** O dia do chamado mais antigo (em Brasília): o começo do atalho "Tudo". Sem chamados, hoje. */
export function primeiroDiaDe(cards: Chamado[], agora: Date): string {
  let menor = Infinity;
  for (const c of cards) { const t = Date.parse(c.createdAt); if (t < menor) menor = t; }
  return Number.isFinite(menor) ? diaEmBrasilia(new Date(menor)) : diaEmBrasilia(agora);
}

export function resumirChamados(cards: Chamado[], f: FiltrosChamados, ctx: ContextoChamados): ResumoChamados {
  const hoje = diaEmBrasilia(ctx.agora);
  const { de, ate } = periodoDe(f, ctx.agora);
  const primeiroDia = primeiroDiaDe(cards, ctx.agora);
  const tudo = recortar(cards, f, ctx);
  // cada parte da tela é contada sem o filtro que ela mesma controla
  const semSituacao = f.situacao ? recortar(cards, f, ctx, { situacao: true }) : tudo;
  const semQuando = quandoValidos(f).length ? recortar(cards, f, ctx, { quando: true }) : tudo;
  const paraDimensao = (d: Dimensao) => (escolhidosEm(f, d).size ? recortar(cards, f, ctx, { dimensao: d }).recorte : tudo.recorte);

  // ---- os números de cima (não obedecem à situação: é por eles que ela se escolhe)
  const { base, recorte } = semSituacao;
  const abertos = base.filter((c) => !estaFechado(c, ctx));
  const fechadoEm = (c: Chamado) => (c.closedAt && estaFechado(c, ctx) ? diaEmBrasilia(c.closedAt) : null);
  const vencidosEm = (xs: Chamado[]) => xs.filter((c) => c.isOverdue && !estaFechado(c, ctx)).length;
  const limite = ctx.agora.getTime() - 7 * 86_400_000;
  const k = (x: Kpi): Kpi => (x.filtro?.situacao && !x.filtro.aba && !x.filtro.tudo && x.filtro.situacao === f.situacao ? { ...x, ativo: true } : x);
  /** "De qualquer dia" é o Período inteiro com o "só em aberto" ligado — o que era a aba Em aberto */
  const qualquerDia = { aba: 'periodo' as const, tudo: true, emAberto: true };
  let kpis: Kpi[];
  if (f.aba === 'hoje' && !f.emAberto) {
    const fechadosHoje = base.filter((c) => fechadoEm(c) === hoje).length;
    const vencidos = vencidosEm(abertos);
    kpis = [
      { id: 'abertos-hoje', label: 'Abertos hoje', valor: nf(recorte.length), tom: 'accent', total: true },
      { id: 'fechados-hoje', label: 'Fechados hoje', valor: nf(fechadosHoje), sub: 'chegaram hoje numa etapa que fecha', tom: 'ok', filtro: { situacao: 'fechados' } },
      { id: 'em-aberto', label: 'Em aberto agora', valor: nf(abertos.length), sub: 'de qualquer dia', tom: 'neutral', filtro: qualquerDia },
      { id: 'vencidos', label: 'Vencidos', valor: nf(vencidos), sub: 'em aberto e com o vencimento passado', tom: vencidos ? 'bad' : 'neutral', filtro: { ...qualquerDia, situacao: 'vencidos' } },
    ];
  } else if (f.aba === 'hoje') {
    const vencidos = vencidosEm(recorte);
    kpis = [
      { id: 'abertos-hoje', label: 'Abertos hoje e em aberto', valor: nf(recorte.length), sub: 'ainda sem fechar', tom: 'accent', total: true },
      { id: 'sem-responsavel', label: 'Sem responsável', valor: nf(recorte.filter((c) => !c.responsavel).length), sub: 'dos abertos hoje', tom: 'neutral', filtro: { situacao: 'sem-responsavel' } },
      { id: 'vencidos', label: 'Vencidos', valor: nf(vencidos), sub: 'dos abertos hoje', tom: vencidos ? 'bad' : 'neutral', filtro: { situacao: 'vencidos' } },
      { id: 'em-aberto', label: 'Em aberto agora', valor: nf(abertos.length), sub: 'de qualquer dia', tom: 'neutral', filtro: qualquerDia },
    ];
  } else if (!f.emAberto) {
    const dias = diasEntre(de, ate) + 1;
    const fechados = base.filter((c) => { const d = fechadoEm(c); return !!d && d >= de && d <= ate; });
    const estimados = fechados.filter((c) => c.closedEstimated).length;
    kpis = [
      { id: 'abertos', label: 'Abertos no período', valor: nf(recorte.length), sub: `${(recorte.length / dias).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia, em média`, tom: 'accent', total: true },
      { id: 'fechados', label: 'Fechados no período', valor: nf(fechados.length), sub: estimados ? `${nf(estimados)} com data estimada (fechados antes da sincronização)` : 'chegaram numa etapa que fecha', tom: 'ok', filtro: { situacao: 'fechados' } },
      // clicar liga o "só em aberto": é o mesmo recorte, com os números certos para ele
      { id: 'ainda-abertos', label: 'Ainda em aberto', valor: nf(recorte.filter((c) => !estaFechado(c, ctx)).length), sub: 'dos abertos no período', tom: 'neutral', filtro: { emAberto: true } },
      { id: 'vencidos', label: 'Vencidos', valor: nf(vencidosEm(recorte)), sub: 'dos abertos no período', tom: 'neutral', filtro: { situacao: 'vencidos' } },
    ];
  } else {
    // o Período com "só em aberto": com o atalho Tudo, é o que a antiga aba Em aberto mostrava
    const parados = recorte.filter((c) => Date.parse(c.updatedAt) < limite).length;
    const vencidos = vencidosEm(recorte);
    kpis = [
      { id: 'em-aberto', label: 'Em aberto', valor: nf(recorte.length), sub: de <= primeiroDia ? 'de qualquer data' : 'dos abertos no período', tom: 'accent', total: true },
      { id: 'vencidos', label: 'Vencidos', valor: nf(vencidos), sub: 'com o vencimento passado', tom: vencidos ? 'bad' : 'neutral', filtro: { situacao: 'vencidos' } },
      { id: 'parados', label: 'Parados há 7 dias ou mais', valor: nf(parados), sub: 'ninguém mexeu no card', tom: parados ? 'signal' : 'neutral', filtro: { situacao: 'parados' } },
      { id: 'sem-responsavel', label: 'Sem responsável', valor: nf(recorte.filter((c) => !c.responsavel).length), tom: 'neutral', filtro: { situacao: 'sem-responsavel' } },
    ];
  }
  kpis = kpis.map(k);

  // ---- os gráficos de lista (cada um sem o próprio filtro)
  const recEtapa = paraDimensao('etapa');
  const etapaNome = (id: string) => (id === VAZIO ? 'Sem etapa (arquivado)' : ctx.etapas.find((e) => e.id === id)?.title ?? recEtapa.find((c) => c.stepId === id)?.stepTitle ?? 'Etapa removida');
  const posicao = (id: string) => ctx.etapas.find((e) => e.id === id)?.position ?? 999;
  const porEtapa = ranking(recEtapa, (c) => (c.stepId ? [c.stepId] : []), escolhidosEm(f, 'etapa'), etapaNome)
    // etapa é fluxo: fica na ordem do Kanban, não do maior para o menor
    .sort((a, b) => posicao(a.valor) - posicao(b.valor));

  const tag = (id: string) => ctx.etiquetas.find((t) => t.id === id);
  return {
    aba: f.aba, de, ate, hoje, primeiroDia,
    total: tudo.recorte.length,
    kpis,
    serie: serieDaAba(semQuando.recorte, f, ctx, de, ate),
    porEtapa,
    porResponsavel: ranking(paraDimensao('responsavel'), (c) => (c.responsavel ? [c.responsavel] : []), escolhidosEm(f, 'responsavel'), (x) => (x === VAZIO ? 'Sem responsável' : x)),
    porEtiqueta: ranking(paraDimensao('etiqueta'), (c) => c.tagIds, escolhidosEm(f, 'etiqueta'), (x) => (x === VAZIO ? 'Sem etiqueta' : tag(x)?.name ?? 'Etiqueta removida'), (x) => tag(x)?.color ?? null),
    porCampo: camposDeLista(ctx.campos).map((campo) => {
      const d: Dimensao = `campo:${campo.key}`;
      return {
        key: campo.key,
        name: campo.name,
        multiplo: campo.type === 'MULTISELECT',
        itens: ranking(paraDimensao(d), (c) => valoresDoCampo(c, campo.key), escolhidosEm(f, d), (x) => (x === VAZIO ? 'Não preenchido' : x)),
      };
    }),
  };
}

// ---------- a tabela ----------

export type LinhaChamado = {
  id: string;
  key: string | null;
  number: number | null;
  title: string;
  /** a descrição do card em texto puro, cortada (o card inteiro abre no LineChat) */
  descricao: string | null;
  stepId: string | null;
  stepTitle: string | null;
  fechado: boolean;
  arquivado: boolean;
  responsavel: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedEstimated: boolean;
  dueDate: string | null;
  isOverdue: boolean;
  etiquetas: Array<{ id: string; name: string; color: string | null }>;
  /** chave do campo → valores já juntados ("Carlos, Lucio") */
  campos: Record<string, string>;
  /** endereço do card no LineChat (vazio se ainda não se sabe o painel) */
  link: string;
};

/** Quanto da descrição vai para a tabela: o bastante para reconhecer o chamado sem pesar o "Ver tudo". */
export const LIMITE_DESCRICAO = 600;

export function linhaDoChamado(c: Chamado, ctx: ContextoChamados, link: (c: Chamado) => string): LinhaChamado {
  const campos: Record<string, string> = {};
  for (const k of Object.keys(c.campos)) { const v = valoresDoCampo(c, k); if (v.length) campos[k] = v.join(', '); }
  return {
    id: c.id, key: c.key, number: c.number, title: c.title,
    descricao: textoDoCard(c.description, LIMITE_DESCRICAO) || null,
    stepId: c.stepId, stepTitle: c.stepTitle, fechado: estaFechado(c, ctx), arquivado: c.status === 'ARCHIVED',
    responsavel: c.responsavel, createdAt: c.createdAt, updatedAt: c.updatedAt, closedAt: c.closedAt, closedEstimated: c.closedEstimated,
    dueDate: c.dueDate, isOverdue: c.isOverdue,
    etiquetas: c.tagIds.map((id) => { const t = ctx.etiquetas.find((x) => x.id === id); return { id, name: t?.name ?? 'Etiqueta removida', color: t?.color ?? null }; }),
    campos, link: link(c),
  };
}

/**
 * Ordena como a tela pede. `sort` é o id da coluna: numero, titulo, etapa, responsavel, aberto,
 * atualizado, fechado, ou `campo:<chave>` para um campo personalizado. Vazio sempre no fim.
 */
export function ordenarChamados(cards: Chamado[], sort: string | undefined, dir: 'asc' | 'desc' | undefined, ctx: ContextoChamados): Chamado[] {
  const posicao = (c: Chamado) => ctx.etapas.find((e) => e.id === c.stepId)?.position ?? null;
  const valor = (c: Chamado): string | number | null => {
    switch (sort) {
      case 'numero': return c.number;
      case 'titulo': return c.title.toLowerCase() || null;
      case 'etapa': return posicao(c);
      case 'responsavel': return c.responsavel?.toLowerCase() ?? null;
      case 'atualizado': return Date.parse(c.updatedAt);
      case 'fechado': return c.closedAt && estaFechado(c, ctx) ? Date.parse(c.closedAt) : null;
      case 'vencimento': return c.dueDate ? Date.parse(c.dueDate) : null;
      default:
        if (sort?.startsWith('campo:')) { const v = valoresDoCampo(c, sort.slice(6)); return v.length ? v.join(', ').toLowerCase() : null; }
        return Date.parse(c.createdAt); // "aberto", o padrão
    }
  };
  // o padrão é o mais novo primeiro; texto cresce de A a Z
  const sentido = dir ?? (!sort || ['aberto', 'atualizado', 'fechado', 'numero'].includes(sort) ? 'desc' : 'asc');
  const m = sentido === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * m;
    return String(va).localeCompare(String(vb), 'pt-BR') * m;
  });
}

/** A lista da tabela: o recorte da tela (com tudo o que foi clicado), ordenado e paginado. */
export function listarChamados(cards: Chamado[], q: ListaChamadosQuery, ctx: ContextoChamados, link: (c: Chamado) => string) {
  const { recorte } = recortar(cards, q, ctx);
  const ordenados = ordenarChamados(recorte, q.sort, q.dir, ctx);
  const inicio = (q.page - 1) * q.pageSize;
  return {
    items: ordenados.slice(inicio, inicio + q.pageSize).map((c) => linhaDoChamado(c, ctx, link)),
    total: ordenados.length,
    page: q.page,
    pageSize: q.pageSize,
  };
}

// ---------- a arrumação da tela (igual para a equipe toda) ----------

/**
 * Quem administra arruma a tela de Chamados para todo mundo: a ordem dos gráficos, a largura
 * (metade ou a linha inteira), os escondidos, se cada um abre em pizza ou barras, os **grupos**
 * de cada gráfico e as **etapas que fecham o chamado**. Os números de cima e a tabela ficam fixos.
 * Guardado no servidor (Ajustes, id `chamados-painel`).
 *
 * Os gráficos têm ids estáveis: `serie` (o do tempo), `etapa`, `responsavel`, `etiqueta` e
 * `campo:<chave do campo no LineChat>`. Campo novo no LineChat aparece sozinho, no fim; campo que
 * saiu de lá some da arrumação.
 */
export const LARGURAS_PAINEL = ['metade', 'inteira'] as const;
export const FORMAS_GRAFICO = ['barras', 'pizza'] as const;
export type FormaGrafico = (typeof FORMAS_GRAFICO)[number];

/**
 * A versão da arrumação guardada. A 1 é a do Patch 1.3, quando barras era o padrão; a 2 é a do
 * 1.4, quando a pizza passou a ser o padrão de todos os gráficos de lista.
 */
export const VERSAO_PAINEL = 2;

/**
 * Um grupo de um gráfico: várias opções que viram um ponto só quando o gráfico está agrupado
 * ("Ramal" = "Ramal - Configuração" + "Ramal - Criação" + "Ramal - Telefone Sem Serviço").
 * `valores` são os mesmos valores que o gráfico mostra: o nome da opção num campo do card ou no
 * responsável; o id na etapa e na etiqueta.
 */
export const GrupoGraficoSchema = z.object({
  id: z.string().trim().min(1).max(40),
  nome: z.string().trim().min(1, 'Dê um nome ao grupo').max(80),
  valores: z.array(z.string().max(300)).min(2, 'Um grupo junta pelo menos duas opções').max(500),
});
export type GrupoGrafico = z.infer<typeof GrupoGraficoSchema>;

const IdGrafico = z.string().trim().regex(/^(serie|etapa|responsavel|etiqueta|campo:.{1,100})$/, 'Gráfico desconhecido');
export const ItemPainelSchema = z
  .object({
    id: IdGrafico,
    largura: z.enum(LARGURAS_PAINEL),
    oculto: z.boolean().default(false),
    forma: z.enum(FORMAS_GRAFICO).optional(),
    /** abre com os grupos juntos (a escolha da equipe; cada pessoa ainda pode separar para si) */
    agrupar: z.boolean().optional(),
    grupos: z.array(GrupoGraficoSchema).max(100).optional(),
  })
  .superRefine((it, ctx) => {
    // uma opção num grupo só: se estivesse em dois, o mesmo chamado seria contado duas vezes
    const nomes = new Set<string>();
    const ids = new Set<string>();
    const dono = new Map<string, string>();
    for (const g of it.grupos ?? []) {
      const nome = g.nome.trim().toLowerCase();
      if (nomes.has(nome)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['grupos'], message: `Há dois grupos chamados "${g.nome}".` });
      if (ids.has(g.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['grupos'], message: 'Um grupo apareceu duas vezes.' });
      nomes.add(nome); ids.add(g.id);
      for (const v of g.valores) {
        const outro = dono.get(v);
        if (outro !== undefined && outro !== g.nome) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['grupos'], message: `"${v}" está em dois grupos (${outro} e ${g.nome}).` });
        dono.set(v, g.nome);
      }
    }
  });
export type ItemPainel = z.infer<typeof ItemPainelSchema>;

export const PainelChamadosSchema = z.object({
  /** sem versão = arrumação guardada no Patch 1.3 (ver `atualizarPainelGuardado`) */
  versao: z.number().int().min(1).max(99).optional(),
  itens: z.array(ItemPainelSchema).max(200)
    .refine((xs) => new Set(xs.map((x) => x.id)).size === xs.length, 'Um gráfico apareceu duas vezes na arrumação.'),
  /**
   * As etapas (ids do LineChat) que contam como fechadas. Vazio ou ausente = as finais do
   * LineChat (Chamado Tratado Suporte e Chamado Validado).
   */
  etapasFechadas: z.array(z.string().trim().min(1).max(100)).max(200).nullable().optional(),
});
export type PainelChamadosGuardado = z.infer<typeof PainelChamadosSchema>;

/**
 * A arrumação guardada no Patch 1.3 levava "barras" em quase todo gráfico só porque barras era o
 * padrão de então (a pizza vinha só em Produto, Tipo e Canal). No 1.4 a pizza virou o padrão de
 * todos — a pedido do Luan —, então essa arrumação antiga passa a abrir em pizza. Quem quiser
 * barras escolhe de novo, e o que for salvo daqui em diante (versão 2) vale como está.
 */
export function atualizarPainelGuardado<T extends { versao?: number; itens: ItemPainel[] }>(p: T): T {
  if ((p.versao ?? 1) >= VERSAO_PAINEL) return p;
  return { ...p, versao: VERSAO_PAINEL, itens: p.itens.map((x) => (x.id === 'serie' ? x : { ...x, forma: 'pizza' as const })) };
}

/** Os gráficos que a tela tem, na ordem de fábrica. */
export function graficosDaTela(campos: Array<{ key: string }>): string[] {
  return ['serie', 'etapa', 'responsavel', ...campos.map((c) => `campo:${c.key}`), 'etiqueta'];
}

/** De fábrica: o gráfico do tempo na linha inteira; os de lista em metade, em pizza (Patch 1.4). */
export function itemPadrao(id: string): ItemPainel {
  if (id === 'serie') return { id, largura: 'inteira', oculto: false };
  return { id, largura: 'metade', oculto: false, forma: 'pizza' };
}

/** A arrumação de fábrica. */
export const painelPadrao = (campos: Array<{ key: string }>): ItemPainel[] => graficosDaTela(campos).map(itemPadrao);

/**
 * Junta o que foi guardado com os gráficos que existem hoje: o que saiu some, o que é novo entra
 * no fim com o jeito de fábrica, repetido conta uma vez só. O do tempo não tem forma nem grupos.
 */
export function montarPainel(salvo: ItemPainel[] | null | undefined, campos: Array<{ key: string }>): ItemPainel[] {
  const existentes = graficosDaTela(campos);
  const existe = new Set(existentes);
  const vistos = new Set<string>();
  const out: ItemPainel[] = [];
  for (const it of salvo ?? []) {
    if (!existe.has(it.id) || vistos.has(it.id)) continue;
    const padrao = itemPadrao(it.id);
    if (it.id === 'serie') {
      out.push({ id: it.id, largura: it.largura, oculto: it.oculto ?? false });
    } else {
      const item: ItemPainel = { ...padrao, ...it, forma: it.forma ?? padrao.forma };
      if (!item.grupos?.length) { delete item.grupos; delete item.agrupar; }
      out.push(item);
    }
    vistos.add(it.id);
  }
  for (const id of existentes) if (!vistos.has(id)) out.push(itemPadrao(id));
  return out;
}

// ---------- os grupos de cada gráfico ----------

/** O valor de um grupo no gráfico: "grupo:<id>" (nunca colide com um valor de verdade, que não tem esse prefixo). */
export const PREFIXO_GRUPO = 'grupo:';

/**
 * O gráfico com os grupos juntos: os valores de um grupo viram um ponto só, com a soma deles.
 *
 * Somar é o certo inclusive em campo de múltipla escolha: lá o gráfico conta **marcações** (a
 * pizza diz isso no centro), e a soma das fatias continua batendo com o total. O grupo fica em
 * destaque quando algum dos seus valores está no filtro.
 *
 * `manterOrdem`: para a etapa, que segue a ordem do Kanban — o grupo fica onde aparece o primeiro
 * valor dele. Nos outros, maior primeiro (e o "não preenchido" no fim), como sempre.
 */
export function agruparItens(itens: ItemRanking[], grupos: GrupoGrafico[] | undefined, manterOrdem = false): ItemRanking[] {
  if (!grupos?.length) return itens;
  const grupoDe = new Map<string, GrupoGrafico>();
  for (const g of grupos) for (const v of g.valores) if (!grupoDe.has(v)) grupoDe.set(v, g);
  type Junto = ItemRanking & { grupo: NonNullable<ItemRanking['grupo']> };
  const juntos = new Map<string, Junto>();
  const out: ItemRanking[] = [];
  for (const it of itens) {
    const g = grupoDe.get(it.valor);
    if (!g) { out.push(it); continue; }
    let j = juntos.get(g.id);
    if (!j) {
      j = { valor: PREFIXO_GRUPO + g.id, rotulo: g.nome, n: 0, cor: null, grupo: { id: g.id, valores: [...g.valores], membros: [] } };
      juntos.set(g.id, j);
      out.push(j);
    }
    j.n += it.n;
    if (it.selecionado) j.selecionado = true;
    j.grupo.membros.push({ valor: it.valor, rotulo: it.rotulo, n: it.n });
  }
  return manterOrdem ? out : out.sort(compararItens);
}

/**
 * Sugestão de grupos pelo começo do nome: "Ramal - Configuração", "Ramal - Criação" e
 * "Ramal - Telefone Sem Serviço" viram o grupo "Ramal". Só entra o começo que junta duas ou mais
 * opções, e só as opções que ainda não estão em grupo nenhum. Maiúscula e acento não separam
 * ("LineChat - Ajuste" e "Linechat - Criação Login" são o mesmo começo); o nome do grupo é a
 * grafia mais usada. O traço precisa de espaço de um dos lados — "Wi-Fi" não é começo de nada.
 */
export function sugerirGrupos(opcoes: Array<{ valor: string; rotulo: string }>, jaAgrupados: Set<string> = new Set()): Array<{ nome: string; valores: string[] }> {
  const porComeco = new Map<string, { grafias: Map<string, number>; valores: string[] }>();
  for (const o of opcoes) {
    if (o.valor === VAZIO || jaAgrupados.has(o.valor)) continue;
    const m = /^(.+?)(?:\s+[-–—]\s*|\s*[-–—]\s+)\S/.exec(o.rotulo.trim());
    const comeco = m?.[1]?.trim();
    if (!comeco) continue;
    const chave = semAcento(comeco);
    const x = porComeco.get(chave) ?? { grafias: new Map<string, number>(), valores: [] };
    x.grafias.set(comeco, (x.grafias.get(comeco) ?? 0) + 1);
    if (!x.valores.includes(o.valor)) x.valores.push(o.valor);
    porComeco.set(chave, x);
  }
  return [...porComeco.values()]
    .filter((x) => x.valores.length >= 2)
    .map((x) => ({ nome: [...x.grafias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0]![0], valores: x.valores }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
