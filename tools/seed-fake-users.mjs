// Fill the TEST site's database with fake players, so the leaderboard, friends and Friends' news have
// something in them. Never for the live database: fake players there would be seen by real ones.
//
//   node tools/seed-fake-users.mjs            add 30 fake players
//   node tools/seed-fake-users.mjs 80         add 80 (at most 200 a run)
//   node tools/seed-fake-users.mjs --remove   delete every fake player, and everything of theirs
//
// It asks for (or reads from the environment):
//   SEED_DB        the dev Postgres's public URL (Railway → the dev Postgres → Connect → Public URL), or the
//                  path of a local .sqlite file to try it out. Paste it, never type it into a command, so the
//                  password stays out of the shell history.
//   SEED_FRIEND    your own username on the test site: some fakes become your friends, a few send you
//                  friend requests. Blank = none.
//   SEED_PASSWORD  one password for every fake, so you can sign in as one. Blank = a random one, printed.
//
// Fake usernames start with "fk_", which is how --remove finds them; their display names look normal.
// Each gets a believable save (XP, cards, a hand, wins and losses), its leaderboard row (server/lib/board.js),
// a few fake friends, and some get Friends' news moments with reactions. Before writing anything it shows
// which database it reached and who is in it, and you type "dev" to go on. It stops by itself when the
// database has more real players than the test site should.
import readline from 'node:readline/promises';
import { openDatabase } from '../server/db/index.js';
import { hashPassword } from '../server/lib/password.js';
import { syncBoard } from '../server/lib/board.js';
import { LEGENDS, TITLE_AT, REACTIONS, levelOf } from '../server/lib/moments.js';

const PREFIX = 'fk_';
const MAX_REAL = 15; // more real accounts than this and it's probably the live database
const CARDS = 55; // client/js/data.js CARD_DATA
const STARTER = [0, 1, 2, 3, 4, 5, 6, 7, 13]; // client/js/save.js
const COLS = ['blue', 'teal', 'green', 'gold', 'purple', 'grey']; // server/lib/users.js MY_COLS
const NAMES = ['Ember', 'Wren', 'Juniper', 'Moss', 'Sable', 'Quill', 'Hollow', 'Bramble', 'Ash', 'Lark', 'Rook', 'Fennel',
  'Cobalt', 'Thistle', 'Marrow', 'Vesper', 'Pike', 'Saffron', 'Tallow', 'Indigo', 'Corvid', 'Briar', 'Nettle', 'Ochre',
  'Rowan', 'Sorrel', 'Flint', 'Hazel', 'Kestrel', 'Lumen', 'Mira', 'Nox', 'Oriel', 'Pyre', 'Quince', 'Rune', 'Sage',
  'Tamsin', 'Umber', 'Vale', 'Willow', 'Yarrow', 'Zephyr', 'Alder', 'Birch', 'Cinder', 'Dusk', 'Elm', 'Fable', 'Gale',
  'Heron', 'Ivy', 'Jasper', 'Kip', 'Linden', 'Maple', 'Nim', 'Onyx', 'Pip', 'Reed', 'Slate', 'Tansy', 'Vireo', 'Wisp'];
const TAILS = ['', '', '', '7', '42', '99', 'x', 'TCG', 'Main', 'Jr', '2'];

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const daysAgo = (d) => new Date(Date.now() - d * 864e5 - rnd(864e5)).toISOString();
const lvlXp = (n) => 50 * n * (n - 1); // client/js/data.js
const results = (n, winRate) => Array.from({ length: n }, () => (Math.random() < 0.06 ? 'd' : Math.random() < winRate ? 'w' : 'l'));
const why = (err) => err.message || err.errors?.map((e) => e.message).join('; ') || err.code || String(err);
const local = (host) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);

// Railway's public address has no sslmode and a self-signed certificate: encrypt, but don't check it (as tools/copy-db.mjs)
function tidy(url) {
  url = url.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/, '$1verify-full');
  if (!/[?&]sslmode=/.test(url) && !local(new URL(url).hostname)) url += (url.includes('?') ? '&' : '?') + 'sslmode=no-verify';
  return url;
}

