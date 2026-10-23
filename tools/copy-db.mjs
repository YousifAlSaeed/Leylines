// Copy the whole Leylines database from one Postgres to another (Neon → Railway, 2026-10).
//
//   node tools/copy-db.mjs
//
// It asks for the two connection strings (or reads FROM_DB and TO_DB). Paste them, never type them into a
// command, so the passwords stay out of the shell history. FROM is only read. TO must be empty: the script
// creates the tables (server/db/schema.pg.sql, like the server does on start), then copies every table in one
// transaction, so a failure leaves TO as empty as it was. Running it the wrong way round can't wipe the
// live data, because it stops when TO already has rows.
//
// Values are copied as Postgres's own text, so nothing is changed by going through JavaScript. Ids keep
// their numbers, and each id counter is moved past the highest one, so new rows don't clash.
// Prints a count per table from both sides at the end; they must match.
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const SCHEMA = fs.readFileSync(fileURLToPath(new URL('../server/db/schema.pg.sql', import.meta.url)), 'utf8');
const BATCH = 500; // rows per INSERT

const q = (name) => '"' + name.replaceAll('"', '""') + '"';
// a host with several addresses that all fail gives an AggregateError with an empty message
const why = (err) => err.message || err.errors?.map((e) => e.message).join('; ') || err.code || String(err);
const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
const local = (host) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);

// same as server/db/postgres.js for Neon (sslmode=require → verify-full, without pg's warning).
// Railway's public address has no sslmode and a self-signed certificate: encrypt, but don't check it
function tidy(url) {
  url = url.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/, '$1verify-full');
  if (!/[?&]sslmode=/.test(url) && !local(hostOf(url))) url += (url.includes('?') ? '&' : '?') + 'sslmode=no-verify';
  return url;
}

async function ask(rl, env, label) {
  const v = (process.env[env] || (await rl.question(`${label}: `))).trim();
  if (!/^postgres(ql)?:\/\//.test(v)) throw new Error(`${label} must start with postgres:// or postgresql://`);
  return v;
}

// tables in the public schema, parents before children (users before sessions…)
async function tablesInOrder(db) {
  const { rows: tables } = await db.query(
    `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`);
  const { rows: refs } = await db.query(
    `SELECT c.relname AS child, p.relname AS parent FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid JOIN pg_class p ON p.oid = k.confrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE k.contype = 'f' AND n.nspname = 'public' AND c.relname <> p.relname`);
  const left = new Set(tables.map((r) => r.t));
  const order = [];
  while (left.size) {
    const ready = [...left].filter((t) => !refs.some((r) => r.child === t && left.has(r.parent)));
    if (!ready.length) throw new Error('These tables point at each other in a loop: ' + [...left].join(', '));
    for (const t of ready) { order.push(t); left.delete(t); }
  }
  return order;
}

const columns = async (db, table) => (await db.query(
  `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
  [table])).rows.map((r) => r.c);

const count = async (db, table) => Number((await db.query(`SELECT COUNT(*) AS n FROM ${q(table)}`)).rows[0].n);

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let fromUrl, toUrl;
  try {
    fromUrl = await ask(rl, 'FROM_DB', 'Copy FROM (the old database, Neon)');
    toUrl = await ask(rl, 'TO_DB', 'Copy TO (the new, empty database, Railway public URL)');
  } finally { rl.close(); }
  const where = (url) => { const u = new URL(url); return `${u.hostname}:${u.port || 5432}${u.pathname}`; };
  if (where(fromUrl) === where(toUrl)) {
    throw new Error('FROM and TO are the same database.');
  }

  // every value comes back as Postgres's text, which goes back in unchanged
  const from = new pg.Client({ connectionString: tidy(fromUrl), types: { getTypeParser: () => (v) => v } });
  const to = new pg.Client({ connectionString: tidy(toUrl) });
  // a dropped connection is reported by the query that was running; without these it would also crash the script
  for (const c of [from, to]) c.on('error', (err) => console.warn('Connection problem: ' + why(err)));
  let began = false;
  try {
    await from.connect();
    await to.connect();
    console.log(`Connected: FROM ${hostOf(fromUrl)}, TO ${hostOf(toUrl)}`);
    await to.query(SCHEMA);
    const tables = await tablesInOrder(from);
    const there = new Set(await tablesInOrder(to));

    // check everything before writing anything
    for (const t of tables) {
      if (!there.has(t)) throw new Error(`TO has no table "${t}". Is FROM a newer version of the game than this checkout?`);
      const a = await columns(from, t), b = new Set(await columns(to, t));
      const missing = a.filter((c) => !b.has(c));
      if (missing.length) throw new Error(`TO's "${t}" has no column ${missing.join(', ')}.`);
    }
    for (const t of there) {
      if (await count(to, t)) throw new Error(`TO already has rows in "${t}". It must be empty: nothing was copied.`);
    }

    await to.query('BEGIN');
    began = true;
    for (const t of tables) {
      const cols = await columns(from, t);
      const list = cols.map(q).join(', ');
      const { rows } = await from.query({ text: `SELECT ${list} FROM ${q(t)}`, rowMode: 'array' });
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const values = chunk.map((_, r) => '(' + cols.map((_, c) => '$' + (r * cols.length + c + 1)).join(', ') + ')').join(', ');
        await to.query(`INSERT INTO ${q(t)} (${list}) VALUES ${values}`, chunk.flat());
      }
      // the next id after the highest one copied (identity and serial columns)
      const { rows: seqs } = await to.query(
        `SELECT c, s FROM (SELECT a.attname AS c, pg_get_serial_sequence($1::text, a.attname) AS s FROM pg_attribute a
           WHERE a.attrelid = $1::text::regclass AND a.attnum > 0 AND NOT a.attisdropped) x WHERE s IS NOT NULL`,
        [q(t)]);
      for (const { c, s } of seqs) {
        await to.query(`SELECT setval($1, COALESCE((SELECT MAX(${q(c)}) FROM ${q(t)}), 0) + 1, false)`, [s]);
      }
      console.log(`  ${t}: ${rows.length} rows`);
    }
    await to.query('COMMIT');
    began = false;

    console.log('\nCheck (FROM → TO):');
    let ok = true;
    for (const t of tables) {
      const a = await count(from, t), b = await count(to, t);
      if (a !== b) ok = false;
      console.log(`  ${a === b ? 'ok  ' : 'DIFF'} ${t}: ${a} → ${b}`);
    }
    console.log(ok ? '\nDone: every table matches.' : '\nSome tables differ. Has someone used the old site since the copy started?');
    if (!ok) process.exitCode = 1;
  } catch (err) {
    if (began) await to.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await from.end().catch(() => {});
    await to.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('\nStopped: ' + why(err));
  process.exitCode = 1;
});
