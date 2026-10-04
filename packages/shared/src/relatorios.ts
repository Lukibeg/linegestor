/**
 * Chamados › Relatórios (Patch 1.7): as contas dos nove relatórios escolhidos pelo Luan em 03/10.
 *
 * Como em `chamados.ts`, a conta é escrita uma vez só e roda igual no servidor e na prévia
 * clicável — os dois recebem os chamados já lidos e devolvem os números.
 *
 * Os relatórios, e a pergunta que cada um responde (nenhuma delas a tela de Chamados responde):
 *  - **Relógio do chamado** — quanto tempo um chamado leva, do aberto ao fechado?
 *  - **A escada N1 → N2 → N3** — quanto o N1 resolve sozinho, e quanto sobe?
 *  - **Mapa de calor** — em que dia da semana e hora os chamados chegam?
 *  - **Entrada × saída** — a fila está crescendo ou diminuindo?
 *  - **Sobe e desce dos assuntos** — o que está aumentando, comparado com o período anterior?
 *  - **Voltou com o mesmo problema** — que cliente abriu o mesmo assunto de novo em 30 dias?
 *  - **Raio-X do cliente** — como está o suporte de um cliente, num lugar só?
 *  - **Quadro da equipe** — como está a carga de cada pessoa agora?
 *  - **Fechamento do mês** — como foi o mês, comparado com o anterior?
 *
 * Três cuidados que valem para todos:
 *  - **tempo é mediana, não média**: um chamado esquecido 40 dias puxaria a média para cima e
 *    esconderia o normal. "9 em 10 fecham em até…" é o percentil 90;
 *  - **hora estimada fica fora das contas de tempo**: quem já estava fechado antes da primeira
 *    sincronização (23/09) tem a hora do fechamento estimada — entra na contagem, não no relógio;
 *  - **a escada só conta quem tem o caminho inteiro**: o histórico de etapas existe desde a primeira
 *    sincronização; de um chamado aberto antes disso não se sabe por onde ele passou.
 *
 * Tudo que é dia ou hora é no horário de Brasília (as mesmas funções da tela de Chamados).
 */
import { z } from 'zod';
import {
  aplicarFiltros, camposDeLista, diaEmBrasilia, diasEntre, estaFechado, FiltrosChamadosSchema, horaEmBrasilia, linhaDoChamado, periodoDe,
  somarDias, valoresDoCampo, VAZIO,
  type CampoChamado, type Chamado, type ContextoChamados, type FiltrosChamados, type GrupoGrafico, type LinhaChamado, type MovimentoChamado,
} from './chamados.js';
import { paraBusca } from './formatos.js';
import { Booleano } from './schemas.js';

// ---------- o que entra ----------

/** "Separar por" do Relógio: o tempo até fechar de cada tipo, produto, responsável… lado a lado. */
export const SEPARAR_POR = ['tipo', 'produto', 'responsavel', 'cliente', 'assunto'] as const;
export type SepararPor = (typeof SEPARAR_POR)[number];

/** Os poucos que pesam muito: os campos que dá para escolher. */
export const PARETO_POR = ['assunto', 'cliente', 'produto', 'tipo'] as const;
export type ParetoPor = (typeof PARETO_POR)[number];

/** As seções da página (cada uma é uma aba). */
export const SECOES_RELATORIOS = ['tempo', 'volume', 'clientes', 'equipe', 'mes'] as const;
export type SecaoRelatorios = (typeof SECOES_RELATORIOS)[number];

const Mes = z.string().regex(/^\d{4}-\d{2}$/, 'Mês no formato AAAA-MM');

/**
 * Os filtros da página: o período e os mesmos filtros de valor da tela de Chamados (etapa,
 * responsável, etiqueta, campos, busca, arquivados) — o relatório de um produto ou de um cliente
 * é o relatório com o filtro dele.
 */
export const FiltrosRelatoriosSchema = FiltrosChamadosSchema.pick({
  de: true, ate: true, etapa: true, responsavel: true, etiqueta: true, campo: true, busca: true, arquivados: true,
}).extend({
  separar: z.preprocess((v) => ((SEPARAR_POR as readonly unknown[]).includes(v) ? v : undefined), z.enum(SEPARAR_POR).optional()),
  /** Os poucos que pesam muito: por qual campo (padrão: Assunto) */
  pareto: z.preprocess((v) => ((PARETO_POR as readonly unknown[]).includes(v) ? v : undefined), z.enum(['assunto', 'cliente', 'produto', 'tipo']).optional()),
  /** o mês do Fechamento do mês (padrão: o mês passado) */
  mes: z.preprocess((v) => (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? v : undefined), Mes.optional()),
  /** Voltou com o mesmo problema: juntar os assuntos pelos grupos da equipe (Ramal, LineChat…) */
  juntarAssuntos: Booleano.default(false),
  /** Sobe e desce dos assuntos: separar os grupos (o padrão é juntar, quando a equipe montou grupos) */
  sobeSeparado: Booleano.default(false),
});
export type FiltrosRelatorios = z.infer<typeof FiltrosRelatoriosSchema>;

/**
 * Uma peça clicada num relatório ("relogio:f2", "calor:0-10", "fila:2026-09-21:entrou"…). A tela
 * pede os chamados dela para mostrar numa janela, com o link de cada um para o LineChat.
 */
export const ChamadosDaPecaSchema = FiltrosRelatoriosSchema.extend({
  peca: z.string().trim().min(3).max(400).regex(/^(relogio|escada|calor|fila|equipe|mes|sobe|idade|picos|tamanho|falha|gargalo|prazo|primeira|prioridade|pareto|preenchimento):/, 'Peça desconhecida'),
});
export type ChamadosDaPecaQuery = z.infer<typeof ChamadosDaPecaSchema>;

/** Os campos do card que os relatórios usam. Cada um pode ser escolhido; sem escolha, é achado pelo nome. */
export const PAPEIS_CAMPO = ['cliente', 'assunto', 'tipo', 'produto'] as const;
export type PapelCampo = (typeof PAPEIS_CAMPO)[number];

const ChaveCampo = z.string().trim().min(1).max(100);
/**
 * Os ajustes dos relatórios, guardados em Ajustes (`chamados-relatorios`), iguais para a equipe:
 *  - `campos`: qual campo do card é o Cliente, o Assunto, o Tipo e o Produto. Ausente = achar pelo
 *    nome; `null` = não usar nenhum;
 *  - `clientes`: a ligação do Cliente do card (o nome da opção no LineChat) com o cadastro do
 *    Gestor — o id do cliente, ou `null` para "não é cliente do cadastro" (Interno, por exemplo).
 *    Opção sem ligação guardada é ligada sozinha quando o nome bate (`ligarClientes`).
 */
export const AjustesRelatoriosSchema = z.object({
  campos: z.object({
    cliente: ChaveCampo.nullable().optional(),
    assunto: ChaveCampo.nullable().optional(),
    tipo: ChaveCampo.nullable().optional(),
    produto: ChaveCampo.nullable().optional(),
  }).default({}),
  clientes: z.record(z.string().max(300), z.string().max(60).nullable())
    .refine((m) => Object.keys(m).length <= 2000, 'Ligações demais').default({}),
  /** De quem é a falha: o tipo de chamado → o grupo. Tipo sem escolha vai pelo nome (`causaPeloNome`). */
  causas: z.record(z.string().max(300), z.enum(['nossa', 'cliente', 'operadora', 'pedido']))
    .refine((m) => Object.keys(m).length <= 500, 'Tipos demais').default({}),
});
export type AjustesRelatorios = z.infer<typeof AjustesRelatoriosSchema>;

/** Os quatro grupos do "De quem é a falha?", na ordem em que aparecem. */
export const CAUSAS = ['nossa', 'cliente', 'operadora', 'pedido'] as const;
export type Causa = (typeof CAUSAS)[number];
export const NOMES_CAUSA: Record<Causa, string> = { nossa: 'falha nossa', cliente: 'do cliente', operadora: 'da operadora', pedido: 'pedido ou dúvida' };

/**
 * O grupo de um tipo de chamado pelo nome, quando a equipe não escolheu: operadora/terceiros →
 * operadora; Ingline, sistêmica, correção → nossa; falha, dificuldade, infraestrutura → do cliente
 * ("Falha usuário", "Dificuldade Infraestrutura Cliente"); o resto (configuração, requisição, dúvida,
 * treinamento) → pedido ou dúvida.
 */
export function causaPeloNome(tipo: string): Causa {
  const n = paraBusca(tipo);
  if (/operadora|terceir/.test(n)) return 'operadora';
  if (/ingline|sistem|correc|bug|defeito/.test(n)) return 'nossa';
  if (/falha|dificuldade|infraestrutura/.test(n)) return 'cliente';
  return 'pedido';
}
export const causaDe = (tipo: string, ajustes: Pick<AjustesRelatorios, 'causas'>): Causa => ajustes.causas?.[tipo] ?? causaPeloNome(tipo);

/** O contexto dos relatórios: o da tela de Chamados mais o histórico de etapas. */
export type ContextoRelatorios = ContextoChamados & {
  /** as mudanças de etapa de cada card (`linechat_card_moves`), da mais antiga para a mais nova */
  historico: Map<string, MovimentoChamado[]>;
  /** desde quando o histórico tem hora exata (a primeira sincronização) */
  historicoDesde: string | null;
  ajustes: AjustesRelatorios;
  /** os grupos que a equipe montou para o gráfico do Assunto (em Organizar) */
  gruposAssunto?: GrupoGrafico[];
  /**
   * O cadastro de clientes (para ligar o Cliente do card) e o tamanho de cada um no Gestor (DIDs e
   * aparelhos). Só o "Chamados pelo tamanho do cliente" usa; sem eles, o relatório vem vazio.
   */
  cadastro?: ClienteParaLigar[];
  tamanhos?: Map<string, { nome: string; dids: number; aparelhos: number }>;
};

// ---------- pequenas contas ----------

const HORA = 3_600_000;
const DIA = 86_400_000;
const nf = (n: number) => n.toLocaleString('pt-BR');

/** A mediana (o do meio). Lista vazia = null. */
export function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
/** O percentil pelo posto mais próximo: `percentil(xs, 0.9)` = "9 em 10 ficam em até isto". */
export function percentil(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]!;
}

/** "25 min", "3h 40min", "1d 6h" — o tempo do jeito que a equipe fala. */
export function duracaoLegivel(horas: number | null | undefined): string {
  if (horas == null || !Number.isFinite(horas)) return '—';
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 24) {
    let h = Math.floor(horas); let m = Math.round((horas - h) * 60);
    if (m === 60) { h++; m = 0; }
    if (h === 24) return '1d';
    return m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`;
  }
  let d = Math.floor(horas / 24); let h = Math.round(horas - d * 24);
  if (h === 24) { d++; h = 0; }
  return h ? `${d}d ${h}h` : `${d}d`;
}

/** 0 = segunda … 6 = domingo, para um AAAA-MM-DD. */
export function diaDaSemana(dia: string): number {
  return (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7;
}
export const DIAS_DA_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DIAS_CURTOS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
/** "setembro de 2026" */
export const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
const mesCurto = (mes: string) => `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
/** O mês seguinte / anterior (AAAA-MM). */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
/** O último dia (AAAA-MM-DD) de um mês. */
const fimDoMes = (mes: string) => somarDias(`${somarMeses(mes, 1)}-01`, -1);
/** A segunda-feira da semana de um dia. */
export const inicioDaSemana = (dia: string) => somarDias(dia, -diaDaSemana(dia));

/** Horas do aberto ao fechado. null = não está fechado, ou a hora do fechamento é estimada. */
export function horasAteFechar(c: Chamado, ctx: Pick<ContextoChamados, 'etapas'>): number | null {
  if (!c.closedAt || c.closedEstimated || !estaFechado(c, ctx)) return null;
  return Math.max(0, (Date.parse(c.closedAt) - Date.parse(c.createdAt)) / HORA);
}

/** Os filtros da página no formato da tela de Chamados (aba Período, sem situação nem colunas clicadas). */
function comoFiltrosDaTela(f: FiltrosRelatorios): FiltrosChamados {
  return {
    aba: 'periodo', de: f.de, ate: f.ate, etapa: f.etapa, responsavel: f.responsavel, etiqueta: f.etiqueta, campo: f.campo,
    busca: f.busca, arquivados: f.arquivados, emAberto: false, quando: undefined, situacao: undefined,
  };
}

// ---------- os campos do card ----------

export type CamposDosRelatorios = Record<PapelCampo, CampoChamado | null>;

/**
 * Qual campo do card é o Cliente, o Assunto, o Tipo e o Produto. Vale a escolha guardada; sem
 * escolha, o campo é achado pela chave do painel de suporte ou pelo nome (o "Assunto" de escolha
 * única vem antes do "Assunto - novo", de múltipla).
 */
export function camposDosRelatorios(campos: CampoChamado[], escolha: AjustesRelatorios['campos'] = {}): CamposDosRelatorios {
  const lista = camposDeLista(campos);
  const nome = (c: CampoChamado) => paraBusca(c.name);
  const achar = (papel: PapelCampo, chave: string, ...regras: Array<(c: CampoChamado) => boolean>): CampoChamado | null => {
    const e = escolha[papel];
    if (e === null) return null;
    if (e) { const c = lista.find((x) => x.key === e); if (c) return c; }
    const porChave = lista.find((x) => x.key === chave);
    if (porChave) return porChave;
    for (const r of regras) { const c = lista.find(r); if (c) return c; }
    return null;
  };
  return {
    cliente: achar('cliente', 'cliente-71', (c) => nome(c) === 'cliente', (c) => nome(c).startsWith('cliente')),
    assunto: achar('assunto', 'assunto', (c) => nome(c) === 'assunto', (c) => nome(c).startsWith('assunto') && c.type === 'SINGLESELECT', (c) => nome(c).startsWith('assunto')),
    tipo: achar('tipo', 'tipo-de-chamado-24', (c) => nome(c).startsWith('tipo')),
    produto: achar('produto', 'plataforma', (c) => nome(c) === 'produto' || nome(c) === 'plataforma', (c) => nome(c).startsWith('produto')),
  };
}

// ---------- a ligação do Cliente do card com o cadastro ----------

/** Um cliente do Gestor, com os nomes pelos quais ele pode aparecer no LineChat. */
export type ClienteParaLigar = { id: string; nomes: string[] };
export type Ligacao = { clienteId: string | null; como: 'manual' | 'automatico' | 'nenhum' };

const SUFIXOS = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 's/a', 'mei', 'cia']);
/** O nome sem acento, pontuação, maiúscula e "Ltda/ME/S.A." — é assim que dois nomes são comparados. */
export function nomeComparavel(t: string): string {
  return paraBusca(t).replace(/s\/a\b/g, 'sa').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((p) => p && !SUFIXOS.has(p)).join(' ');
}

