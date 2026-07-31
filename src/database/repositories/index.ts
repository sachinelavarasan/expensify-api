import { ExpensifyBudgetRepository } from './ExpBudget.repository';
import { ExpensifyBankAccountRepository } from './ExpensifyBankAccounts.repository';
import { ExpensifyNotificationLogRepository } from './ExpensifyNotificationLog.repository';
import { ExpensifyNotificationTokenRepository } from './ExpensifyNotificationToken.repository';
import { ExpensifyTransactionsRepository } from './ExpensifyTransactions.repository';
import { ExpensifyTransactionsCategoryRepository } from './ExpensifyTransactionsCategory.repository';
import { ExpensifyUserRepository } from './ExpensifyUser.repository';
import { ExpStarredTransactionsRepository } from './ExpStarredTransactions.repository';
import { RecurringTransactionsRepository } from './RecurringTransactions.repository';
import { DebtsRepository } from './Debts.repository';

export const repositories = [
  ExpensifyUserRepository,
  ExpensifyTransactionsRepository,
  ExpensifyTransactionsCategoryRepository,
  ExpensifyBankAccountRepository,
  ExpStarredTransactionsRepository,
  ExpensifyNotificationTokenRepository,
  ExpensifyNotificationLogRepository,
  ExpensifyBudgetRepository,
  RecurringTransactionsRepository,
  DebtsRepository,
];
