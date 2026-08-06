import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, gte, lt } from 'drizzle-orm';
import moment from 'moment';
import { DB } from '../database.constants';
import { Database } from '../types/Database';
import { expBudgets, InsertExpensifyBudgets } from '../schemas/schema';
import { CreateBudgetDto, UpdateBudgetDto } from '../../modules/expensify/dto/auth.dto';

@Injectable()
export class ExpensifyBudgetRepository {
  constructor(
    @Inject(DB)
    private readonly dbObject: Database,
  ) {}

  async getOne(id: string) {
    return await this.dbObject.db.query.expBudgets.findFirst({
      where: eq(expBudgets.exp_bg_id, id),
    });
  }
  async addBudget(dto: CreateBudgetDto) {
    const data = dto as unknown as InsertExpensifyBudgets;
    await this.dbObject.db.insert(expBudgets).values(data);
    return { message: 'Budget added' };
  }

  async removeBudget(bgId: string, userId: string) {
    const current = await this.getOne(bgId);
    if (!current || current.exp_bg_user_id !== userId) {
      throw new NotFoundException(`Budget with ID ${bgId} not found`);
    }
    await this.dbObject.db.delete(expBudgets).where(and(eq(expBudgets.exp_bg_id, bgId)));
    return { message: 'Budget removed' };
  }

  async updateBudget(dto: UpdateBudgetDto, id: string, userId: string) {
    const current = await this.getOne(id);

    if (!current || current.exp_bg_user_id !== userId) {
      throw new NotFoundException(`Budget with ID ${id} not found`);
    }
    const data = dto as unknown as Partial<InsertExpensifyBudgets>;
    await this.dbObject.db
      .update(expBudgets)
      .set(data)
      .where(eq(expBudgets.exp_bg_id, current.exp_bg_id));
    return { message: 'Budget updated' };
  }

  async copyPreviousMonthBudgets(userId: string, targetDate: string) {
    const targetStart = moment(targetDate).startOf('month').format('YYYY-MM-DD');
    const targetEnd = moment(targetStart).add(1, 'month').format('YYYY-MM-DD');
    const prevStart = moment(targetStart).subtract(1, 'month').format('YYYY-MM-DD');
    const prevEnd = targetStart;

    const previousBudgets = await this.dbObject.db
      .select({
        exp_bg_category_id: expBudgets.exp_bg_category_id,
        exp_bg_amount: expBudgets.exp_bg_amount,
      })
      .from(expBudgets)
      .where(
        and(
          eq(expBudgets.exp_bg_user_id, userId),
          gte(expBudgets.exp_bg_date, prevStart),
          lt(expBudgets.exp_bg_date, prevEnd),
        ),
      );

    if (!previousBudgets.length) {
      return { copied: 0, skipped: 0 };
    }

    const currentBudgets = await this.dbObject.db
      .select({ exp_bg_category_id: expBudgets.exp_bg_category_id })
      .from(expBudgets)
      .where(
        and(
          eq(expBudgets.exp_bg_user_id, userId),
          gte(expBudgets.exp_bg_date, targetStart),
          lt(expBudgets.exp_bg_date, targetEnd),
        ),
      );
    const alreadyBudgeted = new Set(currentBudgets.map((b) => b.exp_bg_category_id));

    const rows = previousBudgets
      .filter((b) => !alreadyBudgeted.has(b.exp_bg_category_id))
      .map((b) => ({
        exp_bg_user_id: userId,
        exp_bg_category_id: b.exp_bg_category_id,
        exp_bg_amount: b.exp_bg_amount,
        exp_bg_date: targetStart,
      })) as InsertExpensifyBudgets[];

    if (rows.length) {
      await this.dbObject.db.insert(expBudgets).values(rows);
    }

    return { copied: rows.length, skipped: previousBudgets.length - rows.length };
  }
}
