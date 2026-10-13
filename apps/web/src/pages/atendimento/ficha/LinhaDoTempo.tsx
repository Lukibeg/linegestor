/**
 * A linha do tempo do chamado, em abas: Tudo (as anotações e o histórico juntos, pela data),
 * Anotações, Histórico (cada mudança numa frase, com quem e quando) e Trajetória — o pedido do Miguel:
 * por quais etapas e níveis o chamado passou, desde quando, quanto tempo ficou em cada uma, quem
 * moveu e por quê.
 *
 * A caixa de anotar aceita até 5 arquivos de até 10 MB cada; um print colado com Ctrl+V vira anexo.
 * A imagem aparece em miniatura e abre grande; o resto baixa. O "@" cita um colega (13/10, o pedido do
 * Luan): a lista de quem vê o painel abre no cursor, e quem for citado recebe o aviso na hora, mesmo sem
 * observar o chamado.
 */
import { useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type SyntheticEvent } from 'react';
import {
  AlarmClock, ArrowDown, ArrowDownUp, ArrowRight, ArrowUp, AtSign, Bell, CircleDot, Columns3, Eye, Flag, GitBranch, Hourglass, Layers, Link2, ListChecks, Lock, MessageCircle,
  MessageSquareReply, Paperclip, Pencil, Plus, RotateCcw, Sparkles, Timer, Trash2, UserRound, X, Zap, History, RadioTower, Download, ExternalLink,
} from 'lucide-react';
import {
  NIVEIS, citacaoDigitando, citadosNoTexto, duracaoDoPrazo, emLista, paraBusca, rotuloDoNivel,
  type AnexoChamado, type AnotacaoChamado, type EventoChamado, type PessoaCurta, type TipoEvento,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Abas, Confirmar, Modal, Spinner, usePaginaLocal } from '../../../components/ui/index.js';
import { lerComoDataUrl, tamanhoDoArquivo } from '../../../lib/arquivos.js';
import { useAuth } from '../../../lib/auth.js';
import { contar, TdN, ThN } from '../../../lib/contagem.js';
import { ordenarLista, Th, useOrdenacaoLocal } from '../../../lib/ordenacao.js';
import { Avatar, dataHoraCurta } from '../comum.js';
import { ErroPerto, Secao, TextoComReferencias, comMaiuscula, useAberta, useAcao } from './base.js';
import { dataCompleta } from './Cabecalho.js';

type Aba = 'tudo' | 'anotacoes' | 'historico' | 'trajetoria';
type Item = { tipo: 'nota'; em: string; id: string; nota: AnotacaoChamado } | { tipo: 'evento'; em: string; id: string; ev: EventoChamado };

const CHAVE_ORDEM = 'gestor.chamado.ordem';
function ordemGuardada(): 'novos' | 'antigos' {
  try { return localStorage.getItem(CHAVE_ORDEM) === 'antigos' ? 'antigos' : 'novos'; } catch { return 'novos'; }
}

export function LinhaDoTempo() {
  const { f, pode } = useAberta();
  const [aba, setAba] = useState<Aba>('tudo');
  const [ordem, setOrdemEstado] = useState<'novos' | 'antigos'>(ordemGuardada);
  const setOrdem = (o: 'novos' | 'antigos') => { setOrdemEstado(o); try { localStorage.setItem(CHAVE_ORDEM, o); } catch { /* sem storage: só não lembra */ } };

  const itens = useMemo(() => {
    const notas: Item[] = f.anotacoesLista.map((n) => ({ tipo: 'nota', em: n.em, id: n.id, nota: n }));
    const eventos: Item[] = f.historico.map((ev) => ({ tipo: 'evento', em: ev.em, id: ev.id, ev }));
    const escolhidos = aba === 'anotacoes' ? notas : aba === 'historico' ? eventos : [...notas, ...eventos];
    const sinal = ordem === 'novos' ? -1 : 1;
    return escolhidos.sort((a, b) => sinal * (a.em.localeCompare(b.em) || a.id.localeCompare(b.id)));
  }, [f.anotacoesLista, f.historico, aba, ordem]);

  return (
    <Secao titulo="Linha do tempo" icone={<History size={16} />}
      acoes={aba !== 'trajetoria' && (
        <button type="button" className="btn-ghost btn-sm text-muted" onClick={() => setOrdem(ordem === 'novos' ? 'antigos' : 'novos')} title="Trocar a ordem">
          <ArrowDownUp size={14} /> {ordem === 'novos' ? 'Mais novos primeiro' : 'Mais antigos primeiro'}
        </button>
      )}>
      <Abas<Aba> atual={aba} onChange={setAba} abas={[
        { id: 'tudo', label: 'Tudo' },
        { id: 'anotacoes', label: <>Anotações <span className="text-muted font-normal tnum">({f.anotacoesLista.length})</span></> },
        { id: 'historico', label: <>Histórico <span className="text-muted font-normal tnum">({f.historico.length})</span></> },
        { id: 'trajetoria', label: <>Trajetória <span className="text-muted font-normal tnum">({f.trajetoria.length})</span></> },
      ]} />
      {pode && (aba === 'tudo' || aba === 'anotacoes') && <Anotar />}
      {aba === 'trajetoria' ? <Trajetoria /> : <Itens itens={itens} vazio={aba === 'anotacoes' ? 'Nenhuma anotação ainda.' : 'Nada por aqui ainda.'} />}
    </Secao>
  );
}

