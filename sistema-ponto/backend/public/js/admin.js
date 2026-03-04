const API_URL = '/api';
const ADMIN_CONNECTION_BADGE_ID = 'adminConnectionBadge';

// ==================== FERIADOS NACIONAIS ====================
const FERIADOS = [
    '2025-01-01', '2025-02-24', '2025-02-25', '2025-04-18', '2025-04-21',
    '2025-05-01', '2025-06-19', '2025-09-07', '2025-10-12', '2025-11-02',
    '2025-11-15', '2025-11-20', '2025-12-25',
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21',
    '2026-05-01', '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02',
    '2026-11-15', '2026-11-20', '2026-12-25'
];

// ==================== ESTADO GLOBAL ====================
const AppState = {
    currentAdmin: null,
    allRecords: [],
    allEmployees: [],
    currentTab: 'dashboard'
};

function getAdminId() {
    return AppState.currentAdmin?.id || null;
}

// ==================== FUNÇÕES DE DATA ====================
function isFeriado(dateStr) {
    return FERIADOS.includes(dateStr);
}

function getDayOfWeek(dateStr) {
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day).getDay();
}

function formatDateForComparison(dateStr) {
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function calcMinutes(timeStart, timeEnd) {
    if (!timeStart || !timeEnd) return 0;
    const [h1, m1] = timeStart.split(':').map(Number);
    const [h2, m2] = timeEnd.split(':').map(Number);
    return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
}

function formatMinutes(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h${mins.toString().padStart(2, '0')}`;
}

function minutesToDecimal(minutes) {
    return (minutes / 60).toFixed(2);
}

// ==================== CLASSE DE HORAS ====================
class HorasCalculadas {
    constructor() {
        this.diasUteis = 0;
        this.sabados = 0;
        this.domingoseFeriados = 0;
    }
    
    getTotalComAdicionais() {
        const normalDecimal = this.diasUteis / 60;
        const sabadosDecimal = (this.sabados / 60) * 1.5;
        const domingosFeriadosDecimal = (this.domingoseFeriados / 60) * 2.0;
        return Math.round((normalDecimal + sabadosDecimal + domingosFeriadosDecimal) * 60);
    }
    
    getResumo() {
        return {
            diasUteis: {
                horas: formatMinutes(this.diasUteis),
                decimal: minutesToDecimal(this.diasUteis)
            },
            sabados: {
                horas: formatMinutes(this.sabados),
                decimal: minutesToDecimal(this.sabados),
                adicional: minutesToDecimal(this.sabados * 0.5),
                total: minutesToDecimal(this.sabados * 1.5)
            },
            domingosFeriados: {
                horas: formatMinutes(this.domingoseFeriados),
                decimal: minutesToDecimal(this.domingoseFeriados),
                adicional: minutesToDecimal(this.domingoseFeriados * 1.0),
                total: minutesToDecimal(this.domingoseFeriados * 2.0)
            },
            totalGeral: {
                horas: formatMinutes(this.getTotalComAdicionais()),
                decimal: minutesToDecimal(this.getTotalComAdicionais())
            }
        };
    }
}

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Sistema Admin iniciando...');
    document.body.style.overflow = 'auto';
    checkAdminAuth();
    setupEventListeners();
    window.addEventListener('scroll', handleScrollButtons);
    window.addEventListener('online', updateAdminConnectionBadge);
    window.addEventListener('offline', updateAdminConnectionBadge);
    ensureAdminConnectionBadge();
    updateAdminConnectionBadge();
    handleScrollButtons();
});


function ensureAdminConnectionBadge() {
    if (document.getElementById(ADMIN_CONNECTION_BADGE_ID)) return;

    const badge = document.createElement('div');
    badge.id = ADMIN_CONNECTION_BADGE_ID;
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

function updateAdminConnectionBadge() {
    const badge = document.getElementById(ADMIN_CONNECTION_BADGE_ID);
    if (!badge) return;

    const online = navigator.onLine;
    badge.textContent = online ? '🌐 ONLINE' : '📴 OFFLINE';
    badge.style.background = online ? '#10b981' : '#ef4444';
    badge.style.color = '#fff';
}

function checkAdminAuth() {
    const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');
    if (userStr) {
        const user = JSON.parse(userStr);
        if (user.role === 'admin') {
            AppState.currentAdmin = user;
            sessionStorage.setItem('user', userStr);
            showAdminPanel();
            return;
        }
    }
    showLoginScreen();
}

function showLoginScreen() {
    document.getElementById('adminLoginScreen').classList.remove('hidden');
    document.getElementById('adminPanel').classList.add('hidden');
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminLogin();
        });
    }
}

async function adminLogin() {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    
    if (!email || !password) {
        showAlert('Preencha email e senha!', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success && data.user.role === 'admin') {
            AppState.currentAdmin = data.user;
            sessionStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('user', JSON.stringify(data.user));
            showAdminPanel();
            showAlert('Login realizado!', 'success');
        } else {
            showAlert('Credenciais inválidas!', 'error');
        }
    } catch (err) {
        showAlert('Erro: ' + err.message, 'error');
    }
}

function showAdminPanel() {
    document.getElementById('adminName').textContent = AppState.currentAdmin.name;
    document.getElementById('adminLoginScreen').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    setTimeout(() => loadDashboard(), 100);
}

function adminLogout() {
    if (!confirm('Deseja sair?')) return;
    AppState.currentAdmin = null;
    AppState.allRecords = [];
    AppState.allEmployees = [];
    sessionStorage.removeItem('user');
    localStorage.removeItem('user');
    document.getElementById('adminEmail').value = '';
    document.getElementById('adminPassword').value = '';
    showLoginScreen();
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    const tabsContainer = document.querySelector('.admin-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.admin-tab');
            if (button) {
                const tabName = button.getAttribute('data-tab');
                if (tabName) switchTab(tabName);
            }
        });
    }
    
    const searchInput = document.getElementById('searchEmployee');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterEmployees, 300));
    }
}

function switchTab(tabName) {
    AppState.currentTab = tabName;
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.admin-tab[data-tab="${tabName}"]`)?.classList.add('active');
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    const tabId = 'tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
    document.getElementById(tabId)?.classList.add('active');
    loadTabData(tabName);
}

