import { and, eq, sql } from 'drizzle-orm';
import { Inject } from '@nestjs/common';

import { DB } from '../database.constants';
import { Database } from '../types/Database';

import {
  InsertExpensifyNotificationToken,
  SelectExpensifyNotificationToken,
  expNotificationToken,
} from '../schemas/schema';

export class ExpensifyNotificationTokenRepository {
  constructor(
    @Inject(DB)
    private readonly dbObject: Database,
  ) {}

  async add(data: InsertExpensifyNotificationToken) {
    return await this.dbObject.db.insert(expNotificationToken).values(data).returning();
  }
  async getAll(limit: number, offset: number) {
    const results = await this.dbObject.db.execute(sql`
  SELECT
    exp_ntto_token,
    exp_ntto_user_id
  FROM
    exp_notification_token
  WHERE
    exp_ntto_status = 1
  LIMIT ${limit}
  OFFSET ${offset}
`);

    return results.rows;
  }
  async update(args: { us_id: string; token: string }, data: any) {
    return await this.dbObject.db
      .update(expNotificationToken)
      .set(data)
      .where(
        and(
          eq(expNotificationToken.exp_ntto_user_id, args.us_id),
          eq(expNotificationToken.exp_ntto_token, args.token),
        ),
      )
      .returning();
  }

  async disableByToken(token: string) {
    return await this.dbObject.db
      .update(expNotificationToken)
      .set({ exp_ntto_status: 0 })
      .where(eq(expNotificationToken.exp_ntto_token, token))
      .returning();
  }

  async deleteStale() {
    return await this.dbObject.db
      .delete(expNotificationToken)
      .where(eq(expNotificationToken.exp_ntto_status, 0))
      .returning();
  }

  async getOne(args: Partial<SelectExpensifyNotificationToken>) {
    const conditions = [];
    Object.keys(args).map((item: keyof InsertExpensifyNotificationToken) => {
      conditions.push(eq(expNotificationToken[item], args[item]));
    });
    return await this.dbObject.db.query.expNotificationToken.findFirst({
      where: and(...conditions),
    });
  }

  async getMany(args: Partial<SelectExpensifyNotificationToken>) {
    const conditions = [];
    Object.keys(args).map((item: keyof InsertExpensifyNotificationToken) => {
      conditions.push(eq(expNotificationToken[item], args[item]));
    });
    return await this.dbObject.db.query.expNotificationToken.findMany({
      where: and(...conditions),
    });
  }
}
