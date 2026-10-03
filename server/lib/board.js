// The leaderboard table: the numbers a save is ranked by, kept next to it.
// Saves are written by the player's own device, so these are only as honest as
// that device; good enough for a board among friends.
import { cardId, publicProfile } from './users.js';

// Bump when boardRow() changes: rows written by an older version are redone from their save.
export const BOARD_V = 1;

// a save → the leaderboard row's values. Streak and results are online matches only.
export function boardRow(save) {
  const s = save && typeof save === 'object' ? save : {};
  const p = publicProfile(s);
  const five = (ids) => Array.isArray(ids) && ids.length === 5 && ids.every(cardId);
  const lo = Array.isArray(s.loadouts) && Number.isInteger(s.mainLo) ? s.loadouts[s.mainLo] : null;
  const hand = five(lo?.ids) ? lo.ids : five(s.lastDeck) ? s.lastDeck : null;
  return {
    xp: p.xp, wins: p.stats.ow, losses: p.stats.ol, draws: p.stats.od, best: p.obest,
    cards: new Set(p.seen).size, recent: p.orecent.join(''), hand: hand ? JSON.stringify(hand) : '',
  };
}

// writes a player's row from their save (an object)
export async function syncBoard(db, userId, save) {
  const b = boardRow(save);
  await db.run(
    `INSERT INTO leaderboard (user_id, xp, wins, losses, draws, best, cards, recent, hand, v, updated_at)
     VALUES ($u, $xp, $w, $l, $d, $best, $cards, $recent, $hand, $v, $now)
     ON CONFLICT (user_id) DO UPDATE SET xp = excluded.xp, wins = excluded.wins, losses = excluded.losses,
       draws = excluded.draws, best = excluded.best, cards = excluded.cards, recent = excluded.recent,
       hand = excluded.hand, v = excluded.v, updated_at = excluded.updated_at`,
    { $u: userId, $xp: b.xp, $w: b.wins, $l: b.losses, $d: b.draws, $best: b.best, $cards: b.cards,
      $recent: b.recent, $hand: b.hand, $v: BOARD_V, $now: new Date().toISOString() },
  );
}

// saves written before the leaderboard existed, or before its last change, get their row (re)made
export async function fillBoard(db) {
  const missing = await db.all(`SELECT s.user_id, s.data FROM user_saves s LEFT JOIN leaderboard b ON b.user_id = s.user_id
    WHERE b.user_id IS NULL OR b.v < $v`, { $v: BOARD_V });
  for (const m of missing) {
    let data = null;
    try { data = JSON.parse(m.data); } catch { /* a broken save ranks as empty */ }
    await syncBoard(db, m.user_id, data);
  }
}
