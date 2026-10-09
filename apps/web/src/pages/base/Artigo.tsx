/**
 * Base de conhecimento (Patch 1.8): a página de um artigo.
 *
 * O artigo do jeito do KCS: o que acontece (nas palavras do cliente), como resolver (os passos,
 * com os comandos para copiar e os prints), por que acontece e as palavras do cliente. Em cima,
 * as ligações (o cliente, o assunto, o chamado de onde veio…). Na aba Histórico, cada versão,
 * o que mudou de uma para outra e o "voltar a esta versão". Embaixo do artigo, os comentários
 * (pedido do Luan na prévia): o que a equipe viu depois, registrado com quem e quando.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Check, History, Link2, MessageSquare, Paperclip, Pencil, RotateCcw, Send, Trash2, Users } from 'lucide-react';
import { diferencaDasVersoes } from '@gestor/shared';
import { api, IS_DEMO, logoSrc } from '../../api/index.js';
import type { Artigo, TextoVersao } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Abas, Carregando, Chip, Confirmar, Modal, Spinner, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { data, relativo } from '../../lib/format.js';
import { Voltar } from '../../lib/voltar.js';
import { CodigoArtigo, Ligacoes, Linha, Parte, TextoSimples } from './partes.js';

/**
 * A página de um artigo. Ir de um artigo para outro (o link BC-1 no meio do texto) usa a mesma rota:
 * a chave pelo número faz a página começar do zero (aba Artigo, nenhuma versão escolhida).
 */
export function ArtigoPagina() {
  const { numero = '' } = useParams();
  return <PaginaDoArtigo key={numero} />;
}

function PaginaDoArtigo() {
  const { numero = '' } = useParams();
  const q = useQuery({ queryKey: ['base', 'artigo', numero], queryFn: () => api.base.get(numero) });
  const [aba, setAba] = useState<'artigo' | 'historico'>('artigo');
  if (q.isLoading) return <Pagina titulo="Artigo"><Carregando /></Pagina>;
  if (q.isError || !q.data) {
    return (
      <Pagina titulo="Artigo" voltar={<Voltar rota="/base" texto="Base de conhecimento" />}>
        <Vazio titulo="Artigo não encontrado" texto="Ele pode ter ido para a lixeira, ou é um rascunho de outra pessoa." />
      </Pagina>
    );
  }
  const a = q.data;
  return (
    <Pagina
      voltar={<Voltar rota="/base" texto="Base de conhecimento" />}
      titulo={<span className="flex flex-wrap items-center gap-2"><CodigoArtigo codigo={a.codigo} className="text-[13px]" />{a.titulo}{a.situacao === 'rascunho' && <Chip tone="muted">rascunho</Chip>}</span>}
      acoes={<Acoes a={a} />}
    >
      <div className="mb-3"><Ligacoes ligacoes={a.ligacoes} comExtra /></div>
      {a.obrigatoria && <LeituraObrigatoria a={a} />}
      <Abas atual={aba} onChange={setAba} abas={[{ id: 'artigo' as const, label: 'Artigo' }, { id: 'historico' as const, label: <span className="inline-flex items-center gap-1.5"><History size={14} /> Histórico <span className="text-muted font-normal tnum">({a.versao} {a.versao === 1 ? 'versão' : 'versões'})</span></span> }]} />
      {aba === 'artigo' ? <><CorpoDoArtigo a={a} /><Comentarios a={a} /></> : <Historico a={a} />}
    </Pagina>
  );
}

