/**
 * Uma simulação do Comercial (Patch 2.0.2, decisão 0052): o nome, a negociação ligada (se a pessoa quiser),
 * os cenários (até 3: a mesma venda em versões diferentes, lado a lado) e, em cada cenário, o mês a mês (no
 * alto), o que o cliente paga, os custos e os números — que mudam enquanto a pessoa escreve (a conta é a mesma
 * do `@gestor/shared`, a do servidor). A nova (`/comercial/simulador/nova?modelo=…`) começa em branco ou com as
 * linhas dos modelos marcados; o imposto, o prazo e a margem que se quer vêm dos Ajustes.
 *
 * A simulação salva sozinha (o Luan: "quero salvamento automático, sem ficar precisando apertar em salvar"):
 * 2 segundos depois da última mudança, ou antes do Levar, do Excel e do Duplicar, ou ao sair da tela. A nova é
 * criada assim que tiver um nome. O que ainda não dá para salvar (um custo sem nome) fica dito no aviso, e a
 * simulação salva assim que a pessoa completa. Cada salvamento vai para a auditoria, com o que mudou.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Copy, FileSpreadsheet, Link2, Send, Star, Trash2, X } from 'lucide-react';
import {
  MAX_CENARIOS, MAX_PARCELAS, PRAZOS_COMUNS, SimulacaoGravarSchema, TIPO_DO_XLSX, cenarioNovo, cenarioPrincipal, comPrecoPorProduto, contasDoCenario, duplicarCenario, idLocal,
  mesmoValorPorProduto, normalizarPorProduto, pagamentoPorProduto, percentual, proximoNomeDeCenario, textoDoSePagaEm,
  type AjustesDoSimulador, type CenarioDaSimulacao, type ContasDoCenario, type FichaChamado, type ModeloDeSimulacao, type NegociacaoDaSimulacao, type ProdutoDoSimulador,
  type Simulacao, type SimulacaoGravar,
} from '@gestor/shared';
import { IS_DEMO, api } from '../../../api/index.js';
import { ApiError } from '../../../api/types.js';
import { Carregando, Confirmar, Modal, Spinner, Vazio, mensagemErro, useToast } from '../../../components/ui/index.js';
import { useAuth } from '../../../lib/auth.js';
import { CHAVE_DO_SIMULADOR, CampoDePercentual, CampoDeReais, CampoInteiro, ChipDoSinal, PONTO_DO_SINAL, erroDoSimulador, reaisLimpo, useOpcoesDoSimulador } from './comum.js';
import { OsCustos } from './Custos.js';
import { SemOComercial } from './Lista.js';
import { MesAMes } from './MesAMes.js';
import { LadoALado, OsNumeros } from './Numeros.js';

/** O que a tela edita: o que vai para o servidor e a negociação ligada, para mostrar. */
type Rascunho = SimulacaoGravar & { negociacao: NegociacaoDaSimulacao | null };
const paraGravar = (r: Rascunho): SimulacaoGravar => ({ nome: r.nome, negociacaoId: r.negociacaoId, cenarios: r.cenarios, principal: r.principal });
const doServidor = (s: Simulacao): Rascunho => ({ nome: s.nome, negociacaoId: s.negociacaoId, negociacao: s.negociacao, cenarios: s.cenarios, principal: s.principal });
/** O conteúdo sem ligar para a ordem das chaves (o jsonb do banco devolve as chaves em outra ordem). */
function estavel(x: unknown): string {
  const ordenado = (v: unknown): unknown => (Array.isArray(v) ? v.map(ordenado)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ordenado((v as Record<string, unknown>)[k])])) : v);
  return JSON.stringify(ordenado(x));
}
/** A simulação como o servidor guarda (a validação arruma os nomes e as somas do preço por produto): o que comparar para saber se há o que salvar. */
const validar = (r: Rascunho) => SimulacaoGravarSchema.safeParse(paraGravar(r));
/** A primeira coisa que falta para salvar ("Dê um nome a cada custo."). */
const oQueFalta = (e: { issues: Array<{ message: string }> }) => e.issues[0]?.message ?? 'Confira os campos.';
/** Quanto esperar depois da última mudança para salvar. */
const ESPERA_PARA_SALVAR = 2_000;

export function SimulacaoDoComercial() {
  const { can } = useAuth();
  const { id = 'nova' } = useParams();
  const nova = id === 'nova';
  const [params] = useSearchParams();
  // a nova, quando é criada, troca o endereço sem trocar a tela (a chave vem junto e a edição continua)
  const { state } = useLocation();
  const op = useOpcoesDoSimulador();
  const lida = useQuery({ queryKey: [...CHAVE_DO_SIMULADOR, 'simulacao', id], queryFn: () => api.simulador.ler(id), enabled: !nova && can('sales.read') });
  // a simulação a partir de uma negociação (o Simular da ficha): a empresa, os produtos e os valores dela
  const daNegociacao = nova ? params.get('negociacao') : null;
  const ficha = useQuery({ queryKey: ['simulador-ficha', daNegociacao], queryFn: () => api.atendimento.chamado(daNegociacao!), enabled: !!daNegociacao && can('sales.read'), staleTime: 0 });
  if (!can('sales.read')) return <SemOComercial />;
  if (op.isLoading || (!nova && lida.isLoading) || (daNegociacao && ficha.isLoading)) return <Carregando />;
  if (op.isError) return <p className="text-bad text-sm" role="alert">{erroDoSimulador(op.error)}</p>;
  if (daNegociacao && ficha.isError) {
    return (
      <Vazio titulo="Não deu para abrir a negociação" texto={ficha.error instanceof ApiError && ficha.error.status === 404 ? 'Ela pode ter ido para a lixeira, ou ser de um painel que você não vê.' : mensagemErro(ficha.error)}
        acao={<Link to="/comercial/simulador" className="btn-secondary"><ArrowLeft size={15} /> Ver as simulações</Link>} />
    );
  }
  if (!nova && lida.isError) {
    const sumiu = lida.error instanceof ApiError && lida.error.status === 404;
    return (
      <Vazio titulo={sumiu ? 'Simulação não encontrada' : 'Não deu para abrir a simulação'} texto={sumiu ? 'Ela pode ter ido para a lixeira.' : erroDoSimulador(lida.error)}
        acao={<Link to="/comercial/simulador" className="btn-secondary"><ArrowLeft size={15} /> Ver as simulações</Link>} />
    );
  }
  const ajustes = op.data!.ajustes;
  const produtos = op.data!.produtos;
  const inicial: Rascunho = nova ? (ficha.data ? daFicha(ficha.data, ajustes, produtos) : (() => {
    // os modelos marcados na Nova simulação (um ou mais, na ordem da lista); com dois produtos ou mais, cada um
    // com o seu preço ("uma proposta separada, porém uma negociação única")
    const modelos = (params.get('modelo') ?? '').split(',').map((x) => ajustes.modelos.find((m) => m.id === x.trim())).filter((m): m is ModeloDeSimulacao => !!m);
    const a = comPrecoPorProduto(cenarioNovo(ajustes, { id: idLocal(), nome: 'Cenário A', modelos }));
    return { nome: '', negociacaoId: null, negociacao: null, cenarios: [a], principal: a.id };
  })()) : doServidor(lida.data!);
  const chave = (state as { chave?: string } | null)?.chave ?? (nova ? `nova-${params.get('modelo') ?? ''}-${daNegociacao ?? ''}` : id);
  return <Editor key={chave} chave={chave} id={nova ? null : id} inicial={inicial} simulacao={nova ? null : lida.data!} ajustes={ajustes} produtos={produtos} podeEditar={op.data!.podeEditar} />;
}

