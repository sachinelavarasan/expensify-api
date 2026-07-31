import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsObject, IsString, ValidateNested } from 'class-validator';

class BackupUserDto {
  @IsString()
  @IsNotEmpty()
  exp_us_id!: string;

  @IsString()
  @IsNotEmpty()
  exp_us_email!: string;
}

// Global/shared categories (exp_tc_user_id IS NULL, e.g. "Others") aren't owned by the
// user so they're never re-inserted; each database seeds them with its own id, so a
// transaction/budget/recurring row referencing one is resolved by label match on import
// instead of trusting the source database's id. See backup.service.ts#importUserData.
class GlobalCategoryRefDto {
  @IsString()
  @IsNotEmpty()
  exp_tc_id!: string;

  @IsString()
  @IsNotEmpty()
  exp_tc_label!: string;

  @IsNumber()
  exp_tc_transaction_type!: number;
}

export class ImportBackupDto {
  @IsObject()
  @ValidateNested()
  @Type(() => BackupUserDto)
  user!: BackupUserDto;

  @IsArray()
  accounts!: Record<string, any>[];

  @IsArray()
  categories!: Record<string, any>[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GlobalCategoryRefDto)
  globalCategoryRefs!: GlobalCategoryRefDto[];

  @IsArray()
  transactions!: Record<string, any>[];

  @IsArray()
  starredTransactions!: Record<string, any>[];

  @IsArray()
  budgets!: Record<string, any>[];

  @IsArray()
  recurringTransactions!: Record<string, any>[];

  @IsArray()
  debts!: Record<string, any>[];
}
