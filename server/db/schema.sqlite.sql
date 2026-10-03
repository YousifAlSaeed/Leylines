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

-- Friends. A friendship is stored twice, once from each side, so a player's
-- list is one simple lookup. Deleting an account removes its friendships.
CREATE TABLE IF NOT EXISTS friends (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, friend_id)
);

-- Friend requests waiting for an answer. Accepting one turns it into two
-- friends rows; declining or cancelling just deletes it.
CREATE TABLE IF NOT EXISTS friend_requests (
  from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests (to_id);
-- The leaderboard: the numbers it ranks by, copied out of each player's save
-- whenever it is written (server/lib/board.js), so ranking is plain SQL.
-- recent is the last results as letters ("wwlwd"); hand is a JSON list of the
-- 5 card ids in their main loadout, or ''.
CREATE TABLE IF NOT EXISTS leaderboard (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp         INTEGER NOT NULL DEFAULT 0,
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  draws      INTEGER NOT NULL DEFAULT 0,
  best       INTEGER NOT NULL DEFAULT 0,
  cards      INTEGER NOT NULL DEFAULT 0,
  recent     TEXT    NOT NULL DEFAULT '',
  hand       TEXT    NOT NULL DEFAULT '',
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS leaderboard_xp ON leaderboard (xp);
CREATE INDEX IF NOT EXISTS leaderboard_wins ON leaderboard (wins);
CREATE INDEX IF NOT EXISTS leaderboard_best ON leaderboard (best);
CREATE INDEX IF NOT EXISTS leaderboard_cards ON leaderboard (cards);
