# packages/shared — o que é compartilhado entre o site e o servidor

Tudo o que **tanto a tela quanto o servidor precisam saber igual** mora aqui, para não existir em dois lugares:

- `permissoes.ts` — a lista de permissões e os quatro papéis (Leitor, Operador, Técnico, Administrador).
- `formatos.ts` — como validar e exibir CNPJ, telefone/DID e endereço MAC.
- `schemas/` — o "formato" de cada dado do sistema (cliente, circuito, DID, aparelho…), escrito com a biblioteca Zod.
  O servidor usa para conferir o que chega; a tela usa para conferir antes de enviar. Um único lugar, uma única verdade.
- `catalogos.ts` — as listas fixas iniciais: os 8 produtos, as operadoras conhecidas, as hospedagens, as modalidades de movimentação.
