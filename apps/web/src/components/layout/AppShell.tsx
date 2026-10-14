/**
 * A moldura de todas as telas: o menu lateral (recolhível para só ícones) e o conteúdo.
 *
 * No computador não há barra em cima (2.0, o pedido do Luan: "acabamos perdendo espaço"): o
 * sininho dos chamados, o tema e o Sair ficam no rodapé do menu, ao lado da conta. No celular a barra
 * de cima continua, porque é onde fica o botão que abre o menu (e o sininho, à mão). O aviso que chega
 * aparece num cartão perto do sininho (e na notificação do navegador, para quem ligou).
 *
 * O menu tem grupos (2.0, o pedido do Luan: "está ficando muitas abas laterais"): **Suporte** (os
 * Chamados, os Projetos e os Relatórios, que abrem nos tickets do LineChat, na aba Hoje) e **Base de
 * conhecimento** (a interna e a dos clientes); o Importar / Exportar foi para dentro da Administração. O
 * grupo da tela aberta abre sozinho e cada um abre e fecha com um clique (o navegador lembra). Com o menu
 * recolhido, o ícone do grupo abre a lista dele do lado.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom';
import {
  BookLock, BookUser, Boxes, Building2, Cable, ChartColumn, ChevronDown, ChevronsLeft, ChevronsRight, Headset, LayoutDashboard, Library, ListChecks, LogOut,
  Menu, Moon, Settings, Sparkles, Sun, Ticket, UserRound, X, type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/index.js';
import { NovidadesPopup } from '../../pages/novidades/Index.js';
import { SinoDeAvisos } from '../../pages/atendimento/Sino.js';
import { AvisosQueChegam } from '../../pages/atendimento/AvisosQueChegam.js';
import { useAuth } from '../../lib/auth.js';
import { IS_DEMO } from '../../api/index.js';
import { Logotipo, Simbolo } from '../Marca.js';

/** Um item do menu; `conta` põe o número do lado (as novidades não lidas, a leitura obrigatória da base). */
type ItemDoMenu = { to: string; label: string; icon: LucideIcon; perm: string | string[]; end?: boolean; conta?: 'novidades' | 'leituras' };
/** Um grupo do menu: abre e fecha, com os itens dentro. */
type GrupoDoMenu = { grupo: string; label: string; icon: LucideIcon; itens: ItemDoMenu[] };
const ehGrupo = (x: ItemDoMenu | GrupoDoMenu): x is GrupoDoMenu => 'grupo' in x;

const NAV: Array<ItemDoMenu | GrupoDoMenu> = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, perm: 'records.read', end: true },
  { to: '/clientes', label: 'Clientes', icon: Building2, perm: 'records.read' },
  { to: '/circuitos', label: 'Circuitos e DIDs', icon: Cable, perm: 'records.read' },
  { to: '/inventario', label: 'Inventário', icon: Boxes, perm: 'records.read' },
  // o suporte: os chamados do Gestor (2.0), os projetos (as tarefas que percorrem vários clientes) e os
  // Relatórios. O Relatórios abre nos tickets do LineChat (a cópia de leitura, 1.3), na aba Hoje; dali as abas
  // levam ao Período e aos 20 relatórios (1.7), e o item fica marcado nas duas telas. (13/10, os pedidos do
  // Luan: "não precisa ter tickets do LineChat, apenas relatórios" e, dos Projetos, "pode ficar dentro de
  // suporte também")
  {
    grupo: 'suporte', label: 'Suporte', icon: Headset, itens: [
      { to: '/atendimento', label: 'Chamados', icon: Ticket, perm: 'support.read' },
      { to: '/projetos', label: 'Projetos', icon: ListChecks, perm: 'records.read' },
      { to: '/chamados', label: 'Relatórios', icon: ChartColumn, perm: 'support.read' },
    ],
  },
  // a base: a interna (o que a equipe aprendeu, 1.8) e a dos clientes (o portal: os tutoriais e quem entra, 1.8)
  {
    grupo: 'base', label: 'Base de conhecimento', icon: Library, itens: [
      { to: '/base', label: 'Base interna', icon: BookLock, perm: 'records.read', conta: 'leituras' },
      { to: '/portal-do-cliente', label: 'Base dos clientes', icon: BookUser, perm: 'records.read' },
    ],
  },
  // logo abaixo: o "o que mudou" de cada publicação
  { to: '/novidades', label: 'Novidades', icon: Sparkles, perm: 'records.read', conta: 'novidades' },
  // as configurações (com o Importar / Exportar dentro, desde o 2.0)
  { to: '/admin', label: 'Administração', icon: Settings, perm: ['admin.manage', 'audit.read', 'records.delete', 'data.import', 'data.export'] },
];

