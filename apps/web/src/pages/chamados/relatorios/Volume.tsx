/**
 * Relatórios › Volume: o **Mapa de calor** (em que dia da semana e hora os chamados chegam), a
 * **Entrada × saída** (a fila está crescendo ou diminuindo?), a **Idade da fila**, os **Dias fora
 * da curva**, o **Sobe e desce dos assuntos** (o que está aumentando?), **Os poucos que pesam
 * muito** (o 80/20) e a **Previsão da semana** (quantos devem chegar na próxima?).
 */
import { useState } from 'react';
import { Activity, ArrowDownUp, ChartColumnDecreasing, Flame, Hourglass, Telescope, TrendingUp } from 'lucide-react';
import { DIAS_DA_SEMANA, duracaoLegivel as horasLegiveis, HORARIO_COMERCIAL, PARETO_POR, type ParetoPor } from '@gestor/shared';
import type { RelatoriosChamados } from '../../../api/types.js';
import { Toggle, Vazio } from '../../../components/ui/index.js';
import { Bloco, CodigoDoCard, ColunasCor, diaCurto, nf, Numero, Numeros, pct } from './pecas.js';

const NOMES_DIA = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
/** Os cinco tons do mapa (do mais fraco ao mais forte), misturando a cor de destaque com o fundo. */
const TONS = [14, 30, 50, 72, 95];
const tom = (v: number, max: number) => (v <= 0 ? 'var(--surface-2)' : `color-mix(in oklab, var(--accent) ${TONS[Math.min(TONS.length - 1, Math.floor((v / (max + 1e-9)) * TONS.length))]}%, var(--surface))`);

