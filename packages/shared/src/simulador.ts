/**
 * O SIMULADOR DO COMERCIAL (Patch 2.0.2, decisão 0052) — a conta de uma venda antes de fechar: o que o
 * cliente paga (a mensalidade e a ativação) contra o que a Ingline gasta (os aparelhos, a nuvem, os
 * números, as comissões e o imposto). O pedido do Luan (20/10): "uma ferramenta que vai ficar dentro da aba
 * de comercial… eu vou colocar lá a mensalidade que eu quero cobrar do cliente e a ativação. E embaixo eu vou
 * poder colocar meus custos… telefone, headset, com quantidade e valor unitário, valor por imposto que vai
 * ser cobrado mensal… tem coisas que vão ser uma cobrança só, como compra de telefones, mas tem custos que
 * são mensais, como nuvem, comissões".
 *
 * As escolhas dele na página de opções (20/10):
 *  - o Simulador mora no grupo Comercial do menu, com a lista das simulações; cada uma tem NOME e fica
 *    guardada — "e atrelado a um card do comercial se eu quiser": pode ficar ligada a uma negociação;
 *  - o IMPOSTO é um percentual só, sobre o que o cliente paga (a mensalidade e a ativação), como a alíquota
 *    do Simples: vem dos Ajustes e muda na simulação ("e eu devo poder alterar quando eu quiser");
 *  - os CUSTOS vêm de uma tabela nos Ajustes (entram com um clique e mudam ali); o que não está nela entra
 *    digitado. Os dos aparelhos ele preenche em cada simulação ("pq pode alterar esses valores por data"):
 *    na tabela, o aparelho pode ficar sem valor;
 *  - cada APARELHO diz se é comodato (a Ingline compra e empresta: só custo, uma vez), venda (o preço entra
 *    na ativação) ou locação (o aluguel entra na mensalidade);
 *  - quem tem o Comercial vê tudo, com os custos e a margem;
 *  - e as ideias marcadas "agora": o preço mínimo pela margem, o sinal (verde, amarelo, vermelho), o
 *    desconto máximo sem sair do verde, a linha do tempo do contrato, os cenários lado a lado (até 3), a
 *    ativação parcelada, a quantidade pelos ramais e os modelos prontos por produto.
 *
 * No mesmo dia ele mandou a tabela da Helena (o LineChat é a plataforma dela em white label: "Tabela de
 * Preços - WHITE LABEL helena - JAN.2026", revisão de 03/02/2026), a planilha com que ele calcula o custo do
 * LineChat: a licença base com 3 usuários e 1 canal, e os usuários, os canais e os contatos ativos no mês
 * POR FAIXAS (do 4º ao 20º usuário, R$ 19,90 cada; do 21º ao 100º, R$ 14,90…). Daí o custo por faixas
 * (`FaixaDePreco`): cada unidade paga o preço da faixa em que cai, e a faixa de preço 0 é o que está incluso.
 * A tabela dela vem nos Ajustes de fábrica (`CUSTOS_DA_HELENA`), com o modelo "LineChat (Helena)".
 *
 * As contas moram aqui: o servidor (a lista, a ficha da negociação) e a prévia contam igual. O dinheiro vai
 * em CENTAVOS; os percentuais, em pontos (6 = 6%), com até duas casas.
 *
 * A CONTA (`contasDoCenario`). O mês 0 é a assinatura: a Ingline paga o que é de uma vez (os aparelhos e o
 * resto) e recebe a ativação (ou a primeira parcela dela). Do mês 1 ao fim do prazo, cada mês traz a
 * mensalidade menos os custos do mês. O imposto sai de tudo o que o cliente paga; a comissão "% da
 * mensalidade", de cada mensalidade; a "% da ativação", de cada parcela da ativação. A mensalidade, nas
 * contas, é a do serviço mais o aluguel dos aparelhos; a ativação, a do serviço mais os aparelhos vendidos.
 */
import { z } from 'zod';

// =====================================================================
//  OS LIMITES
// =====================================================================

/** Até quantos cenários uma simulação tem (A, B e C, lado a lado). */
export const MAX_CENARIOS = 3;
/** Até quantas linhas de custo um cenário tem. */
export const MAX_LINHAS_DO_CENARIO = 60;
/** Até quantos custos na tabela e quantos modelos nos Ajustes. */
export const MAX_CUSTOS_NA_TABELA = 200;
export const MAX_MODELOS = 50;
/** A ativação vai em até 12 vezes (e não mais que o prazo). */
export const MAX_PARCELAS = 12;
/** Em até quantas vezes a Ingline compra um aparelho (o custo dele se dilui nos meses; nunca mais que o prazo). */
export const MAX_PARCELAS_DA_COMPRA = 24;
/** O contrato vai até 10 anos. */
export const MAX_PRAZO = 120;
export const MAX_RAMAIS = 10_000;
export const MAX_QUANTIDADE = 10_000_000;
/** Até quantas faixas de preço um custo tem. */
export const MAX_FAIXAS_DE_PRECO = 8;
/** R$ 100 milhões, em centavos (como o valor da negociação). */
export const MAX_CENTAVOS = 10_000_000_000;
/** Os prazos que a tela oferece de cara (o campo aceita qualquer um, de 1 a 120 meses). */
export const PRAZOS_COMUNS = [12, 24, 36, 48, 60] as const;

// =====================================================================
//  COMO CADA CUSTO ENTRA
// =====================================================================

export const TIPOS_DE_CUSTO = ['aparelho', 'unica', 'mensal', 'pct_mensalidade', 'pct_ativacao'] as const;
export type TipoDeCusto = (typeof TIPOS_DE_CUSTO)[number];
export const NOME_DO_TIPO_DE_CUSTO: Record<TipoDeCusto, string> = {
  aparelho: 'Aparelho',
  unica: 'Uma vez (R$)',
  mensal: 'Por mês (R$)',
  pct_mensalidade: '% da mensalidade',
  pct_ativacao: '% da ativação',
};
export const AJUDA_DO_TIPO_DE_CUSTO: Record<TipoDeCusto, string> = {
  aparelho: 'O telefone, o headset: o custo de cada um, uma vez, e se vai em comodato, venda ou locação.',
  unica: 'Pago uma vez, na assinatura: a instalação, o frete, a configuração.',
  mensal: 'Todo mês: a nuvem, os números da operadora, a licença.',
  pct_mensalidade: 'Um percentual de cada mensalidade: a comissão recorrente.',
  pct_ativacao: 'Um percentual da ativação: a comissão da venda.',
};
export const ehPercentual = (t: TipoDeCusto) => t === 'pct_mensalidade' || t === 'pct_ativacao';

/**
 * Os dois grupos de custo (o Luan, num comentário, 20/10: "quero que vc separe os custos fixos com custos
 * mensais"): os **fixos**, pagos uma vez, na assinatura (o aparelho, o "uma vez" e a comissão da venda), e os
 * **mensais**, todo mês (o "por mês" e a comissão recorrente). A simulação, os Ajustes e o Excel mostram os
 * dois separados, os fixos primeiro.
 */
export const GRUPOS_DE_CUSTO = ['fixo', 'mensal'] as const;
export type GrupoDeCusto = (typeof GRUPOS_DE_CUSTO)[number];
export const GRUPO_DO_TIPO: Record<TipoDeCusto, GrupoDeCusto> = { aparelho: 'fixo', unica: 'fixo', pct_ativacao: 'fixo', mensal: 'mensal', pct_mensalidade: 'mensal' };
export const TIPOS_DO_GRUPO: Record<GrupoDeCusto, readonly TipoDeCusto[]> = { fixo: ['aparelho', 'unica', 'pct_ativacao'], mensal: ['mensal', 'pct_mensalidade'] };
export const NOME_DO_GRUPO: Record<GrupoDeCusto, string> = { fixo: 'Custos fixos', mensal: 'Custos mensais' };
export const AJUDA_DO_GRUPO: Record<GrupoDeCusto, string> = {
  fixo: 'pagos uma vez, na assinatura: os aparelhos, a instalação, a comissão da venda',
  mensal: 'todo mês: a nuvem, os números, as licenças, a comissão recorrente',
};
/** O tipo do custo novo de cada grupo (o "Digitar um custo" de cada um). */
export const TIPO_NOVO_DO_GRUPO: Record<GrupoDeCusto, TipoDeCusto> = { fixo: 'unica', mensal: 'mensal' };
/** Os itens em ordem de grupo (os fixos primeiro), cada grupo na ordem em que está. */
export function emOrdemDeGrupo<T extends { tipo: TipoDeCusto }>(itens: readonly T[]): T[] {
  return GRUPOS_DE_CUSTO.flatMap((g) => itens.filter((x) => GRUPO_DO_TIPO[x.tipo] === g));
}

export const MODALIDADES_DO_APARELHO = ['comodato', 'venda', 'locacao'] as const;
export type ModalidadeDoAparelho = (typeof MODALIDADES_DO_APARELHO)[number];
export const NOME_DA_MODALIDADE: Record<ModalidadeDoAparelho, string> = { comodato: 'Comodato', venda: 'Venda', locacao: 'Locação' };
export const AJUDA_DA_MODALIDADE: Record<ModalidadeDoAparelho, string> = {
  comodato: 'A Ingline compra e empresta: só o custo, uma vez.',
  venda: 'O cliente compra: o preço de cada um entra na ativação.',
  locacao: 'O cliente aluga: o aluguel de cada um entra na mensalidade.',
};

