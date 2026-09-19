/**
 * Importa as notas de novidades escritas em `docs/novidades/*.md` para o banco.
 *
 * Roda sozinho na publicação (o contêiner chama depois das migrações), e pode rodar quantas
 * vezes quiser: nota cuja **versão** já existe é ignorada. Assim a nota de cada rodada chega
 * pronta e publicada, e quem administra continua podendo editá-la pela tela.
 *
 * O formato do arquivo (ver `docs/novidades/rodada-23.md`):
 *
 *     ---
 *     versao: rodada-23
 *     titulo: O que mudou
 *     resumo: Uma frase.
 *     ---
 *
 *     ## novo · Título do item
 *     Duas ou três linhas.
 *     ![](rodada-23/print.jpg)
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '@gestor/db';
import type { NovidadeGravar, NovidadeItem } from '@gestor/shared';
import { loadConfig } from '../config.js';
import * as svc from '../services/releaseNotes.js';

const aqui = dirname(fileURLToPath(import.meta.url));
/** A pasta das notas: `docs/novidades` na raiz do repositório (ou a passada no comando). */
const PASTA = process.argv[2] ? resolve(process.argv[2]) : resolve(aqui, '../../../../docs/novidades');

const TIPOS = ['novo', 'melhorou', 'corrigido', 'atencao'] as const;
const MIMES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

/** Lê o arquivo e devolve a nota no formato que o servidor grava. */
export async function lerNota(caminho: string): Promise<NovidadeGravar> {
  const texto = await readFile(caminho, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(texto);
  if (!m) throw new Error(`${caminho}: falta o cabeçalho entre "---"`);
  const [, cabecalho, corpo] = m as unknown as [string, string, string];

  const campo = (nome: string) => new RegExp(`^${nome}:\\s*(.+)$`, 'm').exec(cabecalho)?.[1]?.trim();
  const version = campo('versao');
  const title = campo('titulo');
  if (!version || !title) throw new Error(`${caminho}: informe "versao" e "titulo" no cabeçalho`);

  const items: NovidadeItem[] = [];
  // cada "## " começa um item; o que vem antes do primeiro é ignorado
  for (const bloco of corpo.split(/^##\s+/m).slice(1)) {
    const linhas = bloco.split(/\r?\n/);
    const cabeca = (linhas.shift() ?? '').trim();
    // "novo · Título" (aceita · ou | como separador); sem separador, o tipo é "novo"
    const sep = /^([a-zç]+)\s*[·|]\s*(.+)$/i.exec(cabeca);
    const kind = sep && (TIPOS as readonly string[]).includes(sep[1]!.toLowerCase()) ? (sep[1]!.toLowerCase() as NovidadeItem['kind']) : 'novo';
    const title2 = sep ? sep[2]!.trim() : cabeca;

    let imagem: string | null | undefined;
    const textoLinhas: string[] = [];
    for (const linha of linhas) {
      const img = /^!\[[^\]]*\]\(([^)]+)\)\s*$/.exec(linha.trim());
      if (img) {
        const arquivo = join(dirname(caminho), img[1]!);
        const mime = MIMES[extname(arquivo).toLowerCase()];
        if (!mime) throw new Error(`${caminho}: imagem em formato não suportado (${img[1]})`);
        imagem = `data:${mime};base64,${(await readFile(arquivo)).toString('base64')}`;
        continue;
      }
      textoLinhas.push(linha);
    }
    // as quebras de linha do arquivo são só para o texto não passar de 100 colunas;
    // e o **negrito** do markdown sai, porque na tela isto é texto puro
    const text = textoLinhas.join('\n').trim().replace(/\s*\n\s*/g, ' ').replace(/\*\*([^*]+)\*\*/g, '$1') || null;
    items.push({ kind, title: title2, text, ...(imagem ? { imagem } : {}) });
  }
  if (!items.length) throw new Error(`${caminho}: a nota não tem nenhum item ("## tipo · título")`);
  return { version, title, summary: campo('resumo') ?? null, items };
}

async function principal() {
  let arquivos: string[];
  try {
    arquivos = (await readdir(PASTA)).filter((f) => f.endsWith('.md')).sort();
  } catch {
    console.log(`Novidades: nada a importar (pasta ${PASTA} não existe).`);
    return;
  }
  if (!arquivos.length) return console.log('Novidades: nenhuma nota para importar.');

  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  try {
    for (const arquivo of arquivos) {
      const nota = await lerNota(join(PASTA, arquivo));
      const r = await svc.importar(db, nota);
      console.log(r.criada ? `Novidades: ${r.version} importada e publicada (${nota.items.length} itens).` : `Novidades: ${r.version} já estava no sistema.`);
    }
  } finally {
    await pool.end();
  }
}

// só roda quando este arquivo É o comando; quem o importa (os testes) leva só o `lerNota`
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await principal();