function loadTabData(tabName) {
    switch(tabName) {
        case 'dashboard': loadDashboard(); break;
        case 'employees': loadEmployees(); break;
        case 'records': loadAllRecords(); break;
    }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    try {
        const [statsRes, recordsRes] = await Promise.all([
            fetch(`${API_URL}/stats`),
            fetch(`${API_URL}/records`)
        ]);
        
        const stats = await statsRes.json();
        const records = await recordsRes.json();
        
        AppState.allRecords = records.records;
        
        document.getElementById('statTotalEmployees').textContent = stats.total_employees;
        document.getElementById('statTodayRecords').textContent = stats.today_records;
        document.getElementById('statTotalRecords').textContent = stats.total_records;
        
        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        document.getElementById('statAvgRecordsPerDay').textContent = Math.round(stats.total_records / daysInMonth) || 0;
        
        const userSelect = document.getElementById('filterUser');
        if (userSelect) {
            userSelect.innerHTML = '<option value="">Todos</option>' + 
                stats.users.map(u => `<option value="${u}">${u}</option>`).join('');
        }
        
        loadRecentActivity(records.records);
    } catch (err) {
        showAlert('Erro ao carregar dashboard', 'error');
    }
}

function loadRecentActivity(records) {
    const list = document.getElementById('recentActivity');
    if (!list) return;
    
    const recent = records.slice(0, 10);
    list.innerHTML = recent.length ? recent.map(r => `
        <div class="activity-item" onclick="showRecordDetails(${r.id})" style="cursor:pointer">
            <div class="activity-icon">${getTypeEmoji(r.type)}</div>
            <div class="activity-content">
                <strong>${r.user_name}</strong>
                <small>${getTypeLabel(r.type)} - ${r.date}</small>
            </div>
            <div class="activity-time">${r.time}</div>
        </div>
    `).join('') : '<p class="empty-state">Nenhuma atividade</p>';
}

// ==================== COLABORADORES ====================
async function loadEmployees() {
    try {
        const [recordsRes, usersRes] = await Promise.all([
            fetch(`${API_URL}/records`),
            fetch(`${API_URL}/users?admin_id=${getAdminId()}`)
        ]);

        const recordsData = await recordsRes.json();
        const usersData = await usersRes.json();

        if (!recordsRes.ok) throw new Error(recordsData.error || 'Erro ao carregar registros');
        if (!usersRes.ok) throw new Error(usersData.error || 'Erro ao carregar contas');

        AppState.allRecords = recordsData.records || [];

        const employeeUsers = (usersData.users || []).filter((user) => user.role === 'employee');
        AppState.allEmployees = employeeUsers.map((user) => {
            const userRecords = AppState.allRecords.filter((r) => Number(r.user_id) === Number(user.id));
            const lastRecord = userRecords.length
                ? userRecords.reduce((latest, current) => (current.timestamp > latest.timestamp ? current : latest), userRecords[0])
                : null;

            return {
                id: user.id,
                name: user.name,
                email: user.email,
                totalRecords: userRecords.length,
                lastRecord
            };
        });

        renderEmployees(AppState.allEmployees);
    } catch (err) {
        showAlert('Erro ao carregar colaboradores: ' + err.message, 'error');
    }
}

