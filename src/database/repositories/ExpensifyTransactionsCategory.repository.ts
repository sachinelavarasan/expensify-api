import { Inject, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, getTableColumns, isNull, or, sql } from 'drizzle-orm';

import { DB } from '../database.constants';
import { Database } from '../types/Database';

import {
  expTransactionCategories,
  expTransactions,
  expRecurringTransactions,
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

  async getDefaultCategory(transactionType: number) {
    const [category] = await this.dbObject.db
      .select()
      .from(expTransactionCategories)
      .where(
        and(
          eq(expTransactionCategories.exp_tc_label, 'Others'),
          isNull(expTransactionCategories.exp_tc_user_id),
          eq(expTransactionCategories.exp_tc_transaction_type, transactionType),
        ),
      )
      .limit(1);

    return category ?? null;
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
        total_spend: sql<string>`coalesce(sum(${expTransactions.exp_ts_amount}::numeric), 0)`.as(
          'total_spend',
        ),
      })
      .from(expTransactionCategories)
      .leftJoin(
        expTransactions,
        and(
          eq(expTransactionCategories.exp_tc_id, expTransactions.exp_ts_category),
          isNull(expTransactions.exp_ts_deleted_at),
        ),
      )
      .where(or(...conditions))
      .groupBy(expTransactionCategories.exp_tc_id);

    return result;
  }
  async reorderCategories(
    categories: Partial<SelectExpensifyTransactionCategories>[],
    userId: string,
  ) {
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

  async deleteCategory(id: string, userId: string, targetCategoryId?: string): Promise<void> {
    await this.dbObject.db.transaction(async (tx) => {
      const current = await tx.query.expTransactionCategories.findFirst({
        where: (categories, { eq }) => eq(categories.exp_tc_id, id),
      });
      if (!current || current.exp_tc_user_id !== userId) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }

      // Caller may name an explicit reassignment target (must be a real,
      // same-type category the caller can actually see - not the category
      // being deleted itself). Anything that doesn't check out falls back to
      // the global 'Others' category for that transaction type, same as
      // before this was configurable.
      let reassignCategoryId: string | null = null;
      if (targetCategoryId && targetCategoryId !== id) {
        const [target] = await tx
          .select()
          .from(expTransactionCategories)
          .where(
            and(
              eq(expTransactionCategories.exp_tc_id, targetCategoryId),
              eq(expTransactionCategories.exp_tc_transaction_type, current.exp_tc_transaction_type),
              or(
                eq(expTransactionCategories.exp_tc_user_id, userId),
                isNull(expTransactionCategories.exp_tc_user_id),
              ),
            ),
          )
          .limit(1);
        if (target) {
          reassignCategoryId = target.exp_tc_id;
        }
      }

      if (!reassignCategoryId) {
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

        reassignCategoryId = othersCategory[0].exp_tc_id;
      }

      await tx
        .update(expTransactions)
        .set({
          exp_ts_category: reassignCategoryId,
        })
        .where(eq(expTransactions.exp_ts_category, id));

      await tx
        .update(expRecurringTransactions)
        .set({
          exp_rt_category_id: reassignCategoryId,
        })
        .where(eq(expRecurringTransactions.exp_rt_category_id, id));

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
