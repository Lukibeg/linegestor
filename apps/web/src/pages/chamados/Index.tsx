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
 * inteira e ficam no endereço, como nas outras listas.
 *
 * **Clicar filtra.** Qualquer barra, fatia, coluna do tempo ou número de cima filtra a tela toda.
 * O gráfico clicado continua mostrando todos os seus valores, com o escolhido em destaque; clicar
 * de novo desfaz, clicar em outro troca, e Ctrl (ou Shift) + clique soma mais um. As contas disso
 * estão em `@gestor/shared/chamados.ts` (cada gráfico é contado sem o próprio filtro).
 *
 * **A arrumação é da equipe.** Quem administra clica em **Organizar**: arrasta os gráficos pela
 * alça (ou usa as setas), escolhe metade ou a linha inteira, esconde o que não usa e decide se cada
 * um abre em barras ou pizza. Salvo, vale para todo mundo (fica no servidor). Os números de cima e
 * a tabela ficam fixos. Fora do Organizar, cada pessoa ainda pode trocar barras/pizza só para si
 * (fica no navegador dela).
 */
import { useLayoutEffect, useMemo, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive, BarChartHorizontal, CalendarRange, ChevronLeft, ChevronRight, ExternalLink, Eye, EyeOff, Filter, GripVertical, Headset,
  LayoutGrid, ListFilter, MousePointerClick, PieChart, RefreshCw, Search, Tag, TriangleAlert, UserRound, X,
} from 'lucide-react';
import {
  montarPainel, painelPadrao, quandoValidos, rotuloQuando, rotuloSituacao, SITUACOES, VAZIO,
  type AbaChamados, type SituacaoChamado,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import type { FormaGrafico, ItemPainel, ItemRanking, KpiChamados, LinhaChamado, OpcoesChamados } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Abas, Carregando, Chip, Kpi, mensagemErro, Paginacao, TODOS, Toggle, useToast, Vazio } from '../../components/ui/index.js';
import { BarrasRanking, Colunas, Pizza } from '../../components/graficos.js';
import { FiltroEmBotao, type GrupoFiltro } from '../../lib/filtros.js';
import { SeletorColunas, useColunasEscolhidas, type Coluna } from '../../lib/colunas.js';
import { ThN, TdN, contarDe } from '../../lib/contagem.js';
import { Th, useOrdenacao } from '../../lib/ordenacao.js';
import { useLembrarFiltros } from '../../lib/voltar.js';
import { useArrastar } from '../../lib/arrastar.js';
import { useAuth } from '../../lib/auth.js';
import { data, relativo } from '../../lib/format.js';

type Aba = AbaChamados;
const ABAS: Array<{ id: Aba; label: string }> = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'abertos', label: 'Em aberto' },
  { id: 'periodo', label: 'Período' },
];
const NOME_ABA: Record<Aba, string> = { hoje: 'Hoje', abertos: 'Em aberto', periodo: 'Período' };
const MULTI = ['etapa', 'responsavel', 'etiqueta', 'campo', 'quando'] as const;
const POR_PAGINA = 50;

/** AAAA-MM-DD de hoje e de n dias atrás, no fuso de quem olha (a equipe está toda em Brasília). */
const diaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return diaLocal(d); };

/** Ctrl, Cmd ou Shift + clique: soma ao filtro em vez de trocar. */
const somar = (ev: MouseEvent) => ev.ctrlKey || ev.metaKey || ev.shiftKey;

/**
 * Clicar num valor: filtra só por ele; clicar de novo nele desfaz. Somando, liga ou desliga só
 * aquele, sem mexer nos outros escolhidos.
 */
function alternar(atuais: string[], v: string, soma: boolean): string[] {
  if (soma) return atuais.includes(v) ? atuais.filter((x) => x !== v) : [...atuais, v];
  return atuais.length === 1 && atuais[0] === v ? [] : [v];
}

/** "Fechados" muda o que a hora ou o dia clicados querem dizer (fechamento, não chegada). */
function trocarSituacao(n: URLSearchParams, s?: SituacaoChamado) {
  if ((n.get('situacao') === 'fechados') !== (s === 'fechados')) n.delete('quando');
  if (s) n.set('situacao', s); else n.delete('situacao');
}

