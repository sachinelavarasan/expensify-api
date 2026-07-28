import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class ExpensifySignUpDto {
  email?: string;
  id?: string;
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsNotEmpty()
  phone?: string;
  delete?: boolean;
}

export class TransactionDto {
  @IsString()
  @IsNotEmpty()
  exp_ts_title!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Amount must be a valid number string' })
  exp_ts_amount!: string;

  @IsString()
  @IsNotEmpty()
  exp_tc_id!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' })
  exp_ts_date!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-2][0-9]:[0-5][0-9]$/, {
    message: 'Time must be in HH:MM format',
  })
  exp_ts_time!: string;

  @IsNumber()
  exp_tt_id!: number;

  @IsOptional()
  @IsString()
  exp_ts_note?: string | null;

  exp_ts_user_id: string;
  exp_st_id: boolean;
  exp_ts_bank_account_id: string;
}

export class CreateBankAccountDto {
  exp_ba_name: string;
  exp_ba_balance: string;
  exp_ba_user_id: string;
  exp_ba_icon: string;
}

export class UpdateBankAccountDto {
  exp_ba_name?: string;
  exp_ba_balance?: number;
  exp_ba_icon?: string;
}

export class CreateStarredTransactionDto {
  exp_st_user_id: string;
  exp_st_transaction_id: string;
}
export class CreateBudgetDto {
  exp_bg_user_id: string;
  exp_bg_category_id: string;
  exp_bg_amount: number;
  exp_bg_date: string;
}

export class UpdateBudgetDto {
  exp_bg_id: string;
  exp_bg_amount: number;
}

export class CreateRecurringTransactionDto {
  @IsString()
  @IsNotEmpty()
  exp_rt_title!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Amount must be a valid number string' })
  exp_rt_amount!: string;

  @IsOptional()
  @IsString()
  exp_rt_note?: string | null;

  @IsString()
  @IsNotEmpty()
  exp_rt_category_id!: string;

  @IsNumber()
  exp_rt_transaction_type_id!: number;

  @IsOptional()
  @IsString()
  exp_rt_bank_account_id?: string;

  @IsString()
  @IsNotEmpty()
  exp_rt_frequency!: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' })
  exp_rt_start_date!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' })
  exp_rt_end_date?: string | null;

  exp_rt_user_id: string;
  exp_rt_next_due_date: string;
}

export class ImportRecurringTransactionsDto {
  recurringIds: string[];
}

export class UpdateRecurringTransactionDto {
  exp_rt_title?: string;
  exp_rt_amount?: string;
  exp_rt_note?: string | null;
  exp_rt_category_id?: string;
  exp_rt_transaction_type_id?: number;
  exp_rt_bank_account_id?: string;
  exp_rt_frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  exp_rt_start_date?: string;
  exp_rt_end_date?: string | null;
  exp_rt_next_due_date?: string;
  exp_rt_is_active?: boolean;
}
