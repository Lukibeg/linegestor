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

export const ABAS_CHAMADOS = ['hoje', 'abertos', 'periodo'] as const;
export type AbaChamados = (typeof ABAS_CHAMADOS)[number];

const Dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD');
/** No endereço, um filtro pode vir uma vez (texto) ou repetido (lista): aqui sempre vira lista. */
const Lista = z.preprocess(
  (v) => (v === undefined || v === '' ? undefined : Array.isArray(v) ? v : [v]),
  z.array(z.string().max(300)).max(300).optional(),
);

export const FiltrosChamadosSchema = z.object({
  aba: z.enum(ABAS_CHAMADOS).default('hoje'),
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
  /** procura no código (IS-3607), no título e na descrição */
  busca: z.string().trim().max(120).optional(),
  /** incluir os cards arquivados no LineChat */
  arquivados: Booleano.default(false),
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

/** O período padrão da aba Período: os últimos 30 dias, até hoje. */
export function periodoPadrao(agora: Date): { de: string; ate: string } {
  const ate = diaEmBrasilia(agora);
  return { de: somarDias(ate, -29), ate };
}

// ---------- regras de cada chamado ----------

/** Fechado = está numa etapa final. Arquivado sem etapa conta pelo que estava antes (closedAt). */
export function estaFechado(c: Chamado, ctx: Pick<ContextoChamados, 'etapas'>): boolean {
  if (c.stepId) {
    const e = ctx.etapas.find((x) => x.id === c.stepId);
    if (e) return e.isFinal;
  }
  if (c.stepPhase) return c.stepPhase === 'FINAL';
  return !!c.closedAt;
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

/** Os filtros que valem para a tela inteira (tudo menos a aba). */
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
      const alvo = semAcento(`${c.key ?? ''} ${c.title} ${c.description ?? ''}`);
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

/** O recorte de cada aba, em cima do que já passou pelos filtros. */
export function recortarAba(base: Chamado[], f: FiltrosChamados, ctx: ContextoChamados): Chamado[] {
  const hoje = diaEmBrasilia(ctx.agora);
  if (f.aba === 'hoje') return base.filter((c) => diaEmBrasilia(c.createdAt) === hoje);
  if (f.aba === 'abertos') return base.filter((c) => !estaFechado(c, ctx));
  const { de, ate } = periodoDe(f, ctx.agora);
  return base.filter((c) => { const d = diaEmBrasilia(c.createdAt); return d >= de && d <= ate; });
}

export function periodoDe(f: Pick<FiltrosChamados, 'de' | 'ate'>, agora: Date): { de: string; ate: string } {
  const padrao = periodoPadrao(agora);
  let de = f.de ?? padrao.de; let ate = f.ate ?? padrao.ate;
  if (de > ate) [de, ate] = [ate, de];
  return { de, ate };
}

// ---------- contar ----------

export type ItemRanking = { valor: string; rotulo: string; n: number; cor?: string | null };
export type Kpi = { id: string; label: string; valor: string; sub?: string; tom: 'neutral' | 'accent' | 'signal' | 'ok' | 'bad' };
export type PontoSerie = { id: string; rotulo: string; n: number; destaque?: boolean };

export type ResumoChamados = {
  aba: AbaChamados;
  /** O período efetivamente usado na aba Período (com o padrão aplicado) */
  de: string;
  ate: string;
  hoje: string;
  /** Quantos chamados há no recorte da aba */
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
function emOrdem(m: Map<string, number>, rotulo: (k: string) => string, cor?: (k: string) => string | null): ItemRanking[] {
  return [...m.entries()]
    .map(([valor, n]) => ({ valor, rotulo: rotulo(valor), n, cor: cor?.(valor) ?? null }))
    .sort((a, b) => (a.valor === VAZIO ? 1 : b.valor === VAZIO ? -1 : b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR')));
}

const FAIXAS_IDADE: Array<{ id: string; rotulo: string; ate: number }> = [
  { id: 'hoje', rotulo: 'Abertos hoje', ate: 0 },
  { id: '1', rotulo: 'Ontem', ate: 1 },
  { id: '2-7', rotulo: '2 a 7 dias', ate: 7 },
  { id: '8-15', rotulo: '8 a 15 dias', ate: 15 },
  { id: '16-30', rotulo: '16 a 30 dias', ate: 30 },
  { id: '31-90', rotulo: '31 a 90 dias', ate: 90 },
  { id: '90+', rotulo: 'Mais de 90 dias', ate: Infinity },
];

function serieDaAba(recorte: Chamado[], f: FiltrosChamados, ctx: ContextoChamados, de: string, ate: string): ResumoChamados['serie'] {
  const hoje = diaEmBrasilia(ctx.agora);
  if (f.aba === 'hoje') {
    const porHora = new Array(24).fill(0) as number[];
    for (const c of recorte) porHora[horaEmBrasilia(c.createdAt)]!++;
    const agoraH = horaEmBrasilia(ctx.agora);
    return {
      titulo: 'Chamados abertos hoje, por hora',
      sub: 'A que horas os chamados chegam. A hora atual fica destacada.',
      pontos: porHora.map((n, h) => ({ id: String(h), rotulo: `${String(h).padStart(2, '0')}h`, n, destaque: h === agoraH })),
    };
  }
  if (f.aba === 'abertos') {
    const conta = FAIXAS_IDADE.map(() => 0);
    for (const c of recorte) {
      const idade = diasEntre(diaEmBrasilia(c.createdAt), hoje);
      const i = FAIXAS_IDADE.findIndex((x) => idade <= x.ate);
      conta[i === -1 ? FAIXAS_IDADE.length - 1 : i]!++;
    }
    return {
      titulo: 'Há quanto tempo estão abertos',
      sub: 'Os chamados em aberto agora, pela data em que foram abertos.',
      pontos: FAIXAS_IDADE.map((x, i) => ({ id: x.id, rotulo: x.rotulo, n: conta[i]!, destaque: x.ate > 30 && conta[i]! > 0 })),
    };
  }
  // Período: por dia até ~3 meses; acima disso, por mês (mais de 90 colunas não se lê)
  const dias = diasEntre(de, ate) + 1;
  if (dias <= 92) {
    const m = new Map<string, number>();
    for (const c of recorte) { const d = diaEmBrasilia(c.createdAt); m.set(d, (m.get(d) ?? 0) + 1); }
    const pontos: PontoSerie[] = [];
    for (let d = de; d <= ate; d = somarDias(d, 1)) pontos.push({ id: d, rotulo: diaCurto(d), n: m.get(d) ?? 0, destaque: d === hoje });
    return { titulo: 'Chamados abertos por dia', sub: `De ${diaCurto(de)} a ${diaCurto(ate)}.`, pontos };
  }
  const m = new Map<string, number>();
  for (const c of recorte) { const mes = diaEmBrasilia(c.createdAt).slice(0, 7); m.set(mes, (m.get(mes) ?? 0) + 1); }
  const pontos: PontoSerie[] = [];
  for (let mes = de.slice(0, 7); mes <= ate.slice(0, 7); ) {
    const [a, mm] = mes.split('-').map(Number) as [number, number];
    pontos.push({ id: mes, rotulo: `${NOMES_MES[mm - 1]}/${String(a).slice(2)}`, n: m.get(mes) ?? 0, destaque: mes === hoje.slice(0, 7) });
    mes = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`;
  }
  return { titulo: 'Chamados abertos por mês', sub: `Período longo: de ${diaCurto(de)}/${de.slice(0, 4)} a ${diaCurto(ate)}/${ate.slice(0, 4)}, somado por mês.`, pontos };
}

export function resumirChamados(cards: Chamado[], f: FiltrosChamados, ctx: ContextoChamados): ResumoChamados {
  const base = aplicarFiltros(cards, f);
  const recorte = recortarAba(base, f, ctx);
  const hoje = diaEmBrasilia(ctx.agora);
  const { de, ate } = periodoDe(f, ctx.agora);
  const abertos = base.filter((c) => !estaFechado(c, ctx));
  const fechadoEm = (c: Chamado) => (c.closedAt && estaFechado(c, ctx) ? diaEmBrasilia(c.closedAt) : null);

  let kpis: Kpi[];
  if (f.aba === 'hoje') {
    const fechadosHoje = base.filter((c) => fechadoEm(c) === hoje).length;
    kpis = [
      { id: 'abertos-hoje', label: 'Abertos hoje', valor: nf(recorte.length), tom: 'accent' },
      { id: 'fechados-hoje', label: 'Fechados hoje', valor: nf(fechadosHoje), sub: 'chegaram numa etapa final hoje', tom: 'ok' },
      { id: 'em-aberto', label: 'Em aberto agora', valor: nf(abertos.length), sub: 'de qualquer dia', tom: 'neutral' },
      { id: 'vencidos', label: 'Vencidos', valor: nf(abertos.filter((c) => c.isOverdue).length), sub: 'em aberto e com o vencimento passado', tom: abertos.some((c) => c.isOverdue) ? 'bad' : 'neutral' },
    ];
  } else if (f.aba === 'abertos') {
    const limite = ctx.agora.getTime() - 7 * 86_400_000;
    const parados = recorte.filter((c) => Date.parse(c.updatedAt) < limite).length;
    const vencidos = recorte.filter((c) => c.isOverdue).length;
    kpis = [
      { id: 'em-aberto', label: 'Em aberto', valor: nf(recorte.length), sub: 'fora das etapas finais', tom: 'accent' },
      { id: 'vencidos', label: 'Vencidos', valor: nf(vencidos), sub: 'com o vencimento passado', tom: vencidos ? 'bad' : 'neutral' },
      { id: 'parados', label: 'Parados há 7 dias ou mais', valor: nf(parados), sub: 'ninguém mexeu no card', tom: parados ? 'signal' : 'neutral' },
      { id: 'sem-responsavel', label: 'Sem responsável', valor: nf(recorte.filter((c) => !c.responsavel).length), tom: 'neutral' },
    ];
  } else {
    const dias = diasEntre(de, ate) + 1;
    const fechados = base.filter((c) => { const d = fechadoEm(c); return !!d && d >= de && d <= ate; });
    const estimados = fechados.filter((c) => c.closedEstimated).length;
    kpis = [
      { id: 'abertos', label: 'Abertos no período', valor: nf(recorte.length), sub: `${(recorte.length / dias).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia, em média`, tom: 'accent' },
      { id: 'fechados', label: 'Fechados no período', valor: nf(fechados.length), sub: estimados ? `${nf(estimados)} com data estimada (fechados antes da sincronização)` : 'chegaram numa etapa final', tom: 'ok' },
      { id: 'ainda-abertos', label: 'Ainda em aberto', valor: nf(recorte.filter((c) => !estaFechado(c, ctx)).length), sub: 'dos abertos no período', tom: 'neutral' },
      { id: 'vencidos', label: 'Vencidos', valor: nf(recorte.filter((c) => c.isOverdue && !estaFechado(c, ctx)).length), sub: 'dos abertos no período', tom: 'neutral' },
    ];
  }

  const etapaNome = (id: string) => (id === VAZIO ? 'Sem etapa (arquivado)' : ctx.etapas.find((e) => e.id === id)?.title ?? recorte.find((c) => c.stepId === id)?.stepTitle ?? 'Etapa removida');
  const posicao = (id: string) => ctx.etapas.find((e) => e.id === id)?.position ?? 999;
  const porEtapa = emOrdem(contarPor(recorte, (c) => (c.stepId ? [c.stepId] : [])), etapaNome)
    // etapa é fluxo: fica na ordem do Kanban, não do maior para o menor
    .sort((a, b) => posicao(a.valor) - posicao(b.valor));

  const tag = (id: string) => ctx.etiquetas.find((t) => t.id === id);
  return {
    aba: f.aba, de, ate, hoje,
    total: recorte.length,
    kpis,
    serie: serieDaAba(recorte, f, ctx, de, ate),
    porEtapa,
    porResponsavel: emOrdem(contarPor(recorte, (c) => (c.responsavel ? [c.responsavel] : [])), (k) => (k === VAZIO ? 'Sem responsável' : k)),
    porEtiqueta: emOrdem(contarPor(recorte, (c) => c.tagIds), (k) => (k === VAZIO ? 'Sem etiqueta' : tag(k)?.name ?? 'Etiqueta removida'), (k) => tag(k)?.color ?? null),
    porCampo: camposDeLista(ctx.campos).map((campo) => ({
      key: campo.key,
      name: campo.name,
      multiplo: campo.type === 'MULTISELECT',
      itens: emOrdem(contarPor(recorte, (c) => valoresDoCampo(c, campo.key)), (k) => (k === VAZIO ? 'Não preenchido' : k)),
    })),
  };
}

// ---------- a tabela ----------

export type LinhaChamado = {
  id: string;
  key: string | null;
  number: number | null;
  title: string;
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

export function linhaDoChamado(c: Chamado, ctx: ContextoChamados, link: (c: Chamado) => string): LinhaChamado {
  const campos: Record<string, string> = {};
  for (const k of Object.keys(c.campos)) { const v = valoresDoCampo(c, k); if (v.length) campos[k] = v.join(', '); }
  return {
    id: c.id, key: c.key, number: c.number, title: c.title,
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

/** A lista da tabela: o recorte da aba, ordenado e paginado. */
export function listarChamados(cards: Chamado[], q: ListaChamadosQuery, ctx: ContextoChamados, link: (c: Chamado) => string) {
  const recorte = recortarAba(aplicarFiltros(cards, q), q, ctx);
  const ordenados = ordenarChamados(recorte, q.sort, q.dir, ctx);
  const inicio = (q.page - 1) * q.pageSize;
  return {
    items: ordenados.slice(inicio, inicio + q.pageSize).map((c) => linhaDoChamado(c, ctx, link)),
    total: ordenados.length,
    page: q.page,
    pageSize: q.pageSize,
  };
}
