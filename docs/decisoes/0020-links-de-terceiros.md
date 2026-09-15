# 0020 — Links de terceiros: registrar sem poluir o controle da VoiceNet

**Contexto.** Até aqui, só entravam no sistema os circuitos da **VoiceNet**, a operadora do grupo.
Mas vários clientes têm também o **tronco que eles mesmos contrataram** de outra operadora, e saber
qual é a numeração desse tronco é útil no dia a dia (atendimento, mudança de plano, portabilidade).
O problema é que, jogados na mesma lista, esses circuitos somem com a pergunta que a tela existe
para responder: *quanto a VoiceNet tem, quanto está em uso, quanto sobra*.

**Decisão.** O circuito ganhou uma marca: **link de terceiro** (`circuits.third_party`).

- No cadastro do circuito há uma caixa **"Link de terceiro (não é da VoiceNet)"**. O titular passa a
  ser o próprio cliente, e a operadora é qualquer uma do catálogo.
- **Por padrão, ele e os números dele não existem** para: a lista de Circuitos, a aba Numeração, os
  quatro cartões do topo, e o Painel (ocupação, contagem de DIDs e alertas).
- Ao lado dos filtros há um interruptor **"Habilitar links de terceiros"**. Ligado, eles aparecem,
  marcados com o chip **terceiro**. O interruptor mora no endereço (`?terceiros=1`) e **atravessa as
  duas abas** — é modo de exibição, não filtro, e por isso "limpar filtros" não o desliga.
- O alerta *"Clientes com DIDs alocados mas sem o produto VoiceNet"* ignora os de terceiro. Sem
  isso, todo cliente com tronco próprio viraria uma inconsistência falsa — e alerta que mente
  rapidamente deixa de ser lido.

**A exceção, de propósito.** Na **ficha do cliente**, a aba DIDs mostra **todos** os números dele,
inclusive os de terceiro, com o chip. Ali a pergunta é outra: não é "o que a VoiceNet controla", é
"o que este cliente tem". O mesmo vale dentro do próprio circuito de terceiro, que obviamente
mostra os seus números.

**Consequência.** Os números da ficha do cliente podem ficar **maiores** que os do Painel, e isso é
correto: são perguntas diferentes. O Painel e a tela de Circuitos são o controle da VoiceNet; a
ficha é o retrato do cliente.
