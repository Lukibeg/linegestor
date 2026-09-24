/**
 * Colunas escolhidas pela pessoa, iguais em qualquer tabela do sistema.
 *
 * Quem usa diz quais colunas existem (id, rótulo, grupo e como desenhar a célula) e qual é o
 * conjunto padrão. O painel deixa marcar/desmarcar uma a uma, o grupo inteiro, TUDO ou NADA,
 * e a escolha fica guardada neste navegador.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Columns3, RotateCcw } from 'lucide-react';
import { Popover } from '../components/ui/index.js';

export type Coluna<T> = {
  id: string;
  /** cabeçalho da tabela */
  label: string;
  /** rótulo no painel de escolha, quando o grupo já diz o resto */
  labelCurto?: string;
  grupo: string;
  align?: 'right';
  /** false = não faz sentido ordenar por ela (ex.: botões de atalho) */
  ordenavel?: boolean;
  render: (x: T) => ReactNode;
};

export type EscolhaColunas = { ids: string[]; setIds: (v: string[]) => void; restaurar: () => void };

/**
 * Guarda no navegador quais colunas a pessoa escolheu para aquela tabela.
 *
 * `novas`: colunas que chegaram depois (a Descrição dos Chamados, no 1.4). Quem já tinha escolhido
 * as colunas não as veria nunca — a escolha guardada manda. Então cada coluna nova aparece **uma
 * vez** para essa pessoa, no lugar em que está no padrão; se ela tirar, fica tirada.
 */
export function useColunasEscolhidas(chaveStorage: string, padrao: string[], opcoes: { novas?: string[] } = {}): EscolhaColunas {
  const [ids, setIds] = useState<string[]>(() => {
    try {
      const v = localStorage.getItem(chaveStorage);
      const chaveNovas = `${chaveStorage}:novas-vistas`;
      // quem começa agora já vê o padrão com as novas: nada a acrescentar depois
      if (!v) { if (opcoes.novas?.length) localStorage.setItem(chaveNovas, JSON.stringify(opcoes.novas)); return padrao; }
      const guardadas = JSON.parse(v) as string[];
      const vistas = new Set(JSON.parse(localStorage.getItem(chaveNovas) ?? '[]') as string[]);
      const faltam = (opcoes.novas ?? []).filter((id) => !vistas.has(id) && !guardadas.includes(id));
      if (!faltam.length) return guardadas;
      localStorage.setItem(chaveNovas, JSON.stringify([...vistas, ...faltam]));
      // entra logo depois da coluna que vem antes dela no padrão (ou no fim)
      const out = [...guardadas];
      for (const id of faltam) {
        const antes = padrao.slice(0, Math.max(0, padrao.indexOf(id))).reverse().find((x) => out.includes(x));
        out.splice(antes ? out.indexOf(antes) + 1 : out.length, 0, id);
      }
      return out;
    } catch { return padrao; }
  });
  useEffect(() => { try { localStorage.setItem(chaveStorage, JSON.stringify(ids)); } catch { /* sem storage */ } }, [chaveStorage, ids]);
  return { ids, setIds, restaurar: () => setIds(padrao) };
}

/** O botão "Colunas" e seu painel. */
export function SeletorColunas<T>({ colunas, escolha }: { colunas: Coluna<T>[]; escolha: EscolhaColunas }) {
  const { ids, setIds, restaurar } = escolha;
  const grupos = useMemo(() => {
    const g = new Map<string, Coluna<T>[]>();
    for (const c of colunas) g.set(c.grupo, [...(g.get(c.grupo) ?? []), c]);
    return [...g.entries()];
  }, [colunas]);
  const toggle = (id: string) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const marcarTudo = () => setIds(colunas.map((c) => c.id));
  const desmarcarTudo = () => setIds([]);

  return (
    <Popover botao={() => <><Columns3 size={15} /> Colunas <span className="text-muted tnum">({ids.length})</span></>}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="eyebrow">O que aparece na tabela</span>
        <span className="flex gap-1">
          <button className="btn-ghost btn-sm" onClick={marcarTudo}>tudo</button>
          <button className="btn-ghost btn-sm" onClick={desmarcarTudo}>nada</button>
          <button className="btn-ghost btn-sm text-muted" onClick={restaurar} title="Voltar às colunas padrão"><RotateCcw size={13} /></button>
        </span>
      </div>
      {grupos.map(([grupo, cols]) => {
        const todosDoGrupo = cols.every((c) => ids.includes(c.id));
        return (
          <div key={grupo} className="mb-3 last:mb-0">
            <div className="flex items-center justify-between">
              <div className="text-[11.5px] uppercase tracking-wide text-muted mb-1">{grupo}</div>
              <button
                className="text-[11.5px] text-muted hover:text-ink"
                onClick={() => setIds(todosDoGrupo ? ids.filter((x) => !cols.some((c) => c.id === x)) : [...new Set([...ids, ...cols.map((c) => c.id)])])}
              >
                {todosDoGrupo ? 'desmarcar' : 'marcar'} grupo
              </button>
            </div>
            <div className="flex flex-col gap-0.5">
              {cols.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm px-1.5 py-1 rounded hover:bg-surface-2 cursor-pointer">
                  <input type="checkbox" id={`col-${c.id}`} checked={ids.includes(c.id)} onChange={() => toggle(c.id)} /> {c.labelCurto ?? c.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[11.5px] text-muted mt-2 border-t border-line pt-2">A escolha fica guardada neste navegador. Arraste a tabela para o lado se ficar larga.</p>
    </Popover>
  );
}
