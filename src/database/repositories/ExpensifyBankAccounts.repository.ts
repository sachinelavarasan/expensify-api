import { Inject } from '@nestjs/common';
import { and, asc, eq, or } from 'drizzle-orm';

import { DB } from '../database.constants';
import { Database } from '../types/Database';

import { expBankAccounts, expTransactions, InsertExpensifyBankAccounts } from '../schemas/schema';
import { ExpensifyTransactionsRepository } from './ExpensifyTransactions.repository';
import { CreateBankAccountDto } from '../../modules/expensify/dto/auth.dto';

export class ExpensifyBankAccountRepository {
  constructor(
    @Inject(DB)
    private readonly dbObject: Database,
    private expensifyTransactionsRepository: ExpensifyTransactionsRepository,
  ) {}

  async getOne(id: string) {
    return await this.dbObject.db.query.expBankAccounts.findFirst({
      where: (expBankAccounts, { eq }) => {
        const conditions: any = [];
        if (id) conditions.push(eq(expBankAccounts.exp_ba_user_id, id));
        return and(conditions);
      },
    });
  }
  async createBankAccount(data: CreateBankAccountDto) {
    const { exp_ba_is_primary: wantsPrimary, ...rest } = data;
    const account = rest as unknown as InsertExpensifyBankAccounts;
    const created = await this.dbObject.db.insert(expBankAccounts).values(account).returning();

    // Reuses setPrimaryAccount's unset-others logic instead of duplicating it here.
    if (wantsPrimary && created[0]) {
      await this.setPrimaryAccount(created[0].exp_ba_id, created[0].exp_ba_user_id);
      created[0].exp_ba_is_primary = true;
    }

    return created;
  }
  async updateBankAccount(data: Partial<InsertExpensifyBankAccounts>, id: string, userId: string) {
    const existing = await this.dbObject.db.query.expBankAccounts.findFirst({
      where: (expBankAccounts, { eq, and }) =>
        and(eq(expBankAccounts.exp_ba_id, id), eq(expBankAccounts.exp_ba_user_id, userId)),
    });

    if (!existing) {
      throw new Error('Bank account not found');
    }

    // exp_ba_balance is the live running balance maintained by transaction
    // create/update/delete/restore - it must never be overwritten by the
    // account-edit form.
    const { exp_ba_balance, ...safeData } = data;

    return await this.dbObject.db
      .update(expBankAccounts)
      .set(safeData)
      .where(eq(expBankAccounts.exp_ba_id, id))
      .returning();
  }
  // Exactly one account may be primary at a time, so this unsets it on every
  // other account for the user in the same transaction as setting it here.
  async setPrimaryAccount(id: string, userId: string) {
    const existing = await this.dbObject.db.query.expBankAccounts.findFirst({
      where: (expBankAccounts, { eq, and }) =>
        and(eq(expBankAccounts.exp_ba_id, id), eq(expBankAccounts.exp_ba_user_id, userId)),
    });

    if (!existing) {
      throw new Error('Bank account not found');
    }

    await this.dbObject.db.transaction(async (tx) => {
      await tx
        .update(expBankAccounts)
        .set({ exp_ba_is_primary: false })
        .where(eq(expBankAccounts.exp_ba_user_id, userId));

      await tx
        .update(expBankAccounts)
        .set({ exp_ba_is_primary: true })
        .where(eq(expBankAccounts.exp_ba_id, id));
    });

    return true;
  }

  async deleteBankAccount(id: string, userId: string) {
    await this.dbObject.db.transaction(async (tx) => {
      await this.dbObject.db.delete(expBankAccounts).where(eq(expBankAccounts.exp_ba_id, id));
      await tx
        .delete(expTransactions)
        .where(
          and(
            eq(expTransactions.exp_ts_bank_account_id, id),
            eq(expTransactions.exp_ts_user_id, userId),
          ),
        )
        .returning();
    });

    return true;
  }

  async getAllBankAccount(id: string) {
    const conditions = [eq(expBankAccounts.exp_ba_user_id, id)];
    return await this.dbObject.db.query.expBankAccounts.findMany({
      where: or(...conditions),
      orderBy: asc(expBankAccounts.exp_ba_id),
    });
  }

  async getAccountDetailsWithGroupedTransactionsById(
    accountId: string,
    userId: string,
    limit: number,
    offset: number,
  ) {
    const [account] = await this.dbObject.db
      .select()
      .from(expBankAccounts)
      .where(
        and(eq(expBankAccounts.exp_ba_id, accountId), eq(expBankAccounts.exp_ba_user_id, userId)),
      )
      .limit(1);

    if (!account) {
      throw new Error('Account not found or access denied.');
    }

    const transactions =
      await this.expensifyTransactionsRepository.getPaginatedTransactionsForAccount(
        userId,
        accountId,
        limit,
        offset,
      );

    const groupMap: Record<
      string,
      {
        year: number;
        month: string;
        title: string;
        income: number;
        expense: number;
        data: typeof transactions;
      }
    > = {};

    for (const tx of transactions) {
      const date = new Date(tx.exp_ts_date as string);
      const month = date.toLocaleString('default', { month: 'long' });
      const year = date.getFullYear();
      const key = `${year}-${month}`;

      if (!groupMap[key]) {
        groupMap[key] = {
          year,
          month,
          title: `${month} ${year}`,
          income: 0,
          expense: 0,
          data: [],
        };
      }

      const amount = parseFloat(tx.exp_ts_amount as string);
      if (tx.exp_tt_id === 2) {
        groupMap[key].income += amount;
      } else if (tx.exp_tt_id === 1) {
        groupMap[key].expense += amount;
      }

      groupMap[key].data.push(tx);
    }

    return {
      ...account,
      data: Object.values(groupMap).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return (
          new Date(`${b.month} 1, ${b.year}`).getMonth() -
          new Date(`${a.month} 1, ${a.year}`).getMonth()
        );
      }),
      hasMore: transactions.length === limit,
    };
  }
}
