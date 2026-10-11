# 0044 — A equipe entra no portal do cliente com o login do Gestor

**Contexto.** Em 09/10, com o 1.9 na prévia e o portal do cliente (1.8) já no ar, o Luan perguntou
como ele mesmo entrava no portal para ver como estava ficando — e a resposta era dar a si mesmo um
acesso de cliente, pelo convite. Logo depois pediu: "quero que todos que têm uma senha como usuário
do Ingline Gestão tenham um login idêntico para o portal do cliente, e que seja automaticamente
criado quando criar o seu usuário do Ingline Gestão". Como o 1.9 ainda não subiu, entrou nele.

**Decisão.**

- **O mesmo login, sem criar nada.** Em vez de criar (e manter em dia) uma cópia de cada usuário no
  portal, o portal aceita o próprio usuário do Gestor: o mesmo e-mail e a mesma senha. Vale para
  quem já existe e para quem for criado depois, e a senha trocada no Gestor já é a senha do portal —
  não há duas senhas para ficarem diferentes.
- **Quem entra.** O usuário **ativo** do Gestor. O desativado não entra (a mesma mensagem de senha
  errada, como no Gestor), e a sessão aberta no portal cai na hora: o portal confere o usuário a cada
  pedido, como confere o cliente.
- **O código de 6 dígitos também.** Quem usa a verificação em duas etapas no Gestor digita o código
  no portal (ou um código de recuperação, que vale uma vez e conta no Gestor). A senha certa responde
  "falta o código" e a tela pede os 6 dígitos; o código vai com o e-mail e a senha de novo, para
  `/api/portal/entrar/codigo`, com o mesmo limite da segunda etapa do Gestor (10 tentativas a cada 5
  minutos).
- **O que a equipe vê: tudo o que está publicado.** Todos os tutoriais publicados, de todos os
  produtos e módulos (o rascunho continua só no Gestor). No lugar do cliente aparece **Equipe
  Ingline**, e o início avisa: "Você entrou com o login da equipe e vê todos os tutoriais publicados.
  Cada cliente vê só os dos produtos que tem." **A visita da equipe não conta** no número de
  visualizações do tutorial (o número é o dos clientes).
- **A senha da equipe não se troca pelo portal.** Em Minha conta, no portal, no lugar do formulário
  fica "A senha é a do Ingline Gestão", com o link para Minha conta do Gestor; o servidor recusa a
  troca pelo portal.
- **Senha nova derruba o portal.** Quando a senha muda no Gestor (o administrador redefine, ou a
  própria pessoa troca em Minha conta) ou o usuário é desativado, as sessões dele no portal caem —
  como acontece com o acesso de cliente quando a senha muda.
- **Continua outro login.** A sessão do portal é a do portal (o cookie `gestor_portal`): entrar no
  portal não abre o Gestor, e estar no Gestor não abre o portal (é preciso entrar lá com o mesmo
  e-mail e senha).
- **O acesso de cliente com o mesmo e-mail continua valendo.** Se alguém da equipe também tiver um
  acesso de cliente cujo login é o seu e-mail (para ver o portal como um cliente), **a senha decide**:
  a do acesso de cliente entra como o cliente; a do Gestor, como a equipe. (Desde a decisão 0045, no
  mesmo 1.9, o acesso de cliente tem login — o e-mail ou um nome — e a tela de entrar pede "Login": a
  equipe digita ali o e-mail do Gestor.)
- **Auditoria.** A entrada da equipe no portal fica registrada ("Fulano entrou no portal do cliente
  com o login da equipe", com a verificação em duas etapas ou o código de recuperação quando houve),
  e o código errado também. Nunca a senha nem o código.

**Consequências.**

- Migração `0012_equipe_no_portal`: `portal_sessions` ganhou `staff_user_id` (liga com `users`) e o
  `portal_user_id` passou a aceitar vazio; uma regra no banco garante que a sessão é de um ou de
  outro, nunca dos dois nem de nenhum. Roda sozinha no `publicar.sh`.
- `POST /api/portal/entrar` responde `{ precisaCodigo: true }` para quem da equipe usa o código;
  rota nova `POST /api/portal/entrar/codigo`. `GET /api/portal/eu` manda `equipe`.
- Na tela do Gestor: um aviso em Administração › Usuários ("Cada usuário daqui também entra no
  portal do cliente…") e em Portal do cliente › Acessos ("A equipe não precisa de acesso aqui").
- Testes novos: `apps/api/test/patch19-equipe-portal.test.ts`.
- O gerador da documentação do banco (`pnpm db:docs`) passou a ler as colunas que ligam com outra
  tabela com `onDelete` e as tabelas escritas no formato curto — antes elas ficavam de fora de
  `docs/banco-de-dados.md` (a tabela `users`, por exemplo, aparecia sem colunas).
- **Ficou de fora, para quando ele pedir**: ver o portal **como um cliente** escolhido (hoje, para
  isso, é dar um acesso de cliente a si mesmo, como antes).
