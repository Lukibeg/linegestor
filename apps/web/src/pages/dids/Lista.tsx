/**
 * Numeração (todos os DIDs de todos os circuitos): lista com filtros, seleção por caixa,
 * "selecionar todos os filtrados", barra de ação em massa e confirmação que declara o número exato
 * de registros afetados. Vive como aba dentro de Circuitos; o endereço antigo /dids redireciona para lá.
 *
 * Patch 1.6 (pedido de 30/09): a MESMA tabela mora também na ficha do circuito, com o circuito fixo
 * (`circuito`) — busca, filtros, seleção e edição em massa sem sair dali. Com o circuito fixo, somem
 * o que seria sempre igual: o filtro e as colunas de circuito e operadora, o interruptor dos links de
 * terceiros (a ficha mostra todos os números do circuito) e o "Criar faixa" (já está no alto da ficha).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import { api } from '../../api/index.js';
import { Can, useAuth } from '../../lib/auth.js';
import { Campo, Carregando, Chip, Confirmar, Copiar, EscolherComBusca, Modal, Paginacao, Spinner, TODOS, Toggle, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { Th, useOrdenacao } from '../../lib/ordenacao.js';
import { FaixaForm } from '../circuitos/Detalhe.js';
import { contarDe, TdN, ThN } from '../../lib/contagem.js';
import { ClienteDoDid, ObservacaoDid, UsoDid, useEditarDid, useOpcoesDeCliente } from './partes.js';

type Acao = 'circuito' | 'cliente' | 'liberar' | 'uso' | 'observacao' | 'excluir';

/** O endereço antigo (/dids?…) continua funcionando: manda para Circuitos › Numeração com os mesmos filtros. */
export function DidsRedirect() {
  const [sp] = useSearchParams();
  const n = new URLSearchParams(sp); n.set('aba', 'numeracao');
  return <Navigate to={`/circuitos?${n.toString()}`} replace />;
}

