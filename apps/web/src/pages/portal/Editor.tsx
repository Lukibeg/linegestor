/**
 * Portal do cliente (Patch 1.8): escrever e melhorar um tutorial.
 *
 * O mesmo texto simples da base (linha com número vira passo, crases viram comando) e mais o que o
 * cliente precisa: **print** (colado com Ctrl+V, reduzido no navegador), **vídeo** (até 300 MB, fica
 * no servidor e toca no próprio portal) e **arquivo** para baixar (PDF, planilha… até 20 MB). O
 * arquivo sobe na hora em que entra no texto, com a barra de progresso; no texto fica só a marca
 * dele (`[video:…]`), no lugar onde estava o cursor.
 *
 * Cada tutorial é de um produto (ou de um módulo dele) — só os clientes que têm esse produto ativo
 * veem — ou "Geral", para todos. Rascunho o cliente não vê. Publicado, o link sai daqui mesmo:
 * Copiar ou WhatsApp, com a mensagem pronta.
 */
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Eye, FileUp, Film, ImagePlus, ListOrdered, Monitor, Paperclip, Pencil, Smartphone, SquareTerminal, Star, Trash2 } from 'lucide-react';
import { arquivosDoTexto, faltaParaPublicarTutorial, problemaDoArquivo, type TipoArquivoPortal } from '@gestor/shared';
import { api } from '../../api/index.js';
import type { ArquivoDoPortal, OpcoesPortal, Tutorial, TutorialGravar } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Campo, Carregando, Chip, Confirmar, mensagemErro, Modal, Spinner, Toggle, Vazio, useToast } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { relativo } from '../../lib/format.js';
import { Voltar } from '../../lib/voltar.js';
import { CorpoDoTutorial, mapaDeArquivos, tamanhoDoArquivo } from '../../portal/Corpo.js';
import { EtiquetaProduto } from '../../portal/comum.js';
import { MandarTutorial } from './Index.js';

type Form = { titulo: string; resumo: string; texto: string; produtoId: string; moduloId: string; destaque: boolean };
const VAZIO: Form = { titulo: '', resumo: '', texto: '', produtoId: '', moduloId: '', destaque: false };
type Envio = { ref: string; nome: string; tipo: TipoArquivoPortal; progresso: number };

const doTutorial = (t: Tutorial): Form => ({
  titulo: t.titulo, resumo: t.resumo ?? '', texto: t.texto ?? '', produtoId: t.produto?.id ?? '', moduloId: t.modulo?.id ?? '', destaque: t.destaque,
});

let seq = 0;
const novaRef = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;
const MARCA: Record<TipoArquivoPortal, string> = { imagem: 'print', video: 'video', arquivo: 'arquivo' };
const marcaDe = (a: Pick<ArquivoDoPortal, 'id' | 'tipo'>) => `[${MARCA[a.tipo]}:${a.id}]`;

/** O tipo pelo arquivo escolhido (arrastado ou colado): imagem vira print, vídeo vira vídeo, o resto é para baixar. */
const tipoPeloArquivo = (f: File): TipoArquivoPortal =>
  f.type.startsWith('image/') && f.type !== 'image/svg+xml' ? 'imagem' : f.type.startsWith('video/') ? 'video' : 'arquivo';

/**
 * Reduz o print no navegador (no máximo 1600 px; JPEG quando o PNG fica pesado) — a foto de 5 MB
 * do celular não sai do computador. O GIF fica como está (perderia o movimento).
 */
