// Offline support (client/sw.js), run against a fake network and a fake cache.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import vm from 'node:vm';

const ORIGIN = 'https://game.test';
const strip = (u) => u.split('?')[0];

// loads sw.js with a fake `fetch` and cache; returns a function that sends it one request
function worker(network) {
  const handlers = {}, store = new Map();
  const cache = {
    put: async (req, res) => { store.set(req.url, res); },
    match: async (req, o = {}) => (o.ignoreSearch ? [...store].find(([k]) => strip(k) === strip(req.url))?.[1] : store.get(req.url)),
  };
  const ctx = vm.createContext({
    self: { addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    location: new URL(ORIGIN), URL, setTimeout, Promise,
    caches: { open: async () => cache },
    fetch: network, Response: { error: () => ({ error: true }) },
  });
  vm.runInContext(fs.readFileSync(new URL('../client/sw.js', import.meta.url), 'utf8'), ctx);
  const send = async (path, { method = 'GET', mode = 'no-cors' } = {}) => {
    let reply = null;
    handlers.fetch({ request: { url: path.startsWith('http') ? path : ORIGIN + path, method, mode }, respondWith: (p) => { reply = p; } });
    return reply && reply.then((r) => r);
  };
  return { send, store };
}
const ok = (body) => ({ status: 200, body, clone() { return this; } });
const offline = () => Promise.reject(new TypeError('Failed to fetch'));

describe('offline support', () => {
  test('online, files come from the network and a copy is kept', async () => {
    const w = worker(async () => ok('new'));
    assert.equal((await w.send('/js/game.js')).body, 'new');
    assert.equal(w.store.get(ORIGIN + '/js/game.js').body, 'new');
  });
  test('offline, the saved copy is used', async () => {
    let net = async () => ok('saved');
    const w = worker((...a) => net(...a));
    await w.send('/js/game.js');
    net = offline;
    assert.equal((await w.send('/js/game.js')).body, 'saved');
  });
  test('an invite link opens the saved page when offline', async () => {
    let net = async () => ok('page');
    const w = worker((...a) => net(...a));
    await w.send('/', { mode: 'navigate' });
    net = offline;
    assert.equal((await w.send('/?join=ABCDE', { mode: 'navigate' })).body, 'page');
  });
  test('a server that is slow to wake up: the saved copy is used after a few seconds', async () => {
    let net = async () => ok('saved');
    const w = worker((...a) => net(...a));
    await w.send('/index.html');
    net = () => new Promise((r) => setTimeout(() => r(ok('late')), 8000).unref());
    const t0 = Date.now();
    assert.equal((await w.send('/index.html')).body, 'saved');
    assert.ok(Date.now() - t0 < 6000);
  });
  test('offline with nothing saved gives a network error', async () => {
    assert.deepEqual({ ...(await worker(offline).send('/nothing.js')) }, { error: true });
  });
  test('accounts (the API), other sites and changes are never cached', async () => {
    const w = worker(async () => ok('x'));
    assert.equal(await w.send('/api/me'), null);
    assert.equal(await w.send('/api/auth/login', { method: 'POST' }), null);
    assert.equal(await w.send('https://unpkg.com/peerjs.min.js'), null);
    assert.equal(w.store.size, 0);
  });
});