function renderEmployees(employees) {
    const list = document.getElementById('employeesList');
    if (!list) return;
    
    if (!employees.length) {
        list.innerHTML = '<p class="empty-state">Nenhum colaborador</p>';
        return;
    }
    
    const today = new Date().toLocaleDateString('pt-BR');
    list.innerHTML = employees.map(emp => {
        const initials = emp.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
        const todayCount = AppState.allRecords.filter(r => r.user_email === emp.email && r.date === today).length;
        
        return `
            <div class="employee-card" onclick='showEmployeeDetails(${emp.id})'>
                <div class="employee-header">
                    <div class="employee-avatar">${initials}</div>
                    <div class="employee-info">
                        <h3>${emp.name}</h3>
                        <p>${emp.email}</p>
                    </div>
                </div>
                <div class="employee-stats">
                    <div class="employee-stat">
                        <span class="employee-stat-value">${emp.totalRecords}</span>
                        <span class="employee-stat-label">Total</span>
                    </div>
                    <div class="employee-stat">
                        <span class="employee-stat-value">${todayCount}</span>
                        <span class="employee-stat-label">Hoje</span>
                    </div>
                </div>
                <div style="margin-top:12px;">
                    <button class="btn btn-secondary" style="background:#dc2626;color:#fff;width:100%;" onclick='deleteEmployeeAccount(event, ${emp.id}, ${JSON.stringify(emp.name)})'>Excluir Conta</button>
                </div>
            </div>
        `;
    }).join('');
}

function filterEmployees() {
    const search = document.getElementById('searchEmployee')?.value.toLowerCase() || '';
    const filtered = AppState.allEmployees.filter(e => 
        e.name.toLowerCase().includes(search) || e.email.toLowerCase().includes(search)
    );
    renderEmployees(filtered);
}

function showEmployeeDetails(userId) {
    const emp = AppState.allEmployees.find(e => Number(e.id) === Number(userId));
    if (!emp) return;
    
    const empRecords = AppState.allRecords.filter(r => Number(r.user_id) === Number(emp.id));
    const today = new Date().toLocaleDateString('pt-BR');
    const todayRecords = empRecords.filter(r => r.date === today);
    const initials = emp.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
    
    document.getElementById('employeeDetails').innerHTML = `
        <div class="employee-details-header">
            <div class="employee-details-avatar">${initials}</div>
            <div class="employee-details-info">
                <h3>${emp.name}</h3>
                <p>📧 ${emp.email}</p>
                <p>📅 Último: ${emp.lastRecord ? emp.lastRecord.date + ' ' + emp.lastRecord.time : 'Nenhum'}</p>
            </div>
        </div>
        <div class="employee-details-stats">
            <div class="employee-detail-stat">
                <span class="employee-detail-stat-value">${emp.totalRecords}</span>
                <span class="employee-detail-stat-label">Total</span>
            </div>
            <div class="employee-detail-stat">
                <span class="employee-detail-stat-value">${todayRecords.length}</span>
                <span class="employee-detail-stat-label">Hoje</span>
            </div>
            <div class="employee-detail-stat">
                <span class="employee-detail-stat-value">${empRecords.filter(r => r.type === 'entrada').length}</span>
                <span class="employee-detail-stat-label">Entradas</span>
            </div>
            <div class="employee-detail-stat">
                <span class="employee-detail-stat-value">${empRecords.filter(r => r.type === 'saida').length}</span>
                <span class="employee-detail-stat-label">Saídas</span>
            </div>
        </div>
        <h3 style="margin:25px 0 15px;font-size:20px">📋 Últimos Registros</h3>
        <div class="admin-records-list">
            ${empRecords.slice(0,10).map(r => `
                <div class="admin-record-item" onclick="showRecordDetails(${r.id})" style="cursor:pointer">
                    <div class="admin-record-main">
                        <div class="admin-record-user">
                            <span class="record-badge badge-${r.type.replace('_','-')}">${getTypeLabel(r.type)}</span>
                        </div>
                        <div class="admin-record-datetime">
                            <span>📅 ${r.date}</span>
                            <span>🕐 ${r.time}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    document.getElementById('employeeModal').classList.remove('hidden');
}

function closeEmployeeModal() {
    document.getElementById('employeeModal').classList.add('hidden');
}

