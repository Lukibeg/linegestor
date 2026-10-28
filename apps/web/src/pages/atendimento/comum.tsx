/**
 * As peças comuns das telas dos chamados do Gestor (Patch 2.0, decisão 0047): o cabeçalho do
 * módulo (Painéis · Meu dia · Ajustes), o código do chamado, a prioridade, o selo do prazo,
 * a marca de espera, o responsável e o cartão do chamado (o mesmo no quadro e no Meu dia).
 *
 * As contas (o prazo em palavras, a prioridade sugerida, o que falta) vêm do `@gestor/shared` — as
 * mesmas do servidor e da prévia.
 */
import { useCallback, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate, type LinkProps, type Location } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Hourglass, Layers, MessageSquare, Plus, RotateCcw, Siren, ThumbsDown, TriangleAlert, Trophy, X } from 'lucide-react';
import {
  CORES_ETIQUETA, NOME_COR_ETIQUETA, NOME_ESPERA, NOME_PRIORIDADE, NOME_SITUACAO_CHAMADO, corDaEtiqueta, etiquetasDoPainel, paraBusca, reaisInteiros, telefoneLegivel, textoDoPrazo,
  type CartaoChamado, type CorEtiqueta, type CorPainel, type EstadoPrazo, type FichaChamado, type OpcoesAtendimento, type Painel, type Prioridade, type ResultadoDaVenda,
  type TipoEspera, caminhoDoAssunto, emOrdemDeArvore, type Assunto,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { useAuth } from '../../lib/auth.js';
import { Chip, classeAba, useToast, type OpcaoBusca, type TomChip } from '../../components/ui/index.js';

// =====================================================================
//  OS DADOS DO MÓDULO
// =====================================================================

/** Os painéis, as pessoas, os assuntos, os prazos… (uma leitura só para o módulo inteiro). */
export function useOpcoes() {
  return useQuery<OpcoesAtendimento>({ queryKey: ['atendimento', 'opcoes'], queryFn: () => api.atendimento.opcoes(), staleTime: 60_000 });
}

export const chaveDaFicha = (ref: string) => ['atendimento', 'chamado', ref.toUpperCase()];

/**
 * Incluir uma opção numa lista do painel ali mesmo, sem ir aos Ajustes (2.0.3, a Indicação: "eu tenho que
 * conseguir criar por aqui mesmo se quiser") — só nas listas marcadas para isso. Devolve o id da opção nova,
 * depois de as opções do módulo serem relidas (a caixa já mostra o nome dela).
 */
export function useIncluirOpcao() {
  const qc = useQueryClient();
  return async (campoId: string, nome: string): Promise<string> => {
    const o = await api.atendimento.incluirOpcaoDoCampo(campoId, { nome });
    await qc.invalidateQueries({ queryKey: ['atendimento', 'opcoes'] });
    return o.id;
  };
}

/** A ficha de um chamado (pelo código ou pelo id). */
export function useFicha(ref: string | undefined) {
  return useQuery<FichaChamado>({ queryKey: chaveDaFicha(ref ?? ''), queryFn: () => api.atendimento.chamado(ref!), enabled: !!ref, staleTime: FICHA_FRESCA });
}
const FICHA_FRESCA = 15_000;

/** Quanto o mouse fica parado em cima antes de começar a ler (passar o mouse varrendo a tela não lê nada). */
const INTENCAO_MS = 90;
type AoPassar = {
  onPointerEnter: (e: ReactPointerEvent) => void; onPointerLeave: () => void; onPointerDown: (e: ReactPointerEvent) => void; onFocus: () => void;
};
/**
 * Ler antes do clique (2.1.2, "ta demorando muito pra abrir os cards e os paineis"): o mouse parado em cima (ou o
 * dedo encostando, ou o Tab chegando) já começa a buscar. Até o clique, a resposta quase sempre já chegou, e a
 * janela abre pronta. Devolve os eventos para pôr no elemento; `ler` é a busca (a do cache, se já está fresca).
 */
function useAoPassar(ler: (alvo: string) => void): (alvo: string | null | undefined) => Partial<AoPassar> {
  const espera = useRef<number>();
  const lerAgora = useRef(ler);
  lerAgora.current = ler;
  useEffect(() => () => window.clearTimeout(espera.current), []);
  return useMemo(() => (alvo): Partial<AoPassar> => {
    if (!alvo) return {};
    return {
      onPointerEnter: (e) => {
        if (e.pointerType !== 'mouse') return;
        window.clearTimeout(espera.current);
        espera.current = window.setTimeout(() => lerAgora.current(alvo), INTENCAO_MS);
      },
      onPointerLeave: () => window.clearTimeout(espera.current),
      // o pé do cartão (o Mover) não abre a ficha: lá, não precisa ler
      onPointerDown: (e) => { if (!(e.target as HTMLElement | null)?.closest?.('[data-sem-abrir]')) lerAgora.current(alvo); },
      onFocus: () => lerAgora.current(alvo),
    };
  }, []);
}

/** A ficha lida antes do clique no cartão, na linha da lista… (pelo código do chamado). */
export function useLerAFichaAntes() {
  const qc = useQueryClient();
  return useAoPassar(useCallback((codigo: string) => {
    void qc.prefetchQuery({ queryKey: chaveDaFicha(codigo), queryFn: () => api.atendimento.chamado(codigo), staleTime: FICHA_FRESCA });
  }, [qc]));
}

/** O quadro de um painel lido antes do clique (o Abrir o quadro, o menu): a mesma consulta do quadro sem filtros. */
export function useLerOQuadroAntes() {
  const qc = useQueryClient();
  return useAoPassar(useCallback((painelId: string) => {
    void qc.prefetchQuery({ queryKey: ['atendimento', 'quadro', painelId, {}], queryFn: () => api.atendimento.quadro({ painel: painelId }) });
  }, [qc]));
}

/**
 * Depois de mudar um chamado: a ficha nova entra no lugar da antiga (pelo código e pelo id) e o
 * quadro, a lista e o Meu dia releem. Devolve a função que embrulha a chamada.
 */
export function useDepoisDeMudar() {
  const qc = useQueryClient();
  const toast = useToast();
  return useCallback(async <T,>(promessa: Promise<T>, ok?: string): Promise<T> => {
    const r = await promessa;
    const f = r as unknown as FichaChamado | undefined;
    if (f && typeof f === 'object' && 'codigo' in f && 'historico' in f) {
      qc.setQueryData(chaveDaFicha(f.codigo), f);
      qc.setQueryData(chaveDaFicha(f.id), f);
    }
    for (const k of ['quadro', 'lista', 'meu-dia', 'opcoes', 'avisos']) void qc.invalidateQueries({ queryKey: ['atendimento', k] });
    if (ok) toast.push('ok', ok);
    return r;
  }, [qc, toast]);
}

/** O que a pessoa pode fazer no módulo. Ver: os chamados (os painéis de Gestão) ou o Comercial (os de Vendas, 2.0.1). */
export function usePode() {
  const { can } = useAuth();
  return { ver: can('support.read') || can('sales.read'), trabalhar: can('tickets.work'), cuidar: can('tickets.manage'), integrar: can('admin.manage') };
}

// =====================================================================
//  ABRIR O CHAMADO: NUMA JANELA GRANDE, POR CIMA DA TELA
// =====================================================================

/** O endereço da ficha do chamado (o link direto, que abre a ficha em página inteira). */
export const enderecoDoChamado = (codigo: string) => `/atendimento/${encodeURIComponent(codigo)}`;
/** As telas do módulo: o resto de /atendimento/… é o código de um chamado. */
const TELAS_DO_MODULO = new Set(['meu-dia', 'quadro', 'lista', 'relatorio', 'novo', 'ajustes']);
/** O endereço é a ficha de um chamado (/atendimento/SUP-12)? */
export function ehFichaDoChamado(pathname: string): boolean {
  const m = /^\/atendimento\/([^/]+)\/?$/.exec(pathname);
  if (!m) return false;
  try { return !TELAS_DO_MODULO.has(decodeURIComponent(m[1]!)); } catch { return false; }
}
/**
 * O endereço do Abrir chamado. Pelo botão do alto das telas, abre numa janela por cima da tela (o
 * pedido do Luan na prévia); pelo link direto (o botão da conversa do LineChat, numa aba nova), na
 * página inteira.
 */
export const ENDERECO_ABRIR = '/atendimento/novo';
export const ehAbrirChamado = (pathname: string) => /^\/atendimento\/novo\/?$/.test(pathname);
/** O estado da navegação que leva junto a tela de baixo da janela (a ficha, o Abrir chamado). */
export type ComFundo = { fundo?: Location };
/** A tela que fica embaixo da janela — só quando o endereço é mesmo o de uma janela (a ficha de um chamado, o Abrir chamado). */
export function fundoDaJanela(location: Location): Location | null {
  const fundo = (location.state as ComFundo | null)?.fundo;
  return fundo && (ehFichaDoChamado(location.pathname) || ehAbrirChamado(location.pathname)) ? fundo : null;
}
/**
 * Fechar a janela por cima da tela: ela entrou no histórico por cima da tela, e voltar um passo é
 * voltar para ela; aberta sem esse passo (o endereço recarregado numa aba nova), troca pela tela.
 */
export function useFecharJanela() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    const passo = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    const fundo = fundoDaJanela(location);
    if (passo > 0) navigate(-1);
    else if (fundo) navigate(`${fundo.pathname}${fundo.search}${fundo.hash}`, { replace: true, state: fundo.state });
  }, [navigate, location]);
}

