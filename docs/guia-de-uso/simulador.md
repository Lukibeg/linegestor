# Simulador do Comercial (Patch 2.0.2)

A conta de uma venda antes de fechar: o que o cliente paga (a mensalidade e a ativação) contra o que a
Ingline gasta (os aparelhos, a nuvem, os números, as comissões e o imposto). Fica no menu, em
**Comercial › Simulador**. Quem tem o Comercial vê tudo; quem trabalha nas negociações cria e muda; os
Ajustes (a tabela de custos, os modelos, o imposto e o sinal) são de quem cuida dos painéis.

## Uma simulação nova

1. **Nova simulação** e marque um ou mais modelos (os produtos da venda: **LinePBX em nuvem**,
   **LineChat (Helena)**, **VoiceNet**…) e **Começar**, ou **Em branco**. Os modelos trazem as linhas de
   custo, com a quantidade de cada uma: cada produto traz os custos dele, e a comissão entra uma vez só.
2. Dê um **nome** (o cliente, a proposta: "Padaria Estrela — 40 ramais").
3. Se quiser, **ligue a uma negociação**: escreva o código (COM-12) ao lado do nome e clique em **Ligar**.
   A ficha da negociação passa a mostrar a simulação, com a margem e o sinal. (Pela negociação é mais
   rápido: abaixo, **Simular a partir da negociação**.)
4. Preencha o que o cliente paga e os custos (abaixo).

Os números mudam enquanto você escreve, e **a simulação salva sozinha**: 2 segundos depois da última
mudança, ela vai para o servidor. No alto, no lugar do botão Salvar, o aviso diz **Salvando…** e depois
**Salvo às 08:42**. A simulação nova é criada assim que tiver um nome ("Dê um nome para salvar"). Se
faltar alguma coisa para salvar (um custo sem nome), o aviso diz o quê, também lá embaixo, e ela salva
assim que você completar. Cada salvamento vai para a auditoria, com o que mudou. Para testar uma ideia sem
mexer na conta, use o **+ Cenário**.

Nos campos de valor, ao entrar no campo, o zero sai (e um valor fica todo marcado): o que você escreve
entra no lugar.

## O que o cliente paga

- **Mensalidade** e **Ativação**: o que você quer cobrar.
- **A ativação em**: à vista ou em até 12 vezes (e não mais que o prazo). A primeira parcela entra no 1º
  mês, o da assinatura; as outras, com as mensalidades seguintes.
- **O prazo do contrato**, em meses (os atalhos 12, 24, 36, 48 e 60).
- **Imposto**: um percentual só, sobre tudo o que o cliente paga. A simulação nova vem com o dos Ajustes;
  quando os dois diferem, aparece "Nos Ajustes: 6% · usar".
- **Produtos**: os produtos do catálogo que a venda leva (o modelo traz o dele; **+ produto** põe outro, o
  **×** tira). O **Levar para a negociação** põe estes na negociação.
- **Um valor só | Por produto** (com dois produtos ou mais): cada produto é uma proposta, numa negociação só.
  **Por produto**, cada um tem a sua mensalidade e a sua ativação, e o total é o do cenário (a conta e a
  margem são as da negociação inteira). Ao passar para por produto, o valor de agora fica no primeiro; o
  produto que entra começa com zero, e o que sai leva o preço dele.

## Os custos

Os custos ficam em dois quadros, cada um com a cor dele, o total no alto, o **Da tabela** e o **Digitar um
custo**:

- **Investimento** (laranja): pago uma vez, na assinatura — os aparelhos e a comissão da venda;
- **Custos mensais** (verde-água): todo mês — a nuvem, os números, as licenças, a comissão recorrente.

Com dois produtos ou mais, cada linha diz de qual produto veio (a instalação do LinePBX e a do LineChat).