async function reduzirImagem(file: File): Promise<File> {
  if (file.type === 'image/gif') return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falhou) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falhou(new Error('Esta imagem não abriu. Tente outra (PNG ou JPG).')); i.src = url; });
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * escala));
    c.height = Math.max(1, Math.round(img.height * escala));
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Este navegador não conseguiu preparar a imagem.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = (tipo: string, q?: number) => new Promise<Blob>((ok, falhou) => c.toBlob((b) => (b ? ok(b) : falhou(new Error('Não deu para preparar a imagem.'))), tipo, q));
    let b = await blob('image/png');
    if (b.size > 1_500_000) b = await blob('image/jpeg', 0.85);
    const base = file.name && file.name !== 'image.png' ? file.name.replace(/\.[^.]+$/, '') : `print-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
    return new File([b], `${base}.${b.type === 'image/jpeg' ? 'jpg' : 'png'}`, { type: b.type });
  } finally { URL.revokeObjectURL(url); }
}

/** Novo e editar usam o mesmo formulário; a chave faz começar do zero ao trocar de um para outro. */
export function TutorialEditor() {
  const { numero } = useParams();
  return <Formulario key={numero ?? 'novo'} />;
}

function Formulario() {
  const { numero } = useParams();
  const editando = !!numero;
  const navigate = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const podeEscrever = can('portal.write');

  const existente = useQuery({ queryKey: ['portal-admin', 'tutorial', numero], queryFn: () => api.portalAdmin.tutorial(Number(numero)), enabled: editando, retry: false });
  const opcoes = useQuery({ queryKey: ['portal-admin', 'opcoes'], queryFn: () => api.portalAdmin.opcoes(), staleTime: 5 * 60_000 });

  const [f, setF] = useState<Form>(VAZIO);
  const [carregado, setCarregado] = useState(!editando);
  const [subidos, setSubidos] = useState<ArquivoDoPortal[]>([]);
  const [enviando, setEnviando] = useState<Envio[]>([]);
  const [previa, setPrevia] = useState<null | 'celular' | 'computador'>(podeEscrever ? null : 'computador');
  const [erro, setErro] = useState('');
  const [mexeu, setMexeu] = useState(false);
  /** acabou de publicar: o link pronto para mandar */
  const [pronto, setPronto] = useState(!!(loc.state as { publicado?: boolean } | null)?.publicado);
  const [apagar, setApagar] = useState(false);
  const versaoAberta = useRef<number | undefined>(undefined);
  const area = useRef<HTMLTextAreaElement>(null);

  const mudar = (o: Partial<Form>) => { setF((x) => ({ ...x, ...o })); setMexeu(true); };

  // editando: o formulário começa com o tutorial (uma vez só: a releitura não apaga o que a pessoa digitou)
  useEffect(() => {
    if (editando && existente.data && !carregado) {
      setF(doTutorial(existente.data));
      versaoAberta.current = existente.data.versao;
      setCarregado(true);
    }
  }, [editando, existente.data, carregado]);

  // não sair sem querer com o texto pela metade (nem com arquivo subindo)
  useEffect(() => {
    if (!mexeu && !enviando.length) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [mexeu, enviando.length]);

  const t = existente.data;
  const publicado = t?.situacao === 'publicado';
  const arquivos = useMemo(() => [...(t?.arquivos ?? []), ...subidos.filter((s) => !(t?.arquivos ?? []).some((a) => a.id === s.id))], [t, subidos]);
  const mapa = useMemo(() => mapaDeArquivos(arquivos), [arquivos]);

  const salvar = useMutation({
    mutationFn: (publicar: boolean) => {
      const d: TutorialGravar = {
        titulo: f.titulo, resumo: f.resumo || null, texto: f.texto || null, produtoId: f.produtoId || null, moduloId: f.moduloId || null,
        destaque: f.destaque, publicar, versao: versaoAberta.current,
      };
      return editando ? api.portalAdmin.atualizar(Number(numero), d) : api.portalAdmin.criar(d);
    },
    onSuccess: (r, publicar) => {
      setMexeu(false);
      setErro('');
      void qc.invalidateQueries({ queryKey: ['portal-admin'] });
      const primeiraVez = publicar && !publicado;
      if (!editando) {
        if (!publicar) toast.push('ok', `Rascunho salvo (#${r.numero}). O cliente ainda não vê.`);
        navigate(`/portal-do-cliente/${r.numero}`, { replace: true, state: { publicado: publicar } });
        return;
      }
      versaoAberta.current = r.versao;
      if (primeiraVez) setPronto(true);
      else toast.push('ok', publicar ? 'Salvo. O cliente já vê a versão nova.' : publicado ? 'Saiu do portal: voltou a rascunho.' : 'Rascunho salvo. O cliente ainda não vê.');
    },
    onError: (e) => setErro(mensagemErro(e)),
  });
  const remover = useMutation({
    mutationFn: () => api.portalAdmin.remover(Number(numero)),
    onSuccess: () => { setMexeu(false); void qc.invalidateQueries({ queryKey: ['portal-admin'] }); toast.push('ok', 'O tutorial foi para a lixeira (dá para restaurar em Administração › Lixeira).'); navigate('/portal-do-cliente'); },
    onError: (e) => { setApagar(false); setErro(mensagemErro(e)); },
  });

  // ---------- o texto e os arquivos ----------

  /** Põe um texto numa linha própria onde está o cursor. `recuo` deixa o cursor antes do fim (dentro das crases). */
  const inserir = (texto: string, recuo = 0) => {
    const el = area.current;
    setF((x) => {
      const v = x.texto;
      const ini = Math.min(el?.selectionStart ?? v.length, v.length);
      const fim = Math.min(el?.selectionEnd ?? v.length, v.length);
      const antes = v.slice(0, ini);
      const depois = v.slice(fim);
      const pre = antes && !antes.endsWith('\n') ? '\n' : '';
      const pos = depois && !depois.startsWith('\n') ? '\n' : '';
      const cursor = (antes + pre + texto).length - recuo;
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(cursor, cursor); });
      return { ...x, texto: `${antes}${pre}${texto}${pos}${depois}` };
    });
    setMexeu(true);
  };

  /** Sobe um arquivo: a marca provisória entra já no lugar do cursor e vira a de verdade quando o arquivo chega. */
  const subir = (file: File, tipo: TipoArquivoPortal) => {
    setErro('');
    if (tipo === 'imagem' && (!file.type.startsWith('image/') || file.type === 'image/svg+xml')) { setErro('No meio do texto só entra imagem PNG, JPG, WEBP ou GIF.'); return; }
    if (tipo !== 'imagem') {
      const p = problemaDoArquivo(tipo, file.type || 'application/octet-stream', file.size);
      if (p) { setErro(`“${file.name}”: ${p}`); return; }
    }
    const ref = novaRef();
    const provisoria = `[enviando:${ref}]`;
    inserir(provisoria);
    setEnviando((x) => [...x, { ref, nome: file.name || 'imagem colada', tipo, progresso: 0 }]);
    void (async () => {
      try {
        const final = tipo === 'imagem' ? await reduzirImagem(file) : file;
        const p = problemaDoArquivo(tipo, final.type || 'application/octet-stream', final.size);
        if (p) throw new Error(p);
        const a = await api.portalAdmin.subir(tipo, final, (v) => setEnviando((x) => x.map((e) => (e.ref === ref ? { ...e, progresso: v } : e))));
        setSubidos((x) => [...x, a]);
        setF((x) => ({ ...x, texto: x.texto.includes(provisoria) ? x.texto.replace(provisoria, marcaDe(a)) : `${x.texto.replace(/\s+$/, '')}\n${marcaDe(a)}` }));
      } catch (e) {
        setF((x) => ({ ...x, texto: x.texto.replace(provisoria, '').replace(/\n{3,}/g, '\n\n') }));
        setErro(`“${file.name || 'A imagem'}” não subiu: ${mensagemErro(e)}`);
      } finally {
        setEnviando((x) => x.filter((e) => e.ref !== ref));
      }
    })();
  };

  if (editando && existente.isError) return <Vazio titulo="Tutorial não encontrado" texto={mensagemErro(existente.error)} acao={<button className="btn-secondary" onClick={() => navigate('/portal-do-cliente')}>Voltar para os tutoriais</button>} />;
  if (editando && (existente.isLoading || !carregado)) return <Pagina titulo="Tutorial"><Carregando /></Pagina>;

  const falta = faltaParaPublicarTutorial({ titulo: f.titulo, texto: f.texto, resumo: f.resumo });
  const ocupado = salvar.isPending || enviando.length > 0;
  const porQue = enviando.length ? 'Espere o arquivo terminar de subir' : undefined;
  const citados = new Set(arquivosDoTexto(f.texto));
  const caminho = t?.caminho;

  return (
    <Pagina
      voltar={<Voltar rota="/portal-do-cliente" texto="Portal do cliente" />}
      titulo={editando ? <span className="flex flex-wrap items-center gap-2">{podeEscrever && <Pencil size={18} className="text-muted" />} Tutorial <span className="font-mono text-muted text-[15px]">#{t!.numero}</span>
        {publicado ? <Chip tone="ok">publicado</Chip> : <Chip tone="muted">rascunho · o cliente não vê</Chip>}</span> : 'Novo tutorial'}
      sub={editando
        ? `${t!.visualizacoes} ${t!.visualizacoes === 1 ? 'visualização' : 'visualizações'} · ${t!.atualizadoPor ?? t!.autor ?? 'alguém'} mexeu ${relativo(t!.atualizadoEm)}`
        : 'Escreva como você explicaria para o cliente pelo telefone: um passo por linha, com o print ou o vídeo de cada parte.'}
      acoes={<>
        {publicado && caminho && <MandarTutorial t={{ titulo: t!.titulo, caminho }} />}
        {podeEscrever && (
          <div className="flex rounded-lg border border-line-strong overflow-hidden" role="group" aria-label="Ver como fica">
            <button type="button" aria-pressed={!previa} onClick={() => setPrevia(null)} className={`px-3 py-1.5 text-sm inline-flex items-center gap-1.5 ${!previa ? 'bg-accent-soft text-accent-ink font-semibold' : 'text-ink-2 hover:bg-surface-2'}`}><Pencil size={14} /> Escrever</button>
            <button type="button" aria-pressed={previa === 'celular'} onClick={() => setPrevia('celular')} className={`px-3 py-1.5 text-sm inline-flex items-center gap-1.5 border-l border-line ${previa === 'celular' ? 'bg-accent-soft text-accent-ink font-semibold' : 'text-ink-2 hover:bg-surface-2'}`} title="Ver como fica no celular do cliente"><Smartphone size={14} /> Celular</button>
            <button type="button" aria-pressed={previa === 'computador'} onClick={() => setPrevia('computador')} className={`px-3 py-1.5 text-sm inline-flex items-center gap-1.5 border-l border-line ${previa === 'computador' ? 'bg-accent-soft text-accent-ink font-semibold' : 'text-ink-2 hover:bg-surface-2'}`} title="Ver como fica no computador do cliente"><Monitor size={14} /> Computador</button>
          </div>
        )}
        {editando && podeEscrever && <button className="btn-ghost text-bad" onClick={() => setApagar(true)} title="Mandar para a lixeira"><Trash2 size={15} /></button>}
      </>}
    >
      {previa ? (
        <VistaDoCliente f={f} opcoes={opcoes.data} mapa={mapa} celular={previa === 'celular'} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
          <div className="flex flex-col gap-4 min-w-0">
            <section className="card p-4 flex flex-col gap-4">
              <Campo label="Título" dica="do jeito que o cliente procuraria: “Como transferir uma ligação”">
                <input className="input text-[15px] font-semibold" id="tutorial-titulo" autoComplete="off" maxLength={160} value={f.titulo} onChange={(e) => mudar({ titulo: e.target.value })} autoFocus={!editando} />
              </Campo>
              <Campo label="Resumo" dica="uma frase: aparece na lista e no começo do tutorial">
                <input className="input" id="tutorial-resumo" autoComplete="off" maxLength={300} value={f.resumo} onChange={(e) => mudar({ resumo: e.target.value })} placeholder="Passe a ligação para outro ramal sem derrubar, em 3 toques." />
              </Campo>
              <AreaDoTexto area={area} valor={f.texto} onChange={(v) => mudar({ texto: v })} inserir={inserir} subir={subir} enviando={enviando} />
            </section>
            {arquivos.length > 0 && (
              <section className="card p-4 flex flex-col gap-2">
                <h2 className="font-display font-semibold text-[15px]">Arquivos deste tutorial</h2>
                <ul className="flex flex-col gap-1.5">
                  {arquivos.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-[13.5px] min-w-0">
                      {a.tipo === 'video' ? <Film size={14} className="text-muted shrink-0" /> : a.tipo === 'imagem' ? <ImagePlus size={14} className="text-muted shrink-0" /> : <Paperclip size={14} className="text-muted shrink-0" />}
                      <span className="truncate">{a.nome}</span><span className="text-muted text-[12px] shrink-0">· {tamanhoDoArquivo(a.tamanho)}</span>
                      {citados.has(a.id)
                        ? <Chip tone="ok" className="ml-auto shrink-0">no texto</Chip>
                        : <button type="button" className="btn-ghost btn-sm ml-auto shrink-0" onClick={() => inserir(marcaDe(a))} title="Pôr a marca do arquivo onde está o cursor">Pôr no texto</button>}
                    </li>
                  ))}
                </ul>
                <p className="text-[12px] text-muted">O cliente só vê o que está no texto. Os vídeos ficam no servidor e <b>não entram no backup diário</b>: guarde o arquivo original.</p>
              </section>
            )}
          </div>
          <aside className="flex flex-col gap-4">
            <QuemVe f={f} opcoes={opcoes.data} mudar={mudar} />
            <section className="card p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <span className="mt-0.5"><Toggle checked={f.destaque} onChange={(v) => mudar({ destaque: v })} /></span>
                <span className="min-w-0">
                  <span className="block font-semibold text-[14px]"><Star size={14} className="inline -mt-0.5 mr-1 text-signal" />Em destaque</span>
                  <span className="block text-[12.5px] text-muted">Aparece no começo da página inicial do portal (os 6 mais recentes).</span>
                </span>
              </label>
            </section>
          </aside>
        </div>
      )}

      {podeEscrever && (
        <div className="sticky bottom-0 z-10 mt-4 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-bg border-t border-line flex flex-wrap items-center gap-2">
          {erro && <p className="w-full text-bad text-[13.5px]" role="alert">{erro}</p>}
          {publicado ? (
            <>
              <button className="btn-primary" disabled={ocupado || !!falta} title={porQue ?? falta ?? 'O cliente vê a versão nova na hora'} onClick={() => { setErro(''); salvar.mutate(true); }}>{salvar.isPending && salvar.variables ? <Spinner className="text-white" /> : 'Salvar'}</button>
              <button className="btn-secondary" disabled={ocupado} title={porQue ?? 'Volta a rascunho: o cliente deixa de ver'} onClick={() => { setErro(''); salvar.mutate(false); }}>{salvar.isPending && !salvar.variables ? <Spinner /> : 'Tirar do portal'}</button>
            </>
          ) : (
            <>
              <button className="btn-primary" disabled={ocupado || !!falta} title={porQue ?? falta ?? 'Os clientes do produto passam a ver'} onClick={() => { setErro(''); salvar.mutate(true); }}>{salvar.isPending && salvar.variables ? <Spinner className="text-white" /> : 'Publicar'}</button>
              <button className="btn-secondary" disabled={ocupado || f.titulo.trim().length < 3} title={porQue ?? 'Só a equipe vê o rascunho'} onClick={() => { setErro(''); salvar.mutate(false); }}>{salvar.isPending && !salvar.variables ? <Spinner /> : 'Salvar rascunho'}</button>
            </>
          )}
          <button className="btn-ghost" onClick={() => navigate('/portal-do-cliente')}>{mexeu ? 'Cancelar' : 'Voltar'}</button>
          {enviando.length > 0 ? <span className="text-[12.5px] text-muted inline-flex items-center gap-1.5"><Spinner /> subindo {enviando.length === 1 ? 'o arquivo' : `${enviando.length} arquivos`}…</span>
            : falta && f.titulo.trim().length >= 3 && <span className="text-[12.5px] text-muted">{falta}</span>}
        </div>
      )}

      {pronto && caminho && (
        <Modal open onClose={() => setPronto(false)} titulo={<span className="flex items-center gap-2"><CheckCircle2 size={18} className="text-ok" /> Publicado no portal</span>} largura="max-w-md"
          rodape={<button className="btn-secondary" onClick={() => setPronto(false)}>Fechar</button>}>
          <div className="flex flex-col gap-3">
            <p className="text-[14px]">“{t?.titulo ?? f.titulo}” já aparece para {f.produtoId ? <>os clientes com <b>{nomeDoAlvo(f, opcoes.data)}</b></> : <b>todos os clientes</b>}. Mande o link:</p>
            <div className="flex flex-wrap gap-2"><MandarTutorial t={{ titulo: t?.titulo ?? f.titulo, caminho }} /></div>
            <p className="text-[12.5px] text-muted">Quem não estiver logado entra com o e-mail e a senha e cai direto no tutorial.</p>
          </div>
        </Modal>
      )}
      <Confirmar open={apagar} onClose={() => setApagar(false)} onConfirm={() => remover.mutate()} loading={remover.isPending} perigoso
        titulo="Mandar para a lixeira" botao="Mandar para a lixeira"
        texto={<>O tutorial sai do portal na hora (quem tiver o link vê “não está disponível”). Dá para restaurar em Administração › Lixeira.</>} />
    </Pagina>
  );
}

