/**
 * O CARD DE FATURAMENTO (Patch 2.4.11, decisão 0066). O Luan, com o print do Implantado - Concluído da implantação e o do
 * card GLA-67 que ele escreve à mão no Grupo Line - ADM: *"quero que quando eu arraste pra concluído seja gerado um card no
 * administrativo de faturamento e tem que ter a opção de eu colocar a descrição lá do card o email do faturamento o vencimento
 * da fatura e as informações como eu fiz na imagem abaixo"*.
 *
 * A etapa do painel de Gestão que **abre o faturamento** (`abreFaturamento`, o id do painel administrativo): o card que chega
 * nela mostra antes a janela com o título, o e-mail do faturamento, o vencimento da fatura, o CNPJ e as informações (a ativação
 * com as Condições especiais, cada produto com a mensalidade e as licenças da simulação principal) — tudo já preenchido, e tudo
 * se muda ali. O card de faturamento nasce na entrada do painel administrativo, com a descrição no formato do print dele, ligado
 * ao card que o abriu (`source_ticket_id`, como a implantação é ligada à negociação: um card abre um só).
 *
 * As contas são as mesmas no servidor, na prévia e na janela.
 */
import { z } from 'zod';
import { reais } from './formatos.js';
import { textoDaAtivacao, textoDoDesconto, type CondicoesDaNegociacao } from './negociacao.js';
import { NOME_DA_MODALIDADE, type CenarioDaSimulacao, type LinhaDoCenario } from './simulador.js';

/** Um produto nas informações: o nome, a mensalidade dele (nula: a negociação tem um valor só) e os itens contratados. */
export type ProdutoDoFaturamento = { nome: string; mensalidade: number | null; itens: Array<{ qtd: number; nome: string }> };

/** O que as informações do faturamento precisam: a mensalidade, a ativação, o que foi combinado e os produtos. */
export type BaseDoFaturamento = {
  /** a mensalidade da negociação (o total), em centavos; nula: sem negociação ou sem valor */
  mensalidade: number | null;
  ativacao: number | null;
  condicoes: CondicoesDaNegociacao | null;
  produtos: ProdutoDoFaturamento[];
};

/** O item de uma linha do cenário que entra nas informações: as do mês (as licenças, os números) e os aparelhos. */
const entraNasInformacoes = (l: Pick<LinhaDoCenario, 'tipo' | 'qtd'>) => (l.tipo === 'mensal' || l.tipo === 'aparelho') && l.qtd > 0;

/**
 * Os produtos da negociação, na ordem dela, com a mensalidade de cada um (o valor por produto) e os itens da simulação principal
 * (as linhas do mês e os aparelhos, com a quantidade). A linha sem produto vai para o primeiro produto do cenário (como no
 * Simulador); a de um produto que a negociação não tem fica de fora.
 */
export function produtosDoFaturamento(e: {
  produtos: Array<{ id: string; codigo: string | null; nome: string }>;
  valores: Record<string, number> | null | undefined;
  cenario: Pick<CenarioDaSimulacao, 'linhas' | 'produtos'> | null;
}): ProdutoDoFaturamento[] {
  const primeiro = e.cenario?.produtos[0] ?? null;
  return e.produtos.map((p) => {
    const linhas = (e.cenario?.linhas ?? []).filter((l) => entraNasInformacoes(l) && (l.produto ?? primeiro) === p.codigo);
    return {
      nome: p.nome,
      mensalidade: e.valores?.[p.id] ?? null,
      itens: linhas.map((l) => ({ qtd: l.qtd, nome: l.tipo === 'aparelho' && l.modalidade ? `${l.nome} (${NOME_DA_MODALIDADE[l.modalidade].toLocaleLowerCase('pt-BR')})` : l.nome })),
    };
  });
}

/** A quantidade com dois algarismos, como o Luan escreve ("06 Licenças usuários de callcenter"); a grande, com o ponto ("12.000"). */
const NUMERO = new Intl.NumberFormat('pt-BR');
const quantidade = (n: number) => (n < 10 ? String(n).padStart(2, '0') : NUMERO.format(n));

/**
 * As informações do card de faturamento, no formato do print do Luan: a ativação (com o que foi combinado: em quantas vezes,
 * a partir de quando, o desconto), o desconto na mensalidade e a observação das Condições especiais; depois, cada produto com a
 * mensalidade e os itens, um por linha, com uma linha em branco entre os blocos. Sem valor por produto, a mensalidade vai numa
 * linha só, antes dos produtos (com um produto só, ela é a dele).
 */
