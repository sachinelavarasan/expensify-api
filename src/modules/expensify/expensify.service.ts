/* eslint-disable prettier/prettier */
import { Injectable, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import moment from 'moment';

import {
  CreateBankAccountDto,
  CreateBudgetDto,
  CreateDebtDto,
  CreateRecurringTransactionDto,
  CreateRepaymentDto,
  CreateStarredTransactionDto,
  CreateTransferDto,
  TransactionDto,
  UpdateBudgetDto,
  UpdateDebtDto,
  UpdateRecurringTransactionDto,
} from './dto/auth.dto';
import { ExpensifyUserRepository } from '../../database/repositories/ExpensifyUser.repository';
import { ExpensifyTransactionsRepository } from '../../database/repositories/ExpensifyTransactions.repository';
import { ExpensifyTransactionsCategoryRepository } from '../../database/repositories/ExpensifyTransactionsCategory.repository';
import {
  InsertExpensifyBankAccounts,
  InsertExpensifyTransactionCategories,
  InsertExpensifyTransactions,
  SelectExpensifyTransactionCategories,
  SelectExpensifyUser,
} from '../../database/schemas/schema';
import { ExpensifyBankAccountRepository } from '../../database/repositories/ExpensifyBankAccounts.repository';
import { ExpStarredTransactionsRepository } from '../../database/repositories/ExpStarredTransactions.repository';
import { ExpensifyNotificationTokenRepository } from '../../database/repositories/ExpensifyNotificationToken.repository';
import { ExpensifyBudgetRepository } from '../../database/repositories/ExpBudget.repository';
import { RecurringTransactionsRepository } from '../../database/repositories/RecurringTransactions.repository';
import { DebtsRepository } from '../../database/repositories/Debts.repository';
import { StorageService } from '../../storage/storage.service';
import { GeminiService } from '../../ai/gemini.service';

@Injectable()
export class ExpensifyService {
  constructor(
    private usersRepository: ExpensifyUserRepository,
    private expensifyTransactionsRepository: ExpensifyTransactionsRepository,
    private expensifyTransactionsCategoryRepository: ExpensifyTransactionsCategoryRepository,
    private expensifyBankAccountRepository: ExpensifyBankAccountRepository,
    private expStarredTransactionsRepository: ExpStarredTransactionsRepository,
    private expensifyNotificationTokenRepository: ExpensifyNotificationTokenRepository,
    private expensifyBudgetRepository: ExpensifyBudgetRepository,
    private recurringTransactionsRepository: RecurringTransactionsRepository,
    private debtsRepository: DebtsRepository,
    private storageService: StorageService,
    private geminiService: GeminiService,
  ) {}

  async getAllTransactions(
    id: string,
    args: {
      startDate?: string;
      endDate?: string;
      transaction_type?: number;
      transaction_label?: string;
      accountId?: string;
      minAmount?: string;
      maxAmount?: string;
      categoryIds?: string[];
      tags?: string[];
    },
  ) {
    return await this.expensifyTransactionsRepository.getAllTransactions(id, args);
  }
  async getMonthlyTrend(userId: string, months = 6) {
    const startDate = moment()
      .subtract(months - 1, 'months')
      .startOf('month')
      .format('YYYY-MM-DD');

    const rows = await this.expensifyTransactionsRepository.getMonthlyTrend(userId, startDate);
    const rowsByMonth = new Map(rows.map((row) => [row.month, row]));

    const trend = [];
    for (let i = months - 1; i >= 0; i--) {
      const date = moment().subtract(i, 'months');
      const month = date.format('YYYY-MM');
      const row = rowsByMonth.get(month);

      trend.push({
        month,
        label: date.format('MMM'),
        income: row ? parseFloat(row.income || '0') : 0,
        expense: row ? parseFloat(row.expense || '0') : 0,
      });
    }

    return trend;
  }
  async getCategoryTrend(userId: string, categoryId: string, months = 6) {
    const startDate = moment()
      .subtract(months - 1, 'months')
      .startOf('month')
      .format('YYYY-MM-DD');

    const rows = await this.expensifyTransactionsRepository.getCategoryTrend(
      userId,
      categoryId,
      startDate,
    );
    const rowsByMonth = new Map(rows.map((row) => [row.month, row]));

    const trend = [];
    for (let i = months - 1; i >= 0; i--) {
      const date = moment().subtract(i, 'months');
      const month = date.format('YYYY-MM');
      const row = rowsByMonth.get(month);

      trend.push({
        month,
        label: date.format('MMM'),
        expense: row ? parseFloat(row.expense || '0') : 0,
      });
    }

    return trend;
  }
  async getTransaction(id: string, userId: string) {
    return await this.expensifyTransactionsRepository.getOne(id, userId);
  }
  async deleteTransaction(id: string, userId: string) {
    return await this.expensifyTransactionsRepository.deleteTransaction(id, userId);
  }
  async bulkDeleteTransactions(ids: string[], userId: string) {
    return await this.expensifyTransactionsRepository.bulkDeleteTransactions(ids, userId);
  }
  async bulkUpdateTransactions(
    ids: string[],
    patch: { exp_tc_id?: string; exp_ts_tags?: string[] },
    userId: string,
  ) {
    return await this.expensifyTransactionsRepository.bulkUpdateTransactions(ids, patch, userId);
  }
  async restoreTransaction(id: string, userId: string) {
    return await this.expensifyTransactionsRepository.restoreTransaction(id, userId);
  }
  async purgeTransaction(id: string, userId: string) {
    const { attachmentUrls } = await this.expensifyTransactionsRepository.purgeTransaction(
      id,
      userId,
    );
    for (const attachmentUrl of attachmentUrls) {
      await this.storageService.deleteTransactionAttachment(attachmentUrl);
    }
    return true;
  }
  async createTransfer(dto: CreateTransferDto) {
    return await this.expensifyTransactionsRepository.createTransfer(dto);
  }
  async getTrashedTransactions(userId: string) {
    return await this.expensifyTransactionsRepository.getTrashedTransactions(userId);
  }
  async editTransaction(id: string, dto: TransactionDto, userId: string) {
    return await this.expensifyTransactionsRepository.updateTransaction(id, dto, userId);
  }
  async createTransaction(dto: TransactionDto) {
    const [account] = await this.expensifyBankAccountRepository.getAllBankAccount(
      dto.exp_ts_user_id,
    );
    if (account && !dto.exp_ts_bank_account_id) {
      dto.exp_ts_bank_account_id = account.exp_ba_id;
    }
    return await this.expensifyTransactionsRepository.createTransaction(dto);
  }
  async getAllCategories(id: string) {
    return await this.expensifyTransactionsCategoryRepository.getAllCategories(id);
  }

  // Returns a suggested category id, or null if Gemini is unavailable, errs,
  // or returns anything that isn't exactly one of the user's own category ids
  // (never trust free-form AI output as an id to act on).
  async suggestCategory(userId: string, title: string, transactionType: number) {
    const categories = await this.expensifyTransactionsCategoryRepository.getAllCategories(
      userId,
    );
    const candidates = categories.filter(
      (category) => category.exp_tc_transaction_type === transactionType,
    );
    if (candidates.length === 0) {
      return null;
    }

    const prompt = [
      'You categorize personal finance transactions.',
      `Description: "${title}"`,
      'Candidate categories (id: label):',
      ...candidates.map((category) => `${category.exp_tc_id}: ${category.exp_tc_label}`),
      'Reply with only the single best matching category id from the list above, and nothing else.',
      'If none of the candidates are a reasonable match, reply with exactly: none',
    ].join('\n');

    const reply = await this.geminiService.generateText(prompt);
    if (!reply) {
      return null;
    }

    const match = candidates.find((category) => category.exp_tc_id === reply.trim());
    return match ? match.exp_tc_id : null;
  }

  async createAccount(dto: CreateBankAccountDto) {
    return await this.expensifyBankAccountRepository.createBankAccount(dto);
  }
  async findAllAccount(userId: string) {
    return await this.expensifyBankAccountRepository.getAllBankAccount(userId);
  }
  async findAccount(accountId: string, userId: string, limit: number, offset: number) {
    return await this.expensifyBankAccountRepository.getAccountDetailsWithGroupedTransactionsById(
      accountId,
      userId,
      limit,
      offset,
    );
  }
  async updateAccount(id: string, dto: InsertExpensifyBankAccounts, userId: string) {
    return await this.expensifyBankAccountRepository.updateBankAccount(dto, id, userId);
  }
  async removeAccount(id: string, userId: string) {
    return await this.expensifyBankAccountRepository.deleteBankAccount(id, userId);
  }
  async setPrimaryAccount(id: string, userId: string) {
    return await this.expensifyBankAccountRepository.setPrimaryAccount(id, userId);
  }

  async starTransaction(dto: CreateStarredTransactionDto) {
    return await this.expStarredTransactionsRepository.starTransaction(dto);
  }
  async unstarTransaction(userId: string, transactionId: string) {
    return await this.expStarredTransactionsRepository.unstarTransaction(userId, transactionId);
  }
  async getUserStarredTransactions(userId: string) {
    return await this.expStarredTransactionsRepository.getUserStarredTransactions(userId);
  }
  async isTransactionStarred(userId: string, transactionId: string) {
    return await this.expStarredTransactionsRepository.isTransactionStarred(userId, transactionId);
  }
  async bulkStarTransactions(userId: string, transactionIds: string[]) {
    return await this.expStarredTransactionsRepository.bulkStarTransactions(userId, transactionIds);
  }
  async bulkUnstarTransactions(userId: string, transactionIds: string[]) {
    return await this.expStarredTransactionsRepository.bulkUnstarTransactions(
      userId,
      transactionIds,
    );
  }
  async reorderCategories(categories: Partial<SelectExpensifyTransactionCategories>[], userId: string) {
    return await this.expensifyTransactionsCategoryRepository.reorderCategories(categories, userId);
  }
  async createCategory(dto: InsertExpensifyTransactionCategories, userId: string) {
    return await this.expensifyTransactionsCategoryRepository.createCategory(dto, userId);
  }
  async updateCategory(dto: InsertExpensifyTransactionCategories, userId: string, id: string) {
    return await this.expensifyTransactionsCategoryRepository.updateCategory(dto, userId, {
      id: id,
    });
  }
  async deleteCategory(id: string, userId: string) {
    return await this.expensifyTransactionsCategoryRepository.deleteCategory(id, userId);
  }
  acceptPushNotification = async (us_id: string, data: { token: string }) => {
    try {
      // update existing device as inactive
      const notificationTokenEntry = await this.expensifyNotificationTokenRepository.getOne({
        exp_ntto_user_id: us_id,
        exp_ntto_token: data.token,
      });

      if (notificationTokenEntry) {
        await this.expensifyNotificationTokenRepository.update(
          { us_id, token: data.token },
          {
            exp_ntto_status: 1,
          },
        );
      } else {
        await this.expensifyNotificationTokenRepository.add({
          exp_ntto_user_id: us_id,
          exp_ntto_status: 1,
          exp_ntto_token: data.token,
        });
      }
    } catch (error) {
      console.log(error);
      throw new HttpException(error.message || 'Something went wrong', HttpStatus.BAD_REQUEST);
    }
  };
  disablePushNotification = async (us_id: string, token: string): Promise<void> => {
    try {
      await this.expensifyNotificationTokenRepository.update(
        { us_id, token },
        {
          exp_ntto_status: 0,
        },
      );
    } catch (error) {
      throw new HttpException(error.message || 'Something went wrong', HttpStatus.BAD_REQUEST);
    }
  };
  async updatePreference(user_id: string, dto: Partial<SelectExpensifyUser>) {
    try {
      const existUser = await this.usersRepository.getOne({ user_id: user_id });
      if (!existUser) {
        throw new HttpException("Oops!, We can't find you in our database", HttpStatus.BAD_REQUEST);
      }
      await this.usersRepository.updateUser(dto, { exp_user_id: user_id });
    } catch (e) {
      console.log(e);
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }
  async changeSettings(exp_us_id: string, dto: SelectExpensifyUser) {
    await this.updatePreference(exp_us_id, dto);
  }
  async fetchProfile(id: string) {
    try {
      const user = (await this.usersRepository.getOne({
        user_id: id,
      })) as unknown as SelectExpensifyUser & { reminder_status: number; reminder_time: string };
      const notificationTokenEntry = await this.expensifyNotificationTokenRepository.getOne({
        exp_ntto_user_id: id,
      });

      if (!user) {
        return null;
      }
      user.reminder_status = notificationTokenEntry?.exp_ntto_status;
      user.reminder_time = notificationTokenEntry?.exp_ntto_time;

      delete (user as any).exp_us_password_hash;
      delete (user as any).exp_us_otp_code_hash;
      delete (user as any).exp_us_otp_purpose;
      delete (user as any).exp_us_otp_expires_at;
      delete (user as any).exp_us_otp_attempts;

      return user;
    } catch (e) {
      throw new BadRequestException(e);
    }
  }

  async updateName(id: string, name: string, phone?: string) {
    await this.usersRepository.updateUser(
      { exp_us_name: name, ...(phone !== undefined ? { exp_us_phone_no: phone } : {}) },
      { exp_user_id: id },
    );
    return this.fetchProfile(id);
  }

  async uploadProfileImage(id: string, imageBase64: string) {
    const existingUser = await this.usersRepository.getOne({ user_id: id });
    const previousProfileUrl = existingUser?.exp_us_profile_url;

    const profileUrl = await this.storageService.uploadProfileImage(id, imageBase64);
    await this.usersRepository.updateUser({ exp_us_profile_url: profileUrl }, { exp_user_id: id });

    // Only delete the old image after the new one is uploaded and saved, so a failed
    // upload never leaves the user without any photo on record.
    if (previousProfileUrl) {
      await this.storageService.deleteProfileImage(previousProfileUrl).catch(() => {});
    }

    return this.fetchProfile(id);
  }

  async removeProfileImage(id: string) {
    const user = await this.usersRepository.getOne({ user_id: id });
    if (user?.exp_us_profile_url) {
      await this.storageService.deleteProfileImage(user.exp_us_profile_url);
    }
    await this.usersRepository.updateUser({ exp_us_profile_url: null }, { exp_user_id: id });
    return this.fetchProfile(id);
  }

  async uploadTransactionAttachment(userId: string, fileBase64: string) {
    return await this.storageService.uploadTransactionAttachment(userId, fileBase64);
  }

  async removeTransactionAttachment(url: string) {
    return await this.storageService.deleteTransactionAttachment(url);
  }
  async bulkTransactions(transactions: InsertExpensifyTransactions[]) {
    try {
      await this.expensifyTransactionsRepository.save(transactions);
      return true;
    } catch (e) {
      console.log(e);
      throw new BadRequestException(e);
    }
  }
  async findPotentialDuplicates(userId: string, dates: string[]) {
    return await this.expensifyTransactionsRepository.findByUserAndDates(userId, dates);
  }
  async getDefaultCategory(transactionType: number) {
    return await this.expensifyTransactionsCategoryRepository.getDefaultCategory(transactionType);
  }
    async getAllTransactionsByCategory(
    id: string,
    args: {
      startDate?: string;
      endDate?: string;
      transaction_type?: number;
    },
  ) {
    return await this.expensifyTransactionsRepository.getAllTransactionsByCategory(id, args);
  }
  async createBudget(dto: CreateBudgetDto) {
    return await this.expensifyBudgetRepository.addBudget(dto);
  }
   async updateBudget(dto: UpdateBudgetDto, id: string, userId: string) {
    return await this.expensifyBudgetRepository.updateBudget(dto,
      id, userId);
  }
  async deleteBudget(id: string, userId: string) {
    return await this.expensifyBudgetRepository.removeBudget(id, userId);
  }

  async getRecurringTransactions(userId: string) {
    return await this.recurringTransactionsRepository.getAllForUser(userId);
  }
  async createRecurringTransaction(dto: CreateRecurringTransactionDto) {
    dto.exp_rt_next_due_date = dto.exp_rt_start_date;
    return await this.recurringTransactionsRepository.create(dto);
  }
  async updateRecurringTransaction(id: string, dto: UpdateRecurringTransactionDto, userId: string) {
    return await this.recurringTransactionsRepository.update(id, dto, userId);
  }
  async deleteRecurringTransaction(id: string, userId: string) {
    return await this.recurringTransactionsRepository.delete(id, userId);
  }

  async importRecurringTransactions(userId: string, recurringIds: string[]) {
    const date = moment().format('YYYY-MM-DD');
    const time = moment().format('HH:mm');

    let imported = 0;
    for (const recurringId of recurringIds) {
      const rule = await this.recurringTransactionsRepository.getOne(recurringId);
      if (!rule || rule.exp_rt_user_id !== userId) {
        continue;
      }
      console.log(rule);

      await this.createTransaction({
        exp_ts_title: rule.exp_rt_title,
        exp_ts_amount: rule.exp_rt_amount,
        exp_ts_note: rule.exp_rt_note,
        exp_ts_date: date,
        exp_ts_time: time,
        exp_tc_id: rule.exp_rt_category_id,
        exp_tt_id: rule.exp_rt_transaction_type_id,
        exp_ts_category: rule.exp_rt_category_id,
        exp_ts_transaction_type: rule.exp_rt_transaction_type_id,
        exp_ts_user_id: userId,
        exp_ts_bank_account_id: rule.exp_rt_bank_account_id,
      } as unknown as TransactionDto);
      imported += 1;
    }

    return { imported };
  }

  async getAllDebts(userId: string) {
    return await this.debtsRepository.getAllForUser(userId);
  }

  async getDebt(id: string, userId: string) {
    return await this.debtsRepository.getOne(id, userId);
  }

  async createDebt(dto: CreateDebtDto) {
    return await this.debtsRepository.create(dto);
  }

  async updateDebt(dto: UpdateDebtDto, id: string, userId: string) {
    return await this.debtsRepository.update(dto, id, userId);
  }

  async deleteDebt(id: string, userId: string) {
    return await this.debtsRepository.softDelete(id, userId);
  }

  async addDebtRepayment(debtId: string, userId: string, dto: CreateRepaymentDto) {
    return await this.debtsRepository.addRepayment(debtId, userId, dto);
  }

  async deleteDebtRepayment(repaymentId: string, debtId: string, userId: string) {
    return await this.debtsRepository.deleteRepayment(repaymentId, debtId, userId);
  }
}
