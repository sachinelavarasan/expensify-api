import { PgDatabase } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';

import * as schema from '../schemas/schema';

export type Database = {
  connection: Pool;
  db: PgDatabase<NodePgQueryResultHKT, typeof schema>;
};