/**
 * Para onde vai o clique num chamado — o pedido do Luan na prévia: "prefiro que ele abra como pop-up
 * central ocupando boa parte da tela, porém não direcionando para outra tela".
 *  - de qualquer tela: a janela grande por cima, com a tela de baixo do jeito que estava (o quadro
 *    com os filtros, a lista na mesma página);
 *  - dentro da janela (a de um chamado ou a do Abrir chamado): troca o que a janela mostra, com a mesma tela
 *    embaixo; desde o 2.2 o chamado novo entra no histórico por cima do outro (o Luan: "se eu clicar em um chamado
 *    para visualizar ele e clicar no x novamente pra voltar, ele vai pra tela inicial do painel e n voltar pra o
 *    chamado que eu vi primeiro"): o X e o Voltar voltam para o chamado de antes, e dele para a tela;
 *  - na ficha aberta pelo link direto (página inteira): continua página.
 */
export function useIrParaOChamado(): { state?: ComFundo; replace?: boolean } {
  const location = useLocation();
  return useMemo(() => {
    const fundo = fundoDaJanela(location);
    if (fundo) return { state: { fundo } };
    if (ehFichaDoChamado(location.pathname)) return {};
    return { state: { fundo: location } };
  }, [location]);
}
/**
 * Abrir o chamado por código (o clique no cartão, no aviso do sininho, no desenho das ligações). `noLugar`: a janela
 * troca de vez pelo chamado (o Abrir chamado que acabou de criar: fechar a ficha nova volta para a tela, e não para o
 * formulário já usado).
 */
