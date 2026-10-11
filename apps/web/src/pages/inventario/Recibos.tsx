/**
 * O recibo de entrega da movimentação (Patch 1.9, decisão 0042). O pedido (09/10): "na hora de
 * fazer uma movimentação para um cliente, quero também poder anexar um arquivo, que no caso seria o
 * recibo de entrega".
 *
 *  - `CampoRecibo`: no Movimentar, para anexar na hora (PDF ou foto, até 5 arquivos);
 *  - `RecibosDaMovimentacao`: na lista de movimentações (Inventário e ficha do cliente), com o
 *    "anexar" de quando o recibo assinado volta depois, e o "tirar";
 *  - `ArquivoDoRecibo`: o arquivo — a foto abre na tela; o PDF baixa (a política de segurança do
 *    site não deixa o leitor de PDF do navegador abrir dentro do sistema).
 *
 * As regras são as de `@gestor/shared/recibo.ts`, as mesmas do servidor e da prévia.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Image as Foto, Paperclip, Plus, X } from 'lucide-react';
import { ACEITA_RECIBO, RECIBO } from '@gestor/shared';
import { api, IS_DEMO, logoSrc } from '../../api/index.js';
import type { Movement, ReciboDeEntrega } from '../../api/types.js';
import { useAuth } from '../../lib/auth.js';
import { Confirmar, Spinner, mensagemErro, useToast } from '../../components/ui/index.js';
import { data } from '../../lib/format.js';
import { prepararRecibo, tamanhoDoArquivo, type ReciboPronto } from '../../lib/arquivos.js';

/** Depois de anexar ou tirar: a lista de movimentações e a ficha do aparelho mostram de novo. */
const RECARREGAR = ['movements', 'device'];

/** Sobe os arquivos um por um; devolve os que não subiram, com o motivo. */
export async function enviarRecibos(movementId: string, prontos: ReciboPronto[]) {
  const falhas: Array<{ nome: string; erro: string }> = [];
  for (const r of prontos) {
    try { await api.inventory.anexarRecibo(movementId, { fileName: r.fileName, conteudo: r.conteudo }); }
    catch (e) { falhas.push({ nome: r.fileName, erro: mensagemErro(e) }); }
  }
  return falhas;
}

/** Prepara os arquivos escolhidos (reduz a foto, confere tipo e tamanho), até caberem as vagas. */
async function prepararVarios(arquivos: File[], vagas: number) {
  const prontos: ReciboPronto[] = []; const erros: string[] = [];
  for (const a of arquivos.slice(0, vagas)) {
    try { prontos.push(await prepararRecibo(a)); } catch (e) { erros.push(mensagemErro(e)); }
  }
  if (arquivos.length > vagas) erros.push(`Cabem ${RECIBO.maxArquivos} arquivos por movimentação: ${arquivos.length - vagas} ficaram de fora.`);
  return { prontos, erros };
}

