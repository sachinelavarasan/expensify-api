import { Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

import connectionOptions from './config/database.config';
import { DB } from './database.constants';
import { DatabaseService } from './database.service';
import { Database } from './types/Database';

import * as schema from './schemas/schema';

import { Env } from '../env.interface';

import { repositories } from './repositories';

@Module({
  providers: [
    {
      provide: DB,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService<Env>): Promise<Database> => {
        const connection = new Pool(connectionOptions);
        return {
          connection,
          db: drizzle(connection, {
            schema: schema,
            logger: configService.get('DEBUG') === 'true',
          }),
        };
      },
    },
    DatabaseService,
    ...repositories,
  ],
  exports: [DB, DatabaseService, ...repositories],
})
export class DatabaseModule {}
