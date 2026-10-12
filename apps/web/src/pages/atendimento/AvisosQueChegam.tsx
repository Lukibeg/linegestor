/**
 * Os avisos que chegam (1.10, o pedido do Luan na prévia: "além do sininho, você tem como mandar
 * notificação no navegador? E também aparecer uma notificação menos sucinta do que o sininho").
 *
 * O sininho continua sendo a lista de tudo. Além dele, o que chega com o Gestor aberto aparece:
 *  - na tela: um cartão que sai do canto do sininho (no computador, embaixo, ao lado do menu; no celular,
 *    embaixo da barra de cima), com o que aconteceu, o chamado e o botão "Abrir o chamado". Some sozinho
 *    em 20 segundos — a barrinha embaixo mostra o tempo, que para com o mouse em cima e não corre com o
 *    Gestor escondido (quem volta para a aba ainda vê o cartão). O Crítico e o prazo vencido ficam até a
 *    pessoa fechar. No máximo 3 de uma vez; o resto fica no sininho.
 *  - no navegador: a notificação do sistema (a do Windows, do Mac), para quem ligou e o navegador
 *    permitiu, e só quando o Gestor não está na frente (outra aba, minimizado, outro programa) — com ele
 *    na frente, o cartão basta. Clicar nela traz o Gestor com o chamado aberto.
 *
 * Um vigia só, na moldura das telas (o sininho aparece duas vezes: no menu do computador e na barra do
 * celular). Ele relê os avisos a cada 30 segundos, também com o Gestor em segundo plano (o navegador pode
 * espaçar para 1 minuto). O que já estava lá quando a tela abriu não pula. Cada pessoa liga e desliga
 * no sininho, e vale para este navegador.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bell, GitBranch, Hourglass, Inbox, MessageSquare, Eye, Siren, TriangleAlert, UserX, X, type LucideIcon } from 'lucide-react';
import type { AvisoNaTela, TipoAviso } from '@gestor/shared';
import { api } from '../../api/index.js';
import { useAuth } from '../../lib/auth.js';
import { useAbrirChamado } from './comum.js';

// =====================================================================
//  O QUE CADA AVISO É (o sininho usa o mesmo)
// =====================================================================

export const ICONE_DO_AVISO: Record<TipoAviso, { Icone: LucideIcon; cor: string; fundo: string; titulo: string }> = {
  recebeu: { Icone: Inbox, cor: 'text-accent', fundo: 'bg-accent-soft', titulo: 'Chamado para você' },
  etapa: { Icone: ArrowRight, cor: 'text-accent', fundo: 'bg-accent-soft', titulo: 'O chamado mudou de etapa' },
  prazo_perto: { Icone: Hourglass, cor: 'text-signal', fundo: 'bg-signal-soft', titulo: 'O prazo está perto' },
  prazo_vencido: { Icone: TriangleAlert, cor: 'text-bad', fundo: 'bg-bad-soft', titulo: 'Prazo vencido' },
  sem_dono: { Icone: UserX, cor: 'text-signal', fundo: 'bg-signal-soft', titulo: 'Chamado sem responsável' },
  critico: { Icone: Siren, cor: 'text-bad', fundo: 'bg-bad-soft', titulo: 'Chegou um Crítico' },
  cliente_respondeu: { Icone: MessageSquare, cor: 'text-ok', fundo: 'bg-ok-soft', titulo: 'O cliente respondeu' },
  pai: { Icone: GitBranch, cor: 'text-muted', fundo: 'bg-surface-2', titulo: 'Um filho foi fechado' },
  // o chamado que a pessoa observa (como no Helena: toda atualização)
  observador: { Icone: Eye, cor: 'text-roxo', fundo: 'bg-roxo-soft', titulo: 'Novidade num chamado que você observa' },
};
const doTipo = (t: TipoAviso) => ICONE_DO_AVISO[t] ?? ICONE_DO_AVISO.recebeu;
/** O Crítico e o prazo vencido não somem sozinhos. */
const FICA_ATE_FECHAR = new Set<TipoAviso>(['critico', 'prazo_vencido']);

