// Push alerts: a device turns them on or off here (client/js/alerts.js);
// lib/push.js sends them.
import { Router } from 'express';
import { rateLimit } from '../lib/rateLimit.js';
import { requireAuth } from '../lib/sessions.js';

// the browsers' push services. The server only ever sends to these, so a made-up
// "device" can't point it at some other address.
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.apple.com', 'push.services.mozilla.com', 'notify.windows.com'];
export function pushHostOk(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}
const key = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200 && /^[A-Za-z0-9_=-]+$/.test(v);

export function pushRouter(db, push) {
  const r = Router();
  const limit = rateLimit({ windowMs: 60 * 60 * 1000, max: 60, message: 'Too many tries. Try again later.' });

  // → { key } (null: this server sends no alerts)
  r.get('/key', (req, res) => res.json({ key: push ? push.publicKey : null }));

  // { sub: { endpoint, keys: { p256dh, auth } } } → 204
  r.post('/subscribe', limit, requireAuth(db), async (req, res) => {
    if (!push) return res.status(503).json({ error: 'Alerts are not set up on this server.' });
    const sub = req.body?.sub;
    if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000 || !pushHostOk(sub.endpoint) || !key(sub.keys?.p256dh) || !key(sub.keys?.auth))
      return res.status(400).json({ error: 'This browser sent an alert setup the game can\'t use.' });
    await push.add(req.user.id, sub);
    res.status(204).end();
  });

  // { endpoint } → 204
  r.post('/unsubscribe', limit, requireAuth(db), async (req, res) => {
    const { endpoint } = req.body ?? {};
    if (push && typeof endpoint === 'string') await push.remove(req.user.id, endpoint);
    res.status(204).end();
  });

  return r;
}
