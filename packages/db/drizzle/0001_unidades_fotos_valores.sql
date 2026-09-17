CREATE TABLE "client_units" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "device_model_images" (
	"model_id" text PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"data_base64" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_models" ADD COLUMN "value_cents" integer;--> statement-breakpoint
ALTER TABLE "device_movements" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "serial_number" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ssh_user" text;--> statement-breakpoint
ALTER TABLE "client_units" ADD CONSTRAINT "client_units_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_model_images" ADD CONSTRAINT "device_model_images_model_id_device_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_units_client_idx" ON "client_units" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "devices_serial_idx" ON "devices" USING btree ("serial_number");--> statement-breakpoint

-- ===================================================================================
-- Acertos nos dados que já estão no banco (escritos à mão; o que está acima é gerado)
-- ===================================================================================

-- 1) Todo cliente passa a ter a unidade "Matriz"
INSERT INTO "client_units" ("id", "client_id", "name", "is_main")
SELECT 'un' || substr(md5(random()::text || clock_timestamp()::text || c."id"), 1, 22), c."id", 'Matriz', true
FROM "clients" c;
--> statement-breakpoint

-- 2) As unidades já digitadas nos aparelhos viram unidades cadastradas do cliente
INSERT INTO "client_units" ("id", "client_id", "name", "is_main")
SELECT 'un' || substr(md5(random()::text || clock_timestamp()::text || x."client_id" || x."unit"), 1, 22), x."client_id", x."unit", false
FROM (
  SELECT DISTINCT d."client_id", btrim(d."unit") AS "unit"
  FROM "devices" d
  WHERE d."client_id" IS NOT NULL AND d."deleted_at" IS NULL AND btrim(coalesce(d."unit", '')) <> ''
) x
WHERE lower(x."unit") <> 'matriz';
--> statement-breakpoint

-- 3) O valor passa a morar no modelo: cada modelo recebe o valor mais comum entre os seus
--    aparelhos, e quem tinha exatamente esse valor passa a "usar o do modelo".
--    A soma de cada cliente não muda nem um centavo.
UPDATE "device_models" m SET "value_cents" = v."valor"
FROM (
  SELECT DISTINCT ON ("model_id") "model_id", "value_cents" AS "valor"
  FROM "devices"
  WHERE "value_cents" IS NOT NULL AND "deleted_at" IS NULL
  GROUP BY "model_id", "value_cents"
  ORDER BY "model_id", count(*) DESC, "value_cents" DESC
) v
WHERE v."model_id" = m."id" AND m."value_cents" IS NULL;
--> statement-breakpoint
UPDATE "devices" d SET "value_cents" = NULL
FROM "device_models" m
WHERE m."id" = d."model_id" AND d."value_cents" = m."value_cents";
--> statement-breakpoint

-- 4) Datas de ativação que caíam um dia antes: a tela gravava "dia X à meia-noite em UTC",
--    que no Brasil ainda é o dia X-1. Passam para o meio-dia do mesmo dia, que é o dia X
--    em qualquer fuso do país. Só mexe no que está exatamente à meia-noite UTC.
UPDATE "subscriptions" SET "activated_at" = "activated_at" + interval '12 hours'
WHERE "activated_at" IS NOT NULL AND ("activated_at" AT TIME ZONE 'UTC')::time = '00:00:00';
--> statement-breakpoint
UPDATE "subscriptions" SET "deactivated_at" = "deactivated_at" + interval '12 hours'
WHERE "deactivated_at" IS NOT NULL AND ("deactivated_at" AT TIME ZONE 'UTC')::time = '00:00:00';
--> statement-breakpoint
UPDATE "subscription_modules" SET "activated_at" = "activated_at" + interval '12 hours'
WHERE "activated_at" IS NOT NULL AND ("activated_at" AT TIME ZONE 'UTC')::time = '00:00:00';
--> statement-breakpoint
UPDATE "subscription_modules" SET "deactivated_at" = "deactivated_at" + interval '12 hours'
WHERE "deactivated_at" IS NOT NULL AND ("deactivated_at" AT TIME ZONE 'UTC')::time = '00:00:00';
--> statement-breakpoint

-- 5) Acentos embaralhados vindos da importação ("PeÃ§as" vira "Peças").
--    Só mexe em texto com o padrão típico (Ã ou Â seguido de um caractere entre U+0080 e U+00BF)
--    e só se a conversão der um texto válido; qualquer outro caso fica exatamente como está.
CREATE OR REPLACE FUNCTION pg_temp.consertar_acentos(t text) RETURNS text AS $$
BEGIN
  IF t IS NULL OR t !~ '[ÃÂ][-¿]' THEN RETURN t; END IF;
  BEGIN
    RETURN convert_from(convert_to(t, 'LATIN1'), 'UTF8');
  EXCEPTION WHEN others THEN
    RETURN t;
  END;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
UPDATE "clients" SET "trade_name" = pg_temp.consertar_acentos("trade_name"), "legal_name" = pg_temp.consertar_acentos("legal_name"), "notes" = pg_temp.consertar_acentos("notes")
WHERE "trade_name" ~ '[ÃÂ][-¿]' OR "legal_name" ~ '[ÃÂ][-¿]' OR "notes" ~ '[ÃÂ][-¿]';
--> statement-breakpoint
UPDATE "circuits" SET "name" = pg_temp.consertar_acentos("name"), "notes" = pg_temp.consertar_acentos("notes")
WHERE "name" ~ '[ÃÂ][-¿]' OR "notes" ~ '[ÃÂ][-¿]';
--> statement-breakpoint
UPDATE "dids" SET "note" = pg_temp.consertar_acentos("note") WHERE "note" ~ '[ÃÂ][-¿]';
--> statement-breakpoint
UPDATE "subscriptions" SET "notes" = pg_temp.consertar_acentos("notes") WHERE "notes" ~ '[ÃÂ][-¿]';
--> statement-breakpoint
UPDATE "subscription_modules" SET "notes" = pg_temp.consertar_acentos("notes") WHERE "notes" ~ '[ÃÂ][-¿]';
--> statement-breakpoint
UPDATE "devices" SET "unit" = pg_temp.consertar_acentos("unit"), "note" = pg_temp.consertar_acentos("note")
WHERE "unit" ~ '[ÃÂ][-¿]' OR "note" ~ '[ÃÂ][-¿]';
--> statement-breakpoint
UPDATE "client_units" SET "name" = pg_temp.consertar_acentos("name") WHERE "name" ~ '[ÃÂ][-¿]';
--> statement-breakpoint
UPDATE "device_models" SET "name" = pg_temp.consertar_acentos("name") WHERE "name" ~ '[ÃÂ][-¿]';
