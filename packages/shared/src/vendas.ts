/**
 * O RELATÓRIO DE VENDAS (Patch 2.0.1, decisão 0050) — o relatório do Comercial. O que o Luan escolheu
 * (17/10, "nada muito complexo"): os **números do período** (as novas, as ganhas e as perdidas, em
 * quantidade e em R$, a conversão e o ticket médio) e o **funil** (das que entraram no período, quantas
 * chegaram a cada etapa, quantas se perderam em cada uma e quantas foram ganhas). Na segunda volta ("não
 * ficou legal, dê uma melhorada"), no jeito dos relatórios do Suporte: cada número comparado com o
 * período anterior e, clicando num número, as negociações por trás dele. A meta do mês e as frases de
 * destaque também entraram e saíram (17/10: "n quero isso de meta", "n quero esses destaques"); a meta
 * continua no cartão do painel. E, no mesmo dia, **os ganhos mês a mês** ("eu quero um relatório que
 * compare meus ganhos mes a mes, algo parecido com o que tem hoje no helena"): os 12 meses que terminam
 * no mês do fim do período, cada um com o que mudou em relação ao mês anterior.
 *
 * Tudo isso é em mensalidades: a ativação (paga uma vez) não entra em nenhuma dessas somas. Em 19/10 ela
 * ganhou as contas dela, à parte ("quero que gere um kpi desse para ganho de ativações bem simples como
 * os que tem hoje", "um gráfico desse mas sobre apenas ativação"): o quanto de ativação foi ganho no
 * período e mês a mês, pelo mesmo dia em que a negociação foi ganha.
 *
 * As contas moram aqui: o servidor e a prévia usam as mesmas. O dia é o de Brasília; o ganho e a perda
 * contam no dia em que a negociação acabou (quem marca escolhe o dia, como o "Data de conclusão" do Helena).
 */
import { z } from 'zod';
import { diaLocal } from './atendimento-prazos.js';
import type { EtapaPainel, Painel, ResultadoDaVenda } from './atendimento.js';
import { diasEntre, somarDias } from './chamados.js';
import { mesCurto, nomeDoMes, somarMeses } from './relatorios.js';
import { margemDasGanhas, type FaixasDoSinal, type MargemDaNegociacao, type MargemDasGanhas } from './simulador.js';

/** Uma negociação, com o que o relatório precisa (a trajetória pelas etapas já montada). */
export type NegociacaoParaRelatorio = {
  id: string;
  codigo: string;
  titulo: string;
  /** o cliente do cadastro ou a empresa que ainda não é cliente */
  empresa: string | null;
  /** o nome de quem cuida */
  responsavel: string | null;
  /** a mensalidade, em centavos (nulo = sem valor ainda) */
  valor: number | null;
  /** a ativação (paga uma vez), em centavos: só nas contas da ativação */
  ativacao: number | null;
  /** a etapa em que está agora */
  etapaId: string;
  criadoEm: string;
  fechadoEm: string | null;
  resultado: ResultadoDaVenda | null;
  motivoPerda: string | null;
  /** por onde passou: cada etapa, quando entrou e quando saiu (nulo = está nela) */
  passagens: Array<{ etapaId: string; desde: string; ate: string | null }>;
  /** os nomes dos produtos da negociação (a margem por produto, 2.0.2) */
  produtos?: string[];
};

/** O período (AAAA-MM-DD, os dois dias contam). */
export const FiltroDoRelatorioDeVendasSchema = z.object({
  painel: z.string().min(1, 'Escolha o painel'),
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A data vai como dia/mês/ano'),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A data vai como dia/mês/ano'),
}).refine((f) => f.ate >= f.de, 'O fim do período vem depois do começo.')
  .refine((f) => diasEntre(f.de, f.ate) <= 731, 'O período vai até 2 anos.');
export type FiltroDoRelatorioDeVendas = z.infer<typeof FiltroDoRelatorioDeVendasSchema>;

/** Uma negociação na janela que abre ao clicar num número (o que está por trás dele). */
export type NegociacaoDoRelatorio = {
  id: string; codigo: string; titulo: string; empresa: string | null; responsavel: string | null;
  /** a mensalidade e a ativação, em centavos */
  valor: number | null; ativacao: number | null;
  /** o nome da etapa em que está agora */
  etapa: string;
  resultado: ResultadoDaVenda | null; motivoPerda: string | null;
  criadoEm: string; fechadoEm: string | null;
};

