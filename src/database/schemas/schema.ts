import { type InferInsertModel, type InferSelectModel, relations, sql } from 'drizzle-orm';
import {
  uuid,
  serial,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  date,
  integer,
} from 'drizzle-orm/pg-core';

export const expensifyUsers = pgTable('exp_users', {
  exp_us_id: uuid('exp_us_id').primaryKey().defaultRandom(),
  exp_us_name: text('exp_us_name'),
  exp_us_email: text('exp_us_email'),
  exp_us_phone_no: text('exp_phone_no'),
  exp_us_is_deleted: boolean('exp_us_is_deleted').default(false),
  exp_us_currency: text('exp_us_currency').default(null),
  exp_us_default_transaction: integer('exp_us_default_transaction').default(1),
  exp_us_default_grouping: text('exp_us_default_grouping').default('month'),
  exp_us_profile_url: text('exp_us_profile_url'),
  exp_us_password_hash: text('exp_us_password_hash'),
  exp_us_email_verified: boolean('exp_us_email_verified').notNull().default(false),
  exp_us_otp_code_hash: text('exp_us_otp_code_hash'),
  exp_us_otp_purpose: varchar('exp_us_otp_purpose', { length: 32 }),
  exp_us_otp_expires_at: timestamp('exp_us_otp_expires_at', {
    mode: 'string',
    withTimezone: true,
  }),
  exp_us_otp_attempts: integer('exp_us_otp_attempts').notNull().default(0),
  exp_us_created_at: timestamp('exp_us_created_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),
  exp_us_updated_at: timestamp('exp_us_updated_at', {
    mode: 'string',
  }).$onUpdate(() => sql`now()`),
});

export type InsertExpensifyUser = InferInsertModel<typeof expensifyUsers>;
export type SelectExpensifyUser = InferSelectModel<typeof expensifyUsers>;

export const expTransactionTypes = pgTable('exp_transaction_types', {
  exp_tt_id: serial('exp_tt_id').primaryKey(),
  exp_tt_label: text('exp_tt_label').notNull(),
});

export type InsertExpensifyTransactionTypes = InferInsertModel<typeof expTransactionTypes>;
export type SelectExpensifyTransactionTypes = InferSelectModel<typeof expTransactionTypes>;

export const expTransactionCategories = pgTable('exp_transaction_categories', {
  exp_tc_id: uuid('exp_tc_id').primaryKey().defaultRandom(),
  exp_tc_label: text('exp_tc_label').notNull(),
  exp_tc_icon: text('exp_tc_icon'),
  exp_tc_user_id: uuid('exp_tc_user_id'),
  exp_tc_icon_bg_color: varchar('exp_tc_icon_bg_color', { length: 10 }),
  exp_tc_transaction_type: integer('exp_tc_transaction_type')
    .notNull()
    .references(() => expTransactionTypes.exp_tt_id, { onDelete: 'cascade' }),
  exp_tc_created_at: timestamp('exp_tc_created_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),

  exp_tc_updated_at: timestamp('exp_tc_updated_at', { mode: 'string' }).$onUpdate(() => sql`now()`),
  exp_tc_sort_order: integer('exp_tc_sort_order').notNull().default(1),
});

export type InsertExpensifyTransactionCategories = InferInsertModel<
  typeof expTransactionCategories
>;
export type SelectExpensifyTransactionCategories = InferSelectModel<
  typeof expTransactionCategories
>;

export const expTransactions = pgTable('exp_transactions', {
  exp_ts_id: uuid('exp_ts_id').primaryKey().defaultRandom(),
  exp_ts_user_id: uuid('exp_ts_user_id')
    .notNull()
    .references(() => expensifyUsers.exp_us_id, { onDelete: 'cascade' }),
  exp_ts_title: text('exp_ts_title').notNull(),
  exp_ts_amount: text('exp_ts_amount').notNull(),
  exp_ts_date: date('exp_ts_date').notNull(),
  exp_ts_time: text('exp_ts_time').notNull(),
  exp_ts_note: text('exp_ts_note'),
  exp_ts_transaction_type: integer('exp_ts_transaction_type')
    .notNull()
    .references(() => expTransactionTypes.exp_tt_id),
  exp_ts_category: uuid('exp_ts_category')
    .notNull()
    .references(() => expTransactionCategories.exp_tc_id),
  exp_ts_created_at: timestamp('exp_ts_created_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),

  exp_ts_bank_account_id: uuid('exp_ts_bank_account_id')
    .references(() => expBankAccounts.exp_ba_id, { onDelete: 'set null' })
    .default(null),

  exp_ts_updated_at: timestamp('exp_ts_updated_at', { mode: 'string' }).$onUpdate(() => sql`now()`),

  exp_ts_deleted_at: timestamp('exp_ts_deleted_at', { mode: 'string' }).default(null),

  exp_ts_tags: text('exp_ts_tags')
    .array()
    .default(sql`'{}'::text[]`),

  exp_ts_attachment_url: text('exp_ts_attachment_url'),

  exp_ts_transfer_group_id: uuid('exp_ts_transfer_group_id').default(null),

  exp_ts_transfer_direction: text('exp_ts_transfer_direction').default(null),
});

export type InsertExpensifyTransactions = InferInsertModel<typeof expTransactions>;
export type SelectExpensifyTransactions = InferSelectModel<typeof expTransactions>;

export const expBankAccounts = pgTable('exp_bank_accounts', {
  exp_ba_id: uuid('exp_ba_id').primaryKey().defaultRandom(),

  exp_ba_user_id: uuid('exp_ba_user_id')
    .notNull()
    .references(() => expensifyUsers.exp_us_id, { onDelete: 'cascade' }),

  exp_ba_name: text('exp_ba_name').notNull(),

  exp_ba_balance: varchar('exp_ba_balance'),

  exp_ba_currency: varchar('exp_ba_currency', { length: 10 }).default('INR'),
  exp_ba_type: varchar('exp_ba_type', { length: 20 }).default('bank'),

  exp_ba_icon: varchar('exp_ba_icon', { length: 50 }),
  exp_ba_color: varchar('exp_ba_color', { length: 10 }),

  exp_ba_is_primary: boolean('exp_ba_is_primary').default(false),

  exp_ba_is_active: integer('exp_ba_is_active').default(1),

  exp_ba_is_deleted: boolean('exp_ba_is_deleted').default(false),

  exp_ba_created_at: timestamp('exp_ba_created_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),

  exp_ba_updated_at: timestamp('exp_ba_updated_at', { mode: 'string' }).$onUpdate(() => sql`now()`),
});

export type InsertExpensifyBankAccounts = InferInsertModel<typeof expBankAccounts>;
export type SelectExpensifyBankAccounts = InferSelectModel<typeof expBankAccounts>;

export const expStarredTransactions = pgTable('exp_starred_transactions', {
  exp_st_id: uuid('exp_st_id').primaryKey().defaultRandom(),

  exp_st_user_id: uuid('exp_st_user_id')
    .notNull()
    .references(() => expensifyUsers.exp_us_id, { onDelete: 'cascade' }),

  exp_st_transaction_id: uuid('exp_st_transaction_id')
    .notNull()
    .references(() => expTransactions.exp_ts_id, { onDelete: 'cascade' }),

  exp_st_created_at: timestamp('exp_st_created_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),
});

export type InsertExpensifyStarredTransactions = InferInsertModel<typeof expStarredTransactions>;
export type SelectExpensifyStarredTransactions = InferSelectModel<typeof expStarredTransactions>;

export const expNotificationToken = pgTable('exp_notification_token', {
  exp_ntto_id: uuid('exp_ntto_id').primaryKey().defaultRandom(),

  exp_ntto_user_id: uuid('exp_ntto_user_id')
    .notNull()
    .references(() => expensifyUsers.exp_us_id, { onDelete: 'cascade' }),

  exp_ntto_token: varchar('exp_ntto_token', { length: 255 }).notNull(),

  exp_ntto_status: integer('exp_ntto_status').default(1),

  exp_ntto_time: text('exp_ntto_time'),

  exp_ntto_created_at: timestamp('exp_ntto_created_at', { mode: 'string' }).defaultNow().notNull(),

  exp_ntto_updated_at: timestamp('exp_ntto_updated_at', { mode: 'string' }).defaultNow(),
});
export const expNotificationTokenRelations = relations(expNotificationToken, ({ one }) => ({
  notification: one(expNotificationLog, {
    fields: [expNotificationToken.exp_ntto_user_id],
    references: [expNotificationLog.exp_nl_user_id],
  }),
}));

export type InsertExpensifyNotificationToken = InferInsertModel<typeof expNotificationToken>;
export type SelectExpensifyNotificationToken = InferSelectModel<typeof expNotificationToken>;

export const expNotificationLog = pgTable('exp_notification_log', {
  exp_nl_id: uuid('exp_nl_id').primaryKey().defaultRandom(),
  exp_nl_user_id: uuid('exp_nl_user_id').default(null),
  exp_nl_status: integer('exp_nl_status').default(1),
  exp_nl_created_at: timestamp('exp_nl_created_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),
  exp_nl_updated_at: timestamp('exp_nl_updated_at', {
    mode: 'string',
  }).$onUpdate(() => sql`now()`),
  exp_nl_is_deleted: integer('exp_nl_is_deleted').default(0),
  exp_nl_text: text('exp_nl_text').default(null),
  exp_nl_pending_count: integer('exp_nl_pending_count').default(null),
});

export const expNotificationLogRelations = relations(expNotificationLog, ({ many }) => ({
  notificationToken: many(expNotificationToken),
}));

export type InsertExpensifyNotificationLog = InferInsertModel<typeof expNotificationLog>;
export type SelectExpensifyNotificationLog = InferSelectModel<typeof expNotificationLog>;

export const expBudgets = pgTable('exp_budgets', {
  exp_bg_id: uuid('exp_bg_id').primaryKey().defaultRandom(),
  exp_bg_user_id: uuid('exp_bg_user_id')
    .notNull()
    .references(() => expensifyUsers.exp_us_id, { onDelete: 'cascade' }),
  exp_bg_amount: text('exp_bg_amount').notNull(),
  exp_bg_category_id: uuid('exp_bg_category_id')
    .notNull()
    .references(() => expTransactionCategories.exp_tc_id, { onDelete: 'cascade' }),
  exp_bg_date: date('exp_bg_date').notNull(),
  exp_bg_created_at: timestamp('exp_bg_created_at').defaultNow().notNull(),
  exp_bg_updated_at: timestamp('exp_bg_updated_at').defaultNow().notNull(),
});

export type InsertExpensifyBudgets = InferInsertModel<typeof expBudgets>;
export type SelectExpensifyBudgets = InferSelectModel<typeof expBudgets>;

export const expRecurringTransactions = pgTable('exp_recurring_transactions', {
  exp_rt_id: uuid('exp_rt_id').primaryKey().defaultRandom(),
  exp_rt_user_id: uuid('exp_rt_user_id')
    .notNull()
    .references(() => expensifyUsers.exp_us_id, { onDelete: 'cascade' }),
  exp_rt_title: text('exp_rt_title').notNull(),
  exp_rt_amount: text('exp_rt_amount').notNull(),
  exp_rt_note: text('exp_rt_note'),
  exp_rt_category_id: uuid('exp_rt_category_id')
    .notNull()
    .references(() => expTransactionCategories.exp_tc_id),
  exp_rt_transaction_type_id: integer('exp_rt_transaction_type_id')
    .notNull()
    .references(() => expTransactionTypes.exp_tt_id),
  exp_rt_bank_account_id: uuid('exp_rt_bank_account_id')
    .references(() => expBankAccounts.exp_ba_id, { onDelete: 'set null' })
    .default(null),
  exp_rt_frequency: text('exp_rt_frequency').notNull(),
  exp_rt_start_date: date('exp_rt_start_date').notNull(),
  exp_rt_end_date: date('exp_rt_end_date'),
  exp_rt_next_due_date: date('exp_rt_next_due_date').notNull(),
  exp_rt_is_active: boolean('exp_rt_is_active').notNull().default(true),
  exp_rt_created_at: timestamp('exp_rt_created_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),
  exp_rt_updated_at: timestamp('exp_rt_updated_at', { mode: 'string' }).$onUpdate(() => sql`now()`),
});

export type InsertExpensifyRecurringTransactions = InferInsertModel<
  typeof expRecurringTransactions
>;
export type SelectExpensifyRecurringTransactions = InferSelectModel<
  typeof expRecurringTransactions
>;

export const expDebts = pgTable('exp_debts', {
  exp_dt_id: uuid('exp_dt_id').primaryKey().defaultRandom(),
  exp_dt_user_id: uuid('exp_dt_user_id')
    .notNull()
    .references(() => expensifyUsers.exp_us_id, { onDelete: 'cascade' }),
  exp_dt_person_name: text('exp_dt_person_name').notNull(),
  exp_dt_direction: text('exp_dt_direction').notNull(),
  exp_dt_amount: text('exp_dt_amount').notNull(),
  exp_dt_due_date: date('exp_dt_due_date'),
  exp_dt_note: text('exp_dt_note'),
  exp_dt_created_at: timestamp('exp_dt_created_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),
  exp_dt_updated_at: timestamp('exp_dt_updated_at', { mode: 'string' }).$onUpdate(() => sql`now()`),
  exp_dt_deleted_at: timestamp('exp_dt_deleted_at', { mode: 'string' }).default(null),
});

export type InsertExpensifyDebts = InferInsertModel<typeof expDebts>;
export type SelectExpensifyDebts = InferSelectModel<typeof expDebts>;

export const expDebtRepayments = pgTable('exp_debt_repayments', {
  exp_dr_id: uuid('exp_dr_id').primaryKey().defaultRandom(),
  exp_dr_debt_id: uuid('exp_dr_debt_id')
    .notNull()
    .references(() => expDebts.exp_dt_id, { onDelete: 'cascade' }),
  exp_dr_amount: text('exp_dr_amount').notNull(),
  exp_dr_date: date('exp_dr_date').notNull(),
  exp_dr_note: text('exp_dr_note'),
  exp_dr_created_at: timestamp('exp_dr_created_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),
});

export type InsertExpensifyDebtRepayments = InferInsertModel<typeof expDebtRepayments>;
export type SelectExpensifyDebtRepayments = InferSelectModel<typeof expDebtRepayments>;
