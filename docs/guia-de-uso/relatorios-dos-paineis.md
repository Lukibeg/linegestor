# Os Relatórios dos painéis (2.1)

Os relatórios dos chamados do Gestor ficam na vista **Relatórios** de cada painel — a mesma troca **Quadro ·
Lista · Relatórios** do alto do painel. No menu, **Suporte › Relatórios** abre a do painel Suporte. Os
relatórios dos chamados do Helena (o LineChat) continuam em **Suporte › Legado do Helena**, com os assuntos
de lá: os dois não se misturam, porque quase tudo mudou de régua (o tempo, o Resolvido, o nível, os
assuntos). A decisão inteira está em `docs/decisoes/0055-relatorios-dos-paineis.md`.

## 1. As abas

São 25 relatórios em seis abas, e cada um responde a uma pergunta (escrita embaixo do nome):

| Aba | Relatórios |
|---|---|
| **Tempo** | Prazo cumprido · Relógio do chamado · Primeira resposta · A escada N1 → N2 → N3 → DEV · Onde o chamado empaca · A prioridade faz diferença? · Esperando a operadora |
| **Volume** | Entrada × saída · Idade da fila · Mapa de calor da semana · Dias fora da curva · Previsão da semana |
| **Assuntos** | Os assuntos (a árvore: clique no nome para descer) · Sobe e desce dos assuntos · Os poucos que pesam muito · Onde está a gravidade · Os problemas |
| **Clientes** | Raio-X do cliente · Chamados pelo tamanho do cliente · Voltou com o mesmo problema · De quem é a falha? |
| **Equipe** | Quadro da equipe · Tempo gasto · Chamado bem preenchido |
| **Mês** | Fechamento do mês |

A aba **Favoritos**, antes delas, junta os que a equipe mais usa. O relatório que precisa do que o painel
não usa não aparece (o Desenvolvimento, sem prazo e sem assunto, não tem o Prazo cumprido nem a aba
Assuntos cheia de vazio).

## 2. O período e os filtros

- O padrão são os **últimos 30 dias**. Os atalhos (7 dias, 30 dias, Este mês, Mês passado, 90 dias, 12
  meses, Tudo) ou as datas mudam o período; a comparação ("menos 5 h que o período anterior") é com o
  período de antes, do mesmo tamanho.
- **Filtros** abre as caixas: assunto (leva os de baixo), tipo, gravidade, prioridade, **subiu até o
  nível**, responsável (ou sem dono), cliente, produto, operadora, etiqueta e os campos de lista do painel
  (como a Responsabilidade). Os filtros escolhidos aparecem escritos embaixo, com o X para tirar.
- O período e os filtros ficam no endereço: copie o link e mande, que a outra pessoa vê igual.
- Algumas coisas são **de agora**, de qualquer data, e o relatório diz: os em aberto, os vencidos, os
  parados, a idade da fila. A **Previsão da semana** é sempre a próxima semana, e o **Fechamento do mês**
  usa o mês inteiro, escolhido no próprio relatório.

## 3. Clicar mostra os chamados

Clique num número, numa faixa, num degrau da escada, numa célula do mapa ou numa barra: abre a janela com
os chamados por trás dele, e clicar num chamado abre a ficha. A janela é a mesma conta do número.

## 4. As regras das contas

- **Tempo é em horas úteis**, pelo horário de atendimento e os feriados de **Painéis › Ajustes › Prazos** (o
  mesmo relógio dos prazos). Um "dia" (1 d) é um dia de atendimento.
- **Tempo é mediana**: metade resolve antes, metade depois — um chamado esquecido não puxa a conta. "9 em
  10 até" é o tempo em que 9 de cada 10 resolvem.
- O chamado conta como resolvido no **Resolvido** (o Fechado vem sozinho depois).
- **O problema** (a causa por trás de vários incidentes) fica fora das contas: ele tem o relatório dele,
  Os problemas.
- **A escada** usa o nível mais alto por onde o chamado passou; quem resolve sem passar por uma etapa de
  nível conta no N1.
- **De quem é a falha?** conta os resolvidos no período pelo campo **Responsabilidade** (ou o campo de
  lista escolhido no Organizar).

## 5. Organizar (quem cuida dos chamados)

O botão **Organizar** arruma os relatórios **deste painel para a equipe toda**:

1. Em cada aba, mude a ordem com as setas, **esconda** o que não usa e marque a **estrela** para pôr nos
   Favoritos. Na aba Favoritos, as setas mudam a ordem dos favoritos.
2. Embaixo, escolha de qual campo de lista sai o **"De quem é a falha?"** (sem escolha, o Gestor acha pelo
   nome: Responsabilidade, Falha…).
3. **Salvar para todos.** Nada muda antes disso; **Cancelar** desfaz, e **Voltar ao padrão** volta a ordem
   de fábrica e mostra todos de novo (os favoritos ficam).

A arrumação vai para a auditoria, com quem arrumou e o que ficou à vista.

## 6. O Legado do Helena

**Suporte › Legado do Helena** é a tela de sempre dos chamados do LineChat (Hoje, Período e os 20
relatórios), com os assuntos de lá, só para consulta. O envio diário do PDF continua saindo dos gráficos
marcados nela até a virada. Veja [Chamados do LineChat](chamados-do-linechat.md).
