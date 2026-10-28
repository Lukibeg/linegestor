/**
 * Na agenda (Patch 2.0.1, decisão 0049): os eventos do calendário ligados ao chamado (a visita, a
 * virada…) e o Agendar, que abre a janela do evento já com o chamado, o cliente e o painel dele. Quem
 * vê o evento é quem vê um dos painéis dele (a regra do calendário): o que é de um painel que a pessoa
 * não vê não aparece aqui.
 *
 * Desde o 2.0.3 o Agendar também fica na barra de ações, ao lado do Mover (o pedido do Luan: "pra agendar tbm
 * pode até manter o agendar abaixo que já existe"): os dois usam o `useAgendar`.
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus } from 'lucide-react';
import type { CalendarioOpcoes, EventoDoCalendario } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { CHAVE_DO_CALENDARIO, LinhaDoEvento, useNomesDasPessoas, useOpcoesDoCalendario } from '../../calendario/comum.js';
import { JanelaDoEvento, type AberturaDoEvento } from '../../calendario/Janela.js';
import { Secao, useAberta } from './base.js';

/**
 * O Agendar do chamado aberto: se a pessoa pode pôr no calendário, a função que abre a janela do evento novo
 * (já com o chamado, o cliente, o painel e o responsável) e a janela em si, para desenhar onde for.
 */
export function useAgendar(): { op: CalendarioOpcoes | undefined; podeAgendar: boolean; agendar: () => void; abrirEvento: (e: EventoDoCalendario) => void; janela: ReactNode } {
  const { f, pode } = useAberta();
  const opcoes = useOpcoesDoCalendario();
  const [aberta, setAberta] = useState<AberturaDoEvento | null>(null);
  const op = opcoes.data;
  const agendar = () => {
    if (!op) return;
    setAberta({
      novo: {
        // a empresa da negociação que ainda não é cliente entra só no título sugerido
        chamado: { id: f.id, codigo: f.codigo, titulo: f.titulo }, clienteId: f.cliente?.id ?? '', clienteNome: f.cliente?.nome ?? f.empresa ?? null,
        // o painel do chamado (a pessoa vê, porque vê o chamado); o tipo e o dia ela escolhe
        paineis: op.paineis.some((p) => p.id === f.painelId && p.ativo) ? [f.painelId] : undefined,
        pessoas: f.responsavel ? [f.responsavel.id] : [],
        inicio: op.hoje,
      },
    });
  };
  return {
    op,
    podeAgendar: pode && !!op?.podeEditar,
    agendar,
    abrirEvento: (e) => setAberta({ evento: e }),
    janela: aberta && op ? <JanelaDoEvento abertura={aberta} opcoes={op} onFechar={() => setAberta(null)} /> : null,
  };
}

export function NaAgenda() {
  const { f, eu, painel } = useAberta();
  const vendas = painel?.tipo === 'vendas';
  const { op, podeAgendar, agendar, abrirEvento, janela } = useAgendar();
  const eventos = useQuery({ queryKey: [...CHAVE_DO_CALENDARIO, 'do-chamado', f.id], queryFn: () => api.calendario.doChamado(f.id), staleTime: 30_000 });
  const nomes = useNomesDasPessoas(op);
  const lista = eventos.data ?? [];
  // sem nenhum evento, a parte sai da ficha (2.2): o Agendar fica na barra de cima, e o evento marcado traz a parte de volta
  if (!op || !lista.length) return null;

  return (
    <Secao id="campo-agenda" titulo="Na agenda" icone={<CalendarDays size={16} />} dica={lista.length ? `${lista.length} ${lista.length === 1 ? 'evento' : 'eventos'}` : undefined}
      acoes={podeAgendar ? <button type="button" className="btn-secondary btn-sm" onClick={agendar} id="ficha-agendar"><CalendarPlus size={14} /> Agendar</button> : undefined}>
      {lista.length ? (
        <ul className="flex flex-col gap-0.5 -mx-2 -my-1">
          {lista.map((e) => <li key={e.id}><LinhaDoEvento e={e} opcoes={op} nomes={nomes} comVoce={eu?.id ?? null} comPeriodo onAbrir={() => abrirEvento(e)} /></li>)}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">
          {vendas
            ? 'Nenhuma reunião ou visita marcada para esta negociação. O Agendar põe no calendário da equipe, já ligado a ela.'
            : 'Nenhuma visita ou virada marcada para este chamado. O Agendar põe no calendário da equipe, já ligado a ele.'}
        </p>
      )}
      {janela}
    </Secao>
  );
}
