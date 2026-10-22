/**
 * Os números do cenário (o Simulador do Comercial, 2.0.2): o que sobra por mês, a margem com o sinal, o custo
 * do mês (o fixo e o variável), o investimento (o total pago uma vez), o que sai antes, quando a venda se paga
 * e o que fica no contrato; a linha do tempo do contrato (o acumulado mês a mês, do 1º mês, o da assinatura, ao
 * fim); e os cenários lado a lado, com a diferença de cada um para o principal. O quadro "O preço" (a mensalidade
 * mínima pela margem que se queria e o desconto máximo sem sair do verde) saiu: o Luan, 21/10, "isso não precisa
 * ter"; a margem e o sinal ficam aqui.
 */
import { useId, type ReactNode } from 'react';
import { AlertTriangle, Star } from 'lucide-react';
import {
  percentual, percentualDaFracao, textoDasFaixas, textoDoSePagaEm,
  type AjustesDoSimulador, type CenarioDaSimulacao, type ContasDoCenario,
} from '@gestor/shared';
import { ChipDoSinal, reais, reaisLimpo } from './comum.js';

/** `abaixo`: o que vem embaixo da linha, na largura toda (as partes do custo do mês, com os valores alinhados ao total). */
function Linha({ rotulo, valor, dica, tom, id, abaixo }: { rotulo: ReactNode; valor: ReactNode; dica?: ReactNode; tom?: 'bad' | 'ok'; id?: string; abaixo?: ReactNode }) {
  return (
    <div className="py-2" id={id}>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-ink-2 min-w-0">{rotulo}{dica && <span className="block text-[12px] text-muted">{dica}</span>}</dt>
        <dd className={`tabular-nums font-semibold text-right whitespace-nowrap ${tom === 'bad' ? 'text-bad' : tom === 'ok' ? 'text-ok' : 'text-ink'}`}>{valor}</dd>
      </div>
      {abaixo}
    </div>
  );
}