function Itens({ itens, vazio }: { itens: Item[]; vazio: string }) {
  const pagina = usePaginaLocal(itens, 40);
  if (!itens.length) return <p className="text-[13px] text-muted">{vazio}</p>;
  return (
    <>
      <ul className="flex flex-col">
        {pagina.visiveis.map((i) => (i.tipo === 'nota' ? <Anotacao key={`n-${i.id}`} n={i.nota} /> : <LinhaDeEvento key={`e-${i.id}`} ev={i.ev} />))}
      </ul>
      {pagina.rodape}
    </>
  );
}

// =====================================================================
//  O HISTÓRICO
// =====================================================================

const ICONE: Partial<Record<TipoEvento, typeof CircleDot>> = {
  criado: Plus, etapa: ArrowRight, responsavel: UserRound, campo: Pencil, prioridade: Flag, espera: Hourglass, ligacao: Link2, pai: GitBranch, filho: GitBranch,
  problema: Layers, incidente: Layers, checklist: ListChecks, tempo: Timer, operadora: RadioTower, aviso_cliente: MessageCircle, aviso_equipe: Bell,
  reaberto: RotateCcw, painel: Columns3, ia: Sparkles, resposta_pronta: Zap, cliente_respondeu: MessageSquareReply, prazo: AlarmClock, fechou_sozinho: Lock,
  observador: Eye, lixeira: Trash2,
};
/** Frases que já dizem quem foi ("o cliente respondeu", "fechou sozinho"): sem o nome na frente. */
const SEM_AUTOR = new Set<TipoEvento>(['cliente_respondeu', 'prazo', 'fechou_sozinho', 'aviso_equipe']);

/** "para N1 (N1)" → "para N1" (e "para DEV (DEV)" → "para DEV"): a etapa que já se chama pelo nível não precisa repetir. */
const semNivelRepetido = (t: string) => t.replace(/\b(N[1-9]|DEV) \(\1\)/g, '$1');

function LinhaDeEvento({ ev }: { ev: EventoChamado }) {
  const Icone = ev.tipo === 'etapa' && ev.dados?.sentido === 'sobe' ? ArrowUp : ev.tipo === 'etapa' && ev.dados?.sentido === 'desce' ? ArrowDown : ICONE[ev.tipo] ?? CircleDot;
  const autor = ev.por?.nome ?? ev.porNome ?? 'O Gestor';
  const texto = semNivelRepetido(ev.texto);
  const falhou = (ev.tipo === 'aviso_cliente' || ev.tipo === 'aviso_equipe') && ev.dados?.ok === false;
  const destaque = ev.tipo === 'etapa' && ev.dados?.sentido ? 'text-accent' : falhou ? 'text-bad' : 'text-muted';
  return (
    <li className="flex items-start gap-2.5 py-1.5 text-[13px] leading-snug">
      <span className={`mt-0.5 w-6 h-6 rounded-full bg-surface-2 flex items-center justify-center shrink-0 ${destaque}`} aria-hidden><Icone size={13} /></span>
      <div className="min-w-0 flex-1 pt-0.5">
        <span className={falhou ? 'text-bad' : 'text-ink-2'}>
          {SEM_AUTOR.has(ev.tipo)
            ? <TextoComReferencias texto={comMaiuscula(texto)} />
            : <><b className="text-ink font-semibold">{autor}</b> <TextoComReferencias texto={texto} /></>}
        </span>
        <time dateTime={ev.em} title={dataCompleta(ev.em)} className="ml-2 text-[11.5px] text-muted whitespace-nowrap">{dataHoraCurta(ev.em)}</time>
      </div>
    </li>
  );
}