/** A consulta dos avisos, a mesma no sininho e no vigia (a lista é uma só). */
export const consultaDosAvisos = { queryKey: ['atendimento', 'avisos'] as const, queryFn: () => api.atendimento.avisos(), staleTime: 20_000 };

// =====================================================================
//  COMO AVISAR (de cada pessoa, neste navegador)
// =====================================================================

export type ComoAvisar = { tela: boolean; navegador: boolean };
const CHAVE = 'gestor.avisos';
function lerComoAvisar(): ComoAvisar {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Partial<ComoAvisar> | null;
    return { tela: v?.tela !== false, navegador: v?.navegador === true };
  } catch { return { tela: true, navegador: false }; }
}
let comoAvisar = lerComoAvisar();
const ouvintesDoComo = new Set<() => void>();
function assinarComo(f: () => void) {
  ouvintesDoComo.add(f);
  // a outra aba mudou: esta acompanha
  const daOutraAba = (e: StorageEvent) => { if (e.key === CHAVE) { comoAvisar = lerComoAvisar(); f(); } };
  window.addEventListener('storage', daOutraAba);
  return () => { ouvintesDoComo.delete(f); window.removeEventListener('storage', daOutraAba); };
}
export function mudarComoAvisar(m: Partial<ComoAvisar>) {
  comoAvisar = { ...comoAvisar, ...m };
  try { localStorage.setItem(CHAVE, JSON.stringify(comoAvisar)); } catch { /* sem storage: vale até fechar */ }
  ouvintesDoComo.forEach((f) => f());
}
export const useComoAvisar = () => useSyncExternalStore(assinarComo, () => comoAvisar);

// =====================================================================
//  A NOTIFICAÇÃO DO NAVEGADOR
// =====================================================================

export type PermissaoDoNavegador = NotificationPermission | 'sem';
export const permissaoDoNavegador = (): PermissaoDoNavegador => (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'sem');
/** A tela roda dentro de outra página (como a prévia): o navegador não deixa pedir a permissão dali. */
export function dentroDeOutraPagina(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}
const iconeDoGestor = () => document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href;

/** Mostra a notificação; devolve falso quando o navegador não deixou (sem permissão, ou só com app instalado). */
function notificar(titulo: string, corpo: string, marca: string, ficar: boolean, clicou: () => void): boolean {
  if (permissaoDoNavegador() !== 'granted') return false;
  try {
    const n = new Notification(titulo, { body: corpo, tag: marca, icon: iconeDoGestor(), requireInteraction: ficar });
    n.onclick = () => { window.focus(); n.close(); clicou(); };
    return true;
  } catch { return false; } // o Chrome do celular só mostra pelo app instalado
}
const corpoDoAviso = (a: AvisoNaTela) => (a.chamado ? `${a.texto}\n${a.chamado.codigo} · ${a.chamado.titulo}` : a.texto);

// =====================================================================
//  OS CARTÕES NA TELA
// =====================================================================

type Cartao = AvisoNaTela & { teste?: boolean };
type Cartoes = { lista: Cartao[]; sobra: number };
const MAXIMO = 3;
let cartoes: Cartoes = { lista: [], sobra: 0 };
const ouvintesDosCartoes = new Set<() => void>();
function mudarCartoes(c: Cartoes) { cartoes = c; ouvintesDosCartoes.forEach((f) => f()); }
const assinarCartoes = (f: () => void) => { ouvintesDosCartoes.add(f); return () => { ouvintesDosCartoes.delete(f); }; };

/** Os novos entram por cima (o mesmo aviso atualizado troca de lugar, sem repetir); passou de 3, o mais velho sai. */
function porCartoes(novos: Cartao[]) {
  const ids = new Set(novos.map((c) => c.id));
  const todos = [...novos, ...cartoes.lista.filter((c) => !ids.has(c.id))];
  mudarCartoes({ lista: todos.slice(0, MAXIMO), sobra: cartoes.sobra + Math.max(0, todos.length - MAXIMO) });
}
function tirarCartao(id: string) {
  const lista = cartoes.lista.filter((c) => c.id !== id);
  mudarCartoes({ lista, sobra: lista.length ? cartoes.sobra : 0 });
}

