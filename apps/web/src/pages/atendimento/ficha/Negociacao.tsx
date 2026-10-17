/**
 * A negociação na ficha (o painel de Vendas, 2.0.1, decisão 0050), na coluna do lado, logo depois da
 * empresa: o valor (grava ao sair do campo) e, quando acabou, o Ganho ou o Perdido com o dia — e o
 * motivo da perda, que dá para trocar (fica no histórico).
 */
import { useState, type ReactNode } from 'react';
import { HandCoins } from 'lucide-react';
import { reais, type ChamadoAlterarEntrada } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Spinner } from '../../../components/ui/index.js';
import { ChipResultado, dataCurta } from '../comum.js';
import { CampoValor } from '../venda.js';
import { ErroPerto, MarcaFalta, Secao, useAberta, useAcao } from './base.js';

function Linha({ id, campo, rotulo, ocupado, erro, children }: { id: string; campo: string; rotulo: string; ocupado?: boolean; erro?: string | null; children: ReactNode }) {
  const { faltando } = useAberta();
  return (
    <div id={id} className={`rounded-md scroll-mt-24 transition-shadow ${faltando.has(campo) ? 'border-l-[3px] border-signal pl-2' : ''}`}>
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <span className="label mb-0">{rotulo}</span>
        <MarcaFalta campo={campo} />
        {ocupado && <Spinner className="!w-3.5 !h-3.5" />}
      </div>
      {children}
      <ErroPerto erro={erro} />
    </div>
  );
}

export function Negociacao() {
  const { f, painel, pode } = useAberta();
  const valor = useAcao();
  const motivo = useAcao();
  const [rascunho, setRascunho] = useState<{ centavos: number | null; valido: boolean } | null>(null);
  if (painel?.tipo !== 'vendas') return null;
  const mudar = (a: ReturnType<typeof useAcao>, d: ChamadoAlterarEntrada, ok?: string) => a.rodar(() => api.atendimento.alterar(f.id, d), ok);
  const gravarValor = async () => {
    if (!rascunho) return;
    if (!rascunho.valido) { valor.setErro('Escreva o valor como 12.500,00.'); return; }
    if (rascunho.centavos === f.valor) { setRascunho(null); return; }
    const r = await mudar(valor, { valor: rascunho.centavos }, rascunho.centavos === null ? 'O valor saiu' : `Valor: ${reais(rascunho.centavos)}`);
    if (r.ok) setRascunho(null);
  };
  const motivos = painel.ajustes.motivosDePerda;
  return (
    <Secao titulo="A negociação" icone={<HandCoins size={16} />} id="ficha-negociacao">
      <div className="flex flex-col gap-3.5">
        {f.resultado && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <ChipResultado r={f.resultado} motivo={f.motivoPerda} />
            {f.fechadoEm && <span className="text-ink-2">{f.resultado === 'ganho' ? 'fechou' : 'perdida'} em <b>{dataCurta(f.fechadoEm)}</b></span>}
          </div>
        )}
        <Linha id="campo-valor" campo="valor" rotulo="Valor" ocupado={valor.ocupado} erro={valor.erro}>
          {pode ? (
            // a chave remonta o campo quando o valor gravado muda (o que está escrito acompanha)
            <CampoValor key={f.valor ?? 'vazio'} id="ficha-valor" rotulo="Valor da negociação" centavos={f.valor}
              onChange={(c, ok) => { setRascunho({ centavos: c, valido: ok }); valor.limpar(); }} onSair={() => void gravarValor()} onEnter={() => void gravarValor()} />
          ) : <p className="font-display text-[19px] font-semibold tnum">{f.valor === null ? <span className="text-muted text-[14px] font-normal">—</span> : reais(f.valor)}</p>}
        </Linha>
        {f.resultado === 'perdido' && (
          <Linha id="campo-motivo-perda" campo="motivoPerda" rotulo="Motivo da perda" ocupado={motivo.ocupado} erro={motivo.erro}>
            {pode ? (
              <select className="input" value={f.motivoPerda ?? ''} aria-label="Motivo da perda"
                onChange={(e) => e.target.value && void mudar(motivo, { motivoPerda: e.target.value }, 'Motivo da perda trocado')}>
                {[...new Set([...(f.motivoPerda ? [f.motivoPerda] : []), ...motivos])].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : <p className="text-[14px]">{f.motivoPerda ?? '—'}</p>}
          </Linha>
        )}
      </div>
    </Secao>
  );
}
