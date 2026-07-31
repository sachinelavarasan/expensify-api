import { Injectable, OnModuleInit } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

import { ExpensifyNotificationTokenRepository } from '../../database/repositories/ExpensifyNotificationToken.repository';

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

  private async disableStaleTokens(messages: ExpoPushMessage[], tickets: ExpoPushTicket[]) {
    const tokenByReceiptId = new Map<string, string>();
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') {
        tokenByReceiptId.set(ticket.id, messages[index].to as string);
      }
    });

    if (!tokenByReceiptId.size) {
      return;
    }

    const receiptIdChunks = this.expo.chunkPushNotificationReceiptIds(
      Array.from(tokenByReceiptId.keys()),
    );

    for (const chunk of receiptIdChunks) {
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
        for (const receiptId in receipts) {
          const receipt = receipts[receiptId];
          if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
            const token = tokenByReceiptId.get(receiptId);
            if (token) {
              await this.notificationTokenRepository.disableByToken(token);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching notification receipts', error);
      }
    }
  }

  async sendNotifications(messages: ExpoPushMessage[]) {
    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending notification chunk', error);
      }
    }

    await this.disableStaleTokens(messages, tickets);

    return tickets;
  }
}
