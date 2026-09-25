/** Importar (com prévia) e exportar CSV. */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, ShieldAlert } from 'lucide-react';
import { api, IS_DEMO } from '../../api/index.js';
import type { ImportPlan } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can, useAuth } from '../../lib/auth.js';
import { Campo, Chip, Modal, Spinner, mensagemErro, useToast } from '../../components/ui/index.js';

const ENTIDADES = [
  { id: 'clients', nome: 'Clientes', colunas: 'cnpj; nome_fantasia; razao_social; produtos (separados por |); modulos (produto:modulo, ex.: linepbx:fop2); dominio; ip_servidor; usuario_ssh; porta_ssh; senha_ssh; hospedagem; observacoes', regra: 'CNPJ que já existe → atualiza. CNPJ novo → cria. Coluna de senha vazia → mantém a senha atual. "fop2" e "omniboard" na coluna produtos viram módulos do LinePBX.' },
  { id: 'circuits', nome: 'Circuitos', colunas: 'nome; n_circuito; numero_chave; operadora; canais; ip; ip_pbx; usuario_auth; senha_auth; valor; titular; observacoes', regra: 'N° do circuito + operadora que já existem → atualiza. Senão → cria.' },
  { id: 'dids', nome: 'DIDs', colunas: 'numero; circuito (código ou nome); cliente (CNPJ ou nome, ou "livre"); titular; observacao', regra: 'Número que já existe → atualiza circuito/cliente. Número novo → cria.' },
];

