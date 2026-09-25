/** Administração: Usuários · Papéis · Catálogos · Produtos · Ajustes · Auditoria · Lixeira. */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { api } from '../../api/index.js';
import type { Product, ProductModule, Role, User } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { useAuth } from '../../lib/auth.js';
import { Campo, Carregando, Chip, classeAba, Confirmar, FAIXA_ABAS, Modal, Paginacao, Spinner, TODOS, Toggle, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { data, relativo } from '../../lib/format.js';
import { ordenarLista, Th, useOrdenacao, useOrdenacaoLocal } from '../../lib/ordenacao.js';
import { Ajustes } from './Ajustes.js';
import { Novidades } from './Novidades.js';
import { contar, contarDe, TdN, ThN } from '../../lib/contagem.js';

export function Admin() {
  const { can } = useAuth();
  const links = [
    ...(can('admin.manage') ? [{ to: 'usuarios', label: 'Usuários' }, { to: 'papeis', label: 'Papéis' }, { to: 'catalogos', label: 'Catálogos' }, { to: 'produtos', label: 'Produtos' }, { to: 'novidades', label: 'Novidades' }, { to: 'ajustes', label: 'Ajustes' }] : []),
    ...(can('audit.read') ? [{ to: 'auditoria', label: 'Auditoria' }] : []),
    ...(can('records.delete') ? [{ to: 'lixeira', label: 'Lixeira' }] : []),
  ];
  return (
    <Pagina titulo="Administração">
      <div className={FAIXA_ABAS}>{links.map((l) => <NavLink key={l.to} to={l.to} className={({ isActive }) => classeAba(isActive)}>{l.label}</NavLink>)}</div>
      <Routes>
        <Route index element={<Navigate to={links[0]?.to ?? '/'} replace />} />
        <Route path="usuarios" element={<Usuarios />} /><Route path="papeis" element={<Papeis />} /><Route path="catalogos" element={<Catalogos />} /><Route path="produtos" element={<Produtos />} /><Route path="novidades" element={<Novidades />} /><Route path="ajustes" element={<Ajustes />} /><Route path="auditoria" element={<Auditoria />} /><Route path="lixeira" element={<Lixeira />} />
      </Routes>
    </Pagina>
  );
}

function Usuarios() {
  const q = useQuery({ queryKey: ['users'], queryFn: api.admin.users }); const roles = useQuery({ queryKey: ['roles'], queryFn: api.admin.roles });
  const o = useOrdenacaoLocal('name');
  const [edit, setEdit] = useState<User | null | 'novo'>(null); const [f, setF] = useState<Record<string, any>>({}); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (edit === 'novo') setF({ name: '', email: '', password: '', roleId: roles.data?.[0]?.id ?? '', active: true }); else if (edit) setF({ name: edit.name, email: edit.email, password: '', roleId: edit.roleId, active: edit.active }); setErr(''); }, [edit, roles.data]);
  const save = async () => { setBusy(true); setErr(''); try { const body = { ...f, password: f.password || undefined }; if (edit === 'novo') await api.admin.createUser({ ...body, password: f.password }); else await api.admin.updateUser((edit as User).id, body); await qc.invalidateQueries({ queryKey: ['users'] }); toast.push('ok', 'Usuário salvo'); setEdit(null); } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); } };
  if (q.isLoading) return <Carregando />;
  return (
    <div>
      <div className="flex justify-end mb-3"><button className="btn-primary btn-sm" onClick={() => setEdit('novo')}><Plus size={14} /> Novo usuário</button></div>
      <div className="card overflow-x-auto"><table className="table"><thead><tr><ThN /><Th o={o} col="name">Nome</Th><Th o={o} col="email">E-mail</Th><Th o={o} col="roleName">Papel</Th><Th o={o} col="active">Situação</Th><Th o={o} col="lastLoginAt">Último acesso</Th><th /></tr></thead>
        <tbody>{ordenarLista(q.data ?? [], o, { name: (u) => u.name, email: (u) => u.email, roleName: (u) => u.roleName, active: (u) => (u.active ? 1 : 0), lastLoginAt: (u) => u.lastLoginAt }).map((u, i) => <tr key={u.id}><TdN n={contar(i)} /><td className="font-medium">{u.name}</td><td className="text-ink-2">{u.email}</td><td><Chip tone="accent">{u.roleName}</Chip></td><td>{u.active ? <Chip tone="ok">ativo</Chip> : <Chip tone="muted">desativado</Chip>}</td><td className="text-muted">{u.lastLoginAt ? relativo(u.lastLoginAt) : 'nunca'}</td><td className="text-right"><button className="btn-ghost btn-sm" onClick={() => setEdit(u)}>Editar</button></td></tr>)}</tbody></table></div>
      <Modal open={!!edit} onClose={() => setEdit(null)} titulo={edit === 'novo' ? 'Novo usuário' : 'Editar usuário'} rodape={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primary" disabled={busy || !f.name || !f.email || (edit === 'novo' && (f.password?.length ?? 0) < 10)} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
        <div className="flex flex-col gap-3">
          <Campo label="Nome"><input className="input" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Campo>
          <Campo label="E-mail"><input className="input" type="email" value={f.email ?? ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
          <Campo label={edit === 'novo' ? 'Senha inicial' : 'Nova senha'} dica={edit === 'novo' ? 'mínimo 10 caracteres' : 'deixe vazio para não trocar'}><input className="input" type="password" autoComplete="new-password" value={f.password ?? ''} onChange={(e) => setF({ ...f, password: e.target.value })} /></Campo>
          <Campo label="Papel"><select className="input" value={f.roleId ?? ''} onChange={(e) => setF({ ...f, roleId: e.target.value })}>{roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.description}</option>)}</select></Campo>
          {edit !== 'novo' && <Toggle checked={!!f.active} onChange={(v) => setF({ ...f, active: v })} label="Ativo (desativado não consegue entrar)" />}
          {err && <div className="text-bad text-sm">{err}</div>}
        </div>
      </Modal>
    </div>
  );
}

