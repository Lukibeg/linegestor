CREATE TABLE "portal_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"number" serial NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text,
	"product_id" text,
	"module_id" text,
	"featured" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"author_id" text,
	"updated_by_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portal_files" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"data_base64" text,
	"disk_name" text,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portal_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "portal_users" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"active" boolean DEFAULT true NOT NULL,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"login_count" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_articles" ADD CONSTRAINT "portal_articles_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_articles" ADD CONSTRAINT "portal_articles_module_id_product_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."product_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_articles" ADD CONSTRAINT "portal_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_articles" ADD CONSTRAINT "portal_articles_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_files" ADD CONSTRAINT "portal_files_article_id_portal_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."portal_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_files" ADD CONSTRAINT "portal_files_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_articles_number_uq" ON "portal_articles" USING btree ("number");--> statement-breakpoint
CREATE INDEX "portal_articles_product_idx" ON "portal_articles" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "portal_files_article_idx" ON "portal_files" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "portal_sessions_user_idx" ON "portal_sessions" USING btree ("portal_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_users_email_uq" ON "portal_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_users_invite_uq" ON "portal_users" USING btree ("invite_token_hash");--> statement-breakpoint
CREATE INDEX "portal_users_client_idx" ON "portal_users" USING btree ("client_id");--> statement-breakpoint
-- Permissões novas do Portal do cliente (Patch 1.8). Escreve tutoriais e dá acesso aos clientes
-- quem já trabalha no dia a dia (quem trabalha nos projetos: Operador, Técnico) e quem administra.
UPDATE "roles"
   SET "permissions" = array_append("permissions", 'portal.write')
 WHERE ('projects.work' = ANY("permissions") OR 'admin.manage' = ANY("permissions"))
   AND NOT ('portal.write' = ANY("permissions"));--> statement-breakpoint
UPDATE "roles"
   SET "permissions" = array_append("permissions", 'portal.access')
 WHERE ('projects.work' = ANY("permissions") OR 'admin.manage' = ANY("permissions"))
   AND NOT ('portal.access' = ANY("permissions"));
