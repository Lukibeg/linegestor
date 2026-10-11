/**
 * As peças comuns das telas dos chamados do Gestor (Patch 1.10, decisão 0047): o cabeçalho do
 * módulo (Meu dia · Quadro · Lista · Ajustes), o código do chamado, a prioridade, o selo do prazo,
 * a marca de espera, o responsável e o cartão do chamado (o mesmo no quadro e no Meu dia).
 *
 * As contas (o prazo em palavras, a prioridade sugerida, o que falta) vêm do `@gestor/shared` — as
 * mesmas do servidor e da prévia.
 */
import { useCallback, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Hourglass, Layers, MessageSquare, Plus, RotateCcw, Siren, TriangleAlert } from 'lucide-react';
import {
  NOME_ESPERA, NOME_PRIORIDADE, NOME_SITUACAO_CHAMADO, textoDoPrazo,
  type CartaoChamado, type CorPainel, type EstadoPrazo, type FichaChamado, type OpcoesAtendimento, type Painel, type Prioridade, type TipoEspera,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { useAuth } from '../../lib/auth.js';
import { Chip, FAIXA_ABAS, classeAba, useToast, type TomChip } from '../../components/ui/index.js';

// =====================================================================
//  OS DADOS DO MÓDULO
// =====================================================================

/** Os painéis, as pessoas, os assuntos, os prazos… (uma leitura só para o módulo inteiro). */
export function useOpcoes() {
  return useQuery<OpcoesAtendimento>({ queryKey: ['atendimento', 'opcoes'], queryFn: () => api.atendimento.opcoes(), staleTime: 60_000 });
}

export const chaveDaFicha = (ref: string) => ['atendimento', 'chamado', ref.toUpperCase()];

/** A ficha de um chamado (pelo código ou pelo id). */
export function useFicha(ref: string | undefined) {
  return useQuery<FichaChamado>({ queryKey: chaveDaFicha(ref ?? ''), queryFn: () => api.atendimento.chamado(ref!), enabled: !!ref, staleTime: 15_000 });
}

/**
 * Depois de mudar um chamado: a ficha nova entra no lugar da antiga (pelo código e pelo id) e o
 * quadro, a lista e o Meu dia releem. Devolve a função que embrulha a chamada.
 */
export function useDepoisDeMudar() {
  const qc = useQueryClient();
  const toast = useToast();
  return useCallback(async <T,>(promessa: Promise<T>, ok?: string): Promise<T> => {
    const r = await promessa;
    const f = r as unknown as FichaChamado | undefined;
    if (f && typeof f === 'object' && 'codigo' in f && 'historico' in f) {
      qc.setQueryData(chaveDaFicha(f.codigo), f);
      qc.setQueryData(chaveDaFicha(f.id), f);
    }
    for (const k of ['quadro', 'lista', 'meu-dia', 'opcoes', 'avisos']) void qc.invalidateQueries({ queryKey: ['atendimento', k] });
    if (ok) toast.push('ok', ok);
    return r;
  }, [qc, toast]);
}

/** O que a pessoa pode fazer no módulo. */
export function usePode() {
  const { can } = useAuth();
  return { ver: can('support.read'), trabalhar: can('tickets.work'), cuidar: can('tickets.manage'), integrar: can('admin.manage') };
}

export const painelDe = (opcoes: OpcoesAtendimento | undefined, id: string | null | undefined): Painel | undefined => opcoes?.paineis.find((p) => p.id === id);
export const etapaDe = (opcoes: OpcoesAtendimento | undefined, painelId: string, etapaId: string) => painelDe(opcoes, painelId)?.etapas.find((e) => e.id === etapaId);

// =====================================================================
//  O CABEÇALHO DO MÓDULO
// =====================================================================

/**
 * As abas do módulo. A primeira são os Painéis (a tela inicial, como no Helena): o quadro de cada
 * painel se abre por ela, e a aba continua marcada lá dentro.
 */
const ABAS: Array<{ to: string; label: string; fim?: boolean; so?: 'cuidar'; tambem?: string }> = [
  { to: '/atendimento', label: 'Painéis', fim: true, tambem: '/atendimento/quadro' },
  { to: '/atendimento/meu-dia', label: 'Meu dia' },
  { to: '/atendimento/lista', label: 'Lista' },
  { to: '/atendimento/ajustes', label: 'Ajustes', so: 'cuidar' },
];

/** O título "Chamados", as abas do módulo e o botão de abrir chamado (quem trabalha). */
export function CabecalhoAtendimento({ sub, acoes }: { sub?: ReactNode; acoes?: ReactNode }) {
  const pode = usePode();
  const { pathname } = useLocation();
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold">Chamados</h1>
          {sub && <div className="text-muted text-sm mt-0.5">{sub}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {acoes}
          {pode.trabalhar && <Link to="/atendimento/novo" className="btn-primary"><Plus size={16} /> Abrir chamado</Link>}
        </div>
      </div>
      <nav className={FAIXA_ABAS} aria-label="Partes do módulo de chamados">
        {ABAS.filter((a) => !a.so || pode.cuidar || pode.integrar).map((a) => (
          <NavLink key={a.to} to={a.to} end={a.fim} className={({ isActive }) => classeAba(isActive || (!!a.tambem && pathname.startsWith(a.tambem)))}>{a.label}</NavLink>
        ))}
      </nav>
    </div>
  );
}

// =====================================================================
//  AS PEÇAS
// =====================================================================

/** A cor do painel nos chips (os mesmos tons do sistema). */
export const TOM_DO_PAINEL: Record<CorPainel, TomChip> = {
  accent: 'accent', roxo: 'roxo', turquesa: 'turquesa', signal: 'signal', ok: 'ok', rosa: 'rosa', amarelo: 'amarelo', neutral: 'neutral',
};

/** O código do chamado (SUP-12), na cor do painel; com `link`, abre a ficha. */
export function CodigoChamado({ codigo, cor = 'accent', link = true, className = '' }: { codigo: string; cor?: CorPainel; link?: boolean; className?: string }) {
  const chip = <Chip tone={TOM_DO_PAINEL[cor] ?? 'accent'} className={`font-mono tracking-tight ${className}`}>{codigo}</Chip>;
  if (!link) return chip;
  return <Link to={`/atendimento/${encodeURIComponent(codigo)}`} className="hover:opacity-80" onClick={(e) => e.stopPropagation()}>{chip}</Link>;
}

/** A cor de cada prioridade: Crítica vermelha, Alta laranja, Média amarela, Baixa neutra. */
export const TOM_PRIORIDADE: Record<Prioridade, TomChip> = { critica: 'bad', alta: 'signal', media: 'amarelo', baixa: 'neutral' };
export function ChipPrioridade({ p, curta = false }: { p: Prioridade | null; curta?: boolean }) {
  if (!p) return curta ? null : <span className="text-muted text-[12.5px]">sem prioridade</span>;
  return (
    <Chip tone={TOM_PRIORIDADE[p]} title={`Prioridade ${NOME_PRIORIDADE[p]}`}>
      {p === 'critica' && <Siren size={12} />}{NOME_PRIORIDADE[p]}
    </Chip>
  );
}

const TOM_SITUACAO: Record<CartaoChamado['situacao'], TomChip> = { aberto: 'accent', resolvido: 'ok', fechado: 'muted' };
export function ChipSituacao({ s }: { s: CartaoChamado['situacao'] }) {
  return <Chip tone={TOM_SITUACAO[s]}>{NOME_SITUACAO_CHAMADO[s]}</Chip>;
}

/** A marca "esperando o cliente / a operadora" (o prazo para só no cliente). */
export function ChipEspera({ e, mostrarDesde = false }: { e: { tipo: TipoEspera; motivo: string | null; desde?: string } | null; mostrarDesde?: boolean }) {
  if (!e) return null;
  return (
    <Chip tone={e.tipo === 'cliente' ? 'turquesa' : 'roxo'} title={`${NOME_ESPERA[e.tipo]}${e.motivo ? `: ${e.motivo}` : ''}`}>
      <Hourglass size={12} /> {NOME_ESPERA[e.tipo]}{mostrarDesde && e.desde ? ` desde ${dataHoraCurta(e.desde)}` : ''}
    </Chip>
  );
}

const TOM_PRAZO: Record<EstadoPrazo['situacao'], TomChip> = { vencido: 'bad', perto: 'signal', no_prazo: 'neutral', pausado: 'muted', cumprido: 'ok', estourou: 'bad', sem: 'muted' };

/**
 * O selo do prazo: o mais urgente entre a primeira resposta (enquanto ninguém respondeu) e a
 * solução. Vencido em vermelho, perto de vencer em laranja, parado em cinza.
 */
export function SeloPrazo({ c, completo = false }: { c: Pick<CartaoChamado, 'prazos' | 'situacao'>; completo?: boolean }) {
  const { resposta, solucao } = c.prazos;
  if (c.situacao === 'fechado' && !completo) return null;
  const pendente = resposta.situacao !== 'cumprido' && resposta.situacao !== 'estourou' && resposta.situacao !== 'sem';
  const peso = (e: EstadoPrazo) => ({ vencido: 0, perto: 1, no_prazo: 2, pausado: 3, estourou: 4, cumprido: 5, sem: 6 }[e.situacao]);
  const qual = pendente && peso(resposta) <= peso(solucao) ? { nome: 'Resposta', e: resposta } : { nome: 'Solução', e: solucao };
  if (qual.e.situacao === 'sem') return null;
  const icone = qual.e.situacao === 'vencido' ? <TriangleAlert size={12} /> : qual.e.situacao === 'pausado' ? <Hourglass size={12} /> : null;
  return (
    <Chip tone={TOM_PRAZO[qual.e.situacao]} title={`${qual.nome}: ${textoDoPrazo(qual.e)}`}>
      {icone}{completo ? `${qual.nome}: ${textoDoPrazo(qual.e)}` : textoCurtoDoPrazo(qual.e)}
    </Chip>
  );
}

/** "Vencido", "2 h", "Parado"… — cabe no cartão do quadro. */
export function textoCurtoDoPrazo(e: EstadoPrazo): string {
  const falta = Math.max(0, e.limite - e.usado);
  const fmt = (m: number) => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(Math.round(m % 60)).padStart(2, '0')}` : ''}`);
  switch (e.situacao) {
    case 'vencido': return `Venceu há ${fmt(e.usado - e.limite)}`;
    case 'pausado': return 'Parado';
    case 'cumprido': return 'No prazo';
    case 'estourou': return 'Fora do prazo';
    case 'perto': case 'no_prazo': return `Faltam ${fmt(falta)}`;
    default: return '';
  }
}

