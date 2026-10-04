// Forfeits: the choice for a player who left an online match, waiting on the server
// until their game fetches it. Runs against a fresh in-memory database.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

Object.assign(process.env, { EMAIL_KEY: 'test-email-key-0123456789abcdefghij', APP_URL: 'https://game.test' });
delete process.env.RESEND_API_KEY;
delete process.env.RENDER;
const { openSqlite } = await import('../server/db/sqlite.js');
const { createApp } = await import('../server/app.js');
const { MAX_WAITING } = await import('../server/routes/forfeits.js');

let db, server, base;
const T = {};
before(async () => {
  db = await openSqlite(null);
  server = createApp({ db, clientDir: fileURLToPath(new URL('../client', import.meta.url)) }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['ana', 'bob']) {
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
const send = (body) => api('/forfeits', { method: 'POST', body });
const fetchFor = async (who) => (await api('/forfeits', { token: T[who] })).body.forfeits;

describe('forfeits', () => {
  test('a choice waits for the leaver, once', async () => {
    assert.equal((await send({ to: 'Ana', key: 'abc123:42', name: 'Bob', cards: [3, 7] })).status, 204);
    const got = await fetchFor('ana');
    assert.equal(got.length, 1);
    assert.deepEqual({ ...got[0], at: undefined }, { key: 'abc123:42', name: 'Bob', cards: [3, 7], at: undefined });
    assert.deepEqual(await fetchFor('ana'), [], 'fetching removes it');
  });
  test('a spare is an empty list of cards', async () => {
    await send({ to: 'bob', key: 'zz:1', name: 'Ana', cards: [] });
    assert.deepEqual((await fetchFor('bob'))[0].cards, []);
  });
  test('only the first choice for a match counts', async () => {
    await send({ to: 'bob', key: 'zz:2', name: 'Ana', cards: [] });
    await send({ to: 'bob', key: 'zz:2', name: 'Ana', cards: [1, 2, 3, 4, 5] });
    const got = await fetchFor('bob');
    assert.equal(got.length, 1);
    assert.deepEqual(got[0].cards, []);
  });
  test('bad requests are refused', async () => {
    assert.equal((await send({ to: 'nobody', key: 'zz:3', cards: [] })).status, 404);
    assert.equal((await send({ to: 'bob', key: 'not a key', cards: [] })).status, 400);
    assert.equal((await send({ to: 'bob', key: 'zz:4', cards: [1, 2, 3, 4, 5, 6] })).status, 400);
    assert.equal((await send({ to: 'bob', key: 'zz:4', cards: ['x'] })).status, 400);
    assert.deepEqual(await fetchFor('bob'), []);
  });
  test('reading needs the leaver to be signed in', async () => {
    assert.equal((await api('/forfeits')).status, 401);
  });
  // (stays under the 30 an hour one address may send)
  test('only the newest few wait for one player', async () => {
    for (let i = 0; i < MAX_WAITING + 1; i++) await send({ to: 'ana', key: `k:${i}`, name: 'Bob', cards: [] });
    const got = await fetchFor('ana');
    assert.equal(got.length, MAX_WAITING);
    assert.equal(got.at(-1).key, `k:${MAX_WAITING}`);
  });
});
