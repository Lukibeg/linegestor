/**
 * As peças da Base de conhecimento (Patch 1.8) que aparecem em mais de um lugar: o texto simples
 * desenhado (passos, comandos com Copiar, prints), as ligações em etiquetas, o trecho achado pela
 * busca, os artigos ligados numa ficha e o livrinho da tabela de Chamados.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, BookPlus, Building2, Check, Copy, Headset, Link2, ListChecks, Package, Phone, Puzzle, RadioTower, Tag, X } from 'lucide-react';
import { blocosDoTexto, pedacosDaLinha, type BlocoTexto } from '@gestor/shared';
import { api, logoSrc } from '../../api/index.js';
import type { ArtigoCurto, LigacaoMostrada, PedacoTrecho, Projeto, TipoLigacao } from '../../api/types.js';
import { EscolherComBusca, Popover, Spinner, TODOS, mensagemErro, useToast } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';

/** No celular o foco automático abre o teclado e rola a tela: só no computador. */
export const telaLarga = () => { try { return window.matchMedia('(min-width: 768px)').matches; } catch { return true; } };

// ---------- o código e as ligações ----------

export function CodigoArtigo({ codigo, className = '' }: { codigo: string; className?: string }) {
  return <span className={`font-mono text-[12px] font-medium rounded-md px-1.5 py-0.5 bg-accent-soft text-accent-ink whitespace-nowrap ${className}`}>{codigo}</span>;
}

export const ICONE_LIGACAO: Record<TipoLigacao, typeof Tag> = {
  produto: Package, modulo: Puzzle, assunto: Tag, cliente: Building2, modelo: Phone, operadora: RadioTower, chamado: Headset, projeto: ListChecks,
};

/** Para onde leva clicar numa etiqueta: o card no LineChat, a ficha, ou a base filtrada por ela. */
export function destinoDaLigacao(l: { tipo: TipoLigacao; alvo: string; href: string | null }): { interno: string } | { externo: string } | null {
  if (l.tipo === 'chamado') return l.href ? { externo: l.href } : null;
  if (l.href) return { interno: l.href };
  return { interno: `/base?${l.tipo}=${encodeURIComponent(l.alvo)}` };
}

export function EtiquetaLigacao({ l, comExtra = false }: { l: LigacaoMostrada; comExtra?: boolean }) {
  const Icone = ICONE_LIGACAO[l.tipo];
  const texto = l.tipo === 'modulo' && l.extra ? `${l.extra} › ${l.nome}` : l.nome;
  const titulo = l.tipo === 'chamado' && l.extra ? `${l.nome} · ${l.extra} (abre no LineChat)` : undefined;
  const conteudo = (
    <>
      <Icone size={12} className="shrink-0 text-muted" />
      <span className={`${l.tipo === 'chamado' ? 'shrink-0' : 'truncate'} ${l.existe ? '' : 'line-through text-muted'}`}>{texto}</span>
      {comExtra && l.tipo === 'chamado' && l.extra && <span className="truncate min-w-0 text-muted font-normal">· {l.extra}</span>}
    </>
  );
  const classe = 'inline-flex items-center gap-1 max-w-[260px] rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink-2 hover:border-accent';
  const destino = destinoDaLigacao(l);
  if (!destino) return <span className={classe} title={titulo}>{conteudo}</span>;
  if ('externo' in destino) return <a className={classe} href={destino.externo} target="_blank" rel="noreferrer" title={titulo}>{conteudo}</a>;
  return <Link className={classe} to={destino.interno} title={titulo}>{conteudo}</Link>;
}

/** As ligações de um artigo; na lista, as primeiras e um "+N". */
export function Ligacoes({ ligacoes, max, comExtra }: { ligacoes: LigacaoMostrada[]; max?: number; comExtra?: boolean }) {
  if (!ligacoes.length) return null;
  const mostradas = max ? ligacoes.slice(0, max) : ligacoes;
  return (
    <div className="flex flex-wrap gap-1.5">
      {mostradas.map((l) => <EtiquetaLigacao key={`${l.tipo}:${l.alvo}`} l={l} comExtra={comExtra} />)}
      {ligacoes.length > mostradas.length && <span className="text-[12px] text-muted self-center">+{ligacoes.length - mostradas.length}</span>}
    </div>
  );
}

