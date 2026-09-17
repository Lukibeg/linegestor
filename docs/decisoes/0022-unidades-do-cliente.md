# 0022 — Unidades cadastradas no cliente, com a Matriz como padrão

**Contexto.** Na decisão 0015 a unidade do aparelho era texto livre, com sugestões das já usadas.
Na prática isso não ajudava na hora de movimentar: a lista sugeria unidades de todos os clientes, e
nada impedia "Loja Simões Filho" e "Loja S. Filho" no mesmo cliente.

**Decisão.**

- Nova tabela `client_units`: as unidades de cada cliente. **Todo cliente tem a "Matriz"**
  (`is_main`), criada sozinha, que é a unidade padrão e não pode ser removida (só renomeada).
- A ficha do cliente ganhou a aba **Unidades**: cadastrar, renomear (os aparelhos daquela unidade
  acompanham o nome novo) e remover (só se não houver aparelho nela).
- No painel **Movimentar aparelhos**, escolhido o cliente de destino, o campo Unidade vira uma lista
  com as unidades dele, já na Matriz. Há a opção "+ nova unidade…", que cadastra a unidade no
  cliente na mesma hora. Sem escolha, o aparelho vai para a Matriz.
- O aparelho continua guardando o **nome** da unidade (`devices.unit`); a movimentação também passou
  a guardar para qual unidade foi (`device_movements.unit`).
- Movimentar para **outro** cliente não carrega mais a unidade do cliente anterior (antes carregava).
- **Migração:** todo cliente recebeu a Matriz, e as unidades já digitadas nos aparelhos viraram
  unidades cadastradas do respectivo cliente.

**Movimentações na ficha.** A aba Equipamentos da ficha tem agora duas vistas: **Aparelhos** e
**Movimentações** (tudo o que entrou e saiu daquele cliente). Clicar numa movimentação mostra
quais aparelhos foram. A mesma abertura vale na aba Movimentações do Inventário.
