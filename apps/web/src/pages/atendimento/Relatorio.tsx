/**
 * Vendas › Relatório (Patch 2.0.1, decisão 0050): o relatório de um painel de Vendas. O pedido do Luan:
 * "veja tbm a parte de relatório pq é importante termos algo parecido tbm para o comercial" — e, na hora
 * de escolher (17/10), "nada muito complexo": só os **números do período** e o **funil**.
 *
 * Em cima, o período (os atalhos ou dois dias), que fica no endereço como os filtros do quadro. Os
 * números: as novas, as ganhas e as perdidas (em quantidade e em R$), a conversão e o ticket médio.
 * Embaixo, o funil: das que entraram no período, quantas chegaram a cada etapa, quantas se perderam em
 * cada uma e quantas foram ganhas.
 *
 * As contas moram no `@gestor/shared` (`vendas.ts`): o servidor e a prévia contam igual.
 */
import { useMemo, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarRange, Filter as Funnel, Info } from 'lucide-react';
import {
  diaComAno, periodosDoRelatorio, reaisCurto, reaisInteiros,
  type OpcoesAtendimento, type Painel, type RelatorioDeVendas,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { Carregando, Kpi, Vazio, mensagemErro } from '../../components/ui/index.js';
import { CabecalhoAtendimento, useOpcoes } from './comum.js';
import { CabecalhoDoPainel } from './painel.js';
import { useFiltrosNoEndereco } from './quadro/filtros.js';

const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

export function RelatorioDoPainel() {
  const opcoes = useOpcoes();
  const { valor } = useFiltrosNoEndereco();
  const pedido = valor('painel');
  const paineis = opcoes.data?.paineis ?? [];
  const painel = pedido ? paineis.find((p) => p.id === pedido) ?? paineis.find((p) => p.sigla === pedido.toUpperCase()) : undefined;
  if (!pedido) return <Navigate to="/atendimento" replace />;
  return (
    <div>
      <CabecalhoAtendimento painelId={painel?.id} />
      {opcoes.isLoading ? <Carregando /> : opcoes.isError ? <p className="text-bad text-sm" role="alert">{mensagemErro(opcoes.error)}</p> : !painel ? (
        <Vazio titulo="Painel não encontrado" texto="Ele pode ter saído, ou ser de acesso escolhido sem você na lista."
          acao={<Link to="/atendimento" className="btn-secondary"><ArrowLeft size={15} /> Ver os painéis</Link>} />
      ) : painel.tipo !== 'vendas' ? (
        <Vazio titulo="O relatório de vendas é dos painéis de Vendas" texto={`O ${painel.nome} é um painel de chamados: os números dele estão nos Relatórios do Suporte.`}
          acao={<Link to={`/atendimento/quadro?painel=${encodeURIComponent(painel.id)}`} className="btn-secondary"><ArrowLeft size={15} /> Voltar ao quadro</Link>} />
      ) : (
        <RelatorioDeVendasDoPainel key={painel.id} painel={painel} opcoes={opcoes.data!} />
      )}
    </div>
  );
}

function RelatorioDeVendasDoPainel({ painel, opcoes }: { painel: Painel; opcoes: OpcoesAtendimento }) {
  const { valor, mudar } = useFiltrosNoEndereco();
  const atalhos = useMemo(() => periodosDoRelatorio(new Date()), []);
  const de = valor('de') || atalhos[0]!.de;
  const ate = valor('ate') || atalhos[0]!.ate;
  const atalho = atalhos.find((a) => a.de === de && a.ate === ate)?.id ?? null;
  const rel = useQuery({
    queryKey: ['atendimento', 'vendas', painel.id, de, ate],
    queryFn: () => api.atendimento.relatorioDeVendas({ painel: painel.id, de, ate }),
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60_000,
  });
  const r = rel.data;
  const nomeDoPeriodo = atalho ? atalhos.find((a) => a.id === atalho)!.nome.toLocaleLowerCase('pt-BR') : `de ${diaComAno(de)} a ${diaComAno(ate)}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CabecalhoDoPainel paineis={opcoes.paineis} atual={painel} vista="relatorio" className="min-w-0" />
      </div>

      {/* o período (no endereço: dá para mandar o link do jeito que está) */}
      <div className="card p-3 flex flex-wrap items-center gap-x-4 gap-y-2" id="relatorio-filtros">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Período">
          <CalendarRange size={15} className="text-muted" aria-hidden />
          {atalhos.map((a) => (
            <button key={a.id} type="button" aria-pressed={atalho === a.id} onClick={() => mudar({ de: a.de, ate: a.ate })}
              className={`rounded-full border px-2.5 py-1 text-[12.5px] transition-colors ${atalho === a.id ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line-strong text-ink-2 hover:bg-surface-2'}`}>
              {a.nome}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <label className="text-muted" htmlFor="relatorio-de">de</label>
          <input id="relatorio-de" type="date" className="input py-1 w-[150px]" value={de} max={ate} onChange={(e) => e.target.value && mudar({ de: e.target.value })} />
          <label className="text-muted" htmlFor="relatorio-ate">até</label>
          <input id="relatorio-ate" type="date" className="input py-1 w-[150px]" value={ate} min={de} onChange={(e) => e.target.value && mudar({ ate: e.target.value })} />
        </div>
      </div>

      {rel.isError ? <p className="text-bad text-sm" role="alert">{mensagemErro(rel.error)}</p> : !r ? <Carregando /> : (
        <div className={`flex flex-col gap-3 transition-opacity ${rel.isFetching && rel.isPlaceholderData ? 'opacity-60' : ''}`} id="relatorio-vendas">
          <Numeros r={r} nomeDoPeriodo={nomeDoPeriodo} />
          <Secao id="relatorio-funil" titulo="O funil" icone={Funnel}
            pergunta={`Das ${plural(r.numeros.novos.qtd, 'negociação que entrou', 'negociações que entraram')} ${nomeDoPeriodo}: até onde chegaram, onde se perderam e quantas foram ganhas.`}
            rodape="Conta a etapa mais adiante por onde a negociação passou (a ganha chegou ao fim) e, na perdida, a etapa em que ela estava quando foi perdida.">
            <Funil r={r} />
          </Secao>
        </div>
      )}
    </div>
  );
}

/** Um bloco do relatório: o título, a pergunta que ele responde e uma nota no pé. */
function Secao({ id, titulo, pergunta, icone: Icone, rodape, children }: {
  id: string; titulo: string; pergunta: string; icone: typeof Info; rodape?: string; children: ReactNode;
}) {
  return (
    <section id={id} className="card p-4 sm:p-5 min-w-0 flex flex-col gap-3" aria-labelledby={`${id}-t`}>
      <header>
        <h2 id={`${id}-t`} className="font-display font-semibold text-[17px] leading-tight flex items-center gap-2"><Icone size={17} className="text-muted shrink-0" aria-hidden />{titulo}</h2>
        <p className="text-[13px] text-ink-2 mt-0.5">{pergunta}</p>
      </header>
      {children}
      {rodape && <p className="text-[12.5px] text-muted flex gap-1.5 leading-snug border-t border-line pt-3 mt-auto"><Info size={13} className="shrink-0 mt-0.5" aria-hidden /><span>{rodape}</span></p>}
    </section>
  );
}

/** Os números do período. */
function Numeros({ r, nomeDoPeriodo }: { r: RelatorioDeVendas; nomeDoPeriodo: string }) {
  const n = r.numeros;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" id="relatorio-numeros">
      <Kpi label="Novas" valor={n.novos.qtd.toLocaleString('pt-BR')} sub={`${reaisCurto(n.novos.valor)} em propostas ${nomeDoPeriodo}`} tone="accent" />
      <Kpi label="Ganhas" valor={reaisCurto(n.ganhos.valor)} sub={plural(n.ganhos.qtd, 'negociação ganha', 'negociações ganhas')} tone="ok" />
      <Kpi label="Perdidas" valor={reaisCurto(n.perdidos.valor)} sub={plural(n.perdidos.qtd, 'negociação perdida', 'negociações perdidas')} tone="bad" />
      <Kpi label="Taxa de conversão" valor={pct(n.conversao)} sub={n.conversao === null ? 'nenhuma acabou no período' : 'das que acabaram, as ganhas'}
        titulo="Das que acabaram no período (ganhas e perdidas), quantas foram ganhas" />
      <Kpi label="Ticket médio" valor={n.ticketMedio === null ? '—' : reaisInteiros(Math.round(n.ticketMedio / 100) * 100)} sub="o valor médio do que foi ganho" />
    </div>
  );
}

