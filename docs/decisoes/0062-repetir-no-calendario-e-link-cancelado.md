# 0062 — Repetir o evento no calendário e cancelar o link

**Data:** 10/11/2026 · **Patch:** 2.4.6 · **Situação:** aceita · **Revê:** a 0049 (o calendário: "repetir o evento" estava em "fica para depois") e a 0020 (os links de terceiros: o cancelado segue a mesma regra de exibição)

## Os pedidos

O Luan, 10/11: *"quero q tenha um opção no agendamento se é recorrente diário semanal ou mensal para fixas nas agendas"* e
*"as vezes fazemos cancelamento de links quero que tenha uma opção de marcar como cancelado, onde ele é meio que excluído
porém fica um registro que ele foi na verdade cancelado"*.

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
5. **Mudar:** no evento que se repete, a janela pergunta **Só este** ou **Este e os próximos**.
   - *Só este*: só a data muda; a regra fica.
   - *Este e os próximos*: a regra recomeça nele (o dia dele vira a âncora, com a frequência e o fim de agora) e as datas
     seguintes andam para as datas novas, na ordem, cada uma com a sua situação (a cancelada continua cancelada); o que
     sobra vai para a lixeira, o que falta nasce. As de antes ficam como estão. Com **Não repete**, a repetição para nele.
   - O evento avulso passa a se repetir pelo Editar.
6. **Excluir:** *Só este*, ou *Este e os próximos* (vão juntos para a lixeira, e a repetição para antes dele). Na lixeira,
   as datas que foram juntas são **uma linha só** ("17 a 24/11 · Reunião (2 datas da repetição)"), e restaurar traz todas.
   Nada é apagado de verdade.
7. **O Duplicar** faz um evento avulso. O aviso de que o evento entrou (2.0.2) sai uma vez, pelo primeiro.

## 2. Cancelar o link

1. **O circuito ganhou o cancelamento:** `circuits.cancelled_on` (o dia em que vale), `cancel_reason` (opcional),
   `cancelled_by_id` e `cancelled_at` (a migração 0034). Na ficha, **Cancelar o link** (quem edita, `records.write`) e
   **Reativar**.
2. **É história, não lixeira.** O link cancelado e os números dele **saem** da lista de Circuitos, da Numeração, dos
   cartões, do Painel (a ocupação, a contagem de DIDs e os alertas), dos seletores de circuito e do filtro de titular — como
   o link de terceiro (a 0020) —, e voltam com o interruptor **Mostrar cancelados** (`?cancelados=1`, que atravessa as abas
   Circuitos e Numeração), com a marca "cancelado em …". A ficha do link continua inteira: a faixa do cancelamento (o dia,
   o motivo, quem e quando), os números e as movimentações. A busca do topo ainda acha o link.
3. **Os números ficam no link, como estavam** (com o cliente, o uso e a observação): são a história dele. Saem da **ficha
   do cliente** (ele já não tem esses números) — escolha minha; o contrário deixaria o cliente com números que não usa.
4. **O link cancelado não recebe números novos** (a faixa é recusada, com a frase ao lado do botão).
5. **As Movimentações** ganham "Link cancelado" e "Link reativado", com o dia e o motivo no antes e no depois; a
   auditoria também. Cancelar duas vezes, ou reativar o que não está cancelado, é recusado.
