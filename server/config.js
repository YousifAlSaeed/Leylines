import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '127.0.0.1',
  clientDir: here('../client'),
  dbFile: process.env.DB_FILE || here('./data/leylines.sqlite'),
};
