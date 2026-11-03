# 0059 — As movimentações dos circuitos e dos DIDs

**Data:** 03/11/2026 · **Patch:** 2.4.1 · **Situação:** aceita

## O pedido

O Luan, em 03/11: *"eu quero q dentro de circuitos tenha uma aba, movimentações onde qualquer alteração nos circuirtos, dids
novos, alterados, circuito novo, etc fique registrada nessa aba especificamente tbm"*.

## O que foi decidido

1. **Uma tabela própria** (`circuit_movements`, a migração `0033`), e não só a auditoria: a auditoria guarda tudo do sistema e,
   nas alterações em massa, não dizia quais números; a movimentação guarda os circuitos envolvidos (o DID que troca de
   circuito fica nos dois), os números e os fatos de antes e de depois. A auditoria continua igual.
2. **O que vira movimentação**: o circuito novo, o alterado (só quando algo muda de fato; salvar sem mexer não conta), o
   mandado para a lixeira e o restaurado; os DIDs novos (a faixa), o DID alterado (o cliente, o circuito, o uso, a observação),
   a edição em massa (cada número com o antes e o depois), a lixeira em massa e o restaurar (também pela Lixeira da
   Administração); e a importação da planilha de circuitos ou de DIDs (uma linha, com os números e os circuitos).
3. **A senha do tronco nunca aparece**: a movimentação diz só que ela foi **definida** ou **trocada**.
4. **A frase é escrita na hora** (com os nomes daquele momento: "Atribuiu o DID (71) 3034-8350 a Clínica Aurora", "Alterou o
   circuito Algar SIP 01: canais e senha do tronco"); **o detalhe** (campo a campo, "Cliente: Clínica Aurora → livre") é
   escrito na hora de mostrar, com os nomes de agora. As contas moram em `@gestor/shared/circuitos-movimentacoes.ts`, as mesmas
   no servidor, na prévia e na tela.
5. **Onde aparece**: a aba **Movimentações** de Circuitos e DIDs (ao lado de Circuitos e Numeração), com os filtros no endereço
   — a busca (o número do DID, com ou sem a máscara, ou um pedaço da frase), o tipo (cada um, ou "Tudo dos circuitos" e "Tudo
   dos DIDs"), o circuito, quem fez e o período —, 50 por página com o **Ver tudo**; e a **ficha do circuito**, com a mesma
   lista só daquele circuito (os filtros ficam na tela, para não brigar com os da tabela dos DIDs). Quem vê os circuitos vê
   (`records.read`).
6. **O que já tinha acontecido**: a `0033` traz o que a auditoria guardava dos circuitos e dos DIDs desde o começo, com a mesma
   pessoa e a mesma hora. A edição de um circuito ou de um DID vem com o antes e o depois; a faixa, com os números (refeitos do
   primeiro e da quantidade); a importação, com as contas. As alterações em massa e a lixeira em massa antigas não diziam
   quais números, e ficam só com a frase.

## Por quê

- Uma tabela só do assunto é o que deixa filtrar pelo circuito e achar pelo número sem varrer a auditoria inteira, e guarda
  o que a auditoria não guardava (os números de uma alteração em massa).
- O histórico de antes sai de graça: a auditoria já tinha quase tudo.

## Fica para depois

- As movimentações na ficha do cliente (os DIDs que entraram e saíram dele).
