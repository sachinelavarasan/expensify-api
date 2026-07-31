import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { BackupService } from './backup.service';
import { ImportBackupDto } from './backup.dto';
import { secureCompare } from '../common/secure-compare';

@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  private assertAuthorized(backupToken: string) {
    if (!secureCompare(backupToken, process.env.BACKUP_ADMIN_TOKEN)) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  }

  @Get('export')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async export(
    @Headers('x-backup-token') backupToken: string,
    @Query('userId') userId?: string,
    @Query('email') email?: string,
  ) {
    this.assertAuthorized(backupToken);

    if (!userId && !email) {
      throw new HttpException('userId or email query param is required', HttpStatus.BAD_REQUEST);
    }

    return this.backupService.exportUserData({ userId, email });
  }

  @Post('import')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async import(
    @Headers('x-backup-token') backupToken: string,
    @Query('confirm') confirm: string,
    @Body() bundle: ImportBackupDto,
  ) {
    this.assertAuthorized(backupToken);

    if (confirm !== 'true') {
      throw new HttpException(
        "This wipes and replaces the target user's existing data. Pass ?confirm=true to proceed.",
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.backupService.importUserData(bundle);
    } catch (error) {
      console.error('Backup import failed:', error);
      // Preserve deliberate 4xx errors (not found / mismatched user / malformed bundle)
      // as-is; anything else (DB/constraint failures) is rolled back by the transaction,
      // so surface it as a clean 500 instead of leaking a raw driver stack trace.
      if (error instanceof HttpException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Import failed and was rolled back: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
