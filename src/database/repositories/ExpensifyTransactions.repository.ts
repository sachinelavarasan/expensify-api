import { Inject } from '@nestjs/common';
import { and, desc, eq, gte, ilike, isNull, lt, or, sql } from 'drizzle-orm';

import { DB } from '../database.constants';
import { Database } from '../types/Database';

import {
  expBankAccounts,
  expBudgets,
  expStarredTransactions,
  expTransactionCategories,
  expTransactions,
  expTransactionTypes,
  InsertExpensifyTransactions,
} from '../schemas/schema';
import { TransactionDto } from 'src/modules/expensify/dto/auth.dto';
import { ExpStarredTransactionsRepository } from './ExpStarredTransactions.repository';

export class ExpensifyTransactionsRepository {
  constructor(
    @Inject(DB)
    private readonly dbObject: Database,
    private expStarredTransactionsRepository: ExpStarredTransactionsRepository,
  ) {}

  async getOne(id: string, userId: string) {
    return await this.dbObject.db
      .select({
        exp_ts_id: expTransactions.exp_ts_id,
        exp_ts_title: expTransactions.exp_ts_title,
        exp_ts_date: expTransactions.exp_ts_date,
        exp_ts_note: expTransactions.exp_ts_note,
        exp_ts_time: expTransactions.exp_ts_time,
        exp_ts_amount: expTransactions.exp_ts_amount,
        exp_ts_created_at: expTransactions.exp_ts_created_at,
        exp_ts_updated_at: expTransactions.exp_ts_updated_at,
        exp_ts_category: expTransactionCategories.exp_tc_label,
        exp_ts_transaction_type: expTransactionTypes.exp_tt_label,
        exp_tc_id: expTransactionCategories.exp_tc_id,
        exp_tt_id: expTransactionTypes.exp_tt_id,
        exp_st_id: expStarredTransactions.exp_st_id,
        exp_tc_icon: expTransactionCategories.exp_tc_icon,
        exp_tc_icon_bg_color: expTransactionCategories.exp_tc_icon_bg_color,
        exp_ts_bank_account_id: expTransactions.exp_ts_bank_account_id,
      })
      .from(expTransactions)
      .innerJoin(
        expTransactionTypes,
        eq(expTransactions.exp_ts_transaction_type, expTransactionTypes.exp_tt_id),
      )
      .innerJoin(
        expTransactionCategories,
        eq(expTransactions.exp_ts_category, expTransactionCategories.exp_tc_id),
      )
      .leftJoin(
        expStarredTransactions,
        eq(expTransactions.exp_ts_id, expStarredTransactions.exp_st_transaction_id),
      )
      .orderBy(desc(expTransactions.exp_ts_date))
      .where(and(eq(expTransactions.exp_ts_id, id), eq(expTransactions.exp_ts_user_id, userId)))
      .limit(1);
  }
  async createTransaction(data: TransactionDto) {
    const isStarred = data.exp_st_id;
    delete data.exp_st_id;

    const selectedAcc = await this.dbObject.db.query.expBankAccounts.findFirst({
      where: (expBankAccounts, { eq, and }) =>
        and(
          eq(expBankAccounts.exp_ba_id, data.exp_ts_bank_account_id),
          eq(expBankAccounts.exp_ba_user_id, data.exp_ts_user_id),
          eq(expBankAccounts.exp_ba_is_active, 1),
        ),
    });

    if (!selectedAcc) {
      throw new Error('The selected bank account is not active or not found');
    }

    // Step 2: Parse amount and balances
    const currentBalance = parseFloat(selectedAcc.exp_ba_balance) || 0;
    const transactionAmount = parseFloat(data.exp_ts_amount) || 0;

    if (isNaN(transactionAmount)) {
      throw new Error('Invalid transaction amount');
    }

    // Step 3: Compute new balance based on transaction type
    let newBalance = currentBalance;

    if (data.exp_tt_id === 1) {
      newBalance = currentBalance - transactionAmount;
    } else if (data.exp_tt_id === 2) {
      newBalance = currentBalance + transactionAmount;
    } else {
      throw new Error('Invalid transaction type');
    }

    // Step 4: Update the bank account balance
    await this.dbObject.db
      .update(expBankAccounts)
      .set({
        exp_ba_balance: newBalance.toFixed(2),
      })
      .where(eq(expBankAccounts.exp_ba_id, selectedAcc.exp_ba_id));

    // Step 5: Insert the transaction record
    const transaction = data as unknown as InsertExpensifyTransactions;
    const [row] = await this.dbObject.db.insert(expTransactions).values(transaction).returning();

    // Step 6: Star the transaction if required
    if (isStarred) {
      await this.expStarredTransactionsRepository.starTransaction({
        exp_st_user_id: transaction.exp_ts_user_id,
        exp_st_transaction_id: row.exp_ts_id,
      });
    }

    return row;
  }

