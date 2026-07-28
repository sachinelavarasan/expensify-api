import { and, eq, inArray, sql } from 'drizzle-orm';
import { Inject } from '@nestjs/common';

import { DB } from '../database.constants';
import { Database } from '../types/Database';

import {
  InsertExpensifyNotificationLog,
  expNotificationLog,
  expNotificationToken,
} from '../schemas/schema';

export class ExpensifyNotificationLogRepository {
  constructor(
    @Inject(DB)
    private readonly dbObject: Database,
  ) {}

  async add(data: InsertExpensifyNotificationLog) {
    return await this.dbObject.db.insert(expNotificationLog).values(data).returning();
  }
  async getAll(args: { user_id: string }, type: string) {
    return this.dbObject.db.query.expNotificationLog.findMany({
      where: and(
        eq(expNotificationLog.exp_nl_user_id, args.user_id),
        type == 'today'
          ? sql`DATE(nt_created_at) = CURRENT_DATE`
          : sql`DATE(nt_created_at) != CURRENT_DATE`,
      ),
      limit: type !== 'today' ? 10 : 0,
      extras: {
        nt_created_at: sql`TO_CHAR(${expNotificationLog.exp_nl_created_at},'dd-mm-yyyy')`.as(
          'exp_nl_created_at',
        ),
      },
    });
  }

  async getTodayNotificationsLog() {
    return this.dbObject.db.query.expNotificationLog.findMany({
      where: and(eq(expNotificationLog.exp_nl_status, 1), sql`DATE(nt_created_at) = CURRENT_DATE`),
      with: {
        notificationToken: { where: eq(expNotificationToken.exp_ntto_status, 1) },
      },
    });
  }

  async update(data: any, ids: Array<string>) {
    return await this.dbObject.db
      .update(expNotificationLog)
      .set(data)
      .where(inArray(expNotificationLog.exp_nl_id, ids))
      .returning();
  }
}
