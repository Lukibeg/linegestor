/**
 * Os filtros do Quadro e da Lista dos chamados (Patch 2.0). Ficam no endereço — dá para mandar o
 * link do jeito que está, e o Voltar da ficha devolve a lista como estava —, cada um aparece escrito
 * com o seu X, e a busca só vai para o endereço quando a pessoa para de digitar (senão cada letra
 * viraria uma consulta ao servidor).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { caminhoDoAssunto, campoLigado, type CorPainel, type OpcoesAtendimento } from '@gestor/shared';
import { api } from '../../../api/index.js';
import type { OpcaoBusca } from '../../../components/ui/index.js';

/** A caixa de um filtro (lista suspensa ou escolha com busca), do mesmo tamanho em todos. */
export const CAIXA_FILTRO = 'input py-1.5 text-[13px] w-auto max-w-[220px]';

/** O endereço como lugar dos filtros: ler um e mudar vários de uma vez. */
export function useFiltrosNoEndereco() {
  const [sp, setSp] = useSearchParams();
  const valor = useCallback((k: string) => sp.get(k) ?? '', [sp]);
  // mudar um filtro volta para a primeira página: a página 3 do filtro anterior pode nem existir neste
  const mudar = useCallback((o: Record<string, string | null | undefined>, manterPagina = false) => {
    setSp((atual) => {
      const n = new URLSearchParams(atual);
      for (const [k, v] of Object.entries(o)) { if (v == null || v === '') n.delete(k); else n.set(k, v); }
      if (!manterPagina) n.delete('p');
      return n;
    }, { replace: true });
  }, [setSp]);
  return { sp, valor, mudar };
}

/**
 * A busca. O texto vai para o endereço um instante depois de parar de digitar (ou no Enter). O que
 * já foi mandado fica guardado: assim a resposta do endereço não apaga a letra digitada no meio.
 */
export function CampoBusca({ valor, onChange, placeholder, titulo, id, className = '' }: { valor: string; onChange: (v: string) => void; placeholder: string; titulo?: string; id?: string; className?: string }) {
  const [texto, setTexto] = useState(valor);
  const enviado = useRef(valor);
  // o endereço mudou por fora (o X do filtro, "Limpar filtros", o Voltar): a caixa acompanha
  useEffect(() => { if (valor !== enviado.current) { enviado.current = valor; setTexto(valor); } }, [valor]);
  const mandar = useCallback((t: string) => { const v = t.trim(); if (v === enviado.current) return; enviado.current = v; onChange(v); }, [onChange]);
  useEffect(() => {
    const t = window.setTimeout(() => mandar(texto), 300);
    return () => window.clearTimeout(t);
  }, [texto, mandar]);
  return (
    <label className={`relative block min-w-0 ${className}`}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
      <input
        id={id} className="input pl-9 pr-8" autoComplete="off" spellCheck={false} placeholder={placeholder} aria-label={titulo ?? placeholder} title={titulo}
        value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') mandar(texto); }}
      />
      {texto && (
        <button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-ghost btn-sm px-1.5 text-muted" aria-label="Limpar a busca" title="Limpar a busca"
          onClick={() => { setTexto(''); mandar(''); }}>
          <X size={14} />
        </button>
      )}
    </label>
  );
}

/** Os clientes para o filtro (a mesma consulta das outras telas: o cache é um só). */
export function useClientesParaFiltro() {
  const q = useQuery({ queryKey: ['client-options'], queryFn: () => api.clients.options(), staleTime: 5 * 60_000 });
  return useMemo<OpcaoBusca[]>(() => (q.data ?? []).map((c) => ({ id: c.id, nome: c.name })), [q.data]);
}

// ---------- o responsável: todos, os meus, os sem dono ou uma pessoa ----------

export const RESPONSAVEL_EU = 'eu';
export const RESPONSAVEL_NINGUEM = 'ninguem';

export function opcoesDeResponsavel(pessoas: Array<{ id: string; nome: string }>): OpcaoBusca[] {
  return [
    { id: RESPONSAVEL_EU, nome: 'Meus', dica: 'os que estão com você' },
    { id: RESPONSAVEL_NINGUEM, nome: 'Sem dono', dica: 'na fila, sem responsável' },
    ...pessoas.map((p) => ({ id: p.id, nome: p.nome })),
  ];
}

