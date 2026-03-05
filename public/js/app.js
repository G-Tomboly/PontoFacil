/* ==================================================
   app.js — WD Manutenções (Colaborador)
   ================================================== */

const API_URL            = '/api';
const OFFLINE_QUEUE_KEY  = 'wd_offline_queue_v2';
const CACHED_RECORDS_KEY = 'wd_cached_records_v2';
const SESSION_KEY        = 'wd_user';

let currentUser     = null;
let currentPhoto    = null;
let currentLocation = null;
let cameraStream    = null;

/* ==================================================
   INICIALIZAÇÃO
   ================================================== */
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  startClock();
  setupScrollButtons();
  setupConnectivityListeners();

  // Escuta sync concluído pelo SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_COMPLETE') {
        showToast(`☁️ ${e.data.synced} registro(s) sincronizado(s)!`, 'success');
        loadMyRecords();
      }
    });
  }

  // Tenta sincronizar pendentes ao abrir
  syncOfflineQueue();
});

/* ==================================================
   AUTENTICAÇÃO
   ================================================== */
function checkAuth() {
  const str = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  if (!str) { window.location.href = '/login.html'; return; }

  currentUser = JSON.parse(str);
  sessionStorage.setItem(SESSION_KEY, str);

  if (currentUser.role === 'admin') {
    window.location.href = '/admin.html'; return;
  }

  // XSS-safe: usa textContent, nunca innerHTML para dados do usuário
  document.getElementById('userName').textContent  = currentUser.name;
  document.getElementById('userEmail').textContent = currentUser.email;

  updateOfflineBadge();
  loadMyRecords();
}

function logout() {
  if (!confirm('Deseja realmente sair?')) return;
  sessionStorage.clear();
  localStorage.removeItem(SESSION_KEY);
  window.location.href = '/login.html';
}

/* ==================================================
   RELÓGIO
   ================================================== */
function startClock() {
  function tick() {
    const now = new Date();
    const timeEl = document.getElementById('currentTime');
    const dateEl = document.getElementById('currentDate');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('pt-BR');
    if (dateEl) {
      const ds = now.toLocaleDateString('pt-BR', {
        weekday:'long', day:'2-digit', month:'long', year:'numeric'
      });
      dateEl.textContent = ds.charAt(0).toUpperCase() + ds.slice(1);
    }
  }
  tick();
  setInterval(tick, 1000);
}

/* ==================================================
   MODAL DE REGISTRO
   ================================================== */
async function openRegisterModal() {
  const modal = document.getElementById('registerModal');
  modal.classList.remove('hidden');
  resetModalState();

  // Mostra aviso offline
  if (!navigator.onLine) {
    document.getElementById('locationInfo').innerHTML =
      '<p><strong style="color:var(--orange)">📴 Modo Offline</strong></p>' +
      '<p style="font-size:13px;margin-top:6px;color:var(--text-muted)">O registro será salvo localmente e enviado ao reconectar.</p>';
  }

  await startCamera();
  getLocation();
}

function closeRegisterModal() {
  document.getElementById('registerModal').classList.add('hidden');
  stopCamera();
  resetModalState();
}

function resetModalState() {
  currentPhoto    = null;
  currentLocation = null;
  const btnConfirm = document.getElementById('btnConfirm');
  if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = '✓ CONFIRMAR REGISTRO'; }

  document.getElementById('photoPreview')?.classList.add('hidden');
  document.getElementById('btnCapture')?.classList.remove('hidden');
  document.getElementById('btnRetake')?.classList.add('hidden');
  const video = document.getElementById('video');
  if (video) video.style.display = 'block';
}

/* ==================================================
   CÂMERA
   ================================================== */
