/**
 * O CALENDÁRIO (Patch 2.0.1, decisão 0049) — /calendario. As visitas, as viradas de sistema e para a
 * nuvem, as folgas, os home offices, as reuniões e as ações no cliente de cada equipe, no mês.
 *
 * Quem vê um evento é quem vê um dos painéis dele: o pedido do Luan — "se eu só sou participante do
 * painel do suporte eu só vou ver a do suporte; se eu sou do painel do adm, do suporte e do dev, vejo de
 * todos". Em cima, quem está fora do escritório hoje; os filtros (os painéis — desde o 2.0.2, um botão
 * com a lista de caixas de marcar —, os tipos — o mesmo botão desde o 2.0.4.1, com a cor de cada um —, só os
 * meus e a busca) ficam no endereço, como nos chamados (o filtro de cliente saiu no 2.0.2: "n precisa de filtro por
 * cliente"; a busca acha o cliente); a visão Mês (a grade, com o dia escolhido ao lado ou embaixo) e a
 * Lista (o mês dia a dia). O evento abre numa janela (Janela.tsx); quem trabalha nos chamados cria e
 * muda; quem cuida deles muda os tipos. O endereço com `?evento=` (o lembrete do sininho e do WhatsApp,
 * 2.0.2) abre o calendário no dia, com a janela do evento.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List, Plus, Shapes, SlidersHorizontal, SquareKanban, Tags, UserRoundCheck } from 'lucide-react';
import {
  DIAS_DA_SEMANA, diaCurto, diaPorExtenso, diasDaGradeDoMes, diaValido, eventosDoDia, filtrarEventos, hojeNoCalendario, mesDoDia, ordemDoDia,
  somarDias, somarMeses, textoDoHorario, textoDoMes, textoDoPeriodo, tipoDoEvento,
  type CalendarioOpcoes, type CorPainel, type EventoDoCalendario, type FiltroDoCalendario,
} from '@gestor/shared';
import { Carregando, Chip, mensagemErro, useToast } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { FiltroEmBotao } from '../../lib/filtros.js';
import { AMOSTRA_DA_COR } from '../atendimento/comum.js';
import { CampoBusca, PONTO_DO_PAINEL, useFiltrosNoEndereco } from '../atendimento/quadro/filtros.js';
import {
  BORDA_DO_TIPO, ForaDoEscritorio, FUNDO_DO_TIPO, LinhaDoEvento, useEventosDoPeriodo, useNomesDasPessoas, useOpcoesDoCalendario,
} from './comum.js';
import { JanelaDoEvento, type AberturaDoEvento } from './Janela.js';
import { JanelaDosTipos } from './Tipos.js';

/** Quantos eventos cabem no quadradinho do dia (o resto vira "+2"). */
const NO_DIA = 3;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const listaDoEndereco = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

