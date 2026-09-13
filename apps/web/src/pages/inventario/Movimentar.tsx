/**
 * Painel "Movimentar aparelhos": modalidade, destino, aparelhos (por MAC ou por quantidade), condição, valor.
 * Só lista como destino os clientes que assinam Equipamentos.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../../api/index.js';
import type { Device } from '../../api/types.js';
import { Campo, Chip, Modal, Spinner, mensagemErro, useToast } from '../../components/ui/index.js';
import { CONDICOES_APARELHO, MODALIDADES, paraCentavos } from '../../lib/format.js';

type Item = { deviceId: string; label: string } | { modelId: string; label: string; quantity: number; fromClientId: string | null };

export function Movimentar({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: { devices?: Device[] } }) {
  const [modality, setModality] = useState<keyof typeof MODALIDADES>('locacao');
  const [toClientId, setTo] = useState('');
  const [fromClientId, setFrom] = useState('');
  const [newCondition, setCond] = useState('');
  const [unit, setUnit] = useState('');
  const [valor, setValor] = useState(''); const [note, setNote] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [busca, setBusca] = useState(''); const [qtd, setQtd] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const qc = useQueryClient(); const toast = useToast();
  const clients = useQuery({ queryKey: ['client-options', 'equip'], queryFn: () => api.clients.options({ productCode: 'equipamentos' }), enabled: open });
  const allClients = useQuery({ queryKey: ['client-options'], queryFn: () => api.clients.options(), enabled: open });
  const models = useQuery({ queryKey: ['models'], queryFn: () => api.inventory.models(), enabled: open });
  const devolucao = modality === 'devolucao';
  const origem = devolucao ? (fromClientId || undefined) : 'stock';
  const devices = useQuery({ queryKey: ['devices-pick', origem, busca], queryFn: () => api.inventory.devices({ q: busca, clientId: origem, page: 1, pageSize: 30 }), enabled: open && (!devolucao || !!fromClientId) });
  const stock = useQuery({ queryKey: ['stock'], queryFn: () => api.inventory.stock(), enabled: open });
  const unidades = useQuery({ queryKey: ['inventory', 'units', toClientId], queryFn: () => api.inventory.units(toClientId || undefined), enabled: open && !devolucao });
  useEffect(() => { if (open) { setErr(''); setItems(preset?.devices?.map((d) => ({ deviceId: d.id, label: `${d.modelName} · ${d.macFormatted}` })) ?? []); setBusca(''); setQtd({}); setValor(''); setNote(''); setCond(''); setUnit(''); setTo(''); setFrom(preset?.devices?.[0]?.clientId ?? ''); if (preset?.devices?.[0]?.clientId) setModality('devolucao'); } }, [open, preset]);
  const granel = useMemo(() => (models.data ?? []).filter((m) => m.tracking === 'granel').map((m) => ({ ...m, disponivel: (stock.data ?? []).filter((b) => b.modelId === m.id && (devolucao ? b.clientId === fromClientId : !b.clientId)).reduce((a, b) => a + b.quantity, 0) })), [models.data, stock.data, devolucao, fromClientId]);
  const total = items.reduce((a, i) => a + ('quantity' in i ? i.quantity : 1), 0);
  const addDevice = (d: Device) => { if (items.some((i) => 'deviceId' in i && i.deviceId === d.id)) return; setItems([...items, { deviceId: d.id, label: `${d.modelName} · ${d.macFormatted}` }]); };
  const addBulk = (modelId: string, label: string) => { const q = qtd[modelId] ?? 0; if (q <= 0) return; setItems([...items.filter((i) => !('modelId' in i) || i.modelId !== modelId), { modelId, label, quantity: q, fromClientId: devolucao ? fromClientId : null }]); };
  const run = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.inventory.move({ modality, toClientId: devolucao ? null : toClientId, newCondition: newCondition || null, unit: devolucao ? null : unit || null, valueCents: valor ? paraCentavos(valor) : null, note: note || null, items: items.map((i) => ('deviceId' in i ? { deviceId: i.deviceId } : { modelId: i.modelId, quantity: i.quantity, fromClientId: i.fromClientId })) });
      toast.push('ok', `${MODALIDADES[modality]} de ${r.quantity} item(ns) registrada`);
      await Promise.all(['devices', 'models', 'stock', 'movements', 'dashboard', 'client-devices', 'device', 'inventory'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onClose();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  const destinoOk = devolucao || !!toClientId;
  return (
    <Modal open={open} onClose={onClose} lateral largura="max-w-2xl" titulo="Movimentar aparelhos" rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !items.length || !destinoOk} onClick={run}>{busy ? <Spinner className="text-white" /> : `${MODALIDADES[modality]} · ${total} item(ns)`}</button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Modalidade"><select className="input" value={modality} onChange={(e) => { setModality(e.target.value as any); setItems([]); }}>{Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          {devolucao
            ? <Campo label="Devolvido por (cliente)"><select className="input" value={fromClientId} onChange={(e) => { setFrom(e.target.value); setItems([]); }}><option value="">Selecione…</option>{allClients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Campo>
            : <Campo label="Cliente de destino" dica="só clientes que assinam Equipamentos"><select className="input" value={toClientId} onChange={(e) => setTo(e.target.value)}><option value="">Selecione…</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Campo>}
          <Campo label="Nova condição" dica={modality === 'venda' ? 'venda marca como "vendido" automaticamente' : 'vazio = manter'}><select className="input" value={newCondition} onChange={(e) => setCond(e.target.value)}><option value="">manter atual</option>{Object.entries(CONDICOES_APARELHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo label="Valor (R$)" dica="da venda ou do contrato, opcional"><input className="input tnum" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
          {!devolucao && <Campo label="Unidade do cliente" dica="filial/loja onde o aparelho vai ficar, opcional" className="col-span-2"><input className="input" list="unidades-mov" placeholder="Loja Simões Filho" value={unit} onChange={(e) => setUnit(e.target.value)} /><datalist id="unidades-mov">{(unidades.data ?? []).map((u) => <option key={u} value={u} />)}</datalist></Campo>}
        </div>

        <div className="card p-3">
          <div className="eyebrow mb-2">Aparelhos selecionados ({total})</div>
          {items.length === 0 ? <div className="text-muted text-sm">Nenhum ainda. Escolha abaixo.</div> : (
            <ul className="flex flex-wrap gap-1.5">{items.map((i, idx) => <li key={idx}><Chip tone="accent">{'quantity' in i ? `${i.quantity}× ` : ''}{i.label} <button onClick={() => setItems(items.filter((_, j) => j !== idx))} aria-label="remover"><X size={12} /></button></Chip></li>)}</ul>
          )}
        </div>

        <div>
          <div className="eyebrow mb-2">Serializados {devolucao ? 'com o cliente' : 'no estoque'}</div>
          <input className="input font-mono mb-2" placeholder="filtrar por MAC, unidade ou local" value={busca} onChange={(e) => setBusca(e.target.value)} disabled={devolucao && !fromClientId} />
          <div className="max-h-52 overflow-y-auto border border-line rounded-lg">
            {devolucao && !fromClientId ? <div className="p-3 text-muted text-sm">Escolha o cliente que está devolvendo.</div> : !devices.data?.items.length ? <div className="p-3 text-muted text-sm">Nenhum aparelho disponível.</div> : devices.data.items.map((d) => (
              <button key={d.id} type="button" onClick={() => addDevice(d)} disabled={items.some((i) => 'deviceId' in i && i.deviceId === d.id)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-40 flex justify-between"><span><span className="font-mono">{d.macFormatted}</span> <span className="text-muted">{d.unit}</span></span><span className="text-muted">{d.modelName}</span></button>
            ))}
          </div>
        </div>

        {granel.length > 0 && (
          <div>
            <div className="eyebrow mb-2">Itens a granel</div>
            <div className="flex flex-col gap-2">{granel.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-sm"><span className="flex-1">{m.name} <span className="text-muted">· {m.disponivel} disponíveis</span></span><input type="number" min={1} max={m.disponivel} className="input w-24 tnum" value={qtd[m.id] ?? ''} onChange={(e) => setQtd({ ...qtd, [m.id]: Number(e.target.value) })} /><button className="btn-secondary btn-sm" disabled={!qtd[m.id] || qtd[m.id]! > m.disponivel} onClick={() => addBulk(m.id, m.name)}>Adicionar</button></div>
            ))}</div>
          </div>
        )}
        <Campo label="Observação"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}
