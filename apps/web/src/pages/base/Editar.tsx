/**
 * Base de conhecimento (Patch 1.8): escrever e melhorar um artigo.
 *
 * Texto simples, como o Luan escolheu: linha que começa com número vira passo, o que está entre
 * crases vira comando com Copiar, e o print entra colando (Ctrl+V) — reduzido no navegador, como o
 * print das Novidades. Vindo de um chamado ("Registrar na base"), o título, a descrição e as
 * ligações já chegam preenchidos; com a IA ligada, ela escreve o rascunho a partir do card (com o
 * "Desfazer", e a pessoa revisa antes de publicar).
 *
 * Rascunho só a pessoa (e quem cuida da base) vê; publicar exige o "Como resolver". Qualquer um
 * que escreve melhora o artigo de qualquer um: se outra pessoa salvou no meio, o servidor avisa.
 * Quem cuida da base pede a leitura obrigatória já aqui, junto com o publicar (pedido do Luan na
 * prévia: "preencher dentro, na hora de realizar").
 */
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, Bot, Eye, ImagePlus, ListOrdered, Paperclip, Pencil, Plus, SquareTerminal, Undo2, X } from 'lucide-react';
import { TIPOS_LIGACAO, NOMES_LIGACAO, faltaParaPublicar } from '@gestor/shared';
import { api } from '../../api/index.js';
import type { AnexoArtigo, Artigo, ArtigoGravar, LigacaoMostrada, OpcoesBase, TipoLigacao } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Campo, Carregando, EscolherComBusca, Spinner, mensagemErro, useToast } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { Voltar } from '../../lib/voltar.js';
import { CorpoDoArtigo, tamanho } from './Artigo.js';
import { CodigoArtigo, EtiquetaLigacao, ICONE_LIGACAO, telaLarga } from './partes.js';

type Novo = { ref: string; fileName: string; conteudo: string; inline: boolean; sizeBytes: number };
type Form = {
  titulo: string; oQueAcontece: string; comoResolver: string; porQueAcontece: string;
  palavras: string[]; ligacoes: LigacaoMostrada[];
};
const VAZIO: Form = { titulo: '', oQueAcontece: '', comoResolver: '', porQueAcontece: '', palavras: [], ligacoes: [] };
const LIMITE_ARQUIVO = 10 * 1024 * 1024;

const doArtigo = (a: Artigo): Form => ({
  titulo: a.titulo, oQueAcontece: a.oQueAcontece ?? '', comoResolver: a.comoResolver ?? '', porQueAcontece: a.porQueAcontece ?? '',
  palavras: a.palavrasDoCliente, ligacoes: a.ligacoes,
});

const juntarLigacoes = (a: LigacaoMostrada[], b: LigacaoMostrada[]) => [...new Map([...a, ...b].map((l) => [`${l.tipo}:${l.alvo}`, l])).values()];

/** Reduz o print no navegador (no máximo 1280 px; JPEG quando o PNG fica pesado), como o print das Novidades. */
async function reduzirImagem(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falhou) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falhou(new Error('imagem inválida')); i.src = url; });
    const escala = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * escala));
    c.height = Math.max(1, Math.round(img.height * escala));
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Este navegador não conseguiu preparar a imagem.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const png = c.toDataURL('image/png');
    return png.length > 600_000 ? c.toDataURL('image/jpeg', 0.85) : png;
  } finally { URL.revokeObjectURL(url); }
}

const lerArquivo = (file: File) => new Promise<string>((ok, falhou) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => falhou(new Error('não deu para ler o arquivo')); r.readAsDataURL(file); });
let seq = 0;
const novaRef = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Novo artigo e editar usam o mesmo formulário: a chave (o número, ou o endereço do novo) faz o
 * formulário começar do zero ao trocar de um para outro, sem levar o texto do anterior.
 */
export function ArtigoEditor() {
  const { numero } = useParams();
  const { search } = useLocation();
  return <Formulario key={numero ? `editar-${numero}` : `novo${search}`} />;
}

