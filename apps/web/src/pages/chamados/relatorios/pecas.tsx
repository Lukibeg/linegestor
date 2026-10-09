/**
 * As peças comuns dos Relatórios (Patch 1.7): o cartão de cada relatório, os números de destaque,
 * a seta de "melhorou ou piorou", a linha das semanas e a janela com os chamados de uma peça clicada.
 *
 * As regras de sempre dos gráficos do sistema valem aqui também (`components/graficos.tsx`): o
 * número sempre escrito, uma cor por gráfico (a não ser quando a cor diz alguma coisa), e clicar
 * mostra os chamados por trás do que foi clicado.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { ExternalLink, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { duracaoLegivel } from '@gestor/shared';
import { api } from '../../../api/index.js';
import type { LinhaChamado } from '../../../api/types.js';
import { Carregando, Chip, Modal, mensagemErro } from '../../../components/ui/index.js';
import { data, relativo } from '../../../lib/format.js';
import { BotaoEnvio } from '../../../lib/envio.js';
import { LivroDoChamado, RegistrarNaBase, useArtigosDosChamados } from '../../base/partes.js';

export const nf = (n: number) => n.toLocaleString('pt-BR');
export const pct = (n: number, de: number) => (de ? Math.round((n / de) * 100) : 0);
export const horas = duracaoLegivel;
/** dd/mm a partir de AAAA-MM-DD */
export const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** O cartão de um relatório: o nome, a pergunta que ele responde, as ações e uma nota de rodapé. */
export function Bloco({ id, titulo, pergunta, icone: Icone, acoes, rodape, children, className = '' }: {
  id?: string; titulo: string; pergunta: string; icone?: typeof Info; acoes?: ReactNode; rodape?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`card p-4 sm:p-5 min-w-0 flex flex-col gap-4 ${className}`} aria-labelledby={id ? `${id}-t` : undefined}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={id ? `${id}-t` : undefined} className="font-display font-semibold text-[17px] leading-tight flex items-center gap-2">
            {Icone && <Icone size={17} className="text-muted shrink-0" />}{titulo}
          </h2>
          <p className="text-[13.5px] text-ink-2 mt-0.5">{pergunta}</p>
        </div>
        {(acoes || id) && (
          <div className="flex flex-wrap items-center gap-2">
            {acoes && <div className="so-tela flex flex-wrap items-center gap-2">{acoes}</div>}
            {id && <BotaoEnvio tipo="relatorio" id={id} titulo={titulo} />}
          </div>
        )}
      </header>
      {children}
      {rodape && (
        <p className="text-[12.5px] text-muted flex gap-1.5 leading-snug border-t border-line pt-3 mt-auto">
          <Info size={13} className="shrink-0 mt-0.5" /><span>{rodape}</span>
        </p>
      )}
    </section>
  );
}

