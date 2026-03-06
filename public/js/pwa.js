/* pwa.js — WD Manutenções v3 */
(function(){
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/service-worker.js', { scope:'/' });
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) location.reload();
        });
      });
    } catch(e) { console.warn('[PWA]', e); }
  });
  window.addEventListener('online', () => {
    if (typeof syncQueue === 'function') syncQueue();
  });
})();