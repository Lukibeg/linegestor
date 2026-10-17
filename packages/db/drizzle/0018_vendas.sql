ALTER TABLE "ticket_panels" ADD COLUMN "kind" text DEFAULT 'gestao' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_stages" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "value_cents" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "prospect" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "lost_reason" text;