/** Um número de destaque dentro do cartão. Com `aoClicar`, mostra os chamados dele. */
export function Numero({ valor, rotulo, sub, tom, aoClicar, titulo }: {
  valor: ReactNode; rotulo: ReactNode; sub?: ReactNode; tom?: 'signal' | 'ok' | 'bad'; aoClicar?: () => void; titulo?: string;
}) {
  const cor = tom === 'signal' ? 'text-signal' : tom === 'ok' ? 'text-ok' : tom === 'bad' ? 'text-bad' : '';
  const corpo = (
    <>
      <span className={`block font-display text-[22px] sm:text-2xl font-semibold tnum leading-tight ${cor}`}>{valor}</span>
      <span className="block text-[12.5px] text-muted leading-snug">{rotulo}</span>
      {sub && <span className="block text-[12px] mt-0.5">{sub}</span>}
    </>
  );
  if (!aoClicar) return <div className="min-w-[120px]" title={titulo}>{corpo}</div>;
  return (
    <button type="button" onClick={aoClicar} title={titulo ?? 'Clique para ver os chamados'} className="min-w-[120px] text-left rounded-lg -m-1.5 p-1.5 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent">
      {corpo}
    </button>
  );
}
export function Numeros({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x-7 gap-y-3">{children}</div>;
}

/**
 * "▲ 12% em relação a…": a seta é verde quando melhorou e laranja quando piorou. `menorEhMelhor`
 * para tempo e fila; sem ele, a seta é neutra (mais chamado não é bom nem ruim por si só).
 */
export function Variacao({ agora, antes, menorEhMelhor, formato = 'pct', contra }: {
  agora: number | null; antes: number | null; menorEhMelhor?: boolean; formato?: 'pct' | 'horas' | 'n'; contra?: string;
}) {
  if (agora == null || antes == null) return contra ? <span className="text-muted">sem comparação com {contra}</span> : null;
  const d = agora - antes;
  if (Math.abs(d) < 1e-9) return <span className="text-muted">igual{contra ? ` a ${contra}` : ''}</span>;
  const sobe = d > 0;
  const bom = menorEhMelhor === undefined ? null : menorEhMelhor ? !sobe : sobe;
  const cor = bom === null ? 'text-ink-2' : bom ? 'text-ok' : 'text-signal';
  const texto = formato === 'horas' ? horas(Math.abs(d)) : formato === 'n' ? nf(Math.abs(d)) : antes ? `${Math.round((Math.abs(d) / antes) * 100)}%` : nf(Math.abs(d));
  const Seta = sobe ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${cor}`}>
      <Seta size={13} aria-hidden /> {sobe ? 'mais' : 'menos'} {texto}{contra && <span className="font-normal text-muted"> que {contra}</span>}
    </span>
  );
}

/** A linha das semanas (ou dos meses): um traço com o último ponto marcado. */
export function Faisca({ valores, largura = 96, altura = 26, rotulo }: { valores: number[]; largura?: number; altura?: number; rotulo: string }) {
  const max = Math.max(1, ...valores);
  const passo = valores.length > 1 ? (largura - 8) / (valores.length - 1) : 0;
  const pts = valores.map((v, i) => [4 + i * passo, altura - 4 - (v / max) * (altura - 8)] as const);
  const ult = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} width={largura} height={altura} role="img" aria-label={rotulo} className="shrink-0 overflow-visible">
      <title>{rotulo}</title>
      <line x1={0} x2={largura} y1={altura - 4} y2={altura - 4} stroke="var(--line)" />
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {ult && <circle cx={ult[0]} cy={ult[1]} r={3.2} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />}
    </svg>
  );
}

/** Uma lista curta de chamados (o código abre o card no LineChat). */
export function ListaCurta({ itens, vazio = 'Nenhum chamado.', comEtapa = true }: { itens: LinhaChamado[]; vazio?: string; comEtapa?: boolean }) {
  if (!itens.length) return <div className="text-muted text-sm">{vazio}</div>;
  return (
    <ul className="divide-y divide-line">
      {itens.map((c) => (
        <li key={c.id} className="py-2 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 text-[13px]">
          <CodigoDoCard c={c} />
          <div className="min-w-0">
            <div className="line-clamp-2">{c.title || <span className="text-muted">(sem título)</span>}</div>
            <div className="text-[12px] text-muted">
              {comEtapa && <>{c.stepTitle ?? '—'} · </>}<span className="tnum" title={data(c.createdAt, true)}>aberto {relativo(c.createdAt)}</span>
              {c.responsavel && <> · {c.responsavel}</>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CodigoDoCard({ c }: { c: { key: string | null; link: string } }) {
  return c.link
    ? <a className="link font-mono text-[12.5px] whitespace-nowrap" href={c.link} target="_blank" rel="noreferrer" title="Abrir o card no LineChat">{c.key ?? '?'} <ExternalLink size={11} className="inline -mt-0.5" /></a>
    : <span className="font-mono text-[12.5px]">{c.key ?? '?'}</span>;
}

/**
 * A janela com os chamados de uma peça clicada (uma faixa do relógio, um quadrado do mapa, uma
 * coluna da entrada × saída…). Pede ao servidor com os mesmos filtros da página: a lista é a
 * mesma conta do número que foi clicado.
 */
export function JanelaDaPeca({ peca, filtros, onClose }: { peca: string | null; filtros: Record<string, unknown>; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['chamados', 'relatorios', 'peca', peca, JSON.stringify(filtros)],
    queryFn: () => api.chamados.pecaRelatorio({ ...filtros, peca }),
    enabled: !!peca,
  });
  const r = q.data;
  // 1.8: o livrinho da base em cada chamado da janela
  const livros = useArtigosDosChamados(useMemo(() => (r?.itens ?? []).map((c) => c.id), [r]));
  return (
    <Modal open={!!peca} onClose={onClose} largura="max-w-4xl" titulo={r ? <>{r.titulo} <span className="text-muted font-normal tnum">({nf(r.total)})</span></> : 'Chamados'}>
      {q.isLoading ? <Carregando /> : q.isError ? <div className="text-bad text-sm">{mensagemErro(q.error)}</div> : !r?.itens.length ? <div className="text-muted text-sm">Nenhum chamado aqui.</div> : (
        <div className="overflow-x-auto -mx-1">
          <table className="table">
            <thead><tr><th>Card</th><th>Título</th><th>Etapa</th><th>Responsável</th><th>Aberto em</th><th>Fechado em</th></tr></thead>
            <tbody>
              {r.itens.map((c) => (
                <tr key={c.id} className="group">
                  <td className="whitespace-nowrap"><span className="inline-flex items-center gap-1"><CodigoDoCard c={c} /><LivroDoChamado artigos={livros[c.id]} /><RegistrarNaBase cardId={c.id} className="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100" /></span></td>
                  <td className="text-[13px]"><span className="line-clamp-2 min-w-[200px]">{c.title || <span className="text-muted">(sem título)</span>}</span></td>
                  <td className="text-[13px] whitespace-nowrap">{c.stepTitle ?? '—'}{c.arquivado && <Chip tone="muted" className="ml-1">arquivado</Chip>}</td>
                  <td className="text-[13px] whitespace-nowrap">{c.responsavel ?? <span className="text-muted">—</span>}</td>
                  <td className="text-[13px] whitespace-nowrap tnum">{data(c.createdAt, true)}</td>
                  <td className="text-[13px] whitespace-nowrap tnum">{c.fechado && c.closedAt ? `${data(c.closedAt, true)}${c.closedEstimated ? ' *' : ''}` : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.total > r.itens.length && <p className="text-[12.5px] text-muted mt-2">Mostrando os {nf(r.itens.length)} mais novos de {nf(r.total)}.</p>}
        </div>
      )}
    </Modal>
  );
}

/** Barras deitadas simples, com o número e (se houver) o do período anterior ao lado. */
export function BarrasComparadas({ itens, vazio = 'Nada aqui.', aoClicar }: { itens: Array<{ rotulo: string; n: number; antes?: number }>; vazio?: string; aoClicar?: (rotulo: string) => void }) {
  if (!itens.length) return <div className="text-muted text-sm">{vazio}</div>;
  const max = Math.max(1, ...itens.map((x) => x.n));
  return (
    <ul className="flex flex-col gap-1.5">
      {itens.map((x) => {
        const Tag = aoClicar ? 'button' : 'div';
        return (
          <li key={x.rotulo}>
            <Tag
              {...(aoClicar ? { type: 'button' as const, onClick: () => aoClicar(x.rotulo) } : {})}
              className={`w-full text-left grid grid-cols-[minmax(0,1fr)_minmax(60px,40%)_auto] items-center gap-2 text-[13px] ${aoClicar ? 'hover:bg-surface-2 rounded-lg px-1 -mx-1' : ''}`}
              title={x.antes !== undefined ? `${x.rotulo}: ${x.n} (antes: ${x.antes})` : `${x.rotulo}: ${x.n}`}
            >
              <span className="truncate">{x.rotulo}</span>
              <span className="h-2 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(x.n ? 3 : 0, (x.n / max) * 100)}%` }} /></span>
              <span className="font-mono text-[12px] tnum text-ink-2 text-right whitespace-nowrap">
                {nf(x.n)}
                {x.antes !== undefined && <span className={`ml-1.5 ${x.n > x.antes ? 'text-signal' : x.n < x.antes ? 'text-ok' : 'text-muted'}`} title="em relação ao mês anterior">{x.n > x.antes ? '▲' : x.n < x.antes ? '▼' : '='}{x.n !== x.antes ? nf(Math.abs(x.n - x.antes)) : ''}</span>}
              </span>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Colunas em pé com a cor de cada uma (quando a cor diz alguma coisa: os mais velhos da fila, os
 * dias fora da curva). O número fica em cima quando `comNumero` (ou só nas destacadas); o rótulo
 * embaixo aparece em todas quando cabem, senão um a cada tantos.
 */
