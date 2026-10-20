# 0048 — O menu lateral com grupos

**Contexto.** Com o módulo de chamados (0047), o menu lateral chegou a 12 itens: Chamados e Chamados do
LineChat lado a lado, Base de conhecimento e Portal do cliente separados, e o Importar / Exportar com
ícone próprio. Em 13/10, na prévia do 2.0, o Luan pediu: *"está ficando muitas abas laterais, acho que
podemos dar uma subdivisão: um ícone Suporte e dentro dele os chamados, os tickets e os relatórios; a
exportação não precisa ter um ícone próprio, pode ficar dentro de configurações; e a base de
conhecimento pode ter um pai, com a base interna e a base dos clientes"*. Como o 2.0 ainda não subiu,
entrou nele.

**Decisão.**

- **Dois grupos no menu.** **Suporte**: **Chamados** (o módulo novo, `/atendimento`), **Projetos**
  (`/projetos`) e **Relatórios** (abaixo). **Base de conhecimento**: **Base interna** (`/base`) e **Base
  dos clientes** (o portal do cliente: os tutoriais e quem entra, `/portal-do-cliente`). Os endereços não
  mudaram; o título de cada tela passou a ser o nome do item no menu, menos o dos tickets antigos
  (abaixo).
- **O Relatórios abre nos tickets do LineChat, na aba Hoje** (o segundo pedido do Luan, no mesmo dia:
  *"aqui não precisa ter tickets do LineChat, apenas relatórios, e ele vai levar para a parte de tickets
  e vai mostrar o de hoje"*). A primeira versão do grupo tinha um item **Tickets do LineChat** (`/chamados`)
  e outro **Relatórios** (`/chamados/relatorios`); agora é um item só, **Relatórios**, que leva a
  `/chamados` e fica marcado nas duas telas. Dali, as abas **Hoje · Período · Relatórios** levam ao
  resto, como antes. A tela continua com o título **Tickets do LineChat** (é a parte dos tickets), e a
  dos 20 relatórios, **Relatórios**.
- **Os Projetos também moram no Suporte** (o terceiro pedido do dia: *"esse pode ficar dentro de suporte
  também"*), entre os Chamados e os Relatórios. Quem vê os projetos e não vê os chamados encontra o
  grupo só com eles.
- **O Importar / Exportar mora na Administração**, numa aba própria (`/admin/dados`), para quem pode
  importar ou exportar — a Administração aparece no menu para essas pessoas também. O endereço antigo
  (`/dados`) leva para lá.
- **Como o grupo se comporta.** O nome abre e fecha a lista (recuada, com uma linha do lado); o grupo
  da tela aberta abre sozinho, e cada pessoa abre e fecha os outros (o navegador lembra). Fechado, o
  grupo fica marcado quando a tela aberta é dele e mostra a soma dos números de dentro (a leitura
  obrigatória da Base interna aparece no grupo). Com o menu recolhido (só ícones), o ícone do grupo
  abre a lista ao lado, que fecha ao escolher, com Esc ou clicando fora; o número das Novidades fica no
  canto do ícone, como o dos grupos, e todos os ícones ficam no mesmo eixo. No celular, o menu abre por
  cima, com os grupos.
- **"Tickets do LineChat"** é o nome dos antigos onde eles aparecem como tela (o título e a seção da
  ficha do cliente); a parte dos Ajustes que liga a leitura continua **Administração › Ajustes ›
  Chamados do LineChat**, porque é o nome da integração.

- **Revisto no 2.0.1 (17/10/2026): Chamados virou Painéis.** Com o painel de Vendas (decisão 0050), o
  Comercial passou a morar no mesmo item que o Suporte e o Desenvolvimento, e o Luan apontou o item nos
  comentários da prévia: *"isso aqui n é chamados, é paineis"*. Avisado de que mudava esta decisão,
  respondeu *"pode fazer"*. Agora:
  - o item do Suporte é **Painéis** (o ícone, um quadro de colunas), e o título das telas dele também
    (a tela dos painéis, o quadro, a lista, o relatório do Comercial, o Meu dia e os Ajustes) — a regra
    de cima continua: o título é o nome do item;
  - a primeira aba, que se chamava Painéis, chama-se **Todos** (os cartões de todos os painéis); as
    outras continuam **Meu dia** e **Ajustes**;
  - os caminhos escritos nas telas, nas mensagens e nos guias passam de *Chamados › Ajustes* para
    **Painéis › Ajustes** (*Painéis › Ajustes › Avisos*, *Painéis › Ajustes › Integrações*…);
  - dentro de cada painel nada muda: o Suporte continua com os chamados e o **Abrir chamado**, e o
    Comercial com as negociações e a **Nova negociação**. O endereço continua `/atendimento`;
  - no alto do menu continua o **Painel** (a tela inicial do Gestor, no singular), como antes;
  - a nota do 2.0 e os guias das versões antigas ficam como estavam (contam o que era).
- **Revisto no 2.0.1 (19/10/2026): o grupo Comercial.** Um terceiro grupo, **Comercial**, abaixo do
  Suporte, com **Negociações** e **Relatórios** — o atalho para o painel de Vendas e o relatório dele, de
  quem tem a permissão **Ver o Comercial** (decisão 0050). Na tela de um painel de Vendas, o menu marca
  o Comercial, e não Painéis (quem decide é o painel aberto, e não só o endereço). O **Calendário** e o
  sininho passaram a aparecer também para quem só vê o Comercial.
- **Revisto no 2.0.2 (20/10/2026): o Meu dia no menu.** O Luan, com o print da lista do Suporte no menu
  recolhido: *"O meu dia pode ter um botão aqui tbm"*. O Suporte ganhou o item **Meu dia**
  (`/atendimento/meu-dia`, o ícone do sol). Na tela do Meu dia, o menu marca o Meu dia, e não Painéis —
  também com a janela de um chamado aberta por cima dele (quem decide é a tela de baixo). A aba Meu dia,
  dentro de Painéis, continua.
- **Revisto no 2.0.2 (20/10/2026): Painéis no alto, e os atalhos "Painel do…".** O Luan, num comentário
  na prévia: *"o paineis vai ter um campo próprio como o calendário e dentro de suporte vai ter o 'painel
  do suporte' já apontando para o painel do suporte como um atalho, como fizemos no comercial que vc tbm
  deve mudar o nome do atalho para painel do comercial"*. Avisado de que mudava esta decisão, respondeu
  *"pode fazer"*. Agora:
  - **Painéis** é um item próprio no alto do menu, logo abaixo do Calendário: a tela de todos os
    painéis (Todos, Meu dia e Ajustes), como antes. O ícone continua o do quadro.
  - O **Suporte** tem **Painel do Suporte** (`/suporte`, o atalho que abre direto o quadro do painel
    Suporte), **Meu dia**, **Projetos** e **Relatórios**.
  - O painel do Suporte é o que veio com o sistema (`painel-suporte`, a sigla SUP), mesmo que o nome dele
    mude. Quem não vê esse painel, ou com ele desativado, vai para a tela dos Painéis.
  - No **Comercial**, o atalho **Negociações** passou a se chamar **Painel do Comercial** (o mesmo
    caminho). Os dois atalhos têm o mesmo ícone, o das colunas.
  - **O item marcado.** No quadro, na lista e no relatório do Suporte, no Abrir chamado dele e na ficha de
    um chamado SUP, fica marcado o **Painel do Suporte**, como o Comercial já fazia. Na aba Todos, nos
    Ajustes e nos outros painéis (o Desenvolvimento), fica marcado **Painéis**.
- **Revisto no 2.0.2 (20/10/2026): o sininho chama-se Avisos.** Com os lembretes do calendário (decisão
  0049), o sininho deixou de ser só dos chamados: o nome dele (o que aparece ao passar o mouse e o título
  da lista) passou de "Avisos dos chamados" para **Avisos**. O lembrete aparece com o ícone do calendário;
  o clique abre o calendário no evento.
- **Revisto no 2.0.2 (20/10/2026): o grupo Técnico.** O Luan, num comentário na prévia, sobre o menu:
  *"quero q vc faça uma nova aba de técnico e esses 2 pontos vao ficar dentro dele"*. Os dois pontos são
  os itens técnicos que moravam no alto do menu. Agora:
  - um quarto grupo, **Técnico** (o ícone da chave), com **Circuitos e DIDs** e **Inventário**. Ele fica
    logo abaixo do Suporte: as áreas ficam em grupos (Suporte, Técnico, Comercial), e é a mesma gente do
    suporte que olha os circuitos e os aparelhos;
  - no alto do menu ficam **Painel**, **Clientes**, **Calendário** e **Painéis**;
  - os endereços e os títulos das telas não mudaram (`/circuitos`, `/inventario`). O grupo se comporta como
    os outros: abre sozinho nas telas dele e, com o menu recolhido, abre a lista ao lado;
  - os guias passam a escrever o caminho pelo grupo: *Técnico › Inventário › Modelos*.
- **Revisto no 2.0.2 (20/10/2026): o Simulador no Comercial.** O Simulador do Comercial (decisão 0052) é o
  terceiro item do grupo **Comercial**, abaixo do Painel do Comercial e dos Relatórios (`/comercial/simulador`,
  o ícone da calculadora), de quem tem a permissão do Comercial. Nas telas dele (a lista, a simulação e os
  Ajustes), o menu marca o Simulador; a tela usa a largura toda, como os painéis e o calendário.

**Consequências.** O menu cai de 12 para 8 entradas no alto, e o Suporte tem três itens. Os guias de
uso, a nota do 2.0 e o vídeo falam dos nomes novos.
