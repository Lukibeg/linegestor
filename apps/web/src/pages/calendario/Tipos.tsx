/**
 * Os tipos do calendário (quem cuida dos chamados): o nome, a cor, se é "da equipe" (a folga e o home
 * office: entram no "Hoje, fora do escritório" e pedem as pessoas), se está ativo e, desde o 2.0.2, os
 * lembretes que o evento novo do tipo já traz (a Visita, 1 dia antes e 1 hora antes). O tipo que já tem evento
 * não sai: desativa (os eventos dele continuam com o nome e a cor) — o servidor confere.
 */
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { textoDosLembretes, TiposDoCalendarioSchema, type TipoDeEvento } from '@gestor/shared';
import { api } from '../../api/index.js';
import { Modal, Spinner, Toggle, useToast } from '../../components/ui/index.js';
import { CoresDaEtiqueta } from '../atendimento/comum.js';
import { ChipDoTipo, EditorDeLembretes, erroDoEvento, useRecarregarCalendario } from './comum.js';

type Linha = TipoDeEvento & { novo: boolean };

export function JanelaDosTipos({ tipos, onFechar }: { tipos: TipoDeEvento[]; onFechar: () => void }) {
  const [lista, setLista] = useState<Linha[]>(() => tipos.map((t) => ({ ...t, lembretes: [...t.lembretes], novo: false })));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const toast = useToast();
  const recarregar = useRecarregarCalendario();

  const mudar = (i: number, m: Partial<Linha>) => { setLista((l) => l.map((t, j) => (j === i ? { ...t, ...m } : t))); setErro(''); };
  const incluir = () => {
    setLista((l) => [...l, { id: `tipo-${Date.now().toString(36)}`, nome: '', cor: 'neutral', daEquipe: false, ativo: true, lembretes: [], novo: true }]);
    // o nome do tipo novo já fica no foco
    window.setTimeout(() => [...document.querySelectorAll<HTMLInputElement>('[data-tipo-nome]')].at(-1)?.focus(), 0);
  };
  const salvar = async () => {
    const tipos = lista.map(({ novo: _novo, ...t }) => ({ ...t, nome: t.nome.trim() }));
    const v = TiposDoCalendarioSchema.safeParse({ tipos });
    if (!v.success) { setErro([...new Set(v.error.issues.map((i) => i.message))].join(' ')); return; }
    setOcupado(true);
    try {
      await api.calendario.salvarTipos(v.data.tipos);
      void recarregar();
      toast.push('ok', 'Tipos do calendário salvos.');
      onFechar();
    } catch (e) {
      setErro(erroDoEvento(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal open onClose={onFechar} titulo="Tipos do calendário" largura="max-w-2xl" rodape={(
      <>
        {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1 min-w-0" role="alert">{erro}</p>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={() => void salvar()} disabled={ocupado} id="tipos-salvar">{ocupado ? <Spinner className="text-white" /> : 'Salvar'}</button>
      </>
    )}>
      <p className="text-[13px] text-muted mb-3">
        A cor do tipo é a do evento no calendário. <b className="text-ink-2">Da equipe</b> é o que fala da equipe e não de um cliente (a folga, o home
        office): entra no "Hoje, fora do escritório". Os <b className="text-ink-2">lembretes</b> são os que o evento novo do tipo já traz (no evento, dá
        para mudar). O tipo que já tem evento não sai da lista — desative.
      </p>
      <ul className="flex flex-col gap-2" id="tipos-lista">
        {lista.map((t, i) => (
          <li key={t.id} className={`card p-3 flex flex-col gap-2 ${t.ativo ? '' : 'bg-surface-2'}`} data-tipo={t.id}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <input className="input py-1.5 flex-1 min-w-[160px]" maxLength={40} value={t.nome} placeholder="O nome do tipo (Treinamento…)" aria-label="Nome do tipo"
                data-tipo-nome onChange={(e) => mudar(i, { nome: e.target.value })} />
              <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 cursor-pointer select-none" title="A folga, o home office: entra no &quot;Hoje, fora do escritório&quot;">
                <input type="checkbox" className="w-4 h-4 accent-[var(--accent)]" checked={t.daEquipe} onChange={(e) => mudar(i, { daEquipe: e.target.checked })} /> Da equipe
              </label>
              <Toggle checked={t.ativo} onChange={(v) => mudar(i, { ativo: v })} label="Ativo" />
              <button type="button" className="btn-ghost btn-sm px-1.5 text-muted hover:text-bad" onClick={() => setLista((l) => l.filter((_, j) => j !== i))}
                aria-label={`Tirar o tipo ${t.nome || 'novo'}`} title={t.novo ? 'Tirar' : 'Tirar (só o tipo que ainda não tem evento; o que tem, desative)'}>
                <Trash2 size={14} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CoresDaEtiqueta valor={t.cor} onChange={(c) => mudar(i, { cor: c })} rotulo={`Cor do tipo ${t.nome}`} />
              {t.nome.trim() && <ChipDoTipo tipo={t} className="ml-auto" />}
            </div>
            <details className="text-[13px]" data-tipo-lembretes>
              <summary className="cursor-pointer text-ink-2 select-none">
                Lembretes: <span className="text-muted">{textoDosLembretes(t.lembretes)}</span>
              </summary>
              <div className="mt-2">
                <EditorDeLembretes valor={t.lembretes} onChange={(v) => mudar(i, { lembretes: v })} id={`tipo-${t.id}-lembretes`} rotulo={`Os lembretes do tipo ${t.nome}`} />
              </div>
            </details>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-secondary btn-sm mt-3" onClick={incluir} id="tipos-incluir"><Plus size={14} /> Incluir um tipo</button>
    </Modal>
  );
}
