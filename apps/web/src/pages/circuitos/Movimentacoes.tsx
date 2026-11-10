/**
 * As movimentações dos circuitos e dos DIDs (2.4.1, o Luan: "eu quero q dentro de circuitos tenha uma aba, movimentações onde
 * qualquer alteração nos circuitos, dids novos, alterados, circuito novo, etc fique registrada nessa aba").
 *
 * A mesma lista em dois lugares: a aba Movimentações de Circuitos e DIDs (os filtros no endereço, como as outras abas) e a
 * ficha do circuito (com o circuito fixo; os filtros só na tela, para não brigar com os da tabela dos DIDs).
 */
import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import {
  FILTROS_DE_TIPO_DA_MOVIMENTACAO, NOME_DO_FILTRO_DE_TIPO, type FiltroDeTipoDaMovimentacao, type MovimentacaoDoCircuito, type MudancaDeCampo,
  type TipoDeMovimentacaoDoCircuito,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { Carregando, Chip, EscolherComBusca, Paginacao, TODOS, Toggle, Vazio, type TomChip } from '../../components/ui/index.js';
import { data } from '../../lib/format.js';
import { ThN, TdN, contarDe } from '../../lib/contagem.js';

const TOM: Record<TipoDeMovimentacaoDoCircuito, TomChip> = {
  circuito_criado: 'accent', circuito_editado: 'accent', circuito_lixeira: 'bad', circuito_restaurado: 'muted', circuito_cancelado: 'bad', circuito_reativado: 'ok',
  dids_criados: 'ok', did_editado: 'signal', dids_editados: 'signal', dids_lixeira: 'bad', did_restaurado: 'muted',
  importacao: 'roxo',
};
const CHAVES = ['q', 'tipo', 'quem', 'de', 'ate', 'circuito', 'p', 'tudo'] as const;
type Chave = (typeof CHAVES)[number];

/** Os filtros: no endereço (a aba) ou só na tela (a ficha do circuito). */
function useFiltros(naTela: boolean) {
  const [sp, setSp] = useSearchParams();
  const [local, setLocal] = useState<Partial<Record<Chave, string>>>({});
  const get = (k: Chave) => (naTela ? local[k] ?? '' : sp.get(k) ?? '');
  const set = (k: Chave, v: string | null) => {
    if (naTela) { setLocal((x) => ({ ...x, [k]: v ?? undefined, ...(k !== 'p' ? { p: undefined } : {}) })); return; }
    const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'p') n.delete('p'); setSp(n, { replace: true });
  };
  const limpar = () => { if (naTela) setLocal({}); else setSp({ aba: 'movimentacoes', ...(sp.get('terceiros') ? { terceiros: '1' } : {}) }, { replace: true }); };
  const algum = CHAVES.some((k) => k !== 'p' && k !== 'tudo' && !!get(k));
  return { get, set, limpar, algum };
}

