const API_URL = '/api';

// Estado da aplicação
let currentUser = null;
let currentPhoto = null;
let currentLocation = null;
let stream = null;

const OFFLINE_RECORDS_KEY = 'offlineRecordsQueue';
const CACHED_RECORDS_KEY = 'cachedRecordsByUser';
const CONNECTION_BADGE_ID = 'connectionBadge';

// Inicializa o sistema
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema WD Manutenções iniciando...');
    console.log('API URL:', API_URL);
    
    // Garante que o scroll funcione
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    
    // Testa conexão com servidor
    testServerConnection();
    
    // Verifica se está logado
    checkAuth();
    
    // Atualiza relógio
    updateClock();
    setInterval(updateClock, 1000);
    
    // Controla exibição dos botões de scroll
    window.addEventListener('scroll', handleScrollButtons);
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    ensureConnectionBadge();
    handleConnectivityChange(true);
    handleScrollButtons(); // Chama imediatamente para configurar estado inicial

    // Tenta sincronizar registros pendentes ao iniciar
    syncOfflineRecords();
});

// Controla visibilidade dos botões de scroll
function handleScrollButtons() {
    const scrollToTop = document.getElementById('scrollToTop');
    const scrollToBottom = document.getElementById('scrollToBottom');
    
    if (!scrollToTop || !scrollToBottom) return;
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    // Mostra botão "voltar ao topo" após rolar 300px
    if (scrollTop > 300) {
        scrollToTop.classList.add('visible');
    } else {
        scrollToTop.classList.remove('visible');
    }
    
    // Esconde botão "ir para baixo" quando está no final da página
    if (scrollTop + windowHeight >= documentHeight - 100) {
        scrollToBottom.style.display = 'none';
    } else {
        scrollToBottom.style.display = 'flex';
    }
}

// Scroll suave para o topo
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Scroll suave para baixo
function scrollToBottom() {
    window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth'
    });
}

// Testa conexão com servidor
async function testServerConnection() {
    try {
        console.log('🔌 Testando conexão com servidor...');
        const response = await fetch(`${API_URL}/stats`);
        const data = await response.json();
        console.log('✓ Servidor conectado!', data);
    } catch (err) {
        console.error('❌ Servidor offline ou inacessível:', err);
        showAlert('⚠️ Servidor offline! Inicie o backend com: npm start', 'error');
    }
}

// Verifica autenticação
function checkAuth() {
    const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');
    
    if (!userStr) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = JSON.parse(userStr);
    sessionStorage.setItem('user', userStr);
    
    // Verifica se é admin tentando acessar área de funcionário
    if (currentUser.role === 'admin') {
        window.location.href = 'admin.html';
        return;
    }
    
    // Atualiza interface
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userEmail').textContent = currentUser.email;
    
    // Carrega registros
    loadMyRecords();
}

// Atualiza o relógio
function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR');
    const dateString = now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
    
    document.getElementById('currentTime').textContent = timeString;
    document.getElementById('currentDate').textContent = dateString.charAt(0).toUpperCase() + dateString.slice(1);
}

// Logout
function logout() {
    const confirmLogout = confirm('Deseja realmente sair do sistema?');
    console.log('Logout clicado. Confirmou?', confirmLogout);
    
    if (confirmLogout) {
        sessionStorage.clear();
        localStorage.clear();
        console.log('Sessão limpa. Redirecionando...');
        window.location.href = 'login.html';
    }
}