/** Quantas e quanto (em centavos), com as negociações por trás (os ids, para a janela). */
export type PecaDeVendas = { qtd: number; valor: number; ids: string[] };

/** Os números de um período. */
export type NumerosDeVendas = {
  /** criadas no período */
  novos: PecaDeVendas;
  /** ganhas e perdidas no período (pelo dia em que acabaram) */
  ganhos: PecaDeVendas;
  perdidos: PecaDeVendas;
  /** a ativação das ganhas no período: as que têm ativação, quantas e quanto (à parte da mensalidade) */
  ativacoes: PecaDeVendas;
  /** ganhas ÷ (ganhas + perdidas), em % (nulo sem nenhuma que acabou) */
  conversao: number | null;
  /** o valor médio do que foi ganho (nulo sem ganho com valor) */
  ticketMedio: number | null;
};

export type RelatorioDeVendas = {
  painelId: string;
  periodo: { de: string; ate: string };
  numeros: NumerosDeVendas;
  /**
   * O período com que se compara: o mesmo pedaço do mês anterior quando o período é de um mês só (do dia
   * 1 em diante: "Este mês", "Mês passado"); senão, o de mesmo tamanho, logo antes. `nome` completa a
   * frase "mais que …": "setembro", "o mesmo período de setembro", "o período anterior".
   */
  anterior: { de: string; ate: string; nome: string; numeros: NumerosDeVendas };
  /**
   * O funil das que entraram no período, nas etapas que não fecham (na ordem do painel): as que chegaram
   * até cada uma (a etapa mais adiante por onde passaram; a ganha chegou ao fim) e as que se perderam nela
   * (a etapa em que estavam ao perder). Os ids: a contagem é o tamanho da lista.
   */
  funil: Array<{ etapaId: string; nome: string; chegaram: string[]; perdidas: string[] }>;
  /** as que entraram no período e foram ganhas (o fim do funil) */
  funilGanhas: string[];
  /**
   * Os ganhos mês a mês: os 12 meses que terminam no mês do fim do período (o mais antigo primeiro).
   * O último conta até o fim do período (`ate`): `parcial` quando o período acaba antes do fim do mês.
   * `antes`: o ganho do mês anterior — no parcial, do mesmo pedaço do mês anterior (do dia 1 até o mesmo
   * dia), para comparar o que é comparável.
   */
  meses: MesDeVendas[];
  /** a ativação mês a mês: os mesmos 12 meses, com a ativação das ganhas em cada um (só as que têm ativação) */
  mesesDaAtivacao: MesDeVendas[];
  /** as negociações por trás dos números (as que entraram, as ganhas e as perdidas do período, e as ganhas de cada mês) */
  negociacoes: NegociacaoDoRelatorio[];
  /**
   * A margem das ganhas do período (2.0.2, o Simulador do Comercial): as que têm simulação ligada, no total e
   * por produto. Nulo quando o relatório é montado sem as simulações.
   */
  margem: MargemDasGanhas | null;
};

/** Um mês do mês a mês: quanto foi ganho nele (em centavos), quantas e quais, e quanto no mês anterior. */
export type MesDeVendas = { mes: string; nome: string; curto: string; ganho: number; qtd: number; ids: string[]; parcial: boolean; ate: string; antes: number };

const dia = (iso: string) => diaLocal(new Date(iso));
const noPeriodo = (d: string, de: string, ate: string) => d >= de && d <= ate;
const peca = (xs: readonly NegociacaoParaRelatorio[]): PecaDeVendas => ({ qtd: xs.length, valor: xs.reduce((t, n) => t + (n.valor ?? 0), 0), ids: xs.map((n) => n.id) });
/** A ativação de um grupo de ganhas: só as que têm ativação contam (quantas e quais). */
const pecaDaAtivacao = (xs: readonly NegociacaoParaRelatorio[]): PecaDeVendas => {
  const com = xs.filter((n) => (n.ativacao ?? 0) > 0);
  return { qtd: com.length, valor: com.reduce((t, n) => t + n.ativacao!, 0), ids: com.map((n) => n.id) };
};
const porcento = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
/** O último dia do mês (AAAA-MM). */
const fimDoMes = (mes: string) => somarDias(`${somarMeses(mes, 1)}-01`, -1);
/** "setembro" */
const mesPorExtenso = (mes: string) => nomeDoMes(mes).split(' de ')[0]!;

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

