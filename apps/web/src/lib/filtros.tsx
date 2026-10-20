/**
 * Filtro em botão, igual em todo o sistema (Produtos, Módulos, os painéis do calendário — 2.0.2 —, e o que
 * vier depois). Abre um painel com caixas de marcar, agrupadas quando faz sentido, e tem
 * **marcar tudo / desmarcar tudo** — geral e por grupo.
 */
import type { LucideIcon } from 'lucide-react';
import { Popover } from '../components/ui/index.js';

/** `cor`: a bolinha numa cor CSS; `classeDoPonto`: a bolinha pelas classes do tema (a cor do painel). */
export type OpcaoFiltro = { key: string; label: string; cor?: string; classeDoPonto?: string; dica?: string };
export type GrupoFiltro = { titulo?: string; cor?: string; opcoes: OpcaoFiltro[] };

export function FiltroEmBotao({ icone: Icone, nome, grupos, escolhidos, onChange, largura = 'w-[280px]', alinhar, dica, vazio }: {
  icone: LucideIcon; nome: string; grupos: GrupoFiltro[]; escolhidos: string[]; onChange: (v: string[]) => void; largura?: string;
  /** de que lado o painel abre (o botão no começo da linha abre para a direita: `esquerda`); `dica`: o texto do mouse no botão */
  alinhar?: 'direita' | 'esquerda'; dica?: string;
  /** a frase de quando nada está marcado (ex.: "Nenhum marcado: aparecem todos.") */
  vazio?: string;
}) {
  const todas = grupos.flatMap((g) => g.opcoes.map((o) => o.key));
  if (!todas.length) return null;
  const toggle = (k: string) => onChange(escolhidos.includes(k) ? escolhidos.filter((x) => x !== k) : [...escolhidos, k]);
  return (
    <Popover largura={largura} alinhar={alinhar} titulo={dica} botao={() => <><Icone size={15} /> {nome} {escolhidos.length > 0 && <span className="text-accent tnum">({escolhidos.length})</span>}</>}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="eyebrow">Filtrar por {nome.toLowerCase()}</span>
        <span className="flex gap-1">
          <button className="btn-ghost btn-sm" onClick={() => onChange(todas)}>tudo</button>
          <button className="btn-ghost btn-sm" onClick={() => onChange([])}>nada</button>
        </span>
      </div>
      {vazio && !escolhidos.length && <p className="text-[12px] text-muted -mt-1 mb-2">{vazio}</p>}
      {grupos.map((g, i) => {
        const chaves = g.opcoes.map((o) => o.key);
        const todosDoGrupo = chaves.every((k) => escolhidos.includes(k));
        return (
          <div key={g.titulo ?? i} className="mb-3 last:mb-0">
            {g.titulo && (
              <div className="flex items-center justify-between">
                <div className="text-[11.5px] uppercase tracking-wide mb-1" style={{ color: g.cor }}>{g.titulo}</div>
                <button
                  className="text-[11.5px] text-muted hover:text-ink"
                  onClick={() => onChange(todosDoGrupo ? escolhidos.filter((x) => !chaves.includes(x)) : [...new Set([...escolhidos, ...chaves])])}
                >
                  {todosDoGrupo ? 'desmarcar' : 'marcar'} grupo
                </button>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {g.opcoes.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm px-1.5 py-1 rounded hover:bg-surface-2 cursor-pointer" title={o.dica}>
                  <input type="checkbox" id={`filtro-${o.key.replace(/[^a-z0-9]/gi, '-')}`} checked={escolhidos.includes(o.key)} onChange={() => toggle(o.key)} />
                  {o.classeDoPonto ? <span className={`w-2 h-2 rounded-full shrink-0 ${o.classeDoPonto}`} aria-hidden />
                    : o.cor ? <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.cor }} aria-hidden /> : null}
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </Popover>
  );
}
