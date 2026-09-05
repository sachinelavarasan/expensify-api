-- Custom SQL migration file, put you code below! --

-- Per-item planned-reminder settings for a recurring transaction - lets each
-- one carry its own local-notification lead time and time-of-day, synced by
-- the app (no server-side push for these).
ALTER TABLE "exp_recurring_transactions" ADD COLUMN IF NOT EXISTS "exp_rt_reminder_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "exp_recurring_transactions" ADD COLUMN IF NOT EXISTS "exp_rt_reminder_days_before" integer NOT NULL DEFAULT 0;
ALTER TABLE "exp_recurring_transactions" ADD COLUMN IF NOT EXISTS "exp_rt_reminder_time" text;

-- Differentiates a genuinely recurring transaction (auto-imported into
-- transaction history on schedule) from a payment reminder like an EMI
-- (only a local nudge - the user logs the actual payment themselves).
ALTER TABLE "exp_recurring_transactions" ADD COLUMN IF NOT EXISTS "exp_rt_kind" text NOT NULL DEFAULT 'recurring';
