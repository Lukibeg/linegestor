/**
 * O Comercial no menu (2.0.1): o painel de Vendas aberto por último fica lembrado neste navegador, para o
 * Painel do Comercial (até o 2.0.1, Negociações) e o Relatórios do menu voltarem para ele (quem tem mais de um painel de Vendas troca pelo
 * Trocar, no alto do quadro). Só uma conveniência: sem o storage, vale o primeiro painel de Vendas.
 */
const CHAVE = 'gestor.comercial.painel';

export function lembrarPainelDoComercial(painelId: string) {
  try { localStorage.setItem(CHAVE, painelId); } catch { /* sem storage */ }
}

export function painelLembradoDoComercial(): string | null {
  try { return localStorage.getItem(CHAVE); } catch { return null; }
}
