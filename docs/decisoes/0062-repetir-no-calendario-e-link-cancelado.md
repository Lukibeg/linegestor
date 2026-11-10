# 0062 — Repetir o evento no calendário, cancelar o link, os cancelados escondidos, a Classificação no menu de cima e o menu do Suporte

**Data:** 10/11/2026 · **Patch:** 2.4.6 · **Situação:** aceita · **Revê:** a 0049 (o calendário: "repetir o evento" estava em "fica para depois", e o cancelado aparecia riscado por padrão), a 0020 (os links de terceiros: o cancelado segue a mesma regra de exibição), a 0047 (os chamados: o botão Etiquetas da barra e a caixa das etiquetas embaixo, do 2.0.3), a 0048 (o menu com grupos: os Projetos no Suporte) e a 0055 (o Legado do Helena no menu)

## Os pedidos

O Luan, 10/11: *"quero q tenha um opção no agendamento se é recorrente diário semanal ou mensal para fixas nas agendas"* e
*"as vezes fazemos cancelamento de links quero que tenha uma opção de marcar como cancelado, onde ele é meio que excluído
porém fica um registro que ele foi na verdade cancelado"*. Depois de ver a prévia, no mesmo dia: *"veja se consegue melhorar
algo e os cancelados eu n quero q apareça, a n ser que eu marque alguma flag"*. E, com dois prints da ficha do chamado (o
cartão Classificação da lateral, com a Prioridade e as Etiquetas, e o botão Etiquetas da barra): *"essa parte de
classificação pode ficar apenas no menu de cima e a prioridade dentro, então vai deixar de ser etiquetas e vai ser
classificação"*. Depois: *"faça um botão dentro do inglinegestao para o painel do dev, dentro do menu suporte mesmo"*. E
por último: *"bote o projetos dentro de tecnico e tire o legado helena, o botão no caso, mas que ainda vou poder acessar
acessando o painel novo e clicando no botão que já existe"*.

## 1. Repetir o evento

1. **A série é uma regra, e cada data é um evento de verdade.** A tabela `calendar_series` (a migração 0034) guarda a
   frequência (`diaria`, `dias_uteis`, `semanal`, `mensal`), o dia de onde as datas saem (a âncora), até quando (nulo =
   sem data para acabar), até onde já gerou e o modelo das datas novas. Cada data é uma linha em `calendar_events`, com o
   `series_id`. Por isso o **Feito, o Cancelar, os lembretes, a busca, o "Hoje, fora do escritório" e a ficha do chamado
   continuam como estavam**: cada data é um evento.
   - Por que não guardar só a regra e montar as datas na hora de mostrar: o Feito e o Cancelar de uma data, os lembretes e a
     auditoria teriam de virar "exceções" da regra. Com o evento de verdade, nada disso muda.
2. **As frequências:** todo dia, todo dia útil (segunda a sexta — o pedido era diário, semanal e mensal; o dia útil foi
   escolha minha, porque o fixo do escritório raramente cai no sábado), toda semana (no mesmo dia da semana) e todo mês (no
   mesmo dia; no mês que não tem o dia 31, no último dia).
3. **Até quando:** uma data (até 2 anos depois do primeiro dia: gera tudo de uma vez) ou **sem data para acabar**: as datas
   vão sempre até **12 meses à frente**, e o relógio dos chamados (a cada minuto) estende um pouco por dia
   (`estenderRepeticoes`, antes dos lembretes).
4. **A duração cabe no intervalo:** o que se repete todo dia dura um dia só; toda semana, até 7 dias; todo mês, até 28.
5. **Mudar:** no evento que se repete, a janela pergunta **Só este** ou **Este e os próximos**. As contas do "este e os
   próximos" estão no `planoDosProximos` (`@gestor/shared`), o mesmo no servidor e na prévia:
   - *Só este*: só a data muda; a regra fica.
   - *Este e os próximos, com a mesma regra* (o mesmo dia, a mesma frequência e o mesmo fim — mudou a hora, o título, as
     pessoas…): cada data seguinte **fica no dia dela e com a situação dela**; só o resto muda.
   - *Este e os próximos, com outra regra*: a regra recomeça nesta data (o dia dela vira a âncora). **O feito e o cancelado
     ficam no dia deles** (são história: o cancelado era daquele dia, e o dia dele não ganha outra data); as agendadas andam
     para as datas novas, na ordem; as que sobram saem; os dias que faltam nascem.
   - *Este e os próximos, sem repetir*: as agendadas seguintes saem e a série para nesta data; o feito e o cancelado ficam.
   - **O que sai porque a regra mudou não vai para a lixeira** (`calendar_events.dropped_by_series`): ninguém excluiu, e a
     regra nova já tem as datas. Fica no banco (nada é apagado de verdade) e na auditoria ("parou de repetir: as 3 datas
     seguintes saíram"). Para desfazer, é só mudar a regra de novo.
   - O evento avulso passa a se repetir pelo Editar.
6. **Excluir:** *Só este*, ou *Este e os próximos* (vão juntos para a lixeira, e a repetição para antes dele). Na lixeira,
   as datas que foram juntas são **uma linha só** ("17 a 24/11 · Reunião (2 datas da repetição)"), e **restaurar traz todas
   e devolve a repetição como era** (o fim de antes fica em `calendar_series.undo`; sem data para acabar, ela volta a se
   estender sozinha) — se ninguém mudou a regra no meio.
7. **O Duplicar** faz um evento avulso. **O aviso de que o evento entrou** (2.0.2) sai uma vez, pela primeira data, e diz a
   regra: *"Luan França pôs no calendário: Alinhamento do suporte, segunda, 16/11, às 09:00 (toda segunda, sem data para
   acabar)"*. Na **ficha do chamado** ("Na agenda"), a repetição ocupa **uma linha só** — a próxima data, com "se repete ·
   mais N datas" (`umaDataPorSerie`).

