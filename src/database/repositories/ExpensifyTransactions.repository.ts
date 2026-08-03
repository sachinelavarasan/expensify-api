import { Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';

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
  SelectExpensifyTransactions,
} from '../schemas/schema';
import { CreateTransferDto, TransactionDto } from '../../modules/expensify/dto/auth.dto';
import { ExpStarredTransactionsRepository } from './ExpStarredTransactions.repository';
import { normalizeTransactionTitle } from '../../common/utils/normalize-title.util';

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
        exp_ts_tags: expTransactions.exp_ts_tags,
        exp_ts_attachment_url: expTransactions.exp_ts_attachment_url,
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
        exp_ts_transfer_group_id: expTransactions.exp_ts_transfer_group_id,
        exp_ts_transfer_direction: expTransactions.exp_ts_transfer_direction,
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
      .where(
        and(
          eq(expTransactions.exp_ts_id, id),
          eq(expTransactions.exp_ts_user_id, userId),
          isNull(expTransactions.exp_ts_deleted_at),
        ),
      )
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
    if (data.exp_ts_title) {
      data.exp_ts_title = normalizeTransactionTitle(data.exp_ts_title);
    }
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

  // Debits the source account, credits the destination account, and inserts
  // two linked exp_tt_id=3 rows (plus an ordinary type-1 expense row for the
  // fee, if any) sharing one exp_ts_transfer_group_id - all in a single
  // db.transaction, unlike createTransaction's non-atomic pattern above.
  async createTransfer(dto: CreateTransferDto) {
    const userId = dto.exp_ts_user_id;
    const fromId = dto.exp_ts_from_bank_account_id;
    const toId = dto.exp_ts_to_bank_account_id;

    if (fromId === toId) {
      throw new Error('Source and destination accounts must be different');
    }

    const fromAccount = await this.dbObject.db.query.expBankAccounts.findFirst({
      where: (expBankAccounts, { eq, and }) =>
        and(
          eq(expBankAccounts.exp_ba_id, fromId),
          eq(expBankAccounts.exp_ba_user_id, userId),
          eq(expBankAccounts.exp_ba_is_active, 1),
        ),
    });
    const toAccount = await this.dbObject.db.query.expBankAccounts.findFirst({
      where: (expBankAccounts, { eq, and }) =>
        and(
          eq(expBankAccounts.exp_ba_id, toId),
          eq(expBankAccounts.exp_ba_user_id, userId),
          eq(expBankAccounts.exp_ba_is_active, 1),
        ),
    });

    if (!fromAccount || !toAccount) {
      throw new Error('One or both bank accounts are not active or not found');
    }

    const [transferCategory] = await this.dbObject.db
      .select()
      .from(expTransactionCategories)
      .where(
        and(
          eq(expTransactionCategories.exp_tc_label, 'Transfer'),
          isNull(expTransactionCategories.exp_tc_user_id),
          eq(expTransactionCategories.exp_tc_transaction_type, 3),
        ),
      )
      .limit(1);

    if (!transferCategory) {
      throw new Error(`'Transfer' category not found`);
    }

    const amount = parseFloat(dto.exp_ts_amount) || 0;
    if (amount <= 0) {
      throw new Error('Invalid transfer amount');
    }

    if (parseFloat(fromAccount.exp_ba_balance) < amount) {
      throw new Error('Transfer amount exceeds the source account balance');
    }

    const title = normalizeTransactionTitle(dto.exp_ts_title);
    const groupId = randomUUID();

    return await this.dbObject.db.transaction(async (tx) => {
      await tx
        .update(expBankAccounts)
        .set({
          exp_ba_balance: (parseFloat(fromAccount.exp_ba_balance) - amount).toFixed(2),
        })
        .where(eq(expBankAccounts.exp_ba_id, fromId));

      await tx
        .update(expBankAccounts)
        .set({ exp_ba_balance: (parseFloat(toAccount.exp_ba_balance) + amount).toFixed(2) })
        .where(eq(expBankAccounts.exp_ba_id, toId));

      const [debitLeg] = await tx
        .insert(expTransactions)
        .values({
          exp_ts_user_id: userId,
          exp_ts_title: title,
          exp_ts_amount: amount.toFixed(2),
          exp_ts_date: dto.exp_ts_date,
          exp_ts_time: dto.exp_ts_time,
          exp_ts_note: dto.exp_ts_note ?? null,
          exp_ts_transaction_type: 3,
          exp_ts_category: transferCategory.exp_tc_id,
          exp_ts_bank_account_id: fromId,
          exp_ts_transfer_group_id: groupId,
          exp_ts_transfer_direction: 'out',
        })
        .returning();

      const [creditLeg] = await tx
        .insert(expTransactions)
        .values({
          exp_ts_user_id: userId,
          exp_ts_title: title,
          exp_ts_amount: amount.toFixed(2),
          exp_ts_date: dto.exp_ts_date,
          exp_ts_time: dto.exp_ts_time,
          exp_ts_note: dto.exp_ts_note ?? null,
          exp_ts_transaction_type: 3,
          exp_ts_category: transferCategory.exp_tc_id,
          exp_ts_bank_account_id: toId,
          exp_ts_transfer_group_id: groupId,
          exp_ts_transfer_direction: 'in',
        })
        .returning();

      return { debitLeg, creditLeg };
    });
  }

  async save(transactions: InsertExpensifyTransactions[]) {
    // Defense-in-depth: this path only debits/credits a single account and
    // has no exp_ts_transfer_group_id/paired-leg concept - a type 3 row
    // here would be a broken, un-paired transfer with wrong balance math.
    // Bulk import is guarded against this at the controller too; this
    // repeats the check for any other caller of save().
    if (transactions.some((t) => Number(t.exp_ts_transaction_type) === 3)) {
      throw new Error('Transfers cannot be bulk imported');
    }

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

    const normalizedTransactions = transactions.map((t) => ({
      ...t,
      exp_ts_title: t.exp_ts_title ? normalizeTransactionTitle(t.exp_ts_title) : t.exp_ts_title,
    }));

    await this.dbObject.db.transaction(async (tx) => {
      await tx.insert(expTransactions).values(normalizedTransactions).returning();
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

    if (existingTransaction.exp_ts_transfer_group_id) {
      throw new Error('Transfers cannot be edited - delete and recreate instead');
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
      minAmount?: string;
      maxAmount?: string;
      categoryIds?: string[];
      tags?: string[];
    },
  ) {
    const conditions = [
      eq(expTransactions.exp_ts_user_id, userId),
      isNull(expTransactions.exp_ts_deleted_at),
    ];
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
    if (args.minAmount) {
      conditions.push(gte(sql`${expTransactions.exp_ts_amount}::numeric`, args.minAmount));
    }
    if (args.maxAmount) {
      conditions.push(lte(sql`${expTransactions.exp_ts_amount}::numeric`, args.maxAmount));
    }
    if (args.categoryIds?.length) {
      conditions.push(inArray(expTransactions.exp_ts_category, args.categoryIds));
    }
    if (args.tags?.length) {
      conditions.push(sql`${expTransactions.exp_ts_tags} && ${args.tags}`);
    }
    return await this.dbObject.db
      .select({
        exp_ts_id: expTransactions.exp_ts_id,
        exp_ts_title: expTransactions.exp_ts_title,
        exp_ts_date: expTransactions.exp_ts_date,
        exp_ts_note: expTransactions.exp_ts_note,
        exp_ts_time: expTransactions.exp_ts_time,
        exp_ts_amount: expTransactions.exp_ts_amount,
        exp_ts_tags: expTransactions.exp_ts_tags,
        exp_ts_attachment_url: expTransactions.exp_ts_attachment_url,
        exp_ts_category: expTransactionCategories.exp_tc_label,
        exp_ts_transaction_type: expTransactionTypes.exp_tt_label,
        exp_tc_id: expTransactionCategories.exp_tc_id,
        exp_tc_icon: expTransactionCategories.exp_tc_icon,
        exp_tc_icon_bg_color: expTransactionCategories.exp_tc_icon_bg_color,
        exp_tt_id: expTransactionTypes.exp_tt_id,
        exp_ba_id: expBankAccounts.exp_ba_id,
        exp_ba_name: expBankAccounts.exp_ba_name,
        exp_st_id: expStarredTransactions.exp_st_id,
        exp_ts_transfer_group_id: expTransactions.exp_ts_transfer_group_id,
        exp_ts_transfer_direction: expTransactions.exp_ts_transfer_direction,
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
      .leftJoin(
        expStarredTransactions,
        eq(expTransactions.exp_ts_id, expStarredTransactions.exp_st_transaction_id),
      )
      .orderBy(desc(expTransactions.exp_ts_date), desc(expTransactions.exp_ts_created_at))
      .where(and(...conditions));
  }

  // Candidate lookup for import duplicate-detection: narrows to the user's
  // non-deleted transactions on any of the staged rows' dates, letting the
  // caller do the final amount/title match in JS (exp_ts_amount is stored as
  // text with inconsistent formatting, so exact-match there is unreliable).
  async findByUserAndDates(
    userId: string,
    dates: string[],
  ): Promise<SelectExpensifyTransactions[]> {
    if (!dates.length) return [];
    return await this.dbObject.db
      .select()
      .from(expTransactions)
      .where(
        and(
          eq(expTransactions.exp_ts_user_id, userId),
          isNull(expTransactions.exp_ts_deleted_at),
          inArray(expTransactions.exp_ts_date, [...new Set(dates)]),
        ),
      );
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
        exp_ts_attachment_url: expTransactions.exp_ts_attachment_url,
        exp_ts_category: expTransactionCategories.exp_tc_label,
        exp_ts_transaction_type: expTransactionTypes.exp_tt_label,
        exp_tc_id: expTransactionCategories.exp_tc_id,
        exp_tc_icon: expTransactionCategories.exp_tc_icon,
        exp_tc_icon_bg_color: expTransactionCategories.exp_tc_icon_bg_color,
        exp_tt_id: expTransactionTypes.exp_tt_id,
        exp_ba_id: expBankAccounts.exp_ba_id,
        exp_ba_name: expBankAccounts.exp_ba_name,
        exp_ts_transfer_group_id: expTransactions.exp_ts_transfer_group_id,
        exp_ts_transfer_direction: expTransactions.exp_ts_transfer_direction,
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
          isNull(expTransactions.exp_ts_deleted_at),
        ),
      )
      .orderBy(desc(expTransactions.exp_ts_date), desc(expTransactions.exp_ts_created_at))
      .limit(limit)
      .offset(offset);
  }

  // A transfer's balance reversal depends on the direction of that specific
  // leg rather than a plain expense/income binary: a transfer-out leg moved
  // money out of its own account (like an expense), a transfer-in leg moved
  // money into its own account (like income). Shared by delete/restore/bulk
  // delete below so the three-way branch only lives in one place.
  private isOutflow(
    transaction: Pick<
      SelectExpensifyTransactions,
      'exp_ts_transaction_type' | 'exp_ts_transfer_direction'
    >,
  ) {
    return (
      transaction.exp_ts_transaction_type === 1 ||
      (transaction.exp_ts_transaction_type === 3 && transaction.exp_ts_transfer_direction === 'out')
    );
  }

  // Every row sharing a transfer's exp_ts_transfer_group_id must be
  // soft-deleted/restored together, or the two accounts involved would end
  // up with only one side of the transfer reversed.
  private async getGroupRows(
    tx: any,
    transaction: SelectExpensifyTransactions,
    userId: string,
    wantDeleted: boolean,
  ): Promise<SelectExpensifyTransactions[]> {
    if (!transaction.exp_ts_transfer_group_id) {
      return [transaction];
    }

    return await tx.query.expTransactions.findMany({
      where: (expTransactions, { eq, and, isNull, isNotNull }) =>
        and(
          eq(expTransactions.exp_ts_transfer_group_id, transaction.exp_ts_transfer_group_id),
          eq(expTransactions.exp_ts_user_id, userId),
          wantDeleted
            ? isNotNull(expTransactions.exp_ts_deleted_at)
            : isNull(expTransactions.exp_ts_deleted_at),
        ),
    });
  }

  async deleteTransaction(id: string, userId: string) {
    const existingTransaction = await this.dbObject.db.query.expTransactions.findFirst({
      where: (expTransactions, { eq, and }) =>
        and(eq(expTransactions.exp_ts_id, id), eq(expTransactions.exp_ts_user_id, userId)),
    });

    if (!existingTransaction) {
      throw new Error('Transaction not found');
    }

    await this.dbObject.db.transaction(async (tx) => {
      const rows = await this.getGroupRows(tx, existingTransaction, userId, false);

      for (const row of rows) {
        const accountId = row.exp_ts_bank_account_id;

        const account = await tx.query.expBankAccounts.findFirst({
          where: (expBankAccounts, { eq }) =>
            and(eq(expBankAccounts.exp_ba_id, accountId), eq(expBankAccounts.exp_ba_is_active, 1)),
        });

        if (!account) {
          throw new Error('Bank account not found or inactive');
        }

        const currentBalance = parseFloat(account.exp_ba_balance);
        const transactionAmount = parseFloat(row.exp_ts_amount);

        const updatedBalance = this.isOutflow(row)
          ? currentBalance + transactionAmount
          : currentBalance - transactionAmount;

        await tx
          .update(expTransactions)
          .set({ exp_ts_deleted_at: new Date().toISOString() })
          .where(eq(expTransactions.exp_ts_id, row.exp_ts_id));

        await tx
          .update(expBankAccounts)
          .set({ exp_ba_balance: updatedBalance.toFixed(2) })
          .where(eq(expBankAccounts.exp_ba_id, accountId));
      }
    });

    return true;
  }

  // Reuses deleteTransaction's exact per-row soft-delete + balance-adjust logic,
  // but inlined inside one shared db.transaction so the whole batch is atomic
  // (calling deleteTransaction in a loop would open/commit N separate transactions).
  // Rows that are missing, already trashed, or on an inactive account are skipped
  // rather than aborting the whole batch over one stale id. If a requested id is
  // one leg of a transfer, its group siblings are pulled in too so a transfer
  // never ends up half-deleted just because only one leg was selected.
  async bulkDeleteTransactions(ids: string[], userId: string) {
    if (!ids.length) return true;

    await this.dbObject.db.transaction(async (tx) => {
      const seen = new Set<string>();

      for (const id of ids) {
        const existingTransaction = await tx.query.expTransactions.findFirst({
          where: (expTransactions, { eq, and }) =>
            and(eq(expTransactions.exp_ts_id, id), eq(expTransactions.exp_ts_user_id, userId)),
        });

        if (!existingTransaction || existingTransaction.exp_ts_deleted_at) {
          continue;
        }

        const rows = await this.getGroupRows(tx, existingTransaction, userId, false);

        for (const row of rows) {
          if (seen.has(row.exp_ts_id)) continue;
          seen.add(row.exp_ts_id);

          const accountId = row.exp_ts_bank_account_id;

          const account = await tx.query.expBankAccounts.findFirst({
            where: (expBankAccounts, { eq }) =>
              and(
                eq(expBankAccounts.exp_ba_id, accountId),
                eq(expBankAccounts.exp_ba_is_active, 1),
              ),
          });

          if (!account) {
            continue;
          }

          const currentBalance = parseFloat(account.exp_ba_balance);
          const transactionAmount = parseFloat(row.exp_ts_amount);

          const updatedBalance = this.isOutflow(row)
            ? currentBalance + transactionAmount
            : currentBalance - transactionAmount;

          await tx
            .update(expTransactions)
            .set({ exp_ts_deleted_at: new Date().toISOString() })
            .where(eq(expTransactions.exp_ts_id, row.exp_ts_id));

          await tx
            .update(expBankAccounts)
            .set({ exp_ba_balance: updatedBalance.toFixed(2) })
            .where(eq(expBankAccounts.exp_ba_id, accountId));
        }
      }
    });

    return true;
  }

  // Scoped to category + tags only - neither affects account balance, so a plain
  // batched UPDATE is safe (unlike bulk-delete, no need to re-derive the balance
  // math per row).
  async bulkUpdateTransactions(
    ids: string[],
    patch: { exp_tc_id?: string; exp_ts_tags?: string[] },
    userId: string,
  ) {
    if (!ids.length) return true;

    const updateSet: Partial<InsertExpensifyTransactions> = {};
    if (patch.exp_tc_id) updateSet.exp_ts_category = patch.exp_tc_id;
    if (patch.exp_ts_tags) updateSet.exp_ts_tags = patch.exp_ts_tags;

    if (!Object.keys(updateSet).length) return true;

    await this.dbObject.db
      .update(expTransactions)
      .set(updateSet)
      .where(
        and(
          inArray(expTransactions.exp_ts_id, ids),
          eq(expTransactions.exp_ts_user_id, userId),
          isNull(expTransactions.exp_ts_deleted_at),
        ),
      );

    return true;
  }

  async restoreTransaction(id: string, userId: string) {
    const existingTransaction = await this.dbObject.db.query.expTransactions.findFirst({
      where: (expTransactions, { eq, and }) =>
        and(eq(expTransactions.exp_ts_id, id), eq(expTransactions.exp_ts_user_id, userId)),
    });

    if (!existingTransaction) {
      throw new Error('Transaction not found');
    }

    if (!existingTransaction.exp_ts_deleted_at) {
      throw new Error('Transaction is not in trash');
    }

    await this.dbObject.db.transaction(async (tx) => {
      const rows = await this.getGroupRows(tx, existingTransaction, userId, true);

      for (const row of rows) {
        const accountId = row.exp_ts_bank_account_id;

        const account = await tx.query.expBankAccounts.findFirst({
          where: (expBankAccounts, { eq }) =>
            and(eq(expBankAccounts.exp_ba_id, accountId), eq(expBankAccounts.exp_ba_is_active, 1)),
        });

        if (!account) {
          throw new Error('Bank account not found or inactive');
        }

        const currentBalance = parseFloat(account.exp_ba_balance);
        const transactionAmount = parseFloat(row.exp_ts_amount);

        // Inverse of deleteTransaction's adjustment above
        const updatedBalance = this.isOutflow(row)
          ? currentBalance - transactionAmount
          : currentBalance + transactionAmount;

        await tx
          .update(expTransactions)
          .set({ exp_ts_deleted_at: null })
          .where(eq(expTransactions.exp_ts_id, row.exp_ts_id));

        await tx
          .update(expBankAccounts)
          .set({ exp_ba_balance: updatedBalance.toFixed(2) })
          .where(eq(expBankAccounts.exp_ba_id, accountId));
      }
    });

    return true;
  }

  async purgeTransaction(id: string, userId: string) {
    const existingTransaction = await this.dbObject.db.query.expTransactions.findFirst({
      where: (expTransactions, { eq, and }) =>
        and(eq(expTransactions.exp_ts_id, id), eq(expTransactions.exp_ts_user_id, userId)),
    });

    if (!existingTransaction) {
      throw new Error('Transaction not found');
    }

    // Purge is balance-neutral (already adjusted at soft-delete time), so
    // no db.transaction/balance math is needed here - just hard-delete every
    // row in the transfer group together, same as a lone transaction.
    const rows = existingTransaction.exp_ts_transfer_group_id
      ? await this.dbObject.db.query.expTransactions.findMany({
          where: (expTransactions, { eq, and }) =>
            and(
              eq(
                expTransactions.exp_ts_transfer_group_id,
                existingTransaction.exp_ts_transfer_group_id,
              ),
              eq(expTransactions.exp_ts_user_id, userId),
            ),
        })
      : [existingTransaction];

    await this.dbObject.db.delete(expTransactions).where(
      inArray(
        expTransactions.exp_ts_id,
        rows.map((row) => row.exp_ts_id),
      ),
    );

    return { attachmentUrls: rows.map((row) => row.exp_ts_attachment_url).filter(Boolean) };
  }

  async getTrashedTransactions(userId: string) {
    return await this.dbObject.db
      .select({
        exp_ts_id: expTransactions.exp_ts_id,
        exp_ts_title: expTransactions.exp_ts_title,
        exp_ts_date: expTransactions.exp_ts_date,
        exp_ts_note: expTransactions.exp_ts_note,
        exp_ts_time: expTransactions.exp_ts_time,
        exp_ts_amount: expTransactions.exp_ts_amount,
        exp_ts_deleted_at: expTransactions.exp_ts_deleted_at,
        exp_ts_category: expTransactionCategories.exp_tc_label,
        exp_ts_transaction_type: expTransactionTypes.exp_tt_label,
        exp_tc_id: expTransactionCategories.exp_tc_id,
        exp_tc_icon: expTransactionCategories.exp_tc_icon,
        exp_tc_icon_bg_color: expTransactionCategories.exp_tc_icon_bg_color,
        exp_tt_id: expTransactionTypes.exp_tt_id,
        exp_ba_id: expBankAccounts.exp_ba_id,
        exp_ba_name: expBankAccounts.exp_ba_name,
        exp_ts_transfer_group_id: expTransactions.exp_ts_transfer_group_id,
        exp_ts_transfer_direction: expTransactions.exp_ts_transfer_direction,
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
          isNotNull(expTransactions.exp_ts_deleted_at),
        ),
      )
      .orderBy(desc(expTransactions.exp_ts_deleted_at));
  }

  async purgeExpiredTrash(olderThanDays = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const purged = await this.dbObject.db
      .delete(expTransactions)
      .where(
        and(
          isNotNull(expTransactions.exp_ts_deleted_at),
          lt(expTransactions.exp_ts_deleted_at, cutoff.toISOString()),
        ),
      )
      .returning({
        exp_ts_id: expTransactions.exp_ts_id,
        exp_ts_attachment_url: expTransactions.exp_ts_attachment_url,
      });

    return purged;
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
    const conditions = [
      eq(expTransactions.exp_ts_user_id, userId),
      isNull(expTransactions.exp_ts_deleted_at),
    ];
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
      WHERE exp_ts_user_id = ${userId} AND exp_ts_date >= ${startDate} AND exp_ts_deleted_at IS NULL
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
        AND exp_ts_deleted_at IS NULL
      GROUP BY month
      ORDER BY month
    `);

    return results.rows as unknown as { month: string; expense: string | null }[];
  }
}
