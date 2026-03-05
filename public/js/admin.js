/* ==================================================
   admin.js — WD Manutenções (Painel Administrativo)
   ================================================== */

const API_URL   = '/api';
const SESSION_KEY = 'wd_user';

/* ===== FERIADOS NACIONAIS (facilmente extensível) ===== */
const FERIADOS = new Set([
  '2025-01-01','2025-02-24','2025-02-25','2025-04-18','2025-04-21',
  '2025-05-01','2025-06-19','2025-09-07','2025-10-12','2025-11-02',
  '2025-11-15','2025-11-20','2025-12-25',
  '2026-01-01','2026-02-16','2026-02-17','2026-04-03','2026-04-21',
  '2026-05-01','2026-06-04','2026-09-07','2026-10-12','2026-11-02',
  '2026-11-15','2026-11-20','2026-12-25',
  '2027-01-01','2027-02-15','2027-02-16','2027-03-26','2027-04-21',
  '2027-05-01','2027-05-27','2027-09-07','2027-10-12','2027-11-02',
  '2027-11-15','2027-11-20','2027-12-25'
]);

/* ===== ESTADO GLOBAL ===== */
const App = {
  admin:       null,
  records:     [],
  employees:   [],
  currentTab:  'dashboard'
};

/* ==================================================
   HELPERS
   ================================================== */
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

function adminId() { return App.admin?.id ?? null; }

function isFeriado(isoDate)  { return FERIADOS.has(isoDate); }
function getDow(brDate)      { // "DD/MM/YYYY" → 0-6
  const [d,m,y] = brDate.split('/');
  return new Date(+y, +m-1, +d).getDay();
}
function brToIso(brDate) {   // "DD/MM/YYYY" → "YYYY-MM-DD"
  const [d,m,y] = brDate.split('/');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function calcMinutes(t1, t2) {
  if (!t1 || !t2) return 0;
  const toMin = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
  return Math.max(0, toMin(t2) - toMin(t1));
}

function fmtMin(min) {
  const h = Math.floor(min/60), m = min%60;
  return `${h}h${String(m).padStart(2,'0')}`;
}

function fmtDec(min) { return (min/60).toFixed(2); }

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ==================================================
   TOAST
   ================================================== */
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
    font-size:14px;max-width:400px;line-height:1.5;
    animation:slideInRight 0.35s ease both;
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

(() => {
  const s = document.createElement('style');
  s.textContent = `
    @keyframes slideInRight  {from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}
    @keyframes slideOutRight {from{transform:translateX(0);opacity:1}to{transform:translateX(400px);opacity:0}}
  `;
  document.head.appendChild(s);
})();

/* ==================================================
   INICIALIZAÇÃO
   ================================================== */
document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
  setupTabListeners();
  setupSearchListener();
  window.addEventListener('scroll', updateScrollButtons);
  updateScrollButtons();
});

/* ==================================================
   AUTENTICAÇÃO
   ================================================== */
function checkAdminAuth() {
  const str = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  if (str) {
    const user = JSON.parse(str);
    if (user.role === 'admin') {
      App.admin = user;
      sessionStorage.setItem(SESSION_KEY, str);
      showAdminPanel();
      return;
    }
  }
  showLoginScreen();
}

function showLoginScreen() {
  document.getElementById('adminLoginScreen').classList.remove('hidden');
  document.getElementById('adminPanel').classList.add('hidden');
  document.getElementById('adminPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') adminLogin();
  });
}

async function adminLogin() {
  const email    = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  if (!email || !password) { showToast('Preencha email e senha!', 'error'); return; }

  try {
    const res  = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.success && data.user.role === 'admin') {
      App.admin = data.user;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
      showAdminPanel();
      showToast('Acesso autorizado!', 'success');
    } else {
      showToast(data.error || 'Credenciais inválidas!', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão: ' + err.message, 'error');
  }
}

function showAdminPanel() {
  // XSS-safe
  document.getElementById('adminName').textContent = App.admin.name;
  document.getElementById('adminLoginScreen').classList.add('hidden');
  document.getElementById('adminPanel').classList.remove('hidden');
  setTimeout(loadDashboard, 100);
}

function adminLogout() {
  if (!confirm('Deseja sair do painel admin?')) return;
  App.admin     = null;
  App.records   = [];
  App.employees = [];
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  document.getElementById('adminEmail').value    = '';
  document.getElementById('adminPassword').value = '';
  showLoginScreen();
}

/* ==================================================
   ABAS
   ================================================== */
function setupTabListeners() {
  document.querySelector('.admin-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.admin-tab');
    if (!btn) return;
    const tab = btn.getAttribute('data-tab');
    if (tab) switchTab(tab);
  });
}