export function Numeracao({ circuito: fixo }: { circuito?: { id: string; nome: string } } = {}) {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? ''; const circuito = fixo?.id ?? sp.get('circuito') ?? ''; const cliente = sp.get('cliente') ?? ''; const uso = sp.get('uso') ?? ''; const page = Number(sp.get('p') ?? 1);
  // o mesmo interruptor da aba Circuitos (mora no endereço, então vale para as duas);
  // na ficha do circuito vale sempre: ela mostra todos os números dele, de terceiro ou não
  const terceiros = !!fixo || sp.get('terceiros') === '1';
  const o = useOrdenacao('number');
  const tudo = sp.get('tudo') === '1';
  const pageSize = 100;
  const tamanho = tudo ? TODOS : pageSize;
  const numero = contarDe(tudo ? 1 : page, tamanho); // a contagem segue pela lista toda, não recomeça a cada página
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'p') n.delete('p'); setSp(n, { replace: true }); };
  // "limpar" tira os filtros, não o modo de exibição: o interruptor dos terceiros fica como está
  const limpar = () => setSp({ ...(fixo ? {} : { aba: 'numeracao' }), ...(!fixo && terceiros ? { terceiros: '1' } : {}), ...(tudo ? { tudo: '1' } : {}) }, { replace: true });
  const filtro = { q, circuitId: circuito, clientId: cliente, inUse: uso || undefined, includeThirdParty: terceiros };
  const qc = useQueryClient(); const toast = useToast(); const { can } = useAuth();
  const lista = useQuery({ queryKey: ['dids', filtro, page, tudo, o.ord, o.dir], queryFn: () => api.dids.list({ ...filtro, page: tudo ? 1 : page, pageSize: tamanho, sort: o.ord, dir: o.dir }) });
  const circuits = useQuery({ queryKey: ['circuit-options'], queryFn: api.circuits.options });
  const temFiltro = !!(q || (!fixo && circuito) || cliente || uso);
  const clients = useQuery({ queryKey: ['client-options'], queryFn: () => api.clients.options() });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [acao, setAcao] = useState<Acao | null>(null);
  const [faixa, setFaixa] = useState(false);
  useEffect(() => { setSel(new Set()); }, [q, circuito, cliente, uso, terceiros]);
  // 1.5: cliente, uso e observação se editam na própria linha (as peças são as da ficha do cliente)
  const { mudando, alternarUso, gravarObservacao, trocarCliente } = useEditarDid();
  const opcoesCliente = useOpcoesDeCliente();

  const items = lista.data?.items ?? [];
  const allOnPage = items.length > 0 && items.every((d) => sel.has(d.id));
  const togglePage = () => setSel((s) => { const n = new Set(s); if (allOnPage) items.forEach((d) => n.delete(d.id)); else items.forEach((d) => n.add(d.id)); return n; });
  const selectAllFiltered = async () => { const r = await api.dids.ids(filtro); setSel(new Set(r.ids)); toast.push('info', `${r.ids.length} DIDs selecionados (todos os filtrados)`); };

  // a ficha do circuito (os cartões do alto) e a do cliente também contam estes números
  const done = async (msg: string) => { setAcao(null); setSel(new Set()); toast.push('ok', msg); await Promise.all(['dids', 'circuits', 'circuit', 'circuit-dids', 'client-dids', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] }))); };

  return (
    <div>
      <div className="card p-3 mb-4 flex flex-wrap gap-2 items-center">
        {/* 1.6: o número (com ou sem DDD) ou um pedaço da observação, como na ficha do cliente */}
        <label className="relative">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-8 w-[270px] max-w-full" id="dids-busca" autoComplete="off" placeholder="Procurar número ou observação…" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Procurar número ou observação" />
        </label>
        {/* "Sem circuito" saiu do filtro: todo DID pertence a um circuito */}
        {!fixo && <select className="input w-auto" value={circuito} onChange={(e) => set('circuito', e.target.value || null)}><option value="">Todos os circuitos</option>{circuits.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <EscolherComBusca className="input w-[240px] max-w-full" valor={cliente} onChange={(v) => set('cliente', v || null)} vazio="Todos os clientes" opcoes={[{ id: 'free', nome: 'Livres (sem cliente)' }, ...opcoesCliente]} rotulo="Filtrar por cliente" procurar="Procurar cliente…" id="dids-filtro-cliente" />
        <select className="input w-auto" value={uso} onChange={(e) => set('uso', e.target.value || null)} aria-label="Uso"><option value="">Em uso e não usados</option><option value="true">Só em uso</option><option value="false">Só não usados</option></select>
        {!fixo && <Toggle checked={terceiros} onChange={(v) => set('terceiros', v ? '1' : null)} label="Habilitar links de terceiros" />}
        {temFiltro && <button className="btn-ghost btn-sm" onClick={limpar}><X size={14} /> limpar</button>}
        <span className="text-muted text-[12.5px] ml-1">{lista.data ? `${lista.data.total.toLocaleString('pt-BR')} número(s)${lista.data.free !== undefined ? ` · ${lista.data.free} livres` : ''}` : ''}</span>
        {!fixo && <span className="ml-auto"><Can permission="dids.assign"><button className="btn-primary btn-sm" onClick={() => setFaixa(true)}><Plus size={15} /> Criar faixa</button></Can></span>}
      </div>

      {/* barra de seleção */}
      {sel.size > 0 && can('dids.assign') && (
        <div className="sticky top-14 z-10 card p-2 mb-3 flex flex-wrap items-center gap-2 border-accent bg-accent-soft backdrop-blur">
          <span className="font-display font-semibold tnum px-2">{sel.size.toLocaleString('pt-BR')} selecionado(s)</span>
          {lista.data && sel.size < lista.data.total && <button className="btn-ghost btn-sm" onClick={selectAllFiltered}>selecionar todos os {lista.data.total.toLocaleString('pt-BR')} filtrados</button>}
          <span className="flex-1" />
          <button className="btn-secondary btn-sm" onClick={() => setAcao('cliente')}>Atribuir a cliente</button>
          <button className="btn-secondary btn-sm" onClick={() => setAcao('circuito')}>Mudar circuito</button>
          <button className="btn-secondary btn-sm" onClick={() => setAcao('uso')}>Em uso / não usado</button>
          <button className="btn-secondary btn-sm" onClick={() => setAcao('observacao')}>Observação</button>
          <button className="btn-secondary btn-sm" onClick={() => setAcao('liberar')}>Liberar</button>
          <Can permission="records.delete"><button className="btn-ghost btn-sm text-bad" onClick={() => setAcao('excluir')}>Excluir</button></Can>
          <button className="btn-ghost btn-sm" onClick={() => setSel(new Set())} title="Limpar seleção"><X size={14} /></button>
        </div>
      )}

      {lista.isLoading ? <Carregando /> : !items.length ? <Vazio titulo="Nenhum DID encontrado" texto={temFiltro ? 'Tente outro filtro.' : fixo ? 'Este circuito ainda não tem números: use "Criar faixa de DIDs", no alto.' : 'Crie uma faixa de números para começar.'} acao={temFiltro ? <button className="btn-secondary" onClick={limpar}>Limpar filtros</button> : undefined} /> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr>
            {can('dids.assign') && <th className="w-8"><input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Selecionar página" /></th>}
            <ThN /><Th o={o} col="number">Número</Th>{!fixo && <><Th o={o} col="carrier">Operadora</Th><Th o={o} col="circuit">Circuito</Th></>}<Th o={o} col="client">Cliente</Th><Th o={o} col="inUse">Uso</Th><Th o={o} col="owner">Titular</Th><Th o={o} col="note">Observação</Th>
          </tr></thead>
          <tbody>{items.map((d, i) => (
            <tr key={d.id} className={sel.has(d.id) ? 'bg-accent-soft' : ''}>
              {can('dids.assign') && <td><input type="checkbox" checked={sel.has(d.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n; })} aria-label={`Selecionar ${d.numberFormatted}`} /></td>}
              <TdN n={numero(i)} />
              <td className="font-mono tnum whitespace-nowrap">{d.numberFormatted} <Copiar texto={d.number} titulo="Copiar número" /></td>
              {!fixo && <><td>{d.carrierName ?? '—'}</td>
              <td>{d.circuitId ? <span className="inline-flex items-center gap-1.5"><Link className="link" to={`/circuitos/${d.circuitId}`}>{d.circuitName}</Link>{d.thirdParty && <Chip tone="muted" title="Tronco do próprio cliente, com outra operadora">terceiro</Chip>}</span> : <span className="text-muted">—</span>}</td></>}
              <td><ClienteDoDid d={d} clientes={opcoesCliente} podeEditar={can('dids.assign')} trocar={(novo, nome) => trocarCliente(d.id, d.numberFormatted, novo, nome)} /></td>
              {/* a marca só faz sentido com cliente: número livre não está em uso nem "não usado" */}
              <td>{d.clientId ? <UsoDid inUse={d.inUse} podeMudar={can('dids.assign')} mudando={mudando === d.id} onChange={(v) => alternarUso(d.id, v)} /> : <span className="text-muted">—</span>}</td>
              <td className="text-muted">{d.ownerName ?? '—'}</td>
              <td className="min-w-[140px]"><ObservacaoDid nota={d.note} podeEditar={can('dids.assign')} numero={d.numberFormatted} gravar={(v) => gravarObservacao(d.id, v)} /></td>
            </tr>))}</tbody></table></div>
      )}
      {lista.data && <Paginacao page={page} pageSize={pageSize} total={lista.data.total} onChange={(p) => set('p', String(p))} tudo={tudo} onTudo={(v) => set('tudo', v ? '1' : null)} />}

      {acao && acao !== 'excluir' && <AcaoMassa acao={acao} ids={[...sel]} onClose={() => setAcao(null)} onDone={done} circuits={circuits.data ?? []} clients={clients.data ?? []} />}
      <ConfirmarExcluir open={acao === 'excluir'} ids={[...sel]} onClose={() => setAcao(null)} onDone={done} />
      {!fixo && <FaixaForm open={faixa} onClose={() => setFaixa(false)} onDone={() => { setFaixa(false); void qc.invalidateQueries({ queryKey: ['dids'] }); void qc.invalidateQueries({ queryKey: ['circuits'] }); }} />}
    </div>
  );
}

