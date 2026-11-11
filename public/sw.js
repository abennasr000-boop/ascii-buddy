// Optional offline support (ASCII_BUDDY_SPEC.md §3.2). The whole app is one index.html, so this just keeps a
// copy of it: the page opens instantly and works with no connection, and a fresh copy is fetched in the
// background each time it is online (so an updated deploy shows up the next time the app is opened).
// The app works fully without this file; if it is missing or blocked nothing else changes.
const CACHE = 'ascii-buddy-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('./')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || refresh;
    }),
  );
});
