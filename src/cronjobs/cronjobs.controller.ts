import { Controller, Get, Headers, HttpException, HttpStatus } from '@nestjs/common';

import { CronjobsService } from './cronjobs.service';

@Controller('crons')
export class CronjobsController {
  constructor(private readonly cronjobsService: CronjobsService) {}

  private assertAuthorized(cronToken: string) {
    if (!process.env.CRON_SECRET_TOKEN || cronToken !== process.env.CRON_SECRET_TOKEN) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  }

  @Get('recurring-transactions')
  async runRecurringTransactionsCron(@Headers('x-cron-token') cronToken: string) {
    this.assertAuthorized(cronToken);
    try {
      console.log('********* Recurring Transaction Reminder Cron Initiated ********');
      await this.cronjobsService.sendRecurringTransactionReminders();
      console.log('********* Recurring Transaction Reminder Cron Completed ********');
    } catch (error) {
      console.error(error);
    }
  }
}