// ==================== REGISTROS ====================
async function loadAllRecords() {
    try {
        if (!AppState.allRecords.length) {
            const res = await fetch(`${API_URL}/records`);
            AppState.allRecords = (await res.json()).records;
        }
        renderAdminRecords(AppState.allRecords);
    } catch (err) {
        showAlert('Erro ao carregar registros', 'error');
    }
}

function renderAdminRecords(records) {
    const list = document.getElementById('adminRecordsList');
    const count = document.getElementById('recordsCount');
    
    if (!list) return;
    if (count) count.textContent = `${records.length} registro${records.length !== 1 ? 's' : ''}`;
    
    if (!records.length) {
        list.innerHTML = '<p class="empty-state">Nenhum registro</p>';
        return;
    }
    
    list.innerHTML = records.map(r => `
        <div class="admin-record-item" onclick="showRecordDetails(${r.id})" style="cursor:pointer">
            <div class="admin-record-main">
                <div class="admin-record-user">
                    <strong>${r.user_name}</strong>
                    <span class="record-badge badge-${r.type.replace('_','-')}">${getTypeLabel(r.type)}</span>
                </div>
                <div class="admin-record-datetime">
                    <span>📅 ${r.date}</span>
                    <span>🕐 ${r.time}</span>
                </div>
            </div>
            <div class="admin-record-actions">
                ${r.photo ? '📷' : ''} ${r.latitude ? '📍' : ''}
                <span>VER →</span>
            </div>
        </div>
    `).join('');
}

function showRecordDetails(recordId) {
    const record = AppState.allRecords.find(r => r.id === recordId);
    if (!record) return;
    
    document.getElementById('recordDetails').innerHTML = `
        <div class="record-details">
            <div class="detail-row"><strong>👤 Colaborador:</strong><span>${record.user_name}</span></div>
            <div class="detail-row"><strong>📧 Email:</strong><span>${record.user_email}</span></div>
            <div class="detail-row">
                <strong>⏱️ Tipo:</strong>
                <span class="record-badge badge-${record.type.replace('_','-')}">${getTypeLabel(record.type)}</span>
            </div>
            <div class="detail-row"><strong>📅 Data/Hora:</strong><span>${record.date} ${record.time}</span></div>
            ${record.photo ? `
                <div class="detail-row detail-photo">
                    <strong>📷 Foto:</strong>
                    <img src="http://localhost:3000/uploads/${record.photo}" alt="Foto" style="border:3px solid var(--wd-yellow);margin-top:15px;max-width:100%;border-radius:12px">
                </div>
            ` : '<div class="detail-row"><strong>📷 Foto:</strong><span>Não capturada</span></div>'}
            ${record.latitude ? `
                <div class="detail-row"><strong>📍 Local:</strong><span>${record.address || `Lat:${record.latitude},Lon:${record.longitude}`}</span></div>
                <div style="margin-top:16px">
                    <a href="https://www.google.com/maps?q=${record.latitude},${record.longitude}" target="_blank" class="btn btn-primary">🗺️ GOOGLE MAPS</a>
                </div>
            ` : '<div class="detail-row"><strong>📍 Local:</strong><span>Não capturada</span></div>'}
        </div>
    `;
    document.getElementById('detailsModal').classList.remove('hidden');
}

function closeDetailsModal() {
    document.getElementById('detailsModal').classList.add('hidden');
}

// ==================== CONTINUA NA PARTE 2... ====================
// ==================== ADMIN.JS - PARTE 2 DE 2 ====================
// Cole este código LOGO APÓS a Parte 1

// ==================== FILTROS ====================
function applyFilters() {
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;
    const user = document.getElementById('filterUser').value;
    const type = document.getElementById('filterType').value;
    
    let filtered = [...AppState.allRecords];
    
    if (startDate && endDate) {
        filtered = filtered.filter(r => {
            const [day, month, year] = r.date.split('/');
            const recordDate = `${year}-${month}-${day}`;
            return recordDate >= startDate && recordDate <= endDate;
        });
    }
    
    if (user) filtered = filtered.filter(r => r.user_name === user);
    if (type) filtered = filtered.filter(r => r.type === type);
    
    renderAdminRecords(filtered);
    showAlert(`${filtered.length} registro(s) encontrado(s)`, 'success');
}

function clearFilters() {
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    document.getElementById('filterUser').selectedIndex = 0;
    document.getElementById('filterType').selectedIndex = 0;
    renderAdminRecords(AppState.allRecords);
    showAlert('Filtros limpos', 'success');
}