export function informacoesDoFaturamento(b: BaseDoFaturamento): string {
  const blocos: string[][] = [];
  const c = b.condicoes;
  const doTopo: string[] = [];
  if (b.ativacao) doTopo.push(`Ativação ${reais(b.ativacao)}${c?.ativacao ? ` ${textoDaAtivacao(c.ativacao)}` : ''}`);
  if (c?.descontos.length) doTopo.push(`Desconto na mensalidade: ${c.descontos.map((d, i) => `${i ? 'depois ' : ''}${textoDoDesconto(d)}`).join(', ')}`);
  if (c?.observacao?.trim()) doTopo.push(`OBS: ${c.observacao.trim()}`);
  const porProduto = b.produtos.some((p) => p.mensalidade != null);
  // um produto só, sem o valor por produto: a mensalidade é a dele ("LineChat: R$ 990,00", como o Luan escreve)
  const produtos = !porProduto && b.produtos.length === 1 && b.mensalidade ? [{ ...b.produtos[0]!, mensalidade: b.mensalidade }] : b.produtos;
  if (!porProduto && produtos === b.produtos && b.mensalidade) doTopo.push(`Mensalidade: ${reais(b.mensalidade)}`);
  if (doTopo.length) blocos.push(doTopo);
  for (const p of produtos) {
    blocos.push([
      p.mensalidade != null ? `${p.nome}: ${reais(p.mensalidade)}` : p.nome,
      ...p.itens.map((i) => `${quantidade(i.qtd)} ${i.nome}`),
    ]);
  }
  // o espaço do "R$ 954,00" é o de sempre (o formato do navegador põe o que não quebra): o texto vai para a descrição, o e-mail…
  return blocos.map((l) => l.join('\n')).join('\n\n').replace(/\u00a0/g, ' ');
}

/** O título do card de faturamento: "Clínica SOS - Faturamento" (como os do Grupo Line - ADM). */
export const tituloDoFaturamento = (cliente: string) => `${cliente.trim()} - Faturamento`.slice(0, 200);

/** "10/11/2026" (o dia guardado como AAAA-MM-DD, sem passar pelo fuso). */
const diaEscrito = (dia: string) => dia.split('-').reverse().join('/');

/**
 * A descrição do card de faturamento, como o Luan escreve: "Faturamento <cliente>", o e-mail, a data do vencimento e o CNPJ, uma
 * linha em branco e as informações. O que estiver vazio não entra.
 */
export function descricaoDoFaturamento(p: { cliente: string; email?: string | null; vencimento?: string | null; cnpj?: string | null; informacoes?: string | null }): string {
  const cabeca = [
    `Faturamento ${p.cliente.trim()}`,
    ...(p.email?.trim() ? [`E-mail para faturamento: ${p.email.trim()}`] : []),
    ...(p.vencimento ? [`Data de vencimento: ${diaEscrito(p.vencimento)}`] : []),
    ...(p.cnpj?.trim() ? [`CNPJ do faturamento: ${p.cnpj.trim()}`] : []),
  ];
  const info = (p.informacoes ?? '').replace(/\r\n?/g, '\n').trim();
  return info ? `${cabeca.join('\n')}\n\n${info}` : cabeca.join('\n');
}

/**
 * O plano do faturamento (a janela antes de mover): para onde vai o card, se já foi aberto, e o que vem preenchido. `origem`
 * diz de onde vieram as informações (a negociação e a simulação principal), para a janela contar.
 */
export type PlanoDoFaturamento = {
  painel: { id: string; nome: string; sigla: string };
  /** a etapa em que o card nasce (a entrada do painel administrativo) */
  etapa: string | null;
  /** o card já abriu o faturamento (um só): a etapa só move */
  jaAberto: { codigo: string } | null;
  cliente: string | null;
  /** o nome do "Faturamento <nome>" da descrição: o cliente; sem ele, o título do card */
  nome: string;
  titulo: string;
  email: string | null;
  vencimento: string | null;
  cnpj: string | null;
  informacoes: string;
  origem: { negociacao: string | null; simulacao: string | null };
};

/** O que a janela manda ao mover: o que a pessoa deixou (ou mudou) em cada campo. */
export const PedidoDoFaturamentoSchema = z.object({
  titulo: z.string().trim().min(3, 'O título vai de 3 letras para cima.').max(200),
  /** um ou mais e-mails (o Luan escreve dois juntos: "financeiro@…/barbara@…"), como foram escritos */
  email: z.string().trim().max(300).nullish().transform((v) => v || null),
  /** o dia do vencimento da fatura (AAAA-MM-DD) */
  vencimento: z.string().trim().nullish().transform((v) => v || null)
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'O vencimento vai como dia/mês/ano.').nullable()),
  cnpj: z.string().trim().max(30).nullish().transform((v) => v || null),
  informacoes: z.string().max(20_000, 'As informações vão até 20.000 letras.').default(''),
});
export type PedidoDoFaturamento = z.infer<typeof PedidoDoFaturamentoSchema>;
export type PedidoDoFaturamentoEntrada = z.input<typeof PedidoDoFaturamentoSchema>;

/** O pedido de quem não mexeu na janela (o teste, a integração): o que o plano trouxe preenchido. */
export const pedidoDoPlano = (p: PlanoDoFaturamento): PedidoDoFaturamento => ({
  titulo: p.titulo, email: p.email, vencimento: p.vencimento, cnpj: p.cnpj, informacoes: p.informacoes,
});
