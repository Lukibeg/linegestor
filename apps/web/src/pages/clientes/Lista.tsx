/**
 * Lista de clientes: cards ou tabela, busca, filtros em botão (Produtos e Módulos, com "qualquer um/todos"), arquivados.
 * Na tabela, a pessoa escolhe quais colunas quer ver: qualquer detalhe do cliente, a data de ativação de
 * cada produto e CADA MÓDULO como sua própria coluna. A escolha fica guardada no navegador.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ExternalLink, LayoutGrid, List, Package, Plus, Puzzle } from 'lucide-react';
import { api, logoSrc } from '../../api/index.js';
import type { ClientListItem, Product } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can } from '../../lib/auth.js';
import { Carregando, Chip, LogoCliente, TODOS, Toggle, Vazio } from '../../components/ui/index.js';
import { cnpjFormatado, data, relativo } from '../../lib/format.js';
import { Th, useOrdenacao } from '../../lib/ordenacao.js';
import { SeletorColunas, useColunasEscolhidas, type Coluna } from '../../lib/colunas.js';
import { FiltroEmBotao, type GrupoFiltro } from '../../lib/filtros.js';
import { useLembrarFiltros } from '../../lib/voltar.js';
import { contarDe, TdN, ThN } from '../../lib/contagem.js';
import { ClienteForm } from './Form.js';

// ---------- Colunas disponíveis na tabela ----------

const PADRAO = ['tradeName', 'legalName', 'cnpj', 'products', 'didCount', 'deviceCount'];
const STORAGE = 'gestor.clientes.colunas';

/** As colunas fixas + uma por produto ("ativado em") + UMA POR MÓDULO (cada módulo vira sua própria coluna). */
function montarColunas(produtos: Product[]): Coluna<ClientListItem>[] {
  const fixas: Coluna<ClientListItem>[] = [
    { id: 'tradeName', label: 'Nome fantasia', grupo: 'Cliente', render: (c) => <span className="flex items-center gap-2 font-medium"><LogoCliente src={logoSrc(c.logoUrl)} nome={c.tradeName} tamanho={24} />{c.tradeName} {c.archived && <Chip tone="muted">arquivado</Chip>}</span> },
    { id: 'legalName', label: 'Razão social', grupo: 'Cliente', render: (c) => <span className="text-ink-2">{c.legalName}</span> },
    { id: 'cnpj', label: 'CNPJ', grupo: 'Cliente', render: (c) => <span className="font-mono text-[12.5px] tnum whitespace-nowrap">{cnpjFormatado(c.cnpj)}</span> },
    { id: 'notes', label: 'Anotações', grupo: 'Cliente', render: (c) => <span className="text-muted block max-w-[280px] truncate" title={c.notes ?? ''}>{c.notes ?? '—'}</span> },
    { id: 'createdAt', label: 'Cadastrado em', grupo: 'Cliente', render: (c) => <span className="tnum whitespace-nowrap">{data(c.createdAt)}</span> },
    { id: 'updatedAt', label: 'Última alteração', grupo: 'Cliente', render: (c) => <span className="text-muted">{relativo(c.updatedAt)}</span> },
    { id: 'products', label: 'Produtos', grupo: 'Produtos', render: (c) => <div className="flex flex-wrap gap-1">{c.products.map((p) => <Chip key={p.code} color={p.color}>{p.name}</Chip>)}{!c.products.length && <span className="text-muted">—</span>}</div> },
    { id: 'modules', label: 'Módulos', labelCurto: 'Todos os módulos, num campo só', grupo: 'Produtos', render: (c) => { const ms = c.products.flatMap((p) => p.modules.map((m) => ({ ...m, color: p.color, product: p.name }))); return ms.length ? <div className="flex flex-wrap gap-1">{ms.map((m) => <Chip key={m.product + m.code} color={m.color} title={`${m.product} › ${m.name}`}>{m.name}</Chip>)}</div> : <span className="text-muted">—</span>; } },
    { id: 'hosting', label: 'Hospedagem', grupo: 'Servidor LinePBX', render: (c) => c.server?.hostingName ?? <span className="text-muted">—</span> },
    { id: 'domain', label: 'Endereço (domínio)', grupo: 'Servidor LinePBX', render: (c) => c.server?.domain ? <span className="font-mono text-[12.5px]">{c.server.domain}</span> : <span className="text-muted">—</span> },
    { id: 'serverIp', label: 'IP do servidor', grupo: 'Servidor LinePBX', render: (c) => c.server?.serverIp ? <span className="font-mono text-[12.5px] tnum">{c.server.serverIp}</span> : <span className="text-muted">—</span> },
    { id: 'ssh', label: 'Porta SSH', grupo: 'Servidor LinePBX', render: (c) => c.server && (c.server.domain || c.server.serverIp) ? <span className="font-mono text-[12.5px] tnum">{c.server.sshPort ?? 22}</span> : <span className="text-muted">—</span> },
    { id: 'didCount', label: 'DIDs', grupo: 'Contagens', align: 'right', render: (c) => <span className="tnum">{c.didCount}</span> },
    { id: 'deviceCount', label: 'Aparelhos', grupo: 'Contagens', align: 'right', render: (c) => <span className="tnum">{c.deviceCount}</span> },
    { id: 'links', label: 'Atalhos', grupo: 'Contagens', ordenavel: false, render: (c) => <Atalhos c={c} /> },
  ];
  // Para cada produto: a data de ativação dele + UMA COLUNA PARA CADA MÓDULO.
  // Assim dá para escolher "LinePBX › FOP2" sozinho, sem trazer os outros módulos junto.
  const porProduto: Coluna<ClientListItem>[] = produtos.flatMap((p) => {
    const cols: Coluna<ClientListItem>[] = [{
      id: `ativacao:${p.code}`, label: `${p.name} — ativado em`, labelCurto: p.name, grupo: 'Ativado em (por produto)',
      render: (c) => { const s = c.products.find((x) => x.code === p.code); return s ? <span className="tnum whitespace-nowrap">{data(s.activatedAt)}</span> : <span className="text-muted">—</span>; },
    }];
    for (const m of p.modules.filter((x) => x.active)) {
      cols.push({
        id: `modulo:${p.code}:${m.code}`,
        label: `${p.name} › ${m.name}`,
        labelCurto: m.name,
        grupo: `Módulos do ${p.name}`,
        render: (c) => {
          const s = c.products.find((x) => x.code === p.code);
          if (!s) return <span className="text-muted" title={`Não assina ${p.name}`}>—</span>;
          const ativo = s.modules.find((x) => x.code === m.code);
          if (!ativo) return <span className="text-muted">não</span>;
          return (
            <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ color: p.color }} title={`${m.name} ativo${ativo.activatedAt ? ` desde ${data(ativo.activatedAt)}` : ''}`}>
              <Check size={14} />{ativo.activatedAt ? <span className="tnum text-[12px] opacity-80">{data(ativo.activatedAt)}</span> : 'sim'}
            </span>
          );
        },
      });
    }
    return cols;
  });
  return [...fixas, ...porProduto];
}

