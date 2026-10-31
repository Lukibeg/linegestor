/**
 * AS CONDIÇÕES COMBINADAS da negociação (Patch 2.4), na coluna do lado, logo abaixo da negociação. O pedido do Luan (31/10):
 * "preciso que haja uma área destinada a negociação, por exemplo esse cliente aqui eu concedi um desconto de 200 reais até
 * março do ano que vem, além disso a ativação só vai ser paga a partir de março tbm e dividida em 6 vezes".
 *
 *  - o que foi combinado, numa lista curta: os descontos na mensalidade (o valor por mês, até quando), a ativação que começa a
 *    ser paga mais tarde e em vezes, e a observação;
 *  - **Como fica a cobrança**: mês a mês, a mensalidade com o desconto e a parcela da ativação, até a mensalidade voltar cheia;
 *  - o **Combinar** (ou **Mudar**) abre a janela, que mostra a cobrança enquanto se escreve.
 *
 * As contas são as do `@gestor/shared` (negociacao.ts): as mesmas no servidor e na prévia. O valor da negociação não muda: a
 * mensalidade e a ativação continuam as que contam no quadro, na meta e no relatório.
 */
import { useMemo, useState } from 'react';
import { CalendarClock, Handshake, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  cobrancaMesAMes, mesDeHoje, mesEscrito, reais, MAX_DESCONTOS_DA_NEGOCIACAO, MAX_VEZES_DA_ATIVACAO_COMBINADA,
  type CondicoesDaNegociacao, type CondicoesDaNegociacaoEntrada, type MesDaCobranca,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Modal, Spinner, mensagemErro } from '../../../components/ui/index.js';
import { useDepoisDeMudar } from '../comum.js';
import { CampoValor } from '../venda.js';
import { Secao, useAberta } from './base.js';

export function CondicoesDaNegociacao() {
  const { f, painel, pode } = useAberta();
  const [editando, setEditando] = useState(false);
  const [verMeses, setVerMeses] = useState(false);
  const c = f.condicoes;
  const meses = useMemo(() => (c ? cobrancaMesAMes({ mensalidade: f.valor, ativacao: f.ativacao, condicoes: c, desde: mesDeHoje() }) : []), [c, f.valor, f.ativacao]);
  if (painel?.tipo !== 'vendas') return null;
  // sem nada combinado e sem poder mexer, o cartão não aparece
  if (!c && !pode) return null;
  const parcela = c?.ativacao && f.ativacao ? Math.floor(f.ativacao / c.ativacao.vezes) : null;
  return (
    <Secao titulo="Condições combinadas" icone={<Handshake size={16} />} id="ficha-condicoes"
      acoes={pode && (
        <button type="button" className="btn-ghost btn-sm -my-1" id="ficha-condicoes-mudar" onClick={() => setEditando(true)}>
          {c ? <><Pencil size={14} /> Mudar</> : <><Plus size={14} /> Combinar</>}
        </button>
      )}>
      {!c ? (
        <p className="text-[13px] text-muted">Nada combinado além do valor. Um desconto por um tempo, a ativação mais tarde ou em vezes: <b className="font-semibold text-ink-2">Combinar</b>.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          <ul className="flex flex-col gap-1.5 text-[13.5px]" id="ficha-condicoes-lista">
            {c.descontos.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="chip bg-ok-soft text-ok shrink-0">desconto</span>
                <span className="min-w-0"><b className="tnum">{reais(d.valor)}</b>/mês {d.de ? <>de <b>{mesEscrito(d.de)}</b> </> : ''}até <b>{mesEscrito(d.ate)}</b></span>
              </li>
            ))}
            {c.ativacao && (
              <li className="flex items-start gap-2">
                <span className="chip bg-accent-soft text-accent-ink shrink-0">ativação</span>
                <span className="min-w-0">
                  a partir de <b>{mesEscrito(c.ativacao.aPartirDe)}</b>, em <b>{c.ativacao.vezes} {c.ativacao.vezes === 1 ? 'vez' : 'vezes'}</b>
                  {parcela !== null && c.ativacao.vezes > 1 && <span className="text-muted tnum"> de {reais(parcela)}</span>}
                  {f.ativacao === null && <span className="text-muted"> (a negociação ainda não tem a ativação)</span>}
                </span>
              </li>
            )}
            {c.observacao && <li className="text-ink-2 whitespace-pre-wrap break-words border-l-2 border-line pl-2.5">{c.observacao}</li>}
          </ul>
          {meses.length > 0 && (c.descontos.length > 0 || c.ativacao) && (
            <div>
              {/* numa janela: a coluna do lado é estreita demais para a tabela */}
              <button type="button" className="btn-ghost btn-sm -ml-2 text-[12.5px]" id="ficha-condicoes-ver-meses" onClick={() => setVerMeses(true)}>
                <CalendarClock size={14} /> Como fica a cobrança <span className="text-muted font-normal">({meses.length} meses)</span>
              </button>
              {verMeses && (
                <Modal open onClose={() => setVerMeses(false)} largura="max-w-xl" titulo={`Como fica a cobrança — ${f.codigo}`}>
                  <p className="text-[13px] text-ink-2 mb-2">Mês a mês, de hoje até a mensalidade voltar cheia: a mensalidade com o desconto e a parcela da ativação.</p>
                  <CobrancaMesAMes meses={meses} />
                </Modal>
              )}
            </div>
          )}
        </div>
      )}
      {editando && <JanelaDasCondicoes onFechar={() => setEditando(false)} />}
    </Secao>
  );
}