async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    const video = document.getElementById('video');
    video.srcObject = cameraStream;
    await new Promise(res => { video.onloadedmetadata = res; });
  } catch (err) {
    showToast('Câmera não disponível: ' + err.message, 'error');
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

function capturePhoto() {
  const video  = document.getElementById('video');
  const canvas = document.getElementById('canvas');

  if (!video.videoWidth) {
    showToast('Aguarde a câmera inicializar...', 'error');
    return;
  }

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  currentPhoto = canvas.toDataURL('image/jpeg', 0.82);

  // Exibe preview
  document.getElementById('capturedPhoto').src = currentPhoto;
  document.getElementById('photoPreview').classList.remove('hidden');
  video.style.display = 'none';
  document.getElementById('btnCapture').classList.add('hidden');
  document.getElementById('btnRetake').classList.remove('hidden');

  checkConfirmReady();
  showToast('✓ Foto capturada!', 'success');
}

function retakePhoto() {
  currentPhoto = null;
  document.getElementById('photoPreview').classList.add('hidden');
  document.getElementById('video').style.display = 'block';
  document.getElementById('btnCapture').classList.remove('hidden');
  document.getElementById('btnRetake').classList.add('hidden');
  document.getElementById('btnConfirm').disabled = true;
}

function checkConfirmReady() {
  // Habilita confirmar só quando tem foto (localização é opcional)
  document.getElementById('btnConfirm').disabled = !currentPhoto;
}

/* ==================================================
   GEOLOCALIZAÇÃO
   ================================================== */
function getLocation() {
  const locEl = document.getElementById('locationInfo');

  if (!navigator.geolocation) {
    locEl.innerHTML = '<p style="color:var(--orange)">⚠️ Geolocalização não suportada</p>';
    return;
  }

  locEl.innerHTML = '<p style="color:var(--yellow)"><strong>📍 Buscando localização...</strong></p>';

  navigator.geolocation.getCurrentPosition(
    async pos => {
      currentLocation = {
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude
      };

      locEl.innerHTML = `<p><strong>📍 Localização obtida</strong></p>
        <p style="font-size:13px;margin-top:4px;color:var(--text-muted)">
          Lat: ${currentLocation.latitude.toFixed(5)}, Lon: ${currentLocation.longitude.toFixed(5)}
        </p>`;

      // Geocoding reverso só se online
      if (navigator.onLine) {
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLocation.latitude}&lon=${currentLocation.longitude}`,
            { headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'WD-Manutencoes/1.0' } }
          );
          if (r.ok) {
            const geo = await r.json();
            currentLocation.address = geo.display_name;
            locEl.innerHTML = `<p><strong>📍 Local identificado:</strong></p>
              <p style="font-size:13px;margin-top:6px;line-height:1.6;color:var(--text-muted)">${escapeHtml(geo.display_name)}</p>`;
          }
        } catch { /* endereço fica como coordenadas */ }
      }

      if (!currentLocation.address) {
        currentLocation.address = `${currentLocation.latitude.toFixed(5)}, ${currentLocation.longitude.toFixed(5)}`;
      }

      checkConfirmReady();
    },
    err => {
      const msgs = {
        1: 'Permissão negada. Continue sem localização.',
        2: 'Posição indisponível.',
        3: 'Tempo esgotado.'
      };
      locEl.innerHTML = `
        <p style="color:var(--orange)"><strong>⚠️ ${msgs[err.code] || 'Erro de localização'}</strong></p>
        <p style="font-size:12px;margin-top:6px;color:var(--text-muted)">Você pode registrar o ponto sem localização.</p>
        <button onclick="getLocation()" class="btn btn-secondary" style="margin-top:10px;padding:8px 16px;font-size:12px">🔄 Tentar novamente</button>
      `;
      currentLocation = null;
      checkConfirmReady();
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
  );
}

/* ==================================================
   CONFIRMAR REGISTRO
   ================================================== */
async function confirmRegister() {
  if (!currentPhoto) {
    showToast('Tire uma foto antes de confirmar!', 'error'); return;
  }
  if (!currentUser?.id) {
    showToast('Sessão expirada. Faça login novamente.', 'error');
    setTimeout(() => window.location.href = '/login.html', 2000); return;
  }

  const btn = document.getElementById('btnConfirm');
  btn.disabled    = true;
  btn.textContent = '⏳ REGISTRANDO...';

  const now        = new Date();
  const recordData = {
    user_id:    currentUser.id,
    user_name:  currentUser.name,
    user_email: currentUser.email,
    type:       document.getElementById('recordType').value,
    photo:      currentPhoto,
    latitude:   currentLocation?.latitude  ?? null,
    longitude:  currentLocation?.longitude ?? null,
    address:    currentLocation?.address   ?? 'Não capturada',
    // Campos locais para modo offline
    _localDate:      now.toLocaleDateString('pt-BR'),
    _localTime:      now.toLocaleTimeString('pt-BR'),
    _localTimestamp: now.getTime()
  };

  if (!navigator.onLine) {
    enqueueOfflineRecord(recordData);
    showToast('📴 Registro salvo localmente. Enviará ao reconectar.', 'warning');
    closeRegisterModal();
    loadMyRecords();
    updateOfflineBadge();
    return;
  }

  try {
    await postRecord(recordData);
    showToast('✅ Ponto registrado com sucesso!', 'success');
    closeRegisterModal();
    setTimeout(loadMyRecords, 600);
  } catch {
    // Falha mesmo online? Salva offline
    enqueueOfflineRecord(recordData);
    showToast('⚠️ Falha na conexão. Registro salvo localmente.', 'warning');
    closeRegisterModal();
    loadMyRecords();
    updateOfflineBadge();
  }
}

/* ==================================================
   CARREGAR REGISTROS
   ================================================== */
async function loadMyRecords() {
  let records = [];

  if (navigator.onLine) {
    try {
      const res = await fetch(`${API_URL}/records/user/${currentUser.id}`);
      const d   = await res.json();
      records   = d.records || [];
      cacheRecords(currentUser.id, records);
    } catch {
      records = getCachedRecords(currentUser.id);
    }
  } else {
    records = getCachedRecords(currentUser.id);
  }

  const today        = new Date().toLocaleDateString('pt-BR');
  const todayRecords = records.filter(r => r.date === today);

  // Registros offline pendentes do dia
  const pendingToday = getOfflineQueueByUser(currentUser.id)
    .filter(r => (r._localDate || r.date) === today)
    .map(r => ({
      ...r,
      date: r._localDate || r.date,
      time: r._localTime || r.time,
      _pending: true
    }));

  renderSummary(todayRecords);
  renderRecords([...todayRecords, ...pendingToday]);
}

function renderSummary(records) {
  const find = type => {
    const r = records.find(r => r.type === type);
    return r ? r.time.slice(0,5) : '—';
  };
  document.getElementById('sumEntrada').textContent     = find('entrada');
  document.getElementById('sumSaidaAlmoco').textContent = find('saida_almoco');
  document.getElementById('sumRetorno').textContent     = find('retorno_almoco');
  document.getElementById('sumSaida').textContent       = find('saida');
}

function renderRecords(records) {
  const el = document.getElementById('recordsList');

  if (!records.length) {
    el.innerHTML = '<p class="empty-state">Nenhum registro hoje. Clique no botão acima!</p>';
    return;
  }

  // Ordena por horário
  records.sort((a, b) => {
    const ta = a._localTimestamp || a.timestamp || 0;
    const tb = b._localTimestamp || b.timestamp || 0;
    return ta - tb;
  });

  el.innerHTML = '';
  records.forEach(r => {
    const item = document.createElement('div');
    item.className = `record-item type-${r.type}${r._pending ? ' offline-pending' : ''}`;
    item.innerHTML = `
      <div class="record-info">
        <span class="record-badge badge-${r.type.replace(/_/g,'-')}">${getTypeLabel(r.type)}</span>
        <span class="record-date">${escapeHtml(r.date)}</span>
        ${r._pending ? '<span class="pending-badge">⏳ pendente</span>' : ''}
      </div>
      <span class="record-time">${escapeHtml(r.time.slice(0,8))}</span>
    `;
    el.appendChild(item);
  });
}

/* ==================================================
   FILA OFFLINE
   ================================================== */
function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); } catch { return []; }
}

function saveOfflineQueue(q) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
}

function enqueueOfflineRecord(data) {
  const q = getOfflineQueue();
  const now = new Date();
  q.push({
    ...data,
    offlineId: `off-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    date:      data._localDate      || now.toLocaleDateString('pt-BR'),
    time:      data._localTime      || now.toLocaleTimeString('pt-BR'),
    timestamp: data._localTimestamp || now.getTime()
  });
  saveOfflineQueue(q);
}

function getOfflineQueueByUser(userId) {
  return getOfflineQueue().filter(r => String(r.user_id) === String(userId));
}

async function syncOfflineQueue() {
  if (!navigator.onLine) return;
  const q = getOfflineQueue();
  if (!q.length) return;

  const failed  = [];
  let   synced  = 0;

  for (const rec of q) {
    try {
      await postRecord(rec);
      synced++;
    } catch {
      failed.push(rec);
    }
  }

  saveOfflineQueue(failed);

  if (synced > 0) {
    showToast(`☁️ ${synced} registro(s) sincronizado(s)!`, 'success');
    loadMyRecords();
    updateOfflineBadge();
  }
}

async function postRecord(data) {
  const res = await fetch(`${API_URL}/record`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Erro');
  return d;
}

/* ==================================================
   CACHE DE REGISTROS
   ================================================== */
function cacheRecords(userId, records) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHED_RECORDS_KEY) || '{}');
    cache[userId] = records;
    localStorage.setItem(CACHED_RECORDS_KEY, JSON.stringify(cache));
  } catch {}
}