/**
 * O atalho do cartão: **Abrir** leva ao endereço do servidor no navegador.
 * (O botão SSH saiu a pedido do Luan — decisão 0024.)
 */
function Atalhos({ c }: { c: ClientListItem }) {
  if (!c.links.web) return <span className="text-muted italic text-[12.5px]">servidor não configurado</span>;
  return (
    <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
      <a href={c.links.web} target="_blank" rel="noreferrer" className="btn-secondary btn-sm" title={c.links.web}><ExternalLink size={13} /> Abrir</a>
    </span>
  );
}

// ---------- Tela ----------

export function ClientesLista() {
  const [sp, setSp] = useSearchParams();
  useLembrarFiltros('/clientes'); // para o botão Voltar da ficha trazer estes filtros de volta
  const nav = useNavigate();
  const q = sp.get('q') ?? '';
  const produtos = sp.getAll('produtos');
  const modulos = sp.getAll('modulos');
  const mode = (sp.get('modo') ?? 'or') as 'or' | 'and';
  const arquivados = sp.get('arquivados') === '1';
  const view = sp.get('ver') ?? 'cards';
  // a lista de clientes não tem páginas (pedido do Luan, rodada 23): são poucas dezenas e ele quer ver todos de uma vez
  const [novo, setNovo] = useState(false);
  const colunasEscolhidas = useColunasEscolhidas(STORAGE, PADRAO);
  const o = useOrdenacao('tradeName');

  const numero = contarDe(1, TODOS);
  const set = (k: string, v: string | string[] | null) => { const n = new URLSearchParams(sp); n.delete(k); if (Array.isArray(v)) v.forEach((x) => n.append(k, x)); else if (v) n.set(k, v); setSp(n, { replace: true }); };

  const prods = useQuery({ queryKey: ['products'], queryFn: api.admin.products });
  const lista = useQuery({ queryKey: ['clients', q, produtos, modulos, mode, arquivados, o.ord, o.dir], queryFn: () => api.clients.list({ q, products: produtos, modules: modulos, mode, includeArchived: arquivados, page: 1, pageSize: TODOS, sort: o.ord, dir: o.dir }) });
  const colunas = useMemo(() => montarColunas(prods.data?.filter((p) => p.active) ?? []), [prods.data]);
  const visiveis = colunas.filter((c) => colunasEscolhidas.ids.includes(c.id));
  const ativos = prods.data?.filter((p) => p.active) ?? [];
  /** As opções dos dois botões de filtro. */
  const gruposProdutos: GrupoFiltro[] = [{ opcoes: ativos.map((p) => ({ key: p.code, label: p.name, cor: p.color, dica: p.description ?? undefined })) }];
  const gruposModulos: GrupoFiltro[] = ativos
    .filter((p) => p.modules.some((m) => m.active))
    .map((p) => ({ titulo: p.name, cor: p.color, opcoes: p.modules.filter((m) => m.active).map((m) => ({ key: `${p.code}:${m.code}`, label: m.name, dica: m.description ?? undefined })) }));

  /** O que está filtrado agora, em chips — clicar tira o filtro. */
  const escolhidos = [
    ...produtos.map((code) => { const p = ativos.find((x) => x.code === code); return { key: code, tipo: 'produtos' as const, label: p?.name ?? code, cor: p?.color }; }),
    ...modulos.map((k) => {
      const [pc, mc] = k.split(':');
      const p = ativos.find((x) => x.code === pc);
      const m = p?.modules.find((x) => x.code === mc);
      return { key: k, tipo: 'modulos' as const, label: m ? `${p!.name} › ${m.name}` : k, cor: p?.color };
    }),
  ];
  const tirar = (e: (typeof escolhidos)[number]) => set(e.tipo, (e.tipo === 'produtos' ? produtos : modulos).filter((x) => x !== e.key));

  return (
    <Pagina titulo="Clientes" sub={lista.data ? `${lista.data.total} cliente(s)` : ' '} acoes={<Can permission="records.write"><button className="btn-primary" onClick={() => setNovo(true)}><Plus size={16} /> Novo cliente</button></Can>}>
      <div className="card p-3 mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input max-w-xs" placeholder="Buscar por nome ou CNPJ" value={q} onChange={(e) => set('q', e.target.value)} />
          <FiltroEmBotao icone={Package} nome="Produtos" grupos={gruposProdutos} escolhidos={produtos} onChange={(v) => set('produtos', v)} />
          <FiltroEmBotao icone={Puzzle} nome="Módulos" grupos={gruposModulos} escolhidos={modulos} onChange={(v) => set('modulos', v)} />
          {escolhidos.length > 1 && (
            <select className="input w-auto" value={mode} onChange={(e) => set('modo', e.target.value)} title="Como combinar os filtros escolhidos">
              <option value="or">tem qualquer um</option>
              <option value="and">tem todos</option>
            </select>
          )}
          <div className="ml-auto flex items-center gap-3">
            <Toggle checked={arquivados} onChange={(v) => set('arquivados', v ? '1' : null)} label="arquivados" />
            {view === 'tabela' && <SeletorColunas colunas={colunas} escolha={colunasEscolhidas} />}
            <div className="flex rounded-lg border border-line overflow-hidden">
              <button className={`px-2 py-1.5 ${view === 'cards' ? 'bg-accent-soft text-accent-ink' : 'text-muted'}`} onClick={() => set('ver', null)} title="Cards"><LayoutGrid size={16} /></button>
              <button className={`px-2 py-1.5 ${view === 'tabela' ? 'bg-accent-soft text-accent-ink' : 'text-muted'}`} onClick={() => set('ver', 'tabela')} title="Tabela"><List size={16} /></button>
            </div>
          </div>
        </div>
        {escolhidos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[12.5px]">
            <span className="text-muted mr-1">filtrando por:</span>
            {escolhidos.map((e) => (
              <button key={e.tipo + e.key} onClick={() => tirar(e)} className="chip border border-transparent" style={e.cor ? { background: e.cor + '22', color: e.cor } : undefined} title="clique para tirar este filtro">{e.label} ×</button>
            ))}
            <button className="btn-ghost btn-sm text-muted" onClick={() => { const n = new URLSearchParams(sp); n.delete('produtos'); n.delete('modulos'); setSp(n, { replace: true }); }}>limpar tudo</button>
          </div>
        )}
      </div>

      {lista.isLoading ? <Carregando /> : !lista.data?.items.length ? (
        <Vazio titulo="Nenhum cliente encontrado" texto={q || produtos.length || modulos.length ? 'Tente outra busca ou limpe os filtros.' : 'Cadastre o primeiro cliente para começar.'} acao={<Can permission="records.write"><button className="btn-primary" onClick={() => setNovo(true)}><Plus size={16} /> Novo cliente</button></Can>} />
      ) : view === 'tabela' ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><ThN />{visiveis.map((c) => (c.ordenavel === false
              ? <th key={c.id} className={c.align === 'right' ? 'text-right' : ''}>{c.label}</th>
              : <Th key={c.id} o={o} col={c.id} align={c.align}>{c.label}</Th>))}</tr></thead>
            <tbody>
              {lista.data.items.map((c, i) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => nav(`/clientes/${c.id}`)}>
                  <TdN n={numero(i)} />
                  {visiveis.map((col) => <td key={col.id} className={col.align === 'right' ? 'text-right' : ''}>{col.render(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {!visiveis.length && <div className="p-4 text-sm text-muted">Nenhuma coluna escolhida — use o botão "Colunas".</div>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.data.items.map((c) => (
            <Link key={c.id} to={`/clientes/${c.id}`} className="card p-4 hover:border-accent transition-colors flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <LogoCliente src={logoSrc(c.logoUrl)} nome={c.tradeName} tamanho={44} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{c.tradeName} {c.archived && <Chip tone="muted">arquivado</Chip>}</div>
                  <div className="text-muted text-[12.5px] truncate">{c.legalName}</div>
                  {/* os produtos em miniatura: só os nomes, na cor de cada um, sem fundo nem moldura */}
                  {c.products.length > 0 && (
                    <div className="text-[11px] leading-[1.5] mt-1 flex flex-wrap gap-x-1.5" title={c.products.map((p) => p.name).join(' · ')}>
                      {c.products.map((p, i) => (
                        <span key={p.code} style={{ color: p.color }} className="font-medium whitespace-nowrap">
                          {p.name}{i < c.products.length - 1 && <span className="text-line-strong ml-1.5" aria-hidden>·</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[12.5px] mt-auto">
                <Atalhos c={c} />
                <span className="ml-auto text-muted tnum">{c.didCount} DIDs · {c.deviceCount} aparelhos</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <ClienteForm open={novo} onClose={() => setNovo(false)} onSaved={(c) => { setNovo(false); nav(`/clientes/${c.id}`); }} />
    </Pagina>
  );
}