/** As iniciais da pessoa num círculo (o responsável no cartão). */
export function Avatar({ nome, tamanho = 24, title }: { nome: string; tamanho?: number; title?: string }) {
  const iniciais = nome.replace(/[^\p{L} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
  return (
    <span title={title ?? nome} aria-label={title ?? nome} role="img" style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho / 2.3) }}
      className="inline-flex items-center justify-center rounded-full bg-accent-soft text-accent-ink font-semibold shrink-0 select-none">
      {iniciais}
    </span>
  );
}

/** As etiquetas inteiras (o pedido do Eider: nada de nome cortado). */
export function Etiquetas({ lista }: { lista: string[] }) {
  if (!lista.length) return null;
  return <span className="inline-flex flex-wrap gap-1">{lista.map((e) => <Chip key={e} tone="muted" className="font-medium">{e}</Chip>)}</span>;
}

// ---------- datas ----------

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const diaBrasil = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

/** "hoje 14:32", "ontem 09:10", "08/10 17:45". */
export function dataHoraCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86_400_000);
  if (diaBrasil(d) === diaBrasil(hoje)) return `hoje ${fmtHora.format(d)}`;
  if (diaBrasil(d) === diaBrasil(ontem)) return `ontem ${fmtHora.format(d)}`;
  return fmtDataHora.format(d).replace(',', '');
}
export const dataCurta = (iso: string | null | undefined) => (iso ? fmtData.format(new Date(iso)) : '—');

