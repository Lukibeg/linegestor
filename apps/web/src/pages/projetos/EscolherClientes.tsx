/**
 * Escolher os clientes que entram no projeto.
 *
 * O jeito rápido é pelo **filtro**: "todos os que têm LinePBX" já vem marcado de uma vez,
 * em vez de catar um a um. Quem já está na lista aparece marcado e travado.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { PRODUTOS_INICIAIS } from '@gestor/shared';
import { api } from '../../api/index.js';
import { Carregando, Chip, Modal, Spinner } from '../../components/ui/index.js';

export function EscolherClientes({ jaNaLista, escolhidos, onClose, onConfirmar, salvando }: {
  /** ids de clientes que já estão no projeto: aparecem marcados e não saem daqui */
  jaNaLista: string[];
  escolhidos: string[];
  onClose: () => void;
  onConfirmar: (ids: string[]) => void;
  salvando?: boolean;
}) {
  const [produto, setProduto] = useState('');
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<string[]>(escolhidos);
  const q = useQuery({
    queryKey: ['client-options', 'projeto', produto],
    queryFn: () => api.clients.options(produto ? { productCode: produto } : {}),
  });

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (q.data ?? []).filter((c) => !t || c.name.toLowerCase().includes(t));
  }, [q.data, busca]);
  const disponiveis = lista.filter((c) => !jaNaLista.includes(c.id));
  const todosMarcados = disponiveis.length > 0 && disponiveis.every((c) => marcados.includes(c.id));

  const alternar = (id: string) => setMarcados(marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id]);
  const alternarTodos = () => setMarcados(todosMarcados
    ? marcados.filter((id) => !disponiveis.some((c) => c.id === id))
    : [...new Set([...marcados, ...disponiveis.map((c) => c.id)])]);

  return (
    <Modal
      open
      onClose={onClose}
      largura="max-w-2xl"
      titulo="Escolher clientes"
      rodape={<>
        <span className="text-[12.5px] text-muted mr-auto">{marcados.length} escolhido(s)</span>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={!marcados.length || salvando} onClick={() => onConfirmar(marcados)}>
          {salvando ? <Spinner className="text-white" /> : `Usar ${marcados.length} cliente(s)`}
        </button>
      </>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" value={produto} onChange={(e) => setProduto(e.target.value)}>
            <option value="">todos os clientes</option>
            {PRODUTOS_INICIAIS.map((p) => <option key={p.code} value={p.code}>quem tem {p.name}</option>)}
          </select>
          <label className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-8 w-full" placeholder="Procurar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
        </div>

        {q.isLoading ? <Carregando /> : (
          <>
            <button type="button" className="btn-ghost btn-sm self-start" onClick={alternarTodos} disabled={!disponiveis.length}>
              {todosMarcados ? 'Desmarcar todos' : `Marcar os ${disponiveis.length} da lista`}
            </button>
            <ul className="max-h-[50vh] overflow-y-auto border border-line rounded-lg divide-y divide-line">
              {lista.map((c) => {
                const preso = jaNaLista.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className={`flex items-center gap-2 px-3 py-2 text-sm ${preso ? 'text-muted' : 'cursor-pointer hover:bg-surface-2'}`}>
                      <input type="checkbox" checked={preso || marcados.includes(c.id)} disabled={preso} onChange={() => alternar(c.id)} />
                      <span className="flex-1 min-w-0 truncate">{c.name}</span>
                      {preso && <Chip tone="muted">já está no projeto</Chip>}
                      {c.isInternal && <Chip tone="neutral">interno</Chip>}
                    </label>
                  </li>
                );
              })}
              {!lista.length && <li className="px-3 py-6 text-center text-sm text-muted">Nenhum cliente com esse filtro.</li>}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
