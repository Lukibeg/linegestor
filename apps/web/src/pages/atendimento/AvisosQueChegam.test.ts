/**
 * Os avisos que chegam (2.0): o vigia só mostra o que chegou depois que a tela abriu e ainda não foi
 * lido — e o aviso do observador, que junta as mudanças e volta a chegar, aparece de novo. Os cartões
 * ficam na fila até a pessoa abrir ou fechar: nenhum some sozinho.
 */
import { describe, expect, it } from 'vitest';
import type { AvisoNaTela } from '@gestor/shared';
import { NA_TELA, juntarCartoes, oQueChegou, segundaLinhaDoAviso } from './AvisosQueChegam.js';

const aviso = (id: string, em: string, m: Partial<AvisoNaTela> = {}): AvisoNaTela => ({
  id, tipo: 'recebeu', texto: `Você recebeu o chamado ${id}`, chamado: { id: `c-${id}`, codigo: id, titulo: 'Ramal mudo' }, evento: null, em, lido: false, ...m,
});

describe('os avisos que chegam', () => {
  it('a primeira leitura só anota; depois, só o que chegou e não foi lido', () => {
    const ja = new Set<string>();
    expect(oQueChegou(ja, [aviso('SUP-1', '2026-10-12T10:00:00Z')])).toHaveLength(1);
    // (o vigia joga fora a primeira leitura: aqui ela só serviu para anotar)
    expect(oQueChegou(ja, [aviso('SUP-1', '2026-10-12T10:00:00Z')])).toEqual([]);
    const novos = oQueChegou(ja, [
      aviso('SUP-3', '2026-10-12T10:02:00Z'), aviso('SUP-2', '2026-10-12T10:01:00Z', { lido: true }), aviso('SUP-1', '2026-10-12T10:00:00Z'),
    ]);
    expect(novos.map((a) => a.id)).toEqual(['SUP-3']);
    // o mesmo aviso não pula duas vezes
    expect(oQueChegou(ja, [aviso('SUP-3', '2026-10-12T10:02:00Z')])).toEqual([]);
  });

  it('o aviso do observador que juntou mais mudanças (o mesmo aviso, mais novo) chega de novo', () => {
    const ja = new Set<string>();
    const obs = (em: string, texto: string) => aviso('n-9', em, { tipo: 'observador', texto });
    oQueChegou(ja, [obs('2026-10-12T10:00:00Z', 'Ana mudou no SUP-9: o relato')]);
    const de = oQueChegou(ja, [obs('2026-10-12T10:05:00Z', 'Ana mudou no SUP-9: o relato · a solução')]);
    expect(de.map((a) => a.texto)).toEqual(['Ana mudou no SUP-9: o relato · a solução']);
  });
});

describe('a fila dos cartões (ficam até abrir ou fechar)', () => {
  it('os novos entram por cima e nenhum sai sozinho: passou de 3, os outros esperam a vez', () => {
    let fila = juntarCartoes([], [aviso('SUP-1', '2026-10-12T10:00:00Z')]);
    fila = juntarCartoes(fila, [aviso('SUP-3', '2026-10-12T10:02:00Z'), aviso('SUP-2', '2026-10-12T10:01:00Z')]);
    fila = juntarCartoes(fila, [aviso('SUP-4', '2026-10-12T10:03:00Z')]);
    expect(fila.map((c) => c.id)).toEqual(['SUP-4', 'SUP-3', 'SUP-2', 'SUP-1']);
    expect(fila.slice(0, NA_TELA).map((c) => c.id)).toEqual(['SUP-4', 'SUP-3', 'SUP-2']);
  });

  it('o mesmo aviso que volta (atualizado) troca de lugar, sem repetir', () => {
    const fila = juntarCartoes([aviso('n-9', '2026-10-12T10:00:00Z'), aviso('SUP-1', '2026-10-12T09:00:00Z')], [aviso('n-9', '2026-10-12T10:05:00Z', { texto: 'mais mudanças' })]);
    expect(fila.map((c) => [c.id, c.texto])).toEqual([['n-9', 'mais mudanças'], ['SUP-1', 'Você recebeu o chamado SUP-1']]);
  });
});

describe('o lembrete do calendário (2.0.2)', () => {
  it('a segunda linha: o calendário e o dia (o chamado tem a dele)', () => {
    const lembrete = aviso('l1', '2026-10-20T12:00:00.000Z', { tipo: 'lembrete', texto: 'Lembrete: Visita, amanhã, 21/10, às 09:00', chamado: null, evento: { id: 'e1', titulo: 'Visita', inicio: '2026-10-21' } });
    expect(segundaLinhaDoAviso(lembrete)).toBe('Calendário · 21/10');
    expect(segundaLinhaDoAviso(aviso('SUP-1', '2026-10-20T12:00:00.000Z'))).toBeNull();
  });
});
