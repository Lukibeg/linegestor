/**
 * Chamados — a primeira tela do módulo (Patch 2.0): os PAINÉIS, como no Helena. O Luan, na prévia:
 * "quando eu clicar em chamados eu quero uma tela inicial onde eu vou poder escolher entre os quadros
 * e as configurações deles; no futuro vou ter outros painéis, e alternar por abas não fica legal".
 *
 * Um cartão por painel: a sigla e o nome, quem vê, os números (em aberto, vencidos, sem dono, os
 * meus) e quantos estão em cada etapa. Clicar no cartão abre o quadro; cada número abre a lista já
 * filtrada; "Configurar" abre a janela daquele painel nos Ajustes — o nome, quem vê, as etapas e as
 * regras, tudo junto (quem cuida dos chamados). O Meu dia virou uma aba ao lado.
 *
 * O painel de Vendas (2.0.1, o Comercial) mostra os números da venda: o que está em negociação, o ganho
 * do mês contra a meta, o que está sem dono e as suas — e o Relatório.
 */
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChartColumn, Lock, Plus, Search, Settings2 } from 'lucide-react';
import { paraBusca, reaisInteiros, type Painel, type ResumoDoPainel } from '@gestor/shared';
import { api } from '../../api/index.js';
import { Carregando, Chip, Vazio, mensagemErro } from '../../components/ui/index.js';
import { CabecalhoAtendimento, useLerOQuadroAntes, useOpcoes, usePode } from './comum.js';
import { enderecoDoRelatorio } from './painel.js';

/** O fundo e a letra do quadradinho da sigla, na cor do painel (as classes inteiras, para o Tailwind achar). */
const SIGLA_DO_PAINEL: Record<Painel['cor'], string> = {
  accent: 'bg-accent-soft text-accent-ink', roxo: 'bg-roxo-soft text-roxo-ink', turquesa: 'bg-turquesa-soft text-turquesa-ink',
  signal: 'bg-signal-soft text-signal', ok: 'bg-ok-soft text-ok', rosa: 'bg-rosa-soft text-rosa-ink', amarelo: 'bg-amarelo-soft text-amarelo-ink',
  neutral: 'bg-surface-2 text-ink-2',
};

/** Com muitos painéis, a busca aparece (com poucos, ela só ocuparia lugar). */
const BUSCA_A_PARTIR_DE = 7;

export function PaineisDeChamados() {
  const opcoes = useOpcoes();
  const pode = usePode();
  // o prazo anda com o relógio: os números se releem a cada minuto, como o quadro
  const resumo = useQuery({ queryKey: ['atendimento', 'paineis', 'resumo'], queryFn: () => api.atendimento.resumoDosPaineis(), refetchInterval: 60_000 });
  const [busca, setBusca] = useState('');

  const paineis = useMemo(() => {
    const todos = opcoes.data?.paineis ?? [];
    // o desativado só aparece para quem cuida (para reativar); fica no fim
    const vistos = todos.filter((p) => p.ativo || pode.cuidar);
    const termo = paraBusca(busca);
    const achados = termo ? vistos.filter((p) => paraBusca(`${p.nome} ${p.sigla} ${p.descricao ?? ''}`).includes(termo)) : vistos;
    return [...achados.filter((p) => p.ativo), ...achados.filter((p) => !p.ativo)];
  }, [opcoes.data, pode.cuidar, busca]);
  const porPainel = useMemo(() => new Map((resumo.data ?? []).map((r) => [r.painelId, r])), [resumo.data]);
  const quantos = (opcoes.data?.paineis ?? []).filter((p) => p.ativo || pode.cuidar).length;

  return (
    <div>
      <CabecalhoAtendimento />
      {opcoes.isLoading ? <Carregando /> : opcoes.isError ? <p className="text-bad text-sm" role="alert">{mensagemErro(opcoes.error)}</p> : !quantos ? (
        <Vazio titulo="Nenhum painel para você"
          texto="Os painéis de chamados aparecem aqui quando quem cuida dos chamados cria um (ou inclui você num painel de acesso escolhido)."
          acao={pode.cuidar ? <Link to="/atendimento/ajustes?aba=paineis&novo=1" className="btn-primary"><Plus size={16} /> Novo painel</Link> : undefined} />
      ) : (
        <>
          {quantos >= BUSCA_A_PARTIR_DE && (
            <label className="relative block max-w-sm mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input className="input pl-9" id="paineis-busca" placeholder="Procurar painel…" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
            </label>
          )}
          {resumo.isError && <p className="text-bad text-[13px] mb-2" role="alert">Não consegui ler os números dos painéis: {mensagemErro(resumo.error)}</p>}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" id="paineis" aria-label="Painéis de chamados">
            {paineis.map((p) => (
              <li key={p.id} className="min-w-0"><CartaoDoPainel p={p} r={porPainel.get(p.id)} carregando={resumo.isLoading} cuidar={pode.cuidar} /></li>
            ))}
            {pode.cuidar && !busca && (
              <li className="min-w-0">
                <Link to="/atendimento/ajustes?aba=paineis&novo=1" id="paineis-novo"
                  className="h-full min-h-[180px] rounded-xl border-2 border-dashed border-line-strong text-muted hover:text-ink hover:border-accent hover:bg-surface flex flex-col items-center justify-center gap-1.5 p-4 text-center transition-colors">
                  <Plus size={22} aria-hidden />
                  <span className="font-semibold text-[14px]">Novo painel</span>
                  <span className="text-[12.5px]">Interno, Comercial, Administrativo… cada um com as suas etapas e regras</span>
                </Link>
              </li>
            )}
          </ul>
          {busca && !paineis.length && <p className="text-[13px] text-muted mt-2">Nenhum painel com “{busca}”.</p>}
        </>
      )}
    </div>
  );
}

