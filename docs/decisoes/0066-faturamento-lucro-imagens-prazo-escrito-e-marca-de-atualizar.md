# 0066 — O card de faturamento, o lucro no quadro de Vendas, as imagens do relato e da descrição, o prazo escrito e a marca de atualizar

**Data:** 25/11/2026 · **Patch:** 2.4.11 · **Situação:** aceita · **Revê:** a 0047 (o "Reabrir este em vez de abrir outro" do
Abrir chamado; o aviso da equipe no histórico), a 0057 (a implantação termina também abrindo o faturamento), a 0063 (o Trocar
sem os painéis pessoais), a 0065 (o prazo do painel pode ser o escrito em cada chamado) e a 0064 (o checklist do card, as
caixinhas e os módulos começam recolhidos; o tipo novo, a caixinha única)

## O pedido

O Luan, 25/11, num documento com oito prints, "faça essas melhorias por favor":

1. No Abrir chamado e na ficha: *"Quero poder colocar uma imagem aqui tbm nos relatos e descrição."*
2. *"Qualquer chamado com 24 sem atualização tem q ter um flag sinalizando que tem q atualizar, eu quero que tenha uma opção no
   painel sinalizando se eu vou querer ativar essa função ou n."*
3. Com o print da linha *"O Gestor avisou Eduardo pelo WhatsApp hoje 15:21"*: *"N precisa desse registro de aviso."*
4. Com o print de *"Chamados recentes deste cliente — é o mesmo problema? Reabra em vez de abrir outro"*: *"Não precisa disso
   na hora de abrir o chamado."*
5. Com o print do Implantado - Concluído da implantação e o do card GLA-67 que ele escreve à mão no Grupo Line - ADM: *"Quero
   que quando eu arraste pra concluído seja gerado um card no administrativo de faturamento e tem que ter a opção de eu colocar
   a descrição lá do card o email do faturamento o vencimento da fatura e as informações como eu fiz na imagem abaixo."*
6. *"Tem q ter a opção do painel dos prazos serem manuais e serem preenchidos em cada chamado."*
7. *"Quando eu abrir o chamado pela notificação, quero que o card apareça na frente das notificações."*
8. Com o print do Trocar: *"Aqui n precisa aparecer os painéis pessoais."* Depois, às 15:12: *"o de cada eu quero que
   tenha, n quero que apareça os dos outros."*
9. Com o print do alto da coluna "Cliente na base R$ 6.627,20/mês": *"Esse valor total acima eu quero tbm saber n só o valor
   dos contratos mais tbm o valor do meu lucro, vc tem que pegar o valor das simulações nesse caso e somar, e colocar do lado do
   valor dos contratos tbm."*

O card GLA-67, o formato que ele quer:

```
Faturamento clínica EVAB
Email para faturamento: …
Data Vencimento: 10/11
CNPJ Faturamento: …

Ativação R$ 3.000,00 em 5x - OBS: vai ser faturado a partir de março/27

LinePBX: R$ 954,00
15 Licenças ramais coorporativos
06 Licenças usuários de callcenter

Linechat: R$ 736,00
12 Licenças usuários callcenter
02 Licenças números Whatsapp
```

Os itens 3, 4 e 6 mudam o que a 0047 e a 0065 tinham decidido: avisei no plano que mandei antes de começar, e eles foram feitos
como ele pediu.

No mesmo dia (11:18), com dois prints — a lista dos tipos de campo e o checklist "Lista de ramais (implantação) 39 de 39 ·
feito", com uma marca no canto direito do cabeçalho:

10. *"Eu quero que tenha a opção aqui de checkbox único onde vai ser apenas um check unico identificando que a tividade já foi
    feita, isso é diferente do check que já tem hoje."*
11. *"Eu quero tbm que tenha a opção de colapsar que vai exibir tudo ou fica fechado como uma pasta, e quero que por padrão
    quando eu abra um card ele já venha resumido e eu vou ter que clicar para ir colapsando."*

## O que mudou

### 1. As imagens do relato e da descrição

