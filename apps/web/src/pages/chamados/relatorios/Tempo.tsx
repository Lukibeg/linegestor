/**
 * Relatórios › Tempo: o **Relógio do chamado** (quanto tempo leva do aberto ao fechado), a
 * **Escada N1 → N2 → N3** (quanto o N1 resolve sozinho, e quanto sobe), **Onde o chamado empaca**
 * (quanto tempo fica em cada etapa), a **Primeira resposta** (quanto espera até alguém pegar),
 * **A prioridade faz diferença?** e o **Prazo cumprido** (fecha até o vencimento?).
 */
import { useState } from 'react';
import { CalendarClock, Footprints, Hand, Signal, Timer, TrafficCone } from 'lucide-react';
import { HORARIO_COMERCIAL, SEPARAR_POR, type SepararPor } from '@gestor/shared';
import type { RelatoriosChamados } from '../../../api/types.js';
import { Colunas } from '../../../components/graficos.js';
import { Vazio } from '../../../components/ui/index.js';
import { data } from '../../../lib/format.js';
import { Bloco, CodigoDoCard, diaCurto, horas, nf, Numero, Numeros, pct, Variacao } from './pecas.js';

const NOMES_SEPARAR: Record<SepararPor, string> = { tipo: 'Tipo de chamado', produto: 'Produto', responsavel: 'Responsável', cliente: 'Cliente', assunto: 'Assunto' };

