const API_URL = '/api';

// Estado da aplicação
let currentUser = null;
let currentPhoto = null;
let currentLocation = null;
let stream = null;

const OFFLINE_RECORDS_KEY = 'offlineRecordsQueue';
const CACHED_RECORDS_KEY = 'cachedRecordsByUser';

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema WD Manutenções iniciando...');

    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

    checkAuth();
    updateClock();
    setInterval(updateClock, 1000);

    window.addEventListener('scroll', handleScrollButtons);
    window.addEventListener('online', () => handleConnectivityChange('online'));
    window.addEventListener('offline', () => handleConnectivityChange('offline'));

    handleScrollButtons();

    // Escuta mensagens do Service Worker (sync em background)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'SYNC_COMPLETE') {
                const count = event.data.synced;
                showAlert(`☁️ ${count} registro(s) offline sincronizado(s) com sucesso!`, 'success');
                loadMyRecords();
            }
        });
    }

    // Tenta sincronizar registros pendentes no localStorage ao iniciar
    syncOfflineRecords();
});

// ==================== AUTENTICAÇÃO ====================
function checkAuth() {
    const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');

    if (!userStr) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = JSON.parse(userStr);
    sessionStorage.setItem('user', userStr);

    if (currentUser.role === 'admin') {
        window.location.href = 'admin.html';
        return;
    }

    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userEmail').textContent = currentUser.email;

    // Mostra badge offline se necessário
    updateOfflineBadge();
    loadMyRecords();
}

function logout() {
    if (!confirm('Deseja realmente sair do sistema?')) return;
    sessionStorage.clear();
    localStorage.removeItem('user');
    // Mantém a fila offline e o cache — não limpa tudo!
    window.location.href = 'login.html';
}

// ==================== RELÓGIO ====================
function updateClock() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleTimeString('pt-BR');
    const dateString = now.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    document.getElementById('currentDate').textContent =
        dateString.charAt(0).toUpperCase() + dateString.slice(1);
}

// ==================== MODAL DE REGISTRO ====================
async function openRegisterModal() {
    document.getElementById('registerModal').classList.remove('hidden');

    currentPhoto = null;
    currentLocation = null;
    document.getElementById('btnConfirm').disabled = true;
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('btnCapture').classList.remove('hidden');
    document.getElementById('btnRetake').classList.add('hidden');
    document.getElementById('video').style.display = 'block';

    // Mostra aviso se estiver offline
    if (!navigator.onLine) {
        document.getElementById('locationInfo').innerHTML = `
            <p style="color:#FFA500"><strong>📴 Modo Offline</strong></p>
            <p style="font-size:13px;margin-top:8px;color:rgba(255,255,255,0.7)">
                O registro será salvo localmente e enviado automaticamente quando você reconectar.
            </p>
        `;
    } else {
        document.getElementById('locationInfo').innerHTML = '<p>📍 Buscando sua localização...</p>';
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });

        const video = document.getElementById('video');
        video.srcObject = stream;

        await new Promise((resolve) => {
            video.onloadedmetadata = resolve;
        });
    } catch (err) {
        showAlert('❌ Erro ao acessar câmera: ' + err.message, 'error');
        return;
    }

    getLocation();
}

function closeRegisterModal() {
    document.getElementById('registerModal').classList.add('hidden');

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    currentPhoto = null;
    currentLocation = null;
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('btnCapture').classList.remove('hidden');
    document.getElementById('btnRetake').classList.add('hidden');
    document.getElementById('video').style.display = 'block';
    document.getElementById('btnConfirm').disabled = true;
}

// ==================== CÂMERA ====================
function capturePhoto() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');

    if (!video.videoWidth || !video.videoHeight) {
        showAlert('Aguarde a câmera inicializar...', 'error');
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    currentPhoto = canvas.toDataURL('image/jpeg', 0.8);

    document.getElementById('capturedPhoto').src = currentPhoto;
    document.getElementById('photoPreview').classList.remove('hidden');
    document.getElementById('video').style.display = 'none';
    document.getElementById('btnCapture').classList.add('hidden');
    document.getElementById('btnRetake').classList.remove('hidden');
    document.getElementById('btnConfirm').disabled = false;

    showAlert('✓ Foto capturada!', 'success');
}

