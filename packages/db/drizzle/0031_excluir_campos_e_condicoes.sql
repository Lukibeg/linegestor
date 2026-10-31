ALTER TABLE "ticket_fields" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "negotiation_terms" jsonb;--> statement-breakpoint
-- 2.4: a Ativação dos módulos sai ("esse ativação dos módulos vc pode tirar n precisa"). O checklist dos módulos (o campo de
-- módulos que segue outro) é excluído; antes, deixa de ser pedido nas etapas e para abrir. O que os cards marcaram fica guardado.
UPDATE "ticket_stages" s SET "required_fields" = ARRAY(
  SELECT k FROM unnest(s."required_fields") AS k
  WHERE k NOT IN (SELECT 'campo:' || f."id" FROM "ticket_fields" f WHERE f."kind" = 'modulos' AND f."follows_field_id" IS NOT NULL AND f."deleted_at" IS NULL)
);
--> statement-breakpoint
UPDATE "ticket_panels" p SET "settings" = jsonb_set(p."settings", '{obrigatoriosAoAbrir}', coalesce((
  SELECT jsonb_agg(x) FROM jsonb_array_elements(p."settings"->'obrigatoriosAoAbrir') AS x
  WHERE x #>> '{}' NOT IN (SELECT 'campo:' || f."id" FROM "ticket_fields" f WHERE f."kind" = 'modulos' AND f."follows_field_id" IS NOT NULL AND f."deleted_at" IS NULL)
), '[]'::jsonb))
WHERE jsonb_typeof(p."settings"->'obrigatoriosAoAbrir') = 'array';
--> statement-breakpoint
UPDATE "ticket_fields" SET "deleted_at" = now(), "updated_at" = now()
WHERE "kind" = 'modulos' AND "follows_field_id" IS NOT NULL AND "deleted_at" IS NULL;
--> statement-breakpoint
-- 2.4: a caixinha que sai é excluída de verdade ("aqui eu quero excluir de fato e n desativar, os que eu já tiver desativado quero
-- que sejam excluídos"): as desativadas de hoje saem da lista (somem também dos cards que as marcaram).
UPDATE "ticket_fields" SET "options" = coalesce((
  SELECT jsonb_agg(o ORDER BY i) FROM jsonb_array_elements("options") WITH ORDINALITY AS t(o, i)
  WHERE coalesce(o->>'ativa', 'true') <> 'false'
), '[]'::jsonb), "updated_at" = now()
WHERE "kind" = 'caixinhas' AND "options" @> '[{"ativa": false}]'::jsonb;
--> statement-breakpoint
-- 2.4: a simulação nova traz 12 meses de contrato ("o prazo de contrato padrão tem q vir 12 meses"); quem nunca mudou o 24 de
-- fábrica nos Ajustes do Simulador passa para 12.
UPDATE "settings" SET "value" = jsonb_set("value"::jsonb, '{prazo}', '12'::jsonb)::text
WHERE "id" = 'comercial-simulador' AND ("value"::jsonb->>'prazo') = '24';