function switchTab(name) {
  App.currentTab = name;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(`.admin-tab[data-tab="${name}"]`)?.classList.add('active');
  document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab' + name.charAt(0).toUpperCase() + name.slice(1))?.classList.add('active');

  switch (name) {
    case 'dashboard': loadDashboard(); break;
    case 'employees': loadEmployees(); break;
    case 'records':   loadAllRecords(); break;
  }
}

/* ==================================================
   DASHBOARD
   ================================================== */
async function loadDashboard() {
  try {
    const [statsRes, recRes] = await Promise.all([
      fetch(`${API_URL}/stats`),
      fetch(`${API_URL}/records`)
    ]);
    const stats   = await statsRes.json();
    const recData = await recRes.json();
    App.records   = recData.records || [];

    document.getElementById('statTotalEmployees').textContent = stats.total_employees || 0;
    document.getElementById('statTodayRecords').textContent   = stats.today_records   || 0;
    document.getElementById('statTotalRecords').textContent   = stats.total_records   || 0;

    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
    document.getElementById('statAvgRecordsPerDay').textContent =
      Math.round((stats.total_records || 0) / daysInMonth) || 0;

    // Popula filtro de usuários
    const sel = document.getElementById('filterUser');
    if (sel) {
      const users = [...new Set(App.records.map(r => r.user_name))].sort();
      sel.innerHTML = '<option value="">Todos os Colaboradores</option>' +
        users.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
    }

    renderRecentActivity(App.records.slice(0, 10));
  } catch (err) {
    showToast('Erro ao carregar dashboard: ' + err.message, 'error');
  }
}

function renderRecentActivity(records) {
  const el = document.getElementById('recentActivity');
  if (!el) return;
  if (!records.length) { el.innerHTML = '<p class="empty-state">Nenhuma atividade</p>'; return; }

  el.innerHTML = '';
  records.forEach(r => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.onclick = () => showRecordDetails(r.id);
    item.innerHTML = `
      <div class="activity-icon">${getTypeEmoji(r.type)}</div>
      <div class="activity-content">
        <strong>${esc(r.user_name)}</strong>
        <small>${getTypeLabel(r.type)} — ${esc(r.date)}</small>
      </div>
      <div class="activity-time">${esc(r.time.slice(0,8))}</div>
    `;
    el.appendChild(item);
  });
}

/* ==================================================
   COLABORADORES
   ================================================== */
async function loadEmployees() {
  try {
    const [recRes, usrRes] = await Promise.all([
      fetch(`${API_URL}/records`),
      fetch(`${API_URL}/users?admin_id=${adminId()}`)
    ]);

    if (!recRes.ok || !usrRes.ok) throw new Error('Erro na requisição');

    App.records   = (await recRes.json()).records || [];
    const usrData = await usrRes.json();
    const empList = (usrData.users || []).filter(u => u.role === 'employee');

    App.employees = empList.map(u => {
      const recs   = App.records.filter(r => Number(r.user_id) === Number(u.id));
      const last   = recs.length
        ? recs.reduce((a,b) => b.timestamp > a.timestamp ? b : a, recs[0])
        : null;
      return { id:u.id, name:u.name, email:u.email, totalRecords:recs.length, last };
    });

    renderEmployees(App.employees);
  } catch (err) {
    showToast('Erro ao carregar colaboradores: ' + err.message, 'error');
  }
}

function setupSearchListener() {
  document.getElementById('searchEmployee')?.addEventListener(
    'input', debounce(filterEmployees, 250)
  );
}

function filterEmployees() {
  const q = document.getElementById('searchEmployee')?.value.toLowerCase() || '';
  renderEmployees(App.employees.filter(e =>
    e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)
  ));
}

function renderEmployees(list) {
  const el = document.getElementById('employeesList');
  if (!el) return;
  if (!list.length) { el.innerHTML = '<p class="empty-state">Nenhum colaborador encontrado</p>'; return; }

  const today = new Date().toLocaleDateString('pt-BR');
  el.innerHTML = '';

  list.forEach(emp => {
    const initials  = emp.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const todayCnt  = App.records.filter(r => r.user_email === emp.email && r.date === today).length;

    const card = document.createElement('div');
    card.className = 'employee-card';
    card.onclick = e => {
      // Previne que o clique no botão excluir abra o modal
      if (e.target.closest('.btn-danger')) return;
      showEmployeeDetails(emp.id);
    };
    card.innerHTML = `
      <div class="employee-header">
        <div class="employee-avatar">${esc(initials)}</div>
        <div class="employee-info">
          <h3>${esc(emp.name)}</h3>
          <p>${esc(emp.email)}</p>
        </div>
      </div>
      <div class="employee-stats">
        <div class="employee-stat">
          <span class="employee-stat-value">${emp.totalRecords}</span>
          <span class="employee-stat-label">Total</span>
        </div>
        <div class="employee-stat">
          <span class="employee-stat-value">${todayCnt}</span>
          <span class="employee-stat-label">Hoje</span>
        </div>
      </div>
      <button class="btn btn-danger" style="width:100%;margin-top:12px"
        onclick="deleteEmployee(event,${emp.id},'${esc(emp.name)}')">
        🗑️ Excluir Conta
      </button>
    `;
    el.appendChild(card);
  });
}