function Papeis() {
  const roles = useQuery({ queryKey: ['roles'], queryFn: api.admin.roles }); const perms = useQuery({ queryKey: ['permissions'], queryFn: api.admin.permissions });
  const [edit, setEdit] = useState<Role | 'novo' | null>(null); const [f, setF] = useState<{ name: string; description: string; permissions: string[] }>({ name: '', description: '', permissions: [] }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (edit === 'novo') setF({ name: '', description: '', permissions: ['records.read'] }); else if (edit) setF({ name: edit.name, description: edit.description ?? '', permissions: [...edit.permissions] }); setErr(''); }, [edit]);
  const save = async () => { setBusy(true); setErr(''); try { if (edit === 'novo') await api.admin.createRole(f); else await api.admin.updateRole((edit as Role).id, f); await qc.invalidateQueries({ queryKey: ['roles'] }); toast.push('ok', 'Papel salvo'); setEdit(null); } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); } };
  const remove = async (r: Role) => { try { await api.admin.removeRole(r.id); await qc.invalidateQueries({ queryKey: ['roles'] }); toast.push('ok', 'Papel apagado'); } catch (e) { toast.push('erro', mensagemErro(e)); } };
  if (roles.isLoading || perms.isLoading) return <Carregando />;
  return (
    <div>
      <p className="text-sm text-muted mb-3">Um papel é uma lista de permissões. Os quatro do sistema não podem ser apagados; você pode criar outros marcando caixinhas.</p>
      <div className="flex justify-end mb-3"><button className="btn-primary btn-sm" onClick={() => setEdit('novo')}><Plus size={14} /> Novo papel</button></div>
      <div className="card overflow-x-auto"><table className="table"><thead><tr><ThN /><th>Papel</th>{perms.data?.map((p) => <th key={p.key} className="text-center text-[10.5px] font-normal leading-tight max-w-[80px]" title={p.label}>{p.label.split(' ').slice(0, 3).join(' ')}</th>)}<th /></tr></thead>
        <tbody>{roles.data?.map((r, i) => <tr key={r.id}><TdN n={contar(i)} /><td><div className="font-medium">{r.name} {r.isSystem && <Chip tone="muted">sistema</Chip>}</div><div className="text-[12px] text-muted">{r.userCount} usuário(s)</div></td>{perms.data?.map((p) => <td key={p.key} className="text-center">{r.permissions.includes(p.key) ? <span className="inline-block w-3 h-3 rounded-full bg-ok" /> : <span className="inline-block w-3 h-3 rounded-full border border-line-strong" />}</td>)}<td className="text-right whitespace-nowrap"><button className="btn-ghost btn-sm" onClick={() => setEdit(r)}>Editar</button>{!r.isSystem && <button className="btn-ghost btn-sm text-bad" onClick={() => remove(r)}>Apagar</button>}</td></tr>)}</tbody></table></div>
      <Modal open={!!edit} onClose={() => setEdit(null)} titulo={edit === 'novo' ? 'Novo papel' : `Editar ${(edit as Role)?.name}`} rodape={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primary" disabled={busy || !f.name} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
        <div className="flex flex-col gap-3">
          <Campo label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!!edit && edit !== 'novo' && edit.isSystem} /></Campo>
          <Campo label="Descrição"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Campo>
          <div className="flex items-center justify-between">
            <span className="eyebrow">Permissões</span>
            <span className="flex gap-1">
              <button className="btn-ghost btn-sm" onClick={() => setF({ ...f, permissions: (perms.data ?? []).map((p) => p.key) })}>tudo</button>
              <button className="btn-ghost btn-sm" onClick={() => setF({ ...f, permissions: [] })}>nada</button>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">{perms.data?.map((p) => <label key={p.key} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.permissions.includes(p.key)} disabled={!!edit && edit !== 'novo' && edit.key === 'administrador'} onChange={(e) => setF({ ...f, permissions: e.target.checked ? [...f.permissions, p.key] : f.permissions.filter((x) => x !== p.key) })} /><span>{p.label} <span className="font-mono text-[11px] text-muted">{p.key}</span></span></label>)}</div>
          {err && <div className="text-bad text-sm">{err}</div>}
        </div>
      </Modal>
    </div>
  );
}

