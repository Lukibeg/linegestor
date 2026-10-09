/**
 * Portal do cliente (Patch 1.8): as páginas de dentro — o início, os tutoriais de um produto, a
 * busca, o tutorial e a conta. Pensado para o celular primeiro: letra grande, busca no topo, e o
 * "falar com o suporte" sempre à mão (já com o nome do tutorial na mensagem).
 */
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, ChevronRight, Copy, KeyRound, LogOut, MessageCircle, Search, Share2, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { api, logoSrc } from '../api/index.js';
import { ApiError, type CartaoTutorial, type EuPortal, type InicioPortal } from '../api/types.js';
import { Carregando, LogoCliente, mensagemErro, Spinner, useToast } from '../components/ui/index.js';
import { data as dataCurta } from '../lib/format.js';
import { CorpoDoTutorial, linkDoPortal, mapaDeArquivos } from './Corpo.js';
import {
  BotaoSuporte, CampoSenha, CartaoDeTutorial, CartaoDestaque, ContatoDoSuporte, CorDoProduto, EtiquetaProduto, linkDoSuporte, primeiroNome,
  RegrasDaSenha, regrasDaSenha, useSobre, useTituloDaAba,
} from './comum.js';

const useInicio = () => useQuery({ queryKey: ['portal', 'inicio'], queryFn: () => api.portal.inicio(), staleTime: 60_000 });

