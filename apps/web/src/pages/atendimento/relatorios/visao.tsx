/**
 * A VISÃO GERAL dos Relatórios de um painel (2.2): as partes **Hoje** e **Período**, a tela principal. O pedido do Luan na
 * prévia (28/10): *"faça igual ao legado, coloque esse como principal e todos os outros vão entrar como 'relatórios'…
 * mas com os kpis e relatórios atualizados aos campos novos"*. É a tela do Legado do Helena (`pages/chamados/Index.tsx`)
 * — os números de cima, os chamados no tempo, os gráficos de pizza ou barras (com o Agrupar) e a tabela —, lendo os
 * chamados do Gestor. As peças dos gráficos são as mesmas do Legado (`Cartao` e `GraficoLista`): o mesmo jeito, os mesmos
 * botões; as contas, em `@gestor/shared` (`atendimento-visao.ts`), iguais no servidor e na prévia.
 *
 * **Clicar filtra a tela toda**: a fatia, a barra, a coluna do tempo ou o número de cima; o gráfico clicado continua
 * inteiro, com o escolhido em destaque; clicar de novo desfaz. Os filtros são os mesmos dos Relatórios (o endereço é um
 * só). **Organizar** (quem cuida dos chamados): a ordem dos gráficos (arrastando ou pelas setas), metade ou a linha toda,
 * esconder, pizza ou barras e, no assunto, se abre com as pastas juntas — para a equipe toda, guardado com a arrumação dos
 * 25 relatórios do painel. Cada pessoa ainda troca pizza e barras e o Agrupar só para si (fica no navegador dela).
 */
import { useLayoutEffect, useMemo, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, CircleDot, Filter, GripVertical, Headset, LayoutGrid, MousePointerClick } from 'lucide-react';
import {
  NOME_DA_SITUACAO_DA_VISAO, NOME_ORIGEM, RESPONSAVEL_NINGUEM, SEM_VALOR_NA_VISAO, VAZIO, arrumacaoCompleta, atalhosDosRelatorios, itemDaVisaoDeFabrica, montarVisao, rotuloDoQuando,
  type ArrumacaoDosRelatoriosLida, type GraficoDaVisao, type ItemDaVisao, type KpiDaVisao, type OpcoesAtendimento, type Origem, type Painel, type ParteDaVisao, type SituacaoDaVisao, type VisaoDoPainel as Visao,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Carregando, Kpi, mensagemErro, Paginacao, Toggle, useToast } from '../../../components/ui/index.js';
import { Colunas } from '../../../components/graficos.js';
import { useArrastar } from '../../../lib/arrastar.js';
import { data } from '../../../lib/format.js';
import { Cartao, GraficoLista, type Moldura } from '../../chamados/Index.js';
import { ChipPrioridade, LinkDoChamado, usePode } from '../comum.js';
import { FiltrosEscritos, useFiltrosNoEndereco, type FiltroEscrito } from '../quadro/filtros.js';
import { useFiltrosDoPainel } from './index.js';

/** Os filtros de valor e os da Visão que vão para o servidor (os mesmos nomes do endereço). */
const PEDIDO = ['assunto', 'tipo', 'gravidade', 'prioridade', 'nivel', 'responsavel', 'cliente', 'produto', 'operadora', 'etiqueta', 'campo', 'etapa', 'origem', 'situacao', 'quando', 'emaberto', 'p'] as const;

/** O id de um gráfico na tela: com o painel (a escolha de pizza ou barras de cada pessoa não se mistura com a do Legado nem com a de outro painel). */
const naTela = (painelId: string, id: string) => `visao:${painelId}:${id}`;
const doId = (painelId: string, id: string) => id.slice(`visao:${painelId}:`.length);