/**
 * Liga cada opção do Cliente do LineChat a um cliente do Gestor:
 *  - a ligação guardada vale sempre (inclusive a de "não é cliente do cadastro");
 *  - sem ligação guardada, liga sozinho quando o nome bate com o nome fantasia ou a razão social
 *    de **um** cliente só (sem acento, sem "Ltda"); ou, para nomes de 5 letras ou mais, quando um
 *    contém o outro em palavras inteiras e só um cliente serve. Dois candidatos = não liga (a
 *    administração escolhe).
 */
export function ligarClientes(opcoes: string[], clientes: ClienteParaLigar[], manual: Record<string, string | null> = {}): Record<string, Ligacao> {
  const comNomes = clientes.map((c) => ({ id: c.id, nomes: [...new Set(c.nomes.map(nomeComparavel).filter(Boolean))] }));
  const existe = new Set(clientes.map((c) => c.id));
  const out: Record<string, Ligacao> = {};
  const contem = (a: string, b: string) => ` ${a} `.includes(` ${b} `);
  for (const op of opcoes) {
    if (Object.prototype.hasOwnProperty.call(manual, op)) {
      const id = manual[op] ?? null;
      // ligação a um cliente que foi para a lixeira: volta a procurar sozinha
      if (id === null || existe.has(id)) { out[op] = id ? { clienteId: id, como: 'manual' } : { clienteId: null, como: 'nenhum' }; continue; }
    }
    const n = nomeComparavel(op);
    let achados = n ? comNomes.filter((c) => c.nomes.includes(n)) : [];
    if (!achados.length && n.length >= 5) {
      achados = comNomes.filter((c) => c.nomes.some((x) => x.length >= 5 && (contem(x, n) || contem(n, x))));
    }
    out[op] = achados.length === 1 ? { clienteId: achados[0]!.id, como: 'automatico' } : { clienteId: null, como: 'nenhum' };
  }
  return out;
}

/** As opções do Cliente do LineChat ligadas a um cliente do Gestor. */
export const opcoesDoCliente = (ligacoes: Record<string, Ligacao>, clienteId: string) =>
  Object.entries(ligacoes).filter(([, l]) => l.clienteId === clienteId).map(([op]) => op);

// ---------- o caminho de cada chamado (para a escada) ----------

/** N1, N2 ou N3 pelo nome da etapa ("Chamado Em Tratativa N2" → 2). */
export function nivelDaEtapa(titulo: string | null | undefined): 1 | 2 | 3 | null {
  const m = /\bN\s?([123])\b/i.exec(titulo ?? '');
  return m ? (Number(m[1]) as 1 | 2 | 3) : null;
}

export type CaminhoChamado = {
  /** sabemos por onde ele passou desde a abertura (aberto depois que o histórico começou) */
  completo: boolean;
  /** o nível mais alto por onde passou: 0 = nunca entrou numa etapa N1, N2 ou N3 */
  nivel: 0 | 1 | 2 | 3;
  /** quando ele saiu de uma etapa que fecha para uma que não fecha (reaberto) */
  reabertoEm: string[];
};

export function caminhoDoChamado(c: Chamado, ctx: Pick<ContextoRelatorios, 'etapas' | 'historico'>): CaminhoChamado {
  const nivelDe = new Map(ctx.etapas.map((e) => [e.id, nivelDaEtapa(e.title)]));
  const fecha = new Set(ctx.etapas.filter((e) => e.isFinal).map((e) => e.id));
  const movs = ctx.historico.get(c.id) ?? [];
  let nivel: 0 | 1 | 2 | 3 = 0;
  const reabertoEm: string[] = [];
  const subir = (id: string | null) => { const n = id ? nivelDe.get(id) : null; if (n && n > nivel) nivel = n; };
  for (const m of movs) {
    subir(m.toStepId);
    subir(m.fromStepId);
    if (m.fromStepId && fecha.has(m.fromStepId) && m.toStepId && !fecha.has(m.toStepId)) reabertoEm.push(m.at);
  }
  subir(c.stepId);
  const primeiro = movs[0];
  return { completo: !!primeiro && primeiro.fromStepId === null && !primeiro.estimated, nivel, reabertoEm };
}

// ---------- faixas e grades ----------

export const FAIXAS_TEMPO: Array<{ id: string; rotulo: string; ate: number }> = [
  { id: 'f0', rotulo: 'até 1h', ate: 1 },
  { id: 'f1', rotulo: '1h a 4h', ate: 4 },
  { id: 'f2', rotulo: '4h a 1 dia', ate: 24 },
  { id: 'f3', rotulo: '1 a 3 dias', ate: 72 },
  { id: 'f4', rotulo: '3 a 7 dias', ate: 168 },
  { id: 'f5', rotulo: 'mais de 7 dias', ate: Infinity },
];
export const faixaDoTempo = (horas: number) => FAIXAS_TEMPO.find((f) => horas < f.ate)!.id;

/** Horário comercial do mapa de calor: segunda a sexta, das 8h às 18h. */
export const HORARIO_COMERCIAL = { dias: [0, 1, 2, 3, 4], de: 8, ate: 18 };
const foraDoComercial = (dow: number, hora: number) => !HORARIO_COMERCIAL.dias.includes(dow) || hora < HORARIO_COMERCIAL.de || hora >= HORARIO_COMERCIAL.ate;

/** Até ~6 meses, a Entrada × saída é por semana; acima disso, por mês. */
const LIMITE_SEMANAS = 182;

// ---------- o que sai ----------

export type CampoUsado = { key: string; name: string } | null;
export type LinhaSeparada = { valor: string; rotulo: string; n: number; mediana: number; p90: number };

export type RelogioChamados = {
  /** fechados no período, com a hora do fechamento exata (os que entram no relógio) */
  n: number;
  /** fechados no período com a hora estimada (fora do relógio) */
  estimados: number;
  mediana: number | null;
  p90: number | null;
  /** o período anterior, do mesmo tamanho: para dizer se melhorou */
  anterior: { de: string; ate: string; n: number; mediana: number | null };
  faixas: Array<{ id: string; rotulo: string; n: number }>;
  separado: { por: SepararPor; nome: string; linhas: LinhaSeparada[] } | null;
};

export type EscadaChamados = {
  /** as etapas N1, N2 e N3 existem no painel */
  achouNiveis: boolean;
  /** fechados no período com o caminho inteiro conhecido */
  n: number;
  /** fechados no período que foram abertos antes do histórico começar (fora da escada) */
  semHistorico: number;
  direto: number; n1: number; n2: number; n3: number;
  /** tempo até fechar (mediana) pelo nível mais alto alcançado; `n1` inclui os que nem chegaram ao N1 */
  medianas: { n1: number | null; n2: number | null; n3: number | null };
  /** chamados que saíram de uma etapa que fecha e voltaram para o trabalho, no período */
  reabertos: number;
};

export type CalorChamados = {
  n: number;
  /** [dia da semana 0=seg..6=dom][hora 0..23]: quantos chegaram, somando o período */
  celulas: number[][];
  /** quantas vezes cada dia da semana aparece no período (para a média por semana) */
  ocorrencias: number[];
  porDia: number[];
  porHora: number[];
  pico: { dia: number; hora: number; n: number; media: number } | null;
  foraDoHorario: number;
};

export type PontoFila = { id: string; rotulo: string; de: string; ate: string; entrou: number; saiu: number; fila: number; parcial: boolean };
export type FilaChamados = {
  por: 'semana' | 'mes';
  pontos: PontoFila[];
  entrou: number;
  saiu: number;
  filaHoje: number;
  /** chegou − saiu nas últimas 4 semanas (ou 3 meses) do período */
  saldoRecente: { n: number; pontos: number };
  /** fechados no período com a data estimada (contam na saída, pela última alteração) */
  estimados: number;
};

export type ItemSobeDesce = { rotulo: string; agora: number; antes: number; delta: number };
export type SobeDesceChamados = {
  assunto: CampoUsado;
  /** o período anterior, do mesmo tamanho, terminando na véspera do começo deste */
  anterior: { de: string; ate: string };
  /** abertos no período e no anterior (com o Assunto preenchido) */
  agora: number;
  antes: number;
  /** os que mais subiram (maior aumento primeiro) e os que mais caíram */
  subiram: ItemSobeDesce[];
  cairam: ItemSobeDesce[];
  /** assuntos que apareceram agora e não tinham nenhum chamado antes */
  novos: number;
  podeJuntar: boolean;
  juntado: boolean;
};

/** As faixas da Idade da fila (há quantos dias o chamado em aberto foi aberto). */
export const FAIXAS_IDADE: Array<{ id: string; rotulo: string; ate: number }> = [
  { id: 'i0', rotulo: 'até 1 dia', ate: 1 },
  { id: 'i1', rotulo: '1 a 3 dias', ate: 3 },
  { id: 'i2', rotulo: '3 a 7 dias', ate: 7 },
  { id: 'i3', rotulo: '7 a 15 dias', ate: 15 },
  { id: 'i4', rotulo: '15 a 30 dias', ate: 30 },
  { id: 'i5', rotulo: 'mais de 30 dias', ate: Infinity },
];
export const faixaDaIdade = (dias: number) => FAIXAS_IDADE.find((f) => dias < f.ate)!.id;

export type IdadeDaFila = {
  /** em aberto agora (de qualquer data) */
  n: number;
  maisDe7: number;
  /** a mediana da idade, em dias */
  mediana: number | null;
  maisAntigo: { key: string | null; title: string; link: string; dias: number } | null;
  faixas: Array<{ id: string; rotulo: string; n: number }>;
  /** cada etapa (na ordem do Kanban) com quantos tem em cada faixa */
  porEtapa: Array<{ id: string; titulo: string; n: number; faixas: number[] }>;
};

export type DiaForaDaCurva = { dia: string; n: number; normal: number; assunto: { rotulo: string; n: number } | null; cliente: { rotulo: string; n: number } | null };
export type ForaDaCurva = {
  /** um ponto por dia do período (vazio em período maior que ~3 meses) */
  pontos: Array<{ id: string; rotulo: string; n: number; normal: number; pico: boolean }>;
  /** os dias fora da curva, do mais novo para o mais antigo */
  picos: DiaForaDaCurva[];
};

export type LinhaTamanho = {
  clienteId: string; nome: string;
  /** chamados abertos no período */
  n: number;
  dids: number; aparelhos: number;
  /** chamados por 10 DIDs / por 10 aparelhos (null = o cliente não tem nenhum) */
  porDids: number | null;
  porAparelhos: number | null;
};
export type TamanhoDoCliente = {
  /** o cadastro chegou (sem ele, não dá para medir) */
  disponivel: boolean;
  linhas: LinhaTamanho[];
  /** chamados abertos no período cujo Cliente não está ligado a ninguém do cadastro */
  semLigacao: number;
};

export type ContagemCausas = { total: number; porCausa: Record<Causa, number>; semTipo: number };
export type FalhaChamados = {
  tipo: CampoUsado;
  /** os 6 meses até o fim do período */
  meses: Array<{ id: string; rotulo: string } & ContagemCausas>;
  periodo: ContagemCausas;
  /** cada tipo, o grupo dele (escolhido ou pelo nome) e quantos no período */
  tipos: Array<{ tipo: string; causa: Causa; escolhida: boolean; n: number }>;
};

export type ChamadoCurto = { id: string; key: string | null; title: string; createdAt: string; fechado: boolean; link: string };
export type LinhaReincidencia = { cliente: string; assunto: string; n: number; menorIntervalo: number; ultimo: string; chamados: ChamadoCurto[] };
export type ReincidenciaChamados = {
  cliente: CampoUsado;
  assunto: CampoUsado;
  /** abertos no período com Cliente e Assunto preenchidos (o universo da conta) */
  total: number;
  /** abertos no período sem Cliente ou sem Assunto (ficaram de fora) */
  semCampo: number;
  pares: number;
  /** quantos chamados estão nesses pares */
  chamados: number;
  linhas: LinhaReincidencia[];
  podeJuntar: boolean;
  juntado: boolean;
};

