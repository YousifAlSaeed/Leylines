// The control panel's server side: live events (×2 / ×3 XP and shards) and the player tools,
// developers only. Fresh in-memory database.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

Object.assign(process.env, { EMAIL_KEY: 'test-email-key-0123456789abcdefghij', APP_URL: 'https://game.test', DEV_USERS: 'dee' });
delete process.env.RESEND_API_KEY;
delete process.env.RENDER;
const { openSqlite } = await import('../server/db/sqlite.js');
const { createApp } = await import('../server/app.js');
const { checkBoost, MAX_DAYS } = await import('../server/lib/boosts.js');
const { SHARDS_MAX, verOlder } = await import('../server/routes/admin.js');

let db, server, base;
const T = {};
const DAY = 864e5;
before(async () => {
  db = await openSqlite(null);
  server = createApp({ db, clientDir: fileURLToPath(new URL('../client', import.meta.url)) }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['dee', 'ana', 'bob']) {
    const r = await api('/auth/signup', { method: 'POST', body: { username: name, password: `${name}-pass-1` } });
    T[name] = r.body.token;
  }
});
after(() => server.close());

async function api(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(base + '/api' + path, {
    method, body: body && JSON.stringify(body),
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
const boostNow = async () => (await api('/news')).body.boost;
const start = (b, who = 'dee') => api('/admin/boosts', { method: 'POST', token: T[who], body: { xp: 2, shards: 1, end: Date.now() + DAY, ...b } });

describe('control panel', () => {
  test('only developers get in', async () => {
    for (const [path, method] of [['/admin/boosts', 'GET'], ['/admin/boosts', 'POST'], ['/admin/players?q=a', 'GET'], ['/admin/players/bob', 'PATCH'], ['/admin/players/bob/signout', 'POST'], ['/admin/players/bob/shards', 'POST']]) {
      assert.equal((await api(path, { method, token: T.ana, body: method === 'GET' ? undefined : {} })).status, 403, path);
      assert.equal((await api(path, { method, body: method === 'GET' ? undefined : {} })).status, 401, path);
    }
  });

  test('an event reaches every game with the announcements, and ends', async () => {
    assert.equal(await boostNow(), null);
    const r = await start({ xp: 3, shards: 2, raise: true });
    assert.equal(r.status, 200);
    const b = await boostNow();
    assert.deepEqual([b.xp, b.shards, b.raise], [3, 2, true]);
    assert.equal(r.body.boost.by, 'dee');
    const e = await api(`/admin/boosts/${b.id}/end`, { method: 'POST', token: T.dee });
    assert.equal(e.status, 200);
    assert.equal(await boostNow(), null);
    assert.equal((await api('/admin/boosts/999/end', { method: 'POST', token: T.dee })).status, 404);
  });

  test('a new event replaces the one running', async () => {
    const a = (await start({ xp: 2 })).body.boost;
    const b = (await start({ xp: 1, shards: 3 })).body.boost;
    const now = await boostNow();
    assert.equal(now.id, b.id);
    const all = (await api('/admin/boosts', { token: T.dee })).body.boosts;
    assert.ok(all.find((x) => x.id === a.id).end <= Date.now(), 'the first one ended');
    await api(`/admin/boosts/${b.id}/end`, { method: 'POST', token: T.dee });
  });

  test('a scheduled event waits, and games know when to ask again', async () => {
    const at = Date.now() + 2 * 3600e3;
    const s = (await start({ start: at, end: at + DAY })).body.boost;
    const r = (await api('/news')).body;
    assert.equal(r.boost, null);
    assert.equal(r.next, at);
    await api(`/admin/boosts/${s.id}/end`, { method: 'POST', token: T.dee });
    assert.equal((await api('/news')).body.next, null, 'an ended one never starts');
  });

  test('an event is checked before it starts', () => {
    const now = 1_000_000_000_000, ok = { xp: 2, shards: 1, end: now + DAY };
    assert.ok(checkBoost(ok, now).boost);
    assert.equal(checkBoost(ok, now).boost.start, now);
    assert.equal(checkBoost({ ...ok, raise: true }, now).boost.raise, false, 'no shard boost, nothing to raise');
    const bad = (f) => checkBoost({ ...ok, ...f }, now).error;
    assert.ok(bad({ xp: 1 }), 'nothing boosted');
    assert.ok(bad({ xp: 4 }));
    assert.ok(bad({ shards: 0.5 }));
    assert.ok(bad({ end: now - 1 }));
    assert.ok(bad({ start: now + DAY, end: now + DAY }));
    assert.ok(bad({ end: now + (MAX_DAYS + 1) * DAY }));
  });

  test('finding a player', async () => {
    const r = await api('/admin/players?q=AN', { token: T.dee });
    assert.deepEqual(r.body.players.map((p) => p.username), ['ana']);
    assert.equal(r.body.players[0].level, 1);
    assert.deepEqual((await api('/admin/players?q=%25', { token: T.dee })).body.players, [], 'a % is a letter, not "anything"');
    assert.deepEqual((await api('/admin/players?q=', { token: T.dee })).body.players, []);
  });

  test('a rude name can be changed', async () => {
    const r = await api('/admin/players/bob', { method: 'PATCH', token: T.dee, body: { displayName: '  Nice  Bob <x> ' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.displayName, 'Nice Bob x');
    assert.equal((await api('/me', { token: T.bob })).body.user.displayName, 'Nice Bob x');
    assert.equal((await api('/admin/players/bob', { method: 'PATCH', token: T.dee, body: { displayName: '   ' } })).status, 400);
    assert.equal((await api('/admin/players/nobody', { method: 'PATCH', token: T.dee, body: { displayName: 'x' } })).status, 404);
  });

  test('shards wait for the player like a gift pack', async () => {
    assert.equal((await api('/admin/players/ana/shards', { method: 'POST', token: T.dee, body: { shards: 250 } })).status, 204);
    const g = (await api('/gifts', { token: T.ana })).body.gifts;
    assert.deepEqual(g.map((x) => [x.pack, x.shards, x.name]), [['shards', 250, 'dee']]);
    for (const shards of [0, -5, 1.5, SHARDS_MAX + 1, 'lots'])
      assert.equal((await api('/admin/players/ana/shards', { method: 'POST', token: T.dee, body: { shards } })).status, 400, String(shards));
  });

  test('signing someone out ends every session of theirs', async () => {
    assert.equal((await api('/me', { token: T.bob })).status, 200);
    assert.equal((await api('/admin/players/bob/signout', { method: 'POST', token: T.dee })).status, 204);
    assert.equal((await api('/me', { token: T.bob })).status, 401);
  });
});

describe('control panel: server', () => {
  test('only developers see it or change it', async () => {
    for (const [path, method] of [['/admin/server', 'GET'], ['/admin/server/pause', 'PUT'], ['/admin/server/reload', 'POST'], ['/admin/server/gifts', 'POST'], ['/admin/server/gifts/1/end', 'POST']]) {
      assert.equal((await api(path, { method, token: T.ana, body: method === 'GET' ? undefined : {} })).status, 403, path);
      assert.equal((await api(path, { method, body: method === 'GET' ? undefined : {} })).status, 401, path);
    }
  });

  test('who is on, which versions, and how busy the database is', async () => {
    const live = (await api('/admin/server', { token: T.dee })).body.live;
    assert.match(live, /^\d+\.\d+\.\d+$/, 'read from client/js/version.js');
    await api('/pulse', { method: 'POST', token: T.ana, body: { menu: true, ver: '0.0.1' } });
    await api('/pulse', { method: 'POST', token: T.dee, body: { menu: false, ver: live } });
    const s = (await api('/admin/server', { token: T.dee })).body;
    assert.equal(s.online, 2);
    assert.equal(s.free, 1, 'ana is on the menu, dee is not');
    assert.equal(s.old, 1, 'ana is on an older version');
    assert.ok(s.db.n > 0 && s.db.last > 0);
    assert.equal(s.db.perHour.length, 8);
    assert.ok(s.db.perHour.at(-1) > 0, 'this hour counts');
    assert.ok(s.started <= s.now);
  });

  test('pausing online play reaches every game, and turns back off', async () => {
    const r = await api('/admin/server/pause', { method: 'PUT', token: T.dee, body: { on: true, msg: '  Back   soon ' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.pause.msg, 'Back soon');
    assert.equal((await api('/news')).body.pause, 'Back soon');
    assert.equal((await api('/admin/server/pause', { method: 'PUT', token: T.dee, body: { on: true, msg: 'x'.repeat(500) } })).status, 400);
    await api('/admin/server/pause', { method: 'PUT', token: T.dee, body: { on: false } });
    assert.equal((await api('/news')).body.pause, null);
    // an empty message still says something
    const e = await api('/admin/server/pause', { method: 'PUT', token: T.dee, body: { on: true, msg: '' } });
    assert.ok(e.body.pause.msg.length > 10);
    await api('/admin/server/pause', { method: 'PUT', token: T.dee, body: { on: false } });
  });

  test('older games can be asked to reload', async () => {
    const live = (await api('/admin/server', { token: T.dee })).body.live;
    const r = await api('/admin/server/reload', { method: 'POST', token: T.dee });
    assert.equal(r.body.reload.v, live);
    assert.equal((await api('/news')).body.reload.v, live);
  });

  test('a gift for everyone waits a week, and can be stopped', async () => {
    const p = await api('/admin/server/gifts', { method: 'POST', token: T.dee, body: { pack: 'arcane' } });
    assert.equal(p.status, 200);
    const s = await api('/admin/server/gifts', { method: 'POST', token: T.dee, body: { shards: 300 } });
    const g = (await api('/news')).body.gifts;
    assert.deepEqual(g.map((x) => [x.pack, x.shards]), [[null, 300], ['arcane', 0]]);
    assert.ok(g[0].end - g[0].at >= 6.9 * DAY);
    for (const body of [{ pack: 'gold' }, { shards: 0 }, { shards: 20000 }, {}])
      assert.equal((await api('/admin/server/gifts', { method: 'POST', token: T.dee, body })).status, 400, JSON.stringify(body));
    assert.equal((await api(`/admin/server/gifts/${s.body.gift.id}/end`, { method: 'POST', token: T.dee })).status, 200);
    assert.deepEqual((await api('/news')).body.gifts.map((x) => x.pack), ['arcane']);
    await api(`/admin/server/gifts/${p.body.gift.id}/end`, { method: 'POST', token: T.dee });
    assert.deepEqual((await api('/news')).body.gifts, []);
    assert.equal((await api('/admin/server/gifts/999/end', { method: 'POST', token: T.dee })).status, 404);
  });

  test('versions compare by number', () => {
    assert.ok(verOlder('0.30.9', '0.31.0'));
    assert.ok(verOlder('0.9.0', '0.10.0'));
    assert.ok(!verOlder('0.31.0', '0.31.0'));
    assert.ok(!verOlder('1.0.0', '0.31.0'));
    assert.ok(!verOlder('', '0.31.0'));
    assert.ok(!verOlder('junk', '0.31.0'));
  });
});
