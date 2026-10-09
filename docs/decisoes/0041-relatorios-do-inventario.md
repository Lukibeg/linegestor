# 0041 — Relatórios do Inventário

**Contexto.** Em 09/10 o Luan mandou um print do Inventário no ar e pediu: "gostaria de mais
informações sobre os equipamentos, tá bem enxuto, gere alguns relatórios". A tela respondia "quantos
no estoque, quantos com clientes, quanto vale o que está locado" e mostrava a lista; não respondia
quem tem o quê, o que está esquecido em cliente que saiu, se o estoque dá conta, quanto vale o parque
inteiro, o que volta com defeito, nem o que falta no cadastro (pendências antigas do projeto:
"conferir o valor de cada modelo" e "passar o N/S para o campo próprio"). O 1.8 já estava no GitHub,
esperando o Pull request: os relatórios viraram o **1.9**, numa branch que sai do 1.8.

No mesmo print havia um defeito: clicar no **Parque por modelo** mandava `?modelId=` (e `?clientId=`)
para a lista, que lê `?modelo=` e `?cliente=` — o clique não filtrava nada.

**Decisão.**

- **Uma aba Relatórios no próprio Inventário** (a quarta: Aparelhos · Modelos · Movimentações ·
  Relatórios), em `?aba=relatorios&rel=…`, em quatro partes — **Clientes**, **Estoque e valor**,
  **Histórico e cadastro** e **Relação do cliente** —, cada relatório respondendo uma pergunta que a
  tela não responde (a regra da 0028):
  - **Quem tem o quê**: cliente × modelo, com locação/comodato, unidades, inativos e o valor; embaixo,
    o total com clientes e o estoque por modelo. O cliente **fora da base** vem marcado ao lado do
    nome — na lixeira, arquivado, sem produto ativo (a mesma regra do portal do cliente, 0040) ou
    **sem o Equipamentos**;
  - **Na prateleira**: o estoque por modelo — ativos (para entregar), inativos, "parado há" (desde
    que chegou ao estoque, ou voltou), as saídas dos últimos 90 dias e **para quantas semanas dá**;
    situação **sem estoque**, **pouco estoque** (menos de 4 semanas), **sem saída** ou **em dia**;
  - **Quanto vale o parque**: o patrimônio em aparelho (sem os vendidos) em comodato, locação, uso
    interno e estoque (ativos e inativos), e por modelo;
  - **Vai e volta**: saídas do estoque, devoluções, quem voltou inativo, por modelo e por cliente, o
    tempo no cliente antes de voltar e as últimas devoluções;
  - **Cadastro em dia**: MAC ou N/S escrito na anotação, sem MAC e sem N/S (num modelo em que os outros
    têm), modelo sem valor, cliente sem o login padrão do modelo, cliente sem a rede padrão; e, para
    conferir, valor diferente do modelo e modelo sem foto;
  - **Relação de equipamentos do cliente**: por unidade (com o endereço), o resumo por modelo e o
    valor, para **imprimir ou salvar em PDF** pela impressão do navegador (como o Fechamento do mês,
    0037), com valores e campo de conferência que ligam e desligam. A ficha do cliente (aba
    Equipamentos) tem o atalho **Relação para imprimir**.
- **Clicar em qualquer número abre os aparelhos dele** numa janela (MAC/N/S com link para a ficha,
  modelo, onde está, modalidade, condição, valor e desde quando).
- **As contas moram em `packages/shared/src/inventario.ts`** (`relatoriosInventario` e
  `relacaoDoCliente`), as mesmas no servidor (`GET /api/inventory/relatorios`, permissão
  `records.read`) e na prévia. O servidor lê tudo de uma vez (o inventário tem centenas de aparelhos)
  e manda junto a lista curta dos aparelhos, que alimenta as janelas e a relação.
- **As regras da conta**:
  - **vendido não é nosso**: fora do patrimônio, do estoque e do "quem tem o quê" (só aparece como
    informação e, na relação, à parte);
  - o valor é o **próprio ou o do modelo**; sem os dois, o aparelho conta, mas não soma;
  - a **história de cada aparelho** é refeita pelas movimentações dele, em ordem (todo aparelho nasce
    no estoque): **saída** = do estoque para um cliente (locação, comodato ou venda);
    **transferência** = de um cliente para outro; mover para o **mesmo cliente** (trocar a unidade ou
    a modalidade) não é chegada nova; **voltou inativo** = devolução marcada como Inativo. Se a
    história não bate com o cadastro (dado mexido fora das movimentações), "desde" é a última
    movimentação que levou o aparelho para onde ele está, ou o dia do cadastro;
  - o **ritmo de saída** é o dos últimos 90 dias, ou desde a primeira movimentação guardada; **com
    menos de 4 semanas de histórico, não há conta** (só as saídas) — o Gestor só tem movimentação
    desde a migração;
  - **dia é o de Brasília**; "ativa" é a assinatura sem encerramento, ou com encerramento por vir;
  - o **uso interno** (Ingline, VoiceNet) aparece no "quem tem o quê" e no valor, nunca é marcado
    como fora da base e fica fora do login e da rede padrão do "Cadastro em dia";
  - o "MAC/N/S na anotação" acha 12 hexadecimais (sem separador, só com uma letra — para não
    confundir com telefone), o código depois de "N/S", "S/N", "SN", "série" ou "serial" (com algum
    número) e o código do Nexus ("N001"); a expressão não usa "olhar para trás" (Safari antigo).
- **Sem migração**, sem permissão nova e sem gráfico novo: a barra do valor é a `Proporcao` de
  sempre, que passou a aceitar até seis partes nas cores da paleta da pizza (já conferida), o número
  em R$ e o clique.
- **Corrigido**: o Parque por modelo manda `?modelo=` e `?cliente=` (`stock` na parte verde,
  `clients` na azul). E o `<Th align="right">` passou a usar `!text-right`: o `.table th` (que alinha à
  esquerda) é mais específico que a classe sozinha, e o título das colunas de número ficava longe dos
  números em todas as tabelas.

**Cortado na prévia (09/10).** A proposta tinha um sétimo relatório, **Para recolher ou
regularizar** (o aparelho nosso em cliente fora da base e os inativos parados em cliente, com o motivo
e desde quando), com o número laranja ao lado de **Clientes**. O Luan comentou na prévia "precisa
disso não": saiu o relatório e o número. Ficou só a marca de quem saiu da base no Quem tem o quê.

**Consequências.**

- A prévia ganhou uma história de aparelhos coerente (antes havia movimentações soltas que não
  batiam com onde os aparelhos estavam): ida e volta da Distribuidora (um voltou inativo), headsets
  que voltaram do Supermercado, dois TIP vendidos, um que voltou do Home Care com defeito, a Farmácia
  Central (arquivada) e a Clínica Aurora (que encerrou o Equipamentos) com aparelho nosso, o uso
  interno da Ingline, uma base DP752 sem valor e um GXP com o código do Nexus na anotação.
- **Ficaram de fora**, para quando ele pedir: o **Organizar** (ordem, esconder, favoritos) e o
  **envio diário** pelo WhatsApp, que os Relatórios dos Chamados têm (0037 e 0038).
