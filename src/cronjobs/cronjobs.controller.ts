import { Controller, Get, Headers, HttpException, HttpStatus } from '@nestjs/common';

import { CronjobsService } from './cronjobs.service';
import { secureCompare } from 'src/common/secure-compare';

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

    return { status: 'accepted' };
  }
}
