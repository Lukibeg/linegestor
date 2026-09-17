# 0021 — O valor mora no modelo; o aparelho pode ter número de série; cadastro em massa

**Contexto.** Com uma linha por aparelho (decisão 0019), o valor passou a ser digitado em cada um. Na
prática, todos os GXP1610 valem o mesmo — e a ficha do Pronto Saúde mostrava 11 aparelhos valendo
R$ 0,00, porque ninguém ia preencher onze vezes o mesmo número. Além disso, alguns aparelhos não têm
MAC mas têm **número de série (N/S)** na etiqueta, e cadastrar uma caixa com 30 telefones era
preencher o formulário 30 vezes.

**Decisão.**

- **Valor no modelo** (`device_models.value_cents`), definido ao cadastrar o modelo e editável
  depois. O aparelho só tem valor próprio (`devices.value_cents`) quando é diferente do modelo;
  vazio = vale o do modelo. Todas as somas (ficha do cliente, cartões do Inventário, Painel) usam
  `coalesce(valor do aparelho, valor do modelo)`.
- Ao mudar o valor de um modelo que tem aparelhos com valor próprio, a tela oferece **"usar este
  valor em todos"** — que apaga os valores próprios daquele modelo.
- **Migração dos dados que já existiam:** cada modelo recebeu o valor mais comum entre os seus
  aparelhos, e os aparelhos com exatamente esse valor passaram a "usar o do modelo". Nenhuma soma
  mudou.
- **Número de série** (`devices.serial_number`): não se repete dentro do mesmo modelo. A coluna
  "MAC" virou **"MAC / N/S"**: mostra o MAC; sem MAC, o N/S (com a etiqueta "N/S"); sem nenhum,
  "não aplicável". A busca acha pelos dois (pedaço de MAC só a partir de 4 caracteres, para "HS-002"
  não achar todo MAC com "002").
- **Cadastro em massa**: o formulário "Cadastrar aparelhos" aceita **uma lista colada** de MACs ou de
  N/S (um por linha, ou separados por vírgula/espaço), ou uma **quantidade** para quem não tem
  identificação. A tela conta na hora quantos entram, quantos são inválidos e quantos repetem. O
  servidor confere a lista inteira antes de gravar: um item com problema recusa tudo e devolve a
  lista do que barrou (`POST /inventory/devices/bulk`).
- **Local físico saiu da tela** (cadastro, edição, colunas, ficha). A coluna continua no banco para
  não perder o que já foi digitado.
- **Foto do modelo**, guardada no banco como a logo do cliente (`device_model_images`, até 512 KB,
  reduzida no navegador). Os modelos viraram cartões com foto; clicar abre um pop-up com **todos os
  aparelhos daquele modelo** — no estoque, em clientes e vendidos —, com filtro rápido, e dali se
  edita o modelo e se cadastram mais aparelhos.
- No filtro "Atribuído a" do Inventário entrou **"Só em clientes"** (`clientId=clients`), ao lado de
  "Só estoque".
