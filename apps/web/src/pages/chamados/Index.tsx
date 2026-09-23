/**
 * Chamados de suporte — o que o Grafana mostrava, dentro do Gestor.
 *
 * Os chamados continuam sendo abertos e trabalhados no LineChat (o Kanban da equipe). Aqui é só
 * leitura: uma cópia do painel, atualizada a cada minuto, contada e filtrada.
 *
 * Três abas, porque são três perguntas diferentes:
 *  - **Hoje** — o que chegou hoje, e a que horas;
 *  - **Em aberto** — o que está na mesa agora, e há quanto tempo;
 *  - **Período** — quantos por dia, num intervalo escolhido.
 *
 * Os filtros (etapa, responsável, etiqueta e cada campo de lista do card) valem para a tela
 * inteira e ficam no endereço, como nas outras listas. Clicar numa barra (ou fatia) filtra por ela.
 *
 * Cada gráfico de lista mostra **barras ou pizza**, à escolha de quem olha (fica guardado neste
 * navegador). Produto, Tipo de chamado e Canal abrem em pizza, como eram no Grafana; o resto,
 * em barras — lista longa (50 clientes, 86 assuntos) não cabe numa pizza.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Archive, BarChartHorizontal, CalendarRange, ExternalLink, Filter, Headset, ListFilter, PieChart, RefreshCw, Search, Tag, TriangleAlert, UserRound, X } from 'lucide-react';
import { api } from '../../api/index.js';
import type { ItemRanking, LinhaChamado, OpcoesChamados, ResumoChamados } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Abas, Carregando, Chip, Kpi, Paginacao, TODOS, Toggle, Vazio } from '../../components/ui/index.js';
import { BarrasRanking, Colunas, Pizza } from '../../components/graficos.js';
import { FiltroEmBotao, type GrupoFiltro } from '../../lib/filtros.js';
import { SeletorColunas, useColunasEscolhidas, type Coluna } from '../../lib/colunas.js';
import { ThN, TdN, contarDe } from '../../lib/contagem.js';
import { Th, useOrdenacao } from '../../lib/ordenacao.js';
import { useLembrarFiltros } from '../../lib/voltar.js';
import { useAuth } from '../../lib/auth.js';
import { data, relativo } from '../../lib/format.js';

type Aba = 'hoje' | 'abertos' | 'periodo';
const ABAS: Array<{ id: Aba; label: string }> = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'abertos', label: 'Em aberto' },
  { id: 'periodo', label: 'Período' },
];
const MULTI = ['etapa', 'responsavel', 'etiqueta', 'campo'] as const;
const POR_PAGINA = 50;

/** AAAA-MM-DD de hoje e de n dias atrás, no fuso de quem olha (a equipe está toda em Brasília). */
const diaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return diaLocal(d); };