/** O funil: até onde chegaram as que entraram no período, onde se perderam e quantas foram ganhas. */
function Funil({ r }: { r: RelatorioDeVendas }) {
  if (!r.numeros.novos.qtd) return <p className="text-muted text-sm py-4">Nenhuma negociação entrou no período.</p>;
  const topo = Math.max(1, r.funil[0]?.chegaram ?? 0);
  const linhas = [
    ...r.funil.map((f) => ({ id: f.etapaId, nome: f.nome, n: f.chegaram, perdidas: f.perdidas, ganho: false })),
    { id: 'ganhas', nome: 'Ganhas', n: r.funilGanhas, perdidas: 0, ganho: true },
  ];
  return (
    <ol className="flex flex-col gap-1.5" aria-label="O funil">
      {linhas.map((l, i) => {
        const largura = Math.max(4, (l.n / topo) * 100);
        const anterior = i > 0 ? linhas[i - 1]!.n : null;
        const passou = anterior ? Math.round((l.n / anterior) * 100) : null;
        return (
          // no celular, o nome e as perdidas em cima e a barra embaixo, na largura toda; da tela média para cima, numa linha só
          <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,130px)_1fr_minmax(0,96px)] items-center gap-x-2 gap-y-1 text-[13px]" data-funil={l.nome}>
            <span className={`truncate ${l.ganho ? 'font-semibold text-ok' : 'text-ink-2'}`} title={l.nome}>{l.nome}</span>
            <span className="sm:order-last text-[12px] text-right whitespace-nowrap tnum truncate">
              {l.perdidas > 0 ? <span className="text-bad" title={`${plural(l.perdidas, 'foi perdida', 'foram perdidas')} em ${l.nome}`}>{plural(l.perdidas, 'perdida', 'perdidas')}</span> : null}
            </span>
            {/* a barra (o desenho do funil); o número e, da segunda em diante, quantas da etapa de cima chegaram aqui */}
            <div className="col-span-2 sm:col-span-1 h-7 relative flex justify-center" title={passou !== null ? `${l.n} de ${anterior} (${passou}%) chegaram a ${l.nome}` : `${l.n} entraram`}>
              <div className={`h-full rounded ${l.ganho ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${largura}%`, opacity: l.ganho ? 1 : Math.max(0.45, 1 - i * 0.12) }} />
              <span className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold tnum text-ink pointer-events-none">
                <span className="rounded bg-surface px-1.5 shadow-sm">{l.n}{passou !== null && <span className="font-normal text-muted"> · {passou}%</span>}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
