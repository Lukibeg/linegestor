ALTER TABLE "ticket_panels" ADD COLUMN "kind" text DEFAULT 'gestao' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_stages" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "value_cents" bigint;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "product_values" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "prospect" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "lost_reason" text;