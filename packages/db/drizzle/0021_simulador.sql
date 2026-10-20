CREATE TABLE "sales_simulations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ticket_id" text,
	"scenarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"principal" text NOT NULL,
	"created_by_id" text,
	"updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sales_simulations" ADD CONSTRAINT "sales_simulations_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_simulations" ADD CONSTRAINT "sales_simulations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_simulations" ADD CONSTRAINT "sales_simulations_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_simulations_ticket_idx" ON "sales_simulations" USING btree ("ticket_id");