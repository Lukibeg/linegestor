/**
 * Ordenação de tabela, igual em todo o sistema.
 *
 * Como funciona: cada cabeçalho de coluna vira um botão. Clicar ordena por ela;
 * clicar de novo inverte (crescente ↔ decrescente). A seta mostra o que está valendo.
 *
 * Em tabelas com páginas, a coluna escolhida vai para o endereço (?ord=…&dir=…) e o
 * SERVIDOR ordena — assim a ordem vale para a lista inteira, não só para a página que está na tela.
 * Em tabelas pequenas (que vêm de uma vez só), `ordenarLista` ordena aqui mesmo.
 */
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

export type Dir = 'asc' | 'desc';
export type Ordenacao = { ord: string; dir: Dir; ordenarPor: (col: string) => void };

/** Colunas assim começam de trás para frente (mais novo / maior primeiro) no primeiro clique. */
const COMECA_DESCENDO = /^(createdAt|updatedAt|didCount|deviceCount|products|modules|valueCents|monthlyValueCents|total|free|channels|quantity|uso|ativacao:|modulo:)/;
const primeiroSentido = (col: string): Dir => (COMECA_DESCENDO.test(col) ? 'desc' : 'asc');

/** Ordenação guardada no endereço da página (para tabelas com páginas, ordenadas pelo servidor). */
export function useOrdenacao(padrao: string, dirPadrao: Dir = 'asc'): Ordenacao {
  const [sp, setSp] = useSearchParams();
  const ord = sp.get('ord') ?? padrao;
  const dir = (sp.get('dir') as Dir) ?? dirPadrao;
  const ordenarPor = (col: string) => {
    const n = new URLSearchParams(sp);
    n.set('ord', col);
    n.set('dir', ord === col ? (dir === 'asc' ? 'desc' : 'asc') : primeiroSentido(col));
    n.delete('p'); // trocar a ordem volta para a primeira página
    setSp(n, { replace: true });
  };
  return { ord, dir, ordenarPor };
}

/** Ordenação só na memória da tela (para tabelas pequenas, que vêm de uma vez só). */
export function useOrdenacaoLocal(padrao: string, dirPadrao: Dir = 'asc'): Ordenacao {
  const [{ ord, dir }, set] = useState<{ ord: string; dir: Dir }>({ ord: padrao, dir: dirPadrao });
  const ordenarPor = (col: string) => set((a) => (a.ord === col ? { ord: col, dir: a.dir === 'asc' ? 'desc' : 'asc' } : { ord: col, dir: primeiroSentido(col) }));
  return { ord, dir, ordenarPor };
}

/** Cabeçalho clicável. Use `<th>` normal nas colunas que não fazem sentido ordenar. */
export function Th({ o, col, children, align, titulo }: { o: Ordenacao; col: string; children: ReactNode; align?: 'right' | 'center'; titulo?: string }) {
  const ativa = o.ord === col;
  return (
    <th className={align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}>
      <button
        type="button"
        onClick={() => o.ordenarPor(col)}
        title={titulo ?? `Ordenar por ${typeof children === 'string' ? children : 'esta coluna'}`}
        className={`inline-flex items-center gap-1 select-none hover:text-ink ${ativa ? 'text-accent' : ''} ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {children}
        {ativa ? (o.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ChevronsUpDown size={12} className="opacity-30" />}
      </button>
    </th>
  );
}

/**
 * Ordena uma lista já carregada. `valores` diz como pegar o valor de cada coluna.
 * Vazio (nulo) vai sempre para o fim, em qualquer sentido — é o mesmo comportamento do servidor.
 */
export function ordenarLista<T>(itens: T[], o: Ordenacao, valores: Record<string, (x: T) => string | number | Date | null | undefined>): T[] {
  const pegar = valores[o.ord];
  if (!pegar) return itens;
  const sinal = o.dir === 'desc' ? -1 : 1;
  return [...itens].sort((a, b) => {
    const va = pegar(a), vb = pegar(b);
    const vazioA = va === null || va === undefined || va === '';
    const vazioB = vb === null || vb === undefined || vb === '';
    if (vazioA && vazioB) return 0;
    if (vazioA) return 1;
    if (vazioB) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
    if (va instanceof Date || vb instanceof Date) return (new Date(va as any).getTime() - new Date(vb as any).getTime()) * sinal;
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * sinal;
  });
}
