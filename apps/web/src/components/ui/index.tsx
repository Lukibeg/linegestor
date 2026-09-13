/**
 * Peças de interface reutilizáveis. Cada uma é pequena e faz uma coisa só.
 * Todas usam as cores do tema (styles.css), então funcionam no claro e no escuro.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, Eye, EyeOff, Info, Loader2, X } from 'lucide-react';
import { ApiError } from '../../api/types.js';

// ---------- Avisos (toast) ----------
type Toast = { id: number; kind: 'ok' | 'erro' | 'info'; text: string };
const ToastCtx = createContext<{ push: (kind: Toast['kind'], text: string) => void }>({ push: () => {} });
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, kind, text }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), kind === 'erro' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={useMemo(() => ({ push }), [push])}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`card px-4 py-3 text-sm shadow-lg flex items-start gap-2 ${t.kind === 'erro' ? 'border-bad' : t.kind === 'ok' ? 'border-ok' : ''}`}>
            {t.kind === 'erro' ? <AlertTriangle size={16} className="text-bad mt-0.5 shrink-0" /> : t.kind === 'ok' ? <Check size={16} className="text-ok mt-0.5 shrink-0" /> : <Info size={16} className="text-accent mt-0.5 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Mensagem legível para qualquer erro. */
export function mensagemErro(e: unknown): string {
  if (e instanceof ApiError) return e.details?.length ? `${e.message}: ${e.details.map((d) => `${d.field} — ${d.message}`).join('; ')}` : e.message;
  if (e instanceof Error) return e.message;
  return 'Algo deu errado';
}

// ---------- Básicos ----------
export function Spinner({ className = '' }: { className?: string }) { return <Loader2 size={18} className={`animate-spin text-muted ${className}`} />; }

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center"><Spinner /> {texto}</div>;
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <div className="font-display font-semibold text-ink">{titulo}</div>
      {texto && <p className="text-muted text-sm mt-1 max-w-md mx-auto">{texto}</p>}
      {acao && <div className="mt-4 flex justify-center">{acao}</div>}
    </div>
  );
}

export function Chip({ children, color, tone = 'neutral', className = '', title }: { children: ReactNode; color?: string; tone?: 'neutral' | 'accent' | 'signal' | 'ok' | 'bad' | 'muted'; className?: string; title?: string }) {
  if (color) return <span title={title} className={`chip ${className}`} style={{ background: color + '22', color }}>{children}</span>;
  const map = { neutral: 'bg-surface-2 text-ink-2', accent: 'bg-accent-soft text-accent-ink', signal: 'bg-signal-soft text-signal', ok: 'bg-ok-soft text-ok', bad: 'bg-bad-soft text-bad', muted: 'bg-surface-2 text-muted' };
  return <span title={title} className={`chip ${map[tone]} ${className}`}>{children}</span>;
}

