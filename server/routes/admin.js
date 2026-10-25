// The control panel's server side (client/js/control.js): developers only (DEV_USERS).
// Live events (lib/boosts.js); looking a player up to give them shards, fix a rude display name
// or sign them out everywhere (giving packs stays in routes/gifts.js); and the Server section: who's on,
// how busy the database is, pausing online play, asking older games to reload and gifts for everyone (lib/maint.js).
import { Router } from 'express';
import { config } from '../config.js';
import { checkBoost } from '../lib/boosts.js';
import { levelOf } from '../lib/moments.js';
import { rateLimit } from '../lib/rateLimit.js';
import { cachedAuth, forgetUser, requireAuth } from '../lib/sessions.js';
import { checkGiftAll, MSG_MAX } from '../lib/maint.js';
import { cleanName } from '../lib/users.js';
import { MAX_WAITING } from './gifts.js';

export const SHARDS_MAX = 10000; // the most one gift of shards can be
const isDevUser = (u) => config.devUsers.includes(u.username.toLowerCase());
// 0.30.9 is older than 0.31.0; a game that didn't say isn't counted
export const verOlder = (a, b) => {
  if (!/^\d+\.\d+\.\d+$/.test(a ?? '') || !/^\d+\.\d+\.\d+$/.test(b ?? '')) return false;
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};

