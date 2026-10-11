CREATE TABLE "device_movement_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"movement_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"data_base64" text NOT NULL,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "device_movement_receipts" ADD CONSTRAINT "device_movement_receipts_movement_id_device_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."device_movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_movement_receipts" ADD CONSTRAINT "device_movement_receipts_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_movement_receipts_movement_idx" ON "device_movement_receipts" USING btree ("movement_id");