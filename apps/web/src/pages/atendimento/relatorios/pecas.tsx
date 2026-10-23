/**
 * As peças dos Relatórios dos painéis de chamados (Patch 2.1, decisão 0055): o cartão de cada relatório,
 * os números de destaque, a seta do "melhorou ou piorou", as barras e a janela com os chamados de uma peça.
 *
 * As regras dos gráficos do sistema valem aqui também: o número sempre escrito, uma cor por gráfico (a não
 * ser quando a cor diz alguma coisa) e clicar mostra os chamados por trás do que foi clicado. Diferente do
 * Legado do Helena, a lista vem junto com os números (cada peça traz os ids; `r.chamados` tem a linha de
 * cada um): a janela abre na hora e é a mesma conta do número.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Info, TrendingDown, TrendingUp } from 'lucide-react';
import { ITEM_DO_CATALOGO, duracaoUtil, type ChamadoDoRelatorio, type RelatoriosDoPainel } from '@gestor/shared';
import { Chip, Modal } from '../../../components/ui/index.js';
import { data } from '../../../lib/format.js';
import { ChipPrioridade, LinkDoChamado } from '../comum.js';

/** O que a janela mostra: o nome do que foi clicado e os chamados por trás. */
export type Aberta = { titulo: string; ids: string[] };
export type PropsDoRelatorio = { r: RelatoriosDoPainel; abrir: (a: Aberta) => void };

export const nf = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
export const pct = (n: number, de: number) => (de ? Math.round((n / de) * 100) : 0);
export const plural = (n: number, um: string, varios: string) => `${nf(n)} ${n === 1 ? um : varios}`;
/** dd/mm a partir de AAAA-MM-DD */
export const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
/** O tempo em horas úteis do painel ("3 h 40", "1 d 2 h"). */
/** "1 d 2 h", sem quebrar a linha no meio (o espaço é o que não quebra). */
export const tempoUtil = (r: Pick<RelatoriosDoPainel, 'horasDoDia'>, minutos: number | null | undefined) => duracaoUtil(minutos, r.horasDoDia).replace(/ /g, ' ');
/** "o período anterior (01/09 a 22/09)" */
export const nomeDoAnterior = (r: RelatoriosDoPainel) => `${r.periodo.anterior.nome} (${diaCurto(r.periodo.anterior.de)} a ${diaCurto(r.periodo.anterior.ate)})`;