export function useAbrirChamado(o: { noLugar?: boolean } = {}) {
  const navigate = useNavigate();
  const ir = useIrParaOChamado();
  const noLugar = !!o.noLugar;
  return useCallback((codigo: string) => navigate(enderecoDoChamado(codigo), noLugar && ir.state ? { ...ir, replace: true } : ir), [navigate, ir, noLugar]);
}
/** O link de um chamado: abre na janela grande (as mesmas regras do `useIrParaOChamado`). */
export function LinkDoChamado({ codigo, ...props }: Omit<LinkProps, 'to' | 'state' | 'replace'> & { codigo: string }) {
  const ir = useIrParaOChamado();
  return <Link to={enderecoDoChamado(codigo)} state={ir.state} replace={ir.replace} {...props} />;
}

export const painelDe = (opcoes: OpcoesAtendimento | undefined, id: string | null | undefined): Painel | undefined => opcoes?.paineis.find((p) => p.id === id);

/**
 * Os assuntos para escolher no chamado, em pastas (2.2, o Luan: "Operadora e operadora vc1 aqui deveria ser apenas para
 * facilitar a visualização e n ser uma opção, ele poderia fazer como se fossem pastas"): o assunto que tem outros dentro
 * vira o título do grupo e não se escolhe; escolhe-se o de dentro. `lista`: os que aparecem (os ativos do painel e o de
 * agora); `todos`: para escrever o caminho inteiro. O de agora que é uma pasta (escolhido antes do 2.2) continua escrito
 * na caixa. Nos filtros (o quadro, a lista), a pasta continua escolhível: filtra ela e o que está dentro.
 */
export function assuntosEmPastas(lista: Assunto[], todos: Assunto[]): OpcaoBusca[] {
  const comFilho = new Set(lista.map((a) => a.paiId).filter((x): x is string => !!x));
  return emOrdemDeArvore(lista).map((a) => ({
    id: a.id, nome: caminhoDoAssunto(a.id, todos), rotulo: a.nome, nivel: a.profundidade - 1,
    pasta: comFilho.has(a.id), dica: comFilho.has(a.id) ? undefined : a.descricao ?? undefined,
  }));
}
/** O painel é de Vendas (2.0.1, decisão 0050)? A negociação tem o valor, o Ganho e o Perdido no lugar do prazo e dos níveis. */
export const ehDeVendas = (opcoes: OpcoesAtendimento | undefined, painelId: string | null | undefined) => painelDe(opcoes, painelId)?.tipo === 'vendas';
export const etapaDe = (opcoes: OpcoesAtendimento | undefined, painelId: string, etapaId: string) => painelDe(opcoes, painelId)?.etapas.find((e) => e.id === etapaId);

// =====================================================================
//  O CABEÇALHO DO MÓDULO
// =====================================================================

/**
 * As abas do módulo. A primeira são Todos os painéis (a tela inicial, como no Helena): o quadro e a lista
 * de cada painel se abrem por ela, e a aba continua marcada lá dentro. A lista não é aba: mora dentro
 * do painel (Quadro | Lista), o pedido do Luan na prévia. O módulo se chama **Painéis** (2.0.1: "isso
 * aqui n é chamados, é paineis" — o Comercial também mora aqui), e a aba, **Todos**.
 */
