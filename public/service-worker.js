// ==========================================
// WD MANUTENÇÕES - SERVICE WORKER v4
// Suporte completo a offline + sync automático
// ==========================================

const STATIC_CACHE = 'ponto-wd-static-v4';
const API_CACHE = 'ponto-wd-api-v2';
const OFFLINE_SYNC_TAG = 'sync-records';

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
  '/assets/logo.svg',
  '/manifest.webmanifest'
];

// ==================== INSTALL ====================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ==================== FETCH ====================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições de outras origens (ex: nominatim)
  if (url.origin !== self.location.origin) return;

  // POST /api/record — registra ponto (online ou offline)
  if (url.pathname === '/api/record' && request.method === 'POST') {
    event.respondWith(handleRecordPost(request));
    return;
  }

  // GET de APIs — Network first, fallback para cache
  if (url.pathname.startsWith('/api/') && request.method === 'GET') {
    event.respondWith(networkFirstWithCache(request, API_CACHE));
    return;
  }

  // Assets estáticos — Cache first, fallback para network
  if (request.method === 'GET') {
    event.respondWith(cacheFirstWithNetwork(request));
    return;
  }
});

// ==================== BACKGROUND SYNC ====================
self.addEventListener('sync', (event) => {
  if (event.tag === OFFLINE_SYNC_TAG) {
    event.waitUntil(syncPendingRecords());
  }
});

// ==================== PUSH NOTIFICATIONS ====================
self.addEventListener('push', (event) => {
  const data = event.data?.json() || { title: 'WD Manutenções', body: 'Notificação recebida' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/logo.svg',
      badge: '/assets/logo.svg'
    })
  );
});

// ==================== HANDLERS ====================

async function handleRecordPost(request) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) return response;
    throw new Error('Servidor retornou erro');
  } catch (err) {
    // Offline: salva no IndexedDB para sync posterior
    const body = await request.clone().json();
    await saveRecordToIDB(body);

    // Registra Background Sync se suportado
    if (self.registration.sync) {
      await self.registration.sync.register(OFFLINE_SYNC_TAG);
    }

    // Retorna resposta fake de sucesso para o app não quebrar
    return new Response(JSON.stringify({
      success: true,
      offline: true,
      message: 'Registro salvo localmente. Será sincronizado quando houver conexão.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Offline', records: [], users: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match('/login.html');
  }
}

// ==================== INDEXEDDB (fila offline) ====================

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wd-offline-db', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending-records')) {
        db.createObjectStore('pending-records', { keyPath: 'offlineId' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRecordToIDB(recordData) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending-records', 'readwrite');
    tx.objectStore('pending-records').put({
      ...recordData,
      offlineId: `offline-sw-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      savedAt: Date.now()
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllPendingFromIDB() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending-records', 'readonly');
    const req = tx.objectStore('pending-records').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteFromIDB(offlineId) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending-records', 'readwrite');
    tx.objectStore('pending-records').delete(offlineId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function syncPendingRecords() {
  let pending = [];
  try {
    pending = await getAllPendingFromIDB();
  } catch {
    return; // IDB não disponível
  }

  if (!pending.length) return;

  let synced = 0;
  for (const record of pending) {
    try {
      const response = await fetch('/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });

      if (response.ok) {
        await deleteFromIDB(record.offlineId);
        synced++;
      }
    } catch {
      // Ainda offline, tenta no próximo sync
    }
  }

  if (synced > 0) {
    // Notifica todas as abas abertas
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) =>
      client.postMessage({ type: 'SYNC_COMPLETE', synced })
    );
  }
}