export function Chamados() {
  useLembrarFiltros('/chamados');
  const [sp, setSp] = useSearchParams();
  const { can } = useAuth();
  const aba = (['hoje', 'abertos', 'periodo'].includes(sp.get('aba') ?? '') ? sp.get('aba') : 'hoje') as Aba;

  const filtros = useMemo(() => ({
    aba,
    de: aba === 'periodo' ? sp.get('de') ?? undefined : undefined,
    ate: aba === 'periodo' ? sp.get('ate') ?? undefined : undefined,
    etapa: sp.getAll('etapa'), responsavel: sp.getAll('responsavel'), etiqueta: sp.getAll('etiqueta'), campo: sp.getAll('campo'),
    busca: sp.get('busca') ?? undefined,
    arquivados: sp.get('arquivados') === '1' ? 'true' : undefined,
  }), [sp, aba]);
  const chave = JSON.stringify(filtros);

  const o = useOrdenacao('aberto', 'desc');
  const page = Number(sp.get('p') ?? 1);
  const tudo = sp.get('tudo') === '1';

  const opcoes = useQuery({ queryKey: ['chamados', 'opcoes'], queryFn: () => api.chamados.opcoes(), refetchInterval: 60_000 });
  const resumo = useQuery({ queryKey: ['chamados', 'resumo', chave], queryFn: () => api.chamados.resumo(filtros), refetchInterval: 60_000, placeholderData: keepPreviousData });
  const lista = useQuery({
    queryKey: ['chamados', 'lista', chave, o.ord, o.dir, page, tudo],
    queryFn: () => api.chamados.lista({ ...filtros, sort: o.ord, dir: o.dir, page: tudo ? 1 : page, pageSize: tudo ? TODOS : POR_PAGINA }),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  /** Troca um filtro no endereço; mexer em filtro volta para a página 1. */
  const mudar = (fn: (n: URLSearchParams) => void) => {
    const n = new URLSearchParams(sp);
    fn(n);
    n.delete('p');
    setSp(n, { replace: true });
  };
  const definirLista = (nome: string, valores: string[]) => mudar((n) => { n.delete(nome); valores.forEach((v) => n.append(nome, v)); });
  const acrescentar = (nome: string, valor: string) => { if (!sp.getAll(nome).includes(valor)) mudar((n) => n.append(nome, valor)); };
  const tirar = (nome: string, valor: string) => definirLista(nome, sp.getAll(nome).filter((x) => x !== valor));
  const limpar = () => mudar((n) => { MULTI.forEach((k) => n.delete(k)); n.delete('busca'); n.delete('arquivados'); });

  const op = opcoes.data;
  if (opcoes.isLoading) return <Pagina titulo="Chamados"><Carregando /></Pagina>;
  if (op && !op.configurado && op.totalCards === 0) {
    return (
      <Pagina titulo="Chamados" sub="Os chamados de suporte do LineChat, contados e filtrados.">
        <Vazio
          titulo="A leitura do LineChat ainda não foi ligada"
          texto="Os chamados vêm do painel de suporte do LineChat. Para começar, alguém da administração cola a chave de API do LineChat e escolhe o painel em Administração › Ajustes. A primeira leitura traz todos os chamados de uma vez; depois, a cada minuto, só o que mudou."
          acao={can('admin.manage') ? <Link className="btn-primary" to="/admin/ajustes">Ir para os Ajustes</Link> : undefined}
        />
      </Pagina>
    );
  }

  const r = resumo.data;
  const temFiltro = MULTI.some((k) => sp.getAll(k).length) || !!sp.get('busca') || sp.get('arquivados') === '1';

  return (
    <Pagina
      titulo="Chamados"
      sub={<>A cópia do painel <b className="text-ink-2">{op?.painelNome || 'de suporte'}</b> do LineChat. Os chamados são abertos e trabalhados lá; aqui é só leitura.</>}
      acoes={<>
        <Situacao op={op} />
        {op?.linkDoPainel && <a className="btn-secondary btn-sm" href={op.linkDoPainel} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir no LineChat</a>}
      </>}
    >
      <Abas atual={aba} onChange={(a) => mudar((n) => { n.set('aba', a); if (a !== 'periodo') { n.delete('de'); n.delete('ate'); } })} abas={ABAS} />

      {/* ---------- filtros ---------- */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {aba === 'periodo' && r && <Periodo de={r.de} ate={r.ate} onChange={(de, ate) => mudar((n) => { n.set('de', de); n.set('ate', ate); })} />}
        <label className="relative">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-8 w-[220px]" id="chamados-busca" placeholder="Procurar (IS-3607, texto…)" autoComplete="off"
            defaultValue={sp.get('busca') ?? ''} key={sp.get('busca') ?? ''}
            onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); mudar((n) => { if (v) n.set('busca', v); else n.delete('busca'); }); } }}
            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (sp.get('busca') ?? '')) mudar((n) => { if (v) n.set('busca', v); else n.delete('busca'); }); }}
          />
        </label>
        {op && <Filtros op={op} sp={sp} definirLista={definirLista} />}
        <label className="flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer ml-1" title="Cards arquivados no LineChat. O Grafana não contava.">
          <Toggle checked={sp.get('arquivados') === '1'} onChange={(v) => mudar((n) => { if (v) n.set('arquivados', '1'); else n.delete('arquivados'); })} />
          <Archive size={14} /> incluir arquivados
        </label>
      </div>
      {op && temFiltro && <FiltrosAtivos op={op} sp={sp} tirar={tirar} limpar={limpar} />}

      {!r ? <Carregando /> : (
        <div className={`flex flex-col gap-4 transition-opacity ${resumo.isFetching && resumo.isPlaceholderData ? 'opacity-60' : ''}`}>
          {/* ---------- números ---------- */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {r.kpis.map((k) => <Kpi key={k.id} label={k.label} valor={k.valor} sub={k.sub} tone={k.tom} />)}
          </div>
          {temFiltro && <p className="text-[12.5px] text-muted -mt-2 flex items-center gap-1.5"><Filter size={13} /> Os números acima e abaixo obedecem aos filtros.</p>}

          {/* ---------- a série do tempo ---------- */}
          <section className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="font-display font-semibold">{r.serie.titulo}</h2>
              <span className="text-[12.5px] text-muted">{r.serie.sub}{aba === 'periodo' && r.serie.pontos.length <= 92 && r.serie.pontos[0]?.id.length === 10 ? ' Clique num dia para ver só ele.' : ''}</span>
            </div>
            <Colunas
              pontos={r.serie.pontos}
              vazio={aba === 'hoje' ? 'Nenhum chamado aberto hoje ainda.' : 'Nenhum chamado aqui.'}
              aoClicar={aba === 'periodo' && r.serie.pontos[0]?.id.length === 10 ? (dia) => mudar((n) => { n.set('de', dia); n.set('ate', dia); }) : undefined}
            />
          </section>

          {/* ---------- quem e o quê ---------- */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 min-w-0">
            <Ranking id="etapa" titulo="Por etapa" sub="na ordem do Kanban" itens={r.porEtapa} aoClicar={(v) => acrescentar('etapa', v)} semOrdenar />
            <Ranking id="responsavel" titulo="Por responsável" itens={r.porResponsavel} aoClicar={(v) => acrescentar('responsavel', v)} />
            {r.porCampo.map((c) => (
              <Ranking
                key={c.key} id={`campo:${c.key}`} titulo={`Por ${c.name.toLowerCase()}`} sub={c.multiplo ? 'um card pode contar em mais de um' : undefined}
                multiplo={c.multiplo} itens={c.itens} aoClicar={(v) => acrescentar('campo', `${c.key}=${v}`)}
              />
            ))}
            <Ranking id="etiqueta" titulo="Por etiqueta" sub="um card pode ter várias" multiplo itens={r.porEtiqueta} aoClicar={(v) => acrescentar('etiqueta', v)} />
          </div>

          {/* ---------- a tabela ---------- */}
          <Tabela op={op!} total={r.total} lista={lista.data} carregando={lista.isLoading} o={o} page={page} tudo={tudo}
            setPage={(p) => { const n = new URLSearchParams(sp); n.set('p', String(p)); setSp(n, { replace: true }); }}
            setTudo={(v) => { const n = new URLSearchParams(sp); if (v) n.set('tudo', '1'); else n.delete('tudo'); n.delete('p'); setSp(n, { replace: true }); }}
          />
        </div>
      )}
    </Pagina>
  );
}

