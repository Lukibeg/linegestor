/**
 * A coluna "#" — o número da linha, igual em toda tabela do sistema.
 *
 * Serve para conferir em voz alta ("o terceiro da lista"), para saber quantos itens há sem
 * contar no dedo e para casar a tela com uma planilha exportada.
 *
 * Em tabela com páginas a contagem NÃO recomeça: a página 2 de 24 em 24 começa no 25, porque
 * o número é a posição na lista inteira, não na página. Use `contarDe(page, pageSize)`.
 * Em tabela pequena (que vem de uma vez só), `contar` basta.
 */

/** O cabeçalho da coluna. Vai sempre como primeira coluna da tabela. */
export function ThN({ titulo = 'Número da linha na lista' }: { titulo?: string }) {
  return <th className="w-[1%] text-right whitespace-nowrap" title={titulo}>#</th>;
}

/** A célula com o número. */
export function TdN({ n }: { n: number }) {
  return <td className="text-right text-muted tnum text-[12px] select-none whitespace-nowrap">{n}</td>;
}

/** Lista inteira na tela: 1, 2, 3… */
export const contar = (i: number) => i + 1;

/** Lista com páginas: continua de onde a página anterior parou. */
export const contarDe = (page: number, pageSize: number) => (i: number) => (page - 1) * pageSize + i + 1;
