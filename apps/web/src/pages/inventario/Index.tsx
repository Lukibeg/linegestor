/** Inventário: abas Aparelhos · Modelos · Movimentações, e o painel "Movimentar aparelhos". */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { api } from '../../api/index.js';
import type { DeviceModel } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can, useAuth } from '../../lib/auth.js';
import { Abas, Campo, Carregando, Chip, Kpi, Modal, Paginacao, Spinner, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { condicaoCor, condicaoNome, CONDICOES_APARELHO, data, macFormatado, macValido, MODALIDADES, paraCentavos, reais } from '../../lib/format.js';
import { Movimentar } from './Movimentar.js';

type Aba = 'aparelhos' | 'modelos' | 'movimentacoes';

export function Inventario() {
  const [sp, setSp] = useSearchParams();
  const aba = (sp.get('aba') ?? 'aparelhos') as Aba;
  const [mover, setMover] = useState(false);
  const models = useQuery({ queryKey: ['models'], queryFn: () => api.inventory.models() });
  const tot = models.data?.reduce((a, m) => ({ inStock: a.inStock + m.counts.inStock, withClients: a.withClients + m.counts.withClients, maint: a.maint + m.counts.maintenance }), { inStock: 0, withClients: 0, maint: 0 });
  return (
    <Pagina titulo="Inventário" sub="Aparelhos identificados pelo MAC; itens a granel contados por quantidade." acoes={<Can permission="devices.move"><button className="btn-primary" onClick={() => setMover(true)}><ArrowLeftRight size={16} /> Movimentar aparelhos</button></Can>}>
      {tot && <div className="grid gap-3 grid-cols-3 mb-5"><Kpi label="Em estoque" valor={tot.inStock} tone="ok" /><Kpi label="Com clientes" valor={tot.withClients} tone="accent" /><Kpi label="Em manutenção" valor={tot.maint} tone={tot.maint ? 'signal' : 'neutral'} /></div>}
      <Abas atual={aba} onChange={(a) => { const n = new URLSearchParams(); n.set('aba', a); setSp(n, { replace: true }); }} abas={[{ id: 'aparelhos', label: 'Aparelhos' }, { id: 'modelos', label: 'Modelos' }, { id: 'movimentacoes', label: 'Movimentações' }]} />
      {aba === 'aparelhos' && <Aparelhos models={models.data ?? []} />}
      {aba === 'modelos' && <Modelos models={models.data ?? []} loading={models.isLoading} />}
      {aba === 'movimentacoes' && <Movimentacoes />}
      <Movimentar open={mover} onClose={() => setMover(false)} />
    </Pagina>
  );
}

function Aparelhos({ models }: { models: DeviceModel[] }) {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const q = sp.get('q') ?? ''; const modelId = sp.get('modelo') ?? ''; const clientId = sp.get('cliente') ?? ''; const condition = sp.get('condicao') ?? ''; const page = Number(sp.get('p') ?? 1);
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'p') n.delete('p'); setSp(n, { replace: true }); };
  const [novo, setNovo] = useState(false);
  const clients = useQuery({ queryKey: ['client-options', 'equip'], queryFn: () => api.clients.options({ productCode: 'equipamentos' }) });
  const lista = useQuery({ queryKey: ['devices', q, modelId, clientId, condition, page], queryFn: () => api.inventory.devices({ q, modelId, clientId, condition, includeRetired: !!condition, page, pageSize: 50 }) });
  const stock = useQuery({ queryKey: ['stock'], queryFn: () => api.inventory.stock() });
  const granel = stock.data?.filter((b) => b.quantity > 0) ?? [];
  return (
    <div>
      <div className="card p-3 mb-3 flex flex-wrap gap-2 items-center">
        <input className="input max-w-[220px] font-mono" placeholder="MAC, etiqueta, IP ou local" value={q} onChange={(e) => set('q', e.target.value)} />
        <select className="input w-auto" value={modelId} onChange={(e) => set('modelo', e.target.value || null)}><option value="">Todos os modelos</option>{models.filter((m) => m.tracking === 'serializado').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <select className="input w-auto" value={clientId} onChange={(e) => set('cliente', e.target.value || null)}><option value="">Estoque e clientes</option><option value="stock">Só estoque</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input w-auto" value={condition} onChange={(e) => set('condicao', e.target.value || null)}><option value="">Ativos e em manutenção</option>{Object.entries(CONDICOES_APARELHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="flex-1" />
        <Can permission="records.write"><button className="btn-secondary btn-sm" onClick={() => setNovo(true)}><Plus size={14} /> Cadastrar aparelho</button></Can>
      </div>
      {lista.isLoading ? <Carregando /> : !lista.data?.items.length ? <Vazio titulo="Nenhum aparelho" texto="Cadastre aparelhos pelo MAC ou ajuste os filtros." /> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>MAC</th><th>Etiqueta</th><th>Modelo</th><th>Onde está</th><th>Como</th><th>Condição</th><th>IP</th><th className="text-right">Valor</th></tr></thead>
          <tbody>{lista.data.items.map((d) => (
            <tr key={d.id} className="cursor-pointer" onClick={() => nav(`/inventario/aparelhos/${d.id}`)}>
              <td className="font-mono">{d.macFormatted}</td><td className="font-mono text-muted">{d.tag ?? '—'}</td><td>{d.modelName}</td>
              <td>{d.clientId ? <Link className="link" to={`/clientes/${d.clientId}`} onClick={(e) => e.stopPropagation()}>{d.clientName}</Link> : <Chip tone="ok">estoque</Chip>}</td>
              <td className="text-muted">{d.currentModality ? (MODALIDADES as any)[d.currentModality] : '—'}</td>
              <td><Chip tone={condicaoCor[d.condition] as any}>{condicaoNome[d.condition] ?? d.condition}</Chip></td>
              <td className="font-mono text-muted">{d.ip ?? '—'}</td><td className="text-right tnum">{reais(d.valueCents)}</td>
            </tr>))}</tbody></table></div>
      )}
      {lista.data && <Paginacao page={page} pageSize={50} total={lista.data.total} onChange={(p) => set('p', String(p))} />}
      {granel.length > 0 && (
        <div className="card mt-4"><div className="px-4 py-3 border-b border-line font-display font-semibold">Itens a granel</div>
          <table className="table"><thead><tr><th>Modelo</th><th>Onde</th><th>Como</th><th className="text-right">Quantidade</th></tr></thead>
            <tbody>{granel.map((b) => <tr key={b.id}><td>{b.modelName}</td><td>{b.clientId ? <Link className="link" to={`/clientes/${b.clientId}`}>{b.clientName}</Link> : <Chip tone="ok">estoque</Chip>}</td><td className="text-muted">{b.modality === 'estoque' ? '—' : (MODALIDADES as any)[b.modality]}</td><td className="text-right tnum font-mono">{b.quantity}</td></tr>)}</tbody></table></div>
      )}
      <AparelhoForm open={novo} onClose={() => setNovo(false)} models={models.filter((m) => m.tracking === 'serializado')} />
    </div>
  );
}

