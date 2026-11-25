# A implantação dos clientes (Patch 2.3)

Um card por cliente novo, com a curadoria, a configuração e os testes de cada produto. O card nasce sozinho quando a
negociação do Comercial entra na etapa que abre a implantação, já com o cliente e os produtos; e, no Implantado, os
produtos e os módulos ficam ativos na ficha do cliente, com a data.

## 1. Montar uma vez

1. **O painel.** Painéis › Ajustes › Painéis e etapas › **Novo painel** › **Implantação (Gestão)**. Ele já vem com:
   - as etapas **Stand By**, **Curadoria** (onde o card cai), **Configuração**, **Testes**, **Concluído** (todos os testes
     feitos) e **Implantado** (o cliente ativo; o Implantado
     liga no cadastro);
   - os **19 campos** do Ingline - Ativações, em três partes (Curadoria, Configuração, Testes), um bloco para o LineChat
     e outro para o LinePBX;
   - sem prazo, sem prioridade e sem o Tempo gasto (a implantação leva o tempo dela). O Tempo gasto liga e desliga em
     Painéis › Ajustes › Campos, em cada painel.
   Escolha quem vê (todos, ou só as pessoas da implantação) e **Criar painel**.
2. **O Comercial.** Painéis › Ajustes › Painéis e etapas › Comercial › Editar › abra a etapa que começa a implantação
   (a **Em processo de Implantação**; se ela não existe, **Incluir etapa**) › **Ao chegar aqui, abre a implantação** ›
   **No painel Implantação**. Depois, inclua a etapa **Implantado** antes do Ganho e ligue **A negociação vem para cá
   quando a implantação termina** › Salvar.
3. **Os módulos.** Os Módulos a ativar de cada produto são os do catálogo: Administração › Produtos. O que entrar ou sair
   ali aparece no card sozinho. (No catálogo de hoje, faltam para o LinePBX: Callback, WebRTC, NPS - WhatsApp e Filas -
   Dashboard.)
4. **O faturamento (2.4.11).** No Configurar do painel da implantação, abra a última etapa (o **Implantado - Concluído**) ›
   **Ao chegar aqui, abre o card de faturamento** › **No painel Grupo Line - ADM** (o administrativo) › Salvar. Daí em diante,
   o card que chega nela abre o card de faturamento lá (seção 4).

O atalho: **Suporte › Painel da Implantação**, no menu, abre o quadro do painel (o painel de Gestão que a etapa do
Comercial abre).

## 2. A negociação abre o card

No Comercial, mova a negociação para **Em processo de Implantação** (arrastando no quadro ou pelo Mover da ficha). A
janela mostra antes:

- **O cliente.** O da negociação; ou o do cadastro com o mesmo CNPJ; ou o novo — o nome fantasia, a razão social e o
  **CNPJ** (o cadastro exige: sem ele a negociação não vai). Basta digitar os 14 números: o formato entra sozinho, e a
  janela não confere o dígito verificador. Se a empresa já é cliente com outro nome, **Já está no cadastro** escolhe o
  cliente.
- **Os produtos.** Os que o cliente ainda não tem entram no cadastro **sem a data de ativação** (em implantação).
- **O card.** "Implantação — Cliente", na Curadoria, com o contato da negociação. Quem cuida da negociação acompanha o
  card como observador.

**Mover e abrir a implantação** faz tudo de uma vez. O **Ganho** continua à parte: marque quando começar a faturar.
Voltar a negociação e mover de novo não abre outro card.

## 3. O card no dia a dia

- **A Curadoria.** Quem cuida da curadoria preenche os dados do cliente (os usuários, os números, o chatbot, o horário, o
  acesso à BM, os ramais, a URA) e marca os **Módulos a ativar**: os que o cliente contratou. Para o card sair da
  Curadoria, alguém precisa ser o responsável (a janela pergunta).
- **A Configuração.** A equipe técnica marca as caixinhas do que já fez. A **Ativação dos módulos** é o checklist dos
  módulos marcados na Curadoria (só eles aparecem): marque cada um conforme ativar. Cada caixinha marcada mostra quem
  marcou e quando. (Ela saiu no 2.4 e voltou no 2.4.1, com o que os cards já tinham marcado.)
- **Os Testes.** O suporte marca o que já testou com o cliente.
- **As pastas.** A Configuração do LinePBX vem em pastas (Servidor, Asterisk, LinePBX Web, Módulos, Telefones), cada uma
  com a conta. Quem cuida dos chamados muda ali mesmo: **Editar as caixinhas** › Nova pasta, Incluir caixinha, as setas
  (levam a caixinha de uma pasta para a outra), a lixeira (desde o 2.4, exclui de verdade: some de todos os cards, mesmo
  dos que a marcaram; o campo pode ficar sem nenhuma) › Salvar. Vale para todos os cards do painel.
