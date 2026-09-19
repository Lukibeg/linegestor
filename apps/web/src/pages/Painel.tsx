/** Painel inicial: o que precisa de atenção hoje. */
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '../api/index.js';
import { Pagina } from '../components/layout/AppShell.js';
import { Carregando, Chip, Kpi, Ocupacao } from '../components/ui/index.js';
import { reais, relativo } from '../lib/format.js';
import { contar, TdN, ThN } from '../lib/contagem.js';
import { Andamento } from './projetos/partes.js';
import { BarrasRanking, BarrasTempo, Proporcao } from '../components/graficos.js';

/** "2026-09" → "set/26", que é como a gente fala. */
function mesCurto(mes: string) {
  const [ano, m] = mes.split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(m) - 1] ?? m}/${ano!.slice(2)}`;
}

export function Painel() {
  const nav = useNavigate();
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 mt-5">
        <section className="card p-4 lg:col-span-2 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold">Movimentação dos últimos 6 meses</h2>
            <Link to="/inventario?aba=movimentacoes" className="link text-sm">todas</Link>
          </div>
          <BarrasTempo
            unidade="movimentação(ões)"
            vazio="Nenhuma movimentação registrada ainda."
            dados={d.movimentacoesPorMes.map((m) => ({
              rotulo: mesCurto(m.mes),
              valor: m.total,
              detalhe: m.porModalidade.map((x) => ({ nome: x.nome, n: x.n })),
            }))}
          />
        </section>

        <section className="card p-4 flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-2"><h2 className="font-display font-semibold">Numeração</h2><Link to="/circuitos?aba=numeracao" className="link text-sm">ver</Link></div>
            <Proporcao partes={[
              { id: 'uso', rotulo: 'Com cliente', n: d.dids.assigned, cor: 'accent' },
              { id: 'livre', rotulo: 'Livres', n: d.dids.free, cor: 'ok' },
            ]} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2"><h2 className="font-display font-semibold">Aparelhos</h2><Link to="/inventario" className="link text-sm">ver</Link></div>
            <Proporcao partes={[
              { id: 'clientes', rotulo: 'Com clientes', n: d.devices.withClients, cor: 'accent' },
              { id: 'estoque', rotulo: 'Em estoque', n: d.devices.inStock, cor: 'ok' },
              { id: 'inativos', rotulo: 'Inativos', n: d.devices.inactive, cor: 'signal' },
            ]} />
          </div>
        </section>

        <section className="card p-4 lg:col-span-2 min-w-0 overflow-x-auto">
          <div className="flex items-center justify-between mb-3"><h2 className="font-display font-semibold">Ocupação dos circuitos</h2><Link to="/circuitos" className="link text-sm">todos</Link></div>
          {d.circuits.length === 0 ? <div className="text-muted text-sm">Nenhum circuito cadastrado.</div> : (
            <table className="table">
              <thead><tr><ThN /><th>Circuito</th><th className="text-right">Canais</th><th className="text-right">DIDs</th><th className="text-right">Livres</th><th>Em uso</th></tr></thead>
              <tbody>
                {d.circuits.slice(0, 8).map((c, i) => (
                  <tr key={c.id}><TdN n={contar(i)} /><td><Link className="link" to={`/circuitos/${c.id}`}>{c.name}</Link> <span className="text-muted text-[12px]">{c.carrierName}</span></td><td className="text-right tnum">{c.channels}</td><td className="text-right tnum">{c.total}</td><td className="text-right tnum">{c.free}</td><td><Ocupacao total={c.total} assigned={c.assigned} /></td></tr>
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
          <div className="flex items-center justify-between mb-3"><h2 className="font-display font-semibold">Projetos</h2><Link to="/projetos" className="link text-sm">todos</Link></div>
          {d.projetos.items.length === 0 ? <div className="text-muted text-sm">Nenhum projeto em andamento.</div> : (
            <>
              <ul className="flex flex-col gap-2.5">
                {d.projetos.items.map((p) => (
                  <li key={p.id}>
                    <Link to={`/projetos/${p.id}`} className="block hover:bg-surface-2 rounded-lg px-2 py-1 -mx-2">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">{p.name}</span>
                        {p.atrasado && <Chip tone="bad">atrasado</Chip>}
                      </div>
                      <Andamento pct={p.andamento} total={p.total} faltam={p.faltam} />
                    </Link>
                  </li>
                ))}
              </ul>
              {(d.projetos.travados > 0 || d.projetos.atrasados > 0) && (
                <div className="text-[12px] text-muted mt-2">
                  {d.projetos.atrasados > 0 && <span className="text-bad">{d.projetos.atrasados} atrasado(s)</span>}
                  {d.projetos.atrasados > 0 && d.projetos.travados > 0 && ' · '}
                  {d.projetos.travados > 0 && <span className="text-signal">{d.projetos.travados} cliente(s) travado(s)</span>}
                </div>
              )}
            </>
          )}
        </section>

        <section className="card p-4">
          <h2 className="font-display font-semibold mb-3">Clientes por produto</h2>
          <BarrasRanking
            acao={(code) => nav(`/clientes?produtos=${code}`)}
            dados={[...d.clients.byProduct].sort((a, b) => b.n - a.n).map((p) => ({
              id: p.code, valor: p.n, titulo: `${p.n} cliente(s) com ${p.name}`,
              rotulo: <Chip color={p.color}>{p.name}</Chip>,
            }))}
          />
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
