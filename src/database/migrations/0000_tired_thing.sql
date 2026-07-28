CREATE TABLE IF NOT EXISTS "exp_bank_accounts" (
	"exp_ba_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_ba_user_id" uuid NOT NULL,
	"exp_ba_name" text NOT NULL,
	"exp_ba_balance" varchar,
	"exp_ba_currency" varchar(10) DEFAULT 'INR',
	"exp_ba_type" varchar(20) DEFAULT 'bank',
	"exp_ba_icon" varchar(50),
	"exp_ba_color" varchar(10),
	"exp_ba_is_primary" boolean DEFAULT false,
	"exp_ba_is_active" integer DEFAULT 1,
	"exp_ba_is_deleted" boolean DEFAULT false,
	"exp_ba_created_at" timestamp DEFAULT now() NOT NULL,
	"exp_ba_updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exp_budgets" (
	"exp_bg_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_bg_user_id" uuid NOT NULL,
	"exp_bg_amount" text NOT NULL,
	"exp_bg_category_id" uuid NOT NULL,
	"exp_bg_date" date NOT NULL,
	"exp_bg_created_at" timestamp DEFAULT now() NOT NULL,
	"exp_bg_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exp_notification_log" (
	"exp_nl_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_nl_user_id" uuid DEFAULT null,
	"exp_nl_status" integer DEFAULT 1,
	"exp_nl_created_at" timestamp DEFAULT now() NOT NULL,
	"exp_nl_updated_at" timestamp,
	"exp_nl_is_deleted" integer DEFAULT 0,
	"exp_nl_text" text DEFAULT null,
	"exp_nl_pending_count" integer DEFAULT null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exp_notification_token" (
	"exp_ntto_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_ntto_user_id" uuid NOT NULL,
	"exp_ntto_token" varchar(255) NOT NULL,
	"exp_ntto_status" integer DEFAULT 1,
	"exp_ntto_time" text,
	"exp_ntto_created_at" timestamp DEFAULT now() NOT NULL,
	"exp_ntto_updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exp_recurring_transactions" (
	"exp_rt_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_rt_user_id" uuid NOT NULL,
	"exp_rt_title" text NOT NULL,
	"exp_rt_amount" text NOT NULL,
	"exp_rt_note" text,
	"exp_rt_category_id" uuid NOT NULL,
	"exp_rt_transaction_type_id" integer NOT NULL,
	"exp_rt_bank_account_id" uuid DEFAULT null,
	"exp_rt_frequency" text NOT NULL,
	"exp_rt_start_date" date NOT NULL,
	"exp_rt_end_date" date,
	"exp_rt_next_due_date" date NOT NULL,
	"exp_rt_is_active" boolean DEFAULT true NOT NULL,
	"exp_rt_created_at" timestamp DEFAULT now() NOT NULL,
	"exp_rt_updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exp_starred_transactions" (
	"exp_st_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_st_user_id" uuid NOT NULL,
	"exp_st_transaction_id" uuid NOT NULL,
	"exp_st_created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exp_transaction_categories" (
	"exp_tc_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_tc_label" text NOT NULL,
	"exp_tc_icon" text,
	"exp_tc_user_id" uuid,
	"exp_tc_icon_bg_color" varchar(10),
	"exp_tc_transaction_type" integer NOT NULL,
	"exp_tc_created_at" timestamp DEFAULT now() NOT NULL,
	"exp_tc_updated_at" timestamp,
	"exp_tc_sort_order" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exp_transaction_types" (
	"exp_tt_id" serial PRIMARY KEY NOT NULL,
	"exp_tt_label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exp_transactions" (
	"exp_ts_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_ts_user_id" uuid NOT NULL,
	"exp_ts_title" text NOT NULL,
	"exp_ts_amount" text NOT NULL,
	"exp_ts_date" date NOT NULL,
	"exp_ts_time" text NOT NULL,
	"exp_ts_note" text,
	"exp_ts_transaction_type" integer NOT NULL,
	"exp_ts_category" uuid NOT NULL,
	"exp_ts_created_at" timestamp DEFAULT now() NOT NULL,
	"exp_ts_bank_account_id" uuid DEFAULT null,
	"exp_ts_updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exp_users" (
	"exp_us_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_us_clerk_id" varchar(255),
	"exp_us_name" text,
	"exp_us_email" text,
	"exp_phone_no" text,
	"exp_us_is_deleted" boolean DEFAULT false,
	"exp_us_currency" text DEFAULT null,
	"exp_us_default_transaction" integer DEFAULT 1,
	"exp_us_default_grouping" text DEFAULT 'month',
	"exp_us_profile_url" text,
	"exp_us_password_hash" text,
	"exp_us_email_verified" boolean DEFAULT false NOT NULL,
	"exp_us_otp_code_hash" text,
	"exp_us_otp_purpose" varchar(32),
	"exp_us_otp_expires_at" timestamp with time zone,
	"exp_us_otp_attempts" integer DEFAULT 0 NOT NULL,
	"exp_us_created_at" timestamp DEFAULT now() NOT NULL,
	"exp_us_updated_at" timestamp,
	CONSTRAINT "exp_users_exp_us_clerk_id_unique" UNIQUE("exp_us_clerk_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_bank_accounts" ADD CONSTRAINT "exp_bank_accounts_exp_ba_user_id_exp_users_exp_us_id_fk" FOREIGN KEY ("exp_ba_user_id") REFERENCES "public"."exp_users"("exp_us_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_budgets" ADD CONSTRAINT "exp_budgets_exp_bg_user_id_exp_users_exp_us_id_fk" FOREIGN KEY ("exp_bg_user_id") REFERENCES "public"."exp_users"("exp_us_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_budgets" ADD CONSTRAINT "exp_budgets_exp_bg_category_id_exp_transaction_categories_exp_tc_id_fk" FOREIGN KEY ("exp_bg_category_id") REFERENCES "public"."exp_transaction_categories"("exp_tc_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_notification_token" ADD CONSTRAINT "exp_notification_token_exp_ntto_user_id_exp_users_exp_us_id_fk" FOREIGN KEY ("exp_ntto_user_id") REFERENCES "public"."exp_users"("exp_us_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_recurring_transactions" ADD CONSTRAINT "exp_recurring_transactions_exp_rt_user_id_exp_users_exp_us_id_fk" FOREIGN KEY ("exp_rt_user_id") REFERENCES "public"."exp_users"("exp_us_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_recurring_transactions" ADD CONSTRAINT "exp_recurring_transactions_exp_rt_category_id_exp_transaction_categories_exp_tc_id_fk" FOREIGN KEY ("exp_rt_category_id") REFERENCES "public"."exp_transaction_categories"("exp_tc_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_recurring_transactions" ADD CONSTRAINT "exp_recurring_transactions_exp_rt_transaction_type_id_exp_transaction_types_exp_tt_id_fk" FOREIGN KEY ("exp_rt_transaction_type_id") REFERENCES "public"."exp_transaction_types"("exp_tt_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_recurring_transactions" ADD CONSTRAINT "exp_recurring_transactions_exp_rt_bank_account_id_exp_bank_accounts_exp_ba_id_fk" FOREIGN KEY ("exp_rt_bank_account_id") REFERENCES "public"."exp_bank_accounts"("exp_ba_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_starred_transactions" ADD CONSTRAINT "exp_starred_transactions_exp_st_user_id_exp_users_exp_us_id_fk" FOREIGN KEY ("exp_st_user_id") REFERENCES "public"."exp_users"("exp_us_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_starred_transactions" ADD CONSTRAINT "exp_starred_transactions_exp_st_transaction_id_exp_transactions_exp_ts_id_fk" FOREIGN KEY ("exp_st_transaction_id") REFERENCES "public"."exp_transactions"("exp_ts_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_transaction_categories" ADD CONSTRAINT "exp_transaction_categories_exp_tc_transaction_type_exp_transaction_types_exp_tt_id_fk" FOREIGN KEY ("exp_tc_transaction_type") REFERENCES "public"."exp_transaction_types"("exp_tt_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_transactions" ADD CONSTRAINT "exp_transactions_exp_ts_user_id_exp_users_exp_us_id_fk" FOREIGN KEY ("exp_ts_user_id") REFERENCES "public"."exp_users"("exp_us_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_transactions" ADD CONSTRAINT "exp_transactions_exp_ts_transaction_type_exp_transaction_types_exp_tt_id_fk" FOREIGN KEY ("exp_ts_transaction_type") REFERENCES "public"."exp_transaction_types"("exp_tt_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_transactions" ADD CONSTRAINT "exp_transactions_exp_ts_category_exp_transaction_categories_exp_tc_id_fk" FOREIGN KEY ("exp_ts_category") REFERENCES "public"."exp_transaction_categories"("exp_tc_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exp_transactions" ADD CONSTRAINT "exp_transactions_exp_ts_bank_account_id_exp_bank_accounts_exp_ba_id_fk" FOREIGN KEY ("exp_ts_bank_account_id") REFERENCES "public"."exp_bank_accounts"("exp_ba_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
