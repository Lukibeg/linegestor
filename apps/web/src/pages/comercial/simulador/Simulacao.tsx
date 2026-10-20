/**
 * Uma simulação do Comercial (Patch 2.0.2, decisão 0052): o nome, a negociação ligada (se a pessoa quiser),
 * os cenários (até 3: a mesma venda em versões diferentes, lado a lado) e, em cada cenário, o que o cliente
 * paga, os custos e os números — que mudam enquanto a pessoa escreve. Nada vai para o servidor até o Salvar
 * (a conta é a mesma do `@gestor/shared`, a do servidor). A nova (`/comercial/simulador/nova?modelo=…`)
 * começa em branco ou com as linhas de um modelo; o imposto, o prazo e a margem que se quer vêm dos Ajustes.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Link2, Star, Trash2, X } from 'lucide-react';
import {
  MAX_CENARIOS, MAX_PARCELAS, PRAZOS_COMUNS, cenarioNovo, contasDoCenario, duplicarCenario, idLocal, percentual, proximoNomeDeCenario, textoDoSePagaEm,
  type AjustesDoSimulador, type CenarioDaSimulacao, type NegociacaoDaSimulacao, type Simulacao, type SimulacaoGravar,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { ApiError } from '../../../api/types.js';
import { Carregando, Confirmar, Spinner, Vazio, useToast } from '../../../components/ui/index.js';
import { useAuth } from '../../../lib/auth.js';
import { CHAVE_DO_SIMULADOR, CampoDePercentual, CampoDeReais, CampoInteiro, ChipDoSinal, PONTO_DO_SINAL, erroDoSimulador, reaisLimpo, useOpcoesDoSimulador } from './comum.js';
import { OsCustos } from './Custos.js';
import { SemOComercial } from './Lista.js';
import { LadoALado, OsNumeros } from './Numeros.js';

/** O que a tela edita: o que vai para o servidor e a negociação ligada, para mostrar. */
type Rascunho = SimulacaoGravar & { negociacao: NegociacaoDaSimulacao | null };
const paraGravar = (r: Rascunho): SimulacaoGravar => ({ nome: r.nome, negociacaoId: r.negociacaoId, cenarios: r.cenarios, principal: r.principal });
const assinatura = (r: Rascunho) => JSON.stringify(paraGravar(r));
const doServidor = (s: Simulacao): Rascunho => ({ nome: s.nome, negociacaoId: s.negociacaoId, negociacao: s.negociacao, cenarios: s.cenarios, principal: s.principal });

export function SimulacaoDoComercial() {
  const { can } = useAuth();
  const { id = 'nova' } = useParams();
  const nova = id === 'nova';
  const [params] = useSearchParams();
  const op = useOpcoesDoSimulador();
  const lida = useQuery({ queryKey: [...CHAVE_DO_SIMULADOR, 'simulacao', id], queryFn: () => api.simulador.ler(id), enabled: !nova && can('sales.read') });
  if (!can('sales.read')) return <SemOComercial />;
  if (op.isLoading || (!nova && lida.isLoading)) return <Carregando />;
  if (op.isError) return <p className="text-bad text-sm" role="alert">{erroDoSimulador(op.error)}</p>;
  if (!nova && lida.isError) {
    const sumiu = lida.error instanceof ApiError && lida.error.status === 404;
    return (
      <Vazio titulo={sumiu ? 'Simulação não encontrada' : 'Não deu para abrir a simulação'} texto={sumiu ? 'Ela pode ter ido para a lixeira.' : erroDoSimulador(lida.error)}
        acao={<Link to="/comercial/simulador" className="btn-secondary"><ArrowLeft size={15} /> Ver as simulações</Link>} />
    );
  }
  const ajustes = op.data!.ajustes;
  const inicial: Rascunho = nova ? (() => {
    const modelo = ajustes.modelos.find((m) => m.id === params.get('modelo')) ?? null;
    const a = cenarioNovo(ajustes, { id: idLocal(), nome: 'Cenário A', modelo });
    return { nome: '', negociacaoId: null, negociacao: null, cenarios: [a], principal: a.id };
  })() : doServidor(lida.data!);
  return <Editor key={nova ? `nova-${params.get('modelo') ?? ''}` : id} id={nova ? null : id} inicial={inicial} simulacao={nova ? null : lida.data!} ajustes={ajustes} podeEditar={op.data!.podeEditar} />;
}

