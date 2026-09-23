CREATE TABLE "linechat_card_moves" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"from_step_id" text,
	"from_step_title" text,
	"to_step_id" text,
	"to_step_title" text,
	"at" timestamp with time zone NOT NULL,
	"estimated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linechat_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"panel_id" text NOT NULL,
	"number" integer,
	"key" text,
	"title" text DEFAULT '' NOT NULL,
	"description" text,
	"step_id" text,
	"step_title" text,
	"step_phase" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"responsible_id" text,
	"responsible_name" text,
	"due_date" timestamp with time zone,
	"is_overdue" boolean DEFAULT false NOT NULL,
	"tag_ids" text[] DEFAULT '{}' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_estimated" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linechat_fields" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linechat_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linechat_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"trigger" text DEFAULT 'agendada' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean DEFAULT false NOT NULL,
	"message" text,
	"cards_read" integer DEFAULT 0 NOT NULL,
	"cards_new" integer DEFAULT 0 NOT NULL,
	"moves" integer DEFAULT 0 NOT NULL,
	"cards_removed" integer DEFAULT 0 NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "linechat_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"archived" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linechat_card_moves" ADD CONSTRAINT "linechat_card_moves_card_id_linechat_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."linechat_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linechat_sync_runs" ADD CONSTRAINT "linechat_sync_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "linechat_card_moves_card_idx" ON "linechat_card_moves" USING btree ("card_id","at");--> statement-breakpoint
CREATE INDEX "linechat_cards_panel_idx" ON "linechat_cards" USING btree ("panel_id");--> statement-breakpoint
CREATE INDEX "linechat_cards_created_idx" ON "linechat_cards" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "linechat_cards_step_idx" ON "linechat_cards" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "linechat_sync_runs_started_idx" ON "linechat_sync_runs" USING btree ("started_at");--> statement-breakpoint
-- Permissão nova: ver os chamados de suporte. Quem já consulta o sistema passa a ver os chamados
-- também — a tela só lê a cópia do LineChat, não muda nada lá.
UPDATE "roles"
   SET "permissions" = array_append("permissions", 'support.read')
 WHERE ('records.read' = ANY("permissions") OR 'admin.manage' = ANY("permissions"))
   AND NOT ('support.read' = ANY("permissions"));
