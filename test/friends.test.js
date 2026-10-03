// Friends: requests, accepting, the list, removing. Runs against a fresh in-memory database.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

Object.assign(process.env, { EMAIL_KEY: 'test-email-key-0123456789abcdefghij', APP_URL: 'https://game.test' });
delete process.env.RESEND_API_KEY;
delete process.env.RENDER;
const { openSqlite } = await import('../server/db/sqlite.js');
const { createApp } = await import('../server/app.js');

let db, server, base;
const T = {};
before(async () => {
  db = await openSqlite(null);
  server = createApp({ db, clientDir: fileURLToPath(new URL('../client', import.meta.url)) }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['ana', 'bob', 'cyd']) {
    const r = await api('/auth/signup', { method: 'POST', body: { username: name, password: `${name}-pass-1`, save: { xp: 500, avatar: { c: 3, r: 1 } } } });
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
const ask = (from, to) => api('/friends/requests', { method: 'POST', token: T[from], body: { username: to } });
const lists = async (who) => (await api('/friends', { token: T[who] })).body;
const names = (l) => l.map((u) => u.username);

describe('friends', () => {
  test('needs you to be signed in', async () => {
    assert.equal((await api('/friends')).status, 401);
    assert.equal((await api('/friends/requests', { method: 'POST', body: { username: 'bob' } })).status, 401);
  });

  test('a request shows up on both sides until it is accepted', async () => {
    const r = await ask('ana', 'bob');
    assert.equal(r.status, 201);
    assert.equal(r.body.status, 'sent');
    assert.deepEqual(names((await lists('ana')).outgoing), ['bob']);
    const bob = await lists('bob');
    assert.deepEqual(names(bob.incoming), ['ana']);
    assert.deepEqual(bob.friends, []);
    // asking twice changes nothing
    assert.equal((await ask('ana', 'bob')).body.status, 'sent');
    assert.equal((await lists('bob')).incoming.length, 1);
  });

  test('asking back accepts, and both see each other with level and avatar', async () => {
    assert.equal((await ask('bob', 'ana')).body.status, 'friends');
    const ana = await lists('ana'), bob = await lists('bob');
    assert.deepEqual(names(ana.friends), ['bob']);
    assert.deepEqual(names(bob.friends), ['ana']);
    assert.deepEqual([ana.incoming, ana.outgoing, bob.incoming, bob.outgoing], [[], [], [], []]);
    assert.equal(ana.friends[0].xp, 500);
    assert.deepEqual(ana.friends[0].avatar, { c: 3, r: 1 });
    assert.equal(ana.friends[0].email, undefined);
    assert.equal((await ask('ana', 'bob')).body.status, 'friends');
  });

  test('you can\'t add yourself or someone who doesn\'t exist', async () => {
    assert.equal((await ask('ana', 'Ana')).status, 400);
    assert.equal((await ask('ana', 'nobody_here')).status, 404);
  });

  test('a request can be declined or cancelled', async () => {
    await ask('cyd', 'ana');
    assert.equal((await api('/friends/requests/cyd', { method: 'DELETE', token: T.ana })).status, 204);
    assert.deepEqual((await lists('cyd')).outgoing, []);
    await ask('cyd', 'bob');
    await api('/friends/requests/bob', { method: 'DELETE', token: T.cyd });
    assert.deepEqual((await lists('bob')).incoming, []);
  });

  test('removing a friend removes it for both', async () => {
    assert.equal((await api('/friends/bob', { method: 'DELETE', token: T.ana })).status, 204);
    assert.deepEqual((await lists('ana')).friends, []);
    assert.deepEqual((await lists('bob')).friends, []);
  });

  test('deleting an account takes its friendships and requests with it', async () => {
    await ask('ana', 'cyd'); await ask('cyd', 'ana'); await ask('bob', 'cyd');
    await api('/me', { method: 'DELETE', token: T.cyd, body: { password: 'cyd-pass-1' } });
    assert.deepEqual((await lists('ana')).friends, []);
    assert.deepEqual((await lists('bob')).outgoing, []);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM friends')).n, 0);
  });
});