## 2. Cancelar o link

1. **O circuito ganhou o cancelamento:** `circuits.cancelled_on` (o dia em que vale), `cancel_reason` (opcional),
   `cancelled_by_id` e `cancelled_at` (a migração 0034). Na ficha, **Cancelar o link** (quem edita, `records.write`) e
   **Reativar**.
2. **É história, não lixeira.** O link cancelado e os números dele **saem de todo lugar**: a lista de Circuitos, a
   Numeração, os cartões, o Painel (a ocupação, a contagem de DIDs e os alertas), as **Movimentações**, os seletores de
   circuito, o filtro de titular, **a ficha do cliente** (a aba DIDs e a contagem), **a lista de clientes** (a coluna DIDs),
   **o cartão da empresa no chamado** e **o tamanho do cliente nos relatórios dos chamados** — a condição é uma só no
   servidor (`foraDeLinkCancelado`, em `services/dids.ts`). Voltam com o interruptor **Mostrar cancelados**
   (`?cancelados=1`, que atravessa as abas Circuitos, Numeração e Movimentações), com a marca "cancelado em …"; com ele
   ligado, o filtro de circuito e o de titular também mostram o cancelado. A ficha do link continua inteira: a faixa do
   cancelamento (o dia, o motivo, quem e quando), os números e as movimentações.
3. **Os números ficam no link, como estavam** (com o cliente, o uso e a observação): são a história dele. Saem da ficha do
   cliente (ele já não tem esses números) — escolha minha; o contrário deixaria o cliente com números que não usa.
4. **O link cancelado não recebe números**: nem a faixa nova, nem o número que vem de outro circuito (pela linha, pela edição
   em massa ou pela planilha). Tirar um número dele para outro circuito pode (o número portado de volta, por exemplo).
5. **A exportação leva o cancelamento junto**: a dos circuitos ganhou `cancelado_em` e `motivo_cancelamento`; a dos DIDs,
   `link_cancelado_em` (a exportação é o dado inteiro, não a tela — sem a coluna, o número do link cancelado pareceria ativo
   na planilha).
6. **As Movimentações** ganham "Link cancelado" e "Link reativado", com o dia e o motivo no antes e no depois; a
   auditoria também. Cancelar duas vezes, ou reativar o que não está cancelado, é recusado. A frase não repete a palavra:
   "Cancelou o Link - Aurora", "Cancelou o link 071 Principal" (`oLink`).

## 3. Os cancelados só com a caixa marcada (revê a 0049)

O Luan, depois de ver a prévia: *"os cancelados eu n quero q apareça, a n ser que eu marque alguma flag"*.

