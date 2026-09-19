/**
 * Peças de interface reutilizáveis. Cada uma é pequena e faz uma coisa só.
 * Todas usam as cores do tema (styles.css), então funcionam no claro e no escuro.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, Eye, EyeOff, Info, Loader2, X } from 'lucide-react';
import { formatarIp, SEM_LIMITE } from '@gestor/shared';
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

/**
 * Mensagem legível para qualquer erro.
 * `details` nem sempre é uma lista de campos: em erro de chave única o servidor manda um texto.
 * Por isso tratamos os dois formatos — antes, um texto fazia esta função quebrar e a tela
 * ficava sem mostrar erro nenhum (parecia que o botão não tinha feito nada).
 */
export function mensagemErro(e: unknown): string {
  try {
    if (e instanceof ApiError) {
      const d: unknown = e.details;
      if (Array.isArray(d) && d.length) return `${e.message}: ${d.map((x: any) => `${x?.field ?? '(geral)'} — ${x?.message ?? x}`).join('; ')}`;
      if (typeof d === 'string' && d.trim()) return `${e.message} (${d.trim()})`;
      return e.message;
    }
    if (e instanceof Error) return e.message;
  } catch { /* nunca deixar a formatação do erro esconder o erro */ }
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
        ) : !onChangeNovo && <span className="text-muted text-sm">não cadastrada</span>}
      </div>
      {/* no formulário: sem senha guardada, é só o campo para digitar — nada de caixa "vazia" em cima */}
      {onChangeNovo && <input type="password" autoComplete="new-password" className={`input ${hasSecret ? 'mt-2' : ''}`} placeholder={hasSecret ? placeholder : 'digite a senha'} onChange={(e) => onChangeNovo(e.target.value)} />}
      <Modal open={asking} onClose={() => setAsking(false)} titulo="Revelar senha" rodape={<><button className="btn-secondary" onClick={() => setAsking(false)}>Cancelar</button><button className="btn-primary" disabled={!pw || busy} onClick={reveal}>{busy ? <Spinner className="text-white" /> : 'Revelar por 30 s'}</button></>}>
        <p className="text-sm text-ink-2 mb-3">Confirme a <b>sua</b> senha. A revelação fica registrada na auditoria com seu nome, data e hora.</p>
        <input type="password" className="input" placeholder="sua senha" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pw && reveal()} autoFocus />
        {err && <div className="text-bad text-sm mt-2">{err}</div>}
      </Modal>
    </div>
  );
}

// ---------- Campo de IP com máscara ----------

/**
 * Campo de IP que põe os pontos sozinho: digitar "19216801" vira "192.168.0.1".
 * Um ponto digitado à mão também fecha o octeto (para "10.20.0.77", que a máscara sozinha não adivinha).
 */
export function InputIp({ value, onChange, className = '', ...rest }: { value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <input {...rest} className={`input font-mono tnum ${className}`} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(formatarIp(e.target.value))} />;
}

// ---------- Paginação ----------

/** Tamanho de página que traz a lista inteira ("Ver tudo"). */
export const TODOS = SEM_LIMITE;

/**
 * Rodapé de lista com páginas. A paginação existe só para a tela abrir rápido: nenhuma lista
 * esconde linhas. Por isso, sempre que houver mais de uma página, aparece o **Ver tudo**, que
 * mostra a lista inteira de uma vez; e com tudo na tela, **Voltar a paginar**.
 */
export function Paginacao({ page, pageSize, total, onChange, tudo = false, onTudo }: { page: number; pageSize: number; total: number; onChange: (p: number) => void; tudo?: boolean; onTudo?: (v: boolean) => void }) {
  if (tudo) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted mt-3">
        <span className="tnum">Mostrando todos os {total.toLocaleString('pt-BR')}</span>
        {onTudo && <button className="btn-secondary btn-sm" onClick={() => onTudo(false)}>Voltar a paginar</button>}
      </div>
    );
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted mt-3">
      <span className="tnum">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total.toLocaleString('pt-BR')}</span>
      <div className="flex flex-wrap gap-1 items-center">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</button>
        <span className="px-2 py-1.5 tnum">{page} / {pages}</span>
        <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Próxima</button>
        {onTudo && <button className="btn-primary btn-sm ml-1" onClick={() => onTudo(true)}>Ver tudo ({total.toLocaleString('pt-BR')})</button>}
      </div>
    </div>
  );
}