// a save the game would believe: the client fills in every field left out (client/js/save.js normSave)
function fakeSave(name) {
  // most players are low level, a few are far along
  const lv = 1 + Math.floor(Math.random() ** 2 * 24);
  const xp = lvlXp(lv) + rnd(lvlXp(lv + 1) - lvlXp(lv));
  const skill = 0.3 + Math.random() * 0.45;
  const online = rnd(lv * 6), solo = rnd(lv * 10) + 3;
  const split = (n) => { const w = Math.round(n * skill), d = Math.round(n * 0.05); return [w, d, Math.max(0, n - w - d)]; };
  const [ow, od, ol] = split(online), [w, d, l] = split(solo);
  // cards: the starters, then more and stronger the higher the level; 5★ ones only far along
  const reach = Math.min(CARDS, 9 + lv * 2);
  const extra = shuffle([...Array(reach).keys()].filter((c) => !STARTER.includes(c) && (!LEGENDS.has(c) || lv >= 12)))
    .slice(0, 3 + rnd(lv * 2));
  const seen = [...new Set([...STARTER, ...extra])].sort((a, b) => a - b);
  const coll = Object.fromEntries(seen.map((c) => [c, 1 + (Math.random() < 0.3 ? rnd(3) : 0)]));
  const best = [...seen].sort((a, b) => b - a);
  const hand = best.slice(0, 5);
  const orecent = results(Math.min(10, online), skill);
  let ostreak = 0;
  for (let i = orecent.length - 1; i >= 0 && orecent[i] === 'w'; i--) ostreak++;
  return {
    pv: 2, tut: 2, name, xp, packLv: levelOf(xp), seen, coll,
    stats: { w, l, d, ow, ol, od },
    loadouts: [{ name: 'Main', ids: hand }, null, null], mainLo: 0, lastDeck: hand,
    avatar: { c: pick(best.slice(0, 8)), r: rnd(6) }, col: pick(COLS), showcase: best.slice(0, 3),
    streak: rnd(4), best: 1 + rnd(8), ostreak, obest: Math.max(ostreak, rnd(Math.max(1, Math.round(online / 4)))),
    recent: results(Math.min(10, solo), skill), orecent, beat: lv >= 10 ? 2 : lv >= 4 ? 1 : rnd(2) - 1,
    shards: 50 + rnd(900),
  };
}

async function ask(rl, env, label) {
  return (process.env[env] ?? (await rl.question(label))).trim();
}

