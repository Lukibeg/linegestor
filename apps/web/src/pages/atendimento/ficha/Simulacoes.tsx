/**
 * As simulações ligadas à negociação (o Simulador do Comercial, 2.0.2, decisão 0052): o Luan quis a
 * simulação "atrelada a um card do comercial se eu quiser", e o sinal da margem na negociação. Cada uma mostra
 * o cenário principal: o que o cliente paga, o que sobra por mês e a margem com o sinal. O **Simular** (a
 * ideia "simular a partir da negociação") abre uma simulação nova já ligada, com a empresa, os produtos e os
 * valores da negociação. Sem simulação e sem poder simular, a parte não aparece.
 *
 * Desde o 2.0.4.1, a simulação (a que existe e a nova do Simular) abre numa janela por cima da ficha — o pedido
 * do Luan: "as simulações aqui quero que abra via pop up pra n precisar sair da página". É o editor do Simulador
 * inteiro; fechar a janela salva o que faltava e volta para a ficha, com a lista e a margem já atualizadas.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, Plus } from 'lucide-react';
import { textoDoSePagaEm } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { useAuth } from '../../../lib/auth.js';
import { ChipDoSinal, reaisLimpo } from '../../comercial/simulador/comum.js';
import { SimulacaoEmJanela } from '../../comercial/simulador/Simulacao.js';
import { Secao, useAberta } from './base.js';

export function SimulacoesDaNegociacao() {
  const { f, painel, pode } = useAberta();
  const { can } = useAuth();
  const vendas = painel?.tipo === 'vendas' && can('sales.read');
  const podeSimular = vendas && pode && can('tickets.work');
  const lista = useQuery({ queryKey: ['simulador-da-negociacao', f.id], queryFn: () => api.simulador.daNegociacao(f.id), enabled: vendas, staleTime: 30_000 });
  // a simulação aberta na janela (`id` nulo: a nova, do Simular)
  const [aberta, setAberta] = useState<{ id: string | null } | null>(null);
  const itens = lista.data ?? [];
  if (!vendas || (!itens.length && !podeSimular)) return null;
  return (
    <Secao id="campo-simulacoes" titulo="Simulações" icone={<Calculator size={16} />} dica={itens.length ? `${itens.length}` : undefined}
      acoes={podeSimular ? (
        <button type="button" className="btn-secondary btn-sm" id="ficha-simular" onClick={() => setAberta({ id: null })}
          title="Uma simulação nova, já ligada a esta negociação, com a empresa, os produtos e os valores dela (abre numa janela, por cima da ficha)">
          <Plus size={14} /> Simular
        </button>
      ) : undefined}>
      {itens.length ? (
        <ul className="flex flex-col gap-2 -mx-1" id="ficha-simulacoes">
          {itens.map((s) => (
            <li key={s.id}>
              <button type="button" className="block w-full text-left rounded-lg px-2 py-1.5 hover:bg-surface-2" data-simulacao={s.id} onClick={() => setAberta({ id: s.id })}
                title="Abrir a simulação numa janela, por cima da ficha">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-[13.5px] text-ink min-w-0">{s.nome}</span>
                  <ChipDoSinal sinal={s.principal.sinal} margem={s.principal.margem} curto />
                </div>
                <div className="text-[12.5px] text-muted">
                  {reaisLimpo(s.principal.mensalTotal)}/mês · sobra {reaisLimpo(s.principal.sobraMensal)} · se paga {textoDoSePagaEm(s.principal.sePagaEm)}
                  {s.cenarios > 1 && ` · ${s.cenarios} cenários (o principal: ${s.principal.nome})`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">Nenhuma simulação ainda. O Simular abre uma, já com a empresa, os produtos e os valores desta negociação.</p>
      )}
      {aberta && <SimulacaoEmJanela key={aberta.id ?? 'nova'} id={aberta.id} negociacao={f.id} onFechar={() => setAberta(null)} />}
    </Secao>
  );
}
