// Offline support (client/sw.js), run against a fake network and a fake cache.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import vm from 'node:vm';

const ORIGIN = 'https://game.test';
const FAST = 20; // the worker's clock runs this many times faster here, so its 4-second wait is short
const sleep = (ms) => new Promise((r) => setTimeout(r, ms / FAST));
const idle = () => new Promise((r) => setImmediate(r)); // lets the worker finish saving
const strip = (u) => u.split('?')[0];

class Res {
  constructor(body, status = 200) { this.body = body; this.status = status; }
  clone() { return this; }
  async text() { return this.body; }
  static error() { return { error: true }; }
}
const ok = (body) => new Res(body);
const offline = () => Promise.reject(new TypeError('Failed to fetch'));

// a fake CacheStorage: name → (url → response)
function fakeCaches(all = new Map()) {
  const key = (r) => (typeof r === 'string' ? r : r.url);
  const find = (store, req, o = {}) => (o.ignoreSearch
    ? [...store].find(([k]) => strip(k) === strip(key(req)))?.[1]
    : store.get(key(req)));
  return {
    all,
    open: async (name) => {
      if (!all.has(name)) all.set(name, new Map());
      const store = all.get(name);
      return { put: async (req, res) => { store.set(key(req), res); }, match: async (req, o) => find(store, req, o) };
    },
    match: async (req, o = {}) => {
      for (const [name, store] of all) {
        if (o.cacheName && name !== o.cacheName) continue;
        const hit = find(store, req, o);
        if (hit) return hit;
      }
    },
    has: async (name) => all.has(name),
    keys: async () => [...all.keys()],
    delete: async (name) => all.delete(name),
  };
}