// =====================================================================
//  O SINAL DA MARGEM (verde, amarelo, vermelho, pelas faixas dos Ajustes)
// =====================================================================

export const SINAIS = ['verde', 'amarelo', 'vermelho'] as const;
export type Sinal = (typeof SINAIS)[number];
export const NOME_DO_SINAL: Record<Sinal, string> = { verde: 'Verde', amarelo: 'Amarelo', vermelho: 'Vermelho' };
/** As faixas: verde a partir de `verde`%; vermelho abaixo de `vermelho`%; amarelo entre as duas. */
export type FaixasDoSinal = { verde: number; vermelho: number };

/** O sinal de uma margem (em fração: 0,35 = 35%). */
export function sinalDaMargem(margem: number, f: FaixasDoSinal): Sinal {
  const pct = Math.round(margem * 10_000) / 100;
  return pct >= f.verde ? 'verde' : pct >= f.vermelho ? 'amarelo' : 'vermelho';
}
/** "verde a partir de 35%, vermelho abaixo de 20%" */
export const textoDasFaixas = (f: FaixasDoSinal) => `verde a partir de ${percentual(f.verde)}, vermelho abaixo de ${percentual(f.vermelho)}`;

// =====================================================================
//  OS DADOS: a linha de custo, o cenário, a simulação e os Ajustes
// =====================================================================

/** Uma linha de custo do cenário. */
export type LinhaDoCenario = {
  /** o id da linha dentro do cenário (a tela cria) */
  id: string;
  nome: string;
  tipo: TipoDeCusto;
  /** o custo da tabela de onde a linha veio (nulo = digitada); a linha guarda o valor de quando entrou */
  custoId: string | null;
  /** a quantidade (as linhas "por ramal" usam os ramais do cenário; os percentuais não têm quantidade) */
  qtd: number;
  porRamal: boolean;
  /** o valor de cada um, em centavos — ou, nos percentuais, o percentual; nulo = falta preencher */
  valor: number | null;
  /** o aparelho: comodato, venda ou locação (nas outras linhas, nulo) */
  modalidade: ModalidadeDoAparelho | null;
  /** o aparelho vendido: o preço de cada um (entra na ativação); o alugado: o aluguel de cada um por mês */
  preco: number | null;
  /** o preço por faixas (as linhas "por mês" e "uma vez"): cada unidade paga o da faixa em que cai; com elas, o valor fica nulo */
  faixas: FaixaDePreco[] | null;
  /** o nome de uma unidade ("usuário", "canal", "contato"), para a tela dizer "5 usuários" */
  unidade: string | null;
  /**
   * O aparelho comprado parcelado (o Luan, 20/10: "tem q ter a opção tbm se eu vou querer parcelar essa compra,
   * no caso o custo tbm seria diluído"): em quantas vezes a Ingline paga — a primeira na assinatura, as outras
   * nos meses seguintes. Ausente = à vista. Só no aparelho.
   */
  parcelas?: number;
  /**
   * O produto da linha (o do modelo de onde ela veio). No preço por produto, o que o aparelho vendido ou alugado
   * traz entra no produto dele; a linha sem produto, no primeiro.
   */
  produto?: string | null;
};

/**
 * Uma faixa de preço: da faixa de antes até `ate` (nulo = daí para cima), cada unidade a `valor` (em
 * centavos, que podem ter fração: R$ 0,045 por contato = 4,5 centavos; 0 = incluso). As faixas da Helena:
 * usuários até 3, incluso; até 20, R$ 19,90; até 100, R$ 14,90; daí para cima, R$ 12,90.
 */
export type FaixaDePreco = { ate: number | null; valor: number };

/** Um cenário: uma versão da venda, com todos os números dela. */
export type CenarioDaSimulacao = {
  id: string;
  /** "Cenário A", "Comodato 24 meses" */
  nome: string;
  /** a mensalidade do serviço, em centavos (o aluguel dos aparelhos soma a ela) */
  mensalidade: number;
  /** a ativação do serviço, em centavos (os aparelhos vendidos somam a ela) */
  ativacao: number;
  /** a ativação em quantas vezes: a primeira na assinatura, as outras com as mensalidades */
  parcelas: number;
  /** o prazo do contrato, em meses */
  prazo: number;
  /** os ramais: as linhas "por ramal" usam este número */
  ramais: number;
  /** o imposto, % sobre tudo o que o cliente paga (vem dos Ajustes; muda aqui) */
  imposto: number;
  /** a margem que se quer (%): a mensalidade mínima é a que dá esta margem */
  margemAlvo: number;
  linhas: LinhaDoCenario[];
  /**
   * Os produtos do catálogo que a venda leva (os códigos: linepbx, linechat…): vêm do modelo ou da
   * negociação, e o "Levar para a negociação" põe estes produtos nela.
   */
  produtos: string[];
  /**
   * O preço de cada produto (o Luan, 20/10: "uma proposta separada, porém uma negociação única"): com dois
   * produtos ou mais, a mensalidade e a ativação de cada um, na ordem dos produtos; a mensalidade e a ativação
   * do cenário são as somas. Nulo (ou ausente, nas simulações de antes) = um valor só para tudo.
   */
  porProduto?: PrecoDoProduto[] | null;
};

/** O preço de um produto no cenário: a mensalidade e a ativação do serviço dele, em centavos. */
export type PrecoDoProduto = { produto: string; mensalidade: number; ativacao: number };

/** Um custo da tabela (os Ajustes do Simulador). */
export type CustoDaTabela = {
  id: string;
  nome: string;
  tipo: TipoDeCusto;
  /** o valor de hoje (centavos, ou o percentual); nulo = preencher em cada simulação (os aparelhos) */
  valor: number | null;
  /** a linha já entra "por ramal" */
  porRamal: boolean;
  /** o aparelho: a modalidade que já vem (muda na simulação) */
  modalidade: ModalidadeDoAparelho | null;
  /** o preço por faixas (os custos "por mês" e "uma vez"); com elas, o valor fica nulo */
  faixas: FaixaDePreco[] | null;
  /** o nome de uma unidade ("usuário", "canal", "contato") */
  unidade: string | null;
};
/** Uma linha de um modelo: um custo da tabela, com a quantidade (ou por ramal). */
export type LinhaDoModelo = { custoId: string; qtd: number; porRamal: boolean };
/**
 * Um modelo pronto (por produto): a simulação nova começa com as linhas dele. `produto`: o código do
 * produto do catálogo (linepbx, linechat…) — a simulação feita a partir de uma negociação usa os modelos
 * dos produtos dela.
 */
export type ModeloDeSimulacao = { id: string; nome: string; produto: string | null; linhas: LinhaDoModelo[] };

/** Os Ajustes do Simulador (`settings.comercial-simulador`). */
export type AjustesDoSimulador = FaixasDoSinal & {
  /** o imposto que a simulação nova traz (%) */
  imposto: number;
  /** o prazo que a simulação nova traz (meses) */
  prazo: number;
  custos: CustoDaTabela[];
  modelos: ModeloDeSimulacao[];
};

/**
 * A tabela da Helena (o LineChat em white label), revisão de 03/02/2026 — a que o Luan mandou em 20/10. Vem
 * na tabela de custos de fábrica; quando a Helena reajustar, muda nos Ajustes do Simulador. A conexão com o
 * ASAAS (R$ 0 desde fev/2026) não entra.
 */
export const CUSTOS_DA_HELENA: CustoDaTabela[] = [
  { id: 'helena-licenca', nome: 'Licença base do LineChat (Helena): 3 usuários e 1 canal', tipo: 'mensal', valor: 14_990, porRamal: false, modalidade: null, faixas: null, unidade: 'conta' },
  { id: 'helena-usuarios', nome: 'Usuários do LineChat (Helena)', tipo: 'mensal', valor: null, porRamal: false, modalidade: null, unidade: 'usuário',
    faixas: [{ ate: 3, valor: 0 }, { ate: 20, valor: 1_990 }, { ate: 100, valor: 1_490 }, { ate: null, valor: 1_290 }] },
  { id: 'helena-canais', nome: 'Canais do LineChat (Helena): WhatsApp ou Instagram', tipo: 'mensal', valor: null, porRamal: false, modalidade: null, unidade: 'canal',
    faixas: [{ ate: 1, valor: 0 }, { ate: 5, valor: 2_990 }, { ate: null, valor: 1_990 }] },
  { id: 'helena-zapi', nome: 'Conexão Z-API do LineChat (Helena)', tipo: 'mensal', valor: 6_990, porRamal: false, modalidade: null, faixas: null, unidade: 'conexão' },
  { id: 'helena-contatos', nome: 'Contatos ativos no mês do LineChat (Helena)', tipo: 'mensal', valor: null, porRamal: false, modalidade: null, unidade: 'contato',
    faixas: [{ ate: 5_000, valor: 0 }, { ate: 20_000, valor: 4.5 }, { ate: 100_000, valor: 3.5 }, { ate: null, valor: 2.5 }] },
  { id: 'helena-transcricao', nome: 'Transcrição de áudio do LineChat (Helena), com IA', tipo: 'mensal', valor: 399, porRamal: false, modalidade: null, faixas: null, unidade: 'usuário' },
  { id: 'helena-agentes', nome: 'Agentes de IA do LineChat (Helena)', tipo: 'mensal', valor: 5_000, porRamal: false, modalidade: null, faixas: null, unidade: 'agente' },
];
/** O modelo do LineChat: a planilha da Helena, com o que vem na licença (3 usuários, 1 canal, 5.000 contatos). */
export const MODELO_DA_HELENA: ModeloDeSimulacao = {
  id: 'linechat-helena', nome: 'LineChat (Helena)', produto: 'linechat',
  linhas: [
    { custoId: 'helena-licenca', qtd: 1, porRamal: false }, { custoId: 'helena-usuarios', qtd: 3, porRamal: false },
    { custoId: 'helena-canais', qtd: 1, porRamal: false }, { custoId: 'helena-zapi', qtd: 0, porRamal: false },
    { custoId: 'helena-contatos', qtd: 5_000, porRamal: false }, { custoId: 'helena-transcricao', qtd: 0, porRamal: false },
    { custoId: 'helena-agentes', qtd: 0, porRamal: false },
  ],
};