export function Chamados() {
  useLembrarFiltros('/chamados');
  const [sp, setSp] = useSearchParams();
  const { can } = useAuth();
  const podeArrumar = can('admin.manage');
  const qc = useQueryClient();
  const toast = useToast();
  const aba = (['hoje', 'abertos', 'periodo'].includes(sp.get('aba') ?? '') ? sp.get('aba') : 'hoje') as Aba;
  const situacao = (SITUACOES as readonly string[]).includes(sp.get('situacao') ?? '') ? (sp.get('situacao') as SituacaoChamado) : undefined;

  const filtros = useMemo(() => ({
    aba,
    de: aba === 'periodo' ? sp.get('de') ?? undefined : undefined,
    ate: aba === 'periodo' ? sp.get('ate') ?? undefined : undefined,
    etapa: sp.getAll('etapa'), responsavel: sp.getAll('responsavel'), etiqueta: sp.getAll('etiqueta'), campo: sp.getAll('campo'),
    quando: sp.getAll('quando'), situacao,
    busca: sp.get('busca') ?? undefined,
    arquivados: sp.get('arquivados') === '1' ? 'true' : undefined,
  }), [sp, aba, situacao]);
  const chave = JSON.stringify(filtros);

  const o = useOrdenacao('aberto', 'desc');
  const page = Number(sp.get('p') ?? 1);
  const tudo = sp.get('tudo') === '1';

  const opcoes = useQuery({ queryKey: ['chamados', 'opcoes'], queryFn: () => api.chamados.opcoes(), refetchInterval: 60_000 });
  const painel = useQuery({ queryKey: ['chamados', 'painel'], queryFn: () => api.chamados.painel(), refetchInterval: 5 * 60_000 });
  const resumo = useQuery({ queryKey: ['chamados', 'resumo', chave], queryFn: () => api.chamados.resumo(filtros), refetchInterval: 60_000, placeholderData: keepPreviousData });
  const lista = useQuery({
    queryKey: ['chamados', 'lista', chave, o.ord, o.dir, page, tudo],
    queryFn: () => api.chamados.lista({ ...filtros, sort: o.ord, dir: o.dir, page: tudo ? 1 : page, pageSize: tudo ? TODOS : POR_PAGINA }),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  // ---------- a arrumação (igual para a equipe toda) ----------
  const op = opcoes.data;
  const campos = useMemo(() => op?.campos ?? [], [op?.campos]);
  const salvo = useMemo(() => montarPainel(painel.data?.itens, campos), [painel.data, campos]);
  /** Enquanto organiza: a arrumação sendo mexida (só vale para todos ao salvar). */
  const [rascunho, setRascunho] = useState<ItemPainel[] | null>(null);
  const organizando = rascunho !== null;
  const itens = rascunho ?? salvo;
  const mudou = organizando && JSON.stringify(rascunho) !== JSON.stringify(salvo);
  /** Muda depois de salvar: os gráficos releem a escolha barras/pizza de cada pessoa. */
  const [geracao, setGeracao] = useState(0);
  const [focar, setFocar] = useState<string | null>(null);
  const arrasto = useArrastar(itens.map((x) => x.id), (nova) => setRascunho((r) => (r ? nova.map((id) => r.find((x) => x.id === id)!) : r)));

  const salvar = useMutation({
    mutationFn: (novos: ItemPainel[]) => api.chamados.salvarPainel(novos),
    onSuccess: (p) => {
      qc.setQueryData(['chamados', 'painel'], p);
      // quem arrumou passa a ver exatamente o que a equipe vê
      try { localStorage.removeItem(CHAVE_FORMAS); } catch { /* sem storage */ }
      setGeracao((g) => g + 1);
      setRascunho(null);
      toast.push('ok', 'Arrumação salva: a equipe toda vê a tela assim.');
    },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });

  const mudarItem = (id: string, m: Partial<ItemPainel>) => setRascunho((r) => (r ? r.map((x) => (x.id === id ? { ...x, ...m } : x)) : r));
  const moverItem = (id: string, passo: -1 | 1, foco: string) => {
    setRascunho((r) => {
      if (!r) return r;
      const i = r.findIndex((x) => x.id === id);
      const j = i + passo;
      if (i < 0 || j < 0 || j >= r.length) return r;
      const n = [...r];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
    setFocar(`${id}:${foco}`);
  };
  // o cartão mudou de lugar: o foco volta ao botão que foi apertado (ou à alça, se ele desligou)
  useLayoutEffect(() => {
    if (!focar) return;
    const alvo = document.querySelector<HTMLButtonElement>(`[data-foco="${CSS.escape(focar)}"]`);
    (alvo && !alvo.disabled ? alvo : document.querySelector<HTMLElement>(`[data-foco="${CSS.escape(focar.replace(/:[^:]+$/, ':alca'))}"]`))?.focus();
    setFocar(null);
  }, [focar, rascunho]);

  // ---------- os filtros ----------

  /** Troca um filtro no endereço; mexer em filtro volta para a página 1. */
  const mudar = (fn: (n: URLSearchParams) => void) => {
    const n = new URLSearchParams(sp);
    fn(n);
    n.delete('p');
    setSp(n, { replace: true });
  };
  const definirLista = (nome: string, valores: string[]) => mudar((n) => { n.delete(nome); valores.forEach((v) => n.append(nome, v)); });
  const escolher = (nome: 'etapa' | 'responsavel' | 'etiqueta' | 'quando', valor: string, ev: MouseEvent) =>
    definirLista(nome, alternar(sp.getAll(nome), valor, somar(ev)));
  const escolherCampo = (key: string, valor: string, ev: MouseEvent) => {
    const pre = `${key}=`;
    const todos = sp.getAll('campo');
    const doCampo = todos.filter((x) => x.startsWith(pre)).map((x) => x.slice(pre.length));
    definirLista('campo', [...todos.filter((x) => !x.startsWith(pre)), ...alternar(doCampo, valor, somar(ev)).map((v) => pre + v)]);
  };
  const tirar = (nome: string, valor: string) => {
    if (nome === 'situacao') mudar((n) => trocarSituacao(n, undefined));
    else definirLista(nome, sp.getAll(nome).filter((x) => x !== valor));
  };
  const limpar = () => mudar((n) => { MULTI.forEach((k) => n.delete(k)); n.delete('situacao'); n.delete('busca'); n.delete('arquivados'); });

  /** Os números de cima: filtram pela situação; o "de qualquer dia" leva para a aba Em aberto. */
  const clicarKpi = (k: KpiChamados) => {
    if (k.total) { mudar((n) => trocarSituacao(n, undefined)); return; }
    const f = k.filtro;
    if (!f) return;
    if (f.aba && f.aba !== aba) {
      mudar((n) => { n.set('aba', f.aba!); n.delete('de'); n.delete('ate'); n.delete('quando'); if (f.situacao) n.set('situacao', f.situacao); else n.delete('situacao'); });
      return;
    }
    mudar((n) => trocarSituacao(n, k.ativo ? undefined : f.situacao));
  };
  const tituloKpi = (k: KpiChamados) => {
    if (organizando) return undefined;
    if (k.total) return situacao ? 'Clique para voltar a ver todos' : undefined;
    if (!k.filtro) return undefined;
    if (k.filtro.aba && k.filtro.aba !== aba) return `Clique para ver na aba ${NOME_ABA[k.filtro.aba]}`;
    return k.ativo ? 'Clique para desfazer o filtro' : 'Clique para ver só estes chamados';
  };

  if (opcoes.isLoading || painel.isLoading) return <Pagina titulo="Chamados"><Carregando /></Pagina>;
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
  const temFiltro = MULTI.some((k) => sp.getAll(k).length) || !!situacao || !!sp.get('busca') || sp.get('arquivados') === '1';
  const tituloDe = (id: string) => {
    if (id === 'serie') return r?.serie.titulo ?? 'Chamados no tempo';
    if (id === 'etapa') return 'Por etapa';
    if (id === 'responsavel') return 'Por responsável';
    if (id === 'etiqueta') return 'Por etiqueta';
    const c = campos.find((x) => `campo:${x.key}` === id);
    return c ? `Por ${c.name.toLowerCase()}` : id;
  };
  const ultimaArrumacao = painel.data?.atualizadoEm
    ? `Última arrumação: ${painel.data.atualizadoPor ?? 'alguém da administração'}, ${data(painel.data.atualizadoEm, true)}.`
    : 'A tela está na arrumação de fábrica.';

  return (
    <Pagina
      titulo="Chamados"
      sub={<>A cópia do painel <b className="text-ink-2">{op?.painelNome || 'de suporte'}</b> do LineChat. Os chamados são abertos e trabalhados lá; aqui é só leitura.</>}
      acoes={<>
        <Situacao op={op} />
        {op?.linkDoPainel && <a className="btn-secondary btn-sm" href={op.linkDoPainel} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir no LineChat</a>}
        {podeArrumar && !organizando && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setRascunho(salvo)} title={`Trocar os gráficos de lugar, mudar a largura, esconder — para a equipe toda. ${ultimaArrumacao}`}>
            <LayoutGrid size={14} /> Organizar
          </button>
        )}
      </>}
    >
      <Abas atual={aba} onChange={(a) => mudar((n) => { n.set('aba', a); n.delete('quando'); n.delete('situacao'); if (a !== 'periodo') { n.delete('de'); n.delete('ate'); } })} abas={ABAS} />

      {/* ---------- filtros ---------- */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {aba === 'periodo' && r && <Periodo de={r.de} ate={r.ate} onChange={(de, ate) => mudar((n) => { n.set('de', de); n.set('ate', ate); n.delete('quando'); })} />}
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
      {op && temFiltro && <FiltrosAtivos op={op} sp={sp} aba={aba} situacao={situacao} tirar={tirar} limpar={limpar} />}

      {!r ? <Carregando /> : (
        <div className={`flex flex-col gap-4 transition-opacity ${resumo.isFetching && resumo.isPlaceholderData ? 'opacity-60' : ''}`}>
          {/* ---------- números (fixos no alto; clicar filtra) ---------- */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {r.kpis.map((k) => (
              <Kpi
                key={k.id} label={k.label} valor={k.valor} sub={k.sub} tone={k.tom} ativo={!!k.ativo} titulo={tituloKpi(k)}
                onClick={!organizando && (k.filtro || (k.total && situacao)) ? () => clicarKpi(k) : undefined}
              />
            ))}
          </div>
          <p className="text-[12.5px] text-muted -mt-2 flex items-center gap-1.5">
            {temFiltro
              ? <><Filter size={13} className="shrink-0" /> Os números e os gráficos obedecem aos filtros. Clique de novo no que está marcado para desfazer.</>
              : <><MousePointerClick size={13} className="shrink-0" /> Clique numa barra, fatia, coluna ou número para filtrar a tela toda.<span className="hidden md:inline"> Ctrl+clique soma mais de um.</span></>}
          </p>

          {/* ---------- organizar (só a administração) ---------- */}
          {organizando && (
            <div className="sticky top-16 z-10 rounded-xl border border-accent bg-accent-soft px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 shadow-sm">
              <LayoutGrid size={17} className="text-accent shrink-0" />
              <div className="text-[13px] text-accent-ink flex-1 min-w-[240px] leading-snug">
                <b>Organizando a tela para a equipe toda.</b> Arraste pela alça <GripVertical size={13} className="inline -mt-0.5" /> (ou use as setas),
                escolha metade ou inteira e esconda o que não usa. Enquanto organiza, clicar nos gráficos não filtra.
                <span className="block text-[12px] opacity-80 mt-0.5">Os números de cima e a tabela ficam fixos. {ultimaArrumacao}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className="btn-ghost btn-sm" onClick={() => setRascunho(painelPadrao(campos))}>Voltar ao padrão</button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setRascunho(null)}>Cancelar</button>
                <button type="button" className="btn-primary btn-sm" disabled={!mudou || salvar.isPending} onClick={() => rascunho && salvar.mutate(rascunho)}>
                  {salvar.isPending ? 'Salvando…' : 'Salvar para todos'}
                </button>
              </div>
            </div>
          )}

          {/* ---------- os gráficos, na arrumação da equipe ---------- */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 min-w-0">
            {itens.map((item, i) => {
              if (item.oculto && !organizando) return null;
              const m: Moldura = {
                item, organizando, arrastando: arrasto.arrastando === item.id, primeiro: i === 0, ultimo: i === itens.length - 1,
                aoPegar: (e) => arrasto.iniciar(item.id, e),
                aoMover: (passo, foco) => moverItem(item.id, passo, foco),
                aoMudar: (x) => mudarItem(item.id, x),
              };
              const chaveG = `${item.id}:${geracao}`;
              if (item.id === 'serie') {
                return (
                  <Cartao key={chaveG} m={m} titulo={r.serie.titulo} sub={r.serie.sub}>
                    <Colunas
                      pontos={r.serie.pontos}
                      vazio={aba === 'hoje' ? (situacao === 'fechados' ? 'Nenhum chamado fechado hoje ainda.' : 'Nenhum chamado aberto hoje ainda.') : 'Nenhum chamado aqui.'}
                      aoClicar={(id, ev) => escolher('quando', id, ev)}
                    />
                  </Cartao>
                );
              }
              if (item.id === 'etapa') return <GraficoLista key={chaveG} m={m} titulo="Por etapa" sub="na ordem do Kanban" itens={r.porEtapa} aoClicar={(v, ev) => escolher('etapa', v, ev)} semOrdenar />;
              if (item.id === 'responsavel') return <GraficoLista key={chaveG} m={m} titulo="Por responsável" itens={r.porResponsavel} aoClicar={(v, ev) => escolher('responsavel', v, ev)} />;
              if (item.id === 'etiqueta') return <GraficoLista key={chaveG} m={m} titulo="Por etiqueta" sub="um card pode ter várias" multiplo itens={r.porEtiqueta} aoClicar={(v, ev) => escolher('etiqueta', v, ev)} />;
              const c = r.porCampo.find((x) => `campo:${x.key}` === item.id);
              if (!c) return null;
              return (
                <GraficoLista
                  key={chaveG} m={m} titulo={`Por ${c.name.toLowerCase()}`} sub={c.multiplo ? 'um card pode contar em mais de um' : undefined}
                  multiplo={c.multiplo} itens={c.itens} aoClicar={(v, ev) => escolherCampo(c.key, v, ev)}
                />
              );
            })}
          </div>

          {/* ---------- a tabela (fixa embaixo) ---------- */}
          <Tabela op={op!} total={r.total} lista={lista.data} carregando={lista.isLoading} o={o} page={page} tudo={tudo}
            setPage={(p) => { const n = new URLSearchParams(sp); n.set('p', String(p)); setSp(n, { replace: true }); }}
            setTudo={(v) => { const n = new URLSearchParams(sp); if (v) n.set('tudo', '1'); else n.delete('tudo'); n.delete('p'); setSp(n, { replace: true }); }}
          />
        </div>
      )}

      {/* o nome do gráfico acompanha o ponteiro enquanto se arrasta */}
      {arrasto.arrastando && createPortal(
        <div
          ref={arrasto.fantasma}
          className="fixed left-0 top-0 z-50 pointer-events-none card shadow-lg px-3 py-2 text-sm font-semibold flex items-center gap-2"
          style={{ transform: `translate(${arrasto.posicao.current.x + 14}px, ${arrasto.posicao.current.y + 10}px)` }}
        >
          <GripVertical size={15} className="text-muted" /> {tituloDe(arrasto.arrastando)}
        </div>,
        document.body,
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

/** O que está filtrado, escrito — cada um com o seu X (inclusive o que foi clicado nos gráficos). */
function FiltrosAtivos({ op, sp, aba, situacao, tirar, limpar }: {
  op: OpcoesChamados; sp: URLSearchParams; aba: Aba; situacao?: SituacaoChamado; tirar: (nome: string, valor: string) => void; limpar: () => void;
}) {
  const vazio = op.vazio;
  const itens: Array<{ nome: string; valor: string; rotulo: ReactNode }> = [];
  if (situacao) itens.push({ nome: 'situacao', valor: situacao, rotulo: <>Só os <b>{rotuloSituacao(situacao, aba)}</b></> });
  for (const v of quandoValidos({ aba, quando: sp.getAll('quando') })) {
    const q = rotuloQuando(v, { aba, situacao });
    itens.push({ nome: 'quando', valor: v, rotulo: <>{q.nome}: <b>{q.valor}</b></> });
  }
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

// ---------- os cartões dos gráficos ----------

/** O que cada cartão precisa saber da arrumação (e o que pode mudar nela, enquanto se organiza). */
type Moldura = {
  item: ItemPainel;
  organizando: boolean;
  /** este é o cartão sendo arrastado agora */
  arrastando: boolean;
  primeiro: boolean;
  ultimo: boolean;
  aoPegar: (e: PointerEvent<HTMLElement>) => void;
  aoMover: (passo: -1 | 1, foco: string) => void;
  aoMudar: (m: Partial<ItemPainel>) => void;
};

/**
 * A moldura de um gráfico. Fora do Organizar, é só o cartão. No Organizar, ganha em cima a faixa
 * de ferramentas (alça, setas, largura, esconder) e o gráfico para de responder a cliques.
 * Escondido, no Organizar, vira uma tira fina no mesmo lugar — para dar para mostrar de volta.
 */
function Cartao({ m, titulo, sub, extra, children }: { m: Moldura; titulo: string; sub?: ReactNode; extra?: ReactNode; children: ReactNode }) {
  const { item } = m;
  const largura = item.largura === 'inteira' ? 'md:col-span-2' : '';
  const cabecalho = (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="min-w-0">
        <h2 className="font-display font-semibold leading-tight">{titulo}</h2>
        {sub && <span className="text-[12px] text-muted">{sub}</span>}
      </div>
      {extra}
    </div>
  );
  if (!m.organizando) {
    return <section className={`card p-4 min-w-0 ${largura}`}>{cabecalho}{children}</section>;
  }
  const botao = 'p-1 rounded-md text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent';
  const seg = (ativo: boolean) => `px-2 py-0.5 rounded-md text-[12px] font-semibold ${ativo ? 'bg-accent text-white' : 'text-ink-2 hover:text-ink'}`;
  return (
    <section
      data-arrastavel={item.id}
      aria-label={`${titulo}${item.oculto ? ' (escondido)' : ''}`}
      className={`card min-w-0 border-dashed border-line-strong transition-opacity ${largura} ${m.arrastando ? 'opacity-40 ring-2 ring-accent' : ''} ${item.oculto ? 'bg-surface-2 self-start' : ''}`}
    >
      <div className={`flex flex-wrap items-center gap-1.5 px-2 py-1.5 ${item.oculto ? '' : 'border-b border-dashed border-line-strong bg-surface-2 rounded-t-xl'}`}>
        <button
          type="button" data-foco={`${item.id}:alca`} onPointerDown={m.aoPegar}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); if (!m.primeiro) m.aoMover(-1, 'alca'); }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); if (!m.ultimo) m.aoMover(1, 'alca'); }
          }}
          className="touch-none cursor-grab active:cursor-grabbing flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] text-ink-2 hover:bg-surface min-w-0"
          aria-label={`Mudar ${titulo} de lugar: arraste, ou use as setas do teclado`} title="Arraste para mudar de lugar (ou use as setas do teclado)"
        >
          <GripVertical size={16} className="shrink-0" />
          {item.oculto ? <span className="truncate"><b className="text-ink">{titulo}</b> · escondido</span> : <span className="hidden sm:inline">Arrastar</span>}
        </button>
        <span className="flex items-center">
          <button type="button" className={botao} data-foco={`${item.id}:antes`} disabled={m.primeiro} onClick={() => m.aoMover(-1, 'antes')} aria-label={`${titulo}: mover para antes`} title="Mover para antes"><ChevronLeft size={16} /></button>
          <button type="button" className={botao} data-foco={`${item.id}:depois`} disabled={m.ultimo} onClick={() => m.aoMover(1, 'depois')} aria-label={`${titulo}: mover para depois`} title="Mover para depois"><ChevronRight size={16} /></button>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {!item.oculto && (
            <div className="hidden md:flex rounded-lg bg-surface border border-line p-0.5" role="group" aria-label={`${titulo}: largura`}>
              <button type="button" className={seg(item.largura === 'metade')} aria-pressed={item.largura === 'metade'} onClick={() => m.aoMudar({ largura: 'metade' })}>Metade</button>
              <button type="button" className={seg(item.largura === 'inteira')} aria-pressed={item.largura === 'inteira'} onClick={() => m.aoMudar({ largura: 'inteira' })}>Inteira</button>
            </div>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={() => m.aoMudar({ oculto: !item.oculto })} aria-label={`${item.oculto ? 'Mostrar' : 'Esconder'} ${titulo}`}>
            {item.oculto ? <><Eye size={14} /> Mostrar</> : <><EyeOff size={14} /> Esconder</>}
          </button>
        </div>
      </div>
      {!item.oculto && (
        <div className="p-4 pt-3">
          {cabecalho}
          <div className="pointer-events-none select-none">{children}</div>
        </div>
      )}
    </section>
  );
}

/** A escolha barras/pizza de cada pessoa (no navegador dela); sem escolha, vale a da equipe. */
const CHAVE_FORMAS = 'gestor.chamados.graficos';
function lerFormas(): Record<string, FormaGrafico> {
  try { return JSON.parse(localStorage.getItem(CHAVE_FORMAS) ?? '{}') as Record<string, FormaGrafico>; } catch { return {}; }
}
function useForma(id: string, daEquipe: FormaGrafico): [FormaGrafico, (f: FormaGrafico) => void] {
  const [minha, setMinha] = useState<FormaGrafico | undefined>(() => lerFormas()[id]);
  const mudar = (f: FormaGrafico) => {
    // voltou para a da equipe: esquece a escolha, para acompanhar quando a equipe mudar
    setMinha(f === daEquipe ? undefined : f);
    try {
      const m = lerFormas();
      if (f === daEquipe) delete m[id]; else m[id] = f;
      localStorage.setItem(CHAVE_FORMAS, JSON.stringify(m));
    } catch { /* sem storage: só não lembra */ }
  };
  return [minha ?? daEquipe, mudar];
}

/**
 * Um gráfico de lista: em barras (os 8 maiores, os escolhidos e o "ver todos" — nenhuma lista
 * esconde linhas) ou em pizza (as 6 maiores fatias, o resto em "Outros", que abre a lista).
 * Clicar filtra; clicar de novo desfaz.
 */
function GraficoLista({ m, titulo, sub, itens, aoClicar, semOrdenar = false, multiplo = false }: {
  m: Moldura; titulo: string; sub?: string; itens: ItemRanking[]; aoClicar: (valor: string, ev: MouseEvent) => void; semOrdenar?: boolean;
  /** um card conta em mais de uma fatia: a pizza soma marcações, não chamados */
  multiplo?: boolean;
}) {
  const [todos, setTodos] = useState(false);
  const daEquipe = m.item.forma ?? 'barras';
  const [minha, setMinha] = useForma(m.item.id, daEquipe);
  // organizando, a escolha é a da equipe (é ela que está sendo arrumada)
  const forma = m.organizando ? daEquipe : minha;
  const trocar = (f: FormaGrafico) => (m.organizando ? m.aoMudar({ forma: f }) : setMinha(f));
  const LIMITE = 8;
  const mostrar = todos || semOrdenar ? itens : itens.filter((x, i) => i < LIMITE || x.selecionado);
  const soma = itens.reduce((a, x) => a + x.n, 0);
  const botao = (f: FormaGrafico, Icone: typeof PieChart, rotulo: string) => (
    <button
      type="button" onClick={() => trocar(f)} aria-pressed={forma === f}
      title={m.organizando ? `${rotulo} (para a equipe toda)` : rotulo} aria-label={`${titulo}: ${rotulo.toLowerCase()}`}
      className={`p-1 rounded ${forma === f ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink'}`}
    >
      <Icone size={15} />
    </button>
  );
  const extra = (
    <div className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 shrink-0" role="group" aria-label="Como mostrar">
      {botao('barras', BarChartHorizontal, 'Ver em barras')}
      {botao('pizza', PieChart, 'Ver em pizza')}
    </div>
  );
  return (
    <Cartao m={m} titulo={titulo} sub={sub ?? (itens.length ? `${itens.length} ${itens.length === 1 ? 'valor' : 'valores'}` : '')} extra={extra}>
      {forma === 'pizza' ? (
        <Pizza
          partes={itens.map((x) => ({ id: x.valor, rotulo: x.rotulo, n: x.n, neutro: x.valor === VAZIO, selecionado: x.selecionado }))}
          rotuloCentro={multiplo ? 'marcações' : itens.length ? 'chamados' : ''}
          aoClicar={aoClicar}
          vazio="Nenhum chamado aqui."
        />
      ) : (
        <>
          <BarrasRanking
            selecionavel
            dados={mostrar.map((x) => ({
              id: x.valor,
              rotulo: <span className="flex items-center gap-1.5 min-w-0">{x.cor && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: x.cor }} aria-hidden />}<span className={`truncate ${x.valor === VAZIO ? 'text-muted italic' : ''}`}>{x.rotulo}</span></span>,
              valor: x.n,
              selecionado: x.selecionado,
              titulo: `${x.rotulo}: ${x.n} (${soma ? Math.round((x.n / soma) * 100) : 0}%) — ${x.selecionado ? 'clique para desfazer o filtro' : 'clique para filtrar (Ctrl+clique soma outro)'}`,
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
    </Cartao>
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