  async save(transactions: InsertExpensifyTransactions[]) {
    const selectedAcc = await this.dbObject.db.query.expBankAccounts.findFirst({
      where: (expBankAccounts, { eq }) => {
        return and(
          eq(expBankAccounts.exp_ba_id, transactions[0].exp_ts_bank_account_id),
          eq(expBankAccounts.exp_ba_is_active, 1),
        );
      },
    });
    if (!selectedAcc) {
      throw new Error('Your bank account not active');
    }
    const currentBalance = parseFloat(selectedAcc.exp_ba_balance) || 0;

    const totalTransactionAmount = transactions.reduce((sum, tx) => {
      const amount = Number(tx.exp_ts_amount) || 0;
      return tx.exp_ts_transaction_type === 1 ? sum - amount : sum + amount;
    }, 0);

    const newBalance = (currentBalance + totalTransactionAmount).toFixed(2);

    await this.dbObject.db.transaction(async (tx) => {
      await tx.insert(expTransactions).values(transactions).returning();
      await tx
        .update(expBankAccounts)
        .set({ exp_ba_balance: newBalance })
        .where(eq(expBankAccounts.exp_ba_id, selectedAcc.exp_ba_id))
        .returning();
    });

    return true;
  }
  async updateTransaction(id: string, data: TransactionDto, userId: string) {
    const isStarred = data.exp_st_id;
    delete data.exp_st_id;

    const existingTransaction = await this.dbObject.db.query.expTransactions.findFirst({
      where: (expTransactions, { eq, and }) =>
        and(eq(expTransactions.exp_ts_id, id), eq(expTransactions.exp_ts_user_id, userId)),
    });

    if (!existingTransaction) {
      throw new Error('Transaction not found');
    }

    const transaction = data as unknown as InsertExpensifyTransactions;

    const oldAccountId = existingTransaction.exp_ts_bank_account_id;
    const newAccountId = transaction.exp_ts_bank_account_id;

    const currAcc = await this.dbObject.db.query.expBankAccounts.findFirst({
      where: (expBankAccounts, { eq }) =>
        and(eq(expBankAccounts.exp_ba_id, oldAccountId), eq(expBankAccounts.exp_ba_is_active, 1)),
    });

    const newAcc = await this.dbObject.db.query.expBankAccounts.findFirst({
      where: (expBankAccounts, { eq }) =>
        and(eq(expBankAccounts.exp_ba_id, newAccountId), eq(expBankAccounts.exp_ba_is_active, 1)),
    });

    if (!currAcc || !newAcc) {
      throw new Error('Bank account not found or inactive');
    }

    const oldAmount = parseFloat(existingTransaction.exp_ts_amount) || 0;
    const newAmount = parseFloat(transaction.exp_ts_amount as any) || 0;

    const isExpense = transaction.exp_ts_transaction_type === 1;

    const oldType = existingTransaction.exp_ts_transaction_type;
    const newType = data.exp_tt_id;

    await this.dbObject.db.transaction(async (tx) => {
      await tx
        .update(expTransactions)
        .set(data)
        .where(eq(expTransactions.exp_ts_id, id))
        .returning();

      if (oldAccountId === newAccountId) {
        let balanceChange = parseFloat(currAcc.exp_ba_balance);

        if (oldType === newType) {
          if (newType === 1) {
            balanceChange += oldAmount - newAmount;
          } else {
            balanceChange += newAmount - oldAmount;
          }
        } else {
          if (newType === 1) {
            balanceChange -= oldAmount + newAmount;
          } else {
            balanceChange += oldAmount + newAmount;
          }
        }

        await tx
          .update(expBankAccounts)
          .set({
            exp_ba_balance: balanceChange.toFixed(2),
          })
          .where(eq(expBankAccounts.exp_ba_id, oldAccountId))
          .returning();
      } else {
        const oldAccountAdjustment =
          existingTransaction.exp_ts_transaction_type === 1
            ? parseFloat(currAcc.exp_ba_balance) + oldAmount
            : parseFloat(currAcc.exp_ba_balance) - oldAmount;
        const newAccountAdjustment = isExpense
          ? parseFloat(newAcc.exp_ba_balance) - newAmount
          : parseFloat(newAcc.exp_ba_balance) + newAmount;

        await tx
          .update(expBankAccounts)
          .set({
            exp_ba_balance: oldAccountAdjustment.toFixed(2),
          })
          .where(eq(expBankAccounts.exp_ba_id, oldAccountId))
          .returning();

        await tx
          .update(expBankAccounts)
          .set({
            exp_ba_balance: newAccountAdjustment.toFixed(2),
          })
          .where(eq(expBankAccounts.exp_ba_id, newAccountId))
          .returning();
      }
    });

    if (isStarred) {
      await this.expStarredTransactionsRepository.starTransaction({
        exp_st_user_id: transaction.exp_ts_user_id,
        exp_st_transaction_id: id,
      });
    } else {
      await this.expStarredTransactionsRepository.unstarTransaction(transaction.exp_ts_user_id, id);
    }

    return true;
  }

