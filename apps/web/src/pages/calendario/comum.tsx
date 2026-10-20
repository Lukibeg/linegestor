/**
 * As peças do calendário (Patch 2.0.1, decisão 0049) que as outras telas também usam: as consultas, as
 * cores dos tipos, a linha de um evento e o "Hoje, fora do escritório". O Meu dia (o "Hoje na agenda") e
 * a ficha do chamado (o "Na agenda", com o Agendar) montam com elas. Desde o 2.0.2, o editor dos
 * lembretes (a janela do evento e os tipos).
 */
import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Bell, Check, Plus, TreePalm, X } from 'lucide-react';
import {
  MAX_ANTES_DO_LEMBRETE, MAX_LEMBRETES, MINUTOS_DA_UNIDADE, NOME_SITUACAO_DO_EVENTO, quemEstaFora, textoDoAntes, textoDoHorario, textoDoPeriodo, tipoDoEvento,
  UNIDADES_DO_LEMBRETE,
  type CalendarioOpcoes, type CorEtiqueta, type CorPainel, type EventoDoCalendario, type SituacaoDoEvento, type TipoDeEvento, type UnidadeDoLembrete,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { ApiError } from '../../api/types.js';
import { mensagemErro } from '../../components/ui/index.js';
import { AMOSTRA_DA_COR } from '../atendimento/comum.js';
import { PontoDoPainel } from '../atendimento/quadro/filtros.js';

export const CHAVE_DO_CALENDARIO = ['calendario'] as const;

/** O endereço do evento na tela (2.0.2: o lembrete do sininho abre o calendário no dia, com o evento na janela). */
export const enderecoDoEvento = (e: { id: string; inicio: string }) =>
  `/calendario?mes=${e.inicio.slice(0, 7)}&dia=${e.inicio}&evento=${encodeURIComponent(e.id)}`;

/** Os tipos, os painéis que a pessoa vê (com quem vê cada um), as pessoas e o que ela pode fazer. */
export function useOpcoesDoCalendario(ligado = true) {
  return useQuery<CalendarioOpcoes>({ queryKey: [...CHAVE_DO_CALENDARIO, 'opcoes'], queryFn: () => api.calendario.opcoes(), staleTime: 60_000, enabled: ligado });
}

/** Os eventos que tocam o período (o mês da tela, com as pontas da grade; ou só hoje). */
export function useEventosDoPeriodo(de: string, ate: string, ligado = true) {
  return useQuery<EventoDoCalendario[]>({
    queryKey: [...CHAVE_DO_CALENDARIO, 'eventos', de, ate], queryFn: () => api.calendario.eventos(de, ate),
    staleTime: 30_000, enabled: ligado, placeholderData: keepPreviousData,
  });
}

/** Depois de mexer num evento: o mês, o Meu dia e a ficha do chamado releem. */
export function useRecarregarCalendario() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: CHAVE_DO_CALENDARIO }), [qc]);
}

/** O nome de cada pessoa (as ativas; quem saiu da equipe continua no evento, sem o nome). */
export function useNomesDasPessoas(opcoes: CalendarioOpcoes | undefined) {
  return useMemo(() => new Map((opcoes?.pessoas ?? []).map((p) => [p.id, p.nome])), [opcoes]);
}
export const nomesDe = (ids: readonly string[], nomes: ReadonlyMap<string, string>) => ids.map((id) => nomes.get(id) ?? 'alguém que saiu da equipe');

/** O erro do evento em palavras: a lista do "Dados inválidos" vira as frases dela. */
export function erroDoEvento(e: unknown): string {
  if (e instanceof ApiError && Array.isArray(e.details) && e.details.length) {
    return [...new Set((e.details as Array<{ message?: string }>).map((d) => d?.message).filter((m): m is string => !!m))].join(' ') || e.message;
  }
  return mensagemErro(e);
}

// ---------- as cores dos tipos ----------

/** O fundo e a letra do evento na grade (os mesmos tons das etiquetas). */
export const FUNDO_DO_TIPO: Record<CorEtiqueta, string> = {
  neutral: 'bg-surface-2 text-ink-2', accent: 'bg-accent-soft text-accent-ink', roxo: 'bg-roxo-soft text-roxo-ink', turquesa: 'bg-turquesa-soft text-turquesa-ink',
  ok: 'bg-ok-soft text-ok', amarelo: 'bg-amarelo-soft text-amarelo-ink', signal: 'bg-signal-soft text-signal', bad: 'bg-bad-soft text-bad', rosa: 'bg-rosa-soft text-rosa-ink',
};
/** A tira da cor do tipo, do lado do evento. */
export const BORDA_DO_TIPO: Record<CorEtiqueta, string> = {
  neutral: 'border-line-strong', accent: 'border-accent', roxo: 'border-roxo', turquesa: 'border-turquesa',
  ok: 'border-ok', amarelo: 'border-amarelo', signal: 'border-signal', bad: 'border-bad', rosa: 'border-rosa',
};

