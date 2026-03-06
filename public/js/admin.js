/* admin.js — WD Manutenções v3 */
'use strict';

const API = '/api';
const SK  = 'wd_user_v3';

/* ─── FERIADOS 2025-2027 ─── */
const FERIADOS = new Set([
  '2025-01-01','2025-02-24','2025-02-25','2025-04-18','2025-04-21','2025-05-01',
  '2025-06-19','2025-09-07','2025-10-12','2025-11-02','2025-11-15','2025-11-20','2025-12-25',
  '2026-01-01','2026-02-16','2026-02-17','2026-04-03','2026-04-21','2026-05-01',
  '2026-06-04','2026-09-07','2026-10-12','2026-11-02','2026-11-15','2026-11-20','2026-12-25',
  '2027-01-01','2027-02-15','2027-02-16','2027-03-26','2027-04-21','2027-05-01',
  '2027-05-27','2027-09-07','2027-10-12','2027-11-02','2027-11-15','2027-11-20','2027-12-25',
]);

const App = { admin:null, records:[], employees:[], tab:'dashboard' };

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
  setupTabs();
  document.getElementById('searchEmp')?.addEventListener('input', debounce(filterEmps, 220));
  window.addEventListener('scroll', () => {
    document.getElementById('scrollTop')?.classList.toggle('show', scrollY > 280);
  });
});

/* ════════════════════════════════════════
   AUTH
════════════════════════════════════════ */
function checkAdminAuth() {
  const s = sessionStorage.getItem(SK) || localStorage.getItem(SK);
  if (s) {
    const u = JSON.parse(s);
    if (u.role === 'admin') { App.admin = u; showPanel(); return; }
  }
  showLoginScreen();
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = '';
  document.getElementById('adminPanel').classList.add('hidden');
  document.getElementById('adminPass')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doAdminLogin();
  });
}

async function doAdminLogin() {
  const email = val('adminEmail'), pass = val('adminPass');
  if (!email || !pass) return toast('Preencha email e senha', 'error');
  try {
    const d = await post('/login', { email, password: pass });
    if (d.success && d.user.role === 'admin') {
      App.admin = d.user;
      const s = JSON.stringify(d.user);
      sessionStorage.setItem(SK, s); localStorage.setItem(SK, s);
      showPanel(); toast('Acesso autorizado!', 'success');
    } else { toast(d.error || 'Credenciais inválidas ou sem permissão', 'error'); }
  } catch { toast('Erro de conexão', 'error'); }
}

function showPanel() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminPanel').classList.remove('hidden');
  document.getElementById('adminGreet').textContent = App.admin.name;
  setTimeout(loadDashboard, 80);
}

function doAdminLogout() {
  if (!confirm('Sair do painel?')) return;
  App.admin = null; App.records = []; App.employees = [];
  sessionStorage.removeItem(SK); localStorage.removeItem(SK);
  document.getElementById('adminEmail').value = '';
  document.getElementById('adminPass').value  = '';
  showLoginScreen();
}

/* ════════════════════════════════════════
   ABAS
════════════════════════════════════════ */
function setupTabs() {
  document.querySelector('.admin-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.a-tab');
    if (!btn) return;
    const t = btn.getAttribute('data-tab');
    if (t) switchTab(t);
  });
}

function switchTab(name) {
  App.tab = name;
  document.querySelectorAll('.a-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(`.a-tab[data-tab="${name}"]`)?.classList.add('active');
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  document.getElementById('tab'+cap)?.classList.add('active');
  if (name === 'dashboard')  loadDashboard();
  if (name === 'employees')  loadEmployees();
  if (name === 'records')    loadAllRecords();
}

/* ════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════ */
async function loadDashboard() {
  try {
    const [sr, rr] = await Promise.all([fetch(`${API}/stats`), fetch(`${API}/records`)]);
    const stats = await sr.json();
    const rdata = await rr.json();
    App.records = rdata.records || [];

    document.getElementById('sEmp').textContent   = stats.total_employees || 0;
    document.getElementById('sToday').textContent = stats.today_records   || 0;
    document.getElementById('sTotal').textContent = stats.total_records   || 0;
    const days = new Set(App.records.map(r=>r.date)).size;
    document.getElementById('sDays').textContent  = days;

    // popula filtro usuário
    const sel = document.getElementById('fUser');
    if (sel) {
      const users = [...new Set(App.records.map(r=>r.user_name))].sort();
      sel.innerHTML = '<option value="">Todos</option>' + users.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('');
    }
    renderActivity(App.records.slice(0, 12));
  } catch(e) { toast('Erro ao carregar dashboard: '+e.message, 'error'); }
}

function renderActivity(recs) {
  const el = document.getElementById('activityList');
  if (!el) return;
  if (!recs.length) { el.innerHTML = '<p class="empty-msg">Nenhuma atividade</p>'; return; }
  el.innerHTML = '';
  recs.forEach(r => {
    const d = document.createElement('div');
    d.className = 'act-item';
    d.onclick = () => showRecordDetail(r.id);
    d.innerHTML = `
      <div class="act-icon">${typeEmoji(r.type)}</div>
      <div class="act-body">
        <strong>${esc(r.user_name)}</strong>
        <small>${typeLabel(r.type)} — ${esc(r.date)}</small>
      </div>
      <div class="act-time">${esc(r.time.slice(0,5))}</div>
    `;
    el.appendChild(d);
  });
}

/* ════════════════════════════════════════
   COLABORADORES
════════════════════════════════════════ */
async function loadEmployees() {
  try {
    const [rr, ur] = await Promise.all([
      fetch(`${API}/records`),
      fetch(`${API}/users?admin_id=${App.admin.id}`)
    ]);
    App.records   = (await rr.json()).records || [];
    const ud      = await ur.json();
    App.employees = (ud.users || [])
      .filter(u => u.role === 'employee')
      .map(u => {
        const recs = App.records.filter(r => Number(r.user_id) === Number(u.id));
        const last = recs[0] || null;
        return { ...u, recs, last };
      });
    renderEmps(App.employees);
  } catch(e) { toast('Erro: '+e.message, 'error'); }
}

function filterEmps() {
  const q = (document.getElementById('searchEmp')?.value || '').toLowerCase();
  renderEmps(App.employees.filter(e => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)));
}

