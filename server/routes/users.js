// Public profiles: what anyone with the share link sees. Accounts are created
// through /api/auth/signup.
import { Router } from 'express';
import { publicProfile, publicUser } from '../lib/users.js';

export function usersRouter(db) {
  const r = Router();

  // → { ...user, profile }
  r.get('/:username', async (req, res) => {
    const u = await db.get('SELECT * FROM users WHERE lower(username) = lower($u)', { $u: req.params.username });
    if (!u) return res.status(404).json({ error: 'No such player.' });
    const s = await db.get('SELECT data FROM user_saves WHERE user_id = $u', { $u: u.id });
    let data = null;
    try { data = s && JSON.parse(s.data); } catch { /* a broken save just shows an empty profile */ }
    res.json({ ...publicUser(u), profile: publicProfile(data) });
  });

  return r;
}
