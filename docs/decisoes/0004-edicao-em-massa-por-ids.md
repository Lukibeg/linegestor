# 0004 — Edição em massa só por lista explícita de ids

**Contexto.** No Nexus, o painel "Editar" aplica a alteração a tudo que estiver filtrado, sem dizer quantos registros, sem confirmação e sem desfazer. Um filtro esquecido atinge 1.569 números.

**Decisão.** O servidor só aceita edição em massa com a lista explícita de ids (`POST /dids/bulk`), devolve o número exato de afetados e registra na auditoria "Alterou N DID(s): …". A interface mostra caixas de seleção, "selecionar todos os filtrados" como ação explícita, um contador permanente e uma confirmação com a quantidade — e, acima de 50, exige digitar o número.

**Consequência.** Não existe "aplicar em tudo" implícito. O custo é um passo a mais; o ganho é nunca reatribuir a base inteira por engano.
