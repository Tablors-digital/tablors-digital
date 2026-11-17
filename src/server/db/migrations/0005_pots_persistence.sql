CREATE TABLE IF NOT EXISTS "pots" (
  "id" text PRIMARY KEY, "business_id" text NOT NULL, "type" text NOT NULL, "name" text NOT NULL,
  "target_paise" bigint, "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pots_active_name_unique" ON "pots" ("business_id", lower("name")) WHERE "archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pots_business_idx" ON "pots" ("business_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_journals" (
  "id" text PRIMARY KEY, "business_id" text NOT NULL, "idempotency_key" text NOT NULL,
  "source_id" text NOT NULL, "actor_id" text NOT NULL, "reason" text, "created_at" timestamptz NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_journals_key_unique" ON "ledger_journals" ("business_id", "idempotency_key");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" text PRIMARY KEY, "business_id" text NOT NULL, "journal_id" text NOT NULL, "account" text NOT NULL,
  "amount_paise" bigint NOT NULL, "source_type" text NOT NULL, "source_id" text NOT NULL,
  "rule_id" text, "rule_version" integer, "actor_id" text NOT NULL, "reason" text, "created_at" timestamptz NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_account_idx" ON "ledger_entries" ("business_id", "account", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_journal_idx" ON "ledger_entries" ("journal_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_balances" (
  "business_id" text NOT NULL, "account" text NOT NULL,
  "balance_paise" bigint NOT NULL DEFAULT 0, "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("business_id", "account")
);--> statement-breakpoint
ALTER TABLE "pots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger_journals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE OR REPLACE FUNCTION ledger_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'ledger rows are append-only'; END; $$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS ledger_entries_immutable ON "ledger_entries";--> statement-breakpoint
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION ledger_immutable();--> statement-breakpoint
DROP TRIGGER IF EXISTS ledger_journals_immutable ON "ledger_journals";--> statement-breakpoint
CREATE TRIGGER ledger_journals_immutable BEFORE UPDATE OR DELETE ON "ledger_journals" FOR EACH ROW EXECUTE FUNCTION ledger_immutable();--> statement-breakpoint
-- Loyalty: one active redemption per bill. If this fails, you have duplicates: cancel the extras first.
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_redemptions_active_bill_unique"
  ON "loyalty_redemptions" ("bill_id") WHERE "status" IN ('held','committed');