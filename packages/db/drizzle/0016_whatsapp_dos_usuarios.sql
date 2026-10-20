ALTER TABLE "users" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_avisos" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- O WhatsApp de cada pessoa sai dos Ajustes dos chamados (a lista "pessoas" de settings.atendimento-avisos)
-- e vem para o usuário (Patch 2.0.1, o pedido do Luan: "pode ficar na parte de usuários que já existe").
-- O número já está só com os dígitos (a tela gravava assim); quem estava pausado continua pausado.
UPDATE "users" AS u
   SET "whatsapp" = p.item ->> 'numero',
       "whatsapp_avisos" = COALESCE((p.item ->> 'ativo')::boolean, true)
  FROM "settings" AS s,
       jsonb_array_elements(CASE WHEN jsonb_typeof(s."value"::jsonb -> 'pessoas') = 'array' THEN s."value"::jsonb -> 'pessoas' ELSE '[]'::jsonb END) AS p(item)
 WHERE s."id" = 'atendimento-avisos'
   AND p.item ->> 'userId' = u."id"
   AND COALESCE(p.item ->> 'numero', '') <> '';--> statement-breakpoint
-- A lista sai dos ajustes: o número mora agora só no usuário.
UPDATE "settings" SET "value" = ("value"::jsonb - 'pessoas')::text WHERE "id" = 'atendimento-avisos';
