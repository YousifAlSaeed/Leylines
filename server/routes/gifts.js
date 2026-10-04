// Gifts: packs a developer (DEV_USERS) gives a player from their profile. They
// wait here until the player's game fetches them. The game adds them to its
// save and only clears them once that save has synced, so a gift can't be lost
// if the account's copy replaces this device's progress in between.
import { Router } from 'express';
import { config } from '../config.js';
import { rateLimit } from '../lib/rateLimit.js';
import { requireAuth } from '../lib/sessions.js';

export const PACK_TIERS = ['spark', 'arcane', 'ley', 'mythic']; // client/js/data.js PACKS
export const KEEP_DAYS = 30;   // a player who doesn't come back by then never gets it
export const MAX_WAITING = 50; // per player

const isDevUser = (u) => config.devUsers.includes(u.username.toLowerCase());

export function giftsRouter(db, hub) {
  const r = Router();
  r.use(requireAuth(db));
  const limit = rateLimit({ windowMs: 60 * 60 * 1000, max: 200, message: 'Too many gifts. Try again later.' });

  // { to: username, pack } → 204. Developers only.
  r.post('/', limit, async (req, res) => {
    if (!isDevUser(req.user)) return res.status(403).json({ error: 'Only developers can give packs.' });
    const { to, pack } = req.body ?? {};
    if (!PACK_TIERS.includes(pack)) return res.status(400).json({ error: 'Bad pack.' });
    const u = await db.get('SELECT id FROM users WHERE lower(username) = lower($u)', { $u: String(to ?? '') });
    if (!u) return res.status(404).json({ error: 'No such player.' });
    const now = new Date();
    await db.run('DELETE FROM gifts WHERE created_at < $old', { $old: new Date(now - KEEP_DAYS * 864e5).toISOString() });
    const waiting = await db.get('SELECT COUNT(*) AS n FROM gifts WHERE to_id = $to', { $to: u.id });
    if (Number(waiting.n) >= MAX_WAITING) return res.status(429).json({ error: 'They have too many gifts waiting.' });
    await db.run('INSERT INTO gifts (to_id, from_name, pack, created_at) VALUES ($to, $n, $p, $now)',
      { $to: u.id, $n: req.user.display_name, $p: pack, $now: now.toISOString() });
    hub?.bump(u.id, 'gi'); // their game hears about it on its next check (pulse.js)
    res.status(204).end();
  });

  // → { gifts: [{ id, name, pack, at }] }. They stay until acknowledged.
  r.get('/', async (req, res) => {
    const rows = await db.all('SELECT * FROM gifts WHERE to_id = $u ORDER BY id', { $u: req.user.id });
    res.json({ gifts: rows.map((g) => ({ id: Number(g.id), name: g.from_name, pack: g.pack, at: g.created_at })) });
  });

  // { ids: [gift ids] } → 204. The game's synced save has these now.
  r.post('/ack', async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length > MAX_WAITING || !ids.every(Number.isInteger)) return res.status(400).json({ error: 'Bad gifts.' });
    for (const id of ids) await db.run('DELETE FROM gifts WHERE id = $id AND to_id = $u', { $id: id, $u: req.user.id });
    res.status(204).end();
  });

  return r;
}