export function Relogio({ r, abrir, separar, aoSeparar }: {
  r: RelatoriosChamados; abrir: (peca: string) => void; separar: SepararPor | undefined; aoSeparar: (v: SepararPor | undefined) => void;
}) {
  const x = r.relogio;
  const [todos, setTodos] = useState(false);
  const linhas = x.separado?.linhas ?? [];
  const mostradas = todos ? linhas : linhas.slice(0, 10);
  const maxMed = Math.max(1, ...linhas.map((l) => l.mediana));
  const anterior = `${diaCurto(x.anterior.de)} a ${diaCurto(x.anterior.ate)}`;
  return (
    <Bloco
      id="relogio" titulo="Relógio do chamado" pergunta="Quanto tempo um chamado leva, do aberto ao fechado?" icone={Timer}
      rodape={<>Conta os fechados no período, do aberto ao fechado, em horas corridas (noites e fins de semana inclusos). Mediana: metade fecha antes, metade depois — um chamado esquecido não puxa a conta.{x.estimados ? ` ${nf(x.estimados)} fechados antes de o Gestor começar a ler o LineChat têm a hora do fechamento estimada e ficaram de fora.` : ''}</>}
    >
      {!x.n ? <Vazio titulo="Nenhum chamado fechado no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <>
          <Numeros>
            <Numero valor={horas(x.mediana)} rotulo="mediana até fechar" titulo={`Período anterior: ${anterior}`} sub={<Variacao agora={x.mediana} antes={x.anterior.mediana} menorEhMelhor formato="horas" contra="o período anterior" />} />
            <Numero valor={`até ${horas(x.p90)}`} rotulo="9 em cada 10 fecham nesse prazo" />
            <Numero valor={nf(x.n)} rotulo="fechados no período" sub={<span className="text-muted">{nf(x.anterior.n)} no período anterior ({anterior})</span>} />
          </Numeros>
          <div>
            <div className="eyebrow mb-2">Quanto demorou cada um · clique numa faixa para ver os chamados</div>
            <Colunas pontos={x.faixas.map((f) => ({ id: f.id, rotulo: f.rotulo, n: f.n, destaque: true }))} altura={140} aoClicar={(id) => abrir(`relogio:${id}`)} />
            <p className="text-[12px] text-muted mt-1.5">
              {x.faixas.slice(0, 3).reduce((a, f) => a + f.n, 0) ? `${pct(x.faixas.slice(0, 3).reduce((a, f) => a + f.n, 0), x.n)}% fecham no mesmo dia (em menos de 24h).` : ''}
            </p>
          </div>
          <div className={`border-t border-line pt-3 ${x.separado ? '' : 'so-tela'}`}>
            <div className="so-tela flex flex-wrap items-center gap-2 mb-2">
              <label htmlFor="relogio-separar" className="text-[13px] font-semibold text-ink-2">Separar por</label>
              <select id="relogio-separar" className="input w-auto py-1.5" value={separar ?? ''} onChange={(e) => aoSeparar((e.target.value || undefined) as SepararPor | undefined)}>
                <option value="">— nada —</option>
                {SEPARAR_POR.map((s) => <option key={s} value={s} disabled={s !== 'responsavel' && !r.campos[s as Exclude<SepararPor, 'responsavel'>]}>{NOMES_SEPARAR[s]}</option>)}
              </select>
            </div>
            {x.separado && (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>{x.separado.nome}</th><th className="!text-right">Fechados</th><th>Mediana até fechar</th><th className="!text-right">9 em 10 até</th></tr></thead>
                  <tbody>
                    {mostradas.map((l) => (
                      <tr key={l.valor}>
                        <td className={`text-[13px] ${l.valor === '__vazio__' ? 'text-muted italic' : ''}`}>{l.rotulo}</td>
                        <td className="text-right tnum text-[13px]">{nf(l.n)}</td>
                        <td className="text-[13px] min-w-[180px]">
                          <span className="flex items-center gap-2">
                            <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (l.mediana / maxMed) * 100)}%` }} /></span>
                            <span className="tnum whitespace-nowrap w-[78px] text-right">{horas(l.mediana)}</span>
                          </span>
                        </td>
                        <td className="text-right tnum text-[13px] whitespace-nowrap">{horas(l.p90)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {linhas.length > 10 && <button className="so-tela btn-ghost btn-sm mt-1" onClick={() => setTodos((v) => !v)}>{todos ? 'Mostrar só os 10 maiores' : `Ver todos (${linhas.length})`}</button>}
              </div>
            )}
          </div>
        </>
      )}
    </Bloco>
  );
}

export function Escada({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const e = r.escada;
  const desde = r.historicoDesde ? data(r.historicoDesde) : 'a primeira leitura';
  if (!e.achouNiveis) {
    return (
      <Bloco id="escada" titulo="A escada N1 → N2 → N3" pergunta="Quanto o N1 resolve sozinho, e quanto sobe?" icone={Footprints}>
        <Vazio titulo="Não achei as etapas N1, N2 e N3" texto='A escada procura etapas com "N1", "N2" e "N3" no nome (como "Chamado Em Tratativa N1"). Se elas mudaram de nome no LineChat, avise para ajustarmos.' />
      </Bloco>
    );
  }
  const n = e.n;
  const ateN1 = e.direto + e.n1;
  const de100 = (v: number) => (n ? Math.round((v / n) * 100) : 0);
  const degraus = [
    { id: 'n1', nome: 'N1', antes: 0, resolve: ateN1, sobe: e.n2 + e.n3, mediana: e.medianas.n1, resolveTxt: 'fecham sem passar do N1' },
    { id: 'n2', nome: 'N2', antes: ateN1, resolve: e.n2, sobe: e.n3, mediana: e.medianas.n2, resolveTxt: 'fecham no N2' },
    { id: 'n3', nome: 'N3', antes: ateN1 + e.n2, resolve: e.n3, sobe: 0, mediana: e.medianas.n3, resolveTxt: 'fecham no N3' },
  ];
  return (
    <Bloco
      id="escada" titulo="A escada N1 → N2 → N3" pergunta="Quanto o N1 resolve sozinho, e quanto sobe?" icone={Footprints}
      rodape={<>Conta os fechados no período que foram abertos depois de {desde}, quando o Gestor começou a guardar cada mudança de etapa{e.semHistorico ? ` (${nf(e.semHistorico)} abertos antes disso ficaram de fora: não se sabe por onde passaram)` : ''}. O nível é o mais alto por onde o chamado passou; "sem passar do N1" inclui {nf(e.direto)} que fecharam sem entrar em nenhuma etapa N.</>}
    >
      {!n ? <Vazio titulo="Nenhum chamado com o caminho conhecido no período" texto={`O caminho de cada chamado é guardado desde ${desde}. Escolha um período a partir dessa data.`} /> : (
        <>
          <Numeros>
            <Numero valor={`${de100(ateN1)} de 100`} rotulo="o N1 resolve sozinho" aoClicar={() => abrir('escada:n1')} />
            <Numero valor={`${de100(e.n3)} de 100`} rotulo="chegam ao N3" aoClicar={e.n3 ? () => abrir('escada:n3') : undefined} />
            <Numero valor={nf(e.reabertos)} rotulo="fecharam e voltaram (reabertos)" tom={e.reabertos ? 'signal' : undefined} aoClicar={e.reabertos ? () => abrir('escada:reabertos') : undefined} />
          </Numeros>
          <div>
            <div className="eyebrow mb-2">De {nf(n)} chamados fechados · clique num degrau para ver os chamados</div>
            <div className="flex flex-col gap-2.5" role="list">
              {degraus.map((d) => (
                <div key={d.id} role="listitem" className="grid grid-cols-[34px_minmax(0,1fr)] sm:grid-cols-[34px_minmax(0,1fr)_118px] items-center gap-x-2 gap-y-0.5">
                  <span className="font-display font-semibold text-[14px]">{d.nome}</span>
                  <div className="relative h-7 rounded-md bg-surface-2">
                    {d.resolve + d.sobe > 0 && (
                      <div className="absolute inset-y-0 flex" style={{ left: `${(d.antes / n) * 100}%`, width: `${((d.resolve + d.sobe) / n) * 100}%` }}>
                        {d.resolve > 0 && (
                          <button
                            type="button" onClick={() => abrir(`escada:${d.id}`)} title={`${d.nome}: ${nf(d.resolve)} ${d.resolveTxt} (${pct(d.resolve, n)}%) — clique para ver`}
                            className="h-full rounded-md bg-accent hover:brightness-110 text-white text-[12px] font-semibold px-2 text-left overflow-hidden whitespace-nowrap"
                            style={{ width: `${(d.resolve / (d.resolve + d.sobe)) * 100}%` }}
                          >
                            {d.resolve / n > 0.3 ? `${nf(d.resolve)} fecham` : d.resolve / n > 0.07 ? nf(d.resolve) : ''}
                          </button>
                        )}
                        {d.sobe > 0 && (
                          <span
                            className="h-full rounded-md bg-line-strong text-ink text-[12px] px-2 flex items-center overflow-hidden whitespace-nowrap ml-0.5"
                            style={{ width: `${(d.sobe / (d.resolve + d.sobe)) * 100}%` }} title={`${nf(d.sobe)} sobem do ${d.nome}`}
                          >
                            {d.sobe / n > 0.3 ? `${nf(d.sobe)} sobem` : d.sobe / n > 0.07 ? nf(d.sobe) : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="col-start-2 sm:col-start-auto text-[12px] text-muted tnum whitespace-nowrap">
                    {nf(d.resolve)} · {pct(d.resolve, n)}%{d.mediana != null ? ` · ${horas(d.mediana)}` : ''}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[12px] text-ink-2">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent" /> fecham naquele nível</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-line-strong" /> sobem para o próximo</span>
              <span className="text-muted">à direita: quantos, o % e a mediana até fechar</span>
            </div>
          </div>
        </>
      )}
    </Bloco>
  );
}

/** Uma barra deitada com o texto à direita (as tabelas de tempo). */
function BarraComTexto({ v, max, texto, forte }: { v: number; max: number; texto: string; forte?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden"><span className={`block h-full rounded-full ${forte ? 'bg-signal' : 'bg-accent'}`} style={{ width: `${Math.max(v ? 3 : 0, (v / Math.max(max, 1e-9)) * 100)}%` }} /></span>
      <span className="tnum whitespace-nowrap w-[74px] text-right">{texto}</span>
    </span>
  );
}

/** Um número de tabela que, clicado, mostra os chamados dele (zero não clica). */
function NumeroClicavel({ v, aoClicar, tom }: { v: number; aoClicar: () => void; tom?: string }) {
  return v
    ? <button type="button" onClick={aoClicar} className={`tnum hover:underline ${tom ?? ''}`} title="Clique para ver os chamados">{nf(v)}</button>
    : <span className="tnum text-muted">0</span>;
}

// ---------- Onde o chamado empaca ----------

export function Gargalo({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const g = r.gargalo;
  const desde = r.historicoDesde ? data(r.historicoDesde) : 'a primeira leitura';
  const lenta = g.etapas.find((e) => e.id === g.maisLenta);
  const maxMed = Math.max(0, ...g.etapas.map((e) => e.mediana ?? 0));
  const paradosAgora = g.etapas.reduce((a, e) => a + e.agora, 0);
  return (
    <Bloco
      id="gargalo" titulo="Onde o chamado empaca" pergunta="Em que etapa o chamado fica mais tempo parado?" icone={TrafficCone}
      rodape={<>Cada vez que um chamado entra numa etapa e sai dela no período conta uma passagem, em horas corridas. O Gestor guarda as mudanças de etapa desde {desde}. As etapas que fecham não entram. Para ser a mais lenta, a etapa precisa de 3 passagens ou mais. "Parados agora" é de agora, de qualquer data.</>}
    >
      {!g.etapas.length ? <Vazio titulo="Nenhuma passagem por etapa no período" texto={`As mudanças de etapa são guardadas desde ${desde}. Escolha um período a partir dessa data.`} /> : (
        <>
          <Numeros>
            {lenta && <Numero valor={lenta.titulo} rotulo={`a etapa mais lenta: metade fica mais de ${horas(lenta.mediana)}`} tom="signal" aoClicar={() => abrir(`gargalo:${lenta.id}`)} />}
            <Numero valor={nf(paradosAgora)} rotulo="parados numa etapa agora" />
          </Numeros>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Etapa</th><th className="min-w-[150px]">Mediana parado</th><th className="!text-right">Parados agora</th></tr></thead>
              <tbody>
                {g.etapas.map((e) => (
                  <tr key={e.id}>
                    <td className="text-[13px]">
                      {e.n ? <button type="button" className="text-left hover:underline" onClick={() => abrir(`gargalo:${e.id}`)} title="Clique para ver os chamados que passaram por ela">{e.titulo}</button> : e.titulo}
                      <span className="block text-[11.5px] text-muted tnum">{e.n ? `${nf(e.n)} passage${e.n === 1 ? 'm' : 'ns'} · 9 em 10 até ${horas(e.p90)}` : 'nenhuma passagem no período'}</span>
                    </td>
                    <td className="text-[13px]">{e.mediana == null ? <span className="text-muted">—</span> : <BarraComTexto v={e.mediana} max={maxMed} texto={horas(e.mediana)} forte={e.id === g.maisLenta} />}</td>
                    <td className="text-right text-[13px]"><NumeroClicavel v={e.agora} aoClicar={() => abrir(`gargalo:${e.id}:agora`)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Bloco>
  );
}

// ---------- Primeira resposta ----------

export function PrimeiraResposta({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const x = r.primeira;
  const desde = r.historicoDesde ? data(r.historicoDesde) : 'a primeira leitura';
  if (!x.inicial) {
    return (
      <Bloco id="primeira" titulo="Primeira resposta" pergunta="Quanto tempo o chamado espera até alguém pegar?" icone={Hand}>
        <Vazio titulo="Não achei a etapa onde o chamado nasce" texto="A primeira resposta conta até o card sair da etapa inicial do painel (como Novos Suporte)." />
      </Bloco>
    );
  }
  const velho = x.maisAntigoEsperando;
  return (
    <Bloco
      id="primeira" titulo="Primeira resposta" pergunta="Quanto tempo o chamado espera até alguém pegar?" icone={Hand}
      rodape={<>
        Da abertura até o card sair de <b>{x.inicial.titulo}</b> (alguém pegou), em horas corridas, para os abertos no período em horário comercial (segunda a sexta, das {HORARIO_COMERCIAL.de}h às {HORARIO_COMERCIAL.ate}h).
        {x.fora.n ? <> <button type="button" className="link" onClick={() => abrir('primeira:fora')}>{nf(x.fora.n)} chegaram fora do horário</button> e ficam à parte (mediana {horas(x.fora.mediana)}).</> : ''}
        {' '}Card que já nasce em outra etapa conta como pego na hora. O caminho é guardado desde {desde}{x.semHistorico ? `: ${nf(x.semHistorico)} abertos antes disso ficaram de fora` : ''}.
      </>}
    >
      <Numeros>
        <Numero valor={x.n ? horas(x.mediana) : '—'} rotulo="mediana até alguém pegar" />
        <Numero valor={x.n ? `${pct(x.ate1h, x.n)} de 100` : '—'} rotulo="pegos em até 1 hora" />
        <Numero valor={nf(x.esperando)} rotulo={`esperando em ${x.inicial.titulo} agora`} tom={x.esperando ? 'signal' : undefined} aoClicar={x.esperando ? () => abrir('primeira:esperando') : undefined} />
      </Numeros>
      {!x.n ? <Vazio titulo="Nenhum chamado pego no período" texto={`O caminho de cada chamado é guardado desde ${desde}. Escolha um período a partir dessa data.`} /> : (
        <div>
          <div className="eyebrow mb-2">Quanto esperou cada um · clique numa faixa para ver os chamados</div>
          <Colunas pontos={x.faixas.map((f) => ({ id: f.id, rotulo: f.rotulo, n: f.n, destaque: true }))} altura={130} aoClicar={(id) => abrir(`primeira:${id}`)} />
        </div>
      )}
      {velho && (
        <p className="text-[13px] flex flex-wrap items-baseline gap-x-2">
          <span className="text-muted">Esperando há mais tempo:</span> <CodigoDoCard c={velho} /> <span className="min-w-0 truncate max-w-full">{velho.title}</span>
          <span className="text-signal font-semibold tnum whitespace-nowrap">há {horas(velho.horas)}</span>
        </p>
      )}
    </Bloco>
  );
}

// ---------- A prioridade faz diferença? ----------

export function Prioridade({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const x = r.prioridade;
  if (!x.temEtiquetas) {
    return (
      <Bloco id="prioridade" titulo="A prioridade faz diferença?" pergunta="Chamado crítico fecha mais rápido que o de prioridade baixa?" icone={Signal}>
        <Vazio titulo="O painel não tem etiquetas de prioridade" texto='O relatório procura etiquetas com o nome começando por "P/" (P/ Crítica, P/ Alta, P/ Média, P/ Baixa).' />
      </Bloco>
    );
  }
  const comDado = x.linhas.filter((l) => l.nivel < 9 && l.fechados >= 3 && l.mediana != null);
  const maxMed = Math.max(0, ...x.linhas.map((l) => l.mediana ?? 0));
  const inv = x.invertidas[0];
  return (
    <Bloco
      id="prioridade" titulo="A prioridade faz diferença?" pergunta="Chamado crítico fecha mais rápido que o de prioridade baixa?" icone={Signal}
      rodape={<>A prioridade é a etiqueta do card (P/ Crítica, P/ Alta, P/ Média, P/ Baixa); com mais de uma, vale a mais alta. A mediana é do aberto ao fechado, em horas corridas, dos fechados no período (fechamento estimado fica de fora). Só compara prioridades com 3 fechados ou mais. "Em aberto" é de agora.</>}
    >
      <Numeros>
        {inv ? <Numero valor="Nem sempre" rotulo={`${inv.mais} demorou mais que ${inv.menos}${x.invertidas.length > 1 ? ` (e mais ${x.invertidas.length - 1})` : ''}`} tom="signal" />
          : comDado.length >= 2 ? <Numero valor="Sim" rotulo="quanto mais alta a prioridade, mais rápido fecha" tom="ok" />
            : <Numero valor="—" rotulo="poucos fechados com prioridade para comparar" />}
        <Numero valor={`${x.semPrioridadePct}%`} rotulo="dos fechados sem prioridade" aoClicar={x.linhas.find((l) => l.id === 'sem')?.fechados ? () => abrir('prioridade:sem:fechados') : undefined} />
      </Numeros>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Prioridade</th><th className="!text-right">Fechados</th><th className="min-w-[170px]">Mediana até fechar</th><th className="!text-right">Em aberto</th></tr></thead>
          <tbody>
            {x.linhas.map((l) => (
              <tr key={l.id}>
                <td className="text-[13px] whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${l.cor ? '' : 'border border-line-strong'}`} style={l.cor ? { background: l.cor } : undefined} />
                    <span className={l.id === 'sem' ? 'text-muted italic' : ''}>{l.rotulo}</span>
                  </span>
                </td>
                <td className="text-right text-[13px]"><NumeroClicavel v={l.fechados} aoClicar={() => abrir(`prioridade:${l.id}:fechados`)} /></td>
                <td className="text-[13px]">{l.mediana == null ? <span className="text-muted">—</span> : <BarraComTexto v={l.mediana} max={maxMed} texto={horas(l.mediana)} />}</td>
                <td className="text-right text-[13px]"><NumeroClicavel v={l.abertos} aoClicar={() => abrir(`prioridade:${l.id}:abertos`)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Bloco>
  );
}

// ---------- Prazo cumprido ----------

export function Prazo({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const x = r.prazo;
  const total = x.comPrazo + x.semPrazo;
  const faixa = [
    { id: 'dentro', n: x.dentro, cor: 'bg-accent', texto: 'no prazo' },
    { id: 'fora', n: x.fora, cor: 'bg-signal', texto: 'depois do vencimento' },
    { id: 'sem', n: x.semPrazo, cor: 'bg-line-strong', texto: 'sem vencimento' },
  ];
  return (
    <Bloco
      id="prazo" titulo="Prazo cumprido" pergunta="Os chamados com vencimento fecham no prazo?" icone={CalendarClock}
      rodape={<>O vencimento é a data de entrega do card no LineChat. Conta os fechados no período com a hora exata; no prazo = fechou até o dia do vencimento (horário de Brasília). Os fechados sem vencimento ficam fora da porcentagem. "Vencidos em aberto" é de agora.</>}
    >
      <Numeros>
        <Numero
          valor={x.pct == null ? '—' : `${x.pct}%`} rotulo="dos com vencimento fecharam no prazo"
          sub={x.anterior.pct == null ? <span className="text-muted">sem comparação com o período anterior</span> : <span className="text-muted">{x.anterior.pct}% no período anterior</span>}
        />
        <Numero valor={nf(x.fora)} rotulo="fecharam depois do vencimento" tom={x.fora ? 'signal' : undefined} aoClicar={x.fora ? () => abrir('prazo:fora') : undefined} />
        <Numero valor={nf(x.vencidosAgora)} rotulo="vencidos em aberto agora" tom={x.vencidosAgora ? 'signal' : undefined} aoClicar={x.vencidosAgora ? () => abrir('prazo:vencidos') : undefined} />
      </Numeros>
      {!total ? <Vazio titulo="Nenhum chamado fechado no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <>
          <div>
            <div className="eyebrow mb-2">Os {nf(total)} fechados no período · clique numa parte para ver os chamados</div>
            <div className="flex h-7 rounded-md overflow-hidden gap-0.5 bg-surface-2">
              {faixa.filter((f) => f.n).map((f) => (
                <button
                  key={f.id} type="button" onClick={() => abrir(`prazo:${f.id}`)} title={`${nf(f.n)} ${f.texto} — clique para ver`}
                  className={`${f.cor} h-full hover:brightness-110 text-[12px] font-semibold px-2 overflow-hidden whitespace-nowrap text-left ${f.id === 'sem' ? 'text-ink' : 'text-white'}`}
                  style={{ width: `${(f.n / total) * 100}%` }}
                >
                  {f.n / total > 0.12 ? nf(f.n) : ''}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] text-ink-2">
              {faixa.map((f) => <span key={f.id} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${f.cor}`} /> {f.texto} ({nf(f.n)})</span>)}
            </div>
          </div>
          {x.porTipo.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>{r.campos.tipo?.name ?? 'Tipo'}</th><th className="!text-right">Com vencimento</th><th className="min-w-[160px]">No prazo</th></tr></thead>
                <tbody>
                  {x.porTipo.slice(0, 8).map((t) => (
                    <tr key={t.rotulo}>
                      <td className={`text-[13px] ${t.rotulo === 'Não preenchido' ? 'text-muted italic' : ''}`}>{t.rotulo}</td>
                      <td className="text-right tnum text-[13px]">{nf(t.n)}</td>
                      <td className="text-[13px]"><BarraComTexto v={t.pct} max={100} texto={`${t.pct}%`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {x.porTipo.length > 8 && <p className="text-[12px] text-muted mt-1">Os 8 tipos com mais chamados com vencimento.</p>}
            </div>
          )}
        </>
      )}
    </Bloco>
  );
}
