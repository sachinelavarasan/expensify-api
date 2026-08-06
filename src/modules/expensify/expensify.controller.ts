import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';

import { ExpensifyService } from './expensify.service';

import * as Express from 'express';
import { ExpressWithUser } from './type';
import {
  InsertExpensifyBankAccounts,
  InsertExpensifyTransactionCategories,
  InsertExpensifyTransactions,
  SelectExpensifyTransactionCategories,
} from '../../database/schemas/schema';
import {
  CreateBankAccountDto,
  CreateBudgetDto,
  CopyPreviousMonthBudgetsDto,
  CreateDebtDto,
  CreateRecurringTransactionDto,
  CreateRepaymentDto,
  CreateStarredTransactionDto,
  CreateTransferDto,
  ImportRecurringTransactionsDto,
  TransactionDto,
  UpdateBankAccountDto,
  UpdateBudgetDto,
  UpdateDebtDto,
  UpdateRecurringTransactionDto,
} from './dto/auth.dto';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import moment from 'moment';
import { Throttle } from '@nestjs/throttler';
import { normalizeTransactionTitle } from '../../common/utils/normalize-title.util';

@Controller('expensify')
export class ExpensifyController {
  constructor(private expensifyService: ExpensifyService) {}

  private errorStatus(error: unknown): number {
    return error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  @Get('transactions')
  async getTransactions(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const {
        user: { exp_us_id },
        query,
      } = req;
      const {
        startDate,
        endDate,
        transaction_type,
        search,
        account,
        minAmount,
        maxAmount,
        categories,
        tags,
      } = query as {
        startDate: string;
        endDate: string;
        transaction_type?: 'all' | 'income' | 'expense' | 'transfer';
        search?: string;
        account: string;
        minAmount?: string;
        maxAmount?: string;
        categories?: string;
        tags?: string;
      };
      const isValidAmount = (value?: string) => !value || /^\d+(\.\d+)?$/.test(value);
      if (!isValidAmount(minAmount) || !isValidAmount(maxAmount)) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'minAmount/maxAmount must be valid positive numbers' });
      }
      const data = await this.expensifyService.getAllTransactions(exp_us_id, {
        startDate,
        endDate,
        transaction_type:
          transaction_type === 'income'
            ? 2
            : transaction_type === 'expense'
              ? 1
              : transaction_type === 'transfer'
                ? 3
                : undefined,
        transaction_label: search ? search : undefined,
        accountId: account ? account : undefined,
        minAmount: minAmount ? minAmount : undefined,
        maxAmount: maxAmount ? maxAmount : undefined,
        categoryIds: categories ? categories.split(',') : undefined,
        tags: tags ? tags.split(',') : undefined,
      });
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }
  @Get('transactions/trend')
  async getMonthlyTrend(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const {
        user: { exp_us_id },
        query,
      } = req;
      const { months } = query as { months?: string };
      const data = await this.expensifyService.getMonthlyTrend(
        exp_us_id,
        months ? Number(months) : undefined,
      );
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }
  @Get('transactions/category-trend')
  async getCategoryTrend(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const {
        user: { exp_us_id },
        query,
      } = req;
      const { categoryId, months } = query as { categoryId?: string; months?: string };
      if (!categoryId) {
        return res.status(400).json({ error: 'categoryId is required' });
      }
      const data = await this.expensifyService.getCategoryTrend(
        exp_us_id,
        categoryId,
        months ? Number(months) : undefined,
      );
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }
  @Post('transactions')
  async createTransaction(
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
    @Body() body: TransactionDto,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      body.exp_ts_user_id = exp_us_id;

      if (body.exp_tc_id === undefined || body.exp_tt_id === undefined) {
        return res.status(400).json({ error: 'Missing required fields: exp_tc_id or exp_tt_id' });
      }

      const insertBody = body;
      await this.expensifyService.createTransaction(insertBody);
      return res.status(200).json({ message: 'Successfully added' });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }
  @Post('transactions/transfer')
  async createTransfer(
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
    @Body() body: CreateTransferDto,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      body.exp_ts_user_id = exp_us_id;

      if (!body.exp_ts_from_bank_account_id || !body.exp_ts_to_bank_account_id) {
        return res.status(400).json({
          error:
            'Missing required fields: exp_ts_from_bank_account_id or exp_ts_to_bank_account_id',
        });
      }

      await this.expensifyService.createTransfer(body);
      return res.status(200).json({ message: 'Successfully added' });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }
  @Post('transaction/attachment')
  async uploadTransactionAttachment(
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
    @Body() body: { fileBase64: string },
  ) {
    try {
      if (!body.fileBase64) {
        return res.status(400).json({ error: 'fileBase64 is required' });
      }
      const url = await this.expensifyService.uploadTransactionAttachment(
        req.user.exp_us_id,
        body.fileBase64,
      );
      return res.status(200).json({ url });
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: error.message });
    }
  }
  @Delete('transaction/attachment')
  async removeTransactionAttachment(
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
    @Body() body: { url: string },
  ) {
    try {
      if (!body.url) {
        return res.status(400).json({ error: 'url is required' });
      }
      await this.expensifyService.removeTransactionAttachment(body.url);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: error.message });
    }
  }
  @Get('transaction/:id')
  async getTransaction(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const {
        params,
        user: { exp_us_id },
      } = req;
      const { id } = params as unknown as { id: string };
      const [data] = await this.expensifyService.getTransaction(id, exp_us_id);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }
  @Put('transaction/:id')
  async editTransaction(
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
    @Body() body: TransactionDto,
  ) {
    try {
      const {
        params,
        user: { exp_us_id },
      } = req;
      const { id } = params as unknown as { id: string };

      if (body.exp_tc_id === undefined || body.exp_tt_id === undefined) {
        return res.status(400).json({ error: 'Missing required fields: exp_tc_id or exp_tt_id' });
      }

      body.exp_ts_user_id = exp_us_id;

      const insertBody = body;
      await this.expensifyService.editTransaction(id, insertBody, exp_us_id);
      return res.status(200).json({ message: 'Updated successfully' });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }
  @Delete('transaction/:id')
  deleteTransaction(@Param('id') id: string, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.deleteTransaction(id, exp_us_id);
  }

  @Get('transactions/trash')
  getTrashedTransactions(@Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.getTrashedTransactions(exp_us_id);
  }

  @Patch('transaction/:id/restore')
  restoreTransaction(@Param('id') id: string, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.restoreTransaction(id, exp_us_id);
  }

  @Delete('transaction/:id/purge')
  purgeTransaction(@Param('id') id: string, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.purgeTransaction(id, exp_us_id);
  }

  @Delete('transactions/bulk')
  bulkDeleteTransactions(@Body() body: { ids: string[] }, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.bulkDeleteTransactions(body.ids, exp_us_id);
  }

  @Patch('transactions/bulk')
  bulkUpdateTransactions(
    @Body() body: { ids: string[]; patch: { exp_tc_id?: string; exp_ts_tags?: string[] } },
    @Req() req: ExpressWithUser,
  ) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.bulkUpdateTransactions(body.ids, body.patch, exp_us_id);
  }

  @Get('categories')
  async getCategories(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      const data = await this.expensifyService.getAllCategories(exp_us_id);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }

  @Post('categories')
  async createCategory(
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
    @Body() dto: InsertExpensifyTransactionCategories,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      await this.expensifyService.createCategory(dto, exp_us_id);
      return res.status(200).json({ message: 'Category created successfully' });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }

  @Put('categories/:id')
  async updateCategory(
    @Req() req: ExpressWithUser,
    @Param('id') id: string,
    @Body() dto: InsertExpensifyTransactionCategories,
  ) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.updateCategory(dto, exp_us_id, id);
  }

  @Patch('categories/reorder')
  async reorderCategories(
    @Body() dto: Partial<SelectExpensifyTransactionCategories>[],
    @Req() req: ExpressWithUser,
  ) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.reorderCategories(dto, exp_us_id);
  }
  @Delete('categories/:id')
  async delete(
    @Req() req: ExpressWithUser,
    @Param('id') id: string,
    @Body() body: { targetCategoryId?: string },
  ) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.deleteCategory(id, exp_us_id, body?.targetCategoryId);
  }

  @Post('ai/suggest-category')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async suggestCategory(
    @Body() body: { title: string; exp_tt_id: number },
    @Req() req: ExpressWithUser,
  ) {
    const {
      user: { exp_us_id },
    } = req;
    const categoryId = await this.expensifyService.suggestCategory(
      exp_us_id,
      body.title,
      body.exp_tt_id,
    );
    return { exp_tc_id: categoryId };
  }

  @Post('accounts')
  create(@Body() dto: CreateBankAccountDto, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    dto.exp_ba_user_id = exp_us_id;
    return this.expensifyService.createAccount(dto);
  }

  @Get('accounts')
  findAll(@Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.findAllAccount(exp_us_id);
  }

  @Get('accounts/:id')
  findOne(
    @Req() req: ExpressWithUser,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const {
      user: { exp_us_id },
    } = req;
    const limitNum = Math.max(Number(limit) || 30, 1);
    const pageNum = Math.max(Number(page) || 1, 1);
    const offset = (pageNum - 1) * limitNum;
    return this.expensifyService.findAccount(id, exp_us_id, limitNum, offset);
  }

  @Put('accounts/:id')
  update(@Param('id') id: string, @Body() dto: UpdateBankAccountDto, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    const insertDto = dto as unknown as InsertExpensifyBankAccounts;
    return this.expensifyService.updateAccount(id, insertDto, exp_us_id);
  }

  @Patch('accounts/:id/primary')
  setPrimary(@Param('id') id: string, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.setPrimaryAccount(id, exp_us_id);
  }

  @Delete('accounts/:id')
  async remove(@Param('id') id: string, @Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      await this.expensifyService.removeAccount(id, exp_us_id);
      return res.status(200).json({ message: 'Account deleted successfully' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  @Post('starred')
  async starTransaction(@Body() dto: CreateStarredTransactionDto, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.starTransaction({ ...dto, exp_st_user_id: exp_us_id });
  }

  @Post('starred/bulk')
  async bulkStarTransactions(@Body() body: { ids: string[] }, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.bulkStarTransactions(exp_us_id, body.ids);
  }

  @Delete('starred/bulk')
  async bulkUnstarTransactions(@Body() body: { ids: string[] }, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.bulkUnstarTransactions(exp_us_id, body.ids);
  }

  @Delete('starred/:transactionId')
  async unstarTransaction(
    @Param('transactionId') transactionId: string,
    @Req() req: ExpressWithUser,
  ) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.unstarTransaction(exp_us_id, transactionId);
  }

  @Get('starred')
  async getAllStarred(@Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.getUserStarredTransactions(exp_us_id);
  }

  @Get('starred/:transactionId')
  async isTransactionStarred(
    @Param('transactionId') transactionId: string,
    @Req() req: ExpressWithUser,
  ) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.isTransactionStarred(exp_us_id, transactionId);
  }
  @Get('export-excel')
  async exportTransactions(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    const {
      user: { exp_us_id },
      query,
    } = req;
    const {
      startDate,
      endDate,
      format = 'xlsx',
      transaction_type = 'all',
      accountIds,
    } = query as {
      startDate: string;
      endDate: string;
      format?: 'xlsx' | 'csv';
      transaction_type?: 'all' | 'income' | 'expense' | 'transfer';
      accountIds?: string;
    };

    const transactions = await this.expensifyService.getAllTransactions(exp_us_id, {
      startDate,
      // exp_ts_date filtering is exclusive on the upper bound, so shift by a day
      // to include transactions dated on endDate itself (e.g. "today").
      endDate: moment(endDate).add(1, 'day').format('YYYY-MM-DD'),
      transaction_type:
        transaction_type === 'income'
          ? 2
          : transaction_type === 'expense'
            ? 1
            : transaction_type === 'transfer'
              ? 3
              : undefined,
      accountIds: accountIds ? accountIds.split(',') : undefined,
    });

    if (!transactions || transactions.length === 0) {
      return res
        .status(204)
        .json({ message: 'No transactions found for the selected date range.' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(
      `Transactions Report (${moment(startDate).format('DD-MM-YYYY')} - ${moment(endDate).format('DD-MM-YYYY')})`,
    );

    worksheet.columns = [
      { header: 'No', key: 'id', width: 5 },
      { header: 'Account Name', key: 'account_name', width: 15 },
      { header: 'Title', key: 'title', width: 20 },
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Transactions Type', key: 'transactions_type', width: 10 },
      { header: 'Amount', key: 'amount', width: 15 },
    ];

    transactions.forEach((t, index) => {
      worksheet.addRow({
        id: index + 1,
        title: t.exp_ts_title,
        amount: t.exp_ts_amount,
        category: t.exp_ts_category || '',
        transactions_type: t.exp_ts_transaction_type || '',
        date: t.exp_ts_date
          ? `${moment(`${t.exp_ts_date} ${t.exp_ts_time}`, 'YYYY-MM-DD HH:mm').format(
              'DD/MM/YYYY HH:mm',
            )}`
          : '',
        account_name: t.exp_ba_name,
      });
    });

    worksheet.getRow(1).font = { bold: true };

    const fileName = `transactions-${moment().format('DD-MM-YYYY_HH-mm-ss')}.${format === 'csv' ? 'csv' : 'xlsx'}`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      const buffer = await workbook.csv.writeBuffer();
      res.end(buffer);
    } else {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const buffer = await workbook.xlsx.writeBuffer();
      res.end(buffer);
    }
  }

  @Get('export-pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename=transactions.pdf')
  async exportTransactionsAsPDF(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    const {
      user: { exp_us_id },
      query,
    } = req;
    const {
      startDate,
      endDate,
      transaction_type = 'all',
      accountIds,
    } = query as {
      startDate: string;
      endDate: string;
      format?: 'xlsx' | 'csv';
      transaction_type?: 'all' | 'income' | 'expense' | 'transfer';
      accountIds?: string;
    };

    const transactions = await this.expensifyService.getAllTransactions(exp_us_id, {
      startDate,
      // exp_ts_date filtering is exclusive on the upper bound, so shift by a day
      // to include transactions dated on endDate itself (e.g. "today").
      endDate: moment(endDate).add(1, 'day').format('YYYY-MM-DD'),
      transaction_type:
        transaction_type === 'income'
          ? 2
          : transaction_type === 'expense'
            ? 1
            : transaction_type === 'transfer'
              ? 3
              : undefined,
      accountIds: accountIds ? accountIds.split(',') : undefined,
    });

    if (!transactions || transactions.length === 0) {
      return res
        .status(204)
        .json({ message: 'No transactions found for the selected date range.' });
    }

    const doc = new PDFDocument({
      bufferPages: true,
      size: 'A3',
      margin: 35,
    });

    doc.pipe(res);

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('black')
      .text(
        `Transactions Report (${moment(startDate).format('DD/MM/YYYY')} - ${moment(endDate).format('DD/MM/YYYY')})`,
        { align: 'center' },
      );
    doc.moveDown();

    doc
      .font('Helvetica')
      .fontSize(12)
      .table({
        columnStyles: ['40', '*', '*', '*', '*', '*', '*'],
        rowStyles: (row) =>
          row === 0
            ? {
                backgroundColor: '#ccc',
                border: 1,
              }
            : {},
        data: [
          [
            {
              text: 'No',
              font: { family: 'Helvetica-Bold' },
            },
            {
              text: 'Account Name',
              font: { family: 'Helvetica-Bold' },
            },
            {
              text: 'Title',
              font: { family: 'Helvetica-Bold' },
            },
            {
              text: 'Date',
              font: { family: 'Helvetica-Bold' },
            },
            {
              text: 'Category',
              font: { family: 'Helvetica-Bold' },
            },
            {
              text: 'Transaction Type',
              font: { family: 'Helvetica-Bold' },
            },
            {
              text: 'Amount',
              font: { family: 'Helvetica-Bold' },
            },
          ],
          ...transactions.map((t, index) => [
            String(index + 1),
            t.exp_ba_name,
            t.exp_ts_title,
            moment(t.exp_ts_date + ' ' + t.exp_ts_time, 'YYYY-MM-DD HH:mm').format(
              'DD/MM/YYYY HH:mm',
            ) || '',
            t.exp_ts_category || '',
            t.exp_ts_transaction_type || '',
            t.exp_ts_amount,
          ]),
        ],
      });

    doc.end();
  }
  @Post('enable-notification')
  async enablePush(
    @Body() body: { token: string },
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      await this.expensifyService.acceptPushNotification(exp_us_id, body);
      return res.status(200).json({ message: 'Enabled successfully' });
    } catch (error) {
      console.error(error);
      return res.status(this.errorStatus(error)).json({ error: error.message });
    }
  }

  @Put('disable-notification')
  async disablePush(
    @Body() body: { token: string },
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      await this.expensifyService.disablePushNotification(exp_us_id, body.token);
      return res.status(200).json({ message: 'Enabled successfully' });
    } catch (error) {
      console.error(error);
      return res.status(this.errorStatus(error)).json({ error: error.message });
    }
  }
  @Post('setting-changes')
  async setCurrency(@Body() dto, @Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      await this.expensifyService.changeSettings(exp_us_id, dto);
      return res.status(200).json({ message: 'Enabled successfully' });
    } catch (error) {
      console.error(error);
      return res.status(this.errorStatus(error)).json({ error: error.message });
    }
  }
  @Get('getme')
  async getProfile(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const user = await this.expensifyService.fetchProfile(req.user.exp_us_id);
      res.status(200).json({ ...user });
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: error.message });
    }
  }
  @Put('profile')
  async updateProfile(
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
    @Body() body: { name: string; phone?: string },
  ) {
    try {
      const user = await this.expensifyService.updateName(
        req.user.exp_us_id,
        body.name,
        body.phone,
      );
      return res.status(200).json({ ...user });
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: error.message });
    }
  }
  @Post('profile/image')
  async uploadProfileImage(
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
    @Body() body: { imageBase64: string },
  ) {
    try {
      if (!body.imageBase64) {
        return res.status(400).json({ error: 'imageBase64 is required' });
      }
      const user = await this.expensifyService.uploadProfileImage(
        req.user.exp_us_id,
        body.imageBase64,
      );
      return res.status(200).json({ ...user });
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: error.message });
    }
  }
  @Delete('profile/image')
  async removeProfileImage(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const user = await this.expensifyService.removeProfileImage(req.user.exp_us_id);
      return res.status(200).json({ ...user });
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: error.message });
    }
  }
  @Post('import-data')
  async importExcel(
    @Req() req: ExpressWithUser,
    @Body() body: { headers: string[]; data: any },
    @Res() res: Express.Response,
  ) {
    const { headers, data } = body;

    if (!headers || !data || !Array.isArray(data))
      return res.status(400).json({ error: 'Body parameters missing' });

    const isValid = ['title', 'amount', 'date', 'transaction_type'].every((item: any) =>
      Boolean(headers[item]),
    );

    if (!isValid) return res.status(400).json({ error: 'Required parameters missing' });

    const [expenseCategory, incomeCategory] = await Promise.all([
      this.expensifyService.getDefaultCategory(1),
      this.expensifyService.getDefaultCategory(2),
    ]);

    const processed = data.map((row, idx) => {
      const errors: string[] = [];

      if (!row[headers['title']] || typeof row[headers['title']] !== 'string') {
        errors.push('Missing or invalid title');
      }

      const amount = Number(row[headers['amount']]);
      if (isNaN(amount)) {
        errors.push('Invalid amount');
      }

      const rawDate = row[headers['date']];
      let date: string | null = null;

      if (rawDate) {
        const parsed = moment(
          rawDate,
          ['D/M/YYYY HH:mm:ss', 'DD/MM/YYYY HH:mm:ss', 'D/MM/YYYY HH:mm:ss', 'DD/M/YYYY HH:mm:ss'],
          false,
        );
        if (parsed.isValid()) {
          date = parsed.format('DD/MM/YYYY HH:mm');
        } else {
          errors.push(`Invalid date format: ${rawDate}`);
        }
      } else {
        errors.push('Missing date');
      }
      let category_id = null;
      let transaction_id = null;
      const validTypes = ['income', 'expense'];
      if (
        !row[headers['transaction_type']] ||
        typeof row[headers['transaction_type']] !== 'string' ||
        !validTypes.includes(row[headers['transaction_type']]?.toLowerCase())
      ) {
        errors.push('Invalid or missing transaction type');
      }
      if (
        errors.length === 0 &&
        validTypes.includes(row[headers['transaction_type']]?.toLowerCase())
      ) {
        const isIncome = row[headers['transaction_type']]?.toLowerCase() === 'income';
        const defaultCategory = isIncome ? incomeCategory : expenseCategory;
        if (!defaultCategory) {
          errors.push('No default category configured for this transaction type');
        }
        category_id = defaultCategory?.exp_tc_id ?? null;
        transaction_id = isIncome ? 2 : 1;
      }

      const note = row['note'] || '';

      return {
        row: idx + 1,
        title: row[headers['title']] || '',
        amount: isNaN(amount) ? null : amount,
        date,
        transaction_type: row[headers['transaction_type']] || '',
        transaction_id,
        category_id,
        note,
        status: errors.length === 0 ? 'valid' : 'invalid',
        errors,
      };
    });

    const invalidRows = processed
      .filter((r) => r.status === 'invalid')
      .map((r) => ({ ...r, errors: r.errors.join(', ') }));
    // console.log(invalidRows);

    const validRows = processed
      .filter((r) => r.status === 'valid')
      .map((r) => ({ ...r, errors: '' }));
    // console.log(validRows);

    const dupCandidates = validRows.map((r) => ({
      dupDate: moment(r.date, 'DD/MM/YYYY HH:mm').format('YYYY-MM-DD'),
      dupTitle: normalizeTransactionTitle(r.title),
    }));

    const existingTransactions = await this.expensifyService.findPotentialDuplicates(
      req.user.exp_us_id,
      dupCandidates.map((c) => c.dupDate),
    );

    type DuplicateRow = (typeof validRows)[number] & {
      possibleDuplicate: true;
      matchedTransaction: {
        exp_ts_id: string;
        exp_ts_title: string;
        exp_ts_amount: string;
        exp_ts_date: string;
      } | null;
      matchedStagedRow: { row: number } | null;
    };

    const possibleDuplicates: DuplicateRow[] = [];
    // Rows with no match against existing DB transactions yet - still need to be
    // checked against each other in case the file itself contains repeated rows.
    const remainingRows: { row: (typeof validRows)[number]; dupDate: string; dupTitle: string }[] =
      [];

    validRows.forEach((row, idx) => {
      const { dupDate, dupTitle } = dupCandidates[idx];
      const match = existingTransactions.find(
        (tx) =>
          tx.exp_ts_date === dupDate &&
          Number(tx.exp_ts_amount) === Number(row.amount) &&
          normalizeTransactionTitle(tx.exp_ts_title) === dupTitle,
      );

      if (match) {
        possibleDuplicates.push({
          ...row,
          possibleDuplicate: true,
          matchedTransaction: {
            exp_ts_id: match.exp_ts_id,
            exp_ts_title: match.exp_ts_title,
            exp_ts_amount: match.exp_ts_amount,
            exp_ts_date: match.exp_ts_date,
          },
          matchedStagedRow: null,
        });
      } else {
        remainingRows.push({ row, dupDate, dupTitle });
      }
    });

    // Intra-file check: rows that share the same date + amount + normalized title as
    // an earlier row in this same import are flagged too, keeping only the first
    // occurrence clean.
    const cleanValidRows: typeof validRows = [];
    const seenKeys = new Map<string, number>();

    remainingRows.forEach(({ row, dupDate, dupTitle }) => {
      const key = `${dupDate}|${dupTitle}|${Number(row.amount)}`;
      const firstOccurrenceRow = seenKeys.get(key);

      if (firstOccurrenceRow === undefined) {
        seenKeys.set(key, row.row);
        cleanValidRows.push(row);
      } else {
        possibleDuplicates.push({
          ...row,
          possibleDuplicate: true,
          matchedTransaction: null,
          matchedStagedRow: { row: firstOccurrenceRow },
        });
      }
    });

    res.status(200).json({
      message: 'Excel processed successfully',
      headers,
      totalRows: data.length,
      validRows: cleanValidRows,
      invalidRows,
      possibleDuplicates,
    });
  }
  @Post('bulk-transactions')
  async bulkTransactions(
    @Req() req: ExpressWithUser,
    @Body() body: { headers: Record<string, string>; data: any },
    @Res() res: Express.Response,
  ) {
    const { headers, data } = body;

    if (!headers || !data || !Array.isArray(data))
      return res.status(400).json({ error: 'Body parameters missing' });

    const isValid = ['title', 'amount', 'date', 'transaction_type', 'account'].every((item: any) =>
      Boolean(headers[item]),
    );

    if (!isValid) return res.status(400).json({ error: 'Required parameters missing' });

    // Bulk import only ever produces ordinary income/expense rows - a
    // transfer is a paired, dual-account, dual-balance-adjusted event that
    // this single-row/single-account insert path has no way to represent
    // correctly, so reject anything claiming to be type 3 outright rather
    // than silently inserting a broken, un-paired "transfer" leg.
    const hasTransferType = data.some((row) => Number(row['transaction_id']) === 3);
    if (hasTransferType) {
      return res.status(400).json({ error: 'Transfers cannot be bulk imported' });
    }

    const processed: any = data.map((row) => {
      const parsed = moment(row['date'], 'DD/MM/YYYY HH:mm');
      const date = parsed.format('YYYY-MM-DD');
      const time = parsed.format('HH:mm');
      return {
        exp_ts_title: row['title'] || '',
        exp_ts_amount: row['amount'],
        exp_ts_date: date,
        exp_ts_time: time,
        exp_ts_transaction_type: row['transaction_id'],
        exp_ts_category: row['category_id'],
        exp_ts_note: row['note'],
        exp_ts_user_id: req.user.exp_us_id,
        exp_ts_bank_account_id: headers.account,
      };
    }) as unknown as InsertExpensifyTransactions[];

    if (processed.length) {
      await this.expensifyService.bulkTransactions(processed);
    }

    res.status(200).json({
      message: 'Excel processed successfully',
      headers,
    });
  }
  @Get('budgets')
  async getTransactionsByCategories(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const {
        user: { exp_us_id },
        query,
      } = req;
      const { startDate, endDate } = query as {
        startDate: string;
        endDate: string;
      };
      const data = await this.expensifyService.getAllTransactionsByCategory(exp_us_id, {
        startDate,
        endDate,
        transaction_type: 1,
      });
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }
  @Post('budget')
  async createBudget(
    @Body() dto: CreateBudgetDto,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      dto.exp_bg_user_id = exp_us_id;
      await this.expensifyService.createBudget(dto);
      return res.status(200).json({ message: 'Budget Added' });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }
  @Patch('budget/:id')
  async editBudget(
    @Body() dto: UpdateBudgetDto,
    @Param('id') id: string,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      await this.expensifyService.updateBudget(dto, id, exp_us_id);
      return res.status(200).json({ message: 'Budget updated' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  @Delete('budget/:id')
  async deleteBudget(@Param('id') id: string, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.deleteBudget(id, exp_us_id);
  }
  @Post('budgets/copy-previous-month')
  async copyPreviousMonthBudgets(
    @Body() dto: CopyPreviousMonthBudgetsDto,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      const result = await this.expensifyService.copyPreviousMonthBudgets(
        exp_us_id,
        dto.exp_bg_date,
      );
      return res.status(200).json(result);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }

  @Get('recurring-transactions')
  async getRecurringTransactions(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      const data = await this.expensifyService.getRecurringTransactions(exp_us_id);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }

  @Post('recurring-transaction')
  async createRecurringTransaction(
    @Body() dto: CreateRecurringTransactionDto,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      dto.exp_rt_user_id = exp_us_id;
      const data = await this.expensifyService.createRecurringTransaction(dto);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }

  @Put('recurring-transaction/:id')
  async updateRecurringTransaction(
    @Body() dto: UpdateRecurringTransactionDto,
    @Param('id') id: string,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      const data = await this.expensifyService.updateRecurringTransaction(id, dto, exp_us_id);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }

  @Delete('recurring-transaction/:id')
  async deleteRecurringTransaction(@Param('id') id: string, @Req() req: ExpressWithUser) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.deleteRecurringTransaction(id, exp_us_id);
  }

  @Post('recurring-transactions/import')
  async importRecurringTransactions(
    @Body() body: ImportRecurringTransactionsDto,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      const result = await this.expensifyService.importRecurringTransactions(
        exp_us_id,
        body.recurringIds,
      );
      return res.status(200).json(result);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }

  @Get('debts')
  async getDebts(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      const data = await this.expensifyService.getAllDebts(exp_us_id);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }

  @Get('debts/:id')
  async getDebt(
    @Param('id') id: string,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      const data = await this.expensifyService.getDebt(id, exp_us_id);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: error.message });
    }
  }

  @Post('debts')
  async createDebt(
    @Body() dto: CreateDebtDto,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      dto.exp_dt_user_id = exp_us_id;
      const data = await this.expensifyService.createDebt(dto);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }

  @Put('debts/:id')
  async updateDebt(
    @Body() dto: UpdateDebtDto,
    @Param('id') id: string,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      const data = await this.expensifyService.updateDebt(dto, id, exp_us_id);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: error.message });
    }
  }

  @Delete('debts/:id')
  async deleteDebt(
    @Param('id') id: string,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      const data = await this.expensifyService.deleteDebt(id, exp_us_id);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: error.message });
    }
  }

  @Post('debts/:id/repayments')
  async addDebtRepayment(
    @Body() dto: CreateRepaymentDto,
    @Param('id') id: string,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      const data = await this.expensifyService.addDebtRepayment(id, exp_us_id, dto);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: error.message });
    }
  }

  @Delete('debts/:id/repayments/:repaymentId')
  async deleteDebtRepayment(
    @Param('id') id: string,
    @Param('repaymentId') repaymentId: string,
    @Req() req: ExpressWithUser,
    @Res() res: Express.Response,
  ) {
    try {
      const {
        user: { exp_us_id },
      } = req;
      const data = await this.expensifyService.deleteDebtRepayment(repaymentId, id, exp_us_id);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(400).json({ error: error.message });
    }
  }
}