function Formulario() {
  const { numero } = useParams();
  const editando = !!numero;
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const podeCuidar = can('knowledge.manage');

  const existente = useQuery({ queryKey: ['base', 'artigo', numero], queryFn: () => api.base.get(numero!), enabled: editando });
  const opcoes = useQuery({ queryKey: ['base', 'opcoes'], queryFn: () => api.base.opcoes(), staleTime: 5 * 60_000 });
  const ia = useQuery({ queryKey: ['base', 'ia'], queryFn: () => api.base.ia(), staleTime: 5 * 60_000 });

  const [f, setF] = useState<Form>(VAZIO);
  const [carregado, setCarregado] = useState(!editando);
  const [novos, setNovos] = useState<Novo[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [previa, setPrevia] = useState(false);
  const [erro, setErro] = useState('');
  const [mexeu, setMexeu] = useState(false);
  const [chamado, setChamado] = useState(sp.get('chamado') ?? '');
  /** pedir a leitura obrigatória junto com o publicar (só quem cuida da base) */
  const [pedirLeitura, setPedirLeitura] = useState(false);
  /** o formulário de antes da IA escrever (para o "Desfazer") e o aviso do que ela fez */
  const [antesDaIa, setAntesDaIa] = useState<Form | null>(null);
  const [avisoIa, setAvisoIa] = useState('');
  const versaoAberta = useRef<number | undefined>(undefined);

  const mudar = (o: Partial<Form>) => { setF((x) => ({ ...x, ...o })); setMexeu(true); };

  // editando: o formulário começa com o artigo (uma vez só: a releitura não apaga o que a pessoa digitou)
  useEffect(() => {
    if (editando && existente.data && !carregado) {
      setF(doArtigo(existente.data));
      versaoAberta.current = existente.data.versao;
      setCarregado(true);
    }
  }, [editando, existente.data, carregado]);

  // artigo novo: o que veio no endereço (o título da busca vazia, o projeto)
  useEffect(() => {
    if (editando || !opcoes.data) return;
    const titulo = sp.get('titulo');
    const projeto = sp.get('projeto');
    const p = projeto ? opcoes.data.projetos.find((x) => x.id === projeto) : null;
    setF((x) => ({
      ...x,
      titulo: x.titulo || titulo || '',
      ligacoes: p ? juntarLigacoes(x.ligacoes, [{ tipo: 'projeto', alvo: p.id, nome: p.nome, extra: null, href: `/projetos/${p.id}`, existe: true }]) : x.ligacoes,
    }));
  }, [editando, opcoes.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Registrar na base" a partir do chamado: título, descrição e ligações do card
  const trazer = useMutation({
    mutationFn: (ref: string) => api.base.doChamado(ref),
    onSuccess: (r) => {
      setChamado(r.chamado.key ?? r.chamado.id);
      setF((x) => ({
        ...x,
        titulo: x.titulo || r.titulo,
        oQueAcontece: x.oQueAcontece || r.oQueAcontece || '',
        ligacoes: juntarLigacoes(x.ligacoes, r.ligacoes),
      }));
    },
    onError: (e) => setErro(mensagemErro(e)),
  });
  // a IA escreve o rascunho a partir do card: preenche o que vier (o que ela não mandar fica como estava)
  const escreverComIa = useMutation({
    mutationFn: () => api.base.rascunhoIa(chamado.trim()),
    onSuccess: (r) => {
      setAntesDaIa(f);
      setF((x) => ({
        ...x,
        titulo: r.titulo || x.titulo,
        oQueAcontece: r.oQueAcontece || x.oQueAcontece,
        comoResolver: r.comoResolver || x.comoResolver,
        porQueAcontece: r.porQueAcontece || x.porQueAcontece,
        palavras: r.palavrasDoCliente.length ? [...new Set([...x.palavras, ...r.palavrasDoCliente])] : x.palavras,
      }));
      setMexeu(true);
      const custo = r.custo == null ? '' : ` — custou uns US$ ${r.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
      setAvisoIa(`A IA (${r.modelo}) escreveu o rascunho a partir do card${custo}. Revise antes de publicar: onde faltou informação, ela escreveu [completar: …].`);
    },
    onError: (e) => setErro(mensagemErro(e)),
  });
  const pediuDoChamado = useRef(false);
  useEffect(() => {
    const ref = sp.get('chamado');
    if (!editando && ref && !pediuDoChamado.current) { pediuDoChamado.current = true; trazer.mutate(ref); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // não sair sem querer com o texto pela metade
  useEffect(() => {
    if (!mexeu) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [mexeu]);

  const salvar = useMutation({
    mutationFn: (publicar: boolean) => {
      const d: ArtigoGravar = {
        titulo: f.titulo, oQueAcontece: f.oQueAcontece || null, comoResolver: f.comoResolver || null, porQueAcontece: f.porQueAcontece || null,
        palavrasDoCliente: f.palavras, ligacoes: f.ligacoes.map((l) => ({ tipo: l.tipo, alvo: l.alvo })), publicar,
        anexosNovos: novos.map(({ ref, fileName, conteudo, inline }) => ({ ref, fileName, conteudo, inline })),
        anexosRemovidos: removidos, versao: versaoAberta.current,
        pedirLeitura: publicar && pedirLeitura && podeCuidar,
      };
      return editando ? api.base.atualizar(Number(existente.data!.numero), d) : api.base.criar(d);
    },
    onSuccess: (r, publicar) => {
      setMexeu(false);
      void qc.invalidateQueries({ queryKey: ['base'] });
      const pediu = pedirLeitura && podeCuidar;
      const jaEraPublicado = existente.data?.situacao === 'publicado';
      toast.push('ok', !publicar
        ? `${r.codigo} salvo como rascunho${pediu ? ' (a leitura da equipe fica para quando publicar)' : ''}`
        : pediu
          ? `${r.codigo} ${jaEraPublicado ? 'salvo' : 'publicado'} e a leitura ${existente.data?.obrigatoria ? 'pedida de novo' : 'pedida para a equipe'}`
          : `${r.codigo} ${jaEraPublicado ? 'salvo' : 'publicado para a equipe'}`);
      navigate(`/base/${r.numero}`);
    },
    onError: (e) => setErro(mensagemErro(e)),
  });

  if (editando && (existente.isLoading || !carregado)) return <Pagina titulo="Editar artigo"><Carregando /></Pagina>;
  const a = existente.data;
  const publicado = a?.situacao === 'publicado';
  const anexosGuardados = (a?.anexos ?? []).filter((x) => !removidos.includes(x.id));
  const falta = faltaParaPublicar({ titulo: f.titulo, comoResolver: f.comoResolver });
  const prints = Object.fromEntries(novos.filter((n) => n.inline).map((n) => [n.ref, n.conteudo]));

  /** Guarda um print novo e devolve o marcador que vai no texto. */
  const guardarPrint = async (file: File) => {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') { setErro('No meio do texto só entra imagem (PNG, JPG, WEBP). Outros arquivos vão em Anexos.'); return null; }
    try {
      const conteudo = await reduzirImagem(file);
      const ref = novaRef();
      setNovos((x) => [...x, { ref, fileName: file.name && file.name !== 'image.png' ? file.name : `print-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${conteudo.startsWith('data:image/jpeg') ? 'jpg' : 'png'}`, conteudo, inline: true, sizeBytes: Math.round(conteudo.length * 0.75) }]);
      return `[print:${ref}]`;
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não deu para ler a imagem.'); return null; }
  };

  return (
    <Pagina
      voltar={<Voltar rota={editando ? `/base/${numero}` : '/base'} texto={editando ? `Voltar para o ${a?.codigo ?? 'artigo'}` : 'Base de conhecimento'} />}
      titulo={editando ? <span className="flex items-center gap-2"><Pencil size={18} className="text-muted" /> Editar <CodigoArtigo codigo={a!.codigo} className="text-[13px]" /></span> : 'Novo artigo'}
      sub={editando ? 'O que você mudar vira uma versão nova; a anterior fica no Histórico.' : 'Registre do jeito que o próximo vai procurar. Só o título e o "Como resolver" são obrigatórios para publicar.'}
      acoes={<button className={previa ? 'btn-primary' : 'btn-secondary'} onClick={() => setPrevia((v) => !v)}>{previa ? <><Pencil size={15} /> Voltar a escrever</> : <><Eye size={15} /> Ver como fica</>}</button>}
    >
      {previa ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">{f.titulo || <span className="text-muted">(sem título)</span>}</h2>
          <div className="flex flex-wrap gap-1.5">{f.ligacoes.map((l) => <EtiquetaLigacao key={`${l.tipo}:${l.alvo}`} l={l} />)}</div>
          <CorpoDoArtigo a={{ oQueAcontece: f.oQueAcontece || null, comoResolver: f.comoResolver || null, porQueAcontece: f.porQueAcontece || null, palavrasDoCliente: f.palavras, anexos: anexosGuardados }} prints={prints} />
        </div>
      ) : (
        <div className="grid gap-4 max-w-4xl">
          {!editando && (
            <section className="card p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <Campo label="Veio de um chamado?" className="flex-1 min-w-[220px]">
                  <input className="input font-mono" id="artigo-chamado" placeholder="IS-3607" value={chamado} onChange={(e) => setChamado(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && chamado.trim()) { e.preventDefault(); trazer.mutate(chamado.trim()); } }} />
                </Campo>
                <button className="btn-secondary" disabled={!chamado.trim() || trazer.isPending} onClick={() => trazer.mutate(chamado.trim())}>{trazer.isPending ? <Spinner /> : 'Trazer o que o card tem'}</button>
                {ia.data?.ativa && (
                  <button className="btn-secondary" id="rascunho-ia" disabled={!chamado.trim() || escreverComIa.isPending} onClick={() => { setErro(''); escreverComIa.mutate(); }}
                    title={`A IA (${ia.data.modelo}) lê o card — título, descrição, campos e etapas — e escreve o rascunho; você revisa`}>
                    {escreverComIa.isPending ? <Spinner /> : <Bot size={15} />} Escrever o rascunho com a IA
                  </button>
                )}
              </div>
              <p className="text-[12.5px] text-muted">O código do card, como IS-3607: o título, a descrição e as ligações (cliente, assunto, produto) vêm junto. Nada muda no LineChat.</p>
              {avisoIa && (
                <p className="text-[13px] rounded-lg bg-accent-soft text-accent-ink p-2.5 flex flex-wrap items-center gap-2" role="status">
                  <Bot size={14} className="shrink-0" /> <span className="flex-1 min-w-[200px]">{avisoIa}</span>
                  {antesDaIa && (
                    <button className="link font-semibold inline-flex items-center gap-1"
                      onClick={() => {
                        // volta só o que a IA escreveu: as ligações (e o resto) ficam como estão
                        const a = antesDaIa;
                        setF((x) => ({ ...x, titulo: a.titulo, oQueAcontece: a.oQueAcontece, comoResolver: a.comoResolver, porQueAcontece: a.porQueAcontece, palavras: a.palavras }));
                        setAntesDaIa(null); setAvisoIa('');
                      }}>
                      <Undo2 size={13} /> Desfazer
                    </button>
                  )}
                </p>
              )}
            </section>
          )}

          <section className="card p-4 flex flex-col gap-4">
            <Campo label="Título" dica="do jeito que alguém procuraria: “Ligação cai sempre aos 32 segundos”">
              <input className="input text-[15px] font-semibold" id="artigo-titulo" autoComplete="off" maxLength={200} value={f.titulo} onChange={(e) => mudar({ titulo: e.target.value })} autoFocus={!editando && !sp.get('chamado') && telaLarga()} />
            </Campo>
            <AreaDeTexto id="artigo-acontece" rotulo="O que acontece" dica="o sintoma, nas palavras do cliente" linhas={3} valor={f.oQueAcontece} onChange={(v) => mudar({ oQueAcontece: v })} guardarPrint={guardarPrint} />
            <AreaDeTexto id="artigo-resolver" rotulo="Como resolver" dica="obrigatório para publicar" linhas={9} valor={f.comoResolver} onChange={(v) => mudar({ comoResolver: v })} guardarPrint={guardarPrint} comBarra
              exemplo={'1. Ligar para o ramal e cronometrar.\n2. No roteador da unidade, desligar o SIP ALG.\n`asterisk -rx "pjsip show contacts"`\n3. Fazer uma ligação de teste.'} />
            <AreaDeTexto id="artigo-porque" rotulo="Por que acontece" dica="opcional — é o que ensina a reconhecer o problema da próxima vez" linhas={3} valor={f.porQueAcontece} onChange={(v) => mudar({ porQueAcontece: v })} guardarPrint={guardarPrint} />
            <Palavras valor={f.palavras} onChange={(v) => mudar({ palavras: v })} />
          </section>

          <section className="card p-4 flex flex-col gap-3">
            <div>
              <h2 className="font-display font-semibold">Onde acontece</h2>
              <p className="text-[13px] text-muted">É pelas ligações que o artigo aparece na ficha do cliente, no pop-up do modelo, no circuito e no chamado.</p>
            </div>
            {opcoes.data && <EscolherLigacoes opcoes={opcoes.data} valor={f.ligacoes} onChange={(v) => mudar({ ligacoes: v })} />}
          </section>

          <Anexos guardados={anexosGuardados} novos={novos.filter((n) => !n.inline)}
            onTirarGuardado={(id) => { setRemovidos((x) => [...x, id]); setMexeu(true); }}
            onTirarNovo={(ref) => setNovos((x) => x.filter((n) => n.ref !== ref))}
            onAnexar={async (file) => {
              if (file.size > LIMITE_ARQUIVO) { setErro(`"${file.name}" passa de 10 MB. Arquivo grande (firmware, vídeo) vai por link no texto.`); return; }
              try { const conteudo = await lerArquivo(file); setNovos((x) => [...x, { ref: novaRef(), fileName: file.name, conteudo, inline: false, sizeBytes: file.size }]); setMexeu(true); }
              catch { setErro(`Não deu para ler "${file.name}".`); }
            }} />

          {podeCuidar && <PedirLeitura marcado={pedirLeitura} onChange={setPedirLeitura} a={a} />}
        </div>
      )}

      {/* os botões e o erro ficam juntos: o erro aparece perto de quem o causou */}
      <div className="sticky bottom-0 z-10 mt-4 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-bg border-t border-line flex flex-wrap items-center gap-2">
        {erro && <p className="w-full text-bad text-[13.5px]" role="alert">{erro}</p>}
        {publicado ? (
          <button className="btn-primary" disabled={salvar.isPending || !!falta} title={falta ?? undefined} onClick={() => { setErro(''); salvar.mutate(true); }}>{salvar.isPending ? <Spinner className="text-white" /> : pedirLeitura && podeCuidar ? 'Salvar e pedir a leitura' : 'Salvar'}</button>
        ) : (
          <>
            <button className="btn-primary" disabled={salvar.isPending || !!falta} title={falta ?? 'Publicar para a equipe toda'} onClick={() => { setErro(''); salvar.mutate(true); }}>{salvar.isPending && salvar.variables ? <Spinner className="text-white" /> : pedirLeitura && podeCuidar ? 'Publicar e pedir a leitura' : 'Publicar'}</button>
            <button className="btn-secondary" disabled={salvar.isPending || f.titulo.trim().length < 3} title="Só você (e quem cuida da base) vê o rascunho" onClick={() => { setErro(''); salvar.mutate(false); }}>{salvar.isPending && !salvar.variables ? <Spinner /> : 'Salvar rascunho'}</button>
          </>
        )}
        <button className="btn-ghost" onClick={() => navigate(editando ? `/base/${numero}` : '/base')}>Cancelar</button>
        {falta && f.titulo.trim().length >= 3 && <span className="text-[12.5px] text-muted">{falta}</span>}
      </div>
    </Pagina>
  );
}

// ---------- a leitura obrigatória, já no formulário ----------

/**
 * Pedido do Luan na prévia: marcar a leitura obrigatória na hora de escrever, sem precisar abrir o
 * artigo depois. Só quem cuida da base vê; vale ao publicar (o rascunho só a pessoa vê). Num artigo
 * que já é de leitura obrigatória, é o "pedir de novo" (todo mundo lê outra vez).
 */
function PedirLeitura({ marcado, onChange, a }: { marcado: boolean; onChange: (v: boolean) => void; a?: Artigo }) {
  const publicado = a?.situacao === 'publicado';
  const ja = a?.obrigatoria;
  return (
    <section className={`card p-4 ${marcado ? 'border-accent bg-accent-soft' : ''}`}>
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" className="mt-1 shrink-0" id="artigo-pedir-leitura" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
        <span className="min-w-0">
          <span className="block font-display font-semibold"><BookOpen size={16} className="inline -mt-0.5 mr-1.5 text-accent" aria-hidden />{ja ? 'Pedir a leitura da equipe de novo' : 'Pedir a leitura da equipe (leitura obrigatória)'}</span>
          <span className="block text-[13px] text-muted mt-0.5">
            {ja
              ? <>Este artigo já é de leitura obrigatória ({ja.lidos} de {ja.pessoas} leram). Marque se a mudança é importante: ao salvar, todo mundo precisa ler outra vez.</>
              : <>{publicado ? 'Ao salvar' : 'Ao publicar'}, o artigo aparece em destaque na base e com um número no menu de cada pessoa, até ela marcar <b>Li e entendi</b>.{!publicado && ' No rascunho não vale: só você vê.'}</>}
          </span>
        </span>
      </label>
    </section>
  );
}

// ---------- o texto, com a barra de passos, comando e print ----------

function AreaDeTexto({ id, rotulo, dica, linhas, valor, onChange, guardarPrint, comBarra, exemplo }: {
  id: string; rotulo: string; dica: string; linhas: number; valor: string; onChange: (v: string) => void;
  guardarPrint: (file: File) => Promise<string | null>; comBarra?: boolean; exemplo?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  /** Põe um texto onde está o cursor (numa linha própria, quando é passo, comando ou print). `recuo` deixa o cursor antes do fim (dentro das crases). */
  const inserir = (texto: string, linhaPropria = true, recuo = 0) => {
    const t = ref.current;
    const ini = t?.selectionStart ?? valor.length;
    const fim = t?.selectionEnd ?? valor.length;
    const antes = valor.slice(0, ini);
    const depois = valor.slice(fim);
    const pre = linhaPropria && antes && !antes.endsWith('\n') ? '\n' : '';
    const pos = linhaPropria && depois && !depois.startsWith('\n') ? '\n' : '';
    const novo = `${antes}${pre}${texto}${pos}${depois}`;
    onChange(novo);
    const cursor = (antes + pre + texto).length - recuo;
    requestAnimationFrame(() => { t?.focus(); t?.setSelectionRange(cursor, cursor); });
  };
  const colar = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const img = [...e.clipboardData.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (!img) return;
    e.preventDefault();
    const file = img.getAsFile();
    if (!file) return;
    const marcador = await guardarPrint(file);
    if (marcador) inserir(marcador);
  };
  const proximoPasso = () => {
    const nums = valor.split('\n').map((l) => /^\s*(\d{1,3})[.)]\s/.exec(l)?.[1]).filter(Boolean).map(Number);
    return (nums.length ? Math.max(...nums) : 0) + 1;
  };
  const comando = () => {
    const t = ref.current;
    const sel = t ? valor.slice(t.selectionStart, t.selectionEnd) : '';
    if (sel && !sel.includes('\n')) {
      const ini = t!.selectionStart;
      onChange(`${valor.slice(0, ini)}\`${sel}\`${valor.slice(t!.selectionEnd)}`);
      return;
    }
    // sem nada selecionado: as duas crases numa linha própria, com o cursor no meio para já digitar o comando
    inserir('``', true, 1);
  };
  return (
    <Campo label={rotulo} dica={dica}>
      {comBarra && (
        <div className="flex flex-wrap items-center gap-1 mb-1.5">
          {/* o mouseDown não tira o foco do texto: dá para clicar e já sair digitando */}
          <button type="button" className="btn-ghost btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => inserir(`${proximoPasso()}. `)} title="Linha que começa com número vira passo"><ListOrdered size={14} /> Passo</button>
          <button type="button" className="btn-ghost btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={comando} title="O texto entre crases vira comando com botão Copiar"><SquareTerminal size={14} /> Comando</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => arquivo.current?.click()} title="Ou cole o print direto no texto (Ctrl+V)"><ImagePlus size={14} /> Print</button>
          <span className="text-[12px] text-muted ml-1">ou cole o print com <span className="kbd">Ctrl</span>+<span className="kbd">V</span></span>
          <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) { const m = await guardarPrint(file); if (m) inserir(m); } }} />
        </div>
      )}
      <textarea ref={ref} id={id} className="input font-[inherit] text-[14px] leading-relaxed" rows={linhas} value={valor} onChange={(e) => onChange(e.target.value)} onPaste={colar} placeholder={exemplo} spellCheck />
    </Campo>
  );
}

