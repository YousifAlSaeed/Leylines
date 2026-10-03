// The leaderboard: everyone (anyone can look) or you and your friends (signed in).
// Ranked from the leaderboard table, which saves keep up to date (lib/board.js).
import { Router } from 'express';
import { fillBoard } from '../lib/board.js';
import { optionalAuth } from '../lib/sessions.js';
import { publicProfile, publicUser } from '../lib/users.js';

export const BOARD_SIZE = 50;
// ?by= → the column it ranks by (only these names ever reach the SQL)
const BY = { level: 'xp', wins: 'wins', streak: 'best', cards: 'cards' };

export function leaderboardRouter(db) {
  const r = Router();
  r.use(optionalAuth(db));
  let filled = null; // saves from before the leaderboard get their rows once

  // ?by=level|wins|streak|cards &show=all|friends &q=name
  // → { by, show, rows: [player], me: player | null, counts: { all, friends } }
  // A player is { rank, username, displayName, avatar, xp, wins, losses, draws, best, cards, recent, hand }.
  // Equal numbers share a rank. me is you, wherever you are on the board.
  r.get('/', async (req, res) => {
    const by = BY[req.query.by] ? req.query.by : 'level', col = BY[by];
    const show = req.query.show === 'friends' ? 'friends' : 'all';
    const me = req.user?.id ?? null;
    if (show === 'friends' && !me) return res.status(401).json({ error: 'Sign in to see your friends.' });
    await (filled ??= fillBoard(db).catch((e) => { filled = null; throw e; }));

    const scope = show === 'friends' ? 'WHERE b.user_id = $me OR b.user_id IN (SELECT friend_id FROM friends WHERE user_id = $me)' : '';
    // ties keep a steady order: more XP first, then by name
    const ranked = `WITH s AS (SELECT b.*, RANK() OVER (ORDER BY b.${col} DESC) AS rank FROM leaderboard b ${scope})
      SELECT s.*, u.id, u.username, u.display_name, u.created_at, sv.data FROM s JOIN users u ON u.id = s.user_id
      LEFT JOIN user_saves sv ON sv.user_id = s.user_id`;
    const order = `ORDER BY s.rank, s.xp DESC, lower(u.display_name), u.id`;
    // a search matches the start of a username or display name; % and _ are taken literally
    const q = String(req.query.q ?? '').trim().replace(/^@/, '').slice(0, 20).toLowerCase();
    const like = q.replace(/[!%_]/g, (c) => '!' + c) + '%';
    const find = q ? `WHERE lower(u.username) LIKE $q ESCAPE '!' OR lower(u.display_name) LIKE $q ESCAPE '!'` : '';
    const params = { ...(me && { $me: me }), ...(q && { $q: like }) };

    const [rows, mine, all, friends] = await Promise.all([
      db.all(`${ranked} ${find} ${order} LIMIT ${BOARD_SIZE}`, params),
      me ? db.get(`${ranked} WHERE s.user_id = $me`, { $me: me }) : null,
      db.get('SELECT COUNT(*) AS n FROM leaderboard'),
      me ? db.get('SELECT COUNT(*) AS n FROM leaderboard b WHERE b.user_id = $me OR b.user_id IN (SELECT friend_id FROM friends WHERE user_id = $me)', { $me: me }) : null,
    ]);
    // Number(): Postgres returns RANK() and COUNT(*) as strings
    res.json({ by, show, rows: rows.map(player), me: mine ? player(mine) : null,
      counts: { all: Number(all?.n ?? 0), friends: friends ? Number(friends.n) : null } });
  });

  return r;
}

function player(row) {
  let save = null;
  try { save = row.data && JSON.parse(row.data); } catch { /* a broken save just shows no avatar */ }
  let hand = null;
  try { hand = row.hand ? JSON.parse(row.hand) : null; } catch { /* written by board.js, so this can't happen */ }
  return {
    rank: Number(row.rank), ...publicUser(row), avatar: publicProfile(save).avatar,
    xp: row.xp, wins: row.wins, losses: row.losses, draws: row.draws, best: row.best, cards: row.cards,
    recent: row.recent, hand,
  };
}
