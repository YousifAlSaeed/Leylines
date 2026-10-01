import express from 'express';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { usersRouter } from './routes/users.js';

export function createApp({ db, clientDir, corsOrigins = ['*'], trustProxy = 0 }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  const api = express.Router();
  // lets a copy of the client hosted elsewhere (GitHub Pages) call this API
  api.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && (corsOrigins.includes('*') || corsOrigins.includes(origin))) {
      res.set('Access-Control-Allow-Origin', corsOrigins.includes('*') ? '*' : origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