/** As palavras do cliente: digita e Enter (ou vírgula) vira etiqueta. */
function Palavras({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  const [t, setT] = useState('');
  const somar = () => {
    const novas = t.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
    if (novas.length) onChange([...new Set([...valor, ...novas])].slice(0, 30));
    setT('');
  };
  return (
    <Campo label="Palavras do cliente" dica="outros jeitos de dizer o mesmo problema (“cai sozinha”, “derruba no meio”) — é o que faz a busca achar">
      <div className="input flex flex-wrap items-center gap-1.5 py-1.5 min-h-[42px]">
        {valor.map((p) => (
          <span key={p} className="chip bg-surface-2 text-ink-2 font-normal">{p}<button type="button" onClick={() => onChange(valor.filter((x) => x !== p))} aria-label={`Tirar “${p}”`}><X size={12} /></button></span>
        ))}
        <input className="flex-1 min-w-[160px] bg-transparent outline-none text-sm py-0.5" id="artigo-palavras" autoComplete="off" value={t} placeholder={valor.length ? '' : 'digite e aperte Enter'}
          onChange={(e) => setT(e.target.value)} onBlur={somar}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); somar(); } else if (e.key === 'Backspace' && !t && valor.length) onChange(valor.slice(0, -1)); }} />
      </div>
    </Campo>
  );
}

