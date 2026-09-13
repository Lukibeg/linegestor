/** Tela de entrada. */
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { IS_DEMO } from '../api/index.js';
import { mensagemErro, Spinner } from '../components/ui/index.js';

export function Entrar() {
  const { user, login, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState(IS_DEMO ? 'admin@gestor.local' : '');
  const [password, setPassword] = useState(IS_DEMO ? 'demo' : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!loading && user) return <Navigate to={(loc.state as any)?.from ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(email, password); nav((loc.state as any)?.from ?? '/', { replace: true }); } catch (x) { setErr(mensagemErro(x)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-bg">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <span className="w-9 h-9 rounded-lg bg-accent text-white font-display font-bold flex items-center justify-center">G</span>
          <div><div className="font-display font-semibold text-lg leading-tight">Gestor</div><div className="text-muted text-[12px] leading-tight">Ingline Systems</div></div>
        </div>
        <form onSubmit={submit} className="card p-6 flex flex-col gap-4">
          <div><label className="label" htmlFor="email">E-mail</label><input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div>
          <div><label className="label" htmlFor="password">Senha</label><input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          {err && <div className="text-bad text-sm">{err}</div>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Entrar'}</button>
        </form>
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
