/**
 * O Simulador do Comercial (Patch 2.0.2, decisão 0052) — a lista das simulações. O pedido do Luan (20/10):
 * "uma ferramenta que vai ficar dentro da aba de comercial… a ferramenta de simulação", e a escolha dele na
 * página de opções: o Simulador no grupo Comercial do menu, com a lista das simulações, cada uma com nome e
 * guardada, "e atrelado a um card do comercial se eu quiser".
 *
 * Cada linha mostra o cenário principal: o que o cliente paga por mês, o que sobra, a margem com o sinal
 * (verde, amarelo, vermelho, pelas faixas dos Ajustes) e quando a venda se paga. A Nova simulação começa em
 * branco ou dos modelos marcados — quantos a pessoa quiser (o Luan, 20/10: "faça um multi seleção, que no caso
 * é uma proposta separada, porém uma negociação única"): os custos de todos, e cada produto com o seu preço.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calculator, FilePlus2, Link2, Plus, Search } from 'lucide-react';
import { paraBusca, textoDoSePagaEm, type ModeloDeSimulacao, type SimulacaoNaLista } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Pagina } from '../../../components/layout/AppShell.js';
import { Carregando, Popover, Vazio } from '../../../components/ui/index.js';
import { useAuth } from '../../../lib/auth.js';
import { AbasDoSimulador, CHAVE_DO_SIMULADOR, ChipDoSinal, erroDoSimulador, reaisLimpo, useOpcoesDoSimulador } from './comum.js';

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Quem não tem a permissão do Comercial (a tela e o menu já escondem; o endereço digitado cai aqui). */
export function SemOComercial() {
  return <Vazio titulo="O Simulador é de quem tem o Comercial" texto='Peça à administração o papel Comercial (ou a permissão "Ver o Comercial" no seu papel).' />;
}

/** O botão Nova simulação: em branco ou dos modelos marcados (um ou mais). */
export function NovaSimulacao({ modelos }: { modelos: ModeloDeSimulacao[] }) {
  const nav = useNavigate();
  const [marcados, setMarcados] = useState<string[]>([]);
  // os modelos vão na ordem da lista (o primeiro marcado não manda)
  const ir = (ids: string[]) => nav(`/comercial/simulador/nova${ids.length ? `?modelo=${ids.map(encodeURIComponent).join(',')}` : ''}`);
  const escolhidos = modelos.filter((m) => marcados.includes(m.id)).map((m) => m.id);
  if (!modelos.length) return <button type="button" className="btn-primary" onClick={() => ir([])} id="simulador-nova"><Plus size={16} /> Nova simulação</button>;
  return (
    <Popover classe="btn-primary" largura="w-[310px]" titulo="Nova simulação"
      botao={() => <span className="inline-flex items-center gap-1.5" id="simulador-nova"><Plus size={16} /> Nova simulação</span>}>
      <div className="p-1.5 flex flex-col" id="simulador-nova-opcoes">
        <div className="eyebrow px-2 pt-1">Os produtos da venda</div>
        <p className="px-2 pb-1.5 text-[12px] text-muted">Marque um ou mais. A simulação começa com os custos de todos, e cada produto tem o seu preço: a proposta de cada um, numa negociação só.</p>
        {modelos.map((m) => (
          <label key={m.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-sm cursor-pointer select-none" data-modelo={m.id}>
            <input type="checkbox" className="mt-1" checked={marcados.includes(m.id)}
              onChange={(e) => setMarcados((x) => (e.target.checked ? [...x, m.id] : x.filter((y) => y !== m.id)))} />
            <span className="min-w-0">
              <span className="font-semibold">{m.nome}</span>
              <span className="block text-[12px] text-muted">{m.linhas.length} {m.linhas.length === 1 ? 'custo' : 'custos'} da tabela</span>
            </span>
          </label>
        ))}
        <div className="border-t border-line mt-1 pt-1.5 px-1 flex items-center justify-between gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => ir([])} data-modelo="">
            <FilePlus2 size={15} className="text-muted" /> Em branco
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!escolhidos.length} onClick={() => ir(escolhidos)} id="simulador-nova-comecar">
            {escolhidos.length > 1 ? `Começar com os ${escolhidos.length}` : 'Começar'}
          </button>
        </div>
      </div>
    </Popover>
  );
}

