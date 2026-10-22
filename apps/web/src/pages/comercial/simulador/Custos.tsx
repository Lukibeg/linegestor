/**
 * Os custos do cenário (o Simulador do Comercial, 2.0.2): uma linha por custo — o nome, como entra (o
 * aparelho, uma vez, por mês, % da mensalidade, % da ativação), a quantidade (a pessoa põe a de cada custo: o
 * "por ramal" saiu em 21/10), o valor de cada um e o total. O aparelho diz se vai em comodato, venda ou locação; o custo por
 * faixas (os usuários do LineChat da Helena) mostra as faixas e calcula sozinho. Entram da tabela dos Ajustes
 * (com um clique), de um modelo ou digitados. As linhas guardam o valor de quando entraram.
 *
 * Em dois grupos (o Luan, 20/10: "separe os custos fixos com custos mensais"): o **investimento**, pago uma vez
 * (o aparelho, o "uma vez", a comissão da venda), e os **custos mensais** (o "por mês", a comissão recorrente),
 * cada um num quadro com a cor, o total, a tabela e o "digitar" dele (o Luan: "tem que ter uma separação melhor
 * visualmente"). O primeiro se chamava "Custos fixos" ("parece que vai ser todo mês").
 *
 * O LineChat (2.0.3; o Luan, 21/10: "eu só quero colocar quantidade de canais oficiais, usuários, canais n oficiais,
 * agentes de ia, e vc já me dar o total como é na planilha deles"): com o produto LineChat no cenário, os Custos
 * mensais abrem com o quadro do LineChat — as quatro quantidades, o custo de cada uma e o total do mês. As linhas da
 * tabela da Helena saem da lista (o quadro mostra e soma) e as faixas não aparecem (valem por trás, nos Ajustes).
 */
import { useMemo, useState } from 'react';
import { Layers, ListPlus, MessagesSquare, PackagePlus, Plus, Repeat, Search, Wallet, X } from 'lucide-react';
import {
  AJUDA_DA_MODALIDADE, AJUDA_DO_GRUPO, AJUDA_DO_TIPO_DE_CUSTO, GRUPOS_DE_CUSTO, GRUPO_DO_TIPO, MAX_PARCELAS_DA_COMPRA, MODALIDADES_DO_APARELHO, NOME_DA_MODALIDADE,
  NOME_DO_GRUPO, NOME_DO_TIPO_DE_CUSTO, TIPOS_DO_GRUPO, TIPO_NOVO_DO_GRUPO, tiposParaEscolher, UM_CUSTO_DO_GRUPO, dividirEmParcelas, ehLinhaDoLineChat, ehPercentual, linhaDaTabela, linhaNova, linhasDoModelo,
  mudarQuantidadeDoLineChat, paraBusca, percentual, precoDaUnidade, quadroDoLineChat, textoDasFaixasDePreco, textoDosInclusos,
  type AjustesDoSimulador, type CenarioDaSimulacao, type ContasDoCenario, type CustoDaTabela, type GrupoDeCusto, type LinhaDoCenario, type QuadroDoLineChat, type TipoDeCusto,
} from '@gestor/shared';
import { Popover } from '../../../components/ui/index.js';
import { CampoDePercentual, CampoDeReais, CampoInteiro, plural, reais, reaisLimpo } from './comum.js';

const COLUNAS = 'md:grid-cols-[minmax(0,1fr)_104px_120px_96px_28px]';

/** A cor e o ícone de cada grupo: o investimento (pago uma vez) e os custos mensais (todo mês). */
export const VISUAL_DO_GRUPO = {
  fixo: { Icone: Wallet, faixa: 'bg-signal-soft', borda: 'border-l-signal', cor: 'text-signal' },
  mensal: { Icone: Repeat, faixa: 'bg-turquesa-soft', borda: 'border-l-turquesa', cor: 'text-turquesa' },
} as const;