// boosts: lib/boosts.js, hub: lib/hub.js, maint: lib/maint.js, push: lib/push.js (null without alerts),
// live: the game's version (client/js/version.js), started: when the server started
export function adminRouter(db, hub, boosts, { maint, push, live, started } = {}) {
  const r = Router();
  const devOnly = (req, res, next) => (isDevUser(req.user) ? next() : res.status(403).json({ error: 'Only developers can use the control panel.' }));

  // the Server section's numbers. Signing in here trusts a recent session from memory (cachedAuth), so looking
  // doesn't wake the database by itself
  r.get('/server', cachedAuth(db), devOnly, async (req, res) => {
    await maint.ready;
    const w = db.watch, now = Date.now();
    res.set('Cache-Control', 'no-store');
    res.json({
      ...hub.stats((v) => verOlder(v, live)), alerts: push ? push.ids().length : null, started, live, now,
      db: { kind: db.kind, n: w?.n ?? 0, last: w?.last ?? 0, perHour: w?.perHour(now) ?? [] },
      pause: maint.pause(), reload: maint.reload(), gifts: maint.allGifts(),
    });
  });
  r.use(requireAuth(db), devOnly);
  const limit = rateLimit({ windowMs: 60 * 60 * 1000, max: 200, message: 'Too many changes. Try again later.' });
  const idOf = (req) => (/^\d{1,9}$/.test(req.params.id) ? Number(req.params.id) : -1);
  const findUser = (name) => db.get('SELECT * FROM users WHERE lower(username) = lower($u)', { $u: String(name ?? '') });
  const noSuchPlayer = (res) => res.status(404).json({ error: 'There\'s no player by that name.' });

  /* ---------- live events ---------- */
  // → { boosts: [newest first], now }
  r.get('/boosts', async (req, res) => {
    await boosts.ready;
    res.set('Cache-Control', 'no-store');
    res.json({ boosts: boosts.all(), now: Date.now() });
  });
  // { xp, shards, raise, start (ms, null = now), end (ms) } → { boost }. One starting now ends the one running
  r.post('/boosts', limit, async (req, res) => {
    await boosts.ready;
    const c = checkBoost(req.body);
    if (c.error) return res.status(400).json({ error: c.error });
    res.json({ boost: await boosts.add(req.user.id, req.user.display_name, c.boost) });
  });
  r.post('/boosts/:id/end', limit, async (req, res) => {
    await boosts.ready;
    const boost = await boosts.end(idOf(req));
    if (!boost) return res.status(404).json({ error: 'That event is gone.' });
    res.json({ boost });
  });

  /* ---------- players ---------- */
  // ?q= part of a username or display name → { players: [{ username, displayName, level, shards, cards, online, createdAt }] }
  r.get('/players', async (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 20);
    if (!q) return res.json({ players: [] });
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await db.all(`SELECT u.*, s.data FROM users u LEFT JOIN user_saves s ON s.user_id = u.id
      WHERE lower(u.username) LIKE $q ESCAPE '\\' OR lower(u.display_name) LIKE $q ESCAPE '\\' ORDER BY lower(u.username) LIMIT 20`, { $q: like });
    res.json({
      players: rows.map((u) => {
        let s = {};
        try { s = (u.data && JSON.parse(u.data)) || {}; } catch { /* a broken save shows zeros */ }
        const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
        return {
          username: u.username, displayName: u.display_name, level: levelOf(n(s.xp)), shards: n(s.shards),
          cards: Array.isArray(s.seen) ? s.seen.length : 0, online: !!hub?.hasLine(Number(u.id)), createdAt: u.created_at,
        };
      }),
    });
  });

  // { displayName } → { displayName }: a rude name, changed
  r.patch('/players/:name', limit, async (req, res) => {
    const u = await findUser(req.params.name);
    if (!u) return noSuchPlayer(res);
    const name = cleanName(req.body?.displayName);
    if (!name) return res.status(400).json({ error: 'Enter a name.' });
    await db.run('UPDATE users SET display_name = $d, updated_at = $now WHERE id = $u', { $d: name, $now: new Date().toISOString(), $u: u.id });
    forgetUser(Number(u.id));
    hub?.bump(Number(u.id), 'fr'); // their own game loads their account again on its next check
    res.json({ displayName: name });
  });

  // signs them out on every device
  r.post('/players/:name/signout', limit, async (req, res) => {
    const u = await findUser(req.params.name);
    if (!u) return noSuchPlayer(res);
    await db.run('DELETE FROM sessions WHERE user_id = $u', { $u: u.id });
    forgetUser(Number(u.id));
    hub?.notify(Number(u.id), { k: 'out' }); // an open game checks in now and finds itself signed out
    res.status(204).end();
  });

  // { shards } → 204. Waits like a gift pack until their game takes it (routes/gifts.js)
  r.post('/players/:name/shards', limit, async (req, res) => {
    const u = await findUser(req.params.name);
    if (!u) return noSuchPlayer(res);
    const n = Number(req.body?.shards);
    if (!Number.isInteger(n) || n < 1 || n > SHARDS_MAX) return res.status(400).json({ error: `Give between 1 and ${SHARDS_MAX.toLocaleString('en-US')} shards.` });
    const waiting = await db.get('SELECT COUNT(*) AS n FROM gifts WHERE to_id = $to', { $to: u.id });
    if (Number(waiting.n) >= MAX_WAITING) return res.status(429).json({ error: 'They have too many gifts waiting.' });
    await db.run('INSERT INTO gifts (to_id, from_name, pack, shards, created_at) VALUES ($to, $n, $p, $s, $now)',
      { $to: u.id, $n: req.user.display_name, $p: 'shards', $s: n, $now: new Date().toISOString() });
    hub?.bump(Number(u.id), 'gi');
    res.status(204).end();
  });

  /* ---------- the Server section ---------- */
  // { on, msg } -> { pause }: Host and Join show msg instead of starting a game; Solo and Couch are untouched
  r.put('/server/pause', limit, async (req, res) => {
    await maint.ready;
    const on = req.body?.on === true, msg = String(req.body?.msg ?? '');
    if (on && msg.length > MSG_MAX) return res.status(400).json({ error: `Keep the message to ${MSG_MAX} characters.` });
    await maint.setPause(on ? msg : null, req.user.display_name);
    res.json({ pause: maint.pause() });
  });
  // -> { reload }: every game older than the live version shows "a new version is ready", once
  r.post('/server/reload', limit, async (req, res) => {
    await maint.ready;
    if (!live) return res.status(500).json({ error: 'The server does not know its version.' });
    await maint.askReload(live);
    res.json({ reload: maint.reload() });
  });
  // { pack } or { shards } -> { gift }: every game picks it up once, in the next week
  r.post('/server/gifts', limit, async (req, res) => {
    await maint.ready;
    const c = checkGiftAll(req.body);
    if (c.error) return res.status(400).json({ error: c.error });
    res.json({ gift: await maint.giveAll(c.gift, req.user.id, req.user.display_name) });
  });
  r.post('/server/gifts/:id/end', limit, async (req, res) => {
    await maint.ready;
    const gift = await maint.endGift(idOf(req));
    if (!gift) return res.status(404).json({ error: 'That gift is gone.' });
    res.json({ gift });
  });

  return r;
}
