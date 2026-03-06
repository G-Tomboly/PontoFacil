/* login.js — WD Manutenções v3 */
'use strict';

const API = '/api';
const SK  = 'wd_user_v3';

document.addEventListener('DOMContentLoaded', () => {
  // Enter nos campos
  ['loginPassword','regConfirm'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') id === 'loginPassword' ? doLogin() : doRegister();
    });
  });
});

/* ── abas ── */
function showTab(t) {
  ['Login','Reg'].forEach(n => {
    document.getElementById('tab'+n+'Btn')?.classList.remove('active');
    document.getElementById(n.toLowerCase()+'Form')?.classList.remove('active');
  });
  document.getElementById('tab'+(t==='login'?'Login':'Reg')+'Btn').classList.add('active');
  document.getElementById(t==='login'?'loginForm':'registerForm').classList.add('active');
}

/* ── login ── */
async function doLogin() {
  const email = val('loginEmail'), pass = val('loginPassword');
  if (!email || !pass) return toast('Preencha todos os campos', 'error');

  setBtnLoading('btnLogin', true, 'Entrando...');
  try {
    const d = await post('/login', { email, password: pass });
    if (d.success) {
      saveSession(d.user);
      toast('Bem-vindo, ' + d.user.name + '!', 'success');
      setTimeout(() => location.href = d.user.role === 'admin' ? '/admin.html' : '/index.html', 500);
    } else {
      toast(d.error || 'Credenciais inválidas', 'error');
    }
  } catch {
    // tenta offline
    const u = offlineLogin(email, pass);
    if (u) {
      saveSession(u);
      toast('📴 Acesso offline', 'warning');
      setTimeout(() => location.href = u.role === 'admin' ? '/admin.html' : '/index.html', 700);
    } else {
      toast('Sem conexão e sem acesso offline salvo', 'error');
    }
  } finally {
    setBtnLoading('btnLogin', false, 'Entrar no Sistema');
  }
}

/* ── cadastro ── */
async function doRegister() {
  const name = val('regName'), email = val('regEmail'),
        pass = val('regPassword'), conf = val('regConfirm');
  if (!name||!email||!pass||!conf) return toast('Preencha todos os campos', 'error');
  if (pass.length < 6)             return toast('Senha mínimo 6 caracteres', 'error');
  if (pass !== conf)               return toast('Senhas não conferem', 'error');

  setBtnLoading('btnRegister', true, 'Cadastrando...');
  try {
    const d = await post('/register', { name, email, password: pass });
    if (d.success) {
      toast('Cadastro realizado! Faça login.', 'success');
      ['regName','regEmail','regPassword','regConfirm'].forEach(id => { document.getElementById(id).value = ''; });
      setTimeout(() => showTab('login'), 1500);
    } else {
      toast(d.error || 'Erro ao cadastrar', 'error');
    }
  } catch {
    toast('Erro de conexão', 'error');
  } finally {
    setBtnLoading('btnRegister', false, 'Criar Conta');
  }
}

/* ── sessão ── */
function saveSession(user) {
  const s = JSON.stringify(user);
  sessionStorage.setItem(SK, s);
  localStorage.setItem(SK, s);
}

/* ── offline login (hash djb2 — não guarda senha em claro) ── */
const OK = 'wd_off_v3';
function offlineLogin(email, pass) {
  try {
    const c = JSON.parse(localStorage.getItem(OK) || 'null');
    if (c && c.email === email.toLowerCase() && c.tok === djb2(email+pass)) return c.user;
  } catch {}
  return null;
}
function saveOfflineAuth(user, email, pass) {
  localStorage.setItem(OK, JSON.stringify({ email: email.toLowerCase(), tok: djb2(email+pass), user }));
}
function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h<<5)+h)^s.charCodeAt(i), h>>>=0;
  return h.toString(16);
}

/* ── utils ── */
function val(id) { return (document.getElementById(id)?.value || '').trim(); }
function setBtnLoading(id, on, txt) {
  const b = document.getElementById(id);
  if (!b) return;
  b.disabled = on;
  b.textContent = on ? '⏳ ' + txt : txt;
}
async function post(path, body) {
  const r = await fetch(API+path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  return r.json();
}

/* ── toast ── */
const COLORS = { success:'#00e676', error:'#ff4444', warning:'#ff9100', info:'#448aff' };
function toast(msg, type='success') {
  document.querySelectorAll('.wd-toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'wd-toast';
  el.textContent = msg;
  el.style.cssText = `position:fixed;top:22px;right:22px;background:${COLORS[type]||COLORS.info};
    color:#000;padding:14px 22px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.4);
    z-index:10000;font-weight:700;font-family:'Barlow',sans-serif;font-size:13px;
    max-width:360px;line-height:1.5;animation:slideIn .3s ease both;`;
  document.body.appendChild(el);
  setTimeout(() => { el.style.animation='slideOut .3s ease forwards'; setTimeout(()=>el.remove(),300); }, 3500);
}
const _s = document.createElement('style');
_s.textContent='@keyframes slideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(400px);opacity:0}}';
document.head.appendChild(_s);