/**
 * O período com que se compara (ver `RelatorioDeVendas.anterior`): o mês inteiro com o mês anterior
 * inteiro; o pedaço de um mês (do dia 1 até o dia X) com o mesmo pedaço do mês anterior; o resto com o
 * período de mesmo tamanho, terminando na véspera.
 */
export function periodoDeComparacao(de: string, ate: string): { de: string; ate: string; nome: string } {
  const mes = de.slice(0, 7);
  if (de.endsWith('-01') && ate.slice(0, 7) === mes) {
    const antes = somarMeses(mes, -1);
    if (ate === fimDoMes(mes)) return { de: `${antes}-01`, ate: fimDoMes(antes), nome: mesPorExtenso(antes) };
    const ateAntes = `${antes}-${ate.slice(8, 10)}`;
    return { de: `${antes}-01`, ate: ateAntes > fimDoMes(antes) ? fimDoMes(antes) : ateAntes, nome: `o mesmo período de ${mesPorExtenso(antes)}` };
  }
  const dias = diasEntre(de, ate) + 1;
  const ateAntes = somarDias(de, -1);
  return { de: somarDias(ateAntes, -(dias - 1)), ate: ateAntes, nome: 'o período anterior' };
}

/** Os números de um período. */
function numerosDoPeriodo(negociacoes: readonly NegociacaoParaRelatorio[], de: string, ate: string): NumerosDeVendas {
  const acabou = (r: ResultadoDaVenda) => negociacoes.filter((n) => n.resultado === r && n.fechadoEm && noPeriodo(dia(n.fechadoEm), de, ate));
  const ganhas = acabou('ganho');
  const perdidas = acabou('perdido');
  const comValor = ganhas.filter((n) => n.valor !== null);
  return {
    novos: peca(negociacoes.filter((n) => noPeriodo(dia(n.criadoEm), de, ate))),
    ganhos: peca(ganhas), perdidos: peca(perdidas), ativacoes: pecaDaAtivacao(ganhas),
    conversao: porcento(ganhas.length, ganhas.length + perdidas.length),
    ticketMedio: comValor.length ? Math.round(comValor.reduce((t, n) => t + n.valor!, 0) / comValor.length) : null,
  };
}

