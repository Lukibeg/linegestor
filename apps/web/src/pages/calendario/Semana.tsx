/**
 * A SEMANA do calendário (2.4.1, o Luan: "no calendário eu quero q tenha a opção de visualização somente da semana tbm, como no
 * outlook"). Como no Outlook: os sete dias lado a lado, de segunda a domingo; em cima, a faixa do dia inteiro (a folga, o home
 * office, a virada que entra na madrugada); embaixo, as horas, com cada evento na altura da hora dele (os que se encontram
 * ficam lado a lado) e a linha da hora de agora no dia de hoje. Dois cliques numa hora vazia abrem um evento novo naquela hora.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  arrumarNoDia, cobreODia, diaCurto, diaPorExtenso, minutosAgoraEmBrasilia, naFaixaDoDiaInteiro, ordemDoDia, textoDoHorario, textoDoPeriodo,
  tipoDoEvento, type CalendarioOpcoes, type EventoDoCalendario, type EventoNaHora,
} from '@gestor/shared';
import { BORDA_DO_TIPO, FUNDO_DO_TIPO } from './comum.js';

/** A altura de uma hora na grade (a meia hora é a metade). */
const ALTURA_DA_HORA = 48;
/** O expediente fica mais claro, como no Outlook. */
const EXPEDIENTE = { de: 8 * 60, ate: 18 * 60 };
const NOMES = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
const COLUNAS = 'grid grid-cols-[52px_repeat(7,minmax(112px,1fr))]';
const px = (minutos: number) => (minutos / 60) * ALTURA_DA_HORA;
const hora = (minutos: number) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

/** A cor já diz o tipo: "Visita — Clínica Aurora" aparece como "Clínica Aurora" (o título inteiro fica na dica). */
function semOTipo(titulo: string, tipo: string) {
  const prefixo = `${tipo} — `;
  return titulo.startsWith(prefixo) && titulo.length > prefixo.length ? titulo.slice(prefixo.length) : titulo;
}
const dicaDoEvento = (e: EventoDoCalendario, tipo: string) =>
  `${e.titulo} — ${tipo} · ${e.inicio === e.fim ? '' : `${textoDoPeriodo(e)} · `}${textoDoHorario(e)}${e.clienteNome ? ` · ${e.clienteNome}` : ''}${e.local ? ` · ${e.local}` : ''}`;

/** A hora de agora (Brasília), a cada minuto. */
function useAgora() {
  const [agora, setAgora] = useState(() => minutosAgoraEmBrasilia());
  useEffect(() => { const t = setInterval(() => setAgora(minutosAgoraEmBrasilia()), 60_000); return () => clearInterval(t); }, []);
  return agora;
}

