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
- **Os custos em dois grupos.** Num comentário na página de opções, o Luan pediu: *"quero que vc separe os
  custos fixos com custos mensais e quero que sejam fixados porem configuráveis"*. A simulação, a tabela dos
  Ajustes e o Excel mostram os custos em dois grupos, o **investimento** primeiro — pago uma vez, na
  assinatura: o aparelho, o "uma vez" e a comissão da venda (% da ativação) — e depois os **custos
  mensais** — o "por mês" e a comissão recorrente (% da mensalidade). Cada grupo tem o total dele, a tabela
  dele e o "digitar um custo" dele, e o "como entra" de cada linha só oferece os tipos do grupo. "Fixados,
  porém configuráveis" é o que a tabela já faz: os custos ficam fixos na tabela dos Ajustes (quem cuida dos
  painéis configura o nome, como entra, o valor e as faixas) e entram na simulação de lá, um a um ou pelo
  modelo do produto; na simulação, o valor ainda pode mudar (a nota dele sobre os aparelhos). Depois, na
  prévia: *"esse nome custo fixo não ficou legal, porque parece que vai ser todo mês; pense em outro nome"* —
  o primeiro grupo virou **Investimento**, a palavra dele (*"o total investido, que seriam os custos
  fixos"*); e *"tem que ter uma separação melhor visualmente"* — cada grupo é um quadro com a cor dele
  (o investimento, laranja; os mensais, verde-água), o ícone e o total no alto. Com dois produtos ou mais,
  cada linha diz de qual produto veio.
- **Cada aparelho diz como vai:** **comodato** (a Ingline compra e empresta: só o custo, uma vez),
  **venda** (o preço de cada um entra na ativação) ou **locação** (o aluguel de cada um entra na
  mensalidade).
- **A compra dos aparelhos parcelada.** O Luan, num comentário na prévia: *"no caso de equipamentos, tem q
  ter a opção tbm se eu vou querer parcelar essa compra, no caso o custo tbm seria diluído"*. Cada aparelho
  diz **"A compra em"**: à vista ou em até 24 vezes, e nunca mais que o prazo do contrato. A primeira parcela
  sai no 1º mês (o da assinatura) e as outras nos meses seguintes (a primeira leva o resto da divisão, como
  na ativação). O custo se dilui no mês a mês: mudam o "Sai antes" e o "Se paga". A sobra por mês e a
  margem não mudam (a compra parcelada não é custo de todo mês), e o fim do contrato também não (o aparelho
  é pago inteiro dentro do prazo). O Luan, depois: *"já me dê aqui também o custo da parcela"* — cada opção
  do "A compra em" diz a parcela ("10x de R$ 780"), e o total da linha também.
- **O mês a mês.** O Luan, sobre o gráfico pequeno do acumulado: *"isso aqui ta bacana, quero esse gráfico
  mais detalhado mensalmente, por exemplo, com os valores acumulado e lucro por mês; acho q vai ter q ficar
  maior"*. Entrou o quadro **Mês a mês**, com o acumulado (a linha, com o pior momento e o mês em que a venda
  se paga), o lucro de cada mês e a tabela de todos os meses. Depois, em mais dois comentários: *"seria legal
  um kpi com mês a mês custo e faturamento, e um hover na coluna de cada um que vai falar o detalhe: esse mês
  eu faturei 5.000 — 3 mil de ativação e 2 mil de mensalidade —, e a mesma coisa com os custos"* e *"não
  entendi por que o primeiro mês ficou negativo; o primeiro mês de pagamento vai ser o primeiro mês de
  faturamento também, e eu quero esse gráfico junto à tabela na parte de cima"*. O quadro foi para **o alto
  da simulação**, antes do que o cliente paga, com os **totais do contrato** (o faturamento, os custos, o
  lucro e quando se paga); no gráfico, uma coluna por mês — o **faturamento** para cima, os **custos** para
  baixo e um ponto no **lucro do mês** — e, embaixo, a linha do acumulado. Passar o mouse numa coluna (ou
  tocar, no celular) mostra **o detalhe do mês**: cada parte do faturamento (a mensalidade, o aluguel, a
  parcela da ativação, os aparelhos vendidos) e dos custos (o que é pago de uma vez, cada parcela da compra,
  os custos mensais, o imposto, cada comissão), o lucro e o acumulado; com dois produtos ou mais, o detalhe
  diz de qual produto é cada custo. A tabela tem o faturamento, os custos, o lucro e o acumulado de cada mês
  e o total do contrato; os números fecham ao centavo (o detalhe soma o total do mês, e o faturamento menos
  os custos é o lucro). As colunas do 1º mês, quando passam muito das outras, são cortadas e dizem o valor.
  O "mês 0" separado (a assinatura sozinha, sem mensalidade, que ficava negativa) foi escolha minha, e saiu:
  o 1º mês é o da assinatura (abaixo, em "A conta"). O gráfico pequeno, nos números, ficou com o "Ver mês a
  mês".