export type LinhaEquipe = {
  /** null = sem responsável */
  nome: string | null;
  emAberto: number; parados: number; vencidos: number;
  fechados: number; mediana: number | null;
  /** fechados por semana nas últimas 8 semanas (a última é a atual) */
  tendencia: number[];
};
export type EquipeChamados = { semanas: string[]; linhas: LinhaEquipe[]; totais: Omit<LinhaEquipe, 'nome' | 'mediana' | 'tendencia'> & { mediana: number | null } };

export type ItemComparado = { rotulo: string; n: number; antes: number };
export type MesChamados = {
  mes: string; nome: string; anterior: string; nomeAnterior: string;
  /** o mês ainda não acabou (conta até hoje) */
  parcial: boolean;
  abertos: { n: number; antes: number };
  fechados: { n: number; antes: number };
  mediana: { h: number | null; antes: number | null };
  filaNoFim: { n: number; antes: number };
  porDia: Array<{ id: string; rotulo: string; n: number; destaque?: boolean }>;
  assuntos: ItemComparado[];
  juntouAssuntos: boolean;
  clientes: ItemComparado[];
  tipos: ItemComparado[];
  destaques: string[];
};

/** Onde o chamado empaca: quanto tempo cada passagem por uma etapa durou. */
export type EtapaParada = {
  id: string; titulo: string;
  /** passagens pela etapa que terminaram no período (com hora exata) */
  n: number;
  mediana: number | null;
  p90: number | null;
  /** chamados em aberto parados nela agora */
  agora: number;
};
export type GargaloChamados = { etapas: EtapaParada[]; maisLenta: string | null };

export type PrazoChamados = {
  /** fechados no período (hora exata) que tinham vencimento */
  comPrazo: number;
  dentro: number;
  fora: number;
  /** fechados no período sem vencimento */
  semPrazo: number;
  /** % fechados até o vencimento */
  pct: number | null;
  anterior: { comPrazo: number; pct: number | null };
  vencidosAgora: number;
  porTipo: Array<{ rotulo: string; n: number; dentro: number; pct: number }>;
};

export const FAIXAS_RESPOSTA: Array<{ id: string; rotulo: string; ate: number }> = [
  { id: 'r0', rotulo: 'até 15 min', ate: 0.25 },
  { id: 'r1', rotulo: '15 a 30 min', ate: 0.5 },
  { id: 'r2', rotulo: '30 min a 1h', ate: 1 },
  { id: 'r3', rotulo: '1h a 4h', ate: 4 },
  { id: 'r4', rotulo: '4h a 1 dia', ate: 24 },
  { id: 'r5', rotulo: 'mais de 1 dia', ate: Infinity },
];
export const faixaDaResposta = (h: number) => FAIXAS_RESPOSTA.find((f) => h < f.ate)!.id;
export type PrimeiraResposta = {
  /** a etapa onde o chamado nasce ("Novos Suporte") */
  inicial: { id: string; titulo: string } | null;
  /** abertos no período, no horário comercial, já pegos e com o caminho conhecido */
  n: number;
  mediana: number | null;
  p90: number | null;
  ate1h: number;
  faixas: Array<{ id: string; rotulo: string; n: number }>;
  /** os que chegaram fora do horário comercial (contados à parte) */
  fora: { n: number; mediana: number | null };
  /** ainda na etapa inicial agora (ninguém pegou) */
  esperando: number;
  maisAntigoEsperando: { key: string | null; title: string; link: string; horas: number } | null;
  /** abertos no período sem o caminho conhecido (antes do histórico) */
  semHistorico: number;
};

export type LinhaPrioridade = { id: string; rotulo: string; cor: string | null; nivel: number; fechados: number; mediana: number | null; abertos: number };
export type PrioridadeChamados = {
  /** o painel tem as etiquetas de prioridade (P/ Crítica, P/ Alta, P/ Média, P/ Baixa) */
  temEtiquetas: boolean;
  linhas: LinhaPrioridade[];
  /** pares em que a prioridade mais alta demorou mais que a mais baixa */
  invertidas: Array<{ mais: string; menos: string }>;
  /** % dos fechados no período sem prioridade */
  semPrioridadePct: number;
};

export type ParetoChamados = {
  por: ParetoPor;
  campo: CampoUsado;
  juntado: boolean;
  /** marcações no período (num campo de múltipla escolha, um card conta em cada valor) */
  total: number;
  itens: Array<{ rotulo: string; n: number; acumulado: number }>;
  /** quantos valores fazem 80% */
  para80: number;
};

export type PrevisaoChamados = {
  /** a próxima semana, de segunda a domingo */
  semana: { de: string; ate: string };
  /** quantas semanas completas entraram na conta (até 8) */
  semanas: number;
  dias: Array<{ dia: string; rotulo: string; dow: number; media: number; min: number; max: number }>;
  total: number;
  faixa: { min: number; max: number };
  /** a semana de agora até hoje, e o esperado até hoje, para comparar */
  semanaAtual: { de: string; ateHoje: number; esperadoAteHoje: number };
};

export type PreenchimentoChamados = {
  /** fechados no período */
  n: number;
  /** com todos os campos preenchidos */
  completos: number;
  campos: Array<{ key: string; nome: string; preenchidos: number; pct: number }>;
  porResponsavel: Array<{ nome: string | null; n: number; completos: number; pct: number }>;
};

export type RelatoriosChamados = {
  de: string; ate: string; hoje: string;
  historicoDesde: string | null;
  campos: Record<PapelCampo, CampoUsado>;
  relogio: RelogioChamados;
  escada: EscadaChamados;
  calor: CalorChamados;
  fila: FilaChamados;
  sobeDesce: SobeDesceChamados;
  idade: IdadeDaFila;
  foraDaCurva: ForaDaCurva;
  reincidencia: ReincidenciaChamados;
  tamanho: TamanhoDoCliente;
  falha: FalhaChamados;
  equipe: EquipeChamados;
  mes: MesChamados;
  gargalo: GargaloChamados;
  prazo: PrazoChamados;
  primeira: PrimeiraResposta;
  prioridade: PrioridadeChamados;
  pareto: ParetoChamados;
  previsao: PrevisaoChamados;
  preenchimento: PreenchimentoChamados;
};

// ---------- as contas ----------

type Preparo = {
  ctx: ContextoRelatorios;
  campos: CamposDosRelatorios;
  base: Chamado[];
  de: string; ate: string; hoje: string;
  dentro: (dia: string | null) => boolean;
  fechado: (c: Chamado) => boolean;
  /** dia (Brasília) do fechamento, se fechado */
  diaFechou: (c: Chamado) => string | null;
};

function preparar(cards: Chamado[], f: FiltrosRelatorios, ctx: ContextoRelatorios): Preparo {
  const { de, ate } = periodoDe(f, ctx.agora);
  const hoje = diaEmBrasilia(ctx.agora);
  const base = aplicarFiltros(cards, comoFiltrosDaTela(f));
  const fechado = (c: Chamado) => estaFechado(c, ctx);
  return {
    ctx, campos: camposDosRelatorios(ctx.campos, ctx.ajustes.campos), base, de, ate, hoje,
    dentro: (dia) => !!dia && dia >= de && dia <= ate,
    fechado,
    diaFechou: (c) => (c.closedAt && fechado(c) ? diaEmBrasilia(c.closedAt) : null),
  };
}

const curto = (c: Chamado, ctx: ContextoChamados, link: (c: Chamado) => string): ChamadoCurto =>
  ({ id: c.id, key: c.key, title: c.title, createdAt: c.createdAt, fechado: estaFechado(c, ctx), link: link(c) });

/** O nome de um valor com os grupos da equipe aplicados ("Ramal - Criação" → "Ramal"). */
function comGrupos(grupos: GrupoGrafico[] | undefined): (v: string) => string {
  if (!grupos?.length) return (v) => v;
  const m = new Map<string, string>();
  for (const g of grupos) for (const v of g.valores) if (!m.has(v)) m.set(v, g.nome);
  return (v) => m.get(v) ?? v;
}

/** Contar por valores de um campo (cada valor de um campo de múltipla escolha conta). */
function contarValores(cards: Chamado[], chave: (c: Chamado) => string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) for (const v of new Set(chave(c))) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}
const maiores = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, n);

function valoresPara(p: Preparo, por: SepararPor): (c: Chamado) => string[] {
  if (por === 'responsavel') return (c) => [c.responsavel ?? VAZIO];
  const campo = p.campos[por];
  if (!campo) return () => [VAZIO];
  return (c) => { const v = valoresDoCampo(c, campo.key); return v.length ? v : [VAZIO]; };
}

function relogio(p: Preparo, f: FiltrosRelatorios): RelogioChamados {
  const fechadosNoPeriodo = p.base.filter((c) => p.dentro(p.diaFechou(c)));
  const comHora = fechadosNoPeriodo.map((c) => ({ c, h: horasAteFechar(c, p.ctx) })).filter((x): x is { c: Chamado; h: number } => x.h !== null);
  const horas = comHora.map((x) => x.h);
  const faixas = FAIXAS_TEMPO.map((fx) => ({ id: fx.id, rotulo: fx.rotulo, n: 0 }));
  for (const h of horas) faixas.find((x) => x.id === faixaDoTempo(h))!.n++;
  // o período anterior, do mesmo tamanho, terminando na véspera do começo deste
  const dias = diasEntre(p.de, p.ate) + 1;
  const antAte = somarDias(p.de, -1); const antDe = somarDias(antAte, -(dias - 1));
  const anteriores = p.base.filter((c) => { const d = p.diaFechou(c); return !!d && d >= antDe && d <= antAte; })
    .map((c) => horasAteFechar(c, p.ctx)).filter((h): h is number => h !== null);
  let separado: RelogioChamados['separado'] = null;
  if (f.separar) {
    const chaves = valoresPara(p, f.separar);
    const grupos = new Map<string, number[]>();
    for (const { c, h } of comHora) for (const v of new Set(chaves(c))) grupos.set(v, [...(grupos.get(v) ?? []), h]);
    const nome = f.separar === 'responsavel' ? 'Responsável' : p.campos[f.separar]?.name ?? f.separar;
    const vazio = f.separar === 'responsavel' ? 'Sem responsável' : 'Não preenchido';
    separado = {
      por: f.separar, nome,
      linhas: [...grupos.entries()]
        .map(([valor, hs]) => ({ valor, rotulo: valor === VAZIO ? vazio : valor, n: hs.length, mediana: mediana(hs)!, p90: percentil(hs, 0.9)! }))
        .sort((a, b) => (a.valor === VAZIO ? 1 : b.valor === VAZIO ? -1 : b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))),
    };
  }
  return {
    n: horas.length, estimados: fechadosNoPeriodo.length - horas.length,
    mediana: mediana(horas), p90: percentil(horas, 0.9),
    anterior: { de: antDe, ate: antAte, n: anteriores.length, mediana: mediana(anteriores) },
    faixas, separado,
  };
}

function escada(p: Preparo): EscadaChamados {
  const achouNiveis = p.ctx.etapas.some((e) => !e.archived && nivelDaEtapa(e.title));
  const fechadosNoPeriodo = p.base.filter((c) => p.dentro(p.diaFechou(c)));
  let direto = 0, n1 = 0, n2 = 0, n3 = 0, semHistorico = 0;
  const tempos: Record<1 | 2 | 3, number[]> = { 1: [], 2: [], 3: [] };
  for (const c of fechadosNoPeriodo) {
    const cam = caminhoDoChamado(c, p.ctx);
    if (!cam.completo) { semHistorico++; continue; }
    if (cam.nivel === 0) direto++; else if (cam.nivel === 1) n1++; else if (cam.nivel === 2) n2++; else n3++;
    const h = horasAteFechar(c, p.ctx);
    if (h !== null) tempos[cam.nivel === 0 ? 1 : cam.nivel].push(h);
  }
  // reabertos: voltaram de uma etapa que fecha durante o período (estejam fechados ou não agora)
  const reabertos = p.base.filter((c) => caminhoDoChamado(c, p.ctx).reabertoEm.some((at) => p.dentro(diaEmBrasilia(at)))).length;
  return {
    achouNiveis, n: direto + n1 + n2 + n3, semHistorico, direto, n1, n2, n3,
    medianas: { n1: mediana(tempos[1]), n2: mediana(tempos[2]), n3: mediana(tempos[3]) },
    reabertos,
  };
}

function calor(p: Preparo): CalorChamados {
  const celulas = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);
  let n = 0, fora = 0;
  for (const c of p.base) {
    const dia = diaEmBrasilia(c.createdAt);
    if (!p.dentro(dia)) continue;
    const dow = diaDaSemana(dia); const h = horaEmBrasilia(c.createdAt);
    celulas[dow]![h]!++; n++;
    if (foraDoComercial(dow, h)) fora++;
  }
  const ocorrencias = new Array(7).fill(0) as number[];
  for (let d = p.de; d <= p.ate; d = somarDias(d, 1)) ocorrencias[diaDaSemana(d)]!++;
  let pico: CalorChamados['pico'] = null;
  celulas.forEach((linha, dia) => linha.forEach((v, hora) => { if (v > 0 && (!pico || v > pico.n)) pico = { dia, hora, n: v, media: v / Math.max(1, ocorrencias[dia]!) }; }));
  return {
    n, celulas, ocorrencias,
    porDia: celulas.map((l) => l.reduce((a, b) => a + b, 0)),
    porHora: Array.from({ length: 24 }, (_, h) => celulas.reduce((a, l) => a + l[h]!, 0)),
    pico, foraDoHorario: fora,
  };
}

