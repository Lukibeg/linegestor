/**
 * Chamados › Relatórios (Patch 1.7) — os vinte relatórios das sugestões que o Luan aprovou em 03/10
 * e 04/10, cada um respondendo uma pergunta que a tela de Chamados não responde:
 *
 *  - **Tempo**: Relógio do chamado · A escada N1 → N2 → N3 · Onde o chamado empaca · Primeira
 *    resposta · A prioridade faz diferença? · Prazo cumprido
 *  - **Volume**: Mapa de calor da semana · Entrada × saída · Idade da fila · Dias fora da curva ·
 *    Sobe e desce dos assuntos · Os poucos que pesam muito · Previsão da semana
 *  - **Clientes**: Raio-X do cliente · Chamados pelo tamanho do cliente · Voltou com o mesmo
 *    problema · De quem é a falha?
 *  - **Equipe**: Quadro da equipe · Card bem preenchido
 *  - **Mês**: Fechamento do mês (imprime ou salva em PDF)
 *
 * **A arrumação é da equipe** (04/10, como o Organizar da tela de Chamados): quem administra clica
 * em **Organizar**, muda a ordem dentro de cada aba, esconde o que não usa e marca a estrela ★ nos
 * favoritos — que ganham a aba **Favoritos**, a primeira, na ordem escolhida. Nada vale antes do
 * "Salvar para todos" (vai para a auditoria). A aba de cada relatório é fixa (`CATALOGO_RELATORIOS`).
 *
 * É a terceira aba dos Chamados (Hoje · Período · Relatórios), numa página própria. O período e
 * os filtros de valor (etapa, responsável, etiqueta, campos, arquivados) são os mesmos da tela de
 * Chamados e viajam entre as duas. Tudo fica no endereço, como nas outras telas.
 *
 * **Clicar mostra os chamados**: uma faixa do relógio, um degrau da escada, um quadrado do mapa,
 * uma coluna da entrada × saída, um número do quadro — abre a janela com os chamados daquilo, cada
 * um com o link para o card no LineChat. As contas estão em `@gestor/shared/relatorios.ts` (as
 * mesmas do servidor e da prévia).
 */
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArrowDown, ArrowDownUp, ArrowUp, Building2, CalendarCheck, ExternalLink, Eye, EyeOff, LayoutGrid, Star, Timer, Users } from 'lucide-react';
import {
  CATALOGO_RELATORIOS, montarArrumacao, PARETO_POR, SECOES_RELATORIOS, SEPARAR_POR, type ParetoPor, type SecaoRelatorios, type SepararPor,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import type { RelatoriosChamados as Relatorios } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Abas, Carregando, Chip, mensagemErro, Toggle, useToast, Vazio } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { data } from '../../lib/format.js';
import { useLembrarFiltros } from '../../lib/voltar.js';
import { ABAS_CHAMADOS, Filtros, FiltrosAtivos, levarFiltros, Periodo, Situacao } from './Index.js';
import { JanelaDaPeca } from './relatorios/pecas.js';
import { Escada, Gargalo, Prazo, PrimeiraResposta, Prioridade, Relogio } from './relatorios/Tempo.js';
import { DiasForaDaCurva, EntradaSaida, IdadeDaFila, MapaDeCalor, Pareto, Previsao, SobeDesce } from './relatorios/Volume.js';
import { DeQuemEAFalha, RaioXNaPagina, Reincidencia, TamanhoDoCliente } from './relatorios/Clientes.js';
import { CardBemPreenchido, QuadroDaEquipe } from './relatorios/Equipe.js';
import { FechamentoDoMes } from './relatorios/Mes.js';

type Aba = 'favoritos' | SecaoRelatorios;
type Arrumacao = { ordem: string[]; ocultos: string[]; favoritos: string[] };

const SECOES: Array<{ id: SecaoRelatorios; label: string; icone: typeof Timer }> = [
  { id: 'tempo', label: 'Tempo', icone: Timer },
  { id: 'volume', label: 'Volume', icone: ArrowDownUp },
  { id: 'clientes', label: 'Clientes', icone: Building2 },
  { id: 'equipe', label: 'Equipe', icone: Users },
  { id: 'mes', label: 'Mês', icone: CalendarCheck },
];
const NOME_SECAO = Object.fromEntries(SECOES.map((s) => [s.id, s.label])) as Record<SecaoRelatorios, string>;
const CATALOGO = new Map(CATALOGO_RELATORIOS.map((c) => [c.id, c]));
const MULTI = ['etapa', 'responsavel', 'etiqueta', 'campo'] as const;

