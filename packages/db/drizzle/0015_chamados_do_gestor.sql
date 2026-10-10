CREATE TABLE "ticket_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"note_id" text,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"data_base64" text NOT NULL,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_carrier_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"carrier_id" text,
	"carrier_name" text NOT NULL,
	"protocol" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promised_at" timestamp with time zone,
	"follow_up_hours" integer,
	"status" text DEFAULT 'aberto' NOT NULL,
	"closed_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"client_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"actor_name" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_links" (
	"id" text PRIMARY KEY NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_macros" (
	"id" text PRIMARY KEY NOT NULL,
	"panel_id" text,
	"name" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"action" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"user_id" text,
	"actor_name" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ticket_id" text,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_panels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"color" text DEFAULT 'accent' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"access" text DEFAULT 'todos' NOT NULL,
	"member_ids" text[] DEFAULT '{}' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"panel_id" text NOT NULL,
	"title" text NOT NULL,
	"customer_report" text,
	"client_id" text,
	"assignee_id" text,
	"subject_id" text,
	"priority" text,
	"checklist" text[] DEFAULT '{}' NOT NULL,
	"rule" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_ticket_code" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"panel_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'andamento' NOT NULL,
	"level" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"required_fields" text[] DEFAULT '{}' NOT NULL,
	"notify_user_ids" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_subjects" (
	"id" text PRIMARY KEY NOT NULL,
	"panel_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"checklist" text[] DEFAULT '{}' NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_time_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"user_id" text,
	"minutes" integer NOT NULL,
	"note" text,
	"worked_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"secret_id" text,
	"last_at" timestamp with time zone,
	"last_ok" boolean,
	"last_message" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"panel_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"number" integer NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'chamado' NOT NULL,
	"title" text NOT NULL,
	"customer_report" text,
	"description" text,
	"client_id" text,
	"contact_name" text,
	"contact_phone" text,
	"session_id" text,
	"origin" text DEFAULT 'manual' NOT NULL,
	"assignee_id" text,
	"watcher_ids" text[] DEFAULT '{}' NOT NULL,
	"subject_id" text,
	"type" text,
	"severity" text,
	"reach" text,
	"priority" text,
	"priority_reason" text,
	"product_ids" text[] DEFAULT '{}' NOT NULL,
	"carrier_ids" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"affected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"solution" text,
	"cause" text,
	"workaround" text,
	"validation" text,
	"parent_id" text,
	"problem_id" text,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"waits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alerts_sent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"schedule_id" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ticket_api_keys" ADD CONSTRAINT "ticket_api_keys_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_note_id_ticket_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."ticket_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_carrier_cases" ADD CONSTRAINT "ticket_carrier_cases_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_carrier_cases" ADD CONSTRAINT "ticket_carrier_cases_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_carrier_cases" ADD CONSTRAINT "ticket_carrier_cases_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_contacts" ADD CONSTRAINT "ticket_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_from_id_tickets_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_to_id_tickets_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_macros" ADD CONSTRAINT "ticket_macros_panel_id_ticket_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."ticket_panels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_macros" ADD CONSTRAINT "ticket_macros_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_notifications" ADD CONSTRAINT "ticket_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_notifications" ADD CONSTRAINT "ticket_notifications_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_schedules" ADD CONSTRAINT "ticket_schedules_panel_id_ticket_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."ticket_panels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_schedules" ADD CONSTRAINT "ticket_schedules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_schedules" ADD CONSTRAINT "ticket_schedules_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_schedules" ADD CONSTRAINT "ticket_schedules_subject_id_ticket_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."ticket_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_schedules" ADD CONSTRAINT "ticket_schedules_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_stages" ADD CONSTRAINT "ticket_stages_panel_id_ticket_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."ticket_panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_subjects" ADD CONSTRAINT "ticket_subjects_panel_id_ticket_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."ticket_panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_subjects" ADD CONSTRAINT "ticket_subjects_parent_id_ticket_subjects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ticket_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_time_entries" ADD CONSTRAINT "ticket_time_entries_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_time_entries" ADD CONSTRAINT "ticket_time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_webhooks" ADD CONSTRAINT "ticket_webhooks_secret_id_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_webhooks" ADD CONSTRAINT "ticket_webhooks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_panel_id_ticket_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."ticket_panels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_stage_id_ticket_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."ticket_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_subject_id_ticket_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."ticket_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_id_tickets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_problem_id_tickets_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_api_keys_hash_uq" ON "ticket_api_keys" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "ticket_attachments_ticket_idx" ON "ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_carrier_ticket_idx" ON "ticket_carrier_cases" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_contacts_phone_uq" ON "ticket_contacts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_links_from_idx" ON "ticket_links" USING btree ("from_id");--> statement-breakpoint
