# 0055 — Os Relatórios dos painéis de chamados (o módulo novo) e o Legado do Helena

**Contexto.** Em 22/10 o Luan contou que vai deixar de usar o Helena (o LineChat) como CRM: na virada,
**01/11/2026**, só vai para o Gestor o que estiver aberto, sem o histórico, e o Helena deixa de ser
alimentado. Os assuntos mudaram por completo (e muita coisa antiga está sem assunto), então ele não quer
mapear os assuntos de lá para os de cá: a ideia dele foi ter **dois módulos de relatórios separados**, o
**legado** (o Helena, como está) e o **novo** (os chamados do Gestor, com os assuntos novos). A proposta,
com o mockup das quatro telas, está em `claude/relatorios-novo-e-legado-proposta.md` (no projeto). A
resposta, no mesmo dia: *"pode fazer e colocar na demo pra seguirmos mas por enquanto n vamos migrar"*.

Não é só o assunto que muda: no Helena o tempo era em horas corridas (agora é em horas úteis, com a pausa
esperando o cliente), a primeira resposta era "saiu de Novos Suporte", o "fechado" era chegar no Tratado
ou no Validado (agora é o Resolvido, e o Fechado vem sozinho depois) e o nível era etiqueta (agora é a
etapa, com o motivo de cada subida). Juntar os dois daria números com cara de comparáveis que não são.

Isto **revê a 0047** num ponto: *"Ficaram para depois do 2.0: os 20 relatórios e o envio diário lendo os
chamados novos"*. Os chamados novos ganham um **módulo de relatórios próprio** (não os 20 de antes lendo
outra base), e os 20 do 1.7 ficam como estão, sobre a cópia do LineChat, com o nome **Legado do Helena**.
O envio diário continua lendo a cópia do LineChat até a virada (abaixo).

**Decisão.**

- **Onde.** A vista **Relatórios** de cada painel de Gestão — **Quadro · Lista · Relatórios**, a mesma
  troca do Relatório do Comercial (0050), em `/atendimento/relatorio?painel=…`. Vale para o Suporte, o
  Desenvolvimento e os painéis que a equipe criar; o painel de Vendas continua com o relatório dele. No
  menu, **Suporte › Relatórios** abre a do painel Suporte (`/suporte/relatorios`), e os relatórios do
  Helena viram **Suporte › Legado do Helena** (as telas de `/chamados`, sem mudar as contas: só o nome e o
  link para os novos). Nos Relatórios do Suporte, o botão **Legado do Helena** e a frase do subtítulo
  levam aos antigos.
- **Quem vê.** Quem vê os chamados (`support.read` ou `sales.read`) e o painel (a regra dos painéis de
  quem só os escolhidos veem). O **Organizar** é de quem cuida dos chamados (`tickets.manage`).
- **Os 25 relatórios, em seis abas**, com a aba **Favoritos** antes delas. Os 20 do Helena, adaptados, e
  cinco novos (marcados "novo"), que o Helena não deixava fazer:
  - **Tempo:** Prazo cumprido (resposta e solução, por prioridade), Relógio do chamado (separar por
    assunto, prioridade, tipo, gravidade, responsável ou cliente), Primeira resposta, A escada N1 → N2 →
    N3 → DEV (com as voltas de nível e os motivos de subir), Onde o chamado empaca, A prioridade faz
    diferença? e **Esperando a operadora** (novo).
  - **Volume:** Entrada × saída (com a fila no fim de cada semana), Idade da fila, Mapa de calor da
    semana, Dias fora da curva e Previsão da semana.
  - **Assuntos:** **Os assuntos** (novo: a árvore do painel, clicando para descer — faz o papel dos grupos
    montados à mão do Helena), Sobe e desce dos assuntos (no 1º, 2º ou 3º nível), Os poucos que pesam muito
    (o 80/20, por assunto, cliente, produto, operadora ou tipo), **Onde está a gravidade** (novo: assunto ×
    gravidade) e **Os problemas** (novo: os problemas abertos e os incidentes de cada um).
  - **Clientes:** Raio-X do cliente, Chamados pelo tamanho do cliente, Voltou com o mesmo problema e De
    quem é a falha?
  - **Equipe:** Quadro da equipe, **Tempo gasto** (novo: o tempo lançado na ficha) e Chamado bem preenchido.
  - **Mês:** Fechamento do mês.
