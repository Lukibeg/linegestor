/**
 * Novidades: o "o que mudou" de cada publicação.
 *
 *  - **Pop-up no login** (`NovidadesPopup`, montado na moldura): a nota mais recente abre uma vez,
 *    em cartões, um item por vez. Fechar sem marcar não conta — ela volta no próximo login.
 *    Só some de vez quando a pessoa marca "Li e entendi" no último cartão.
 *  - **Página Novidades** (`NovidadesPagina`): o histórico, para reler quando quiser.
 *
 * Quem entra pela primeira vez não leva as notas antigas na cara: só a mais recente abre.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { api, logoSrc } from '../../api/index.js';
import type { Novidade, NovidadeItem } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { useAuth } from '../../lib/auth.js';
import { Carregando, Chip, Modal, Spinner, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { data, relativo } from '../../lib/format.js';

/** O rótulo e a cor de cada tipo de item. "Atenção" é mudança de regra: muda o jeito de trabalhar. */
export const TIPO_NOVIDADE: Record<NovidadeItem['kind'], { rotulo: string; tone: 'accent' | 'ok' | 'neutral' | 'signal' }> = {
  novo: { rotulo: 'Novo', tone: 'accent' },
  melhorou: { rotulo: 'Melhorou', tone: 'ok' },
  corrigido: { rotulo: 'Corrigido', tone: 'neutral' },
  atencao: { rotulo: 'Atenção', tone: 'signal' },
};

function ChipTipo({ kind }: { kind: NovidadeItem['kind'] }) {
  const t = TIPO_NOVIDADE[kind] ?? TIPO_NOVIDADE.novo;
  return <Chip tone={t.tone}>{t.rotulo}</Chip>;
}

