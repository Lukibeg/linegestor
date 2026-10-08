/**
 * Base de conhecimento (Patch 1.8): a lista.
 *
 * O que alguém descobriu resolvendo um chamado vira um artigo (BC-12). Aqui se procura: sem acento,
 * por pedaço de palavra, no título, nos textos, nas palavras do cliente e no que está ligado
 * (cliente, assunto, modelo…). Os filtros ficam no endereço, e o "Voltar" do artigo devolve a
 * busca como estava.
 *
 * Dois jeitos de ver o mesmo resultado (pedido do Luan na prévia): a **Lista** (o padrão) e o
 * **Kanban**, com uma coluna por produto, assunto, situação ou autor. A escolha fica no endereço e
 * no navegador de cada um.
 *
 * Com a IA ligada (Administração › Ajustes), o **Perguntar à IA** usa o mesmo texto da busca: a IA
 * escolhida responde só com os artigos publicados e diz de qual artigo tirou cada linha.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, Bot, Filter, Kanban, LayoutList, MessageSquare, Plus, Search, X } from 'lucide-react';
import { api, IS_DEMO } from '../../api/index.js';
import type { ArtigoNaLista, OpcoesBase, RespostaIa, TipoLigacao } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Abas, Carregando, Chip, EscolherComBusca, Paginacao, Spinner, TODOS, Vazio, mensagemErro } from '../../components/ui/index.js';
import { relativo } from '../../lib/format.js';
import { useLembrarFiltros } from '../../lib/voltar.js';
import { CodigoArtigo, Ligacoes, Linha, Trecho, telaLarga } from './partes.js';

const POR_PAGINA = 30;
type Situacao = 'publicados' | 'obrigatorios' | 'rascunhos' | 'todos';
const FILTROS = ['produto', 'modulo', 'assunto', 'cliente', 'modelo', 'operadora', 'projeto', 'chamado', 'autor'] as const;
type Vista = 'lista' | 'kanban';
type PorColuna = 'produto' | 'assunto' | 'situacao' | 'autor';
const COLUNAS: Array<{ id: PorColuna; nome: string }> = [
  { id: 'produto', nome: 'Produto' }, { id: 'assunto', nome: 'Assunto do LineChat' }, { id: 'situacao', nome: 'Situação' }, { id: 'autor', nome: 'Autor' },
];
/** A última escolha de cada um (Lista ou Kanban, e as colunas), para abrir a base do jeito que a pessoa usa. */
const lembrado = (chave: string) => { try { return localStorage.getItem(chave); } catch { return null; } };
const lembrar = (chave: string, v: string) => { try { localStorage.setItem(chave, v); } catch { /* sem storage: só não lembra */ } };