function Catalogos() {
  const tipos = [{ id: 'carriers', nome: 'Operadoras' }, { id: 'hostings', nome: 'Hospedagens' }, { id: 'categories', nome: 'Categorias de aparelho' }];
  const qc = useQueryClient(); const toast = useToast();
  const [novo, setNovo] = useState<Record<string, string>>({});
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {tipos.map((t) => <Catalogo key={t.id} tipo={t.id} nome={t.nome} novo={novo[t.id] ?? ''} setNovo={(v) => setNovo({ ...novo, [t.id]: v })} onAdd={async () => { try { await api.admin.createCatalogItem(t.id, novo[t.id]!); setNovo({ ...novo, [t.id]: '' }); await qc.invalidateQueries({ queryKey: ['catalog', t.id] }); toast.push('ok', 'Adicionado'); } catch (e) { toast.push('erro', mensagemErro(e)); } }} />)}
    </div>
  );
}
function Catalogo({ tipo, nome, novo, setNovo, onAdd }: { tipo: string; nome: string; novo: string; setNovo: (v: string) => void; onAdd: () => void }) {
  const q = useQuery({ queryKey: ['catalog', tipo], queryFn: () => api.admin.catalog(tipo) }); const qc = useQueryClient(); const toast = useToast();
  // renomear em linha: o lápis abre o campo no lugar do nome; Enter ou ✓ salva, Esc ou ✕ desiste
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const salvar = async () => {
    if (!editando || !editando.nome.trim()) return;
    setBusy(true);
    try { await api.admin.updateCatalogItem(tipo, editando.id, { name: editando.nome.trim() }); setEditando(null); await qc.invalidateQueries({ queryKey: ['catalog', tipo] }); toast.push('ok', 'Renomeado'); }
    catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <div className="card p-4"><div className="font-display font-semibold mb-2">{nome}</div>
      <ul className="flex flex-col gap-1 mb-3">{q.data?.map((i) => (
        <li key={i.id} className="flex items-center justify-between gap-2 text-sm group">
          {editando?.id === i.id ? (
            <span className="flex items-center gap-1 flex-1 min-w-0">
              <input className="input py-1 text-sm" autoComplete="off" value={editando.nome} onChange={(e) => setEditando({ id: i.id, nome: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void salvar(); if (e.key === 'Escape') setEditando(null); }} autoFocus aria-label={`Novo nome de ${i.name}`} />
              <button className="btn-ghost btn-sm" disabled={busy || !editando.nome.trim()} onClick={salvar} title="Salvar" aria-label="Salvar nome"><Check size={14} /></button>
              <button className="btn-ghost btn-sm text-muted" onClick={() => setEditando(null)} title="Cancelar" aria-label="Cancelar"><X size={14} /></button>
            </span>
          ) : (
            <span className="flex items-center gap-1 min-w-0">
              <span className={`truncate ${i.active ? '' : 'text-muted line-through'}`}>{i.name}</span>
              <button className="btn-ghost btn-sm text-muted opacity-60 group-hover:opacity-100" onClick={() => setEditando({ id: i.id, nome: i.name })} title={`Renomear ${i.name}`} aria-label={`Renomear ${i.name}`}><Pencil size={12} /></button>
            </span>
          )}
          <Toggle checked={i.active} onChange={async (v) => { await api.admin.updateCatalogItem(tipo, i.id, { active: v }); await qc.invalidateQueries({ queryKey: ['catalog', tipo] }); }} />
        </li>
      ))}</ul>
      <div className="flex gap-2"><input className="input" placeholder="novo item" autoComplete="off" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && novo && onAdd()} /><button className="btn-secondary btn-sm" disabled={!novo} onClick={onAdd}>Adicionar</button></div>
      <p className="text-[12px] text-muted mt-2">Renomear vale para todo lugar que usa o item (clientes, circuitos, modelos).</p>
    </div>
  );
}

