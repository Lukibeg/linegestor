/** Pedaços que a lista, a ficha do projeto e a ficha do cliente usam em comum. */
import type { ReactNode } from 'react';
import { Chip } from '../../components/ui/index.js';
import type { SituacaoProjeto } from '../../api/types.js';

/** O rótulo e a cor de cada situação. "Não se aplica" fecha a linha sem contar como trabalho feito. */
export const SITUACAO: Record<SituacaoProjeto, { rotulo: string; tone: 'neutral' | 'accent' | 'signal' | 'ok' | 'muted' }> = {
  pendente: { rotulo: 'Pendente', tone: 'neutral' },
  andamento: { rotulo: 'Em andamento', tone: 'accent' },
  travado: { rotulo: 'Travado', tone: 'signal' },
  concluido: { rotulo: 'Concluído', tone: 'ok' },
  nao_se_aplica: { rotulo: 'Não se aplica', tone: 'muted' },
};

export function ChipSituacao({ status, motivo }: { status: SituacaoProjeto; motivo?: string | null }) {
  const s = SITUACAO[status] ?? SITUACAO.pendente;
  return <Chip tone={s.tone} title={motivo ?? undefined}>{s.rotulo}</Chip>;
}

/** A barra de "quanto já andou": clientes fechados sobre o total da lista. */
export function Andamento({ pct, total, faltam, altura = 'h-2' }: { pct: number; total: number; faltam: number; altura?: string }) {
  const tone = total === 0 ? 'bg-line-strong' : faltam === 0 ? 'bg-ok' : 'bg-accent';
  return (
    <div className="flex items-center gap-2" title={total === 0 ? 'nenhum cliente na lista ainda' : `${total - faltam} de ${total} fechados`}>
      <div className={`flex-1 rounded-full bg-surface-2 overflow-hidden ${altura}`}><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
      <span className="font-mono text-[11.5px] text-muted tnum shrink-0 whitespace-nowrap w-[104px] text-right">{total === 0 ? 'sem lista' : `${pct}% · faltam ${faltam}`}</span>
    </div>
  );
}

/** Um número com rótulo, para o painel do projeto. */
export function Numero({ label, valor, tone = 'neutral', onClick, ativo }: {
  label: ReactNode; valor: number; tone?: 'neutral' | 'accent' | 'signal' | 'ok' | 'bad' | 'muted'; onClick?: () => void; ativo?: boolean;
}) {
  const cor = { neutral: 'text-ink', accent: 'text-accent', signal: 'text-signal', ok: 'text-ok', bad: 'text-bad', muted: 'text-muted' }[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`rounded-lg border px-3 py-2 text-left ${ativo ? 'border-accent bg-surface-2' : 'border-line'} ${onClick ? 'hover:bg-surface-2' : ''}`}
    >
      <div className={`font-display text-xl font-semibold tnum ${cor}`}>{valor}</div>
      <div className="text-[12px] text-muted">{label}</div>
    </Tag>
  );
}

/** Tamanho de arquivo em português de gente ("2,4 MB"). */
export function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