const nomeDoAlvo = (f: Pick<Form, 'produtoId' | 'moduloId'>, opcoes?: OpcoesPortal) => {
  const p = opcoes?.produtos.find((x) => x.id === f.produtoId);
  const m = p?.modulos.find((x) => x.id === f.moduloId);
  return p ? (m ? `${p.nome} e o módulo ${m.nome}` : p.nome) : 'o produto';
};

/** De quem é o tutorial: Geral (todos), um produto ou um módulo dele. */
function QuemVe({ f, opcoes, mudar }: { f: Form; opcoes?: OpcoesPortal; mudar: (o: Partial<Form>) => void }) {
  const produto = opcoes?.produtos.find((p) => p.id === f.produtoId);
  return (
    <section className="card p-4 flex flex-col gap-3">
      <h2 className="font-display font-semibold text-[15px]">Quem vê</h2>
      <Campo label="Produto">
        <select className="input" id="tutorial-produto" value={f.produtoId} onChange={(e) => mudar({ produtoId: e.target.value, moduloId: '' })}>
          <option value="">Geral — todos os clientes</option>
          {opcoes?.produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </Campo>
      {produto && produto.modulos.length > 0 && (
        <Campo label="Módulo" dica="opcional: o tutorial de uma parte do produto">
          <select className="input" id="tutorial-modulo" value={f.moduloId} onChange={(e) => mudar({ moduloId: e.target.value })}>
            <option value="">{produto.nome} inteiro</option>
            {produto.modulos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </Campo>
      )}
      <p className="text-[12.5px] text-muted">
        {!produto ? 'Todo cliente com acesso ao portal vê.' : f.moduloId ? `Só os clientes com ${nomeDoAlvo(f, opcoes)} ligados veem.` : `Só os clientes com ${produto.nome} ativo veem.`}
      </p>
    </section>
  );
}

/** O texto, com a barra: passo, comando, print, vídeo e arquivo. Também aceita colar o print e arrastar arquivos. */
function AreaDoTexto({ area, valor, onChange, inserir, subir, enviando }: {
  area: React.RefObject<HTMLTextAreaElement>; valor: string; onChange: (v: string) => void;
  inserir: (texto: string, recuo?: number) => void; subir: (f: File, tipo: TipoArquivoPortal) => void; enviando: Envio[];
}) {
  const escolher = useRef<HTMLInputElement>(null);
  const [tipoEscolhido, setTipoEscolhido] = useState<TipoArquivoPortal>('imagem');
  const [arrastando, setArrastando] = useState(false);
  const abrir = (tipo: TipoArquivoPortal) => { setTipoEscolhido(tipo); requestAnimationFrame(() => escolher.current?.click()); };
  const aceita: Record<TipoArquivoPortal, string> = { imagem: 'image/png,image/jpeg,image/webp,image/gif', video: 'video/mp4,video/webm,video/quicktime', arquivo: '' };
  const proximoPasso = () => {
    const nums = valor.split('\n').map((l) => /^\s*(\d{1,3})[.)]\s/.exec(l)?.[1]).filter(Boolean).map(Number);
    return (nums.length ? Math.max(...nums) : 0) + 1;
  };
  const comando = () => {
    const t = area.current;
    const sel = t ? valor.slice(t.selectionStart, t.selectionEnd) : '';
    if (t && sel && !sel.includes('\n')) { onChange(`${valor.slice(0, t.selectionStart)}\`${sel}\`${valor.slice(t.selectionEnd)}`); return; }
    inserir('``', 1);
  };
  const colar = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const arquivos = [...e.clipboardData.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((x): x is File => !!x);
    if (!arquivos.length) return;
    e.preventDefault();
    for (const a of arquivos) subir(a, tipoPeloArquivo(a));
  };
  const soltar = (e: DragEvent<HTMLTextAreaElement>) => {
    const arquivos = [...e.dataTransfer.files];
    setArrastando(false);
    if (!arquivos.length) return;
    e.preventDefault();
    for (const a of arquivos) subir(a, tipoPeloArquivo(a));
  };
  const botao = 'btn-ghost btn-sm';
  return (
    <Campo label="Passo a passo" dica="obrigatório para publicar (ou o resumo). Linha com número vira passo; o texto entre crases vira comando com o botão Copiar.">
      <div className="flex flex-wrap items-center gap-1 mb-1.5">
        {/* o mouseDown não tira o foco do texto: dá para clicar e já sair digitando */}
        <button type="button" className={botao} onMouseDown={(e) => e.preventDefault()} onClick={() => inserir(`${proximoPasso()}. `)} title="Linha que começa com número vira passo"><ListOrdered size={14} /> Passo</button>
        <button type="button" className={botao} onMouseDown={(e) => e.preventDefault()} onClick={comando} title="O texto entre crases vira comando com botão Copiar"><SquareTerminal size={14} /> Comando</button>
        <span className="w-px h-5 bg-line mx-0.5" aria-hidden />
        <button type="button" className={botao} onClick={() => abrir('imagem')} title="Ou cole o print direto no texto (Ctrl+V)"><ImagePlus size={14} /> Print</button>
        <button type="button" className={botao} onClick={() => abrir('video')} title="MP4 (o melhor), WebM ou MOV, até 300 MB"><Film size={14} /> Vídeo</button>
        <button type="button" className={botao} onClick={() => abrir('arquivo')} title="PDF, planilha, manual… até 20 MB"><FileUp size={14} /> Arquivo</button>
        <span className="text-[12px] text-muted ml-1 hidden sm:inline">ou cole (<span className="kbd">Ctrl</span>+<span className="kbd">V</span>) e arraste para cá</span>
        <input ref={escolher} type="file" className="hidden" accept={aceita[tipoEscolhido] || undefined} multiple={tipoEscolhido !== 'video'}
          onChange={(e) => { const lista = [...(e.target.files ?? [])]; e.target.value = ''; for (const a of lista) subir(a, tipoEscolhido); }} />
      </div>
      <textarea ref={area} id="tutorial-texto" spellCheck rows={14}
        className={`input font-[inherit] text-[14px] leading-relaxed ${arrastando ? 'border-accent ring-2 ring-accent/30 bg-accent-soft' : ''}`}
        value={valor} onChange={(e) => onChange(e.target.value)} onPaste={colar}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true); } }} onDragLeave={() => setArrastando(false)} onDrop={soltar}
        placeholder={'Assista (10 segundos):\n(o vídeo entra aqui pelo botão Vídeo)\n\n1. Com a ligação em andamento, aperte TRANSF.\n2. Digite o número do ramal.\n3. Aperte TRANSF de novo.'} />
      {enviando.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5" aria-live="polite">
          {enviando.map((e) => (
            <li key={e.ref} className="flex items-center gap-2 text-[12.5px]">
              {e.tipo === 'video' ? <Film size={13} className="text-muted shrink-0" /> : e.tipo === 'imagem' ? <ImagePlus size={13} className="text-muted shrink-0" /> : <Paperclip size={13} className="text-muted shrink-0" />}
              <span className="truncate max-w-[220px]">{e.nome}</span>
              <span className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden min-w-[80px]"><span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(e.progresso * 100)}%` }} /></span>
              <span className="tnum text-muted w-10 text-right">{Math.round(e.progresso * 100)}%</span>
            </li>
          ))}
          {enviando.some((e) => e.tipo === 'video') && <li className="text-[12px] text-muted">Vídeo grande demora um pouco: pode continuar escrevendo. Guarde o original — os vídeos não entram no backup diário.</li>}
        </ul>
      )}
    </Campo>
  );
}

