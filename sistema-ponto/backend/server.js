const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const database = require('./database');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

// Cria pasta de uploads
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ========== ROTAS DE AUTENTICAÇÃO ==========

// Registrar novo usuário
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
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    
    database.verifyLogin(email, password, (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao fazer login' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Email ou senha inválidos' });
        }
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    });
});

// ========== ROTAS DE REGISTROS ==========

// Registrar ponto
app.post('/api/record', (req, res) => {
    console.log('📝 Recebendo requisição de registro de ponto...');
    console.log('Headers:', req.headers);
    console.log('Body keys:', Object.keys(req.body));
    
    const { user_id, user_name, user_email, type, photo, latitude, longitude, address } = req.body;
    
    console.log('Dados recebidos:', {
        user_id,
        user_name,
        user_email,
        type,
        has_photo: !!photo,
        photo_length: photo ? photo.length : 0,
        latitude,
        longitude,
        address
    });
    
    if (!user_id || !user_name || !type) {
        console.error('❌ Dados incompletos:', { user_id, user_name, type });
        return res.status(400).json({ 
            error: 'Dados incompletos',
            missing: {
                user_id: !user_id,
                user_name: !user_name,
                type: !type
            }
        });
    }

    const now = new Date();
    let photoFilename = null;

    // Salva foto se existir
    if (photo) {
        try {
            console.log('📷 Salvando foto...');
            const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            photoFilename = `photo-${Date.now()}-${user_id}.jpg`;
            const photoPath = path.join(uploadsDir, photoFilename);
            
            fs.writeFileSync(photoPath, buffer);
            console.log('✓ Foto salva:', photoFilename);
        } catch (err) {
            console.error('❌ Erro ao salvar foto:', err);
            // Continua mesmo se não conseguir salvar a foto
        }
    } else {
        console.log('⚠️ Nenhuma foto enviada');
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

    console.log('💾 Salvando no banco de dados:', recordData);

    database.insertRecord(recordData, function(err, result) {
        if (err) {
            console.error('❌ Erro ao inserir registro no banco:', err);
            return res.status(500).json({ 
                error: 'Erro ao registrar ponto',
                details: err.message 
            });
        }
        
        console.log('✓ Ponto registrado com sucesso! ID:', result.lastID);
        
        res.json({
            success: true,
            message: 'Ponto registrado com sucesso',
            id: result.lastID,
            data: recordData
        });
    });
});

// Buscar todos os registros (admin)
app.get('/api/records', (req, res) => {
    database.getAllRecords((err, records) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar registros' });
        }
        res.json({ records });
    });
});

// Buscar registros por usuário
app.get('/api/records/user/:userId', (req, res) => {
    database.getRecordsByUserId(req.params.userId, (err, records) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar registros' });
        }
        res.json({ records });
    });
});

// Buscar registros por data
app.get('/api/records/date/:date', (req, res) => {
    database.getRecordsByDate(req.params.date, (err, records) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar registros' });
        }
        res.json({ records });
    });
});

// Buscar registros por período
app.get('/api/records/period/:start/:end', (req, res) => {
    database.getRecordsByPeriod(req.params.start, req.params.end, (err, records) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar registros' });
        }
        res.json({ records });
    });
});

// Estatísticas (admin)
app.get('/api/stats', (req, res) => {
    database.getStats((err, stats) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar estatísticas' });
        }
        
        const uniqueUsers = [...new Set(stats.all_records.map(r => r.user_name))];
        
        res.json({
            total_records: stats.total_records,
            today_records: stats.today_records,
            total_employees: stats.total_employees,
            users: uniqueUsers
        });
    });
});

// Rota padrão redireciona para login
app.get('/', (req, res) => {
    res.redirect('/login.html');
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
