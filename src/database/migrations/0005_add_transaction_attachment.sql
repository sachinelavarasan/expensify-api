-- Custom SQL migration file, put you code below! --
ALTER TABLE "exp_transactions" ADD COLUMN IF NOT EXISTS "exp_ts_attachment_url" text;
