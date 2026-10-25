// Announcements: developers write posts, every game reads the ones showing now, and a post can send a
// push alert when it starts. The push service is faked. Fresh in-memory database.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

Object.assign(process.env, { EMAIL_KEY: 'test-email-key-0123456789abcdefghij', APP_URL: 'https://game.test', DEV_USERS: 'dee, eve' });
delete process.env.RESEND_API_KEY;
delete process.env.RENDER;
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
const { openSqlite } = await import('../server/db/sqlite.js');
const { createApp } = await import('../server/app.js');
const { checkPost, plain, TITLE_MAX, BODY_MAX, MAX_DAYS } = await import('../server/lib/news.js');
const { TEAM } = await import('../server/routes/news.js');

const sent = [];
const pushSend = async (sub, body) => { sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) }); };

let db, server, base;
const T = {};
const DAY = 864e5;
before(async () => {
  db = await openSqlite(null);
  server = createApp({ db, clientDir: fileURLToPath(new URL('../client', import.meta.url)), pushSend }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['dee', 'eve', 'ana']) {
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
const post = (fields, who = 'dee') => api('/news', { method: 'POST', token: T[who], body: { ...base0(), ...fields } });
const base0 = () => ({ title: 'Double shards', body: 'Every win pays **twice** the shards.', kind: 'event', show: ['banner'], who: 'all', by: 'dee', end: Date.now() + DAY });
const live = async () => (await api('/news')).body;
const settle = () => new Promise((r) => setTimeout(r, 60));

describe('announcements', () => {
  test('nothing to read at first, and anyone can ask', async () => {
    const r = await live();
    assert.deepEqual(r.posts, []);
    assert.equal(r.next, null);
  });

  test('only developers can write, see every post, change or end one', async () => {
    assert.equal((await post({}, 'ana')).status, 403);
    assert.equal((await api('/news', { method: 'POST', body: base0() })).status, 401);
    assert.equal((await api('/news/all', { token: T.ana })).status, 403);
    assert.equal((await api('/news/1/end', { method: 'POST', token: T.ana })).status, 403);
    assert.equal((await api('/news/1', { method: 'DELETE', token: T.ana })).status, 403);
  });

  test('a post goes out now and every game gets it', async () => {
    const r = await post({ show: ['banner', 'big', 'note', 'banner', 'loud'] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.post.show, ['note', 'banner', 'big'], 'kept in order, repeats and unknown ones dropped');
    const l = await live();
    assert.equal(l.posts.length, 1);
    const p = l.posts[0];
    assert.equal(p.title, 'Double shards');
    assert.equal(p.by, 'dee');
    assert.equal(p.alert, undefined, 'players are not told about alerts or drafts');
    assert.equal(p.draft, undefined);
    await api(`/news/${p.id}`, { method: 'DELETE', token: T.dee });
  });

  test('a post can be from each developer, both of them, or the team, and nobody else', async () => {
    const { signs } = (await api('/news/all', { token: T.eve })).body;
    assert.deepEqual(signs, ['dee', 'eve', 'dee and eve', TEAM]);
    assert.equal((await post({ by: 'ana' })).status, 400);
    for (const by of signs) {
      const r = await post({ by }, 'eve');
      assert.equal(r.status, 200, by);
      await api(`/news/${r.body.post.id}`, { method: 'DELETE', token: T.eve });
    }
  });

  test('scheduled posts and drafts stay hidden until they show', async () => {
    const start = Date.now() + 3 * 3600e3;
    const s = (await post({ start, end: start + DAY })).body.post;
    const d = (await post({ draft: true, body: '' })).body.post;
    assert.ok(d.draft, 'a draft needs no message yet');
    const l = await live();
    assert.deepEqual(l.posts, []);
    assert.equal(l.next, start, 'games know when to ask again');
    const all = (await api('/news/all', { token: T.dee })).body.posts.map((p) => p.id);
    assert.ok(all.includes(s.id) && all.includes(d.id), 'the writing screen sees both');
    // the draft goes out
    const r = await api(`/news/${d.id}`, { method: 'PUT', token: T.dee, body: { ...base0(), title: 'Now live' } });
    assert.equal(r.status, 200);
    assert.deepEqual((await live()).posts.map((p) => p.title), ['Now live']);
    for (const id of [s.id, d.id]) await api(`/news/${id}`, { method: 'DELETE', token: T.dee });
  });

  test('ending a post takes it down, and it can be put up again', async () => {
    const p = (await post({})).body.post;
    const e = await api(`/news/${p.id}/end`, { method: 'POST', token: T.dee });
    assert.equal(e.status, 200);
    assert.ok(e.body.post.end <= Date.now());
    assert.deepEqual((await live()).posts, []);
    const again = await api(`/news/${p.id}`, { method: 'PUT', token: T.dee, body: base0() });
    assert.equal(again.status, 200);
    assert.equal((await live()).posts.length, 1);
    assert.equal((await api(`/news/${p.id}`, { method: 'DELETE', token: T.dee })).status, 204);
    assert.equal((await api(`/news/${p.id}`, { method: 'DELETE', token: T.dee })).status, 404);
    assert.equal((await api('/news/abc/end', { method: 'POST', token: T.dee })).status, 404);
  });

  test('open games hear that the posts changed', async () => {
    const v0 = (await api('/pulse', { method: 'POST', token: T.ana, body: { menu: true } })).body.nw;
    const p = (await post({})).body.post;
    const v1 = (await api('/pulse', { method: 'POST', token: T.ana, body: { menu: true } })).body.nw;
    assert.ok(v1 > v0);
    await api(`/news/${p.id}`, { method: 'DELETE', token: T.dee });
  });

  test('an alert goes to everyone with alerts on, once, when the post starts', async () => {
    await api('/push/subscribe', { method: 'POST', token: T.ana, body: { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/ana-1', keys: { p256dh: 'BPk3ya', auth: 'aua' } } } });
    const p = (await post({ alert: true })).body.post;
    await settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].title, 'Double shards');
    assert.equal(sent[0].body, 'Every win pays twice the shards.', 'no ** marks in an alert');
    assert.equal(sent[0].url, `./?news=${p.id}`);
    // changing the post doesn't send it again
    await api(`/news/${p.id}`, { method: 'PUT', token: T.dee, body: { ...base0(), alert: true, title: 'Changed' } });
    await settle();
    assert.equal(sent.length, 1);
    // no alert without asking for one, and none for "older games" posts
    const q = (await post({})).body.post;
    const o = (await post({ who: 'old', ver: '0.30.0', alert: true })).body.post;
    await settle();
    assert.equal(sent.length, 1);
    assert.equal(o.alert, false);
    for (const id of [p.id, q.id, o.id]) await api(`/news/${id}`, { method: 'DELETE', token: T.dee });
  });

  test('a post is checked before it goes out', () => {
    const signs = ['dee'], now = 1_000_000_000_000;
    const ok = { title: 'Hi', body: 'There', kind: 'thanks', show: ['note'], who: 'all', by: 'dee', end: now + DAY };
    assert.ok(checkPost(ok, signs, now).post);
    assert.equal(checkPost(ok, signs, now).post.start, now, 'no start means now');
    const bad = (f) => checkPost({ ...ok, ...f }, signs, now).error;
    assert.ok(bad({ title: '  ' }));
    assert.ok(bad({ title: 'x'.repeat(TITLE_MAX + 1) }));
    assert.ok(bad({ body: '' }));
    assert.ok(bad({ body: 'x'.repeat(BODY_MAX + 1) }));
    assert.ok(bad({ kind: 'party' }));
    assert.ok(bad({ show: [] }));
    assert.ok(bad({ show: 'note' }));
    assert.ok(bad({ who: 'friends' }));
    assert.ok(bad({ who: 'old', ver: 'latest' }));
    assert.ok(bad({ by: 'eve' }));
    assert.ok(bad({ end: now - 1 }));
    assert.ok(bad({ start: now + DAY, end: now + DAY }));
    assert.ok(bad({ end: now + (MAX_DAYS + 1) * DAY }));
    assert.ok(!bad({ draft: true, end: now - 1, start: now - DAY }), 'a draft can keep old dates');
    assert.equal(checkPost({ ...ok, title: 'A\u0007b', body: 'one\n\n\n\ntwo' }, signs, now).post.title, 'Ab');
    assert.equal(checkPost({ ...ok, body: 'one\n\n\n\ntwo' }, signs, now).post.body, 'one\n\ntwo');
    assert.equal(plain('**Big** `news`\n now'), 'Big news now');
  });
});