// Abre modal de registro
async function openRegisterModal() {
    console.log('🎬 Abrindo modal de registro...');
    console.log('Usuário atual:', currentUser);
    
    document.getElementById('registerModal').classList.remove('hidden');
    
    // Reseta estado
    currentPhoto = null;
    currentLocation = null;
    document.getElementById('btnConfirm').disabled = true;
    
    // Inicia câmera
    try {
        console.log('📷 Solicitando acesso à câmera...');
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false 
        });
        
        const video = document.getElementById('video');
        video.srcObject = stream;
        
        // Aguarda o vídeo estar pronto
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                console.log('✓ Câmera inicializada:', video.videoWidth, 'x', video.videoHeight);
                resolve();
            };
        });
        
        document.getElementById('locationInfo').innerHTML = '<p>📍 Buscando sua localização...</p>';
        console.log('✓ Câmera pronta!');
    } catch (err) {
        console.error('❌ Erro ao acessar câmera:', err);
        showAlert('❌ Erro ao acessar câmera: ' + err.message, 'error');
        return;
    }
    
    // Busca localização
    console.log('📍 Iniciando busca de localização...');
    getLocation();
}

// Fecha modal de registro
function closeRegisterModal() {
    document.getElementById('registerModal').classList.add('hidden');
    
    // Para câmera
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    
    // Reset
    currentPhoto = null;
    currentLocation = null;
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('btnCapture').classList.remove('hidden');
    document.getElementById('btnRetake').classList.add('hidden');
    document.getElementById('video').style.display = 'block';
    document.getElementById('btnConfirm').disabled = true;
}

// Captura foto
function capturePhoto() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const photo = document.getElementById('capturedPhoto');
    
    // Verifica se o vídeo está carregado
    if (!video.videoWidth || !video.videoHeight) {
        showAlert('Aguarde a câmera inicializar...', 'error');
        return;
    }
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    currentPhoto = canvas.toDataURL('image/jpeg', 0.8);
    
    photo.src = currentPhoto;
    document.getElementById('photoPreview').classList.remove('hidden');
    document.getElementById('video').style.display = 'none';
    document.getElementById('btnCapture').classList.add('hidden');
    document.getElementById('btnRetake').classList.remove('hidden');
    
    // Sempre habilita o botão depois de capturar foto
    document.getElementById('btnConfirm').disabled = false;
    
    showAlert('✓ Foto capturada com sucesso!', 'success');
}

// Tirar outra foto
function retakePhoto() {
    currentPhoto = null;
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('video').style.display = 'block';
    document.getElementById('btnCapture').classList.remove('hidden');
    document.getElementById('btnRetake').classList.add('hidden');
    document.getElementById('btnConfirm').disabled = true;
}

