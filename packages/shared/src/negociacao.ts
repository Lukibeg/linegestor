/**
 * AS CONDIÇÕES DA NEGOCIAÇÃO (Patch 2.4) — o que foi combinado com o cliente além do valor: o desconto na mensalidade por um
 * tempo, a ativação que começa a ser paga mais tarde e em vezes, e o que mais foi acertado.
 *
 * O pedido do Luan (31/10): "preciso que haja uma área destinada a negociação, por exemplo esse cliente aqui eu concedi um
 * desconto de 200 reais até março do ano que vem, além disso a ativação só vai ser paga a partir de março tbm e dividida em 6
 * vezes".
 *
 * A mensalidade e a ativação continuam as da negociação (as que contam no quadro, na meta e no relatório): as condições dizem
 * **como** elas vão ser cobradas, mês a mês. O servidor, a prévia e a tela usam as mesmas funções daqui.
 */
import { z } from 'zod';
import { reais } from './formatos.js';

/** Um mês do calendário, AAAA-MM. */
const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const MesSchema = z.string().trim().regex(MES, 'Escolha o mês (mês/ano)');
const Centavos = z.number().int('O valor vai em centavos').min(1, 'O desconto precisa de um valor').max(1_000_000_000, 'Valor alto demais');

/** Um desconto na mensalidade: o valor por mês, de um mês (nulo: desde o começo) até outro (o último com o desconto). */
export type DescontoDaNegociacao = { valor: number; de: string | null; ate: string };
/** A ativação combinada: o mês da primeira parcela e em quantas vezes. */
export type AtivacaoCombinada = { aPartirDe: string; vezes: number };
export type CondicoesDaNegociacao = {
  descontos: DescontoDaNegociacao[];
  ativacao: AtivacaoCombinada | null;
  /** o que mais foi combinado, em texto */
  observacao: string | null;
};

/** O nome no histórico e na ficha. */
export const NOME_CONDICOES = 'Condições combinadas';
export const MAX_DESCONTOS_DA_NEGOCIACAO = 5;
export const MAX_VEZES_DA_ATIVACAO_COMBINADA = 24;

export const CondicoesDaNegociacaoSchema = z.object({
  descontos: z.array(z.object({
    valor: Centavos,
    de: MesSchema.nullish().transform((v) => v || null),
    ate: MesSchema,
  })).max(MAX_DESCONTOS_DA_NEGOCIACAO, `Até ${MAX_DESCONTOS_DA_NEGOCIACAO} descontos`).default([]),
  ativacao: z.object({
    aPartirDe: MesSchema,
    vezes: z.number().int('As vezes vão em número inteiro').min(1, 'Pelo menos 1 vez').max(MAX_VEZES_DA_ATIVACAO_COMBINADA, `Até ${MAX_VEZES_DA_ATIVACAO_COMBINADA} vezes`),
  }).nullish().transform((v) => v ?? null),
  observacao: z.string().trim().max(1000, 'A observação vai até 1.000 letras').nullish().transform((v) => v || null),
}).superRefine((c, ctx) => {
  for (const [i, d] of c.descontos.entries()) {
    if (d.de && d.de > d.ate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['descontos', i, 'ate'], message: 'O desconto termina antes de começar' });
  }
});
export type CondicoesDaNegociacaoEntrada = z.input<typeof CondicoesDaNegociacaoSchema>;

/** As condições guardadas (o JSON do banco) no formato certo; vazias ou malformadas: nulo. */
export function condicoesGuardadas(v: unknown): CondicoesDaNegociacao | null {
  if (!v || typeof v !== 'object') return null;
  const r = CondicoesDaNegociacaoSchema.safeParse(v);
  return r.success ? semCondicoes(r.data) ? null : r.data : null;
}

/** Nada combinado: sem desconto, sem a ativação combinada e sem observação. */
export const semCondicoes = (c: CondicoesDaNegociacao | null | undefined) => !c || (!c.descontos.length && !c.ativacao && !c.observacao);

/** As mesmas condições (para não gravar nem pôr no histórico o que não mudou). */
export function mesmasCondicoes(a: CondicoesDaNegociacao | null | undefined, b: CondicoesDaNegociacao | null | undefined): boolean {
  const norm = (c: CondicoesDaNegociacao | null | undefined) => (semCondicoes(c) ? null : JSON.stringify({ d: c!.descontos.map((x) => [x.valor, x.de, x.ate]), a: c!.ativacao ? [c!.ativacao.aPartirDe, c!.ativacao.vezes] : null, o: c!.observacao }));
  return norm(a) === norm(b);
}