**O LineChat** (2.0.3): com o produto **LineChat** no cenário (em Produtos, ou pelo modelo), os Custos mensais
abrem com o quadro do LineChat. É só pôr as quantidades — **Usuários**, **Canais oficiais** (WhatsApp oficial
ou Instagram), **Canais não oficiais** (a conexão Z-API) e **Agentes de IA** —, e o quadro diz o custo de cada
uma e o **total do mês**, como na planilha da Helena. A licença base entra sozinha (com 3 usuários e 1 canal
oficial inclusos). As faixas de preço valem por trás, sem aparecer (mudam nos Ajustes). Tirar o LineChat dos
produtos tira o quadro; pôr de novo traz o modelo do LineChat. Na simulação de antes de 21/10, os contatos
ativos acima de 5.000 (e a transcrição de áudio) aparecem no quadro quando custam algo.

Cada linha tem o nome, o **tipo** (só os do grupo), a quantidade, o valor de cada um e o total:

| Tipo | Para quê | A conta |
|---|---|---|
| Aparelho | o telefone, o headset | o custo de cada um, uma vez (e a modalidade, abaixo) |
| Por mês (R$) | a nuvem, os números, a licença | quantidade × valor, todo mês |
| % da mensalidade | a comissão recorrente | o percentual de cada mensalidade |
| % da ativação | a comissão da venda | o percentual da ativação |

- **Da tabela** põe um custo da tabela dos Ajustes, com o valor de hoje (o painel mostra os custos do
  grupo e fica aberto para pôr outros). **Do modelo**, no alto, põe as linhas de um modelo, cada uma no
  grupo dela. **Digitar um custo** abre uma linha em branco no grupo.
- **A quantidade** é a de cada custo: 40 telefones, a nuvem de 40 ramais, 4 números.
- **O aparelho** diz como vai: **Comodato** (a Ingline compra e empresta: só o custo), **Venda** (o
  preço de cada um entra na ativação) ou **Locação** (o aluguel de cada um entra na mensalidade).
- **A compra em**: o aparelho que a Ingline compra parcelado (à vista ou em até 24 vezes, nunca mais que o
  prazo). Cada opção já diz a parcela ("10x de R$ 780"), e o total da linha também. O custo se dilui: a
  primeira parcela sai no 1º mês, o da assinatura, e as outras nos meses seguintes. Mudam o "Sai antes", o
  "Se paga" e o mês a mês; a sobra por mês e a margem não mudam.
- **Os aparelhos vêm sem valor** da tabela (o preço muda de uma compra para outra): preencha o custo de
  cada um. Enquanto falta um valor, o campo fica marcado e os números avisam.
- **Por faixas**: um custo pode ter o preço que muda pela quantidade (as faixas, dos Ajustes). Escreva a
  quantidade total e o total sai sozinho; embaixo da linha aparecem as faixas.
- A linha guarda o valor de quando entrou: mudar a tabela depois não muda a simulação feita.

## Os números

À direita (no celular, um resumo em cima e o resto embaixo):

- **Sobra por mês**: a mensalidade menos o custo do mês, e a **margem** (a sobra sobre o que o cliente paga
  por mês) com o **sinal**: verde, amarelo ou vermelho, pelas faixas dos Ajustes (escritas embaixo da
  margem). Para "dá para fazer mais barato?", mude a mensalidade e veja a margem e o sinal na hora.
- **O custo do mês**: embaixo do total, **cada custo pelo nome**, sem agrupar — cada linha por mês (a nuvem,
  os números, a licença), o **imposto** e cada **comissão** recorrente (2.0.3).
- **Investimento**: o total pago uma vez — os aparelhos e a comissão da venda (e quanto disso
  é da compra parcelada).
- **Sai antes**: o pior momento do contrato — o que a Ingline põe antes de a venda se pagar ("nada" quando
  o 1º mês já cobre).
- **Se paga**: o mês em que o acumulado fica positivo ("já na ativação" quando a ativação sozinha cobre o
  que é pago de uma vez; "desde o 1º mês" quando não há nada de uma vez nem ativação; "não se paga" quando
  a sobra do mês não cobre).
