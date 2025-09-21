/* DDS Investment Tracker SW - minimal offline support (stable) */
const CACHE_VERSION = 'v5';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, STATIC_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

const isPageRequest = (req) =>
  req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

const isStaticAsset = (url) =>
  /\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?|ttf|otf|eot|map)$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 🚫 Never intercept API calls (auth/session, etc.)
  if (sameOrigin && url.pathname.startsWith('/api/')) {
    return; // let it hit the network normally
  }

  if (isPageRequest(req)) {
    // Network-first for HTML (cache a clone using waitUntil to avoid double-reading)
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          event.waitUntil(
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, clone))
          );
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('/')))
    );
    return;
  }

  if (sameOrigin && isStaticAsset(url)) {
    // Cache-first for static assets (clone once, cache via waitUntil)
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const clone = res.clone();
          event.waitUntil(
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone))
          );
          return res;
        });
      })
    );
    return;
  }

  // Default: network-first with offline fallback
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
