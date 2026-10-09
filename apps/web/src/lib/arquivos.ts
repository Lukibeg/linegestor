/**
 * O arquivo que a pessoa escolhe no computador ou no celular, pronto para subir: lido como
 * "data:…" e, quando é foto grande, reduzido antes (a foto de 5 MB do celular vira umas centenas
 * de KB e o recibo continua legível — e o banco, que entra no backup, agradece).
 */
import { problemaDoRecibo, RECIBO, tipoDeclaradoDoRecibo, tipoDoRecibo } from '@gestor/shared';

/** "245 KB", "2,1 MB". */
export function tamanhoDoArquivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export const lerComoDataUrl = (arquivo: Blob) => new Promise<string>((ok, falhou) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => falhou(new Error('Não consegui ler esse arquivo'));
  r.readAsDataURL(arquivo);
});

/**
 * A foto com no máximo `lado` px no lado maior, em JPEG — recibo é papel, e papel fotografado em
 * PNG fica enorme. A foto que já é pequena (até o lado e até 1,5 MB) sobe como está.
 */
async function reduzirFoto(arquivo: File, lado: number): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falhou) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falhou(new Error(`"${arquivo.name}" não abriu como foto. Tente outra (JPG ou PNG) ou o PDF.`));
      i.src = url;
    });
    if (Math.max(img.width, img.height) <= lado && arquivo.size <= 1_500_000) return arquivo;
    const escala = Math.min(1, lado / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * escala));
    c.height = Math.max(1, Math.round(img.height * escala));
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Este navegador não conseguiu preparar a foto.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, falhou) => c.toBlob((b) => (b ? ok(b) : falhou(new Error('Não deu para preparar a foto.'))), 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

/** Um arquivo do recibo pronto para subir. */
export type ReciboPronto = { fileName: string; conteudo: string; bytes: number; tipo: string };

/**
 * Confere o tipo, reduz a foto, confere o tamanho e lê. O erro já vem com a frase para a pessoa
 * (as mesmas regras do servidor, em `@gestor/shared/recibo.ts`).
 */
export async function prepararRecibo(arquivo: File): Promise<ReciboPronto> {
  // o tipo de verdade, pelos primeiros bytes (como o servidor confere): o ".pdf" que não é PDF já
  // avisa aqui, e não depois de a movimentação ser gravada. O arquivo vazio fica com o tipo
  // declarado, para o aviso ser "está vazio".
  const inicio = new Uint8Array(await arquivo.slice(0, 16).arrayBuffer());
  const tipo = tipoDoRecibo(inicio) ?? (arquivo.size > 0 ? '' : tipoDeclaradoDoRecibo({ nome: arquivo.name, tipo: arquivo.type }));
  const foto = tipo.startsWith('image/');
  // a foto grande ainda vai ser reduzida: o tamanho dela só conta depois
  const antes = problemaDoRecibo({ nome: arquivo.name, tipo, bytes: foto ? Math.min(arquivo.size, 1) : arquivo.size });
  if (antes) throw new Error(antes);
  const corpo = foto ? await reduzirFoto(arquivo, RECIBO.ladoMaximoDaFoto) : arquivo;
  const tipoFinal = corpo === arquivo ? tipo : corpo.type;
  const problema = problemaDoRecibo({ nome: arquivo.name, tipo: tipoFinal, bytes: corpo.size });
  if (problema) throw new Error(problema);
  // a foto reduzida virou JPG: o nome acompanha
  const fileName = corpo === arquivo ? arquivo.name : `${arquivo.name.replace(/\.[^.]+$/, '') || 'recibo'}.jpg`;
  return { fileName, conteudo: await lerComoDataUrl(corpo), bytes: corpo.size, tipo: tipoFinal };
}
