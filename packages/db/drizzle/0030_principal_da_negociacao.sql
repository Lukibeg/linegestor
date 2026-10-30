ALTER TABLE "sales_simulations" ADD COLUMN "is_main" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Patch 2.3 (decisão 0052, revisto no 2.3): a principal de cada negociação é a simulação mexida por último (a que
-- a margem das ganhas já usava); daqui em diante, ela preenche o card sozinha, até a pessoa marcar outra.
UPDATE "sales_simulations" SET "is_main" = true
WHERE "id" IN (
  SELECT DISTINCT ON ("ticket_id") "id" FROM "sales_simulations"
  WHERE "ticket_id" IS NOT NULL AND "deleted_at" IS NULL
  ORDER BY "ticket_id", "updated_at" DESC, "created_at" DESC
);
