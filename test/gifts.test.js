// Gifts: packs a developer gives a player from their profile, waiting on the
// server until the player's synced save has them. Fresh in-memory database.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

Object.assign(process.env, { EMAIL_KEY: 'test-email-key-0123456789abcdefghij', APP_URL: 'https://game.test', DEV_USERS: 'Dee, eve' });
delete process.env.RESEND_API_KEY;
delete process.env.RENDER;
const { openSqlite } = await import('../server/db/sqlite.js');
const { createApp } = await import('../server/app.js');
const { MAX_WAITING } = await import('../server/routes/gifts.js');

let db, server, base;
const T = {};
before(async () => {
  db = await openSqlite(null);
  server = createApp({ db, clientDir: fileURLToPath(new URL('../client', import.meta.url)) }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['dee', 'eve', 'ana', 'bob']) {
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
const give = (from, to, pack) => api('/gifts', { method: 'POST', token: T[from], body: { to, pack } });
const giftsOf = async (who) => (await api('/gifts', { token: T[who] })).body.gifts;
const ack = (who, ids) => api('/gifts/ack', { method: 'POST', token: T[who], body: { ids } });

describe('gifts', () => {
  test('a developer\'s gift waits until it\'s acknowledged', async () => {
    assert.equal((await give('dee', 'Ana', 'spark')).status, 204);
    assert.equal((await give('dee', 'ana', 'arcane')).status, 204);
    const got = await giftsOf('ana');
    assert.deepEqual(got.map((g) => [g.name, g.pack]), [['dee', 'spark'], ['dee', 'arcane']]);
    assert.equal((await giftsOf('ana')).length, 2, 'reading keeps them');
    assert.equal((await ack('ana', [got[0].id])).status, 204);
    assert.deepEqual((await giftsOf('ana')).map((g) => g.pack), ['arcane']);
    await ack('ana', [got[1].id]);
    assert.deepEqual(await giftsOf('ana'), []);
  });
  test('a developer can give to another developer, and to themselves', async () => {
    assert.equal((await give('dee', 'eve', 'mythic')).status, 204);
    assert.equal((await give('eve', 'dee', 'ley')).status, 204);
    assert.equal((await give('dee', 'dee', 'spark')).status, 204);
    assert.deepEqual((await giftsOf('eve')).map((g) => [g.name, g.pack]), [['dee', 'mythic']]);
    assert.deepEqual((await giftsOf('dee')).map((g) => [g.name, g.pack]), [['eve', 'ley'], ['dee', 'spark']]);
  });
  test('only developers can give', async () => {
    assert.equal((await give('ana', 'bob', 'spark')).status, 403);
    assert.equal((await api('/gifts', { method: 'POST', body: { to: 'bob', pack: 'spark' } })).status, 401);
    assert.deepEqual(await giftsOf('bob'), []);
  });
  test('bad requests are refused', async () => {
    assert.equal((await give('dee', 'bob', 'golden')).status, 400);
    assert.equal((await give('dee', 'nobody', 'spark')).status, 404);
    assert.equal((await ack('bob', ['x'])).status, 400);
    assert.equal((await api('/gifts')).status, 401);
  });
  test('you can only clear your own gifts', async () => {
    await give('dee', 'bob', 'mythic');
    const [g] = await giftsOf('bob');
    await ack('ana', [g.id]);
    assert.equal((await giftsOf('bob')).length, 1);
    await ack('bob', [g.id]);
  });
  test('a gift bumps the player\'s pulse counter', async () => {
    const pulse = async () => (await api('/pulse', { method: 'POST', token: T.bob, body: { menu: true } })).body.gi;
    const before = await pulse();
    await give('dee', 'bob', 'ley');
    assert.equal(await pulse(), before + 1);
  });
  test('only so many wait for one player', async () => {
    const left = MAX_WAITING - (await giftsOf('bob')).length;
    for (let i = 0; i < left; i++) assert.equal((await give('dee', 'bob', 'spark')).status, 204);
    assert.equal((await give('dee', 'bob', 'spark')).status, 429);
  });
});
