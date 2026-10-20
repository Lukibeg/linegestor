/**
 * As peças da ficha do chamado (Patch 2.0, decisão 0047): o contexto da ficha aberta (o chamado, as
 * opções do módulo, o painel, quem está olhando), o jeito de rodar uma ação com o erro aparecendo
 * perto do botão que a causou, o menu que abre embaixo de um botão, a seção (cartão com título) e o
 * texto com os códigos citados virando link.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as TeclaReact, type ReactNode, type RefObject } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink } from 'lucide-react';
import {
  NOME_SITUACAO_CHAMADO, pedacosComCitacoes, pedacosComReferencias, rotuloDoNivel,
  type CadastroDoCliente, type EtapaPainel, type FichaChamado, type OpcoesAtendimento, type Painel, type PessoaCurta, type SituacaoDoChamado,
} from '@gestor/shared';
import { mensagemErro } from '../../../components/ui/index.js';
import { useAuth } from '../../../lib/auth.js';
import { LinkDoChamado, useDepoisDeMudar } from '../comum.js';
import type { useMover } from '../mover.js';

// =====================================================================
//  A FICHA ABERTA (o que todas as partes leem)
// =====================================================================

export type Aberta = {
  f: FichaChamado;
  opcoes: OpcoesAtendimento;
  painel: Painel | undefined;
  etapa: EtapaPainel | undefined;
  /** pode mudar o chamado (o Leitor só vê) */
  pode: boolean;
  /** cuida dos chamados (a lixeira) */
  cuida: boolean;
  eu: { id: string; nome: string } | null;
  mover: ReturnType<typeof useMover>;
  /** o cadastro do cliente (produtos, operadoras, circuitos, DIDs, aparelhos, unidades) */
  cadastro: CadastroDoCliente | undefined;
  /** a próxima etapa do caminho (para destacar o que ainda falta preencher) */
  proxima: EtapaPainel | null;
  /** os campos que a próxima etapa pede e estão vazios */
  faltando: Set<string>;
  /** relê a ficha (quando a mudança foi em outro chamado: o incidente, o filho) */
  recarregar: () => void;
};

const Contexto = createContext<Aberta | null>(null);
export const FichaAberta = Contexto.Provider;

export function useAberta(): Aberta {
  const v = useContext(Contexto);
  if (!v) throw new Error('Peça da ficha usada fora da ficha');
  return v;
}

/**
 * A próxima etapa do caminho do chamado: da entrada, a primeira de andamento (para onde o Assumir
 * leva); do andamento, o Resolvido (o objetivo de todo chamado: o N2 não é o caminho, é uma escolha);
 * do Resolvido, o Fechado. É ela que diz o que destacar como "falta para ir para…".
 */
export function proximaEtapa(etapas: EtapaPainel[], atualId: string): EtapaPainel | null {
  const i = etapas.findIndex((e) => e.id === atualId);
  const atual = etapas[i];
  if (!atual) return null;
  const depois = etapas.slice(i + 1);
  // a negociação (o painel de Vendas): a próxima etapa do funil; no fim do funil, o Ganho
  if (etapas.some((e) => e.resultado)) {
    if (atual.resultado) return null;
    return depois.find((e) => !e.resultado && e.tipo !== 'fechado') ?? etapas.find((e) => e.resultado === 'ganho') ?? null;
  }
  if (atual.tipo === 'entrada') return depois.find((e) => e.tipo === 'andamento') ?? depois[0] ?? null;
  if (atual.tipo === 'andamento') return depois.find((e) => e.tipo === 'resolvido') ?? etapas.find((e) => e.tipo === 'resolvido') ?? depois.find((e) => e.tipo === 'fechado') ?? null;
  if (atual.tipo === 'resolvido') return depois.find((e) => e.tipo === 'fechado') ?? etapas.find((e) => e.tipo === 'fechado') ?? null;
  return null;
}

/** "N2" (ou "DEV") quando o nome da etapa já não diz o nível. */
export function nomeComNivel(e: Pick<EtapaPainel, 'nome' | 'nivel'> | undefined | null): string {
  if (!e) return '?';
  const nivel = rotuloDoNivel(e.nivel);
  return nivel && !new RegExp(`\\b${nivel}\\b`, 'i').test(e.nome) ? `${e.nome} · ${nivel}` : e.nome;
}

// =====================================================================
//  RODAR UMA AÇÃO (o erro fica perto do botão)
// =====================================================================