function AcaoMassa({ acao, ids, onClose, onDone, circuits, clients }: { acao: Acao; ids: string[]; onClose: () => void; onDone: (msg: string) => void; circuits: Array<{ id: string; name: string }>; clients: Array<{ id: string; name: string }> }) {
  const [valor, setValor] = useState(''); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const n = ids.length;
  const titulo = { circuito: 'Mudar circuito', cliente: 'Atribuir a cliente', liberar: 'Liberar DIDs', uso: 'Marcar uso', observacao: 'Definir observação', excluir: '' }[acao];
  const set = useMemo(() => acao === 'circuito' ? { circuitId: valor } : acao === 'cliente' ? { clientId: valor || null } : acao === 'liberar' ? { clientId: null } : acao === 'uso' ? { inUse: valor !== 'nao' } : { note: valor || null }, [acao, valor]);
  const resumo = acao === 'circuito' ? `mover para o circuito "${circuits.find((c) => c.id === valor)?.name}"` : acao === 'cliente' ? (valor ? `atribuir a "${clients.find((c) => c.id === valor)?.name}"` : 'deixar livres') : acao === 'liberar' ? 'liberar (ficam sem cliente)' : acao === 'uso' ? (valor === 'nao' ? 'marcar como NÃO usados (os livres ficam como estão)' : 'marcar como EM USO (os livres ficam como estão)') : valor ? `definir a observação "${valor}"` : 'limpar a observação';
  const run = async () => { setBusy(true); setErr(''); try { const r = await api.dids.bulk(ids, set); onDone(`${r.affected} DID(s) alterado(s)`); } catch (e) { setErr(mensagemErro(e)); setConfirm(false); } finally { setBusy(false); } };
  // mudar de circuito exige escolher um: "sem circuito" não existe
  const faltaValor = acao === 'circuito' && !valor;
  return (<>
    <Modal open={!confirm} onClose={onClose} titulo={`${titulo} · ${n.toLocaleString('pt-BR')} DID(s)`} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={faltaValor} onClick={() => setConfirm(true)}>Continuar</button></>}>
      {acao === 'circuito' && <Campo label="Novo circuito" dica="todo DID pertence a um circuito"><select className="input" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus><option value="">Escolha o circuito…</option>{circuits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Campo>}
      {acao === 'uso' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-2">Um número pode estar alocado ao cliente e ainda não estar em uso (reservado, aguardando configuração). Número livre não muda.</p>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line p-1" role="radiogroup">
            {([['sim', 'Em uso'], ['nao', 'Não usado']] as const).map(([v, rotulo]) => <button key={v} type="button" role="radio" aria-checked={(valor || 'sim') === v} onClick={() => setValor(v)} className={`rounded-md px-2 py-1.5 text-[13px] font-semibold ${(valor || 'sim') === v ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'}`}>{rotulo}</button>)}
          </div>
        </div>
      )}
      {acao === 'cliente' && <Campo label="Cliente que vai usar os números"><EscolherComBusca className="input w-full" valor={valor} onChange={setValor} vazio="livre (sem cliente)" opcoes={clients.map((c) => ({ id: c.id, nome: c.name }))} procurar="Procurar cliente…" rotulo="Cliente que vai usar os números" autoFocus /></Campo>}
      {acao === 'liberar' && <p className="text-sm text-ink-2">Os {n} DIDs selecionados ficam sem cliente (livres). O circuito não muda.</p>}
      {acao === 'observacao' && <Campo label="Observação" dica="vazio = limpar"><input className="input" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus /></Campo>}
      {err && <div className="text-bad text-sm mt-2">{err}</div>}
    </Modal>
    <Confirmar open={confirm} onClose={() => setConfirm(false)} onConfirm={run} loading={busy} titulo="Confirmar alteração em massa" botao={`Alterar ${n.toLocaleString('pt-BR')} DID(s)`} digitar={n >= 50 ? String(n) : undefined}
      texto={<>Isto vai <b>{resumo}</b> em <b className="tnum">{n.toLocaleString('pt-BR')}</b> DID(s). A operação fica registrada na auditoria com seu nome e a quantidade exata.{n >= 50 && <><br /><br />Como são muitos, confirme digitando a quantidade.</>}</>} />
  </>);
}

function ConfirmarExcluir({ open, ids, onClose, onDone }: { open: boolean; ids: string[]; onClose: () => void; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState(false); const toast = useToast();
  const run = async () => { setBusy(true); try { const r = await api.dids.bulkDelete(ids); onDone(`${r.affected} DID(s) foram para a lixeira`); } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); } };
  return <Confirmar open={open} onClose={onClose} onConfirm={run} loading={busy} perigoso titulo="Mandar DIDs para a lixeira" botao={`Mandar ${ids.length} para a lixeira`} digitar={ids.length >= 20 ? String(ids.length) : undefined} texto={<><b className="tnum">{ids.length.toLocaleString('pt-BR')}</b> DID(s) saem das listas. Nada é apagado de verdade: dá para restaurar em Administração → Lixeira.</>} />;
}

export function BotaoSpinner({ busy, children }: { busy: boolean; children: React.ReactNode }) { return busy ? <Spinner className="text-white" /> : <>{children}</>; }
