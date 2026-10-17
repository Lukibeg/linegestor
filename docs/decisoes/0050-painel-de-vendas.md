# 0050 — O painel de Vendas (o Comercial)

**Contexto.** Depois do Calendário, com o 2.0.1 ainda sem subir, o Luan pediu: *"quero fazer um painel
para o comercial tbm usar, já temos um no helena, vc pode dar uma olhada no painel comercial para se
basear e montar algo legal, veja tbm a parte de relatório pq é importante termos algo parecido tbm para
o comercial"*. No Helena (o LineChat), o painel **Ingline - Comercial** é do tipo **Vendas** (os outros
são de Gestão). Uma primeira versão, com tudo o que o Helena tem, foi montada; antes de seguir, em
17/10, ele pediu: *"antes de vc fazer quero que me pergunte as funcionalidades… algo parecido que
fizemos com o painel de chamados do suporte, pq eu n quero nada muito complexo"*. Nas perguntas, ele
marcou: **o valor**, **o Ganho e o Perdido** (o perdido pede o motivo), **a empresa sem cadastro**, **a
meta do mês** e, no relatório, **os números do período** e **o funil**; as etapas, **as do Helena**.
Ficaram de fora a previsão de fechamento e, no relatório, os vendedores, os motivos de perda, o tempo
em cada etapa, os meses e as maiores em aberto. Na prévia dessa versão, ainda em 17/10: *"copie as
mesmas etapas que estão no linechat e o relatório tbm n gostei muito n. e n precisa ser um botão para
ele, ele vai ser um painel como o do suporte"* — e, sobre o relatório, *"quero que vc faça um só pra
ele, mas esse que vc fez n ficou legal n, dê uma melhorada"*. Como o 2.0.1 não subiu, o painel entrou
nele (a regra do patch que ainda não subiu).

**Decisão.**

- **O tipo do painel.** Como no Helena, o painel é de **Gestão** (os chamados: prazos, níveis,
  problema) ou de **Vendas** (as negociações). O tipo é escolhido ao criar (Painéis › Ajustes ›
  Painéis › Novo painel: **Chamados (Gestão)** ou **Negociações (Vendas)**) e **não muda depois**: os
  dados de um e de outro são diferentes. O painel de Vendas é o painel dos chamados com o que é de
  venda — o quadro, a lista, a ficha, as anotações e o histórico, os avisos, os observadores, quem vê,
  o Esperar o cliente, o Agendar e as ligações são os mesmos. Não tem prazo, níveis, prioridade,
  problema, pai e filhos, operadora nem o tempo gasto.
- **As etapas.** Vêm **Lead → Qualificação → Proposta enviada → Negociação → Ganho / Perdido**
  (até o print das colunas do Comercial do Helena, quando os nomes passam a ser os de lá). As finais
  são duas, **Ganho** e **Perdido**: o painel de Vendas tem uma de cada (o nome muda, a etapa não sai),
  nenhuma etapa Resolvido e nenhum nível. Dá para incluir etapas no funil, como em qualquer painel.
- **A negociação.** O que está sendo negociado (o título); a **empresa** — um cliente do cadastro ou
  uma que ainda não é (o nome escrito à mão; quando ela entra no cadastro, o **Virou cliente?** da
  ficha liga os dois); o contato e o WhatsApp; o **valor** — a **mensalidade** e a **ativação** (em R$);
  o **Sobre a negociação**; os produtos; quem cuida (o responsável); as etiquetas. A **Proposta
  enviada** pede o valor (a mensalidade ou a ativação; a regra da etapa, que muda nos Ajustes como as
  outras).
- **Os campos do Comercial.** O painel de Vendas nasce com os campos do painel Ingline - Comercial do
  Helena (17/10, no print do Luan: *"vc n colocou esses campos personalizados aqui, só n precisa colocar o
  do área de atuação"*): **CNPJ** (texto curto), **Contatos principais** (texto longo: na ficha, fica junto
  do Sobre a negociação), **Origem de lead** (lista: Indicação, Site, Instagram, Google, WhatsApp, Evento,
  Prospecção ativa e Cliente da base) e **Indicação** (texto curto: quem indicou). A **Área de atuação**
  ficou de fora. São campos do painel como os outros (`CAMPOS_DO_PAINEL_DE_VENDAS`, no `@gestor/shared`):
  a equipe muda o nome, as opções e a ordem, desativa e inclui em Ajustes › Campos; na nova negociação,
  aparecem em "Do painel Comercial", e na ficha, em Detalhes. O robô e o n8n preenchem pelo nome do
  campo e da opção, como nos chamados.
