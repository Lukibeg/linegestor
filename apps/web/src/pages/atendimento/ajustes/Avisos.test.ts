/**
 * A prévia das mensagens do WhatsApp (2.0.2): o negrito, o itálico e o riscado como o WhatsApp mostra — a
 * marca vale no começo e no fim de palavra; o "_" no meio de um endereço continua "_".
 */
import { describe, expect, it } from 'vitest';
import { partesDoWhatsApp } from './Avisos.js';

describe('a prévia no jeito do WhatsApp', () => {
  it('*negrito*, _itálico_ e ~riscado~', () => {
    expect(partesDoWhatsApp('🔎 *Painel:* Suporte')).toEqual([
      { texto: '🔎 ', estilo: 'normal' }, { texto: 'Painel:', estilo: 'negrito' }, { texto: ' Suporte', estilo: 'normal' },
    ]);
    expect(partesDoWhatsApp('_Teste_ e ~velho~.')).toEqual([
      { texto: 'Teste', estilo: 'italico' }, { texto: ' e ', estilo: 'normal' }, { texto: 'velho', estilo: 'riscado' }, { texto: '.', estilo: 'normal' },
    ]);
  });

  it('a marca no meio da palavra, com espaço por dentro ou sem fechar não vale', () => {
    for (const t of ['https://x.com/a_b_c', 'cb-a35e88f1_qst_b9', '2 * 3 * 4', '*sem fechar', '* espaço*', 'a*b*c']) {
      expect(partesDoWhatsApp(t), t).toEqual([{ texto: t, estilo: 'normal' }]);
    }
  });

  it('cada linha por si: a marca não atravessa a quebra', () => {
    expect(partesDoWhatsApp('*um\ndois*')).toEqual([{ texto: '*um\ndois*', estilo: 'normal' }]);
    expect(partesDoWhatsApp('*Nota:* a\n*Quem:* b').filter((p) => p.estilo === 'negrito').map((p) => p.texto)).toEqual(['Nota:', 'Quem:']);
    expect(partesDoWhatsApp('')).toEqual([]);
  });
});
