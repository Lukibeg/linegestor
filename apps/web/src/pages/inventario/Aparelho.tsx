/** Um aparelho: dados, onde está, histórico de movimentações, edição. */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../api/index.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can } from '../../lib/auth.js';
import { Campo, Carregando, Chip, Confirmar, Modal, Spinner, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { condicaoCor, condicaoNome, CONDICOES_APARELHO, data, MODALIDADES, paraCentavos, reais } from '../../lib/format.js';
import { Movimentar } from './Movimentar.js';

export function AparelhoDetalhe() {
  const { id = '' } = useParams();
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['device', id], queryFn: () => api.inventory.device(id) });
  const unidades = useQuery({ queryKey: ['inventory', 'units'], queryFn: () => api.inventory.units() });
  const [editar, setEditar] = useState(false); const [mover, setMover] = useState(false); const [excluir, setExcluir] = useState(false); const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Record<string, any>>({}); const [err, setErr] = useState('');
  useEffect(() => { if (q.data) setF({ unit: q.data.unit ?? '', condition: q.data.condition, valueCents: q.data.valueCents != null ? (q.data.valueCents / 100).toFixed(2).replace('.', ',') : '', ip: q.data.ip ?? '', location: q.data.location ?? '', note: q.data.note ?? '' }); }, [q.data]);
  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Vazio titulo="Aparelho não encontrado" acao={<Link className="btn-secondary" to="/inventario">Voltar</Link>} />;
  const d = q.data;
  const save = async () => { setBusy(true); setErr(''); try { await api.inventory.updateDevice(d.id, { unit: d.clientId ? f.unit || null : null, condition: f.condition, valueCents: f.valueCents ? paraCentavos(f.valueCents) : null, ip: f.ip || null, location: f.location || null, note: f.note || null }); await qc.invalidateQueries({ queryKey: ['device', id] }); await qc.invalidateQueries({ queryKey: ['devices'] }); toast.push('ok', 'Aparelho atualizado'); setEditar(false); } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); } };
  const doDelete = async () => { setBusy(true); try { await api.inventory.removeDevice(d.id); toast.push('ok', 'Aparelho foi para a lixeira'); nav('/inventario'); } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); } };
  return (
    <Pagina titulo={<span className="font-mono">{d.macFormatted}</span>} sub={<span>{d.modelName}{d.unit ? ` · ${d.unit}` : ''}</span>} acoes={<>
      <Can permission="devices.move">{d.currentModality !== 'venda' && <button className="btn-primary" onClick={() => setMover(true)}><ArrowLeftRight size={15} /> {d.clientId ? 'Devolver / mover' : 'Movimentar'}</button>}</Can>
      <Can permission="records.write"><button className="btn-secondary" onClick={() => setEditar(true)}><Pencil size={15} /> Editar</button></Can>
      <Can permission="records.delete"><button className="btn-ghost text-bad" onClick={() => setExcluir(true)}><Trash2 size={15} /></button></Can>
    </>}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4 md:col-span-1">
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Atribuído a</dt><dd>{d.clientId ? <Link className="link" to={`/clientes/${d.clientId}`}>{d.clientName}</Link> : <Chip tone="ok">estoque</Chip>}</dd>
            {d.clientId && <><dt className="text-muted">Unidade</dt><dd>{d.unit ?? <span className="text-muted">—</span>}</dd></>}
            <dt className="text-muted">Modalidade</dt><dd>{d.currentModality ? (MODALIDADES as any)[d.currentModality] : '—'}</dd>
            <dt className="text-muted">Condição</dt><dd><Chip tone={condicaoCor[d.condition] as any}>{condicaoNome[d.condition] ?? d.condition}</Chip></dd>
            <dt className="text-muted">Valor</dt><dd className="tnum">{reais(d.valueCents)}</dd>
            <dt className="text-muted">IP</dt><dd className="font-mono">{d.ip ?? '—'}</dd>
            <dt className="text-muted">Local físico</dt><dd>{d.location ?? '—'}</dd>
            {d.macSecondary && <><dt className="text-muted">MAC 2</dt><dd className="font-mono">{d.macSecondary}</dd></>}
          </dl>
          {d.note && <p className="text-sm mt-3 whitespace-pre-wrap text-ink-2 border-t border-line pt-3">{d.note}</p>}
        </div>
        <div className="card md:col-span-2">
          <div className="px-4 py-3 border-b border-line font-display font-semibold">Histórico</div>
          {!d.history?.length ? <div className="p-4 text-muted text-sm">Nenhuma movimentação ainda — está no estoque desde o cadastro.</div> : (
            <ul>{d.history.map((h) => <li key={h.id} className="px-4 py-2.5 border-b border-line last:border-0 text-sm flex flex-wrap gap-x-3 gap-y-1 items-center"><span className="text-muted tnum w-32 shrink-0">{data(h.createdAt, true)}</span><Chip tone={h.modality === 'devolucao' ? 'neutral' : h.modality === 'venda' ? 'accent' : 'ok'}>{h.modalityName}</Chip><span>{h.fromName ?? 'Estoque'} → {h.toName ?? 'Estoque'}</span>{h.newCondition && <span className="text-muted">· {condicaoNome[h.newCondition]}</span>}<span className="ml-auto text-muted">{h.userName}</span>{h.note && <span className="w-full text-muted italic">{h.note}</span>}</li>)}</ul>
          )}
        </div>
      </div>
      <Modal open={editar} onClose={() => setEditar(false)} titulo="Editar aparelho" rodape={<><button className="btn-secondary" onClick={() => setEditar(false)}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
        <div className="grid grid-cols-2 gap-3">
          {d.clientId && <Campo label="Unidade" dica="filial/loja onde o aparelho está"><input className="input" list="unidades-conhecidas" placeholder="Loja Simões Filho" value={f.unit ?? ''} onChange={(e) => setF({ ...f, unit: e.target.value })} /><datalist id="unidades-conhecidas">{(unidades.data ?? []).map((u) => <option key={u} value={u} />)}</datalist></Campo>}
          <Campo label="Condição"><select className="input" value={f.condition ?? 'ativo'} onChange={(e) => setF({ ...f, condition: e.target.value })}>{Object.entries(CONDICOES_APARELHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo label="Valor (R$)"><input className="input tnum" value={f.valueCents ?? ''} onChange={(e) => setF({ ...f, valueCents: e.target.value })} /></Campo>
          <Campo label="IP"><input className="input font-mono" value={f.ip ?? ''} onChange={(e) => setF({ ...f, ip: e.target.value })} /></Campo>
          <Campo label="Local físico" className="col-span-2"><input className="input" value={f.location ?? ''} onChange={(e) => setF({ ...f, location: e.target.value })} /></Campo>
          <Campo label="Anotação" className="col-span-2"><textarea className="input" rows={3} value={f.note ?? ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Campo>
        </div>
        {err && <div className="text-bad text-sm mt-2">{err}</div>}
      </Modal>
      <Movimentar open={mover} onClose={() => setMover(false)} preset={{ devices: [d] }} />
      <Confirmar open={excluir} onClose={() => setExcluir(false)} onConfirm={doDelete} loading={busy} perigoso titulo="Mandar aparelho para a lixeira" botao="Mandar para a lixeira" texto={<>O aparelho <b className="font-mono">{d.macFormatted}</b> sai das listas; o histórico fica. Dá para restaurar na lixeira.</>} />
    </Pagina>
  );
}
