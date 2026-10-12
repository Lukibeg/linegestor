/**
 * Os avisos que chegam (1.10): o vigia só mostra o que chegou depois que a tela abriu e ainda não foi
 * lido — e o aviso do observador, que junta as mudanças e volta a chegar, aparece de novo.
 */
import { describe, expect, it } from 'vitest';
import type { AvisoNaTela } from '@gestor/shared';
import { oQueChegou } from './AvisosQueChegam.js';

const aviso = (id: string, em: string, m: Partial<AvisoNaTela> = {}): AvisoNaTela => ({
  id, tipo: 'recebeu', texto: `Você recebeu o chamado ${id}`, chamado: { id: `c-${id}`, codigo: id, titulo: 'Ramal mudo' }, em, lido: false, ...m,
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
