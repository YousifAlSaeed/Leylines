// Announcements: posts a developer (DEV_USERS) writes to every player, read from the megaphone on the menu
// (client/js/announce.js). Every post is kept in memory, loaded once when the server starts, so a game asking
// for them never wakes the database; only writing one does. A post's push alert goes out when it starts.

export const KINDS = ['event', 'update', 'break', 'thanks'];
// how loud, any mix of them: note = a number on the megaphone until it's read, banner = a card on the menu
// until it's closed, big = a popup once
export const SHOWS = ['note', 'banner', 'big'];
// who sees it: every player, signed-in players, or games older than `ver` (to tell them to reload)
export const WHO = ['all', 'signed', 'old'];
export const TITLE_MAX = 60;
export const BODY_MAX = 400;
export const MAX_DAYS = 60;  // the longest a post can show for
export const KEEP = 100;     // posts kept (the newest); older ones are only in the database
const VER = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const DAY = 864e5;

// control characters out (a message keeps its line breaks)
const clean = (s, lines) => String(s).replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, '').trim();
// a message as plain text, for a push alert (no **bold** marks)
export const plain = (s) => String(s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1').replace(/\s+/g, ' ').trim();

// a body from the writing screen → { post } or { error }. signs: the names a post may be signed with.
// A draft only needs a title; a post going out needs its message, and an end that hasn't passed.
export function checkPost(b, signs, now = Date.now()) {
  b = b && typeof b === 'object' ? b : {};
  const draft = b.draft === true;
  const title = typeof b.title === 'string' ? clean(b.title) : '';
  const body = typeof b.body === 'string' ? clean(b.body, true).replace(/\n{3,}/g, '\n\n') : '';
  if (!title) return { error: 'Give it a title.' };
  if (title.length > TITLE_MAX) return { error: `Keep the title to ${TITLE_MAX} characters.` };
  if (!body && !draft) return { error: 'Write a message.' };
  if (body.length > BODY_MAX) return { error: `Keep the message to ${BODY_MAX} characters.` };
  if (!KINDS.includes(b.kind)) return { error: 'Pick what kind of post it is.' };
  const show = Array.isArray(b.show) ? SHOWS.filter((s) => b.show.includes(s)) : [];
  if (!show.length) return { error: 'Pick at least one of Note, Banner and Big.' };
  if (!WHO.includes(b.who)) return { error: 'Pick who sees it.' };
  const ver = b.who === 'old' ? String(b.ver ?? '') : '';
  if (b.who === 'old' && !VER.test(ver)) return { error: 'Bad version.' };
  if (!signs.includes(b.by)) return { error: 'Pick who it\'s from.' };
  const start = b.start == null ? now : Number(b.start), end = Number(b.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { error: 'Bad dates.' };
  if (end <= start) return { error: 'It has to end after it starts.' };
  if (end - start > MAX_DAYS * DAY) return { error: `A post can show for ${MAX_DAYS} days at most.` };
  if (!draft && end <= now) return { error: 'That end time has already passed.' };
  // an alert can't reach a game by its version, so "older games" posts never send one
  const alert = b.alert === true && b.who !== 'old';
  return { post: { title, body, kind: b.kind, show, who: b.who, ver, by: b.by, alert, draft, start: Math.round(start), end: Math.round(end) } };
}

const row2post = (r) => {
  let d = {};
  try { d = JSON.parse(r.data); } catch { /* a broken row shows as an empty draft */ }
  return {
    id: Number(r.id), title: d.title ?? '', body: d.body ?? '', kind: d.kind ?? 'update', show: d.show ?? ['note'], who: d.who ?? 'all',
    ver: d.ver ?? '', by: d.by ?? '', alert: !!d.alert, draft: !!Number(r.draft), alerted: !!Number(r.alerted),
    start: Date.parse(r.starts_at), end: Date.parse(r.ends_at), at: Date.parse(r.created_at),
  };
};
// what players get
const pub = ({ id, title, body, kind, show, who, ver, by, start, end }) => ({ id, title, body, kind, show, who, ver, by, start, end });
const iso = (t) => new Date(t).toISOString();
const dataOf = (p) => JSON.stringify({ title: p.title, body: p.body, kind: p.kind, show: p.show, who: p.who, ver: p.ver, by: p.by, alert: p.alert });

// hub: lib/hub.js (tells open games), push: lib/push.js (null when alerts are off)
export function createNews(db, hub, push) {
  let posts = []; // newest first
  const timers = new Map(); // post id → the timer that sends its alert when it starts

  // its push alert, once, to everyone with alerts on. alerted is set first, so a second copy of the server
  // (a deploy starting up) can't send it again
  async function sendAlert(p) {
    timers.delete(p.id);
    try {
      const { changes } = await db.run('UPDATE news SET alerted = 1 WHERE id = $id AND alerted = 0', { $id: p.id });
      p.alerted = true;
      if (!changes || !push) return;
      await push.ready;
      const msg = { title: p.title, body: plain(p.body).slice(0, 140), tag: `news${p.id}`, url: `./?news=${p.id}` };
      await Promise.all(push.ids().map((id) => push.notify(id, msg)));
    } catch (e) { console.error('news: alert failed', e.message); }
  }
  function schedule(p) {
    clearTimeout(timers.get(p.id));
    timers.delete(p.id);
    const now = Date.now();
    if (!push || !p.alert || p.alerted || p.draft || p.end <= now) return;
    const wait = p.start - now;
    if (wait <= 0) { sendAlert(p); return; }
    // further off than a timer can wait (24 days): the next start of the server sets it
    if (wait < 2 ** 31 - 1) { const t = setTimeout(() => sendAlert(p), wait); t.unref?.(); timers.set(p.id, t); }
  }
  const changed = () => hub?.newsChanged?.();

  const ready = db.all(`SELECT * FROM news ORDER BY id DESC LIMIT ${KEEP}`)
    .then((rows) => { posts = rows.map(row2post); posts.forEach(schedule); })
    .catch((e) => console.error('news: could not load posts', e.message));

  const find = (id) => posts.find((p) => p.id === id);
  async function put(row) {
    const p = row2post(row);
    const i = posts.findIndex((x) => x.id === p.id);
    if (i >= 0) { clearTimeout(timers.get(p.id)); timers.delete(p.id); posts[i] = p; } else posts = [p, ...posts].slice(0, KEEP);
    schedule(p);
    changed();
    return p;
  }

  return {
    ready,
    // showing now, newest first, as players get them
    live: (now = Date.now()) => posts.filter((p) => !p.draft && p.start <= now && p.end > now).map(pub),
    // when the next scheduled post starts (a game asks again then), or null
    next(now = Date.now()) {
      const t = posts.filter((p) => !p.draft && p.start > now).map((p) => p.start);
      return t.length ? Math.min(...t) : null;
    },
    // every post, for the writing screen
    all: () => posts.map((p) => ({ ...p })),
    get: find,
    async add(authorId, p) {
      const now = iso(Date.now());
      const { rows: [row] } = await db.run(
        `INSERT INTO news (author_id, data, draft, starts_at, ends_at, alerted, created_at, updated_at)
         VALUES ($a, $d, $dr, $s, $e, 0, $now, $now) RETURNING *`,
        { $a: authorId, $d: dataOf(p), $dr: p.draft ? 1 : 0, $s: iso(p.start), $e: iso(p.end), $now: now },
      );
      return put(row);
    },
    // → the post, or null when there's no such post
    async edit(id, p) {
      if (!find(id)) return null;
      const { rows: [row] } = await db.run(
        `UPDATE news SET data = $d, draft = $dr, starts_at = $s, ends_at = $e, updated_at = $now WHERE id = $id RETURNING *`,
        { $id: id, $d: dataOf(p), $dr: p.draft ? 1 : 0, $s: iso(p.start), $e: iso(p.end), $now: iso(Date.now()) },
      );
      return row ? put(row) : null;
    },
    // stops showing it now
    async end(id) {
      const p = find(id);
      if (!p) return null;
      const now = Date.now();
      const { rows: [row] } = await db.run('UPDATE news SET ends_at = $e, updated_at = $e WHERE id = $id RETURNING *',
        { $id: id, $e: iso(Math.max(p.start + 1, Math.min(p.end, now))) });
      return row ? put(row) : null;
    },
    async remove(id) {
      if (!find(id)) return false;
      await db.run('DELETE FROM news WHERE id = $id', { $id: id });
      clearTimeout(timers.get(id));
      timers.delete(id);
      posts = posts.filter((p) => p.id !== id);
      changed();
      return true;
    },
  };
}
