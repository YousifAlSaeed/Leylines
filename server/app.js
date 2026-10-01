import express from 'express';
import { usersRouter } from './routes/users.js';

export function createApp({ db, clientDir }) {
  const app = express();
  app.disable('x-powered-by');

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.get('/health', (req, res) => res.json({ ok: true }));
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