CREATE INDEX "ticket_links_to_idx" ON "ticket_links" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "ticket_notes_ticket_idx" ON "ticket_notes" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_notifications_user_idx" ON "ticket_notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_panels_key_uq" ON "ticket_panels" USING btree ("key");--> statement-breakpoint
CREATE INDEX "ticket_stages_panel_idx" ON "ticket_stages" USING btree ("panel_id");--> statement-breakpoint
CREATE INDEX "ticket_subjects_panel_idx" ON "ticket_subjects" USING btree ("panel_id");--> statement-breakpoint
CREATE INDEX "ticket_time_ticket_idx" ON "ticket_time_entries" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_code_uq" ON "tickets" USING btree ("code");--> statement-breakpoint
CREATE INDEX "tickets_panel_stage_idx" ON "tickets" USING btree ("panel_id","stage_id");--> statement-breakpoint
CREATE INDEX "tickets_client_idx" ON "tickets" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "tickets_assignee_idx" ON "tickets" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tickets_parent_idx" ON "tickets" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tickets_problem_idx" ON "tickets" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "tickets_session_idx" ON "tickets" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "tickets_phone_idx" ON "tickets" USING btree ("contact_phone");--> statement-breakpoint
-- Permissões novas dos chamados do Gestor (Patch 1.10, decisão 0047). Trabalhar nos chamados é de
-- quem já trabalha no dia a dia (quem trabalha nos projetos: Operador, Técnico) e de quem administra;
-- cuidar dos chamados (painéis, etapas, assuntos, prazos, avisos, lixeira) é da administração. Ver
-- continua sendo `support.read`.
UPDATE "roles"
   SET "permissions" = array_append("permissions", 'tickets.work')
 WHERE ('projects.work' = ANY("permissions") OR 'admin.manage' = ANY("permissions"))
   AND NOT ('tickets.work' = ANY("permissions"));--> statement-breakpoint
UPDATE "roles"
   SET "permissions" = array_append("permissions", 'tickets.manage')
 WHERE 'admin.manage' = ANY("permissions") AND NOT ('tickets.manage' = ANY("permissions"));--> statement-breakpoint
-- Os dois painéis com que o módulo nasce (os mesmos de PAINEIS_INICIAIS, em @gestor/shared/atendimento):
-- o Suporte, com N1, N2 e N3 como colunas, e o Desenvolvimento. Os assuntos nascem em branco.
INSERT INTO "ticket_panels" ("id", "name", "key", "description", "color", "sort_order", "settings") VALUES ('painel-suporte', 'Suporte', 'SUP', 'O suporte técnico aos clientes (o antigo Ingline - Suporte).', 'accent', 0, '{"tipos":["Incidente","Requisição","Dúvida","Mudança"],"contaPrazo":true,"fecharSozinhoDias":3,"obrigatoriosAoAbrir":[],"paiEsperaFilhos":true,"supervisores":[]}'::jsonb) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-suporte-novo', 'painel-suporte', 'Novo', 'entrada', NULL, 0, ARRAY[]::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-suporte-n1', 'painel-suporte', 'N1', 'andamento', 1, 1, ARRAY['cliente', 'relato']::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-suporte-n2', 'painel-suporte', 'N2', 'andamento', 2, 2, ARRAY['cliente', 'relato', 'assunto']::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-suporte-n3', 'painel-suporte', 'N3', 'andamento', 3, 3, ARRAY['cliente', 'relato', 'assunto']::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-suporte-observacao', 'painel-suporte', 'Em observação', 'andamento', NULL, 4, ARRAY['cliente', 'relato', 'assunto', 'solucao']::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-suporte-resolvido', 'painel-suporte', 'Resolvido', 'resolvido', NULL, 5, ARRAY['cliente', 'relato', 'assunto', 'tipo', 'gravidade', 'solucao', 'causa']::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-suporte-fechado', 'painel-suporte', 'Fechado', 'fechado', NULL, 6, ARRAY['cliente', 'relato', 'assunto', 'tipo', 'gravidade', 'solucao', 'causa']::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_panels" ("id", "name", "key", "description", "color", "sort_order", "settings") VALUES ('painel-desenvolvimento', 'Desenvolvimento', 'DEV', 'O que precisa de programação: correções e melhorias pedidas pelo suporte.', 'roxo', 1, '{"tipos":["Correção","Melhoria","Configuração","Análise"],"contaPrazo":false,"fecharSozinhoDias":null,"obrigatoriosAoAbrir":[],"paiEsperaFilhos":true,"supervisores":[]}'::jsonb) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-desenvolvimento-novo', 'painel-desenvolvimento', 'Novo', 'entrada', NULL, 0, ARRAY[]::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-desenvolvimento-analise', 'painel-desenvolvimento', 'Em análise', 'andamento', NULL, 1, ARRAY['relato']::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-desenvolvimento-desenvolvimento', 'painel-desenvolvimento', 'Em desenvolvimento', 'andamento', NULL, 2, ARRAY['relato']::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-desenvolvimento-teste', 'painel-desenvolvimento', 'Em teste', 'andamento', NULL, 3, ARRAY['relato']::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-desenvolvimento-entregue', 'painel-desenvolvimento', 'Entregue', 'resolvido', NULL, 4, ARRAY['relato', 'solucao']::text[]) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_stages" ("id", "panel_id", "name", "kind", "level", "sort_order", "required_fields") VALUES ('etapa-desenvolvimento-fechado', 'painel-desenvolvimento', 'Fechado', 'fechado', NULL, 5, ARRAY['relato', 'solucao']::text[]) ON CONFLICT DO NOTHING;
