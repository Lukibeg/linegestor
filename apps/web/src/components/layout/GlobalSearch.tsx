/** Busca global (Ctrl+K): um termo, resultados agrupados por tipo, Enter abre o primeiro. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Cable, Hash, Smartphone } from 'lucide-react';
import { api } from '../../api/index.js';
import type { SearchResult } from '../../api/types.js';
import { cnpjFormatado } from '../../lib/format.js';

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(''); setRes(null); setTimeout(() => ref.current?.focus(), 30); } }, [open]);
  useEffect(() => {
    if (!open || q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(async () => { setBusy(true); try { setRes(await api.dashboard.search(q)); } finally { setBusy(false); } }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) return null;
  const go = (path: string) => { onClose(); nav(path); };
  const first = res && ((res.clients[0] && `/clientes/${res.clients[0].id}`) || (res.dids[0] && `/circuitos?aba=numeracao&q=${res.dids[0].number}`) || (res.circuits[0] && `/circuitos/${res.circuits[0].id}`) || (res.devices[0] && `/inventario/aparelhos/${res.devices[0].id}`));
  const total = res ? res.clients.length + res.dids.length + res.circuits.length + res.devices.length : 0;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mx-auto mt-[10vh] w-[calc(100%-32px)] max-w-xl card shadow-2xl overflow-hidden">
        <input ref={ref} className="w-full px-4 py-3 bg-transparent outline-none text-[15px]" placeholder="Cliente, CNPJ, número, circuito ou MAC…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && first) go(first); }} />
        <div className="border-t border-line max-h-[60vh] overflow-y-auto">
          {q.trim().length < 2 ? <div className="p-4 text-muted text-sm">Digite pelo menos 2 caracteres.</div>
            : busy && !res ? <div className="p-4 text-muted text-sm">Buscando…</div>
            : res && total === 0 ? <div className="p-4 text-muted text-sm">Nada encontrado para "{q}".</div>
            : res && (
              <div className="py-1">
                <Grupo titulo="Clientes" icon={Building2} items={res.clients.map((c) => ({ key: c.id, main: c.name, sub: `${c.legalName} · ${cnpjFormatado(c.cnpj)}`, go: () => go(`/clientes/${c.id}`) }))} />
                <Grupo titulo="DIDs" icon={Hash} items={res.dids.map((d) => ({ key: d.id, main: d.numberFormatted, sub: `${d.clientName ?? 'livre'} · ${d.circuitName ?? 'sem circuito'}`, go: () => go(`/circuitos?aba=numeracao&q=${d.number}`) }))} />
                <Grupo titulo="Circuitos" icon={Cable} items={res.circuits.map((c) => ({ key: c.id, main: c.name, sub: `${c.code} · ${c.carrierName ?? ''}`, go: () => go(`/circuitos/${c.id}`) }))} />
                <Grupo titulo="Aparelhos" icon={Smartphone} items={res.devices.map((d) => ({ key: d.id, main: `${d.macFormatted}${d.tag ? ` · ${d.tag}` : ''}`, sub: `${d.modelName} · ${d.clientName ?? 'estoque'}`, go: () => go(`/inventario/aparelhos/${d.id}`) }))} />
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function Grupo({ titulo, icon: Icon, items }: { titulo: string; icon: any; items: Array<{ key: string; main: string; sub: string; go: () => void }> }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="eyebrow px-4 pt-2 pb-1">{titulo}</div>
      {items.map((i) => (
        <button key={i.key} onClick={i.go} className="w-full text-left px-4 py-2 hover:bg-surface-2 flex items-center gap-3">
          <Icon size={15} className="text-muted shrink-0" />
          <span className="min-w-0"><div className="text-sm font-medium truncate">{i.main}</div><div className="text-[12px] text-muted truncate">{i.sub}</div></span>
        </button>
      ))}
    </div>
  );
}
