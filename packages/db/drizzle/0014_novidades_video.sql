CREATE TABLE "release_note_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"disk_name" text NOT NULL,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "release_note_videos" ADD CONSTRAINT "release_note_videos_note_id_release_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."release_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_note_videos" ADD CONSTRAINT "release_note_videos_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "release_note_videos_note_idx" ON "release_note_videos" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_note_videos_um_por_nota_uq" ON "release_note_videos" USING btree ("note_id") WHERE deleted_at is null;