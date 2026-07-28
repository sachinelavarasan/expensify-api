import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { CronjobsModule } from './cronjobs/cronjobs.module';
import { ExpensifyModule } from './modules/expensify/expensify.module';
import { NotificationModule } from './notification/notification.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        // Default budget for the API as a whole; the sensitive auth routes
        // apply their own tighter @Throttle() overrides on top of this.
        ttl: 60000,
        limit: 60,
      },
    ]),
    DatabaseModule,
    CommonModule,
    CronjobsModule,
    ExpensifyModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