/** O cartão de um relatório: o nome e a pergunta (do catálogo), as ações e uma nota de rodapé. */
export function Cartao({ id, acoes, rodape, children, className = '' }: { id: string; acoes?: ReactNode; rodape?: ReactNode; children: ReactNode; className?: string }) {
  const item = ITEM_DO_CATALOGO.get(id);
  return (
    <section id={`relatorio-${id}`} className={`card p-4 sm:p-5 min-w-0 flex flex-col gap-4 ${className}`} aria-labelledby={`relatorio-${id}-t`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={`relatorio-${id}-t`} className="font-display font-semibold text-[17px] leading-tight flex flex-wrap items-center gap-2">
            {item?.titulo ?? id}
            {item?.novo && <Chip tone="accent" title="O que o Helena não deixava fazer">novo</Chip>}
          </h2>
          {item && <p className="text-[13.5px] text-ink-2 mt-0.5">{item.pergunta}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </header>
      {children}
      {rodape && (
        <p className="text-[12.5px] text-muted flex gap-1.5 leading-snug border-t border-line pt-3 mt-auto">
          <Info size={13} className="shrink-0 mt-0.5" aria-hidden /><span>{rodape}</span>
        </p>
      )}
    </section>
  );
}

/** Um número de destaque dentro do cartão. Com `ids`, clicar mostra os chamados dele. */
export function Numero({ valor, rotulo, sub, tom, ids, janela, abrir, titulo }: {
  valor: ReactNode; rotulo: ReactNode; sub?: ReactNode; tom?: 'signal' | 'ok' | 'bad';
  ids?: string[]; janela?: string; abrir?: (a: Aberta) => void; titulo?: string;
}) {
  const cor = tom === 'signal' ? 'text-signal' : tom === 'ok' ? 'text-ok' : tom === 'bad' ? 'text-bad' : '';
  const corpo = (
    <>
      <span className={`block font-display text-[22px] sm:text-2xl font-semibold tnum leading-tight ${cor}`}>{valor}</span>
      <span className="block text-[12.5px] text-muted leading-snug">{rotulo}</span>
      {sub && <span className="block text-[12px] mt-0.5">{sub}</span>}
    </>
  );
  if (!ids?.length || !abrir) return <div className="min-w-[120px] max-w-[260px]" title={titulo}>{corpo}</div>;
  return (
    <button type="button" onClick={() => abrir({ titulo: janela ?? (typeof rotulo === 'string' ? rotulo : 'Chamados'), ids })} title={titulo ?? 'Clique para ver os chamados'}
      className="min-w-[120px] max-w-[260px] text-left rounded-lg -m-1.5 p-1.5 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent">
      {corpo}
    </button>
  );
}
export function Numeros({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x-7 gap-y-3">{children}</div>;
}

/**
 * "▲ 40 min", "▼ 3 pontos": o que mudou em relação ao período anterior. A seta é verde quando melhorou e
 * laranja quando piorou (`menorEhMelhor` para tempo e fila; sem ele, neutra).
 */
export function Variacao({ agora, antes, formato, menorEhMelhor, r, contra }: {
  agora: number | null; antes: number | null; formato: 'tempo' | 'pontos' | 'n'; menorEhMelhor?: boolean;
  r: Pick<RelatoriosDoPainel, 'horasDoDia'>; contra: string;
}) {
  if (agora == null || antes == null) return <span className="text-muted">sem comparação com {contra}</span>;
  const d = agora - antes;
  if (Math.abs(d) < 0.5) return <span className="text-muted">igual a {contra}</span>;
  const sobe = d > 0;
  const bom = menorEhMelhor === undefined ? null : menorEhMelhor ? !sobe : sobe;
  const cor = bom === null ? 'text-ink-2' : bom ? 'text-ok' : 'text-signal';
  const texto = formato === 'tempo' ? tempoUtil(r, Math.abs(d)) : formato === 'pontos' ? plural(Math.round(Math.abs(d)), 'ponto', 'pontos') : nf(Math.abs(d));
  const Seta = sobe ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1 font-semibold ${cor}`}>
      <Seta size={13} aria-hidden /> {sobe ? 'mais' : 'menos'} {texto}<span className="font-normal text-muted">que {contra}</span>
    </span>
  );
}

/** Uma barra deitada com o texto à direita (as tabelas de tempo e de porcentagem). */
export function BarraComTexto({ v, max, texto, forte, apagada, largura = 74, titulo }: {
  v: number; max: number; texto: string; forte?: boolean;
  /** a barra que não entra na comparação (poucos chamados): cinza, com o porquê no `titulo` */
  apagada?: boolean;
  /** a largura do texto ao lado da barra, em px (na tela larga; no celular, só o texto) */
  largura?: number; titulo?: string;
}) {
  return (
    <span className="flex items-center gap-2" title={titulo} style={{ '--largura': `${largura}px` } as CSSProperties}>
      {/* no celular, só o número: a barra deixaria a tabela mais larga que a tela */}
      <span className="hidden sm:block flex-1 min-w-[50px] h-2 rounded-full bg-surface-2 overflow-hidden">
        <span className={`block h-full rounded-full ${apagada ? 'bg-line-strong' : forte ? 'bg-signal' : 'bg-accent'}`} style={{ width: `${Math.max(v ? 3 : 0, (v / Math.max(max, 1e-9)) * 100)}%` }} />
      </span>
      <span className={`tnum whitespace-nowrap sm:text-right sm:w-[var(--largura)] ${apagada ? 'text-muted' : ''}`}>{texto}</span>
    </span>
  );
}

/** Um número de tabela que, clicado, mostra os chamados dele (zero não clica). */
export function NumeroClicavel({ ids, titulo, abrir, tom = '', n }: { ids: string[]; titulo: string; abrir: (a: Aberta) => void; tom?: string; n?: number }) {
  const v = n ?? ids.length;
  return v && ids.length
    ? <button type="button" onClick={() => abrir({ titulo, ids })} className={`tnum hover:underline ${tom}`} title="Clique para ver os chamados">{nf(v)}</button>
    : <span className="tnum text-muted">0</span>;
}

/**
 * Colunas em pé (as faixas, as semanas, os dias), com o número em cima e o rótulo embaixo. A cor de cada uma
 * vem de fora quando diz alguma coisa (os mais velhos da fila, os dias fora da curva).
 */
export function Colunas({ pontos, altura = 130, abrir, vazio = 'Nada no período.' }: {
  pontos: Array<{ id: string; rotulo: string; n: number; ids?: string[]; cor?: string; titulo?: string; janela?: string; forte?: boolean }>;
  altura?: number; abrir?: (a: Aberta) => void; vazio?: string;
}) {
  const max = Math.max(0, ...pontos.map((p) => p.n));
  if (!pontos.length || max === 0) return <div className="text-muted text-sm py-6 text-center">{vazio}</div>;
  const n = pontos.length;
  // muitos pontos (os dias): um rótulo a cada `passo`, contado do último (o mais recente sempre tem o dele);
  // no celular, a metade deles
  const passo = Math.ceil(n / 12);
  const comRotulo = (i: number, p: number) => (n - 1 - i) % p === 0;
  const comNumero = n <= 31;
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height: altura }}>
        {pontos.map((p) => {
          const clicavel = !!abrir && !!p.ids?.length;
          const Tag = clicavel ? 'button' : 'div';
          return (
            <Tag
              key={p.id} {...(clicavel ? { type: 'button' as const, onClick: () => abrir!({ titulo: p.janela ?? p.rotulo, ids: p.ids! }), 'aria-label': `${p.rotulo}: ${p.n}` } : {})}
              title={p.titulo ?? `${p.rotulo}: ${nf(p.n)}`} data-ponto={p.id}
              className={`flex-1 min-w-0 h-full flex flex-col justify-end items-center group ${clicavel ? 'cursor-pointer' : ''}`}
            >
              {comNumero && p.n > 0 && <span className={`text-[10.5px] tnum leading-none mb-1 ${p.forte ? 'text-ink font-semibold' : 'text-ink-2'}`}>{nf(p.n)}</span>}
              <span className="block w-full max-w-[56px] rounded-t group-hover:brightness-110" style={{ height: p.n ? Math.max(3, (p.n / max) * (altura - 18)) : 0, background: p.cor ?? 'var(--accent)' }} />
            </Tag>
          );
        })}
      </div>
      {n <= 12 ? (
        <div className="flex gap-[3px] border-t border-line mt-0.5 pt-1">
          {pontos.map((p) => <span key={p.id} className="flex-1 min-w-0 text-center text-[10.5px] leading-tight text-muted break-words">{p.rotulo}</span>)}
        </div>
      ) : (
        // o rótulo fica embaixo da coluna dele (o do fim, encostado na direita; o do começo, na esquerda)
        <div className="relative h-[18px] border-t border-line mt-0.5" aria-hidden>
          {pontos.map((p, i) => comRotulo(i, passo) && (
            <span key={p.id} className={`absolute top-1 text-[10.5px] leading-tight text-muted whitespace-nowrap ${comRotulo(i, passo * 2) ? '' : 'hidden sm:inline'}`}
              style={i === n - 1 ? { right: 0 } : i === 0 ? { left: 0 } : { left: `${((i + 0.5) / n) * 100}%`, transform: 'translateX(-50%)' }}>
              {p.rotulo}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A largura da coluna de texto de uma lista de barras, pelo texto mais comprido (em `ch`): cada linha é uma
 * grade separada, e com a coluna do fim do tamanho do texto de cada uma as barras não começariam juntas.
 */
export const larguraDoTexto = (textos: string[]) => `${Math.max(2, ...textos.map((t) => t.length)) + 1}ch`;

/** Barras deitadas (um ranking): o rótulo, a barra e o número; com `antes`, a seta do que mudou. */
export function Barras({ itens, abrir, vazio = 'Nada aqui.', janela }: {
  itens: Array<{ rotulo: string; n: number; ids?: string[]; antes?: number; texto?: string }>;
  abrir?: (a: Aberta) => void; vazio?: string; janela?: (rotulo: string) => string;
}) {
  if (!itens.length) return <div className="text-muted text-sm">{vazio}</div>;
  const max = Math.max(1, ...itens.map((x) => x.n));
  const colunas = `minmax(0,1fr) minmax(60px,40%) ${larguraDoTexto(itens.map((x) => `${x.texto ?? nf(x.n)}${x.antes !== undefined ? `  ▲${nf(Math.abs(x.n - x.antes))}` : ''}`))}`;
  return (
    <ul className="flex flex-col gap-1">
      {itens.map((x) => {
        const clicavel = !!abrir && !!x.ids?.length;
        const Tag = clicavel ? 'button' : 'div';
        return (
          <li key={x.rotulo}>
            <Tag
              {...(clicavel ? { type: 'button' as const, onClick: () => abrir!({ titulo: janela ? janela(x.rotulo) : x.rotulo, ids: x.ids! }) } : {})}
              className={`w-full text-left grid items-center gap-2 text-[13px] rounded-md px-1 -mx-1 py-0.5 ${clicavel ? 'hover:bg-surface-2' : ''}`}
              style={{ gridTemplateColumns: colunas }}
              title={x.antes !== undefined ? `${x.rotulo}: ${nf(x.n)} (antes: ${nf(x.antes)})` : `${x.rotulo}: ${x.texto ?? nf(x.n)}`}
            >
              <span className="truncate">{x.rotulo}</span>
              <span className="h-2 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(x.n ? 3 : 0, (x.n / max) * 100)}%` }} /></span>
              <span className="font-mono text-[12px] tnum text-ink-2 text-right whitespace-nowrap">
                {x.texto ?? nf(x.n)}
                {x.antes !== undefined && <span className={`ml-1.5 ${x.n > x.antes ? 'text-signal' : x.n < x.antes ? 'text-ok' : 'text-muted'}`}>{x.n > x.antes ? '▲' : x.n < x.antes ? '▼' : '='}{x.n !== x.antes ? nf(Math.abs(x.n - x.antes)) : ''}</span>}
              </span>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/** A cor de uma célula de mapa (o calor, a gravidade): a cor do sistema mais forte quanto maior a parte. */
export const corDaCelula = (parte: number) => `color-mix(in srgb, var(--accent) ${Math.round(10 + 38 * Math.min(1, Math.max(0, parte)))}%, var(--surface))`;

/**
 * A janela com os chamados de uma peça clicada: o código (abre a ficha), o título, a etapa, o cliente, quem
 * cuida, a prioridade e as datas. A lista vem com os números (é a mesma conta).
 */
export function JanelaDosChamados({ aberta, r, onFechar }: { aberta: Aberta; r: RelatoriosDoPainel; onFechar: () => void }) {
  const porId = useMemo(() => new Map(r.chamados.map((c) => [c.id, c])), [r.chamados]);
  const lista = aberta.ids.map((id) => porId.get(id)).filter((c): c is ChamadoDoRelatorio => !!c)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  return (
    <Modal open onClose={onFechar} largura="max-w-4xl" titulo={<>{aberta.titulo} <span className="text-muted font-normal tnum">({nf(lista.length)})</span></>}>
      {!lista.length ? <div className="text-muted text-sm">Nenhum chamado aqui.</div> : (
        <ul className="divide-y divide-line -mx-1" id="janela-dos-chamados">
          {lista.map((c) => (
            <li key={c.id} className="py-2.5 px-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-[13.5px]">
              <LinkDoChamado codigo={c.codigo} onClick={onFechar} className="min-w-0 hover:text-accent">
                <span className="font-mono text-[12px] text-muted mr-1.5">{c.codigo}</span><span className="font-semibold">{c.titulo}</span>
              </LinkDoChamado>
              <span className="text-right"><ChipPrioridade p={c.prioridade} curta /></span>
              <span className="text-[12.5px] text-muted min-w-0 truncate">
                {[c.cliente ?? 'sem cliente', c.assunto ?? 'sem assunto', c.responsavel ?? 'sem responsável'].join(' · ')}
              </span>
              <span className="text-[12.5px] text-right whitespace-nowrap tnum">
                <span className="text-ink-2">{c.etapa}</span>
                <span className="text-muted"> · aberto {data(c.criadoEm, true)}{c.resolvidoEm ? ` · resolvido ${data(c.resolvidoEm, true)}` : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