/** O print do item. Fica em caixa de altura fixa para os cartões não "pularem" ao avançar. */
function Print({ item, altura = 'h-[300px] sm:h-[340px]' }: { item: NovidadeItem; altura?: string }) {
  const src = logoSrc(item.imageUrl);
  if (!src) return null;
  return (
    <div className={`rounded-lg border border-line bg-surface-2 overflow-hidden flex items-center justify-center ${altura}`}>
      <img src={src} alt={item.title} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

/** Um item como cartão grande (o do pop-up). */
function Cartao({ item }: { item: NovidadeItem }) {
  return (
    <div className="flex flex-col gap-3">
      <div><ChipTipo kind={item.kind} /></div>
      <h3 className="font-display text-lg font-semibold">{item.title}</h3>
      {item.text && <p className="text-sm text-ink-2 whitespace-pre-wrap">{item.text}</p>}
      <Print item={item} />
    </div>
  );
}

/** Um item como linha (a lista, na página e no "ver tudo de uma vez"). */
function Linha({ item }: { item: NovidadeItem }) {
  return (
    <li className="flex flex-col sm:flex-row gap-3 py-3 border-b border-line last:border-0">
      <div className="sm:w-[150px] shrink-0"><ChipTipo kind={item.kind} /></div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[15px]">{item.title}</div>
        {item.text && <p className="text-sm text-ink-2 mt-0.5 whitespace-pre-wrap">{item.text}</p>}
      </div>
      {item.imageUrl && <div className="sm:w-[260px] shrink-0"><Print item={item} altura="h-[150px]" /></div>}
    </li>
  );
}

// ---------- Pop-up do login ----------

export function NovidadesPopup() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['novidade-pendente'], queryFn: () => api.novidades.pendente(), enabled: !!user, staleTime: 5 * 60_000 });
  const [i, setI] = useState(0);
  const [lido, setLido] = useState(false);
  const [adiado, setAdiado] = useState(false);
  const [lista, setLista] = useState(false);
  const [busy, setBusy] = useState(false);
  const nota = q.data ?? null;
  // trocou de nota (ou de pessoa): recomeça do primeiro cartão
  useEffect(() => { setI(0); setLido(false); setLista(false); }, [nota?.id]);

  if (!nota || adiado || !nota.items.length) return null;
  const itens = nota.items;
  const ultimo = i >= itens.length - 1;
  const item = itens[Math.min(i, itens.length - 1)]!;

  const concluir = async () => {
    setBusy(true);
    try {
      await api.novidades.marcarLida(nota.id);
      await Promise.all([qc.invalidateQueries({ queryKey: ['novidade-pendente'] }), qc.invalidateQueries({ queryKey: ['novidades'] })]);
      toast.push('ok', 'Novidades marcadas como lidas');
    } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={() => setAdiado(true)}
      largura="max-w-3xl"
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          Novidades do sistema
          <Chip tone="accent">{nota.version}</Chip>
          {nota.publishedAt && <span className="text-muted text-[12.5px] font-normal">{data(nota.publishedAt)}</span>}
        </span>
      }
      rodape={
        <>
          <button className="btn-ghost text-muted mr-auto" onClick={() => setAdiado(true)} title="A nota volta a abrir no próximo acesso">Ver depois</button>
          {lista ? (
            <>
              <label className="flex items-center gap-2 text-sm cursor-pointer mr-2">
                <input type="checkbox" checked={lido} onChange={(e) => setLido(e.target.checked)} /> Li e entendi
              </label>
              <button className="btn-primary" disabled={!lido || busy} onClick={concluir}>{busy ? <Spinner className="text-white" /> : 'Concluir'}</button>
            </>
          ) : (
            <>
              <button className="btn-secondary" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft size={15} /> Anterior</button>
              {!ultimo ? (
                <button className="btn-primary" onClick={() => setI(i + 1)}>Próxima <ChevronRight size={15} /></button>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm cursor-pointer mr-2">
                    <input type="checkbox" checked={lido} onChange={(e) => setLido(e.target.checked)} /> Li e entendi
                  </label>
                  <button className="btn-primary" disabled={!lido || busy} onClick={concluir}>{busy ? <Spinner className="text-white" /> : 'Concluir'}</button>
                </>
              )}
            </>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display font-semibold">{nota.title}</div>
            {nota.summary && <p className="text-[12.5px] text-muted">{nota.summary}</p>}
          </div>
          <button className="btn-ghost btn-sm text-muted" onClick={() => setLista(!lista)}>{lista ? 'ver em cartões' : 'ver tudo de uma vez'}</button>
        </div>

        {lista ? (
          <ul className="max-h-[60vh] overflow-y-auto pr-1">{itens.map((it) => <Linha key={it.id} item={it} />)}</ul>
        ) : (
          <>
            <Cartao item={item} />
            {/* onde estou: bolinhas clicáveis + "3 de 8" */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {itens.map((it, k) => (
                  <button key={it.id} onClick={() => setI(k)} aria-label={`Ir para ${it.title}`} title={it.title}
                    className={`h-2 rounded-full transition-all ${k === i ? 'w-5 bg-accent' : 'w-2 bg-line-strong hover:bg-muted'}`} />
                ))}
              </div>
              <span className="text-[12.5px] text-muted tnum shrink-0">{i + 1} de {itens.length}</span>
            </div>
          </>
        )}
        {ultimo && !lido && !lista && <p className="text-[12px] text-muted">Marque "Li e entendi" para esta nota não abrir de novo.</p>}
      </div>
    </Modal>
  );
}

// ---------- Página ----------

export function NovidadesPagina() {
  const q = useQuery({ queryKey: ['novidades'], queryFn: () => api.novidades.lista() });
  const qc = useQueryClient();
  const toast = useToast();
  const [marcando, setMarcando] = useState<string | null>(null);
  const notas = useMemo(() => (q.data?.items ?? []).filter((n) => n.publishedAt || q.data?.podeEditar), [q.data]);

  const marcar = async (n: Novidade) => {
    setMarcando(n.id);
    try {
      await api.novidades.marcarLida(n.id);
      await Promise.all([qc.invalidateQueries({ queryKey: ['novidades'] }), qc.invalidateQueries({ queryKey: ['novidade-pendente'] })]);
    } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setMarcando(null); }
  };

  if (q.isLoading) return <Pagina titulo="Novidades"><Carregando /></Pagina>;
  return (
    <Pagina
      titulo="Novidades"
      sub="O que mudou no sistema a cada publicação. A mais recente abre sozinha no login até você marcar que leu."
      acoes={q.data?.podeEditar ? <Link className="btn-secondary" to="/admin/novidades">Escrever novidades</Link> : undefined}
    >
      {!notas.length ? (
        <Vazio titulo="Nenhuma novidade ainda" texto="Quando o sistema for atualizado, o que mudou aparece aqui." />
      ) : (
        <div className="flex flex-col gap-4">
          {notas.map((n) => (
            <div key={n.id} className="card p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="accent">{n.version}</Chip>
                    {!n.publishedAt && <Chip tone="muted">rascunho</Chip>}
                    {n.publishedAt && !n.lida && <Chip tone="signal">não lida</Chip>}
                    <span className="text-muted text-[12.5px]">{n.publishedAt ? `publicada ${relativo(n.publishedAt)}` : 'ainda não publicada'}</span>
                  </div>
                  <h2 className="font-display text-lg font-semibold mt-1">{n.title}</h2>
                  {n.summary && <p className="text-sm text-muted">{n.summary}</p>}
                </div>
                {n.publishedAt && !n.lida && (
                  <button className="btn-secondary btn-sm" disabled={marcando === n.id} onClick={() => marcar(n)}>{marcando === n.id ? <Spinner /> : 'Marcar como lida'}</button>
                )}
              </div>
              <ul>{n.items.map((it) => <Linha key={it.id} item={it} />)}</ul>
              {q.data?.podeEditar && n.publishedAt && (
                <div className="text-[12px] text-muted">{n.leituras} de {n.pessoas} pessoa(s) já leram · <Link className="link" to="/admin/novidades">acompanhar</Link></div>
              )}
            </div>
          ))}
        </div>
      )}
    </Pagina>
  );
}
