/**
 * Gráficos do sistema — SVG feito à mão, sem biblioteca de fora.
 *
 * Três formas, e só três, porque é o que as perguntas do dia a dia pedem:
 *  - `BarrasTempo`  — "como foi cada mês?" (uma barra por mês, com o detalhe ao passar o mouse)
 *  - `BarrasRanking` — "quem são os maiores?" (barras deitadas, já ordenadas)
 *  - `Proporcao`     — "quanto de um, quanto do outro?" (uma barra só, dividida)
 *
 * Decisões que valem para os três:
 *  - **uma cor só** por gráfico. Identidade vem do rótulo escrito ao lado, não da cor — assim
 *    ninguém depende de distinguir verde de laranja (e daltônico enxerga igual).
 *  - eixos e grades discretos; número em cima só onde ajuda, nunca em todo ponto.
 *  - as cores saem das variáveis do tema, então o modo escuro acompanha sozinho.
 */
import { useId, useState, type ReactNode } from 'react';

/** Um rótulo flutuante que segue o que está sob o cursor. */
function Dica({ children, x, y, largura }: { children: ReactNode; x: number; y: number; largura: number }) {
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-lg"
      style={{ left: `${Math.min(Math.max(x, 4), largura - 150)}px`, top: `${y}px`, minWidth: '120px' }}
    >
      {children}
    </div>
  );
}

/**
 * Uma barra por período (mês, semana…). `detalhe` é o que aparece ao passar o mouse,
 * abaixo do total — é onde cabe a divisão por tipo sem poluir o gráfico.
 */
export function BarrasTempo({ dados, altura = 132, unidade = '', vazio = 'Nada ainda.' }: {
  dados: Array<{ rotulo: string; valor: number; detalhe?: Array<{ nome: string; n: number }> }>;
  altura?: number; unidade?: string; vazio?: string;
}) {
  const [sobre, setSobre] = useState<number | null>(null);
  const max = Math.max(1, ...dados.map((d) => d.valor));
  if (!dados.length || dados.every((d) => d.valor === 0)) return <div className="text-muted text-sm">{vazio}</div>;

  return (
    <div className="relative">
      <div className="flex items-end gap-1.5" style={{ height: altura }} onMouseLeave={() => setSobre(null)}>
        {dados.map((d, i) => {
          const h = Math.round((d.valor / max) * (altura - 22));
          return (
            <button
              key={d.rotulo} type="button"
              className="flex-1 flex flex-col items-center justify-end h-full group"
              onMouseEnter={() => setSobre(i)} onFocus={() => setSobre(i)}
              aria-label={`${d.rotulo}: ${d.valor} ${unidade}`.trim()}
            >
              <span className={`text-[11px] tnum mb-0.5 ${sobre === i ? 'text-ink font-semibold' : 'text-muted'}`}>{d.valor || ''}</span>
              <span
                className={`w-full rounded-t transition-colors ${sobre === i ? 'bg-accent-ink' : 'bg-accent'}`}
                style={{ height: Math.max(d.valor ? 3 : 0, h) }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1">
        {dados.map((d, i) => (
          <span key={d.rotulo} className={`flex-1 text-center text-[11px] ${sobre === i ? 'text-ink' : 'text-muted'}`}>{d.rotulo}</span>
        ))}
      </div>
      {sobre !== null && dados[sobre]?.detalhe?.length ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-2 border-t border-line pt-2">
          <b>{dados[sobre]!.rotulo}:</b>
          {dados[sobre]!.detalhe!.map((x) => <span key={x.nome}>{x.nome} <b className="tnum">{x.n}</b></span>)}
        </div>
      ) : (
        <div className="mt-2 text-[12px] text-muted border-t border-line pt-2">Passe o mouse num mês para ver a divisão.</div>
      )}
    </div>
  );
}

/** Barras deitadas, já na ordem: para "os maiores primeiro". O nome fica à esquerda, o número à direita. */
export function BarrasRanking({ dados, maximo, vazio = 'Nada ainda.', acao }: {
  dados: Array<{ id: string; rotulo: ReactNode; valor: number; titulo?: string }>;
  /** força a escala (útil para comparar dois gráficos lado a lado) */
  maximo?: number;
  vazio?: string;
  /** o que fazer ao clicar numa barra */
  acao?: (id: string) => void;
}) {
  if (!dados.length) return <div className="text-muted text-sm">{vazio}</div>;
  const max = Math.max(1, maximo ?? 0, ...dados.map((d) => d.valor));
  return (
    <ul className="flex flex-col gap-1.5">
      {dados.map((d) => {
        const Tag = acao ? 'button' : 'div';
        return (
          <li key={d.id}>
            <Tag
              {...(acao ? { type: 'button' as const, onClick: () => acao(d.id) } : {})}
              className={`w-full text-left flex items-center gap-2 ${acao ? 'hover:bg-surface-2 rounded-lg px-1 -mx-1 py-0.5' : ''}`}
              title={d.titulo}
            >
              <span className="w-[140px] shrink-0 truncate text-sm">{d.rotulo}</span>
              <span className="flex-1 h-2.5 rounded-full bg-surface-2 overflow-hidden">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(d.valor ? 3 : 0, (d.valor / max) * 100)}%` }} />
              </span>
              <span className="w-9 text-right font-mono text-[12px] tnum text-ink-2">{d.valor}</span>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Uma barra dividida em duas ou três partes, com os rótulos escritos embaixo.
 * Serve para "em uso × livre", "em estoque × com clientes" — a leitura de um golpe.
 */
export function Proporcao({ partes, total }: {
  partes: Array<{ id: string; rotulo: string; n: number; cor: 'accent' | 'ok' | 'signal' | 'bad' | 'muted' }>;
  /** o total, quando ele não é a soma das partes */
  total?: number;
}) {
  const id = useId();
  const soma = total ?? partes.reduce((a, x) => a + x.n, 0);
  const CORES = { accent: 'bg-accent', ok: 'bg-ok', signal: 'bg-signal', bad: 'bg-bad', muted: 'bg-line-strong' };
  const PONTOS = { accent: 'bg-accent', ok: 'bg-ok', signal: 'bg-signal', bad: 'bg-bad', muted: 'bg-line-strong' };
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-surface-2" aria-describedby={id}>
        {partes.filter((x) => x.n > 0).map((x) => (
          <span key={x.id} className={`h-full ${CORES[x.cor]}`} style={{ width: `${(x.n / Math.max(soma, 1)) * 100}%` }} title={`${x.rotulo}: ${x.n}`} />
        ))}
      </div>
      <div id={id} className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12.5px]">
        {partes.map((x) => (
          <span key={x.id} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${PONTOS[x.cor]}`} />
            <span className="text-muted">{x.rotulo}</span>
            <b className="tnum">{x.n}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