/** O artigo desenhado (também é a prévia do formulário). */
export function CorpoDoArtigo({ a, prints: extras }: { a: Pick<Artigo, 'oQueAcontece' | 'comoResolver' | 'porQueAcontece' | 'palavrasDoCliente' | 'anexos'> & Partial<Pick<Artigo, 'autor' | 'criadoEm' | 'atualizadoPor' | 'atualizadoEm' | 'versao'>>; prints?: Record<string, string> }) {
  const prints = useMemo(() => ({ ...Object.fromEntries(a.anexos.filter((x) => x.inline).map((x) => [x.id, x.url])), ...(extras ?? {}) }), [a.anexos, extras]);
  const arquivos = a.anexos.filter((x) => !x.inline);
  const vazio = !a.oQueAcontece && !a.comoResolver && !a.porQueAcontece && !a.palavrasDoCliente.length;
  return (
    <article className="card p-4 sm:p-6 flex flex-col gap-6 max-w-4xl">
      {vazio && <p className="text-muted text-sm">Ainda sem texto. Este rascunho só tem o título.</p>}
      {a.oQueAcontece && <Parte titulo="O que acontece" dica="como o cliente conta"><TextoSimples texto={a.oQueAcontece} prints={prints} /></Parte>}
      {a.comoResolver && <Parte titulo="Como resolver"><TextoSimples texto={a.comoResolver} prints={prints} /></Parte>}
      {a.porQueAcontece && <Parte titulo="Por que acontece"><TextoSimples texto={a.porQueAcontece} prints={prints} /></Parte>}
      {a.palavrasDoCliente.length > 0 && (
        <Parte titulo="Palavras do cliente" dica="outros jeitos de dizer, para a busca achar">
          <div className="flex flex-wrap gap-1.5">{a.palavrasDoCliente.map((p) => <span key={p} className="chip bg-surface-2 text-ink-2 font-normal">{p}</span>)}</div>
        </Parte>
      )}
      {arquivos.length > 0 && (
        <Parte titulo="Anexos">
          <ul className="flex flex-col gap-1">
            {arquivos.map((x) => (
              <li key={x.id}><a className="link inline-flex items-center gap-1.5 text-[13.5px]" href={logoSrc(x.url) ?? x.url} download={x.fileName}><Paperclip size={13} /> {x.fileName}</a> <span className="text-muted text-[12px]">· {tamanho(x.sizeBytes)}</span></li>
            ))}
          </ul>
        </Parte>
      )}
      {a.criadoEm && (
        <footer className="text-[12.5px] text-muted border-t border-line pt-3">
          Escrito por {a.autor?.nome ?? '—'} em {data(a.criadoEm)}
          {/* "melhorado" quando o texto mudou (versão nova); "atualizado" quando só mudaram as ligações ou os anexos */}
          {a.atualizadoEm && a.atualizadoPor && Date.parse(a.atualizadoEm) - Date.parse(a.criadoEm) > 60_000
            ? ` · ${(a.versao ?? 1) > 1 ? 'melhorado' : 'atualizado'} por ${a.atualizadoPor} ${relativo(a.atualizadoEm)}` : ''}
          {a.versao ? ` · versão ${a.versao}` : ''}
        </footer>
      )}
    </article>
  );
}

