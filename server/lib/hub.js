// What the game checks (routes/pulse.js), kept in memory so those checks don't
// touch the database: who's free to play, game invites, and a counter per
// player that goes up when their friends, forfeits or gifts change. Games with the
// live line open (GET /pulse/stream) are told the moment anything changes.
// It all resets when the server restarts; a new `boot` tells games to load
// everything again. Good for one server process, like rateLimit.js.
import crypto from 'node:crypto';

export const ONLINE_MS = 15 * 1000;  // a game without the live line that hasn't checked in for this long is gone
export const AWAY_MS = 3 * 60 * 1000;  // a minimised game counts as online this long after its last check-in (a phone may be asleep)
export const MAX_LINES = 5;          // live lines per player (tabs, devices)
export const INVITE_MS = 2 * 60 * 1000; // how long an invite waits for an answer (time to pick up the phone after an alert)
export const MAX_INVITES = 5;        // waiting for any one player

// push: lib/push.js (null when alerts are off)
export function createHub(push = null) {
  const boot = crypto.randomBytes(6).toString('hex');
  const vers = new Map();     // user id → { fr, fo, gi }
  const seen = new Map();     // user id → { at, menu, away } (away: the game is minimised or in the background)
  const invites = new Map();  // user id → [{ fromId, from, name, code, at }]
  const declined = new Map(); // user id → [display names who said no]
  const friends = new Map();  // user id → [{ id, username }], until their friends change
  const lines = new Map();    // user id → Set of send(message) for their open live lines

  const ver = (id) => vers.get(id) ?? { fr: 0, fo: 0, gi: 0 };
  const live = (list) => (list ?? []).filter((i) => Date.now() - i.at < INVITE_MS);

  // drop players who left, so the maps can't grow forever
  setInterval(() => {
    const old = Date.now() - 10 * 60 * 1000;
    for (const [id, s] of seen) if (s.at < old) { seen.delete(id); friends.delete(id); }
    for (const [id, l] of invites) { const k = live(l); if (k.length) invites.set(id, k); else invites.delete(id); }
  }, 60 * 1000).unref();

  const hasLine = (id) => (lines.get(id)?.size ?? 0) > 0;
  const isAway = (id) => !!seen.get(id)?.away;
  // free to play. A minimised game keeps its line open, so it also has to have checked in lately: a phone asleep in a pocket can't answer
  const onMenu = (id) => {
    const s = seen.get(id);
    if (!s || !s.menu) return false;
    const ago = Date.now() - s.at;
    return hasLine(id) ? !s.away || ago < AWAY_MS : ago < ONLINE_MS;
  };
  const notify = (id, msg) => { for (const send of lines.get(id) ?? []) send(msg); };

  return {
    boot,
    ver,
    notify,
    hasLine,
    isAway,
    // the player turned alerts on (alerts.js)
    canAlert: (id) => !!push && push.has(id),
    // the game is closed or minimised but alerts are on: an alert reaches them
    byAlert: (id) => !!push && push.has(id) && (!hasLine(id) || isAway(id)),
    // a push alert, unless the game is open in front of them (it shows the news itself)
    alert(id, msg) { if (push && (!hasLine(id) || isAway(id))) push.notify(id, msg); },
    // a live line opened; the returned function closes it. → whether they stopped being free (their friends should hear)
    listen(id, send) {
      const set = lines.get(id) ?? new Set();
      if (set.size >= MAX_LINES) { const old = set.values().next().value; set.delete(old); old(null); }
      set.add(send);
      lines.set(id, set);
      return () => {
        const was = onMenu(id);
        set.delete(send);
        if (!set.size) { lines.delete(id); const s = seen.get(id); if (s) s.menu = false; }
        return was && !onMenu(id);
      };
    },
    // kind: 'fr' (friend list or requests), 'fo' (a forfeit is waiting) or 'gi' (a gift is waiting)
    bump(id, kind) {
      const v = { ...ver(id) };
      v[kind]++;
      vers.set(id, v);
      if (kind === 'fr') friends.delete(id);
      notify(id, { k: kind, v: v[kind] });
    },
    // → whether they became free, stopped being free, or went away or came back (their friends should hear)
    checkIn(id, menu, away = false) {
      const was = onMenu(id), wasAway = isAway(id);
      seen.set(id, { at: Date.now(), menu: !!menu, away: !!away });
      return was !== onMenu(id) || (onMenu(id) && wasAway !== !!away);
    },
    onMenu,
    friendsOf: (id) => friends.get(id),
    keepFriends: (id, list) => friends.set(id, list),

    invite(toId, inv) {
      const l = live(invites.get(toId)).filter((i) => i.fromId !== inv.fromId);
      if (l.length >= MAX_INVITES) return false;
      invites.set(toId, [...l, { ...inv, at: Date.now() }]);
      notify(toId, { k: 'inv' });
      return true;
    },
    invitesFor(id) { const l = live(invites.get(id)); if (l.length) invites.set(id, l); else invites.delete(id); return l; },
    // the player said no (or joined): the invite goes; a no reaches the sender
    answer(toId, fromId, code, no, name) {
      const l = invites.get(toId) ?? [];
      const hit = l.find((i) => i.fromId === fromId && i.code === code);
      if (!hit) return false;
      invites.set(toId, l.filter((i) => i !== hit));
      if (no) { declined.set(fromId, [...(declined.get(fromId) ?? []), name].slice(-5)); notify(fromId, { k: 'no' }); }
      return true;
    },
    // the sender closed the room
    cancel(fromId, code) {
      for (const [id, l] of invites) {
        const k = l.filter((i) => !(i.fromId === fromId && i.code === code));
        if (k.length !== l.length) { invites.set(id, k); notify(id, { k: 'inv' }); }
      }
    },
    takeDeclined(id) { const l = declined.get(id) ?? []; declined.delete(id); return l; },
  };
}