/**
 * Cada botão (ou janela) tem o seu: roda a chamada pela `useDepoisDeMudar` (a ficha nova entra no
 * lugar, o quadro e a lista releem) e guarda o erro para mostrar ali do lado — e não só num aviso
 * que some sozinho.
 */
export function useAcao() {
  const depois = useDepoisDeMudar();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const rodar = useCallback(async <T,>(fazer: () => Promise<T>, ok?: string): Promise<{ ok: true; r: T } | { ok: false; erro: unknown }> => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await depois(fazer(), ok);
      return { ok: true, r };
    } catch (e) {
      setErro(mensagemErro(e));
      return { ok: false, erro: e };
    } finally {
      setOcupado(false);
    }
  }, [depois]);
  const limpar = useCallback(() => setErro(null), []);
  return { rodar, ocupado, erro, limpar, setErro };
}

/** O erro, ali do lado do botão que o causou. */
export function ErroPerto({ erro, className = '' }: { erro: string | null | undefined; className?: string }) {
  if (!erro) return null;
  return (
    <p role="alert" className={`flex items-start gap-1.5 text-bad text-[12.5px] leading-snug mt-1.5 ${className}`}>
      <AlertTriangle size={13} className="shrink-0 mt-0.5" /><span>{erro}</span>
    </p>
  );
}

// =====================================================================
//  A SEÇÃO (cartão com título)
// =====================================================================

