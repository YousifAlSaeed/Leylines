// Sign up, sign in and sign out. Each sign-in returns a bearer token the
// client sends as "Authorization: Bearer <token>".
import { Router } from 'express';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createSession, deleteSession, requireAuth } from '../lib/sessions.js';
import { rateLimit } from '../lib/rateLimit.js';
import { checkPassword, checkSave, checkSignup, cleanName, privateUser } from '../lib/users.js';
import { emailHash, sealEmail } from '../lib/emailCrypto.js';
import { sendResetEmails, useReset } from '../lib/resets.js';

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
        'INSERT INTO users (username, display_name, email, email_hash, password_hash) VALUES ($u, $d, $m, $mh, $h) RETURNING *',
        { $u: username, $d: cleanName(displayName) || username.slice(0, 16), $m: sealEmail(mail), $mh: emailHash(mail), $h: hash },
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

  // asking for reset emails: a few per address, on top of the per-account limit in resets.js
  const forgotLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Too many requests. Wait a few minutes and try again.' });

  // { who: username or email } → 202. The answer is always the same, so it can't tell anyone who has an account
  r.post('/forgot', forgotLimit, (req, res) => {
    const who = typeof req.body?.who === 'string' ? req.body.who.trim().slice(0, 254) : '';
    if (!who) return res.status(400).json({ error: 'Enter your username or email.' });
    res.status(202).json({ ok: true });
    // sent after answering, so how long the answer takes gives nothing away either
    sendResetEmails(db, who).catch((err) => console.error('Reset email failed:', err.message));
  });

  // { token, password } → { token, user, save }: sets the new password, signs out every
  // device and signs this one in
  r.post('/reset', limit, async (req, res) => {
    const { token, password } = req.body ?? {};
    if (!checkPassword(password)) return res.status(400).json({ error: 'Passwords need at least 8 characters.' });
    const userId = await useReset(db, token);
    if (!userId) return res.status(400).json({ error: 'This link has expired or was already used. Ask for a new one.' });
    const { rows: [user] } = await db.run('UPDATE users SET password_hash = $h, updated_at = $now WHERE id = $u RETURNING *',
      { $h: await hashPassword(password), $now: new Date().toISOString(), $u: userId });
    await db.run('DELETE FROM sessions WHERE user_id = $u', { $u: userId });
    const save = await db.get('SELECT * FROM user_saves WHERE user_id = $u', { $u: userId });
    res.json({ token: await createSession(db, userId), user: privateUser(user), save: saveInfo(save, true) });
  });

  r.post('/logout', requireAuth(db), async (req, res) => {
    await deleteSession(db, req.token);
    res.status(204).end();
  });

  return r;
}