function renderEmps(list) {
  const el = document.getElementById('empGrid');
  if (!el) return;
  if (!list.length) { el.innerHTML = '<p class="empty-msg">Nenhum colaborador</p>'; return; }
  const today = new Date().toLocaleDateString('pt-BR');
  el.innerHTML = '';
  list.forEach(emp => {
    const init = emp.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const todayC = emp.recs.filter(r=>r.date===today).length;
    const card = document.createElement('div');
    card.className = 'emp-card';
    card.innerHTML = `
      <div class="emp-head">
        <div class="emp-avatar">${esc(init)}</div>
        <div class="emp-info">
          <h3>${esc(emp.name)}</h3>
          <p>${esc(emp.email)}</p>
        </div>
      </div>
      <div class="emp-stats">
        <div class="emp-stat"><span class="emp-stat-val">${emp.recs.length}</span><span class="emp-stat-lbl">Total</span></div>
        <div class="emp-stat"><span class="emp-stat-val">${todayC}</span><span class="emp-stat-lbl">Hoje</span></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" style="flex:1" onclick="event.stopPropagation();showEmpDetail(${emp.id})">👁 Detalhes</button>
        <button class="btn btn-danger btn-sm"    style="flex:1" onclick="event.stopPropagation();deleteEmp(${emp.id},'${esc(emp.name)}')">🗑 Excluir</button>
      </div>
    `;
    card.onclick = () => showEmpDetail(emp.id);
    el.appendChild(card);
  });
}

function showEmpDetail(id) {
  const emp = App.employees.find(e => Number(e.id) === Number(id));
  if (!emp) return;
  const init = emp.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  const today = new Date().toLocaleDateString('pt-BR');
  const todayC = emp.recs.filter(r=>r.date===today).length;

  let recsHtml = '';
  emp.recs.slice(0, 15).forEach(r => {
    recsHtml += `<tr onclick="showRecordDetail(${r.id})" style="cursor:pointer">
      <td><span class="rec-badge badge-${r.type.replace(/_/g,'-')}">${typeLabel(r.type)}</span></td>
      <td>${esc(r.date)}</td>
      <td>${esc(r.time.slice(0,8))}</td>
      <td>${r.has_photo?'📷':'—'}</td>
      <td>${r.latitude?'📍':'—'}</td>
    </tr>`;
  });

  document.getElementById('empBody').innerHTML = `
    <div style="display:flex;align-items:center;gap:18px;padding:18px;background:rgba(0,0,0,.25);border-radius:var(--r);margin-bottom:20px">
      <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--y),var(--yd));display:flex;align-items:center;justify-content:center;font-family:var(--fb);font-size:28px;font-weight:900;color:#000;flex-shrink:0">${esc(init)}</div>
      <div>
        <h3 style="font-size:20px;font-weight:700;margin-bottom:5px">${esc(emp.name)}</h3>
        <p style="color:var(--t2);font-size:13px">📧 ${esc(emp.email)}</p>
        <p style="color:var(--t2);font-size:12px;margin-top:3px">Cadastro: ${esc(emp.created_at||'—')}</p>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
      <div style="background:rgba(0,0,0,.28);border:1px solid var(--b1);border-radius:var(--rs);padding:14px;text-align:center">
        <span style="display:block;font-family:var(--fm);font-size:28px;font-weight:700;color:var(--y)">${emp.recs.length}</span>
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--t3)">Total</span>
      </div>
      <div style="background:rgba(0,0,0,.28);border:1px solid var(--b1);border-radius:var(--rs);padding:14px;text-align:center">
        <span style="display:block;font-family:var(--fm);font-size:28px;font-weight:700;color:var(--y)">${todayC}</span>
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--t3)">Hoje</span>
      </div>
      <div style="background:rgba(0,0,0,.28);border:1px solid var(--b1);border-radius:var(--rs);padding:14px;text-align:center">
        <span style="display:block;font-family:var(--fm);font-size:28px;font-weight:700;color:var(--y)">${new Set(emp.recs.map(r=>r.date)).size}</span>
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--t3)">Dias</span>
      </div>
    </div>
    <h3 style="font-family:var(--fb);font-size:16px;font-weight:800;letter-spacing:2px;margin-bottom:12px">ÚLTIMOS REGISTROS</h3>
    <div class="records-table-wrap">
      <table class="records-table">
        <thead><tr><th>Tipo</th><th>Data</th><th>Hora</th><th>Foto</th><th>GPS</th></tr></thead>
        <tbody>${recsHtml}</tbody>
      </table>
    </div>
  `;
  openModal('empModal');
}