- **O que vale para todos.** Tempo é **mediana**, não média (um chamado esquecido 40 dias esconderia o
  normal); "9 em 10" é o percentil 90. Tempo é em **horas úteis**, pelo horário de atendimento e os
  feriados de Painéis › Ajustes › Prazos (o mesmo relógio dos prazos), e um "dia" é um dia de atendimento.
  O chamado conta como resolvido no **Resolvido**. **O problema (ITIL) não é chamado de cliente**: fica
  fora das contas de volume e de tempo e tem o relatório dele. Dia e hora são os de Brasília.
- **O período e os filtros.** O padrão é **30 dias** até hoje; os atalhos (7 dias, 30 dias, Este mês,
  Mês passado, 90 dias, 12 meses, Tudo) e as datas; até 5 anos. A comparação é com o período anterior do
  mesmo tamanho. Os filtros: o assunto (com os de baixo), o tipo, a gravidade, a prioridade (e "sem
  prioridade"), **"Subiu até o nível"**, o responsável (e "sem dono"), o cliente, o produto, a operadora,
  a etiqueta e cada campo de lista do painel (e "não preenchido"). Tudo fica no endereço (dá para mandar o
  link do jeito que está).
- **Clicar mostra os chamados.** Cada número, faixa, degrau, célula e barra abre a janela com os chamados
  por trás dele. A lista vem junto com os números (cada peça leva os ids; a resposta leva a linha curta de
  cada chamado citado): a janela abre na hora e é a mesma conta do número.
- **O painel que não usa não vê.** O relatório que precisa do que o painel não usa não aparece: sem prazo,
  o Prazo cumprido; sem assunto, Os assuntos e o Sobe e desce; sem gravidade (ou sem assunto), Onde está a
  gravidade; **sem etapa de nível, a escada** (seria "100% no N1"; a etapa de nível que saiu do painel
  ainda conta); sem operadora, Esperando a operadora. O Organizar diz por quê.
- **O Organizar** é por painel e vale para a equipe toda: a ordem dentro de cada aba (a aba de cada
  relatório é fixa), esconder, a estrela dos **Favoritos** (na ordem escolhida) e o campo de onde sai o
  "De quem é a falha?". Nada muda antes do **Salvar para todos**; **Voltar ao padrão** volta a ordem de
  fábrica e mostra todos de novo (os favoritos ficam). Fica nos Ajustes (`atendimento-relatorios`), e vai
  para a auditoria: *"Luan França arrumou os Relatórios do painel Suporte para a equipe (24 à vista, 1
  escondido, 2 favoritos; a falha sai do campo Responsabilidade)"*.
- **Na tela larga**, os relatórios de meia largura andam em dupla; o que precisa de espaço (a árvore, o
  mapa de calor, a gravidade, o tamanho do cliente, o voltou, a equipe, o tempo gasto, o bem preenchido, o
  fechamento) ocupa a linha toda, e o de meia largura que ficou sem par também. No celular, um embaixo do
  outro, e as tabelas mostram só o número (sem a barra).

**As contas de cada um (as que precisaram de escolha).**

- **A escada** usa o nível mais alto por onde o chamado passou (da trajetória). Quem resolve sem passar
  por etapa de nível (direto da entrada) conta no N1. O DEV aparece quando alguém chegou lá ou o painel tem
  a etapa. As voltas de nível e os motivos de subir são do período.
- **A prioridade faz diferença?** "Sim" quando, entre as prioridades com 3 resolvidos ou mais, cada uma é
  mais rápida que a de baixo; com menos, a linha fica cinza e fora da comparação.
- **Esperando a operadora**: o tempo até resolver dos resolvidos no período que tiveram a operadora no
  meio (o protocolo ou a marca Esperando a operadora), dividido em a equipe trabalhando, esperando a
  operadora e esperando o cliente. Na tabela, os protocolos abertos no período, os abertos agora (de
  qualquer data) e, dos fechados no período, quantos a operadora entregou até o prometido. "Vivo" e "VIVO"
  são uma só.
- **Dias fora da curva**: o normal de um dia é a mediana do mesmo dia da semana nas 8 semanas de antes
  (com 2 ou mais); fora da curva é chegar pelo menos 5, o dobro do normal e 5 a mais que ele.
- **Previsão da semana**: cada dia da próxima semana é a média do mesmo dia nas até 8 semanas completas de
  antes, com o menor e o maior; não usa o período escolhido.
- **Voltou com o mesmo problema**: o mesmo cliente com o mesmo assunto (o de baixo, inteiro) de novo em até
  30 dias; a volta conta no período em que aconteceu. Junto, os ligados como "repete" e os reabertos.
