/** Inventário: abas Aparelhos · Modelos · Movimentações, e o painel "Movimentar aparelhos". */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { api } from '../../api/index.js';
import type { Device, DeviceModel } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can, useAuth } from '../../lib/auth.js';
import { Abas, Campo, Carregando, Chip, Kpi, Modal, Paginacao, Spinner, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { condicaoCor, condicaoNome, CONDICOES_APARELHO, data, macFormatado, macValido, MODALIDADES, paraCentavos, reais } from '../../lib/format.js';
import { ordenarLista, Th, useOrdenacao, useOrdenacaoLocal } from '../../lib/ordenacao.js';
import { SeletorColunas, useColunasEscolhidas, type Coluna } from '../../lib/colunas.js';
import { Movimentar } from './Movimentar.js';

type Aba = 'aparelhos' | 'modelos' | 'movimentacoes';

export function Inventario() {
  const [sp, setSp] = useSearchParams();
  const aba = (sp.get('aba') ?? 'aparelhos') as Aba;
  const [mover, setMover] = useState(false);
  const models = useQuery({ queryKey: ['models'], queryFn: () => api.inventory.models() });
  // os cartões do topo seguem os MESMOS filtros da aba Aparelhos
  const filtros = aba === 'aparelhos'
    ? { q: sp.get('q') ?? '', modelId: sp.get('modelo') ?? '', clientId: sp.get('cliente') ?? '', condition: sp.get('condicao') ?? '' }
    : {};
  const resumo = useQuery({ queryKey: ['inventory', 'summary', filtros], queryFn: () => api.inventory.summary(filtros) });
  const r = resumo.data;
  return (
    <Pagina titulo="Inventário" sub="Cada unidade é uma linha. Quem tem MAC é identificado por ele; quem não tem fica como não aplicável." acoes={<Can permission="devices.move"><button className="btn-primary" onClick={() => setMover(true)}><ArrowLeftRight size={16} /> Movimentar aparelhos</button></Can>}>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <Kpi label={r?.filtrado ? 'Em estoque (filtrado)' : 'Em estoque'} valor={r ? r.inStock : '…'} tone="ok" />
        <Kpi label="Com clientes" valor={r ? r.withClients : '…'} tone="accent" />
        <Kpi label="Inativos" valor={r ? r.inactive : '…'} tone={r?.inactive ? 'signal' : 'neutral'} />
        <Kpi label="Valor locado" valor={r ? reais(r.valueWithClientsCents) : '…'} sub="aparelhos em locação ou comodato" />
      </div>
      {r?.filtrado && <p className="text-[12.5px] text-muted -mt-3 mb-4">Os cartões acima estão somando apenas o que o filtro deixou passar. <button className="link" onClick={() => setSp({ aba: 'aparelhos' }, { replace: true })}>limpar filtros</button></p>}
      <Abas atual={aba} onChange={(a) => { const n = new URLSearchParams(); n.set('aba', a); setSp(n, { replace: true }); }} abas={[{ id: 'aparelhos', label: 'Aparelhos' }, { id: 'modelos', label: 'Modelos' }, { id: 'movimentacoes', label: 'Movimentações' }]} />
      {aba === 'aparelhos' && <Aparelhos models={models.data ?? []} />}
      {aba === 'modelos' && <Modelos models={models.data ?? []} loading={models.isLoading} />}
      {aba === 'movimentacoes' && <Movimentacoes />}
      <Movimentar open={mover} onClose={() => setMover(false)} />
    </Pagina>
  );
}

/** As colunas da tabela de aparelhos. A pessoa escolhe quais quer ver (botão "Colunas"). */
function colunasAparelhos(): Coluna<Device>[] {
  return [
    { id: 'mac', label: 'MAC', grupo: 'Aparelho', render: (d) => d.mac ? <span className="font-mono whitespace-nowrap">{d.macFormatted}</span> : <span className="text-muted text-[13px]">não aplicável</span> },
    { id: 'modelName', label: 'Modelo', grupo: 'Aparelho', render: (d) => d.modelName },
    { id: 'condition', label: 'Condição', grupo: 'Aparelho', render: (d) => <Chip tone={condicaoCor[d.condition] as any}>{condicaoNome[d.condition] ?? d.condition}</Chip> },
    { id: 'valueCents', label: 'Valor', grupo: 'Aparelho', align: 'right', render: (d) => <span className="tnum">{reais(d.valueCents)}</span> },
    { id: 'clientName', label: 'Atribuído a', grupo: 'Onde está', render: (d) => (d.clientId ? <Link className="link" to={`/clientes/${d.clientId}`} onClick={(e) => e.stopPropagation()}>{d.clientName}</Link> : <Chip tone="ok">estoque</Chip>) },
    { id: 'unit', label: 'Unidade', grupo: 'Onde está', render: (d) => d.unit ?? <span className="text-muted">—</span> },
    { id: 'currentModality', label: 'Modalidade', grupo: 'Onde está', render: (d) => <span className="text-muted">{d.currentModality ? (MODALIDADES as any)[d.currentModality] : '—'}</span> },
    { id: 'location', label: 'Local físico', grupo: 'Onde está', render: (d) => <span className="text-muted">{d.location ?? '—'}</span> },
    { id: 'ip', label: 'IP', grupo: 'Rede e anotações', render: (d) => <span className="font-mono text-muted">{d.ip ?? '—'}</span> },
    { id: 'note', label: 'Anotação', grupo: 'Rede e anotações', render: (d) => <span className="text-muted block max-w-[260px] truncate" title={d.note ?? ''}>{d.note ?? '—'}</span> },
  ];
}
const COLUNAS_APARELHOS_PADRAO = ['mac', 'modelName', 'clientName', 'unit', 'currentModality', 'condition', 'ip', 'valueCents'];

function Aparelhos({ models }: { models: DeviceModel[] }) {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const q = sp.get('q') ?? ''; const modelId = sp.get('modelo') ?? ''; const clientId = sp.get('cliente') ?? ''; const condition = sp.get('condicao') ?? ''; const page = Number(sp.get('p') ?? 1);
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'p') n.delete('p'); setSp(n, { replace: true }); };
  const [novo, setNovo] = useState(false);
  const clients = useQuery({ queryKey: ['client-options', 'equip'], queryFn: () => api.clients.options({ productCode: 'equipamentos' }) });
  const o = useOrdenacao('modelName');
  const escolha = useColunasEscolhidas('gestor.aparelhos.colunas', COLUNAS_APARELHOS_PADRAO);
  const colunas = colunasAparelhos();
  const visiveis = colunas.filter((c) => escolha.ids.includes(c.id));
  const lista = useQuery({ queryKey: ['devices', q, modelId, clientId, condition, page, o.ord, o.dir], queryFn: () => api.inventory.devices({ q, modelId, clientId, condition, page, pageSize: 50, sort: o.ord, dir: o.dir }) });
  return (
    <div>
      <div className="card p-3 mb-3 flex flex-wrap gap-2 items-center">
        <input className="input max-w-[220px] font-mono" placeholder="MAC, unidade, IP ou local" value={q} onChange={(e) => set('q', e.target.value)} />
        <select className="input w-auto" value={modelId} onChange={(e) => set('modelo', e.target.value || null)}><option value="">Todos os modelos</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <select className="input w-auto" value={clientId} onChange={(e) => set('cliente', e.target.value || null)}><option value="">Estoque e clientes</option><option value="stock">Só estoque</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input w-auto" value={condition} onChange={(e) => set('condicao', e.target.value || null)}><option value="">Ativos e inativos</option>{Object.entries(CONDICOES_APARELHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="flex-1" />
        <SeletorColunas colunas={colunas} escolha={escolha} />
        <Can permission="records.write"><button className="btn-secondary btn-sm" onClick={() => setNovo(true)}><Plus size={14} /> Cadastrar aparelho</button></Can>
      </div>
      {lista.isLoading ? <Carregando /> : !lista.data?.items.length ? <Vazio titulo="Nenhum aparelho" texto="Cadastre um aparelho ou ajuste os filtros." /> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr>{visiveis.map((c) => <Th key={c.id} o={o} col={c.id} align={c.align}>{c.label}</Th>)}</tr></thead>
          <tbody>{lista.data.items.map((d) => (
            <tr key={d.id} className="cursor-pointer" onClick={() => nav(`/inventario/aparelhos/${d.id}`)}>
              {visiveis.map((col) => <td key={col.id} className={col.align === 'right' ? 'text-right' : ''}>{col.render(d)}</td>)}
            </tr>))}</tbody></table>
          {!visiveis.length && <div className="p-4 text-sm text-muted">Nenhuma coluna escolhida — use o botão "Colunas".</div>}
        </div>
      )}
      {lista.data && <Paginacao page={page} pageSize={50} total={lista.data.total} onChange={(p) => set('p', String(p))} />}
      <AparelhoForm open={novo} onClose={() => setNovo(false)} models={models} />
    </div>
  );
}

