// The check an open game makes every few seconds: change counters, who's on the menu, invites. Fresh in-memory database.
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
const pulse = async (who, menu = true) => (await api('/pulse', { method: 'POST', token: T[who], body: { menu } })).body;
const ask = (from, to) => api('/friends/requests', { method: 'POST', token: T[from], body: { username: to } });
const invite = (from, to, code = 'ABCDE') => api('/pulse/invite', { method: 'POST', token: T[from], body: { to, code } });

describe('pulse', () => {
  test('needs you to be signed in', async () => {
    assert.equal((await api('/pulse', { method: 'POST', body: {} })).status, 401);
    assert.equal((await api('/pulse', { method: 'POST', token: 'nope', body: {} })).status, 401);
  });

  test('a friend request and its answer bump both players\' counters', async () => {
    const a0 = await pulse('ana'), b0 = await pulse('bob');
    await ask('ana', 'bob');
    const b1 = await pulse('bob');
    assert.equal(b1.boot, b0.boot);
    assert.notEqual(b1.fr, b0.fr);
    await ask('bob', 'ana');
    assert.notEqual((await pulse('ana')).fr, a0.fr);
    assert.notEqual((await pulse('bob')).fr, b1.fr);
  });

  test('a forfeit bumps the leaver\'s counter', async () => {
    const before = (await pulse('cyd')).fo;
    assert.equal((await api('/forfeits', { method: 'POST', body: { to: 'cyd', key: 'abc:1', name: 'Ana', cards: [] } })).status, 204);
    assert.equal((await pulse('cyd')).fo, before + 1);
  });

  test('friends see each other only while on the main menu', async () => {
    await pulse('bob', true);
    assert.deepEqual((await pulse('ana')).online, ['bob']);
    await pulse('bob', false);
    assert.deepEqual((await pulse('ana')).online, []);
    // cyd isn't a friend, so ana never sees them
    await pulse('cyd', true);
    assert.deepEqual((await pulse('ana')).online, []);
  });

  test('an invite goes only to a friend on the menu', async () => {
    await pulse('bob', false);
    assert.equal((await invite('ana', 'bob')).status, 409);
    assert.equal((await invite('ana', 'cyd')).status, 404);
    await pulse('bob', true);
    assert.equal((await invite('ana', 'bob', 'bad')).status, 400);
    assert.equal((await invite('ana', 'bob')).status, 204);
    const inv = (await pulse('bob')).invites;
    assert.equal(inv.length, 1);
    assert.equal(inv[0].from, 'ana');
    assert.equal(inv[0].code, 'ABCDE');
    assert.ok(inv[0].left > 50);
  });

  test('saying no takes the invite down and tells the sender once', async () => {
    await api('/pulse/invite/answer', { method: 'POST', token: T.bob, body: { from: 'ana', code: 'ABCDE', no: true } });
    assert.deepEqual((await pulse('bob')).invites, []);
    assert.deepEqual((await pulse('ana')).declined, ['bob']);
    assert.deepEqual((await pulse('ana')).declined, []);
  });

  test('closing the room takes its invites down', async () => {
    await pulse('bob', true);
    await invite('ana', 'bob', 'QWERT');
    assert.equal((await pulse('bob')).invites.length, 1);
    await api('/pulse/invite/cancel', { method: 'POST', token: T.ana, body: { code: 'QWERT' } });
    assert.deepEqual((await pulse('bob')).invites, []);
  });

  test('removing a friend stops their invites and presence', async () => {
    await api('/friends/bob', { method: 'DELETE', token: T.ana });
    await pulse('bob', true);
    assert.deepEqual((await pulse('ana')).online, []);
    assert.equal((await invite('ana', 'bob')).status, 404);
  });

  test('the live line hears changes the moment they happen', async () => {
    const ctl = new AbortController();
    const r = await fetch(base + '/api/pulse/stream', { signal: ctl.signal, headers: { Authorization: `Bearer ${T.bob}` } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/event-stream/);
    const rd = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    const next = async () => {
      for (;;) {
        const i = buf.indexOf('\n\n');
        if (i >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); const d = ev.split('\n').find((l) => l.startsWith('data: ')); if (d) return JSON.parse(d.slice(6)); continue; }
        const { value } = await rd.read();
        buf += dec.decode(value, { stream: true });
      }
    };
    await ask('cyd', 'bob');
    assert.equal((await next()).k, 'fr');
    // with the line open, bob stays online past the check-in window; ana (now friends again) is told when he goes away
    await ask('ana', 'bob'); await next();
    await ask('bob', 'ana'); assert.equal((await next()).k, 'fr');
    await pulse('bob', true);
    assert.deepEqual((await pulse('ana')).online, ['bob']);
    await invite('ana', 'bob', 'ZXCVB');
    assert.equal((await next()).k, 'inv');
    ctl.abort();
    await new Promise((res) => setTimeout(res, 100));
    assert.deepEqual((await pulse('ana')).online, []);
  });

  test('signing out ends the pulse straight away', async () => {
    const r = await api('/auth/login', { method: 'POST', body: { username: 'cyd', password: 'cyd-pass-1' } });
    const tok = r.body.token;
    assert.equal((await api('/pulse', { method: 'POST', token: tok, body: {} })).status, 200);
    await api('/auth/logout', { method: 'POST', token: tok });
    assert.equal((await api('/pulse', { method: 'POST', token: tok, body: {} })).status, 401);
  });
});