- **De quem é a falha?** sai de um campo de lista do painel — o escolhido no Organizar ou, sem escolha, o
  primeiro com "respons", "falha" ou "culpa" no nome (no Suporte, a **Responsabilidade**). Conta os
  **resolvidos** no período (o campo costuma ser pedido no Resolvido: contar os que chegaram poria os ainda
  abertos como "sem resposta"); os 6 meses, pelo mês em que foram resolvidos.
- **Tamanho do cliente**: os chamados que chegaram a cada 10 DIDs e a cada 10 aparelhos que o cliente tem
  no Gestor (os vendidos não contam, como na ficha).
- **Chamado bem preenchido**: os resolvidos com o assunto, o tipo, a gravidade e os produtos (os que o
  painel usa), a causa e a solução.
- **Tempo gasto**: o "Registrar o tempo" da ficha, pelo dia do trabalho, em horas de relógio — o tempo de
  mão na massa, diferente do relógio do chamado.
- **Quadro da equipe**: em aberto, vencidos e parados (7 dias sem atividade) são de agora; resolvidos, a
  mediana e o "escalonou" (as subidas que a pessoa fez) são do período; a linha das 8 semanas.
- **Fechamento do mês**: o mês inteiro (o padrão é o mês passado) contra o anterior, com os destaques em
  frases, o dia a dia e os assuntos, clientes e tipos que mais apareceram. Não usa o período lá de cima.

**A prévia.** Para os relatórios terem o que mostrar, o painel Suporte da prévia ganhou **uns cinco meses
de chamados de antes** (`demo-atendimento-historico.ts`): cerca de 400, sempre os mesmos, com os assuntos,
os clientes, os ritmos de cada prioridade, as subidas com o motivo, as voltas, a operadora, a espera pelo
cliente, o tempo lançado, a Responsabilidade, os reabertos e os "repete" — dois dias de pico (a queda de uma
operadora e o certificado vencido). Eles **vivem pelas regras de sempre** (abrir, assumir, mover, esperar,
resolver e fechar sozinho), misturados com os exemplos na ordem de chegada, e nascem todos fechados, sem
aviso no sininho.

**O que fica para a virada ("por enquanto n vamos migrar").** Nada disto foi feito neste patch:

- trazer os chamados **abertos** do Helena para o Suporte (o Trazer do Helena da 0054 é dos painéis de
  Vendas; o do Suporte traria só os abertos, sem o histórico, com o código IS guardado);
- **congelar** o legado em 31/10, 23:59 (a sincronização desligada, para arquivar ou apagar no Helena não
  mexer nos números antigos) e ajustar a tela dele (o chip "congelado", sem a aba Hoje, os atalhos presos
  no fim);
- **o envio diário lendo os chamados novos** — até lá, o PDF continua com os gráficos marcados no Legado
  do Helena (por isso o Organizar do módulo novo ainda não tem o aviãozinho);
- a ficha do cliente com os chamados do Gestor e, embaixo, os do Helena.

**Escolhas que fiz (a regra dele: escolher e dizer por quê).**

- **Por painel, não um relatório só.** Cada painel tem os seus (o Desenvolvimento também), com a
  arrumação dele: os painéis têm etapas, campos e assuntos diferentes.
- **A falha pelos resolvidos**, e não pelos que chegaram (acima).
- **A escada some do painel sem nível**, em vez de mostrar "100% no N1".
- **O nome Legado do Helena** para os relatórios antigos, no menu e na tela (era "Tickets do LineChat"):
  é o que a equipe vai procurar depois da virada; a tela continua dizendo que é a cópia do LineChat.
- **O Fechamento do mês não usa o período**: é o mês inteiro, escolhido no próprio relatório (na aba Mês, o
  lugar do período explica isso).

**Arquivos.** As contas: `packages/shared/src/atendimento-relatorios.ts` (o catálogo, a arrumação, o
filtro, a base e os 25 relatórios; os testes ao lado). O servidor: `apps/api/src/services/atendimento/
relatorios.ts` e as rotas `GET /api/atendimento/relatorios`, `GET` e `PUT /api/atendimento/relatorios/
arrumacao` (`routes/atendimento.ts`); o assunto `atendimento-relatorios` nos Ajustes
(`services/integracoes.ts`). A tela: `apps/web/src/pages/atendimento/relatorios/` (`index.tsx`, as peças e
uma página por aba), ligada em `Relatorio.tsx`; o menu em `AppShell.tsx`. A prévia:
`apps/web/src/api/demo-atendimento.ts` e `demo-atendimento-historico.ts`. Sem migração.

