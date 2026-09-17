/** Formatação para exibição. Reaproveita as regras do pacote compartilhado. */
export { cnpjFormatado, didFormatado, macFormatado, reais, paraCentavos, cnpjValido, macValido, didValido, diaParaIso, lerLista, macLimpo, serieLimpa } from '@gestor/shared';
export { MODALIDADES, CONDICOES_APARELHO } from '@gestor/shared';

export function data(iso: string | null | undefined, comHora = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return comHora ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR');
}

export function relativo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 30) return `há ${Math.floor(diff / 86400)} d`;
  return data(iso);
}

/**
 * Quanto tempo separa dois momentos, em palavras: "no mesmo dia", "12 dias depois",
 * "3 meses depois". Serve para a linha do tempo da implantação, onde o que interessa
 * não é a data em si, mas o intervalo entre uma etapa e a seguinte.
 */
/**
 * O dia (no fuso de quem está olhando) de um instante ISO — "2026-01-05T02:00:00Z" no Brasil
 * é dia 04, não 05. Serve de chave para juntar na mesma linha o que aconteceu no mesmo dia.
 */
export function diaLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Distância entre dois dias no formato de `diaLocal`. Mesmo dia não gera texto. */
export function intervalo(anterior: string, atual: string): string {
  const ymd = (s: string) => { const [a, m, d] = s.split('-').map(Number); return new Date(a!, (m ?? 1) - 1, d ?? 1).getTime(); };
  const dias = Math.round((ymd(atual) - ymd(anterior)) / 86400000);
  if (dias <= 0) return 'no mesmo dia';
  if (dias === 1) return '1 dia depois';
  if (dias < 30) return `${dias} dias depois`;
  const meses = Math.round(dias / 30.44);
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'} depois`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  return `${anos} ${anos === 1 ? 'ano' : 'anos'}${resto ? ` e ${resto} ${resto === 1 ? 'mês' : 'meses'}` : ''} depois`;
}

export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

/** Nome da condição do aparelho para exibição. */
export const condicaoNome: Record<string, string> = { ativo: 'Ativo', inativo: 'Inativo' };
export const condicaoCor: Record<string, string> = { ativo: 'ok', inativo: 'muted' };

/** Valor para um campo de data (AAAA-MM-DD) a partir do instante guardado — no fuso de quem olha. */
export function paraCampoData(iso: string | null | undefined): string {
  return iso ? diaLocal(iso) : '';
}

/** Hoje, no formato do campo de data. */
export function hojeCampoData(): string {
  return diaLocal(new Date().toISOString());
}

/** Centavos → texto para campo de valor ("358,80"), ou vazio. */
export function centavosParaCampo(c: number | null | undefined): string {
  return c != null ? (c / 100).toFixed(2).replace('.', ',') : '';
}
