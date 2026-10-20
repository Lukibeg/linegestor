/**
 * Uma planilha do Excel (.xlsx) montada aqui, sem biblioteca (Patch 2.0.2, o Simulador do Comercial: "exportar
 * para Excel com as fórmulas"): as folhas, as células (texto, número ou fórmula com o valor já calculado), a
 * largura das colunas e um punhado de estilos — o título, a seção, o cabeçalho da tabela, os reais, o
 * percentual e o amarelo das células que a pessoa pode mudar. O mesmo código monta o arquivo no servidor (que
 * registra na auditoria) e na prévia.
 *
 * O .xlsx é um zip de XMLs; aqui, sem compressão (o Excel, o LibreOffice e o Google Planilhas abrem igual, e a
 * planilha de uma simulação tem poucos KB). A fórmula vai com o valor calculado (quem só mostra o arquivo,
 * sem refazer a conta, mostra certo) e o Excel refaz tudo ao abrir.
 */

export const TIPO_DO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Os estilos que a célula pode ter (a ordem aqui é a do styles.xml). */
export const ESTILOS_DA_CELULA = [
  'normal', 'titulo', 'sub', 'nota', 'secao', 'cabecalho', 'forte',
  'reais', 'reaisForte', 'reaisTotal', 'rotuloTotal', 'reaisEntrada', 'reaisUnidadeEntrada',
  'pct', 'pctForte', 'pctEntrada', 'inteiro', 'inteiroEntrada',
] as const;
export type EstiloDaCelula = (typeof ESTILOS_DA_CELULA)[number];

export type CelulaDaPlanilha = {
  /** o valor; na fórmula, o já calculado (o Excel refaz ao abrir). Nulo ou sem: a célula só com o estilo. */
  v?: string | number | null;
  /** a fórmula, sem o "=" (em inglês, com vírgula: IF(A1>0,B1/A1,"")) */
  f?: string;
  s?: EstiloDaCelula;
};

export type FolhaDaPlanilha = {
  nome: string;
  /** a largura de cada coluna (em caracteres), a partir da A */
  larguras?: number[];
  /** as linhas, a partir da 1; em cada uma, as células a partir da A (nulo = vazia) */
  linhas: Array<Array<CelulaDaPlanilha | null> | null>;
  /** imprimir deitada, com a largura numa página só (a folha larga) */
  paisagem?: boolean;
};

/** A letra da coluna: 0 → A, 25 → Z, 26 → AA. */
export function letraDaColuna(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** O nome da folha como o Excel aceita: sem []:*?/\, até 31 letras, sem repetir (a segunda ganha " (2)"). */
export function nomesDasFolhas(nomes: string[]): string[] {
  const usados = new Set<string>();
  return nomes.map((bruto) => {
    const base = (bruto.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '') || 'Folha').slice(0, 31).trim();
    let nome = base;
    for (let i = 2; usados.has(nome.toLocaleLowerCase('pt-BR')); i++) nome = `${base.slice(0, 31 - ` (${i})`.length).trim()} (${i})`;
    usados.add(nome.toLocaleLowerCase('pt-BR'));
    return nome;
  });
}

/** A referência a uma célula de outra folha: 'Cenário A'!B7. */
export const refDaFolha = (folha: string, celula: string) => `'${folha.replace(/'/g, "''")}'!${celula}`;

// =====================================================================
//  O XML
// =====================================================================

