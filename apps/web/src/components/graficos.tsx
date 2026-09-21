/**
 * Gráficos do sistema — SVG feito à mão, sem biblioteca de fora.
 *
 * Duas formas, porque são as perguntas que o dia a dia faz:
 *  - `BarrasRanking` — "quem são os maiores?" (barras deitadas, já ordenadas)
 *  - `Proporcao`     — "quanto de um, quanto do outro?" (uma barra só, dividida)
 *
 * Decisões que valem para as duas:
 *  - **uma cor só** por gráfico. Identidade vem do rótulo escrito ao lado, não da cor — assim
 *    ninguém depende de distinguir verde de laranja (e daltônico enxerga igual).
 *  - eixos e grades discretos; número em cima só onde ajuda, nunca em todo ponto.
 *  - as cores saem das variáveis do tema, então o modo escuro acompanha sozinho.
 */
import { useId, type ReactNode } from 'react';

const TOM = { accent: 'bg-accent', ok: 'bg-ok', signal: 'bg-signal', bad: 'bg-bad', muted: 'bg-line-strong' };

/** Barras deitadas, já na ordem: para "os maiores primeiro". O nome fica à esquerda, o número à direita. */
export function BarrasRanking({ dados, maximo, vazio = 'Nada ainda.', acao, formatar, larguraRotulo = 'w-[140px]', legenda, aoClicarParte }: {
  /**
   * `tom` só quando a cor diz alguma coisa (cheio demais, por exemplo).
   * `partes` divide a barra (em estoque × com clientes, por exemplo) — a soma delas é o valor.
   * O número fica escrito do lado de qualquer jeito.
   */
  dados: Array<{
    id: string; rotulo: ReactNode; valor: number; titulo?: string;
    tom?: 'accent' | 'ok' | 'signal' | 'bad';
    partes?: Array<{ id: string; label: string; n: number; tom: 'accent' | 'ok' | 'signal' | 'bad' | 'muted' }>;
  }>;
  /** força a escala (útil para comparar dois gráficos lado a lado) */
  maximo?: number;
  vazio?: string;
  /** o que fazer ao clicar numa barra */
  acao?: (id: string) => void;
  /** como escrever o número à direita (padrão: o número puro) */
  formatar?: (v: number) => string;
  larguraRotulo?: string;
  /** a legenda das partes, escrita uma vez acima das barras */
  legenda?: Array<{ label: string; tom: 'accent' | 'ok' | 'signal' | 'bad' | 'muted' }>;
  /** clicar numa parte da barra (id da linha, id da parte) */
  aoClicarParte?: (id: string, parteId: string) => void;
}) {
  if (!dados.length) return <div className="text-muted text-sm">{vazio}</div>;
  const max = Math.max(1, maximo ?? 0, ...dados.map((d) => d.valor));
  return (
    <>
    {legenda && legenda.length > 0 && (
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[12px]">
        {legenda.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${TOM[l.tom]}`} />
            <span className="text-muted">{l.label}</span>
          </span>
        ))}
      </div>
    )}
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
              <span className={`${larguraRotulo} shrink-0 truncate text-sm`}>{d.rotulo}</span>
              <span className="flex-1 h-2.5 rounded-full bg-surface-2 overflow-hidden flex">
                {d.partes?.length ? (
                  /* barra mista: uma fatia por parte, com um fio de fundo entre elas */
                  d.partes.filter((x) => x.n > 0).map((x) => (
                    <span
                      key={x.id}
                      onClick={aoClicarParte ? (ev) => { ev.stopPropagation(); aoClicarParte(d.id, x.id); } : undefined}
                      className={`h-full ${TOM[x.tom]} ${aoClicarParte ? 'cursor-pointer hover:opacity-80' : ''} [&+&]:border-l-2 [&+&]:border-surface`}
                      style={{ width: `${(x.n / max) * 100}%` }}
                      title={`${x.label}: ${x.n}`}
                    />
                  ))
                ) : (
                  <span className={`block h-full rounded-full ${TOM[d.tom ?? 'accent']}`} style={{ width: `${Math.max(d.valor ? 3 : 0, (d.valor / max) * 100)}%` }} />
                )}
              </span>
              <span className={`${formatar ? 'w-24' : 'w-9'} text-right font-mono text-[12px] tnum text-ink-2 shrink-0`}>{formatar ? formatar(d.valor) : d.valor}</span>
            </Tag>
          </li>
        );
      })}
    </ul>
    </>
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
