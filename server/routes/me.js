// The signed-in player: their profile, their cloud save and their account settings.
import { Router } from 'express';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { rateLimit } from '../lib/rateLimit.js';
import { deleteOtherSessions, requireAuth } from '../lib/sessions.js';
import { checkEmail, checkPassword, checkSave, cleanName, privateUser } from '../lib/users.js';
import { emailHash, sealEmail } from '../lib/emailCrypto.js';
import { syncBoard } from '../lib/board.js';

export function meRouter(db) {
  const r = Router();
  r.use(requireAuth(db));
  // the routes that check your password get the same limit as signing in
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many attempts. Wait a few minutes and try again.' });
  const wrongPassword = (res) => res.status(403).json({ error: 'That password isn\'t right.' });
  const now = () => new Date().toISOString();

  // → { user, save: { data, rev, updatedAt } | null }
  r.get('/', async (req, res) => {
    const s = await db.get('SELECT * FROM user_saves WHERE user_id = $u', { $u: req.user.id });
    res.json({ user: privateUser(req.user), save: s && { data: JSON.parse(s.data), rev: s.rev, updatedAt: s.updated_at } });
  });

  // { displayName? } or { email, password } → { user }
  // changing the email needs the password, since the email is how a lost account gets back
  r.patch('/', limit, async (req, res) => {
    const { displayName, email, password } = req.body ?? {};
    let user = req.user;
    if (displayName !== undefined) {
      const name = cleanName(displayName);
      if (!name) return res.status(400).json({ error: 'Enter a name.' });
      ({ rows: [user] } = await db.run('UPDATE users SET display_name = $d, updated_at = $now WHERE id = $u RETURNING *',
        { $d: name, $now: now(), $u: user.id }));
    }
    if (email !== undefined) {
      const mail = email ? String(email).trim().toLowerCase() : null;
      if (mail && !checkEmail(mail)) return res.status(400).json({ error: 'That email address doesn\'t look right.' });
      if (typeof password !== 'string' || !await verifyPassword(password, user.password_hash)) return wrongPassword(res);
      ({ rows: [user] } = await db.run('UPDATE users SET email = $e, email_hash = $eh, updated_at = $now WHERE id = $u RETURNING *',
        { $e: sealEmail(mail), $eh: emailHash(mail), $now: now(), $u: user.id }));
    }
    res.json({ user: privateUser(user) });
  });

  // { password, newPassword } → 204. Every other device is signed out.
  r.put('/password', limit, async (req, res) => {
    const { password, newPassword } = req.body ?? {};
    if (!checkPassword(newPassword)) return res.status(400).json({ error: 'New passwords need at least 8 characters.' });
    if (typeof password !== 'string' || !await verifyPassword(password, req.user.password_hash)) return wrongPassword(res);
    await db.run('UPDATE users SET password_hash = $h, updated_at = $now WHERE id = $u',
      { $h: await hashPassword(newPassword), $now: now(), $u: req.user.id });
    await deleteOtherSessions(db, req.user.id, req.token);
    res.status(204).end();
  });

  // { password } → 204. Removes the account, its sessions and its cloud save.
  r.delete('/', limit, async (req, res) => {
    const { password } = req.body ?? {};
    if (typeof password !== 'string' || !await verifyPassword(password, req.user.password_hash)) return wrongPassword(res);
    await db.run('DELETE FROM users WHERE id = $u', { $u: req.user.id });
    res.status(204).end();
  });

  // { data, baseRev, force? } → { rev, updatedAt }
  // baseRev is the rev this device last saw. If another device has saved since,
  // the write is refused with 409 so the player can choose; force overwrites.
  r.put('/save', async (req, res) => {
    const { data, baseRev, force } = req.body ?? {};
    const bad = checkSave(data);
    if (bad) return res.status(400).json({ error: bad });

    const cur = await db.get('SELECT rev, updated_at FROM user_saves WHERE user_id = $u', { $u: req.user.id });
    if (cur && !force && cur.rev !== baseRev)
      return res.status(409).json({ error: 'Your account was updated on another device.', rev: cur.rev, updatedAt: cur.updated_at });

    const { rows: [s] } = await db.run(
      `INSERT INTO user_saves (user_id, data) VALUES ($u, $d)
       ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, rev = user_saves.rev + 1,
         updated_at = $now
       RETURNING rev, updated_at`,
      { $u: req.user.id, $d: JSON.stringify(data), $now: now() },
    );
    await syncBoard(db, req.user.id, data);
    res.json({ rev: s.rev, updatedAt: s.updated_at });
  });

  return r;
}
