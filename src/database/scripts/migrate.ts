import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';

import connectionOptions from '../config/database.config';

async function runMigration() {
  const connection = new Client(connectionOptions);
  await connection.connect();
  const db = drizzle(connection);

  console.log('Running migrations....');
  await migrate(db, {
    migrationsFolder: 'src/database/migrations',
    migrationsTable: 'migrations',
  });
  console.log('Migration Successfull!');
  process.exit();
}

runMigration();