/** As colunas da Entrada × saída: semanas (segunda a domingo) ou meses que cobrem o período. */
function baldesDaFila(de: string, ate: string, hoje: string): Array<{ id: string; rotulo: string; de: string; ate: string; parcial: boolean }> {
  const out: Array<{ id: string; rotulo: string; de: string; ate: string; parcial: boolean }> = [];
  if (diasEntre(de, ate) + 1 <= LIMITE_SEMANAS) {
    for (let s = inicioDaSemana(de); s <= ate; s = somarDias(s, 7)) {
      const fim = somarDias(s, 6);
      out.push({ id: s, rotulo: diaCurto(s), de: s, ate: fim, parcial: s < de || fim > ate || fim > hoje });
    }
  } else {
    for (let m = de.slice(0, 7); m <= ate.slice(0, 7); m = somarMeses(m, 1)) {
      const ini = `${m}-01`; const fim = fimDoMes(m);
      out.push({ id: m, rotulo: mesCurto(m), de: ini, ate: fim, parcial: ini < de || fim > ate || fim > hoje });
    }
  }
  return out;
}

function fila(p: Preparo): FilaChamados {
  const baldes = baldesDaFila(p.de, p.ate, p.hoje);
  const por = baldes[0] && baldes[0].id.length === 7 ? 'mes' : 'semana';
  const abriu = p.base.map((c) => diaEmBrasilia(c.createdAt));
  const fechou = p.base.map((c) => p.diaFechou(c));
  const pontos: PontoFila[] = baldes.map((b) => {
    // só o que está dentro do período conta (a primeira e a última semana podem estar pela metade)
    const de = b.de < p.de ? p.de : b.de; const ate = b.ate > p.ate ? p.ate : b.ate;
    let entrou = 0, saiu = 0, naFila = 0;
    const fimFila = ate > p.hoje ? p.hoje : ate;
    for (let i = 0; i < p.base.length; i++) {
      const a = abriu[i]!; const fch = fechou[i];
      if (a >= de && a <= ate) entrou++;
      if (fch && fch >= de && fch <= ate) saiu++;
      // a fila no fim do balde: já tinha chegado e ainda não tinha fechado (pelo que sabemos hoje)
      if (a <= fimFila && !(fch && fch <= fimFila)) naFila++;
    }
    return { id: b.id, rotulo: b.rotulo, de: b.de, ate: b.ate, entrou, saiu, fila: naFila, parcial: b.parcial };
  });
  const recentes = pontos.slice(-(por === 'mes' ? 3 : 4));
  const fechadosNoPeriodo = p.base.filter((c) => p.dentro(p.diaFechou(c)));
  return {
    por, pontos,
    entrou: p.base.filter((c) => p.dentro(diaEmBrasilia(c.createdAt))).length,
    saiu: fechadosNoPeriodo.length,
    filaHoje: p.base.filter((c) => !p.fechado(c)).length,
    saldoRecente: { n: recentes.reduce((a, x) => a + x.entrou - x.saiu, 0), pontos: recentes.length },
    estimados: fechadosNoPeriodo.filter((c) => c.closedEstimated).length,
  };
}

/** O período anterior, do mesmo tamanho, terminando na véspera do começo deste. */
function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const dias = diasEntre(de, ate) + 1;
  const antAte = somarDias(de, -1);
  return { de: somarDias(antAte, -(dias - 1)), ate: antAte };
}

/** Os assuntos de um card, com os grupos da equipe aplicados (ou não). */
function assuntosDe(p: Preparo, juntar: boolean): ((c: Chamado) => string[]) | null {
  const ca = p.campos.assunto;
  if (!ca) return null;
  const nome = juntar ? comGrupos(p.ctx.gruposAssunto) : (v: string) => v;
  return (c) => [...new Set(valoresDoCampo(c, ca.key).map(nome))];
}

function sobeDesce(p: Preparo, f: FiltrosRelatorios): SobeDesceChamados {
  const podeJuntar = !!p.ctx.gruposAssunto?.length;
  // "respeita os grupos": junta por padrão, quando a equipe montou grupos no Assunto
  const juntado = podeJuntar && !f.sobeSeparado;
  const anterior = periodoAnterior(p.de, p.ate);
  const ca = p.campos.assunto;
  const vazio: SobeDesceChamados = { assunto: ca && { key: ca.key, name: ca.name }, anterior, agora: 0, antes: 0, subiram: [], cairam: [], novos: 0, podeJuntar, juntado };
  const chave = assuntosDe(p, juntado);
  if (!chave) return vazio;
  const noPeriodo = (de: string, ate: string) => p.base.filter((c) => { const d = diaEmBrasilia(c.createdAt); return d >= de && d <= ate && chave(c).length > 0; });
  const ag = noPeriodo(p.de, p.ate); const an = noPeriodo(anterior.de, anterior.ate);
  const cAgora = contarValores(ag, chave); const cAntes = contarValores(an, chave);
  const itens = [...new Set([...cAgora.keys(), ...cAntes.keys()])].map((rotulo) => {
    const agora = cAgora.get(rotulo) ?? 0; const antes = cAntes.get(rotulo) ?? 0;
    return { rotulo, agora, antes, delta: agora - antes };
  });
  return {
    ...vazio, agora: ag.length, antes: an.length,
    subiram: itens.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta || b.agora - a.agora || a.rotulo.localeCompare(b.rotulo, 'pt-BR')).slice(0, 8),
    cairam: itens.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta || b.antes - a.antes || a.rotulo.localeCompare(b.rotulo, 'pt-BR')).slice(0, 8),
    novos: itens.filter((x) => x.antes === 0 && x.agora > 0).length,
  };
}

function idadeDaFila(p: Preparo, link: (c: Chamado) => string): IdadeDaFila {
  const agora = p.ctx.agora.getTime();
  const abertos = p.base.filter((c) => !p.fechado(c)).map((c) => ({ c, dias: Math.max(0, (agora - Date.parse(c.createdAt)) / DIA) }));
  const faixas = FAIXAS_IDADE.map((f) => ({ id: f.id, rotulo: f.rotulo, n: 0 }));
  const porEtapa = new Map<string, { id: string; titulo: string; n: number; faixas: number[] }>();
  for (const { c, dias } of abertos) {
    const i = FAIXAS_IDADE.findIndex((f) => dias < f.ate);
    faixas[i]!.n++;
    const id = c.stepId ?? VAZIO;
    const e = porEtapa.get(id) ?? { id, titulo: p.ctx.etapas.find((x) => x.id === id)?.title ?? c.stepTitle ?? 'Sem etapa', n: 0, faixas: new Array(FAIXAS_IDADE.length).fill(0) as number[] };
    e.n++; e.faixas[i]!++;
    porEtapa.set(id, e);
  }
  const posicao = (id: string) => p.ctx.etapas.find((e) => e.id === id)?.position ?? 999;
  const velho = abertos.reduce<(typeof abertos)[number] | null>((m, x) => (!m || x.dias > m.dias ? x : m), null);
  return {
    n: abertos.length,
    maisDe7: abertos.filter((x) => x.dias >= 7).length,
    mediana: mediana(abertos.map((x) => x.dias)),
    maisAntigo: velho ? { key: velho.c.key, title: velho.c.title, link: link(velho.c), dias: velho.dias } : null,
    faixas,
    porEtapa: [...porEtapa.values()].sort((a, b) => posicao(a.id) - posicao(b.id)),
  };
}

/**
 * Dia fora da curva: bem acima do normal para aquele dia da semana. Normal = a mediana do mesmo dia
 * da semana nas 8 semanas anteriores (segunda com segunda). Fora da curva = pelo menos 5 chamados,
 * o dobro do normal e 5 a mais que ele (num dia normal de 9, só a partir de 18).
 */
function foraDaCurva(p: Preparo): ForaDaCurva {
  const porDia = new Map<string, Chamado[]>();
  let primeiro: string | null = null;
  for (const c of p.base) {
    const d = diaEmBrasilia(c.createdAt);
    porDia.set(d, [...(porDia.get(d) ?? []), c]);
    if (!primeiro || d < primeiro) primeiro = d;
  }
  const n = (d: string) => porDia.get(d)?.length ?? 0;
  const assuntos = assuntosDe(p, !!p.ctx.gruposAssunto?.length);
  const cc = p.campos.cliente;
  const ultimo = p.ate > p.hoje ? p.hoje : p.ate;
  const pontos: ForaDaCurva['pontos'] = [];
  const picos: DiaForaDaCurva[] = [];
  for (let d = p.de; d <= ultimo; d = somarDias(d, 1)) {
    const base: number[] = [];
    for (let k = 1; k <= 8; k++) { const x = somarDias(d, -7 * k); if (primeiro && x >= primeiro) base.push(n(x)); }
    const normal = Math.round(mediana(base) ?? 0);
    const v = n(d);
    const pico = v >= Math.max(5, normal * 2, normal + 5);
    pontos.push({ id: d, rotulo: diaCurto(d), n: v, normal, pico });
    if (pico) {
      const doDia = porDia.get(d) ?? [];
      const top = (chave: ((c: Chamado) => string[]) | null) => {
        if (!chave) return null;
        const [rotulo, k] = maiores(contarValores(doDia, chave), 1)[0] ?? [];
        return rotulo ? { rotulo, n: k! } : null;
      };
      picos.push({ dia: d, n: v, normal, assunto: top(assuntos), cliente: top(cc ? (c) => valoresDoCampo(c, cc.key) : null) });
    }
  }
  return { pontos: diasEntre(p.de, p.ate) + 1 <= 92 ? pontos : [], picos: picos.reverse().slice(0, 30) };
}

/** A ligação de cada opção do Cliente do card com o cadastro (quando o cadastro veio no contexto). */
function ligacoesDoContexto(p: Preparo): Record<string, Ligacao> | null {
  const cc = p.campos.cliente;
  if (!cc || !p.ctx.cadastro) return null;
  return ligarClientes([...contagemDoCampo(p.base, p.ctx.campos, cc.key).keys()], p.ctx.cadastro, p.ctx.ajustes.clientes);
}

