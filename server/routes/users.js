// Public profiles. Accounts are created through /api/auth/signup.
import { Router } from 'express';
import { publicUser } from '../lib/users.js';

export function usersRouter(db) {
  const r = Router();

  r.get('/:username', async (req, res) => {
    const u = await db.get('SELECT * FROM users WHERE username = $u', { $u: req.params.username });
    if (!u) return res.status(404).json({ error: 'No such user.' });
    res.json(publicUser(u));
  });

  return r;
}
