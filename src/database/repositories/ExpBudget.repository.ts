import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DB } from '../database.constants';
import { Database } from '../types/Database';
import { expBudgets, InsertExpensifyBudgets } from '../schemas/schema';
import { CreateBudgetDto, UpdateBudgetDto } from 'src/modules/expensify/dto/auth.dto';

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

  async removeBudget(bgId: string) {
    await this.dbObject.db.delete(expBudgets).where(and(eq(expBudgets.exp_bg_id, bgId)));
    return { message: 'Budget removed' };
  }

  async updateBudget(dto: UpdateBudgetDto, id: string) {
    const current = await this.getOne(id);
    const data = dto as unknown as Partial<InsertExpensifyBudgets>;

    if (!current) {
      throw new NotFoundException(`Budget with ID ${id} not found`);
    }
    await this.dbObject.db
      .update(expBudgets)
      .set(data)
      .where(eq(expBudgets.exp_bg_id, current.exp_bg_id));
    return { message: 'Budget updated' };
  }
}