/**
 * "Testar o aviso" (no sininho): a notificação do navegador, se estiver ligada, e o cartão de exemplo —
 * que conta o que houve com a notificação (o sininho fecha para o cartão aparecer inteiro).
 */
export function testarOAviso() {
  const navegador = !comoAvisar.navegador ? 'desligada'
    : notificar('Aviso de teste · Ingline Gestão', 'É assim que chega um aviso dos chamados.', 'gestor-teste', false, () => undefined) ? 'mostrou' : 'falhou';
  porCartoes([{
    id: `teste-${Date.now()}`, tipo: 'recebeu', teste: true, lido: false, em: new Date().toISOString(), chamado: null,
    texto: navegador === 'mostrou' ? 'É assim que chega um aviso. A notificação do navegador também foi: ela aparece no canto da tela do computador.'
      : navegador === 'falhou' ? 'É assim que chega um aviso. A notificação do navegador não apareceu: este navegador não deixou.'
        : 'É assim que chega um aviso: um chamado para você, o prazo perto, o cliente respondeu…',
  }]);
}

/**
 * O que chegou desde a última leitura e ainda não foi lido. `ja` guarda o que já foi visto: o aviso e
 * quando (o do observador junta as mudanças de uma pessoa no mesmo aviso, que volta a chegar).
 */
export function oQueChegou(ja: Set<string>, itens: AvisoNaTela[]): AvisoNaTela[] {
  const chave = (a: AvisoNaTela) => `${a.id}@${a.em}`;
  const novos = itens.filter((a) => !ja.has(chave(a)) && !a.lido);
  for (const a of itens) ja.add(chave(a));
  return novos;
}

/** O Gestor está escondido (outra aba, minimizado)? O tempo do cartão só corre com ele à vista. */
const assinarVisibilidade = (f: () => void) => { document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); };
const useVisivel = () => useSyncExternalStore(assinarVisibilidade, () => document.visibilityState === 'visible');

// =====================================================================
//  O VIGIA E OS CARTÕES
// =====================================================================

