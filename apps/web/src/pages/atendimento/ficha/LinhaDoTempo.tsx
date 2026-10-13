/**
 * A linha do tempo do chamado, em abas: Tudo (as anotações e o histórico juntos, pela data),
 * Anotações, Histórico (cada mudança numa frase, com quem e quando) e Trajetória — o pedido do Miguel:
 * por quais etapas e níveis o chamado passou, desde quando, quanto tempo ficou em cada uma, quem
 * moveu e por quê.
 *
 * A caixa de anotar aceita até 5 arquivos de até 10 MB cada; um print colado com Ctrl+V vira anexo.
 * A imagem aparece em miniatura e abre grande; o resto baixa.
 */
import { useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import {
  AlarmClock, ArrowDown, ArrowDownUp, ArrowRight, ArrowUp, Bell, CircleDot, Columns3, Eye, Flag, GitBranch, Hourglass, Layers, Link2, ListChecks, Lock, MessageCircle,
  MessageSquareReply, Paperclip, Pencil, Plus, RotateCcw, Sparkles, Timer, Trash2, UserRound, X, Zap, History, RadioTower, Download, ExternalLink,
} from 'lucide-react';
import { NIVEIS, duracaoDoPrazo, rotuloDoNivel, type AnexoChamado, type AnotacaoChamado, type EventoChamado, type TipoEvento } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Abas, Confirmar, Modal, Spinner, usePaginaLocal } from '../../../components/ui/index.js';
import { lerComoDataUrl, tamanhoDoArquivo } from '../../../lib/arquivos.js';
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
              <TextoComReferencias texto={n.texto} />
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

function Anotar() {
  const { f } = useAberta();
  const acao = useAcao();
  const [texto, setTexto] = useState('');
  const [anexos, setAnexos] = useState<AnexoNovo[]>([]);
  const [lendo, setLendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

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
    const r = await acao.rodar(() => api.atendimento.anotar(f.id, { texto: texto.trim(), anexos: anexos.map((a) => ({ fileName: a.nome, conteudo: a.conteudo })) }), 'Anotação registrada');
    if (r.ok) { setTexto(''); setAnexos([]); setAviso(null); }
  };

  return (
    <div className={`mb-4 rounded-xl border p-2.5 transition-colors ${arrastando ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2'}`}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setArrastando(true); } }}
      onDragLeave={() => setArrastando(false)} onDrop={soltar}>
      <label htmlFor="anotacao-nova" className="sr-only">Anotação</label>
      <textarea id="anotacao-nova" className="input min-h-[76px] bg-surface" rows={Math.min(12, Math.max(3, texto.split('\n').length + 1))} maxLength={20_000} value={texto}
        onChange={(e) => setTexto(e.target.value)} onPaste={colar}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void anotar(); } }}
        placeholder="Escreva uma anotação… (cole um print com Ctrl+V, ou arraste o arquivo até aqui)" />
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