export const tamanho = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`);

function Acoes({ a }: { a: Artigo }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [apagar, setApagar] = useState(false);
  const [pedir, setPedir] = useState(false);
  const recarregar = () => { void qc.invalidateQueries({ queryKey: ['base'] }); };
  const remover = useMutation({
    mutationFn: () => api.base.remover(a.numero),
    onSuccess: () => {
      // sai da página antes de recarregar (senão ela pede de novo o artigo que acabou de ir para a lixeira)
      navigate('/base');
      setTimeout(() => { qc.removeQueries({ queryKey: ['base', 'artigo'] }); recarregar(); }, 0);
      toast.push('ok', `${a.codigo} foi para a lixeira`);
    },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  const obrigatoria = useMutation({
    mutationFn: (ligar: boolean) => api.base.obrigatoria(a.numero, ligar),
    onSuccess: (_r, ligar) => { recarregar(); setPedir(false); toast.push('ok', ligar ? 'Leitura pedida: a equipe vê o aviso na base' : 'Não é mais leitura obrigatória'); },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  const copiarLink = async () => {
    // na prévia os endereços têm "#"; no sistema, não
    const url = IS_DEMO ? `${location.origin}${location.pathname}#/base/${a.numero}` : `${location.origin}/base/${a.numero}`;
    try { await navigator.clipboard.writeText(url); toast.push('ok', `Link do ${a.codigo} copiado`); } catch { toast.push('erro', 'Não deu para copiar: o código é ' + a.codigo); }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {a.podeEditar && <button className="btn-primary" onClick={() => navigate(`/base/${a.numero}/editar`)}><Pencil size={15} /> Editar</button>}
      <button className="btn-secondary" onClick={copiarLink} title="Para colar no card do LineChat ou no WhatsApp"><Link2 size={15} /> Copiar link</button>
      {a.podeCuidar && a.situacao === 'publicado' && (
        a.obrigatoria
          ? <button className="btn-secondary" onClick={() => setPedir(true)}><BookOpen size={15} /> Leitura obrigatória</button>
          : <button className="btn-secondary" onClick={() => setPedir(true)}><BookOpen size={15} /> Pedir leitura da equipe</button>
      )}
      {a.podeApagar && <button className="btn-ghost text-bad" onClick={() => setApagar(true)} aria-label="Mandar para a lixeira"><Trash2 size={15} /></button>}
      <Confirmar open={apagar} onClose={() => setApagar(false)} onConfirm={() => remover.mutate()} loading={remover.isPending} perigoso titulo={`Mandar ${a.codigo} para a lixeira`} botao="Mandar para a lixeira"
        texto={<>O artigo <b>{a.titulo}</b> sai da base para todo mundo. Dá para restaurar em Administração › Lixeira.</>} />
      <Modal open={pedir} onClose={() => setPedir(false)} titulo="Leitura obrigatória"
        rodape={<>
          <button className="btn-secondary" onClick={() => setPedir(false)}>Cancelar</button>
          {a.obrigatoria && <button className="btn-ghost" disabled={obrigatoria.isPending} onClick={() => obrigatoria.mutate(false)}>Não é mais obrigatória</button>}
          <button className="btn-primary" disabled={obrigatoria.isPending} onClick={() => obrigatoria.mutate(true)}>{obrigatoria.isPending ? <Spinner className="text-white" /> : a.obrigatoria ? 'Pedir a leitura de novo' : 'Pedir a leitura'}</button>
        </>}>
        <div className="text-[14px] flex flex-col gap-2">
          <p>Cada pessoa vê o aviso na Base de conhecimento (e o número no menu) até marcar <b>Li e entendi</b> neste artigo. Ele não abre sozinho no login, como a nota do patch.</p>
          {a.obrigatoria && <p className="text-muted">Pedir de novo serve para quando o artigo mudou: todo mundo, inclusive quem já leu, precisa ler outra vez.</p>}
        </div>
      </Modal>
    </div>
  );
}

