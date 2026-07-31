import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { DB } from '../database/database.constants';
import { Database } from '../database/types/Database';
import {
  expBankAccounts,
  expBudgets,
  expDebtRepayments,
  expDebts,
  expRecurringTransactions,
  expStarredTransactions,
  expTransactionCategories,
  expTransactions,
} from '../database/schemas/schema';
import { ExpensifyUserRepository } from '../database/repositories/ExpensifyUser.repository';
import { ImportBackupDto } from './backup.dto';

@Injectable()
export class BackupService {
  constructor(
    @Inject(DB)
    private readonly dbObject: Database,
    private readonly userRepository: ExpensifyUserRepository,
  ) {}

  async exportUserData(args: { userId?: string; email?: string }) {
    const user = await this.userRepository.getOne({
      user_id: args.userId,
      email: args.email,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userId = user.exp_us_id;

    const [
      accounts,
      categories,
      transactions,
      starredTransactions,
      budgets,
      recurringTransactions,
      debts,
    ] = await Promise.all([
      this.dbObject.db.query.expBankAccounts.findMany({
        where: eq(expBankAccounts.exp_ba_user_id, userId),
      }),
      this.dbObject.db.query.expTransactionCategories.findMany({
        where: eq(expTransactionCategories.exp_tc_user_id, userId),
      }),
      this.dbObject.db.query.expTransactions.findMany({
        where: eq(expTransactions.exp_ts_user_id, userId),
      }),
      this.dbObject.db.query.expStarredTransactions.findMany({
        where: eq(expStarredTransactions.exp_st_user_id, userId),
      }),
      this.dbObject.db.query.expBudgets.findMany({
        where: eq(expBudgets.exp_bg_user_id, userId),
      }),
      this.dbObject.db.query.expRecurringTransactions.findMany({
        where: eq(expRecurringTransactions.exp_rt_user_id, userId),
      }),
      this.dbObject.db.query.expDebts.findMany({
        where: eq(expDebts.exp_dt_user_id, userId),
      }),
    ]);

    const debtIds = debts.map((debt) => debt.exp_dt_id);
    const debtRepayments = debtIds.length
      ? await this.dbObject.db.query.expDebtRepayments.findMany({
          where: inArray(expDebtRepayments.exp_dr_debt_id, debtIds),
        })
      : [];

    // Global/shared categories (exp_tc_user_id IS NULL, e.g. "Others") aren't owned by
    // this user so the `categories` array above excludes them. Each database seeds its
    // own copies with different ids, so capture label + type here - import resolves the
    // matching category in the target DB by that instead of trusting this id.
    const ownedCategoryIds = new Set(categories.map((category) => category.exp_tc_id));
    const referencedCategoryIds = new Set<string>();
    transactions.forEach((tx) => referencedCategoryIds.add(tx.exp_ts_category));
    budgets.forEach((budget) => referencedCategoryIds.add(budget.exp_bg_category_id));
    recurringTransactions.forEach((recurring) =>
      referencedCategoryIds.add(recurring.exp_rt_category_id),
    );
    const globalCategoryIds = [...referencedCategoryIds].filter((id) => !ownedCategoryIds.has(id));
    const globalCategoryRefs = globalCategoryIds.length
      ? await this.dbObject.db.query.expTransactionCategories.findMany({
          where: inArray(expTransactionCategories.exp_tc_id, globalCategoryIds),
          columns: { exp_tc_id: true, exp_tc_label: true, exp_tc_transaction_type: true },
        })
      : [];

    // Never let auth secrets leave the API, even in an admin-only backup bundle.
    const {
      exp_us_password_hash,
      exp_us_otp_code_hash,
      exp_us_otp_purpose,
      exp_us_otp_expires_at,
      exp_us_otp_attempts,
      ...safeUser
    } = user;

    return {
      exportedAt: new Date().toISOString(),
      user: safeUser,
      accounts,
      categories,
      globalCategoryRefs,
      transactions,
      starredTransactions,
      budgets,
      recurringTransactions,
      debts: debts.map((debt) => ({
        ...debt,
        repayments: debtRepayments.filter(
          (repayment) => repayment.exp_dr_debt_id === debt.exp_dt_id,
        ),
      })),
    };
  }

  async importUserData(bundle: ImportBackupDto) {
    // Resolve by email, not the bundle's id: a backup taken from a different database
    // (staging, another environment, a restored dump) can have the same user under a
    // different exp_us_id. Email is the stable identifier across databases.
    const existingUser = await this.userRepository.getOne({ email: bundle.user.exp_us_email });
    if (!existingUser) {
      throw new NotFoundException(
        'User not found; import only restores data onto an existing user, it does not create one',
      );
    }

    const targetUserId = existingUser.exp_us_id;
    const sourceUserId = bundle.user.exp_us_id;

    // Every row in the bundle must belong to the same source user - guards against a
    // manipulated/merged bundle smuggling in another user's data. The rows are then
    // remapped from sourceUserId to targetUserId below since ids can differ across databases.
    const assertOwnedBySource = (rows: Record<string, any>[], field: string, label: string) => {
      const foreign = rows.find((row) => field in row && row[field] !== sourceUserId);
      if (foreign) {
        throw new BadRequestException(
          `${label} contains a row belonging to a different user (${field}=${foreign[field]}); refusing to import`,
        );
      }
    };

    assertOwnedBySource(bundle.categories, 'exp_tc_user_id', 'categories');
    assertOwnedBySource(bundle.accounts, 'exp_ba_user_id', 'accounts');
    assertOwnedBySource(bundle.transactions, 'exp_ts_user_id', 'transactions');
    assertOwnedBySource(bundle.starredTransactions, 'exp_st_user_id', 'starredTransactions');
    assertOwnedBySource(bundle.budgets, 'exp_bg_user_id', 'budgets');
    assertOwnedBySource(bundle.recurringTransactions, 'exp_rt_user_id', 'recurringTransactions');
    assertOwnedBySource(bundle.debts, 'exp_dt_user_id', 'debts');

    const remapUserId = <T extends Record<string, any>>(rows: T[], field: string): T[] =>
      rows.map((row) => ({ ...row, [field]: targetUserId }));

    const categories = remapUserId(bundle.categories, 'exp_tc_user_id');
    const accounts = remapUserId(bundle.accounts, 'exp_ba_user_id');
    const transactionsByUser = remapUserId(bundle.transactions, 'exp_ts_user_id');
    const starredTransactions = remapUserId(bundle.starredTransactions, 'exp_st_user_id');
    // exp_bg_created_at/exp_bg_updated_at are the only timestamp columns on the schema
    // without `mode: 'string'` (see schema.ts), so drizzle expects real Date instances
    // here and calls .toISOString() on insert - the JSON-derived strings from the bundle
    // would otherwise crash with "value.toISOString is not a function".
    const budgetsByUser = remapUserId(bundle.budgets, 'exp_bg_user_id').map((budget) => ({
      ...budget,
      exp_bg_created_at: new Date(budget.exp_bg_created_at),
      exp_bg_updated_at: new Date(budget.exp_bg_updated_at),
    }));
    const recurringTransactionsByUser = remapUserId(bundle.recurringTransactions, 'exp_rt_user_id');

    const debtRepayments = bundle.debts.flatMap((debt) =>
      (debt.repayments ?? []).map((repayment: Record<string, any>) => ({
        ...repayment,
        exp_dr_debt_id: debt.exp_dt_id,
      })),
    );
    const debtsOnly = remapUserId(
      bundle.debts.map(({ repayments, ...rest }) => rest),
      'exp_dt_user_id',
    );

    await this.dbObject.db.transaction(async (tx) => {
      // Children first so FK constraints (categories are RESTRICT, not CASCADE, from
      // transactions/recurring/budgets) don't block the wipe. Deleting expDebts cascades
      // to expDebtRepayments automatically (FK is ON DELETE CASCADE), no explicit delete needed.
      await tx.delete(expDebts).where(eq(expDebts.exp_dt_user_id, targetUserId));
      await tx
        .delete(expStarredTransactions)
        .where(eq(expStarredTransactions.exp_st_user_id, targetUserId));
      await tx.delete(expBudgets).where(eq(expBudgets.exp_bg_user_id, targetUserId));
      await tx
        .delete(expRecurringTransactions)
        .where(eq(expRecurringTransactions.exp_rt_user_id, targetUserId));
      await tx.delete(expTransactions).where(eq(expTransactions.exp_ts_user_id, targetUserId));
      await tx.delete(expBankAccounts).where(eq(expBankAccounts.exp_ba_user_id, targetUserId));
      await tx
        .delete(expTransactionCategories)
        .where(eq(expTransactionCategories.exp_tc_user_id, targetUserId));

      // Parents first on the way back in, preserving original ids so FK references
      // inside the bundle (transaction -> category/account, repayment -> debt, ...) still
      // resolve; only the top-level *_user_id fields were remapped to targetUserId above.
      if (categories.length) await tx.insert(expTransactionCategories).values(categories as any);
      if (accounts.length) await tx.insert(expBankAccounts).values(accounts as any);

      // Global categories (exp_tc_user_id IS NULL, e.g. "Others") aren't in bundle.categories
      // and were never re-inserted above - each database seeds its own copies with different
      // ids. Resolve each referenced one by label + type match in *this* DB; if this DB
      // doesn't have that default seeded, fall back to creating a user-owned copy instead
      // of failing the whole import. Must run after the category delete/insert above so the
      // fallback row doesn't get wiped by the delete or collide with the reinserted set.
      const categoryIdMap = new Map<string, string>();
      for (const ref of bundle.globalCategoryRefs ?? []) {
        const match = await tx.query.expTransactionCategories.findFirst({
          where: (category, { and, eq, isNull }) =>
            and(
              eq(category.exp_tc_label, ref.exp_tc_label),
              eq(category.exp_tc_transaction_type, ref.exp_tc_transaction_type),
              isNull(category.exp_tc_user_id),
            ),
        });

        if (match) {
          categoryIdMap.set(ref.exp_tc_id, match.exp_tc_id);
          continue;
        }

        const [created] = await tx
          .insert(expTransactionCategories)
          .values({
            exp_tc_user_id: targetUserId,
            exp_tc_label: ref.exp_tc_label,
            exp_tc_transaction_type: ref.exp_tc_transaction_type,
          })
          .returning({ exp_tc_id: expTransactionCategories.exp_tc_id });
        categoryIdMap.set(ref.exp_tc_id, created.exp_tc_id);
      }

      const remapCategoryId = <T extends Record<string, any>>(rows: T[], field: string): T[] =>
        rows.map((row) => ({ ...row, [field]: categoryIdMap.get(row[field]) ?? row[field] }));

      const transactions = remapCategoryId(transactionsByUser, 'exp_ts_category');
      const budgets = remapCategoryId(budgetsByUser, 'exp_bg_category_id');
      const recurringTransactions = remapCategoryId(
        recurringTransactionsByUser,
        'exp_rt_category_id',
      );

      if (transactions.length) await tx.insert(expTransactions).values(transactions as any);
      if (starredTransactions.length)
        await tx.insert(expStarredTransactions).values(starredTransactions as any);
      if (budgets.length) await tx.insert(expBudgets).values(budgets as any);
      if (recurringTransactions.length)
        await tx.insert(expRecurringTransactions).values(recurringTransactions as any);
      if (debtsOnly.length) await tx.insert(expDebts).values(debtsOnly as any);
      if (debtRepayments.length) await tx.insert(expDebtRepayments).values(debtRepayments as any);
    });

    return {
      restoredAt: new Date().toISOString(),
      userId: targetUserId,
      counts: {
        accounts: bundle.accounts.length,
        categories: bundle.categories.length,
        transactions: bundle.transactions.length,
        starredTransactions: bundle.starredTransactions.length,
        budgets: bundle.budgets.length,
        recurringTransactions: bundle.recurringTransactions.length,
        debts: debtsOnly.length,
        debtRepayments: debtRepayments.length,
      },
    };
  }
}