/**
 * A simulação nova a partir da negociação (o Simular da ficha, a ideia "simular a partir da negociação"): o
 * nome (a empresa e o título), ligada a ela, com os produtos dela, as linhas dos modelos desses produtos e
 * a mensalidade e a ativação que ela já tem.
 */
function daFicha(f: FichaChamado, ajustes: AjustesDoSimulador, produtos: ProdutoDoSimulador[]): Rascunho {
  const codigos = f.produtos.map((p) => produtos.find((x) => x.id === p.id)?.codigo).filter((x): x is string => !!x);
  const modelos = ajustes.modelos.filter((m) => m.produto && codigos.includes(m.produto));
  const base = { ...cenarioNovo(ajustes, { id: idLocal(), nome: 'Cenário A', modelos, produtos: codigos }), mensalidade: f.valor ?? 0, ativacao: f.ativacao ?? 0 };
  // a negociação com o valor por produto: o preço de cada produto vem dela (o valor único, no primeiro)
  const porProduto = Object.keys(f.valoresDosProdutos ?? {}).length > 0 || Object.keys(f.ativacoesDosProdutos ?? {}).length > 0;
  const idDe = (cod: string) => produtos.find((p) => p.codigo === cod)?.id ?? '';
  const doProduto = (v: Record<string, number> | null | undefined, unico: number | null, cod: string, i: number) =>
    (Object.keys(v ?? {}).length ? v?.[idDe(cod)] ?? 0 : i === 0 ? unico ?? 0 : 0);
  const a = base.produtos.length >= 2 && porProduto
    ? normalizarPorProduto({ ...base, porProduto: base.produtos.map((cod, i) => ({ produto: cod, mensalidade: doProduto(f.valoresDosProdutos, f.valor, cod, i), ativacao: doProduto(f.ativacoesDosProdutos, f.ativacao, cod, i) })) })
    : base;
  const empresa = f.cliente?.nome ?? f.empresa ?? null;
  return {
    nome: [empresa, f.titulo].filter(Boolean).join(' — ').slice(0, 120), negociacaoId: f.id, cenarios: [a], principal: a.id,
    negociacao: { id: f.id, codigo: f.codigo, titulo: f.titulo, empresa, resultado: f.resultado === 'ganho' || f.resultado === 'perdido' ? f.resultado : null },
  };
}

