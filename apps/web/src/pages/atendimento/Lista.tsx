/**
 * Painéis › Lista (Patch 2.0, decisão 0047): os chamados numa tabela. Mora dentro do painel
 * (Quadro | Lista, no alto da visualização do painel — o pedido do Luan na prévia); sem painel no
 * endereço (os números do Meu dia), é a lista de todos os painéis que a pessoa vê.
 *
 * Os filtros ficam no endereço (o Voltar da ficha devolve a lista como estava) e quem filtra é o
 * servidor — a busca acha pelo código, título, cliente, contato, telefone, relato e descrição, sem
 * acento. Em cima, os atalhos do dia a dia (Meus, Vencidos…) com quantos cada um daria. Sem ordem
 * escolhida, o mais urgente vem primeiro; clicar no título da coluna ordena a lista inteira (no
 * servidor, não só a página). Páginas de 50, com "Ver tudo"; Exportar leva os mesmos filtros.
 *
 * No painel de Vendas (2.0.1), a lista é das negociações: o valor no lugar da prioridade e do prazo, a
 * ordem pelo valor (a maior primeiro), e "Ganhas e perdidas" no lugar de Resolvidos e Fechados.
 */
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, Download, Filter, Hourglass, Layers, RotateCcw, TriangleAlert, User, UserX, type LucideIcon } from 'lucide-react';
import {
  NOME_ESPERA, NOME_PRIORIDADE, PRIORIDADES, csvDosChamados, diaLocal, etiquetasDoPainel, etiquetasUnicas, reaisInteiros,
  type CartaoChamado, type OpcoesAtendimento, type Painel, type TipoEspera,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { Carregando, Chip, EscolherComBusca, Paginacao, Spinner, TODOS, Vazio, mensagemErro } from '../../components/ui/index.js';
import { ThN, TdN, contarDe } from '../../lib/contagem.js';
import { Th, type Dir, type Ordenacao } from '../../lib/ordenacao.js';
import { useLembrarFiltros } from '../../lib/voltar.js';
import {
  Avatar, CabecalhoAtendimento, ChipEspera, ChipPrioridade, ChipResultado, CodigoChamado, LinkDoChamado, SeloPrazo, dataHoraCurta, haQuanto, painelDe, telefoneLegivel,
  useAbrirChamado, useLerAFichaAntes, useOpcoes,
} from './comum.js';
import { cliqueAbreAFicha } from './quadro/cartao.js';
import { CabecalhoDoPainel, FILTROS_DO_PAINEL, enderecoDoQuadro, type FiltrosDoPainel } from './painel.js';
import {
  CAIXA_FILTRO, CampoBusca, FiltrosEscritos, PontoDoPainel, SelectFiltro, nomeDoAssunto, nomeDoResponsavel, opcoesDeAssunto, opcoesDeResponsavel,
  useClientesParaFiltro, useFiltrosNoEndereco, type FiltroEscrito,
} from './quadro/filtros.js';

const POR_PAGINA = 50;
const ROTA = '/atendimento/lista';

const SITUACOES = [
  { id: 'abertos', nome: 'Em aberto' }, { id: 'resolvidos', nome: 'Resolvidos' }, { id: 'fechados', nome: 'Fechados' }, { id: 'todos', nome: 'Todos' },
] as const;
type Situacao = (typeof SITUACOES)[number]['id'];

/** Os filtros que vão para o servidor (a situação, a ordem e a página andam à parte). */
const FILTROS = ['painel', 'etapa', 'responsavel', 'prioridade', 'prazo', 'espera', 'tipoChamado', 'assunto', 'cliente', 'etiqueta', 'de', 'ate', 'q'] as const;
type Filtro = (typeof FILTROS)[number];

const PRAZOS = [{ id: 'vencidos', nome: 'Vencidos' }, { id: 'perto', nome: 'Perto de vencer' }, { id: 'parados', nome: 'Parados (em espera)' }];
const ESPERAS: Array<{ id: TipoEspera; nome: string }> = [{ id: 'cliente', nome: NOME_ESPERA.cliente }, { id: 'operadora', nome: NOME_ESPERA.operadora }];
const REGISTROS = [{ id: 'chamado', nome: 'Só chamados' }, { id: 'problema', nome: 'Só problemas' }];

/** Os atalhos de cima: cada um vira filtro (e desfaz no segundo clique), com quantos daria. `vendas`: vale na lista das negociações. */
const ATALHOS: Array<{ id: string; nome: string; filtro: Partial<Record<Filtro, string>>; icone: LucideIcon; tom?: 'bad' | 'signal'; dica: string; vendas?: boolean }> = [
  { id: 'meus', nome: 'Meus', filtro: { responsavel: 'eu' }, icone: User, dica: 'Os que estão com você', vendas: true },
  { id: 'vencidos', nome: 'Vencidos', filtro: { prazo: 'vencidos' }, icone: TriangleAlert, tom: 'bad', dica: 'A resposta ou a solução passou do prazo' },
  { id: 'perto', nome: 'Perto de vencer', filtro: { prazo: 'perto' }, icone: Clock, tom: 'signal', dica: 'O prazo passou do percentual do aviso' },
  { id: 'sem-dono', nome: 'Sem dono', filtro: { responsavel: 'ninguem' }, icone: UserX, dica: 'Na fila, sem responsável', vendas: true },
  { id: 'esperando', nome: 'Esperando o cliente', filtro: { espera: 'cliente' }, icone: Hourglass, dica: 'O prazo está parado até o cliente responder', vendas: true },
];

/** Datas e "atualizado" começam do mais novo no primeiro clique, e o valor do maior; o resto, do menor (como o servidor). */
const DO_MAIS_NOVO = new Set(['criado', 'atualizado', 'valor']);

/** A ordem no endereço (sort/dir, os nomes do servidor). Sem ordem = o mais urgente primeiro. */
function useOrdem(sp: URLSearchParams, mudar: (o: Record<string, string | null>) => void): Ordenacao & { voltar: () => void } {
  const ord = sp.get('sort') ?? '';
  const pedido = sp.get('dir');
  const dir: Dir = pedido === 'asc' || pedido === 'desc' ? pedido : DO_MAIS_NOVO.has(ord) ? 'desc' : 'asc';
  return {
    ord, dir,
    ordenarPor: (col) => mudar({ sort: col, dir: ord === col ? (dir === 'asc' ? 'desc' : 'asc') : DO_MAIS_NOVO.has(col) ? 'desc' : 'asc' }),
    voltar: () => mudar({ sort: null, dir: null }),
  };
}

/** "10/10/2026" a partir de "2026-10-10". */
const diaLegivel = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);

