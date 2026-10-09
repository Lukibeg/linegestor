/**
 * Inventário › Relatórios (Patch 1.9, decisão 0041). O pedido (09/10): "gostaria de mais
 * informações sobre os equipamentos, tá bem enxuto, gere alguns relatórios". A quarta aba do
 * Inventário, em quatro partes, cada relatório respondendo uma pergunta que a tela não responde:
 *
 *  - **Clientes**: Quem tem o quê (cliente × modelo, com o valor). O "Para recolher ou
 *    regularizar" saiu na prévia (09/10): o Luan não quis.
 *  - **Estoque e valor**: Na prateleira (o que dá para entregar, parado há quanto, dá para quantas
 *    semanas) · Quanto vale o parque
 *  - **Histórico e cadastro**: Vai e volta (o que sai, o que volta, quem volta inativo) · Cadastro
 *    em dia (o que falta preencher)
 *  - **Relação do cliente**: os aparelhos de um cliente, por unidade, para imprimir ou salvar em PDF
 *
 * As contas são as de `@gestor/shared/inventario.ts` — as mesmas do servidor e da prévia. **Clicar
 * num número mostra os aparelhos dele** (a janela), cada um com o link para a ficha. Tudo fica no
 * endereço (`?aba=relatorios&rel=…`), e o Voltar da ficha do aparelho traz de volta para cá.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Building2, CheckCircle2, ClipboardList, Info, ListChecks, Package, Printer, Repeat, Wallet } from 'lucide-react';
import {
  cnpjFormatado, FORA_DA_BASE, relacaoDoCliente, SITUACOES_ESTOQUE,
  type AparelhoDoRelatorio, type ItemCadastro, type LinhaQuemTem, type ParteDoParque, type RelatoriosInventario, type SituacaoEstoque,
} from '@gestor/shared';
import { api, IS_DEMO } from '../../api/index.js';
import { Carregando, Chip, EscolherComBusca, Identificacao, Modal, mensagemErro, Toggle, usePaginaLocal, type TomChip } from '../../components/ui/index.js';
import { Proporcao } from '../../components/graficos.js';
import { condicaoCor, condicaoNome, data, MODALIDADES, reais } from '../../lib/format.js';
import { ordenarLista, Th, useOrdenacaoLocal } from '../../lib/ordenacao.js';
import { TdN, ThN } from '../../lib/contagem.js';
import { BarrasComparadas, Bloco, nf, Numero, Numeros, pct } from '../chamados/relatorios/pecas.js';

type Secao = 'clientes' | 'estoque' | 'historico' | 'relacao';
const SECOES: Array<{ id: Secao; label: string }> = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'estoque', label: 'Estoque e valor' },
  { id: 'historico', label: 'Histórico e cadastro' },
  { id: 'relacao', label: 'Relação do cliente' },
];
type Abrir = (titulo: string, ids: string[]) => void;

/** dd/mm/aaaa de um AAAA-MM-DD (sem passar por `Date`, que no Brasil voltaria um dia). */
const diaBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
/** "hoje", "há 12 dias", "há 4 meses" */
function haQuanto(dias: number) {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  if (dias < 60) return `há ${dias} dias`;
  if (dias < 730) return `há ${Math.round(dias / 30.44)} meses`;
  return `há ${Math.floor(dias / 365)} anos`;
}
const modalidade = (m: string | null) => (m ? (MODALIDADES as Record<string, string>)[m] ?? m : '—');