/**
 * Produtos e, dentro de cada um, seus módulos (Omniboard, FOP2, NPS…).
 * Aqui se cria produto novo, módulo novo, e se exclui produto (vai para a lixeira).
 */
function Produtos() {
  const q = useQuery({ queryKey: ['products'], queryFn: api.admin.products }); const qc = useQueryClient(); const toast = useToast();
  const [novoModulo, setNovoModulo] = useState<Product | null>(null);
  const [novoProduto, setNovoProduto] = useState(false);
  const [excluir, setExcluir] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const doExcluir = async () => {
    if (!excluir) return;
    setBusy(true);
    try {
      await api.admin.removeProduct(excluir.id);
      await Promise.all(['products', 'clients', 'client', 'trash', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast.push('ok', `${excluir.name} foi para a lixeira`); setExcluir(null);
    } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); }
  };
  const upd = async (id: string, d: Record<string, unknown>) => { try { await api.admin.updateProduct(id, d); await qc.invalidateQueries({ queryKey: ['products'] }); } catch (e) { toast.push('erro', mensagemErro(e)); } };
  const updModulo = async (p: Product, m: ProductModule, d: Record<string, unknown>) => { try { await api.admin.upsertModule(p.id, { code: m.code, name: m.name, ...d }); await qc.invalidateQueries({ queryKey: ['products'] }); } catch (e) { toast.push('erro', mensagemErro(e)); } };
  if (q.isLoading) return <Carregando />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <p className="text-sm text-muted flex-1 min-w-[260px]">Um <b>produto</b> é o que o cliente assina. Um <b>módulo</b> é uma parte opcional dentro do produto (FOP2 e Omniboard dentro do LinePBX; Dashboard de filas dentro do LineChat). Desativar esconde das telas sem apagar histórico; excluir manda para a lixeira.</p>
        <button className="btn-primary btn-sm" onClick={() => setNovoProduto(true)}><Plus size={14} /> Novo produto</button>
      </div>
      {q.data?.map((p) => (
        <div key={p.id} className="card">
          <div className="p-3 flex flex-wrap items-center gap-3 border-b border-line">
            <Chip color={p.color}>{p.name}</Chip>
            <span className="font-mono text-muted text-[12.5px]">{p.code}</span>
            <span className="text-ink-2 text-[13px] flex-1 min-w-[200px]">{p.description}</span>
            <label className="flex items-center gap-1 text-[12.5px] text-muted">cor <input type="color" value={p.color} onChange={(e) => upd(p.id, { color: e.target.value })} className="w-8 h-6 border-0 bg-transparent cursor-pointer" /></label>
            {p.hasSettings && <span className="text-[12px] text-muted">config. própria</span>}
            {p.activeClients != null && <span className="text-[12px] text-muted tnum">{p.activeClients} cliente(s)</span>}
            <Toggle checked={p.active} onChange={(v) => upd(p.id, { active: v })} label="ativo" />
            {p.protegido
              ? <span className="text-[11.5px] text-muted" title="O sistema depende deste produto. Se não quiser vê-lo, desligue o ativo.">do sistema</span>
              : <button className="btn-ghost btn-sm text-bad" onClick={() => setExcluir(p)} aria-label={`Excluir ${p.name}`}>Excluir</button>}
          </div>
          <div className="p-3">
            <div className="flex items-center justify-between mb-2"><span className="eyebrow">Módulos</span><button className="btn-ghost btn-sm" onClick={() => setNovoModulo(p)}><Plus size={14} /> novo módulo</button></div>
            {p.modules.length === 0 ? <div className="text-muted text-[12.5px]">Este produto não tem módulos.</div> : (
              // no celular a tabela rola dentro do cartão, e não a página inteira para o lado
              <div className="overflow-x-auto"><table className="table"><thead><tr><ThN /><th>Módulo</th><th>Código</th><th>Descrição</th><th>Config. própria</th><th>Ativo</th></tr></thead>
                <tbody>{p.modules.map((m, i) => <tr key={m.id}><TdN n={contar(i)} /><td className="font-medium">{m.name}</td><td className="font-mono text-muted">{m.code}</td><td className="text-ink-2 text-[13px]">{m.description}</td><td>{m.hasSettings ? 'sim' : '—'}</td><td><Toggle checked={m.active} onChange={(v) => updModulo(p, m, { active: v })} /></td></tr>)}</tbody></table></div>
            )}
          </div>
        </div>
      ))}
      {novoModulo && <ModuloCatalogoForm product={novoModulo} onClose={() => setNovoModulo(null)} />}
      {novoProduto && <ProdutoCatalogoForm onClose={() => setNovoProduto(false)} />}
      <Confirmar open={!!excluir} onClose={() => setExcluir(null)} onConfirm={doExcluir} loading={busy} perigoso digitar={excluir && (excluir.activeClients ?? 0) > 0 ? excluir.name : undefined} titulo="Excluir produto" botao="Mandar para a lixeira"
        texto={<>O produto <b>{excluir?.name}</b> some das fichas, dos filtros e dos cartões.{(excluir?.activeClients ?? 0) > 0 && <> Hoje <b>{excluir?.activeClients} cliente(s)</b> assinam: as assinaturas ficam guardadas e voltam se você restaurar o produto.</>} Dá para restaurar em Administração → Lixeira.</>} />
    </div>
  );
}