export const AJUSTES_DO_SIMULADOR_PADRAO: AjustesDoSimulador = { imposto: 6, verde: 35, vermelho: 20, prazo: 24, custos: CUSTOS_DA_HELENA, modelos: [MODELO_DA_HELENA] };

/** A negociação ligada à simulação, como a pessoa vê. */
export type NegociacaoDaSimulacao = { id: string; codigo: string; titulo: string; empresa: string | null; resultado: 'ganho' | 'perdido' | null };

/** A simulação, como a tela abre. */
export type Simulacao = {
  id: string;
  nome: string;
  /** a negociação ligada (o id, mesmo que a pessoa não veja o painel dela) */
  negociacaoId: string | null;
  /** os dados da negociação ligada, quando a pessoa vê o painel dela */
  negociacao: NegociacaoDaSimulacao | null;
  cenarios: CenarioDaSimulacao[];
  /** o id do cenário principal: o que a lista e a negociação mostram */
  principal: string;
  criadoPor: string | null;
  criadoEm: string;
  alteradoPor: string | null;
  alteradoEm: string;
};

/** O que vai e volta para gravar uma simulação. */
export type SimulacaoGravar = { nome: string; negociacaoId: string | null; cenarios: CenarioDaSimulacao[]; principal: string };

/** O resumo de um cenário (a lista do Simulador, a ficha da negociação, os cenários lado a lado). */
export type ResumoDoCenario = {
  nome: string;
  prazo: number;
  mensalTotal: number;
  entradaTotal: number;
  sobraMensal: number;
  margem: number | null;
  sinal: Sinal | null;
  investimento: number;
  sePagaEm: SePagaEm;
  resultado: number;
  /** quantos valores faltam preencher */
  faltam: number;
};

/** Uma simulação na lista (o cenário principal resumido). */
export type SimulacaoNaLista = {
  id: string;
  nome: string;
  negociacao: NegociacaoDaSimulacao | null;
  /** ligada a uma negociação de um painel que a pessoa não vê */
  negociacaoOculta: boolean;
  cenarios: number;
  principal: ResumoDoCenario;
  criadoPor: string | null;
  alteradoPor: string | null;
  alteradoEm: string;
};

/** Uma simulação ligada a uma negociação (a ficha da negociação). */
export type SimulacaoDaNegociacao = { id: string; nome: string; cenarios: number; principal: ResumoDoCenario };

/** O que a tela do Simulador precisa saber antes de tudo. */
export type SimuladorOpcoes = {
  ajustes: AjustesDoSimulador;
  /** criar, mudar, duplicar e mandar para a lixeira (quem trabalha nas negociações) */
  podeEditar: boolean;
  /** os Ajustes do Simulador (quem cuida dos painéis) */
  podeCuidar: boolean;
  /** os produtos do catálogo (o código liga o modelo e o cenário ao produto da negociação) */
  produtos: ProdutoDoSimulador[];
};
/** Um produto do catálogo, como o Simulador usa. */
export type ProdutoDoSimulador = { id: string; codigo: string; nome: string };

// =====================================================================
//  OS FORMATOS
// =====================================================================

