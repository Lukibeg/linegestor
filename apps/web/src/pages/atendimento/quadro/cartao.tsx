/**
 * O cartão do chamado (o de comum.tsx, o mesmo em todo o módulo) com uma linha de ações no pé: o
 * "Mover" do quadro, o "Assumir" do Meu dia. O cartão em si não tem lugar para botão, então o pé
 * ganha um espaço no fim do cartão e os botões ficam ali, dentro da moldura dele — parece uma peça
 * só, e a faixa vermelha do vencido continua inteira na lateral.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import type { CartaoChamado, CorPainel } from '@gestor/shared';
import { CartaoDoChamado } from '../comum.js';

export function CartaoComRodape({ c, cor, rodape, nomeDaEtapa, arrastavel = false, className = '', ...resto }: {
  c: CartaoChamado; cor?: CorPainel; rodape: ReactNode; nomeDaEtapa?: string; arrastavel?: boolean; className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className'>) {
  return (
    <div className={`relative [&>.card]:pb-10 ${className}`} {...resto}>
      <CartaoDoChamado c={c} cor={cor} arrastavel={arrastavel} mostrarEtapa={!!nomeDaEtapa} nomeDaEtapa={nomeDaEtapa} />
      {/* `data-sem-abrir`: clicar aqui (ou no painel do Mover, que nasce aqui dentro) não abre a ficha */}
      <div className="absolute left-2.5 right-2.5 bottom-1.5 flex items-center gap-2 min-w-0" data-sem-abrir>{rodape}</div>
    </div>
  );
}

/** Clique no cartão (fora de link, botão ou do pé): abre a ficha. */
export function cliqueAbreAFicha(e: { target: EventTarget | null }): boolean {
  const alvo = e.target as HTMLElement | null;
  return !alvo?.closest('a, button, input, select, textarea, label, [data-sem-abrir], [role="dialog"]');
}