/** Os relatórios de uma aba, na ordem da arrumação, sem os escondidos. */
function daAba(aba: Aba, a: Arrumacao): string[] {
  if (aba === 'favoritos') return a.favoritos.filter((id) => !a.ocultos.includes(id));
  return a.ordem.filter((id) => CATALOGO.get(id)?.secao === aba && !a.ocultos.includes(id));
}

export function RelatoriosChamados() {
  useLembrarFiltros('/chamados/relatorios');
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const podeArrumar = can('admin.manage');
  const separar = (SEPARAR_POR as readonly string[]).includes(sp.get('separar') ?? '') ? (sp.get('separar') as SepararPor) : undefined;
  const paretoPor = (PARETO_POR as readonly string[]).includes(sp.get('pareto') ?? '') ? (sp.get('pareto') as ParetoPor) : undefined;
  const juntar = sp.get('juntar') === '1';
  const sobeSeparado = sp.get('separado') === '1';
  const clienteId = sp.get('cliente') ?? '';

  const filtros = useMemo(() => ({
    de: sp.get('de') ?? undefined, ate: sp.get('ate') ?? undefined,
    etapa: sp.getAll('etapa'), responsavel: sp.getAll('responsavel'), etiqueta: sp.getAll('etiqueta'), campo: sp.getAll('campo'),
    busca: sp.get('busca') ?? undefined,
    arquivados: sp.get('arquivados') === '1' ? 'true' : undefined,
    separar, pareto: paretoPor, mes: sp.get('mes') ?? undefined, juntarAssuntos: juntar ? 'true' : undefined, sobeSeparado: sobeSeparado ? 'true' : undefined,
  }), [sp, separar, paretoPor, juntar, sobeSeparado]);
  /** Os filtros que valem para a janela da peça e o Raio-X (sem o que é só da tela). */
  const filtrosBase = useMemo(() => ({ ...filtros, separar: undefined }), [filtros]);
  const chave = JSON.stringify(filtros);

  const opcoes = useQuery({ queryKey: ['chamados', 'opcoes'], queryFn: () => api.chamados.opcoes(), refetchInterval: 60_000 });
  const painel = useQuery({ queryKey: ['chamados', 'painel'], queryFn: () => api.chamados.painel(), refetchInterval: 5 * 60_000 });
  const rel = useQuery({ queryKey: ['chamados', 'relatorios', chave], queryFn: () => api.chamados.relatorios(filtros), placeholderData: keepPreviousData, refetchInterval: 5 * 60_000 });
  const arrumacao = useQuery({ queryKey: ['chamados', 'relatorios-arrumacao'], queryFn: () => api.chamados.arrumacaoRelatorios(), refetchInterval: 5 * 60_000 });
  const [peca, setPeca] = useState<string | null>(null);

  // ---- a arrumação (da equipe) e o rascunho do Organizar
  const salvo: Arrumacao = useMemo(() => {
    const a = arrumacao.data ?? montarArrumacao(null);
    return { ordem: a.ordem, ocultos: a.ocultos, favoritos: a.favoritos };
  }, [arrumacao.data]);
  const [rascunho, setRascunho] = useState<Arrumacao | null>(null);
  const organizando = rascunho !== null;
  const atual = rascunho ?? salvo;
  const mudou = organizando && JSON.stringify(rascunho) !== JSON.stringify(salvo);
  const ultimaArrumacao = arrumacao.data?.atualizadoEm
    ? `Última arrumação: ${arrumacao.data.atualizadoPor ?? 'alguém da administração'}, ${data(arrumacao.data.atualizadoEm, true)}.`
    : 'A página está na arrumação de fábrica.';

  // a aba: a do endereço; sem ela, os Favoritos (se tiver algum) ou o Tempo
  const pedida = sp.get('sec') ?? '';
  const aba: Aba = pedida === 'favoritos' || (SECOES_RELATORIOS as readonly string[]).includes(pedida)
    ? (pedida as Aba)
    : daAba('favoritos', salvo).length ? 'favoritos' : 'tempo';

  const salvar = useMutation({
    mutationFn: (a: Arrumacao) => api.chamados.salvarArrumacaoRelatorios(a),
    onSuccess: (a) => {
      qc.setQueryData(['chamados', 'relatorios-arrumacao'], a);
      setRascunho(null);
      toast.push('ok', 'Arrumação salva: a equipe toda vê os Relatórios assim.');
    },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });

  /** Sobe ou desce um relatório: dentro da aba dele, ou dentro dos Favoritos. */
  const mover = (id: string, passo: -1 | 1) => setRascunho((r) => {
    if (!r) return r;
    if (aba === 'favoritos') {
      const i = r.favoritos.indexOf(id); const j = i + passo;
      if (i < 0 || j < 0 || j >= r.favoritos.length) return r;
      const f = [...r.favoritos]; [f[i], f[j]] = [f[j]!, f[i]!];
      return { ...r, favoritos: f };
    }
    const secao = CATALOGO.get(id)?.secao;
    const daSecao = r.ordem.filter((x) => CATALOGO.get(x)?.secao === secao);
    const i = daSecao.indexOf(id); const j = i + passo;
    if (i < 0 || j < 0 || j >= daSecao.length) return r;
    const outro = daSecao[j]!;
    return { ...r, ordem: r.ordem.map((x) => (x === id ? outro : x === outro ? id : x)) };
  });
  /** A estrela: entra no fim dos Favoritos (e volta a aparecer, se estava escondido) ou sai deles. */
  const estrela = (id: string) => setRascunho((r) => (!r ? r : r.favoritos.includes(id)
    ? { ...r, favoritos: r.favoritos.filter((x) => x !== id) }
    : { ...r, favoritos: [...r.favoritos, id], ocultos: r.ocultos.filter((x) => x !== id) }));
  /** Esconder tira também dos Favoritos: escondido não aparece em lugar nenhum. */
  const esconder = (id: string) => setRascunho((r) => (!r ? r : r.ocultos.includes(id)
    ? { ...r, ocultos: r.ocultos.filter((x) => x !== id) }
    : { ...r, ocultos: [...r.ocultos, id], favoritos: r.favoritos.filter((x) => x !== id) }));
  /** "Voltar ao padrão": a ordem de fábrica e todos à vista. Os favoritos ficam. */
  const voltarAoPadrao = () => setRascunho((r) => (r ? { ...montarArrumacao(null), favoritos: r.favoritos } : r));

  const mudar = (fn: (n: URLSearchParams) => void) => { const n = new URLSearchParams(sp); fn(n); setSp(n, { replace: true }); };
  const definirLista = (nome: string, valores: string[]) => mudar((n) => { n.delete(nome); valores.forEach((v) => n.append(nome, v)); });
  const tirar = (nome: string, valores: string[]) => definirLista(nome, sp.getAll(nome).filter((x) => !valores.includes(x)));
  const limpar = () => mudar((n) => { MULTI.forEach((k) => n.delete(k)); n.delete('busca'); n.delete('arquivados'); });
  const definir = (k: string, v: string | undefined) => mudar((n) => { if (v) n.set(k, v); else n.delete(k); });

  const op = opcoes.data;
  const r = rel.data;
  const gruposSalvos = useMemo(() => new Map((painel.data?.itens ?? []).map((x) => [x.id, x.grupos ?? []])), [painel.data]);
  const temFiltro = MULTI.some((k) => sp.getAll(k).length) || !!sp.get('busca') || sp.get('arquivados') === '1';

  if (opcoes.isLoading) return <Pagina titulo="Chamados"><Carregando /></Pagina>;
  if (op && !op.configurado && op.totalCards === 0) {
    return <Pagina titulo="Chamados"><Vazio titulo="A leitura do LineChat ainda não foi ligada" texto="Os relatórios usam os chamados copiados do LineChat. A administração liga a leitura em Administração › Ajustes." /></Pagina>;
  }

  /** Os filtros escritos, para o rodapé do Fechamento do mês (vai junto no PDF). */
  const filtrosEscritos: string[] = [];
  if (op) {
    for (const v of sp.getAll('responsavel')) filtrosEscritos.push(`Responsável: ${v === op.vazio ? 'sem responsável' : v}`);
    for (const v of sp.getAll('etapa')) filtrosEscritos.push(`Etapa: ${op.etapas.find((e) => e.id === v)?.title ?? v}`);
    for (const v of sp.getAll('etiqueta')) filtrosEscritos.push(`Etiqueta: ${op.etiquetas.find((t) => t.id === v)?.name ?? v}`);
    for (const v of sp.getAll('campo')) { const i = v.indexOf('='); const c = op.campos.find((x) => x.key === v.slice(0, i)); filtrosEscritos.push(`${c?.name ?? v.slice(0, i)}: ${v.slice(i + 1) === op.vazio ? 'não preenchido' : v.slice(i + 1)}`); }
    if (sp.get('busca')) filtrosEscritos.push(`Procurando: ${sp.get('busca')}`);
    if (sp.get('arquivados') === '1') filtrosEscritos.push('com arquivados');
  }

  const naAba = daAba(aba, salvo);
  const escondidosDaAba = aba === 'favoritos' ? [] : salvo.ordem.filter((id) => CATALOGO.get(id)?.secao === aba && salvo.ocultos.includes(id));
  // o período não vale para o Fechamento do mês (que tem o mês dele): some quando só ele está na aba
  const comPeriodo = naAba.some((id) => id !== 'mes') || !naAba.length;

  /** Um relatório pelo id do catálogo. */
  const relatorio = (id: string, rr: Relatorios, primeiroDia: string): ReactNode => {
    switch (id) {
      case 'relogio': return <Relogio r={rr} abrir={setPeca} separar={separar} aoSeparar={(v) => definir('separar', v)} />;
      case 'escada': return <Escada r={rr} abrir={setPeca} />;
      case 'gargalo': return <Gargalo r={rr} abrir={setPeca} />;
      case 'primeira': return <PrimeiraResposta r={rr} abrir={setPeca} />;
      case 'prioridade': return <Prioridade r={rr} abrir={setPeca} />;
      case 'prazo': return <Prazo r={rr} abrir={setPeca} />;
      case 'calor': return <MapaDeCalor r={rr} abrir={setPeca} />;
      case 'fila': return <EntradaSaida r={rr} abrir={setPeca} />;
      case 'idade': return <IdadeDaFila r={rr} abrir={setPeca} />;
      case 'picos': return <DiasForaDaCurva r={rr} abrir={setPeca} />;
      case 'sobe': return <SobeDesce r={rr} abrir={setPeca} separado={sobeSeparado} aoSeparar={(v) => definir('separado', v ? '1' : undefined)} />;
      case 'pareto': return <Pareto r={rr} abrir={setPeca} aoPor={(v) => definir('pareto', v)} />;
      case 'previsao': return <Previsao r={rr} />;
      case 'raiox': return <RaioXNaPagina clienteId={clienteId} aoEscolher={(c) => definir('cliente', c || undefined)} filtros={filtrosBase} />;
      case 'tamanho': return (
        <TamanhoDoCliente
          r={rr} abrir={setPeca}
          aoRaioX={(c) => {
            // o Raio-X nesta aba: rola até ele; em outra aba: vai para lá; escondido: a ficha do cliente tem o mesmo Raio-X
            if (naAba.includes('raiox')) { definir('cliente', c); document.getElementById('raiox')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            else if (!salvo.ocultos.includes('raiox')) { mudar((n) => { n.set('cliente', c); n.set('sec', CATALOGO.get('raiox')!.secao); }); window.scrollTo({ top: 0 }); }
            else nav(`/clientes/${encodeURIComponent(c)}?aba=chamados`);
          }}
        />
      );
      case 'reincidencia': return <Reincidencia r={rr} juntar={juntar} aoJuntar={(v) => definir('juntar', v ? '1' : undefined)} />;
      case 'falha': return <DeQuemEAFalha r={rr} abrir={setPeca} />;
      case 'equipe': return <QuadroDaEquipe r={rr} abrir={setPeca} />;
      case 'preenchimento': return <CardBemPreenchido r={rr} abrir={setPeca} />;
      case 'mes': return <FechamentoDoMes r={rr} primeiroDia={primeiroDia} aoMes={(m) => definir('mes', m)} abrir={setPeca} filtrosEscritos={filtrosEscritos} />;
      default: return null;
    }
  };

  return (
    <Pagina
      titulo="Chamados"
      sub={<>Relatórios do painel <b className="text-ink-2">{op?.painelNome || 'de suporte'}</b> do LineChat. Clique num número, numa faixa ou num quadrado para ver os chamados.</>}
      acoes={<>
        <Situacao op={op} />
        {op?.linkDoPainel && <a className="btn-secondary btn-sm" href={op.linkDoPainel} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir no LineChat</a>}
        {podeArrumar && !organizando && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setRascunho(salvo)} title={`Mudar a ordem, esconder e escolher os favoritos — para a equipe toda. ${ultimaArrumacao}`}>
            <LayoutGrid size={14} /> Organizar
          </button>
        )}
      </>}
    >
      <div className="so-tela">
        <Abas<string>
          atual="relatorios" abas={ABAS_CHAMADOS}
          onChange={(a) => {
            if (a === 'relatorios') return;
            const n = levarFiltros(sp, new URLSearchParams({ aba: a }), a === 'periodo');
            nav(`/chamados?${n.toString()}`);
          }}
        />

        {/* as abas dos relatórios: os Favoritos primeiro */}
        <nav aria-label="Abas dos relatórios" className="flex gap-1.5 overflow-x-auto sem-barra pb-1 mb-3">
          {[{ id: 'favoritos' as Aba, label: 'Favoritos', icone: Star }, ...SECOES].map((s) => {
            const nomes = daAba(s.id, atual).map((id) => CATALOGO.get(id)!.titulo);
            return (
              <button
                key={s.id} type="button" aria-current={aba === s.id ? 'page' : undefined}
                title={nomes.length ? nomes.join(' · ') : s.id === 'favoritos' ? 'Nenhum favorito ainda' : 'Todos escondidos'}
                onClick={() => mudar((n) => { n.set('sec', s.id); })}
                className={`shrink-0 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13.5px] font-semibold transition-colors ${aba === s.id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'}`}
              >
                <s.icone size={15} className={s.id === 'favoritos' && nomes.length ? 'fill-current' : ''} /> {s.label}
                {s.id === 'favoritos' && nomes.length > 0 && <span className="tnum text-[12px] font-normal opacity-75">{nomes.length}</span>}
              </button>
            );
          })}
        </nav>

        {/* período e filtros (o Fechamento do mês usa o mês dele) */}
        {!organizando && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {comPeriodo && r && op && <Periodo de={r.de} ate={r.ate} hoje={r.hoje} primeiroDia={op.primeiroDia} onChange={(de, ate) => mudar((n) => { n.set('de', de); n.set('ate', ate); })} />}
              {op && <Filtros op={op} sp={sp} definirLista={definirLista} grupos={gruposSalvos} />}
              <label className="flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer ml-1" title="Cards arquivados no LineChat. A tela de Chamados também não conta, a não ser que você ligue.">
                <Toggle checked={sp.get('arquivados') === '1'} onChange={(v) => definir('arquivados', v ? '1' : undefined)} />
                <Archive size={14} /> incluir arquivados
              </label>
            </div>
            {op && temFiltro && (
              <FiltrosAtivos op={op} sp={sp} aba="periodo" emAberto={false} grupos={gruposSalvos} tirar={(nome, v) => (nome === 'busca' ? definir('busca', undefined) : tirar(nome, v))} limpar={limpar} />
            )}
          </>
        )}
      </div>

      {organizando && rascunho ? (
        <Organizar
          aba={aba} a={rascunho} mudou={mudou} salvando={salvar.isPending} ultimaArrumacao={ultimaArrumacao}
          mover={mover} estrela={estrela} esconder={esconder}
          voltarAoPadrao={voltarAoPadrao} cancelar={() => setRascunho(null)} salvar={() => salvar.mutate(rascunho)}
          irPara={(s) => mudar((n) => { n.set('sec', s); })}
        />
      ) : rel.isError ? <div className="text-bad text-sm">{mensagemErro(rel.error)}</div> : !r || !op || arrumacao.isLoading ? <Carregando /> : (
        <div className={`transition-opacity ${rel.isFetching && rel.isPlaceholderData ? 'opacity-60' : ''}`}>
          {!naAba.length ? (
            aba === 'favoritos'
              ? <Vazio titulo="Nenhum favorito ainda" texto={podeArrumar ? 'Clique em Organizar e marque a estrela ★ nos relatórios que a equipe mais usa: eles aparecem aqui, na ordem que você escolher.' : 'Quem administra escolhe os favoritos em Organizar.'} />
              : <Vazio titulo="Todos os relatórios desta aba estão escondidos" texto={podeArrumar ? 'Mostre de volta em Organizar.' : 'Quem administra mostra de volta em Organizar.'} />
          ) : <Grade ids={naAba} render={(id) => relatorio(id, r, op.primeiroDia)} />}
          {escondidosDaAba.length > 0 && naAba.length > 0 && (
            <p className="so-tela text-[12.5px] text-muted mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
              <EyeOff size={13} className="shrink-0" />
              {escondidosDaAba.length === 1 ? 'Um relatório escondido' : `${escondidosDaAba.length} relatórios escondidos`} nesta aba: {escondidosDaAba.map((id) => CATALOGO.get(id)!.titulo).join(', ')}{/[?.!]$/.test(CATALOGO.get(escondidosDaAba[escondidosDaAba.length - 1]!)!.titulo) ? '' : '.'}
              {podeArrumar ? <button type="button" className="link" onClick={() => setRascunho(salvo)}>Organizar</button> : ' Quem administra mostra de volta em Organizar.'}
            </p>
          )}
        </div>
      )}

      <JanelaDaPeca peca={peca} filtros={filtrosBase} onClose={() => setPeca(null)} />
    </Pagina>
  );
}