/** O texto dentro do XML: sem os caracteres de controle (o XML não aceita) e com &, <, > e " escapados. */
function xml(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CABECA = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Um número como o XML do Excel guarda: com ponto, sem notação científica nos pequenos de dinheiro. */
function numero(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const s = String(n);
  return /e/i.test(s) ? n.toFixed(12).replace(/\.?0+$/, '') : s;
}

function celulaXml(c: CelulaDaPlanilha, ref: string): string {
  const s = ESTILOS_DA_CELULA.indexOf(c.s ?? 'normal');
  const estilo = s > 0 ? ` s="${s}"` : '';
  if (c.f != null) {
    const v = c.v;
    if (typeof v === 'number') return `<c r="${ref}"${estilo}><f>${xml(c.f)}</f><v>${numero(v)}</v></c>`;
    return `<c r="${ref}"${estilo} t="str"><f>${xml(c.f)}</f><v>${xml(v ?? '')}</v></c>`;
  }
  if (typeof c.v === 'number') return `<c r="${ref}"${estilo}><v>${numero(c.v)}</v></c>`;
  if (typeof c.v === 'string' && c.v !== '') return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
  return estilo ? `<c r="${ref}"${estilo}/>` : '';
}

function folhaXml(f: FolhaDaPlanilha, primeira: boolean): string {
  const cols = (f.larguras ?? []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${numero(w)}" customWidth="1"/>`).join('');
  const linhas = f.linhas.map((linha, i) => {
    if (!linha) return '';
    const celulas = linha.map((c, j) => (c ? celulaXml(c, `${letraDaColuna(j)}${i + 1}`) : '')).join('');
    return celulas ? `<row r="${i + 1}">${celulas}</row>` : '';
  }).join('');
  return `${CABECA}<worksheet xmlns="${NS}" xmlns:r="${NS_R}">`
    + (f.paisagem ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '')
    + `<sheetViews><sheetView workbookViewId="0"${primeira ? ' tabSelected="1"' : ''}/></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + (cols ? `<cols>${cols}</cols>` : '')
    + `<sheetData>${linhas}</sheetData>`
    + '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
    + (f.paisagem ? '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' : '')
    + '</worksheet>';
}

/**
 * Os estilos. As fontes: 0 normal, 1 negrito, 2 o título, 3 a cinza pequena, 4 a nota (itálico), 5 a seção (azul).
 * Os fundos: 0 e 1 os que o Excel exige, 2 o amarelo de "pode mudar", 3 o cinza do cabeçalho. As bordas: 0
 * nenhuma, 1 embaixo, 2 em cima (o total), 3 em volta (a célula amarela).
 */
const XF: Record<EstiloDaCelula, { numFmt?: number; font?: number; fill?: number; border?: number; quebra?: boolean }> = {
  normal: {}, titulo: { font: 2 }, sub: { font: 3 }, nota: { font: 4 }, secao: { font: 5 },
  cabecalho: { font: 1, fill: 3, border: 1, quebra: true }, forte: { font: 1 },
  reais: { numFmt: 164 }, reaisForte: { numFmt: 164, font: 1 }, reaisTotal: { numFmt: 164, font: 1, border: 2 }, rotuloTotal: { font: 1, border: 2 },
  reaisEntrada: { numFmt: 164, fill: 2, border: 3 }, reaisUnidadeEntrada: { numFmt: 165, fill: 2, border: 3 },
  pct: { numFmt: 166 }, pctForte: { numFmt: 166, font: 1 }, pctEntrada: { numFmt: 166, fill: 2, border: 3 },
  inteiro: { numFmt: 3 }, inteiroEntrada: { numFmt: 3, fill: 2, border: 3 },
};

function estilosXml(): string {
  const fonte = (o: { negrito?: boolean; italico?: boolean; tamanho?: number; cor?: string }) =>
    `<font>${o.negrito ? '<b/>' : ''}${o.italico ? '<i/>' : ''}<sz val="${o.tamanho ?? 11}"/><color rgb="${o.cor ?? 'FF0F172A'}"/><name val="Calibri"/><family val="2"/></font>`;
  const fontes = [
    fonte({}), fonte({ negrito: true }), fonte({ negrito: true, tamanho: 14 }), fonte({ tamanho: 10, cor: 'FF64748B' }),
    fonte({ italico: true, tamanho: 9, cor: 'FF64748B' }), fonte({ negrito: true, cor: 'FF1D4ED8' }),
  ];
  const solido = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fundos = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', solido('FFFFF4CC'), solido('FFEEF2F6')];
  const lado = (nome: string, rgb?: string) => (rgb ? `<${nome} style="thin"><color rgb="${rgb}"/></${nome}>` : `<${nome}/>`);
  const borda = (o: { esq?: string; dir?: string; cima?: string; baixo?: string }) =>
    `<border>${lado('left', o.esq)}${lado('right', o.dir)}${lado('top', o.cima)}${lado('bottom', o.baixo)}<diagonal/></border>`;
  const amarela = 'FFE5C76B';
  const bordas = [borda({}), borda({ baixo: 'FFCBD5E1' }), borda({ cima: 'FF94A3B8' }), borda({ esq: amarela, dir: amarela, cima: amarela, baixo: amarela })];
  const xfs = ESTILOS_DA_CELULA.map((nome) => {
    const x = XF[nome];
    const n = x.numFmt ?? 0; const fo = x.font ?? 0; const fi = x.fill ?? 0; const b = x.border ?? 0;
    const aplica = `${n ? ' applyNumberFormat="1"' : ''}${fo ? ' applyFont="1"' : ''}${fi ? ' applyFill="1"' : ''}${b ? ' applyBorder="1"' : ''}`;
    return x.quebra
      ? `<xf numFmtId="${n}" fontId="${fo}" fillId="${fi}" borderId="${b}" xfId="0"${aplica} applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`
      : `<xf numFmtId="${n}" fontId="${fo}" fillId="${fi}" borderId="${b}" xfId="0"${aplica}/>`;
  });
  return `${CABECA}<styleSheet xmlns="${NS}">`
    + '<numFmts count="3">'
    + `<numFmt numFmtId="164" formatCode="${xml('"R$" #,##0.00;[Red]-"R$" #,##0.00')}"/>`
    + `<numFmt numFmtId="165" formatCode="${xml('"R$" #,##0.00##')}"/>`
    + '<numFmt numFmtId="166" formatCode="0.0#%"/>'
    + '</numFmts>'
    + `<fonts count="${fontes.length}">${fontes.join('')}</fonts>`
    + `<fills count="${fundos.length}">${fundos.join('')}</fills>`
    + `<borders count="${bordas.length}">${bordas.join('')}</borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
}

// =====================================================================
//  O ZIP (sem compressão)
// =====================================================================

const TABELA_DO_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABELA_DO_CRC[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Os arquivos num zip, guardados como estão (o "store" do zip). */
export function zipSemCompressao(arquivos: Array<{ nome: string; dados: Uint8Array }>, quando: Date): Uint8Array {
  const enc = new TextEncoder();
  const hora = ((quando.getUTCHours() << 11) | (quando.getUTCMinutes() << 5) | Math.floor(quando.getUTCSeconds() / 2)) & 0xffff;
  const dia = ((Math.max(0, quando.getUTCFullYear() - 1980) << 9) | ((quando.getUTCMonth() + 1) << 5) | quando.getUTCDate()) & 0xffff;
  const partes: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let pos = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const n = a.dados.length;
    const local = new Uint8Array(30 + nome.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(8, 0, true);
    l.setUint16(10, hora, true); l.setUint16(12, dia, true); l.setUint32(14, crc, true); l.setUint32(18, n, true); l.setUint32(22, n, true);
    l.setUint16(26, nome.length, true); l.setUint16(28, 0, true);
    local.set(nome, 30);
    const central = new Uint8Array(46 + nome.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, hora, true); c.setUint16(14, dia, true); c.setUint32(16, crc, true); c.setUint32(20, n, true); c.setUint32(24, n, true);
    c.setUint16(28, nome.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
    c.setUint32(38, 0, true); c.setUint32(42, pos, true);
    central.set(nome, 46);
    partes.push(local, a.dados);
    centrais.push(central);
    pos += local.length + n;
  }
  const tamanhoCentral = centrais.reduce((s, x) => s + x.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true); f.setUint16(8, arquivos.length, true); f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamanhoCentral, true); f.setUint32(16, pos, true);
  const tudo = new Uint8Array(pos + tamanhoCentral + fim.length);
  let i = 0;
  for (const p of [...partes, ...centrais, fim]) { tudo.set(p, i); i += p.length; }
  return tudo;
}

/** Os arquivos de um zip sem compressão (o que o `zipSemCompressao` faz), para os testes e a conferência. */
export function lerZipSemCompressao(zip: Uint8Array): Map<string, Uint8Array> {
  const d = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const dec = new TextDecoder();
  const r = new Map<string, Uint8Array>();
  let i = 0;
  while (i + 30 <= zip.length && d.getUint32(i, true) === 0x04034b50) {
    if (d.getUint16(i + 8, true) !== 0) throw new Error('O zip tem um arquivo comprimido');
    const n = d.getUint32(i + 18, true);
    const tamNome = d.getUint16(i + 26, true);
    const extra = d.getUint16(i + 28, true);
    const nome = dec.decode(zip.subarray(i + 30, i + 30 + tamNome));
    const ini = i + 30 + tamNome + extra;
    r.set(nome, zip.subarray(ini, ini + n));
    i = ini + n;
  }
  return r;
}

// =====================================================================
//  A PLANILHA
// =====================================================================

/** O .xlsx com as folhas (a primeira abre selecionada). */
export function montarXlsx(folhas: FolhaDaPlanilha[], o: { titulo: string; autor?: string | null; quando: Date }): Uint8Array {
  if (!folhas.length) throw new Error('A planilha precisa de pelo menos uma folha');
  const enc = new TextEncoder();
  const iso = o.quando.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const arquivos: Array<{ nome: string; dados: string }> = [
    {
      nome: '[Content_Types].xml',
      dados: `${CABECA}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + folhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        + '</Types>',
    },
    {
      nome: '_rels/.rels',
      dados: `${CABECA}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        + '</Relationships>',
    },
    {
      nome: 'docProps/core.xml',
      dados: `${CABECA}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
        + `<dc:title>${xml(o.titulo)}</dc:title><dc:creator>Ingline Gestão</dc:creator>`
        + (o.autor ? `<cp:lastModifiedBy>${xml(o.autor)}</cp:lastModifiedBy>` : '')
        + `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>`
        + '</cp:coreProperties>',
    },
    {
      nome: 'xl/workbook.xml',
      dados: `${CABECA}<workbook xmlns="${NS}" xmlns:r="${NS_R}">`
        + '<bookViews><workbookView activeTab="0"/></bookViews>'
        + `<sheets>${folhas.map((f, i) => `<sheet name="${xml(f.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
        + '<calcPr calcId="191029" fullCalcOnLoad="1"/>'
        + '</workbook>',
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      dados: `${CABECA}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + folhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${folhas.length + 1}" Type="${NS_R}/styles" Target="styles.xml"/>`
        + '</Relationships>',
    },
    { nome: 'xl/styles.xml', dados: estilosXml() },
    ...folhas.map((f, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: folhaXml(f, i === 0) })),
  ];
  return zipSemCompressao(arquivos.map((a) => ({ nome: a.nome, dados: enc.encode(a.dados) })), o.quando);
}