function LeituraObrigatoria({ a }: { a: Artigo }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [li, setLi] = useState(false);
  const [quem, setQuem] = useState(false);
  const o = a.obrigatoria!;
  const marcar = useMutation({
    mutationFn: () => api.base.marcarLida(a.numero),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['base'] }); toast.push('ok', 'Leitura registrada'); },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  const leituras = useQuery({ queryKey: ['base', 'leituras', a.numero], queryFn: () => api.base.leituras(a.numero), enabled: quem });
  return (
    <div className={`card p-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] ${o.lidaPorMim ? '' : 'border-accent bg-accent-soft'}`}>
      <span className="flex items-center gap-2"><BookOpen size={16} className="text-accent" /><b>Leitura obrigatória</b>{o.por && <span className="text-muted">· pedida por {o.por} em {data(o.desde)}</span>}</span>
      {o.lidaPorMim
        ? <span className="flex items-center gap-1.5 text-ok"><Check size={15} /> Você já leu</span>
        : (
          <span className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={li} onChange={(e) => setLi(e.target.checked)} /> Li e entendi</label>
            <button className="btn-primary btn-sm" disabled={!li || marcar.isPending} onClick={() => marcar.mutate()}>{marcar.isPending ? <Spinner className="text-white" /> : 'Confirmar'}</button>
          </span>
        )}
      {a.podeCuidar && (
        <button className="btn-ghost btn-sm ml-auto" onClick={() => setQuem(true)}><Users size={14} /> <span className="tnum">{o.lidos} de {o.pessoas}</span> leram</button>
      )}
      <Modal open={quem} onClose={() => setQuem(false)} titulo={`Quem leu o ${a.codigo}`}>
        {leituras.isLoading ? <Carregando /> : leituras.data && (
          <div className="grid gap-4 sm:grid-cols-2 text-[13.5px]">
            <div>
              <div className="font-semibold mb-1">Leram ({leituras.data.lidos.length})</div>
              {leituras.data.lidos.length ? leituras.data.lidos.map((p) => <div key={p.nome}>{p.nome} <span className="text-muted">· {data(p.em, true)}</span></div>) : <div className="text-muted">Ninguém ainda.</div>}
            </div>
            <div>
              <div className="font-semibold mb-1">Faltam ({leituras.data.faltam.length})</div>
              {leituras.data.faltam.length ? leituras.data.faltam.map((p) => <div key={p.nome}>{p.nome}</div>) : <div className="text-muted">Ninguém: todo mundo leu.</div>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- os comentários ----------

/**
 * Pedido do Luan na prévia: comentar no artigo e ficar registrado. É o lugar do "aconteceu de novo,
 * era outra coisa", sem mexer no texto (corrigir o passo a passo é o Editar, que vira versão).
 */
function Comentarios({ a }: { a: Artigo }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [apagar, setApagar] = useState<string | null>(null);
  const recarregar = () => qc.invalidateQueries({ queryKey: ['base'] });
  const enviar = useMutation({
    mutationFn: () => api.base.comentar(a.numero, texto.trim()),
    onSuccess: () => { setTexto(''); void recarregar(); },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  const remover = useMutation({
    mutationFn: (id: string) => api.base.apagarComentario(a.numero, id),
    onSuccess: () => { setApagar(null); void recarregar(); toast.push('ok', 'Comentário apagado'); },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  return (
    <section className="card p-4 sm:p-6 mt-4 max-w-4xl">
      <h2 className="font-display font-semibold text-[15.5px] flex items-center gap-2"><MessageSquare size={16} className="text-muted" /> Comentários <span className="text-muted font-normal tnum">({a.comentarios.length})</span></h2>
      <p className="text-[12.5px] text-muted mt-0.5 mb-3">Aconteceu de novo? Achou outro jeito? Comente aqui: fica registrado quem e quando. Para corrigir o passo a passo, use <b>Editar</b>.</p>
      {a.podeComentar && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 mb-4">
          <textarea id="comentario-novo" className="input min-h-[38px] max-h-[200px] w-full sm:flex-1 sm:min-w-0 py-2" rows={2} maxLength={4000} value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim()) enviar.mutate(); }}
            placeholder="Ex.: aconteceu de novo na Clínica Aurora; desta vez era o cabo de rede" />
          <button className="btn-primary shrink-0 self-end sm:self-auto" disabled={!texto.trim() || enviar.isPending} onClick={() => enviar.mutate()} title="Ou Ctrl+Enter">
            {enviar.isPending ? <Spinner className="text-white" /> : <><Send size={15} /> Comentar</>}
          </button>
        </div>
      )}
      {!a.comentarios.length ? <p className="text-sm text-muted">Nenhum comentário ainda.</p> : (
        <ul className="flex flex-col divide-y divide-line">
          {a.comentarios.map((c) => (
            <li key={c.id} className="py-2.5 first:pt-0 last:pb-0 group">
              <div className="flex items-baseline gap-2 text-[13px]">
                <b>{c.autor}</b>
                <span className="text-muted text-[12px]" title={data(c.em, true)}>{relativo(c.em)}</span>
                {c.podeApagar && (
                  <button className="btn-ghost btn-sm text-bad ml-auto sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" onClick={() => setApagar(c.id)} aria-label="Apagar comentário"><Trash2 size={13} /></button>
                )}
              </div>
              <p className="text-[14px] text-ink-2 whitespace-pre-line break-words mt-0.5"><Linha texto={c.texto} /></p>
            </li>
          ))}
        </ul>
      )}
      <Confirmar open={apagar != null} onClose={() => setApagar(null)} onConfirm={() => remover.mutate(apagar!)} loading={remover.isPending} perigoso
        titulo="Apagar o comentário" botao="Apagar" texto="O comentário sai do artigo. A auditoria guarda o texto e quem apagou." />
    </section>
  );
}

// ---------- o histórico ----------

function Historico({ a }: { a: Artigo }) {
  const qc = useQueryClient();
  const toast = useToast();
  const v = useQuery({ queryKey: ['base', 'versoes', a.numero, a.versao], queryFn: () => api.base.versoes(a.numero) });
  // a versão escolhida é comparada com a anterior a ela
  const [escolhida, setEscolhida] = useState<number>(a.versao);
  const [voltar, setVoltar] = useState<number | null>(null);
  const anterior = escolhida - 1;
  const comp = useQuery({
    queryKey: ['base', 'comparar', a.numero, anterior, escolhida],
    queryFn: () => api.base.comparar(a.numero, anterior, escolhida),
    enabled: anterior >= 1,
  });
  const desfazer = useMutation({
    mutationFn: (versao: number) => api.base.voltarVersao(a.numero, versao),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['base'] }); setVoltar(null); setEscolhida(r.versao); toast.push('ok', `Voltou ao texto da versão ${voltar}: virou a versão ${r.versao}`); },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  if (v.isLoading || !v.data) return <Carregando />;
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] max-w-5xl">
      <ul className="card p-2 flex flex-col gap-0.5 self-start">
        {v.data.versoes.map((x) => (
          <li key={x.versao}>
            <button type="button" onClick={() => setEscolhida(x.versao)}
              className={`w-full text-left rounded-lg px-2.5 py-2 text-[13px] ${escolhida === x.versao ? 'bg-accent-soft text-accent-ink' : 'hover:bg-surface-2'}`}>
              <div className="font-semibold flex items-center gap-2">Versão {x.versao}{x.versao === v.data!.atual && <Chip tone="ok">atual</Chip>}</div>
              <div className="text-muted text-[12px]">{x.por ?? '—'} · {data(x.em, true)}</div>
              {x.nota && <div className="text-[12px] italic text-ink-2">{x.nota}</div>}
            </button>
          </li>
        ))}
      </ul>
      <div className="card p-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-display font-semibold">{anterior >= 1 ? `O que mudou da versão ${anterior} para a ${escolhida}` : 'A primeira versão'}</h2>
          {a.podeEditar && escolhida !== v.data.atual && (
            <button className="btn-secondary btn-sm" onClick={() => setVoltar(escolhida)}><RotateCcw size={14} /> Voltar a esta versão</button>
          )}
        </div>
        {anterior < 1 ? <p className="text-[13.5px] text-muted">É como o artigo nasceu. Escolha outra versão à esquerda para ver o que mudou nela.</p>
          : comp.isLoading || !comp.data ? <Carregando />
            : <Diferencas de={comp.data.de} para={comp.data.para} />}
      </div>
      <Confirmar open={voltar != null} onClose={() => setVoltar(null)} onConfirm={() => desfazer.mutate(voltar!)} loading={desfazer.isPending} titulo={`Voltar à versão ${voltar}`} botao="Voltar a esta versão"
        texto={<>O texto do artigo volta a ser o da versão {voltar}. Nada se perde: isso vira a versão {v.data.atual + 1}, e as do meio continuam aqui.</>} />
    </div>
  );
}

function Diferencas({ de, para }: { de: TextoVersao; para: TextoVersao }) {
  const partes = diferencaDasVersoes(de, para);
  if (!partes.length) return <p className="text-[13.5px] text-muted">O texto não mudou nesta versão.</p>;
  return (
    <div className="flex flex-col gap-4">
      {partes.map((p) => (
        <section key={p.parte}>
          <h3 className="text-[13px] font-semibold text-ink-2 mb-1">{p.nome}</h3>
          <div className="rounded-lg border border-line overflow-x-auto font-mono text-[12.5px] leading-relaxed">
            {p.linhas.map((l, i) => (
              <div key={i} className={`px-3 py-0.5 whitespace-pre-wrap ${l.tipo === 'saiu' ? 'bg-bad-soft text-bad line-through' : l.tipo === 'entrou' ? 'bg-ok-soft text-ok' : 'text-ink-2'}`}>
                <span className="select-none mr-2 opacity-70">{l.tipo === 'saiu' ? '−' : l.tipo === 'entrou' ? '+' : ' '}</span>{l.texto.replace(/\[print:[A-Za-z0-9_-]+\]/g, '[print]') || ' '}
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="text-[12px] text-muted">Riscado é o que saiu; em verde, o que entrou.</p>
    </div>
  );
}
