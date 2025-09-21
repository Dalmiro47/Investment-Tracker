/* DDS Investment Tracker SW - minimal offline support */
const CACHE_VERSION = 'v4';
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
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![SHELL_CACHE, STATIC_CACHE].includes(k)).map((k) => caches.delete(k)))
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
    return; // let the request hit the network normally
  }

  if (isPageRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('/')))
    );
    return;
  }

  if (sameOrigin && isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  event.respondWith(fetch(req).catch(() => caches.match(req)));
});