/** Um produto novo no portfólio. O código sai do nome; a cor é a do chip nas telas. */
function ProdutoCatalogoForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ name: '', code: '', color: '#2457D6', description: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const code = f.code || f.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const save = async () => {
    setBusy(true); setErr('');
    try { await api.admin.createProduct({ name: f.name.trim(), code, color: f.color, description: f.description.trim() || null }); await qc.invalidateQueries({ queryKey: ['products'] }); toast.push('ok', `Produto ${f.name} criado`); onClose(); }
    catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} titulo="Novo produto" rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !f.name.trim() || !code} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Criar'}</button></>}>
      <div className="flex flex-col gap-3">
        <Campo label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder="ex.: LineBot" /></Campo>
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <Campo label="Código" dica="gerado do nome; só letras minúsculas, números e _"><input className="input font-mono" value={code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Campo>
          <Campo label="Cor"><input type="color" className="h-[38px] w-14 border border-line rounded-lg bg-transparent cursor-pointer" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Campo>
        </div>
        <Campo label="Descrição" dica="uma frase"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Campo>
        <div className="text-[12.5px] text-muted flex items-center gap-2">Vai aparecer assim: <Chip color={f.color}>{f.name || 'Produto'}</Chip></div>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}

function ModuloCatalogoForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ name: '', code: '', description: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const code = f.code || f.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const save = async () => {
    setBusy(true); setErr('');
    try { await api.admin.upsertModule(product.id, { name: f.name, code, description: f.description || null }); await qc.invalidateQueries({ queryKey: ['products'] }); toast.push('ok', `Módulo ${f.name} criado em ${product.name}`); onClose(); }
    catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} titulo={<span className="flex items-center gap-2">Novo módulo em <Chip color={product.color}>{product.name}</Chip></span>} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !f.name} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Criar'}</button></>}>
      <div className="flex flex-col gap-3">
        <Campo label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder="ex.: Gravação de chamadas" /></Campo>
        <Campo label="Código" dica="gerado do nome; só letras minúsculas, números e _"><input className="input font-mono" value={code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Campo>
        <Campo label="Descrição" dica="uma frase"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}