/** Um arquivo do recibo: o nome (a foto abre na tela; o PDF baixa), o tamanho e, se pode, o tirar. */
export function ArquivoDoRecibo({ r, onTirar }: { r: ReciboDeEntrega; onTirar?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const src = logoSrc(r.url) ?? '';
  // no sistema, a foto também baixa pelo "baixar=1"; na prévia, o arquivo está embutido
  const baixar = src.startsWith('data:') ? src : `${src}?baixar=1`;
  const foto = r.mimeType.startsWith('image/');
  const titulo = `${r.fileName} · ${tamanhoDoArquivo(r.sizeBytes)} · anexado ${r.quem ? `por ${r.quem} ` : ''}em ${data(r.createdAt, true)}`;
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto]);
  const nome = <><span className="shrink-0">{foto ? <Foto size={14} /> : <FileText size={14} />}</span><span className="truncate">{r.fileName}</span></>;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
      {foto
        ? <button type="button" className="link inline-flex items-center gap-1 min-w-0 text-left" onClick={(e) => { e.stopPropagation(); setAberto(true); }} title={`${titulo} — ver a foto`}>{nome}</button>
        : <a className="link inline-flex items-center gap-1 min-w-0" href={baixar} download={r.fileName} onClick={(e) => e.stopPropagation()}
            title={IS_DEMO ? `${titulo} — na prévia o PDF não baixa (o claude.ai bloqueia); no sistema, baixa` : `${titulo} — baixar o PDF`}>{nome}</a>}
      <span className="text-muted text-[12px] whitespace-nowrap">{tamanhoDoArquivo(r.sizeBytes)}</span>
      {onTirar && (
        <button type="button" className="text-muted hover:text-bad rounded p-0.5" onClick={(e) => { e.stopPropagation(); onTirar(); }} aria-label={`Tirar ${r.fileName}`} title="Tirar este arquivo">
          <X size={13} />
        </button>
      )}
      {aberto && createPortal(
        // a foto inteira, na tela toda (no celular dá para ver a assinatura); clicar fora fecha
        <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col" role="dialog" aria-modal="true" aria-label={r.fileName} onClick={(e) => { e.stopPropagation(); setAberto(false); }}>
          <div className="flex items-center gap-2 p-3 text-white text-sm" onClick={(e) => e.stopPropagation()}>
            <span className="min-w-0 flex-1 truncate">{r.fileName}<span className="text-white/60"> · {tamanhoDoArquivo(r.sizeBytes)}{r.quem ? ` · anexado por ${r.quem}` : ''} em {data(r.createdAt, true)}</span></span>
            <a className="btn-secondary btn-sm" href={baixar} download={r.fileName}><Download size={14} /> Baixar</a>
            <button type="button" className="rounded-full bg-white/90 text-black p-1.5" aria-label="Fechar" onClick={() => setAberto(false)}><X size={16} /></button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center px-3 pb-3">
            <img src={src} alt={r.fileName} className="max-w-full max-h-full object-contain rounded bg-white" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}

/** O botão de anexar (um ou vários arquivos de uma vez), para quando o recibo assinado volta depois. */
function AnexarRecibo({ movementId, vagas, jaTem }: { movementId: string; vagas: number; jaTem: boolean }) {
  const campo = useRef<HTMLInputElement>(null);
  const [subindo, setSubindo] = useState(false);
  const qc = useQueryClient(); const toast = useToast();
  const escolher = async (lista: FileList | null) => {
    const arquivos = [...(lista ?? [])];
    if (!arquivos.length) return;
    setSubindo(true);
    try {
      const { prontos, erros } = await prepararVarios(arquivos, vagas);
      const falhas = await enviarRecibos(movementId, prontos);
      const foram = prontos.length - falhas.length;
      if (foram) toast.push('ok', foram === 1 ? 'Recibo anexado' : `${foram} arquivos do recibo anexados`);
      const problemas = [...erros, ...falhas.map((f) => f.erro)];
      if (problemas.length) toast.push('erro', problemas.join(' '));
      await Promise.all(RECARREGAR.map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } finally {
      setSubindo(false);
      if (campo.current) campo.current.value = '';
    }
  };
  return (
    <>
      <button type="button" className="btn-secondary btn-sm" disabled={subindo} onClick={() => campo.current?.click()}>
        {subindo ? <Spinner /> : <Plus size={14} />} {jaTem ? 'Anexar outro arquivo' : 'Anexar o recibo'}
      </button>
      <input ref={campo} type="file" className="hidden" accept={ACEITA_RECIBO} multiple onChange={(e) => void escolher(e.target.files)} />
    </>
  );
}

/**
 * O recibo de uma movimentação, na linha aberta da lista. Só a movimentação para um cliente tem
 * recibo (a devolução não). Quem movimenta aparelhos anexa e tira; quem só lê, vê e baixa.
 */
export function RecibosDaMovimentacao({ m }: { m: Pick<Movement, 'id' | 'toClientId' | 'recibos'> }) {
  const { can } = useAuth();
  const qc = useQueryClient(); const toast = useToast();
  const [tirar, setTirar] = useState<ReciboDeEntrega | null>(null);
  const [busy, setBusy] = useState(false);
  if (!m.toClientId) return null;
  const podeMexer = can('devices.move');
  const confirmarTirar = async () => {
    if (!tirar) return;
    setBusy(true);
    try {
      await api.inventory.tirarRecibo(tirar.id);
      toast.push('ok', `"${tirar.fileName}" saiu do recibo`);
      setTirar(null);
      await Promise.all(RECARREGAR.map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    // os cliques aqui não abrem nem fecham a linha
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]" onClick={(e) => e.stopPropagation()}>
      <span className="text-muted inline-flex items-center gap-1"><Paperclip size={13} /> Recibo de entrega:</span>
      {m.recibos.map((r) => <ArquivoDoRecibo key={r.id} r={r} onTirar={podeMexer ? () => setTirar(r) : undefined} />)}
      {!m.recibos.length && <span className="text-muted">ainda não anexado</span>}
      {podeMexer && m.recibos.length < RECIBO.maxArquivos && <AnexarRecibo movementId={m.id} vagas={RECIBO.maxArquivos - m.recibos.length} jaTem={m.recibos.length > 0} />}
      <Confirmar open={!!tirar} onClose={() => setTirar(null)} onConfirm={confirmarTirar} loading={busy} titulo="Tirar o arquivo do recibo" botao="Tirar"
        texto={<>O arquivo <b>{tirar?.fileName}</b> sai desta movimentação. Ele continua guardado e fica registrado na auditoria.</>} />
    </div>
  );
}

/** O clipe na linha fechada da lista: tem recibo (e quantos arquivos). */
export function MarcaRecibo({ recibos }: { recibos: ReciboDeEntrega[] }) {
  if (!recibos.length) return null;
  const n = recibos.length;
  const texto = n === 1 ? `Recibo de entrega: ${recibos[0]!.fileName}` : `Recibo de entrega: ${n} arquivos`;
  // sem "sr-only" aqui: o texto escondido, posicionado fora da tabela que rola, alargava a página no celular
  return (
    <span className="inline-flex items-center gap-0.5 text-accent" title={texto} aria-label={texto} role="img">
      <Paperclip size={14} aria-hidden />{n > 1 && <span className="text-[12px] tnum" aria-hidden>{n}</span>}
    </span>
  );
}

/** No Movimentar: o recibo vai junto, na hora (opcional). Os arquivos já saem daqui prontos para subir. */
export function CampoRecibo({ prontos, onChange }: { prontos: ReciboPronto[]; onChange: (p: ReciboPronto[]) => void }) {
  const campo = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState('');
  const vagas = RECIBO.maxArquivos - prontos.length;
  const escolher = async (lista: FileList | null) => {
    const arquivos = [...(lista ?? [])];
    if (!arquivos.length) return;
    setLendo(true); setErro('');
    try {
      const { prontos: novos, erros } = await prepararVarios(arquivos, vagas);
      onChange([...prontos, ...novos]);
      setErro(erros.join(' '));
    } finally {
      setLendo(false);
      if (campo.current) campo.current.value = '';
    }
  };
  return (
    <div>
      <label className="label">Recibo de entrega <span className="font-normal text-muted">(opcional)</span></label>
      <div className="flex flex-wrap items-center gap-2">
        {prontos.map((p, i) => (
          <span key={`${p.fileName}-${i}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[13px] max-w-full">
            {p.tipo.startsWith('image/') ? <Foto size={14} className="shrink-0 text-muted" /> : <FileText size={14} className="shrink-0 text-muted" />}
            <span className="truncate">{p.fileName}</span>
            <span className="text-muted text-[12px] whitespace-nowrap">{tamanhoDoArquivo(p.bytes)}</span>
            <button type="button" className="text-muted hover:text-bad" onClick={() => onChange(prontos.filter((_, j) => j !== i))} aria-label={`Tirar ${p.fileName}`}><X size={13} /></button>
          </span>
        ))}
        {vagas > 0 && (
          <button type="button" className="btn-secondary btn-sm" disabled={lendo} onClick={() => campo.current?.click()}>
            {lendo ? <Spinner /> : <Paperclip size={14} />} {prontos.length ? 'Anexar outro arquivo' : 'Anexar o recibo'}
          </button>
        )}
        <input ref={campo} type="file" className="hidden" accept={ACEITA_RECIBO} multiple onChange={(e) => void escolher(e.target.files)} />
      </div>
      {erro
        ? <div className="text-bad text-[12.5px] mt-1">{erro}</div>
        : <div className="text-muted text-[12.5px] mt-1">PDF ou foto (até 10 MB cada, até {RECIBO.maxArquivos} arquivos). Se o recibo assinado só voltar depois, dá para anexar na lista de movimentações.</div>}
    </div>
  );
}
