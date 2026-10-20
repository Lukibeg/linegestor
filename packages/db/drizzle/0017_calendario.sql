CREATE TABLE "calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type_id" text NOT NULL,
	"panel_ids" text[] DEFAULT '{}' NOT NULL,
	"participant_ids" text[] DEFAULT '{}' NOT NULL,
	"client_id" text,
	"ticket_id" text,
	"starts_on" text NOT NULL,
	"ends_on" text NOT NULL,
	"all_day" boolean DEFAULT true NOT NULL,
	"start_time" text,
	"end_time" text,
	"location" text,
	"notes" text,
	"status" text DEFAULT 'agendado' NOT NULL,
	"created_by_id" text,
	"updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "calendar_events_periodo_ck" CHECK ("calendar_events"."ends_on" >= "calendar_events"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_periodo_idx" ON "calendar_events" USING btree ("starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "calendar_events_ticket_idx" ON "calendar_events" USING btree ("ticket_id");