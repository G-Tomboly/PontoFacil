const API_URL = '/api';

document.addEventListener('DOMContentLoaded', function() {
    console.log('📝 Página de login carregada');
    

    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
});
// Troca entre abas de login e cadastro
function showTab(tab) {
    const tabs = document.querySelectorAll('.tab-btn');
    const forms = document.querySelectorAll('.auth-form');
    
    tabs.forEach(t => t.classList.remove('active'));
    forms.forEach(f => f.classList.remove('active'));
    
    if (tab === 'login') {
        tabs[0].classList.add('active');
        document.getElementById('loginForm').classList.add('active');
    } else {
        tabs[1].classList.add('active');
        document.getElementById('registerForm').classList.add('active');
    }
}

// Login
async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showAlert('Por favor, preencha todos os campos!', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Salva dados do usuário
            sessionStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Redireciona
            if (data.user.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'index.html';
            }
        } else {
            showAlert(data.error || 'Email ou senha inválidos', 'error');
        }
    } catch (err) {
        showAlert('Erro ao fazer login. Verifique sua conexão.', 'error');
        console.error('Erro:', err);
    }
}

// Cadastro
async function handleRegister() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    // Validações
    if (!name || !email || !password || !confirmPassword) {
        showAlert('Por favor, preencha todos os campos!', 'error');
        return;
    }
    
    if (password.length < 6) {
        showAlert('A senha deve ter no mínimo 6 caracteres!', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showAlert('As senhas não coincidem!', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Cadastro realizado com sucesso! Faça login.', 'success');
            
            // Limpa formulário
            document.getElementById('registerName').value = '';
            document.getElementById('registerEmail').value = '';
            document.getElementById('registerPassword').value = '';
            document.getElementById('registerConfirmPassword').value = '';
            
            // Volta para aba de login
            setTimeout(() => {
                showTab('login');
            }, 2000);
        } else {
            showAlert(data.error || 'Erro ao cadastrar', 'error');
        }
    } catch (err) {
        showAlert('Erro ao cadastrar. Verifique sua conexão.', 'error');
        console.error('Erro:', err);
    }
}

// Alerta visual
function showAlert(message, type = 'info') {
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
        font-weight: 600;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    alert.textContent = message;
    
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => alert.remove(), 300);
    }, 4000);
}

// Enter no login
document.addEventListener('DOMContentLoaded', function() {
    const loginPassword = document.getElementById('loginPassword');
    if (loginPassword) {
        loginPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleLogin();
        });
    }
    
    const registerConfirm = document.getElementById('registerConfirmPassword');
    if (registerConfirm) {
        registerConfirm.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleRegister();
        });
    }
});

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