// ---------- o trecho achado ----------

export function Trecho({ pedacos }: { pedacos: PedacoTrecho[] }) {
  return (
    <p className="text-[13.5px] text-ink-2 line-clamp-3">
      {pedacos.map((p, i) => (p.achado ? <mark key={i} className="bg-signal-soft text-ink rounded px-0.5">{p.texto}</mark> : <Fragment key={i}>{p.texto}</Fragment>))}
    </p>
  );
}

// ---------- o texto simples, desenhado ----------

function Copiavel({ texto }: { texto: string }) {
  const [copiou, setCopiou] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiou(true); setTimeout(() => setCopiou(false), 1600); } catch { /* sem área de transferência: dá para selecionar o texto */ }
  };
  return (
    <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-line bg-surface-2 py-1.5 pl-3 pr-1.5 min-w-0">
      <code className="flex-1 min-w-0 overflow-x-auto whitespace-pre font-mono text-[12.5px] text-ink py-0.5">{texto}</code>
      <button type="button" className="btn-secondary btn-sm shrink-0 py-1" onClick={copiar} title="Copiar o comando">
        {copiou ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
      </button>
    </div>
  );
}

/** Uma linha (ou um parágrafo) com os links, os BC-12 e o `código` desenhados — também o texto do comentário. */
export function Linha({ texto }: { texto: string }) {
  return (
    <>
      {pedacosDaLinha(texto).map((p, i) => {
        if (p.tipo === 'codigo') return <code key={i} className="font-mono text-[12.5px] bg-surface-2 border border-line rounded px-1">{p.texto}</code>;
        if (p.tipo === 'link') return <a key={i} className="link break-all" href={p.href} target="_blank" rel="noreferrer">{p.texto}</a>;
        if (p.tipo === 'artigo') return <Link key={i} className="link font-mono text-[13px]" to={`/base/${p.numero}`}>{p.texto}</Link>;
        return <Fragment key={i}>{p.texto}</Fragment>;
      })}
    </>
  );
}

function Print({ src }: { src: string | undefined }) {
  if (!src) return <div className="mt-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-[12.5px] text-muted">Print que não está mais no artigo.</div>;
  const url = logoSrc(src) ?? src;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block mt-1.5 max-w-[560px]" title="Abrir o print inteiro">
      <img src={url} alt="Print do passo" loading="lazy" className="max-w-full rounded-lg border border-line bg-white" />
    </a>
  );
}

function Bloco({ b, prints }: { b: BlocoTexto; prints: Record<string, string> }) {
  switch (b.tipo) {
    case 'paragrafo': return <p className="whitespace-pre-line"><Linha texto={b.texto} /></p>;
    case 'item': return <div className="grid grid-cols-[16px_minmax(0,1fr)] gap-1.5"><span className="text-muted">•</span><span><Linha texto={b.texto} /></span></div>;
    case 'comando': return <Copiavel texto={b.texto} />;
    case 'imagem': return <Print src={prints[b.anexoId]} />;
    case 'passo':
      return (
        <div className="grid grid-cols-[26px_minmax(0,1fr)] gap-2.5">
          <span className="w-6 h-6 rounded-full bg-surface-2 border border-line text-[12px] font-mono font-medium flex items-center justify-center text-ink">{b.numero}</span>
          <div className="min-w-0 pt-0.5">
            <Linha texto={b.texto} />
            {b.dentro.map((d, i) => <div key={i} className={d.tipo === 'paragrafo' ? 'mt-1 text-ink-2' : ''}><Bloco b={d} prints={prints} /></div>)}
          </div>
        </div>
      );
  }
}

/**
 * O texto de uma parte do artigo, desenhado: linha numerada vira passo, crases viram comando com
 * Copiar, `[print:id]` vira a imagem. `prints` diz onde está cada imagem (o anexo guardado, ou a
 * que acabou de ser colada no formulário).
 */
export function TextoSimples({ texto, prints = {} }: { texto: string | null | undefined; prints?: Record<string, string> }) {
  const blocos = blocosDoTexto(texto);
  if (!blocos.length) return null;
  return <div className="flex flex-col gap-2.5 text-[14.5px] leading-relaxed">{blocos.map((b, i) => <Bloco key={i} b={b} prints={prints} />)}</div>;
}