/** 6 → "6%"; 6.5 → "6,5%"; 60.18 → "60,18%" */
export const percentual = (pontos: number) => `${pontos.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
/** Uma fração (0,6018) como percentual com uma casa: "60,2%". */
export const percentualDaFracao = (f: number) => `${(Math.round(f * 1000) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const reaisCurto = (centavos: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);
/** Duas casas, no máximo (o percentual digitado). */
const duasCasas = (v: number) => Math.round(v * 100) / 100;

/**
 * O valor de cada um como a pessoa escreve ("19,90", "0,045", "1.250", "R$ 390") em centavos, com até duas
 * casas (quatro em reais: o preço de R$ 0,045 por contato); nulo se não for um valor. Ponto como milhar,
 * vírgula como decimal (o jeito do Brasil).
 */
export function lerValorUnitario(texto: string): number | null {
  const t = texto.trim().toLowerCase().replace(/r\$\s*/g, '').replace(/\s+/g, '');
  if (!t || !/^\d{1,3}(\.\d{3})*(,\d{1,4})?$|^\d+(,\d{1,4})?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 10_000) / 100 : null;
}
/** Os centavos (com até duas casas) como a pessoa escreve: 1990 → "19,90"; 4,5 → "0,045"; 39000 → "390,00". */
export const textoDoValorUnitario = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
/** O percentual escrito ("6", "6,5", "2,25%") em pontos; nulo se não for um número com até duas casas. */
export function lerPercentual(texto: string): number | null {
  const t = texto.trim().replace('%', '').replace(/\s+/g, '');
  if (!t || !/^\d+(,\d{1,2})?$/.test(t)) return null;
  return Number(t.replace(',', '.'));
}
/** Os pontos como a pessoa escreve: 6 → "6"; 6.5 → "6,5". */
export const textoDoPercentual = (pontos: number) => pontos.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Um id para a linha ou o cenário novo (a tela cria; o servidor só confere que não repete). */
export const idLocal = () => Math.random().toString(36).slice(2, 10);

// =====================================================================
//  A VALIDAÇÃO (o servidor e a prévia recusam igual)
// =====================================================================

const Centavos = (o_que: string) => z.number({ invalid_type_error: `${o_que} vai em centavos.` })
  .int(`${o_que} vai em centavos.`).min(0, `${o_que} não é negativo.`).max(MAX_CENTAVOS, `${o_que} vai até R$ 100 milhões.`);
const Percentual = (o_que: string, max = 100) => z.number({ invalid_type_error: `${o_que} vai em %.` })
  .min(0, `${o_que} não é negativo.`).max(max, `${o_que} vai até ${max}%.`).transform(duasCasas);
const Id = z.string().min(1).max(40);

/** O valor de uma linha (ou de um custo da tabela): centavos inteiros, ou o percentual até 100%. */
/** O valor em centavos com até duas casas (o preço de R$ 0,045 por contato são 4,5 centavos). */
const centavosValidos = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 && v <= MAX_CENTAVOS;
const FRASE_DOS_CENTAVOS = 'o valor vai em reais com até 4 casas depois da vírgula (R$ 0,0450), até R$ 100 milhões';

function conferirValor(x: { nome: string; tipo: TipoDeCusto; valor: number | null; modalidade: ModalidadeDoAparelho | null; faixas?: FaixaDePreco[] | null }, ctx: z.RefinementCtx) {
  if (x.valor != null) {
    if (ehPercentual(x.tipo)) {
      if (x.valor > 100) ctx.addIssue({ code: 'custom', path: ['valor'], message: `${x.nome}: o percentual vai até 100%.` });
    } else if (!centavosValidos(x.valor)) {
      ctx.addIssue({ code: 'custom', path: ['valor'], message: `${x.nome}: ${FRASE_DOS_CENTAVOS}.` });
    }
  }
  if (x.tipo === 'aparelho' && !x.modalidade) ctx.addIssue({ code: 'custom', path: ['modalidade'], message: `${x.nome}: diga se o aparelho vai em comodato, venda ou locação.` });
  if (x.faixas) {
    if (x.tipo !== 'mensal' && x.tipo !== 'unica') ctx.addIssue({ code: 'custom', path: ['faixas'], message: `${x.nome}: o preço por faixas é só dos custos "por mês" e "uma vez".` });
    let antes = 0;
    x.faixas.forEach((f, i) => {
      const ultima = i === x.faixas!.length - 1;
      if (!centavosValidos(f.valor)) ctx.addIssue({ code: 'custom', path: ['faixas', i, 'valor'], message: `${x.nome}: na faixa ${i + 1}, ${FRASE_DOS_CENTAVOS}.` });
      if (ultima && f.ate != null) ctx.addIssue({ code: 'custom', path: ['faixas', i, 'ate'], message: `${x.nome}: a última faixa vai "daí para cima" (sem fim).` });
      if (!ultima && (f.ate == null || f.ate <= antes)) ctx.addIssue({ code: 'custom', path: ['faixas', i, 'ate'], message: `${x.nome}: cada faixa termina depois da de antes (${antes ? `depois de ${antes.toLocaleString('pt-BR')}` : 'em 1 ou mais'}).` });
      antes = f.ate ?? antes;
    });
  }
}

const FaixaDePrecoSchema = z.object({
  ate: z.number({ invalid_type_error: 'O fim da faixa vai em número.' }).int('O fim da faixa vai inteiro.').min(1, 'A faixa termina em 1 ou mais.').max(MAX_QUANTIDADE).nullable(),
  valor: z.number({ invalid_type_error: 'O preço da faixa vai em número.' }).min(0, 'O preço da faixa não é negativo.'),
});
const FaixasDePrecoSchema = z.array(FaixaDePrecoSchema).min(1, 'O preço por faixas tem pelo menos uma faixa.').max(MAX_FAIXAS_DE_PRECO, `Até ${MAX_FAIXAS_DE_PRECO} faixas de preço.`);
const UnidadeSchema = z.string().trim().max(20, 'A unidade vai até 20 letras ("usuário", "canal").').nullable().default(null).transform((u) => (u ? u : null));
/** As faixas só nos custos "por mês" e "uma vez"; com elas, o valor fica nulo (é o das faixas). */
const comFaixas = (tipo: TipoDeCusto, faixas: FaixaDePreco[] | null | undefined) => ((tipo === 'mensal' || tipo === 'unica') && faixas?.length ? faixas : null);

export const LinhaDoCenarioSchema = z.object({
  id: Id,
  nome: z.string({ invalid_type_error: 'Dê um nome a cada custo.' }).trim().min(1, 'Dê um nome a cada custo.').max(120, 'O nome do custo vai até 120 letras.'),
  tipo: z.enum(TIPOS_DE_CUSTO, { errorMap: () => ({ message: 'Escolha como o custo entra.' }) }),
  custoId: Id.nullable().default(null),
  qtd: z.number({ invalid_type_error: 'A quantidade vai em número.' }).int('A quantidade vai inteira.').min(0, 'A quantidade não é negativa.')
    .max(MAX_QUANTIDADE, `A quantidade vai até ${MAX_QUANTIDADE.toLocaleString('pt-BR')}.`).default(1),
  porRamal: z.boolean().default(false),
  valor: z.number({ invalid_type_error: 'O valor vai em número.' }).min(0, 'O valor não é negativo.').nullable().default(null),
  modalidade: z.enum(MODALIDADES_DO_APARELHO).nullable().default(null),
  preco: Centavos('O preço do aparelho').nullable().default(null),
  faixas: FaixasDePrecoSchema.nullable().default(null),
  unidade: UnidadeSchema,
  parcelas: z.number({ invalid_type_error: 'As parcelas da compra vão em número.' }).int('As parcelas da compra vão inteiras.')
    .min(1, 'A compra vai em pelo menos 1 vez.').max(MAX_PARCELAS_DA_COMPRA, `A compra do aparelho vai em até ${MAX_PARCELAS_DA_COMPRA} vezes.`).optional(),
  produto: z.string().trim().max(40).nullable().optional(),
}).superRefine(conferirValor).transform((l): LinhaDoCenario => {
  const { parcelas, produto, ...resto } = l;
  const pct = ehPercentual(l.tipo);
  const aparelho = l.tipo === 'aparelho';
  const faixas = comFaixas(l.tipo, l.faixas);
  return {
    ...resto,
    qtd: pct ? 1 : l.qtd,
    porRamal: pct ? false : l.porRamal,
    valor: faixas || l.valor == null ? null : pct ? duasCasas(l.valor) : l.valor,
    modalidade: aparelho ? l.modalidade : null,
    preco: aparelho && l.modalidade !== 'comodato' ? l.preco : null,
    faixas,
    // à vista não guarda nada (a linha fica como era antes da compra parcelada)
    ...(aparelho && parcelas && parcelas > 1 ? { parcelas } : {}),
    ...(produto ? { produto } : {}),
  };
});

const PrecoDoProdutoSchema = z.object({
  produto: z.string().trim().min(1).max(40),
  mensalidade: Centavos('A mensalidade do produto'),
  ativacao: Centavos('A ativação do produto'),
});

export const CenarioDaSimulacaoSchema = z.object({
  id: Id,
  nome: z.string({ invalid_type_error: 'Dê um nome ao cenário.' }).trim().min(1, 'Dê um nome ao cenário.').max(40, 'O nome do cenário vai até 40 letras.'),
  mensalidade: Centavos('A mensalidade'),
  ativacao: Centavos('A ativação'),
  parcelas: z.number({ invalid_type_error: 'As parcelas vão em número.' }).int('As parcelas vão inteiras.').min(1, 'A ativação vai em pelo menos 1 vez.')
    .max(MAX_PARCELAS, `A ativação vai em até ${MAX_PARCELAS} vezes.`).default(1),
  prazo: z.number({ invalid_type_error: 'O prazo vai em meses.' }).int('O prazo vai em meses inteiros.').min(1, 'O prazo é de pelo menos 1 mês.')
    .max(MAX_PRAZO, `O prazo vai até ${MAX_PRAZO} meses.`),
  ramais: z.number({ invalid_type_error: 'Os ramais vão em número.' }).int('Os ramais vão inteiros.').min(0, 'Os ramais não são negativos.')
    .max(MAX_RAMAIS, `Até ${MAX_RAMAIS.toLocaleString('pt-BR')} ramais.`).default(0),
  imposto: Percentual('O imposto'),
  margemAlvo: Percentual('A margem que você quer', 95),
  linhas: z.array(LinhaDoCenarioSchema).max(MAX_LINHAS_DO_CENARIO, `Até ${MAX_LINHAS_DO_CENARIO} custos por cenário.`),
  produtos: z.array(z.string().trim().min(1).max(40)).max(20, 'Até 20 produtos.').default([]).transform((xs) => [...new Set(xs)]),
  porProduto: z.array(PrecoDoProdutoSchema).max(20, 'Até 20 produtos.').nullable().optional(),
}).superRefine((c, ctx) => {
  if (c.parcelas > c.prazo) ctx.addIssue({ code: 'custom', path: ['parcelas'], message: `${c.nome}: a ativação vai em até ${c.prazo} ${c.prazo === 1 ? 'vez' : 'vezes'} (o prazo do contrato).` });
  const ids = new Set<string>();
  for (const l of c.linhas) {
    if (ids.has(l.id)) ctx.addIssue({ code: 'custom', path: ['linhas'], message: `${c.nome}: dois custos com o mesmo id.` });
    ids.add(l.id);
  }
  if (c.porProduto) {
    const n = normalizarPorProduto(c);
    if (n.mensalidade > MAX_CENTAVOS || n.ativacao > MAX_CENTAVOS) ctx.addIssue({ code: 'custom', path: ['porProduto'], message: `${c.nome}: a soma dos produtos passa do máximo.` });
  }
}).transform((c): CenarioDaSimulacao => normalizarPorProduto(c));

export const SimulacaoGravarSchema = z.object({
  nome: z.string({ invalid_type_error: 'Dê um nome à simulação.' }).trim().min(1, 'Dê um nome à simulação (o cliente, a proposta).').max(120, 'O nome vai até 120 letras.'),
  negociacaoId: Id.nullable().default(null),
  cenarios: z.array(CenarioDaSimulacaoSchema).min(1, 'A simulação tem pelo menos um cenário.').max(MAX_CENARIOS, `Até ${MAX_CENARIOS} cenários.`),
  principal: Id,
}).superRefine((s, ctx) => {
  const ids = new Set<string>();
  const nomes = new Set<string>();
  for (const c of s.cenarios) {
    if (ids.has(c.id)) ctx.addIssue({ code: 'custom', path: ['cenarios'], message: 'Dois cenários com o mesmo id.' });
    const nome = c.nome.toLocaleLowerCase('pt-BR');
    if (nomes.has(nome)) ctx.addIssue({ code: 'custom', path: ['cenarios'], message: `Dois cenários com o nome "${c.nome}": mude um deles.` });
    ids.add(c.id); nomes.add(nome);
  }
  if (!ids.has(s.principal)) ctx.addIssue({ code: 'custom', path: ['principal'], message: 'O cenário principal não está na simulação.' });
});

export const CustoDaTabelaSchema = z.object({
  id: Id,
  nome: z.string({ invalid_type_error: 'Dê um nome a cada custo da tabela.' }).trim().min(1, 'Dê um nome a cada custo da tabela.').max(120, 'O nome do custo vai até 120 letras.'),
  tipo: z.enum(TIPOS_DE_CUSTO, { errorMap: () => ({ message: 'Escolha como o custo entra.' }) }),
  valor: z.number({ invalid_type_error: 'O valor vai em número.' }).min(0, 'O valor não é negativo.').nullable().default(null),
  porRamal: z.boolean().default(false),
  modalidade: z.enum(MODALIDADES_DO_APARELHO).nullable().default(null),
  faixas: FaixasDePrecoSchema.nullable().default(null),
  unidade: UnidadeSchema,
}).superRefine(conferirValor).transform((c): CustoDaTabela => {
  const pct = ehPercentual(c.tipo);
  const faixas = comFaixas(c.tipo, c.faixas);
  return {
    ...c, valor: faixas || c.valor == null ? null : pct ? duasCasas(c.valor) : c.valor, porRamal: pct ? false : c.porRamal,
    modalidade: c.tipo === 'aparelho' ? c.modalidade : null, faixas,
  };
});

export const ModeloDeSimulacaoSchema = z.object({
  id: Id,
  nome: z.string({ invalid_type_error: 'Dê um nome ao modelo.' }).trim().min(1, 'Dê um nome a cada modelo (o produto: LinePBX, LineChat…).').max(80, 'O nome do modelo vai até 80 letras.'),
  produto: z.string().trim().max(40).nullable().default(null).transform((x) => (x ? x : null)),
  linhas: z.array(z.object({
    custoId: Id,
    qtd: z.number().int('A quantidade vai inteira.').min(0, 'A quantidade não é negativa.').max(MAX_QUANTIDADE).default(1),
    porRamal: z.boolean().default(false),
  })).max(MAX_LINHAS_DO_CENARIO, `Até ${MAX_LINHAS_DO_CENARIO} custos por modelo.`),
});

export const AjustesDoSimuladorSchema = z.object({
  imposto: Percentual('O imposto'),
  verde: Percentual('O verde'),
  vermelho: Percentual('O vermelho'),
  prazo: z.number({ invalid_type_error: 'O prazo vai em meses.' }).int('O prazo vai em meses inteiros.').min(1, 'O prazo é de pelo menos 1 mês.').max(MAX_PRAZO, `O prazo vai até ${MAX_PRAZO} meses.`),
  custos: z.array(CustoDaTabelaSchema).max(MAX_CUSTOS_NA_TABELA, `Até ${MAX_CUSTOS_NA_TABELA} custos na tabela.`),
  modelos: z.array(ModeloDeSimulacaoSchema).max(MAX_MODELOS, `Até ${MAX_MODELOS} modelos.`),
}).superRefine((a, ctx) => {
  if (a.vermelho > a.verde) ctx.addIssue({ code: 'custom', path: ['vermelho'], message: 'O vermelho começa abaixo do verde: o amarelo fica entre os dois.' });
  const ids = new Set<string>();
  const nomes = new Set<string>();
  for (const c of a.custos) {
    const nome = c.nome.toLocaleLowerCase('pt-BR');
    if (ids.has(c.id)) ctx.addIssue({ code: 'custom', path: ['custos'], message: 'Dois custos da tabela com o mesmo id.' });
    if (nomes.has(nome)) ctx.addIssue({ code: 'custom', path: ['custos'], message: `"${c.nome}" está duas vezes na tabela.` });
    ids.add(c.id); nomes.add(nome);
  }
  const modelos = new Set<string>();
  const nomesDosModelos = new Set<string>();
  for (const m of a.modelos) {
    const nome = m.nome.toLocaleLowerCase('pt-BR');
    if (modelos.has(m.id)) ctx.addIssue({ code: 'custom', path: ['modelos'], message: 'Dois modelos com o mesmo id.' });
    if (nomesDosModelos.has(nome)) ctx.addIssue({ code: 'custom', path: ['modelos'], message: `Dois modelos com o nome "${m.nome}".` });
    modelos.add(m.id); nomesDosModelos.add(nome);
    const usados = new Set<string>();
    for (const l of m.linhas) {
      if (!ids.has(l.custoId)) ctx.addIssue({ code: 'custom', path: ['modelos'], message: `O modelo "${m.nome}" usa um custo que não está na tabela.` });
      if (usados.has(l.custoId)) ctx.addIssue({ code: 'custom', path: ['modelos'], message: `O modelo "${m.nome}" tem o mesmo custo duas vezes.` });
      usados.add(l.custoId);
    }
  }
});

/** O que a tela manda para gravar (antes dos padrões e da limpeza). */
export type SimulacaoGravarEntrada = z.input<typeof SimulacaoGravarSchema>;
export type AjustesDoSimuladorEntrada = z.input<typeof AjustesDoSimuladorSchema>;

/** Os Ajustes guardados, com o padrão no que falta e sem o que não vale (o modelo perde a linha de um custo que saiu). */
export function ajustesDoSimulador(valor: unknown): AjustesDoSimulador {
  const v = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>;
  const p = AJUSTES_DO_SIMULADOR_PADRAO;
  const num = (x: unknown, schema: z.ZodType<number>, padrao: number) => { const r = schema.safeParse(x); return r.success ? r.data : padrao; };
  const custos: CustoDaTabela[] = [];
  for (const x of Array.isArray(v.custos) ? v.custos : []) {
    const r = CustoDaTabelaSchema.safeParse(x);
    if (r.success && !custos.some((c) => c.id === r.data.id)) custos.push(r.data);
  }
  const modelos: ModeloDeSimulacao[] = [];
  for (const x of Array.isArray(v.modelos) ? v.modelos : []) {
    const r = ModeloDeSimulacaoSchema.safeParse(x);
    if (r.success && !modelos.some((m) => m.id === r.data.id)) {
      const vistos = new Set<string>();
      modelos.push({ ...r.data, linhas: r.data.linhas.filter((l) => custos.some((c) => c.id === l.custoId) && !vistos.has(l.custoId) && !!vistos.add(l.custoId)) });
    }
  }
  let verde = num(v.verde, Percentual('O verde'), p.verde);
  let vermelho = num(v.vermelho, Percentual('O vermelho'), p.vermelho);
  if (vermelho > verde) { verde = p.verde; vermelho = p.vermelho; }
  return {
    imposto: num(v.imposto, Percentual('O imposto'), p.imposto),
    verde, vermelho,
    prazo: num(v.prazo, z.number().int().min(1).max(MAX_PRAZO), p.prazo),
    // nada guardado ainda: a tabela e os modelos de fábrica (a tabela da Helena)
    custos: Array.isArray(v.custos) ? custos : p.custos.map((c) => ({ ...c })),
    modelos: Array.isArray(v.modelos) ? modelos : p.modelos.map((m) => ({ ...m, linhas: m.linhas.map((l) => ({ ...l })) })),
  };
}

// =====================================================================
//  MONTAR: a linha da tabela, o cenário novo, o cenário duplicado
// =====================================================================

/** A linha que entra de um custo da tabela (com o valor de hoje). */
export function linhaDaTabela(c: CustoDaTabela, o: { id?: string; qtd?: number; porRamal?: boolean } = {}): LinhaDoCenario {
  const pct = ehPercentual(c.tipo);
  return {
    id: o.id ?? idLocal(), nome: c.nome, tipo: c.tipo, custoId: c.id,
    qtd: pct ? 1 : (o.qtd ?? 1), porRamal: pct ? false : (o.porRamal ?? c.porRamal),
    valor: c.valor, modalidade: c.tipo === 'aparelho' ? (c.modalidade ?? 'comodato') : null, preco: null,
    faixas: c.faixas ? c.faixas.map((f) => ({ ...f })) : null, unidade: c.unidade,
  };
}

/** Uma linha nova, digitada. */
export function linhaNova(tipo: TipoDeCusto = 'mensal', id: string = idLocal()): LinhaDoCenario {
  return { id, nome: tipo === 'aparelho' ? 'Aparelho' : 'Outro custo', tipo, custoId: null, qtd: 1, porRamal: false, valor: null, modalidade: tipo === 'aparelho' ? 'comodato' : null, preco: null, faixas: null, unidade: null };
}

/** O nome do próximo cenário: "Cenário A", "Cenário B"… (o primeiro que não está em uso). */
export function proximoNomeDeCenario(cenarios: ReadonlyArray<{ nome: string }>): string {
  const usados = new Set(cenarios.map((c) => c.nome.toLocaleLowerCase('pt-BR')));
  for (const letra of 'ABCDEFGHIJ') if (!usados.has(`cenário ${letra}`.toLocaleLowerCase('pt-BR'))) return `Cenário ${letra}`;
  return `Cenário ${cenarios.length + 1}`;
}

/** As linhas de um modelo (os custos da tabela, com a quantidade de cada um). */
export function linhasDoModelo(a: Pick<AjustesDoSimulador, 'custos'>, m: ModeloDeSimulacao): LinhaDoCenario[] {
  return m.linhas.flatMap((l) => {
    const c = a.custos.find((x) => x.id === l.custoId);
    // a linha guarda o produto do modelo (no preço por produto, o aparelho vendido ou alugado entra nele)
    return c ? [{ ...linhaDaTabela(c, { qtd: l.qtd, porRamal: l.porRamal }), ...(m.produto ? { produto: m.produto } : {}) }] : [];
  });
}

/**
 * O preço por produto em ordem: um preço para cada produto do cenário, na ordem deles (o produto que entrou
 * começa com zero; o que saiu leva o preço dele), e a mensalidade e a ativação do cenário passam a ser as
 * somas. Com menos de dois produtos, o cenário volta a um valor só: o preço do produto que ficou.
 */
export function normalizarPorProduto<C extends Pick<CenarioDaSimulacao, 'produtos' | 'porProduto' | 'mensalidade' | 'ativacao'>>(c: C): C {
  if (!c.porProduto) return { ...c, porProduto: null };
  if (c.produtos.length < 2) {
    // de volta a um valor só: fica o preço do produto que ficou (o que saiu leva o dele)
    const ficou = c.porProduto.filter((x) => c.produtos.includes(x.produto));
    return ficou.length
      ? { ...c, porProduto: null, mensalidade: ficou.reduce((s, x) => s + x.mensalidade, 0), ativacao: ficou.reduce((s, x) => s + x.ativacao, 0) }
      : { ...c, porProduto: null };
  }
  const precos = c.produtos.map((produto) => {
    const x = c.porProduto!.find((y) => y.produto === produto);
    return { produto, mensalidade: x?.mensalidade ?? 0, ativacao: x?.ativacao ?? 0 };
  });
  return {
    ...c, porProduto: precos,
    mensalidade: precos.reduce((s, x) => s + x.mensalidade, 0),
    ativacao: precos.reduce((s, x) => s + x.ativacao, 0),
  };
}

/** Passar para o preço por produto: o valor de agora fica no primeiro produto, e os outros começam com zero. */
export function comPrecoPorProduto<C extends Pick<CenarioDaSimulacao, 'produtos' | 'porProduto' | 'mensalidade' | 'ativacao'>>(c: C): C {
  if (c.produtos.length < 2) return { ...c, porProduto: null };
  return normalizarPorProduto({ ...c, porProduto: [{ produto: c.produtos[0]!, mensalidade: c.mensalidade, ativacao: c.ativacao }] });
}

/**
 * O que o cliente paga em cada produto (o preço por produto e o "Levar para a negociação"): o preço do produto e,
 * dos aparelhos vendidos ou alugados, o que entra no produto deles — o do modelo de onde a linha veio; a linha
 * sem produto (ou de um produto que saiu), no primeiro. As somas são o que o cliente paga no cenário.
 */
export function pagamentoPorProduto(c: CenarioDaSimulacao, k: Pick<ContasDoCenario, 'linhas'>): Array<PrecoDoProduto & { aluguel: number; venda: number }> | null {
  if (!c.porProduto?.length) return null;
  const r = c.porProduto.map((x) => ({ ...x, aluguel: 0, venda: 0 }));
  c.linhas.forEach((l, i) => {
    if (l.tipo !== 'aparelho' || (l.modalidade !== 'venda' && l.modalidade !== 'locacao')) return;
    const receita = k.linhas[i]?.receita ?? 0;
    if (!receita) return;
    const alvo = r.find((x) => x.produto === l.produto) ?? r[0]!;
    if (l.modalidade === 'venda') alvo.venda += receita; else alvo.aluguel += receita;
  });
  return r;
}

/**
 * O cenário novo: o imposto, o prazo e a margem que se quer vêm dos Ajustes; as linhas, do modelo (ou dos
 * modelos: a simulação a partir de uma negociação usa os dos produtos dela), e os produtos, os deles.
 */
export function cenarioNovo(a: AjustesDoSimulador, o: { id?: string; nome?: string; modelo?: ModeloDeSimulacao | null; modelos?: ModeloDeSimulacao[]; produtos?: string[] } = {}): CenarioDaSimulacao {
  const modelos = [...(o.modelo ? [o.modelo] : []), ...(o.modelos ?? [])].filter((m, i, todos) => todos.findIndex((x) => x.id === m.id) === i);
  // de vários modelos, cada produto traz os custos dele (os canais de voz do VoiceNet e os do PABX, as duas
  // instalações): é uma proposta por produto. Só a comissão, que é sobre o preço inteiro, não repete.
  const comissoes = new Set<string>();
  const linhas = modelos.flatMap((m) => linhasDoModelo(a, m))
    .filter((l) => !ehPercentual(l.tipo) || !l.custoId || (!comissoes.has(l.custoId) && !!comissoes.add(l.custoId)));
  const produtos = [...new Set([...(o.produtos ?? []), ...modelos.map((m) => m.produto).filter((x): x is string => !!x)])];
  return {
    id: o.id ?? idLocal(), nome: o.nome ?? 'Cenário A',
    mensalidade: 0, ativacao: 0, parcelas: 1, prazo: a.prazo, ramais: 0,
    imposto: a.imposto, margemAlvo: a.verde, linhas, produtos, porProduto: null,
  };
}

/** A cópia de um cenário, para mudar só o que difere (as linhas ganham ids novos). */
export function duplicarCenario(c: CenarioDaSimulacao, o: { id?: string; nome: string }): CenarioDaSimulacao {
  return { ...c, id: o.id ?? idLocal(), nome: o.nome, linhas: c.linhas.map((l) => ({ ...l, id: idLocal() })) };
}

// =====================================================================
//  A CONTA
// =====================================================================

/** Quando a venda se paga: já na entrada, num mês (talvez depois do prazo) ou nunca (a sobra do mês não cobre). */
export type SePagaEm = { tipo: 'entrada' } | { tipo: 'sem-custo' } | { tipo: 'mes'; mes: number; depoisDoPrazo: boolean } | { tipo: 'nunca' };

/**
 * "já na ativação" (a ativação cobre o que sai antes), "desde o 1º mês" (não sai nada antes, nem entra
 * ativação: a sobra já é lucro), "em 7 meses", "em 30 meses (depois do prazo)", "não se paga"
 */
export function textoDoSePagaEm(s: SePagaEm): string {
  if (s.tipo === 'entrada') return 'já na ativação';
  if (s.tipo === 'sem-custo') return 'desde o 1º mês';
  if (s.tipo === 'nunca') return 'não se paga';
  return `em ${s.mes} ${s.mes === 1 ? 'mês' : 'meses'}${s.depoisDoPrazo ? ' (depois do prazo)' : ''}`;
}

/** Uma linha na conta: quanto ela pesa (por mês ou uma vez) e quanto traz (o aparelho vendido ou alugado). */
export type LinhaNaConta = {
  id: string;
  /** a quantidade usada (a dos ramais, nas linhas "por ramal") */
  qtd: number;
  /** o custo: uma vez (os aparelhos, "uma vez") ou por mês (os outros) */
  custo: number;
  quando: 'uma-vez' | 'por-mes';
  /** o que o aparelho traz: o preço dos vendidos (uma vez) ou o aluguel (por mês) */
  receita: number;
  /** a linha (ou o preço do aparelho) ainda sem valor */
  falta: boolean;
  /** o aparelho comprado parcelado: em quantas vezes (1 = à vista; nunca mais que o prazo) */
  parcelas: number;
};

export type ContasDoCenario = {
  /** o aluguel dos aparelhos alugados, por mês */
  aluguel: number;
  /** o preço dos aparelhos vendidos (entra na ativação) */
  vendaDeAparelhos: number;
  /** o que o cliente paga por mês: a mensalidade e o aluguel */
  mensalTotal: number;
  /** o que o cliente paga de ativação: a do serviço e os aparelhos vendidos */
  entradaTotal: number;
  /** o valor de cada parcela da ativação (a primeira leva o resto da divisão) */
  parcelas: number[];
  /** os custos que se pagam uma vez (os aparelhos e o resto), somados — os aparelhos parcelados, inteiros */
  custoUnico: number;
  /** o que sai de cada mês, do mês 0 (a assinatura) ao fim do prazo, pelos custos de uma vez: na assinatura,
   *  tudo menos as parcelas que ficam para depois; nos meses seguintes, as parcelas dos aparelhos comprados parcelado */
  saidas: number[];
  /** os custos fixos do mês (as linhas "por mês") */
  custoMensalFixo: number;
  /** o imposto e a comissão de cada mês */
  impostoMensal: number;
  comissaoMensal: number;
  /** tudo o que sai por mês */
  custoMensal: number;
  /** o imposto e a comissão sobre a ativação inteira */
  impostoDaEntrada: number;
  comissaoDaEntrada: number;
  /** o que sobra por mês (a mensalidade menos o custo do mês) */
  sobraMensal: number;
  /** a sobra sobre a mensalidade (fração; nulo sem mensalidade) */
  margem: number | null;
  sinal: Sinal | null;
  /** o acumulado do contrato, do mês 0 (a assinatura) ao fim do prazo */
  serie: number[];
  /** o pior momento do acumulado: quanto a Ingline põe antes de a venda se pagar */
  investimento: number;
  sePagaEm: SePagaEm;
  /** o que fica no fim do contrato */
  resultado: number;
  /** a mensalidade (do serviço) mínima para a margem que se quer; nulo = nenhuma dá */
  minima: number | null;
  /** a mensalidade mínima para ficar no verde */
  minimaVerde: number | null;
  /** quanto dá para baixar a mensalidade sem sair do verde (0 = já está no limite ou abaixo) */
  descontoMaximo: number | null;
  /** cada linha na conta */
  linhas: LinhaNaConta[];
  /** os nomes das linhas que ainda não têm valor */
  faltam: string[];
};

/**
 * O custo por faixas: cada unidade paga o preço da faixa em que cai (a 1ª faixa da Helena, de preço 0, é o
 * que vem na licença). 5 usuários: os 3 primeiros inclusos e 2 × R$ 19,90 = R$ 39,80. Em centavos (com fração).
 */
export function custoPorFaixas(qtd: number, faixas: readonly FaixaDePreco[]): number {
  let total = 0;
  let antes = 0;
  for (const f of faixas) {
    const fim = f.ate ?? Infinity;
    total += Math.max(0, Math.min(qtd, fim) - antes) * f.valor;
    if (qtd <= fim) break;
    antes = fim;
  }
  return total;
}

/** O preço por unidade, em reais, com as casas que ele tiver (R$ 19,90; R$ 0,045). */
export const precoDaUnidade = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(centavos / 100);

/** As faixas numa frase: "até 3, incluso; de 4 a 20, R$ 19,90 cada; de 21 a 100, R$ 14,90 cada; acima de 100, R$ 12,90 cada". */
export function textoDasFaixasDePreco(faixas: readonly FaixaDePreco[]): string {
  let antes = 0;
  return faixas.map((f) => {
    const de = antes + 1;
    const quanto = f.valor === 0 ? 'incluso' : `${precoDaUnidade(f.valor)} cada`;
    const trecho = f.ate == null ? (antes ? `acima de ${antes.toLocaleString('pt-BR')}` : 'cada um') : de === 1 ? `até ${f.ate.toLocaleString('pt-BR')}` : de === f.ate ? `o ${de.toLocaleString('pt-BR')}º` : `de ${de.toLocaleString('pt-BR')} a ${f.ate.toLocaleString('pt-BR')}`;
    antes = f.ate ?? antes;
    return `${trecho}, ${quanto}`;
  }).join('; ');
}

/** A quantidade que a linha usa: os ramais, nas linhas "por ramal"; 1 nos percentuais. */
export const quantidadeDaLinha = (l: Pick<LinhaDoCenario, 'tipo' | 'qtd' | 'porRamal'>, c: Pick<CenarioDaSimulacao, 'ramais'>) =>
  (ehPercentual(l.tipo) ? 1 : l.porRamal ? c.ramais : l.qtd);

/** Em quantas vezes a compra do aparelho sai de verdade: de 1 ao máximo, e nunca mais que o prazo do contrato. */
export const vezesDaCompra = (l: Pick<LinhaDoCenario, 'tipo' | 'parcelas'>, prazo: number) =>
  (l.tipo === 'aparelho' ? Math.max(1, Math.min(Math.floor(l.parcelas ?? 1), MAX_PARCELAS_DA_COMPRA, Math.max(1, Math.floor(prazo)))) : 1);

/** O valor da ativação em N parcelas iguais, em centavos; a primeira leva o resto da divisão. */
export function dividirEmParcelas(total: number, n: number): number[] {
  const vezes = Math.max(1, Math.floor(n));
  const cada = Math.floor(total / vezes);
  const partes = Array.from({ length: vezes }, () => cada);
  partes[0] = total - cada * (vezes - 1);
  return partes;
}

/** A mensalidade (do serviço) mínima para a margem `alvo` (%), em centavos; nulo = nenhuma dá (os percentuais já passam dela). */
function mensalidadeMinima(alvo: number, fixo: number, aluguel: number, percentuais: number): number | null {
  const sobra = 1 - percentuais - alvo / 100;
  if (sobra <= 1e-9) return null;
  return Math.max(0, Math.ceil(fixo / sobra - aluguel - 1e-6));
}

export function contasDoCenario(c: CenarioDaSimulacao, faixas: FaixasDoSinal): ContasDoCenario {
  const imposto = c.imposto / 100;
  let aluguel = 0; let vendaDeAparelhos = 0; let custoUnico = 0; let custoMensalFixo = 0; let pctMensalidade = 0; let pctAtivacao = 0;
  const faltam: string[] = [];
  // os aparelhos comprados parcelado: o custo de cada um se dilui nos meses (a primeira parcela na assinatura)
  const compras: Array<{ total: number; vezes: number }> = [];
  // as linhas de percentual só têm o custo depois de saber a mensalidade e a ativação (fica para o fim)
  const conta: Array<Omit<LinhaNaConta, 'custo'> & { custo: number; sobre: 'mensal' | 'entrada' | null; pct: number }> = [];
  for (const l of c.linhas) {
    const qtd = quantidadeDaLinha(l, c);
    const valor = l.valor ?? 0;
    const faixas = comFaixas(l.tipo, l.faixas);
    let falta = l.valor == null && !faixas;
    if (l.tipo === 'aparelho') {
      custoUnico += qtd * valor;
      let receita = 0;
      if (l.modalidade === 'venda' || l.modalidade === 'locacao') {
        if (l.preco == null) falta = true;
        receita = qtd * (l.preco ?? 0);
        if (l.modalidade === 'venda') vendaDeAparelhos += receita; else aluguel += receita;
      }
      const vezes = vezesDaCompra(l, c.prazo);
      if (vezes > 1) compras.push({ total: qtd * valor, vezes });
      conta.push({ id: l.id, qtd, custo: qtd * valor, quando: 'uma-vez', receita, falta, sobre: null, pct: 0, parcelas: vezes });
    } else if (l.tipo === 'unica') {
      const custo = faixas ? custoPorFaixas(qtd, faixas) : qtd * valor;
      custoUnico += custo;
      conta.push({ id: l.id, qtd, custo, quando: 'uma-vez', receita: 0, falta, sobre: null, pct: 0, parcelas: 1 });
    } else if (l.tipo === 'mensal') {
      const custo = faixas ? custoPorFaixas(qtd, faixas) : qtd * valor;
      custoMensalFixo += custo;
      conta.push({ id: l.id, qtd, custo, quando: 'por-mes', receita: 0, falta, sobre: null, pct: 0, parcelas: 1 });
    } else if (l.tipo === 'pct_mensalidade') {
      pctMensalidade += valor / 100;
      conta.push({ id: l.id, qtd: 1, custo: 0, quando: 'por-mes', receita: 0, falta, sobre: 'mensal', pct: valor / 100, parcelas: 1 });
    } else {
      pctAtivacao += valor / 100;
      conta.push({ id: l.id, qtd: 1, custo: 0, quando: 'uma-vez', receita: 0, falta, sobre: 'entrada', pct: valor / 100, parcelas: 1 });
    }
    if (falta) faltam.push(l.nome);
  }
  const mensalTotal = c.mensalidade + aluguel;
  const entradaTotal = c.ativacao + vendaDeAparelhos;
  const impostoMensal = imposto * mensalTotal;
  const comissaoMensal = pctMensalidade * mensalTotal;
  const custoMensal = custoMensalFixo + impostoMensal + comissaoMensal;
  const sobraMensal = mensalTotal - custoMensal;
  const vezes = Math.min(Math.max(1, c.parcelas), Math.max(1, c.prazo));
  const parcelas = dividirEmParcelas(entradaTotal, vezes);
  const retidoDaEntrada = imposto + pctAtivacao;

  // o que sai em cada mês pelos custos de uma vez: tudo na assinatura, menos as parcelas dos aparelhos comprados
  // parcelado, que saem nos meses seguintes (a primeira leva o resto da divisão, como na ativação)
  const saidas = Array.from({ length: c.prazo + 1 }, (_, m) => (m === 0 ? custoUnico : 0));
  for (const compra of compras) {
    saidas[0]! -= compra.total;
    dividirEmParcelas(Math.round(compra.total), compra.vezes).forEach((p, k) => { saidas[k]! += p; });
  }
  // o acumulado: no mês 0, o que sai na assinatura e a primeira parcela da ativação; depois, a sobra de cada mês,
  // as outras parcelas da ativação e as dos aparelhos
  const serieExata: number[] = [];
  let acumulado = 0;
  for (let m = 0; m <= c.prazo; m++) {
    acumulado += (m === 0 ? 0 : sobraMensal) - saidas[m]!;
    if (m < parcelas.length) acumulado += parcelas[m]! * (1 - retidoDaEntrada);
    serieExata.push(acumulado);
  }
  const serie = serieExata.map((v) => Math.round(v));
  const investimento = Math.max(0, -Math.min(...serie));
  let ultimoNegativo = -1;
  for (let m = serie.length - 1; m >= 0; m--) if (serie[m]! < 0) { ultimoNegativo = m; break; }
  const sobra = Math.round(sobraMensal);
  let sePagaEm: SePagaEm;
  if (ultimoNegativo === -1) sePagaEm = custoUnico > 0 || entradaTotal > 0 ? { tipo: 'entrada' } : { tipo: 'sem-custo' };
  else if (ultimoNegativo < c.prazo) sePagaEm = { tipo: 'mes', mes: ultimoNegativo + 1, depoisDoPrazo: false };
  else if (sobra > 0) sePagaEm = { tipo: 'mes', mes: c.prazo + Math.ceil(-serie[c.prazo]! / sobra), depoisDoPrazo: true };
  else sePagaEm = { tipo: 'nunca' };

  const margem = mensalTotal > 0 ? sobraMensal / mensalTotal : null;
  const minima = mensalidadeMinima(c.margemAlvo, custoMensalFixo, aluguel, imposto + pctMensalidade);
  const minimaVerde = mensalidadeMinima(faixas.verde, custoMensalFixo, aluguel, imposto + pctMensalidade);
  return {
    aluguel, vendaDeAparelhos, mensalTotal, entradaTotal, parcelas, custoUnico: Math.round(custoUnico), saidas: saidas.map((v) => Math.round(v)), custoMensalFixo: Math.round(custoMensalFixo),
    impostoMensal: Math.round(impostoMensal), comissaoMensal: Math.round(comissaoMensal), custoMensal: Math.round(custoMensal),
    impostoDaEntrada: Math.round(imposto * entradaTotal), comissaoDaEntrada: Math.round(pctAtivacao * entradaTotal),
    sobraMensal: sobra, margem, sinal: margem == null ? null : sinalDaMargem(margem, faixas),
    serie, investimento, sePagaEm, resultado: serie[serie.length - 1]!,
    minima, minimaVerde, descontoMaximo: minimaVerde == null ? null : Math.max(0, c.mensalidade - minimaVerde),
    linhas: conta.map(({ sobre, pct, ...l }) => ({
      ...l,
      custo: sobre === 'mensal' ? Math.round(pct * mensalTotal) : sobre === 'entrada' ? Math.round(pct * entradaTotal) : Math.round(l.custo),
    })),
    faltam,
  };
}

/** O resumo do cenário: o que a lista, a negociação e os cenários lado a lado mostram. */
export function resumoDoCenario(c: CenarioDaSimulacao, faixas: FaixasDoSinal): ResumoDoCenario {
  const k = contasDoCenario(c, faixas);
  return {
    nome: c.nome, prazo: c.prazo, mensalTotal: k.mensalTotal, entradaTotal: k.entradaTotal, sobraMensal: k.sobraMensal,
    margem: k.margem, sinal: k.sinal, investimento: k.investimento, sePagaEm: k.sePagaEm, resultado: k.resultado, faltam: k.faltam.length,
  };
}

/** O cenário principal da simulação (o primeiro, se o principal sumiu). */
export const cenarioPrincipal = (s: Pick<Simulacao, 'cenarios' | 'principal'>) => s.cenarios.find((c) => c.id === s.principal) ?? s.cenarios[0]!;

// =====================================================================
//  A MARGEM DAS GANHAS (o relatório do Comercial)
// =====================================================================

/*
 * O pedido (a ideia marcada "agora", 20/10): "a margem média das negociações ganhas no período, por vendedor
 * e por produto". Cada ganha com simulação ligada entra com o cenário principal da simulação (a mais recente,
 * se houver mais de uma). A margem do grupo é a sobra de todas sobre a mensalidade de todas (a média pesada
 * pelo valor: a venda grande pesa mais que a pequena), com o sinal pelas faixas dos Ajustes.
 */

/** A simulação de uma negociação, para o relatório: o cenário principal (da mais recente, se houver mais de uma). */
export type MargemDaNegociacao = { simulacaoId: string; simulacao: string; mensalTotal: number; sobraMensal: number };
/** Um grupo da margem: quantas ganhas (com simulação), a mensalidade e a sobra somadas e a margem (sobra ÷ mensalidade). */
export type GrupoDaMargem = { nome: string; qtd: number; mensalidade: number; sobra: number; margem: number | null; sinal: Sinal | null; ids: string[] };
/** A margem das ganhas do período: no total, por vendedor (quem cuida) e por produto. */
export type MargemDasGanhas = { ganhas: number; comSimulacao: number; geral: GrupoDaMargem; porVendedor: GrupoDaMargem[]; porProduto: GrupoDaMargem[] };

export function margemDasGanhas(
  ganhas: ReadonlyArray<{ id: string; responsavel: string | null; produtos?: readonly string[] }>,
  margens: ReadonlyMap<string, MargemDaNegociacao>,
  faixas: FaixasDoSinal,
): MargemDasGanhas {
  const grupo = (nome: string, ids: string[]): GrupoDaMargem => {
    const ms = ids.map((id) => margens.get(id)!);
    const mensalidade = ms.reduce((s, m) => s + m.mensalTotal, 0);
    const sobra = ms.reduce((s, m) => s + m.sobraMensal, 0);
    const margem = mensalidade > 0 ? sobra / mensalidade : null;
    return { nome, qtd: ids.length, mensalidade, sobra, margem, sinal: margem == null ? null : sinalDaMargem(margem, faixas), ids };
  };
  const com = ganhas.filter((g) => margens.has(g.id));
  const juntar = (chaves: (g: (typeof com)[number]) => string[]) => {
    const m = new Map<string, string[]>();
    for (const g of com) for (const k of chaves(g)) m.set(k, [...(m.get(k) ?? []), g.id]);
    return [...m].map(([nome, ids]) => grupo(nome, ids)).sort((x, y) => y.mensalidade - x.mensalidade || x.nome.localeCompare(y.nome, 'pt-BR'));
  };
  return {
    ganhas: ganhas.length, comSimulacao: com.length, geral: grupo('Todas', com.map((g) => g.id)),
    porVendedor: juntar((g) => [g.responsavel ?? 'Sem responsável']),
    porProduto: juntar((g) => (g.produtos?.length ? [...new Set(g.produtos)] : ['Sem produto'])),
  };
}

// =====================================================================
//  O QUE MUDOU (a auditoria)
// =====================================================================

/** O mesmo conteúdo, sem ligar para a ordem das chaves (o jsonb do banco devolve as chaves em outra ordem). */
function iguais(a: unknown, b: unknown): boolean {
  const ordenado = (x: unknown): unknown => (Array.isArray(x) ? x.map(ordenado)
    : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, ordenado((x as Record<string, unknown>)[k])])) : x);
  return JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
}