/**
 * Cadastro de um aparelho. O MAC é o normal, mas headset, cabo e afins não têm — daí a
 * caixa "não se aplica": marcando, o campo some e o aparelho entra sem MAC.
 * Cadastrar vários iguais de uma vez é comum (10 headsets), então tem "quantidade".
 */
function AparelhoForm({ open, onClose, models }: { open: boolean; onClose: () => void; models: DeviceModel[] }) {
  const vazio = { modelId: '', mac: '', semMac: false, quantidade: '1', valueCents: '', ip: '', location: '', note: '' };
  const [f, setF] = useState(vazio);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (open) { setErr(''); setF({ ...vazio, modelId: models[0]?.id ?? '' }); } }, [open, models]);
  const quantos = Math.max(1, Math.min(200, Number(f.quantidade) || 1));
  const podeSalvar = !!f.modelId && (f.semMac ? true : macValido(f.mac));
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const base = { modelId: f.modelId, valueCents: f.valueCents ? paraCentavos(f.valueCents) : null, ip: f.ip || null, location: f.location || null, note: f.note || null };
      // sem MAC dá para cadastrar vários de uma vez; com MAC é sempre um, porque cada um é único
      if (f.semMac) for (let i = 0; i < quantos; i++) await api.inventory.createDevice({ ...base, mac: null });
      else await api.inventory.createDevice({ ...base, mac: f.mac });
      await Promise.all(['devices', 'models', 'inventory'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast.push('ok', f.semMac && quantos > 1 ? `${quantos} aparelhos cadastrados no estoque` : 'Aparelho cadastrado no estoque');
      onClose();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} titulo="Cadastrar aparelho" rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !podeSalvar} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Cadastrar'}</button></>}>
      <div className="flex flex-col gap-3">
        <Campo label="Modelo"><select className="input" value={f.modelId} onChange={(e) => setF({ ...f, modelId: e.target.value })}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Campo>
        {!f.semMac && (
          <Campo label="MAC" erro={f.mac && !macValido(f.mac) ? 'precisa ter 12 caracteres hexadecimais' : undefined} dica="está na etiqueta atrás do aparelho">
            <input className="input font-mono" placeholder="00:0B:82:A1:B2:C3" value={f.mac} onChange={(e) => setF({ ...f, mac: e.target.value })} onBlur={() => macValido(f.mac) && setF({ ...f, mac: macFormatado(f.mac) })} autoFocus />
          </Campo>
        )}
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" id="aparelho-sem-mac" className="mt-0.5" checked={f.semMac} onChange={(e) => setF({ ...f, semMac: e.target.checked, mac: '' })} />
          <span>
            <b>Não se aplica MAC</b>
            <span className="text-muted block text-[12.5px]">Para headset, cabo e coisas que não são de rede. O aparelho continua tendo linha, valor e histórico — só não tem MAC.</span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {f.semMac && <Campo label="Quantidade" dica="cadastra este tanto de unidades iguais"><input className="input tnum" type="number" min={1} max={200} value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} /></Campo>}
          <Campo label="Valor (R$)" dica="é este valor que soma no cliente"><input className="input tnum" placeholder="0,00" value={f.valueCents} onChange={(e) => setF({ ...f, valueCents: e.target.value })} /></Campo>
          {!f.semMac && <Campo label="IP"><input className="input font-mono" value={f.ip} onChange={(e) => setF({ ...f, ip: e.target.value })} /></Campo>}
          <Campo label="Local físico"><input className="input" placeholder="Prateleira B" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Campo>
        </div>
        <Campo label="Anotação"><textarea className="input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}

