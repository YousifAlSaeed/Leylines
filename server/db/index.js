// Picks the database: Postgres when a DATABASE_URL is given, otherwise a local
// SQLite file. Both return the same async API (all, get, run, close) and accept
// the same SQL, so the routes don't care which one they get.
import { openPostgres } from './postgres.js';
import { openSqlite } from './sqlite.js';

// url: Postgres connection string, or empty; file: SQLite path, or null for memory
export async function openDatabase({ url, file }) {
  const db = url ? await openPostgres(url) : await openSqlite(file);
  db.kind = url ? 'postgres' : 'sqlite';
  return db;
}