  async getAllTransactions(
    userId: string,
    args: {
      startDate?: string;
      endDate?: string;
      accountId?: string;
      transaction_type?: number;
      transaction_label?: string;
    },
  ) {
    const conditions = [eq(expTransactions.exp_ts_user_id, userId)];
    if (args.startDate && args.endDate) {
      conditions.push(
        gte(expTransactions.exp_ts_date, args.startDate),
        lt(expTransactions.exp_ts_date, args.endDate),
      );
    }
    if (args.accountId) {
      conditions.push(eq(expTransactions.exp_ts_bank_account_id, args.accountId));
    }
    if (args.transaction_type) {
      conditions.push(eq(expTransactions.exp_ts_transaction_type, args.transaction_type));
    }
    if (args.transaction_label) {
      conditions.push(ilike(expTransactions.exp_ts_title, `%${args.transaction_label}%`));
    }
    return await this.dbObject.db
      .select({
        exp_ts_id: expTransactions.exp_ts_id,
        exp_ts_title: expTransactions.exp_ts_title,
        exp_ts_date: expTransactions.exp_ts_date,
        exp_ts_note: expTransactions.exp_ts_note,
        exp_ts_time: expTransactions.exp_ts_time,
        exp_ts_amount: expTransactions.exp_ts_amount,
        exp_ts_category: expTransactionCategories.exp_tc_label,
        exp_ts_transaction_type: expTransactionTypes.exp_tt_label,
        exp_tc_id: expTransactionCategories.exp_tc_id,
        exp_tc_icon: expTransactionCategories.exp_tc_icon,
        exp_tc_icon_bg_color: expTransactionCategories.exp_tc_icon_bg_color,
        exp_tt_id: expTransactionTypes.exp_tt_id,
        exp_ba_id: expBankAccounts.exp_ba_id,
        exp_ba_name: expBankAccounts.exp_ba_name,
      })
      .from(expTransactions)
      .innerJoin(
        expTransactionTypes,
        eq(expTransactions.exp_ts_transaction_type, expTransactionTypes.exp_tt_id),
      )
      .innerJoin(
        expBankAccounts,
        eq(expTransactions.exp_ts_bank_account_id, expBankAccounts.exp_ba_id),
      )
      .innerJoin(
        expTransactionCategories,
        eq(expTransactions.exp_ts_category, expTransactionCategories.exp_tc_id),
      )
      .orderBy(desc(expTransactions.exp_ts_date), desc(expTransactions.exp_ts_created_at))
      .where(and(...conditions));
  }

  // Dedicated paginated query for a single account's transaction history (used by
  // the account detail screen's infinite scroll) - kept separate from
  // getAllTransactions above so that method's unpaginated callers are unaffected.
  async getPaginatedTransactionsForAccount(
    userId: string,
    accountId: string,
    limit: number,
    offset: number,
  ) {
    return await this.dbObject.db
      .select({
        exp_ts_id: expTransactions.exp_ts_id,
        exp_ts_title: expTransactions.exp_ts_title,
        exp_ts_date: expTransactions.exp_ts_date,
        exp_ts_note: expTransactions.exp_ts_note,
        exp_ts_time: expTransactions.exp_ts_time,
        exp_ts_amount: expTransactions.exp_ts_amount,
        exp_ts_category: expTransactionCategories.exp_tc_label,
        exp_ts_transaction_type: expTransactionTypes.exp_tt_label,
        exp_tc_id: expTransactionCategories.exp_tc_id,
        exp_tc_icon: expTransactionCategories.exp_tc_icon,
        exp_tc_icon_bg_color: expTransactionCategories.exp_tc_icon_bg_color,
        exp_tt_id: expTransactionTypes.exp_tt_id,
        exp_ba_id: expBankAccounts.exp_ba_id,
        exp_ba_name: expBankAccounts.exp_ba_name,
      })
      .from(expTransactions)
      .innerJoin(
        expTransactionTypes,
        eq(expTransactions.exp_ts_transaction_type, expTransactionTypes.exp_tt_id),
      )
      .innerJoin(
        expBankAccounts,
        eq(expTransactions.exp_ts_bank_account_id, expBankAccounts.exp_ba_id),
      )
      .innerJoin(
        expTransactionCategories,
        eq(expTransactions.exp_ts_category, expTransactionCategories.exp_tc_id),
      )
      .where(
        and(
          eq(expTransactions.exp_ts_user_id, userId),
          eq(expTransactions.exp_ts_bank_account_id, accountId),
        ),
      )
      .orderBy(desc(expTransactions.exp_ts_date), desc(expTransactions.exp_ts_created_at))
      .limit(limit)
      .offset(offset);
  }

