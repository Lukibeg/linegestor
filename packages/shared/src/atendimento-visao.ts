/**
 * A VISÃO GERAL DOS RELATÓRIOS DE UM PAINEL DE CHAMADOS (2.2). O pedido do Luan na prévia (28/10): *"eu preciso desse
 * tipo de kpi mais simples para os novos relatórios tbm, faça igual ao legado, coloque esse como principal e todos os
 * outros vão entrar como 'relatórios'"*. É a tela de **Hoje** e de **Período** do Legado do Helena (os números de cima,
 * os chamados no tempo, os gráficos de pizza ou barras e a tabela), lendo os chamados do Gestor, com os campos de cá: a
 * etapa do painel, o responsável, o assunto (em pastas: o Agrupar junta pelo 1º nível da árvore), o cliente, o tipo, a
 * gravidade, a prioridade, os produtos, as operadoras, as etiquetas, como o chamado chegou e cada campo de lista do
 * painel. Os 25 relatórios ficam na parte **Relatórios**, ao lado.
 *
 * As regras do Legado que valem aqui também:
 *  - **clicar filtra, e o gráfico clicado continua inteiro**: cada gráfico é contado com todos os filtros menos o dele
 *    (`recortar(..., { dim })`); clicar de novo desfaz;
 *  - **Hoje** é o que chegou hoje (por hora); **Período**, por dia (até 3 meses) ou por mês; o interruptor **só em
 *    aberto** vale nos dois, e o Período com o atalho Tudo e o interruptor é a fila inteira;
 *  - os números de cima filtram pela situação (vencidos, parados, sem responsável, resolvidos); "Resolvidos" troca a
 *    régua: a tela passa a olhar o dia em que o chamado foi resolvido.
 *
 * O que muda do Legado: o "fechado" é o **Resolvido** (o Fechado vem sozinho depois); o vencido é o **prazo** do painel
 * (resposta ou solução vencida, em horas úteis), e o painel que não conta prazo não tem o número; o problema (ITIL) não
 * é chamado de cliente e fica fora, como nos 25 relatórios. Cada filtro é de um valor só (o mesmo endereço dos
 * Relatórios: o que se escolhe aqui vai junto para lá).
 *
 * A conta é escrita uma vez só e roda igual no servidor e na prévia, sobre a mesma base dos 25 relatórios
 * (`ChamadoParaRelatorios` e `ContextoDosRelatorios`).
 */
import { z } from 'zod';
import { VAZIO, diasEntre, somarDias, type GrupoGrafico, type ItemRanking, type PontoSerie } from './chamados.js';
import { mesCurto } from './relatorios.js';
import { GRAVIDADES, NOME_GRAVIDADE, NOME_PRIORIDADE, PRIORIDADES, diaLocal, horaLocal, type Gravidade, type Prioridade } from './atendimento-prazos.js';
import { NOME_ORIGEM, ORIGENS, type Origem } from './atendimento.js';
import {
  RESPONSAVEL_NINGUEM, assuntoComOsDeBaixo, chamadoComPrazoVencido, derivarChamado, linhaDoChamadoDoRelatorio, valoresDoCampoDoChamado,
  type ChamadoDerivado, type ChamadoDoRelatorio, type ChamadoParaRelatorios, type ContextoDosRelatorios, type ItemDaVisao,
} from './atendimento-relatorios.js';
import { paraBusca } from './formatos.js';

// =====================================================================
//  O QUE ENTRA: a parte, o período e os filtros (os mesmos nomes dos Relatórios)
// =====================================================================

/** "Não preenchido" num filtro de valor da Visão (sem assunto, sem cliente…); o responsável usa o `ninguem` dos Relatórios. */
export const SEM_VALOR_NA_VISAO = 'sem';
export const PARTES_DA_VISAO = ['hoje', 'periodo'] as const;
export type ParteDaVisao = (typeof PARTES_DA_VISAO)[number];
/** Os números de cima que filtram (como no Legado; o "fechados" de lá é o "resolvidos" de cá). */
export const SITUACOES_DA_VISAO = ['vencidos', 'parados', 'sem-responsavel', 'resolvidos'] as const;
export type SituacaoDaVisao = (typeof SITUACOES_DA_VISAO)[number];
/** Os filtros que só a Visão tem (os outros são os dos Relatórios e vão junto para lá). */
export const FILTROS_SO_DA_VISAO = ['etapa', 'origem', 'situacao', 'quando', 'emaberto'] as const;
/** Os parados: em aberto e sem nenhuma atividade há 7 dias ou mais. */
export const DIAS_PARADO_NA_VISAO = 7;
/** Linhas por página da tabela de baixo. */
export const POR_PAGINA_DA_VISAO = 50;

const Dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o dia no formato AAAA-MM-DD');
const Valor = z.string().trim().max(200).optional();