function tamanhoDoCliente(p: Preparo): TamanhoDoCliente {
  const lig = ligacoesDoContexto(p);
  const cc = p.campos.cliente;
  if (!lig || !cc || !p.ctx.tamanhos) return { disponivel: false, linhas: [], semLigacao: 0 };
  const porCliente = new Map<string, number>();
  let semLigacao = 0;
  for (const c of p.base) {
    if (!p.dentro(diaEmBrasilia(c.createdAt))) continue;
    const ids = new Set(valoresDoCampo(c, cc.key).map((v) => lig[v]?.clienteId).filter((x): x is string => !!x));
    if (!ids.size) { semLigacao++; continue; }
    for (const id of ids) porCliente.set(id, (porCliente.get(id) ?? 0) + 1);
  }
  const por10 = (n: number, de: number) => (de > 0 ? Math.round((n / de) * 100) / 10 : null);
  const linhas = [...porCliente.entries()].map(([clienteId, n]) => {
    const t = p.ctx.tamanhos!.get(clienteId);
    const dids = t?.dids ?? 0; const aparelhos = t?.aparelhos ?? 0;
    return { clienteId, nome: t?.nome ?? '?', n, dids, aparelhos, porDids: por10(n, dids), porAparelhos: por10(n, aparelhos) };
  }).sort((a, b) => (b.porDids ?? -1) - (a.porDids ?? -1) || b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { disponivel: true, linhas, semLigacao };
}

function falha(p: Preparo): FalhaChamados {
  const ct = p.campos.tipo;
  const zero = (): ContagemCausas => ({ total: 0, porCausa: { nossa: 0, cliente: 0, operadora: 0, pedido: 0 }, semTipo: 0 });
  const mesFim = p.ate.slice(0, 7);
  const meses = Array.from({ length: 6 }, (_, i) => somarMeses(mesFim, i - 5)).map((m) => ({ id: m, rotulo: mesCurto(m), ...zero() }));
  const periodo = zero();
  const contagem = new Map<string, number>();
  if (!ct) return { tipo: null, meses, periodo, tipos: [] };
  const somar = (x: ContagemCausas, tipos: string[]) => {
    x.total++;
    if (!tipos.length) { x.semTipo++; return; }
    // um card conta uma vez: com mais de um tipo, vale o primeiro
    x.porCausa[causaDe(tipos[0]!, p.ctx.ajustes)]++;
  };
  for (const c of p.base) {
    const dia = diaEmBrasilia(c.createdAt);
    const tipos = valoresDoCampo(c, ct.key);
    const m = meses.find((x) => x.id === dia.slice(0, 7));
    if (m) somar(m, tipos);
    if (p.dentro(dia)) { somar(periodo, tipos); for (const t of new Set(tipos)) contagem.set(t, (contagem.get(t) ?? 0) + 1); }
  }
  for (const o of ct.options) if (!contagem.has(o)) contagem.set(o, 0);
  const tipos = [...contagem.entries()]
    .map(([tipo, n]) => ({ tipo, n, causa: causaDe(tipo, p.ctx.ajustes), escolhida: !!p.ctx.ajustes.causas?.[tipo] }))
    .sort((a, b) => CAUSAS.indexOf(a.causa) - CAUSAS.indexOf(b.causa) || b.n - a.n || a.tipo.localeCompare(b.tipo, 'pt-BR'));
  return { tipo: { key: ct.key, name: ct.name }, meses, periodo, tipos };
}

function reincidencia(p: Preparo, f: FiltrosRelatorios, link: (c: Chamado) => string): ReincidenciaChamados {
  const cc = p.campos.cliente; const ca = p.campos.assunto;
  const podeJuntar = !!p.ctx.gruposAssunto?.length;
  const juntado = podeJuntar && f.juntarAssuntos;
  const vazio: ReincidenciaChamados = {
    cliente: cc && { key: cc.key, name: cc.name }, assunto: ca && { key: ca.key, name: ca.name },
    total: 0, semCampo: 0, pares: 0, chamados: 0, linhas: [], podeJuntar, juntado,
  };
  if (!cc || !ca) return vazio;
  const nomeAssunto = juntado ? comGrupos(p.ctx.gruposAssunto) : (v: string) => v;
  const abertos = p.base.filter((c) => p.dentro(diaEmBrasilia(c.createdAt)));
  const pares = new Map<string, { cliente: string; assunto: string; cards: Chamado[] }>();
  let total = 0, semCampo = 0;
  for (const c of abertos) {
    const clientes = valoresDoCampo(c, cc.key); const assuntos = [...new Set(valoresDoCampo(c, ca.key).map(nomeAssunto))];
    if (!clientes.length || !assuntos.length) { semCampo++; continue; }
    total++;
    for (const cl of clientes) for (const as of assuntos) {
      const k = `${cl}\u0000${as}`;
      const x = pares.get(k) ?? { cliente: cl, assunto: as, cards: [] };
      x.cards.push(c); pares.set(k, x);
    }
  }
  const linhas: LinhaReincidencia[] = [];
  for (const x of pares.values()) {
    if (x.cards.length < 2) continue;
    const ord = [...x.cards].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let menor = Infinity;
    for (let i = 1; i < ord.length; i++) menor = Math.min(menor, diasEntre(diaEmBrasilia(ord[i - 1]!.createdAt), diaEmBrasilia(ord[i]!.createdAt)));
    // reincidência é voltar em até 30 dias; dois chamados com 80 dias de distância não contam
    if (menor > 30) continue;
    linhas.push({ cliente: x.cliente, assunto: x.assunto, n: ord.length, menorIntervalo: menor, ultimo: ord[ord.length - 1]!.createdAt, chamados: ord.map((c) => curto(c, p.ctx, link)) });
  }
  linhas.sort((a, b) => b.n - a.n || b.ultimo.localeCompare(a.ultimo));
  const ids = new Set(linhas.flatMap((l) => l.chamados.map((c) => c.id)));
  return { ...vazio, total, semCampo, pares: linhas.length, chamados: ids.size, linhas: linhas.slice(0, 100) };
}

function equipe(p: Preparo): EquipeChamados {
  const semanaAtual = inicioDaSemana(p.hoje);
  const semanas = Array.from({ length: 8 }, (_, i) => somarDias(semanaAtual, -7 * (7 - i)));
  const limite = p.ctx.agora.getTime() - 7 * DIA;
  const porNome = new Map<string, LinhaEquipe & { horas: number[] }>();
  const linha = (nome: string | null) => {
    const k = nome ?? VAZIO;
    let l = porNome.get(k);
    if (!l) { l = { nome, emAberto: 0, parados: 0, vencidos: 0, fechados: 0, mediana: null, tendencia: new Array(8).fill(0) as number[], horas: [] }; porNome.set(k, l); }
    return l;
  };
  for (const c of p.base) {
    const fch = p.diaFechou(c);
    if (!p.fechado(c)) {
      const l = linha(c.responsavel);
      l.emAberto++;
      if (Date.parse(c.updatedAt) < limite) l.parados++;
      if (c.isOverdue) l.vencidos++;
      continue;
    }
    if (fch && p.dentro(fch)) {
      const l = linha(c.responsavel);
      l.fechados++;
      const h = horasAteFechar(c, p.ctx);
      if (h !== null) l.horas.push(h);
    }
    if (fch && fch >= semanas[0]!) {
      const i = Math.floor(diasEntre(semanas[0]!, fch) / 7);
      if (i >= 0 && i < 8) linha(c.responsavel).tendencia[i]!++;
    }
  }
  const linhas = [...porNome.values()]
    .map(({ horas, ...l }) => ({ ...l, mediana: mediana(horas) }))
    // em ordem de nome, não de quem fechou mais: é para equilibrar a carga, não para ranquear
    .sort((a, b) => (a.nome === null ? 1 : b.nome === null ? -1 : a.nome.localeCompare(b.nome, 'pt-BR')));
  const todasHoras = [...porNome.values()].flatMap((l) => l.horas);
  return {
    semanas: semanas.map(diaCurto),
    linhas,
    totais: {
      emAberto: linhas.reduce((a, l) => a + l.emAberto, 0), parados: linhas.reduce((a, l) => a + l.parados, 0),
      vencidos: linhas.reduce((a, l) => a + l.vencidos, 0), fechados: linhas.reduce((a, l) => a + l.fechados, 0),
      mediana: mediana(todasHoras),
    },
  };
}

/** O mês do Fechamento: o escolhido, ou o mês passado. */
export function mesDoFechamento(f: Pick<FiltrosRelatorios, 'mes'>, agora: Date): string {
  const atual = diaEmBrasilia(agora).slice(0, 7);
  return f.mes && f.mes <= atual ? f.mes : somarMeses(atual, -1);
}

function fechamentoDoMes(p: Preparo, f: FiltrosRelatorios): MesChamados {
  const mes = mesDoFechamento(f, p.ctx.agora);
  const anterior = somarMeses(mes, -1);
  const atual = p.hoje.slice(0, 7);
  const parcial = mes === atual;
  const noMes = (dia: string | null, m: string) => !!dia && dia.slice(0, 7) === m;
  const abertos = (m: string) => p.base.filter((c) => noMes(diaEmBrasilia(c.createdAt), m));
  const fechados = (m: string) => p.base.filter((c) => noMes(p.diaFechou(c), m));
  const filaNoFim = (m: string) => {
    const fim = m === atual ? p.hoje : fimDoMes(m);
    return p.base.filter((c) => { const a = diaEmBrasilia(c.createdAt); const fc = p.diaFechou(c); return a <= fim && !(fc && fc <= fim); }).length;
  };
  const horas = (xs: Chamado[]) => xs.map((c) => horasAteFechar(c, p.ctx)).filter((h): h is number => h !== null);
  const ab = abertos(mes); const abAntes = abertos(anterior);
  const fe = fechados(mes); const feAntes = fechados(anterior);

  // por dia do mês (até hoje, se o mês está correndo)
  const ultimo = parcial ? p.hoje : fimDoMes(mes);
  const contaDia = new Map<string, number>();
  for (const c of ab) { const d = diaEmBrasilia(c.createdAt); contaDia.set(d, (contaDia.get(d) ?? 0) + 1); }
  const porDia: MesChamados['porDia'] = [];
  for (let d = `${mes}-01`; d <= ultimo; d = somarDias(d, 1)) porDia.push({ id: d, rotulo: d.slice(8, 10), n: contaDia.get(d) ?? 0, destaque: d === p.hoje });

  const comparar = (campo: CampoChamado | null, n: number, nome?: (v: string) => string): ItemComparado[] => {
    if (!campo) return [];
    const chave = (c: Chamado) => valoresDoCampo(c, campo.key).map(nome ?? ((v) => v));
    const agora = contarValores(ab, chave); const antes = contarValores(abAntes, chave);
    return maiores(agora, n).map(([rotulo, k]) => ({ rotulo, n: k, antes: antes.get(rotulo) ?? 0 }));
  };
  const juntouAssuntos = !!p.ctx.gruposAssunto?.length;
  const nomeAssunto = comGrupos(p.ctx.gruposAssunto);
  const assuntos = comparar(p.campos.assunto, 5, nomeAssunto);
  const clientes = comparar(p.campos.cliente, 5);
  const tipos = comparar(p.campos.tipo, 6);

  // ---- os destaques, escritos
  const destaques: string[] = [];
  const nomeAnt = MESES[Number(anterior.slice(5, 7)) - 1]!;
  if (p.campos.assunto && ab.length) {
    const chave = (c: Chamado) => valoresDoCampo(c, p.campos.assunto!.key).map(nomeAssunto);
    const agora = contarValores(ab, chave); const antes = contarValores(abAntes, chave);
    const subidas = [...agora.entries()].map(([v, n]) => ({ v, n, antes: antes.get(v) ?? 0 })).filter((x) => x.n - x.antes >= 3)
      .sort((a, b) => b.n - b.antes - (a.n - a.antes) || b.n - a.n);
    const s = subidas[0];
    if (s && abAntes.length) destaques.push(`${s.v} subiu de ${nf(s.antes)} para ${nf(s.n)} chamados em relação a ${nomeAnt}.`);
    else { const [v, n] = maiores(agora, 1)[0] ?? []; if (v) destaques.push(`${v} foi o assunto mais pedido: ${nf(n!)} chamados (${Math.round((n! / ab.length) * 100)}% do mês).`); }
  }
  const topCliente = clientes[0];
  if (topCliente) destaques.push(`${topCliente.rotulo} foi o cliente que mais abriu chamados: ${nf(topCliente.n)}${abAntes.length ? ` (eram ${nf(topCliente.antes)} em ${nomeAnt})` : ''}.`);
  const maiorDia = [...porDia].sort((a, b) => b.n - a.n)[0];
  if (maiorDia && maiorDia.n > 0) {
    const doDia = ab.filter((c) => diaEmBrasilia(c.createdAt) === maiorDia.id);
    let resto = '';
    if (p.campos.assunto) {
      const [v, n] = maiores(contarValores(doDia, (c) => valoresDoCampo(c, p.campos.assunto!.key).map(nomeAssunto)), 1)[0] ?? [];
      if (v && n! >= 3 && n! / doDia.length >= 0.4) resto = `, ${nf(n!)} deles de ${v}`;
    }
    destaques.push(`O dia mais cheio foi ${DIAS_CURTOS[diaDaSemana(maiorDia.id)]}, ${diaCurto(maiorDia.id)}, com ${nf(maiorDia.n)} chamados${resto}.`);
  }

  return {
    mes, nome: nomeDoMes(mes), anterior, nomeAnterior: nomeDoMes(anterior), parcial,
    abertos: { n: ab.length, antes: abAntes.length },
    fechados: { n: fe.length, antes: feAntes.length },
    mediana: { h: mediana(horas(fe)), antes: mediana(horas(feAntes)) },
    filaNoFim: { n: filaNoFim(mes), antes: filaNoFim(anterior) },
    porDia, assuntos, juntouAssuntos, clientes, tipos, destaques,
  };
}

// ---------- os 7 que completaram as sugestões (04/10) ----------

/** As passagens de um card pelas etapas: de quando entrou até quando saiu (só as de começo exato). */
function passagensDe(c: Chamado, ctx: Pick<ContextoRelatorios, 'historico'>): Array<{ etapa: string; de: string; ate: string }> {
  const movs = ctx.historico.get(c.id) ?? [];
  const out: Array<{ etapa: string; de: string; ate: string }> = [];
  for (let i = 0; i + 1 < movs.length; i++) {
    const m = movs[i]!; const prox = movs[i + 1]!;
    if (m.estimated || !m.toStepId) continue;
    out.push({ etapa: m.toStepId, de: m.at, ate: prox.at });
  }
  return out;
}

function gargalo(p: Preparo): GargaloChamados {
  const fecha = new Set(p.ctx.etapas.filter((e) => e.isFinal).map((e) => e.id));
  const horas = new Map<string, number[]>();
  for (const c of p.base) {
    for (const ps of passagensDe(c, p.ctx)) {
      if (fecha.has(ps.etapa) || !p.dentro(diaEmBrasilia(ps.ate))) continue;
      horas.set(ps.etapa, [...(horas.get(ps.etapa) ?? []), Math.max(0, (Date.parse(ps.ate) - Date.parse(ps.de)) / HORA)]);
    }
  }
  const agora = new Map<string, number>();
  for (const c of p.base) if (!p.fechado(c) && c.stepId) agora.set(c.stepId, (agora.get(c.stepId) ?? 0) + 1);
  const etapas = p.ctx.etapas.filter((e) => !e.archived && !e.isFinal).sort((a, b) => a.position - b.position)
    .map((e) => { const hs = horas.get(e.id) ?? []; return { id: e.id, titulo: e.title, n: hs.length, mediana: mediana(hs), p90: percentil(hs, 0.9), agora: agora.get(e.id) ?? 0 }; })
    .filter((e) => e.n > 0 || e.agora > 0);
  const candidatas = etapas.filter((e) => e.n >= 3 && e.mediana != null);
  const lenta = candidatas.reduce<EtapaParada | null>((m, e) => (!m || e.mediana! > m.mediana! ? e : m), null);
  return { etapas, maisLenta: lenta?.id ?? null };
}

/** Fechou até o dia do vencimento (no horário de Brasília)? */
const noPrazo = (c: Chamado) => !!c.closedAt && !!c.dueDate && diaEmBrasilia(c.closedAt) <= diaEmBrasilia(c.dueDate);

function prazo(p: Preparo): PrazoChamados {
  const fechadosExatos = (de: string, ate: string) => p.base.filter((c) => { const d = p.diaFechou(c); return !!d && d >= de && d <= ate && !c.closedEstimated; });
  const ag = fechadosExatos(p.de, p.ate);
  const comPrazo = ag.filter((c) => c.dueDate);
  const dentro = comPrazo.filter(noPrazo).length;
  const ant = periodoAnterior(p.de, p.ate);
  const anComPrazo = fechadosExatos(ant.de, ant.ate).filter((c) => c.dueDate);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  const ct = p.campos.tipo;
  const porTipo = new Map<string, { n: number; dentro: number }>();
  if (ct) for (const c of comPrazo) for (const v of new Set(valoresDoCampo(c, ct.key).length ? valoresDoCampo(c, ct.key) : ['Não preenchido'])) {
    const x = porTipo.get(v) ?? { n: 0, dentro: 0 }; x.n++; if (noPrazo(c)) x.dentro++; porTipo.set(v, x);
  }
  return {
    comPrazo: comPrazo.length, dentro, fora: comPrazo.length - dentro, semPrazo: ag.length - comPrazo.length,
    pct: pct(dentro, comPrazo.length),
    anterior: { comPrazo: anComPrazo.length, pct: pct(anComPrazo.filter(noPrazo).length, anComPrazo.length) },
    vencidosAgora: p.base.filter((c) => !p.fechado(c) && c.isOverdue).length,
    porTipo: [...porTipo.entries()].map(([rotulo, x]) => ({ rotulo, n: x.n, dentro: x.dentro, pct: Math.round((x.dentro / x.n) * 100) }))
      .sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
  };
}

/**
 * A primeira resposta de um card: da abertura até sair da etapa inicial. Nasceu já em outra etapa =
 * pego na hora (0). null = ainda não saiu, ou não sabemos o caminho (aberto antes do histórico).
 */
function respostaDe(c: Chamado, ctx: Pick<ContextoRelatorios, 'historico'>, inicial: string): { completo: boolean; horas: number | null } {
  const movs = ctx.historico.get(c.id) ?? [];
  const m0 = movs[0];
  if (!m0 || m0.fromStepId !== null || m0.estimated) return { completo: false, horas: null };
  if (m0.toStepId !== inicial) return { completo: true, horas: 0 };
  const saida = movs.find((m) => m.fromStepId === inicial);
  return { completo: true, horas: saida ? Math.max(0, (Date.parse(saida.at) - Date.parse(c.createdAt)) / HORA) : null };
}
const chegouNoComercial = (c: Chamado) => { const d = diaEmBrasilia(c.createdAt); return !foraDoComercial(diaDaSemana(d), horaEmBrasilia(c.createdAt)); };

function primeira(p: Preparo, link: (c: Chamado) => string): PrimeiraResposta {
  const ini = p.ctx.etapas.find((e) => e.isInitial && !e.archived);
  const faixas = FAIXAS_RESPOSTA.map((f) => ({ id: f.id, rotulo: f.rotulo, n: 0 }));
  const vazio: PrimeiraResposta = { inicial: null, n: 0, mediana: null, p90: null, ate1h: 0, faixas, fora: { n: 0, mediana: null }, esperando: 0, maisAntigoEsperando: null, semHistorico: 0 };
  if (!ini) return vazio;
  const dentro: number[] = []; const fora: number[] = []; let semHistorico = 0;
  for (const c of p.base) {
    if (!p.dentro(diaEmBrasilia(c.createdAt))) continue;
    const r = respostaDe(c, p.ctx, ini.id);
    if (!r.completo) { semHistorico++; continue; }
    if (r.horas === null) continue;
    if (chegouNoComercial(c)) { dentro.push(r.horas); faixas.find((f) => f.id === faixaDaResposta(r.horas!))!.n++; } else fora.push(r.horas);
  }
  const esperando = p.base.filter((c) => !p.fechado(c) && c.stepId === ini.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const velho = esperando[0];
  return {
    inicial: { id: ini.id, titulo: ini.title },
    n: dentro.length, mediana: mediana(dentro), p90: percentil(dentro, 0.9), ate1h: dentro.filter((h) => h <= 1).length,
    faixas, fora: { n: fora.length, mediana: mediana(fora) },
    esperando: esperando.length,
    maisAntigoEsperando: velho ? { key: velho.key, title: velho.title, link: link(velho), horas: Math.max(0, (p.ctx.agora.getTime() - Date.parse(velho.createdAt)) / HORA) } : null,
    semHistorico,
  };
}

const NIVEIS_PRIORIDADE: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };
/** As etiquetas de prioridade do painel ("P/ Crítica", "P/ Alta"…), com o nível de cada uma (0 = a mais alta). */
function etiquetasDePrioridade(ctx: Pick<ContextoChamados, 'etiquetas'>): Map<string, { nivel: number; rotulo: string; cor: string | null }> {
  const m = new Map<string, { nivel: number; rotulo: string; cor: string | null }>();
  for (const t of ctx.etiquetas) {
    if (t.archived) continue;
    const r = /^p\s*\/\s*(critica|alta|media|baixa)\b/.exec(paraBusca(t.name));
    if (r) m.set(t.id, { nivel: NIVEIS_PRIORIDADE[r[1]!]!, rotulo: t.name, cor: t.color });
  }
  return m;
}
/** O nível de prioridade de um card: o mais alto entre as etiquetas dele (null = sem prioridade). */
function nivelDoCard(c: Chamado, tags: Map<string, { nivel: number }>): number | null {
  let n: number | null = null;
  for (const id of c.tagIds) { const t = tags.get(id); if (t && (n === null || t.nivel < n)) n = t.nivel; }
  return n;
}

function prioridade(p: Preparo): PrioridadeChamados {
  const tags = etiquetasDePrioridade(p.ctx);
  const porNivel = new Map<number, { rotulo: string; cor: string | null }>();
  for (const t of tags.values()) if (!porNivel.has(t.nivel)) porNivel.set(t.nivel, { rotulo: t.rotulo, cor: t.cor });
  const fechados = p.base.filter((c) => p.dentro(p.diaFechou(c)));
  const horas = new Map<number, number[]>(); const nFechados = new Map<number, number>(); const abertos = new Map<number, number>();
  for (const c of fechados) {
    const n = nivelDoCard(c, tags) ?? 9;
    nFechados.set(n, (nFechados.get(n) ?? 0) + 1);
    const h = horasAteFechar(c, p.ctx); if (h !== null) horas.set(n, [...(horas.get(n) ?? []), h]);
  }
  for (const c of p.base) if (!p.fechado(c)) { const n = nivelDoCard(c, tags) ?? 9; abertos.set(n, (abertos.get(n) ?? 0) + 1); }
  const linhas: LinhaPrioridade[] = [...[...porNivel.keys()].sort(), 9].map((n) => ({
    id: n === 9 ? 'sem' : `n${n}`, rotulo: n === 9 ? 'Sem prioridade' : porNivel.get(n)!.rotulo, cor: n === 9 ? null : porNivel.get(n)!.cor, nivel: n,
    fechados: nFechados.get(n) ?? 0, mediana: mediana(horas.get(n) ?? []), abertos: abertos.get(n) ?? 0,
  }));
  const comDado = linhas.filter((l) => l.nivel < 9 && (horas.get(l.nivel)?.length ?? 0) >= 3);
  const invertidas: PrioridadeChamados['invertidas'] = [];
  for (let i = 0; i + 1 < comDado.length; i++) {
    const a = comDado[i]!; const b = comDado[i + 1]!;
    if (a.mediana! > b.mediana!) invertidas.push({ mais: a.rotulo, menos: b.rotulo });
  }
  return { temEtiquetas: tags.size > 0, linhas, invertidas, semPrioridadePct: fechados.length ? Math.round(((nFechados.get(9) ?? 0) / fechados.length) * 100) : 0 };
}

/** Os valores de um card no campo do 80/20 (no Assunto, com os grupos da equipe juntos). */
function chaveDoPareto(p: Preparo, por: ParetoPor): { campo: CampoChamado | null; juntado: boolean; chave: ((c: Chamado) => string[]) | null } {
  const campo = p.campos[por];
  const juntado = por === 'assunto' && !!p.ctx.gruposAssunto?.length;
  if (!campo) return { campo: null, juntado, chave: null };
  if (por === 'assunto') return { campo, juntado, chave: assuntosDe(p, juntado) };
  return { campo, juntado, chave: (c) => [...new Set(valoresDoCampo(c, campo.key))] };
}

function pareto(p: Preparo, f: FiltrosRelatorios): ParetoChamados {
  const por = f.pareto ?? 'assunto';
  const { campo, juntado, chave } = chaveDoPareto(p, por);
  if (!campo || !chave) return { por, campo: null, juntado, total: 0, itens: [], para80: 0 };
  const abertos = p.base.filter((c) => p.dentro(diaEmBrasilia(c.createdAt)));
  const contagem = maiores(contarValores(abertos, chave), Infinity);
  const total = contagem.reduce((a, [, n]) => a + n, 0);
  let acum = 0;
  const itens = contagem.map(([rotulo, n]) => { acum += n; return { rotulo, n, acumulado: total ? Math.round((acum / total) * 1000) / 10 : 0 }; });
  const i80 = itens.findIndex((x) => x.acumulado >= 80);
  return { por, campo: { key: campo.key, name: campo.name }, juntado, total, itens, para80: i80 < 0 ? itens.length : i80 + 1 };
}

/**
 * A próxima semana, dia a dia, pela média do mesmo dia da semana nas 8 semanas completas antes da
 * atual (o mínimo e o máximo delas são a faixa do normal). Não depende do período escolhido.
 */
function previsao(p: Preparo): PrevisaoChamados {
  const semanaAtual = inicioDaSemana(p.hoje);
  const proxima = somarDias(semanaAtual, 7);
  const porDia = new Map<string, number>();
  let primeiro: string | null = null;
  for (const c of p.base) { const d = diaEmBrasilia(c.createdAt); porDia.set(d, (porDia.get(d) ?? 0) + 1); if (!primeiro || d < primeiro) primeiro = d; }
  const semanas: string[] = [];
  for (let k = 1; k <= 8; k++) { const s = somarDias(semanaAtual, -7 * k); if (primeiro && s >= primeiro) semanas.push(s); }
  const n = (d: string) => porDia.get(d) ?? 0;
  const dias = Array.from({ length: 7 }, (_, dow) => {
    const vs = semanas.map((s) => n(somarDias(s, dow)));
    const dia = somarDias(proxima, dow);
    return { dia, rotulo: `${DIAS_CURTOS[dow]} ${diaCurto(dia)}`, dow, media: vs.length ? Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10 : 0, min: vs.length ? Math.min(...vs) : 0, max: vs.length ? Math.max(...vs) : 0 };
  });
  const totais = semanas.map((s) => Array.from({ length: 7 }, (_, d) => n(somarDias(s, d))).reduce((a, b) => a + b, 0));
  const hojeDow = diaDaSemana(p.hoje);
  let ateHoje = 0; for (let d = 0; d <= hojeDow; d++) ateHoje += n(somarDias(semanaAtual, d));
  return {
    semana: { de: proxima, ate: somarDias(proxima, 6) }, semanas: semanas.length, dias,
    total: Math.round(dias.reduce((a, d) => a + d.media, 0)),
    faixa: { min: totais.length ? Math.min(...totais) : 0, max: totais.length ? Math.max(...totais) : 0 },
    semanaAtual: { de: semanaAtual, ateHoje, esperadoAteHoje: Math.round(dias.slice(0, hojeDow + 1).reduce((a, d) => a + d.media, 0)) },
  };
}

/** Os campos que o "Card bem preenchido" confere: Cliente, Assunto, Tipo, Produto e o Resolutor. */
function camposDoPreenchimento(p: Preparo): CampoChamado[] {
  const out: CampoChamado[] = [];
  for (const c of [p.campos.cliente, p.campos.assunto, p.campos.tipo, p.campos.produto]) if (c && !out.some((x) => x.key === c.key)) out.push(c);
  for (const c of camposDeLista(p.ctx.campos)) if (paraBusca(c.name).startsWith('resol') && !out.some((x) => x.key === c.key)) out.push(c);
  return out;
}

function preenchimento(p: Preparo): PreenchimentoChamados {
  const campos = camposDoPreenchimento(p);
  const fechados = p.base.filter((c) => p.dentro(p.diaFechou(c)));
  const completo = (c: Chamado) => campos.every((k) => valoresDoCampo(c, k.key).length > 0);
  const porResp = new Map<string, { nome: string | null; n: number; completos: number }>();
  for (const c of fechados) {
    const k = c.responsavel ?? VAZIO;
    const x = porResp.get(k) ?? { nome: c.responsavel, n: 0, completos: 0 };
    x.n++; if (completo(c)) x.completos++; porResp.set(k, x);
  }
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  return {
    n: fechados.length,
    completos: fechados.filter(completo).length,
    campos: campos.map((k) => { const pr = fechados.filter((c) => valoresDoCampo(c, k.key).length > 0).length; return { key: k.key, nome: k.name, preenchidos: pr, pct: pct(pr, fechados.length) }; }),
    porResponsavel: [...porResp.values()].map((x) => ({ ...x, pct: pct(x.completos, x.n) }))
      .sort((a, b) => (a.nome === null ? 1 : b.nome === null ? -1 : a.nome.localeCompare(b.nome, 'pt-BR'))),
  };
}

/** Todos os relatórios de uma vez (são poucos milhares de chamados: a conta é rápida). */
export function relatoriosChamados(cards: Chamado[], f: FiltrosRelatorios, ctx: ContextoRelatorios, link: (c: Chamado) => string): RelatoriosChamados {
  const p = preparar(cards, f, ctx);
  const usado = (c: CampoChamado | null): CampoUsado => (c ? { key: c.key, name: c.name } : null);
  return {
    de: p.de, ate: p.ate, hoje: p.hoje, historicoDesde: ctx.historicoDesde,
    campos: { cliente: usado(p.campos.cliente), assunto: usado(p.campos.assunto), tipo: usado(p.campos.tipo), produto: usado(p.campos.produto) },
    relogio: relogio(p, f),
    escada: escada(p),
    calor: calor(p),
    fila: fila(p),
    sobeDesce: sobeDesce(p, f),
    idade: idadeDaFila(p, link),
    foraDaCurva: foraDaCurva(p),
    reincidencia: reincidencia(p, f, link),
    tamanho: tamanhoDoCliente(p),
    falha: falha(p),
    equipe: equipe(p),
    mes: fechamentoDoMes(p, f),
    gargalo: gargalo(p),
    prazo: prazo(p),
    primeira: primeira(p, link),
    prioridade: prioridade(p),
    pareto: pareto(p, f),
    previsao: previsao(p),
    preenchimento: preenchimento(p),
  };
}

// ---------- os chamados de uma peça clicada ----------

/**
 * Os chamados por trás de uma peça de um relatório, com o mesmo critério da conta (é a mesma
 * regra, escrita uma vez): uma faixa do relógio, um degrau da escada, um quadrado do mapa de calor,
 * uma coluna da entrada × saída, um número do quadro da equipe, um número do mês.
 */
export function chamadosDaPeca(cards: Chamado[], q: ChamadosDaPecaQuery, ctx: ContextoRelatorios, link: (c: Chamado) => string): { titulo: string; itens: LinhaChamado[]; total: number } {
  const p = preparar(cards, q, ctx);
  const [tipo, ...resto] = q.peca.split(':');
  const arg = resto.join(':');
  let titulo = '';
  let lista: Chamado[] = [];
  if (tipo === 'relogio') {
    const fx = FAIXAS_TEMPO.find((x) => x.id === arg);
    lista = p.base.filter((c) => p.dentro(p.diaFechou(c))).filter((c) => { const h = horasAteFechar(c, ctx); return h !== null && faixaDoTempo(h) === arg; });
    titulo = `Fecharam em ${fx?.rotulo ?? '?'}`;
  } else if (tipo === 'escada') {
    if (arg === 'reabertos') {
      lista = p.base.filter((c) => caminhoDoChamado(c, ctx).reabertoEm.some((at) => p.dentro(diaEmBrasilia(at))));
      titulo = 'Fecharam e voltaram';
    } else {
      const quer = arg === 'n1' ? [0, 1] : arg === 'n2' ? [2] : arg === 'n3' ? [3] : [];
      lista = p.base.filter((c) => p.dentro(p.diaFechou(c))).filter((c) => { const cam = caminhoDoChamado(c, ctx); return cam.completo && quer.includes(cam.nivel); });
      titulo = arg === 'n1' ? 'Fecharam sem passar do N1' : `Fecharam depois de chegar ao ${arg.toUpperCase()}`;
    }
  } else if (tipo === 'calor') {
    const [d, h] = arg.split('-').map(Number) as [number, number];
    lista = p.base.filter((c) => { const dia = diaEmBrasilia(c.createdAt); return p.dentro(dia) && diaDaSemana(dia) === d && horaEmBrasilia(c.createdAt) === h; });
    titulo = `Chegaram ${['na segunda', 'na terça', 'na quarta', 'na quinta', 'na sexta', 'no sábado', 'no domingo'][d] ?? ''}, das ${h}h às ${h + 1}h`;
  } else if (tipo === 'fila') {
    const [id, qual] = arg.split(':') as [string, string | undefined];
    if (id === 'hoje') {
      lista = p.base.filter((c) => !p.fechado(c));
      titulo = 'Na fila hoje (em aberto)';
    } else {
      const b = baldesDaFila(p.de, p.ate, p.hoje).find((x) => x.id === id);
      if (b) {
        const de = b.de < p.de ? p.de : b.de; const ate = b.ate > p.ate ? p.ate : b.ate;
        lista = qual === 'saiu'
          ? p.base.filter((c) => { const d = p.diaFechou(c); return !!d && d >= de && d <= ate; })
          : p.base.filter((c) => { const d = diaEmBrasilia(c.createdAt); return d >= de && d <= ate; });
        const quando = id.length === 7 ? `em ${nomeDoMes(id)}` : `na semana de ${diaCurto(b.de)}`;
        titulo = `${qual === 'saiu' ? 'Fecharam' : 'Chegaram'} ${quando}`;
      }
    }
  } else if (tipo === 'equipe') {
    const i = arg.indexOf(':');
    const qual = i < 0 ? arg : arg.slice(0, i);
    const nome = i < 0 ? VAZIO : arg.slice(i + 1);
    const daPessoa = (c: Chamado) => (c.responsavel ?? VAZIO) === nome;
    const limite = ctx.agora.getTime() - 7 * DIA;
    if (qual === 'fechados') lista = p.base.filter((c) => daPessoa(c) && p.dentro(p.diaFechou(c)));
    else lista = p.base.filter((c) => daPessoa(c) && !p.fechado(c) && (qual === 'abertos' || (qual === 'parados' && Date.parse(c.updatedAt) < limite) || (qual === 'vencidos' && c.isOverdue)));
    const quem = nome === VAZIO ? 'sem responsável' : nome;
    titulo = { abertos: `Em aberto — ${quem}`, parados: `Parados há 7 dias ou mais — ${quem}`, vencidos: `Vencidos — ${quem}`, fechados: `Fechados no período — ${quem}` }[qual] ?? quem;
  } else if (tipo === 'sobe') {
    const chave = assuntosDe(p, !!p.ctx.gruposAssunto?.length && !q.sobeSeparado);
    lista = chave ? p.base.filter((c) => p.dentro(diaEmBrasilia(c.createdAt)) && chave(c).includes(arg)) : [];
    titulo = `Abertos no período — ${arg}`;
  } else if (tipo === 'gargalo') {
    // "gargalo:<etapa>" (passagens que terminaram no período) ou "gargalo:<etapa>:agora" (parados nela agora)
    const [etapa, agora] = arg.split(':') as [string, string | undefined];
    const fecha = new Set(ctx.etapas.filter((e) => e.isFinal).map((e) => e.id));
    lista = agora ? p.base.filter((c) => !p.fechado(c) && c.stepId === etapa)
      : fecha.has(etapa) ? [] : p.base.filter((c) => passagensDe(c, ctx).some((ps) => ps.etapa === etapa && p.dentro(diaEmBrasilia(ps.ate))));
    const nome = ctx.etapas.find((e) => e.id === etapa)?.title ?? 'etapa';
    titulo = agora ? `Parados agora em ${nome}` : `Passaram por ${nome} (saíram no período)`;
  } else if (tipo === 'prazo') {
    const fechados = p.base.filter((c) => p.dentro(p.diaFechou(c)) && !c.closedEstimated);
    if (arg === 'dentro') { lista = fechados.filter((c) => c.dueDate && noPrazo(c)); titulo = 'Fechados até o vencimento'; }
    else if (arg === 'fora') { lista = fechados.filter((c) => c.dueDate && !noPrazo(c)); titulo = 'Fechados depois do vencimento'; }
    else if (arg === 'sem') { lista = fechados.filter((c) => !c.dueDate); titulo = 'Fechados sem vencimento'; }
    else { lista = p.base.filter((c) => !p.fechado(c) && c.isOverdue); titulo = 'Vencidos em aberto agora'; }
  } else if (tipo === 'primeira') {
    const ini = ctx.etapas.find((e) => e.isInitial && !e.archived);
    if (ini && arg === 'esperando') { lista = p.base.filter((c) => !p.fechado(c) && c.stepId === ini.id); titulo = `Esperando em ${ini.title}`; }
    else if (ini) {
      lista = p.base.filter((c) => {
        if (!p.dentro(diaEmBrasilia(c.createdAt))) return false;
        const r = respostaDe(c, ctx, ini.id);
        if (!r.completo || r.horas === null) return false;
        return arg === 'fora' ? !chegouNoComercial(c) : chegouNoComercial(c) && faixaDaResposta(r.horas) === arg;
      });
      titulo = arg === 'fora' ? 'Chegaram fora do horário comercial' : `Pegos em ${FAIXAS_RESPOSTA.find((f) => f.id === arg)?.rotulo ?? '?'}`;
    }
  } else if (tipo === 'prioridade') {
    // "prioridade:n1:fechados" ou "prioridade:sem:abertos"
    const [nivel, qual] = arg.split(':') as [string, string];
    const tags = etiquetasDePrioridade(ctx);
    const quer = nivel === 'sem' ? 9 : Number(nivel.slice(1));
    const doNivel = (c: Chamado) => (nivelDoCard(c, tags) ?? 9) === quer;
    lista = qual === 'abertos' ? p.base.filter((c) => !p.fechado(c) && doNivel(c)) : p.base.filter((c) => p.dentro(p.diaFechou(c)) && doNivel(c));
    const rotulo = quer === 9 ? 'Sem prioridade' : [...tags.values()].find((x) => x.nivel === quer)?.rotulo ?? 'Prioridade';
    titulo = `${rotulo} — ${qual === 'abertos' ? 'em aberto agora' : 'fechados no período'}`;
  } else if (tipo === 'pareto') {
    const { chave } = chaveDoPareto(p, q.pareto ?? 'assunto');
    lista = chave ? p.base.filter((c) => p.dentro(diaEmBrasilia(c.createdAt)) && chave(c).includes(arg)) : [];
    titulo = `Abertos no período — ${arg}`;
  } else if (tipo === 'preenchimento') {
    const campos = camposDoPreenchimento(p);
    const fechados = p.base.filter((c) => p.dentro(p.diaFechou(c)));
    const i = arg.indexOf(':'); const qual = arg.slice(0, i); const valor = arg.slice(i + 1);
    if (qual === 'campo') {
      lista = fechados.filter((c) => valoresDoCampo(c, valor).length === 0);
      titulo = `Fechados sem ${campos.find((k) => k.key === valor)?.name ?? 'o campo'}`;
    } else {
      lista = fechados.filter((c) => (c.responsavel ?? VAZIO) === valor && !campos.every((k) => valoresDoCampo(c, k.key).length > 0));
      titulo = `Fechados com campo vazio — ${valor === VAZIO ? 'sem responsável' : valor}`;
    }
  } else if (tipo === 'idade') {
    // "idade:i3" (uma faixa) ou "idade:i3:<etapa>" (uma faixa numa etapa)
    const [faixa, etapa] = arg.split(':') as [string, string | undefined];
    const agora = ctx.agora.getTime();
    lista = p.base.filter((c) => !p.fechado(c) && (!etapa || (c.stepId ?? VAZIO) === etapa) && (faixa === 'todas' || faixaDaIdade(Math.max(0, (agora - Date.parse(c.createdAt)) / DIA)) === faixa));
    const fx = FAIXAS_IDADE.find((x) => x.id === faixa);
    const nomeEtapa = etapa ? ctx.etapas.find((e) => e.id === etapa)?.title ?? 'sem etapa' : null;
    titulo = `Em aberto${fx ? ` há ${fx.rotulo}` : ''}${nomeEtapa ? ` — ${nomeEtapa}` : ''}`;
  } else if (tipo === 'picos') {
    lista = p.base.filter((c) => diaEmBrasilia(c.createdAt) === arg);
    titulo = `Abertos em ${DIAS_CURTOS[diaDaSemana(arg)]}, ${diaCurto(arg)}`;
  } else if (tipo === 'tamanho') {
    const lig = ligacoesDoContexto(p);
    const cc = p.campos.cliente;
    lista = lig && cc ? p.base.filter((c) => p.dentro(diaEmBrasilia(c.createdAt)) && valoresDoCampo(c, cc.key).some((v) => lig[v]?.clienteId === arg)) : [];
    titulo = `Abertos no período — ${ctx.tamanhos?.get(arg)?.nome ?? 'cliente'}`;
  } else if (tipo === 'falha') {
    // "falha:periodo:nossa" ou "falha:2026-09:cliente" ("semtipo" = sem tipo preenchido)
    const [quando, causa] = arg.split(':') as [string, string];
    const ct = p.campos.tipo;
    const noTempo = (c: Chamado) => { const d = diaEmBrasilia(c.createdAt); return quando === 'periodo' ? p.dentro(d) : d.slice(0, 7) === quando; };
    lista = ct ? p.base.filter((c) => {
      if (!noTempo(c)) return false;
      const tipos = valoresDoCampo(c, ct.key);
      return causa === 'semtipo' ? !tipos.length : !!tipos.length && causaDe(tipos[0]!, ctx.ajustes) === causa;
    }) : [];
    const nome = causa === 'semtipo' ? 'sem tipo' : NOMES_CAUSA[causa as Causa] ?? causa;
    titulo = `${nome[0]!.toUpperCase()}${nome.slice(1)} — ${quando === 'periodo' ? 'no período' : nomeDoMes(quando)}`;
  } else if (tipo === 'mes') {
    const mes = mesDoFechamento(q, ctx.agora);
    if (arg === 'fechados') { lista = p.base.filter((c) => (p.diaFechou(c) ?? '').slice(0, 7) === mes); titulo = `Fechados em ${nomeDoMes(mes)}`; }
    else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) { lista = p.base.filter((c) => diaEmBrasilia(c.createdAt) === arg); titulo = `Abertos em ${diaCurto(arg)}`; }
    else { lista = p.base.filter((c) => diaEmBrasilia(c.createdAt).slice(0, 7) === mes); titulo = `Abertos em ${nomeDoMes(mes)}`; }
  }
  const ordenados = [...lista].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { titulo, itens: ordenados.slice(0, 300).map((c) => linhaDoChamado(c, ctx, link)), total: ordenados.length };
}