// ---------- peças ----------

/** "Atualizado há 1 min" — ou o erro, para ninguém confiar num número parado sem saber. */
function Situacao({ op }: { op?: OpcoesChamados }) {
  if (!op?.sincronizadoEm) return <Chip tone="muted">ainda não sincronizado</Chip>;
  if (op.ultimaOk === false) {
    return <span title={op.ultimaMsg ?? ''}><Chip tone="bad"><TriangleAlert size={12} className="inline -mt-0.5 mr-1" />a leitura falhou {relativo(op.sincronizadoEm)}</Chip></span>;
  }
  return <span title={`Última leitura: ${data(op.sincronizadoEm, true)}. ${op.ultimaMsg ?? ''}`}><Chip tone="ok"><RefreshCw size={11} className="inline -mt-0.5 mr-1" />atualizado {relativo(op.sincronizadoEm)}</Chip></span>;
}

function Periodo({ de, ate, onChange }: { de: string; ate: string; onChange: (de: string, ate: string) => void }) {
  const hoje = diaLocal();
  const inicioMes = hoje.slice(0, 8) + '01';
  const d = new Date(); d.setDate(0); // último dia do mês passado
  const fimMesPassado = diaLocal(d);
  const inicioMesPassado = fimMesPassado.slice(0, 8) + '01';
  const atalhos: Array<[string, string, string]> = [
    ['7 dias', diasAtras(6), hoje],
    ['30 dias', diasAtras(29), hoje],
    ['Este mês', inicioMes, hoje],
    ['Mês passado', inicioMesPassado, fimMesPassado],
    ['12 meses', diasAtras(364), hoje],
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CalendarRange size={15} className="text-muted" />
      <input type="date" className="input w-[150px]" id="chamados-de" value={de} max={ate} onChange={(e) => e.target.value && onChange(e.target.value, ate)} />
      <span className="text-muted text-sm">até</span>
      <input type="date" className="input w-[150px]" id="chamados-ate" value={ate} min={de} onChange={(e) => e.target.value && onChange(de, e.target.value)} />
      {atalhos.map(([rotulo, a, b]) => (
        <button key={rotulo} className={`btn-sm ${a === de && b === ate ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange(a, b)}>{rotulo}</button>
      ))}
    </div>
  );
}

function Filtros({ op, sp, definirLista }: { op: OpcoesChamados; sp: URLSearchParams; definirLista: (nome: string, valores: string[]) => void }) {
  const vazio = op.vazio;
  const campo = (key: string) => sp.getAll('campo').filter((x) => x.startsWith(`${key}=`));
  const outrosCampos = (key: string) => sp.getAll('campo').filter((x) => !x.startsWith(`${key}=`));
  const grupo = (opcoes: Array<{ key: string; label: string; cor?: string }>): GrupoFiltro[] => [{ opcoes }];
  return (
    <>
      <FiltroEmBotao icone={ListFilter} nome="Etapa" escolhidos={sp.getAll('etapa')} onChange={(v) => definirLista('etapa', v)}
        grupos={grupo(op.etapas.map((e) => ({ key: e.id, label: e.title + (e.isFinal ? ' (final)' : '') })))} />
      <FiltroEmBotao icone={UserRound} nome="Responsável" escolhidos={sp.getAll('responsavel')} onChange={(v) => definirLista('responsavel', v)}
        grupos={grupo([...op.responsaveis.map((n) => ({ key: n, label: n })), { key: vazio, label: 'Sem responsável' }])} />
      {op.campos.map((c) => (
        <FiltroEmBotao key={c.key} icone={Filter} nome={c.name} escolhidos={campo(c.key)} largura="w-[300px]"
          onChange={(v) => definirLista('campo', [...outrosCampos(c.key), ...v])}
          grupos={grupo([...c.options.map((x) => ({ key: `${c.key}=${x}`, label: x })), { key: `${c.key}=${vazio}`, label: 'Não preenchido' }])} />
      ))}
      <FiltroEmBotao icone={Tag} nome="Etiqueta" escolhidos={sp.getAll('etiqueta')} onChange={(v) => definirLista('etiqueta', v)}
        grupos={grupo([...op.etiquetas.map((t) => ({ key: t.id, label: t.name, cor: t.color ?? undefined })), { key: vazio, label: 'Sem etiqueta' }])} />
    </>
  );
}

/** O que está filtrado, escrito — cada um com o seu X. */
function FiltrosAtivos({ op, sp, tirar, limpar }: { op: OpcoesChamados; sp: URLSearchParams; tirar: (nome: string, valor: string) => void; limpar: () => void }) {
  const vazio = op.vazio;
  const itens: Array<{ nome: string; valor: string; rotulo: ReactNode }> = [];
  for (const v of sp.getAll('etapa')) itens.push({ nome: 'etapa', valor: v, rotulo: <>Etapa: <b>{op.etapas.find((e) => e.id === v)?.title ?? 'sem etapa'}</b></> });
  for (const v of sp.getAll('responsavel')) itens.push({ nome: 'responsavel', valor: v, rotulo: <>Responsável: <b>{v === vazio ? 'sem responsável' : v}</b></> });
  for (const v of sp.getAll('campo')) {
    const i = v.indexOf('='); const c = op.campos.find((x) => x.key === v.slice(0, i)); const val = v.slice(i + 1);
    itens.push({ nome: 'campo', valor: v, rotulo: <>{c?.name ?? v.slice(0, i)}: <b>{val === vazio ? 'não preenchido' : val}</b></> });
  }
  for (const v of sp.getAll('etiqueta')) itens.push({ nome: 'etiqueta', valor: v, rotulo: <>Etiqueta: <b>{v === vazio ? 'sem etiqueta' : op.etiquetas.find((t) => t.id === v)?.name ?? '?'}</b></> });
  if (sp.get('busca')) itens.push({ nome: 'busca', valor: sp.get('busca')!, rotulo: <>Procurando: <b>{sp.get('busca')}</b></> });
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4">
      {itens.map((x) => (
        <span key={x.nome + x.valor} className="inline-flex items-center gap-1 rounded-full bg-accent-soft text-accent-ink text-[12.5px] pl-2.5 pr-1 py-0.5">
          {x.rotulo}
          <button className="hover:bg-surface-2 rounded-full p-0.5" aria-label="Tirar este filtro" onClick={() => tirar(x.nome, x.valor)}><X size={12} /></button>
        </span>
      ))}
      {sp.get('arquivados') === '1' && <Chip tone="muted">com arquivados</Chip>}
      <button className="btn-ghost btn-sm" onClick={limpar}>Limpar filtros</button>
    </div>
  );
}

type Forma = 'barras' | 'pizza';
/** Os gráficos que abrem em pizza (como eram no Grafana). Chave do campo no LineChat. */
const PIZZA_PADRAO = new Set(['campo:plataforma', 'campo:tipo-de-chamado-24', 'campo:meio-solicita-o']);
const CHAVE_FORMAS = 'gestor.chamados.graficos';

/** Barras ou pizza, por gráfico, guardado neste navegador (sem storage, só não lembra). */
function useForma(id: string): [Forma, (f: Forma) => void] {
  const padrao: Forma = PIZZA_PADRAO.has(id) ? 'pizza' : 'barras';
  const [forma, setForma] = useState<Forma>(() => {
    try { const m = JSON.parse(localStorage.getItem(CHAVE_FORMAS) ?? '{}') as Record<string, Forma>; return m[id] ?? padrao; } catch { return padrao; }
  });
  const mudar = (f: Forma) => {
    setForma(f);
    try { const m = JSON.parse(localStorage.getItem(CHAVE_FORMAS) ?? '{}') as Record<string, Forma>; m[id] = f; localStorage.setItem(CHAVE_FORMAS, JSON.stringify(m)); } catch { /* sem storage */ }
  };
  return [forma, mudar];
}

/**
 * Um gráfico de lista: em barras (os 8 maiores e o "ver todos" — nenhuma lista esconde linhas) ou
 * em pizza (as 6 maiores fatias, o resto em "Outros", que abre a lista). Clicar filtra a tela.
 */
function Ranking({ id, titulo, sub, itens, aoClicar, semOrdenar = false, multiplo = false }: {
  id: string; titulo: string; sub?: string; itens: ItemRanking[]; aoClicar: (valor: string) => void; semOrdenar?: boolean;
  /** um card conta em mais de uma fatia: a pizza soma marcações, não chamados */
  multiplo?: boolean;
}) {
  const [todos, setTodos] = useState(false);
  const [forma, setForma] = useForma(id);
  const LIMITE = 8;
  const mostrar = todos || semOrdenar ? itens : itens.slice(0, LIMITE);
  const soma = itens.reduce((a, x) => a + x.n, 0);
  const botao = (f: Forma, Icone: typeof PieChart, rotulo: string) => (
    <button
      type="button" onClick={() => setForma(f)} aria-pressed={forma === f} title={rotulo} aria-label={`${titulo}: ${rotulo.toLowerCase()}`}
      className={`p-1 rounded ${forma === f ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink'}`}
    >
      <Icone size={15} />
    </button>
  );
  return (
    <section className="card p-4 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="font-display font-semibold leading-tight">{titulo}</h2>
          <span className="text-[12px] text-muted">{sub ?? (itens.length ? `${itens.length} ${itens.length === 1 ? 'valor' : 'valores'}` : '')}</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 shrink-0" role="group" aria-label="Como mostrar">
          {botao('barras', BarChartHorizontal, 'Ver em barras')}
          {botao('pizza', PieChart, 'Ver em pizza')}
        </div>
      </div>
      {forma === 'pizza' ? (
        <Pizza
          partes={itens.map((x) => ({ id: x.valor, rotulo: x.rotulo, n: x.n, neutro: x.valor === '__vazio__' }))}
          rotuloCentro={multiplo ? 'marcações' : itens.length ? 'chamados' : ''}
          aoClicar={aoClicar}
          vazio="Nenhum chamado aqui."
        />
      ) : (
        <>
          <BarrasRanking
            dados={mostrar.map((x) => ({
              id: x.valor,
              rotulo: <span className="flex items-center gap-1.5 min-w-0">{x.cor && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: x.cor }} aria-hidden />}<span className={`truncate ${x.valor === '__vazio__' ? 'text-muted italic' : ''}`}>{x.rotulo}</span></span>,
              valor: x.n,
              titulo: `${x.rotulo}: ${x.n} (${soma ? Math.round((x.n / soma) * 100) : 0}%) — clique para filtrar`,
            }))}
            acao={aoClicar}
            larguraRotulo="w-[45%] sm:w-[190px]"
            vazio="Nenhum chamado aqui."
          />
          {!semOrdenar && itens.length > LIMITE && (
            <button className="btn-ghost btn-sm mt-2" onClick={() => setTodos((v) => !v)}>{todos ? 'Mostrar só os 8 maiores' : `Ver todos (${itens.length})`}</button>
          )}
        </>
      )}
    </section>
  );
}

function Tabela({ op, total, lista, carregando, o, page, tudo, setPage, setTudo }: {
  op: OpcoesChamados; total: number; lista?: { items: LinhaChamado[]; total: number; page: number; pageSize: number }; carregando: boolean;
  o: ReturnType<typeof useOrdenacao>; page: number; tudo: boolean; setPage: (p: number) => void; setTudo: (v: boolean) => void;
}) {
  const colunas: Coluna<LinhaChamado>[] = useMemo(() => [
    { id: 'titulo', label: 'Título', grupo: 'Chamado', render: (c) => <span className="line-clamp-2 min-w-[220px]">{c.title || <span className="text-muted">(sem título)</span>}</span> },
    { id: 'etapa', label: 'Etapa', grupo: 'Chamado', render: (c) => <span className="whitespace-nowrap">{c.stepTitle ?? '—'}{c.arquivado && <Chip tone="muted" className="ml-1">arquivado</Chip>}</span> },
    { id: 'responsavel', label: 'Responsável', grupo: 'Chamado', render: (c) => c.responsavel ?? <span className="text-muted">—</span> },
    ...op.campos.map((f): Coluna<LinhaChamado> => ({ id: `campo:${f.key}`, label: f.name, grupo: 'Campos do card', render: (c) => c.campos[f.key] ?? <span className="text-muted">—</span> })),
    { id: 'etiquetas', label: 'Etiquetas', grupo: 'Chamado', ordenavel: false, render: (c) => <span className="flex flex-wrap gap-1">{c.etiquetas.map((t) => <span key={t.id} className="text-[11px] rounded px-1.5 py-0.5 border border-line whitespace-nowrap" style={{ borderColor: t.color ?? undefined }}>{t.name}</span>)}</span> },
    { id: 'aberto', label: 'Aberto em', grupo: 'Datas', render: (c) => <span className="whitespace-nowrap tnum">{data(c.createdAt, true)}</span> },
    { id: 'atualizado', label: 'Última alteração', grupo: 'Datas', render: (c) => <span className="whitespace-nowrap tnum" title={data(c.updatedAt, true)}>{relativo(c.updatedAt)}</span> },
    { id: 'fechado', label: 'Fechado em', grupo: 'Datas', render: (c) => (c.fechado && c.closedAt ? <span className="whitespace-nowrap tnum" title={c.closedEstimated ? 'Data estimada: o chamado já estava fechado quando a sincronização começou' : undefined}>{data(c.closedAt, true)}{c.closedEstimated ? ' *' : ''}</span> : <span className="text-muted">—</span>) },
    { id: 'vencimento', label: 'Vencimento', grupo: 'Datas', render: (c) => (c.dueDate ? <span className={`whitespace-nowrap tnum ${c.isOverdue ? 'text-bad font-semibold' : ''}`}>{data(c.dueDate)}</span> : <span className="text-muted">—</span>) },
  ], [op.campos]);
  // o padrão: o que a equipe olha primeiro no card (os três primeiros campos são Cliente, Tipo e Produto)
  const padrao = useMemo(() => ['titulo', 'etapa', 'responsavel', ...op.campos.slice(0, 3).map((f) => `campo:${f.key}`), 'aberto'], [op.campos]);
  const escolha = useColunasEscolhidas('gestor.colunas.chamados', padrao);
  const visiveis = colunas.filter((c) => escolha.ids.includes(c.id));
  const numero = contarDe(tudo ? 1 : page, tudo ? TODOS : POR_PAGINA);

  return (
    <section className="card p-0 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="font-display font-semibold flex items-center gap-2"><Headset size={17} className="text-muted" /> Os chamados <span className="text-muted font-normal text-sm tnum">({total.toLocaleString('pt-BR')})</span></h2>
        <SeletorColunas colunas={colunas} escolha={escolha} />
      </div>
      {carregando ? <Carregando /> : !lista?.items.length ? <div className="text-muted text-sm px-4 pb-4">Nenhum chamado com esses filtros.</div> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr>
              <ThN /><Th o={o} col="numero">Card</Th>
              {visiveis.map((c) => (c.ordenavel === false ? <th key={c.id}>{c.label}</th> : <Th key={c.id} o={o} col={c.id}>{c.label}</Th>))}
            </tr></thead>
            <tbody>
              {lista.items.map((c, i) => (
                <tr key={c.id}>
                  <TdN n={numero(i)} />
                  <td className="whitespace-nowrap">
                    {c.link ? <a className="link font-mono text-[12.5px]" href={c.link} target="_blank" rel="noreferrer" title="Abrir o card no LineChat">{c.key ?? '?'} <ExternalLink size={11} className="inline -mt-0.5" /></a> : <span className="font-mono text-[12.5px]">{c.key ?? '?'}</span>}
                    {c.isOverdue && !c.fechado && <Chip tone="bad" className="ml-1">vencido</Chip>}
                  </td>
                  {visiveis.map((col) => <td key={col.id} className="text-[13px] align-top">{col.render(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 pb-3">
        {lista && <Paginacao page={page} pageSize={POR_PAGINA} total={lista.total} onChange={setPage} tudo={tudo} onTudo={setTudo} />}
      </div>
    </section>
  );
}