export function MapaDeCalor({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const c = r.calor;
  const max = Math.max(0, ...c.celulas.flat());
  // as horas que aparecem: das 7h às 19h sempre, e mais o que tiver chamado fora disso
  const comChamado = c.porHora.map((n, h) => (n > 0 ? h : -1)).filter((h) => h >= 0);
  const de = Math.min(7, ...comChamado); const ate = Math.max(19, ...comChamado);
  const horas = Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  const semanas = Math.max(...c.ocorrencias);
  const diaCheio = c.porDia.indexOf(Math.max(...c.porDia));
  const media = (v: number, dia: number) => (v / Math.max(1, c.ocorrencias[dia]!)).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return (
    <Bloco
      id="calor" titulo="Mapa de calor da semana" pergunta="Em que dia da semana e hora os chamados chegam?" icone={Flame}
      rodape={<>Cada quadrado é quantos chamados chegaram naquele dia da semana e hora, somando o período ({nf(semanas)} {semanas === 1 ? 'semana' : 'semanas'}). Passe o mouse para ver a média por semana. Horário comercial: segunda a sexta, das {HORARIO_COMERCIAL.de}h às {HORARIO_COMERCIAL.ate}h.</>}
    >
      {!c.n ? <Vazio titulo="Nenhum chamado aberto no período" /> : (
        <>
          <Numeros>
            {c.pico && <Numero valor={`${NOMES_DIA[c.pico.dia]}, ${c.pico.hora}h`} rotulo={`o horário de pico: ${media(c.pico.n, c.pico.dia)} por semana`} aoClicar={() => abrir(`calor:${c.pico!.dia}-${c.pico!.hora}`)} />}
            <Numero valor={NOMES_DIA[diaCheio]} rotulo={`o dia mais cheio (${pct(c.porDia[diaCheio]!, c.n)}% dos chamados)`} />
            <Numero valor={nf(c.foraDoHorario)} rotulo={`fora do horário comercial (${pct(c.foraDoHorario, c.n)}%)`} />
          </Numeros>
          <div className="overflow-x-auto -mx-1 px-1 pb-1">
            <table className="border-separate border-spacing-[3px] text-[11px] tnum" aria-label="Chamados por dia da semana e hora">
              <thead>
                <tr>
                  <th className="w-9" />
                  {horas.map((h) => <th key={h} scope="col" className="font-normal text-muted w-[30px] min-w-[26px]">{h % 2 === 0 ? `${h}h` : ''}</th>)}
                  <th scope="col" className="font-normal text-muted pl-2 text-left">total</th>
                </tr>
              </thead>
              <tbody>
                {DIAS_DA_SEMANA.map((nome, d) => (
                  <tr key={nome}>
                    <th scope="row" className="font-normal text-ink-2 text-left pr-1 text-[12px]">{nome}</th>
                    {horas.map((h) => {
                      const v = c.celulas[d]![h]!;
                      const pico = c.pico && c.pico.dia === d && c.pico.hora === h;
                      const fora = !HORARIO_COMERCIAL.dias.includes(d) || h < HORARIO_COMERCIAL.de || h >= HORARIO_COMERCIAL.ate;
                      const forte = v / (max || 1) > 0.55;
                      return (
                        <td key={h} className="p-0">
                          <button
                            type="button" disabled={!v} onClick={() => abrir(`calor:${d}-${h}`)}
                            title={`${NOMES_DIA[d]}, das ${h}h às ${h + 1}h: ${nf(v)} ${v === 1 ? 'chamado' : 'chamados'} (${media(v, d)} por semana)${v ? ' — clique para ver' : ''}`}
                            className={`w-full h-[28px] rounded-[5px] text-[11px] font-semibold ${forte ? 'text-white' : 'text-ink-2'} ${pico ? 'ring-2 ring-ink' : ''} ${fora && !v ? 'opacity-60' : ''} ${v ? 'hover:ring-2 hover:ring-accent cursor-pointer' : 'cursor-default'}`}
                            style={{ background: tom(v, max) }}
                          >
                            {v || ''}
                          </button>
                        </td>
                      );
                    })}
                    <td className="pl-2 text-ink-2 whitespace-nowrap">{nf(c.porDia[d]!)} <span className="text-muted">· {pct(c.porDia[d]!, c.n)}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
            menos {TONS.map((t) => <span key={t} className="w-4 h-3 rounded-sm inline-block" style={{ background: `color-mix(in oklab, var(--accent) ${t}%, var(--surface))` }} />)} mais
            {c.pico && <span className="text-muted ml-2">· contorno: o horário de pico</span>}
          </div>
        </>
      )}
    </Bloco>
  );
}

export function EntradaSaida({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const f = r.fila;
  const max = Math.max(1, ...f.pontos.flatMap((p) => [p.entrou, p.saiu]));
  const comNumero = f.pontos.length <= 16;
  const saldo = f.saldoRecente;
  const unidade = f.por === 'mes' ? (saldo.pontos === 1 ? 'no último mês' : `nos últimos ${saldo.pontos} meses`) : (saldo.pontos === 1 ? 'na última semana' : `nas últimas ${saldo.pontos} semanas`);
  const algumParcial = f.pontos.some((p) => p.parcial);
  return (
    <Bloco
      id="fila" titulo="Entrada × saída" pergunta="A fila está crescendo ou diminuindo?" icone={ArrowDownUp}
      rodape={<>Por {f.por === 'mes' ? 'mês' : 'semana (de segunda a domingo)'}: quantos chegaram, quantos fecharam e quantos estavam em aberto no fim dela. Se chega mais do que sai por várias {f.por === 'mes' ? 'meses' : 'semanas'} seguidas, a fila cresce.{algumParcial ? ' * = incompleta (o período começa ou termina no meio dela).' : ''}{f.estimados ? ` ${nf(f.estimados)} fechados entram pela data estimada (fechados antes de o Gestor começar a ler o LineChat).` : ''}</>}
    >
      <Numeros>
        <Numero valor={nf(f.filaHoje)} rotulo="na fila hoje (em aberto)" aoClicar={() => abrir('fila:hoje')} />
        <Numero valor={`${nf(f.entrou)} × ${nf(f.saiu)}`} rotulo="chegaram × fecharam no período" />
        <Numero
          valor={`${saldo.n > 0 ? '+' : ''}${nf(saldo.n)}`} tom={saldo.n > 0 ? 'signal' : saldo.n < 0 ? 'ok' : undefined}
          rotulo={saldo.n > 0 ? `${unidade}: chegou mais do que saiu` : saldo.n < 0 ? `${unidade}: saiu mais do que chegou` : `${unidade}: chegou o mesmo que saiu`}
        />
      </Numeros>
      {!f.pontos.length ? <Vazio titulo="Nada no período" /> : (
        <div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[12px] text-ink-2">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--pz-1)' }} /> chegaram</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--pz-3)' }} /> fecharam</span>
            <span className="text-muted">clique numa coluna para ver os chamados</span>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="flex items-end gap-2 min-w-fit" style={{ height: 170 }}>
              {f.pontos.map((p) => (
                <div key={p.id} className="flex-1 min-w-[44px] h-full flex items-end justify-center gap-[3px]">
                  {([['entrou', p.entrou, 'var(--pz-1)', 'chegaram'], ['saiu', p.saiu, 'var(--pz-3)', 'fecharam']] as const).map(([qual, v, cor, nome]) => (
                    <button
                      key={qual} type="button" disabled={!v} onClick={() => abrir(`fila:${p.id}:${qual}`)}
                      title={`${f.por === 'mes' ? p.rotulo : `Semana de ${diaCurto(p.de)} a ${diaCurto(p.ate)}`}: ${nf(v)} ${nome}`}
                      className="w-[18px] sm:w-[24px] h-full flex flex-col justify-end items-center group"
                    >
                      {comNumero && v > 0 && <span className="text-[10.5px] tnum text-ink-2 leading-none mb-1">{v}</span>}
                      <span className="block w-full rounded-t group-hover:brightness-110" style={{ height: v ? Math.max(3, (v / max) * 140) : 0, background: cor }} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-line pt-1 min-w-fit">
              {f.pontos.map((p) => (
                <div key={p.id} className="flex-1 min-w-[44px] text-center leading-tight">
                  <div className="text-[11px] text-muted tnum whitespace-nowrap">{p.rotulo}{p.parcial ? '*' : ''}</div>
                  <div className="text-[10.5px] text-ink-2 tnum whitespace-nowrap" title="em aberto no fim">fila {nf(p.fila)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Bloco>
  );
}

export function SobeDesce({ r, abrir, separado, aoSeparar }: { r: RelatoriosChamados; abrir: (peca: string) => void; separado: boolean; aoSeparar: (v: boolean) => void }) {
  const s = r.sobeDesce;
  const linhas = [...s.subiram, ...s.cairam];
  const max = Math.max(1, ...linhas.map((x) => Math.abs(x.delta)));
  const anterior = `${diaCurto(s.anterior.de)} a ${diaCurto(s.anterior.ate)}`;
  const linha = (x: (typeof linhas)[number]) => {
    const w = (Math.abs(x.delta) / max) * 100;
    const sobe = x.delta > 0;
    return (
      <li key={x.rotulo}>
        <button
          type="button" onClick={() => abrir(`sobe:${x.rotulo}`)}
          title={`${x.rotulo}: ${nf(x.agora)} no período, ${nf(x.antes)} no anterior (${anterior}) — clique para ver os chamados`}
          className="w-full grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[minmax(120px,220px)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2 rounded-lg px-1 -mx-1 py-0.5 hover:bg-surface-2 text-left"
        >
          <span className="truncate text-[13px]">{x.rotulo}</span>
          <span className="flex justify-end items-center gap-1.5 border-r border-line-strong pr-0.5 h-5">
            {!sobe && <><span className="text-[12px] tnum text-ink-2">−{nf(-x.delta)}</span><span className="h-3.5 rounded-l bg-accent" style={{ width: `${w}%` }} /></>}
          </span>
          <span className="flex items-center gap-1.5 h-5">
            {sobe && <><span className="h-3.5 rounded-r bg-signal" style={{ width: `${w}%` }} /><span className="text-[12px] tnum text-ink-2">+{nf(x.delta)}</span></>}
          </span>
        </button>
      </li>
    );
  };
  return (
    <Bloco
      id="sobe" titulo="Sobe e desce dos assuntos" pergunta="O que está aumentando, comparado com o período anterior?" icone={TrendingUp}
      acoes={s.podeJuntar && (
        <label className="flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer" title="Por padrão os assuntos vêm juntos pelos grupos montados em Organizar (Ramal, LineChat…)">
          <Toggle checked={!separado} onChange={(v) => aoSeparar(!v)} /> juntar pelos grupos
        </label>
      )}
      rodape={s.assunto ? <>Chamados abertos com cada {s.assunto.name.toLowerCase()}, no período e no anterior do mesmo tamanho ({anterior}). Os 8 que mais subiram e os 8 que mais caíram.{s.novos ? ` ${nf(s.novos)} ${s.novos === 1 ? 'apareceu' : 'apareceram'} agora sem nenhum chamado antes.` : ''}</> : undefined}
    >
      {!s.assunto ? <Vazio titulo="Falta o campo Assunto" texto="Escolha qual campo do card é o Assunto em Clientes › Ligar clientes › Campos." /> : (
        <>
          <Numeros>
            <Numero valor={`${nf(s.agora)} × ${nf(s.antes)}`} rotulo={`abertos no período × de ${anterior}`} />
            {s.subiram[0] && <Numero valor={s.subiram[0].rotulo} rotulo={`o que mais subiu: de ${nf(s.subiram[0].antes)} para ${nf(s.subiram[0].agora)}`} tom="signal" aoClicar={() => abrir(`sobe:${s.subiram[0]!.rotulo}`)} />}
            {s.cairam[0] && <Numero valor={s.cairam[0].rotulo} rotulo={`o que mais caiu: de ${nf(s.cairam[0].antes)} para ${nf(s.cairam[0].agora)}`} aoClicar={() => abrir(`sobe:${s.cairam[0]!.rotulo}`)} />}
          </Numeros>
          {!linhas.length ? <div className="text-muted text-sm">Nada mudou em relação ao período anterior.</div> : (
            <div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[12px] text-ink-2">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-signal" /> subiu</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent" /> caiu</span>
                <span className="text-muted">clique num assunto para ver os chamados</span>
              </div>
              <ul className="flex flex-col gap-1">{s.subiram.map(linha)}{s.subiram.length > 0 && s.cairam.length > 0 && <li aria-hidden className="h-1.5" />}{s.cairam.map(linha)}</ul>
            </div>
          )}
        </>
      )}
    </Bloco>
  );
}

// ---------- Idade da fila ----------

/** As faixas a partir de 7 dias ficam em laranja: é o que está envelhecendo na fila. */
const VELHA = 3;

export function IdadeDaFila({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const x = r.idade;
  const cor = (i: number) => (i >= VELHA ? 'var(--signal)' : 'var(--accent)');
  return (
    <Bloco
      id="idade" titulo="Idade da fila" pergunta="Há quanto tempo estão abertos os chamados que ainda não fecharam?" icone={Hourglass}
      rodape={<>Os em aberto agora, de qualquer data: o período não muda este relatório (os filtros, sim). A idade conta desde a abertura do card; a partir de 7 dias, em laranja.</>}
    >
      {!x.n ? <Vazio titulo="Nada em aberto" texto="Com esses filtros, todos os chamados já chegaram numa etapa que fecha." /> : (
        <>
          <Numeros>
            <Numero valor={nf(x.n)} rotulo="em aberto agora" aoClicar={() => abrir('idade:todas')} />
            <Numero valor={nf(x.maisDe7)} rotulo={`abertos há 7 dias ou mais (${pct(x.maisDe7, x.n)}%)`} tom={x.maisDe7 ? 'signal' : undefined} />
            <Numero valor={x.mediana == null ? '—' : horasLegiveis(x.mediana * 24)} rotulo="idade mediana" />
            {x.maisAntigo && (
              <div className="min-w-[120px]">
                <span className="block font-display text-[22px] sm:text-2xl font-semibold tnum leading-tight">{horasLegiveis(x.maisAntigo.dias * 24)}</span>
                <span className="block text-[12.5px] text-muted leading-snug">o mais antigo: <CodigoDoCard c={x.maisAntigo} /></span>
              </div>
            )}
          </Numeros>
          <div>
            <div className="eyebrow mb-2">Em aberto, por idade · clique numa faixa para ver os chamados</div>
            <ColunasCor pontos={x.faixas.map((f, i) => ({ id: f.id, rotulo: f.rotulo, n: f.n, cor: cor(i) }))} aoClicar={(id) => abrir(`idade:${id}`)} />
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Etapa</th>{x.faixas.map((f, i) => <th key={f.id} className={`!text-right whitespace-nowrap ${i >= VELHA ? 'text-signal' : ''}`}>{f.rotulo}</th>)}<th className="!text-right">Total</th></tr></thead>
              <tbody>
                {x.porEtapa.map((e) => (
                  <tr key={e.id}>
                    <td className="text-[13px] whitespace-nowrap">{e.titulo}</td>
                    {e.faixas.map((v, i) => (
                      <td key={i} className={`text-right text-[13px] tnum ${v && i >= VELHA ? 'bg-signal-soft' : ''}`}>
                        {v ? <button type="button" className={`hover:underline ${i >= VELHA ? 'text-signal font-semibold' : ''}`} onClick={() => abrir(`idade:${x.faixas[i]!.id}:${e.id}`)}>{nf(v)}</button> : <span className="text-muted">·</span>}
                      </td>
                    ))}
                    <td className="text-right text-[13px] tnum font-semibold">{nf(e.n)}</td>
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

// ---------- Dias fora da curva ----------

const DIAS_NOME = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const diaDaSemanaDe = (dia: string) => (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7;

export function DiasForaDaCurva({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const x = r.foraDaCurva;
  const maior = [...x.picos].sort((a, b) => b.n - a.n)[0];
  return (
    <Bloco
      id="picos" titulo="Dias fora da curva" pergunta="Quais dias tiveram muito mais chamado que o normal, e por quê?" icone={Activity}
      rodape={<>Normal é a mediana do mesmo dia da semana nas 8 semanas anteriores (segunda com segunda). Fora da curva: pelo menos 5 chamados, o dobro do normal e 5 a mais que ele. Uma queda de operadora ou uma atualização que deu problema aparece aqui sozinha.</>}
    >
      <Numeros>
        <Numero valor={nf(x.picos.length)} rotulo={x.picos.length === 1 ? 'dia fora da curva no período' : 'dias fora da curva no período'} tom={x.picos.length ? 'signal' : undefined} />
        {maior && <Numero valor={`${DIAS_NOME[diaDaSemanaDe(maior.dia)]}, ${diaCurto(maior.dia)}`} rotulo={`o maior: ${nf(maior.n)} chamados (normal: ${nf(maior.normal)})`} aoClicar={() => abrir(`picos:${maior.dia}`)} />}
      </Numeros>
      {x.pontos.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[12px] text-ink-2">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-signal" /> fora da curva</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-line-strong" /> dia comum</span>
            <span className="text-muted">clique num dia para ver os chamados</span>
          </div>
          <ColunasCor
            numero="fortes" altura={110} aoClicar={(id) => abrir(`picos:${id}`)}
            pontos={x.pontos.map((p) => ({ id: p.id, rotulo: p.rotulo, n: p.n, forte: p.pico, cor: p.pico ? 'var(--signal)' : 'var(--line-strong)', titulo: `${DIAS_NOME[diaDaSemanaDe(p.id)]}, ${p.rotulo}: ${p.n} chamados (normal: ${p.normal})` }))}
          />
        </div>
      )}
      {!x.picos.length ? <div className="text-muted text-sm">Nenhum dia fora da curva no período.</div> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Dia</th><th className="!text-right">Chamados</th><th className="!text-right">Normal</th><th>O que dominou</th><th>Cliente que mais abriu</th></tr></thead>
            <tbody>
              {x.picos.map((d) => (
                <tr key={d.dia} className="cursor-pointer hover:bg-surface-2" onClick={() => abrir(`picos:${d.dia}`)} title="Clique para ver os chamados do dia">
                  <td className="text-[13px] font-semibold whitespace-nowrap">{DIAS_NOME[diaDaSemanaDe(d.dia)]}, {diaCurto(d.dia)}</td>
                  <td className="text-right text-[13px] tnum font-semibold text-signal">{nf(d.n)}</td>
                  <td className="text-right text-[13px] tnum text-muted">{nf(d.normal)}</td>
                  <td className="text-[13px]">{d.assunto ? <>{d.assunto.rotulo} <span className="text-muted tnum">({nf(d.assunto.n)})</span></> : <span className="text-muted">—</span>}</td>
                  <td className="text-[13px]">{d.cliente ? <>{d.cliente.rotulo} <span className="text-muted tnum">({nf(d.cliente.n)})</span></> : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bloco>
  );
}

// ---------- Os poucos que pesam muito (80/20) ----------

const NOMES_PARETO: Record<ParetoPor, { campo: string; plural: string }> = {
  assunto: { campo: 'Assunto', plural: 'assuntos' },
  cliente: { campo: 'Cliente', plural: 'clientes' },
  produto: { campo: 'Produto', plural: 'produtos' },
  tipo: { campo: 'Tipo de chamado', plural: 'tipos' },
};

export function Pareto({ r, abrir, aoPor }: { r: RelatoriosChamados; abrir: (peca: string) => void; aoPor: (v: ParetoPor | undefined) => void }) {
  const x = r.pareto;
  const [todos, setTodos] = useState(false);
  const nomes = NOMES_PARETO[x.por];
  const LIMITE = 12;
  const mostrados = todos ? x.itens : x.itens.slice(0, Math.max(LIMITE, x.para80));
  const max = Math.max(1, ...x.itens.map((i) => i.n));
  return (
    <Bloco
      id="pareto" titulo="Os poucos que pesam muito" pergunta={`Quais poucos ${nomes.plural} fazem a maior parte dos chamados?`} icone={ChartColumnDecreasing}
      acoes={(
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <span className="font-semibold">Por</span>
          <select className="input w-auto py-1.5" value={x.por} onChange={(e) => aoPor(e.target.value === 'assunto' ? undefined : (e.target.value as ParetoPor))}>
            {PARETO_POR.map((p) => <option key={p} value={p} disabled={!r.campos[p]}>{NOMES_PARETO[p].campo}</option>)}
          </select>
        </label>
      )}
      rodape={x.campo ? <>Chamados abertos no período, contados pelo campo {x.campo.name}, do maior para o menor. A coluna "somando" é quanto aquele e os de cima fazem juntos.{x.juntado ? ' Os assuntos vêm juntos pelos grupos montados em Organizar (Ramal, LineChat…).' : ''} Num campo de várias escolhas, o chamado conta em cada valor marcado.</> : undefined}
    >
      {!x.campo ? <Vazio titulo={`Falta o campo ${nomes.campo}`} texto="Escolha qual campo do card é esse em Clientes › Ligar clientes › Campos." /> : !x.itens.length ? <Vazio titulo="Nenhum chamado aberto no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <>
          <Numeros>
            <Numero valor={`${nf(x.para80)} de ${nf(x.itens.length)}`} rotulo={`${nomes.plural} fazem 80% dos chamados`} tom="signal" />
            <Numero valor={x.itens[0]!.rotulo} rotulo={`o maior: ${nf(x.itens[0]!.n)} chamados (${pct(x.itens[0]!.n, x.total)}%)`} aoClicar={() => abrir(`pareto:${x.itens[0]!.rotulo}`)} />
          </Numeros>
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(70px,45%)_44px_62px] sm:grid-cols-[minmax(140px,280px)_minmax(0,1fr)_52px_74px] gap-x-2 text-[11.5px] text-muted mb-1 px-1">
              <span>{x.campo.name}</span><span /><span className="text-right">chamados</span><span className="text-right">somando</span>
            </div>
            <ul className="flex flex-col gap-0.5">
              {mostrados.map((i, k) => (
                <li key={i.rotulo}>
                  {k === x.para80 && <div className="flex items-center gap-2 text-[11.5px] text-muted my-1.5" role="separator"><span className="flex-1 border-t border-dashed border-line-strong" />acima daqui: 80% dos chamados<span className="flex-1 border-t border-dashed border-line-strong" /></div>}
                  <button
                    type="button" onClick={() => abrir(`pareto:${i.rotulo}`)} title={`${i.rotulo}: ${nf(i.n)} chamados — clique para ver`}
                    className="w-full grid grid-cols-[minmax(0,1fr)_minmax(70px,45%)_44px_62px] sm:grid-cols-[minmax(140px,280px)_minmax(0,1fr)_52px_74px] items-center gap-x-2 rounded-lg px-1 py-0.5 hover:bg-surface-2 text-left text-[13px]"
                  >
                    <span className="truncate">{i.rotulo}</span>
                    <span className="h-2.5 rounded-full bg-surface-2 overflow-hidden"><span className={`block h-full rounded-full ${k < x.para80 ? 'bg-accent' : 'bg-line-strong'}`} style={{ width: `${Math.max(2, (i.n / max) * 100)}%` }} /></span>
                    <span className="tnum text-right">{nf(i.n)}</span>
                    <span className="tnum text-right text-ink-2">{i.acumulado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span>
                  </button>
                </li>
              ))}
            </ul>
            {x.itens.length > mostrados.length || todos ? (
              <button type="button" className="so-tela btn-ghost btn-sm mt-1" onClick={() => setTodos((v) => !v)}>{todos ? 'Mostrar menos' : `Ver todos (${nf(x.itens.length)})`}</button>
            ) : null}
          </div>
        </>
      )}
    </Bloco>
  );
}

// ---------- Previsão da semana ----------

export function Previsao({ r }: { r: RelatoriosChamados }) {
  const x = r.previsao;
  const max = Math.max(1, ...x.dias.map((d) => d.max));
  const ALTURA = 120;
  const y = (v: number) => (v / max) * (ALTURA - 8);
  const { ateHoje, esperadoAteHoje } = x.semanaAtual;
  const acima = esperadoAteHoje > 0 && ateHoje > esperadoAteHoje * 1.2;
  const abaixo = esperadoAteHoje > 0 && ateHoje < esperadoAteHoje * 0.8;
  return (
    <Bloco
      id="previsao" titulo="Previsão da semana" pergunta="Quantos chamados devem chegar na próxima semana?" icone={Telescope}
      rodape={<>A previsão de cada dia é a média do mesmo dia da semana nas últimas {nf(x.semanas)} semanas completas; o traço vai da semana mais fraca à mais cheia. Não depende do período escolhido (os outros filtros valem). É uma estimativa: feriado e incidente fogem da conta.</>}
    >
      {!x.semanas ? <Vazio titulo="Ainda não há uma semana completa para prever" texto="A previsão usa as semanas completas antes desta." /> : (
        <>
          <Numeros>
            <Numero valor={`cerca de ${nf(x.total)}`} rotulo={`chamados de ${diaCurto(x.semana.de)} a ${diaCurto(x.semana.ate)}`} />
            <Numero valor={`${nf(x.faixa.min)} a ${nf(x.faixa.max)}`} rotulo={`o normal de uma semana (a mais fraca e a mais cheia das últimas ${nf(x.semanas)})`} />
            <Numero
              valor={nf(ateHoje)} rotulo={`chegaram nesta semana até hoje (desde ${diaCurto(x.semanaAtual.de)})`}
              tom={acima ? 'signal' : undefined}
              sub={<span className={acima ? 'text-signal font-semibold' : 'text-muted'}>{acima ? 'acima' : abaixo ? 'abaixo' : 'perto'} do esperado até hoje (~{nf(esperadoAteHoje)})</span>}
            />
          </Numeros>
          <div>
            <div className="eyebrow mb-2">A próxima semana, dia a dia · a barra é a média; o traço e os números de baixo, o menor e o maior</div>
            <div className="flex items-end gap-2 sm:gap-4" style={{ height: ALTURA }}>
              {x.dias.map((d) => (
                <div key={d.dia} className="flex-1 min-w-0 h-full relative" title={`${d.rotulo}: cerca de ${d.media.toLocaleString('pt-BR')} (entre ${d.min} e ${d.max} nas últimas semanas)`}>
                  <span className="absolute inset-x-[18%] bottom-0 rounded-t bg-accent" style={{ height: d.media ? Math.max(3, y(d.media)) : 0 }} />
                  {d.max > 0 && <span className="absolute left-1/2 -translate-x-1/2 w-[2px] bg-ink-2 opacity-60" style={{ bottom: y(d.min), height: Math.max(1, y(d.max) - y(d.min)) }} />}
                  {d.max > 0 && <span className="absolute left-1/2 -translate-x-1/2 h-[2px] w-3 bg-ink-2 opacity-60" style={{ bottom: y(d.max) }} />}
                </div>
              ))}
            </div>
            <div className="flex gap-2 sm:gap-4 border-t border-line mt-0.5 pt-1">
              {x.dias.map((d) => (
                <span key={d.dia} className={`flex-1 min-w-0 text-center text-[11px] leading-tight ${d.dow >= 5 ? 'text-muted' : 'text-ink-2'}`}>
                  {d.rotulo}
                  <b className="block text-[13px] text-ink tnum mt-0.5">{d.media ? '~' : ''}{d.media.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</b>
                  <span className="block text-muted tnum">{d.min === d.max ? `sempre ${d.min}` : `${d.min} a ${d.max}`}</span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </Bloco>
  );
}
