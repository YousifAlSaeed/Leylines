// Sign up, sign in and sign out. Each sign-in returns a bearer token the
// client sends as "Authorization: Bearer <token>".
import { Router } from 'express';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createSession, deleteSession, requireAuth } from '../lib/sessions.js';
import { rateLimit } from '../lib/rateLimit.js';
import { checkSave, checkSignup, cleanName, privateUser } from '../lib/users.js';
import { sealEmail } from '../lib/emailCrypto.js';

// compared against when the username doesn't exist, so both cases take as long
const DUMMY_HASH = await hashPassword('not-a-real-password');

const saveInfo = (s, withData) => s && { rev: s.rev, updatedAt: s.updated_at, ...(withData && { data: JSON.parse(s.data) }) };

export function authRouter(db) {
  const r = Router();
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many attempts. Wait a few minutes and try again.' });

  // { username, password, email?, displayName?, save? } → { token, user, save }
  r.post('/signup', limit, async (req, res) => {
    const { username, password, email, displayName, save } = req.body ?? {};
    const bad = checkSignup({ username, password, email }) || (save != null && checkSave(save));
    if (bad) return res.status(400).json({ error: bad });

    const hash = await hashPassword(password);
    // checked after the await so two sign-ups racing for one name can't both pass
    if (await db.get('SELECT 1 FROM users WHERE lower(username) = lower($u)', { $u: username }))
      return res.status(409).json({ error: 'That username is taken. Try another.' });
    // emails aren't checked for duplicates: that would tell anyone whether an address has an account
    const mail = email ? email.trim().toLowerCase() : null;

    let user;
    try {
      ({ rows: [user] } = await db.run(
        'INSERT INTO users (username, display_name, email, password_hash) VALUES ($u, $d, $m, $h) RETURNING *',
        { $u: username, $d: cleanName(displayName) || username.slice(0, 16), $m: sealEmail(mail), $h: hash },
      ));
    } catch (err) {
      // Postgres runs requests side by side, so a sign-up racing this one can
      // take the name between the check above and this insert
      if (err.code !== '23505') throw err;
      return res.status(409).json({ error: 'That username was just taken. Try another.' });
    }
    let saved = null;
    if (save != null) {
      ({ rows: [saved] } = await db.run(
        'INSERT INTO user_saves (user_id, data) VALUES ($u, $d) RETURNING rev, updated_at',
        { $u: user.id, $d: JSON.stringify(save) },
      ));
    }
    res.status(201).json({ token: await createSession(db, user.id), user: privateUser(user), save: saveInfo(saved) });
  });

  // { username, password } → { token, user, save: { data, rev, updatedAt } | null }
  r.post('/login', limit, async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password)
      return res.status(400).json({ error: 'Enter your username and password.' });
    const user = await db.get('SELECT * FROM users WHERE lower(username) = lower($u)', { $u: username.trim() });
    const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Wrong username or password.' });

    const save = await db.get('SELECT * FROM user_saves WHERE user_id = $u', { $u: user.id });
    res.json({ token: await createSession(db, user.id), user: privateUser(user), save: saveInfo(save, true) });
  });

  r.post('/logout', requireAuth(db), async (req, res) => {
    await deleteSession(db, req.token);
    res.status(204).end();
  });

  return r;
}