const ABAS: Array<{ to: string; label: string; fim?: boolean; so?: 'cuidar'; tambem?: string[] }> = [
  { to: '/atendimento', label: 'Todos', fim: true, tambem: ['/atendimento/quadro', '/atendimento/lista', '/atendimento/relatorio'] },
  { to: '/atendimento/meu-dia', label: 'Meu dia' },
  { to: '/atendimento/ajustes', label: 'Ajustes', so: 'cuidar' },
];

/**
 * O alto das telas do módulo, numa linha só: o nome, as abas e as ações (o pedido do Luan na prévia:
 * o alto ficava comprido e tomava o espaço dos cartões). No celular, as abas descem para a linha de
 * baixo. O `sub` (uma frase curta, como a do Meu dia) vem embaixo, só onde diz algo.
 *
 * `painelId`: a tela é de um painel (o quadro, a lista do painel). O "Abrir chamado" abre já nele, sem
 * escolher outro (o pedido do Luan na prévia: "se eu estou dentro do painel de suporte, quero abrir no
 * painel de suporte").
 *
 * O "Abrir chamado" abre numa janela por cima da tela, que fica como estava (o pedido do Luan na
 * prévia, em 14/10: "o abrir chamado tem que ser como pop up e não a tela toda"). Na página inteira do
 * Abrir chamado (o link direto), o botão recomeça o formulário ali mesmo.
 */
