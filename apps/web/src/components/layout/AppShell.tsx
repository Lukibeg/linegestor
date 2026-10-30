/**
 * A moldura de todas as telas: o menu lateral (recolhível para só ícones) e o conteúdo.
 *
 * No computador não há barra em cima (2.0, o pedido do Luan: "acabamos perdendo espaço"): o
 * sininho dos chamados, o tema e o Sair ficam no rodapé do menu, ao lado da conta. No celular a barra
 * de cima continua, porque é onde fica o botão que abre o menu (e o sininho, à mão). O aviso que chega
 * aparece num cartão perto do sininho (e na notificação do navegador, para quem ligou).
 *
 * O menu tem grupos (2.0, o pedido do Luan: "está ficando muitas abas laterais"): **Técnico** (2.0.2: os
 * Circuitos e DIDs e o Inventário), **Suporte** (o Painel do Suporte — o atalho para o quadro dele, 2.0.2 —,
 * o Meu dia, 2.0.2, os Projetos, os Relatórios — desde o 2.1, os do painel Suporte, sobre os chamados do
 * Gestor — e o Legado do Helena, os relatórios dos tickets do LineChat, que eram os Relatórios até o 2.0.4),
 * **Comercial** (2.0.1: o Painel do Comercial — o atalho para o painel de Vendas — e o relatório dele, de
 * quem tem a permissão do Comercial; 2.0.2: o Simulador) e **Base de conhecimento** (a interna e a dos clientes); o Importar /
 * Exportar foi para dentro da Administração. Os
 * **Painéis** (todos: os chamados e as negociações) são um item próprio, abaixo do Calendário (2.0.2). O
 * grupo da tela aberta abre sozinho e cada um abre e fecha com um clique (o navegador lembra). Com o menu
 * recolhido, o ícone do grupo abre a lista dele do lado.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom';
import {
  BookLock, BookUser, Boxes, Building2, Cable, Calculator, CalendarDays, ChartColumn, ChevronDown, ChevronsLeft, ChevronsRight, Handshake, Headset, History, Kanban, LayoutDashboard, Library, ListChecks, LogOut, TrendingUp,
  Menu, Moon, Rocket, Settings, Sparkles, SquareKanban, Sun, SunMedium, UserRound, Wrench, X, type LucideIcon,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/index.js';
import { NovidadesPopup } from '../../pages/novidades/Index.js';
import { SinoDeAvisos } from '../../pages/atendimento/Sino.js';
import { fundoDaJanela, useLerOQuadroAntes } from '../../pages/atendimento/comum.js';
import { AvisosQueChegam } from '../../pages/atendimento/AvisosQueChegam.js';
import { useAuth } from '../../lib/auth.js';
import { lembrarPainelDoComercial, painelLembradoDoComercial } from '../../lib/comercial.js';
import { PAINEL_DO_SUPORTE, painelDaImplantacao } from '../../pages/atendimento/Suporte.js';
import { IS_DEMO } from '../../api/index.js';
import { Logotipo, Simbolo } from '../Marca.js';

/** Um item do menu; `conta` põe o número do lado (as novidades não lidas, a leitura obrigatória da base). */
type ItemDoMenu = { to: string; label: string; icon: LucideIcon; perm: string | string[]; end?: boolean; conta?: 'novidades' | 'leituras' };
/** Um grupo do menu: abre e fecha, com os itens dentro. */
type GrupoDoMenu = { grupo: string; label: string; icon: LucideIcon; itens: ItemDoMenu[] };
const ehGrupo = (x: ItemDoMenu | GrupoDoMenu): x is GrupoDoMenu => 'grupo' in x;

