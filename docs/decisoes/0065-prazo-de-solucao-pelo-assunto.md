# 0065 — O prazo de solução vem do assunto (e a primeira resposta não tem prazo)

**Data:** 16/11/2026 · **Patch:** 2.4.8 · **Situação:** aceita · **Revê:** a 0047 (os prazos: a primeira resposta e a solução
pela prioridade, em Ajustes › Prazos; "sem a prioridade, não há prazo", do 2.1.2)

## O pedido

O Luan, 16/11, com o print do bloco Prazos da ficha:

- *"Esse prazo de solução tem que ser baseado nos assuntos, e não na gravidade. Nesse caso, na tela de assuntos eu quero ter a
  opção de eu cadastrar."*
- Avisado de que a 0047 manda o prazo pela prioridade, ele escolheu primeiro "o assunto, senão a prioridade" e logo corrigiu:
  *"Na verdade eu quero que seja somente por assunto, e se não tiver cadastrado ele vai falar lá algo como: sem prazo, pois não
  tem cadastro desse prazo no assunto selecionado."* E: *"Não precisa desse prazo de primeira resposta."*

## O que mudou

- **O prazo de solução é o do assunto.** Cada assunto tem o seu **prazo de solução**, em minutos úteis
  (`ticket_subjects.resolution_minutes`, `Assunto.prazoSolucao`), cadastrado no Editar do assunto (Configurar › Assuntos), em
  horas e minutos. De 15 minutos a 2.000 horas úteis (`MIN_PRAZO_DO_ASSUNTO`, `MAX_PRAZO_DO_ASSUNTO`).
- **O subtópico herda.** O assunto sem prazo próprio usa o do mais próximo acima dele (`prazoDoAssunto`): as 16 h do Ramal valem
  para Ramal › Configuração › Identidade, e o Ramal › Incidente pode ter as suas 8 h. Na árvore, cada assunto mostra o prazo
  dele, o herdado (e de quem) ou "sem prazo"; na janela, o campo vazio diz o que vale ("Vazio: usa o prazo de Ramal ›
  Incidente, 8 h úteis").
- **Sem prazo, a tela diz o porquê** (`EstadoPrazo.motivo`, `TEXTO_SEM_PRAZO`):
  - o chamado sem assunto: *"Sem prazo: o chamado ainda não tem assunto"* (e a dica: escolha o assunto);
  - o assunto sem prazo (nem ele nem os de cima): *"Sem prazo: o assunto selecionado não tem prazo cadastrado"*, com o caminho do
    assunto e onde cadastrar;
  - o painel que não conta prazo: *"Sem prazo: o painel X não conta prazo"*.
- **A primeira resposta não tem prazo.** `estadoDosPrazos` devolve a resposta sempre "sem" (a forma `{ resposta, solucao }`
  continua, para quem lê os dois); sem alerta de resposta, sem a coluna "Prazo de resposta" no CSV, sem o bloco na ficha. O
  quanto se leva até a primeira resposta continua no relatório Primeira resposta (é uma medida, não um prazo).
- **A prioridade não mexe mais no prazo.** Ela continua: a matriz gravidade × alcance sugere, o quadro ordena e os relatórios
  separam por ela. O que contava prazo pela prioridade agora conta pelo assunto: `painelContaPrazo` é o "conta prazo" com o campo
  **Assunto** ligado (antes, a prioridade). Sem o assunto no painel, não há prazo; o "conta prazo" fica guardado e volta com ele.
- **Sempre em horas úteis.** O relógio anda no horário de atendimento e para nos feriados (Ajustes › Prazos, que fica com o
  horário, os feriados, a matriz e os avisos). As horas corridas por prioridade saíram: o prazo do assunto é um só número, e o
  calendário diz quando o relógio anda. Esperando o cliente, o prazo para; esperando a operadora, continua (como antes).
- **Trocar o assunto refaz a conta** desde a abertura (como trocar a prioridade fazia).
- **Ajustes › Prazos** troca os quatro cartões das prioridades por **Prazo de solução: pelo assunto**: o que vale, e quantos
  assuntos de cada painel que conta prazo têm prazo próprio, quantos herdam e quantos ficam sem. Os prazos por prioridade que
  estavam gravados ficam guardados (`AjustesPrazos.prazos`), sem uso.
- **O relatório Prazo cumprido** é só da solução, separado **pelo assunto que dá o prazo** (o do chamado, ou o de cima de quem
  ele herdou: todo o Ramal › Configuração com as 16 h do Ramal fica na linha do Ramal), com o número de **resolvidos sem prazo**
  (sem assunto, ou o assunto sem prazo), que ficam fora da porcentagem.
- **O cartão do quadro**: o selo e a borda vermelha são os da solução.

## Por quê

- O tempo para resolver depende do que é o problema (criar um ramal não leva o que leva uma queda de tronco), e a equipe já
  separa o trabalho pelo assunto. A gravidade e a prioridade dizem o que vem primeiro, não quanto tempo cada coisa leva.
- "Sem prazo" com o motivo na ficha mostra o que falta cadastrar, em vez de inventar um prazo.

## Para quem vem depois

- O prazo continua calculado na hora (nada é gravado no chamado): cadastrar ou mudar o prazo de um assunto muda a conta dos
  chamados abertos com ele (e os alertas que ainda não foram).
- `estadoDosPrazos(c, ajustes, agora)` recebe o `assuntoId` e o `prazoSolucao` já resolvido (`prazoDoAssunto(id, assuntos)?.minutos`):
  o servidor (`cartaoDaLinha`, o relógio), os relatórios (`derivar`) e a prévia (`prazosDe`) fazem igual.
- Alterar um assunto sem a chave `prazoSolucao` mantém o prazo (quem não conhece o campo não o apaga); `null` tira o prazo
  próprio.
