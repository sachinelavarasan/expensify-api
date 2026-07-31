-- Custom SQL migration file, put you code below! --
CREATE TABLE IF NOT EXISTS "exp_debts" (
  "exp_dt_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "exp_dt_user_id" uuid NOT NULL REFERENCES "exp_users"("exp_us_id") ON DELETE CASCADE,
  "exp_dt_person_name" text NOT NULL,
  "exp_dt_direction" text NOT NULL,
  "exp_dt_amount" text NOT NULL,
  "exp_dt_due_date" date,
  "exp_dt_note" text,
  "exp_dt_created_at" timestamp NOT NULL DEFAULT now(),
  "exp_dt_updated_at" timestamp,
  "exp_dt_deleted_at" timestamp
);

CREATE TABLE IF NOT EXISTS "exp_debt_repayments" (
  "exp_dr_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "exp_dr_debt_id" uuid NOT NULL REFERENCES "exp_debts"("exp_dt_id") ON DELETE CASCADE,
  "exp_dr_amount" text NOT NULL,
  "exp_dr_date" date NOT NULL,
  "exp_dr_note" text,
  "exp_dr_created_at" timestamp NOT NULL DEFAULT now()
);