const NOMES_DOS_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "mar/2027" (o mês escrito como se fala). */
export function mesEscrito(mes: string): string {
  const m = MES.exec(mes);
  return m ? `${NOMES_DOS_MESES[Number(m[2]) - 1]}/${m[1]}` : mes;
}
/** O mês somado a n meses: "2026-11" + 4 = "2027-03". */
export function mesMais(mes: string, n: number): string {
  const m = MES.exec(mes);
  if (!m) return mes;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
/** O mês de hoje, em Brasília (AAAA-MM). */
export function mesDeHoje(agora: Date = new Date()): string {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(agora);
  return s.slice(0, 7);
}

/** As condições numa linha (o histórico e o cartão): "Desconto de R$ 200,00/mês até mar/2027 · Ativação a partir de mar/2027, em 6 vezes". */
export function textoDasCondicoes(c: CondicoesDaNegociacao | null | undefined): string | null {
  if (semCondicoes(c)) return null;
  const partes = [
    ...c!.descontos.map((d) => `Desconto de ${reais(d.valor)}/mês ${d.de ? `de ${mesEscrito(d.de)} ` : ''}até ${mesEscrito(d.ate)}`),
    ...(c!.ativacao ? [`Ativação a partir de ${mesEscrito(c!.ativacao.aPartirDe)}, em ${c!.ativacao.vezes} ${c!.ativacao.vezes === 1 ? 'vez' : 'vezes'}`] : []),
    ...(c!.observacao ? [c!.observacao.replace(/\s+/g, ' ').slice(0, 160)] : []),
  ];
  return partes.join(' · ');
}

/** Um mês da cobrança: a mensalidade cheia, o desconto, o que se paga dela, a parcela da ativação e o total do mês. */
export type MesDaCobranca = { mes: string; mensalidade: number; desconto: number; aPagar: number; ativacao: number; parcela: number | null; total: number };

/**
 * Como fica a cobrança, mês a mês (o quadro da ficha): de `desde` (o mês de hoje) até o último mês que as condições mexem — o
 * fim do último desconto e a última parcela da ativação — e mais um, para mostrar a mensalidade cheia de volta (no mínimo 3
 * meses, no máximo 24). Sem a ativação combinada, ela não entra (a ativação à vista sai quando a equipe cobrar). O desconto não
 * passa da mensalidade; os centavos que sobram da divisão da ativação ficam na primeira parcela.
 */
export function cobrancaMesAMes(e: { mensalidade: number | null; ativacao: number | null; condicoes: CondicoesDaNegociacao | null; desde: string }): MesDaCobranca[] {
  const c = e.condicoes;
  const mensal = Math.max(0, e.mensalidade ?? 0);
  const ultimoDesconto = c?.descontos.reduce<string | null>((m, d) => (!m || d.ate > m ? d.ate : m), null) ?? null;
  const ultimaParcela = c?.ativacao ? mesMais(c.ativacao.aPartirDe, c.ativacao.vezes - 1) : null;
  const fim = [ultimoDesconto, ultimaParcela].filter((x): x is string => !!x).sort().pop() ?? e.desde;
  const distancia = (a: string, b: string) => { const x = MES.exec(a)!; const y = MES.exec(b)!; return (Number(y[1]) * 12 + Number(y[2])) - (Number(x[1]) * 12 + Number(x[2])); };
  const n = Math.min(24, Math.max(3, distancia(e.desde, fim) + 2));
  const total = Math.max(0, e.ativacao ?? 0);
  const vezes = c?.ativacao?.vezes ?? 0;
  const base = vezes ? Math.floor(total / vezes) : 0;
  const sobra = vezes ? total - base * vezes : 0;
  return Array.from({ length: n }, (_, i) => {
    const mes = mesMais(e.desde, i);
    const desconto = Math.min(mensal, (c?.descontos ?? []).filter((d) => (!d.de || d.de <= mes) && mes <= d.ate).reduce((s, d) => s + d.valor, 0));
    const k = c?.ativacao ? distancia(c.ativacao.aPartirDe, mes) : -1;
    const parcela = c?.ativacao && k >= 0 && k < vezes ? k + 1 : null;
    const ativacao = parcela ? base + (parcela === 1 ? sobra : 0) : 0;
    return { mes, mensalidade: mensal, desconto, aPagar: mensal - desconto, ativacao, parcela, total: mensal - desconto + ativacao };
  });
}
