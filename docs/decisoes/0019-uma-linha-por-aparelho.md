# 0019 — Uma linha por aparelho: o estoque a granel sai de cena

**Contexto.** O inventário tinha dois mundos. O modelo era marcado como *serializado* (cada unidade uma linha,
identificada pelo MAC) ou *a granel* (nenhuma linha; um saldo por modelo × lugar × modalidade na tabela `bulk_stock`).
Isso obrigava a manter duas telas de entrada ("cadastrar aparelho" e "ajustar estoque"), dois caminhos dentro da
movimentação, duas contagens em todo cartão — e ainda assim não respondia perguntas simples: *este headset está com
qual cliente, desde quando, e quanto custou?*

**Decisão.** Todo aparelho é uma linha em `devices`, tenha MAC ou não.

- `devices.mac` passou a ser **anulável**. Quem não tem MAC entra com o campo vazio, e todas as telas mostram
  **"não aplicável"** (`macFormatado(null)`). A unicidade continua valendo para os MACs que existem; dois aparelhos
  sem MAC convivem sem conflito.
- A escolha "não se aplica MAC" saiu do cadastro do **modelo** e virou uma **caixa no cadastro do aparelho**. Com ela
  marcada, aparece um campo **Quantidade**: cadastrar 20 headsets é uma vez o formulário, 20 linhas no banco.
- A tabela `bulk_stock` e a coluna `device_models.tracking` foram **removidas**. `device_movement_items` deixou de
  ter `quantity`/`modelId` solto: cada item é um `deviceId`, e a quantidade da movimentação é o número de itens.
- **Condição** ficou só **Ativo | Inativo**. "Em manutenção", "Baixado" e "Vendido" eram três nomes para
  "não está disponível" — e "vendido" nem era condição: aparelho vendido pode estar novo em folha.
- **Vendido virou modalidade**, não condição: é `currentModality = 'venda'`. Um aparelho vendido sai das listas e das
  contagens (já não é nosso), a menos que se peça `includeSold=true`, e não pode ser devolvido.
- **Valor não se digita na movimentação.** O valor é do aparelho, cadastrado uma vez no inventário, e é ele que soma
  no cartão "valor em equipamento" da ficha do cliente.

**Consequência.** Um caminho só para tudo: cadastrar, movimentar, contar. O histórico passou a existir também para
headset e cabo — cada unidade tem sua ficha e sua linha do tempo. O custo é o volume: 200 headsets são 200 linhas,
o que para a escala da Ingline (milhares, não milhões) não muda nada, e o formulário com quantidade evita o trabalho
repetitivo de cadastro.

**Migração.** Como o banco de produção ainda não existe, a migração inicial foi regerada em vez de escrita à mão.
Se um dia houver saldo a granel para converter, o caminho é gerar N linhas em `devices` por saldo, sem MAC.