function retakePhoto() {
    currentPhoto = null;
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('video').style.display = 'block';
    document.getElementById('btnCapture').classList.remove('hidden');
    document.getElementById('btnRetake').classList.add('hidden');
    document.getElementById('btnConfirm').disabled = true;
}

// ==================== GEOLOCALIZAÇÃO ====================
function getLocation() {
    if (!navigator.geolocation) {
        document.getElementById('locationInfo').innerHTML =
            '<p style="color:#FFA500">⚠️ Geolocalização não suportada neste navegador</p>';
        currentLocation = null;
        return;
    }

    document.getElementById('locationInfo').innerHTML = `
        <p style="color:var(--wd-yellow)"><strong>📍 Buscando localização...</strong></p>
        <p style="font-size:13px;margin-top:8px;color:rgba(255,255,255,0.6)">Pode levar alguns segundos</p>
    `;

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            document.getElementById('locationInfo').innerHTML = `
                <p><strong>📍 Localização obtida!</strong></p>
                <p style="font-size:14px;margin-top:8px">
                    Lat: ${currentLocation.latitude.toFixed(6)}, Lon: ${currentLocation.longitude.toFixed(6)}
                </p>
            `;

            // Tenta obter endereço (apenas se online)
            if (navigator.onLine) {
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLocation.latitude}&lon=${currentLocation.longitude}`,
                        { headers: { 'User-Agent': 'WD-Manutencoes-Ponto', 'Accept-Language': 'pt-BR' } }
                    );
                    if (res.ok) {
                        const data = await res.json();
                        currentLocation.address = data.display_name;
                        document.getElementById('locationInfo').innerHTML = `
                            <p><strong>📍 Localização capturada:</strong></p>
                            <p style="font-size:14px;margin-top:8px;line-height:1.6">${currentLocation.address}</p>
                        `;
                    }
                } catch {
                    currentLocation.address = `Lat: ${currentLocation.latitude.toFixed(6)}, Lon: ${currentLocation.longitude.toFixed(6)}`;
                }
            } else {
                currentLocation.address = `Lat: ${currentLocation.latitude.toFixed(6)}, Lon: ${currentLocation.longitude.toFixed(6)} (offline)`;
            }

            if (currentPhoto) document.getElementById('btnConfirm').disabled = false;
        },
        (error) => {
            console.warn('Geolocalização falhou:', error.code);
            const msgs = {
                1: '🚫 Permissão de localização negada. Você pode continuar sem ela.',
                2: '📡 Localização indisponível no momento.',
                3: '⏱️ Tempo esgotado ao buscar localização.'
            };
            document.getElementById('locationInfo').innerHTML = `
                <p style="color:#FFA500"><strong>⚠️ Localização não disponível</strong></p>
                <p style="font-size:13px;margin-top:8px;color:rgba(255,255,255,0.7)">${msgs[error.code] || 'Erro desconhecido'}</p>
                <button onclick="getLocation()" class="btn btn-secondary" style="margin-top:12px;width:100%;padding:10px">
                    🔄 Tentar Novamente
                </button>
                <p style="font-size:12px;margin-top:10px;color:rgba(255,255,255,0.5)">✓ Você pode continuar sem localização</p>
            `;
            currentLocation = null;
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
}

// ==================== CONFIRMAR REGISTRO ====================
async function confirmRegister() {
    if (!currentPhoto) {
        showAlert('❌ Tire uma foto antes de confirmar!', 'error');
        return;
    }

    if (!currentUser?.id) {
        showAlert('❌ Sessão expirada. Faça login novamente.', 'error');
        setTimeout(() => window.location.href = 'login.html', 2000);
        return;
    }

    const type = document.getElementById('recordType').value;
    const btnConfirm = document.getElementById('btnConfirm');
    btnConfirm.disabled = true;
    btnConfirm.textContent = '⏳ REGISTRANDO...';

    const now = new Date();
    const recordData = {
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_email: currentUser.email,
        type,
        photo: currentPhoto,
        latitude: currentLocation?.latitude || null,
        longitude: currentLocation?.longitude || null,
        address: currentLocation?.address || 'Localização não capturada',
        // Salva data/hora local para uso no modo offline
        _localDate: now.toLocaleDateString('pt-BR'),
        _localTime: now.toLocaleTimeString('pt-BR'),
        _localTimestamp: now.getTime()
    };

    if (!navigator.onLine) {
        // Offline: salva diretamente na fila local
        queueOfflineRecord(recordData);
        showAlert('📴 Sem internet! Registro salvo localmente. Será enviado automaticamente ao reconectar.', 'success');
        closeRegisterModal();
        loadMyRecords();
        updateOfflineBadge();
        return;
    }

    try {
        await submitRecordToApi(recordData);
        showAlert('✅ Ponto registrado com sucesso!', 'success');
        closeRegisterModal();
        setTimeout(loadMyRecords, 500);
    } catch (err) {
        // Falhou mesmo com navigator.onLine = true (pode ser instabilidade)
        queueOfflineRecord(recordData);
        showAlert('⚠️ Falha na conexão. Registro salvo localmente para sincronizar depois.', 'success');
        closeRegisterModal();
        loadMyRecords();
        updateOfflineBadge();
    }
}

// ==================== CARREGAR REGISTROS ====================
async function loadMyRecords() {
    try {
        let records = [];

        if (navigator.onLine) {
            try {
                const response = await fetch(`${API_URL}/records/user/${currentUser.id}`);
                const data = await response.json();
                records = data.records || [];
                cacheUserRecords(currentUser.id, records);
            } catch {
                records = getCachedUserRecords(currentUser.id);
            }
        } else {
            records = getCachedUserRecords(currentUser.id);
        }

        const today = new Date().toLocaleDateString('pt-BR');
        const todayRecords = records.filter(r => r.date === today);

        // Adiciona registros offline pendentes do dia atual
        const offlinePending = getOfflineRecordsByUser(currentUser.id)
            .filter(r => r.date === today)
            .map(r => ({ ...r, isOfflinePending: true }));

        renderRecords([...todayRecords, ...offlinePending]);
    } catch (err) {
        console.error('Erro ao carregar registros:', err);
        const fallback = getCachedUserRecords(currentUser.id);
        const today = new Date().toLocaleDateString('pt-BR');
        renderRecords(fallback.filter(r => r.date === today));
    }
}

function renderRecords(records) {
    const recordsList = document.getElementById('recordsList');

    if (!records.length) {
        recordsList.innerHTML = '<p class="empty-state">Nenhum registro hoje. Clique no botão acima para registrar!</p>';
        return;
    }

    recordsList.innerHTML = records.map(record => `
        <div class="record-item" style="${record.isOfflinePending ? 'opacity:0.75;border-left-color:#FFA500' : ''}">
            <div class="record-info">
                <span class="record-badge badge-${record.type.replace('_', '-')}">
                    ${getTypeLabel(record.type)}
                </span>
                <span class="record-date">
                    ${record.date}
                    ${record.isOfflinePending ? ' <span style="color:#FFA500;font-size:12px">⏳ pendente</span>' : ''}
                </span>
            </div>
            <span class="record-time">${record.time}</span>
        </div>
    `).join('');
}

function getTypeLabel(type) {
    return {
        'entrada': '🟢 Entrada',
        'saida_almoco': '🟡 Saída Almoço',
        'retorno_almoco': '🔵 Retorno Almoço',
        'saida': '🔴 Saída'
    }[type] || type;
}

// ==================== FILA OFFLINE (localStorage) ====================

function getOfflineQueue() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_RECORDS_KEY) || '[]'); }
    catch { return []; }
}

function saveOfflineQueue(queue) {
    localStorage.setItem(OFFLINE_RECORDS_KEY, JSON.stringify(queue));
}

function queueOfflineRecord(recordData) {
    const queue = getOfflineQueue();
    const now = new Date();
    queue.push({
        ...recordData,
        offlineId: `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        date: recordData._localDate || now.toLocaleDateString('pt-BR'),
        time: recordData._localTime || now.toLocaleTimeString('pt-BR'),
        timestamp: recordData._localTimestamp || now.getTime()
    });
    saveOfflineQueue(queue);
}

