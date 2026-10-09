/**
 * As peças do portal do cliente usadas em mais de uma página (Patch 1.8): quem está logado, o
 * contato do suporte, o campo de senha, o cartão do tutorial e o título da aba do navegador.
 */
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, Eye, EyeOff, MessageCircle, PlayCircle, Star } from 'lucide-react';
import { linkWhatsApp } from '@gestor/shared';
import { api } from '../api/index.js';
import type { CartaoTutorial, SobrePortal } from '../api/types.js';

/**
 * Quem está no portal. Sem sessão (ou com o acesso suspenso), vem erro 401. Confere de novo a cada
 * página aberta (`staleTime: 0`): o cliente que saiu da base cai na próxima página, não na próxima hora.
 */
export const useEu = () => useQuery({ queryKey: ['portal', 'eu'], queryFn: () => api.portal.eu(), retry: false, staleTime: 0 });

/** O nome do portal e o contato do suporte — antes de entrar também. */
export const useSobre = () => useQuery({ queryKey: ['portal', 'sobre'], queryFn: () => api.portal.sobre(), staleTime: 5 * 60_000 });

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

/** O título da aba do navegador: o da página e o nome do portal. */
export function useTituloDaAba(...partes: Array<string | null | undefined>) {
  const texto = partes.filter(Boolean).join(' · ');
  useEffect(() => {
    if (!texto) return;
    const antes = document.title;
    document.title = texto;
    return () => { document.title = antes; };
  }, [texto]);
}

/** O link do WhatsApp do suporte, já com a mensagem. Sem número nos ajustes, não aparece. */
export function linkDoSuporte(sobre: Pick<SobrePortal, 'whatsapp'> | undefined, mensagem: string): string | null {
  return sobre?.whatsapp ? linkWhatsApp(mensagem, sobre.whatsapp) : null;
}

export function BotaoSuporte({ sobre, mensagem, children, className = 'btn-primary' }: { sobre?: SobrePortal; mensagem: string; children?: ReactNode; className?: string }) {
  const href = linkDoSuporte(sobre, mensagem);
  if (!href) return null;
  return <a className={className} href={href} target="_blank" rel="noreferrer"><MessageCircle size={16} /> {children ?? 'Falar com o suporte'}</a>;
}

/** O contato do suporte, por extenso (WhatsApp, e-mail e horário). */
export function ContatoDoSuporte({ sobre, className = '' }: { sobre?: SobrePortal; className?: string }) {
  if (!sobre || (!sobre.whatsapp && !sobre.email && !sobre.horario)) return null;
  const partes: ReactNode[] = [];
  if (sobre.whatsapp) partes.push(<span key="w">WhatsApp <b className="font-semibold text-ink-2 whitespace-nowrap">{sobre.whatsapp}</b></span>);
  if (sobre.email) partes.push(<a key="e" className="link break-all" href={`mailto:${sobre.email}`}>{sobre.email}</a>);
  if (sobre.horario) partes.push(<span key="h">{sobre.horario}</span>);
  return <p className={`text-[13px] text-muted ${className}`}>{partes.map((p, i) => <Fragment key={i}>{i > 0 && ' · '}{p}</Fragment>)}</p>;
}

// ---------- a senha ----------

