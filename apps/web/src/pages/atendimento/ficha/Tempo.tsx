/**
 * O tempo gasto no chamado: o total, quem registrou quanto e quando (com a nota), apagar o seu, e
 * "Registrar tempo" (os minutos e uma nota curta).
 */
import { useState } from 'react';
import { Timer, Trash2 } from 'lucide-react';
import { duracaoDoPrazo, type TempoGasto } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Confirmar, Spinner } from '../../../components/ui/index.js';
import { ErroPerto, MarcaFalta, Secao, useAberta, useAcao } from './base.js';
import { dataCompleta } from './Cabecalho.js';

/** "2026-10-08" → "08/10" (o dia do trabalho). */
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function Tempo() {
  const { f, pode } = useAberta();
  if (!f.tempo.itens.length && !pode) return null;
  const itens = [...f.tempo.itens].reverse();
  return (
    <Secao id="campo-tempo" titulo="Tempo gasto" icone={<Timer size={16} />}
      dica={f.tempo.itens.length ? `${duracaoDoPrazo(f.tempo.total)} no total` : undefined}
      acoes={<MarcaFalta campo="tempo" />}>
      {itens.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line mb-2">{itens.map((i) => <ItemDeTempo key={i.id} i={i} />)}</ul>
      ) : <p className="text-[13px] text-muted mb-2">Nada registrado ainda.</p>}
      {pode && <Registrar />}
    </Secao>
  );
}

function ItemDeTempo({ i }: { i: TempoGasto }) {
  const { f, pode } = useAberta();
  const [apagar, setApagar] = useState(false);
  const acao = useAcao();
  return (
    <li className="py-1.5 group">
      <div className="flex items-start gap-2 text-[13px]">
        <span className="tnum font-semibold w-[58px] shrink-0">{duracaoDoPrazo(i.minutos)}</span>
        <span className="min-w-0 flex-1">
          <span className="text-ink-2">{i.por?.nome ?? '—'}</span> <span className="text-muted" title={`Registrado ${dataCompleta(i.em)}`}>· {diaCurto(i.dia)}</span>
          {i.nota && <span className="block text-[12.5px] text-muted break-words">{i.nota}</span>}
        </span>
        {pode && i.podeApagar && (
          <button type="button" className="btn-ghost btn-sm text-muted hover:text-bad -my-1 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" onClick={() => setApagar(true)} aria-label={`Apagar ${duracaoDoPrazo(i.minutos)} de ${i.por?.nome ?? ''}`}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <ErroPerto erro={acao.erro} />
      {apagar && <Confirmar open onClose={() => setApagar(false)} loading={acao.ocupado} perigoso titulo="Apagar o registro de tempo" botao="Apagar"
        onConfirm={async () => { await acao.rodar(() => api.atendimento.apagarTempo(f.id, i.id), 'Registro de tempo apagado'); setApagar(false); }}
        texto={<>Sai do chamado o registro de <b>{duracaoDoPrazo(i.minutos)}</b>{i.por ? ` de ${i.por.nome}` : ''} do dia {diaCurto(i.dia)}.</>} />}
    </li>
  );
}

function Registrar() {
  const { f } = useAberta();
  const acao = useAcao();
  const [minutos, setMinutos] = useState('');
  const [nota, setNota] = useState('');
  const registrar = async () => {
    const m = Number(minutos);
    if (!Number.isInteger(m) || m < 1) { acao.setErro('Quantos minutos? (um número inteiro, pelo menos 1)'); return; }
    if (m > 24 * 60) { acao.setErro('No máximo 24 horas (1440 minutos) por registro.'); return; }
    const r = await acao.rodar(() => api.atendimento.registrarTempo(f.id, { minutos: m, nota: nota.trim() || null }), `${duracaoDoPrazo(m)} registrados`);
    if (r.ok) { setMinutos(''); setNota(''); }
  };
  return (
    <form className="border-t border-line pt-2.5" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void registrar(); }}>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        <span className="label mb-0 mr-1">Registrar tempo</span>
        {[15, 30, 60].map((m) => (
          <button key={m} type="button" className={`chip border ${minutos === String(m) ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`} onClick={() => setMinutos(String(m))}>{duracaoDoPrazo(m)}</button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input className="input py-1.5 text-[13px] w-[86px] shrink-0 tnum" type="number" min={1} max={1440} inputMode="numeric" value={minutos} onChange={(e) => setMinutos(e.target.value)} placeholder="min" aria-label="Minutos" />
        <input className="input py-1.5 text-[13px] min-w-0" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que foi feito (opcional)" aria-label="Nota do tempo" />
        <button type="submit" className="btn-secondary btn-sm shrink-0" disabled={acao.ocupado || !minutos}>{acao.ocupado ? <Spinner /> : 'Registrar'}</button>
      </div>
      <ErroPerto erro={acao.erro} />
    </form>
  );
}