/** O relatório de um painel de Vendas no período. */
export function relatorioDeVendas(
  painel: Pick<Painel, 'id' | 'etapas'>,
  negociacoes: readonly NegociacaoParaRelatorio[],
  filtro: Pick<FiltroDoRelatorioDeVendas, 'de' | 'ate'>,
  /** as simulações das negociações (o cenário principal) e as faixas do sinal: a margem das ganhas */
  simulacoes?: { margens: ReadonlyMap<string, MargemDaNegociacao>; faixas: FaixasDoSinal },
): RelatorioDeVendas {
  const { de, ate } = filtro;
  const ordem = new Map(painel.etapas.map((e, i) => [e.id, i]));
  const nomeDaEtapa = (id: string) => painel.etapas.find((e) => e.id === id)?.nome ?? 'uma etapa que saiu';
  const ehFinal = (etapaId: string) => !!painel.etapas.find((e) => e.id === etapaId)?.resultado;
  const porId = new Map(negociacoes.map((n) => [n.id, n]));

  const numeros = numerosDoPeriodo(negociacoes, de, ate);
  const comparacao = periodoDeComparacao(de, ate);
  const anterior = { ...comparacao, numeros: numerosDoPeriodo(negociacoes, comparacao.de, comparacao.ate) };

  // o funil das que entraram: até onde chegou (a etapa mais adiante, sem as finais) e onde estava ao perder
  const novas = numeros.novos.ids.map((id) => porId.get(id)!);
  const alcance = (n: NegociacaoParaRelatorio) => Math.max(...n.passagens.filter((p) => !ehFinal(p.etapaId)).map((p) => ordem.get(p.etapaId) ?? -1), -1);
  const ondePerdeu = (n: NegociacaoParaRelatorio) => [...n.passagens].reverse().find((p) => !ehFinal(p.etapaId))?.etapaId ?? null;
  const funil = painel.etapas.filter((e) => !e.resultado && e.tipo !== 'fechado').map((e) => {
    const posicao = ordem.get(e.id) ?? 0;
    return {
      etapaId: e.id, nome: e.nome,
      chegaram: novas.filter((n) => n.resultado === 'ganho' || alcance(n) >= posicao).map((n) => n.id),
      perdidas: novas.filter((n) => n.resultado === 'perdido' && ondePerdeu(n) === e.id).map((n) => n.id),
    };
  });
  const funilGanhas = novas.filter((n) => n.resultado === 'ganho').map((n) => n.id);

  // o mês a mês: os 12 meses que terminam no mês do fim do período (o último, até o fim dele) — o da
  // mensalidade (os ganhos) e o da ativação, com as mesmas ganhas e os mesmos dias
  const ganhasEntre = (a: string, b: string) => negociacoes.filter((n) => n.resultado === 'ganho' && n.fechadoEm && noPeriodo(dia(n.fechadoEm), a, b));
  const ultimoMes = ate.slice(0, 7);
  const meses: MesDeVendas[] = [];
  const mesesDaAtivacao: MesDeVendas[] = [];
  for (let i = 11; i >= 0; i--) {
    const mes = somarMeses(ultimoMes, -i);
    const parcial = i === 0 && ate < fimDoMes(mes);
    const fim = i === 0 ? ate : fimDoMes(mes);
    const doMes = ganhasEntre(`${mes}-01`, fim);
    const antes = somarMeses(mes, -1);
    // no parcial, o mesmo pedaço do mês anterior (o dia que ele não tem fica no último dia dele)
    const fimAntes = parcial ? (`${antes}-${fim.slice(8, 10)}` > fimDoMes(antes) ? fimDoMes(antes) : `${antes}-${fim.slice(8, 10)}`) : fimDoMes(antes);
    const doMesAntes = ganhasEntre(`${antes}-01`, fimAntes);
    const base = { mes, nome: nomeDoMes(mes), curto: mesCurto(mes), parcial, ate: fim };
    meses.push({ ...base, ganho: peca(doMes).valor, qtd: doMes.length, ids: doMes.map((n) => n.id), antes: peca(doMesAntes).valor });
    const ativacao = pecaDaAtivacao(doMes);
    mesesDaAtivacao.push({ ...base, ganho: ativacao.valor, qtd: ativacao.qtd, ids: ativacao.ids, antes: pecaDaAtivacao(doMesAntes).valor });
  }

  // as negociações por trás dos números (as que entraram, as ganhas e as perdidas, as ganhas de cada mês), as mais novas primeiro
  const ids = new Set([...numeros.novos.ids, ...numeros.ganhos.ids, ...numeros.perdidos.ids, ...meses.flatMap((m) => m.ids)]);
  const lista = [...ids].map((id) => porId.get(id)!).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).map((n): NegociacaoDoRelatorio => ({
    id: n.id, codigo: n.codigo, titulo: n.titulo, empresa: n.empresa, responsavel: n.responsavel, valor: n.valor, ativacao: n.ativacao,
    etapa: nomeDaEtapa(n.etapaId), resultado: n.resultado, motivoPerda: n.resultado === 'perdido' ? n.motivoPerda : null,
    criadoEm: n.criadoEm, fechadoEm: n.fechadoEm,
  }));

  // a margem das ganhas do período (as que têm simulação ligada)
  const margem = simulacoes ? margemDasGanhas(numeros.ganhos.ids.map((id) => porId.get(id)!), simulacoes.margens, simulacoes.faixas) : null;
  // as ganhas com simulação também abrem na janela (já estão na lista: são as ganhas do período)
  return { painelId: painel.id, periodo: { de, ate }, numeros, anterior, funil, funilGanhas, meses, mesesDaAtivacao, negociacoes: lista, margem };
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
