-- Leylines database schema (SQLite). Applied on every start, so every
-- statement must be idempotent (IF NOT EXISTS).

-- Player accounts. Not used by the client yet: today all progress lives in
-- the browser's localStorage (see client/js/save.js).
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One cloud copy of a player's save (the same JSON the client keeps in
-- localStorage under "ninefold.save.v1"), for syncing progress across devices.
CREATE TABLE IF NOT EXISTS user_saves (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT    NOT NULL,
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
