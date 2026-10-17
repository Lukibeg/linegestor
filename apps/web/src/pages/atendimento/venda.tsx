/**
 * As peças da negociação (o painel de Vendas, 2.0.1, decisão 0050): o campo do valor em reais, o valor
 * da negociação (um só ou por produto, com o total) e a janela de marcar como Ganho ou Perdido (o
 * quadro e a ficha usam a mesma).
 */
import { useId, useRef, useState } from 'react';
import { ChevronDown, Plus, Trophy, ThumbsDown, X } from 'lucide-react';
import { diaLocal, lerReais, paraBusca, reais, somaDosProdutos, type EtapaPainel, type Painel, type ValoresDosProdutos } from '@gestor/shared';
import { Campo, EscolherComBusca, Modal, Spinner, type OpcaoBusca } from '../../components/ui/index.js';

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

/** Como é o valor da negociação: um só, ou o de cada produto (com o total). */
export type ModoDoValor = 'unico' | 'produto';

/**
 * O VALOR DA NEGOCIAÇÃO (o pedido do Luan na prévia, em 17/10: "quero que tenha como dividir o valor por
 * produtos e no final tenha o total"): **Um valor só** (o campo de sempre) ou **Por produto** — cada
 * produto da negociação com o seu valor e, no fim, o **Total**, que vira o valor da negociação. Os produtos
 * entram e saem aqui mesmo. Controlado: o formulário guarda até criar; a ficha grava ao sair de cada campo.
 * `gravados` (só a ficha) refaz o campo de um produto quando o valor dele muda no servidor.
 */
