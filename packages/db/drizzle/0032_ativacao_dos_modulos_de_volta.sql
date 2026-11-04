-- 2.4.1: a Ativação dos módulos volta (o Luan, em 03/11: "gostaria de retroceder uma questão" — "Que ela volte"). Os checklists
-- dos módulos que a 0031 excluiu voltam para a Configuração, com o que os cards já tinham marcado (nada tinha sido apagado).
-- Só voltam os que ainda fazem sentido: a escolha que eles seguem (o Módulos a ativar) continua no painel, o grupo deles ainda
-- tem campo, nenhum outro campo ativo do painel tem o mesmo nome no mesmo produto, e ninguém os excluiu pela tela depois (a
-- auditoria diria). As regras de etapa que a 0031 tirou não voltam: a 0031 não guardou quais eram (o modelo não pedia nenhuma).
UPDATE "ticket_fields" f SET "deleted_at" = NULL, "updated_at" = now()
WHERE f."kind" = 'modulos' AND f."follows_field_id" IS NOT NULL AND f."deleted_at" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "ticket_fields" e WHERE e."id" = f."follows_field_id" AND e."deleted_at" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "ticket_fields" g
    WHERE g."panel_id" = f."panel_id" AND g."deleted_at" IS NULL AND g."id" <> f."id"
      AND lower(trim(g."section")) = lower(trim(f."section"))
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ticket_fields" o
    WHERE o."panel_id" = f."panel_id" AND o."deleted_at" IS NULL AND o."id" <> f."id"
      AND lower(trim(o."name")) = lower(trim(f."name")) AND o."product_id" IS NOT DISTINCT FROM f."product_id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "audit_log" a WHERE a."entity_type" = 'ticket_field' AND a."entity_id" = f."id" AND a."action" = 'delete'
  );