/* ════════════════════════════════════════
   REGISTROS
════════════════════════════════════════ */
async function loadAllRecords() {
  try {
    const r = await fetch(`${API}/records`);
    App.records = (await r.json()).records || [];
    renderRecords(App.records);
  } catch(e) { toast('Erro: '+e.message, 'error'); }
}

function renderRecords(recs) {
  const tbody = document.getElementById('recTbody');
  const count = document.getElementById('recCount');
  if (!tbody) return;
  if (count) count.textContent = `${recs.length} registro${recs.length!==1?'s':''}`;
  if (!recs.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-msg">Nenhum registro encontrado</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  recs.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(r.user_name)}</strong><br><small style="color:var(--t2)">${esc(r.user_email)}</small></td>
      <td><span class="rec-badge badge-${r.type.replace(/_/g,'-')}">${typeLabel(r.type)}</span></td>
      <td>${esc(r.date)}</td>
      <td style="font-family:var(--fm);font-size:15px;font-weight:700">${esc(r.time.slice(0,8))}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--t2)">${r.latitude?`📍 ${esc(r.address||'GPS')}`.slice(0,40):'—'}</td>
      <td style="text-align:center">${r.has_photo?'<span style="cursor:pointer;font-size:18px" title="Ver foto" onclick="showRecordDetail('+r.id+')">📷</span>':'<span style="color:var(--t3)">—</span>'}</td>
      <td>
        <div class="tbl-actions">
          <button class="btn btn-secondary btn-sm" onclick="showRecordDetail(${r.id})" title="Ver">👁</button>
          <button class="btn btn-secondary btn-sm" onclick="editRecord(${r.id},'${esc(r.date)}','${r.time.slice(0,5)}','${r.type}')" title="Editar">✏️</button>
          <button class="btn btn-danger btn-sm"    onclick="deleteRecord(${r.id})" title="Excluir">🗑</button>
        </div>
      </td>
    `;
    tr.style.cursor = 'pointer';
    tbody.appendChild(tr);
  });
}

/* ════════════════════════════════════════
   DETALHE REGISTRO — CARREGA FOTO DO SERVIDOR
════════════════════════════════════════ */
async function showRecordDetail(id) {
  document.getElementById('detailBody').innerHTML = '<p style="text-align:center;padding:40px;color:var(--t2)">⏳ Carregando...</p>';
  openModal('detailModal');

  try {
    const r   = await fetch(`${API}/record/${id}`);
    const { record } = await r.json();
    if (!record) return (document.getElementById('detailBody').innerHTML = '<p class="empty-msg">Registro não encontrado</p>');

    /* foto: pode ser base64 completo guardado no banco */
    let photoHtml = `
      <div class="photo-placeholder">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        Sem foto
      </div>`;
    if (record.photo_data) {
      const src = record.photo_data.startsWith('data:') ? record.photo_data : `data:image/jpeg;base64,${record.photo_data}`;
      photoHtml = `<div class="detail-photo-wrap"><img src="${src}" alt="Foto do registro" loading="lazy"></div>`;
    }

    const mapsUrl = record.latitude ? `https://www.google.com/maps?q=${record.latitude},${record.longitude}` : null;

    document.getElementById('detailBody').innerHTML = `
      <div class="detail-grid">
        <div class="detail-row">
          <strong>👤 Colaborador</strong><span>${esc(record.user_name)}</span>
        </div>
        <div class="detail-row">
          <strong>📧 Email</strong><span>${esc(record.user_email)}</span>
        </div>
        <div class="detail-row">
          <strong>⏱️ Tipo</strong>
          <span class="rec-badge badge-${record.type.replace(/_/g,'-')}">${typeLabel(record.type)}</span>
        </div>
        <div class="detail-row">
          <strong>📅 Data/Hora</strong>
          <span>${esc(record.date)} às ${esc(record.time.slice(0,8))}</span>
        </div>
        <div class="detail-row" style="flex-direction:column;align-items:flex-start;gap:10px">
          <strong>📷 Foto</strong>
          ${photoHtml}
        </div>
        <div class="detail-row" style="flex-direction:column;align-items:flex-start;gap:10px">
          <strong>📍 Localização</strong>
          ${record.latitude
            ? `<span style="font-size:13px;line-height:1.6;color:var(--t2)">${esc(record.address||record.latitude+', '+record.longitude)}</span>
               <a href="${mapsUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">🗺 Abrir no Maps</a>`
            : '<span style="color:var(--t3)">Não capturada</span>'
          }
        </div>
      </div>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--b1);display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="editRecord(${record.id},'${esc(record.date)}','${esc(record.time.slice(0,5))}','${record.type}')">✏️ Editar Registro</button>
        <button class="btn btn-danger"    onclick="deleteRecord(${record.id},true)">🗑️ Excluir</button>
      </div>
    `;
  } catch(e) {
    document.getElementById('detailBody').innerHTML = `<p class="empty-msg">Erro: ${esc(e.message)}</p>`;
  }
}