export function Calendario() {
  const { user } = useAuth();
  const { valor, mudar } = useFiltrosNoEndereco();
  const opcoes = useOpcoesDoCalendario();
  const hoje = opcoes.data?.hoje ?? hojeNoCalendario();
  const mes = MES.test(valor('mes')) ? valor('mes') : mesDoDia(hoje);
  const ver: 'mes' | 'lista' = valor('ver') === 'lista' ? 'lista' : 'mes';
  const grade = useMemo(() => diasDaGradeDoMes(mes), [mes]);
  const eventos = useEventosDoPeriodo(grade[0]!, grade[grade.length - 1]!, !!opcoes.data);
  const deHoje = useEventosDoPeriodo(hoje, hoje, !!opcoes.data);
  const nomes = useNomesDasPessoas(opcoes.data);
  const [janela, setJanela] = useState<AberturaDoEvento | null>(null);
  const [tipos, setTipos] = useState(false);
  // no celular os filtros ficam atrás de um botão (a grade aparece logo); no computador, sempre à vista
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const filtro: FiltroDoCalendario = {
    paineis: listaDoEndereco(valor('painel')), tipos: listaDoEndereco(valor('tipo')), pessoa: valor('meus') === '1' ? user?.id ?? null : null,
    cancelados: valor('cancelados') !== '0', busca: valor('q'),
  };
  const filtrados = filtrarEventos(eventos.data ?? [], filtro, nomes);
  const ligados = [filtro.paineis.length > 0, filtro.tipos.length > 0, !!filtro.pessoa, !filtro.cancelados, !!filtro.busca].filter(Boolean).length;
  const filtrando = ligados > 0;

  // o endereço com o evento (o lembrete do sininho e do WhatsApp, 2.0.2): abre a janela dele quando o mês chega
  const toast = useToast();
  const doEndereco = valor('evento');
  useEffect(() => {
    if (!doEndereco || !eventos.data || eventos.isFetching) return;
    const e = eventos.data.find((x) => x.id === doEndereco);
    if (e) setJanela({ evento: e });
    else toast.push('info', 'Esse evento não está mais no calendário (ou é de um painel que você não vê).');
    mudar({ evento: null });
  }, [doEndereco, eventos.data, eventos.isFetching]); // eslint-disable-line react-hooks/exhaustive-deps

  // o dia escolhido (o do endereço; senão hoje, se o mês é o de hoje; senão o dia 1)
  const diaEscolhido = diaValido(valor('dia')) && grade.includes(valor('dia')) ? valor('dia') : mes === mesDoDia(hoje) ? hoje : `${mes}-01`;
  const irParaMes = (m: string) => mudar({ mes: m === mesDoDia(hoje) ? null : m, dia: null });
  const novo = (dia: string) => setJanela({ novo: { inicio: dia, fim: dia, paineis: filtro.paineis.length ? filtro.paineis : undefined } });

  if (opcoes.isLoading) return <Carregando texto="Abrindo o calendário…" />;
  if (opcoes.isError || !opcoes.data) {
    return (
      <div className="card p-4 text-sm" role="alert">
        <p className="text-bad">{mensagemErro(opcoes.error)}</p>
        <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => void opcoes.refetch()}>Tentar de novo</button>
      </div>
    );
  }
  const op = opcoes.data;

  return (
    <div>
      {/* o alto: o nome, o mês (com as setas e o Hoje), Mês ou Lista, os Tipos e o Novo evento */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3 pb-2 shadow-[inset_0_-1px_0_var(--line)]" id="calendario-topo">
        <h1 className="font-display text-xl font-semibold inline-flex items-center gap-2"><CalendarDays size={20} className="text-muted" aria-hidden /> Calendário</h1>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost btn-sm px-2" onClick={() => irParaMes(somarMeses(mes, -1))} aria-label="Mês anterior" title="Mês anterior"><ChevronLeft size={17} /></button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => mudar({ mes: null, dia: null })} title="Volta para o mês de hoje">Hoje</button>
          <button type="button" className="btn-ghost btn-sm px-2" onClick={() => irParaMes(somarMeses(mes, 1))} aria-label="Próximo mês" title="Próximo mês"><ChevronRight size={17} /></button>
        </div>
        <h2 className="font-display text-[17px] font-semibold first-letter:uppercase min-w-[150px]" aria-live="polite" id="calendario-mes">{textoDoMes(mes)}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={`sm:hidden btn-secondary btn-sm ${filtrando ? 'border-accent text-accent' : ''}`} aria-expanded={filtrosAbertos} aria-controls="calendario-filtros"
            onClick={() => setFiltrosAbertos((v) => !v)} id="calendario-botao-filtros">
            <SlidersHorizontal size={14} aria-hidden /> Filtros{ligados ? ` (${ligados})` : ''}
          </button>
          <div className="inline-flex rounded-lg border border-line-strong p-0.5 bg-surface" role="radiogroup" aria-label="Como ver">
            {([['mes', 'Mês', LayoutGrid], ['lista', 'Lista', List]] as const).map(([v, nome, Icone]) => (
              <button key={v} type="button" role="radio" aria-checked={ver === v} onClick={() => mudar({ ver: v === 'mes' ? null : v })}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px] font-semibold ${ver === v ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
                <Icone size={14} aria-hidden />{nome}
              </button>
            ))}
          </div>
          {/* cuidar dos tipos (o nome, a cor, os lembretes); o filtro dos tipos é o botão Tipos dos filtros */}
          {op.podeCuidar && <button type="button" className="btn-secondary btn-sm" onClick={() => setTipos(true)} id="calendario-tipos" title="O nome, a cor e os lembretes de cada tipo"><Tags size={15} /> Editar tipos</button>}
          {op.podeEditar && <button type="button" className="btn-primary" onClick={() => novo(diaEscolhido)} id="calendario-novo"><Plus size={16} /> Novo evento</button>}
        </div>
      </div>

      {deHoje.data && <ForaDoEscritorio eventos={deHoje.data} opcoes={op} nomes={nomes} dia={hoje} className="mb-3 rounded-xl border border-line bg-surface px-3 py-2" />}

      <Filtros op={op} filtro={filtro} mudar={mudar} eventos={eventos.data ?? []} filtrando={filtrando} aberto={filtrosAbertos} />

      {eventos.isError && (
        <div className="card p-3 text-sm mb-3" role="alert">
          <span className="text-bad">{mensagemErro(eventos.error)}</span>{' '}
          <button type="button" className="link" onClick={() => void eventos.refetch()}>Tentar de novo</button>
        </div>
      )}

      {ver === 'mes' ? (
        <div className="grid grid-cols-1 gap-4 items-start xl:grid-cols-[minmax(0,1fr)_300px]">
          <GradeDoMes mes={mes} dias={grade} eventos={filtrados} op={op} hoje={hoje} escolhido={diaEscolhido} carregando={eventos.isFetching && !eventos.data}
            onEscolher={(dia) => mudar({ dia: dia === hoje && mes === mesDoDia(hoje) ? null : dia })} onAbrir={(e) => setJanela({ evento: e })} onNovo={novo} />
          <PainelDoDia dia={diaEscolhido} eventos={filtrados} op={op} nomes={nomes} hoje={hoje} filtrando={filtrando} eu={user?.id ?? null}
            onAbrir={(e) => setJanela({ evento: e })} onNovo={novo} />
        </div>
      ) : (
        <ListaDoMes mes={mes} eventos={filtrados} op={op} nomes={nomes} hoje={hoje} filtrando={filtrando} eu={user?.id ?? null} onAbrir={(e) => setJanela({ evento: e })} />
      )}

      {janela && <JanelaDoEvento key={'evento' in janela ? janela.evento.id : `novo-${janela.novo.inicio}`} abertura={janela} opcoes={op} onFechar={() => setJanela(null)} />}
      {tipos && <JanelaDosTipos tipos={op.tipos} onFechar={() => setTipos(false)} />}
    </div>
  );
}

