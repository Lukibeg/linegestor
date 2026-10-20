/**
 * Os custos do cenário (o Simulador do Comercial, 2.0.2): uma linha por custo — o nome, como entra (o
 * aparelho, uma vez, por mês, % da mensalidade, % da ativação), a quantidade (ou "por ramal": acompanha os
 * ramais), o valor de cada um e o total. O aparelho diz se vai em comodato, venda ou locação; o custo por
 * faixas (os usuários do LineChat da Helena) mostra as faixas e calcula sozinho. Entram da tabela dos Ajustes
 * (com um clique), de um modelo ou digitados. As linhas guardam o valor de quando entraram.
 *
 * Em dois grupos (o Luan, 20/10: "separe os custos fixos com custos mensais"): os **custos fixos**, pagos uma
 * vez (o aparelho, o "uma vez", a comissão da venda), e os **custos mensais** (o "por mês", a comissão
 * recorrente), cada um com o total, a tabela e o "digitar" dele.
 */
import { useMemo, useState } from 'react';
import { Layers, ListPlus, PackagePlus, Plus, Search, X } from 'lucide-react';
import {
  AJUDA_DA_MODALIDADE, AJUDA_DO_GRUPO, AJUDA_DO_TIPO_DE_CUSTO, GRUPOS_DE_CUSTO, GRUPO_DO_TIPO, MODALIDADES_DO_APARELHO, NOME_DA_MODALIDADE, NOME_DO_GRUPO,
  NOME_DO_TIPO_DE_CUSTO, TIPOS_DO_GRUPO, TIPO_NOVO_DO_GRUPO, ehPercentual, linhaDaTabela, linhaNova, linhasDoModelo, paraBusca, percentual, precoDaUnidade,
  textoDasFaixasDePreco,
  type AjustesDoSimulador, type CenarioDaSimulacao, type ContasDoCenario, type CustoDaTabela, type GrupoDeCusto, type LinhaDoCenario, type TipoDeCusto,
} from '@gestor/shared';
import { Popover } from '../../../components/ui/index.js';
import { CampoDePercentual, CampoDeReais, CampoInteiro, plural, reais, reaisLimpo } from './comum.js';

const COLUNAS = 'md:grid-cols-[minmax(0,1fr)_112px_124px_96px_28px]';

/** O valor de um custo da tabela, curto: "R$ 9,00 por mês", "10% da ativação", "por faixas", "preencher". */
export function valorDoCusto(c: Pick<CustoDaTabela, 'tipo' | 'valor' | 'faixas' | 'porRamal' | 'unidade'>): string {
  if (c.faixas?.length) return `por faixas (${textoDasFaixasDePreco(c.faixas)})`;
  if (c.valor == null) return 'o valor em cada simulação';
  if (ehPercentual(c.tipo)) return `${percentual(c.valor)} ${c.tipo === 'pct_mensalidade' ? 'da mensalidade' : 'da ativação'}`;
  const cada = c.unidade ? `por ${c.unidade}` : c.porRamal ? 'por ramal' : 'cada';
  return `${precoDaUnidade(c.valor)} ${cada}${c.tipo === 'mensal' ? ' por mês' : c.tipo === 'unica' ? ', uma vez' : ''}`;
}

export function OsCustos({ c, k, ajustes, mudar, podeEditar }: {
  c: CenarioDaSimulacao; k: ContasDoCenario; ajustes: AjustesDoSimulador; mudar: (m: Partial<CenarioDaSimulacao>) => void; podeEditar: boolean;
}) {
  const mudarLinha = (id: string, m: Partial<LinhaDoCenario>) => mudar({ linhas: c.linhas.map((l) => (l.id === id ? { ...l, ...m } : l)) });
  const tirar = (id: string) => mudar({ linhas: c.linhas.filter((l) => l.id !== id) });
  const incluir = (novas: LinhaDoCenario[]) => mudar({ linhas: [...c.linhas, ...novas] });
  // as linhas de um modelo entram no fim, e o produto dele entra nos produtos do cenário
  const incluirDoModelo = (novas: LinhaDoCenario[], produto: string | null) =>
    mudar({ linhas: [...c.linhas, ...novas], ...(produto && !c.produtos.includes(produto) ? { produtos: [...c.produtos, produto] } : {}) });
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
      {GRUPOS_DE_CUSTO.map((g) => (
        <GrupoDeCustos key={g} grupo={g} c={c} k={k} ajustes={ajustes} podeEditar={podeEditar}
          mudarLinha={mudarLinha} tirar={tirar} incluir={incluir} />
      ))}
    </section>
  );
}

