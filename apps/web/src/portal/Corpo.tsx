/**
 * O tutorial desenhado — o mesmo no portal do cliente e no "Ver como fica" da equipe (Patch 1.8).
 *
 * É o texto simples da base (linha com número vira passo, crases viram comando com Copiar,
 * `[print:id]` vira a imagem) e mais o que só o portal tem: `[video:id]` vira o vídeo, que toca ali
 * mesmo, e `[arquivo:id]` vira o botão de baixar. O "BC-12" da base não vira link aqui: o cliente
 * não vê a base da equipe.
 *
 * Feito para o celular: letra maior, passo com número grande, o print abre na tela inteira.
 */
import { Fragment, useEffect, useState } from 'react';
import { Check, Copy, Download, FileArchive, FileSpreadsheet, FileText, File as IconeArquivo, X, ZoomIn } from 'lucide-react';
import { blocosDoTexto, pedacosDaLinha, type BlocoTexto } from '@gestor/shared';
import { IS_DEMO, logoSrc } from '../api/index.js';
import type { ArquivoDoPortal } from '../api/types.js';

/** O endereço que vai para o cliente (no WhatsApp): o do próprio sistema, com o caminho do tutorial. */
export function linkDoPortal(caminho: string): string {
  try {
    // na prévia os endereços têm "#" (a página não tem servidor próprio)
    return IS_DEMO ? `${location.origin}${location.pathname}#${caminho}` : `${location.origin}${caminho}`;
  } catch { return caminho; }
}

export const tamanhoDoArquivo = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`);

/** Onde está cada arquivo citado no texto (o id → o arquivo, com o endereço pronto). */
export type MapaDeArquivos = Record<string, ArquivoDoPortal>;
export const mapaDeArquivos = (lista: ArquivoDoPortal[]): MapaDeArquivos =>
  Object.fromEntries(lista.map((a) => [a.id, { ...a, url: logoSrc(a.url) ?? a.url }]));

function iconeDoArquivo(a: ArquivoDoPortal) {
  const nome = a.nome.toLowerCase();
  if (a.mimeType.includes('pdf') || /\.(pdf|docx?|odt|txt)$/.test(nome)) return FileText;
  if (/(sheet|excel|csv)/.test(a.mimeType) || /\.(xlsx?|ods|csv)$/.test(nome)) return FileSpreadsheet;
  if (/(zip|rar|7z|tar|gzip)/.test(a.mimeType) || /\.(zip|rar|7z|gz|tgz)$/.test(nome)) return FileArchive;
  return IconeArquivo;
}

function Copiavel({ texto }: { texto: string }) {
  const [copiou, setCopiou] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiou(true); setTimeout(() => setCopiou(false), 1600); } catch { /* sem área de transferência: dá para selecionar o texto */ }
  };
  return (
    <div className="mt-2 flex items-start gap-2 rounded-xl border border-line bg-surface-2 py-2 pl-3.5 pr-2 min-w-0">
      <code className="flex-1 min-w-0 overflow-x-auto whitespace-pre font-mono text-[14px] text-ink py-1">{texto}</code>
      <button type="button" className="btn-secondary btn-sm shrink-0" onClick={copiar} title="Copiar">
        {copiou ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
      </button>
    </div>
  );
}

/** Uma linha com os links e o `código` desenhados. O "BC-12" fica como texto (é da base da equipe). */
function Linha({ texto }: { texto: string }) {
  return (
    <>
      {pedacosDaLinha(texto).map((p, i) => {
        if (p.tipo === 'codigo') return <code key={i} className="font-mono text-[0.9em] bg-surface-2 border border-line rounded px-1">{p.texto}</code>;
        if (p.tipo === 'link') return <a key={i} className="link break-all" href={p.href} target="_blank" rel="noreferrer">{p.texto}</a>;
        return <Fragment key={i}>{p.texto}</Fragment>;
      })}
    </>
  );
}

function Faltando({ o }: { o: string }) {
  return <div className="mt-2 rounded-xl border border-dashed border-line px-3.5 py-2.5 text-[13px] text-muted">{o} que não está mais neste tutorial.</div>;
}

/** O print: aberto, ocupa a tela inteira (no celular, dá para ver os detalhes). */
function Print({ a }: { a?: ArquivoDoPortal }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto]);
  if (!a) return <Faltando o="Imagem" />;
  return (
    <>
      <button type="button" className="group relative block mt-2 max-w-[600px] w-full text-left" onClick={() => setAberto(true)} title="Ver a imagem inteira">
        <img src={a.url} alt={a.nome} loading="lazy" className="w-full h-auto rounded-xl border border-line bg-white" />
        <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/60 text-white text-[12px] px-1.5 py-0.5 opacity-80 group-hover:opacity-100"><ZoomIn size={13} /> ampliar</span>
      </button>
      {aberto && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={a.nome} onClick={() => setAberto(false)}>
          <img src={a.url} alt={a.nome} className="max-w-full max-h-full object-contain rounded-lg bg-white" />
          <button type="button" className="absolute top-3 right-3 rounded-full bg-white/90 text-black p-2" aria-label="Fechar" onClick={() => setAberto(false)}><X size={18} /></button>
        </div>
      )}
    </>
  );
}

function Video({ a }: { a?: ArquivoDoPortal }) {
  if (!a) return <Faltando o="Vídeo" />;
  // o "#t=0.1" faz o iPhone mostrar o primeiro quadro no lugar do retângulo preto (não vale para "data:", da prévia)
  const src = a.url.startsWith('data:') ? a.url : `${a.url}#t=0.1`;
  return (
    <div className="mt-2 max-w-[760px]">
      {/* preload="metadata": só baixa o vídeo quando a pessoa aperta o play (o celular agradece) */}
      <video controls playsInline preload="metadata" src={src} className="w-full max-h-[70vh] rounded-xl bg-black" aria-label={a.nome} />
    </div>
  );
}

