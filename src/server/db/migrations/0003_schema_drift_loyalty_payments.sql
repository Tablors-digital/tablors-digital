-- Additive and idempotent. Brings the migrations in line with schema.ts:
-- the loyalty tables and payments.idempotency_key existed in the schema but in no migration.
CREATE TABLE IF NOT EXISTS "loyalty_bill_links" (
	"bill_id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loyalty_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"phone" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loyalty_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"reward_id" text NOT NULL,
	"bill_id" text NOT NULL,
	"points" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loyalty_rewards" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"points_cost" integer NOT NULL,
	"value_paise" integer,
	"percent" integer,
	"max_discount_paise" integer,
	"quantity" integer,
	"terms" text,
	"active" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loyalty_settings" (
	"restaurant_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"earn_spend_paise" integer DEFAULT 1000 NOT NULL,
	"earn_points" integer DEFAULT 1 NOT NULL,
	"exclude_gst" boolean DEFAULT true NOT NULL,
	"exclude_service_charge" boolean DEFAULT true NOT NULL,
	"discount_before_points" boolean DEFAULT true NOT NULL,
	"min_bill_paise" integer DEFAULT 0 NOT NULL,
	"max_points_per_bill" integer,
	"expiry_months" integer,
	"min_points_to_redeem" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loyalty_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"source_id" text,
	"idempotency_key" text NOT NULL,
	"reason" text,
	"actor" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_customers_phone_unique" ON "loyalty_customers" USING btree ("restaurant_id","phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loyalty_redemptions_bill_idx" ON "loyalty_redemptions" USING btree ("bill_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loyalty_redemptions_customer_idx" ON "loyalty_redemptions" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loyalty_rewards_restaurant_idx" ON "loyalty_rewards" USING btree ("restaurant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_tx_idempotency_unique" ON "loyalty_transactions" USING btree ("restaurant_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loyalty_tx_customer_idx" ON "loyalty_transactions" USING btree ("customer_id","created_at");
--> statement-breakpoint
ALTER TABLE "loyalty_bill_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "loyalty_customers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "loyalty_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotency_unique" ON "payments" USING btree ("restaurant_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL;