export function RelatoriosDoInventario() {
  const [sp, setSp] = useSearchParams();
  const pedida = sp.get('rel') ?? '';
  const secao: Secao = SECOES.some((s) => s.id === pedida) ? (pedida as Secao) : 'clientes';
  const q = useQuery({ queryKey: ['inventory', 'relatorios'], queryFn: () => api.inventory.relatorios(), refetchInterval: 5 * 60_000 });
  const [janela, setJanela] = useState<{ titulo: string; ids: string[] } | null>(null);
  const abrir: Abrir = (titulo, ids) => setJanela({ titulo, ids });
  const irPara = (s: Secao) => { const n = new URLSearchParams(sp); n.set('rel', s); setSp(n, { replace: true }); };

  if (q.isLoading) return <Carregando />;
  if (q.isError || !q.data) return <div className="card p-4 text-bad text-sm">{mensagemErro(q.error)}</div>;
  const r = q.data;
  const marca: Partial<Record<Secao, number>> = { historico: r.cadastro.pendencias };

  return (
    <div className="flex flex-col gap-4">
      <div className="so-tela flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="inline-flex flex-wrap rounded-lg border border-line p-0.5 bg-surface" role="tablist" aria-label="Relatórios do Inventário">
          {SECOES.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={secao === s.id} onClick={() => irPara(s.id)}
              className={`px-3 py-1.5 text-sm font-semibold rounded-md inline-flex items-center gap-1.5 ${secao === s.id ? 'bg-accent text-white' : 'text-ink-2 hover:text-ink'}`}>
              {s.label}
              {!!marca[s.id] && <span className={`text-[11px] tnum rounded-full px-1.5 leading-[18px] ${secao === s.id ? 'bg-white/25' : 'bg-signal-soft text-signal'}`} title="pendências no cadastro">{marca[s.id]}</span>}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-muted">
          {r.historicoDesde ? <>Movimentações guardadas desde {diaBr(r.historicoDesde)}</> : 'Nenhuma movimentação guardada ainda'}
        </span>
      </div>

      {secao === 'clientes' && <QuemTem r={r} abrir={abrir} />}
      {secao === 'estoque' && <><Prateleira r={r} abrir={abrir} /><ValorDoParque r={r} abrir={abrir} /></>}
      {secao === 'historico' && <><VaiEVolta r={r} abrir={abrir} /><CadastroEmDia r={r} abrir={abrir} /></>}
      {secao === 'relacao' && <RelacaoDoCliente r={r} />}

      <JanelaDeAparelhos janela={janela} r={r} onClose={() => setJanela(null)} />
    </div>
  );
}

// ---------- a janela com os aparelhos de um número clicado ----------

function JanelaDeAparelhos({ janela, r, onClose }: { janela: { titulo: string; ids: string[] } | null; r: RelatoriosInventario; onClose: () => void }) {
  const porId = useMemo(() => new Map(r.aparelhos.map((x) => [x.id, x])), [r]);
  const itens = useMemo(() => [...new Set(janela?.ids ?? [])].map((id) => porId.get(id)).filter((x): x is AparelhoDoRelatorio => !!x), [janela, porId]);
  const o = useOrdenacaoLocal('modelo');
  const ordenados = ordenarLista(itens, o, {
    identificacao: (x) => (x.tipoId === 'nenhum' ? null : x.identificacao), modelo: (x) => x.modelo, cliente: (x) => x.cliente ?? 'Estoque',
    unidade: (x) => x.unidade ?? (x.clienteId ? 'Matriz' : null), modalidade: (x) => x.modalidade, condicao: (x) => x.condicao, valorCents: (x) => x.valorCents, desde: (x) => x.desde,
  });
  const pg = usePaginaLocal(ordenados, 100);
  return (
    <Modal open={!!janela} onClose={onClose} largura="max-w-6xl" titulo={<>{janela?.titulo} <span className="text-muted font-normal tnum">({nf(itens.length)})</span></>}>
      {!itens.length ? <div className="text-muted text-sm">Nenhum aparelho aqui.</div> : (
        <div className="overflow-x-auto -mx-1">
          <table className="table">
            <thead><tr>
              <ThN /><Th o={o} col="identificacao">MAC / N/S</Th><Th o={o} col="modelo">Modelo</Th><Th o={o} col="cliente">Atribuído a</Th><Th o={o} col="unidade">Unidade</Th>
              <Th o={o} col="modalidade">Modalidade</Th><Th o={o} col="condicao">Condição</Th><Th o={o} col="valorCents" align="right">Valor</Th><Th o={o} col="desde" titulo="Desde quando está onde está: com o cliente, ou no estoque">Desde</Th>
            </tr></thead>
            <tbody>{pg.visiveis.map((x, i) => (
              <tr key={x.id}>
                <TdN n={pg.numero(i)} />
                <td><Link className="link" to={`/inventario/aparelhos/${x.id}`}><Identificacao d={{ identificacao: x.identificacao, identificacaoTipo: x.tipoId }} /></Link></td>
                <td className="whitespace-nowrap">{x.modelo}</td>
                <td className="whitespace-nowrap">{x.clienteId ? <Link className="link" to={`/clientes/${x.clienteId}?aba=equipamentos`}>{x.cliente}</Link> : <Chip tone="ok">estoque</Chip>}</td>
                <td className="whitespace-nowrap">{x.unidade ?? <span className="text-muted">{x.clienteId ? 'Matriz' : '—'}</span>}</td>
                <td className="text-muted">{modalidade(x.modalidade)}</td>
                <td><Chip tone={condicaoCor[x.condicao] as TomChip}>{condicaoNome[x.condicao] ?? x.condicao}</Chip></td>
                <td className="text-right tnum whitespace-nowrap">{x.valorCents != null ? reais(x.valorCents) : <span className="text-muted" title="nem o aparelho nem o modelo têm valor">sem valor</span>}</td>
                <td className="tnum whitespace-nowrap">{diaBr(x.desde)}<span className="block text-muted text-[11.5px]">{haQuanto(x.dias)}</span></td>
              </tr>
            ))}</tbody>
          </table>
          <div className="px-1">{pg.rodape}</div>
        </div>
      )}
    </Modal>
  );
}

/** Um número de tabela que abre os aparelhos dele. Zero vira um ponto discreto. */
function Celula({ n, abrir, titulo, forte }: { n: number; abrir?: () => void; titulo?: string; forte?: boolean }) {
  if (!n) return <span className="text-muted" aria-label="nenhum">·</span>;
  if (!abrir) return <span className={forte ? 'font-semibold' : ''}>{nf(n)}</span>;
  return <button type="button" onClick={abrir} title={titulo ?? 'Ver os aparelhos'} className={`tnum rounded px-1 -mx-1 hover:bg-surface-2 hover:text-accent ${forte ? 'font-semibold' : ''}`}>{nf(n)}</button>;
}

function TudoCerto({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2 text-[14px] text-ok"><CheckCircle2 size={17} className="shrink-0 mt-0.5" /><span>{children}</span></div>;
}

// ---------- Clientes ----------

function QuemTem({ r, abrir }: { r: RelatoriosInventario; abrir: Abrir }) {
  const q = r.quemTem;
  const porId = useMemo(() => new Map(r.aparelhos.map((x) => [x.id, x])), [r]);
  const o = useOrdenacaoLocal('total', 'desc');
  const valores: Record<string, (l: LinhaQuemTem) => string | number | null> = {
    nome: (l) => l.nome, total: (l) => l.total, valorCents: (l) => l.valorCents,
    ...Object.fromEntries(q.modelos.map((m) => [`m:${m.id}`, (l: LinhaQuemTem) => l.porModelo[m.id] ?? null])),
  };
  const linhas = ordenarLista(q.linhas, o, valores);
  const doModelo = (ids: string[], modelId: string) => ids.filter((id) => porId.get(id)?.modelId === modelId);
  return (
    <Bloco titulo="Quem tem o quê" pergunta="Quantos aparelhos de cada modelo estão em cada cliente, e quanto isso vale." icone={Building2}
      rodape={<>O valor é o de comodato e locação (o do aparelho, ou o do modelo). {q.vendidos.aparelhos > 0 && <>Os vendidos já não são nossos e ficam de fora: {plural(q.vendidos.aparelhos, 'aparelho vendido', 'aparelhos vendidos')} a {plural(q.vendidos.clientes, 'cliente', 'clientes')} (<button type="button" className="link" onClick={() => abrir('Vendidos', q.vendidos.ids)}>ver</button>). </>}Clique num número para ver os aparelhos.</>}>
      <Numeros>
        <Numero valor={nf(q.totais.total)} rotulo="aparelhos com clientes" sub={<span className="text-muted">em {plural(q.linhas.length, 'cliente', 'clientes')}</span>} />
        <Numero valor={nf(q.totais.comodato)} rotulo="em comodato" />
        <Numero valor={nf(q.totais.locacao)} rotulo="em locação" />
        <Numero valor={reais(q.totais.valorCents)} rotulo="valor com os clientes" />
      </Numeros>
      {!q.modelos.length ? <div className="text-muted text-sm">Nenhum aparelho cadastrado ainda.</div> : (
        <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
          <table className="table">
            <thead><tr>
              <ThN />
              <Th o={o} col="nome">Cliente</Th>
              {q.modelos.map((m) => (
                <Th key={m.id} o={o} col={`m:${m.id}`} align="right" titulo={`Ordenar por ${m.nome}`}>
                  <span className="block max-w-[92px] whitespace-normal leading-tight text-[12px] text-right">{m.nome}</span>
                </Th>
              ))}
              <Th o={o} col="total" align="right">Total</Th>
              <Th o={o} col="valorCents" align="right">Valor</Th>
            </tr></thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.clienteId}>
                  <TdN n={i + 1} />
                  <td className="min-w-[180px]">
                    <Link className="link" to={`/clientes/${l.clienteId}?aba=equipamentos`}>{l.nome}</Link>
                    {l.interno && <Chip tone="muted" className="ml-1.5">interno</Chip>}
                    {l.foraDaBase && <Chip tone="signal" className="ml-1.5" title={FORA_DA_BASE[l.foraDaBase].texto}>{FORA_DA_BASE[l.foraDaBase].rotulo}</Chip>}
                    {/* a modalidade embaixo do nome, e não em duas colunas: a tabela já tem uma coluna por modelo */}
                    <span className="block text-[12px] text-muted">{modalidadesDaLinha(l)}{l.unidades > 1 && <> · em {l.unidades} unidades</>}</span>
                  </td>
                  {q.modelos.map((m) => (
                    <td key={m.id} className="text-right tnum">
                      <Celula n={l.porModelo[m.id] ?? 0} abrir={() => abrir(`${l.nome} · ${m.nome}`, doModelo(l.ids, m.id))} />
                    </td>
                  ))}
                  <td className="text-right tnum">
                    <Celula n={l.total} forte abrir={() => abrir(l.nome, l.ids)} />
                    {l.inativos > 0 && <span className="block text-[11.5px] text-signal whitespace-nowrap">{plural(l.inativos, 'inativo', 'inativos')}</span>}
                  </td>
                  <td className="text-right tnum whitespace-nowrap">
                    {reais(l.valorCents)}
                    {l.semValor > 0 && <span className="block text-[11.5px] text-muted">{plural(l.semValor, 'sem valor', 'sem valor')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-line">
              <tr className="bg-surface-2 font-semibold">
                <td /><td>Com clientes</td>
                {q.modelos.map((m) => <td key={m.id} className="text-right tnum"><Celula n={q.totais.porModelo[m.id] ?? 0} forte /></td>)}
                <td className="text-right tnum">{nf(q.totais.total)}</td>
                <td className="text-right tnum whitespace-nowrap">{reais(q.totais.valorCents)}</td>
              </tr>
              <tr>
                <td /><td><span className="inline-flex items-center gap-1.5"><Chip tone="ok">estoque</Chip><span className="text-muted text-[12.5px]">no estoque</span></span></td>
                {q.modelos.map((m) => (
                  <td key={m.id} className="text-right tnum"><Celula n={q.estoque.porModelo[m.id] ?? 0} abrir={() => abrir(`No estoque · ${m.nome}`, doModelo(q.estoque.ids, m.id))} /></td>
                ))}
                <td className="text-right tnum"><Celula n={q.estoque.total} forte abrir={() => abrir('No estoque', q.estoque.ids)} /></td>
                <td className="text-[12px] whitespace-nowrap"><Link className="link" to="/inventario?aba=relatorios&rel=estoque">ver a prateleira</Link></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Bloco>
  );
}

/** "24 em locação · 2 em comodato" (o que houver, o maior primeiro). */
function modalidadesDaLinha(l: LinhaQuemTem) {
  const partes = [[l.locacao, 'em locação'], [l.comodato, 'em comodato'], [l.total - l.locacao - l.comodato, 'sem modalidade']] as const;
  return partes.filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).map(([n, t]) => `${nf(n)} ${t}`).join(' · ');
}

// ---------- Estoque e valor ----------

const TOM_SITUACAO: Record<SituacaoEstoque, TomChip> = { acabou: 'signal', pouco: 'signal', parado: 'neutral', ok: 'ok', sem_ritmo: 'muted' };
const TEXTO_SITUACAO: Record<SituacaoEstoque, string> = {
  acabou: 'Nada deste modelo no estoque, e ele saiu no período.',
  pouco: 'No ritmo de saída, o estoque dá para menos de 4 semanas.',
  parado: 'Nenhuma saída no período: o estoque está parado.',
  ok: 'O estoque dá para 4 semanas ou mais.',
  sem_ritmo: 'Com menos de 4 semanas de histórico, a conta do ritmo ainda engana.',
};

function Prateleira({ r, abrir }: { r: RelatoriosInventario; abrir: Abrir }) {
  const p = r.prateleira;
  const t = p.totais;
  const o = useOrdenacaoLocal('situacao');
  const ordem: SituacaoEstoque[] = ['acabou', 'pouco', 'parado', 'ok', 'sem_ritmo'];
  const linhas = ordenarLista(p.modelos, o, {
    situacao: (m) => ordem.indexOf(m.situacao), nome: (m) => m.nome, ativos: (m) => m.ativos, inativos: (m) => m.inativos, saidas: (m) => m.saidas,
    semanas: (m) => m.semanas, idadeMediana: (m) => m.idadeMediana, maisAntigo: (m) => m.maisAntigo, valorCents: (m) => m.valorCents,
  });
  const daPara = (m: (typeof p.modelos)[number]) => {
    if (m.situacao === 'acabou') return <span className="text-signal font-semibold">nada no estoque</span>;
    if (!p.ritmoConfiavel) return <span className="text-muted">—</span>;
    if (m.semanas == null) return <span className="text-muted" title="nenhuma saída no período">sem saída</span>;
    if (m.semanas < 1) return 'menos de 1 semana';
    if (m.semanas > 52) return 'mais de 1 ano';
    // abaixo de 10, com uma casa: "3,7 semanas" (arredondar daria "4 semanas" num "pouco estoque")
    const s = m.semanas < 10 ? Math.floor(m.semanas * 10) / 10 : Math.round(m.semanas);
    return `${s.toLocaleString('pt-BR')} ${s === 1 ? 'semana' : 'semanas'}`;
  };
  const todosAtivos = p.modelos.flatMap((m) => m.idsAtivos);
  const todosInativos = p.modelos.flatMap((m) => m.idsInativos);
  const porRotulo = new Map(p.faixas.map((f) => [f.rotulo, f]));
  return (
    <Bloco titulo="Na prateleira" pergunta="O que temos para entregar, há quanto tempo está parado e para quantas semanas dá, no ritmo de saída." icone={Package}
      rodape={p.ritmoConfiavel
        ? <>O ritmo é o das saídas do estoque para cliente (locação, comodato ou venda) nos últimos {p.janelaDias} dias, desde {p.desde ? diaBr(p.desde) : '—'}. "Dá para" = os ativos divididos pelo ritmo. "Parado há" conta desde que o aparelho chegou ao estoque, ou voltou.</>
        : <>As movimentações começam em {r.historicoDesde ? diaBr(r.historicoDesde) : '—'}: com menos de 4 semanas de histórico, a conta do ritmo engana — por enquanto aparecem só as saídas ({p.janelaDias} {p.janelaDias === 1 ? 'dia' : 'dias'}). "Parado há" conta desde que o aparelho chegou ao estoque, ou voltou.</>}>
      <Numeros>
        <Numero valor={nf(t.ativos)} rotulo="para entregar (ativos)" tom="ok" aoClicar={t.ativos ? () => abrir('No estoque · ativos', todosAtivos) : undefined} titulo="Ver os aparelhos" />
        <Numero valor={nf(t.inativos)} rotulo="inativos no estoque" aoClicar={t.inativos ? () => abrir('No estoque · inativos', todosInativos) : undefined} titulo="Ver os aparelhos" />
        <Numero valor={reais(t.valorCents)} rotulo="em ativos no estoque" sub={t.valorInativosCents > 0 ? <span className="text-muted">+ {reais(t.valorInativosCents)} em inativos</span> : undefined} />
        <Numero valor={nf(t.paradosHaMuito)} rotulo="ativos parados há mais de 90 dias" tom={t.paradosHaMuito ? 'signal' : undefined}
          aoClicar={t.paradosHaMuito ? () => abrir('Parados há mais de 90 dias', p.faixas.filter((f) => f.id === 'ate180' || f.id === 'mais180').flatMap((f) => f.ids)) : undefined} titulo="Ver os aparelhos" />
      </Numeros>
      {!p.modelos.length ? <div className="text-muted text-sm">O estoque está vazio e nada saiu no período.</div> : (
        <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
          <table className="table">
            <thead><tr>
              <ThN /><Th o={o} col="nome">Modelo</Th><Th o={o} col="ativos" align="right">Para entregar</Th><Th o={o} col="inativos" align="right">Inativos</Th>
              <Th o={o} col="saidas" align="right" titulo={`Saídas do estoque para cliente nos últimos ${p.janelaDias} dias`}>Saíram em {p.janelaDias} {p.janelaDias === 1 ? 'dia' : 'dias'}</Th>
              <Th o={o} col="semanas" titulo="Para quantas semanas os ativos dão, no ritmo de saída">Dá para</Th>
              <Th o={o} col="idadeMediana" align="right" titulo="Há quantos dias os ativos estão no estoque (o do meio)">Parado há</Th>
              <Th o={o} col="maisAntigo" align="right" titulo="O ativo que está no estoque há mais tempo">O mais antigo</Th>
              <Th o={o} col="valorCents" align="right">Valor</Th><Th o={o} col="situacao">Situação</Th>
            </tr></thead>
            <tbody>{linhas.map((m, i) => (
              <tr key={m.id}>
                <TdN n={i + 1} />
                <td className="whitespace-nowrap">{m.nome}</td>
                <td className="text-right tnum"><Celula n={m.ativos} forte abrir={() => abrir(`No estoque · ${m.nome}`, m.idsAtivos)} /></td>
                <td className="text-right tnum"><Celula n={m.inativos} abrir={() => abrir(`Inativos no estoque · ${m.nome}`, m.idsInativos)} /></td>
                <td className="text-right tnum">{m.saidas ? nf(m.saidas) : <span className="text-muted">·</span>}</td>
                <td className="whitespace-nowrap">{daPara(m)}</td>
                <td className="text-right tnum whitespace-nowrap">{m.idadeMediana != null ? `${nf(Math.round(m.idadeMediana))} dias` : <span className="text-muted">—</span>}</td>
                <td className="text-right tnum whitespace-nowrap">{m.maisAntigo != null ? `${nf(m.maisAntigo)} dias` : <span className="text-muted">—</span>}</td>
                <td className="text-right tnum whitespace-nowrap">{m.ativos + m.inativos ? reais(m.valorCents) : <span className="text-muted">—</span>}</td>
                <td><Chip tone={TOM_SITUACAO[m.situacao]} title={TEXTO_SITUACAO[m.situacao]} className="whitespace-nowrap">{SITUACOES_ESTOQUE[m.situacao]}</Chip></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {t.ativos > 0 && (
        <div className="max-w-xl">
          <div className="eyebrow mb-2">Há quanto tempo os ativos estão parados</div>
          <BarrasComparadas itens={p.faixas.map((f) => ({ rotulo: f.rotulo, n: f.n }))} aoClicar={(rotulo) => { const f = porRotulo.get(rotulo); if (f?.n) abrir(`Parados ${f.rotulo}`, f.ids); }} />
        </div>
      )}
    </Bloco>
  );
}

const COR_PARTE: Record<ParteDoParque, 'pz1' | 'pz2' | 'pz3' | 'pz4' | 'pz5' | 'outros'> = {
  comodato: 'pz1', locacao: 'pz2', estoque: 'pz3', outros: 'pz4', interno: 'pz5', estoque_inativo: 'outros',
};

function ValorDoParque({ r, abrir }: { r: RelatoriosInventario; abrir: Abrir }) {
  const v = r.valor;
  const partes = v.partes.filter((p) => p.n > 0);
  // a ordem da barra: o que está com cliente primeiro, depois o estoque
  const ordemBarra: ParteDoParque[] = ['comodato', 'locacao', 'outros', 'interno', 'estoque', 'estoque_inativo'];
  const o = useOrdenacaoLocal('valorCents', 'desc');
  const modelos = ordenarLista(v.porModelo, o, { nome: (m) => m.nome, valorDoModeloCents: (m) => m.valorDoModeloCents, n: (m) => m.n, valorCents: (m) => m.valorCents });
  const porId = useMemo(() => new Map(r.aparelhos.map((x) => [x.id, x])), [r]);
  const nossosDoModelo = (modelId: string) => r.aparelhos.filter((x) => x.modelId === modelId && x.modalidade !== 'venda').map((x) => x.id);
  return (
    <Bloco titulo="Quanto vale o parque" pergunta="Quanto dinheiro temos em aparelho, e onde ele está." icone={Wallet}
      rodape={<>
        O valor de cada aparelho é o dele, ou o do modelo. {v.semValor > 0 && <><b>{plural(v.semValor, 'aparelho não entra', 'aparelhos não entram')} na conta</b> por falta de valor (o Cadastro em dia mostra os modelos). </>}
        {v.vendidos.n > 0 && <>Os vendidos ({nf(v.vendidos.n)}, {reais(v.vendidos.valorCents)} pelo valor de hoje) já não são nossos e ficam de fora.</>}
      </>}>
      <Numeros>
        <Numero valor={reais(v.totalCents)} rotulo="em aparelhos nossos" sub={<span className="text-muted">{plural(v.aparelhos, 'aparelho', 'aparelhos')}, sem os vendidos</span>} />
        {partes.filter((p) => p.id === 'comodato' || p.id === 'locacao').map((p) => (
          <Numero key={p.id} valor={reais(p.valorCents)} rotulo={p.rotulo} sub={<span className="text-muted">{pct(p.valorCents, v.totalCents)}% · {plural(p.n, 'aparelho', 'aparelhos')}</span>} aoClicar={() => abrir(`Parque · ${p.rotulo}`, p.ids)} titulo="Ver os aparelhos" />
        ))}
      </Numeros>
      {v.totalCents > 0 && (
        <Proporcao
          partes={[...partes].sort((a, b) => ordemBarra.indexOf(a.id) - ordemBarra.indexOf(b.id)).map((p) => ({ id: p.id, rotulo: p.rotulo, n: p.valorCents, cor: COR_PARTE[p.id], titulo: `${p.rotulo}: ${reais(p.valorCents)} · ${plural(p.n, 'aparelho', 'aparelhos')} · ${pct(p.valorCents, v.totalCents)}%` }))}
          formatar={(n) => reais(n)}
          aoClicar={(id) => { const p = partes.find((x) => x.id === id); if (p) abrir(`Parque · ${p.rotulo}`, p.ids); }}
        />
      )}
      {v.porModelo.length > 0 && (
        <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
          <table className="table">
            <thead><tr>
              <ThN /><Th o={o} col="nome">Modelo</Th><Th o={o} col="valorDoModeloCents" align="right">Valor de cada</Th><Th o={o} col="n" align="right">Aparelhos</Th>
              <Th o={o} col="valorCents" align="right">Valor</Th><th className="!text-right">Do parque</th>
            </tr></thead>
            <tbody>{modelos.map((m, i) => (
              <tr key={m.id}>
                <TdN n={i + 1} />
                <td className="whitespace-nowrap">
                  {m.nome}
                  {m.semValor > 0 && <Chip tone="signal" className="ml-1.5" title="nem o aparelho nem o modelo têm valor: não somam">{m.semValor} sem valor</Chip>}
                  {m.proprio > 0 && <Chip tone="muted" className="ml-1.5" title="aparelhos com valor próprio, diferente do modelo">{m.proprio} com valor próprio</Chip>}
                </td>
                <td className="text-right tnum whitespace-nowrap">{m.valorDoModeloCents != null ? reais(m.valorDoModeloCents) : <span className="text-muted">sem valor</span>}</td>
                <td className="text-right tnum"><Celula n={m.n} abrir={() => abrir(`Parque · ${m.nome}`, nossosDoModelo(m.id).filter((id) => porId.has(id)))} /></td>
                <td className="text-right tnum whitespace-nowrap font-semibold">{m.semValor === m.n ? <span className="text-muted font-normal">—</span> : reais(m.valorCents)}</td>
                <td className="text-right tnum text-muted">{pct(m.valorCents, v.totalCents)}%</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Bloco>
  );
}

// ---------- Histórico e cadastro ----------

function VaiEVolta({ r, abrir }: { r: RelatoriosInventario; abrir: Abrir }) {
  const v = r.vaiEVolta;
  const t = v.totais;
  const [todosClientes, setTodosClientes] = useState(false);
  const clientes = todosClientes ? v.porCliente : v.porCliente.slice(0, 8);
  if (!v.desde) {
    return (
      <Bloco titulo="Vai e volta" pergunta="O que sai, o que volta, e quantos voltam inativos." icone={Repeat}>
        <div className="text-muted text-sm">Nenhuma movimentação guardada ainda. Assim que os aparelhos começarem a ir e voltar, o relatório aparece aqui.</div>
      </Bloco>
    );
  }
  return (
    <Bloco titulo="Vai e volta" pergunta="O que sai do estoque, o que volta dos clientes, e quantos voltam inativos." icone={Repeat}
      rodape={<>Desde {diaBr(v.desde)}, a primeira movimentação guardada no Gestor. Saída = do estoque para um cliente (locação, comodato ou venda); passar de um cliente para outro não é saída. "Voltou inativo" = a devolução foi marcada como Inativo. O tempo no cliente é o do meio, entre chegar e voltar.</>}>
      <Numeros>
        <Numero valor={nf(t.saidas)} rotulo="saíram do estoque" />
        <Numero valor={nf(t.devolucoes)} rotulo="voltaram (devolução)" />
        <Numero valor={nf(t.voltaramInativos)} rotulo="voltaram inativos" tom={t.voltaramInativos ? 'signal' : undefined}
          sub={t.devolucoes ? <span className="text-muted">{pct(t.voltaramInativos, t.devolucoes)}% das devoluções</span> : undefined}
          aoClicar={t.voltaramInativos ? () => abrir('Voltaram inativos', v.porModelo.flatMap((m) => m.idsInativos)) : undefined} titulo="Ver os aparelhos" />
        {t.transferencias > 0 && <Numero valor={nf(t.transferencias)} rotulo="passaram de um cliente a outro" />}
      </Numeros>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="min-w-0">
          <div className="eyebrow mb-2">Por modelo</div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Modelo</th><th className="!text-right">Saíram</th><th className="!text-right">Voltaram</th><th className="!text-right">Inativos</th><th className="!text-right" title="O tempo do meio entre chegar ao cliente e voltar">Ficou no cliente</th></tr></thead>
              <tbody>{v.porModelo.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{m.nome}</td>
                  <td className="text-right tnum">{m.saidas ? nf(m.saidas) : <span className="text-muted">·</span>}</td>
                  <td className="text-right tnum"><Celula n={m.devolucoes} abrir={() => abrir(`Voltaram · ${m.nome}`, m.idsDevolvidos)} /></td>
                  <td className="text-right tnum">
                    <Celula n={m.inativos} abrir={() => abrir(`Voltaram inativos · ${m.nome}`, m.idsInativos)} />
                    {m.devolucoes > 0 && m.inativos > 0 && <span className="text-[11.5px] text-muted"> ({pct(m.inativos, m.devolucoes)}%)</span>}
                  </td>
                  <td className="text-right tnum whitespace-nowrap">{m.medianaDias != null ? `${nf(Math.round(m.medianaDias))} dias` : <span className="text-muted">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="min-w-0">
          <div className="eyebrow mb-2">Por cliente</div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Cliente</th><th className="!text-right" title="Saídas do estoque e transferências para ele">Recebeu</th><th className="!text-right">Devolveu</th><th className="!text-right">Inativos</th><th>Última devolução</th></tr></thead>
              <tbody>{clientes.map((c) => (
                <tr key={c.clienteId}>
                  <td className="min-w-[150px]"><Link className="link" to={`/clientes/${c.clienteId}?aba=equipamentos`}>{c.nome}</Link></td>
                  <td className="text-right tnum">{nf(c.recebeu)}</td>
                  <td className="text-right tnum"><Celula n={c.devolveu} abrir={() => abrir(`Devolvidos por ${c.nome}`, c.idsDevolvidos)} /></td>
                  <td className="text-right tnum">{c.inativos ? <span className="text-signal">{nf(c.inativos)}</span> : <span className="text-muted">·</span>}</td>
                  <td className="tnum whitespace-nowrap">{c.ultimaDevolucao ? diaBr(c.ultimaDevolucao) : <span className="text-muted">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {v.porCliente.length > 8 && <button type="button" className="link text-[13px] mt-2" onClick={() => setTodosClientes(!todosClientes)}>{todosClientes ? 'Mostrar só os 8 primeiros' : `Ver todos (${nf(v.porCliente.length)})`}</button>}
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Últimas devoluções</div>
        {!v.ultimas.length ? <div className="text-muted text-sm">Nenhuma devolução ainda.</div> : (
          <ul className="divide-y divide-line">
            {v.ultimas.map((d) => (
              <li key={d.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13.5px]">
                <span className="tnum text-muted w-[86px] shrink-0">{diaBr(d.dia)}</span>
                <span className="min-w-0">{d.clienteId ? <Link className="link" to={`/clientes/${d.clienteId}?aba=equipamentos`}>{d.cliente}</Link> : d.cliente}</span>
                <button type="button" className="link" onClick={() => abrir(`Devolução de ${diaBr(d.dia)} · ${d.cliente}`, d.ids)}>{d.modelos}</button>
                {d.inativos > 0 && <Chip tone="signal">{plural(d.inativos, 'inativo', 'inativos')}</Chip>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Bloco>
  );
}

function CadastroEmDia({ r, abrir }: { r: RelatoriosInventario; abrir: Abrir }) {
  const c = r.cadastro;
  const pendencias = c.itens.filter((i) => i.tipo === 'pendencia');
  const conferir = c.itens.filter((i) => i.tipo === 'conferir');
  return (
    <Bloco titulo="Cadastro em dia" pergunta="O que falta preencher para o inventário ser confiável." icone={ListChecks}
      rodape={<>Só os aparelhos nossos (os vendidos ficam de fora). O login e a rede padrão contam só para os clientes da base com telefone de MAC (fora os internos).</>}>
      {c.pendencias === 0 ? <TudoCerto>Nenhuma pendência: todo aparelho se identifica, todo modelo tem valor e todo cliente tem o "como configurar".</TudoCerto> : (
        <Numeros><Numero valor={nf(c.pendencias)} rotulo={c.pendencias === 1 ? 'pendência' : 'pendências'} tom="signal" /></Numeros>
      )}
      <ul className="flex flex-col gap-2">{pendencias.map((it) => <ItemDoCadastro key={it.id} it={it} r={r} abrir={abrir} />)}</ul>
      <div>
        <div className="eyebrow mb-2">Vale conferir</div>
        <ul className="flex flex-col gap-2">{conferir.map((it) => <ItemDoCadastro key={it.id} it={it} r={r} abrir={abrir} />)}</ul>
      </div>
    </Bloco>
  );
}

function ItemDoCadastro({ it, r, abrir }: { it: ItemCadastro; r: RelatoriosInventario; abrir: Abrir }) {
  const porId = useMemo(() => new Map(r.aparelhos.map((x) => [x.id, x])), [r]);
  const icone = it.n === 0 ? <CheckCircle2 size={16} className="text-ok shrink-0" /> : it.tipo === 'pendencia' ? <AlertTriangle size={16} className="text-signal shrink-0" /> : <Info size={16} className="text-muted shrink-0" />;
  const cabeca = (
    <span className="flex items-center gap-2 min-w-0">
      {icone}
      <span className="font-semibold">{it.titulo}</span>
      {it.n === 0 ? <span className="text-[12.5px] text-ok">em dia</span> : <Chip tone={it.tipo === 'pendencia' ? 'signal' : 'neutral'}>{nf(it.n)}</Chip>}
    </span>
  );
  if (it.n === 0) return <li className="rounded-lg border border-line px-3 py-2 text-[13.5px]">{cabeca}</li>;
  return (
    <li className="rounded-lg border border-line text-[13.5px]">
      <details>
        <summary className="px-3 py-2 cursor-pointer list-none flex items-center justify-between gap-2 hover:bg-surface-2 rounded-lg">
          {cabeca}<span className="text-[12px] text-muted shrink-0">ver</span>
        </summary>
        <div className="px-3 pb-3 flex flex-col gap-2">
          <p className="text-ink-2">{it.texto}</p>
          {it.aparelhos && (
            <>
              <ul className="flex flex-col gap-1">
                {it.aparelhos.slice(0, 50).map((a) => {
                  const x = porId.get(a.id);
                  if (!x) return null;
                  return (
                    <li key={a.id} className="flex flex-wrap items-baseline gap-x-2">
                      {/* aqui o aparelho sem MAC/N/S é a pendência: "não aplicável" (o termo do headset) não serve */}
                      <Link className="link" to={`/inventario/aparelhos/${x.id}`}>{x.tipoId === 'nenhum' ? 'sem MAC e sem N/S' : <Identificacao d={{ identificacao: x.identificacao, identificacaoTipo: x.tipoId }} />}</Link>
                      <span className="text-muted">{x.modelo} · {x.cliente ?? 'estoque'}</span>
                      {a.dica && <span className="text-ink-2">— {a.dica}</span>}
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="link self-start text-[13px]" onClick={() => abrir(it.titulo, it.aparelhos!.map((a) => a.id))}>Ver {it.aparelhos.length > 50 ? `todos os ${nf(it.aparelhos.length)}` : 'na tabela'}</button>
            </>
          )}
          {it.modelos && (
            <ul className="flex flex-col gap-1">
              {it.modelos.map((m) => (
                <li key={m.id}><Link className="link" to="/inventario?aba=modelos">{m.nome}</Link> <span className="text-muted">· {plural(m.aparelhos, 'aparelho', 'aparelhos')}</span></li>
              ))}
            </ul>
          )}
          {it.clientes && (
            <ul className="flex flex-col gap-1">
              {it.clientes.map((c) => (
                <li key={c.clienteId}><Link className="link" to={`/clientes/${c.clienteId}?aba=acessos`}>{c.nome}</Link> <span className="text-muted">· {c.modelos.join(', ')}</span></li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}

// ---------- Relação do cliente (imprime) ----------

function RelacaoDoCliente({ r }: { r: RelatoriosInventario }) {
  const [sp, setSp] = useSearchParams();
  const clienteId = sp.get('cliente') ?? '';
  const [comValores, setComValores] = useState(true);
  const [comAssinatura, setComAssinatura] = useState(true);
  const opcoes = useMemo(() => r.clientes.map((c) => {
    const n = r.aparelhos.filter((x) => x.clienteId === c.id && x.modalidade !== 'venda').length;
    return { id: c.id, nome: c.nome, dica: n ? plural(n, 'aparelho', 'aparelhos') : 'só comprados' };
  }), [r]);
  const rel = useMemo(() => (clienteId ? relacaoDoCliente(r, clienteId) : null), [r, clienteId]);
  const escolher = (id: string) => { const n = new URLSearchParams(sp); if (id) n.set('cliente', id); else n.delete('cliente'); setSp(n, { replace: true }); };
  const valor = (c: number | null) => (c != null ? reais(c) : <span className="text-muted">sem valor</span>);
  return (
    <div className="flex flex-col gap-3">
      <div className="so-tela card p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <EscolherComBusca className="input w-[280px] max-w-full" valor={clienteId} onChange={escolher} opcoes={opcoes} vazio="Escolha o cliente…" rotulo="Cliente" procurar="Procurar cliente…" />
        {rel && (
          <>
            <Toggle checked={comValores} onChange={setComValores} label="Valores" />
            <Toggle checked={comAssinatura} onChange={setComAssinatura} label="Campo de conferência" />
            <span className="flex-1" />
            {/* a prévia roda dentro do claude.ai, que não deixa a página abrir a impressão; no sistema abre */}
            {IS_DEMO && <span className="text-[12px] text-muted">Na prévia a impressão não abre (o claude.ai bloqueia); no sistema, abre.</span>}
            <button type="button" className="btn-primary btn-sm" onClick={() => window.print()} title='Abre a impressão: escolha "Salvar como PDF" para guardar o arquivo'>
              <Printer size={14} /> Imprimir ou salvar em PDF
            </button>
          </>
        )}
      </div>
      {!clienteId ? (
        <div className="card p-8 text-center">
          <ClipboardList size={28} className="mx-auto text-muted" />
          <div className="font-display font-semibold mt-2">Relação de equipamentos do cliente</div>
          <p className="text-muted text-sm mt-1 max-w-md mx-auto">Escolha o cliente: a lista dos aparelhos dele, por unidade, pronta para imprimir ou salvar em PDF — para conferir no local ou anexar ao contrato.</p>
        </div>
      ) : !rel ? <div className="card p-4 text-muted text-sm">Este cliente não tem aparelho nosso.</div> : (
        <article className="para-imprimir card p-5 sm:p-7 flex flex-col gap-5" aria-label={`Relação de equipamentos de ${rel.cliente.nome}`}>
          <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3">
            <div className="min-w-0">
              <div className="eyebrow flex items-center gap-1.5"><ClipboardList size={13} /> Relação de equipamentos · Ingline</div>
              <h2 className="font-display text-2xl font-semibold">{rel.cliente.nome}</h2>
              <div className="text-[13px] text-ink-2">{rel.cliente.razaoSocial}{rel.cliente.cnpj && <> · CNPJ {cnpjFormatado(rel.cliente.cnpj)}</>}</div>
              {(rel.cliente.arquivado || rel.cliente.naLixeira) && <Chip tone="signal" className="mt-1 so-tela">{rel.cliente.naLixeira ? 'cliente na lixeira' : 'cliente arquivado'}</Chip>}
            </div>
            <div className="text-[12px] text-muted text-right">gerado em {data(new Date().toISOString(), true)}</div>
          </header>

          <div className={`grid grid-cols-2 gap-3 ${comValores ? 'lg:grid-cols-4 print:grid-cols-4' : 'lg:grid-cols-3 print:grid-cols-3'}`}>
            <Quadro valor={nf(rel.totais.aparelhos)} rotulo={rel.totais.aparelhos === 1 ? 'aparelho' : 'aparelhos'} sub={rel.totais.inativos ? `${plural(rel.totais.inativos, 'inativo', 'inativos')}` : undefined} />
            <Quadro valor={nf(rel.totais.comodato)} rotulo="em comodato" />
            <Quadro valor={nf(rel.totais.locacao)} rotulo="em locação" />
            {comValores && <Quadro valor={reais(rel.totais.valorCents)} rotulo="valor dos equipamentos" sub={rel.totais.semValor ? `${plural(rel.totais.semValor, 'sem valor', 'sem valor')}, fora da soma` : undefined} />}
          </div>

          {rel.porModelo.length > 0 && (
            <div className="break-inside-avoid">
              <div className="eyebrow mb-2">Por modelo</div>
              <table className="table">
                <thead><tr><th>Modelo</th><th className="!text-right">Quantidade</th>{comValores && <><th className="!text-right">Valor de cada</th><th className="!text-right">Valor</th></>}</tr></thead>
                <tbody>{rel.porModelo.map((m) => (
                  <tr key={m.modelId}>
                    <td>{m.nome}</td><td className="text-right tnum">{nf(m.n)}</td>
                    {comValores && <><td className="text-right tnum">{m.valorDeCadaCents != null ? reais(m.valorDeCadaCents) : m.semValor === m.n ? <span className="text-muted">sem valor</span> : <span className="text-muted">vários</span>}</td><td className="text-right tnum">{m.semValor === m.n ? <span className="text-muted">—</span> : reais(m.valorCents)}</td></>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {rel.unidades.map((u) => (
            <section key={u.nome} className="flex flex-col gap-2">
              <h3 className="font-display font-semibold text-[15px] flex flex-wrap items-baseline gap-x-2">
                {u.nome}
                <span className="text-[12.5px] font-sans font-normal text-muted">{u.endereco ? `${u.endereco} · ` : ''}{plural(u.aparelhos.length, 'aparelho', 'aparelhos')}</span>
              </h3>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="table">
                  <thead><tr><th className="w-8">#</th><th>Modelo</th><th>MAC / N/S</th><th>Modalidade</th><th>Condição</th>{comValores && <th className="!text-right">Valor</th>}<th>Desde</th></tr></thead>
                  <tbody>{u.aparelhos.map((x, i) => (
                    <tr key={x.id} className="break-inside-avoid">
                      <td className="text-muted tnum">{i + 1}</td>
                      <td className="whitespace-nowrap">{x.modelo}</td>
                      <td><Identificacao d={{ identificacao: x.identificacao, identificacaoTipo: x.tipoId }} /></td>
                      <td>{modalidade(x.modalidade)}</td>
                      <td>{condicaoNome[x.condicao] ?? x.condicao}</td>
                      {comValores && <td className="text-right tnum whitespace-nowrap">{valor(x.valorCents)}</td>}
                      <td className="tnum whitespace-nowrap">{diaBr(x.desde)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          ))}

          {rel.vendidos.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="font-display font-semibold text-[15px]">Comprados pelo cliente <span className="text-[12.5px] font-sans font-normal text-muted">(venda: são do cliente e não entram nas contas acima)</span></h3>
              <table className="table">
                <thead><tr><th className="w-8">#</th><th>Modelo</th><th>MAC / N/S</th><th>Unidade</th><th>Desde</th></tr></thead>
                <tbody>{rel.vendidos.map((x, i) => (
                  <tr key={x.id}><td className="text-muted tnum">{i + 1}</td><td>{x.modelo}</td><td><Identificacao d={{ identificacao: x.identificacao, identificacaoTipo: x.tipoId }} /></td><td>{x.unidade ?? 'Matriz'}</td><td className="tnum">{diaBr(x.desde)}</td></tr>
                ))}</tbody>
              </table>
            </section>
          )}

          {comAssinatura && (
            <div className="break-inside-avoid grid gap-6 sm:grid-cols-3 print:grid-cols-3 pt-6 text-[12.5px] text-ink-2">
              <div><div className="border-b border-line-strong h-8" /><div className="mt-1">Conferido em ____/____/________</div></div>
              <div><div className="border-b border-line-strong h-8" /><div className="mt-1">Pela Ingline</div></div>
              <div><div className="border-b border-line-strong h-8" /><div className="mt-1">Pelo cliente</div></div>
            </div>
          )}

          <footer className="text-[11.5px] text-muted border-t border-line pt-2 flex flex-wrap justify-between gap-2">
            <span>"Desde" = desde quando o aparelho está com o cliente.</span>
            <span>Ingline Gestão · Inventário › Relatórios</span>
          </footer>
        </article>
      )}
    </div>
  );
}

function Quadro({ valor, rotulo, sub }: { valor: string; rotulo: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="font-display text-[24px] font-semibold tnum leading-tight">{valor}</div>
      <div className="text-[12.5px] text-muted">{rotulo}</div>
      {sub && <div className="text-[12px] text-ink-2 mt-0.5">{sub}</div>}
    </div>
  );
}

function plural(n: number, um: string, varios: string) {
  return `${nf(n)} ${n === 1 ? um : varios}`;
}
