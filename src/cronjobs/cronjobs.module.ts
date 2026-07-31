import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { ExpensifyNotificationService } from '../modules/expensify/expensify-notification.service';

import { CronjobsService } from './cronjobs.service';
import { CronjobsController } from './cronjobs.controller';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [CronjobsController],
  providers: [CronjobsService, ExpensifyNotificationService],
})
export class CronjobsModule {}