export function CabecalhoAtendimento({ sub, acoes, painelId }: { sub?: ReactNode; acoes?: ReactNode; painelId?: string }) {
  const pode = usePode();
  const opcoes = useOpcoes();
  // no painel de Vendas (o Comercial), o botão do alto cria a negociação; o resto é o dos chamados
  // (o Comercial é um painel como o Suporte e o DEV, 17/10)
  const vendas = ehDeVendas(opcoes.data, painelId);
  const location = useLocation();
  const { pathname } = location;
  const abrir = painelId ? `${ENDERECO_ABRIR}?painel=${encodeURIComponent(painelId)}` : ENDERECO_ABRIR;
  const janela: ComFundo | undefined = ehAbrirChamado(pathname) ? undefined : { fundo: location };
  return (
    <div className="mb-3" id="cabecalho-chamados">
      <div className="flex flex-wrap items-center gap-x-4 shadow-[inset_0_-1px_0_var(--line)]">
        <h1 className="font-display text-xl font-semibold py-1.5">Painéis</h1>
        <nav className="order-last basis-full sm:order-none sm:basis-auto self-stretch flex items-end gap-1 overflow-x-auto overflow-y-hidden sem-barra" aria-label="Partes dos painéis">
          {ABAS.filter((a) => !a.so || pode.cuidar || pode.integrar).map((a) => (
            <NavLink key={a.to} to={a.to} end={a.fim} className={({ isActive }) => classeAba(isActive || !!a.tambem?.some((t) => pathname.startsWith(t)))}>{a.label}</NavLink>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2 py-1.5">
          {acoes}
          {pode.trabalhar && <Link to={abrir} state={janela} className="btn-primary" id="cabecalho-abrir-chamado"><Plus size={16} /> {vendas ? 'Nova negociação' : 'Abrir chamado'}</Link>}
        </div>
      </div>
      {sub && <div className="text-muted text-[13px] mt-2">{sub}</div>}
    </div>
  );
}

// =====================================================================
//  AS PEÇAS
// =====================================================================

/** A cor do painel nos chips (os mesmos tons do sistema). */
export const TOM_DO_PAINEL: Record<CorPainel, TomChip> = {
  accent: 'accent', roxo: 'roxo', turquesa: 'turquesa', signal: 'signal', ok: 'ok', rosa: 'rosa', amarelo: 'amarelo', neutral: 'neutral',
};

/** O código do chamado (SUP-12), na cor do painel; com `link`, abre a ficha. */
export function CodigoChamado({ codigo, cor = 'accent', link = true, className = '' }: { codigo: string; cor?: CorPainel; link?: boolean; className?: string }) {
  const chip = <Chip tone={TOM_DO_PAINEL[cor] ?? 'accent'} className={`font-mono tracking-tight ${className}`}>{codigo}</Chip>;
  if (!link) return chip;
  return <LinkDoChamado codigo={codigo} className="hover:opacity-80" onClick={(e) => e.stopPropagation()}>{chip}</LinkDoChamado>;
}

/** A cor de cada prioridade: Crítica vermelha, Alta laranja, Média amarela, Baixa neutra. */
export const TOM_PRIORIDADE: Record<Prioridade, TomChip> = { critica: 'bad', alta: 'signal', media: 'amarelo', baixa: 'neutral' };
export function ChipPrioridade({ p, curta = false }: { p: Prioridade | null; curta?: boolean }) {
  if (!p) return curta ? null : <span className="text-muted text-[12.5px]">sem prioridade</span>;
  return (
    <Chip tone={TOM_PRIORIDADE[p]} title={`Prioridade ${NOME_PRIORIDADE[p]}`}>
      {p === 'critica' && <Siren size={12} />}{NOME_PRIORIDADE[p]}
    </Chip>
  );
}

const TOM_SITUACAO: Record<CartaoChamado['situacao'], TomChip> = { aberto: 'accent', resolvido: 'ok', fechado: 'muted' };
export function ChipSituacao({ s }: { s: CartaoChamado['situacao'] }) {
  return <Chip tone={TOM_SITUACAO[s]}>{NOME_SITUACAO_CHAMADO[s]}</Chip>;
}

/** A marca "esperando o cliente / a operadora" (o prazo para só no cliente). */
export function ChipEspera({ e, mostrarDesde = false }: { e: { tipo: TipoEspera; motivo: string | null; desde?: string } | null; mostrarDesde?: boolean }) {
  if (!e) return null;
  return (
    <Chip tone={e.tipo === 'cliente' ? 'turquesa' : 'roxo'} title={`${NOME_ESPERA[e.tipo]}${e.motivo ? `: ${e.motivo}` : ''}`}>
      <Hourglass size={12} /> {NOME_ESPERA[e.tipo]}{mostrarDesde && e.desde ? ` desde ${dataHoraCurta(e.desde)}` : ''}
    </Chip>
  );
}

/** Como a negociação acabou: Ganho ou Perdido (com o motivo ao passar o mouse) e, se vier, o dia. */
export function ChipResultado({ r, motivo, em }: { r: ResultadoDaVenda | null; motivo?: string | null; em?: string | null }) {
  if (!r) return null;
  const dia = em ? ` ${dataCurta(em).slice(0, 5)}` : '';
  const quando = em ? ` em ${dataCurta(em)}` : '';
  return r === 'ganho'
    ? <Chip tone="ok" title={`Negociação ganha${quando}`}><Trophy size={12} aria-hidden /> Ganho{dia}</Chip>
    : <Chip tone="bad" title={`Negociação perdida${quando}${motivo ? `: ${motivo}` : ''}`}><ThumbsDown size={12} aria-hidden /> Perdido{dia}</Chip>;
}

const TOM_PRAZO: Record<EstadoPrazo['situacao'], TomChip> = { vencido: 'bad', perto: 'signal', no_prazo: 'neutral', pausado: 'muted', cumprido: 'ok', estourou: 'bad', sem: 'muted' };

/**
 * O selo do prazo: o mais urgente entre a primeira resposta (enquanto ninguém respondeu) e a
 * solução. Vencido em vermelho, perto de vencer em laranja, parado em cinza.
 */
export function SeloPrazo({ c, completo = false }: { c: Pick<CartaoChamado, 'prazos' | 'situacao'>; completo?: boolean }) {
  const { resposta, solucao } = c.prazos;
  if (c.situacao === 'fechado' && !completo) return null;
  const pendente = resposta.situacao !== 'cumprido' && resposta.situacao !== 'estourou' && resposta.situacao !== 'sem';
  const peso = (e: EstadoPrazo) => ({ vencido: 0, perto: 1, no_prazo: 2, pausado: 3, estourou: 4, cumprido: 5, sem: 6 }[e.situacao]);
  const qual = pendente && peso(resposta) <= peso(solucao) ? { nome: 'Resposta', e: resposta } : { nome: 'Solução', e: solucao };
  if (qual.e.situacao === 'sem') return null;
  const icone = qual.e.situacao === 'vencido' ? <TriangleAlert size={12} /> : qual.e.situacao === 'pausado' ? <Hourglass size={12} /> : null;
  return (
    <Chip tone={TOM_PRAZO[qual.e.situacao]} title={`${qual.nome}: ${textoDoPrazo(qual.e)}`}>
      {icone}{completo ? `${qual.nome}: ${textoDoPrazo(qual.e)}` : textoCurtoDoPrazo(qual.e)}
    </Chip>
  );
}

/** "Vencido", "2 h", "Parado"… — cabe no cartão do quadro. */
export function textoCurtoDoPrazo(e: EstadoPrazo): string {
  const falta = Math.max(0, e.limite - e.usado);
  const fmt = (m: number) => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(Math.round(m % 60)).padStart(2, '0')}` : ''}`);
  switch (e.situacao) {
    case 'vencido': return `Venceu há ${fmt(e.usado - e.limite)}`;
    case 'pausado': return 'Parado';
    case 'cumprido': return 'No prazo';
    case 'estourou': return 'Fora do prazo';
    case 'perto': case 'no_prazo': return `Faltam ${fmt(falta)}`;
    default: return '';
  }
}

/** As iniciais da pessoa num círculo (o responsável no cartão). */
export function Avatar({ nome, tamanho = 24, title }: { nome: string; tamanho?: number; title?: string }) {
  const iniciais = nome.replace(/[^\p{L} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
  return (
    <span title={title ?? nome} aria-label={title ?? nome} role="img" style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho / 2.3) }}
      className="inline-flex items-center justify-center rounded-full bg-accent-soft text-accent-ink font-semibold shrink-0 select-none">
      {iniciais}
    </span>
  );
}

