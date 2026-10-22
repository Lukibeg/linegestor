# 0054 — Trazer do Helena: o painel de vendas, com o histórico

**Contexto.** Em 21/10, com o 2.0.2 publicado, o Luan pediu: *"agora eu quero q vc pegue tudo que já ta no
meu painel do helena e migre para o nosso, inclusive o histórico para que eu possa usar o relatório"* — e,
logo depois, *"n precisa dos comentários"*. O painel é o **Ingline - Comercial** do Helena (do tipo Vendas):
55 cards em 21/10 (21 em andamento, 21 ganhos, 13 perdidos), com as etapas de lá (StandBy, Lead Novo, …,
Cliente na base), os campos (o CNPJ, os serviços ofertados, a mensalidade e a ativação de cada produto, a
origem do lead…) e o histórico de cada card. Até aqui, o painel de Vendas do Gestor (2.0.1, decisão 0050)
nascia vazio, e o relatório do Comercial só teria números a partir da virada. Não revê a 0047: os chamados
do Suporte continuam começando do zero (SUP-1, "começar 2027 usando tudo novo"); o que vem é o painel de vendas.

O histórico foi conferido no próprio Helena (só olhando, em 21/10): a API v1 devolve, no card, as linhas
como o Helena escreve — *"Item criado por Luan França em Lead Novo"*, *"Item movido de A para B"*, *'Item
marcado como "Ganho"'*, *'Item estava marcado como "Ganho" e foi reaberto'*, *"Valor atribuído alterado de R$
400,00 para R$ 990,00"*, *"Título alterado de A para B"*, *"Descrição alterada"*, *"A etiqueta X foi
adicionada"*, *"Data de criação ajustada de … para …"*. Com as regras desta decisão rodando sobre os 55
cards de lá, o relatório do Gestor deu o mesmo que o do Helena: no período de 21/09 a 21/10, 1 ganha (R$ 990)
e 21 em andamento (R$ 28.495); e os ganhos mês a mês iguais ao gráfico *Meta vs Ganho mensal* de lá.

**Decisão.**

- **Onde.** Em **Administração › Importar / Exportar**, o cartão **Trazer do Helena**, de quem importa e
  cuida dos painéis (`data.import` e `tickets.manage`: o Trazer cria etapas, campos e o painel).
- **Como.** Três passos: escolher o painel de lá (os de vendas primeiro) e o painel de Vendas de cá (o que
  existe, ou **um painel de Vendas novo**); **ler o Helena**; conferir a **prévia** e **trazer**. A leitura usa
  a chave de API do LineChat que já está no cofre (a dos chamados): a lista dos cards pela API v2 (os campos
  com o nome das opções) e o histórico card a card pela v1. Ela roda por fora do pedido da tela, que mostra
  quantos já vieram, e fica guardada duas horas: o Trazer grava o que a prévia mostrou, sem ler de novo.
- **A prévia** mostra os números de agora (em andamento, ganhas, perdidas) e **os ganhos mês a mês pela
  Conclusão** — para comparar com o relatório do Helena antes de gravar —, as etapas, os campos, as pessoas,
  as empresas, os produtos, as etiquetas, os motivos de perda e o que fica de fora. Nada é gravado até o
  **Trazer**, que pede a confirmação com o número exato do que vai acontecer.
- **O painel novo** se chama Comercial e fica com a sigla do Helena (IC) quando ela está livre — o IC-34
  continua IC-34 —; nasce com os ajustes e os campos de fábrica do painel de Vendas (CNPJ, Contatos
  principais, Origem de lead, Indicação).
- **As etapas** ficam as do Helena, na ordem de lá; a inicial (Lead Novo) é a entrada, onde a negociação nova
  chega; o Ganho e o Perdido no fim. No painel que já existe, a etapa com o mesmo nome é a mesma (fica com as
  regras dela); a que tem negociações e não está no Helena fica; a vazia sai. A etapa que só o histórico cita
  (saiu do Helena) entra já fora do painel: a trajetória precisa dela. A etapa de lá que se chame como o Ganho
  ou o Perdido (não é o caso hoje) ganha " (Helena)" no nome, para não se confundir com as finais.
- **Cada card vira uma negociação**, com o número do Helena quando ele está livre no painel (senão, o próximo
  livre); o título (sem o "(Cópia)" que o Helena põe no card duplicado); o responsável e os observadores (a
  pessoa do Gestor com o mesmo nome; senão, com o mesmo primeiro nome, quando só há uma); a empresa (o
  cliente do cadastro pelo CNPJ do card ou pelo nome no título; senão, a empresa que ainda não é cliente); os
  produtos (os serviços ofertados e os que têm valor); as etiquetas (com a cor de lá, nas etiquetas do painel
  que recebe — cada painel tem as suas, a 0047 revista no 2.0.3); e os campos (a **Indicação** do Helena
  cai na lista da Indicação do Comercial, que ganha as opções que não tinha).
- **A mensalidade é o "Valor atribuído"** do card — é o número que o relatório do Helena soma, e assim o do
  Gestor fica igual. O **valor por produto** entra só quando os *"Valor Mensalidade <produto>"* somam
  exatamente o Valor atribuído; senão, fica o valor único, e os números de lá vão para o histórico. A
  **ativação** é a soma dos *"Valor Ativação <produto>"* (por produto quando todos estão no cadastro).
- **O ganho e a perda contam no dia da Conclusão** do Helena (o dia que a pessoa escolheu ao marcar, que pode
  ser antes do registro — o card duplicado de uma venda antiga). A perda leva o motivo de lá, e os motivos do
  Helena entram na lista do painel.
