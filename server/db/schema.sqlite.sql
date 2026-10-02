-- Leylines database schema (SQLite, for local use; schema.pg.sql is the
-- Postgres twin and must stay in step). Applied on every start, so every
-- statement must be idempotent (IF NOT EXISTS).

-- Player accounts. Guests never touch the database: their progress lives only
-- in the browser's localStorage (see client/js/save.js).
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT    NOT NULL,
  email         TEXT,
  email_hash    TEXT,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- Emails are not unique: a unique email would let anyone test whether an
-- address has an account. They are stored encrypted (server/lib/emailCrypto.js).
DROP INDEX IF EXISTS users_email;
-- a keyed hash of the email, so an account can be found by email without
-- decrypting every row (sqlite.js adds the column to older databases)
CREATE INDEX IF NOT EXISTS users_email_hash ON users (email_hash);

-- Signed-in devices. Only a SHA-256 of each token is stored, so a leaked
-- database can't be used to sign in.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

-- The cloud copy of a player's save: the same JSON the client keeps in
-- localStorage under "ninefold.save.v1". rev goes up by one on every write so
-- two devices can't silently overwrite each other.
CREATE TABLE IF NOT EXISTS user_saves (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT    NOT NULL,
  rev        INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Forgotten-password links. Only a SHA-256 of each token is stored; a link
-- works once, for 30 minutes (server/lib/resets.js).
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  expires_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets (user_id);