/** A busca do portal: grande, no topo. Enviar leva para a página de busca. */
function CaixaDeBusca({ inicial = '', grande = false, autoFocus = false, onBuscar }: { inicial?: string; grande?: boolean; autoFocus?: boolean; onBuscar?: (q: string) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState(inicial);
  useEffect(() => { setQ(inicial); }, [inicial]);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (onBuscar) onBuscar(q.trim());
    else if (q.trim()) navigate(`/portal/busca?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form onSubmit={enviar} role="search" className="relative">
      <Search size={grande ? 20 : 17} className={`absolute top-1/2 -translate-y-1/2 text-muted pointer-events-none ${grande ? 'left-4' : 'left-3'}`} />
      <input
        className={`input ${grande ? 'pl-12 pr-24 py-3.5 text-[16px] rounded-xl shadow-sm' : 'pl-10 pr-20 py-2.5 text-[15px]'}`} type="search" enterKeyHint="search"
        placeholder="Ex.: transferir uma ligação" aria-label="Procurar nos tutoriais" value={q}
        onChange={(e) => { setQ(e.target.value); if (onBuscar) onBuscar(e.target.value.trim()); }} autoFocus={autoFocus} />
      <button className={`absolute right-1.5 top-1/2 -translate-y-1/2 btn-primary ${grande ? 'py-2' : 'btn-sm'}`}>Buscar</button>
    </form>
  );
}

function Secao({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-2 mb-3">
        <h2 className="font-display font-semibold text-[18px]">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** "Não achou?": o suporte, por extenso. */
function CartaoSuporte({ mensagem, titulo = 'Não achou o que procurava?' }: { mensagem: string; titulo?: string }) {
  const sobre = useSobre();
  if (!sobre.data?.whatsapp && !sobre.data?.email) return null;
  return (
    <section className="mt-8 card p-5 flex flex-col sm:flex-row sm:items-center gap-3 bg-accent-soft border-accent/30">
      <span className="w-11 h-11 rounded-full bg-accent text-white flex items-center justify-center shrink-0"><MessageCircle size={21} /></span>
      <div className="min-w-0 flex-1">
        <div className="font-display font-semibold text-[16px] text-ink">{titulo}</div>
        <p className="text-[14px] text-ink-2">A gente responde e, se precisar, faz junto com você.</p>
        <ContatoDoSuporte sobre={sobre.data} className="mt-0.5" />
      </div>
      <BotaoSuporte sobre={sobre.data} mensagem={mensagem} className="btn-primary shrink-0" />
    </section>
  );
}

// ---------- o início ----------

export function Inicio({ eu }: { eu: EuPortal }) {
  const q = useInicio();
  useTituloDaAba(eu.portal.titulo);
  return (
    <>
      <div className="-mx-4 sm:mx-0 sm:rounded-2xl px-4 sm:px-8 py-7 sm:py-10 bg-[linear-gradient(135deg,var(--accent-soft),var(--surface)_70%)] border-b sm:border border-line">
        <h1 className="font-display font-semibold text-[24px] sm:text-[28px] leading-tight">Olá, {primeiroNome(eu.nome)}!</h1>
        <p className="text-[15px] text-ink-2 mt-1.5 max-w-2xl">{eu.portal.boasVindas || 'Passo a passo, vídeos e manuais dos seus produtos.'}</p>
        <div className="mt-5 max-w-2xl"><CaixaDeBusca grande /></div>
      </div>
      {q.isLoading ? <Carregando /> : q.isError ? <Erro e={q.error} /> : <ConteudoDoInicio d={q.data!} />}
      <CartaoSuporte mensagem={`Olá! Sou ${eu.nome}, da ${eu.cliente.nome}. Preciso de ajuda com…`} />
    </>
  );
}

function ConteudoDoInicio({ d }: { d: InicioPortal }) {
  const produtos = d.produtos.filter((p) => p.tutoriais > 0);
  const destaques = new Set(d.destaques.map((t) => t.id));
  const novos = d.recentes.filter((t) => !destaques.has(t.id)).slice(0, 4);
  if (!d.total) {
    return (
      <div className="card p-8 mt-8 text-center">
        <BookOpen size={28} className="mx-auto text-muted" />
        <div className="font-display font-semibold mt-2">Os tutoriais aparecem aqui</div>
        <p className="text-[14px] text-muted mt-1 max-w-md mx-auto">Assim que a equipe publicar o passo a passo dos seus produtos, ele aparece nesta página.</p>
      </div>
    );
  }
  return (
    <>
      <Secao titulo="Seus produtos">
        <ul className="grid grid-cols-1 min-[440px]:grid-cols-2 lg:grid-cols-3 gap-3">
          {produtos.map((p) => <CartaoProduto key={p.id} id={p.id} nome={p.nome} cor={p.cor} n={p.tutoriais} />)}
          {d.geral > 0 && <CartaoProduto id="geral" nome="Geral" cor={null} n={d.geral} dica="Suporte e dúvidas de todos os produtos" />}
        </ul>
      </Secao>
      {d.destaques.length > 0 && (
        <Secao titulo="Em destaque">
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{d.destaques.map((t) => <CartaoDestaque key={t.id} t={t} />)}</ul>
        </Secao>
      )}
      {novos.length > 0 && (
        <Secao titulo="Novos por aqui">
          <ul className="flex flex-col gap-2.5">{novos.map((t) => <CartaoDeTutorial key={t.id} t={t} />)}</ul>
        </Secao>
      )}
    </>
  );
}

function CartaoProduto({ id, nome, cor, n, dica }: { id: string; nome: string; cor: string | null; n: number; dica?: string }) {
  return (
    <li className="relative card p-4 flex items-center gap-3 hover:border-accent hover:shadow-sm transition">
      <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white font-display font-semibold text-[17px]" style={{ background: cor ?? 'var(--accent)' }} aria-hidden>
        {id === 'geral' ? <BookOpen size={20} /> : nome.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <Link to={`/portal/produto/${id}`} className="block font-display font-semibold text-[16px] text-ink hover:text-accent after:absolute after:inset-0 truncate">{nome}</Link>
        <span className="block text-[13px] text-muted truncate">{dica ?? `${n} ${n === 1 ? 'tutorial' : 'tutoriais'}`}</span>
      </span>
      <ChevronRight size={18} className="text-muted shrink-0" aria-hidden />
    </li>
  );
}

function Erro({ e }: { e: unknown }) {
  return <div className="card p-5 mt-6 text-[14px] text-bad" role="alert">{mensagemErro(e)}</div>;
}

function Voltar({ para = '/portal', texto = 'Início' }: { para?: string; texto?: string }) {
  return <Link to={para} className="inline-flex items-center gap-1 text-[13.5px] text-muted hover:text-ink mb-3"><ArrowLeft size={15} /> {texto}</Link>;
}

/** O que a pessoa digitou na busca vai para o servidor um instante depois de parar de digitar. */
function useDepois<T>(valor: T, ms = 250): T {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

// ---------- os tutoriais de um produto ----------

export function Produto({ eu }: { eu: EuPortal }) {
  const { id = '' } = useParams();
  const inicio = useInicio();
  const [busca, setBusca] = useState('');
  const q = useDepois(busca);
  const lista = useQuery({ queryKey: ['portal', 'tutoriais', id, q], queryFn: () => api.portal.tutoriais({ produto: id, q: q || undefined }), placeholderData: (a) => a });
  const p = id === 'geral' ? { nome: 'Geral', cor: null as string | null } : inicio.data?.produtos.find((x) => x.id === id);
  useTituloDaAba(p?.nome, eu.portal.titulo);
  // sem busca, os tutoriais ficam separados por módulo (o "geral" do produto primeiro)
  const grupos = useMemo(() => {
    const itens = lista.data?.items ?? [];
    if (q) return [{ nome: null as string | null, itens }];
    const m = new Map<string, { nome: string | null; itens: typeof itens }>();
    for (const t of itens) {
      const k = t.modulo?.id ?? '';
      if (!m.has(k)) m.set(k, { nome: t.modulo?.nome ?? null, itens: [] });
      m.get(k)!.itens.push(t);
    }
    return [...m.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : 0)).map(([, g]) => g);
  }, [lista.data, q]);
  return (
    <>
      <Voltar />
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white font-display font-semibold" style={{ background: p?.cor ?? 'var(--accent)' }} aria-hidden>
          {id === 'geral' ? <BookOpen size={19} /> : (p?.nome ?? '?').slice(0, 1)}
        </span>
        <div className="min-w-0">
          <h1 className="font-display font-semibold text-[22px] leading-tight">{p?.nome ?? 'Tutoriais'}</h1>
          {lista.data && <p className="text-[13px] text-muted tnum">{lista.data.total} {lista.data.total === 1 ? 'tutorial' : 'tutoriais'}{q ? ` para “${q}”` : ''}</p>}
        </div>
      </div>
      <div className="mt-4 max-w-2xl"><CaixaDeBusca onBuscar={setBusca} /></div>
      {lista.isLoading ? <Carregando /> : lista.isError ? <Erro e={lista.error} /> : !lista.data?.items.length ? (
        <p className="mt-6 text-[14.5px] text-muted">{q ? `Nada para “${q}” em ${p?.nome ?? 'este produto'}.` : 'Nenhum tutorial aqui ainda.'}</p>
      ) : (
        grupos.map((g, i) => (
          <section key={g.nome ?? `g${i}`} className="mt-5">
            {grupos.length > 1 && <h2 className="font-display font-semibold text-[15.5px] mb-2 text-ink-2">{g.nome ?? `Geral do ${p?.nome ?? 'produto'}`}</h2>}
            <ul className="flex flex-col gap-2.5">{g.itens.map((t) => <CartaoDeTutorial key={t.id} t={t} trecho={t.trecho} />)}</ul>
          </section>
        ))
      )}
      <CartaoSuporte mensagem={`Olá! Sou ${eu.nome}, da ${eu.cliente.nome}. Tenho uma dúvida sobre ${p?.nome ?? 'um produto'}.`} />
    </>
  );
}

// ---------- a busca ----------

export function Busca({ eu }: { eu: EuPortal }) {
  const [sp, setSp] = useSearchParams();
  const q = (sp.get('q') ?? '').trim();
  const lista = useQuery({ queryKey: ['portal', 'busca', q], queryFn: () => api.portal.tutoriais({ q }), enabled: !!q, placeholderData: (a) => a });
  useTituloDaAba(q ? `Busca: ${q}` : 'Buscar', eu.portal.titulo);
  return (
    <>
      <Voltar />
      <h1 className="font-display font-semibold text-[22px]">Buscar</h1>
      <div className="mt-3 max-w-2xl"><CaixaDeBusca inicial={q} autoFocus={!q} onBuscar={undefined} /></div>
      {q && (lista.isLoading ? <Carregando /> : lista.isError ? <Erro e={lista.error} /> : (
        <>
          <p className="mt-5 mb-2 text-[13px] text-muted tnum">{lista.data!.total} {lista.data!.total === 1 ? 'tutorial' : 'tutoriais'} para “{q}”</p>
          {lista.data!.items.length > 0
            ? <ul className="flex flex-col gap-2.5">{lista.data!.items.map((t) => <CartaoDeTutorial key={t.id} t={t} trecho={t.trecho} />)}</ul>
            : <p className="text-[14.5px] text-ink-2">Tente outras palavras: o nome do botão, o que aparece na tela, ou o que você quer fazer.</p>}
          {lista.data!.items.length > 0 && <button type="button" className="btn-ghost btn-sm text-muted mt-3" onClick={() => setSp({}, { replace: true })}><X size={14} /> Limpar a busca</button>}
        </>
      ))}
      <CartaoSuporte titulo={q ? 'Não achou?' : undefined} mensagem={q ? `Olá! Procurei “${q}” na ${eu.portal.titulo} e não achei. Sou ${eu.nome}, da ${eu.cliente.nome}.` : `Olá! Sou ${eu.nome}, da ${eu.cliente.nome}. Preciso de ajuda com…`} />
    </>
  );
}

// ---------- o tutorial ----------

export function TutorialPagina({ eu }: { eu: EuPortal }) {
  const { caminho = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const sobre = useSobre();
  const q = useQuery({ queryKey: ['portal', 'tutorial', caminho], queryFn: () => api.portal.tutorial(caminho), retry: false, staleTime: 60_000 });
  const t = q.data;
  const doProduto = useQuery({
    queryKey: ['portal', 'tutoriais', t?.produto?.id ?? 'geral', ''], queryFn: () => api.portal.tutoriais({ produto: t?.produto?.id ?? 'geral' }),
    enabled: !!t, staleTime: 60_000,
  });
  const [resolveu, setResolveu] = useState<null | boolean>(null);
  useTituloDaAba(t?.titulo, eu.portal.titulo);
  // o título mudou depois que o link foi mandado: o endereço se ajeita sozinho (o número é o que vale)
  useEffect(() => { if (t && t.caminho !== `/portal/a/${caminho}`) navigate(t.caminho, { replace: true }); }, [t, caminho, navigate]);
  useEffect(() => { setResolveu(null); window.scrollTo(0, 0); }, [caminho]);

  if (q.isLoading) return <Carregando />;
  if (q.isError || !t) {
    const naoTem = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="card p-6 mt-2 max-w-xl">
        <BookOpen size={26} className="text-muted" />
        <h1 className="font-display font-semibold text-[18px] mt-2">{naoTem ? 'Este tutorial não está disponível' : 'Não deu para abrir o tutorial'}</h1>
        <p className="text-[14px] text-ink-2 mt-1">{naoTem ? 'Ele saiu do ar ou não é de um produto da sua empresa.' : mensagemErro(q.error)}</p>
        <div className="flex flex-wrap gap-2 mt-4"><Link to="/portal" className="btn-primary">Ir para o início</Link><Link to="/portal/busca" className="btn-secondary"><Search size={15} /> Buscar</Link></div>
      </div>
    );
  }
  const link = linkDoPortal(t.caminho);
  const arquivos = mapaDeArquivos(t.arquivos);
  const outros = (doProduto.data?.items ?? []).filter((x) => x.id !== t.id).slice(0, 4);
  const copiar = async () => { try { await navigator.clipboard.writeText(link); toast.push('ok', 'Link copiado'); } catch { toast.push('erro', 'Não deu para copiar. Copie o endereço lá em cima.'); } };
  const compartilhar = typeof navigator !== 'undefined' && 'share' in navigator
    ? async () => { try { await navigator.share({ title: t.titulo, url: link }); } catch { /* a pessoa desistiu */ } }
    : null;
  const ajuda = `Olá! Sou ${eu.nome}, da ${eu.cliente.nome}. Vi o tutorial “${t.titulo}” e ainda preciso de ajuda.\n${link}`;
  const produtoLink = `/portal/produto/${t.produto?.id ?? 'geral'}`;

  return (
    <article className="max-w-3xl">
      <nav className="flex items-center gap-1 text-[13.5px] text-muted mb-3 min-w-0" aria-label="Onde você está">
        <Link to="/portal" className="hover:text-ink shrink-0">Início</Link>
        <ChevronRight size={14} className="shrink-0" />
        <Link to={produtoLink} className="hover:text-ink inline-flex items-center gap-1.5 min-w-0"><CorDoProduto cor={t.produto?.cor} tamanho={8} /><span className="truncate">{t.produto?.nome ?? 'Geral'}</span></Link>
      </nav>
      <h1 className="font-display font-semibold text-[24px] sm:text-[28px] leading-tight">{t.titulo}</h1>
      {t.resumo && <p className="text-[16.5px] text-ink-2 mt-2">{t.resumo}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3">
        <EtiquetaProduto t={t} />
        <span className="text-[12.5px] text-muted">Atualizado em {dataCurta(t.atualizadoEm)}</span>
        <span className="flex gap-1.5 ml-auto">
          {compartilhar && <button type="button" className="btn-secondary btn-sm" onClick={compartilhar}><Share2 size={14} /> Compartilhar</button>}
          <button type="button" className="btn-secondary btn-sm" onClick={copiar}><Copy size={14} /> Copiar link</button>
        </span>
      </div>

      <div className="mt-6 card p-4 sm:p-6">
        <CorpoDoTutorial texto={t.texto} arquivos={arquivos} />
      </div>

      {/* "Isso resolveu?": não guarda nada; o "não" leva para o suporte já com o tutorial na mensagem */}
      <section className="mt-5 card p-4 sm:p-5" aria-live="polite">
        {resolveu === null ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display font-semibold text-[15.5px] mr-auto">Isso resolveu?</span>
            <button type="button" className="btn-secondary" onClick={() => setResolveu(true)}><ThumbsUp size={15} /> Sim</button>
            <button type="button" className="btn-secondary" onClick={() => setResolveu(false)}><ThumbsDown size={15} /> Não</button>
          </div>
        ) : resolveu ? (
          <p className="text-[14.5px] flex items-center gap-2"><Check size={17} className="text-ok" /> Que bom! Se precisar de novo, é só voltar aqui.</p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-[14.5px] text-ink-2 flex-1">A gente ajuda. A mensagem já vai com o nome deste tutorial.</p>
            {linkDoSuporte(sobre.data, ajuda)
              ? <BotaoSuporte sobre={sobre.data} mensagem={ajuda} className="btn-primary" />
              : <ContatoDoSuporte sobre={sobre.data} />}
          </div>
        )}
      </section>

      {outros.length > 0 && (
        <Secao titulo={`Mais de ${t.produto?.nome ?? 'Geral'}`} acao={<Link to={produtoLink} className="link text-[13.5px]">Ver todos</Link>}>
          <ul className="flex flex-col gap-2.5">{outros.map((x: CartaoTutorial) => <CartaoDeTutorial key={x.id} t={x} compacto />)}</ul>
        </Secao>
      )}
    </article>
  );
}

// ---------- a conta ----------

export function Conta({ eu }: { eu: EuPortal }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmar, setConfirmar] = useState('');
  useTituloDaAba('Minha conta', eu.portal.titulo);
  const regras = regrasDaSenha(nova, confirmar);
  const trocar = useMutation({
    mutationFn: () => api.portal.trocarSenha(atual, nova),
    onSuccess: () => { setAtual(''); setNova(''); setConfirmar(''); toast.push('ok', 'Senha trocada. Nos outros aparelhos, é preciso entrar de novo.'); },
  });
  const sair = useMutation({
    mutationFn: () => api.portal.sair(),
    onSettled: () => { qc.removeQueries({ queryKey: ['portal'] }); navigate('/portal/entrar', { replace: true }); },
  });
  return (
    <div className="max-w-xl">
      <Voltar />
      <h1 className="font-display font-semibold text-[22px]">Minha conta</h1>
      <section className="card p-4 sm:p-5 mt-4 flex items-center gap-3">
        <LogoCliente src={logoSrc(eu.cliente.logo)} nome={eu.cliente.nome} tamanho={44} />
        <div className="min-w-0">
          <div className="font-semibold text-[15.5px]">{eu.nome}</div>
          <div className="text-[13.5px] text-ink-2 break-all">{eu.email}</div>
          <div className="text-[13px] text-muted">{eu.cliente.nome}</div>
        </div>
      </section>
      <p className="text-[12.5px] text-muted mt-2">Para mudar o nome ou o e-mail, fale com o suporte.</p>

      <form className="card p-4 sm:p-5 mt-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (regras.every((r) => r.ok)) trocar.mutate(); }}>
        <h2 className="font-display font-semibold text-[16px] flex items-center gap-2"><KeyRound size={17} className="text-accent" /> Trocar a senha</h2>
        <input type="email" autoComplete="username" value={eu.email} readOnly hidden />
        <CampoSenha id="conta-atual" rotulo="Senha atual" valor={atual} onChange={setAtual} autoComplete="current-password" />
        <CampoSenha id="conta-nova" rotulo="Senha nova" valor={nova} onChange={setNova} autoComplete="new-password" />
        <CampoSenha id="conta-confirmar" rotulo="Repita a senha nova" valor={confirmar} onChange={setConfirmar} autoComplete="new-password" />
        <RegrasDaSenha regras={regras} />
        {trocar.error && <div className="text-bad text-[13.5px]" role="alert">{mensagemErro(trocar.error)}</div>}
        <button className="btn-primary self-start" disabled={!atual || !regras.every((r) => r.ok) || trocar.isPending}>{trocar.isPending ? <Spinner className="text-white" /> : 'Salvar a senha nova'}</button>
      </form>

      <button type="button" className="btn-secondary mt-5" onClick={() => sair.mutate()} disabled={sair.isPending}><LogOut size={15} /> Sair do portal</button>
    </div>
  );
}
