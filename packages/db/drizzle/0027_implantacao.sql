ALTER TABLE "ticket_attachments" ADD COLUMN "field_id" text;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD COLUMN "option_id" text;--> statement-breakpoint
ALTER TABLE "ticket_fields" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "ticket_fields" ADD COLUMN "product_id" text;--> statement-breakpoint
ALTER TABLE "ticket_stages" ADD COLUMN "opens_panel_id" text;--> statement-breakpoint
ALTER TABLE "ticket_stages" ADD COLUMN "activates_products" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_stages" ADD COLUMN "receives_implementation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "field_marks" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "source_ticket_id" text;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_field_id_ticket_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."ticket_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_fields" ADD CONSTRAINT "ticket_fields_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_stages" ADD CONSTRAINT "ticket_stages_opens_panel_id_ticket_panels_id_fk" FOREIGN KEY ("opens_panel_id") REFERENCES "public"."ticket_panels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_source_ticket_id_tickets_id_fk" FOREIGN KEY ("source_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_source_ticket_uq" ON "tickets" USING btree ("source_ticket_id") WHERE deleted_at is null;