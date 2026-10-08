/**
 * PORTAL DO CLIENTE (Patch 1.8, decisão 0040) — o que o cliente da Ingline acessa.
 *
 * Fica no mesmo endereço do sistema, em /portal, mas é outro mundo: login próprio (cada pessoa do
 * cliente com e-mail e senha), outro cookie, outra moldura (sem o menu da equipe) e só o conteúdo
 * dos produtos que o cliente tem. Saiu da base (arquivado, na lixeira, sem produto ativo), o
 * acesso cai na hora — o servidor confere a cada pedido.
 *
 * Esta parte é carregada sozinha (lazy, em App.tsx): o celular do cliente não baixa as telas da
 * equipe.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, MessageCircle, Moon, Search, Sun, UserRound } from 'lucide-react';
import { api, logoSrc } from '../api/index.js';
import { ApiError, type EuPortal } from '../api/types.js';
import { Carregando, LogoCliente, mensagemErro } from '../components/ui/index.js';
import { Simbolo } from '../components/Marca.js';
import { ContatoDoSuporte, linkDoSuporte, primeiroNome, useEu, useSobre } from './comum.js';
import { Convite, Entrar } from './Entrada.js';
import { Busca, Conta, Inicio, Produto, TutorialPagina } from './Paginas.js';

export function PortalApp() {
  const qc = useQueryClient();
  // qualquer pedido do portal que volte "entre para ver" (a sessão caiu, o acesso foi suspenso no
  // meio): confere quem está logado — a moldura leva para "Entrar", com o aviso certo
  useEffect(() => qc.getQueryCache().subscribe((ev) => {
    if (ev.type !== 'updated' || ev.action.type !== 'error') return;
    const chave = ev.query.queryKey;
    if (chave[0] === 'portal' && chave[1] !== 'eu' && ev.action.error instanceof ApiError && ev.action.error.status === 401) void qc.invalidateQueries({ queryKey: ['portal', 'eu'] });
  }), [qc]);
  return (
    <Routes>
      <Route path="entrar" element={<Entrar />} />
      <Route path="convite/:codigo" element={<Convite />} />
      <Route index element={<Logado pagina={(eu) => <Inicio eu={eu} />} />} />
      <Route path="produto/:id" element={<Logado pagina={(eu) => <Produto eu={eu} />} />} />
      <Route path="busca" element={<Logado pagina={(eu) => <Busca eu={eu} />} />} />
      <Route path="a/:caminho" element={<Logado pagina={(eu) => <TutorialPagina eu={eu} />} />} />
      <Route path="conta" element={<Logado pagina={(eu) => <Conta eu={eu} />} />} />
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  );
}

/** O tema claro/escuro do portal (o do sistema, até a pessoa escolher). */
function useTema() {
  const [tema, setTema] = useState<string>(() => { try { return localStorage.getItem('portal.tema') ?? 'system'; } catch { return 'system'; } });
  useEffect(() => {
    const root = document.documentElement;
    if (tema === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', tema);
    try { localStorage.setItem('portal.tema', tema); } catch { /* sem storage: só não lembra */ }
  }, [tema]);
  const escuro = tema === 'dark' || (tema === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  return { escuro, trocar: () => setTema(escuro ? 'light' : 'dark') };
}

/**
 * As páginas de dentro: sem sessão, vai para "Entrar" e volta para cá depois (o link do tutorial
 * que chegou no WhatsApp abre direto no tutorial). Acesso suspenso: "Entrar" explica.
 */
function Logado({ pagina }: { pagina: (eu: EuPortal) => ReactNode }) {
  const eu = useEu();
  const loc = useLocation();
  if (eu.isLoading) return <div className="h-full flex items-center justify-center"><Carregando /></div>;
  if (eu.isError || !eu.data) {
    const e = eu.error;
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      const p = new URLSearchParams();
      const aqui = loc.pathname + loc.search;
      if (aqui !== '/portal' && aqui !== '/portal/') p.set('volta', aqui);
      if (/suspenso/i.test(e.message)) p.set('suspenso', '1');
      const qs = p.toString();
      return <Navigate to={`/portal/entrar${qs ? `?${qs}` : ''}`} replace />;
    }
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="card p-6 max-w-sm text-center">
          <div className="font-display font-semibold">Não deu para abrir agora</div>
          <p className="text-[14px] text-muted mt-1">{mensagemErro(e)}</p>
          <button className="btn-primary mt-4" onClick={() => void eu.refetch()}>Tentar de novo</button>
        </div>
      </div>
    );
  }
  return <Moldura eu={eu.data}>{pagina(eu.data)}</Moldura>;
}

