/**
 * AS CONDIÇÕES ESPECIAIS DA NEGOCIAÇÃO (Patch 2.4; refeitas no 2.4.1) — o que foi combinado com o cliente além do valor: o
 * desconto na mensalidade, com prazo ou sem, o desconto na ativação, em quantas vezes ela vai e quando começa a ser paga, e o
 * que mais foi acertado.
 *
 * O pedido do Luan (31/10): "preciso que haja uma área destinada a negociação, por exemplo esse cliente aqui eu concedi um
 * desconto de 200 reais até março do ano que vem, além disso a ativação só vai ser paga a partir de março tbm e dividida em 6
 * vezes". E no 2.4.1 (03/11): "n precisa ter o de, pq subentendesse que vai ser a partir do primeiro mes de faturameno que é
 * quando eu marco cmo ganho, se eu quiser fornecer um desconto sem prazo, temq ter essa opção tbm, a ativação tbm n ficou legal o
 * formato, se dar um desconto na aticvação? e o nome tem q ser condições especiais".
 *
 *  - **O 1º mês de faturamento** é o mês do Ganho (antes do Ganho, as contas usam o mês de hoje, de exemplo).
 *  - **Os descontos na mensalidade vêm em sequência**: o primeiro começa no 1º mês de faturamento e vai até o mês dele; o
 *    seguinte começa logo depois ("R$ 200 até março, depois R$ 100 sem prazo"). Só o último pode ser **sem prazo**.
 *  - **A ativação**: o desconto nela (em reais), em quantas vezes e o mês da 1ª parcela (nulo: o 1º mês de faturamento).
 *
 * A mensalidade e a ativação continuam as da negociação (as que contam no quadro, na meta e no relatório): as condições dizem
 * **como** elas vão ser cobradas, mês a mês. O servidor, a prévia e a tela usam as mesmas funções daqui.
 *
 * O que foi guardado no formato do 2.4 continua valendo: o "de" do desconto fica de fora (ele começa no 1º mês) e a ativação
 * sem desconto é a mesma de antes.
 */
import { z } from 'zod';
import { reais } from './formatos.js';

/** Um mês do calendário, AAAA-MM. */
const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const MesSchema = z.string().trim().regex(MES, 'Escolha o mês (mês/ano)');
const MAX_CENTAVOS = 1_000_000_000;
const Centavos = z.number().int('O valor vai em centavos').min(1, 'O desconto precisa de um valor').max(MAX_CENTAVOS, 'Valor alto demais');

/** Um desconto na mensalidade: o valor por mês e o último mês com ele (nulo: sem prazo). Começa logo depois do anterior. */
export type DescontoDaNegociacao = { valor: number; ate: string | null };
/** A ativação combinada: o desconto nela (nulo: sem), em quantas vezes e o mês da 1ª parcela (nulo: o 1º mês de faturamento). */
export type AtivacaoCombinada = { desconto: number | null; vezes: number; aPartirDe: string | null };
export type CondicoesDaNegociacao = {
  descontos: DescontoDaNegociacao[];
  ativacao: AtivacaoCombinada | null;
  /** o que mais foi combinado, em texto */
  observacao: string | null;
};

/** O nome no histórico e na ficha (2.4.1: "o nome tem q ser condições especiais"). */
export const NOME_CONDICOES = 'Condições especiais';
export const MAX_DESCONTOS_DA_NEGOCIACAO = 5;
export const MAX_VEZES_DA_ATIVACAO_COMBINADA = 24;

const CondicoesBaseSchema = z.object({
  descontos: z.array(z.object({
    valor: Centavos,
    ate: MesSchema.nullish().transform((v) => v || null),
  })).max(MAX_DESCONTOS_DA_NEGOCIACAO, `Até ${MAX_DESCONTOS_DA_NEGOCIACAO} descontos`).default([]),
  ativacao: z.object({
    desconto: z.number().int('O valor vai em centavos').min(0, 'O desconto não pode ser negativo').max(MAX_CENTAVOS, 'Valor alto demais').nullish().transform((v) => v || null),
    vezes: z.number().int('As vezes vão em número inteiro').min(1, 'Pelo menos 1 vez').max(MAX_VEZES_DA_ATIVACAO_COMBINADA, `Até ${MAX_VEZES_DA_ATIVACAO_COMBINADA} vezes`).default(1),
    aPartirDe: MesSchema.nullish().transform((v) => v || null),
  }).nullish().transform((v) => (v && (v.desconto || v.vezes > 1 || v.aPartirDe) ? v : null)),
  observacao: z.string().trim().max(1000, 'A observação vai até 1.000 letras').nullish().transform((v) => v || null),
});

