# 0013 — Ordenar por qualquer coluna, em toda tabela

**Contexto.** As tabelas vinham sempre na mesma ordem (cliente por nome, circuito por nome, movimentação por data).
Quem precisa de "quem está na Vultr?" ou "quem ativou o FOP2 primeiro?" tinha que ler linha por linha.

**Decisão.**
- Todo cabeçalho de coluna é um botão: clicar ordena, clicar de novo inverte. A seta mostra o que está valendo.
- **Vazio vai sempre para o fim**, nos dois sentidos — quem não tem hospedagem não atrapalha a leitura de quem tem.
- Nas tabelas com páginas (clientes, circuitos, numeração, aparelhos, movimentações, auditoria) **quem ordena é o servidor**:
  a ordem vale para a lista inteira, não só para a página que está na tela. A coluna escolhida fica no endereço
  (`?ord=…&dir=…`), então dá para guardar nos favoritos ou mandar o link para alguém.
- Nas tabelas pequenas, que vêm de uma vez só (usuários, lixeira, DIDs e equipamentos dentro da ficha do cliente,
  itens a granel), a ordenação acontece na própria tela — mesmo visual, mesma regra de vazio no fim.
- Colunas criadas na hora também ordenam: "ativado em" de cada produto e cada módulo (pela data em que foi ativado).
- Datas e quantidades começam do maior para o menor no primeiro clique; textos começam de A a Z.

**Consequência.** Uma peça só (`apps/web/src/lib/ordenacao.tsx`) desenha todos os cabeçalhos, e no servidor cada
lista traduz o nome da coluna para um `ORDER BY`. Coluna desconhecida não derruba nada: volta para a ordem padrão.