/** Uma parte do artigo (O que acontece, Como resolver…), com o título e a dica. */
export function Parte({ titulo, dica, children }: { titulo: string; dica?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display font-semibold text-[15.5px] flex flex-wrap items-baseline gap-x-2">{titulo}{dica && <span className="font-body font-normal text-[12.5px] text-muted">{dica}</span>}</h2>
      {children}
    </section>
  );
}

// ---------- a base nas outras telas ----------

/**
 * "3 artigos sobre este cliente": na ficha do cliente, no pop-up do modelo, na ficha do circuito.
 * Sem artigo nenhum, não aparece (a ficha não ganha mais uma linha à toa).
 */
export function ArtigosLigados({ tipo, alvo, sobre, pequeno = false }: { tipo: TipoLigacao; alvo: string | null | undefined; sobre: string; pequeno?: boolean }) {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['base', 'ligados', tipo, alvo], queryFn: () => api.base.ligados(tipo, alvo!), enabled: !!alvo && can('records.read'), staleTime: 60_000 });
  const total = q.data?.total ?? 0;
  if (!alvo || !total) return null;
  return (
    <Popover largura="w-[340px]" alinhar="esquerda" classe={pequeno ? 'btn-secondary btn-sm' : 'btn-secondary'} titulo="Na base de conhecimento"
      botao={() => <span className="inline-flex items-center gap-1.5"><BookOpen size={pequeno ? 13 : 15} className="text-accent" /> {total} {total === 1 ? 'artigo' : 'artigos'} {sobre}</span>}>
      <div className="flex flex-col gap-1">
        <div className="eyebrow mb-1">Base de conhecimento</div>
        {q.data!.artigos.map((a) => (
          <Link key={a.id} to={`/base/${a.numero}`} className="flex items-baseline gap-2 rounded px-1.5 py-1 hover:bg-surface-2 text-[13.5px]">
            <CodigoArtigo codigo={a.codigo} /><span className="min-w-0">{a.titulo}</span>
          </Link>
        ))}
        <Link to={`/base?${tipo}=${encodeURIComponent(alvo)}`} className="link text-[12.5px] mt-1 px-1.5">Ver na base</Link>
      </div>
    </Popover>
  );
}

/** Os artigos que valem para cada chamado da tela (o livrinho), numa consulta só. */
export function useArtigosDosChamados(ids: string[]) {
  const { can } = useAuth();
  const chave = ids.join(',');
  const q = useQuery({ queryKey: ['base', 'para-chamados', chave], queryFn: () => api.base.paraChamados(ids), enabled: ids.length > 0 && can('support.read'), staleTime: 60_000 });
  return q.data ?? {};
}

/** O livrinho com o número de artigos; clicar mostra quais. */
export function LivroDoChamado({ artigos }: { artigos?: ArtigoCurto[] }) {
  if (!artigos?.length) return null;
  return (
    <Popover largura="w-[340px]" alinhar="esquerda" titulo={`${artigos.length} ${artigos.length === 1 ? 'artigo' : 'artigos'} da base para este chamado`}
      classe="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold bg-accent-soft text-accent-ink hover:ring-1 hover:ring-accent"
      botao={() => <><BookOpen size={12} /> <span className="tnum">{artigos.length}</span></>}>
      <div className="flex flex-col gap-1">
        <div className="eyebrow mb-1">Na base de conhecimento</div>
        {artigos.map((a) => (
          <Link key={a.id} to={`/base/${a.numero}`} className="flex items-baseline gap-2 rounded px-1.5 py-1 hover:bg-surface-2 text-[13.5px]">
            <CodigoArtigo codigo={`BC-${a.numero}`} /><span className="min-w-0">{a.titulo}</span>
          </Link>
        ))}
      </div>
    </Popover>
  );
}

/** "Registrar na base": abre o artigo novo já com o que o card tem. Só para quem escreve. */
export function RegistrarNaBase({ cardId, rotulo = false, className = '' }: { cardId: string; rotulo?: boolean; className?: string }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  if (!can('knowledge.write')) return null;
  return (
    <button type="button" className={`btn-ghost btn-sm text-muted px-1.5 py-0.5 ${className}`} title="Registrar na base de conhecimento o que este chamado ensinou" aria-label="Registrar na base de conhecimento"
      onClick={() => navigate(`/base/novo?chamado=${encodeURIComponent(cardId)}`)}>
      <BookPlus size={14} />{rotulo && ' Registrar na base'}
    </button>
  );
}