/* ════════════════════════════════════════
   EDITAR REGISTRO
════════════════════════════════════════ */
async function editRecord(id, date, time, type) {
  // monta o HTML do form dentro do confirm modal (reaproveitando)
  document.getElementById('confirmTitle').textContent = '✏️ Editar Registro';
  document.getElementById('confirmMsg').innerHTML = `
    <div class="form-group" style="margin-bottom:14px">
      <label style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--t2);display:block;margin-bottom:7px">Tipo</label>
      <select id="editType" class="form-control">
        <option value="entrada"          ${type==='entrada'          ?'selected':''}>🟢 Entrada</option>
        <option value="saida_almoco"     ${type==='saida_almoco'     ?'selected':''}>🟡 Saída para Almoço</option>
        <option value="retorno_almoco"   ${type==='retorno_almoco'   ?'selected':''}>🔵 Retorno do Almoço</option>
        <option value="saida"            ${type==='saida'            ?'selected':''}>🔴 Saída</option>
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group" style="margin:0">
        <label style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--t2);display:block;margin-bottom:7px">Data (DD/MM/AAAA)</label>
        <input id="editDate" class="form-control" value="${date}" placeholder="DD/MM/AAAA">
      </div>
      <div class="form-group" style="margin:0">
        <label style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--t2);display:block;margin-bottom:7px">Hora (HH:MM)</label>
        <input id="editTime" class="form-control" value="${time}" placeholder="HH:MM">
      </div>
    </div>
  `;
  document.getElementById('confirmOk').textContent = '✓ Salvar';

  openModal('confirmModal');

  // aguarda resolução do confirm
  const ok = await new Promise(res => { _resolveConfirm = res; });
  if (!ok) return;

  const newType = document.getElementById('editType')?.value;
  const newDate = document.getElementById('editDate')?.value.trim();
  const newTime = document.getElementById('editTime')?.value.trim();

  if (!newType || !newDate || !newTime) return toast('Preencha todos os campos', 'error');
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(newDate)) return toast('Data inválida (use DD/MM/AAAA)', 'error');
  if (!/^\d{2}:\d{2}$/.test(newTime))          return toast('Hora inválida (use HH:MM)', 'error');

  try {
    const r = await fetch(`${API}/record/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_id: App.admin.id, type: newType, date: newDate, time: newTime+':00' }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    toast('✅ Registro atualizado!', 'success');
    closeModal('detailModal');
    // atualiza em memória
    const idx = App.records.findIndex(x => x.id === id);
    if (idx >= 0) App.records[idx] = { ...App.records[idx], type: newType, date: newDate, time: newTime+':00' };
    if (App.tab === 'records')   renderRecords(App.records);
    if (App.tab === 'dashboard') renderActivity(App.records.slice(0,12));
  } catch(e) { toast('Erro: '+e.message, 'error'); }
}

/* ════════════════════════════════════════
   FILTROS
════════════════════════════════════════ */
function applyFilters() {
  const start = document.getElementById('fStart').value;
  const end   = document.getElementById('fEnd').value;
  const user  = document.getElementById('fUser').value;
  const type  = document.getElementById('fType').value;
  let f = [...App.records];
  if (start && end) f = f.filter(r => { const iso=brToIso(r.date); return iso>=start&&iso<=end; });
  if (user)  f = f.filter(r => r.user_name === user);
  if (type)  f = f.filter(r => r.type === type);
  renderRecords(f);
  toast(`${f.length} registro(s)`, 'success');
}

function clearFilters() {
  ['fStart','fEnd'].forEach(id => document.getElementById(id).value='');
  ['fUser','fType'].forEach(id => document.getElementById(id).selectedIndex=0);
  renderRecords(App.records);
}

function exportCSV() {
  if (!App.records.length) return toast('Nenhum dado para exportar', 'error');
  const hdr = 'Nome,Email,Tipo,Data,Hora,Localização\n';
  const rows = App.records.map(r =>
    `"${r.user_name}","${r.user_email}","${typeLabel(r.type).replace(/[🟢🟡🔵🔴]/g,'').trim()}","${r.date}","${r.time}","${r.address||''}"`
  ).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff'+hdr+rows], {type:'text/csv;charset=utf-8'}));
  a.download = `WD_Ponto_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast('📥 CSV exportado!', 'success');
}

/* ════════════════════════════════════════
   AÇÕES DESTRUTIVAS
════════════════════════════════════════ */
async function deleteRecord(id, closeDetail=false) {
  const ok = await confirm2('🗑️ Excluir Registro', 'Tem certeza? Esta ação não pode ser desfeita.', 'Excluir');
  if (!ok) return;
  try {
    const r = await fetch(`${API}/record/${id}`, {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ admin_id: App.admin.id })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    toast('Registro excluído', 'success');
    if (closeDetail) closeModal('detailModal');
    App.records = App.records.filter(r => r.id !== id);
    if (App.tab === 'records') renderRecords(App.records);
    if (App.tab === 'dashboard') renderActivity(App.records.slice(0,12));
  } catch(e) { toast('Erro: '+e.message, 'error'); }
}

async function deleteEmp(id, name) {
  const ok = await confirm2('🗑️ Excluir Colaborador', `Excluir "${name}"? Os registros serão preservados.`, 'Excluir');
  if (!ok) return;
  try {
    const r = await fetch(`${API}/users/${id}`, {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ admin_id: App.admin.id })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    toast(`"${name}" excluído(a)`, 'success');
    await loadEmployees();
  } catch(e) { toast('Erro: '+e.message, 'error'); }
}

async function clearAll() {
  const ok = await confirm2('🗑️ APAGAR TUDO', 'Isso apagará TODOS os registros de ponto de TODOS os colaboradores. Ação IRREVERSÍVEL!', 'Apagar Tudo');
  if (!ok) return;
  try {
    const r = await fetch(`${API}/records`, {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ admin_id: App.admin.id })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    App.records = [];
    toast(`${d.deleted} registros apagados`, 'success');
    loadDashboard();
  } catch(e) { toast('Erro: '+e.message, 'error'); }
}

/* confirm modal customizado */
let _resolveConfirm = null;
function confirm2(title, msg, okText='Confirmar') {
  return new Promise(resolve => {
    _resolveConfirm = resolve;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent   = msg;
    document.getElementById('confirmOk').textContent    = okText;
    openModal('confirmModal');
  });
}
function resolveConfirm(val) { closeModal('confirmModal'); _resolveConfirm?.(val); _resolveConfirm=null; }

/* ════════════════════════════════════════
   RELATÓRIOS
════════════════════════════════════════ */
function reportDaily() {
  const today = new Date().toLocaleDateString('pt-BR');
  const recs  = App.records.filter(r=>r.date===today);
  const users = new Set(recs.map(r=>r.user_name));
  let tbl='';
  recs.forEach(r=>{
    tbl+=`<tr><td>${esc(r.user_name)}</td>
      <td><span class="rec-badge badge-${r.type.replace(/_/g,'-')}">${typeLabel(r.type)}</span></td>
      <td>${esc(r.time.slice(0,8))}</td>
      <td>${r.latitude?'📍':'-'}</td><td>${r.has_photo?'📷':'-'}</td></tr>`;
  });
  showReport('📅 Relatório Diário — '+today, `
    <p style="margin-bottom:14px;color:var(--t2)"><strong>${recs.length}</strong> registros | <strong>${users.size}</strong> colaboradores presentes</p>
    ${recs.length?`<div class="records-table-wrap">
      <table class="records-table">
        <thead><tr><th>Colaborador</th><th>Tipo</th><th>Hora</th><th>GPS</th><th>Foto</th></tr></thead>
        <tbody>${tbl}</tbody>
      </table></div>` : '<p class="empty-msg">Sem registros hoje</p>'}
  `);
}

function reportWeekly() {
  const now = new Date(), ago = new Date(now - 7*86400000);
  const recs = App.records.filter(r=>{
    const [d,m,y]=r.date.split('/'); return new Date(+y,+m-1,+d)>=ago;
  });
  const byDay={};
  recs.forEach(r=>{ byDay[r.date]=(byDay[r.date]||0)+1; });
  let rows=Object.keys(byDay).sort().map(d=>`<tr><td>${esc(d)}</td><td>${byDay[d]}</td></tr>`).join('');
  showReport('📆 Relatório Semanal', `
    <p style="margin-bottom:14px;color:var(--t2)"><strong>${recs.length}</strong> registros nos últimos 7 dias</p>
    <div class="records-table-wrap"><table class="records-table">
      <thead><tr><th>Data</th><th>Registros</th></tr></thead><tbody>${rows}</tbody>
    </table></div>
  `);
}

function reportByEmployee() {
  if (!App.employees.length) return (toast('Acesse a aba Colaboradores primeiro','error'));
  let html='';
  App.employees.forEach(emp=>{
    html+=`<div style="margin-bottom:14px;padding:14px 18px;background:rgba(0,0,0,.2);border-radius:var(--rs);border-left:3px solid var(--y)">
      <strong>${esc(emp.name)}</strong>
      <span style="color:var(--t2);font-size:13px;margin-left:12px">
        Total: ${emp.recs.length} | Entradas: ${emp.recs.filter(r=>r.type==='entrada').length} | Saídas: ${emp.recs.filter(r=>r.type==='saida').length}
      </span>
    </div>`;
  });
  showReport('👤 Por Colaborador', html);
}

function showReport(title, html) {
  const el = document.getElementById('reportResult');
  el.innerHTML = `<h3>${title}</h3>${html}`;
  el.classList.add('show');
  el.scrollIntoView({behavior:'smooth',block:'nearest'});
}

/* ════════════════════════════════════════
   ESPELHO DE PONTO
════════════════════════════════════════ */
function openEspelhoModal() {
  const sel = document.getElementById('espUser');
  if (sel) {
    const users = [...new Set(App.records.map(r=>r.user_name))].sort();
    sel.innerHTML = '<option value="">Todos</option>' + users.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('');
  }
  const mi = document.getElementById('espMonth');
  if (mi) mi.value = new Date().toISOString().slice(0,7);
  openModal('espelhoModal');
}

function gerarEspelho() {
  const userName = document.getElementById('espUser').value;
  const monthVal = document.getElementById('espMonth').value;
  if (!monthVal) return toast('Selecione o mês', 'error');
  const [year, month] = monthVal.split('-');
  const monthLabel = new Date(+year,+month-1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});

  let recs = App.records.filter(r=>{
    const [,m,y]=r.date.split('/'); return y===year && m===month.padStart(2,'0');
  });
  if (userName) recs = recs.filter(r=>r.user_name===userName);
  if (!recs.length) return toast('Nenhum registro neste período','error');

  const byUser={};
  recs.forEach(r=>{ if(!byUser[r.user_name])byUser[r.user_name]={}; if(!byUser[r.user_name][r.date])byUser[r.user_name][r.date]=[]; byUser[r.user_name][r.date].push(r); });

  let html='';
  Object.keys(byUser).forEach(u=>{ html+=buildEspelho(u,monthLabel,byUser[u]); });

  document.getElementById('espelhoResultTitle').textContent = 'Espelho — '+monthLabel.toUpperCase();
  document.getElementById('espelhoResultBody').innerHTML = html + `
    <div style="text-align:center;margin-top:22px;padding-top:18px;border-top:1px solid var(--b1);display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <button onclick="downloadEspelhoPDF()" class="btn btn-primary">📄 Baixar PDF</button>
      <button onclick="window.print()" class="btn btn-secondary">🖨️ Imprimir</button>
      <button onclick="closeModal('espelhoResultModal')" class="btn btn-secondary">Fechar</button>
    </div>`;
  closeModal('espelhoModal');
  openModal('espelhoResultModal');
  // guarda dados para o PDF
  App._espelhoHtml = html;
  App._espelhoTitle = 'Espelho — '+monthLabel.toUpperCase();
}