/** O valor de um custo da tabela, curto: "R$ 9,00 por mês", "10% da ativação", "por faixas", "preencher". */
export function valorDoCusto(c: Pick<CustoDaTabela, 'tipo' | 'valor' | 'faixas' | 'unidade'>): string {
  if (c.faixas?.length) return `por faixas (${textoDasFaixasDePreco(c.faixas)})`;
  if (c.valor == null) return 'o valor em cada simulação';
  if (ehPercentual(c.tipo)) return `${percentual(c.valor)} ${c.tipo === 'pct_mensalidade' ? 'da mensalidade' : 'da ativação'}`;
  const cada = c.unidade ? `por ${c.unidade}` : 'cada';
  return `${precoDaUnidade(c.valor)} ${cada}${c.tipo === 'mensal' ? ' por mês' : c.tipo === 'unica' ? ', uma vez' : ''}`;
}

/** `nomeDoProduto`: com dois produtos ou mais, cada linha diz de qual produto veio (a instalação do LinePBX e a do LineChat). */
export function OsCustos({ c, k, ajustes, mudar, podeEditar, nomeDoProduto }: {
  c: CenarioDaSimulacao; k: ContasDoCenario; ajustes: AjustesDoSimulador; mudar: (m: Partial<CenarioDaSimulacao>) => void; podeEditar: boolean;
  nomeDoProduto?: (codigo: string) => string;
}) {
  const mudarLinha = (id: string, m: Partial<LinhaDoCenario>) => mudar({ linhas: c.linhas.map((l) => (l.id === id ? { ...l, ...m } : l)) });
  const tirar = (id: string) => mudar({ linhas: c.linhas.filter((l) => l.id !== id) });
  const incluir = (novas: LinhaDoCenario[]) => mudar({ linhas: [...c.linhas, ...novas] });
  // as linhas de um modelo entram no fim, e o produto dele entra nos produtos do cenário (a linha do LineChat que o
  // cenário já tem não repete: o quadro do LineChat é um só)
  const incluirDoModelo = (novas: LinhaDoCenario[], produto: string | null) =>
    mudar({
      linhas: [...c.linhas, ...novas.filter((l) => !ehLinhaDoLineChat(l) || !c.linhas.some((x) => x.custoId === l.custoId))],
      ...(produto && !c.produtos.includes(produto) ? { produtos: [...c.produtos, produto] } : {}),
    });
  return (
    <section className="card p-4 min-w-0" aria-label="Os custos" id="simulador-custos">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display font-semibold text-[15px]">
          Os custos <span className="font-body font-normal text-[12.5px] text-muted">{c.linhas.length ? `${c.linhas.length} ${c.linhas.length === 1 ? 'linha' : 'linhas'}` : ''}</span>
        </h2>
        {podeEditar && ajustes.modelos.length > 0 && <DoModelo ajustes={ajustes} incluir={incluirDoModelo} />}
      </header>
      {!c.linhas.length && podeEditar && (
        <p className="text-[12.5px] text-muted mt-1">Ponha os custos da tabela (os de sempre, com o valor de hoje), de um modelo pronto ou digitados.</p>
      )}
      <div className="mt-3 flex flex-col gap-4">
        {GRUPOS_DE_CUSTO.map((g) => (
          <GrupoDeCustos key={g} grupo={g} c={c} k={k} ajustes={ajustes} podeEditar={podeEditar} nomeDoProduto={c.produtos.length > 1 ? nomeDoProduto : undefined}
            mudarLinha={mudarLinha} tirar={tirar} incluir={incluir} mudar={mudar} />
        ))}
      </div>
    </section>
  );
}

/**
 * Um grupo de custos (o investimento ou os mensais), num quadro com a cor dele: a faixa do alto com o nome, o que
 * entra nele e o total; a tabela e o "digitar" dele; as linhas.
 */
