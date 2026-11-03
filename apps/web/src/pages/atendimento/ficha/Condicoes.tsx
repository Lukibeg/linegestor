/**
 * AS CONDIÇÕES ESPECIAIS da negociação (Patch 2.4; refeitas no 2.4.1), na coluna do lado, logo abaixo da negociação. O pedido do
 * Luan (31/10): "preciso que haja uma área destinada a negociação, por exemplo esse cliente aqui eu concedi um desconto de 200
 * reais até março do ano que vem, além disso a ativação só vai ser paga a partir de março tbm e dividida em 6 vezes". E no
 * 2.4.1 (03/11): "n precisa ter o de, pq subentendesse que vai ser a partir do primeiro mes de faturameno que é quando eu marco
 * cmo ganho, se eu quiser fornecer um desconto sem prazo, temq ter essa opção tbm, a ativação tbm n ficou legal o formato, se dar
 * um desconto na aticvação? e o nome tem q ser condições especiais".
 *
 *  - o cartão: a mensalidade (os descontos, um depois do outro, até um mês ou sem prazo), a ativação (o desconto, o que fica,
 *    em quantas vezes e quando começa) e a observação;
 *  - **Como fica a cobrança**: mês a mês, do 1º mês de faturamento (o mês do Ganho; antes dele, o de hoje, de exemplo);
 *  - o **Combinar** (ou **Mudar**) abre a janela, que mostra a cobrança enquanto se escreve.
 *
 * As contas são as do `@gestor/shared` (negociacao.ts): as mesmas no servidor e na prévia. O valor da negociação não muda: a
 * mensalidade e a ativação continuam as que contam no quadro, na meta e no relatório.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { CalendarClock, Handshake, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  ativacaoAPagar, cobrancaMesAMes, mesEscrito, mesesDosDescontos, primeiroMesDeFaturamento, reais,
  MAX_DESCONTOS_DA_NEGOCIACAO, MAX_VEZES_DA_ATIVACAO_COMBINADA, NOME_CONDICOES,
  type AtivacaoCombinada, type CondicoesDaNegociacao, type CondicoesDaNegociacaoEntrada, type DescontoDaNegociacao, type MesDaCobranca,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Modal, Spinner, mensagemErro } from '../../../components/ui/index.js';
import { useDepoisDeMudar } from '../comum.js';
import { CampoValor } from '../venda.js';
import { Secao, useAberta } from './base.js';

/** O título pequeno de cada parte (Mensalidade, Ativação). */
const Parte = ({ children }: { children: ReactNode }) => <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</div>;

/** De onde a conta começa: o mês do Ganho, ou (antes dele) o de hoje, de exemplo. */
function textoDoPrimeiroMes(p: { mes: string; doGanho: boolean }): string {
  return p.doGanho
    ? `A partir de ${mesEscrito(p.mes)}, o mês do Ganho (o 1º mês de faturamento).`
    : `Contando de ${mesEscrito(p.mes)}, este mês, de exemplo: quando a negociação for Ganho, a conta começa no mês do Ganho.`;
}

/** Em quantas vezes e quando: "em 6× de R$ 500,00 · a partir de mar/2027" / "à vista · no 1º mês". */
function quandoDaAtivacao(a: AtivacaoCombinada | null, parcela: number | null): ReactNode {
  const vezes = a?.vezes ?? 1;
  return <>
    {vezes > 1 ? <>em <b className="tnum">{vezes}×</b>{parcela !== null && <span className="tnum"> de {reais(parcela)}</span>}</> : 'à vista'}
    <span className="text-muted"> · </span>
    {a?.aPartirDe ? <>{vezes > 1 ? 'a partir de' : 'em'} <b>{mesEscrito(a.aPartirDe)}</b></> : 'no 1º mês'}
  </>;
}

