// npm run db:init: create (or upgrade) the database file and exit.
import { config } from '../config.js';
import { openDatabase } from './index.js';

const db = await openDatabase(config.dbFile);
const tables = await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
db.close();
console.log(`Database ready at ${config.dbFile}`);
console.log(`Tables: ${tables.map((t) => t.name).join(', ')}`);