function AparelhoForm({ open, onClose, models }: { open: boolean; onClose: () => void; models: DeviceModel[] }) {
  const [f, setF] = useState({ modelId: '', mac: '', tag: '', valueCents: '', ip: '', location: '', note: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (open) { setErr(''); setF({ modelId: models[0]?.id ?? '', mac: '', tag: '', valueCents: '', ip: '', location: '', note: '' }); } }, [open, models]);
  const save = async () => { setBusy(true); setErr(''); try { await api.inventory.createDevice({ modelId: f.modelId, mac: f.mac, tag: f.tag || null, valueCents: f.valueCents ? paraCentavos(f.valueCents) : null, ip: f.ip || null, location: f.location || null, note: f.note || null }); await qc.invalidateQueries({ queryKey: ['devices'] }); await qc.invalidateQueries({ queryKey: ['models'] }); toast.push('ok', 'Aparelho cadastrado no estoque'); onClose(); } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} titulo="Cadastrar aparelho" rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !f.modelId || !macValido(f.mac)} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Cadastrar'}</button></>}>
      <div className="flex flex-col gap-3">
        <Campo label="Modelo"><select className="input" value={f.modelId} onChange={(e) => setF({ ...f, modelId: e.target.value })}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Campo>
        <Campo label="MAC" erro={f.mac && !macValido(f.mac) ? 'precisa ter 12 caracteres hexadecimais' : undefined} dica="está na etiqueta atrás do aparelho"><input className="input font-mono" placeholder="00:0B:82:A1:B2:C3" value={f.mac} onChange={(e) => setF({ ...f, mac: e.target.value })} onBlur={() => macValido(f.mac) && setF({ ...f, mac: macFormatado(f.mac) })} autoFocus /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Etiqueta interna" dica="opcional"><input className="input font-mono" placeholder="N001" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} /></Campo>
          <Campo label="Valor (R$)"><input className="input tnum" placeholder="0,00" value={f.valueCents} onChange={(e) => setF({ ...f, valueCents: e.target.value })} /></Campo>
          <Campo label="IP"><input className="input font-mono" value={f.ip} onChange={(e) => setF({ ...f, ip: e.target.value })} /></Campo>
          <Campo label="Local físico"><input className="input" placeholder="Prateleira B" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Campo>
        </div>
        <Campo label="Anotação"><textarea className="input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}

