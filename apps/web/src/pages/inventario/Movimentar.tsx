/**
 * Painel "Movimentar aparelhos": leva aparelhos do estoque para um cliente (locação, venda,
 * comodato) ou traz de volta do cliente para o estoque (devolução).
 *
 * O valor não se informa aqui: ele é do modelo (ou do próprio aparelho) e é o que soma na
 * ficha do cliente. Aqui só se diz o que vai, para onde — cliente e unidade —, e em que
 * condição fica. A unidade sai das unidades cadastradas no cliente; a Matriz é a padrão.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { api } from '../../api/index.js';
import type { Device } from '../../api/types.js';
import { Campo, Chip, Modal, Spinner, TODOS, mensagemErro, useToast } from '../../components/ui/index.js';
import { CONDICOES_APARELHO, MODALIDADES } from '../../lib/format.js';

const NOVA = '__nova__';

export function Movimentar({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: { devices?: Device[] } }) {
  const [modality, setModality] = useState<keyof typeof MODALIDADES>('locacao');
  const [toClientId, setTo] = useState('');
  const [fromClientId, setFrom] = useState('');
  const [newCondition, setCond] = useState('');
  const [unit, setUnit] = useState('');
  const [novaUnidade, setNovaUnidade] = useState('');
  const [note, setNote] = useState('');
  const [escolhidos, setEscolhidos] = useState<Device[]>([]);
  const [busca, setBusca] = useState('');
  const [modelId, setModelId] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const qc = useQueryClient(); const toast = useToast();

  const clients = useQuery({ queryKey: ['client-options', 'equip'], queryFn: () => api.clients.options({ productCode: 'equipamentos' }), enabled: open });
  // na devolução só faz sentido oferecer quem está com aparelho nosso agora
  const comAparelho = useQuery({ queryKey: ['client-options', 'com-aparelho'], queryFn: () => api.clients.options({ withDevices: true }), enabled: open });
  const models = useQuery({ queryKey: ['models'], queryFn: () => api.inventory.models(), enabled: open });
  const devolucao = modality === 'devolucao';
  const origem = devolucao ? (fromClientId || undefined) : 'stock';
  // a lista inteira de disponíveis, sem corte: "selecionar todos" pega todos mesmo
  const devices = useQuery({
    queryKey: ['devices-pick', origem, busca, modelId],
    queryFn: () => api.inventory.devices({ q: busca, clientId: origem, modelId, page: 1, pageSize: TODOS }),
    enabled: open && (!devolucao || !!fromClientId),
  });
  const unidades = useQuery({ queryKey: ['client-units', toClientId], queryFn: () => api.clients.units(toClientId), enabled: open && !devolucao && !!toClientId });

  useEffect(() => {
    if (!open) return;
    setErr(''); setEscolhidos(preset?.devices ?? []); setBusca(''); setModelId(''); setNote(''); setCond(''); setUnit(''); setNovaUnidade(''); setTo('');
    setFrom(preset?.devices?.[0]?.clientId ?? '');
    if (preset?.devices?.[0]?.clientId) setModality('devolucao');
  }, [open, preset]);

  // trocou o cliente: a unidade volta para a Matriz dele (assim que a lista dele chegar)
  useEffect(() => { setUnit(''); setNovaUnidade(''); }, [toClientId]);
  useEffect(() => {
    const matriz = unidades.data?.find((u) => u.isMain);
    if (!unit && matriz) setUnit(matriz.name);
  }, [unidades.data, unit]);

  const disponiveis = useMemo(() => (devices.data?.items ?? []).filter((d) => !escolhidos.some((e) => e.id === d.id)), [devices.data, escolhidos]);
  const rotulo = (d: Device) => `${d.modelName} · ${d.identificacaoTipo === 'nenhum' ? 'sem identificação' : d.identificacaoTipo === 'serie' ? `N/S ${d.identificacao}` : d.identificacao}`;
  const unidadeFinal = unit === NOVA ? novaUnidade.trim() : unit;

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.inventory.move({
        modality,
        toClientId: devolucao ? null : toClientId,
        newCondition: newCondition || null,
        unit: devolucao ? null : unidadeFinal || null,
        note: note || null,
        items: escolhidos.map((d) => ({ deviceId: d.id })),
      });
      toast.push('ok', `${MODALIDADES[modality]} de ${r.quantity} aparelho(s) registrada`);
      await Promise.all(['devices', 'devices-pick', 'models', 'model-devices', 'movements', 'dashboard', 'client-devices', 'client-units', 'client', 'device', 'inventory', 'clients'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onClose();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };

  const destinoOk = devolucao || (!!toClientId && !(unit === NOVA && !novaUnidade.trim()));
  return (
    <Modal open={open} onClose={onClose} lateral largura="max-w-2xl" titulo="Movimentar aparelhos"
      rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={busy || !escolhidos.length || !destinoOk} onClick={run}>{busy ? <Spinner className="text-white" /> : `${MODALIDADES[modality]} · ${escolhidos.length} aparelho(s)`}</button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Modalidade" dica={devolucao ? 'volta do cliente para o nosso estoque' : undefined}>
            <select className="input" value={modality} onChange={(e) => { setModality(e.target.value as any); setEscolhidos([]); }}>
              {Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
          {devolucao
            ? <Campo label="Devolvido por (cliente)" dica="só clientes que estão com aparelho nosso"><select className="input" value={fromClientId} onChange={(e) => { setFrom(e.target.value); setEscolhidos([]); }}><option value="">{comAparelho.data && !comAparelho.data.length ? 'Nenhum cliente está com aparelho' : 'Selecione…'}</option>{comAparelho.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Campo>
            : <Campo label="Cliente de destino" dica="só clientes que assinam Equipamentos"><select className="input" value={toClientId} onChange={(e) => setTo(e.target.value)}><option value="">Selecione…</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Campo>}
          <Campo label="Condição" dica="vazio = manter como está">
            <select className="input" value={newCondition} onChange={(e) => setCond(e.target.value)}>
              <option value="">manter atual</option>
              {Object.entries(CONDICOES_APARELHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
          {!devolucao && (
            <Campo label="Unidade do cliente" dica={toClientId ? 'as unidades cadastradas na ficha do cliente' : 'escolha o cliente primeiro'}>
              <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={!toClientId || unidades.isLoading}>
                {!toClientId && <option value="">—</option>}
                {unidades.data?.map((u) => <option key={u.id} value={u.name}>{u.name}{u.isMain ? ' (padrão)' : ''}</option>)}
                {toClientId && <option value={NOVA}>+ nova unidade…</option>}
              </select>
              {unit === NOVA && <input className="input mt-2" placeholder="nome da unidade nova" value={novaUnidade} onChange={(e) => setNovaUnidade(e.target.value)} autoFocus />}
              {toClientId && <div className="text-[12px] mt-1"><Link className="link" to={`/clientes/${toClientId}?aba=unidades`} onClick={onClose}>gerenciar unidades deste cliente</Link></div>}
            </Campo>
          )}
        </div>

        <div className="card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="eyebrow">Aparelhos selecionados ({escolhidos.length})</span>
            {escolhidos.length > 1 && <button className="btn-ghost btn-sm text-muted" onClick={() => setEscolhidos([])}>limpar</button>}
          </div>
          {escolhidos.length === 0 ? <div className="text-muted text-sm">Nenhum ainda. Escolha abaixo.</div> : (
            <ul className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {escolhidos.map((d) => (
                <li key={d.id}>
                  <Chip tone="accent">{rotulo(d)} <button onClick={() => setEscolhidos(escolhidos.filter((x) => x.id !== d.id))} aria-label={`remover ${rotulo(d)}`}><X size={12} /></button></Chip>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="eyebrow mb-2">Aparelhos {devolucao ? 'com o cliente' : 'no estoque'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-2 mb-2">
            <select className="input sm:w-auto" value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={devolucao && !fromClientId}>
              <option value="">Todos os modelos</option>
              {models.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input className="input font-mono" placeholder="filtrar por MAC, N/S ou unidade" value={busca} onChange={(e) => setBusca(e.target.value)} disabled={devolucao && !fromClientId} />
          </div>
          <div className="max-h-64 overflow-y-auto border border-line rounded-lg">
            {devolucao && !fromClientId ? <div className="p-3 text-muted text-sm">Escolha o cliente que está devolvendo.</div>
              : devices.isLoading ? <div className="p-3 text-muted text-sm">Buscando…</div>
              : !disponiveis.length ? <div className="p-3 text-muted text-sm">Nenhum aparelho disponível com esses filtros.</div>
              : (
                <>
                  {disponiveis.length > 1 && (
                    <button type="button" className="w-full text-left px-3 py-1.5 text-[12.5px] text-accent hover:bg-surface-2 border-b border-line sticky top-0 bg-surface"
                      onClick={() => setEscolhidos([...escolhidos, ...disponiveis])}>
                      Selecionar os {disponiveis.length} da lista
                    </button>
                  )}
                  {disponiveis.map((d) => (
                    <button key={d.id} type="button" onClick={() => setEscolhidos([...escolhidos, d])}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {d.identificacaoTipo === 'nenhum' ? <span className="text-muted">sem identificação</span> : <span className="font-mono">{d.identificacaoTipo === 'serie' && <span className="text-muted font-sans text-[11px] mr-1">N/S</span>}{d.identificacao}</span>}
                        {d.unit && <span className="text-muted"> · {d.unit}</span>}
                      </span>
                      <span className="text-muted whitespace-nowrap">{d.modelName}</span>
                    </button>
                  ))}
                </>
              )}
          </div>
        </div>

        <Campo label="Observação"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}
