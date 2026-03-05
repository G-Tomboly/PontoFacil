/* ==================================================
   service-worker.js — WD Manutenções v5
   ================================================== */

const STATIC_CACHE   = 'wd-static-v5';
const API_CACHE      = 'wd-api-v3';
const SYNC_TAG       = 'wd-sync-records';

const APP_SHELL = [
  '/',
  '/login.html',
  '/index.html',
  '/admin.html',
  '/css/style.css',
  '/js/pwa.js',
  '/js/login.js',
  '/js/app.js',
  '/js/admin.js',
  '/assets/logo.svg',
  '/manifest.webmanifest'
];

/* ===== INSTALL ===== */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Install failed:', err))
  );
});

/* ===== ACTIVATE ===== */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ===== FETCH ===== */
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Ignora outras origens (Nominatim, Google Maps, etc.)
  if (url.origin !== self.location.origin) return;

  // POST /api/record → offline-first
  if (url.pathname === '/api/record' && request.method === 'POST') {
    e.respondWith(handleRecordPost(request));
    return;
  }

  // GET /api/* → network-first, fallback cache
  if (url.pathname.startsWith('/api/') && request.method === 'GET') {
    e.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Assets estáticos → cache-first
  if (request.method === 'GET') {
    e.respondWith(cacheFirst(request));
    return;
  }
});

/* ===== BACKGROUND SYNC ===== */
self.addEventListener('sync', e => {
  if (e.tag === SYNC_TAG) e.waitUntil(syncPending());
});

/* ===== PUSH ===== */
self.addEventListener('push', e => {
  const data = e.data?.json() || { title: 'WD Manutenções', body: 'Notificação' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/logo.svg'
    })
  );
});

/* ==================================================
   HANDLERS
   ================================================== */
async function handleRecordPost(req) {
  try {
    const res = await fetch(req.clone());
    if (res.ok) return res;
    throw new Error('Server error ' + res.status);
  } catch {
    const body = await req.clone().json();
    await saveToIDB(body);
    if (self.registration.sync) {
      await self.registration.sync.register(SYNC_TAG);
    }
    return new Response(JSON.stringify({
      success: true,
      offline: true,
      message: 'Registro salvo offline. Será sincronizado ao reconectar.'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const c = await caches.open(cacheName);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response(JSON.stringify({ error: 'Offline', records: [], users: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const c = await caches.open(STATIC_CACHE);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    return caches.match('/login.html');
  }
}

/* ==================================================
   INDEXEDDB — fila offline
   ================================================== */
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('wd-offline-v2', 1);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'offlineId' });
      }
    };
    r.onsuccess = e => res(e.target.result);
    r.onerror   = () => rej(r.error);
  });
}

async function saveToIDB(data) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').put({
      ...data,
      offlineId: `sw-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      savedAt:   Date.now()
    });
    tx.oncomplete = res;
    tx.onerror    = () => rej(tx.error);
  });
}

async function getAllFromIDB() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction('queue', 'readonly');
    const req = tx.objectStore('queue').getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

async function deleteFromIDB(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').delete(id);
    tx.oncomplete = res;
    tx.onerror    = () => rej(tx.error);
  });
}

async function syncPending() {
  const pending = await getAllFromIDB().catch(() => []);
  if (!pending.length) return;

  let synced = 0;
  for (const rec of pending) {
    try {
      const res = await fetch('/api/record', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(rec)
      });
      if (res.ok) { await deleteFromIDB(rec.offlineId); synced++; }
    } catch { /* será tentado novamente */ }
  }

  if (synced > 0) {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE', synced }));
  }
}
