ALTER TABLE "tickets" ADD COLUMN "other_contacts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "other_sessions" jsonb DEFAULT '[]'::jsonb NOT NULL;