import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { ExpensifyNotificationService } from '../modules/expensify/expensify-notification.service';
import { secureCompare } from '../common/secure-compare';

@Controller('notifications')
export class NotificationController {
  constructor(private expensifyNotificationService: ExpensifyNotificationService) {}

  // Test-only route: sends an Expo push directly, auth'd via a static token
  // instead of a user JWT, so it can be hit without going through login.
  @Post('test-send')
  @HttpCode(HttpStatus.OK)
  async testSend(
    @Headers('x-test-token') testToken: string,
    @Body() body: { to: string; title: string; body: string; data?: Record<string, unknown> },
  ) {
    if (!secureCompare(testToken, process.env.NOTIFICATION_TEST_TOKEN)) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const receipts = await this.expensifyNotificationService.sendNotifications([
      {
        to: body.to,
        title: body.title,
        body: body.body,
        data: body.data,
        sound: 'default',
        priority: 'high',
      },
    ]);
    return { receipts };
  }
}
