/**
 * A ficha do projeto: é aqui que o trabalho acontece.
 *
 *  - em cima, o **painel**: quanto já foi, o que está travado, quanto falta para cada responsável
 *  - no meio, a **tabela de clientes × etapas**: uma caixinha por etapa, clicou marcou
 *  - embaixo, **comentários e anexos** do projeto (cada cliente também tem os seus)
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Check, Copy, MessageSquare, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { api } from '../../api/index.js';
import type { ClienteDoProjeto, Projeto, SituacaoProjeto } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Carregando, Chip, Confirmar, Modal, Spinner, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { data, relativo } from '../../lib/format.js';
import { contar, TdN, ThN } from '../../lib/contagem.js';
import { EscolherClientes } from './EscolherClientes.js';
import { ProjetoForm } from './Form.js';
import { Andamento, ChipSituacao, CHIP_SELECT, FAIXA, Numero, SITUACAO } from './partes.js';
import { Anexos, Comentarios } from './Conversa.js';

export function ProjetoFicha() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['projeto', id], queryFn: () => api.projetos.get(id) });

  const [editar, setEditar] = useState(false);
  const [incluir, setIncluir] = useState(false);
  const [excluir, setExcluir] = useState(false);
  /** O filtro da tabela: por situação, ou por uma faixa de uma etapa ("quem está em Pendente envio"). */
  type Filtro = { tipo: 'situacao'; valor: SituacaoProjeto } | { tipo: 'etapa'; stepId: string; valor: string };
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [travando, setTravando] = useState<ClienteDoProjeto | null>(null);
  const [tirar, setTirar] = useState<ClienteDoProjeto | null>(null);

  const alternarEtapa = (stepId: string, valor: string) =>
    setFiltro((f) => (f?.tipo === 'etapa' && f.stepId === stepId && f.valor === valor ? null : { tipo: 'etapa', stepId, valor }));

  const recarregar = () => qc.invalidateQueries({ queryKey: ['projeto', id] });
  const erro = (e: unknown) => toast.push('erro', mensagemErro(e));

  const salvar = useMutation({ mutationFn: (d: Record<string, unknown>) => api.projetos.atualizar(id, d), onSuccess: () => { recarregar(); qc.invalidateQueries({ queryKey: ['projetos'] }); setEditar(false); toast.push('ok', 'Projeto salvo'); }, onError: erro });
  const addClientes = useMutation({ mutationFn: (ids: string[]) => api.projetos.addClientes(id, ids), onSuccess: () => { recarregar(); setIncluir(false); toast.push('ok', 'Clientes acrescentados'); }, onError: erro });
  const removerCliente = useMutation({ mutationFn: (linhaId: string) => api.projetos.removerCliente(id, linhaId), onSuccess: () => { recarregar(); setTirar(null); toast.push('ok', 'Cliente tirado do projeto'); }, onError: erro });
  const marcar = useMutation({ mutationFn: (v: { linhaId: string; stepId: string; d: { feito?: boolean; valor?: string | null } }) => api.projetos.marcar(id, v.linhaId, v.stepId, v.d), onSuccess: recarregar, onError: erro });
  const linha = useMutation({ mutationFn: (v: { linhaId: string; d: Record<string, unknown> }) => api.projetos.linha(id, v.linhaId, v.d), onSuccess: () => { recarregar(); setTravando(null); }, onError: erro });
  const duplicar = useMutation({
    mutationFn: () => api.projetos.duplicar(id),
    onSuccess: (novo) => { qc.invalidateQueries({ queryKey: ['projetos'] }); toast.push('ok', 'Projeto duplicado — a lista e as etapas vieram junto, zeradas'); navigate(`/projetos/${novo.id}`); },
    onError: erro,
  });
  const apagar = useMutation({ mutationFn: () => api.projetos.remover(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['projetos'] }); toast.push('ok', 'Projeto na lixeira'); navigate('/projetos'); }, onError: erro });

  const p = q.data;
  const clientes = useMemo(() => (p?.clientes ?? []).filter((c) => {
    if (!filtro) return true;
    if (filtro.tipo === 'situacao') return c.status === filtro.valor;
    const etapa = p?.etapas.find((e) => e.id === filtro.stepId);
    const marca = c.feitas.find((f) => f.stepId === filtro.stepId);
    if (!etapa) return true;
    if (etapa.kind === 'escolha') return (marca?.valor ?? '') === filtro.valor;
    return filtro.valor === 'feito' ? !!marca : !marca;
  }), [p, filtro]);

  if (q.isLoading || !p) return <Pagina titulo="Projeto"><Carregando /></Pagina>;
  const r = p.resumo;

  return (
    <Pagina
      titulo={<span className="flex flex-wrap items-center gap-2">{p.name}
        {p.status === 'concluido' && <Chip tone="ok">concluído</Chip>}
        {p.status === 'cancelado' && <Chip tone="muted">cancelado</Chip>}
        {r.atrasado && <Chip tone="bad">atrasado</Chip>}
      </span>}
      sub={p.goal ?? undefined}
      voltar={<Link to="/projetos" className="btn-ghost btn-sm text-muted"><ArrowLeft size={15} /> Projetos</Link>}
      acoes={p.podeGerenciar ? (
        <div className="flex flex-wrap gap-2">
          {p.status === 'aberto'
            ? <button className="btn-secondary" onClick={() => salvar.mutate({ status: 'concluido' })}><Check size={15} /> Encerrar projeto</button>
            : <button className="btn-secondary" onClick={() => salvar.mutate({ status: 'aberto' })}>Reabrir</button>}
          <button className="btn-secondary" onClick={() => setEditar(true)}><Pencil size={15} /> Editar</button>
          <button className="btn-ghost" disabled={duplicar.isPending} onClick={() => duplicar.mutate()} title="Cria outro projeto com as mesmas etapas e a mesma lista de clientes, tudo zerado">
            {duplicar.isPending ? <Spinner /> : <Copy size={15} />} Duplicar
          </button>
          <button className="btn-ghost text-bad" onClick={() => setExcluir(true)} aria-label="Mandar para a lixeira"><Trash2 size={15} /></button>
        </div>
      ) : undefined}
    >
      {/* ---------- painel ---------- */}
      <section className="card p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-muted">
          {p.ownerName && <span className="flex items-center gap-1"><UserRound size={13} /> responsável: <b className="text-ink">{p.ownerName}</b></span>}
          {p.dueDate && <span className={`flex items-center gap-1 ${r.atrasado ? 'text-bad' : ''}`}><CalendarClock size={13} /> prazo: {data(p.dueDate)}</span>}
          <span>{r.etapasFeitas} de {r.etapasTotais} etapa(s) marcadas</span>
        </div>

        <Andamento pct={r.andamento} total={r.total} faltam={r.faltam} altura="h-3" />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(SITUACAO) as SituacaoProjeto[]).map((s) => (
            <Numero key={s} label={SITUACAO[s].rotulo} valor={r.contagem[s] ?? 0}
              tone={s === 'travado' ? 'signal' : s === 'concluido' ? 'ok' : s === 'andamento' ? 'accent' : s === 'nao_se_aplica' ? 'muted' : 'neutral'}
              ativo={filtro?.tipo === 'situacao' && filtro.valor === s}
              onClick={() => setFiltro(filtro?.tipo === 'situacao' && filtro.valor === s ? null : { tipo: 'situacao', valor: s })} />
          ))}
        </div>

      </section>

      {/* ---------- como está cada passo ---------- */}
      {r.porEtapa.length > 0 && r.total > 0 && (
        <section className="card p-4 mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="font-display font-semibold">Como está cada passo</h2>
            <span className="text-[12px] text-muted">Clique num número para ver só esses clientes.</span>
          </div>
          <div className="flex flex-col gap-3">
            {r.porEtapa.map((e) => (
              <div key={e.stepId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{e.title}</span>
                  <span className="text-[12px] text-muted tnum">{e.resolvidas} de {e.total} resolvido(s)</span>
                </div>

                {/* a barra: uma faixa por opção, na cor dela */}
                <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-2 my-1.5">
                  {e.faixas.filter((f) => f.n > 0).map((f) => (
                    <button
                      key={f.valor || 'vazio'}
                      type="button"
                      onClick={() => alternarEtapa(e.stepId, f.valor)}
                      style={{ width: `${(f.n / Math.max(e.total, 1)) * 100}%` }}
                      className={`h-full ${FAIXA[f.tone]} hover:opacity-80`}
                      title={`${f.label}: ${f.n}`}
                      aria-label={`${e.title} — ${f.label}: ${f.n}`}
                    />
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {e.faixas.map((f) => {
                    const ativo = filtro?.tipo === 'etapa' && filtro.stepId === e.stepId && filtro.valor === f.valor;
                    return (
                      <button key={f.valor || 'vazio'} type="button" onClick={() => alternarEtapa(e.stepId, f.valor)}
                        className={`rounded-full px-2 py-0.5 text-[12px] border ${ativo ? 'ring-2 ring-accent' : ''} ${f.n === 0 ? 'opacity-50' : ''} ${CHIP_SELECT[f.tone]}`}
                        title={f.conclui ? 'Esta opção resolve a etapa' : 'Esta opção deixa a etapa em aberto'}>
                        {f.label}{f.conclui ? ' ✓' : ''} <b className="tnum">{f.n}</b>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- a lista de clientes ---------- */}
      <section className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
          <h2 className="font-display font-semibold">
            Clientes {filtro && <button className="btn-ghost btn-sm text-muted" onClick={() => setFiltro(null)}>mostrando só: {rotuloDoFiltro(p, filtro)} ✕</button>}
          </h2>
          {p.podeGerenciar && p.status === 'aberto' && <button className="btn-secondary btn-sm" onClick={() => setIncluir(true)}><Plus size={14} /> Acrescentar clientes</button>}
        </div>

        {!p.clientes.length ? (
          <div className="p-4"><Vazio titulo="Nenhum cliente na lista" texto="Acrescente os clientes que vão passar por este projeto." /></div>
        ) : !clientes.length ? (
          <div className="p-4 text-sm text-muted">Nenhum cliente nesta situação.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <ThN />
                  <th>Cliente</th>
                  {p.etapas.map((e) => <th key={e.id} className={`whitespace-nowrap ${e.kind === 'escolha' ? '' : 'text-center'}`}>{e.title}</th>)}
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clientes.map((c, i) => (
                  <Linha key={c.id} c={c} i={i} p={p}
                    onMarcar={(stepId, d) => marcar.mutate({ linhaId: c.id, stepId, d })}
                    onSituacao={(status) => status === 'travado' ? setTravando(c) : linha.mutate({ linhaId: c.id, d: { status } })}
                    onAbrir={() => setAberto(aberto === c.id ? null : c.id)}
                    onTirar={() => setTirar(c)}
                    aberto={aberto === c.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

      </section>

      {/* ---------- conversa e arquivos do projeto ---------- */}
      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <Comentarios projeto={p} onMudou={recarregar} />
        <Anexos projeto={p} onMudou={recarregar} />
      </div>

      {editar && <ProjetoForm projeto={p} onClose={() => setEditar(false)} onSalvar={(d) => salvar.mutate(d)} salvando={salvar.isPending} />}
      {incluir && (
        <EscolherClientes
          jaNaLista={p.clientes.map((c) => c.clientId)}
          escolhidos={[]}
          onClose={() => setIncluir(false)}
          onConfirmar={(ids) => addClientes.mutate(ids)}
          salvando={addClientes.isPending}
        />
      )}
      {travando && <Travar cliente={travando} onClose={() => setTravando(null)} onConfirmar={(motivo) => linha.mutate({ linhaId: travando.id, d: { status: 'travado', blockedReason: motivo } })} salvando={linha.isPending} />}
      <Confirmar open={!!tirar} onClose={() => setTirar(null)} onConfirm={() => tirar && removerCliente.mutate(tirar.id)}
        titulo="Tirar do projeto" perigoso loading={removerCliente.isPending}
        texto={<>Tirar <b>{tirar?.clientName}</b> do projeto apaga o que já foi marcado nele. Os comentários e anexos daquele cliente somem junto.</>} />
      <Confirmar open={excluir} onClose={() => setExcluir(false)} onConfirm={() => apagar.mutate()}
        titulo="Mandar o projeto para a lixeira" perigoso loading={apagar.isPending}
        texto={<>O projeto <b>{p.name}</b> sai da lista. Nada é apagado de verdade — dá para restaurar na lixeira.</>} />
    </Pagina>
  );
}

/** Uma linha da tabela: as caixinhas das etapas, a situação, o responsável e a conversa daquele cliente. */
function Linha({ c, i, p, onMarcar, onSituacao, onAbrir, onTirar, aberto }: {
  c: ClienteDoProjeto; i: number; p: Projeto;
  onMarcar: (stepId: string, d: { feito?: boolean; valor?: string | null }) => void;
  onSituacao: (status: SituacaoProjeto) => void;
  onAbrir: () => void; onTirar: () => void; aberto: boolean;
}) {
  const podeMexer = p.podeTrabalhar && p.status === 'aberto';
  const fora = c.status === 'nao_se_aplica';
  /**
   * A marca muda na hora e a resposta do servidor assume o lugar depois.
   * Guarda texto: o id da opção escolhida, ou "sim"/"" na caixinha.
   */
  const [otimista, setOtimista] = useState<Record<string, string>>({});
  useEffect(() => {
    setOtimista((o) => {
      const resto = Object.fromEntries(Object.entries(o).filter(([stepId, valor]) => {
        const f = c.feitas.find((x) => x.stepId === stepId);
        return (f ? f.valor ?? 'sim' : '') !== valor;
      }));
      return Object.keys(resto).length === Object.keys(o).length ? o : resto;
    });
  }, [c.feitas]);
  const conversas = p.comentarios.filter((x) => x.projectClientId === c.id).length + p.anexos.filter((x) => x.projectClientId === c.id).length;

  return (
    <>
      <tr className={fora ? 'opacity-60' : undefined}>
        <TdN n={contar(i)} />
        <td className="min-w-[180px]">
          <Link className="link" to={`/clientes/${c.clientId}`}>{c.clientName}</Link>
          {c.status === 'travado' && c.blockedReason && <div className="text-[12px] text-signal truncate max-w-[260px]" title={c.blockedReason}>{c.blockedReason}</div>}
        </td>
        {p.etapas.map((e) => {
          const feita = c.feitas.find((f) => f.stepId === e.id);
          const quando = feita ? `${feita.quem ?? 'alguém'} em ${data(feita.doneAt)}` : null;

          // lista de opções: um seletor com a cor da opção escolhida
          if (e.kind === 'escolha') {
            const escolhido = otimista[e.id] ?? feita?.valor ?? '';
            const opcao = e.options.find((o) => o.id === escolhido);
            return (
              <td key={e.id}>
                {podeMexer && !fora ? (
                  <select
                    className={`input input-sm w-[190px] ${opcao ? CHIP_SELECT[opcao.tone] : ''}`}
                    value={escolhido}
                    onChange={(ev) => { setOtimista((o) => ({ ...o, [e.id]: ev.target.value })); onMarcar(e.id, { valor: ev.target.value || null }); }}
                    aria-label={`${e.title} — ${c.clientName}`}
                    title={quando ? `${e.title}: ${quando}` : e.title}
                  >
                    <option value="">—</option>
                    {e.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                ) : opcao ? <Chip tone={opcao.tone} title={quando ?? undefined}>{opcao.label}</Chip> : <span className="text-muted">—</span>}
              </td>
            );
          }

          const marcada = otimista[e.id] === undefined ? !!feita : otimista[e.id] === 'sim';
          return (
            <td key={e.id} className="text-center">
              <input
                type="checkbox"
                checked={marcada}
                disabled={!podeMexer || fora}
                onChange={(ev) => { setOtimista((o) => ({ ...o, [e.id]: ev.target.checked ? 'sim' : '' })); onMarcar(e.id, { feito: ev.target.checked }); }}
                aria-label={`${e.title} — ${c.clientName}`}
                title={quando ? `${e.title}: ${quando}` : fora ? 'Este cliente está como "não se aplica"' : e.title}
              />
            </td>
          );
        })}
        <td>
          {podeMexer ? (
            <select className="input input-sm w-[150px]" value={c.status} onChange={(e) => onSituacao(e.target.value as SituacaoProjeto)}>
              {(Object.keys(SITUACAO) as SituacaoProjeto[]).map((s) => <option key={s} value={s}>{SITUACAO[s].rotulo}</option>)}
            </select>
          ) : <ChipSituacao status={c.status} motivo={c.blockedReason} />}
        </td>
        <td className="text-right whitespace-nowrap">
          <button className="btn-ghost btn-sm text-muted" onClick={onAbrir} title="Comentários e anexos deste cliente">
            <MessageSquare size={14} />{conversas > 0 && <span className="tnum ml-0.5 text-[11px]">{conversas}</span>}
          </button>
          {p.podeGerenciar && <button className="btn-ghost btn-sm text-bad" onClick={onTirar} aria-label={`Tirar ${c.clientName} do projeto`}><Trash2 size={14} /></button>}
        </td>
      </tr>
      {aberto && (
        <tr>
          <td colSpan={p.etapas.length + 4} className="bg-surface-2">
            <div className="grid gap-3 md:grid-cols-2 p-2">
              <Comentarios projeto={p} linha={c} onMudou={() => { /* o pai recarrega */ }} compacto />
              <Anexos projeto={p} linha={c} onMudou={() => { /* o pai recarrega */ }} compacto />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** "Travado" só existe com o motivo escrito — é o que aparece no painel e no relatório. */
function Travar({ cliente, onClose, onConfirmar, salvando }: { cliente: ClienteDoProjeto; onClose: () => void; onConfirmar: (motivo: string) => void; salvando: boolean }) {
  const [motivo, setMotivo] = useState(cliente.blockedReason ?? '');
  return (
    <Modal open onClose={onClose} titulo={`Travar ${cliente.clientName}`}
      rodape={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={!motivo.trim() || salvando} onClick={() => onConfirmar(motivo.trim())}>{salvando ? <Spinner className="text-white" /> : 'Travar'}</button>
      </>}>
      <p className="text-sm text-ink-2 mb-3">Por que este cliente está parado? Isto aparece no painel, para saber o que destravar primeiro.</p>
      <textarea className="input min-h-[80px]" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Cliente pediu para voltar depois do fechamento do mês." />
    </Modal>
  );
}

/** O que está escrito no "mostrando só: …" quando há filtro. */
function rotuloDoFiltro(p: Projeto, f: { tipo: 'situacao'; valor: SituacaoProjeto } | { tipo: 'etapa'; stepId: string; valor: string }): string {
  if (f.tipo === 'situacao') return SITUACAO[f.valor].rotulo;
  const etapa = p.etapas.find((e) => e.id === f.stepId);
  if (!etapa) return 'este passo';
  if (etapa.kind !== 'escolha') return `${etapa.title}: ${f.valor === 'feito' ? 'feito' : 'falta'}`;
  return `${etapa.title}: ${etapa.options.find((o) => o.id === f.valor)?.label ?? 'em branco'}`;
}
