/**
 * Quem está logado e o que pode fazer.
 * `useAuth()` dá o usuário atual; `<Can permission="...">` só mostra o conteúdo se a pessoa tiver a permissão.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/index.js';
import type { Me } from '../api/types.js';

type Ctx = {
  user: Me | null; loading: boolean;
  /** Devolve true quando ainda falta o código de 6 dígitos. */
  login: (email: string, password: string) => Promise<boolean>;
  entrarComCodigo: (code: string) => Promise<void>;
  logout: () => Promise<void>; can: (p: string) => boolean; refresh: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => { try { setUser(await api.auth.me()); } catch { setUser(null); } finally { setLoading(false); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const value = useMemo<Ctx>(() => ({
    user, loading, refresh,
    login: async (email, password) => {
      const r = await api.auth.login(email, password);
      if (r.needsCode) return true;
      setUser(r.user);
      return false;
    },
    entrarComCodigo: async (code) => { setUser(await api.auth.loginCode(code)); },
    logout: async () => { await api.auth.logout(); setUser(null); },
    can: (p) => !!user?.permissions.includes(p),
  }), [user, loading, refresh]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function Can({ permission, children, fallback = null }: { permission: string | string[]; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useAuth();
  const ok = (Array.isArray(permission) ? permission : [permission]).some(can);
  return <>{ok ? children : fallback}</>;
}