// ---------- as ligações ----------

function EscolherLigacoes({ opcoes, valor, onChange }: { opcoes: OpcoesBase; valor: LigacaoMostrada[]; onChange: (v: LigacaoMostrada[]) => void }) {
  const [chamado, setChamado] = useState('');
  const listas = useMemo((): Record<Exclude<TipoLigacao, 'chamado'>, Array<{ id: string; nome: string; href?: string }>> => ({
    produto: opcoes.produtos.map((p) => ({ id: p.id, nome: p.nome })),
    modulo: opcoes.produtos.flatMap((p) => p.modulos.map((m) => ({ id: m.id, nome: `${p.nome} › ${m.nome}` }))),
    assunto: opcoes.assuntos.map((a) => ({ id: a, nome: a })),
    cliente: opcoes.clientes.map((c) => ({ ...c, href: `/clientes/${c.id}` })),
    modelo: opcoes.modelos,
    operadora: opcoes.operadoras,
    projeto: opcoes.projetos.map((p) => ({ id: p.id, nome: p.nome, href: `/projetos/${p.id}` })),
  }), [opcoes]);
  const ja = new Set(valor.map((l) => `${l.tipo}:${l.alvo}`));
  const somar = (tipo: TipoLigacao, alvo: string, nome: string, href: string | null = null) => {
    if (!alvo || ja.has(`${tipo}:${alvo}`)) return;
    onChange([...valor, { tipo, alvo, nome, extra: null, href, existe: true }]);
  };
  const tipos = TIPOS_LIGACAO.filter((t): t is Exclude<TipoLigacao, 'chamado'> => t !== 'chamado').filter((t) => listas[t].length > 0);
  return (
    <div className="flex flex-col gap-3">
      {valor.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {valor.map((l) => (
            <span key={`${l.tipo}:${l.alvo}`} className="inline-flex items-center gap-1">
              <EtiquetaLigacao l={l} />
              <button type="button" className="text-muted hover:text-bad" onClick={() => onChange(valor.filter((x) => !(x.tipo === l.tipo && x.alvo === l.alvo)))} aria-label={`Tirar ${l.nome}`}><X size={13} /></button>
            </span>
          ))}
        </div>
      ) : <p className="text-[13px] text-muted">Nada ligado ainda.</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {tipos.map((t) => {
          const Icone = ICONE_LIGACAO[t];
          return (
            <EscolherComBusca key={t} valor="" rotulo={NOMES_LIGACAO[t]} procurar={`Procurar ${NOMES_LIGACAO[t].toLowerCase()}…`}
              opcoes={listas[t].filter((o) => !ja.has(`${t}:${o.id}`)).map((o) => ({ id: o.id, nome: o.nome }))}
              onChange={(id) => { const o = listas[t].find((x) => x.id === id); if (o) somar(t, o.id, o.nome, o.href ?? null); }}
              gatilho={(abrir) => <button type="button" className="btn-secondary btn-sm" onClick={abrir}><Plus size={13} /><Icone size={13} className="text-muted" /> {NOMES_LIGACAO[t]}</button>} />
          );
        })}
        <span className="inline-flex items-center gap-1">
          <input className="input py-1 w-[120px] font-mono text-[13px]" placeholder="IS-3607" aria-label="Ligar um chamado pelo código" value={chamado} onChange={(e) => setChamado(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && chamado.trim()) { e.preventDefault(); somar('chamado', chamado.trim().toUpperCase(), chamado.trim().toUpperCase()); setChamado(''); } }} />
          <button type="button" className="btn-secondary btn-sm" disabled={!chamado.trim()} onClick={() => { somar('chamado', chamado.trim().toUpperCase(), chamado.trim().toUpperCase()); setChamado(''); }}><Plus size={13} /> Chamado</button>
        </span>
      </div>
      {opcoes.campoAssunto && <p className="text-[12px] text-muted">O assunto é o campo “{opcoes.campoAssunto}” do LineChat — o mesmo dos Relatórios.</p>}
    </div>
  );
}

