/**
 * Relatórios › Equipe: o **Quadro da equipe** — como está a carga de cada pessoa agora — e o
 * **Card bem preenchido** (os cards fecham com os campos preenchidos?).
 * Em ordem de nome, de propósito: é para equilibrar a carga e combinar o preenchimento, não para
 * ranquear pessoas.
 */
import { ClipboardCheck, Users } from 'lucide-react';
import { VAZIO } from '@gestor/shared';
import type { LinhaEquipe, RelatoriosChamados } from '../../../api/types.js';
import { Vazio } from '../../../components/ui/index.js';
import { Bloco, Faisca, horas, nf, Numero, Numeros, pct } from './pecas.js';

export function QuadroDaEquipe({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const e = r.equipe;
  const maxAberto = Math.max(1, ...e.linhas.map((l) => l.emAberto));
  const nomeDe = (l: LinhaEquipe) => l.nome ?? VAZIO;
  /** Um número que, clicado, mostra os chamados dele (zero não clica). */
  const N = ({ l, qual, v, tom }: { l: LinhaEquipe; qual: string; v: number; tom?: string }) => (v ? (
    <button type="button" onClick={() => abrir(`equipe:${qual}:${nomeDe(l)}`)} className={`tnum hover:underline ${tom ?? ''}`} title="Clique para ver os chamados">{nf(v)}</button>
  ) : <span className="tnum text-muted">0</span>);
  return (
    <Bloco
      id="equipe" titulo="Quadro da equipe" pergunta="Como está a carga de cada pessoa agora?" icone={Users}
      rodape={<>Em ordem de nome, de propósito: o quadro é para equilibrar a carga, não para ranquear pessoas. O responsável é o do card no LineChat hoje. Em aberto, parados e vencidos são de agora (de qualquer data); fechados e a mediana, do período. A linha mostra quantos cada um fechou por semana nas últimas 8 semanas.</>}
    >
      {!e.linhas.length ? <Vazio titulo="Nenhum chamado com esses filtros" /> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Responsável</th><th className="min-w-[150px]">Em aberto agora</th><th className="!text-right">Parados 7+ dias</th><th className="!text-right">Vencidos</th>
                <th className="!text-right">Fechados no período</th><th className="!text-right">Mediana até fechar</th><th>Fechados por semana</th>
              </tr>
            </thead>
            <tbody>
              {e.linhas.map((l) => (
                <tr key={nomeDe(l)}>
                  <td className={`text-[13px] font-semibold ${l.nome ? '' : 'text-muted italic font-normal'}`}>{l.nome ?? 'Sem responsável'}</td>
                  <td className="text-[13px]">
                    <span className="flex items-center gap-2">
                      <span className="w-8 text-right"><N l={l} qual="abertos" v={l.emAberto} /></span>
                      <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden min-w-[60px]"><span className="block h-full rounded-full bg-accent" style={{ width: `${(l.emAberto / maxAberto) * 100}%` }} /></span>
                    </span>
                  </td>
                  <td className="text-right text-[13px]"><N l={l} qual="parados" v={l.parados} tom="text-signal font-semibold" /></td>
                  <td className="text-right text-[13px]"><N l={l} qual="vencidos" v={l.vencidos} tom="text-bad font-semibold" /></td>
                  <td className="text-right text-[13px]"><N l={l} qual="fechados" v={l.fechados} /></td>
                  <td className="text-right text-[13px] tnum whitespace-nowrap">{horas(l.mediana)}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <Faisca valores={l.tendencia} rotulo={`Fechados por semana (${e.semanas[0]} a ${e.semanas[e.semanas.length - 1]}): ${l.tendencia.join(', ')}`} />
                      <span className="text-[12px] text-muted tnum whitespace-nowrap" title="nesta semana">{nf(l.tendencia[l.tendencia.length - 1] ?? 0)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="text-[13px]">Todos</td>
                <td className="text-[13px] tnum"><span className="inline-block w-8 text-right">{nf(e.totais.emAberto)}</span></td>
                <td className="text-right text-[13px] tnum">{nf(e.totais.parados)}</td>
                <td className="text-right text-[13px] tnum">{nf(e.totais.vencidos)}</td>
                <td className="text-right text-[13px] tnum">{nf(e.totais.fechados)}</td>
                <td className="text-right text-[13px] tnum whitespace-nowrap">{horas(e.totais.mediana)}</td>
                <td className="text-[12px] text-muted font-normal">semanas de {e.semanas[0]} a {e.semanas[e.semanas.length - 1]}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Bloco>
  );
}

// ---------- Card bem preenchido ----------

/** Barra de porcentagem: cheia quando 100%; abaixo de 90% fica laranja (é o que pede conversa). */
function BarraPct({ v }: { v: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden min-w-[60px]"><span className={`block h-full rounded-full ${v < 90 ? 'bg-signal' : 'bg-accent'}`} style={{ width: `${Math.max(v ? 2 : 0, v)}%` }} /></span>
      <span className="tnum w-10 text-right">{v}%</span>
    </span>
  );
}

export function CardBemPreenchido({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const x = r.preenchimento;
  const faltando = [...x.campos].sort((a, b) => a.pct - b.pct)[0];
  const nomes = x.campos.map((c) => c.nome);
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0] ?? '';
  return (
    <Bloco
      id="preenchimento" titulo="Card bem preenchido" pergunta="Os cards fecham com os campos preenchidos?" icone={ClipboardCheck}
      rodape={<>Confere, nos fechados no período, os campos {lista || 'Cliente, Assunto, Tipo e Produto'} — são eles que alimentam os outros relatórios. Em ordem de nome, de propósito: é para combinar o preenchimento, não para ranquear pessoas. Clique num número de "faltou" para ver os cards.</>}
    >
      {!x.n ? <Vazio titulo="Nenhum chamado fechado no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <>
          <Numeros>
            <Numero valor={`${pct(x.completos, x.n)}%`} rotulo={`fecharam com tudo preenchido (${nf(x.completos)} de ${nf(x.n)})`} tom={pct(x.completos, x.n) < 90 ? 'signal' : 'ok'} />
            {faltando && faltando.pct < 100 && (
              <Numero valor={faltando.nome} rotulo={`o que mais fica vazio: ${nf(x.n - faltando.preenchidos)} sem`} aoClicar={() => abrir(`preenchimento:campo:${faltando.key}`)} />
            )}
          </Numeros>
          <div className="grid gap-5 lg:grid-cols-2 items-start">
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Campo</th><th className="min-w-[150px]">Preenchido</th><th className="!text-right">Faltou</th></tr></thead>
                <tbody>
                  {x.campos.map((c) => {
                    const vazios = x.n - c.preenchidos;
                    return (
                      <tr key={c.key}>
                        <td className="text-[13px]">{c.nome}</td>
                        <td className="text-[13px]"><BarraPct v={c.pct} /></td>
                        <td className="text-right text-[13px]">
                          {vazios ? <button type="button" className="tnum hover:underline text-signal font-semibold" onClick={() => abrir(`preenchimento:campo:${c.key}`)} title="Clique para ver os cards">{nf(vazios)}</button> : <span className="tnum text-muted">0</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Responsável</th><th className="!text-right">Fechados</th><th className="min-w-[150px]">Tudo preenchido</th><th className="!text-right">Faltou</th></tr></thead>
                <tbody>
                  {x.porResponsavel.map((l) => {
                    const faltou = l.n - l.completos;
                    return (
                      <tr key={l.nome ?? VAZIO}>
                        <td className={`text-[13px] ${l.nome ? '' : 'text-muted italic'}`}>{l.nome ?? 'Sem responsável'}</td>
                        <td className="text-right tnum text-[13px]">{nf(l.n)}</td>
                        <td className="text-[13px]"><BarraPct v={l.pct} /></td>
                        <td className="text-right text-[13px]">
                          {faltou ? <button type="button" className="tnum hover:underline text-signal font-semibold" onClick={() => abrir(`preenchimento:resp:${l.nome ?? VAZIO}`)} title="Clique para ver os cards">{nf(faltou)}</button> : <span className="tnum text-muted">0</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Bloco>
  );
}