  async deleteTransaction(id: string, userId: string) {
    const existingTransaction = await this.dbObject.db.query.expTransactions.findFirst({
      where: (expTransactions, { eq, and }) =>
        and(eq(expTransactions.exp_ts_id, id), eq(expTransactions.exp_ts_user_id, userId)),
    });

    if (!existingTransaction) {
      throw new Error('Transaction not found');
    }

    const accountId = existingTransaction.exp_ts_bank_account_id;

    const account = await this.dbObject.db.query.expBankAccounts.findFirst({
      where: (expBankAccounts, { eq }) =>
        and(eq(expBankAccounts.exp_ba_id, accountId), eq(expBankAccounts.exp_ba_is_active, 1)),
    });

    if (!account) {
      throw new Error('Bank account not found or inactive');
    }

    const currentBalance = parseFloat(account.exp_ba_balance);
    const isExpense = existingTransaction.exp_ts_transaction_type === 1;
    const transactionAmount = parseFloat(existingTransaction.exp_ts_amount);

    const updatedBalance = isExpense
      ? currentBalance + transactionAmount
      : currentBalance - transactionAmount;

    await this.dbObject.db.transaction(async (tx) => {
      await tx.delete(expTransactions).where(eq(expTransactions.exp_ts_id, id)).returning();

      await tx
        .update(expBankAccounts)
        .set({
          exp_ba_balance: updatedBalance.toFixed(2),
        })
        .where(eq(expBankAccounts.exp_ba_id, accountId))
        .returning();
    });

    return true;
  }
  async getAllTransactionsByCategory(
    userId: string,
    args: {
      startDate?: string;
      endDate?: string;
      accountId?: string;
      transaction_type?: number;
    },
  ) {
    const conditions = [eq(expTransactions.exp_ts_user_id, userId)];
    if (args.startDate && args.endDate) {
      conditions.push(
        gte(expTransactions.exp_ts_date, args.startDate),
        lt(expTransactions.exp_ts_date, args.endDate),
      );
    }
    if (args.accountId) {
      conditions.push(eq(expTransactions.exp_ts_bank_account_id, args.accountId));
    }
    if (args.transaction_type) {
      conditions.push(eq(expTransactions.exp_ts_transaction_type, args.transaction_type));
    }
    const transactions = await this.dbObject.db
      .select({
        exp_ts_id: expTransactions.exp_ts_id,
        exp_ts_title: expTransactions.exp_ts_title,
        exp_ts_date: expTransactions.exp_ts_date,
        exp_ts_note: expTransactions.exp_ts_note,
        exp_ts_time: expTransactions.exp_ts_time,
        exp_ts_amount: expTransactions.exp_ts_amount,
        exp_ts_category: expTransactionCategories.exp_tc_label,
        exp_ts_transaction_type: expTransactionTypes.exp_tt_label,
        exp_tc_id: expTransactionCategories.exp_tc_id,
        exp_tc_icon: expTransactionCategories.exp_tc_icon,
        exp_tc_icon_bg_color: expTransactionCategories.exp_tc_icon_bg_color,
        exp_tt_id: expTransactionTypes.exp_tt_id,
        exp_ba_id: expBankAccounts.exp_ba_id,
        exp_ba_name: expBankAccounts.exp_ba_name,
      })
      .from(expTransactions)
      .innerJoin(
        expTransactionTypes,
        eq(expTransactions.exp_ts_transaction_type, expTransactionTypes.exp_tt_id),
      )
      .innerJoin(
        expBankAccounts,
        eq(expTransactions.exp_ts_bank_account_id, expBankAccounts.exp_ba_id),
      )
      .innerJoin(
        expTransactionCategories,
        eq(expTransactions.exp_ts_category, expTransactionCategories.exp_tc_id),
      )
      .orderBy(desc(expTransactions.exp_ts_created_at), desc(expTransactions.exp_ts_date))
      .where(and(...conditions));

    const budgets = await this.dbObject.db
      .select({
        exp_bg_id: expBudgets.exp_bg_id,
        exp_bg_category_id: expBudgets.exp_bg_category_id,
        exp_bg_amount: expBudgets.exp_bg_amount,
      })
      .from(expBudgets)
      .where(
        and(
          eq(expBudgets.exp_bg_user_id, userId),
          gte(expBudgets.exp_bg_date, args.startDate),
          lt(expBudgets.exp_bg_date, args.endDate),
        ),
      );
    const allCategories = await this.dbObject.db
      .select({
        exp_tc_id: expTransactionCategories.exp_tc_id,
        exp_tc_label: expTransactionCategories.exp_tc_label,
        exp_tc_icon: expTransactionCategories.exp_tc_icon,
        exp_tc_icon_bg_color: expTransactionCategories.exp_tc_icon_bg_color,
      })
      .from(expTransactionCategories)
      .where(
        and(
          or(
            eq(expTransactionCategories.exp_tc_user_id, userId),
            isNull(expTransactionCategories.exp_tc_user_id),
          ),
          eq(expTransactionCategories.exp_tc_transaction_type, 1),
        ),
      );

    const budgetMap = budgets.reduce(
      (acc, b) => {
        if (b.exp_bg_category_id) {
          acc[b.exp_bg_category_id] = {
            exp_bg_id: b.exp_bg_id,
            exp_bg_amount: parseFloat(b.exp_bg_amount),
          };
        }
        return acc;
      },
      {} as Record<string, { exp_bg_id: string; exp_bg_amount: number }>,
    );
    const transactionGroups = transactions.reduce(
      (acc, item) => {
        const categoryId = item.exp_tc_id;
        if (!acc[categoryId]) {
          acc[categoryId] = {
            totalAmount: 0,
            transactionCount: 0,
            transactions: [],
          };
        }

        const amount = parseFloat(item.exp_ts_amount) || 0;
        acc[categoryId].totalAmount += amount;
        acc[categoryId].transactionCount += 1;
        acc[categoryId].transactions.push(item);

        return acc;
      },
      {} as Record<string, { totalAmount: number; transactionCount: number; transactions: any[] }>,
    );

    const result = allCategories.map((cat) => {
      const txGroup = transactionGroups[cat.exp_tc_id];
      const budget = budgetMap[cat.exp_tc_id];

      const totalAmount = txGroup?.totalAmount || 0;
      const transactionCount = txGroup?.transactionCount || 0;
      const transactions = txGroup?.transactions || [];

      const budgetAmount = budget ? budget.exp_bg_amount : 0;
      const remainingBudget = budgetAmount - totalAmount;

      return {
        categoryId: cat.exp_tc_id,
        category: cat.exp_tc_label,
        icon: cat.exp_tc_icon,
        iconBg: cat.exp_tc_icon_bg_color,
        transactions,
        totalAmount,
        transactionCount,
        exp_bg_id: budget ? budget.exp_bg_id : null,
        budgetAmount,
        remainingBudget,
      };
    });

    return result;
  }