- **O histórico** do Helena vira o do Gestor: a criação (*"criou a negociação (Trazida do Helena, era IC-34)
  em Lead Novo"*), cada mudança de etapa, o ganho e a perda, a reabertura, a mensalidade e o título, com quem
  fez. O resto entra como está escrito lá (*"no Helena: A etiqueta P/R Ingline foi adicionada"*). No Helena, o
  card ganho continua andando pelas etapas; no Gestor, a negociação ganha fica no Ganho: a mudança de etapa
  depois do ganho fica no histórico (*"… (já estava ganha)"*), sem mexer na trajetória. Se o histórico não
  chega aonde o card está (faltou uma linha), o fim é completado pelo próprio card, e a prévia diz quantos.
- **Fica de fora**: as anotações e os anexos (*"n precisa dos comentários"*); a **Área de atuação** (a
  escolha de 17/10, nos campos do painel de Vendas); o campo que nenhum card usa; os cards **arquivados** (no
  Helena, não aparecem mais no quadro). Nada vai para os webhooks nem para os avisos: são as negociações de
  antes, não novidades.
- **De novo, até a virada.** A negociação guarda o card de lá (`tickets.external_ref`, *"helena:<id>"*): ao
  trazer de novo, ela é atualizada — fica como está no Helena, e o histórico que veio de lá é refeito; o que a
  equipe fez no Gestor fica no histórico, e a prévia avisa quantas foram mexidas. A que foi para a lixeira do
  Gestor fica lá. O que é novo no Helena entra.
- **Sem o histórico.** Se a chave não lê o card (o histórico), a leitura acaba assim mesmo: a negociação nasce
  na etapa de agora e acaba na Conclusão, e a prévia diz quantas e por quê. Se os cinco primeiros cards não
  vêm, a leitura não pede mais (a chave não lê). **Corrigido no 2.0.4** (22/10, o primeiro uso no ar): o
  LineChat recusava o pedido do card (500, *"The value 'Logs,Key,ResultDescription,Step' is not valid"*) porque
  a vírgula ia escrita como `%2C`; o Helena manda a vírgula como vírgula (`includeDetails=Logs,Notes,…`,
  conferido na tela do card). O Gestor passou a mandar igual, e o Helena falso dos testes recusa o `%2C`, como o
  de verdade. Sem o histórico, a Conclusão também não vinha, e os ganhos caíam nos meses errados.
  **Revisto no 2.0.4.1** (22/10, à tarde): com o 2.0.4 no ar, o Luan trouxe de novo e os ganhos mês a mês
  continuaram quase todos em setembro (o Gestor: jul R$ 990, ago R$ 4.640, set R$ 21.541,80, out R$ 990; o
  Helena: fev R$ 3.190, abr R$ 2.739,80, mai R$ 3.578,80, jun R$ 2.990, jul R$ 3.440, ago R$ 4.640, set
  R$ 6.593,20, out R$ 990) — os totais certos (R$ 28.161,80 em 21). A vírgula não era a causa: o próprio
  erro do 2.0.3 já mostrava a lista com vírgulas (o LineChat lê o `%2C` como vírgula), e a lista numa linha só é,
  para ele, **um valor só** que ele não conhece. O LineChat valida cada valor de `IncludeDetails` (500
  `FORM_ERROR`, *"The value 'X' is not valid"*, como num outro sistema que usa a mesma API) e quer **um detalhe
  por parâmetro** — o jeito da lista dos cards e do painel, que o Gestor já pedia assim e funcionam no ar. O
  card agora vai com `IncludeDetails=Logs&IncludeDetails=ResultDescription` (a chave, a etapa e os campos já
  vêm na lista); o detalhe que o LineChat recusar sai do pedido (a prévia diz qual) e, no último caso, o card
  vai sem detalhe nenhum — sem o histórico, mas com a Conclusão. A prévia avisa quando uma ganha ou perdida vem
  sem a Conclusão (o gráfico do mês a mês não bateria), e, sem ela, o ganho fica no dia em que foi marcado no
  histórico, não na última mudança do card. O Helena falso dos testes valida como o de verdade: o pedido do
  2.0.3 e o do 2.0.4 levam o mesmo 500 que se viu no ar.
- **Auditoria.** O Trazer vai para a auditoria (`import`, no painel): *"Trouxe do Helena o painel Ingline -
  Comercial para o painel novo Comercial (IC): 55 negociações (55 novas)"*, com as etapas, os campos criados,
  os motivos novos e os avisos.

**Escolhas que fiz (a regra dele: escolher e dizer por quê).**

- A mensalidade é o Valor atribuído, e não a soma por produto: em 9 dos 55 cards as duas não batem, e o
  relatório do Helena soma o Valor atribuído. Assim os números batem com os dele no dia da virada.
- O "(Cópia)" sai do título: é a marca do card duplicado no Helena, não parte do nome.
- O painel novo fica com a sigla IC: os códigos que a equipe já conhece (IC-34) continuam valendo.
- Uma negociação por card, mesmo trazendo de novo: o card de lá fica guardado na negociação.

**Arquivos.** As regras: `packages/shared/src/helena.ts` (o histórico, os valores, os campos, as pessoas, as
etapas, o plano e a prévia). O servidor: `apps/api/src/services/helena.ts` e `routes/helena.ts`
(`/api/comercial/helena`); a leitura do card com o histórico em `services/linechat.ts`. A tela:
`apps/web/src/pages/dados/TrazerDoHelena.tsx`. A prévia clicável: `apps/web/src/api/demo-helena.ts` (um
Helena de exemplo). A migração: `0024_trazer_do_helena.sql` (a coluna `tickets.external_ref`, única).