export function MovimentacoesDosCircuitos({ circuito }: { circuito?: { id: string; nome: string } }) {
  const f = useFiltros(!!circuito);
  const page = Number(f.get('p') || 1);
  const tudo = f.get('tudo') === '1';
  const tamanho = tudo ? TODOS : circuito ? 20 : 50;
  const numero = contarDe(tudo ? 1 : page, tamanho);
  const circuitId = circuito?.id ?? f.get('circuito');
  // o interruptor dos links de terceiros é o das outras abas (fica no endereço e atravessa as abas)
  const [sp, setSp] = useSearchParams();
  const terceiros = !circuito && sp.get('terceiros') === '1';
  const filtro = { q: f.get('q'), tipo: f.get('tipo'), userId: f.get('quem'), de: f.get('de'), ate: f.get('ate'), circuitId, incluirTerceiros: terceiros ? 'true' : undefined };
  const lista = useQuery({
    queryKey: ['circuit-movements', filtro, page, tudo],
    queryFn: () => api.circuits.movimentacoes({ ...filtro, page: tudo ? 1 : page, pageSize: tamanho }),
  });
  const circuitos = useQuery({ queryKey: ['circuit-options'], queryFn: () => api.circuits.options(), enabled: !circuito });
  const [aberta, setAberta] = useState<string | null>(null);
  const pessoas = lista.data?.pessoas ?? [];

  return (
    <div id={circuito ? 'movimentacoes-do-circuito' : 'movimentacoes-dos-circuitos'}>
      <div className="card p-3 mb-3 flex flex-wrap gap-2 items-center">
        <input className="input max-w-[240px]" placeholder="Número do DID ou texto" value={f.get('q')} onChange={(e) => f.set('q', e.target.value || null)} aria-label="Buscar nas movimentações" />
        <select className="input w-auto" value={f.get('tipo')} onChange={(e) => f.set('tipo', e.target.value || null)} aria-label="Tipo de mudança">
          <option value="">Todas as mudanças</option>
          {FILTROS_DE_TIPO_DA_MOVIMENTACAO.map((t) => <option key={t} value={t}>{NOME_DO_FILTRO_DE_TIPO[t as FiltroDeTipoDaMovimentacao]}</option>)}
        </select>
        {!circuito && (
          <EscolherComBusca className="input w-[220px] max-w-full" valor={f.get('circuito')} onChange={(v) => f.set('circuito', v || null)} vazio="Todos os circuitos"
            opcoes={(circuitos.data ?? []).map((c) => ({ id: c.id, nome: c.name }))} rotulo="Filtrar por circuito" procurar="Procurar circuito…" />
        )}
        <select className="input w-auto" value={f.get('quem')} onChange={(e) => f.set('quem', e.target.value || null)} aria-label="Quem fez">
          <option value="">Qualquer pessoa</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <input type="date" className="input w-auto" value={f.get('de')} onChange={(e) => f.set('de', e.target.value || null)} aria-label="De" />
        <input type="date" className="input w-auto" value={f.get('ate')} onChange={(e) => f.set('ate', e.target.value || null)} aria-label="Até" />
        {f.algum && <button className="btn-ghost btn-sm text-muted" onClick={f.limpar}>limpar filtros</button>}
        {!circuito && <Toggle checked={terceiros} onChange={(v) => { const n = new URLSearchParams(sp); if (v) n.set('terceiros', '1'); else n.delete('terceiros'); n.delete('p'); setSp(n, { replace: true }); }} label="Habilitar links de terceiros" />}
      </div>
      {lista.isLoading ? <Carregando /> : !lista.data?.items.length ? (
        <Vazio titulo="Nenhuma movimentação" texto={f.algum ? 'Nenhuma movimentação com esses filtros.' : circuito ? 'Nada mudou neste circuito ainda.' : undefined} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th className="w-6" aria-label="Abrir" /><ThN /><th>Quando</th><th>Quem</th><th>O que</th>{!circuito && <th>Circuito</th>}<th>O que aconteceu</th></tr></thead>
            <tbody>{lista.data.items.map((m, i) => {
              const abrir = aberta === m.id;
              const temDetalhe = m.campos.length > 0 || m.porDid.length > 0 || m.totalDeNumeros > 0;
              return (
                <Fragment key={m.id}>
                  <tr className={temDetalhe ? 'cursor-pointer' : ''} onClick={() => temDetalhe && setAberta(abrir ? null : m.id)} aria-expanded={temDetalhe ? abrir : undefined} data-movimentacao={m.tipo}>
                    <td className="text-muted">{temDetalhe ? (abrir ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}</td>
                    <TdN n={numero(i)} />
                    <td className="tnum whitespace-nowrap">{data(m.quando, true)}</td>
                    <td className="whitespace-nowrap">{m.quem?.nome ?? <span className="text-muted">o sistema</span>}</td>
                    <td><Chip tone={TOM[m.tipo]} className="whitespace-nowrap">{m.tipoNome}</Chip></td>
                    {!circuito && <td><Circuitos m={m} /></td>}
                    <td className="min-w-[260px]">
                      {m.resumo}
                      {m.totalDeNumeros > 1 && <span className="text-muted"> · {m.totalDeNumeros.toLocaleString('pt-BR')} números</span>}
                    </td>
                  </tr>
                  {abrir && (
                    <tr className="bg-surface-2">
                      <td /><td colSpan={circuito ? 5 : 6} className="py-2"><Detalhe m={m} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {lista.data && <Paginacao page={page} pageSize={tamanho === TODOS ? 50 : tamanho} total={lista.data.total} onChange={(p) => f.set('p', String(p))} tudo={tudo} onTudo={(v) => f.set('tudo', v ? '1' : null)} />}
    </div>
  );
}

function Circuitos({ m }: { m: MovimentacaoDoCircuito }) {
  if (!m.circuitos.length) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {m.circuitos.map((c) => c.existe
        ? <Link key={c.id} className="link whitespace-nowrap" to={`/circuitos/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.nome}</Link>
        : <span key={c.id} className="text-muted whitespace-nowrap" title="O circuito está na lixeira">{c.nome} <span className="text-[11.5px]">(na lixeira)</span></span>)}
    </span>
  );
}

function Mudanca({ c }: { c: MudancaDeCampo }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-muted">{c.campo}:</span>
      {c.antes !== null && <><span className="line-through decoration-muted/60 text-ink-2">{c.antes}</span><ArrowRight size={12} className="text-muted self-center" aria-label="para" /></>}
      <b className="font-semibold">{c.depois ?? '—'}</b>
    </li>
  );
}

/** O que a linha mostra aberta: os campos que mudaram, cada DID com o que mudou nele, ou os números. */
function Detalhe({ m }: { m: MovimentacaoDoCircuito }) {
  return (
    <div className="space-y-2 text-[13px]" data-detalhe-da-movimentacao>
      {m.campos.length > 0 && <ul className="space-y-0.5">{m.campos.map((c) => <Mudanca key={c.campo} c={c} />)}</ul>}
      {m.porDid.length > 0 ? (
        <table className="text-[13px]">
          <tbody>{m.porDid.map((d) => (
            <tr key={d.numero} className="align-top">
              <td className="font-mono tnum whitespace-nowrap pr-4 py-0.5">{d.numero}</td>
              <td className="py-0.5"><ul className="flex flex-wrap gap-x-4">{d.campos.map((c) => <Mudanca key={c.campo} c={c} />)}</ul></td>
            </tr>
          ))}</tbody>
        </table>
      ) : m.numeros.length > 0 && (
        <p className="font-mono tnum leading-6 break-words">{m.numeros.join(' · ')}</p>
      )}
      {m.totalDeNumeros > Math.max(m.numeros.length, m.porDid.length) && m.porDid.length + m.numeros.length > 0 && (
        <p className="text-muted">e mais {(m.totalDeNumeros - Math.max(m.numeros.length, m.porDid.length)).toLocaleString('pt-BR')} números</p>
      )}
    </div>
  );
}