/** Um grupo de custos (os fixos ou os mensais): o nome, a tabela e o "digitar" dele, as linhas e o total. */
function GrupoDeCustos({ grupo, c, k, ajustes, podeEditar, mudarLinha, tirar, incluir }: {
  grupo: GrupoDeCusto; c: CenarioDaSimulacao; k: ContasDoCenario; ajustes: AjustesDoSimulador; podeEditar: boolean;
  mudarLinha: (id: string, m: Partial<LinhaDoCenario>) => void; tirar: (id: string) => void; incluir: (novas: LinhaDoCenario[]) => void;
}) {
  const linhas = c.linhas.filter((l) => GRUPO_DO_TIPO[l.tipo] === grupo);
  const total = grupo === 'fixo'
    ? k.linhas.filter((l) => l.quando === 'uma-vez').reduce((s, l) => s + l.custo, 0)
    : k.custoMensalFixo + k.comissaoMensal;
  return (
    <div className="mt-4" data-grupo={grupo} id={`simulador-grupo-${grupo}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-line">
        <h3 className="text-[14px] font-semibold text-ink min-w-0">
          {NOME_DO_GRUPO[grupo]} <span className="font-normal text-[12.5px] text-muted">· {AJUDA_DO_GRUPO[grupo]}</span>
        </h3>
        {podeEditar && (
          <div className="flex flex-wrap gap-1.5">
            <DaTabela grupo={grupo} custos={ajustes.custos.filter((x) => GRUPO_DO_TIPO[x.tipo] === grupo)} incluir={(x) => incluir([linhaDaTabela(x)])} />
            <button type="button" className="btn-ghost btn-sm" onClick={() => incluir([linhaNova(TIPO_NOVO_DO_GRUPO[grupo])])} id={`simulador-digitar-${grupo}`}>
              <Plus size={14} /> Digitar um custo
            </button>
          </div>
        )}
      </div>
      {linhas.length ? (
        <>
          <div className={`hidden md:grid ${COLUNAS} gap-2 px-1 pt-1.5 pb-1 text-[11.5px] font-semibold text-muted`}>
            <span>Custo e como entra</span><span className="text-right">Quantidade</span><span className="text-right">Valor de cada</span><span className="text-right">Total</span><span />
          </div>
          <ul className="flex flex-col divide-y divide-line" id={`simulador-linhas-${grupo}`}>
            {linhas.map((l) => (
              <LinhaDeCusto key={l.id} l={l} c={c} grupo={grupo} conta={k.linhas.find((x) => x.id === l.id)!} mudar={(m) => mudarLinha(l.id, m)} tirar={() => tirar(l.id)} podeEditar={podeEditar} />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[12.5px] text-muted py-2.5">{grupo === 'fixo' ? 'Nenhum custo fixo.' : 'Nenhum custo mensal.'}</p>
      )}
      <div className="pt-2 border-t border-line flex flex-wrap justify-end items-baseline gap-x-1.5 text-[13px]" data-total={grupo}>
        <span className="text-muted">{grupo === 'fixo' ? 'Os fixos, uma vez:' : 'Os mensais, por mês:'}</span>
        <b className="tabular-nums">{reais(total)}</b>
        {grupo === 'mensal' && <span className="text-muted text-[12px]">mais o imposto ({percentual(c.imposto)})</span>}
      </div>
    </div>
  );
}

function LinhaDeCusto({ l, c, grupo, conta, mudar, tirar, podeEditar }: {
  l: LinhaDoCenario; c: CenarioDaSimulacao; grupo: GrupoDeCusto; conta: ContasDoCenario['linhas'][number]; mudar: (m: Partial<LinhaDoCenario>) => void; tirar: () => void; podeEditar: boolean;
}) {
  const pct = ehPercentual(l.tipo);
  const aparelho = l.tipo === 'aparelho';
  const faixas = (l.tipo === 'mensal' || l.tipo === 'unica') && l.faixas?.length ? l.faixas : null;
  const trocarTipo = (tipo: TipoDeCusto) => {
    const mudou: Partial<LinhaDoCenario> = { tipo };
    if (tipo === 'aparelho') Object.assign(mudou, { modalidade: l.modalidade ?? 'comodato', faixas: null });
    else Object.assign(mudou, { modalidade: null, preco: null });
    if (ehPercentual(tipo) !== pct) Object.assign(mudou, { valor: null, qtd: 1, porRamal: false, faixas: null });
    if (tipo !== 'mensal' && tipo !== 'unica') mudou.faixas = null;
    mudar(mudou);
  };
  const falta = conta.falta;
  return (
    <li className="py-2.5" data-linha={l.id}>
      <div className={`grid grid-cols-2 gap-2 ${COLUNAS} md:items-start`}>
        <div className="col-span-2 md:col-span-1 min-w-0">
          <input className="input" value={l.nome} onChange={(e) => mudar({ nome: e.target.value })} aria-label="O custo" title={l.nome} disabled={!podeEditar} data-campo="nome" />
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <select className="input !w-auto !py-0.5 !pl-2 !text-[12.5px]" value={l.tipo} onChange={(e) => trocarTipo(e.target.value as TipoDeCusto)} aria-label="Como entra" title={AJUDA_DO_TIPO_DE_CUSTO[l.tipo]} disabled={!podeEditar} data-campo="tipo">
              {TIPOS_DO_GRUPO[grupo].map((x) => <option key={x} value={x}>{NOME_DO_TIPO_DE_CUSTO[x]}</option>)}
            </select>
            {l.custoId && <span className="text-[11px] text-muted">da tabela</span>}
          </div>
        </div>
        <div className="min-w-0">
          <span className="md:hidden label">Quantidade</span>
          {pct ? <div className="input bg-surface-2 text-muted text-right">—</div> : l.porRamal ? (
            <div className="input bg-surface-2 text-right tabular-nums" title="Acompanha os ramais do cenário">{plural(c.ramais, l.unidade ?? 'ramal')}</div>
          ) : (
            <CampoInteiro valor={l.qtd} onChange={(qtd) => mudar({ qtd })} aria-label="Quantidade" disabled={!podeEditar} data-campo="qtd" />
          )}
          {!pct && (
            <label className="flex items-center gap-1.5 mt-1 text-[11.5px] text-muted cursor-pointer select-none">
              <input type="checkbox" checked={l.porRamal} onChange={(e) => mudar({ porRamal: e.target.checked, qtd: e.target.checked ? l.qtd : c.ramais || l.qtd })} disabled={!podeEditar} data-campo="por-ramal" />
              por ramal
            </label>
          )}
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
          <div className="text-[11.5px] text-muted">{conta.quando === 'por-mes' ? 'por mês' : 'uma vez'}</div>
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
          {l.modalidade && l.modalidade !== 'comodato' && (
            <label className="flex items-center gap-2 text-[12.5px]">
              <span className="text-ink-2 whitespace-nowrap">{l.modalidade === 'venda' ? 'Preço de cada' : 'Aluguel de cada, por mês'}</span>
              <CampoDeReais valor={l.preco} onChange={(preco) => mudar({ preco })} className={`w-[128px] ${l.preco == null ? 'ring-1 ring-signal rounded-lg' : ''}`} aria-label={l.modalidade === 'venda' ? 'O preço de venda de cada aparelho' : 'O aluguel de cada aparelho por mês'} disabled={!podeEditar} data-campo="preco" />
            </label>
          )}
          <span className="text-[12px] text-muted">
            {l.modalidade ? AJUDA_DA_MODALIDADE[l.modalidade] : ''}
            {conta.receita > 0 && <> Entra <b className="text-ink-2">{reaisLimpo(conta.receita)}</b> {l.modalidade === 'venda' ? 'na ativação' : 'por mês'}.</>}
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
    <Popover largura="w-[340px]" titulo={grupo === 'fixo' ? 'Pôr um custo fixo da tabela' : 'Pôr um custo mensal da tabela'}
      botao={() => <span className="inline-flex items-center gap-1.5" id={`simulador-da-tabela-${grupo}`}><ListPlus size={14} /> Da tabela</span>}>
      {!custos.length ? <p className="text-sm text-muted">A tabela não tem {grupo === 'fixo' ? 'custos fixos' : 'custos mensais'}. Quem cuida dos painéis põe em Simulador › Ajustes.</p> : (
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