// Busca localização
function getLocation() {
    console.log('📍 Iniciando busca de localização...');
    
    if (!navigator.geolocation) {
        console.warn('⚠️ Geolocalização não suportada');
        document.getElementById('locationInfo').innerHTML = 
            '<p style="color: #FFA500;">⚠️ Seu navegador não suporta geolocalização</p>';
        // Permite continuar sem localização
        currentLocation = null;
        return;
    }
    
    // Mostra estado de carregamento
    document.getElementById('locationInfo').innerHTML = `
        <p style="color: var(--wd-yellow);"><strong>📍 Buscando localização...</strong></p>
        <p style="font-size: 13px; margin-top: 8px; color: rgba(255,255,255,0.6);">
            Isso pode levar alguns segundos
        </p>
    `;
    
    // Opções mais permissivas
    const options = {
        enableHighAccuracy: false, // Mudado para false - mais rápido
        timeout: 15000, // 15 segundos
        maximumAge: 60000 // Aceita cache de até 1 minuto
    };
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            console.log('✓ Localização obtida:', position.coords);
            
            currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
            
            document.getElementById('locationInfo').innerHTML = `
                <p><strong>📍 Localização Obtida!</strong></p>
                <p style="font-size: 14px; margin-top: 8px; color: rgba(255,255,255,0.8);">
                    Lat: ${currentLocation.latitude.toFixed(6)}, Lon: ${currentLocation.longitude.toFixed(6)}
                </p>
                <p style="font-size: 13px; margin-top: 8px; color: rgba(255,255,255,0.6);">
                    🔄 Buscando endereço...
                </p>
            `;
            
            // Tenta buscar endereço (mas não trava se falhar)
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLocation.latitude}&lon=${currentLocation.longitude}`,
                    {
                        headers: {
                            'User-Agent': 'WD-Manutencoes-Sistema-Ponto',
                            'Accept-Language': 'pt-BR,pt;q=0.9'
                        }
                    }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    currentLocation.address = data.display_name;
                    
                    console.log('✓ Endereço encontrado:', currentLocation.address);
                    
                    document.getElementById('locationInfo').innerHTML = `
                        <p><strong>📍 Localização Capturada:</strong></p>
                        <p style="font-size: 14px; margin-top: 8px; line-height: 1.6;">${currentLocation.address}</p>
                    `;
                } else {
                    throw new Error('API retornou erro');
                }
            } catch (err) {
                console.warn('⚠️ Não foi possível obter endereço:', err);
                currentLocation.address = `Lat: ${currentLocation.latitude.toFixed(6)}, Lon: ${currentLocation.longitude.toFixed(6)}`;
                
                document.getElementById('locationInfo').innerHTML = `
                    <p><strong>📍 Coordenadas:</strong></p>
                    <p style="font-size: 14px; margin-top: 8px;">${currentLocation.address}</p>
                    <p style="font-size: 12px; margin-top: 8px; color: rgba(255,255,255,0.5);">
                        ℹ️ Não foi possível obter o endereço, mas as coordenadas foram salvas
                    </p>
                `;
            }
            
            // Se já tiver foto, habilita botão
            if (currentPhoto) {
                document.getElementById('btnConfirm').disabled = false;
            }
        },
        (error) => {
            console.error('❌ Erro de geolocalização:', error);
            
            let errorMessage = '';
            let errorTip = '';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = '🚫 Você negou acesso à localização';
                    errorTip = 'Clique no ícone de localização na barra de endereço e permita o acesso.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = '📡 Localização indisponível no momento';
                    errorTip = 'Verifique se o GPS/Wi-Fi está ativado e tente novamente.';
                    break;
                case error.TIMEOUT:
                    errorMessage = '⏱️ Tempo esgotado ao buscar localização';
                    errorTip = 'Tente novamente clicando no botão abaixo.';
                    break;
                default:
                    errorMessage = '❌ Erro desconhecido ao buscar localização';
                    errorTip = 'Tente novamente ou continue sem localização.';
            }
            
            document.getElementById('locationInfo').innerHTML = `
                <p style="color: #FFA500;"><strong>⚠️ Localização Não Disponível</strong></p>
                <p style="font-size: 13px; margin-top: 8px; line-height: 1.5;">${errorMessage}</p>
                <p style="font-size: 12px; margin-top: 8px; color: rgba(255,255,255,0.6);">${errorTip}</p>
                <button onclick="getLocation()" class="btn btn-secondary" style="margin-top: 15px; width: 100%; padding: 12px;">
                    🔄 Tentar Novamente
                </button>
                <p style="font-size: 12px; margin-top: 12px; color: rgba(255,255,255,0.6);">
                    ✓ Você pode continuar sem localização
                </p>
            `;
            
            // Permite continuar mesmo sem localização
            currentLocation = null;
        },
        options
    );
}

// Confirma registro
async function confirmRegister() {
    console.log('🎯 Iniciando confirmação de registro...');
    console.log('Estado atual:', {
        hasPhoto: !!currentPhoto,
        hasUser: !!currentUser,
        userId: currentUser?.id,
        userName: currentUser?.name,
        hasLocation: !!currentLocation
    });
    
    if (!currentPhoto) {
        console.error('❌ Sem foto!');
        showAlert('❌ Por favor, tire uma foto antes de confirmar!', 'error');
        return;
    }
    
    if (!currentUser || !currentUser.id) {
        console.error('❌ Usuário não identificado!');
        showAlert('❌ Erro: usuário não identificado. Faça login novamente.', 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        return;
    }
    
    const type = document.getElementById('recordType').value;
    const btnConfirm = document.getElementById('btnConfirm');
    
    btnConfirm.disabled = true;
    btnConfirm.textContent = '⏳ REGISTRANDO...';
    
    const recordData = {
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_email: currentUser.email,
        type: type,
        photo: currentPhoto,
        latitude: currentLocation?.latitude || null,
        longitude: currentLocation?.longitude || null,
        address: currentLocation?.address || 'Localização não capturada'
    };
    
    console.log('📤 Enviando dados para o servidor...');
    console.log('Dados do registro:', {
        user_id: recordData.user_id,
        user_name: recordData.user_name,
        user_email: recordData.user_email,
        type: recordData.type,
        photo_size: recordData.photo ? Math.round(recordData.photo.length / 1024) + 'KB' : 'N/A',
        has_location: !!recordData.latitude
    });
    
    try {
        if (!navigator.onLine) {
            queueOfflineRecord(recordData);
            showAlert('📴 Sem internet: registro salvo e será sincronizado automaticamente.', 'success');
            closeRegisterModal();
            loadMyRecords();
            return;
        }

        await submitRecordToApi(recordData);
        console.log('✓✓✓ PONTO REGISTRADO COM SUCESSO!');
        showAlert('✅ Ponto registrado com sucesso!', 'success');
        closeRegisterModal();
        setTimeout(() => {
            loadMyRecords();
        }, 500);
    } catch (err) {
        console.error('❌❌❌ ERRO COMPLETO:', err);

        if (!navigator.onLine || err.message.includes('Failed to fetch')) {
            queueOfflineRecord(recordData);
            showAlert('📴 Sem conexão com servidor: registro salvo para sincronizar depois.', 'success');
            closeRegisterModal();
            loadMyRecords();
            return;
        }

        showAlert('❌ Erro ao registrar: ' + err.message, 'error');
        btnConfirm.disabled = false;
        btnConfirm.textContent = '✓ CONFIRMAR REGISTRO';
    }
}

// Carrega registros do usuário
async function loadMyRecords() {
    try {
        let records = [];

        if (navigator.onLine) {
        updateConnectionBadge(true);
            const response = await fetch(`${API_URL}/records/user/${currentUser.id}`);
            const data = await response.json();
            records = data.records || [];
            cacheUserRecords(currentUser.id, records);
        } else {
            records = getCachedUserRecords(currentUser.id);
        }

        const today = new Date().toLocaleDateString('pt-BR');
        const todayRecords = records.filter(r => r.date === today);
        const offlinePending = getOfflineRecordsByUser(currentUser.id).filter(r => r.date === today);

        const pendingRecords = offlinePending.map((record) => ({
            ...record,
            isOfflinePending: true,
            time: record.time || new Date(record.timestamp || Date.now()).toLocaleTimeString('pt-BR')
        }));

        renderRecords([...todayRecords, ...pendingRecords]);
    } catch (err) {
        console.error('Erro ao carregar registros:', err);
        const fallback = getCachedUserRecords(currentUser.id);
        const today = new Date().toLocaleDateString('pt-BR');
        renderRecords(fallback.filter(r => r.date === today));
    }
}

// Renderiza registros
function renderRecords(records) {
    const recordsList = document.getElementById('recordsList');
    
    if (records.length === 0) {
        recordsList.innerHTML = '<p class="empty-state">Nenhum registro hoje. Clique no botão acima para registrar!</p>';
        return;
    }
    
    recordsList.innerHTML = records.map(record => `
        <div class="record-item">
            <div class="record-info">
                <span class="record-badge badge-${record.type.replace('_', '-')}">
                    ${getTypeLabel(record.type)}
                </span>
                <span class="record-date">${record.date}${record.isOfflinePending ? ' • pendente de sync' : ''}</span>
            </div>
            <span class="record-time">${record.time}</span>
        </div>
    `).join('');
}

// Retorna label do tipo
function getTypeLabel(type) {
    const labels = {
        'entrada': '🟢 Entrada',
        'saida_almoco': '🟡 Saída Almoço',
        'retorno_almoco': '🔵 Retorno Almoço',
        'saida': '🔴 Saída'
    };
    return labels[type] || type;
}


async function submitRecordToApi(recordData) {
    const response = await fetch(`${API_URL}/record`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(recordData)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Servidor retornou erro ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || 'Erro desconhecido ao registrar');
    }

    return data;
}

function getOfflineQueue() {
    try {
        return JSON.parse(localStorage.getItem(OFFLINE_RECORDS_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveOfflineQueue(queue) {
    localStorage.setItem(OFFLINE_RECORDS_KEY, JSON.stringify(queue));
}

function queueOfflineRecord(recordData) {
    const queue = getOfflineQueue();
    queue.push({
        ...recordData,
        offlineId: `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        date: new Date().toLocaleDateString('pt-BR'),
        time: new Date().toLocaleTimeString('pt-BR'),
        timestamp: Date.now()
    });
    saveOfflineQueue(queue);
}

