// Moments: news about a player that their friends see on the menu (client/js/menu.js hubFriends). They're made
// here by comparing a save with the one before it (routes/me.js), so the game sends nothing extra. Saves come
// from the player's own device, so moments are only as honest as it is, like the leaderboard (board.js).

// 5★ cards: levels 9–10 in client/js/data.js CARD_DATA. test/moments.test.js checks these still match the game
export const LEGENDS = new Set([47, 48, 49, 50, 51, 52, 53, 54]);
// the levels a new title starts at (client/js/profile.js TITLES, after Wanderer at 1) and the XP a level needs (data.js lvlXp)
export const TITLE_AT = [3, 5, 8, 12, 16, 20];
const lvlXp = (n) => 50 * n * (n - 1);
export function levelOf(xp) { let n = 1; while (lvlXp(n + 1) <= xp) n++; return n; }
// the emojis friends can react with, one each per moment
export const REACTIONS = ['🔥', '😮', '👏', '😂'];
// a win streak online makes a moment every this many wins
export const STREAK_STEP = 5;
const KEEP_DAYS = 14; // moments older than this are deleted
const FEED_DAYS = 7;  // the feed shows this far back
const FEED_MAX = 30;

const obj = (v) => (v && typeof v === 'object' ? v : {});
const nat = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
// today's Gauntlet won all the way (client/js/daily.js dailyStatus)
const cleared = (t) => { const g = obj(obj(t).g); return !!(g.run && g.over && g.stage >= 3); };

// what happened between two saves: [{ kind, key, data }]. key keeps the same moment from being made twice
export function momentsBetween(prev, next, day = new Date().toISOString().slice(0, 10)) {
  const p = obj(prev), n = obj(next), out = [];
  // a 5★ card found for the first time (at most three from one save)
  const had = new Set(Array.isArray(p.seen) ? p.seen : []);
  const found = [...new Set(Array.isArray(n.seen) ? n.seen : [])].filter((c) => LEGENDS.has(c) && !had.has(c)).slice(0, 3);
  for (const c of found) out.push({ kind: 'card', key: `c${c}`, data: { c } });
  // a new title: only the highest one if a save jumped past several
  const from = levelOf(nat(p.xp)), to = levelOf(nat(n.xp));
  const title = TITLE_AT.filter((t) => from < t && to >= t).pop();
  if (title) out.push({ kind: 'title', key: `t${title}`, data: { lv: title } });
  // today's Gauntlet cleared
  const nt = obj(n.trial), pt = obj(p.trial);
  if (Number.isInteger(nt.at) && cleared(nt) && !(cleared(pt) && pt.at === nt.at)) out.push({ kind: 'gauntlet', key: `g${nt.at}`, data: {} });
  // every STREAK_STEP online wins in a row
  const s0 = Math.floor(nat(p.ostreak) / STREAK_STEP), s1 = Math.floor(nat(n.ostreak) / STREAK_STEP);
  if (s1 > s0) out.push({ kind: 'streak', key: `s${day}-${s1}`, data: { n: s1 * STREAK_STEP } });
  return out;
}

// a save was written: its moments are added, and the player's friends' games told to load their lists again
// (pulse.js). Nothing on a first save, and nothing from a player who hides their history from others
export async function addMoments(db, hub, userId, prev, next) {
  if (!prev || obj(next).hideHist) return;
  const list = momentsBetween(prev, next);
  if (!list.length) return;
  const now = new Date();
  let added = 0;
  for (const m of list) {
    const r = await db.run(`INSERT INTO moments (user_id, kind, mkey, data, created_at) VALUES ($u, $k, $key, $d, $at)
      ON CONFLICT (user_id, kind, mkey) DO NOTHING`, { $u: userId, $k: m.kind, $key: m.key, $d: JSON.stringify(m.data), $at: now.toISOString() });
    added += r.changes;
  }
  // old moments go, with their reactions
  await db.run('DELETE FROM moments WHERE created_at < $cut', { $cut: new Date(now - KEEP_DAYS * 864e5).toISOString() });
  if (!added) return;
  const friends = await db.all('SELECT friend_id FROM friends WHERE user_id = $u', { $u: userId });
  for (const f of friends) hub?.bump(f.friend_id, 'fr');
}

// your friends' moments from the last week, newest first: { id, username, kind, data, at, re: { emoji: count }, mine }
export async function friendMoments(db, me) {
  const p = { $me: me, $since: new Date(Date.now() - FEED_DAYS * 864e5).toISOString() };
  const rows = await db.all(`SELECT m.id, m.kind, m.data, m.created_at, u.username FROM moments m
    JOIN friends f ON f.friend_id = m.user_id AND f.user_id = $me JOIN users u ON u.id = m.user_id
    WHERE m.created_at >= $since ORDER BY m.created_at DESC, m.id DESC LIMIT ${FEED_MAX}`, p);
  if (!rows.length) return [];
  const re = await db.all(`SELECT r.moment_id, r.emoji, COUNT(*) AS n, MAX(CASE WHEN r.user_id = $me THEN 1 ELSE 0 END) AS mine
    FROM moment_reactions r JOIN moments m ON m.id = r.moment_id JOIN friends f ON f.friend_id = m.user_id AND f.user_id = $me
    WHERE m.created_at >= $since GROUP BY r.moment_id, r.emoji`, p);
  return rows.map((m) => {
    let data = {};
    try { data = JSON.parse(m.data); } catch { /* shown without its details */ }
    const mine = re.filter((x) => Number(x.moment_id) === Number(m.id));
    return {
      id: Number(m.id), username: m.username, kind: m.kind, data, at: m.created_at,
      re: Object.fromEntries(mine.map((x) => [x.emoji, Number(x.n)])),
      mine: mine.find((x) => Number(x.mine))?.emoji ?? null,
    };
  });
}

// your reaction to a friend's moment: an emoji from REACTIONS, or null (or the one you already gave) to take it back.
// → { re, mine }, or null when it isn't a friend's moment
export async function reactTo(db, me, id, emoji) {
  const m = await db.get(`SELECT m.id FROM moments m JOIN friends f ON f.friend_id = m.user_id AND f.user_id = $me WHERE m.id = $id`,
    { $me: me, $id: id });
  if (!m) return null;
  const cur = await db.get('SELECT emoji FROM moment_reactions WHERE moment_id = $id AND user_id = $me', { $id: id, $me: me });
  if (!emoji || cur?.emoji === emoji) await db.run('DELETE FROM moment_reactions WHERE moment_id = $id AND user_id = $me', { $id: id, $me: me });
  else await db.run(`INSERT INTO moment_reactions (moment_id, user_id, emoji, created_at) VALUES ($id, $me, $e, $at)
    ON CONFLICT (moment_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at`,
    { $id: id, $me: me, $e: emoji, $at: new Date().toISOString() });
  const re = await db.all('SELECT emoji, COUNT(*) AS n FROM moment_reactions WHERE moment_id = $id GROUP BY emoji', { $id: id });
  const mine = await db.get('SELECT emoji FROM moment_reactions WHERE moment_id = $id AND user_id = $me', { $id: id, $me: me });
  return { re: Object.fromEntries(re.map((x) => [x.emoji, Number(x.n)])), mine: mine?.emoji ?? null };
}
