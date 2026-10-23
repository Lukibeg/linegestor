/**
 * Relatórios › Equipe (2.1): o **Quadro da equipe** (a carga de cada pessoa agora e o que ela resolveu),
 * o **Tempo gasto** (novo: o tempo lançado nos chamados) e o **Chamado bem preenchido** (os resolvidos com os
 * campos completos, por campo e por pessoa).
 */
import { Vazio } from '../../../components/ui/index.js';
import { LinkDoChamado } from '../comum.js';
import { Barras, BarraComTexto, Cartao, NumeroClicavel, Numero, Numeros, diaCurto, nf, pct, plural, tempoUtil, type PropsDoRelatorio } from './pecas.js';

/** "62 h 30", "45 min": o tempo lançado (horas de relógio, não dias de atendimento), sem quebrar a linha no meio. */
const horasLancadas = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const m = min % 60;
  return m ? `${nf(h)} h ${String(m).padStart(2, '0')}` : `${nf(h)} h`;
};

/** A linha das semanas: um traço com o último ponto marcado. */
function Faisca({ valores, rotulo }: { valores: number[]; rotulo: string }) {
  const largura = 96; const altura = 26;
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

// ---------- Quadro da equipe ----------

export function Equipe({ r, abrir }: PropsDoRelatorio) {
  const x = r.equipe;
  return (
    <Cartao id="equipe" rodape={<>"Em aberto", "vencidos" e "parados" são de agora (parado: sem nenhuma atividade há 7 dias ou mais). "Resolvidos", a mediana (em horas úteis) e "escalonou" (as subidas de nível que a pessoa fez) são do período. A linha: os resolvidos de cada uma das 8 semanas até o fim do período.</>}>
      {!x.linhas.length ? <Vazio titulo="Ninguém com chamado no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Pessoa</th><th className="!text-right">Em aberto</th><th className="!text-right">Vencidos</th><th className="!text-right">Parados</th>
                <th className="!text-right">Resolvidos</th><th className="!text-right">Mediana</th><th className="!text-right">Escalonou</th><th>8 semanas</th>
              </tr>
            </thead>
            <tbody>
              {x.linhas.map((l) => (
                <tr key={l.id ?? 'ninguem'}>
                  <td className={`text-[13px] whitespace-nowrap ${l.id ? 'font-semibold' : 'text-muted italic'}`}>{l.nome}</td>
                  <td className="text-right text-[13px]"><NumeroClicavel ids={l.emAberto.ids} titulo={`${l.nome} — em aberto`} abrir={abrir} /></td>
                  <td className="text-right text-[13px]"><NumeroClicavel ids={l.vencidos.ids} titulo={`${l.nome} — vencidos`} abrir={abrir} tom="text-signal font-semibold" /></td>
                  <td className="text-right text-[13px]"><NumeroClicavel ids={l.parados.ids} titulo={`${l.nome} — parados há 7 dias ou mais`} abrir={abrir} tom="text-signal" /></td>
                  <td className="text-right text-[13px]"><NumeroClicavel ids={l.resolvidos.ids} titulo={`${l.nome} — resolvidos no período`} abrir={abrir} /></td>
                  <td className="text-right tnum text-[13px] whitespace-nowrap">{tempoUtil(r, l.mediana)}</td>
                  <td className="text-right tnum text-[13px]">{l.escalonou || <span className="text-muted">0</span>}</td>
                  <td><Faisca valores={l.semanas} rotulo={`${l.nome}: ${l.semanas.map((n, i) => `${diaCurto(x.semanas[i]!)}: ${n}`).join(', ')}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

// ---------- Tempo gasto ----------

export function TempoGasto({ r, abrir }: PropsDoRelatorio) {
  const x = r.tempogasto;
  const barras = (itens: Array<{ rotulo: string; minutos: number; ids: string[] }>) => itens.slice(0, 8).map((i) => ({ rotulo: i.rotulo, n: i.minutos, ids: i.ids, texto: horasLancadas(i.minutos) }));
  return (
    <Cartao id="tempogasto" rodape={<>O tempo lançado nos chamados (o "Registrar o tempo" da ficha), pelo dia do trabalho, no período. É o tempo de mão na massa, em horas de relógio — diferente do relógio do chamado, que conta o tempo até resolver.</>}>
      {!x.lancamentos ? <Vazio titulo="Nenhum tempo lançado no período" texto='Lance o tempo de trabalho na ficha do chamado ("Registrar o tempo").' /> : (
        <>
          <Numeros>
            <Numero valor={horasLancadas(x.minutos)} rotulo="lançadas no período" sub={<span className="text-muted">em {plural(x.lancamentos, 'lançamento', 'lançamentos')}</span>} />
            {x.maiores[0] && <Numero valor={horasLancadas(x.maiores[0].minutos)} rotulo={<>no chamado que mais tomou tempo (<span className="whitespace-nowrap">{x.maiores[0].codigo}</span>)</>} />}
          </Numeros>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="min-w-0"><div className="eyebrow mb-2">Por pessoa</div><Barras itens={x.porPessoa.slice(0, 8).map((i) => ({ rotulo: i.nome, n: i.minutos, ids: i.ids, texto: horasLancadas(i.minutos) }))} abrir={abrir} janela={(n) => `Tempo lançado por ${n}`} /></div>
            <div className="min-w-0"><div className="eyebrow mb-2">Por assunto</div><Barras itens={barras(x.porAssunto)} abrir={abrir} janela={(n) => `Tempo lançado — ${n}`} /></div>
            <div className="min-w-0"><div className="eyebrow mb-2">Por cliente</div><Barras itens={barras(x.porCliente)} abrir={abrir} janela={(n) => `Tempo lançado — ${n}`} /></div>
          </div>
          <div>
            <div className="eyebrow mb-1">Os que mais tomaram tempo</div>
            <ul className="divide-y divide-line">
              {x.maiores.map((m) => (
                <li key={m.id} className="py-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 items-baseline text-[13px]">
                  <LinkDoChamado codigo={m.codigo} className="link font-mono text-[12px]">{m.codigo}</LinkDoChamado>
                  <span className="truncate">{m.titulo}</span>
                  <span className="tnum font-semibold whitespace-nowrap">{horasLancadas(m.minutos)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Cartao>
  );
}

// ---------- Chamado bem preenchido ----------

export function Preenchido({ r, abrir }: PropsDoRelatorio) {
  const x = r.preenchido;
  return (
    <Cartao id="preenchido" rodape={<>Os resolvidos no período com os campos que o painel usa: o assunto, o tipo, a gravidade e os produtos (os que estão ligados no painel), a causa e a solução. Completo é ter todos. Os que a etapa pede para resolver sempre estão preenchidos; o que mais falta mostra o que a equipe pula.</>}>
      {!x.resolvidos ? <Vazio titulo="Nenhum chamado resolvido no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <>
          <Numeros>
            <Numero valor={`${pct(x.completos.n, x.resolvidos)}%`} rotulo="dos resolvidos ficaram completos" abrir={abrir} ids={x.completos.ids} janela="Resolvidos completos"
              sub={<span className="text-muted">{nf(x.completos.n)} de {nf(x.resolvidos)}</span>} tom={pct(x.completos.n, x.resolvidos) >= 90 ? 'ok' : 'signal'} />
          </Numeros>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="overflow-x-auto min-w-0">
              <table className="table">
                <thead><tr><th>Campo</th><th className="sm:min-w-[120px]">Preenchido</th><th className="!text-right">Faltou</th></tr></thead>
                <tbody>
                  {x.campos.map((c) => (
                    <tr key={c.campo}>
                      <td className="text-[13px]">{c.nome}</td>
                      <td className="text-[13px]"><BarraComTexto v={c.pct} max={100} texto={`${c.pct}%`} forte={c.pct < 80} largura={42} /></td>
                      <td className="text-right text-[13px]"><NumeroClicavel ids={c.faltou.ids} titulo={`Resolvidos sem ${c.nome.toLocaleLowerCase('pt-BR')}`} abrir={abrir} tom="text-signal" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto min-w-0">
              <table className="table">
                <thead><tr><th>Quem resolveu</th><th className="!text-right">Resolvidos</th><th className="sm:min-w-[120px]">Completos</th></tr></thead>
                <tbody>
                  {x.porPessoa.map((p) => (
                    <tr key={p.nome}>
                      <td className="text-[13px]">{p.nome}</td>
                      <td className="text-right tnum text-[13px]">{nf(p.total)}</td>
                      <td className="text-[13px]"><BarraComTexto v={p.pct} max={100} texto={`${p.pct}%`} forte={p.pct < 80} largura={42} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Cartao>
  );
}
