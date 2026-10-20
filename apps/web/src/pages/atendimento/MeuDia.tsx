/**
 * Painéis › Meu dia (Patch 2.0, decisão 0047): a primeira tela do módulo. O que é da pessoa hoje,
 * sem precisar filtrar nada: o que está vencendo, os seus em aberto, os sem dono na fila (com o
 * Assumir ali mesmo), os que esperam o cliente, os que ela observa e os agendados que nascem hoje.
 *
 * Os números de cima levam para a lista já filtrada (o "Vencendo" desce até a seção: ele junta os
 * seus e os sem dono, e a lista não tem esse filtro). Relê a cada minuto, porque o prazo anda.
 *
 * Desde o 2.0.1, o "Hoje na agenda": o que está no calendário hoje nas equipes que a pessoa vê (os de
 * que ela participa primeiro) e quem está fora do escritório; o evento abre ali mesmo.
 */
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, Eye, Hourglass, Inbox, TriangleAlert, User, UserCheck } from 'lucide-react';
import {
  cobreODia, compararUrgencia, diaLocal, etapaAoAssumir, horaLocal, mensagemDoQueFalta, ordemDoDia,
  type CartaoChamado, type MeuDia as DadosDoDia, type OpcoesAtendimento,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { Carregando, Kpi, Spinner, mensagemErro, useToast } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { CabecalhoAtendimento, CartaoDoChamado, dataHoraCurta, etapaDe, haQuanto, painelDe, useDepoisDeMudar, useOpcoes, usePode } from './comum.js';
import { CartaoComRodape } from './quadro/cartao.js';
import { PontoDoPainel } from './quadro/filtros.js';
import { ForaDoEscritorio, LinhaDoEvento, useEventosDoPeriodo, useNomesDasPessoas, useOpcoesDoCalendario } from '../calendario/comum.js';
import { JanelaDoEvento, type AberturaDoEvento } from '../calendario/Janela.js';

const CHAVE = ['atendimento', 'meu-dia'];
/** Quantos cartões cada seção mostra antes do "Ver todos". */
const PRIMEIROS = 6;

const fmtDia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' });

/** Bom dia, boa tarde ou boa noite pelo relógio de Brasília (e não pelo do computador de quem olha). */
function saudacao(agora: Date): string {
  const h = Number(horaLocal(agora).slice(0, 2));
  return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function MeuDia() {
  const { user } = useAuth();
  const pode = usePode();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const opcoes = useOpcoes();
  const dia = useQuery({ queryKey: CHAVE, queryFn: () => api.atendimento.meuDia(), refetchInterval: 60_000 });
  const depois = useDepoisDeMudar();
  const [assumindo, setAssumindo] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const agora = new Date();
  const nome = user?.name.trim().split(/\s+/)[0] ?? '';
  const sub = `${saudacao(agora)}${nome ? `, ${nome}` : ''}. Hoje é ${fmtDia.format(agora)}.`;
  const hoje = diaLocal(agora);
  const naLista = (q: string) => `/atendimento/lista?${q}`;

  const assumir = async (c: CartaoChamado) => {
    setAssumindo(c.id);
    setErros((x) => ({ ...x, [c.id]: '' }));
    try {
      const f = await depois(api.atendimento.assumir(c.id));
      // o cartão já passa para "Meus em aberto"; a releitura que vem em seguida confirma
      qc.setQueryData<DadosDoDia>(CHAVE, (d) => d && {
        ...d,
        semDono: d.semDono.filter((x) => x.id !== f.id),
        vencendo: d.vencendo.map((x) => (x.id === f.id ? f : x)),
        meus: [...d.meus.filter((x) => x.id !== f.id), f].sort(compararUrgencia),
      });
      // na entrada, assumir leva para o andamento — a não ser que falte algo que a etapa pede
      const painel = painelDe(opcoes.data, f.painelId);
      const proxima = painel ? etapaAoAssumir(painel.etapas, c.etapaId) : null;
      const ficou = proxima && f.etapaId === c.etapaId;
      if (ficou) toast.push('info', `Você assumiu ${f.codigo}. ${mensagemDoQueFalta(f.faltam[proxima.id] ?? [], proxima.nome, opcoes.data?.campos)}`.trim());
      else toast.push('ok', `Você assumiu ${f.codigo}${f.etapaId !== c.etapaId ? ` (foi para ${etapaDe(opcoes.data, f.painelId, f.etapaId)?.nome ?? 'a etapa seguinte'})` : ''}.`);
    } catch (e) {
      setErros((x) => ({ ...x, [c.id]: mensagemErro(e) }));
    } finally {
      setAssumindo(null);
    }
  };

  const cartao = (c: CartaoChamado) => {
    const cor = painelDe(opcoes.data, c.painelId)?.cor;
    const etapa = etapaDe(opcoes.data, c.painelId, c.etapaId)?.nome;
    if (c.responsavel || !pode.trabalhar) {
      return <li key={c.id} className="min-w-0" data-codigo={c.codigo}><CartaoDoChamado c={c} cor={cor} mostrarEtapa={!!etapa} nomeDaEtapa={etapa} /></li>;
    }
    const indo = assumindo === c.id;
    return (
      <li key={c.id} className="min-w-0" data-codigo={c.codigo}>
        <CartaoComRodape
          c={c} cor={cor} nomeDaEtapa={etapa}
          rodape={(
            <>
              <button type="button" className="btn-secondary btn-sm px-2 py-1 text-[12.5px]" disabled={indo || !!assumindo} onClick={() => void assumir(c)} title={`Ficar com ${c.codigo}`}>
                {indo ? <Spinner className="!w-3.5 !h-3.5" /> : <UserCheck size={13} aria-hidden />} Assumir
              </button>
              <span className="ml-auto text-[11.5px] text-muted whitespace-nowrap" title={`Aberto ${dataHoraCurta(c.criadoEm)}`}>aberto {haQuanto(c.criadoEm)}</span>
            </>
          )}
        />
        {erros[c.id] && <p className="text-bad text-[12.5px] mt-1 px-1" role="alert">{erros[c.id]}</p>}
      </li>
    );
  };

  const d = dia.data;
  const rolarAteVencendo = () => {
    const menos = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('meudia-vencendo')?.scrollIntoView({ behavior: menos ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div>
      <CabecalhoAtendimento sub={sub} />
      {dia.isLoading ? <Carregando /> : dia.isError || !d ? (
        <div className="card p-4 text-sm" role="alert">
          <p className="text-bad">{mensagemErro(dia.error)}</p>
          <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => void dia.refetch()}>Tentar de novo</button>
        </div>
      ) : (
        <>
          {/* seis numa linha só quando cabe o nome inteiro de cada um (senão os números desalinham) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3 mb-6" id="meudia-numeros">
            <Kpi label="Meus em aberto" valor={d.meus.length} tone="accent" titulo="Abre a lista com os seus chamados em aberto" onClick={() => nav(naLista('responsavel=eu'))} />
            <Kpi label="Vencendo" valor={d.vencendo.length} tone={d.vencendo.length ? 'bad' : 'neutral'}
              titulo={d.vencendo.length ? 'Os seus e os sem dono com o prazo vencido ou perto de vencer: clique para descer até eles' : 'Nada seu (nem sem dono) vencendo agora'}
              onClick={d.vencendo.length ? rolarAteVencendo : undefined} />
            <Kpi label="Sem dono na fila" valor={d.semDono.length} tone={d.semDono.length ? 'signal' : 'neutral'} titulo="Abre a lista com os chamados em aberto sem responsável" onClick={() => nav(naLista('responsavel=ninguem'))} />
            <Kpi label="Esperando o cliente" valor={d.esperandoCliente.length} titulo="Abre a lista com os seus que esperam o cliente" onClick={() => nav(naLista('responsavel=eu&espera=cliente'))} />
            <Kpi label="Abertos hoje" valor={d.abertosHoje} titulo="Abre a lista com os chamados abertos hoje" onClick={() => nav(naLista(`situacao=todos&de=${hoje}&ate=${hoje}`))} />
            <Kpi label="Fechados hoje" valor={d.fechadosHoje} tone={d.fechadosHoje ? 'ok' : 'neutral'} titulo="Abre a lista dos fechados, os mexidos por último primeiro"
              onClick={() => nav(naLista('situacao=fechados&sort=atualizado&dir=desc'))} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 min-w-0 flex flex-col gap-6">
              {d.vencendo.length > 0 && (
                <Secao id="meudia-vencendo" titulo="Vencendo" icone={<TriangleAlert size={16} aria-hidden />} n={d.vencendo.length} destaque
                  dica="Os seus e os sem dono com a resposta ou a solução vencida ou perto de vencer.">
                  <Cartoes itens={d.vencendo} render={cartao} todos />
                </Secao>
              )}
              <Secao id="meudia-meus" titulo="Meus em aberto" icone={<User size={16} aria-hidden />} n={d.meus.length} link={naLista('responsavel=eu')}
                vazio={d.semDono.length ? 'Nada com você agora. Que tal pegar um da fila, logo abaixo?' : 'Nada com você agora.'}>
                <Cartoes itens={d.meus} render={cartao} />
              </Secao>
              <Secao id="meudia-sem-dono" titulo="Sem dono na fila" icone={<Inbox size={16} aria-hidden />} n={d.semDono.length} link={naLista('responsavel=ninguem')}
                vazio="A fila está em dia: todo chamado aberto tem alguém cuidando.">
                <Cartoes itens={d.semDono} render={cartao} />
              </Secao>
            </div>
            <div className="min-w-0 flex flex-col gap-6">
              <HojeNaAgenda eu={user?.id ?? null} />
              <Agendados itens={d.agendadosHoje} opcoes={opcoes.data} podeVer={pode.cuidar} />
              <Secao id="meudia-esperando" titulo="Esperando o cliente" icone={<Hourglass size={16} aria-hidden />} n={d.esperandoCliente.length} link={naLista('responsavel=eu&espera=cliente')}
                vazio="Nenhum chamado seu esperando o cliente.">
                <Cartoes itens={d.esperandoCliente} render={cartao} estreita />
              </Secao>
              <Secao id="meudia-acompanhando" titulo="Observando" icone={<Eye size={16} aria-hidden />} n={d.observando.length}
                vazio="Os chamados que você observa, mesmo sem ser o responsável, aparecem aqui (e os avisos deles chegam no sininho).">
                <Cartoes itens={d.observando} render={cartao} estreita />
              </Secao>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Secao({ id, titulo, icone, n, dica, link, linkTexto = 'Ver na lista', destaque = false, vazio, children }: {
  id: string; titulo: string; icone: ReactNode; n: number; dica?: string; link?: string; linkTexto?: string; destaque?: boolean; vazio?: string; children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={`scroll-mt-20 ${destaque ? 'rounded-xl border border-bad bg-bad-soft p-3 sm:p-4' : ''}`}>
      <div className="flex items-center gap-2 mb-2.5 min-w-0">
        <h2 id={`${id}-titulo`} className={`font-display font-semibold text-[15px] inline-flex items-center gap-1.5 ${destaque ? 'text-bad' : 'text-ink'}`}>
          <span className={destaque ? '' : 'text-muted'}>{icone}</span>{titulo}
        </h2>
        <span className={`tnum text-[13px] font-semibold ${destaque ? 'text-bad' : 'text-muted'}`}>{n}</span>
        {link && n > 0 && <Link to={link} className="ml-auto link text-[12.5px] whitespace-nowrap">{linkTexto}</Link>}
      </div>
      {dica && <p className={`text-[12.5px] -mt-1.5 mb-2.5 ${destaque ? 'text-ink-2' : 'text-muted'}`}>{dica}</p>}
      {n === 0 && vazio ? <p className="text-[13px] text-muted rounded-xl border border-dashed border-line-strong px-3 py-4">{vazio}</p> : children}
    </section>
  );
}

/** Os cartões de uma seção, numa grade; passando de seis, o "Ver todos" mostra o resto ali mesmo. */
function Cartoes({ itens, render, todos: sempreTodos = false, estreita = false }: { itens: CartaoChamado[]; render: (c: CartaoChamado) => ReactNode; todos?: boolean; estreita?: boolean }) {
  const [todos, setTodos] = useState(false);
  const mostrar = sempreTodos || todos ? itens : itens.slice(0, PRIMEIROS);
  return (
    <>
      <ul className={`grid grid-cols-1 gap-3 ${estreita ? 'sm:grid-cols-2 lg:grid-cols-1' : 'sm:grid-cols-2'}`}>{mostrar.map(render)}</ul>
      {!sempreTodos && itens.length > PRIMEIROS && (
        <button type="button" className="btn-ghost btn-sm mt-2 text-accent" onClick={() => setTodos((v) => !v)}>
          {todos ? `Mostrar só os ${PRIMEIROS} primeiros` : `Ver todos os ${itens.length}`}
        </button>
      )}
    </>
  );
}

/** Os agendados que o Gestor ainda abre hoje, na hora marcada. */
function Agendados({ itens, opcoes, podeVer }: { itens: DadosDoDia['agendadosHoje']; opcoes: OpcoesAtendimento | undefined; podeVer: boolean }) {
  return (
    <Secao id="meudia-agendados" titulo="Agendados de hoje" icone={<CalendarClock size={16} aria-hidden />} n={itens.length}
      link={podeVer ? '/atendimento/ajustes?aba=agendados' : undefined} linkTexto="Ver os agendados" dica={itens.length ? 'O Gestor abre estes chamados sozinho, na hora marcada.' : undefined}
      vazio="Nenhum chamado agendado para hoje.">
      <ul className="card divide-y divide-line">
        {itens.map((a) => {
          const painel = painelDe(opcoes, a.painelId);
          return (
            <li key={a.id} className="flex items-start gap-3 px-3 py-2 text-[13.5px] min-w-0">
              <span className="font-mono tnum text-ink-2 shrink-0">{a.hora}</span>
              <span className="flex-1 min-w-0 line-clamp-2 font-medium leading-snug pt-px" title={a.titulo}>{a.titulo}</span>
              {painel && <span className="inline-flex items-center gap-1.5 text-[12px] text-muted shrink-0 pt-0.5" title={painel.nome}><PontoDoPainel cor={painel.cor} /> {painel.sigla}</span>}
            </li>
          );
        })}
      </ul>
    </Secao>
  );
}

/**
 * O que está no calendário hoje (2.0.1): os eventos das equipes que a pessoa vê, os dela primeiro, e
 * quem está fora do escritório. Clicar abre o evento ali mesmo (com o Feito, para quem trabalha).
 */
function HojeNaAgenda({ eu }: { eu: string | null }) {
  const opcoes = useOpcoesDoCalendario();
  const hoje = opcoes.data?.hoje ?? '';
  const eventos = useEventosDoPeriodo(hoje, hoje, !!opcoes.data);
  const nomes = useNomesDasPessoas(opcoes.data);
  const [janela, setJanela] = useState<AberturaDoEvento | null>(null);
  if (!opcoes.data || !eventos.data) return null;
  const op = opcoes.data;
  const meu = (e: { pessoas: string[] }) => (eu && e.pessoas.includes(eu) ? 0 : 1);
  const lista = eventos.data.filter((e) => cobreODia(e, hoje)).sort((a, b) => meu(a) - meu(b) || ordemDoDia(a, b));
  return (
    <Secao id="meudia-agenda" titulo="Hoje na agenda" icone={<CalendarDays size={16} aria-hidden />} n={lista.length} link="/calendario" linkTexto="Abrir o calendário"
      vazio="Nada no calendário hoje. As visitas, as viradas, as folgas e os home offices da equipe aparecem aqui.">
      <div className="card p-2 flex flex-col gap-2">
        <ForaDoEscritorio eventos={lista} opcoes={op} nomes={nomes} dia={hoje} className="px-1 pt-0.5" />
        <ul className="flex flex-col gap-0.5">
          {lista.map((e) => <li key={e.id}><LinhaDoEvento e={e} opcoes={op} nomes={nomes} comVoce={eu} onAbrir={() => setJanela({ evento: e })} /></li>)}
        </ul>
      </div>
      {janela && <JanelaDoEvento abertura={janela} opcoes={op} onFechar={() => setJanela(null)} />}
    </Secao>
  );
}