function Editor({ id, inicial, simulacao, ajustes, podeEditar }: { id: string | null; inicial: Rascunho; simulacao: Simulacao | null; ajustes: AjustesDoSimulador; podeEditar: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [r, setR] = useState<Rascunho>(inicial);
  const [salvo, setSalvo] = useState(() => (id ? assinatura(inicial) : ''));
  const [aberto, setAberto] = useState(inicial.principal);
  const [lixeira, setLixeira] = useState(false);
  const sujo = assinatura(r) !== salvo;
  const c = r.cenarios.find((x) => x.id === aberto) ?? r.cenarios[0]!;
  const contas = useMemo(() => r.cenarios.map((x) => contasDoCenario(x, ajustes)), [r.cenarios, ajustes]);
  const k = contas[r.cenarios.indexOf(c)]!;

  // fechar a aba com o que não foi salvo pede confirmação do navegador
  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [sujo]);

  const mudarCenario = (m: Partial<CenarioDaSimulacao>) => setR((x) => ({ ...x, cenarios: x.cenarios.map((y) => (y.id === c.id ? { ...y, ...m } : y)) }));
  const invalidar = () => { void qc.invalidateQueries({ queryKey: [...CHAVE_DO_SIMULADOR] }); void qc.invalidateQueries({ queryKey: ['simulador-da-negociacao'] }); };

  const salvar = useMutation({
    mutationFn: () => (id ? api.simulador.alterar(id, paraGravar(r)) : api.simulador.criar(paraGravar(r))),
    onSuccess: (s) => {
      const novo = doServidor(s);
      setR(novo); setSalvo(assinatura(novo));
      qc.setQueryData([...CHAVE_DO_SIMULADOR, 'simulacao', s.id], s);
      invalidar();
      toast.push('ok', id ? 'Simulação salva.' : `A simulação "${s.nome}" foi criada.`);
      if (!id) nav(`/comercial/simulador/${s.id}`, { replace: true });
    },
    onError: (e) => toast.push('erro', erroDoSimulador(e)),
  });
  const duplicar = useMutation({
    mutationFn: () => api.simulador.duplicar(id!),
    onSuccess: (s) => { invalidar(); toast.push('ok', `Duplicada: "${s.nome}".`); nav(`/comercial/simulador/${s.id}`); },
    onError: (e) => toast.push('erro', erroDoSimulador(e)),
  });
  const remover = useMutation({
    mutationFn: () => api.simulador.remover(id!),
    onSuccess: () => { invalidar(); toast.push('ok', `"${r.nome}" foi para a lixeira (volta pela Administração › Lixeira).`); nav('/comercial/simulador'); },
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
            {simulacao && <span>Mexida em {new Date(simulacao.alteradoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{simulacao.alteradoPor ? ` por ${simulacao.alteradoPor}` : ''}</span>}
          </div>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            {sujo && id && <span className="text-[12.5px] text-signal font-semibold" role="status">Não salvo</span>}
            {id && (
              <>
                <button type="button" className="btn-ghost btn-sm" onClick={() => duplicar.mutate()} disabled={duplicar.isPending || sujo} title={sujo ? 'Salve antes de duplicar' : 'Fazer uma cópia para outra proposta'} id="simulador-duplicar">
                  {duplicar.isPending ? <Spinner /> : <Copy size={14} />} Duplicar
                </button>
                <button type="button" className="btn-ghost btn-sm text-bad" onClick={() => setLixeira(true)} id="simulador-lixeira"><Trash2 size={14} /> Lixeira</button>
              </>
            )}
            <button type="button" className="btn-primary" onClick={() => salvar.mutate()} disabled={salvar.isPending || (!!id && !sujo)} id="simulador-salvar">
              {salvar.isPending && <Spinner className="!text-white" />} {id ? 'Salvar' : 'Criar a simulação'}
            </button>
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
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              <label className="min-w-0">
                <span className="label">Mensalidade</span>
                <CampoDeReais valor={c.mensalidade} onChange={(v) => mudarCenario({ mensalidade: v ?? 0 })} disabled={!podeEditar} id="simulador-mensalidade" />
              </label>
              <label className="min-w-0">
                <span className="label">Ativação</span>
                <CampoDeReais valor={c.ativacao} onChange={(v) => mudarCenario({ ativacao: v ?? 0 })} disabled={!podeEditar} id="simulador-ativacao" />
              </label>
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
                <span className="label">Ramais</span>
                <CampoInteiro valor={c.ramais} onChange={(v) => mudarCenario({ ramais: Math.min(10_000, v) })} disabled={!podeEditar} id="simulador-ramais" />
                <span className="text-[11.5px] text-muted">os custos "por ramal" acompanham</span>
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
          <OsCustos c={c} k={k} ajustes={ajustes} mudar={mudarCenario} podeEditar={podeEditar} />
          {r.cenarios.length > 1 && <LadoALado cenarios={r.cenarios} contas={contas} principal={r.principal} aberto={c.id} abrir={setAberto} />}
        </div>
        <div className="min-w-0 lg:sticky lg:top-4">
          <OsNumeros c={c} k={k} ajustes={ajustes} mudar={mudarCenario} podeEditar={podeEditar} />
        </div>
      </div>

      {sujo && podeEditar && (
        <div className="sticky bottom-3 mt-4 flex justify-end pointer-events-none">
          <div className="card shadow-lg px-3 py-2 flex items-center gap-3 pointer-events-auto" role="status">
            <span className="text-[13px] text-ink-2">{id ? 'Você mudou a simulação.' : 'A simulação ainda não foi criada.'}</span>
            {id && <button type="button" className="btn-ghost btn-sm" onClick={() => { setR(doServidor(simulacao!)); setAberto(simulacao!.principal); }}>Descartar</button>}
            <button type="button" className="btn-primary btn-sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>{salvar.isPending && <Spinner className="!text-white" />} {id ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      )}

      <Confirmar open={lixeira} onClose={() => setLixeira(false)} onConfirm={() => { setLixeira(false); remover.mutate(); }} perigoso botao="Mandar para a lixeira"
        titulo="Mandar a simulação para a lixeira?" texto={<>A simulação <b>{r.nome}</b> sai da lista. Quem pode restaurar tira de volta pela Administração › Lixeira.</>} loading={remover.isPending} />
    </div>
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


