/**
 * Gera `apps/web/src/api/novidades-demo.ts` a partir da nota mais recente de `docs/novidades/`.
 *
 * Só a PRÉVIA publicada precisa disso: ela não tem servidor nem banco, então a nota (com os
 * prints embutidos) vai junto do código. No sistema de verdade a nota vem do banco.
 *
 *   node scripts/gerar-novidades-demo.mjs [arquivo.md]
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = join(raiz, 'docs/novidades');
const MIMES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

const arquivo = process.argv[2]
  ? resolve(process.argv[2])
  : join(pasta, (await readdir(pasta)).filter((f) => f.endsWith('.md')).sort().pop());

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

const nota = { version: campo('versao'), title: campo('titulo'), summary: campo('resumo'), items: itens };
const saida = `/**
 * O conteúdo da nota de novidades que a PRÉVIA mostra no login (a mesma de ${nota.version}).
 * GERADO por \`scripts/gerar-novidades-demo.mjs\` a partir de \`docs/novidades/\` — não edite à mão.
 * No sistema de verdade a nota vem do banco, escrita na tela de Administração › Novidades.
 */
export type ItemDemo = { kind: 'novo' | 'melhorou' | 'corrigido' | 'atencao'; title: string; text: string; imagem?: string };
export const NOTA_DEMO: { version: string; title: string; summary: string; items: ItemDemo[] } = ${JSON.stringify(nota, null, 2)};
`;
await writeFile(join(raiz, 'apps/web/src/api/novidades-demo.ts'), saida);
console.log(`novidades-demo.ts: ${nota.version}, ${itens.length} itens, ${(saida.length / 1024).toFixed(0)} KB`);