// ==================== EXPORTAÇÃO ====================
function exportRecords() {
    if (!AppState.allRecords.length) {
        showAlert('Nenhum registro para exportar!', 'error');
        return;
    }
    
    let csv = 'Nome,Email,Tipo,Data,Hora,Localização\n';
    AppState.allRecords.forEach(r => {
        const type = getTypeLabel(r.type).replace(/[🟢🟡🔵🔴]/g, '').trim();
        csv += `"${r.user_name}","${r.user_email}","${type}","${r.date}","${r.time}","${r.address || 'N/A'}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `WD_Registros_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    
    showAlert('CSV exportado!', 'success');
}

// ==================== RELATÓRIOS ====================
function generateDailyReport() {
    const today = new Date().toLocaleDateString('pt-BR');
    const todayRecords = AppState.allRecords.filter(r => r.date === today);
    
    showReportResult('Relatório Diário', `
        <p><strong>Data:</strong> ${today}</p>
        <p><strong>Total:</strong> ${todayRecords.length}</p>
        <p><strong>Colaboradores:</strong> ${new Set(todayRecords.map(r => r.user_name)).size}</p>
        ${todayRecords.length ? '<h4>Registros:</h4>' + todayRecords.map(r => 
            `<p>• ${r.user_name} - ${getTypeLabel(r.type)} ${r.time}</p>`
        ).join('') : '<p>Nenhum registro hoje</p>'}
    `);
}

function generateWeeklyReport() {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const weekRecords = AppState.allRecords.filter(r => {
        const [day, month, year] = r.date.split('/');
        const recordDate = new Date(year, month - 1, day);
        return recordDate >= weekAgo && recordDate <= today;
    });
    
    showReportResult('Relatório Semanal', `
        <p><strong>Período:</strong> Últimos 7 dias</p>
        <p><strong>Total:</strong> ${weekRecords.length}</p>
        <p><strong>Colaboradores:</strong> ${new Set(weekRecords.map(r => r.user_name)).size}</p>
        <p><strong>Média/dia:</strong> ${Math.round(weekRecords.length / 7)}</p>
    `);
}

function generateMonthlyReport() {
    openEspelhoModal();
}

function generateEmployeeReport() {
    if (!AppState.allEmployees.length) {
        showAlert('Carregue colaboradores primeiro', 'error');
        return;
    }
    
    const html = AppState.allEmployees.map(emp => {
        const empRecords = AppState.allRecords.filter(r => r.user_email === emp.email);
        return `
            <div style="margin-bottom:20px;padding:15px;background:rgba(0,0,0,0.2);border-radius:8px">
                <h4>${emp.name}</h4>
                <p>Total: ${empRecords.length} | Entradas: ${empRecords.filter(r => r.type === 'entrada').length} | Saídas: ${empRecords.filter(r => r.type === 'saida').length}</p>
            </div>
        `;
    }).join('');
    
    showReportResult('Relatório por Colaborador', html);
}

function showReportResult(title, content) {
    const result = document.getElementById('reportResult');
    if (!result) return;
    result.innerHTML = `<h3>${title}</h3>${content}`;
    result.classList.add('active');
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ==================== ESPELHO DE PONTO ====================
function openEspelhoModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'espelhoModal';
    modal.innerHTML = `
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h2>📋 GERAR ESPELHO DE PONTO</h2>
                <button onclick="closeEspelhoModal()" class="btn-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Colaborador:</label>
                    <select id="espelhoUser" class="form-control">
                        <option value="">Todos</option>
                        ${[...new Set(AppState.allRecords.map(r => r.user_name))].map(name => 
                            `<option value="${name}">${name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Mês/Ano:</label>
                    <input type="month" id="espelhoMonth" class="form-control" value="${new Date().toISOString().slice(0,7)}">
                </div>
                <button onclick="gerarEspelhoPonto()" class="btn btn-primary btn-large">📄 GERAR</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeEspelhoModal() {
    document.getElementById('espelhoModal')?.remove();
}

function gerarEspelhoPonto() {
    const userName = document.getElementById('espelhoUser').value;
    const monthYear = document.getElementById('espelhoMonth').value;
    
    if (!monthYear) {
        showAlert('Selecione mês/ano', 'error');
        return;
    }
    
    const [year, month] = monthYear.split('-');
    const monthName = new Date(year, month - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    
    let records = AppState.allRecords.filter(r => {
        const [day, m, y] = r.date.split('/');
        return y === year && m === month.padStart(2, '0');
    });
    
    if (userName) records = records.filter(r => r.user_name === userName);
    
    if (!records.length) {
        showAlert('Nenhum registro encontrado', 'error');
        return;
    }
    
    const byUser = {};
    records.forEach(r => {
        if (!byUser[r.user_name]) byUser[r.user_name] = {};
        if (!byUser[r.user_name][r.date]) byUser[r.user_name][r.date] = [];
        byUser[r.user_name][r.date].push(r);
    });
    
    let espelhoHTML = '';
    Object.keys(byUser).forEach(user => {
        espelhoHTML += gerarTabelaEspelho(user, monthName, byUser[user]);
    });
    
    closeEspelhoModal();
    mostrarEspelhoGerado(monthName, espelhoHTML);
}

function gerarTabelaEspelho(userName, monthName, userRecords) {
    const dates = Object.keys(userRecords).sort((a, b) => {
        const [dayA, monthA, yearA] = a.split('/');
        const [dayB, monthB, yearB] = b.split('/');
        return new Date(yearA, monthA - 1, dayA) - new Date(yearB, monthB - 1, dayB);
    });
    
    const horasCalc = new HorasCalculadas();
    let tableRows = '';
    let daysWorked = 0;
    
    dates.forEach(date => {
        const dayRecords = userRecords[date].sort((a, b) => a.timestamp - b.timestamp);
        const [day] = date.split('/');
        
        const entrada = dayRecords.find(r => r.type === 'entrada');
        const saidaAlmoco = dayRecords.find(r => r.type === 'saida_almoco');
        const retornoAlmoco = dayRecords.find(r => r.type === 'retorno_almoco');
        const saida = dayRecords.find(r => r.type === 'saida');
        
        let minutesWorked = 0;
        if (entrada && saidaAlmoco) minutesWorked += calcMinutes(entrada.time, saidaAlmoco.time);
        if (retornoAlmoco && saida) minutesWorked += calcMinutes(retornoAlmoco.time, saida.time);
        
        const dayOfWeek = getDayOfWeek(date);
        const dateFormatted = formatDateForComparison(date);
        const isFeriadoDay = isFeriado(dateFormatted);
        
        let tipoDia = '';
        let tipoDiaClass = '';
        
        if (isFeriadoDay) {
            tipoDia = '🎊 FERIADO';
            tipoDiaClass = 'feriado';
            horasCalc.domingoseFeriados += minutesWorked;
        } else if (dayOfWeek === 0) {
            tipoDia = '☀️ DOMINGO';
            tipoDiaClass = 'domingo';
            horasCalc.domingoseFeriados += minutesWorked;
        } else if (dayOfWeek === 6) {
            tipoDia = '📅 SÁBADO';
            tipoDiaClass = 'sabado';
            horasCalc.sabados += minutesWorked;
        } else {
            tipoDia = '📋 DIA ÚTIL';
            tipoDiaClass = 'dia-util';
            horasCalc.diasUteis += minutesWorked;
        }
        
        if (minutesWorked > 0) daysWorked++;
        
        const hoursWorked = minutesWorked > 0 ? formatMinutes(minutesWorked) : '-';
        const bgColor = tipoDiaClass === 'feriado' || tipoDiaClass === 'domingo' ? '#ffe5e5' : 
                        tipoDiaClass === 'sabado' ? '#fff8e5' : '#f9f9f9';
        
        tableRows += `
            <tr>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;font-weight:600">${day}</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;font-size:12px;font-weight:600">${tipoDia}</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center">${entrada ? entrada.time : '-'}</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center">${saidaAlmoco ? saidaAlmoco.time : '-'}</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center">${retornoAlmoco ? retornoAlmoco.time : '-'}</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center">${saida ? saida.time : '-'}</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;font-weight:700;background:${bgColor}">${hoursWorked}</td>
            </tr>
        `;
    });
    
    const resumo = horasCalc.getResumo();
    
    return `
        <div style="page-break-after:always;margin-bottom:40px">
            <div style="background:linear-gradient(135deg,#FFD700,#FFA500);color:#0a0a0a;padding:30px;border-radius:16px 16px 0 0;text-align:center">
                <h2 style="margin:0;font-size:28px;text-transform:uppercase;letter-spacing:2px">WD MANUTENÇÕES</h2>
                <h3 style="margin:10px 0 0;font-size:20px">ESPELHO DE PONTO ELETRÔNICO</h3>
            </div>
            
            <div style="background:white;color:black;padding:30px;border-radius:0 0 16px 16px">
                <div style="margin-bottom:25px;border-bottom:2px solid #FFD700;padding-bottom:15px">
                    <p style="margin:5px 0"><strong>COLABORADOR:</strong> ${userName}</p>
                    <p style="margin:5px 0"><strong>PERÍODO:</strong> ${monthName.toUpperCase()}</p>
                    <p style="margin:5px 0"><strong>EMISSÃO:</strong> ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</p>
                </div>
                
                <table style="width:100%;border-collapse:collapse;margin-top:20px">
                    <thead>
                        <tr style="background:#FFD700;color:#0a0a0a">
                            <th style="padding:12px;border:1px solid #ddd;text-align:center">DIA</th>
                            <th style="padding:12px;border:1px solid #ddd;text-align:center">TIPO</th>
                            <th style="padding:12px;border:1px solid #ddd;text-align:center">ENTRADA</th>
                            <th style="padding:12px;border:1px solid #ddd;text-align:center">SAÍDA ALMOÇO</th>
                            <th style="padding:12px;border:1px solid #ddd;text-align:center">RETORNO</th>
                            <th style="padding:12px;border:1px solid #ddd;text-align:center">SAÍDA</th>
                            <th style="padding:12px;border:1px solid #ddd;text-align:center">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
                
                <div style="margin-top:30px;padding:20px;background:#f8f9fa;border-radius:12px;border:2px solid #FFD700">
                    <h3 style="margin:0 0 20px;text-align:center">📊 RESUMO COM ADICIONAIS</h3>
                    <table style="width:100%;border-collapse:collapse">
                        <thead>
                            <tr style="background:#FFD700;color:#0a0a0a">
                                <th style="padding:12px;border:1px solid #ddd">TIPO</th>
                                <th style="padding:12px;border:1px solid #ddd;text-align:center">HORAS</th>
                                <th style="padding:12px;border:1px solid #ddd;text-align:center">ADICIONAL</th>
                                <th style="padding:12px;border:1px solid #ddd;text-align:center">ADICIONAL (h)</th>
                                <th style="padding:12px;border:1px solid #ddd;text-align:center">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="background:#f9f9f9">
                                <td style="padding:12px;border:1px solid #ddd">📋 Dias Úteis</td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center;font-weight:700">${resumo.diasUteis.horas}<br><small>(${resumo.diasUteis.decimal}h)</small></td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center">0%</td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center">-</td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center;font-weight:700;background:#e8f5e9">${resumo.diasUteis.horas}<br><small>(${resumo.diasUteis.decimal}h)</small></td>
                            </tr>
                            <tr style="background:#fff8e5">
                                <td style="padding:12px;border:1px solid #ddd">📅 Sábados</td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center;font-weight:700">${resumo.sabados.horas}<br><small>(${resumo.sabados.decimal}h)</small></td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center;color:#f59e0b;font-weight:600">+50%</td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center;color:#f59e0b;font-weight:600">${resumo.sabados.adicional}h</td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center;font-weight:700;background:#fef3c7">${resumo.sabados.total}h<br><small>(${resumo.sabados.decimal}h × 1.5)</small></td>
                            </tr>
                            <tr style="background:#ffe5e5">
                                <td style="padding:12px;border:1px solid #ddd">☀️ Domingos/Feriados</td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center;font-weight:700">${resumo.domingosFeriados.horas}<br><small>(${resumo.domingosFeriados.decimal}h)</small></td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center;color:#ef4444;font-weight:600">+100%</td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center;color:#ef4444;font-weight:600">${resumo.domingosFeriados.adicional}h</td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center;font-weight:700;background:#fee2e2">${resumo.domingosFeriados.total}h<br><small>(${resumo.domingosFeriados.decimal}h × 2.0)</small></td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr style="background:#FFD700;color:#0a0a0a">
                                <td colspan="4" style="padding:15px;border:1px solid #ddd;text-align:right;font-weight:800;font-size:16px">💰 TOTAL GERAL:</td>
                                <td style="padding:15px;border:1px solid #ddd;text-align:center;font-weight:900;font-size:18px">${resumo.totalGeral.horas}<br><small style="font-size:14px">(${resumo.totalGeral.decimal}h)</small></td>
                            </tr>
                            <tr style="background:#f5f5f5">
                                <td colspan="4" style="padding:12px;border:1px solid #ddd;text-align:right;font-weight:600">DIAS TRABALHADOS:</td>
                                <td style="padding:12px;border:1px solid #ddd;text-align:center;font-weight:700">${daysWorked} dias</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                
                <div style="margin-top:25px;padding:15px;background:#f0f0f0;border-radius:8px">
                    <h4 style="margin:0 0 10px;font-size:14px">📌 LEGENDA:</h4>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:13px">
                        <div>📋 Dia Útil: Seg-Sex</div>
                        <div>📅 Sábado: +50%</div>
                        <div>☀️ Domingo/Feriado: +100%</div>
                    </div>
                </div>
                
                <div style="margin-top:40px;padding-top:20px;border-top:2px solid #FFD700">
                    <p style="margin:20px 0;font-size:12px;color:#666;text-align:center">
                        Documento válido como comprovante de registro eletrônico (CLT Art. 59).<br>
                        Gerado por Sistema WD Manutenções em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
                    </p>
                    <div style="margin-top:50px;display:flex;justify-content:space-around">
                        <div style="text-align:center">
                            <div style="border-top:2px solid black;width:250px;margin:0 auto"></div>
                            <p style="margin-top:10px;font-size:13px;font-weight:600">Assinatura do Colaborador</p>
                        </div>
                        <div style="text-align:center">
                            <div style="border-top:2px solid black;width:250px;margin:0 auto"></div>
                            <p style="margin-top:10px;font-size:13px;font-weight:600">Assinatura do Responsável</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function mostrarEspelhoGerado(monthName, espelhoHTML) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'espelhoResultModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:1200px;max-height:90vh;overflow-y:auto">
            <div class="modal-header">
                <h2>📋 ESPELHO DE PONTO - ${monthName.toUpperCase()}</h2>
                <button onclick="closeEspelhoResult()" class="btn-close">&times;</button>
            </div>
            <div class="modal-body">
                ${espelhoHTML}
                <div style="text-align:center;margin-top:30px;padding-top:20px;border-top:2px solid #FFD700">
                    <button onclick="window.print()" class="btn btn-primary" style="margin-right:10px">🖨️ IMPRIMIR</button>
                    <button onclick="showAlert('Use Ctrl+P e selecione Salvar como PDF','info')" class="btn btn-secondary">📄 SALVAR PDF</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeEspelhoResult() {
    document.getElementById('espelhoResultModal')?.remove();
}


async function clearAllRecords() {
    if (!confirm('Tem certeza que deseja apagar TODOS os registros de ponto? Esta ação não pode ser desfeita.')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/records`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id: getAdminId() })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro ao limpar registros');

        AppState.allRecords = [];
        await loadDashboard();
        if (AppState.currentTab === 'employees') await loadEmployees();
        if (AppState.currentTab === 'records') loadAllRecords();

        showAlert('Todos os registros foram removidos com sucesso.', 'success');
    } catch (error) {
        showAlert('Erro ao limpar registros: ' + error.message, 'error');
    }
}

async function deleteEmployeeAccount(event, userId, userName) {
    event.stopPropagation();

    if (!confirm(`Deseja excluir a conta de ${userName}?
Todos os registros dessa pessoa também serão removidos.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id: getAdminId() })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro ao excluir conta');

        showAlert('Conta excluída com sucesso.', 'success');
        await loadEmployees();
        await loadDashboard();
    } catch (error) {
        showAlert('Erro ao excluir conta: ' + error.message, 'error');
    }
}

// ==================== UTILITÁRIOS ====================
function getTypeLabel(type) {
    const labels = {
        'entrada': '🟢 Entrada',
        'saida_almoco': '🟡 Saída Almoço',
        'retorno_almoco': '🔵 Retorno Almoço',
        'saida': '🔴 Saída'
    };
    return labels[type] || type;
}

function getTypeEmoji(type) {
    const emojis = { 'entrada': '🟢', 'saida_almoco': '🟡', 'retorno_almoco': '🔵', 'saida': '🔴' };
    return emojis[type] || '⚪';
}

function showAlert(message, type = 'success') {
    const alert = document.createElement('div');
    alert.style.cssText = `
        position:fixed;top:30px;right:30px;
        background:${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color:white;padding:20px 30px;border-radius:12px;
        box-shadow:0 10px 40px rgba(0,0,0,0.3);z-index:10000;
        font-weight:700;animation:slideIn 0.3s ease;max-width:400px`;
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => {
        alert.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

function handleScrollButtons() {
    const scrollToTop = document.getElementById('scrollToTop');
    const scrollToBottom = document.getElementById('scrollToBottom');
    if (!scrollToTop || !scrollToBottom) return;
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    if (scrollTop > 300) scrollToTop.classList.add('visible');
    else scrollToTop.classList.remove('visible');
    
    if (scrollTop + windowHeight >= documentHeight - 100) scrollToBottom.style.display = 'none';
    else scrollToBottom.style.display = 'flex';
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

console.log('✅ Sistema Admin 100% funcional carregado!');