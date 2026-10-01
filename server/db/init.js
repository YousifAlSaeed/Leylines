// npm run db:init: create (or upgrade) the database and exit.
import { config } from '../config.js';
import { openDatabase } from './index.js';

const db = await openDatabase({ url: config.databaseUrl, file: config.dbFile });
const tables = await db.all(db.kind === 'postgres'
  ? "SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename"
  : "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
await db.close();
console.log(`Database ready (${db.kind === 'postgres' ? 'Postgres from DATABASE_URL' : config.dbFile})`);
console.log(`Tables: ${tables.map((t) => t.name).join(', ')}`);