export const FiltroDaVisaoSchema = z.object({
  painel: z.string().trim().min(1, 'Escolha o painel').max(100),
  parte: z.enum(PARTES_DA_VISAO).default('hoje'),
  de: Dia.optional(),
  ate: Dia.optional(),
  assunto: Valor,
  tipo: Valor,
  gravidade: z.enum([...GRAVIDADES, SEM_VALOR_NA_VISAO]).optional(),
  prioridade: z.enum([...PRIORIDADES, 'sem']).optional(),
  nivel: z.coerce.number().int().min(1).max(4).optional(),
  responsavel: Valor,
  cliente: Valor,
  produto: Valor,
  operadora: Valor,
  etiqueta: Valor,
  /** um campo do painel: "<id do campo>:<opção>" ("<id>:" = não preenchido) */
  campo: z.string().trim().max(400).optional(),
  etapa: Valor,
  origem: z.enum(ORIGENS).optional(),
  situacao: z.enum(SITUACOES_DA_VISAO).optional(),
  /** a coluna do tempo clicada: a hora (Hoje), o dia AAAA-MM-DD ou o mês AAAA-MM (Período) */
  quando: z.string().regex(/^(\d{1,2}|\d{4}-\d{2}(-\d{2})?)$/, 'Coluna do tempo desconhecida').optional(),
  emaberto: z.enum(['1']).optional(),
  /** a página da tabela */
  p: z.coerce.number().int().min(1).max(100_000).optional(),
}).refine((f) => !f.de || !f.ate || f.ate >= f.de, 'O fim do período vem depois do começo.')
  .refine((f) => !f.de || !f.ate || diasEntre(f.de, f.ate) <= 1830, 'O período vai até 5 anos.');
export type FiltroDaVisao = z.infer<typeof FiltroDaVisaoSchema>;

// =====================================================================
//  O QUE SAI
// =====================================================================

export type KpiDaVisao = {
  id: string; label: string; valor: string; sub?: string; tom: 'neutral' | 'accent' | 'signal' | 'ok' | 'bad';
  /** clicar filtra por esta situação; com `parte`, vai para ela; com `tudo`, o período inteiro; com `emAberto`, liga o "só em aberto" */
  filtro?: { situacao?: SituacaoDaVisao; parte?: ParteDaVisao; tudo?: boolean; emAberto?: boolean };
  /** o número de tudo da parte: clicar tira a situação escolhida */
  total?: boolean;
  ativo?: boolean;
};

/**
 * Um gráfico de lista. `filtro`: o nome do filtro do endereço que ele escolhe; o "não preenchido" vem como `VAZIO` (a
 * tela troca pelo valor do filtro: `sem`, `ninguem` ou `<campo>:`). `grupos`: no assunto, as pastas do 1º nível.
 */
export type GraficoDaVisao = {
  id: string; titulo: string; sub?: string; multiplo: boolean; naOrdem?: boolean; filtro: string;
  itens: ItemRanking[]; grupos?: GrupoGrafico[];
};

export type VisaoDoPainel = {
  painel: { id: string; nome: string; sigla: string };
  parte: ParteDaVisao;
  de: string; ate: string; hoje: string;
  /** o dia do chamado mais antigo do painel (o atalho Tudo) */
  primeiroDia: string;
  agora: string;
  contaPrazo: boolean;
  /** os chamados do recorte (com tudo o que foi clicado): é a conta da tabela */
  total: number;
  kpis: KpiDaVisao[];
  serie: { titulo: string; sub: string; pontos: PontoSerie[] };
  graficos: GraficoDaVisao[];
  lista: { total: number; pagina: number; porPagina: number; itens: ChamadoDoRelatorio[] };
};

// =====================================================================
//  A ARRUMAÇÃO DOS GRÁFICOS (o Organizar da Visão)
// =====================================================================

/** A ordem de fábrica: o do tempo em cima, a linha toda; depois, como no Legado, o assunto, o cliente, o tipo e a etapa. */
const ORDEM_DE_FABRICA = ['serie', 'assunto', 'cliente', 'tipo', 'etapa', 'produto', 'origem', 'responsavel', 'prioridade', 'gravidade', 'operadora', 'etiqueta'];

/** O de fábrica de um gráfico: o do tempo na linha toda; os de lista em pizza, de meia largura; o assunto com as pastas juntas. */
export function itemDaVisaoDeFabrica(id: string): ItemDaVisao {
  if (id === 'serie') return { id, largura: 'inteira', oculto: false };
  return { id, largura: 'metade', oculto: false, forma: 'pizza', ...(id === 'assunto' ? { agrupar: true } : {}) };
}

/**
 * A arrumação da Visão para os gráficos que o painel tem agora: a guardada na ordem dela, o que não existe mais sai, e o
 * gráfico novo (um campo criado depois) entra no fim, como de fábrica.
 */
export function montarVisao(guardada: readonly ItemDaVisao[] | undefined, ids: readonly string[]): ItemDaVisao[] {
  const existe = new Set(ids);
  const fabrica = [...ids].sort((a, b) => posDeFabrica(a) - posDeFabrica(b));
  if (!guardada?.length) return fabrica.map(itemDaVisaoDeFabrica);
  const out = guardada.filter((x) => existe.has(x.id)).map((x) => ({ ...x }));
  for (const id of fabrica) if (!out.some((x) => x.id === id)) out.push(itemDaVisaoDeFabrica(id));
  return out;
}
const posDeFabrica = (id: string) => { const i = ORDEM_DE_FABRICA.indexOf(id); return i < 0 ? ORDEM_DE_FABRICA.length : i; };