function CartaoDoPainel({ p, r, carregando, cuidar }: { p: Painel; r: ResumoDoPainel | undefined; carregando: boolean; cuidar: boolean }) {
  const nav = useNavigate();
  const quadro = `/atendimento/quadro?painel=${encodeURIComponent(p.id)}`;
  // o mouse parado no Abrir o quadro já lê o quadro (2.1.2)
  const lerOQuadro = useLerOQuadroAntes();
  const lista = (extra: Record<string, string> = {}) => `/atendimento/lista?${new URLSearchParams({ painel: p.id, ...extra })}`;
  const etapas = p.etapas.filter((e) => e.tipo !== 'fechado');
  const naEtapa = new Map((r?.porEtapa ?? []).map((x) => [x.etapaId, x.total]));
  // o cartão inteiro abre o quadro; os links e botões de dentro fazem o que dizem
  const abrir = (e: MouseEvent<HTMLElement>) => { if (!(e.target as HTMLElement).closest('a, button')) nav(quadro); };
  return (
    <article className={`card p-4 h-full flex flex-col gap-3 cursor-pointer transition-colors hover:border-line-strong ${p.ativo ? '' : 'opacity-70'}`}
      onClick={abrir} data-painel={p.sigla} aria-labelledby={`painel-${p.id}`}>
      <header className="flex items-start gap-3 min-w-0">
        <span className={`shrink-0 w-11 h-11 rounded-lg flex items-center justify-center font-mono font-semibold text-[13px] ${SIGLA_DO_PAINEL[p.cor] ?? SIGLA_DO_PAINEL.neutral}`} aria-hidden>{p.sigla}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-semibold text-[16px] leading-snug flex items-center gap-2 flex-wrap" id={`painel-${p.id}`}>
            <Link to={quadro} className="hover:text-accent">{p.nome}</Link>
            {!p.ativo && <Chip tone="muted">desativado</Chip>}
            {p.acesso === 'escolhidos' && <Chip tone="neutral" title="Só as pessoas escolhidas (e quem cuida dos chamados) veem este painel"><Lock size={11} aria-hidden /> só os escolhidos</Chip>}
          </h2>
          {p.descricao && <p className="text-[12.5px] text-muted line-clamp-2 mt-0.5">{p.descricao}</p>}
        </div>
      </header>

      {p.tipo === 'vendas' ? <NumerosDaVenda p={p} r={r} carregando={carregando} lista={lista} /> : (
        <div className="grid grid-cols-4 gap-1.5">
          <Numero rotulo="Em aberto" valor={r?.abertos} carregando={carregando} para={lista()} titulo="Os chamados em aberto deste painel" />
          <Numero rotulo="Vencidos" valor={r?.vencidos} carregando={carregando} para={lista({ prazo: 'vencidos' })} tom={r?.vencidos ? 'bad' : undefined} titulo="Com a resposta ou a solução vencida" />
          <Numero rotulo="Sem dono" valor={r?.semDono} carregando={carregando} para={lista({ responsavel: 'ninguem' })} tom={r?.semDono ? 'signal' : undefined} titulo="Na fila, sem responsável" />
          <Numero rotulo="Meus" valor={r?.meus} carregando={carregando} para={lista({ responsavel: 'eu' })} titulo="Os seus em aberto" />
        </div>
      )}

      {etapas.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${p.tipo === 'vendas' ? 'Negociações' : 'Chamados'} por etapa em ${p.nome}`}>
          {etapas.map((e) => (
            <li key={e.id}>
              <Link to={lista({ etapa: e.id, situacao: 'todos' })} title={`Ver ${p.tipo === 'vendas' ? 'as negociações' : 'os chamados'} em ${e.nome}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 hover:bg-line px-2 py-0.5 text-[12px] text-ink-2">
                {e.nome}
                <span className="tnum font-semibold text-ink">{carregando ? '…' : naEtapa.get(e.id) ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-auto pt-2.5 border-t border-line flex items-center gap-2 flex-wrap">
        {/* o "mexido há…" saiu (o pedido do Luan na prévia: "não precisa"); o painel vazio ainda diz que está vazio */}
        {r && !r.ultimaAtividadeEm && <span className="text-[12px] text-muted">{p.tipo === 'vendas' ? 'nenhuma negociação ainda' : 'nenhum chamado ainda'}</span>}
        <div className="ml-auto flex items-center gap-1">
          {p.tipo === 'vendas' && (
            <Link to={enderecoDoRelatorio(p.id)} className="btn-ghost btn-sm" title="O relatório de vendas: os números do período e o funil">
              <ChartColumn size={15} aria-hidden /> Relatório
            </Link>
          )}
          {cuidar && (
            <Link to={`/atendimento/ajustes?aba=paineis&editar=${encodeURIComponent(p.id)}`} className="btn-ghost btn-sm" title="As etapas, as regras e quem vê este painel">
              <Settings2 size={15} aria-hidden /> Configurar
            </Link>
          )}
          <Link to={quadro} className="btn-primary btn-sm" {...lerOQuadro(p.ativo ? p.id : null)}>Abrir o quadro <ArrowRight size={14} aria-hidden /></Link>
        </div>
      </footer>
    </article>
  );
}

/** Um número do painel: clicar abre a lista já filtrada (o número escrito, nunca só a cor). */
function Numero({ rotulo, valor, carregando, para, tom, titulo, sub }: {
  rotulo: string; valor: ReactNode | undefined; carregando: boolean; para: string; tom?: 'bad' | 'signal' | 'ok'; titulo: string; sub?: ReactNode;
}) {
  const cor = tom === 'bad' ? 'text-bad' : tom === 'signal' ? 'text-signal' : tom === 'ok' ? 'text-ok' : 'text-ink';
  return (
    <Link to={para} title={titulo} className="rounded-lg bg-surface-2 hover:bg-line px-2 py-1.5 min-w-0">
      <span className={`block font-display text-[20px] font-semibold tnum leading-tight truncate ${cor}`}>{carregando ? '…' : valor ?? 0}</span>
      <span className="block text-[11.5px] text-muted truncate">{rotulo}</span>
      {sub && !carregando && <span className="block text-[11px] text-muted truncate">{sub}</span>}
    </Link>
  );
}

/**
 * Os números do painel de Vendas: o que está em negociação (e quantas), o ganho do mês (com a meta, numa
 * barra), o que está sem dono e as suas (como no cartão dos chamados).
 */
function NumerosDaVenda({ p, r, carregando, lista }: { p: Painel; r: ResumoDoPainel | undefined; carregando: boolean; lista: (extra?: Record<string, string>) => string }) {
  const v = r?.vendas;
  const meta = v?.metaMensal ?? null;
  const parte = meta ? Math.min(100, Math.round(((v?.ganhoNoMes ?? 0) / meta) * 100)) : 0;
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  return (
    <div className="flex flex-col gap-2" data-vendas>
      <div className="grid grid-cols-2 gap-1.5">
        <Numero rotulo="Em negociação" valor={v ? reaisInteiros(v.emAndamento) : undefined} carregando={carregando} para={lista()} titulo="A soma das mensalidades das negociações abertas (a ativação não soma)"
          sub={v ? plural(v.emAndamentoQtd, 'aberta', 'abertas') : undefined} />
        <Numero rotulo="Ganho no mês" valor={v ? reaisInteiros(v.ganhoNoMes) : undefined} carregando={carregando} para={enderecoDoRelatorio(p.id)} tom={v?.ganhoNoMes ? 'ok' : undefined}
          titulo="As mensalidades ganhas neste mês (pelo dia em que fechou; a ativação não soma)" sub={v ? `${plural(v.ganhosNoMes, 'ganha', 'ganhas')}, ${plural(v.perdidosNoMes, 'perdida', 'perdidas')}` : undefined} />
        <Numero rotulo="Sem dono" valor={r?.semDono} carregando={carregando} para={lista({ responsavel: 'ninguem' })} tom={r?.semDono ? 'signal' : undefined} titulo="Negociações sem responsável" />
        <Numero rotulo="Minhas" valor={r?.meus} carregando={carregando} para={lista({ responsavel: 'eu' })} titulo="As suas em aberto" />
      </div>
      {meta !== null && v && (
        <div title={`Ganho no mês: ${reaisInteiros(v.ganhoNoMes)} de ${reaisInteiros(meta)}`}>
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="text-muted">Meta do mês: <b className="text-ink-2 tnum">{reaisInteiros(meta)}</b></span>
            <span className={`tnum font-semibold ${parte >= 100 ? 'text-ok' : 'text-ink-2'}`}>{Math.round(((v.ganhoNoMes) / meta) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 mt-1 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={parte} aria-label="O ganho do mês contra a meta">
            <div className="h-full rounded-full bg-ok" style={{ width: `${parte}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
