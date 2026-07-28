import { Injectable, OnModuleInit } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

import { ExpensifyNotificationTokenRepository } from 'src/database/repositories/ExpensifyNotificationToken.repository';

@Injectable()
export class ExpensifyNotificationService implements OnModuleInit {
  private expo: Expo;

  constructor(private notificationTokenRepository: ExpensifyNotificationTokenRepository) {}

  onModuleInit() {
    this.expo = new Expo({
      accessToken: process.env.EXPENSIFY_EXPO_PUSH_NOTIFICATION_ACCESS_TOKEN,
      useFcmV1: true,
    });
  }

  getClient() {
    return this.expo;
  }

  private async disableStaleTokens(tickets: ExpoPushTicket[]) {
    for (const ticket of tickets) {
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered' &&
        ticket.details.expoPushToken
      ) {
        await this.notificationTokenRepository.disableByToken(ticket.details.expoPushToken);
      }
    }
  }

  async sendNotifications(messages: ExpoPushMessage[]) {
    const chunks = this.expo.chunkPushNotifications(messages);
    const receipts: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        receipts.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending notification chunk', error);
      }
    }

    await this.disableStaleTokens(receipts);

    return receipts;
  }
}
