// The check an open game makes (client/js/pulse.js). It says whether the
// player is free to play, and hears back what changed: friend requests, a
// forfeit from a match they left, game invites, and which friends are free now
// (so they can be invited). The live line (GET /stream) tells the game the
// moment any of that changes, so it checks right away instead of waiting.
// Nearly all of it comes from memory (lib/hub.js), so these checks stay cheap.
import { Router } from 'express';
import { rateLimit } from '../lib/rateLimit.js';
import { INVITE_MS } from '../lib/hub.js';
import { cachedAuth } from '../lib/sessions.js';

const CODE_RE = /^[A-Z]{5}$/;

export function pulseRouter(db, hub) {
  const r = Router();
  r.use(cachedAuth(db));
  const limit = rateLimit({ windowMs: 60 * 60 * 1000, max: 120, message: 'Too many invites. Try again later.' });

  // your friends' ids and usernames, from memory until your friend list changes
  const friendsOf = async (id) => {
    let l = hub.friendsOf(id);
    if (!l) {
      l = await db.all('SELECT u.id, u.username FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = $me', { $me: id });
      hub.keepFriends(id, l);
    }
    return l;
  };
  // a player became free or stopped being free: their friends check again now
  const tellFriends = async (id) => { for (const f of await friendsOf(id)) hub.notify(f.id, { k: 'on' }); };
  const findFriend = async (me, name) => (await friendsOf(me)).find((f) => f.username.toLowerCase() === String(name ?? '').toLowerCase());

  // { menu } → { boot, fr, fo, online: [usernames], invites: [{ from, name, code, left }], declined: [names] }
  r.post('/', async (req, res) => {
    const me = req.user.id;
    if (hub.checkIn(me, req.body?.menu === true)) await tellFriends(me);
    const online = (await friendsOf(me)).filter((f) => hub.onMenu(f.id)).map((f) => f.username);
    const now = Date.now();
    res.set('Cache-Control', 'no-store');
    res.json({
      boot: hub.boot, ...hub.ver(me), online,
      invites: hub.invitesFor(me).map((i) => ({ from: i.from, name: i.name, code: i.code, left: Math.max(0, Math.round((i.at + INVITE_MS - now) / 1000)) })),
      declined: hub.takeDeclined(me),
    });
  });

  // the live line: a text/event-stream that sends {k} whenever something for you changes, and a comment every 20s to keep it open
  r.get('/stream', (req, res) => {
    const me = req.user.id;
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(': hi\n\n');
    // null: this player opened too many lines, so the oldest one is closed
    const send = (msg) => { if (msg === null) res.end(); else res.write(`data: ${JSON.stringify(msg)}\n\n`); };
    const close = hub.listen(me, send);
    const beat = setInterval(() => res.write(': \n\n'), 20 * 1000);
    res.on('close', () => { clearInterval(beat); if (close()) tellFriends(me).catch(() => {}); });
  });

  // { to: username, code } → 204. Only to a friend who's free to play right now.
  r.post('/invite', limit, async (req, res) => {
    const { to, code } = req.body ?? {};
    if (typeof code !== 'string' || !CODE_RE.test(code)) return res.status(400).json({ error: 'Bad game code.' });
    const f = await findFriend(req.user.id, to);
    if (!f) return res.status(404).json({ error: 'You can only invite your friends.' });
    if (!hub.onMenu(f.id)) return res.status(409).json({ error: 'They just started playing or went offline. Try again in a moment.' });
    if (!hub.invite(f.id, { fromId: req.user.id, from: req.user.username, name: req.user.display_name, code }))
      return res.status(429).json({ error: 'They have too many invites waiting.' });
    res.status(204).end();
  });

  // { from: username, code, no } → 204. Joining or saying no takes the invite down; a no is passed on.
  r.post('/invite/answer', async (req, res) => {
    const { from, code, no } = req.body ?? {};
    const f = await findFriend(req.user.id, from);
    if (f && typeof code === 'string') hub.answer(req.user.id, f.id, code, no === true, req.user.display_name);
    res.status(204).end();
  });

  // { code } → 204. The room you invited them to is closed.
  r.post('/invite/cancel', async (req, res) => {
    const { code } = req.body ?? {};
    if (typeof code === 'string') hub.cancel(req.user.id, code);
    res.status(204).end();
  });

  return r;
}
