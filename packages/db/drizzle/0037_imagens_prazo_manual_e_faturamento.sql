ALTER TABLE "ticket_attachments" ADD COLUMN "text_field" text;--> statement-breakpoint
ALTER TABLE "ticket_stages" ADD COLUMN "opens_billing_panel_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticket_stages" ADD CONSTRAINT "ticket_stages_opens_billing_panel_id_ticket_panels_id_fk" FOREIGN KEY ("opens_billing_panel_id") REFERENCES "public"."ticket_panels"("id") ON DELETE no action ON UPDATE no action;