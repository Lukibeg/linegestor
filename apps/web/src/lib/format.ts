/** Formatação para exibição. Reaproveita as regras do pacote compartilhado. */
export { cnpjFormatado, didFormatado, macFormatado, reais, paraCentavos, cnpjValido, macValido, didValido } from '@gestor/shared';
export { MODALIDADES, CONDICOES_APARELHO, CONTABILIZACOES } from '@gestor/shared';

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

export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

/** Nome da condição do aparelho para exibição. */
export const condicaoNome: Record<string, string> = { ativo: 'Ativo', manutencao: 'Em manutenção', baixado: 'Baixado', vendido: 'Vendido' };
export const condicaoCor: Record<string, string> = { ativo: 'ok', manutencao: 'signal', baixado: 'muted', vendido: 'accent' };
