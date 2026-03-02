(function registerPWA() {
  if (!('serviceWorker' in navigator)) {
    console.warn('⚠️ Service Worker não suportado neste navegador.');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('✅ Service Worker registrado com sucesso.');

      // Verifica se há Background Sync disponível
      if ('sync' in registration) {
        console.log('✅ Background Sync disponível.');
      } else {
        console.warn('⚠️ Background Sync não disponível — usando fallback por evento online.');
      }

      // Quando o SW atualiza, recarrega a página automaticamente
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('🔄 Nova versão do app disponível. Atualizando...');
            window.location.reload();
          }
        });
      });

    } catch (error) {
      console.warn('⚠️ Falha ao registrar Service Worker:', error);
    }
  });

  // Fallback: quando volta a ficar online, dispara sync manualmente
  // (para navegadores sem Background Sync como Safari/iOS)
  window.addEventListener('online', () => {
    if (typeof syncOfflineRecords === 'function') {
      syncOfflineRecords();
    }
  });
})();