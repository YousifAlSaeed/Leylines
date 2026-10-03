// Leaderboard: ranking by each stat, everyone vs friends, search, and saves keeping it current.
// Runs against a fresh in-memory database.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

Object.assign(process.env, { EMAIL_KEY: 'test-email-key-0123456789abcdefghij', APP_URL: 'https://game.test' });
delete process.env.RESEND_API_KEY;
delete process.env.RENDER;
const { openSqlite } = await import('../server/db/sqlite.js');
const { createApp } = await import('../server/app.js');
const { boardRow } = await import('../server/lib/board.js');

let db, server, base;
const T = {};
const save = (xp, ow, best, seen, more = {}) => ({ xp, stats: { w: 0, l: 0, d: 0, ow, ol: 2, od: 1 }, best, seen, recent: ['w', 'l', 'w'], ...more });
before(async () => {
  db = await openSqlite(null);
  server = createApp({ db, clientDir: fileURLToPath(new URL('../client', import.meta.url)) }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const players = {
    ana: save(900, 5, 2, [0, 1, 2]),
    bob: save(300, 9, 7, [0, 1, 2, 3, 4, 5], { avatar: { c: 3, r: 1 } }),
    cyd: save(300, 1, 4, [0]),
    dee_x: save(50, 0, 0, [0, 1]),
  };
  for (const [name, s] of Object.entries(players)) {
    const r = await api('/auth/signup', { method: 'POST', body: { username: name, password: `${name}-pass-1`, save: s } });
    T[name] = r.body.token;
  }
  // ana and bob are friends
  await api('/friends/requests', { method: 'POST', token: T.ana, body: { username: 'bob' } });
  await api('/friends/requests', { method: 'POST', token: T.bob, body: { username: 'ana' } });
});
after(() => server.close());

async function api(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(base + '/api' + path, {
    method, body: body && JSON.stringify(body),
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
const board = async (qs, token) => (await api('/leaderboard' + qs, { token })).body;
const order = (b) => b.rows.map((p) => `${p.rank} ${p.username}`);

describe('leaderboard', () => {
  test('anyone can see everyone, ranked by level by default', async () => {
    const b = await board('');
    assert.equal(b.by, 'level');
    assert.deepEqual(order(b), ['1 ana', '2 bob', '2 cyd', '4 dee_x']);
    assert.equal(b.me, null);
    assert.deepEqual(b.counts, { all: 4, friends: null });
  });

  test('ranks by online wins, best streak or cards found', async () => {
    assert.deepEqual(order(await board('?by=wins')), ['1 bob', '2 ana', '3 cyd', '4 dee_x']);
    assert.deepEqual(order(await board('?by=streak')), ['1 bob', '2 cyd', '3 ana', '4 dee_x']);
    assert.deepEqual(order(await board('?by=cards')), ['1 bob', '2 ana', '3 dee_x', '4 cyd']);
  });

  test('each player has their stats, avatar and last results', async () => {
    const bob = (await board('?by=wins')).rows[0];
    assert.equal(bob.displayName, 'bob');
    assert.deepEqual(bob.avatar, { c: 3, r: 1 });
    assert.deepEqual([bob.xp, bob.wins, bob.losses, bob.draws, bob.best, bob.cards, bob.recent], [300, 9, 2, 1, 7, 6, 'wlw']);
    assert.equal(bob.hand, null);
    assert.equal(bob.data, undefined);
  });

  test('signed in, you get your own rank', async () => {
    const b = await board('?by=wins', T.cyd);
    assert.equal(b.me.username, 'cyd');
    assert.equal(b.me.rank, 3);
    assert.equal(b.counts.friends, 1);
  });

  test('friends shows only you and your friends, and needs you signed in', async () => {
    assert.equal((await api('/leaderboard?show=friends')).status, 401);
    const b = await board('?show=friends', T.bob);
    assert.equal(b.show, 'friends');
    assert.deepEqual(order(b), ['1 ana', '2 bob']);
    assert.equal(b.counts.friends, 2);
    assert.deepEqual(order(await board('?show=friends', T.cyd)), ['1 cyd']);
  });

  test('a bad token is refused rather than treated as a guest', async () => {
    assert.equal((await api('/leaderboard', { token: 'nope' })).status, 401);
  });

  test('search finds the start of a name and keeps the real rank', async () => {
    assert.deepEqual(order(await board('?q=CY')), ['2 cyd']);
    assert.deepEqual(order(await board('?q=@dee_')), ['4 dee_x']);
    // _ is a letter here, not "any character"
    assert.deepEqual(order(await board('?q=de_')), []);
    assert.deepEqual(order(await board('?q=%25')), []);
  });

  test('unknown options fall back to the defaults', async () => {
    const b = await board('?by=xp;DROP&show=nope');
    assert.equal(b.by, 'level');
    assert.equal(b.show, 'all');
  });

  test('saving moves you on the board', async () => {
    const r = await api('/me', { token: T.dee_x });
    const s = save(5000, 0, 0, [0, 1], { loadouts: [null, { name: 'Main', ids: [0, 1, 2, 3, 4] }], mainLo: 1 });
    assert.equal((await api('/me/save', { method: 'PUT', token: T.dee_x, body: { data: s, baseRev: r.body.save.rev } })).status, 200);
    const top = (await board('')).rows[0];
    assert.equal(top.username, 'dee_x');
    assert.deepEqual(top.hand, [0, 1, 2, 3, 4]);
  });

  test('a new account without a save is on the board with nothing yet', async () => {
    const r = await api('/auth/signup', { method: 'POST', body: { username: 'eve', password: 'eve-pass-1' } });
    const b = await board('?q=eve', r.body.token);
    assert.equal(b.me.xp, 0);
    assert.equal(b.me.rank, 5);
  });

  test('saves from before the leaderboard are added', async () => {
    const { rows: [u] } = await db.run("INSERT INTO users (username, display_name, password_hash) VALUES ('old', 'old', 'x') RETURNING id");
    await db.run('INSERT INTO user_saves (user_id, data) VALUES ($u, $d)', { $u: u.id, $d: JSON.stringify(save(10, 0, 0, [0])) });
    // a fresh server fills in rows it hasn't seen
    const s2 = createApp({ db, clientDir: '.' }).listen(0);
    await new Promise((r) => s2.once('listening', r));
    const b = await (await fetch(`http://127.0.0.1:${s2.address().port}/api/leaderboard?q=old`)).json();
    s2.close();
    assert.deepEqual(order(b), ['5 old']); // above eve, who has no XP
  });

  test('deleting an account takes it off the board', async () => {
    assert.equal((await api('/me', { method: 'DELETE', token: T.cyd, body: { password: 'cyd-pass-1' } })).status, 204);
    assert.deepEqual(order(await board('?q=cyd')), []);
  });
});

describe('boardRow', () => {
  test('keeps only sane values', () => {
    assert.deepEqual(boardRow({ xp: -5, stats: { ow: 'lots' }, best: 2.5, seen: [1, 1, 99, 'x'], recent: ['w', 'z'], lastDeck: [1, 2, 3] }),
      { xp: 0, wins: 0, losses: 0, draws: 0, best: 0, cards: 1, recent: 'w', hand: '' });
    assert.equal(boardRow(null).xp, 0);
  });
  test('the hand is the main loadout, or else the last deck played', () => {
    assert.equal(boardRow({ lastDeck: [5, 6, 7, 8, 9] }).hand, '[5,6,7,8,9]');
    assert.equal(boardRow({ lastDeck: [5, 6, 7, 8, 9], loadouts: [{ ids: [1, 2, 3, 4, 0] }], mainLo: 0 }).hand, '[1,2,3,4,0]');
  });
});
