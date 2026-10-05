// Push alerts (Web Push): a short message a phone or computer shows even when
// the game is closed, for an invite, a friend request or news about a match the
// player left. A device that turned alerts on in Settings has a row in
// push_subs; the browser's push service (Google, Apple, Mozilla) delivers it.
// Needs a VAPID key pair (config.js); without one, alerts are simply off.
import webpush from 'web-push';
import { config } from '../config.js';

export const MAX_DEVICES = 10; // per player

// send: replaces the real delivery (tests). Returns null when alerts are off.
export function createPusher(db, { send } = {}) {
  const keyed = !!(config.vapidPublic && config.vapidPrivate);
  if (!keyed && !send) return null;
  if (keyed) webpush.setVapidDetails(config.vapidSubject, config.vapidPublic, config.vapidPrivate);
  send ??= (sub, body, opts) => webpush.sendNotification(sub, body, opts);
  const site = config.appUrl;

  // who has alerts on, kept in memory so the frequent checks (routes/pulse.js) don't ask the database
  const users = new Set();
  const ready = db.all('SELECT DISTINCT user_id FROM push_subs WHERE site = $s', { $s: site })
    .then((rows) => rows.forEach((r) => users.add(Number(r.user_id))))
    .catch((e) => console.error('push: could not load devices', e.message));
  const recount = async (id) => {
    const n = Number((await db.get('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = $u AND site = $s', { $u: id, $s: site }))?.n ?? 0);
    if (n) users.add(id); else users.delete(id);
  };

  return {
    publicKey: config.vapidPublic || 'test-key',
    ready,
    has: (id) => users.has(id),
    // a device turned alerts on (or the same device signed in to another account)
    async add(id, { endpoint, keys }) {
      await db.run('DELETE FROM push_subs WHERE endpoint = $e', { $e: endpoint });
      await db.run(
        `INSERT INTO push_subs (user_id, site, endpoint, p256dh, auth, created_at) VALUES ($u, $s, $e, $p, $a, $now)`,
        { $u: id, $s: site, $e: endpoint, $p: keys.p256dh, $a: keys.auth, $now: new Date().toISOString() },
      );
      await db.run(
        `DELETE FROM push_subs WHERE user_id = $u AND id NOT IN
           (SELECT id FROM push_subs WHERE user_id = $u ORDER BY id DESC LIMIT ${MAX_DEVICES})`,
        { $u: id },
      );
      users.add(id);
    },
    async remove(id, endpoint) {
      await db.run('DELETE FROM push_subs WHERE user_id = $u AND endpoint = $e', { $u: id, $e: endpoint });
      await recount(id);
    },
    // { title, body, tag, url, ttl } to every device of theirs on this site. Never throws.
    // → { devices, sent, failed: [reasons] }
    async notify(id, { ttl = 24 * 3600, ...msg }) {
      const out = { devices: 0, sent: 0, failed: [] };
      if (!users.has(id)) return out;
      try {
        const rows = await db.all('SELECT * FROM push_subs WHERE user_id = $u AND site = $s', { $u: id, $s: site });
        const body = JSON.stringify(msg);
        let gone = false;
        out.devices = rows.length;
        await Promise.all(rows.map((r) => send({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, body, { TTL: ttl, urgency: 'high' })
          .then(() => { out.sent++; })
          .catch(async (e) => {
            out.failed.push(`${new URL(r.endpoint).hostname} ${e?.statusCode ?? ''} ${String(e?.body || e?.message || '').slice(0, 120)}`.trim());
            // the device turned alerts off, or the browser dropped it: forget it
            if (e?.statusCode === 404 || e?.statusCode === 410) {
              gone = true;
              await db.run('DELETE FROM push_subs WHERE id = $id', { $id: r.id });
            } else console.error('push: send failed', e?.statusCode ?? '', e?.message ?? e);
          })));
        if (gone) await recount(id);
      } catch (e) { console.error('push:', e.message); out.failed.push(e.message); }
      return out;
    },
  };
}
