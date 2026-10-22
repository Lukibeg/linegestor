/**
 * Relatórios › Tempo (2.0.5): o **Prazo cumprido**, o **Relógio do chamado**, a **Primeira resposta**, **A
 * escada N1 → N2 → N3 → DEV**, **Onde o chamado empaca**, **A prioridade faz diferença?** e **Esperando a
 * operadora** (novo). Tudo em horas úteis, pelo horário de atendimento e os feriados dos Ajustes.
 */
import { useState } from 'react';
import { NOME_DO_SEPARAR, NOME_PRIORIDADE, SEPARAR_O_RELOGIO, type SepararORelogio } from '@gestor/shared';
import { Vazio } from '../../../components/ui/index.js';
import { data } from '../../../lib/format.js';
import { ChipPrioridade, LinkDoChamado } from '../comum.js';
import {
  BarraComTexto, Cartao, Colunas, NumeroClicavel, Numero, Numeros, Variacao, nf, nomeDoAnterior, pct, plural, tempoUtil, type PropsDoRelatorio,
} from './pecas.js';

// ---------- Prazo cumprido ----------

export function Prazo({ r, abrir }: PropsDoRelatorio) {
  const x = r.prazo;
  const contra = r.periodo.anterior.nome;
  if (!x.contaPrazo) {
    return <Cartao id="prazo"><Vazio titulo="Este painel não conta prazo" texto="Ligue o prazo nos ajustes do painel para ver se os chamados são respondidos e resolvidos a tempo." /></Cartao>;
  }
  const linhas = x.porPrioridade;
  return (
    <Cartao id="prazo" rodape={<>Os prazos de cada prioridade são os de Painéis › Ajustes › Prazos{linhas.some((l) => l.limites?.uteis) ? ', em horas úteis, com os feriados' : ''}. Esperando o cliente, o relógio para; esperando a operadora, continua. Conta os resolvidos no período que têm prioridade.</>}>
      <Numeros>
        <Numero valor={x.resposta.pct === null ? '—' : `${x.resposta.pct}%`} rotulo="respondidos no prazo" abrir={abrir} ids={x.resposta.foraIds} janela="Respondidos fora do prazo"
          titulo="Clique para ver os que foram respondidos fora do prazo"
          sub={<span className="text-muted">{nf(x.resposta.noPrazo)} de {nf(x.resposta.comPrazo)} · <Variacao r={r} agora={x.resposta.pct} antes={x.resposta.antes} formato="pontos" contra={contra} /></span>} />
        <Numero valor={x.solucao.pct === null ? '—' : `${x.solucao.pct}%`} rotulo="resolvidos no prazo" abrir={abrir} ids={x.solucao.foraIds} janela="Resolvidos fora do prazo"
          titulo="Clique para ver os que foram resolvidos fora do prazo"
          sub={<span className="text-muted">{nf(x.solucao.noPrazo)} de {nf(x.solucao.comPrazo)} · <Variacao r={r} agora={x.solucao.pct} antes={x.solucao.antes} formato="pontos" contra={contra} /></span>} />
        <Numero valor={nf(x.vencidosAgora.n)} rotulo="vencidos em aberto agora" tom={x.vencidosAgora.n ? 'signal' : undefined} abrir={abrir} ids={x.vencidosAgora.ids} janela="Vencidos em aberto agora"
          sub={x.pertoAgora.n ? <span className="text-muted">e {plural(x.pertoAgora.n, 'perto de vencer', 'perto de vencer')}</span> : undefined} />
      </Numeros>
      {!x.resolvidos ? <Vazio titulo="Nenhum chamado resolvido no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <div className="overflow-x-auto">
          <div className="eyebrow mb-2">Por prioridade · os {nf(x.resolvidos)} resolvidos no período · clique num número para ver os chamados</div>
          <table className="table">
            <thead><tr><th>Prioridade e prazos</th><th className="!text-right">Resolvidos</th><th className="sm:min-w-[130px]">Resposta no prazo</th><th className="sm:min-w-[130px]">Solução no prazo</th></tr></thead>
            <tbody>
              {linhas.map((l) => {
                const rp = pct(l.resposta.noPrazo, l.resposta.comPrazo);
                const sp = pct(l.solucao.noPrazo, l.solucao.comPrazo);
                return (
                  <tr key={l.prioridade ?? 'sem'}>
                    <td className="text-[13px]">
                      <ChipPrioridade p={l.prioridade} />
                      {l.limites && <span className="block text-[11.5px] text-muted tnum mt-0.5">{tempoUtil(r, l.limites.resposta)} · {tempoUtil(r, l.limites.solucao)}{l.limites.uteis ? ' úteis' : ''}</span>}
                    </td>
                    <td className="text-right text-[13px]"><NumeroClicavel ids={l.solucao.ids} n={l.resolvidos} titulo={`Resolvidos — ${l.nome}`} abrir={abrir} /></td>
                    <td className="text-[13px]">
                      {l.resposta.comPrazo ? (
                        <button type="button" className="w-full text-left" disabled={!l.resposta.foraIds.length} onClick={() => abrir({ titulo: `Respondidos fora do prazo — ${l.nome}`, ids: l.resposta.foraIds })} title={`${l.resposta.noPrazo} de ${l.resposta.comPrazo} no prazo${l.resposta.foraIds.length ? ' — clique para ver os de fora' : ''}`}>
                          <BarraComTexto v={rp} max={100} texto={`${rp}%`} forte={rp < 80} largura={42} />
                        </button>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="text-[13px]">
                      {l.solucao.comPrazo ? (
                        <button type="button" className="w-full text-left" disabled={!l.solucao.foraIds.length} onClick={() => abrir({ titulo: `Resolvidos fora do prazo — ${l.nome}`, ids: l.solucao.foraIds })} title={`${l.solucao.noPrazo} de ${l.solucao.comPrazo} no prazo${l.solucao.foraIds.length ? ' — clique para ver os de fora' : ''}`}>
                          <BarraComTexto v={sp} max={100} texto={`${sp}%`} forte={sp < 80} largura={42} />
                        </button>
                      ) : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {x.semPrioridade > 0 && <p className="text-[12px] text-muted mt-1.5">{plural(x.semPrioridade, 'resolvido sem prioridade ficou', 'resolvidos sem prioridade ficaram')} fora da conta (sem prioridade, não há prazo).</p>}
        </div>
      )}
    </Cartao>
  );
}

// ---------- Relógio do chamado ----------

export function Relogio({ r, abrir, separar, aoSeparar }: PropsDoRelatorio & { separar: SepararORelogio; aoSeparar: (v: SepararORelogio) => void }) {
  const x = r.relogio;
  const [todos, setTodos] = useState(false);
  const contra = r.periodo.anterior.nome;
  const linhas = x.separado;
  const mostradas = todos ? linhas : linhas.slice(0, 8);
  const maxMed = Math.max(1, ...linhas.map((l) => l.mediana));
  const nomeSeparar = NOME_DO_SEPARAR[separar];
  return (
    <Cartao id="relogio" rodape={<>Do aberto ao Resolvido, em horas úteis (o Fechado vem depois, sozinho, e não entra na conta). Mediana: metade resolve antes, metade depois — um chamado esquecido não puxa a conta. A comparação é com {nomeDoAnterior(r)}.</>}>
      {!x.resolvidos ? <Vazio titulo="Nenhum chamado resolvido no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <>
          <Numeros>
            <Numero valor={tempoUtil(r, x.mediana)} rotulo="mediana até resolver" sub={<Variacao r={r} agora={x.mediana} antes={x.antes.mediana} menorEhMelhor formato="tempo" contra={contra} />} />
            <Numero valor={`até ${tempoUtil(r, x.p90)}`} rotulo="9 em cada 10 resolvem nesse prazo" sub={x.antes.p90 !== null ? <span className="text-muted">eram {tempoUtil(r, x.antes.p90)} antes</span> : undefined} />
            <Numero valor={nf(x.resolvidos)} rotulo="resolvidos no período" sub={<span className="text-muted">{nf(x.antes.resolvidos)} antes</span>} />
          </Numeros>
          <div>
            <div className="eyebrow mb-2">Quanto demorou cada um · clique numa faixa para ver os chamados</div>
            <Colunas pontos={x.faixas.map((f) => ({ id: f.id, rotulo: f.rotulo, n: f.n, ids: f.ids, janela: `Resolvidos em ${f.rotulo}` }))} abrir={abrir} />
            <p className="text-[12px] text-muted mt-1.5">{pct(x.ate4h, x.resolvidos)}% resolvem em até 4 horas úteis.</p>
          </div>
          <div className="border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <label htmlFor="relogio-separar" className="text-[13px] font-semibold text-ink-2">Separar por</label>
              <select id="relogio-separar" className="input w-auto py-1.5 text-[13px]" value={separar} onChange={(e) => aoSeparar(e.target.value as SepararORelogio)}>
                {SEPARAR_O_RELOGIO.map((s) => <option key={s} value={s}>{NOME_DO_SEPARAR[s]}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>{nomeSeparar}</th><th className="!text-right">Resolvidos</th><th className="sm:min-w-[160px]">Mediana</th><th className="!text-right">9 em 10 até</th></tr></thead>
                <tbody>
                  {mostradas.map((l) => (
                    <tr key={l.valor || '(vazio)'}>
                      <td className={`text-[13px] ${l.valor ? '' : 'text-muted italic'}`}>{l.rotulo}</td>
                      <td className="text-right text-[13px]"><NumeroClicavel ids={l.ids} titulo={`Resolvidos — ${l.rotulo}`} abrir={abrir} /></td>
                      <td className="text-[13px]"><BarraComTexto v={l.mediana} max={maxMed} texto={tempoUtil(r, l.mediana)} /></td>
                      <td className="text-right tnum text-[13px] whitespace-nowrap">{tempoUtil(r, l.p90)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linhas.length > 8 && (
                <button type="button" className="btn-ghost btn-sm mt-1" onClick={() => setTodos((v) => !v)}>
                  {todos ? 'Mostrar só os 8 com mais resolvidos' : `Ver os outros ${linhas.length - 8} (${nf(linhas.slice(8).reduce((a, l) => a + l.n, 0))} resolvidos)`}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </Cartao>
  );
}

// ---------- Primeira resposta ----------

export function Resposta({ r, abrir }: PropsDoRelatorio) {
  const x = r.resposta;
  const velho = x.esperando.maisAntigo;
  return (
    <Cartao id="resposta" rodape={<>Do aberto até a primeira ação de uma pessoa no chamado (assumir, anotar, avisar o cliente ou tirar da entrada), em horas úteis. O robô não conta; quem abre o chamado na tela já está falando com o cliente (conta zero).</>}>
      <Numeros>
        <Numero valor={x.respondidos ? tempoUtil(r, x.mediana) : '—'} rotulo="mediana até a primeira resposta" sub={<Variacao r={r} agora={x.mediana} antes={x.antes.mediana} menorEhMelhor formato="tempo" contra={r.periodo.anterior.nome} />} />
        <Numero valor={x.respondidos ? `${pct(x.ate1h, x.respondidos)} de 100` : '—'} rotulo="em até 1 hora útil" sub={<span className="text-muted">{plural(x.respondidos, 'respondido', 'respondidos')} no período</span>} />
        <Numero valor={nf(x.esperando.n)} rotulo="esperando agora" tom={x.esperando.n ? 'signal' : undefined} abrir={abrir} ids={x.esperando.ids} janela="Esperando a primeira resposta"
          sub={velho ? <span className="text-muted">o mais antigo há {tempoUtil(r, velho.minutos)}</span> : undefined} />
      </Numeros>
      {!x.respondidos ? <Vazio titulo="Nenhum chamado respondido no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <div>
          <div className="eyebrow mb-2">Quanto esperou cada um · clique numa faixa para ver os chamados</div>
          <Colunas pontos={x.faixas.map((f) => ({ id: f.id, rotulo: f.rotulo, n: f.n, ids: f.ids, janela: `Primeira resposta em ${f.rotulo}` }))} abrir={abrir} altura={120} />
        </div>
      )}
      {x.foraDoHorario > 0 && <p className="text-[12.5px] text-ink-2">{plural(x.foraDoHorario, 'chegou', 'chegaram')} fora do horário de atendimento: o relógio deles começou no início do dia útil seguinte.</p>}
    </Cartao>
  );
}

// ---------- A escada N1 → N2 → N3 → DEV ----------

export function Escada({ r, abrir }: PropsDoRelatorio) {
  const e = r.escada;
  const total = e.resolvidos;
  const ultimo = e.degraus[e.degraus.length - 1];
  return (
    <Cartao id="escada" rodape={<>Vem da trajetória de cada chamado: o nível mais alto por onde ele passou, com a hora exata e o motivo de cada subida. Quem resolve sem passar por uma etapa de nível conta no N1{e.semNivel ? ` (${nf(e.semNivel)} no período)` : ''}.</>}>
      {!total ? <Vazio titulo="Nenhum chamado resolvido no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <>
          <Numeros>
            <Numero valor={`${e.degraus[0]!.pct} de 100`} rotulo="o N1 resolve sozinho" abrir={abrir} ids={e.degraus[0]!.ids} janela="Resolvidos no N1"
              sub={<Variacao r={r} agora={e.degraus[0]!.pct} antes={e.antesN1} formato="pontos" contra={r.periodo.anterior.nome} />} />
            {ultimo && ultimo.nivel > 1 && (
              <Numero valor={`${pct(ultimo.entram, total)} de 100`} rotulo={`chegam ao ${ultimo.nome}`} abrir={abrir} ids={[...ultimo.ids, ...ultimo.idsSobem]} janela={`Chegaram ao ${ultimo.nome}`}
                sub={<span className="text-muted">{plural(ultimo.entram, 'chamado', 'chamados')}</span>} />
            )}
            <Numero valor={nf(e.voltas.n)} rotulo="voltaram de nível" abrir={abrir} ids={e.voltas.ids} janela="Voltaram de nível" sub={<span className="text-muted">cada volta com o motivo</span>} />
          </Numeros>
          <div>
            <div className="eyebrow mb-2">De {plural(total, 'resolvido', 'resolvidos')} · clique num degrau para ver os chamados</div>
            <div className="flex flex-col gap-2.5" role="list">
              {e.degraus.map((d) => {
                const antes = total - d.entram;
                return (
                  <div key={d.nivel} role="listitem" className="grid grid-cols-[38px_minmax(0,1fr)] sm:grid-cols-[38px_minmax(0,1fr)_150px] items-center gap-x-2 gap-y-0.5">
                    <span className="font-display font-semibold text-[14px]">{d.nome}</span>
                    <div className="relative h-7 rounded-md bg-surface-2">
                      {d.entram > 0 && (
                        <div className="absolute inset-y-0 flex" style={{ left: `${(antes / total) * 100}%`, width: `${(d.entram / total) * 100}%` }}>
                          {/* a largura é a conta (a fatia fina continua fina): o texto vai dentro e é cortado; a divisa entre as duas é uma sombra, que não ocupa lugar */}
                          {d.resolvem > 0 && (
                            <button type="button" onClick={() => abrir({ titulo: `Resolvidos no ${d.nome}`, ids: d.ids })} title={`${d.nome}: ${nf(d.resolvem)} resolvem (${d.pct}%) — clique para ver`}
                              className="h-full min-w-0 rounded-md bg-accent hover:brightness-110 text-white text-[12px] font-semibold text-left overflow-hidden whitespace-nowrap"
                              style={{ width: `${(d.resolvem / d.entram) * 100}%` }}>
                              <span className="px-2">{d.resolvem / total > 0.3 ? `${nf(d.resolvem)} resolvem` : d.resolvem / total > 0.07 ? nf(d.resolvem) : ''}</span>
                            </button>
                          )}
                          {d.sobem > 0 && (
                            <button type="button" onClick={() => abrir({ titulo: `Subiram do ${d.nome}`, ids: d.idsSobem })} title={`${nf(d.sobem)} sobem do ${d.nome} — clique para ver`}
                              className="h-full min-w-0 rounded-md bg-line-strong text-ink text-[12px] text-left overflow-hidden whitespace-nowrap hover:brightness-105"
                              style={{ width: `${(d.sobem / d.entram) * 100}%`, boxShadow: d.resolvem > 0 ? 'inset 2px 0 0 var(--surface)' : undefined }}>
                              <span className="px-2">{d.sobem / total > 0.3 ? `${nf(d.sobem)} sobem` : d.sobem / total > 0.07 ? nf(d.sobem) : ''}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="col-start-2 sm:col-start-auto text-[12px] text-muted tnum whitespace-nowrap">
                      {nf(d.resolvem)} · {d.pct}%{d.mediana != null ? ` · ${tempoUtil(r, d.mediana)}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[12px] text-ink-2">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent" /> resolvem naquele nível</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-line-strong" /> sobem para o próximo</span>
              <span className="text-muted">à direita: quantos, o % e a mediana até resolver</span>
            </div>
          </div>
          {e.motivos.length > 0 && (
            <div className="border-t border-line pt-3">
              <div className="eyebrow mb-2">Os motivos mais recentes de subir</div>
              <ul className="flex flex-col gap-1.5">
                {e.motivos.map((m) => (
                  <li key={`${m.id}-${m.em}`} className="text-[13px] grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 items-baseline">
                    <LinkDoChamado codigo={m.codigo} className="font-mono text-[12px] link whitespace-nowrap">{m.codigo}</LinkDoChamado>
                    <span className="min-w-0">
                      <b className="font-semibold">{m.de} → {m.para}</b> {m.motivo ? <span className="text-ink-2">{m.motivo}</span> : <span className="text-muted">sem motivo</span>}
                      <span className="text-muted text-[12px] whitespace-nowrap"> · {data(m.em, true)}{m.quem ? ` · ${m.quem}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Cartao>
  );
}

// ---------- Onde o chamado empaca ----------

export function Empaca({ r, abrir }: PropsDoRelatorio) {
  const g = r.empaca;
  const lenta = g.etapas.find((e) => e.id === g.maisLenta);
  const maxMed = Math.max(0, ...g.etapas.map((e) => e.mediana ?? 0));
  const parados = g.etapas.flatMap((e) => e.paradosAgora.ids);
  return (
    <Cartao id="empaca" rodape={<>Cada vez que um chamado entra numa etapa e sai dela no período conta uma passagem, em horas úteis (o tempo esperando conta: o chamado está parado ali). As etapas que resolvem e fecham não entram. Para ser a mais lenta, a etapa precisa de 3 passagens ou mais. "Parados agora" é de agora, de qualquer data.</>}>
      <Numeros>
        {lenta ? <Numero valor={lenta.nome} rotulo={`a etapa mais lenta: metade fica mais de ${tempoUtil(r, lenta.mediana)}`} tom="signal" abrir={abrir} ids={lenta.ids} janela={`Passaram por ${lenta.nome}`} />
          : <Numero valor="—" rotulo="poucas passagens para comparar" />}
        <Numero valor={nf(parados.length)} rotulo="parados numa etapa agora" abrir={abrir} ids={parados} janela="Parados numa etapa agora" />
      </Numeros>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Etapa</th><th className="sm:min-w-[150px]">Mediana parado</th><th className="!text-right">Parados agora</th></tr></thead>
          <tbody>
            {g.etapas.map((e) => (
              <tr key={e.id}>
                <td className="text-[13px]">
                  {e.passagens ? <button type="button" className="text-left hover:underline" onClick={() => abrir({ titulo: `Passaram por ${e.nome}`, ids: e.ids })} title="Clique para ver os chamados que passaram por ela">{e.nome}</button> : e.nome}
                  <span className="block text-[11.5px] text-muted tnum">{e.passagens ? `${plural(e.passagens, 'passagem', 'passagens')} · 9 em 10 até ${tempoUtil(r, e.p90)}` : 'nenhuma passagem no período'}</span>
                </td>
                <td className="text-[13px]">{e.mediana == null ? <span className="text-muted">—</span> : <BarraComTexto v={e.mediana} max={maxMed} texto={tempoUtil(r, e.mediana)} forte={e.id === g.maisLenta} />}</td>
                <td className="text-right text-[13px]"><NumeroClicavel ids={e.paradosAgora.ids} titulo={`Parados em ${e.nome} agora`} abrir={abrir} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

// ---------- A prioridade faz diferença? ----------

export function PrioridadeFaz({ r, abrir }: PropsDoRelatorio) {
  const x = r.prioridade;
  const maxMed = Math.max(0, ...x.linhas.map((l) => l.mediana ?? 0));
  return (
    <Cartao id="prioridade" rodape={<>A prioridade do chamado: a sugerida pela gravidade (e pelo alcance, no painel que o usa), ou a trocada à mão, com o motivo. Mediana até resolver, em horas úteis, dos resolvidos no período; só compara as prioridades com 3 resolvidos ou mais. "Em aberto" é de agora.</>}>
      <Numeros>
        {x.resposta === 'sim' ? <Numero valor="Sim" rotulo="quanto mais alta, mais rápido" tom="ok" />
          : x.resposta === 'nem_sempre' ? <Numero valor="Nem sempre" rotulo="uma prioridade mais alta demorou mais que uma mais baixa" tom="signal" />
            : <Numero valor="—" rotulo="poucos resolvidos com prioridade para comparar" />}
        <Numero valor={nf(x.trocadas.n)} rotulo="com a prioridade trocada à mão" abrir={abrir} ids={x.trocadas.ids} janela="Prioridade trocada à mão"
          sub={<span className="text-muted">de {nf(x.resolvidos)} resolvidos, cada um com o motivo</span>} />
      </Numeros>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Prioridade</th><th className="!text-right">Resolvidos</th><th className="sm:min-w-[160px]">Mediana até resolver</th><th className="!text-right">Em aberto</th></tr></thead>
          <tbody>
            {x.linhas.map((l) => (
              <tr key={l.prioridade ?? 'sem'}>
                <td className="text-[13px] whitespace-nowrap"><ChipPrioridade p={l.prioridade} /></td>
                <td className="text-right text-[13px]"><NumeroClicavel ids={l.ids} titulo={`Resolvidos — ${l.prioridade ? NOME_PRIORIDADE[l.prioridade] : 'sem prioridade'}`} abrir={abrir} /></td>
                <td className="text-[13px]">{l.mediana == null ? <span className="text-muted">—</span> : (
                  <BarraComTexto v={l.mediana} max={maxMed} texto={tempoUtil(r, l.mediana)}
                    apagada={!l.prioridade || l.resolvidos < 3} titulo={!l.prioridade ? 'Sem prioridade: fica fora da comparação' : l.resolvidos < 3 ? 'Poucos resolvidos (menos de 3): fica fora da comparação' : undefined} />
                )}</td>
                <td className="text-right text-[13px]"><NumeroClicavel ids={l.abertos.ids} titulo={`Em aberto — ${l.nome}`} abrir={abrir} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

// ---------- Esperando a operadora ----------

export function Operadora({ r, abrir }: PropsDoRelatorio) {
  const x = r.operadora;
  const comTempo = x.linhas.filter((l) => l.chamados > 0);
  return (
    <Cartao id="operadora" rodape={<>Vem do caso aberto na operadora de cada chamado (o protocolo e o prometido para) e da marca Esperando a operadora, que não para o prazo. O tempo é dos resolvidos no período que tiveram a operadora no meio, em horas úteis. Na tabela: os protocolos abertos no período, os abertos agora (de qualquer data) e, dos fechados no período, quantos a operadora entregou até o prometido.</>}>
      <Numeros>
        <Numero valor={x.pctEspera === null ? '—' : `${x.pctEspera}%`} rotulo="do tempo foi esperando a operadora"
          sub={<span className="text-muted">nos {plural(x.chamados, 'chamado', 'chamados')} com operadora</span>} />
        <Numero valor={nf(x.abertosAgora.n)} rotulo="com protocolo aberto na operadora agora" abrir={abrir} ids={x.abertosAgora.ids} janela="Com protocolo aberto na operadora" />
        <Numero valor={nf(x.passouDoPrometido.n)} rotulo="passaram do prometido" tom={x.passouDoPrometido.n ? 'signal' : undefined} abrir={abrir} ids={x.passouDoPrometido.ids} janela="A operadora passou do prometido" />
      </Numeros>
      {!x.linhas.length ? <Vazio titulo="Nenhum chamado com a operadora no período" texto="Os chamados com protocolo aberto na operadora (ou marcados esperando por ela) aparecem aqui." /> : (
        <>
          {comTempo.length > 0 && (
            <div>
              <div className="eyebrow mb-2">Para onde foi o tempo, até resolver · clique numa operadora para ver os chamados</div>
              <ul className="flex flex-col gap-2.5">
                {comTempo.map((l) => (
                  <li key={l.nome}>
                    <button type="button" className="w-full text-left" onClick={() => abrir({ titulo: `Com a operadora ${l.nome}`, ids: l.ids })}>
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-[13px]">
                        <b className="font-semibold">{l.nome} <span className="font-normal text-muted">· {plural(l.chamados, 'chamado', 'chamados')}</span></b>
                        <span className="text-muted text-[12px]">esperando: {tempoUtil(r, l.esperaMediana)} (mediana)</span>
                      </span>
                      <span className="flex h-5 rounded-md overflow-hidden gap-0.5 mt-1 bg-surface-2">
                        {l.partes.trabalhando > 0 && <span className="bg-accent text-white text-[11px] font-semibold px-1.5 flex items-center" style={{ width: `${l.partes.trabalhando}%` }}>{l.partes.trabalhando >= 12 ? `${l.partes.trabalhando}%` : ''}</span>}
                        {l.partes.operadora > 0 && <span className="bg-signal text-white text-[11px] font-semibold px-1.5 flex items-center" style={{ width: `${l.partes.operadora}%` }}>{l.partes.operadora >= 12 ? `${l.partes.operadora}%` : ''}</span>}
                        {l.partes.cliente > 0 && <span className="bg-line-strong text-ink text-[11px] px-1.5 flex items-center" style={{ width: `${l.partes.cliente}%` }}>{l.partes.cliente >= 12 ? `${l.partes.cliente}%` : ''}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] text-ink-2">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent" /> a equipe trabalhando</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-signal" /> esperando a operadora</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-line-strong" /> esperando o cliente</span>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Operadora</th><th className="!text-right">Protocolos no período</th><th className="!text-right">Abertos agora</th><th className="!text-right">Prometido cumprido</th></tr></thead>
              <tbody>
                {x.linhas.map((l) => (
                  <tr key={l.nome}>
                    <td className="text-[13px]">{l.nome}</td>
                    <td className="text-right tnum text-[13px]">{nf(l.casos)}</td>
                    <td className="text-right text-[13px]"><NumeroClicavel ids={l.abertos.ids} titulo={`Protocolo aberto na ${l.nome}`} abrir={abrir} /></td>
                    <td className="text-right text-[13px] whitespace-nowrap">
                      {l.prometido.total ? (
                        <button type="button" className={`tnum ${l.prometido.foraIds.length ? 'hover:underline' : ''}`} disabled={!l.prometido.foraIds.length} title={l.prometido.foraIds.length ? 'Clique para ver os que passaram do prometido' : undefined}
                          onClick={() => abrir({ titulo: `A ${l.nome} passou do prometido`, ids: l.prometido.foraIds })}>
                          {nf(l.prometido.cumprido)} de {nf(l.prometido.total)}
                        </button>
                      ) : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Cartao>
  );
}
