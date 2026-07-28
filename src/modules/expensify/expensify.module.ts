import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { DatabaseModule } from '../../database/database.module';
import { MailModule } from '../../mail/mail.module';
import { StorageModule } from '../../storage/storage.module';

import { ExpensifyController } from './expensify.controller';
import { AuthExpensifyMiddleware } from './middleware/auth-expensify.middleware';

import { ExpensifyService } from './expensify.service';
import { ConfigService } from '@nestjs/config';
import { ExpensifyNotificationService } from './expensify-notification.service';
import { ExpensifyAuthController } from './auth/expensify-auth.controller';
import { ExpensifyAuthService } from './auth/expensify-auth.service';

@Global()
@Module({
  imports: [JwtModule.register({}), DatabaseModule, MailModule, StorageModule],
  controllers: [ExpensifyController, ExpensifyAuthController],
  providers: [
    ExpensifyService,
    AuthExpensifyMiddleware,
    ExpensifyNotificationService,
    ExpensifyAuthService,
  ],
  exports: [ExpensifyService, AuthExpensifyMiddleware, ExpensifyNotificationService],
})
export class ExpensifyModule implements NestModule {
  constructor(private config: ConfigService) {}
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthExpensifyMiddleware)
      .exclude(
        { path: 'expensify/auth/signup', method: RequestMethod.POST },
        { path: 'expensify/auth/verify-signup-otp', method: RequestMethod.POST },
        { path: 'expensify/auth/resend-otp', method: RequestMethod.POST },
        { path: 'expensify/auth/login', method: RequestMethod.POST },
        { path: 'expensify/auth/forgot-password', method: RequestMethod.POST },
        { path: 'expensify/auth/reset-password', method: RequestMethod.POST },
        { path: 'expensify/auth/refresh-token', method: RequestMethod.POST },
      )
      .forRoutes(ExpensifyController, ExpensifyAuthController);
  }
}
