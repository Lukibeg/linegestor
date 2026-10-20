/**
 * Os números do cenário (o Simulador do Comercial, 2.0.2): o que sobra por mês, a margem com o sinal, o custo
 * do mês, o que sai antes, quando a venda se paga e o que fica no contrato; a linha do tempo do contrato (o
 * acumulado mês a mês, do vermelho dos aparelhos ao mês em que vira lucro); o preço (a mensalidade mínima
 * pela margem que se quer e o desconto máximo sem sair do verde); e os cenários lado a lado.
 */
import { useId, type ReactNode } from 'react';
import { AlertTriangle, Star } from 'lucide-react';
import {
  percentual, percentualDaFracao, textoDasFaixas, textoDoSePagaEm,
  type AjustesDoSimulador, type CenarioDaSimulacao, type ContasDoCenario,
} from '@gestor/shared';
import { CampoDePercentual, ChipDoSinal, reais, reaisLimpo } from './comum.js';

function Linha({ rotulo, valor, dica, tom, id }: { rotulo: ReactNode; valor: ReactNode; dica?: ReactNode; tom?: 'bad' | 'ok'; id?: string }) {
  return (
    <div className="py-2 flex items-baseline justify-between gap-3" id={id}>
      <dt className="text-ink-2 min-w-0">{rotulo}{dica && <span className="block text-[12px] text-muted">{dica}</span>}</dt>
      <dd className={`tabular-nums font-semibold text-right whitespace-nowrap ${tom === 'bad' ? 'text-bad' : tom === 'ok' ? 'text-ok' : 'text-ink'}`}>{valor}</dd>
    </div>
  );
}

