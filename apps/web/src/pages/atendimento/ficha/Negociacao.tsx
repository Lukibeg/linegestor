/**
 * A negociação na ficha (o painel de Vendas, 2.0.1, decisão 0050), na coluna do lado, logo depois da
 * empresa: o valor — **Um valor só** ou **Por produto**, com o total (o pedido do Luan na prévia, em
 * 17/10); grava ao sair de cada campo — e, quando acabou, o Ganho ou o Perdido com o dia e o motivo da
 * perda, que dá para trocar (fica no histórico).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { HandCoins } from 'lucide-react';
import { campoLigado, linhasDoValorPorProduto, reais, somaDosProdutos, type ChamadoAlterarEntrada, type ValoresDosProdutos } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Spinner } from '../../../components/ui/index.js';
import { ChipResultado, dataCurta } from '../comum.js';
import { ValorDaNegociacao, ValorPorProdutoLido, type ModoDoValor } from '../venda.js';
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
  const { f, painel, pode, opcoes, cadastro } = useAberta();
  const valor = useAcao();
  const motivo = useAcao();
  const [rascunho, setRascunho] = useState<{ centavos: number | null; valido: boolean } | null>(null);
  // o valor de cada produto enquanto se escreve (grava ao sair do campo)
  const [rascunhos, setRascunhos] = useState<Record<string, { centavos: number | null; valido: boolean }>>({});
  const dividida = Object.keys(f.valoresDosProdutos).length > 0;
  const [modo, setModo] = useState<ModoDoValor>(dividida ? 'produto' : 'unico');
  // o valor por produto gravado (por esta tela ou por outra pessoa) mostra os produtos
  useEffect(() => { if (dividida) setModo('produto'); }, [dividida]);
  if (painel?.tipo !== 'vendas') return null;
  const podeDividir = campoLigado(painel.ajustes, 'produtos');
  const mudar = (a: ReturnType<typeof useAcao>, d: ChamadoAlterarEntrada, ok?: string) => a.rodar(() => api.atendimento.alterar(f.id, d), ok);
  const gravarValor = async () => {
    if (!rascunho) return;
    if (!rascunho.valido) { valor.setErro('Escreva o valor como 12.500,00.'); return; }
    if (rascunho.centavos === f.valor) { setRascunho(null); return; }
    const r = await mudar(valor, { valor: rascunho.centavos }, rascunho.centavos === null ? 'O valor saiu' : `Valor: ${reais(rascunho.centavos)}`);
    if (r.ok) setRascunho(null);
  };

  // ---------- por produto ----------
  const nomeDo = (id: string) => f.produtos.find((p) => p.id === id)?.nome ?? opcoes.produtos.find((p) => p.id === id)?.nome ?? 'o produto';
  const tirarRascunho = (id: string) => setRascunhos((x) => { const n = { ...x }; delete n[id]; return n; });
  // o que vale agora: o gravado com o que está sendo escrito por cima (o total acompanha a digitação)
  const valores: ValoresDosProdutos = { ...f.valoresDosProdutos };
  for (const [id, r] of Object.entries(rascunhos)) {
    if (!r.valido) continue;
    if (r.centavos === null) delete valores[id]; else valores[id] = r.centavos;
  }
  const gravarProduto = async (id: string) => {
    const r = rascunhos[id];
    if (!r) return;
    if (!r.valido) { valor.setErro(`Escreva o valor de ${nomeDo(id)} como 12.500,00.`); return; }
    if (r.centavos === (f.valoresDosProdutos[id] ?? null)) { tirarRascunho(id); return; }
    const novos = { ...f.valoresDosProdutos };
    if (r.centavos === null) delete novos[id]; else novos[id] = r.centavos;
    const total = somaDosProdutos(novos);
    const feito = await mudar(valor, { valoresDosProdutos: novos },
      `${r.centavos === null ? `${nomeDo(id)} ficou sem valor` : `${nomeDo(id)}: ${reais(r.centavos)}`}${total === null ? '' : ` (total ${reais(total)})`}`);
    if (feito.ok) tirarRascunho(id);
  };
  const incluir = (id: string) => void mudar(valor, { produtos: [...f.produtos.map((p) => p.id), id] }, `${nomeDo(id)} entrou na negociação`);
  const tirar = (id: string) => {
    tirarRascunho(id);
    void mudar(valor, { produtos: f.produtos.filter((p) => p.id !== id).map((p) => p.id) },
      f.valoresDosProdutos[id] !== undefined ? `${nomeDo(id)} saiu da negociação (com o valor dele)` : `${nomeDo(id)} saiu da negociação`);
  };
  const trocarModo = async (m: ModoDoValor) => {
    valor.limpar();
    if (m === 'produto' || !dividida) { setModo(m); setRascunhos({}); return; }
    // de volta ao valor único: o total fica como o valor da negociação
    const r = await mudar(valor, { valoresDosProdutos: {}, valor: f.valor }, f.valor === null ? 'O valor ficou um só' : `O valor ficou um só: ${reais(f.valor)}`);
    if (r.ok) { setModo('unico'); setRascunhos({}); }
  };
  const doCliente = new Set(cadastro?.produtos.map((p) => p.id) ?? []);
  const catalogo = opcoes.produtos.filter((p) => !f.produtos.some((x) => x.id === p.id))
    .map((p) => ({ id: p.id, nome: p.nome, dica: doCliente.has(p.id) ? 'do cliente' : undefined }))
    .sort((a, b) => Number(!!b.dica) - Number(!!a.dica));

  const motivos = painel.ajustes.motivosDePerda;
  const linhas = linhasDoValorPorProduto(f.produtos, f.valoresDosProdutos);
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
            // a chave refaz o campo do valor único quando o valor gravado muda (o que está escrito acompanha)
            <ValorDaNegociacao key={modo === 'unico' ? `u:${f.valor ?? ''}` : 'p'} id="ficha-valor" modo={modo} onModo={(m) => void trocarModo(m)} podeDividir={podeDividir}
              valor={f.valor} onValor={(c, ok) => { setRascunho({ centavos: c, valido: ok }); valor.limpar(); }} onSair={() => void gravarValor()}
              valores={valores} gravados={f.valoresDosProdutos} valorAntes={dividida ? null : f.valor}
              onValorDoProduto={(id, c, ok) => { setRascunhos((x) => ({ ...x, [id]: { centavos: c, valido: ok } })); valor.limpar(); }}
              onSairDoProduto={(id) => void gravarProduto(id)}
              produtos={f.produtos} catalogo={catalogo} onIncluir={incluir} onTirar={tirar} />
          ) : linhas.length ? <ValorPorProdutoLido linhas={linhas} /> : (
            <p className="font-display text-[19px] font-semibold tnum">{f.valor === null ? <span className="text-muted text-[14px] font-normal">—</span> : reais(f.valor)}</p>
          )}
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
