ALTER TABLE "calendar_events" ADD COLUMN "reminders" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "remind_who" text DEFAULT 'pessoas' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "reminders_sent" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_notifications" ADD COLUMN "calendar_event_id" text;--> statement-breakpoint
ALTER TABLE "ticket_notifications" ADD CONSTRAINT "ticket_notifications_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;