function getOfflineRecordsByUser(userId) {
    return getOfflineQueue().filter(r => Number(r.user_id) === Number(userId));
}

// ==================== CACHE DE REGISTROS ====================

function cacheUserRecords(userId, records) {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHED_RECORDS_KEY) || '{}');
        cached[userId] = records;
        localStorage.setItem(CACHED_RECORDS_KEY, JSON.stringify(cached));
    } catch {}
}

function getCachedUserRecords(userId) {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHED_RECORDS_KEY) || '{}');
        return cached[userId] || [];
    } catch { return []; }
}

// ==================== SINCRONIZAÇÃO ====================

async function submitRecordToApi(recordData) {
    const response = await fetch(`${API_URL}/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(recordData)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Servidor retornou ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Erro ao registrar');
    return data;
}

async function syncOfflineRecords() {
    if (!navigator.onLine) return;

    const queue = getOfflineQueue();
    if (!queue.length) return;

    console.log(`🔄 Sincronizando ${queue.length} registro(s) offline...`);

    const failed = [];
    let synced = 0;

    for (const record of queue) {
        try {
            await submitRecordToApi(record);
            synced++;
        } catch {
            failed.push(record);
        }
    }

    saveOfflineQueue(failed);

    if (synced > 0) {
        showAlert(`☁️ ${synced} registro(s) sincronizado(s) com sucesso!`, 'success');
        loadMyRecords();
        updateOfflineBadge();
    }
}

// ==================== BADGE OFFLINE ====================

function updateOfflineBadge() {
    const pending = getOfflineRecordsByUser(currentUser?.id || 0);
    let badge = document.getElementById('offlineBadge');

    if (pending.length > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'offlineBadge';
            badge.style.cssText = `
                position: fixed; bottom: 170px; right: 30px;
                background: #FFA500; color: #000;
                padding: 10px 18px; border-radius: 20px;
                font-weight: 800; font-size: 14px;
                box-shadow: 0 5px 20px rgba(255,165,0,0.5);
                z-index: 998; cursor: pointer;
            `;
            badge.onclick = syncOfflineRecords;
            document.body.appendChild(badge);
        }
        badge.textContent = `⏳ ${pending.length} pendente(s) — toque para sincronizar`;
    } else if (badge) {
        badge.remove();
    }
}

// ==================== CONECTIVIDADE ====================

function handleConnectivityChange(status) {
    if (status === 'online') {
        showAlert('🌐 Conexão restabelecida! Sincronizando...', 'success');
        syncOfflineRecords();
    } else if (status === 'offline') {
        showAlert('📴 Você está offline. Registros serão salvos localmente.', 'error');
        updateOfflineBadge();
    }
}

// ==================== SCROLL ====================

function handleScrollButtons() {
    const scrollToTop = document.getElementById('scrollToTop');
    const scrollToBottom = document.getElementById('scrollToBottom');
    if (!scrollToTop || !scrollToBottom) return;

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    scrollToTop.classList.toggle('visible', scrollTop > 300);
    scrollToBottom.style.display = scrollTop + windowHeight >= documentHeight - 100 ? 'none' : 'flex';
}

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
function scrollToBottom() { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); }

// ==================== ALERTAS ====================

function showAlert(message, type = 'success') {
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed; top: 30px; right: 30px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white; padding: 20px 30px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10000; font-weight: 700;
        animation: slideIn 0.3s ease;
        max-width: 400px; line-height: 1.5;
    `;
    alert.textContent = message;
    document.body.appendChild(alert);

    setTimeout(() => {
        alert.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => alert.remove(), 300);
    }, 4000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
`;
document.head.appendChild(style);