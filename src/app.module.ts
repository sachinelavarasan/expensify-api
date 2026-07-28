import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { CronjobsModule } from './cronjobs/cronjobs.module';
import { ExpensifyModule } from './modules/expensify/expensify.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CommonModule,
    CronjobsModule,
    ExpensifyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
