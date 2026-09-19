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
import { ArrowLeft, CalendarClock, Check, MessageSquare, Paperclip, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { api } from '../../api/index.js';
import type { ClienteDoProjeto, Projeto, SituacaoProjeto } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Carregando, Chip, Confirmar, Modal, Spinner, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { data, relativo } from '../../lib/format.js';
import { contar, TdN, ThN } from '../../lib/contagem.js';
import { EscolherClientes } from './EscolherClientes.js';
import { ProjetoForm } from './Form.js';
import { Andamento, ChipSituacao, Numero, SITUACAO } from './partes.js';
import { Anexos, Comentarios } from './Conversa.js';

export function ProjetoFicha() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['projeto', id], queryFn: () => api.projetos.get(id) });
  const pessoas = useQuery({ queryKey: ['projeto-pessoas'], queryFn: () => api.projetos.pessoas() });

  const [editar, setEditar] = useState(false);
  const [incluir, setIncluir] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [filtro, setFiltro] = useState<SituacaoProjeto | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [travando, setTravando] = useState<ClienteDoProjeto | null>(null);
  const [tirar, setTirar] = useState<ClienteDoProjeto | null>(null);

  const recarregar = () => qc.invalidateQueries({ queryKey: ['projeto', id] });
  const erro = (e: unknown) => toast.push('erro', mensagemErro(e));

  const salvar = useMutation({ mutationFn: (d: Record<string, unknown>) => api.projetos.atualizar(id, d), onSuccess: () => { recarregar(); qc.invalidateQueries({ queryKey: ['projetos'] }); setEditar(false); toast.push('ok', 'Projeto salvo'); }, onError: erro });
  const addClientes = useMutation({ mutationFn: (ids: string[]) => api.projetos.addClientes(id, ids), onSuccess: () => { recarregar(); setIncluir(false); toast.push('ok', 'Clientes acrescentados'); }, onError: erro });
  const removerCliente = useMutation({ mutationFn: (linhaId: string) => api.projetos.removerCliente(id, linhaId), onSuccess: () => { recarregar(); setTirar(null); toast.push('ok', 'Cliente tirado do projeto'); }, onError: erro });
  const marcar = useMutation({ mutationFn: (v: { linhaId: string; stepId: string; feito: boolean }) => api.projetos.marcar(id, v.linhaId, v.stepId, v.feito), onSuccess: recarregar, onError: erro });
  const linha = useMutation({ mutationFn: (v: { linhaId: string; d: Record<string, unknown> }) => api.projetos.linha(id, v.linhaId, v.d), onSuccess: () => { recarregar(); setTravando(null); }, onError: erro });
  const apagar = useMutation({ mutationFn: () => api.projetos.remover(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['projetos'] }); toast.push('ok', 'Projeto na lixeira'); navigate('/projetos'); }, onError: erro });

  const p = q.data;
  const clientes = useMemo(() => (p?.clientes ?? []).filter((c) => !filtro || c.status === filtro), [p, filtro]);

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
              ativo={filtro === s} onClick={() => setFiltro(filtro === s ? null : s)} />
          ))}
        </div>

        {r.porResponsavel.length > 0 && (
          <div>
            <div className="eyebrow mb-1.5">Quanto falta para cada um</div>
            <div className="flex flex-col gap-1.5">
              {r.porResponsavel.map((x) => (
                <div key={x.id ?? 'sem'} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`w-[180px] shrink-0 truncate ${x.id ? '' : 'text-muted italic'}`}>{x.nome}</span>
                  <div className="flex-1 min-w-[120px]"><Andamento pct={x.total ? Math.round((x.fechados / x.total) * 100) : 0} total={x.total} faltam={x.total - x.fechados} /></div>
                  {x.travados > 0 && <Chip tone="signal">{x.travados} travado(s)</Chip>}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---------- a lista de clientes ---------- */}
      <section className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
          <h2 className="font-display font-semibold">
            Clientes {filtro && <button className="btn-ghost btn-sm text-muted" onClick={() => setFiltro(null)}>mostrando só: {SITUACAO[filtro].rotulo} ✕</button>}
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
                  {p.etapas.map((e) => <th key={e.id} className="text-center whitespace-nowrap">{e.title}</th>)}
                  <th>Situação</th>
                  <th>Responsável</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clientes.map((c, i) => (
                  <Linha key={c.id} c={c} i={i} p={p}
                    pessoas={pessoas.data ?? []}
                    onMarcar={(stepId, feito) => marcar.mutate({ linhaId: c.id, stepId, feito })}
                    onSituacao={(status) => status === 'travado' ? setTravando(c) : linha.mutate({ linhaId: c.id, d: { status } })}
                    onResponsavel={(assigneeId) => linha.mutate({ linhaId: c.id, d: { assigneeId: assigneeId || null } })}
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
function Linha({ c, i, p, pessoas, onMarcar, onSituacao, onResponsavel, onAbrir, onTirar, aberto }: {
  c: ClienteDoProjeto; i: number; p: Projeto; pessoas: Array<{ id: string; name: string }>;
  onMarcar: (stepId: string, feito: boolean) => void;
  onSituacao: (status: SituacaoProjeto) => void;
  onResponsavel: (id: string) => void;
  onAbrir: () => void; onTirar: () => void; aberto: boolean;
}) {
  const podeMexer = p.podeTrabalhar && p.status === 'aberto';
  const fora = c.status === 'nao_se_aplica';
  // a caixinha muda na hora; quando a resposta chega, a marca de verdade assume o lugar
  const [otimista, setOtimista] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOtimista((o) => {
      const resto = Object.fromEntries(Object.entries(o).filter(([stepId, feito]) => feito !== c.feitas.some((f) => f.stepId === stepId)));
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
          const marcada = otimista[e.id] ?? !!feita;
          return (
            <td key={e.id} className="text-center">
              <input
                type="checkbox"
                checked={marcada}
                disabled={!podeMexer || fora}
                onChange={(ev) => { setOtimista((o) => ({ ...o, [e.id]: ev.target.checked })); onMarcar(e.id, ev.target.checked); }}
                aria-label={`${e.title} — ${c.clientName}`}
                title={feita ? `${e.title}: ${feita.quem ?? 'alguém'} em ${data(feita.doneAt)}` : fora ? 'Este cliente está como "não se aplica"' : e.title}
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
        <td>
          {podeMexer ? (
            <select className="input input-sm w-[150px]" value={c.assigneeId ?? ''} onChange={(e) => onResponsavel(e.target.value)}>
              <option value="">sem responsável</option>
              {pessoas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          ) : <span className={c.assigneeName ? '' : 'text-muted italic'}>{c.assigneeName ?? 'sem responsável'}</span>}
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
          <td colSpan={p.etapas.length + 5} className="bg-surface-2">
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

export { Paperclip };
