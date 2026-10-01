// The signed-in player: their profile and their cloud save.
import { Router } from 'express';
import { requireAuth } from '../lib/sessions.js';
import { checkSave, publicUser } from '../lib/users.js';

export function meRouter(db) {
  const r = Router();
  r.use(requireAuth(db));

  // → { user, save: { data, rev, updatedAt } | null }
  r.get('/', async (req, res) => {
    const s = await db.get('SELECT * FROM user_saves WHERE user_id = $u', { $u: req.user.id });
    res.json({ user: publicUser(req.user), save: s && { data: JSON.parse(s.data), rev: s.rev, updatedAt: s.updated_at } });
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
      { $u: req.user.id, $d: JSON.stringify(data), $now: new Date().toISOString() },
    );
    res.json({ rev: s.rev, updatedAt: s.updated_at });
  });

  return r;
}