- **No calendário**, o evento cancelado deixou de aparecer riscado por padrão (a 0049 dizia: "o cancelado continua no
  calendário, riscado; o filtro esconde" — o motivo era a equipe ver que a visita foi cancelada). Agora a caixa **Mostrar os
  cancelados** começa desmarcada e mora no endereço como `?cancelados=1`; marcada, o cancelado aparece riscado, como antes.
  O endereço antigo com `?cancelados=0` continua escondendo. Na ficha do chamado, "Na agenda" esconde o cancelado e oferece
  **Mostrar os cancelados (N)**.
- **Nos circuitos**, a mesma regra (a seção 2 acima): o link cancelado só aparece com **Mostrar cancelados**.
- Cancelar continua não apagando nada: o evento cancelado e o link cancelado ficam guardados, com quem e quando.

## 4. A Classificação no menu de cima da ficha do chamado (revê a 0047)

1. **O botão Etiquetas da barra virou Classificação.** Ele abre o mesmo painel de antes, agora com a **Prioridade** em cima
   (a sugerida, o "Usar a sugerida", a dica de cada uma e o "Trocada à mão", como estavam no cartão) e as **etiquetas**
   embaixo, com a busca, o criar e o editar. Trocar a prioridade continua gravando na hora, sem pedir motivo (2.2). O número
   ao lado do botão continua sendo o das etiquetas.
2. **O cartão Classificação saiu da coluna do lado para quem mexe no chamado** (o 2.0.3 dizia: "A caixa das etiquetas e o
   Na agenda continuam embaixo"; o Na agenda continua). O que sobra no cartão — o assunto, o tipo, a gravidade, o alcance,
   os produtos, as operadoras e os campos do painel sem grupo — ficou num cartão chamado **Detalhes**, o mesmo nome do
   cartão da negociação; no painel que não usa nenhum deles (o caso dos prints), o cartão some. Escolha minha: o pedido
   falava da prioridade e das etiquetas; o resto ficou na lateral porque é o que se lê de relance com o relato do lado, e o
   menu ficaria comprido demais. Os textos de Ajustes › Campos acompanharam ("Nos Detalhes (a lateral)", "abaixo dos
   Detalhes").
3. **Quem só lê** (sem a barra de ações) continua vendo a prioridade e as etiquetas no cartão Classificação, como vê o
   responsável e os observadores.
4. **Sem prioridade, o botão continua Etiquetas**: na negociação (Vendas) e no painel que desligou a Prioridade em Ajustes ›
   Campos. Nesses, as etiquetas também ficam só no botão (a caixa embaixo saiu para todo mundo que mexe).
5. **O aviso "falta: Prioridade"** leva ao botão Classificação e abre o menu; o botão fica com a borda de aviso enquanto a
   prioridade faltar para a próxima etapa.
6. **O Abrir chamado não mudou**: a prioridade e as etiquetas continuam no formulário. Sem migração e sem mudança no
   servidor.

## 5. O Painel do Dev no menu Suporte

1. **Suporte › Painel do Dev** (`/suporte/desenvolvimento`), logo abaixo do Painel da Implantação, abre o quadro do painel
   **Desenvolvimento** — o que veio com o sistema (`painel-desenvolvimento`, a sigla DEV), mesmo que o nome dele mude —, como
   o Painel do Suporte (2.0.2) e o da Implantação (0057, item 12). O mouse parado em cima já lê o quadro (como o do Suporte).
2. **Nas telas dele** (o quadro, a lista, os relatórios e a ficha de um chamado DEV), o item fica marcado e o grupo
   Suporte abre sozinho; o Painéis deixa de ficar marcado ali.
3. **O nome é o do pedido**, "Painel do Dev": "Painel do Desenvolvimento" ficava cortado no menu (o espaço é o do "Painel
   da Implantação"). A tela que abre continua dizendo o nome do painel (Desenvolvimento).
4. **Sem o painel** (desativado, ou a pessoa não está entre quem vê), a tela diz isso e leva para os Painéis, em vez de
   abrir um quadro vazio. O item aparece para todos que veem os chamados, como os outros atalhos do Suporte.

## 6. Os Projetos no Técnico e o Legado do Helena fora do menu (revê a 0048 e a 0055)

1. **Os Projetos foram para o Técnico**, depois do Inventário (`/projetos`, o mesmo endereço e a mesma permissão). Moravam
   no Suporte desde o 2.0 (o pedido de 13/10: *"esse pode ficar dentro de suporte também"*).
2. **O Legado do Helena saiu do menu.** O Luan pediu para continuar entrando pelo "botão que já existe": é o botão
   **Legado do Helena** no alto dos Relatórios do Suporte (Suporte › Relatórios, ou a vista Relatórios do painel Suporte),
   e a frase do subtítulo, que já levavam lá desde o 2.1. O endereço (`/chamados`) continua, e os links que já apontavam
   para lá (a ficha do cliente, o Envio automático) também.
3. **Nas telas do Legado, o menu marca os Relatórios** do Suporte (o grupo Suporte abre sozinho), para a pessoa não
   ficar sem nenhum item marcado e saber por onde voltou. As telas do Legado já têm o link para os Relatórios do Suporte.
4. **Os textos que diziam o caminho pelo menu** ("Suporte › Legado do Helena") passaram a dizer o botão: o aviso do
   Envio automático, o "ligar clientes" dos relatórios do Legado, o rodapé do relatório do mês e os guias.
5. O Suporte fica com **Painel do Suporte**, **Painel da Implantação**, **Painel do Dev**, **Meu dia** e **Relatórios**.

