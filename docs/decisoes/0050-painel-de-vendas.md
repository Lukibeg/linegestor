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
em cada etapa, os meses e as maiores em aberto. Como o 2.0.1 não subiu, o painel entrou nele (a regra
do patch que ainda não subiu).

**Decisão.**

- **O tipo do painel.** Como no Helena, o painel é de **Gestão** (os chamados: prazos, níveis,
  problema) ou de **Vendas** (as negociações). O tipo é escolhido ao criar (Chamados › Ajustes ›
  Painéis › Novo painel: **Chamados (Gestão)** ou **Negociações (Vendas)**) e **não muda depois**: os
  dados de um e de outro são diferentes. O painel de Vendas é o painel dos chamados com o que é de
  venda — o quadro, a lista, a ficha, as anotações e o histórico, os avisos, os observadores, quem vê,
  o Esperar o cliente, o Agendar e os filhos e ligações são os mesmos. Não tem prazo, níveis,
  prioridade, problema, operadora nem o tempo gasto.
- **As etapas.** Vêm **Lead → Qualificação → Proposta enviada → Negociação → Ganho / Perdido**
  (até o print das colunas do Comercial do Helena, quando os nomes passam a ser os de lá). As finais
  são duas, **Ganho** e **Perdido**: o painel de Vendas tem uma de cada (o nome muda, a etapa não sai),
  nenhuma etapa Resolvido e nenhum nível. Dá para incluir etapas no funil, como em qualquer painel.
- **A negociação.** O que está sendo negociado (o título); a **empresa** — um cliente do cadastro ou
  uma que ainda não é (o nome escrito à mão; quando ela entra no cadastro, o **Virou cliente?** da
  ficha liga os dois); o contato e o WhatsApp; o **valor** (em R$); o **Sobre a negociação**; os
  produtos; quem cuida (o responsável); as etiquetas. A **Proposta enviada** pede o valor (a regra da
  etapa, que muda nos Ajustes como as outras).
- **Ganho e Perdido.** Na ficha, **Ganhou** e **Perdeu** (ou arrastar para a coluna no quadro, ou o
  Mover) abrem a janela: no Ganho, o valor fechado (se mudou, o valor da negociação muda junto e fica
  no histórico) e o dia em que fechou; no Perdido, **o motivo** (sempre: um da lista do painel, e o
  **Outro** pede para escrever) e o dia. O dia é hoje ou um que já passou (quem lança uma venda antiga
  marca o dia em que ela acabou de verdade). O motivo muda depois, na ficha. **Reabrir** volta a
  negociação para a etapa em que ela estava. O histórico e a auditoria falam de venda: *"criou a
  negociação em Lead"*, *"marcou como ganho (R$ 12.500,00), estava em Negociação"*, *"marcou como
  perdido: Preço (estava em Proposta enviada)"*.
- **Os Ajustes do painel.** Os **motivos de perda** (vêm Preço, Fechou com a concorrência, Sem retorno
  do cliente, Adiou a decisão, Sem orçamento, Não atende o que precisa e Outro; precisa de pelo menos
  um) e a **meta do mês** (em R$; vazia, sem meta).
- **A tela dos painéis.** O cartão do painel de Vendas mostra **Em negociação** (a soma do valor das
  abertas, e quantas), o **Ganho no mês** (e quantas ganhas e perdidas), **Sem dono**, **Minhas** e a
  **barra da meta** do mês. O botão **Relatório** fica ao lado de Configurar.
- **O quadro e a lista.** Cada coluna soma o valor das negociações dela; a de maior valor vem primeiro
  (a sem valor, no fim). O cartão mostra a empresa, o contato, o valor e quem cuida; o Ganho e o
  Perdido, com o dia. Na lista, o **Valor** fica no lugar da prioridade e do prazo, a ordem é pelo
  valor e **Ganhas e perdidas** fica no lugar de Resolvidos e Fechados. O **Exportar** leva o valor, o
  resultado e o motivo da perda.
- **O relatório.** No painel, ao lado de Quadro e Lista: **Relatório**. Só o que o Luan escolheu:
  **os números do período** — as **novas** (quantas entraram e quanto somam), as **ganhas** e as
  **perdidas** (quantas e quanto, pelo dia em que acabaram), a **taxa de conversão** (das que acabaram,
  quantas foram ganhas) e o **ticket médio** (o valor médio do que foi ganho) — e **o funil**: das que
  entraram no período, quantas chegaram a cada etapa (a etapa mais adiante por onde passaram; a ganha
  chegou ao fim), quantas se perderam em cada uma e quantas foram ganhas. O período: **Este mês**,
  **Mês passado**, **Este trimestre**, **Últimos 90 dias**, **Este ano** ou dois dias; fica no endereço
  (dá para mandar o link). A negociação que veio de outro painel conta de quando entrou neste.
- **O menu.** Quem vê um painel de Vendas ganha o item **Vendas** no alto do menu, logo depois do
  Calendário: abre o quadro do painel de Vendas, e as telas das negociações ficam com ele marcado.
- **A troca de painel.** A negociação só passa para **outro painel de Vendas** (e entra numa etapa do
  funil: o Ganho e o Perdido se marcam na janela deles); o chamado só para **outro de Gestão**. O caminho
  entre os dois é o **filho**: da negociação ganha, um filho no Suporte (a implantação); do chamado em
  que o cliente pediu um orçamento, um filho no Comercial. O filho fica ligado.
- **Permissões.** As dos chamados: ver, `support.read`; trabalhar (criar, mover, ganhar, perder),
  `tickets.work`; os painéis e os ajustes, `tickets.manage`.
- **O banco.** A migração `0018_vendas`: o tipo do painel (`ticket_panels.kind`, `gestao` ou `vendas`),
  o resultado da etapa final (`ticket_stages.outcome`, `ganho` ou `perdido`), e na negociação o valor em
  centavos (`tickets.value_cents`), a empresa que ainda não é cliente (`tickets.prospect`) e o motivo da
  perda (`tickets.lost_reason`). O fim (`closed_at`) é o dia em que a negociação acabou (num dia que já
  passou, ao meio-dia de Brasília). As contas do relatório moram no `@gestor/shared` (`vendas.ts`): o
  servidor e a prévia contam igual.
- **A prévia.** O painel **Comercial (COM)**, da Camila e do Diego, com 21 negociações de exemplo (as
  ganhas e as perdidas dos últimos meses e o funil de agora) e a meta de R$ 40 mil.

**Alternativas consideradas.**

- **Um painel de Gestão comum, com as etapas do comercial.** Era o mais simples (não precisava de nada
  novo), mas sem o valor e sem o Ganho e o Perdido não dá para saber quanto se vendeu nem bater a meta —
  e foi isso que o Luan marcou.
- **O relatório inteiro do Helena** (os vendedores, os motivos de perda, o tempo em cada etapa, os meses
  contra a meta, as maiores em aberto) e a **previsão de fechamento**: foram montados na primeira versão e
  saíram quando o Luan escolheu (*"nada muito complexo"*). Voltam, se a equipe pedir, como um patch.
- **Ganho e Perdido como uma marca do cartão** (e não como etapas): no Helena é assim, mas como etapas
  eles aparecem no quadro (as colunas somam o ganho e a perda), seguem as regras de etapa que o Gestor
  já tem (o que falta para entrar, o aviso, o arrastar) e o Reabrir funciona igual ao dos chamados.
