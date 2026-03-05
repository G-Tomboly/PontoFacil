/* ==================================================
   login.js — WD Manutenções
   ================================================== */

const API_URL = '/api';

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  // Tecla Enter nos campos
  document.getElementById('loginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('registerConfirmPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRegister();
  });
});

/* ---------- ABAS ---------- */
function showTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

  if (tab === 'login') {
    document.getElementById('tabLoginBtn').classList.add('active');
    document.getElementById('loginForm').classList.add('active');
  } else {
    document.getElementById('tabRegBtn').classList.add('active');
    document.getElementById('registerForm').classList.add('active');
  }
}

/* ---------- LOGIN ---------- */
async function handleLogin() {
  const email    = sanitizeText(document.getElementById('loginEmail').value.trim());
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showToast('Preencha todos os campos!', 'error');
    return;
  }

  const btn = document.getElementById('btnLogin');
  setButtonLoading(btn, true, 'Entrando...');

  try {
    const res  = await fetchAPI('/login', { email, password });
    const data = await res.json();

    if (data.success) {
      saveSession(data.user);
      showToast('Bem-vindo, ' + data.user.name + '!', 'success');
      setTimeout(() => {
        window.location.href = data.user.role === 'admin' ? '/admin.html' : '/index.html';
      }, 600);
    } else {
      showToast(data.error || 'Email ou senha inválidos', 'error');
    }
  } catch (err) {
    // Tenta login offline
    const offlineUser = tryOfflineLogin(email, password);
    if (offlineUser) {
      saveSession(offlineUser);
      showToast('📴 Login offline ativado', 'warning');
      setTimeout(() => {
        window.location.href = offlineUser.role === 'admin' ? '/admin.html' : '/index.html';
      }, 800);
    } else {
      showToast('Sem conexão e sem credenciais salvas neste dispositivo', 'error');
    }
  } finally {
    setButtonLoading(btn, false, 'Entrar no Sistema');
  }
}

/* ---------- CADASTRO ---------- */
async function handleRegister() {
  const name            = sanitizeText(document.getElementById('registerName').value.trim());
  const email           = sanitizeText(document.getElementById('registerEmail').value.trim());
  const password        = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerConfirmPassword').value;

  if (!name || !email || !password || !confirmPassword) {
    showToast('Preencha todos os campos!', 'error'); return;
  }
  if (password.length < 6) {
    showToast('A senha deve ter no mínimo 6 caracteres!', 'error'); return;
  }
  if (password !== confirmPassword) {
    showToast('As senhas não coincidem!', 'error'); return;
  }

  const btn = document.getElementById('btnRegister');
  setButtonLoading(btn, true, 'Cadastrando...');

  try {
    const res  = await fetchAPI('/register', { name, email, password });
    const data = await res.json();

    if (data.success) {
      showToast('Cadastro realizado! Faça login.', 'success');
      ['registerName','registerEmail','registerPassword','registerConfirmPassword']
        .forEach(id => document.getElementById(id).value = '');
      setTimeout(() => showTab('login'), 1800);
    } else {
      showToast(data.error || 'Erro ao cadastrar', 'error');
    }
  } catch {
    showToast('Erro de conexão. Verifique sua rede.', 'error');
  } finally {
    setButtonLoading(btn, false, 'Criar Conta');
  }
}

/* ---------- OFFLINE LOGIN ---------- */
// Armazena apenas um hash simples do token (não a senha em claro)
const OFFLINE_KEY = 'wd_offline_auth_v2';

function saveOfflineCredentials(user, email, password) {
  // Guarda um "token" que é uma combinação de email + senha hash simples
  // Não armazena a senha em Base64 (não é seguro)
  const token = simpleHash(email + '|' + password);
  const payload = JSON.stringify({ user, email, token, ts: Date.now() });
  localStorage.setItem(OFFLINE_KEY, payload);
}

function tryOfflineLogin(email, password) {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const token  = simpleHash(email + '|' + password);
    if (cached.email === email && cached.token === token) return cached.user;
  } catch { /* noop */ }
  return null;
}

// Hash simples (djb2) — não é criptografia forte, mas é muito melhor que base64
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // força unsigned 32-bit
  }
  return hash.toString(16);
}

/* ---------- SESSION ---------- */
function saveSession(user) {
  const str = JSON.stringify(user);
  sessionStorage.setItem('wd_user', str);
  localStorage.setItem('wd_user', str);
  // Salva credenciais offline se disponível
  // (feito no login com a senha, que não persiste aqui por segurança)
}

/* ---------- HELPERS ---------- */
async function fetchAPI(path, body) {
  return fetch(API_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function sanitizeText(str) {
  // Remove caracteres que poderiam causar XSS se fossem exibidos via innerHTML
  return str.replace(/[<>"'&]/g, c => ({ '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#x27;", '&':'&amp;' }[c]));
}

function setButtonLoading(btn, loading, text) {
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = loading ? '⏳ ' + text : text;
}

/* ---------- TOAST ---------- */
function showToast(message, type = 'success') {
  // Remove toast anterior se existir
  document.querySelectorAll('.wd-toast').forEach(t => t.remove());

  const colors = {
    success: '#00e676',
    error:   '#ff4444',
    warning: '#ff9100',
    info:    '#448aff'
  };

  const toast = document.createElement('div');
  toast.className = 'wd-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed; top:24px; right:24px;
    background:${colors[type] || colors.info};
    color:#000; padding:16px 24px;
    border-radius:12px;
    box-shadow:0 10px 40px rgba(0,0,0,0.4);
    z-index:10000; font-weight:700;
    font-family:'Barlow',sans-serif;
    font-size:14px; letter-spacing:0.5px;
    max-width:380px; line-height:1.5;
    animation: slideInRight 0.35s ease both;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Injeta keyframes de toast no head (1 vez)
(() => {
  const s = document.createElement('style');
  s.textContent = `
    @keyframes slideInRight  { from{transform:translateX(400px);opacity:0} to{transform:translateX(0);opacity:1} }
    @keyframes slideOutRight { from{transform:translateX(0);opacity:1}     to{transform:translateX(400px);opacity:0} }
  `;
  document.head.appendChild(s);
})();
