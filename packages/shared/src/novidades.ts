/**
 * O vídeo do patch (Patch 1.9, decisão 0046). O pedido (10/10), depois de ver o vídeo do 1.9:
 * "vamos usar isso ao invés dos textos quando o pessoal logar, porém os textos vão estar
 * disponíveis na aba de atualizações". As mesmas regras no sistema e na prévia:
 *
 *  - a nota com vídeo abre no login **com o vídeo**, no lugar dos cartões; os cartões continuam na
 *    página Novidades;
 *  - continua obrigatório: "Assisti e entendi" só libera quando a pessoa **viu o vídeo até o fim** —
 *    os trechos que tocaram cobrem o vídeo inteiro. Arrastar a barra até o fim não conta (o pedaço
 *    pulado não tocou); voltar e acelerar podem;
 *  - se o vídeo não abrir, a janela mostra os cartões, com a leitura obrigatória de antes.
 */

/** A folga, em segundos: o pedacinho do começo ou do fim que o navegador às vezes não marca. */
export const FOLGA_DO_VIDEO_S = 2;

/** MP4 toca em todo lugar; WebM e o .mov do iPhone também são aceitos (os mesmos do portal). */
export const TIPOS_VIDEO_NOVIDADE = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

/**
 * Quanto do vídeo ainda falta ver, em segundos, a partir dos trechos que já tocaram (o `played`
 * do navegador). `null` enquanto não se sabe a duração.
 */
export function faltaAssistir(trechos: ReadonlyArray<readonly [number, number]>, duracao: number): number | null {
  if (!Number.isFinite(duracao) || duracao <= 0) return null;
  // cada trecho dentro do vídeo, em ordem; os que se cruzam contam uma vez só
  const ordenados = trechos
    .map(([a, b]) => [Math.max(0, Math.min(a, b)), Math.min(duracao, Math.max(a, b))] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let visto = 0;
  let ate = 0;
  for (const [a, b] of ordenados) {
    if (b <= ate) continue;
    visto += b - Math.max(a, ate);
    ate = b;
  }
  return Math.max(0, duracao - visto);
}

/** Viu o vídeo até o fim? (com a folga; num vídeo bem curto, a folga encolhe junto) */
export function assistiuTudo(trechos: ReadonlyArray<readonly [number, number]>, duracao: number): boolean {
  const falta = faltaAssistir(trechos, duracao);
  return falta !== null && falta <= Math.min(FOLGA_DO_VIDEO_S, duracao * 0.05);
}

/**
 * "1:05": minutos e segundos, como o player mostra (os segundos inteiros, para baixo) — só que o
 * que falta, por pouco que seja, nunca aparece como 0:00.
 */
export function tempoDoVideo(segundos: number): string {
  const s = segundos > 0 ? Math.max(1, Math.floor(segundos)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
