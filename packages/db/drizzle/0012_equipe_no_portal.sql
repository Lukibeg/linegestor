ALTER TABLE "portal_sessions" ALTER COLUMN "portal_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD COLUMN "staff_user_id" text;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_sessions_staff_idx" ON "portal_sessions" USING btree ("staff_user_id");--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_dono_ck" CHECK (num_nonnulls(portal_user_id, staff_user_id) = 1);