/** O tipo, como etiqueta (a bolinha da cor e o nome). */
export function ChipDoTipo({ tipo, className = '' }: { tipo: TipoDeEvento; className?: string }) {
  return (
    <span className={`chip rounded-full pl-1.5 ${FUNDO_DO_TIPO[tipo.cor]} ${className}`} data-tipo={tipo.id}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${AMOSTRA_DA_COR[tipo.cor]}`} aria-hidden />{tipo.nome}
    </span>
  );
}

/** O Feito (verde) e o Cancelado (cinza); o Agendado não precisa de marca. */
export function MarcaDaSituacao({ s }: { s: SituacaoDoEvento }) {
  if (s === 'agendado') return null;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${s === 'feito' ? 'text-ok' : 'text-muted'}`}>
      {s === 'feito' ? <Check size={12} aria-hidden /> : <Ban size={11} aria-hidden />}{NOME_SITUACAO_DO_EVENTO[s]}
    </span>
  );
}

// ---------- a linha do evento (o dia, a lista, o Meu dia, a ficha do chamado) ----------

/**
 * Um evento numa linha que abre a janela dele: a hora (ou "Dia inteiro"), o tipo, o título, o cliente e
 * as pessoas, e os painéis (as bolinhas). `comPeriodo`: mostra os dias (na lista do mês e na ficha).
 */
