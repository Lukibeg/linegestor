/**
 * Chamados › Quadro (Patch 1.10, decisão 0047): o Kanban de um painel. Uma coluna por etapa, na
 * ordem do painel — N1, N2 e N3 são colunas, a escolha do Luan. Arrastar o cartão para outra coluna
 * muda a etapa: subir de nível é escalonar e pede o motivo, faltando algo a janela diz o quê, e
 * fechar comemora (tudo isso mora no `useMover`, o mesmo da ficha). Quem está no celular ou usa o
 * teclado tem o botão "Mover" no pé do cartão.
 *
 * O painel e os filtros ficam no endereço (?painel=…&responsavel=eu), e o quadro relê a cada minuto:
 * o prazo anda com o relógio. O Fechado mostra só os 30 mais recentes; o resto fica na lista. Em cima,
 * uma linha só (o painel, a busca e o botão Filtros), para sobrar altura para os cartões; clicar no
 * cartão abre o chamado numa janela grande por cima do quadro.
 *
 * O quadro se abre pela tela inicial dos chamados (os painéis, como no Helena): em cima, o caminho de
 * volta, o painel aberto, Quadro | Lista (a lista mora dentro do painel), "Trocar" (os outros painéis)
 * e "Configurar" (quem cuida) — o alto da visualização do painel, em `painel.tsx`.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode, type RefObject } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, ArrowRightLeft, CircleCheck, Clock, Filter, Inbox, Moon } from 'lucide-react';
import {
  DICA_TIPO_ETAPA, NOME_ESPERA, NOME_PRIORIDADE, PRIORIDADES, compararUrgencia, movimentoDeNivel,
  type CartaoChamado, type ColunaQuadro, type EtapaPainel, type FichaChamado, type OpcoesAtendimento, type Painel, type QuadroAtendimento, type TipoEspera,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { Carregando, EscolherComBusca, Popover, Spinner, Vazio, mensagemErro } from '../../components/ui/index.js';
import { CabecalhoDoPainel, FILTROS_DO_PAINEL, enderecoDaLista, type FiltrosDoPainel } from './painel.js';
import { CabecalhoAtendimento, dataHoraCurta, haQuanto, useAbrirChamado, useOpcoes, usePode } from './comum.js';
import { useMover } from './mover.js';
import { CartaoComRodape, cliqueAbreAFicha } from './quadro/cartao.js';
import {
  CAIXA_FILTRO, CampoBusca, FiltrosEscritos, SelectFiltro, nomeDoAssunto, nomeDoResponsavel, opcoesDeAssunto, opcoesDeResponsavel,
  useClientesParaFiltro, useFiltrosNoEndereco, type FiltroEscrito,
} from './quadro/filtros.js';

/** Os filtros do quadro — com os mesmos nomes da lista, para a troca de vista levar tudo junto. */
const FILTROS = FILTROS_DO_PAINEL;
type Filtros = FiltrosDoPainel;

const ESPERAS: Array<{ id: TipoEspera; nome: string }> = [{ id: 'cliente', nome: NOME_ESPERA.cliente }, { id: 'operadora', nome: NOME_ESPERA.operadora }];


export function Quadro() {
  const opcoes = useOpcoes();
  const { valor } = useFiltrosNoEndereco();
  const paineis = opcoes.data?.paineis ?? [];
  const pedido = valor('painel');
  // o painel do endereço (pelo id ou pela sigla)
  const painel = pedido ? paineis.find((p) => p.id === pedido) ?? paineis.find((p) => p.sigla === pedido.toUpperCase()) : undefined;
  const filtros = useMemo<Filtros>(() => Object.fromEntries(FILTROS.map((k) => [k, valor(k)]).filter(([, v]) => v)), [valor]);

  // sem o painel no endereço (um link antigo, a aba Quadro de antes): a escolha é na tela inicial
  if (!pedido) return <Navigate to="/atendimento" replace />;

  return (
    <div>
      <CabecalhoAtendimento painelId={painel?.id} />
      {opcoes.isLoading ? <Carregando /> : opcoes.isError ? <ErroComTentar erro={opcoes.error} tentar={() => void opcoes.refetch()} /> : !painel ? (
        <Vazio titulo="Painel não encontrado" texto="Ele pode ter saído, ou ser de acesso escolhido sem você na lista."
          acao={<Link to="/atendimento" className="btn-secondary"><ArrowLeft size={15} /> Ver os painéis</Link>} />
      ) : (
        // trocar de painel começa um quadro novo: nada do arrasto do outro painel fica para trás
        <QuadroDoPainel key={painel.id} painel={painel} opcoes={opcoes.data!} filtros={filtros} />
      )}
    </div>
  );
}

