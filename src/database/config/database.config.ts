import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { ConnectionConfig } from 'pg';

import { Env } from '../../env.interface';

config();

const configService = new ConfigService<Env>();

let connectionOptions: ConnectionConfig;

if (configService.get('NODE_ENV') == 'production') {
  connectionOptions = {
    host: configService.get('DB_HOST'),
    user: configService.get('DB_USER'),
    database: configService.get('DB_NAME'),
    password: configService.get('DB_PASSWORD'),
    port: configService.get('DB_PORT'),
    ssl: true,
  };
} else if (
  configService.get('NODE_ENV') == 'development' ||
  configService.get('NODE_ENV') == 'staging'
) {
  connectionOptions = {
    host: configService.get('DB_HOST'),
    user: configService.get('DB_USER'),
    database: configService.get('DB_NAME'),
    password: configService.get('DB_PASSWORD'),
    port: configService.get('DB_PORT'),
  };
}

export default connectionOptions;