function Moldura({ eu, children }: { eu: EuPortal; children: ReactNode }) {
  const { escuro, trocar } = useTema();
  const sobre = useSobre();
  const { pathname } = useLocation();
  const whatsapp = linkDoSuporte(sobre.data, `Olá! Sou ${eu.nome}, da ${eu.cliente.nome}. Preciso de ajuda com…`);
  return (
    <div className="min-h-full flex flex-col bg-bg">
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto h-14 sm:h-16 px-4 flex items-center gap-2">
          <Link to="/portal" className="flex items-center gap-2.5 min-w-0 mr-auto" aria-label={`${eu.portal.titulo}: início`}>
            <Simbolo tamanho={30} />
            <span className="font-display font-semibold text-[15.5px] sm:text-[16.5px] truncate">{eu.portal.titulo}</span>
          </Link>
          {pathname !== '/portal/busca' && <Link to="/portal/busca" className="btn-ghost btn-sm px-2" aria-label="Buscar" title="Buscar"><Search size={18} /></Link>}
          <button type="button" className="btn-ghost btn-sm px-2" onClick={trocar} aria-label={escuro ? 'Tema claro' : 'Tema escuro'} title={escuro ? 'Tema claro' : 'Tema escuro'}>{escuro ? <Sun size={17} /> : <Moon size={17} />}</button>
          <MenuDaConta eu={eu} />
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5 sm:py-8">{children}</main>
      <footer className="border-t border-line bg-surface">
        <div className="max-w-5xl mx-auto px-4 py-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-[13px] text-muted pb-20 sm:pb-5">
          <span className="flex items-center gap-2"><Simbolo tamanho={18} /> {eu.portal.titulo}</span>
          <ContatoDoSuporte sobre={sobre.data} className="sm:ml-auto" />
        </div>
      </footer>
      {/* no celular, o suporte fica sempre à mão */}
      {whatsapp && (
        <a href={whatsapp} target="_blank" rel="noreferrer" className="sm:hidden fixed right-4 bottom-4 z-30 btn-primary rounded-full shadow-lg px-4 py-3" aria-label="Falar com o suporte">
          <MessageCircle size={18} /> Suporte
        </a>
      )}
    </div>
  );
}

function MenuDaConta({ eu }: { eu: EuPortal }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sair = useMutation({
    mutationFn: () => api.portal.sair(),
    onSettled: () => { qc.removeQueries({ queryKey: ['portal'] }); navigate('/portal/entrar', { replace: true }); },
  });
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla); };
  }, [aberto]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-haspopup="menu" title={`${eu.nome} · ${eu.cliente.nome}`}>
        <LogoCliente src={logoSrc(eu.cliente.logo)} nome={eu.cliente.nome} tamanho={30} />
        <span className="hidden sm:block text-left leading-tight max-w-[160px]">
          <span className="block text-[13px] font-semibold truncate">{primeiroNome(eu.nome)}</span>
          <span className="block text-[11.5px] text-muted truncate">{eu.cliente.nome}</span>
        </span>
      </button>
      {aberto && (
        <div className="absolute right-0 mt-2 w-[260px] card shadow-xl p-1.5 z-40" role="menu">
          <div className="px-2.5 py-2 border-b border-line mb-1">
            <div className="font-semibold text-[14px] truncate">{eu.nome}</div>
            <div className="text-[12.5px] text-muted truncate">{eu.email}</div>
            <div className="text-[12.5px] text-muted truncate">{eu.cliente.nome}</div>
          </div>
          <Link to="/portal/conta" role="menuitem" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[14px] hover:bg-surface-2" onClick={() => setAberto(false)}><UserRound size={15} /> Minha conta</Link>
          <button type="button" role="menuitem" className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-[14px] hover:bg-surface-2 text-left" onClick={() => sair.mutate()} disabled={sair.isPending}><LogOut size={15} /> Sair</button>
        </div>
      )}
    </div>
  );
}
