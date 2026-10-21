DROP INDEX "ticket_tags_name_key_uq";--> statement-breakpoint
ALTER TABLE "ticket_fields" ADD COLUMN "inline_options" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- =====================================================================
--  AS ETIQUETAS POR PAINEL (2.0.3, o pedido do Luan: "as etiquetas tem q ser por painel, cada painel vai ter suas
--  etiquetas"). A coluna nasce vazia; cada etiqueta vai para os painéis dos chamados que a têm (os da lixeira
--  também: restaurado, o chamado acha a etiqueta com a cor dela), com o mesmo nome e a mesma cor. A que nenhum
--  chamado tem vai para os painéis de chamados (Gestão), não para os de Vendas — as de hoje nasceram no Suporte
--  (o robô, a NIA).
-- =====================================================================
ALTER TABLE "ticket_tags" ADD COLUMN "panel_id" text;--> statement-breakpoint
CREATE TEMP TABLE "etiqueta_painel" ON COMMIT DROP AS
  SELECT DISTINCT tt.id AS etiqueta_id, t.panel_id
    FROM ticket_tags tt
    JOIN tickets t ON EXISTS (SELECT 1 FROM unnest(t.tags) AS x WHERE lower(x) = lower(tt.name))
  UNION
  SELECT tt.id, p.id
    FROM ticket_tags tt CROSS JOIN ticket_panels p
   WHERE p.kind <> 'vendas'
     AND NOT EXISTS (SELECT 1 FROM tickets t, unnest(t.tags) AS x WHERE lower(x) = lower(tt.name));--> statement-breakpoint
-- a linha que já existe fica com o primeiro painel; os outros ganham uma cópia (o mesmo nome, a mesma cor)
INSERT INTO ticket_tags (id, panel_id, name, name_key, color, created_by_id, created_at, updated_at)
  SELECT substr(md5(random()::text || clock_timestamp()::text || ep.etiqueta_id || ep.panel_id), 1, 24),
         ep.panel_id, tt.name, tt.name_key, tt.color, tt.created_by_id, tt.created_at, now()
    FROM (SELECT etiqueta_id, panel_id, row_number() OVER (PARTITION BY etiqueta_id ORDER BY panel_id) AS n FROM etiqueta_painel) ep
    JOIN ticket_tags tt ON tt.id = ep.etiqueta_id
   WHERE ep.n > 1;--> statement-breakpoint
UPDATE ticket_tags tt SET panel_id = ep.panel_id
  FROM (SELECT etiqueta_id, panel_id, row_number() OVER (PARTITION BY etiqueta_id ORDER BY panel_id) AS n FROM etiqueta_painel) ep
 WHERE ep.etiqueta_id = tt.id AND ep.n = 1;--> statement-breakpoint
-- sem painel de chamados nenhum e sem uso: só uma sugestão, que sai (nenhum chamado perde nada)
DELETE FROM ticket_tags WHERE panel_id IS NULL;--> statement-breakpoint
ALTER TABLE "ticket_tags" ALTER COLUMN "panel_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_tags" ADD CONSTRAINT "ticket_tags_panel_id_ticket_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."ticket_panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_tags_painel_nome_uq" ON "ticket_tags" USING btree ("panel_id","name_key");--> statement-breakpoint
-- =====================================================================
--  A INDICAÇÃO DO COMERCIAL VIRA LISTA (2.0.3, o pedido do Luan: "a indicação tem q ser predefinido e eu tenho que
--  conseguir criar por aqui mesmo se quiser"). O campo "Indicação" (texto) de cada painel de Vendas passa a ser uma
--  lista em que se inclui na hora; o que já foi escrito nas negociações vira opção (sem repetir, sem ligar para
--  maiúscula) e cada negociação fica com a opção dela. O campo é o mesmo (o id não muda): nada se perde.
-- =====================================================================
CREATE TEMP TABLE "indicacao_opcao" ON COMMIT DROP AS
  SELECT DISTINCT ON (v.campo_id, lower(v.nome)) v.campo_id, v.nome,
         substr(md5(random()::text || clock_timestamp()::text || v.campo_id || v.nome), 1, 24) AS opcao_id
    FROM (
      SELECT f.id AS campo_id, left(btrim(t.custom_fields ->> f.id), 60) AS nome, t.created_at
        FROM ticket_fields f
        JOIN ticket_panels p ON p.id = f.panel_id AND p.kind = 'vendas'
        JOIN tickets t ON jsonb_typeof(t.custom_fields -> f.id) = 'string'
       WHERE f.kind = 'texto' AND f.name = 'Indicação' AND btrim(t.custom_fields ->> f.id) <> ''
    ) v
   ORDER BY v.campo_id, lower(v.nome), v.created_at;--> statement-breakpoint
UPDATE tickets t SET custom_fields = jsonb_set(t.custom_fields, ARRAY[o.campo_id], to_jsonb(o.opcao_id))
  FROM indicacao_opcao o
 WHERE jsonb_typeof(t.custom_fields -> o.campo_id) = 'string'
   AND lower(left(btrim(t.custom_fields ->> o.campo_id), 60)) = lower(o.nome);--> statement-breakpoint
-- o texto em branco não é opção nenhuma: sai (o campo fica vazio, como estava na tela)
UPDATE tickets t SET custom_fields = t.custom_fields - f.id
  FROM ticket_fields f JOIN ticket_panels p ON p.id = f.panel_id AND p.kind = 'vendas'
 WHERE f.kind = 'texto' AND f.name = 'Indicação'
   AND jsonb_typeof(t.custom_fields -> f.id) = 'string' AND btrim(t.custom_fields ->> f.id) = '';--> statement-breakpoint
UPDATE ticket_fields f
   SET kind = 'lista', inline_options = true, updated_at = now(),
       options = COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.opcao_id, 'nome', o.nome, 'ativa', true) ORDER BY lower(o.nome))
                             FROM indicacao_opcao o WHERE o.campo_id = f.id), '[]'::jsonb),
       help = CASE WHEN f.help = 'Quem indicou: a pessoa ou a empresa.' THEN 'Quem indicou: a pessoa ou a empresa. Não está na lista? Escreva o nome e inclua.' ELSE f.help END
  FROM ticket_panels p
 WHERE p.id = f.panel_id AND p.kind = 'vendas' AND f.kind = 'texto' AND f.name = 'Indicação';