export function LinhaDoEvento({ e, opcoes, nomes, onAbrir, comPeriodo = false, comVoce }: {
  e: EventoDoCalendario; opcoes: CalendarioOpcoes; nomes: ReadonlyMap<string, string>; onAbrir: () => void; comPeriodo?: boolean; comVoce?: string | null;
}) {
  const tipo = tipoDoEvento(opcoes.tipos, e.tipoId);
  const cancelado = e.situacao === 'cancelado';
  const todas = nomesDe(e.pessoas, nomes);
  // "Folga — Diego Farias": o nome já está no título
  const pessoas = todas.every((n) => e.titulo.includes(n)) ? [] : todas;
  const paineis = e.paineis.map((id) => opcoes.paineis.find((p) => p.id === id)).filter((p): p is CalendarioOpcoes['paineis'][number] => !!p);
  const comigo = !!comVoce && e.pessoas.includes(comVoce);
  const quando = comPeriodo ? `${textoDoPeriodo(e)} · ${textoDoHorario(e)}` : textoDoHorario(e);
  return (
    <button type="button" onClick={onAbrir} data-evento={e.id}
      className="w-full text-left flex gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-w-0">
      <span className={`w-1 self-stretch rounded-full shrink-0 ${AMOSTRA_DA_COR[tipo.cor]} ${cancelado ? 'opacity-40' : ''}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[12px] text-muted leading-5">
          <span className="tnum font-semibold text-ink-2">{quando}</span>
          <span>{tipo.nome}</span>
          <MarcaDaSituacao s={e.situacao} />
          {comigo && <span className="chip bg-accent-soft text-accent-ink px-1.5 py-0 leading-4 text-[11px]">com você</span>}
        </span>
        <span className={`block font-medium text-[13.5px] leading-snug break-words ${cancelado ? 'line-through text-muted' : 'text-ink'}`}>{e.titulo}</span>
        {(e.clienteNome || pessoas.length > 0) && (
          <span className="block text-[12.5px] text-muted leading-snug break-words">{[e.clienteNome, pessoas.join(', ')].filter(Boolean).join(' · ')}</span>
        )}
      </span>
      {paineis.length > 0 && (
        <span className="flex flex-col items-end gap-1 shrink-0 pt-1" title={paineis.map((p) => p.nome).join(', ')}>
          {paineis.map((p) => <span key={p.id} className="inline-flex items-center gap-1 text-[11px] text-muted font-mono"><PontoDoPainel cor={p.cor as CorPainel} />{p.sigla}</span>)}
        </span>
      )}
    </button>
  );
}

// ---------- os lembretes (2.0.2) ----------

/**
 * Os lembretes de um evento (ou os que o tipo traz): cada um é "quanto tempo antes" de o evento começar —
 * o número e a unidade —; o × tira, o Incluir põe outro (até 5, até 4 semanas antes). O pedido do Luan:
 * "lembretes e avisos configuráveis, para eu alertar quando for acontecer algo e em quanto tempo antes".
 */
export function EditorDeLembretes({ valor, onChange, id, rotulo }: { valor: number[]; onChange: (v: number[]) => void; id: string; rotulo: string }) {
  const [quanto, setQuanto] = useState('1');
  const [unidade, setUnidade] = useState<UnidadeDoLembrete>('horas');
  const [erro, setErro] = useState('');
  const incluir = () => {
    const n = Number(quanto.trim());
    if (quanto.trim() === '' || !Number.isInteger(n) || n < 0) { setErro('Escreva quanto tempo antes, num número inteiro (0 é na hora).'); return; }
    const minutos = n * MINUTOS_DA_UNIDADE[unidade];
    if (minutos > MAX_ANTES_DO_LEMBRETE) { setErro('O lembrete vai até 4 semanas antes.'); return; }
    if (valor.includes(minutos)) { setErro(`O lembrete de ${textoDoAntes(minutos).toLowerCase()} já está na lista.`); return; }
    if (valor.length >= MAX_LEMBRETES) { setErro(`Até ${MAX_LEMBRETES} lembretes.`); return; }
    onChange([...valor, minutos].sort((a, b) => b - a));
    setErro('');
  };
  return (
    <div className="flex flex-col gap-2" id={id}>
      <ul className="flex flex-wrap items-center gap-1.5" aria-label={rotulo}>
        {valor.length ? valor.map((m) => (
          <li key={m} className="chip border border-line bg-surface text-ink-2 py-0.5 pl-2 pr-0.5 text-[12.5px]" data-lembrete={m}>
            <Bell size={12} className="text-muted" aria-hidden /> {textoDoAntes(m)}
            <button type="button" className="btn-ghost p-1 rounded text-muted hover:text-bad" onClick={() => { onChange(valor.filter((x) => x !== m)); setErro(''); }}
              aria-label={`Tirar o lembrete ${textoDoAntes(m).toLowerCase()}`} title="Tirar o lembrete"><X size={12} /></button>
          </li>
        )) : <li className="text-[12.5px] text-muted">Sem lembrete.</li>}
      </ul>
      {valor.length < MAX_LEMBRETES && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input type="number" min={0} max={999} inputMode="numeric" className="input py-1 w-[70px] tnum" value={quanto} aria-label="Quanto tempo antes"
            onChange={(e) => { setQuanto(e.target.value); setErro(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); incluir(); } }} data-lembrete-quanto />
          <select className="input py-1 w-auto" value={unidade} onChange={(e) => { setUnidade(e.target.value as UnidadeDoLembrete); setErro(''); }} aria-label="Em minutos, horas, dias ou semanas" data-lembrete-unidade>
            {UNIDADES_DO_LEMBRETE.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <span className="text-[12.5px] text-muted">antes</span>
          <button type="button" className="btn-secondary btn-sm" onClick={incluir} data-lembrete-incluir><Plus size={13} /> Incluir</button>
          {erro && <span className="text-bad text-[12px] basis-full" role="alert">{erro}</span>}
        </div>
      )}
    </div>
  );
}

// ---------- hoje, fora do escritório ----------

/** Quem está de folga e em home office hoje (os tipos "da equipe"), nas equipes que a pessoa vê. */
export function ForaDoEscritorio({ eventos, opcoes, nomes, dia, className = '' }: {
  eventos: readonly EventoDoCalendario[]; opcoes: CalendarioOpcoes; nomes: ReadonlyMap<string, string>; dia: string; className?: string;
}) {
  const fora = quemEstaFora(eventos, opcoes.tipos, dia);
  if (!fora.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] ${className}`} data-fora-do-escritorio>
      <span className="font-semibold text-ink-2 inline-flex items-center gap-1.5 mr-1"><TreePalm size={15} className="text-muted" aria-hidden /> Hoje, fora do escritório</span>
      {fora.map((f) => (
        <span key={f.tipo.id} className={`chip rounded-full font-medium pl-1.5 ${FUNDO_DO_TIPO[f.tipo.cor]}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${AMOSTRA_DA_COR[f.tipo.cor]}`} aria-hidden />
          <b className="font-semibold">{f.tipo.nome}:</b> {nomesDe(f.pessoas, nomes).join(', ')}
        </span>
      ))}
    </div>
  );
}