function showEmployeeDetails(userId) {
  const emp = App.employees.find(e => Number(e.id) === Number(userId));
  if (!emp) return;

  const recs    = App.records.filter(r => Number(r.user_id) === Number(emp.id));
  const today   = new Date().toLocaleDateString('pt-BR');
  const todayRecs = recs.filter(r => r.date === today);
  const initials = emp.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

  const el = document.getElementById('employeeDetails');
  el.innerHTML = `
    <div class="employee-details-header">
      <div class="employee-details-avatar">${esc(initials)}</div>
      <div class="employee-details-info">
        <h3>${esc(emp.name)}</h3>
        <p>📧 ${esc(emp.email)}</p>
        <p>🕐 Último: ${emp.last ? esc(emp.last.date) + ' ' + esc(emp.last.time.slice(0,5)) : 'Nenhum'}</p>
      </div>
    </div>
    <div class="employee-details-stats">
      <div class="employee-detail-stat">
        <span class="employee-detail-stat-value">${recs.length}</span>
        <span class="employee-detail-stat-label">Total</span>
      </div>
      <div class="employee-detail-stat">
        <span class="employee-detail-stat-value">${todayRecs.length}</span>
        <span class="employee-detail-stat-label">Hoje</span>
      </div>
      <div class="employee-detail-stat">
        <span class="employee-detail-stat-value">${recs.filter(r=>r.type==='entrada').length}</span>
        <span class="employee-detail-stat-label">Entradas</span>
      </div>
      <div class="employee-detail-stat">
        <span class="employee-detail-stat-value">${recs.filter(r=>r.type==='saida').length}</span>
        <span class="employee-detail-stat-label">Saídas</span>
      </div>
    </div>
    <h3 style="margin:20px 0 12px;font-size:18px;font-family:var(--font-display);letter-spacing:2px">
      ÚLTIMOS REGISTROS
    </h3>
    <div class="admin-records-list" id="empRecordsList"></div>
  `;

  const recListEl = el.querySelector('#empRecordsList');
  recs.slice(0,15).forEach(r => {
    const item = document.createElement('div');
    item.className = 'admin-record-item';
    item.onclick = () => showRecordDetails(r.id);
    item.innerHTML = `
      <div class="admin-record-main">
        <div class="admin-record-user">
          <span class="record-badge badge-${r.type.replace(/_/g,'-')}">${getTypeLabel(r.type)}</span>
        </div>
        <div class="admin-record-datetime">
          <span>📅 ${esc(r.date)}</span>
          <span>🕐 ${esc(r.time.slice(0,8))}</span>
        </div>
      </div>
    `;
    recListEl.appendChild(item);
  });

  document.getElementById('employeeModal').classList.remove('hidden');
}

function closeEmployeeModal() {
  document.getElementById('employeeModal').classList.add('hidden');
}

/* ==================================================
   REGISTROS
   ================================================== */
async function loadAllRecords() {
  try {
    const res = await fetch(`${API_URL}/records`);
    App.records = (await res.json()).records || [];
    renderAdminRecords(App.records);
  } catch (err) {
    showToast('Erro ao carregar registros: ' + err.message, 'error');
  }
}

function renderAdminRecords(records) {
  const el    = document.getElementById('adminRecordsList');
  const count = document.getElementById('recordsCount');
  if (!el) return;

  if (count) count.textContent = `${records.length} registro${records.length !== 1 ? 's' : ''}`;

  if (!records.length) { el.innerHTML = '<p class="empty-state">Nenhum registro encontrado</p>'; return; }

  el.innerHTML = '';
  records.forEach(r => {
    const item = document.createElement('div');
    item.className = 'admin-record-item';
    item.onclick = () => showRecordDetails(r.id);
    item.innerHTML = `
      <div class="admin-record-main">
        <div class="admin-record-user">
          <strong>${esc(r.user_name)}</strong>
          <span class="record-badge badge-${r.type.replace(/_/g,'-')}">${getTypeLabel(r.type)}</span>
        </div>
        <div class="admin-record-datetime">
          <span>📅 ${esc(r.date)}</span>
          <span>🕐 ${esc(r.time.slice(0,8))}</span>
        </div>
      </div>
      <div class="admin-record-actions">
        ${r.photo    ? '📷' : ''}
        ${r.latitude ? '📍' : ''}
        <span>VER →</span>
      </div>
    `;
    el.appendChild(item);
  });
}

