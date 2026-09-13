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
export function macFormatado(v: string): string {
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