// =====================================================================
//  AS CONTAS
// =====================================================================

const nf = (n: number) => n.toLocaleString('pt-BR');
const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

type Prep = {
  ctx: ContextoDosRelatorios; f: FiltroDaVisao; agora: Date; hoje: string; de: string; ate: string; dias: number;
  /** os chamados do painel, sem os problemas */
  todos: ChamadoDerivado[];
  assuntoSet: Set<string> | null;
  limiteParado: number;
};

/** O período do Período: o pedido, ou os 30 dias até hoje. */
function periodo(f: Pick<FiltroDaVisao, 'de' | 'ate'>, hoje: string): { de: string; ate: string } {
  const ate = f.ate ?? hoje;
  const de = f.de ?? somarDias(ate, -29);
  return de <= ate ? { de, ate } : { de: ate, ate };
}

/** A dimensão de cada filtro de valor (a de um campo é `campo:<id>`). */
function dimDoCampo(f: FiltroDaVisao): string | null {
  if (!f.campo) return null;
  const i = f.campo.indexOf(':');
  return `campo:${i > 0 ? f.campo.slice(0, i) : f.campo}`;
}

/** O chamado passa nos filtros de valor? `sem`: a dimensão que fica de fora (a do gráfico que está sendo contado). */
function passa(d: ChamadoDerivado, p: Prep, sem: string | null): boolean {
  const c = d.c; const f = p.f; const S = SEM_VALOR_NA_VISAO;
  const um = (v: string | undefined, atual: string | null) => !v || (v === S ? atual === null : atual === v);
  const algum = (v: string | undefined, lista: readonly string[]) => !v || (v === S ? lista.length === 0 : lista.includes(v));
  if (sem !== 'assunto' && f.assunto && (f.assunto === S ? c.assuntoId !== null : !(c.assuntoId && p.assuntoSet?.has(c.assuntoId)))) return false;
  if (sem !== 'tipo' && !um(f.tipo, c.tipo)) return false;
  if (sem !== 'gravidade' && !um(f.gravidade, c.gravidade)) return false;
  if (sem !== 'prioridade' && !um(f.prioridade, c.prioridade)) return false;
  if (f.nivel && d.nivelMax !== f.nivel) return false;
  if (sem !== 'responsavel' && f.responsavel && (f.responsavel === RESPONSAVEL_NINGUEM || f.responsavel === S ? c.responsavelId !== null : c.responsavelId !== f.responsavel)) return false;
  if (sem !== 'cliente' && !um(f.cliente, c.clienteId)) return false;
  if (sem !== 'produto' && !algum(f.produto, c.produtos)) return false;
  if (sem !== 'operadora' && !algum(f.operadora, c.operadoras)) return false;
  if (sem !== 'etiqueta' && f.etiqueta && (f.etiqueta === S ? c.etiquetas.length > 0 : !c.etiquetas.some((e) => paraBusca(e) === paraBusca(f.etiqueta!)))) return false;
  if (f.campo && sem !== dimDoCampo(f)) {
    const i = f.campo.indexOf(':');
    const campoId = i > 0 ? f.campo.slice(0, i) : f.campo;
    const opcao = i > 0 ? f.campo.slice(i + 1) : '';
    const vs = valoresDoCampoDoChamado(c, campoId);
    if (opcao ? !vs.includes(opcao) : vs.length > 0) return false;
  }
  if (sem !== 'etapa' && f.etapa && c.etapaId !== f.etapa) return false;
  if (sem !== 'origem' && f.origem && c.origem !== f.origem) return false;
  return true;
}

/** A régua: com "resolvidos", o dia em que foi resolvido; sem, o dia em que chegou. */
const momento = (d: ChamadoDerivado, situacao: SituacaoDaVisao | undefined) => (situacao === 'resolvidos' ? d.c.resolvidoEm : d.c.criadoEm);

/** A coluna do tempo de um momento: a hora (Hoje), o dia ou o mês (Período longo). */
function colunaDe(m: string, p: Prep): string {
  if (p.f.parte === 'hoje') return String(Number(horaLocal(m).slice(0, 2)));
  const dia = diaLocal(m);
  return p.dias <= 92 ? dia : dia.slice(0, 7);
}
/** A coluna clicada vale para a parte de agora? (a hora no Hoje; o dia ou o mês, conforme o tamanho do Período) */
function quandoValido(p: Prep): string | null {
  const q = p.f.quando;
  if (!q) return null;
  if (p.f.parte === 'hoje') return /^\d{1,2}$/.test(q) && Number(q) <= 23 ? String(Number(q)) : null;
  return (p.dias <= 92 ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/).test(q) ? q : null;
}