export function GradeDaSemana({ dias, eventos, op, hoje, carregando, onAbrir, onNovo }: {
  dias: string[]; eventos: EventoDoCalendario[]; op: CalendarioOpcoes; hoje: string; carregando: boolean;
  onAbrir: (e: EventoDoCalendario) => void;
  onNovo: (dia: string, horario?: { horaInicio: string; horaFim: string }) => void;
}) {
  const rolagem = useRef<HTMLDivElement>(null);
  const agora = useAgora();
  const temHoje = dias.includes(hoje);
  const faixa = useMemo(() => new Map(dias.map((d) => [d, eventos.filter((e) => cobreODia(e, d) && naFaixaDoDiaInteiro(e)).sort(ordemDoDia)])), [dias, eventos]);
  const naHora = useMemo(() => new Map(dias.map((d) => [d, arrumarNoDia(eventos, d)])), [dias, eventos]);

  // ao abrir (e ao trocar de semana): a hora de agora, na semana de hoje; senão o primeiro evento da semana, ou as 7h
  const primeiro = Math.min(7 * 60, ...[...naHora.values()].flat().map((x) => x.inicio));
  useLayoutEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    el.scrollTop = px(Math.max(0, (temHoje ? Math.min(agora - 120, primeiro) : primeiro) - 30));
  }, [dias[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const novoNaHora = (dia: string, y: number) => {
    if (!op.podeEditar) return;
    const inicio = Math.min(Math.floor(y / (ALTURA_DA_HORA / 2)) * 30, 23 * 60);
    onNovo(dia, { horaInicio: hora(inicio), horaFim: hora(Math.min(inicio + 60, 23 * 60 + 59)) });
  };

  return (
    <div className={`card overflow-hidden min-w-0 ${carregando ? 'opacity-70' : ''}`} id="calendario-semana">
      {/* uma rolagem só, nos dois sentidos: os dias e a faixa do dia inteiro ficam no alto, e as horas, à esquerda (no celular, a
          semana corre para o lado sem perder as horas) */}
      <div ref={rolagem} className="overflow-auto max-h-[max(460px,calc(100vh-230px))]" id="calendario-semana-rolagem">
        <div className="min-w-[836px]">
          <div className="sticky top-0 z-[4] bg-surface">
          {/* os dias */}
          <div className={`${COLUNAS} border-b border-line bg-surface`}>
            <div className="sticky left-0 z-[5] bg-surface" aria-hidden />
            {dias.map((dia, i) => {
              const ehHoje = dia === hoje;
              return (
                <div key={dia} data-dia={dia} className={`group relative min-w-0 border-l border-line px-2 pt-1.5 pb-1 ${ehHoje ? 'shadow-[inset_0_3px_0_var(--accent)]' : ''} ${i >= 5 ? 'bg-surface-2' : ''}`}>
                  <div className={`font-display text-[19px] leading-tight tnum ${ehHoje ? 'text-accent font-semibold' : 'text-ink-2'}`} aria-current={ehHoje ? 'date' : undefined}>{dia.slice(8, 10)}</div>
                  <div className={`text-[12px] truncate ${ehHoje ? 'text-accent' : 'text-muted'}`}>{NOMES[i]}</div>
                  {op.podeEditar && (
                    <button type="button" onClick={() => onNovo(dia)} aria-label={`Novo evento em ${diaCurto(dia)}`} title={`Novo evento em ${diaPorExtenso(dia)}`}
                      className={`absolute right-1.5 top-2 btn-ghost p-1 rounded-full ${ehHoje ? 'text-accent opacity-100' : 'text-muted opacity-0 group-hover:opacity-100 focus:opacity-100'}`}>
                      <Plus size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {/* a faixa do dia inteiro */}
          <div className={`${COLUNAS} border-b border-line-strong bg-surface`} id="calendario-semana-dia-inteiro">
            <div className="sticky left-0 z-[5] bg-surface text-[10.5px] text-muted text-right pr-1.5 pt-1 leading-tight">dia<br />inteiro</div>
            {dias.map((dia, i) => (
              <div key={dia} className={`min-w-0 border-l border-line p-0.5 flex flex-col gap-[3px] min-h-[28px] ${i >= 5 ? 'bg-surface-2' : ''}`}
                onDoubleClick={() => { if (op.podeEditar) onNovo(dia); }}>
                {(faixa.get(dia) ?? []).map((e) => <BarraDoDiaInteiro key={e.id} e={e} dia={dia} op={op} onAbrir={onAbrir} />)}
              </div>
            ))}
          </div>
          </div>
          {/* as horas */}
          <div id="calendario-semana-horas">
            <div className={`${COLUNAS} relative`} style={{ height: px(24 * 60) }}>
              <div className="sticky left-0 z-[3] bg-surface" aria-hidden>
                {Array.from({ length: 24 }, (_, h) => h > 0 && (
                  <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[10.5px] tnum text-muted bg-surface px-0.5" style={{ top: h * ALTURA_DA_HORA }}>{hora(h * 60)}</div>
                ))}
              </div>
              {dias.map((dia, i) => (
                <div key={dia} data-dia={dia} className="relative min-w-0 border-l border-line bg-surface-2"
                  onDoubleClick={(ev) => { if ((ev.target as HTMLElement).closest('[data-evento]')) return; novoNaHora(dia, ev.clientY - ev.currentTarget.getBoundingClientRect().top); }}
                  title={op.podeEditar ? 'Dois cliques numa hora vazia: um evento novo nessa hora' : undefined}>
                  {/* o expediente, mais claro (no fim de semana, não) */}
                  {i < 5 && <div className="absolute inset-x-0 bg-surface pointer-events-none" style={{ top: px(EXPEDIENTE.de), height: px(EXPEDIENTE.ate - EXPEDIENTE.de) }} aria-hidden />}
                  {(naHora.get(dia) ?? []).map((x) => <BlocoDaHora key={x.evento.id} x={x} op={op} onAbrir={onAbrir} />)}
                  {dia === hoje && (
                    <div className="absolute inset-x-0 z-[2] pointer-events-none" style={{ top: px(agora) }} id="calendario-semana-agora" aria-hidden>
                      <div className="border-t-2 border-accent" />
                      <div className="absolute -left-[5px] -top-[5px] w-2.5 h-2.5 rounded-full bg-accent" />
                    </div>
                  )}
                </div>
              ))}
              {/* as linhas (por cima do fundo dos dias, por baixo dos eventos): a hora cheia contínua, a meia hora tracejada */}
              <div className="absolute inset-0 left-[52px] z-0 pointer-events-none" aria-hidden>
                {Array.from({ length: 48 }, (_, i) => i > 0 && (
                  <div key={i} className={`absolute inset-x-0 border-t ${i % 2 ? 'border-dashed border-line' : 'border-line'}`} style={{ top: (i * ALTURA_DA_HORA) / 2 }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** O evento na faixa do dia inteiro (o de vários dias continua de um dia para o outro). */
function BarraDoDiaInteiro({ e, dia, op, onAbrir }: { e: EventoDoCalendario; dia: string; op: CalendarioOpcoes; onAbrir: (e: EventoDoCalendario) => void }) {
  const tipo = tipoDoEvento(op.tipos, e.tipoId);
  const veio = e.inicio < dia;
  const segue = e.fim > dia;
  const comHora = !e.diaInteiro && e.horaInicio;
  return (
    <button type="button" onClick={() => onAbrir(e)} title={dicaDoEvento(e, tipo.nome)} data-evento={e.id}
      className={`w-full min-w-0 text-left truncate px-1.5 py-px text-[12px] leading-[18px] font-medium ${FUNDO_DO_TIPO[tipo.cor]} ${veio ? 'rounded-l-none' : `rounded-l border-l-[3px] ${BORDA_DO_TIPO[tipo.cor]}`} ${segue ? 'rounded-r-none' : 'rounded-r'} ${e.situacao === 'cancelado' ? 'line-through opacity-60' : ''} hover:brightness-95`}>
      {e.situacao === 'feito' && <span aria-label="feito">✓ </span>}
      {comHora && dia === e.inicio && <><span className="tnum font-semibold">{e.horaInicio}</span>{' '}</>}
      {comHora && dia === e.fim && dia !== e.inicio && e.horaFim && <><span className="tnum font-semibold">até {e.horaFim}</span>{' '}</>}
      {semOTipo(e.titulo, tipo.nome)}
    </button>
  );
}

/** O evento com hora, na altura dele: a hora, o título e, se couber, o cliente e o local. */
function BlocoDaHora({ x, op, onAbrir }: { x: EventoNaHora; op: CalendarioOpcoes; onAbrir: (e: EventoDoCalendario) => void }) {
  const e = x.evento;
  const tipo = tipoDoEvento(op.tipos, e.tipoId);
  const altura = Math.max(px(x.fim - x.inicio) - 2, 20);
  const curto = altura < 40;
  return (
    <button type="button" onClick={() => onAbrir(e)} title={dicaDoEvento(e, tipo.nome)} data-evento={e.id}
      className={`absolute z-[1] overflow-hidden text-left rounded border-l-[3px] px-1.5 text-[12px] leading-[16px] ${curto ? 'py-px' : 'py-0.5'} ${FUNDO_DO_TIPO[tipo.cor]} ${BORDA_DO_TIPO[tipo.cor]} ${e.situacao === 'cancelado' ? 'line-through opacity-60' : ''} hover:brightness-95 shadow-[0_0_0_1px_var(--surface)]`}
      style={{ top: px(x.inicio) + 1, height: altura, left: `calc(${(x.coluna / x.colunas) * 100}% + 2px)`, width: `calc(${100 / x.colunas}% - 4px)` }}>
      <span className={curto ? 'block truncate' : 'line-clamp-2 break-words font-semibold'}>
        {e.situacao === 'feito' && <span aria-label="feito">✓ </span>}
        {curto && <span className="tnum font-semibold">{e.horaInicio} </span>}
        {semOTipo(e.titulo, tipo.nome)}
      </span>
      {!curto && <span className="block tnum opacity-90 truncate">{textoDoHorario(e)}</span>}
      {altura >= 72 && (e.clienteNome || e.local) && <span className="block truncate opacity-90">{e.clienteNome ?? e.local}</span>}
    </button>
  );
}
