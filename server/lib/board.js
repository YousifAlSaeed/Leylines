// The leaderboard table: the numbers a save is ranked by, kept next to it.
// Saves are written by the player's own device, so these are only as honest as
// that device; good enough for a board among friends.
import { cardId, publicProfile } from './users.js';

// a save → the leaderboard row's values
export function boardRow(save) {
  const s = save && typeof save === 'object' ? save : {};
  const p = publicProfile(s);
  const five = (ids) => Array.isArray(ids) && ids.length === 5 && ids.every(cardId);
  const lo = Array.isArray(s.loadouts) && Number.isInteger(s.mainLo) ? s.loadouts[s.mainLo] : null;
  const hand = five(lo?.ids) ? lo.ids : five(s.lastDeck) ? s.lastDeck : null;
  return {
    xp: p.xp, wins: p.stats.ow, losses: p.stats.ol, draws: p.stats.od, best: p.best,
    cards: new Set(p.seen).size, recent: p.recent.join(''), hand: hand ? JSON.stringify(hand) : '',
  };
}

// writes a player's row from their save (an object)
export async function syncBoard(db, userId, save) {
  const b = boardRow(save);
  await db.run(
    `INSERT INTO leaderboard (user_id, xp, wins, losses, draws, best, cards, recent, hand, updated_at)
     VALUES ($u, $xp, $w, $l, $d, $best, $cards, $recent, $hand, $now)
     ON CONFLICT (user_id) DO UPDATE SET xp = excluded.xp, wins = excluded.wins, losses = excluded.losses,
       draws = excluded.draws, best = excluded.best, cards = excluded.cards, recent = excluded.recent,
       hand = excluded.hand, updated_at = excluded.updated_at`,
    { $u: userId, $xp: b.xp, $w: b.wins, $l: b.losses, $d: b.draws, $best: b.best, $cards: b.cards,
      $recent: b.recent, $hand: b.hand, $now: new Date().toISOString() },
  );
}

// saves written before the leaderboard existed get their row
export async function fillBoard(db) {
  const missing = await db.all('SELECT s.user_id, s.data FROM user_saves s LEFT JOIN leaderboard b ON b.user_id = s.user_id WHERE b.user_id IS NULL');
  for (const m of missing) {
    let data = null;
    try { data = JSON.parse(m.data); } catch { /* a broken save ranks as empty */ }
    await syncBoard(db, m.user_id, data);
  }
}