/** `esquerda`: onde começa o conteúdo no computador (o cartão sai do lado do menu, perto do sininho). */
export function AvisosQueChegam({ esquerda }: { esquerda: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const abrirChamado = useAbrirChamado();
  const visivel = useVisivel();
  const { lista, sobra } = useSyncExternalStore(assinarCartoes, () => cartoes);
  const q = useQuery({ ...consultaDosAvisos, refetchInterval: 30_000, refetchIntervalInBackground: true });

  // o abrir muda com a tela (a janela do chamado guarda a tela de baixo): a notificação usa o de agora
  const abrir = useRef(abrirChamado);
  abrir.current = abrirChamado;
  const marcarLido = async (id: string) => {
    await api.atendimento.marcarAvisosLidos([id]).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: consultaDosAvisos.queryKey });
  };

  // o que já foi visto, de quem está no Gestor (a primeira leitura só anota: o que já estava lá não pula)
  const vistos = useRef<{ dono: string; chaves: Set<string> } | null>(null);
  useEffect(() => {
    const d = q.data;
    if (!d || !user) return;
    if (vistos.current?.dono !== user.id) { vistos.current = { dono: user.id, chaves: new Set() }; oQueChegou(vistos.current.chaves, d.itens); return; }
    const novos = oQueChegou(vistos.current.chaves, d.itens);
    // o que foi lido (aqui, no sininho, em outra aba) sai da tela
    const lidos = new Set(d.itens.filter((a) => a.lido).map((a) => a.id));
    if (cartoes.lista.some((c) => lidos.has(c.id))) {
      const fica = cartoes.lista.filter((c) => !lidos.has(c.id));
      mudarCartoes({ lista: fica, sobra: fica.length ? cartoes.sobra : 0 });
    }
    if (!novos.length) return;
    if (comoAvisar.tela) porCartoes(novos);
    // a notificação do sistema: só com o Gestor fora da frente (na frente, o cartão basta)
    if (comoAvisar.navegador && (document.visibilityState !== 'visible' || !document.hasFocus())) {
      if (novos.length > MAXIMO) {
        notificar(`Chegaram ${novos.length} avisos dos chamados`, novos.slice(0, MAXIMO).map((a) => a.texto).join('\n'), 'gestor-avisos', false, () => undefined);
      } else {
        for (const a of novos) {
          notificar(doTipo(a.tipo).titulo, corpoDoAviso(a), a.id, FICA_ATE_FECHAR.has(a.tipo), () => {
            tirarCartao(a.id);
            if (a.chamado) { void marcarLido(a.id); abrir.current(a.chamado.codigo); }
          });
        }
      }
    }
    // o efeito roda pelo que chegou (o marcarLido e o abrir de agora vão pela ref)
  }, [q.data, user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lista.length) return null;
  return (
    <div className="so-tela fixed z-[70] top-16 inset-x-3 md:inset-x-auto md:top-auto md:bottom-4 md:left-[var(--esquerda)] md:w-[360px] flex flex-col md:flex-col-reverse gap-2 pointer-events-none"
      style={{ ['--esquerda' as string]: esquerda }} role="region" aria-label="Avisos que chegaram">
      {lista.map((c) => (
        // o aviso que voltou a chegar (o do observador, com mais mudanças) entra de novo, com o tempo do começo
        <CartaoDoAviso key={`${c.id}@${c.em}`} c={c} correndo={visivel} fechar={() => tirarCartao(c.id)}
          abrir={c.chamado ? () => { const codigo = c.chamado!.codigo; tirarCartao(c.id); void marcarLido(c.id); abrirChamado(codigo); } : undefined} />
      ))}
      {sobra > 0 && (
        <div className="pointer-events-auto self-start card shadow px-3 py-1.5 text-[12px] text-ink-2 flex items-center gap-1.5">
          <Bell size={13} aria-hidden /> mais {sobra} {sobra === 1 ? 'aviso' : 'avisos'} no sininho
        </div>
      )}
    </div>
  );
}

function CartaoDoAviso({ c, correndo, fechar, abrir }: { c: Cartao; correndo: boolean; fechar: () => void; abrir?: () => void }) {
  const t = doTipo(c.tipo);
  const fica = FICA_ATE_FECHAR.has(c.tipo);
  return (
    <div className="aviso-cartao pointer-events-auto card overflow-hidden" role="status" style={{ boxShadow: '0 12px 32px rgba(0,0,0,.20)' }}>
      <div className="flex gap-3 p-3">
        <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${t.fundo}`}><t.Icone size={17} className={t.cor} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className="font-display font-semibold text-[13.5px] text-ink flex-1">{c.teste ? 'Aviso de teste' : t.titulo}</span>
            <button className="btn-ghost p-1 -mt-1 -mr-1" onClick={fechar} aria-label="Fechar o aviso" title="Fechar (continua no sininho)"><X size={14} /></button>
          </div>
          <p className="text-[13px] text-ink-2 mt-0.5">{c.texto}</p>
          {c.chamado && <p className="text-[12px] text-muted truncate mt-0.5"><span className="font-mono">{c.chamado.codigo}</span> · {c.chamado.titulo}</p>}
          {abrir && <button className="btn-primary btn-sm mt-2" onClick={abrir}>Abrir o chamado</button>}
        </div>
      </div>
      {/* o tempo do cartão: para com o mouse em cima e com o Gestor escondido */}
      {!fica && <div className="h-1 bg-surface-2"><div className={`aviso-tempo h-full ${c.tipo === 'prazo_perto' || c.tipo === 'sem_dono' ? 'bg-signal' : 'bg-accent'}`} style={{ animationPlayState: correndo ? undefined : 'paused' }} onAnimationEnd={fechar} /></div>}
    </div>
  );
}
