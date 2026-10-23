-- A ordem à mão no quadro (Patch 2.1): o Luan, em 23/10, no quadro do Comercial — "quero poder trocar a
-- ordem aqui, pra cima ou pra baixo da mesma forma que mudo de fase arrastando". O lugar que a equipe escolheu
-- arrastando, nas etapas abertas do painel de Vendas (1 é o primeiro). Nulo: ninguém arrumou depois que o
-- chamado chegou na etapa (mudar de etapa apaga), e ele vai pela regra de sempre. Os que já existem ficam nulos.
ALTER TABLE "tickets" ADD COLUMN "board_position" integer;
