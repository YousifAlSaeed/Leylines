// Hosted database: Postgres (for example a free Neon project), used when
// DATABASE_URL is set. Unlike the SQLite file it lives outside the server, so
// accounts survive deploys, restarts and Render's idle spin-downs.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const SCHEMA = fs.readFileSync(fileURLToPath(new URL('./schema.pg.sql', import.meta.url)), 'utf8');

// The routes write SQLite-style named parameters ($name with a { $name: value }
// object); Postgres wants $1, $2... with an array.
function positional(sql, params = {}) {
  const values = [];
  const seen = new Map();
  const text = sql.replace(/\$([A-Za-z_]\w*)/g, (_, name) => {
    const key = '$' + name;
    if (!(key in params)) throw new Error(`Missing SQL parameter ${key}`);
    if (!seen.has(key)) {
      values.push(params[key]);
      seen.set(key, values.length);
    }
    return '$' + seen.get(key);
  });
  return { text, values };
}

export async function openPostgres(url) {
  const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 });
  // Neon closes idle connections when it scales to zero; without a listener
  // that error would crash the server. The pool reconnects on the next query.
  pool.on('error', (err) => console.warn('Postgres idle connection closed:', err.message));
  await pool.query(SCHEMA);

  const query = (sql, params) => pool.query(positional(sql, params));

  return {
    all: async (sql, params) => (await query(sql, params)).rows,
    get: async (sql, params) => (await query(sql, params)).rows[0],
    // for INSERT / UPDATE / DELETE; supports RETURNING
    async run(sql, params) {
      const res = await query(sql, params);
      return { rows: res.rows, changes: res.rowCount ?? 0 };
    },
    close: () => pool.end(),
  };
}