function ErroComTentar({ erro, tentar }: { erro: unknown; tentar: () => void }) {
  return (
    <div className="card p-4 text-sm" role="alert">
      <p className="text-bad">{mensagemErro(erro)}</p>
      <button type="button" className="btn-secondary btn-sm mt-2" onClick={tentar}>Tentar de novo</button>
    </div>
  );
}

/**
 * O chamado mudou (a ficha nova chegou do servidor): ele vai para a coluna nova na hora, sem esperar
 * o quadro inteiro reler — senão, entre a resposta e a releitura, o cartão "voltava" um instante
 * para a coluna de onde saiu. A releitura que vem logo depois acerta a ordem e os filtros.
 */
function comCartaoNovo(q: QuadroAtendimento, f: FichaChamado): QuadroAtendimento {
  const fica = f.painelId === q.painelId;
  return {
    ...q,
    colunas: q.colunas.map((col): ColunaQuadro => {
      const sem = col.chamados.filter((x) => x.id !== f.id);
      const estava = sem.length !== col.chamados.length;
      if (fica && col.etapa.id === f.etapaId) {
        // no Resolvido e no Fechado, o mais recente primeiro; nas outras, o mais urgente primeiro
        const chamados = col.etapa.tipo === 'resolvido' || col.etapa.tipo === 'fechado' ? [f, ...sem] : [...sem, f].sort(compararUrgencia);
        return { ...col, chamados, total: col.total + (estava ? 0 : 1) };
      }
      return estava ? { ...col, chamados: sem, total: Math.max(0, col.total - 1) } : col;
    }),
  };
}

