import { Inject } from '@nestjs/common';

import { DB } from './database.constants';
import { Database } from './types/Database';

export class DatabaseService {
  constructor(
    @Inject(DB)
    private readonly db: Database,
  ) {}

  async close() {
    await this.db.connection.end();
  }

  cleanTables() {}
}
