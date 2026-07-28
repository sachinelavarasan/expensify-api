import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

config();

export default {
  out: 'src/database/migrations',
  schema: 'src/database/schemas/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    user: process.env.DB_USER,
    ssl: process.env.NODE_ENV === 'production',
  },
} satisfies Config;