function buildEspelho(userName, monthLabel, userRecs) {
  const dates = Object.keys(userRecs).sort((a,b)=>{
    const p=d=>{const[dd,mm,yy]=d.split('/');return new Date(+yy,+mm-1,+dd);}; return p(a)-p(b);
  });
  let horasUteis=0,horasSab=0,horasDomFer=0,daysWorked=0,incompletos=0,rows='';

  dates.forEach(date=>{
    const day=userRecs[date].sort((a,b)=>a.ts-b.ts);
    const dow=getDow(date), isofmt=brToIso(date), isFer=FERIADOS.has(isofmt);
    const entrada=day.find(r=>r.type==='entrada');
    const sAlm   =day.find(r=>r.type==='saida_almoco');
    const rAlm   =day.find(r=>r.type==='retorno_almoco');
    const saida  =day.find(r=>r.type==='saida');
    let mins=0;
    if(entrada&&sAlm)  mins+=calcMin(entrada.time,sAlm.time);
    if(rAlm&&saida)    mins+=calcMin(rAlm.time,saida.time);
    const incomplete = !!entrada && !saida;
    if(incomplete) incompletos++;
    let tipoDia,bg;
    if(isFer)       {tipoDia='🎊 Feriado';bg='#fff0f0';horasDomFer+=mins;}
    else if(dow===0){tipoDia='☀️ Domingo';bg='#fff0f0';horasDomFer+=mins;}
    else if(dow===6){tipoDia='📅 Sábado'; bg='#fffbeb';horasSab+=mins;}
    else            {tipoDia='📋 Útil';   bg='#fafafa';horasUteis+=mins;}
    if(mins>0)daysWorked++;
    const totalStr=mins>0?fmtMin(mins):incomplete?'⚠️ Incompleto':'-';
    const totalStyle=incomplete?'color:#d97706;font-weight:700':'font-weight:700';
    rows+=`<tr style="background:${bg}">
      <td style="padding:8px;border:1px solid #ddd;text-align:center;font-weight:600">${date.split('/')[0]}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;font-size:11px">${tipoDia}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center">${entrada?entrada.time.slice(0,5):'-'}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center">${sAlm?sAlm.time.slice(0,5):'-'}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center">${rAlm?rAlm.time.slice(0,5):'-'}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center">${saida?saida.time.slice(0,5):'-'}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;${totalStyle}">${totalStr}</td>
    </tr>`;
  });

  const totSab=Math.round(horasSab*1.5), totDomFer=Math.round(horasDomFer*2);
  const total=horasUteis+totSab+totDomFer;
  const aviso=incompletos?`<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-top:14px;color:#856404;font-size:13px">⚠️ <strong>${incompletos} dia(s) incompleto(s)</strong> — entrada sem saída correspondente. Não contabilizados nas horas.</div>`:'';

  return `<div style="font-family:Arial,sans-serif;margin-bottom:36px">
    <div style="background:linear-gradient(135deg,#FFD700,#FFA500);color:#000;padding:22px 28px;border-radius:12px 12px 0 0;text-align:center">
      <h2 style="margin:0;font-size:22px;font-weight:900;letter-spacing:3px">WD MANUTENÇÕES</h2>
      <h3 style="margin:6px 0 0;font-size:14px;font-weight:600">ESPELHO DE PONTO ELETRÔNICO</h3>
    </div>
    <div style="background:white;color:#111;padding:24px;border:1px solid #ddd;border-top:none;border-radius:0 0 12px 12px">
      <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #FFD700">
        <p style="margin:3px 0"><strong>COLABORADOR:</strong> ${esc(userName)}</p>
        <p style="margin:3px 0"><strong>PERÍODO:</strong> ${monthLabel.toUpperCase()}</p>
        <p style="margin:3px 0"><strong>EMISSÃO:</strong> ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</p>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#FFD700;color:#000">
          <th style="padding:9px;border:1px solid #ddd">DIA</th>
          <th style="padding:9px;border:1px solid #ddd">TIPO</th>
          <th style="padding:9px;border:1px solid #ddd">ENTRADA</th>
          <th style="padding:9px;border:1px solid #ddd">S.ALMOÇO</th>
          <th style="padding:9px;border:1px solid #ddd">RETORNO</th>
          <th style="padding:9px;border:1px solid #ddd">SAÍDA</th>
          <th style="padding:9px;border:1px solid #ddd">TOTAL</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${aviso}
      <div style="margin-top:20px;padding:16px;background:#f8f9fa;border-radius:10px;border:2px solid #FFD700">
        <h3 style="margin:0 0 14px;text-align:center;font-size:15px">📊 RESUMO COM ADICIONAIS</h3>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#FFD700;color:#000">
            <th style="padding:9px;border:1px solid #ddd;text-align:left">Tipo</th>
            <th style="padding:9px;border:1px solid #ddd">Horas</th>
            <th style="padding:9px;border:1px solid #ddd">Adicional</th>
            <th style="padding:9px;border:1px solid #ddd">Total</th>
          </tr></thead>
          <tbody>
            <tr style="background:#f9f9f9"><td style="padding:9px;border:1px solid #ddd">📋 Dias Úteis</td><td style="padding:9px;border:1px solid #ddd;text-align:center;font-weight:700">${fmtMin(horasUteis)}</td><td style="padding:9px;border:1px solid #ddd;text-align:center">—</td><td style="padding:9px;border:1px solid #ddd;text-align:center;font-weight:700;background:#e8f5e9">${fmtMin(horasUteis)}</td></tr>
            <tr style="background:#fffbeb"><td style="padding:9px;border:1px solid #ddd">📅 Sábados</td><td style="padding:9px;border:1px solid #ddd;text-align:center;font-weight:700">${fmtMin(horasSab)}</td><td style="padding:9px;border:1px solid #ddd;text-align:center;color:#d97706;font-weight:600">+50%</td><td style="padding:9px;border:1px solid #ddd;text-align:center;font-weight:700;background:#fef3c7">${fmtMin(totSab)}</td></tr>
            <tr style="background:#fff0f0"><td style="padding:9px;border:1px solid #ddd">☀️ Dom/Feriados</td><td style="padding:9px;border:1px solid #ddd;text-align:center;font-weight:700">${fmtMin(horasDomFer)}</td><td style="padding:9px;border:1px solid #ddd;text-align:center;color:#dc2626;font-weight:600">+100%</td><td style="padding:9px;border:1px solid #ddd;text-align:center;font-weight:700;background:#fee2e2">${fmtMin(totDomFer)}</td></tr>
          </tbody>
          <tfoot><tr style="background:#FFD700;color:#000">
            <td colspan="3" style="padding:12px;border:1px solid #ddd;text-align:right;font-weight:800;font-size:14px">💰 TOTAL GERAL:</td>
            <td style="padding:12px;border:1px solid #ddd;text-align:center;font-weight:900;font-size:16px">${fmtMin(total)} (${(total/60).toFixed(2)}h)</td>
          </tr></tfoot>
        </table>
      </div>
      <div style="margin-top:36px;padding-top:18px;border-top:2px solid #FFD700">
        <p style="text-align:center;font-size:11px;color:#777;margin-bottom:36px">Documento gerado pelo Sistema WD Manutenções — CLT Art. 74 §2º — ${new Date().toLocaleDateString('pt-BR')}</p>
        <div style="display:flex;justify-content:space-around;gap:40px">
          <div style="text-align:center;flex:1"><div style="border-top:2px solid #000;margin-bottom:7px"></div><p style="font-size:12px;font-weight:600">Colaborador</p></div>
          <div style="text-align:center;flex:1"><div style="border-top:2px solid #000;margin-bottom:7px"></div><p style="font-size:12px;font-weight:600">Responsável</p></div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ════════════════════════════════════════
   MODAL HELPERS
════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// fecha ao clicar no backdrop
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) {
    const id = e.target.id;
    if (id === 'confirmModal') resolveConfirm(false);
    else closeModal(id);
  }
});

/* ════════════════════════════════════════
   DOWNLOAD PDF — usa html2pdf.js via CDN
════════════════════════════════════════ */
async function downloadEspelhoPDF() {
  const html = App._espelhoHtml;
  const title = App._espelhoTitle || 'Espelho_Ponto';
  if (!html) return toast('Gere o espelho primeiro', 'error');

  // carrega html2pdf dinamicamente se ainda não foi carregado
  if (!window.html2pdf) {
    toast('⏳ Preparando PDF...', 'info');
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // container temporário com o HTML do espelho
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;background:#fff;padding:10mm;font-family:Arial,sans-serif';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  const fname = (title + '_' + new Date().toISOString().slice(0,10))
    .replace(/[^a-zA-Z0-9_\-]/g,'_') + '.pdf';

  try {
    await window.html2pdf(wrap, {
      margin:       [8, 8, 8, 8],
      filename:     fname,
      image:        { type:'jpeg', quality:.92 },
      html2canvas:  { scale:2, useCORS:true, letterRendering:true },
      jsPDF:        { unit:'mm', format:'a4', orientation:'portrait' },
      pagebreak:    { mode:'avoid-all' },
    });
    toast('📄 PDF baixado!', 'success');
  } catch(e) {
    toast('Erro ao gerar PDF: ' + e.message, 'error');
  } finally {
    document.body.removeChild(wrap);
  }
}

/* ════════════════════════════════════════
   UTILS
════════════════════════════════════════ */
function esc(s) {
  if (s==null) return '';
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function typeLabel(t) {
  return {entrada:'🟢 Entrada',saida_almoco:'🟡 S.Almoço',retorno_almoco:'🔵 Retorno',saida:'🔴 Saída'}[t]||t;
}
function typeEmoji(t) {
  return {entrada:'🟢',saida_almoco:'🟡',retorno_almoco:'🔵',saida:'🔴'}[t]||'⚪';
}
function calcMin(t1,t2) {
  const m=t=>{const[h,mi]=t.split(':').map(Number);return h*60+mi;};
  return Math.max(0,m(t2)-m(t1));
}
function fmtMin(m) { return `${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`; }
function getDow(brDate) { const[d,m,y]=brDate.split('/'); return new Date(+y,+m-1,+d).getDay(); }
function brToIso(brDate) { const[d,m,y]=brDate.split('/'); return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
function debounce(fn,ms) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function val(id) { return (document.getElementById(id)?.value||'').trim(); }
async function post(path,body) {
  const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return r.json();
}

const COLORS={success:'#00e676',error:'#ff4444',warning:'#ff9100',info:'#448aff'};
function toast(msg,type='success') {
  document.querySelectorAll('.wd-toast').forEach(t=>t.remove());
  const el=document.createElement('div'); el.className='wd-toast'; el.textContent=msg;
  el.style.cssText=`position:fixed;top:22px;right:22px;background:${COLORS[type]||COLORS.info};
    color:#000;padding:14px 22px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.4);
    z-index:10000;font-weight:700;font-family:'Barlow',sans-serif;font-size:13px;
    max-width:360px;line-height:1.5;animation:slideIn .3s ease both;`;
  document.body.appendChild(el);
  setTimeout(()=>{ el.style.animation='slideOut .3s ease forwards'; setTimeout(()=>el.remove(),300); },3500);
}
const _s=document.createElement('style');
_s.textContent='@keyframes slideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(400px);opacity:0}}';
document.head.appendChild(_s);