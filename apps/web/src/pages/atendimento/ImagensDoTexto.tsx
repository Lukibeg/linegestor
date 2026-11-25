/**
 * As imagens do relato e da descrição (Patch 2.4.11, o Luan: "quero poder colocar uma imagem aqui tbm nos relatos e
 * descrição"), no Abrir chamado e na ficha:
 *
 *  - cola-se o print com Ctrl+V na caixa do texto (o texto colado junto continua indo para a caixa), ou escolhe-se a imagem
 *    no botão Imagem;
 *  - só imagens (PNG, JPG, WEBP e GIF), de até 10 MB cada; de uma vez, até 10 imagens e 30 MB (o pedido não passa do que o
 *    servidor recebe); cada texto guarda até 20;
 *  - no Abrir chamado elas esperam o Abrir (aparecem em miniatura, com o X para tirar); na ficha vão na hora.
 */
import { useRef, type ClipboardEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { MAX_IMAGENS_DE_UMA_VEZ } from '@gestor/shared';
import { Spinner } from '../../components/ui/index.js';
import { lerComoDataUrl, tamanhoDoArquivo } from '../../lib/arquivos.js';

const TIPOS_DE_IMAGEM = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const EXTENSAO: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
export const MAX_MB_IMAGEM_DO_TEXTO = 10;
const MAX_BYTES = MAX_MB_IMAGEM_DO_TEXTO * 1024 * 1024;
/** de uma vez, até 30 MB: com o base64 (um terço a mais), o pedido fica abaixo dos 45 MB que o servidor recebe */
const MAX_BYTES_DE_UMA_VEZ = 30 * 1024 * 1024;

/** Uma imagem lida, esperando ir (o Abrir chamado) ou indo (a ficha). */
export type ImagemNova = { id: number; nome: string; tamanho: number; conteudo: string };

let sequencia = 0;

/** O print colado vem como "image.png": ganha um nome que diz quando foi. */
function nomeDoPrint(a: File): string {
  if (a.name && a.name !== 'image.png' && a.name !== 'image.jpg') return a.name;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `print-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${EXTENSAO[a.type] ?? 'png'}`;
}

/**
 * Lê as imagens escolhidas ou coladas: as que servem e, em palavras, o que ficou de fora (o que não é imagem, a grande demais,
 * a que passou do limite). `cabem`: quantas ainda cabem; `bytesJa`: o que já espera para ir junto (o Abrir chamado).
 */
export async function lerImagens(arquivos: File[], cabem: number, bytesJa = 0): Promise<{ imagens: ImagemNova[]; problemas: string[] }> {
  const problemas: string[] = [];
  const imagens: ImagemNova[] = [];
  const lugar = Math.min(cabem, MAX_IMAGENS_DE_UMA_VEZ);
  let bytes = bytesJa;
  if (lugar <= 0) return { imagens, problemas: [`Não cabe mais imagem: até ${MAX_IMAGENS_DE_UMA_VEZ} de uma vez (tire uma para pôr outra).`] };
  for (const a of arquivos) {
    if (!TIPOS_DE_IMAGEM.includes(a.type)) { problemas.push(`"${a.name || 'o arquivo'}" não é uma imagem (vão PNG, JPG, WEBP ou GIF; o resto vai na anotação).`); continue; }
    if (a.size > MAX_BYTES) { problemas.push(`"${a.name}" tem ${tamanhoDoArquivo(a.size)}: o limite é ${MAX_MB_IMAGEM_DO_TEXTO} MB por imagem.`); continue; }
    if (a.size === 0) { problemas.push(`"${a.name}" está vazia.`); continue; }
    if (imagens.length >= lugar) { problemas.push(`Até ${lugar} ${lugar === 1 ? 'imagem' : 'imagens'} agora: "${a.name}" ficou de fora.`); continue; }
    if (bytes + a.size > MAX_BYTES_DE_UMA_VEZ) { problemas.push(`"${a.name}" passa dos 30 MB de imagens de uma vez: ponha depois, na ficha.`); continue; }
    try {
      imagens.push({ id: ++sequencia, nome: nomeDoPrint(a), tamanho: a.size, conteudo: await lerComoDataUrl(a) });
      bytes += a.size;
    } catch {
      problemas.push(`Não deu para ler "${a.name}".`);
    }
  }
  return { imagens, problemas };
}

/**
 * As imagens que vieram no Ctrl+V da caixa do texto. Só o print (sem texto junto): o navegador não cola nada na caixa; com
 * texto junto, o texto entra na caixa normalmente.
 */
export function imagensColadas(e: ClipboardEvent<HTMLTextAreaElement>): File[] {
  const arquivos = [...e.clipboardData.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((x): x is File => !!x);
  if (arquivos.length && !e.clipboardData.getData('text/plain')) e.preventDefault();
  return arquivos;
}

/** O botão Imagem: a caixa de escolher (escondida, só imagens) e o botão. */
export function BotaoImagem({ rotulo, onEscolher, ocupado = false, desativado = false, id }: {
  rotulo: string; onEscolher: (arquivos: File[]) => void; ocupado?: boolean; desativado?: boolean; id?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={entrada} type="file" accept={TIPOS_DE_IMAGEM.join(',')} multiple className="hidden" aria-hidden tabIndex={-1}
        onChange={(e) => { const xs = [...(e.target.files ?? [])]; e.target.value = ''; onEscolher(xs); }} />
      <button type="button" id={id} className="btn-ghost btn-sm -my-1" disabled={desativado || ocupado} onClick={() => entrada.current?.click()}
        aria-label={rotulo} title={`${rotulo} (PNG, JPG, WEBP ou GIF, até ${MAX_MB_IMAGEM_DO_TEXTO} MB; o print também vai com Ctrl+V na caixa)`} data-imagem-do-texto="">
        {ocupado ? <Spinner className="!w-3.5 !h-3.5" /> : <ImagePlus size={13} aria-hidden />} Imagem
      </button>
    </>
  );
}

/** As miniaturas das imagens que esperam o Abrir (com o X para tirar). */
export function MiniaturasNovas({ lista, onTirar }: { lista: ImagemNova[]; onTirar: (id: number) => void }) {
  if (!lista.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2" data-imagens-novas="">
      {lista.map((a) => (
        <li key={a.id} className="relative group">
          <span className="block rounded-md border border-line overflow-hidden bg-surface" title={`${a.nome} · ${tamanhoDoArquivo(a.tamanho)}`}>
            <img src={a.conteudo} alt={a.nome} className="h-16 max-w-[140px] w-auto object-cover" />
          </span>
          <button type="button" onClick={() => onTirar(a.id)} aria-label={`Tirar ${a.nome}`} title={`Tirar ${a.nome}`}
            className="absolute -top-1.5 -right-1.5 grid place-items-center w-5 h-5 rounded-full bg-surface border border-line text-muted hover:text-bad shadow-sm">
            <X size={12} aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