function showRecordDetails(recordId) {
  const r = App.records.find(rec => rec.id === recordId);
  if (!r) return;

  // Suporta: filename salvo no disco, base64 inline, ou null
  let photoUrl = null;
  if (r.photo) {
    if (r.photo.startsWith('data:image')) {
      // Base64 direto (registros antigos ou modo offline)
      photoUrl = r.photo;
    } else {
      // Nome de arquivo salvo em /uploads/
      photoUrl = `/uploads/${r.photo}`;
    }
  }

  const el = document.getElementById('recordDetails');
  el.innerHTML = `
    <div class="record-details">
      <div class="detail-row">
        <strong>👤 Colaborador</strong><span>${esc(r.user_name)}</span>
      </div>
      <div class="detail-row">
        <strong>📧 Email</strong><span>${esc(r.user_email)}</span>
      </div>
      <div class="detail-row">
        <strong>⏱️ Tipo</strong>
        <span class="record-badge badge-${r.type.replace(/_/g,'-')}">${getTypeLabel(r.type)}</span>
      </div>
      <div class="detail-row">
        <strong>📅 Data/Hora</strong><span>${esc(r.date)} ${esc(r.time.slice(0,8))}</span>
      </div>
      ${photoUrl ? `
        <div class="detail-row detail-photo">
          <strong>📷 Foto</strong>
          <img src="${photoUrl}" alt="Foto do registro" loading="lazy">
        </div>
      ` : `<div class="detail-row"><strong>📷 Foto</strong><span>Não capturada</span></div>`}
      ${r.latitude ? `
        <div class="detail-row">
          <strong>📍 Local</strong>
          <span style="text-align:right">${esc(r.address || r.latitude + ', ' + r.longitude)}</span>
        </div>
        <div style="margin-top:12px">
          <a href="https://www.google.com/maps?q=${r.latitude},${r.longitude}"
             target="_blank" rel="noopener noreferrer" class="btn btn-primary">
            🗺️ Ver no Google Maps
          </a>
        </div>
      ` : `<div class="detail-row"><strong>📍 Local</strong><span>Não capturado</span></div>`}
    </div>
  `;
  document.getElementById('detailsModal').classList.remove('hidden');
}

function closeDetailsModal() {
  document.getElementById('detailsModal').classList.add('hidden');
}

/* ==================================================
   FILTROS
   ================================================== */
function applyFilters() {
  const start = document.getElementById('filterStartDate').value;
  const end   = document.getElementById('filterEndDate').value;
  const user  = document.getElementById('filterUser').value;
  const type  = document.getElementById('filterType').value;

  let filtered = [...App.records];

  if (start && end) {
    filtered = filtered.filter(r => {
      const iso = brToIso(r.date);
      return iso >= start && iso <= end;
    });
  }

  if (user) filtered = filtered.filter(r => r.user_name === user);
  if (type) filtered = filtered.filter(r => r.type === type);

  renderAdminRecords(filtered);
  showToast(`${filtered.length} registro(s) encontrado(s)`, 'success');
}

function clearFilters() {
  ['filterStartDate','filterEndDate'].forEach(id => document.getElementById(id).value = '');
  ['filterUser','filterType'].forEach(id => document.getElementById(id).selectedIndex = 0);
  renderAdminRecords(App.records);
  showToast('Filtros limpos', 'success');
}

/* ==================================================
   EXPORTAÇÃO CSV
   ================================================== */