// =====================================================================
//  OS FILTROS (e a legenda dos tipos)
// =====================================================================

function BotaoDeFiltro({ ativo, onClick, children, titulo, id }: { ativo: boolean; onClick: () => void; children: ReactNode; titulo?: string; id?: string }) {
  return (
    <button type="button" aria-pressed={ativo} onClick={onClick} title={titulo} id={id}
      className={`chip border py-1 px-2.5 text-[12.5px] ${ativo ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`}>
      {children}
    </button>
  );
}

function Filtros({ op, filtro, mudar, eventos, filtrando, aberto }: {
  op: CalendarioOpcoes; filtro: FiltroDoCalendario; mudar: (o: Record<string, string | null>) => void; eventos: EventoDoCalendario[]; filtrando: boolean; aberto: boolean;
}) {
  // os painéis: um botão que abre a lista com caixas de marcar (2.0.2, o pedido do Luan: "clicar em painéis e
  // aparecer uma multisseleção para eu selecionar os que eu quero ver"); nada marcado = todos
  const paineis = [{ opcoes: op.paineis.map((p) => ({ key: p.id, label: p.nome, classeDoPonto: PONTO_DO_PAINEL[p.cor as CorPainel] ?? 'bg-line-strong' })) }];
  const nomesDosEscolhidos = op.paineis.filter((p) => filtro.paineis.includes(p.id)).map((p) => p.nome);
  // os tipos (2.0.4.1, o pedido do Luan: "esse filtro de tags tem q ser rolagem tipo o de paineis"): o mesmo botão
  // com a lista, cada tipo com a bolinha da cor dele (a legenda das cores fica ali); os ativos e os desativados que
  // ainda aparecem no mês, e o marcado que saiu da lista (para dar para desmarcar)
  const tipos = op.tipos.filter((t) => t.ativo || eventos.some((e) => e.tipoId === t.id) || filtro.tipos.includes(t.id));
  const opcoesDosTipos = [{ opcoes: tipos.map((t) => ({ key: t.id, label: t.ativo ? t.nome : `${t.nome} (desativado)`, classeDoPonto: AMOSTRA_DA_COR[t.cor] })) }];
  const tiposEscolhidos = tipos.filter((t) => filtro.tipos.includes(t.id)).map((t) => t.nome);
  return (
    <div className={`${aberto ? 'flex' : 'hidden'} sm:flex flex-wrap items-center gap-2 mb-3`} id="calendario-filtros">
      {op.paineis.length > 1 && (
        <div id="calendario-paineis" className="contents">
          <FiltroEmBotao icone={SquareKanban} nome="Painéis" grupos={paineis} escolhidos={filtro.paineis} alinhar="esquerda" vazio="Nenhum marcado: aparecem os eventos de todos."
            onChange={(v) => mudar({ painel: v.length && v.length < op.paineis.length ? v.join(',') : null })}
            dica={nomesDosEscolhidos.length ? `Mostrando os eventos de: ${nomesDosEscolhidos.join(', ')}` : 'Mostrando os eventos de todos os painéis que você vê'} />
        </div>
      )}
      <div id="calendario-tipos-filtro" className="contents">
        <FiltroEmBotao icone={Shapes} nome="Tipos" grupos={opcoesDosTipos} escolhidos={filtro.tipos} alinhar="esquerda" largura="w-[240px]" vazio="Nenhum marcado: aparecem os eventos de todos os tipos."
          onChange={(v) => mudar({ tipo: v.length && v.length < tipos.length ? v.join(',') : null })}
          dica={tiposEscolhidos.length ? `Mostrando só: ${tiposEscolhidos.join(', ')}` : 'Mostrando os eventos de todos os tipos (a lista tem a cor de cada um)'} />
      </div>
      <BotaoDeFiltro ativo={!!filtro.pessoa} onClick={() => mudar({ meus: filtro.pessoa ? null : '1' })} titulo="Só os eventos de que você participa" id="calendario-so-meus">
        <UserRoundCheck size={13} aria-hidden /> Só os meus
      </BotaoDeFiltro>
      <CampoBusca valor={filtro.busca} onChange={(v) => mudar({ q: v || null })} placeholder="Buscar no calendário" titulo="Busca no título, no cliente, no local, na observação, no chamado e nas pessoas"
        className="basis-full sm:basis-auto sm:flex-1 sm:min-w-[180px] sm:max-w-[320px]" id="calendario-busca" />
      <label className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2 cursor-pointer select-none">
        <input type="checkbox" className="w-4 h-4 accent-[var(--accent)]" checked={filtro.cancelados} onChange={(e) => mudar({ cancelados: e.target.checked ? null : '0' })} id="calendario-cancelados" />
        Mostrar os cancelados
      </label>
      {filtrando && (
        <button type="button" className="btn-ghost btn-sm text-muted" onClick={() => mudar({ painel: null, tipo: null, meus: null, cliente: null, q: null, cancelados: null })}>Limpar filtros</button>
      )}
    </div>
  );
}

