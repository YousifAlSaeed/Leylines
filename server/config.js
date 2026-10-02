import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export const config = {
  port: Number(process.env.PORT) || 3000,
  // Render sets RENDER=true; it can only reach the app on 0.0.0.0
  host: process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1'),
  clientDir: here('../client'),
  // Postgres connection string (for example from Neon). When set it is used
  // instead of the SQLite file, and accounts survive restarts and redeploys.
  databaseUrl: process.env.DATABASE_URL || '',
  dbFile: process.env.DB_FILE || here('./data/leylines.sqlite'),
  // origins allowed to call the API from another site, comma-separated ("*" = any).
  // Sign-in uses a bearer token, not cookies, so "*" doesn't open up CSRF.
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean),
  // behind a proxy (Render, Fly...) set TRUST_PROXY=1 so rate limits see the real client IP
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  sessionDays: Number(process.env.SESSION_DAYS) || 60,
  // secret for encrypting stored emails (any long random string; Render can generate one). Lose it and saved emails can't be read
  emailKey: process.env.EMAIL_KEY || '',
  // usernames that get the developer tools in the game (unlock all cards…), comma-separated
  devUsers: (process.env.DEV_USERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
};
