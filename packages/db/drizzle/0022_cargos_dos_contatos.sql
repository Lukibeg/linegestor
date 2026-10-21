-- Os cargos dos contatos (Patch 2.0.2, decisão 0053): o Luan, 21/10, "eu quero que esses cargos sejam
-- pré-seleção". O catálogo fica em Administração › Catálogos, como as operadoras; a janela do contato só
-- oferece os ativos. O contato continua guardando o nome do cargo (client_contacts.role).
CREATE TABLE "contact_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "contact_roles_name_unique" UNIQUE("name")
);--> statement-breakpoint
-- Os de fábrica (os mesmos de CARGOS_DE_FABRICA, em @gestor/shared/atendimento).
INSERT INTO "contact_roles" ("id", "name") VALUES
  ('cargo-administrativo', 'Administrativo'),
  ('cargo-atendimento', 'Atendimento'),
  ('cargo-comercial', 'Comercial'),
  ('cargo-compras', 'Compras'),
  ('cargo-diretoria', 'Diretoria'),
  ('cargo-financeiro', 'Financeiro'),
  ('cargo-gerencia', 'Gerência'),
  ('cargo-pos-vendas', 'Pós-vendas'),
  ('cargo-proprietario', 'Proprietário ou sócio'),
  ('cargo-recepcao', 'Recepção'),
  ('cargo-rh', 'RH'),
  ('cargo-ti', 'TI')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- O cargo de antes que é um destes, escrito de outro jeito ("financeiro", "TI "), fica com o nome da lista.
-- O resto (o que não está na lista) fica como está, até alguém trocar.
UPDATE "client_contacts" AS c
   SET "role" = r."name"
  FROM "contact_roles" AS r
 WHERE c."role" IS NOT NULL
   AND lower(btrim(c."role")) = lower(r."name")
   AND c."role" <> r."name";