export function Campo({ label, children, erro, dica, className = '' }: { label: string; children: ReactNode; erro?: string; dica?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {erro ? <div className="text-bad text-[12.5px] mt-1">{erro}</div> : dica ? <div className="text-muted text-[12.5px] mt-1">{dica}</div> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`w-10 h-6 rounded-full transition-colors relative ${checked ? 'bg-accent' : 'bg-line-strong'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}

// ---------- Modal / painel lateral ----------
export function Modal({ open, onClose, titulo, children, rodape, largura = 'max-w-lg', lateral = false }: { open: boolean; onClose: () => void; titulo: ReactNode; children: ReactNode; rodape?: ReactNode; largura?: string; lateral?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={lateral ? `relative ml-auto h-full w-full ${largura} bg-surface border-l border-line shadow-2xl flex flex-col` : `relative m-auto w-[calc(100%-32px)] ${largura} bg-surface border border-line rounded-xl shadow-2xl flex flex-col max-h-[calc(100vh-32px)]`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h3 className="font-display font-semibold text-[15px]">{titulo}</h3>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {rodape && <div className="px-5 py-3 border-t border-line flex justify-end gap-2 bg-surface-2 rounded-b-xl">{rodape}</div>}
      </div>
    </div>
  );
}

/** Confirmação com o número exato do que vai acontecer. Para ações de alto impacto, exige digitar uma palavra. */
export function Confirmar({ open, onClose, onConfirm, titulo, texto, botao = 'Confirmar', perigoso = false, digitar, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; titulo: string; texto: ReactNode; botao?: string; perigoso?: boolean; digitar?: string; loading?: boolean }) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (open) setTyped(''); }, [open]);
  const ok = !digitar || typed.trim().toLowerCase() === digitar.toLowerCase();
  return (
    <Modal open={open} onClose={onClose} titulo={titulo} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className={perigoso ? 'btn-danger' : 'btn-primary'} disabled={!ok || loading} onClick={onConfirm}>{loading ? <Spinner className="text-white" /> : botao}</button></>}>
      <div className="text-sm text-ink-2">{texto}</div>
      {digitar && (
        <div className="mt-4">
          <label className="label">Para confirmar, digite <span className="font-mono text-ink">{digitar}</span></label>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </div>
      )}
    </Modal>
  );
}

// ---------- Campo de senha guardada (revelar / copiar) ----------
export function CampoSegredo({ secretId, hasSecret, onReveal, podeRevelar, onChangeNovo, placeholder = 'nova senha (deixe vazio para manter)' }: { secretId: string | null; hasSecret: boolean; onReveal: (id: string, password: string) => Promise<{ value: string; visibleForSeconds: number }>; podeRevelar: boolean; onChangeNovo?: (v: string) => void; placeholder?: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef<number | null>(null);
  const toast = useToast();
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const reveal = async () => {
    setBusy(true); setErr('');
    try {
      const r = await onReveal(secretId!, pw);
      setShown(r.value); setAsking(false); setPw('');
      timer.current = window.setTimeout(() => setShown(null), r.visibleForSeconds * 1000);
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="flex items-center gap-2">
        {hasSecret ? (
          <div className="input flex items-center justify-between gap-2 font-mono text-[13px]">
            <span className={shown ? '' : 'text-muted tracking-widest'}>{shown ?? '••••••••••'}</span>
            <span className="flex items-center gap-1">
              {shown && <button type="button" className="btn-ghost btn-sm" title="Copiar" onClick={() => { navigator.clipboard.writeText(shown); toast.push('ok', 'Copiado'); }}><Copy size={14} /></button>}
              {podeRevelar && (shown ? <button type="button" className="btn-ghost btn-sm" onClick={() => setShown(null)} title="Ocultar"><EyeOff size={14} /></button> : <button type="button" className="btn-ghost btn-sm" onClick={() => setAsking(true)} title="Revelar (fica registrado)"><Eye size={14} /></button>)}
            </span>
          </div>
        ) : <div className="input text-muted italic">sem senha guardada</div>}
      </div>
      {onChangeNovo && <input type="password" autoComplete="new-password" className="input mt-2" placeholder={placeholder} onChange={(e) => onChangeNovo(e.target.value)} />}
      <Modal open={asking} onClose={() => setAsking(false)} titulo="Revelar senha" rodape={<><button className="btn-secondary" onClick={() => setAsking(false)}>Cancelar</button><button className="btn-primary" disabled={!pw || busy} onClick={reveal}>{busy ? <Spinner className="text-white" /> : 'Revelar por 30 s'}</button></>}>
        <p className="text-sm text-ink-2 mb-3">Confirme a <b>sua</b> senha. A revelação fica registrada na auditoria com seu nome, data e hora.</p>
        <input type="password" className="input" placeholder="sua senha" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pw && reveal()} autoFocus />
        {err && <div className="text-bad text-sm mt-2">{err}</div>}
      </Modal>
    </div>
  );
}

// ---------- Paginação ----------
export function Paginacao({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-muted mt-3">
      <span className="tnum">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total.toLocaleString('pt-BR')}</span>
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</button>
        <span className="px-2 py-1.5 tnum">{page} / {pages}</span>
        <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Próxima</button>
      </div>
    </div>
  );
}

export function Abas<T extends string>({ abas, atual, onChange }: { abas: Array<{ id: T; label: ReactNode }>; atual: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 border-b border-line mb-4 overflow-x-auto" role="tablist">
      {abas.map((a) => (
        <button key={a.id} role="tab" aria-selected={atual === a.id} onClick={() => onChange(a.id)} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${atual === a.id ? 'border-accent text-accent' : 'border-transparent text-ink-2 hover:text-ink'}`}>{a.label}</button>
      ))}
    </div>
  );
}

export function Kpi({ label, valor, sub, tone = 'neutral' }: { label: string; valor: ReactNode; sub?: ReactNode; tone?: 'neutral' | 'accent' | 'signal' | 'ok' | 'bad' }) {
  const bar = { neutral: 'bg-line-strong', accent: 'bg-accent', signal: 'bg-signal', ok: 'bg-ok', bad: 'bg-bad' }[tone];
  return (
    <div className="card p-4 relative overflow-hidden">
      <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${bar}`} />
      <div className="eyebrow">{label}</div>
      <div className="font-display text-2xl font-semibold tnum mt-1">{valor}</div>
      {sub && <div className="text-muted text-[12.5px] mt-0.5">{sub}</div>}
    </div>
  );
}

/** Barra de uso da numeração: quantos DIDs do circuito estão com cliente (em uso) e quantos estão livres. */
export function Ocupacao({ total, assigned }: { total: number; assigned: number }) {
  const pct = total > 0 ? Math.round((assigned / total) * 100) : 0;
  const tone = total === 0 ? 'bg-line-strong' : pct >= 90 ? 'bg-signal' : 'bg-ok';
  return (
    <div className="flex items-center gap-2 min-w-[140px]" title={total === 0 ? 'sem DIDs' : `${assigned} de ${total} em uso · ${total - assigned} livres`}>
      <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
      <span className="font-mono text-[11.5px] text-muted tnum w-12 text-right">{total === 0 ? '—' : `${pct}%`}</span>
    </div>
  );
}

/** Botão que copia texto e confirma. */
export function Copiar({ texto, titulo = 'Copiar' }: { texto: string; titulo?: string }) {
  const toast = useToast();
  return <button type="button" className="btn-ghost btn-sm text-muted" title={titulo} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(texto); toast.push('ok', 'Copiado'); }}><Copy size={13} /></button>;
}
