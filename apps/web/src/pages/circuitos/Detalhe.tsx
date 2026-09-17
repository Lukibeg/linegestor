/** Detalhe de um circuito: dados, ocupação, DIDs dele e criação de faixa. */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/index.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can, useAuth } from '../../lib/auth.js';
import { Campo, CampoSegredo, Carregando, Chip, Confirmar, Kpi, Modal, Spinner, TODOS, usePaginaLocal, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { didFormatado, reais } from '../../lib/format.js';
import { ordenarLista, Th, useOrdenacaoLocal } from '../../lib/ordenacao.js';
import { CircuitoForm } from './Lista.js';
import { Voltar } from '../../lib/voltar.js';
import { TdN, ThN } from '../../lib/contagem.js';

export function CircuitoDetalhe() {
  const { id = '' } = useParams();
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast(); const { can } = useAuth();
  const q = useQuery({ queryKey: ['circuit', id], queryFn: () => api.circuits.get(id) });
  // todos os números do circuito, sem limite: a tela pagina de 100 em 100 e sempre deixa "ver tudo"
  const dids = useQuery({ queryKey: ['circuit-dids', id], queryFn: () => api.dids.list({ circuitId: id, includeThirdParty: true, page: 1, pageSize: TODOS }) });
  const [editar, setEditar] = useState(false); const [faixa, setFaixa] = useState(false); const [excluir, setExcluir] = useState(false); const [busy, setBusy] = useState(false);
  const o = useOrdenacaoLocal('number');
  const ordenados = ordenarLista(dids.data?.items ?? [], o, { number: (d) => d.number, clientName: (d) => d.clientName, ownerName: (d) => d.ownerName, note: (d) => d.note });
  const pg = usePaginaLocal(ordenados, 100);
  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Vazio titulo="Circuito não encontrado" acao={<Link className="btn-secondary" to="/circuitos">Voltar</Link>} />;
  const c = q.data;
  const doDelete = async () => { setBusy(true); try { await api.circuits.remove(c.id); toast.push('ok', 'Circuito foi para a lixeira'); await qc.invalidateQueries({ queryKey: ['circuits'] }); nav('/circuitos'); } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); } };
  return (
    <Pagina voltar={<Voltar rota="/circuitos" texto="Todos os circuitos" />} titulo={<span className="flex items-center gap-2">{c.name}{c.thirdParty && <Chip tone="muted" title="Tronco do próprio cliente, com outra operadora">link de terceiro</Chip>}</span>} sub={<span>{c.carrierName ?? 'sem operadora'} · N° <span className="font-mono">{c.code}</span>{c.keyNumber ? <> · número chave <span className="font-mono tnum">{didFormatado(c.keyNumber)}</span></> : null}{c.ownerName ? ` · titular: ${c.ownerName}` : ''}</span>} acoes={<>
      <Can permission="dids.assign"><button className="btn-primary" onClick={() => setFaixa(true)}><Plus size={15} /> Criar faixa de DIDs</button></Can>
      <Can permission="records.write"><button className="btn-secondary" onClick={() => setEditar(true)}><Pencil size={15} /> Editar</button></Can>
      <Can permission="records.delete"><button className="btn-ghost text-bad" onClick={() => setExcluir(true)} title="Mandar para a lixeira"><Trash2 size={15} /></button></Can>
    </>}>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <Kpi label="Canais" valor={c.channels} sub="chamadas simultâneas" tone={c.channels === 0 && c.dids.total > 0 ? 'bad' : 'neutral'} />
        <Kpi label="DIDs" valor={c.dids.total} tone="accent" />
        <Kpi label="Em uso" valor={c.dids.assigned} />
        <Kpi label="Livres" valor={c.dids.free} tone={c.dids.free === 0 && c.dids.total > 0 ? 'signal' : 'ok'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <div className="eyebrow mb-2">Tronco</div>
          <dl className="grid grid-cols-[130px_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted">N° do circuito</dt><dd className="font-mono tnum">{c.code}</dd>
            <dt className="text-muted">Número chave</dt><dd className="font-mono tnum">{c.keyNumber ? didFormatado(c.keyNumber) : '—'}</dd>
            <dt className="text-muted">Titular</dt><dd>{c.ownerName ?? '—'}</dd>
            <dt className="text-muted">IP da operadora</dt><dd className="font-mono">{c.signalingIp ?? '—'}</dd>
            <dt className="text-muted">IP de autenticação</dt><dd className="font-mono">{c.authIp ?? '—'}</dd>
            <dt className="text-muted">Usuário</dt><dd className="font-mono">{c.authUsername ?? '—'}</dd>
            <dt className="text-muted">Valor mensal</dt><dd className="tnum">{reais(c.monthlyValueCents)}</dd>
          </dl>
          <div className="mt-3"><Campo label="Senha de autenticação"><CampoSegredo secretId={c.authPassword.secretId} hasSecret={c.authPassword.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></Campo></div>
          {c.notes && <p className="text-sm mt-3 whitespace-pre-wrap text-ink-2">{c.notes}</p>}
        </div>
        <div className="card lg:col-span-2 overflow-x-auto">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between"><span className="font-display font-semibold">DIDs deste circuito</span><Link className="link text-sm" to={`/circuitos?aba=numeracao&circuito=${c.id}`}>abrir na Numeração para editar em massa</Link></div>
          {dids.isLoading ? <Carregando /> : !dids.data?.items.length ? <div className="p-6 text-muted text-sm">Nenhum DID ainda. Crie uma faixa.</div> : (
            <table className="table"><thead><tr><ThN /><Th o={o} col="number">Número</Th><Th o={o} col="clientName">Cliente</Th><Th o={o} col="ownerName">Titular</Th><Th o={o} col="note">Observação</Th></tr></thead>
              <tbody>{pg.visiveis.map((d, i) => <tr key={d.id}><TdN n={pg.numero(i)} /><td className="font-mono tnum">{d.numberFormatted}</td><td>{d.clientId ? <Link className="link" to={`/clientes/${d.clientId}`}>{d.clientName}</Link> : <span className="chip bg-ok-soft text-ok">livre</span>}</td><td className="text-muted">{d.ownerName ?? '—'}</td><td className="text-muted">{d.note}</td></tr>)}</tbody></table>
          )}
          {!!dids.data?.items.length && <div className="px-4 pb-3">{pg.rodape}</div>}
        </div>
      </div>
      <CircuitoForm open={editar} onClose={() => setEditar(false)} circuito={c} onSaved={() => setEditar(false)} />
      <FaixaForm open={faixa} onClose={() => setFaixa(false)} circuitId={c.id} onDone={() => { setFaixa(false); void qc.invalidateQueries({ queryKey: ['circuit', id] }); void qc.invalidateQueries({ queryKey: ['circuit-dids', id] }); }} />
      <Confirmar open={excluir} onClose={() => setExcluir(false)} onConfirm={doDelete} loading={busy} perigoso titulo="Mandar circuito para a lixeira" botao="Mandar para a lixeira" texto={c.dids.total > 0 ? <>Este circuito ainda tem <b>{c.dids.total} DIDs</b>. O sistema vai recusar: mova-os antes.</> : <>O circuito <b>{c.name}</b> sai das listas, sem apagar nada. Dá para restaurar na lixeira.</>} />
    </Pagina>
  );
}

export function FaixaForm({ open, onClose, circuitId, onDone }: { open: boolean; onClose: () => void; circuitId?: string; onDone: () => void }) {
  const [f, setF] = useState({ baseNumber: '', quantity: 10, clientId: '', circuitId: circuitId ?? '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const toast = useToast();
  const clients = useQuery({ queryKey: ['client-options'], queryFn: () => api.clients.options(), enabled: open });
  const circuits = useQuery({ queryKey: ['circuit-options'], queryFn: api.circuits.options, enabled: open && !circuitId });
  const digits = f.baseNumber.replace(/\D/g, '');
  const preview = digits.length >= 10 && f.quantity > 0 ? `${didFormatado(digits)} … ${didFormatado((BigInt(digits) + BigInt(f.quantity - 1)).toString().padStart(digits.length, '0'))}` : null;
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const body = { baseNumber: f.baseNumber, quantity: Number(f.quantity), clientId: f.clientId || null };
      const r = circuitId ? await api.circuits.createRange(circuitId, body) : await api.dids.createRange({ ...body, circuitId: f.circuitId || null });
      toast.push('ok', `${r.created} DIDs criados (${didFormatado(r.first)} a ${didFormatado(r.last)})`); onDone();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} titulo="Criar faixa de DIDs" rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || digits.length < 10 || f.quantity < 1} onClick={save}>{busy ? <Spinner className="text-white" /> : `Criar ${f.quantity || 0} DIDs`}</button></>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Número inicial" dica="DDD + número"><input className="input font-mono" placeholder="(71) 3020-1200" value={f.baseNumber} onChange={(e) => setF({ ...f, baseNumber: e.target.value })} autoFocus /></Campo>
          <Campo label="Quantidade" dica="até 1.000 por vez"><input type="number" min={1} max={1000} className="input tnum" value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} /></Campo>
        </div>
        {!circuitId && <Campo label="Circuito"><select className="input" value={f.circuitId} onChange={(e) => setF({ ...f, circuitId: e.target.value })}><option value="">sem circuito</option>{circuits.data?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>)}</select></Campo>}
        <Campo label="Cliente (uso)" dica="deixe vazio para criar livres"><select className="input" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}><option value="">livre</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Campo>
        {preview && <div className="card p-3 text-sm bg-accent-soft border-transparent text-accent-ink font-mono">{preview}</div>}
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}
