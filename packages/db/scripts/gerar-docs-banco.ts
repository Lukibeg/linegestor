/**
 * Gera `docs/banco-de-dados.md` a partir dos comentários do `src/schema.ts`.
 *
 * Lê o arquivo do schema, encontra cada tabela (`pgTable('nome', {...})`) e cada coluna,
 * pega o comentário logo acima de cada um e monta uma página em português.
 * Assim a documentação nunca fica diferente do banco: ela É o banco, explicado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, '../src/schema.ts');
const outPath = path.resolve(here, '../../../docs/banco-de-dados.md');
const src = fs.readFileSync(schemaPath, 'utf8');

type Col = { name: string; sqlName: string; type: string; desc: string; flags: string[] };
type Table = { varName: string; sqlName: string; desc: string; group: string; cols: Col[] };

const lines = src.split('\n');
const tables: Table[] = [];
let group = '';
let pendingDoc: string[] = [];
let current: Table | null = null;
let inDocBlock = false;

const grupoRe = /^\/\/ (\d\. [A-ZÇÃÕÉÊÁÍÓÚ][^\n]*)/;
const tabelaRe = /^export const (\w+) = pgTable\(\s*$|^export const (\w+) = pgTable\('(\w+)'/;
const tabelaNomeRe = /^\s*'(\w+)',\s*$/;
const colunaRe = /^\s{4}(\w+): (\w+)\('(\w+)'([^)]*)\)([^,]*),?\s*$/;
const colunaHelperRe = /^\s{4}(\w+): (createdAt|updatedAt|deletedAt|id)\(\),?\s*$/;

function flushDoc(): string {
  const d = pendingDoc.join(' ').replace(/\s+/g, ' ').trim();
  pendingDoc = [];
  return d;
}

for (const raw of lines) {
  const line = raw.replace(/\r$/, '');
  const g = line.match(grupoRe);
  if (g) { group = g[1]!; continue; }

  if (line.trim().startsWith('/**') && line.trim().endsWith('*/')) { pendingDoc = [line.trim().slice(3, -2)]; continue; }
  if (line.trim().startsWith('/**')) { inDocBlock = true; pendingDoc = []; continue; }
  if (inDocBlock) {
    if (line.trim().endsWith('*/')) { inDocBlock = false; continue; }
    pendingDoc.push(line.trim().replace(/^\*\s?/, ''));
    continue;
  }

  const t = line.match(tabelaRe);
  if (t) {
    const varName = (t[1] ?? t[2])!;
    current = { varName, sqlName: t[3] ?? '', desc: flushDoc(), group, cols: [] };
    tables.push(current);
    continue;
  }
  if (current && !current.sqlName) {
    const n = line.match(tabelaNomeRe);
    if (n) { current.sqlName = n[1]!; continue; }
  }
  if (current) {
    const h = line.match(colunaHelperRe);
    if (h) {
      const map: Record<string, Col> = {
        id: { name: 'id', sqlName: 'id', type: 'texto', desc: 'Identificador único da linha', flags: ['chave primária'] },
        createdAt: { name: 'createdAt', sqlName: 'created_at', type: 'data e hora', desc: 'Quando a linha foi criada', flags: [] },
        updatedAt: { name: 'updatedAt', sqlName: 'updated_at', type: 'data e hora', desc: 'Última alteração', flags: [] },
        deletedAt: { name: 'deletedAt', sqlName: 'deleted_at', type: 'data e hora', desc: 'Preenchido quando está na lixeira', flags: [] },
      };
      const c = map[h[2]!]!;
      current.cols.push({ ...c, desc: pendingDoc.length ? flushDoc() : c.desc });
      continue;
    }
    const c = line.match(colunaRe);
    if (c) {
      const tipo: Record<string, string> = { text: 'texto', integer: 'número inteiro', boolean: 'sim/não', timestamp: 'data e hora', jsonb: 'JSON' };
      const rest = (c[4] ?? '') + (c[5] ?? '');
      const flags: string[] = [];
      if (/\.primaryKey\(\)/.test(rest)) flags.push('chave primária');
      if (/\.notNull\(\)/.test(rest)) flags.push('obrigatório');
      if (/\.unique\(\)/.test(rest)) flags.push('único');
      const ref = rest.match(/references\(\(\) => (\w+)\.id/);
      if (ref) flags.push(`liga com **${ref[1]}**`);
      const def = rest.match(/\.default\(([^)]*)\)/);
      if (def) flags.push(`padrão: ${def[1]}`);
      if (/\.array\(\)/.test(rest)) flags.push('lista');
      current.cols.push({ name: c[1]!, sqlName: c[3]!, type: tipo[c[2]!] ?? c[2]!, desc: flushDoc(), flags });
      continue;
    }
    if (/^\);|^\s*\(t\) => \[/.test(line)) { if (/^\);/.test(line)) current = null; }
  }
}

let md = `# Banco de dados — o que o Gestor guarda\n\n> Gerado automaticamente a partir de \`packages/db/src/schema.ts\` por \`pnpm db:docs\`. **Não edite à mão**: edite o comentário no schema e gere de novo.\n\n`;
md += `Cada seção é uma tabela (pense numa planilha com colunas fixas). "Liga com" indica que a coluna guarda o identificador de uma linha de outra tabela — é assim que as tabelas se relacionam.\n\n`;
md += `Convenções: dinheiro em centavos inteiros · CNPJ, DID e MAC guardados só com dígitos/hexadecimais · \`deleted_at\` preenchido = lixeira · senhas só na tabela **secrets**, cifradas.\n\n`;
md += `## Índice\n\n` + tables.map((t) => `- [${t.sqlName}](#${t.sqlName}) — ${(t.desc.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? t.desc)}`).join('\n') + '\n\n';

let lastGroup = '';
for (const t of tables) {
  if (t.group !== lastGroup) { md += `\n---\n\n# ${t.group}\n\n`; lastGroup = t.group; }
  md += `## ${t.sqlName}\n\n${t.desc}\n\n| Coluna | Tipo | O que guarda | Regras |\n|---|---|---|---|\n`;
  for (const c of t.cols) md += `| \`${c.sqlName}\` | ${c.type} | ${c.desc || '—'} | ${c.flags.join(' · ') || '—'} |\n`;
  md += '\n';
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md);
console.log(`Documentação gerada: ${path.relative(process.cwd(), outPath)} (${tables.length} tabelas)`);
