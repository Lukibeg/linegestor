/**
 * O mês a mês do contrato (o Simulador do Comercial, 2.0.2), no alto da simulação. O Luan, em três comentários na
 * prévia: "quero esse gráfico mais detalhado mensalmente, com os valores acumulado e lucro por mês"; "seria legal
 * um kpi com mês a mês custo e faturamento e, num hover na coluna de cada um, o detalhe: esse mês eu faturei
 * 5.000 — 3 mil de ativação e 2 mil de mensalidade —, e a mesma coisa com os custos"; e "o primeiro mês de
 * pagamento vai ser o primeiro mês de faturamento também; quero esse gráfico junto à tabela na parte de cima".
 *
 * Em cima, os totais do contrato (o faturamento, os custos, o lucro e quando a venda se paga). Depois, a linha do
 * acumulado (verde acima do zero, vermelho abaixo), com o pior momento e o mês em que a venda se paga. Passar o
 * mouse — ou tocar, no celular — num mês mostra o detalhe dele: cada parte do faturamento e dos custos, o lucro
 * e o acumulado. A tabela, sempre aberta, tem todos os meses: passar o mouse numa linha marca o mês no gráfico, e
 * um clique abre o detalhe do mês embaixo dela. O 1º mês é o da assinatura: a ativação (ou a 1ª parcela), a 1ª
 * mensalidade, o que é pago de uma vez e os custos do mês.
 *
 * O gráfico de colunas (o faturamento para cima, os custos para baixo e o ponto do lucro de cada mês) saiu no 2.3
 * (o Luan, 29/10: "n quero mais esse gráfico em barras n"; e, perguntado, "vc vai tirar apenas o de coluna, o de
 * linha abaixo vai ficar"). O detalhe de cada mês, que vinha no mouse sobre a coluna, vem na linha do acumulado e
 * na tabela.
 *
 * O conserto do 2.0.3 (o Luan, 21/10: "esse gráfico aqui ta meio bugado, dê uma melhorada"): a escala era o maior e o
 * menor valor dos meses ("4,9 mil", "−6 mil"), com as colunas grudadas na borda — agora vai em números redondos
 * (`escalaRedonda`), com as marcas no meio; o valor da coluna cortada ficava ao lado dela, e a coluna do mês seguinte,
 * desenhada depois, o cobria ("R$ 9," e "−R$ 1") — agora fica numa faixa só dele, acima (ou abaixo) do gráfico,
 * desenhado por último; e a marca do corte, um traço branco inclinado que passava da coluna, virou um vão reto na
 * largura da coluna. (As colunas saíram no 2.3; a escala redonda continua no acumulado.)
 */
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { textoDoSePagaEm, type ContasDoCenario, type MesDoContrato } from '@gestor/shared';
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

/** "−R$ 840,50": o valor de um mês, sem arredondar (2.1.2: "to vendo que ele arredonda os valores, n quero isso"). */
function exato(centavos: number): string {
  return `${centavos < 0 ? '−' : ''}${reaisLimpo(Math.abs(centavos))}`;
}

/** "R$ 15,6 mil", "−R$ 840": os números curtos — só nas marcas dos eixos (a escala), nunca no valor de um mês. */
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

/**
 * Um passo redondo — 1, 2 ou 5 vezes uma potência de 10, o mais perto de dividir a amplitude em `alvo` partes (a
 * fronteira entre um e outro é a média geométrica: 1,41, 3,16 e 7,07).
 */
function passoRedondo(amplitude: number, alvo: number): number {
  const bruto = amplitude / Math.max(1, alvo);
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const m = bruto / pot;
  return (m >= 7.07 ? 10 : m >= 3.16 ? 5 : m >= 1.41 ? 2 : 1) * pot;
}

/**
 * A escala de um gráfico que passa pelo zero (`max` ≥ 0 ≥ `min`, em centavos), com as marcas em números redondos (o
 * zero é uma delas). `justa`: o gráfico vai do menor ao maior valor, com uma folga, e as marcas ficam dentro (o
 * acumulado: arredondar o lado pequeno ao passo deixaria um vão grande); sem ela, os dois lados vão até a marca
 * redonda seguinte (as colunas: nenhuma encosta na borda sem uma marca ali). Sem nada, R$ 1 para cada lado.
 */