const ehParado = (d: ChamadoDerivado, p: Prep) => d.c.situacao === 'aberto' && Date.parse(d.c.ultimaAtividadeEm) < p.limiteParado;
const ehVencido = (d: ChamadoDerivado) => d.c.situacao === 'aberto' && chamadoComPrazoVencido(d);

/**
 * O recorte da tela: os filtros de valor (`base`, que serve para os números "de qualquer dia") e, em cima, a parte (hoje ou
 * o período), o "só em aberto", a situação e a coluna do tempo (`recorte`). `sem` deixa um deles de fora.
 */
function recortar(p: Prep, sem: { dim?: string; situacao?: boolean; quando?: boolean } = {}): { base: ChamadoDerivado[]; recorte: ChamadoDerivado[] } {
  const f = p.f;
  const base = p.todos.filter((d) => passa(d, p, sem.dim ?? null));
  const sit = sem.situacao ? undefined : f.situacao;
  const quando = sem.quando ? null : quandoValido(p);
  const recorte = base.filter((d) => {
    const m = momento(d, sit);
    if (!m) return false;
    const dia = diaLocal(m);
    if (f.parte === 'hoje' ? dia !== p.hoje : dia < p.de || dia > p.ate) return false;
    if (f.emaberto && sit !== 'resolvidos' && d.c.situacao !== 'aberto') return false;
    if (sit === 'vencidos' && !ehVencido(d)) return false;
    if (sit === 'parados' && !ehParado(d, p)) return false;
    if (sit === 'sem-responsavel' && d.c.responsavelId) return false;
    if (quando && colunaDe(m, p) !== quando) return false;
    return true;
  });
  return { base, recorte };
}

