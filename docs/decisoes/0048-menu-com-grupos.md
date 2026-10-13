# 0048 — O menu lateral com grupos

**Contexto.** Com o módulo de chamados (0047), o menu lateral chegou a 12 itens: Chamados e Chamados do
LineChat lado a lado, Base de conhecimento e Portal do cliente separados, e o Importar / Exportar com
ícone próprio. Em 13/10, na prévia do 1.10, o Luan pediu: *"está ficando muitas abas laterais, acho que
podemos dar uma subdivisão: um ícone Suporte e dentro dele os chamados, os tickets e os relatórios; a
exportação não precisa ter um ícone próprio, pode ficar dentro de configurações; e a base de
conhecimento pode ter um pai, com a base interna e a base dos clientes"*. Como o 1.10 ainda não subiu,
entrou nele.

**Decisão.**

- **Dois grupos no menu.** **Suporte**: **Chamados** (o módulo novo, `/atendimento`), **Tickets do
  LineChat** (a cópia de leitura dos chamados antigos, `/chamados`) e **Relatórios** (os relatórios
  deles, `/chamados/relatorios`). **Base de conhecimento**: **Base interna** (`/base`) e **Base dos
  clientes** (o portal do cliente: os tutoriais e quem entra, `/portal-do-cliente`). Os endereços não
  mudaram; o título de cada tela passou a ser o nome do item no menu.
- **O Importar / Exportar mora na Administração**, numa aba própria (`/admin/dados`), para quem pode
  importar ou exportar — a Administração aparece no menu para essas pessoas também. O endereço antigo
  (`/dados`) leva para lá.
- **Como o grupo se comporta.** O nome abre e fecha a lista (recuada, com uma linha do lado); o grupo
  da tela aberta abre sozinho, e cada pessoa abre e fecha os outros (o navegador lembra). Fechado, o
  grupo fica marcado quando a tela aberta é dele e mostra a soma dos números de dentro (a leitura
  obrigatória da Base interna aparece no grupo). Com o menu recolhido (só ícones), o ícone do grupo
  abre a lista ao lado, que fecha ao escolher, com Esc ou clicando fora. No celular, o menu abre por
  cima, com os grupos.
- **"Tickets do LineChat"** é o nome dos antigos em todo lugar onde eles aparecem como tela (o menu, o
  título, a seção da ficha do cliente); a parte dos Ajustes que liga a leitura continua **Administração
  › Ajustes › Chamados do LineChat**, porque é o nome da integração.

**Consequências.** O menu cai de 12 para 9 entradas no alto. Os guias de uso, a nota do 1.10 e o vídeo
falam dos nomes novos.