function GrupoDeCustos({ grupo, c, k, ajustes, podeEditar, nomeDoProduto, mudarLinha, tirar, incluir, mudar }: {
  grupo: GrupoDeCusto; c: CenarioDaSimulacao; k: ContasDoCenario; ajustes: AjustesDoSimulador; podeEditar: boolean; nomeDoProduto?: (codigo: string) => string;
  mudarLinha: (id: string, m: Partial<LinhaDoCenario>) => void; tirar: (id: string) => void; incluir: (novas: LinhaDoCenario[]) => void;
  mudar: (m: Partial<CenarioDaSimulacao>) => void;
}) {
  // o quadro do LineChat (nos custos mensais, com o produto LineChat no cenário): as linhas dele saem da lista
  const quadro = grupo === 'mensal' ? quadroDoLineChat(c, k, ajustes) : null;
  const doQuadro = new Set(quadro?.linhas ?? []);
  const linhas = c.linhas.filter((l) => GRUPO_DO_TIPO[l.tipo] === grupo && !doQuadro.has(l.id));
  const total = grupo === 'fixo' ? k.totalInvestido : k.custoMensalFixo + k.comissaoMensal;
  // os aparelhos comprados parcelado: o custo deles sai nas parcelas (o mês a mês mostra)
  const parcelado = grupo === 'fixo' ? k.linhas.filter((l) => l.parcelas > 1).reduce((s, l) => s + l.custo, 0) : 0;
  const v = VISUAL_DO_GRUPO[grupo];
  return (
    <div className={`rounded-xl border border-line border-l-4 ${v.borda} overflow-hidden`} data-grupo={grupo} id={`simulador-grupo-${grupo}`}>
      <div className={`${v.faixa} px-3 py-2.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1`}>
        <h3 className="min-w-0 flex items-start gap-2">
          <v.Icone size={17} className={`${v.cor} shrink-0 mt-0.5`} aria-hidden />
          <span className="min-w-0">
            <span className="block text-[14.5px] font-semibold text-ink">{NOME_DO_GRUPO[grupo]}</span>
            <span className="block text-[12px] text-ink-2">{AJUDA_DO_GRUPO[grupo]}</span>
          </span>
        </h3>
        <div className="text-right" data-total={grupo}>
          <b className="block tabular-nums text-[15px] text-ink">{reais(total)}{grupo === 'mensal' && <span className="font-normal text-[12px] text-ink-2"> por mês</span>}</b>
          <span className="block text-[11.5px] text-ink-2">
            {grupo === 'fixo' ? (parcelado > 0 ? `${reaisLimpo(parcelado)} na compra parcelada` : 'uma vez') : `mais o imposto (${percentual(c.imposto)})`}
          </span>
        </div>
      </div>
      <div className="px-2.5 pb-2">
        {podeEditar && (
          <div className="flex flex-wrap gap-1.5 pt-2 -ml-1.5">
            {/* com o quadro do LineChat, os custos da Helena ficam nele (não entram de novo pela tabela) */}
            <DaTabela grupo={grupo} custos={ajustes.custos.filter((x) => GRUPO_DO_TIPO[x.tipo] === grupo && !(quadro && ehLinhaDoLineChat({ custoId: x.id })))} incluir={(x) => incluir([linhaDaTabela(x)])} />
            <button type="button" className="btn-ghost btn-sm" onClick={() => incluir([linhaNova(TIPO_NOVO_DO_GRUPO[grupo])])} id={`simulador-digitar-${grupo}`}>
              <Plus size={14} /> Digitar um custo
            </button>
          </div>
        )}
        {quadro && <QuadroLineChat q={quadro} c={c} ajustes={ajustes} mudar={mudar} podeEditar={podeEditar} />}
        {linhas.length ? (
          <>
            <div className={`hidden md:grid ${COLUNAS} gap-2 px-1 pt-1.5 pb-1 text-[11.5px] font-semibold text-muted`}>
              <span>Custo e tipo</span><span className="text-right">Quantidade</span><span className="text-right">Valor de cada</span><span className="text-right">Total</span><span />
            </div>
            <ul className="flex flex-col divide-y divide-line" id={`simulador-linhas-${grupo}`}>
              {linhas.map((l) => (
                <LinhaDeCusto key={l.id} l={l} c={c} grupo={grupo} conta={k.linhas.find((x) => x.id === l.id)!} mudar={(m) => mudarLinha(l.id, m)} tirar={() => tirar(l.id)} podeEditar={podeEditar}
                  produto={l.produto && nomeDoProduto ? nomeDoProduto(l.produto) : null} />
              ))}
            </ul>
          </>
        ) : !quadro && (
          <p className="text-[12.5px] text-muted py-2.5">{grupo === 'fixo' ? 'Nenhum custo de investimento.' : 'Nenhum custo mensal.'}</p>
        )}
      </div>
    </div>
  );
}

