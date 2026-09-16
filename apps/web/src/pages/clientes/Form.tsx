/** Formulário de criar/editar cliente (dados principais e a logo que aparece no cartão). */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, logoSrc } from '../../api/index.js';
import type { ClientFull } from '../../api/types.js';
import { Campo, CampoLogo, mensagemErro, Modal, Spinner, Toggle, useToast } from '../../components/ui/index.js';
import { cnpjFormatado, cnpjValido } from '../../lib/format.js';

export function ClienteForm({ open, onClose, onSaved, cliente }: { open: boolean; onClose: () => void; onSaved: (c: ClientFull) => void; cliente?: ClientFull }) {
  const [f, setF] = useState({ tradeName: '', legalName: '', cnpj: '', notes: '', archived: false });
  /** A logo escolhida agora: `null` = não mexeu · string = imagem nova · '' = pediu para remover. */
  const [logoNova, setLogoNova] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toast = useToast();
  const qc = useQueryClient();
  useEffect(() => {
    if (!open) return;
    setErr(''); setLogoNova(null);
    setF(cliente
      ? { tradeName: cliente.tradeName, legalName: cliente.legalName, cnpj: cnpjFormatado(cliente.cnpj), notes: cliente.notes ?? '', archived: cliente.archived }
      : { tradeName: '', legalName: '', cnpj: '', notes: '', archived: false });
  }, [open, cliente]);

  const cnpjOk = !f.cnpj || cnpjValido(f.cnpj);
  const logoAtual = logoNova === null ? logoSrc(cliente?.logoUrl ?? null) : logoNova || null;

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const body = { tradeName: f.tradeName, legalName: f.legalName, cnpj: f.cnpj, notes: f.notes || null, archived: f.archived };
      let r = cliente ? await api.clients.update(cliente.id, body) : await api.clients.create(body);
      // a logo é gravada depois, porque um cliente novo só tem endereço próprio depois de criado
      if (logoNova) r = await api.clients.saveLogo(r.id, logoNova);
      else if (logoNova === '' && cliente?.logoUrl) r = await api.clients.removeLogo(r.id);
      await qc.invalidateQueries({ queryKey: ['clients'] }); await qc.invalidateQueries({ queryKey: ['client', r.id] });
      toast.push('ok', cliente ? 'Cliente atualizado' : 'Cliente criado'); onSaved(r);
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} titulo={cliente ? 'Editar cliente' : 'Novo cliente'} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !f.tradeName || !f.legalName || !cnpjOk || !f.cnpj} onClick={save}>{busy ? <Spinner className="text-white" /> : cliente ? 'Salvar' : 'Criar'}</button></>}>
      <div className="flex flex-col gap-3">
        <Campo label="Logo" dica="aparece no cartão do cliente e na lista">
          <CampoLogo atual={logoAtual} nome={f.tradeName} onEscolher={setLogoNova} onRemover={() => setLogoNova('')} />
        </Campo>
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