export function CondicoesDaNegociacao() {
  const { f, painel, pode } = useAberta();
  const [editando, setEditando] = useState(false);
  const [verMeses, setVerMeses] = useState(false);
  const c = f.condicoes;
  const primeiro = primeiroMesDeFaturamento(f);
  const meses = useMemo(() => (c ? cobrancaMesAMes({ mensalidade: f.valor, ativacao: f.ativacao, condicoes: c, desde: primeiro.mes }) : []), [c, f.valor, f.ativacao, primeiro.mes]);
  if (painel?.tipo !== 'vendas') return null;
  // sem nada combinado e sem poder mexer, o cartão não aparece
  if (!c && !pode) return null;
  const conta = ativacaoAPagar(f.ativacao, c?.ativacao ?? null);
  return (
    <Secao titulo={NOME_CONDICOES} icone={<Handshake size={16} />} id="ficha-condicoes"
      acoes={pode && (
        <button type="button" className="btn-ghost btn-sm -my-1" id="ficha-condicoes-mudar" onClick={() => setEditando(true)}>
          {c ? <><Pencil size={14} /> Mudar</> : <><Plus size={14} /> Combinar</>}
        </button>
      )}>
      {!c ? (
        <p className="text-[13px] text-muted">Nada combinado além do valor. Um desconto na mensalidade (com prazo ou sem), um desconto na ativação, a ativação em vezes ou mais tarde: <b className="font-semibold text-ink-2">Combinar</b>.</p>
      ) : (
        <div className="flex flex-col gap-3 text-[13.5px]" id="ficha-condicoes-lista">
          {c.descontos.length > 0 && (
            <div className="flex flex-col gap-1">
              <Parte>Mensalidade</Parte>
              {c.descontos.map((d, i) => (
                <div key={i} data-desconto="">
                  {i > 0 && <span className="text-muted">depois </span>}
                  <b className="tnum text-ok">−{reais(d.valor)}</b>/mês <span className="text-muted">·</span> {d.ate ? <>até <b>{mesEscrito(d.ate)}</b></> : <b>sem prazo</b>}
                </div>
              ))}
            </div>
          )}
          {c.ativacao && (
            <div className="flex flex-col gap-1" id="ficha-condicoes-ativacao">
              <Parte>Ativação</Parte>
              {f.ativacao === null ? (
                <div>
                  {c.ativacao.desconto ? <><b className="tnum text-ok">−{reais(c.ativacao.desconto)}</b> de desconto <span className="text-muted">·</span> </> : null}
                  {quandoDaAtivacao(c.ativacao, null)}
                  <div className="text-[12px] text-muted">A negociação ainda não tem o valor da ativação.</div>
                </div>
              ) : (
                <>
                  <div className="tnum">
                    {conta.desconto > 0
                      ? <><span className="text-muted line-through">{reais(conta.valor)}</span> <b className="text-ok">−{reais(conta.desconto)}</b> <span className="text-muted">=</span> <b>{reais(conta.aPagar)}</b></>
                      : <b>{reais(conta.valor)}</b>}
                  </div>
                  <div>{conta.aPagar > 0 ? quandoDaAtivacao(c.ativacao, conta.parcela) : <span className="text-ok font-semibold">sem cobrar a ativação</span>}</div>
                </>
              )}
            </div>
          )}
          {c.observacao && <p className="text-ink-2 whitespace-pre-wrap break-words border-l-2 border-line pl-2.5">{c.observacao}</p>}
          {meses.length > 0 && (c.descontos.length > 0 || c.ativacao) && (
            <div>
              {/* numa janela: a coluna do lado é estreita demais para a tabela */}
              <button type="button" className="btn-ghost btn-sm -ml-2 text-[12.5px]" id="ficha-condicoes-ver-meses" onClick={() => setVerMeses(true)}>
                <CalendarClock size={14} /> Como fica a cobrança <span className="text-muted font-normal">({meses.length} meses)</span>
              </button>
              {verMeses && (
                <Modal open onClose={() => setVerMeses(false)} largura="max-w-2xl" titulo={`Como fica a cobrança — ${f.codigo}`}>
                  <p className="text-[13px] text-ink-2 mb-2">{textoDoPrimeiroMes(primeiro)}</p>
                  <CobrancaMesAMes meses={meses} vezes={conta.vezes} semPrazo={c.descontos.some((d) => d.ate === null)} />
                </Modal>
              )}
            </div>
          )}
        </div>
      )}
      {editando && <JanelaDasCondicoes onFechar={() => setEditando(false)} />}
    </Secao>
  );
}

