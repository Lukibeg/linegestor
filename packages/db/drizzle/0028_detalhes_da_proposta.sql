-- Patch 2.3 (decisão 0057): os campos que vieram do Helena num painel de Vendas vão para a parte "Detalhes da proposta"
-- (o Luan, 29/10: "esses pontos aqui que vieram do helena eles são importantes, quero que eles fiquem … só pra eles,
-- chamado detalhes da proposta, e … no painel principal"). Só os que ainda não têm parte; mudar depois é em
-- Painéis › Ajustes › Campos › Parte da ficha.
UPDATE "ticket_fields" SET "section" = 'Detalhes da proposta', "updated_at" = now()
WHERE "section" IS NULL
  AND "help" = 'Trazido do Helena.'
  AND "panel_id" IN (SELECT "id" FROM "ticket_panels" WHERE "kind" = 'vendas');

--> statement-breakpoint
-- Os Contatos principais saem do Comercial (o Luan, 29/10: "já tem essa parte de contatos na lateral, ent n precisa
-- dessa"): o campo fica desativado (o que foi escrito nele continua guardado) e deixa de ser pedido para abrir e nas etapas.
UPDATE "ticket_fields" SET "active" = false, "updated_at" = now()
WHERE "name" = 'Contatos principais' AND "kind" = 'texto_longo' AND "active"
  AND "panel_id" IN (SELECT "id" FROM "ticket_panels" WHERE "kind" = 'vendas');
--> statement-breakpoint
UPDATE "ticket_stages" s SET "required_fields" = array_remove(s."required_fields", 'campo:' || f."id")
FROM "ticket_fields" f
WHERE f."panel_id" = s."panel_id" AND f."name" = 'Contatos principais' AND f."kind" = 'texto_longo' AND NOT f."active"
  AND ('campo:' || f."id") = ANY(s."required_fields");
--> statement-breakpoint
UPDATE "ticket_panels" p SET "settings" = jsonb_set(p."settings", '{obrigatoriosAoAbrir}',
  coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(p."settings"->'obrigatoriosAoAbrir') x WHERE x #>> '{}' <> 'campo:' || f."id"), '[]'::jsonb))
FROM "ticket_fields" f
WHERE f."panel_id" = p."id" AND f."name" = 'Contatos principais' AND f."kind" = 'texto_longo' AND NOT f."active"
  AND p."settings"->'obrigatoriosAoAbrir' @> to_jsonb('campo:' || f."id");