function getOfflineRecordsByUser(userId) {
    return getOfflineQueue().filter(record => Number(record.user_id) === Number(userId));
}

function getCachedRecordsMap() {
    try {
        return JSON.parse(localStorage.getItem(CACHED_RECORDS_KEY) || '{}');
    } catch {
        return {};
    }
}

function cacheUserRecords(userId, records) {
    const cached = getCachedRecordsMap();
    cached[userId] = records;
    localStorage.setItem(CACHED_RECORDS_KEY, JSON.stringify(cached));
}

function getCachedUserRecords(userId) {
    const cached = getCachedRecordsMap();
    return cached[userId] || [];
}

async function syncOfflineRecords() {
    if (!navigator.onLine) return;

    const queue = getOfflineQueue();
    if (!queue.length) return;

    const failed = [];

    for (const record of queue) {
        try {
            await submitRecordToApi(record);
        } catch (error) {
            failed.push(record);
        }
    }

    saveOfflineQueue(failed);

    if (failed.length === 0) {
        showAlert('☁️ Registros offline sincronizados com sucesso!', 'success');
        loadMyRecords();
    }
}

function handleConnectivityChange(isInitial = false) {
    ensureConnectionBadge();
    if (navigator.onLine) {
        updateConnectionBadge(true);
        if (!isInitial) {
            showAlert('🌐 Conexão restabelecida. Sincronizando registros...', 'success');
        }
        syncOfflineRecords();
    } else {
        updateConnectionBadge(false);
        if (isInitial) return;
        showAlert('📴 Você está offline. Novos registros serão salvos localmente.', 'error');
    }
}

// Alerta visual

function ensureConnectionBadge() {
    if (document.getElementById(CONNECTION_BADGE_ID)) return;

    const badge = document.createElement('div');
    badge.id = CONNECTION_BADGE_ID;
    badge.style.cssText = `
        position: fixed;
        left: 20px;
        bottom: 20px;
        z-index: 9999;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.4px;
        box-shadow: 0 6px 18px rgba(0,0,0,0.25);
        transition: all 0.25s ease;
    `;

    document.body.appendChild(badge);
}

function updateConnectionBadge(isOnline) {
    const badge = document.getElementById(CONNECTION_BADGE_ID);
    if (!badge) return;

    badge.textContent = isOnline ? '🌐 ONLINE' : '📴 OFFLINE';
    badge.style.background = isOnline ? '#10b981' : '#ef4444';
    badge.style.color = '#fff';
}

function showAlert(message, type = 'success') {
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed;
        top: 30px;
        right: 30px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        padding: 20px 30px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: 700;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    alert.textContent = message;
    
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

// Animações CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);