/**
 * O relatório do Comercial (Patch 2.0.1, decisão 0050): o relatório de um painel de Vendas. O pedido do
 * Luan: "veja tbm a parte de relatório pq é importante termos algo parecido tbm para o comercial"; na
 * hora de escolher (17/10), "nada muito complexo": os **números do período** e o **funil**. Na segunda
 * volta ("não ficou legal, dê uma melhorada"), no jeito dos relatórios do Suporte:
 *
 *  - em cima, o período (os atalhos ou dois dias), que fica no endereço como os filtros do quadro;
 *  - **O período em números**: o ganho, as novas, as perdidas, a conversão e o ticket médio, cada um
 *    com a seta do que mudou em relação ao período anterior (a meta do mês e as frases de destaque
 *    entraram e saíram, 17/10: "n quero isso de meta", "n quero esses destaques");
 *  - **Os ganhos mês a mês** (17/10: "eu quero um relatório que compare meus ganhos mes a mes"): uma
 *    coluna por mês, os 12 até o do fim do período, com quanto mudou em relação ao mês anterior;
 *  - a **ativação** à parte da mensalidade (19/10: "um kpi desse para ganho de ativações bem simples como
 *    os que tem hoje", "um gráfico desse mas sobre apenas ativação"): o número Ativação, ao lado do
 *    Ganho, e **As ativações mês a mês**, embaixo dos ganhos — o resto continua só com a mensalidade;
 *  - **A margem das ganhas** (2.0.2, o Simulador do Comercial: "a margem média das negociações ganhas no
 *    período, por vendedor e por produto"; o "por vendedor" saiu, 21/10: "não precisa por vendedor"): as
 *    ganhas que têm simulação ligada, com a margem e o sinal, no total e por produto;
 *  - **O funil**: das que entraram no período, quantas chegaram a cada etapa (e a porcentagem das que
 *    entraram), quantas se perderam em cada uma e quantas foram ganhas.
 *
 * Os painéis de chamados (os de Gestão) têm, nesta mesma vista, os Relatórios deles (2.0.5, decisão 0055:
 * `relatorios/index.tsx`).
 *
 * A regra dos gráficos do sistema vale aqui: o número sempre escrito, e clicar mostra as negociações por
 * trás dele (numa janela; o código abre a negociação). As contas moram no `@gestor/shared` (`vendas.ts`):
 * o servidor e a prévia contam igual.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calculator, CalendarRange, ChartColumn, Filter as Funnel, Info, Target, TrendingDown, TrendingUp, X } from 'lucide-react';
import {
  diaComAno, percentualDaFracao, periodosDoRelatorio, reaisCurto, reaisInteiros,
  type GrupoDaMargem, type MesDeVendas, type NegociacaoDoRelatorio, type OpcoesAtendimento, type Painel, type RelatorioDeVendas,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { Carregando, Modal, Vazio, mensagemErro } from '../../components/ui/index.js';
import { CabecalhoAtendimento, ChipResultado, LinkDoChamado, useOpcoes } from './comum.js';
import { ChipDoSinal } from '../comercial/simulador/comum.js';
import { CabecalhoDoPainel } from './painel.js';
import { useFiltrosNoEndereco } from './quadro/filtros.js';
import { RelatoriosDoPainelDeChamados } from './relatorios/index.js';

const nf = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const pct = (n: number | null) => (n === null ? '—' : `${nf(n)}%`);
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * O que a janela mostra: o nome do que foi clicado e as negociações por trás. `medida`: o valor que cada
 * negociação mostra (e que a janela soma) — a mensalidade, ou a ativação no que é da ativação.
 */