- **No contrato**: o que fica no fim do prazo.
- **A linha do tempo**: o acumulado mês a mês, do 1º mês ao fim (o "Ver mês a mês" leva ao quadro grande).

## O mês a mês

No alto da simulação, o quadro **Mês a mês**, do 1º mês ao fim do contrato. **O 1º mês é o da assinatura**:
nele entram a ativação (ou a 1ª parcela) e já a 1ª mensalidade, e saem o que é pago de uma vez e os custos
do mês. No detalhe de cada mês, os custos vêm **um a um, pelo nome** (a "Máquina em nuvem", o imposto, a
comissão…), sem juntar os custos mensais numa linha só.

- Em cima, os totais do contrato: o **faturamento**, os **custos**, o **lucro** e quando a venda **se paga**.
- No gráfico, a linha do **acumulado**, com o pior momento e o mês em que a venda se paga (o gráfico de
  colunas saiu no 2.3). O eixo vai em números redondos.
- **Passe o mouse num mês** do gráfico (ou toque, no celular) para ver o detalhe: cada parte do faturamento
  (a mensalidade, a ativação, a parcela) e dos custos (os aparelhos e as parcelas da compra, a instalação, os
  custos mensais, o imposto, as comissões), o lucro e o acumulado.
- **A tabela**, sempre aberta, tem todos os meses (o faturamento, os custos, o lucro e o acumulado) e o total
  do contrato. **Um clique na linha do mês abre o detalhe** embaixo dela (outro clique fecha); passar o mouse
  numa linha marca o mês no gráfico.

## Cenários

A mesma venda em versões diferentes (comodato ou venda dos aparelhos, 12 ou 24 meses, com desconto):

- **+ Cenário** faz uma cópia do cenário aberto: mude só o que difere. Até 3 cenários.
- **Os cenários lado a lado** mostra os números de cada um, coluna por coluna — com o investimento, o custo
  fixo e o custo variável do mês —, e, ao lado de cada cenário, a **diferença** dele para o principal: em
  verde quando é melhor para a Ingline, em vermelho quando é pior.
- **Tornar o principal**: o principal (a estrela) é o que a lista e a negociação mostram.
- Dê um nome a cada cenário no campo do alto ("Comodato, 24 meses").

## A simulação e a negociação

- **Simular a partir da negociação**: na ficha da negociação, a parte **Simulações** mostra as simulações
  ligadas a ela (o cenário principal, com a margem e o sinal) e tem o **Simular**: ele abre uma simulação
  nova já ligada, com o nome (a empresa e o título), os produtos da negociação, as linhas dos modelos
  desses produtos e a mensalidade e a ativação que ela já tem (com o valor por produto, o preço de cada
  produto). Ela é criada sozinha (já tem um nome); preencha o que falta.
- **Sem sair da ficha (2.1)**: a simulação (a que você clica em **Simulações** e a nova do **Simular**)
  abre numa janela por cima da ficha, com tudo o que a página do Simulador tem. Ela salva sozinha; feche a
  janela (o X, o Esc ou um clique fora) e você volta para a ficha, com a lista e a margem atualizadas.
  **Página inteira**, no alto da janela, leva para o Simulador.
- **A negociação ligada, sem sair da simulação (2.1)**: na simulação, o chip da negociação (COM-12 · o
  título · a empresa) tem o **Abrir**: a ficha dela abre numa janela por cima da simulação; fechando, você volta
  para a simulação. Na lista do Simulador, o chip da negociação também abre a ficha numa janela.
- **Levar para a negociação**: na simulação ligada a uma negociação em aberto, o **Levar para a COM-12**
  põe nela o que o cliente paga no cenário principal: a **mensalidade** (com o aluguel dos aparelhos), a
  **ativação** (com os aparelhos vendidos) e os **produtos** do cenário (sem produto no cenário, os da
  negociação ficam). Com o preço por produto, a negociação recebe o valor de cada produto (o aluguel e a
  venda dos aparelhos entram no produto deles). A janela mostra o que a negociação tem hoje e o que fica,
  antes do **Levar**. Com um valor só na simulação, a negociação que tinha o valor por produto passa a ter
  um valor só. A mudança fica no histórico da negociação. O que mudou na simulação é salvo antes.
