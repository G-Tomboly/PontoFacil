/* ==================================================
   pwa.js — Service Worker + Offline sync
   ================================================== */

(function () {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      console.log('[PWA] Service Worker registrado:', reg.scope);

      // Auto-update ao instalar nova versão
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[PWA] Nova versão disponível. Atualizando...');
            window.location.reload();
          }
        });
      });
    } catch (err) {
      console.warn('[PWA] Falha ao registrar SW:', err);
    }
  });

  // Fallback de sync para browsers sem Background Sync (iOS Safari)
  window.addEventListener('online', () => {
    if (typeof syncOfflineQueue === 'function') syncOfflineQueue();
  });
})();
