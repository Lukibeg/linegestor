-- 2.4.6: a série do calendário (o evento que se repete: todo dia, todo dia útil, toda semana, todo mês; o corte que a lixeira desfaz;
-- a data que saiu porque a regra mudou) e o link cancelado (o circuito cancelado fica guardado, com o dia, o motivo e quem registrou;
-- sai das listas até "Mostrar cancelados").
CREATE TABLE "calendar_series" (
	"id" text PRIMARY KEY NOT NULL,
	"frequency" text NOT NULL,
	"anchor_on" text NOT NULL,
	"until_on" text,
	"generated_until" text NOT NULL,
	"template" jsonb NOT NULL,
	"undo" jsonb,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "dropped_by_series" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "circuits" ADD COLUMN "cancelled_on" text;--> statement-breakpoint
ALTER TABLE "circuits" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "circuits" ADD COLUMN "cancelled_by_id" text;--> statement-breakpoint
ALTER TABLE "circuits" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_series" ADD CONSTRAINT "calendar_series_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_series_id_calendar_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."calendar_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_series_idx" ON "calendar_events" USING btree ("series_id","starts_on");