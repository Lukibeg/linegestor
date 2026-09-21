/**
 * Novidades: o "o que mudou" de cada publicação (cada **patch**).
 *
 *  - **Pop-up no login** (`NovidadesPopup`, montado na moldura): o patch mais recente abre e é
 *    **leitura obrigatória** — não dá para fechar, adiar nem clicar fora. A pessoa passa por
 *    todos os cartões e marca "Li e entendi"; só então a janela sai e ela volta ao sistema.
 *  - **Página Novidades** (`NovidadesPagina`): cada patch numa pasta, para reler quando quiser.
 *
 * Quem entra pela primeira vez não leva os patches antigos na cara: só o mais recente abre.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Folder, FolderOpen, Sparkles } from 'lucide-react';
import { api, logoSrc } from '../../api/index.js';
import type { Novidade, NovidadeItem } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { useAuth } from '../../lib/auth.js';
import { Carregando, Chip, Modal, Spinner, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { data, patch, relativo } from '../../lib/format.js';

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

/** Um item como linha (a lista, na pasta do histórico e no "ver tudo de uma vez"). */
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

// ---------- Pop-up do login (leitura obrigatória) ----------

export function NovidadesPopup() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['novidade-pendente'], queryFn: () => api.novidades.pendente(), enabled: !!user, staleTime: 5 * 60_000 });
  const [i, setI] = useState(0);
  const [lido, setLido] = useState(false);
  const [lista, setLista] = useState(false);
  const [vistos, setVistos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const rolagem = useRef<HTMLUListElement>(null);
  const nota = q.data ?? null;
  const itens = useMemo(() => nota?.items ?? [], [nota]);

  // trocou de patch (ou de pessoa): recomeça do primeiro cartão
  useEffect(() => { setI(0); setLido(false); setLista(false); setVistos([]); }, [nota?.id]);
  // o cartão que está na tela conta como visto
  useEffect(() => {
    const atual = itens[i];
    if (!lista && atual) setVistos((v) => (v.includes(atual.id) ? v : [...v, atual.id]));
  }, [i, lista, itens]);

  /** No "ver tudo de uma vez", chegar ao fim da lista vale por ter passado pelos cartões. */
  const conferirFim = useCallback(() => {
    const el = rolagem.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 32) setVistos(itens.map((it) => it.id));
  }, [itens]);
  useEffect(() => { if (lista) conferirFim(); }, [lista, conferirFim]);

  if (!nota || !itens.length) return null;
  const faltam = itens.filter((it) => !vistos.includes(it.id)).length;
  const podeMarcar = faltam === 0;
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

  const concluirBotao = (
    <>
      <label className={`flex items-center gap-2 text-sm mr-2 ${podeMarcar ? 'cursor-pointer' : 'text-muted cursor-not-allowed'}`} title={podeMarcar ? undefined : 'Passe por todos os cartões primeiro'}>
        <input type="checkbox" checked={lido} disabled={!podeMarcar} onChange={(e) => setLido(e.target.checked)} /> Li e entendi
      </label>
      <button className="btn-primary" disabled={!lido || !podeMarcar || busy} onClick={concluir}>{busy ? <Spinner className="text-white" /> : 'Concluir'}</button>
    </>
  );

  return (
    <Modal
      open
      fechavel={false}
      onClose={() => {}}
      largura="max-w-3xl"
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          Novidades do sistema
          <Chip tone="accent">{patch(nota.version)}</Chip>
          {nota.publishedAt && <span className="text-muted text-[12.5px] font-normal">{data(nota.publishedAt)}</span>}
        </span>
      }
      rodape={
        lista || ultimo ? (
          lista ? concluirBotao : (
            <>
              <button className="btn-secondary" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft size={15} /> Anterior</button>
              {concluirBotao}
            </>
          )
        ) : (
          <>
            <button className="btn-secondary" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft size={15} /> Anterior</button>
            <button className="btn-primary" onClick={() => setI(i + 1)}>Próxima <ChevronRight size={15} /></button>
          </>
        )
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
          <ul ref={rolagem} onScroll={conferirFim} className="max-h-[60vh] overflow-y-auto pr-1">{itens.map((it) => <Linha key={it.id} item={it} />)}</ul>
        ) : (
          <>
            <Cartao item={item} />
            {/* onde estou: bolinhas clicáveis (as que faltam ficam vazias) + "3 de 8" */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {itens.map((it, k) => (
                  <button key={it.id} onClick={() => setI(k)} aria-label={`Ir para ${it.title}`} title={it.title}
                    className={`h-2 rounded-full transition-all ${k === i ? 'w-5 bg-accent' : vistos.includes(it.id) ? 'w-2 bg-line-strong hover:bg-muted' : 'w-2 bg-transparent border border-line-strong hover:bg-muted'}`} />
                ))}
              </div>
              <span className="text-[12.5px] text-muted tnum shrink-0">{i + 1} de {itens.length}</span>
            </div>
          </>
        )}
        <p className="text-[12px] text-muted">
          {podeMarcar
            ? 'Marque "Li e entendi" para voltar ao sistema.'
            : lista
              ? 'Role até o fim da lista para poder marcar que leu.'
              : `Leitura obrigatória: ${faltam === 1 ? 'falta 1 cartão' : `faltam ${faltam} cartões`} para você poder marcar que leu.`}
        </p>
      </div>
    </Modal>
  );
}