- **O checklist do card (2.4.8).** O que muda de cliente para cliente (os ramais a configurar no telefone, os do
  softphone) vai num campo do tipo **Checklist do card**: cada card monta a sua lista na ficha. Escreva um item e Enter, ou
  **cole a lista** (cada linha vira um item; o botão diz **Incluir 3**). Marque conforme faz (cada item mostra quem marcou e
  quando); o lápis corrige o texto e o × tira. A lista vazia conta como uma coisa por fazer na parte; cada item conta como
  um. Pedido numa etapa, o campo só está feito com itens, todos marcados.
- **Recolhidos ao abrir (2.4.11).** O checklist do card, as caixinhas e os módulos começam **recolhidos** cada vez que você
  abre um card: aparecem o nome e a conta (*Lista de ramais (implantação) 39 de 39 · feito*). A **setinha no canto direito**
  (ou um clique no nome) mostra tudo; outro clique recolhe. Quando o aviso do que falta leva até um campo recolhido, ele abre
  sozinho.
- **A caixinha única (2.4.11).** Para uma atividade que é só feita ou não (*Backup conferido*, *Lista de ramais conferida*),
  crie um campo do tipo **Caixinha única (feito)**: na ficha, uma linha com a caixinha e o nome do campo; marcada, mostra
  *feito*, quem marcou e quando, e conta como uma coisa feita na aba e no que a etapa pede.
- **O checklist na Implantação, com um clique.** Em Configurar › Campos, marque **Checklist na Implantação** ao lado de um
  campo (a Lista de ramais, por exemplo): o Gestor cria sozinho, na aba Implantação, o **Lista de ramais (implantação)**, com
  um item por linha. Desmarcar manda esse checklist para os Excluídos; marcar de novo traz de volta, com as marcas.
- **Os itens que vêm de outros campos.** Na janela do checklist, **Os itens vêm de**: marque, por exemplo, a **Lista de
  ramais** da Curadoria (e outros campos, se o checklist junta mais de um). Cada linha dela vira um item no checklist (numa lista de várias, cada opção escolhida; num texto
  curto ou numa lista de uma opção, um item com o nome do campo). A Curadoria mudou a lista? O checklist acompanha: o que
  entrou aparece, o que saiu some, e o que já foi marcado continua marcado. Para corrigir o texto, mude na Lista de ramais.
  O **×** tira o item só daquele card (a Lista de ramais não muda): ele vai para **Tirados deste card**, com o **Voltar**.
- **Todos os produtos.** Cada parte mostra um bloco para cada produto do card; o que ainda não tem campo naquela parte
  (o VoiceNet, por exemplo) aparece vazio, com o aviso.
- **Os anexos.** Cada campo da Curadoria tem o **Anexar**: imagens, PDF, Word, Excel, até 30 MB cada. A Configuração e os
  Testes ficam sem (o Recebe anexos, em Painéis › Ajustes › Campos, liga em qualquer campo; nas caixinhas, o anexo vai
  no clipe de cada uma). A imagem aparece em miniatura e abre grande; o PDF abre no leitor, sem baixar; o resto baixa com um clique.
  Sai do card quem anexou ou quem cuida dos chamados (o histórico guarda).
- **As abas (2.4.8).** As partes ficam em abas no meio da ficha: **Curadoria · Configuração · Testes · Implantação**. Cada
  aba mostra a conta (**3/5**) ou o ✓ quando acabou, e a bolinha vermelha quando a próxima etapa pede algo dela. A ficha abre
  na aba da etapa em que o card está (as etapas "Implantado - …" abrem a Implantação). A aba Implantação é um grupo como os
  outros: crie em Configurar › Campos › **Novo grupo** (no meio da ficha).
- **O cartão do quadro (2.4.8)** mostra o andamento de **todas as partes**, em qualquer etapa — uma barrinha para cada:
  **azul** a da etapa em que o card está, **laranja** a que ficou para trás (a curadoria pela metade com o card já na
  Configuração; a configuração faltando com o card no Implantado) e **cinza** a que ainda vem. A parte que acabou vira só
  o **✓** com o nome, numa linha em cima. Vale para o painel da implantação (o que o Comercial abre, ou o que tem a etapa que
  liga no cadastro); nos outros painéis, o cartão continua mostrando só a barrinha da parte da etapa.
- **O que falta (2.4.4).** O campo que ainda falta tem uma **bolinha vermelha** antes do nome — o mesmo que a conta da
  parte conta. Nas caixinhas, a bolinha fica até a última ser marcada.
- **O documento conta (2.4.4).** O campo com um arquivo anexado conta como preenchido, mesmo sem nada escrito: na conta da
  parte e no que a etapa pede. Tirando o anexo, ele volta a faltar.
- Nada trava: dá para ir para a Configuração com a curadoria pela metade, e para o Implantado com teste faltando.

## 4. O Implantado liga no cadastro e leva a negociação

Quando os testes acabarem, mova o card para **Concluído**. Feita a implantação junto com o cliente, mova para
**Implantado**. A janela mostra como a ficha do cliente vai ficar, desde hoje:

- os produtos sem data ganham a data de hoje (o que o cliente não tinha entra ativo; o Equipamentos, que não tem data,
  entra sem ela; o que estava encerrado fica como está);