export function escalaRedonda(max: number, min: number, alvo: number, justa = false): { hi: number; lo: number; marcas: number[] } {
  const amp = Math.max(100, max - min);
  const passo = passoRedondo(amp, alvo);
  let hi: number; let lo: number;
  if (justa) {
    const folga = amp * 0.06;
    hi = max > 0 ? max + folga : 0;
    lo = min < 0 ? min - folga : 0;
  } else {
    hi = Math.max(0, Math.ceil(max / passo - 1e-9) * passo);
    lo = Math.min(0, Math.floor(min / passo + 1e-9) * passo);
  }
  if (!hi && !lo) { hi = 100; lo = -100; }
  const marcas: number[] = [];
  for (let v = Math.ceil(lo / passo - 1e-9) * passo; v <= hi + 1e-9; v += passo) marcas.push(Math.round(v / passo) * passo);
  return { hi, lo, marcas: marcas.includes(0) ? marcas : [...marcas, 0] };
}

/** De quantos em quantos meses o eixo escreve o número. */
const passoDoEixo = (n: number) => (n <= 13 ? 1 : n <= 25 ? 3 : n <= 49 ? 6 : 12);

/** O detalhe de um mês: o faturamento e os custos, parte a parte, o lucro e o acumulado. */
function DetalheDoMes({ m, pagou, deQual }: { m: MesDoContrato; pagou: number | null; deQual: (p: { produto?: string | null }) => string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-ink flex flex-wrap items-baseline gap-x-2">
        Mês {m.mes}{m.mes === 1 && <span className="font-normal text-muted">· o da assinatura</span>}
        {m.mes === pagou && <span className="text-[11.5px] font-semibold text-ok">se paga</span>}
      </div>
      <div className="flex justify-between gap-4"><span className="text-ink-2 inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent" aria-hidden />Faturamento</span><b className="tabular-nums text-ink">{reaisLimpo(m.faturamento)}</b></div>
      {m.entra.length > 0 && (
        <ul className="text-[12px] text-muted pl-4 -mt-0.5">
          {m.entra.map((p) => <li key={p.rotulo} className="flex justify-between gap-4"><span className="min-w-0">{p.rotulo}</span><span className="tabular-nums">{reaisLimpo(p.valor)}</span></li>)}
        </ul>
      )}
      <div className="flex justify-between gap-4"><span className="text-ink-2 inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-signal" aria-hidden />Custos</span><b className="tabular-nums text-ink">{reaisLimpo(m.custos)}</b></div>
      {m.sai.length > 0 && (
        <ul className="text-[12px] text-muted pl-4 -mt-0.5">
          {m.sai.map((p, i) => <li key={`${p.rotulo}${i}`} className="flex justify-between gap-4"><span className="min-w-0">{p.rotulo}{deQual(p)}</span><span className="tabular-nums">{reaisLimpo(p.valor)}</span></li>)}
        </ul>
      )}
      <div className="flex justify-between gap-4 pt-1 border-t border-line"><span className="text-ink-2">Lucro do mês</span><b className={`tabular-nums ${m.lucro < 0 ? 'text-bad' : 'text-ok'}`}>{reaisLimpo(m.lucro)}</b></div>
      <div className="flex justify-between gap-4"><span className="text-ink-2">Acumulado</span><b className={`tabular-nums ${m.acumulado < 0 ? 'text-bad' : 'text-ink'}`}>{reaisLimpo(m.acumulado)}</b></div>
    </div>
  );
}

