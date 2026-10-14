/**
 * A janela por cima da tela (1.10): a ficha de um chamado e o Abrir chamado abrem por cima da tela de
 * onde vieram, que fica como estava (os pedidos do Luan na prévia). O link direto, sem a tela de baixo
 * (o endereço da ficha mandado para alguém, o botão da conversa do LineChat), abre a página inteira.
 */
import { describe, expect, it } from 'vitest';
import type { Location } from 'react-router-dom';
import { ehAbrirChamado, ehFichaDoChamado, fundoDaJanela } from './comum.js';

const lugar = (pathname: string, state: unknown = null, search = ''): Location => ({ pathname, search, hash: '', state, key: 'k' });

describe('a janela por cima da tela', () => {
  it('a ficha é o endereço com o código; as telas do módulo não são fichas', () => {
    expect(ehFichaDoChamado('/atendimento/SUP-12')).toBe(true);
    for (const t of ['novo', 'quadro', 'lista', 'meu-dia', 'ajustes']) expect(ehFichaDoChamado(`/atendimento/${t}`)).toBe(false);
    expect(ehAbrirChamado('/atendimento/novo')).toBe(true);
    expect(ehAbrirChamado('/atendimento/novo/')).toBe(true);
    expect(ehAbrirChamado('/atendimento/SUP-12')).toBe(false);
    expect(ehAbrirChamado('/base/novo')).toBe(false);
  });

  it('com a tela de baixo, o Abrir chamado e a ficha abrem na janela; sem ela, na página inteira', () => {
    const quadro = lugar('/atendimento/quadro', null, '?painel=painel-suporte');
    expect(fundoDaJanela(lugar('/atendimento/novo', { fundo: quadro }, '?painel=painel-suporte'))).toBe(quadro);
    expect(fundoDaJanela(lugar('/atendimento/SUP-12', { fundo: quadro }))).toBe(quadro);
    // o link direto (o botão da conversa do LineChat, numa aba nova): página inteira
    expect(fundoDaJanela(lugar('/atendimento/novo', null, '?telefone=5571999990000&sessao=8f3c2a10'))).toBeNull();
    expect(fundoDaJanela(lugar('/atendimento/SUP-12'))).toBeNull();
    // a tela de baixo só vale no endereço de uma janela (um estado antigo em outra tela não abre nada por cima)
    expect(fundoDaJanela(lugar('/atendimento/quadro', { fundo: quadro }))).toBeNull();
  });
});
