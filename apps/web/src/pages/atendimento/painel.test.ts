/**
 * O Trocar do alto do painel (2.4.11): os painéis da equipe e o seu painel pessoal; os painéis pessoais dos outros não
 * aparecem (o Luan: "o de cada eu quero que tenha, n quero que apareça os dos outros").
 */
import { describe, expect, it } from 'vitest';
import { paineisDoTrocar } from './painel.js';

const painel = (id: string, extra: { ativo?: boolean; donoId?: string | null } = {}) => ({ id, ativo: extra.ativo ?? true, donoId: extra.donoId ?? null });

describe('os painéis do Trocar', () => {
  const paineis = [
    painel('suporte'),
    painel('desenvolvimento'),
    painel('meu', { donoId: 'luan' }),
    painel('da-marina', { donoId: 'marina' }),
    painel('arquivado', { ativo: false }),
  ];

  it('mostra os da equipe e o seu pessoal; esconde os pessoais dos outros e os arquivados', () => {
    expect(paineisDoTrocar(paineis, 'suporte', 'luan').map((p) => p.id)).toEqual(['suporte', 'desenvolvimento', 'meu']);
  });

  it('cada pessoa vê o seu: a Marina vê o dela, e não o do Luan', () => {
    expect(paineisDoTrocar(paineis, 'suporte', 'marina').map((p) => p.id)).toEqual(['suporte', 'desenvolvimento', 'da-marina']);
  });

  it('o painel aberto sempre aparece (o pessoal de outra pessoa aberto por um link, o arquivado aberto por um link antigo)', () => {
    expect(paineisDoTrocar(paineis, 'da-marina', 'luan').map((p) => p.id)).toEqual(['suporte', 'desenvolvimento', 'meu', 'da-marina']);
    expect(paineisDoTrocar(paineis, 'arquivado', 'luan').map((p) => p.id)).toEqual(['suporte', 'desenvolvimento', 'meu', 'arquivado']);
  });
});
