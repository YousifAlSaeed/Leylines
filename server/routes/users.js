// User accounts. The client doesn't call these yet; they are the starting
// point for sign-up / sign-in and cloud saves.
import { Router } from 'express';
import { hashPassword } from '../lib/password.js';

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
// same rules as cleanName() in client/js/online.js
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.display_name, createdAt: u.created_at });

export function usersRouter(db) {
  const r = Router();

  // create an account: { username, password, displayName? }
  r.post('/', async (req, res) => {
    const { username, password, displayName } = req.body ?? {};
    if (typeof username !== 'string' || !USERNAME.test(username))
      return res.status(400).json({ error: 'Username must be 3 to 20 letters, numbers or underscores.' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 200)
      return res.status(400).json({ error: 'Password must be 8 to 200 characters.' });

    const hash = await hashPassword(password);
    // checked after the await so two sign-ups racing for one name can't both pass
    if (db.get('SELECT 1 FROM users WHERE username = $u', { $u: username }))
      return res.status(409).json({ error: 'That username is taken.' });
    const { rows } = db.run(
      'INSERT INTO users (username, display_name, password_hash) VALUES ($u, $d, $h) RETURNING *',
      { $u: username, $d: cleanName(displayName) || username.slice(0, 16), $h: hash },
    );
    res.status(201).json(publicUser(rows[0]));
  });

  r.get('/:username', (req, res) => {
    const u = db.get('SELECT * FROM users WHERE username = $u', { $u: req.params.username });
    if (!u) return res.status(404).json({ error: 'No such user.' });
    res.json(publicUser(u));
  });

  return r;
}
