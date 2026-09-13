/** Painel inicial: o que precisa de atenção hoje. */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '../api/index.js';
import { Pagina } from '../components/layout/AppShell.js';
import { Carregando, Chip, Kpi, Ocupacao } from '../components/ui/index.js';
import { reais, relativo } from '../lib/format.js';

export function Painel() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard.summary });
  if (q.isLoading || !q.data) return <Carregando />;
  const d = q.data;
  return (
    <Pagina titulo="Painel" sub="O que a base tem hoje e o que precisa de atenção.">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Clientes ativos" valor={d.clients.active} tone="accent" sub={<Link className="link" to="/clientes">ver todos</Link>} />
        <Kpi label="DIDs livres" valor={d.dids.free} tone={d.dids.free === 0 ? 'signal' : 'ok'} sub={`${d.dids.assigned} em uso de ${d.dids.total}`} />
        <Kpi label="Aparelhos com clientes" valor={d.devices.withClients} sub={`${d.devices.inStock} em estoque · ${reais(d.devices.valueWithClientsCents)} locados`} />
        <Kpi label="Alertas" valor={d.alerts.reduce((a, x) => a + x.count, 0)} tone={d.alerts.some((a) => a.severity === 'critical') ? 'bad' : d.alerts.length ? 'signal' : 'ok'} sub={d.alerts.length ? `${d.alerts.length} tipo(s)` : 'cadastro consistente'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mt-5">
        <section className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3"><h2 className="font-display font-semibold">Ocupação dos circuitos</h2><Link to="/circuitos" className="link text-sm">todos</Link></div>
          {d.circuits.length === 0 ? <div className="text-muted text-sm">Nenhum circuito cadastrado.</div> : (
            <table className="table">
              <thead><tr><th>Circuito</th><th className="text-right">Canais</th><th className="text-right">DIDs</th><th className="text-right">Livres</th><th>Em uso</th></tr></thead>
              <tbody>
                {d.circuits.slice(0, 8).map((c) => (
                  <tr key={c.id}><td><Link className="link" to={`/circuitos/${c.id}`}>{c.name}</Link> <span className="text-muted text-[12px]">{c.carrierName}</span></td><td className="text-right tnum">{c.channels}</td><td className="text-right tnum">{c.total}</td><td className="text-right tnum">{c.free}</td><td><Ocupacao total={c.total} assigned={c.assigned} /></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-4">
          <h2 className="font-display font-semibold mb-3">Precisa de atenção</h2>
          {d.alerts.length === 0 ? <div className="text-ok text-sm">Nenhuma inconsistência encontrada.</div> : (
            <ul className="flex flex-col gap-2">
              {d.alerts.map((a) => (
                <li key={a.kind}><Link to={a.link} className={`flex items-start gap-2 p-2 rounded-lg text-sm hover:bg-surface-2 ${a.severity === 'critical' ? 'text-bad' : 'text-ink'}`}><AlertTriangle size={15} className={`mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-bad' : 'text-signal'}`} /><span className="flex-1">{a.message}</span><span className="font-mono tnum text-muted">{a.count}</span><ArrowRight size={14} className="text-muted mt-0.5" /></Link></li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="font-display font-semibold mb-3">Clientes por produto</h2>
          <ul className="flex flex-col gap-1.5">
            {d.clients.byProduct.map((p) => (
              <li key={p.code}><Link to={`/clientes?produtos=${p.code}`} className="flex items-center justify-between text-sm hover:bg-surface-2 rounded-lg px-2 py-1"><Chip color={p.color}>{p.name}</Chip><span className="font-mono tnum">{p.n}</span></Link></li>
            ))}
          </ul>
        </section>

        <section className="card p-4">
          <div className="flex items-center justify-between mb-3"><h2 className="font-display font-semibold">Últimas movimentações</h2><Link to="/inventario?aba=movimentacoes" className="link text-sm">todas</Link></div>
          {d.recentMovements.length === 0 ? <div className="text-muted text-sm">Nenhuma ainda.</div> : (
            <ul className="flex flex-col gap-2 text-sm">
              {d.recentMovements.map((m) => (
                <li key={m.id} className="flex items-start gap-2"><Chip tone={m.modality === 'devolucao' ? 'neutral' : m.modality === 'venda' ? 'accent' : 'ok'}>{m.modalityName}</Chip><span className="flex-1 min-w-0"><div className="truncate">{m.fromName ?? 'Estoque'} → {m.toName ?? 'Estoque'}</div><div className="text-muted text-[12px]">{m.userName} · {relativo(m.createdAt)}</div></span></li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <div className="flex items-center justify-between mb-3"><h2 className="font-display font-semibold">Atividade recente</h2><Link to="/admin/auditoria" className="link text-sm">auditoria</Link></div>
          <ul className="flex flex-col gap-2 text-sm">
            {d.recentAudit.map((a) => (<li key={a.id}><div className="truncate">{a.summary}</div><div className="text-muted text-[12px]">{a.userName ?? 'sistema'} · {relativo(a.createdAt)}</div></li>))}
            {d.recentAudit.length === 0 && <li className="text-muted">Nada ainda.</li>}
          </ul>
        </section>
      </div>
    </Pagina>
  );
}