// ---------- o Raio-X de um cliente ----------

export type RaioXChamados = {
  /** os nomes do Cliente no LineChat ligados a este cliente */
  opcoes: string[];
  de: string; ate: string;
  abertos: number;
  fechados: number;
  mediana: number | null;
  /** os em aberto agora (de qualquer data), do mais antigo para o mais novo */
  emAberto: LinhaChamado[];
  /** abertos por mês, nos 12 meses até o fim do período */
  porMes: Array<{ id: string; rotulo: string; n: number }>;
  assuntos: Array<{ rotulo: string; n: number }>;
  tipos: Array<{ rotulo: string; n: number }>;
  produtos: Array<{ rotulo: string; n: number }>;
  /** os 10 mais recentes (de qualquer data) */
  recentes: LinhaChamado[];
  /** quantos voltaram com o mesmo assunto em até 30 dias, no período */
  repetidos: number;
  total: number;
  ultimoEm: string | null;
};

export function raioXChamados(cards: Chamado[], opcoes: string[], f: FiltrosRelatorios, ctx: ContextoRelatorios, link: (c: Chamado) => string): RaioXChamados {
  const campos = camposDosRelatorios(ctx.campos, ctx.ajustes.campos);
  const cc = campos.cliente;
  // o filtro de Cliente da página não vale aqui: o cliente é o escolhido
  const semCliente = cc ? { ...f, campo: f.campo?.filter((x) => !x.startsWith(`${cc.key}=`)) } : f;
  const p = preparar(cards, semCliente, ctx);
  const nomes = new Set(opcoes);
  const doCliente = cc && nomes.size ? p.base.filter((c) => valoresDoCampo(c, cc.key).some((v) => nomes.has(v))) : [];
  const abertos = doCliente.filter((c) => p.dentro(diaEmBrasilia(c.createdAt)));
  const fechados = doCliente.filter((c) => p.dentro(p.diaFechou(c)));
  const mesFim = p.ate.slice(0, 7);
  const porMes = Array.from({ length: 12 }, (_, i) => somarMeses(mesFim, i - 11)).map((m) => ({
    id: m, rotulo: mesCurto(m), n: doCliente.filter((c) => diaEmBrasilia(c.createdAt).slice(0, 7) === m).length,
  }));
  const top = (campo: CampoChamado | null, nome: (v: string) => string = (v) => v) =>
    (campo ? maiores(contarValores(abertos, (c) => valoresDoCampo(c, campo.key).map(nome)), 6).map(([rotulo, n]) => ({ rotulo, n })) : []);
  // repetidos: mesmo assunto de novo em até 30 dias, dentro do período
  let repetidos = 0;
  if (campos.assunto) {
    const porAssunto = new Map<string, string[]>();
    for (const c of abertos) for (const a of new Set(valoresDoCampo(c, campos.assunto.key))) porAssunto.set(a, [...(porAssunto.get(a) ?? []), diaEmBrasilia(c.createdAt)]);
    for (const dias of porAssunto.values()) {
      const s = dias.sort();
      for (let i = 1; i < s.length; i++) if (diasEntre(s[i - 1]!, s[i]!) <= 30) repetidos++;
    }
  }
  const linha = (c: Chamado) => linhaDoChamado(c, ctx, link);
  const recentes = [...doCliente].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    opcoes, de: p.de, ate: p.ate,
    abertos: abertos.length, fechados: fechados.length,
    mediana: mediana(fechados.map((c) => horasAteFechar(c, ctx)).filter((h): h is number => h !== null)),
    emAberto: doCliente.filter((c) => !p.fechado(c)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(linha),
    porMes,
    assuntos: top(campos.assunto, comGrupos(ctx.gruposAssunto)),
    tipos: top(campos.tipo),
    produtos: top(campos.produto),
    recentes: recentes.slice(0, 10).map(linha),
    repetidos,
    total: doCliente.length,
    ultimoEm: recentes[0]?.createdAt ?? null,
  };
}

