# Relatórios do Inventário (Patch 1.9)

Inventário › aba **Relatórios**. Três partes, escolhidas nos botões do alto. Todo mundo que vê o
inventário vê os relatórios. **Clicar em qualquer número abre os aparelhos dele**, cada um com o link
para a ficha — e o Voltar da ficha traz de volta para o relatório.

O número laranja ao lado de **Histórico e cadastro** é quantas pendências o cadastro tem.

## Clientes

**Quem tem o quê** — uma linha por cliente, uma coluna por modelo: quantos aparelhos nossos estão
com ele, em locação ou comodato (embaixo do nome), em quantas unidades, e o valor. As duas últimas
linhas são o total com clientes e o que está no estoque. Clique no título de uma coluna para ordenar.
Vendido não entra: o aparelho vendido já é do cliente. O cliente que saiu da base vem marcado ao lado
do nome — **cliente na lixeira**, **cliente arquivado**, **sem produto ativo** ou **sem o
Equipamentos** —: é aparelho nosso que precisa voltar (Movimentar › Devolução) ou, se o cliente
voltou, o cadastro dele que precisa ser acertado.

## Estoque e valor

**Na prateleira** — por modelo: quanto tem **para entregar** (ativos), os inativos, **há quanto
tempo está parado** (desde que chegou ao estoque, ou voltou) e **para quantas semanas dá**, no ritmo
de saída dos últimos 90 dias. A situação diz **sem estoque**, **pouco estoque** (menos de 4 semanas),
**sem saída** ou **em dia**. Com menos de 4 semanas de movimentações guardadas no Gestor, o ritmo
ainda não aparece (só as saídas).

**Quanto vale o parque** — o dinheiro que temos em aparelho (sem os vendidos): em comodato, em
locação, em uso interno e no estoque. O aparelho sem valor (nem dele, nem do modelo) não soma — o
rodapé diz quantos são, e o Cadastro em dia diz de qual modelo.

## Histórico e cadastro

**Vai e volta** — o que saiu do estoque, o que voltou e quantos voltaram **inativos** (a devolução
marcada como Inativo), por modelo e por cliente, quanto tempo ficou no cliente antes de voltar e as
últimas devoluções. Conta desde a primeira movimentação guardada no Gestor.

**Cadastro em dia** — clique em cada item para ver a lista e o link para corrigir:

| Item | Onde corrigir |
|---|---|
| MAC ou N/S escrito na anotação | ficha do aparelho › Editar: passar o código para o campo MAC ou N/S |
| Sem MAC e sem N/S | ficha do aparelho › Editar (o modelo costuma ter: olhe a etiqueta) |
| Modelo sem valor | Inventário › Modelos › o modelo › Editar modelo |
| Cliente sem o login padrão do modelo | ficha do cliente › Acessos › Rede padrão dos aparelhos |
| Cliente sem a rede padrão | ficha do cliente › Acessos › Rede padrão dos aparelhos |
| Valor diferente do modelo (conferir) | se foi engano: Editar modelo › "Usar este valor em todos" |
| Modelo sem foto (conferir) | Editar modelo › Foto |
