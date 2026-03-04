const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const database = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURAÇÃO DE DIRETÓRIOS E MIDDLEWARES
// ==========================================

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Caminhos absolutos para evitar erros em produção
const publicPath = path.join(__dirname, 'public');
const uploadsDir = path.join(__dirname, 'uploads');

// Serve arquivos estáticos da pasta public (frontend)
app.use(express.static(publicPath));

// Serve arquivos de upload
app.use('/uploads', express.static(uploadsDir));

// Cria pasta de uploads se ela não existir
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ==========================================
// HELPERS DE AUTORIZAÇÃO
// ==========================================


function requireAdminById(adminId, res, onSuccess) {
    if (!adminId) {
        res.status(401).json({ error: 'Admin não informado' });
        return;
    }

    database.getUserById(adminId, (err, user) => {
        if (err) {
            res.status(500).json({ error: 'Erro ao validar administrador' });
            return;
        }

        if (!user || user.role !== 'admin') {
            res.status(403).json({ error: 'Acesso negado. Apenas admin.' });
            return;
        }

        onSuccess(user);
    });
}

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================

app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
    }

    database.registerUser(name, email, password, (err, user) => {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Este email já está cadastrado' });
            }
            return res.status(500).json({ error: 'Erro ao criar usuário' });
        }
        
        res.json({
            success: true,
            message: 'Usuário cadastrado com sucesso',
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    
    database.verifyLogin(email, password, (err, user) => {
        if (err) return res.status(500).json({ error: 'Erro ao fazer login' });
        if (!user) return res.status(401).json({ error: 'Email ou senha inválidos' });
        
        res.json({
            success: true,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    });
});

// ==========================================
// ROTAS DE REGISTROS DE PONTO
// ==========================================

app.post('/api/record', (req, res) => {
    const { user_id, user_name, user_email, type, photo, latitude, longitude, address } = req.body;
    
    if (!user_id || !user_name || !type) {
        return res.status(400).json({ error: 'Dados incompletos' });
    }

    const now = new Date();
    let photoFilename = null;

    if (photo) {
        try {
            const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            photoFilename = `photo-${Date.now()}-${user_id}.jpg`;
            const photoPath = path.join(uploadsDir, photoFilename);
            
            fs.writeFileSync(photoPath, buffer);
        } catch (err) {
            console.error('❌ Erro ao salvar foto:', err);
        }
    }

    const recordData = {
        user_id,
        user_name,
        user_email: user_email || '',
        type,
        photo: photoFilename,
        latitude: latitude || null,
        longitude: longitude || null,
        address: address || null,
        date: now.toLocaleDateString('pt-BR'),
        time: now.toLocaleTimeString('pt-BR'),
        timestamp: now.getTime()
    };

    database.insertRecord(recordData, function(err, result) {
        if (err) return res.status(500).json({ error: 'Erro ao registrar ponto' });
        
        res.json({
            success: true,
            message: 'Ponto registrado com sucesso',
            id: result.lastID,
            data: recordData
        });
    });
});

app.get('/api/records', (req, res) => {
    database.getAllRecords((err, records) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar registros' });
        res.json({ records });
    });
});

app.get('/api/records/user/:id', (req, res) => {
    database.getRecordsByUserId(req.params.id, (err, records) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar registros do usuário' });
        res.json({ records });
    });
});

app.get('/api/stats', (req, res) => {
    database.getStats((err, stats) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar estatísticas' });
        const uniqueUsers = [...new Set(stats.all_records.map(r => r.user_name))];
        res.json({
            total_records: stats.total_records,
            today_records: stats.today_records,
            total_employees: stats.total_employees,
            users: uniqueUsers
        });
    });
});


app.get('/api/users', (req, res) => {
    const adminId = req.query.admin_id;

    requireAdminById(adminId, res, () => {
        database.getAllUsers((err, users) => {
            if (err) return res.status(500).json({ error: 'Erro ao buscar usuários' });
            res.json({ users });
        });
    });
});

app.delete('/api/users/:id', (req, res) => {
    const { admin_id } = req.body;
    const targetUserId = Number(req.params.id);

    requireAdminById(admin_id, res, (adminUser) => {
        if (Number(adminUser.id) === targetUserId) {
            return res.status(400).json({ error: 'Você não pode excluir sua própria conta de admin' });
        }

        database.getUserById(targetUserId, (err, targetUser) => {
            if (err) return res.status(500).json({ error: 'Erro ao buscar usuário alvo' });
            if (!targetUser) return res.status(404).json({ error: 'Usuário não encontrado' });
            if (targetUser.role === 'admin') return res.status(400).json({ error: 'Não é permitido excluir outro admin' });

            database.deleteUserAndRecords(targetUserId, (deleteErr, result) => {
                if (deleteErr) return res.status(500).json({ error: 'Erro ao excluir usuário' });
                res.json({ success: true, deleted: result });
            });
        });
    });
});

app.delete('/api/records', (req, res) => {
    const { admin_id } = req.body;

    requireAdminById(admin_id, res, () => {
        database.clearAllRecords((err, result) => {
            if (err) return res.status(500).json({ error: 'Erro ao limpar registros' });
            res.json({ success: true, deleted: result.deletedRecords });
        });
    });
});


// ==========================================
// REDIRECIONAMENTO E INICIALIZAÇÃO
// ==========================================

// Rota raiz: serve o login.html que agora está dentro de /public
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'login.html'));
});

// Fallback para qualquer outra rota: redireciona para login
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(publicPath, 'login.html'));
    }
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log(`🚀 WD Manutenções - Sistema de Ponto`);
    console.log(`   Servidor: http://localhost:${PORT}`);
    console.log('========================================');
    console.log('');
    console.log('📱 Acesse:');
    console.log(`   Login/Cadastro: http://localhost:${PORT}/login.html`);
    console.log(`   Sistema: http://localhost:${PORT}/index.html`);
    console.log(`   Admin: http://localhost:${PORT}/admin.html`);
    console.log('');
    console.log('🔐 Admin padrão:');
    console.log('   Email: admin@wdmanutencoes.com');
    console.log('   Senha: admin123');
    console.log('');
});