/** O item está aberto na tela? (as mesmas regras do NavLink) */
const ehAtivo = (i: ItemDoMenu, pathname: string) => !!matchPath({ path: i.to, end: !!i.end }, pathname);

/** Os grupos abertos, lembrados por navegador. O grupo da tela aberta abre sozinho (e fica até a pessoa fechar). */
function useGruposAbertos(grupos: GrupoDoMenu[], pathname: string) {
  const CHAVE = 'gestor.menu.grupos';
  const [abertos, setAbertos] = useState<string[]>(() => {
    try { const v: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
  });
  const doAtivo = grupos.find((g) => g.itens.some((i) => ehAtivo(i, pathname)))?.grupo;
  useEffect(() => { if (doAtivo) setAbertos((a) => (a.includes(doAtivo) ? a : [...a, doAtivo])); }, [doAtivo]);
  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(abertos)); } catch { /* sem storage */ } }, [abertos]);
  return { abertos, alternar: (g: string) => setAbertos((a) => (a.includes(g) ? a.filter((x) => x !== g) : [...a, g])) };
}

/** O número do lado do item. */
function Contador({ n, tom, titulo }: { n: number; tom: 'accent' | 'signal'; titulo: string }) {
  if (n <= 0) return null;
  return (
    <span className={`tnum text-[11px] font-semibold rounded-full text-white px-1.5 py-0.5 leading-none ${tom === 'signal' ? 'bg-signal' : 'bg-accent'}`} title={titulo}>{n}</span>
  );
}

