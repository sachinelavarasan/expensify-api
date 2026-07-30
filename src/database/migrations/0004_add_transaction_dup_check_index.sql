-- Custom SQL migration file, put you code below! --
CREATE INDEX IF NOT EXISTS "exp_transactions_dup_check_idx"
  ON "exp_transactions" ("exp_ts_user_id", "exp_ts_date")
  WHERE "exp_ts_deleted_at" IS NULL;
