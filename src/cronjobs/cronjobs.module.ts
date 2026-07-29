import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ExpensifyNotificationService } from '../modules/expensify/expensify-notification.service';

import { CronjobsService } from './cronjobs.service';
import { CronjobsController } from './cronjobs.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [CronjobsController],
  providers: [CronjobsService, ExpensifyNotificationService],
})
export class CronjobsModule {}
