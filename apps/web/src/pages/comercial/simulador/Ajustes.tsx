/**
 * Os Ajustes do Simulador do Comercial (Patch 2.0.2, decisão 0052), de quem cuida dos painéis
 * (`tickets.manage`): o imposto que a simulação nova traz (um percentual só, sobre o que o cliente paga — "e
 * eu devo poder alterar quando eu quiser"), as faixas do sinal (verde, amarelo, vermelho), o prazo, a TABELA
 * DE CUSTOS (os de sempre, com o valor de hoje; os aparelhos podem ficar sem valor, para preencher em cada
 * simulação; o preço por faixas, como o da Helena) e os MODELOS por produto (as linhas com que a simulação
 * começa). Salvar não muda as simulações já feitas: as linhas delas guardam o valor de quando entraram.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Trash2, X } from 'lucide-react';
import {
  AJUDA_DO_TIPO_DE_CUSTO, MAX_FAIXAS_DE_PRECO, MODALIDADES_DO_APARELHO, NOME_DA_MODALIDADE, NOME_DO_TIPO_DE_CUSTO, TIPOS_DE_CUSTO, ehPercentual, idLocal,
  textoDasFaixasDePreco,
  type AjustesDoSimulador, type CustoDaTabela, type FaixaDePreco, type ModeloDeSimulacao, type ProdutoDoSimulador, type TipoDeCusto,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Pagina } from '../../../components/layout/AppShell.js';
import { Carregando, Spinner, Vazio, useToast } from '../../../components/ui/index.js';
import { useAuth } from '../../../lib/auth.js';
import { AbasDoSimulador, CHAVE_DO_SIMULADOR, CampoDePercentual, CampoDeReais, CampoInteiro, erroDoSimulador, useOpcoesDoSimulador } from './comum.js';
import { SemOComercial } from './Lista.js';

const copia = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function AjustesDoSimuladorTela() {
  const { can } = useAuth();
  const op = useOpcoesDoSimulador();
  if (!can('sales.read')) return <SemOComercial />;
  return (
    <Pagina titulo="Simulador" sub="Os Ajustes: o imposto, o sinal, a tabela de custos e os modelos por produto.">
      <AbasDoSimulador atual="ajustes" podeCuidar={!!op.data?.podeCuidar || !op.data} />
      {op.isLoading ? <Carregando /> : op.isError ? <p className="text-bad text-sm" role="alert">{erroDoSimulador(op.error)}</p> : !op.data!.podeCuidar ? (
        <Vazio titulo="Os Ajustes do Simulador são de quem cuida dos painéis" texto='Precisa da permissão "Cuidar dos chamados" (a mesma dos Ajustes do Comercial). Fale com a administração.' />
      ) : <Formulario inicial={op.data!.ajustes} produtos={op.data!.produtos} />}
    </Pagina>
  );
}

function Formulario({ inicial, produtos }: { inicial: AjustesDoSimulador; produtos: ProdutoDoSimulador[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [a, setA] = useState<AjustesDoSimulador>(() => copia(inicial));
  const [salvo, setSalvo] = useState(() => JSON.stringify(inicial));
  const [erro, setErro] = useState('');
  const sujo = JSON.stringify(a) !== salvo;
  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [sujo]);
  const salvar = useMutation({
    mutationFn: () => api.simulador.salvarAjustes(a),
    onSuccess: (novo) => {
      setA(copia(novo)); setSalvo(JSON.stringify(novo)); setErro('');
      void qc.invalidateQueries({ queryKey: [...CHAVE_DO_SIMULADOR] });
      toast.push('ok', 'Ajustes do Simulador salvos. As simulações já feitas não mudam.');
    },
    onError: (e) => setErro(erroDoSimulador(e)),
  });

  const mudarCusto = (id: string, m: Partial<CustoDaTabela>) => setA((x) => ({ ...x, custos: x.custos.map((c) => (c.id === id ? { ...c, ...m } : c)) }));
  const tirarCusto = (c: CustoDaTabela) => {
    const usam = a.modelos.filter((m) => m.linhas.some((l) => l.custoId === c.id)).map((m) => m.nome);
    setA((x) => ({ ...x, custos: x.custos.filter((y) => y.id !== c.id), modelos: x.modelos.map((m) => ({ ...m, linhas: m.linhas.filter((l) => l.custoId !== c.id) })) }));
    if (usam.length) toast.push('info', `${c.nome} saiu também ${usam.length === 1 ? 'do modelo' : 'dos modelos'} ${usam.join(', ')}.`);
  };
  const mudarModelo = (id: string, m: Partial<ModeloDeSimulacao>) => setA((x) => ({ ...x, modelos: x.modelos.map((y) => (y.id === id ? { ...y, ...m } : y)) }));

  return (
    <div className="flex flex-col gap-4 pb-16">
      <section className="card p-4" aria-label="O imposto, o sinal e o prazo" id="ajustes-simulador-gerais">
        <h2 className="font-display font-semibold text-[15px] mb-3">O imposto, o sinal e o prazo</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="min-w-0">
            <span className="label">Imposto</span>
            <CampoDePercentual valor={a.imposto} onChange={(v) => setA((x) => ({ ...x, imposto: v ?? 0 }))} id="ajustes-imposto" />
            <span className="text-[11.5px] text-muted">sobre tudo o que o cliente paga; a simulação nova vem com ele e muda nela</span>
          </label>
          <label className="min-w-0">
            <span className="label">Verde a partir de</span>
            <CampoDePercentual valor={a.verde} onChange={(v) => setA((x) => ({ ...x, verde: v ?? 0 }))} id="ajustes-verde" />
            <span className="text-[11.5px] text-muted">de margem (a sobra sobre a mensalidade)</span>
          </label>
          <label className="min-w-0">
            <span className="label">Vermelho abaixo de</span>
            <CampoDePercentual valor={a.vermelho} onChange={(v) => setA((x) => ({ ...x, vermelho: v ?? 0 }))} id="ajustes-vermelho" />
            <span className="text-[11.5px] text-muted">entre os dois, amarelo</span>
          </label>
          <label className="min-w-0">
            <span className="label">O prazo da simulação nova</span>
            <CampoInteiro valor={a.prazo} vazio={1} sufixo="meses" onChange={(v) => setA((x) => ({ ...x, prazo: Math.max(1, Math.min(120, v)) }))} id="ajustes-prazo" />
          </label>
        </div>
        <BarraDoSinal verde={a.verde} vermelho={a.vermelho} />
      </section>

      <section className="card p-4 min-w-0" aria-label="A tabela de custos" id="ajustes-tabela">
        <header className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="font-display font-semibold text-[15px]">A tabela de custos <span className="font-body font-normal text-[12.5px] text-muted">{a.custos.length}</span></h2>
          <button type="button" className="btn-secondary btn-sm" id="ajustes-novo-custo"
            onClick={() => setA((x) => ({ ...x, custos: [...x.custos, { id: idLocal(), nome: '', tipo: 'mensal', valor: null, porRamal: false, modalidade: null, faixas: null, unidade: null }] }))}>
            <Plus size={14} /> Custo
          </button>
        </header>
        <p className="text-[12.5px] text-muted mb-3">Os custos de sempre, com o valor de hoje: entram na simulação com um clique (e mudam lá). Deixe sem valor o que muda de uma venda para outra (os aparelhos): a simulação pede o valor.</p>
        <ul className="flex flex-col divide-y divide-line" id="ajustes-custos">
          {a.custos.map((c) => <CustoNaTabela key={c.id} c={c} mudar={(m) => mudarCusto(c.id, m)} tirar={() => tirarCusto(c)} />)}
        </ul>
      </section>

      <section className="card p-4 min-w-0" aria-label="Os modelos" id="ajustes-modelos">
        <header className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="font-display font-semibold text-[15px]">Os modelos <span className="font-body font-normal text-[12.5px] text-muted">{a.modelos.length}</span></h2>
          <button type="button" className="btn-secondary btn-sm" id="ajustes-novo-modelo"
            onClick={() => setA((x) => ({ ...x, modelos: [...x.modelos, { id: idLocal(), nome: '', produto: null, linhas: [] }] }))}>
            <Plus size={14} /> Modelo
          </button>
        </header>
        <p className="text-[12.5px] text-muted mb-3">Um modelo por produto (LinePBX, LineChat…): a simulação nova começa com as linhas dele, com a quantidade de cada uma (ou por ramal). O produto do catálogo liga o modelo à negociação: o Simular da negociação usa os modelos dos produtos dela.</p>
        <div className="flex flex-col gap-3">
          {a.modelos.map((m) => (
            <Modelo key={m.id} m={m} custos={a.custos} produtos={produtos} mudar={(x) => mudarModelo(m.id, x)} tirar={() => setA((x) => ({ ...x, modelos: x.modelos.filter((y) => y.id !== m.id) }))} />
          ))}
          {!a.modelos.length && <p className="text-sm text-muted">Nenhum modelo. A simulação nova começa em branco.</p>}
        </div>
      </section>

      {(sujo || erro) && (
        <div className="sticky bottom-3 flex justify-end pointer-events-none z-10">
          <div className="card shadow-lg px-3 py-2 flex flex-wrap items-center gap-3 pointer-events-auto max-w-full" role="status" id="ajustes-barra">
            {erro ? <span className="text-[13px] text-bad min-w-0" role="alert">{erro}</span> : <span className="text-[13px] text-ink-2">Você mudou os Ajustes do Simulador.</span>}
            {sujo && <button type="button" className="btn-ghost btn-sm" onClick={() => { setA(JSON.parse(salvo) as AjustesDoSimulador); setErro(''); }}>Descartar</button>}
            <button type="button" className="btn-primary btn-sm" onClick={() => salvar.mutate()} disabled={salvar.isPending || !sujo} id="ajustes-salvar">{salvar.isPending && <Spinner className="!text-white" />} Salvar os Ajustes</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** As faixas do sinal numa barra: vermelho, amarelo e verde, com os números. */