/** Os números do cenário aberto. */
export function OsNumeros({ c, k, ajustes }: { c: CenarioDaSimulacao; k: ContasDoCenario; ajustes: AjustesDoSimulador }) {
  const ruimDePagar = k.sePagaEm.tipo === 'nunca' || (k.sePagaEm.tipo === 'mes' && k.sePagaEm.depoisDoPrazo);
  // o custo do mês, parte a parte e sem agrupar (o Luan, 21/10: "eu quero q ele sempre coloque detalhado todos os
  // custos n agrupe"): cada custo por mês pelo nome, o imposto e cada comissão
  const partesDoCusto = k.partesDoCustoMensal.length > 0 ? (
    <ul className="mt-0.5 flex flex-col text-[12px] text-muted" id="simulador-partes-do-custo">
      {k.partesDoCustoMensal.map((p, i) => (
        <li key={`${p.rotulo}${i}`} className="flex justify-between gap-3"><span className="min-w-0">{p.rotulo}</span><span className="tabular-nums whitespace-nowrap">{reaisLimpo(p.valor)}</span></li>
      ))}
    </ul>
  ) : undefined;
  const parcelado = k.linhas.filter((l) => l.parcelas > 1).reduce((s, l) => s + l.custo, 0);
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
        <div className="text-[12px] text-muted" id="simulador-faixas-do-sinal">O sinal: {textoDasFaixas(ajustes)} (os Ajustes do Simulador).</div>
        <dl className="mt-3 divide-y divide-line text-[13.5px] border-t border-line">
          <Linha rotulo="O cliente paga por mês" valor={reais(k.mensalTotal)} dica={k.aluguel ? `mensalidade ${reaisLimpo(c.mensalidade)} + aluguel dos aparelhos ${reaisLimpo(k.aluguel)}` : undefined} />
          <Linha rotulo="O custo do mês" valor={reais(k.custoMensal)} abaixo={partesDoCusto} id="simulador-custo-do-mes" />
          <Linha rotulo="A ativação" valor={reais(k.entradaTotal)}
            dica={[k.vendaDeAparelhos ? `ativação ${reaisLimpo(c.ativacao)} + aparelhos vendidos ${reaisLimpo(k.vendaDeAparelhos)}` : '', k.parcelas.length > 1 ? `em ${k.parcelas.length}x de ${reaisLimpo(k.parcelas[k.parcelas.length - 1]!)}` : ''].filter(Boolean).join(' · ') || undefined} />
          <Linha rotulo="Investimento" valor={reais(k.totalInvestido)} id="simulador-total-investido"
            dica={`o total pago uma vez: os aparelhos e a comissão da venda${parcelado ? ` (${reaisLimpo(parcelado)} na compra parcelada)` : ''}`} />
          <Linha rotulo="Sai antes" valor={k.investimento ? reais(k.investimento) : 'nada'} id="simulador-investimento"
            dica={k.investimento ? 'o pior momento do contrato: o que a Ingline põe antes de a venda se pagar'
              : k.sePagaEm.tipo === 'sem-custo' ? 'nada é pago de uma vez'
                : k.sePagaEm.tipo === 'entrada' ? 'a ativação cobre o que é pago de uma vez'
                  : 'o 1º mês (a ativação e a 1ª mensalidade) cobre o que é pago de uma vez'} />
          <Linha rotulo="Se paga" valor={textoDoSePagaEm(k.sePagaEm)} tom={ruimDePagar ? 'bad' : undefined} id="simulador-se-paga" />
          <Linha rotulo={`No contrato (${c.prazo} ${c.prazo === 1 ? 'mês' : 'meses'})`} valor={reais(k.resultado)} tom={k.resultado < 0 ? 'bad' : undefined} id="simulador-contrato" />
        </dl>
        <LinhaDoTempo k={k} prazo={c.prazo} />
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
 * A linha do tempo do contrato: o acumulado mês a mês, do 1º mês (o da assinatura) ao fim. Abaixo de zero,
 * vermelho; acima, verde; o ponto onde a venda se paga e o que fica no fim, escritos.
 */
export function LinhaDoTempo({ k }: { k: ContasDoCenario; prazo: number }) {
  const id = useId().replace(/:/g, '');
  const W = 340; const H = 150; const esq = 6; const dir = 6; const topo = 22; const base = 22;
  // o ponto de partida (zero, antes do 1º mês) e o acumulado ao fim de cada mês: p[m] é o fim do mês m
  const p = [0, ...k.serie];
  const n = Math.max(1, p.length - 1);
  const max = Math.max(0, ...p); const min = Math.min(0, ...p);
  const faixa = max - min || 1;
  const x = (m: number) => esq + (m / n) * (W - esq - dir);
  const y = (v: number) => topo + ((max - v) / faixa) * (H - topo - base);
  const caminho = p.map((v, m) => `${m ? 'L' : 'M'}${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${caminho} L${x(n).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const pagou = k.sePagaEm.tipo === 'mes' && !k.sePagaEm.depoisDoPrazo ? k.sePagaEm.mes : null;
  // o ponto exato em que a linha cruza o zero (entre o fim do mês de antes e o fim do mês em que se paga)
  const cruza = pagou == null || pagou < 2 ? null : (() => {
    const a = p[pagou - 1] ?? 0; const b = p[pagou] ?? 0;
    return b === a ? pagou : pagou - 1 + Math.min(1, Math.max(0, -a / (b - a)));
  })();
  const fim = p[p.length - 1]!;
  const meio = Math.round(n / 2);
  return (
    <figure className="mt-3" aria-label={`O acumulado do contrato: no 1º mês, ${reaisLimpo(p[1] ?? 0)}; no fim, ${reaisLimpo(fim)}${pagou ? `; vira lucro no mês ${pagou}` : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" id="simulador-grafico">
        <defs>
          <clipPath id={`acima-${id}`}><rect x="0" y="0" width={W} height={Math.max(0, y(0))} /></clipPath>
          <clipPath id={`abaixo-${id}`}><rect x="0" y={y(0)} width={W} height={Math.max(0, H - y(0))} /></clipPath>
        </defs>
        <path d={area} fill="var(--ok-soft)" clipPath={`url(#acima-${id})`} />
        <path d={area} fill="var(--bad-soft)" clipPath={`url(#abaixo-${id})`} />
        <line x1={esq} x2={W - dir} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeDasharray="3 3" />
        <path d={caminho} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {[0, meio, n].filter((m, i, a) => a.indexOf(m) === i).map((m) => (
          <text key={m} x={x(m)} y={H - 6} fontSize="10.5" fill="var(--muted)" textAnchor={m === 0 ? 'start' : m === n ? 'end' : 'middle'}>{m === 0 ? 'início' : `mês ${m}`}</text>
        ))}
        {pagou != null && cruza != null && <circle cx={x(cruza)} cy={y(0)} r="4.5" fill="var(--ok)" stroke="var(--surface)" strokeWidth="2" />}
        <text x={W - dir} y={Math.max(13, Math.min(H - base - 4, y(fim) - 7))} fontSize="11" fontWeight="600" fill={fim < 0 ? 'var(--bad)' : 'var(--ok)'} textAnchor="end">{reaisLimpo(fim)}</text>
      </svg>
      <figcaption className="text-[12px] text-muted mt-1">
        {pagou != null && <span className="text-ink-2 font-semibold"><span className="inline-block w-2 h-2 rounded-full bg-ok mr-1 align-middle" aria-hidden />Vira lucro no mês {pagou}. </span>}
        O acumulado mês a mês: o 1º mês tem o que é pago de uma vez (os aparelhos), a ativação e a 1ª mensalidade; cada mês soma o lucro dele.{' '}
        <button type="button" className="link" id="simulador-ver-mes-a-mes"
          onClick={() => document.getElementById('simulador-mes-a-mes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Ver mês a mês</button>
      </figcaption>
    </figure>
  );
}

/** Uma linha do lado a lado: o valor de cada cenário e, para a diferença, o número e o que é melhor (mais ou menos). */
type LinhaDoLadoALado = {
  rotulo: string;
  dica?: string;
  valor: (k: ContasDoCenario, c: CenarioDaSimulacao) => ReactNode;
  ruim?: (k: ContasDoCenario) => boolean;
  /** o número para a diferença (nulo: sem diferença), como ele se escreve e qual lado é o melhor */
  numero?: (k: ContasDoCenario, c: CenarioDaSimulacao) => number | null;
  dif?: (d: number) => string;
  melhor?: 'mais' | 'menos';
};

const comSinal = (d: number, texto: string) => `${d > 0 ? '+' : '−'}${texto}`;
const difDeReais = (d: number) => comSinal(d, reaisLimpo(Math.abs(d)));
const difDeMeses = (d: number) => comSinal(d, `${Math.abs(d)} ${Math.abs(d) === 1 ? 'mês' : 'meses'}`);
const difDePontos = (d: number) => comSinal(d, `${(Math.abs(d) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${Math.abs(d * 100) >= 0.95 && Math.abs(d * 100) < 1.05 ? 'ponto' : 'pontos'}`);

/**
 * Os cenários lado a lado: os mesmos números, uma coluna por cenário (o clique no nome abre o cenário), e a
 * diferença de cada um para o principal (o Luan: "uma terceira coluna com a diferença"), em verde quando é
 * melhor para a Ingline e em vermelho quando é pior. O custo do mês vem em dois: o fixo (as linhas por mês) e o
 * variável (o imposto e a comissão, que andam com o que o cliente paga).
 */
export function LadoALado({ cenarios, contas, principal, aberto, abrir }: {
  cenarios: CenarioDaSimulacao[]; contas: ContasDoCenario[]; principal: string; aberto: string; abrir: (id: string) => void;
}) {
  const mesesDoSePaga = (k: ContasDoCenario) => (k.sePagaEm.tipo === 'mes' ? k.sePagaEm.mes : k.sePagaEm.tipo === 'nunca' ? null : 0);
  const linhas: LinhaDoLadoALado[] = [
    { rotulo: 'O cliente paga por mês', valor: (k) => reaisLimpo(k.mensalTotal), numero: (k) => k.mensalTotal, dif: difDeReais, melhor: 'mais' },
    { rotulo: 'A ativação', valor: (k) => (k.parcelas.length > 1 ? `${reaisLimpo(k.entradaTotal)} em ${k.parcelas.length}x` : reaisLimpo(k.entradaTotal)), numero: (k) => k.entradaTotal, dif: difDeReais, melhor: 'mais' },
    { rotulo: 'O prazo', valor: (_k, c) => `${c.prazo} ${c.prazo === 1 ? 'mês' : 'meses'}`, numero: (_k, c) => c.prazo, dif: difDeMeses },
    { rotulo: 'Investimento', dica: 'pago uma vez', valor: (k) => reaisLimpo(k.totalInvestido), numero: (k) => k.totalInvestido, dif: difDeReais, melhor: 'menos' },
    { rotulo: 'Custo fixo do mês', dica: 'as linhas por mês', valor: (k) => reaisLimpo(k.custoMensalFixo), numero: (k) => k.custoMensalFixo, dif: difDeReais, melhor: 'menos' },
    { rotulo: 'Custo variável do mês', dica: 'o imposto e a comissão', valor: (k) => reaisLimpo(k.impostoMensal + k.comissaoMensal), numero: (k) => k.impostoMensal + k.comissaoMensal, dif: difDeReais },
    { rotulo: 'Sobra por mês', valor: (k) => reaisLimpo(k.sobraMensal), ruim: (k) => k.sobraMensal < 0, numero: (k) => k.sobraMensal, dif: difDeReais, melhor: 'mais' },
    { rotulo: 'A margem', valor: (k) => <ChipDoSinal sinal={k.sinal} margem={k.margem} curto />, numero: (k) => k.margem, dif: difDePontos, melhor: 'mais' },
    { rotulo: 'Sai antes', valor: (k) => (k.investimento ? reaisLimpo(k.investimento) : 'nada'), numero: (k) => k.investimento, dif: difDeReais, melhor: 'menos' },
    {
      rotulo: 'Se paga', valor: (k) => textoDoSePagaEm(k.sePagaEm), ruim: (k) => k.sePagaEm.tipo === 'nunca' || (k.sePagaEm.tipo === 'mes' && k.sePagaEm.depoisDoPrazo),
      numero: mesesDoSePaga, dif: difDeMeses, melhor: 'menos',
    },
    { rotulo: 'No contrato', valor: (k) => reaisLimpo(k.resultado), ruim: (k) => k.resultado < 0, numero: (k) => k.resultado, dif: difDeReais, melhor: 'mais' },
    { rotulo: 'Imposto', valor: (_k, c) => percentual(c.imposto), numero: (_k, c) => c.imposto / 100, dif: difDePontos },
  ];
  const iP = Math.max(0, cenarios.findIndex((c) => c.id === principal));
  // cada cenário e, logo depois dele (menos o principal), a diferença dele para o principal
  const colunas = cenarios.flatMap((c, i) => (i === iP ? [{ c, i, dif: false }] : [{ c, i, dif: false }, { c, i, dif: true }]));
  const diferenca = (l: LinhaDoLadoALado, i: number) => {
    const a = l.numero?.(contas[i]!, cenarios[i]!); const b = l.numero?.(contas[iP]!, cenarios[iP]!);
    if (a == null || b == null || !l.dif) return { texto: '—', classe: 'text-muted' };
    const d = a - b;
    if (Math.abs(d) < 1e-9) return { texto: 'igual', classe: 'text-muted' };
    const bom = l.melhor ? (l.melhor === 'mais') === d > 0 : null;
    return { texto: l.dif(d), classe: bom == null ? 'text-ink-2' : bom ? 'text-ok font-semibold' : 'text-bad font-semibold' };
  };
  return (
    <section className="card p-4 min-w-0" aria-label="Os cenários lado a lado" id="simulador-lado-a-lado">
      <h2 className="font-display font-semibold text-[15px] mb-1">Os cenários lado a lado</h2>
      <p className="text-[12px] text-muted mb-3">A diferença é a de cada cenário para o principal (<Star size={11} className="inline fill-current text-signal -mt-0.5" aria-hidden /> {cenarios[iP]!.nome}): em verde, melhor para a Ingline; em vermelho, pior.</p>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr>
              <th className="text-left font-normal text-muted px-1 py-1.5 min-w-[150px]" />
              {colunas.map(({ c, dif }) => (dif ? (
                <th key={`d${c.id}`} className="text-right px-2 py-1.5 align-bottom bg-surface-2 rounded-t-md min-w-[104px]" data-diferenca={c.id}>
                  <span className="block font-semibold text-ink">Diferença</span>
                  <span className="block text-[11px] font-normal text-muted leading-tight">{c.nome} − {cenarios[iP]!.nome}</span>
                </th>
              ) : (
                <th key={c.id} className="text-right px-2 py-1.5 align-bottom min-w-[96px]">
                  <button type="button" onClick={() => abrir(c.id)} className={`font-semibold hover:text-accent inline-flex items-center gap-1 text-right ${c.id === aberto ? 'text-accent' : 'text-ink'}`} data-lado-a-lado={c.id}>
                    {c.id === principal && <Star size={12} className="fill-current text-signal shrink-0" aria-label="o principal" />}{c.nome}
                  </button>
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className="border-t border-line" data-linha-lado={l.rotulo}>
                <td className="px-1 py-2 text-ink-2">{l.rotulo}{l.dica && <span className="block text-[11.5px] text-muted">{l.dica}</span>}</td>
                {colunas.map(({ c, i, dif }) => {
                  if (!dif) return <td key={c.id} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${l.ruim?.(contas[i]!) ? 'text-bad font-semibold' : ''}`}>{l.valor(contas[i]!, c)}</td>;
                  const d = diferenca(l, i);
                  return <td key={`d${c.id}`} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap bg-surface-2 ${d.classe}`}>{d.texto}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
