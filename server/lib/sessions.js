// Sign-in sessions: a random token goes to the client, its SHA-256 goes in the database.
import crypto from 'node:crypto';
import { config } from '../config.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DAY = 24 * 60 * 60 * 1000;

export async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * DAY).toISOString();
  await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($h, $u, $e)', { $h: sha256(token), $u: userId, $e: expires });
  return token;
}

export async function deleteSession(db, token) {
  await db.run('DELETE FROM sessions WHERE token_hash = $h', { $h: sha256(token) });
}

export async function purgeExpiredSessions(db) {
  await db.run('DELETE FROM sessions WHERE expires_at < $now', { $now: new Date().toISOString() });
}

const bearer = (req) => /^Bearer (\S+)$/.exec(req.get('authorization') || '')?.[1];

// sets req.user and req.token, or answers 401
export function requireAuth(db) {
  return async (req, res, next) => {
    const token = bearer(req);
    const row = token && await db.get(
      `SELECT u.*, s.expires_at AS session_expires FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $h AND s.expires_at > $now`,
      { $h: sha256(token), $now: new Date().toISOString() },
    );
    if (!row) return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
    // sliding expiry, refreshed at most once a day so reads don't rewrite the database
    if (new Date(row.session_expires) - Date.now() < (config.sessionDays - 1) * DAY) {
      const expires = new Date(Date.now() + config.sessionDays * DAY).toISOString();
      await db.run('UPDATE sessions SET expires_at = $e WHERE token_hash = $h', { $e: expires, $h: sha256(token) });
    }
    req.user = row;
    req.token = token;
    next();
  };
}

// signs out every other device (after a password change)
export async function deleteOtherSessions(db, userId, keepToken) {
  await db.run('DELETE FROM sessions WHERE user_id = $u AND token_hash <> $h', { $u: userId, $h: sha256(keepToken) });
}