async function main() {
  const remove = process.argv.includes('--remove');
  const count = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 30);
  if (!(count >= 1 && count <= 200)) throw new Error('Give a number of fake players from 1 to 200.');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let db;
  try {
    const where = await ask(rl, 'SEED_DB', 'Dev database (Postgres public URL, or a local .sqlite file): ');
    if (!where) throw new Error('No database given.');
    const pg = /^postgres(ql)?:\/\//.test(where);
    db = await openDatabase(pg ? { url: tidy(where) } : { file: where });
    const host = pg ? new URL(where).hostname + ':' + (new URL(where).port || 5432) : where;

    // look before writing anything
    const real = await db.all(`SELECT username FROM users WHERE substr(username, 1, 3) <> $p ORDER BY id`, { $p: PREFIX });
    const fakes = await db.all(`SELECT username FROM users WHERE substr(username, 1, 3) = $p`, { $p: PREFIX });
    console.log(`\nConnected to ${host}`);
    console.log(`  ${real.length} real account(s)${real.length ? ': ' + real.slice(0, 8).map((u) => u.username).join(', ') + (real.length > 8 ? ', …' : '') : ''}`);
    console.log(`  ${fakes.length} fake account(s)`);
    if (real.length > MAX_REAL) {
      throw new Error(`That's more than ${MAX_REAL} real players: this looks like the LIVE database. Nothing was changed.`);
    }
    if ((await ask(rl, 'SEED_SURE', `\nIs this the TEST site's database? Type "dev" to ${remove ? 'delete the fakes' : `add ${count} fakes`}: `)) !== 'dev') {
      throw new Error('Not confirmed. Nothing was changed.');
    }

    if (remove) {
      // everything of theirs goes with them (ON DELETE CASCADE)
      const { changes } = await db.run(`DELETE FROM users WHERE substr(username, 1, 3) = $p`, { $p: PREFIX });
      console.log(`\nDone: ${changes} fake player(s) deleted.`);
      return;
    }

    const friendName = await ask(rl, 'SEED_FRIEND', 'Your username on the test site, to befriend (blank = none): ');
    const me = friendName ? await db.get('SELECT id, username FROM users WHERE lower(username) = lower($u)', { $u: friendName }) : null;
    if (friendName && !me) throw new Error(`There's no "${friendName}" on this database. Nothing was changed.`);
    let password = await ask(rl, 'SEED_PASSWORD', 'Password for every fake (blank = a random one): ');
    const made = !password;
    if (made) password = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
    if (password.length < 8) throw new Error('Passwords need at least 8 characters.');
    rl.close();

    const hash = await hashPassword(password); // one hash for all: it's the same password anyway
    const taken = new Set((await db.all('SELECT lower(username) AS u FROM users')).map((r) => r.u));
    const users = [];
    console.log('');
    for (let i = 0; i < count; i++) {
      let display, username, tries = 0;
      do {
        display = (pick(NAMES) + pick(TAILS)).slice(0, 16);
        username = (PREFIX + display + (tries > 3 ? rnd(1000) : '')).replace(/[^A-Za-z0-9_]/g, '').slice(0, 20);
        tries++;
      } while (taken.has(username.toLowerCase()));
      taken.add(username.toLowerCase());
      const save = fakeSave(display);
      const joined = daysAgo(1 + rnd(60));
      const { rows: [u] } = await db.run(
        `INSERT INTO users (username, display_name, password_hash, created_at, updated_at) VALUES ($u, $d, $h, $at, $at) RETURNING id`,
        { $u: username, $d: display, $h: hash, $at: joined });
      await db.run('INSERT INTO user_saves (user_id, data, updated_at) VALUES ($u, $d, $at)',
        { $u: u.id, $d: JSON.stringify(save), $at: daysAgo(rnd(5)) });
      await syncBoard(db, u.id, save);
      users.push({ id: u.id, username, save });
      console.log(`  ${username.padEnd(20)} level ${String(levelOf(save.xp)).padStart(2)}, ${save.seen.length} cards`);
    }

    // friends among the fakes: each has a few
    const friends = new Map(users.map((u) => [u.id, new Set()]));
    const befriend = async (a, b) => {
      await db.run('INSERT INTO friends (user_id, friend_id, created_at) VALUES ($a, $b, $at), ($b, $a, $at) ON CONFLICT DO NOTHING',
        { $a: a, $b: b, $at: daysAgo(rnd(30)) });
      friends.get(a)?.add(b); friends.get(b)?.add(a);
    };
    for (const u of users) {
      for (const o of shuffle(users).slice(0, 2 + rnd(3))) if (o.id !== u.id) await befriend(u.id, o.id);
    }
    // you: friends with about a third of them, and requests from three more
    let mine = 0, asks = 0;
    if (me) {
      const order = shuffle(users);
      for (const u of order.slice(0, Math.max(1, Math.round(users.length / 3)))) { await befriend(me.id, u.id); mine++; }
      for (const u of order.slice(mine, mine + 3)) {
        await db.run('INSERT INTO friend_requests (from_id, to_id, created_at) VALUES ($f, $t, $at) ON CONFLICT DO NOTHING',
          { $f: u.id, $t: me.id, $at: daysAgo(rnd(3)) });
        asks++;
      }
    }

    // Friends' news: moments from the last week (the feed shows 7 days), with friends' reactions
    let moments = 0;
    for (const u of users) {
      const s = u.save, lv = levelOf(s.xp), list = [];
      const legend = s.seen.find((c) => LEGENDS.has(c));
      if (legend != null) list.push({ kind: 'card', key: `c${legend}`, data: { c: legend } });
      const title = TITLE_AT.filter((t) => t <= lv).pop();
      if (title) list.push({ kind: 'title', key: `t${title}`, data: { lv: title } });
      if (s.ostreak >= 5) list.push({ kind: 'streak', key: `s-fake-${u.id}`, data: { n: s.ostreak - (s.ostreak % 5) } });
      for (const m of shuffle(list).slice(0, 1 + rnd(2))) {
        if (Math.random() < 0.4) continue;
        const { rows: [row] } = await db.run(
          `INSERT INTO moments (user_id, kind, mkey, data, created_at) VALUES ($u, $k, $key, $d, $at)
           ON CONFLICT (user_id, kind, mkey) DO NOTHING RETURNING id`,
          { $u: u.id, $k: m.kind, $key: m.key, $d: JSON.stringify(m.data), $at: daysAgo(rnd(6)) });
        if (!row) continue;
        moments++;
        for (const f of shuffle([...friends.get(u.id)]).slice(0, rnd(4))) {
          if (f === me?.id) continue; // your own reactions are yours to give
          await db.run('INSERT INTO moment_reactions (moment_id, user_id, emoji, created_at) VALUES ($m, $u, $e, $at) ON CONFLICT DO NOTHING',
            { $m: row.id, $u: f, $e: pick(REACTIONS), $at: new Date().toISOString() });
        }
      }
    }

    console.log(`\nDone: ${users.length} fake players, ${moments} news moments.`);
    if (me) console.log(`${me.username} is now friends with ${mine} of them and has ${asks} friend request(s).`);
    if (made) console.log(`Their password: ${password}  (any fk_ username works with it)`);
    console.log('Remove them all with: node tools/seed-fake-users.mjs --remove');
  } finally {
    rl.close();
    await db?.close();
  }
}

main().catch((err) => {
  console.error('\nStopped: ' + why(err));
  process.exitCode = 1;
});