function Auditoria() {
  const [page, setPage] = useState(1); const [action, setAction] = useState(''); const [entityType, setEntityType] = useState(''); const [tudo, setTudo] = useState(false);
  const o = useOrdenacao('createdAt', 'desc');
  const q = useQuery({ queryKey: ['audit', page, tudo, action, entityType, o.ord, o.dir], queryFn: () => api.admin.audit({ page: tudo ? 1 : page, pageSize: tudo ? TODOS : 50, action, entityType, sort: o.ord, dir: o.dir }) });
  const acoes = ['create', 'update', 'delete', 'restore', 'bulk_update', 'bulk_create', 'bulk_delete', 'movement', 'reveal_secret', 'import', 'export', 'export_secrets', 'login', 'login_failed', 'subscribe', 'unsubscribe'];
  const numero = contarDe(tudo ? 1 : page, 50); // a contagem segue pela lista toda, não recomeça a cada página
  return (
    <div>
      <div className="card p-3 mb-3 flex flex-wrap gap-2">
        <select className="input w-auto" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">Todas as ações</option>{acoes.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select className="input w-auto" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}><option value="">Todos os tipos</option>{['client', 'subscription', 'product', 'circuit', 'did', 'device', 'deviceModel', 'deviceMovement', 'secret', 'user', 'role'].map((t) => <option key={t} value={t}>{t}</option>)}</select>
      </div>
      {q.isLoading ? <Carregando /> : !q.data?.items.length ? <Vazio titulo="Nada registrado" /> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><ThN /><Th o={o} col="createdAt">Quando</Th><Th o={o} col="action">Ação</Th><Th o={o} col="summary">O que aconteceu</Th><Th o={o} col="userName">Quem</Th></tr></thead>
          <tbody>{q.data.items.map((a, i) => (
            <tr key={a.id}>
              <TdN n={numero(i)} />
              <td className="text-muted tnum whitespace-nowrap">{data(a.createdAt, true)}</td>
              <td><Chip tone={/secret|delete|export_secrets/.test(a.action) ? 'signal' : 'neutral'}>{a.action}</Chip></td>
              <td>{a.summary}</td>
              <td className="text-muted whitespace-nowrap">{a.userName ?? 'sistema'}</td>
            </tr>))}</tbody></table></div>
      )}
      {q.data && <Paginacao page={page} pageSize={50} total={q.data.total} onChange={setPage} tudo={tudo} onTudo={(v) => { setTudo(v); setPage(1); }} />}
    </div>
  );
}

function Lixeira() {
  const q = useQuery({ queryKey: ['trash'], queryFn: api.admin.trash }); const qc = useQueryClient(); const toast = useToast();
  const nomes: Record<string, string> = { client: 'Cliente', circuit: 'Circuito', did: 'DID', deviceModel: 'Modelo', device: 'Aparelho', product: 'Produto', releaseNote: 'Novidades' };
  const o = useOrdenacaoLocal('deletedAt', 'desc');
  const restore = async (type: string, id: string) => { try { await api.admin.restore(type, id); await qc.invalidateQueries(); toast.push('ok', 'Restaurado'); } catch (e) { toast.push('erro', mensagemErro(e)); } };
  if (q.isLoading) return <Carregando />;
  if (!q.data?.length) return <Vazio titulo="Lixeira vazia" texto="Tudo que for excluído aparece aqui e pode ser restaurado." />;
  return <div className="card overflow-x-auto"><table className="table"><thead><tr><ThN /><Th o={o} col="type">Tipo</Th><Th o={o} col="label">Registro</Th><Th o={o} col="deletedAt">Excluído em</Th><th /></tr></thead><tbody>{ordenarLista(q.data, o, { type: (t) => nomes[t.type] ?? t.type, label: (t) => t.label, deletedAt: (t) => t.deletedAt }).map((t, i) => <tr key={t.type + t.id}><TdN n={contar(i)} /><td><Chip tone="neutral">{nomes[t.type] ?? t.type}</Chip></td><td className="font-medium">{t.label}</td><td className="text-muted tnum">{data(t.deletedAt, true)}</td><td className="text-right"><button className="btn-secondary btn-sm" onClick={() => restore(t.type, t.id)}>Restaurar</button></td></tr>)}</tbody></table></div>;
}
