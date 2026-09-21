ALTER TABLE "project_checks" ADD COLUMN "value" text;--> statement-breakpoint
ALTER TABLE "project_steps" ADD COLUMN "kind" text DEFAULT 'check' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_steps" ADD COLUMN "options" jsonb DEFAULT '[]'::jsonb NOT NULL;