/**
 * "Como fazer" na ficha do projeto: os artigos da base ligados a ele (o passo a passo que a equipe
 * segue em cada cliente). Quem escreve liga um artigo que já existe ou registra o que o projeto
 * ensinou — no projeto encerrado, esse botão fica em destaque.
 */
export function ComoFazer({ p }: { p: Pick<Projeto, 'id' | 'name' | 'status'> }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const escreve = can('knowledge.write');
  const ligados = useQuery({ queryKey: ['base', 'ligados', 'projeto', p.id], queryFn: () => api.base.ligados('projeto', p.id), staleTime: 60_000 });
  const [escolhendo, setEscolhendo] = useState(false);
  // só busca a lista inteira quando a pessoa vai escolher um artigo
  const publicados = useQuery({ queryKey: ['base', 'lista', 'para-ligar'], queryFn: () => api.base.lista({ situacao: 'publicados', ordem: 'titulo', pageSize: TODOS }), enabled: escolhendo, staleTime: 60_000 });
  const ligar = useMutation({
    mutationFn: (v: { numero: number; ligar: boolean }) => api.base.ligar(v.numero, { tipo: 'projeto', alvo: p.id, ligar: v.ligar }),
    onSuccess: (_r, v) => { void qc.invalidateQueries({ queryKey: ['base'] }); toast.push('ok', v.ligar ? 'Artigo ligado ao projeto' : 'Artigo desligado do projeto'); },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  const artigos = ligados.data?.artigos ?? [];
  if (ligados.isLoading || (!artigos.length && !escreve)) return null;
  const jaLigados = new Set(artigos.map((a) => a.numero));
  const encerrado = p.status === 'concluido';
  const registrar = () => navigate(`/base/novo?projeto=${encodeURIComponent(p.id)}&titulo=${encodeURIComponent(`${p.name}: `)}`);
  return (
    <section className="card p-4 mt-4" id="projeto-como-fazer">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-semibold flex items-center gap-2"><BookOpen size={17} className="text-accent" /> Como fazer</h2>
          <p className="text-[12.5px] text-muted">
            {encerrado ? 'O projeto acabou: o que ele ensinou vale um artigo, para o próximo parecido começar daqui.' : 'Os artigos da base de conhecimento ligados a este projeto.'}
          </p>
        </div>
        {escreve && (
          <div className="flex flex-wrap gap-2">
            <EscolherComBusca valor="" rotulo="Ligar um artigo" procurar="Procurar artigo publicado…" largura="w-[380px]"
              opcoes={(publicados.data?.items ?? []).filter((a) => !jaLigados.has(a.numero)).map((a) => ({ id: String(a.numero), nome: `${a.codigo} · ${a.titulo}` }))}
              onChange={(v) => { if (v) ligar.mutate({ numero: Number(v), ligar: true }); }}
              gatilho={(abrir) => <button type="button" className="btn-secondary btn-sm" onClick={() => { setEscolhendo(true); abrir(); }} disabled={ligar.isPending}>{ligar.isPending ? <Spinner /> : <Link2 size={14} />} Ligar um artigo</button>} />
            <button type="button" className={encerrado ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={registrar}><BookPlus size={14} /> Registrar o que aprendemos</button>
          </div>
        )}
      </div>
      {artigos.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {artigos.map((a) => (
            <li key={a.id} className="flex items-baseline gap-2 group">
              <Link to={`/base/${a.numero}`} className="flex items-baseline gap-2 min-w-0 hover:underline text-[14px]"><CodigoArtigo codigo={a.codigo} /><span className="min-w-0">{a.titulo}</span></Link>
              {escreve && (
                <button type="button" className="text-muted hover:text-bad md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100" title="Desligar do projeto (o artigo continua na base)"
                  aria-label={`Desligar ${a.codigo} do projeto`} onClick={() => ligar.mutate({ numero: a.numero, ligar: false })}><X size={13} /></button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted mt-2">Nenhum artigo ligado ainda.</p>
      )}
    </section>
  );
}