/**
 * Os relatórios de uma aba, um embaixo do outro. Os de meia largura (os do Tempo) andam em dupla
 * na tela larga; um de meia largura que ficou sem par ocupa a linha toda.
 */
function Grade({ ids, render }: { ids: string[]; render: (id: string) => ReactNode }) {
  const metade = (id: string | undefined) => !!id && CATALOGO.get(id)?.largura === 'metade';
  const larga: Record<string, boolean> = {};
  let seguidos = 0;
  ids.forEach((id, i) => {
    if (!metade(id)) { larga[id] = true; seguidos = 0; return; }
    seguidos++;
    // ímpar na sequência e o próximo não é de meia largura: fica sozinho na linha
    larga[id] = seguidos % 2 === 1 && !metade(ids[i + 1]);
  });
  return (
    <div className="grid gap-4 xl:grid-cols-2 items-start">
      {ids.map((id) => <div key={id} className={`min-w-0 flex flex-col ${larga[id] ? 'xl:col-span-2' : ''}`}>{render(id)}</div>)}
    </div>
  );
}

/**
 * O Organizar dos Relatórios (só a administração, vale para a equipe toda): a lista da aba aberta,
 * com as setas para mudar a ordem, a estrela dos Favoritos e o esconder. As outras abas continuam
 * clicáveis em cima; nada vale antes do "Salvar para todos".
 */
