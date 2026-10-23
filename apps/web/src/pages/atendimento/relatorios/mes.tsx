/**
 * Relatórios › Mês (2.1): o **Fechamento do mês** — o mês escolhido contra o anterior, em números, em
 * frases e dia a dia, com os assuntos, os clientes e os tipos que mais apareceram.
 */
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { NumeroDoMes } from '@gestor/shared';
import { Vazio } from '../../../components/ui/index.js';
import { Barras, Cartao, Colunas, nf, tempoUtil, type PropsDoRelatorio } from './pecas.js';

export function Fechamento({ r, abrir, aoMes }: PropsDoRelatorio & { aoMes: (mes: string) => void }) {
  const x = r.fechamento;
  const antes = x.meses.find((m) => m.mes === x.anterior)?.nome ?? x.anterior;
  const nomeAntes = antes.split(' de ')[0] ?? antes;
  const temAntes = x.chegaram.antes !== null;
  return (
    <Cartao id="fechamento"
      acoes={(
        <select className="input w-auto py-1.5 text-[13px]" aria-label="O mês" value={x.mes} onChange={(e) => aoMes(e.target.value)}>
          {x.meses.map((m) => <option key={m.mes} value={m.mes}>{m.nome}</option>)}
        </select>
      )}
      rodape={<>O mês inteiro (o período lá de cima não vale aqui), comparado com {nomeAntes}. O tempo é em horas úteis; "no prazo" é a solução dos resolvidos com prioridade; a fila é a do último dia do mês.</>}>
      <h3 className="font-display font-semibold text-[16px] -mb-1 first-letter:uppercase">{x.nome}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5">
        <Bloquinho rotulo="Chegaram" n={x.chegaram} formato={(v) => nf(v)} ids={x.chegaram.ids} abrir={abrir} janela={`Chegaram em ${x.nome}`} nomeAntes={nomeAntes} />
        <Bloquinho rotulo="Resolvidos" n={x.resolvidos} formato={(v) => nf(v)} ids={x.resolvidos.ids} abrir={abrir} janela={`Resolvidos em ${x.nome}`} nomeAntes={nomeAntes} bomSubir />
        <Bloquinho rotulo="Mediana até resolver" n={x.mediana} formato={(v) => tempoUtil(r, v)} nomeAntes={nomeAntes} menorEhMelhor />
        <Bloquinho rotulo="Fila no fim do mês" n={x.filaNoFim} formato={(v) => nf(v)} nomeAntes={nomeAntes} menorEhMelhor />
        <Bloquinho rotulo="Resolvidos no prazo" n={x.prazo} formato={(v) => `${v}%`} nomeAntes={nomeAntes} bomSubir pontos />
      </div>
      {x.destaques.length > 0 && (
        <ul className="list-disc pl-5 text-[13.5px] text-ink-2 flex flex-col gap-0.5">
          {x.destaques.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
      {!x.chegaram.agora ? <Vazio titulo={`Nada chegou em ${x.nome}`} texto="Escolha outro mês ou tire algum filtro." /> : (
        <>
          <div>
            <div className="eyebrow mb-2">Dia a dia · clique num dia para ver os chamados</div>
            <Colunas altura={100} abrir={abrir} pontos={x.porDia.map((d) => ({ id: d.dia, rotulo: d.dia.slice(8, 10), n: d.n, ids: d.ids, janela: `Chegaram em ${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}` }))} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="min-w-0"><div className="eyebrow mb-2">Os assuntos{temAntes ? ` (e ${nomeAntes})` : ''}</div><Barras itens={x.assuntos.map((a) => ({ ...a, antes: temAntes ? a.antes : undefined }))} abrir={abrir} janela={(a) => `${a} — ${x.nome}`} /></div>
            <div className="min-w-0"><div className="eyebrow mb-2">Os clientes</div><Barras itens={x.clientes.map((a) => ({ ...a, antes: temAntes ? a.antes : undefined }))} abrir={abrir} janela={(a) => `${a} — ${x.nome}`} /></div>
            <div className="min-w-0"><div className="eyebrow mb-2">Os tipos</div><Barras itens={x.tipos.map((a) => ({ ...a, antes: temAntes ? a.antes : undefined }))} abrir={abrir} janela={(a) => `${a} — ${x.nome}`} /></div>
          </div>
        </>
      )}
    </Cartao>
  );
}

/** Um número do mês com o do mês anterior embaixo (a seta verde quando melhorou). */
function Bloquinho({ rotulo, n, formato, ids, abrir, janela, nomeAntes, menorEhMelhor, bomSubir, pontos }: {
  rotulo: string; n: NumeroDoMes; formato: (v: number) => string; ids?: string[]; abrir?: PropsDoRelatorio['abrir']; janela?: string; nomeAntes: string;
  menorEhMelhor?: boolean; bomSubir?: boolean; pontos?: boolean;
}) {
  const d = n.agora !== null && n.antes !== null ? n.agora - n.antes : null;
  const bom = d === null || Math.abs(d) < 0.5 ? null : menorEhMelhor ? d < 0 : bomSubir ? d > 0 : null;
  const Seta = d !== null && d > 0 ? TrendingUp : TrendingDown;
  const corpo = (
    <>
      <span className="eyebrow block">{rotulo}</span>
      <span className="block font-display text-[22px] font-semibold tnum leading-tight mt-1">{n.agora === null ? '—' : formato(n.agora)}</span>
      <span className="block text-[12px] mt-1">
        {n.antes === null ? <span className="text-muted">sem {nomeAntes} para comparar</span>
          : d === null || Math.abs(d) < 0.5 ? <span className="text-muted">igual a {nomeAntes}</span>
            : (
              // em linha (não em flex): no cartão estreito, o texto quebra como frase, e o número fica inteiro
              <span className={`font-semibold ${bom === null ? 'text-ink-2' : bom ? 'text-ok' : 'text-signal'}`}>
                <Seta size={12} className="inline -mt-0.5 mr-1" aria-hidden />
                <span className="whitespace-nowrap">{pontos ? `${nf(Math.abs(d))} ${Math.abs(d) === 1 ? 'ponto' : 'pontos'}` : formato(Math.abs(d))}</span>
                {' '}<span className="font-normal text-muted">que {nomeAntes} (<span className="whitespace-nowrap">{formato(n.antes)}</span>)</span>
              </span>
            )}
      </span>
    </>
  );
  const classe = 'rounded-xl border border-line p-3 text-left min-w-0';
  if (!ids?.length || !abrir) return <div className={classe}>{corpo}</div>;
  return <button type="button" className={`${classe} hover:border-line-strong hover:bg-surface-2`} onClick={() => abrir({ titulo: janela ?? rotulo, ids })} title="Clique para ver os chamados">{corpo}</button>;
}