function Arquivo({ a }: { a?: ArquivoDoPortal }) {
  if (!a) return <Faltando o="Arquivo" />;
  const Icone = iconeDoArquivo(a);
  return (
    <a href={a.url} download={a.nome} className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-surface p-3 max-w-[520px] hover:border-accent transition-colors">
      <span className="w-10 h-10 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0"><Icone size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[14.5px] truncate">{a.nome}</span>
        <span className="block text-[12.5px] text-muted">{tamanhoDoArquivo(a.tamanho)}</span>
      </span>
      <span className="btn-secondary btn-sm shrink-0"><Download size={14} /> Baixar</span>
    </a>
  );
}

function Bloco({ b, arquivos }: { b: BlocoTexto; arquivos: MapaDeArquivos }) {
  switch (b.tipo) {
    case 'paragrafo': return <p className="whitespace-pre-line"><Linha texto={b.texto} /></p>;
    case 'item': return <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-1.5"><span className="text-accent font-bold">•</span><span><Linha texto={b.texto} /></span></div>;
    case 'comando': return <Copiavel texto={b.texto} />;
    case 'imagem': return <Print a={arquivos[b.anexoId]} />;
    case 'video': return <Video a={arquivos[b.arquivoId]} />;
    case 'arquivo': return <Arquivo a={arquivos[b.arquivoId]} />;
    case 'passo':
      return (
        <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
          <span className="w-8 h-8 rounded-full bg-accent text-white text-[14px] font-display font-semibold flex items-center justify-center shrink-0" aria-hidden>{b.numero}</span>
          <div className="min-w-0 pt-1">
            <span className="sr-only">Passo {b.numero}: </span>
            <Linha texto={b.texto} />
            {b.dentro.map((d, i) => <div key={i} className={d.tipo === 'paragrafo' ? 'mt-1.5 text-ink-2' : ''}><Bloco b={d} arquivos={arquivos} /></div>)}
          </div>
        </div>
      );
  }
}

/** O texto do tutorial, desenhado. `arquivos` diz onde está cada print, vídeo e arquivo citado. */
export function CorpoDoTutorial({ texto, arquivos }: { texto: string | null | undefined; arquivos: MapaDeArquivos }) {
  const blocos = blocosDoTexto(texto, { midia: true });
  if (!blocos.length) return null;
  return <div className="flex flex-col gap-4 text-[16px] leading-relaxed text-ink">{blocos.map((b, i) => <Bloco key={i} b={b} arquivos={arquivos} />)}</div>;
}
