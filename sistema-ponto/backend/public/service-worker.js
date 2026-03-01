const STATIC_CACHE = 'ponto-wd-static-v3';
const API_CACHE = 'ponto-wd-api-v1';

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
  '/assets/app-icon.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const keep = [STATIC_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isApiGetToCache(url, request) {
  if (request.method !== 'GET') return false;
  if (!isSameOrigin(url)) return false;

  return (
    url.pathname.startsWith('/api/stats') ||
    url.pathname.startsWith('/api/records')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!isSameOrigin(url)) {
    return;
  }

  if (isApiGetToCache(url, request)) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match('/login.html'));
    })
  );
});
