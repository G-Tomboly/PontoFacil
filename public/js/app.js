/* app.js — WD Manutenções v3 */
'use strict';

const API = '/api';
const SK  = 'wd_user_v3';
const QK  = 'wd_queue_v3';
const CK  = 'wd_cache_v3';

let user = null, photo = null, loc = null, stream = null;

/* ═══════════════════════ INIT ═══════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  startClock();
  setupConnectivity();
  window.addEventListener('scroll', () => {
    document.getElementById('scrollTop')?.classList.toggle('show', scrollY > 280);
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_COMPLETE') {
        toast(`☁️ ${e.data.synced} registro(s) sincronizado(s)!`, 'success');
        loadRecords();
      }
    });
  }
  syncQueue();
});

/* ═══════════════════════ AUTH ═══════════════════════ */
function checkAuth() {
  const s = sessionStorage.getItem(SK) || localStorage.getItem(SK);
  if (!s) return (location.href = '/login.html');
  user = JSON.parse(s);
  if (user.role === 'admin') return (location.href = '/admin.html');
  sessionStorage.setItem(SK, s);
  document.getElementById('uName').textContent  = user.name;
  document.getElementById('uEmail').textContent = user.email;
  updateOfflineBadge();
  loadRecords();
}

function doLogout() {
  if (!confirm('Deseja sair?')) return;
  sessionStorage.clear(); localStorage.removeItem(SK);
  location.href = '/login.html';
}

/* ═══════════════════════ RELÓGIO ═══════════════════════ */
function startClock() {
  const tick = () => {
    const n = new Date();
    const t = document.getElementById('clockTime');
    const d = document.getElementById('clockDate');
    if (t) {
      const [h,m,s] = [n.getHours(),n.getMinutes(),n.getSeconds()].map(x=>String(x).padStart(2,'0'));
      t.innerHTML = `${h}<span class="blink">:</span>${m}<span class="blink">:</span>${s}`;
    }
    if (d) {
      const str = n.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
      d.textContent = str.charAt(0).toUpperCase() + str.slice(1);
    }
  };
  tick(); setInterval(tick, 1000);
}

/* ═══════════════════════ MODAL REGISTRO ═══════════════════════ */
async function openPunchModal() {
  document.getElementById('punchModal').classList.remove('hidden');
  resetModal();
  if (!navigator.onLine)
    document.getElementById('locInfo').innerHTML = '<strong style="color:var(--or)">📴 Modo offline</strong> — Registro salvo localmente.';
  await startCamera();
  getLocation();
}

function closePunchModal() {
  document.getElementById('punchModal').classList.add('hidden');
  stopCamera(); resetModal();
}

function resetModal() {
  photo = null; loc = null;
  const btn = document.getElementById('btnConfirm');
  if (btn) { btn.disabled = true; btn.textContent = '✓ CONFIRMAR REGISTRO'; }
  document.getElementById('photoPreview')?.classList.add('hidden');
  document.getElementById('btnCapture')?.classList.remove('hidden');
  document.getElementById('btnRetake')?.classList.add('hidden');
  const v = document.getElementById('video');
  if (v) v.style.display = 'block';
}

/* ── câmera ── */
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user' }, audio:false });
    const v = document.getElementById('video');
    v.srcObject = stream;
    await new Promise(r => { v.onloadedmetadata = r; });
  } catch(e) { toast('Câmera indisponível: ' + e.message, 'error'); }
}

function stopCamera() {
  stream?.getTracks().forEach(t => t.stop()); stream = null;
}

function capturePhoto() {
  const v = document.getElementById('video'), c = document.getElementById('canvas');
  if (!v.videoWidth) return toast('Câmera não inicializada', 'error');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  photo = c.toDataURL('image/jpeg', 0.8);
  document.getElementById('photoImg').src = photo;
  document.getElementById('photoPreview').classList.remove('hidden');
  v.style.display = 'none';
  document.getElementById('btnCapture').classList.add('hidden');
  document.getElementById('btnRetake').classList.remove('hidden');
  checkReady(); toast('✓ Foto capturada!', 'success');
}

function retakePhoto() {
  photo = null;
  document.getElementById('photoPreview').classList.add('hidden');
  document.getElementById('video').style.display = 'block';
  document.getElementById('btnCapture').classList.remove('hidden');
  document.getElementById('btnRetake').classList.add('hidden');
  document.getElementById('btnConfirm').disabled = true;
}

function checkReady() {
  document.getElementById('btnConfirm').disabled = !photo;
}

