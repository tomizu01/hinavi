// hinavi service worker
// - precache shell assets and offline fallback audio
// - cache-first for character images

const CACHE_NAME = 'hinavi-v3';
const PRECACHE_URLS = [
  '/icon-512.png',
  '/characters/misaki.png',
  '/characters/hiyori.png',
  '/audio/offline_notice.wav',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] precache miss:', url, err)),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/characters/') && !url.pathname.startsWith('/audio/')) return;

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
      return res;
    })),
  );
});
