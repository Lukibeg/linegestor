# 0006 — Papéis como listas de permissões

**Contexto.** O Nexus não tem controle de acesso: todo usuário autenticado faz tudo.

**Decisão.** 14 permissões atômicas (`packages/shared/src/permissoes.ts`) e 4 papéis iniciais (Leitor, Operador, Técnico, Administrador). Um papel é só uma lista de permissões; a tela de Administração permite criar outros. O papel Administrador sempre tem todas; o sistema nunca fica sem um administrador ativo.

**Consequência.** Toda rota do servidor declara a permissão que exige. A interface esconde o que a pessoa não pode fazer, mas a garantia real é no servidor.