/** "há 5 min", "há 3 h", "há 2 dias". */
export function haQuanto(iso: string | null | undefined): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/** "+55 (71) 99999-0000" a partir de "5571999990000". */
export function telefoneLegivel(n: string | null | undefined): string {
  const d = (n ?? '').replace(/\D/g, '');
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return n ?? '';
  const ddd = d.slice(2, 4); const resto = d.slice(4);
  return `(${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

// =====================================================================
//  O CARTÃO DO CHAMADO (o quadro e o Meu dia)
// =====================================================================

/**
 * O chamado num cartão: o código, a prioridade e o prazo em cima; o título; a empresa em destaque e
 * o contato (o pedido do Eider, com o nome do contato que o Luan pediu); o assunto; quem está com ele.
 */
export function CartaoDoChamado({ c, cor, mostrarEtapa, nomeDaEtapa, arrastavel = false }: { c: CartaoChamado; cor?: CorPainel; mostrarEtapa?: boolean; nomeDaEtapa?: string; arrastavel?: boolean }) {
  return (
    <div className={`card p-3 text-[13px] leading-snug flex flex-col gap-1.5 ${c.prazos.solucao.situacao === 'vencido' || c.prazos.resposta.situacao === 'vencido' ? 'border-l-4 border-l-bad' : c.prioridade === 'critica' ? 'border-l-4 border-l-signal' : ''} ${arrastavel ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <CodigoChamado codigo={c.codigo} cor={cor} />
        {c.tipoChamado === 'problema' && <Chip tone="rosa" title="Problema: junta incidentes de várias empresas"><Layers size={12} /> Problema</Chip>}
        <ChipPrioridade p={c.prioridade} curta />
        <span className="ml-auto"><SeloPrazo c={c} /></span>
      </div>
      <Link to={`/atendimento/${encodeURIComponent(c.codigo)}`} className="font-semibold text-ink hover:text-accent line-clamp-2" onClick={(e) => e.stopPropagation()}>{c.titulo}</Link>
      {(c.cliente || c.contato) && (
        <div className="min-w-0">
          {c.cliente ? <div className="font-semibold text-ink-2 truncate">{c.cliente.nome}</div> : <div className="text-signal text-[12px] font-medium">sem cliente</div>}
          {c.contato && (c.contato.nome || c.contato.telefone) && <div className="text-muted text-[12px] truncate">{c.contato.nome ?? telefoneLegivel(c.contato.telefone)}</div>}
        </div>
      )}
      {c.assunto && <div className="text-[12px] text-muted truncate" title={c.assunto.caminho}>{c.assunto.caminho}</div>}
      <div className="flex items-center gap-1.5 flex-wrap">
        <ChipEspera e={c.espera} />
        {mostrarEtapa && nomeDaEtapa && <Chip tone="neutral">{nomeDaEtapa}</Chip>}
        {c.reaberto > 0 && <Chip tone="signal" title={`Reaberto ${c.reaberto} ${c.reaberto === 1 ? 'vez' : 'vezes'}`}><RotateCcw size={11} /> {c.reaberto}</Chip>}
        {c.filhos.total > 0 && <Chip tone="neutral" title={`${c.filhos.abertos} de ${c.filhos.total} filhos em aberto`}><GitBranch size={11} /> {c.filhos.abertos}/{c.filhos.total}</Chip>}
        {c.pai && <span className="text-[11.5px] text-muted">filho de <span className="font-mono">{c.pai.codigo}</span></span>}
        {c.problema && <span className="text-[11.5px] text-muted">incidente de <span className="font-mono">{c.problema.codigo}</span></span>}
        {c.anotacoes > 0 && <span className="text-[11.5px] text-muted inline-flex items-center gap-0.5" title={`${c.anotacoes} anotações`}><MessageSquare size={11} /> {c.anotacoes}</span>}
        <span className="ml-auto">{c.responsavel ? <Avatar nome={c.responsavel.nome} /> : <span className="text-[11.5px] text-muted italic">sem dono</span>}</span>
      </div>
      {c.etiquetas.length > 0 && <Etiquetas lista={c.etiquetas} />}
    </div>
  );
}