type Aberta = { titulo: string; ids: string[]; medida?: 'mensalidade' | 'ativacao' };

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
        // os painéis de chamados têm os Relatórios deles (2.0.5, decisão 0055)
        <RelatoriosDoPainelDeChamados key={painel.id} painel={painel} opcoes={opcoes.data!} />
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
  const [aberta, setAberta] = useState<Aberta | null>(null);
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
          <Secao id="relatorio-numeros" titulo="O período em números" icone={Target}
            pergunta={`Quanto entrou, quanto foi ganho e quanto foi perdido ${nomeDoPeriodo}, em mensalidades. A ativação, paga uma vez, tem o número dela.`}
            lado={<span title={`${diaComAno(r.anterior.de)} a ${diaComAno(r.anterior.ate)}`}>comparado com {r.anterior.nome} ({diaCurto(r.anterior.de)} a {diaCurto(r.anterior.ate)})</span>}>
            <Numeros r={r} nomeDoPeriodo={nomeDoPeriodo} abrir={setAberta} />
          </Secao>
          <MesAMes r={r} abrir={setAberta} />
          <MesAMesDaAtivacao r={r} abrir={setAberta} />
          {r.margem && (
            <Secao id="relatorio-margem" titulo="A margem das ganhas" icone={Calculator}
              pergunta={`As negociações ganhas ${nomeDoPeriodo} que têm simulação ligada: quanto sobra por mês, no total e por produto.`}
              lado={r.margem.ganhas ? `${r.margem.comSimulacao} de ${r.margem.ganhas} com simulação` : undefined}
              rodape="A margem do grupo é a sobra de todas sobre a mensalidade de todas (a venda grande pesa mais). Cada negociação entra com o cenário principal da simulação ligada a ela (a mexida por último, se houver mais de uma); a que tem dois produtos conta nos dois. Clique para ver as negociações.">
              <MargemDasGanhas r={r} abrir={setAberta} />
            </Secao>
          )}
          <Secao id="relatorio-funil" titulo="O funil" icone={Funnel}
            pergunta={`Das ${plural(r.numeros.novos.qtd, 'negociação que entrou', 'negociações que entraram')} ${nomeDoPeriodo}: até onde chegaram, onde se perderam e quantas foram ganhas.`}
            rodape="Conta a etapa mais adiante por onde a negociação passou (a ganha chegou ao fim) e, na perdida, a etapa em que ela estava quando foi perdida. A porcentagem é das que entraram. Clique para ver as negociações.">
            <Funil r={r} abrir={setAberta} />
          </Secao>
        </div>
      )}
      {aberta && r && <JanelaDasNegociacoes aberta={aberta} r={r} onFechar={() => setAberta(null)} />}
    </div>
  );
}