export function ColunasCor({ pontos, altura = 130, aoClicar, numero = 'todos' }: {
  pontos: Array<{ id: string; rotulo: string; n: number; cor: string; titulo?: string; forte?: boolean }>;
  altura?: number;
  aoClicar?: (id: string) => void;
  /** número em cima: em todas, só nas fortes, ou em nenhuma */
  numero?: 'todos' | 'fortes';
}) {
  const max = Math.max(1, ...pontos.map((p) => p.n));
  const passo = pontos.length <= 16 ? 1 : Math.ceil(pontos.length / 12);
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height: altura }}>
        {pontos.map((p) => {
          const clicavel = !!aoClicar && p.n > 0;
          const Tag = clicavel ? 'button' : 'div';
          const mostra = p.n > 0 && (numero === 'todos' || p.forte);
          return (
            <Tag
              key={p.id} {...(clicavel ? { type: 'button' as const, onClick: () => aoClicar!(p.id), 'aria-label': `${p.rotulo}: ${p.n}` } : {})}
              title={p.titulo ?? `${p.rotulo}: ${p.n}`}
              className={`flex-1 min-w-0 h-full flex flex-col justify-end items-center group ${clicavel ? 'cursor-pointer' : ''}`}
            >
              {mostra && <span className={`text-[10.5px] tnum leading-none mb-1 ${p.forte ? 'text-ink font-semibold' : 'text-ink-2'}`}>{p.n}</span>}
              <span className="block w-full rounded-t group-hover:brightness-110" style={{ height: p.n ? Math.max(3, (p.n / max) * (altura - 18)) : 0, background: p.cor }} />
            </Tag>
          );
        })}
      </div>
      <div className="flex gap-[3px] border-t border-line mt-0.5 pt-1 overflow-hidden">
        {pontos.map((p, i) => (
          <span key={p.id} className={`flex-1 min-w-0 text-center text-[10.5px] leading-tight text-muted ${pontos.length <= 12 ? 'break-words' : 'whitespace-nowrap overflow-visible'}`}>
            {i % passo === 0 || i === pontos.length - 1 ? p.rotulo : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
