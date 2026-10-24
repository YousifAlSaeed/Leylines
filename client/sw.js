// Offline support. Pages and files still come from the network first, so a new
// version shows up right away, and a copy of each is kept. With no connection,
// or a server that is still waking up (Render's free plan sleeps), the saved
// copy is used, so the game opens and Solo and Couch still work.
// The API (accounts) is never cached.
//
// One page load never mixes two versions of the game (js/version.js): a new page
// calling an old script, or the other way round, breaks it.
// - The page came from the network: so does all its code (scripts and styles),
//   however long that takes. Only if the connection drops is a saved copy used,
//   and only one of the same version.
// - The page came from a saved copy: so does all its code, from that version.
// Code is saved per version. A version opens offline only once its page and all
// its code are saved; older versions are then deleted. Pictures, sounds and other
// files can't break the game, so any saved copy will do for them.
const FILES = 'leylines-files'; // pictures, sounds and other files, from any version
const CODE = 'leylines-v'; // + the version: its page, scripts and styles
const OLD = 'leylines'; // everything, saved before code was kept per version; used until a version is ready
const READY = new URL('offline-version', location).href; // in FILES: the code cache that opens offline
const VERSION_JS = new URL('js/version.js', location).href;
const WAIT = 4000; // how long to wait for the network before using a saved copy

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') e.respondWith(page(e));
  else if (/\.(js|css)$/.test(url.pathname)) e.respondWith(code(e));
  else e.respondWith(file(req));
});

const later = (ms) => new Promise((r) => setTimeout(r, ms));

// Page loads, by the tab they're in. One from a saved copy: { cache, saved }. One
// from the network gathers its files until its version is known, then keeps them.
const loads = new Map();
function remember(id, load) {
  loads.delete(id);
  loads.set(id, load);
  if (loads.size > 10) loads.delete(loads.keys().next().value);
}
// browsers that don't say which tab a page opens in (Safari before 16) file it under ''
const loadOf = (e) => loads.get(e.clientId) || loads.get('');

// the page: from the network, or after WAIT the copy of the version that opens offline
async function page(e) {
  const req = e.request;
  const net = fetch(req);
  net.catch(() => {});
  const cache = await offlineCache();
  // invite and profile links (?join=, ?u=) open the same page
  const saved = cache ? caches.match(req, { cacheName: cache, ignoreSearch: true }) : Promise.resolve();
  const fresh = net.then((res) => ({ res }));
  const late = later(WAIT).then(() => saved).then((res) => (res ? { res, saved: true } : fresh));
  let got;
  try {
    got = await Promise.race([fresh, late]);
  } catch {
    const res = await saved;
    got = res && { res, saved: true };
  }
  if (!got) return Response.error();
  remember(e.resultingClientId || '', got.saved ? { cache, saved: true } : fromNetwork(req, got.res));
  return got.res;
}

// the code cache that opens offline: the newest version that's all saved
async function offlineCache() {
  const ready = await caches.match(READY, { cacheName: FILES });
  if (ready) return ready.text();
  if (await caches.has(OLD)) return OLD;
}

// a page load from the network: keeps its page and code once its version is known
function fromNetwork(req, res) {
  const load = { cache: null, wait: [], got: new Set(), need: null };
  const url = req.url.split('?')[0];
  if (res.status === 200) {
    res.clone().text().then((html) => { load.need = codeOf(html, url).add(url); settle(load); }).catch(() => {});
  }
  keep(load, url, res);
  return load;
}

// a script or style: from the same version as its page
async function code(e) {
  const req = e.request, load = loadOf(e);
  if (load?.saved) return (await caches.match(req, { cacheName: load.cache })) || fetch(req);
  // from the network, however long it takes, as a saved copy may be another version.
  // (A page the worker doesn't know, opened before it started, keeps nothing: its version is unknown.)
  try {
    const res = await fetch(req);
    if (load) keep(load, req.url, res);
    return res;
  } catch {
    // the connection dropped partway: a saved copy, but only of the page's version
    return (load?.cache && (await caches.match(req, { cacheName: load.cache }))) || Response.error();
  }
}

// a file of a page load from the network: kept once the load's version is known
function keep(load, url, res) {
  if (res.status !== 200) return;
  if (url === VERSION_JS) {
    res.clone().text().then((js) => {
      const v = versionOf(js);
      if (v) { load.cache = CODE + v; save(load); }
    }).catch(() => {});
  }
  load.wait.push([url, res.clone()]);
  save(load);
}

async function save(load) {
  if (!load.cache) return;
  const files = load.wait.splice(0), cache = await caches.open(load.cache);
  await Promise.all(files.map(([url, res]) => cache.put(url, res).then(() => load.got.add(url), () => {})));
  settle(load);
}

// the page and all its code are saved: this version now opens offline, and older ones go
// (not one that a page is still loading from)
async function settle(load) {
  if (load.done || !load.cache || !load.need || [...load.need].some((url) => !load.got.has(url))) return;
  load.done = true;
  await (await caches.open(FILES)).put(READY, new Response(load.cache));
  const busy = new Set([...loads.values()].filter((l) => l.saved || !l.done).map((l) => l.cache));
  for (const name of await caches.keys()) {
    if ((name === OLD || name.startsWith(CODE)) && name !== load.cache && !busy.has(name)) await caches.delete(name);
  }
}

// pictures, sounds and other files: from the network, or after WAIT any saved copy
async function file(req) {
  const cache = await caches.open(FILES);
  const net = fetch(req).then((res) => {
    if (res.status === 200) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  net.catch(() => {});
  const saved = caches.match(req); // from any version, or from before code was kept per version
  const late = later(WAIT).then(() => saved);
  try {
    return await Promise.race([net, late.then((hit) => hit || net)]);
  } catch {
    return (await saved) || Response.error();
  }
}

// the scripts and styles a page loads from this site
function codeOf(html, base) {
  const urls = new Set();
  for (const [tag] of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    if (/^<link/i.test(tag) && !/\srel=["']?stylesheet\b/i.test(tag)) continue;
    const src = /\s(?:src|href)=["']?([^"'\s>]+)/i.exec(tag);
    const url = src && new URL(src[1], base);
    if (url && url.origin === location.origin) urls.add(url.href);
  }
  return urls;
}
function versionOf(js) {
  return /VERSION\s*=\s*['"]([^'"]+)['"]/.exec(js)?.[1];
}

// Push alerts (server/lib/push.js): show the message, even with the game closed.
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Leylines', {
    body: m.body || '', tag: m.tag || 'leylines', renotify: true,
    icon: 'images/apple-touch-icon.png', data: { url: m.url || './' },
  }));
});
// tapping it: back to the game if it's open (it handles the link), otherwise open it there
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find((c) => c.url.startsWith(self.registration.scope)) || wins[0];
    if (w) {
      try { await w.focus(); } catch { /* some browsers only allow focus from a click, which this is */ }
      w.postMessage({ t: 'alert', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