function Modelos({ models, loading }: { models: DeviceModel[]; loading: boolean }) {
  const [novo, setNovo] = useState(false);
  const cats = useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => api.admin.catalog('categories') });
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ name: '', categoryId: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      // o "código" é só o identificador interno: sai do nome do modelo, sem a pessoa precisar digitar
      const code = f.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      await api.inventory.createModel({ code, name: f.name.trim(), categoryId: f.categoryId || null });
      await qc.invalidateQueries({ queryKey: ['models'] });
      toast.push('ok', 'Modelo cadastrado'); setNovo(false); setF({ name: '', categoryId: '' });
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  if (loading) return <Carregando />;
  return (
    <div>
      <div className="flex justify-end mb-3"><Can permission="records.write"><button className="btn-secondary btn-sm" onClick={() => setNovo(true)}><Plus size={14} /> Cadastrar modelo</button></Can></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((m) => (
          <div key={m.id} className="card p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{m.name}</div><div className="font-mono text-[12px] text-muted">{m.code}</div></div><Chip tone="neutral">{m.categoryName ?? 'sem categoria'}</Chip></div>
            <div className="grid grid-cols-3 gap-2 text-center mt-1">
              <div className="rounded-lg bg-surface-2 p-2"><div className="font-display text-lg font-semibold tnum">{m.counts.inStock}</div><div className="text-[11px] text-muted">estoque</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="font-display text-lg font-semibold tnum">{m.counts.withClients}</div><div className="text-[11px] text-muted">com clientes</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="font-display text-lg font-semibold tnum">{m.counts.inactive}</div><div className="text-[11px] text-muted">inativos</div></div>
            </div>
            {m.counts.sold > 0 && <div className="text-[12px] text-muted">{m.counts.sold} vendido(s)</div>}
          </div>
        ))}
        {!models.length && <Vazio titulo="Nenhum modelo" texto="Cadastre o primeiro modelo de aparelho." />}
      </div>
      <Modal open={novo} onClose={() => setNovo(false)} titulo="Cadastrar modelo" rodape={<><button className="btn-secondary" onClick={() => setNovo(false)}>Cancelar</button><button className="btn-primary" disabled={busy || f.name.trim().length < 2} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Cadastrar'}</button></>}>
        <div className="flex flex-col gap-3">
          <Campo label="Modelo"><input className="input" placeholder="Grandstream GXP1610" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Campo>
          <Campo label="Categoria"><select className="input" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">—</option>{cats.data?.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Campo>
          <p className="text-[12.5px] text-muted">Se este modelo não tem MAC (headset, cabo), isso se marca na hora de cadastrar cada aparelho — aqui é só o nome e a categoria.</p>
          {err && <div className="text-bad text-sm">{err}</div>}
        </div>
      </Modal>
    </div>
  );
}

