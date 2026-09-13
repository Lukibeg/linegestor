/**
 * Catálogos iniciais. São gravados no banco pelo "seed" (a carga inicial) e, a partir daí,
 * gerenciados pela tela de Administração. Aqui é só o ponto de partida.
 */

/** Os 8 produtos do portfólio. `hasSettings` = tem uma tabela de configuração própria. */
export const PRODUTOS_INICIAIS = [
  { code: 'linepbx',      name: 'LinePBX',      color: '#2457D6', hasSettings: true,  description: 'Central telefônica IP (URA, filas, siga-me, gravação).' },
  { code: 'fop2',         name: 'FOP2',         color: '#7C3AED', hasSettings: true,  description: 'Painel de operador sobre o Asterisk (produto de terceiro).' },
  { code: 'omniboard',    name: 'Omniboard',    color: '#0891B2', hasSettings: true,  description: 'Sistema de call center: onde os agentes fazem login.' },
  { code: 'linereports',  name: 'LineReports',  color: '#059669', hasSettings: false, description: 'Relatórios de operação telefônica.' },
  { code: 'linechat',     name: 'LineChat',     color: '#D97706', hasSettings: false, description: 'Atendimento multicanal (WhatsApp, Instagram, Facebook).' },
  { code: 'szchat',       name: 'SZChat',       color: '#9CA3AF', hasSettings: true,  description: 'Atendimento da Fortics (legado, terceiro).' },
  { code: 'voicenet',     name: 'VoiceNet',     color: '#DC2626', hasSettings: false, description: 'Tronco SIP da operadora do grupo.' },
  { code: 'equipamentos', name: 'Equipamentos', color: '#4B5563', hasSettings: false, description: 'Cliente com aparelhos locados/vendidos/emprestados.' },
] as const;

export type ProductCode = (typeof PRODUTOS_INICIAIS)[number]['code'];

export const OPERADORAS_INICIAIS = ['ALGAR', 'VC1'] as const;

export const HOSPEDAGENS_INICIAIS = ['Local', 'Nuvem (Local)', 'Vultr', 'AWS', 'Contabo', 'Hetzner', 'Outro'] as const;

export const CATEGORIAS_APARELHO_INICIAIS = ['Telefone IP', 'Periférico', 'ATA', 'Gateway', 'Switch', 'Outro'] as const;

/** Modalidades de movimentação de aparelho (decisão V3 + devolução). */
export const MODALIDADES = {
  locacao: 'Locação',
  venda: 'Venda',
  comodato: 'Comodato',
  devolucao: 'Devolução',
} as const;
export type Modalidade = keyof typeof MODALIDADES;

/** Condição do aparelho (decisão V6: não existe "Indeterminado"). */
export const CONDICOES_APARELHO = {
  ativo: 'Ativo',
  manutencao: 'Em manutenção',
  baixado: 'Baixado',
  vendido: 'Vendido',
} as const;
export type CondicaoAparelho = keyof typeof CONDICOES_APARELHO;

/** Como um modelo é contado. */
export const CONTABILIZACOES = {
  serializado: 'Serializado (um a um, por MAC)',
  granel: 'Granel (por quantidade)',
} as const;
export type Contabilizacao = keyof typeof CONTABILIZACOES;

/** Organizações internas do grupo (decisão 4 da arquitetura). */
export const ORGANIZACOES_INTERNAS = [
  { code: 'ingline',  name: 'Ingline Systems', legalName: 'Ingline Systems', ownsDevices: true },
  { code: 'voicenet', name: 'VoiceNet',        legalName: 'VoiceNet Telecom', ownsDids: true },
] as const;
