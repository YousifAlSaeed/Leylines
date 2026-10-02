// Offline support. Pages and files still come from the network first, so a new
// version shows up right away, and a copy of each is kept. With no connection,
// or a server that is still waking up (Render's free plan sleeps), the saved
// copy is used, so the game opens and vs Computer / Same screen still work.
// The API (accounts) is never cached.
const CACHE = 'leylines';
const WAIT = 4000; // how long to wait for the network before using a saved copy

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then((res) => {
    if (res.status === 200) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  net.catch(() => {});
  // invite and profile links (?join=, ?u=) open the same page
  const saved = cache.match(req, { ignoreSearch: req.mode === 'navigate' });
  const late = new Promise((r) => setTimeout(r, WAIT)).then(() => saved);
  try {
    return await Promise.race([net, late.then((hit) => hit || net)]);
  } catch {
    return (await saved) || Response.error();
  }
}
