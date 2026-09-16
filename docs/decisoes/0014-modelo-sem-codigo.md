# 0014 — Cadastro de modelo: só o nome, e uma caixa para "não se aplica MAC"

**Contexto.** O formulário pedia "Código" (um apelido técnico), "Nome" e um seletor "Como contar" com as palavras
*serializado* e *granel* — vocabulário de programador, não de quem trabalha com os aparelhos.

**Decisão.**
- O formulário pede **Modelo** (ex.: "Grandstream GXP1610") e a categoria. O código continua existindo por dentro,
  como identificador estável para a importação de CSV, mas é gerado a partir do nome — ninguém digita.
- No lugar do seletor, uma caixa: **"Não se aplica MAC"**, explicando que serve para headset, cabo e afins, onde o
  sistema conta só a quantidade em estoque. Sem marcar, cada unidade entra pelo MAC — que é o caso normal.
- Nos cartões de modelo, os rótulos viraram **por MAC** e **sem MAC**.

**Consequência.** Menos campo para preencher e nenhuma palavra técnica.

**Atualizado na [0019](0019-uma-linha-por-aparelho.md)** (set/2026): a caixa "Não se aplica MAC" saiu do cadastro do
**modelo** e passou para o cadastro do **aparelho** — o mesmo modelo pode ter unidade com e sem MAC, e a decisão é de
cada unidade. A coluna `tracking` (`serializado`/`granel`) deixou de existir.
