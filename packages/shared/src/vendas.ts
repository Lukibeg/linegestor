/**
 * O RELATÓRIO DE VENDAS (Patch 2.0.1, decisão 0050) — os números de um painel de Vendas no período, o
 * que o Luan escolheu (17/10, "nada muito complexo"): os **números do período** (as novas, as ganhas e as
 * perdidas, em quantidade e em R$, a conversão e o ticket médio) e o **funil** (das criadas no período,
 * quantas chegaram a cada etapa, quantas se perderam em cada uma e quantas foram ganhas).
 *
 * As contas moram aqui: o servidor e a prévia usam as mesmas. O dia é o de Brasília; o ganho e a perda
 * contam no dia em que a negociação acabou (quem marca escolhe o dia, como o "Data de conclusão" do Helena).
 */
import { z } from 'zod';
import { diaLocal } from './atendimento-prazos.js';
import { diasEntre, somarDias } from './chamados.js';
import { somarMeses } from './relatorios.js';
import type { EtapaPainel, Painel, ResultadoDaVenda } from './atendimento.js';

/** Uma negociação, com o que o relatório precisa (a trajetória pelas etapas já montada). */
export type NegociacaoParaRelatorio = {
  id: string;
  /** em centavos (nulo = sem valor ainda) */
  valor: number | null;
  criadoEm: string;
  fechadoEm: string | null;
  resultado: ResultadoDaVenda | null;
  /** por onde passou: cada etapa, quando entrou e quando saiu (nulo = está nela) */
  passagens: Array<{ etapaId: string; desde: string; ate: string | null }>;
};

/** O período (AAAA-MM-DD, os dois dias contam). */
export const FiltroDoRelatorioDeVendasSchema = z.object({
  painel: z.string().min(1, 'Escolha o painel'),
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A data vai como dia/mês/ano'),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A data vai como dia/mês/ano'),
}).refine((f) => f.ate >= f.de, 'O fim do período vem depois do começo.')
  .refine((f) => diasEntre(f.de, f.ate) <= 731, 'O período vai até 2 anos.');
export type FiltroDoRelatorioDeVendas = z.infer<typeof FiltroDoRelatorioDeVendasSchema>;

type Soma = { qtd: number; valor: number };

export type RelatorioDeVendas = {
  painelId: string;
  periodo: { de: string; ate: string };
  /** os números do período */
  numeros: {
    /** criadas no período */
    novos: Soma;
    /** ganhas e perdidas no período (pelo dia em que acabaram) */
    ganhos: Soma;
    perdidos: Soma;
    /** ganhas ÷ (ganhas + perdidas), em % (nulo sem nenhuma que acabou) */
    conversao: number | null;
    /** o valor médio do que foi ganho (nulo sem ganho com valor) */
    ticketMedio: number | null;
  };
  /**
   * O funil das criadas no período, nas etapas que não fecham (na ordem do painel): quantas chegaram até
   * cada uma (a ganha chegou ao fim) e quantas se perderam nela (a etapa em que estavam ao perder).
   */
  funil: Array<{ etapaId: string; nome: string; chegaram: number; perdidas: number }>;
  /** quantas das criadas no período foram ganhas (o fim do funil) */
  funilGanhas: number;
};

const dia = (iso: string) => diaLocal(new Date(iso));
const noPeriodo = (d: string, de: string, ate: string) => d >= de && d <= ate;
const somar = (xs: readonly NegociacaoParaRelatorio[]): Soma => ({ qtd: xs.length, valor: xs.reduce((t, n) => t + (n.valor ?? 0), 0) });
const porcento = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/**
 * A trajetória da negociação pelas etapas, a partir dos eventos: a etapa em que nasceu (o "criado") e
 * cada mudança de etapa depois. Sem eventos (um cartão antigo), fica a etapa de agora desde a criação.
 */
export function passagensDosEventos(
  criadoEm: string, etapaAtual: string,
  eventos: Array<{ tipo: string; em: string; dados: Record<string, any> }>,
): NegociacaoParaRelatorio['passagens'] {
  const ordem = [...eventos].sort((a, b) => a.em.localeCompare(b.em));
  const criado = ordem.find((e) => e.tipo === 'criado');
  const movimentos = ordem.filter((e) => e.tipo === 'etapa' && e.dados?.para?.id);
  const inicial = (criado?.dados?.etapaId as string | undefined) ?? (movimentos[0]?.dados?.de?.id as string | undefined) ?? etapaAtual;
  const passagens: NegociacaoParaRelatorio['passagens'] = [{ etapaId: inicial, desde: criadoEm, ate: null }];
  for (const m of movimentos) {
    passagens[passagens.length - 1]!.ate = m.em;
    passagens.push({ etapaId: m.dados.para.id as string, desde: m.em, ate: null });
  }
  return passagens;
}