/** A cobrança mês a mês, uma coluna para cada coisa: a mensalidade, o desconto, a parcela da ativação e o total do mês. */
function CobrancaMesAMes({ meses, vezes, semPrazo, id = 'ficha-condicoes-meses' }: { meses: MesDaCobranca[]; vezes: number; semPrazo: boolean; id?: string }) {
  const th = 'font-semibold px-2.5 py-1.5 whitespace-nowrap';
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[12.5px] tnum" id={id}>
          <thead>
            <tr className="text-ink-2 bg-surface-2">
              <th className={`text-left ${th}`}>Mês</th>
              <th className={`!text-right ${th}`}>Mensalidade</th>
              <th className={`!text-right ${th}`}>Desconto</th>
              <th className={`!text-right ${th}`}>Ativação</th>
              <th className={`!text-right ${th}`}>Total do mês</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m, i) => (
              <tr key={m.mes} className="border-t border-line" data-mes={m.mes}>
                <td className="px-2.5 py-1.5 whitespace-nowrap">{mesEscrito(m.mes)}{i === 0 && <span className="ml-1.5 text-[11px] text-muted">1º mês</span>}</td>
                <td className="px-2.5 py-1.5 text-right whitespace-nowrap text-ink-2">{reais(m.mensalidade)}</td>
                <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{m.desconto > 0 ? <span className="text-ok">−{reais(m.desconto)}</span> : <span className="text-muted">—</span>}</td>
                <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                  {m.parcela ? <>{reais(m.ativacao)} <span className="text-[11px] text-muted">{vezes > 1 ? `${m.parcela}/${vezes}` : 'à vista'}</span></> : <span className="text-muted">—</span>}
                </td>
                <td className="px-2.5 py-1.5 text-right font-semibold whitespace-nowrap">{reais(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {semPrazo && <p className="text-[12px] text-muted mt-1.5">O desconto sem prazo continua nos meses seguintes.</p>}
    </>
  );
}

type DescontoRascunho = { chave: number; valor: number | null; valido: boolean; ate: string; semPrazo: boolean };
let sequencia = 0;

/** A janela do Combinar: os descontos na mensalidade, a ativação, a observação — e a cobrança mês a mês enquanto se escreve. */
function JanelaDasCondicoes({ onFechar }: { onFechar: () => void }) {
  const { f } = useAberta();
  const depois = useDepoisDeMudar();
  const c: CondicoesDaNegociacao | null = f.condicoes;
  const primeiro = primeiroMesDeFaturamento(f);
  const [descontos, setDescontos] = useState<DescontoRascunho[]>(() => (c?.descontos ?? []).map((d) => ({ chave: ++sequencia, valor: d.valor, valido: true, ate: d.ate ?? '', semPrazo: d.ate === null })));
  const [descontoAtivacao, setDescontoAtivacao] = useState<{ valor: number | null; valido: boolean }>({ valor: c?.ativacao?.desconto ?? null, valido: true });
  const [vezes, setVezes] = useState(c?.ativacao?.vezes ?? 1);
  const [outroMes, setOutroMes] = useState(!!c?.ativacao?.aPartirDe);
  const [aPartirDe, setAPartirDe] = useState(c?.ativacao?.aPartirDe ?? '');
  const [observacao, setObservacao] = useState(c?.observacao ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  // os descontos que já dá para contar (o que ainda não está certo fica de fora da cobrança enquanto se escreve)
  const descontosProntos: DescontoDaNegociacao[] = descontos
    .filter((d) => d.valido && d.valor && (d.semPrazo || d.ate))
    .map((d) => ({ valor: d.valor!, ate: d.semPrazo ? null : d.ate }));
  const faixas = mesesDosDescontos(descontos.map((d) => ({ valor: d.valor ?? 0, ate: d.semPrazo ? null : d.ate || null })), primeiro.mes);
  const ativacao: AtivacaoCombinada = { desconto: descontoAtivacao.valido ? descontoAtivacao.valor : null, vezes, aPartirDe: outroMes && aPartirDe ? aPartirDe : null };
  const conta = ativacaoAPagar(f.ativacao, ativacao);

  const montar = (): CondicoesDaNegociacaoEntrada | string => {
    for (const [i, d] of descontos.entries()) {
      if (!d.valido || !d.valor) return 'Escreva o valor de cada desconto (como 200,00), ou tire o que ficou vazio.';
      if (!d.semPrazo && !d.ate) return 'Escolha até que mês vai cada desconto, ou marque Sem prazo.';
      const antes = descontos[i - 1];
      if (antes && !antes.semPrazo && !d.semPrazo && d.ate <= antes.ate) return `Cada desconto termina depois do anterior: o ${i + 1}º vai além de ${mesEscrito(antes.ate)}.`;
    }
    if (!descontoAtivacao.valido) return 'Escreva o desconto da ativação (como 500,00), ou deixe vazio.';
    if (f.ativacao !== null && (descontoAtivacao.valor ?? 0) > f.ativacao) return `O desconto da ativação passa do valor dela (${reais(f.ativacao)}).`;
    if (outroMes && !aPartirDe) return 'Escolha o mês em que a ativação começa a ser paga.';
    return {
      descontos: descontos.map((d) => ({ valor: d.valor!, ate: d.semPrazo ? null : d.ate })),
      ativacao,
      observacao: observacao.trim() || null,
    };
  };
  const pronto = montar();
  const previa = useMemo(() => {
    const cond: CondicoesDaNegociacao = { descontos: descontosProntos, ativacao, observacao: null };
    return cobrancaMesAMes({ mensalidade: f.valor, ativacao: f.ativacao, condicoes: cond, desde: primeiro.mes });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(descontosProntos), ativacao.desconto, ativacao.vezes, ativacao.aPartirDe, f.valor, f.ativacao, primeiro.mes]);
  const temPrevia = (descontosProntos.length > 0 || conta.aPagar > 0) && (f.valor !== null || f.ativacao !== null);

  const gravar = async (condicoes: CondicoesDaNegociacaoEntrada | null) => {
    setSalvando(true); setErro('');
    try {
      await depois(api.atendimento.alterar(f.id, { condicoes }), condicoes ? 'As condições especiais foram salvas' : 'As condições especiais saíram');
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };
  const mudar = (chave: number, o: Partial<DescontoRascunho>) => { setDescontos((xs) => xs.map((x) => (x.chave === chave ? { ...x, ...o } : x))); setErro(''); };
  const ultimoSemPrazo = descontos.at(-1)?.semPrazo ?? false;
  const opcoesDeVezes = Array.from({ length: MAX_VEZES_DA_ATIVACAO_COMBINADA }, (_, i) => i + 1);

  return (
    <Modal open onClose={onFechar} largura="max-w-2xl" titulo={`${NOME_CONDICOES} — ${f.codigo}`}
      rodape={<>
        {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1" role="alert" id="condicoes-erro">{erro}</p>}
        {c && <button type="button" className="btn-ghost text-bad mr-auto" id="condicoes-tirar" disabled={salvando} onClick={() => void gravar(null)}><Trash2 size={14} /> Tirar as condições</button>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" id="condicoes-salvar" disabled={salvando}
          onClick={() => (typeof pronto === 'string' ? setErro(pronto) : void gravar(pronto))}>{salvando ? <Spinner className="text-white" /> : 'Salvar'}</button>
      </>}>
      <form autoComplete="off" className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
        {/* o que é da negociação (não muda aqui) e de onde a conta começa */}
        <dl className="rounded-lg bg-surface-2 px-3 py-2 grid grid-cols-1 gap-y-1 sm:grid-cols-3 sm:gap-x-4" id="condicoes-base">
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <dt className="text-[12px] text-muted">Mensalidade</dt>
            <dd className="font-semibold tnum">{f.valor === null ? <span className="text-muted font-normal">sem valor ainda</span> : <>{reais(f.valor)}<span className="text-muted font-normal text-[12px]">/mês</span></>}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <dt className="text-[12px] text-muted">Ativação</dt>
            <dd className="font-semibold tnum">{f.ativacao === null ? <span className="text-muted font-normal">sem valor ainda</span> : reais(f.ativacao)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <dt className="text-[12px] text-muted">1º mês de faturamento</dt>
            <dd className="font-semibold text-right sm:text-left">{mesEscrito(primeiro.mes)} <span className="text-muted font-normal text-[12px] whitespace-nowrap">{primeiro.doGanho ? '(o mês do Ganho)' : '(se for Ganho este mês)'}</span></dd>
          </div>
        </dl>

        <fieldset className="flex flex-col gap-2" id="condicoes-descontos">
          <legend className="label mb-0">Desconto na mensalidade</legend>
          <p className="text-[12.5px] text-muted -mt-1">Começa no 1º mês de faturamento. Com mais de um, cada um começa quando o anterior acaba.</p>
          {descontos.map((d, i) => {
            const faixa = faixas[i]!;
            const ultimo = i === descontos.length - 1;
            const acabaAntes = !d.semPrazo && !!d.ate && d.ate < faixa.de;
            return (
              <div key={d.chave} className="rounded-lg border border-line p-2.5 flex flex-col gap-1.5" data-desconto="">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-ink-2">{i === 0 ? 'Desconto' : `Depois, o ${i + 1}º desconto`}</span>
                  <button type="button" className="btn-ghost btn-sm -my-1 text-muted hover:text-bad" aria-label="Tirar este desconto" title="Tirar este desconto"
                    onClick={() => setDescontos((xs) => xs.filter((x) => x.chave !== d.chave))}><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div className="min-w-0 col-span-2 sm:col-span-1">
                    <span className="text-[12px] text-muted">Por mês</span>
                    <CampoValor centavos={d.valor} sufixo="/mês" rotulo="Desconto por mês" onChange={(v, ok) => mudar(d.chave, { valor: v, valido: ok })} />
                  </div>
                  <label className="min-w-0">
                    <span className="text-[12px] text-muted">Até o mês</span>
                    {d.semPrazo
                      ? <div className="input bg-surface-2 text-muted select-none" aria-label="O desconto não tem prazo">sem prazo</div>
                      : <input type="month" className="input" value={d.ate} onChange={(e) => mudar(d.chave, { ate: e.target.value })} aria-label="O último mês com o desconto" />}
                  </label>
                  {ultimo ? (
                    <label className="self-end flex items-center gap-2 py-2 text-[13px] cursor-pointer whitespace-nowrap">
                      <input type="checkbox" className="accent-[var(--accent)]" checked={d.semPrazo} data-sem-prazo=""
                        onChange={(e) => mudar(d.chave, { semPrazo: e.target.checked })} />
                      Sem prazo
                    </label>
                  ) : <span aria-hidden />}
                </div>
                <p className={`text-[12px] ${acabaAntes ? 'text-bad' : 'text-muted'}`} data-faixa="">
                  {acabaAntes ? `Acaba antes de começar (${mesEscrito(faixa.de)}).`
                    : d.semPrazo ? <>De {mesEscrito(faixa.de)} em diante, sem prazo</>
                    : d.ate ? <>De {mesEscrito(faixa.de)} a {mesEscrito(d.ate)} · {faixa.meses} {faixa.meses === 1 ? 'mês' : 'meses'}</>
                    : <>Começa em {mesEscrito(faixa.de)}</>}
                  {!acabaAntes && d.valido && d.valor && f.valor !== null && <> · a mensalidade fica <b className="tnum text-ink-2">{reais(Math.max(0, f.valor - d.valor))}</b></>}
                </p>
              </div>
            );
          })}
          <div>
            <button type="button" className="btn-secondary btn-sm" id="condicoes-incluir-desconto" disabled={descontos.length >= MAX_DESCONTOS_DA_NEGOCIACAO || ultimoSemPrazo}
              title={ultimoSemPrazo ? 'O último desconto é sem prazo: depois dele não vem outro' : undefined}
              onClick={() => setDescontos((xs) => [...xs, { chave: ++sequencia, valor: null, valido: true, ate: '', semPrazo: false }])}>
              <Plus size={14} /> {descontos.length ? 'Depois, outro desconto' : 'Incluir um desconto'}
            </button>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2" id="condicoes-ativacao">
          <legend className="label mb-0">Ativação</legend>
          <div className="rounded-lg border border-line p-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <span className="text-[12px] text-muted">Desconto na ativação (opcional)</span>
              <CampoValor id="condicoes-ativacao-desconto" centavos={descontoAtivacao.valor} rotulo="Desconto na ativação" onChange={(v, ok) => { setDescontoAtivacao({ valor: v, valido: ok }); setErro(''); }} />
            </div>
            <div className="min-w-0">
              <span className="text-[12px] text-muted">Fica para pagar</span>
              <div className="h-[38px] flex items-center font-semibold tnum" id="condicoes-ativacao-fica">
                {f.ativacao === null ? <span className="text-muted font-normal text-[13px]">sem o valor da ativação ainda</span>
                  : conta.aPagar === 0 ? <span className="text-ok">nada (sem cobrar a ativação)</span>
                  : <>{reais(conta.aPagar)}{conta.desconto > 0 && <span className="ml-1.5 text-[12px] font-normal text-muted">({reais(conta.valor)} − {reais(conta.desconto)})</span>}</>}
              </div>
            </div>
            <label className="min-w-0">
              <span className="text-[12px] text-muted">Em quantas vezes</span>
              <select className="input tnum" id="condicoes-ativacao-vezes" value={vezes} onChange={(e) => setVezes(Number(e.target.value))}>
                {opcoesDeVezes.map((n) => {
                  const p = ativacaoAPagar(f.ativacao, { ...ativacao, vezes: n });
                  const valor = f.ativacao === null ? '' : n === 1 ? ` — ${reais(p.aPagar)}` : ` de ${reais(p.parcela)}`;
                  return <option key={n} value={n}>{n === 1 ? `À vista${valor}` : `${n}×${valor}`}</option>;
                })}
              </select>
            </label>
            <div className="min-w-0">
              <span className="text-[12px] text-muted block">Começa a pagar</span>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-line-strong p-0.5 bg-surface" role="radiogroup" aria-label="Quando a ativação começa a ser paga" id="condicoes-ativacao-quando">
                  {([[false, 'No 1º mês'], [true, 'Em outro mês']] as const).map(([v, nome]) => (
                    <button key={nome} type="button" role="radio" aria-checked={outroMes === v} onClick={() => { setOutroMes(v); setErro(''); }}
                      className={`px-2.5 py-1 rounded-md text-[13px] font-semibold ${outroMes === v ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2'}`}>{nome}</button>
                  ))}
                </div>
                {outroMes && <input type="month" className="input w-auto" id="condicoes-ativacao-mes" value={aPartirDe} aria-label="O mês da 1ª parcela da ativação" onChange={(e) => { setAPartirDe(e.target.value); setErro(''); }} />}
              </div>
            </div>
          </div>
        </fieldset>

        <label className="min-w-0">
          <span className="label">O que mais foi combinado (opcional)</span>
          <textarea className="input min-h-[64px]" id="condicoes-observacao" maxLength={1000} value={observacao} placeholder="Ex.: o desconto vale enquanto pagar em dia" onChange={(e) => setObservacao(e.target.value)} />
        </label>

        {temPrevia && (
          <div>
            <div className="label mb-0">Como fica a cobrança</div>
            <p className="text-[12.5px] text-muted mb-1.5">{textoDoPrimeiroMes(primeiro)}</p>
            <CobrancaMesAMes meses={previa} vezes={conta.vezes} semPrazo={descontosProntos.some((d) => d.ate === null)} id="condicoes-meses" />
          </div>
        )}
      </form>
    </Modal>
  );
}