/* ── localização ── */
function getLocation() {
  const el = document.getElementById('locInfo');
  if (!navigator.geolocation) { el.innerHTML = '⚠️ Geolocalização não suportada'; return; }
  el.innerHTML = '<span style="color:var(--y)">📍 Buscando localização...</span>';

  navigator.geolocation.getCurrentPosition(
    async pos => {
      loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      el.innerHTML = `<strong>📍 Localização obtida</strong><br>
        <small style="color:var(--t2)">${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}</small>`;

      if (navigator.onLine) {
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.latitude}&lon=${loc.longitude}`,
            { headers: { 'Accept-Language':'pt-BR', 'User-Agent':'WD-Manutencoes/3' } }
          );
          if (r.ok) {
            const g = await r.json();
            loc.address = g.display_name;
            el.innerHTML = `<strong>📍 Local:</strong><br>
              <small style="color:var(--t2);line-height:1.5">${esc(g.display_name)}</small>`;
          }
        } catch {}
      }
      if (!loc.address) loc.address = `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`;
      checkReady();
    },
    err => {
      const msgs = { 1:'Permissão negada', 2:'Posição indisponível', 3:'Tempo esgotado' };
      el.innerHTML = `<span style="color:var(--or)">⚠️ ${msgs[err.code]||'Erro'}</span>
        <br><small style="color:var(--t2)">Você pode registrar sem localização.</small>
        <br><button onclick="getLocation()" class="btn btn-secondary btn-sm" style="margin-top:8px">🔄 Tentar</button>`;
      loc = null; checkReady();
    },
    { enableHighAccuracy: false, timeout: 14000, maximumAge: 60000 }
  );
}

/* ── confirmar ── */
async function confirmPunch() {
  if (!photo) return toast('Capture uma foto primeiro!', 'error');
  const btn = document.getElementById('btnConfirm');
  btn.disabled = true; btn.textContent = '⏳ Registrando...';
  const now = new Date();
  const data = {
    user_id:    user.id,
    user_name:  user.name,
    user_email: user.email,
    type:       document.getElementById('punchType').value,
    photo:      photo,
    latitude:   loc?.latitude  || null,
    longitude:  loc?.longitude || null,
    address:    loc?.address   || 'Não capturada',
    _date: now.toLocaleDateString('pt-BR'),
    _time: now.toLocaleTimeString('pt-BR'),
    _ts:   now.getTime(),
  };

  if (!navigator.onLine) {
    enqueue(data); toast('📴 Registro salvo localmente. Enviará ao reconectar.', 'warning');
    closePunchModal(); loadRecords(); updateOfflineBadge(); return;
  }

  try {
    const res = await fetch(API+'/record', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...data, date:data._date, time:data._time, ts:data._ts }) });
    const d = await res.json();
    if (d.success) { toast('✅ Ponto registrado!', 'success'); closePunchModal(); setTimeout(loadRecords, 500); }
    else throw new Error(d.error);
  } catch(e) {
    enqueue(data); toast('⚠️ Falha na conexão. Salvo localmente.', 'warning');
    closePunchModal(); loadRecords(); updateOfflineBadge();
  }
}

/* ═══════════════════════ CARREGAR REGISTROS ═══════════════════════ */
async function loadRecords() {
  let recs = [];
  if (navigator.onLine) {
    try {
      const r = await fetch(`${API}/records/user/${user.id}`);
      const d = await r.json();
      recs = d.records || [];
      cacheSet(user.id, recs);
    } catch { recs = cacheGet(user.id); }
  } else {
    recs = cacheGet(user.id);
  }

  const today = new Date().toLocaleDateString('pt-BR');
  const todayRecs = recs.filter(r => r.date === today);
  const pending   = getQueue().filter(q => String(q.user_id) === String(user.id) && (q._date||q.date) === today)
    .map(q => ({ ...q, date:q._date||q.date, time:q._time||q.time, _pending:true }));

  renderSlots(todayRecs);
  renderList([...todayRecs, ...pending]);
}

function renderSlots(recs) {
  const f = type => { const r = recs.find(r=>r.type===type); return r ? r.time.slice(0,5) : '—'; };
  document.getElementById('slotEntrada').textContent = f('entrada');
  document.getElementById('slotSAlmoco').textContent = f('saida_almoco');
  document.getElementById('slotRAlmoco').textContent = f('retorno_almoco');
  document.getElementById('slotSaida').textContent   = f('saida');
}

function renderList(recs) {
  const el = document.getElementById('recList');
  if (!recs.length) { el.innerHTML = '<p class="empty-msg">Nenhum registro hoje. Clique acima!</p>'; return; }
  recs.sort((a,b) => (a._ts||a.ts||0) - (b._ts||b.ts||0));
  el.innerHTML = '';
  recs.forEach(r => {
    const div = document.createElement('div');
    div.className = `rec-item t-${r.type}${r._pending?' pending':''}`;
    div.innerHTML = `
      <div class="rec-left">
        <span class="rec-badge badge-${r.type.replace(/_/g,'-')}">${typeLabel(r.type)}</span>
        <span class="rec-date">${esc(r.date)}</span>
        ${r._pending ? '<span class="badge-pending">⏳ pendente</span>' : ''}
      </div>
      <span class="rec-time">${esc(r.time.slice(0,8))}</span>
    `;
    el.appendChild(div);
  });
}

/* ═══════════════════════ FILA OFFLINE ═══════════════════════ */
function getQueue() { try { return JSON.parse(localStorage.getItem(QK)||'[]'); } catch { return []; } }
function saveQueue(q) { localStorage.setItem(QK, JSON.stringify(q)); }
function enqueue(d) {
  const q = getQueue();
  q.push({ ...d, offlineId:`off-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, date:d._date, time:d._time, ts:d._ts });
  saveQueue(q);
}

