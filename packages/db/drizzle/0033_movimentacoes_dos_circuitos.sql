CREATE TABLE "circuit_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"circuit_ids" text[] DEFAULT '{}' NOT NULL,
	"did_numbers" text[] DEFAULT '{}' NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circuit_movements" ADD CONSTRAINT "circuit_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circuit_movements_created_idx" ON "circuit_movements" USING btree ("created_at");--> statement-breakpoint
-- 2.4.1: a aba Movimentações nasce com o que a auditoria já guardava dos circuitos e dos DIDs (desde o começo do sistema).
-- Cada linha da auditoria vira uma movimentação, com o mesmo id, a mesma pessoa e a mesma hora. A edição de um circuito ou de
-- um DID leva o antes e o depois (a tela escreve só o que mudou); a faixa de DIDs leva os números (refeitos do primeiro e da
-- quantidade); as alterações em massa e a lixeira em massa antigas não diziam quais números, e ficam só com a frase.
WITH base AS (
  SELECT a.*,
    substring(a.summary from '\((\d+)[–-]') AS primeiro,
    nullif(substring(a.summary from '^Criou (\d+) DIDs'), '')::int AS quantos,
    CASE
      WHEN a.entity_type = 'circuit' THEN a.entity_id
      WHEN a.entity_type = 'did' AND a.action = 'bulk_create' THEN coalesce(a.after->>'circuitId', a.entity_id)
    END AS circuito
  FROM "audit_log" a
  WHERE (a.entity_type = 'circuit' AND a.action IN ('create', 'update', 'delete', 'restore'))
     OR (a.entity_type = 'did' AND a.action IN ('bulk_create', 'update', 'bulk_update', 'bulk_delete', 'restore'))
     OR (a.action = 'import' AND a.entity_type IN ('circuits', 'dids'))
),
faixa AS (
  SELECT b.id, ARRAY(
    SELECT lpad((b.primeiro::numeric + g)::text, length(b.primeiro), '0') FROM generate_series(0, b.quantos - 1) AS g
  ) AS numeros
  FROM base b
  WHERE b.entity_type = 'did' AND b.action = 'bulk_create' AND b.primeiro ~ '^\d{10,11}$' AND b.quantos BETWEEN 1 AND 10000
),
escrito AS (
  SELECT f.id, f.numeros,
    (SELECT string_agg(CASE
       WHEN length(x) = 10 THEN '(' || substr(x, 1, 2) || ') ' || substr(x, 3, 4) || '-' || substr(x, 7)
       WHEN length(x) = 11 AND x LIKE '0800%' THEN '0800 ' || substr(x, 5, 3) || ' ' || substr(x, 8)
       WHEN length(x) = 11 THEN '(' || substr(x, 1, 2) || ') ' || substr(x, 3, 5) || '-' || substr(x, 8)
       ELSE x END, ' a ' ORDER BY o)
     FROM unnest(ARRAY[f.numeros[1], f.numeros[array_length(f.numeros, 1)]]) WITH ORDINALITY AS t(x, o)) AS de_a
  FROM faixa f
)
INSERT INTO "circuit_movements" ("id", "user_id", "kind", "circuit_ids", "did_numbers", "summary", "details", "created_at")
SELECT b.id, b.user_id,
  CASE
    WHEN b.entity_type = 'circuit' AND b.action = 'create' THEN 'circuito_criado'
    WHEN b.entity_type = 'circuit' AND b.action = 'update' THEN 'circuito_editado'
    WHEN b.entity_type = 'circuit' AND b.action = 'delete' THEN 'circuito_lixeira'
    WHEN b.entity_type = 'circuit' AND b.action = 'restore' THEN 'circuito_restaurado'
    WHEN b.action = 'bulk_create' THEN 'dids_criados'
    WHEN b.entity_type = 'did' AND b.action = 'update' THEN 'did_editado'
    WHEN b.action = 'bulk_update' THEN 'dids_editados'
    WHEN b.action = 'bulk_delete' THEN 'dids_lixeira'
    WHEN b.entity_type = 'did' AND b.action = 'restore' THEN 'did_restaurado'
    ELSE 'importacao'
  END,
  CASE
    WHEN b.circuito IS NOT NULL THEN ARRAY[b.circuito]
    WHEN b.entity_type = 'did' AND b.action = 'update' THEN array_remove(ARRAY[
      b.before->>'circuitId', CASE WHEN (b.after->>'circuitId') IS DISTINCT FROM (b.before->>'circuitId') THEN b.after->>'circuitId' END], NULL)
    WHEN b.entity_type = 'did' AND b.action = 'restore' THEN array_remove(ARRAY[(SELECT d."circuit_id" FROM "dids" d WHERE d."id" = b.entity_id)], NULL)
    ELSE '{}'::text[]
  END,
  CASE
    WHEN e.numeros IS NOT NULL THEN e.numeros
    WHEN b.entity_type = 'did' AND b.action = 'update' THEN array_remove(ARRAY[b.after->>'number'], NULL)
    WHEN b.entity_type = 'did' AND b.action = 'restore' THEN array_remove(ARRAY[(SELECT d."number" FROM "dids" d WHERE d."id" = b.entity_id)], NULL)
    ELSE '{}'::text[]
  END,
  CASE
    WHEN e.de_a IS NOT NULL THEN 'Criou ' || b.quantos || ' DIDs (' || e.de_a || ')'
      || coalesce(' no circuito ' || (SELECT c."name" FROM "circuits" c WHERE c."id" = b.circuito), '')
    WHEN b.action = 'import' THEN 'Importou a planilha de ' || CASE WHEN b.entity_type = 'dids' THEN 'DIDs' ELSE 'circuitos' END || ': '
      || coalesce(substring(b.summary from '(\d+) criado'), '0') || ' novo(s), ' || coalesce(substring(b.summary from '(\d+) atualizado'), '0') || ' alterado(s)'
    ELSE b.summary
  END,
  CASE
    WHEN b.action = 'update' THEN jsonb_build_object('antes', b.before, 'depois', b.after)
    WHEN b.entity_type = 'circuit' AND b.action = 'create' AND b.after IS NOT NULL THEN jsonb_build_object('depois', b.after)
    WHEN b.action = 'bulk_create' AND b.after IS NOT NULL THEN jsonb_build_object('depois', jsonb_build_object(
      'circuitId', b.circuito, 'clientId', b.after->'clientId', 'note', b.after->'note', 'inUse', false))
    WHEN b.action = 'import' THEN jsonb_build_object('importacao', jsonb_build_object(
      'entidade', CASE WHEN b.entity_type = 'dids' THEN 'dids' ELSE 'circuitos' END,
      'criados', coalesce(substring(b.summary from '(\d+) criado'), '0')::int,
      'alterados', coalesce(substring(b.summary from '(\d+) atualizado'), '0')::int))
  END,
  b.created_at
FROM base b
LEFT JOIN escrito e ON e.id = b.id
ON CONFLICT ("id") DO NOTHING;
