# Simulador do Comercial (Patch 2.0.2)

A conta de uma venda antes de fechar: o que o cliente paga (a mensalidade e a ativação) contra o que a
Ingline gasta (os aparelhos, a nuvem, os números, as comissões e o imposto). Fica no menu, em
**Comercial › Simulador**. Quem tem o Comercial vê tudo; quem trabalha nas negociações cria e muda; os
Ajustes (a tabela de custos, os modelos, o imposto e o sinal) são de quem cuida dos painéis.

## Uma simulação nova

1. **Nova simulação** e escolha um modelo (o produto: **LinePBX em nuvem**, **LineChat (Helena)**…) ou
   **Em branco**. O modelo já traz as linhas de custo, com a quantidade de cada uma.
2. Dê um **nome** (o cliente, a proposta: "Padaria Estrela — 40 ramais").
3. Se quiser, **ligue a uma negociação**: escreva o código (COM-12) ao lado do nome e clique em **Ligar**.
   A ficha da negociação passa a mostrar a simulação, com a margem e o sinal. (Pela negociação é mais
   rápido: abaixo, **Simular a partir da negociação**.)
4. Preencha o que o cliente paga e os custos (abaixo) e clique em **Criar a simulação**.

Os números mudam enquanto você escreve. Nada é gravado até o **Salvar** (a tela avisa "Não salvo").

## O que o cliente paga

- **Mensalidade** e **Ativação**: o que você quer cobrar.
- **A ativação em**: à vista ou em até 12 vezes (e não mais que o prazo). A primeira parcela entra na
  assinatura; as outras, com as mensalidades.
- **O prazo do contrato**, em meses (os atalhos 12, 24, 36, 48 e 60).
- **Ramais**: as linhas marcadas "por ramal" (o telefone, a nuvem) acompanham este número.
- **Imposto**: um percentual só, sobre tudo o que o cliente paga. A simulação nova vem com o dos Ajustes;
  quando os dois diferem, aparece "Nos Ajustes: 6% · usar".
- **Produtos**: os produtos do catálogo que a venda leva (o modelo traz o dele; **+ produto** põe outro, o
  **×** tira). O **Levar para a negociação** põe estes na negociação.

## Os custos

Cada linha tem o nome, **como entra**, a quantidade, o valor de cada um e o total:

| Como entra | Para quê | A conta |
|---|---|---|
| Aparelho | o telefone, o headset | o custo de cada um, uma vez (e a modalidade, abaixo) |
| Uma vez (R$) | a instalação, a configuração | quantidade × valor, na assinatura |
| Por mês (R$) | a nuvem, os números, a licença | quantidade × valor, todo mês |
| % da mensalidade | a comissão recorrente | o percentual de cada mensalidade |
| % da ativação | a comissão da venda | o percentual da ativação |

- **Da tabela** põe um custo da tabela dos Ajustes, com o valor de hoje (o painel fica aberto para pôr
  outros). **Do modelo** põe as linhas de um modelo no fim. **Digitar um custo** abre uma linha em branco.
- **Por ramal**: a quantidade passa a ser a dos ramais.
- **O aparelho** diz como vai: **Comodato** (a Ingline compra e empresta: só o custo), **Venda** (o
  preço de cada um entra na ativação) ou **Locação** (o aluguel de cada um entra na mensalidade).
- **Os aparelhos vêm sem valor** da tabela (o preço muda de uma compra para outra): preencha o custo de
  cada um. Enquanto falta um valor, o campo fica marcado e os números avisam.
- **Por faixas**: os custos do LineChat da Helena (os usuários, os canais, os contatos) têm o preço que
  muda pela quantidade. Escreva a quantidade total (5 usuários) e o total sai sozinho; embaixo da linha
  aparecem as faixas.
- A linha guarda o valor de quando entrou: mudar a tabela depois não muda a simulação feita.

## Os números

À direita (no celular, um resumo em cima e o resto embaixo):

- **Sobra por mês**: a mensalidade menos o custo do mês (os custos por mês, o imposto e a comissão), e a
  **margem** (a sobra sobre o que o cliente paga por mês) com o **sinal**: verde, amarelo ou vermelho, pelas
  faixas dos Ajustes.
- **Sai antes**: o pior momento do contrato — os aparelhos e o resto, antes de a venda se pagar.
- **Se paga**: o mês em que o acumulado fica positivo ("já na ativação" quando a ativação cobre o que sai
  antes; "desde o 1º mês" quando não sai nada antes e não há ativação; "não se paga" quando a sobra do mês
  não cobre).
- **No contrato**: o que fica no fim do prazo.
- **A linha do tempo**: o acumulado mês a mês, do vermelho do começo ao mês em que vira lucro.
- **O preço**: escreva a margem que você quer e veja a mensalidade mínima para ela; e o **desconto máximo**
  sem sair do verde — a resposta para "dá para fazer mais barato?".