function exportRecords() {
  if (!App.records.length) { showToast('Nenhum registro para exportar!', 'error'); return; }

  const header = 'Nome,Email,Tipo,Data,Hora,Localização\n';
  const rows   = App.records.map(r => {
    const label = getTypeLabel(r.type).replace(/[🟢🟡🔵🔴]/g,'').trim();
    return `"${r.user_name}","${r.user_email}","${label}","${r.date}","${r.time}","${r.address || ''}"`;
  }).join('\n');

  const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `WD_Registros_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 CSV exportado com sucesso!', 'success');
}

/* ==================================================
   RELATÓRIOS
   ================================================== */
function generateDailyReport() {
  const today   = new Date().toLocaleDateString('pt-BR');
  const records = App.records.filter(r => r.date === today);
  const users   = new Set(records.map(r => r.user_name));

  let html = `
    <p><strong>Data:</strong> ${today}</p>
    <p><strong>Total de registros:</strong> ${records.length}</p>
    <p><strong>Colaboradores presentes:</strong> ${users.size}</p>
  `;

  if (records.length) {
    html += '<br><table style="width:100%;border-collapse:collapse">' +
      '<thead><tr style="background:rgba(255,215,0,0.1)">' +
      '<th style="padding:10px;border:1px solid var(--border);text-align:left">Colaborador</th>' +
      '<th style="padding:10px;border:1px solid var(--border)">Tipo</th>' +
      '<th style="padding:10px;border:1px solid var(--border)">Hora</th>' +
      '</tr></thead><tbody>';
    records.forEach(r => {
      html += `<tr>
        <td style="padding:10px;border:1px solid var(--border)">${esc(r.user_name)}</td>
        <td style="padding:10px;border:1px solid var(--border);text-align:center">${getTypeLabel(r.type)}</td>
        <td style="padding:10px;border:1px solid var(--border);text-align:center">${esc(r.time.slice(0,8))}</td>
      </tr>`;
    });
    html += '</tbody></table>';
  } else {
    html += '<p style="margin-top:16px;color:var(--text-muted)">Nenhum registro hoje.</p>';
  }

  showReportResult('📅 Relatório Diário — ' + today, html);
}

function generateWeeklyReport() {
  const now     = new Date();
  const weekAgo = new Date(now - 7*24*60*60*1000);
  const records = App.records.filter(r => {
    const [d,m,y] = r.date.split('/');
    const dt = new Date(+y, +m-1, +d);
    return dt >= weekAgo && dt <= now;
  });

  const byDay = {};
  records.forEach(r => {
    byDay[r.date] = (byDay[r.date] || 0) + 1;
  });

  showReportResult('📆 Relatório Semanal', `
    <p><strong>Período:</strong> Últimos 7 dias</p>
    <p><strong>Total:</strong> ${records.length}</p>
    <p><strong>Colaboradores:</strong> ${new Set(records.map(r=>r.user_name)).size}</p>
    <p><strong>Média/dia:</strong> ${(records.length/7).toFixed(1)}</p>
  `);
}

function generateMonthlyReport() { openEspelhoModal(); }

function generateEmployeeReport() {
  if (!App.employees.length) {
    showToast('Acesse a aba Colaboradores primeiro', 'error'); return;
  }
  let html = '';
  App.employees.forEach(emp => {
    const recs = App.records.filter(r => r.user_email === emp.email);
    html += `
      <div style="margin-bottom:16px;padding:16px;background:rgba(0,0,0,0.2);border-radius:10px;
                  border-left:3px solid var(--yellow)">
        <h4 style="margin-bottom:8px">${esc(emp.name)}</h4>
        <p style="font-size:13px;color:var(--text-muted)">
          Total: ${recs.length} |
          Entradas: ${recs.filter(r=>r.type==='entrada').length} |
          Saídas: ${recs.filter(r=>r.type==='saida').length}
        </p>
      </div>
    `;
  });
  showReportResult('👤 Relatório por Colaborador', html);
}

function showReportResult(title, content) {
  const el = document.getElementById('reportResult');
  if (!el) return;
  el.innerHTML = `<h3>${title}</h3>${content}`;
  el.classList.add('active');
  el.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

/* ==================================================
   ESPELHO DE PONTO
   ================================================== */
function openEspelhoModal() {
  const existing = document.getElementById('espelhoModal');
  if (existing) existing.remove();

  const users = [...new Set(App.records.map(r => r.user_name))].sort();
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id        = 'espelhoModal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>📋 Espelho de Ponto</h2>
        <button class="btn-close" onclick="document.getElementById('espelhoModal').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Colaborador</label>
          <select id="espelhoUser" class="form-control">
            <option value="">Todos</option>
            ${users.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Mês/Ano</label>
          <input type="month" id="espelhoMonth" class="form-control"
            value="${new Date().toISOString().slice(0,7)}">
        </div>
        <button onclick="gerarEspelhoPonto()" class="btn btn-primary btn-large">📄 Gerar Espelho</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function gerarEspelhoPonto() {
  const userName  = document.getElementById('espelhoUser').value;
  const monthYear = document.getElementById('espelhoMonth').value;
  if (!monthYear) { showToast('Selecione o mês/ano', 'error'); return; }

  const [year, month] = monthYear.split('-');
  const monthLabel = new Date(+year, +month-1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});

  let records = App.records.filter(r => {
    const [,m,y] = r.date.split('/');
    return y === year && m === month.padStart(2,'0');
  });
  if (userName) records = records.filter(r => r.user_name === userName);

  if (!records.length) { showToast('Nenhum registro neste período', 'error'); return; }

  // Agrupa por usuário e data
  const byUser = {};
  records.forEach(r => {
    if (!byUser[r.user_name]) byUser[r.user_name] = {};
    if (!byUser[r.user_name][r.date]) byUser[r.user_name][r.date] = [];
    byUser[r.user_name][r.date].push(r);
  });

  let html = '';
  Object.keys(byUser).forEach(u => {
    html += buildEspelhoTable(u, monthLabel, byUser[u]);
  });

  document.getElementById('espelhoModal')?.remove();
  showEspelhoResult(monthLabel.toUpperCase(), html);
}

function buildEspelhoTable(userName, monthLabel, userRecords) {
  const dates = Object.keys(userRecords).sort((a,b) => {
    const toDate = d => { const [dd,mm,yy]=d.split('/'); return new Date(+yy,+mm-1,+dd); };
    return toDate(a) - toDate(b);
  });

  let horasUteis = 0, horasSab = 0, horasDomFer = 0;
  let daysWorked = 0, incompletos = 0;
  let rows = '';

  dates.forEach(date => {
    const day    = userRecords[date].sort((a,b)=>a.timestamp-b.timestamp);
    const dd     = date.split('/')[0];
    const dow    = getDow(date);
    const isofmt = brToIso(date);
    const isFer  = isFeriado(isofmt);

    const entrada        = day.find(r=>r.type==='entrada');
    const saidaAlm       = day.find(r=>r.type==='saida_almoco');
    const retornoAlm     = day.find(r=>r.type==='retorno_almoco');
    const saida          = day.find(r=>r.type==='saida');

    let mins = 0;
    if (entrada && saidaAlm)    mins += calcMinutes(entrada.time, saidaAlm.time);
    if (retornoAlm && saida)    mins += calcMinutes(retornoAlm.time, saida.time);

    // Detecta dias incompletos
    const hasEntrada = !!entrada;
    const hasSaida   = !!saida;
    const incomplete = hasEntrada && !hasSaida;
    if (incomplete) incompletos++;

    let tipoDia, bgColor;
    if (isFer)        { tipoDia = '🎊 Feriado'; bgColor = '#ffe5e5'; horasDomFer += mins; }
    else if (dow===0) { tipoDia = '☀️ Domingo'; bgColor = '#ffe5e5'; horasDomFer += mins; }
    else if (dow===6) { tipoDia = '📅 Sábado';  bgColor = '#fff8e5'; horasSab    += mins; }
    else              { tipoDia = '📋 Dia Útil'; bgColor = '#f9f9f9'; horasUteis  += mins; }

    if (mins > 0) daysWorked++;

    const total = mins > 0 ? fmtMin(mins) : incomplete ? '⚠️ Incompleto' : '-';
    const totalStyle = incomplete ? 'color:#ff9100;font-weight:700' : 'font-weight:700';

    rows += `<tr style="background:${bgColor}">
      <td style="padding:9px;border:1px solid #ddd;text-align:center;font-weight:600">${dd}</td>
      <td style="padding:9px;border:1px solid #ddd;text-align:center;font-size:11px;font-weight:600">${tipoDia}</td>
      <td style="padding:9px;border:1px solid #ddd;text-align:center">${entrada    ? entrada.time.slice(0,5)    : '-'}</td>
      <td style="padding:9px;border:1px solid #ddd;text-align:center">${saidaAlm   ? saidaAlm.time.slice(0,5)   : '-'}</td>
      <td style="padding:9px;border:1px solid #ddd;text-align:center">${retornoAlm ? retornoAlm.time.slice(0,5) : '-'}</td>
      <td style="padding:9px;border:1px solid #ddd;text-align:center">${saida      ? saida.time.slice(0,5)      : '-'}</td>
      <td style="padding:9px;border:1px solid #ddd;text-align:center;${totalStyle}">${total}</td>
    </tr>`;
  });

  // Totais com adicionais
  const totUteis   = horasUteis;
  const totSab     = Math.round(horasSab * 1.5);
  const totDomFer  = Math.round(horasDomFer * 2.0);
  const totalGeral = totUteis + totSab + totDomFer;

  const avisoIncompleto = incompletos > 0
    ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-top:16px;color:#856404">
        ⚠️ <strong>${incompletos} dia(s) com registro incompleto</strong> (entrada sem saída correspondente).
        Estes dias não foram contabilizados nas horas totais.
       </div>` : '';

  return `
    <div style="page-break-after:always;margin-bottom:40px;font-family:Arial,sans-serif">
      <div style="background:linear-gradient(135deg,#FFD700,#FFA500);color:#0a0a0a;padding:24px 32px;
                  border-radius:12px 12px 0 0;text-align:center">
        <h2 style="margin:0;font-size:24px;font-weight:900;letter-spacing:3px;text-transform:uppercase">
          WD MANUTENÇÕES
        </h2>
        <h3 style="margin:8px 0 0;font-size:16px;font-weight:600">
          ESPELHO DE PONTO ELETRÔNICO
        </h3>
      </div>

      <div style="background:white;color:#111;padding:28px;border-radius:0 0 12px 12px;
                  border:1px solid #ddd;border-top:none">
        <div style="margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #FFD700">
          <p style="margin:4px 0"><strong>COLABORADOR:</strong> ${esc(userName)}</p>
          <p style="margin:4px 0"><strong>PERÍODO:</strong> ${monthLabel.toUpperCase()}</p>
          <p style="margin:4px 0"><strong>EMISSÃO:</strong>
            ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
          </p>
        </div>

        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#FFD700;color:#0a0a0a">
              <th style="padding:10px;border:1px solid #ddd">DIA</th>
              <th style="padding:10px;border:1px solid #ddd">TIPO</th>
              <th style="padding:10px;border:1px solid #ddd">ENTRADA</th>
              <th style="padding:10px;border:1px solid #ddd">S. ALMOÇO</th>
              <th style="padding:10px;border:1px solid #ddd">RETORNO</th>
              <th style="padding:10px;border:1px solid #ddd">SAÍDA</th>
              <th style="padding:10px;border:1px solid #ddd">TOTAL</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        ${avisoIncompleto}

        <div style="margin-top:24px;padding:18px;background:#f8f9fa;border-radius:10px;
                    border:2px solid #FFD700">
          <h3 style="margin:0 0 16px;text-align:center;font-size:16px">📊 RESUMO COM ADICIONAIS</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#FFD700;color:#0a0a0a">
                <th style="padding:10px;border:1px solid #ddd;text-align:left">Tipo</th>
                <th style="padding:10px;border:1px solid #ddd;text-align:center">Horas</th>
                <th style="padding:10px;border:1px solid #ddd;text-align:center">Adicional</th>
                <th style="padding:10px;border:1px solid #ddd;text-align:center">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background:#f9f9f9">
                <td style="padding:10px;border:1px solid #ddd">📋 Dias Úteis</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;font-weight:700">${fmtMin(horasUteis)} (${fmtDec(horasUteis)}h)</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center">—</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;font-weight:700;background:#e8f5e9">${fmtMin(horasUteis)}</td>
              </tr>
              <tr style="background:#fff8e5">
                <td style="padding:10px;border:1px solid #ddd">📅 Sábados</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;font-weight:700">${fmtMin(horasSab)} (${fmtDec(horasSab)}h)</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;color:#d97706;font-weight:600">+50%</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;font-weight:700;background:#fef3c7">${fmtMin(totSab)}</td>
              </tr>
              <tr style="background:#ffe5e5">
                <td style="padding:10px;border:1px solid #ddd">☀️ Dom/Feriados</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;font-weight:700">${fmtMin(horasDomFer)} (${fmtDec(horasDomFer)}h)</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;color:#dc2626;font-weight:600">+100%</td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;font-weight:700;background:#fee2e2">${fmtMin(totDomFer)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style="background:#FFD700;color:#0a0a0a">
                <td colspan="3" style="padding:13px;border:1px solid #ddd;text-align:right;font-weight:800;font-size:15px">
                  💰 TOTAL GERAL:
                </td>
                <td style="padding:13px;border:1px solid #ddd;text-align:center;font-weight:900;font-size:17px">
                  ${fmtMin(totalGeral)} (${fmtDec(totalGeral)}h)
                </td>
              </tr>
              <tr style="background:#f5f5f5">
                <td colspan="3" style="padding:10px;border:1px solid #ddd;text-align:right;font-weight:600">
                  DIAS TRABALHADOS:
                </td>
                <td style="padding:10px;border:1px solid #ddd;text-align:center;font-weight:700">
                  ${daysWorked} dias
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style="margin-top:20px;padding:12px;background:#f0f0f0;border-radius:8px;font-size:12px">
          <strong>📌 LEGENDA:</strong>
          Dia Útil (Seg–Sex): sem adicional &nbsp;|&nbsp;
          Sábado: +50% &nbsp;|&nbsp;
          Domingo/Feriado: +100%
        </div>

        <div style="margin-top:40px;padding-top:20px;border-top:2px solid #FFD700">
          <p style="text-align:center;font-size:11px;color:#666;margin-bottom:40px">
            Documento gerado eletronicamente pelo Sistema WD Manutenções.<br>
            Válido conforme CLT Art. 74, § 2º. Gerado em
            ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
          </p>
          <div style="display:flex;justify-content:space-around;gap:40px">
            <div style="text-align:center;flex:1">
              <div style="border-top:2px solid #000;margin-bottom:8px"></div>
              <p style="font-size:12px;font-weight:600">Assinatura do Colaborador</p>
            </div>
            <div style="text-align:center;flex:1">
              <div style="border-top:2px solid #000;margin-bottom:8px"></div>
              <p style="font-size:12px;font-weight:600">Assinatura do Responsável</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function showEspelhoResult(monthLabel, html) {
  const existing = document.getElementById('espelhoResultModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'espelhoResultModal';
  modal.innerHTML = `
    <div class="modal-content modal-large" style="max-height:92vh;overflow-y:auto">
      <div class="modal-header">
        <h2>📋 Espelho — ${monthLabel}</h2>
        <button class="btn-close" onclick="document.getElementById('espelhoResultModal').remove()">×</button>
      </div>
      <div class="modal-body">
        ${html}
        <div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid var(--border)">
          <button onclick="window.print()" class="btn btn-primary" style="margin-right:10px">
            🖨️ Imprimir / Salvar PDF
          </button>
          <button onclick="document.getElementById('espelhoResultModal').remove()" class="btn btn-secondary">
            Fechar
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

/* ==================================================
   AÇÕES DESTRUTIVAS (com modal de confirmação)
   ================================================== */
async function clearAllRecords() {
  const confirmed = await confirmDialog(
    '🗑️ Limpar Todos os Registros',
    'Esta ação é IRREVERSÍVEL. Todos os registros de ponto de TODOS os colaboradores serão apagados. Deseja continuar?',
    'Sim, apagar tudo',
    'btn-danger'
  );
  if (!confirmed) return;

  try {
    const res  = await fetch(`${API_URL}/records`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_id: adminId() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro');
    App.records = [];
    await loadDashboard();
    if (App.currentTab === 'employees') loadEmployees();
    if (App.currentTab === 'records')   renderAdminRecords([]);
    showToast('Todos os registros foram removidos.', 'success');
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

async function deleteEmployee(event, userId, userName) {
  event.stopPropagation();

  const confirmed = await confirmDialog(
    '🗑️ Excluir Colaborador',
    `Deseja excluir a conta de "${userName}"? Todos os registros dessa pessoa também serão removidos.`,
    'Sim, excluir',
    'btn-danger'
  );
  if (!confirmed) return;

  try {
    const res  = await fetch(`${API_URL}/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_id: adminId() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro');
    showToast(`Conta de "${userName}" excluída.`, 'success');
    await loadEmployees();
    await loadDashboard();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

/* Modal de confirmação customizado (substitui window.confirm) */
function confirmDialog(title, message, okText = 'Confirmar', okClass = 'btn-primary') {
  return new Promise(resolve => {
    const existing = document.getElementById('confirmModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'confirmModal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:440px">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="btn-close" onclick="document.getElementById('confirmModal').remove()">×</button>
        </div>
        <div class="modal-body">
          <p style="line-height:1.6;color:var(--text-muted);margin-bottom:24px">${message}</p>
          <div style="display:flex;gap:12px;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="document.getElementById('confirmModal').remove()">
              Cancelar
            </button>
            <button class="btn ${okClass}" id="confirmOkBtn">${okText}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#confirmOkBtn').onclick = () => {
      modal.remove();
      resolve(true);
    };
    modal.addEventListener('click', e => {
      if (e.target === modal) { modal.remove(); resolve(false); }
    });
  });
}

/* ==================================================
   UTILITÁRIOS
   ================================================== */
function getTypeLabel(type) {
  return { entrada:'🟢 Entrada', saida_almoco:'🟡 Saída Almoço',
           retorno_almoco:'🔵 Retorno Almoço', saida:'🔴 Saída' }[type] || type;
}

function getTypeEmoji(type) {
  return { entrada:'🟢', saida_almoco:'🟡', retorno_almoco:'🔵', saida:'🔴' }[type] || '⚪';
}

/* ==================================================
   SCROLL
   ================================================== */
function updateScrollButtons() {
  const top  = window.pageYOffset;
  const h    = document.documentElement.scrollHeight;
  const view = window.innerHeight;
  document.getElementById('scrollToTop')?.classList.toggle('visible', top > 300);
  const botBtn = document.getElementById('scrollToBottom');
  if (botBtn) botBtn.style.display = top + view >= h - 80 ? 'none' : 'flex';
}

function scrollToTopFn()    { window.scrollTo({ top:0, behavior:'smooth' }); }
function scrollToBottomFn() { window.scrollTo({ top:document.documentElement.scrollHeight, behavior:'smooth' }); }

console.log('✅ WD Manutenções Admin — carregado com sucesso');