/**
 * Paginação feita na própria tela, para listas que já vêm inteiras do servidor (DIDs de um
 * circuito, aparelhos de um cliente). Mesmo comportamento: páginas + "Ver tudo".
 */
export function usePaginaLocal<T>(itens: T[], tamanho = 100) {
  const [page, setPage] = useState(1);
  const [tudo, setTudo] = useState(false);
  const pages = Math.max(1, Math.ceil(itens.length / tamanho));
  // filtro que encolhe a lista não pode deixar a pessoa numa página que não existe mais
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const visiveis = tudo ? itens : itens.slice((page - 1) * tamanho, page * tamanho);
  const inicio = tudo ? 0 : (page - 1) * tamanho;
  return {
    visiveis,
    /** número da linha na lista inteira (coluna #) */
    numero: (i: number) => inicio + i + 1,
    rodape: <Paginacao page={page} pageSize={tamanho} total={itens.length} onChange={setPage} tudo={tudo} onTudo={(v) => { setTudo(v); setPage(1); }} />,
  };
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

/**
 * Um painel que abre abaixo de um botão e fecha ao clicar fora ou apertar Esc.
 * Usado pelo seletor de colunas e pelo filtro de módulos.
 */
export function Popover({ botao, children, largura = 'w-[320px]' }: { botao: (aberto: boolean) => ReactNode; children: ReactNode; largura?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const clique = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // O painel fica preso à tela, nunca metade dele para fora: se não couber à direita,
    // encosta na borda; se não couber embaixo, abre para cima; e sempre rola por dentro.
    const posicionar = () => {
      const b = ref.current?.getBoundingClientRect();
      const p = painel.current?.getBoundingClientRect();
      if (!b) return;
      const margem = 8;
      const larg = p?.width ?? 320;
      const alt = painel.current?.scrollHeight ?? p?.height ?? 320; // altura natural, antes de cortar
      const espacoAbaixo = window.innerHeight - b.bottom - margem;
      const espacoAcima = b.top - margem;
      const paraCima = espacoAbaixo < Math.min(alt, 220) && espacoAcima > espacoAbaixo;
      const left = Math.max(margem, Math.min(b.right - larg, window.innerWidth - larg - margem));
      // abrindo para cima, prendemos pela base (assim nunca sobra pedaço fora da tela embaixo)
      const altura = Math.max(140, (paraCima ? espacoAcima : espacoAbaixo) - 4);
      setPos(paraCima
        ? { left, bottom: Math.max(margem, window.innerHeight - b.top + 4), maxHeight: altura }
        : { left, top: Math.max(margem, Math.min(b.bottom + 4, window.innerHeight - margem - altura)), maxHeight: altura });
    };
    posicionar();
    const alvo = { passive: true } as AddEventListenerOptions;
    document.addEventListener('mousedown', clique);
    document.addEventListener('keydown', tecla);
    window.addEventListener('resize', posicionar, alvo);
    window.addEventListener('scroll', posicionar, true);
    return () => {
      document.removeEventListener('mousedown', clique);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', posicionar, true);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-secondary btn-sm" onClick={() => { setPos(null); setOpen((o) => !o); }} aria-expanded={open}>{botao(open)}</button>
      {open && (
        <div
          ref={painel}
          className="fixed z-40 card p-3 overflow-y-auto shadow-lg"
          style={{ left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom, maxHeight: pos?.maxHeight ?? 320, maxWidth: 'calc(100vw - 16px)', visibility: pos ? 'visible' : 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}
        >
          <div className={`${largura} max-w-full`}>{children}</div>
        </div>
      )}
    </div>
  );
}

/**
 * A marca do cliente: a logo enviada, ou as iniciais do nome quando não há logo.
 * `tamanho` é a medida do quadrado em pixels.
 */
export function LogoCliente({ src, nome, tamanho = 40, className = '' }: { src: string | null; nome: string; tamanho?: number; className?: string }) {
  const [erro, setErro] = useState(false);
  const estilo = { width: tamanho, height: tamanho, fontSize: Math.round(tamanho / 2.6) };
  if (src && !erro) {
    return <img src={src} alt={`Logo de ${nome}`} loading="lazy" onError={() => setErro(true)} style={estilo} className={`rounded-lg object-contain bg-white border border-line shrink-0 ${className}`} />;
  }
  const iniciais = nome.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
  return <span aria-hidden style={estilo} className={`rounded-lg bg-surface-2 flex items-center justify-center font-display font-semibold text-ink-2 shrink-0 ${className}`}>{iniciais}</span>;
}

/**
 * Campo para escolher a logo: mostra a imagem atual, aceita arquivo ou "arraste aqui",
 * e REDUZ a imagem no próprio navegador (máx. 512 px) antes de mandar para o servidor.
 * Assim nenhuma foto de 5 MB sai do computador da pessoa.
 */
export function CampoLogo({ atual, nome, onEscolher, onRemover, previa }: { atual: string | null; nome: string; onEscolher: (dataUrl: string) => void; onRemover?: () => void; previa?: ReactNode }) {
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const processar = async (file?: File | null) => {
    setErro('');
    if (!file) return;
    if (!file.type.startsWith('image/')) return setErro('Escolha um arquivo de imagem (PNG, JPG, WEBP ou SVG).');
    if (file.type === 'image/svg+xml') {
      if (file.size > 400_000) return setErro('SVG muito grande (máximo 400 KB).');
      const txt = await file.text();
      return onEscolher(`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(txt)))}`);
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((ok, falhou) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falhou(new Error('imagem inválida')); i.src = url; });
      const max = 512;
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));
      const ctx = canvas.getContext('2d');
      if (!ctx) return setErro('Não foi possível preparar a imagem neste navegador.');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // PNG preserva fundo transparente; se ficar grande demais, cai para JPEG
      let out = canvas.toDataURL('image/png');
      if (out.length > 500_000) out = canvas.toDataURL('image/jpeg', 0.85);
      if (out.length > 700_000) return setErro('Imagem muito grande mesmo depois de reduzir. Tente outra.');
      onEscolher(out);
    } catch {
      setErro('Não foi possível ler esta imagem.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-3 rounded-xl border border-dashed p-3 transition-colors ${arrastando ? 'border-accent bg-accent-soft' : 'border-line'}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); void processar(e.dataTransfer.files?.[0]); }}
      >
        {previa ?? <LogoCliente src={atual} nome={nome || '?'} tamanho={56} />}
        <div className="flex-1 min-w-0">
          <div className="flex gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => input.current?.click()}>{atual ? 'Trocar imagem' : 'Escolher imagem'}</button>
            {atual && onRemover && <button type="button" className="btn-ghost btn-sm text-muted" onClick={onRemover}>Remover</button>}
          </div>
          <p className="text-[12px] text-muted mt-1">PNG, JPG, WEBP ou SVG. A imagem é reduzida automaticamente; pode arrastar o arquivo até aqui.</p>
        </div>
        <input ref={input} type="file" accept="image/*" className="hidden" data-campo-imagem onChange={(e) => { void processar(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {erro && <div className="text-bad text-sm mt-1">{erro}</div>}
    </div>
  );
}

/**
 * A foto de um modelo de aparelho, num quadro de fundo claro (como no Nexus). Sem foto, mostra
 * a inicial do modelo. `altura` é a altura do quadro em pixels; a largura acompanha o espaço.
 */
export function FotoModelo({ src, nome, altura = 110, className = '' }: { src: string | null; nome: string; altura?: number; className?: string }) {
  const [erro, setErro] = useState(false);
  if (src && !erro) {
    return (
      <div style={{ height: altura }} className={`bg-white rounded-lg flex items-center justify-center overflow-hidden ${className}`}>
        <img src={src} alt={`Foto do ${nome}`} loading="lazy" onError={() => setErro(true)} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  return (
    <div style={{ height: altura, fontSize: Math.round(altura / 2.8) }} aria-hidden className={`bg-surface-2 rounded-lg flex items-center justify-center font-display font-semibold text-muted ${className}`}>
      {(nome.trim()[0] ?? '?').toUpperCase()}
    </div>
  );
}

/** MAC, ou N/S (com a etiqueta), ou "não aplicável" — igual em toda tabela de aparelhos. */
export function Identificacao({ d }: { d: { identificacao: string; identificacaoTipo: 'mac' | 'serie' | 'nenhum' } }) {
  if (d.identificacaoTipo === 'mac') return <span className="font-mono whitespace-nowrap">{d.identificacao}</span>;
  if (d.identificacaoTipo === 'serie') return <span className="font-mono whitespace-nowrap"><span className="text-muted font-sans text-[11px] mr-1">N/S</span>{d.identificacao}</span>;
  return <span className="text-muted text-[13px]">não aplicável</span>;
}