/** Os números do cenário aberto. `mudar` muda a margem que se quer (o preço mínimo). */
export function OsNumeros({ c, k, ajustes, mudar, podeEditar }: {
  c: CenarioDaSimulacao; k: ContasDoCenario; ajustes: AjustesDoSimulador; mudar: (m: Partial<CenarioDaSimulacao>) => void; podeEditar: boolean;
}) {
  const ruimDePagar = k.sePagaEm.tipo === 'nunca' || (k.sePagaEm.tipo === 'mes' && k.sePagaEm.depoisDoPrazo);
  const partesDoCusto = [`fixos ${reaisLimpo(k.custoMensalFixo)}`, `imposto ${reaisLimpo(k.impostoMensal)}`, ...(k.comissaoMensal ? [`comissão ${reaisLimpo(k.comissaoMensal)}`] : [])];
  return (
    <div className="flex flex-col gap-4" id="simulador-numeros">
      <section className="card p-4" aria-label={`Os números do ${c.nome}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow">Os números · {c.nome}</span>
          <ChipDoSinal sinal={k.sinal} margem={k.margem} />
        </div>
        <div className="mt-3 text-[13px] text-ink-2">Sobra por mês</div>
        <div className={`font-display text-[30px] leading-tight font-semibold tabular-nums ${k.sobraMensal < 0 ? 'text-bad' : 'text-ink'}`} id="simulador-sobra">{reais(k.sobraMensal)}</div>
        <div className="text-[12.5px] text-muted">{k.margem == null ? 'Ponha a mensalidade para ver a margem.' : `${percentualDaFracao(k.margem)} do que o cliente paga por mês`}</div>
        <dl className="mt-3 divide-y divide-line text-[13.5px] border-t border-line">
          <Linha rotulo="O cliente paga por mês" valor={reais(k.mensalTotal)} dica={k.aluguel ? `mensalidade ${reaisLimpo(c.mensalidade)} + aluguel dos aparelhos ${reaisLimpo(k.aluguel)}` : undefined} />
          <Linha rotulo="O custo do mês" valor={reais(k.custoMensal)} dica={partesDoCusto.join(' + ')} />
          <Linha rotulo="A ativação" valor={reais(k.entradaTotal)}
            dica={[k.vendaDeAparelhos ? `ativação ${reaisLimpo(c.ativacao)} + aparelhos vendidos ${reaisLimpo(k.vendaDeAparelhos)}` : '', k.parcelas.length > 1 ? `em ${k.parcelas.length}x de ${reaisLimpo(k.parcelas[k.parcelas.length - 1]!)}` : ''].filter(Boolean).join(' · ') || undefined} />
          <Linha rotulo="Sai antes" valor={k.investimento ? reais(k.investimento) : 'nada'} id="simulador-investimento"
            dica={k.investimento ? 'o pior momento do contrato: os aparelhos e o resto, antes de a venda se pagar' : 'a ativação cobre o que é pago de uma vez'} />
          <Linha rotulo="Se paga" valor={textoDoSePagaEm(k.sePagaEm)} tom={ruimDePagar ? 'bad' : undefined} id="simulador-se-paga" />
          <Linha rotulo={`No contrato (${c.prazo} ${c.prazo === 1 ? 'mês' : 'meses'})`} valor={reais(k.resultado)} tom={k.resultado < 0 ? 'bad' : undefined} id="simulador-contrato" />
        </dl>
        <LinhaDoTempo k={k} prazo={c.prazo} />
      </section>

      <section className="card p-4" aria-label="O preço" id="simulador-preco">
        <span className="eyebrow">O preço</span>
        <label className="mt-2 flex items-center justify-between gap-3 text-[13.5px]">
          <span className="text-ink-2">A margem que você quer</span>
          <CampoDePercentual valor={c.margemAlvo} onChange={(v) => mudar({ margemAlvo: Math.min(95, v ?? 0) })} className="w-[88px] shrink-0" aria-label="A margem que você quer" disabled={!podeEditar} id="simulador-margem-alvo" />
        </label>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="text-[13.5px] text-ink-2">A mensalidade mínima para ela</span>
          <span className="font-display text-xl font-semibold tabular-nums text-right" id="simulador-minima">{k.minima == null ? 'nenhuma dá' : reais(k.minima)}</span>
        </div>
        {k.minima == null && <p className="text-[12.5px] text-muted">O imposto e as comissões já passam dessa margem.</p>}
        <div className="mt-3 pt-3 border-t border-line text-[13.5px] flex items-baseline justify-between gap-3">
          <span className="text-ink-2">Desconto máximo sem sair do verde</span>
          <span className="font-semibold tabular-nums text-right" id="simulador-desconto">
            {k.descontoMaximo == null ? '—' : k.descontoMaximo === 0 ? 'nenhum' : `${reaisLimpo(k.descontoMaximo)} (${percentualDaFracao(k.descontoMaximo / Math.max(1, c.mensalidade))})`}
          </span>
        </div>
        {k.minimaVerde != null && k.descontoMaximo === 0 && c.mensalidade > 0 && (
          <p className="text-[12.5px] text-muted mt-1">Para o verde, a mensalidade vai a {reaisLimpo(k.minimaVerde)} ou mais.</p>
        )}
        <p className="text-[12px] text-muted mt-2">O sinal: {textoDasFaixas(ajustes)} (os Ajustes do Simulador).</p>
      </section>

      {k.faltam.length > 0 && (
        <div className="card p-3 border-signal text-[13px] flex gap-2" role="status" id="simulador-faltam">
          <AlertTriangle size={16} className="text-signal shrink-0 mt-0.5" aria-hidden />
          <span>Falta o valor de {k.faltam.length === 1 ? '' : `${k.faltam.length} custos: `}<b>{k.faltam.join(', ')}</b>. Sem ele, a conta fica sem esse custo.</span>
        </div>
      )}
    </div>
  );
}

/**
 * A linha do tempo do contrato: o acumulado mês a mês (o mês 0 é a assinatura). Abaixo de zero, vermelho;
 * acima, verde; o ponto onde a venda se paga e o que fica no fim, escritos.
 */
export function LinhaDoTempo({ k, prazo }: { k: ContasDoCenario; prazo: number }) {
  const id = useId().replace(/:/g, '');
  const W = 340; const H = 150; const esq = 6; const dir = 6; const topo = 22; const base = 22;
  const p = k.serie;
  const max = Math.max(0, ...p); const min = Math.min(0, ...p);
  const faixa = max - min || 1;
  const x = (m: number) => esq + (m / Math.max(1, prazo)) * (W - esq - dir);
  const y = (v: number) => topo + ((max - v) / faixa) * (H - topo - base);
  const caminho = p.map((v, m) => `${m ? 'L' : 'M'}${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${caminho} L${x(prazo).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const pagou = k.sePagaEm.tipo === 'mes' && !k.sePagaEm.depoisDoPrazo ? k.sePagaEm.mes : null;
  // o ponto exato em que a linha cruza o zero (entre o mês de antes e o mês em que se paga)
  const cruza = pagou == null ? null : (() => {
    const a = p[pagou - 1] ?? 0; const b = p[pagou] ?? 0;
    return b === a ? pagou : pagou - 1 + Math.min(1, Math.max(0, -a / (b - a)));
  })();
  const fim = p[p.length - 1]!;
  const meio = Math.round(prazo / 2);
  return (
    <figure className="mt-3" aria-label={`O acumulado do contrato: começa em ${reaisLimpo(p[0]!)} e termina em ${reaisLimpo(fim)}${pagou ? `; vira lucro no mês ${pagou}` : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" id="simulador-grafico">
        <defs>
          <clipPath id={`acima-${id}`}><rect x="0" y="0" width={W} height={Math.max(0, y(0))} /></clipPath>
          <clipPath id={`abaixo-${id}`}><rect x="0" y={y(0)} width={W} height={Math.max(0, H - y(0))} /></clipPath>
        </defs>
        <path d={area} fill="var(--ok-soft)" clipPath={`url(#acima-${id})`} />
        <path d={area} fill="var(--bad-soft)" clipPath={`url(#abaixo-${id})`} />
        <line x1={esq} x2={W - dir} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeDasharray="3 3" />
        <path d={caminho} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {[0, meio, prazo].filter((m, i, a) => a.indexOf(m) === i).map((m) => (
          <text key={m} x={x(m)} y={H - 6} fontSize="10.5" fill="var(--muted)" textAnchor={m === 0 ? 'start' : m === prazo ? 'end' : 'middle'}>{m === 0 ? 'assinatura' : `mês ${m}`}</text>
        ))}
        {pagou != null && cruza != null && <circle cx={x(cruza)} cy={y(0)} r="4.5" fill="var(--ok)" stroke="var(--surface)" strokeWidth="2" />}
        <text x={W - dir} y={Math.max(13, Math.min(H - base - 4, y(fim) - 7))} fontSize="11" fontWeight="600" fill={fim < 0 ? 'var(--bad)' : 'var(--ok)'} textAnchor="end">{reaisLimpo(fim)}</text>
      </svg>
      <figcaption className="text-[12px] text-muted mt-1">
        {pagou != null && <span className="text-ink-2 font-semibold"><span className="inline-block w-2 h-2 rounded-full bg-ok mr-1 align-middle" aria-hidden />Vira lucro no mês {pagou}. </span>}
        O acumulado mês a mês: começa com o que é pago de uma vez (os aparelhos), e cada mês soma a sobra.{' '}
        <button type="button" className="link" id="simulador-ver-mes-a-mes"
          onClick={() => document.getElementById('simulador-mes-a-mes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Ver mês a mês</button>
      </figcaption>
    </figure>
  );
}

/** Os cenários lado a lado: os mesmos números, uma coluna por cenário; o clique no nome abre o cenário. */
export function LadoALado({ cenarios, contas, principal, aberto, abrir }: {
  cenarios: CenarioDaSimulacao[]; contas: ContasDoCenario[]; principal: string; aberto: string; abrir: (id: string) => void;
}) {
  const linhas: Array<{ rotulo: string; valor: (k: ContasDoCenario, c: CenarioDaSimulacao) => ReactNode; ruim?: (k: ContasDoCenario) => boolean }> = [
    { rotulo: 'O cliente paga por mês', valor: (k) => reaisLimpo(k.mensalTotal) },
    { rotulo: 'A ativação', valor: (k) => (k.parcelas.length > 1 ? `${reaisLimpo(k.entradaTotal)} em ${k.parcelas.length}x` : reaisLimpo(k.entradaTotal)) },
    { rotulo: 'O prazo', valor: (_k, c) => `${c.prazo} ${c.prazo === 1 ? 'mês' : 'meses'}` },
    { rotulo: 'Sobra por mês', valor: (k) => reaisLimpo(k.sobraMensal), ruim: (k) => k.sobraMensal < 0 },
    { rotulo: 'A margem', valor: (k) => <ChipDoSinal sinal={k.sinal} margem={k.margem} curto /> },
    { rotulo: 'Sai antes', valor: (k) => (k.investimento ? reaisLimpo(k.investimento) : 'nada') },
    { rotulo: 'Se paga', valor: (k) => textoDoSePagaEm(k.sePagaEm), ruim: (k) => k.sePagaEm.tipo === 'nunca' || (k.sePagaEm.tipo === 'mes' && k.sePagaEm.depoisDoPrazo) },
    { rotulo: 'No contrato', valor: (k) => reaisLimpo(k.resultado), ruim: (k) => k.resultado < 0 },
    { rotulo: 'Imposto', valor: (_k, c) => percentual(c.imposto) },
  ];
  return (
    <section className="card p-4 min-w-0" aria-label="Os cenários lado a lado" id="simulador-lado-a-lado">
      <h2 className="font-display font-semibold text-[15px] mb-3">Os cenários lado a lado</h2>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr>
              <th className="text-left font-normal text-muted px-1 py-1.5 w-[34%]" />
              {cenarios.map((c) => (
                <th key={c.id} className="text-right px-2 py-1.5 align-bottom">
                  <button type="button" onClick={() => abrir(c.id)} className={`font-semibold hover:text-accent inline-flex items-center gap-1 ${c.id === aberto ? 'text-accent' : 'text-ink'}`} data-lado-a-lado={c.id}>
                    {c.id === principal && <Star size={12} className="fill-current text-signal" aria-label="o principal" />}{c.nome}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className="border-t border-line">
                <td className="px-1 py-2 text-ink-2">{l.rotulo}</td>
                {cenarios.map((c, i) => (
                  <td key={c.id} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${l.ruim?.(contas[i]!) ? 'text-bad font-semibold' : ''}`}>{l.valor(contas[i]!, c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