function QuadroDoPainel({ painel, opcoes, filtros }: { painel: Painel; opcoes: OpcoesAtendimento; filtros: Filtros }) {
  const pode = usePode();
  const qc = useQueryClient();
  const { valor, mudar } = useFiltrosNoEndereco();
  const chave = useMemo(() => ['atendimento', 'quadro', painel.id, filtros], [painel.id, filtros]);
  const quadro = useQuery({
    queryKey: chave,
    queryFn: () => api.atendimento.quadro({ painel: painel.id, ...filtros }),
    // o prazo muda com o relógio: o quadro relê sozinho a cada minuto
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
  const { mover, janelas, ocupado } = useMover();

  // Toda ficha que muda (o mover devolve a ficha inteira, inclusive depois da janela de escalonar)
  // já põe o cartão no lugar novo.
  useEffect(() => qc.getQueryCache().subscribe((ev) => {
    if (ev.type !== 'updated' || ev.action.type !== 'success') return;
    const k = ev.query.queryKey;
    if (k[0] !== 'atendimento' || k[1] !== 'chamado') return;
    const f = ev.query.state.data as FichaChamado | undefined;
    if (!f || typeof f !== 'object' || !('etapaId' in f)) return;
    // só o que já está no quadro: um chamado de fora dos filtros não entra por aqui
    qc.setQueryData<QuadroAtendimento>(chave, (q) => (q && q.colunas.some((c) => c.chamados.some((x) => x.id === f.id)) ? comCartaoNovo(q, f) : q));
  }), [qc, chave]);

  // ---------- arrastar (HTML5): o cartão vai, a coluna recebe ----------
  const arrastado = useRef<CartaoChamado | null>(null);
  const [arrastando, setArrastando] = useState<{ id: string; etapaId: string } | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const comecar = (c: CartaoChamado, e: DragEvent<HTMLDivElement>) => {
    arrastado.current = c;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', c.codigo);
    // a imagem que acompanha o ponteiro é o cartão inteiro (o arrasto pode ter começado no título, que é um link)
    const r = e.currentTarget.getBoundingClientRect();
    try { e.dataTransfer.setDragImage(e.currentTarget, e.clientX - r.left, e.clientY - r.top); } catch { /* fica a imagem padrão */ }
    // esmaecer já agora sairia na própria imagem do arrasto (o navegador "fotografa" depois deste evento)
    requestAnimationFrame(() => setArrastando({ id: c.id, etapaId: c.etapaId }));
  };
  const terminar = () => { arrastado.current = null; setArrastando(null); setSobre(null); };
  const passar = (etapa: EtapaPainel, e: DragEvent<HTMLElement>) => {
    const c = arrastado.current;
    // a coluna de onde ele saiu não recebe (e o que não é um cartão daqui também não)
    if (!c || c.etapaId === etapa.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (sobre !== etapa.id) setSobre(etapa.id);
  };
  const sair = (etapa: EtapaPainel, e: DragEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setSobre((s) => (s === etapa.id ? null : s));
  };
  const soltar = (etapa: EtapaPainel, e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const c = arrastado.current;
    terminar();
    if (c && c.etapaId !== etapa.id) void mover(c, etapa.id);
  };
  /** Pelo menu (o teclado, o celular): depois de mover, o foco continua no cartão, já na coluna nova. */
  const moverPeloMenu = async (c: CartaoChamado, etapaId: string) => {
    const f = await mover(c, etapaId);
    if (!f) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`li[data-cartao="${f.id}"] button[aria-expanded]`)?.focus();
    }));
  };

  // ---------- os filtros ----------
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const pessoas = useMemo(() => opcoes.pessoas.filter((p) => p.ativo), [opcoes.pessoas]);
  const clientes = useClientesParaFiltro();
  const assuntos = useMemo(() => opcoesDeAssunto(opcoes, painel.id), [opcoes, painel.id]);
  const ligados = FILTROS.filter((k) => k !== 'q' && valor(k)).length;
  const escritos: FiltroEscrito[] = [];
  const tirar = (k: string) => () => mudar({ [k]: null });
  if (valor('q')) escritos.push({ chave: 'q', nome: 'Procurando', valor: `“${valor('q')}”`, tirar: tirar('q') });
  if (valor('responsavel')) escritos.push({ chave: 'responsavel', nome: 'Responsável', valor: nomeDoResponsavel(valor('responsavel'), opcoes.pessoas), tirar: tirar('responsavel') });
  if (valor('prioridade')) escritos.push({ chave: 'prioridade', nome: 'Prioridade', valor: NOME_PRIORIDADE[valor('prioridade') as keyof typeof NOME_PRIORIDADE] ?? valor('prioridade'), tirar: tirar('prioridade') });
  if (valor('espera')) escritos.push({ chave: 'espera', nome: 'Espera', valor: NOME_ESPERA[valor('espera') as TipoEspera] ?? valor('espera'), tirar: tirar('espera') });
  if (valor('cliente')) escritos.push({ chave: 'cliente', nome: 'Cliente', valor: clientes.find((c) => c.id === valor('cliente'))?.nome ?? '…', tirar: tirar('cliente') });
  if (valor('assunto')) escritos.push({ chave: 'assunto', nome: 'Assunto', valor: nomeDoAssunto(valor('assunto'), opcoes), tirar: tirar('assunto') });

  // o prazo em horas úteis para fora do horário; o de horas corridas, não
  const todasUteis = PRIORIDADES.every((p) => opcoes.prazos.prazos[p]?.conta !== 'corridas');
  const colunas = quadro.data?.painelId === painel.id ? quadro.data.colunas : undefined;
  const nenhum = !!colunas && colunas.every((c) => c.total === 0);
  const etapas = useMemo(() => colunas?.map((c) => c.etapa) ?? painel.etapas, [colunas, painel.etapas]);
  const podeMover = pode.trabalhar && opcoes.pode.trabalhar;
  const quadroRef = useRef<HTMLDivElement>(null);
  const alturaDasColunas = useAlturaQueSobra(quadroRef, [!!colunas, escritos.length, !!quadro.data?.foraDoHorario, nenhum, filtrosAbertos]);

  return (
    <>
      {/* numa linha só (o pedido do Luan: o alto tomava o espaço dos cartões): o painel aberto, o aviso de
          fora do horário, a busca e o botão dos filtros — as caixas dos filtros só aparecem quando pedidas,
          e o que está filtrado fica escrito logo embaixo, com o X */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2.5">
        <CabecalhoDoPainel paineis={opcoes.paineis} atual={painel} vista="quadro" outraVista={enderecoDaLista(painel.id, filtros)} className="min-w-0" />
        {quadro.data?.foraDoHorario && painel.ajustes.contaPrazo && (
          <span className="chip bg-surface-2 text-ink-2 font-medium" id="quadro-fora-do-horario"
            title={`Fora do horário de atendimento: ${todasUteis ? 'os prazos estão parados' : 'os prazos em horas úteis estão parados'}.`}>
            <Moon size={12} className="text-muted" aria-hidden /> {todasUteis ? 'Prazos parados' : 'Prazos úteis parados'}
          </span>
        )}
        <div className="flex items-center gap-2 w-full md:w-auto md:flex-1 md:min-w-[220px] md:max-w-[420px] md:ml-auto">
          <CampoBusca className="flex-1" id="quadro-busca" valor={valor('q')} onChange={(v) => mudar({ q: v })}
            placeholder="Código, título, cliente…" titulo="Acha pelo código, título, cliente, contato, telefone e pelo que foi escrito (sem acento)" />
          <button type="button" className={`btn-secondary ${filtrosAbertos ? 'border-accent text-accent-ink bg-accent-soft' : ''}`} aria-expanded={filtrosAbertos} aria-controls="quadro-filtros"
            id="quadro-botao-filtros" onClick={() => setFiltrosAbertos((v) => !v)} title={filtrosAbertos ? 'Esconder as caixas dos filtros' : 'Filtrar por responsável, prioridade, espera, cliente e assunto'}>
            <Filter size={15} /> Filtros{ligados > 0 && <span className="text-accent tnum">({ligados})</span>}
          </button>
        </div>
      </div>
      <div id="quadro-filtros" className={`${filtrosAbertos ? 'flex' : 'hidden'} flex-wrap items-center gap-2 mb-2.5`}>
        <EscolherComBusca className={CAIXA_FILTRO} rotulo="Responsável" valor={valor('responsavel')} vazio="Todos os responsáveis" opcoes={opcoesDeResponsavel(pessoas)} procurar="Procurar pessoa…" onChange={(v) => mudar({ responsavel: v })} />
        <SelectFiltro rotulo="Prioridade" valor={valor('prioridade')} vazio="Todas as prioridades" opcoes={PRIORIDADES.map((p) => ({ id: p, nome: NOME_PRIORIDADE[p] }))} onChange={(v) => mudar({ prioridade: v })} />
        <SelectFiltro rotulo="Espera" valor={valor('espera')} vazio="Esperando ou não" opcoes={ESPERAS} onChange={(v) => mudar({ espera: v })} />
        <EscolherComBusca className={CAIXA_FILTRO} rotulo="Cliente" valor={valor('cliente')} vazio="Todos os clientes" opcoes={clientes} procurar="Procurar cliente…" onChange={(v) => mudar({ cliente: v })} />
        {(assuntos.length > 0 || valor('assunto')) && (
          <EscolherComBusca className={CAIXA_FILTRO} largura="w-[380px]" rotulo="Assunto" valor={valor('assunto')} vazio="Todos os assuntos" opcoes={assuntos} procurar="Procurar assunto…" onChange={(v) => mudar({ assunto: v })} />
        )}
      </div>
      <FiltrosEscritos itens={escritos} onLimpar={() => mudar(Object.fromEntries(FILTROS.map((k) => [k, null])))} />
      {nenhum && escritos.length > 0 && <p className="text-[13px] text-muted mb-2">Nenhum chamado neste painel com esses filtros.</p>}

      {!colunas ? (quadro.isError ? <ErroComTentar erro={quadro.error} tentar={() => void quadro.refetch()} /> : <Carregando />) : (
        // as colunas rolam para o lado dentro do quadro (a página não); no celular, uma por vez, com encaixe
        <div
          ref={quadroRef} id="quadro-colunas" className="overflow-x-auto -mx-4 sm:mx-0 pb-3 snap-x snap-mandatory scroll-pl-4 sm:snap-none sm:scroll-pl-0"
          style={alturaDasColunas ? ({ '--altura-colunas': `${alturaDasColunas}px` } as CSSProperties) : undefined}
        >
          {/* colunas finas (o pedido do Luan na prévia: mais colunas cabendo na tela) */}
          <div className="flex items-start gap-2 w-max sm:w-auto px-4 sm:px-0">
            {colunas.map((col) => (
              <Coluna
                key={col.etapa.id} col={col} painel={painel} filtros={filtros}
                // a coluna de onde o cartão saiu não é destino: só as outras ficam tracejadas
                arrastando={!!arrastando && arrastando.etapaId !== col.etapa.id} sobre={sobre === col.etapa.id}
                onPassar={(e) => passar(col.etapa, e)} onSair={(e) => sair(col.etapa, e)} onSoltar={(e) => soltar(col.etapa, e)}
                cartao={(c) => (
                  <CartaoNoQuadro
                    key={c.id} c={c} painel={painel} etapas={etapas} podeMover={podeMover}
                    ocupado={ocupado === c.id} esmaecido={arrastando?.id === c.id}
                    onComecar={comecar} onTerminar={terminar} onMover={(etapaId) => void moverPeloMenu(c, etapaId)}
                  />
                )}
              />
            ))}
          </div>
        </div>
      )}
      {janelas}
    </>
  );
}

