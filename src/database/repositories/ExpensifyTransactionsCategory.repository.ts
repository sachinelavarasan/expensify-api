import { Inject, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, getTableColumns, isNull, or, sql } from 'drizzle-orm';

import { DB } from '../database.constants';
import { Database } from '../types/Database';

import {
  expTransactionCategories,
  expTransactions,
  InsertExpensifyTransactionCategories,
  SelectExpensifyTransactionCategories,
} from '../schemas/schema';

export class ExpensifyTransactionsCategoryRepository {
  constructor(
    @Inject(DB)
    private readonly dbObject: Database,
  ) {}

  async getOne(args: { id?: string }) {
    return await this.dbObject.db.query.expTransactionCategories.findFirst({
      where: (expTransactionCategories, { eq }) => {
        const conditions: any = [];
        if (args && args.id) conditions.push(eq(expTransactionCategories.exp_tc_id, args.id));
        return and(conditions);
      },
    });
  }
  async updateCategory(
    data: Partial<InsertExpensifyTransactionCategories>,
    userId: string,
    args: { id: string },
  ) {
    let current = await this.getOne({ id: args.id });

    if (!current || current.exp_tc_user_id !== userId) {
      throw new NotFoundException(`Category with ID ${args.id} not found`);
    }

    await this.dbObject.db
      .update(expTransactionCategories)
      .set(data)
      .where(eq(expTransactionCategories.exp_tc_id, current.exp_tc_id));

    current = await this.getOne({ id: args.id });

    const remainingCategories = await this.dbObject.db
      .select({
        id: expTransactionCategories.exp_tc_id,
      })
      .from(expTransactionCategories)
      .where(
        and(
          eq(expTransactionCategories.exp_tc_user_id, userId),
          eq(expTransactionCategories.exp_tc_transaction_type, current.exp_tc_transaction_type),
        ),
      )
      .orderBy(asc(expTransactionCategories.exp_tc_sort_order));

    for (let i = 0; i < remainingCategories.length; i++) {
      const cat = remainingCategories[i];
      await this.dbObject.db
        .update(expTransactionCategories)
        .set({ exp_tc_sort_order: i + 1 })
        .where(eq(expTransactionCategories.exp_tc_id, cat.id));
    }
    return true;
  }

  async getAllCategories(id: string) {
    const conditions = [
      eq(expTransactionCategories.exp_tc_user_id, id),
      isNull(expTransactionCategories.exp_tc_user_id),
    ];
    const result = await this.dbObject.db
      .select({
        ...getTableColumns(expTransactionCategories),
        transaction_count: sql<number>`count(${expTransactions.exp_ts_id})`.as('transaction_count'),
      })
      .from(expTransactionCategories)
      .leftJoin(
        expTransactions,
        eq(expTransactionCategories.exp_tc_id, expTransactions.exp_ts_category),
      )
      .where(or(...conditions))
      .groupBy(expTransactionCategories.exp_tc_id);

    return result;
  }
  async reorderCategories(categories: Partial<SelectExpensifyTransactionCategories>[], userId: string) {
    const updates = categories.map((item, index) =>
      this.dbObject.db
        .update(expTransactionCategories)
        .set({ exp_tc_sort_order: index + 1 })
        .where(
          and(
            eq(expTransactionCategories.exp_tc_id, item.exp_tc_id),
            eq(expTransactionCategories.exp_tc_user_id, userId),
          ),
        ),
    );
    await Promise.all(updates);
  }
  async createCategory(dto: InsertExpensifyTransactionCategories, userId: string) {
    const [maxSort] = await this.dbObject.db
      .select({
        exp_tc_sort_order: expTransactionCategories.exp_tc_sort_order,
      })
      .from(expTransactionCategories)
      .where(
        and(
          eq(expTransactionCategories.exp_tc_transaction_type, dto.exp_tc_transaction_type),
          eq(expTransactionCategories.exp_tc_user_id, userId),
        ),
      )
      .orderBy(desc(expTransactionCategories.exp_tc_sort_order))
      .limit(1);

    const sortOrder = (maxSort?.exp_tc_sort_order || 0) + 1;

    await this.dbObject.db.insert(expTransactionCategories).values({
      exp_tc_label: dto.exp_tc_label,
      exp_tc_transaction_type: dto.exp_tc_transaction_type,
      exp_tc_icon: dto.exp_tc_icon,
      exp_tc_user_id: userId,
      exp_tc_icon_bg_color: dto.exp_tc_icon_bg_color,
      exp_tc_sort_order: sortOrder,
    });
  }

  async deleteCategory(id: string, userId: string): Promise<void> {
    await this.dbObject.db.transaction(async (tx) => {
      const current = await this.getOne({ id });
      if (!current || current.exp_tc_user_id !== userId) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }
      const othersCategory = await tx
        .select()
        .from(expTransactionCategories)
        .where(
          and(
            eq(expTransactionCategories.exp_tc_label, 'Others'),
            isNull(expTransactionCategories.exp_tc_user_id),
            eq(expTransactionCategories.exp_tc_transaction_type, current.exp_tc_transaction_type),
          ),
        )
        .limit(1);

      if (!othersCategory.length) {
        throw new Error(`'Others' category not found`);
      }

      const othersCategoryId = othersCategory[0].exp_tc_id;

      await tx
        .update(expTransactions)
        .set({
          exp_ts_category: othersCategoryId,
        })
        .where(eq(expTransactions.exp_ts_category, id));

      await tx
        .delete(expTransactionCategories)
        .where(eq(expTransactionCategories.exp_tc_id, current.exp_tc_id));

      const remainingCategories = await tx
        .select({
          id: expTransactionCategories.exp_tc_id,
        })
        .from(expTransactionCategories)
        .where(
          and(
            eq(expTransactionCategories.exp_tc_user_id, userId),
            eq(expTransactionCategories.exp_tc_transaction_type, current.exp_tc_transaction_type),
          ),
        )
        .orderBy(asc(expTransactionCategories.exp_tc_sort_order));

      for (let i = 0; i < remainingCategories.length; i++) {
        const cat = remainingCategories[i];
        await tx
          .update(expTransactionCategories)
          .set({ exp_tc_sort_order: i + 1 })
          .where(eq(expTransactionCategories.exp_tc_id, cat.id));
      }
    });
  }
}
