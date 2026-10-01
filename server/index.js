// Leylines server: serves the client and the /api routes.
// The game is fully playable without it (open client/index.html or use GitHub
// Pages); the server is where accounts and other shared data will live.
import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { purgeExpiredSessions } from './lib/sessions.js';
import { createApp } from './app.js';

const db = await openDatabase(config.dbFile);
await purgeExpiredSessions(db);
const app = createApp({ db, clientDir: config.clientDir, corsOrigins: config.corsOrigins, trustProxy: config.trustProxy });

const server = app.listen(config.port, config.host, () => {
  console.log(`Leylines running at http://${config.host}:${config.port}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
