/**
 * Gera `apps/web/src/api/novidades-demo.ts` a partir da nota mais recente de `docs/novidades/`.
 *
 * Só a PRÉVIA publicada precisa disso: ela não tem servidor nem banco, então a nota (com os
 * prints embutidos) vai junto do código. No sistema de verdade a nota vem do banco.
 * O vídeo do patch (1.9, `video:` no cabeçalho) não vai embutido — são megas: entra como arquivo
 * da prévia (o Vite copia para `assets/`), importado pelo caminho.
 *
 *   node scripts/gerar-novidades-demo.mjs [arquivo.md]
 */
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = join(raiz, 'docs/novidades');
const destino = join(raiz, 'apps/web/src/api/novidades-demo.ts');
const MIMES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
const MIMES_DO_VIDEO = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };

/** "1.2" antes de "1.10": compara número a número, não letra a letra. */
const compararVersoes = (a, b) => {
  const partes = (v) => v.replace(/\.md$/, '').split(/[._-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const pa = partes(a), pb = partes(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x === y) continue;
    return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
  }
  return 0;
};

const arquivo = process.argv[2]
  ? resolve(process.argv[2])
  : join(pasta, (await readdir(pasta)).filter((f) => f.endsWith('.md')).sort(compararVersoes).pop());

const texto = await readFile(arquivo, 'utf8');
const [, cabecalho, corpo] = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(texto);
const campo = (nome) => new RegExp(`^${nome}:\\s*(.+)$`, 'm').exec(cabecalho)?.[1]?.trim() ?? '';

const itens = [];
for (const bloco of corpo.split(/^##\s+/m).slice(1)) {
  const linhas = bloco.split(/\r?\n/);
  const cabeca = (linhas.shift() ?? '').trim();
  const sep = /^([a-zç]+)\s*[·|]\s*(.+)$/i.exec(cabeca);
  const kind = sep && ['novo', 'melhorou', 'corrigido', 'atencao'].includes(sep[1].toLowerCase()) ? sep[1].toLowerCase() : 'novo';
  const title = sep ? sep[2].trim() : cabeca;
  let imagem;
  const textoLinhas = [];
  for (const linha of linhas) {
    const img = /^!\[[^\]]*\]\(([^)]+)\)\s*$/.exec(linha.trim());
    if (img) {
      const caminho = join(dirname(arquivo), img[1]);
      imagem = `data:${MIMES[extname(caminho).toLowerCase()]};base64,${(await readFile(caminho)).toString('base64')}`;
      continue;
    }
    textoLinhas.push(linha);
  }
  itens.push({ kind, title, text: textoLinhas.join('\n').trim().replace(/\s*\n\s*/g, ' ').replace(/\*\*([^*]+)\*\*/g, '$1'), imagem });
}

// o vídeo do patch: o caminho (para o Vite levar o arquivo junto), o nome, o tamanho e o tipo
let video = null;
if (campo('video')) {
  const arquivoDoVideo = join(dirname(arquivo), campo('video'));
  const tipo = MIMES_DO_VIDEO[extname(arquivoDoVideo).toLowerCase()];
  if (!tipo) throw new Error(`vídeo em formato não suportado: ${campo('video')}`);
  video = { caminho: relative(dirname(destino), arquivoDoVideo).split('\\').join('/'), nome: basename(arquivoDoVideo), tamanho: (await stat(arquivoDoVideo)).size, tipo };
}

const nota = { version: campo('versao'), title: campo('titulo'), summary: campo('resumo'), items: itens };
const json = JSON.stringify(nota, null, 2);
const saida = `/**
 * O conteúdo da nota de novidades que a PRÉVIA mostra no login (a mesma de ${nota.version}).
 * GERADO por \`scripts/gerar-novidades-demo.mjs\` a partir de \`docs/novidades/\` — não edite à mão.
 * No sistema de verdade a nota vem do banco, escrita na tela de Administração › Novidades.
 */
${video ? `// o vídeo do patch vai como arquivo da prévia (o Vite copia para assets/), não embutido\nimport VIDEO_DA_NOTA from '${video.caminho}';\n\n` : ''}export type ItemDemo = { kind: 'novo' | 'melhorou' | 'corrigido' | 'atencao'; title: string; text: string; imagem?: string };
export type VideoDemo = { url: string; nome: string; tamanho: number; tipo: string };
export const NOTA_DEMO: { version: string; title: string; summary: string; items: ItemDemo[]; video?: VideoDemo } = ${
  video ? `${json.slice(0, -2)},\n  "video": { "url": VIDEO_DA_NOTA, "nome": ${JSON.stringify(video.nome)}, "tamanho": ${video.tamanho}, "tipo": ${JSON.stringify(video.tipo)} }\n}` : json
};
`;
await writeFile(destino, saida);
console.log(`novidades-demo.ts: ${nota.version}, ${itens.length} itens${video ? `, o vídeo ${video.nome} (${(video.tamanho / 1024 / 1024).toFixed(1)} MB, como arquivo)` : ''}, ${(saida.length / 1024).toFixed(0)} KB`);
