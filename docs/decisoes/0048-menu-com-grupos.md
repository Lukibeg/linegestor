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

**Consequências.** O menu cai de 12 para 8 entradas no alto, e o Suporte tem três itens. Os guias de
uso, a nota do 2.0 e o vídeo falam dos nomes novos.
