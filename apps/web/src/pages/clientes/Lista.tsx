/** Lista de clientes: cards ou tabela, busca, filtro por produto (qualquer/todos), arquivados. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ExternalLink, LayoutGrid, List, Plus, Terminal } from 'lucide-react';
import { api } from '../../api/index.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can } from '../../lib/auth.js';
import { Carregando, Chip, Paginacao, Toggle, Vazio } from '../../components/ui/index.js';
import { cnpjFormatado } from '../../lib/format.js';
import { ClienteForm } from './Form.js';

export function ClientesLista() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const q = sp.get('q') ?? '';
  const produtos = sp.getAll('produtos');
  const mode = (sp.get('modo') ?? 'or') as 'or' | 'and';
  const arquivados = sp.get('arquivados') === '1';
  const view = sp.get('ver') ?? 'cards';
  const page = Number(sp.get('p') ?? 1);
  const [novo, setNovo] = useState(false);

  const set = (k: string, v: string | string[] | null) => { const n = new URLSearchParams(sp); n.delete(k); if (Array.isArray(v)) v.forEach((x) => n.append(k, x)); else if (v) n.set(k, v); if (k !== 'p') n.delete('p'); setSp(n, { replace: true }); };

  const prods = useQuery({ queryKey: ['products'], queryFn: api.admin.products });
  const lista = useQuery({ queryKey: ['clients', q, produtos, mode, arquivados, page], queryFn: () => api.clients.list({ q, products: produtos, mode, includeArchived: arquivados, page, pageSize: 24 }) });

  return (
    <Pagina titulo="Clientes" sub={lista.data ? `${lista.data.total} cliente(s)` : ' '} acoes={<Can permission="records.write"><button className="btn-primary" onClick={() => setNovo(true)}><Plus size={16} /> Novo cliente</button></Can>}>
      <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Buscar por nome ou CNPJ" value={q} onChange={(e) => set('q', e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {prods.data?.filter((p) => p.active).map((p) => {
            const on = produtos.includes(p.code);
            return <button key={p.code} onClick={() => set('produtos', on ? produtos.filter((x) => x !== p.code) : [...produtos, p.code])} className={`chip border transition-colors ${on ? 'border-transparent' : 'border-line bg-transparent text-ink-2'}`} style={on ? { background: p.color + '22', color: p.color } : undefined}>{p.name}</button>;
          })}
        </div>
        {produtos.length > 1 && (
          <select className="input w-auto" value={mode} onChange={(e) => set('modo', e.target.value)}>
            <option value="or">tem qualquer um</option>
            <option value="and">tem todos</option>
          </select>
        )}
        <div className="ml-auto flex items-center gap-3">
          <Toggle checked={arquivados} onChange={(v) => set('arquivados', v ? '1' : null)} label="arquivados" />
          <div className="flex rounded-lg border border-line overflow-hidden">
            <button className={`px-2 py-1.5 ${view === 'cards' ? 'bg-accent-soft text-accent-ink' : 'text-muted'}`} onClick={() => set('ver', null)} title="Cards"><LayoutGrid size={16} /></button>
            <button className={`px-2 py-1.5 ${view === 'tabela' ? 'bg-accent-soft text-accent-ink' : 'text-muted'}`} onClick={() => set('ver', 'tabela')} title="Tabela"><List size={16} /></button>
          </div>
        </div>
      </div>

      {lista.isLoading ? <Carregando /> : !lista.data?.items.length ? (
        <Vazio titulo="Nenhum cliente encontrado" texto={q || produtos.length ? 'Tente outra busca ou limpe os filtros.' : 'Cadastre o primeiro cliente para começar.'} acao={<Can permission="records.write"><button className="btn-primary" onClick={() => setNovo(true)}><Plus size={16} /> Novo cliente</button></Can>} />
      ) : view === 'tabela' ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Nome fantasia</th><th>Razão social</th><th>CNPJ</th><th>Produtos</th><th className="text-right">DIDs</th><th className="text-right">Aparelhos</th></tr></thead>
            <tbody>
              {lista.data.items.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => nav(`/clientes/${c.id}`)}>
                  <td className="font-medium">{c.tradeName} {c.archived && <Chip tone="muted">arquivado</Chip>}</td>
                  <td className="text-ink-2">{c.legalName}</td>
                  <td className="font-mono text-[12.5px] tnum">{cnpjFormatado(c.cnpj)}</td>
                  <td><div className="flex flex-wrap gap-1">{c.products.map((p) => <Chip key={p.code} color={p.color}>{p.name}</Chip>)}</div></td>
                  <td className="text-right tnum">{c.didCount}</td><td className="text-right tnum">{c.deviceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.data.items.map((c) => (
            <Link key={c.id} to={`/clientes/${c.id}`} className="card p-4 hover:border-accent transition-colors flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center font-display font-semibold text-ink-2 shrink-0">{c.tradeName.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{c.tradeName} {c.archived && <Chip tone="muted">arquivado</Chip>}</div>
                  <div className="text-muted text-[12.5px] truncate">{c.legalName}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">{c.products.map((p) => <Chip key={p.code} color={p.color}>{p.name}</Chip>)}{c.products.length === 0 && <span className="text-muted text-[12px]">sem produtos</span>}</div>
              <div className="flex items-center gap-2 text-[12.5px] mt-auto">
                {c.links.web ? (
                  <>
                    <a onClick={(e) => e.stopPropagation()} href={c.links.web} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink size={13} /> abrir</a>
                    {c.links.ssh && <a onClick={(e) => e.stopPropagation()} href={c.links.ssh} className="btn-secondary btn-sm"><Terminal size={13} /> SSH</a>}
                    {c.links.fop2 && <a onClick={(e) => e.stopPropagation()} href={c.links.fop2} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">FOP2</a>}
                  </>
                ) : <span className="text-muted italic">servidor não configurado</span>}
                <span className="ml-auto text-muted tnum">{c.didCount} DIDs · {c.deviceCount} aparelhos</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      {lista.data && <Paginacao page={page} pageSize={24} total={lista.data.total} onChange={(p) => set('p', String(p))} />}
      <ClienteForm open={novo} onClose={() => setNovo(false)} onSaved={(c) => { setNovo(false); nav(`/clientes/${c.id}`); }} />
    </Pagina>
  );
}