export function Dados() {
  const { can } = useAuth();
  const toast = useToast(); const qc = useQueryClient();
  const [entity, setEntity] = useState('clients'); const [delimiter, setDelim] = useState(';'); const [csv, setCsv] = useState(''); const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [feito, setFeito] = useState('');
  const [secretsFor, setSecretsFor] = useState<string | null>(null); const [pw, setPw] = useState(''); const [zipPw, setZipPw] = useState('');
  const ent = ENTIDADES.find((e) => e.id === entity)!;

  const onFile = (file: File) => { setFileName(file.name); setErr(''); setFeito(''); file.text().then((t) => { setCsv(t); setPlan(null); if (t.includes('\t')) setDelim('\t'); else if ((t.split('\n')[0]?.split(',').length ?? 0) > (t.split('\n')[0]?.split(';').length ?? 0)) setDelim(','); else setDelim(';'); }); };
  const preview = async () => { setBusy(true); setErr(''); setFeito(''); try { setPlan(await api.data.preview({ entity, csv, delimiter })); } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); } };
  // O resultado também fica escrito na tela (não só no aviso que some), porque a pessoa está
  // olhando para o botão, lá embaixo, e precisa ver ali mesmo se deu certo ou o que deu errado.
  const apply = async () => {
    setBusy(true); setErr(''); setFeito('');
    try {
      const r = await api.data.apply({ entity, csv, delimiter });
      const texto = `Importado: ${r.created} criado(s), ${r.updated} atualizado(s)`;
      toast.push('ok', texto); setFeito(texto);
      setPlan(null); setCsv(''); setFileName('');
      await qc.invalidateQueries();
    } catch (e) {
      setErr(mensagemErro(e));
    } finally { setBusy(false); }
  };
  const exportSecrets = async () => { if (!secretsFor) return; setBusy(true); setErr(''); try { const r = await api.data.exportWithSecrets(secretsFor, pw); setZipPw(r.zipPassword); const url = URL.createObjectURL(r.blob); const a = document.createElement('a'); a.href = url; a.download = r.filename; a.click(); URL.revokeObjectURL(url); setPw(''); } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); } };

  return (
    <Pagina titulo="Importar / Exportar" sub="CSV com ponto e vírgula por padrão. A importação mostra o que vai fazer antes de gravar.">
      {/* grid-cols-1 + min-w-0: o campo de arquivo não empurra a página para o lado no celular */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Can permission="data.import" fallback={<div className="card p-4 text-muted text-sm">Você não tem permissão para importar.</div>}>
          <section className="card p-4 flex flex-col gap-3 min-w-0">
            <h2 className="font-display font-semibold flex items-center gap-2"><FileUp size={17} /> Importar</h2>
            <div className="flex gap-1">{ENTIDADES.map((e) => <button key={e.id} onClick={() => { setEntity(e.id); setPlan(null); }} className={`chip border ${entity === e.id ? 'bg-accent-soft text-accent-ink border-transparent' : 'border-line text-ink-2 bg-transparent'}`}>{e.nome}</button>)}</div>
            <div className="text-[12.5px] text-muted"><b>Colunas aceitas:</b> {ent.colunas}<br /><b>Regra:</b> {ent.regra}</div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
              <Campo label="Arquivo CSV"><input type="file" accept=".csv,text/csv" className="input" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></Campo>
              <Campo label="Separador"><select className="input" value={delimiter} onChange={(e) => setDelim(e.target.value)}><option value=";">;</option><option value=",">,</option><option value={'\t'}>TAB</option></select></Campo>
            </div>
            {csv && <div className="text-[12.5px] text-muted">{fileName} · {csv.split(/\r?\n/).filter(Boolean).length - 1} linha(s) de dados</div>}
            <div className="flex gap-2"><button className="btn-primary" disabled={!csv || busy} onClick={preview}>{busy && !plan ? <Spinner className="text-white" /> : 'Pré-visualizar'}</button></div>
            {!plan && err && <div className="card bg-bad-soft border-bad p-3 text-bad text-sm">{err}</div>}
            {feito && <div className="card bg-ok-soft border-ok p-3 text-ok text-sm">{feito}</div>}
            {plan && (
              <div className="border-t border-line pt-3">
                <div className="flex flex-wrap gap-2 mb-2"><Chip tone="ok">{plan.summary.create} novo(s)</Chip><Chip tone="accent">{plan.summary.update} atualização(ões)</Chip><Chip tone={plan.summary.error ? 'bad' : 'muted'}>{plan.summary.error} erro(s)</Chip></div>
                <div className="max-h-64 overflow-y-auto border border-line rounded-lg text-[12.5px]">
                  {plan.rows.map((r) => <div key={r.line} className={`px-3 py-1.5 border-b border-line last:border-0 flex gap-2 ${r.action === 'error' ? 'bg-bad-soft' : ''}`}><span className="text-muted tnum w-12 shrink-0">L{r.line}</span><span className={`w-16 shrink-0 font-semibold ${r.action === 'create' ? 'text-ok' : r.action === 'update' ? 'text-accent' : 'text-bad'}`}>{r.action === 'create' ? 'criar' : r.action === 'update' ? 'atualizar' : 'erro'}</span><span className="truncate">{r.key}</span>{r.errors.length > 0 && <span className="text-bad ml-auto text-right">{r.errors.join('; ')}</span>}</div>)}
                </div>
                {err && <div className="card bg-bad-soft border-bad p-3 text-bad text-sm mt-3">Nada foi gravado. {err}</div>}
                {plan.summary.error > 0 ? <p className="text-bad text-sm mt-2">Corrija as linhas com erro no arquivo e envie de novo. Nada foi gravado.</p> : <button className="btn-primary mt-3" disabled={busy} onClick={apply}>{busy ? <><Spinner className="text-white" /> Aplicando…</> : `Aplicar (${plan.summary.create + plan.summary.update} linha(s))`}</button>}
              </div>
            )}
          </section>
        </Can>

        <Can permission="data.export" fallback={<div className="card p-4 text-muted text-sm">Você não tem permissão para exportar.</div>}>
          <section className="card p-4 flex flex-col gap-3 min-w-0">
            <h2 className="font-display font-semibold flex items-center gap-2"><Download size={17} /> Exportar</h2>
            <p className="text-[12.5px] text-muted">Sai com cabeçalho e separador ponto e vírgula, pronto para reimportar. Senhas <b>não</b> saem por aqui.</p>
            <div className="flex flex-col gap-2">{ENTIDADES.map((e) => <a key={e.id} className="btn-secondary justify-start" href={api.data.exportUrl(e.id)} download={`${e.id}.csv`}><Download size={15} /> {e.nome} (sem senhas)</a>)}</div>
            {can('data.export_secrets') && (
              <div className="border-t border-line pt-3 mt-1">
                <div className="flex items-start gap-2 text-[12.5px] text-ink-2"><ShieldAlert size={16} className="text-signal shrink-0 mt-0.5" /><span><b>Exportar com senhas</b> — só para backup completo. Exige confirmar sua senha, fica registrado na auditoria, e o arquivo sai num ZIP protegido por uma senha que aparece uma única vez.</span></div>
                <div className="flex gap-2 mt-2"><button className="btn-signal btn-sm" onClick={() => setSecretsFor('clients')}>Clientes com senhas</button><button className="btn-signal btn-sm" onClick={() => setSecretsFor('circuits')}>Circuitos com senhas</button></div>
              </div>
            )}
          </section>
        </Can>
      </div>
      <Modal open={!!secretsFor} onClose={() => { setSecretsFor(null); setZipPw(''); setErr(''); }} titulo="Exportar com senhas" rodape={zipPw ? <button className="btn-primary" onClick={() => { setSecretsFor(null); setZipPw(''); }}>Fechar</button> : <><button className="btn-secondary" onClick={() => setSecretsFor(null)}>Cancelar</button><button className="btn-signal" disabled={!pw || busy} onClick={exportSecrets}>{busy ? <Spinner className="text-white" /> : 'Gerar ZIP protegido'}</button></>}>
        {zipPw ? (
          <div className="text-sm"><p className="mb-2">O arquivo foi baixado. A senha do ZIP é:</p><div className="card p-3 font-mono text-lg text-center select-all">{zipPw}</div><p className="text-muted text-[12.5px] mt-2">Ela não é guardada em lugar nenhum. Copie agora.{IS_DEMO && ' (Na demonstração o arquivo é só um exemplo.)'}</p></div>
        ) : (
          <div className="flex flex-col gap-3"><p className="text-sm text-ink-2">Confirme a <b>sua</b> senha para exportar <b>{secretsFor === 'clients' ? 'clientes' : 'circuitos'}</b> com as senhas guardadas.</p><input type="password" className="input" placeholder="sua senha" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />{err && <div className="text-bad text-sm">{err}</div>}</div>
        )}
      </Modal>
    </Pagina>
  );
}