- **Salva sozinha.** O Luan, num comentário na prévia: *"quero salvamento automático, sem ficar precisando
  apertar em salvar"*. A simulação salva 2 segundos depois da última mudança (e antes do Levar, do Excel e
  do Duplicar, e ao sair da tela); no lugar do botão Salvar, o aviso diz "Salvando…" e "Salvo às 08:42". A
  nova é criada assim que tiver um nome. O que ainda não deixa salvar (um custo sem nome) o aviso diz, no
  alto e embaixo, e a simulação salva assim que a pessoa completa; o Levar, o Excel e o Duplicar esperam.
  Cada salvamento vai para a auditoria, com o que mudou (o mesmo "Mudou a simulação…" de antes). O
  "Descartar" saiu: para testar uma ideia sem mexer na conta, o "+ Cenário". Os Ajustes continuam com o
  Salvar deles (mudam todas as simulações novas).
- **Os campos de valor.** O Luan: *"quando eu vou escrever, tem que tirar os 0 e já deixar apenas o que eu
  escrevi"*. Ao entrar num campo com zero, ele fica vazio para escrever (o "0,00" vira só a dica); com um
  valor, o campo fica todo marcado, e o que se escreve entra no lugar.
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
    a negociação mostram. O Luan, depois: *"quero uma terceira coluna com a diferença, e uma linha com o
    custo fixo e o custo variável também"* — ao lado de cada cenário, a **diferença** dele para o principal
    (em verde quando é melhor para a Ingline, em vermelho quando é pior; no Excel, as colunas da diferença
    na "Lado a lado"), e as linhas do **investimento**, do **custo fixo do mês** (as linhas por mês) e do
    **custo variável do mês** (o imposto e a comissão, que andam com o que o cliente paga);
  - **a ativação parcelada**: em até 12 vezes (e não mais que o prazo), a primeira na assinatura e as
    outras com as mensalidades; o "se paga em" e o gráfico seguem as parcelas;
  - **a quantidade pelos ramais** — entrou e **saiu**: o cenário tinha os ramais, e as linhas marcadas "por
    ramal" (o telefone, a nuvem) acompanhavam o número. O Luan, num comentário na prévia: *"não precisa
    desse lance de por ramal, é melhor eu sempre selecionar a quantidade dos produtos mesmo"*; avisado de
    que desfazia uma ideia que ele tinha marcado "agora", respondeu *"pode tirar"*. Saíram o campo
    **Ramais** e o **"por ramal"** — na simulação, na tabela e nos modelos dos Ajustes e no Excel (a linha
    dos ramais e a coluna "Por ramal"): cada custo tem a sua quantidade, e os modelos trazem a de cada um. As
    simulações feitas antes abrem com a mesma conta: a linha que era "por ramal" fica com a quantidade dos
    ramais do cenário;
  - **os modelos prontos por produto**: a simulação nova começa em branco ou com as linhas de um modelo
    (os custos da tabela, com a quantidade de cada um). Cada modelo diz **o produto** do
    catálogo (LinePBX, LineChat, VoiceNet…), e **cada cenário tem os produtos** da venda: o modelo traz o
    dele, e a pessoa põe e tira;
  - **vários produtos, cada um com o seu preço**: o Luan, num comentário na prévia: *"tem tbm a voicenet,
    faça um multi seleção, que no caso é uma proposta separada, porém uma negociação única"*. A **Nova
    simulação** marca quantos modelos a pessoa quiser (no lugar dos modelos prontos com dois produtos, como o
    "LinePBX + LineChat" da prévia, que saiu). A simulação começa com os custos de todos: cada produto traz
    os dele (os canais de voz do VoiceNet e os do PABX; a instalação de cada um), e só a comissão, que é
    sobre o preço inteiro, não repete (e fica sem produto); cada linha guarda o produto do modelo de onde
    veio. Com dois produtos
    ou mais, o preço é **um valor só** ou **por produto** (o mesmo "Um valor só | Por produto" da
    negociação): a mensalidade e a ativação de cada produto, e a do cenário é a soma — a conta e a margem
    são as da negociação inteira. Ao passar para "por produto", o valor de agora fica no primeiro; pôr um
    produto começa com zero, tirar leva o preço dele. O **Levar** põe o valor de cada produto na
    negociação (o valor por produto que ela já tem), com o aluguel e a venda de cada aparelho no produto da
    linha dele (a linha sem produto, no primeiro); o **Simular** de uma negociação com o valor por produto
    começa com o preço de cada produto dela. O Excel põe a tabela do preço de cada produto ao lado do que o
    cliente paga (até 8 produtos), e a mensalidade e a ativação viram as somas;
  - **levar para a negociação**: na simulação ligada a uma negociação em aberto, o **Levar para a COM-x**
    põe na negociação o que o cliente paga no cenário principal — a mensalidade (com o aluguel dos
    aparelhos), a ativação (com os aparelhos vendidos) e os produtos do cenário (sem produto no cenário,
    os da negociação ficam). Antes do ok, a janela mostra o que a negociação tem hoje e o que fica; com os
    mesmos números, diz que não há o que levar. O valor por produto da negociação vira o valor único (a
    simulação não divide a mensalidade por produto). A mudança fica no histórico da negociação, como
    qualquer outra; o que mudou na simulação é salvo antes;
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
  amarelas** (a mensalidade, a ativação, as vezes, o prazo, o imposto, a margem que se quer, e
  em cada custo a quantidade, o valor de cada, o preço ou aluguel do aparelho e em quantas vezes ele é
  comprado); os custos linha a linha
  (quando sai, quando entra, e a observação: as faixas, o que falta preencher); **os números** (com o custo
  fixo e o variável do mês e o investimento), **o preço** e **o mês a mês** (o faturamento, os custos, o
  lucro e o acumulado de cada mês, do 1º — o da assinatura — até 120 meses: mudar o prazo na planilha também
  funciona). Cada número
  é uma fórmula que faz a conta do `contasDoCenario` — o preço por faixas vira uma fórmula com as faixas, a
  primeira parcela da ativação leva o resto da divisão, o sinal arredonda a margem como a tela —, e vai com
  o valor que a tela mostra; o Excel refaz ao abrir. Sai do que está salvo (o que mudou é salvo antes),
  quem vê a simulação exporta, e a auditoria registra (*"Exportou a simulação "Padaria
  Estrela — 40 ramais" para o Excel"*). Imprime deitada, com a largura numa página. A planilha é montada
  pelo `@gestor/shared` (sem biblioteca: os XMLs do .xlsx num zip), a mesma no servidor e na prévia.
  **Conferida no LibreOffice:** quatro planilhas de teste (os aparelhos em comodato, venda e locação, a
  compra parcelada, a instalação, a nuvem de 40 ramais, as comissões, um custo sem valor, a ativação em 3x,
  as faixas da Helena, "depois do prazo", "não se paga", "desde o 1º mês", "em 1 mês" e "já na ativação", e
  a "Lado a lado" com a diferença), 5.355 fórmulas refeitas: nenhum erro e nenhuma diferença da tela —
  também depois de mudar as células amarelas (a mensalidade, o prazo, as vezes, as quantidades, também as
  por faixa, e em quantas vezes o aparelho é comprado).
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
- **A conta** (`contasDoCenario`, no `@gestor/shared/simulador.ts`, a mesma no servidor e na prévia). O 1º
  mês é o da assinatura: a Ingline paga o que é de uma vez e recebe a ativação (ou a primeira parcela) e já
  a primeira mensalidade. Cada mês, até o fim do prazo, soma a sobra (a mensalidade menos o custo do mês). O
  imposto sai de tudo o que o cliente paga; a comissão "% da mensalidade", de cada mensalidade; a "% da
  ativação", de cada parcela. Nas contas, a mensalidade é a do serviço mais o aluguel dos aparelhos, e a
  ativação, a do serviço mais os aparelhos vendidos. Os números: a **sobra por mês** e a **margem** (a sobra
  sobre o que o cliente paga por mês), o **custo do mês** (o fixo, das linhas por mês, e o variável, o
  imposto e a comissão), o **investimento** (o total pago uma vez: os aparelhos, o "uma vez" e a comissão da
  venda), **o que sai antes** (o pior momento do acumulado), **quando se paga** (o primeiro mês em que o
  acumulado fica positivo até o fim; "já na ativação" quando a ativação sozinha cobre o que é pago de uma
  vez; "em 1 mês" quando a primeira mensalidade completa; depois do prazo, a conta continua e diz; se a
  sobra não cobre o mês, "não se paga") e **o que fica no fim do contrato**. O dinheiro vai em centavos.
