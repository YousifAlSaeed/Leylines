// Friends: send a request by username, accept it, see your list. Only the
// public part of each friend's profile is ever returned (users.js).
import { Router } from 'express';
import { rateLimit } from '../lib/rateLimit.js';
import { requireAuth } from '../lib/sessions.js';
import { publicProfile, publicUser } from '../lib/users.js';

export const MAX_FRIENDS = 200;
export const MAX_SENT = 50; // requests waiting for an answer

export function friendsRouter(db) {
  const r = Router();
  r.use(requireAuth(db));
  const limit = rateLimit({ windowMs: 60 * 60 * 1000, max: 100, message: 'Too many friend requests. Try again later.' });

  const findUser = (name) => db.get('SELECT * FROM users WHERE lower(username) = lower($u)', { $u: String(name ?? '') });
  const noSuchPlayer = (res, name) => res.status(404).json({ error: `There's no player called ${String(name ?? '').slice(0, 20)}.` });
  // a row from the lists below: the player, plus the level and avatar from their save
  const card = (row) => {
    let save = null;
    try { save = row.data && JSON.parse(row.data); } catch { /* a broken save just shows no avatar */ }
    const p = publicProfile(save);
    return { ...publicUser(row), xp: p.xp, avatar: p.avatar, since: row.since };
  };
  const list = async (sql, me) => (await db.all(sql, { $me: me })).map(card);

  // → { friends, incoming, outgoing }
  r.get('/', async (req, res) => {
    const me = req.user.id;
    const [friends, incoming, outgoing] = await Promise.all([
      list(`SELECT u.*, s.data, f.created_at AS since FROM friends f JOIN users u ON u.id = f.friend_id
            LEFT JOIN user_saves s ON s.user_id = u.id WHERE f.user_id = $me ORDER BY lower(u.display_name), u.id`, me),
      list(`SELECT u.*, s.data, q.created_at AS since FROM friend_requests q JOIN users u ON u.id = q.from_id
            LEFT JOIN user_saves s ON s.user_id = u.id WHERE q.to_id = $me ORDER BY q.created_at DESC`, me),
      list(`SELECT u.*, s.data, q.created_at AS since FROM friend_requests q JOIN users u ON u.id = q.to_id
            LEFT JOIN user_saves s ON s.user_id = u.id WHERE q.from_id = $me ORDER BY q.created_at DESC`, me),
    ]);
    res.json({ friends, incoming, outgoing });
  });

  // { username } → { status: 'sent' | 'friends' }
  // If they already asked you, this accepts their request instead.
  r.post('/requests', limit, async (req, res) => {
    const me = req.user.id, name = req.body?.username;
    const them = await findUser(name);
    if (!them) return noSuchPlayer(res, name);
    if (them.id === me) return res.status(400).json({ error: 'You can\'t add yourself.' });

    if (await db.get('SELECT 1 AS x FROM friends WHERE user_id = $me AND friend_id = $t', { $me: me, $t: them.id }))
      return res.json({ status: 'friends' });
    // Number(): Postgres returns COUNT(*) as a string
    const count = async (sql) => Number((await db.get(sql, { $me: me }))?.n ?? 0);
    const full = async (id) => Number((await db.get('SELECT COUNT(*) AS n FROM friends WHERE user_id = $u', { $u: id }))?.n ?? 0) >= MAX_FRIENDS;

    if (await db.get('SELECT 1 AS x FROM friend_requests WHERE from_id = $t AND to_id = $me', { $me: me, $t: them.id })) {
      if (await full(me)) return res.status(400).json({ error: `You can have up to ${MAX_FRIENDS} friends.` });
      if (await full(them.id)) return res.status(400).json({ error: 'Their friend list is full.' });
      await db.run('INSERT INTO friends (user_id, friend_id) VALUES ($me, $t), ($t, $me) ON CONFLICT DO NOTHING', { $me: me, $t: them.id });
      await db.run(`DELETE FROM friend_requests WHERE (from_id = $me AND to_id = $t) OR (from_id = $t AND to_id = $me)`, { $me: me, $t: them.id });
      return res.json({ status: 'friends' });
    }
    if (await db.get('SELECT 1 AS x FROM friend_requests WHERE from_id = $me AND to_id = $t', { $me: me, $t: them.id }))
      return res.json({ status: 'sent' });
    if (await full(me)) return res.status(400).json({ error: `You can have up to ${MAX_FRIENDS} friends.` });
    if (await count('SELECT COUNT(*) AS n FROM friend_requests WHERE from_id = $me') >= MAX_SENT)
      return res.status(400).json({ error: 'You have too many requests waiting for an answer. Cancel some first.' });
    await db.run('INSERT INTO friend_requests (from_id, to_id) VALUES ($me, $t) ON CONFLICT DO NOTHING', { $me: me, $t: them.id });
    res.status(201).json({ status: 'sent' });
  });

  // declines a request they sent you, or cancels one you sent them → 204
  r.delete('/requests/:username', async (req, res) => {
    const them = await findUser(req.params.username);
    if (!them) return noSuchPlayer(res, req.params.username);
    await db.run(`DELETE FROM friend_requests WHERE (from_id = $me AND to_id = $t) OR (from_id = $t AND to_id = $me)`, { $me: req.user.id, $t: them.id });
    res.status(204).end();
  });

  // removes a friend, for both of you → 204
  r.delete('/:username', async (req, res) => {
    const them = await findUser(req.params.username);
    if (!them) return noSuchPlayer(res, req.params.username);
    await db.run(`DELETE FROM friends WHERE (user_id = $me AND friend_id = $t) OR (user_id = $t AND friend_id = $me)`, { $me: req.user.id, $t: them.id });
    res.status(204).end();
  });

  return r;
}
