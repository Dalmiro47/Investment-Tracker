/* DDS Investment Tracker SW - minimal offline support */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;

// Tweak these paths if needed:
const SHELL_ASSETS = [
  '/',                      // app shell entry
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Basic install: pre-cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Cleanup old caches
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

// Strategy: network-first for pages & API; cache-first for static files
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Same-origin only for static caching; let cross-origin proceed default
  const sameOrigin = url.origin === self.location.origin;

  if (isPageRequest(req)) {
    // Network-first for HTML navigation
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('/')))
    );
    return;
  }

  if (sameOrigin && isStaticAsset(url)) {
    // Cache-first for static assets
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
      )
    );
    return;
  }

  // Default: network-first for other requests (incl. API)
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