function Organizar({ aba, a, mudou, salvando, ultimaArrumacao, mover, estrela, esconder, voltarAoPadrao, cancelar, salvar, irPara }: {
  aba: Aba; a: Arrumacao; mudou: boolean; salvando: boolean; ultimaArrumacao: string;
  mover: (id: string, passo: -1 | 1) => void; estrela: (id: string) => void; esconder: (id: string) => void;
  voltarAoPadrao: () => void; cancelar: () => void; salvar: () => void; irPara: (s: SecaoRelatorios) => void;
}) {
  const ids = aba === 'favoritos' ? a.favoritos : a.ordem.filter((id) => CATALOGO.get(id)?.secao === aba);
  const botao = 'p-1.5 rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-16 z-10 rounded-xl border border-accent bg-accent-soft px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 shadow-sm">
        <LayoutGrid size={17} className="text-accent shrink-0" />
        <div className="text-[13px] text-accent-ink flex-1 min-w-[240px] leading-snug">
          <b>Organizando os Relatórios para a equipe toda.</b> Em cada aba, mude a ordem com as setas, esconda o que não usa e marque a estrela <Star size={12} className="inline -mt-0.5" /> para pôr nos Favoritos.
          <span className="block text-[12px] opacity-80 mt-0.5">Na aba Favoritos, as setas mudam a ordem dos favoritos. {ultimaArrumacao}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn-ghost btn-sm" onClick={voltarAoPadrao} title="Volta a ordem de fábrica e mostra todos de novo. Os favoritos ficam.">Voltar ao padrão</button>
          <button type="button" className="btn-secondary btn-sm" onClick={cancelar}>Cancelar</button>
          <button type="button" className="btn-primary btn-sm" disabled={!mudou || salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar para todos'}</button>
        </div>
      </div>

      <section className="card p-2 sm:p-3" aria-label={`Organizar: ${aba === 'favoritos' ? 'Favoritos' : NOME_SECAO[aba]}`}>
        {!ids.length ? (
          <div className="p-4 text-[13.5px] text-muted">
            Nenhum favorito ainda. Abra uma aba (
            {SECOES.map((s, i) => <Fragment key={s.id}>{i > 0 && ', '}<button type="button" className="link" onClick={() => irPara(s.id)}>{s.label}</button></Fragment>)}
            ) e marque a estrela <Star size={12} className="inline -mt-0.5" /> nos relatórios que a equipe mais usa.
          </div>
        ) : (
          <ol className="divide-y divide-line">
            {ids.map((id, i) => {
              const c = CATALOGO.get(id)!;
              const oculto = a.ocultos.includes(id);
              const fav = a.favoritos.includes(id);
              return (
                <li key={id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5 py-2 ${oculto ? 'bg-surface-2 rounded-lg' : ''}`}>
                  <span className="flex items-center">
                    <button type="button" className={botao} disabled={i === 0} onClick={() => mover(id, -1)} aria-label={`${c.titulo}: subir`} title="Subir"><ArrowUp size={16} /></button>
                    <button type="button" className={botao} disabled={i === ids.length - 1} onClick={() => mover(id, 1)} aria-label={`${c.titulo}: descer`} title="Descer"><ArrowDown size={16} /></button>
                  </span>
                  <span className="tnum text-[12px] text-muted w-5 text-right">{i + 1}</span>
                  <span className={`flex-1 min-w-[160px] text-[14px] ${oculto ? 'text-muted line-through decoration-1' : 'font-semibold'}`}>{c.titulo}</span>
                  {aba === 'favoritos' && <Chip tone="muted">{NOME_SECAO[c.secao]}</Chip>}
                  {oculto && <Chip tone="muted">escondido</Chip>}
                  <span className="flex items-center gap-1 ml-auto">
                    <button
                      type="button" className={`btn-ghost btn-sm ${fav ? 'text-signal' : ''}`} aria-pressed={fav} onClick={() => estrela(id)}
                      title={fav ? 'Tirar dos Favoritos' : 'Pôr nos Favoritos'}
                    >
                      <Star size={15} className={fav ? 'fill-current' : ''} /> <span className="hidden sm:inline">{fav ? 'Favorito' : 'Favoritar'}</span>
                    </button>
                    {aba !== 'favoritos' && (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => esconder(id)} aria-label={`${oculto ? 'Mostrar' : 'Esconder'} ${c.titulo}`}>
                        {oculto ? <><Eye size={14} /> Mostrar</> : <><EyeOff size={14} /> Esconder</>}
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <p className="text-[12.5px] text-muted">
        {a.favoritos.length ? `${a.favoritos.length} favorito${a.favoritos.length === 1 ? '' : 's'}` : 'Nenhum favorito'} · {CATALOGO_RELATORIOS.length - a.ocultos.length} de {CATALOGO_RELATORIOS.length} relatórios à vista.
        A aba de cada relatório é fixa; escondido não aparece em lugar nenhum (nem nos Favoritos).
      </p>
    </div>
  );
}
