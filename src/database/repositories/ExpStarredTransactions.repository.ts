import { Inject, Injectable } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
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