/** O que chega para gravar: os descontos em sequência (cada um termina depois do anterior; só o último sem prazo). */
export const CondicoesDaNegociacaoSchema = CondicoesBaseSchema.superRefine((c, ctx) => {
  for (let i = 1; i < c.descontos.length; i++) {
    const antes = c.descontos[i - 1]!.ate;
    const este = c.descontos[i]!.ate;
    if (antes === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['descontos', i - 1, 'ate'], message: 'Só o último desconto pode ser sem prazo' });
    else if (este !== null && este <= antes) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['descontos', i, 'ate'], message: 'Cada desconto termina depois do anterior' });
  }
});
export type CondicoesDaNegociacaoEntrada = z.input<typeof CondicoesDaNegociacaoSchema>;

/**
 * As condições guardadas (o JSON do banco) no formato certo; vazias ou malformadas: nulo. As do 2.4 entram também: o "de" fica
 * de fora e os descontos vão na ordem do mês em que acabam (o sem prazo por último; um mês repetido fica com o primeiro).
 */
export function condicoesGuardadas(v: unknown): CondicoesDaNegociacao | null {
  if (!v || typeof v !== 'object') return null;
  const r = CondicoesBaseSchema.safeParse(v);
  if (!r.success) return null;
  const ordem = [...r.data.descontos].sort((a, b) => (a.ate ?? '9999-99').localeCompare(b.ate ?? '9999-99'));
  const descontos: DescontoDaNegociacao[] = [];
  for (const d of ordem) {
    const ultimo = descontos[descontos.length - 1];
    if (ultimo && (ultimo.ate === null || ultimo.ate === d.ate)) continue;
    descontos.push(d);
  }
  const c = { ...r.data, descontos };
  return semCondicoes(c) ? null : c;
}

/** Nada combinado: sem desconto, sem a ativação combinada e sem observação. */
export const semCondicoes = (c: CondicoesDaNegociacao | null | undefined) => !c || (!c.descontos.length && !c.ativacao && !c.observacao);