export function CampoSenha({ id, rotulo, valor, onChange, autoComplete, autoFocus }: {
  id: string; rotulo: string; valor: string; onChange: (v: string) => void; autoComplete: string; autoFocus?: boolean;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={id}>{rotulo}</label>
      <div className="relative">
        <input id={id} className="input pr-11 py-2.5 text-[15px]" type={ver ? 'text' : 'password'} autoComplete={autoComplete} value={valor}
          onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} required />
        <button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-ghost btn-sm px-2 text-muted" onClick={() => setVer((v) => !v)}
          aria-label={ver ? 'Esconder a senha' : 'Mostrar a senha'} title={ver ? 'Esconder a senha' : 'Mostrar a senha'}>
          {ver ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

/** As regras da senha (as mesmas do servidor), marcadas conforme a pessoa digita. */
export function regrasDaSenha(senha: string, confirmar: string) {
  return [
    { ok: senha.length >= 8, texto: '8 caracteres ou mais' },
    { ok: /\p{L}/u.test(senha) && /\d/.test(senha), texto: 'letras e números' },
    { ok: !!senha && senha === confirmar, texto: 'as duas senhas iguais' },
  ];
}

export function RegrasDaSenha({ regras }: { regras: Array<{ ok: boolean; texto: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]" aria-label="O que a senha precisa ter">
      {regras.map((r) => (
        <li key={r.texto} className={`inline-flex items-center gap-1 ${r.ok ? 'text-ok' : 'text-muted'}`}>
          <span aria-hidden className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${r.ok ? 'bg-ok border-ok text-white' : 'border-line-strong'}`}>{r.ok ? '✓' : ''}</span>
          {r.texto}<span className="sr-only">{r.ok ? ' (ok)' : ' (falta)'}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------- os cartões ----------

/** A bolinha colorida do produto (a cor do catálogo). */
export function CorDoProduto({ cor, tamanho = 10 }: { cor?: string | null; tamanho?: number }) {
  return <span aria-hidden className="inline-block rounded-full shrink-0" style={{ width: tamanho, height: tamanho, background: cor ?? 'var(--accent)' }} />;
}

export function EtiquetaProduto({ t }: { t: Pick<CartaoTutorial, 'produto' | 'modulo'> }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted min-w-0">
      <CorDoProduto cor={t.produto?.cor} tamanho={8} />
      <span className="truncate">{t.produto?.nome ?? 'Geral'}{t.modulo ? ` › ${t.modulo.nome}` : ''}</span>
    </span>
  );
}

/** O cartão de um tutorial nas listas do portal (o cartão inteiro é o link). */
export function CartaoDeTutorial({ t, trecho, compacto = false }: { t: CartaoTutorial; trecho?: Array<{ texto: string; achado: boolean }> | null; compacto?: boolean }) {
  return (
    <li className="relative card p-4 flex gap-3 hover:border-accent hover:shadow-sm transition">
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <EtiquetaProduto t={t} />
        <Link to={t.caminho} className="font-display font-semibold text-[16px] leading-snug text-ink hover:text-accent after:absolute after:inset-0">
          {t.destaque && <Star size={14} className="inline -mt-0.5 mr-1 text-signal fill-current" aria-label="Em destaque" />}
          {t.titulo}
        </Link>
        {trecho?.length
          ? <p className="text-[14px] text-ink-2 line-clamp-2">{trecho.map((p, i) => (p.achado ? <mark key={i} className="bg-signal-soft text-ink rounded px-0.5">{p.texto}</mark> : <Fragment key={i}>{p.texto}</Fragment>))}</p>
          : !compacto && t.resumo ? <p className="text-[14px] text-ink-2 line-clamp-2">{t.resumo}</p> : null}
      </div>
      <ChevronRight size={18} className="text-muted self-center shrink-0" aria-hidden />
    </li>
  );
}

/** Um destaque: o cartão maior da página inicial. */
export function CartaoDestaque({ t }: { t: CartaoTutorial }) {
  return (
    <li className="relative card p-4 flex flex-col gap-2 hover:border-accent hover:shadow-sm transition overflow-hidden">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: t.produto?.cor ?? 'var(--accent)' }} />
      <EtiquetaProduto t={t} />
      <Link to={t.caminho} className="font-display font-semibold text-[16.5px] leading-snug text-ink hover:text-accent after:absolute after:inset-0">{t.titulo}</Link>
      {t.resumo && <p className="text-[14px] text-ink-2 line-clamp-3">{t.resumo}</p>}
      <span className="mt-auto pt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-accent">Ver o passo a passo <PlayCircle size={14} /></span>
    </li>
  );
}
