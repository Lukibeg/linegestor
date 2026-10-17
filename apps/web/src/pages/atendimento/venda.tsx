/**
 * As peças da negociação (o painel de Vendas, 2.0.1, decisão 0050): o campo do valor em reais e a
 * janela de marcar como Ganho ou Perdido (o quadro e a ficha usam a mesma).
 */
import { useId, useRef, useState } from 'react';
import { Trophy, ThumbsDown } from 'lucide-react';
import { diaLocal, lerReais, paraBusca, reais, type EtapaPainel, type Painel } from '@gestor/shared';
import { Campo, Modal, Spinner } from '../../components/ui/index.js';

/** Os centavos como a pessoa escreve no campo: 12.500,00. */
export const valorNoCampo = (centavos: number | null | undefined) =>
  centavos == null ? '' : (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * O valor em reais. A pessoa escreve do jeito dela ("12.500", "12500,50", "R$ 1.234,56", "1,5 mil"); o
 * campo devolve em centavos (nulo = vazio) e diz se o que está escrito é um valor. Ao sair do campo, o
 * número fica escrito do jeito certo (12.500,00).
 */
export function CampoValor({ centavos, onChange, id, autoFocus, desativado, onEnter, onSair, rotulo }: {
  centavos: number | null; onChange: (centavos: number | null, valido: boolean) => void;
  id?: string; autoFocus?: boolean; desativado?: boolean; onEnter?: () => void;
  /** a pessoa saiu do campo (a ficha grava aqui) */
  onSair?: () => void;
  /** o nome do campo para o leitor de tela (quando não há um <label> ligado ao id) */
  rotulo?: string;
}) {
  const [texto, setTexto] = useState(valorNoCampo(centavos));
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[13px] pointer-events-none" aria-hidden>R$</span>
      <input
        id={id} className="input pl-9 tnum" inputMode="decimal" autoComplete="off" placeholder="0,00" value={texto} autoFocus={autoFocus} disabled={desativado}
        onChange={(e) => {
          const t = e.target.value;
          setTexto(t);
          const v = lerReais(t);
          onChange(t.trim() ? v : null, !t.trim() || v !== null);
        }}
        aria-label={rotulo}
        onBlur={() => { const v = lerReais(texto); if (v !== null) setTexto(valorNoCampo(v)); onSair?.(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
      />
    </div>
  );
}

/** O que a janela devolve: o motivo da perda, o dia em que acabou e, no Ganho, o valor (se mudou). */
export type ResultadoEscolhido = { motivoPerda: string | null; concluidoEm: string | null; valor?: number | null };

/**
 * Marcar a negociação como Ganho ou Perdido: no Ganho, o valor (que já vem da negociação) e o dia em
 * que fechou; no Perdido, o motivo (um dos motivos do painel; "Outro" pede para escrever) e o dia.
 * O dia é hoje ou antes (quem lança uma venda antiga escolhe o dia em que ela fechou de verdade).
 */
export function JanelaResultado({ codigo, valor, para, painel, onFechar, onConfirmar }: {
  codigo: string; valor: number | null | undefined; para: EtapaPainel; painel: Painel | undefined;
  onFechar: () => void; onConfirmar: (r: ResultadoEscolhido) => Promise<void>;
}) {
  const hoje = diaLocal(new Date());
  const ganho = para.resultado === 'ganho';
  const motivos = painel?.ajustes.motivosDePerda ?? [];
  const [dia, setDia] = useState(hoje);
  const [motivo, setMotivo] = useState('');
  const [outro, setOutro] = useState('');
  const [centavos, setCentavos] = useState<number | null>(valor ?? null);
  const [valido, setValido] = useState(true);
  const [indo, setIndo] = useState(false);
  const campoOutro = useRef<HTMLInputElement>(null);
  const idValor = useId();
  // o "Outro" (ou um motivo que não está na lista) pede o motivo escrito
  const ehOutro = paraBusca(motivo) === 'outro';
  const motivoFinal = ehOutro ? outro.trim() || null : motivo || null;
  const pedeValor = ganho && para.obrigatorios.includes('valor');
  const falta = ganho ? (pedeValor && centavos === null) || !valido : !motivoFinal;
  const diaOk = !!dia && dia <= hoje;
  const confirmar = async () => {
    if (falta || !diaOk || indo) { if (ehOutro && !outro.trim()) campoOutro.current?.focus(); return; }
    setIndo(true);
    try {
      await onConfirmar({ motivoPerda: ganho ? null : motivoFinal, concluidoEm: dia === hoje ? null : dia, ...(ganho && centavos !== (valor ?? null) ? { valor: centavos } : {}) });
    } finally { setIndo(false); }
  };
  return (
    <Modal open onClose={onFechar} titulo={ganho ? `Marcar ${codigo} como ganho` : `Marcar ${codigo} como perdido`}
      rodape={(
        <>
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="button" className={ganho ? 'btn-primary' : 'btn-danger'} disabled={falta || !diaOk || indo} onClick={confirmar} id="resultado-confirmar">
            {indo ? <Spinner className="text-white" /> : ganho ? <><Trophy size={15} aria-hidden /> Marcar como ganho</> : <><ThumbsDown size={15} aria-hidden /> Marcar como perdido</>}
          </button>
        </>
      )}>
      <div className="flex flex-col gap-3" id="janela-resultado" data-resultado={para.resultado ?? ''}>
        <p className="text-sm text-ink-2">
          {ganho
            ? 'A negociação sai do funil e entra no ganho do mês (e no relatório de vendas).'
            : 'A negociação sai do funil. O motivo fica na negociação (e na planilha do Exportar).'}
        </p>
        {ganho ? (
          <Campo label={pedeValor ? 'Valor fechado' : 'Valor fechado (se quiser)'} erro={!valido ? 'Escreva o valor como 12.500,00' : undefined}>
            <CampoValor id={idValor} centavos={centavos} autoFocus onChange={(v, ok) => { setCentavos(v); setValido(ok); }} onEnter={confirmar} />
          </Campo>
        ) : (
          <fieldset>
            <legend className="text-[13px] font-medium text-ink-2 mb-1.5">Por que perdeu?</legend>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Motivo da perda" id="resultado-motivos">
              {motivos.map((m) => {
                const escolhido = motivo === m;
                return (
                  <button key={m} type="button" role="radio" aria-checked={escolhido} onClick={() => { setMotivo(m); if (paraBusca(m) === 'outro') requestAnimationFrame(() => campoOutro.current?.focus()); }}
                    className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${escolhido ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line-strong text-ink-2 hover:bg-surface-2'}`}>
                    {m}
                  </button>
                );
              })}
            </div>
            {ehOutro && (
              <input ref={campoOutro} className="input mt-2" placeholder="Qual foi o motivo?" maxLength={200} value={outro} onChange={(e) => setOutro(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void confirmar(); } }} aria-label="O outro motivo" id="resultado-outro" />
            )}
          </fieldset>
        )}
        <Campo label={ganho ? 'Fechou em' : 'Perdeu em'} erro={dia && dia > hoje ? 'O dia é hoje ou um dia que já passou' : undefined}>
          <input type="date" className="input w-[180px]" value={dia} max={hoje} onChange={(e) => setDia(e.target.value)} id="resultado-dia" required />
        </Campo>
        {ganho && valor != null && centavos !== null && centavos !== valor && (
          <p className="text-[12.5px] text-muted">O valor da negociação muda de {reais(valor)} para {reais(centavos)} (fica no histórico).</p>
        )}
      </div>
    </Modal>
  );
}