function getCachedRecords(userId) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHED_RECORDS_KEY) || '{}');
    return cache[userId] || [];
  } catch { return []; }
}

/* ==================================================
   BADGE OFFLINE
   ================================================== */
function updateOfflineBadge() {
  if (!currentUser) return;
  const pending = getOfflineQueueByUser(currentUser.id);
  let badge = document.getElementById('offlineBadge');

  if (pending.length > 0) {
    if (!badge) {
      badge = document.createElement('button');
      badge.id        = 'offlineBadge';
      badge.onclick   = syncOfflineQueue;
      document.body.appendChild(badge);
    }
    badge.textContent = `⏳ ${pending.length} pendente(s) — sincronizar`;
  } else if (badge) {
    badge.remove();
  }
}

/* ==================================================
   CONECTIVIDADE
   ================================================== */
function setupConnectivityListeners() {
  window.addEventListener('online',  () => onConnectivityChange(true));
  window.addEventListener('offline', () => onConnectivityChange(false));
  updateConnectionUI(navigator.onLine);
}

function onConnectivityChange(online) {
  updateConnectionUI(online);
  if (online) {
    showToast('🌐 Conexão restaurada! Sincronizando...', 'success');
    syncOfflineQueue();
  } else {
    showToast('📴 Você está offline. Registros serão salvos localmente.', 'warning');
    updateOfflineBadge();
  }
}