- **No Abrir chamado**: o print colado com Ctrl+V na caixa do relato ou da descrição (o texto colado junto continua indo para a
  caixa) ou o botão **Imagem** embaixo dela. As imagens esperam o Abrir em miniatura (o X tira) e vão com o chamado
  (`ChamadoCriarSchema.imagens`: `{ campo, fileName, conteudo }`, até 10 de uma vez).
- **Na ficha**: o botão **Imagem** ao lado do Editar, e o print colado enquanto se escreve, **vão na hora** — não esperam o
  Salvar do texto (`POST /atendimento/chamados/:id/textos/:campo/imagens`, `anexarNoTexto`). Aparecem em miniatura embaixo do
  texto e abrem grandes (a mesma `ListaDeAnexos` dos campos do card); sai quem pôs ou quem cuida dos chamados
  (`tirarAnexoDoCampo`, que passou a aceitar também a imagem de um texto). O histórico conta ("anexou print.png em Relato do
  cliente"; "tirou … de Descrição").
- **Só imagem**: PNG, JPG, WEBP e GIF, conferidos pelos bytes (`imagemParaGuardar`; o PDF e o resto continuam na anotação), de
  até 10 MB cada; de uma vez, até 10 e 30 MB na tela (o pedido fica abaixo dos 45 MB que a rota recebe); **até 20 em cada texto**
  (`MAX_IMAGENS_DO_TEXTO`, conferido com a linha do chamado travada).
- **Onde ficam**: `ticket_attachments.text_field` (`relato` ou `descricao`; migração 0037), sem anotação, sem campo e sem
  caixinha. A ficha traz `imagensDosTextos`.
- O painel que não usa o relato não recebe imagem nele (400 na ficha; no Abrir, a do relato fica de fora). Na negociação, a
  descrição ("Sobre a negociação") também recebe.

### 2. A marca de atualizar

- **Uma opção por painel** (Configurar › As regras): **Marcar o chamado sem atualização**, depois de N horas (de 1 a 720;
  `AjustesDoPainel.horasSemAtualizacao`, nulo = desligada, o padrão de todos os painéis). Vale nos de Gestão e no de Vendas.
- **O chamado em aberto** (a situação "aberto": não o resolvido nem o fechado) **que ninguém mexe há as horas** ganha a
  bandeirinha laranja **Sem atualização há 26 h** (depois de dois dias, "há 3 dias") no cartão do quadro e do Meu dia, na lista
  (embaixo do Atualizado) e no alto da ficha.
- **"Mexer" é o `last_activity_at`** (o "mexido há" de sempre): anotar, mudar um campo, mover, a resposta do cliente na
  conversa. O aviso automático não conta (o `registrarEvento` não mexe nele).
- A conta é da tela (`horasSemAtualizacao` no `@gestor/shared`), na hora: ligar ou mudar as horas vale na mesma hora para
  todos os chamados do painel, sem nada gravado no chamado.

### 3. O aviso da equipe sai do histórico

- O WhatsApp que o Gestor manda para a equipe (o "O Gestor avisou Eduardo pelo WhatsApp hoje 15:21") **não entra mais no
  histórico** (`avisarEquipe` não grava o evento `aviso_equipe`). Quando o WhatsApp não vai, o servidor registra no log
  ("aviso da equipe: o WhatsApp não foi").
- Os que já estavam gravados continuam no banco e **não aparecem** na ficha (a leitura do histórico deixa o tipo de fora).

### 4. O Abrir chamado sem os chamados recentes

- O bloco **"Chamados recentes deste cliente — Reabra em vez de abrir outro"** saiu do Abrir chamado (e com ele o
  "Reabrir este em vez de abrir outro"). O chamado fechado continua reabrindo pela ficha (**Reabrir**). O `cadastroDoCliente`
  continua trazendo os recentes (a rota não mudou).

### 5. O card de faturamento

- **A etapa que abre o faturamento** (`EtapaPainel.abreFaturamento`, `ticket_stages.opens_billing_panel_id`; migração 0037): no
  painel de Gestão, a etapa escolhe o painel em que o card de faturamento nasce (**Ao chegar aqui, abre o card de faturamento**
  › **No painel Grupo Line - ADM**). Precisa ser outro painel de Gestão da equipe (nem o próprio, nem o de Vendas, nem um
  pessoal: 400). O chip **abre o faturamento** marca a etapa na lista. **Na produção, a etapa se escolhe uma vez** (o Luan, no
  Configurar da implantação: o Implantado - Concluído › Grupo Line - ADM); na prévia, já vem escolhida.
- **A janela antes de mover** (`aoMover` traz `faturamento`, o `PlanoDoFaturamento`), já preenchida, com tudo para mudar:
  - o **título** "`<cliente>` - Faturamento" (como os do Grupo Line - ADM);
  - o **e-mail para faturamento**: o do contato do card (ou o da negociação);
  - a **data de vencimento** da fatura (vazia);
  - o **CNPJ do faturamento**: o do cadastro do cliente, escrito com os pontos;
  - as **informações** (`informacoesDoFaturamento`): a ativação com o combinado nas Condições especiais (em quantas vezes, a
    partir de quando, o desconto), o desconto na mensalidade e a OBS; depois **cada produto com a mensalidade e os itens da
    simulação principal** da negociação de onde o card veio (as linhas do mês e os aparelhos, com a quantidade de dois
    algarismos, como ele escreve: "06 Licenças…"); sem o valor por produto, a mensalidade numa linha só. A linha do cenário sem
    produto vai para o primeiro produto do cenário (como no Simulador). A janela diz de qual negociação e de qual simulação veio,
    e mostra a descrição inteira.
  Se a etapa também liga no cadastro (o Implantado), **a mesma janela** mostra embaixo o que fica ativo na ficha do cliente e a
  negociação que vai para o Implantado do Comercial.
- **O card** (`abrirOFaturamento`, na transação do mover): na entrada do painel escolhido, com a origem **Aberto pela
  implantação** (`ORIGENS.implantacao`), o título, a **descrição no formato do GLA-67** (`descricaoDoFaturamento`:
  "Faturamento `<cliente>`", "E-mail para faturamento:", "Data de vencimento: dd/mm/aaaa", "CNPJ do faturamento:", uma linha em
  branco e as informações; o vazio não entra), o cliente e o contato do card (o **primeiro e-mail** escrito vira o do contato),
  os produtos e **quem moveu como observador**. Quem a etapa de entrada do administrativo avisa recebe "Chegou o card de
  faturamento GLA-68 (do IMP-7) em …" (quem moveu, não).
- **Ligado ao card que o abriu** pelo `source_ticket_id` (como a implantação à negociação): **um card abre um só** (de novo na
  etapa, o plano diz `jaAberto` e nada se repete). No histórico dos dois: "abriu o card de faturamento GLA-68 no painel Grupo
  Line - ADM" e "veio da implantação IMP-7 (…)"; a auditoria guarda o card criado com a descrição. Na ficha da implantação, o
  bloco **Faturamento** mostra o card aberto; na do faturamento, "do card IMP-7" (`daNegociacao.deVendas` falso).
- O pedido da janela (`MoverSchema.faturamento`, `PedidoDoFaturamentoSchema`): o título de 3 letras para cima, o vencimento
  como AAAA-MM-DD, as informações até 20.000 letras. Sem o pedido (a integração, o teste), vai o que o Gestor preencheu
  (`pedidoDoPlano`).

### 6. O prazo escrito em cada chamado

- **Uma opção por painel** (Configurar › As regras › **Conta prazo** › **O prazo do assunto** ou **Escrito em cada chamado**;
  `AjustesDoPainel.prazoManual`). Com o escrito, o painel conta prazo **mesmo sem o assunto** (`painelContaPrazo`); o de Vendas
  não tem (o servidor grava sempre falso).
- **O prazo é o dia e a hora** escritos no Abrir chamado (o campo **Prazo**, com a hora começando em 18:00) ou no bloco **Prazo**
  da ficha (**Escrever o prazo**, **Mudar o prazo**, **Tirar o prazo**), no horário de Brasília (`tickets.due_at`; migração
  0037). O `ChamadoAlterarSchema.prazo` muda (nulo tira); no painel do prazo do assunto, 400.
- **A conta** (`prazoNoDia`): em minutos corridos, da abertura até o dia escrito, e **não para esperando o cliente** (quem
  escreveu o dia já combinou). Perto de vencer pelo percentual dos Ajustes › Prazos, como o do assunto; resolvido antes, no
  prazo; depois, fora do prazo. Sem o dia escrito, "Sem prazo: o prazo deste chamado ainda não foi escrito"
  (`sem_prazo_escrito`).
- **Mudar o prazo apaga os alertas do prazo de antes** (`solucao_perto`, `solucao_vencida`): o novo avisa de novo. O histórico
  diz "mudou Prazo de "01/12/2026 às 18:00" para "03/12/2026 às 12:00"".
- Os relatórios usam o mesmo estado (o `derivar` recebe o `prazoEscrito` e o `prazoManual` do painel).

### 7. A ficha na frente dos avisos

- Os cartões dos avisos que chegam ficam **abaixo das janelas** (z-index 45, contra o 50 das janelas; antes, 70): a ficha aberta
  pelo cartão aparece na frente, e os cartões voltam quando ela fecha.

### 8. O Trocar sem os painéis pessoais dos outros

- O **Trocar** do alto do quadro, da lista e do relatório lista os painéis da equipe e **o seu painel pessoal**, e não lista
  os painéis pessoais **das outras pessoas** (quem administra vê os de todos; eles continuam na tela Painéis, à parte). O
  painel aberto continua na lista, mesmo o pessoal de outra pessoa aberto pelo link (`paineisDoTrocar`, a mesma regra do
  `dosOutros` da tela Painéis).
- A primeira versão tirava todos os pessoais, o seu inclusive; às 15:12 o Luan pediu o de cada um de volta.

### 9. O lucro no quadro de Vendas

- No alto de cada coluna do quadro de Vendas, do lado da soma das mensalidades: **· lucro R$ 2.140,00** — a soma da **sobra
  por mês da simulação principal** de cada negociação da coluna (`ColunaQuadro.lucro`, `{ valor, comSimulacao }`, pelo mesmo
  `margensDasNegociacoes` do relatório de vendas: com as Condições especiais). Verde, ou vermelho se der prejuízo.
- A negociação sem simulação fica de fora, e a coluna diz quantas entraram ("(3 de 5)"); sem nenhuma, "lucro —". O passar o
  mouse explica.

### 10. A caixinha única

- **Um tipo de campo novo, "Caixinha única (feito)"** (`feito`): uma caixinha só, e o nome do campo é a atividade ("Backup
  conferido", "Lista de ramais conferida"). Na ficha, uma linha: a caixinha, o nome e, marcada, "feito", quem marcou e
  quando; o clipe dos anexos ao lado, se o campo recebe anexos. No Abrir chamado, um botão "Marcar como feito".
- **Por dentro, é uma caixinha**: o campo tem uma opção só, a **"Feito"**, que o Gestor cria (`opcoesDaCaixinhaUnica`; o que
  vier escrito nas opções não conta, e salvar o campo de novo mantém o mesmo id, para as marcas dos cards continuarem
  apontando para ela). Assim valem as regras das caixinhas: quem marcou e quando (`marcas`), o anexo na caixinha, a conta.
- **O valor**: a lista com a caixinha, ou vazio. Pelo robô, pelo n8n e pelo CSV: sim, "feito", "x" ou o id marcam; não
  desmarca; o resto é recusado ("Backup conferido: marque como feito (sim) ou desmarque (não)").
- **A conta**: um na parte e no que a etapa pede, feito quando marcada (o "N de M" da aba e a bolinha vermelha acompanham).
- **O histórico**: "marcou Backup conferido como feito" e "desmarcou Backup conferido (não está mais feito)".
- Não troca de tipo depois de criado (nem com as caixinhas nem com o sim ou não). Não gera itens de checklist. Meia linha no
  grupo do meio da ficha, como o sim ou não.
- **Diferente do sim ou não**: o sim ou não guarda uma resposta (e fica vazio até alguém responder); a caixinha única guarda
  quem fez e quando, e conta como tarefa.

### 11. Recolher como pasta

- **O checklist do card, as caixinhas e os módulos começam recolhidos** cada vez que a ficha abre: fica à vista o cabeçalho —
  a bolinha do que falta, o nome, a conta ("39 de 39 · feito", verde quando tudo está feito; na escolha dos módulos, "3
  escolhidos") e o "falta para ir para …". **A setinha no canto direito** (ou um clique no nome) mostra tudo e recolhe de
  novo. Aberto, aparecem a explicação, os itens, o incluir e o "Editar as caixinhas".
- O aviso do que falta (o nome do campo que leva até ele) **abre o campo recolhido** antes de rolar até lá
  (`irParaOCampo` manda o "gestor:abrir-campo"; `useCampoAberto`).
- As pastas de dentro das caixinhas continuam como eram: abrem junto com o campo, e cada uma recolhe com um clique.
- O que fica aberto não é lembrado: a próxima ficha (ou a mesma, aberta de novo) começa recolhida, como ele pediu.

## Por quê

- O faturamento já era um card à mão no Grupo Line - ADM, com o que estava na negociação e na simulação: o Gestor tinha tudo
  para escrever, e a janela deixa conferir e mudar antes (o vencimento, sobretudo, só quem fatura sabe).
- O prazo do assunto serve ao suporte; um projeto ou uma implantação tem a data combinada com o cliente, que não cabe numa
  tabela de horas. Por isso o escrito é corrido e não para esperando o cliente.
- A marca de atualizar mede o que a equipe faz no chamado (o "mexido há" que já existia), não o que o Gestor manda sozinho.

## Para quem vem depois

- A migração **0037** (`0037_imagens_prazo_manual_e_faturamento`) põe `ticket_attachments.text_field`, `tickets.due_at` e
  `ticket_stages.opens_billing_panel_id` (com a chave para o painel). Os ajustes novos do painel ficam no JSON de sempre
  (`prazoManual`, `horasSemAtualizacao`), completados por `ajustesDoPainelCompletos`; salvar o painel sem as chaves mantém o
  que estava.
- O `source_ticket_id` agora liga dois pares: a negociação → a implantação (2.3) e a implantação → o faturamento (2.4.11). O
  card de faturamento tem a origem `implantacao`; a `negociacaoNoFim` só segue o par cuja origem é um painel de Vendas.
- As contas do faturamento (`produtosDoFaturamento`, `informacoesDoFaturamento`, `descricaoDoFaturamento`) moram em
  `packages/shared/src/faturamento.ts`, usadas pelo servidor, pela prévia e pela janela. O texto usa o espaço comum no "R$ 954,00"
  (o do formato de moeda não quebra; trocado), para colar no e-mail e na nota.
- A prévia faz igual (`demo-atendimento.ts`: `planoDoFaturamento`, `abrirOFaturamento`, o lucro do quadro, o prazo escrito e as
  imagens; a simulação principal vem do `demo-simulador.ts`, pelo `fonteDoPrincipalDemo`). Na prévia, o Implantado - Concluído
  já abre o faturamento no Administrativo (depois dos exemplos: a Ótica Visão Clara, que já chegou lá, fica sem).
- Em aberto: o vencimento é o dia da fatura (uma data). Se o Luan quiser o dia do mês ("todo dia 10"), é outro campo.
- A caixinha única não pede migração: o tipo do campo é texto (`ticket_fields.kind`), e a opção "Feito" mora nas opções do
  campo, como as das caixinhas. O tipo entra em `ehCaixinhas` (as marcas, o anexo na caixinha, o histórico) e fica fora de
  `temOpcoesEscritas` (ninguém escreve a opção). O evento do histórico leva `unica: true`.
- Em aberto: se o Luan quiser as pastas de dentro das caixinhas também fechadas ao abrir o campo, é mudar o começo da
  `PastaNaFicha`.
