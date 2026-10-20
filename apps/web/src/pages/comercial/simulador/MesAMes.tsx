/**
 * O mês a mês do contrato (o Simulador do Comercial, 2.0.2). O Luan, num comentário na prévia, sobre o gráfico
 * pequeno: "isso aqui ta bacana, quero esse gráfico mais detalhado mensalmente, por exemplo, com os valores
 * acumulado e lucro por mês; acho q vai ter q ficar maior".
 *
 * Em cima, o acumulado (a linha; verde acima do zero, vermelho abaixo), com o pior momento e o mês em que a venda
 * se paga; embaixo, o lucro de cada mês (as barras, verdes ou vermelhas). Passar o mouse — ou tocar, no celular —
 * num mês mostra o lucro dele e o acumulado; a tabela tem todos os meses. O mês 0 é a assinatura: o que sai de uma
 * vez e a primeira parcela da ativação. A barra dele costuma ser bem maior que as outras: passando da escala, ela é
 * cortada e diz o valor.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ContasDoCenario } from '@gestor/shared';
import { reaisLimpo } from './comum.js';

/** "15,6 mil", "−840": os números dos eixos (o R$ fica no título). */
function noEixo(centavos: number): string {
  return curto(centavos).replace('R$ ', '');
}

/** Só os rótulos que não encostam no de cima (o zero sempre fica). */
function semEncostar(valores: number[], y: (v: number) => number): number[] {
  const unicos = valores.filter((v, i, a) => a.indexOf(v) === i);
  const ficam: number[] = unicos.filter((v) => v === 0);
  for (const v of unicos) if (v !== 0 && ficam.every((f) => Math.abs(y(f) - y(v)) >= 14)) ficam.push(v);
  return ficam;
}

/** "R$ 15,6 mil", "−R$ 840": os números curtos. */
function curto(centavos: number): string {
  const r = centavos / 100;
  const a = Math.abs(r);
  const sinal = r < 0 ? '−' : '';
  if (a >= 1_000_000) return `${sinal}R$ ${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${sinal}R$ ${(a / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `${sinal}R$ ${a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

/** A largura da caixa, para desenhar no tamanho de verdade (o texto não encolhe no celular). */
function useLargura(padrao: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(padrao);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width) || padrao);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => { const x = Math.round(es[0]?.contentRect.width ?? 0); if (x > 0) setW(x); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [padrao]);
  return [ref, w] as const;
}