function Movimentacoes() {
  const [sp, setSp] = useSearchParams();
  const modality = sp.get('modalidade') ?? ''; const clientId = sp.get('cliente') ?? ''; const from = sp.get('de') ?? ''; const to = sp.get('ate') ?? ''; const page = Number(sp.get('p') ?? 1);
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'p') n.delete('p'); setSp(n, { replace: true }); };
  const clients = useQuery({ queryKey: ['client-options', 'equip'], queryFn: () => api.clients.options({ productCode: 'equipamentos' }) });
  const o = useOrdenacao('createdAt', 'desc');
  const lista = useQuery({ queryKey: ['movements', modality, clientId, from, to, page, o.ord, o.dir], queryFn: () => api.inventory.movements({ modality, clientId, from: from || undefined, to: to || undefined, page, pageSize: 50, sort: o.ord, dir: o.dir }) });
  return (
    <div>
      <div className="card p-3 mb-3 flex flex-wrap gap-2">
        <select className="input w-auto" value={modality} onChange={(e) => set('modalidade', e.target.value || null)}><option value="">Todas as modalidades</option>{Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input w-auto" value={clientId} onChange={(e) => set('cliente', e.target.value || null)}><option value="">Todos os clientes</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input type="date" className="input w-auto" value={from} onChange={(e) => set('de', e.target.value || null)} /><input type="date" className="input w-auto" value={to} onChange={(e) => set('ate', e.target.value || null)} />
      </div>
      {lista.isLoading ? <Carregando /> : !lista.data?.items.length ? <Vazio titulo="Nenhuma movimentação" /> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><Th o={o} col="createdAt">Quando</Th><Th o={o} col="modality">Modalidade</Th><Th o={o} col="fromName">De</Th><Th o={o} col="toName">Para</Th><th>Itens</th><th>Condição</th><Th o={o} col="userName">Por</Th></tr></thead>
          <tbody>{lista.data.items.map((m) => (
            <tr key={m.id}><td className="tnum whitespace-nowrap">{data(m.createdAt, true)}</td><td><Chip tone={m.modality === 'devolucao' ? 'neutral' : m.modality === 'venda' ? 'accent' : m.modality === 'comodato' ? 'signal' : 'ok'}>{m.modalityName}</Chip></td>
              <td>{m.fromClientId ? <Link className="link" to={`/clientes/${m.fromClientId}`}>{m.fromName}</Link> : 'Estoque'}</td><td>{m.toClientId ? <Link className="link" to={`/clientes/${m.toClientId}`}>{m.toName}</Link> : 'Estoque'}</td>
              <td>{m.items.map((i) => `${i.quantity}× ${i.modelName}`).join(', ')}</td><td className="text-muted">{m.newCondition ? condicaoNome[m.newCondition] : '—'}</td><td className="text-muted">{m.userName}</td></tr>))}</tbody></table></div>
      )}
      {lista.data && <Paginacao page={page} pageSize={50} total={lista.data.total} onChange={(p) => set('p', String(p))} />}
    </div>
  );
}

export { useAuth };
