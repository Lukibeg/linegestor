/**
 * Circuitos e DIDs: um pequeno painel no topo (circuitos, canais, valor mensal, numeração)
 * e duas abas — a lista de circuitos e a Numeração (todos os DIDs de todos os circuitos).
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../../api/index.js';
import type { Circuit } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can, useAuth } from '../../lib/auth.js';
import { Abas, Campo, CampoSegredo, Carregando, Kpi, Modal, Ocupacao, Paginacao, Spinner, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { didFormatado, paraCentavos, reais } from '../../lib/format.js';
import { Numeracao } from '../dids/Lista.js';

type Aba = 'circuitos' | 'numeracao';

export function CircuitosLista() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const aba = (sp.get('aba') === 'numeracao' ? 'numeracao' : 'circuitos') as Aba;
  const q = sp.get('q') ?? ''; const carrierId = sp.get('operadora') ?? ''; const ownerClientId = sp.get('titular') ?? ''; const page = Number(sp.get('p') ?? 1);
  const filtros = { q, carrierId, ownerClientId };
  const temFiltro = !!(q || carrierId || ownerClientId);
  const [novo, setNovo] = useState(false);
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'p') n.delete('p'); setSp(n, { replace: true }); };
  const trocarAba = (a: Aba) => setSp(a === 'numeracao' ? { aba: 'numeracao' } : {}, { replace: true });
  const carriers = useQuery({ queryKey: ['catalog', 'carriers'], queryFn: () => api.admin.catalog('carriers') });
  const titulares = useQuery({ queryKey: ['client-options', 'internal'], queryFn: () => api.clients.options({ includeInternal: true }) });
  // os cartões do topo usam os MESMOS filtros da lista
  const resumo = useQuery({ queryKey: ['circuits', 'summary', filtros], queryFn: () => api.circuits.summary(filtros) });
  const lista = useQuery({ queryKey: ['circuits', filtros, page], queryFn: () => api.circuits.list({ ...filtros, page, pageSize: 50 }), enabled: aba === 'circuitos' });
  const r = resumo.data;
  return (
    <Pagina titulo="Circuitos e DIDs" sub="Feixes contratados junto às operadoras e toda a numeração." acoes={aba === 'circuitos' ? <Can permission="records.write"><button className="btn-primary" onClick={() => setNovo(true)}><Plus size={16} /> Novo circuito</button></Can> : undefined}>
      {/* painel resumido — segue os filtros escolhidos abaixo */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <Kpi label={temFiltro ? 'Circuitos (filtrados)' : 'Circuitos'} valor={r ? r.circuits : '…'} sub={r ? `${r.channels.toLocaleString('pt-BR')} canais no total` : undefined} tone="accent" />
        <Kpi label="Valor mensal (circuitos)" valor={r ? reais(r.monthlyValueCents) : '…'} sub="soma do que é pago às operadoras" />
        <Kpi label="DIDs" valor={r ? r.dids.total.toLocaleString('pt-BR') : '…'} sub={r ? `${r.dids.assigned.toLocaleString('pt-BR')} em uso · ${r.dids.free.toLocaleString('pt-BR')} livres` : undefined} tone="ok" />
        <Kpi label="DIDs sem circuito" valor={r ? r.dids.noCircuit : '…'} sub={r && r.dids.noCircuit > 0 ? 'precisam ser ligados a um circuito' : 'tudo ligado a um circuito'} tone={r && r.dids.noCircuit > 0 ? 'signal' : 'neutral'} />
      </div>
      {temFiltro && <p className="text-[12.5px] text-muted -mt-3 mb-4">Os cartões acima estão somando apenas o que o filtro deixou passar. <button className="link" onClick={() => setSp(aba === 'numeracao' ? { aba: 'numeracao' } : {}, { replace: true })}>limpar filtros</button></p>}

      <Abas atual={aba} onChange={trocarAba} abas={[{ id: 'circuitos', label: 'Circuitos' }, { id: 'numeracao', label: <>Numeração <span className="text-muted">(todos os DIDs)</span></> }]} />

      {aba === 'numeracao' ? <Numeracao /> : (<>
        <div className="card p-3 mb-4 flex flex-wrap gap-2">
          <input className="input max-w-xs" placeholder="Buscar por nome, N° do circuito ou operadora" value={q} onChange={(e) => set('q', e.target.value)} />
          <select className="input w-auto" value={carrierId} onChange={(e) => set('operadora', e.target.value || null)}><option value="">Todas as operadoras</option>{carriers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className="input w-auto" value={ownerClientId} onChange={(e) => set('titular', e.target.value || null)}><option value="">Todos os titulares</option>{titulares.data?.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isInternal ? ' (interna)' : ''}</option>)}</select>
        </div>
        {lista.isLoading ? <Carregando /> : !lista.data?.items.length ? <Vazio titulo="Nenhum circuito" texto="Cadastre o feixe contratado junto à operadora." /> : (
          <div className="card overflow-x-auto"><table className="table">
            <thead><tr><th>Nome</th><th>Operadora</th><th>N° do circuito</th><th>Número chave</th><th>Titular</th><th className="text-right">Canais</th><th className="text-right">DIDs</th><th className="text-right">Livres</th><th>Em uso</th><th className="text-right">Valor/mês</th></tr></thead>
            <tbody>{lista.data.items.map((c) => (
              <tr key={c.id} className="cursor-pointer" onClick={() => nav(`/circuitos/${c.id}`)}>
                <td className="font-medium">{c.name}</td><td>{c.carrierName ?? '—'}</td><td className="font-mono tnum">{c.code}</td><td className="font-mono tnum whitespace-nowrap">{c.keyNumber ? didFormatado(c.keyNumber) : <span className="text-muted">—</span>}</td><td className="text-ink-2">{c.ownerName ?? '—'}</td><td className="text-right tnum">{c.channels}</td><td className="text-right tnum">{c.dids.total}</td><td className="text-right tnum">{c.dids.free}</td><td><Ocupacao total={c.dids.total} assigned={c.dids.assigned} /></td><td className="text-right tnum">{reais(c.monthlyValueCents)}</td>
              </tr>))}</tbody></table></div>
        )}
        {lista.data && <Paginacao page={page} pageSize={50} total={lista.data.total} onChange={(p) => set('p', String(p))} />}
      </>)}
      <CircuitoForm open={novo} onClose={() => setNovo(false)} onSaved={(c) => { setNovo(false); nav(`/circuitos/${c.id}`); }} />
    </Pagina>
  );
}