/**
 * O quadro do LineChat: as quatro quantidades (usuários, canais oficiais, canais não oficiais e agentes de IA), o custo
 * de cada uma em letra pequena e o total do mês em destaque, como na planilha da Helena. A licença base entra
 * sozinha; os outros custos da Helena (os contatos acima de 5.000, a transcrição) só aparecem quando custam algo.
 */
function QuadroLineChat({ q, c, ajustes, mudar, podeEditar }: {
  q: QuadroDoLineChat; c: CenarioDaSimulacao; ajustes: AjustesDoSimulador; mudar: (m: Partial<CenarioDaSimulacao>) => void; podeEditar: boolean;
}) {
  const inclusos = textoDosInclusos(q);
  const custoDoCampo = (custo: number, incluso: boolean) => (custo ? `${reaisLimpo(custo)} por mês` : incluso ? 'incluso' : '—');
  return (
    <div className="mt-2.5 rounded-lg border border-line bg-surface px-3 py-2.5" id="simulador-linechat" data-quadro="linechat">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex items-start gap-2">
          <MessagesSquare size={16} className="text-turquesa shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-ink">LineChat</div>
            <div className="text-[12px] text-muted" id="simulador-linechat-licenca">
              {q.licenca ? <>inclui a licença base{inclusos ? `: ${inclusos}` : ''} ({reaisLimpo(q.licenca.custo)})</> : 'sem a licença base'}
            </div>
          </div>
        </div>
        <div className="text-right ml-auto" id="simulador-linechat-total">
          <b className="block tabular-nums text-[17px] text-ink">{reais(q.total)}<span className="font-normal text-[12px] text-ink-2"> por mês</span></b>
          <span className="block text-[11.5px] text-muted">o total do LineChat</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2.5">
        {q.campos.map((f) => (
          <label key={f.custoId} className="min-w-0" data-linechat={f.custoId}>
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{f.rotulo}</span>
            <CampoInteiro valor={f.qtd} onChange={(qtd) => mudar({ linhas: mudarQuantidadeDoLineChat(c, ajustes, f.custoId, qtd) })} aria-label={f.rotulo}
              disabled={!podeEditar || f.foraDaTabela} className={f.falta ? 'ring-1 ring-signal rounded-lg' : ''} data-campo="qtd" />
            <span className={`block mt-1 text-[11.5px] tabular-nums ${f.foraDaTabela ? 'text-signal' : 'text-muted'}`} data-campo="custo">
              {f.foraDaTabela ? 'fora da tabela de custos' : custoDoCampo(f.custo, f.incluso)}
            </span>
          </label>
        ))}
        {q.outros.map((o) => (
          <label key={o.linhaId} className="min-w-0 col-span-2" data-linechat-outro={o.linhaId}>
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1 truncate" title={o.nome}>{o.rotulo}</span>
            <CampoInteiro valor={o.qtd} onChange={(qtd) => mudar({ linhas: c.linhas.map((l) => (l.id === o.linhaId ? { ...l, qtd } : l)) })} aria-label={o.nome} disabled={!podeEditar} data-campo="qtd"
              className="max-w-[calc(50%-6px)]" />
            <span className="block mt-1 text-[11.5px] text-muted tabular-nums" data-campo="custo">{custoDoCampo(o.custo, false)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function LinhaDeCusto({ l, c, grupo, conta, mudar, tirar, podeEditar, produto }: {
  l: LinhaDoCenario; c: CenarioDaSimulacao; grupo: GrupoDeCusto; conta: ContasDoCenario['linhas'][number]; mudar: (m: Partial<LinhaDoCenario>) => void; tirar: () => void; podeEditar: boolean;
  /** o produto de onde a linha veio (com dois produtos ou mais) */
  produto: string | null;
}) {
  const pct = ehPercentual(l.tipo);
  const aparelho = l.tipo === 'aparelho';
  const faixas = (l.tipo === 'mensal' || l.tipo === 'unica') && l.faixas?.length ? l.faixas : null;
  const trocarTipo = (tipo: TipoDeCusto) => {
    const mudou: Partial<LinhaDoCenario> = { tipo };
    if (tipo === 'aparelho') Object.assign(mudou, { modalidade: l.modalidade ?? 'comodato', faixas: null });
    else Object.assign(mudou, { modalidade: null, preco: null });
    if (ehPercentual(tipo) !== pct) Object.assign(mudou, { valor: null, qtd: 1, faixas: null });
    if (tipo !== 'mensal' && tipo !== 'unica') mudou.faixas = null;
    mudar(mudou);
  };
  const falta = conta.falta;
  // a compra do aparelho parcelada: até 24 vezes e não mais que o prazo (a conta corta igual)
  const maxDaCompra = Math.max(1, Math.min(MAX_PARCELAS_DA_COMPRA, c.prazo));
  const compra = aparelho && conta.parcelas > 1 ? dividirEmParcelas(Math.round(conta.custo), conta.parcelas) : null;
  return (
    <li className="py-2.5" data-linha={l.id}>
      <div className={`grid grid-cols-2 gap-2 ${COLUNAS} md:items-start`}>
        <div className="col-span-2 md:col-span-1 min-w-0">
          <input className="input" value={l.nome} onChange={(e) => mudar({ nome: e.target.value })} aria-label="O custo" title={l.nome} disabled={!podeEditar} data-campo="nome" />
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <select className="input !w-auto !py-0.5 !pl-2 !text-[12.5px]" value={l.tipo} onChange={(e) => trocarTipo(e.target.value as TipoDeCusto)} aria-label="Como entra" title={AJUDA_DO_TIPO_DE_CUSTO[l.tipo]} disabled={!podeEditar} data-campo="tipo">
              {tiposParaEscolher(grupo, l.tipo).map((x) => <option key={x} value={x}>{NOME_DO_TIPO_DE_CUSTO[x]}</option>)}
            </select>
            {produto && <span className="chip bg-surface-2 text-ink-2 !text-[11px] !py-0" data-campo="produto">{produto}</span>}
            {l.custoId && <span className="text-[11px] text-muted">da tabela</span>}
          </div>
        </div>
        <div className="min-w-0">
          <span className="md:hidden label">Quantidade</span>
          {pct ? <div className="input bg-surface-2 text-muted text-right">—</div> : (
            <CampoInteiro valor={l.qtd} onChange={(qtd) => mudar({ qtd })} aria-label="Quantidade" disabled={!podeEditar} data-campo="qtd" />
          )}
          {!pct && l.unidade && <span className="block mt-1 text-[11.5px] text-muted text-right">{plural(l.qtd, l.unidade)}</span>}
        </div>
        <div className="min-w-0">
          <span className="md:hidden label">Valor de cada</span>
          {faixas ? (
            <div className="input bg-surface-2 text-[12.5px] text-ink-2 flex items-center gap-1.5" title={textoDasFaixasDePreco(faixas)}><Layers size={13} aria-hidden /> por faixas</div>
          ) : pct ? (
            <CampoDePercentual valor={l.valor} onChange={(valor) => mudar({ valor })} aria-label="Percentual" disabled={!podeEditar} placeholder="0" data-campo="valor" className={falta ? 'ring-1 ring-signal rounded-lg' : ''} />
          ) : (
            <CampoDeReais unitario valor={l.valor} onChange={(valor) => mudar({ valor })} aria-label={aparelho ? 'O custo de cada aparelho' : 'O valor de cada um'} disabled={!podeEditar}
              placeholder={l.valor == null ? 'preencher' : '0,00'} data-campo="valor" className={falta && l.valor == null ? 'ring-1 ring-signal rounded-lg' : ''} />
          )}
        </div>
        <div className="min-w-0 md:text-right md:pt-2">
          <span className="md:hidden label">Total</span>
          <div className="tabular-nums font-semibold text-[13.5px]" data-campo="total">{reaisLimpo(conta.custo)}</div>
          <div className="text-[11.5px] text-muted" data-campo="quando">
            {conta.quando === 'por-mes' ? 'por mês' : compra ? <><b className="text-ink-2 font-semibold">{conta.parcelas}x de {reaisLimpo(compra[compra.length - 1]!)}</b></> : 'uma vez'}
          </div>
        </div>
        <div className="flex items-start justify-end md:pt-1.5">
          {podeEditar && <button type="button" className="btn-ghost btn-sm px-1.5 text-muted" onClick={tirar} aria-label={`Tirar ${l.nome}`} title="Tirar este custo"><X size={15} /></button>}
        </div>
      </div>
      {faixas && (
        <p className="text-[12px] text-muted mt-1 md:pr-[30px]">
          <Layers size={12} className="inline -mt-0.5 mr-1" aria-hidden /><span title="As faixas vêm da tabela de custos (os Ajustes do Simulador)">{l.unidade ? `Cada ${l.unidade}: ` : ''}{textoDasFaixasDePreco(faixas)}.</span>
        </p>
      )}
      {aparelho && (
        <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2 md:pl-3 md:border-l-2 md:border-line md:ml-1">
          <div role="radiogroup" aria-label="Como o aparelho vai" className="inline-flex rounded-lg border border-line-strong overflow-hidden" data-campo="modalidade">
            {MODALIDADES_DO_APARELHO.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={l.modalidade === m} disabled={!podeEditar}
                onClick={() => mudar({ modalidade: m, preco: m === 'comodato' ? null : l.preco })}
                className={`px-2.5 py-1 text-[12.5px] font-semibold border-r border-line-strong last:border-r-0 ${l.modalidade === m ? 'bg-accent-soft text-accent-ink' : 'bg-surface text-ink-2 hover:bg-surface-2'}`}>
                {NOME_DA_MODALIDADE[m]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[12.5px]" title="A Ingline pode comprar o aparelho parcelado: o custo se dilui nos meses (a primeira parcela no 1º mês, o da assinatura)">
            <span className="text-ink-2 whitespace-nowrap">A compra em</span>
            <select className="input !w-auto !py-1 !pl-2 !text-[12.5px]" value={Math.min(l.parcelas ?? 1, maxDaCompra)} disabled={!podeEditar} data-campo="parcelas"
              onChange={(e) => { const n = Number(e.target.value); mudar({ parcelas: n > 1 ? n : undefined }); }} aria-label="Em quantas vezes a Ingline compra o aparelho">
              {Array.from({ length: maxDaCompra }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === 1 ? `à vista${conta.custo ? ` (${reaisLimpo(conta.custo)})` : ''}` : conta.custo ? `${n}x de ${reaisLimpo(Math.floor(Math.round(conta.custo) / n))}` : `${n}x`}</option>
              ))}
            </select>
          </label>
          {l.modalidade && l.modalidade !== 'comodato' && (
            <label className="flex items-center gap-2 text-[12.5px]">
              <span className="text-ink-2 whitespace-nowrap">{l.modalidade === 'venda' ? 'Preço de cada' : 'Aluguel de cada, por mês'}</span>
              <CampoDeReais valor={l.preco} onChange={(preco) => mudar({ preco })} className={`w-[128px] ${l.preco == null ? 'ring-1 ring-signal rounded-lg' : ''}`} aria-label={l.modalidade === 'venda' ? 'O preço de venda de cada aparelho' : 'O aluguel de cada aparelho por mês'} disabled={!podeEditar} data-campo="preco" />
            </label>
          )}
          <span className="text-[12px] text-muted">
            {l.modalidade ? AJUDA_DA_MODALIDADE[l.modalidade] : ''}
            {conta.receita > 0 && <> Entra <b className="text-ink-2">{reaisLimpo(conta.receita)}</b> {l.modalidade === 'venda' ? 'na ativação' : 'por mês'}.</>}
            {compra && (
              <> A compra sai em <b className="text-ink-2">{conta.parcelas}x de {reaisLimpo(compra[compra.length - 1]!)}</b>
                {compra[0] !== compra[compra.length - 1] ? ` (a 1ª de ${reaisLimpo(compra[0]!)})` : ''}: a 1ª no 1º mês, o da assinatura, e as outras nos {conta.parcelas - 1} meses seguintes.</>
            )}
          </span>
        </div>
      )}
    </li>
  );
}

/** A tabela dos Ajustes (os custos do grupo): um clique põe o custo, com o valor de hoje (o painel fica aberto para pôr outros). */
function DaTabela({ grupo, custos, incluir }: { grupo: GrupoDeCusto; custos: CustoDaTabela[]; incluir: (c: CustoDaTabela) => void }) {
  const [busca, setBusca] = useState('');
  const [postos, setPostos] = useState<string[]>([]);
  const lista = useMemo(() => {
    const q = paraBusca(busca);
    return q ? custos.filter((c) => paraBusca(c.nome).includes(q)) : custos;
  }, [custos, busca]);
  return (
    <Popover largura="w-[340px]" titulo={`Pôr um ${UM_CUSTO_DO_GRUPO[grupo]} da tabela`}
      botao={() => <span className="inline-flex items-center gap-1.5" id={`simulador-da-tabela-${grupo}`}><ListPlus size={14} /> Da tabela</span>}>
      {!custos.length ? <p className="text-sm text-muted">A tabela não tem {grupo === 'fixo' ? 'custos de investimento' : 'custos mensais'}. Quem cuida dos painéis põe em Simulador › Ajustes.</p> : (
        <div className="flex flex-col gap-2" id={`simulador-tabela-lista-${grupo}`}>
          {custos.length > 6 && (
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
              <input className="input pl-8 py-1.5" placeholder="Procurar" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Procurar na tabela" autoFocus />
            </div>
          )}
          <ul className="flex flex-col -mx-1">
            {lista.map((c) => (
              <li key={c.id}>
                <button type="button" className="w-full text-left px-2 py-1.5 rounded-md hover:bg-surface-2" onClick={() => { incluir(c); setPostos((p) => [...p, c.id]); }} data-custo={c.id}>
                  <span className="text-[13px] font-semibold text-ink">{c.nome}</span>
                  {postos.includes(c.id) && <span className="ml-1.5 text-[11.5px] text-ok font-semibold">entrou</span>}
                  <span className="block text-[12px] text-muted">{NOME_DO_TIPO_DE_CUSTO[c.tipo]} · {valorDoCusto(c)}</span>
                </button>
              </li>
            ))}
            {!lista.length && <li className="text-[13px] text-muted px-2 py-1">Nada com "{busca}".</li>}
          </ul>
        </div>
      )}
    </Popover>
  );
}

/** Um modelo pronto: as linhas dele entram no fim (as que já estão ficam). */
function DoModelo({ ajustes, incluir }: { ajustes: AjustesDoSimulador; incluir: (l: LinhaDoCenario[], produto: string | null) => void }) {
  const [feito, setFeito] = useState<string | null>(null);
  return (
    <Popover largura="w-[300px]" titulo="Pôr as linhas de um modelo"
      botao={() => <span className="inline-flex items-center gap-1.5" id="simulador-do-modelo"><PackagePlus size={14} /> Do modelo</span>}>
      <div className="flex flex-col -mx-1">
        {ajustes.modelos.map((m) => (
          <button key={m.id} type="button" className="text-left px-2 py-1.5 rounded-md hover:bg-surface-2" data-modelo={m.id}
            onClick={() => { incluir(linhasDoModelo(ajustes, m), m.produto); setFeito(m.id); }}>
            <span className="text-[13px] font-semibold">{m.nome}</span>
            {feito === m.id && <span className="ml-1.5 text-[11.5px] text-ok font-semibold">entrou</span>}
            <span className="block text-[12px] text-muted">{m.linhas.length} {m.linhas.length === 1 ? 'custo' : 'custos'}: as linhas entram no fim</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}
