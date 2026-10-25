import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { authRouter } from './routes/auth.js';
import { createHub } from './lib/hub.js';
import { createPusher } from './lib/push.js';
import { startDailyAlerts } from './lib/dailyAlerts.js';
import { forfeitsRouter } from './routes/forfeits.js';
import { friendsRouter } from './routes/friends.js';
import { giftsRouter } from './routes/gifts.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { adminRouter } from './routes/admin.js';
import { createBoosts } from './lib/boosts.js';
import { watchDb } from './lib/dbWatch.js';
import { createMaint } from './lib/maint.js';
import { meRouter } from './routes/me.js';
import { newsRouter } from './routes/news.js';
import { pulseRouter } from './routes/pulse.js';
import { pushRouter } from './routes/push.js';
import { usersRouter } from './routes/users.js';

// pushSend: replaces the real push delivery (tests)
export function createApp({ db, clientDir, corsOrigins = ['*'], trustProxy = 0, pushSend }) {
  const app = express();
  const started = Date.now();
  watchDb(db); // counts the database's questions for the control panel (lib/dbWatch.js)
  // the game's version, from the file the game itself reads (client/js/version.js)
  let live = '';
  try { live = /VERSION='([\d.]+)'/.exec(fs.readFileSync(path.join(clientDir, 'js/version.js'), 'utf8'))?.[1] ?? ''; } catch { /* unknown */ }
  const push = createPusher(db, { send: pushSend }); // push alerts (lib/push.js), null without VAPID keys
  const hub = createHub(push); // presence, invites and change counters (lib/hub.js)
  app.locals.dailyAlerts = startDailyAlerts(db, push, hub, { timer: !pushSend }); // the evening reminder (lib/dailyAlerts.js)
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  // browser safety headers: no framing (clickjacking), scripts only from this site and the PeerJS CDNs,
  // network calls only to this site and the PeerJS server used for online play
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://unpkg.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self' https://*.peerjs.com wss://*.peerjs.com",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ].join('; ');
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  const api = express.Router();
  // lets a copy of the client hosted elsewhere (GitHub Pages) call this API
  api.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && (corsOrigins.includes('*') || corsOrigins.includes(origin))) {
      res.set('Access-Control-Allow-Origin', corsOrigins.includes('*') ? '*' : origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });
  api.use(express.json({ limit: '100kb' }));
  api.get('/health', (req, res) => res.json({ ok: true }));
  // the game's clock: daily packs and the Daily tab go by this, not the device's clock
  api.get('/time', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ now: Date.now() }); });
  api.use('/auth', authRouter(db));
  api.use('/me', meRouter(db, hub));
  api.use('/users', usersRouter(db));
  api.use('/friends', friendsRouter(db, hub));
  api.use('/forfeits', forfeitsRouter(db, hub));
  api.use('/gifts', giftsRouter(db, hub));
  api.use('/pulse', pulseRouter(db, hub));
  api.use('/push', pushRouter(db, push, app.locals.dailyAlerts));
  api.use('/leaderboard', leaderboardRouter(db));
  const boosts = createBoosts(db, hub); // live events: ×2 or ×3 XP and shards (lib/boosts.js)
  const maint = createMaint(db, hub); // pausing online play, asking older games to reload, gifts for everyone (lib/maint.js)
  api.use('/news', newsRouter(db, hub, push, boosts, maint));
  api.use('/admin', adminRouter(db, hub, boosts, { maint, push, live, started }));
  api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  // malformed JSON and other request errors come back as JSON, not an HTML page
  api.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Server error.' : err.message });
  });
  app.use('/api', api);

  // the game's "What's new" reads the changelog (on GitHub Pages it's one folder up from the game, at the same relative path)
  app.get('/CHANGELOG.md', (req, res) => res.type('text/markdown; charset=utf-8').sendFile(path.resolve(clientDir, '../CHANGELOG.md')));
  // the game itself: plain static files, the same ones GitHub Pages serves
  app.use(express.static(clientDir));
  return app;
}
