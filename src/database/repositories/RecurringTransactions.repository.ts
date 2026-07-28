import { Inject, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, isNull, or } from 'drizzle-orm';

import { DB } from '../database.constants';
import { Database } from '../types/Database';

import {
  expBankAccounts,
  expRecurringTransactions,
  expTransactionCategories,
  expTransactionTypes,
  InsertExpensifyRecurringTransactions,
} from '../schemas/schema';
import {
  CreateRecurringTransactionDto,
  UpdateRecurringTransactionDto,
} from 'src/modules/expensify/dto/auth.dto';

export class RecurringTransactionsRepository {
  constructor(
    @Inject(DB)
    private readonly dbObject: Database,
  ) {}

  async getAllForUser(userId: string) {
    return await this.dbObject.db
      .select({
        exp_rt_id: expRecurringTransactions.exp_rt_id,
        exp_rt_title: expRecurringTransactions.exp_rt_title,
        exp_rt_amount: expRecurringTransactions.exp_rt_amount,
        exp_rt_note: expRecurringTransactions.exp_rt_note,
        exp_rt_category_id: expRecurringTransactions.exp_rt_category_id,
        exp_rt_transaction_type_id: expRecurringTransactions.exp_rt_transaction_type_id,
        exp_rt_bank_account_id: expRecurringTransactions.exp_rt_bank_account_id,
        exp_rt_frequency: expRecurringTransactions.exp_rt_frequency,
        exp_rt_start_date: expRecurringTransactions.exp_rt_start_date,
        exp_rt_end_date: expRecurringTransactions.exp_rt_end_date,
        exp_rt_next_due_date: expRecurringTransactions.exp_rt_next_due_date,
        exp_rt_is_active: expRecurringTransactions.exp_rt_is_active,
        exp_tc_label: expTransactionCategories.exp_tc_label,
        exp_tc_icon: expTransactionCategories.exp_tc_icon,
        exp_tc_icon_bg_color: expTransactionCategories.exp_tc_icon_bg_color,
        exp_tt_label: expTransactionTypes.exp_tt_label,
        exp_ba_name: expBankAccounts.exp_ba_name,
      })
      .from(expRecurringTransactions)
      .innerJoin(
        expTransactionCategories,
        eq(expRecurringTransactions.exp_rt_category_id, expTransactionCategories.exp_tc_id),
      )
      .innerJoin(
        expTransactionTypes,
        eq(expRecurringTransactions.exp_rt_transaction_type_id, expTransactionTypes.exp_tt_id),
      )
      .leftJoin(
        expBankAccounts,
        eq(expRecurringTransactions.exp_rt_bank_account_id, expBankAccounts.exp_ba_id),
      )
      .where(eq(expRecurringTransactions.exp_rt_user_id, userId))
      .orderBy(asc(expRecurringTransactions.exp_rt_next_due_date));
  }

  async getOne(id: string) {
    return await this.dbObject.db.query.expRecurringTransactions.findFirst({
      where: eq(expRecurringTransactions.exp_rt_id, id),
    });
  }

  async create(dto: CreateRecurringTransactionDto) {
    const data = dto as unknown as InsertExpensifyRecurringTransactions;
    const [record] = await this.dbObject.db
      .insert(expRecurringTransactions)
      .values(data)
      .returning();
    return record;
  }

  async update(id: string, dto: UpdateRecurringTransactionDto, userId: string) {
    const current = await this.getOne(id);
    if (!current || current.exp_rt_user_id !== userId) {
      throw new NotFoundException(`Recurring transaction with ID ${id} not found`);
    }
    const data = dto as unknown as Partial<InsertExpensifyRecurringTransactions>;
    const [record] = await this.dbObject.db
      .update(expRecurringTransactions)
      .set(data)
      .where(eq(expRecurringTransactions.exp_rt_id, id))
      .returning();
    return record;
  }

  async delete(id: string, userId: string) {
    const current = await this.getOne(id);
    if (!current || current.exp_rt_user_id !== userId) {
      throw new NotFoundException(`Recurring transaction with ID ${id} not found`);
    }
    await this.dbObject.db
      .delete(expRecurringTransactions)
      .where(eq(expRecurringTransactions.exp_rt_id, id));
    return { message: 'Recurring transaction removed' };
  }

  async getActiveRules(today: string) {
    return await this.dbObject.db
      .select({
        exp_rt_id: expRecurringTransactions.exp_rt_id,
        exp_rt_user_id: expRecurringTransactions.exp_rt_user_id,
        exp_rt_title: expRecurringTransactions.exp_rt_title,
        exp_rt_amount: expRecurringTransactions.exp_rt_amount,
        exp_rt_category_id: expRecurringTransactions.exp_rt_category_id,
        exp_rt_transaction_type_id: expRecurringTransactions.exp_rt_transaction_type_id,
        exp_rt_bank_account_id: expRecurringTransactions.exp_rt_bank_account_id,
        exp_rt_frequency: expRecurringTransactions.exp_rt_frequency,
        exp_rt_end_date: expRecurringTransactions.exp_rt_end_date,
        exp_rt_next_due_date: expRecurringTransactions.exp_rt_next_due_date,
      })
      .from(expRecurringTransactions)
      .where(
        and(
          eq(expRecurringTransactions.exp_rt_is_active, true),
          or(
            isNull(expRecurringTransactions.exp_rt_end_date),
            gte(expRecurringTransactions.exp_rt_end_date, today),
          ),
        ),
      );
  }
}