const CAMPOS_DO_CENARIO: Array<[keyof CenarioDaSimulacao, string, (v: number) => string]> = [
  ['mensalidade', 'a mensalidade', reaisCurto], ['ativacao', 'a ativação', reaisCurto],
  ['parcelas', 'as parcelas da ativação', (v) => `${v}x`], ['prazo', 'o prazo', (v) => `${v} ${v === 1 ? 'mês' : 'meses'}`],
  ['ramais', 'os ramais', (v) => String(v)], ['imposto', 'o imposto', percentual], ['margemAlvo', 'a margem que se quer', percentual],
];

/** O que mudou na simulação, em frases curtas ("no Cenário A, a mensalidade de R$ 990,00 para R$ 1.090,00"). */
export function mudancasDaSimulacao(antes: SimulacaoGravar, depois: SimulacaoGravar): string[] {
  const m: string[] = [];
  if (antes.nome !== depois.nome) m.push(`o nome de "${antes.nome}" para "${depois.nome}"`);
  for (const c of depois.cenarios) {
    const a = antes.cenarios.find((x) => x.id === c.id);
    if (!a) { m.push(`incluiu o ${c.nome}`); continue; }
    const aqui: string[] = [];
    if (a.nome !== c.nome) aqui.push(`o nome para "${c.nome}"`);
    for (const [campo, nome, fmt] of CAMPOS_DO_CENARIO) {
      const de = a[campo] as number; const para = c[campo] as number;
      if (de !== para) aqui.push(`${nome} de ${fmt(de)} para ${fmt(para)}`);
    }
    if (!iguais(a.linhas, c.linhas)) aqui.push('os custos');
    if (!iguais(a.produtos ?? [], c.produtos ?? [])) aqui.push('os produtos');
    if (!iguais(a.porProduto ?? null, c.porProduto ?? null)) aqui.push(c.porProduto ? (a.porProduto ? 'o preço de cada produto' : 'o preço passou a ser por produto') : 'o preço voltou a ser um só');
    if (aqui.length) m.push(`no ${a.nome}, ${aqui.join(', ')}`);
  }
  for (const a of antes.cenarios) if (!depois.cenarios.some((c) => c.id === a.id)) m.push(`tirou o ${a.nome}`);
  if (antes.principal !== depois.principal) {
    m.push(`o principal passou a ser o ${depois.cenarios.find((c) => c.id === depois.principal)?.nome ?? 'outro cenário'}`);
  }
  return m;
}