async function syncQueue() {
  if (!navigator.onLine) return;
  const q = getQueue(); if (!q.length) return;
  const failed = []; let synced = 0;
  for (const rec of q) {
    try {
      const r = await fetch(API+'/record', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(rec) });
      if ((await r.json()).success) synced++;
      else failed.push(rec);
    } catch { failed.push(rec); }
  }
  saveQueue(failed);
  if (synced) { toast(`☁️ ${synced} registro(s) sincronizado(s)!`, 'success'); loadRecords(); updateOfflineBadge(); }
}

function updateOfflineBadge() {
  const pending = getQueue().filter(q => String(q.user_id) === String(user?.id)).length;
  let b = document.getElementById('offlineBadge');
  if (pending > 0) {
    if (!b) { b = document.createElement('button'); b.id='offlineBadge'; b.onclick=syncQueue; document.body.appendChild(b); }
    b.textContent = `⏳ ${pending} pendente(s) — sincronizar`;
  } else b?.remove();
}

/* cache */
function cacheSet(uid, r) { try { const c=JSON.parse(localStorage.getItem(CK)||'{}'); c[uid]=r; localStorage.setItem(CK,JSON.stringify(c)); } catch {} }
function cacheGet(uid)    { try { return JSON.parse(localStorage.getItem(CK)||'{}')[uid]||[]; } catch { return []; } }

/* ═══════════════════════ CONECTIVIDADE ═══════════════════════ */
function setupConnectivity() {
  window.addEventListener('online',  () => { updateConn(true);  toast('🌐 Conectado! Sincronizando...','success'); syncQueue(); });
  window.addEventListener('offline', () => { updateConn(false); toast('📴 Offline. Registros salvos localmente.','warning'); updateOfflineBadge(); });
  updateConn(navigator.onLine);
}
function updateConn(on) {
  const el = document.getElementById('connBadge');
  if (!el) return;
  el.className = 'conn-badge ' + (on?'online':'offline');
  el.innerHTML = `<div class="conn-dot"></div><span>${on?'Online':'Offline'}</span>`;
}

/* ═══════════════════════ UTILS ═══════════════════════ */
function esc(s) {
  if (s==null) return '';
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function typeLabel(t) {
  return {entrada:'🟢 Entrada',saida_almoco:'🟡 S. Almoço',retorno_almoco:'🔵 Retorno',saida:'🔴 Saída'}[t]||t;
}

const COLORS = { success:'#00e676', error:'#ff4444', warning:'#ff9100', info:'#448aff' };
function toast(msg, type='success') {
  document.querySelectorAll('.wd-toast').forEach(t=>t.remove());
  const el = document.createElement('div');
  el.className='wd-toast'; el.textContent=msg;
  el.style.cssText=`position:fixed;top:22px;right:22px;background:${COLORS[type]||COLORS.info};
    color:#000;padding:14px 22px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.4);
    z-index:10000;font-weight:700;font-family:'Barlow',sans-serif;font-size:13px;
    max-width:360px;line-height:1.5;animation:slideIn .3s ease both;`;
  document.body.appendChild(el);
  setTimeout(()=>{ el.style.animation='slideOut .3s ease forwards'; setTimeout(()=>el.remove(),300); }, 4000);
}
const _s=document.createElement('style');
_s.textContent='@keyframes slideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(400px);opacity:0}}';
document.head.appendChild(_s);