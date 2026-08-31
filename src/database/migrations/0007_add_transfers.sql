-- Custom SQL migration file, put you code below! --

-- Links the two rows that make up a single self-transfer so
-- delete/restore/purge can operate on them together. Not a self-referencing
-- FK - it's just an opaque grouping key shared by both legs.
ALTER TABLE "exp_transactions" ADD COLUMN IF NOT EXISTS "exp_ts_transfer_group_id" uuid;

-- 'out' = debit/source leg, 'in' = credit/destination leg. NULL for ordinary
-- expense/income rows.
ALTER TABLE "exp_transactions" ADD COLUMN IF NOT EXISTS "exp_ts_transfer_direction" text;

-- Seed the new Transfer transaction type as id 3 (1=Expense, 2=Income already
-- exist as out-of-band seeded data in every environment). Bump the serial
-- sequence afterward so future inserts don't collide with this explicit id.
INSERT INTO "exp_transaction_types" ("exp_tt_id", "exp_tt_label")
VALUES (3, 'Transfer')
ON CONFLICT ("exp_tt_id") DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('exp_transaction_types', 'exp_tt_id'),
  (SELECT GREATEST(MAX("exp_tt_id"), 1) FROM "exp_transaction_types")
);

-- System "Transfer" category (transaction_type=3) - exp_tc_user_id IS NULL,
-- mirroring the existing "Others" system category pattern (global/shared,
-- not owned by any one user).
INSERT INTO "exp_transaction_categories"
  ("exp_tc_label", "exp_tc_icon", "exp_tc_user_id", "exp_tc_icon_bg_color", "exp_tc_transaction_type", "exp_tc_sort_order")
SELECT 'Transfer', 'swap-horiz', NULL, '#6B5DE6', 3, 1
WHERE NOT EXISTS (
  SELECT 1 FROM "exp_transaction_categories"
  WHERE "exp_tc_label" = 'Transfer' AND "exp_tc_user_id" IS NULL AND "exp_tc_transaction_type" = 3
);