## Cenários

A mesma venda em versões diferentes (comodato ou venda dos aparelhos, 12 ou 24 meses, com desconto):

- **+ Cenário** faz uma cópia do cenário aberto: mude só o que difere. Até 3 cenários.
- **Os cenários lado a lado** mostra os números de cada um, coluna por coluna.
- **Tornar o principal**: o principal (a estrela) é o que a lista e a negociação mostram.
- Dê um nome a cada cenário no campo do alto ("Comodato, 24 meses").

## A simulação e a negociação

- **Simular a partir da negociação**: na ficha da negociação, a parte **Simulações** mostra as simulações
  ligadas a ela (o cenário principal, com a margem e o sinal) e tem o **Simular**: ele abre uma simulação
  nova já ligada, com o nome (a empresa e o título), os produtos da negociação, as linhas dos modelos
  desses produtos e a mensalidade e a ativação que ela já tem. Preencha o que falta e **Crie a simulação**.
- **Levar para a negociação**: na simulação ligada a uma negociação em aberto, o **Levar para a COM-12**
  põe nela o que o cliente paga no cenário principal: a **mensalidade** (com o aluguel dos aparelhos), a
  **ativação** (com os aparelhos vendidos) e os **produtos** do cenário (sem produto no cenário, os da
  negociação ficam). A janela mostra o que a negociação tem hoje e o que fica, antes do **Levar**. Se a
  negociação tem o valor por produto, ela passa a ter um valor só. A mudança fica no histórico da
  negociação. Salve a simulação antes (o botão espera o Salvar).
- **A margem no relatório**: o relatório do Comercial (Comercial › Relatórios) tem **A margem das
  ganhas**: das ganhas do período que têm simulação, a margem do total, por vendedor e por produto.

## O Excel

O **Excel**, no alto da simulação, baixa a simulação numa planilha **com as fórmulas** (quem vê a simulação
pode baixar; a auditoria registra):

- **uma folha por cenário** e, com dois ou mais, a folha **Lado a lado**, que puxa os números de cada um;
- na folha do cenário, **as células amarelas** são as que você muda: a mensalidade, a ativação, as vezes,
  o prazo, os ramais, o imposto, a margem que você quer e, em cada custo, a quantidade, o valor de cada e o
  preço ou o aluguel do aparelho. O resto se refaz sozinho: **os custos** (quando sai e quando entra), **os
  números** (a sobra, a margem, o sinal, o que sai antes, quando se paga, o que fica no contrato), **o
  preço** (a mensalidade mínima e o desconto máximo) e **a linha do tempo**, mês a mês;
- os custos por faixas (os usuários, os canais e os contatos da Helena) viram uma fórmula com as faixas: a
  quantidade nova dá o custo novo;
- a planilha sai do que está **salvo** (com mudança na tela, salve antes) e imprime deitada, com a largura
  numa página.

Na prévia, a planilha é montada na própria página; o navegador da prévia publicada pode não deixar baixar
(o aviso diz). No Gestor, ela baixa.

## Duplicar e a lixeira

- **Duplicar** faz uma cópia da simulação (salve antes), para outra proposta a partir dela.
- **Lixeira** tira a simulação da lista. Ela volta pela Administração › Lixeira.

## Os Ajustes do Simulador (quem cuida dos painéis)

Em **Comercial › Simulador › Ajustes**:

- **O imposto** que a simulação nova traz, **o sinal** (verde a partir de quanto, vermelho abaixo de quanto;
  entre os dois, amarelo) e **o prazo** da simulação nova.
- **A tabela de custos**: o nome, como entra, o valor de hoje (deixe sem valor o que muda de uma venda para
  outra, como os aparelhos), a **unidade** ("usuário", "canal": a tela escreve "5 usuários"), se entra
  "por ramal" e, no aparelho, a modalidade que já vem. Marque **o preço muda pela quantidade** para pôr as
  faixas: cada faixa vai "até" uma quantidade, com o preço de cada unidade (0 = incluso), e a última vai
  "daí para cima".
- **Os modelos**: um por produto, com os custos da tabela e a quantidade de cada um (ou por ramal).
- **Salvar os Ajustes** não muda as simulações já feitas.

**A tabela da Helena** (o LineChat em white label, revisão de 03/02/2026) já vem na tabela, com o modelo
**LineChat (Helena)**: a licença base (R$ 149,90, com 3 usuários e 1 canal), os usuários, os canais e os
contatos ativos por faixas, a conexão Z-API (R$ 69,90), a transcrição de áudio (R$ 3,99 por usuário) e os
agentes de IA (R$ 50). Confere com a planilha: a licença, 5 usuários e 5 conexões Z-API dão R$ 539,20 por
mês. Quando a Helena reajustar, mude os valores e as faixas nos Ajustes.