// =====================================================================
//  O MÊS (a grade)
// =====================================================================

/** A largura de um elemento, acompanhando a tela (a grade fica compacta quando o dia não cabe o título). */
function useLargura(ref: RefObject<HTMLElement | null>) {
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLargura(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((xs) => setLargura(xs[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return largura;
}

function GradeDoMes({ mes, dias, eventos, op, hoje, escolhido, carregando, onEscolher, onAbrir, onNovo }: {
  mes: string; dias: string[]; eventos: EventoDoCalendario[]; op: CalendarioOpcoes; hoje: string; escolhido: string; carregando: boolean;
  onEscolher: (dia: string) => void; onAbrir: (e: EventoDoCalendario) => void; onNovo: (dia: string) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const largura = useLargura(caixa);
  // o quadradinho estreito (o celular, a tela pequena) mostra as bolinhas; o título vai para o dia escolhido
  const compacto = largura > 0 && largura / 7 < 88;
  const porDia = useMemo(() => new Map(dias.map((d) => [d, eventosDoDia(eventos, d)])), [dias, eventos]);
  return (
    <div ref={caixa} className={`card overflow-hidden min-w-0 ${carregando ? 'opacity-70' : ''}`} id="calendario-grade" data-compacto={compacto ? '1' : '0'}>
      <div className="grid grid-cols-7 bg-surface-2 border-b border-line" aria-hidden>
        {DIAS_DA_SEMANA.map((d, i) => (
          <div key={d} className={`px-2 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide ${i >= 5 ? 'text-muted' : 'text-ink-2'} ${compacto ? 'text-center px-0' : ''}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((dia, i) => (
          <Dia key={dia} dia={dia} i={i} doMes={mesDoDia(dia) === mes} eventos={porDia.get(dia) ?? []} op={op} hoje={hoje} escolhido={escolhido === dia} compacto={compacto}
            onEscolher={onEscolher} onAbrir={onAbrir} onNovo={onNovo} />
        ))}
      </div>
    </div>
  );
}

function Dia({ dia, i, doMes, eventos, op, hoje, escolhido, compacto, onEscolher, onAbrir, onNovo }: {
  dia: string; i: number; doMes: boolean; eventos: EventoDoCalendario[]; op: CalendarioOpcoes; hoje: string; escolhido: boolean; compacto: boolean;
  onEscolher: (dia: string) => void; onAbrir: (e: EventoDoCalendario) => void; onNovo: (dia: string) => void;
}) {
  const ehHoje = dia === hoje;
  const mostrar = compacto ? [] : eventos.slice(0, eventos.length > NO_DIA ? NO_DIA - 1 : NO_DIA);
  const resto = eventos.length - mostrar.length;
  const rotulo = `${diaPorExtenso(dia)}${ehHoje ? ' (hoje)' : ''}: ${eventos.length ? `${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'}` : 'nada marcado'}`;
  return (
    <div data-dia={dia} data-escolhido={escolhido ? '1' : undefined}
      className={`group relative min-w-0 flex flex-col cursor-pointer ${i % 7 ? 'border-l border-line' : ''} ${i >= 7 ? 'border-t border-line' : ''} ${doMes ? 'bg-surface' : 'bg-surface-2'} ${compacto ? 'min-h-[58px]' : 'min-h-[118px]'} ${escolhido ? 'outline outline-2 -outline-offset-2 outline-accent z-[1]' : 'hover:bg-surface-2'}`}
      onClick={() => onEscolher(dia)} onDoubleClick={() => { if (op.podeEditar) onNovo(dia); }}>
      <div className={`flex items-center px-1 pt-1 ${compacto ? 'justify-center' : 'justify-between'}`}>
        <button type="button" onClick={(ev) => { ev.stopPropagation(); onEscolher(dia); }} aria-label={rotulo} title={rotulo} aria-pressed={escolhido} aria-current={ehHoje ? 'date' : undefined}
          className={`tnum text-[12.5px] font-semibold w-6 h-6 rounded-full grid place-items-center ${ehHoje ? 'bg-accent text-white' : doMes ? 'text-ink' : 'text-muted'}`}>
          {Number(dia.slice(8, 10))}
        </button>
        {!compacto && op.podeEditar && (
          <button type="button" onClick={(ev) => { ev.stopPropagation(); onNovo(dia); }} aria-label={`Novo evento em ${diaCurto(dia)}`} title={`Novo evento em ${diaCurto(dia)}`}
            className="btn-ghost p-0.5 rounded text-muted opacity-0 group-hover:opacity-100 focus:opacity-100">
            <Plus size={14} />
          </button>
        )}
      </div>
      {compacto ? (
        eventos.length > 0 && (
          <div className="flex flex-wrap justify-center gap-[3px] px-1 pb-1.5 pt-0.5" aria-hidden>
            {eventos.slice(0, 6).map((e) => <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${AMOSTRA_DA_COR[tipoDoEvento(op.tipos, e.tipoId).cor]} ${e.situacao === 'cancelado' ? 'opacity-40' : ''}`} />)}
            {eventos.length > 6 && <span className="text-[9.5px] leading-[6px] text-muted font-semibold">+</span>}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-[3px] px-1 pb-1.5 pt-0.5 min-w-0">
          {mostrar.map((e) => <Barra key={e.id} e={e} dia={dia} op={op} onAbrir={onAbrir} />)}
          {resto > 0 && (
            <button type="button" className="text-left text-[11.5px] font-semibold text-muted hover:text-ink px-1.5" onClick={(ev) => { ev.stopPropagation(); onEscolher(dia); }}
              title={`Ver os ${eventos.length} eventos do dia`}>
              +{resto} {resto === 1 ? 'outro' : 'outros'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** O evento no quadradinho do dia: a cor do tipo, a hora e o título (o de vários dias continua de um dia para o outro). */
function Barra({ e, dia, op, onAbrir }: { e: EventoDoCalendario; dia: string; op: CalendarioOpcoes; onAbrir: (e: EventoDoCalendario) => void }) {
  const tipo = tipoDoEvento(op.tipos, e.tipoId);
  const veio = e.inicio < dia;
  const segue = e.fim > dia;
  const dica = `${e.titulo} — ${tipo.nome} · ${e.inicio === e.fim ? '' : `${textoDoPeriodo(e)} · `}${textoDoHorario(e)}${e.clienteNome ? ` · ${e.clienteNome}` : ''}`;
  // a cor já diz o tipo: "Visita — Clínica Aurora" aparece como "Clínica Aurora" (o título inteiro fica na dica)
  const prefixo = `${tipo.nome} — `;
  const texto = e.titulo.startsWith(prefixo) && e.titulo.length > prefixo.length ? e.titulo.slice(prefixo.length) : e.titulo;
  return (
    <button type="button" onClick={(ev) => { ev.stopPropagation(); onAbrir(e); }} title={dica} data-evento={e.id}
      className={`w-full min-w-0 text-left line-clamp-2 break-words px-1.5 py-px text-[12px] leading-[17px] font-medium ${FUNDO_DO_TIPO[tipo.cor]} ${veio ? 'rounded-l-none' : `rounded-l border-l-[3px] ${BORDA_DO_TIPO[tipo.cor]}`} ${segue ? 'rounded-r-none' : 'rounded-r'} ${e.situacao === 'cancelado' ? 'line-through opacity-60' : ''} hover:brightness-95`}>
      {e.situacao === 'feito' && <span aria-label="feito">✓ </span>}
      {!e.diaInteiro && e.horaInicio && !veio && <><span className="tnum font-semibold">{e.horaInicio}</span>{' '}</>}
      {texto}
    </button>
  );
}

// =====================================================================
//  O DIA ESCOLHIDO (do lado da grade; no celular, embaixo)
// =====================================================================

function PainelDoDia({ dia, eventos, op, nomes, hoje, filtrando, eu, onAbrir, onNovo }: {
  dia: string; eventos: EventoDoCalendario[]; op: CalendarioOpcoes; nomes: ReadonlyMap<string, string>; hoje: string; filtrando: boolean; eu: string | null;
  onAbrir: (e: EventoDoCalendario) => void; onNovo: (dia: string) => void;
}) {
  const doDia = eventosDoDia(eventos, dia);
  return (
    <section className="card p-3 min-w-0 xl:sticky xl:top-4" id="calendario-dia" aria-labelledby="calendario-dia-titulo">
      <div className="flex items-start gap-2 mb-2 min-w-0">
        <h2 id="calendario-dia-titulo" className="font-display font-semibold text-[15px] leading-snug flex-1 min-w-0 pt-1">
          <span className="first-letter:uppercase inline-block mr-1.5">{diaPorExtenso(dia)}</span>{dia === hoje && <Chip tone="accent" className="align-[2px]">Hoje</Chip>}
        </h2>
        {op.podeEditar && <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => onNovo(dia)} id="calendario-dia-novo"><Plus size={14} /> Novo</button>}
      </div>
      {doDia.length ? (
        <ul className="flex flex-col gap-0.5 -mx-1">
          {doDia.map((e) => <li key={e.id}><LinhaDoEvento e={e} opcoes={op} nomes={nomes} comVoce={eu} onAbrir={() => onAbrir(e)} /></li>)}
        </ul>
      ) : (
        <p className="text-[13px] text-muted rounded-lg border border-dashed border-line-strong px-3 py-4">
          Nada marcado neste dia{filtrando ? ' com esses filtros' : ''}.{op.podeEditar ? ' Dois cliques num dia da grade também abrem um evento novo.' : ''}
        </p>
      )}
    </section>
  );
}

// =====================================================================
//  A LISTA (o mês, dia a dia)
// =====================================================================

function ListaDoMes({ mes, eventos, op, nomes, hoje, filtrando, eu, onAbrir }: {
  mes: string; eventos: EventoDoCalendario[]; op: CalendarioOpcoes; nomes: ReadonlyMap<string, string>; hoje: string; filtrando: boolean; eu: string | null;
  onAbrir: (e: EventoDoCalendario) => void;
}) {
  const primeiro = `${mes}-01`;
  const ultimo = somarDias(`${somarMeses(mes, 1)}-01`, -1);
  // cada evento uma vez, no primeiro dia dele dentro do mês
  const grupos = useMemo(() => {
    const m = new Map<string, EventoDoCalendario[]>();
    for (const e of eventos) {
      if (e.fim < primeiro || e.inicio > ultimo) continue;
      const dia = e.inicio < primeiro ? primeiro : e.inicio;
      m.set(dia, [...(m.get(dia) ?? []), e]);
    }
    return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([dia, es]) => ({ dia, eventos: es.sort(ordemDoDia) }));
  }, [eventos, primeiro, ultimo]);
  if (!grupos.length) {
    return (
      <div className="card p-8 text-center" id="calendario-lista">
        <div className="font-display font-semibold">Nada no calendário em {textoDoMes(mes)}{filtrando ? ' com esses filtros' : ''}.</div>
        <p className="text-muted text-sm mt-1">{op.podeEditar ? 'O "Novo evento", no alto, marca uma visita, uma virada, uma folga…' : 'Quando a equipe marcar alguma coisa, aparece aqui.'}</p>
      </div>
    );
  }
  return (
    <div className="card divide-y divide-line" id="calendario-lista">
      {grupos.map((g) => (
        <section key={g.dia} className="px-3 py-2.5 grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-1" aria-label={diaPorExtenso(g.dia)} data-dia={g.dia}>
          <h3 className={`font-display text-[13.5px] font-semibold pt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ${g.dia === hoje ? 'text-accent' : 'text-ink-2'}`}>
            <span className="first-letter:uppercase">{diaPorExtenso(g.dia)}</span>{g.dia === hoje && <Chip tone="accent">Hoje</Chip>}
          </h3>
          <ul className="flex flex-col gap-0.5 min-w-0 -mx-1">
            {g.eventos.map((e) => <li key={e.id}><LinhaDoEvento e={e} opcoes={op} nomes={nomes} comVoce={eu} comPeriodo={e.inicio !== e.fim} onAbrir={() => onAbrir(e)} /></li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