export function CircuitoForm({ open, onClose, onSaved, circuito }: { open: boolean; onClose: () => void; onSaved: (c: Circuit) => void; circuito?: Circuit }) {
  const carriers = useQuery({ queryKey: ['catalog', 'carriers'], queryFn: () => api.admin.catalog('carriers'), enabled: open });
  const owners = useQuery({ queryKey: ['client-options', 'internal'], queryFn: () => api.clients.options({ includeInternal: true }), enabled: open });
  const { can } = useAuth();
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState<Record<string, any>>({});
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setErr(''); setSenha(''); setF(circuito ? { name: circuito.name, code: circuito.code, keyNumber: circuito.keyNumber ? didFormatado(circuito.keyNumber) : '', carrierId: circuito.carrierId ?? '', channels: circuito.channels, ownerClientId: circuito.ownerClientId ?? '', monthlyValue: circuito.monthlyValueCents != null ? (circuito.monthlyValueCents / 100).toFixed(2).replace('.', ',') : '', signalingIp: circuito.signalingIp ?? '', authIp: circuito.authIp ?? '', authUsername: circuito.authUsername ?? '', notes: circuito.notes ?? '' } : { name: '', code: '', keyNumber: '', carrierId: '', channels: 0, ownerClientId: owners.data?.find((o) => o.internalCode === 'voicenet')?.id ?? '', monthlyValue: '', signalingIp: '', authIp: '', authUsername: '', notes: '' }); } }, [open, circuito, owners.data]);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const body = { name: f.name, code: f.code, keyNumber: f.keyNumber || null, carrierId: f.carrierId || null, channels: Number(f.channels) || 0, ownerClientId: f.ownerClientId || null, monthlyValueCents: f.monthlyValue ? paraCentavos(f.monthlyValue) : null, signalingIp: f.signalingIp || null, authIp: f.authIp || null, authUsername: f.authUsername || null, notes: f.notes || null, ...(senha ? { authPassword: senha } : {}) };
      const r = circuito ? await api.circuits.update(circuito.id, body) : await api.circuits.create(body);
      await qc.invalidateQueries({ queryKey: ['circuits'] }); await qc.invalidateQueries({ queryKey: ['circuit', r.id] });
      toast.push('ok', circuito ? 'Circuito atualizado' : 'Circuito criado'); onSaved(r);
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} lateral largura="max-w-xl" titulo={circuito ? `Editar ${circuito.name}` : 'Novo circuito'} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !f.name || !f.code} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
      <div className="flex flex-col gap-3">
        <Campo label="Nome"><input className="input" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="N° do circuito" dica="o número/código do feixe na operadora"><input className="input font-mono" value={f.code ?? ''} onChange={(e) => setF({ ...f, code: e.target.value })} /></Campo>
          <Campo label="Operadora"><select className="input" value={f.carrierId ?? ''} onChange={(e) => setF({ ...f, carrierId: e.target.value })}><option value="">— sem operadora —</option>{carriers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Campo>
          <Campo label="Número chave" dica="o número piloto do feixe"><input className="input font-mono tnum" placeholder="(71) 3020-0000" value={f.keyNumber ?? ''} onChange={(e) => setF({ ...f, keyNumber: e.target.value })} onBlur={() => setF((x) => ({ ...x, keyNumber: x.keyNumber ? didFormatado(x.keyNumber) : '' }))} /></Campo>
          <Campo label="Canais (chamadas simultâneas)"><input type="number" min={0} className="input tnum" value={f.channels ?? 0} onChange={(e) => setF({ ...f, channels: e.target.value })} /></Campo>
          <Campo label="Valor mensal (R$)"><input className="input tnum" placeholder="0,00" value={f.monthlyValue ?? ''} onChange={(e) => setF({ ...f, monthlyValue: e.target.value })} /></Campo>
          <Campo label="Titular" dica="quem detém o contrato com a operadora (normalmente VoiceNet)" className="col-span-2"><select className="input" value={f.ownerClientId ?? ''} onChange={(e) => setF({ ...f, ownerClientId: e.target.value })}><option value="">—</option>{owners.data?.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isInternal ? ' (interna)' : ''}</option>)}</select></Campo>
        </div>
        <fieldset className="card p-3 flex flex-col gap-3" disabled={!can('servers.write')}>
          <legend className="eyebrow px-1">Tronco (autenticação) {!can('servers.write') && '· somente leitura'}</legend>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="IP da operadora"><input className="input font-mono" value={f.signalingIp ?? ''} onChange={(e) => setF({ ...f, signalingIp: e.target.value })} /></Campo>
            <Campo label="IP de autenticação (IP PBX)"><input className="input font-mono" value={f.authIp ?? ''} onChange={(e) => setF({ ...f, authIp: e.target.value })} /></Campo>
            <Campo label="Usuário de autenticação"><input className="input font-mono" value={f.authUsername ?? ''} onChange={(e) => setF({ ...f, authUsername: e.target.value })} /></Campo>
          </div>
          <Campo label="Senha de autenticação"><CampoSegredo secretId={circuito?.authPassword.secretId ?? null} hasSecret={!!circuito?.authPassword.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} onChangeNovo={setSenha} /></Campo>
        </fieldset>
        <Campo label="Anotações"><textarea className="input" rows={3} value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}
