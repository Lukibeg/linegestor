/**
 * Na agenda (Patch 2.0.1, decisão 0049): os eventos do calendário ligados ao chamado (a visita, a
 * virada…) e o Agendar, que abre a janela do evento já com o chamado, o cliente e o painel dele. Quem
 * vê o evento é quem vê um dos painéis dele (a regra do calendário): o que é de um painel que a pessoa
 * não vê não aparece aqui.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus } from 'lucide-react';
import { api } from '../../../api/index.js';
import { CHAVE_DO_CALENDARIO, LinhaDoEvento, useNomesDasPessoas, useOpcoesDoCalendario } from '../../calendario/comum.js';
import { JanelaDoEvento, type AberturaDoEvento } from '../../calendario/Janela.js';
import { Secao, useAberta } from './base.js';

export function NaAgenda() {
  const { f, pode, eu, painel } = useAberta();
  const vendas = painel?.tipo === 'vendas';
  const opcoes = useOpcoesDoCalendario();
  const eventos = useQuery({ queryKey: [...CHAVE_DO_CALENDARIO, 'do-chamado', f.id], queryFn: () => api.calendario.doChamado(f.id), staleTime: 30_000 });
  const nomes = useNomesDasPessoas(opcoes.data);
  const [janela, setJanela] = useState<AberturaDoEvento | null>(null);
  const op = opcoes.data;
  const lista = eventos.data ?? [];
  const podeAgendar = pode && !!op?.podeEditar;
  if (!op || (!lista.length && !podeAgendar)) return null;

  const agendar = () => setJanela({
    novo: {
      // a empresa da negociação que ainda não é cliente entra só no título sugerido
      chamado: { id: f.id, codigo: f.codigo, titulo: f.titulo }, clienteId: f.cliente?.id ?? '', clienteNome: f.cliente?.nome ?? f.empresa ?? null,
      // o painel do chamado (a pessoa vê, porque vê o chamado); o tipo e o dia ela escolhe
      paineis: op.paineis.some((p) => p.id === f.painelId && p.ativo) ? [f.painelId] : undefined,
      pessoas: f.responsavel ? [f.responsavel.id] : [],
      inicio: op.hoje,
    },
  });

  return (
    <Secao id="campo-agenda" titulo="Na agenda" icone={<CalendarDays size={16} />} dica={lista.length ? `${lista.length} ${lista.length === 1 ? 'evento' : 'eventos'}` : undefined}
      acoes={podeAgendar ? <button type="button" className="btn-secondary btn-sm" onClick={agendar} id="ficha-agendar"><CalendarPlus size={14} /> Agendar</button> : undefined}>
      {lista.length ? (
        <ul className="flex flex-col gap-0.5 -mx-2 -my-1">
          {lista.map((e) => <li key={e.id}><LinhaDoEvento e={e} opcoes={op} nomes={nomes} comVoce={eu?.id ?? null} comPeriodo onAbrir={() => setJanela({ evento: e })} /></li>)}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">
          {vendas
            ? 'Nenhuma reunião ou visita marcada para esta negociação. O Agendar põe no calendário da equipe, já ligado a ela.'
            : 'Nenhuma visita ou virada marcada para este chamado. O Agendar põe no calendário da equipe, já ligado a ele.'}
        </p>
      )}
      {janela && <JanelaDoEvento abertura={janela} opcoes={op} onFechar={() => setJanela(null)} />}
    </Secao>
  );
}
