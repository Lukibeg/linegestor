/**
 * A negociação na ficha (o painel de Vendas, 2.0.1, decisão 0050), na coluna do lado, logo depois da
 * empresa: o valor — a **mensalidade** (o que conta no quadro, no relatório e na meta) e a **ativação**
 * (à parte), cada uma única ou **por produto**, com os totais (os pedidos do Luan na prévia, em 17/10);
 * grava ao sair de cada campo — e, quando acabou, o Ganho ou o Perdido com o dia e o motivo da perda, que
 * dá para trocar (fica no histórico).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { HandCoins } from 'lucide-react';
import { campoLigado, reais, somaDosProdutos, type ChamadoAlterarEntrada, type ValoresDosProdutos } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Spinner } from '../../../components/ui/index.js';
import { ChipResultado, dataCurta } from '../comum.js';
import { SO_A_MENSALIDADE_CONTA, ValorDaNegociacao, ValorPorProdutoLido, linhasDoValor, type ModoDoValor, type ParteDoValor } from '../venda.js';
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

/** O que está escrito num campo (ainda não gravado). */
type Rascunho = { centavos: number | null; valido: boolean };
/** As duas partes do valor: a mensalidade (o que conta) e a ativação (à parte). */
type Parte = 'mensalidade' | 'ativacao';
const NOME: Record<Parte, string> = { mensalidade: 'mensalidade', ativacao: 'ativação' };
const SUFIXO: Record<Parte, string> = { mensalidade: '/mês', ativacao: '' };

