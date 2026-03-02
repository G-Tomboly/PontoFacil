(function registerPWA() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
// teste
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
      console.log('✅ PWA ativa: Service Worker registrado');
    } catch (error) {
      console.warn('⚠️ Não foi possível registrar o Service Worker:', error);
    }
  });
})();
