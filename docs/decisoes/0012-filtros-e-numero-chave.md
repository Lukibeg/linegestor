# 0012 — Os cartões de resumo obedecem aos filtros; e o número chave do circuito

**Contexto.** Os cartões no topo de Circuitos e do Inventário mostravam sempre o total geral, mesmo com um
filtro aplicado logo abaixo — dois números na mesma tela dizendo coisas diferentes, o que gera desconfiança.

**Decisão.**
- Em **Circuitos e DIDs** e no **Inventário**, os cartões do topo usam exatamente os mesmos filtros da lista.
  No código isso é literal: uma única função monta as condições e alimenta a lista e o resumo.
  Quando há filtro, o primeiro cartão diz "(filtrado)" e aparece um atalho para limpar.
- Circuitos podem ser filtrados por **titular**, além de operadora e busca.
- "Código" passou a se chamar **N° do circuito** nas telas e no CSV (o campo é o mesmo).
- Cada circuito ganhou o **número chave** (número piloto do feixe), preenchido no cadastro, exibido na
  lista e no detalhe, e incluído na importação/exportação.

**Consequência.** O que está no topo sempre bate com o que está na tabela. Quem procura "os feixes da
VoiceNet na ALGAR" vê o valor mensal só desses feixes.
