// Push alerts: turning them on and off, who gets one and when. The push service is faked. Fresh in-memory database.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

Object.assign(process.env, { EMAIL_KEY: 'test-email-key-0123456789abcdefghij', APP_URL: 'https://game.test' });
delete process.env.RESEND_API_KEY;
delete process.env.RENDER;
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
const { openSqlite } = await import('../server/db/sqlite.js');
const { createApp } = await import('../server/app.js');
const { pushHostOk } = await import('../server/routes/push.js');

// what the fake push service was asked to deliver; gone: endpoints it answers 410 for
const sent = [], gone = new Set();
const pushSend = async (sub, body) => {
  if (gone.has(sub.endpoint)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
  sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) });
};

let db, server, base;
const T = {};
before(async () => {
  db = await openSqlite(null);
  server = createApp({ db, clientDir: fileURLToPath(new URL('../client', import.meta.url)), pushSend }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['ana', 'bob', 'cyd']) {
    const r = await api('/auth/signup', { method: 'POST', body: { username: name, password: `${name}-pass-1` } });
    T[name] = r.body.token;
  }
  await api('/friends/requests', { method: 'POST', token: T.ana, body: { username: 'bob' } });
  await api('/friends/requests', { method: 'POST', token: T.bob, body: { username: 'ana' } });
});
after(() => server.close());
beforeEach(() => { sent.length = 0; });

async function api(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(base + '/api' + path, {
    method, body: body && JSON.stringify(body),
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
const sub = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, keys: { p256dh: 'BPk3y' + n, auth: 'au' + n } });
const subscribe = (who, s) => api('/push/subscribe', { method: 'POST', token: T[who], body: { sub: s } });
const pulse = async (who, menu = true) => (await api('/pulse', { method: 'POST', token: T[who], body: { menu } })).body;
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('push alerts', () => {
  test('only real push services are accepted', () => {
    assert.ok(pushHostOk('https://fcm.googleapis.com/fcm/send/x'));
    assert.ok(pushHostOk('https://web.push.apple.com/abc'));
    assert.ok(pushHostOk('https://updates.push.services.mozilla.com/wpush/v2/x'));
    assert.ok(pushHostOk('https://wns2-par02p.notify.windows.com/w/?token=x'));
    assert.ok(!pushHostOk('http://fcm.googleapis.com/x'));
    assert.ok(!pushHostOk('https://fcm.googleapis.com.evil.test/x'));
    assert.ok(!pushHostOk('https://127.0.0.1/x'));
    assert.ok(!pushHostOk('https://fcm.googleapis.com:8443/x'));
  });

  test('turning them on needs an account and a real push address', async () => {
    assert.ok((await api('/push/key')).body.key);
    assert.equal((await api('/push/subscribe', { method: 'POST', body: { sub: sub(1) } })).status, 401);
    assert.equal((await subscribe('bob', { ...sub(1), endpoint: 'https://example.test/x' })).status, 400);
    assert.equal((await subscribe('bob', { endpoint: sub(1).endpoint, keys: { p256dh: 'a b', auth: 'x' } })).status, 400);
    assert.equal((await subscribe('bob', sub(1))).status, 204);
  });

  test('a friend with alerts on can be invited while the game is closed, and gets an alert', async () => {
    // bob's game isn't open: ana sees him as reachable by alert, not online
    const p = await pulse('ana');
    assert.deepEqual(p.online, []);
    assert.deepEqual(p.alerts, ['bob']);
    assert.equal((await api('/pulse/invite', { method: 'POST', token: T.ana, body: { to: 'bob', code: 'ABCDE' } })).status, 204);
    await settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].tag, 'invite');
    assert.match(sent[0].title, /ana invited you/);
    // the invite waits for him when he opens the game
    assert.equal((await pulse('bob')).invites[0].code, 'ABCDE');
  });

  test('a friend request sends an alert', async () => {
    await api('/friends/requests', { method: 'POST', token: T.cyd, body: { username: 'bob' } });
    await settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].title, 'Friend request');
    assert.match(sent[0].body, /cyd wants to be friends/);
    assert.equal(sent[0].url, './?friends=1');
  });

  test('news about a match you left sends an alert', async () => {
    await api('/forfeits', { method: 'POST', body: { to: 'bob', key: 'abc:1', name: 'Ana', cards: [3, 4] } });
    await settle();
    assert.equal(sent.length, 1);
    assert.match(sent[0].body, /Ana took 2 cards/);
  });

  test('no alert while the game is open: it shows the news itself', async () => {
    const ctl = new AbortController();
    const r = await fetch(base + '/api/pulse/stream', { signal: ctl.signal, headers: { Authorization: `Bearer ${T.bob}` } });
    await r.body.getReader().read();
    await api('/forfeits', { method: 'POST', body: { to: 'bob', key: 'abc:2', name: 'Ana', cards: [] } });
    await settle();
    assert.equal(sent.length, 0);
    // in the game but in a match: not reachable at all
    await pulse('bob', false);
    assert.deepEqual((await pulse('ana')).alerts, []);
    assert.equal((await api('/pulse/invite', { method: 'POST', token: T.ana, body: { to: 'bob', code: 'QWERT' } })).status, 409);
    ctl.abort();
    await settle();
  });

  test('a minimised game stays online as away, and still gets alerts', async () => {
    const ctl = new AbortController();
    const r = await fetch(base + '/api/pulse/stream', { signal: ctl.signal, headers: { Authorization: `Bearer ${T.bob}` } });
    await r.body.getReader().read();
    await api('/pulse', { method: 'POST', token: T.bob, body: { menu: true, away: true } });
    const p = await pulse('ana');
    assert.deepEqual(p.online, ['bob']);
    assert.deepEqual(p.away, ['bob']);
    assert.equal((await api('/pulse/invite', { method: 'POST', token: T.ana, body: { to: 'bob', code: 'MINIM' } })).status, 204);
    await settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].tag, 'invite');
    // back in front: online, not away, and no more alerts
    await api('/pulse', { method: 'POST', token: T.bob, body: { menu: true, away: false } });
    assert.deepEqual((await pulse('ana')).away, []);
    await api('/forfeits', { method: 'POST', body: { to: 'bob', key: 'abc:9', name: 'Ana', cards: [] } });
    await settle();
    assert.equal(sent.length, 1);
    ctl.abort();
    await settle();
  });

  test('the test alert says how it went', async () => {
    const r = await api('/push/test', { method: 'POST', token: T.bob });
    assert.equal(r.status, 200);
    assert.equal(r.body.devices, 1);
    assert.equal(r.body.sent, 1);
    assert.deepEqual(r.body.failed, []);
    assert.equal(sent.at(-1).tag, 'test');
    assert.equal((await api('/push/test', { method: 'POST', token: T.ana })).body.devices, 0);
  });

  test('a device the push service says is gone is forgotten', async () => {
    gone.add(sub(1).endpoint);
    await api('/forfeits', { method: 'POST', body: { to: 'bob', key: 'abc:3', name: 'Ana', cards: [] } });
    await settle();
    assert.equal(sent.length, 0);
    assert.deepEqual((await pulse('ana')).alerts, []);
  });

  test('turning them off stops them', async () => {
    await subscribe('cyd', sub(2));
    await api('/push/unsubscribe', { method: 'POST', token: T.cyd, body: { endpoint: sub(2).endpoint } });
    await api('/forfeits', { method: 'POST', body: { to: 'cyd', key: 'abc:4', name: 'Ana', cards: [] } });
    await settle();
    assert.equal(sent.length, 0);
  });
});