export function Secao({ titulo, icone, dica, acoes, children, id, className = '' }: {
  titulo: ReactNode; icone?: ReactNode; dica?: ReactNode; acoes?: ReactNode; children: ReactNode; id?: string; className?: string;
}) {
  return (
    <section id={id} className={`card p-4 min-w-0 scroll-mt-20 ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-3">
        <h2 className="font-display font-semibold text-[15px] flex items-center gap-2 min-w-0">
          {icone && <span className="text-muted shrink-0" aria-hidden>{icone}</span>}
          <span className="min-w-0">{titulo}</span>
          {dica && <span className="font-body font-normal text-[12.5px] text-muted">{dica}</span>}
        </h2>
        {acoes && <div className="flex flex-wrap items-center gap-1.5">{acoes}</div>}
      </header>
      {children}
    </section>
  );
}

/** A marquinha "falta para ir para Resolvido" de um campo vazio que a próxima etapa pede. */
export function MarcaFalta({ campo }: { campo: string }) {
  const { faltando, proxima } = useAberta();
  if (!proxima || !faltando.has(campo)) return null;
  return <span className="chip bg-signal-soft text-signal font-medium">falta para ir para {proxima.nome}</span>;
}

// =====================================================================
//  O MENU QUE ABRE EMBAIXO DE UM BOTÃO
// =====================================================================

type Posicao = { left: number; top?: number; bottom?: number; maxHeight: number };

/**
 * Onde o painel flutuante cabe: preso ao botão, encosta na borda se não couber, abre para cima se
 * não houver espaço embaixo e rola por dentro. `fixed`, então nenhum cartão corta o menu.
 */
export function usePosicaoFlutuante(aberto: boolean, ancora: RefObject<HTMLElement | null>, painel: RefObject<HTMLElement | null>, alinhar: 'direita' | 'esquerda' = 'esquerda') {
  const [pos, setPos] = useState<Posicao | null>(null);
  useLayoutEffect(() => {
    if (!aberto) { setPos(null); return; }
    const posicionar = () => {
      const b = ancora.current?.getBoundingClientRect();
      const p = painel.current;
      if (!b) return;
      const margem = 8;
      const larg = p?.offsetWidth ?? 300;
      const alt = p?.scrollHeight ?? 300;
      const abaixo = window.innerHeight - b.bottom - margem;
      const acima = b.top - margem;
      const paraCima = abaixo < Math.min(alt, 240) && acima > abaixo;
      const desejado = alinhar === 'direita' ? b.right - larg : b.left;
      const left = Math.max(margem, Math.min(desejado, window.innerWidth - larg - margem));
      const altura = Math.max(160, (paraCima ? acima : abaixo) - 4);
      setPos(paraCima
        ? { left, bottom: Math.max(margem, window.innerHeight - b.top + 4), maxHeight: altura }
        : { left, top: Math.max(margem, Math.min(b.bottom + 4, window.innerHeight - margem - Math.min(altura, alt))), maxHeight: altura });
    };
    posicionar();
    const quadro = requestAnimationFrame(posicionar);
    window.addEventListener('resize', posicionar, { passive: true });
    window.addEventListener('scroll', posicionar, true);
    return () => { cancelAnimationFrame(quadro); window.removeEventListener('resize', posicionar); window.removeEventListener('scroll', posicionar, true); };
  }, [aberto, ancora, painel, alinhar]);
  return pos;
}

/**
 * Um menu de ações: o botão e a lista que abre embaixo dele. Escolher fecha o menu; Esc, clicar fora
 * e Tab também. As setas andam entre os itens (o foco vai para o primeiro ao abrir).
 */
export function MenuSuspenso({ rotulo, children, classe = 'btn-secondary btn-sm', largura = 'w-[300px]', alinhar = 'esquerda', titulo, desativado, rotuloAcessivel }: {
  rotulo: ReactNode;
  children: (fechar: () => void) => ReactNode;
  classe?: string;
  largura?: string;
  alinhar?: 'direita' | 'esquerda';
  titulo?: string;
  desativado?: boolean;
  rotuloAcessivel?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const pos = usePosicaoFlutuante(aberto, botao, painel, alinhar);
  const fechar = useCallback((devolver = true) => { setAberto(false); if (devolver) botao.current?.focus(); }, []);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  // o foco vai para o primeiro item quando o menu já está à vista
  useEffect(() => {
    if (aberto && pos) painel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [aberto, !!pos]);
  const tecla = (e: TeclaReact) => {
    const itens = [...(painel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const i = itens.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); itens[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); itens[itens.length - 1]?.focus(); }
    else if (e.key === 'Tab') setAberto(false);
  };
  return (
    <div className="relative" ref={caixa}>
      <button ref={botao} type="button" className={classe} title={titulo} disabled={desativado} aria-haspopup="menu" aria-expanded={aberto} aria-label={rotuloAcessivel}
        onClick={() => setAberto((a) => !a)}>
        {rotulo}<ChevronDown size={14} className="opacity-70 -mr-0.5" />
      </button>
      {aberto && (
        <div ref={painel} role="menu" onKeyDown={tecla}
          className="fixed z-40 card p-1.5 overflow-y-auto shadow-lg text-left font-normal whitespace-normal"
          style={{ left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom, maxHeight: pos?.maxHeight ?? 360, maxWidth: 'calc(100vw - 16px)', visibility: pos ? 'visible' : 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
          <div className={`${largura} max-w-full flex flex-col`}>{children(() => fechar(false))}</div>
        </div>
      )}
    </div>
  );
}

/** Um item do menu: o nome, um ícone e, embaixo, uma explicação curta. */
export function ItemMenu({ icone, children, dica, onClick, desativado = false, perigoso = false, marcado = false }: {
  icone?: ReactNode; children: ReactNode; dica?: ReactNode; onClick: () => void; desativado?: boolean; perigoso?: boolean; marcado?: boolean;
}) {
  return (
    <button type="button" role="menuitem" aria-disabled={desativado || undefined} tabIndex={-1}
      onClick={() => { if (!desativado) onClick(); }}
      className={`w-full text-left rounded-lg px-2.5 py-1.5 flex items-start gap-2 text-[13.5px] focus:outline-none focus-visible:bg-surface-2 focus:bg-surface-2
        ${desativado ? 'opacity-60 cursor-default' : 'hover:bg-surface-2 cursor-pointer'} ${perigoso ? 'text-bad' : 'text-ink'} ${marcado ? 'bg-accent-soft' : ''}`}>
      {icone && <span className={`shrink-0 mt-0.5 ${perigoso ? '' : 'text-muted'}`} aria-hidden>{icone}</span>}
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {dica && <span className="block text-[12px] text-muted leading-snug mt-0.5">{dica}</span>}
      </span>
    </button>
  );
}

export function SeparadorMenu() {
  return <div role="separator" className="my-1 border-t border-line" />;
}

// =====================================================================
//  O TEXTO COM OS CÓDIGOS CITADOS VIRANDO LINK
// =====================================================================

const ENDERECO = /(https?:\/\/[^\s<>"')\]]+)/g;

/** Os endereços (https://…) no meio do texto viram link. */
function ComLinks({ texto }: { texto: string }) {
  const partes: ReactNode[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(ENDERECO)) {
    if (m.index! > ultimo) partes.push(texto.slice(ultimo, m.index));
    partes.push(<a key={m.index} href={m[0]} target="_blank" rel="noreferrer noopener" className="link break-all">{m[0]}</a>);
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return <>{partes}</>;
}

/**
 * Um código citado (SUP-12, DEV-3, IS-4280): o chamado do Gestor que a pessoa vê abre a ficha (o
 * título e a situação aparecem ao passar o mouse); o card do LineChat antigo abre lá; o que não
 * existe fica como texto.
 */
export function Referencia({ codigo }: { codigo: string }) {
  const { f, opcoes } = useAberta();
  if (codigo === f.codigo) return <>{codigo}</>;
  const r = f.referencias.find((x) => x.codigo === codigo);
  if (r) {
    if (r.existe && r.id) {
      const sit = r.situacao ? NOME_SITUACAO_CHAMADO[r.situacao as SituacaoDoChamado] ?? r.situacao : null;
      return <LinkDoChamado codigo={codigo} className="link font-mono text-[0.93em] whitespace-nowrap" title={[r.titulo, sit].filter(Boolean).join(' — ')}>{codigo}</LinkDoChamado>;
    }
    if (r.existe && r.url) {
      return (
        <a href={r.url} target="_blank" rel="noreferrer noopener" className="link font-mono text-[0.93em] whitespace-nowrap inline-flex items-center gap-0.5" title={`Card do LineChat${r.titulo ? `: ${r.titulo}` : ''}${r.situacao ? ` (${r.situacao})` : ''}`}>
          {codigo}<ExternalLink size={11} aria-hidden />
        </a>
      );
    }
    return <>{codigo}</>;
  }
  // fora dos textos (o histórico): o chamado do desenho, ou um código de um painel que a pessoa vê
  const no = f.grafo.nos.find((n) => n.codigo === codigo);
  const sigla = codigo.split('-')[0] ?? '';
  if (no || opcoes.paineis.some((p) => p.sigla === sigla)) {
    return <LinkDoChamado codigo={codigo} className="link font-mono text-[0.93em] whitespace-nowrap" title={no ? `${no.titulo} — ${NOME_SITUACAO_CHAMADO[no.situacao]}` : undefined}>{codigo}</LinkDoChamado>;
  }
  return <>{codigo}</>;
}

/**
 * O texto como foi escrito (as quebras de linha ficam), com os códigos e os endereços clicáveis — e,
 * na anotação, quem ela citou com @ em destaque (`citados`: os que receberam o aviso).
 */
export function TextoComReferencias({ texto, className = '', citados }: { texto: string; className?: string; citados?: PessoaCurta[] }) {
  const pedacos = citados?.length ? pedacosComCitacoes(texto, citados) : [{ texto }];
  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {pedacos.map((c, j) => (c.citado
        ? <Citacao key={j} pessoa={c.citado} texto={c.texto} />
        : pedacosComReferencias(c.texto).map((p, i) => ('codigo' in p ? <Referencia key={`${j}-${i}`} codigo={p.codigo} /> : <ComLinks key={`${j}-${i}`} texto={p.texto} />))))}
    </span>
  );
}

/** "@Bruno Teixeira" na anotação: quem foi citado (e avisado). Quando é você, o destaque é mais forte. */
function Citacao({ pessoa, texto }: { pessoa: PessoaCurta; texto: string }) {
  const { user } = useAuth();
  const voce = user?.id === pessoa.id;
  return (
    <span data-citado={pessoa.id} title={voce ? 'Citaram você: você recebeu o aviso' : `${pessoa.nome} recebeu o aviso`}
      className={`rounded px-0.5 font-semibold ${voce ? 'bg-accent text-white' : 'bg-accent-soft text-accent-ink'}`}>
      {texto}
    </span>
  );
}

// =====================================================================
//  PEQUENAS AJUDAS
// =====================================================================

/** A primeira letra maiúscula (as frases do histórico começam minúsculas: "escalonou de…"). */
export const comMaiuscula = (t: string) => (t ? t[0]!.toLocaleUpperCase('pt-BR') + t.slice(1) : t);

/** "Solução e Causa", "Assunto, Tipo e Causa". */
export function lista(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
}

/** O endereço da ficha para copiar (no sistema e na prévia, que usa "#"). */
export function linkDaFicha(codigo: string): string {
  const usaHash = location.hash.startsWith('#/');
  return usaHash ? `${location.origin}${location.pathname}#/atendimento/${codigo}` : `${location.origin}/atendimento/${codigo}`;
}
