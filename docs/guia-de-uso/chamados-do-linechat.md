# Chamados do LineChat — como ligar e conferir

A tela **Chamados** mostra os chamados de suporte que a equipe abre no LineChat. O Gestor guarda
uma cópia do painel e a atualiza sozinho. Ligar é coisa de uma vez, feita por quem administra.

## Ligar (uma vez)

1. No **LineChat**, gere uma chave de API: **Integrações › Token**. Ela começa com `pn_`.
   Gere uma **só para o Gestor**: assim, se um dia precisar trocar, o resto não para.
2. No **Gestor**, abra **Administração › Ajustes › Chamados do LineChat**.
3. Cole a chave no campo **Chave de API do LineChat** e clique em **Salvar**.
4. Clique em **Buscar painéis**, escolha **Ingline - Suporte** e clique em **Salvar** de novo.
5. Ligue **Ler os chamados do LineChat a cada minuto** e salve.
6. Clique em **Sincronizar agora**. A primeira vez lê o painel inteiro: cerca de um minuto.
   No fim aparece algo como *"Leitura completa: 3.194 cards lidos, 3.194 novos."*

Pronto: o menu **Chamados** já mostra os números, e o Gestor passa a buscar sozinho, a cada minuto,
o que mudou. De madrugada (às 4h) ele relê o painel inteiro para conferir.

## Conferir que está funcionando

- No topo da tela **Chamados** aparece **atualizado há X min**. Se aparecer **a leitura falhou**,
  passe o mouse em cima para ver o motivo.
- Em **Ajustes › Chamados do LineChat**: **Última leitura**, quantos chamados estão guardados e
  **Últimas leituras registradas**.
- **Testar agora** confere a chave e o painel sem gravar nada.

## Quando algo dá errado

| O que aparece | O que fazer |
|---|---|
| *O LineChat recusou o token (401)* | A chave foi apagada ou trocada no LineChat. Gere outra e salve. |
| *O LineChat não encontrou esse painel (404)* | O painel foi apagado ou trocado. **Buscar painéis** e escolha de novo. |
| *Não consegui falar com o LineChat* | O LineChat ou a internet do servidor estão fora. A leitura tenta de novo sozinha a cada minuto. |
| *Atenção: o LineChat devolveu N cards, e aqui há M* | Veio muito menos do que o esperado. Nada foi marcado como excluído. Confira o painel e a chave. |

Se a leitura ficar 15 minutos seguidos falhando, o Gestor manda **um** aviso pelo mesmo caminho dos
avisos do sistema (o WhatsApp, se estiver configurado em Ajustes › Avisos).

## Usar a tela

- **Duas abas**: **Hoje** (o que chegou hoje, por hora) e **Período** (as datas que você escolher,
  com os atalhos 7 dias, 30 dias, este mês, mês passado, 12 meses e **Tudo** — desde o primeiro
  chamado guardado).
- **Só em aberto**: o interruptor ao lado dos filtros deixa na tela só os chamados que ainda não
  chegaram numa etapa que fecha. Vale nas duas abas. **Período + Tudo + só em aberto** é tudo o que
  está na mesa, de qualquer data (era a antiga aba "Em aberto", que saiu no Patch 1.4). Na aba Hoje,
  clicar em **Em aberto agora** leva direto para lá.
- **Clicar filtra a tela toda**: uma barra ou fatia (um cliente, um produto, uma etapa), uma coluna
  do gráfico do tempo (uma hora, um dia, um mês) ou um dos números de cima (vencidos, parados, sem
  responsável, fechados).
- O gráfico onde você clicou **continua inteiro**, com o escolhido em destaque. **Clique de novo**
  nele para desfazer, ou em outro para trocar. **Ctrl+clique** soma mais de um.
- Os filtros aparecem escritos embaixo dos botões, cada um com o seu **X**; **Limpar filtros** tira
  todos. Um grupo inteiro aparece como um item só.
- **Fechados hoje** (e **Fechados no período**) mudam a pergunta: a tela passa a mostrar o que foi
  fechado, pela hora ou pelo dia do fechamento.
- **Pizza ou barras**: os dois botões no canto de cada gráfico (desde o 1.4, todos abrem em pizza).
  A sua troca fica no seu navegador; sem trocar, vale o jeito que a equipe arrumou.
- **Outros**, na pizza: clicar desdobra — cada opção que estava somada ali vira um item normal, com a
  sua fatia (em cinza: as cores ficam só nas 6 maiores). **Juntar os menores em Outros** volta.
- **Agrupar**: nos gráficos em que a administração montou grupos (por exemplo "Ramal" = Ramal -
  Configuração + Ramal - Criação + Ramal - Telefone Sem Serviço), o botão junta cada grupo num ponto
  só. Clicar no grupo filtra por todas as opções dele. A sua escolha (junto ou separado) fica no seu
  navegador.
- **A tabela** tem a coluna **Descrição** (o começo do texto do card; o texto todo aparece ao passar
  o mouse). As colunas se escolhem no botão **Colunas**.

## Organizar a tela (quem administra)

A arrumação vale para **a equipe toda**. Em **Chamados**, clique em **Organizar**:

1. **Arraste** cada gráfico pela alça (⠿) para trocar de lugar — ou use as setas ‹ ›. Esc, no meio
   do arrasto, devolve o gráfico para onde estava.
2. **Metade | Inteira**: o gráfico ocupa meia linha ou a linha inteira.
3. **Esconder**: o gráfico some para todos. No Organizar ele continua como uma tira fina, com
   **Mostrar**, para trazer de volta.
4. **Pizza | Barras**: o jeito que cada gráfico abre para todo mundo.
5. **Grupos**: em cada gráfico, junte várias opções num ponto só. **Novo grupo** (dê um nome e marque
   as opções) ou **Sugerir pelo começo do nome** (junta o que começa igual antes do " - "). Uma opção
   fica num grupo só. **Abrir agrupado para a equipe** faz o gráfico já abrir com os grupos juntos.
6. **Etapas que fecham**: quais colunas do Kanban contam como fechadas. O padrão é o do LineChat
   (Chamado Tratado Suporte e Chamado Validado). A hora em que cada chamado fechou é refeita pelo
   histórico de etapas.
7. **Salvar para todos**. **Cancelar** descarta; **Voltar ao padrão** traz a ordem, a largura e a
   pizza de fábrica — os grupos e as etapas que fecham ficam (ainda é preciso salvar).

Os números de cima e a tabela ficam fixos. Cada arrumação salva fica na auditoria, com o antes e o
depois.

## O que a cópia guarda

- **Os chamados**, com etapa, responsável, vencimento, etiquetas e os campos do card.
- **Cada mudança de etapa**, com a hora. O LineChat não entrega esse histórico pela API: quem anota
  é o Gestor, a partir da primeira leitura. É daí que vai sair o tempo em cada nível.
- **O que foi excluído no LineChat** fica marcado e sai das contas, mas não é apagado.

Os chamados continuam sendo abertos e trabalhados **no LineChat**. O Gestor só lê.
