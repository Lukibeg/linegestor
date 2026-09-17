# 0024 — Sem botão SSH; Unidades depois de Produtos

**Contexto.** A decisão 0023 tirou o usuário e a senha SSH do cliente e passou a usar o usuário de
cada técnico (Minha conta) no botão **SSH**. Olhando a tela, o Luan pediu para tirar o botão de vez:
a equipe abre o PuTTY do jeito que já está acostumada.

**Decisão.**

- Sai o botão **SSH** do topo da ficha do cliente, dos cartões e da coluna "Atalhos" da lista de
  clientes, e o **Abrir SSH** da aba Acessos. Fica o **Abrir** (a interface do servidor no navegador).
- Sai também o cartão **Seu usuário SSH** de Minha conta e a linha "Usuário SSH" da aba Acessos: eles
  só existiam para montar o botão. A **porta SSH** continua no cadastro do LinePBX e na aba Acessos,
  porque é informação do servidor.
- Sai o guia `docs/guia-de-uso/ssh-com-putty.md`, que ensinava a ligar o botão ao PuTTY.
- A permissão `access.use` passa a descrever só os atalhos que existem (web e FOP2).
- **No servidor nada foi removido**: a API continua montando `links.ssh` e aceitando
  `PATCH /auth/me` com `sshUser` (coluna `users.ssh_user`). Sem uso na tela, não atrapalham, e evitam
  uma migração só para apagar. Se o botão voltar, é só a tela.
- Na ficha do cliente, a aba **Unidades** passa a vir **depois de Produtos**:
  Visão geral · Acessos · DIDs · Equipamentos · Produtos · Unidades · Histórico.