// loads sw.js with a fake `fetch` and cache; `send` gives it one request from a tab
function worker(network, caches = fakeCaches()) {
  const handlers = {};
  const ctx = vm.createContext({
    self: { addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    location: new URL(ORIGIN), URL, Promise, setTimeout: (fn, ms) => setTimeout(fn, ms / FAST),
    caches, fetch: network, Response: Res,
  });
  vm.runInContext(fs.readFileSync(new URL('../client/sw.js', import.meta.url), 'utf8'), ctx);
  const send = async (path, { method = 'GET', mode = 'no-cors', tab = 'tab1' } = {}) => {
    let reply = null;
    const nav = mode === 'navigate';
    handlers.fetch({
      request: { url: path.startsWith('http') ? path : ORIGIN + path, method, mode },
      clientId: nav ? '' : tab, resultingClientId: nav ? tab : '', respondWith: (p) => { reply = p; },
    });
    return reply && reply.then((r) => r);
  };
  return { send, caches, ctx };
}

// a tiny game: the page and its code, as version v serves them
const PAGE = '<link rel="stylesheet" href="css/menu.css"><script src="js/version.js"></script><script src="js/menu.js"></script>';
const CODE = ['/css/menu.css', '/js/version.js', '/js/menu.js'];
const body = (v, path) => (path === '/' ? PAGE : path === '/js/version.js' ? `const VERSION='${v}';` : `${path} v${v}`);
// a server with version v; `slow` delays the answers for some paths (ms of the worker's time)
const server = (v, slow = {}) => async (req) => {
  const path = new URL(req.url).pathname;
  if (slow[path]) await sleep(slow[path]);
  return ok(body(v, path));
};
const as = (v) => Object.fromEntries(['/', ...CODE].map((p) => [p, body(v, p)]));
// opens the page in a tab and loads its code, like a browser; returns what each path got
async function open(w, tab, paths = ['/', ...CODE]) {
  const got = {};
  for (const p of paths) {
    const res = await w.send(p, p === '/' ? { mode: 'navigate', tab } : { tab });
    got[p] = res.error ? 'network error' : res.body;
  }
  await idle();
  return got;
}
// a worker whose network can be swapped: w.net = ...
function site(v) {
  const w = worker((req) => w.net(req));
  w.net = server(v);
  return w;
}

describe('offline support', () => {
  test('online, files come from the network and a copy is kept', async () => {
    const w = site('1');
    assert.deepEqual(await open(w, 'a'), as('1'));
    assert.equal(w.caches.all.get('leylines-v1').get(ORIGIN + '/js/menu.js').body, '/js/menu.js v1');
  });
  test('offline, the page and its code come from the saved copies', async () => {
    const w = site('1');
    await open(w, 'a');
    w.net = offline;
    assert.deepEqual(await open(w, 'b'), as('1'));
  });
  test('an invite link opens the saved page when offline', async () => {
    const w = site('1');
    await open(w, 'a');
    w.net = offline;
    assert.equal((await w.send('/?join=ABCDE', { mode: 'navigate', tab: 'b' })).body, PAGE);
  });
  test('a server that is slow to wake up: the saved page after a few seconds, and all its code from that same version', async () => {
    const w = site('1');
    await open(w, 'a');
    w.net = server('2', { '/': 8000 }); // a new version went up; the page is slow, its code isn't
    const t0 = Date.now();
    assert.deepEqual(await open(w, 'b'), as('1'));
    assert.ok(Date.now() - t0 < 6000 / FAST);
  });
  test('a new page from the network waits for its own code, not an old saved copy', async () => {
    const w = site('1');
    await open(w, 'a');
    w.net = server('2', { '/js/menu.js': 8000 });
    assert.deepEqual(await open(w, 'b'), as('2'));
  });
  test('a version opens offline only once all its code is saved', async () => {
    const w = site('1');
    await open(w, 'a');
    w.net = server('2');
    await open(w, 'b', ['/', '/js/version.js']); // the connection dropped before the rest came
    w.net = offline;
    assert.deepEqual(await open(w, 'c'), as('1'));
  });
  test('once a new version is all saved, it opens offline and the old one is deleted', async () => {
    const w = site('1');
    await open(w, 'a');
    w.net = server('2');
    await open(w, 'b');
    assert.ok(!w.caches.all.has('leylines-v1'));
    w.net = offline;
    assert.deepEqual(await open(w, 'c'), as('2'));
  });
  test('the connection drops partway: a saved copy only of the same version', async () => {
    const w = site('1');
    await open(w, 'a');
    const drop = (v) => (req) => (req.url.endsWith('/js/menu.js') ? offline() : server(v)(req));
    w.net = drop('2');
    assert.equal((await open(w, 'b'))['/js/menu.js'], 'network error'); // not v1's copy
    w.net = server('2');
    await open(w, 'c');
    w.net = drop('2');
    assert.deepEqual(await open(w, 'd'), as('2'));
  });
  test('a version that is still loading in one tab is not deleted under it', async () => {
    const w = site('1');
    await open(w, 'a');
    w.net = server('2', { '/': 8000 });
    await open(w, 'b', ['/', '/css/menu.css']); // tab b opens the saved v1 while the server wakes up
    w.net = server('2');
    await open(w, 'c'); // tab c gets v2
    assert.ok(w.caches.all.has('leylines-v1'));
    w.net = offline;
    assert.equal((await w.send('/js/menu.js', { tab: 'b' })).body, '/js/menu.js v1');
  });
  test('a page opened before the worker started: its code comes from the network and nothing is kept', async () => {
    const w = site('1');
    assert.equal((await w.send('/js/menu.js', { tab: 'unknown' })).body, '/js/menu.js v1');
    await idle();
    assert.deepEqual([...w.caches.all.keys()], []);
  });
  test('browsers that don\'t say which tab a page is in (Safari before 16) follow the latest page load', async () => {
    const w = site('1');
    await open(w, 'a');
    w.net = server('2', { '/': 8000 });
    await w.send('/', { mode: 'navigate', tab: '' });
    assert.equal((await w.send('/js/menu.js', { tab: 'not-told' })).body, '/js/menu.js v1');
  });
  test('copies saved before code was kept per version still open the game, until a version is ready', async () => {
    const caches = fakeCaches(new Map([['leylines', new Map(['/', ...CODE].map((p) => [ORIGIN + p, ok(body('0', p))]))]]));
    const before = worker(offline, caches);
    assert.deepEqual(await open(before, 'a'), as('0'));
    const after = worker(server('1'), caches); // the worker restarted, back online
    await open(after, 'b');
    assert.deepEqual([...caches.all.keys()].sort(), ['leylines-files', 'leylines-v1']);
  });
  test('pictures and sounds: from the network, or a saved copy of any version after a few seconds', async () => {
    const w = site('1');
    assert.equal((await w.send('/audio/sfx/flip.mp3')).body, '/audio/sfx/flip.mp3 v1');
    w.net = server('2', { '/audio/sfx/flip.mp3': 8000 });
    const t0 = Date.now();
    assert.equal((await w.send('/audio/sfx/flip.mp3')).body, '/audio/sfx/flip.mp3 v1');
    assert.ok(Date.now() - t0 < 6000 / FAST);
  });
  test('offline with nothing saved gives a network error', async () => {
    const w = worker(offline);
    for (const [path, o] of [['/', { mode: 'navigate' }], ['/js/menu.js'], ['/nothing.png']]) {
      assert.deepEqual({ ...(await w.send(path, o)) }, { error: true });
    }
  });
  test('accounts (the API), other sites and changes are never cached', async () => {
    const w = worker(async () => ok('x'));
    assert.equal(await w.send('/api/me'), null);
    assert.equal(await w.send('/api/auth/login', { method: 'POST' }), null);
    assert.equal(await w.send('https://unpkg.com/peerjs.min.js'), null);
    assert.equal(w.caches.all.size, 0);
  });
  test('the real game: every script and style the page loads exists, and the worker reads the version', () => {
    const { ctx } = worker(offline);
    const code = [...ctx.codeOf(fs.readFileSync(new URL('../client/index.html', import.meta.url), 'utf8'), ORIGIN + '/')];
    assert.ok(code.some((u) => u.endsWith('/js/version.js')) && code.some((u) => u.endsWith('/css/base.css')));
    for (const u of code) assert.ok(fs.existsSync(new URL('../client' + new URL(u).pathname, import.meta.url)), u);
    const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(ctx.versionOf(fs.readFileSync(new URL('../client/js/version.js', import.meta.url), 'utf8')), version);
  });
});