// ---------- Página: uma pasta por patch ----------

function Pasta({ nota, aberta, alternar, marcar, marcando, podeEditar }: {
  nota: Novidade; aberta: boolean; alternar: () => void; marcar: () => void; marcando: boolean; podeEditar: boolean;
}) {
  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={alternar} aria-expanded={aberta} className="w-full text-left p-4 flex flex-wrap items-start gap-3 hover:bg-surface-2">
        {aberta ? <FolderOpen size={20} className="text-accent shrink-0 mt-0.5" /> : <Folder size={20} className="text-muted shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="accent">{patch(nota.version)}</Chip>
            {!nota.publishedAt && <Chip tone="muted">rascunho</Chip>}
            {nota.publishedAt && !nota.lida && <Chip tone="signal">não lida</Chip>}
            <span className="text-muted text-[12.5px]">
              {nota.items.length} {nota.items.length === 1 ? 'novidade' : 'novidades'}
              {nota.publishedAt ? ` · publicado ${relativo(nota.publishedAt)}` : ' · ainda não publicado'}
            </span>
          </div>
          <h2 className="font-display text-lg font-semibold mt-1">{nota.title}</h2>
          {nota.summary && <p className="text-sm text-muted">{nota.summary}</p>}
        </div>
        <ChevronDown size={18} className={`text-muted shrink-0 mt-1 transition-transform ${aberta ? 'rotate-180' : ''}`} />
      </button>

      {aberta && (
        <div className="px-4 pb-4 border-t border-line pt-1">
          <ul>{nota.items.map((it) => <Linha key={it.id} item={it} />)}</ul>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
            {podeEditar && nota.publishedAt
              ? <span className="text-[12px] text-muted">{nota.leituras} de {nota.pessoas} pessoa(s) já leram · <Link className="link" to="/admin/novidades">acompanhar</Link></span>
              : <span />}
            {nota.publishedAt && !nota.lida && (
              <button className="btn-secondary btn-sm" disabled={marcando} onClick={marcar}>{marcando ? <Spinner /> : 'Marcar como lida'}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function NovidadesPagina() {
  const q = useQuery({ queryKey: ['novidades'], queryFn: () => api.novidades.lista() });
  const qc = useQueryClient();
  const toast = useToast();
  const [marcando, setMarcando] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<string[]>([]);
  const notas = useMemo(() => (q.data?.items ?? []).filter((n) => n.publishedAt || q.data?.podeEditar), [q.data]);
  // a pasta mais recente já vem aberta; as outras, fechadas
  const primeira = notas[0]?.id;
  useEffect(() => { if (primeira) setAbertas((a) => (a.length ? a : [primeira])); }, [primeira]);

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
      sub="Cada patch numa pasta: abra para ver o que mudou. O mais recente abre sozinho no login e é leitura obrigatória."
      acoes={q.data?.podeEditar ? <Link className="btn-secondary" to="/admin/novidades">Escrever novidades</Link> : undefined}
    >
      {!notas.length ? (
        <Vazio titulo="Nenhuma novidade ainda" texto="Quando o sistema for atualizado, o que mudou aparece aqui." />
      ) : (
        <div className="flex flex-col gap-3">
          {notas.map((n) => (
            <Pasta key={n.id} nota={n} aberta={abertas.includes(n.id)}
              alternar={() => setAbertas((a) => (a.includes(n.id) ? a.filter((x) => x !== n.id) : [...a, n.id]))}
              marcar={() => marcar(n)} marcando={marcando === n.id} podeEditar={!!q.data?.podeEditar} />
          ))}
        </div>
      )}
    </Pagina>
  );
}
