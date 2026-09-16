/**
 * "Voltar para a lista" sem perder os filtros.
 *
 * As listas guardam o que você filtrou na própria URL (?produtos=linepbx&ver=tabela&p=2).
 * Ao abrir uma ficha, essa URL sai do ar — e voltar pelo menu lateral traz a lista limpa,
 * obrigando a filtrar tudo de novo. Então a lista deixa a última busca guardada aqui (só
 * nesta aba do navegador) e a ficha monta o botão Voltar já com ela.
 */
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const chave = (rota: string) => `gestor:lista:${rota}`;

/** Usado pela LISTA: guarda os filtros de agora. */
export function useLembrarFiltros(rota: string) {
  const [sp] = useSearchParams();
  const busca = sp.toString();
  useEffect(() => {
    try { sessionStorage.setItem(chave(rota), busca); } catch { /* aba anônima ou storage bloqueado: só não lembra */ }
  }, [rota, busca]);
}

/** Usado pela FICHA: o endereço da lista com os filtros de volta. */
export function paraALista(rota: string) {
  let busca = '';
  try { busca = sessionStorage.getItem(chave(rota)) ?? ''; } catch { /* idem */ }
  return busca ? `${rota}?${busca}` : rota;
}

/** O botão em si, para o cabeçalho da ficha. */
export function Voltar({ rota, texto }: { rota: string; texto: string }) {
  return (
    <Link to={paraALista(rota)} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-accent">
      <ArrowLeft size={14} /> {texto}
    </Link>
  );
}