/**
 * A negociação que veio de outro painel (o suporte passou o pedido para o Comercial) começa, para o
 * relatório, quando entrou neste: as passagens de antes ficam de fora. `etapasDoPainel`: todas as etapas
 * do painel, inclusive as que saíram.
 */
export function passagensNoPainel(passagens: NegociacaoParaRelatorio['passagens'], etapasDoPainel: ReadonlySet<string>): NegociacaoParaRelatorio['passagens'] {
  let i = passagens.length;
  while (i > 0 && etapasDoPainel.has(passagens[i - 1]!.etapaId)) i--;
  return i < passagens.length ? passagens.slice(i) : passagens.slice(-1);
}

/** O relatório de um painel de Vendas no período. */
export function relatorioDeVendas(
  painel: Pick<Painel, 'id' | 'etapas'>,
  negociacoes: readonly NegociacaoParaRelatorio[],
  filtro: Pick<FiltroDoRelatorioDeVendas, 'de' | 'ate'>,
): RelatorioDeVendas {
  const { de, ate } = filtro;
  const ordem = new Map(painel.etapas.map((e, i) => [e.id, i]));
  const ehFinal = (etapaId: string) => !!painel.etapas.find((e) => e.id === etapaId)?.resultado;

  const novas = negociacoes.filter((n) => noPeriodo(dia(n.criadoEm), de, ate));
  const acabou = (r: ResultadoDaVenda) => negociacoes.filter((n) => n.resultado === r && n.fechadoEm && noPeriodo(dia(n.fechadoEm), de, ate));
  const ganhas = acabou('ganho');
  const perdidas = acabou('perdido');
  const comValor = ganhas.filter((n) => n.valor !== null);

  // até onde chegou (a etapa mais adiante por onde passou, sem as finais) e onde estava ao perder
  const alcance = (n: NegociacaoParaRelatorio) => Math.max(...n.passagens.filter((p) => !ehFinal(p.etapaId)).map((p) => ordem.get(p.etapaId) ?? -1), -1);
  const ondePerdeu = (n: NegociacaoParaRelatorio) => [...n.passagens].reverse().find((p) => !ehFinal(p.etapaId))?.etapaId ?? null;
  const funil = painel.etapas.filter((e) => !e.resultado && e.tipo !== 'fechado').map((e) => {
    const posicao = ordem.get(e.id) ?? 0;
    return {
      etapaId: e.id, nome: e.nome,
      chegaram: novas.filter((n) => n.resultado === 'ganho' || alcance(n) >= posicao).length,
      perdidas: novas.filter((n) => n.resultado === 'perdido' && ondePerdeu(n) === e.id).length,
    };
  });

  return {
    painelId: painel.id, periodo: { de, ate },
    numeros: {
      novos: somar(novas), ganhos: somar(ganhas), perdidos: somar(perdidas),
      conversao: porcento(ganhas.length, ganhas.length + perdidas.length),
      ticketMedio: comValor.length ? Math.round(somar(comValor).valor / comValor.length) : null,
    },
    funil, funilGanhas: novas.filter((n) => n.resultado === 'ganho').length,
  };
}

/** O período padrão do relatório: do primeiro dia do mês até hoje (Brasília). */
export function periodoDoMes(agora: Date = new Date()): { de: string; ate: string } {
  const hoje = diaLocal(agora);
  return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
}
/** Os atalhos de período do relatório. */
export function periodosDoRelatorio(agora: Date = new Date()): Array<{ id: string; nome: string; de: string; ate: string }> {
  const hoje = diaLocal(agora);
  const mes = hoje.slice(0, 7);
  const fimDoMes = (m: string) => somarDias(`${somarMeses(m, 1)}-01`, -1);
  const trimestre = `${hoje.slice(0, 4)}-${String(Math.floor((Number(hoje.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}`;
  return [
    { id: 'mes', nome: 'Este mês', de: `${mes}-01`, ate: hoje },
    { id: 'anterior', nome: 'Mês passado', de: `${somarMeses(mes, -1)}-01`, ate: fimDoMes(somarMeses(mes, -1)) },
    { id: 'trimestre', nome: 'Este trimestre', de: `${trimestre}-01`, ate: hoje },
    { id: '90', nome: 'Últimos 90 dias', de: somarDias(hoje, -89), ate: hoje },
    { id: 'ano', nome: 'Este ano', de: `${hoje.slice(0, 4)}-01-01`, ate: hoje },
  ];
}

/** Para os testes e a prévia: a etapa pelo nome. */
export const etapaPeloNome = (etapas: readonly EtapaPainel[], nome: string) => etapas.find((e) => e.nome === nome);
