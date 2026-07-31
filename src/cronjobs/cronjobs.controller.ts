import { Controller, Get, Headers, HttpException, HttpStatus } from '@nestjs/common';

import { CronjobsService } from './cronjobs.service';
import { secureCompare } from '../common/secure-compare';

@Controller('crons')
export class CronjobsController {
  constructor(private readonly cronjobsService: CronjobsService) {}

  private assertAuthorized(cronToken: string) {
    if (!secureCompare(cronToken, process.env.CRON_SECRET_TOKEN)) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  }

  @Get('recurring-transactions')
  runRecurringTransactionsCron(@Headers('x-cron-token') cronToken: string) {
    this.assertAuthorized(cronToken);
    console.log('********* Recurring Transaction Reminder Cron Initiated ********');
    this.cronjobsService
      .sendRecurringTransactionReminders()
      .then(() => console.log('********* Recurring Transaction Reminder Cron Completed ********'))
      .catch((error) => console.error(error));

    return { success: true };
  }

  @Get('purge-trash')
  runPurgeTrashCron(@Headers('x-cron-token') cronToken: string) {
    this.assertAuthorized(cronToken);
    console.log('********* Purge Trash Cron Initiated ********');
    this.cronjobsService
      .purgeTrashedTransactions()
      .then(() => console.log('********* Purge Trash Cron Completed ********'))
      .catch((error) => console.error(error));

    return { success: true };
  }
}
