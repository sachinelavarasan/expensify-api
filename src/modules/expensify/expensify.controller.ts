import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';

import { ExpensifyService } from './expensify.service';

import { verifyWebhook } from '@clerk/backend/webhooks';
import { UserJSON } from '@clerk/backend';
import * as Express from 'express';
import { ExpressWithUser } from './type';
import {
  InsertExpensifyBankAccounts,
  InsertExpensifyTransactionCategories,
  InsertExpensifyTransactions,
  SelectExpensifyTransactionCategories,
} from 'src/database/schemas/schema';
import {
  CreateBankAccountDto,
  CreateBudgetDto,
  CreateRecurringTransactionDto,
  CreateStarredTransactionDto,
  ImportRecurringTransactionsDto,
  TransactionDto,
  UpdateBankAccountDto,
  UpdateBudgetDto,
  UpdateRecurringTransactionDto,
} from './dto/auth.dto';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import moment from 'moment';

@Controller('expensify')
export class ExpensifyController {
  constructor(private expensifyService: ExpensifyService) {}

  @Post('clerk/webhook')
  async getAll(@Req() req: Express.Request, @Res() res: Express.Response) {
    try {
      const headers = {
        get: (key: string) => {
          const foundKey = Object.keys(req.headers).find(
            (k) => k.toLowerCase() === key.toLowerCase(),
          );
          if (!foundKey) return null;
          const val = req.headers[foundKey];
          if (Array.isArray(val)) return val.join(',');
          return val;
        },
      };

      const fetchLikeRequest: any = {
        headers: headers,
        method: req.method,
        body: req.body,
        url: req.originalUrl,
        text: async () => {
          if (!req.body) {
            throw new Error('Raw body missing');
          }
          return req.body.toString('utf8');
        },
      };
      const evt = await verifyWebhook(fetchLikeRequest, {
        signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
      });
      const { id, phone_numbers, email_addresses, first_name } = evt.data as unknown as UserJSON;
      const eventType = evt.type;

      if (!id) {
        return res.status(400).json({ error: 'Missing Clerk user id or email in webhook payload' });
      }

      const email = email_addresses?.[0]?.email_address;
      const phone = phone_numbers?.[0]?.phone_number;
      const name = first_name;
      switch (eventType) {
        case 'user.created':
          await this.expensifyService.signup({ phone, name, email, id });
          return res.status(201).json({ message: 'User created successfully' });
        case 'user.updated':
          await this.expensifyService.editProfile(id, { phone, name, email });
          return res.status(200).json({ message: 'User updated successfully' });
        case 'user.deleted':
          await this.expensifyService.editProfile(id, { delete: true });
          return res.status(200).json({ message: 'User deleted successfully' });
        default:
          break;
      }
      return res.status(200).json({ message: 'User response received' });
    } catch (error) {
      console.log(error);
      return res.status(401).json({ error: error.message });
    }
  }
  @Get('transactions')
  async getTransactions(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const {
        user: { exp_us_id },
        query,
      } = req;
      const { startDate, endDate, transaction_type, search, account } = query as {
        startDate: string;
        endDate: string;
        transaction_type?: 'all' | 'income' | 'expense';
        search?: string;
        account: string;
      };
      const data = await this.expensifyService.getAllTransactions(exp_us_id, {
        startDate,
        endDate,
        transaction_type:
          transaction_type === 'income' ? 2 : transaction_type === 'expense' ? 1 : undefined,
        transaction_label: search ? search : undefined,
        accountId: account ? account : undefined,
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
  @Get('transaction/:id')
  async getTransaction(@Req() req: ExpressWithUser, @Res() res: Express.Response) {
    try {
      const { params } = req;
      const { id } = params as unknown as { id: string };
      const [data] = await this.expensifyService.getTransaction(id);
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
      await this.expensifyService.editTransaction(id, insertBody);
      return res.status(200).json({ message: 'Updated successfully' });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }
  @Delete('transaction/:id')
  deleteTransaction(@Param('id') id: string) {
    return this.expensifyService.deleteTransaction(id);
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
  async reorderCategories(@Body() dto: Partial<SelectExpensifyTransactionCategories>[]) {
    return this.expensifyService.reorderCategories(dto);
  }
  @Delete('categories/:id')
  async delete(@Req() req: ExpressWithUser, @Param('id') id: string) {
    const {
      user: { exp_us_id },
    } = req;
    return this.expensifyService.deleteCategory(id, exp_us_id);
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
  update(@Param('id') id: string, @Body() dto: UpdateBankAccountDto) {
    const insertDto = dto as unknown as InsertExpensifyBankAccounts;
    return this.expensifyService.updateAccount(id, insertDto);
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
  async starTransaction(@Body() dto: CreateStarredTransactionDto) {
    return this.expensifyService.starTransaction(dto);
  }

  @Delete('starred/:transactionId')
  async unstarTransaction(
    @Param('transactionId') transactionId: string,
    @Query('userId') userId: string, // or use Auth
  ) {
    return this.expensifyService.unstarTransaction(userId, transactionId);
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
    @Query('userId') userId: string,
  ) {
    return this.expensifyService.isTransactionStarred(userId, transactionId);
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
    } = query as {
      startDate: string;
      endDate: string;
      format?: 'xlsx' | 'csv';
      transaction_type?: 'all' | 'income' | 'expense';
    };

    const transactions = await this.expensifyService.getAllTransactions(exp_us_id, {
      startDate,
      // exp_ts_date filtering is exclusive on the upper bound, so shift by a day
      // to include transactions dated on endDate itself (e.g. "today").
      endDate: moment(endDate).add(1, 'day').format('YYYY-MM-DD'),
      transaction_type:
        transaction_type === 'income' ? 2 : transaction_type === 'expense' ? 1 : undefined,
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
    } = query as {
      startDate: string;
      endDate: string;
      format?: 'xlsx' | 'csv';
      transaction_type?: 'all' | 'income' | 'expense';
    };

    const transactions = await this.expensifyService.getAllTransactions(exp_us_id, {
      startDate,
      // exp_ts_date filtering is exclusive on the upper bound, so shift by a day
      // to include transactions dated on endDate itself (e.g. "today").
      endDate: moment(endDate).add(1, 'day').format('YYYY-MM-DD'),
      transaction_type:
        transaction_type === 'income' ? 2 : transaction_type === 'expense' ? 1 : undefined,
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
              font: 'Helvetica-Bold',
            },
            {
              text: 'Account Name',
              font: 'Helvetica-Bold',
            },
            {
              text: 'Title',
              font: 'Helvetica-Bold',
            },
            {
              text: 'Date',
              font: 'Helvetica-Bold',
            },
            {
              text: 'Category',
              font: 'Helvetica-Bold',
            },
            {
              text: 'Transaction Type',
              font: 'Helvetica-Bold',
            },
            {
              text: 'Amount',
              font: 'Helvetica-Bold',
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
      return res.status(401).json({ error: error.message });
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
      return res.status(401).json({ error: error.message });
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
      return res.status(401).json({ error: error.message });
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
    @Body() body: { name: string },
  ) {
    try {
      const user = await this.expensifyService.updateName(req.user.exp_us_id, body.name);
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
  async importExcel(@Body() body: { headers: string[]; data: any }, @Res() res: Express.Response) {
    const { headers, data } = body;

    if (!headers || !data || !Array.isArray(data))
      return res.status(400).json({ error: 'Body parameters missing' });

    const isValid = ['title', 'amount', 'date', 'transaction_type'].every((item: any) =>
      Boolean(headers[item]),
    );

    if (!isValid) return res.status(400).json({ error: 'Required parameters missing' });

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
        category_id = row[headers['transaction_type']]
          ? row[headers['transaction_type']]?.toLowerCase() === 'income'
            ? 12
            : 6
          : null;
        transaction_id = row[headers['transaction_type']]
          ? row[headers['transaction_type']]?.toLowerCase() === 'income'
            ? 2
            : 1
          : null;
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

    res.status(200).json({
      message: 'Excel processed successfully',
      headers,
      totalRows: data.length,
      validRows,
      invalidRows,
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
      await this.expensifyService.updateBudget(dto, id);
      return res.status(200).json({ message: 'Budget updated' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  @Delete('budget/:id')
  async deleteBudget(@Param('id') id: string) {
    return this.expensifyService.deleteBudget(id);
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
    @Res() res: Express.Response,
  ) {
    try {
      const data = await this.expensifyService.updateRecurringTransaction(id, dto);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: error.message });
    }
  }

  @Delete('recurring-transaction/:id')
  async deleteRecurringTransaction(@Param('id') id: string) {
    return this.expensifyService.deleteRecurringTransaction(id);
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
}