function Editor({ chave, id, inicial, simulacao, ajustes, produtos, podeEditar }: {
  chave: string; id: string | null; inicial: Rascunho; simulacao: Simulacao | null; ajustes: AjustesDoSimulador; produtos: ProdutoDoSimulador[]; podeEditar: boolean;
}) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [r, setR] = useState<Rascunho>(inicial);
  const [aberto, setAberto] = useState(inicial.principal);
  const [lixeira, setLixeira] = useState(false);
  const [levar, setLevar] = useState(false);
  // o salvar sozinho: a última versão salva (a assinatura dela), a simulação como o servidor devolveu e o aviso
  const [idAtual, setIdAtual] = useState<string | null>(id);
  const [ultima, setUltima] = useState<Simulacao | null>(simulacao);
  const [salvo, setSalvo] = useState(() => { if (!id) return ''; const v = validar(inicial); return v.success ? estavel(v.data) : ''; });
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'salvando' | 'erro'; quando?: Date; erro?: string }>({ tipo: 'ok' });
  const validacao = useMemo(() => validar(r), [r]);
  const assinaturaDeAgora = validacao.success ? estavel(validacao.data) : null;
  const falta = validacao.success ? null : oQueFalta(validacao.error);
  const mexeu = useMemo(() => estavel(paraGravar(r)) !== estavel(paraGravar(inicial)), [r, inicial]);
  // há o que salvar: a versão de agora não é a salva (ou ainda não dá para salvar e a pessoa mexeu)
  const pendente = podeEditar && (assinaturaDeAgora == null ? mexeu || !!idAtual : assinaturaDeAgora !== salvo);
  const c = r.cenarios.find((x) => x.id === aberto) ?? r.cenarios[0]!;
  const contas = useMemo(() => r.cenarios.map((x) => contasDoCenario(x, ajustes)), [r.cenarios, ajustes]);
  const k = contas[r.cenarios.indexOf(c)]!;
  const nomeDoProduto = useCallback((codigo: string) => produtos.find((p) => p.codigo === codigo)?.nome ?? codigo, [produtos]);

  const invalidar = () => { void qc.invalidateQueries({ queryKey: [...CHAVE_DO_SIMULADOR] }); void qc.invalidateQueries({ queryKey: ['simulador-da-negociacao'] }); };
  // o que o salvar usa fica em referências: ele roda depois (o tempo de espera, a saída da tela) com o que está valendo
  const rRef = useRef(r); rRef.current = r;
  const idRef = useRef(idAtual); idRef.current = idAtual;
  const salvoRef = useRef(salvo); salvoRef.current = salvo;
  const voo = useRef<Promise<boolean> | null>(null);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  /** Salva agora o que mudou (um salvamento por vez). Devolve se ficou salvo. */
  const salvarAgora = useCallback(async (): Promise<boolean> => {
    if (!podeEditar) return true;
    while (voo.current) await voo.current;
    const v = validar(rRef.current);
    if (!v.success) return false;
    const enviada = estavel(v.data);
    if (enviada === salvoRef.current) return true;
    if (montado.current) setAviso({ tipo: 'salvando' });
    const p = (async () => {
      try {
        const antes = idRef.current;
        const s = antes ? await api.simulador.alterar(antes, v.data) : await api.simulador.criar(v.data);
        const doS = doServidor(s);
        const vs = validar(doS);
        const guardada = vs.success ? estavel(vs.data) : enviada;
        salvoRef.current = guardada;
        qc.setQueryData([...CHAVE_DO_SIMULADOR, 'simulacao', s.id], s);
        invalidar();
        if (!montado.current) return true;
        setSalvo(guardada);
        setUltima(s);
        // nada mudou enquanto salvava: a tela fica com o que o servidor guardou (a negociação como a pessoa vê)
        const v2 = validar(rRef.current);
        if (v2.success && estavel(v2.data) === enviada) { setR((x) => ({ ...x, negociacao: s.negociacao })); }
        setAviso({ tipo: 'ok', quando: new Date() });
        if (!antes) {
          idRef.current = s.id;
          setIdAtual(s.id);
          toast.push('ok', `A simulação "${s.nome}" foi criada. Daqui em diante, ela salva sozinha.`);
          nav(`/comercial/simulador/${s.id}`, { replace: true, state: { chave } });
        }
        return true;
      } catch (e) {
        if (montado.current) setAviso({ tipo: 'erro', erro: erroDoSimulador(e) });
        return false;
      }
    })();
    voo.current = p;
    try { return await p; } finally { if (voo.current === p) voo.current = null; }
  }, [podeEditar, chave]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2 segundos depois da última mudança (a nova, só quando já tem um nome)
  useEffect(() => {
    if (!podeEditar || assinaturaDeAgora == null || assinaturaDeAgora === salvo) return;
    if (!idAtual && !inicial.nome.trim() && !mexeu) return;
    const t = window.setTimeout(() => { void salvarAgora(); }, ESPERA_PARA_SALVAR);
    return () => window.clearTimeout(t);
  }, [assinaturaDeAgora, salvo, podeEditar, idAtual, mexeu, inicial.nome, salvarAgora]);
  // ao sair da tela, o que falta salvar vai junto
  useEffect(() => () => { void salvarAgora(); }, [salvarAgora]);
  // fechar a aba antes de salvar pede confirmação do navegador
  useEffect(() => {
    if (!pendente) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [pendente]);

  const mudarCenario = (m: Partial<CenarioDaSimulacao>) => setR((x) => ({ ...x, cenarios: x.cenarios.map((y) => (y.id === c.id ? { ...y, ...m } : y)) }));
  /** Antes do Levar, do Excel e do Duplicar: salva o que mudou; o que falta, o aviso diz. */
  const salvoAntes = async () => {
    if (falta) { toast.push('erro', `Antes, complete a simulação: ${falta}`); return false; }
    return salvarAgora();
  };

  const duplicar = useMutation({
    mutationFn: async () => { if (!(await salvoAntes())) throw new Error('nao-salvou'); return api.simulador.duplicar(idAtual!); },
    onSuccess: (s) => { invalidar(); toast.push('ok', `Duplicada: "${s.nome}".`); nav(`/comercial/simulador/${s.id}`); },
    onError: (e) => { if (!(e instanceof Error && e.message === 'nao-salvou')) toast.push('erro', erroDoSimulador(e)); },
  });
  const remover = useMutation({
    mutationFn: () => api.simulador.remover(idAtual!),
    onSuccess: () => { salvoRef.current = estavel(paraGravar(rRef.current)); invalidar(); toast.push('ok', `"${r.nome}" foi para a lixeira (volta pela Administração › Lixeira).`); nav('/comercial/simulador'); },
    onError: (e) => toast.push('erro', erroDoSimulador(e)),
  });

  const incluirCenario = () => {
    const novo = duplicarCenario(c, { nome: proximoNomeDeCenario(r.cenarios) });
    setR((x) => ({ ...x, cenarios: [...x.cenarios, novo] }));
    setAberto(novo.id);
  };
  const tirarCenario = () => {
    const resto = r.cenarios.filter((x) => x.id !== c.id);
    setR((x) => ({ ...x, cenarios: resto, principal: x.principal === c.id ? resto[0]!.id : x.principal }));
    setAberto(resto[0]!.id);
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1 basis-[420px]">
          <Link to="/comercial/simulador" className="link text-[13px] inline-flex items-center gap-1"><ArrowLeft size={14} /> Simulador</Link>
          <input className="mt-1 w-full bg-transparent font-display text-xl font-semibold text-ink placeholder:text-muted placeholder:font-normal rounded-md px-1 -mx-1 border border-transparent hover:border-line focus:border-accent focus:outline-none"
            value={r.nome} onChange={(e) => setR((x) => ({ ...x, nome: e.target.value }))} placeholder="O nome da simulação (o cliente, a proposta)" aria-label="O nome da simulação"
            disabled={!podeEditar} id="simulador-nome" autoFocus={!id} maxLength={120} />
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <Negociacao r={r} mudar={(n) => setR((x) => ({ ...x, negociacaoId: n?.id ?? null, negociacao: n }))} podeEditar={podeEditar} />
            {ultima && <span>Mexida em {new Date(ultima.alteradoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{ultima.alteradoPor ? ` por ${ultima.alteradoPor}` : ''}</span>}
          </div>
        </div>
        {(podeEditar || idAtual) && (
          <div className="flex flex-wrap items-center gap-2">
            {podeEditar && <AvisoDoSalvar aviso={aviso} pendente={pendente} falta={falta} nova={!idAtual} mexeu={mexeu} tentar={() => void salvarAgora()} />}
            {podeEditar && idAtual && r.negociacao && !r.negociacao.resultado && (
              <button type="button" className="btn-secondary btn-sm" onClick={async () => { if (await salvoAntes()) setLevar(true); }} disabled={!!falta} id="simulador-levar"
                title={falta ? `Antes, complete: ${falta}` : `Põe a mensalidade, a ativação e os produtos do cenário principal na ${r.negociacao.codigo}`}>
                <Send size={14} /> Levar para a {r.negociacao.codigo}
              </button>
            )}
            {idAtual && <BotaoDoExcel id={idAtual} antes={salvoAntes} falta={falta} />}
            {podeEditar && idAtual && (
              <>
                <button type="button" className="btn-ghost btn-sm" onClick={() => duplicar.mutate()} disabled={duplicar.isPending || !!falta} title={falta ? `Antes, complete: ${falta}` : 'Fazer uma cópia para outra proposta'} id="simulador-duplicar">
                  {duplicar.isPending ? <Spinner /> : <Copy size={14} />} Duplicar
                </button>
                <button type="button" className="btn-ghost btn-sm text-bad" onClick={() => setLixeira(true)} id="simulador-lixeira"><Trash2 size={14} /> Lixeira</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* os cenários: a mesma venda em versões diferentes */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4" role="tablist" aria-label="Os cenários" id="simulador-cenarios">
        {r.cenarios.map((x, i) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === c.id} onClick={() => setAberto(x.id)} data-cenario={x.id}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${x.id === c.id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong'}`}>
            {contas[i]!.sinal ? <span className={`w-2 h-2 rounded-full ${PONTO_DO_SINAL[contas[i]!.sinal!]}`} aria-hidden /> : <span className="w-2 h-2 rounded-full bg-line-strong" aria-hidden />}
            {x.nome || 'Sem nome'}
            {x.id === r.principal && r.cenarios.length > 1 && <Star size={12} className="fill-current text-signal" aria-label="o principal" />}
          </button>
        ))}
        {podeEditar && r.cenarios.length < MAX_CENARIOS && (
          <button type="button" className="btn-ghost btn-sm" onClick={incluirCenario} title={`Uma cópia do ${c.nome}, para mudar só o que difere`} id="simulador-novo-cenario">+ Cenário</button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="min-w-0 flex flex-col gap-4">
          {/* o mês a mês no alto (o Luan: "quero esse gráfico junto à tabela na parte de cima") */}
          <MesAMes k={k} prazo={c.prazo} nomeDoProduto={c.produtos.length > 1 ? nomeDoProduto : undefined} />
          <section className="card p-4 min-w-0" aria-label="O que o cliente paga" id="simulador-receita">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                {podeEditar ? (
                  <input className="input max-w-[260px] py-1.5 font-semibold" value={c.nome} onChange={(e) => mudarCenario({ nome: e.target.value })} aria-label="O nome do cenário" maxLength={40} id="simulador-nome-do-cenario" />
                ) : <h2 className="font-display font-semibold text-[15px]">{c.nome}</h2>}
                {r.cenarios.length > 1 && r.principal === c.id && <span className="chip bg-signal-soft text-signal whitespace-nowrap" title="O principal é o que a lista e a negociação mostram"><Star size={11} className="fill-current" aria-hidden /> o principal</span>}
              </div>
              {podeEditar && r.cenarios.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {r.principal !== c.id && (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setR((x) => ({ ...x, principal: c.id }))} title="O principal é o que a lista e a negociação mostram" id="simulador-tornar-principal">
                      <Star size={14} /> Tornar o principal
                    </button>
                  )}
                  <button type="button" className="btn-ghost btn-sm text-bad" onClick={tirarCenario} id="simulador-tirar-cenario"><X size={14} /> Tirar este cenário</button>
                </div>
              )}
            </div>
            <ProdutosDoCenario c={c} produtos={produtos} mudar={mudarCenario} podeEditar={podeEditar} />
            {c.porProduto && <PrecoPorProduto c={c} k={k} produtos={produtos} mudar={mudarCenario} podeEditar={podeEditar} />}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              {!c.porProduto && (
                <>
                  <label className="min-w-0">
                    <span className="label">Mensalidade</span>
                    <CampoDeReais valor={c.mensalidade} onChange={(v) => mudarCenario({ mensalidade: v ?? 0 })} disabled={!podeEditar} id="simulador-mensalidade" />
                  </label>
                  <label className="min-w-0">
                    <span className="label">Ativação</span>
                    <CampoDeReais valor={c.ativacao} onChange={(v) => mudarCenario({ ativacao: v ?? 0 })} disabled={!podeEditar} id="simulador-ativacao" />
                  </label>
                </>
              )}
              <label className="min-w-0">
                <span className="label">A ativação em</span>
                <select className="input" value={c.parcelas} onChange={(e) => mudarCenario({ parcelas: Number(e.target.value) })} disabled={!podeEditar} id="simulador-parcelas">
                  {Array.from({ length: Math.min(MAX_PARCELAS, Math.max(1, c.prazo)) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'à vista' : `${n}x`}</option>)}
                </select>
              </label>
              <label className="min-w-0">
                <span className="label">O prazo do contrato</span>
                <CampoInteiro valor={c.prazo} vazio={1} sufixo="meses" onChange={(v) => mudarCenario({ prazo: Math.max(1, Math.min(120, v)), parcelas: Math.min(c.parcelas, Math.max(1, v)) })} disabled={!podeEditar} id="simulador-prazo" />
                {podeEditar && (
                  <span className="flex flex-wrap gap-1 mt-1">
                    {PRAZOS_COMUNS.map((p) => (
                      <button key={p} type="button" onClick={() => mudarCenario({ prazo: p, parcelas: Math.min(c.parcelas, p) })}
                        className={`px-1.5 rounded text-[11.5px] font-semibold ${c.prazo === p ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:text-ink'}`}>{p}</button>
                    ))}
                  </span>
                )}
              </label>
              <label className="min-w-0">
                <span className="label">Imposto (sobre tudo)</span>
                <CampoDePercentual valor={c.imposto} onChange={(v) => mudarCenario({ imposto: Math.min(100, v ?? 0) })} disabled={!podeEditar} id="simulador-imposto" />
                {c.imposto !== ajustes.imposto && (
                  <span className="text-[11.5px] text-muted">
                    Nos Ajustes: {percentual(ajustes.imposto)}
                    {podeEditar && <> · <button type="button" className="link" onClick={() => mudarCenario({ imposto: ajustes.imposto })}>usar</button></>}
                  </span>
                )}
              </label>
            </div>
            <p className="mt-3 pt-3 border-t border-line text-[13px] text-ink-2" id="simulador-o-cliente-paga">
              O cliente paga <b className="tabular-nums">{reaisLimpo(k.mensalTotal)}</b> por mês
              {k.aluguel > 0 && <span className="text-muted"> (com {reaisLimpo(k.aluguel)} de aluguel dos aparelhos)</span>}
              {k.entradaTotal > 0 && <> e <b className="tabular-nums">{reaisLimpo(k.entradaTotal)}</b> de ativação{k.parcelas.length > 1 ? ` em ${k.parcelas.length}x` : ''}</>}
              {k.vendaDeAparelhos > 0 && <span className="text-muted"> (com {reaisLimpo(k.vendaDeAparelhos)} dos aparelhos vendidos)</span>}
              , por {c.prazo} {c.prazo === 1 ? 'mês' : 'meses'}.
            </p>
          </section>
          {/* no celular, os números ficam lá embaixo: aqui, o resumo deles */}
          <div className="lg:hidden card p-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" id="simulador-resumo-celular">
            <div>
              <div className="text-[12px] text-muted">Sobra por mês</div>
              <div className={`font-display text-lg font-semibold tabular-nums ${k.sobraMensal < 0 ? 'text-bad' : ''}`}>{reaisLimpo(k.sobraMensal)}</div>
            </div>
            <ChipDoSinal sinal={k.sinal} margem={k.margem} />
            <div className="text-[12.5px] text-ink-2">Se paga {textoDoSePagaEm(k.sePagaEm)}</div>
          </div>
          <OsCustos c={c} k={k} ajustes={ajustes} mudar={mudarCenario} podeEditar={podeEditar} nomeDoProduto={nomeDoProduto} />
          {r.cenarios.length > 1 && <LadoALado cenarios={r.cenarios} contas={contas} principal={r.principal} aberto={c.id} abrir={setAberto} />}
        </div>
        <div className="min-w-0 lg:sticky lg:top-4">
          <OsNumeros c={c} k={k} ajustes={ajustes} mudar={mudarCenario} podeEditar={podeEditar} />
        </div>
      </div>

      {/* o que não deixou salvar fica à vista também lá embaixo */}
      {podeEditar && (aviso.tipo === 'erro' || (falta && (mexeu || !!idAtual))) && (
        <div className="sticky bottom-3 mt-4 flex justify-end pointer-events-none">
          <div className={`card shadow-lg px-3 py-2 flex items-center gap-3 pointer-events-auto max-w-full ${aviso.tipo === 'erro' ? 'border-bad' : 'border-signal'}`} role="status" id="simulador-aviso-de-baixo">
            <AlertTriangle size={16} className={`shrink-0 ${aviso.tipo === 'erro' ? 'text-bad' : 'text-signal'}`} aria-hidden />
            <span className="text-[13px] text-ink-2 min-w-0">{aviso.tipo === 'erro' ? <>Não deu para salvar: {aviso.erro}</> : <>Ainda não salvo. Falta: {falta}</>}</span>
            {aviso.tipo === 'erro' && <button type="button" className="btn-primary btn-sm" onClick={() => void salvarAgora()}>Tentar de novo</button>}
          </div>
        </div>
      )}

      {levar && r.negociacao && (
        <LevarParaANegociacao negociacao={r.negociacao} cenario={cenarioPrincipal(r)} ajustes={ajustes} produtos={produtos} onFechar={() => setLevar(false)} />
      )}
      <Confirmar open={lixeira} onClose={() => setLixeira(false)} onConfirm={() => { setLixeira(false); remover.mutate(); }} perigoso botao="Mandar para a lixeira"
        titulo="Mandar a simulação para a lixeira?" texto={<>A simulação <b>{r.nome}</b> sai da lista. Quem pode restaurar tira de volta pela Administração › Lixeira.</>} loading={remover.isPending} />
    </div>
  );
}

/**
 * O aviso do salvar sozinho, no lugar do botão Salvar: "Salvando…", "Salvo às 08:42", o que falta para salvar
 * (a nova sem nome: "Dê um nome para salvar") ou o erro, com o "Tentar de novo".
 */
function AvisoDoSalvar({ aviso, pendente, falta, nova, mexeu, tentar }: {
  aviso: { tipo: 'ok' | 'salvando' | 'erro'; quando?: Date; erro?: string }; pendente: boolean; falta: string | null; nova: boolean; mexeu: boolean; tentar: () => void;
}) {
  const base = 'text-[12.5px] inline-flex items-center gap-1.5';
  if (aviso.tipo === 'erro') {
    return (
      <span className={`${base} text-bad font-semibold`} role="status" id="simulador-salvo" data-estado="erro" title={aviso.erro}>
        <AlertTriangle size={14} aria-hidden /> Não salvo <button type="button" className="link font-semibold" onClick={tentar}>Tentar de novo</button>
      </span>
    );
  }
  if (falta) {
    if (nova && !mexeu) return <span className={`${base} text-muted`} role="status" id="simulador-salvo" data-estado="falta">Dê um nome para salvar</span>;
    return <span className={`${base} text-signal font-semibold`} role="status" id="simulador-salvo" data-estado="falta" title={falta}><AlertTriangle size={14} aria-hidden /> Falta: {falta}</span>;
  }
  if (aviso.tipo === 'salvando' || pendente) return <span className={`${base} text-muted`} role="status" id="simulador-salvo" data-estado="salvando"><Spinner /> Salvando…</span>;
  return (
    <span className={`${base} text-ok font-semibold`} role="status" id="simulador-salvo" data-estado="salvo">
      <Check size={14} aria-hidden /> {aviso.quando ? `Salvo às ${aviso.quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Salvo'}
    </span>
  );
}

/**
 * O Excel (a ideia "excel" que o Luan marcou "agora"): a simulação numa planilha com as fórmulas — uma folha por
 * cenário e, com dois ou mais, a "Lado a lado". Sai do que está salvo (o que mudou é salvo antes) e fica na
 * auditoria. Na prévia, a planilha é montada aqui mesmo (a mesma do servidor); o navegador da prévia publicada
 * pode não deixar baixar, e o aviso diz isso.
 */
function BotaoDoExcel({ id, antes, falta }: { id: string; antes: () => Promise<boolean>; falta: string | null }) {
  const toast = useToast();
  const baixar = useMutation({
    mutationFn: async () => { if (!(await antes())) throw new Error('nao-salvou'); return api.simulador.planilha(id); },
    onSuccess: ({ bytes, nome }) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: TIPO_DO_XLSX }));
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      if (IS_DEMO) toast.push('ok', `A planilha ${nome} ficou pronta. Na prévia, o navegador pode não deixar baixar; no Gestor, ela baixa.`);
    },
    onError: (e) => { if (!(e instanceof Error && e.message === 'nao-salvou')) toast.push('erro', erroDoSimulador(e)); },
  });
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={() => baixar.mutate()} disabled={baixar.isPending || !!falta} id="simulador-excel"
      title={falta ? `Antes, complete: ${falta}` : 'A simulação numa planilha do Excel, com as fórmulas: uma folha por cenário'}>
      {baixar.isPending ? <Spinner /> : <FileSpreadsheet size={14} />} Excel
    </button>
  );
}

/** A negociação ligada (o código, o título e a empresa) ou o campo para ligar uma, pelo código (COM-12). */
function Negociacao({ r, mudar, podeEditar }: { r: Rascunho; mudar: (n: NegociacaoDaSimulacao | null) => void; podeEditar: boolean }) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [buscando, setBuscando] = useState(false);
  const ligar = async () => {
    const ref = codigo.trim();
    if (!/^[A-Za-z]{2,5}[\s-]*\d{1,7}$/.test(ref)) { setErro('Escreva o código da negociação, como COM-12.'); return; }
    setBuscando(true); setErro('');
    try {
      const [f, opcoes] = await Promise.all([api.atendimento.chamado(ref), api.atendimento.opcoes()]);
      const painel = opcoes.paineis.find((p) => p.id === f.painelId);
      if (painel?.tipo !== 'vendas') { setErro(`${f.codigo} é um chamado, não uma negociação.`); return; }
      mudar({ id: f.id, codigo: f.codigo, titulo: f.titulo, empresa: f.cliente?.nome ?? f.empresa ?? null, resultado: f.resultado === 'ganho' || f.resultado === 'perdido' ? f.resultado : null });
      setCodigo('');
    } catch (e) {
      setErro(e instanceof ApiError && e.status === 404 ? `Não achei a ${ref.toUpperCase()} (ou ela é de um painel que você não vê).` : erroDoSimulador(e));
    } finally { setBuscando(false); }
  };
  if (r.negociacaoId) {
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0" id="simulador-negociacao">
        {r.negociacao ? (
          <Link to={`/atendimento/${encodeURIComponent(r.negociacao.codigo)}`} className="chip bg-surface-2 text-ink-2 hover:text-accent max-w-full">
            <Link2 size={12} aria-hidden /><span className="font-mono">{r.negociacao.codigo}</span><span className="truncate font-normal">· {r.negociacao.titulo}{r.negociacao.empresa ? ` · ${r.negociacao.empresa}` : ''}</span>
            {r.negociacao.resultado && <span className={r.negociacao.resultado === 'ganho' ? 'text-ok' : 'text-bad'}>· {r.negociacao.resultado}</span>}
          </Link>
        ) : <span className="chip bg-surface-2 text-muted" title="Ligada a uma negociação de um painel que você não vê"><Link2 size={12} aria-hidden /> negociação de outro painel</span>}
        {podeEditar && r.negociacao && <button type="button" className="btn-ghost btn-sm px-1 text-muted" onClick={() => mudar(null)} title="Desligar da negociação" aria-label="Desligar da negociação"><X size={13} /></button>}
      </span>
    );
  }
  if (!podeEditar) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" id="simulador-ligar">
      <Link2 size={13} aria-hidden />
      <input className="input py-1 w-[150px] font-mono uppercase placeholder:normal-case placeholder:font-sans text-[12.5px]" value={codigo} placeholder="Ligar a COM-12"
        onChange={(e) => { setCodigo(e.target.value); setErro(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void ligar(); } }} aria-label="O código da negociação" id="simulador-negociacao-codigo" />
      <button type="button" className="btn-secondary btn-sm py-1" onClick={() => void ligar()} disabled={buscando || !codigo.trim()}>{buscando ? <Spinner /> : 'Ligar'}</button>
      <span className="text-[12px]">{erro ? <span className="text-bad">{erro}</span> : 'opcional: a negociação mostra a margem'}</span>
    </span>
  );
}

/**
 * Os produtos do catálogo que a venda leva (o "Levar para a negociação" põe estes nela). Pôr ou tirar um produto
 * refaz o preço por produto (o que entra começa com zero; o que sai leva o preço dele). Com dois produtos ou
 * mais, o preço é um só ou por produto (a proposta de cada um, numa negociação só).
 */
function ProdutosDoCenario({ c, produtos, mudar, podeEditar }: { c: CenarioDaSimulacao; produtos: ProdutoDoSimulador[]; mudar: (m: Partial<CenarioDaSimulacao>) => void; podeEditar: boolean }) {
  const nome = (codigo: string) => produtos.find((p) => p.codigo === codigo)?.nome ?? codigo;
  const fora = produtos.filter((p) => !c.produtos.includes(p.codigo));
  const comProdutos = (lista: string[]) => {
    const n = normalizarPorProduto({ ...c, produtos: lista });
    return { produtos: n.produtos, porProduto: n.porProduto, mensalidade: n.mensalidade, ativacao: n.ativacao };
  };
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12.5px]" id="simulador-produtos">
      <span className="text-ink-2 font-semibold mr-0.5">Produtos</span>
      {c.produtos.map((cod) => (
        <span key={cod} className="chip bg-surface-2 text-ink-2" data-produto={cod}>
          {nome(cod)}
          {podeEditar && <button type="button" className="text-muted hover:text-bad" onClick={() => mudar(comProdutos(c.produtos.filter((x) => x !== cod)))} aria-label={`Tirar ${nome(cod)}`}><X size={12} /></button>}
        </span>
      ))}
      {!c.produtos.length && <span className="text-muted">nenhum</span>}
      {podeEditar && fora.length > 0 && (
        <select className="input !w-auto !py-0.5 !pl-2 !text-[12.5px]" value="" onChange={(e) => e.target.value && mudar(comProdutos([...c.produtos, e.target.value]))} aria-label="Pôr um produto" id="simulador-produto-incluir">
          <option value="">+ produto</option>
          {fora.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}
        </select>
      )}
      {c.produtos.length >= 2 && (
        <span className="ml-auto inline-flex rounded-lg border border-line-strong overflow-hidden" role="radiogroup" aria-label="O preço" id="simulador-modo-do-preco">
          {([['um', 'Um valor só'], ['produto', 'Por produto']] as const).map(([v, rotulo]) => {
            const marcado = v === 'produto' ? !!c.porProduto : !c.porProduto;
            return (
              <button key={v} type="button" role="radio" aria-checked={marcado} disabled={!podeEditar} data-modo={v}
                onClick={() => { if (marcado) return; const n = v === 'produto' ? comPrecoPorProduto(c) : { ...c, porProduto: null }; mudar({ porProduto: n.porProduto, mensalidade: n.mensalidade, ativacao: n.ativacao }); }}
                className={`px-2.5 py-1 text-[12px] font-semibold border-r border-line-strong last:border-r-0 ${marcado ? 'bg-accent-soft text-accent-ink' : 'bg-surface text-ink-2 hover:bg-surface-2'}`}>
                {rotulo}
              </button>
            );
          })}
        </span>
      )}
    </div>
  );
}

/**
 * O preço de cada produto (a proposta de cada um, numa negociação só): a mensalidade e a ativação de cada
 * produto, e o total, que é o do cenário. O aparelho vendido ou alugado entra no produto da linha dele.
 */
function PrecoPorProduto({ c, k, produtos, mudar, podeEditar }: {
  c: CenarioDaSimulacao; k: ContasDoCenario; produtos: ProdutoDoSimulador[]; mudar: (m: Partial<CenarioDaSimulacao>) => void; podeEditar: boolean;
}) {
  const nome = (codigo: string) => produtos.find((p) => p.codigo === codigo)?.nome ?? codigo;
  const pagamento = pagamentoPorProduto(c, k) ?? [];
  const mudarPreco = (produto: string, m: { mensalidade?: number; ativacao?: number }) => {
    const n = normalizarPorProduto({ ...c, porProduto: (c.porProduto ?? []).map((x) => (x.produto === produto ? { ...x, ...m } : x)) });
    mudar({ porProduto: n.porProduto, mensalidade: n.mensalidade, ativacao: n.ativacao });
  };
  return (
    <div className="mb-3 rounded-lg border border-line p-3" id="simulador-por-produto">
      {/* no celular, o nome do produto fica numa linha e os dois campos embaixo */}
      <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,132px)_minmax(0,132px)] gap-x-2 gap-y-1.5 items-center">
        <span className="hidden sm:block text-[11.5px] font-semibold text-muted">Produto</span>
        <span className="text-[11.5px] font-semibold text-muted">Mensalidade</span>
        <span className="text-[11.5px] font-semibold text-muted">Ativação</span>
        {(c.porProduto ?? []).map((x) => {
          const pg = pagamento.find((y) => y.produto === x.produto);
          return (
            <div key={x.produto} className="contents" data-produto-preco={x.produto}>
              <span className="min-w-0 col-span-2 sm:col-span-1 pt-1 sm:pt-0 text-[13px] font-semibold text-ink-2">
                <span className="block truncate">{nome(x.produto)}</span>
                {pg && (pg.aluguel > 0 || pg.venda > 0) && (
                  <span className="block text-[11.5px] font-normal text-muted">
                    + {[pg.aluguel > 0 ? `${reaisLimpo(pg.aluguel)}/mês de aluguel` : '', pg.venda > 0 ? `${reaisLimpo(pg.venda)} de aparelhos vendidos` : ''].filter(Boolean).join(' e ')}
                  </span>
                )}
              </span>
              <CampoDeReais valor={x.mensalidade} onChange={(v) => mudarPreco(x.produto, { mensalidade: v ?? 0 })} disabled={!podeEditar} aria-label={`A mensalidade do ${nome(x.produto)}`} data-campo="mensalidade-do-produto" />
              <CampoDeReais valor={x.ativacao} onChange={(v) => mudarPreco(x.produto, { ativacao: v ?? 0 })} disabled={!podeEditar} aria-label={`A ativação do ${nome(x.produto)}`} data-campo="ativacao-do-produto" />
            </div>
          );
        })}
        <span className="col-span-2 sm:col-span-1 text-[13px] font-semibold pt-1.5 border-t border-line">Total</span>
        <span className="text-[13.5px] font-semibold tabular-nums text-right pt-1.5 sm:border-t border-line pr-3" id="simulador-mensalidade-total">{reaisLimpo(c.mensalidade)}</span>
        <span className="text-[13.5px] font-semibold tabular-nums text-right pt-1.5 sm:border-t border-line pr-3" id="simulador-ativacao-total">{reaisLimpo(c.ativacao)}</span>
      </div>
    </div>
  );
}

/**
 * Levar para a negociação (a ideia marcada "agora"): a mensalidade, a ativação e os produtos do cenário
 * principal vão para a negociação — o que ela tem hoje e o que vai ficar, antes do ok. O valor por produto
 * dela vira o valor único (a simulação não divide a mensalidade por produto). A mudança fica no histórico da
 * negociação, como qualquer outra.
 */
function LevarParaANegociacao({ negociacao, cenario, ajustes, produtos, onFechar }: {
  negociacao: NegociacaoDaSimulacao; cenario: CenarioDaSimulacao; ajustes: AjustesDoSimulador; produtos: ProdutoDoSimulador[]; onFechar: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const ficha = useQuery({ queryKey: ['simulador-levar', negociacao.id], queryFn: () => api.atendimento.chamado(negociacao.id), staleTime: 0 });
  const k = contasDoCenario(cenario, ajustes);
  const idDe = (cod: string) => produtos.find((p) => p.codigo === cod)?.id;
  const ids = cenario.produtos.map(idDe).filter((x): x is string => !!x);
  const nomes = cenario.produtos.map((cod) => produtos.find((p) => p.codigo === cod)?.nome ?? cod);
  // o preço por produto vai como o valor por produto da negociação (todos os produtos no catálogo); o aparelho
  // vendido ou alugado entra no produto dele
  const pagamento = ids.length === cenario.produtos.length ? pagamentoPorProduto(cenario, k) : null;
  const valores = pagamento ? Object.fromEntries(pagamento.map((x) => [idDe(x.produto)!, x.mensalidade + x.aluguel])) : null;
  const ativacoes = pagamento && pagamento.some((x) => x.ativacao + x.venda > 0) ? Object.fromEntries(pagamento.map((x) => [idDe(x.produto)!, x.ativacao + x.venda])) : null;
  const levar = useMutation({
    mutationFn: () => api.atendimento.alterar(negociacao.id, {
      valor: valores ? k.mensalTotal : k.mensalTotal || null, valoresDosProdutos: valores,
      ativacao: ativacoes ? k.entradaTotal : k.entradaTotal || null, ativacoesDosProdutos: ativacoes,
      ...(ids.length ? { produtos: ids } : {}),
    }),
    onSuccess: (f) => {
      void qc.invalidateQueries({ queryKey: ['atendimento'] });
      void qc.invalidateQueries({ queryKey: ['simulador-da-negociacao'] });
      toast.push('ok', `A ${f.codigo} ficou com a mensalidade de ${reaisLimpo(f.valor ?? 0)} e a ativação de ${reaisLimpo(f.ativacao ?? 0)}.`);
      onFechar();
    },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  const f = ficha.data;
  const porProduto = !!f && (Object.keys(f.valoresDosProdutos ?? {}).length > 0 || Object.keys(f.ativacoesDosProdutos ?? {}).length > 0);
  // nada a levar: a negociação já está com estes números (e estes produtos, e o mesmo valor de cada um)
  const mesmosProdutos = !!f && (!ids.length || (ids.length === f.produtos.length && ids.every((x) => f.produtos.some((p) => p.id === x))));
  const igual = !!f && (f.valor ?? 0) === k.mensalTotal && (f.ativacao ?? 0) === k.entradaTotal && mesmosProdutos
    && mesmoValorPorProduto(f.valoresDosProdutos, valores) && mesmoValorPorProduto(f.ativacoesDosProdutos, ativacoes);
  return (
    <Modal open onClose={onFechar} titulo={`Levar para a ${negociacao.codigo}`}
      rodape={<>
        <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={() => levar.mutate()} disabled={levar.isPending || !f || igual} id="simulador-levar-confirmar">{levar.isPending && <Spinner className="!text-white" />} Levar</button>
      </>}>
      {ficha.isLoading ? <Carregando /> : ficha.isError ? <p className="text-bad text-sm">{mensagemErro(ficha.error)}</p> : f && (
        <div className="flex flex-col gap-3 text-[13.5px]" id="simulador-levar-janela">
          <p className="text-ink-2">O cenário <b>{cenario.nome}</b> vai para a negociação <b>{f.codigo} · {f.titulo}</b>:</p>
          <table className="w-full">
            <thead><tr className="text-[12px] text-muted text-left"><th className="font-semibold py-1" /><th className="font-semibold py-1">Hoje</th><th className="font-semibold py-1">Fica</th></tr></thead>
            <tbody>
              <tr className="border-t border-line"><td className="py-1.5 text-ink-2">Mensalidade</td><td className="tabular-nums">{f.valor == null ? '—' : reaisLimpo(f.valor)}</td><td className="tabular-nums font-semibold">{reaisLimpo(k.mensalTotal)}</td></tr>
              <tr className="border-t border-line"><td className="py-1.5 text-ink-2">Ativação</td><td className="tabular-nums">{f.ativacao == null ? '—' : reaisLimpo(f.ativacao)}</td><td className="tabular-nums font-semibold">{reaisLimpo(k.entradaTotal)}</td></tr>
              <tr className="border-t border-line"><td className="py-1.5 text-ink-2">Produtos</td><td>{f.produtos.map((p) => p.nome).join(', ') || '—'}</td><td className="font-semibold">{ids.length ? nomes.join(', ') : 'ficam como estão'}</td></tr>
            </tbody>
          </table>
          {pagamento && (
            <div className="rounded-lg bg-surface-2 px-3 py-2" id="simulador-levar-por-produto">
              <div className="text-[12px] font-semibold text-muted mb-1">O valor de cada produto (fica)</div>
              <ul className="flex flex-col gap-0.5">
                {pagamento.map((x) => (
                  <li key={x.produto} className="flex flex-wrap justify-between gap-x-3">
                    <span className="text-ink-2">{produtos.find((p) => p.codigo === x.produto)?.nome ?? x.produto}</span>
                    <span className="tabular-nums"><b>{reaisLimpo(x.mensalidade + x.aluguel)}</b>/mês{x.ativacao + x.venda > 0 ? <> · <b>{reaisLimpo(x.ativacao + x.venda)}</b> de ativação</> : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {porProduto && !pagamento && <p className="text-[12.5px] text-signal">A {f.codigo} tem o valor por produto: ela passa a ter um valor só (esta simulação tem um preço só).</p>}
          {igual
            ? <p className="text-[12.5px] text-ok font-semibold" id="simulador-levar-igual">A {f.codigo} já está com estes números: não há o que levar.</p>
            : <p className="text-[12.5px] text-muted">A mudança fica no histórico da negociação. A margem dela aparece na ficha, em Simulações.</p>}
        </div>
      )}
    </Modal>
  );
}
