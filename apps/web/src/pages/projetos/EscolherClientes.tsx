/**
 * Escolher os clientes que entram no projeto.
 *
 * O jeito rápido é pelo **filtro**: "todos os que têm LinePBX" já vem marcado de uma vez,
 * em vez de catar um a um. Quem já está na lista aparece marcado e travado.
 *
 * Patch 1.4 (pedido do Luan): dá para **cruzar** — quem tem VoiceNet **e** Equipamentos — e
 * escolher pelos **módulos** (LinePBX › FOP2…). Os produtos e módulos aparecem todos à vista, na
 * cor de cada um e com quantos clientes têm, como botões que ligam e desligam (antes era uma lista
 * suspensa, um produto por vez, e só com os 6 produtos de fábrica). Cada cliente da lista mostra o
 * que tem. O filtro é feito aqui mesmo, na hora: a lista vem inteira com os produtos de cada um.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api } from '../../api/index.js';
import type { Option, Product } from '../../api/types.js';
import { Carregando, Chip, Modal, Spinner } from '../../components/ui/index.js';

type Modo = 'todos' | 'algum';

export function EscolherClientes({ jaNaLista, escolhidos, onClose, onConfirmar, salvando }: {
  /** ids de clientes que já estão no projeto: aparecem marcados e não saem daqui */
  jaNaLista: string[];
  escolhidos: string[];
  onClose: () => void;
  onConfirmar: (ids: string[]) => void;
  salvando?: boolean;
}) {
  const [produtos, setProdutos] = useState<string[]>([]);
  const [modulos, setModulos] = useState<string[]>([]);
  // cruzar é o pedido: com dois ou mais escolhidos, o padrão é "tem todos"
  const [modo, setModo] = useState<Modo>('todos');
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<string[]>(escolhidos);
  const q = useQuery({ queryKey: ['client-options', 'com-produtos'], queryFn: () => api.clients.options({ withProducts: true }) });
  const prods = useQuery({ queryKey: ['products'], queryFn: api.admin.products });

  const clientes = q.data ?? [];
  /** Os produtos ativos do catálogo (os criados na Administração também), com os módulos ativos. */
  const catalogo = useMemo(() => (prods.data ?? []).filter((p) => p.active).map((p) => ({ ...p, modules: p.modules.filter((m) => m.active) })), [prods.data]);
  const quantos = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of clientes) for (const k of [...(c.products ?? []), ...(c.modules ?? [])]) n.set(k, (n.get(k) ?? 0) + 1);
    return n;
  }, [clientes]);

  const criterios = produtos.length + modulos.length;
  const passa = (c: Option) => {
    if (!criterios) return true;
    const tem = [...produtos.map((p) => !!c.products?.includes(p)), ...modulos.map((m) => !!c.modules?.includes(m))];
    return modo === 'todos' ? tem.every(Boolean) : tem.some(Boolean);
  };
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return clientes.filter((c) => passa(c) && (!t || c.name.toLowerCase().includes(t)));
  }, [clientes, busca, produtos, modulos, modo]); // eslint-disable-line react-hooks/exhaustive-deps
  const disponiveis = lista.filter((c) => !jaNaLista.includes(c.id));
  const todosMarcados = disponiveis.length > 0 && disponiveis.every((c) => marcados.includes(c.id));

  const alternar = (id: string) => setMarcados(marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id]);
  const alternarTodos = () => setMarcados(todosMarcados
    ? marcados.filter((id) => !disponiveis.some((c) => c.id === id))
    : [...new Set([...marcados, ...disponiveis.map((c) => c.id)])]);
  const ligar = (lista: string[], set: (v: string[]) => void, k: string) => set(lista.includes(k) ? lista.filter((x) => x !== k) : [...lista, k]);
  const limparFiltro = () => { setProdutos([]); setModulos([]); };

  const nomeDe = (k: string) => {
    const [pc = '', mc] = k.split(':');
    const p = catalogo.find((x) => x.code === pc);
    const m = mc ? p?.modules.find((x) => x.code === mc) : undefined;
    return mc ? `${p?.name ?? pc} › ${m?.name ?? mc}` : p?.name ?? pc;
  };
  /** O filtro em palavras: "quem tem VoiceNet e Equipamentos". */
  const frase = [...produtos, ...modulos].map(nomeDe);
  const juntar = (v: string[], e: string) => (v.length < 2 ? v.join('') : `${v.slice(0, -1).join(', ')} ${e} ${v[v.length - 1]}`);

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
        {q.isLoading || prods.isLoading ? <Carregando /> : (
          <>
            {/* ---------- o filtro: tudo à vista, na cor de cada produto ---------- */}
            <div className="rounded-lg border border-line bg-surface-2 p-3 flex flex-col gap-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-[74px_minmax(0,1fr)] gap-x-3 gap-y-1.5 items-start">
                <div className="eyebrow sm:pt-1.5">Produtos</div>
                <div className="flex flex-wrap gap-1.5">
                  {catalogo.map((p) => (
                    <BotaoFiltro key={p.code} cor={p.color} ligado={produtos.includes(p.code)} n={quantos.get(p.code) ?? 0} onClick={() => ligar(produtos, setProdutos, p.code)} dica={p.description ?? undefined}>{p.name}</BotaoFiltro>
                  ))}
                </div>
                {catalogo.some((p) => p.modules.length > 0) && <>
                  <div className="eyebrow sm:pt-1.5">Módulos</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {catalogo.filter((p) => p.modules.length > 0).map((p) => (
                      <span key={p.code} className="inline-flex flex-wrap items-center gap-1.5">
                        <span className="text-[12px] font-semibold" style={{ color: p.color }}>{p.name} ›</span>
                        {p.modules.map((m) => {
                          const k = `${p.code}:${m.code}`;
                          return <BotaoFiltro key={k} cor={p.color} ligado={modulos.includes(k)} n={quantos.get(k) ?? 0} onClick={() => ligar(modulos, setModulos, k)} dica={m.description ?? undefined}>{m.name}</BotaoFiltro>;
                        })}
                      </span>
                    ))}
                  </div>
                </>}
              </div>
              {criterios > 0 && (
                <div className="flex items-start gap-2 border-t border-line pt-2.5 text-[13px]">
                  <div className="flex flex-1 min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                    {criterios > 1 && (
                      <div className="inline-flex rounded-lg border border-line p-0.5 bg-surface" role="radiogroup" aria-label="Como cruzar">
                        {([['todos', 'tem todos'], ['algum', 'tem qualquer um']] as const).map(([v, rotulo]) => (
                          <button key={v} type="button" role="radio" aria-checked={modo === v} onClick={() => setModo(v)}
                            className={`px-2.5 py-1 text-[12.5px] font-semibold rounded-md whitespace-nowrap ${modo === v ? 'bg-accent text-white' : 'text-ink-2 hover:text-ink'}`}>{rotulo}</button>
                        ))}
                      </div>
                    )}
                    <span className="text-ink-2">
                      quem tem <b className="font-semibold text-ink">{juntar(frase, modo === 'todos' ? 'e' : 'ou')}</b>:{' '}
                      <span className="tnum">{clientes.filter(passa).length} cliente(s)</span>
                    </span>
                  </div>
                  <button type="button" className="btn-ghost btn-sm shrink-0" onClick={limparFiltro}><X size={14} /> Limpar</button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative flex-1 min-w-[180px]">
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input className="input pl-8 w-full" autoComplete="off" placeholder="Procurar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </label>
              <button type="button" className="btn-ghost btn-sm" onClick={alternarTodos} disabled={!disponiveis.length}>
                {todosMarcados ? 'Desmarcar todos' : `Marcar os ${disponiveis.length} da lista`}
              </button>
            </div>

            <ul className="max-h-[44vh] overflow-y-auto border border-line rounded-lg divide-y divide-line">
              {lista.map((c) => {
                const preso = jaNaLista.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className={`flex items-center gap-2 px-3 py-2 text-sm ${preso ? 'text-muted' : 'cursor-pointer hover:bg-surface-2'}`}>
                      <input type="checkbox" checked={preso || marcados.includes(c.id)} disabled={preso} onChange={() => alternar(c.id)} />
                      <span className="min-w-0 truncate">{c.name}</span>
                      <ProdutosEmMiniatura codigos={c.products ?? []} catalogo={catalogo} />
                      <span className="ml-auto flex gap-1 shrink-0">
                        {preso && <Chip tone="muted">já está no projeto</Chip>}
                        {c.isInternal && <Chip tone="neutral">interno</Chip>}
                      </span>
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

/** Um produto ou módulo do filtro: liga e desliga, na cor do produto, com quantos clientes têm. */
function BotaoFiltro({ cor, ligado, n, onClick, dica, children }: { cor: string; ligado: boolean; n: number; onClick: () => void; dica?: string; children: ReactNode }) {
  return (
    <button
      type="button" aria-pressed={ligado} onClick={onClick} disabled={!n && !ligado}
      title={n ? `${dica ? dica + ' · ' : ''}${n} cliente(s)` : 'Nenhum cliente tem'}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${ligado ? '' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'}`}
      style={ligado ? { background: cor + '22', borderColor: cor, color: cor } : undefined}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cor }} aria-hidden />
      {children}
      <span className={`tnum font-normal ${ligado ? '' : 'text-muted'}`}>{n}</span>
    </button>
  );
}

/** O que o cliente tem, só os nomes, na cor de cada produto (como nos cartões da lista de clientes). */
function ProdutosEmMiniatura({ codigos, catalogo }: { codigos: string[]; catalogo: Product[] }) {
  const ps = codigos.map((k) => catalogo.find((p) => p.code === k)).filter((p): p is Product => !!p);
  if (!ps.length) return null;
  return (
    <span className="hidden sm:flex min-w-0 flex-wrap gap-x-1.5 text-[11px] leading-[1.5]" title={ps.map((p) => p.name).join(' · ')}>
      {ps.map((p, i) => (
        <span key={p.code} style={{ color: p.color }} className="font-medium whitespace-nowrap">
          {p.name}{i < ps.length - 1 && <span className="text-line-strong ml-1.5" aria-hidden>·</span>}
        </span>
      ))}
    </span>
  );
}