export function nomeDoResponsavel(v: string, pessoas: Array<{ id: string; nome: string }>): string {
  if (v === RESPONSAVEL_EU) return 'Meus';
  if (v === RESPONSAVEL_NINGUEM) return 'Sem dono';
  // uma pessoa que saiu da equipe continua no link antigo: o filtro aparece, sem o nome
  return pessoas.find((p) => p.id === v)?.nome ?? 'uma pessoa que não está mais ativa';
}

// ---------- o assunto, pelo caminho inteiro ----------

/** "Operadora › Incidente › DID de entrada", de um painel só ou de todos (com o painel na dica); o painel sem assunto fica de fora. */
export function opcoesDeAssunto(opcoes: OpcoesAtendimento, painelId?: string): OpcaoBusca[] {
  const paineis = (painelId ? opcoes.paineis.filter((p) => p.id === painelId) : opcoes.paineis).filter((p) => campoLigado(p.ajustes, 'assunto'));
  return paineis.flatMap((p) => {
    const doPainel = opcoes.assuntos.filter((a) => a.painelId === p.id);
    return doPainel.map((a) => ({
      id: a.id,
      nome: caminhoDoAssunto(a.id, doPainel),
      dica: [painelId ? '' : p.nome, a.ativo ? '' : 'desativado'].filter(Boolean).join(', ') || undefined,
    }));
  });
}

export const nomeDoAssunto = (id: string, opcoes: OpcoesAtendimento | undefined) =>
  caminhoDoAssunto(id, opcoes?.assuntos ?? []) || 'um assunto que saiu';

// ---------- o que está filtrado, escrito ----------

export type FiltroEscrito = { chave: string; nome: string; valor: ReactNode; tirar: () => void };

/** Cada filtro ligado, com o seu X; "Limpar filtros" tira todos de uma vez. */
export function FiltrosEscritos({ itens, onLimpar }: { itens: FiltroEscrito[]; onLimpar: () => void }) {
  if (!itens.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="O que está filtrado">
      {itens.map((x) => (
        <span key={x.chave} className="inline-flex items-center gap-1 rounded-full bg-accent-soft text-accent-ink text-[12.5px] pl-2.5 pr-1 py-0.5 max-w-full min-w-0">
          <span className="truncate">{x.nome}: <b className="font-semibold">{x.valor}</b></span>
          <button type="button" className="hover:bg-surface rounded-full p-0.5 shrink-0" onClick={x.tirar} aria-label={`Tirar o filtro ${x.nome}`} title="Tirar este filtro">
            <X size={12} />
          </button>
        </span>
      ))}
      <button type="button" className="btn-ghost btn-sm text-muted" onClick={onLimpar}>Limpar filtros</button>
    </div>
  );
}

/** Uma lista suspensa de filtro (para listas curtas: prioridade, espera, prazo…). */
export function SelectFiltro({ rotulo, valor, onChange, vazio, opcoes, id }: {
  rotulo: string; valor: string; onChange: (v: string) => void; vazio: string; opcoes: Array<{ id: string; nome: string }>; id?: string;
}) {
  return (
    <select id={id} aria-label={rotulo} title={rotulo} className={CAIXA_FILTRO} value={valor} onChange={(e) => onChange(e.target.value)}>
      <option value="">{vazio}</option>
      {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
  );
}

/** A bolinha com a cor do painel (as classes precisam estar escritas inteiras para o Tailwind achar). */
export const PONTO_DO_PAINEL: Record<CorPainel, string> = {
  accent: 'bg-accent', roxo: 'bg-roxo', turquesa: 'bg-turquesa', signal: 'bg-signal', ok: 'bg-ok', rosa: 'bg-rosa', amarelo: 'bg-amarelo', neutral: 'bg-line-strong',
};
export function PontoDoPainel({ cor }: { cor: CorPainel | undefined }) {
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${PONTO_DO_PAINEL[cor ?? 'neutral'] ?? 'bg-line-strong'}`} aria-hidden />;
}
