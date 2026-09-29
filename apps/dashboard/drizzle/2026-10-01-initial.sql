-- We+Make: the initial schema. Every statement is safe to run twice
-- (IF NOT EXISTS, and foreign keys skip themselves when already present).
-- Mirrors src/db/schema.ts; scripts/tests/migration.test.ts keeps them equal.

CREATE TABLE IF NOT EXISTS "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "batch_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"step" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"minutes" integer,
	"notes" text,
	"done_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"granted" boolean NOT NULL,
	"source" text NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"type" text DEFAULT 'subscriber' NOT NULL,
	"source" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"stripe_customer_id" text,
	"unsubscribe_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "email_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"contact_id" uuid,
	"to_email" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "maintenance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"printer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hours_at" numeric(10, 2),
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"next_due_hours" numeric(10, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "material_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"delta" numeric(14, 3) NOT NULL,
	"reason" text NOT NULL,
	"ref_id" text,
	"actor" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"unit" text DEFAULT 'g' NOT NULL,
	"on_hand" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reorder_point" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reorder_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"cost_per_unit_cents" numeric(14, 4) DEFAULT '0' NOT NULL,
	"supplier" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "newsletter_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"preheader" text DEFAULT '' NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"audience_tag" text DEFAULT 'newsletter' NOT NULL,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"reserved_qty" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"edition_note" text,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0 and "order_items"."reserved_qty" >= 0 and "order_items"."reserved_qty" <= "order_items"."quantity")
);

CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "orders_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1001 CACHE 1),
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'website' NOT NULL,
	"checkout_session_id" text,
	"payment_intent_id" text,
	"contact_id" uuid,
	"email" text,
	"name" text,
	"shipping_address" jsonb,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"carrier" text,
	"tracking_number" text,
	"notes" text,
	"livemode" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"packed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"stock_committed_at" timestamp with time zone,
	"stock_released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"contact_id" uuid,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_ref" text NOT NULL,
	"payment_intent_id" text,
	"description" text,
	"livemode" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "printers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"total_print_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_materials" (
	"product_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"qty_per_piece" numeric(14, 3) NOT NULL,
	"waste_factor" numeric(6, 3) DEFAULT '1.1' NOT NULL,
	CONSTRAINT "product_materials_product_id_material_id_pk" PRIMARY KEY("product_id","material_id")
);

CREATE TABLE IF NOT EXISTS "product_stock" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"low_threshold" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_stock_on_hand_check" CHECK ("product_stock"."on_hand" >= 0),
	CONSTRAINT "product_stock_reserved_check" CHECK ("product_stock"."reserved" >= 0 and "product_stock"."reserved" <= "product_stock"."on_hand")
);

CREATE TABLE IF NOT EXISTS "production_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"product_id" uuid NOT NULL,
	"planned_qty" integer NOT NULL,
	"good_qty" integer DEFAULT 0 NOT NULL,
	"reject_qty" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"printer_id" uuid,
	"edition_start" integer,
	"edition_end" integer,
	"notes" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"stock_posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_batches_qty_check" CHECK ("production_batches"."planned_qty" > 0 and "production_batches"."good_qty" >= 0 and "production_batches"."reject_qty" >= 0)
);

CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"material" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"image" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"made_to_order" boolean DEFAULT true NOT NULL,
	"lead_time" text DEFAULT 'Made to order in 2–3 weeks.' NOT NULL,
	"edition_size" integer,
	"print_hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"labor_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_check" CHECK ("products"."price_cents" >= 0)
);

CREATE TABLE IF NOT EXISTS "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_id" text,
	"actor" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "batch_steps" ADD CONSTRAINT "batch_steps_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_campaign_id_newsletter_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."newsletter_campaigns"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "material_movements" ADD CONSTRAINT "material_movements_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "orders" ADD CONSTRAINT "orders_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "payments" ADD CONSTRAINT "payments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "product_materials" ADD CONSTRAINT "product_materials_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "product_materials" ADD CONSTRAINT "product_materials_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "activities_contact_idx" ON "activities" USING btree ("contact_id","occurred_at");

CREATE INDEX IF NOT EXISTS "audit_events_time_idx" ON "audit_events" USING btree ("occurred_at");

CREATE INDEX IF NOT EXISTS "audit_events_entity_time_idx" ON "audit_events" USING btree ("entity_type","entity_id","occurred_at");

CREATE UNIQUE INDEX IF NOT EXISTS "batch_steps_batch_step_idx" ON "batch_steps" USING btree ("batch_id","step");

CREATE INDEX IF NOT EXISTS "consent_records_contact_idx" ON "consent_records" USING btree ("contact_id","created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_email_idx" ON "contacts" USING btree ("email");

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_unsubscribe_token_idx" ON "contacts" USING btree ("unsubscribe_token");

CREATE UNIQUE INDEX IF NOT EXISTS "email_sends_broadcast_idx" ON "email_sends" USING btree ("campaign_id","contact_id") WHERE "email_sends"."kind" = 'broadcast';

CREATE INDEX IF NOT EXISTS "email_sends_time_idx" ON "email_sends" USING btree ("created_at");

CREATE INDEX IF NOT EXISTS "maintenance_logs_printer_idx" ON "maintenance_logs" USING btree ("printer_id","performed_at");

CREATE UNIQUE INDEX IF NOT EXISTS "material_movements_ref_idx" ON "material_movements" USING btree ("reason","ref_id","material_id");

CREATE INDEX IF NOT EXISTS "material_movements_material_idx" ON "material_movements" USING btree ("material_id","created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "materials_sku_idx" ON "materials" USING btree ("sku");

CREATE UNIQUE INDEX IF NOT EXISTS "order_items_order_product_idx" ON "order_items" USING btree ("order_id","product_id");

CREATE UNIQUE INDEX IF NOT EXISTS "orders_number_idx" ON "orders" USING btree ("number");

CREATE UNIQUE INDEX IF NOT EXISTS "orders_checkout_session_idx" ON "orders" USING btree ("checkout_session_id");

CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" USING btree ("status","created_at");

CREATE INDEX IF NOT EXISTS "orders_contact_idx" ON "orders" USING btree ("contact_id");

CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_ref_idx" ON "payments" USING btree ("stripe_ref");

CREATE INDEX IF NOT EXISTS "payments_time_idx" ON "payments" USING btree ("occurred_at");

CREATE UNIQUE INDEX IF NOT EXISTS "production_batches_code_idx" ON "production_batches" USING btree ("code");

CREATE INDEX IF NOT EXISTS "production_batches_status_idx" ON "production_batches" USING btree ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "products_handle_idx" ON "products" USING btree ("handle");

CREATE UNIQUE INDEX IF NOT EXISTS "stock_movements_ref_idx" ON "stock_movements" USING btree ("reason","ref_id","product_id");

CREATE INDEX IF NOT EXISTS "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id","created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_event_idx" ON "webhook_events" USING btree ("provider","provider_event_id");