- os módulos marcados em Módulos a ativar (a Curadoria) ficam ligados. Se algum ainda não foi marcado na Ativação dos
  módulos (a Configuração), a janela avisa, mas não trava.

**Mover e ligar no cadastro.** Na ficha do cliente (Clientes › o cliente › Produtos), o produto que ainda está em
implantação aparece como **em implantação**; depois do Implantado, **ativo desde** o dia.

E a negociação vai sozinha, no Comercial, de **Em processo de Implantação** para **Implantado**. O Ganho você marca
quando começar a faturar.

### O card de faturamento (2.4.11)

Na etapa que abre o faturamento (o **Implantado - Concluído**, montada no passo 4 da seção 1), a mesma janela mostra antes
o **card de faturamento** que nasce no administrativo, **já preenchido**, e tudo se muda ali:

- o **título**: *Clínica EVAB - Faturamento*;
- o **e-mail para faturamento**: o do contato do card (dá para pôr mais de um, como você escreve: *financeiro@…/barbara@…*;
  o primeiro vira o e-mail do contato do card de faturamento);
- a **data de vencimento** da fatura;
- o **CNPJ do faturamento**: o do cadastro do cliente;
- as **informações**: a ativação com o que foi combinado nas Condições especiais da negociação (em quantas vezes, a partir de
  quando, o desconto, a OBS) e cada produto com a mensalidade e as licenças da **simulação principal** (*LinePBX: R$ 954,00 ·
  15 Licenças ramais corporativos · 06 Licenças usuários de callcenter*). A janela diz de qual negociação e de qual simulação
  vieram; **Ver como fica a descrição do card** mostra o texto inteiro.

**Mover e abrir o faturamento.** O card de faturamento nasce na primeira etapa do administrativo, com a descrição no
formato do card que você escrevia à mão (*Faturamento Clínica EVAB · E-mail para faturamento · Data de vencimento · CNPJ do
faturamento*, uma linha em branco e as informações), o cliente, o contato, os produtos e você como observador. Quem a
primeira etapa do administrativo avisa recebe *"Chegou o card de faturamento GLA-68 (do IMP-7) em …"*. Na ficha da
implantação, o bloco **Faturamento** mostra o card aberto (e onde ele está); na do card de faturamento, *"do card IMP-7"*.

Um card de implantação abre **um só**: voltar e chegar de novo no Implantado - Concluído não abre outro.

## 5. Os campos (Painéis › Ajustes › Campos)

Desde o 2.4, os campos ficam em **grupos** (o cartão **Os grupos de campos**: Novo grupo, Editar — o nome e se fica no meio
da ficha ou na lateral —, as setas da ordem, o botão que ativa ou desativa todos os campos do grupo e a lixeira, que exclui o
grupo com os campos). A lista dos campos vem separada: os dos Detalhes (a lateral; a Classificação até o 2.4.6) e, em cada grupo, um bloco por
produto. O campo se
**exclui** de verdade (Editar › Excluir o campo); o que os chamados preencheram volta pelo **Restaurar**, em Excluídos.

Todo campo de qualquer painel tem duas opções:

- **Grupo**: com ele, o campo vai para o cartão do grupo (no meio da ficha ou na lateral).
- **Produto**: com ele, o campo só aparece no chamado que tem o produto. O mesmo nome pode existir em produtos
  diferentes.

E dois tipos novos: **Caixinhas** (o que já foi feito, com quem marcou e quando; em pastas, se quiser: **Nova pasta** na
janela do campo) e **Módulos do produto** (os módulos do catálogo; o produto não muda depois de criado). Num campo de
módulos, **Os módulos que aparecem** › **Só os marcados em …** faz dele o checklist de outro campo de módulos do mesmo
produto. E, desde o 2.4, o tipo **Documento**: o arquivo anexado (conta como feito com o primeiro); o texto curto e o longo
viram documento sem perder o que foi escrito. Desde o 2.4.8, o **Checklist do card**: a lista de tarefas que cada card monta
(as caixinhas são as mesmas em todos os cards do painel; o checklist do card, não). Ele não pode ser pedido para abrir o
chamado (a lista nasce depois), só para entrar nas etapas. Desde o 2.4.11, a **Caixinha única (feito)**: uma caixinha só, sem
opções para escrever (o nome do campo é a atividade); marcada, guarda quem marcou e quando. É diferente do **Sim ou não**,
que guarda uma resposta e não conta como tarefa.

E a opção **Recebe anexos**: com ela, o campo ganha o Anexar na ficha (nas caixinhas, o clipe de cada uma; na caixinha única,
o clipe ao lado dela). No modelo
Implantação, vem ligada nos campos da Curadoria.

E, desde o 2.4.7, a **Largura na ficha** (num grupo do meio da ficha): **Metade** (lado a lado com o campo vizinho de metade,
como a Operadora Doadora e a Conta operadora doadora) ou **Linha inteira** (como a Faixa Numérica). Sem escolher, vale a do
tipo: o texto longo, o documento e as caixinhas ocupam a linha; o resto, metade.