/** Como o cliente vê: no celular (a moldura de um telefone) ou no computador. */
function VistaDoCliente({ f, opcoes, mapa, celular }: { f: Form; opcoes?: OpcoesPortal; mapa: ReturnType<typeof mapaDeArquivos>; celular: boolean }) {
  const titulo = useQuery({ queryKey: ['portal-admin', 'ajustes'], queryFn: () => api.portalAdmin.ajustes(), staleTime: 5 * 60_000 }).data?.titulo ?? 'Central de ajuda';
  const p = opcoes?.produtos.find((x) => x.id === f.produtoId);
  const m = p?.modulos.find((x) => x.id === f.moduloId);
  const conteudo = (
    <div className="flex flex-col gap-3">
      <EtiquetaProduto t={{ produto: p ? { id: p.id, nome: p.nome, cor: p.cor } : null, modulo: m ? { id: m.id, nome: m.nome } : null }} />
      <h1 className={`font-display font-semibold leading-tight ${celular ? 'text-[22px]' : 'text-[26px]'}`}>{f.titulo || <span className="text-muted">(sem título)</span>}</h1>
      {f.resumo && <p className="text-[16px] text-ink-2">{f.resumo}</p>}
      <div className="card p-4 sm:p-5 mt-1">{f.texto.trim() ? <CorpoDoTutorial texto={f.texto} arquivos={mapa} /> : <p className="text-muted text-[14px]">(o passo a passo aparece aqui)</p>}</div>
    </div>
  );
  if (!celular) return <div className="card p-5 sm:p-8 bg-bg max-w-4xl">{conteudo}</div>;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-[390px] max-w-full h-[720px] max-h-[75vh] rounded-[34px] border-[10px] border-ink/85 bg-bg overflow-y-auto shadow-xl">
        <div className="sticky top-0 z-10 h-11 bg-surface/95 backdrop-blur border-b border-line flex items-center px-4 text-[13px] font-display font-semibold truncate">{titulo}</div>
        <div className="p-4">{conteudo}</div>
      </div>
      <p className="text-[12px] text-muted inline-flex items-center gap-1.5"><Eye size={13} /> Assim o cliente vê no celular (a moldura é só para ilustrar).</p>
    </div>
  );
}
