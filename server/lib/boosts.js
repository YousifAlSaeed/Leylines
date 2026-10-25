// Live events: a developer multiplies the XP and the shards every match pays, ×2 or ×3, for a while (the control
// panel, client/js/control.js). The games do the multiplying (client/js/store.js); this only says what's on. Like
// announcements (lib/news.js), every event is kept in memory, loaded once when the server starts, and reaches the
// games with the announcements (routes/news.js), so checking for one never wakes the database.

export const MULTS = [1, 2, 3];
export const MAX_DAYS = 14; // the longest an event can run
export const KEEP = 50;
const DAY = 864e5;

// a body from the control panel → { boost } or { error }
export function checkBoost(b, now = Date.now()) {
  b = b && typeof b === 'object' ? b : {};
  const xp = Number(b.xp), shards = Number(b.shards);
  if (!MULTS.includes(xp) || !MULTS.includes(shards)) return { error: 'Pick ×1, ×2 or ×3.' };
  if (xp === 1 && shards === 1) return { error: 'Pick a boost for XP or shards first.' };
  const start = b.start == null ? now : Number(b.start), end = Number(b.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { error: 'Bad dates.' };
  if (end <= Math.max(start, now)) return { error: 'It has to end later than that.' };
  if (end - start > MAX_DAYS * DAY) return { error: `An event can run for ${MAX_DAYS} days at most.` };
  return { boost: { xp, shards, raise: b.raise === true && shards > 1, start: Math.round(start), end: Math.round(end) } };
}

const row2boost = (r) => {
  let d = {};
  try { d = JSON.parse(r.data); } catch { /* a broken row counts as ×1 */ }
  return { id: Number(r.id), xp: d.xp ?? 1, shards: d.shards ?? 1, raise: !!d.raise, by: d.by ?? '', start: Date.parse(r.starts_at), end: Date.parse(r.ends_at), at: Date.parse(r.created_at) };
};
const pub = ({ id, xp, shards, raise, start, end }) => ({ id, xp, shards, raise, start, end });
const iso = (t) => new Date(t).toISOString();

// hub: lib/hub.js, to tell open games (the same counter as announcements)
export function createBoosts(db, hub) {
  let list = []; // newest first
  const ready = db.all(`SELECT * FROM boosts ORDER BY id DESC LIMIT ${KEEP}`)
    .then((rows) => { list = rows.map(row2boost); })
    .catch((e) => console.error('boosts: could not load events', e.message));
  const changed = () => hub?.newsChanged?.();
  const live = (now) => list.find((b) => b.start <= now && b.end > now);

  return {
    ready,
    // the event running now, as the games get it, or null. Only one runs at a time: the newest
    current: (now = Date.now()) => { const b = live(now); return b ? pub(b) : null; },
    // when the next scheduled one starts, or null
    next(now = Date.now()) {
      const t = list.filter((b) => b.start > now && b.end - b.start > 1000).map((b) => b.start); // an ended one never starts
      return t.length ? Math.min(...t) : null;
    },
    all: () => list.map((b) => ({ ...b })),
    // starting one now ends the one running, so two never overlap
    async add(authorId, by, b) {
      const now = Date.now();
      if (b.start <= now) for (const old of list.filter((x) => x.start <= now && x.end > now)) await this.end(old.id, true);
      const { rows: [row] } = await db.run(
        'INSERT INTO boosts (author_id, data, starts_at, ends_at, created_at) VALUES ($a, $d, $s, $e, $now) RETURNING *',
        { $a: authorId, $d: JSON.stringify({ xp: b.xp, shards: b.shards, raise: b.raise, by }), $s: iso(b.start), $e: iso(b.end), $now: iso(now) },
      );
      list = [row2boost(row), ...list].slice(0, KEEP);
      changed();
      return row2boost(row);
    },
    // stops it now (a scheduled one never starts). quiet: the caller tells the games
    async end(id, quiet = false) {
      const b = list.find((x) => x.id === id);
      if (!b) return null;
      const end = Math.max(b.start + 1, Math.min(b.end, Date.now()));
      await db.run('UPDATE boosts SET ends_at = $e WHERE id = $id', { $id: id, $e: iso(end) });
      b.end = end;
      if (!quiet) changed();
      return { ...b };
    },
  };
}
