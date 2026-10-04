// What the game checks every few seconds (routes/pulse.js), kept in memory so
// those checks don't touch the database: who's on the main menu, game invites,
// and a counter per player that goes up when their friends or forfeits change.
// It all resets when the server restarts; a new `boot` tells games to load
// everything again. Good for one server process, like rateLimit.js.
import crypto from 'node:crypto';

export const ONLINE_MS = 15 * 1000;  // a game that hasn't checked in for this long is gone
export const INVITE_MS = 60 * 1000;  // how long an invite waits for an answer
export const MAX_INVITES = 5;        // waiting for any one player

export function createHub() {
  const boot = crypto.randomBytes(6).toString('hex');
  const vers = new Map();     // user id → { fr, fo }
  const seen = new Map();     // user id → { at, menu }
  const invites = new Map();  // user id → [{ fromId, from, name, code, at }]
  const declined = new Map(); // user id → [display names who said no]
  const friends = new Map();  // user id → [{ id, username }], until their friends change

  const ver = (id) => vers.get(id) ?? { fr: 0, fo: 0 };
  const live = (list) => (list ?? []).filter((i) => Date.now() - i.at < INVITE_MS);

  // drop players who left, so the maps can't grow forever
  setInterval(() => {
    const old = Date.now() - 10 * 60 * 1000;
    for (const [id, s] of seen) if (s.at < old) { seen.delete(id); friends.delete(id); }
    for (const [id, l] of invites) { const k = live(l); if (k.length) invites.set(id, k); else invites.delete(id); }
  }, 60 * 1000).unref();

  return {
    boot,
    ver,
    // kind: 'fr' (friend list or requests) or 'fo' (a forfeit is waiting)
    bump(id, kind) {
      const v = { ...ver(id) };
      v[kind]++;
      vers.set(id, v);
      if (kind === 'fr') friends.delete(id);
    },
    checkIn(id, menu) { seen.set(id, { at: Date.now(), menu: !!menu }); },
    onMenu(id) { const s = seen.get(id); return !!s && s.menu && Date.now() - s.at < ONLINE_MS; },
    friendsOf: (id) => friends.get(id),
    keepFriends: (id, list) => friends.set(id, list),

    invite(toId, inv) {
      const l = live(invites.get(toId)).filter((i) => i.fromId !== inv.fromId);
      if (l.length >= MAX_INVITES) return false;
      invites.set(toId, [...l, { ...inv, at: Date.now() }]);
      return true;
    },
    invitesFor(id) { const l = live(invites.get(id)); if (l.length) invites.set(id, l); else invites.delete(id); return l; },
    // the player said no (or joined): the invite goes; a no reaches the sender
    answer(toId, fromId, code, no, name) {
      const l = invites.get(toId) ?? [];
      const hit = l.find((i) => i.fromId === fromId && i.code === code);
      if (!hit) return false;
      invites.set(toId, l.filter((i) => i !== hit));
      if (no) declined.set(fromId, [...(declined.get(fromId) ?? []), name].slice(-5));
      return true;
    },
    // the sender closed the room
    cancel(fromId, code) {
      for (const [id, l] of invites) invites.set(id, l.filter((i) => !(i.fromId === fromId && i.code === code)));
    },
    takeDeclined(id) { const l = declined.get(id) ?? []; declined.delete(id); return l; },
  };
}