/** As mesmas condições (para não gravar nem pôr no histórico o que não mudou). */
export function mesmasCondicoes(a: CondicoesDaNegociacao | null | undefined, b: CondicoesDaNegociacao | null | undefined): boolean {
  const norm = (c: CondicoesDaNegociacao | null | undefined) => (semCondicoes(c) ? null : JSON.stringify({
    d: c!.descontos.map((x) => [x.valor, x.ate ?? null]),
    a: c!.ativacao ? [c!.ativacao.desconto ?? null, c!.ativacao.vezes, c!.ativacao.aPartirDe ?? null] : null,
    o: c!.observacao,
  }));
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
/** Quantos meses de um mês a outro ("2026-11" a "2027-03": 4). */
export function mesesEntre(de: string, ate: string): number {
  const x = MES.exec(de);
  const y = MES.exec(ate);
  if (!x || !y) return 0;
  return (Number(y[1]) * 12 + Number(y[2])) - (Number(x[1]) * 12 + Number(x[2]));
}
/** O mês de hoje (ou de um momento qualquer), em Brasília (AAAA-MM). */
export function mesDeHoje(agora: Date = new Date()): string {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(agora);
  return s.slice(0, 7);
}

/**
 * O 1º mês de faturamento: o mês em que a negociação foi marcada como Ganho (o dia que ficou no Ganho, em Brasília). Antes do
 * Ganho (ou no Perdido), o mês de hoje, só de exemplo (`doGanho` falso).
 */
export function primeiroMesDeFaturamento(n: { resultado: string | null; fechadoEm: string | null }, agora: Date = new Date()): { mes: string; doGanho: boolean } {
  if (n.resultado === 'ganho' && n.fechadoEm) return { mes: mesDeHoje(new Date(n.fechadoEm)), doGanho: true };
  return { mes: mesDeHoje(agora), doGanho: false };
}

/** "6 vezes" / "1 vez". */
export const vezesEscritas = (n: number) => `${n} ${n === 1 ? 'vez' : 'vezes'}`;

/** A ativação que fica para pagar (o valor menos o desconto, nunca abaixo de zero) e o valor de cada parcela (a 1ª leva os centavos que sobram). */
export function ativacaoAPagar(ativacao: number | null, a: AtivacaoCombinada | null): { valor: number; desconto: number; aPagar: number; parcela: number; primeira: number; vezes: number } {
  const valor = Math.max(0, ativacao ?? 0);
  const desconto = Math.min(valor, a?.desconto ?? 0);
  const aPagar = valor - desconto;
  const vezes = a?.vezes ?? 1;
  const parcela = Math.floor(aPagar / vezes);
  return { valor, desconto, aPagar, parcela, primeira: aPagar - parcela * (vezes - 1), vezes };
}

/** O texto da ativação combinada: "com R$ 500,00 de desconto, em 6 vezes, a partir de mar/2027". */
function textoDaAtivacao(a: AtivacaoCombinada): string {
  const partes = [
    ...(a.desconto ? [`com ${reais(a.desconto)} de desconto`] : []),
    ...(a.vezes > 1 ? [`em ${vezesEscritas(a.vezes)}`] : []),
    ...(a.aPartirDe ? [a.vezes > 1 ? `a partir de ${mesEscrito(a.aPartirDe)}` : `paga em ${mesEscrito(a.aPartirDe)}`] : a.vezes > 1 ? ['a partir do 1º mês'] : []),
  ];
  return partes.join(', ');
}

/** O texto de um desconto na mensalidade: "R$ 200,00/mês até mar/2027" / "R$ 100,00/mês sem prazo". */
export const textoDoDesconto = (d: DescontoDaNegociacao) => `${reais(d.valor)}/mês ${d.ate ? `até ${mesEscrito(d.ate)}` : 'sem prazo'}`;

/**
 * As condições numa linha (o histórico): "Desconto de R$ 200,00/mês até mar/2027, depois R$ 100,00/mês sem prazo · Ativação com
 * R$ 500,00 de desconto, em 6 vezes, a partir de mar/2027".
 */
export function textoDasCondicoes(c: CondicoesDaNegociacao | null | undefined): string | null {
  if (semCondicoes(c)) return null;
  const partes = [
    ...(c!.descontos.length ? [`Desconto de ${c!.descontos.map((d, i) => `${i ? 'depois ' : ''}${textoDoDesconto(d)}`).join(', ')}`] : []),
    ...(c!.ativacao ? [`Ativação ${textoDaAtivacao(c!.ativacao)}`] : []),
    ...(c!.observacao ? [c!.observacao.replace(/\s+/g, ' ').slice(0, 160)] : []),
  ];
  return partes.join(' · ');
}

/** De que mês a que mês vai cada desconto (o primeiro começa no 1º mês de faturamento; o sem prazo não tem fim). */
export function mesesDosDescontos(descontos: DescontoDaNegociacao[], primeiro: string): Array<{ de: string; ate: string | null; meses: number | null }> {
  let de = primeiro;
  return descontos.map((d) => {
    const este = { de, ate: d.ate, meses: d.ate ? Math.max(0, mesesEntre(de, d.ate) + 1) : null };
    // o seguinte começa no mês depois deste (o que acabou antes de começar não ocupa mês nenhum)
    if (d.ate) de = mesMais(d.ate >= de ? d.ate : mesMais(de, -1), 1);
    return este;
  });
}

/** Um mês da cobrança: a mensalidade cheia, o desconto, o que se paga dela, a parcela da ativação e o total do mês. */
export type MesDaCobranca = { mes: string; mensalidade: number; desconto: number; aPagar: number; ativacao: number; parcela: number | null; total: number };

/**
 * Como fica a cobrança, mês a mês (o quadro da ficha), a partir do 1º mês de faturamento (`desde`): até o último mês que as
 * condições mexem — o fim do último desconto e a última parcela da ativação — e mais um, para mostrar a mensalidade cheia de
 * volta (no mínimo 3 meses, no máximo 24; com o desconto sem prazo, que não acaba, o mês em que ele começa e mais dois). Sem a
 * ativação combinada, ela vai inteira no 1º mês. O desconto não passa da mensalidade, nem o da ativação passa dela; a ativação
 * marcada para antes do 1º mês de faturamento começa nele.
 */
export function cobrancaMesAMes(e: { mensalidade: number | null; ativacao: number | null; condicoes: CondicoesDaNegociacao | null; desde: string }): MesDaCobranca[] {
  const c = e.condicoes;
  const mensal = Math.max(0, e.mensalidade ?? 0);
  const faixas = mesesDosDescontos(c?.descontos ?? [], e.desde);
  const conta = ativacaoAPagar(e.ativacao, c?.ativacao ?? null);
  const pedido = c?.ativacao?.aPartirDe ?? e.desde;
  const inicio = pedido > e.desde ? pedido : e.desde;
  const temAtivacao = conta.aPagar > 0;
  const ultimaParcela = temAtivacao ? mesMais(inicio, conta.vezes - 1) : null;
  const semPrazo = faixas.find((f) => f.ate === null);
  const fins = [...faixas.map((f) => f.ate ?? f.de), ultimaParcela].filter((x): x is string => !!x);
  const fim = fins.sort().pop() ?? e.desde;
  // com o sem prazo, a mensalidade não volta cheia: mostra o começo dele e mais dois meses
  const n = Math.min(24, Math.max(3, mesesEntre(e.desde, fim) + (semPrazo ? 3 : 2)));
  return Array.from({ length: n }, (_, i) => {
    const mes = mesMais(e.desde, i);
    const faixa = c?.descontos.findIndex((_, k) => faixas[k]!.de <= mes && (faixas[k]!.ate === null || mes <= faixas[k]!.ate!)) ?? -1;
    const desconto = faixa >= 0 ? Math.min(mensal, c!.descontos[faixa]!.valor) : 0;
    const k = temAtivacao ? mesesEntre(inicio, mes) : -1;
    const parcela = temAtivacao && k >= 0 && k < conta.vezes ? k + 1 : null;
    const ativacao = parcela ? (parcela === 1 ? conta.primeira : conta.parcela) : 0;
    return { mes, mensalidade: mensal, desconto, aPagar: mensal - desconto, ativacao, parcela, total: mensal - desconto + ativacao };
  });
}