// =====================================================================
//  AS ANOTAÇÕES
// =====================================================================

function Anotacao({ n }: { n: AnotacaoChamado }) {
  const { f, pode } = useAberta();
  const [apagar, setApagar] = useState(false);
  const [grande, setGrande] = useState<AnexoChamado | null>(null);
  const acao = useAcao();
  const autor = n.por?.nome ?? n.porNome ?? 'Integração';
  const imagens = n.anexos.filter((a) => a.imagem);
  const arquivos = n.anexos.filter((a) => !a.imagem);
  return (
    <li className="py-2 group">
      <div className="flex items-start gap-2.5">
        <Avatar nome={autor} tamanho={26} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <b className="font-semibold">{autor}</b>
            <span className="text-[12px] text-muted">anotou</span>
            <time dateTime={n.em} title={dataCompleta(n.em)} className="text-[11.5px] text-muted">{dataHoraCurta(n.em)}</time>
            {pode && n.podeApagar && (
              <button type="button" className="btn-ghost btn-sm text-bad ml-auto -my-1 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" onClick={() => setApagar(true)} aria-label="Apagar a anotação">
                <Trash2 size={13} /> <span className="hidden sm:inline">Apagar</span>
              </button>
            )}
          </div>
          {n.texto && (
            <div className="mt-1 rounded-lg bg-surface-2 px-3 py-2 text-[14px] text-ink">
              <TextoComReferencias texto={n.texto} citados={n.citados} />
            </div>
          )}
          {imagens.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {imagens.map((a) => (
                <button key={a.id} type="button" onClick={() => setGrande(a)} className="rounded-md border border-line overflow-hidden bg-surface hover:border-accent" title={`Abrir ${a.nome}`}>
                  <img src={api.atendimento.anexoUrl(a.id)} alt={a.nome} loading="lazy" className="h-24 w-auto max-w-[200px] object-cover" />
                </button>
              ))}
            </div>
          )}
          {arquivos.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {arquivos.map((a) => (
                <li key={a.id}>
                  <a href={api.atendimento.anexoUrl(a.id)} download={a.nome} className="chip bg-surface-2 text-ink-2 hover:text-accent font-medium max-w-full">
                    <Paperclip size={12} className="shrink-0" /> <span className="truncate max-w-[220px]">{a.nome}</span> <span className="text-muted font-normal">· {tamanhoDoArquivo(a.tamanho)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <ErroPerto erro={acao.erro} />
        </div>
      </div>
      {apagar && <Confirmar open onClose={() => setApagar(false)} loading={acao.ocupado} perigoso titulo="Apagar a anotação" botao="Apagar"
        onConfirm={async () => { const r = await acao.rodar(() => api.atendimento.apagarAnotacao(f.id, n.id), 'Anotação apagada'); setApagar(false); void r; }}
        texto={<>A anotação de <b>{autor}</b> sai do chamado{n.anexos.length ? `, com ${n.anexos.length === 1 ? 'o anexo' : `os ${n.anexos.length} anexos`}` : ''}. A auditoria guarda o texto e quem apagou.</>} />}
      {grande && (
        <Modal open onClose={() => setGrande(null)} titulo={grande.nome} largura="max-w-5xl"
          rodape={<>
            <a className="btn-secondary" href={api.atendimento.anexoUrl(grande.id)} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir em outra aba</a>
            <a className="btn-primary" href={api.atendimento.anexoUrl(grande.id)} download={grande.nome}><Download size={15} /> Baixar</a>
          </>}>
          <img src={api.atendimento.anexoUrl(grande.id)} alt={grande.nome} className="max-w-full max-h-[72vh] mx-auto rounded-md" />
          <p className="text-center text-[12px] text-muted mt-2">{tamanhoDoArquivo(grande.tamanho)} · anexado por {autor} {dataHoraCurta(n.em)}</p>
        </Modal>
      )}
    </li>
  );
}

// ---------- a caixa de anotar ----------

type AnexoNovo = { id: number; nome: string; tamanho: number; tipo: string; conteudo: string };
const MAX_ANEXOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSAO: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/** O print colado vem como "image.png": ganha um nome que diz quando foi. */
function nomeDoPrint(a: File): File {
  if (a.name && a.name !== 'image.png' && a.name !== 'image.jpg') return a;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const nome = `print-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${EXTENSAO[a.type] ?? 'png'}`;
  return new File([a], nome, { type: a.type });
}

/**
 * Onde fica um ponto do texto dentro da caixa (a lista dos colegas abre ali): um espelho invisível,
 * com o mesmo estilo da caixa, escrito até aquele ponto.
 */
function posicaoNoTexto(el: HTMLTextAreaElement, texto: string, indice: number): { top: number; left: number; altura: number } {
  const estilo = getComputedStyle(el);
  const espelho = document.createElement('div');
  for (const k of ['boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom',
    'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontSize', 'lineHeight', 'fontFamily', 'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent'] as const) {
    espelho.style[k] = estilo[k];
  }
  Object.assign(espelho.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px', height: 'auto' });
  espelho.textContent = texto.slice(0, indice);
  const marca = document.createElement('span');
  marca.textContent = '\u200b';
  espelho.appendChild(marca);
  document.body.appendChild(espelho);
  const r = { top: marca.offsetTop - el.scrollTop, left: marca.offsetLeft - el.scrollLeft, altura: parseFloat(estilo.lineHeight) || parseFloat(estilo.fontSize) * 1.4 };
  document.body.removeChild(espelho);
  return r;
}

const LARGURA_DA_LISTA = 256;

function Anotar() {
  const { f } = useAberta();
  const { user } = useAuth();
  const acao = useAcao();
  const [texto, setTexto] = useState('');
  const [anexos, setAnexos] = useState<AnexoNovo[]>([]);
  const [lendo, setLendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // ---------- o @: quem pode ser citado (quem vê o painel, menos a própria pessoa) ----------
  const caixa = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const [marcado, setMarcado] = useState(0);
  /** o @ (pela posição) cuja lista a pessoa fechou com o Esc: só reabre num @ novo */
  const [fechada, setFechada] = useState<number | null>(null);
  const [foco, setFoco] = useState(false);
  /** o espaço que a escolha pôs depois do nome: a pontuação logo em seguida ("?", ",") toma o lugar dele */
  const [espacoAuto, setEspacoAuto] = useState<number | null>(null);
  const outros = useMemo(() => f.citaveis.filter((p) => p.id !== user?.id), [f.citaveis, user?.id]);
  const digitando = citacaoDigitando(texto, cursor);
  const sugestoes = useMemo(() => {
    if (!digitando) return [];
    const b = paraBusca(digitando.busca);
    const nome = (p: PessoaCurta) => paraBusca(p.nome);
    return [
      ...outros.filter((p) => nome(p).startsWith(b)),
      ...outros.filter((p) => !nome(p).startsWith(b) && (nome(p).includes(` ${b}`) || (b.length > 2 && nome(p).includes(b)))),
    ].slice(0, 8);
  }, [digitando?.busca, outros]); // eslint-disable-line react-hooks/exhaustive-deps
  // sem ninguém com o nome, a lista só avisa enquanto é uma palavra (depois do espaço, a pessoa já seguiu escrevendo)
  const aberta = foco && !!digitando && fechada !== digitando.inicio && !!outros.length && (sugestoes.length > 0 || !digitando.busca.includes(' '));
  const citados = useMemo(() => (texto.includes('@') ? citadosNoTexto(texto, outros) : []), [texto, outros]);
  const posicao = aberta && caixa.current ? posicaoNoTexto(caixa.current, texto, digitando!.inicio) : null;
  const largura = caixa.current?.clientWidth ?? 600;

  const lerCursor = (e: SyntheticEvent<HTMLTextAreaElement>) => setCursor(e.currentTarget.selectionStart ?? 0);
  const irPara = (pos: number) => requestAnimationFrame(() => { const el = caixa.current; if (el) { el.focus(); el.setSelectionRange(pos, pos); } });
  /** Escolheu na lista: o "@bru" vira "@Bruno Teixeira " e o cursor vai para depois do nome. */
  const escolher = (p: PessoaCurta) => {
    if (!digitando) return;
    const antes = `${texto.slice(0, digitando.inicio)}@${p.nome} `;
    const novo = antes + texto.slice(cursor).replace(/^ /, '');
    // a lista deste @ fecha: o nome já está escolhido (o que vem depois não é mais busca)
    setTexto(novo); setCursor(antes.length); setMarcado(0); setEspacoAuto(antes.length - 1); setFechada(digitando.inicio);
    irPara(antes.length);
  };
  /** O botão "Citar": põe o @ onde está o cursor (com um espaço antes, se precisar) e abre a lista. */
  const citar = () => {
    const pos = caixa.current?.selectionStart ?? texto.length;
    const antes = texto.slice(0, pos);
    const at = antes && !/\s$/.test(antes) ? ' @' : '@';
    setTexto(antes + at + texto.slice(pos)); setCursor(pos + at.length); setFechada(null); setMarcado(0);
    irPara(pos + at.length);
  };

  const incluir = async (arquivos: File[]) => {
    setAviso(null);
    if (!arquivos.length) return;
    const lugar = MAX_ANEXOS - anexos.length;
    const problemas: string[] = [];
    if (lugar <= 0) { setAviso(`No máximo ${MAX_ANEXOS} arquivos por anotação.`); return; }
    if (arquivos.length > lugar) problemas.push(`No máximo ${MAX_ANEXOS} arquivos por anotação: ${arquivos.length - lugar} ${arquivos.length - lugar === 1 ? 'ficou' : 'ficaram'} de fora.`);
    setLendo(true);
    const novos: AnexoNovo[] = [];
    for (const a of arquivos.slice(0, lugar)) {
      if (a.size > MAX_BYTES) { problemas.push(`"${a.name}" tem ${tamanhoDoArquivo(a.size)}: o limite é 10 MB por arquivo.`); continue; }
      if (a.size === 0) { problemas.push(`"${a.name}" está vazio.`); continue; }
      try {
        novos.push({ id: ++seq.current, nome: a.name, tamanho: a.size, tipo: a.type, conteudo: await lerComoDataUrl(a) });
      } catch {
        problemas.push(`Não deu para ler "${a.name}".`);
      }
    }
    setLendo(false);
    setAnexos((x) => [...x, ...novos].slice(0, MAX_ANEXOS));
    if (problemas.length) setAviso(problemas.join(' '));
  };

  const colar = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const arquivos = [...e.clipboardData.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((x): x is File => !!x);
    if (!arquivos.length) return;
    // só o print (sem texto junto): não deixa o navegador colar nada na caixa
    if (!e.clipboardData.getData('text/plain')) e.preventDefault();
    void incluir(arquivos.map(nomeDoPrint));
  };
  const soltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastando(false);
    void incluir([...(e.dataTransfer.files ?? [])]);
  };

  const anotar = async () => {
    if (!texto.trim() && !anexos.length) { acao.setErro('Escreva a anotação ou anexe um arquivo.'); return; }
    const avisados = citados.length ? ` (${emLista(citados.map((p) => p.nome))} ${citados.length === 1 ? 'recebeu' : 'receberam'} o aviso)` : '';
    const r = await acao.rodar(() => api.atendimento.anotar(f.id, { texto: texto.trim(), anexos: anexos.map((a) => ({ fileName: a.nome, conteudo: a.conteudo })) }), `Anotação registrada${avisados}`);
    if (r.ok) { setTexto(''); setAnexos([]); setAviso(null); setCursor(0); setFechada(null); }
  };

  return (
    <div className={`mb-4 rounded-xl border p-2.5 transition-colors ${arrastando ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2'}`}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setArrastando(true); } }}
      onDragLeave={() => setArrastando(false)} onDrop={soltar}>
      <label htmlFor="anotacao-nova" className="sr-only">Anotação</label>
      <div className="relative">
        <textarea ref={caixa} id="anotacao-nova" className="input min-h-[76px] bg-surface" rows={Math.min(12, Math.max(3, texto.split('\n').length + 1))} maxLength={20_000} value={texto}
          onChange={(e) => { setTexto(e.target.value); setCursor(e.target.selectionStart ?? 0); setMarcado(0); setEspacoAuto(null); }} onPaste={colar}
          onSelect={lerCursor} onClick={lerCursor} onKeyUp={lerCursor} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
          role="combobox" aria-autocomplete="list" aria-expanded={aberta} aria-controls="anotacao-citar-lista"
          aria-activedescendant={aberta && sugestoes[marcado] ? `anotacao-citar-${sugestoes[marcado]!.id}` : undefined}
          onKeyDown={(e) => {
            // com a lista aberta, as setas andam nela, o Enter (ou o Tab) escolhe e o Esc fecha só a lista (não a janela em volta)
            if (aberta && sugestoes.length) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setMarcado((m) => (m + (e.key === 'ArrowDown' ? 1 : -1) + sugestoes.length) % sugestoes.length);
                return;
              }
              if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') { e.preventDefault(); escolher(sugestoes[Math.min(marcado, sugestoes.length - 1)]!); return; }
            }
            if (aberta && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setFechada(digitando!.inicio); return; }
            // "@Bruno Teixeira ?" vira "@Bruno Teixeira?": a pontuação logo depois da escolha fica colada no nome
            if (espacoAuto !== null && /^[.,;:!?)]$/.test(e.key) && e.currentTarget.selectionStart === espacoAuto + 1 && texto[espacoAuto] === ' ') {
              e.preventDefault();
              const novo = texto.slice(0, espacoAuto) + e.key + texto.slice(espacoAuto + 1);
              setTexto(novo); setCursor(espacoAuto + 1); setEspacoAuto(null);
              irPara(espacoAuto + 1);
              return;
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void anotar(); }
          }}
          placeholder="Escreva uma anotação… (@ cita um colega; cole um print com Ctrl+V ou arraste o arquivo até aqui)" />
        {aberta && posicao && (
          <div role="listbox" id="anotacao-citar-lista" aria-label="Citar um colega"
            className="absolute z-30 card p-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}
            style={{ top: posicao.top + posicao.altura + 6, left: Math.max(4, Math.min(posicao.left, largura - LARGURA_DA_LISTA - 4)), width: LARGURA_DA_LISTA, maxWidth: 'calc(100% - 8px)', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
            <div className="eyebrow px-2 pt-1 pb-1.5 flex items-center gap-1"><AtSign size={12} aria-hidden /> Citar · recebe o aviso</div>
            {sugestoes.length ? sugestoes.map((p, i) => (
              <div key={p.id} role="option" id={`anotacao-citar-${p.id}`} aria-selected={i === marcado} data-citar={p.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-[13.5px] ${i === marcado ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2'}`}
                onMouseEnter={() => setMarcado(i)} onClick={() => escolher(p)}>
                <Avatar nome={p.nome} tamanho={22} /> <span className="min-w-0 truncate">{p.nome}</span>
              </div>
            )) : <p className="px-2 py-1.5 text-[12.5px] text-muted">Ninguém com esse nome vê este painel.</p>}
          </div>
        )}
      </div>
      {citados.length > 0 && (
        <p className="mt-1.5 text-[12.5px] text-accent-ink flex flex-wrap items-center gap-x-1.5" id="anotacao-citados" role="status">
          <AtSign size={13} className="shrink-0" aria-hidden /> {citados.length === 1 ? 'Vai receber o aviso:' : 'Vão receber o aviso:'} <b className="font-semibold">{emLista(citados.map((p) => p.nome))}</b>
        </p>
      )}
      {anexos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {anexos.map((a) => (
            <li key={a.id} className="chip bg-surface border border-line text-ink-2 font-medium max-w-full">
              {a.tipo.startsWith('image/') ? <img src={a.conteudo} alt="" className="w-6 h-6 rounded object-cover shrink-0" /> : <Paperclip size={12} className="shrink-0" />}
              <span className="truncate max-w-[200px]">{a.nome}</span>
              <span className="text-muted font-normal">· {tamanhoDoArquivo(a.tamanho)}</span>
              <button type="button" className="text-muted hover:text-bad -mr-0.5" onClick={() => setAnexos((x) => x.filter((y) => y.id !== a.id))} aria-label={`Tirar ${a.nome}`}><X size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <input ref={entrada} type="file" multiple className="hidden" onChange={(e) => { void incluir([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <button type="button" className="btn-ghost btn-sm" disabled={lendo || anexos.length >= MAX_ANEXOS} onClick={() => entrada.current?.click()} title="Até 5 arquivos, de até 10 MB cada">
          {lendo ? <Spinner /> : <Paperclip size={14} />} Anexar
        </button>
        {outros.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" id="anotacao-citar" onClick={citar} title="Citar um colega: ele recebe o aviso na hora, mesmo sem observar o chamado">
            <AtSign size={14} /> Citar
          </button>
        )}
        <span className="text-[11.5px] text-muted">{anexos.length ? `${anexos.length} de ${MAX_ANEXOS} arquivos` : 'até 5 arquivos de 10 MB'} · Ctrl+Enter anota</span>
        <button type="button" className="btn-primary btn-sm ml-auto" disabled={acao.ocupado || lendo || (!texto.trim() && !anexos.length)} onClick={() => void anotar()}>
          {acao.ocupado ? <Spinner className="text-white" /> : 'Anotar'}
        </button>
      </div>
      {aviso && <p className="text-signal text-[12.5px] mt-1.5" role="status">{aviso}</p>}
      <ErroPerto erro={acao.erro} />
    </div>
  );
}

// =====================================================================
//  A TRAJETÓRIA
// =====================================================================

function Trajetoria() {
  const { f } = useAberta();
  const o = useOrdenacaoLocal('desde', 'asc');
  const linhas = useMemo(() => f.trajetoria.map((p, i) => ({ ...p, i })), [f.trajetoria]);
  const ordenadas = ordenarLista(linhas, o, {
    etapa: (p) => p.etapa, nivel: (p) => p.nivel, desde: (p) => p.desde, minutos: (p) => p.minutos, por: (p) => (p.i === 0 ? f.criadoPor?.nome : p.por), motivo: (p) => p.motivo,
  });
  // quanto tempo o chamado ficou em cada nível, somando as passagens (o N1 pode ter vindo duas vezes)
  const porNivel = NIVEIS.map((n) => ({ n, min: f.trajetoria.filter((p) => p.nivel === n).reduce((s, p) => s + p.minutos, 0), vezes: f.trajetoria.filter((p) => p.nivel === n).length })).filter((x) => x.vezes > 0);
  return (
    <div className="min-w-0">
      {porNivel.length > 0 && (
        <p className="text-[12.5px] text-muted mb-2">
          Tempo em cada nível:{' '}
          {porNivel.map((x, i) => <span key={x.n}>{i > 0 && ' · '}<b className="text-ink-2">{rotuloDoNivel(x.n)}</b> {duracaoDoPrazo(x.min)}{x.vezes > 1 ? ` (${x.vezes} passagens)` : ''}</span>)}
          {' '}<span>(horas corridas)</span>
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="table text-[13px]">
          <thead>
            <tr>
              <ThN />
              <Th o={o} col="etapa">Etapa</Th>
              <Th o={o} col="nivel">Nível</Th>
              <Th o={o} col="desde">Desde</Th>
              <Th o={o} col="minutos" align="right">Quanto tempo ficou</Th>
              <Th o={o} col="por">Quem moveu</Th>
              <Th o={o} col="motivo">Motivo</Th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((p, i) => (
              <tr key={p.i}>
                <TdN n={contar(i)} />
                <td className="whitespace-nowrap">
                  <span className="font-semibold">{p.etapa}</span>
                  {p.sentido === 'sobe' && <span className="chip bg-accent-soft text-accent-ink ml-1.5"><ArrowUp size={11} /> escalonou</span>}
                  {p.sentido === 'desce' && <span className="chip bg-signal-soft text-signal ml-1.5"><ArrowDown size={11} /> voltou de nível</span>}
                </td>
                <td className="whitespace-nowrap">{p.nivel ? rotuloDoNivel(p.nivel) : <span className="text-muted">—</span>}</td>
                <td className="whitespace-nowrap" title={dataCompleta(p.desde)}>{dataHoraCurta(p.desde)}</td>
                <td className="whitespace-nowrap text-right tnum">{duracaoDoPrazo(p.minutos)}{!p.ate && <span className="text-muted"> até agora</span>}</td>
                <td className="whitespace-nowrap">{p.i === 0 ? <span className="text-muted">{f.criadoPor ? `${f.criadoPor.nome} (abriu)` : 'abriu aqui'}</span> : p.por ?? <span className="text-muted">o Gestor</span>}</td>
                <td className="min-w-[180px]">{p.motivo ? <TextoComReferencias texto={p.motivo} /> : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
