# 0036 — "1º produto — ativado em" no lugar do "1º módulo"

**Contexto.** No 1009.docx (30/09) o pedido estava escrito como "uma coluna ativação primeiro
módulo, onde ele só vai considerar a ativação do primeiro módulo mesmo que o cliente tenha mais de
1". O 1.6 fez ao pé da letra: a ativação do módulo ligado mais antigo (decisão 0035). Com o 1.6 já
no `main`, o Luan corrigiu: "na verdade é primeiro produto que eu ativei".

**Decisão.**

- A coluna passa a ser **"1º produto — ativado em"** (`primeiroProduto`), no grupo "Ativado em" do
  botão Colunas, **antes** das datas de cada produto: a data de ativação do **produto ativado
  primeiro**, mesmo que o cliente tenha vários, com o **nome do produto embaixo**, na cor dele.
- Contam os produtos **ativos hoje** — os mesmos que a lista mostra, com as datas de cada um ao
  lado. Produto encerrado não entra. O **Equipamentos** também não: ele não tem data de ativação na
  tela desde o 1.5 (`PRODUTOS_SEM_DATA_DE_ATIVACAO`), e a data que o banco guardar dele não aparece
  em lugar nenhum.
- Ordena no servidor (`sort=primeiroProduto`: o `min` das datas); sem data, no fim nos dois
  sentidos.
- A coluna **"1º módulo" sai** (e o `sort=primeiroModulo` com ela, que cai no nome fantasia).
  Quem tinha marcado a antiga passa a ver a nova no mesmo lugar: o `useColunasEscolhidas` ganhou
  `renomeadas` ({ id antigo: id novo }), que troca o id na escolha guardada no navegador.

**Consequências.**

- Sai como **Patch 1.6.1** (o 1.6 já estava mesclado; o Luan pediu 1.6.1 por ser uma alteração pequena). Sem migração.
- Teste em `apps/api/test/patch161.test.ts`; o do 1º módulo saiu do `patch16.test.ts`.
- **Revê a 0035** só neste ponto; o resto do 1.6 fica como está.
- Se um dia quiserem contar também os produtos já encerrados ("quando o cliente começou com a
  gente"), é tirar o `deactivatedAt is null` da conta e trazer as assinaturas encerradas para a
  lista — hoje ela só recebe as ativas.
