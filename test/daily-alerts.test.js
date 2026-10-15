// The evening daily reminder (server/lib/dailyAlerts.js). The push service is faked. Fresh in-memory database.
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
const { dailyWaiting, reminderText } = await import('../server/lib/dailyAlerts.js');

const sent = [];
const pushSend = async (sub, body) => { sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) }); };

let db, server, base, app;
const T = {};
// 2026-10-15 at 15:00 UTC = 18:00 game time (UTC+3); 14:00 UTC = 17:00
const EVENING = Date.UTC(2026, 9, 15, 15), AFTERNOON = Date.UTC(2026, 9, 15, 14), DAY = '2026-10-15';
before(async () => {
  db = await openSqlite(null);
  app = createApp({ db, clientDir: fileURLToPath(new URL('../client', import.meta.url)), pushSend });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['ana', 'bob', 'cyd', 'dee']) {
    const r = await api('/auth/signup', { method: 'POST', body: { username: name, password: `${name}-pass-1` } });
    T[name] = r.body.token;
  }
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
const saveAs = (who, data) => api('/me/save', { method: 'PUT', token: T[who], body: { data, baseRev: undefined, force: true } });
const tick = (now) => app.locals.dailyAlerts.tick(now);

describe('daily reminder', () => {
  test('what is still waiting in a save', () => {
    assert.deepEqual(dailyWaiting({}, DAY), { pack: true, left: 3 });
    assert.deepEqual(dailyWaiting({ daily: { at: DAY }, trial: { at: '2026-10-14', duel: 1, puz: 2, g: { run: 1 } } }, DAY), { pack: false, left: 3 });
    assert.deepEqual(dailyWaiting({ daily: { at: DAY }, trial: { at: DAY, duel: 1, puz: 0, g: { run: 0 } } }, DAY), { pack: false, left: 2 });
    assert.deepEqual(dailyWaiting({ daily: { at: DAY }, trial: { at: DAY, duel: 1, puz: 1, g: { run: 2 } } }, DAY), { pack: false, left: 0 });
    assert.equal(reminderText({ pack: false, left: 0 }), null);
    assert.match(reminderText({ pack: true, left: 3 }), /daily pack and today's Daily challenges/);
    assert.match(reminderText({ pack: false, left: 1 }), /^1 Daily challenge left/);
  });

  test('one alert in the evening, only to players with something waiting', async () => {
    await api('/push/subscribe', { method: 'POST', token: T.ana, body: { sub: sub(1) } });
    await api('/push/subscribe', { method: 'POST', token: T.bob, body: { sub: sub(2) } });
    await api('/push/subscribe', { method: 'POST', token: T.dee, body: { sub: sub(4) } });
    await saveAs('ana', { daily: { at: '2026-10-14' } });                                                 // pack and all 3 waiting
    await saveAs('bob', { daily: { at: DAY }, trial: { at: DAY, duel: 1, puz: 2, g: { run: 1 } } });     // all done
    await saveAs('cyd', {});                                                                              // alerts off
    // dee never synced a save: no alert

    assert.equal(await tick(AFTERNOON), 0);
    assert.equal(sent.length, 0);

    assert.equal(await tick(EVENING), 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].endpoint, sub(1).endpoint);
    assert.equal(sent[0].tag, 'daily');
    assert.equal(sent[0].url, './?daily=1');
    assert.match(sent[0].body, /daily pack/);

    // not again the same day, even after a restart
    assert.equal(await tick(EVENING + 3600e3), 0);
    // but again the next evening, when bob's dailies are new again too
    assert.equal(await tick(EVENING + 864e5), 2);

    // ana turns the daily reminder off in Settings: alerts stay on, but no reminder
    await saveAs('ana', { daily: { at: '2026-10-14' }, dailyAlert: false });
    assert.equal(await tick(EVENING + 2 * 864e5), 1);
    assert.ok(sent.slice(-1)[0].endpoint === sub(2).endpoint);
  });
});