function BarraDoSinal({ verde, vermelho }: { verde: number; vermelho: number }) {
  const v = Math.min(100, Math.max(0, verde)); const r = Math.min(v, Math.max(0, vermelho));
  return (
    <div className="mt-4" aria-hidden>
      <div className="flex h-2.5 rounded-full overflow-hidden">
        <div className="bg-bad" style={{ width: `${r}%` }} />
        <div className="bg-amarelo" style={{ width: `${v - r}%` }} />
        <div className="bg-ok" style={{ width: `${100 - v}%` }} />
      </div>
      <div className="relative h-4 text-[11px] text-muted mt-0.5">
        <span className="absolute left-0">0%</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${r}%` }}>{r}%</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${v}%` }}>{v}%</span>
        <span className="absolute right-0">100%</span>
      </div>
    </div>
  );
}

const COLUNAS = 'md:grid-cols-[minmax(0,1fr)_150px_150px_110px_30px]';

function CustoNaTabela({ c, mudar, tirar }: { c: CustoDaTabela; mudar: (m: Partial<CustoDaTabela>) => void; tirar: () => void }) {
  const pct = ehPercentual(c.tipo);
  const podeFaixas = c.tipo === 'mensal' || c.tipo === 'unica';
  const trocarTipo = (tipo: TipoDeCusto) => {
    const m: Partial<CustoDaTabela> = { tipo };
    m.modalidade = tipo === 'aparelho' ? c.modalidade ?? 'comodato' : null;
    if (ehPercentual(tipo) !== pct) Object.assign(m, { valor: null, porRamal: false });
    if (tipo !== 'mensal' && tipo !== 'unica') m.faixas = null;
    mudar(m);
  };
  return (
    <li className="py-3" data-custo={c.id}>
      <div className={`grid grid-cols-2 gap-2 ${COLUNAS} md:items-start`}>
        <label className="col-span-2 md:col-span-1 min-w-0">
          <span className="md:hidden label">Custo</span>
          <input className="input" value={c.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="O nome (Telefone IP Yealink T31P)" aria-label="O nome do custo" maxLength={120} data-campo="nome" />
        </label>
        <label className="min-w-0">
          <span className="md:hidden label">Como entra</span>
          <select className="input" value={c.tipo} onChange={(e) => trocarTipo(e.target.value as TipoDeCusto)} aria-label="Como entra" title={AJUDA_DO_TIPO_DE_CUSTO[c.tipo]} data-campo="tipo">
            {TIPOS_DE_CUSTO.map((t) => <option key={t} value={t}>{NOME_DO_TIPO_DE_CUSTO[t]}</option>)}
          </select>
        </label>
        <div className="min-w-0">
          <span className="md:hidden label">Valor de hoje</span>
          {c.faixas ? <div className="input bg-surface-2 text-[12.5px] text-ink-2 flex items-center gap-1.5"><Layers size={13} aria-hidden /> por faixas</div>
            : pct ? <CampoDePercentual valor={c.valor} onChange={(valor) => mudar({ valor })} aria-label="O percentual" placeholder="0" data-campo="valor" />
              : <CampoDeReais unitario valor={c.valor} onChange={(valor) => mudar({ valor })} aria-label="O valor de hoje" placeholder="na simulação" data-campo="valor" />}
        </div>
        <label className="min-w-0">
          <span className="md:hidden label">Unidade</span>
          <input className="input" value={c.unidade ?? ''} onChange={(e) => mudar({ unidade: e.target.value || null })} placeholder={pct ? '—' : 'usuário'} disabled={pct} aria-label="A unidade (usuário, canal)" maxLength={20} data-campo="unidade" />
        </label>
        <div className="col-span-2 md:col-span-1 flex justify-end">
          <button type="button" className="btn-ghost btn-sm px-1.5 text-muted" onClick={tirar} aria-label={`Tirar ${c.nome || 'este custo'} da tabela`} title="Tirar da tabela"><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
        {!pct && (
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={c.porRamal} onChange={(e) => mudar({ porRamal: e.target.checked })} data-campo="por-ramal" /> entra "por ramal"
          </label>
        )}
        {c.tipo === 'aparelho' && (
          <label className="inline-flex items-center gap-1.5">
            <span className="text-ink-2">vai em</span>
            <select className="input py-1 w-auto" value={c.modalidade ?? 'comodato'} onChange={(e) => mudar({ modalidade: e.target.value as CustoDaTabela['modalidade'] })} data-campo="modalidade">
              {MODALIDADES_DO_APARELHO.map((m) => <option key={m} value={m}>{NOME_DA_MODALIDADE[m]}</option>)}
            </select>
          </label>
        )}
        {podeFaixas && (
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={!!c.faixas} data-campo="por-faixas"
              onChange={(e) => mudar(e.target.checked ? { faixas: [{ ate: 1, valor: 0 }, { ate: null, valor: c.valor ?? 0 }], valor: null } : { faixas: null })} />
            o preço muda pela quantidade (por faixas)
          </label>
        )}
      </div>
      {c.faixas && <EditorDeFaixas faixas={c.faixas} unidade={c.unidade} mudar={(faixas) => mudar({ faixas })} />}
    </li>
  );
}

/** As faixas de preço: "até N: R$ x cada" (0 = incluso), e a última, "daí para cima". */
function EditorDeFaixas({ faixas, unidade, mudar }: { faixas: FaixaDePreco[]; unidade: string | null; mudar: (f: FaixaDePreco[]) => void }) {
  const cada = unidade ? `por ${unidade}` : 'cada';
  const mudarFaixa = (i: number, m: Partial<FaixaDePreco>) => mudar(faixas.map((f, j) => (j === i ? { ...f, ...m } : f)));
  const incluir = () => {
    // a faixa nova entra antes da última ("daí para cima"), terminando depois da de antes
    const antes = faixas.length > 1 ? faixas[faixas.length - 2]!.ate ?? 0 : 0;
    const nova: FaixaDePreco = { ate: antes + 10, valor: faixas[faixas.length - 1]!.valor };
    mudar([...faixas.slice(0, -1), nova, faixas[faixas.length - 1]!]);
  };
  const resumo = useMemo(() => textoDasFaixasDePreco(faixas), [faixas]);
  return (
    <div className="mt-2 ml-1 pl-3 border-l-2 border-line flex flex-col gap-1.5" data-faixas>
      {faixas.map((f, i) => {
        const ultima = i === faixas.length - 1;
        const de = i === 0 ? 1 : (faixas[i - 1]!.ate ?? 0) + 1;
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 text-[12.5px]" data-faixa={i}>
            <span className="text-ink-2 w-[78px] shrink-0">{ultima ? (i === 0 ? 'cada um' : 'daí para cima') : i === 0 ? 'até' : `de ${de.toLocaleString('pt-BR')} até`}</span>
            {!ultima && <CampoInteiro valor={f.ate ?? 0} onChange={(ate) => mudarFaixa(i, { ate })} className="w-[100px]" aria-label={`O fim da faixa ${i + 1}`} />}
            <CampoDeReais unitario valor={f.valor} onChange={(valor) => mudarFaixa(i, { valor: valor ?? 0 })} className="w-[120px]" aria-label={`O preço da faixa ${i + 1}`} />
            <span className="text-muted">{f.valor === 0 ? 'incluso' : cada}</span>
            {faixas.length > 1 && !ultima && <button type="button" className="btn-ghost btn-sm px-1 text-muted" onClick={() => mudar(faixas.filter((_, j) => j !== i))} aria-label={`Tirar a faixa ${i + 1}`}><X size={13} /></button>}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        {faixas.length < MAX_FAIXAS_DE_PRECO && <button type="button" className="link text-[12.5px]" onClick={incluir}>+ faixa</button>}
        <span className="text-[12px] text-muted">{resumo}</span>
      </div>
    </div>
  );
}

function Modelo({ m, custos, produtos, mudar, tirar }: { m: ModeloDeSimulacao; custos: CustoDaTabela[]; produtos: ProdutoDoSimulador[]; mudar: (x: Partial<ModeloDeSimulacao>) => void; tirar: () => void }) {
  const fora = custos.filter((c) => !m.linhas.some((l) => l.custoId === c.id));
  const mudarLinha = (custoId: string, x: Partial<ModeloDeSimulacao['linhas'][number]>) => mudar({ linhas: m.linhas.map((l) => (l.custoId === custoId ? { ...l, ...x } : l)) });
  return (
    <div className="rounded-lg border border-line p-3" data-modelo={m.id}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input className="input font-semibold flex-1 basis-[220px]" value={m.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="O produto (LinePBX em nuvem)" aria-label="O nome do modelo" maxLength={80} data-campo="nome" />
        <label className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
          do produto
          <select className="input !w-auto !py-1.5" value={m.produto ?? ''} onChange={(e) => mudar({ produto: e.target.value || null })} aria-label="O produto do catálogo" data-campo="produto">
            <option value="">nenhum</option>
            {produtos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}
            {m.produto && !produtos.some((p) => p.codigo === m.produto) && <option value={m.produto}>{m.produto} (fora do catálogo)</option>}
          </select>
        </label>
        <button type="button" className="btn-ghost btn-sm px-1.5 text-muted shrink-0" onClick={tirar} aria-label={`Tirar o modelo ${m.nome}`} title="Tirar o modelo"><Trash2 size={15} /></button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {m.linhas.map((l) => {
          const c = custos.find((x) => x.id === l.custoId);
          if (!c) return null;
          const pct = ehPercentual(c.tipo);
          return (
            <li key={l.custoId} className="flex flex-wrap items-center gap-2 text-[13px]" data-linha={l.custoId}>
              <span className="min-w-0 flex-1 basis-[200px] truncate" title={c.nome}>{c.nome}</span>
              {pct ? <span className="text-muted text-[12px] w-[200px]">{NOME_DO_TIPO_DE_CUSTO[c.tipo]}</span> : (
                <>
                  {l.porRamal ? <span className="text-muted text-[12px] w-[92px] text-right">os ramais</span>
                    : <CampoInteiro valor={l.qtd} onChange={(qtd) => mudarLinha(l.custoId, { qtd })} className="w-[92px]" aria-label={`A quantidade de ${c.nome}`} />}
                  <label className="inline-flex items-center gap-1 text-[12px] text-muted cursor-pointer w-[100px]">
                    <input type="checkbox" checked={l.porRamal} onChange={(e) => mudarLinha(l.custoId, { porRamal: e.target.checked })} /> por ramal
                  </label>
                </>
              )}
              <button type="button" className="btn-ghost btn-sm px-1 text-muted" onClick={() => mudar({ linhas: m.linhas.filter((x) => x.custoId !== l.custoId) })} aria-label={`Tirar ${c.nome} do modelo`}><X size={13} /></button>
            </li>
          );
        })}
        {!m.linhas.length && <li className="text-[12.5px] text-muted">Nenhum custo ainda.</li>}
      </ul>
      {fora.length > 0 && (
        <select className="input mt-2 py-1.5 text-[13px] max-w-sm" value="" aria-label="Pôr um custo no modelo" data-campo="incluir"
          onChange={(e) => { const c = custos.find((x) => x.id === e.target.value); if (c) mudar({ linhas: [...m.linhas, { custoId: c.id, qtd: 1, porRamal: c.porRamal }] }); }}>
          <option value="">+ Pôr um custo da tabela…</option>
          {fora.map((c) => <option key={c.id} value={c.id}>{c.nome || '(sem nome)'}</option>)}
        </select>
      )}
    </div>
  );
}