export function VisaoDoPainel({ painel, opcoes, parte }: { painel: Painel; opcoes: OpcoesAtendimento; parte: ParteDaVisao }) {
  const { valor, mudar } = useFiltrosNoEndereco();
  const pode = usePode();
  const qc = useQueryClient();
  const toast = useToast();
  const filtros = useFiltrosDoPainel(painel, opcoes);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const pedido = useMemo(() => {
    const q: Record<string, string> = { painel: painel.id, parte };
    if (parte === 'periodo') for (const k of ['de', 'ate']) if (valor(k)) q[k] = valor(k);
    for (const k of PEDIDO) if (valor(k)) q[k] = valor(k);
    return q;
  }, [painel.id, parte, valor]);
  const visao = useQuery({
    queryKey: ['atendimento', 'visao', JSON.stringify(pedido)],
    queryFn: () => api.atendimento.visao(pedido),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const arrumacao = useQuery({ queryKey: ['atendimento', 'relatorios-arrumacao', painel.id], queryFn: () => api.atendimento.arrumacaoDosRelatorios(painel.id), refetchInterval: 5 * 60_000 });
  const v = visao.data?.painel.id === painel.id && visao.data.parte === parte ? visao.data : undefined;

  // ---- a arrumação dos gráficos (a da equipe) e o rascunho do Organizar
  const ids = useMemo(() => (v ? ['serie', ...v.graficos.map((g) => g.id)] : []), [v]);
  const salvo = useMemo(() => montarVisao(arrumacao.data?.visao, ids), [arrumacao.data?.visao, ids]);
  const [rascunho, setRascunho] = useState<ItemDaVisao[] | null>(null);
  const organizando = rascunho !== null;
  const itens = rascunho ? montarVisao(rascunho, ids) : salvo;
  const mudou = organizando && JSON.stringify(itens) !== JSON.stringify(salvo);
  const [focar, setFocar] = useState<string | null>(null);
  const arrasto = useArrastar(itens.map((x) => naTela(painel.id, x.id)), (nova) => setRascunho((r) => {
    const atual = r ? montarVisao(r, ids) : salvo;
    return nova.map((id) => atual.find((x) => x.id === doId(painel.id, id))!).filter(Boolean);
  }));
  const ultimaArrumacao = arrumacao.data?.atualizadoEm
    ? `Última arrumação: ${arrumacao.data.atualizadoPor ?? 'alguém da equipe'}, ${data(arrumacao.data.atualizadoEm, true)}.`
    : 'A tela está na arrumação de fábrica.';
  const salvar = useMutation({
    mutationFn: (visaoNova: ItemDaVisao[]) => {
      const a = arrumacao.data ?? arrumacaoCompleta(null);
      return api.atendimento.salvarArrumacaoDosRelatorios(painel.id, { ordem: a.ordem, ocultos: a.ocultos, favoritos: a.favoritos, campoDaFalha: a.campoDaFalha, visao: visaoNova });
    },
    onSuccess: (a: ArrumacaoDosRelatoriosLida) => {
      qc.setQueryData(['atendimento', 'relatorios-arrumacao', painel.id], a);
      setRascunho(null);
      toast.push('ok', 'Arrumação salva: a equipe toda vê a Visão geral deste painel assim.');
    },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  const mudarItem = (id: string, m: Partial<ItemDaVisao>) => setRascunho((r) => (r ? montarVisao(r, ids).map((x) => (x.id === id ? { ...x, ...m } : x)) : r));
  const moverItem = (id: string, passo: -1 | 1, foco: string) => {
    setRascunho((r) => {
      if (!r) return r;
      const n = montarVisao(r, ids);
      const i = n.findIndex((x) => x.id === id); const j = i + passo;
      if (i < 0 || j < 0 || j >= n.length) return r;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
    setFocar(`${naTela(painel.id, id)}:${foco}`);
  };
  // o cartão mudou de lugar: o foco volta ao botão apertado (ou à alça, se ele desligou)
  useLayoutEffect(() => {
    if (!focar) return;
    const alvo = document.querySelector<HTMLButtonElement>(`[data-foco="${CSS.escape(focar)}"]`);
    (alvo && !alvo.disabled ? alvo : document.querySelector<HTMLElement>(`[data-foco="${CSS.escape(focar.replace(/:[^:]+$/, ':alca'))}"]`))?.focus();
    setFocar(null);
  }, [focar, rascunho]);

  // ---- o período (só no Período)
  const atalhos = useMemo(() => atalhosDosRelatorios(new Date(), v?.primeiroDia ?? null), [v?.primeiroDia]);
  const atalho = v ? atalhos.find((a) => a.de === v.de && a.ate === v.ate)?.id ?? null : null;

  // ---- clicar
  const sit = valor('situacao') as SituacaoDaVisao | '';
  /** "Resolvidos" troca a régua (o dia em que resolveu): a coluna do tempo escolhida deixa de valer. */
  const comSituacao = (s: SituacaoDaVisao | null): Record<string, string | null> => ({
    situacao: s, ...((sit === 'resolvidos') !== (s === 'resolvidos') ? { quando: null } : {}), ...(s === 'resolvidos' ? { emaberto: null } : {}),
  });
  const clicarKpi = (k: KpiDaVisao) => {
    if (k.total) { mudar(comSituacao(null)); return; }
    const f = k.filtro;
    if (!f || !v) return;
    if (f.parte || f.tudo || f.emAberto) {
      mudar({
        ...(f.parte ? { parte: f.parte } : {}),
        ...(f.tudo ? { de: v.primeiroDia, ate: v.hoje } : {}),
        ...(f.parte || f.tudo ? { quando: null } : {}),
        ...(f.emAberto ? { emaberto: '1' } : {}),
        ...comSituacao(f.situacao ?? null),
      });
      return;
    }
    mudar(comSituacao(k.ativo ? null : f.situacao ?? null));
  };
  const tituloKpi = (k: KpiDaVisao) => {
    if (organizando) return undefined;
    if (k.total) return sit ? 'Clique para voltar a ver todos' : undefined;
    if (!k.filtro) return undefined;
    if (k.filtro.tudo) return k.filtro.situacao ? 'Clique para ver estes, em aberto, de qualquer dia' : 'Clique para ver todos os em aberto, de qualquer dia';
    if (k.filtro.emAberto && !k.filtro.situacao) return 'Clique para ver só os que ainda estão em aberto';
    return k.ativo ? 'Clique para desfazer o filtro' : 'Clique para ver só estes chamados';
  };
  /** Clicar num valor de um gráfico (ou num grupo: no assunto, a pasta): filtra por ele; de novo, desfaz. */
  const clicarGrafico = (g: GraficoDaVisao, valores: string[]) => {
    let alvo = valores[0];
    if (valores.length > 1) alvo = g.grupos?.find((x) => x.valores.length === valores.length && x.valores.every((y) => valores.includes(y)))?.id;
    if (!alvo) return;
    const param = alvo !== VAZIO ? alvo
      : g.filtro === 'campo' ? `${g.id.slice('campo:'.length)}:`
      : g.filtro === 'responsavel' ? RESPONSAVEL_NINGUEM : SEM_VALOR_NA_VISAO;
    mudar({ [g.filtro]: valor(g.filtro) === param ? null : param });
  };

  // ---- o que está filtrado, escrito (os da Visão junto com os de valor)
  const etapa = painel.etapas.find((e) => e.id === valor('etapa'));
  const soDaVisao: FiltroEscrito[] = [];
  if (valor('emaberto')) soDaVisao.push({ chave: 'emaberto', nome: 'Só os', valor: 'em aberto', tirar: () => mudar({ emaberto: null }) });
  if (sit) soDaVisao.push({ chave: 'situacao', nome: 'Só os', valor: NOME_DA_SITUACAO_DA_VISAO[sit] ?? sit, tirar: () => mudar(comSituacao(null)) });
  if (valor('quando')) { const q = rotuloDoQuando(valor('quando'), { situacao: sit || undefined }); soDaVisao.push({ chave: 'quando', nome: q.nome, valor: q.valor, tirar: () => mudar({ quando: null }) }); }
  if (valor('etapa')) soDaVisao.push({ chave: 'etapa', nome: 'Etapa', valor: etapa?.nome ?? 'uma etapa que saiu', tirar: () => mudar({ etapa: null }) });
  if (valor('origem')) soDaVisao.push({ chave: 'origem', nome: 'Chegou por', valor: NOME_ORIGEM[valor('origem') as Origem] ?? valor('origem'), tirar: () => mudar({ origem: null }) });
  const escritos = [...soDaVisao, ...filtros.escritos];
  const limparTudo = () => { filtros.limpar(); mudar({ emaberto: null, situacao: null, quando: null, etapa: null, origem: null }); };

  if (visao.isError && !v) return <p className="text-bad text-sm" role="alert">{mensagemErro(visao.error)}</p>;
  if (!v || arrumacao.isLoading) return <Carregando />;
  const porId = new Map(v.graficos.map((g) => [g.id, g]));
  const nomeDe = (id: string) => (id === 'serie' ? v.serie.titulo : porId.get(id)?.titulo ?? id);

  return (
    <div className="flex flex-col gap-3" id="visao-do-painel">
      {/* ---------- o período, os filtros, o "só em aberto" e o Organizar ---------- */}
      {!organizando && (
        <>
          <div className="card p-3 flex flex-wrap items-center gap-x-4 gap-y-2" id="visao-periodo">
            {parte === 'periodo' && (
              <>
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Período">
                  <CalendarRange size={15} className="text-muted" aria-hidden />
                  {atalhos.map((a) => (
                    <button key={a.id} type="button" aria-pressed={atalho === a.id} onClick={() => mudar({ de: a.de, ate: a.ate, quando: null })}
                      className={`rounded-full border px-2.5 py-1 text-[12.5px] transition-colors ${atalho === a.id ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line-strong text-ink-2 hover:bg-surface-2'}`}>
                      {a.nome}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                  <label className="text-muted" htmlFor="visao-de">de</label>
                  <input id="visao-de" type="date" className="input py-1 w-[150px]" value={v.de} max={v.ate} onChange={(e) => e.target.value && mudar({ de: e.target.value, ate: v.ate, quando: null })} />
                  <label className="text-muted" htmlFor="visao-ate">até</label>
                  <input id="visao-ate" type="date" className="input py-1 w-[150px]" value={v.ate} min={v.de} onChange={(e) => e.target.value && mudar({ ate: e.target.value, de: v.de, quando: null })} />
                </div>
              </>
            )}
            {parte === 'hoje' && <p className="text-[13px] text-ink-2">O que chegou hoje, {`${v.hoje.slice(8, 10)}/${v.hoje.slice(5, 7)}/${v.hoje.slice(0, 4)}`}. Os números "de qualquer dia" contam a fila inteira.</p>}
            <label className="flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer" title="Só os chamados que ainda não chegaram no Resolvido">
              <Toggle checked={!!valor('emaberto')} onChange={(x) => mudar(x ? { emaberto: '1', ...(sit === 'resolvidos' ? comSituacao(null) : {}) } : { emaberto: null })} />
              <CircleDot size={14} aria-hidden /> só em aberto
            </label>
            <div className="flex items-center gap-2 md:ml-auto">
              <button type="button" className={`btn-secondary btn-sm ${filtrosAbertos ? 'border-accent text-accent-ink bg-accent-soft' : ''}`} aria-expanded={filtrosAbertos} aria-controls="visao-filtros"
                onClick={() => setFiltrosAbertos((x) => !x)} title="Recortar os chamados: assunto, tipo, gravidade, prioridade, responsável, cliente…">
                <Filter size={14} aria-hidden /> Filtros{filtros.escritos.length > 0 && <span className="text-accent tnum">({filtros.escritos.length})</span>}
              </button>
              {pode.cuidar && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setRascunho(salvo)} title={`Trocar os gráficos de lugar, mudar a largura, esconder e escolher pizza ou barras — para a equipe toda. ${ultimaArrumacao}`}>
                  <LayoutGrid size={14} aria-hidden /> Organizar
                </button>
              )}
            </div>
          </div>
          <div id="visao-filtros" className={`${filtrosAbertos ? 'flex' : 'hidden'} flex-wrap items-center gap-2`}>{filtros.caixas}</div>
          <FiltrosEscritos itens={escritos} onLimpar={limparTudo} />
        </>
      )}

      <div className={`flex flex-col gap-4 transition-opacity ${visao.isFetching && visao.isPlaceholderData ? 'opacity-60' : ''}`}>
        {visao.isError && <p className="text-bad text-sm" role="alert">{mensagemErro(visao.error)}</p>}
        {/* ---------- os números (fixos no alto; clicar filtra) ---------- */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4" id="visao-numeros">
          {v.kpis.map((k) => (
            <Kpi key={k.id} label={k.label} valor={k.valor} sub={k.sub} tone={k.tom} ativo={!!k.ativo} titulo={tituloKpi(k)}
              onClick={!organizando && (k.filtro || (k.total && sit)) ? () => clicarKpi(k) : undefined} />
          ))}
        </div>
        {!organizando && (
          <p className="text-[12.5px] text-muted -mt-2 flex items-center gap-1.5">
            {escritos.length
              ? <><Filter size={13} className="shrink-0" aria-hidden /> Os números e os gráficos obedecem aos filtros. Clique de novo no que está marcado para desfazer.</>
              : <><MousePointerClick size={13} className="shrink-0" aria-hidden /> Clique numa fatia, barra, coluna ou número para filtrar a tela toda.</>}
          </p>
        )}

        {/* ---------- organizar (quem cuida dos chamados) ---------- */}
        {organizando && (
          <div className="sticky top-16 md:top-2 z-10 rounded-xl border border-accent bg-accent-soft px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 shadow-sm" id="visao-organizar">
            <LayoutGrid size={17} className="text-accent shrink-0" aria-hidden />
            <div className="text-[13px] text-accent-ink flex-1 min-w-[240px] leading-snug">
              <b>Organizando a Visão geral deste painel para a equipe toda.</b> Arraste pela alça <GripVertical size={13} className="inline -mt-0.5" aria-hidden /> (ou use as setas),
              escolha metade ou inteira, esconda o que não usa e escolha pizza ou barras. Enquanto organiza, clicar nos gráficos não filtra.
              <span className="block text-[12px] opacity-80 mt-0.5">Os números de cima e a tabela ficam fixos. Vale para Hoje e para o Período. {ultimaArrumacao}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setRascunho(ids.map(itemDaVisaoDeFabrica))} title="Volta a ordem, a largura e a pizza de fábrica.">Voltar ao padrão</button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setRascunho(null)}>Cancelar</button>
              <button type="button" className="btn-primary btn-sm" disabled={!mudou || salvar.isPending} onClick={() => salvar.mutate(itens)}>{salvar.isPending ? 'Salvando…' : 'Salvar para todos'}</button>
            </div>
          </div>
        )}

        {/* ---------- os gráficos, na arrumação da equipe ---------- */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 min-w-0" id="visao-graficos">
          {itens.map((item, i) => {
            if (item.oculto && !organizando) return null;
            const idTela = naTela(painel.id, item.id);
            const m: Moldura = {
              item: { ...item, id: idTela, grupos: porId.get(item.id)?.grupos },
              organizando, arrastando: arrasto.arrastando === idTela, primeiro: i === 0, ultimo: i === itens.length - 1,
              aoPegar: (e) => arrasto.iniciar(idTela, e),
              aoMover: (passo, foco) => moverItem(item.id, passo, foco),
              aoMudar: (x) => mudarItem(item.id, { ...(x.largura ? { largura: x.largura } : {}), ...(x.oculto !== undefined ? { oculto: x.oculto } : {}), ...(x.forma ? { forma: x.forma } : {}), ...(x.agrupar !== undefined ? { agrupar: x.agrupar } : {}) }),
              aoAbrirGrupos: () => undefined,
              semEnvio: true, semGrupos: true,
            };
            // a chave muda ao salvar: os gráficos releem a escolha de cada pessoa (pizza ou barras, o Agrupar)
            const chave = `${idTela}:${arrumacao.data?.atualizadoEm ?? ''}`;
            if (item.id === 'serie') {
              return (
                <Cartao key={chave} m={m} titulo={v.serie.titulo} sub={v.serie.sub}>
                  <Colunas pontos={v.serie.pontos}
                    vazio={parte === 'hoje' ? (sit === 'resolvidos' ? 'Nenhum chamado resolvido hoje ainda.' : 'Nenhum chamado chegou hoje ainda.') : 'Nenhum chamado aqui.'}
                    aoClicar={(id: string, _ev: MouseEvent) => mudar({ quando: valor('quando') === id ? null : id })} />
                </Cartao>
              );
            }
            const g = porId.get(item.id);
            if (!g) return null;
            return (
              <GraficoLista key={chave} m={m} titulo={g.titulo} sub={g.sub} itens={g.itens} semOrdenar={g.naOrdem} multiplo={g.multiplo}
                aoClicar={(valores) => clicarGrafico(g, valores)} />
            );
          })}
        </div>

        {/* ---------- a tabela (fixa embaixo) ---------- */}
        <Tabela v={v} pagina={Number(valor('p')) || 1} aoPagina={(n) => mudar({ p: n > 1 ? String(n) : null }, true)} />
      </div>

      {/* o nome do gráfico acompanha o ponteiro enquanto se arrasta */}
      {arrasto.arrastando && createPortal(
        <div ref={arrasto.fantasma} className="fixed left-0 top-0 z-50 pointer-events-none card shadow-lg px-3 py-2 text-sm font-semibold flex items-center gap-2"
          style={{ transform: `translate(${arrasto.posicao.current.x + 14}px, ${arrasto.posicao.current.y + 10}px)` }}>
          <GripVertical size={15} className="text-muted" aria-hidden /> {nomeDe(doId(painel.id, arrasto.arrastando))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Os chamados do recorte (com tudo o que foi clicado), do mais novo para o mais antigo, de 50 em 50. */
function Tabela({ v, pagina, aoPagina }: { v: Visao; pagina: number; aoPagina: (n: number) => void }) {
  const l = v.lista;
  return (
    <section className="card p-0 min-w-0" id="visao-tabela">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="font-display font-semibold flex items-center gap-2"><Headset size={17} className="text-muted" aria-hidden /> Os chamados <span className="text-muted font-normal text-sm tnum">({l.total.toLocaleString('pt-BR')})</span></h2>
      </div>
      {!l.itens.length ? <div className="text-muted text-sm px-4 pb-4">Nenhum chamado com esses filtros.</div> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr>
              <th>Chamado</th><th>Título</th><th>Etapa</th><th>Cliente</th><th>Responsável</th><th>Prioridade</th><th>Assunto</th><th>Chegou</th><th>Resolvido</th>
            </tr></thead>
            <tbody>
              {l.itens.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap"><LinkDoChamado codigo={c.codigo} className="link font-mono text-[12.5px]">{c.codigo}</LinkDoChamado></td>
                  <td className="text-[13px] align-top"><span className="line-clamp-2 min-w-[220px]">{c.titulo}</span></td>
                  <td className="text-[13px] whitespace-nowrap">{c.etapa}</td>
                  <td className="text-[13px]">{c.cliente ?? <span className="text-muted">—</span>}</td>
                  <td className="text-[13px] whitespace-nowrap">{c.responsavel ?? <span className="text-muted">sem dono</span>}</td>
                  <td className="text-[13px]"><ChipPrioridade p={c.prioridade} curta /></td>
                  <td className="text-[13px] min-w-[160px]">{c.assunto ?? <span className="text-muted">—</span>}</td>
                  <td className="text-[13px] whitespace-nowrap tnum">{data(c.criadoEm, true)}</td>
                  <td className="text-[13px] whitespace-nowrap tnum">{c.resolvidoEm ? data(c.resolvidoEm, true) : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 pb-3">
        <Paginacao page={Math.min(pagina, Math.max(1, Math.ceil(l.total / l.porPagina)))} pageSize={l.porPagina} total={l.total} onChange={aoPagina} />
      </div>
    </section>
  );
}
