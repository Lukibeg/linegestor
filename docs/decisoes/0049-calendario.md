# 0049 — O calendário das equipes

**Contexto.** Em 16/10, com o 2.0.1 ainda sem subir, o Luan pediu: *"quero criar um módulo de
calendário, para eu poder controlar com minha equipe visitas, viradas de sistemas, virada para nuvem,
folgas, home offices, ações que temos que tomar durante o mês no cliente… tem que ser integrado com os
painéis, e tem que ter como filtrar: por exemplo, se eu só sou participante do painel do suporte, eu só
vou ver a do suporte; se eu sou do painel do adm, do suporte e do dev, eu vou ver atividades de datas de
todos; se eu sou do comercial, e assim por diante"*. Como o 2.0.1 não subiu, o calendário entrou nele (a
regra do patch que ainda não subiu).

**Decisão.**

- **Onde.** No menu, **Calendário** (`/calendario`), no alto, logo antes do grupo Suporte. Aparece para
  quem vê os chamados (`support.read`). Usa a largura toda da tela, como os chamados. A primeira versão
  ficava dentro do Suporte (Suporte › Calendário); na prévia, o Luan não achou (*"cadê, não tá na
  demo"*: o grupo fechado escondia o item) — e o calendário é de todas as equipes, o Comercial e o
  Administrativo também, não só do suporte. Foi para o alto do menu.
- **Quem vê: a regra dos painéis.** Cada evento é de **um ou mais painéis** (os dos chamados: as
  equipes), e quem vê o evento é quem vê **um dos painéis dele** — o "Quem vê" do painel (Painéis ›
  Ajustes › Painéis: "Todos que veem chamados" ou "Só as pessoas escolhidas"). Quem cuida dos chamados
  (`tickets.manage`, o Administrador) vê todos. O evento que a pessoa não vê não existe para ela (o
  servidor responde 404, como no chamado). Assim, a equipe do Comercial vira um painel "Comercial" com
  as pessoas dela, e o calendário de cada um mostra só as equipes de que ele participa.
- **Quem edita não mexe no que não vê.** Ao mudar um evento, os painéis que a pessoa não vê ficam como
  estavam (ela não tira o evento de uma equipe que não enxerga, nem põe numa). As **pessoas do evento**
  são as que veem um dos painéis escolhidos — quem não vê o painel nem saberia do evento; quem já estava
  e saiu da empresa continua no evento.
- **O evento.** Tipo; título (a janela sugere "Visita — Clínica Aurora", "Folga — Diego Farias", até a
  pessoa escrever o dela); painéis; pessoas; cliente; chamado ligado (pelo código, SUP-12: o cliente dele
  vem junto); o primeiro e o último dia (até 62 dias seguidos) e **dia inteiro** ou o horário (a hora de
  Brasília; a virada que entra na madrugada termina no dia seguinte); local; observação; situação:
  **Agendado**, **Feito** ou **Cancelado** (o cancelado continua no calendário, riscado; o filtro
  esconde). O dia do calendário é guardado sem fuso (AAAA-MM-DD).
- **Os tipos.** Vêm sete: **Visita**, **Virada de sistema**, **Virada para nuvem**, **Ação no cliente**,
  **Reunião**, **Folga** e **Home office**, cada um com uma cor (as mesmas das etiquetas). A folga e o
  home office são **da equipe** (falam de pessoas, não de um cliente): entram no **"Hoje, fora do
  escritório"**, e a janela pede primeiro as pessoas. Quem cuida dos chamados muda os tipos (o botão
  **Tipos**: o nome, a cor, se é da equipe, se está ativo, e inclui outros); o tipo que já tem evento não
  sai, desativa — os eventos dele continuam com o nome e a cor. Os tipos ficam nos ajustes
  (`settings.calendario`).
- **A tela.** **Mês**: a grade de segunda a domingo; cada dia mostra os eventos na cor do tipo (a hora na
  frente; o "Visita — " do título some, porque a cor já diz) e, passando de três, "+2 outros". O dia
  escolhido aparece ao lado (no celular, embaixo, e a grade mostra bolinhas). **Lista**: o mês dia a dia.
  Em cima, **quem está fora do escritório hoje**. Os filtros — os **painéis** (para quem vê mais de um),
  **Só os meus**, o **cliente**, a **busca** (título, cliente, local, observação, chamado e pessoas), os
  **tipos** (que são também a legenda das cores) e **Mostrar os cancelados** — ficam no endereço, como
  nos chamados (dá para mandar o link do jeito que está). Dois cliques num dia (ou o + dele) abrem um
  evento novo naquele dia.
