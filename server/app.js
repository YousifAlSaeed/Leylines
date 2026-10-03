import express from 'express';
import { authRouter } from './routes/auth.js';
import { friendsRouter } from './routes/friends.js';
import { meRouter } from './routes/me.js';
import { usersRouter } from './routes/users.js';

export function createApp({ db, clientDir, corsOrigins = ['*'], trustProxy = 0 }) {
  const app = express();
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
  api.use('/auth', authRouter(db));
  api.use('/me', meRouter(db));
  api.use('/users', usersRouter(db));
  api.use('/friends', friendsRouter(db));
  api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  // malformed JSON and other request errors come back as JSON, not an HTML page
  api.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Server error.' : err.message });
  });
  app.use('/api', api);

  // the game itself: plain static files, the same ones GitHub Pages serves
  app.use(express.static(clientDir));
  return app;
}
