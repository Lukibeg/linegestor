/**
 * As simulações ligadas à negociação (o Simulador do Comercial, 2.0.2, decisão 0052): o Luan quis a
 * simulação "atrelada a um card do comercial se eu quiser", e o sinal da margem na negociação. Cada uma mostra
 * o cenário principal: o que o cliente paga, o que sobra por mês e a margem com o sinal. O **Simular** (a
 * ideia "simular a partir da negociação") abre uma simulação nova já ligada, com a empresa, os produtos e os
 * valores da negociação. Sem simulação e sem poder simular, a parte não aparece.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Calculator, Plus } from 'lucide-react';
import { textoDoSePagaEm } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { useAuth } from '../../../lib/auth.js';
import { ChipDoSinal, reaisLimpo } from '../../comercial/simulador/comum.js';
import { Secao, useAberta } from './base.js';

export function SimulacoesDaNegociacao() {
  const { f, painel, pode } = useAberta();
  const { can } = useAuth();
  const vendas = painel?.tipo === 'vendas' && can('sales.read');
  const podeSimular = vendas && pode && can('tickets.work');
  const lista = useQuery({ queryKey: ['simulador-da-negociacao', f.id], queryFn: () => api.simulador.daNegociacao(f.id), enabled: vendas, staleTime: 30_000 });
  const itens = lista.data ?? [];
  if (!vendas || (!itens.length && !podeSimular)) return null;
  return (
    <Secao id="campo-simulacoes" titulo="Simulações" icone={<Calculator size={16} />} dica={itens.length ? `${itens.length}` : undefined}
      acoes={podeSimular ? (
        <Link to={`/comercial/simulador/nova?negociacao=${encodeURIComponent(f.id)}`} className="btn-secondary btn-sm" id="ficha-simular"
          title="Uma simulação nova, já ligada a esta negociação, com a empresa, os produtos e os valores dela">
          <Plus size={14} /> Simular
        </Link>
      ) : undefined}>
      {itens.length ? (
        <ul className="flex flex-col gap-2 -mx-1" id="ficha-simulacoes">
          {itens.map((s) => (
            <li key={s.id}>
              <Link to={`/comercial/simulador/${s.id}`} className="block rounded-lg px-2 py-1.5 hover:bg-surface-2" data-simulacao={s.id}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-[13.5px] text-ink min-w-0">{s.nome}</span>
                  <ChipDoSinal sinal={s.principal.sinal} margem={s.principal.margem} curto />
                </div>
                <div className="text-[12.5px] text-muted">
                  {reaisLimpo(s.principal.mensalTotal)}/mês · sobra {reaisLimpo(s.principal.sobraMensal)} · se paga {textoDoSePagaEm(s.principal.sePagaEm)}
                  {s.cenarios > 1 && ` · ${s.cenarios} cenários (o principal: ${s.principal.nome})`}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">Nenhuma simulação ainda. O Simular abre uma, já com a empresa, os produtos e os valores desta negociação.</p>
      )}
    </Secao>
  );
}