  async getMonthlyTrend(userId: string, startDate: string) {
    const results = await this.dbObject.db.execute(sql`
      SELECT
        to_char(exp_ts_date, 'YYYY-MM') as month,
        SUM(exp_ts_amount::numeric) FILTER (WHERE exp_ts_transaction_type = 2) as income,
        SUM(exp_ts_amount::numeric) FILTER (WHERE exp_ts_transaction_type = 1) as expense
      FROM exp_transactions
      WHERE exp_ts_user_id = ${userId} AND exp_ts_date >= ${startDate}
      GROUP BY month
      ORDER BY month
    `);

    return results.rows as unknown as {
      month: string;
      income: string | null;
      expense: string | null;
    }[];
  }

  async getCategoryTrend(userId: string, categoryId: string, startDate: string) {
    const results = await this.dbObject.db.execute(sql`
      SELECT
        to_char(exp_ts_date, 'YYYY-MM') as month,
        SUM(exp_ts_amount::numeric) as expense
      FROM exp_transactions
      WHERE exp_ts_user_id = ${userId}
        AND exp_ts_category = ${categoryId}
        AND exp_ts_transaction_type = 1
        AND exp_ts_date >= ${startDate}
      GROUP BY month
      ORDER BY month
    `);

    return results.rows as unknown as { month: string; expense: string | null }[];
  }
}
