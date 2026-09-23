/**
 * Permissões e papéis.
 *
 * Uma PERMISSÃO é uma ação atômica que o sistema sabe verificar ("pode revelar senha?").
 * Um PAPEL é só um conjunto de permissões com um nome.
 * A tela de Administração deixa o administrador montar papéis novos marcando permissões —
 * por isso a lista de permissões vive aqui, e não espalhada pelo código.
 */

export const PERMISSIONS = {
  'records.read': 'Ver clientes, circuitos, DIDs e inventário',
  'access.use': 'Usar os atalhos de acesso (web, FOP2)',
  'notes.edit': 'Editar anotações e observações',
  'dids.assign': 'Alocar e liberar DIDs, inclusive em massa',
  'devices.move': 'Movimentar aparelhos (locar, vender, emprestar, devolver)',
  'records.write': 'Criar e editar clientes, produtos assinados e circuitos',
  'servers.write': 'Editar dados de servidor (IP, domínio, porta SSH)',
  'secrets.reveal': 'Revelar uma senha guardada (fica registrado)',
  'records.delete': 'Excluir (mandar para a lixeira) e restaurar',
  'data.import': 'Importar CSV',
  'data.export': 'Exportar CSV sem senhas',
  'data.export_secrets': 'Exportar CSV com senhas (fica registrado)',
  'projects.work': 'Trabalhar nos projetos: marcar etapas, comentar e anexar',
  'projects.manage': 'Criar e encerrar projetos, definir etapas e a lista de clientes',
  'support.read': 'Ver os chamados de suporte (a cópia do painel do LineChat)',
  'admin.manage': 'Gerenciar usuários, papéis e catálogos',
  'audit.read': 'Ver a auditoria',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/**
 * Os quatro papéis iniciais (decisão V1). A chave é o que fica no banco;
 * o nome é o que aparece na tela. Ordem = hierarquia (do menor para o maior).
 */
export const DEFAULT_ROLES: Array<{ key: string; name: string; description: string; permissions: Permission[] }> = [
  {
    key: 'leitor',
    name: 'Leitor',
    description: 'Só consulta. Não vê senhas, não altera nada.',
    permissions: ['records.read', 'support.read'],
  },
  {
    key: 'operador',
    name: 'Operador',
    description: 'Operação do dia a dia: aloca DIDs, movimenta aparelhos, anota. Sem senhas, sem exclusão, sem importação.',
    permissions: ['records.read', 'support.read', 'access.use', 'notes.edit', 'dids.assign', 'devices.move', 'data.export', 'projects.work'],
  },
  {
    key: 'tecnico',
    name: 'Técnico',
    description: 'Tudo do Operador + edita cadastros e dados de servidor, revela senhas (com registro) e vê a auditoria.',
    permissions: [
      'records.read', 'support.read', 'access.use', 'notes.edit', 'dids.assign', 'devices.move', 'data.export', 'projects.work',
      'records.write', 'servers.write', 'secrets.reveal', 'audit.read',
    ],
  },
  {
    key: 'administrador',
    name: 'Administrador',
    description: 'Tudo, incluindo exclusões, importação, exportação com senhas e gestão de usuários.',
    permissions: ALL_PERMISSIONS,
  },
];

export function roleHas(rolePermissions: readonly string[], permission: Permission): boolean {
  return rolePermissions.includes(permission);
}
