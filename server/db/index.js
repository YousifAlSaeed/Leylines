// SQLite through sql.js (SQLite compiled to WebAssembly), so there is no
// native module to build. The database lives in memory and is written back
// to disk after every change.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const SCHEMA = fs.readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');

// file: path of the .sqlite file, or null for a throwaway in-memory database
export async function openDatabase(file) {
  const SQL = await initSqlJs();
  const db = file && fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);

  function persist() {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(db.export()));
    fs.renameSync(tmp, file);
    db.run('PRAGMA foreign_keys = ON'); // export() resets connection settings
  }
  persist();

  function query(sql, params = {}) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  // async on purpose: callers already await, so a networked database
  // (Postgres) can replace this without touching the routes
  return {
    all: async (sql, params) => query(sql, params),
    get: async (sql, params) => query(sql, params)[0],
    // for INSERT / UPDATE / DELETE; supports RETURNING
    async run(sql, params) {
      const rows = query(sql, params);
      const changes = db.getRowsModified();
      if (changes) persist();
      return { rows, changes };
    },
    close() {
      persist();
      db.close();
    },
  };
}
