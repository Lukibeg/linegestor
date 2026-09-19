/** Inventário: abas Aparelhos · Modelos · Movimentações, e o painel "Movimentar aparelhos". */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, logoSrc } from '../../api/index.js';
import type { Device, DeviceModel } from '../../api/types.js';
import { ApiError } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can } from '../../lib/auth.js';
import { Abas, Campo, CampoLogo, Carregando, Chip, Confirmar, FotoModelo, Identificacao, InputIp, Kpi, Modal, Paginacao, Spinner, TODOS, usePaginaLocal, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { centavosParaCampo, condicaoCor, condicaoNome, CONDICOES_APARELHO, data, lerLista, macFormatado, macLimpo, macValido, MODALIDADES, paraCentavos, reais, serieLimpa } from '../../lib/format.js';
import { ordenarLista, Th, useOrdenacao, useOrdenacaoLocal } from '../../lib/ordenacao.js';
import { SeletorColunas, useColunasEscolhidas, type Coluna } from '../../lib/colunas.js';
import { Movimentar } from './Movimentar.js';
import { useLembrarFiltros } from '../../lib/voltar.js';
import { contarDe, TdN, ThN } from '../../lib/contagem.js';

type Aba = 'aparelhos' | 'modelos' | 'movimentacoes';

export function Inventario() {
  const [sp, setSp] = useSearchParams();
  useLembrarFiltros('/inventario'); // o botão Voltar da ficha do aparelho traz estes filtros de volta
  const aba = (sp.get('aba') ?? 'aparelhos') as Aba;
  const [mover, setMover] = useState(false);
  const models = useQuery({ queryKey: ['models'], queryFn: () => api.inventory.models() });
  // os cartões do topo seguem os MESMOS filtros da aba Aparelhos
  const filtros = aba === 'aparelhos'
    ? { q: sp.get('q') ?? '', modelId: sp.get('modelo') ?? '', clientId: sp.get('cliente') ?? '', condition: sp.get('condicao') ?? '' }
    : {};
  const resumo = useQuery({ queryKey: ['inventory', 'summary', filtros], queryFn: () => api.inventory.summary(filtros) });
  const r = resumo.data;
  return (
    <Pagina titulo="Inventário" sub="Cada unidade é uma linha. O aparelho se identifica pelo MAC ou pelo número de série (N/S); o valor vem do modelo." acoes={<Can permission="devices.move"><button className="btn-primary" onClick={() => setMover(true)}><ArrowLeftRight size={16} /> Movimentar aparelhos</button></Can>}>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <Kpi label={r?.filtrado ? 'Em estoque (filtrado)' : 'Em estoque'} valor={r ? r.inStock : '…'} tone="ok" />
        <Kpi label="Com clientes" valor={r ? r.withClients : '…'} tone="accent" />
        <Kpi label="Inativos" valor={r ? r.inactive : '…'} tone={r?.inactive ? 'signal' : 'neutral'} />
        <Kpi label="Valor locado" valor={r ? reais(r.valueWithClientsCents) : '…'} sub="aparelhos em locação ou comodato" />
      </div>
      {r?.filtrado && <p className="text-[12.5px] text-muted -mt-3 mb-4">Os cartões acima estão somando apenas o que o filtro deixou passar. <button className="link" onClick={() => setSp({ aba: 'aparelhos' }, { replace: true })}>limpar filtros</button></p>}
      <Abas atual={aba} onChange={(a) => { const n = new URLSearchParams(); n.set('aba', a); setSp(n, { replace: true }); }} abas={[{ id: 'aparelhos', label: 'Aparelhos' }, { id: 'modelos', label: 'Modelos' }, { id: 'movimentacoes', label: 'Movimentações' }]} />
      {aba === 'aparelhos' && <Aparelhos models={models.data ?? []} />}
      {aba === 'modelos' && <Modelos models={models.data ?? []} loading={models.isLoading} />}
      {aba === 'movimentacoes' && <Movimentacoes models={models.data ?? []} />}
      <Movimentar open={mover} onClose={() => setMover(false)} />
    </Pagina>
  );
}

/** As colunas da tabela de aparelhos. A pessoa escolhe quais quer ver (botão "Colunas"). */
function colunasAparelhos(): Coluna<Device>[] {
  return [
    { id: 'mac', label: 'MAC / N/S', grupo: 'Aparelho', render: (d) => <Identificacao d={d} /> },
    { id: 'modelName', label: 'Modelo', grupo: 'Aparelho', render: (d) => d.modelName },
    { id: 'condition', label: 'Condição', grupo: 'Aparelho', render: (d) => <Chip tone={condicaoCor[d.condition] as any}>{condicaoNome[d.condition] ?? d.condition}</Chip> },
    { id: 'valueCents', label: 'Valor', grupo: 'Aparelho', align: 'right', render: (d) => <span className="tnum" title={d.ownValueCents != null ? 'valor próprio deste aparelho' : 'valor do modelo'}>{reais(d.valueCents)}</span> },
    { id: 'clientName', label: 'Atribuído a', grupo: 'Onde está', render: (d) => (d.clientId ? <Link className="link" to={`/clientes/${d.clientId}`} onClick={(e) => e.stopPropagation()}>{d.clientName}</Link> : <Chip tone="ok">estoque</Chip>) },
    { id: 'unit', label: 'Unidade', grupo: 'Onde está', render: (d) => d.unit ?? <span className="text-muted">{d.clientId ? 'Matriz' : '—'}</span> },
    { id: 'currentModality', label: 'Modalidade', grupo: 'Onde está', render: (d) => <span className="text-muted">{d.currentModality ? (MODALIDADES as any)[d.currentModality] : '—'}</span> },
    { id: 'ip', label: 'IP', grupo: 'Rede e anotações', render: (d) => <span className="font-mono text-muted">{d.ip ?? '—'}</span> },
    { id: 'note', label: 'Anotação', grupo: 'Rede e anotações', render: (d) => <span className="text-muted block max-w-[260px] truncate" title={d.note ?? ''}>{d.note ?? '—'}</span> },
  ];
}
const COLUNAS_APARELHOS_PADRAO = ['mac', 'modelName', 'clientName', 'unit', 'currentModality', 'condition', 'ip', 'valueCents'];

function Aparelhos({ models }: { models: DeviceModel[] }) {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const q = sp.get('q') ?? ''; const modelId = sp.get('modelo') ?? ''; const clientId = sp.get('cliente') ?? ''; const condition = sp.get('condicao') ?? ''; const page = Number(sp.get('p') ?? 1);
  const tudo = sp.get('tudo') === '1';
  const tamanho = tudo ? TODOS : 50;
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'p') n.delete('p'); setSp(n, { replace: true }); };
  const [novo, setNovo] = useState(false);
  const clients = useQuery({ queryKey: ['client-options', 'equip'], queryFn: () => api.clients.options({ productCode: 'equipamentos' }) });
  const o = useOrdenacao('modelName');
  const escolha = useColunasEscolhidas('gestor.aparelhos.colunas', COLUNAS_APARELHOS_PADRAO);
  const colunas = colunasAparelhos();
  const visiveis = colunas.filter((c) => escolha.ids.includes(c.id));
  const lista = useQuery({ queryKey: ['devices', q, modelId, clientId, condition, page, tudo, o.ord, o.dir], queryFn: () => api.inventory.devices({ q, modelId, clientId, condition, page: tudo ? 1 : page, pageSize: tamanho, sort: o.ord, dir: o.dir }) });
  const numero = contarDe(tudo ? 1 : page, tamanho); // a contagem segue pela lista toda, não recomeça a cada página
  return (
    <div>
      <div className="card p-3 mb-3 flex flex-wrap gap-2 items-center">
        <input className="input max-w-[220px] font-mono" placeholder="MAC, N/S, unidade ou IP" value={q} onChange={(e) => set('q', e.target.value)} />
        <select className="input w-auto" value={modelId} onChange={(e) => set('modelo', e.target.value || null)}><option value="">Todos os modelos</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <select className="input w-auto" value={clientId} onChange={(e) => set('cliente', e.target.value || null)} aria-label="Atribuído a">
          <option value="">Estoque e clientes</option>
          <option value="stock">Só estoque</option>
          <option value="clients">Só em clientes</option>
          <optgroup label="Um cliente">{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
        </select>
        <select className="input w-auto" value={condition} onChange={(e) => set('condicao', e.target.value || null)}><option value="">Ativos e inativos</option>{Object.entries(CONDICOES_APARELHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="flex-1" />
        <SeletorColunas colunas={colunas} escolha={escolha} />
        <Can permission="records.write"><button className="btn-secondary btn-sm" onClick={() => setNovo(true)}><Plus size={14} /> Cadastrar aparelhos</button></Can>
      </div>
      {lista.isLoading ? <Carregando /> : !lista.data?.items.length ? <Vazio titulo="Nenhum aparelho" texto="Cadastre aparelhos ou ajuste os filtros." /> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><ThN />{visiveis.map((c) => <Th key={c.id} o={o} col={c.id} align={c.align}>{c.label}</Th>)}</tr></thead>
          <tbody>{lista.data.items.map((d, i) => (
            <tr key={d.id} className="cursor-pointer" onClick={() => nav(`/inventario/aparelhos/${d.id}`)}>
              <TdN n={numero(i)} />
              {visiveis.map((col) => <td key={col.id} className={col.align === 'right' ? 'text-right' : ''}>{col.render(d)}</td>)}
            </tr>))}</tbody></table>
          {!visiveis.length && <div className="p-4 text-sm text-muted">Nenhuma coluna escolhida — use o botão "Colunas".</div>}
        </div>
      )}
      {lista.data && <Paginacao page={page} pageSize={50} total={lista.data.total} onChange={(p) => set('p', String(p))} tudo={tudo} onTudo={(v) => set('tudo', v ? '1' : null)} />}
      <AparelhoForm open={novo} onClose={() => setNovo(false)} models={models} />
    </div>
  );
}

type Tipo = 'mac' | 'serie' | 'nenhum';

/**
 * Cadastro de aparelhos — um ou vários de uma vez.
 *  - **MAC**: cole um MAC, ou vários (um por linha, ou separados por vírgula/espaço)
 *  - **Número de série**: igual, para quem não tem MAC mas tem etiqueta de N/S
 *  - **Sem identificação**: headset, cabo — informe só a quantidade
 * O valor não se digita aqui: é o do modelo.
 */
function AparelhoForm({ open, onClose, models, modeloInicial }: { open: boolean; onClose: () => void; models: DeviceModel[]; modeloInicial?: string }) {
  const vazio = { modelId: '', tipo: 'mac' as Tipo, texto: '', quantidade: '1', condition: 'ativo', ip: '', note: '' };
  const [f, setF] = useState(vazio);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [problemas, setProblemas] = useState<string[]>([]);
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (open) { setErr(''); setProblemas([]); setF({ ...vazio, modelId: modeloInicial ?? models[0]?.id ?? '' }); } }, [open, models, modeloInicial]); // eslint-disable-line
  const modelo = models.find((m) => m.id === f.modelId);

  // a mesma leitura que o servidor faz, para a pessoa ver antes de mandar
  const leitura = useMemo(() => {
    const itens = lerLista(f.texto);
    const vistos = new Set<string>();
    let invalidos = 0, repetidos = 0;
    for (const it of itens) {
      const v = f.tipo === 'mac' ? macLimpo(it) : serieLimpa(it);
      if (f.tipo === 'mac' ? !macValido(v) : v.length < 2) { invalidos++; continue; }
      if (vistos.has(v)) { repetidos++; continue; }
      vistos.add(v);
    }
    return { itens, validos: vistos.size, invalidos, repetidos };
  }, [f.texto, f.tipo]);
  const quantos = f.tipo === 'nenhum' ? Math.max(0, Math.min(2000, Number(f.quantidade) || 0)) : leitura.validos;
  const podeSalvar = !!f.modelId && quantos > 0 && (f.tipo === 'nenhum' || (leitura.invalidos === 0 && leitura.repetidos === 0));
  const umSo = f.tipo !== 'nenhum' && leitura.itens.length === 1;

  const save = async () => {
    setBusy(true); setErr(''); setProblemas([]);
    try {
      if (umSo) {
        // um só: dá para já informar IP (quem tem MAC)
        await api.inventory.createDevice({ modelId: f.modelId, condition: f.condition, note: f.note || null, ip: f.tipo === 'mac' ? f.ip || null : null, ...(f.tipo === 'mac' ? { mac: leitura.itens[0] } : { serialNumber: leitura.itens[0] }) });
      } else {
        await api.inventory.createDevices({ modelId: f.modelId, tipo: f.tipo, valores: f.tipo === 'nenhum' ? [] : leitura.itens, quantidade: f.tipo === 'nenhum' ? quantos : undefined, condition: f.condition, note: f.note || null });
      }
      await Promise.all(['devices', 'models', 'inventory', 'model-devices'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast.push('ok', quantos > 1 ? `${quantos} aparelhos cadastrados no estoque` : 'Aparelho cadastrado no estoque');
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : mensagemErro(e));
      if (e instanceof ApiError && typeof e.details === 'string') setProblemas(e.details.split('\n').filter(Boolean));
    } finally { setBusy(false); }
  };

  const rotuloTipo: Record<Tipo, string> = { mac: 'MAC', serie: 'Número de série (N/S)', nenhum: 'Sem identificação' };
  return (
    <Modal open={open} onClose={onClose} lateral largura="max-w-xl" titulo="Cadastrar aparelhos" rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !podeSalvar} onClick={save}>{busy ? <Spinner className="text-white" /> : quantos > 1 ? `Cadastrar ${quantos} aparelhos` : 'Cadastrar'}</button></>}>
      <div className="flex flex-col gap-4">
        <Campo label="Modelo" dica={modelo ? (modelo.valueCents != null ? `cada um vale ${reais(modelo.valueCents)} (valor do modelo)` : 'este modelo ainda não tem valor — cadastre na aba Modelos') : undefined}>
          <select className="input" value={f.modelId} onChange={(e) => setF({ ...f, modelId: e.target.value })}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </Campo>
        <div>
          <span className="label">Como o aparelho se identifica</span>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-line p-1" role="radiogroup">
            {(Object.keys(rotuloTipo) as Tipo[]).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={f.tipo === t} onClick={() => setF({ ...f, tipo: t })} className={`rounded-md px-2 py-1.5 text-[13px] font-semibold ${f.tipo === t ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'}`}>{rotuloTipo[t]}</button>
            ))}
          </div>
        </div>
        {f.tipo === 'nenhum' ? (
          <Campo label="Quantidade" dica="headset, cabo e afins: cada unidade vira uma linha, sem MAC nem N/S">
            <input className="input tnum max-w-[160px]" type="number" min={1} max={2000} value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} />
          </Campo>
        ) : (
          <Campo label={f.tipo === 'mac' ? 'MAC — um ou vários' : 'Número de série — um ou vários'} dica="cole a lista: um por linha, ou separados por vírgula ou espaço">
            <textarea className="input font-mono" rows={6} placeholder={f.tipo === 'mac' ? '00:0B:82:A1:B2:C3\n00:0B:82:A1:B2:C4' : 'SN2026000123\nSN2026000124'} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} autoFocus />
            {leitura.itens.length > 0 && (
              <div className="text-[12.5px] mt-1 flex flex-wrap gap-x-3">
                <span className="text-ok">{leitura.validos} para cadastrar</span>
                {leitura.invalidos > 0 && <span className="text-bad">{leitura.invalidos} inválido(s)</span>}
                {leitura.repetidos > 0 && <span className="text-bad">{leitura.repetidos} repetido(s) na lista</span>}
              </div>
            )}
          </Campo>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Condição"><select className="input" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })}>{Object.entries(CONDICOES_APARELHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          {umSo && f.tipo === 'mac' && <Campo label="IP"><InputIp value={f.ip} onChange={(v) => setF({ ...f, ip: v })} onBlur={() => leitura.validos === 1 && setF((x) => ({ ...x, texto: macFormatado(leitura.itens[0]!) }))} /></Campo>}
        </div>
        <Campo label="Anotação" dica={quantos > 1 ? 'vale para todos os aparelhos desta leva' : undefined}><textarea className="input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Campo>
        {err && (
          <div className="text-bad text-sm">
            {err}
            {problemas.length > 0 && <ul className="list-disc ml-5 mt-1 font-mono text-[12.5px]">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------- Modelos ----------

/** Os modelos em cartões com foto (como no Nexus). Clicar abre todos os aparelhos daquele modelo. */
function Modelos({ models, loading }: { models: DeviceModel[]; loading: boolean }) {
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  if (loading) return <Carregando />;
  const modelo = models.find((m) => m.id === aberto) ?? null;
  return (
    <div>
      <div className="flex justify-end mb-3"><Can permission="records.write"><button className="btn-secondary btn-sm" onClick={() => setNovo(true)}><Plus size={14} /> Cadastrar modelo</button></Can></div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {models.map((m) => (
          <button key={m.id} type="button" onClick={() => setAberto(m.id)} className="card p-3 flex flex-col gap-2 text-left hover:border-accent transition-colors" aria-label={`Abrir ${m.name}`}>
            <FotoModelo src={logoSrc(m.imageUrl)} nome={m.name} altura={120} />
            <div className="min-w-0">
              <div className="font-semibold truncate">{m.name}</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <Chip tone="neutral">{m.categoryName ?? 'sem categoria'}</Chip>
                <span className="text-[12.5px] tnum font-semibold">{m.valueCents != null ? reais(m.valueCents) : <span className="text-muted font-normal">sem valor</span>}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center mt-auto">
              <div className="rounded-lg bg-surface-2 p-1.5"><div className="font-display font-semibold tnum">{m.counts.inStock}</div><div className="text-[11px] text-muted">estoque</div></div>
              <div className="rounded-lg bg-surface-2 p-1.5"><div className="font-display font-semibold tnum">{m.counts.withClients}</div><div className="text-[11px] text-muted">clientes</div></div>
              <div className="rounded-lg bg-surface-2 p-1.5"><div className="font-display font-semibold tnum">{m.counts.inactive}</div><div className="text-[11px] text-muted">inativos</div></div>
            </div>
            <div className="text-[12px] text-muted flex justify-between"><span>{m.counts.total + m.counts.sold} registro(s)</span>{m.counts.sold > 0 && <span>{m.counts.sold} vendido(s)</span>}</div>
          </button>
        ))}
        {!models.length && <Vazio titulo="Nenhum modelo" texto="Cadastre o primeiro modelo de aparelho." />}
      </div>
      {novo && <ModeloForm onClose={() => setNovo(false)} />}
      {modelo && <ModeloDetalhe m={modelo} models={models} onClose={() => setAberto(null)} />}
    </div>
  );
}

/**
 * Pop-up de um modelo: a foto, o valor e TODOS os aparelhos dele — no estoque, com clientes
 * e os vendidos —, com filtro rápido. Daqui se edita o modelo e se cadastram mais aparelhos.
 */
function ModeloDetalhe({ m, models, onClose }: { m: DeviceModel; models: DeviceModel[]; onClose: () => void }) {
  const [onde, setOnde] = useState<'todos' | 'stock' | 'clients' | 'sold'>('todos');
  const [editar, setEditar] = useState(false);
  const [cadastrar, setCadastrar] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient(); const toast = useToast(); const nav = useNavigate();
  const q = useQuery({ queryKey: ['model-devices', m.id], queryFn: () => api.inventory.devices({ modelId: m.id, includeSold: true, page: 1, pageSize: TODOS }) });
  const todos = q.data?.items ?? [];
  const lista = useMemo(() => todos.filter((d) => onde === 'todos' ? true : onde === 'stock' ? !d.clientId : onde === 'sold' ? d.currentModality === 'venda' : !!d.clientId && d.currentModality !== 'venda'), [todos, onde]);
  const o = useOrdenacaoLocal('clientName');
  const ordenados = ordenarLista(lista, o, { mac: (d) => d.mac ?? d.serialNumber, clientName: (d) => d.clientName, unit: (d) => d.unit, currentModality: (d) => d.currentModality, condition: (d) => d.condition, valueCents: (d) => d.valueCents });
  const pg = usePaginaLocal(ordenados, 100);
  const conta = { todos: todos.length, stock: todos.filter((d) => !d.clientId).length, clients: todos.filter((d) => d.clientId && d.currentModality !== 'venda').length, sold: todos.filter((d) => d.currentModality === 'venda').length };
  const doExcluir = async () => { setBusy(true); try { await api.inventory.removeModel(m.id); await qc.invalidateQueries({ queryKey: ['models'] }); toast.push('ok', `${m.name} foi para a lixeira`); onClose(); } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} lateral largura="max-w-4xl" titulo={m.name}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr] items-start">
          <FotoModelo src={logoSrc(m.imageUrl)} nome={m.name} altura={160} className="border border-line" />
          <div className="flex flex-col gap-2">
            <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
              <dt className="text-muted">Categoria</dt><dd>{m.categoryName ?? '—'}</dd>
              <dt className="text-muted">Valor de cada um</dt><dd className="tnum font-semibold">{m.valueCents != null ? reais(m.valueCents) : <span className="text-muted font-normal">sem valor cadastrado</span>}</dd>
              <dt className="text-muted">Código</dt><dd className="font-mono text-[12.5px]">{m.code}</dd>
            </dl>
            {m.counts.ownValue > 0 && <p className="text-[12.5px] text-muted">{m.counts.ownValue} aparelho(s) têm valor próprio, diferente do modelo.</p>}
            <div className="flex flex-wrap gap-2 mt-1">
              <Can permission="records.write">
                <button className="btn-secondary btn-sm" onClick={() => setEditar(true)}><Pencil size={13} /> Editar modelo</button>
                <button className="btn-secondary btn-sm" onClick={() => setCadastrar(true)}><Plus size={13} /> Cadastrar aparelhos</button>
              </Can>
              <Can permission="records.delete">{conta.todos === 0 && <button className="btn-ghost btn-sm text-bad" onClick={() => setExcluir(true)}><Trash2 size={13} /> Excluir</button>}</Can>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1" role="tablist">
          {([['todos', 'Todos'], ['stock', 'No estoque'], ['clients', 'Em clientes'], ['sold', 'Vendidos']] as const).map(([id, rotulo]) => (
            <button key={id} role="tab" aria-selected={onde === id} onClick={() => setOnde(id)} className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border ${onde === id ? 'bg-accent text-white border-accent' : 'border-line text-ink-2 hover:bg-surface-2'}`}>{rotulo} <span className={onde === id ? 'opacity-80' : 'text-muted'}>({conta[id]})</span></button>
          ))}
        </div>
        {q.isLoading ? <Carregando /> : !lista.length ? <div className="text-sm text-muted">Nenhum aparelho aqui.</div> : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><ThN /><Th o={o} col="mac">MAC / N/S</Th><Th o={o} col="clientName">Atribuído a</Th><Th o={o} col="unit">Unidade</Th><Th o={o} col="currentModality">Modalidade</Th><Th o={o} col="condition">Condição</Th><Th o={o} col="valueCents" align="right">Valor</Th></tr></thead>
              <tbody>{pg.visiveis.map((d, i) => (
                <tr key={d.id} className="cursor-pointer" onClick={() => nav(`/inventario/aparelhos/${d.id}`)}>
                  <TdN n={pg.numero(i)} />
                  <td><Identificacao d={d} /></td>
                  <td>{d.clientId ? <span className="inline-flex items-center gap-1.5">{d.clientName}{d.currentModality === 'venda' && <Chip tone="accent">vendido</Chip>}</span> : <Chip tone="ok">estoque</Chip>}</td>
                  <td>{d.unit ?? <span className="text-muted">—</span>}</td>
                  <td className="text-muted">{d.currentModality ? (MODALIDADES as any)[d.currentModality] : '—'}</td>
                  <td><Chip tone={condicaoCor[d.condition] as any}>{condicaoNome[d.condition] ?? d.condition}</Chip></td>
                  <td className="text-right tnum">{reais(d.valueCents)}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="px-3 pb-3">{pg.rodape}</div>
          </div>
        )}
      </div>
      {editar && <ModeloForm m={m} onClose={() => setEditar(false)} />}
      <AparelhoForm open={cadastrar} onClose={() => setCadastrar(false)} models={models} modeloInicial={m.id} />
      <Confirmar open={excluir} onClose={() => setExcluir(false)} onConfirm={doExcluir} loading={busy} perigoso titulo="Excluir modelo" botao="Mandar para a lixeira" texto={<>O modelo <b>{m.name}</b> não tem aparelhos e vai para a lixeira. Dá para restaurar em Administração → Lixeira.</>} />
    </Modal>
  );
}

/** Cadastrar ou editar um modelo: nome, categoria, valor de cada unidade e foto. */
function ModeloForm({ m, onClose }: { m?: DeviceModel; onClose: () => void }) {
  const cats = useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => api.admin.catalog('categories') });
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ name: m?.name ?? '', categoryId: m?.categoryId ?? '', valor: centavosParaCampo(m?.valueCents), aplicarATodos: true });
  const [foto, setFoto] = useState<string | null | undefined>(undefined); // undefined = não mexeu; null = tirar
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const valorCentavos = f.valor.trim() ? paraCentavos(f.valor) : null;
  const mudouValor = !!m && valorCentavos !== m.valueCents;
  const fotoAtual = foto === undefined ? logoSrc(m?.imageUrl) : foto;
  const save = async () => {
    setBusy(true); setErr('');
    try {
      let id = m?.id;
      if (m) {
        await api.inventory.updateModel(m.id, { name: f.name.trim(), categoryId: f.categoryId || null, valueCents: valorCentavos, ...(mudouValor && m.counts.ownValue > 0 && f.aplicarATodos ? { aplicarValorATodos: true } : {}) });
      } else {
        // o "código" é só o identificador interno: sai do nome do modelo, sem a pessoa precisar digitar
        const code = f.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
        id = (await api.inventory.createModel({ code, name: f.name.trim(), categoryId: f.categoryId || null, valueCents: valorCentavos })).id;
      }
      if (foto) await api.inventory.saveModelImage(id!, foto);
      else if (foto === null && m?.imageUrl) await api.inventory.removeModelImage(id!);
      await Promise.all(['models', 'devices', 'model-devices', 'inventory', 'client', 'client-devices', 'clients'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast.push('ok', m ? 'Modelo salvo' : 'Modelo cadastrado'); onClose();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} titulo={m ? `Editar ${m.name}` : 'Cadastrar modelo'} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || f.name.trim().length < 2} onClick={save}>{busy ? <Spinner className="text-white" /> : m ? 'Salvar' : 'Cadastrar'}</button></>}>
      <div className="flex flex-col gap-3">
        <Campo label="Modelo"><input className="input" placeholder="Grandstream GXP1610" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Categoria"><select className="input" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">—</option>{cats.data?.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Campo>
          <Campo label="Valor de cada um (R$)" dica="é este valor que soma no cliente"><input className="input tnum" placeholder="0,00" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
        </div>
        {mudouValor && m.counts.ownValue > 0 && (
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={f.aplicarATodos} onChange={(e) => setF({ ...f, aplicarATodos: e.target.checked })} />
            <span><b>Usar este valor em todos</b><span className="text-muted block text-[12.5px]">{m.counts.ownValue} aparelho(s) deste modelo têm valor próprio. Marcado, eles passam a valer o valor do modelo.</span></span>
          </label>
        )}
        <div>
          <span className="label">Foto</span>
          <CampoLogo atual={fotoAtual ?? null} nome={f.name} onEscolher={setFoto} onRemover={fotoAtual ? () => setFoto(null) : undefined} previa={<FotoModelo src={fotoAtual ?? null} nome={f.name || '?'} altura={64} className="w-20 shrink-0 border border-line" />} />
        </div>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}

// ---------- Movimentações ----------

/**
 * O histórico de movimentações, com filtros: modalidade, cliente, **modelo** (só as que levaram
 * aquele modelo) e a **busca por MAC ou N/S** (a vida de um aparelho específico, em ordem).
 */
function Movimentacoes({ models }: { models: DeviceModel[] }) {
  const [sp, setSp] = useSearchParams();
  const modality = sp.get('modalidade') ?? ''; const clientId = sp.get('cliente') ?? ''; const modelId = sp.get('modelo') ?? ''; const q = sp.get('q') ?? ''; const from = sp.get('de') ?? ''; const to = sp.get('ate') ?? ''; const page = Number(sp.get('p') ?? 1);
  const tudo = sp.get('tudo') === '1';
  const tamanho = tudo ? TODOS : 50;
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'p') n.delete('p'); setSp(n, { replace: true }); };
  const clients = useQuery({ queryKey: ['client-options', 'equip'], queryFn: () => api.clients.options({ productCode: 'equipamentos' }) });
  const o = useOrdenacao('createdAt', 'desc');
  const [aberta, setAberta] = useState<string | null>(null);
  const lista = useQuery({ queryKey: ['movements', modality, clientId, modelId, q, from, to, page, tudo, o.ord, o.dir], queryFn: () => api.inventory.movements({ modality, clientId, modelId, q, from: from || undefined, to: to || undefined, page: tudo ? 1 : page, pageSize: tamanho, sort: o.ord, dir: o.dir }) });
  const temFiltro = !!(modality || clientId || modelId || q || from || to);
  const numero = contarDe(tudo ? 1 : page, tamanho); // a contagem segue pela lista toda, não recomeça a cada página
  return (
    <div>
      <div className="card p-3 mb-3 flex flex-wrap gap-2">
        <select className="input w-auto" value={modality} onChange={(e) => set('modalidade', e.target.value || null)}><option value="">Todas as modalidades</option>{Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input w-auto" value={clientId} onChange={(e) => set('cliente', e.target.value || null)}><option value="">Todos os clientes</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input w-auto" value={modelId} onChange={(e) => set('modelo', e.target.value || null)} aria-label="Modelo"><option value="">Todos os modelos</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <input className="input max-w-[220px] font-mono" placeholder="MAC ou N/S de um aparelho" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Buscar aparelho" />
        <input type="date" className="input w-auto" value={from} onChange={(e) => set('de', e.target.value || null)} /><input type="date" className="input w-auto" value={to} onChange={(e) => set('ate', e.target.value || null)} />
        {temFiltro && <button className="btn-ghost btn-sm text-muted" onClick={() => setSp({ aba: 'movimentacoes' }, { replace: true })}>limpar filtros</button>}
      </div>
      {lista.isLoading ? <Carregando /> : !lista.data?.items.length ? <Vazio titulo="Nenhuma movimentação" texto={temFiltro ? 'Nenhuma movimentação com esses filtros.' : undefined} /> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th className="w-6" /><ThN /><Th o={o} col="createdAt">Quando</Th><Th o={o} col="modality">Modalidade</Th><Th o={o} col="fromName">De</Th><Th o={o} col="toName">Para</Th><Th o={o} col="unit">Unidade</Th><th>Itens</th><th>Condição</th><Th o={o} col="userName">Por</Th></tr></thead>
          <tbody>{lista.data.items.map((m, i) => {
            const abrir = aberta === m.id;
            return (
              <Fragment key={m.id}>
                <tr className="cursor-pointer" onClick={() => setAberta(abrir ? null : m.id)} aria-expanded={abrir}>
                  <td className="text-muted">{abrir ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  <TdN n={numero(i)} /><td className="tnum whitespace-nowrap">{data(m.createdAt, true)}</td><td><Chip tone={m.modality === 'devolucao' ? 'neutral' : m.modality === 'venda' ? 'accent' : m.modality === 'comodato' ? 'signal' : 'ok'}>{m.modalityName}</Chip></td>
                  <td>{m.fromClientId ? <Link className="link" to={`/clientes/${m.fromClientId}`} onClick={(e) => e.stopPropagation()}>{m.fromName}</Link> : 'Estoque'}</td><td>{m.toClientId ? <Link className="link" to={`/clientes/${m.toClientId}`} onClick={(e) => e.stopPropagation()}>{m.toName}</Link> : 'Estoque'}</td>
                  <td>{m.unit ?? <span className="text-muted">—</span>}</td>
                  <td>{m.items.map((x) => `${x.quantity}× ${x.modelName}`).join(', ')}</td><td className="text-muted">{m.newCondition ? condicaoNome[m.newCondition] : '—'}</td><td className="text-muted">{m.userName}</td>
                </tr>
                {abrir && (
                  <tr className="bg-surface-2">
                    <td /><td colSpan={9} className="py-2">
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">{m.devices.map((d) => <li key={d.id}><Link className="link" to={`/inventario/aparelhos/${d.id}`}>{d.identificacao}</Link> <span className="text-muted">· {d.modelName}</span></li>)}</ul>
                      {m.note && <p className="text-muted italic text-[12.5px] mt-1">{m.note}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}</tbody></table></div>
      )}
      {lista.data && <Paginacao page={page} pageSize={50} total={lista.data.total} onChange={(p) => set('p', String(p))} tudo={tudo} onTudo={(v) => set('tudo', v ? '1' : null)} />}
    </div>
  );
}