/** A cobrança mês a mês: a mensalidade (com o desconto) e a parcela da ativação. O mês com desconto ou parcela fica marcado. */
function CobrancaMesAMes({ meses, id = 'ficha-condicoes-meses' }: { meses: MesDaCobranca[]; id?: string }) {
  return (
    <div className="overflow-x-auto mt-1.5 rounded-lg border border-line">
      <table className="w-full text-[12.5px] tnum" id={id}>
        <thead>
          <tr className="text-ink-2 bg-surface-2">
            <th className="text-left font-semibold px-2.5 py-1.5">Mês</th>
            <th className="!text-right font-semibold px-2.5 py-1.5">Mensalidade</th>
            <th className="!text-right font-semibold px-2.5 py-1.5">Ativação</th>
            <th className="!text-right font-semibold px-2.5 py-1.5">Total</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.mes} className="border-t border-line" data-mes={m.mes}>
              <td className="px-2.5 py-1.5 whitespace-nowrap">{mesEscrito(m.mes)}</td>
              <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                {reais(m.aPagar)}{m.desconto > 0 && <span className="block text-[11px] text-ok">−{reais(m.desconto)}</span>}
              </td>
              <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                {m.parcela ? <>{reais(m.ativacao)}<span className="block text-[11px] text-muted">{m.parcela}ª parcela</span></> : <span className="text-muted">—</span>}
              </td>
              <td className="px-2.5 py-1.5 text-right font-semibold whitespace-nowrap">{reais(m.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DescontoRascunho = { chave: number; valor: number | null; valido: boolean; de: string; ate: string };
let sequencia = 0;

/** A janela do Combinar: os descontos, a ativação mais tarde, a observação — e a cobrança mês a mês enquanto se escreve. */
function JanelaDasCondicoes({ onFechar }: { onFechar: () => void }) {
  const { f } = useAberta();
  const depois = useDepoisDeMudar();
  const c: CondicoesDaNegociacao | null = f.condicoes;
  const hoje = mesDeHoje();
  const [descontos, setDescontos] = useState<DescontoRascunho[]>(() => (c?.descontos ?? []).map((d) => ({ chave: ++sequencia, valor: d.valor, valido: true, de: d.de ?? '', ate: d.ate })));
  const [ativacaoDepois, setAtivacaoDepois] = useState(!!c?.ativacao);
  const [aPartirDe, setAPartirDe] = useState(c?.ativacao?.aPartirDe ?? hoje);
  const [vezes, setVezes] = useState(String(c?.ativacao?.vezes ?? 1));
  const [observacao, setObservacao] = useState(c?.observacao ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const nVezes = Math.floor(Number(vezes));
  const montar = (): CondicoesDaNegociacaoEntrada | string => {
    for (const d of descontos) {
      if (!d.valido || !d.valor) return 'Escreva o valor de cada desconto (como 200,00), ou tire o que ficou vazio.';
      if (!d.ate) return 'Escolha até que mês vai cada desconto.';
      if (d.de && d.de > d.ate) return 'Um desconto termina antes de começar.';
    }
    if (ativacaoDepois) {
      if (!aPartirDe) return 'Escolha o mês da primeira parcela da ativação.';
      if (!Number.isFinite(nVezes) || nVezes < 1 || nVezes > MAX_VEZES_DA_ATIVACAO_COMBINADA) return `A ativação vai em 1 a ${MAX_VEZES_DA_ATIVACAO_COMBINADA} vezes.`;
    }
    return {
      descontos: descontos.map((d) => ({ valor: d.valor!, de: d.de || null, ate: d.ate })),
      ativacao: ativacaoDepois ? { aPartirDe, vezes: nVezes } : null,
      observacao: observacao.trim() || null,
    };
  };
  const pronto = montar();
  // a cobrança enquanto se escreve (o que ainda não está certo fica de fora)
  const previa = useMemo(() => {
    const cond: CondicoesDaNegociacao = {
      descontos: descontos.filter((d) => d.valido && d.valor && d.ate && (!d.de || d.de <= d.ate)).map((d) => ({ valor: d.valor!, de: d.de || null, ate: d.ate })),
      ativacao: ativacaoDepois && aPartirDe && nVezes >= 1 && nVezes <= MAX_VEZES_DA_ATIVACAO_COMBINADA ? { aPartirDe, vezes: nVezes } : null,
      observacao: null,
    };
    return cond.descontos.length || cond.ativacao ? cobrancaMesAMes({ mensalidade: f.valor, ativacao: f.ativacao, condicoes: cond, desde: hoje }) : [];
  }, [descontos, ativacaoDepois, aPartirDe, nVezes, f.valor, f.ativacao, hoje]);

  const gravar = async (condicoes: CondicoesDaNegociacaoEntrada | null) => {
    setSalvando(true); setErro('');
    try {
      await depois(api.atendimento.alterar(f.id, { condicoes }), condicoes ? 'As condições foram salvas' : 'As condições saíram');
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };
  const mudar = (chave: number, o: Partial<DescontoRascunho>) => { setDescontos((xs) => xs.map((x) => (x.chave === chave ? { ...x, ...o } : x))); setErro(''); };

  return (
    <Modal open onClose={onFechar} largura="max-w-2xl" titulo={`Condições combinadas — ${f.codigo}`}
      rodape={<>
        {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1" role="alert" id="condicoes-erro">{erro}</p>}
        {c && <button type="button" className="btn-ghost text-bad mr-auto" id="condicoes-tirar" disabled={salvando} onClick={() => void gravar(null)}><Trash2 size={14} /> Tirar as condições</button>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" id="condicoes-salvar" disabled={salvando}
          onClick={() => (typeof pronto === 'string' ? setErro(pronto) : void gravar(pronto))}>{salvando ? <Spinner className="text-white" /> : 'Salvar'}</button>
      </>}>
      <form autoComplete="off" className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <p className="text-[13px] text-ink-2 -mt-1">
          O que foi combinado com o cliente além do valor. A mensalidade ({f.valor === null ? 'sem valor ainda' : `${reais(f.valor)}/mês`}) e a ativação
          ({f.ativacao === null ? 'sem valor ainda' : reais(f.ativacao)}) continuam as da negociação: aqui fica como elas vão ser cobradas.
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="label">Desconto na mensalidade</legend>
          {descontos.map((d) => (
            <div key={d.chave} className="grid grid-cols-1 gap-2 rounded-lg border border-line p-2.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" data-desconto="">
              <div className="min-w-0">
                <span className="text-[12px] text-muted">Desconto por mês</span>
                <CampoValor centavos={d.valor} sufixo="/mês" rotulo="Desconto por mês" onChange={(v, ok) => mudar(d.chave, { valor: v, valido: ok })} />
              </div>
              <label className="min-w-0">
                <span className="text-[12px] text-muted">De (opcional)</span>
                <input type="month" className="input" value={d.de} onChange={(e) => mudar(d.chave, { de: e.target.value })} aria-label="O desconto começa em" />
              </label>
              <label className="min-w-0">
                <span className="text-[12px] text-muted">Até (o último mês)</span>
                <input type="month" className="input" value={d.ate} onChange={(e) => mudar(d.chave, { ate: e.target.value })} aria-label="O último mês com o desconto" />
              </label>
              <button type="button" className="btn-ghost btn-sm text-muted hover:text-bad justify-self-start" aria-label="Tirar este desconto" title="Tirar este desconto"
                onClick={() => setDescontos((xs) => xs.filter((x) => x.chave !== d.chave))}><Trash2 size={14} /></button>
            </div>
          ))}
          <div>
            <button type="button" className="btn-secondary btn-sm" id="condicoes-incluir-desconto" disabled={descontos.length >= MAX_DESCONTOS_DA_NEGOCIACAO}
              onClick={() => setDescontos((xs) => [...xs, { chave: ++sequencia, valor: null, valido: true, de: '', ate: '' }])}>
              <Plus size={14} /> {descontos.length ? 'Outro desconto' : 'Incluir um desconto'}
            </button>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="label">A ativação</legend>
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" id="condicoes-ativacao-depois" checked={ativacaoDepois} onChange={(e) => setAtivacaoDepois(e.target.checked)} />
            <span>Começa a ser paga depois, ou em vezes</span>
          </label>
          {ativacaoDepois && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pl-6">
              <label className="min-w-0">
                <span className="text-[12px] text-muted">A 1ª parcela em</span>
                <input type="month" className="input" id="condicoes-ativacao-mes" value={aPartirDe} onChange={(e) => setAPartirDe(e.target.value)} />
              </label>
              <label className="min-w-0">
                <span className="text-[12px] text-muted">Em quantas vezes</span>
                <input type="number" min={1} max={MAX_VEZES_DA_ATIVACAO_COMBINADA} className="input tnum" id="condicoes-ativacao-vezes" value={vezes} onChange={(e) => setVezes(e.target.value)} />
              </label>
            </div>
          )}
        </fieldset>

        <label className="min-w-0">
          <span className="label">O que mais foi combinado (opcional)</span>
          <textarea className="input min-h-[64px]" id="condicoes-observacao" maxLength={1000} value={observacao} placeholder="Ex.: o desconto vale enquanto pagar em dia" onChange={(e) => setObservacao(e.target.value)} />
        </label>

        {previa.length > 0 && (
          <div>
            <div className="label mb-0">Como fica a cobrança</div>
            <CobrancaMesAMes meses={previa} id="condicoes-meses" />
          </div>
        )}
      </form>
    </Modal>
  );
}