- **A mensalidade e a ativação.** Na prévia, em 17/10, nos comentários: *"aqui tem q ter mensalidade e
  ativação"* — e, perguntado qual das duas conta, *"a ativação n muda nada nos relatórios, ela só vai ter
  registro, mas n muda nada"*. O valor da negociação tem duas partes:
  - a **Mensalidade** (o que o cliente paga por mês) é **a que conta**: a soma das colunas do quadro, o
    Em negociação, o Ganho no mês e a meta do cartão do painel, os números e os ganhos mês a mês do
    relatório e o Ganho. Na tela, vem com o **/mês** (*"R$ 980/mês"*);
  - a **Ativação** (paga uma vez, no começo) **fica só registrada**: aparece na ficha, na janela do Ganho,
    no histórico e no Exportar, e não entra em soma nenhuma. A negociação só com a ativação (uma venda
    só de instalação) mostra no cartão *"só ativação: R$ 1.500"*.

  As duas são **opcionais**; a etapa que pede o valor (a Proposta enviada) aceita qualquer uma. Na janela
  do **Ganho**, as duas (a **Mensalidade fechada** e a **Ativação**); na nova negociação e na ficha, uma
  embaixo da outra. O histórico diz qual mudou (*"mudou Mensalidade para "R$ 1.250,00""*, *"mudou Ativação
  para "R$ 1.900,00""*), e o Exportar tem as colunas **Mensalidade (R$)** e **Ativação (R$)**. No banco, a
  ativação é `tickets.setup_cents` (e `tickets.product_setup`, por produto).
- **O valor por produto.** Na prévia, em 17/10, nos comentários: *"eu quero que tenha como dividir o
  valor por produtos e no final tenha o total"*. O Valor da negociação (na ficha e na nova negociação)
  tem **Um valor só** (a mensalidade e a ativação de sempre) ou **Por produto**: cada produto da
  negociação com a sua mensalidade e a sua ativação e, no fim, os dois **Totais**, que viram a mensalidade
  e a ativação da negociação — o total das mensalidades é o que vai para o quadro, o relatório, a meta e
  o Ganho. Os produtos entram e saem ali mesmo (**Incluir produto**, o ×); o produto que sai leva os
  valores dele junto. Com a divisão, a mensalidade e a ativação não mudam direto (o servidor recusa:
  muda-se produto a produto, ou volta-se para **Um valor só**, e os totais ficam como os valores únicos).
  O produto sem valor escrito fica de fora da soma. Só o valor de cada produto, sem quantidade. Na ficha,
  a linha Produtos da Classificação some enquanto o valor está por produto (os produtos ficam no Valor). A
  janela do **Ganho** mostra cada produto e os totais, só para ler (o valor fechado, por produto, muda-se
  na ficha). O histórico diz os dois — *"Mensalidade por produto: LinePBX R$ 980,00 · VoiceNet R$
  270,00"* e a Mensalidade —, e no **Exportar** a coluna Produtos leva os valores de cada um (*"LinePBX
  (R$ 980,00/mês, ativação R$ 1.500,00), VoiceNet (R$ 270,00/mês, ativação R$ 400,00)"*). A conta
  (`valorPorProduto`, no `@gestor/shared`) é a mesma no servidor e na prévia, para as duas partes.
- **Ganho e Perdido.** Na ficha, **Ganhou** e **Perdeu** (ou arrastar para a coluna no quadro, ou o
  Mover) abrem a janela: no Ganho, a mensalidade fechada e a ativação (se mudaram, as da negociação
  mudam junto e ficam no histórico) e o dia em que fechou; no Perdido, **o motivo** (sempre: um da lista do painel, e o
  **Outro** pede para escrever) e o dia. O dia é hoje ou um que já passou (quem lança uma venda antiga
  marca o dia em que ela acabou de verdade). O motivo muda depois, na ficha. **Reabrir** volta a
  negociação para a etapa em que ela estava. O histórico e a auditoria falam de venda: *"criou a
  negociação em Lead"*, *"marcou como ganho (R$ 1.250,00/mês), estava em Negociação"*, *"marcou como
  perdido: Preço (estava em Proposta enviada)"*.
- **Os Ajustes do painel.** Os **motivos de perda** (vêm Preço, Fechou com a concorrência, Sem retorno
  do cliente, Adiou a decisão, Sem orçamento, Não atende o que precisa e Outro; precisa de pelo menos
  um) e a **meta do mês** (em R$, de mensalidades; vazia, sem meta).
- **A tela dos painéis.** O cartão do painel de Vendas mostra **Em negociação** (a soma das
  mensalidades das abertas, e quantas), o **Ganho no mês** (e quantas ganhas e perdidas), **Sem dono**, **Minhas** e a
  **barra da meta** do mês. O botão **Relatório** fica ao lado de Configurar.
- **O quadro e a lista.** Cada coluna soma as mensalidades das negociações dela; a de maior mensalidade
  vem primeiro (a sem mensalidade, no fim). O cartão mostra a empresa, o contato, a mensalidade e quem
  cuida; o Ganho e o Perdido, com o dia. Na lista, a **Mensalidade** fica no lugar da prioridade e do
  prazo, a ordem é por ela e **Ganhas e perdidas** fica no lugar de Resolvidos e Fechados. O
  **Exportar** leva a mensalidade, a ativação, o resultado e o motivo da perda.
- **O relatório, só do Comercial.** No painel, ao lado de Quadro e Lista: **Relatório** (e o botão
  Relatório no cartão do painel). O conteúdo é o que o Luan escolheu (os números do período e o funil);
  a forma, depois do "dê uma melhorada", é a dos relatórios do Suporte:
  - **O período em números**, em mensalidades. O **ganho** (quanto e quantas), as **novas** (quantas
    entraram e quanto somam em propostas), o **perdido** (quanto e quantas, pelo dia em que acabaram), a **conversão** (das
    que acabaram, quantas foram ganhas) e o **ticket médio** — cada um com a **seta** do que mudou em
    relação ao período anterior (verde quando melhorou: mais ganho, mais novas, mais conversão; o perdido
    e o ticket, sem cor). O período anterior: o mês inteiro com o mês anterior inteiro, o pedaço de um mês
    (do dia 1 até hoje) com o mesmo pedaço do mês anterior, e o resto com o período de mesmo tamanho logo
    antes. A **meta do mês** (numa barra) e as frases de **destaque** também entraram nessa volta e saíram
    na prévia (17/10, nos comentários: *"n quero isso de meta"*, *"n quero esses destaques"*). A meta
    continua no cartão do painel, na tela dos painéis.
  - **Os ganhos mês a mês** (17/10, nos comentários: *"eu quero um relatório que compare meus ganhos mes
    a mes, algo parecido com o que tem hoje no helena"*). Uma coluna por mês, os 12 meses que terminam
    no mês do fim do período, com o valor em cima e, embaixo, quanto mudou em relação ao mês anterior
    (verde quando subiu, laranja quando caiu). O mês que ainda não acabou (o de hoje, ou o período que
    termina no meio do mês) conta até o fim do período e é comparado com o mesmo pedaço do mês anterior
    (marcado com \*). Do lado, o total dos 12 meses. No celular, os 6 últimos. Clicar num mês mostra as
    negociações ganhas nele. O relatório de vendas do Helena não foi visto (o navegador desta conversa não
    abre o LineChat): o desenho segue o dos relatórios do Suporte.
  - **O funil.** Das que entraram no período, quantas chegaram a cada etapa (a etapa mais adiante por
    onde passaram; a ganha chegou ao fim), com a porcentagem das que entraram, quantas se perderam em cada
    uma (a etapa em que estavam ao perder) e quantas foram ganhas. As barras, alinhadas à esquerda.
  - **Clicar mostra as negociações por trás** (a regra dos gráficos do sistema): o ganho, as novas, o
    perdido, cada etapa do funil e as perdidas de cada etapa abrem a janela com as negociações — o
    código (abre a negociação), a empresa, quem cuida, o valor e como está (a etapa, o Ganho ou o
    Perdido, com o motivo).
  - O período: **Este mês**, **Mês passado**, **Este trimestre**, **Últimos 90 dias**, **Este ano** ou
    dois dias; fica no endereço (dá para mandar o link). A negociação que veio de outro painel conta de
    quando entrou neste.
- **Onde fica.** Em **Suporte › Painéis**, como os outros painéis (o Suporte, o Desenvolvimento): a
  tela dos painéis, o quadro, a lista, o Meu dia. A primeira versão tinha um item **Vendas** no menu; o
  Luan não quis (*"não precisa ser um botão para ele, ele vai ser um painel como o do suporte"*). Dentro
  do painel de Vendas, o botão do alto é **Nova negociação**. O item do menu se chamava **Chamados**; com
  o Comercial ali dentro, virou **Painéis** (17/10, nos comentários: *"isso aqui n é chamados, é
  paineis"* — a revisão da decisão 0048).
- **A troca de painel.** A negociação só passa para **outro painel de Vendas** (e entra numa etapa do
  funil: o Ganho e o Perdido se marcam na janela deles); o chamado só para **outro de Gestão**. Entre os
  dois, abre-se o outro lá: da negociação ganha, o chamado da implantação no Suporte; do chamado em que
  o cliente pediu um orçamento, a negociação no Comercial.
- **Sem pai, filhos e ligações.** A primeira versão deixava a negociação ter pai e filhos (era o caminho
  para o Suporte); na prévia, em 17/10, nos comentários: *"n precisa de pais e filhas aqui"*. A versão
  seguinte deixou só as **Ligações** (relacionado, duplicado de, repete, com o desenho), e, ainda em
  17/10: *"isso mesmo, n precisa ligações"*. Agora a negociação fica sozinha no painel de Vendas: a ficha
  não tem a parte de filhos e ligações, e o Mais não tem Ligar, Criar um filho nem Definir o pai. O
  servidor (e a prévia) recusa a negociação com pai, a negociação como pai de um chamado, o problema no
  painel de Vendas, a negociação como incidente de um problema e a ligação com uma negociação, dos dois
  lados (`NEGOCIACAO_SEM_LIGACAO` e `negociacaoNaoSeLiga`, no `@gestor/shared`). Ao escolher outro
  chamado (o pai, o problema, a ligação), a lista não mostra as negociações, e o desenho das ligações de
  um chamado não as mostra. O código escrito num texto (*"o orçamento está na COM-2"*) continua virando
  link, na negociação e no chamado: citar não é ligar.
- **Permissões.** As dos chamados: ver, `support.read`; trabalhar (criar, mover, ganhar, perder),
  `tickets.work`; os painéis e os ajustes, `tickets.manage`.
- **O banco.** A migração `0018_vendas`: o tipo do painel (`ticket_panels.kind`, `gestao` ou `vendas`),
  o resultado da etapa final (`ticket_stages.outcome`, `ganho` ou `perdido`), e na negociação o valor em
  centavos — a mensalidade (`tickets.value_cents`, `bigint`: o valor vai até R$ 100 milhões, que não cabe
  num `integer`) e a ativação (`tickets.setup_cents`, `bigint`) —, as duas por produto
  (`tickets.product_values` e `tickets.product_setup`, `{id do produto: centavos}`), a empresa que ainda não é
  cliente (`tickets.prospect`) e o motivo da perda (`tickets.lost_reason`). O fim (`closed_at`) é o dia em que a negociação acabou (num dia que já
  passou, ao meio-dia de Brasília). As contas do relatório moram no `@gestor/shared` (`vendas.ts`): o
  servidor e a prévia contam igual.
- **A prévia.** O painel **Comercial (COM)**, da Camila e do Diego, com 32 negociações de exemplo (as
  ganhas e as perdidas do último ano, uma ou mais por mês para os ganhos mês a mês, três delas no começo
  do mês passado para a comparação do Este mês, e o funil de agora) e a meta de R$ 4 mil por mês (as
  mensalidades, de R$ 180 a R$ 3 mil). Três têm o valor por produto (a Padaria Estrela, a Rede Farma Mais
  e as filiais do Bom Preço, com a ativação de cada produto), algumas têm a ativação de um valor só, e a
  da Padaria Estrela tem a proposta em PDF anexada, que abre sem baixar (decisão 0051). Algumas têm os campos do
  Comercial preenchidos (a origem, quem indicou, os contatos principais).

**Alternativas consideradas.**

- **Um painel de Gestão comum, com as etapas do comercial.** Era o mais simples (não precisava de nada
  novo), mas sem o valor e sem o Ganho e o Perdido não dá para saber quanto se vendeu nem bater a meta —
  e foi isso que o Luan marcou.
- **O relatório inteiro do Helena** (os vendedores, os motivos de perda, o tempo em cada etapa, os meses
  contra a meta, as maiores em aberto) e a **previsão de fechamento**: foram montados na primeira versão e
  saíram quando o Luan escolheu (*"nada muito complexo"*). Voltam, se a equipe pedir, como um patch.
- **Um item Vendas no menu** (a primeira versão): saiu, o Comercial é um painel como os outros.
- **Ganho e Perdido como uma marca do cartão** (e não como etapas): no Helena é assim, mas como etapas
  eles aparecem no quadro (as colunas somam o ganho e a perda), seguem as regras de etapa que o Gestor
  já tem (o que falta para entrar, o aviso, o arrastar) e o Reabrir funciona igual ao dos chamados.
