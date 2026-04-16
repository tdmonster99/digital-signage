// Service Worker — Zigns Display (display.html)
// Caches: display.html shell + CloudFront media assets (images/videos)
// Strategy: network-first for shell, cache-first for media

const SHELL_CACHE = 'signage-display-shell-v1';
const MEDIA_CACHE = 'signage-display-media-v1';

// ── Install: pre-cache the display shell ─────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.add('/display.html'))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove any old cache versions ───────────────────────────────────
self.addEventListener('activate', e => {
  const keep = [SHELL_CACHE, MEDIA_CACHE];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // display.html shell — network-first, cache fallback
  if (url.pathname === '/display.html') {
    e.respondWith(networkFirst(e.request, SHELL_CACHE));
    return;
  }

  // CloudFront media (images, videos) — cache-first, network fallback
  if (url.hostname.endsWith('.cloudfront.net')) {
    e.respondWith(cacheFirst(e.request, MEDIA_CACHE));
    return;
  }
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (_) {
    const cached = await caches.match(req);
    return cached || Response.error();
  }
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (_) {
    return Response.error();
  }
}
