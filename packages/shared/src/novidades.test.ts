import { describe, expect, it } from 'vitest';
import { NovidadeGravarSchema } from './schemas.js';
import { assistiuTudo, faltaAssistir, tempoDoVideo } from './novidades.js';

describe('o vídeo do patch: viu até o fim?', () => {
  it('assistiu do começo ao fim: libera', () => {
    expect(faltaAssistir([[0, 127]], 127)).toBe(0);
    expect(assistiuTudo([[0, 127]], 127)).toBe(true);
    // o navegador às vezes para um tiquinho antes do fim: a folga cobre
    expect(assistiuTudo([[0.2, 126.1]], 127)).toBe(true);
  });

  it('arrastou a barra até o fim: o pedaço pulado não tocou e não libera', () => {
    expect(faltaAssistir([[0, 10], [120, 127]], 127)).toBe(110);
    expect(assistiuTudo([[0, 10], [120, 127]], 127)).toBe(false);
    // voltou e viu o que faltava: aí libera
    expect(assistiuTudo([[0, 10], [120, 127], [10, 120]], 127)).toBe(true);
  });

  it('voltar para rever não conta duas vezes', () => {
    expect(faltaAssistir([[0, 60], [30, 90]], 127)).toBe(37);
    expect(faltaAssistir([[30, 90], [0, 60], [40, 50]], 127)).toBe(37);
  });

  it('sem duração (o vídeo ainda não carregou) não se sabe quanto falta', () => {
    expect(faltaAssistir([], Number.NaN)).toBeNull();
    expect(faltaAssistir([], 0)).toBeNull();
    expect(assistiuTudo([[0, 5]], Number.NaN)).toBe(false);
  });

  it('num vídeo bem curto a folga encolhe junto', () => {
    expect(assistiuTudo([[0, 1.5]], 3)).toBe(false);
    expect(assistiuTudo([[0, 2.9]], 3)).toBe(true);
  });

  it('o tempo que falta, em minutos e segundos, como o player mostra (mas nunca 0:00 se falta algo)', () => {
    expect(tempoDoVideo(65)).toBe('1:05');
    expect(tempoDoVideo(126.6)).toBe('2:06');
    expect(tempoDoVideo(0.3)).toBe('0:01');
    expect(tempoDoVideo(0)).toBe('0:00');
  });
});

describe('o vídeo no gravar da nota', () => {
  it('ausente mantém, null tira, um id troca', () => {
    const base = { version: '1.9', title: 'O que mudou' };
    expect(NovidadeGravarSchema.parse(base).videoId).toBeUndefined();
    expect(NovidadeGravarSchema.parse({ ...base, videoId: null }).videoId).toBeNull();
    expect(NovidadeGravarSchema.parse({ ...base, videoId: 'abc' }).videoId).toBe('abc');
    expect(NovidadeGravarSchema.safeParse({ ...base, videoId: '' }).success).toBe(false);
  });
});
