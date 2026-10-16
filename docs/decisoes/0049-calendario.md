# 0049 — O calendário das equipes

**Contexto.** Em 16/10, com o 2.0.1 ainda sem subir, o Luan pediu: *"quero criar um módulo de
calendário, para eu poder controlar com minha equipe visitas, viradas de sistemas, virada para nuvem,
folgas, home offices, ações que temos que tomar durante o mês no cliente… tem que ser integrado com os
painéis, e tem que ter como filtrar: por exemplo, se eu só sou participante do painel do suporte, eu só
vou ver a do suporte; se eu sou do painel do adm, do suporte e do dev, eu vou ver atividades de datas de
todos; se eu sou do comercial, e assim por diante"*. Como o 2.0.1 não subiu, o calendário entrou nele (a
regra do patch que ainda não subiu).

**Decisão.**

- **Onde.** No menu, **Suporte › Calendário** (`/calendario`), entre os Chamados e os Projetos. Aparece
  para quem vê os chamados (`support.read`). Usa a largura toda da tela, como os chamados.
- **Quem vê: a regra dos painéis.** Cada evento é de **um ou mais painéis** (os dos chamados: as
  equipes), e quem vê o evento é quem vê **um dos painéis dele** — o "Quem vê" do painel (Chamados ›
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
chamados. O menu Suporte passa a ter quatro itens. O COMO-SUBIR do 2.0.1 roda a migração 0017.
