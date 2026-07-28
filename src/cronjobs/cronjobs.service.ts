import { Injectable } from '@nestjs/common';
import { ExpoPushMessage } from 'expo-server-sdk';
import moment from 'moment';

import { ExpensifyNotificationTokenRepository } from 'src/database/repositories/ExpensifyNotificationToken.repository';
import { RecurringTransactionsRepository } from 'src/database/repositories/RecurringTransactions.repository';
import { ExpensifyNotificationService } from 'src/modules/expensify/expensify-notification.service';

const RECURRING_FREQUENCY_UNIT: Record<string, moment.unitOfTime.DurationConstructor> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

@Injectable()
export class CronjobsService {
  constructor(
    private expensifyNotificationTokenRepository: ExpensifyNotificationTokenRepository,
    private expensifyNotificationService: ExpensifyNotificationService,
    private recurringTransactionsRepository: RecurringTransactionsRepository,
  ) {}

  async expensifySendNotification() {
    const count = 200;
    let record = [];
    let iteration = 0;
    try {
      console.log('********* Send Expo Notification Initiated ********');

      do {
        const messages: ExpoPushMessage[] = [];
        record = await this.expensifyNotificationTokenRepository.getAll(count, iteration * count);
        if (!record.length) {
          break;
        }
        for (let i = 0; i < record.length; i++) {
          const notificationToken = record[i].exp_ntto_token;
          const title = 'Today Reminder';
          const body = `You have expenses to log for today. Don't forget to keep your budget on track!`;
          messages.push({
            to: notificationToken,
            title,
            sound: 'default',
            body,
            priority: 'high',
          });
        }
        await this.expensifyNotificationService.sendNotifications(messages);
        iteration = iteration + 1;
      } while (record.length > 0);
      console.log('********* Send Notifications Completed ********');
      return true;
    } catch (error) {
      throw error;
    }
  }

  async sendRecurringTransactionReminders() {
    try {
      console.log('********* Recurring Transaction Reminders Initiated ********');

      const removedTokens = await this.expensifyNotificationTokenRepository.deleteStale();
      console.log(`********* Removed ${removedTokens.length} stale notification tokens ********`);

      const today = moment().format('YYYY-MM-DD');
      const monthStart = moment().startOf('month').format('YYYY-MM-DD');
      const monthEnd = moment().endOf('month').format('YYYY-MM-DD');
      const activeRules = await this.recurringTransactionsRepository.getActiveRules(
        today,
        monthStart,
        monthEnd,
      );

      const rulesByUser = new Map<string, typeof activeRules>();
      for (const rule of activeRules) {
        const rules = rulesByUser.get(rule.exp_rt_user_id) || [];
        rules.push(rule);
        rulesByUser.set(rule.exp_rt_user_id, rules);
      }

      for (const [userId, rules] of Array.from(rulesByUser.entries())) {
        const tokenEntries = await this.expensifyNotificationTokenRepository.getMany({
          exp_ntto_user_id: userId,
        });

        if (tokenEntries.length) {
          const count = rules.length;
          const messages: ExpoPushMessage[] = tokenEntries.map((tokenEntry) => ({
            to: tokenEntry.exp_ntto_token,
            title: 'New month, new budget!',
            sound: 'default',
            body: `You have ${count} recurring transaction${count > 1 ? 's' : ''} ready for this month.`,
            priority: 'high',
            data: {
              type: 'recurring-transactions-monthly',
              count,
              recurringIds: rules.map((rule) => rule.exp_rt_id),
            },
          }));

          await this.expensifyNotificationService.sendNotifications(messages);
        }

        // for (const rule of rules) {
        //   const nextDueDate = moment(rule.exp_rt_next_due_date)
        //     .add(1, RECURRING_FREQUENCY_UNIT[rule.exp_rt_frequency])
        //     .format('YYYY-MM-DD');
        //   const isPastEndDate = rule.exp_rt_end_date && nextDueDate > rule.exp_rt_end_date;

        //   await this.recurringTransactionsRepository.update(
        //     rule.exp_rt_id,
        //     {
        //       exp_rt_next_due_date: nextDueDate,
        //       exp_rt_is_active: !isPastEndDate,
        //     },
        //     rule.exp_rt_user_id,
        //   );
        // }
      }
      console.log('********* Recurring Transaction Reminders Completed ********');
      return true;
    } catch (error) {
      throw error;
    }
  }
}