/** O número no canto do ícone (como no sininho): no grupo fechado e no menu recolhido. `mostrar`: as classes de quando aparece. */
function NumeroNoIcone({ n, tom, titulo, mostrar = 'flex' }: { n: number; tom: 'accent' | 'signal'; titulo: string; mostrar?: string }) {
  return (
    <span className={`absolute -top-1.5 -right-2 tnum text-[10px] font-semibold rounded-full text-white min-w-4 h-4 px-1 items-center justify-center ${tom === 'signal' ? 'bg-signal' : 'bg-accent'} ${mostrar}`} title={titulo}>{n}</span>
  );
}

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

  const pode = (i: ItemDoMenu) => (Array.isArray(i.perm) ? i.perm.some(can) : can(i.perm));
  // os grupos ficam com os itens que a pessoa pode ver (e somem sem nenhum)
  const items = NAV.flatMap((n): Array<ItemDoMenu | GrupoDoMenu> => {
    if (!ehGrupo(n)) return pode(n) ? [n] : [];
    const itens = n.itens.filter(pode);
    return itens.length ? [{ ...n, itens }] : [];
  });
  const { pathname } = useLocation();
  const { abertos, alternar } = useGruposAbertos(items.filter(ehGrupo), pathname);
  const sair = async () => { await logout(); nav('/entrar'); };
  // nos chamados, a tela usa a largura toda e a margem é menor: o quadro e a ficha precisam de lugar
  const largo = pathname.startsWith('/atendimento');
  const temSino = can('support.read');
  // o número no menu: quantas notas de novidade esta pessoa ainda não leu
  const novidades = useQuery({ queryKey: ['novidades'], queryFn: () => api.novidades.lista(), enabled: !!user, staleTime: 5 * 60_000 });
  const naoLidas = novidades.data?.naoLidas ?? 0;
  // e quantos artigos de leitura obrigatória ela ainda não leu
  const pendentes = useQuery({ queryKey: ['base', 'pendentes'], queryFn: () => api.base.pendentes(), enabled: !!user && can('records.read'), staleTime: 60_000 });
  const leituras = pendentes.data?.naoLidas ?? 0;
  // no celular o menu é sempre completo (abre por cima); no desktop pode ficar só com ícones
  const hide = collapsed ? 'md:hidden' : '';
  const contagem = (i: ItemDoMenu) => (i.conta === 'novidades'
    ? { n: naoLidas, tom: 'accent' as const, titulo: `${naoLidas} novidade(s) que você ainda não leu` }
    : i.conta === 'leituras' ? { n: leituras, tom: 'signal' as const, titulo: `${leituras} artigo(s) de leitura obrigatória que você ainda não leu` } : null);

  return (
    <div className="min-h-full flex">
      {/* menu lateral */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 ${collapsed ? 'md:w-16' : 'md:w-64'} bg-surface border-r border-line flex flex-col transition-[transform,width] duration-200 md:translate-x-0 md:sticky md:inset-y-auto md:top-0 md:h-screen ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className={`h-14 flex items-center gap-2 px-4 border-b border-line ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
          {/* no celular o menu é sempre largo, então mostra o logotipo inteiro */}
          {collapsed ? <><Logotipo altura={26} className="md:hidden" /><Simbolo tamanho={26} className="hidden md:block md:mx-auto" /></> : <Logotipo altura={26} />}
          {IS_DEMO && <span className={`chip bg-signal-soft text-signal ml-auto ${hide}`}>demo</span>}
          <button className="md:hidden ml-auto btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={16} /></button>
        </div>
        <nav className="p-2 flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto">
          {items.map((n) => (ehGrupo(n)
            ? <GrupoNoMenu key={n.grupo} g={n} aberto={abertos.includes(n.grupo)} alternar={() => alternar(n.grupo)} recolhido={collapsed} contagem={contagem} aoNavegar={() => setOpen(false)} />
            : <ItemNoMenu key={n.to} i={n} recolhido={collapsed} contagem={contagem} aoNavegar={() => setOpen(false)} />))}
        </nav>
        {/* o rodapé: a conta e, ao lado, o sininho, o tema e Sair (com o menu recolhido, um embaixo do outro) */}
        <div className={`border-t border-line p-2 flex items-center gap-0.5 ${collapsed ? 'md:flex-col md:px-0' : ''}`}>
          <NavLink to="/conta" onClick={() => setOpen(false)} title={collapsed ? `Minha conta (${user?.name ?? ''})` : 'Minha conta'}
            className={({ isActive }) => `flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[12px] flex items-center gap-2 ${collapsed ? 'md:flex-none md:justify-center md:w-10' : ''} ${isActive ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-surface-2'}`}>
            <UserRound size={16} className="shrink-0" />
            <span className={`min-w-0 ${hide}`}>
              <span className="font-semibold text-ink-2 truncate block">{user?.name}</span>
              <span className="truncate block">{user?.roleName}</span>
            </span>
          </NavLink>
          {/* no celular o sininho fica na barra de cima, sempre à vista */}
          {temSino && <div className="hidden md:block"><SinoDeAvisos lado={collapsed ? 'lado' : 'cima'} /></div>}
          <button className="btn-ghost btn-sm px-2" onClick={toggle} title="Tema claro/escuro" aria-label="Tema claro/escuro">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="btn-ghost btn-sm px-2" onClick={sair} title="Sair" aria-label="Sair"><LogOut size={16} /></button>
        </div>
        <button className="hidden md:flex items-center justify-center gap-2 h-10 border-t border-line text-muted hover:text-ink hover:bg-surface-2 text-[12px]" onClick={toggleSidebar} title={collapsed ? 'Expandir menu' : 'Recolher menu'} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
          {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Recolher menu</>}
        </button>
      </aside>
      {open && <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setOpen(false)} />}

      {/* conteúdo */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* só no celular: o botão do menu e o sininho (no computador, tudo isso está no menu lateral) */}
        <header className="md:hidden h-14 sticky top-0 z-20 bg-bg border-b border-line flex items-center gap-2 px-4">
          <button className="btn-ghost btn-sm" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={18} /></button>
          <Simbolo tamanho={22} />
          <div className="ml-auto flex items-center gap-1">
            {temSino && <SinoDeAvisos lado="baixo" />}
          </div>
        </header>
        <main className={`flex-1 px-4 py-5 w-full mx-auto ${largo ? 'md:px-4' : 'md:px-6 max-w-[1400px]'}`}>{children}</main>
      </div>
      {/* os avisos que chegam: o cartão sai do canto do sininho (no computador, ao lado do menu) */}
      {temSino && <AvisosQueChegam esquerda={collapsed ? 'calc(4rem + 12px)' : 'calc(16rem + 12px)'} />}
      {/* a nota mais recente abre uma vez por pessoa, em qualquer tela */}
      <NovidadesPopup />
    </div>
  );
}

type Contagem = (i: ItemDoMenu) => { n: number; tom: 'accent' | 'signal'; titulo: string } | null;

/** Um item do menu (no grupo, `dentro`: menor e recuado). */
function ItemNoMenu({ i, recolhido, contagem, aoNavegar, dentro = false }: { i: ItemDoMenu; recolhido: boolean; contagem: Contagem; aoNavegar: () => void; dentro?: boolean }) {
  const c = contagem(i);
  const hide = recolhido && !dentro ? 'md:hidden' : '';
  return (
    <NavLink to={i.to} end={i.end} onClick={aoNavegar} title={recolhido && !dentro ? i.label : undefined}
      className={({ isActive }) => `relative flex items-center rounded-lg font-medium ${dentro ? 'gap-2 px-2.5 py-1.5 text-[13.5px]' : 'gap-2.5 px-3 py-2 text-sm'} ${recolhido && !dentro ? 'md:justify-center md:px-0' : ''} ${isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
      {/* o número: do lado; com o menu recolhido, no canto do ícone, como nos grupos. Só existe quando há número:
          a caixa vazia entrava na fila e tirava o ícone do eixo (13/10, o Luan: "o Novidades ficou meio desalinhado") */}
      <span className="relative shrink-0">
        <i.icon size={dentro ? 15 : 17} />
        {c && c.n > 0 && recolhido && !dentro && <NumeroNoIcone n={c.n} tom={c.tom} titulo={c.titulo} mostrar="hidden md:flex" />}
      </span>
      <span className={`min-w-0 truncate ${hide}`}>{i.label}</span>
      {c && c.n > 0 && <span className={`ml-auto ${hide}`}><Contador n={c.n} tom={c.tom} titulo={c.titulo} /></span>}
    </NavLink>
  );
}

/**
 * Um grupo do menu: o nome abre e fecha a lista (recuada, com uma linha do lado). Fechado, ele fica
 * marcado quando a tela aberta é dele, e mostra a soma dos números de dentro. Com o menu recolhido
 * (no computador), o ícone abre a lista do lado — fora da rolagem do menu, para não ser cortada.
 */
function GrupoNoMenu({ g, aberto, alternar, recolhido, contagem, aoNavegar }: {
  g: GrupoDoMenu; aberto: boolean; alternar: () => void; recolhido: boolean; contagem: Contagem; aoNavegar: () => void;
}) {
  const { pathname } = useLocation();
  const ativo = g.itens.some((i) => ehAtivo(i, pathname));
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLElement>(null);
  const [aoLado, setAoLado] = useState<{ top: number; left: number } | null>(null);
  const soma = g.itens.reduce((t, i) => t + (contagem(i)?.n ?? 0), 0);
  const tomDaSoma = g.itens.some((i) => (contagem(i)?.n ?? 0) > 0 && contagem(i)?.tom === 'signal') ? 'signal' : 'accent';
  const hide = recolhido ? 'md:hidden' : '';

  // a lista do lado fecha ao navegar, com Esc, clicando fora, rolando ou mudando o tamanho da tela
  useEffect(() => { setAoLado(null); }, [pathname, recolhido]);
  useEffect(() => {
    if (!aoLado) return;
    const fora = (e: MouseEvent) => { if (!botao.current?.contains(e.target as Node) && !lista.current?.contains(e.target as Node)) setAoLado(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAoLado(null); botao.current?.focus(); } };
    const fechar = () => setAoLado(null);
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    window.addEventListener('resize', fechar); window.addEventListener('scroll', fechar, true);
    return () => {
      document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', fechar); window.removeEventListener('scroll', fechar, true);
    };
  }, [aoLado]);
  // a lista do lado não passa do pé da tela
  useLayoutEffect(() => {
    const el = lista.current;
    if (!aoLado || !el) return;
    const sobra = window.innerHeight - 8 - (aoLado.top + el.offsetHeight);
    if (sobra < 0) setAoLado({ ...aoLado, top: Math.max(8, aoLado.top + sobra) });
  }, [aoLado]);

  const clicar = () => {
    // recolhido só vale no computador: no celular o menu abre inteiro, e o grupo abre ali mesmo
    if (recolhido && window.matchMedia('(min-width: 768px)').matches) {
      const r = botao.current!.getBoundingClientRect();
      setAoLado((x) => (x ? null : { top: r.top, left: r.right + 8 }));
    } else alternar();
  };

  return (
    <div>
      <button ref={botao} type="button" onClick={clicar} aria-expanded={recolhido ? !!aoLado : aberto} title={recolhido ? g.label : undefined} data-grupo={g.grupo}
        className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium ${recolhido ? 'md:justify-center md:px-0' : ''} ${ativo && (!aberto || recolhido) ? 'bg-accent-soft text-accent-ink' : ativo ? 'text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
        {/* o número de dentro, no canto do ícone (como no sininho): com o grupo fechado, ou no menu recolhido */}
        <span className="relative shrink-0">
          <g.icon size={17} />
          {soma > 0 && (!aberto || recolhido) && (
            <NumeroNoIcone n={soma} tom={tomDaSoma} titulo={`${soma} para ver dentro de ${g.label}`} mostrar={aberto ? 'hidden md:flex' : 'flex'} />
          )}
        </span>
        <span className={`min-w-0 truncate ${hide}`}>{g.label}</span>
        <ChevronDown size={15} className={`ml-auto shrink-0 transition-transform ${aberto ? '' : '-rotate-90'} ${hide}`} aria-hidden />
      </button>
      {aberto && (
        <div className={`mt-0.5 mb-1 ml-[21px] pl-2 border-l border-line flex flex-col gap-0.5 ${hide}`}>
          {g.itens.map((i) => <ItemNoMenu key={i.to} i={i} recolhido={recolhido} contagem={contagem} aoNavegar={aoNavegar} dentro />)}
        </div>
      )}
      {aoLado && createPortal(
        <nav ref={lista} className="fixed z-50 card shadow-lg py-1.5 w-60" style={{ top: aoLado.top, left: aoLado.left, boxShadow: '0 10px 30px rgba(0,0,0,.18)' }} aria-label={g.label} data-lista-do-grupo={g.grupo}>
          <div className="eyebrow px-3 pt-0.5 pb-1">{g.label}</div>
          <div className="flex flex-col gap-0.5 px-1.5">
            {g.itens.map((i) => <ItemNoMenu key={i.to} i={i} recolhido={false} contagem={contagem} aoNavegar={aoNavegar} dentro />)}
          </div>
        </nav>,
        document.body,
      )}
    </div>
  );
}

export function Pagina({ titulo, sub, acoes, voltar, children }: { titulo: ReactNode; sub?: ReactNode; acoes?: ReactNode; voltar?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          {voltar && <div className="mb-1.5">{voltar}</div>}
          <h1 className="font-display text-xl font-semibold">{titulo}</h1>
          {sub && <div className="text-muted text-sm mt-0.5">{sub}</div>}
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
      {children}
    </div>
  );
}