export function Negociacao() {
  const { f, painel, pode, opcoes, cadastro } = useAberta();
  const valor = useAcao();
  const motivo = useAcao();
  // o que está sendo escrito (grava ao sair do campo): a única de cada parte e a de cada produto
  const [unicos, setUnicos] = useState<Partial<Record<Parte, Rascunho>>>({});
  const [rascunhos, setRascunhos] = useState<Record<Parte, Record<string, Rascunho>>>({ mensalidade: {}, ativacao: {} });
  const dividida = Object.keys(f.valoresDosProdutos).length > 0 || Object.keys(f.ativacoesDosProdutos).length > 0;
  const [modo, setModo] = useState<ModoDoValor>(dividida ? 'produto' : 'unico');
  // o valor por produto gravado (por esta tela ou por outra pessoa) mostra os produtos
  useEffect(() => { if (dividida) setModo('produto'); }, [dividida]);
  if (painel?.tipo !== 'vendas') return null;
  const podeDividir = campoLigado(painel.ajustes, 'produtos');
  const mudar = (a: ReturnType<typeof useAcao>, d: ChamadoAlterarEntrada, ok?: string) => a.rodar(() => api.atendimento.alterar(f.id, d), ok);
  const gravado = (k: Parte) => (k === 'mensalidade' ? f.valor : f.ativacao);
  const gravadosDosProdutos = (k: Parte) => (k === 'mensalidade' ? f.valoresDosProdutos : f.ativacoesDosProdutos);
  const nomeDo = (id: string) => f.produtos.find((p) => p.id === id)?.nome ?? opcoes.produtos.find((p) => p.id === id)?.nome ?? 'o produto';

  // ---------- a única ----------
  const gravarUnico = async (k: Parte) => {
    const r = unicos[k];
    if (!r) return;
    if (!r.valido) { valor.setErro(`Escreva a ${NOME[k]} como 1.200,00.`); return; }
    const limpar = () => setUnicos((x) => ({ ...x, [k]: undefined }));
    if (r.centavos === gravado(k)) { limpar(); return; }
    const res = await mudar(valor, k === 'mensalidade' ? { valor: r.centavos } : { ativacao: r.centavos },
      r.centavos === null ? `A ${NOME[k]} saiu` : `${k === 'mensalidade' ? 'Mensalidade' : 'Ativação'}: ${reais(r.centavos)}${SUFIXO[k]}`);
    if (res.ok) limpar();
  };

  // ---------- por produto ----------
  const tirarRascunho = (k: Parte, id: string) => setRascunhos((x) => { const n = { ...x[k] }; delete n[id]; return { ...x, [k]: n }; });
  // o que vale agora: o gravado com o que está sendo escrito por cima (os totais acompanham a digitação)
  const valoresDe = (k: Parte): ValoresDosProdutos => {
    const v = { ...gravadosDosProdutos(k) };
    for (const [id, r] of Object.entries(rascunhos[k])) {
      if (!r.valido) continue;
      if (r.centavos === null) delete v[id]; else v[id] = r.centavos;
    }
    return v;
  };
  const gravarProduto = async (k: Parte, id: string) => {
    const r = rascunhos[k][id];
    if (!r) return;
    if (!r.valido) { valor.setErro(`Escreva a ${NOME[k]} de ${nomeDo(id)} como 1.200,00.`); return; }
    const antes = gravadosDosProdutos(k);
    if (r.centavos === (antes[id] ?? null)) { tirarRascunho(k, id); return; }
    const novos = { ...antes };
    if (r.centavos === null) delete novos[id]; else novos[id] = r.centavos;
    const total = somaDosProdutos(novos);
    const feito = await mudar(valor, k === 'mensalidade' ? { valoresDosProdutos: novos } : { ativacoesDosProdutos: novos },
      `${nomeDo(id)}: ${r.centavos === null ? `sem ${NOME[k]}` : `${NOME[k]} de ${reais(r.centavos)}${SUFIXO[k]}`}${total === null ? '' : ` (total ${reais(total)}${SUFIXO[k]})`}`);
    if (feito.ok) tirarRascunho(k, id);
  };
  const incluir = (id: string) => void mudar(valor, { produtos: [...f.produtos.map((p) => p.id), id] }, `${nomeDo(id)} entrou na negociação`);
  const tirar = (id: string) => {
    tirarRascunho('mensalidade', id);
    tirarRascunho('ativacao', id);
    const tinhaValor = f.valoresDosProdutos[id] !== undefined || f.ativacoesDosProdutos[id] !== undefined;
    void mudar(valor, { produtos: f.produtos.filter((p) => p.id !== id).map((p) => p.id) },
      tinhaValor ? `${nomeDo(id)} saiu da negociação (com os valores dele)` : `${nomeDo(id)} saiu da negociação`);
  };
  const trocarModo = async (m: ModoDoValor) => {
    valor.limpar();
    if (m === 'produto' || !dividida) { setModo(m); setRascunhos({ mensalidade: {}, ativacao: {} }); return; }
    // de volta ao valor único: os totais ficam como a mensalidade e a ativação da negociação
    const r = await mudar(valor, { valoresDosProdutos: {}, valor: f.valor, ativacoesDosProdutos: {}, ativacao: f.ativacao },
      f.valor === null ? 'O valor ficou um só' : `O valor ficou um só: ${reais(f.valor)}/mês`);
    if (r.ok) { setModo('unico'); setRascunhos({ mensalidade: {}, ativacao: {} }); }
  };
  const parte = (k: Parte): ParteDoValor => ({
    valor: gravado(k), gravado: gravado(k),
    onValor: (c, ok) => { setUnicos((x) => ({ ...x, [k]: { centavos: c, valido: ok } })); valor.limpar(); },
    onSair: () => void gravarUnico(k),
    valores: valoresDe(k), gravados: gravadosDosProdutos(k),
    onValorDoProduto: (id, c, ok) => { setRascunhos((x) => ({ ...x, [k]: { ...x[k], [id]: { centavos: c, valido: ok } } })); valor.limpar(); },
    onSairDoProduto: (id) => void gravarProduto(k, id),
  });
  const doCliente = new Set(cadastro?.produtos.map((p) => p.id) ?? []);
  const catalogo = opcoes.produtos.filter((p) => !f.produtos.some((x) => x.id === p.id))
    .map((p) => ({ id: p.id, nome: p.nome, dica: doCliente.has(p.id) ? 'do cliente' : undefined }))
    .sort((a, b) => Number(!!b.dica) - Number(!!a.dica));

  const motivos = painel.ajustes.motivosDePerda;
  const linhas = linhasDoValor(f.produtos, f.valoresDosProdutos, f.ativacoesDosProdutos);
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
            <ValorDaNegociacao id="ficha-valor" modo={modo} onModo={(m) => void trocarModo(m)} podeDividir={podeDividir}
              mensalidade={parte('mensalidade')} ativacao={parte('ativacao')} valorAntes={dividida ? null : f.valor}
              produtos={f.produtos} catalogo={catalogo} onIncluir={incluir} onTirar={tirar} />
          ) : linhas.length ? <ValorPorProdutoLido linhas={linhas} /> : (
            <div className="flex flex-col gap-0.5">
              <p className="font-display text-[19px] font-semibold tnum">{f.valor === null ? <span className="text-muted text-[14px] font-normal">sem mensalidade</span> : <>{reais(f.valor)}<span className="text-[12px] font-normal text-muted">/mês</span></>}</p>
              <p className="text-[13px] text-ink-2 tnum">Ativação: {f.ativacao === null ? '—' : reais(f.ativacao)}</p>
              <p className="text-[12px] text-muted">{SO_A_MENSALIDADE_CONTA}</p>
            </div>
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