/** O que mudou nos Ajustes do Simulador, em frases curtas. */
export function mudancasDosAjustes(antes: AjustesDoSimulador, depois: AjustesDoSimulador): string[] {
  const m: string[] = [];
  if (antes.imposto !== depois.imposto) m.push(`o imposto de ${percentual(antes.imposto)} para ${percentual(depois.imposto)}`);
  if (antes.verde !== depois.verde || antes.vermelho !== depois.vermelho) m.push(`o sinal (${textoDasFaixas(depois)})`);
  if (antes.prazo !== depois.prazo) m.push(`o prazo de ${antes.prazo} para ${depois.prazo} meses`);
  const entrou = depois.custos.filter((c) => !antes.custos.some((a) => a.id === c.id)).map((c) => c.nome);
  const saiu = antes.custos.filter((a) => !depois.custos.some((c) => c.id === a.id)).map((c) => c.nome);
  const mudou = depois.custos.filter((c) => { const a = antes.custos.find((x) => x.id === c.id); return a && !iguais(a, c); }).map((c) => c.nome);
  if (entrou.length) m.push(`incluiu na tabela ${entrou.join(', ')}`);
  if (mudou.length) m.push(`mudou na tabela ${mudou.join(', ')}`);
  if (saiu.length) m.push(`tirou da tabela ${saiu.join(', ')}`);
  const modeloEntrou = depois.modelos.filter((x) => !antes.modelos.some((a) => a.id === x.id)).map((x) => x.nome);
  const modeloSaiu = antes.modelos.filter((a) => !depois.modelos.some((x) => x.id === a.id)).map((x) => x.nome);
  const modeloMudou = depois.modelos.filter((x) => { const a = antes.modelos.find((y) => y.id === x.id); return a && !iguais(a, x); }).map((x) => x.nome);
  if (modeloEntrou.length) m.push(`incluiu o modelo ${modeloEntrou.join(', ')}`);
  if (modeloMudou.length) m.push(`mudou o modelo ${modeloMudou.join(', ')}`);
  if (modeloSaiu.length) m.push(`tirou o modelo ${modeloSaiu.join(', ')}`);
  return m;
}