// ---------- a janela "Ajustar" dos Relatórios ----------

/** As opções do Cliente do card com quantos chamados cada uma tem: as que o LineChat lista e as que aparecem nos cards. */
export function contagemDoCampo(cards: Chamado[], campos: CampoChamado[], key: string | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!key) return m;
  for (const o of campos.find((c) => c.key === key)?.options ?? []) m.set(o, 0);
  for (const c of cards) for (const v of new Set(valoresDoCampo(c, key))) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

/**
 * O que a janela "Ajustar" mostra (igual no servidor e na prévia): os campos (o escolhido e o que
 * está valendo), cada opção do Cliente do card com quantos chamados tem e a qual cliente está
 * ligada, e — já somado — os clientes do Gestor que têm chamados (a lista do Raio-X).
 */
export function ajustesParaTela(cards: Chamado[], camposDoPainel: CampoChamado[], ajustes: AjustesRelatorios, cadastro: ClienteParaLigar[]) {
  const campos = camposDosRelatorios(camposDoPainel, ajustes.campos);
  const contagem = contagemDoCampo(cards, camposDoPainel, campos.cliente?.key);
  const lig = ligarClientes([...contagem.keys()], cadastro, ajustes.clientes);
  const nomeDe = new Map(cadastro.map((c) => [c.id, c.nomes[0] ?? '?']));
  const opcoes = [...contagem.entries()]
    .map(([opcao, n]) => ({ opcao, n, clienteId: lig[opcao]?.clienteId ?? null, como: lig[opcao]?.como ?? ('nenhum' as const), guardada: Object.prototype.hasOwnProperty.call(ajustes.clientes, opcao) }))
    .sort((x, y) => y.n - x.n || x.opcao.localeCompare(y.opcao, 'pt-BR'));
  const porCliente = new Map<string, { clienteId: string; nome: string; n: number; opcoes: string[] }>();
  for (const o of opcoes) {
    if (!o.clienteId) continue;
    const x = porCliente.get(o.clienteId) ?? { clienteId: o.clienteId, nome: nomeDe.get(o.clienteId) ?? '?', n: 0, opcoes: [] };
    x.n += o.n; x.opcoes.push(o.opcao); porCliente.set(o.clienteId, x);
  }
  const usado = (c: CampoChamado | null): CampoUsado => (c ? { key: c.key, name: c.name } : null);
  const contagemTipos = contagemDoCampo(cards, camposDoPainel, campos.tipo?.key);
  const tipos = [...contagemTipos.entries()]
    .map(([tipo, n]) => ({ tipo, n, causa: causaDe(tipo, ajustes), sugerida: causaPeloNome(tipo), escolhida: !!ajustes.causas?.[tipo] }))
    .sort((x, y) => y.n - x.n || x.tipo.localeCompare(y.tipo, 'pt-BR'));
  return {
    tipos,
    campos: { escolhidos: ajustes.campos, usados: { cliente: usado(campos.cliente), assunto: usado(campos.assunto), tipo: usado(campos.tipo), produto: usado(campos.produto) } },
    camposDisponiveis: camposDeLista(camposDoPainel).map((c) => ({ key: c.key, name: c.name, multiplo: c.type === 'MULTISELECT' })),
    opcoes,
    clientes: cadastro.map((c) => ({ id: c.id, nome: c.nomes[0] ?? '?', razao: c.nomes[1] ?? null })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')),
    ligados: [...porCliente.values()].sort((x, y) => y.n - x.n || x.nome.localeCompare(y.nome, 'pt-BR')),
  };
}

/** As opções do Cliente do card ligadas a um cliente do Gestor (para o Raio-X). */
export function opcoesLigadasAo(clienteId: string, cards: Chamado[], camposDoPainel: CampoChamado[], ajustes: AjustesRelatorios, cadastro: ClienteParaLigar[]): string[] {
  const campos = camposDosRelatorios(camposDoPainel, ajustes.campos);
  const contagem = contagemDoCampo(cards, camposDoPainel, campos.cliente?.key);
  return opcoesDoCliente(ligarClientes([...contagem.keys()], cadastro, ajustes.clientes), clienteId);
}

/** Confere os ajustes antes de gravar: campo escolhido tem de ser de lista e existir; cliente ligado tem de existir. Devolve o erro, ou null. */
export function conferirAjustes(a: AjustesRelatorios, camposDoPainel: CampoChamado[], idsDoCadastro: Set<string>): string | null {
  const listas = new Set(camposDeLista(camposDoPainel).map((c) => c.key));
  for (const [papel, key] of Object.entries(a.campos)) {
    if (key && !listas.has(key)) return `O campo escolhido para ${papel} não existe mais no LineChat.`;
  }
  if (Object.values(a.clientes).some((id) => id && !idsDoCadastro.has(id))) return 'Um dos clientes escolhidos não existe mais no cadastro (ou foi para a lixeira).';
  return null;
}

// ---------- a arrumação da página (igual para a equipe toda) ----------

/**
 * Todos os relatórios da página, na ordem de fábrica, com a seção (aba) de cada um. A arrumação
 * guardada (Ajustes, `chamados-relatorios-arrumacao`) muda a ordem, esconde e marca os favoritos —
 * a seção de cada um é fixa. Relatório novo que entrar aqui aparece sozinho, no fim da sua aba.
 */
export const CATALOGO_RELATORIOS: Array<{ id: string; secao: SecaoRelatorios; titulo: string; largura: 'metade' | 'inteira' }> = [
  { id: 'relogio', secao: 'tempo', titulo: 'Relógio do chamado', largura: 'metade' },
  { id: 'escada', secao: 'tempo', titulo: 'A escada N1 → N2 → N3', largura: 'metade' },
  { id: 'gargalo', secao: 'tempo', titulo: 'Onde o chamado empaca', largura: 'metade' },
  { id: 'primeira', secao: 'tempo', titulo: 'Primeira resposta', largura: 'metade' },
  { id: 'prioridade', secao: 'tempo', titulo: 'A prioridade faz diferença?', largura: 'metade' },
  { id: 'prazo', secao: 'tempo', titulo: 'Prazo cumprido', largura: 'metade' },
  { id: 'calor', secao: 'volume', titulo: 'Mapa de calor da semana', largura: 'inteira' },
  { id: 'fila', secao: 'volume', titulo: 'Entrada × saída', largura: 'inteira' },
  { id: 'idade', secao: 'volume', titulo: 'Idade da fila', largura: 'inteira' },
  { id: 'picos', secao: 'volume', titulo: 'Dias fora da curva', largura: 'inteira' },
  { id: 'sobe', secao: 'volume', titulo: 'Sobe e desce dos assuntos', largura: 'inteira' },
  { id: 'pareto', secao: 'volume', titulo: 'Os poucos que pesam muito', largura: 'inteira' },
  { id: 'previsao', secao: 'volume', titulo: 'Previsão da semana', largura: 'inteira' },
  { id: 'raiox', secao: 'clientes', titulo: 'Raio-X do cliente', largura: 'inteira' },
  { id: 'tamanho', secao: 'clientes', titulo: 'Chamados pelo tamanho do cliente', largura: 'inteira' },
  { id: 'reincidencia', secao: 'clientes', titulo: 'Voltou com o mesmo problema', largura: 'inteira' },
  { id: 'falha', secao: 'clientes', titulo: 'De quem é a falha?', largura: 'inteira' },
  { id: 'equipe', secao: 'equipe', titulo: 'Quadro da equipe', largura: 'inteira' },
  { id: 'preenchimento', secao: 'equipe', titulo: 'Card bem preenchido', largura: 'inteira' },
  { id: 'mes', secao: 'mes', titulo: 'Fechamento do mês', largura: 'inteira' },
];
const IDS_RELATORIOS = new Set(CATALOGO_RELATORIOS.map((r) => r.id));
const ListaDeRelatorios = z.array(z.string().max(40)).max(100)
  .refine((xs) => xs.every((x) => IDS_RELATORIOS.has(x)), 'Relatório desconhecido na arrumação.')
  .refine((xs) => new Set(xs).size === xs.length, 'Um relatório apareceu duas vezes.');

/** A arrumação guardada: a ordem, os escondidos e os favoritos (ids do catálogo). */
export const ArrumacaoRelatoriosSchema = z.object({
  ordem: ListaDeRelatorios.default([]),
  ocultos: ListaDeRelatorios.default([]),
  favoritos: ListaDeRelatorios.default([]),
});
export type ArrumacaoRelatorios = z.infer<typeof ArrumacaoRelatoriosSchema>;

/**
 * Junta a arrumação guardada com o catálogo de hoje: a ordem guardada primeiro (sem o que saiu do
 * catálogo), e o que é novo no fim, na ordem de fábrica. Os favoritos têm a ordem deles (a da aba
 * Favoritos). Escondido não aparece em lugar nenhum — nem nos Favoritos.
 */
export function montarArrumacao(salva?: Partial<ArrumacaoRelatorios> | null): { ordem: string[]; ocultos: string[]; favoritos: string[] } {
  const vistos = new Set<string>();
  const ordem: string[] = [];
  for (const id of salva?.ordem ?? []) if (IDS_RELATORIOS.has(id) && !vistos.has(id)) { ordem.push(id); vistos.add(id); }
  for (const r of CATALOGO_RELATORIOS) if (!vistos.has(r.id)) ordem.push(r.id);
  const ocultos = new Set((salva?.ocultos ?? []).filter((id) => IDS_RELATORIOS.has(id)));
  const favoritos = [...new Set(salva?.favoritos ?? [])].filter((id) => IDS_RELATORIOS.has(id) && !ocultos.has(id));
  return { ordem, ocultos: ordem.filter((id) => ocultos.has(id)), favoritos };
}
