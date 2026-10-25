// Counts the questions the server asks the database, for the control panel's Server section (routes/admin.js).
// Neon's free plan bills the hours the database is awake, and it sleeps after 5 minutes with no questions,
// so "when was it last asked" says whether it's asleep. Kept in memory: it starts over with the server.

const HOUR = 3600e3;
export const WATCH_HOURS = 8; // the chart's hours

// wraps db.all / get / run in place → { n, last, perHour(now) }
export function watchDb(db) {
  if (db.watch) return db.watch;
  const w = { n: 0, last: 0, hours: new Map() };
  for (const k of ['all', 'get', 'run']) {
    const f = db[k].bind(db);
    db[k] = (...a) => {
      const now = Date.now(), h = Math.floor(now / HOUR);
      w.n++; w.last = now;
      w.hours.set(h, (w.hours.get(h) ?? 0) + 1);
      if (w.hours.size > 48) for (const old of [...w.hours.keys()].filter((x) => x < h - 24)) w.hours.delete(old);
      return f(...a);
    };
  }
  // questions in each of the last WATCH_HOURS hours, oldest first (the last one is this hour so far)
  w.perHour = (now = Date.now()) => {
    const h = Math.floor(now / HOUR);
    return Array.from({ length: WATCH_HOURS }, (_, i) => w.hours.get(h - WATCH_HOURS + 1 + i) ?? 0);
  };
  db.watch = w;
  return w;
}
