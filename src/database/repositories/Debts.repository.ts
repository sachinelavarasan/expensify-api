import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { DB } from '../database.constants';
import { Database } from '../types/Database';
import {
  expDebtRepayments,
  expDebts,
  InsertExpensifyDebtRepayments,
  InsertExpensifyDebts,
} from '../schemas/schema';
import {
  CreateDebtDto,
  CreateRepaymentDto,
  UpdateDebtDto,
} from '../../modules/expensify/dto/auth.dto';

@Injectable()
export class DebtsRepository {
  constructor(
    @Inject(DB)
    private readonly dbObject: Database,
  ) {}

  async getOneRaw(id: string) {
    return await this.dbObject.db.query.expDebts.findFirst({
      where: eq(expDebts.exp_dt_id, id),
    });
  }

  async getAllForUser(userId: string) {
    const results = await this.dbObject.db.execute(sql`
      SELECT
        d.*,
        COALESCE(SUM(r.exp_dr_amount::numeric), 0) as repaid_amount
      FROM exp_debts d
      LEFT JOIN exp_debt_repayments r ON r.exp_dr_debt_id = d.exp_dt_id
      WHERE d.exp_dt_user_id = ${userId} AND d.exp_dt_deleted_at IS NULL
      GROUP BY d.exp_dt_id
      ORDER BY d.exp_dt_created_at DESC
    `);

    return results.rows as unknown as (typeof expDebts.$inferSelect & { repaid_amount: string })[];
  }

  async getOne(id: string, userId: string) {
    const debt = await this.dbObject.db.query.expDebts.findFirst({
      where: and(
        eq(expDebts.exp_dt_id, id),
        eq(expDebts.exp_dt_user_id, userId),
        isNull(expDebts.exp_dt_deleted_at),
      ),
    });

    if (!debt) {
      throw new NotFoundException(`Debt with ID ${id} not found`);
    }

    const repayments = await this.dbObject.db
      .select()
      .from(expDebtRepayments)
      .where(eq(expDebtRepayments.exp_dr_debt_id, id))
      .orderBy(desc(expDebtRepayments.exp_dr_date), desc(expDebtRepayments.exp_dr_created_at));

    const repaidAmount = repayments.reduce((sum, r) => sum + (Number(r.exp_dr_amount) || 0), 0);

    return { ...debt, repayments, repaidAmount };
  }

  async create(dto: CreateDebtDto) {
    const data = dto as unknown as InsertExpensifyDebts;
    const [debt] = await this.dbObject.db.insert(expDebts).values(data).returning();
    return debt;
  }

  async update(dto: UpdateDebtDto, id: string, userId: string) {
    const current = await this.getOneRaw(id);
    if (!current || current.exp_dt_user_id !== userId || current.exp_dt_deleted_at) {
      throw new NotFoundException(`Debt with ID ${id} not found`);
    }
    const data = dto as unknown as Partial<InsertExpensifyDebts>;
    await this.dbObject.db.update(expDebts).set(data).where(eq(expDebts.exp_dt_id, id));
    return { message: 'Debt updated' };
  }

  async softDelete(id: string, userId: string) {
    const current = await this.getOneRaw(id);
    if (!current || current.exp_dt_user_id !== userId || current.exp_dt_deleted_at) {
      throw new NotFoundException(`Debt with ID ${id} not found`);
    }
    await this.dbObject.db
      .update(expDebts)
      .set({ exp_dt_deleted_at: sql`now()` })
      .where(eq(expDebts.exp_dt_id, id));
    return { message: 'Debt removed' };
  }

  async addRepayment(debtId: string, userId: string, dto: CreateRepaymentDto) {
    const current = await this.getOneRaw(debtId);
    if (!current || current.exp_dt_user_id !== userId || current.exp_dt_deleted_at) {
      throw new NotFoundException(`Debt with ID ${debtId} not found`);
    }
    const data: InsertExpensifyDebtRepayments = { ...dto, exp_dr_debt_id: debtId };
    const [repayment] = await this.dbObject.db.insert(expDebtRepayments).values(data).returning();
    return repayment;
  }

  async deleteRepayment(repaymentId: string, debtId: string, userId: string) {
    const current = await this.getOneRaw(debtId);
    if (!current || current.exp_dt_user_id !== userId || current.exp_dt_deleted_at) {
      throw new NotFoundException(`Debt with ID ${debtId} not found`);
    }
    await this.dbObject.db
      .delete(expDebtRepayments)
      .where(
        and(
          eq(expDebtRepayments.exp_dr_id, repaymentId),
          eq(expDebtRepayments.exp_dr_debt_id, debtId),
        ),
      );
    return { message: 'Repayment removed' };
  }
}
