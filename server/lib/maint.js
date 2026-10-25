// The control panel's Server section (routes/admin.js): pausing online play, asking older games to reload,
// and gifts for every player. All of it reaches the games with the announcements (routes/news.js), from memory:
// it's loaded once when the server starts, so a game asking never wakes the database.

export const GIFT_DAYS = 7;      // how long a game has to pick up a gift for everyone
export const MSG_MAX = 120;
export const PACKS = ['spark', 'arcane', 'ley', 'mythic']; // client/js/data.js PACKS
export const SHARDS_MAX = 10000;
const iso = (t) => new Date(t).toISOString();
const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();

// a gift for everyone from the control panel → { gift } or { error }
export function checkGiftAll(b) {
  b = b && typeof b === 'object' ? b : {};
  if (b.pack != null) return PACKS.includes(b.pack) ? { gift: { pack: b.pack, shards: 0 } } : { error: 'Bad pack.' };
  const n = Number(b.shards);
  if (!Number.isInteger(n) || n < 1 || n > SHARDS_MAX) return { error: `Give between 1 and ${SHARDS_MAX.toLocaleString('en-US')} shards.` };
  return { gift: { pack: null, shards: n } };
}

// hub: lib/hub.js, to tell open games
export function createMaint(db, hub) {
  const flags = new Map(); // 'pause' → { msg, by, at }, 'reload' → { v, at }
  let gifts = [];          // newest first: { id, pack, shards, by, at, end }
  const changed = () => hub?.newsChanged?.();
  const row2gift = (r) => {
    let d = {};
    try { d = JSON.parse(r.data); } catch { /* a broken row gives nothing */ }
    return { id: Number(r.id), pack: d.pack ?? null, shards: d.shards ?? 0, by: d.by ?? '', at: Date.parse(r.created_at), end: Date.parse(r.ends_at) };
  };
  const ready = Promise.all([
    db.all('SELECT * FROM flags').then((rows) => rows.forEach((r) => { try { flags.set(r.k, JSON.parse(r.v)); } catch { /* skip it */ } })),
    db.all('SELECT * FROM team_gifts ORDER BY id DESC LIMIT 20').then((rows) => { gifts = rows.map(row2gift); }),
  ]).catch((e) => console.error('maint: could not load', e.message));

  async function setFlag(k, v) {
    if (v == null) { await db.run('DELETE FROM flags WHERE k = $k', { $k: k }); flags.delete(k); }
    else {
      await db.run(`INSERT INTO flags (k, v, updated_at) VALUES ($k, $v, $now)
        ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`, { $k: k, $v: JSON.stringify(v), $now: iso(Date.now()) });
      flags.set(k, v);
    }
    changed();
  }

  return {
    ready,
    // what every game gets: { pause: message or null, reload: { v, at } or null, gifts: [the ones still open] }
    live(now = Date.now()) {
      const p = flags.get('pause');
      return {
        pause: p ? p.msg : null,
        reload: flags.get('reload') ?? null,
        gifts: gifts.filter((g) => g.end > now).map(({ id, pack, shards, at, end }) => ({ id, pack, shards, at, end })),
      };
    },
    pause: () => flags.get('pause') ?? null,
    reload: () => flags.get('reload') ?? null,
    allGifts: () => gifts.map((g) => ({ ...g })),
    // msg: what Host and Join say instead; null turns it back on
    setPause: (msg, by) => setFlag('pause', msg == null ? null : { msg: clean(msg).slice(0, MSG_MAX) || 'Online play is paused for a moment. Solo and Couch still work.', by, at: Date.now() }),
    // games older than v show "a new version is ready", once for this ask
    askReload: (v) => setFlag('reload', { v, at: Date.now() }),
    async giveAll(g, authorId, by) {
      const now = Date.now();
      const { rows: [row] } = await db.run(
        'INSERT INTO team_gifts (author_id, data, ends_at, created_at) VALUES ($a, $d, $e, $now) RETURNING *',
        { $a: authorId, $d: JSON.stringify({ ...g, by }), $e: iso(now + GIFT_DAYS * 864e5), $now: iso(now) },
      );
      gifts = [row2gift(row), ...gifts].slice(0, 20);
      changed();
      return row2gift(row);
    },
    // stops it: games that haven't picked it up yet won't
    async endGift(id) {
      const g = gifts.find((x) => x.id === id);
      if (!g) return null;
      g.end = Math.min(g.end, Date.now());
      await db.run('UPDATE team_gifts SET ends_at = $e WHERE id = $id', { $id: id, $e: iso(g.end) });
      changed();
      return { ...g };
    },
  };
}
