// Announcements (lib/news.js): anyone can read the posts showing now; only developers (DEV_USERS) can
// write, change or end them, from their profile in the game (client/js/announce.js).
import { Router } from 'express';
import { config } from '../config.js';
import { createNews, checkPost } from '../lib/news.js';
import { rateLimit } from '../lib/rateLimit.js';
import { requireAuth } from '../lib/sessions.js';

export const TEAM = 'The Leylines team';
const isDevUser = (u) => config.devUsers.includes(u.username.toLowerCase());

// boosts: lib/boosts.js, the live event that comes with the posts; maint: lib/maint.js, the Server section's switches
export function newsRouter(db, hub, push, boosts, maint) {
  const r = Router();
  const news = createNews(db, hub, push);
  const limit = rateLimit({ windowMs: 60 * 60 * 1000, max: 100, message: 'Too many changes. Try again later.' });
  const dev = [requireAuth(db), (req, res, next) => (isDevUser(req.user) ? next() : res.status(403).json({ error: 'Only developers can write announcements.' }))];
  // who a post can be from: each developer by their display name, all of them together, or the team
  async function signs() {
    const list = config.devUsers;
    const rows = list.length ? await db.all(`SELECT username, display_name FROM users WHERE lower(username) IN (${list.map((_, i) => `$d${i}`).join(', ')})`,
      Object.fromEntries(list.map((u, i) => [`$d${i}`, u]))) : [];
    const names = list.map((u) => rows.find((x) => x.username.toLowerCase() === u)?.display_name).filter(Boolean);
    return [...names, ...(names.length > 1 ? [`${names.slice(0, -1).join(', ')} and ${names.at(-1)}`] : []), TEAM];
  }
  const idOf = (req) => (/^\d{1,9}$/.test(req.params.id) ? Number(req.params.id) : -1);

  // → { posts: [showing now, newest first], boost: the live event or null, next: when the next post or event starts (ms)
  // or null, pause, reload, gifts (lib/maint.js), v }. From memory
  r.get('/', async (req, res) => {
    await Promise.all([news.ready, boosts?.ready, maint?.ready]);
    const now = Date.now(), next = [news.next(now), boosts?.next(now)].filter((t) => t != null);
    res.set('Cache-Control', 'no-store');
    res.json({ posts: news.live(now), boost: boosts?.current(now) ?? null, next: next.length ? Math.min(...next) : null,
      ...(maint ? maint.live(now) : { pause: null, reload: null, gifts: [] }), v: hub?.newsVer?.() ?? 0 });
  });

  // → { posts: [every post, drafts and ended ones too], signs: [names a post can be from], now }
  r.get('/all', ...dev, async (req, res) => {
    await news.ready;
    res.set('Cache-Control', 'no-store');
    res.json({ posts: news.all(), signs: await signs(), now: Date.now() });
  });

  // { title, body, kind, show, who, ver, by, alert, draft, start (ms, null = now), end (ms) } → { post }
  r.post('/', limit, ...dev, async (req, res) => {
    await news.ready;
    const c = checkPost(req.body, await signs());
    if (c.error) return res.status(400).json({ error: c.error });
    res.json({ post: await news.add(req.user.id, c.post) });
  });

  // the same as making one → { post }
  r.put('/:id', limit, ...dev, async (req, res) => {
    await news.ready;
    const c = checkPost(req.body, await signs());
    if (c.error) return res.status(400).json({ error: c.error });
    const post = await news.edit(idOf(req), c.post);
    if (!post) return res.status(404).json({ error: 'That post is gone.' });
    res.json({ post });
  });

  // stop showing it now → { post }
  r.post('/:id/end', limit, ...dev, async (req, res) => {
    await news.ready;
    const post = await news.end(idOf(req));
    if (!post) return res.status(404).json({ error: 'That post is gone.' });
    res.json({ post });
  });

  r.delete('/:id', limit, ...dev, async (req, res) => {
    await news.ready;
    if (!await news.remove(idOf(req))) return res.status(404).json({ error: 'That post is gone.' });
    res.status(204).end();
  });

  return r;
}
