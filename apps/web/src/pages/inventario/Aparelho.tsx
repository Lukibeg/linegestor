/** Um aparelho: dados, onde está, histórico de movimentações, edição. */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, Pencil, Trash2 } from 'lucide-react';
import { api, logoSrc } from '../../api/index.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can } from '../../lib/auth.js';
import { Campo, Carregando, Chip, Confirmar, FotoModelo, Modal, Spinner, Vazio, mensagemErro, useToast, InputIp } from '../../components/ui/index.js';
import { centavosParaCampo, condicaoCor, condicaoNome, CONDICOES_APARELHO, data, macFormatado, macValido, MODALIDADES, paraCentavos, reais } from '../../lib/format.js';
import { Movimentar } from './Movimentar.js';
import { Voltar } from '../../lib/voltar.js';

export function AparelhoDetalhe() {
  const { id = '' } = useParams();
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['device', id], queryFn: () => api.inventory.device(id) });
  const clientId = q.data?.clientId ?? '';
  const unidades = useQuery({ queryKey: ['client-units', clientId], queryFn: () => api.clients.units(clientId), enabled: !!clientId });
  const [editar, setEditar] = useState(false); const [mover, setMover] = useState(false); const [excluir, setExcluir] = useState(false); const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Record<string, any>>({}); const [err, setErr] = useState('');
  useEffect(() => {
    if (q.data) setF({ mac: q.data.mac ? macFormatado(q.data.mac) : '', serialNumber: q.data.serialNumber ?? '', unit: q.data.unit ?? '', condition: q.data.condition, valorProprio: centavosParaCampo(q.data.ownValueCents), ip: q.data.ip ?? '', note: q.data.note ?? '' });
  }, [q.data]);
  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Vazio titulo="Aparelho não encontrado" acao={<Link className="btn-secondary" to="/inventario">Voltar</Link>} />;
  const d = q.data;
  const macOk = !f.mac || macValido(f.mac);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api.inventory.updateDevice(d.id, {
        mac: f.mac ? f.mac : null,
        serialNumber: f.serialNumber?.trim() ? f.serialNumber : null,
        unit: d.clientId ? f.unit || null : null,
        condition: f.condition,
        // vazio = volta a usar o valor do modelo
        valueCents: f.valorProprio?.trim() ? paraCentavos(f.valorProprio) : null,
        ip: f.ip || null,
        note: f.note || null,
      });
      await Promise.all(['device', 'devices', 'model-devices', 'client-devices', 'client', 'inventory'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast.push('ok', 'Aparelho atualizado'); setEditar(false);
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  const doDelete = async () => { setBusy(true); try { await api.inventory.removeDevice(d.id); toast.push('ok', 'Aparelho foi para a lixeira'); nav('/inventario'); } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); } };
  const titulo = d.identificacaoTipo === 'mac' ? d.identificacao : d.identificacaoTipo === 'serie' ? `N/S ${d.identificacao}` : `${d.modelName} (sem identificação)`;
  return (
    <Pagina voltar={<Voltar rota="/inventario" texto="Voltar ao inventário" />} titulo={<span className="font-mono">{titulo}</span>} sub={<span>{d.modelName}{d.unit ? ` · ${d.unit}` : ''}</span>} acoes={<>
      <Can permission="devices.move">{d.currentModality !== 'venda' && <button className="btn-primary" onClick={() => setMover(true)}><ArrowLeftRight size={15} /> {d.clientId ? 'Devolver / mover' : 'Movimentar'}</button>}</Can>
      <Can permission="records.write"><button className="btn-secondary" onClick={() => setEditar(true)}><Pencil size={15} /> Editar</button></Can>
      <Can permission="records.delete"><button className="btn-ghost text-bad" onClick={() => setExcluir(true)}><Trash2 size={15} /></button></Can>
    </>}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4 md:col-span-1 flex flex-col gap-3">
          <FotoModelo src={logoSrc(d.modelImageUrl)} nome={d.modelName} altura={120} />
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">MAC</dt><dd className="font-mono">{d.mac ? d.macFormatted : <span className="text-muted font-sans">—</span>}</dd>
            <dt className="text-muted">N/S</dt><dd className="font-mono">{d.serialNumber ?? <span className="text-muted font-sans">—</span>}</dd>
            <dt className="text-muted">Atribuído a</dt><dd>{d.clientId ? <Link className="link" to={`/clientes/${d.clientId}`}>{d.clientName}</Link> : <Chip tone="ok">estoque</Chip>}</dd>
            {d.clientId && <><dt className="text-muted">Unidade</dt><dd>{d.unit ?? 'Matriz'}</dd></>}
            <dt className="text-muted">Modalidade</dt><dd>{d.currentModality ? (MODALIDADES as any)[d.currentModality] : '—'}</dd>
            <dt className="text-muted">Condição</dt><dd><Chip tone={condicaoCor[d.condition] as any}>{condicaoNome[d.condition] ?? d.condition}</Chip></dd>
            <dt className="text-muted">Valor</dt><dd className="tnum">{reais(d.valueCents)} <span className="text-muted text-[12px]">{d.ownValueCents != null ? '(próprio deste aparelho)' : '(do modelo)'}</span></dd>
            <dt className="text-muted">IP</dt><dd className="font-mono">{d.ip ?? '—'}</dd>
            {d.macSecondary && <><dt className="text-muted">MAC 2</dt><dd className="font-mono">{d.macSecondary}</dd></>}
          </dl>
          {d.note && <p className="text-sm whitespace-pre-wrap text-ink-2 border-t border-line pt-3">{d.note}</p>}
        </div>
        <div className="card md:col-span-2">
          <div className="px-4 py-3 border-b border-line font-display font-semibold">Histórico</div>
          {!d.history?.length ? <div className="p-4 text-muted text-sm">Nenhuma movimentação ainda — está no estoque desde o cadastro.</div> : (
            <ul>{d.history.map((h) => <li key={h.id} className="px-4 py-2.5 border-b border-line last:border-0 text-sm flex flex-wrap gap-x-3 gap-y-1 items-center"><span className="text-muted tnum w-32 shrink-0">{data(h.createdAt, true)}</span><Chip tone={h.modality === 'devolucao' ? 'neutral' : h.modality === 'venda' ? 'accent' : 'ok'}>{h.modalityName}</Chip><span>{h.fromName ?? 'Estoque'} → {h.toName ?? 'Estoque'}{h.unit ? <span className="text-muted"> ({h.unit})</span> : null}</span>{h.newCondition && <span className="text-muted">· {condicaoNome[h.newCondition]}</span>}<span className="ml-auto text-muted">{h.userName}</span>{h.note && <span className="w-full text-muted italic">{h.note}</span>}</li>)}</ul>
          )}
        </div>
      </div>
      <Modal open={editar} onClose={() => setEditar(false)} titulo="Editar aparelho" rodape={<><button className="btn-secondary" onClick={() => setEditar(false)}>Cancelar</button><button className="btn-primary" disabled={busy || !macOk} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="MAC" erro={!macOk ? '12 caracteres hexadecimais' : undefined} dica="vazio = não tem"><input className="input font-mono" placeholder="00:0B:82:A1:B2:C3" value={f.mac ?? ''} onChange={(e) => setF({ ...f, mac: e.target.value })} /></Campo>
          <Campo label="Número de série (N/S)" dica="vazio = não tem"><input className="input font-mono" value={f.serialNumber ?? ''} onChange={(e) => setF({ ...f, serialNumber: e.target.value })} /></Campo>
          {d.clientId && (
            <Campo label="Unidade" dica="as unidades cadastradas no cliente">
              <select className="input" value={f.unit ?? ''} onChange={(e) => setF({ ...f, unit: e.target.value })}>
                {!(unidades.data ?? []).some((u) => u.name === f.unit) && <option value={f.unit ?? ''}>{f.unit || 'Matriz'}</option>}
                {unidades.data?.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </Campo>
          )}
          <Campo label="Condição"><select className="input" value={f.condition ?? 'ativo'} onChange={(e) => setF({ ...f, condition: e.target.value })}>{Object.entries(CONDICOES_APARELHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo label="Valor próprio (R$)" dica={`vazio = valor do modelo${d.modelValueCents != null ? ` (${reais(d.modelValueCents)})` : ''}`}><input className="input tnum" placeholder={centavosParaCampo(d.modelValueCents) || '0,00'} value={f.valorProprio ?? ''} onChange={(e) => setF({ ...f, valorProprio: e.target.value })} /></Campo>
          <Campo label="IP"><InputIp value={f.ip ?? ''} onChange={(v) => setF({ ...f, ip: v })} /></Campo>
          <Campo label="Anotação" className="col-span-2"><textarea className="input" rows={3} value={f.note ?? ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Campo>
        </div>
        {err && <div className="text-bad text-sm mt-2">{err}</div>}
      </Modal>
      <Movimentar open={mover} onClose={() => setMover(false)} preset={{ devices: [d] }} />
      <Confirmar open={excluir} onClose={() => setExcluir(false)} onConfirm={doDelete} loading={busy} perigoso titulo="Mandar aparelho para a lixeira" botao="Mandar para a lixeira" texto={<>O aparelho <b className="font-mono">{titulo}</b> sai das listas; o histórico fica. Dá para restaurar na lixeira.</>} />
    </Pagina>
  );
}
