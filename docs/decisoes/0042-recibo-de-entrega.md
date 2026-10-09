# 0042 — Recibo de entrega na movimentação

**Contexto.** Em 09/10, com o 1.9 (Relatórios do Inventário) na prévia, o Luan pediu: "na hora de
fazer uma movimentação para um cliente, quero também poder anexar um arquivo, que no caso seria o
recibo de entrega". O recibo assinado é a prova de que o cliente recebeu os aparelhos — e o aparelho
é nosso (comodato e locação). Até aqui ele ficava fora do sistema (papel, e-mail, celular de quem
entregou). Como o 1.9 ainda não subiu, o recibo entrou no mesmo patch.

**Decisão.**

- **Só a movimentação para um cliente** (locação, comodato ou venda) tem recibo. A devolução não
  (o campo não aparece, e o servidor recusa).
- **PDF ou foto** (JPG, PNG ou WEBP), **até 10 MB por arquivo e até 5 arquivos** por movimentação (o
  recibo de duas páginas fotografado são duas fotos). O tipo é conferido **pelos primeiros bytes**
  do arquivo, no navegador e de novo no servidor — o ".pdf" que não é PDF avisa na hora — e o que
  fica guardado é o tipo de verdade, não o que o navegador disse.
- **A foto é reduzida no navegador** antes de subir (no máximo 2.000 px no lado maior, em JPEG): a
  foto de 4 MB do celular vira umas centenas de KB e o recibo continua legível. A foto pequena sobe
  como está.
- **Na hora ou depois.** No Movimentar, o campo **Recibo de entrega** (opcional) fica embaixo da
  observação. A movimentação é gravada primeiro e cada arquivo sobe em seguida, um por vez (pelo
  mesmo caminho do "anexar depois"); se um falhar, a movimentação fica e o aviso diz qual arquivo
  anexar de novo. Depois, quando o recibo assinado volta, ele se anexa na **lista de
  movimentações** (Inventário › Movimentações e ficha do cliente › Equipamentos › Movimentações):
  abre a linha, **Anexar o recibo**.
- **Onde aparece**: a coluna **Recibo** da lista (o clipe, com o número de arquivos quando é mais
  de um), a linha aberta (os arquivos, o tirar e o anexar) e o **Histórico** da ficha do aparelho.
  **A foto abre na tela** (com o Baixar); **o PDF baixa** — a política de segurança do site
  (`object-src 'none'`, no Caddyfile) não deixa o leitor de PDF do navegador abrir dentro do sistema,
  e baixar funciona em todo navegador.
- **Quem pode**: anexar e tirar, quem movimenta aparelhos (`devices.move`); ver e baixar, quem vê o
  inventário (`records.read`). Sem permissão nova.
- **Nada se apaga de verdade**: tirar um arquivo só marca `deletedAt` (ele some da tela e não abre
  mais), e anexar e tirar ficam na **auditoria** ("Anexou o recibo de entrega … à locação para …",
  "Tirou …"), sempre sem o arquivo.
- **Fica no próprio banco** (`device_movement_receipts`, migração `0011`), como os anexos dos
  projetos e da base de conhecimento: entra no backup sem mudar nada. As listas mandam só o nome, o
  tipo, o tamanho, quem e quando — nunca o arquivo.
- **As regras moram em `packages/shared/src/recibo.ts`** (`tipoDoRecibo`, `problemaDoRecibo`,
  `problemaParaAnexar`), as mesmas no servidor, na tela e na prévia.

**Consequências.**

- Rotas novas: `POST /api/inventory/movements/:id/recibos`, `GET /api/inventory/recibos/:id`
  (`?baixar=1` baixa a foto também) e `DELETE /api/inventory/recibos/:id`. A lista de movimentações
  e a ficha do aparelho passam a mandar `recibos` em cada movimentação.
- O 1.9 passou a ter migração (a `0011`), que roda sozinha no `publicar.sh`.
- A prévia tem dois recibos de exemplo: a foto do recibo do DP722 da Unidade Simões Filho do
  Hospital (abre na tela) e o PDF da locação da Distribuidora (no claude.ai o PDF não baixa; no
  sistema, baixa). Os dois saem de `scripts/gerar-recibo-demo.py`.
- **Ficaram de fora**, para quando ele pedir: um filtro "sem recibo" na lista de movimentações (o
  histórico que veio do Nexus não tem recibo e ficaria todo marcado), o recibo na devolução e o
  próprio Gestor gerar o recibo da movimentação para imprimir e assinar (a Relação do cliente, do
  1.9, já imprime a lista com o campo de assinatura).
