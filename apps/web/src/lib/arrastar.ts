/**
 * Arrastar para trocar de lugar — feito aqui, sem biblioteca (são poucas linhas, e assim ninguém
 * precisa aprender uma ferramenta de fora para mexer).
 *
 * Para quem usa:
 *  - segura a alça (⠿) de um cartão e arrasta; enquanto o ponteiro passa sobre outro cartão, a
 *    ordem já muda na tela (os outros abrem espaço) e soltar só confirma;
 *  - **Esc** devolve tudo como estava antes de pegar;
 *  - mouse, caneta ou dedo (a alça não rola a página: ela leva `touch-action: none`);
 *  - perto da borda de cima ou de baixo da janela, a página rola sozinha.
 *
 * Por dentro: os cartões levam `data-arrastavel="<id>"`. A cada movimento, acha-se o cartão sob o
 * ponteiro e em que metade dele o ponteiro está (esquerda/direita num cartão de meia largura,
 * cima/baixo num de largura inteira): o arrastado entra antes ou depois dele. Uma troca só acontece
 * depois de o ponteiro andar alguns pixels desde a anterior — sem isso, o cartão que muda de
 * tamanho ao trocar de lugar podia "puxar" a troca de volta sozinho.
 *
 * Os ouvintes ficam na janela, não na alça: ao trocar de lugar o cartão muda de posição na página,
 * e a alça perderia o ponteiro no meio do caminho.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPonteiro } from 'react';

/** O cabeçalho fixo ocupa o alto da janela: a rolagem automática começa abaixo dele. */
const BORDA_CIMA = 120;
const BORDA_BAIXO = 70;
/** Quanto o ponteiro precisa andar (na página) entre uma troca e outra. */
const ANDAR = 6;

export function useArrastar(ordem: string[], mudar: (nova: string[]) => void) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const ordemRef = useRef(ordem);
  ordemRef.current = ordem;
  const mudarRef = useRef(mudar);
  mudarRef.current = mudar;
  /** O rótulo que acompanha o ponteiro: a tela desenha, aqui só se move (sem redesenhar a tela). */
  const fantasma = useRef<HTMLDivElement | null>(null);
  /** Onde o ponteiro está agora — a tela usa para desenhar o rótulo no lugar certo. */
  const posicao = useRef({ x: 0, y: 0 });
  const parada = useRef<((desfazer: boolean) => void) | null>(null);

  // saiu da tela no meio do arrasto: larga tudo
  useEffect(() => () => parada.current?.(false), []);

  const iniciar = useCallback((id: string, e: EventoPonteiro<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    parada.current?.(false);
    const antes = [...ordemRef.current];
    let x = e.clientX;
    let y = e.clientY;
    let ultimo = { x, y: y + window.scrollY };
    let raf = 0;
    posicao.current = { x, y };

    const posicionar = () => {
      posicao.current = { x, y };
      if (fantasma.current) fantasma.current.style.transform = `translate(${x + 14}px, ${y + 10}px)`;
    };

    const testar = () => {
      const yPagina = y + window.scrollY;
      if (Math.hypot(x - ultimo.x, yPagina - ultimo.y) < ANDAR) return;
      let alvo: HTMLElement | undefined;
      for (const el of document.querySelectorAll<HTMLElement>('[data-arrastavel]')) {
        if (el.dataset.arrastavel === id) continue;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { alvo = el; break; }
      }
      if (!alvo) return;
      const r = alvo.getBoundingClientRect();
      const grade = alvo.parentElement?.getBoundingClientRect();
      const inteira = !!grade && r.width > grade.width * 0.75;
      const depois = inteira ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
      const atual = ordemRef.current;
      const nova = atual.filter((k) => k !== id);
      const i = nova.indexOf(alvo.dataset.arrastavel!);
      if (i < 0) return;
      nova.splice(depois ? i + 1 : i, 0, id);
      if (nova.every((k, j) => k === atual[j])) return;
      ultimo = { x, y: yPagina };
      mudarRef.current(nova);
    };

    const rolar = () => {
      const baixo = window.innerHeight - BORDA_BAIXO;
      const v = y < BORDA_CIMA ? -Math.ceil((BORDA_CIMA - y) / 5) : y > baixo ? Math.ceil((y - baixo) / 5) : 0;
      if (v) { window.scrollBy(0, Math.max(-24, Math.min(24, v))); testar(); }
      raf = requestAnimationFrame(rolar);
    };

    const mover = (ev: PointerEvent) => { x = ev.clientX; y = ev.clientY; posicionar(); testar(); };
    const soltar = () => parar(false);
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); parar(true); } };
    const corpo = document.body.style;
    const antigo = { userSelect: corpo.userSelect, cursor: corpo.cursor };

    function parar(desfazer: boolean) {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      window.removeEventListener('keydown', tecla, true);
      cancelAnimationFrame(raf);
      corpo.userSelect = antigo.userSelect;
      corpo.cursor = antigo.cursor;
      if (desfazer) mudarRef.current(antes);
      parada.current = null;
      setArrastando(null);
    }

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    window.addEventListener('keydown', tecla, true);
    corpo.userSelect = 'none';
    corpo.cursor = 'grabbing';
    raf = requestAnimationFrame(rolar);
    parada.current = parar;
    setArrastando(id);
  }, []);

  return { arrastando, iniciar, fantasma, posicao };
}