export function ListaDeChamados() {
  useLembrarFiltros(ROTA);
  const opcoes = useOpcoes();
  const { sp, valor, mudar } = useFiltrosNoEndereco();
  const situacao: Situacao = SITUACOES.find((s) => s.id === valor('situacao'))?.id ?? 'abertos';
  const filtros = useMemo(() => {
    const f: Record<string, string> = { situacao };
    for (const k of FILTROS) { const v = sp.get(k); if (v) f[k] = v; }
    return f;
  }, [sp, situacao]);
  const ordem = useOrdem(sp, mudar);
  // a lista das negociações (um painel de Vendas) vem, sem ordem escolhida, pelo valor (a maior primeiro)
  const vendas = painelDe(opcoes.data, valor('painel'))?.tipo === 'vendas';
  const pedidoDeOrdem = useMemo((): Record<string, string> => (ordem.ord ? { sort: ordem.ord, dir: ordem.dir } : vendas ? { sort: 'valor', dir: 'desc' } : {}), [ordem.ord, ordem.dir, vendas]);
  const page = Math.max(1, Number(valor('p')) || 1);
  const tudo = valor('tudo') === '1';

  const lista = useQuery({
    queryKey: ['atendimento', 'lista', filtros, pedidoDeOrdem, tudo ? 'tudo' : page],
    queryFn: () => api.atendimento.lista({ ...filtros, ...pedidoDeOrdem, page: tudo ? 1 : page, pageSize: tudo ? TODOS : POR_PAGINA }),
    placeholderData: keepPreviousData,
    // o prazo anda com o relógio (e outra pessoa pode ter mexido)
    refetchInterval: 60_000,
  });
  // quantos cada atalho daria, com os outros filtros de agora (5 consultas pequenas: só o total)
  const contagens = useQueries({
    queries: ATALHOS.map((a) => ({
      queryKey: ['atendimento', 'lista', 'atalho', a.id, filtros],
      queryFn: () => api.atendimento.lista({ ...filtros, ...a.filtro, page: 1, pageSize: 1 }),
      placeholderData: keepPreviousData,
      staleTime: 30_000,
      refetchInterval: 60_000,
    })),
  });

  // a lista encolheu (outra pessoa fechou chamados) e a página de agora ficou vazia: vai para a última que existe
  const dados = lista.data;
  useEffect(() => {
    if (dados && !tudo && page > 1 && !dados.items.length && dados.total > 0) mudar({ p: String(Math.ceil(dados.total / POR_PAGINA)) }, true);
  }, [dados, page, tudo, mudar]);

  // dentro do painel (?painel=), o painel é a vista, não um filtro: "Limpar filtros" não sai dele
  const painel = painelDe(opcoes.data, valor('painel'));
  const filtrosDeVerdade = FILTROS.filter((k) => !(painel && k === 'painel'));
  const algumFiltro = filtrosDeVerdade.some((k) => !!valor(k));
  const limpar = () => mudar(Object.fromEntries(filtrosDeVerdade.map((k) => [k, null])));

  return (
    <div>
      <CabecalhoAtendimento painelId={painel?.id} acoes={opcoes.data && <Exportar filtros={filtros} ordem={pedidoDeOrdem} opcoes={opcoes.data} />} />
      {opcoes.isLoading ? <Carregando /> : opcoes.isError ? (
        <div className="card p-4 text-sm" role="alert"><p className="text-bad">{mensagemErro(opcoes.error)}</p><button className="btn-secondary btn-sm mt-2" onClick={() => void opcoes.refetch()}>Tentar de novo</button></div>
      ) : (
        <>
          <TopoDaLista opcoes={opcoes.data!} situacao={situacao} painel={painel} totais={contagens.map((c) => c.data?.total)} />
          <FiltrosDaLista opcoes={opcoes.data!} onLimpar={limpar} emPainel={!!painel} />

          {lista.isLoading ? <Carregando /> : lista.isError ? (
            <div className="card p-4 text-sm" role="alert"><p className="text-bad">{mensagemErro(lista.error)}</p><button className="btn-secondary btn-sm mt-2" onClick={() => void lista.refetch()}>Tentar de novo</button></div>
          ) : !lista.data?.total ? (
            algumFiltro ? (
              <Vazio titulo={vendas ? 'Nenhuma negociação com esses filtros' : 'Nenhum chamado com esses filtros'} texto="Tire um filtro, ou procure com outras palavras (o número do telefone, o nome do contato, o código)."
                acao={<button type="button" className="btn-secondary" onClick={limpar}>Limpar filtros</button>} />
            ) : vendas ? (
              <Vazio
                titulo={{ abertos: 'Nenhuma negociação em aberto', resolvidos: 'Nenhuma negociação aqui', fechados: 'Nenhuma negociação ganha ou perdida ainda', todos: 'Nenhuma negociação ainda' }[situacao]}
                texto={situacao === 'abertos' || situacao === 'todos' ? 'As negociações criadas pela equipe aparecem aqui (Nova negociação, no alto).' : undefined}
              />
            ) : (
              <Vazio
                titulo={{ abertos: 'Nenhum chamado em aberto', resolvidos: 'Nenhum chamado resolvido esperando o cliente', fechados: 'Nenhum chamado fechado', todos: 'Nenhum chamado ainda' }[situacao]}
                texto={situacao === 'abertos' ? 'Tudo em dia por aqui.' : situacao === 'todos' ? 'Os chamados abertos pela equipe, pelo robô e pelos agendados aparecem aqui.' : undefined}
              />
            )
          ) : (
            <Tabela
              itens={lista.data.items} total={lista.data.total} opcoes={opcoes.data!} ordem={ordem} mostrarPainel={!valor('painel')} vendas={vendas}
              page={page} tudo={tudo} carregando={lista.isFetching && lista.isPlaceholderData}
              setPage={(p) => mudar({ p: String(p) }, true)} setTudo={(v) => mudar({ tudo: v ? '1' : null })}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * O alto da lista, em duas linhas curtas (o pedido do Luan: o alto tomava o espaço): o painel — com
 * Quadro | Lista, Trocar e Configurar, porque a lista mora dentro do painel — ou "Todos os painéis"
 * (quando se chega pelo Meu dia), a busca e o botão Filtros; embaixo, os atalhos do dia a dia, com
 * quantos cada um daria, e a situação. As caixas dos filtros só aparecem quando pedidas.
 */
function TopoDaLista({ opcoes, situacao, painel, totais }: { opcoes: OpcoesAtendimento; situacao: Situacao; painel: Painel | undefined; totais: Array<number | undefined> }) {
  const { valor, mudar } = useFiltrosNoEndereco();
  const vendas = painel?.tipo === 'vendas';
  const [abertos, setAbertos] = useState(false);
  const clientes = useClientesParaFiltro();
  const pessoas = useMemo(() => opcoes.pessoas.filter((p) => p.ativo), [opcoes.pessoas]);
  const assuntos = useMemo(() => opcoesDeAssunto(opcoes, painel?.id), [opcoes, painel?.id]);
  const etiquetasDoFiltro = useMemo(() => etiquetasUnicas((painel ? etiquetasDoPainel(opcoes.etiquetas, painel.id) : opcoes.etiquetas).map((e) => e.nome))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })), [opcoes.etiquetas, painel?.id]);
  const ligados = FILTROS.filter((k) => k !== 'q' && !(painel && k === 'painel') && valor(k)).length;
  const doPainel = Object.fromEntries(FILTROS_DO_PAINEL.map((k) => [k, valor(k)]).filter(([, v]) => v)) as FiltrosDoPainel;
  const trocarPainel = (id: string) => {
    // a etapa e o assunto são de um painel só: trocando de painel, saem (o assunto fica se for do novo)
    const assunto = valor('assunto');
    const fica = !id || opcoes.assuntos.some((a) => a.id === assunto && a.painelId === id);
    mudar({ painel: id, etapa: null, assunto: fica ? assunto : null });
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2.5">
        {painel ? (
          <CabecalhoDoPainel paineis={opcoes.paineis} atual={painel} vista="lista" outraVista={enderecoDoQuadro(painel.id, doPainel)} className="min-w-0" />
        ) : (
          <div className="flex items-center gap-x-2 min-w-0" id="lista-todos">
            <Link to="/atendimento" className="btn-ghost btn-sm -ml-2 text-ink-2" title="Voltar à tela dos painéis" aria-label="Painéis">
              <ArrowLeft size={15} aria-hidden /> <span className="hidden sm:inline">Painéis</span>
            </Link>
            <span className="text-line-strong" aria-hidden>/</span>
            <h2 className="font-display font-semibold text-[17px]">Todos os painéis</h2>
          </div>
        )}
        <div className="flex items-center gap-2 w-full md:w-auto md:flex-1 md:min-w-[220px] md:max-w-[420px] md:ml-auto">
          <CampoBusca className="flex-1" id="lista-busca" valor={valor('q')} onChange={(v) => mudar({ q: v })}
            placeholder={vendas ? 'Código, título, empresa, telefone…' : 'Código, título, cliente, telefone…'}
            titulo={vendas ? 'Acha pelo código, o que está sendo negociado, a empresa, o contato, o telefone, o e-mail e o “Sobre a negociação” (sem acento)' : 'Acha pelo código, título, cliente, contato, telefone, e-mail, relato e descrição (sem acento)'} />
          <button type="button" className={`btn-secondary ${abertos ? 'border-accent text-accent-ink bg-accent-soft' : ''}`} aria-expanded={abertos} aria-controls="lista-filtros"
            id="lista-botao-filtros" onClick={() => setAbertos((v) => !v)} title={abertos ? 'Esconder as caixas dos filtros' : vendas ? 'Filtrar por etapa, responsável, cliente, etiqueta e data' : 'Filtrar por etapa, responsável, prioridade, prazo, cliente, assunto, etiqueta e data'}>
            <Filter size={15} /> Filtros{ligados > 0 && <span className="text-accent tnum">({ligados})</span>}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* os atalhos */}
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Atalhos" id="lista-atalhos">
          {ATALHOS.map((a, i) => {
            if (vendas && !a.vendas) return null;
            const ativo = Object.entries(a.filtro).every(([k, v]) => valor(k) === v);
            const n = totais[i];
            const Icone = a.icone;
            const forte = !!n && a.tom === 'bad' ? 'bg-bad-soft text-bad' : !!n && a.tom === 'signal' ? 'bg-signal-soft text-signal' : 'bg-surface-2 text-muted';
            return (
              <button
                key={a.id} type="button" aria-pressed={ativo} title={ativo ? 'Clique para tirar este filtro' : a.dica}
                onClick={() => mudar(Object.fromEntries(Object.entries(a.filtro).map(([k, v]) => [k, ativo ? null : v])))}
                className={`inline-flex items-center gap-1 rounded-full border pl-2 pr-1 py-0.5 text-[12.5px] font-semibold transition-colors ${ativo ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'}`}
              >
                <Icone size={14} aria-hidden className={ativo ? '' : a.tom === 'bad' ? 'text-bad' : a.tom === 'signal' ? 'text-signal' : 'text-muted'} />
                {a.nome}
                <span className={`tnum rounded-full min-w-[1.6rem] px-1.5 text-center text-[12px] leading-5 ${ativo ? 'bg-surface text-accent-ink' : forte}`}>{n ?? '…'}</span>
              </button>
            );
          })}
        </div>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 lg:ml-auto" role="group" aria-label="Situação" id="lista-situacao">
          {/* na venda não há Resolvido: a negociação acaba em Ganho ou Perdido */}
          {SITUACOES.filter((s) => !vendas || s.id !== 'resolvidos').map((s) => (
            <button
              key={s.id} type="button" aria-pressed={situacao === s.id} onClick={() => mudar({ situacao: s.id === 'abertos' ? null : s.id })}
              className={`px-2 py-0.5 rounded-md text-[12.5px] font-semibold whitespace-nowrap ${situacao === s.id ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2'}`}
            >
              {vendas ? { abertos: 'Em aberto', resolvidos: s.nome, fechados: 'Ganhas e perdidas', todos: 'Todas' }[s.id] : s.nome}
            </button>
          ))}
        </div>
      </div>

      <div id="lista-filtros" className={`${abertos ? 'flex' : 'hidden'} flex-wrap items-center gap-2 mb-3`}>
        {/* dentro do painel, o painel é a vista (Trocar muda); em "Todos os painéis", escolher um entra nele */}
        {!painel && (
          <SelectFiltro rotulo="Painel" valor={valor('painel')} vazio="Todos os painéis" onChange={trocarPainel}
            opcoes={opcoes.paineis.map((p) => ({ id: p.id, nome: p.ativo ? p.nome : `${p.nome} (desativado)` }))} />
        )}
        {painel && <SelectFiltro rotulo="Etapa" valor={valor('etapa')} vazio="Todas as etapas" onChange={(v) => mudar({ etapa: v })} opcoes={painel.etapas.map((e) => ({ id: e.id, nome: e.nome }))} />}
        <EscolherComBusca className={CAIXA_FILTRO} rotulo="Responsável" valor={valor('responsavel')} vazio="Todos os responsáveis" opcoes={opcoesDeResponsavel(pessoas)} procurar="Procurar pessoa…" onChange={(v) => mudar({ responsavel: v })} />
        {!vendas && <SelectFiltro rotulo="Prioridade" valor={valor('prioridade')} vazio="Todas as prioridades" onChange={(v) => mudar({ prioridade: v })} opcoes={PRIORIDADES.map((p) => ({ id: p, nome: NOME_PRIORIDADE[p] }))} />}
        {!vendas && <SelectFiltro rotulo="Prazo" valor={valor('prazo')} vazio="Qualquer prazo" onChange={(v) => mudar({ prazo: v })} opcoes={PRAZOS} />}
        <SelectFiltro rotulo="Espera" valor={valor('espera')} vazio="Esperando ou não" onChange={(v) => mudar({ espera: v })} opcoes={vendas ? ESPERAS.filter((e) => e.id === 'cliente') : ESPERAS} />
        {!vendas && <SelectFiltro rotulo="Registro" valor={valor('tipoChamado')} vazio="Chamados e problemas" onChange={(v) => mudar({ tipoChamado: v })} opcoes={REGISTROS} />}
        {(assuntos.length > 0 || valor('assunto')) && (
          <EscolherComBusca className={CAIXA_FILTRO} largura="w-[400px]" rotulo="Assunto" valor={valor('assunto')} vazio="Todos os assuntos" opcoes={assuntos} procurar="Procurar assunto…" onChange={(v) => mudar({ assunto: v })} />
        )}
        <EscolherComBusca className={CAIXA_FILTRO} rotulo="Cliente" valor={valor('cliente')} vazio="Todos os clientes" opcoes={clientes} procurar="Procurar cliente…" onChange={(v) => mudar({ cliente: v })} />
        {/* as etiquetas do painel aberto; em Todos, as de todos os painéis, sem repetir o nome (2.0.3: cada painel tem as suas) */}
        {(etiquetasDoFiltro.length > 0 || valor('etiqueta')) && (
          <EscolherComBusca className={CAIXA_FILTRO} rotulo="Etiqueta" valor={valor('etiqueta')} vazio="Todas as etiquetas" opcoes={etiquetasDoFiltro.map((nome) => ({ id: nome, nome }))} procurar="Procurar etiqueta…" onChange={(v) => mudar({ etiqueta: v })} />
        )}
        <span className="inline-flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
          {vendas ? 'Criada de' : 'Aberto de'}
          <input type="date" className={CAIXA_FILTRO} aria-label={vendas ? 'Criada a partir do dia' : 'Aberto a partir do dia'} value={valor('de')} max={valor('ate') || undefined} onChange={(e) => mudar({ de: e.target.value })} />
          até
          <input type="date" className={CAIXA_FILTRO} aria-label={vendas ? 'Criada até o dia' : 'Aberto até o dia'} value={valor('ate')} min={valor('de') || undefined} onChange={(e) => mudar({ ate: e.target.value })} />
        </span>
      </div>
    </>
  );
}

/** O que está filtrado, escrito, cada um com o seu X. */
function FiltrosDaLista({ opcoes, onLimpar, emPainel }: { opcoes: OpcoesAtendimento; onLimpar: () => void; emPainel: boolean }) {
  const { valor, mudar } = useFiltrosNoEndereco();
  const clientes = useClientesParaFiltro();
  const tirar = (...ks: string[]) => () => mudar(Object.fromEntries(ks.map((k) => [k, null])));
  const itens: FiltroEscrito[] = [];
  const v = (k: Filtro) => valor(k);
  if (v('q')) itens.push({ chave: 'q', nome: 'Procurando', valor: `“${v('q')}”`, tirar: tirar('q') });
  if (v('painel') && !emPainel) itens.push({ chave: 'painel', nome: 'Painel', valor: painelDe(opcoes, v('painel'))?.nome ?? 'um painel que você não vê', tirar: tirar('painel', 'etapa') });
  if (v('etapa')) {
    const etapa = opcoes.paineis.flatMap((p) => p.etapas).find((e) => e.id === v('etapa'));
    itens.push({ chave: 'etapa', nome: 'Etapa', valor: etapa?.nome ?? 'uma etapa que saiu', tirar: tirar('etapa') });
  }
  if (v('responsavel')) itens.push({ chave: 'responsavel', nome: 'Responsável', valor: nomeDoResponsavel(v('responsavel'), opcoes.pessoas), tirar: tirar('responsavel') });
  if (v('prioridade')) itens.push({ chave: 'prioridade', nome: 'Prioridade', valor: NOME_PRIORIDADE[v('prioridade') as keyof typeof NOME_PRIORIDADE] ?? v('prioridade'), tirar: tirar('prioridade') });
  if (v('prazo')) itens.push({ chave: 'prazo', nome: 'Prazo', valor: PRAZOS.find((p) => p.id === v('prazo'))?.nome ?? v('prazo'), tirar: tirar('prazo') });
  if (v('espera')) itens.push({ chave: 'espera', nome: 'Espera', valor: NOME_ESPERA[v('espera') as TipoEspera] ?? v('espera'), tirar: tirar('espera') });
  if (v('tipoChamado')) itens.push({ chave: 'tipoChamado', nome: 'Registro', valor: REGISTROS.find((r) => r.id === v('tipoChamado'))?.nome ?? v('tipoChamado'), tirar: tirar('tipoChamado') });
  if (v('assunto')) itens.push({ chave: 'assunto', nome: 'Assunto', valor: nomeDoAssunto(v('assunto'), opcoes), tirar: tirar('assunto') });
  if (v('cliente')) itens.push({ chave: 'cliente', nome: 'Cliente', valor: clientes.find((c) => c.id === v('cliente'))?.nome ?? '…', tirar: tirar('cliente') });
  if (v('etiqueta')) itens.push({ chave: 'etiqueta', nome: 'Etiqueta', valor: v('etiqueta'), tirar: tirar('etiqueta') });
  if (v('de') || v('ate')) {
    const texto = v('de') && v('ate') ? `de ${diaLegivel(v('de'))} até ${diaLegivel(v('ate'))}` : v('de') ? `desde ${diaLegivel(v('de'))}` : `até ${diaLegivel(v('ate'))}`;
    itens.push({ chave: 'datas', nome: 'Aberto', valor: texto, tirar: tirar('de', 'ate') });
  }
  return <FiltrosEscritos itens={itens} onLimpar={onLimpar} />;
}

function Tabela({ itens, total, opcoes, ordem, mostrarPainel, vendas = false, page, tudo, carregando, setPage, setTudo }: {
  itens: CartaoChamado[]; total: number; opcoes: OpcoesAtendimento; ordem: Ordenacao & { voltar: () => void }; mostrarPainel: boolean;
  /** a lista das negociações (um painel de Vendas): o valor no lugar da prioridade e do prazo */
  vendas?: boolean;
  page: number; tudo: boolean; carregando: boolean; setPage: (p: number) => void; setTudo: (v: boolean) => void;
}) {
  const abrirChamado = useAbrirChamado();
  // o mouse parado em cima da linha já lê a ficha (2.1.2): no clique, ela abre pronta
  const lerAntes = useLerAFichaAntes();
  const numero = contarDe(tudo ? 1 : page, tudo ? TODOS : POR_PAGINA);
  const etapas = useMemo(() => new Map(opcoes.paineis.flatMap((p) => p.etapas.map((e) => [e.id, e] as const))), [opcoes.paineis]);
  const abrir = (e: MouseEvent<HTMLTableRowElement>, c: CartaoChamado) => {
    // os links e os botões da linha fazem o que é deles; o resto da linha abre a ficha (na janela grande, com a lista embaixo)
    if (cliqueAbreAFicha(e)) abrirChamado(c.codigo);
  };
  return (
    <section className="card p-0 min-w-0" aria-busy={carregando || undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <h2 className="font-display font-semibold text-[15px] tnum">{total.toLocaleString('pt-BR')} {vendas ? (total === 1 ? 'negociação' : 'negociações') : total === 1 ? 'chamado' : 'chamados'}</h2>
        {vendas ? (
          ordem.ord ? <button type="button" className="btn-ghost btn-sm text-muted" onClick={ordem.voltar} title="A de maior valor primeiro"><RotateCcw size={13} /> Voltar à ordem do valor</button>
            : <span className="text-[12.5px] text-muted">pelo valor (a maior primeiro)</span>
        ) : ordem.ord ? (
          <button type="button" className="btn-ghost btn-sm text-muted" onClick={ordem.voltar} title="Vencidos e perto de vencer primeiro, depois a prioridade"><RotateCcw size={13} /> Voltar à ordem de urgência</button>
        ) : <span className="text-[12.5px] text-muted">do mais urgente para o menos urgente</span>}
        {carregando && <Spinner className="ml-auto" />}
      </div>
      <div className="overflow-x-auto">
        {/* células um pouco mais justas que o padrão: são dez colunas, e as datas cabem numa tela de notebook */}
        <table className="table [&_th]:px-2.5 [&_td]:px-2.5 [&_th]:whitespace-nowrap" id="lista-tabela">
          <thead>
            <tr>
              <ThN />
              <Th o={ordem} col="codigo">Código</Th>
              <Th o={ordem} col="titulo">Título</Th>
              <Th o={ordem} col={vendas ? 'empresa' : 'cliente'}>{vendas ? 'Empresa' : 'Cliente'}</Th>
              <Th o={ordem} col="etapa">Etapa</Th>
              {vendas ? (
                <Th o={ordem} col="valor">Mensalidade</Th>
              ) : (
                <>
                  <Th o={ordem} col="prioridade">Prioridade</Th>
                  <Th o={ordem} col="prazo">Prazo</Th>
                </>
              )}
              <Th o={ordem} col="responsavel">Responsável</Th>
              <Th o={ordem} col="criado">{vendas ? 'Criada em' : 'Aberto em'}</Th>
              <Th o={ordem} col="atualizado">Atualizado</Th>
            </tr>
          </thead>
          <tbody>
            {itens.map((c, i) => {
              const painel = painelDe(opcoes, c.painelId);
              const etapa = etapas.get(c.etapaId);
              return (
                <tr key={c.id} className="cursor-pointer" onClick={(e) => abrir(e, c)} {...lerAntes(c.codigo)}>
                  <TdN n={numero(i)} />
                  <td className="whitespace-nowrap"><CodigoChamado codigo={c.codigo} cor={painel?.cor} /></td>
                  <td className="min-w-[210px] max-w-[400px]">
                    <LinkDoChamado codigo={c.codigo} className="font-semibold text-ink hover:text-accent">{c.titulo}</LinkDoChamado>
                    <Marcas c={c} />
                  </td>
                  <td className="min-w-[150px] max-w-[240px]">
                    {c.cliente ? <div className="font-semibold text-ink-2 leading-snug">{c.cliente.nome}</div>
                      : c.empresa ? <div className="font-semibold text-ink-2 leading-snug" title="Ainda não é cliente">{c.empresa}</div>
                        : <div className="text-signal text-[12.5px] font-medium">{vendas ? 'sem empresa' : 'sem cliente'}</div>}
                    {c.contato && (c.contato.nome || c.contato.telefone || c.contato.email) && (
                      <div className="text-[12px] text-muted leading-snug">{c.contato.nome ?? (c.contato.telefone ? telefoneLegivel(c.contato.telefone) : c.contato.email)}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {c.resultado ? <ChipResultado r={c.resultado} motivo={c.motivoPerda} em={c.fechadoEm} /> : <div>{etapa?.nome ?? '—'}</div>}
                    {c.resultado === 'perdido' && c.motivoPerda && <div className="text-[12px] text-muted mt-0.5">{c.motivoPerda}</div>}
                    {mostrarPainel && painel && <div className="text-[12px] text-muted inline-flex items-center gap-1.5"><PontoDoPainel cor={painel.cor} /> {painel.nome}</div>}
                  </td>
                  {vendas ? (
                    <td className="whitespace-nowrap tnum font-semibold text-right">{c.valor === null ? <span className="text-muted font-normal">—</span> : reaisInteiros(c.valor)}</td>
                  ) : (
                    <>
                      <td className="whitespace-nowrap">{c.prioridade ? <ChipPrioridade p={c.prioridade} /> : <span className="text-muted">—</span>}</td>
                      {/* sem prazo (painel que não conta, fechado), o selo some: fica o traço */}
                      <td className="whitespace-nowrap"><span className="empty:before:content-['—'] empty:before:text-muted"><SeloPrazo c={c} /></span></td>
                    </>
                  )}
                  <td className="whitespace-nowrap">
                    {c.responsavel
                      ? <span className="inline-flex items-center gap-1.5"><Avatar nome={c.responsavel.nome} tamanho={22} /> {c.responsavel.nome}</span>
                      : <span className="text-muted italic text-[13px]">sem dono</span>}
                  </td>
                  <td className="whitespace-nowrap tnum text-[13px]" title={dataHoraCurta(c.criadoEm)}>{dataHoraCurta(c.criadoEm)}</td>
                  <td className="whitespace-nowrap tnum text-[13px] text-ink-2" title={`Última atividade: ${dataHoraCurta(c.ultimaAtividadeEm)}`}>{haQuanto(c.ultimaAtividadeEm)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-3">
        <Paginacao page={page} pageSize={POR_PAGINA} total={total} onChange={setPage} tudo={tudo} onTudo={setTudo} />
      </div>
    </section>
  );
}

/** As marcas do título: problema, filho de…, incidente de…, reaberto, a espera. */
function Marcas({ c }: { c: CartaoChamado }) {
  const marcas = c.tipoChamado === 'problema' || c.pai || c.problema || c.reaberto > 0 || c.espera;
  if (!marcas) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {c.tipoChamado === 'problema' && (
        <>
          <Chip tone="rosa" title="Problema: junta os incidentes de várias empresas"><Layers size={11} /> Problema</Chip>
          {c.incidentes > 0 && <span className="text-[12px] text-muted">{c.incidentes} {c.incidentes === 1 ? 'incidente' : 'incidentes'}</span>}
        </>
      )}
      {c.pai && <span className="text-[12px] text-muted">filho de <LinkDoChamado codigo={c.pai.codigo} className="font-mono hover:text-accent">{c.pai.codigo}</LinkDoChamado></span>}
      {c.problema && <span className="text-[12px] text-muted">incidente de <LinkDoChamado codigo={c.problema.codigo} className="font-mono hover:text-accent">{c.problema.codigo}</LinkDoChamado></span>}
      {c.reaberto > 0 && <Chip tone="signal" title={`Reaberto ${c.reaberto} ${c.reaberto === 1 ? 'vez' : 'vezes'}`}><RotateCcw size={11} /> reaberto{c.reaberto > 1 ? ` ${c.reaberto}×` : ''}</Chip>}
      <ChipEspera e={c.espera} />
    </div>
  );
}

/**
 * Exportar (CSV) com os mesmos filtros e a mesma ordem. No servidor de verdade, é um link de
 * download (o servidor monta e registra na auditoria); na prévia não há servidor: a tela busca a
 * lista inteira e monta o mesmo CSV aqui (com o `csvDosChamados` do shared, o mesmo do servidor).
 */
function Exportar({ filtros, ordem, opcoes }: { filtros: Record<string, string>; ordem: Record<string, string>; opcoes: OpcoesAtendimento }) {
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  const url = api.atendimento.exportarUrl({ ...filtros, ...ordem });
  if (url) return <a className="btn-secondary" href={url} download title="Os chamados com os filtros de agora, numa planilha (abre no Excel)"><Download size={15} /> Exportar (CSV)</a>;
  const baixar = async () => {
    setIndo(true); setErro('');
    try {
      const r = await api.atendimento.lista({ ...filtros, ...ordem, page: 1, pageSize: TODOS });
      const etapas = new Map(opcoes.paineis.flatMap((p) => p.etapas.map((e) => [e.id, e.nome] as const)));
      const csv = csvDosChamados(r.items, {
        painel: (id) => painelDe(opcoes, id)?.nome ?? '', etapa: (id) => etapas.get(id) ?? '', vendas: (id) => painelDe(opcoes, id)?.tipo === 'vendas',
      }, opcoes.campos);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `chamados-${diaLocal(new Date())}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setIndo(false);
    }
  };
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" className="btn-secondary" onClick={baixar} disabled={indo} title="Os chamados com os filtros de agora, numa planilha (abre no Excel)">
        {indo ? <Spinner /> : <Download size={15} />} Exportar (CSV)
      </button>
      {erro && <span className="text-bad text-[12.5px] mt-1 max-w-[260px] text-right" role="alert">{erro}</span>}
    </span>
  );
}