/** Um bloco do relatório: o título, a pergunta que ele responde, o que vai do lado e uma nota no pé. */
function Secao({ id, titulo, pergunta, icone: Icone, lado, rodape, children }: {
  id: string; titulo: string; pergunta: string; icone: typeof Info; lado?: ReactNode; rodape?: string; children: ReactNode;
}) {
  return (
    <section id={id} className="card p-4 sm:p-5 min-w-0 flex flex-col gap-4" aria-labelledby={`${id}-t`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={`${id}-t`} className="font-display font-semibold text-[17px] leading-tight flex items-center gap-2"><Icone size={17} className="text-muted shrink-0" aria-hidden />{titulo}</h2>
          <p className="text-[13px] text-ink-2 mt-0.5">{pergunta}</p>
        </div>
        {lado && <div className="text-[12px] text-muted sm:text-right sm:mt-1">{lado}</div>}
      </header>
      {children}
      {rodape && <p className="text-[12.5px] text-muted flex gap-1.5 leading-snug border-t border-line pt-3 mt-auto"><Info size={13} className="shrink-0 mt-0.5" aria-hidden /><span>{rodape}</span></p>}
    </section>
  );
}

/** "▲ R$ 8 mil", "▼ 2", "= igual": o que mudou em relação ao período anterior (a cor diz se foi bom). */
function Diferenca({ agora, antes, formato, bomSubir, contra }: {
  agora: number | null; antes: number | null; formato: 'reais' | 'n' | 'pontos'; bomSubir?: boolean; contra: string;
}) {
  if (agora === null || antes === null) return <span className="text-muted" title={`sem comparação com ${contra}`}>—</span>;
  const d = agora - antes;
  const antesEscrito = formato === 'reais' ? reaisInteiros(antes) : formato === 'pontos' ? `${nf(antes)}%` : nf(antes);
  if (Math.abs(d) < 1e-9) return <span className="text-muted" title={`${contra}: ${antesEscrito}`}>= igual</span>;
  const sobe = d > 0;
  const cor = bomSubir === undefined ? 'text-ink-2' : sobe === bomSubir ? 'text-ok' : 'text-signal';
  const texto = formato === 'reais' ? reaisInteiros(Math.round(Math.abs(d) / 100) * 100) : formato === 'pontos' ? `${nf(Math.abs(d))} ${Math.abs(d) === 1 ? 'ponto' : 'pontos'}` : nf(Math.abs(d));
  const Seta = sobe ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${cor}`} title={`${sobe ? 'Mais' : 'Menos'} que ${contra} (${antesEscrito})`}>
      <Seta size={13} aria-hidden /> {texto} <span className="font-normal text-muted">{sobe ? 'a mais' : 'a menos'}</span>
    </span>
  );
}

/** Um número do período: clicar mostra as negociações por trás dele. */
function Tile({ rotulo, valor, sub, diferenca, tom, ids, janela, medida, titulo, abrir, className = '' }: {
  rotulo: string; valor: string; sub: ReactNode; diferenca: ReactNode; tom?: 'ok' | 'bad'; ids?: string[];
  /** o título da janela que abre ao clicar (as negociações por trás) e o valor que ela mostra */
  janela?: string; medida?: Aberta['medida']; titulo?: string;
  abrir: (a: Aberta) => void; className?: string;
}) {
  const corpo = (
    <>
      <span className="eyebrow block">{rotulo}</span>
      <span className={`block font-display text-[24px] font-semibold tnum leading-tight mt-1 ${tom === 'ok' ? 'text-ok' : tom === 'bad' ? 'text-bad' : 'text-ink'}`}>{valor}</span>
      <span className="block text-[12.5px] text-muted leading-snug mt-0.5">{sub}</span>
      <span className="block text-[12.5px] mt-1.5">{diferenca}</span>
    </>
  );
  const classe = `rounded-xl border border-line p-3.5 text-left min-w-0 ${className}`;
  if (!ids?.length) return <div className={classe} title={titulo}>{corpo}</div>;
  return (
    <button type="button" className={`${classe} hover:border-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors`}
      onClick={() => abrir({ titulo: janela ?? rotulo, ids, medida })} title={titulo ?? 'Clique para ver as negociações'}>
      {corpo}
    </button>
  );
}

/** O ganho, a ativação, as novas, as perdidas, a conversão e o ticket médio, comparados com o período anterior. */
function Numeros({ r, nomeDoPeriodo, abrir }: { r: RelatorioDeVendas; nomeDoPeriodo: string; abrir: (a: Aberta) => void }) {
  const n = r.numeros;
  const a = r.anterior.numeros;
  const contra = r.anterior.nome;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5" id="relatorio-tiles">
      <Tile rotulo="Ganho" valor={reaisInteiros(n.ganhos.valor)} tom="ok" ids={n.ganhos.ids} janela={`Ganhas ${nomeDoPeriodo}`} abrir={abrir}
        sub={plural(n.ganhos.qtd, 'negociação ganha', 'negociações ganhas')}
        diferenca={<Diferenca agora={n.ganhos.valor} antes={a.ganhos.valor} formato="reais" bomSubir contra={contra} />} />
      <Tile rotulo="Ativação" valor={reaisInteiros(n.ativacoes.valor)} tom="ok" ids={n.ativacoes.ids} janela={`Ativação das ganhas ${nomeDoPeriodo}`} medida="ativacao" abrir={abrir}
        titulo="A ativação (paga uma vez) das negociações ganhas no período: fica à parte do Ganho, que é em mensalidades"
        sub={n.ativacoes.qtd ? plural(n.ativacoes.qtd, 'ganha com ativação', 'ganhas com ativação') : 'nenhuma ganha com ativação'}
        diferenca={<Diferenca agora={n.ativacoes.valor} antes={a.ativacoes.valor} formato="reais" bomSubir contra={contra} />} />
      <Tile rotulo="Novas" valor={n.novos.qtd.toLocaleString('pt-BR')} ids={n.novos.ids} janela={`Novas ${nomeDoPeriodo}`} abrir={abrir}
        sub={`${reaisCurto(n.novos.valor)} em propostas`}
        diferenca={<Diferenca agora={n.novos.qtd} antes={a.novos.qtd} formato="n" bomSubir contra={contra} />} />
      <Tile rotulo="Perdido" valor={reaisInteiros(n.perdidos.valor)} tom="bad" ids={n.perdidos.ids} janela={`Perdidas ${nomeDoPeriodo}`} abrir={abrir}
        sub={plural(n.perdidos.qtd, 'negociação perdida', 'negociações perdidas')}
        diferenca={<Diferenca agora={n.perdidos.valor} antes={a.perdidos.valor} formato="reais" contra={contra} />} />
      <Tile rotulo="Conversão" valor={pct(n.conversao)} titulo="Das que acabaram no período (ganhas e perdidas), quantas foram ganhas" abrir={abrir}
        sub={n.conversao === null ? 'nenhuma acabou no período' : `${n.ganhos.qtd} de ${n.ganhos.qtd + n.perdidos.qtd} que acabaram`}
        diferenca={<Diferenca agora={n.conversao} antes={a.conversao} formato="pontos" bomSubir contra={contra} />} />
      <Tile rotulo="Ticket médio" valor={n.ticketMedio === null ? '—' : reaisInteiros(Math.round(n.ticketMedio / 100) * 100)} titulo="A mensalidade média do que foi ganho" abrir={abrir}
        sub="a mensalidade média do ganho"
        diferenca={<Diferenca agora={n.ticketMedio} antes={a.ticketMedio} formato="reais" contra={contra} />} />
    </div>
  );
}

/** O que muda de um mês a mês para o outro (o dos ganhos e o da ativação). */
type Medida = {
  /** o id do bloco e o das colunas (as conferências da tela e os prints usam) */
  id: string; colunas: string;
  /** o que a janela mostra e soma; o nome do que foi ganho ("ganho", "ativação") */
  medida: NonNullable<Aberta['medida']>; oQue: string;
  /** a cor da coluna; "Ganhas em", "Ativação das ganhas em"; o que aparece sem nada nos 12 meses */
  cor: string; janela: string; vazio: string;
  /** o fim da dica de cada coluna: "em 3 negociações ganhas" */
  emQuantas: (qtd: number) => string;
};
const DOS_GANHOS: Medida = {
  id: 'relatorio-meses', colunas: 'relatorio-colunas-meses', medida: 'mensalidade', oQue: 'ganho', cor: 'bg-accent', janela: 'Ganhas em',
  vazio: 'Nada ganho nos últimos 12 meses.', emQuantas: (qtd) => `em ${plural(qtd, 'negociação ganha', 'negociações ganhas')}`,
};
const DA_ATIVACAO: Medida = {
  id: 'relatorio-meses-ativacao', colunas: 'relatorio-colunas-ativacao', medida: 'ativacao', oQue: 'ativação', cor: 'bg-ok', janela: 'Ativação das ganhas em',
  vazio: 'Nenhuma ativação ganha nos últimos 12 meses.', emQuantas: (qtd) => `em ${plural(qtd, 'ganha com ativação', 'ganhas com ativação')}`,
};

/** O pé dos dois mês a mês: como o mês pela metade é comparado. */
function pedacoDoMes(meses: MesDeVendas[]) {
  const ultimo = meses.at(-1);
  return ultimo?.parcial ? ` O * é ${ultimo.nome.split(' de ')[0]} até ${diaCurto(ultimo.ate)}: ele é comparado com o mesmo pedaço do mês anterior.` : '';
}
/** "12 meses: R$ 9.500 em 14 negociações", do lado do título. */
function TotalDosMeses({ meses }: { meses: MesDeVendas[] }) {
  const total = meses.reduce((t, m) => t + m.ganho, 0);
  const qtd = meses.reduce((t, m) => t + m.qtd, 0);
  return <span>12 meses: <b className="text-ink-2 tnum">{reaisInteiros(total)}</b> em {plural(qtd, 'negociação', 'negociações')}</span>;
}

/** Os ganhos mês a mês (em mensalidades): o bloco, com o total dos 12 meses do lado e, no pé, como o mês pela metade é comparado. */
function MesAMes({ r, abrir }: { r: RelatorioDeVendas; abrir: (a: Aberta) => void }) {
  return (
    <Secao id={DOS_GANHOS.id} titulo="Os ganhos mês a mês" icone={ChartColumn}
      pergunta="Quanto foi ganho em cada mês, e quanto mudou em relação ao mês anterior."
      lado={<TotalDosMeses meses={r.meses} />}
      rodape={`O ganho conta no mês em que a negociação foi ganha. Clique num mês para ver as negociações.${pedacoDoMes(r.meses)}`}>
      <ColunasDosMeses meses={r.meses} medida={DOS_GANHOS} abrir={abrir} />
    </Secao>
  );
}

/** As ativações mês a mês (19/10): os mesmos 12 meses, só com a ativação das ganhas — à parte da mensalidade. */
function MesAMesDaAtivacao({ r, abrir }: { r: RelatorioDeVendas; abrir: (a: Aberta) => void }) {
  return (
    <Secao id={DA_ATIVACAO.id} titulo="As ativações mês a mês" icone={ChartColumn}
      pergunta="Quanto de ativação foi ganho em cada mês, e quanto mudou em relação ao mês anterior."
      lado={<TotalDosMeses meses={r.mesesDaAtivacao} />}
      rodape={`A ativação (paga uma vez) conta no mês em que a negociação foi ganha; entram só as ganhas com ativação. Clique num mês para ver as negociações.${pedacoDoMes(r.mesesDaAtivacao)}`}>
      <ColunasDosMeses meses={r.mesesDaAtivacao} medida={DA_ATIVACAO} abrir={abrir} />
    </Secao>
  );
}

/** As colunas dos meses (no celular, os 6 últimos): o valor em cima, o mês e a mudança embaixo. */
function ColunasDosMeses({ meses, medida, abrir }: { meses: MesDeVendas[]; medida: Medida; abrir: (a: Aberta) => void }) {
  if (!meses.some((m) => m.ganho > 0)) return <p className="text-muted text-sm py-4">{medida.vazio}</p>;
  const max = Math.max(1, ...meses.map((m) => m.ganho));
  const altura = 190;
  const util = altura - 24;
  const mostra = (i: number) => (i < meses.length - 6 ? 'hidden sm:flex' : 'flex');
  const nomeDoMes = (m: MesDeVendas) => `${m.nome}${m.parcial ? ` (até ${diaCurto(m.ate)})` : ''}`;
  return (
    <div id={medida.colunas}>
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: altura }}>
        {meses.map((m, i) => {
          const ultimo = i === meses.length - 1;
          return (
            <button key={m.mes} type="button" disabled={!m.qtd} data-mes={m.mes}
              onClick={() => abrir({ titulo: `${medida.janela} ${nomeDoMes(m)}`, ids: m.ids, medida: medida.medida })}
              title={`${nomeDoMes(m)}: ${reaisInteiros(m.ganho)} ${medida.emQuantas(m.qtd)}`}
              aria-label={`${nomeDoMes(m)}: ${reaisInteiros(m.ganho)}`}
              className={`${mostra(i)} flex-1 min-w-0 h-full flex-col justify-end items-center group enabled:cursor-pointer`}>
              {m.ganho > 0 && <span className={`text-[10.5px] sm:text-[11px] tnum leading-none mb-1 whitespace-nowrap ${ultimo ? 'text-ink font-semibold' : 'text-ink-2'}`}>{reaisCurto(m.ganho)}</span>}
              <span className={`block w-full max-w-[64px] rounded-t ${medida.cor} transition-opacity ${ultimo ? '' : 'opacity-55'} group-enabled:group-hover:opacity-100`}
                style={{ height: m.ganho ? Math.max(3, (m.ganho / max) * util) : 0 }} />
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5 sm:gap-2 border-t border-line mt-0.5 pt-1.5">
        {meses.map((m, i) => (
          <span key={m.mes} className={`${mostra(i)} flex-1 min-w-0 flex-col items-center text-center leading-tight gap-0.5`}>
            <span className={`text-[11px] ${i === meses.length - 1 ? 'text-accent font-semibold' : 'text-muted'}`}>{m.curto}{m.parcial ? '*' : ''}</span>
            <MudancaDoMes m={m} oQue={medida.oQue} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** "▲ 23%" (verde) ou "▼ 8%" (laranja) em relação ao mês anterior; sem nada antes, um traço. */
function MudancaDoMes({ m, oQue }: { m: MesDeVendas; oQue: string }) {
  if (!m.antes) return <span className="text-[10.5px] text-muted" title={`O mês anterior não teve ${oQue}`}>—</span>;
  const d = m.ganho - m.antes;
  if (d === 0) return <span className="text-[10.5px] text-muted" title="Igual ao mês anterior">=</span>;
  const sobe = d > 0;
  return (
    <span className={`text-[10.5px] font-semibold tnum whitespace-nowrap ${sobe ? 'text-ok' : 'text-signal'}`}
      title={`${sobe ? 'Mais' : 'Menos'} que o mês anterior${m.parcial ? ' (no mesmo pedaço)' : ''}: ${reaisInteiros(m.antes)}`}>
      {sobe ? '▲' : '▼'} {Math.round((Math.abs(d) / m.antes) * 100)}%
    </span>
  );
}

/** A margem das ganhas (2.0.2): o total e por produto; o clique mostra as negociações. */
function MargemDasGanhas({ r, abrir }: { r: RelatorioDeVendas; abrir: (a: Aberta) => void }) {
  const m = r.margem!;
  if (!m.comSimulacao) {
    return (
      <p className="text-muted text-sm py-1">
        {m.ganhas ? 'Nenhuma das ganhas do período tem simulação ligada. No Simulador (Comercial › Simulador), ligue a simulação à negociação, ou use o Simular da ficha.' : 'Nenhuma negociação ganha no período.'}
      </p>
    );
  }
  const Grupo = ({ g, titulo }: { g: GrupoDaMargem; titulo: string }) => (
    <button type="button" onClick={() => abrir({ titulo, ids: g.ids })} className="w-full grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_132px_auto] items-center gap-x-3 py-1.5 px-2 text-left text-[13px] hover:bg-surface-2 rounded-md" data-margem={g.nome}>
      <span className="min-w-0">
        <span className="block font-medium text-ink-2 truncate">{g.nome}</span>
        <span className="block text-[12px] text-muted tnum">
          {plural(g.qtd, 'ganha', 'ganhas')} · {reaisInteiros(g.mensalidade)}/mês<span className="sm:hidden"> · sobra {reaisInteiros(g.sobra)}</span>
        </span>
      </span>
      <span className="hidden sm:block text-right tnum">sobra <b className="text-ink">{reaisInteiros(g.sobra)}</b></span>
      <ChipDoSinal sinal={g.sinal} margem={g.margem} curto />
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => abrir({ titulo: 'As ganhas com simulação', ids: m.geral.ids })} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-left group" id="relatorio-margem-geral">
        <span className="font-display text-[28px] leading-none font-semibold tnum group-hover:text-accent">{m.geral.margem == null ? '—' : percentualDaFracao(m.geral.margem)}</span>
        <ChipDoSinal sinal={m.geral.sinal} margem={m.geral.margem} soOSinal />
        <span className="text-[13px] text-ink-2">sobram <b className="tnum">{reaisInteiros(m.geral.sobra)}</b> por mês de <b className="tnum">{reaisInteiros(m.geral.mensalidade)}</b> em mensalidades</span>
      </button>
      <div className="min-w-0 max-w-2xl" id="relatorio-margem-por-produto">
        <div className="eyebrow mb-1">Por produto</div>
        <div className="divide-y divide-line -mx-2">{m.porProduto.map((g) => <Grupo key={g.nome} g={g} titulo={`As ganhas com ${g.nome}`} />)}</div>
      </div>
    </div>
  );
}

/** O funil: as barras alinhadas à esquerda, quantas chegaram (e a porcentagem das que entraram) e as perdidas. */
function Funil({ r, abrir }: { r: RelatorioDeVendas; abrir: (a: Aberta) => void }) {
  if (!r.numeros.novos.qtd) return <p className="text-muted text-sm py-2">Nenhuma negociação entrou no período.</p>;
  const total = r.numeros.novos.qtd;
  const linhas = [
    ...r.funil.map((f) => ({ id: f.etapaId, nome: f.nome, chegaram: f.chegaram, perdidas: f.perdidas, ganho: false })),
    { id: 'ganhas', nome: 'Ganhas', chegaram: r.funilGanhas, perdidas: [] as string[], ganho: true },
  ];
  return (
    <ol className="flex flex-col gap-2.5" aria-label="O funil">
      {linhas.map((l) => {
        const n = l.chegaram.length;
        const parte = Math.round((n / total) * 100);
        const ver = () => abrir({ titulo: l.ganho ? 'As que entraram e foram ganhas' : `Chegaram a ${l.nome}`, ids: l.chegaram });
        return (
          // no celular, o nome e os números em cima e a barra embaixo; da tela média para cima, numa linha só
          <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,160px)_1fr_minmax(0,190px)] items-center gap-x-3 gap-y-1 text-[13px]" data-funil={l.nome}>
            <button type="button" onClick={ver} disabled={!n} className={`text-left truncate font-medium ${l.ganho ? 'text-ok' : 'text-ink-2'} enabled:hover:text-accent`} title={n ? 'Ver as negociações' : undefined}>
              {l.nome}
            </button>
            <span className="sm:order-last flex items-center justify-end gap-2 whitespace-nowrap">
              <span className="tnum"><b className="text-ink">{n}</b> <span className="text-muted">· {parte}%</span></span>
              {l.perdidas.length > 0 && (
                <button type="button" onClick={() => abrir({ titulo: `Perdidas em ${l.nome}`, ids: l.perdidas })}
                  className="chip bg-bad-soft text-bad hover:brightness-95" title={`Ver as que foram perdidas em ${l.nome}`}>
                  <X size={11} aria-hidden /> {plural(l.perdidas.length, 'perdida', 'perdidas')}
                </button>
              )}
            </span>
            <button type="button" onClick={ver} disabled={!n} tabIndex={-1} aria-hidden className="col-span-2 sm:col-span-1 h-6 rounded-md bg-surface-2 overflow-hidden text-left enabled:cursor-pointer">
              <span className={`block h-full rounded-md ${l.ganho ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${n ? Math.max(2, parte) : 0}%` }} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A janela das negociações por trás de um número: o código (abre a negociação), a empresa, o valor e como
 * está. O valor é a mensalidade; no que é da ativação, a ativação (e a soma também).
 */
function JanelaDasNegociacoes({ aberta, r, onFechar }: { aberta: Aberta; r: RelatorioDeVendas; onFechar: () => void }) {
  const porId = useMemo(() => new Map(r.negociacoes.map((n) => [n.id, n])), [r.negociacoes]);
  const lista = aberta.ids.map((id) => porId.get(id)).filter((n): n is NegociacaoDoRelatorio => !!n);
  const daAtivacao = aberta.medida === 'ativacao';
  const soma = lista.reduce((t, n) => t + ((daAtivacao ? n.ativacao : n.valor) ?? 0), 0);
  return (
    <Modal open onClose={onFechar} largura="max-w-2xl" titulo={aberta.titulo}>
      <p className="text-[13px] text-muted mb-2" id="janela-negociacoes-total">{plural(lista.length, 'negociação', 'negociações')}{soma ? ` · ${reaisInteiros(soma)}${daAtivacao ? ' de ativação' : ''}` : ''}</p>
      <ul className="divide-y divide-line -mx-1" id="janela-negociacoes">
        {lista.map((n) => (
          <li key={n.id} className="py-2.5 px-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-[13.5px]">
            <LinkDoChamado codigo={n.codigo} onClick={onFechar} className="min-w-0 hover:text-accent">
              <span className="font-mono text-[12px] text-muted mr-1.5">{n.codigo}</span><span className="font-semibold">{n.titulo}</span>
            </LinkDoChamado>
            <span className="tnum font-semibold text-right">
              {daAtivacao
                ? (n.ativacao === null ? <span className="text-muted font-normal">sem ativação</span> : <>{reaisInteiros(n.ativacao)}<span className="font-normal text-muted"> de ativação</span></>)
                : (n.valor === null ? <span className="text-muted font-normal">sem mensalidade</span> : <>{reaisInteiros(n.valor)}<span className="font-normal text-muted">/mês</span></>)}
            </span>
            <span className="text-[12.5px] text-muted min-w-0 truncate">{[n.empresa ?? 'sem empresa', n.responsavel ?? 'sem dono'].join(' · ')}</span>
            <span className="text-right text-[12.5px]">
              {n.resultado ? <ChipResultado r={n.resultado} motivo={n.motivoPerda} em={n.fechadoEm} /> : <span className="text-ink-2">{n.etapa}</span>}
            </span>
            {n.resultado === 'perdido' && n.motivoPerda && <span className="col-span-2 text-[12.5px] text-muted">Motivo: {n.motivoPerda}</span>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