// ---------- as etiquetas, com a cor ----------

/** O tom do chip de cada cor de etiqueta (o cinza é o discreto de antes). */
export const TOM_DA_ETIQUETA: Record<CorEtiqueta, TomChip> = {
  neutral: 'muted', accent: 'accent', roxo: 'roxo', turquesa: 'turquesa', ok: 'ok', amarelo: 'amarelo', signal: 'signal', bad: 'bad', rosa: 'rosa',
};
/** A amostra cheia de cada cor (a bolinha; as classes escritas inteiras para o Tailwind achar). */
export const AMOSTRA_DA_COR: Record<CorEtiqueta, string> = {
  neutral: 'bg-muted', accent: 'bg-accent', roxo: 'bg-roxo', turquesa: 'bg-turquesa', ok: 'bg-ok', amarelo: 'bg-amarelo', signal: 'bg-signal', bad: 'bg-bad', rosa: 'bg-rosa',
};

/** Uma etiqueta inteira (nada de nome cortado), na cor dela; com `onTirar`, o × que tira. */
export function ChipDaEtiqueta({ nome, cor, onTirar, desligado = false }: { nome: string; cor: CorEtiqueta; onTirar?: () => void; desligado?: boolean }) {
  return (
    // o formato de etiqueta (redonda, com a bolinha da cor) não se confunde com a prioridade e o prazo do cartão
    <Chip tone={TOM_DA_ETIQUETA[cor]} className="font-medium max-w-full rounded-full pl-1.5" title={`Etiqueta ${nome} (${NOME_COR_ETIQUETA[cor].toLowerCase()})`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${AMOSTRA_DA_COR[cor]}`} aria-hidden />
      <span className="break-words" data-etiqueta={nome} data-cor={cor}>{nome}</span>
      {onTirar && (
        <button type="button" onClick={onTirar} disabled={desligado} aria-label={`Tirar a etiqueta ${nome}`} className="-mr-0.5 opacity-70 hover:opacity-100 disabled:opacity-40">
          <X size={12} />
        </button>
      )}
    </Chip>
  );
}

/** As etiquetas do chamado (o cartão do quadro, o Meu dia), cada uma na cor dela — a do painel do chamado (2.0.3). */
export function Etiquetas({ lista, painelId }: { lista: string[]; painelId: string }) {
  const op = useOpcoes();
  if (!lista.length) return null;
  const cores = etiquetasDoPainel(op.data?.etiquetas ?? [], painelId);
  return <span className="inline-flex flex-wrap gap-1">{lista.map((e) => <ChipDaEtiqueta key={e} nome={e} cor={corDaEtiqueta(cores, e)} />)}</span>;
}

/**
 * A escolha da cor de uma etiqueta: uma bolinha por cor (o nome aparece ao passar o mouse e para o
 * leitor de tela). `manterFoco`: o clique não tira o foco do campo onde se escreve a etiqueta.
 */
export function CoresDaEtiqueta({ valor, onChange, rotulo = 'Cor da etiqueta', id, manterFoco = false, desligado = false }: {
  valor: CorEtiqueta; onChange: (c: CorEtiqueta) => void; rotulo?: string; id?: string; manterFoco?: boolean; desligado?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-0.5" role="radiogroup" aria-label={rotulo} id={id}>
      {CORES_ETIQUETA.map((c) => {
        const ativa = valor === c;
        return (
          <button key={c} type="button" role="radio" aria-checked={ativa} aria-label={NOME_COR_ETIQUETA[c]} title={NOME_COR_ETIQUETA[c]} data-cor={c} disabled={desligado}
            onMouseDown={manterFoco ? (e) => e.preventDefault() : undefined} onClick={() => onChange(c)}
            className={`w-7 h-7 rounded-full grid place-items-center border-2 transition-colors disabled:opacity-50 ${ativa ? 'border-ink' : 'border-transparent hover:border-line-strong'}`}>
            <span className={`w-[18px] h-[18px] rounded-full ${AMOSTRA_DA_COR[c]}`} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

// ---------- datas ----------

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
// criado uma vez só (2.1.2): criar um formatador com fuso é caro, e o cartão do quadro pedia quatro a cada
// desenho — com 60 cartões, 50 a 80 ms toda vez que o quadro se redesenhava ("ta demorando muito pra abrir os cards")
const fmtDiaBrasil = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
const diaBrasil = (d: Date) => fmtDiaBrasil.format(d);

/** "hoje 14:32", "ontem 09:10", "08/10 17:45". */
export function dataHoraCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86_400_000);
  if (diaBrasil(d) === diaBrasil(hoje)) return `hoje ${fmtHora.format(d)}`;
  if (diaBrasil(d) === diaBrasil(ontem)) return `ontem ${fmtHora.format(d)}`;
  return fmtDataHora.format(d).replace(',', '');
}
export const dataCurta = (iso: string | null | undefined) => (iso ? fmtData.format(new Date(iso)) : '—');

/** "há 5 min", "há 3 h", "há 2 dias". */
export function haQuanto(iso: string | null | undefined): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/** "(71) 99999-0000" a partir de "5571999990000" (mora no @gestor/shared desde o 2.0: a aba Contatos do cliente também usa). */
export { telefoneLegivel };

// =====================================================================
//  O CARTÃO DO CHAMADO (o quadro e o Meu dia)
// =====================================================================

/**
 * O chamado num cartão: o código, a prioridade e o prazo em cima; o título; a empresa em destaque e
 * o contato (o pedido do Eider, com o nome do contato que o Luan pediu); o assunto; quem está com ele.
 */
export function CartaoDoChamado({ c, cor, mostrarEtapa, nomeDaEtapa, arrastavel = false }: { c: CartaoChamado; cor?: CorPainel; mostrarEtapa?: boolean; nomeDaEtapa?: string; arrastavel?: boolean }) {
  const opcoes = useOpcoes();
  if (ehDeVendas(opcoes.data, c.painelId)) return <CartaoDaNegociacao c={c} cor={cor} mostrarEtapa={mostrarEtapa} nomeDaEtapa={nomeDaEtapa} arrastavel={arrastavel} />;
  return (
    <div className={`card p-2.5 text-[13px] leading-snug flex flex-col gap-1 ${c.prazos.solucao.situacao === 'vencido' || c.prazos.resposta.situacao === 'vencido' ? 'border-l-4 border-l-bad' : c.prioridade === 'critica' ? 'border-l-4 border-l-signal' : ''} ${arrastavel ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <CodigoChamado codigo={c.codigo} cor={cor} />
        {c.tipoChamado === 'problema' && <Chip tone="rosa" title="Problema: junta incidentes de várias empresas"><Layers size={12} /> Problema</Chip>}
        <ChipPrioridade p={c.prioridade} curta />
        <span className="ml-auto"><SeloPrazo c={c} /></span>
      </div>
      <LinkDoChamado codigo={c.codigo} className="font-semibold text-ink hover:text-accent line-clamp-2" onClick={(e) => e.stopPropagation()}>{c.titulo}</LinkDoChamado>
      {(c.cliente || c.contato) && (
        <div className="min-w-0">
          {c.cliente ? <div className="font-semibold text-ink-2 truncate">{c.cliente.nome}</div> : <div className="text-signal text-[12px] font-medium">sem cliente</div>}
          {c.contato && (c.contato.nome || c.contato.telefone) && <div className="text-muted text-[12px] truncate">{c.contato.nome ?? telefoneLegivel(c.contato.telefone)}</div>}
        </div>
      )}
      {c.assunto && <div className="text-[12px] text-muted truncate" title={c.assunto.caminho}>{c.assunto.caminho}</div>}
      <div className="flex items-center gap-1.5 flex-wrap">
        <ChipEspera e={c.espera} />
        {mostrarEtapa && nomeDaEtapa && <Chip tone="neutral">{nomeDaEtapa}</Chip>}
        {c.reaberto > 0 && <Chip tone="signal" title={`Reaberto ${c.reaberto} ${c.reaberto === 1 ? 'vez' : 'vezes'}`}><RotateCcw size={11} /> {c.reaberto}</Chip>}
        {c.filhos.total > 0 && <Chip tone="neutral" title={`${c.filhos.abertos} de ${c.filhos.total} filhos em aberto`}><GitBranch size={11} /> {c.filhos.abertos}/{c.filhos.total}</Chip>}
        {c.pai && <span className="text-[11.5px] text-muted">filho de <span className="font-mono">{c.pai.codigo}</span></span>}
        {c.problema && <span className="text-[11.5px] text-muted">incidente de <span className="font-mono">{c.problema.codigo}</span></span>}
        {c.anotacoes > 0 && <span className="text-[11.5px] text-muted inline-flex items-center gap-0.5" title={`${c.anotacoes} anotações`}><MessageSquare size={11} /> {c.anotacoes}</span>}
        <span className="ml-auto">{c.responsavel ? <Avatar nome={c.responsavel.nome} /> : <span className="text-[11.5px] text-muted italic">sem dono</span>}</span>
      </div>
      {c.etiquetas.length > 0 && <Etiquetas lista={c.etiquetas} painelId={c.painelId} />}
    </div>
  );
}

/**
 * A negociação num cartão (o painel de Vendas, 2.0.1): o código (e, quando acabou, o Ganho ou o Perdido)
 * em cima; a empresa, grande e em negrito, e embaixo dela o título numa linha só (o pedido do Luan, 2.0.3:
 * "essa descrição tem q ficar bem sucinta abaixo do nome do cliente que tem q ta em negrito e maior") — o título
 * que é o próprio nome da empresa (o título que ficou vazio) não se repete; o contato; o valor em destaque; quem
 * está com ela.
 */
function CartaoDaNegociacao({ c, cor, mostrarEtapa, nomeDaEtapa, arrastavel }: { c: CartaoChamado; cor?: CorPainel; mostrarEtapa?: boolean; nomeDaEtapa?: string; arrastavel: boolean }) {
  const empresa = c.cliente?.nome ?? c.empresa;
  return (
    <div className={`card p-2.5 text-[13px] leading-snug flex flex-col gap-1 ${arrastavel ? 'cursor-grab active:cursor-grabbing' : ''}`} data-negociacao>
      <div className="flex items-center gap-1.5 flex-wrap">
        <CodigoChamado codigo={c.codigo} cor={cor} />
        {c.resultado && <span className="ml-auto"><ChipResultado r={c.resultado} motivo={c.motivoPerda} em={c.fechadoEm} /></span>}
      </div>
      <div className="min-w-0">
        <LinkDoChamado codigo={c.codigo} className="block font-display font-bold text-[15px] leading-tight text-ink hover:text-accent line-clamp-2" onClick={(e) => e.stopPropagation()}
          title={empresa ? `${empresa} — ${c.cliente ? 'já é cliente' : 'ainda não é cliente'}` : undefined} data-empresa>
          {empresa ?? c.titulo}
        </LinkDoChamado>
        {empresa && paraBusca(c.titulo) !== paraBusca(empresa) && <div className="text-[12.5px] text-ink-2 truncate mt-0.5" title={c.titulo} data-titulo>{c.titulo}</div>}
        {!empresa && <div className="text-signal text-[12px] font-medium">sem empresa</div>}
        {c.contato && (c.contato.nome || c.contato.telefone) && <div className="text-muted text-[12px] truncate">{c.contato.nome ?? telefoneLegivel(c.contato.telefone)}</div>}
      </div>
      {/* o valor do cartão é a mensalidade (o que conta); a ativação fica na ficha */}
      <div className={c.valor === null ? 'text-[12px] text-muted' : 'font-display font-semibold text-[15px] tnum text-ink'} data-valor>
        {c.valor !== null ? <>{reaisInteiros(c.valor)}<span className="text-[11.5px] font-normal text-muted">/mês</span></> : 'sem valor'}
      </div>
      {c.resultado === 'perdido' && c.motivoPerda && <div className="text-[12px] text-muted truncate" title={`Motivo da perda: ${c.motivoPerda}`}>{c.motivoPerda}</div>}
      <div className="flex items-center gap-1.5 flex-wrap">
        <ChipEspera e={c.espera} />
        {mostrarEtapa && nomeDaEtapa && <Chip tone="neutral">{nomeDaEtapa}</Chip>}
        {c.reaberto > 0 && <Chip tone="signal" title={`Reaberta ${c.reaberto} ${c.reaberto === 1 ? 'vez' : 'vezes'}`}><RotateCcw size={11} /> {c.reaberto}</Chip>}
        {c.anotacoes > 0 && <span className="text-[11.5px] text-muted inline-flex items-center gap-0.5" title={`${c.anotacoes} anotações`}><MessageSquare size={11} /> {c.anotacoes}</span>}
        <span className="ml-auto">{c.responsavel ? <Avatar nome={c.responsavel.nome} /> : <span className="text-[11.5px] text-muted italic">sem dono</span>}</span>
      </div>
      {c.etiquetas.length > 0 && <Etiquetas lista={c.etiquetas} painelId={c.painelId} />}
    </div>
  );
}

/**
 * O valor no alto de uma coluna do gráfico, sem arredondar (2.1.2): "R$ 2.739,80" numa linha; no celular, onde a coluna
 * é estreita, o "R$" em cima e o número embaixo, para não encostar no da coluna do lado.
 */
export function ValorDaColuna({ centavos, className = '' }: { centavos: number; className?: string }) {
  const [moeda, ...resto] = reaisInteiros(centavos).split(/\s/);
  return (
    <span className={`flex flex-col sm:flex-row sm:gap-[0.25em] items-center tnum leading-tight whitespace-nowrap ${className}`}>
      <span>{moeda}</span><span>{resto.join(' ')}</span>
    </span>
  );
}
