# Calendário das equipes (Patch 2.0.1; os lembretes, no 2.0.2)

As visitas, as viradas de sistema e para a nuvem, as folgas, os home offices, as reuniões e as ações no
cliente, no mês. Fica no menu lateral, em **Calendário** (logo acima do Suporte).

## Quem vê o quê

Cada evento é de **um ou mais painéis** (os mesmos dos chamados), e quem vê o evento é quem vê o painel.

- Quem é só do **Suporte** vê os eventos do Suporte.
- Quem é do **Administrativo**, do **Suporte** e do **Desenvolvimento** vê os três.
- Quem cuida dos chamados (o Administrador) vê todos.

O "quem é de qual painel" é o **Quem vê** do painel, em Painéis › Ajustes › Painéis: **Todos que veem
chamados** ou **Só as pessoas escolhidas**. Para uma equipe ter o seu calendário (o Comercial, por
exemplo), crie o painel dela com **Só as pessoas escolhidas** e marque as pessoas — mesmo que ela não
use os chamados.

## Olhar o mês

- **Mês** mostra a grade, de segunda a domingo, com cada evento na cor do tipo. Clique num dia para ver
  a lista dele ao lado (no celular, embaixo). Passando de três eventos, o dia mostra "+2 outros".
- **Lista** mostra o mês dia a dia, com tudo escrito.
- As setas trocam o mês; **Hoje** volta para o mês de hoje.
- Em cima, **Hoje, fora do escritório** mostra quem está de folga e em home office hoje.

### Filtrar

- **Painéis**: o botão abre a lista dos painéis; marque os que quer ver (um, dois, quantos quiser). O
  botão mostra quantos estão marcados. Nenhum marcado (ou todos) mostra os eventos de todos.
- **Só os meus**: os eventos de que você participa.
- A **busca** acha o título, o cliente, o local, a observação, o chamado e as pessoas. (O filtro de
  cliente saiu no 2.0.2: para achar os eventos de um cliente, escreva o nome dele na busca.)
- **Os tipos** (Visita, Folga…) são também a legenda das cores: um clique mostra só aquele tipo.
- **Mostrar os cancelados**: desmarcado, os cancelados somem.

Os filtros ficam no endereço da página: dá para mandar o link do jeito que está. No celular, eles ficam
atrás do botão **Filtros**.

## Pôr um evento no calendário

1. Clique em **Novo evento** (ou dois cliques num dia da grade, ou o **+** do dia).
2. Escolha o **tipo**. O **título** vem sugerido ("Visita — Clínica Aurora") e acompanha o cliente e as
   pessoas até você escrever o seu.
3. **Quando**: o primeiro e o último dia, e **Dia inteiro** ou a hora de começar e de terminar (hora de
   Brasília). A virada que entra na madrugada termina no dia seguinte.
4. **Painéis**: é o painel que diz quem vê o evento. Embaixo aparece quantas pessoas vão ver.
5. **Pessoas**: só aparecem as que veem um dos painéis escolhidos.
6. **Cliente**, **Chamado ligado** (o código, como SUP-12: o cliente dele vem junto), **Local** e
   **Observação**, se quiser.
7. **Lembretes**: já vêm os do tipo (abaixo). Mude se quiser e escolha quem recebe.
8. **Pôr no calendário**.

A folga e o home office (os tipos "da equipe") pedem as pessoas e não mostram o cliente nem o local.

## Os lembretes

Cada evento lembra antes de acontecer, no **sininho** e no **WhatsApp** de quem recebe.

- **Quanto tempo antes**: escreva o número, escolha minutos, horas, dias ou semanas e clique em
  **Incluir**. Dá para ter até 5 lembretes por evento, de **na hora** (0 minuto) até 4 semanas antes. O
  **×** do lembrete tira.
- **Quem recebe**:
  - **As pessoas do evento**. Sem pessoas, recebe quem pôs o evento.
  - **Todos que veem o evento**: quem vê um dos painéis dele.

  Embaixo aparece quantas pessoas vão receber.
- No evento do **dia inteiro**, a conta é a partir das **8h** do primeiro dia: "1 dia antes" chega às 8h
  da véspera.
- Cada **tipo** já traz os seus:
  - Visita e Virada de sistema: 1 dia antes e 1 hora antes;
  - Virada para nuvem: 1 dia antes;
  - Ação no cliente: 1 hora antes;
  - Reunião: 15 minutos antes;
  - Folga e Home office: nenhum.

  Trocar o tipo troca os lembretes, se você ainda não mexeu neles.
- O lembrete sai **uma vez**. Se a hora dele já passou quando você salvou o evento, ele não sai. Mudar o
  dia ou a hora faz os lembretes valerem de novo. O evento cancelado, o feito e o da lixeira não lembram.
- No sininho, o lembrete tem o ícone do calendário: o clique abre o calendário no dia, com o evento
  aberto.
- O **WhatsApp** sai para quem tem o número em Administração › Usuários. Em Painéis › Ajustes › Avisos e
  WhatsApp, o aviso **"Lembrete de um evento do calendário"** liga e desliga a tela e o WhatsApp, e o
  cartão **A mensagem de cada aviso no WhatsApp** muda o texto (as variáveis do evento: `{evento}`,
  `{quando}`, `{local}`, `{cliente}`, `{chamado}`, `{pessoas}`, `{paineis}`, `{observacao}`, `{link}`…).

## Pelo chamado

Na ficha do chamado, o **Na agenda** mostra as visitas e viradas ligadas a ele. O **Agendar** abre a
janela já com o chamado, o cliente, o painel e o responsável: escolha o tipo e o dia.

No **Meu dia**, o **Hoje na agenda** mostra o que está marcado para hoje (os seus primeiro, com "com
você") e quem está fora do escritório.

## Depois

Clique no evento para abrir:

- **Feito** quando aconteceu; **Cancelar o evento** quando não vai acontecer (ele fica riscado no
  calendário); **Voltar a agendado** desfaz.
- **Editar** muda tudo. Os painéis que você não vê ficam como estavam.
- **Duplicar** abre um evento novo igual, para você trocar o dia.
- **Excluir** manda para a lixeira. Ele volta pela Administração › Lixeira (Evento do calendário).

Tudo o que muda fica na auditoria (Administração › Auditoria, tipo `calendar_event`).

## Os tipos

Quem cuida dos chamados tem o botão **Tipos**: o nome, a cor, **Da equipe** (entra no "Hoje, fora do
escritório") e **Ativo**. **Incluir um tipo** cria outro (Treinamento, Plantão…). O tipo que já tem
evento não sai da lista: desative, e os eventos dele continuam com o nome e a cor.

Em cada tipo, **Lembretes** abre os que o evento novo daquele tipo já traz: mude ali, e os eventos novos
vêm com eles (os que já estão no calendário ficam como estão).

## Quem pode

| O quê | Quem |
|---|---|
| Ver | quem vê os chamados (e só os eventos dos painéis que vê) |
| Criar, mudar, Feito, Cancelar e Excluir | quem trabalha nos chamados |
| Mudar os tipos | quem cuida dos chamados |
