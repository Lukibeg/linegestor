ALTER TABLE "ticket_fields" ADD COLUMN "source_field_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "field_lists" jsonb DEFAULT '{}'::jsonb NOT NULL;