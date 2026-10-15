// The daily reminder: one push alert a day, in the evening, to players with
// alerts on whose daily pack or Daily challenges are still waiting. It's on by
// default; Settings → Daily reminder turns it off (dailyAlert: false in the
// save). It reads their synced save, so it knows what they've done today. The
// day it last reminded each player is kept in daily_alerts, so a restart (or
// Render waking up) doesn't send it twice. A server that was asleep at REMIND_HOUR sends it
// when it wakes, if that's still the same game day.
import { config } from '../config.js';

const DAY_TZ = 3 * 3600e3;     // the game day starts at midnight UTC+3 (client/js/clock.js)
export const REMIND_HOUR = 18; // 6 pm game time, 6 hours before the new day
const EVERY = 10 * 60 * 1000;

// the game day as 'YYYY-MM-DD', like the client's today()
export const gameDay = (now) => new Date(now + DAY_TZ).toISOString().slice(0, 10);
const hourOf = (now) => new Date(now + DAY_TZ).getUTCHours();

// what's still waiting today in a save → { pack, left } (left: Daily challenges not yet played)
export function dailyWaiting(save, day) {
  const d = save?.daily, t = save?.trial;
  const pack = !d || typeof d.at !== 'string' || d.at < day;
  const fresh = !t || typeof t.at !== 'string' || t.at < day;
  const left = fresh ? 3 : (t.duel ? 0 : 1) + (t.puz ? 0 : 1) + (t.g?.run ? 0 : 1);
  return { pack, left };
}

export function reminderText({ pack, left }) {
  if (!pack && !left) return null;
  const ch = left === 3 ? 'today\'s Daily challenges' : left === 1 ? '1 Daily challenge' : `${left} Daily challenges`;
  if (pack && left) return `Your daily pack and ${ch} are waiting.`;
  if (pack) return 'Your daily pack is waiting. Open it before midnight.';
  return left === 3 ? 'Today\'s Daily Duel, Puzzle and Gauntlet are waiting.' : `${ch[0].toUpperCase() + ch.slice(1)} left today.`;
}

// push: lib/push.js, hub: lib/hub.js. → { tick(now), test(id) } (tests call tick themselves)
export function startDailyAlerts(db, push, hub, { timer = true } = {}) {
  const site = config.appUrl;
  let busy = false;
  async function tick(now = Date.now()) {
    if (!push || busy || hourOf(now) < REMIND_HOUR) return 0;
    busy = true;
    let n = 0;
    try {
      await push.ready;
      const day = gameDay(now);
      const ttl = Math.max(60, Math.round((864e5 - (now + DAY_TZ) % 864e5) / 1000)); // gone at midnight, when it's no longer true
      for (const id of push.ids()) {
        // the game is open in front of them: it shows the Daily dot itself. Try again next time
        if (!hub.byAlert(id)) continue;
        const done = await db.get('SELECT day FROM daily_alerts WHERE user_id = $u AND site = $s', { $u: id, $s: site });
        if (done?.day === day) continue;
        await db.run(
          `INSERT INTO daily_alerts (user_id, site, day) VALUES ($u, $s, $d)
           ON CONFLICT (user_id, site) DO UPDATE SET day = excluded.day`,
          { $u: id, $s: site, $d: day },
        );
        const row = await db.get('SELECT data FROM user_saves WHERE user_id = $u', { $u: id });
        if (!row) continue; // never played signed in
        let save;
        try { save = JSON.parse(row.data); } catch { continue; }
        if (save.dailyAlert === false) continue; // turned off in Settings (client/js/alerts.js)
        const body = reminderText(dailyWaiting(save, day));
        if (!body) continue;
        await push.notify(id, { title: 'Leylines', body, tag: 'daily', url: './?daily=1', ttl });
        n++;
      }
    } catch (e) { console.error('daily alerts:', e.message); }
    finally { busy = false; }
    return n;
  }
  // Settings → Daily reminder → Test (developer accounts, routes/push.js): this player's reminder now,
  // whatever the time, even if they had one today. With nothing waiting it sends a sample, so there's
  // always one to see. → push.notify's { devices, sent, failed }, plus waiting (false: it was the sample)
  async function test(id, now = Date.now()) {
    const row = await db.get('SELECT data FROM user_saves WHERE user_id = $u', { $u: id });
    let save = {};
    try { save = row ? JSON.parse(row.data) : {}; } catch { /* a sample, then */ }
    const real = reminderText(dailyWaiting(save, gameDay(now)));
    const body = real ?? reminderText({ pack: true, left: 3 });
    return { ...await push.notify(id, { title: 'Leylines', body, tag: 'daily', url: './?daily=1', ttl: 600 }), waiting: !!real };
  }
  if (timer && push) {
    setInterval(() => tick(), EVERY).unref();
    setTimeout(() => tick(), 30 * 1000).unref(); // soon after waking up, too
  }
  return { tick, test };
}
