const CACHE_NAME = 'ponto-wd-v2';
const APP_SHELL = [
  '/',
  '/login.html',
  '/index.html',
  '/admin.html',
  '/css/style.css',
  '/js/login.js',
  '/js/app.js',
  '/js/admin.js',
  '/js/pwa.js',
  '/assets/logo.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

function shouldHandleRequest(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);

  // Não intercepta chamadas de API para evitar cache de dados dinâmicos
  if (url.pathname.startsWith('/api')) return false;

  // Não intercepta requests de outros domínios (ex.: geocoding)
  if (url.origin !== self.location.origin) return false;

  return true;
}

self.addEventListener('fetch', (event) => {
  if (!shouldHandleRequest(event.request)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      }).catch(() => caches.match('/login.html'));
    })
  );
});
