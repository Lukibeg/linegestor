CREATE TABLE "client_device_logins" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"model_id" text NOT NULL,
	"username" text,
	"password_secret_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "client_network_settings" (
	"client_id" text PRIMARY KEY NOT NULL,
	"ip_address" text,
	"subnet_mask" text,
	"default_router" text,
	"dns1" text,
	"dns2" text,
	"wireless_password_secret_id" text,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circuits" ADD COLUMN "auth_type" text DEFAULT 'ip' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_units" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "client_units" ADD COLUMN "egress_ip" text;--> statement-breakpoint
ALTER TABLE "dids" ADD COLUMN "in_use" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fop2_settings" ADD COLUMN "default_user_password_secret_id" text;--> statement-breakpoint
ALTER TABLE "client_device_logins" ADD CONSTRAINT "client_device_logins_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_device_logins" ADD CONSTRAINT "client_device_logins_model_id_device_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_device_logins" ADD CONSTRAINT "client_device_logins_password_secret_id_secrets_id_fk" FOREIGN KEY ("password_secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_network_settings" ADD CONSTRAINT "client_network_settings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_network_settings" ADD CONSTRAINT "client_network_settings_wireless_password_secret_id_secrets_id_fk" FOREIGN KEY ("wireless_password_secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_device_logins_client_idx" ON "client_device_logins" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "fop2_settings" ADD CONSTRAINT "fop2_settings_default_user_password_secret_id_secrets_id_fk" FOREIGN KEY ("default_user_password_secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- ===================================================================================
-- Acertos nos dados que ja estao no banco (escritos a mao; o que esta acima e gerado)
-- ===================================================================================

-- 1) Tipo de autenticacao do tronco: quem ja tinha login cadastrado autentica por login e senha;
--    os demais, por IP (o caso comum na VoiceNet).
UPDATE "circuits" SET "auth_type" = 'login' WHERE coalesce(trim("auth_username"), '') <> '';
--> statement-breakpoint

-- 2) "Em uso" so faz sentido com cliente: numero livre fica como nao usado. Os numeros que ja
--    estavam com cliente (vindos do Nexus) entram como "em uso"; dali em diante, numero alocado
--    entra como "nao usado" ate alguem marcar.
UPDATE "dids" SET "in_use" = true WHERE "client_id" IS NOT NULL;
