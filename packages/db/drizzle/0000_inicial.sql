CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_stock" (
	"id" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"client_id" text,
	"modality" text DEFAULT 'estoque' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carriers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "carriers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "circuits" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"carrier_id" text,
	"channels" integer DEFAULT 0 NOT NULL,
	"owner_client_id" text,
	"monthly_value_cents" integer,
	"signaling_ip" text,
	"auth_ip" text,
	"auth_username" text,
	"auth_password_secret_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"trade_name" text NOT NULL,
	"legal_name" text NOT NULL,
	"cnpj" text NOT NULL,
	"logo_url" text,
	"archived" boolean DEFAULT false NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"internal_code" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "device_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "device_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "device_models" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category_id" text,
	"tracking" text NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "device_models_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "device_movement_items" (
	"id" text PRIMARY KEY NOT NULL,
	"movement_id" text NOT NULL,
	"model_id" text NOT NULL,
	"device_id" text,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"modality" text NOT NULL,
	"from_client_id" text,
	"to_client_id" text,
	"new_condition" text,
	"value_cents" integer,
	"note" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"mac" text NOT NULL,
	"mac_secondary" text,
	"tag" text,
	"client_id" text,
	"current_modality" text,
	"condition" text DEFAULT 'ativo' NOT NULL,
	"value_cents" integer,
	"ip" text,
	"location" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dids" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"circuit_id" text,
	"client_id" text,
	"owner_client_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fop2_settings" (
	"subscription_module_id" text PRIMARY KEY NOT NULL,
	"admin_extension" text
);
--> statement-breakpoint
CREATE TABLE "hosting_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "hosting_providers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "linepbx_settings" (
	"subscription_id" text PRIMARY KEY NOT NULL,
	"hosting_id" text,
	"server_ip" text,
	"domain" text,
	"ssh_user" text,
	"ssh_port" integer DEFAULT 22,
	"ssh_password_secret_id" text
);
--> statement-breakpoint
CREATE TABLE "omniboard_settings" (
	"subscription_module_id" text PRIMARY KEY NOT NULL,
	"admin_login" text,
	"admin_password_secret_id" text,
	"user_default_password_secret_id" text
);
--> statement-breakpoint
CREATE TABLE "product_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"has_settings" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#2457D6' NOT NULL,
	"description" text,
	"has_settings" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text,
	"name" text NOT NULL,
	"description" text,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key"),
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "subscription_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"module_id" text NOT NULL,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"product_id" text NOT NULL,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "szchat_settings" (
	"subscription_id" text PRIMARY KEY NOT NULL,
	"admin_login" text,
	"admin_password_secret_id" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_stock" ADD CONSTRAINT "bulk_stock_model_id_device_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_stock" ADD CONSTRAINT "bulk_stock_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_owner_client_id_clients_id_fk" FOREIGN KEY ("owner_client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_auth_password_secret_id_secrets_id_fk" FOREIGN KEY ("auth_password_secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_models" ADD CONSTRAINT "device_models_category_id_device_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."device_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_movement_items" ADD CONSTRAINT "device_movement_items_movement_id_device_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."device_movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_movement_items" ADD CONSTRAINT "device_movement_items_model_id_device_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_movement_items" ADD CONSTRAINT "device_movement_items_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_movements" ADD CONSTRAINT "device_movements_from_client_id_clients_id_fk" FOREIGN KEY ("from_client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_movements" ADD CONSTRAINT "device_movements_to_client_id_clients_id_fk" FOREIGN KEY ("to_client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_movements" ADD CONSTRAINT "device_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_model_id_device_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dids" ADD CONSTRAINT "dids_circuit_id_circuits_id_fk" FOREIGN KEY ("circuit_id") REFERENCES "public"."circuits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dids" ADD CONSTRAINT "dids_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dids" ADD CONSTRAINT "dids_owner_client_id_clients_id_fk" FOREIGN KEY ("owner_client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fop2_settings" ADD CONSTRAINT "fop2_settings_subscription_module_id_subscription_modules_id_fk" FOREIGN KEY ("subscription_module_id") REFERENCES "public"."subscription_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linepbx_settings" ADD CONSTRAINT "linepbx_settings_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linepbx_settings" ADD CONSTRAINT "linepbx_settings_hosting_id_hosting_providers_id_fk" FOREIGN KEY ("hosting_id") REFERENCES "public"."hosting_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linepbx_settings" ADD CONSTRAINT "linepbx_settings_ssh_password_secret_id_secrets_id_fk" FOREIGN KEY ("ssh_password_secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omniboard_settings" ADD CONSTRAINT "omniboard_settings_subscription_module_id_subscription_modules_id_fk" FOREIGN KEY ("subscription_module_id") REFERENCES "public"."subscription_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omniboard_settings" ADD CONSTRAINT "omniboard_settings_admin_password_secret_id_secrets_id_fk" FOREIGN KEY ("admin_password_secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omniboard_settings" ADD CONSTRAINT "omniboard_settings_user_default_password_secret_id_secrets_id_fk" FOREIGN KEY ("user_default_password_secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modules" ADD CONSTRAINT "product_modules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_modules" ADD CONSTRAINT "subscription_modules_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_modules" ADD CONSTRAINT "subscription_modules_module_id_product_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."product_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "szchat_settings" ADD CONSTRAINT "szchat_settings_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "szchat_settings" ADD CONSTRAINT "szchat_settings_admin_password_secret_id_secrets_id_fk" FOREIGN KEY ("admin_password_secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bulk_stock_uq" ON "bulk_stock" USING btree ("model_id","client_id","modality");--> statement-breakpoint
CREATE UNIQUE INDEX "circuits_code_carrier_uq" ON "circuits" USING btree ("code","carrier_id");--> statement-breakpoint
CREATE INDEX "circuits_name_idx" ON "circuits" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_cnpj_uq" ON "clients" USING btree ("cnpj");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_internal_code_uq" ON "clients" USING btree ("internal_code");--> statement-breakpoint
CREATE INDEX "clients_trade_name_idx" ON "clients" USING btree ("trade_name");--> statement-breakpoint
CREATE INDEX "device_movements_created_idx" ON "device_movements" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_mac_uq" ON "devices" USING btree ("mac");--> statement-breakpoint
CREATE INDEX "devices_model_idx" ON "devices" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "devices_client_idx" ON "devices" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dids_number_uq" ON "dids" USING btree ("number");--> statement-breakpoint
CREATE INDEX "dids_circuit_idx" ON "dids" USING btree ("circuit_id");--> statement-breakpoint
CREATE INDEX "dids_client_idx" ON "dids" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "dids_deleted_idx" ON "dids" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_modules_product_code_uq" ON "product_modules" USING btree ("product_id","code");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_modules_sub_module_uq" ON "subscription_modules" USING btree ("subscription_id","module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_client_product_uq" ON "subscriptions" USING btree ("client_id","product_id");