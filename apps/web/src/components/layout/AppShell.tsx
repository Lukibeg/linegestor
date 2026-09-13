/**
 * A moldura de todas as telas: menu lateral (recolhível para só ícones), barra superior com busca global (Ctrl+K), usuário e tema.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Boxes, Building2, Cable, ChevronsLeft, ChevronsRight, LayoutDashboard, LogOut, Menu, Moon, Settings, Sun, Upload, UserRound, X } from 'lucide-react';
import { useAuth } from '../../lib/auth.js';
import { IS_DEMO } from '../../api/index.js';
import { Logotipo, Simbolo } from '../Marca.js';

const NAV = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, perm: 'records.read', end: true },
  { to: '/clientes', label: 'Clientes', icon: Building2, perm: 'records.read' },
  { to: '/circuitos', label: 'Circuitos e DIDs', icon: Cable, perm: 'records.read' },
  { to: '/inventario', label: 'Inventário', icon: Boxes, perm: 'records.read' },
  { to: '/dados', label: 'Importar / Exportar', icon: Upload, perm: ['data.import', 'data.export'] },
  { to: '/admin', label: 'Administração', icon: Settings, perm: ['admin.manage', 'audit.read', 'records.delete'] },
];

function useTheme() {
  const [theme, setTheme] = useState<string>(() => { try { return localStorage.getItem('gestor.theme') ?? 'system'; } catch { return 'system'; } });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    try { localStorage.setItem('gestor.theme', theme); } catch { /* sem storage */ }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}

/** O menu lateral lembra se está recolhido (só ícones) ou aberto, por navegador. */
function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => { try { return localStorage.getItem('gestor.menu') === 'recolhido'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('gestor.menu', collapsed ? 'recolhido' : 'aberto'); } catch { /* sem storage */ } }, [collapsed]);
  return { collapsed, toggle: () => setCollapsed((c) => !c) };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, can } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { collapsed, toggle: toggleSidebar } = useSidebar();

  const items = NAV.filter((n) => (Array.isArray(n.perm) ? n.perm.some(can) : can(n.perm)));
  // no celular o menu é sempre completo (abre por cima); no desktop pode ficar só com ícones
  const hide = collapsed ? 'md:hidden' : '';

  return (
    <div className="min-h-full flex">
      {/* menu lateral */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 ${collapsed ? 'md:w-16' : 'md:w-60'} bg-surface border-r border-line flex flex-col transition-[transform,width] duration-200 md:translate-x-0 md:sticky md:inset-y-auto md:top-0 md:h-screen ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className={`h-14 flex items-center gap-2 px-4 border-b border-line ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
          {/* no celular o menu é sempre largo, então mostra o logotipo inteiro */}
          {collapsed ? <><Logotipo altura={26} className="md:hidden" /><Simbolo tamanho={26} className="hidden md:block md:mx-auto" /></> : <Logotipo altura={26} />}
          {IS_DEMO && <span className={`chip bg-signal-soft text-signal ml-auto ${hide}`}>demo</span>}
          <button className="md:hidden ml-auto btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={16} /></button>
        </div>
        <nav className="p-2 flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} title={collapsed ? n.label : undefined}
              className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium ${collapsed ? 'md:justify-center md:px-0' : ''} ${isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
              <n.icon size={17} className="shrink-0" /> <span className={hide}>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink to="/conta" onClick={() => setOpen(false)} title={collapsed ? 'Minha conta' : undefined}
          className={({ isActive }) => `p-3 border-t border-line text-[12px] flex items-center gap-2 ${collapsed ? 'md:justify-center' : ''} ${isActive ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-surface-2'}`}>
          <UserRound size={16} className="shrink-0" />
          <span className={`min-w-0 ${hide}`}>
            <span className="font-semibold text-ink-2 truncate block">{user?.name}</span>
            <span className="truncate block">{user?.roleName}</span>
          </span>
        </NavLink>
        <button className="hidden md:flex items-center justify-center gap-2 h-10 border-t border-line text-muted hover:text-ink hover:bg-surface-2 text-[12px]" onClick={toggleSidebar} title={collapsed ? 'Expandir menu' : 'Recolher menu'} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
          {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Recolher menu</>}
        </button>
      </aside>
      {open && <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setOpen(false)} />}

      {/* conteúdo */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 sticky top-0 z-20 bg-bg backdrop-blur border-b border-line flex items-center gap-2 px-4">
          <button className="md:hidden btn-ghost btn-sm" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={18} /></button>
          <div className="ml-auto flex items-center gap-1">
            {collapsed && <span className="hidden md:inline text-[12px] text-muted mr-1">{user?.name}</span>}
            <button className="btn-ghost btn-sm" onClick={toggle} title="Tema claro/escuro">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button className="btn-ghost btn-sm" onClick={async () => { await logout(); nav('/entrar'); }} title="Sair"><LogOut size={16} /></button>
          </div>
        </header>
        <main className="flex-1 px-4 md:px-6 py-5 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

export function Pagina({ titulo, sub, acoes, children }: { titulo: ReactNode; sub?: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-xl font-semibold">{titulo}</h1>
          {sub && <div className="text-muted text-sm mt-0.5">{sub}</div>}
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
      {children}
    </div>
  );
}