function updateConnectionUI(online) {
  const el = document.getElementById('connectionStatus');
  if (!el) return;
  el.className   = 'connection-status ' + (online ? 'online' : 'offline');
  el.innerHTML   = `<div class="status-dot"></div><span>${online ? 'Online' : 'Offline'}</span>`;
}

/* ==================================================
   SCROLL
   ================================================== */
function setupScrollButtons() {
  window.addEventListener('scroll', updateScrollButtons);
  updateScrollButtons();
}

function updateScrollButtons() {
  const top    = window.pageYOffset;
  const height = document.documentElement.scrollHeight;
  const view   = window.innerHeight;
  const topBtn = document.getElementById('scrollToTop');
  const botBtn = document.getElementById('scrollToBottom');
  if (topBtn) topBtn.classList.toggle('visible', top > 300);
  if (botBtn) botBtn.style.display = top + view >= height - 80 ? 'none' : 'flex';
}

function scrollToTopFn()    { window.scrollTo({ top: 0,                                        behavior: 'smooth' }); }
function scrollToBottomFn() { window.scrollTo({ top: document.documentElement.scrollHeight,   behavior: 'smooth' }); }

/* ==================================================
   UTILITÁRIOS
   ================================================== */
function getTypeLabel(type) {
  return { entrada:'🟢 Entrada', saida_almoco:'🟡 Saída Almoço',
           retorno_almoco:'🔵 Retorno Almoço', saida:'🔴 Saída' }[type] || type;
}

// Previne XSS ao inserir dados em innerHTML
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

/* ---------- TOAST ---------- */
function showToast(msg, type = 'success') {
  document.querySelectorAll('.wd-toast').forEach(t => t.remove());
  const colors = { success:'#00e676', error:'#ff4444', warning:'#ff9100', info:'#448aff' };
  const el = document.createElement('div');
  el.className  = 'wd-toast';
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;top:24px;right:24px;
    background:${colors[type]||colors.info};
    color:#000;padding:16px 24px;border-radius:12px;
    box-shadow:0 10px 40px rgba(0,0,0,0.4);z-index:10000;
    font-weight:700;font-family:'Barlow',sans-serif;
    font-size:14px;max-width:380px;line-height:1.5;
    animation:slideInRight 0.35s ease both;
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

// Keyframes de toast
(() => {
  const s = document.createElement('style');
  s.textContent = `
    @keyframes slideInRight  {from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}
    @keyframes slideOutRight {from{transform:translateX(0);opacity:1}to{transform:translateX(400px);opacity:0}}
  `;
  document.head.appendChild(s);
})();