export function ValorDaNegociacao({
  id, modo, onModo, valor, onValor, valores, onValorDoProduto, produtos, catalogo, onIncluir, onTirar,
  onSair, onSairDoProduto, gravados, podeDividir = true, valorAntes, desativado,
}: {
  id: string;
  modo: ModoDoValor; onModo: (m: ModoDoValor) => void;
  valor: number | null; onValor: (centavos: number | null, valido: boolean) => void;
  /** o valor de cada produto (o que está escrito e vale); o total é a soma */
  valores: ValoresDosProdutos; onValorDoProduto: (produtoId: string, centavos: number | null, valido: boolean) => void;
  /** os produtos da negociação, na ordem */
  produtos: Array<{ id: string; nome: string }>;
  /** os produtos para incluir (os que ainda não estão) */
  catalogo: OpcaoBusca[];
  onIncluir: (produtoId: string) => void; onTirar: (produtoId: string) => void;
  onSair?: () => void; onSairDoProduto?: (produtoId: string) => void;
  gravados?: ValoresDosProdutos;
  /** o painel usa os produtos? (sem eles, é sempre um valor só) */
  podeDividir?: boolean;
  /** o valor único de antes (a ficha avisa que o total fica no lugar dele) */
  valorAntes?: number | null;
  desativado?: boolean;
}) {
  const total = somaDosProdutos(valores);
  const porProduto = podeDividir && modo === 'produto';
  return (
    <div className="flex flex-col gap-2 min-w-0" id={id} data-modo={porProduto ? 'produto' : 'unico'}>
      {podeDividir && (
        <div className="inline-flex self-start rounded-lg border border-line p-0.5 bg-surface" role="radiogroup" aria-label="Como é o valor">
          {(['unico', 'produto'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={modo === m} disabled={desativado} onClick={() => modo !== m && onModo(m)}
              className={`rounded-md px-2.5 py-1 text-[12.5px] ${modo === m ? 'bg-accent-soft text-accent-ink font-semibold' : 'text-ink-2 hover:bg-surface-2'}`}>
              {m === 'unico' ? 'Um valor só' : 'Por produto'}
            </button>
          ))}
        </div>
      )}
      {!porProduto ? (
        <div className="max-w-[260px]">
          <CampoValor id={`${id}-unico`} centavos={valor} onChange={onValor} onSair={onSair} onEnter={onSair} rotulo="Valor da negociação" desativado={desativado} />
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface min-w-0 max-w-[560px]">
          {produtos.length ? (
            <ul className="divide-y divide-line" aria-label="O valor de cada produto">
              {produtos.map((p) => (
                <li key={p.id} className="flex items-center gap-2 pl-3 pr-1 py-1.5" data-produto={p.nome}>
                  <span className="flex-1 min-w-0 text-[13.5px] text-ink break-words">{p.nome}</span>
                  <div className="w-[150px] shrink-0">
                    <CampoValor key={`${p.id}:${gravados?.[p.id] ?? ''}`} centavos={valores[p.id] ?? null} rotulo={`Valor de ${p.nome}`} desativado={desativado}
                      onChange={(c, ok) => onValorDoProduto(p.id, c, ok)} onSair={() => onSairDoProduto?.(p.id)} onEnter={() => onSairDoProduto?.(p.id)} />
                  </div>
                  <button type="button" className="btn-ghost btn-sm text-muted px-1.5" disabled={desativado} onClick={() => onTirar(p.id)} aria-label={`Tirar ${p.nome} da negociação`} title={`Tirar ${p.nome}`}>
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="px-3 py-2 text-[13px] text-muted">Inclua os produtos da negociação e escreva o valor de cada um.</p>}
          {catalogo.length > 0 && (
            <div className="px-1.5 py-1 border-t border-line">
              <EscolherComBusca valor="" opcoes={catalogo} onChange={(v) => v && onIncluir(v)} procurar="Procurar produto…" rotulo="Incluir produto"
                gatilho={(abrir) => (
                  <button type="button" className="btn-ghost btn-sm text-ink-2" onClick={abrir} disabled={desativado}>
                    <Plus size={13} /> Incluir produto <ChevronDown size={13} />
                  </button>
                )} />
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2 px-3 py-2 border-t border-line bg-surface-2 rounded-b-lg">
            <span className="text-[13px] font-semibold text-ink-2">Total</span>
            <b className="font-display text-[17px] font-semibold tnum" id={`${id}-total`}>{total === null ? '—' : reais(total)}</b>
          </div>
        </div>
      )}
      {porProduto && total === null && valorAntes != null && (
        <p className="text-[12px] text-muted">Ao escrever o valor dos produtos, o total fica no lugar do valor de {reais(valorAntes)}.</p>
      )}
    </div>
  );
}

/** O valor por produto só para ler (quem não mexe na negociação, a janela do Ganho): cada produto e o total. */
export function ValorPorProdutoLido({ linhas, className = '' }: { linhas: Array<{ id: string; nome: string; valor: number }>; className?: string }) {
  return (
    <div className={`rounded-lg border border-line min-w-0 ${className}`}>
      <ul className="divide-y divide-line" aria-label="O valor de cada produto">
        {linhas.map((l) => (
          <li key={l.id} className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-[13.5px]">
            <span className="min-w-0 break-words">{l.nome}</span><span className="tnum shrink-0">{reais(l.valor)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-2 px-3 py-2 border-t border-line bg-surface-2 rounded-b-lg">
        <span className="text-[13px] font-semibold text-ink-2">Total</span>
        <b className="font-display text-[16px] font-semibold tnum">{reais(linhas.reduce((t, l) => t + l.valor, 0))}</b>
      </div>
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
export function JanelaResultado({ codigo, valor, porProduto = [], para, painel, onFechar, onConfirmar }: {
  codigo: string; valor: number | null | undefined; para: EtapaPainel; painel: Painel | undefined;
  /** o valor por produto da negociação: com ele, o valor fechado é o total (muda-se na ficha, produto a produto) */
  porProduto?: Array<{ id: string; nome: string; valor: number }>;
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
  const dividido = porProduto.length > 0;
  const falta = ganho ? (pedeValor && centavos === null) || !valido : !motivoFinal;
  const diaOk = !!dia && dia <= hoje;
  const confirmar = async () => {
    if (falta || !diaOk || indo) { if (ehOutro && !outro.trim()) campoOutro.current?.focus(); return; }
    setIndo(true);
    try {
      await onConfirmar({ motivoPerda: ganho ? null : motivoFinal, concluidoEm: dia === hoje ? null : dia, ...(ganho && !dividido && centavos !== (valor ?? null) ? { valor: centavos } : {}) });
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
        {ganho && dividido ? (
          <div>
            <p className="text-[13px] font-medium text-ink-2 mb-1.5">Valor fechado (por produto)</p>
            <ValorPorProdutoLido linhas={porProduto} />
            <p className="text-[12px] text-muted mt-1.5">O valor é o total dos produtos. Se mudou, mude o valor de cada produto na ficha antes de marcar.</p>
          </div>
        ) : ganho ? (
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
        {ganho && !dividido && valor != null && centavos !== null && centavos !== valor && (
          <p className="text-[12.5px] text-muted">O valor da negociação muda de {reais(valor)} para {reais(centavos)} (fica no histórico).</p>
        )}
      </div>
    </Modal>
  );
}
