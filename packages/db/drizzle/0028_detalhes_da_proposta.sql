-- Patch 2.3 (decisão 0057): os campos que vieram do Helena num painel de Vendas vão para a parte "Detalhes da proposta"
-- (o Luan, 29/10: "esses pontos aqui que vieram do helena eles são importantes, quero que eles fiquem … só pra eles,
-- chamado detalhes da proposta, e … no painel principal"). Só os que ainda não têm parte; mudar depois é em
-- Painéis › Ajustes › Campos › Parte da ficha.
UPDATE "ticket_fields" SET "section" = 'Detalhes da proposta', "updated_at" = now()
WHERE "section" IS NULL
  AND "help" = 'Trazido do Helena.'
  AND "panel_id" IN (SELECT "id" FROM "ticket_panels" WHERE "kind" = 'vendas');