- **A janela do evento.** Clicar abre o evento: quando, quem, o cliente (com o link da ficha), o chamado
  (abre a janela do chamado por cima), o local, a observação e **quem vê** (os painéis). Para quem
  trabalha nos chamados: **Feito**, **Cancelar o evento** (ou **Voltar a agendado**), **Duplicar** (um
  evento novo igual, para outro dia), **Editar** e **Excluir**. A janela mostra quantas pessoas vão ver o
  evento antes de salvar.
- **Ligado aos chamados.** Na ficha do chamado, o **Na agenda** mostra os eventos ligados a ele e o
  **Agendar** abre a janela já com o chamado, o cliente, o painel e o responsável. No **Meu dia**, o
  **Hoje na agenda** mostra o que está marcado para hoje nas equipes que a pessoa vê (os dela primeiro,
  com "com você") e quem está fora do escritório.
- **Permissões.** Ver: `support.read`. Criar, mudar, marcar como feito, cancelar e mandar para a lixeira:
  `tickets.work` (o Leitor só vê). Os tipos: `tickets.manage`.
- **Nada some.** Excluir manda para a lixeira (volta pela Administração › Lixeira, "Evento do
  calendário"). Toda mudança vai para a auditoria (`calendar_event`; os tipos, `settings`), com a frase
  do que mudou ("Pôs no calendário: …", "Mudou no calendário "…": Painéis, Quando", "Marcou como
  feito…").
- **O banco.** A tabela `calendar_events` (migração 0017): os painéis e as pessoas em listas, o cliente e
  o chamado ligados, os dias como texto e o índice pelo período. As regras moram em
  `packages/shared/src/calendario.ts` (o servidor e a prévia usam as mesmas).
- **Na prévia.** Para dar para ver a regra, a prévia ganhou dois painéis só das pessoas escolhidas: o
  **Administrativo** (a Marina e a Camila) e o **Comercial** (a Camila e o Diego). Entrando como cada um,
  o calendário muda; o Luan vê tudo.

**Fica para depois.** Repetir o evento (toda semana, todo mês); o lembrete no WhatsApp na véspera; levar
para o Google Agenda ou o Outlook (o arquivo .ics); a visão Semana e arrastar o evento na grade.

**Consequências.** O calendário depende dos painéis: para uma equipe ter o seu (o Comercial, o
Administrativo), cria-se o painel dela com "Só as pessoas escolhidas", mesmo que ela não use os
chamados. O menu ganha um item no alto (Calendário). O COMO-SUBIR do 2.0.1 roda a migração 0017.

## Revisto no 2.0.2 (20/10/2026): os lembretes, os painéis numa lista e sem o filtro de cliente

O Luan mandou três pedidos num documento (com prints). Dois são do calendário (o terceiro, o Meu dia no
menu, está na decisão 0048). Como o 2.0.2 não subiu, entraram nele:

- *"o nosso sistema de calendário tem que ter lembretes e avisos configuráveis, para eu alertar quando
  for acontecer algo e em quanto tempo antes"*;
- *"nessa parte aqui eu tenho que clicar em painéis e aparecer uma multisseleção para eu selecionar os
  que eu quero ver. N precisa de filtro por cliente"*.

**Decisão.**

- **Os lembretes do evento.** Na janela do evento, o grupo **Lembretes**: cada lembrete é "quanto tempo
  antes" (um número e a unidade: minutos, horas, dias ou semanas; **na hora** também vale), até **5 por
  evento** e até **4 semanas antes**. Também ali, **quem recebe**:
  - **As pessoas do evento**; num evento sem pessoas, recebe quem o pôs no calendário;
  - ou **Todos que veem o evento**.

  Nos dois casos, só recebe quem vê um dos painéis do evento (a regra de cima). A janela diz quantas
  pessoas vão receber. No evento do dia inteiro, a conta é a partir das **8h** do primeiro dia. O
  detalhe do evento mostra os lembretes ("1 dia antes e 1 hora antes · para as pessoas do evento").
- **Cada tipo traz os seus.** O evento novo já vem com os lembretes do tipo, e a pessoa muda no evento.
  Trocar o tipo troca os lembretes, a menos que a pessoa já tenha mexido neles. Os de fábrica:
  - Visita e Virada de sistema: 1 dia antes e 1 hora antes;
  - Virada para nuvem: 1 dia antes;
  - Ação no cliente: 1 hora antes;
  - Reunião: 15 minutos antes;
  - Folga e Home office: nenhum.

  Quem cuida dos chamados muda os de cada tipo no botão **Tipos** ("Lembretes: …"). A auditoria conta
  ("mudou os lembretes de Visita (2 dias antes)").
- **Como sai.** O relógio dos chamados, a cada minuto, manda o lembrete na hora, **uma vez**:
  - no **sininho** (com o ícone do calendário; o clique abre o calendário no dia, com o evento);
  - no **WhatsApp** de cada pessoa, pelo número da equipe.

  O aviso **"Lembrete de um evento do calendário"**, em Avisos e WhatsApp, decide os canais (de fábrica,
  os dois), e a mensagem do WhatsApp é a dele (decisão 0047, revisão do 2.0.2: as variáveis do evento).
  Com o sistema fora do ar na hora, o lembrete ainda sai até 3 horas depois (e nunca depois de o evento
  começar, menos o "na hora", que tem 5 minutos).
- **O que não lembra.**
  - O lembrete cuja hora já tinha passado quando o evento foi gravado não sai.
  - Mudar o dia ou a hora vale de novo: o lembrete é guardado pelo começo do evento.
  - O evento cancelado, o feito e o da lixeira não lembram, e nem o que passou enquanto estava na
    lixeira.
  - Mudar os lembretes aparece na auditoria do evento ("Lembretes").
- **O aviso de que o evento entrou (opcional).** O Luan, num comentário da prévia: *"quero tbm uma
  notificação de inclusão opcional, que vai notificar quando eu incluir uma agenda e tbm deve ter as
  opções de as pessoas do evento ou todos que veem o evento"* (li "agente" como "agenda": pôr um evento
  no calendário). No evento novo (e no Duplicar), o grupo **Avisar** tem a caixa **Avisar agora, ao pôr
  no calendário**, desmarcada de início. Marcada, aparecem as duas escolhas, **As pessoas do evento** ou
  **Todos que veem o evento**, e quantas pessoas vão receber.
  - O aviso sai na hora de salvar, no sininho (com o ícone de calendário com +; o clique abre o evento)
    e no WhatsApp.
  - **Quem pôs o evento não recebe**, como nos avisos dos chamados.
  - É um aviso próprio em Avisos e WhatsApp: **"Um evento entrou no calendário"**, ligado na tela e no
    WhatsApp de fábrica. Tem a mensagem dele: as variáveis do evento, mais `{quem}`, que é quem pôs.
  - No evento de vários dias, o aviso diz até quando: "…, até 25/10".
  - A auditoria do evento conta: *"… e avisou 2 pessoas (as pessoas do evento)"*. Se ninguém recebeu,
    diz *"pediu o aviso, mas não havia quem avisar"*.
  - Editar o evento não avisa. A caixa só aparece no evento novo.
- **Os painéis numa lista.** O filtro dos painéis virou o botão **Painéis**: ele abre a lista com uma
  caixa por painel, para marcar quantos quiser. O botão mostra quantos estão marcados ("Painéis (2)").
  Nenhum marcado, ou todos, mostra os eventos de todos (e a lista diz isso). O que foi marcado fica no
  endereço, como antes (`?painel=`).
- **Sem o filtro de cliente.** Saiu do calendário, como ele pediu. A busca continua achando pelo nome do
  cliente.
- **O banco.** Migração `0020_lembretes_do_calendario`:
  - em `calendar_events`, `reminders` (os minutos antes), `remind_who` (`pessoas` ou `paineis`) e
    `reminders_sent` (o que já saiu, ou foi pulado);
  - em `ticket_notifications`, `calendar_event_id` (o aviso do sininho que é de um evento, e não de um
    chamado).

  As regras moram em `packages/shared/src/calendario.ts` (`lembretesDevidos`, `lembretesAoGravar`,
  `quemRecebeOLembrete`, `textoDoLembrete`, `valoresDoLembrete`); o servidor manda pelo
  `mandarLembretes` (em `services/calendario.ts`).
- **Na prévia.** O exemplo **"Retorno — Clínica Aurora (o ramal da recepção)"** é sempre para daqui a
  pouco, com lembretes 2 horas antes e 15 minutos antes. O de 2 horas já chegou no sininho do Luan, e o
  relógio da prévia manda os outros enquanto a tela está aberta.

**Fica para depois**, do que estava acima: repetir o evento, o arquivo .ics e a visão Semana. O lembrete
no WhatsApp entrou.
