CREATE TABLE "knowledge_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"number" serial NOT NULL,
	"title" text NOT NULL,
	"symptom" text,
	"resolution" text,
	"cause" text,
	"customer_terms" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"mandatory_since" timestamp with time zone,
	"mandatory_by_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"author_id" text,
	"updated_by_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "knowledge_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"data_base64" text NOT NULL,
	"inline" boolean DEFAULT false NOT NULL,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "knowledge_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "knowledge_links" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_reads" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"symptom" text,
	"resolution" text,
	"cause" text,
	"customer_terms" text[] DEFAULT '{}' NOT NULL,
	"note" text,
	"edited_by_id" text,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_mandatory_by_id_users_id_fk" FOREIGN KEY ("mandatory_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_attachments" ADD CONSTRAINT "knowledge_attachments_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_attachments" ADD CONSTRAINT "knowledge_attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_comments" ADD CONSTRAINT "knowledge_comments_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_comments" ADD CONSTRAINT "knowledge_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_reads" ADD CONSTRAINT "knowledge_reads_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_reads" ADD CONSTRAINT "knowledge_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_articles_number_uq" ON "knowledge_articles" USING btree ("number");--> statement-breakpoint
CREATE INDEX "knowledge_articles_status_idx" ON "knowledge_articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_attachments_article_idx" ON "knowledge_attachments" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "knowledge_comments_article_idx" ON "knowledge_comments" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_links_uq" ON "knowledge_links" USING btree ("article_id","kind","target");--> statement-breakpoint
CREATE INDEX "knowledge_links_target_idx" ON "knowledge_links" USING btree ("kind","target");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_reads_uq" ON "knowledge_reads" USING btree ("article_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_versions_uq" ON "knowledge_versions" USING btree ("article_id","version");--> statement-breakpoint
-- Permissões novas da Base de conhecimento (Patch 1.8). Escreve quem já trabalha no dia a dia
-- (quem trabalha nos projetos: Operador, Técnico) e quem administra; cuidar da base (leitura
-- obrigatória, rascunhos de todos, lixeira dos artigos) é da administração. Ler é `records.read`.
UPDATE "roles"
   SET "permissions" = array_append("permissions", 'knowledge.write')
 WHERE ('projects.work' = ANY("permissions") OR 'admin.manage' = ANY("permissions"))
   AND NOT ('knowledge.write' = ANY("permissions"));--> statement-breakpoint
UPDATE "roles"
   SET "permissions" = array_append("permissions", 'knowledge.manage')
 WHERE 'admin.manage' = ANY("permissions") AND NOT ('knowledge.manage' = ANY("permissions"));