/** O contorno da cor do fundo nos textos sobre o gráfico: a linha que passa por trás não atrapalha a leitura. */
const HALO = { stroke: 'var(--surface)', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' } as const;

/** De quantos em quantos meses o eixo escreve o número. */
const passoDoEixo = (n: number) => (n <= 13 ? 1 : n <= 25 ? 3 : n <= 49 ? 6 : 12);

export function MesAMes({ k, prazo }: { k: ContasDoCenario; prazo: number }) {
  const [caixa, W] = useLargura(720);
  const [mes, setMes] = useState<number | null>(null);
  const [tabela, setTabela] = useState(true);
  const serie = k.serie;
  const noMes = useMemo(() => serie.map((v, m) => (m === 0 ? v : v - serie[m - 1]!)), [serie]);
  const n = serie.length;
  const estreito = W < 520;
  const esq = estreito ? 54 : 70;
  const dir = 12;
  const topo = 20;
  const H1 = estreito ? 150 : 190;
  const meio = 30;
  const H2 = estreito ? 74 : 92;
  const base = 26;
  const H = topo + H1 + meio + H2 + base;
  const banda = Math.max(1, W - esq - dir) / n;
  const x = (m: number) => esq + (m + 0.5) * banda;

  // o acumulado
  const max1 = Math.max(0, ...serie);
  const min1 = Math.min(0, ...serie);
  const y1 = (v: number) => topo + ((max1 - v) / (max1 - min1 || 1)) * H1;
  const caminho = serie.map((v, m) => `${m ? 'L' : 'M'}${x(m).toFixed(1)},${y1(v).toFixed(1)}`).join(' ');
  const area = `${caminho} L${x(n - 1).toFixed(1)},${y1(0).toFixed(1)} L${x(0).toFixed(1)},${y1(0).toFixed(1)} Z`;
  const pagou = k.sePagaEm.tipo === 'mes' && !k.sePagaEm.depoisDoPrazo ? k.sePagaEm.mes : null;
  const pior = serie.indexOf(min1 < 0 ? min1 : Number.NaN);

  // o lucro de cada mês: a escala é a dos meses depois da assinatura (o mês 0, maior, é cortado)
  const depois = noMes.slice(1);
  let hi = Math.max(0, ...depois);
  let lo = Math.min(0, ...depois);
  const loDeVerdade = lo < 0;
  if (hi === 0 && lo === 0) hi = Math.max(1, noMes[0]! > 0 ? noMes[0]! : 0);
  if (noMes[0]! < lo) lo = Math.min(lo, -Math.max(hi, 1) * 0.45);
  const topo2 = topo + H1 + meio;
  const y2 = (v: number) => topo2 + ((hi - v) / (hi - lo || 1)) * H2;
  const corta = (v: number) => v > hi || v < lo;

  const passo = passoDoEixo(n);
  const eixo = Array.from({ length: n }, (_, m) => m).filter((m) => m % passo === 0);
  // o último mês também, quando não fica colado no número de antes
  if (eixo[eixo.length - 1] !== n - 1 && n - 1 - eixo[eixo.length - 1]! >= passo / 2) eixo.push(n - 1);
  const aponta = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = Math.floor((e.clientX - r.left - esq) / banda);
    setMes(m >= 0 && m < n ? m : null);
  };
  const fim = serie[n - 1]!;
  const ponta = mes == null ? null : { esq: x(mes) > W - 200 };

  return (
    <section className="card p-4 min-w-0" aria-label="O mês a mês do contrato" id="simulador-mes-a-mes">
      <header className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 className="font-display font-semibold text-[15px]">Mês a mês <span className="font-body font-normal text-[12.5px] text-muted">· o lucro de cada mês e o acumulado, do mês 0 (a assinatura) ao mês {prazo}</span></h2>
        <span className="text-[12.5px] text-ink-2">
          {pagou != null ? <>Se paga no <b>mês {pagou}</b> · </> : null}no fim: <b className={`tabular-nums ${fim < 0 ? 'text-bad' : 'text-ok'}`}>{reaisLimpo(fim)}</b>
        </span>
      </header>
      {/* no celular, o toque escolhe o mês e o valor fica (o dedo sair da tela não apaga) */}
      <div ref={caixa} className="relative select-none" onPointerLeave={(e) => { if (e.pointerType !== 'touch') setMes(null); }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full touch-pan-y" role="img" id="simulador-mes-a-mes-grafico"
          aria-label={`O acumulado começa em ${reaisLimpo(serie[0]!)} e termina em ${reaisLimpo(fim)}${pagou != null ? `; a venda se paga no mês ${pagou}` : ''}. Os valores de cada mês estão na tabela.`}
          onPointerMove={aponta} onPointerDown={aponta}>
          <defs>
            <clipPath id="mam-acima"><rect x="0" y="0" width={W} height={Math.max(0, y1(0))} /></clipPath>
            <clipPath id="mam-abaixo"><rect x="0" y={y1(0)} width={W} height={Math.max(0, H - y1(0))} /></clipPath>
          </defs>
          {/* o acumulado */}
          <text x={esq} y={12} fontSize="11.5" fontWeight="600" fill="var(--ink-2)">Acumulado (R$)</text>
          {[max1, 0, min1].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
            <line key={`a${v}`} x1={esq} x2={W - dir} y1={y1(v)} y2={y1(v)} stroke={v === 0 ? 'var(--line-strong)' : 'var(--line)'} strokeDasharray={v === 0 ? '4 3' : undefined} />
          ))}
          {semEncostar([0, max1, min1], y1).map((v) => (
            <text key={`ra${v}`} x={esq - 6} y={y1(v) + 4} fontSize="11" fill="var(--muted)" textAnchor="end">{noEixo(v)}</text>
          ))}
          <path d={area} fill="var(--ok-soft)" clipPath="url(#mam-acima)" />
          <path d={area} fill="var(--bad-soft)" clipPath="url(#mam-abaixo)" />
          <path d={caminho} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" />
          {n <= 49 && serie.map((v, m) => <circle key={m} cx={x(m)} cy={y1(v)} r={mes === m ? 4.5 : 2.4} fill={v < 0 ? 'var(--bad)' : 'var(--ok)'} />)}
          {/* o pior momento, quando há espaço entre ele e o zero (perto do zero, a tabela e o mouse dizem) */}
          {pior >= 0 && pior !== mes && y1(min1) - y1(0) >= 24 && (
            <text x={x(pior) + (x(pior) > W - 140 ? -8 : 8)} y={Math.max(topo + 12, y1(min1) - 8)} fontSize="11" fontWeight="600" fill="var(--bad)" {...HALO}
              textAnchor={x(pior) > W - 140 ? 'end' : 'start'}>o pior momento: {curto(min1)}</text>
          )}
          {pagou != null && (
            <g>
              <line x1={x(pagou)} x2={x(pagou)} y1={topo} y2={topo + H1} stroke="var(--ok)" strokeDasharray="2 3" />
              <text x={x(pagou) + (x(pagou) > W - 140 ? -6 : 6)} y={topo + 12} fontSize="11.5" fontWeight="600" fill="var(--ok)" {...HALO} textAnchor={x(pagou) > W - 140 ? 'end' : 'start'}>se paga no mês {pagou}</text>
            </g>
          )}
          {/* o lucro de cada mês */}
          <text x={esq} y={topo2 - 10} fontSize="11.5" fontWeight="600" fill="var(--ink-2)">Lucro do mês (R$)</text>
          {[hi, 0, lo].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
            <line key={`b${v}`} x1={esq} x2={W - dir} y1={y2(v)} y2={y2(v)} stroke={v === 0 ? 'var(--line-strong)' : 'var(--line)'} />
          ))}
          {/* o espaço embaixo do zero, aberto só para a barra da assinatura, não ganha número */}
          {semEncostar([0, hi, ...(loDeVerdade ? [lo] : [])], y2).map((v) => (
            <text key={`rb${v}`} x={esq - 6} y={y2(v) + 4} fontSize="11" fill="var(--muted)" textAnchor="end">{noEixo(v)}</text>
          ))}
          {noMes.map((v, m) => {
            const alvo = Math.min(hi, Math.max(lo, v));
            const a = y2(0); const b = y2(alvo);
            const w = Math.max(1, banda * 0.66);
            return (
              <g key={m}>
                <rect x={x(m) - w / 2} y={Math.min(a, b)} width={w} height={Math.max(v === 0 ? 0 : 1, Math.abs(b - a))} rx={Math.min(2, w / 3)}
                  fill={v < 0 ? 'var(--bad)' : 'var(--ok)'} opacity={mes == null || mes === m ? 1 : 0.55} />
                {corta(v) && (
                  <>
                    <line x1={x(m) - w / 2 - 2} x2={x(m) + w / 2 + 2} y1={b + (v < 0 ? -5 : 5)} y2={b + (v < 0 ? -9 : 1)} stroke="var(--surface)" strokeWidth="2.5" />
                    <text x={x(m) + w / 2 + 4} y={v < 0 ? b - 2 : b + 11} fontSize="11" fontWeight="600" fill={v < 0 ? 'var(--bad)' : 'var(--ok)'} {...HALO}>{curto(v)}</text>
                  </>
                )}
              </g>
            );
          })}
          {/* os meses */}
          {eixo.map((m) => (
            <text key={`m${m}`} x={x(m)} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="middle">{m}</text>
          ))}
          {mes != null && <line x1={x(mes)} x2={x(mes)} y1={topo} y2={topo2 + H2} stroke="var(--ink-2)" strokeWidth="1" opacity="0.5" />}
        </svg>
        {mes != null && ponta && (
          <div className="absolute top-1 pointer-events-none card shadow-lg px-3 py-2 text-[12.5px] min-w-[170px]" role="status" id="simulador-mes-a-mes-valor"
            style={ponta.esq ? { right: Math.max(0, W - x(mes) + 10) } : { left: x(mes) + 10 }}>
            <div className="font-semibold text-ink">{mes === 0 ? 'Mês 0 · a assinatura' : `Mês ${mes}`}</div>
            <div className="flex justify-between gap-3"><span className="text-muted">Lucro do mês</span><b className={`tabular-nums ${noMes[mes]! < 0 ? 'text-bad' : 'text-ok'}`}>{reaisLimpo(noMes[mes]!)}</b></div>
            <div className="flex justify-between gap-3"><span className="text-muted">Acumulado</span><b className={`tabular-nums ${serie[mes]! < 0 ? 'text-bad' : 'text-ink'}`}>{reaisLimpo(serie[mes]!)}</b></div>
          </div>
        )}
      </div>
      <p className="text-[12px] text-muted mt-1">O mês 0 é a assinatura: o que sai de uma vez (os aparelhos à vista, a instalação) e a primeira parcela da ativação. Passe o mouse (ou toque) num mês para ver os valores.</p>
      <button type="button" className="btn-ghost btn-sm mt-2 -ml-2" onClick={() => setTabela((t) => !t)} aria-expanded={tabela} id="simulador-mes-a-mes-tabela-botao">
        {tabela ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {tabela ? 'Esconder a tabela' : 'Ver a tabela mês a mês'}
      </button>
      {tabela && (
        <div className="mt-1 max-h-[320px] overflow-y-auto border border-line rounded-lg" id="simulador-mes-a-mes-tabela">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface-2 text-[12px] text-muted">
              <tr><th className="text-left font-semibold px-3 py-1.5">Mês</th><th className="text-right font-semibold px-3 py-1.5">Lucro do mês</th><th className="text-right font-semibold px-3 py-1.5">Acumulado</th></tr>
            </thead>
            <tbody>
              {serie.map((v, m) => (
                <tr key={m} className={`border-t border-line ${mes === m ? 'bg-accent-soft' : ''}`} data-mes={m}>
                  <td className="px-3 py-1.5 text-ink-2">{m === 0 ? '0 · a assinatura' : m}{m === pagou && <span className="ml-1.5 text-[11.5px] font-semibold text-ok">se paga</span>}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${noMes[m]! < 0 ? 'text-bad' : ''}`}>{reaisLimpo(noMes[m]!)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${v < 0 ? 'text-bad' : 'text-ink'}`}>{reaisLimpo(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