function Modelos({ models, loading }: { models: DeviceModel[]; loading: boolean }) {
  const [novo, setNovo] = useState(false); const [ajuste, setAjuste] = useState<DeviceModel | null>(null);
  const cats = useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => api.admin.catalog('categories') });
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ code: '', name: '', categoryId: '', tracking: 'serializado' }); const [delta, setDelta] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => { setBusy(true); setErr(''); try { await api.inventory.createModel({ ...f, categoryId: f.categoryId || null }); await qc.invalidateQueries({ queryKey: ['models'] }); toast.push('ok', 'Modelo cadastrado'); setNovo(false); setF({ code: '', name: '', categoryId: '', tracking: 'serializado' }); } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); } };
  const ajustar = async () => { if (!ajuste) return; setBusy(true); setErr(''); try { await api.inventory.adjustStock({ modelId: ajuste.id, delta: Number(delta) }); await qc.invalidateQueries({ queryKey: ['models'] }); await qc.invalidateQueries({ queryKey: ['stock'] }); toast.push('ok', 'Estoque ajustado'); setAjuste(null); setDelta(''); } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); } };
  if (loading) return <Carregando />;
  return (
    <div>
      <div className="flex justify-end mb-3"><Can permission="records.write"><button className="btn-secondary btn-sm" onClick={() => setNovo(true)}><Plus size={14} /> Cadastrar modelo</button></Can></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((m) => (
          <div key={m.id} className="card p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{m.name}</div><div className="font-mono text-[12px] text-muted">{m.code}</div></div><div className="flex gap-1"><Chip tone="neutral">{m.categoryName ?? 'sem categoria'}</Chip><Chip tone={m.tracking === 'granel' ? 'signal' : 'accent'}>{m.tracking}</Chip></div></div>
            <div className="grid grid-cols-3 gap-2 text-center mt-1">
              <div className="rounded-lg bg-surface-2 p-2"><div className="font-display text-lg font-semibold tnum">{m.counts.inStock}</div><div className="text-[11px] text-muted">estoque</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="font-display text-lg font-semibold tnum">{m.counts.withClients}</div><div className="text-[11px] text-muted">com clientes</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="font-display text-lg font-semibold tnum">{m.counts.maintenance}</div><div className="text-[11px] text-muted">manutenção</div></div>
            </div>
            {(m.counts.sold > 0 || m.counts.retired > 0) && <div className="text-[12px] text-muted">{m.counts.sold} vendido(s) · {m.counts.retired} baixado(s)</div>}
            {m.tracking === 'granel' && <Can permission="records.write"><button className="btn-secondary btn-sm mt-auto" onClick={() => { setAjuste(m); setErr(''); }}>Entrada / baixa no estoque</button></Can>}
          </div>
        ))}
        {!models.length && <Vazio titulo="Nenhum modelo" texto="Cadastre o primeiro modelo de aparelho." />}
      </div>
      <Modal open={novo} onClose={() => setNovo(false)} titulo="Cadastrar modelo" rodape={<><button className="btn-secondary" onClick={() => setNovo(false)}>Cancelar</button><button className="btn-primary" disabled={busy || !f.code || !f.name} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Cadastrar'}</button></>}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3"><Campo label="Código"><input className="input font-mono" placeholder="gxp1610" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} autoFocus /></Campo><Campo label="Nome"><input className="input" placeholder="Grandstream GXP1610" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Campo></div>
          <Campo label="Categoria"><select className="input" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">—</option>{cats.data?.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Campo>
          <Campo label="Como contar" dica={f.tracking === 'serializado' ? 'cada unidade tem MAC e linha própria' : 'só a quantidade importa (headsets, cabos…)'}><select className="input" value={f.tracking} onChange={(e) => setF({ ...f, tracking: e.target.value })}><option value="serializado">Serializado (um a um, por MAC)</option><option value="granel">Granel (por quantidade)</option></select></Campo>
          {err && <div className="text-bad text-sm">{err}</div>}
        </div>
      </Modal>
      <Modal open={!!ajuste} onClose={() => setAjuste(null)} titulo={`Estoque de ${ajuste?.name}`} rodape={<><button className="btn-secondary" onClick={() => setAjuste(null)}>Cancelar</button><button className="btn-primary" disabled={busy || !Number(delta)} onClick={ajustar}>{busy ? <Spinner className="text-white" /> : 'Aplicar'}</button></>}>
        <p className="text-sm text-ink-2 mb-3">Em estoque hoje: <b className="tnum">{ajuste?.counts.inStock}</b>. Informe um número positivo para entrada ou negativo para baixa.</p>
        <Campo label="Quantidade (+ entrada / − baixa)"><input type="number" className="input tnum" value={delta} onChange={(e) => setDelta(e.target.value)} autoFocus /></Campo>
        {err && <div className="text-bad text-sm mt-2">{err}</div>}
      </Modal>
    </div>
  );
}