export const NAV: Array<ItemDoMenu | GrupoDoMenu> = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, perm: 'records.read', end: true },
  { to: '/clientes', label: 'Clientes', icon: Building2, perm: 'records.read' },
  // os Circuitos e DIDs e o Inventário moram no grupo Técnico (2.0.2), acima do Suporte
  // o calendário das equipes (2.0.1): as visitas, as viradas, as folgas… de todas as equipes (o Comercial e o
  // Administrativo também), por isso no alto do menu e não dentro do Suporte — lá ele ficava escondido no
  // grupo fechado (16/10, o Luan: "cadê, não tá na demo")
  { to: '/calendario', label: 'Calendário', icon: CalendarDays, perm: ['support.read', 'sales.read'] },
  // os painéis do Gestor (os chamados, 2.0, e as negociações do Comercial, 2.0.1 — "isso aqui n é chamados, é
  // paineis", o Luan em 17/10): um item próprio, como o Calendário (2.0.2, 20/10: "o paineis vai ter um campo
  // próprio como o calendário"). Abre a tela de todos os painéis (Todos, Meu dia e Ajustes).
  { to: '/atendimento', label: 'Painéis', icon: SquareKanban, perm: 'support.read' },
  // o técnico (2.0.2, 20/10, num comentário na prévia: "quero q vc faça uma nova aba de técnico e esses 2
  // pontos vao ficar dentro dele"): os circuitos com a numeração (0010) e o inventário dos aparelhos, que
  // moravam no alto do menu. Logo acima do Suporte (no mesmo dia, outro comentário: "quero q o técnico fique
  // acima de suporte"; a primeira versão o punha abaixo)
  {
    grupo: 'tecnico', label: 'Técnico', icon: Wrench, itens: [
      { to: '/circuitos', label: 'Circuitos e DIDs', icon: Cable, perm: 'records.read' },
      { to: '/inventario', label: 'Inventário', icon: Boxes, perm: 'records.read' },
    ],
  },
  // o suporte: o Painel do Suporte (2.0.2, o atalho para o quadro do painel Suporte, "como fizemos no
  // comercial"), o Meu dia (2.0.2: "o meu dia pode ter um botão aqui tbm"), os projetos (as tarefas que
  // percorrem vários clientes), os Relatórios e o Legado do Helena. Desde o 2.1 (decisão 0055), os Relatórios
  // são os do painel Suporte, sobre os chamados do Gestor (a vista Relatórios do painel); os do Helena — os
  // tickets do LineChat, a cópia de leitura do 1.3, com a aba Hoje, o Período e os 20 relatórios do 1.7 — viraram
  // o Legado do Helena (o pedido do Luan, 22/10: "vai ter um legado, que vai ser o antigo, e vai ter um novo").
  // (13/10, os pedidos do Luan: "não precisa ter tickets do LineChat, apenas relatórios" e, dos Projetos, "pode
  // ficar dentro de suporte também")
  {
    grupo: 'suporte', label: 'Suporte', icon: Headset, itens: [
      { to: '/suporte', label: 'Painel do Suporte', icon: Kanban, perm: 'support.read' },
      // 2.3, o Luan: "eu quero q o painel de implantação tenha um botão dentro do menu suporte como o painel do suporte"
      { to: '/suporte/implantacao', label: 'Painel da Implantação', icon: Rocket, perm: 'support.read' },
      { to: '/atendimento/meu-dia', label: 'Meu dia', icon: SunMedium, perm: 'support.read' },
      { to: '/projetos', label: 'Projetos', icon: ListChecks, perm: 'records.read' },
      { to: '/suporte/relatorios', label: 'Relatórios', icon: ChartColumn, perm: 'support.read' },
      { to: '/chamados', label: 'Legado do Helena', icon: History, perm: 'support.read' },
    ],
  },
  // o Comercial (2.0.1, 19/10: "uma aba lateral só para o comercial… com acesso direto ao painel do comercial
  // e aos relatórios do comercial… tem q ter um nível de permissão"): o atalho para o painel de Vendas (o
  // Painel do Comercial; até o 2.0.1, Negociações) e o relatório dele, de quem tem a permissão do Comercial.
  // O painel continua sendo um painel (também em Painéis).
  {
    grupo: 'comercial', label: 'Comercial', icon: Handshake, itens: [
      { to: '/comercial', label: 'Painel do Comercial', icon: Kanban, perm: 'sales.read' },
      { to: '/comercial/relatorio', label: 'Relatórios', icon: TrendingUp, perm: 'sales.read' },
      // o Simulador (2.0.2, decisão 0052): a conta de uma venda antes de fechar — "dentro da aba de comercial"
      { to: '/comercial/simulador', label: 'Simulador', icon: Calculator, perm: 'sales.read' },
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
const ehAtivo = (i: Pick<ItemDoMenu, 'to' | 'end'>, pathname: string) => !!matchPath({ path: i.to, end: !!i.end }, pathname);
/** O Meu dia (o item mora dentro de /atendimento, como os Painéis). */
const MEU_DIA: Pick<ItemDoMenu, 'to' | 'end'> = { to: '/atendimento/meu-dia' };

/**
 * A tela aberta é do painel do Suporte? O quadro, a lista, os relatórios e o Abrir chamado dizem o painel no
 * endereço (?painel=); a ficha, pela sigla do código. Devolve a parte (2.1): os Relatórios do menu ficam
 * marcados na vista Relatórios do painel; o Painel do Suporte (2.0.2), nas outras.
 */
export function parteDoSuporte(pathname: string, search: string, sigla: string | null): 'painel' | 'relatorios' | null {
  return parteDoPainel(pathname, search, { id: PAINEL_DO_SUPORTE, sigla });
}
/** A tela aberta é de um painel (pelo id ou pela sigla no ?painel=, ou pela sigla do código na ficha)? E qual parte. */
export function parteDoPainel(pathname: string, search: string, painel: { id: string; sigla: string | null } | null): 'painel' | 'relatorios' | null {
  if (!painel || !pathname.startsWith('/atendimento')) return null;
  const { id, sigla } = painel;
  const tela = /^\/atendimento\/(quadro|lista|relatorio|novo)\/?$/.exec(pathname)?.[1];
  if (tela) {
    const ref = new URLSearchParams(search).get('painel');
    const dele = ref === id || (!!sigla && ref?.toUpperCase() === sigla);
    return dele ? (tela === 'relatorio' ? 'relatorios' : 'painel') : null;
  }
  const doCodigo = /^\/atendimento\/([A-Za-z0-9]+)-\d+\/?$/.exec(pathname)?.[1];
  return !!sigla && doCodigo?.toUpperCase() === sigla ? 'painel' : null;
}
/** A tela aberta é do painel do Suporte (qualquer parte)? */
export const eDoSuporte = (pathname: string, search: string, sigla: string | null): boolean => parteDoSuporte(pathname, search, sigla) !== null;
/** Quem decide se o item está marcado (o do Comercial olha o painel aberto, não o endereço). */
type Ativo = (i: ItemDoMenu) => boolean;

/**
 * A tela aberta é de um painel de Vendas? O quadro, a lista, o relatório e a nova negociação dizem o painel
 * no endereço (?painel=); a ficha, pela sigla do código (/atendimento/COM-24). Devolve a parte do Comercial
 * (as negociações ou o relatório), para o menu marcar o item certo.
 */
function parteDoComercial(pathname: string, search: string, vendas: Array<{ id: string; sigla: string }>): { painelId: string; parte: 'negociacoes' | 'relatorio' } | null {
  if (!vendas.length || !pathname.startsWith('/atendimento')) return null;
  const tela = /^\/atendimento\/(quadro|lista|relatorio|novo)\/?$/.exec(pathname)?.[1];
  let painel: { id: string; sigla: string } | undefined;
  if (tela) {
    const ref = new URLSearchParams(search).get('painel');
    painel = ref ? vendas.find((p) => p.id === ref || p.sigla === ref.toUpperCase()) : undefined;
  } else {
    const sigla = /^\/atendimento\/([A-Za-z0-9]+)-\d+\/?$/.exec(pathname)?.[1];
    painel = sigla ? vendas.find((p) => p.sigla === sigla.toUpperCase()) : undefined;
  }
  return painel ? { painelId: painel.id, parte: tela === 'relatorio' ? 'relatorio' : 'negociacoes' } : null;
}

/** Os grupos abertos, lembrados por navegador. O grupo da tela aberta abre sozinho (e fica até a pessoa fechar). */
function useGruposAbertos(grupos: GrupoDoMenu[], ativo: Ativo) {
  const CHAVE = 'gestor.menu.grupos';
  const [abertos, setAbertos] = useState<string[]>(() => {
    try { const v: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
  });
  const doAtivo = grupos.find((g) => g.itens.some(ativo))?.grupo;
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
  const location = useLocation();
  // com a ficha (ou o Abrir chamado) numa janela por cima da tela, quem diz o item marcado é a tela de baixo:
  // o chamado aberto do Meu dia deixa o Meu dia marcado (2.0.2)
  const { pathname, search } = fundoDaJanela(location) ?? location;
  // o Comercial (2.0.1): na tela de um painel de Vendas, o menu marca o Comercial (e não Painéis); os
  // painéis vêm das opções do módulo (a mesma consulta das telas dele), só para quem tem a permissão
  const comercial = can('sales.read');
  const suporte = can('support.read');
  const opcoes = useQuery({ queryKey: ['atendimento', 'opcoes'], queryFn: () => api.atendimento.opcoes(), enabled: !!user && (comercial || suporte) && pathname.startsWith('/atendimento'), staleTime: 60_000 });
  const vendas = useMemo(() => (opcoes.data?.paineis ?? []).filter((p) => p.tipo === 'vendas').map((p) => ({ id: p.id, sigla: p.sigla })), [opcoes.data]);
  const doComercial = comercial ? parteDoComercial(pathname, search, vendas) : null;
  // o painel do Suporte (2.0.2): na tela dele, o menu marca o Painel do Suporte (e não Painéis)
  const siglaDoSuporte = opcoes.data?.paineis.find((p) => p.id === PAINEL_DO_SUPORTE)?.sigla ?? null;
  const doSuporte = suporte && !doComercial ? parteDoSuporte(pathname, search, siglaDoSuporte) : null;
  // o painel da implantação (2.3): na tela dele, o menu marca o Painel da Implantação
  const implantacao = useMemo(() => painelDaImplantacao(opcoes.data?.paineis ?? []), [opcoes.data]);
  const doImplantacao = suporte && !doComercial && !doSuporte && implantacao ? parteDoPainel(pathname, search, { id: implantacao.id, sigla: implantacao.sigla }) : null;
  // o painel de Vendas aberto fica lembrado: o Painel do Comercial e o Relatórios do menu voltam para ele
  useEffect(() => { if (doComercial) lembrarPainelDoComercial(doComercial.painelId); }, [doComercial?.painelId]);
  const ativo = useCallback<Ativo>((i) => {
    if (i.to === '/comercial') return doComercial?.parte === 'negociacoes';
    if (i.to === '/comercial/relatorio') return doComercial?.parte === 'relatorio';
    if (i.to === '/suporte') return doSuporte === 'painel';
    if (i.to === '/suporte/relatorios') return doSuporte === 'relatorios';
    if (i.to === '/suporte/implantacao') return !!doImplantacao;
    // o Meu dia mora dentro de /atendimento: lá, o item marcado é o dele, e não Painéis
    if (i.to === '/atendimento') return !doComercial && !doSuporte && !doImplantacao && ehAtivo(i, pathname) && !ehAtivo(MEU_DIA, pathname);
    return ehAtivo(i, pathname);
  }, [doComercial?.parte, doSuporte, doImplantacao, pathname]);
  const { abertos, alternar } = useGruposAbertos(items.filter(ehGrupo), ativo);
  const sair = async () => { await logout(); nav('/entrar'); };
  // nos chamados, a tela usa a largura toda e a margem é menor: o quadro e a ficha precisam de lugar
  const largo = pathname.startsWith('/atendimento') || pathname.startsWith('/calendario') || pathname.startsWith('/comercial/simulador');
  // o sininho dos avisos: de quem vê os chamados ou o Comercial (os avisos das negociações)
  const temSino = can('support.read') || comercial;
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
            ? <GrupoNoMenu key={n.grupo} g={n} aberto={abertos.includes(n.grupo)} alternar={() => alternar(n.grupo)} recolhido={collapsed} contagem={contagem} ativo={ativo} aoNavegar={() => setOpen(false)} />
            : <ItemNoMenu key={n.to} i={n} recolhido={collapsed} contagem={contagem} marcado={ativo(n)} aoNavegar={() => setOpen(false)} />))}
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

/**
 * O Painel do Suporte e o Painel do Comercial do menu (2.1.2): o mouse parado em cima já lê o quadro, que abre pronto.
 * O do Comercial é o painel de Vendas lembrado (ou o primeiro, pelas opções já lidas); os outros itens, nada.
 */
function useQuadroDoAtalho(to: string) {
  const qc = useQueryClient();
  const lerOQuadro = useLerOQuadroAntes();
  if (to === '/suporte') return lerOQuadro(PAINEL_DO_SUPORTE);
  if (to !== '/comercial') return {};
  const vendas = qc.getQueryData<{ paineis: Array<{ id: string; tipo: string; ativo: boolean }> }>(['atendimento', 'opcoes'])?.paineis.filter((p) => p.tipo === 'vendas' && p.ativo) ?? [];
  const lembrado = painelLembradoDoComercial();
  return lerOQuadro(vendas.find((p) => p.id === lembrado)?.id ?? vendas[0]?.id ?? lembrado);
}

/** Um item do menu (no grupo, `dentro`: menor e recuado). `marcado`: a tela aberta é dele (quem decide é o menu). */
function ItemNoMenu({ i, recolhido, contagem, aoNavegar, marcado, dentro = false }: { i: ItemDoMenu; recolhido: boolean; contagem: Contagem; aoNavegar: () => void; marcado: boolean; dentro?: boolean }) {
  const c = contagem(i);
  const hide = recolhido && !dentro ? 'md:hidden' : '';
  const lerAntes = useQuadroDoAtalho(i.to);
  return (
    <Link to={i.to} onClick={aoNavegar} title={recolhido && !dentro ? i.label : undefined} aria-current={marcado ? 'page' : undefined} {...lerAntes}
      className={`relative flex items-center rounded-lg font-medium ${dentro ? 'gap-2 px-2.5 py-1.5 text-[13.5px]' : 'gap-2.5 px-3 py-2 text-sm'} ${recolhido && !dentro ? 'md:justify-center md:px-0' : ''} ${marcado ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
      {/* o número: do lado; com o menu recolhido, no canto do ícone, como nos grupos. Só existe quando há número:
          a caixa vazia entrava na fila e tirava o ícone do eixo (13/10, o Luan: "o Novidades ficou meio desalinhado") */}
      <span className="relative shrink-0">
        <i.icon size={dentro ? 15 : 17} />
        {c && c.n > 0 && recolhido && !dentro && <NumeroNoIcone n={c.n} tom={c.tom} titulo={c.titulo} mostrar="hidden md:flex" />}
      </span>
      <span className={`min-w-0 truncate ${hide}`}>{i.label}</span>
      {c && c.n > 0 && <span className={`ml-auto ${hide}`}><Contador n={c.n} tom={c.tom} titulo={c.titulo} /></span>}
    </Link>
  );
}

/**
 * Um grupo do menu: o nome abre e fecha a lista (recuada, com uma linha do lado). Fechado, ele fica
 * marcado quando a tela aberta é dele, e mostra a soma dos números de dentro. Com o menu recolhido
 * (no computador), o ícone abre a lista do lado — fora da rolagem do menu, para não ser cortada.
 */
function GrupoNoMenu({ g, aberto, alternar, recolhido, contagem, ativo: itemAtivo, aoNavegar }: {
  g: GrupoDoMenu; aberto: boolean; alternar: () => void; recolhido: boolean; contagem: Contagem; ativo: Ativo; aoNavegar: () => void;
}) {
  const { pathname } = useLocation();
  const ativo = g.itens.some(itemAtivo);
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
          {g.itens.map((i) => <ItemNoMenu key={i.to} i={i} recolhido={recolhido} contagem={contagem} marcado={itemAtivo(i)} aoNavegar={aoNavegar} dentro />)}
        </div>
      )}
      {aoLado && createPortal(
        <nav ref={lista} className="fixed z-50 card shadow-lg py-1.5 w-60" style={{ top: aoLado.top, left: aoLado.left, boxShadow: '0 10px 30px rgba(0,0,0,.18)' }} aria-label={g.label} data-lista-do-grupo={g.grupo}>
          <div className="eyebrow px-3 pt-0.5 pb-1">{g.label}</div>
          <div className="flex flex-col gap-0.5 px-1.5">
            {g.itens.map((i) => <ItemNoMenu key={i.to} i={i} recolhido={false} contagem={contagem} marcado={itemAtivo(i)} aoNavegar={aoNavegar} dentro />)}
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