/** A negociação ligada, curta: "COM-31 · Padaria Estrela" (com o ganho ou a perda). */
export function ChipDaNegociacao({ s }: { s: Pick<SimulacaoNaLista, 'negociacao' | 'negociacaoOculta'> }) {
  if (s.negociacaoOculta) return <span className="chip bg-surface-2 text-muted" title="Ligada a uma negociação de um painel que você não vê"><Link2 size={12} aria-hidden /> negociação de outro painel</span>;
  if (!s.negociacao) return null;
  const n = s.negociacao;
  return (
    <Link to={`/atendimento/${encodeURIComponent(n.codigo)}`} className="chip bg-surface-2 text-ink-2 hover:text-accent max-w-full" title={`${n.codigo} · ${n.titulo}`} onClick={(e) => e.stopPropagation()}>
      <Link2 size={12} aria-hidden /><span className="font-mono">{n.codigo}</span>
      {n.empresa && <span className="truncate font-normal">· {n.empresa}</span>}
      {n.resultado && <span className={`font-semibold ${n.resultado === 'ganho' ? 'text-ok' : 'text-bad'}`}>· {n.resultado}</span>}
    </Link>
  );
}

export function SimuladorLista() {
  const { can } = useAuth();
  const op = useOpcoesDoSimulador();
  const lista = useQuery({ queryKey: [...CHAVE_DO_SIMULADOR, 'lista'], queryFn: () => api.simulador.listar(), enabled: can('sales.read') });
  const [busca, setBusca] = useState('');
  const nav = useNavigate();
  const itens = useMemo(() => {
    const q = paraBusca(busca);
    const todos = lista.data ?? [];
    if (!q) return todos;
    return todos.filter((s) => paraBusca(`${s.nome} ${s.negociacao?.codigo ?? ''} ${s.negociacao?.empresa ?? ''} ${s.negociacao?.titulo ?? ''}`).includes(q));
  }, [lista.data, busca]);
  if (!can('sales.read')) return <SemOComercial />;
  const podeEditar = !!op.data?.podeEditar;

  return (
    <Pagina titulo="Simulador" sub="A conta de cada venda antes de fechar: o que o cliente paga contra o que a Ingline gasta."
      acoes={podeEditar && op.data ? <NovaSimulacao modelos={op.data.ajustes.modelos} /> : undefined}>
      <AbasDoSimulador atual="simulacoes" podeCuidar={!!op.data?.podeCuidar} />
      {lista.isLoading || op.isLoading ? <Carregando /> : lista.isError ? <p className="text-bad text-sm" role="alert">{erroDoSimulador(lista.error)}</p> : !(lista.data ?? []).length ? (
        <Vazio titulo="Nenhuma simulação ainda"
          texto="Ponha a mensalidade e a ativação que quer cobrar e os custos (os aparelhos, a nuvem, as comissões): o Simulador diz quanto sobra por mês, a margem e quando a venda se paga."
          acao={podeEditar && op.data ? <NovaSimulacao modelos={op.data.ajustes.modelos} /> : undefined} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
            <input className="input pl-9" placeholder="Procurar pelo nome, o código ou a empresa" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Procurar simulação" id="simulador-busca" />
          </div>
          {!itens.length ? <p className="text-muted text-sm">Nada com "{busca}".</p> : (
            <>
              {/* no computador, uma tabela; no celular, um cartão por simulação */}
              <div className="card overflow-x-auto hidden md:block">
                <table className="w-full text-sm" id="simulador-lista">
                  <thead>
                    <tr className="text-left text-[12px] text-muted border-b border-line whitespace-nowrap">
                      <th className="font-semibold px-4 py-2.5">Simulação</th>
                      <th className="font-semibold px-3 py-2.5 text-right">O cliente paga</th>
                      <th className="font-semibold px-3 py-2.5 text-right">Sobra por mês</th>
                      <th className="font-semibold px-3 py-2.5">Margem</th>
                      <th className="font-semibold px-3 py-2.5">Se paga</th>
                      <th className="font-semibold px-4 py-2.5">Mexida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((s) => (
                      <tr key={s.id} className="border-b border-line last:border-0 hover:bg-surface-2/60 cursor-pointer" onClick={() => nav(`/comercial/simulador/${s.id}`)} data-simulacao={s.id}>
                        <td className="px-4 py-3 align-top min-w-0">
                          <Link to={`/comercial/simulador/${s.id}`} className="font-semibold text-ink hover:text-accent" onClick={(e) => e.stopPropagation()}>{s.nome}</Link>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[12px] text-muted">
                            <ChipDaNegociacao s={s} />
                            <span>{s.cenarios === 1 ? '1 cenário' : `${s.cenarios} cenários · o principal: ${s.principal.nome}`}</span>
                            {s.principal.faltam > 0 && <span className="text-signal font-semibold">· faltam {s.principal.faltam} {s.principal.faltam === 1 ? 'valor' : 'valores'}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top text-right tabular-nums whitespace-nowrap">
                          {reaisLimpo(s.principal.mensalTotal)}<span className="text-muted text-[12px]">/mês</span>
                          {s.principal.entradaTotal > 0 && <div className="text-[12px] text-muted">+ {reaisLimpo(s.principal.entradaTotal)} de ativação</div>}
                        </td>
                        <td className={`px-3 py-3 align-top text-right tabular-nums whitespace-nowrap font-semibold ${s.principal.sobraMensal < 0 ? 'text-bad' : ''}`}>{reaisLimpo(s.principal.sobraMensal)}</td>
                        <td className="px-3 py-3 align-top"><ChipDoSinal sinal={s.principal.sinal} margem={s.principal.margem} /></td>
                        <td className={`px-3 py-3 align-top whitespace-nowrap ${s.principal.sePagaEm.tipo === 'nunca' || (s.principal.sePagaEm.tipo === 'mes' && s.principal.sePagaEm.depoisDoPrazo) ? 'text-bad' : ''}`}>{textoDoSePagaEm(s.principal.sePagaEm)}</td>
                        <td className="px-4 py-3 align-top text-[12.5px] text-muted whitespace-nowrap">{quando(s.alteradoEm)}{s.alteradoPor && <div>{s.alteradoPor}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col gap-2 md:hidden">
                {itens.map((s) => (
                  <li key={s.id}>
                    <Link to={`/comercial/simulador/${s.id}`} className="card p-3.5 flex flex-col gap-2 hover:border-line-strong">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-ink min-w-0">{s.nome}</span>
                        <ChipDoSinal sinal={s.principal.sinal} margem={s.principal.margem} curto />
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 text-[13px]">
                        <span className="text-muted">O cliente paga</span><span className="text-right tabular-nums">{reaisLimpo(s.principal.mensalTotal)}/mês</span>
                        <span className="text-muted">Sobra por mês</span><span className={`text-right tabular-nums font-semibold ${s.principal.sobraMensal < 0 ? 'text-bad' : ''}`}>{reaisLimpo(s.principal.sobraMensal)}</span>
                        <span className="text-muted">Se paga</span><span className="text-right">{textoDoSePagaEm(s.principal.sePagaEm)}</span>
                      </div>
                      {(s.negociacao || s.negociacaoOculta) && <div className="min-w-0"><ChipDaNegociacao s={s} /></div>}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-[12.5px] text-muted flex items-center gap-1.5"><Calculator size={13} aria-hidden /> Cada linha mostra o cenário principal. O sinal sai das faixas dos Ajustes.</p>
        </div>
      )}
    </Pagina>
  );
}