export function BaseLista() {
  useLembrarFiltros('/base');
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const q = sp.get('q') ?? '';
  const situacao = (sp.get('situacao') as Situacao) || 'publicados';
  const ordem = sp.get('ordem') ?? 'relevancia';
  const page = Number(sp.get('p') ?? 1);
  const tudo = sp.get('tudo') === '1';
  const vista: Vista = (sp.get('vista') ?? lembrado('gestor.base.vista')) === 'kanban' ? 'kanban' : 'lista';
  const colunasPor: PorColuna = COLUNAS.find((c) => c.id === (sp.get('colunas') ?? lembrado('gestor.base.colunas')))?.id ?? 'produto';
  // no Kanban vêm todos os artigos de uma vez (cada coluna mostra os seus)
  const todos = tudo || vista === 'kanban';
  const [texto, setTexto] = useState(q);
  useEffect(() => { setTexto(q); }, [q]);

  /** Muda um pedaço do endereço; mudar filtro volta para a primeira página. */
  const mudar = (o: Record<string, string | null>, manterPagina = false) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(o)) { if (v == null || v === '') n.delete(k); else n.set(k, v); }
    if (!manterPagina) n.delete('p');
    setSp(n, { replace: true });
  };
  // a busca vai para o endereço um instante depois de parar de digitar
  useEffect(() => {
    if (texto === q) return;
    const t = setTimeout(() => mudar({ q: texto.trim() || null }), 250);
    return () => clearTimeout(t);
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtros = Object.fromEntries(FILTROS.map((f) => [f, sp.get(f) ?? undefined]));
  const lista = useQuery({
    queryKey: ['base', 'lista', q, situacao, ordem, todos ? 1 : page, todos, JSON.stringify(filtros)],
    queryFn: () => api.base.lista({ q: q || undefined, situacao, ordem, ...filtros, page: todos ? 1 : page, pageSize: todos ? TODOS : POR_PAGINA }),
    placeholderData: (anterior) => anterior,
  });
  const opcoes = useQuery({ queryKey: ['base', 'opcoes'], queryFn: () => api.base.opcoes(), staleTime: 5 * 60_000 });
  const pendentes = useQuery({ queryKey: ['base', 'pendentes'], queryFn: () => api.base.pendentes(), staleTime: 60_000 });
  const ia = useQuery({ queryKey: ['base', 'ia'], queryFn: () => api.base.ia(), staleTime: 5 * 60_000 });

  const [resposta, setResposta] = useState<{ pergunta: string; r: RespostaIa } | null>(null);
  const perguntar = useMutation({
    mutationFn: (pergunta: string) => api.base.perguntar(pergunta),
    onSuccess: (r, pergunta) => setResposta({ pergunta, r }),
  });
  const podePerguntar = !!ia.data?.ativa && texto.trim().length >= 3 && !perguntar.isPending;

  const podeEscrever = lista.data?.podeEscrever ?? false;
  const novoComTitulo = (t: string) => navigate(`/base/novo${t ? `?titulo=${encodeURIComponent(t)}` : ''}`);
  const algumFiltro = FILTROS.some((f) => sp.get(f));

  return (
    <Pagina
      titulo="Base de conhecimento"
      sub="O que a equipe descobriu resolvendo chamados, para o próximo achar em segundos."
      acoes={podeEscrever ? <button className="btn-primary" onClick={() => navigate('/base/novo')}><Plus size={15} /> Novo artigo</button> : undefined}
    >
      {!!pendentes.data?.naoLidas && (
        <div className="card border-accent bg-accent-soft p-3 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px]">
          <BookOpen size={16} className="text-accent shrink-0" />
          <b className="text-accent-ink">Leitura obrigatória:</b>
          {pendentes.data.artigos.map((a) => (
            <Link key={a.numero} to={`/base/${a.numero}`} className="inline-flex items-baseline gap-1.5 hover:underline"><CodigoArtigo codigo={a.codigo} /> {a.titulo}</Link>
          ))}
        </div>
      )}

      {/* a busca, e a pergunta à IA com o mesmo texto (Ctrl+Enter) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-9 py-2.5 text-[15px]" autoComplete="off" autoFocus={telaLarga()} id="busca-base"
            placeholder="Procure como o cliente falou: “ligação cai sozinha”, “ramal não registra”, BC-12…"
            value={texto} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && podePerguntar) perguntar.mutate(texto.trim()); }}
          />
          {texto && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost btn-sm text-muted px-1.5" onClick={() => setTexto('')} aria-label="Limpar a busca"><X size={14} /></button>}
        </label>
        {ia.data?.ativa && (
          <button className="btn-secondary py-2.5" id="perguntar-ia" disabled={!podePerguntar} onClick={() => perguntar.mutate(texto.trim())}
            title={`Pergunta à IA (${ia.data.modelo}, ${ia.data.provedor}): ela responde só com os artigos publicados e diz de onde tirou (Ctrl+Enter)`}>
            {perguntar.isPending ? <Spinner /> : <Bot size={16} />} Perguntar à IA
          </button>
        )}
      </div>
      {perguntar.isError && <div className="text-bad text-sm mb-3" role="alert">{mensagemErro(perguntar.error)}</div>}
      {resposta && <RespostaDaIa pergunta={resposta.pergunta} r={resposta.r} onFechar={() => setResposta(null)} podeEscrever={podeEscrever} onEscrever={() => novoComTitulo(resposta.pergunta)} />}

      <div className="flex flex-wrap items-end justify-between gap-x-3">
        {/* na tela larga as abas não encolhem: os botões da direita descem de linha antes de cortar "Todos" */}
        <div className="flex-1 min-w-[260px] lg:min-w-fit">
          <Abas
            atual={situacao}
            onChange={(s) => mudar({ situacao: s === 'publicados' ? null : s })}
            abas={[
              { id: 'publicados' as const, label: 'Artigos' },
              { id: 'obrigatorios' as const, label: 'Leitura obrigatória' },
              ...(podeEscrever || lista.data?.podeCuidar ? [{ id: 'rascunhos' as const, label: lista.data?.podeCuidar ? 'Rascunhos' : 'Meus rascunhos' }] : []),
              { id: 'todos' as const, label: 'Todos' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3 ml-auto">
          {/* dois jeitos de ver o mesmo resultado: a lista (o padrão) e o Kanban */}
          <div className="flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Como ver">
            {(['lista', 'kanban'] as const).map((v) => (
              <button key={v} type="button" id={`base-vista-${v}`} aria-pressed={vista === v}
                onClick={() => { lembrar('gestor.base.vista', v); mudar({ vista: v }); }}
                className={`px-2.5 py-1 text-[12.5px] inline-flex items-center gap-1.5 ${vista === v ? 'bg-accent-soft text-accent-ink font-semibold' : 'text-muted hover:bg-surface-2'}`}>
                {v === 'lista' ? <><LayoutList size={14} /> Lista</> : <><Kanban size={14} /> Kanban</>}
              </button>
            ))}
          </div>
          {vista === 'kanban' && (
            <label className="flex items-center gap-2 text-[12.5px] text-muted">
              Colunas
              <select className="input py-1 w-auto text-[13px]" id="base-colunas" value={colunasPor}
                onChange={(e) => { lembrar('gestor.base.colunas', e.target.value); mudar({ colunas: e.target.value }); }}>
                {COLUNAS.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            Ordem
            <select className="input py-1 w-auto text-[13px]" value={ordem} onChange={(e) => mudar({ ordem: e.target.value === 'relevancia' ? null : e.target.value })}>
              <option value="relevancia">{q ? 'Mais parecidos com a busca' : 'Mexidos por último'}</option>
              <option value="recentes">Mexidos por último</option>
              <option value="titulo">Título (A–Z)</option>
              <option value="numero">Mais novos (BC)</option>
            </select>
          </label>
        </div>
      </div>

      {opcoes.data && <Filtros opcoes={opcoes.data} valor={(f) => sp.get(f) ?? ''} mudar={(f, v) => mudar({ [f]: v || null })} />}
      {algumFiltro && <button className="btn-ghost btn-sm text-muted mb-2" onClick={() => mudar(Object.fromEntries(FILTROS.map((f) => [f, null])))}><X size={13} /> Limpar filtros</button>}

      {lista.isLoading ? <Carregando /> : lista.isError ? <div className="text-bad text-sm">{mensagemErro(lista.error)}</div> : !lista.data?.items.length ? (
        <Vazio
          titulo={q ? `Nada na base para “${q}”` : situacao === 'rascunhos' ? 'Nenhum rascunho' : situacao === 'obrigatorios' ? 'Nenhum artigo de leitura obrigatória' : 'A base ainda está vazia'}
          texto={q
            ? 'Procure com outras palavras (o nome técnico, o jeito do cliente falar) ou tire os filtros. Se você resolveu isso, registre: o próximo vai achar.'
            : 'Quando alguém resolver um chamado que deu trabalho, é aqui que fica o que ele descobriu.'}
          acao={podeEscrever ? <button className="btn-primary" onClick={() => novoComTitulo(q)}><Plus size={15} /> {q ? `Escrever um artigo sobre “${q}”` : 'Escrever o primeiro artigo'}</button> : undefined}
        />
      ) : vista === 'kanban' ? (
        <Quadro itens={lista.data.items} total={lista.data.total} por={colunasPor} opcoes={opcoes.data} />
      ) : (
        <>
          <p className="text-[12.5px] text-muted mb-2 tnum">{lista.data.total} {lista.data.total === 1 ? 'artigo' : 'artigos'}</p>
          <ul className="flex flex-col gap-2.5">
            {lista.data.items.map((a) => <Item key={a.id} a={a} />)}
          </ul>
          <Paginacao page={page} pageSize={POR_PAGINA} total={lista.data.total} onChange={(p) => mudar({ p: String(p) }, true)} tudo={tudo} onTudo={(v) => mudar({ tudo: v ? '1' : null })} />
        </>
      )}
    </Pagina>
  );
}

function Item({ a }: { a: ArtigoNaLista }) {
  return (
    <li className="card p-3.5 sm:p-4 flex flex-col gap-1.5 hover:border-accent transition-colors relative">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <CodigoArtigo codigo={a.codigo} />
        <Link to={`/base/${a.numero}`} className="font-display font-semibold text-[16px] hover:text-accent after:absolute after:inset-0">{a.titulo}</Link>
        {a.situacao === 'rascunho' && <Chip tone="muted">rascunho</Chip>}
        {a.obrigatoria && (a.lidaPorMim ? <Chip tone="ok">leitura obrigatória · lida</Chip> : <Chip tone="accent">leitura obrigatória</Chip>)}
      </div>
      {a.trecho ? <Trecho pedacos={a.trecho} /> : a.resumo ? <p className="text-[13.5px] text-ink-2 line-clamp-2">{a.resumo}</p> : null}
      {/* as etiquetas ficam por cima do link do cartão (são links também) */}
      <div className="relative z-10"><Ligacoes ligacoes={a.ligacoes} max={5} /></div>
      <p className="text-[12px] text-muted">
        {a.autor ? `Escrito por ${a.autor}` : 'Escrito'}{a.atualizadoPor && a.atualizadoPor !== a.autor ? ` · melhorado por ${a.atualizadoPor}` : ''} · {relativo(a.atualizadoEm)}
        {a.comentarios > 0 && <> · <MessageSquare size={12} className="inline -mt-0.5" aria-hidden /> {a.comentarios} {a.comentarios === 1 ? 'comentário' : 'comentários'}</>}
      </p>
    </li>
  );
}

// ---------- o Kanban (pedido do Luan na prévia) ----------

type Coluna = { id: string; nome: string; artigos: ArtigoNaLista[] };
const SITUACOES_DO_QUADRO = [
  { id: 'rascunho', nome: 'Rascunhos' }, { id: 'publicado', nome: 'Publicados' }, { id: 'obrigatoria', nome: 'Leitura obrigatória' },
];

/**
 * As colunas do Kanban. Produto e assunto vêm das ligações: o artigo de dois produtos aparece nas
 * duas colunas (o módulo conta para o produto dele); o que não tem nenhum vai para "Sem …".
 * Dentro de cada coluna, a ordem é a da lista (a "Ordem" escolhida).
 */
function montarColunas(itens: ArtigoNaLista[], por: PorColuna, opcoes?: OpcoesBase): Coluna[] {
  const colunas = new Map<string, Coluna>();
  const por1 = (id: string, nome: string, a: ArtigoNaLista) => {
    const c = colunas.get(id) ?? { id, nome, artigos: [] };
    if (!c.artigos.includes(a)) c.artigos.push(a);
    colunas.set(id, c);
  };
  const produtoDoModulo = new Map((opcoes?.produtos ?? []).flatMap((p) => p.modulos.map((m) => [m.id, p] as const)));
  for (const a of itens) {
    if (por === 'situacao') {
      const s = a.situacao === 'rascunho' ? SITUACOES_DO_QUADRO[0]! : a.obrigatoria ? SITUACOES_DO_QUADRO[2]! : SITUACOES_DO_QUADRO[1]!;
      por1(s.id, s.nome, a);
    } else if (por === 'autor') {
      por1(`autor:${a.autor ?? ''}`, a.autor ?? 'Sem autor', a);
    } else if (por === 'assunto') {
      const assuntos = a.ligacoes.filter((l) => l.tipo === 'assunto');
      if (!assuntos.length) por1('sem', 'Sem assunto', a);
      for (const l of assuntos) por1(`assunto:${l.alvo}`, l.nome, a);
    } else {
      const produtos = new Map<string, string>();
      for (const l of a.ligacoes) {
        if (l.tipo === 'produto') produtos.set(l.alvo, l.nome);
        if (l.tipo === 'modulo') { const p = produtoDoModulo.get(l.alvo); if (p) produtos.set(p.id, p.nome); else if (l.extra) produtos.set(`nome:${l.extra}`, l.extra); }
      }
      if (!produtos.size) por1('sem', 'Sem produto', a);
      for (const [id, nome] of produtos) por1(`produto:${id}`, nome, a);
    }
  }
  const lista = [...colunas.values()];
  const sem = lista.filter((c) => c.id === 'sem' || c.id === 'autor:');
  const resto = lista.filter((c) => !sem.includes(c));
  if (por === 'situacao') resto.sort((x, y) => SITUACOES_DO_QUADRO.findIndex((s) => s.id === x.id) - SITUACOES_DO_QUADRO.findIndex((s) => s.id === y.id));
  else if (por === 'produto') {
    // a ordem do catálogo de produtos (a mesma dos filtros)
    const ordem = (c: Coluna) => { const i = (opcoes?.produtos ?? []).findIndex((p) => `produto:${p.id}` === c.id); return i < 0 ? 999 : i; };
    resto.sort((x, y) => ordem(x) - ordem(y) || x.nome.localeCompare(y.nome, 'pt-BR'));
  } else if (por === 'autor') resto.sort((x, y) => y.artigos.length - x.artigos.length || x.nome.localeCompare(y.nome, 'pt-BR'));
  else resto.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  return [...resto, ...sem];
}

/** O que a coluna já diz não se repete no cartão. */
const TIPO_DA_COLUNA: Partial<Record<PorColuna, TipoLigacao[]>> = { produto: ['produto', 'modulo'], assunto: ['assunto'] };

function Quadro({ itens, total, por, opcoes }: { itens: ArtigoNaLista[]; total: number; por: PorColuna; opcoes?: OpcoesBase }) {
  const colunas = useMemo(() => montarColunas(itens, por, opcoes), [itens, por, opcoes]);
  const repetidos = colunas.reduce((n, c) => n + c.artigos.length, 0) > itens.length;
  const esconder = TIPO_DA_COLUNA[por] ?? [];
  return (
    <>
      <p className="text-[12.5px] text-muted mb-2 tnum">
        {total} {total === 1 ? 'artigo' : 'artigos'} em {colunas.length} {colunas.length === 1 ? 'coluna' : 'colunas'}
        {repetidos && ` · o artigo ligado a mais de um ${por === 'assunto' ? 'assunto' : 'produto'} aparece em cada coluna`}
      </p>
      {/* o quadro rola para o lado dentro dele mesmo; a página não */}
      <div className="overflow-x-auto pb-2 -mx-1 px-1" id="base-quadro">
        {/* poucas colunas se esticam até a largura da tela; muitas ficam com 248 px e o quadro rola */}
        <div className="flex items-start gap-3">
          {colunas.map((c) => (
            <section key={c.id} className="flex-[1_0_248px] max-w-[360px] rounded-xl border border-line bg-surface-2 p-2 flex flex-col gap-2" aria-label={c.nome}>
              <header className="flex items-center justify-between gap-2 px-1.5 pt-0.5">
                <h3 className="font-display font-semibold text-[13.5px] truncate" title={c.nome}>{c.nome}</h3>
                <span className="text-muted text-[12px] tnum shrink-0">{c.artigos.length}</span>
              </header>
              <ul className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
                {c.artigos.map((a) => <CartaoDoQuadro key={a.id} a={a} esconder={esconder} />)}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

function CartaoDoQuadro({ a, esconder }: { a: ArtigoNaLista; esconder: TipoLigacao[] }) {
  const ligacoes = a.ligacoes.filter((l) => !esconder.includes(l.tipo));
  return (
    <li className="card p-2.5 flex flex-col gap-1.5 relative hover:border-accent transition-colors">
      <div className="flex flex-wrap items-center gap-1.5">
        <CodigoArtigo codigo={a.codigo} />
        {a.situacao === 'rascunho' && <Chip tone="muted">rascunho</Chip>}
        {a.obrigatoria && (a.lidaPorMim ? <Chip tone="ok">leitura obrigatória · lida</Chip> : <Chip tone="accent">leitura obrigatória</Chip>)}
      </div>
      <Link to={`/base/${a.numero}`} className="font-semibold text-[13.5px] leading-snug hover:text-accent after:absolute after:inset-0">{a.titulo}</Link>
      {ligacoes.length > 0 && <div className="relative z-10"><Ligacoes ligacoes={ligacoes} max={2} /></div>}
      <p className="text-[11.5px] text-muted">
        {a.autor ?? '—'} · {relativo(a.atualizadoEm)}
        {a.comentarios > 0 && <> · <MessageSquare size={11} className="inline -mt-0.5" aria-label="comentários" /> {a.comentarios}</>}
      </p>
    </li>
  );
}

/** Os filtros pelo que está ligado: produto, assunto, cliente, modelo, operadora e autor. */
function Filtros({ opcoes, valor, mudar }: { opcoes: OpcoesBase; valor: (f: string) => string; mudar: (f: string, v: string) => void }) {
  const produtos = useMemo(() => opcoes.produtos.map((p) => ({ id: p.id, nome: p.nome })), [opcoes]);
  const modulos = useMemo(() => opcoes.produtos.flatMap((p) => p.modulos.map((m) => ({ id: m.id, nome: `${p.nome} › ${m.nome}` }))), [opcoes]);
  const projeto = opcoes.projetos.find((p) => p.id === valor('projeto'));
  const caixa = 'input py-1.5 text-[13px] w-auto max-w-[220px]';
  // no celular os filtros ficam guardados atrás de um botão (são sete caixas)
  const [abertos, setAbertos] = useState(false);
  const ligados = ['produto', 'modulo', 'assunto', 'cliente', 'modelo', 'operadora', 'autor'].filter((f) => valor(f)).length;
  return (
    <>
    <button type="button" className="btn-secondary btn-sm mb-3 md:hidden" onClick={() => setAbertos((v) => !v)} aria-expanded={abertos}>
      <Filter size={14} /> Filtros{ligados > 0 && <span className="text-accent tnum">({ligados})</span>}
    </button>
    <div className={`${abertos ? 'flex' : 'hidden'} md:flex flex-wrap items-center gap-2 mb-3`}>
      <EscolherComBusca className={caixa} rotulo="Produto" valor={valor('produto')} vazio="Todos os produtos" opcoes={produtos} onChange={(v) => mudar('produto', v)} />
      {modulos.length > 0 && <EscolherComBusca className={caixa} rotulo="Módulo" valor={valor('modulo')} vazio="Todos os módulos" opcoes={modulos} onChange={(v) => mudar('modulo', v)} />}
      {opcoes.assuntos.length > 0 && <EscolherComBusca className={caixa} rotulo="Assunto" valor={valor('assunto')} vazio="Todos os assuntos" opcoes={opcoes.assuntos.map((a) => ({ id: a, nome: a }))} onChange={(v) => mudar('assunto', v)} />}
      <EscolherComBusca className={caixa} rotulo="Cliente" valor={valor('cliente')} vazio="Todos os clientes" opcoes={opcoes.clientes} onChange={(v) => mudar('cliente', v)} />
      <EscolherComBusca className={caixa} rotulo="Modelo" valor={valor('modelo')} vazio="Todos os modelos" opcoes={opcoes.modelos} onChange={(v) => mudar('modelo', v)} />
      <EscolherComBusca className={caixa} rotulo="Operadora" valor={valor('operadora')} vazio="Todas as operadoras" opcoes={opcoes.operadoras} onChange={(v) => mudar('operadora', v)} />
      {opcoes.autores.length > 1 && <EscolherComBusca className={caixa} rotulo="Autor" valor={valor('autor')} vazio="Qualquer autor" opcoes={opcoes.autores} onChange={(v) => mudar('autor', v)} />}
      {valor('projeto') && <Chip tone="accent">Projeto: {projeto?.nome ?? '?'} <button className="ml-1" onClick={() => mudar('projeto', '')} aria-label="Tirar o filtro do projeto"><X size={12} /></button></Chip>}
      {valor('chamado') && <Chip tone="accent">Ligados ao chamado <button className="ml-1" onClick={() => mudar('chamado', '')} aria-label="Tirar o filtro do chamado"><X size={12} /></button></Chip>}
    </div>
    </>
  );
}

/** A resposta da IA: linha a linha, com os artigos de onde saiu cada uma, e os artigos que foram para ela. */
function RespostaDaIa({ pergunta, r, onFechar, podeEscrever, onEscrever }: { pergunta: string; r: RespostaIa; onFechar: () => void; podeEscrever: boolean; onEscrever: () => void }) {
  const custo = r.custo == null ? null : r.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  return (
    <section className="card p-4 mb-4 border-accent" id="resposta-ia" aria-live="polite">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="eyebrow flex items-center gap-1.5"><Bot size={13} /> A IA respondeu, com os artigos da base</div>
          <p className="text-[13px] text-muted mt-0.5 truncate">“{pergunta}”</p>
        </div>
        <button className="btn-ghost btn-sm text-muted" onClick={onFechar} aria-label="Fechar a resposta"><X size={15} /></button>
      </div>
      <div className="text-[14.5px] leading-relaxed flex flex-col gap-0.5">
        {r.trechos.map((t, i) => (t.texto ? (
          <p key={i} className="whitespace-pre-wrap break-words">
            <Linha texto={t.texto} />
            {t.fontes.map((n) => <Link key={n} to={`/base/${n}`} className="ml-1 align-super text-[10.5px] font-mono text-accent-ink hover:underline" title={`De onde saiu: BC-${n}`}>BC-{n}</Link>)}
          </p>
        ) : <div key={i} className="h-2" aria-hidden />))}
      </div>
      {!r.achou && podeEscrever && (
        <p className="text-[13px] mt-3">
          {r.artigos.length ? 'A IA não citou nenhum dos artigos que leu (confira abaixo). ' : 'A base ainda não tem isso. '}
          Quando resolver, <button className="link font-semibold" onClick={onEscrever}>escreva o artigo</button>.
        </p>
      )}
      {r.artigos.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line flex flex-col gap-1">
          <div className="text-[12px] text-muted">{r.achou ? 'De onde saiu a resposta' : 'Artigos que foram para a IA'}</div>
          {r.artigos.map((a) => (
            <Link key={a.numero} to={`/base/${a.numero}`} className={`flex items-baseline gap-2 text-[13.5px] hover:underline ${a.citado ? '' : 'text-muted'}`}>
              <CodigoArtigo codigo={a.codigo} /> {a.titulo}{!a.citado && r.achou && <span className="text-[11.5px]">(lido, não citado)</span>}
            </Link>
          ))}
        </div>
      )}
      <p className="text-[11.5px] text-muted mt-3">
        {IS_DEMO ? r.modelo : `${r.modelo} · ${r.provedor}`}{custo != null && ` · custou uns US$ ${custo}`} · confira no artigo antes de mexer no cliente
      </p>
    </section>
  );
}
