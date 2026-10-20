# 0052 — O Simulador do Comercial

**Contexto.** Em 20/10, com o 2.0.2 ainda na prévia, o Luan pediu: *"eu quero também fazer uma ferramenta
que vai ficar dentro da aba de comercial, que é a ferramenta de simulação… eu vou colocar lá a mensalidade
que eu quero cobrar do cliente e a ativação. E embaixo eu vou poder colocar meus custos… telefone, headset,
com quantidade e valor unitário, valor por imposto que vai ser cobrado mensal, valor de nuvem… tem coisas
que vão ser uma cobrança só, como compra de telefones, mas tem custos que são mensais, como nuvem,
comissões… Monte, seja criativo e vai me mandando umas opções para a gente ir marcando"*. A página de
opções trouxe um simulador de exemplo, 6 escolhas e 21 ideias; ele marcou tudo na mesma manhã (e, depois,
mais cinco ideias como "agora": levar para a negociação, simular a partir dela, a proposta, a margem no
relatório e o Excel). No mesmo dia, mandou a **tabela de preços da Helena** (o LineChat é a plataforma dela em white label: *"Tabela de
Preços - WHITE LABEL helena - JAN.2026"*, revisão de 03/02/2026), a planilha com que ele calcula o custo
do LineChat. Como o 2.0.2 não subiu, o Simulador entrou nele.

**Decisão.** O que ele escolheu (todas as escolhas foram a sugerida):

- **Onde mora.** Um item **Simulador** no grupo **Comercial** do menu, abaixo do Painel do Comercial e dos
  Relatórios (`/comercial/simulador`), com a lista das simulações.
- **Guardada, com nome.** Cada simulação tem um nome (o cliente, a proposta) e fica na lista, para abrir,
  mudar, **duplicar** e mandar para a **lixeira** (volta pela Administração › Lixeira). A nota dele: *"e
  atrelado a um card do comercial se eu quiser"* — a simulação pode ficar **ligada a uma negociação**
  (pelo código, COM-12), e a ficha da negociação mostra as simulações dela, com a margem e o sinal.
- **O imposto: um percentual só**, sobre tudo o que o cliente paga (a mensalidade e a ativação), como a
  alíquota do Simples. Vem dos Ajustes, e a simulação nova traz o de lá; muda na simulação. A nota dele:
  *"e eu devo poder alterar quando eu quiser"* — nos Ajustes ele muda quando quiser; a simulação já feita
  fica com o dela, e a tela mostra *"Nos Ajustes: 6% · usar"* quando os dois diferem.
- **Os custos vêm de uma tabela nos Ajustes**, com o valor de hoje: entram na simulação com um clique e
  mudam ali; o que não está na tabela entra digitado. **As linhas guardam o valor de quando entraram**:
  mudar a tabela não mexe na simulação feita. A nota dele na ideia do "custo que mudou": *"os custos dos
  aparelhos eu vou preencher em cada negociação, pq pode alterar esses valores por data"* — na tabela, o
  custo pode ficar **sem valor**, e a simulação pede (o campo fica marcado e os números avisam o que
  falta). Por isso também não entrou o aviso de "o custo mudou".
- **Cada aparelho diz como vai:** **comodato** (a Ingline compra e empresta: só o custo, uma vez),
  **venda** (o preço de cada um entra na ativação) ou **locação** (o aluguel de cada um entra na
  mensalidade).
- **Quem vê:** quem tem o Comercial (`sales.read`) vê tudo, com os custos e a margem. Criar, mudar,
  duplicar e mandar para a lixeira é de quem também trabalha nas negociações (`tickets.work`, como nelas);
  os **Ajustes do Simulador**, de quem cuida dos painéis (`tickets.manage`, como os do Comercial). Sem
  permissão nova.
- **As ideias marcadas "agora":**
  - **o preço mínimo pela margem**: a margem que se quer (vem o verde dos Ajustes; muda na simulação) e a
    mensalidade mínima para ela;
  - **o sinal da margem**: verde, amarelo ou vermelho, pelas faixas dos Ajustes (de fábrica, verde a
    partir de 35%, vermelho abaixo de 20%); a lista, a simulação e a negociação mostram;
  - **o desconto máximo** sem sair do verde;
  - **a linha do tempo do contrato**: o acumulado mês a mês, do vermelho dos aparelhos ao mês em que vira
    lucro;
  - **os cenários lado a lado**: até 3 cenários por simulação (o novo é uma cópia do aberto, para mudar só
    o que difere), cada um com todos os números, e a tabela lado a lado; o **principal** é o que a lista e
    a negociação mostram;
  - **a ativação parcelada**: em até 12 vezes (e não mais que o prazo), a primeira na assinatura e as
    outras com as mensalidades; o "se paga em" e o gráfico seguem as parcelas;
  - **a quantidade pelos ramais**: as linhas "por ramal" acompanham os ramais do cenário;
  - **os modelos prontos por produto**: a simulação nova começa em branco ou com as linhas de um modelo
    (os custos da tabela, com a quantidade de cada um ou "por ramal"). Cada modelo diz **o produto** do
    catálogo (LinePBX, LineChat, VoiceNet…; o "LinePBX + LineChat" fica sem), e **cada cenário tem os
    produtos** da venda: o modelo traz o dele, e a pessoa põe e tira;
  - **levar para a negociação**: na simulação ligada a uma negociação em aberto, o **Levar para a COM-x**
    põe na negociação o que o cliente paga no cenário principal — a mensalidade (com o aluguel dos
    aparelhos), a ativação (com os aparelhos vendidos) e os produtos do cenário (sem produto no cenário,
    os da negociação ficam). Antes do ok, a janela mostra o que a negociação tem hoje e o que fica; com os
    mesmos números, diz que não há o que levar. O valor por produto da negociação vira o valor único (a
    simulação não divide a mensalidade por produto). A mudança fica no histórico da negociação, como
    qualquer outra; com a simulação não salva, o botão espera o Salvar;
  - **simular a partir da negociação**: a ficha da negociação ganhou a parte **Simulações** (as ligadas a
    ela, com a margem e o sinal) e o **Simular**, que abre uma simulação nova já ligada — o nome (a empresa
    e o título), os produtos dela, as linhas dos modelos desses produtos (sem repetir o custo que dois
    modelos têm) e a mensalidade e a ativação que ela já tem;
  - **a margem no relatório do Comercial**: a parte **A margem das ganhas**, entre os meses e o funil — das
    ganhas do período, as que têm simulação ligada (cada uma com o cenário principal da simulação mexida
    por último): a margem do total, **por vendedor** (o responsável) e **por produto** (o da negociação; a
    que tem dois conta nos dois), com o sinal. A margem do grupo é a sobra de todas sobre a mensalidade de
    todas (a venda grande pesa mais). O clique abre as negociações. Sem simulação nas ganhas, a parte diz
    como ligar;
  - **o Excel**: o botão **Excel** da simulação baixa uma planilha com as fórmulas (abaixo);
  - **a proposta em PDF**: espera o modelo dele (o Luan tem um projeto só para as propostas, *"luan -
    propostas"*, que não se abre daqui).
- **Para depois:** "se o cliente sair antes" (a multa), o reajuste anual e o aviso de "o custo mudou" (a
  nota dele, acima). **Não:** o aparelho em dólar, o frete e o DIFAL, a mão de obra (as horas do técnico,
  que podem entrar como um custo digitado), a aprovação abaixo da margem e a IA.
- **A planilha do Excel.** Uma folha por cenário e, com dois cenários ou mais, a **Lado a lado** (os
  números de cada um, puxados da folha dele). Na folha do cenário: o que o cliente paga, nas **células
  amarelas** (a mensalidade, a ativação, as vezes, o prazo, os ramais, o imposto, a margem que se quer, e
  em cada custo a quantidade, o valor de cada e o preço ou aluguel do aparelho); os custos linha a linha
  (quando sai, quando entra, e a observação: as faixas, o que falta preencher); **os números**, **o preço**
  e **a linha do tempo** mês a mês (até 120 meses: mudar o prazo na planilha também funciona). Cada número
  é uma fórmula que faz a conta do `contasDoCenario` — o preço por faixas vira uma fórmula com as faixas, a
  primeira parcela da ativação leva o resto da divisão, o sinal arredonda a margem como a tela —, e vai com
  o valor que a tela mostra; o Excel refaz ao abrir. Sai do que está salvo (com mudança na tela, o botão
  espera o Salvar), quem vê a simulação exporta, e a auditoria registra (*"Exportou a simulação "Padaria
  Estrela — 40 ramais" para o Excel"*). Imprime deitada, com a largura numa página. A planilha é montada
  pelo `@gestor/shared` (sem biblioteca: os XMLs do .xlsx num zip), a mesma no servidor e na prévia.
  **Conferida no LibreOffice:** três planilhas de teste (os aparelhos em comodato, venda e locação, a
  instalação, a nuvem por ramal, as comissões, um custo sem valor, a ativação em 3x, as faixas da Helena,
  "depois do prazo", "não se paga" e "desde o 1º mês"), 4.423 fórmulas refeitas: nenhum erro e nenhuma
  diferença da tela — também depois de mudar as células amarelas (a mensalidade, o prazo, as vezes, os
  ramais e as quantidades por faixa).
- **"Se paga desde o 1º mês".** Quando nada sai antes e não há ativação (só custos por mês), a venda se
  paga desde o primeiro mês; antes, a tela dizia "já na ativação", que é o caso de a ativação cobrir o que
  sai antes.
- **O custo por faixas (a tabela da Helena).** A planilha dele cobra os usuários, os canais e os contatos
  ativos do LineChat **por faixas**: cada unidade paga o preço da faixa em que cai (os 3 primeiros usuários
  vêm na licença; do 4º ao 20º, R$ 19,90 cada; do 21º ao 100º, R$ 14,90; daí para cima, R$ 12,90). Os
  custos "por mês" e "uma vez" podem ter **até 8 faixas de preço** (a faixa de preço 0 é o que vem
  incluso); o preço da faixa vai até a 4ª casa (R$ 0,045 por contato). A **tabela de fábrica** traz a da
  Helena — a licença base (R$ 149,90, com 3 usuários e 1 canal), os usuários, os canais de WhatsApp ou
  Instagram (1 incluso; do 2º ao 5º, R$ 29,90; daí para cima, R$ 19,90), a conexão Z-API (R$ 69,90), os
  contatos ativos no mês (5.000 inclusos; até 20.000, R$ 0,045; até 100.000, R$ 0,035; daí para cima,
  R$ 0,025), a transcrição de áudio (R$ 3,99 por usuário) e os agentes de IA (R$ 50) — e o modelo
  **LineChat (Helena)**. O exemplo da planilha confere: a licença, 5 usuários e 5 conexões Z-API dão
  **R$ 539,20 por mês**. A conexão com o ASAAS (R$ 0 desde fevereiro) não entrou. Quando a Helena
  reajustar, muda nos Ajustes.
- **A conta** (`contasDoCenario`, no `@gestor/shared/simulador.ts`, a mesma no servidor e na prévia). O mês
  0 é a assinatura: a Ingline paga o que é de uma vez e recebe a ativação (ou a primeira parcela). Do mês 1
  ao fim do prazo, cada mês soma a sobra (a mensalidade menos o custo do mês). O imposto sai de tudo o que
  o cliente paga; a comissão "% da mensalidade", de cada mensalidade; a "% da ativação", de cada parcela.
  Nas contas, a mensalidade é a do serviço mais o aluguel dos aparelhos, e a ativação, a do serviço mais
  os aparelhos vendidos. Os números: a **sobra por mês** e a **margem** (a sobra sobre o que o cliente paga
  por mês), o **custo do mês**, **o que sai antes** (o pior momento do acumulado), **quando se paga** (o
  primeiro mês em que o acumulado fica positivo até o fim; depois do prazo, a conta continua e diz; se a
  sobra não cobre o mês, "não se paga") e **o que fica no fim do contrato**. O dinheiro vai em centavos.
- **A auditoria** conta o que mudou (*"Mudou a simulação "Padaria Estrela": no Comodato, a mensalidade de
  R$ 1.250,00 para R$ 1.400,00; incluiu o Cenário B"*) e, nos Ajustes, o que entrou, saiu e mudou na
  tabela e nos modelos. A negociação ligada de um painel que a pessoa não vê não aparece para ela (a
  simulação diz "negociação de outro painel") e fica como estava quando ela salva.
- **O banco.** A migração `0021_simulador`: a tabela `sales_simulations` (o nome, a negociação ligada —
  `ticket_id` —, os cenários num `jsonb`, o principal e a lixeira). Os Ajustes ficam em
  `settings.comercial-simulador`.
- **A prévia.** A tabela da Helena e a do PABX (os telefones sem valor, a nuvem por ramal, os números, os
  canais, a configuração e as comissões), os modelos LinePBX em nuvem, LineChat (Helena), VoiceNet e
  LinePBX + LineChat, e sete simulações: a **Padaria Estrela** com três cenários — comodato em 24 meses, os
  telefones vendidos em 12 meses com a ativação em 3x, e 10% de desconto em 36 meses —, o **Hotel Beira
  Mar** (o PABX e o LineChat, a ativação em 3x; a conta refeita pede R$ 1.690, e a negociação ainda está
  com R$ 1.580: o Levar mostra a troca), a **Clínica Vida** no amarelo (o LineChat, sem negociação), as três
  ganhas do mês para a margem no relatório — a **Ótica Visão Clara** e a **Construtora Horizonte** (da
  Camila) no verde e a **Academia Movimento** (do Diego, o LineChat com 12 usuários) no vermelho — e a
  contraproposta da **Escola Mundo Kids** no vermelho (a negociação perdida). Na prévia publicada, o
  navegador pode não deixar baixar a planilha (o aviso diz); no Gestor, ela baixa.

**Consequências.** O grupo Comercial do menu tem três itens. O vendedor responde na hora *"dá para fazer
por R$ 1.100?"* (o sinal e o desconto máximo), leva a conta para a negociação com um clique e a gestão vê,
na negociação e no relatório, se a venda se paga e quanto sobra de cada vendedor e de cada produto. A tabela de
custos e as faixas da Helena precisam de atualização quando os fornecedores reajustam; as simulações feitas
ficam com os valores de quando foram feitas.