- **A margem no relatório**: o relatório do Comercial (Comercial › Relatórios) tem **A margem das
  ganhas**: das ganhas do período que têm simulação, a margem do total e por produto.

## O Excel

O **Excel**, no alto da simulação, baixa a simulação numa planilha **com as fórmulas** (quem vê a simulação
pode baixar; a auditoria registra):

- **uma folha por cenário** e, com dois ou mais, a folha **Lado a lado**, que puxa os números de cada um e
  a diferença de cada cenário para o principal;
- na folha do cenário, **as células amarelas** são as que você muda: a mensalidade, a ativação, as vezes,
  o prazo, o imposto e, em cada custo, a quantidade, o valor de cada, o preço ou o aluguel do aparelho e
  em quantas vezes ele é comprado. O resto se refaz sozinho: **os custos** (quando sai e quando entra),
  **os números** (o custo fixo e o variável do mês, a sobra, a margem, o sinal, o investimento, o que sai
  antes, quando se paga, o que fica no contrato) e **o mês a mês** (o faturamento, os custos, o lucro e o
  acumulado de cada mês, do 1º, o da assinatura, ao fim);
- os custos por faixas (os usuários, os canais e os contatos da Helena) viram uma fórmula com as faixas: a
  quantidade nova dá o custo novo;
- a planilha sai do que está **salvo** (o que mudou é salvo antes) e imprime deitada, com a largura numa
  página.

Na prévia, a planilha é montada na própria página; o navegador da prévia publicada pode não deixar baixar
(o aviso diz). No Gestor, ela baixa.

## Duplicar e a lixeira

- **Duplicar** faz uma cópia da simulação (o que mudou é salvo antes), para outra proposta a partir dela.
- **Lixeira** tira a simulação da lista. Ela volta pela Administração › Lixeira.

## Os Ajustes do Simulador (quem cuida dos painéis)

Em **Comercial › Simulador › Ajustes**:

- **O imposto** que a simulação nova traz, **o sinal** (verde a partir de quanto, vermelho abaixo de quanto;
  entre os dois, amarelo) e **o prazo** da simulação nova.
- **A tabela de custos**, nos mesmos dois quadros (**+ Custo de investimento**, **+ Custo mensal**), em três
  colunas: o **custo** (o nome), o **tipo** e o **valor** de hoje — "a definir" quando fica em branco, para o que
  muda de uma venda para outra, como os aparelhos: aí a simulação pede o valor. No aparelho, embaixo, a
  modalidade que já vem. Marque **o preço muda pela quantidade** para pôr as
  faixas: cada faixa vai "até" uma quantidade, com o preço de cada unidade (0 = incluso), e a última vai
  "daí para cima".
- **Os modelos**: um por produto, com os custos da tabela e a quantidade de cada um.
- **Salvar os Ajustes** não muda as simulações já feitas.

**A tabela da Helena** (o LineChat em white label, revisão de 03/02/2026) já vem na tabela, com o modelo
**LineChat (Helena)**: a licença base (R$ 149,90, com 3 usuários e 1 canal), os usuários e os canais oficiais
por faixas, os canais não oficiais (a conexão Z-API, R$ 69,90) e os agentes de IA (R$ 50) — as quatro
quantidades do quadro do LineChat. Os contatos ativos (por faixas, 5.000 inclusos) e a transcrição de áudio
(R$ 3,99 por usuário) ficam na tabela, fora do modelo. Confere com a planilha: a licença, 5 usuários e 5
canais não oficiais dão R$ 539,20 por mês. Quando a Helena reajustar, mude os valores e as faixas nos
Ajustes.
