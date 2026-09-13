/** Formulário de criar/editar cliente (dados principais). */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/index.js';
import type { ClientFull } from '../../api/types.js';
import { Campo, mensagemErro, Modal, Spinner, Toggle, useToast } from '../../components/ui/index.js';
import { cnpjFormatado, cnpjValido } from '../../lib/format.js';

export function ClienteForm({ open, onClose, onSaved, cliente }: { open: boolean; onClose: () => void; onSaved: (c: ClientFull) => void; cliente?: ClientFull }) {
  const [f, setF] = useState({ tradeName: '', legalName: '', cnpj: '', notes: '', archived: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toast = useToast();
  const qc = useQueryClient();
  useEffect(() => { if (open) { setErr(''); setF(cliente ? { tradeName: cliente.tradeName, legalName: cliente.legalName, cnpj: cnpjFormatado(cliente.cnpj), notes: cliente.notes ?? '', archived: cliente.archived } : { tradeName: '', legalName: '', cnpj: '', notes: '', archived: false }); } }, [open, cliente]);
  const cnpjOk = !f.cnpj || cnpjValido(f.cnpj);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const body = { tradeName: f.tradeName, legalName: f.legalName, cnpj: f.cnpj, notes: f.notes || null, archived: f.archived };
      const r = cliente ? await api.clients.update(cliente.id, body) : await api.clients.create(body);
      await qc.invalidateQueries({ queryKey: ['clients'] }); await qc.invalidateQueries({ queryKey: ['client', r.id] });
      toast.push('ok', cliente ? 'Cliente atualizado' : 'Cliente criado'); onSaved(r);
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} titulo={cliente ? 'Editar cliente' : 'Novo cliente'} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !f.tradeName || !f.legalName || !cnpjOk || !f.cnpj} onClick={save}>{busy ? <Spinner className="text-white" /> : cliente ? 'Salvar' : 'Criar'}</button></>}>
      <div className="flex flex-col gap-3">
        <Campo label="Nome fantasia"><input className="input" value={f.tradeName} onChange={(e) => setF({ ...f, tradeName: e.target.value })} autoFocus /></Campo>
        <Campo label="Razão social"><input className="input" value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} /></Campo>
        <Campo label="CNPJ" erro={f.cnpj && !cnpjOk ? 'CNPJ inválido (dígito verificador não confere)' : undefined}><input className="input font-mono" placeholder="12.345.678/0001-00" value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} onBlur={() => setF((x) => ({ ...x, cnpj: cnpjFormatado(x.cnpj) }))} /></Campo>
        <Campo label="Anotações gerais"><textarea className="input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Campo>
        {cliente && <Toggle checked={f.archived} onChange={(v) => setF({ ...f, archived: v })} label="Arquivado (some da lista, não é apagado)" />}
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}
