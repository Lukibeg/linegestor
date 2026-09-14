/**
 * Catálogos iniciais. São gravados no banco pelo "seed" (a carga inicial) e, a partir daí,
 * gerenciados pela tela de Administração. Aqui é só o ponto de partida.
 */

/**
 * Os produtos do portfólio. `hasSettings` = tem uma tabela de configuração própria.
 * Omniboard e FOP2 não são produtos: são MÓDULOS do LinePBX (ver MODULOS_INICIAIS).
 */
export const PRODUTOS_INICIAIS = [
  { code: 'linepbx',      name: 'LinePBX',      color: '#2457D6', hasSettings: true,  description: 'Central telefônica IP (URA, filas, siga-me, gravação).' },
  { code: 'linechat',     name: 'LineChat',     color: '#D97706', hasSettings: false, description: 'Atendimento multicanal (WhatsApp, Instagram, Facebook).' },
  { code: 'linereports',  name: 'LineReports',  color: '#059669', hasSettings: false, description: 'Relatórios de operação telefônica.' },
  { code: 'szchat',       name: 'SZChat',       color: '#9CA3AF', hasSettings: true,  description: 'Atendimento da Fortics (legado, terceiro).' },
  { code: 'voicenet',     name: 'VoiceNet',     color: '#DC2626', hasSettings: false, description: 'Tronco SIP da operadora do grupo.' },
  { code: 'equipamentos', name: 'Equipamentos', color: '#4B5563', hasSettings: false, description: 'Cliente com aparelhos locados/vendidos/emprestados.' },
] as const;

/**
 * Módulos: partes opcionais DENTRO de um produto. O cliente assina o produto e, nele, liga os módulos que usa.
 * O código é único dentro do produto (NPS existe no LinePBX e no LineChat, cada um é um módulo diferente).
 * `hasSettings` = o módulo tem configuração própria (FOP2: ramal admin; Omniboard: login e senhas).
 */
export const MODULOS_INICIAIS = [
  { product: 'linepbx',  code: 'omniboard',       name: 'Omniboard',         hasSettings: true,  description: 'Sistema de call center: onde os agentes fazem login.' },
  { product: 'linepbx',  code: 'fop2',            name: 'FOP2',              hasSettings: true,  description: 'Painel de operador sobre o Asterisk (produto de terceiro).' },
  { product: 'linepbx',  code: 'nps',             name: 'NPS',               hasSettings: false, description: 'Pesquisa de satisfação ao fim da chamada.' },
  { product: 'linechat', code: 'dashboard_filas', name: 'Dashboard de filas', hasSettings: false, description: 'Painel em tempo real das filas de atendimento.' },
  { product: 'linechat', code: 'nps',             name: 'NPS',               hasSettings: false, description: 'Pesquisa de satisfação ao fim do atendimento.' },
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
/**
 * Em que estado o aparelho está. Só dois: ou serve, ou não serve.
 * "Vendido" não é condição — sai da modalidade da última movimentação, porque um aparelho
 * vendido pode estar perfeitamente ativo, só que já não é nosso.
 */
export const CONDICOES_APARELHO = {
  ativo: 'Ativo',
  inativo: 'Inativo',
} as const;
export type CondicaoAparelho = keyof typeof CONDICOES_APARELHO;

/** Organizações internas do grupo (decisão 4 da arquitetura). */
export const ORGANIZACOES_INTERNAS = [
  { code: 'ingline',  name: 'Ingline Systems', legalName: 'Ingline Systems', ownsDevices: true },
  { code: 'voicenet', name: 'VoiceNet',        legalName: 'VoiceNet Telecom', ownsDids: true },
] as const;