function Movimentacoes() {
  const [sp, setSp] = useSearchParams();
  const modality = sp.get('modalidade') ?? ''; const clientId = sp.get('cliente') ?? ''; const from = sp.get('de') ?? ''; const to = sp.get('ate') ?? ''; const page = Number(sp.get('p') ?? 1);
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'p') n.delete('p'); setSp(n, { replace: true }); };
  const clients = useQuery({ queryKey: ['client-options', 'equip'], queryFn: () => api.clients.options({ productCode: 'equipamentos' }) });
  const lista = useQuery({ queryKey: ['movements', modality, clientId, from, to, page], queryFn: () => api.inventory.movements({ modality, clientId, from: from || undefined, to: to || undefined, page, pageSize: 50 }) });
  return (
    <div>
      <div className="card p-3 mb-3 flex flex-wrap gap-2">
        <select className="input w-auto" value={modality} onChange={(e) => set('modalidade', e.target.value || null)}><option value="">Todas as modalidades</option>{Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input w-auto" value={clientId} onChange={(e) => set('cliente', e.target.value || null)}><option value="">Todos os clientes</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input type="date" className="input w-auto" value={from} onChange={(e) => set('de', e.target.value || null)} /><input type="date" className="input w-auto" value={to} onChange={(e) => set('ate', e.target.value || null)} />
      </div>
      {lista.isLoading ? <Carregando /> : !lista.data?.items.length ? <Vazio titulo="Nenhuma movimentação" /> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Quando</th><th>Modalidade</th><th>De</th><th>Para</th><th>Itens</th><th>Condição</th><th className="text-right">Valor</th><th>Por</th></tr></thead>
          <tbody>{lista.data.items.map((m) => (
            <tr key={m.id}><td className="tnum whitespace-nowrap">{data(m.createdAt, true)}</td><td><Chip tone={m.modality === 'devolucao' ? 'neutral' : m.modality === 'venda' ? 'accent' : m.modality === 'comodato' ? 'signal' : 'ok'}>{m.modalityName}</Chip></td>
              <td>{m.fromClientId ? <Link className="link" to={`/clientes/${m.fromClientId}`}>{m.fromName}</Link> : 'Estoque'}</td><td>{m.toClientId ? <Link className="link" to={`/clientes/${m.toClientId}`}>{m.toName}</Link> : 'Estoque'}</td>
              <td>{m.items.map((i) => `${i.quantity}× ${i.modelName}`).join(', ')}</td><td className="text-muted">{m.newCondition ? condicaoNome[m.newCondition] : '—'}</td><td className="text-right tnum">{reais(m.valueCents)}</td><td className="text-muted">{m.userName}</td></tr>))}</tbody></table></div>
      )}
      {lista.data && <Paginacao page={page} pageSize={50} total={lista.data.total} onChange={(p) => set('p', String(p))} />}
    </div>
  );
}

export { useAuth };
