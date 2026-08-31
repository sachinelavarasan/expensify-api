import { Inject, Injectable } from '@nestjs/common';
import { eq, and, isNull, inArray, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB } from '../database.constants';
import { Database } from '../types/Database';
import {
  expTransactions,
  expStarredTransactions,
  expTransactionCategories,
  expTransactionTypes,
  expBankAccounts,
} from '../schemas/schema';
import { CreateStarredTransactionDto } from '../../modules/expensify/dto/auth.dto';

// Same self-join pattern as ExpensifyTransactionsRepository - a transfer's
// two legs are separate rows sharing exp_ts_transfer_group_id, so the other
// account's name only comes from joining a row back to its counterpart.
const counterpartTransaction = alias(expTransactions, 'counterpart_tx');
const counterpartAccount = alias(expBankAccounts, 'counterpart_account');

@Injectable()
export class ExpStarredTransactionsRepository {
  constructor(
    @Inject(DB)
    private readonly dbObject: Database,
  ) {}
  async starTransaction(dto: CreateStarredTransactionDto) {
    const exists = await this.dbObject.db
      .select()
      .from(expStarredTransactions)
      .where(
        and(
          eq(expStarredTransactions.exp_st_user_id, dto.exp_st_user_id),
          eq(expStarredTransactions.exp_st_transaction_id, dto.exp_st_transaction_id),
        ),
      )
      .then((res) => res.length > 0);

    if (exists) return { message: 'Already starred' };

    await this.dbObject.db.insert(expStarredTransactions).values(dto);
    return { message: 'Transaction starred' };
  }

  async unstarTransaction(userId: string, transactionId: string) {
    const [exists] = await this.dbObject.db
      .select()
      .from(expStarredTransactions)
      .where(
        and(
          eq(expStarredTransactions.exp_st_user_id, userId),
          eq(expStarredTransactions.exp_st_transaction_id, transactionId),
        ),
      )
      .limit(1);
    if (!exists) {
      return;
    }
    await this.dbObject.db
      .delete(expStarredTransactions)
      .where(
        and(
          eq(expStarredTransactions.exp_st_user_id, userId),
          eq(expStarredTransactions.exp_st_transaction_id, transactionId),
        ),
      );

    return { message: 'Transaction unstarred' };
  }

  async bulkStarTransactions(userId: string, transactionIds: string[]) {
    const alreadyStarred = await this.dbObject.db
      .select({ id: expStarredTransactions.exp_st_transaction_id })
      .from(expStarredTransactions)
      .where(
        and(
          eq(expStarredTransactions.exp_st_user_id, userId),
          inArray(expStarredTransactions.exp_st_transaction_id, transactionIds),
        ),
      )
      .then((rows) => new Set(rows.map((row) => row.id)));

    const toInsert = transactionIds
      .filter((id) => !alreadyStarred.has(id))
      .map((id) => ({ exp_st_user_id: userId, exp_st_transaction_id: id }));

    if (toInsert.length > 0) {
      await this.dbObject.db.insert(expStarredTransactions).values(toInsert);
    }

    return { message: 'Transactions starred' };
  }

  async bulkUnstarTransactions(userId: string, transactionIds: string[]) {
    await this.dbObject.db
      .delete(expStarredTransactions)
      .where(
        and(
          eq(expStarredTransactions.exp_st_user_id, userId),
          inArray(expStarredTransactions.exp_st_transaction_id, transactionIds),
        ),
      );

    return { message: 'Transactions unstarred' };
  }

  async getUserStarredTransactions(userId: string) {
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
        exp_tt_id: expTransactionTypes.exp_tt_id,
        exp_st_id: expStarredTransactions.exp_st_id,
        exp_tc_icon: expTransactionCategories.exp_tc_icon,
        exp_tc_icon_bg_color: expTransactionCategories.exp_tc_icon_bg_color,
        exp_ba_id: expBankAccounts.exp_ba_id,
        exp_ba_name: expBankAccounts.exp_ba_name,
        exp_ts_transfer_group_id: expTransactions.exp_ts_transfer_group_id,
        exp_ts_transfer_direction: expTransactions.exp_ts_transfer_direction,
        exp_ts_transfer_counterpart_account_name: counterpartAccount.exp_ba_name,
      })
      .from(expStarredTransactions)
      .innerJoin(
        expTransactions,
        eq(expStarredTransactions.exp_st_transaction_id, expTransactions.exp_ts_id),
      )
      .innerJoin(
        expTransactionCategories,
        eq(expTransactions.exp_ts_category, expTransactionCategories.exp_tc_id),
      )
      .innerJoin(
        expBankAccounts,
        eq(expTransactions.exp_ts_bank_account_id, expBankAccounts.exp_ba_id),
      )
      .innerJoin(
        expTransactionTypes,
        eq(expTransactions.exp_ts_transaction_type, expTransactionTypes.exp_tt_id),
      )
      .leftJoin(
        counterpartTransaction,
        and(
          eq(
            counterpartTransaction.exp_ts_transfer_group_id,
            expTransactions.exp_ts_transfer_group_id,
          ),
          ne(counterpartTransaction.exp_ts_id, expTransactions.exp_ts_id),
        ),
      )
      .leftJoin(
        counterpartAccount,
        eq(counterpartTransaction.exp_ts_bank_account_id, counterpartAccount.exp_ba_id),
      )
      .where(
        and(
          eq(expStarredTransactions.exp_st_user_id, userId),
          isNull(expTransactions.exp_ts_deleted_at),
        ),
      );
  }

  async isTransactionStarred(userId: string, transactionId: string) {
    const result = await this.dbObject.db
      .select()
      .from(expStarredTransactions)
      .where(
        and(
          eq(expStarredTransactions.exp_st_user_id, userId),
          eq(expStarredTransactions.exp_st_transaction_id, transactionId),
        ),
      );

    return { isStarred: result.length > 0 };
  }
}
