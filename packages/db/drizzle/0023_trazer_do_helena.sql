-- Trazer do Helena (Patch 2.0.3, decisão 0054): o Luan, em 21/10, "pegue tudo que já ta no meu painel do
-- helena e migre para o nosso, inclusive o histórico para que eu possa usar o relatório". A negociação que
-- veio do Helena guarda o card de lá ("helena:<id do card>"): ao trazer de novo, ela é atualizada em vez de
-- virar outra. As que não vieram de fora ficam com nulo (o índice único deixa vários nulos).
ALTER TABLE "tickets" ADD COLUMN "external_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_external_ref_uq" ON "tickets" USING btree ("external_ref");