## O número do patch (23/10/2026)

Os Relatórios foram feitos como **2.0.5**; a correção do Trazer do Helena, os pedidos de 23/10, o botão da NIA e a
conversa do chamado ativo, como **2.0.4.1** (para poder subir antes). Em 23/10 o Luan pediu *"eu quero subir como 2.1"*:
os dois sobem juntos como **2.1** (a branch `patch-2.1-2026-10-23`, com uma nota só). Os commits de antes continuam com o
nome de quando foram feitos ("Patch 2.0.4.1: …", "Patch 2.0.5: …"); o texto, os comentários e as notas dizem 2.1.

**Revista no 2.2** (28/10, na prévia, comentando a tela do Legado com os gráficos de pizza: *"eu quero esse tipo de kpi tbm
para os relatórios new facilita o entendimento esses graficos de pizza"*, e depois: *"eu preciso desse tipo de kpi mais
simples para os novos relatórios tbm, faça igual ao legado, coloque esse como principal e todos os outros vão entrar como
'relatórios' basicamente pode seguir o mesmo modelo de construção do legado, mas com os kpis e relatórios atualizados aos
campos novos claro"*): a vista Relatórios de cada painel ganhou, em cima, as três partes do Legado — **Hoje · Período ·
Relatórios**. Hoje é a que abre.

- **Hoje e Período (a Visão geral)**: a tela do Legado, lendo os chamados do Gestor. Os quatro números de cima (no Hoje:
  Chegaram hoje, Resolvidos hoje, Em aberto agora e Prazo vencido; no Período: Chegaram, Resolvidos, Ainda em aberto e
  Prazo vencido; com o **só em aberto**, os em aberto, os vencidos, os parados há 7 dias e os sem responsável), os
  chamados no tempo (por hora; no Período, por dia até 3 meses e por mês acima disso), os gráficos de **pizza ou barras**
  e a tabela dos chamados, de 50 em 50. Os gráficos, dos campos de cá: a etapa (na ordem do quadro), o responsável, o
  **assunto** (o caminho inteiro; o **Agrupar** junta pelas pastas do 1º nível da árvore, e abre agrupado), o cliente, o
  tipo, a gravidade, a prioridade, os produtos, as operadoras, as etiquetas, **como o chamado chegou** (o canal: o robô do
  LineChat, o botão na conversa, aberto no Gestor…) e cada campo de lista do painel (como a Responsabilidade). O que o
  painel não usa não aparece.
- **Clicar filtra a tela toda**, como no Legado: a fatia, a barra, a coluna do tempo ou o número; o gráfico clicado
  continua inteiro, com o escolhido em destaque; clicar de novo desfaz. Diferente do Legado, cada filtro é de um valor só
  (sem o Ctrl+clique): são os mesmos filtros dos Relatórios, no mesmo endereço, e o que se escolhe na Visão vai junto
  para os 25. O "não preenchido" também se clica (sem assunto, sem dono, o campo vazio). "Resolvidos" troca a régua para o
  dia em que o chamado foi resolvido.
- **O que muda de régua**: o "fechado" do Legado é o **Resolvido**; o vencido é o **prazo** do painel (a resposta ou a
  solução vencida, em horas úteis), e o painel que não conta prazo mostra, no lugar, os sem responsável (ou os parados);
  o problema (ITIL) fica de fora, como nos 25.
- **Organizar**: na Visão, o mesmo do Legado (arrastar ou as setas, metade ou a linha inteira, esconder, pizza ou
  barras e, no assunto, abrir agrupado), para a equipe toda, guardado junto com a arrumação dos 25 do painel (`visao`, em
  `settings.atendimento-relatorios`); salvar os 25 sem mandar a Visão não a apaga. Sem o botão Grupos: as pastas do
  assunto já são os grupos. Sem o aviãozinho: o envio diário continua lendo o Legado até a virada.
- **Relatórios**: os 25, nas seis abas e nos Favoritos, como estavam; o endereço antigo (com a aba) continua abrindo lá.

As contas em `packages/shared/src/atendimento-visao.ts` (`visaoDoPainel`, as mesmas no servidor e na prévia), a rota
`GET /api/atendimento/relatorios/visao` e a tela em `apps/web/src/pages/atendimento/relatorios/visao.tsx`, com as peças
dos gráficos do Legado.
