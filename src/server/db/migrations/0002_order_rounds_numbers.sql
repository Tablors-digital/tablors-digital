-- Additive and idempotent. Never drops, renames or rewrites existing data.
-- Human-readable numbers, per-bill tax snapshot, and per-round order items.
CREATE SEQUENCE IF NOT EXISTS "order_no_seq" START 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "bill_no_seq" START 1;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "order_no" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "bill_no" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "additional_tax_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "gst_percent" real;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "additional_tax_percent" real;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "service_charge_percent" real;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "orders" SET "order_no" = nextval('order_no_seq') WHERE "order_no" IS NULL;--> statement-breakpoint
UPDATE "bills" SET "bill_no" = nextval('bill_no_seq') WHERE "bill_no" IS NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "order_no" SET DEFAULT nextval('order_no_seq');--> statement-breakpoint
ALTER TABLE "bills" ALTER COLUMN "bill_no" SET DEFAULT nextval('bill_no_seq');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_order_no_unique" ON "orders" ("order_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bills_bill_no_unique" ON "bills" ("bill_no");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"bill_id" text NOT NULL,
	"order_id" text NOT NULL,
	"table_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"qr_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "payment_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_provider_ref_unique" ON "payment_intents" ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intents_bill_idx" ON "payment_intents" ("bill_id");