/** `nomeDoProduto`: com dois produtos ou mais, o detalhe diz de qual produto é cada custo ("Configuração e instalação · LinePBX"). */
export function MesAMes({ k, prazo, nomeDoProduto }: { k: ContasDoCenario; prazo: number; nomeDoProduto?: (codigo: string) => string }) {
  const deQual = (p: { produto?: string | null }) => (nomeDoProduto && p.produto ? ` · ${nomeDoProduto(p.produto)}` : '');
  const [caixa, W] = useLargura(720);
  const [mes, setMes] = useState<number | null>(null);
  // o mês aberto na tabela (um clique na linha abre o detalhe embaixo dela; outro fecha)
  const [aberto, setAberto] = useState<number | null>(null);
  // o detalhe por cima do gráfico só quando o mês foi escolhido no gráfico (na tabela, ele abre embaixo da linha)
  const [noGrafico, setNoGrafico] = useState(false);
  const meses = k.meses;
  const n = Math.max(1, meses.length);
  const totais = useMemo(() => ({
    faturamento: meses.reduce((s, m) => s + m.faturamento, 0),
    custos: meses.reduce((s, m) => s + m.custos, 0),
  }), [meses]);
  const estreito = W < 560;
  const esq = estreito ? 54 : 72;
  const dir = 12;
  const H2 = estreito ? 150 : 190;
  const base = 26;
  const banda = Math.max(1, W - esq - dir) / n;
  const x = (i: number) => esq + (i + 0.5) * banda;
  const pagou = k.sePagaEm.tipo === 'mes' && !k.sePagaEm.depoisDoPrazo ? k.sePagaEm.mes : null;

  // o acumulado, em números redondos
  const serie = meses.map((m) => m.acumulado);
  const max2 = Math.max(0, ...serie);
  const min2 = Math.min(0, ...serie);
  const e2 = escalaRedonda(max2, min2, estreito ? 3 : 4, true);
  const topo2 = 26;
  const y2 = (v: number) => topo2 + ((e2.hi - v) / (e2.hi - e2.lo || 1)) * H2;
  const H = topo2 + H2 + base;
  const caminho = serie.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y2(v).toFixed(1)}`).join(' ');
  const area = `${caminho} L${x(n - 1).toFixed(1)},${y2(0).toFixed(1)} L${x(0).toFixed(1)},${y2(0).toFixed(1)} Z`;
  const pior = min2 < 0 ? serie.indexOf(min2) : -1;

  const passo = passoDoEixo(n);
  // o eixo: o 1º mês, de passo em passo, e o último quando não fica colado no de antes
  const eixo = Array.from({ length: n }, (_, i) => i).filter((i) => i === 0 || (i + 1) % passo === 0);
  if (eixo[eixo.length - 1] !== n - 1 && n - 1 - eixo[eixo.length - 1]! >= passo / 2) eixo.push(n - 1);
  const aponta = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - esq) / banda);
    setMes(i >= 0 && i < n ? i : null);
    setNoGrafico(true);
  };
  const fim = serie[n - 1] ?? 0;
  const escolhido = mes != null && noGrafico ? meses[mes] ?? null : null;

  return (
    <section className="card p-4 min-w-0" aria-label="O mês a mês do contrato" id="simulador-mes-a-mes">
      <header className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-display font-semibold text-[15px]">Mês a mês <span className="font-body font-normal text-[12.5px] text-muted">· o faturamento, os custos e o lucro de cada mês, do 1º (o da assinatura) ao {prazo}º</span></h2>
      </header>
      {/* os totais do contrato */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3" id="simulador-mes-a-mes-totais">
        <div className="rounded-lg bg-surface-2 px-3 py-2" data-total-do-contrato="faturamento">
          <dt className="text-[12px] text-ink-2 inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent" aria-hidden />Faturamento</dt>
          <dd className="font-display text-[17px] font-semibold tabular-nums">{reaisLimpo(totais.faturamento)}</dd>
          <dd className="text-[11.5px] text-muted">no contrato</dd>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2" data-total-do-contrato="custos">
          <dt className="text-[12px] text-ink-2 inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-signal" aria-hidden />Custos</dt>
          <dd className="font-display text-[17px] font-semibold tabular-nums">{reaisLimpo(totais.custos)}</dd>
          <dd className="text-[11.5px] text-muted">no contrato</dd>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2" data-total-do-contrato="lucro">
          <dt className="text-[12px] text-ink-2 inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${fim < 0 ? 'bg-bad' : 'bg-ok'}`} aria-hidden />Lucro</dt>
          <dd className={`font-display text-[17px] font-semibold tabular-nums ${fim < 0 ? 'text-bad' : 'text-ok'}`}>{reaisLimpo(fim)}</dd>
          <dd className="text-[11.5px] text-muted">no contrato</dd>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2" data-total-do-contrato="se-paga">
          <dt className="text-[12px] text-ink-2">Se paga</dt>
          <dd className={`font-display text-[17px] font-semibold ${k.sePagaEm.tipo === 'nunca' || (k.sePagaEm.tipo === 'mes' && k.sePagaEm.depoisDoPrazo) ? 'text-bad' : ''}`}>{textoDoSePagaEm(k.sePagaEm)}</dd>
          <dd className="text-[11.5px] text-muted">{k.investimento ? `sai antes ${reaisLimpo(k.investimento)}` : 'nunca no vermelho'}</dd>
        </div>
      </dl>
      {/* no celular, o toque escolhe o mês e o valor fica (o dedo sair da tela não apaga) */}
      <div ref={caixa} className="relative select-none" onPointerLeave={(e) => { if (e.pointerType !== 'touch') setMes(null); }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full touch-pan-y" role="img" id="simulador-mes-a-mes-grafico"
          aria-label={`No contrato, o faturamento é ${reaisLimpo(totais.faturamento)}, os custos ${reaisLimpo(totais.custos)} e o lucro ${reaisLimpo(fim)}${pagou != null ? `; a venda se paga no mês ${pagou}` : ''}. Os valores de cada mês estão na tabela.`}
          onPointerMove={aponta} onPointerDown={aponta}>
          <defs>
            <clipPath id="mam-acima"><rect x="0" y="0" width={W} height={Math.max(0, y2(0))} /></clipPath>
            <clipPath id="mam-abaixo"><rect x="0" y={y2(0)} width={W} height={Math.max(0, H - y2(0))} /></clipPath>
          </defs>
          {/* o mês escolhido */}
          {mes != null && <rect x={x(mes) - banda / 2} y={topo2 - 4} width={banda} height={H2 + 8} fill="var(--ink)" opacity="0.06" rx="3" />}

          {/* o acumulado */}
          <text x={esq} y={topo2 - 12} fontSize="11.5" fontWeight="600" fill="var(--ink-2)">Acumulado (R$)</text>
          {e2.marcas.map((v) => (
            <line key={`b${v}`} x1={esq} x2={W - dir} y1={y2(v)} y2={y2(v)} stroke={v === 0 ? 'var(--line-strong)' : 'var(--line)'} strokeDasharray={v === 0 ? '4 3' : undefined} />
          ))}
          {semEncostar([0, ...e2.marcas], y2).map((v) => (
            <text key={`rb${v}`} x={esq - 6} y={y2(v) + 4} fontSize="11" fill="var(--muted)" textAnchor="end">{noEixo(v)}</text>
          ))}
          <path d={area} fill="var(--ok-soft)" clipPath="url(#mam-acima)" />
          <path d={area} fill="var(--bad-soft)" clipPath="url(#mam-abaixo)" />
          <path d={caminho} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" />
          {n <= 49 && serie.map((v, i) => <circle key={i} cx={x(i)} cy={y2(v)} r={mes === i ? 4.5 : 2.4} fill={v < 0 ? 'var(--bad)' : 'var(--ok)'} />)}
          {/* o pior momento, quando há espaço entre ele e o zero (perto do zero, a tabela e o mouse dizem) */}
          {pior >= 0 && pior !== mes && y2(min2) - y2(0) >= 24 && (
            <text x={x(pior) + (x(pior) > W - 150 ? -8 : 8)} y={Math.min(topo2 + H2 - 2, y2(min2) + 4)} fontSize="11" fontWeight="600" fill="var(--bad)" {...HALO}
              textAnchor={x(pior) > W - 150 ? 'end' : 'start'}>o pior momento: {exato(min2)}</text>
          )}
          {pagou != null && (
            <g>
              <line x1={x(pagou - 1)} x2={x(pagou - 1)} y1={topo2} y2={topo2 + H2} stroke="var(--ok)" strokeDasharray="2 3" />
              <text x={x(pagou - 1) + (x(pagou - 1) > W - 140 ? -6 : 6)} y={topo2 + 12} fontSize="11.5" fontWeight="600" fill="var(--ok)" {...HALO} textAnchor={x(pagou - 1) > W - 140 ? 'end' : 'start'}>se paga no mês {pagou}</text>
            </g>
          )}
          {/* os meses */}
          {eixo.map((i) => (
            <text key={`m${i}`} x={x(i)} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="middle">{i + 1}</text>
          ))}
        </svg>
        {escolhido && !estreito && (
          <div className="absolute top-1 pointer-events-none card shadow-lg px-3 py-2 text-[12.5px] w-[290px] max-w-[60%]" role="status" id="simulador-mes-a-mes-valor"
            style={x(mes!) > W / 2 ? { right: Math.max(0, W - x(mes!) + banda / 2 + 8) } : { left: x(mes!) + banda / 2 + 8 }}>
            <DetalheDoMes m={escolhido} pagou={pagou} deQual={deQual} />
          </div>
        )}
      </div>
      {estreito && (
        <div className="mt-2 rounded-lg border border-line px-3 py-2 text-[12.5px]" role="status" id={escolhido ? 'simulador-mes-a-mes-valor' : undefined}>
          {escolhido ? <DetalheDoMes m={escolhido} pagou={pagou} deQual={deQual} /> : <span className="text-muted">Toque num mês do gráfico, ou numa linha da tabela, para ver o detalhe: o que entrou, o que saiu e o lucro.</span>}
        </div>
      )}
      <p className="text-[12px] text-muted mt-2">
        O 1º mês é o da assinatura: nele entram a ativação (ou a 1ª parcela) e a 1ª mensalidade, e saem o que é pago de uma vez (os aparelhos à vista, a comissão da venda) e os custos do mês.
        {estreito ? '' : ' Passe o mouse num mês do gráfico, ou clique numa linha da tabela, para ver o detalhe.'}
      </p>
      {/* a tabela, sempre aberta (2.3): um clique na linha abre o detalhe do mês embaixo dela */}
      <div className="mt-3 max-h-[420px] overflow-auto border border-line rounded-lg" id="simulador-mes-a-mes-tabela">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface-2 text-[12px] text-muted">
              <tr>
                <th className="text-left font-semibold px-3 py-1.5">Mês</th>
                <th className="text-right font-semibold px-3 py-1.5">Faturamento</th>
                <th className="text-right font-semibold px-3 py-1.5">Custos</th>
                <th className="text-right font-semibold px-3 py-1.5">Lucro do mês</th>
                <th className="text-right font-semibold px-3 py-1.5">Acumulado</th>
              </tr>
            </thead>
            <tbody onMouseLeave={() => { if (!noGrafico) setMes(null); }}>
              {meses.map((m, i) => (
                <Fragment key={m.mes}>
                <tr className={`border-t border-line cursor-pointer ${mes === i || aberto === i ? 'bg-accent-soft' : 'hover:bg-surface-2'}`} data-mes={m.mes}
                  aria-expanded={aberto === i} title={aberto === i ? 'Fechar o detalhe do mês' : 'Ver o detalhe do mês'}
                  onMouseEnter={() => { setMes(i); setNoGrafico(false); }} onClick={() => { setMes(i); setNoGrafico(false); setAberto((a) => (a === i ? null : i)); }}>
                  <td className="px-3 py-1.5 text-ink-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {aberto === i ? <ChevronDown size={13} className="text-muted" aria-hidden /> : <ChevronRight size={13} className="text-muted" aria-hidden />}
                      {m.mes === 1 ? '1 · a assinatura' : m.mes}
                    </span>
                    {m.mes === pagou && <span className="ml-1.5 text-[11.5px] font-semibold text-ok">se paga</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{reaisLimpo(m.faturamento)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{reaisLimpo(m.custos)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${m.lucro < 0 ? 'text-bad' : ''}`}>{reaisLimpo(m.lucro)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${m.acumulado < 0 ? 'text-bad' : 'text-ink'}`}>{reaisLimpo(m.acumulado)}</td>
                </tr>
                {aberto === i && (
                  <tr className="bg-surface-2/60" data-detalhe-do-mes={m.mes}>
                    <td colSpan={5} className="px-3 py-2 text-[12.5px]">
                      {/* no celular a tabela corre para o lado: o detalhe fica parado, na largura da tela */}
                      <div className={estreito ? 'sticky left-3' : 'max-w-[420px] ml-auto'} style={estreito ? { width: Math.max(220, W - 26) } : undefined}>
                        <DetalheDoMes m={m} pagou={pagou} deQual={deQual} />
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-surface-2">
              <tr className="border-t border-line-strong font-semibold">
                <td className="px-3 py-1.5">No contrato</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{reaisLimpo(totais.faturamento)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{reaisLimpo(totais.custos)}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${fim < 0 ? 'text-bad' : 'text-ok'}`}>{reaisLimpo(fim)}</td>
                <td className="px-3 py-1.5" />
              </tr>
            </tfoot>
          </table>
      </div>
    </section>
  );
}