- **A auditoria** conta o que mudou (*"Mudou a simulação "Padaria Estrela": no Comodato, a mensalidade de
  R$ 1.250,00 para R$ 1.400,00; incluiu o Cenário B"*) e, nos Ajustes, o que entrou, saiu e mudou na
  tabela e nos modelos. A negociação ligada de um painel que a pessoa não vê não aparece para ela (a
  simulação diz "negociação de outro painel") e fica como estava quando ela salva.
- **O banco.** A migração `0021_simulador`: a tabela `sales_simulations` (o nome, a negociação ligada —
  `ticket_id` —, os cenários num `jsonb`, o principal e a lixeira). Os Ajustes ficam em
  `settings.comercial-simulador`.
- **A prévia.** A tabela da Helena e a do PABX (os telefones sem valor, a nuvem, os números, os canais, a
  configuração e as comissões), os modelos LinePBX em nuvem, LineChat (Helena) e VoiceNet, e
  sete simulações: a **Padaria Estrela** (40 telefones e a nuvem de 40 ramais) com três cenários — comodato em 24 meses, os
  telefones vendidos em 12 meses com a ativação em 3x, e 10% de desconto em 36 meses —, o **Hotel Beira
  Mar** (o LinePBX a R$ 1.190 e o LineChat a R$ 500, cada um com o seu preço e a sua instalação; os
  telefones comprados em 10 vezes; a ativação em 3x; o 1º mês já cobre o que é pago de uma vez: se paga em 1
  mês, nunca no vermelho; a conta refeita pede R$ 1.690, e a negociação ainda está com R$ 1.580, num valor
  só: o Levar mostra a troca e põe o valor de cada produto), a **Clínica Vida** no amarelo (o LineChat, sem negociação), as três
  ganhas do mês para a margem no relatório — a **Ótica Visão Clara** e a **Construtora Horizonte** (da
  Camila) no verde e a **Academia Movimento** (do Diego, o LineChat com 12 usuários) no vermelho — e a
  contraproposta da **Escola Mundo Kids** no vermelho (a negociação perdida). Na prévia publicada, o
  navegador pode não deixar baixar a planilha (o aviso diz); no Gestor, ela baixa.

**Consequências.** O grupo Comercial do menu tem três itens. O vendedor responde na hora *"dá para fazer
por R$ 1.100?"* (o sinal e o desconto máximo), leva a conta para a negociação com um clique e a gestão vê,
na negociação e no relatório, se a venda se paga e quanto sobra de cada vendedor e de cada produto. A tabela de
custos e as faixas da Helena precisam de atualização quando os fornecedores reajustam; as simulações feitas
ficam com os valores de quando foram feitas.
