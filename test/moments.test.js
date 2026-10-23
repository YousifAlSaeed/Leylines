// Moments: friends' news made from saves (server/lib/moments.js), the feed in the friends list and reactions.
// Runs against a fresh in-memory database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadGame } from './client.js';

Object.assign(process.env, { EMAIL_KEY: 'test-email-key-0123456789abcdefghij', APP_URL: 'https://game.test' });
delete process.env.RESEND_API_KEY;
delete process.env.RENDER;
const { openSqlite } = await import('../server/db/sqlite.js');
const { createApp } = await import('../server/app.js');
const { LEGENDS, TITLE_AT, REACTIONS, STREAK_STEP, levelOf, momentsBetween } = await import('../server/lib/moments.js');

describe('the server knows the game\'s rules', () => {
  const g = loadGame();
  test('5★ cards', () => assert.deepEqual([...LEGENDS], [...g.CARDS.filter((c) => c.rar === 5).map((c) => c.id)]));
  test('levels', () => { for (const xp of [0, 99, 100, 299, 300, 5000, 25000]) assert.equal(levelOf(xp), g.levelOf(xp), `xp ${xp}`); });
  test('titles', () => {
    const src = fs.readFileSync(new URL('../client/js/profile.js', import.meta.url), 'utf8');
    const at = [...src.match(/const TITLES=\[(.*?)\];/)[1].matchAll(/\[(\d+),'/g)].map((m) => Number(m[1]));
    assert.deepEqual(at.slice(1), TITLE_AT);
  });
});

describe('what makes a moment', () => {
  const kinds = (p, n) => momentsBetween(p, n, '2026-10-23').map((m) => m.key);
  test('a 5★ card found for the first time', () => {
    assert.deepEqual(kinds({ seen: [1, 2] }, { seen: [1, 2, 3, 50] }), ['c50']);
    assert.deepEqual(kinds({ seen: [50] }, { seen: [50] }), []);
  });
  test('a new title, only the highest when several are passed', () => {
    assert.deepEqual(kinds({ xp: 0 }, { xp: 100 }), []); // level 2
    assert.deepEqual(kinds({ xp: 200 }, { xp: 300 }), ['t3']); // level 3: Apprentice
    assert.deepEqual(kinds({ xp: 0 }, { xp: 2800 }), ['t8']); // level 8 in one go
  });
  test('the Gauntlet cleared, once a day', () => {
    const won = { at: 400, g: { run: 1, over: 1, stage: 3 } };
    assert.deepEqual(kinds({ trial: { at: 400, g: { run: 1, stage: 2 } } }, { trial: won }), ['g400']);
    assert.deepEqual(kinds({ trial: won }, { trial: won }), []);
    assert.deepEqual(kinds({ trial: { at: 400, g: { run: 1, over: 1, stage: 1 } } }, { trial: { at: 400, g: { run: 1, over: 1, stage: 1 } } }), []);
  });
  test('every few online wins in a row', () => {
    assert.deepEqual(kinds({ ostreak: STREAK_STEP - 1 }, { ostreak: STREAK_STEP }), [`s2026-10-23-1`]);
    assert.deepEqual(kinds({ ostreak: STREAK_STEP }, { ostreak: STREAK_STEP + 1 }), []);
    assert.deepEqual(kinds({ ostreak: 0 }, { ostreak: 0 }), []);
  });
});

let db, server, base;
const T = {};
async function api(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(base + '/api' + path, {
    method, body: body && JSON.stringify(body),
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
const saveAs = (who, data) => api('/me/save', { method: 'PUT', token: T[who], body: { data, force: true } });
const feed = async (who) => (await api('/friends', { token: T[who] })).body.moments;
const react = (who, id, emoji) => api(`/friends/moments/${id}/react`, { method: 'POST', token: T[who], body: { emoji } });

describe('the feed', () => {
  before(async () => {
    db = await openSqlite(null);
    server = createApp({ db, clientDir: fileURLToPath(new URL('../client', import.meta.url)) }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
    for (const name of ['ana', 'bob', 'cyd']) {
      const r = await api('/auth/signup', { method: 'POST', body: { username: name, password: `${name}-pass-1`, save: { xp: 0, seen: [1, 2, 3] } } });
      T[name] = r.body.token;
    }
    // ana and bob are friends; cyd is nobody's
    await api('/friends/requests', { method: 'POST', token: T.ana, body: { username: 'bob' } });
    await api('/friends/requests', { method: 'POST', token: T.bob, body: { username: 'ana' } });
  });
  after(() => server.close());

  test('a friend\'s new 5★ card and title show up, newest first; not your own, and not to strangers', async () => {
    assert.equal((await saveAs('bob', { xp: 0, seen: [1, 2, 3, 52] })).status, 200);
    assert.equal((await saveAs('bob', { xp: 300, seen: [1, 2, 3, 52] })).status, 200);
    const m = await feed('ana');
    assert.deepEqual(m.map((x) => [x.username, x.kind, x.data]), [['bob', 'title', { lv: 3 }], ['bob', 'card', { c: 52 }]]);
    assert.deepEqual(m[0].re, {});
    assert.equal(m[0].mine, null);
    assert.deepEqual(await feed('bob'), []);
    assert.deepEqual(await feed('cyd'), []);
  });

  test('the same save again makes nothing new', async () => {
    await saveAs('bob', { xp: 300, seen: [1, 2, 3, 52] });
    assert.equal((await feed('ana')).length, 2);
  });

  test('a player who hides their history makes no moments', async () => {
    await saveAs('bob', { xp: 300, seen: [1, 2, 3, 52, 53], hideHist: true });
    assert.equal((await feed('ana')).length, 2);
  });

  test('reacting: one emoji each, the same again takes it back, only on a friend\'s moment', async () => {
    const [m] = await feed('ana');
    let r = await react('ana', m.id, REACTIONS[0]);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { re: { [REACTIONS[0]]: 1 }, mine: REACTIONS[0] });
    r = await react('ana', m.id, REACTIONS[1]);
    assert.deepEqual(r.body, { re: { [REACTIONS[1]]: 1 }, mine: REACTIONS[1] });
    const again = (await feed('ana'))[0];
    assert.deepEqual([again.re, again.mine], [{ [REACTIONS[1]]: 1 }, REACTIONS[1]]);
    r = await react('ana', m.id, REACTIONS[1]);
    assert.deepEqual(r.body, { re: {}, mine: null });
    assert.equal((await react('cyd', m.id, REACTIONS[0])).status, 404);
    assert.equal((await react('ana', m.id, '💩')).status, 400);
    assert.equal((await react('ana', 99999, REACTIONS[0])).status, 404);
  });

  test('a deleted account takes its moments with it', async () => {
    await db.run("DELETE FROM users WHERE username = 'bob'");
    assert.deepEqual(await feed('ana'), []);
    assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM moments')).n), 0);
  });
});
