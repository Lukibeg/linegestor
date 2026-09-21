CREATE TABLE "release_note_images" (
	"item_id" text PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"data_base64" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_note_items" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"kind" text DEFAULT 'novo' NOT NULL,
	"title" text NOT NULL,
	"text" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_note_reads" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "release_note_images" ADD CONSTRAINT "release_note_images_item_id_release_note_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."release_note_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_note_items" ADD CONSTRAINT "release_note_items_note_id_release_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."release_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_note_reads" ADD CONSTRAINT "release_note_reads_note_id_release_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."release_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_note_reads" ADD CONSTRAINT "release_note_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "release_note_items_note_idx" ON "release_note_items" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_note_reads_note_user_uq" ON "release_note_reads" USING btree ("note_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_notes_version_uq" ON "release_notes" USING btree ("version");