# 0029 — Chamados do LineChat dentro do Gestor, no lugar do Grafana

**Contexto.** A equipe de suporte registra os chamados no **LineChat** (a plataforma Helena com a
marca Ingline), num Kanban: o painel **Ingline - Suporte**, com 11 etapas, campos de lista (Cliente,
Produto, Tipo de chamado, Assunto, Canal, Resolutor, Observadores) e etiquetas de prioridade. Para
acompanhar os números, o Luan usava um **Grafana** alimentado pelo **DataWaiter**: um programa em
Python que lia a API do LineChat de 100 em 100 (é o máximo que ela devolve), guardava num SQLite e
servia para o Grafana, que fazia as contas no navegador.

Os problemas dessa montagem:
- o SQLite era **apagado a cada reinício** e recarregado inteiro;
- só havia o estado atual do card, **sem histórico**: impossível dizer quanto tempo um chamado
  ficou no N1 ou quanto levou para fechar;
- as **etiquetas** (a prioridade) ficavam de fora;
- card excluído no LineChat continuava contando até o próximo reinício;
- o painel do Grafana era pesado (travou o navegador na captura de tela);
- mais um sistema, mais um login, mais um servidor.

**Decisão.**

- **O Kanban continua no LineChat.** O Gestor não abre nem edita chamado: guarda uma **cópia só de
  leitura** de um painel, nas tabelas `linechat_*`, e mostra os números no menu **Chamados**.
- **Escopo:** só o painel **Ingline - Suporte**, e só para a equipe Ingline. O DataWaiter também lia
  LineMóvel (Suporte e Financeiro) e Labchecap; esses ficam de fora por decisão do Luan (23/09).
- **Sincronização dentro do próprio Gestor** (`apps/api/src/services/linechat.ts`), sem serviço novo:
  - a cada minuto, a leitura **recente** pede ao LineChat só o que mudou (`UpdatedAt.After`);
  - na primeira vez, às 4h e depois de 26 h sem ela, a **completa** relê o painel inteiro (uns 45 s
    para 3,2 mil cards), atualiza etapas, campos e etiquetas e marca o que sumiu de lá;
  - se a completa devolver menos da metade do que temos, **ninguém é marcado como excluído**: o mais
    provável é token ou painel errado, e a tela avisa;
  - uma só por vez (a automática e o botão não se atropelam);
  - 15 minutos seguidos falhando → **um** aviso pelo mesmo caminho dos avisos do sistema.
- **Histórico feito por nós.** A API pública do LineChat **não tem rota de histórico do card** (o
  que aparece na tela deles não sai pela API). A cada leitura comparamos a etapa atual com a anterior
  e gravamos a mudança em `linechat_card_moves`, com a hora da alteração do card lá. Vale a partir da
  primeira leitura; o que já existia antes fica marcado como **estimado**. É a base para medir tempo
  por nível (próxima fase). O LineChat tem webhook de "card mudou de etapa" (`PANEL_CARD_STEP_CHANGE`),
  que daria a hora exata — ficou para depois, porque exige criar a assinatura na conta deles.
- **Token no cofre, configurado na tela** (Administração › Ajustes › Chamados do LineChat), como o
  backup e os avisos: chave de API, painel escolhido numa lista que o próprio LineChat devolve,
  Testar agora, Sincronizar agora e Reler tudo.
- **As contas em um lugar só** (`packages/shared/src/chamados.ts`), usadas pelo servidor **e** pela
  prévia: o que a prévia mostra é o que o sistema mostraria. Com poucos milhares de cards, contar em
  memória é rápido (e a leitura do banco é reaproveitada por até 1 minuto).
- **Permissão nova `support.read`** ("Ver os chamados de suporte"), dada pela migração `0006` a todos
  os papéis que já consultam o sistema.
- **Um gráfico novo: `Colunas`** (em pé, na ordem do tempo), para "chamados por dia/hora" e "há
  quanto tempo estão abertos". Revê a 0028, que tinha só ranking e proporção — e onde um gráfico de
  barras por mês foi descartado. A diferença: este é o gráfico principal que a equipe já usava no
  Grafana. Mesmas regras da 0028: uma cor, o número escrito, clicável quando filtra.
- **Pizza como opção** (pedido do Luan em 23/09, avisado de que revia a 0028): cada gráfico de lista
  tem os botões **Barras | Pizza**, e a escolha fica guardada no navegador de cada um. Produto, Tipo
  de chamado e Canal abrem em pizza, como eram no Grafana; o resto em barras (lista longa — 50
  clientes, 86 assuntos — não se lê numa pizza). A pizza tem no máximo 6 fatias com cor, o resto em
  "Outros" (que abre a lista do que foi somado), e a legenda escreve nome, número e %.

**Conferência com os dados de verdade.** As contas foram rodadas sobre os 3.194 cards reais (lidos
pela API em 23/09) e comparadas com o Grafana no mesmo recorte (01/08 a 30/08): **318 chamados**,
ClivaleMais 40, Labchecap 37, Ramiro Campelo 34; Configuração 148, Requisição 43, Correção 35;
WhatsApp Oficial 241; LinePBX 207, LineChat 58 — **iguais**. (O painel salvo do Grafana ia até
30/08 23:59; o dia 31 ficava de fora.)

**Consequência.** Quando o Luan conferir a tela nova, o DataWaiter e o Grafana podem ser desligados.
O painel **Chamados** passa a ser a fonte dos números de suporte. A próxima fase usa o histórico:
tempo em cada etapa, tempo até fechar, e ligar o campo Cliente do card ao cadastro de clientes.

> **Complementada pela 0030 (ainda no Patch 1.3):** clicar em qualquer parte da tela filtra — barras,
> fatias, colunas do tempo e números de cima —, o gráfico clicado continua inteiro com o escolhido em
> destaque, e clicar de novo desfaz. A administração arruma a tela para a equipe toda (ordem, largura,
> escondidos, barras ou pizza). O dia clicado no Período deixou de trocar o período: vira filtro.

> **Revista pela 0031 (Patch 1.4), a pedido do Luan (avisado antes):** a aba **Em aberto saiu** — virou
> o interruptor **só em aberto**, que vale em Hoje e em Período (com o atalho **Tudo**, é o que a aba
> mostrava). As **etapas que fecham o chamado** passam a ser escolhidas pela administração (padrão:
> as finais do LineChat), e a hora do fechamento é refeita pelo histórico de etapas. A **pizza** é o
> padrão de todos os gráficos de lista. A tabela ganhou a **Descrição**.
