/**
 * As peças da negociação (o painel de Vendas, 2.0.1, decisão 0050): o campo do valor em reais, o valor
 * da negociação — a **mensalidade** e a **ativação**, cada uma única ou por produto, com os totais — e a
 * janela de marcar como Ganho ou Perdido (o quadro e a ficha usam a mesma).
 *
 * A mensalidade é o que conta (o quadro, o relatório, a meta); a ativação fica à parte (o pedido do Luan
 * na prévia, em 17/10: "a ativação n muda nada nos relatórios, ela só vai ter registro") — desde 19/10, com
 * as contas dela no relatório (o número Ativação e As ativações mês a mês).
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
 * número fica escrito do jeito certo (12.500,00). `sufixo` aparece no fim da caixa ("/mês") — no celular,
 * não (a caixa fica estreita demais para o número; o rótulo ou a coluna já dizem que é a mensalidade).
 */
export function CampoValor({ centavos, onChange, id, autoFocus, desativado, onEnter, onSair, rotulo, sufixo }: {
  centavos: number | null; onChange: (centavos: number | null, valido: boolean) => void;
  id?: string; autoFocus?: boolean; desativado?: boolean; onEnter?: () => void;
  /** a pessoa saiu do campo (a ficha grava aqui) */
  onSair?: () => void;
  /** o nome do campo para o leitor de tela (quando não há um <label> ligado ao id) */
  rotulo?: string;
  sufixo?: string;
}) {
  const [texto, setTexto] = useState(valorNoCampo(centavos));
  return (
    <div className="relative min-w-0">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[13px] pointer-events-none" aria-hidden>R$</span>
      <input
        id={id} className={`input pl-9 tnum ${sufixo ? 'sm:pr-11' : ''}`} inputMode="decimal" autoComplete="off" placeholder="0,00" value={texto} autoFocus={autoFocus} disabled={desativado}
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
      {sufixo && <span className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[12px] pointer-events-none" aria-hidden>{sufixo}</span>}
    </div>
  );
}

/** Como é o valor da negociação: um só (a mensalidade e a ativação), ou o de cada produto (com os totais). */
export type ModoDoValor = 'unico' | 'produto';

/** Uma das duas partes do valor (a mensalidade ou a ativação): a única e a de cada produto. */
export type ParteDoValor = {
  valor: number | null; onValor: (centavos: number | null, valido: boolean) => void; onSair?: () => void;
  /** a de cada produto (o que está escrito e vale); o total é a soma */
  valores: ValoresDosProdutos; onValorDoProduto: (produtoId: string, centavos: number | null, valido: boolean) => void;
  onSairDoProduto?: (produtoId: string) => void;
  /** só a ficha: o que está gravado — a única e a de cada produto (refaz o campo quando o valor dele muda no servidor) */
  gravado?: number | null;
  gravados?: ValoresDosProdutos;
};

/** A nota de sempre: o que conta, e onde a ativação aparece. */
export const SO_A_MENSALIDADE_CONTA = 'Só a mensalidade conta no quadro, na meta e no Ganho; a ativação tem as contas dela no relatório.';

/**
 * O VALOR DA NEGOCIAÇÃO (os pedidos do Luan na prévia, em 17/10: "quero que tenha como dividir o valor por
 * produtos e no final tenha o total" e "aqui tem q ter mensalidade e ativação"): **Um valor só** — a
 * mensalidade e a ativação — ou **Por produto** — cada produto da negociação com a mensalidade e a ativação
 * dele e, no fim, os **totais**, que viram os da negociação. Os produtos entram e saem aqui mesmo.
 * Controlado: o formulário guarda até criar; a ficha grava ao sair de cada campo.
 */
export function ValorDaNegociacao({
  id, modo, onModo, mensalidade, ativacao, produtos, catalogo, onIncluir, onTirar, podeDividir = true, valorAntes, desativado,
}: {
  id: string;
  modo: ModoDoValor; onModo: (m: ModoDoValor) => void;
  mensalidade: ParteDoValor; ativacao: ParteDoValor;
  /** os produtos da negociação, na ordem */
  produtos: Array<{ id: string; nome: string }>;
  /** os produtos para incluir (os que ainda não estão) */
  catalogo: OpcaoBusca[];
  onIncluir: (produtoId: string) => void; onTirar: (produtoId: string) => void;
  /** o painel usa os produtos? (sem eles, é sempre um valor só) */
  podeDividir?: boolean;
  /** a mensalidade única de antes (avisa que o total fica no lugar dela) */
  valorAntes?: number | null;
  desativado?: boolean;
}) {
  const totalMensal = somaDosProdutos(mensalidade.valores);
  const totalAtivacao = somaDosProdutos(ativacao.valores);
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
        <div className="grid grid-cols-2 gap-2 max-w-[420px]">
          <label className="flex flex-col gap-1 min-w-0" htmlFor={`${id}-unico`}>
            <span className="text-[12px] font-medium text-ink-2">Mensalidade</span>
            <CampoValor key={`u:${mensalidade.gravado ?? ''}`} id={`${id}-unico`} centavos={mensalidade.valor} onChange={mensalidade.onValor} onSair={mensalidade.onSair} onEnter={mensalidade.onSair} sufixo="/mês" desativado={desativado} />
          </label>
          <label className="flex flex-col gap-1 min-w-0" htmlFor={`${id}-ativacao`}>
            <span className="text-[12px] font-medium text-ink-2">Ativação</span>
            <CampoValor key={`u:${ativacao.gravado ?? ''}`} id={`${id}-ativacao`} centavos={ativacao.valor} onChange={ativacao.onValor} onSair={ativacao.onSair} onEnter={ativacao.onSair} desativado={desativado} />
          </label>
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface min-w-0 max-w-[560px]">
          {produtos.length ? (
            <>
              <div className="grid grid-cols-2 gap-2 px-3 pt-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted" aria-hidden>
                <span>Mensalidade</span><span>Ativação</span>
              </div>
              <ul className="divide-y divide-line" aria-label="O valor de cada produto">
                {produtos.map((p) => (
                  <li key={p.id} className="px-3 py-2" data-produto={p.nome}>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-[13.5px] font-medium text-ink break-words">{p.nome}</span>
                      <button type="button" className="btn-ghost btn-sm text-muted px-1.5 -my-1" disabled={desativado} onClick={() => onTirar(p.id)} aria-label={`Tirar ${p.nome} da negociação`} title={`Tirar ${p.nome}`}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                      <CampoValor key={`m:${p.id}:${mensalidade.gravados?.[p.id] ?? ''}`} centavos={mensalidade.valores[p.id] ?? null} rotulo={`Mensalidade de ${p.nome}`} sufixo="/mês" desativado={desativado}
                        onChange={(c, ok) => mensalidade.onValorDoProduto(p.id, c, ok)} onSair={() => mensalidade.onSairDoProduto?.(p.id)} onEnter={() => mensalidade.onSairDoProduto?.(p.id)} />
                      <CampoValor key={`a:${p.id}:${ativacao.gravados?.[p.id] ?? ''}`} centavos={ativacao.valores[p.id] ?? null} rotulo={`Ativação de ${p.nome}`} desativado={desativado}
                        onChange={(c, ok) => ativacao.onValorDoProduto(p.id, c, ok)} onSair={() => ativacao.onSairDoProduto?.(p.id)} onEnter={() => ativacao.onSairDoProduto?.(p.id)} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="px-3 py-2 text-[13px] text-muted">Inclua os produtos da negociação e escreva a mensalidade e a ativação de cada um.</p>}
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
          <div className="px-3 py-2 border-t border-line bg-surface-2 rounded-b-lg">
            <span className="text-[12px] font-semibold text-ink-2">Total</span>
            <div className="grid grid-cols-2 gap-2 items-baseline">
              <b className="font-display text-[15px] sm:text-[17px] font-semibold tnum min-w-0" id={`${id}-total`}>{totalMensal === null ? '—' : <>{reais(totalMensal)}<span className="text-[12px] font-normal text-muted">/mês</span></>}</b>
              <span className="text-[14px] tnum text-ink-2" id={`${id}-total-ativacao`}>{totalAtivacao === null ? '—' : reais(totalAtivacao)}</span>
            </div>
          </div>
        </div>
      )}
      <p className="text-[12px] text-muted">
        {porProduto && totalMensal === null && valorAntes != null
          ? `Ao escrever a mensalidade dos produtos, o total fica no lugar da mensalidade de ${reais(valorAntes)}. `
          : ''}
        {SO_A_MENSALIDADE_CONTA}
      </p>
    </div>
  );
}

/** Os produtos que têm a mensalidade ou a ativação escritas, na ordem da negociação. */
export type LinhaDoValor = { id: string; nome: string; mensalidade: number | null; ativacao: number | null };
export function linhasDoValor(produtos: Array<{ id: string; nome: string }>, mensalidades: ValoresDosProdutos | null | undefined, ativacoes: ValoresDosProdutos | null | undefined): LinhaDoValor[] {
  return produtos
    .filter((p) => mensalidades?.[p.id] !== undefined || ativacoes?.[p.id] !== undefined)
    .map((p) => ({ id: p.id, nome: p.nome, mensalidade: mensalidades?.[p.id] ?? null, ativacao: ativacoes?.[p.id] ?? null }));
}

/** O valor por produto só para ler (quem não mexe na negociação, a janela do Ganho): cada produto e os totais. */
export function ValorPorProdutoLido({ linhas, className = '' }: { linhas: LinhaDoValor[]; className?: string }) {
  const soma = (k: 'mensalidade' | 'ativacao') => (linhas.some((l) => l[k] !== null) ? linhas.reduce((t, l) => t + (l[k] ?? 0), 0) : null);
  const total = soma('mensalidade');
  const totalAtivacao = soma('ativacao');
  return (
    <div className={`rounded-lg border border-line min-w-0 ${className}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 px-3 pt-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted" aria-hidden>
        <span>Produto</span><span className="text-right">Mensalidade</span><span className="text-right">Ativação</span>
      </div>
      <ul className="divide-y divide-line" aria-label="O valor de cada produto">
        {linhas.map((l) => (
          <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 items-baseline px-3 py-1.5 text-[13.5px]">
            <span className="min-w-0 break-words">{l.nome}</span>
            <span className="tnum text-right">{l.mensalidade === null ? '—' : `${reais(l.mensalidade)}/mês`}</span>
            <span className="tnum text-right text-ink-2">{l.ativacao === null ? '—' : reais(l.ativacao)}</span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 items-baseline px-3 py-2 border-t border-line bg-surface-2 rounded-b-lg">
        <span className="text-[13px] font-semibold text-ink-2">Total</span>
        <b className="font-display text-[16px] font-semibold tnum text-right">{total === null ? '—' : `${reais(total)}/mês`}</b>
        <span className="tnum text-right text-ink-2">{totalAtivacao === null ? '—' : reais(totalAtivacao)}</span>
      </div>
    </div>
  );
}

/** O que a janela devolve: o motivo da perda, o dia em que acabou e, no Ganho, a mensalidade e a ativação (se mudaram). */
export type ResultadoEscolhido = { motivoPerda: string | null; concluidoEm: string | null; valor?: number | null; ativacao?: number | null };

/**
 * Marcar a negociação como Ganho ou Perdido: no Ganho, a mensalidade e a ativação (que já vêm da
 * negociação) e o dia em que fechou; no Perdido, o motivo (um dos motivos do painel; "Outro" pede para
 * escrever) e o dia. O dia é hoje ou antes (quem lança uma venda antiga escolhe o dia em que ela fechou
 * de verdade). Com o valor por produto, a janela só mostra: muda-se na ficha, produto a produto.
 */
export function JanelaResultado({ codigo, valor, ativacao = null, porProduto = [], para, painel, onFechar, onConfirmar }: {
  codigo: string; valor: number | null | undefined; ativacao?: number | null; para: EtapaPainel; painel: Painel | undefined;
  /** o valor por produto da negociação: com ele, o valor fechado é o total (muda-se na ficha, produto a produto) */
  porProduto?: LinhaDoValor[];
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
  const [ativ, setAtiv] = useState<number | null>(ativacao);
  const [ativValida, setAtivValida] = useState(true);
  const [indo, setIndo] = useState(false);
  const campoOutro = useRef<HTMLInputElement>(null);
  const idValor = useId();
  const idAtivacao = useId();
  // o "Outro" (ou um motivo que não está na lista) pede o motivo escrito
  const ehOutro = paraBusca(motivo) === 'outro';
  const motivoFinal = ehOutro ? outro.trim() || null : motivo || null;
  const pedeValor = ganho && para.obrigatorios.includes('valor');
  const dividido = porProduto.length > 0;
  // a etapa que pede o valor pede a mensalidade (não há venda só de ativação, 19/10); por produto, o total delas
  const semMensalidade = dividido ? (valor ?? null) === null : centavos === null;
  const falta = ganho ? (pedeValor && semMensalidade) || !valido || !ativValida : !motivoFinal;
  const diaOk = !!dia && dia <= hoje;
  const confirmar = async () => {
    if (falta || !diaOk || indo) { if (ehOutro && !outro.trim()) campoOutro.current?.focus(); return; }
    setIndo(true);
    try {
      await onConfirmar({
        motivoPerda: ganho ? null : motivoFinal, concluidoEm: dia === hoje ? null : dia,
        ...(ganho && !dividido && centavos !== (valor ?? null) ? { valor: centavos } : {}),
        ...(ganho && !dividido && ativ !== (ativacao ?? null) ? { ativacao: ativ } : {}),
      });
    } finally { setIndo(false); }
  };
  const mudancas = [
    valor != null && centavos !== null && centavos !== valor ? `a mensalidade muda de ${reais(valor)} para ${reais(centavos)}` : '',
    ativacao !== null && ativ !== null && ativ !== ativacao ? `a ativação muda de ${reais(ativacao)} para ${reais(ativ)}` : '',
  ].filter(Boolean).join(' e ');
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
            ? 'A negociação sai do funil e a mensalidade entra no ganho do mês (e no relatório de vendas). A ativação fica registrada.'
            : 'A negociação sai do funil. O motivo fica na negociação (e na planilha do Exportar).'}
        </p>
        {ganho && dividido ? (
          <div>
            <p className="text-[13px] font-medium text-ink-2 mb-1.5">Valor fechado (por produto)</p>
            <ValorPorProdutoLido linhas={porProduto} />
            <p className="text-[12px] text-muted mt-1.5">Os valores são os totais dos produtos. Se mudaram, mude os de cada produto na ficha antes de marcar.</p>
          </div>
        ) : ganho ? (
          <div className="grid grid-cols-2 gap-3 max-w-[440px]">
            <Campo label={pedeValor ? 'Mensalidade fechada' : 'Mensalidade (se quiser)'} erro={!valido ? 'Escreva como 1.200,00' : undefined}>
              <CampoValor id={idValor} centavos={centavos} autoFocus sufixo="/mês" onChange={(v, ok) => { setCentavos(v); setValido(ok); }} onEnter={confirmar} />
            </Campo>
            <Campo label="Ativação" erro={!ativValida ? 'Escreva como 1.500,00' : undefined}>
              <CampoValor id={idAtivacao} centavos={ativ} onChange={(v, ok) => { setAtiv(v); setAtivValida(ok); }} onEnter={confirmar} />
            </Campo>
          </div>
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
        {ganho && !dividido && mudancas && (
          <p className="text-[12.5px] text-muted">{mudancas.charAt(0).toUpperCase() + mudancas.slice(1)} (fica no histórico).</p>
        )}
      </div>
    </Modal>
  );
}
