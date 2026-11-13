ALTER TABLE "calendar_series" ADD COLUMN "weekdays" integer[];--> statement-breakpoint
ALTER TABLE "ticket_fields" ADD COLUMN "width" text;--> statement-breakpoint
ALTER TABLE "ticket_panels" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "ticket_panels" ADD CONSTRAINT "ticket_panels_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_panels_owner_uq" ON "ticket_panels" USING btree ("owner_id") WHERE owner_id is not null and deleted_at is null;