/** Maior primeiro; o "não preenchido" sempre no fim. */
const compararItens = (a: ItemRanking, b: ItemRanking) =>
  (a.valor === VAZIO ? 1 : b.valor === VAZIO ? -1 : b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

/**
 * Um gráfico de lista: conta cada chamado nos valores dele (o vazio vira `VAZIO`). O escolhido que não aparece mais com os
 * outros filtros entra com 0, para continuar à vista (e dar para desfazer).
 */
function ranking(xs: readonly ChamadoDerivado[], chaves: (d: ChamadoDerivado) => string[], escolhidos: ReadonlySet<string>, rotulo: (k: string) => string, ordem?: (k: string) => number): ItemRanking[] {
  const m = new Map<string, number>();
  for (const d of xs) { const ks = chaves(d); for (const k of ks.length ? ks : [VAZIO]) m.set(k, (m.get(k) ?? 0) + 1); }
  if (escolhidos.size === 1) for (const v of escolhidos) if (!m.has(v)) m.set(v, 0);
  const itens = [...m.entries()].map(([valor, n]): ItemRanking => ({ valor, rotulo: rotulo(valor), n, ...(escolhidos.has(valor) ? { selecionado: true } : {}) }));
  return ordem ? itens.sort((a, b) => ordem(a.valor) - ordem(b.valor)) : itens.sort(compararItens);
}

/** O escolhido de um filtro de valor, do jeito dos itens do gráfico (o "não preenchido" é `VAZIO`). */
function escolhido(v: string | undefined, vazio: string[] = [SEM_VALOR_NA_VISAO]): Set<string> {
  if (!v) return new Set();
  return new Set([vazio.includes(v) ? VAZIO : v]);
}

function serie(recorte: readonly ChamadoDerivado[], p: Prep): VisaoDoPainel['serie'] {
  const f = p.f;
  const res = f.situacao === 'resolvidos';
  const soAbertos = !!f.emaberto && !res;
  const escolhida = quandoValido(p);
  const marcar = (pontos: PontoSerie[]) => (escolhida ? pontos.map((x) => (x.id === escolhida ? { ...x, selecionado: true } : x)) : pontos);
  const conta = new Map<string, number>();
  for (const d of recorte) { const m = momento(d, f.situacao); if (m) { const k = colunaDe(m, p); conta.set(k, (conta.get(k) ?? 0) + 1); } }
  if (f.parte === 'hoje') {
    const agoraH = Number(horaLocal(p.agora).slice(0, 2));
    return {
      titulo: res ? 'Chamados resolvidos hoje, por hora' : soAbertos ? 'Chegaram hoje e ainda em aberto, por hora' : 'Chamados que chegaram hoje, por hora',
      sub: res ? 'A que horas os chamados foram resolvidos.' : `A que horas os chamados chegaram.${escolhida ? '' : ' A hora de agora fica destacada.'}`,
      pontos: marcar(Array.from({ length: 24 }, (_, h) => ({ id: String(h), rotulo: `${String(h).padStart(2, '0')}h`, n: conta.get(String(h)) ?? 0, destaque: h === agoraH }))),
    };
  }
  const verbo = res ? 'resolvidos' : 'que chegaram';
  if (p.dias <= 92) {
    const pontos: PontoSerie[] = [];
    for (let d = p.de; d <= p.ate; d = somarDias(d, 1)) pontos.push({ id: d, rotulo: diaCurto(d), n: conta.get(d) ?? 0, destaque: d === p.hoje });
    return {
      titulo: soAbertos ? 'Em aberto, pelo dia em que chegaram' : `Chamados ${verbo}, por dia`,
      sub: `De ${diaCurto(p.de)} a ${diaCurto(p.ate)}.${soAbertos ? ' Quanto mais à esquerda, mais tempo na fila.' : ''}`,
      pontos: marcar(pontos),
    };
  }
  const pontos: PontoSerie[] = [];
  for (let mes = p.de.slice(0, 7); mes <= p.ate.slice(0, 7);) {
    const [a, mm] = mes.split('-').map(Number) as [number, number];
    pontos.push({ id: mes, rotulo: mesCurto(mes), n: conta.get(mes) ?? 0, destaque: mes === p.hoje.slice(0, 7) });
    mes = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`;
  }
  return {
    titulo: soAbertos ? 'Em aberto, pelo mês em que chegaram' : `Chamados ${verbo}, por mês`,
    sub: `Período longo: de ${diaCurto(p.de)}/${p.de.slice(0, 4)} a ${diaCurto(p.ate)}/${p.ate.slice(0, 4)}, somado por mês.`,
    pontos: marcar(pontos),
  };
}

function kpis(p: Prep): KpiDaVisao[] {
  const f = p.f;
  const { base, recorte } = recortar(p, { situacao: true });
  const abertos = base.filter((d) => d.c.situacao === 'aberto');
  const resolvidoNoDia = (d: ChamadoDerivado) => (d.c.resolvidoEm ? diaLocal(d.c.resolvidoEm) : null);
  const qualquerDia = { parte: 'periodo' as const, tudo: true, emAberto: true };
  const prazo = p.ctx.painel.contaPrazo;
  // sem prazo no painel, não há vencido: no lugar, quem está sem responsável
  const semDono = (xs: readonly ChamadoDerivado[]) => xs.filter((d) => !d.c.responsavelId).length;
  let out: KpiDaVisao[];
  if (f.parte === 'hoje' && !f.emaberto) {
    const resolvidosHoje = base.filter((d) => resolvidoNoDia(d) === p.hoje).length;
    const vencidos = abertos.filter(ehVencido).length;
    out = [
      { id: 'chegaram-hoje', label: 'Chegaram hoje', valor: nf(recorte.length), tom: 'accent', total: true },
      { id: 'resolvidos-hoje', label: 'Resolvidos hoje', valor: nf(resolvidosHoje), sub: 'foram para o Resolvido hoje', tom: 'ok', filtro: { situacao: 'resolvidos' } },
      { id: 'em-aberto', label: 'Em aberto agora', valor: nf(abertos.length), sub: 'de qualquer dia', tom: 'neutral', filtro: qualquerDia },
      prazo
        ? { id: 'vencidos', label: 'Prazo vencido', valor: nf(vencidos), sub: 'em aberto, com a resposta ou a solução vencida', tom: vencidos ? 'bad' : 'neutral', filtro: { ...qualquerDia, situacao: 'vencidos' } }
        : { id: 'sem-responsavel', label: 'Sem responsável', valor: nf(semDono(abertos)), sub: 'em aberto, de qualquer dia', tom: 'neutral', filtro: { ...qualquerDia, situacao: 'sem-responsavel' } },
    ];
  } else if (f.parte === 'hoje') {
    const vencidos = recorte.filter(ehVencido).length;
    out = [
      { id: 'chegaram-hoje', label: 'Chegaram hoje e em aberto', valor: nf(recorte.length), sub: 'ainda sem resolver', tom: 'accent', total: true },
      { id: 'sem-responsavel', label: 'Sem responsável', valor: nf(semDono(recorte)), sub: 'dos que chegaram hoje', tom: 'neutral', filtro: { situacao: 'sem-responsavel' } },
      prazo
        ? { id: 'vencidos', label: 'Prazo vencido', valor: nf(vencidos), sub: 'dos que chegaram hoje', tom: vencidos ? 'bad' : 'neutral', filtro: { situacao: 'vencidos' } }
        : { id: 'parados', label: `Parados há ${DIAS_PARADO_NA_VISAO} dias ou mais`, valor: nf(recorte.filter((d) => ehParado(d, p)).length), sub: 'ninguém mexeu', tom: 'neutral', filtro: { situacao: 'parados' } },
      { id: 'em-aberto', label: 'Em aberto agora', valor: nf(abertos.length), sub: 'de qualquer dia', tom: 'neutral', filtro: qualquerDia },
    ];
  } else if (!f.emaberto) {
    const resolvidos = base.filter((d) => { const dia = resolvidoNoDia(d); return !!dia && dia >= p.de && dia <= p.ate; }).length;
    out = [
      { id: 'chegaram', label: 'Chegaram no período', valor: nf(recorte.length), sub: `${(recorte.length / p.dias).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia, em média`, tom: 'accent', total: true },
      { id: 'resolvidos', label: 'Resolvidos no período', valor: nf(resolvidos), sub: 'foram para o Resolvido no período', tom: 'ok', filtro: { situacao: 'resolvidos' } },
      { id: 'ainda-abertos', label: 'Ainda em aberto', valor: nf(recorte.filter((d) => d.c.situacao === 'aberto').length), sub: 'dos que chegaram no período', tom: 'neutral', filtro: { emAberto: true } },
      prazo
        ? { id: 'vencidos', label: 'Prazo vencido', valor: nf(recorte.filter(ehVencido).length), sub: 'dos que chegaram, ainda em aberto', tom: 'neutral', filtro: { situacao: 'vencidos' } }
        : { id: 'sem-responsavel', label: 'Sem responsável', valor: nf(semDono(recorte)), sub: 'dos que chegaram no período', tom: 'neutral', filtro: { situacao: 'sem-responsavel' } },
    ];
  } else {
    const vencidos = recorte.filter(ehVencido).length;
    const parados = recorte.filter((d) => ehParado(d, p)).length;
    out = [
      { id: 'em-aberto', label: 'Em aberto', valor: nf(recorte.length), sub: p.de <= primeiroDiaDe(p) ? 'de qualquer data' : 'dos que chegaram no período', tom: 'accent', total: true },
      ...(prazo ? [{ id: 'vencidos', label: 'Prazo vencido', valor: nf(vencidos), sub: 'a resposta ou a solução vencida', tom: vencidos ? 'bad' : 'neutral', filtro: { situacao: 'vencidos' } } satisfies KpiDaVisao] : []),
      { id: 'parados', label: `Parados há ${DIAS_PARADO_NA_VISAO} dias ou mais`, valor: nf(parados), sub: 'ninguém mexeu no chamado', tom: parados ? 'signal' : 'neutral', filtro: { situacao: 'parados' } },
      { id: 'sem-responsavel', label: 'Sem responsável', valor: nf(semDono(recorte)), sub: 'na fila da etapa', tom: 'neutral', filtro: { situacao: 'sem-responsavel' } },
    ];
  }
  return out.map((k) => (k.filtro?.situacao && !k.filtro.parte && !k.filtro.tudo && k.filtro.situacao === f.situacao ? { ...k, ativo: true } : k));
}

function primeiroDiaDe(p: Prep): string {
  let menor: string | null = null;
  for (const d of p.todos) if (!menor || d.diaCriado < menor) menor = d.diaCriado;
  return menor ?? p.hoje;
}

function graficos(p: Prep): GraficoDaVisao[] {
  const { ctx, f } = p;
  const usa = ctx.painel.usa;
  const S = SEM_VALOR_NA_VISAO;
  const tudo = recortar(p).recorte;
  /** o recorte sem o filtro da dimensão (só recalcula quando ela está filtrando) */
  const para = (dim: string, filtrando: boolean) => (filtrando ? recortar(p, { dim }).recorte : tudo);
  const out: GraficoDaVisao[] = [];

  const etapas = new Map(ctx.etapas.map((e) => [e.id, e]));
  out.push({
    id: 'etapa', titulo: 'Por etapa', sub: 'na ordem do quadro', multiplo: false, naOrdem: true, filtro: 'etapa',
    itens: ranking(para('etapa', !!f.etapa), (d) => [d.c.etapaId], escolhido(f.etapa, []),
      (k) => { const e = etapas.get(k); return e ? `${e.nome}${e.ativa ? '' : ' (saiu do painel)'}` : 'Etapa que saiu'; },
      (k) => etapas.get(k)?.ordem ?? 999),
  });
  out.push({
    id: 'responsavel', titulo: 'Por responsável', multiplo: false, filtro: 'responsavel',
    itens: ranking(para('responsavel', !!f.responsavel), (d) => (d.c.responsavelId ? [d.c.responsavelId] : []), escolhido(f.responsavel, [RESPONSAVEL_NINGUEM, S]),
      (k) => (k === VAZIO ? 'Sem responsável' : ctx.pessoas.get(k) ?? 'Alguém que saiu')),
  });
  if (usa.assunto) {
    const assuntos = new Map(ctx.assuntos.map((a) => [a.id, a]));
    const caminho = (id: string) => {
      const nomes: string[] = []; const vistos = new Set<string>();
      for (let a = assuntos.get(id); a && !vistos.has(a.id); a = a.paiId ? assuntos.get(a.paiId) : undefined) { vistos.add(a.id); nomes.unshift(a.nome); }
      return nomes.join(' › ') || 'Assunto que saiu';
    };
    // com uma pasta no filtro, tudo o que está dentro dela fica em destaque
    const marcados = !f.assunto ? new Set<string>() : f.assunto === S ? new Set([VAZIO]) : p.assuntoSet ?? new Set<string>();
    const raizes = ctx.assuntos.filter((a) => !a.paiId).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
    const grupos: GrupoGrafico[] = raizes
      .map((r) => ({ id: r.id, nome: r.nome, valores: [...assuntoComOsDeBaixo(r.id, ctx.assuntos)] }))
      .filter((g) => g.valores.length > 1);
    out.push({
      id: 'assunto', titulo: 'Por assunto', multiplo: false, filtro: 'assunto', grupos,
      itens: ranking(para('assunto', !!f.assunto), (d) => (d.c.assuntoId ? [d.c.assuntoId] : []), marcados, (k) => (k === VAZIO ? 'Sem assunto' : caminho(k))),
    });
  }
  out.push({
    id: 'cliente', titulo: 'Por cliente', multiplo: false, filtro: 'cliente',
    itens: ranking(para('cliente', !!f.cliente), (d) => (d.c.clienteId ? [d.c.clienteId] : []), escolhido(f.cliente),
      (k) => (k === VAZIO ? 'Sem cliente' : ctx.clientes.get(k)?.nome ?? 'Cliente fora da base')),
  });
  if (usa.tipo) {
    out.push({
      id: 'tipo', titulo: 'Por tipo de chamado', multiplo: false, filtro: 'tipo',
      itens: ranking(para('tipo', !!f.tipo), (d) => (d.c.tipo ? [d.c.tipo] : []), escolhido(f.tipo), (k) => (k === VAZIO ? 'Não preenchido' : k)),
    });
  }
  if (usa.gravidade) {
    out.push({
      id: 'gravidade', titulo: 'Por gravidade', multiplo: false, filtro: 'gravidade',
      itens: ranking(para('gravidade', !!f.gravidade), (d) => (d.c.gravidade ? [d.c.gravidade] : []), escolhido(f.gravidade),
        (k) => (k === VAZIO ? 'Não preenchido' : NOME_GRAVIDADE[k as Gravidade] ?? k)),
    });
  }
  if (usa.prioridade !== false) {
    out.push({
      id: 'prioridade', titulo: 'Por prioridade', sub: 'da mais urgente para a menos', multiplo: false, naOrdem: true, filtro: 'prioridade',
      itens: ranking(para('prioridade', !!f.prioridade), (d) => (d.c.prioridade ? [d.c.prioridade] : []), escolhido(f.prioridade),
        (k) => (k === VAZIO ? 'Sem prioridade' : NOME_PRIORIDADE[k as Prioridade] ?? k),
        (k) => (k === VAZIO ? 99 : PRIORIDADES.indexOf(k as Prioridade))),
    });
  }
  if (usa.produtos) {
    out.push({
      id: 'produto', titulo: 'Por produto', sub: 'um chamado pode contar em mais de um', multiplo: true, filtro: 'produto',
      itens: ranking(para('produto', !!f.produto), (d) => d.c.produtos, escolhido(f.produto), (k) => (k === VAZIO ? 'Nenhum produto' : ctx.produtos.get(k) ?? 'Produto que saiu')),
    });
  }
  if (usa.operadoras) {
    out.push({
      id: 'operadora', titulo: 'Por operadora', sub: 'um chamado pode contar em mais de uma', multiplo: true, filtro: 'operadora',
      itens: ranking(para('operadora', !!f.operadora), (d) => d.c.operadoras, escolhido(f.operadora), (k) => (k === VAZIO ? 'Nenhuma operadora' : ctx.operadoras.get(k) ?? 'Operadora que saiu')),
    });
  }
  out.push({
    id: 'origem', titulo: 'Por canal (como chegou)', multiplo: false, filtro: 'origem',
    itens: ranking(para('origem', !!f.origem), (d) => [d.c.origem], escolhido(f.origem, []), (k) => NOME_ORIGEM[k as Origem] ?? k),
  });
  if (p.todos.some((d) => d.c.etiquetas.length)) {
    // a etiqueta é pelo nome (é o que o chamado guarda); a do filtro vale sem olhar maiúscula e acento
    const nomeDa = new Map<string, string>();
    for (const d of p.todos) for (const e of d.c.etiquetas) if (!nomeDa.has(paraBusca(e))) nomeDa.set(paraBusca(e), e);
    const esc = !f.etiqueta ? new Set<string>() : f.etiqueta === S ? new Set([VAZIO]) : new Set([nomeDa.get(paraBusca(f.etiqueta)) ?? f.etiqueta]);
    out.push({
      id: 'etiqueta', titulo: 'Por etiqueta', sub: 'um chamado pode ter várias', multiplo: true, filtro: 'etiqueta',
      itens: ranking(para('etiqueta', !!f.etiqueta), (d) => [...new Set(d.c.etiquetas.map((e) => nomeDa.get(paraBusca(e)) ?? e))], esc, (k) => (k === VAZIO ? 'Sem etiqueta' : k)),
    });
  }
  for (const campo of ctx.campos) {
    const usado = p.todos.some((d) => valoresDoCampoDoChamado(d.c, campo.id).length);
    if (!campo.ativo && !usado) continue;
    const dim = `campo:${campo.id}`;
    const filtrando = dimDoCampo(f) === dim;
    const opcao = filtrando ? f.campo!.slice(f.campo!.indexOf(':') + 1) : '';
    const esc = !filtrando ? new Set<string>() : new Set([opcao ? `${campo.id}:${opcao}` : VAZIO]);
    const nomes = new Map(campo.opcoes.map((o) => [o.id, o.nome]));
    out.push({
      id: dim, titulo: `Por ${campo.nome.toLowerCase()}`, sub: campo.varios ? 'um chamado pode contar em mais de um' : undefined, multiplo: !!campo.varios, filtro: 'campo',
      itens: ranking(para(dim, filtrando), (d) => valoresDoCampoDoChamado(d.c, campo.id).map((v) => `${campo.id}:${v}`), esc,
        (k) => (k === VAZIO ? 'Não preenchido' : nomes.get(k.slice(campo.id.length + 1)) ?? 'Opção que saiu')),
    });
  }
  return out;
}

/** Os ids dos gráficos que o painel tem (para montar a arrumação sem contar nada). */
export function graficosDaVisao(chamados: readonly ChamadoParaRelatorios[], ctx: ContextoDosRelatorios): string[] {
  const usa = ctx.painel.usa;
  const ids = ['serie', 'etapa', 'responsavel'];
  if (usa.assunto) ids.push('assunto');
  ids.push('cliente');
  if (usa.tipo) ids.push('tipo');
  if (usa.gravidade) ids.push('gravidade');
  if (usa.prioridade !== false) ids.push('prioridade');
  if (usa.produtos) ids.push('produto');
  if (usa.operadoras) ids.push('operadora');
  ids.push('origem');
  const doCliente = chamados.filter((c) => c.tipoChamado !== 'problema');
  if (doCliente.some((c) => c.etiquetas.length)) ids.push('etiqueta');
  for (const campo of ctx.campos) if (campo.ativo || doCliente.some((c) => valoresDoCampoDoChamado(c, campo.id).length)) ids.push(`campo:${campo.id}`);
  return ids;
}

/**
 * A Visão geral de um painel: os números de cima, os chamados no tempo, os gráficos de lista e a página da tabela.
 * `chamados`: os do painel, fora da lixeira (os problemas ficam de fora aqui dentro).
 */
export function visaoDoPainel(chamados: readonly ChamadoParaRelatorios[], ctx: ContextoDosRelatorios, f: FiltroDaVisao, agora: Date = new Date()): VisaoDoPainel {
  const hoje = diaLocal(agora);
  const { de, ate } = periodo(f, hoje);
  const p: Prep = {
    ctx, f, agora, hoje, de, ate, dias: diasEntre(de, ate) + 1,
    todos: chamados.filter((c) => c.tipoChamado !== 'problema').map((c) => derivarChamado(c, ctx, agora)),
    assuntoSet: f.assunto && f.assunto !== SEM_VALOR_NA_VISAO ? assuntoComOsDeBaixo(f.assunto, ctx.assuntos) : null,
    limiteParado: agora.getTime() - DIAS_PARADO_NA_VISAO * 86_400_000,
  };
  const { recorte } = recortar(p);
  const semQuando = quandoValido(p) ? recortar(p, { quando: true }).recorte : recorte;
  // a tabela: o mais novo primeiro (com "resolvidos", o resolvido mais recente)
  const ordenados = [...recorte].sort((a, b) => (momento(b, f.situacao) ?? '').localeCompare(momento(a, f.situacao) ?? ''));
  const paginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA_DA_VISAO));
  const pagina = Math.min(f.p ?? 1, paginas);
  const itens = ordenados.slice((pagina - 1) * POR_PAGINA_DA_VISAO, pagina * POR_PAGINA_DA_VISAO).map((d) => linhaDoChamadoDoRelatorio(d.c, ctx));
  return {
    painel: { id: ctx.painel.id, nome: ctx.painel.nome, sigla: ctx.painel.sigla },
    parte: f.parte, de, ate, hoje, primeiroDia: primeiroDiaDe(p), agora: agora.toISOString(),
    contaPrazo: ctx.painel.contaPrazo,
    total: recorte.length,
    kpis: kpis(p),
    serie: serie(semQuando, p),
    graficos: graficos(p),
    lista: { total: ordenados.length, pagina, porPagina: POR_PAGINA_DA_VISAO, itens },
  };
}

/** O rótulo da coluna do tempo clicada ("Hora: 10h", "Dia: 27/10", "Mês: out/26"). */
export function rotuloDoQuando(q: string, f: Pick<FiltroDaVisao, 'situacao'>): { nome: string; valor: string } {
  const res = f.situacao === 'resolvidos' ? 'Resolvido ' : '';
  if (/^\d{1,2}$/.test(q)) return { nome: res ? 'Resolvido às' : 'Chegou às', valor: `${q.padStart(2, '0')}h` };
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return { nome: res ? `${res}em` : 'Chegou em', valor: `${diaCurto(q)}/${q.slice(0, 4)}` };
  return { nome: res ? `${res}em` : 'Chegou em', valor: mesCurto(q) };
}

/** O nome de cada situação, como a lista dos filtros escreve ("Só os vencidos"). */
export const NOME_DA_SITUACAO_DA_VISAO: Record<SituacaoDaVisao, string> = {
  vencidos: 'com o prazo vencido', parados: `parados há ${DIAS_PARADO_NA_VISAO} dias ou mais`, 'sem-responsavel': 'sem responsável', resolvidos: 'resolvidos',
};
