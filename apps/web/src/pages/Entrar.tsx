/** Tela de entrada. */
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { IS_DEMO } from '../api/index.js';
import { mensagemErro, Spinner } from '../components/ui/index.js';
import { Logotipo } from '../components/Marca.js';

export function Entrar() {
  const { user, login, entrarComCodigo, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState(IS_DEMO ? 'admin@gestor.local' : '');
  const [password, setPassword] = useState(IS_DEMO ? 'demo' : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [etapa, setEtapa] = useState<'senha' | 'codigo'>('senha');
  if (!loading && user) return <Navigate to={(loc.state as any)?.from ?? '/'} replace />;

  const irParaOSistema = () => nav((loc.state as any)?.from ?? '/', { replace: true });

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const faltaCodigo = await login(email, password);
      if (faltaCodigo) setEtapa('codigo'); else irParaOSistema();
    } catch (x) { setErr(mensagemErro(x)); } finally { setBusy(false); }
  };

  const enviarCodigo = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await entrarComCodigo(codigo.trim()); irParaOSistema(); }
    catch (x) { setErr(mensagemErro(x)); setCodigo(''); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-bg">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-7">
          <Logotipo altura={62} />
        </div>
        {etapa === 'senha' ? (
          <form onSubmit={submit} className="card p-6 flex flex-col gap-4">
            <div><label className="label" htmlFor="email">E-mail</label><input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div>
            <div><label className="label" htmlFor="password">Senha</label><input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            {err && <div className="text-bad text-sm">{err}</div>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Entrar'}</button>
          </form>
        ) : (
          <form onSubmit={enviarCodigo} className="card p-6 flex flex-col gap-4">
            <div>
              <div className="font-display font-semibold">Código de verificação</div>
              <p className="text-muted text-[13px] mt-1">Abra o aplicativo de autenticação no celular e digite os 6 dígitos da conta <b className="text-ink-2">Ingline Gestão</b>.</p>
            </div>
            <div>
              <label className="label" htmlFor="codigo">Código</label>
              <input id="codigo" className="input font-mono text-center text-lg tracking-[0.35em]" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={11}
                value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoFocus />
              <p className="text-muted text-[12px] mt-1.5">Sem o celular à mão? Use um dos códigos de recuperação que você guardou.</p>
            </div>
            {err && <div className="text-bad text-sm">{err}</div>}
            <button className="btn-primary w-full" disabled={busy || codigo.trim().length < 6}>{busy ? <Spinner className="text-white" /> : 'Confirmar'}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setEtapa('senha'); setErr(''); setCodigo(''); setPassword(''); }}>Voltar</button>
          </form>
        )}
        {IS_DEMO && (
          <div className="card mt-4 p-4 text-[12.5px] text-ink-2 border-signal">
            <div className="font-semibold text-signal mb-1">Prévia de demonstração</div>
            Dados fictícios, tudo em memória (recarregar volta ao início). Senha de todos: <span className="font-mono">demo</span>.<br />
            Experimente entrar como <span className="font-mono">tecnico@</span>, <span className="font-mono">operador@</span> ou <span className="font-mono">leitor@gestor.local</span> para ver o que cada papel enxerga.
          </div>
        )}
      </div>
    </div>
  );
}
