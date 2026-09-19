/**
 * Formatos de dado do domínio: como guardar, como validar, como exibir.
 *
 * Regra geral: GUARDAR sempre no formato cru (só dígitos, MAC sem separador),
 * EXIBIR sempre formatado. Assim a busca funciona de qualquer jeito que a pessoa digite.
 */

// ---------- CNPJ ----------

/** Deixa só os 14 dígitos. */
export function cnpjLimpo(v: string): string {
  return (v ?? '').replace(/\D/g, '');
}

/** 12345678000100 → 12.345.678/0001-00 */
export function cnpjFormatado(v: string): string {
  const d = cnpjLimpo(v);
  if (d.length !== 14) return v;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Confere os dois dígitos verificadores do CNPJ (algoritmo oficial da Receita). */
export function cnpjValido(v: string): boolean {
  const d = cnpjLimpo(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base: string, pesos: number[]) => {
    const soma = base.split('').reduce((acc, ch, i) => acc + Number(ch) * (pesos[i] ?? 0), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  const dv1 = calc(d.slice(0, 12), p1);
  const dv2 = calc(d.slice(0, 12) + dv1, p2);
  return d === d.slice(0, 12) + String(dv1) + String(dv2);
}

// ---------- Telefone / DID ----------

/** Deixa só dígitos. Um DID brasileiro fixo tem 10 dígitos (DDD + 8). */
export function didLimpo(v: string): string {
  return (v ?? '').replace(/\D/g, '');
}

/** 7130201234 → (71) 3020-1234 · 71930201234 → (71) 93020-1234 · 08001234567 → 0800 123 4567 */
export function didFormatado(v: string): string {
  const d = didLimpo(v);
  if (d.startsWith('0800') && d.length === 11) return `0800 ${d.slice(4, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return v;
}

export function didValido(v: string): boolean {
  const d = didLimpo(v);
  return d.length === 10 || d.length === 11;
}

/**
 * Gera uma faixa de números a partir de um número-base.
 * base "7130201200", quantidade 3 → ["7130201200","7130201201","7130201202"]
 * Preserva a quantidade de dígitos (zeros à esquerda).
 */
export function gerarFaixaDids(base: string, quantidade: number): string[] {
  const d = didLimpo(base);
  const largura = d.length;
  const inicio = BigInt(d);
  const out: string[] = [];
  for (let i = 0n; i < BigInt(quantidade); i++) {
    out.push((inicio + i).toString().padStart(largura, '0'));
  }
  return out;
}

// ---------- MAC ----------

/** Guarda como 12 hexadecimais maiúsculos, sem separador: 000B82A1B2C3 */
export function macLimpo(v: string): string {
  return (v ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
}

/** 000B82A1B2C3 → 00:0B:82:A1:B2:C3 */
/**
 * MAC em grupos de dois, do jeito que aparece na etiqueta do aparelho.
 * Aparelho sem MAC (headset, cabo) devolve "não aplicável" — é caso normal, não erro.
 */
export function macFormatado(v: string | null | undefined): string {
  if (!v) return 'não aplicável';
  const m = macLimpo(v);
  if (m.length !== 12) return v;
  return m.match(/.{2}/g)!.join(':');
}

export function macValido(v: string): boolean {
  return macLimpo(v).length === 12;
}

// ---------- Dinheiro ----------

/** Centavos inteiros → "R$ 1.234,56". Guardamos dinheiro em centavos para não ter erro de arredondamento. */
export function reais(centavos: number | null | undefined): string {
  if (centavos == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);
}

/** "1.234,56" ou "1234.56" → 123456 (centavos) */
export function paraCentavos(v: string | number): number {
  if (typeof v === 'number') return Math.round(v * 100);
  const limpo = v.replace(/[^\d,.-]/g, '');
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// ---------- Número de série ----------

/** N/S como está na etiqueta, sem espaços e em maiúsculas: " ab12 cd " → "AB12CD" */
export function serieLimpa(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Como o aparelho se identifica numa tabela: o MAC, se tiver; senão o número de série;
 * senão "não aplicável" (headset, cabo).
 */
export function identificacaoAparelho(d: { mac?: string | null; serialNumber?: string | null }): { tipo: 'mac' | 'serie' | 'nenhum'; texto: string } {
  if (d.mac) return { tipo: 'mac', texto: macFormatado(d.mac) };
  if (d.serialNumber) return { tipo: 'serie', texto: d.serialNumber };
  return { tipo: 'nenhum', texto: 'não aplicável' };
}

/**
 * Uma lista colada pela pessoa (um por linha, ou separados por vírgula, ponto e vírgula,
 * tabulação ou espaço) vira uma lista limpa, sem vazios. A ordem é mantida.
 */
export function lerLista(texto: string): string[] {
  return (texto ?? '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
}

// ---------- Datas ----------

/**
 * Uma data escolhida num calendário ("3 de novembro") chega como meia-noite em UTC — que no
 * Brasil ainda é dia 2. Guardamos ao MEIO-DIA UTC, que é o mesmo dia em qualquer fuso do país.
 * Horários que não são meia-noite exata (um "agora", por exemplo) ficam como estão.
 */
export function diaAoMeioDia(d: Date): Date;
export function diaAoMeioDia(d: Date | null | undefined): Date | null | undefined;
export function diaAoMeioDia(d: Date | null | undefined): Date | null | undefined {
  if (!d || Number.isNaN(d.getTime())) return d;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return new Date(d.getTime() + 12 * 60 * 60 * 1000);
  }
  return d;
}

/** "2025-11-03" (o valor de um campo de data) → o instante que o servidor guarda: meio-dia UTC daquele dia. */
export function diaParaIso(dia: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? `${dia}T12:00:00.000Z` : null;
}

// ---------- Acentos embaralhados ----------

/**
 * Conserta o texto que foi salvo em UTF-8 e lido como Latin-1 no caminho ("PeÃ§as" vira "Peças").
 * Só age no padrão típico (Ã ou Â seguidos de um caractere entre U+0080 e U+00BF) e só se a
 * conversão der um texto válido — "SÃO PAULO" fica como está.
 */
export function consertarAcentos(v: string): string {
  if (!v || !/[ÃÂ][-¿]/.test(v)) return v;
  const codigos = Array.from(v, (c) => c.codePointAt(0)!);
  if (codigos.some((c) => c > 255)) return v;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(codigos));
  } catch {
    return v;
  }
}

/**
 * Máscara de IP enquanto a pessoa digita: "19216801" vira "192.168.0.1".
 * Regra: um octeto fecha (ganha ponto) quando não cabe mais dígito nele — três dígitos,
 * dois dígitos que passariam de 255 com mais um, ou um "0" (octeto não começa com zero).
 * Um ponto digitado à mão também fecha o octeto. Só os quatro primeiros octetos contam.
 */
export function formatarIp(v: string): string {
  const octetos: string[] = [];
  let atual = '';
  const fechar = () => { if (atual) { octetos.push(atual); atual = ''; } };
  for (const ch of v) {
    if (octetos.length === 4) break;
    if (ch === '.') { fechar(); continue; }
    if (!/\d/.test(ch)) continue;
    atual += ch;
    if (atual.length === 3 || atual === '0' || (atual.length === 2 && Number(atual + '0') > 255)) {
      fechar();
    }
  }
  if (atual && octetos.length < 4) octetos.push(atual);
  const texto = octetos.slice(0, 4).join('.');
  // ponto digitado à mão no fim fica ("10." → o próximo dígito começa outro octeto): sem isso,
  // "10.1.1.0" viraria "101.1.0" porque o ponto sumiria assim que fosse digitado
  return v.endsWith('.') && !atual && octetos.length > 0 && octetos.length < 4 ? `${texto}.` : texto;
}
