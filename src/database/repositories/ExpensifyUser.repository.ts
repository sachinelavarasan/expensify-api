import { Inject } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { DB } from '../database.constants';
import { Database } from '../types/Database';

import { expensifyUsers, InsertExpensifyUser } from '../schemas/schema';

export class ExpensifyUserRepository {
  constructor(
    @Inject(DB)
    private readonly dbObject: Database,
  ) {}

  async getOne(args: { id?: string; phone?: string; user_id?: string; email?: string }) {
    return await this.dbObject.db.query.expensifyUsers.findFirst({
      where: (expensifyUsers, { eq }) => {
        const conditions: any = [];
        if (args && args.id) conditions.push(eq(expensifyUsers.exp_us_clerk_id, args.id));
        if (args && args.user_id) conditions.push(eq(expensifyUsers.exp_us_id, args.user_id));
        if (args && args.phone) conditions.push(eq(expensifyUsers.exp_us_phone_no, args.phone));
        if (args && args.email) conditions.push(eq(expensifyUsers.exp_us_email, args.email));
        return and(conditions);
      },
    });
  }

  async setOtp(userId: string, args: { hash: string; purpose: string; expiresAt: string }) {
    return this.updateUser(
      {
        exp_us_otp_code_hash: args.hash,
        exp_us_otp_purpose: args.purpose,
        exp_us_otp_expires_at: args.expiresAt,
        exp_us_otp_attempts: 0,
      },
      { exp_user_id: userId },
    );
  }

  async clearOtp(userId: string) {
    return this.updateUser(
      {
        exp_us_otp_code_hash: null,
        exp_us_otp_purpose: null,
        exp_us_otp_expires_at: null,
        exp_us_otp_attempts: 0,
      },
      { exp_user_id: userId },
    );
  }

  async incrementOtpAttempts(userId: string) {
    return await this.dbObject.db
      .update(expensifyUsers)
      .set({ exp_us_otp_attempts: sql`${expensifyUsers.exp_us_otp_attempts} + 1` })
      .where(eq(expensifyUsers.exp_us_id, userId))
      .returning();
  }

  async setPasswordHash(userId: string, hash: string) {
    return this.updateUser({ exp_us_password_hash: hash }, { exp_user_id: userId });
  }

  async markEmailVerified(userId: string) {
    return this.updateUser({ exp_us_email_verified: true }, { exp_user_id: userId });
  }
  async createUser(data: any) {
    return await this.dbObject.db.insert(expensifyUsers).values(data).returning();
  }
  async updateUser(
    data: Partial<InsertExpensifyUser>,
    args: { exp_us_phone_no?: string; exp_us_clerk_id?: string; exp_user_id?: string },
  ) {
    return await this.dbObject.db
      .update(expensifyUsers)
      .set(data)
      .where(
        and(
          args.exp_us_clerk_id
            ? eq(expensifyUsers.exp_us_clerk_id, args.exp_us_clerk_id)
            : undefined,
          args.exp_us_phone_no
            ? eq(expensifyUsers.exp_us_phone_no, args.exp_us_phone_no)
            : undefined,
          args.exp_user_id ? eq(expensifyUsers.exp_us_id, args.exp_user_id) : undefined,
        ),
      )
      .returning();
  }
}