/**
 * Quanto sobra da janela abaixo do quadro: no computador, as colunas ficam desta altura e rolam por
 * dentro — assim o quadro inteiro cabe na tela e a rolagem de lado fica à vista, sem descer a página.
 */
function useAlturaQueSobra(ref: RefObject<HTMLElement>, mudancas: unknown[]): number | null {
  const [altura, setAltura] = useState<number | null>(null);
  useLayoutEffect(() => {
    const medir = () => {
      const el = ref.current;
      if (!el) return;
      const topo = el.getBoundingClientRect().top + window.scrollY;
      // o cabeçalho da coluna, as margens, o "e mais N fechados" e a barra de rolagem de lado
      setAltura(Math.max(280, Math.round(window.innerHeight - topo - 96)));
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, mudancas); // eslint-disable-line react-hooks/exhaustive-deps
  return altura;
}

/** O ícone do que a etapa significa: a entrada, o resolvido, o fechado (o andamento não precisa). */
function IconeDaEtapa({ tipo }: { tipo: EtapaPainel['tipo'] }) {
  if (tipo === 'entrada') return <Inbox size={14} className="text-muted shrink-0" aria-hidden />;
  if (tipo === 'resolvido') return <CircleCheck size={14} className="text-ok shrink-0" aria-hidden />;
  if (tipo === 'fechado') return <Archive size={14} className="text-muted shrink-0" aria-hidden />;
  return null;
}

function Coluna({ col, painel, filtros, arrastando, sobre, onPassar, onSair, onSoltar, cartao }: {
  col: ColunaQuadro; painel: Painel; filtros: Filtros; arrastando: boolean; sobre: boolean;
  onPassar: (e: DragEvent<HTMLElement>) => void; onSair: (e: DragEvent<HTMLElement>) => void; onSoltar: (e: DragEvent<HTMLElement>) => void;
  cartao: (c: CartaoChamado) => ReactNode;
}) {
  const { etapa, chamados, total, escondidos } = col;
  const nivel = etapa.nivel ? `N${etapa.nivel}` : null;
  // a etapa que já se chama "N2" não precisa do chip "N2" do lado: o nome vira o próprio chip
  const soNivel = !!nivel && etapa.nome.trim().toUpperCase() === nivel;
  const chipNivel = 'chip bg-surface border border-line-strong text-ink font-mono';
  const idTitulo = `etapa-${etapa.id}`;
  return (
    <section
      aria-labelledby={idTitulo} data-etapa={etapa.id}
      onDragOver={onPassar} onDragLeave={onSair} onDrop={onSoltar}
      className={`snap-start shrink-0 w-[85vw] sm:w-auto sm:flex-[1_0_236px] sm:max-w-[290px] rounded-lg border p-1.5 flex flex-col gap-1.5 transition-colors ${
        sobre ? 'border-accent bg-accent-soft' : arrastando ? 'border-dashed border-line-strong bg-surface-2' : 'border-line bg-surface-2'}`}
    >
      <header className="flex items-center gap-1.5 px-1 pt-0.5 min-w-0" title={DICA_TIPO_ETAPA[etapa.tipo]}>
        <IconeDaEtapa tipo={etapa.tipo} />
        {soNivel ? <h2 id={idTitulo} className={chipNivel} title={`Nível ${etapa.nivel}`}>{nivel}</h2> : (
          <>
            <h2 id={idTitulo} className="font-display font-semibold text-[13.5px] truncate">{etapa.nome}</h2>
            {nivel && <span className={chipNivel} title={`Nível ${etapa.nivel}`}>{nivel}</span>}
          </>
        )}
        <span className="ml-auto tnum text-[12px] font-semibold text-muted" title={`${total} ${total === 1 ? 'chamado' : 'chamados'}`}>{total}</span>
      </header>
      <ul className="flex flex-col gap-1.5 sm:max-h-[var(--altura-colunas,70vh)] sm:overflow-y-auto sm:-mr-1 sm:pr-1" aria-label={`Chamados em ${etapa.nome}`}>
        {chamados.map((c) => cartao(c))}
        {!chamados.length && <li className="rounded-lg border border-dashed border-line-strong text-muted text-[12.5px] text-center py-5">Nenhum chamado</li>}
      </ul>
      {escondidos > 0 && (
        <Link to={enderecoDaLista(painel.id, filtros, etapa.id)} className="link text-[12.5px] px-1 pb-0.5">
          e mais {escondidos} {escondidos === 1 ? 'fechado' : 'fechados'} — ver na lista
        </Link>
      )}
    </section>
  );
}

function CartaoNoQuadro({ c, painel, etapas, podeMover, ocupado, esmaecido, onComecar, onTerminar, onMover }: {
  c: CartaoChamado; painel: Painel; etapas: EtapaPainel[]; podeMover: boolean; ocupado: boolean; esmaecido: boolean;
  onComecar: (c: CartaoChamado, e: DragEvent<HTMLDivElement>) => void; onTerminar: () => void; onMover: (etapaId: string) => void;
}) {
  const abrirChamado = useAbrirChamado();
  const arrastavel = podeMover && !ocupado;
  return (
    <li data-cartao={c.id} data-codigo={c.codigo}>
      <CartaoComRodape
        c={c} cor={painel.cor} arrastavel={arrastavel} draggable={arrastavel}
        onDragStart={(e) => onComecar(c, e)} onDragEnd={onTerminar}
        // clicar no cartão (fora dos links e do pé) abre a ficha, como no título: na janela grande, com o quadro embaixo
        onClick={(e) => { if (cliqueAbreAFicha(e)) abrirChamado(c.codigo); }}
        aria-busy={ocupado || undefined}
        className={`cursor-pointer transition-opacity ${ocupado ? 'opacity-50 pointer-events-none' : esmaecido ? 'opacity-40' : ''}`}
        rodape={(
          <>
            {ocupado ? <span className="inline-flex items-center gap-1.5 text-[12px] text-muted"><Spinner className="!w-3.5 !h-3.5" /> Movendo…</span>
              : podeMover ? <MenuMover c={c} etapas={etapas} onMover={onMover} /> : null}
            <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-muted whitespace-nowrap" title={`Última atividade: ${dataHoraCurta(c.ultimaAtividadeEm)}`}>
              <Clock size={11} aria-hidden /> {haQuanto(c.ultimaAtividadeEm)}
            </span>
          </>
        )}
      />
    </li>
  );
}

/** O "Mover" do pé do cartão: a lista das etapas (para o celular, o teclado e quem prefere clicar). */
function MenuMover({ c, etapas, onMover }: { c: CartaoChamado; etapas: EtapaPainel[]; onMover: (etapaId: string) => void }) {
  // o Popover não fecha por fora: depois de escolher, a chave nova o remonta fechado
  const [vez, setVez] = useState(0);
  const atual = etapas.find((e) => e.id === c.etapaId);
  return (
    <Popover
      key={vez} largura="w-[250px]" alinhar="esquerda" titulo={`Mover ${c.codigo} para outra etapa`}
      classe="btn-ghost btn-sm px-2 py-1 -ml-1.5 text-[12.5px] text-ink-2"
      botao={() => <><ArrowRightLeft size={13} aria-hidden /> Mover</>}
    >
      <p className="text-[12.5px] text-muted mb-1">Mover <span className="font-mono text-ink-2">{c.codigo}</span> para:</p>
      <ul className="flex flex-col">
        {etapas.map((e) => {
          const aqui = e.id === c.etapaId;
          const sentido = movimentoDeNivel(atual, e);
          return (
            <li key={e.id}>
              <button
                type="button" disabled={aqui} onClick={() => { setVez((v) => v + 1); onMover(e.id); }}
                className="w-full text-left rounded-md px-2 py-1.5 text-[13.5px] flex items-center gap-2 hover:bg-surface-2 disabled:hover:bg-transparent disabled:cursor-default"
              >
                <span className={`flex-1 min-w-0 truncate ${aqui ? 'text-muted' : 'text-ink'}`}>{e.nome}</span>
                {aqui ? <span className="text-[11.5px] text-muted">está aqui</span>
                  : sentido === 'sobe' ? <span className="text-[11.5px] text-signal" title="Subir de nível pede o motivo">escalonar</span>
                    : sentido === 'desce' ? <span className="text-[11.5px] text-muted" title="Descer de nível pede o motivo">voltar de nível</span>
                      : e.tipo === 'fechado' ? <span className="text-[11.5px] text-ok">fecha</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}
