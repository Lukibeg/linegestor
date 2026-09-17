/**
 * Minha conta: trocar a própria senha e ligar a verificação em duas etapas.
 * Cada pessoa cuida da sua — ninguém mexe na de outra por aqui.
 */
import { useState } from 'react';
import { KeyRound, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { api } from '../api/index.js';
import { useAuth } from '../lib/auth.js';
import { Pagina } from '../components/layout/AppShell.js';
import { Campo, Chip, Modal, Spinner, mensagemErro, useToast } from '../components/ui/index.js';

export function Conta() {
  const { user, refresh } = useAuth();
  if (!user) return null;
  return (
    <Pagina titulo="Minha conta" sub={<span>{user.name} · {user.roleName}</span>}>
      <div className="grid gap-4 md:grid-cols-2 items-start">
        <DuasEtapas ligado={user.twoFactor} restam={user.recoveryLeft} aoMudar={refresh} />
        <TrocarSenha />
      </div>
    </Pagina>
  );
}

// ---------- verificação em duas etapas ----------

function DuasEtapas({ ligado, restam, aoMudar }: { ligado: boolean; restam: number; aoMudar: () => Promise<void> }) {
  const toast = useToast();
  const [passo, setPasso] = useState<'fechado' | 'qr' | 'codigos' | 'desligar'>('fechado');
  const [qr, setQr] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [recuperacao, setRecuperacao] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const comecar = async () => {
    setBusy(true); setErr('');
    try { setQr(await api.auth.twoFactorSetup()); setCodigo(''); setPasso('qr'); }
    catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); }
  };
  const confirmar = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.auth.twoFactorEnable(codigo.trim());
      setRecuperacao(r.recovery); setPasso('codigos'); await aoMudar();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  const desligar = async () => {
    setBusy(true); setErr('');
    try { await api.auth.twoFactorDisable(senha); setSenha(''); setPasso('fechado'); await aoMudar(); toast.push('ok', 'Verificação em duas etapas desligada'); }
    catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ligado ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-muted'}`}>
          {ligado ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold flex items-center gap-2">
            Verificação em duas etapas
            {ligado ? <Chip tone="ok">ligada</Chip> : <Chip tone="muted">desligada</Chip>}
          </div>
          <p className="text-[13.5px] text-ink-2 mt-1">
            Além da senha, o sistema pede um código de 6 dígitos que só existe no seu celular e muda a cada 30 segundos.
            Quem descobrir a sua senha ainda assim não entra.
          </p>
          {ligado && (
            <p className={`text-[12.5px] mt-2 ${restam <= 2 ? 'text-bad' : 'text-muted'}`}>
              {restam} código(s) de recuperação ainda disponíveis.
              {restam <= 2 && ' Desligue e ligue de novo para gerar uma leva nova.'}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        {ligado
          ? <button className="btn-secondary" onClick={() => { setErr(''); setPasso('desligar'); }}><ShieldOff size={15} /> Desligar</button>
          : <button className="btn-primary" disabled={busy} onClick={comecar}>{busy ? <Spinner className="text-white" /> : <><Smartphone size={15} /> Ligar no meu celular</>}</button>}
      </div>

      {/* passo 1: ler o QR Code */}
      <Modal open={passo === 'qr'} onClose={() => setPasso('fechado')} titulo="Ligar a verificação em duas etapas"
        rodape={<><button className="btn-secondary" onClick={() => setPasso('fechado')}>Cancelar</button>
          <button className="btn-primary" disabled={busy || codigo.trim().length < 6} onClick={confirmar}>{busy ? <Spinner className="text-white" /> : 'Confirmar'}</button></>}>
        <ol className="text-sm text-ink-2 flex flex-col gap-3">
          <li>
            <b>1.</b> Instale um aplicativo de autenticação no celular, se ainda não tiver:
            Google Authenticator, Microsoft Authenticator, Authy ou 1Password — qualquer um serve.
          </li>
          <li>
            <b>2.</b> No aplicativo, toque em “adicionar conta” e aponte a câmera para este código:
            <div className="mt-2 flex justify-center">
              <div className="bg-white p-3 rounded-xl border border-line w-[190px] h-[190px] [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: qr?.qrSvg ?? '' }} />
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-muted text-[12.5px]">A câmera não lê? Digite o código no aplicativo</summary>
              <div className="font-mono text-[12.5px] mt-1.5 p-2 rounded-lg bg-surface-2 border border-line break-all">{qr?.secret}</div>
            </details>
          </li>
          <li>
            <b>3.</b> Digite aqui os 6 dígitos que o aplicativo mostrar:
            <input className="input font-mono text-center text-lg tracking-[0.35em] mt-2" id="codigo-2fa" inputMode="numeric" placeholder="000000" maxLength={6}
              value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus />
          </li>
        </ol>
        {err && <div className="text-bad text-sm mt-3">{err}</div>}
      </Modal>

      {/* passo 2: guardar os códigos de recuperação */}
      <Modal open={passo === 'codigos'} onClose={() => setPasso('fechado')} titulo="Guarde estes códigos de recuperação"
        rodape={<button className="btn-primary" onClick={() => setPasso('fechado')}>Já guardei</button>}>
        <p className="text-sm text-ink-2">
          Pronto — a verificação está ligada. Se um dia você perder o celular, cada um destes códigos entra
          <b> uma vez</b> no lugar dos 6 dígitos. Guarde no gerenciador de senhas ou imprima e deixe num lugar seguro.
          <b> Eles não aparecem de novo.</b>
        </p>
        <div className="grid grid-cols-2 gap-1.5 mt-3 font-mono text-[13px]">
          {recuperacao.map((c) => <div key={c} className="px-2 py-1.5 rounded-lg bg-surface-2 border border-line text-center">{c}</div>)}
        </div>
        <button className="btn-secondary btn-sm mt-3" onClick={() => { void navigator.clipboard?.writeText(recuperacao.join('\n')).then(() => toast.push('ok', 'Códigos copiados')).catch(() => toast.push('erro', 'Não deu para copiar; selecione e copie à mão')); }}>
          Copiar todos
        </button>
      </Modal>

      {/* desligar */}
      <Modal open={passo === 'desligar'} onClose={() => setPasso('fechado')} titulo="Desligar a verificação em duas etapas"
        rodape={<><button className="btn-secondary" onClick={() => setPasso('fechado')}>Cancelar</button>
          <button className="btn-primary" disabled={busy || !senha} onClick={desligar}>{busy ? <Spinner className="text-white" /> : 'Desligar'}</button></>}>
        <p className="text-sm text-ink-2 mb-3">Sua conta volta a entrar só com a senha. Confirme digitando a sua senha:</p>
        <Campo label="Senha"><input className="input" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>
        {err && <div className="text-bad text-sm mt-2">{err}</div>}
      </Modal>
    </div>
  );
}

// ---------- senha ----------

function TrocarSenha() {
  const toast = useToast();
  const [atual, setAtual] = useState(''); const [nova, setNova] = useState(''); const [conf, setConf] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const podeSalvar = atual && nova.length >= 10 && nova === conf;
  const salvar = async () => {
    setBusy(true); setErr('');
    try {
      await api.auth.changePassword(atual, nova);
      setAtual(''); setNova(''); setConf('');
      toast.push('ok', 'Senha trocada');
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-surface-2 text-muted flex items-center justify-center shrink-0"><KeyRound size={18} /></span>
        <div>
          <div className="font-display font-semibold">Senha</div>
          <p className="text-[13.5px] text-ink-2 mt-1">Pelo menos 10 caracteres. Se usa gerenciador de senhas, deixe ele criar uma longa e aleatória.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 mt-4">
        <Campo label="Senha atual"><input className="input" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} /></Campo>
        <Campo label="Nova senha" erro={nova && nova.length < 10 ? 'precisa ter pelo menos 10 caracteres' : undefined}>
          <input className="input" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
        </Campo>
        <Campo label="Repita a nova senha" erro={conf && conf !== nova ? 'as duas não batem' : undefined}>
          <input className="input" type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} />
        </Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
        <button className="btn-primary self-start" disabled={busy || !podeSalvar} onClick={salvar}>{busy ? <Spinner className="text-white" /> : 'Trocar senha'}</button>
      </div>
    </div>
  );
}
