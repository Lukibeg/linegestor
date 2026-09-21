/**
 * Administração › Novidades: escrever, publicar e acompanhar a leitura das notas de versão.
 *
 * A nota nasce **rascunho** (ninguém vê) e só aparece para a equipe quando alguém aperta
 * **Publicar** — por isso publicar é um botão à parte, e não um efeito de salvar.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from 'lucide-react';
import { api, logoSrc } from '../../api/index.js';
import type { Novidade, NovidadeItem } from '../../api/types.js';
import { Campo, CampoLogo, Carregando, Chip, Confirmar, Modal, Spinner, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { data, patch, relativo } from '../../lib/format.js';
import { contar, TdN, ThN } from '../../lib/contagem.js';
import { TIPO_NOVIDADE } from '../novidades/Index.js';

/** Um item em edição: o `imagem` só existe enquanto a pessoa está mexendo (não veio do servidor). */
type ItemEdit = Partial<NovidadeItem> & { kind: NovidadeItem['kind']; title: string; text: string | null; imagem?: string | null; imageUrl?: string | null };

export function Novidades() {
  const q = useQuery({ queryKey: ['novidades'], queryFn: () => api.novidades.lista() });
  const qc = useQueryClient(); const toast = useToast();
  const [editar, setEditar] = useState<Novidade | 'nova' | null>(null);
  const [leituras, setLeituras] = useState<Novidade | null>(null);
  const [publicar, setPublicar] = useState<{ nota: Novidade; ligar: boolean } | null>(null);
  const [excluir, setExcluir] = useState<Novidade | null>(null);
  const [busy, setBusy] = useState(false);
  const atualizar = () => Promise.all([qc.invalidateQueries({ queryKey: ['novidades'] }), qc.invalidateQueries({ queryKey: ['novidade-pendente'] })]);

  const doPublicar = async () => {
    if (!publicar) return;
    setBusy(true);
    try {
      await api.novidades.publicar(publicar.nota.id, publicar.ligar);
      setPublicar(null); await atualizar();
      toast.push('ok', publicar.ligar ? 'Publicada: vai abrir no próximo acesso de cada pessoa' : 'Voltou a ser rascunho');
    } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); }
  };
  const doExcluir = async () => {
    if (!excluir) return;
    setBusy(true);
    try { await api.novidades.remover(excluir.id); setExcluir(null); await atualizar(); toast.push('ok', 'Nota foi para a lixeira'); }
    catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); }
  };

  if (q.isLoading) return <Carregando />;
  const notas = q.data?.items ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <p className="text-sm text-muted flex-1 min-w-[260px]">
          Cada <b>patch</b> é uma publicação do sistema (1.2, 1.3, …). Ele nasce como <b>rascunho</b>; ao <b>publicar</b>, abre no
          login de cada pessoa como <b>leitura obrigatória</b> — a janela só sai quando ela passa por todos os cartões e marca
          "Li e entendi". A cada publicação eu já deixo o patch pronto aqui — você revisa e publica.
        </p>
        <button className="btn-primary btn-sm" onClick={() => setEditar('nova')}><Plus size={14} /> Novo patch</button>
      </div>

      {!notas.length ? <Vazio titulo="Nenhum patch ainda" texto="Escreva o primeiro para contar à equipe o que mudou." /> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><ThN /><th>Patch</th><th>Título</th><th>Itens</th><th>Situação</th><th>Leitura</th><th /></tr></thead>
            <tbody>{notas.map((n, i) => (
              <tr key={n.id}>
                <TdN n={contar(i)} />
                <td><Chip tone="accent">{patch(n.version)}</Chip></td>
                <td className="font-medium max-w-[320px] truncate" title={n.title}>{n.title}</td>
                <td className="tnum">{n.items.length}</td>
                <td className="whitespace-nowrap">{n.publishedAt ? <span className="text-ok text-[12.5px] font-semibold">publicada <span className="text-muted font-normal">{data(n.publishedAt)}</span></span> : <Chip tone="muted">rascunho</Chip>}</td>
                <td className="whitespace-nowrap">{n.publishedAt ? <button className="link tnum" onClick={() => setLeituras(n)}>{n.leituras} de {n.pessoas}</button> : <span className="text-muted">—</span>}</td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn-ghost btn-sm" onClick={() => setEditar(n)}>Editar</button>
                  <button className="btn-ghost btn-sm" onClick={() => setPublicar({ nota: n, ligar: !n.publishedAt })}>{n.publishedAt ? 'Despublicar' : 'Publicar'}</button>
                  <button className="btn-ghost btn-sm text-bad" onClick={() => setExcluir(n)} aria-label={`Excluir ${patch(n.version)}`}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {editar && <NotaForm nota={editar === 'nova' ? undefined : editar} onClose={() => setEditar(null)} onSaved={async () => { setEditar(null); await atualizar(); }} />}
      {leituras && <QuemLeu nota={leituras} onClose={() => setLeituras(null)} />}
      <Confirmar open={!!publicar} onClose={() => setPublicar(null)} onConfirm={doPublicar} loading={busy}
        titulo={publicar?.ligar ? 'Publicar novidades' : 'Voltar para rascunho'} botao={publicar?.ligar ? 'Publicar para todos' : 'Voltar para rascunho'}
        texto={publicar?.ligar
          ? <>O <b>{publicar ? patch(publicar.nota.version) : ''}</b> vai abrir no próximo acesso de <b>cada pessoa</b> do sistema, e só para de abrir quando cada uma marcar "Li e entendi".</>
          : <>O <b>{publicar ? patch(publicar.nota.version) : ''}</b> sai do ar e volta a ser rascunho. Quem já leu não vê mais nada; quem não leu também não verá.</>} />
      <Confirmar open={!!excluir} onClose={() => setExcluir(null)} onConfirm={doExcluir} loading={busy} perigoso titulo="Excluir nota" botao="Mandar para a lixeira"
        texto={<>A nota <b>{excluir?.title}</b> sai das telas. Dá para restaurar em Administração → Lixeira.</>} />
    </div>
  );
}

/** Quem já leu e quem ainda não — para você saber quem avisar sem perguntar a ninguém. */
function QuemLeu({ nota, onClose }: { nota: Novidade; onClose: () => void }) {
  const q = useQuery({ queryKey: ['novidade-leituras', nota.id], queryFn: () => api.novidades.leituras(nota.id) });
  const pessoas = q.data?.pessoas ?? [];
  const leram = pessoas.filter((p) => p.readAt);
  return (
    <Modal open onClose={onClose} titulo={<span className="flex items-center gap-2">Quem leu <Chip tone="accent">{patch(nota.version)}</Chip></span>} rodape={<button className="btn-secondary" onClick={onClose}>Fechar</button>}>
      {q.isLoading ? <Carregando /> : (
        <div className="flex flex-col gap-3">
          <div className="text-sm"><b className="tnum">{leram.length}</b> de <b className="tnum">{pessoas.length}</b> pessoa(s) já leram.</div>
          <ul className="flex flex-col">
            {pessoas.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0 text-sm">
                <span className="min-w-0"><span className="font-medium">{p.name}</span> <span className="text-muted text-[12.5px]">{p.email}</span></span>
                {p.readAt ? <span className="text-ok text-[12.5px] whitespace-nowrap">leu {relativo(p.readAt)}</span> : <span className="text-muted text-[12.5px] whitespace-nowrap">ainda não leu</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

/** Escrever a nota: cabeçalho e os cartões, na ordem em que a equipe vai ver. */
function NotaForm({ nota, onClose, onSaved }: { nota?: Novidade; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    version: nota?.version ?? '',
    title: nota?.title ?? '',
    summary: nota?.summary ?? '',
  });
  const [itens, setItens] = useState<ItemEdit[]>(nota?.items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, text: i.text, imageUrl: i.imageUrl })) ?? []);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  const mexer = (k: number, mudanca: Partial<ItemEdit>) => setItens(itens.map((it, j) => (j === k ? { ...it, ...mudanca } : it)));
  const mover = (k: number, passo: number) => {
    const alvo = k + passo;
    if (alvo < 0 || alvo >= itens.length) return;
    const copia = [...itens];
    [copia[k], copia[alvo]] = [copia[alvo]!, copia[k]!];
    setItens(copia);
  };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const body = {
        version: f.version.trim(), title: f.title.trim(), summary: f.summary.trim() || null,
        items: itens.map((it) => ({
          ...(it.id ? { id: it.id } : {}),
          kind: it.kind, title: it.title.trim(), text: it.text?.trim() || null,
          // ausente = mantém o print · null = tira · texto = troca
          ...(it.imagem === undefined ? {} : { imagem: it.imagem }),
        })),
      };
      if (nota) await api.novidades.atualizar(nota.id, body); else await api.novidades.criar(body);
      toast.push('ok', nota ? 'Nota salva' : 'Nota criada como rascunho'); onSaved();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };

  const podeSalvar = !!f.version.trim() && !!f.title.trim() && itens.every((i) => i.title.trim());
  return (
    <Modal open onClose={onClose} lateral largura="max-w-3xl" titulo={nota ? `Editar ${patch(nota.version)}` : 'Novo patch'}
      rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !podeSalvar} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3">
          <Campo label="Patch" dica="o número da publicação, ex.: 1.3"><input className="input font-mono" autoComplete="off" value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} /></Campo>
          <Campo label="Título"><input className="input" autoComplete="off" placeholder="O que mudou nesta publicação" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Campo>
        </div>
        <Campo label="Resumo" dica="uma frase, aparece abaixo do título"><input className="input" autoComplete="off" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Campo>

        <div className="flex items-center justify-between">
          <span className="eyebrow">Itens ({itens.length})</span>
          <button className="btn-secondary btn-sm" onClick={() => setItens([...itens, { kind: 'novo', title: '', text: '' }])}><Plus size={13} /> Acrescentar item</button>
        </div>
        {!itens.length && <p className="text-sm text-muted">Cada item vira um cartão, mostrado um por vez. Comece pelo mais importante.</p>}

        {itens.map((it, k) => (
          <div key={it.id ?? `novo-${k}`} className="card p-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-muted tnum w-8">#{k + 1}</span>
              <select className="input w-auto" value={it.kind} onChange={(e) => mexer(k, { kind: e.target.value as NovidadeItem['kind'] })} aria-label="Tipo do item">
                {(Object.keys(TIPO_NOVIDADE) as NovidadeItem['kind'][]).map((t) => <option key={t} value={t}>{TIPO_NOVIDADE[t].rotulo}</option>)}
              </select>
              <input className="input flex-1 min-w-[200px]" autoComplete="off" placeholder="Título do item" value={it.title} onChange={(e) => mexer(k, { title: e.target.value })} />
              <span className="flex">
                <button className="btn-ghost btn-sm" onClick={() => mover(k, -1)} disabled={k === 0} aria-label="Subir"><ArrowUp size={14} /></button>
                <button className="btn-ghost btn-sm" onClick={() => mover(k, 1)} disabled={k === itens.length - 1} aria-label="Descer"><ArrowDown size={14} /></button>
                <button className="btn-ghost btn-sm text-bad" onClick={() => setItens(itens.filter((_, j) => j !== k))} aria-label="Tirar item"><Trash2 size={14} /></button>
              </span>
            </div>
            <textarea className="input" rows={2} autoComplete="off" placeholder="Duas ou três linhas explicando, em português de gente" value={it.text ?? ''} onChange={(e) => mexer(k, { text: e.target.value })} />
            <CampoLogo
              atual={it.imagem === undefined ? logoSrc(it.imageUrl ?? null) : it.imagem}
              nome={it.title || 'print'}
              maxPx={1280}
              limiteBytes={2_600_000}
              onEscolher={(dataUrl) => mexer(k, { imagem: dataUrl })}
              onRemover={(it.imagem ?? it.imageUrl) ? () => mexer(k, { imagem: null }) : undefined}
              previa={
                (it.imagem === undefined ? it.imageUrl : it.imagem)
                  ? <img src={(it.imagem === undefined ? logoSrc(it.imageUrl ?? null) : it.imagem) ?? ''} alt="" className="w-28 h-20 object-contain rounded-md border border-line bg-surface-2 shrink-0" />
                  : <span className="w-28 h-20 rounded-md border border-dashed border-line flex items-center justify-center text-muted shrink-0"><Eye size={16} /></span>
              }
            />
          </div>
        ))}
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}