// ---------- os anexos (os que não são print) ----------

function Anexos({ guardados, novos, onTirarGuardado, onTirarNovo, onAnexar }: {
  guardados: AnexoArtigo[]; novos: Novo[]; onTirarGuardado: (id: string) => void; onTirarNovo: (ref: string) => void; onAnexar: (f: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const arquivos = guardados.filter((x) => !x.inline);
  const Linha = ({ nome, tam, onTirar, extra }: { nome: string; tam: number; onTirar: () => void; extra?: ReactNode }) => (
    <li className="flex items-center gap-2 text-[13.5px]"><Paperclip size={13} className="text-muted" /> <span className="truncate">{nome}</span> <span className="text-muted text-[12px]">· {tamanho(tam)}</span>{extra}
      <button type="button" className="btn-ghost btn-sm text-muted ml-auto" onClick={onTirar} aria-label={`Tirar ${nome}`}><X size={13} /></button></li>
  );
  return (
    <section className="card p-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-semibold">Anexos</h2>
          <p className="text-[13px] text-muted">Planilha, PDF, configuração exportada… até 10 MB cada. Firmware e vídeo grandes vão por link no texto.</p>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={() => input.current?.click()}><Paperclip size={14} /> Anexar arquivo</button>
        <input ref={input} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAnexar(f); }} />
      </div>
      {(arquivos.length > 0 || novos.length > 0) && (
        <ul className="flex flex-col gap-1">
          {arquivos.map((x) => <Linha key={x.id} nome={x.fileName} tam={x.sizeBytes} onTirar={() => onTirarGuardado(x.id)} />)}
          {novos.map((n) => <Linha key={n.ref} nome={n.fileName} tam={n.sizeBytes} onTirar={() => onTirarNovo(n.ref)} extra={<span className="chip bg-accent-soft text-accent-ink">novo</span>} />)}
        </ul>
      )}
    </section>
  );
}
