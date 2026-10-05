// Online matches someone left: the player who stayed sends what they chose
// (cards taken, or a spare) for the leaver, whose game fetches it later.
// Anyone may send one, since the player who stayed can be a guest; the
// leaver's game ignores any that aren't for a match it remembers leaving.
import { Router } from 'express';
import { rateLimit } from '../lib/rateLimit.js';
import { requireAuth } from '../lib/sessions.js';
import { cleanName } from '../lib/users.js';

export const KEEP_DAYS = 3;   // a leaver who doesn't come back by then never sees it
export const MAX_WAITING = 20; // per player

export function forfeitsRouter(db, hub) {
  const r = Router();
  const limit = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: 'Too many requests. Try again later.' });

  // { to: username, key, name, cards: [card ids] } → 204 ([] = spared). A second one for the same match is ignored.
  r.post('/', limit, async (req, res) => {
    const { to, key, name, cards } = req.body ?? {};
    if (typeof key !== 'string' || !/^[a-z0-9]{1,20}:\d{1,10}$/.test(key)) return res.status(400).json({ error: 'Bad match.' });
    if (!Array.isArray(cards) || cards.length > 5 || !cards.every((c) => Number.isInteger(c) && c >= 0 && c < 1000))
      return res.status(400).json({ error: 'Bad cards.' });
    const u = await db.get('SELECT id FROM users WHERE lower(username) = lower($u)', { $u: String(to ?? '') });
    if (!u) return res.status(404).json({ error: 'No such player.' });
    const now = new Date();
    await db.run('DELETE FROM forfeits WHERE created_at < $old', { $old: new Date(now - KEEP_DAYS * 864e5).toISOString() });
    await db.run(
      `INSERT INTO forfeits (to_id, match_key, from_name, cards, created_at) VALUES ($to, $k, $n, $c, $now)
       ON CONFLICT (to_id, match_key) DO NOTHING`,
      { $to: u.id, $k: key, $n: cleanName(name) || 'Someone', $c: JSON.stringify(cards), $now: now.toISOString() },
    );
    // only the newest few wait for any one player
    await db.run(
      `DELETE FROM forfeits WHERE to_id = $to AND id NOT IN
         (SELECT id FROM forfeits WHERE to_id = $to ORDER BY id DESC LIMIT ${MAX_WAITING})`,
      { $to: u.id },
    );
    hub?.bump(u.id, 'fo'); // their game hears about it on its next check (pulse.js)
    const who = cleanName(name) || 'Your opponent';
    hub?.alert(u.id, { title: 'Match news', tag: 'forfeit', url: './',
      body: cards.length ? `${who} took ${cards.length === 1 ? 'a card' : `${cards.length} cards`} from the match you left.` : `${who} spared you. You kept your cards.` });
    res.status(204).end();
  });

  // → { forfeits: [{ key, name, cards, at }] }, and they're gone from the server
  r.get('/', requireAuth(db), async (req, res) => {
    const rows = await db.all('SELECT * FROM forfeits WHERE to_id = $u ORDER BY id', { $u: req.user.id });
    if (rows.length) await db.run('DELETE FROM forfeits WHERE to_id = $u AND id <= $last', { $u: req.user.id, $last: rows.at(-1).id });
    res.json({ forfeits: rows.map((f) => ({ key: f.match_key, name: f.from_name, cards: JSON.parse(f.cards), at: f.created_at })) });
  });

  return r;
}
